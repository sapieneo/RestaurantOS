import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';

const db = new PGlite();
const sql = readFileSync(new URL('../supabase/migrations/0001_init.sql', import.meta.url), 'utf8');
const sql3 = readFileSync(new URL('../supabase/migrations/0003_compliance.sql', import.meta.url), 'utf8');
const sql4 = readFileSync(new URL('../supabase/migrations/0004_menu_enrichment.sql', import.meta.url), 'utf8');

// --- Supabase ortam stub'u ---
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role authenticated;
  create role anon;
`);

// --- Migration ---
try { await db.exec(sql); } catch (e) { console.error("MIGRATION HATA:", e.message); process.exit(1); }
try { await db.exec(sql3); } catch (e) { console.error("MIGRATION 0003 HATA:", e.message); process.exit(1); }
try { await db.exec(sql4); } catch (e) { console.error("MIGRATION 0004 HATA:", e.message); process.exit(1); }
console.log('MIGRATION OK');

// Supabase varsayilan grant'leri
await db.exec(`
  grant usage on schema public, app to authenticated, anon;
  grant all on all tables in schema public to authenticated;
  grant select on all tables in schema public to anon;
  grant execute on all functions in schema app to authenticated, anon;
`);

// --- Smoke test: kullanici olustur, org ac, owner trigger'i dogrula ---
const uid = '11111111-1111-1111-1111-111111111111';
await db.exec(`insert into auth.users (id, email) values ('${uid}', 'test@ros.app');`);
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);

await db.exec(`insert into public.organizations (name) values ('Test Org');`);
const org = (await db.query(`select id, plan from public.organizations`)).rows[0];
const mem = (await db.query(`select role from public.organization_members`)).rows[0];
console.log('ORG OK  plan=' + org.plan + '  auto-owner=' + mem.role);

// --- Zincir: venue -> menu -> category -> item (org_id trigger'la dolmali) ---
await db.exec(`insert into public.venues (org_id, slug, name) values ('${org.id}', 'deniz-kafe', 'Deniz Kafe');`);
const venue = (await db.query(`select id, org_id, is_published from public.venues`)).rows[0];
await db.exec(`insert into public.menus (venue_id, name) values ('${venue.id}', 'Ana Menü');`);
const menu = (await db.query(`select id, org_id from public.menus`)).rows[0];
await db.exec(`insert into public.categories (menu_id, name) values ('${menu.id}', 'Kahvaltı');`);
const cat = (await db.query(`select id, org_id from public.categories`)).rows[0];
await db.exec(`insert into public.items (category_id, name, price) values ('${cat.id}', 'Menemen', 185.00);`);
const item = (await db.query(`select id, org_id from public.items`)).rows[0];
const filled = [menu, cat, item].every(r => r.org_id === org.id);
console.log('FILL_ORG_ID ' + (filled ? 'OK' : 'FAIL'));

// alerjen: biri ai_suggested biri confirmed
await db.exec(`insert into public.item_allergens (item_id, allergen_id, state, confidence) values ('${item.id}', 3, 'ai_suggested', 0.91);`);
await db.exec(`insert into public.item_allergens (item_id, allergen_id, state, confirmed_by, confirmed_at) values ('${item.id}', 7, 'confirmed', '${uid}', now());`);

// --- RLS: anon, yayinlanmamis venue'yu GOREMEMELI ---
await db.exec(`reset role; set role anon; select set_config('request.jwt.claim.sub', '', false);`);
let rows = (await db.query(`select id from public.venues`)).rows;
console.log('ANON draft-venue gizli: ' + (rows.length === 0 ? 'OK' : 'FAIL'));
rows = (await db.query(`select id from public.items`)).rows;
console.log('ANON draft-item gizli: ' + (rows.length === 0 ? 'OK' : 'FAIL'));

// --- Yayinla, anon artik gormeli; alerjenlerden YALNIZ confirmed gorunmeli ---
await db.exec(`reset role;`);
await db.exec(`update public.venues set is_published = true, published_at = now();`);
await db.exec(`set role anon;`);
rows = (await db.query(`select id from public.venues`)).rows;
console.log('ANON yayinli-venue gorunur: ' + (rows.length === 1 ? 'OK' : 'FAIL'));
rows = (await db.query(`select id from public.items`)).rows;
console.log('ANON yayinli-item gorunur: ' + (rows.length === 1 ? 'OK' : 'FAIL'));
rows = (await db.query(`select allergen_id, state from public.item_allergens`)).rows;
console.log('ANON yalniz confirmed alerjen: ' + (rows.length === 1 && rows[0].state === 'confirmed' ? 'OK' : 'FAIL — ' + JSON.stringify(rows)));

// compliance ic tablosu anon'a kapali mi
rows = (await db.query(`select * from public.item_compliance`)).rows;
console.log('ANON item_compliance gizli: ' + (rows.length === 0 ? 'OK' : 'FAIL'));

// scan_events'e anon insert engelli mi
let blocked = false;
try { await db.exec(`insert into public.scan_events (org_id, venue_id, event_type) values ('${org.id}', '${venue.id}', 'scan');`); }
catch { blocked = true; }
console.log('ANON scan_events insert engelli: ' + (blocked ? 'OK' : 'FAIL'));

// --- Baska kullanici, baskasinin org'unu goremez ---
await db.exec(`reset role;`);
const uid2 = '22222222-2222-2222-2222-222222222222';
await db.exec(`insert into auth.users (id) values ('${uid2}');`);
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid2}', false);`);
rows = (await db.query(`select id from public.organizations`)).rows;
console.log('Yabanci org gizli: ' + (rows.length === 0 ? 'OK' : 'FAIL'));
blocked = false;
try { await db.exec(`insert into public.menus (venue_id, name) values ('${venue.id}', 'Sizinti');`); }
catch { blocked = true; }
console.log('Yabanci org icine yazma engelli: ' + (blocked ? 'OK' : 'FAIL'));

await db.exec(`reset role;`);
console.log('Alerjen seed: ' + ((await db.query(`select count(*)::int as c from public.allergens`)).rows[0].c) + ' satır');

// ============================================================================
// M2 — Uyum motoru onay akışı
// ============================================================================
// Sahibi ol
await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);

// Onay öncesi rozet sinyali kapalı olmalı
let r = (await db.query(`select allergens_confirmed from public.items where id='${item.id}'`)).rows[0];
console.log('M2 onay öncesi rozet kapalı: ' + (r.allergens_confirmed === false ? 'OK' : 'FAIL'));

// confirm: eggs+milk alerjen + vegetarian diyet + kalori onayla
await db.exec(`select public.confirm_item_compliance('${item.id}', array['eggs','milk'], array['vegetarian']::text[], true);`);
r = (await db.query(`select t.code from public.item_dietary d join public.dietary_tags t on t.id=d.tag_id where d.item_id='${item.id}' and d.state='confirmed'`)).rows;
console.log('M2 diyet rozeti confirmed: ' + (r.length === 1 && r[0].code === 'vegetarian' ? 'OK' : 'FAIL — ' + JSON.stringify(r)));

r = (await db.query(`select state, confirmed_by from public.item_allergens where item_id='${item.id}' order by allergen_id`)).rows;
const allConfirmed = r.length === 2 && r.every(x => x.state === 'confirmed' && x.confirmed_by === uid);
console.log('M2 alerjenler confirmed + confirmed_by damgalı: ' + (allConfirmed ? 'OK' : 'FAIL — ' + JSON.stringify(r)));

r = (await db.query(`select allergens_confirmed from public.items where id='${item.id}'`)).rows[0];
console.log('M2 rozet sinyali açıldı: ' + (r.allergens_confirmed === true ? 'OK' : 'FAIL'));

r = (await db.query(`select allergen_review, calories_review, reviewed_by from public.item_compliance where item_id='${item.id}'`)).rows[0];
console.log('M2 item_compliance onay+kalori+damga: ' +
  ((r && r.allergen_review === 'confirmed' && r.calories_review === 'confirmed' && r.reviewed_by === uid) ? 'OK' : 'FAIL — ' + JSON.stringify(r)));

// confirm sette olmayan alerjeni siler: sadece 'gluten' bırak
await db.exec(`select public.confirm_item_compliance('${item.id}', array['gluten'], array[]::text[], false);`);
r = (await db.query(`select allergen_id from public.item_allergens where item_id='${item.id}'`)).rows;
console.log('M2 set dışı alerjen kaldırıldı (yalnız gluten): ' + (r.length === 1 && r[0].allergen_id === 1 ? 'OK' : 'FAIL — ' + JSON.stringify(r)));

// Misafir rozet sinyalini görür (yayınlı item)
await db.exec(`reset role; set role anon; select set_config('request.jwt.claim.sub', '', false);`);
r = (await db.query(`select allergens_confirmed from public.items where id='${item.id}'`)).rows[0];
console.log('ANON rozet sinyalini görür: ' + (r && r.allergens_confirmed === true ? 'OK' : 'FAIL'));

// Yabancı kullanıcı confirm çağıramaz (yetki hatası)
await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${uid2}', false);`);
let denied = false;
try { await db.exec(`select public.confirm_item_compliance('${item.id}', array['eggs'], false);`); }
catch { denied = true; }
console.log('M2 yabancı confirm engelli: ' + (denied ? 'OK' : 'FAIL'));

// Sahibi onayı geri alır
await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
await db.exec(`select public.unconfirm_item_compliance('${item.id}');`);
r = (await db.query(`select allergens_confirmed from public.items where id='${item.id}'`)).rows[0];
const st = (await db.query(`select state from public.item_allergens where item_id='${item.id}'`)).rows;
console.log('M2 unconfirm rozet kapatır + ai_suggested: ' +
  ((r.allergens_confirmed === false && st.every(x => x.state === 'ai_suggested')) ? 'OK' : 'FAIL'));

await db.exec(`reset role;`);
console.log('TÜM TESTLER TAMAM');
