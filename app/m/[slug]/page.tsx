import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import MenuClient, { MenuItem } from './MenuClient'

interface PageProps {
  params: { slug: string }
}

async function getMenuData(slug: string) {
  const supabase = createServiceClient()

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('id, name, slug, address, phone, website, description, theme, language, plan, is_published')
    .eq('slug', slug)
    .eq('is_published', true)
    .single()

  if (!restaurant) return null

  const { data: rawItems } = await supabase
    .from('menu_items')
    .select(`
      id, name, description, price, category, photo_url, compliance_approved,
      item_allergens(allergen_id, allergens(icon_slug)),
      nutrition_values(kcal, protein_g, fat_g, carb_g, portion_desc)
    `)
    .eq('restaurant_id', restaurant.id)
    .eq('is_active', true)
    .order('category')
    .order('name')

  const items: MenuItem[] = (rawItems ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    price: item.price,
    category: item.category ?? 'Genel',
    photo_url: item.photo_url,
    compliance_approved: item.compliance_approved ?? false,
    allergen_ids: (item.item_allergens ?? []).map(
      (a: { allergen_id: string; allergens: { icon_slug: string } | null }) =>
        a.allergens?.icon_slug ?? a.allergen_id
    ),
    nutrition: item.nutrition_values?.[0] ?? null,
  }))

  const grouped = items.reduce<Record<string, MenuItem[]>>((acc, item) => {
    const cat = item.category || 'Genel'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})

  return { restaurant, grouped }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const data = await getMenuData(params.slug)
  if (!data) return { title: 'Menu bulunamadi' }
  return {
    title: `${data.restaurant.name} - Dijital Menu`,
    description: data.restaurant.description ?? `${data.restaurant.name} dijital menusu.`,
    openGraph: {
      title: `${data.restaurant.name} Menusu`,
      description: '14 alerjen ve kalori bilgisi ile yonetmelik uyumlu dijital menu.',
    },
  }
}

export default async function PublicMenuPage({ params }: PageProps) {
  const data = await getMenuData(params.slug)
  if (!data) notFound()

  return (
    <MenuClient
      restaurant={data!.restaurant as Parameters<typeof MenuClient>[0]['restaurant']}
      grouped={data!.grouped}
    />
  )
}
