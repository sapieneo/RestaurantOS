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
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function rest(path, init = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } });
  const t = await r.text();
  return { status: r.status, body: t ? JSON.parse(t) : null };
}

const cmd = process.argv[2];

if (cmd === 'setup') {
  const { body: venues } = await rest('venues?select=id,org_id,slug,is_published&limit=1');
  const v = venues[0];
  console.log('venue:', v);
  await rest('qr_codes?code=in.(testqr01,testqr02)', { method: 'DELETE' });
  const ins = await rest('qr_codes', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([
      { org_id: v.org_id, venue_id: v.id, code: 'testqr01', label: 'Masa 1', is_active: true },
      { org_id: v.org_id, venue_id: v.id, code: 'testqr02', label: 'Eski afiş', is_active: false },
    ]),
  });
  console.log('insert:', ins.status, ins.body);
  console.log('SLUG=' + v.slug);
}

if (cmd === 'publish' || cmd === 'unpublish') {
  const on = cmd === 'publish';
  const { body: venues } = await rest('venues?select=id&limit=1');
  const r = await rest(`venues?id=eq.${venues[0].id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ is_published: on, published_at: on ? new Date().toISOString() : undefined }),
  });
  console.log(cmd, r.status, r.body?.[0]?.is_published, r.body?.[0]?.published_at);
}

if (cmd === 'cleanup') {
  const d = await rest('qr_codes?code=in.(testqr01,testqr02)', { method: 'DELETE' });
  console.log('deleted test codes:', d.status);
}
