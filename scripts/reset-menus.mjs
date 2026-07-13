// Test verisi sıfırlama: tüm menüleri (cascade: kategori/ürün/alerjen/diyet/uyum)
// ve menü yükleme kayıtlarını siler. org/venue ve üyelik KORUNUR.
// Çalıştır:  node scripts/reset-menus.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(here, '..', '.env.local'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ALL = '00000000-0000-0000-0000-000000000000';

const m = await admin.from('menus').delete().neq('id', ALL).select('id');
console.log('Silinen menü:', m.data?.length ?? 0, m.error?.message ?? '');

const i = await admin.from('menu_ingestions').delete().neq('id', ALL).select('id');
console.log('Silinen yükleme:', i.data?.length ?? 0, i.error?.message ?? '');

console.log('Sıfırlama tamam. org + venue korundu; yeni yükleme temiz menü oluşturur.');
