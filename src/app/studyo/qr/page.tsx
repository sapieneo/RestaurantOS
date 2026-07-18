import { createClient } from '@/lib/supabase/server';
import { QrManager, type QrRow } from './qr-manager';

export const dynamic = 'force-dynamic';

/**
 * QR yönetimi (Faz B2). Kodlar kalıcıdır: basılan QR'ın hedefi değişebilir
 * ama kodun kendisi asla değişmez, silinmez — yalnız devre dışı bırakılır.
 */
export default async function QrPage() {
  const supabase = createClient();
  const { data: venue } = await supabase
    .from('venues')
    .select('id, slug, name, is_published')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!venue) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-xl font-semibold">Henüz işletmen yok</h1>
        <p className="text-stone-600">Önce bir menü oluştur; QR kodunu sonra buradan üretebilirsin.</p>
        <a
          href="/studyo"
          className="mt-2 inline-block rounded-xl bg-brand-600 px-6 py-3 font-semibold text-white shadow"
        >
          Menü oluştur
        </a>
      </main>
    );
  }

  const { data: codes } = await supabase
    .from('qr_codes')
    .select('id, code, label, is_active, created_at')
    .eq('venue_id', venue.id)
    .order('created_at', { ascending: true });

  return (
    <QrManager
      venueId={venue.id}
      venueName={venue.name}
      venueSlug={venue.slug}
      isPublished={Boolean(venue.is_published)}
      initial={(codes ?? []) as QrRow[]}
    />
  );
}
