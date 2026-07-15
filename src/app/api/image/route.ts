import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const bodySchema = z
  .object({
    itemId: z.string().uuid().optional(),
    categoryId: z.string().uuid().optional(),
    /** Depolanan görsel URL'i; null = kaldır. */
    imageUrl: z.string().url().nullable(),
  })
  .refine((b) => Boolean(b.itemId) !== Boolean(b.categoryId), {
    message: 'itemId veya categoryId (yalnızca biri) gerekli.',
  });

const EDITOR_ROLES = ['owner', 'admin', 'editor'];

/**
 * PATCH /api/image
 * Elle yüklenen görselin URL'ini ürüne (image_url) veya kategoriye
 * (background_url) bağlar ya da kaldırır (null). Yalnız kendi venue-media
 * public URL'imiz kabul edilir.
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
    return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 });
  }
  const { itemId, categoryId, imageUrl } = parsed.data;

  if (imageUrl !== null) {
    const allowedPrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/venue-media/`;
    if (!imageUrl.startsWith(allowedPrefix)) {
      return NextResponse.json({ error: 'Geçersiz görsel adresi.' }, { status: 400 });
    }
  }

  const admin = createAdminClient();
  const table = itemId ? 'items' : 'categories';
  const column = itemId ? 'image_url' : 'background_url';
  const id = (itemId ?? categoryId)!;

  const { data: row } = await admin.from(table).select('id, org_id').eq('id', id).maybeSingle();
  if (!row) {
    return NextResponse.json({ error: 'Kayıt bulunamadı.' }, { status: 404 });
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

  const { error } = await admin.from(table).update({ [column]: imageUrl }).eq('id', id);
  if (error) {
    return NextResponse.json({ error: 'Görsel güncellenemedi.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, imageUrl });
}
