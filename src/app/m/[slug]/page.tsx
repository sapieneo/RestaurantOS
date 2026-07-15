import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { CODE_BY_ID } from '@/lib/allergens';
import { DIETARY_CODE_BY_ID } from '@/lib/dietary';
import { GuestMenu, type GuestCategory, type GuestVenue } from './guest-menu';

export const dynamic = 'force-dynamic';

/**
 * Misafir menüsü (M3 / A9).
 * QR/link ile açılan herkese açık menü ekranı. Yayınlanmış venue'yu anonim
 * misafir de görür (RLS); yayınlanmamışsa yalnız org üyesi (önizleme) görür.
 *
 * Uyum ilkesi: alerjen ve diyet rozetleri YALNIZCA 'confirmed' durumundaysa
 * gösterilir. RLS anonimde bunu zaten zorlar; org üyesi önizlemede de misafir
 * görünümüyle birebir olsun diye burada da 'confirmed' filtresi uygulanır.
 */

type AllergenRow = { allergen_id: number; state: string };
type DietaryRow = { tag_id: number; state: string };

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const supabase = createClient();
  const { data: venue } = await supabase
    .from('venues')
    .select('name, description')
    .eq('slug', params.slug)
    .maybeSingle();
  if (!venue) return { title: 'Menü bulunamadı' };
  return {
    title: `${venue.name} — Menü`,
    description: venue.description ?? `${venue.name} dijital menüsü.`,
  };
}

export default async function GuestMenuPage({ params }: { params: { slug: string } }) {
  const supabase = createClient();

  const { data: venue } = await supabase
    .from('venues')
    .select('id, name, description, logo_url, cover_url, currency_code, is_published, address, phone, whatsapp, instagram, google_maps_url, wifi_ssid, opening_hours')
    .eq('slug', params.slug)
    .maybeSingle();

  if (!venue) notFound();

  // Venue'nun aktif menü(leri) → tek menü modeli olsa da genel davranıyoruz.
  const { data: menus } = await supabase
    .from('menus')
    .select('id, sort_order')
    .eq('venue_id', venue.id)
    .eq('is_active', true)
    .order('sort_order');
  const menuIds = (menus ?? []).map((m) => m.id);

  const { data: categories } = menuIds.length
    ? await supabase
        .from('categories')
        .select('id, name, sort_order, background_url')
        .in('menu_id', menuIds)
        .eq('is_active', true)
        .order('sort_order')
    : { data: [] as { id: string; name: string; sort_order: number; background_url: string | null }[] };
  const catIds = (categories ?? []).map((c) => c.id);

  const { data: itemRows } = catIds.length
    ? await supabase
        .from('items')
        .select(
          'id, name, description, ingredients, price, image_url, calories_kcal, ' +
            'category_id, sort_order, item_allergens(allergen_id, state), ' +
            'item_dietary(tag_id, state)'
        )
        .in('category_id', catIds)
        .eq('is_available', true)
        .order('sort_order')
    : { data: [] as Record<string, unknown>[] };

  const rows = (itemRows ?? []) as unknown as Record<string, unknown>[];

  // Ürünleri kategoriye grupla
  const byCat = new Map<string, GuestCategory['items']>();
  for (const it of rows) {
    const catId = it.category_id as string;
    const alg = ((it.item_allergens as AllergenRow[]) ?? [])
      .filter((r) => r.state === 'confirmed')
      .map((r) => CODE_BY_ID[r.allergen_id])
      .filter(Boolean) as string[];
    const diet = ((it.item_dietary as DietaryRow[]) ?? [])
      .filter((r) => r.state === 'confirmed')
      .map((r) => DIETARY_CODE_BY_ID[r.tag_id])
      .filter(Boolean) as string[];
    const priceRaw = it.price as number | string | null;
    const list = byCat.get(catId) ?? [];
    list.push({
      id: it.id as string,
      name: it.name as string,
      description: (it.description as string | null) ?? null,
      ingredients: (it.ingredients as string | null) ?? null,
      price: priceRaw == null ? null : Number(priceRaw),
      calories: (it.calories_kcal as number | null) ?? null,
      imageUrl: (it.image_url as string | null) ?? null,
      allergenCodes: alg,
      dietaryCodes: diet,
    });
    byCat.set(catId, list);
  }

  const guestCategories: GuestCategory[] = (categories ?? [])
    .map((c) => ({
      id: c.id,
      name: c.name,
      backgroundUrl: c.background_url ?? null,
      items: byCat.get(c.id) ?? [],
    }))
    .filter((c) => c.items.length > 0);

  const guestVenue: GuestVenue = {
    name: venue.name,
    description: venue.description ?? null,
    logoUrl: venue.logo_url ?? null,
    coverUrl: venue.cover_url ?? null,
    currency: venue.currency_code ?? 'TRY',
    address: venue.address ?? null,
    phone: venue.phone ?? null,
    whatsapp: venue.whatsapp ?? null,
    instagram: venue.instagram ?? null,
    googleMapsUrl: venue.google_maps_url ?? null,
    wifiSsid: venue.wifi_ssid ?? null,
    openingHours: venue.opening_hours ?? null,
    isPublished: Boolean(venue.is_published),
  };

  return <GuestMenu venue={guestVenue} categories={guestCategories} />;
}
