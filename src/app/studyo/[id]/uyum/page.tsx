import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { rawResultSchema } from '@/lib/schemas/menu';
import { CODE_BY_ID } from '@/lib/allergens';
import { ComplianceReviewer, type ReviewItem } from './compliance-reviewer';

export const dynamic = 'force-dynamic';

/**
 * Studyo adım 3: Uyum motoru — alerjen & kalori onayı + denetime hazırlık.
 * Onaylanmış menünün ürünlerini yükler; her ürün için AI önerisi ön-işaretli
 * gelir, işletme onaylar. Misafir yalnız onaylanmış alerjeni görecektir.
 */
export default async function CompliancePage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: ingestion } = await supabase
    .from('menu_ingestions')
    .select('id, status, raw_result, venue_id')
    .eq('id', params.id)
    .maybeSingle();
  if (!ingestion) notFound();

  const raw = rawResultSchema.safeParse(ingestion.raw_result);
  const menuId = raw.success ? raw.data.created_menu_id : null;
  if (ingestion.status !== 'approved' || !menuId) {
    return (
      <Centered>
        <h1 className="text-xl font-semibold">Önce menünü onayla</h1>
        <p className="mt-2 text-stone-600">
          Alerjen onayına geçmek için menünü kaydetmen gerekiyor.
        </p>
        <a
          href={`/studyo/${params.id}`}
          className="mt-4 inline-block rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white"
        >
          Taslağa dön
        </a>
      </Centered>
    );
  }

  const { data: venue } = await supabase
    .from('venues')
    .select('id, name')
    .eq('id', ingestion.venue_id)
    .maybeSingle();

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, sort_order')
    .eq('menu_id', menuId)
    .order('sort_order');
  const catIds = (categories ?? []).map((c) => c.id);

  const { data: itemRows } = catIds.length
    ? await supabase
        .from('items')
        .select(
          'id, name, category_id, calories_kcal, allergens_confirmed, sort_order, ' +
            'item_allergens(allergen_id, state), item_compliance(allergen_review, calories_review, reviewed_at)'
        )
        .in('category_id', catIds)
        .order('sort_order')
    : { data: [] as never[] };

  const catName = new Map((categories ?? []).map((c) => [c.id, c.name]));

  const rows = (itemRows ?? []) as unknown as Record<string, unknown>[];
  const items: ReviewItem[] = rows.map((it) => {
    const algRows = (it.item_allergens as { allergen_id: number; state: string }[]) ?? [];
    const compArr = it.item_compliance as
      | { allergen_review: string; calories_review: string; reviewed_at: string | null }[]
      | { allergen_review: string; calories_review: string; reviewed_at: string | null }
      | null;
    const comp = Array.isArray(compArr) ? compArr[0] : compArr;
    return {
      id: it.id as string,
      name: it.name as string,
      categoryName: catName.get(it.category_id as string) ?? '—',
      calories: (it.calories_kcal as number | null) ?? null,
      allergenCodes: algRows
        .map((r) => CODE_BY_ID[r.allergen_id])
        .filter(Boolean) as string[],
      confirmed: Boolean(it.allergens_confirmed),
      caloriesConfirmed: comp?.calories_review === 'confirmed',
    };
  });

  return (
    <ComplianceReviewer
      ingestionId={ingestion.id}
      venueId={ingestion.venue_id}
      venueName={venue?.name ?? 'İşletmem'}
      items={items}
    />
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="w-full rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        {children}
      </div>
    </main>
  );
}
