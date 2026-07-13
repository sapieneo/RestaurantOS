/** Desteklenen para birimleri (ISO 4217). Global mimari — kolayca genişletilebilir. */
export const CURRENCIES = [
  { code: 'TRY', symbol: '₺', name: 'Türk Lirası' },
  { code: 'USD', symbol: '$', name: 'ABD Doları' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'İngiliz Sterlini' },
  { code: 'AZN', symbol: '₼', name: 'Azerbaycan Manatı' },
  { code: 'RUB', symbol: '₽', name: 'Rus Rublesi' },
  { code: 'SAR', symbol: 'ر.س', name: 'Suudi Riyali' },
  { code: 'AED', symbol: 'د.إ', name: 'BAE Dirhemi' },
  { code: 'QAR', symbol: 'ر.ق', name: 'Katar Riyali' },
] as const;

const SYMBOLS: Record<string, string> = Object.fromEntries(CURRENCIES.map((c) => [c.code, c.symbol]));

export function currencySymbol(code: string | null | undefined): string {
  return (code && SYMBOLS[code]) || code || '';
}

/** Fiyatı sembolüyle biçimler: 600 → "600 ₺". Boşsa "". */
export function formatPrice(amount: number | null | undefined, code: string): string {
  if (amount == null) return '';
  const n = Number.isInteger(amount) ? amount.toString() : amount.toFixed(2);
  return `${n} ${currencySymbol(code)}`.trim();
}
