import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { upscaleImage, ImageError, isImageConfigured } from '@/lib/ai/image';

export const runtime = 'nodejs';
export const maxDuration = 60;

const bodySchema = z
  .object({
    itemId: z.string().uuid().optional(),
    categoryId: z.string().uuid().optional(),
    /** Kullanıcının yüklediği (geçici) kaynak görselin public URL'i. */
    sourceUrl: z.string().url(),
  })
  .refine((b) => Boolean(b.itemId) !== Boolean(b.categoryId), {
    message: 'itemId veya categoryId (yalnızca biri) gerekli.',
  });

const EDITOR_ROLES = ['owner', 'admin', 'editor'];

/**
 * POST /api/image/enhance
 * Yüklenen görseli içeriğini değiştirmeden yükseltir/keskinleştirir (Runware
 * upscale), venue-media'ya kalıcı kaydeder, ürün image_url veya kategori
 * background_url'ini günceller, geçici kaynağı siler.
 */
export async function POST(request: NextRequest) {
  if (!isImageConfigured()) {
    return NextResponse.json(
      { error: 'Görsel iyileştirme yapılandırılmamış. RUNWARE_API_KEY ekleyin.' },
      { status: 501 }
    );
  }

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
  const { itemId, categoryId, sourceUrl } = parsed.data;

  const publicPrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/venue-media/`;
  if (!sourceUrl.startsWith(publicPrefix)) {
    return NextResponse.json({ error: 'Geçersiz görsel adresi.' }, { status: 400 });
  }
  const sourcePath = sourceUrl.slice(publicPrefix.length).split('?')[0];

  const admin = createAdminClient();
  const table = itemId ? 'items' : 'categories';
  const column = itemId ? 'image_url' : 'background_url';
  const subdir = itemId ? 'items' : 'categories';
  const id = (itemId ?? categoryId)!;

  const { data: row } = await admin.from(table).select('id, org_id').eq('id', id).maybeSingle();
  if (!row) {
    return NextResponse.json({ error: 'Kayıt bulunamadı.' }, { status: 404 });
  }
  if (!sourcePath.startsWith(`${row.org_id}/`)) {
    return NextResponse.json({ error: 'Geçersiz görsel adresi.' }, { status: 400 });
  }

  const { data: mem } = await admin
    .from('organization_members')
    .select('role')
    .eq('org_id', row.org_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!mem || !EDITOR_ROLES.includes(mem.role)) {
    return NextResponse.json({ error: 'Bu işlem için yetkiniz yok.' }, { status: 403 });
  }

  try {
    const bytes = await upscaleImage(sourceUrl);
    const path = `${row.org_id}/${subdir}/${id}-${Date.now().toString(36)}.webp`;
    const { error: upErr } = await admin.storage
      .from('venue-media')
      .upload(path, bytes, { contentType: 'image/webp', upsert: true });
    if (upErr) return NextResponse.json({ error: 'Görsel kaydedilemedi.' }, { status: 500 });

    const {
      data: { publicUrl },
    } = admin.storage.from('venue-media').getPublicUrl(path);

    const { error: updErr } = await admin.from(table).update({ [column]: publicUrl }).eq('id', id);
    if (updErr) return NextResponse.json({ error: 'Görsel bağlanamadı.' }, { status: 500 });

    if (sourcePath !== path) {
      await admin.storage.from('venue-media').remove([sourcePath]);
    }

    return NextResponse.json({ imageUrl: publicUrl });
  } catch (err) {
    const message = err instanceof ImageError ? err.message : 'Görsel iyileştirilemedi.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
