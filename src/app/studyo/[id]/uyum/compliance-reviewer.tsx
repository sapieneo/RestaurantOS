'use client';

import { useMemo, useState } from 'react';
import { ALLERGENS, type AllergenCode } from '@/lib/allergens';
import { DIETARY, type DietaryCode } from '@/lib/dietary';
import { ALLERGEN_CODES, DIETARY_CODES } from '@/lib/schemas/menu';

export type ReviewItem = {
  id: string;
  name: string;
  categoryName: string;
  calories: number | null;
  ingredients: string | null;
  allergenCodes: string[];
  dietaryCodes: string[];
  confirmed: boolean;
  caloriesConfirmed: boolean;
};

type ItemState = ReviewItem & {
  selected: Set<string>;
  selectedDietary: Set<string>;
  saving: boolean;
  error: string | null;
};

/** Mevzuat takvimi — Tarım ve Orman Bakanlığı, menüde 14 alerjen + kalori. */
const REG_MILESTONES = [
  { date: new Date('2026-07-01'), label: 'Ulusal zincirler' },
  { date: new Date('2026-12-31'), label: 'Aynı ilde 3+ şube' },
];

export function ComplianceReviewer({
  ingestionId,
  venueId,
  venueName,
  previewSlug,
  items: initial,
}: {
  ingestionId: string;
  venueId: string;
  venueName: string;
  previewSlug: string | null;
  items: ReviewItem[];
}) {
  const [items, setItems] = useState<ItemState[]>(() =>
    initial.map((it) => ({
      ...it,
      selected: new Set(it.allergenCodes),
      selectedDietary: new Set(it.dietaryCodes),
      saving: false,
      error: null,
    }))
  );

  const confirmedCount = items.filter((i) => i.confirmed).length;
  const total = items.length;
  const pct = total ? Math.round((confirmedCount / total) * 100) : 0;
  const pending = items.filter((i) => !i.confirmed);
  const auditReady = total > 0 && pending.length === 0;

  function patch(id: string, fn: (s: ItemState) => ItemState) {
    setItems((arr) => arr.map((s) => (s.id === id ? fn(s) : s)));
  }

  function toggleAllergen(id: string, code: string) {
    patch(id, (s) => {
      const next = new Set(s.selected);
      next.has(code) ? next.delete(code) : next.add(code);
      return { ...s, selected: next };
    });
  }

  function toggleDietary(id: string, code: string) {
    patch(id, (s) => {
      const next = new Set(s.selectedDietary);
      next.has(code) ? next.delete(code) : next.add(code);
      return { ...s, selectedDietary: next };
    });
  }

  async function confirm(item: ItemState, caloriesOk: boolean) {
    patch(item.id, (s) => ({ ...s, saving: true, error: null }));
    try {
      const res = await fetch('/api/compliance/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: item.id,
          allergenCodes: Array.from(item.selected),
          dietaryCodes: Array.from(item.selectedDietary),
          caloriesOk,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Onay başarısız.');
      patch(item.id, (s) => ({
        ...s,
        confirmed: true,
        caloriesConfirmed: caloriesOk,
        saving: false,
      }));
    } catch (err) {
      patch(item.id, (s) => ({
        ...s,
        saving: false,
        error: err instanceof Error ? err.message : 'Beklenmeyen hata.',
      }));
    }
  }

  async function revert(item: ItemState) {
    patch(item.id, (s) => ({ ...s, saving: true, error: null }));
    try {
      const res = await fetch('/api/compliance/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id, revert: true }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Geri alma başarısız.');
      patch(item.id, (s) => ({ ...s, confirmed: false, caloriesConfirmed: false, saving: false }));
    } catch (err) {
      patch(item.id, (s) => ({
        ...s,
        saving: false,
        error: err instanceof Error ? err.message : 'Beklenmeyen hata.',
      }));
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, ItemState[]>();
    for (const it of items) {
      if (!map.has(it.categoryName)) map.set(it.categoryName, []);
      map.get(it.categoryName)!.push(it);
    }
    return Array.from(map.entries());
  }, [items]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-4">
        <p className="text-sm font-medium text-brand-600">Adım 3 / 3 · Uyum onayı</p>
        <h1 className="mt-1 text-2xl font-bold">{venueName} · Alerjen &amp; kalori onayı</h1>
        <p className="mt-1 text-sm text-stone-500">
          Her ürünün alerjenlerini onayla. Misafir menüsünde <b>yalnızca onayladığın</b> bilgi görünür.
        </p>
      </header>

      {/* İlerleme + denetim durumu */}
      <div className="mb-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Denetime hazırlık</span>
          <span className={auditReady ? 'font-semibold text-emerald-600' : 'text-stone-500'}>
            {confirmedCount} / {total} ürün onaylı
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-stone-100">
          <div
            className={`h-full rounded-full transition-all ${auditReady ? 'bg-emerald-500' : 'bg-brand-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {auditReady ? (
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
              ✓ Menü denetime hazır
            </span>
          ) : (
            <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700">
              {pending.length} ürün henüz incelenmedi
            </span>
          )}
          <a
            href="/studyo/ayarlar"
            className="ml-auto rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
          >
            ⚙ İşletme ayarları
          </a>
          {previewSlug && (
            <a
              href={`/m/${previewSlug}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-brand-300 px-3 py-1.5 text-sm font-medium text-brand-700 transition hover:bg-brand-50"
            >
              👁 Misafir menüsünü önizle
            </a>
          )}
          <a
            href={`/api/compliance/report?venueId=${venueId}`}
            className={`${previewSlug ? '' : 'ml-auto '}rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-stone-50`}
          >
            ⬇ Uyum raporunu indir (PDF)
          </a>
        </div>
      </div>

      {/* Mevzuat takvimi */}
      <div className="mb-6 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        <p className="font-medium">Yönetmelik takvimi — menüde 14 alerjen + kalori zorunluluğu</p>
        <ul className="mt-1 space-y-0.5">
          {REG_MILESTONES.map((m) => {
            const active = new Date() >= m.date;
            return (
              <li key={m.label} className="flex items-center gap-2">
                <span className={active ? 'font-semibold text-emerald-700' : 'text-sky-800'}>
                  {m.date.toLocaleDateString('tr-TR')}
                </span>
                <span>· {m.label}</span>
                {active && <span className="text-xs text-emerald-600">(yürürlükte)</span>}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Eksik incelemeli ürünler kısayolu */}
      {pending.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">İncelenmesi gereken {pending.length} ürün:</p>
          <p className="mt-1">{pending.map((p) => p.name).join(' · ')}</p>
        </div>
      )}

      {/* Ürün listesi */}
      <div className="space-y-6">
        {grouped.map(([cat, catItems]) => (
          <section key={cat} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">{cat}</h2>
            <ul className="mt-2 divide-y divide-stone-100">
              {catItems.map((item: ItemState) => (
                <li key={item.id} className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{item.name}</p>
                      {item.calories != null && (
                        <p className="text-xs text-stone-500">{item.calories} kcal</p>
                      )}
                      {item.ingredients && (
                        <p className="mt-0.5 text-xs text-stone-400">İçindekiler: {item.ingredients}</p>
                      )}
                    </div>
                    {item.confirmed ? (
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                        ✓ Onaylı
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-500">
                        İncelenmedi
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {ALLERGEN_CODES.map((code) => {
                      const on = item.selected.has(code);
                      return (
                        <button
                          key={code}
                          type="button"
                          onClick={() => toggleAllergen(item.id, code)}
                          disabled={item.saving}
                          className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                            on
                              ? 'bg-brand-600 text-white'
                              : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                          }`}
                        >
                          {ALLERGENS[code as AllergenCode].tr}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1.5 text-xs text-stone-400">
                    Seçili = üründe var. Hiçbiri seçili değilse &quot;alerjensiz&quot; olarak onaylanır.
                  </p>

                  <div className="mt-3">
                    <p className="text-xs font-medium text-stone-500">Diyet rozetleri</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {DIETARY_CODES.map((code) => {
                        const on = item.selectedDietary.has(code);
                        return (
                          <button
                            key={code}
                            type="button"
                            onClick={() => toggleDietary(item.id, code)}
                            disabled={item.saving}
                            className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                              on ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                            }`}
                          >
                            {DIETARY[code as DietaryCode].emoji} {DIETARY[code as DietaryCode].tr}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {item.error && (
                    <p className="mt-2 text-xs text-red-600">{item.error}</p>
                  )}

                  <div className="mt-3 flex items-center gap-2">
                    {item.confirmed ? (
                      <button
                        onClick={() => revert(item)}
                        disabled={item.saving}
                        className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-600 transition hover:bg-stone-50 disabled:opacity-50"
                      >
                        {item.saving ? '…' : 'Onayı geri al / düzenle'}
                      </button>
                    ) : (
                      <button
                        onClick={() => confirm(item, item.calories != null)}
                        disabled={item.saving}
                        className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
                      >
                        {item.saving ? 'Onaylanıyor…' : 'Onayla'}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-8 flex justify-between text-sm">
        <a href={`/studyo/${ingestionId}`} className="text-stone-500 hover:text-stone-700">
          ← Taslağa dön
        </a>
        {auditReady && (
          <span className="font-medium text-emerald-600">
            Tüm ürünler onaylandı — yayına hazır (M3).
          </span>
        )}
      </div>
    </main>
  );
}
