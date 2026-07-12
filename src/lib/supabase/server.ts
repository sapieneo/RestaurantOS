import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient as createAdminBase } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/**
 * Sunucu tarafı istemci — kullanıcının JWT'siyle çalışır, RLS geçerlidir.
 * Route handler ve Server Component'lerde kullanılır.
 */
export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component içinden çağrıldıysa yazma başarısız olabilir;
            // middleware oturumu tazelediği için güvenle yutulur.
          }
        },
      },
    }
  );
}

/**
 * Service-role istemci — RLS'i ATLAR. Yalnız sunucuda, yalnız
 * kullanıcı yetkisi ayrıca doğrulandıktan sonra kullanılır
 * (ör. storage'dan dosya indirme, scan_events yazma).
 */
export function createAdminClient() {
  return createAdminBase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
