import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Oturum tazeleme middleware'i. Anonim oturumlar dahil tüm Supabase
 * oturum çerezlerini her istekte yeniler; süresi dolan token yüzünden
 * studyo akışının yarıda kesilmesini engeller.
 */
/** Misafir trafiğinin yoğun olduğu genel yollar. */
const GUEST_PATH = /^\/(m|q)\//;

export async function middleware(request: NextRequest) {
  // Misafir yollarında OTURUM ÇEREZİ YOKSA auth'a hiç dokunma: her QR
  // okutmasında gereksiz bir Supabase getUser() çağrısı yapmayalım.
  // Çerezi olan (yani önizleme yapan işletme sahibi) için akış değişmez —
  // token tazelemesi eskisi gibi çalışır.
  if (GUEST_PATH.test(request.nextUrl.pathname)) {
    const hasSession = request.cookies.getAll().some((c) => c.name.startsWith('sb-'));
    if (!hasSession) return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser çağrısı token'ı gerekirse tazeler.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Statik varlıklar hariç her istekte çalışır; misafir yolları yukarıda
  // çerez kontrolüyle erken çıkar (B3).
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
