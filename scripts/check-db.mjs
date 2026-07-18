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
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: key, Authorization: `Bearer ${key}` };

async function probe(path) {
  const r = await fetch(`${url}/rest/v1/${path}`, { headers: h });
  const t = await r.text();
  return `${r.status} ${t.slice(0, 200)}`;
}

console.log('categories.background_url ->', await probe('categories?select=id,background_url&limit=1'));
console.log('venues.opening_hours     ->', await probe('venues?select=id,slug,is_published,published_at,opening_hours&limit=5'));
console.log('qr_codes                 ->', await probe('qr_codes?select=code,venue_id,label,is_active&limit=5'));
console.log('scan_events              ->', await probe('scan_events?select=id&limit=1'));
console.log('items count              ->', await probe('items?select=id&limit=200'));
