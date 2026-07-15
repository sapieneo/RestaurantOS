import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const bodySchema = z.object({
  itemId: z.string().uuid(),
  /** Depolanan görsel URL'i; null = kaldır. */
  imageUrl: z.string().url().nullable(),
});

const EDITOR_ROLES = ['owner', 'admin', 'editor'];

/**
 * PATCH /api/image
 * Elle yüklenen görselin URL'ini ürüne bağlar veya görseli kaldırır.
 * Güvenlik: yalnız kendi venue-media bucket'ımızdaki public URL kabul edilir.
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
  const { itemId, imageUrl } = parsed.data;

  // Dış URL enjeksiyonunu engelle: yalnız kendi public bucket URL'imiz.
  if (imageUrl !== null) {
    const allowedPrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/venue-media/`;
    if (!imageUrl.startsWith(allowedPrefix)) {
      return NextResponse.json({ error: 'Geçersiz görsel adresi.' }, { status: 400 });
    }
  }

  const admin = createAdminClient();
  const { data: item } = await admin.from('items').select('id, org_id').eq('id', itemId).maybeSingle();
  if (!item) {
    return NextResponse.json({ error: 'Ürün bulunamadı.' }, { status: 404 });
  }

  const { data: mem } = await admin
    .from('organization_members')
    .select('role')
    .eq('org_id', item.org_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!mem || !EDITOR_ROLES.includes(mem.role)) {
    return NextResponse.json({ error: 'Bu işlem için yetkiniz yok.' }, { status: 403 });
  }

  const { error } = await admin.from('items').update({ image_url: imageUrl }).eq('id', itemId);
  if (error) {
    return NextResponse.json({ error: 'Görsel güncellenemedi.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, imageUrl });
}
