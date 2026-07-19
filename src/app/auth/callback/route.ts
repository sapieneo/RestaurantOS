import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * GET /auth/callback — magic link / OAuth dönüş noktası (Faz B4).
 *
 * KRİTİK: e-posta doğrulama linkine tıklandığında Supabase buraya `?code=...`
 * ile döner. `exchangeCodeForSession` bu kodu oturuma çevirir VE mevcut anonim
 * oturumu e-postaya BAĞLAR (updateUser({email}) ile başlatılmışsa) — user.id
 * KORUNUR. Yani org sahipliği, üyelik, tüm menü verisi olduğu gibi kalır.
 *
 * Link farklı bir tarayıcıda açılırsa orada anonim oturum yoktur; kod yine de
 * geçerli bir oturum kurar ama o cihazda "yükseltme" değil düz giriş olur.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const errorDescription = url.searchParams.get('error_description');
  const next = url.searchParams.get('next') || '/studyo/hesap';

  // KRİTİK: yönlendirme tabanı NEXT_PUBLIC_SITE_URL olmalı, request.url DEĞİL.
  // Netlify Function içinde host, deploy permalink'i (main--site.netlify.app)
  // olabilir; oraya yönlendirirsek oturum çerezi kanonik alan adına yazılmaz
  // ve kullanıcı giriş yapmış görünmez. Env yoksa istek origin'ine düşeriz.
  const origin = (process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '') || url.origin);

  if (errorDescription) {
    return NextResponse.redirect(`${origin}/studyo/hesap?auth_error=${encodeURIComponent(errorDescription)}`);
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/studyo/hesap?auth_error=${encodeURIComponent('Geçersiz bağlantı')}`);
  }

  const supabase = createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${origin}/studyo/hesap?auth_error=${encodeURIComponent(errorMessage(error.message))}`
    );
  }

  return NextResponse.redirect(`${origin}${next}?auth_ok=1`);
}

function errorMessage(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes('expired')) return 'Bağlantının süresi dolmuş. Yeni bir e-posta iste.';
  if (s.includes('already') || s.includes('registered'))
    return 'Bu e-posta zaten başka bir hesapta kayıtlı.';
  return 'Doğrulama tamamlanamadı. Tekrar dene.';
}
