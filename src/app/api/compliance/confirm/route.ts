import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { ALLERGEN_CODES, DIETARY_CODES } from '@/lib/schemas/menu';

export const runtime = 'nodejs';

const bodySchema = z.object({
  itemId: z.string().uuid(),
  /** Onaylanan nihai alerjen seti. Boş = "alerjensiz" beyanı. */
  allergenCodes: z.array(z.enum(ALLERGEN_CODES)).default([]),
  /** Onaylanan diyet rozetleri (Helal/Alkolsüz/Vegan/Vejetaryen). */
  dietaryCodes: z.array(z.enum(DIETARY_CODES)).default([]),
  caloriesOk: z.boolean().default(false),
  /** true → onayı geri al (düzenlemeye dön). */
  revert: z.boolean().default(false),
});

/**
 * POST /api/compliance/confirm
 * Bir ürünün alerjen/kalori incelemesini onaylar (veya geri alır).
 * Asıl yetki ve atomiklik veritabanı RPC'sinde (app.confirm_item_compliance).
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
  const { itemId, allergenCodes, dietaryCodes, caloriesOk, revert } = parsed.data;

  const { error } = revert
    ? await supabase.rpc('unconfirm_item_compliance', { p_item: itemId })
    : await supabase.rpc('confirm_item_compliance', {
        p_item: itemId,
        p_allergen_codes: allergenCodes,
        p_dietary_codes: dietaryCodes,
        p_calories_ok: caloriesOk,
      });

  if (error) {
    const status = error.code === '42501' || error.message.includes('yetki') ? 403 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ ok: true, itemId, confirmed: !revert });
}
