import { randomInt } from 'node:crypto';

/**
 * QR yönlendirme kodu üretimi.
 *
 * Neden ayrı bir kod katmanı: basılı QR asla değişmez. Kod `qr_codes.code`
 * içinde sabit kalır, hedef venue/slug değişebilir. Slug'ı doğrudan QR'a
 * gömersek slug değiştiği gün tüm basılı materyal ölür.
 *
 * Şema kısıtı (0001): code ~ '^[a-z0-9]{8}$' ve unique.
 */

// Karışması kolay karakterler (0/o, 1/l/i) elenerek okunabilirlik artırıldı.
// Şema [a-z0-9] istediği için büyük harf yok.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE_LENGTH = 8;

export function generateQrCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

/**
 * Uygulamanın public kök adresi. QR görselinin içine gömülen URL bundan
 * türetilir; yanlış olursa basılan QR yanlış yere gider, bu yüzden env
 * öncelikli, istek başlığı yedek.
 */
export function siteOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  const url = new URL(request.url);
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (forwardedHost) return `${forwardedProto ?? url.protocol.replace(':', '')}://${forwardedHost}`;
  return url.origin;
}

export function qrTargetUrl(origin: string, code: string): string {
  return `${origin}/q/${code}`;
}
