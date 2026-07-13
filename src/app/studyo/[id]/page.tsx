import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { rawResultSchema } from '@/lib/schemas/menu';
import { DraftEditor } from './draft-editor';

export const dynamic = 'force-dynamic';

/**
 * Studyo adım 2: AI taslağını incele ve düzenle.
 * Sunucu tarafında ingestion durumu okunur (RLS: yalnız org üyesi).
 */
export default async function ReviewPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: ingestion } = await supabase
    .from('menu_ingestions')
    .select('id, status, raw_result, error_message, venue_id, org_id')
    .eq('id', params.id)
    .maybeSingle();

  if (!ingestion) notFound();

  if (ingestion.status === 'failed') {
    return (
      <CenteredCard>
        <h1 className="text-xl font-semibold text-red-600">Menü çıkarılamadı</h1>
        <p className="mt-2 text-stone-600">{ingestion.error_message ?? 'Bilinmeyen hata.'}</p>
        <a
          href="/studyo"
          className="mt-4 inline-block rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white"
        >
          Yeni dosyayla tekrar dene
        </a>
      </CenteredCard>
    );
  }

  if (ingestion.status === 'uploaded' || ingestion.status === 'processing') {
    return (
      <CenteredCard>
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
        <h1 className="mt-4 text-xl font-semibold">Yapay zeka menünü okuyor…</h1>
        <p className="mt-2 text-stone-600">Bu sayfa hazır olunca kendini yenileyecek.</p>
        <meta httpEquiv="refresh" content="4" />
      </CenteredCard>
    );
  }

  const raw = rawResultSchema.safeParse(ingestion.raw_result);
  if (!raw.success) {
    return (
      <CenteredCard>
        <h1 className="text-xl font-semibold text-red-600">Taslak verisi bozuk</h1>
        <p className="mt-2 text-stone-600">Lütfen menüyü yeniden yükleyin.</p>
        <a
          href="/studyo"
          className="mt-4 inline-block rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white"
        >
          Studyoya dön
        </a>
      </CenteredCard>
    );
  }

  const { data: venue } = await supabase
    .from('venues')
    .select('currency_code')
    .eq('id', ingestion.venue_id)
    .maybeSingle();

  return (
    <DraftEditor
      ingestionId={ingestion.id}
      venueId={ingestion.venue_id}
      orgId={ingestion.org_id}
      initialCurrency={venue?.currency_code ?? raw.data.extracted.currency_guess ?? 'TRY'}
      initialDraft={raw.data.extracted}
      alreadyApproved={ingestion.status === 'approved'}
    />
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="w-full rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        {children}
      </div>
    </main>
  );
}
