import { NextResponse, type NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { extractMenuFromFile, MenuExtractionError } from '@/lib/ai/extract';
import type { RawResult } from '@/lib/schemas/menu';

export const runtime = 'nodejs';
export const maxDuration = 120; // AI çıkarma 60 sn'yi bulabilir

const bodySchema = z.object({
  venueId: z.string().uuid(),
  storagePath: z.string().min(3), // {org_id}/{uuid}.{ext}
  mimeType: z.string(),
  sourceType: z.enum(['image', 'pdf']),
});

/**
 * POST /api/ingest
 * Yüklenmiş dosya için içe aktarma başlatır ve AI çıkarmayı çalıştırır.
 * Durum makinesi: uploaded → processing → review | failed.
 * İdempotent: aynı venue + aynı dosya (input_hash) için mevcut sonucu döner.
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
  const { venueId, storagePath, mimeType, sourceType } = parsed.data;

  // Kullanıcı bu venue'nun org'una üye mi? (RLS ile örtük doğrulama)
  const { data: venue } = await supabase
    .from('venues')
    .select('id, org_id')
    .eq('id', venueId)
    .maybeSingle();
  if (!venue) {
    return NextResponse.json({ error: 'Mekân bulunamadı.' }, { status: 404 });
  }
  // Yol org klasörüyle başlamalı — başka org'un dosyası işlenemez.
  if (!storagePath.startsWith(`${venue.org_id}/`)) {
    return NextResponse.json({ error: 'Geçersiz dosya yolu.' }, { status: 403 });
  }

  // Dosyayı indir (admin — kullanıcı yetkisi yukarıda doğrulandı)
  const admin = createAdminClient();
  const { data: blob, error: dlErr } = await admin.storage
    .from('menu-uploads')
    .download(storagePath);
  if (dlErr || !blob) {
    return NextResponse.json({ error: 'Dosya okunamadı. Lütfen yeniden yükleyin.' }, { status: 400 });
  }
  const buffer = Buffer.from(await blob.arrayBuffer());
  const inputHash = createHash('sha256').update(buffer).digest('hex');

  // İdempotency: aynı dosya bu venue için zaten işlendiyse onu döndür
  const { data: existing } = await supabase
    .from('menu_ingestions')
    .select('id, status')
    .eq('venue_id', venueId)
    .eq('input_hash', inputHash)
    .in('status', ['review', 'approved'])
    .limit(1)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ id: existing.id, status: existing.status, deduplicated: true });
  }

  // İçe aktarma kaydı aç (kullanıcı JWT — RLS: editor şartı)
  const { data: ingestion, error: insErr } = await supabase
    .from('menu_ingestions')
    .insert({
      venue_id: venueId,
      org_id: venue.org_id,
      uploaded_by: user.id,
      source_type: sourceType,
      storage_path: storagePath,
      input_hash: inputHash,
      status: 'processing',
    })
    .select('id')
    .single();
  if (insErr || !ingestion) {
    return NextResponse.json({ error: 'İçe aktarma başlatılamadı.' }, { status: 500 });
  }

  // AI çıkarma
  try {
    const { extracted, model } = await extractMenuFromFile(buffer, mimeType);
    const rawResult: RawResult = {
      extracted,
      created_menu_id: null,
      model,
      extracted_at: new Date().toISOString(),
    };
    await supabase
      .from('menu_ingestions')
      .update({ status: 'review', raw_result: rawResult, error_message: null })
      .eq('id', ingestion.id);
    return NextResponse.json({ id: ingestion.id, status: 'review' });
  } catch (err) {
    const message =
      err instanceof MenuExtractionError
        ? err.message
        : 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.';
    await supabase
      .from('menu_ingestions')
      .update({ status: 'failed', error_message: message })
      .eq('id', ingestion.id);
    return NextResponse.json({ id: ingestion.id, status: 'failed', error: message }, { status: 502 });
  }
}
