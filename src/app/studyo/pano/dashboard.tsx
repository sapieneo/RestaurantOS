export type DayBucket = { date: string; scans: number; views: number };

export type DashboardData = {
  venueName: string;
  slug: string;
  isPublished: boolean;
  publishedAt: string | null;
  isAnonymous: boolean;
  itemCount: number;
  pendingCount: number;
  qrActive: number;
  stats: {
    scans: number;
    menuViews: number;
    itemViews: number;
    uniqueVisitors: number;
    totalEvents: number;
  };
  days: DayBucket[];
};

export function Dashboard({ data }: { data: DashboardData }) {
  const hasAnalytics = data.stats.totalEvents > 0;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-brand-600">Pano</p>
          <h1 className="mt-1 text-2xl font-bold">{data.venueName}</h1>
        </div>
        <div className="flex items-center gap-2">
          {data.isPublished ? (
            <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
              CANLI
            </span>
          ) : (
            <span className="rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-white">
              TASLAK
            </span>
          )}
          <a
            href={`/m/${data.slug}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-brand-300 px-3 py-1.5 text-sm font-medium text-brand-700 transition hover:bg-brand-50"
          >
            👁 Menüyü gör
          </a>
        </div>
      </header>

      {/* Uyarı bantları */}
      {data.isAnonymous && (
        <Banner
          tone="amber"
          text="Hesabın geçici — menün yalnız bu tarayıcıya bağlı. E-postanı ekleyerek güvene al."
          cta={{ href: '/studyo/hesap', label: 'Hesabı güvene al' }}
        />
      )}
      {!data.isPublished && (
        <Banner
          tone="amber"
          text="Menün henüz yayında değil. Yayınladığında bağlantı ve QR herkese açılır."
          cta={{ href: '/studyo/ayarlar', label: 'Yayınla' }}
        />
      )}
      {data.pendingCount > 0 && (
        <Banner
          tone="stone"
          text={`${data.pendingCount}/${data.itemCount} ürünün alerjen onayı bekliyor. Onaylanmayan ürünlerde misafir alerjen bilgisi göremez.`}
          cta={{ href: '/studyo', label: 'Uyum ekranı' }}
        />
      )}

      {/* Durum kartları */}
      <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Ürün" value={data.itemCount} href="/studyo/ayarlar" />
        <StatCard
          label="Onaylı ürün"
          value={data.itemCount - data.pendingCount}
          sub={`/ ${data.itemCount}`}
        />
        <StatCard label="Aktif QR" value={data.qrActive} href="/studyo/qr" />
        <StatCard label="30 gün tarama" value={data.stats.scans} />
      </section>

      {/* Analitik */}
      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-stone-400">
            Son 30 gün
          </h2>
          <span className="text-xs text-stone-400">çerezsiz · tekil ziyaretçi tahmini</span>
        </div>

        {hasAnalytics ? (
          <>
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MiniStat label="QR tarama" value={data.stats.scans} />
              <MiniStat label="Menü görüntüleme" value={data.stats.menuViews} />
              <MiniStat label="Ürün görüntüleme" value={data.stats.itemViews} />
              <MiniStat label="Tekil ziyaretçi" value={data.stats.uniqueVisitors} />
            </div>
            <DayChart days={data.days} />
            <div className="mt-3 flex items-center gap-4 text-xs text-stone-500">
              <Legend className="bg-brand-600" label="Menü görüntüleme" />
              <Legend className="bg-emerald-500" label="QR tarama" />
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <span className="text-3xl">📈</span>
            <p className="font-medium text-stone-700">Henüz tarama verisi yok</p>
            <p className="max-w-sm text-sm text-stone-500">
              {data.isPublished
                ? 'QR kodunu bastırıp masalara koy; misafirler okuttukça buradaki grafik dolmaya başlar.'
                : 'Menünü yayınla ve QR kodunu paylaş; ziyaretçi verisi burada birikir.'}
            </p>
            <a
              href="/studyo/qr"
              className="mt-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-brand-700"
            >
              QR kodu al
            </a>
          </div>
        )}
      </section>

      {/* Hızlı eylemler */}
      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <QuickLink href="/studyo" icon="📸" label="Menü / yükle" />
        <QuickLink href="/studyo/gorseller" icon="🎨" label="Görseller" />
        <QuickLink href="/studyo/qr" icon="🔳" label="QR kodları" />
        <QuickLink href="/studyo/ayarlar" icon="⚙️" label="Ayarlar" />
      </section>
    </main>
  );
}

/** 30 günlük yığılmış bar grafik — saf SVG, istemci JS yok. */
function DayChart({ days }: { days: DayBucket[] }) {
  const W = 720;
  const H = 160;
  const pad = { top: 8, right: 8, bottom: 18, left: 24 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const max = Math.max(1, ...days.map((d) => d.scans + d.views));
  const step = innerW / days.length;
  const barW = Math.max(3, step * 0.7);
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;

  const ticks = [0, Math.ceil(max / 2), max];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Günlük tarama grafiği">
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={pad.left}
            x2={W - pad.right}
            y1={y(t)}
            y2={y(t)}
            stroke="#f1f0ee"
            strokeWidth={1}
          />
          <text x={pad.left - 4} y={y(t) + 3} textAnchor="end" fontSize={8} fill="#a8a29e">
            {t}
          </text>
        </g>
      ))}
      {days.map((d, i) => {
        const x = pad.left + i * step + (step - barW) / 2;
        const viewsH = pad.top + innerH - y(d.views);
        const scansH = pad.top + innerH - y(d.scans);
        const showLabel = i % 5 === 0;
        return (
          <g key={d.date}>
            <rect x={x} y={y(d.views)} width={barW} height={viewsH} rx={1} className="fill-brand-600" />
            <rect
              x={x}
              y={y(d.views) - scansH}
              width={barW}
              height={scansH}
              rx={1}
              fill="#10b981"
            />
            {showLabel && (
              <text x={x + barW / 2} y={H - 6} textAnchor="middle" fontSize={7.5} fill="#a8a29e">
                {d.date.slice(5)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function Banner({
  tone,
  text,
  cta,
}: {
  tone: 'amber' | 'stone';
  text: string;
  cta: { href: string; label: string };
}) {
  const cls =
    tone === 'amber'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-stone-200 bg-stone-50 text-stone-700';
  return (
    <div className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm ${cls}`}>
      <span>{text}</span>
      <a
        href={cta.href}
        className="shrink-0 rounded-lg bg-stone-900 px-3 py-1.5 font-semibold text-white transition hover:bg-stone-800"
      >
        {cta.label}
      </a>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: number;
  sub?: string;
  href?: string;
}) {
  const inner = (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-brand-300">
      <p className="text-xs font-medium uppercase tracking-wide text-stone-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-stone-800">
        {value}
        {sub && <span className="ml-1 text-sm font-normal text-stone-400">{sub}</span>}
      </p>
    </div>
  );
  return href ? <a href={href}>{inner}</a> : inner;
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-stone-50 px-3 py-2">
      <p className="text-lg font-bold text-stone-800">{value}</p>
      <p className="text-xs text-stone-500">{label}</p>
    </div>
  );
}

function QuickLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <a
      href={href}
      className="flex flex-col items-center gap-1.5 rounded-2xl border border-stone-200 bg-white p-4 text-center shadow-sm transition hover:border-brand-300 hover:bg-brand-50/40"
    >
      <span className="text-2xl" aria-hidden>
        {icon}
      </span>
      <span className="text-sm font-medium text-stone-700">{label}</span>
    </a>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-sm ${className}`} />
      {label}
    </span>
  );
}
