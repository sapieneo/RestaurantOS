import { ALLERGEN_CODES } from '@/lib/schemas/menu';

export type AllergenCode = (typeof ALLERGEN_CODES)[number];

/** 0001_init.sql seed'iyle birebir: TR/EN adı + matris kısaltması. */
export const ALLERGENS: Record<
  AllergenCode,
  { id: number; tr: string; en: string; abbr: string; region: 'EU' | 'TR' }
> = {
  gluten:      { id: 1,  tr: 'Glüten',        en: 'Gluten',       abbr: 'Glü', region: 'EU' },
  crustaceans: { id: 2,  tr: 'Kabuklular',    en: 'Crustaceans',  abbr: 'Kab', region: 'EU' },
  eggs:        { id: 3,  tr: 'Yumurta',       en: 'Eggs',         abbr: 'Yum', region: 'EU' },
  fish:        { id: 4,  tr: 'Balık',         en: 'Fish',         abbr: 'Bal', region: 'EU' },
  peanuts:     { id: 5,  tr: 'Yer fıstığı',   en: 'Peanuts',      abbr: 'Yfs', region: 'EU' },
  soybeans:    { id: 6,  tr: 'Soya',          en: 'Soybeans',     abbr: 'Soy', region: 'EU' },
  milk:        { id: 7,  tr: 'Süt',           en: 'Milk',         abbr: 'Süt', region: 'EU' },
  nuts:        { id: 8,  tr: 'Kabuklu yemiş', en: 'Tree nuts',    abbr: 'Kby', region: 'EU' },
  celery:      { id: 9,  tr: 'Kereviz',       en: 'Celery',       abbr: 'Krz', region: 'EU' },
  mustard:     { id: 10, tr: 'Hardal',        en: 'Mustard',      abbr: 'Har', region: 'EU' },
  sesame:      { id: 11, tr: 'Susam',         en: 'Sesame',       abbr: 'Sus', region: 'EU' },
  sulphites:   { id: 12, tr: 'Sülfit',        en: 'Sulphites',    abbr: 'Sül', region: 'EU' },
  lupin:       { id: 13, tr: 'Lüpen',         en: 'Lupin',        abbr: 'Lüp', region: 'EU' },
  molluscs:    { id: 14, tr: 'Yumuşakça',     en: 'Molluscs',     abbr: 'Ymş', region: 'EU' },
  alcohol:     { id: 15, tr: 'Alkol',         en: 'Alcohol',      abbr: 'Alk', region: 'TR' },
  pork:        { id: 16, tr: 'Domuz',         en: 'Pork',         abbr: 'Dom', region: 'TR' },
};

/** id → code haritası (report/rpc geri çözümleri için). */
export const CODE_BY_ID: Record<number, AllergenCode> = Object.fromEntries(
  (Object.keys(ALLERGENS) as AllergenCode[]).map((c) => [ALLERGENS[c].id, c])
) as Record<number, AllergenCode>;

export function allergenTr(code: string): string {
  return (ALLERGENS as Record<string, { tr: string }>)[code]?.tr ?? code;
}
