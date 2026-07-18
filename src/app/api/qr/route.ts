import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { generateQrCode } from '@/lib/qr';

export const runtime = 'nodejs';

const createSchema = z.object({
  venueId: z.string().uuid(),
  label: z.string().trim().max(60).nullish(),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().max(60).nullish(),
  isActive: z.boolean().optional(),
});

/**
 * POST /api/qr — venue için yeni bir QR yönlendirme kodu üretir.
 * User-client + RLS: `qr_write` policy'si editor+ ister.
 */
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Oturum bulunamadı.' }, { status: 401 });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Geçersiz veri.' },
      { status: 400 }
    );
  }
  const label = (parsed.data.label ?? '').trim() || null;

  // qr_codes.org_id NOT NULL ve 0001'deki app.fill_org_id trigger'ı bu tabloyu
  // KAPSAMIYOR (menus/categories/items/... var, qr_codes yok). Bu yüzden org_id'yi
  // venue'dan okuyup elle yazıyoruz. Okuma user-client + RLS: venue görünmüyorsa
  // zaten yetki yok demektir.
  const { data: venue } = await supabase
    .from('venues')
    .select('org_id')
    .eq('id', parsed.data.venueId)
    .maybeSingle();
  if (!venue) {
    return NextResponse.json({ error: 'İşletme bulunamadı veya yetkin yok.' }, { status: 403 });
  }

  // 31^8 ≈ 8.5e11 — çakışma pratikte yok denecek kadar az, yine de
  // unique violation'ı yakalayıp birkaç kez yeniden deniyoruz.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateQrCode();
    const { data, error } = await supabase
      .from('qr_codes')
      .insert({ venue_id: parsed.data.venueId, org_id: venue.org_id, code, label })
      .select('id, code, label, is_active, created_at')
      .single();

    if (!error && data) return NextResponse.json({ ok: true, qr: data });
    if (error?.code === '23505') continue; // kod çakıştı → yeniden dene
    return NextResponse.json(
      { error: 'QR kodu oluşturulamadı.', details: error?.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ error: 'Benzersiz kod üretilemedi, tekrar dene.' }, { status: 500 });
}

/**
 * PATCH /api/qr — etiketi değiştirir veya kodu devre dışı bırakır.
 * Kod ASLA silinmez: basılı materyal ortada olabilir. Devre dışı kod
 * /q/{code} üzerinde bilgilendirme sayfası gösterir.
 */
export async function PATCH(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Oturum bulunamadı.' }, { status: 401 });

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Geçersiz veri.' },
      { status: 400 }
    );
  }
  const b = parsed.data;

  const patch: Record<string, string | boolean | null> = {};
  if (b.label !== undefined) patch.label = (b.label ?? '').trim() || null;
  if (b.isActive !== undefined) patch.is_active = b.isActive;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Güncellenecek alan yok.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('qr_codes')
    .update(patch)
    .eq('id', b.id)
    .select('id, code, label, is_active, created_at')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'Güncellenemedi.', details: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'QR kodu bulunamadı veya yetkin yok.' }, { status: 403 });
  }
  return NextResponse.json({ ok: true, qr: data });
}
