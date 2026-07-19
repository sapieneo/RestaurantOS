'use client';

import { useEffect, useState } from 'react';

type Props = {
  email: string | null;
  isAnonymous: boolean;
  contactPhone: string | null;
};

type Status = { name: 'idle' } | { name: 'saving' } | { name: 'sent' } | { name: 'error'; message: string };

export function AccountCard({ email, isAnonymous, contactPhone }: Props) {
  const [emailInput, setEmailInput] = useState('');
  const [phone, setPhone] = useState(contactPhone ?? '');
  const [status, setStatus] = useState<Status>({ name: 'idle' });
  const [banner, setBanner] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  // /auth/callback dönüşünü yakala (?auth_ok / ?auth_error).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('auth_ok')) {
      setBanner({ kind: 'ok', text: 'E-postan doğrulandı — hesabın artık güvende.' });
    } else if (p.get('auth_error')) {
      setBanner({ kind: 'error', text: p.get('auth_error')! });
    }
    if (p.get('auth_ok') || p.get('auth_error')) {
      window.history.replaceState({}, '', '/studyo/hesap');
    }
  }, []);

  async function submit() {
    const payload: { email?: string; phone?: string } = {};
    if (isAnonymous && emailInput.trim()) payload.email = emailInput.trim();
    const trimmedPhone = phone.trim();
    if (trimmedPhone && trimmedPhone !== (contactPhone ?? '')) payload.phone = trimmedPhone;

    if (!payload.email && !payload.phone) {
      setStatus({ name: 'error', message: 'Bir e-posta veya telefon gir.' });
      return;
    }

    setStatus({ name: 'saving' });
    try {
      const res = await fetch('/api/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'İşlem başarısız.');
      setStatus(body.emailSent ? { name: 'sent' } : { name: 'idle' });
      if (!body.emailSent && body.phoneSaved) {
        setBanner({ kind: 'ok', text: 'Telefon numarası kaydedildi.' });
      }
    } catch (err) {
      setStatus({ name: 'error', message: err instanceof Error ? err.message : 'Beklenmeyen hata.' });
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6">
        <p className="text-sm font-medium text-brand-600">Hesap</p>
        <h1 className="mt-1 text-2xl font-bold">Hesabını güvene al</h1>
      </header>

      {banner && (
        <p
          className={`mb-5 rounded-lg border px-4 py-3 text-sm ${
            banner.kind === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {banner.text}
        </p>
      )}

      {!isAnonymous ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-semibold text-white">
              GÜVENDE
            </span>
            <h2 className="text-base font-bold text-stone-800">Hesabın bir e-postaya bağlı</h2>
          </div>
          <p className="mt-1 text-sm text-stone-600">
            Menün <strong>{email}</strong> adresine bağlı. Farklı bir cihazdan bu e-posta ile
            giriş yaparak menüne ulaşabilirsin.
          </p>
        </section>
      ) : (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-semibold text-white">
              GEÇİCİ
            </span>
            <h2 className="text-base font-bold text-stone-800">Hesabın henüz geçici</h2>
          </div>
          <p className="mt-1 max-w-lg text-sm text-stone-600">
            Menün şu an yalnız bu tarayıcıya bağlı. Tarayıcı verisini temizlersen ya da başka
            cihaza geçersen <strong>menüne erişemezsin</strong>. E-postanı ekle; sana bir
            doğrulama bağlantısı gönderelim.
          </p>

          <label className="mt-4 block">
            <span className="mb-1 block text-sm font-medium text-stone-600">E-posta</span>
            <input
              type="email"
              value={emailInput}
              onChange={(e) => {
                setEmailInput(e.target.value);
                if (status.name !== 'idle') setStatus({ name: 'idle' });
              }}
              placeholder="ornek@isletmem.com"
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </label>

          {status.name === 'sent' && (
            <p className="mt-3 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-700">
              ✓ Doğrulama bağlantısı gönderildi. E-postandaki bağlantıya tıkla; bu sekmeye geri
              döneceksin. Bağlantı aynı tarayıcıda açılmalı.
            </p>
          )}
        </section>
      )}

      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-stone-400">
          İletişim telefonu
        </h2>
        <p className="mb-3 text-sm text-stone-500">
          Hesabınla ilgili iletişim için. Misafir menüsünde gösterilmez — o numara
          <a href="/studyo/ayarlar" className="text-brand-700 underline"> işletme ayarlarında</a>.
        </p>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-stone-600">Telefon</span>
          <input
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              if (status.name !== 'idle') setStatus({ name: 'idle' });
            }}
            placeholder="+90 5xx xxx xx xx"
            className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </label>
      </section>

      {status.name === 'error' && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {status.message}
        </p>
      )}

      <div className="mt-6">
        <button
          onClick={submit}
          disabled={status.name === 'saving'}
          className="rounded-xl bg-brand-600 px-6 py-3 font-semibold text-white shadow transition hover:bg-brand-700 disabled:opacity-50"
        >
          {status.name === 'saving' ? 'Kaydediliyor…' : isAnonymous ? 'Doğrulama gönder / kaydet' : 'Kaydet'}
        </button>
      </div>
    </main>
  );
}
