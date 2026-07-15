import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const optStr = (max: number) => z.string().trim().max(max).nullish();

const bodySchema = z.object({
  venueId: z.string().uuid(),
  name: z.string().trim().min(1, 'İşletme adı boş olamaz').max(120),
  description: optStr(500),
  address: optStr(300),
  phone: optStr(40),
  whatsapp: optStr(40),
  instagram: optStr(120),
  googleMapsUrl: optStr(500),
  wifiSsid: optStr(120),
  openingHours: optStr(200),
  currencyCode: z.string().length(3).optional(),
});

/**
 * PATCH /api/venue
 * İşletme (venue) ayarlarını günceller. User-client + RLS ile çalışır:
 * yalnız org üyesi (editor+) kendi venue'sunu günceller.
 */
export async function PATCH(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Oturum bulunamadı.' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? 'Geçersiz veri.';
    return NextResponse.json({ error: first }, { status: 400 });
  }
  const b = parsed.data;
  const norm = (v: string | null | undefined) => {
    const t = (v ?? '').trim();
    return t === '' ? null : t;
  };

  const patch: Record<string, string | null> = {
    name: b.name.trim(),
    description: norm(b.description),
    address: norm(b.address),
    phone: norm(b.phone),
    whatsapp: norm(b.whatsapp),
    instagram: norm(b.instagram),
    google_maps_url: norm(b.googleMapsUrl),
    wifi_ssid: norm(b.wifiSsid),
    opening_hours: norm(b.openingHours),
  };
  if (b.currencyCode) patch.currency_code = b.currencyCode;

  const { error } = await supabase.from('venues').update(patch).eq('id', b.venueId);
  if (error) {
    return NextResponse.json({ error: 'Kaydedilemedi.', details: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
