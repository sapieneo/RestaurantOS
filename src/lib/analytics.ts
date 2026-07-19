// Yalnız sunucu: node:crypto ve service-role anahtarı kullanır.
// (`server-only` paketi kurulu değil; import istemci bileşenlerinden
// yapılmadığı sürece bundle'a sızmaz.)
import { createHash, randomBytes } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * Çerezsiz misafir analitiği (Faz B3).
 *
 * İlke: misafirin cihazına HİÇBİR ŞEY yazmayız. Tekil ziyaretçiyi ayırmak için
 * hash(günlük salt + ip + user-agent) kullanılır. Salt her gün yeniden üretilir
 * ve HİÇBİR YERDE saklanmaz — böylece aynı kişi ertesi gün eşleştirilemez.
 * Bu, veriyi kişisel veri olmaktan çıkarır: çerez izni bandına gerek kalmaz.
 *
 * DİKKAT: salt'ı env'den sabit vermek bu özelliği bozar. Sabit salt + ip + ua
 * kalıcı bir parmak izidir ve KVKK/GDPR kapsamına girer.
 */

/**
 * Günlük salt SÜREÇ genelinde paylaşılmalı — modül seviyesinde tutmak YETMEZ:
 * Next her route'u ayrı bundle'a derler, bu modül birden çok kez yüklenir ve
 * her kopya kendi salt'ını üretirdi. Sonuç: aynı ziyaretçi /q ve /m'de farklı
 * session_key alır, tekil sayım tamamen bozulur. globalThis tek kopya garantiler.
 *
 * Kabul edilen sınır: çok örnekli (serverless) dağıtımda her örneğin kendi
 * salt'ı olur → tekil sayı bir miktar YÜKSEK çıkar. Asla birleştirme yönünde
 * hata yapmaz, yani gizlilik tarafı güvenlidir.
 */
type SaltStore = { day: string; salt: string };
const g = globalThis as typeof globalThis & { __rosSalt?: SaltStore };

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function dailySalt(): string {
  const day = todayKey();
  if (g.__rosSalt?.day !== day) {
    // Dünün salt'ı ÜZERİNE YAZILIR ve hiçbir yerde saklanmaz →
    // ertesi gün aynı kişi geriye dönük eşleştirilemez.
    g.__rosSalt = { day, salt: randomBytes(32).toString('hex') };
  }
  return g.__rosSalt.salt;
}

/** İstemci IP'si — ters proxy başlıkları öncelikli. */
export function clientIp(h: Headers): string {
  const fwd = h.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return h.get('x-real-ip') ?? h.get('cf-connecting-ip') ?? 'unknown';
}

/** PII içermeyen, günlük dönen oturum anahtarı. */
export function sessionKey(h: Headers): string {
  const ua = h.get('user-agent') ?? '';
  return createHash('sha256').update(`${dailySalt()}|${clientIp(h)}|${ua}`).digest('hex').slice(0, 32);
}

export function deviceType(h: Headers): string {
  const ua = (h.get('user-agent') ?? '').toLowerCase();
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(ua)) return 'tablet';
  if (/mobi|iphone|ipod|android|blackberry|windows phone/.test(ua)) return 'mobile';
  return 'desktop';
}

/**
 * Edge geo başlığı. Barındırıcıya göre değişir:
 * - Netlify: `x-nf-geo` (base64 JSON, içinde country.code)
 * - Vercel:  `x-vercel-ip-country`
 * - Cloudflare: `cf-ipcountry`
 * Yoksa null.
 */
export function countryOf(h: Headers): string | null {
  const direct = h.get('x-vercel-ip-country') ?? h.get('cf-ipcountry');
  if (direct) return direct;
  const nf = h.get('x-nf-geo');
  if (nf) {
    try {
      const geo = JSON.parse(Buffer.from(nf, 'base64').toString('utf8'));
      const code = geo?.country?.code;
      if (typeof code === 'string' && code) return code;
    } catch {
      /* çözülemezse ülke null kalır */
    }
  }
  return null;
}

const BOT_RE = /bot|crawler|spider|crawling|facebookexternalhit|slackbot|whatsapp|telegram|preview|lighthouse|headless/i;

/** Botlar ve link önizlemeleri sayıma girmemeli. */
export function isBot(h: Headers): boolean {
  return BOT_RE.test(h.get('user-agent') ?? '');
}

export type ScanEventType = 'scan' | 'menu_view' | 'item_view' | 'language_switch';

export type RecordEventInput = {
  orgId: string;
  venueId: string;
  eventType: ScanEventType;
  qrCodeId?: string | null;
  itemId?: string | null;
  locale?: string | null;
  headers: Headers;
};

/**
 * Olayı service-role ile yazar.
 *
 * Neden service-role: scan_events'te INSERT policy YOK (0001, bilinçli karar —
 * istemciden sahte olay yazılamasın diye). Yazma yalnız sunucudan yapılır.
 *
 * ASLA throw etmez: analitik, misafir menüsünün render'ını bozmamalı.
 */
export async function recordEvent(input: RecordEventInput): Promise<void> {
  try {
    if (isBot(input.headers)) return;
    const admin = createAdminClient();
    await admin.from('scan_events').insert({
      org_id: input.orgId,
      venue_id: input.venueId,
      qr_code_id: input.qrCodeId ?? null,
      item_id: input.itemId ?? null,
      event_type: input.eventType,
      locale: input.locale ?? null,
      device_type: deviceType(input.headers),
      country: countryOf(input.headers),
      session_key: sessionKey(input.headers),
    });
  } catch {
    // sessiz geç — sayaç kaybı sayfayı bozmaktan iyidir
  }
}
