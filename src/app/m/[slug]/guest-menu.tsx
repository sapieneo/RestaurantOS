'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ALLERGENS } from '@/lib/allergens';
import { DIETARY } from '@/lib/dietary';
import { formatPrice } from '@/lib/currency';

export type GuestItem = {
  id: string;
  name: string;
  description: string | null;
  ingredients: string | null;
  price: number | null;
  calories: number | null;
  imageUrl: string | null;
  allergenCodes: string[];
  dietaryCodes: string[];
};

export type GuestCategory = {
  id: string;
  name: string;
  backgroundUrl: string | null;
  items: GuestItem[];
};

export type GuestVenue = {
  name: string;
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  currency: string;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  instagram: string | null;
  googleMapsUrl: string | null;
  wifiSsid: string | null;
  openingHours: string | null;
  isPublished: boolean;
};

export function GuestMenu({
  venue,
  categories,
  venueId,
}: {
  venue: GuestVenue;
  categories: GuestCategory[];
  venueId: string;
}) {
  const [active, setActive] = useState(categories[0]?.id ?? '');
  const [selected, setSelected] = useState<GuestItem | null>(null);
  const seenItems = useRef<Set<string>>(new Set());

  /**
   * 'item_view' olayı (B3). Aynı oturumda aynı ürün bir kez sayılır — modal
   * açılıp kapanınca sayaç şişmesin. Yayınlanmamış önizlemede hiç yazılmaz.
   * Analitik sessizdir: hata olursa misafir hiçbir şey görmez.
   */
  function openItem(item: GuestItem) {
    setSelected(item);
    if (!venue.isPublished || seenItems.current.has(item.id)) return;
    seenItems.current.add(item.id);
    void fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueId, itemId: item.id, eventType: 'item_view' }),
      keepalive: true,
    }).catch(() => {});
  }
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const navRef = useRef<HTMLDivElement | null>(null);
  const clickScrolling = useRef(false);

  // Scroll-spy: görünürdeki kategoriye göre aktif sekmeyi işaretle.
  useEffect(() => {
    if (!categories.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (clickScrolling.current) return;
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id.replace('cat-', ''));
      },
      { rootMargin: '-45% 0px -50% 0px', threshold: 0 }
    );
    Object.values(sectionRefs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [categories]);

  // Aktif sekmeyi yatay şeritte ortala. ÖNEMLİ: yalnızca nav'ı yatay kaydır;
  // scrollIntoView kullanılırsa sayfayı dikey de kaydırıp "yukarı yaylanma"
  // hatası yapar.
  useEffect(() => {
    const nav = navRef.current;
    const tab = tabRefs.current[active];
    if (!nav || !tab) return;
    const navRect = nav.getBoundingClientRect();
    const tabRect = tab.getBoundingClientRect();
    const delta = tabRect.left - navRect.left - (nav.clientWidth / 2 - tab.clientWidth / 2);
    nav.scrollTo({ left: nav.scrollLeft + delta, behavior: 'smooth' });
  }, [active]);

  function goTo(id: string) {
    setActive(id);
    clickScrolling.current = true;
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => {
      clickScrolling.current = false;
    }, 700);
  }

  if (!categories.length) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-2xl font-bold">{venue.name}</h1>
        <p className="text-stone-500">Menü henüz hazırlanıyor. Kısa süre sonra tekrar deneyin.</p>
      </main>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-white pb-16 shadow-sm sm:my-4 sm:rounded-2xl sm:overflow-hidden">
      {!venue.isPublished && (
        <div className="bg-amber-100 px-4 py-2 text-center text-xs font-medium text-amber-800">
          Önizleme — bu menü henüz yayınlanmadı. Yalnızca siz görüyorsunuz.
        </div>
      )}

      {/* Hero */}
      <header className="relative">
        <div
          className="h-40 w-full bg-gradient-to-br from-brand-500 to-brand-700 bg-cover bg-center"
          style={venue.coverUrl ? { backgroundImage: `url(${venue.coverUrl})` } : undefined}
        />
        <div className="px-5 pb-4">
          <div className="-mt-10 flex items-end gap-3">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-white shadow-md">
              {venue.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={venue.logoUrl} alt={venue.name} className="h-full w-full object-cover" />
              ) : (
                <span className="text-2xl font-bold text-brand-600">
                  {venue.name.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight">{venue.name}</h1>
          {venue.description && (
            <p className="mt-1 text-sm text-stone-500">{venue.description}</p>
          )}
        </div>
      </header>

      {/* Yapışkan kategori sekmeleri */}
      <nav className="sticky top-0 z-20 border-b border-stone-100 bg-white/95 backdrop-blur">
        <div
          ref={navRef}
          className="flex gap-1 overflow-x-auto px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {categories.map((c) => {
            const isActive = c.id === active;
            return (
              <button
                key={c.id}
                ref={(el) => {
                  tabRefs.current[c.id] = el;
                }}
                onClick={() => goTo(c.id)}
                className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  isActive
                    ? 'bg-brand-600 text-white'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Kategoriler + ürünler */}
      <main className="px-4">
        {categories.map((c) => (
          <section
            key={c.id}
            id={`cat-${c.id}`}
            ref={(el) => {
              sectionRefs.current[c.id] = el;
            }}
            className="scroll-mt-16 pt-6"
          >
            {c.backgroundUrl ? (
              <div className="relative mb-3 h-28 overflow-hidden rounded-2xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={c.backgroundUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                <h2 className="absolute bottom-2 left-3 text-xl font-bold text-white drop-shadow-md">
                  {c.name}
                </h2>
              </div>
            ) : (
              <h2 className="mb-2 px-1 text-lg font-bold text-stone-800">{c.name}</h2>
            )}
            <ul className="divide-y divide-stone-100">
              {c.items.map((it) => (
                <li key={it.id}>
                  <button
                    onClick={() => openItem(it)}
                    className="flex w-full items-start gap-3 py-3 text-left transition active:bg-stone-50"
                  >
                    {it.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={it.imageUrl}
                        alt={it.name}
                        className="h-16 w-16 shrink-0 rounded-xl object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="font-semibold text-stone-800">{it.name}</h3>
                        {it.price != null && (
                          <span className="shrink-0 font-semibold text-brand-700">
                            {formatPrice(it.price, venue.currency)}
                          </span>
                        )}
                      </div>
                      {it.description && (
                        <p className="mt-0.5 line-clamp-2 text-sm text-stone-500">
                          {it.description}
                        </p>
                      )}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {it.dietaryCodes.map((code) => (
                          <DietaryChip key={code} code={code} />
                        ))}
                        {it.calories != null && (
                          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-500">
                            {it.calories} kcal
                          </span>
                        )}
                        {it.allergenCodes.map((code) => (
                          <AllergenChip key={code} code={code} />
                        ))}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>

      <ContactFooter venue={venue} />

      {selected && (
        <ItemModal item={selected} currency={venue.currency} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function DietaryChip({ code }: { code: string }) {
  const d = (DIETARY as Record<string, { tr: string; emoji: string } | undefined>)[code];
  if (!d) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
      <span aria-hidden>{d.emoji}</span>
      {d.tr}
    </span>
  );
}

function AllergenChip({ code }: { code: string }) {
  const a = (ALLERGENS as Record<string, { tr: string; abbr: string } | undefined>)[code];
  if (!a) return null;
  return (
    <span
      title={a.tr}
      className="rounded-full border border-stone-200 px-2 py-0.5 text-xs font-medium text-stone-400"
    >
      {a.abbr}
    </span>
  );
}

function ItemModal({
  item,
  currency,
  onClose,
}: {
  item: GuestItem;
  currency: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={item.name}
    >
      <div
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {item.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt={item.name} className="h-52 w-full object-cover" />
        )}
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-xl font-bold text-stone-900">{item.name}</h2>
            <button
              onClick={onClose}
              aria-label="Kapat"
              className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-500 hover:bg-stone-200"
            >
              ✕
            </button>
          </div>

          {item.price != null && (
            <p className="mt-1 text-lg font-semibold text-brand-700">
              {formatPrice(item.price, currency)}
            </p>
          )}

          {item.dietaryCodes.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {item.dietaryCodes.map((code) => (
                <DietaryChip key={code} code={code} />
              ))}
            </div>
          )}

          {item.description && (
            <p className="mt-3 text-sm leading-relaxed text-stone-600">{item.description}</p>
          )}

          {item.ingredients && (
            <ModalSection title="İÇİNDEKİLER">
              <p className="text-sm leading-relaxed text-stone-600">{item.ingredients}</p>
            </ModalSection>
          )}

          {item.calories != null && (
            <ModalSection title="KALORİ (PORSİYON)">
              <p className="text-sm font-medium text-stone-700">{item.calories} kcal</p>
            </ModalSection>
          )}

          {item.allergenCodes.length > 0 && (
            <ModalSection title="ALERJENLER">
              <div className="flex flex-wrap gap-1.5">
                {item.allergenCodes.map((code) => {
                  const a = (ALLERGENS as Record<string, { tr: string } | undefined>)[code];
                  return (
                    <span
                      key={code}
                      className="rounded-lg bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600"
                    >
                      {a?.tr ?? code}
                    </span>
                  );
                })}
              </div>
            </ModalSection>
          )}

          <p className="mt-5 border-t border-stone-100 pt-3 text-xs leading-relaxed text-stone-400">
            Alerjen ve diyet bilgileri işletme beyanına dayanır. Ağır alerjiniz varsa lütfen
            personele danışın.
          </p>
        </div>
      </div>
    </div>
  );
}

function ModalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-stone-400">{title}</h3>
      {children}
    </div>
  );
}

function ContactFooter({ venue }: { venue: GuestVenue }) {
  const waDigits = venue.whatsapp?.replace(/[^\d]/g, '') || null;
  const igHandle = venue.instagram
    ? venue.instagram.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '')
    : null;

  const rows = useMemo(
    () =>
      [
        venue.address && {
          label: 'Adres',
          value: venue.address,
          href: venue.googleMapsUrl ?? undefined,
        },
        venue.openingHours && { label: 'Çalışma saatleri', value: venue.openingHours },
        venue.phone && { label: 'Telefon', value: venue.phone, href: `tel:${venue.phone.replace(/\s/g, '')}` },
        waDigits && { label: 'WhatsApp', value: venue.whatsapp!, href: `https://wa.me/${waDigits}` },
        igHandle && { label: 'Instagram', value: `@${igHandle}`, href: `https://instagram.com/${igHandle}` },
        venue.wifiSsid && { label: 'Wi-Fi', value: venue.wifiSsid },
      ].filter(Boolean) as { label: string; value: string; href?: string }[],
    [venue, waDigits, igHandle]
  );

  return (
    <footer className="mt-8 border-t border-stone-100 px-5 py-6">
      {rows.length > 0 && (
        <dl className="space-y-3">
          {rows.map((r) => (
            <div key={r.label} className="flex flex-col gap-0.5">
              <dt className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                {r.label}
              </dt>
              <dd className="text-sm text-stone-700">
                {r.href ? (
                  <a
                    href={r.href}
                    target={r.href.startsWith('http') ? '_blank' : undefined}
                    rel="noreferrer"
                    className="text-brand-700 underline-offset-2 hover:underline"
                  >
                    {r.value}
                  </a>
                ) : (
                  r.value
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-6 text-center text-xs text-stone-300">
        RestaurantOS ile hazırlandı
      </p>
    </footer>
  );
}
