'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Phase =
  | { name: 'hazirlaniyor' }
  | { name: 'hazir'; orgId: string; venueId: string }
  | { name: 'yukleniyor'; orgId: string; venueId: string }
  | { name: 'cikariliyor'; orgId: string; venueId: string }
  | { name: 'hata'; message: string; orgId?: string; venueId?: string };

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_BYTES = 20 * 1024 * 1024;

/**
 * Studyo giriş ekranı: anonim oturum + org/venue bootstrap + dosya yükleme.
 * Tek altın yol, adım 1: "yükle".
 */
export default function StudyoPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ name: 'hazirlaniyor' });
  const [dragOver, setDragOver] = useState(false);
  const [isAnon, setIsAnon] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const bootstrapped = useRef(false);

  // Oturum garanti et (anonim dahil), org+venue hazırla
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    (async () => {
      try {
        const supabase = createClient();
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
          const { error } = await supabase.auth.signInAnonymously();
          if (error) throw new Error('Oturum başlatılamadı.');
        }
        const res = await fetch('/api/bootstrap', { method: 'POST' });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? 'Hazırlık başarısız.');
        // Anonim mi? Kalıcılaştırma çağrısı için uyarı bandı göster.
        const { data: userData } = await supabase.auth.getUser();
        const u = userData.user as { is_anonymous?: boolean; email?: string } | null;
        setIsAnon(Boolean(u && (u.is_anonymous ?? !u.email)));
        setPhase({ name: 'hazir', orgId: body.orgId, venueId: body.venueId });
      } catch (err) {
        setPhase({
          name: 'hata',
          message: err instanceof Error ? err.message : 'Beklenmeyen hata.',
        });
      }
    })();
  }, []);

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (phase.name !== 'hazir') return;
      const { orgId, venueId } = phase;

      if (files.length > 10) {
        setPhase({ name: 'hata', message: 'Tek seferde en çok 10 sayfa yükleyebilirsin.', orgId, venueId });
        return;
      }
      for (const file of files) {
        if (!ACCEPTED.includes(file.type)) {
          setPhase({ name: 'hata', message: 'JPG, PNG, WebP veya PDF yükleyin.', orgId, venueId });
          return;
        }
        if (file.size > MAX_BYTES) {
          setPhase({ name: 'hata', message: `"${file.name}" 20 MB sınırını aşıyor.`, orgId, venueId });
          return;
        }
      }

      setPhase({ name: 'yukleniyor', orgId, venueId });
      try {
        const supabase = createClient();
        const pages: { storagePath: string; mimeType: string; sourceType: 'image' | 'pdf' }[] = [];
        for (const file of files) {
          const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
          const path = `${orgId}/${crypto.randomUUID()}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from('menu-uploads')
            .upload(path, file, { contentType: file.type });
          if (upErr) throw new Error('Yükleme başarısız. Bağlantınızı kontrol edin.');
          pages.push({
            storagePath: path,
            mimeType: file.type,
            sourceType: file.type === 'application/pdf' ? 'pdf' : 'image',
          });
        }

        setPhase({ name: 'cikariliyor', orgId, venueId });
        const res = await fetch('/api/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ venueId, pages }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? 'Menü çıkarılamadı.');
        router.push(`/studyo/${body.id}`);
      } catch (err) {
        setPhase({
          name: 'hata',
          message: err instanceof Error ? err.message : 'Beklenmeyen hata.',
          orgId,
          venueId,
        });
      }
    },
    [phase, router]
  );

  const busy = phase.name === 'yukleniyor' || phase.name === 'cikariliyor';

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-bold">Menünü yükle</h1>
        <p className="mt-1 text-stone-600">
          Mevcut menünün fotoğrafını veya PDF&apos;ini yükle; gerisini yapay zeka halletsin.
        </p>
      </div>

      {isAnon && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>
            Hesabın geçici — menün yalnız bu tarayıcıya bağlı. E-postanı ekle ki kaybetmeyesin.
          </span>
          <a
            href="/studyo/hesap"
            className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 font-semibold text-white transition hover:bg-amber-700"
          >
            Hesabını güvene al
          </a>
        </div>
      )}

      <div
        role="button"
        tabIndex={0}
        aria-disabled={busy}
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && !busy && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const files = Array.from(e.dataTransfer.files ?? []);
          if (files.length && !busy) void handleFiles(files);
        }}
        className={`flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition
          ${dragOver ? 'border-brand-600 bg-brand-50' : 'border-stone-300 bg-white hover:border-brand-500'}
          ${busy ? 'pointer-events-none opacity-70' : ''}`}
      >
        {phase.name === 'hazirlaniyor' && <p className="text-stone-500">Hazırlanıyor…</p>}
        {phase.name === 'hazir' && (
          <>
            <span className="text-4xl">📸</span>
            <p className="font-medium">Fotoğraf ya da PDF&apos;leri buraya bırak</p>
            <p className="text-sm text-stone-500">
              veya tıklayıp seç · birden çok sayfa seçebilirsin · JPG, PNG, WebP, PDF · her biri en çok 20 MB
            </p>
          </>
        )}
        {phase.name === 'yukleniyor' && <Progress label="Dosya yükleniyor…" />}
        {phase.name === 'cikariliyor' && (
          <Progress label="Yapay zeka menünü okuyor… (30-60 sn sürebilir)" />
        )}
        {phase.name === 'hata' && (
          <>
            <p className="font-medium text-red-600">{phase.message}</p>
            {phase.orgId && phase.venueId ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPhase({ name: 'hazir', orgId: phase.orgId!, venueId: phase.venueId! });
                }}
                className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white"
              >
                Tekrar dene
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  window.location.reload();
                }}
                className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white"
              >
                Sayfayı yenile
              </button>
            )}
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) void handleFiles(files);
          e.target.value = '';
        }}
      />

      <p className="text-center text-xs text-stone-400">
        Yüklediğin dosya yalnızca menünü çıkarmak için kullanılır ve hesabına özel saklanır.
      </p>
    </main>
  );
}

function Progress({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
      <p className="text-stone-600">{label}</p>
    </div>
  );
}
