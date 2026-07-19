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
const SITE = 'https://restaurantostr.netlify.app';
const ACTIVE = 'live1234';
const INACTIVE = 'live5678';
const ua = { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile', 'x-forwarded-for': '203.0.113.77' };

const pass = (c) => (c ? '✅' : '❌');
const results = [];
const check = (name, cond, detail = '') => results.push(`${pass(cond)} ${name}${detail ? '  ('+detail+')' : ''}`);

// --- SETUP ---
const { body: venues } = await rest('venues?select=id,org_id,slug&limit=1');
const v = venues[0];
const { body: items } = await rest(`items?select=id&org_id=eq.${v.org_id}&limit=1`);
const item = items[0];

await rest(`qr_codes?code=in.(${ACTIVE},${INACTIVE})`, { method: 'DELETE' });
await rest('qr_codes', { method: 'POST', body: JSON.stringify([
  { org_id: v.org_id, venue_id: v.id, code: ACTIVE, label: 'Aktif test', is_active: true },
  { org_id: v.org_id, venue_id: v.id, code: INACTIVE, label: 'Pasif test', is_active: false },
]) });
await rest(`venues?id=eq.${v.id}`, { method: 'PATCH', body: JSON.stringify({ is_published: true }) });
await rest(`scan_events?venue_id=eq.${v.id}`, { method: 'DELETE' });

const get = async (path, opts = {}) => fetch(`${SITE}${path}`, { headers: ua, redirect: 'manual', ...opts });
const text = async (path) => (await fetch(`${SITE}${path}`, { headers: ua })).text();

// --- PUBLIC SAYFALAR ---
check('Ana sayfa 200', (await get('/')).status === 200);
check('/studyo 200', (await get('/studyo')).status === 200);
check('Misafir menü 200', (await get(`/m/${v.slug}`)).status === 200);

// --- QR ÜÇ DURUM ---
const q1 = await get(`/q/${ACTIVE}`);
check('Geçerli QR → 307 menü', q1.status === 307 && (q1.headers.get('location') || '').includes(`/m/${v.slug}`), q1.headers.get('location') || '');
const q2 = await text(`/q/${INACTIVE}`);
check('Pasif QR → "devre dışı"', q2.includes('devre dışı'));
const q3 = await text('/q/zzzzzzzz');
check('Tanımsız QR → "tanımlı değil"', q3.includes('tanımlı değil'));
const q4 = await text('/q/kisa');
check('Geçersiz format → "tanımlı değil"', q4.includes('tanımlı değil'));

// --- AUTH CALLBACK (kanonik domain) ---
const cb = await get('/auth/callback');
check('callback 307 + kanonik domain', cb.status === 307 && (cb.headers.get('location') || '').startsWith(SITE) && !(cb.headers.get('location')||'').includes('main--'), cb.headers.get('location') || '');

// --- API YETKİ KAPILARI (oturumsuz → 401) ---
const j = (b) => ({ method: 'POST', headers: { ...ua, 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
check('POST /api/venue oturumsuz 401', (await get('/api/venue', j({ venueId: v.id, isPublished: true }))).status === 401);
check('POST /api/qr oturumsuz 401', (await get('/api/qr', j({ venueId: v.id }))).status === 401);
check('POST /api/account oturumsuz 401', (await get('/api/account', j({ email: 'x@y.com' }))).status === 401);
check('GET /api/qr/{kod} PNG oturumsuz 401', (await get(`/api/qr/${ACTIVE}?format=png`)).status === 401);

// --- /api/scan doğrulama ---
const scanOk = await get('/api/scan', j({ venueId: v.id, itemId: item.id, eventType: 'item_view' }));
check('/api/scan geçerli → 200', scanOk.status === 200);
const scanBad = await get('/api/scan', j({ venueId: v.id, itemId: '00000000-0000-0000-0000-000000000000', eventType: 'item_view' }));
check('/api/scan sahte ürün → 404', scanBad.status === 404);

// --- Rate limit (aynı IP hızlı) ---
let limited = 0;
for (let i = 0; i < 70; i += 1) {
  const r = await get('/api/scan', j({ venueId: v.id, itemId: item.id, eventType: 'item_view' }));
  if (r.status === 429) limited += 1;
}
check('Rate limit tetikleniyor (429)', limited > 0, `${limited}× 429 / 70 istek`);

// --- ANALİTİK yazıldı mı + ülke ---
await new Promise((r) => setTimeout(r, 2500));
const { body: ev } = await rest(`scan_events?venue_id=eq.${v.id}&select=event_type,country`);
const types = new Set(ev.map((e) => e.event_type));
const withCountry = ev.filter((e) => e.country).length;
check('scan olayı yazıldı', types.has('scan'));
check('menu_view yazıldı', types.has('menu_view'));
check('item_view yazıldı', types.has('item_view'));
console.log(`\nℹ️  toplam ${ev.length} olay, ülke dolu: ${withCountry} (Netlify x-nf-geo gerçek IP'ye bağlı)`);

// --- CLEANUP ---
await rest(`qr_codes?code=in.(${ACTIVE},${INACTIVE})`, { method: 'DELETE' });
await rest(`scan_events?venue_id=eq.${v.id}`, { method: 'DELETE' });
await rest(`venues?id=eq.${v.id}`, { method: 'PATCH', body: JSON.stringify({ is_published: false }) });

console.log('\n===== CANLI TEST SONUÇLARI =====');
for (const r of results) console.log(r);
console.log('\n🧹 test verisi temizlendi (kodlar silindi, yayından kaldırıldı)');
