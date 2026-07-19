import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);
const U = env.NEXT_PUBLIC_SUPABASE_URL;
const K = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' };
const rest = async (p, i = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...i, headers: { ...H, ...(i.headers ?? {}) } });
  const t = await r.text();
  return { status: r.status, body: t ? JSON.parse(t) : null };
};

const cmd = process.argv[2];
const { body: venues } = await rest('venues?select=id,org_id&limit=1');
const v = venues[0];

if (cmd === 'seed') {
  await rest(`scan_events?venue_id=eq.${v.id}`, { method: 'DELETE' });
  const rows = [];
  const types = ['scan', 'menu_view', 'item_view'];
  // 40 olay, son 12 güne dağıt, 5 farklı session_key
  for (let i = 0; i < 40; i += 1) {
    const daysAgo = i % 12;
    const when = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    rows.push({
      org_id: v.org_id,
      venue_id: v.id,
      event_type: types[i % 3],
      session_key: 'sess' + (i % 5),
      device_type: 'mobile',
      occurred_at: when.toISOString(),
    });
  }
  const r = await rest('scan_events', { method: 'POST', body: JSON.stringify(rows) });
  console.log('seed:', r.status, rows.length, 'olay eklendi');
}

if (cmd === 'verify') {
  // page.tsx ile AYNI toplama mantığı — beklenen sayıları çıkar
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const { body: ev } = await rest(
    `scan_events?venue_id=eq.${v.id}&occurred_at=gte.${since.toISOString()}&select=event_type,occurred_at,session_key&order=occurred_at`
  );
  let scans = 0, menuViews = 0, itemViews = 0;
  const uniq = new Set();
  const dayIndex = new Map();
  const days = [];
  for (let i = 29; i >= 0; i -= 1) {
    const key = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    dayIndex.set(key, days.length);
    days.push({ date: key, scans: 0, views: 0 });
  }
  for (const e of ev) {
    if (e.event_type === 'scan') scans++;
    else if (e.event_type === 'menu_view') menuViews++;
    else if (e.event_type === 'item_view') itemViews++;
    if (e.session_key) uniq.add(e.session_key);
    const idx = dayIndex.get(e.occurred_at.slice(0, 10));
    if (idx != null) {
      if (e.event_type === 'scan') days[idx].scans++;
      if (e.event_type === 'menu_view') days[idx].views++;
    }
  }
  const nonEmpty = days.filter((d) => d.scans || d.views).length;
  console.log('toplam olay :', ev.length);
  console.log('scan/menu/item:', scans, menuViews, itemViews);
  console.log('tekil ziyaretçi:', uniq.size, '(beklenen 5)');
  console.log('dolu gün kovası:', nonEmpty);
  const maxDay = days.reduce((m, d) => Math.max(m, d.scans + d.views), 0);
  console.log('en yoğun gün toplamı:', maxDay);
}

if (cmd === 'cleanup') {
  await rest(`scan_events?venue_id=eq.${v.id}`, { method: 'DELETE' });
  console.log('temizlendi');
}
