import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Menüye yönlendiriliyorsun…',
  robots: { index: false, follow: false },
};

/**
 * /q/{code} — kalıcı QR yönlendirme katmanı (Faz B2).
 *
 * Basılı QR asla değişmez: kod sabit kalır, hedef (venue slug) değişebilir.
 * Bu yüzden QR'a doğrudan /m/{slug} gömülmez.
 *
 * Okuma neden service-role: `qr_select` policy'si `is_active or is_org_member`
 * olduğu için anonim misafir PASİF kodu hiç göremez — user-client ile
 * "kod yok" ile "kod devre dışı" durumlarını ayırt edemeyiz. Burada okunan
 * veri (kod → slug eşlemesi) PII içermiyor, yazma yok.
 */

type QrRow = {
  id: string;
  is_active: boolean;
  label: string | null;
  venue_id: string;
  venues: { slug: string; name: string; is_published: boolean } | null;
};

export default async function QrRedirectPage({ params }: { params: { code: string } }) {
  const code = params.code.toLowerCase();

  // Şema kısıtı: ^[a-z0-9]{8}$ — uymayan kodu DB'ye hiç sormayız.
  if (!/^[a-z0-9]{8}$/.test(code)) {
    return <Notice title="Bu QR kodu tanımlı değil" body="Kod hatalı görünüyor. Lütfen QR'ı tekrar okut." />;
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from('qr_codes')
    .select('id, is_active, label, venue_id, venues(slug, name, is_published)')
    .eq('code', code)
    .maybeSingle();
  const qr = data as QrRow | null;

  if (!qr || !qr.venues) {
    return (
      <Notice
        title="Bu QR kodu tanımlı değil"
        body="Kod sistemde bulunamadı. İşletmeye bildirebilirsin."
      />
    );
  }

  if (!qr.is_active) {
    return (
      <Notice
        title="Bu QR kodu devre dışı"
        body={`${qr.venues.name} bu kodu kullanımdan kaldırmış. Masadaki güncel QR'ı okutmayı dene.`}
      />
    );
  }

  if (!qr.venues.is_published) {
    // Yayınlanmamış menüyü yalnız org üyesi görebilir (RLS). Üye ise
    // önizlemeye yollarız; değilse nazik bilgi sayfası.
    const supabase = createClient();
    const { data: visible } = await supabase
      .from('venues')
      .select('id')
      .eq('id', qr.venue_id)
      .maybeSingle();
    if (!visible) {
      return (
        <Notice
          title="Menü henüz yayında değil"
          body={`${qr.venues.name} menüsünü hazırlıyor. Kısa süre sonra tekrar dene.`}
        />
      );
    }
  }

  redirect(`/m/${qr.venues.slug}`);
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="text-4xl">🍽️</div>
      <h1 className="text-xl font-semibold text-stone-800">{title}</h1>
      <p className="text-sm text-stone-600">{body}</p>
    </main>
  );
}
