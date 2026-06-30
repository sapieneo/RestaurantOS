import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('allergens')
    .select('id, icon_slug, name_tr')
    .order('sort_order')

  if (error || !data) {
    return NextResponse.json({ success: false, error: 'Alerjenler yuklenemedi.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}
