'use client';

import { useState } from 'react';
import { CURRENCIES } from '@/lib/currency';

export type VenueSettings = {
  id: string;
  slug: string;
  name: string;
  description: string;
  address: string;
  phone: string;
  whatsapp: string;
  instagram: string;
  googleMapsUrl: string;
  wifiSsid: string;
  openingHours: string;
  currencyCode: string;
};

export type PublishState = {
  isPublished: boolean;
  publishedAt: string | null;
  itemCount: number;
  pendingCount: number;
};

type Save = { name: 'idle' } | { name: 'saving' } | { name: 'done' } | { name: 'error'; message: string };

export function VenueSettingsForm({
  initial,
  publish,
}: {
  initial: VenueSettings;
  publish: PublishState;
}) {
  const [v, setV] = useState<VenueSettings>(initial);
  const [save, setSave] = useState<Save>({ name: 'idle' });
  const [pub, setPub] = useState<PublishState>(publish);
  const [savedSlug, setSavedSlug] = useState(initial.slug);

  function set<K extends keyof VenueSettings>(key: K, value: VenueSettings[K]) {
    setV((s) => ({ ...s, [key]: value }));
    if (save.name !== 'idle') setSave({ name: 'idle' });
  }

  async function submit() {
    if (!v.name.trim()) {
      setSave({ name: 'error', message: 'İşletme adı boş olamaz.' });
      return;
    }
    setSave({ name: 'saving' });
    try {
      const res = await fetch('/api/venue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venueId: v.id,
          name: v.name,
          description: v.description,
          address: v.address,
          phone: v.phone,
          whatsapp: v.whatsapp,
          instagram: v.instagram,
          googleMapsUrl: v.googleMapsUrl,
          wifiSsid: v.wifiSsid,
          openingHours: v.openingHours,
          currencyCode: v.currencyCode,
          slug: v.slug.trim().toLowerCase(),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Kaydedilemedi.');
      setSavedSlug(body.slug ?? v.slug);
      setSave({ name: 'done' });
    } catch (err) {
      setSave({ name: 'error', message: err instanceof Error ? err.message : 'Beklenmeyen hata.' });
    }
  }

  /** Yayın anahtarı — tek boolean, tüm misafir erişimini açar/kapatır. */
  async function togglePublish(next: boolean) {
    setSave({ name: 'saving' });
    try {
      const res = await fetch('/api/venue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueId: v.id, isPublished: next }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Güncellenemedi.');
      setPub((s) => ({ ...s, isPublished: body.isPublished, publishedAt: body.publishedAt }));
      setSave({ name: 'idle' });
    } catch (err) {
      setSave({ name: 'error', message: err instanceof Error ? err.message : 'Beklenmeyen hata.' });
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6">
        <p className="text-sm font-medium text-brand-600">İşletme ayarları</p>
        <h1 className="mt-1 text-2xl font-bold">{v.name || 'İşletmem'}</h1>
        <p className="mt-1 text-sm text-stone-500">
          Bu bilgiler misafir menünün başlığında ve iletişim bölümünde görünür.
        </p>
      </header>

      <PublishCard
        state={pub}
        slug={savedSlug}
        busy={save.name === 'saving'}
        onToggle={togglePublish}
      />

      <div className="space-y-6">
        <Section title="İşletme">
          <Field label="İşletme adı" required>
            <input
              value={v.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Örn. Sine Pub"
              className={inputCls}
            />
          </Field>
          <Field label="Kısa açıklama">
            <textarea
              value={v.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Örn. Nostaljik meyhane · canlı müzik"
              rows={2}
              className={`${inputCls} resize-none`}
            />
          </Field>
          <Field label="Menü adresi">
            <div className="flex items-center rounded-lg border border-stone-300 bg-white px-3 py-2 focus-within:border-brand-500">
              <span className="shrink-0 text-sm text-stone-400">/m/</span>
              <input
                value={v.slug}
                onChange={(e) => set('slug', e.target.value.toLowerCase())}
                placeholder="sine-pub"
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
            <span className="mt-1 block text-xs text-stone-500">
              Küçük harf, rakam ve tire. Değiştirirsen eski bağlantı çalışmaz —{' '}
              <a href="/studyo/qr" className="underline">
                basılı QR kodların
              </a>{' '}
              etkilenmez.
            </span>
          </Field>
          <Field label="Para birimi">
            <select
              value={v.currencyCode}
              onChange={(e) => set('currencyCode', e.target.value)}
              className={inputCls}
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.symbol} {c.code} — {c.name}
                </option>
              ))}
            </select>
          </Field>
        </Section>

        <Section title="İletişim & konum">
          <Field label="Adres">
            <textarea
              value={v.address}
              onChange={(e) => set('address', e.target.value)}
              placeholder="Açık adres"
              rows={2}
              className={`${inputCls} resize-none`}
            />
          </Field>
          <Field label="Google Haritalar bağlantısı">
            <input
              value={v.googleMapsUrl}
              onChange={(e) => set('googleMapsUrl', e.target.value)}
              placeholder="https://maps.google.com/…"
              className={inputCls}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Telefon">
              <input
                value={v.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="0212 000 00 00"
                className={inputCls}
              />
            </Field>
            <Field label="WhatsApp">
              <input
                value={v.whatsapp}
                onChange={(e) => set('whatsapp', e.target.value)}
                placeholder="+90 5xx xxx xx xx"
                className={inputCls}
              />
            </Field>
          </div>
          <Field label="Instagram">
            <input
              value={v.instagram}
              onChange={(e) => set('instagram', e.target.value)}
              placeholder="@kullaniciadi"
              className={inputCls}
            />
          </Field>
        </Section>

        <Section title="Misafir bilgisi">
          <Field label="Çalışma saatleri">
            <input
              value={v.openingHours}
              onChange={(e) => set('openingHours', e.target.value)}
              placeholder="Örn. Her gün 12:00 – 24:00"
              className={inputCls}
            />
          </Field>
          <Field label="Wi-Fi ağ adı">
            <input
              value={v.wifiSsid}
              onChange={(e) => set('wifiSsid', e.target.value)}
              placeholder="Örn. SinePub_Misafir"
              className={inputCls}
            />
          </Field>
        </Section>
      </div>

      {save.name === 'error' && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {save.message}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          onClick={submit}
          disabled={save.name === 'saving'}
          className="rounded-xl bg-brand-600 px-6 py-3 font-semibold text-white shadow transition hover:bg-brand-700 disabled:opacity-50"
        >
          {save.name === 'saving' ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
        {save.name === 'done' && (
          <span className="text-sm font-medium text-emerald-600">✓ Kaydedildi</span>
        )}
        <a
          href="/studyo/qr"
          className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
        >
          QR kodları
        </a>
        <a
          href={`/m/${savedSlug}`}
          target="_blank"
          rel="noreferrer"
          className="ml-auto rounded-lg border border-brand-300 px-4 py-2 text-sm font-medium text-brand-700 transition hover:bg-brand-50"
        >
          👁 Misafir menüsünü önizle
        </a>
      </div>
    </main>
  );
}

/**
 * Yayın kartı. `is_published` tek bir boolean ama 0001'deki tüm public SELECT
 * policy'leri ona bağlı: kapalıyken menüyü yalnız org üyesi görür.
 */
function PublishCard({
  state,
  slug,
  busy,
  onToggle,
}: {
  state: PublishState;
  slug: string;
  busy: boolean;
  onToggle: (next: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  const liveUrl = typeof window === 'undefined' ? `/m/${slug}` : `${window.location.origin}/m/${slug}`;

  function confirmAndPublish() {
    if (state.pendingCount > 0) {
      const ok = window.confirm(
        `${state.pendingCount} ürünün alerjen onayı bekliyor. Onaylanmamış ürünlerin alerjen ` +
          'bilgisi misafire GÖSTERİLMEZ.\n\nYine de yayınlamak istiyor musun?'
      );
      if (!ok) return;
    }
    onToggle(true);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(liveUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* pano erişimi yoksa sessiz geç */
    }
  }

  return (
    <section
      className={`mb-6 rounded-2xl border p-5 shadow-sm ${
        state.isPublished ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                state.isPublished ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'
              }`}
            >
              {state.isPublished ? 'CANLI' : 'TASLAK'}
            </span>
            <h2 className="text-base font-bold text-stone-800">
              {state.isPublished ? 'Menün yayında' : 'Menün henüz yayında değil'}
            </h2>
          </div>
          <p className="mt-1 max-w-md text-sm text-stone-600">
            {state.isPublished
              ? 'Bağlantıyı veya QR kodunu bilen herkes menünü görebilir.'
              : 'Şu an menüyü yalnızca sen görebiliyorsun. Yayınladığında bağlantı ve QR herkese açılır.'}
          </p>
          {state.publishedAt && (
            <p className="mt-1 text-xs text-stone-500">
              İlk yayın: {new Date(state.publishedAt).toLocaleDateString('tr-TR')}
            </p>
          )}
        </div>

        <button
          onClick={() => (state.isPublished ? onToggle(false) : confirmAndPublish())}
          disabled={busy}
          className={`rounded-xl px-5 py-2.5 font-semibold shadow transition disabled:opacity-50 ${
            state.isPublished
              ? 'border border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
              : 'bg-emerald-600 text-white hover:bg-emerald-700'
          }`}
        >
          {busy ? '…' : state.isPublished ? 'Yayından kaldır' : 'Yayınla'}
        </button>
      </div>

      {!state.isPublished && state.pendingCount > 0 && (
        <p className="mt-3 rounded-lg border border-amber-300 bg-white/70 px-3 py-2 text-sm text-amber-800">
          {state.pendingCount}/{state.itemCount} ürünün alerjen onayı bekliyor. Onaylanmayan ürünlerde
          misafir alerjen bilgisi göremez.{' '}
          <a href="/studyo/uyum" className="font-semibold underline">
            Uyum ekranına git
          </a>
        </p>
      )}

      {state.isPublished && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-600">
            {liveUrl}
          </code>
          <button
            onClick={copy}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
          >
            {copied ? '✓ Kopyalandı' : 'Kopyala'}
          </button>
          <a
            href="/studyo/qr"
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
          >
            QR kodu al
          </a>
        </div>
      )}
    </section>
  );
}

const inputCls =
  'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-stone-400">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-stone-600">
        {label}
        {required && <span className="text-brand-600"> *</span>}
      </span>
      {children}
    </label>
  );
}
