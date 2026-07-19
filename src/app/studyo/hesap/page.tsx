import { createClient } from '@/lib/supabase/server';
import { AccountCard } from './account-card';

export const dynamic = 'force-dynamic';

/**
 * Hesap ekranı (Faz B4). Anonim oturumu kalıcı hesaba çevirme + iletişim
 * telefonu. Anonim kullanıcının verisi yalnız o tarayıcı oturumuna bağlıdır;
 * çerez kaybolursa menü erişilemez hale gelir — bu ekran o riski kapatır.
 */
export default async function AccountPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-xl font-semibold">Oturum bulunamadı</h1>
        <p className="text-stone-600">Önce studyoya gir, ardından hesabını güvene alabilirsin.</p>
        <a href="/studyo" className="mt-2 rounded-xl bg-brand-600 px-6 py-3 font-semibold text-white shadow">
          Studyoya git
        </a>
      </main>
    );
  }

  // is_anonymous JWT claim'i; e-posta bağlanınca false olur.
  const isAnonymous = (user as { is_anonymous?: boolean }).is_anonymous ?? !user.email;

  const { data: membership } = await supabase
    .from('organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  let contactPhone: string | null = null;
  if (membership) {
    const { data: org } = await supabase
      .from('organizations')
      .select('contact_phone')
      .eq('id', membership.org_id)
      .maybeSingle();
    contactPhone = (org?.contact_phone as string | null) ?? null;
  }

  return (
    <AccountCard
      email={user.email ?? null}
      isAnonymous={isAnonymous}
      contactPhone={contactPhone}
    />
  );
}
