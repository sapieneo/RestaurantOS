'use client';

import { useState } from 'react';

export type QrRow = {
  id: string;
  code: string;
  label: string | null;
  is_active: boolean;
  created_at: string;
};

type Props = {
  venueId: string;
  venueName: string;
  venueSlug: string;
  isPublished: boolean;
  initial: QrRow[];
};

export function QrManager({ venueId, venueName, venueSlug, isPublished, initial }: Props) {
  const [rows, setRows] = useState<QrRow[]>(initial);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueId, label: label.trim() || null }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Oluşturulamadı.');
      setRows((s) => [...s, body.qr as QrRow]);
      setLabel('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Beklenmeyen hata.');
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, payload: { label?: string | null; isActive?: boolean }) {
    setError(null);
    const prev = rows;
    // İyimser güncelleme — hata olursa geri alınır.
    setRows((s) =>
      s.map((r) =>
        r.id === id
          ? {
              ...r,
              label: payload.label !== undefined ? payload.label : r.label,
              is_active: payload.isActive !== undefined ? payload.isActive : r.is_active,
            }
          : r
      )
    );
    try {
      const res = await fetch('/api/qr', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...payload }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Güncellenemedi.');
      setRows((s) => s.map((r) => (r.id === id ? (body.qr as QrRow) : r)));
    } catch (err) {
      setRows(prev);
      setError(err instanceof Error ? err.message : 'Beklenmeyen hata.');
    }
  }

  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6">
        <p className="text-sm font-medium text-brand-600">QR kodları</p>
        <h1 className="mt-1 text-2xl font-bold">{venueName}</h1>
        <p className="mt-1 text-sm text-stone-500">
          QR kodları kalıcıdır. Menü adresini (<code className="rounded bg-stone-100 px-1">{venueSlug}</code>)
          sonradan değiştirsen bile basılı QR çalışmaya devam eder.
        </p>
      </header>

      {!isPublished && (
        <p className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Menü henüz yayında değil. QR'ı şimdi bastırabilirsin ama misafirler menüyü yayınlayana kadar
          göremez.{' '}
          <a href="/studyo/ayarlar" className="font-semibold underline">
            Ayarlardan yayınla
          </a>
        </p>
      )}

      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-stone-400">Yeni kod</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[200px] flex-1">
            <span className="mb-1 block text-sm font-medium text-stone-600">Etiket (opsiyonel)</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Örn. Masa 4 · Vitrin · Paket servis"
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </label>
          <button
            onClick={create}
            disabled={busy}
            className="rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white shadow transition hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? 'Oluşturuluyor…' : '+ QR oluştur'}
          </button>
        </div>
        <p className="mt-2 text-xs text-stone-500">
          Her masaya ayrı kod verirsen ileride hangi masanın ne kadar tarandığını görebilirsin.
        </p>
      </section>

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <section className="mt-6 space-y-3">
        {rows.length === 0 && (
          <p className="rounded-2xl border border-dashed border-stone-300 px-4 py-8 text-center text-sm text-stone-500">
            Henüz QR kodun yok. Yukarıdan ilk kodunu oluştur.
          </p>
        )}

        {rows.map((r) => (
          <article
            key={r.id}
            className={`rounded-2xl border bg-white p-4 shadow-sm ${
              r.is_active ? 'border-stone-200' : 'border-stone-200 bg-stone-50 opacity-70'
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <code className="rounded bg-stone-100 px-2 py-0.5 font-mono text-sm font-semibold">
                    {r.code}
                  </code>
                  {r.is_active ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      Aktif
                    </span>
                  ) : (
                    <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-600">
                      Devre dışı
                    </span>
                  )}
                </div>
                <input
                  defaultValue={r.label ?? ''}
                  onBlur={(e) => {
                    const next = e.target.value.trim() || null;
                    if (next !== r.label) patch(r.id, { label: next });
                  }}
                  placeholder="Etiket ekle…"
                  className="mt-2 w-full rounded border border-transparent px-1 py-0.5 text-sm text-stone-600 outline-none hover:border-stone-200 focus:border-brand-500"
                />
                <p className="mt-1 truncate text-xs text-stone-400">
                  {origin}/q/{r.code}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={`/api/qr/${r.code}?format=png`}
                  className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
                >
                  PNG
                </a>
                <a
                  href={`/api/qr/${r.code}?format=pdf`}
                  className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
                >
                  Baskı PDF
                </a>
                <button
                  onClick={() => patch(r.id, { isActive: !r.is_active })}
                  className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-600 transition hover:bg-stone-50"
                >
                  {r.is_active ? 'Devre dışı bırak' : 'Yeniden aktifleştir'}
                </button>
              </div>
            </div>
          </article>
        ))}
      </section>

      <p className="mt-6 text-xs text-stone-500">
        QR kodları silinmez — basılı materyal ortada olabilir. Devre dışı bıraktığın kod, okutulduğunda
        misafire bilgilendirme sayfası gösterir.
      </p>
    </main>
  );
}
