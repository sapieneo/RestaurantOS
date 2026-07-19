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
const CODE = 'live1234'; // tam 8 karakter (şema kısıtı ^[a-z0-9]{8}$)

const { body: venues } = await rest('venues?select=id,org_id,slug&limit=1');
const v = venues[0];

// Temiz test kodu + yayınla
await rest(`qr_codes?code=eq.${CODE}`, { method: 'DELETE' });
const ins = await rest('qr_codes', {
  method: 'POST',
  body: JSON.stringify({ org_id: v.org_id, venue_id: v.id, code: CODE, label: 'Canlı test', is_active: true }),
});
console.log('0) QR insert     ->', ins.status);
await rest(`venues?id=eq.${v.id}`, { method: 'PATCH', body: JSON.stringify({ is_published: true }) });
await rest(`scan_events?venue_id=eq.${v.id}`, { method: 'DELETE' });

const ua = { 'User-Agent': 'Mozilla/5.0 (iPhone) Mobile', 'x-forwarded-for': '203.0.113.55' };

// 1) Ana sayfa
console.log('1) ana sayfa      ->', (await fetch(SITE)).status);
// 2) Geçersiz QR (serverless render + notice)
console.log('2) gecersiz QR    ->', (await fetch(`${SITE}/q/zzzzzzzz`, { headers: ua })).status);
// 3) Geçerli QR → 307 misafir menüsüne
const r3 = await fetch(`${SITE}/q/${CODE}`, { headers: ua, redirect: 'manual' });
console.log('3) gecerli QR     ->', r3.status, '->', r3.headers.get('location'));
// 4) Misafir menüsü (anonim, yayında)
console.log('4) misafir menu   ->', (await fetch(`${SITE}/m/${v.slug}`, { headers: ua })).status);
// 5) auth/callback kodsuz → 307 hata yönlendirmesi
const r5 = await fetch(`${SITE}/auth/callback`, { redirect: 'manual' });
console.log('5) auth/callback  ->', r5.status, '->', r5.headers.get('location'));

// Analitik yazıldı mı? (service-role Netlify Function'da çalıştı mı)
await new Promise((r) => setTimeout(r, 2500));
const { body: ev } = await rest(`scan_events?venue_id=eq.${v.id}&select=event_type,device_type,country`);
console.log('\n=== canlida yazilan scan_events ===');
for (const e of ev) console.log(`  ${e.event_type} dev=${e.device_type} ct=${e.country ?? '-'}`);
console.log(`  toplam ${ev.length} olay`);

// Temizlik
await rest(`qr_codes?code=eq.${CODE}`, { method: 'DELETE' });
await rest(`scan_events?venue_id=eq.${v.id}`, { method: 'DELETE' });
await rest(`venues?id=eq.${v.id}`, { method: 'PATCH', body: JSON.stringify({ is_published: false }) });
console.log('temizlendi (kod silindi, yayindan kaldirildi)');
