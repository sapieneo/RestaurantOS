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

const BASE = 'http://localhost:3010';
const cmd = process.argv[2];

if (cmd === 'run') {
  // 0) temiz başlangıç
  await rest('scan_events?id=gt.0', { method: 'DELETE' });
  const { body: venues } = await rest('venues?select=id,org_id,slug&limit=1');
  const v = venues[0];
  await rest('qr_codes?code=eq.testqr01', { method: 'DELETE' });
  await rest('qr_codes', {
    method: 'POST',
    body: JSON.stringify({ org_id: v.org_id, venue_id: v.id, code: 'testqr01', label: 'Masa 1', is_active: true }),
  });
  await rest(`venues?id=eq.${v.id}`, { method: 'PATCH', body: JSON.stringify({ is_published: true }) });

  const { body: items } = await rest(`items?select=id,name&org_id=eq.${v.org_id}&limit=1`);
  const item = items[0];

  const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1 Mobile Safari/604.1';
  const guest = { 'User-Agent': ua, 'x-forwarded-for': '203.0.113.9', 'x-vercel-ip-country': 'TR' };

  console.log('1) QR okut  ->', (await fetch(`${BASE}/q/testqr01`, { headers: guest, redirect: 'manual' })).status);
  console.log('2) Menü aç  ->', (await fetch(`${BASE}/m/${v.slug}`, { headers: guest })).status);
  const r3 = await fetch(`${BASE}/api/scan`, {
    method: 'POST',
    headers: { ...guest, 'Content-Type': 'application/json' },
    body: JSON.stringify({ venueId: v.id, itemId: item.id, eventType: 'item_view' }),
  });
  console.log('3) Ürün aç  ->', r3.status, await r3.text());

  // Bot sayılmamalı
  const bot = { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)', 'x-forwarded-for': '203.0.113.9' };
  console.log('4) Bot menü ->', (await fetch(`${BASE}/m/${v.slug}`, { headers: bot })).status);

  // Yayında olmayan venue'ya olay yazılamamalı → önce kaldır
  await rest(`venues?id=eq.${v.id}`, { method: 'PATCH', body: JSON.stringify({ is_published: false }) });
  const r5 = await fetch(`${BASE}/api/scan`, {
    method: 'POST',
    headers: { ...guest, 'Content-Type': 'application/json' },
    body: JSON.stringify({ venueId: v.id, itemId: item.id, eventType: 'item_view' }),
  });
  console.log('5) Yayin disi item_view ->', r5.status, '(404 beklenir)');

  // Baska org'un urunu ile olay
  await rest(`venues?id=eq.${v.id}`, { method: 'PATCH', body: JSON.stringify({ is_published: true }) });
  const r6 = await fetch(`${BASE}/api/scan`, {
    method: 'POST',
    headers: { ...guest, 'Content-Type': 'application/json' },
    body: JSON.stringify({ venueId: v.id, itemId: '00000000-0000-0000-0000-000000000000', eventType: 'item_view' }),
  });
  console.log('6) Sahte itemId ->', r6.status, '(404 beklenir)');

  await new Promise((r) => setTimeout(r, 1500));
  const { body: ev } = await rest('scan_events?select=event_type,device_type,country,session_key,qr_code_id,item_id&order=id');
  console.log('\n=== scan_events ===');
  for (const e of ev) {
    console.log(
      `${e.event_type.padEnd(11)} dev=${e.device_type} ct=${e.country} qr=${e.qr_code_id ? 'var' : '-'} item=${e.item_id ? 'var' : '-'} key=${e.session_key.slice(0, 12)}…`
    );
  }
  const keys = new Set(ev.map((e) => e.session_key));
  console.log(`toplam ${ev.length} olay, ${keys.size} tekil session_key`);
}

if (cmd === 'cleanup') {
  await rest('scan_events?id=gt.0', { method: 'DELETE' });
  await rest('qr_codes?code=eq.testqr01', { method: 'DELETE' });
  const { body: venues } = await rest('venues?select=id&limit=1');
  await rest(`venues?id=eq.${venues[0].id}`, { method: 'PATCH', body: JSON.stringify({ is_published: false }) });
  console.log('temizlendi');
}
