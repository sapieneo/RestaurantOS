import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { extractMenuFromFiles, MenuExtractionError, type MenuPage } from '@/lib/ai/extract';

export const runtime = 'nodejs';
export const maxDuration = 120;

const bodySchema = z.object({
  venueId: z.string().uuid(),
  pages: z
    .array(
      z.object({
        storagePath: z.string().min(3),
        mimeType: z.string(),
        sourceType: z.enum(['image', 'pdf']),
      })
    )
    .min(1)
    .max(10),
});

/**
 * POST /api/menu/extract-pages
 * Ek sayfaları OCR eder ve çıkarılan menüyü döner — DURUM DEĞİŞTİRMEZ
 * (ingestion oluşturmaz/güncellemez). Taslak editöründe "Sayfa ekle" akışı,
 * dönen kategorileri mevcut taslağa istemci tarafında ekler.
 */
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Oturum bulunamadı.' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 });
  }
  const { venueId, pages } = parsed.data;

  const { data: venue } = await supabase
    .from('venues')
    .select('id, org_id')
    .eq('id', venueId)
    .maybeSingle();
  if (!venue) {
    return NextResponse.json({ error: 'Mekân bulunamadı.' }, { status: 404 });
  }
  if (pages.some((p) => !p.storagePath.startsWith(`${venue.org_id}/`))) {
    return NextResponse.json({ error: 'Geçersiz dosya yolu.' }, { status: 403 });
  }

  const admin = createAdminClient();
  const menuPages: MenuPage[] = [];
  for (const p of pages) {
    const { data: blob, error: dlErr } = await admin.storage.from('menu-uploads').download(p.storagePath);
    if (dlErr || !blob) {
      return NextResponse.json({ error: 'Dosya okunamadı. Lütfen yeniden yükleyin.' }, { status: 400 });
    }
    menuPages.push({ buffer: Buffer.from(await blob.arrayBuffer()), mimeType: p.mimeType });
  }

  try {
    const { extracted } = await extractMenuFromFiles(menuPages);
    return NextResponse.json({ categories: extracted.categories, warnings: extracted.warnings });
  } catch (err) {
    const message =
      err instanceof MenuExtractionError ? err.message : 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
