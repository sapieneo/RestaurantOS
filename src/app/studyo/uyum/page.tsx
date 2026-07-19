import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * /studyo/uyum — kanonik uyum ekranı girişi.
 *
 * Asıl uyum ekranı taslağa özeldir (`/studyo/{ingestionId}/uyum`), ama pano ve
 * ayarlar bu id'yi bilmez. Burada kullanıcının en son ONAYLANMIŞ menü
 * çıkarımını bulup oraya yönlendiriyoruz. Böylece tüm "Uyum ekranı" bağları
 * tek sabit adrese işaret edebilir.
 */
export default async function ComplianceEntryPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/studyo');

  const { data: venue } = await supabase
    .from('venues')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!venue) redirect('/studyo');

  // En son onaylanmış çıkarım → onun uyum ekranı.
  const { data: ingestion } = await supabase
    .from('menu_ingestions')
    .select('id')
    .eq('venue_id', venue.id)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (ingestion) redirect(`/studyo/${ingestion.id}/uyum`);

  // Onaylı menü yoksa: önce menüyü oluştur/onayla.
  redirect('/studyo');
}
