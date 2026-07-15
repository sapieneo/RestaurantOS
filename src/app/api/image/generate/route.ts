import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { buildFoodPrompt, generateImage, ImageError, isImageConfigured } from '@/lib/ai/image';

export const runtime = 'nodejs';
export const maxDuration = 60;

const bodySchema = z.object({
  itemId: z.string().uuid(),
  /** İsteğe bağlı özel prompt (yoksa üründen üretilir). */
  prompt: z.string().trim().min(2).max(2000).optional(),
});

const EDITOR_ROLES = ['owner', 'admin', 'editor'];

/**
 * POST /api/image/generate
 * Ürün için AI görseli üretir (Runware), venue-media'ya kalıcı kaydeder,
 * items.image_url'i günceller. Üyelik (editor+) doğrulanır.
 */
export async function POST(request: NextRequest) {
  if (!isImageConfigured()) {
    return NextResponse.json(
      { error: 'Görsel üretimi yapılandırılmamış. RUNWARE_API_KEY ekleyin.' },
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

  const admin = createAdminClient();

  const { data: item } = await admin
    .from('items')
    .select('id, name, description, ingredients, org_id')
    .eq('id', parsed.data.itemId)
    .maybeSingle();
  if (!item) {
    return NextResponse.json({ error: 'Ürün bulunamadı.' }, { status: 404 });
  }

  // Üyelik doğrula (editor+)
  const { data: mem } = await admin
    .from('organization_members')
    .select('role')
    .eq('org_id', item.org_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!mem || !EDITOR_ROLES.includes(mem.role)) {
    return NextResponse.json({ error: 'Bu işlem için yetkiniz yok.' }, { status: 403 });
  }

  try {
    const prompt =
      parsed.data.prompt ?? buildFoodPrompt(item.name, item.description, item.ingredients);
    const bytes = await generateImage(prompt);

    const path = `${item.org_id}/items/${item.id}-${Date.now().toString(36)}.webp`;
    const { error: upErr } = await admin.storage
      .from('venue-media')
      .upload(path, bytes, { contentType: 'image/webp', upsert: true });
    if (upErr) {
      return NextResponse.json({ error: 'Görsel kaydedilemedi.' }, { status: 500 });
    }

    const {
      data: { publicUrl },
    } = admin.storage.from('venue-media').getPublicUrl(path);

    const { error: updErr } = await admin
      .from('items')
      .update({ image_url: publicUrl })
      .eq('id', item.id);
    if (updErr) {
      return NextResponse.json({ error: 'Görsel ürüne bağlanamadı.' }, { status: 500 });
    }

    return NextResponse.json({ imageUrl: publicUrl });
  } catch (err) {
    const message = err instanceof ImageError ? err.message : 'Görsel üretilemedi.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
