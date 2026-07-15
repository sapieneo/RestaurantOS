'use client';

import { useRef, useState } from 'react';
import type { ExtractedMenu } from '@/lib/schemas/menu';
import { createClient } from '@/lib/supabase/client';
import { CURRENCIES, currencySymbol } from '@/lib/currency';

const ADD_ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const ALLERGEN_LABELS: Record<string, string> = {
  gluten: 'Glüten', crustaceans: 'Kabuklular', eggs: 'Yumurta', fish: 'Balık',
  peanuts: 'Yer fıstığı', soybeans: 'Soya', milk: 'Süt', nuts: 'Kabuklu yemiş',
  celery: 'Kereviz', mustard: 'Hardal', sesame: 'Susam', sulphites: 'Sülfit',
  lupin: 'Lüpen', molluscs: 'Yumuşakça', alcohol: 'Alkol', pork: 'Domuz',
};

type SaveState = { name: 'idle' } | { name: 'saving' } | { name: 'done'; itemCount: number } | { name: 'error'; message: string };

const DEFAULT_VENUE_NAME = 'İşletmem';

/**
 * AI taslağını düzenleme ekranı. Değişiklikler client state'te tutulur,
 * "Onayla ve Kaydet" tek istekte veritabanına yazar (idempotent).
 * Kategori/ürün ekleme, silme ve sıralama (sort_order approve'da dizi
 * sırasından yazılır). Alerjen çipleri M1'de salt-okunur; onay akışı M2'de.
 */
export function DraftEditor({
  ingestionId,
  venueId,
  orgId,
  initialCurrency,
  initialVenueName,
  initialDraft,
  alreadyApproved,
}: {
  ingestionId: string;
  venueId: string;
  orgId: string;
  initialCurrency: string;
  initialVenueName: string | null;
  initialDraft: ExtractedMenu;
  alreadyApproved: boolean;
}) {
  const [draft, setDraft] = useState<ExtractedMenu>(initialDraft);
  const [currency, setCurrency] = useState(initialCurrency);
  // İşletme adı: kullanıcı daha önce ayarladıysa onu, yoksa AI'ın menüden
  // okuduğu adı öner. Varsayılan "İşletmem" = henüz ayarlanmadı say.
  const [venueName, setVenueName] = useState(
    initialVenueName && initialVenueName !== DEFAULT_VENUE_NAME
      ? initialVenueName
      : initialDraft.venue_name_guess ?? ''
  );
  const [save, setSave] = useState<SaveState>({ name: 'idle' });
  const [adding, setAdding] = useState(false);
  const addRef = useRef<HTMLInputElement>(null);

  async function handleAddPages(files: File[]) {
    if (files.length === 0) return;
    setAdding(true);
    setSave({ name: 'idle' });
    try {
      const supabase = createClient();
      const pages: { storagePath: string; mimeType: string; sourceType: 'image' | 'pdf' }[] = [];
      for (const file of files) {
        if (!ADD_ACCEPTED.includes(file.type)) throw new Error('JPG, PNG, WebP veya PDF ekleyin.');
        const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
        const path = `${orgId}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage
          .from('menu-uploads')
          .upload(path, file, { contentType: file.type });
        if (error) throw new Error('Yükleme başarısız. Bağlantınızı kontrol edin.');
        pages.push({
          storagePath: path,
          mimeType: file.type,
          sourceType: file.type === 'application/pdf' ? 'pdf' : 'image',
        });
      }
      const res = await fetch('/api/menu/extract-pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueId, pages }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Sayfa okunamadı.');
      setDraft((d) => ({
        ...d,
        categories: [...d.categories, ...body.categories],
        warnings: [...d.warnings, ...(body.warnings ?? [])],
      }));
    } catch (err) {
      setSave({ name: 'error', message: err instanceof Error ? err.message : 'Sayfa eklenemedi.' });
    } finally {
      setAdding(false);
    }
  }

  const itemCount = draft.categories.reduce((n, c) => n + c.items.length, 0);

  function updateCategory(ci: number, name: string) {
    setDraft((d) => ({
      ...d,
      categories: d.categories.map((c, i) => (i === ci ? { ...c, name } : c)),
    }));
  }

  function addCategory() {
    setDraft((d) => ({
      ...d,
      categories: [...d.categories, { name: 'Yeni kategori', items: [] }],
    }));
  }

  function removeCategory(ci: number) {
    setDraft((d) => ({
      ...d,
      categories: d.categories.filter((_, i) => i !== ci),
    }));
  }

  function moveCategory(ci: number, dir: -1 | 1) {
    setDraft((d) => {
      const j = ci + dir;
      if (j < 0 || j >= d.categories.length) return d;
      const cats = [...d.categories];
      [cats[ci], cats[j]] = [cats[j], cats[ci]];
      return { ...d, categories: cats };
    });
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

  function moveItem(ci: number, ii: number, dir: -1 | 1) {
    setDraft((d) => {
      const items = [...d.categories[ci].items];
      const j = ii + dir;
      if (j < 0 || j >= items.length) return d;
      [items[ii], items[j]] = [items[j], items[ii]];
      return { ...d, categories: d.categories.map((c, i) => (i === ci ? { ...c, items } : c)) };
    });
  }

  function addItem(ci: number) {
    setDraft((d) => ({
      ...d,
      categories: d.categories.map((c, i) =>
        i !== ci ? c : { ...c, items: [...c.items, { name: 'Yeni ürün', description: null, ingredients: null, price: null, calories_kcal: null, allergens: [], dietary: [] }] }
      ),
    }));
  }

  async function approve() {
    setSave({ name: 'saving' });
    try {
      const res = await fetch(`/api/ingest/${ingestionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          menu: draft,
          currencyCode: currency,
          venueName: venueName.trim() || undefined,
        }),
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
            onayı — misafir menüsünde yalnız onayladığın bilgi görünür.
          </p>
          <div className="mt-5 flex flex-col items-center gap-3">
            <a
              href={`/studyo/${ingestionId}/uyum`}
              className="inline-block rounded-xl bg-brand-600 px-6 py-3 font-semibold text-white shadow transition hover:bg-brand-700"
            >
              Alerjenleri onayla →
            </a>
            <a
              href="/studyo/gorseller"
              className="text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              🖼 Ürün görselleri ekle (AI ile üret veya yükle)
            </a>
            <a
              href="/studyo/ayarlar"
              className="text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              ⚙ İşletme bilgilerini düzenle (adres, telefon, saat…)
            </a>
            <a href="/studyo" className="text-sm font-medium text-stone-500 hover:text-stone-700">
              + Başka sayfa ekle
            </a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-brand-600">Adım 2 / 3 · Taslağı düzenle</p>
          <label className="mt-1 block text-xs font-medium text-stone-400">İşletme adı</label>
          <input
            value={venueName}
            onChange={(e) => setVenueName(e.target.value)}
            placeholder="İşletmenizin adı (misafir menüsünde görünür)"
            className="w-full rounded-lg border border-transparent bg-transparent text-2xl font-bold outline-none placeholder:text-stone-300 focus:border-stone-300 focus:bg-white"
            aria-label="İşletme adı"
          />
          <label className="mt-2 block text-xs font-medium text-stone-400">Menü adı</label>
          <input
            value={draft.menu_name}
            onChange={(e) => setDraft((d) => ({ ...d, menu_name: e.target.value }))}
            className="w-full rounded-lg border border-transparent bg-transparent text-lg font-semibold outline-none focus:border-stone-300 focus:bg-white"
            aria-label="Menü adı"
          />
          <p className="text-sm text-stone-500">
            {draft.categories.length} kategori · {itemCount} ürün
          </p>
          <label className="mt-2 flex items-center gap-2 text-sm text-stone-600">
            Para birimi:
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="rounded-lg border border-stone-300 px-2 py-1 outline-none focus:border-brand-500"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.symbol} {c.code} — {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => addRef.current?.click()}
            disabled={adding || save.name === 'saving'}
            className="rounded-xl border border-stone-300 px-4 py-3 font-semibold text-stone-700 transition hover:bg-stone-50 disabled:opacity-50"
          >
            {adding ? 'Okunuyor…' : '+ Sayfa ekle'}
          </button>
          <button
            onClick={approve}
            disabled={save.name === 'saving' || adding || itemCount === 0}
            className="rounded-xl bg-brand-600 px-6 py-3 font-semibold text-white shadow transition hover:bg-brand-700 disabled:opacity-50"
          >
            {save.name === 'saving' ? 'Kaydediliyor…' : alreadyApproved ? 'Yeniden Kaydet' : 'Onayla ve Kaydet'}
          </button>
          <input
            ref={addRef}
            type="file"
            accept={ADD_ACCEPTED.join(',')}
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) void handleAddPages(files);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      {adding && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-300 border-t-brand-600" />
          Yeni sayfalar okunuyor ve menüye ekleniyor…
        </div>
      )}

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
            <div className="flex items-center gap-2">
              <input
                value={cat.name}
                onChange={(e) => updateCategory(ci, e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent text-lg font-semibold outline-none focus:border-stone-300"
                aria-label={`Kategori adı ${ci + 1}`}
              />
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  onClick={() => moveCategory(ci, -1)}
                  disabled={ci === 0}
                  className="rounded-lg px-2 py-1 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 disabled:opacity-30"
                  aria-label="Kategoriyi yukarı taşı"
                  title="Yukarı taşı"
                >
                  ↑
                </button>
                <button
                  onClick={() => moveCategory(ci, 1)}
                  disabled={ci === draft.categories.length - 1}
                  className="rounded-lg px-2 py-1 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 disabled:opacity-30"
                  aria-label="Kategoriyi aşağı taşı"
                  title="Aşağı taşı"
                >
                  ↓
                </button>
                <button
                  onClick={() => removeCategory(ci)}
                  className="rounded-lg px-2 py-1 text-stone-400 transition hover:bg-red-50 hover:text-red-600"
                  aria-label="Kategoriyi sil"
                  title="Kategoriyi sil"
                >
                  🗑
                </button>
              </div>
            </div>
            <ul className="mt-3 divide-y divide-stone-100">
              {cat.items.map((item, ii) => (
                <li key={ii} className="flex flex-col gap-2 py-3">
                  <div className="flex items-start gap-2">
                    <div className="flex shrink-0 flex-col pt-1">
                      <button
                        onClick={() => moveItem(ci, ii, -1)}
                        disabled={ii === 0}
                        className="px-1 text-xs text-stone-400 transition hover:text-stone-700 disabled:opacity-30"
                        aria-label="Ürünü yukarı taşı"
                        title="Yukarı taşı"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => moveItem(ci, ii, 1)}
                        disabled={ii === cat.items.length - 1}
                        className="px-1 text-xs text-stone-400 transition hover:text-stone-700 disabled:opacity-30"
                        aria-label="Ürünü aşağı taşı"
                        title="Aşağı taşı"
                      >
                        ↓
                      </button>
                    </div>
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
                      <textarea
                        value={item.ingredients ?? ''}
                        onChange={(e) => updateItem(ci, ii, { ingredients: e.target.value || null })}
                        placeholder="İçindekiler (virgülle: un, süt, yumurta)"
                        rows={1}
                        className="mt-1 w-full resize-none rounded border border-transparent bg-transparent text-sm text-stone-500 outline-none placeholder:text-stone-300 focus:border-stone-300"
                      />
                    </div>
                    <div className="flex w-32 shrink-0 flex-col gap-1.5">
                      <label className="flex items-center gap-1 rounded-lg border border-stone-200 px-2 focus-within:border-brand-500">
                        <input
                          inputMode="decimal"
                          value={item.price ?? ''}
                          onChange={(e) => {
                            const v = e.target.value.replace(',', '.');
                            updateItem(ci, ii, {
                              price: v === '' ? null : Number.isNaN(Number(v)) ? item.price : Number(v),
                            });
                          }}
                          placeholder="Fiyat"
                          className="w-full bg-transparent py-1 text-right text-sm outline-none"
                          aria-label="Fiyat"
                        />
                        <span className="w-8 shrink-0 text-xs text-stone-400">{currencySymbol(currency)}</span>
                      </label>
                      <label className="flex items-center gap-1 rounded-lg border border-stone-200 px-2 focus-within:border-brand-500">
                        <input
                          inputMode="numeric"
                          value={item.calories_kcal ?? ''}
                          onChange={(e) => {
                            const v = e.target.value.replace(/[^0-9]/g, '');
                            updateItem(ci, ii, { calories_kcal: v === '' ? null : parseInt(v, 10) });
                          }}
                          placeholder="Kalori"
                          className="w-full bg-transparent py-1 text-right text-sm outline-none"
                          aria-label="Kalori"
                        />
                        <span className="w-8 shrink-0 text-xs text-stone-400">kcal</span>
                      </label>
                    </div>
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
                    <div className="flex flex-wrap gap-1.5 pl-7">
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

      <button
        onClick={addCategory}
        className="mt-6 w-full rounded-2xl border-2 border-dashed border-stone-300 py-4 text-sm font-semibold text-stone-500 transition hover:border-brand-400 hover:text-brand-600"
      >
        + Kategori ekle
      </button>

      <p className="mt-6 text-center text-xs text-stone-400">
        Alerjen etiketleri yapay zeka önerisidir; menünde yayınlanmadan önce
        tek tek onaylaman istenecek.
      </p>
    </main>
  );
}
