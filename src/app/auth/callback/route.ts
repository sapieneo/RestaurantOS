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

  if (errorDescription) {
    return NextResponse.redirect(
      new URL(`/studyo/hesap?auth_error=${encodeURIComponent(errorDescription)}`, url.origin)
    );
  }
  if (!code) {
    return NextResponse.redirect(
      new URL('/studyo/hesap?auth_error=Ge%C3%A7ersiz%20ba%C4%9Flant%C4%B1', url.origin)
    );
  }

  const supabase = createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(`/studyo/hesap?auth_error=${encodeURIComponent(errorMessage(error.message))}`, url.origin)
    );
  }

  return NextResponse.redirect(new URL(`${next}?auth_ok=1`, url.origin));
}

function errorMessage(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes('expired')) return 'Bağlantının süresi dolmuş. Yeni bir e-posta iste.';
  if (s.includes('already') || s.includes('registered'))
    return 'Bu e-posta zaten başka bir hesapta kayıtlı.';
  return 'Doğrulama tamamlanamadı. Tekrar dene.';
}
