import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import MenuClient from './MenuClient'
import type { PublicMenuItem, PublicRestaurant } from './MenuClient'

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
      id, name, description, price, category, photo_url,
      compliance_approved, declarations_confirmed_at,
      meat_type, contains_alcohol, contains_pork,
      item_allergens(allergen_id, allergens(icon_slug, sort_order)),
      nutrition_values(kcal, protein_g, fat_g, carb_g, portion_g, portion_desc),
      ingredients(name, sort_order)
    `)
    .eq('restaurant_id', restaurant.id)
    .eq('is_active', true)
    .order('category')
    .order('name')

  const items: PublicMenuItem[] = (rawItems ?? []).map((item) => {
    // Sadece ONAYLANMIŞ bilgileri göster — AI tahminleri public menüye çıkmaz
    const isConfirmed = !!item.declarations_confirmed_at

    return {
      id: item.id,
      name: item.name,
      description: item.description,
      price: item.price,
      category: item.category ?? 'Genel',
      photo_url: item.photo_url,
      compliance_approved: item.compliance_approved ?? false,
      declarations_confirmed: isConfirmed,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      allergen_ids: (item.item_allergens ?? []).map((a: any) => {
        const al = a.allergens
        const slug = Array.isArray(al) ? al[0]?.icon_slug : al?.icon_slug
        return slug ?? a.allergen_id
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      allergen_numbers: (item.item_allergens ?? []).map((a: any) => {
        const al = a.allergens
        return Array.isArray(al) ? al[0]?.sort_order : al?.sort_order
      }).filter(Boolean).sort((a: number, b: number) => a - b),
      nutrition: item.nutrition_values?.[0] ?? null,
      // Yeni alanlar — sadece onaylıysa göster
      meat_type: isConfirmed ? item.meat_type : null,
      contains_alcohol: isConfirmed ? item.contains_alcohol : null,
      contains_pork: isConfirmed ? item.contains_pork : null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ingredients: isConfirmed
        ? (item.ingredients ?? [])
            .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
            .map((i: any) => i.name)
        : [],
    }
  })

  const grouped = items.reduce<Record<string, PublicMenuItem[]>>((acc, item) => {
    const cat = item.category || 'Genel'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})

  return { restaurant, grouped }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const data = await getMenuData(params.slug)
  if (!data) return { title: 'Menü bulunamadı' }
  return {
    title: `${data.restaurant.name} - Dijital Menü`,
    description: data.restaurant.description ?? `${data.restaurant.name} dijital menüsü.`,
    openGraph: {
      title: `${data.restaurant.name} Menüsü`,
      description: 'Alerjen, kalori ve içerik bilgisi ile yönetmelik uyumlu dijital menü.',
    },
  }
}

export default async function PublicMenuPage({ params }: PageProps) {
  const data = await getMenuData(params.slug)
  if (!data) notFound()

  return (
    <MenuClient
      restaurant={data.restaurant as PublicRestaurant}
      grouped={data.grouped}
    />
  )
}
