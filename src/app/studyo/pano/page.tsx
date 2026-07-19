import { createClient } from '@/lib/supabase/server';
import { Dashboard, type DashboardData, type DayBucket } from './dashboard';

export const dynamic = 'force-dynamic';

/**
 * Studyo panosu (Faz B5). B1–B4'te ürettiğimiz her şeyi tek ekranda toplar:
 * yayın durumu, QR, uyum, hesap ve son 30 günün çerezsiz tarama analitiği.
 * Tüm okumalar user-client + RLS ile (org üyesi kendi verisini görür).
 */
export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-xl font-semibold">Oturum bulunamadı</h1>
        <a href="/studyo" className="mt-2 rounded-xl bg-brand-600 px-6 py-3 font-semibold text-white shadow">
          Studyoya git
        </a>
      </main>
    );
  }

  const isAnonymous = (user as { is_anonymous?: boolean }).is_anonymous ?? !user.email;

  const { data: venue } = await supabase
    .from('venues')
    .select('id, org_id, slug, name, is_published, published_at')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!venue) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-xl font-semibold">Henüz menün yok</h1>
        <p className="text-stone-600">Önce bir menü oluştur; panon burada belirir.</p>
        <a href="/studyo" className="mt-2 rounded-xl bg-brand-600 px-6 py-3 font-semibold text-white shadow">
          Menü oluştur
        </a>
      </main>
    );
  }

  // --- Ürün + bekleyen alerjen onayı sayısı (ayarlar ekranıyla aynı mantık) ---
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
  const itemCount = itemIds.length;

  const { count: confirmedCount } = itemIds.length
    ? await supabase
        .from('item_compliance')
        .select('item_id', { count: 'exact', head: true })
        .in('item_id', itemIds)
        .eq('allergen_review', 'confirmed')
    : { count: 0 };
  const pendingCount = Math.max(0, itemCount - (confirmedCount ?? 0));

  // --- QR sayısı ---
  const { count: qrActive } = await supabase
    .from('qr_codes')
    .select('id', { count: 'exact', head: true })
    .eq('venue_id', venue.id)
    .eq('is_active', true);

  // --- Son 30 gün tarama olayları ---
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const { data: events } = await supabase
    .from('scan_events')
    .select('event_type, occurred_at, session_key')
    .eq('venue_id', venue.id)
    .gte('occurred_at', since.toISOString())
    .order('occurred_at', { ascending: true });

  const rows = (events ?? []) as { event_type: string; occurred_at: string; session_key: string | null }[];

  let scans = 0;
  let menuViews = 0;
  let itemViews = 0;
  const uniq = new Set<string>();
  // Günlük kova: son 30 gün, yerel tarihe göre (Europe/Istanbul yaklaşık).
  const days: DayBucket[] = [];
  const dayIndex = new Map<string, number>();
  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    dayIndex.set(key, days.length);
    days.push({ date: key, scans: 0, views: 0 });
  }

  for (const e of rows) {
    if (e.event_type === 'scan') scans += 1;
    else if (e.event_type === 'menu_view') menuViews += 1;
    else if (e.event_type === 'item_view') itemViews += 1;
    if (e.session_key) uniq.add(e.session_key);
    const key = e.occurred_at.slice(0, 10);
    const idx = dayIndex.get(key);
    if (idx != null) {
      if (e.event_type === 'scan') days[idx]!.scans += 1;
      if (e.event_type === 'menu_view') days[idx]!.views += 1;
    }
  }

  const data: DashboardData = {
    venueName: venue.name,
    slug: venue.slug,
    isPublished: Boolean(venue.is_published),
    publishedAt: venue.published_at ?? null,
    isAnonymous,
    itemCount,
    pendingCount,
    qrActive: qrActive ?? 0,
    stats: {
      scans,
      menuViews,
      itemViews,
      uniqueVisitors: uniq.size,
      totalEvents: rows.length,
    },
    days,
  };

  return <Dashboard data={data} />;
}
