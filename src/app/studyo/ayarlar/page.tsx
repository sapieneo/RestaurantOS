import { createClient } from '@/lib/supabase/server';
import { VenueSettingsForm, type VenueSettings } from './venue-settings-form';

export const dynamic = 'force-dynamic';

/**
 * İşletme ayarları: misafir menüsünün kimlik + iletişim/footer bilgileri.
 * Tek venue modeli — kullanıcının erişebildiği ilk venue düzenlenir (RLS).
 */
export default async function VenueSettingsPage() {
  const supabase = createClient();
  const { data: venue } = await supabase
    .from('venues')
    .select('id, slug, name, description, address, phone, whatsapp, instagram, google_maps_url, wifi_ssid, opening_hours, currency_code')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!venue) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-xl font-semibold">Henüz işletmen yok</h1>
        <p className="text-stone-600">Önce bir menü oluştur; ardından ayarları buradan düzenleyebilirsin.</p>
        <a
          href="/studyo"
          className="mt-2 inline-block rounded-xl bg-brand-600 px-6 py-3 font-semibold text-white shadow"
        >
          Menü oluştur
        </a>
      </main>
    );
  }

  const initial: VenueSettings = {
    id: venue.id,
    slug: venue.slug,
    name: venue.name ?? '',
    description: venue.description ?? '',
    address: venue.address ?? '',
    phone: venue.phone ?? '',
    whatsapp: venue.whatsapp ?? '',
    instagram: venue.instagram ?? '',
    googleMapsUrl: venue.google_maps_url ?? '',
    wifiSsid: venue.wifi_ssid ?? '',
    openingHours: venue.opening_hours ?? '',
    currencyCode: venue.currency_code ?? 'TRY',
  };

  return <VenueSettingsForm initial={initial} />;
}
