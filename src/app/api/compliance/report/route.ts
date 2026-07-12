import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { CODE_BY_ID } from '@/lib/allergens';
import { buildCompliancePdf, type ReportItem } from '@/server/compliance-pdf';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * GET /api/compliance/report?venueId=...
 * İşletmenin uyum raporunu PDF olarak indirir (ürün × alerjen matrisi + onay zinciri).
 * Yalnız org üyesi erişebilir.
 */
export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Oturum bulunamadı.' }, { status: 401 });
  }

  const venueId = request.nextUrl.searchParams.get('venueId');
  if (!venueId) {
    return NextResponse.json({ error: 'venueId gerekli.' }, { status: 400 });
  }

  // Venue + üyelik doğrulaması (yayınlı venue anon'a da görünür; üyeliği açıkça kontrol et)
  const { data: venue } = await supabase
    .from('venues')
    .select('id, name, org_id')
    .eq('id', venueId)
    .maybeSingle();
  if (!venue) {
    return NextResponse.json({ error: 'İşletme bulunamadı.' }, { status: 404 });
  }
  const { data: membership } = await supabase
    .from('organization_members')
    .select('user_id')
    .eq('org_id', venue.org_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: 'Bu rapora erişim yetkiniz yok.' }, { status: 403 });
  }

  // Menü zinciri: menus → categories → items
  const { data: menus } = await supabase
    .from('menus')
    .select('id')
    .eq('venue_id', venueId)
    .eq('is_active', true);
  const menuIds = (menus ?? []).map((m) => m.id);

  const { data: categories } = menuIds.length
    ? await supabase.from('categories').select('id, name').in('menu_id', menuIds)
    : { data: [] as { id: string; name: string }[] };
  const catName = new Map((categories ?? []).map((c) => [c.id, c.name]));
  const catIds = (categories ?? []).map((c) => c.id);

  const { data: itemRows } = catIds.length
    ? await supabase
        .from('items')
        .select(
          'id, name, category_id, calories_kcal, allergens_confirmed, sort_order, ' +
            'item_allergens(allergen_id, state), item_compliance(reviewed_by, reviewed_at)'
        )
        .in('category_id', catIds)
        .order('sort_order')
    : { data: [] as never[] };

  const rows = (itemRows ?? []) as unknown as Record<string, unknown>[];

  // Onaylayan e-postalarını (service role) çöz
  const reviewerIds = new Set<string>();
  for (const it of rows) {
    const comp = normalizeComp(it.item_compliance);
    if (comp?.reviewed_by) reviewerIds.add(comp.reviewed_by);
  }
  const emailById = await resolveEmails(Array.from(reviewerIds));

  const items: ReportItem[] = rows.map((it) => {
    const algRows = (it.item_allergens as { allergen_id: number; state: string }[]) ?? [];
    const comp = normalizeComp(it.item_compliance);
    return {
      name: it.name as string,
      category: catName.get(it.category_id as string) ?? '—',
      calories: (it.calories_kcal as number | null) ?? null,
      confirmed: Boolean(it.allergens_confirmed),
      allergenCodes: algRows
        .filter((r) => r.state === 'confirmed')
        .map((r) => CODE_BY_ID[r.allergen_id])
        .filter(Boolean),
      reviewedAt: comp?.reviewed_at ?? null,
      reviewerEmail: comp?.reviewed_by ? emailById.get(comp.reviewed_by) ?? null : null,
    };
  });

  const pdf = await buildCompliancePdf({ venueName: venue.name, items });
  const trMap: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' };
  const slug =
    venue.name
      .toLowerCase()
      .replace(/[çğıöşü]/g, (c: string) => trMap[c] ?? c)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 40) || 'menu';

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="uyum-raporu-${slug}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}

type Comp = { reviewed_by: string | null; reviewed_at: string | null };
function normalizeComp(raw: unknown): Comp | null {
  if (!raw) return null;
  const c = Array.isArray(raw) ? raw[0] : raw;
  return (c as Comp) ?? null;
}

async function resolveEmails(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!ids.length) return map;
  try {
    const admin = createAdminClient();
    await Promise.all(
      ids.map(async (id) => {
        const { data } = await admin.auth.admin.getUserById(id);
        if (data?.user?.email) map.set(id, data.user.email);
      })
    );
  } catch {
    // e-posta çözülemezse rapor yine üretilir (— gösterilir)
  }
  return map;
}
