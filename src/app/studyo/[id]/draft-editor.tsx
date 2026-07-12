'use client';

import { useState } from 'react';
import type { ExtractedMenu } from '@/lib/schemas/menu';

const ALLERGEN_LABELS: Record<string, string> = {
  gluten: 'Glüten', crustaceans: 'Kabuklular', eggs: 'Yumurta', fish: 'Balık',
  peanuts: 'Yer fıstığı', soybeans: 'Soya', milk: 'Süt', nuts: 'Kabuklu yemiş',
  celery: 'Kereviz', mustard: 'Hardal', sesame: 'Susam', sulphites: 'Sülfit',
  lupin: 'Lüpen', molluscs: 'Yumuşakça', alcohol: 'Alkol', pork: 'Domuz',
};

type SaveState = { name: 'idle' } | { name: 'saving' } | { name: 'done'; itemCount: number } | { name: 'error'; message: string };

/**
 * AI taslağını düzenleme ekranı. Değişiklikler client state'te tutulur,
 * "Onayla ve Kaydet" tek istekte veritabanına yazar (idempotent).
 * Alerjen çipleri M1'de salt-okunur bilgidir; onay akışı M2'de gelir.
 */
export function DraftEditor({
  ingestionId,
  initialDraft,
  alreadyApproved,
}: {
  ingestionId: string;
  initialDraft: ExtractedMenu;
  alreadyApproved: boolean;
}) {
  const [draft, setDraft] = useState<ExtractedMenu>(initialDraft);
  const [save, setSave] = useState<SaveState>({ name: 'idle' });

  const itemCount = draft.categories.reduce((n, c) => n + c.items.length, 0);

  function updateCategory(ci: number, name: string) {
    setDraft((d) => ({
      ...d,
      categories: d.categories.map((c, i) => (i === ci ? { ...c, name } : c)),
    }));
  }

  function updateItem(ci: number, ii: number, patch: Partial<ExtractedMenu['categories'][number]['items'][number]>) {
    setDraft((d) => ({
      ...d,
      categories: d.categories.map((c, i) =>
        i !== ci ? c : { ...c, items: c.items.map((it, j) => (j !== ii ? it : { ...it, ...patch })) }
      ),
    }));
  }

  function removeItem(ci: number, ii: number) {
    setDraft((d) => ({
      ...d,
      categories: d.categories.map((c, i) =>
        i !== ci ? c : { ...c, items: c.items.filter((_, j) => j !== ii) }
      ),
    }));
  }

  function addItem(ci: number) {
    setDraft((d) => ({
      ...d,
      categories: d.categories.map((c, i) =>
        i !== ci ? c : { ...c, items: [...c.items, { name: 'Yeni ürün', description: null, price: null, calories_kcal: null, allergens: [] }] }
      ),
    }));
  }

  async function approve() {
    setSave({ name: 'saving' });
    try {
      const res = await fetch(`/api/ingest/${ingestionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ menu: draft }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Kaydetme başarısız.');
      setSave({ name: 'done', itemCount: body.itemCount });
    } catch (err) {
      setSave({ name: 'error', message: err instanceof Error ? err.message : 'Beklenmeyen hata.' });
    }
  }

  if (save.name === 'done') {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <div className="w-full rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
          <span className="text-4xl">🎉</span>
          <h1 className="mt-3 text-xl font-semibold">Menün kaydedildi</h1>
          <p className="mt-2 text-stone-600">
            {save.itemCount} ürün içe aktarıldı. Sıradaki adım: alerjen &amp; kalori
            onayı ve yayınlama (M2-M3&apos;te geliyor).
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-brand-600">Adım 2 / 3 · Taslağı düzenle</p>
          <input
            value={draft.menu_name}
            onChange={(e) => setDraft((d) => ({ ...d, menu_name: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-transparent bg-transparent text-2xl font-bold outline-none focus:border-stone-300 focus:bg-white"
            aria-label="Menü adı"
          />
          <p className="text-sm text-stone-500">
            {draft.categories.length} kategori · {itemCount} ürün
            {draft.currency_guess ? ` · para birimi tahmini: ${draft.currency_guess}` : ''}
          </p>
        </div>
        <button
          onClick={approve}
          disabled={save.name === 'saving' || itemCount === 0}
          className="rounded-xl bg-brand-600 px-6 py-3 font-semibold text-white shadow transition hover:bg-brand-700 disabled:opacity-50"
        >
          {save.name === 'saving' ? 'Kaydediliyor…' : alreadyApproved ? 'Yeniden Kaydet' : 'Onayla ve Kaydet'}
        </button>
      </header>

      {save.name === 'error' && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {save.message}
        </div>
      )}

      {draft.warnings.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">Yapay zekanın notları:</p>
          <ul className="mt-1 list-inside list-disc">
            {draft.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-6">
        {draft.categories.map((cat, ci) => (
          <section key={ci} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <input
              value={cat.name}
              onChange={(e) => updateCategory(ci, e.target.value)}
              className="w-full rounded-lg border border-transparent bg-transparent text-lg font-semibold outline-none focus:border-stone-300"
              aria-label={`Kategori adı ${ci + 1}`}
            />
            <ul className="mt-3 divide-y divide-stone-100">
              {cat.items.map((item, ii) => (
                <li key={ii} className="flex flex-col gap-2 py-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <input
                        value={item.name}
                        onChange={(e) => updateItem(ci, ii, { name: e.target.value })}
                        className="w-full rounded border border-transparent bg-transparent font-medium outline-none focus:border-stone-300"
                        aria-label="Ürün adı"
                      />
                      <textarea
                        value={item.description ?? ''}
                        onChange={(e) => updateItem(ci, ii, { description: e.target.value || null })}
                        placeholder="Açıklama (isteğe bağlı)"
                        rows={1}
                        className="mt-1 w-full resize-none rounded border border-transparent bg-transparent text-sm text-stone-600 outline-none placeholder:text-stone-300 focus:border-stone-300"
                      />
                    </div>
                    <input
                      inputMode="decimal"
                      value={item.price ?? ''}
                      onChange={(e) => {
                        const v = e.target.value.replace(',', '.');
                        updateItem(ci, ii, { price: v === '' ? null : Number.isNaN(Number(v)) ? item.price : Number(v) });
                      }}
                      placeholder="Fiyat"
                      className="w-24 rounded-lg border border-stone-200 px-2 py-1 text-right outline-none focus:border-brand-500"
                      aria-label="Fiyat"
                    />
                    <button
                      onClick={() => removeItem(ci, ii)}
                      className="rounded-lg px-2 py-1 text-stone-400 transition hover:bg-red-50 hover:text-red-600"
                      aria-label="Ürünü sil"
                      title="Ürünü sil"
                    >
                      ✕
                    </button>
                  </div>
                  {item.allergens.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {item.allergens.map((a) => (
                        <span
                          key={a.code}
                          className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600"
                          title={`AI güven: %${Math.round(a.confidence * 100)} — onay M2'de`}
                        >
                          {ALLERGEN_LABELS[a.code] ?? a.code} · %{Math.round(a.confidence * 100)}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <button
              onClick={() => addItem(ci)}
              className="mt-2 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              + Ürün ekle
            </button>
          </section>
        ))}
      </div>

      <p className="mt-6 text-center text-xs text-stone-400">
        Alerjen etiketleri yapay zeka önerisidir; menünde yayınlanmadan önce
        tek tek onaylaman istenecek.
      </p>
    </main>
  );
}
