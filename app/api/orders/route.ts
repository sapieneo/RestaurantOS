import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { z } from 'zod'

export const runtime = 'nodejs'

const OrderItemSchema = z.object({
  menu_item_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(99),
  unit_price: z.number().min(0),
})

const OrderSchema = z.object({
  restaurant_id: z.string().uuid(),
  table_no: z.string().max(20).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  items: z.array(OrderItemSchema).min(1).max(50),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = OrderSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({
        success: false,
        error: 'Geçersiz sipariş verisi.',
        details: parsed.error.flatten(),
      }, { status: 422 })
    }

    const { restaurant_id, table_no, note, items } = parsed.data
    const supabase = createServiceClient()

    // Restoranın Pro/Chain plan olduğunu doğrula
    const { data: restaurant } = await supabase
      .from('restaurants')
      .select('id, plan, is_published')
      .eq('id', restaurant_id)
      .eq('is_published', true)
      .single()

    if (!restaurant) {
      return NextResponse.json({ success: false, error: 'Restoran bulunamadı.' }, { status: 404 })
    }

    if (!['pro', 'chain'].includes(restaurant.plan)) {
      return NextResponse.json({
        success: false,
        error: 'Sipariş özelliği Pro ve Zincir planlarda kullanılabilir.',
      }, { status: 403 })
    }

    // Toplam tutarı hesapla
    const total_amount = items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0)

    // Sipariş oluştur
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        restaurant_id,
        table_no: table_no ?? null,
        note: note ?? null,
        total_amount,
        status: 'pending',
      })
      .select('id')
      .single()

    if (orderError || !order) {
      console.error('[orders] insert error:', orderError)
      return NextResponse.json({ success: false, error: 'Sipariş oluşturulamadı.' }, { status: 500 })
    }

    // Sipariş kalemlerini ekle
    const orderItems = items.map((item) => ({
      order_id: order.id,
      menu_item_id: item.menu_item_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.unit_price * item.quantity,
    }))

    await supabase.from('order_items').insert(orderItems)

    return NextResponse.json({
      success: true,
      data: {
        order_id: order.id,
        total_amount,
        status: 'pending',
      },
    })
  } catch (err) {
    console.error('[orders]', err)
    return NextResponse.json({ success: false, error: 'Sunucu hatası.' }, { status: 500 })
  }
}

// GET — işletme siparişlerini listele (dashboard için)
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

    const supabase = createServiceClient()
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return NextResponse.json({ success: false, error: 'Geçersiz token.' }, { status: 401 })

    const { data: restaurant } = await supabase
      .from('restaurants')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!restaurant) return NextResponse.json({ success: false, error: 'İşletme bulunamadı.' }, { status: 404 })

    const { data: orders } = await supabase
      .from('orders')
      .select(`
        id, table_no, note, total_amount, status, created_at,
        order_items(quantity, unit_price, menu_item_id,
          menu_items(name))
      `)
      .eq('restaurant_id', restaurant.id)
      .order('created_at', { ascending: false })
      .limit(50)

    return NextResponse.json({ success: true, data: orders ?? [] })
  } catch {
    return NextResponse.json({ success: false, error: 'Sunucu hatası.' }, { status: 500 })
  }
}
