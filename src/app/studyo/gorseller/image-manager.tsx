'use client';

import { useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export type ImgItem = { id: string; name: string; imageUrl: string | null };
export type ImgCategory = {
  id: string;
  name: string;
  backgroundUrl: string | null;
  items: ImgItem[];
};

type Kind = 'item' | 'category';
type Busy = 'gen' | 'upload' | 'enhance' | 'remove' | null;

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 10 * 1024 * 1024;

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
  const uploadRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const enhanceRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const totalItems = cats.reduce((n, c) => n + c.items.length, 0);
  const itemsWithImg = cats.reduce((n, c) => n + c.items.filter((i) => i.imageUrl).length, 0);

  function setUrl(kind: Kind, id: string, url: string | null) {
    setCats((cs) =>
      cs.map((c) => {
        if (kind === 'category') return c.id === id ? { ...c, backgroundUrl: url } : c;
        return { ...c, items: c.items.map((it) => (it.id === id ? { ...it, imageUrl: url } : it)) };
      })
    );
  }
  const mark = (id: string, b: Busy) => setBusy((s) => ({ ...s, [id]: b }));
  const fail = (id: string, m: string | null) => setErr((s) => ({ ...s, [id]: m }));
  const bodyId = (kind: Kind, id: string) => (kind === 'item' ? { itemId: id } : { categoryId: id });

  async function generate(kind: Kind, id: string) {
    mark(id, 'gen');
    fail(id, null);
    try {
      const res = await fetch('/api/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyId(kind, id)),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Görsel üretilemedi.');
      setUrl(kind, id, `${body.imageUrl}?t=${Date.now()}`);
    } catch (e) {
      fail(id, e instanceof Error ? e.message : 'Beklenmeyen hata.');
    } finally {
      mark(id, null);
    }
  }

  async function upload(kind: Kind, id: string, file: File) {
    if (!ACCEPTED.includes(file.type)) return fail(id, 'JPG, PNG veya WebP yükleyin.');
    if (file.size > MAX_BYTES) return fail(id, 'Görsel 10 MB sınırını aşıyor.');
    mark(id, 'upload');
    fail(id, null);
    try {
      const supabase = createClient();
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const subdir = kind === 'item' ? 'items' : 'categories';
      const path = `${orgId}/${subdir}/${id}-${crypto.randomUUID()}.${ext}`;
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
        body: JSON.stringify({ ...bodyId(kind, id), imageUrl: publicUrl }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Görsel bağlanamadı.');
      setUrl(kind, id, `${publicUrl}?t=${Date.now()}`);
    } catch (e) {
      fail(id, e instanceof Error ? e.message : 'Beklenmeyen hata.');
    } finally {
      mark(id, null);
    }
  }

  async function enhance(kind: Kind, id: string, file: File) {
    if (!ACCEPTED.includes(file.type)) return fail(id, 'JPG, PNG veya WebP yükleyin.');
    if (file.size > MAX_BYTES) return fail(id, 'Görsel 10 MB sınırını aşıyor.');
    mark(id, 'enhance');
    fail(id, null);
    try {
      const supabase = createClient();
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const tmpPath = `${orgId}/tmp/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('venue-media')
        .upload(tmpPath, file, { contentType: file.type, upsert: true });
      if (upErr) throw new Error('Yükleme başarısız. Bağlantınızı kontrol edin.');
      const {
        data: { publicUrl },
      } = supabase.storage.from('venue-media').getPublicUrl(tmpPath);
      const res = await fetch('/api/image/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...bodyId(kind, id), sourceUrl: publicUrl }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'İyileştirilemedi.');
      setUrl(kind, id, `${body.imageUrl}?t=${Date.now()}`);
    } catch (e) {
      fail(id, e instanceof Error ? e.message : 'Beklenmeyen hata.');
    } finally {
      mark(id, null);
    }
  }

  async function remove(kind: Kind, id: string) {
    mark(id, 'remove');
    fail(id, null);
    try {
      const res = await fetch('/api/image', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...bodyId(kind, id), imageUrl: null }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Kaldırılamadı.');
      setUrl(kind, id, null);
    } catch (e) {
      fail(id, e instanceof Error ? e.message : 'Beklenmeyen hata.');
    } finally {
      mark(id, null);
    }
  }

  function Controls({ kind, id, hasImage }: { kind: Kind; id: string; hasImage: boolean }) {
    const b = busy[id] ?? null;
    const working = b !== null;
    return (
      <>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => generate(kind, id)}
            disabled={working}
            className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {b === 'gen' ? 'Üretiliyor…' : hasImage ? '↻ Yeniden üret' : '✨ AI ile üret'}
          </button>
          <button
            onClick={() => uploadRefs.current[id]?.click()}
            disabled={working}
            className="rounded-lg border border-stone-300 px-3 py-1 text-xs font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-50"
          >
            {b === 'upload' ? 'Yükleniyor…' : 'Elle yükle'}
          </button>
          <button
            onClick={() => enhanceRefs.current[id]?.click()}
            disabled={working}
            title="Yüklediğin fotoğrafı keskinleştirip yükler"
            className="rounded-lg border border-stone-300 px-3 py-1 text-xs font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-50"
          >
            {b === 'enhance' ? 'İyileştiriliyor…' : '✨ İyileştir ve yükle'}
          </button>
          {hasImage && (
            <button
              onClick={() => remove(kind, id)}
              disabled={working}
              className="rounded-lg px-2 py-1 text-xs font-medium text-stone-400 transition hover:text-red-600 disabled:opacity-50"
            >
              Kaldır
            </button>
          )}
        </div>
        <input
          ref={(el) => {
            uploadRefs.current[id] = el;
          }}
          type="file"
          accept={ACCEPTED.join(',')}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(kind, id, f);
            e.target.value = '';
          }}
        />
        <input
          ref={(el) => {
            enhanceRefs.current[id] = el;
          }}
          type="file"
          accept={ACCEPTED.join(',')}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void enhance(kind, id, f);
            e.target.value = '';
          }}
        />
        {err[id] && <p className="mt-1 text-xs text-red-600">{err[id]}</p>}
      </>
    );
  }

  if (totalItems === 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8 text-center">
        <h1 className="text-2xl font-bold">Görseller</h1>
        <p className="mt-2 text-stone-500">Menünde görsel eklenecek ürün yok.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-brand-600">Görseller</p>
          <h1 className="mt-1 text-2xl font-bold">Menü görselleri</h1>
          <p className="mt-1 text-sm text-stone-500">
            {itemsWithImg} / {totalItems} üründe görsel var. Ürün görseli ve kategori arka planı için
            AI ile üret, yeniden üret ya da kendi fotoğrafını yükle.
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
            {/* Kategori arka planı */}
            <div className="relative mb-4 h-24 overflow-hidden rounded-xl bg-stone-100">
              {c.backgroundUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.backgroundUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-brand-100 to-stone-100" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
              <h2 className="absolute bottom-2 left-3 text-lg font-bold text-white drop-shadow">
                {c.name}
              </h2>
              {busy[c.id] === 'gen' && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/60">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-300 border-t-brand-600" />
                </div>
              )}
            </div>
            <div className="mb-4">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-400">
                Kategori arka planı
              </p>
              <Controls kind="category" id={c.id} hasImage={Boolean(c.backgroundUrl)} />
            </div>

            {/* Ürünler */}
            <ul className="divide-y divide-stone-100 border-t border-stone-100">
              {c.items.map((it) => (
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
                    {busy[it.id] && busy[it.id] !== 'gen' && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-300 border-t-brand-600" />
                      </div>
                    )}
                    {busy[it.id] === 'gen' && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-300 border-t-brand-600" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-stone-800">{it.name}</p>
                    <div className="mt-1.5">
                      <Controls kind="item" id={it.id} hasImage={Boolean(it.imageUrl)} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
