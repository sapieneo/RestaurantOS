import { createClient } from '@/lib/supabase/server';
import { VenueSettingsForm, type VenueSettings } from './venue-settings-form';

export const dynamic = 'force-dynamic';

/**
 * İşletme ayarları: misafir menüsünün kimlik + iletişim/footer bilgileri,
 * menü adresi (slug) ve yayın durumu (Faz B1).
 * Tek venue modeli — kullanıcının erişebildiği ilk venue düzenlenir (RLS).
 */
export default async function VenueSettingsPage() {
  const supabase = createClient();
  const { data: venue } = await supabase
    .from('venues')
    // Tek parça string: supabase-js select'i literal tipten çözümlüyor,
    // string birleştirme tip çıkarımını bozar (GenericStringError).
    .select('id, slug, name, description, address, phone, whatsapp, instagram, google_maps_url, wifi_ssid, opening_hours, currency_code, is_published, published_at')
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

  // Yayın öncesi uyum durumu: alerjen incelemesi 'confirmed' olmayan ürün
  // sayısı. Yayını bloke etmiyoruz — beyan sorumluluğu işletmede — ama
  // kullanıcıyı bilinçli karar vermeye zorluyoruz.
  const { data: menus } = await supabase
    .from('menus')
    .select('id')
    .eq('venue_id', venue.id)
    .eq('is_active', true);
  const menuIds = (menus ?? []).map((m) => m.id);

  const { data: cats } = menuIds.length
    ? await supabase.from('categories').select('id').in('menu_id', menuIds).eq('is_active', true)
    : { data: [] as { id: string }[] };
  const catIds = (cats ?? []).map((c) => c.id);

  const { data: items } = catIds.length
    ? await supabase.from('items').select('id').in('category_id', catIds)
    : { data: [] as { id: string }[] };
  const itemIds = (items ?? []).map((i) => i.id);

  const { count: confirmedCount } = itemIds.length
    ? await supabase
        .from('item_compliance')
        .select('item_id', { count: 'exact', head: true })
        .in('item_id', itemIds)
        .eq('allergen_review', 'confirmed')
    : { count: 0 };

  const itemCount = itemIds.length;
  const pendingCount = Math.max(0, itemCount - (confirmedCount ?? 0));

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

  return (
    <VenueSettingsForm
      initial={initial}
      publish={{
        isPublished: Boolean(venue.is_published),
        publishedAt: venue.published_at ?? null,
        itemCount,
        pendingCount,
      }}
    />
  );
}
