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

type Save = { name: 'idle' } | { name: 'saving' } | { name: 'done' } | { name: 'error'; message: string };

export function VenueSettingsForm({ initial }: { initial: VenueSettings }) {
  const [v, setV] = useState<VenueSettings>(initial);
  const [save, setSave] = useState<Save>({ name: 'idle' });

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
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Kaydedilemedi.');
      setSave({ name: 'done' });
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
          href={`/m/${v.slug}`}
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
