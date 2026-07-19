import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const bodySchema = z.object({
  email: z.string().trim().email('Geçerli bir e-posta gir.').optional(),
  phone: z
    .string()
    .trim()
    .min(6, 'Telefon numarası çok kısa.')
    .max(32)
    .regex(/^[+()\d\s-]+$/, 'Telefon yalnız rakam ve + ( ) - boşluk içerebilir.')
    .optional(),
});

/**
 * POST /api/account — anonim oturumu kalıcı hesaba yükseltir (Faz B4).
 *
 * E-posta: updateUser({ email }) MEVCUT user.id'yi KORUYARAK e-postaya bağlar
 * ve doğrulama linki gönderir. Link /auth/callback'e döner. Yeni hesap açılmaz,
 * veri taşınmaz — org sahipliği olduğu gibi kalır.
 *
 * Telefon: organizations.contact_phone'a yazılır (hesap sahibinin numarası;
 * venues.phone ile karıştırma). Doğrulama YOK (Faz C'de SMS eklenir).
 */
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Oturum bulunamadı.' }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Geçersiz veri.' },
      { status: 400 }
    );
  }
  const { email, phone } = parsed.data;
  if (!email && !phone) {
    return NextResponse.json({ error: 'E-posta veya telefon gerekli.' }, { status: 400 });
  }

  // Telefon → hesap sahibinin org'una yaz. Owner RLS (org_update) izin verir.
  if (phone) {
    const { data: membership } = await supabase
      .from('organization_members')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();
    if (!membership) {
      return NextResponse.json({ error: 'İşletme bulunamadı.' }, { status: 404 });
    }
    const { error: phoneErr } = await supabase
      .from('organizations')
      .update({ contact_phone: phone })
      .eq('id', membership.org_id);
    if (phoneErr) {
      return NextResponse.json({ error: 'Telefon kaydedilemedi.', details: phoneErr.message }, { status: 500 });
    }
  }

  // E-posta → anonim oturumu yükselt + doğrulama linki gönder.
  if (email) {
    const origin = siteOrigin(request);
    const { error: emailErr } = await supabase.auth.updateUser(
      { email },
      { emailRedirectTo: `${origin}/auth/callback?next=/studyo/hesap` }
    );
    if (emailErr) {
      const s = emailErr.message.toLowerCase();
      if (s.includes('registered') || s.includes('already') || s.includes('exists')) {
        return NextResponse.json(
          { error: 'Bu e-posta zaten kullanımda. Farklı bir e-posta dene veya o hesapla giriş yap.' },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: 'E-posta gönderilemedi.', details: emailErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, emailSent: Boolean(email), phoneSaved: Boolean(phone) });
}

function siteOrigin(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  const proto = request.headers.get('x-forwarded-proto') ?? 'http';
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? new URL(request.url).host;
  return `${proto}://${host}`;
}
