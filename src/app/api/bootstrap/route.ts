import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * POST /api/bootstrap
 * Oturumdaki kullanıcı (anonim dahil) için org + venue taslağını hazırlar.
 * İdempotent: mevcutsa yeniden oluşturmaz, mevcut kimliklerini döner.
 * Tüm insert'ler kullanıcı JWT'siyle yapılır — RLS devrede.
 */
export async function POST() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Oturum bulunamadı.' }, { status: 401 });
  }

  // Mevcut üyelik var mı?
  const { data: membership, error: memErr } = await supabase
    .from('organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  if (memErr) {
    return NextResponse.json({ error: 'Üyelik sorgusu başarısız.' }, { status: 500 });
  }

  let orgId = membership?.org_id as string | undefined;

  if (!orgId) {
    const { data: org, error: orgErr } = await supabase
      .from('organizations')
      .insert({ name: 'İşletmem' })
      .select('id')
      .single();
    if (orgErr || !org) {
      return NextResponse.json({ error: 'İşletme kaydı oluşturulamadı.' }, { status: 500 });
    }
    orgId = org.id;
  }

  // Org'un ilk venue'su var mı?
  const { data: venue } = await supabase
    .from('venues')
    .select('id, slug, name')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (venue) {
    return NextResponse.json({ orgId, venueId: venue.id, slug: venue.slug });
  }

  // Benzersiz taslak slug: isletme-x7k2p9q4 (çakışırsa 3 deneme)
  for (let attempt = 0; attempt < 3; attempt++) {
    const suffix = Math.random().toString(36).slice(2, 10);
    const { data: created, error: venueErr } = await supabase
      .from('venues')
      .insert({ org_id: orgId, slug: `isletme-${suffix}`, name: 'İşletmem' })
      .select('id, slug')
      .single();
    if (created) {
      return NextResponse.json({ orgId, venueId: created.id, slug: created.slug });
    }
    // 23505 = unique_violation → yeni slug dene; başka hata → çık
    if (venueErr && venueErr.code !== '23505') {
      return NextResponse.json({ error: 'Mekân kaydı oluşturulamadı.' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Mekân kaydı oluşturulamadı.' }, { status: 500 });
}
