import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { z } from 'zod'

export const runtime = 'nodejs'

const Schema = z.object({
  restaurant_id: z.string().uuid(),
  event_type: z.enum(['menu_view', 'item_view', 'order_start', 'order_complete']),
  item_id: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = Schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ success: false }, { status: 400 })
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? null
    const ua = req.headers.get('user-agent') ?? null

    const supabase = createServiceClient()
    await supabase.from('analytics_events').insert({
      restaurant_id: parsed.data.restaurant_id,
      event_type:    parsed.data.event_type,
      item_id:       parsed.data.item_id ?? null,
      ip_address:    ip,
      user_agent:    ua,
      metadata:      parsed.data.metadata ?? {},
    })

    return NextResponse.json({ success: true })
  } catch {
    // Analytics hatası sessizce geç — kullanıcı deneyimini bozma
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
