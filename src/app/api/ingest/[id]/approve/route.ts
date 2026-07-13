import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { extractedMenuSchema, rawResultSchema } from '@/lib/schemas/menu';

export const runtime = 'nodejs';
export const maxDuration = 60;

const bodySchema = z.object({
  /** Kullanıcının studyoda düzenlediği nihai taslak. */
  menu: extractedMenuSchema,
});

/**
 * POST /api/ingest/[id]/approve
 * Düzenlenmiş taslağı gerçek menü tablolarına yazar.
 *
 * İdempotency: raw_result.created_menu_id doluysa önce o menü silinir
 * (cascade), sonra yenisi yazılır — yeniden onay çoğaltma yaratmaz.
 *
 * Uyum ilkesi: AI alerjen önerileri 'ai_suggested' olarak, item_compliance
 * 'pending' olarak yazılır. Onay akışı M2'de — misafir bu veriyi GÖRMEZ
 * (RLS yalnız 'confirmed' gösterir).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Oturum bulunamadı.' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Geçersiz taslak verisi.' }, { status: 400 });
  }
  const draft = parsed.data.menu;

  // İçe aktarma kaydı (RLS: yalnız org üyesi görür)
  const { data: ingestion } = await supabase
    .from('menu_ingestions')
    .select('id, org_id, venue_id, status, raw_result')
    .eq('id', params.id)
    .maybeSingle();
  if (!ingestion) {
    return NextResponse.json({ error: 'İçe aktarma bulunamadı.' }, { status: 404 });
  }
  if (ingestion.status !== 'review' && ingestion.status !== 'approved') {
    return NextResponse.json({ error: 'Bu içe aktarma onaylanabilir durumda değil.' }, { status: 409 });
  }

  // Yeniden onay: önceki menüyü kaldır (cascade ile alt kayıtlar da gider)
  const prevRaw = rawResultSchema.safeParse(ingestion.raw_result);
  const prevMenuId = prevRaw.success ? prevRaw.data.created_menu_id : null;
  if (prevMenuId) {
    await supabase.from('menus').delete().eq('id', prevMenuId);
  }

  // Alerjen kod → id haritası
  const { data: allergenRows, error: algErr } = await supabase
    .from('allergens')
    .select('id, code');
  if (algErr || !allergenRows) {
    return NextResponse.json({ error: 'Alerjen kataloğu okunamadı.' }, { status: 500 });
  }
  const allergenIdByCode = new Map(allergenRows.map((a) => [a.code, a.id]));

  // Diyet etiketi kod → id haritası
  const { data: dietaryRows } = await supabase.from('dietary_tags').select('id, code');
  const dietaryIdByCode = new Map((dietaryRows ?? []).map((d) => [d.code, d.id]));

  // 1) Menü
  const { data: menu, error: menuErr } = await supabase
    .from('menus')
    .insert({ venue_id: ingestion.venue_id, org_id: ingestion.org_id, name: draft.menu_name })
    .select('id')
    .single();
  if (menuErr || !menu) {
    return NextResponse.json({ error: 'Menü kaydı oluşturulamadı.' }, { status: 500 });
  }

  try {
    // 2) Kategoriler (toplu)
    const { data: categories, error: catErr } = await supabase
      .from('categories')
      .insert(
        draft.categories.map((c, i) => ({
          menu_id: menu.id,
          org_id: ingestion.org_id,
          name: c.name,
          sort_order: i,
        }))
      )
      .select('id');
    if (catErr || !categories || categories.length !== draft.categories.length) {
      throw new Error('Kategoriler yazılamadı.');
    }

    // 3) Ürünler (toplu) — draft sırası korunur
    const itemRows = draft.categories.flatMap((c, ci) =>
      c.items.map((it, ii) => ({
        category_id: categories[ci].id,
        org_id: ingestion.org_id,
        name: it.name,
        description: it.description ?? null,
        ingredients: it.ingredients ?? null,
        price: it.price ?? null,
        sort_order: ii,
        calories_kcal: it.calories_kcal ?? null,
        calories_source: it.calories_kcal != null ? ('ai' as const) : null,
      }))
    );
    const flatDraftItems = draft.categories.flatMap((c) => c.items);

    let itemIds: string[] = [];
    if (itemRows.length > 0) {
      const { data: items, error: itemErr } = await supabase
        .from('items')
        .insert(itemRows)
        .select('id');
      if (itemErr || !items || items.length !== itemRows.length) {
        throw new Error('Ürünler yazılamadı.');
      }
      itemIds = items.map((r) => r.id);
    }

    // 4) Alerjen önerileri (ai_suggested) + uyum durumu (pending)
    const allergenInserts = itemIds.flatMap((itemId, idx) =>
      flatDraftItems[idx].allergens
        .filter((a) => allergenIdByCode.has(a.code))
        .map((a) => ({
          item_id: itemId,
          org_id: ingestion.org_id,
          allergen_id: allergenIdByCode.get(a.code)!,
          state: 'ai_suggested' as const,
          confidence: a.confidence,
          source: 'ai' as const,
        }))
    );
    if (allergenInserts.length > 0) {
      const { error } = await supabase.from('item_allergens').insert(allergenInserts);
      if (error) throw new Error('Alerjen önerileri yazılamadı.');
    }

    // 4b) Diyet önerileri (ai_suggested)
    const dietaryInserts = itemIds.flatMap((itemId, idx) =>
      (flatDraftItems[idx].dietary ?? [])
        .filter((d) => dietaryIdByCode.has(d.code))
        .map((d) => ({
          item_id: itemId,
          org_id: ingestion.org_id,
          tag_id: dietaryIdByCode.get(d.code)!,
          state: 'ai_suggested' as const,
          confidence: d.confidence,
          source: 'ai' as const,
        }))
    );
    if (dietaryInserts.length > 0) {
      const { error } = await supabase.from('item_dietary').insert(dietaryInserts);
      if (error) throw new Error('Diyet önerileri yazılamadı.');
    }

    const complianceInserts = itemIds.map((itemId) => ({
      item_id: itemId,
      org_id: ingestion.org_id,
      allergen_review: 'pending' as const,
      calories_review: 'pending' as const,
    }));
    if (complianceInserts.length > 0) {
      const { error } = await supabase.from('item_compliance').insert(complianceInserts);
      if (error) throw new Error('Uyum kayıtları yazılamadı.');
    }

    // 5) İçe aktarmayı kapat
    const newRaw = {
      ...(prevRaw.success ? prevRaw.data : { model: 'unknown', extracted_at: new Date().toISOString() }),
      extracted: draft,
      created_menu_id: menu.id,
    };
    await supabase
      .from('menu_ingestions')
      .update({ status: 'approved', raw_result: newRaw })
      .eq('id', ingestion.id);

    return NextResponse.json({
      menuId: menu.id,
      venueId: ingestion.venue_id,
      itemCount: itemIds.length,
    });
  } catch (err) {
    // Yarım kalan menüyü temizle — çöp veri bırakma
    await supabase.from('menus').delete().eq('id', menu.id);
    const message = err instanceof Error ? err.message : 'Menü kaydedilemedi.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
