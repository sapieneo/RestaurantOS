'use client';

import { useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export type ImgItem = { id: string; name: string; imageUrl: string | null };
export type ImgCategory = { id: string; name: string; items: ImgItem[] };

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 10 * 1024 * 1024;

type Busy = 'gen' | 'upload' | 'remove' | null;

export function ImageManager({
  orgId,
  slug,
  categories,
}: {
  orgId: string;
  slug: string;
  categories: ImgCategory[];
}) {
  const [cats, setCats] = useState<ImgCategory[]>(categories);
  const [busy, setBusy] = useState<Record<string, Busy>>({});
  const [err, setErr] = useState<Record<string, string | null>>({});
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const total = cats.reduce((n, c) => n + c.items.length, 0);
  const withImage = cats.reduce((n, c) => n + c.items.filter((i) => i.imageUrl).length, 0);

  function setItemUrl(itemId: string, url: string | null) {
    setCats((cs) =>
      cs.map((c) => ({
        ...c,
        items: c.items.map((it) => (it.id === itemId ? { ...it, imageUrl: url } : it)),
      }))
    );
  }
  const mark = (id: string, b: Busy) => setBusy((s) => ({ ...s, [id]: b }));
  const fail = (id: string, m: string | null) => setErr((s) => ({ ...s, [id]: m }));

  async function generate(itemId: string) {
    mark(itemId, 'gen');
    fail(itemId, null);
    try {
      const res = await fetch('/api/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Görsel üretilemedi.');
      setItemUrl(itemId, `${body.imageUrl}?t=${Date.now()}`);
    } catch (e) {
      fail(itemId, e instanceof Error ? e.message : 'Beklenmeyen hata.');
    } finally {
      mark(itemId, null);
    }
  }

  async function upload(itemId: string, file: File) {
    if (!ACCEPTED.includes(file.type)) return fail(itemId, 'JPG, PNG veya WebP yükleyin.');
    if (file.size > MAX_BYTES) return fail(itemId, 'Görsel 10 MB sınırını aşıyor.');
    mark(itemId, 'upload');
    fail(itemId, null);
    try {
      const supabase = createClient();
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `${orgId}/items/${itemId}-${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('venue-media')
        .upload(path, file, { contentType: file.type, upsert: true });
      if (upErr) throw new Error('Yükleme başarısız. Bağlantınızı kontrol edin.');
      const {
        data: { publicUrl },
      } = supabase.storage.from('venue-media').getPublicUrl(path);
      const res = await fetch('/api/image', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, imageUrl: publicUrl }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Görsel bağlanamadı.');
      setItemUrl(itemId, `${publicUrl}?t=${Date.now()}`);
    } catch (e) {
      fail(itemId, e instanceof Error ? e.message : 'Beklenmeyen hata.');
    } finally {
      mark(itemId, null);
    }
  }

  async function remove(itemId: string) {
    mark(itemId, 'remove');
    fail(itemId, null);
    try {
      const res = await fetch('/api/image', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, imageUrl: null }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Kaldırılamadı.');
      setItemUrl(itemId, null);
    } catch (e) {
      fail(itemId, e instanceof Error ? e.message : 'Beklenmeyen hata.');
    } finally {
      mark(itemId, null);
    }
  }

  if (total === 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8 text-center">
        <h1 className="text-2xl font-bold">Ürün görselleri</h1>
        <p className="mt-2 text-stone-500">Menünde görsel eklenecek ürün yok.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-brand-600">Ürün görselleri</p>
          <h1 className="mt-1 text-2xl font-bold">Menü görselleri</h1>
          <p className="mt-1 text-sm text-stone-500">
            {withImage} / {total} üründe görsel var. AI ile üret, beğenmezsen yeniden üret ya da
            kendi fotoğrafını yükle.
          </p>
        </div>
        <a
          href={`/m/${slug}`}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-brand-300 px-4 py-2 text-sm font-medium text-brand-700 transition hover:bg-brand-50"
        >
          👁 Misafir menüsünü önizle
        </a>
      </header>

      <div className="space-y-6">
        {cats.map((c) => (
          <section key={c.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold">{c.name}</h2>
            <ul className="divide-y divide-stone-100">
              {c.items.map((it) => {
                const b = busy[it.id] ?? null;
                const working = b !== null;
                return (
                  <li key={it.id} className="flex items-center gap-3 py-3">
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-stone-100">
                      {it.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.imageUrl} alt={it.name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-2xl text-stone-300">
                          🍽
                        </span>
                      )}
                      {working && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                          <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-300 border-t-brand-600" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-stone-800">{it.name}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => generate(it.id)}
                          disabled={working}
                          className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
                        >
                          {b === 'gen' ? 'Üretiliyor…' : it.imageUrl ? '↻ Yeniden üret' : '✨ AI ile üret'}
                        </button>
                        <button
                          onClick={() => fileRefs.current[it.id]?.click()}
                          disabled={working}
                          className="rounded-lg border border-stone-300 px-3 py-1 text-xs font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-50"
                        >
                          {b === 'upload' ? 'Yükleniyor…' : 'Elle yükle'}
                        </button>
                        {it.imageUrl && (
                          <button
                            onClick={() => remove(it.id)}
                            disabled={working}
                            className="rounded-lg px-2 py-1 text-xs font-medium text-stone-400 transition hover:text-red-600 disabled:opacity-50"
                          >
                            Kaldır
                          </button>
                        )}
                        <input
                          ref={(el) => {
                            fileRefs.current[it.id] = el;
                          }}
                          type="file"
                          accept={ACCEPTED.join(',')}
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void upload(it.id, f);
                            e.target.value = '';
                          }}
                        />
                      </div>
                      {err[it.id] && <p className="mt-1 text-xs text-red-600">{err[it.id]}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
