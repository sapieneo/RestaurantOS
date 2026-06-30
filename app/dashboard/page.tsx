import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import DashboardClient from './DashboardClient'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/studyo')

  const service = createServiceClient()

  // İşletme bilgileri
  const { data: restaurant } = await service
    .from('restaurants')
    .select('id, name, slug, plan, is_published, published_at, theme')
    .eq('user_id', user.id)
    .single()

  if (!restaurant) redirect('/studyo')

  // Menü istatistikleri
  const { count: itemCount } = await service
    .from('menu_items')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', restaurant.id)
    .eq('is_active', true)

  const { count: approvedCount } = await service
    .from('menu_items')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', restaurant.id)
    .eq('is_active', true)
    .eq('compliance_approved', true)

  // Son 7 günlük QR tarama sayısı (analytics_events)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { count: scanCount } = await service
    .from('analytics_events')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', restaurant.id)
    .eq('event_type', 'menu_view')
    .gte('created_at', sevenDaysAgo)

  const menuUrl = `${process.env.NEXT_PUBLIC_APP_URL}/m/${restaurant.slug}`
  const complianceScore = itemCount && itemCount > 0
    ? Math.round(((approvedCount ?? 0) / itemCount) * 100)
    : 0

  return (
    <DashboardClient
      restaurant={restaurant}
      stats={{
        itemCount: itemCount ?? 0,
        approvedCount: approvedCount ?? 0,
        scanCount: scanCount ?? 0,
        complianceScore,
      }}
      menuUrl={menuUrl}
    />
  )
}
