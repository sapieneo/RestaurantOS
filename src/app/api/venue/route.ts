import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const optStr = (max: number) => z.string().trim().max(max).nullish();

/**
 * Tüm alanlar opsiyonel: PATCH kısmi güncelleme yapar. Ayarlar formu hepsini
 * birden gönderir; yayın kartı yalnız `isPublished` gönderir. Tek yazma yolu.
 */
const bodySchema = z.object({
  venueId: z.string().uuid(),
  name: z.string().trim().min(1, 'İşletme adı boş olamaz').max(120).optional(),
  description: optStr(500),
  address: optStr(300),
  phone: optStr(40),
  whatsapp: optStr(40),
  instagram: optStr(120),
  googleMapsUrl: optStr(500),
  wifiSsid: optStr(120),
  openingHours: optStr(200),
  currencyCode: z.string().length(3).optional(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Menü adresi en az 3 karakter olmalı.')
    .max(60, 'Menü adresi en fazla 60 karakter olabilir.')
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      'Menü adresi yalnız küçük harf, rakam ve tire içerebilir (ör. sine-pub).'
    )
    .optional(),
  isPublished: z.boolean().optional(),
});

/**
 * PATCH /api/venue
 * İşletme (venue) ayarlarını ve yayın durumunu günceller. User-client + RLS
 * ile çalışır: yalnız org üyesi (editor+) kendi venue'sunu günceller.
 *
 * `isPublished` tek bir boolean ama etkisi geniş: 0001'deki tüm public SELECT
 * policy'leri venues.is_published şartına bağlı, yani bu alan menü zincirinin
 * tamamını (menus → categories → items → çeviriler → alerjenler) anonim
 * misafire açar/kapatır.
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

  // Yalnız gövdede GELEN alanlar yazılır (kısmi güncelleme).
  const patch: Record<string, string | boolean | null> = {};
  const setIf = (key: string, present: boolean, value: string | null) => {
    if (present) patch[key] = value;
  };
  if (b.name !== undefined) patch.name = b.name.trim();
  setIf('description', b.description !== undefined, norm(b.description));
  setIf('address', b.address !== undefined, norm(b.address));
  setIf('phone', b.phone !== undefined, norm(b.phone));
  setIf('whatsapp', b.whatsapp !== undefined, norm(b.whatsapp));
  setIf('instagram', b.instagram !== undefined, norm(b.instagram));
  setIf('google_maps_url', b.googleMapsUrl !== undefined, norm(b.googleMapsUrl));
  setIf('wifi_ssid', b.wifiSsid !== undefined, norm(b.wifiSsid));
  setIf('opening_hours', b.openingHours !== undefined, norm(b.openingHours));
  if (b.currencyCode) patch.currency_code = b.currencyCode;
  if (b.slug !== undefined) patch.slug = b.slug;

  if (b.isPublished !== undefined) {
    patch.is_published = b.isPublished;
    if (b.isPublished) {
      // İlk yayın tarihini bir kez yaz; yayından kaldırınca SİLME —
      // published_at arşiv bilgisidir, is_published anahtardır.
      const { data: current } = await supabase
        .from('venues')
        .select('published_at')
        .eq('id', b.venueId)
        .maybeSingle();
      if (!current?.published_at) patch.published_at = new Date().toISOString();
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Güncellenecek alan yok.' }, { status: 400 });
  }

  const { data: updated, error } = await supabase
    .from('venues')
    .update(patch)
    .eq('id', b.venueId)
    .select('slug, is_published, published_at')
    .maybeSingle();

  if (error) {
    // 23505: unique violation — slug başka bir işletmede kullanılıyor.
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Bu menü adresi başka bir işletmede kullanılıyor. Başka bir adres dene.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: 'Kaydedilemedi.', details: error.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: 'İşletme bulunamadı veya yetkin yok.' }, { status: 403 });
  }

  return NextResponse.json({
    ok: true,
    slug: updated.slug,
    isPublished: updated.is_published,
    publishedAt: updated.published_at,
  });
}
