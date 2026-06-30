import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { z } from 'zod'

export const runtime = 'nodejs'
export const maxDuration = 30

const NutritionSchema = z.object({
  kcal: z.number().nullable().optional(),
  protein_g: z.number().nullable().optional(),
  fat_g: z.number().nullable().optional(),
  carb_g: z.number().nullable().optional(),
  portion_desc: z.string().nullable().optional(),
  ai_suggested: z.boolean().optional(),
  confirmed_at: z.string().optional(),
}).optional()

const ItemSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  price: z.number().nullable().optional(),
  category: z.string().default('Genel'),
  photo_url: z.string().nullable().optional(),
  allergen_ids: z.array(z.string()).default([]),
  nutrition: NutritionSchema,
  compliance_approved: z.boolean().default(false),
  compliance_approved_at: z.string().optional(),
})

const PublishSchema = z.object({
  restaurantInfo: z.object({
    name: z.string().min(1),
    address: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    website: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
  }),
  items: z.array(ItemSchema).min(1).max(500),
  theme: z.string().default('classic'),
  language: z.enum(['tr', 'tr_en', 'en']).default('tr'),
  userId: z.string().optional(),
})

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^\x00-\x7F]/g, (c) => {
      const map: Record<string, string> = {
        'ğ': 'g', 'ü': 'u', 'ş': 's',
        'ı': 'i', 'ö': 'o', 'ç': 'c',
        'Ğ': 'G', 'Ü': 'U', 'Ş': 'S',
        'İ': 'I', 'Ö': 'O', 'Ç': 'C',
      }
      return map[c] ?? ''
    })
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
  const suffix = Math.random().toString(36).slice(2, 7)
  return `${base}-${suffix}`
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')

    const body = await req.json()
    const parsed = PublishSchema.safeParse(body)
    if (!parsed.success) {
      console.error('[publish] validation error:', JSON.stringify(parsed.error.flatten()))
      return NextResponse.json({
        success: false,
        error: 'Gecersiz veri.',
        details: parsed.error.flatten(),
      }, { status: 422 })
    }

    const { restaurantInfo, items, theme, language, userId: bodyUserId } = parsed.data
    const supabase = createServiceClient()

    // Kullanici tespiti: once JWT token dene, sonra body'deki userId
    let userId: string | null = null

    if (token && token.length > 20 && !token.startsWith('guest')) {
      const { data: { user } } = await supabase.auth.getUser(token)
      if (user) userId = user.id
    }

    if (!userId && bodyUserId && !bodyUserId.startsWith('guest')) {
      // Supabase'de bu user var mi kontrol et
      const { data: { user } } = await supabase.auth.admin.getUserById(bodyUserId)
      if (user) userId = user.id
    }

    // Guest mod: userId null olarak devam et (user_id nullable)
    // userId null kalabilir

    const slug = generateSlug(restaurantInfo.name)

    // 1. Restaurant: bul veya olustur
    let existing: { id: string; slug: string } | null = null
    if (userId) {
      const { data: ex } = await supabase
        .from('restaurants')
        .select('id, slug')
        .eq('user_id', userId)
        .single()
      existing = ex ?? null
    }

    let restaurant: { id: string; slug: string } | null = null

    if (existing) {
      // Guncelle
      const { data: updated, error: updateError } = await supabase
        .from('restaurants')
        .update({
          name: restaurantInfo.name,
          address: restaurantInfo.address ?? null,
          phone: restaurantInfo.phone ?? null,
          website: restaurantInfo.website ?? null,
          description: restaurantInfo.description ?? null,
          theme,
          language,
          is_published: true,
          published_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select('id, slug')
        .single()
      if (updateError || !updated) {
        console.error('[publish] restaurant update error:', updateError)
        return NextResponse.json({ success: false, error: 'Isletme guncellenemedi.' }, { status: 500 })
      }
      restaurant = updated
    } else {
      // Yeni kayit
      const { data: inserted, error: insertError } = await supabase
        .from('restaurants')
        .insert({
          user_id: userId,
          name: restaurantInfo.name,
          slug,
          address: restaurantInfo.address ?? null,
          phone: restaurantInfo.phone ?? null,
          website: restaurantInfo.website ?? null,
          description: restaurantInfo.description ?? null,
          theme,
          language,
          is_published: true,
          published_at: new Date().toISOString(),
        })
        .select('id, slug')
        .single()
      if (insertError || !inserted) {
        console.error('[publish] restaurant insert error:', insertError)
        return NextResponse.json({ success: false, error: 'Isletme kaydedilemedi.' }, { status: 500 })
      }
      restaurant = inserted
    }

    const restaurantId = restaurant.id

    // 2. Mevcut menu_items deactivate
    await supabase
      .from('menu_items')
      .update({ is_active: false })
      .eq('restaurant_id', restaurantId)

    // 3. Yeni menu_items ekle
    const menuItemsToInsert = items.map((item) => ({
      restaurant_id: restaurantId,
      name: item.name,
      description: item.description ?? null,
      price: item.price ?? null,
      category: item.category,
      photo_url: item.photo_url ?? null,
      is_active: true,
      compliance_approved: item.compliance_approved,
      compliance_approved_at: item.compliance_approved_at ?? null,
    }))

    const { data: insertedItems, error: itemsError } = await supabase
      .from('menu_items')
      .insert(menuItemsToInsert)
      .select('id')

    if (itemsError || !insertedItems) {
      console.error('[publish] items insert error:', itemsError)
      return NextResponse.json({ success: false, error: 'Menu ogeleri kaydedilemedi.' }, { status: 500 })
    }

    // 4. Allergen iliskileri -- allergen_ids artik slug, UUID'ye cevir
    const { data: allergens } = await supabase
      .from('allergens')
      .select('id, icon_slug')

    const slugToId = new Map((allergens ?? []).map((a) => [a.icon_slug, a.id]))

    const allergenRelations: { menu_item_id: string; allergen_id: string; ai_suggested: boolean }[] = []
    insertedItems.forEach((dbItem, i) => {
      const sourceItem = items[i]
      sourceItem.allergen_ids.forEach((slugOrId) => {
        // slug veya direct id olabilir
        const allergenId = slugToId.get(slugOrId) ?? slugOrId
        if (allergenId && allergenId.length === 36) {
          allergenRelations.push({ menu_item_id: dbItem.id, allergen_id: allergenId, ai_suggested: true })
        }
      })
    })

    if (allergenRelations.length > 0) {
      await supabase.from('item_allergens').insert(allergenRelations)
    }

    // 5. Nutrition ekle
    const nutritionToInsert = insertedItems
      .map((dbItem, i) => {
        const n = items[i].nutrition
        if (!n?.kcal) return null
        return {
          menu_item_id: dbItem.id,
          kcal: n.kcal,
          protein_g: n.protein_g ?? null,
          fat_g: n.fat_g ?? null,
          carb_g: n.carb_g ?? null,
          portion_desc: n.portion_desc ?? null,
          ai_suggested: n.ai_suggested ?? true,
          confirmed_at: n.confirmed_at ?? new Date().toISOString(),
        }
      })
      .filter((n): n is NonNullable<typeof n> => n !== null)

    if (nutritionToInsert.length > 0) {
      await supabase.from('nutrition_values').insert(nutritionToInsert)
    }

    // 6. Compliance log
    try {
      await supabase.from('compliance_log').insert({
        restaurant_id: restaurantId,
        user_id: userId,
        action: 'publish',
        items_count: items.length,
        approved_count: items.filter(i => i.compliance_approved).length,
        notes: `Menu yayinlandi: ${items.length} urun, tema: ${theme}`,
      })
    } catch { /* compliance_log tablosu yoksa devam et */ }

    const appUrl = process.env.APP_URL ?? `https://app.restaurantos.app`

    return NextResponse.json({
      success: true,
      data: {
        restaurantId,
        slug: restaurant.slug,
        menuUrl: `${appUrl}/m/${restaurant.slug}`,
        itemsPublished: insertedItems.length,
      },
    })

  } catch (err) {
    console.error('[publish]', err)
    return NextResponse.json({ success: false, error: 'Sunucu hatasi.' }, { status: 500 })
  }
}
