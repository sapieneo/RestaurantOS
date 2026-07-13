import { DIETARY_CODES } from '@/lib/schemas/menu';

export type DietaryCode = (typeof DIETARY_CODES)[number];

/** 0004_menu_enrichment.sql'deki dietary_tags seed'iyle birebir. */
export const DIETARY: Record<DietaryCode, { id: number; tr: string; en: string; emoji: string }> = {
  halal: { id: 1, tr: 'Helal', en: 'Halal', emoji: '☪️' },
  alcohol_free: { id: 2, tr: 'Alkolsüz', en: 'Alcohol-free', emoji: '🚫' },
  vegan: { id: 3, tr: 'Vegan', en: 'Vegan', emoji: '🌱' },
  vegetarian: { id: 4, tr: 'Vejetaryen', en: 'Vegetarian', emoji: '🥗' },
};

export const DIETARY_CODE_BY_ID: Record<number, DietaryCode> = Object.fromEntries(
  (Object.keys(DIETARY) as DietaryCode[]).map((c) => [DIETARY[c].id, c])
) as Record<number, DietaryCode>;

export function dietaryTr(code: string): string {
  return (DIETARY as Record<string, { tr: string }>)[code]?.tr ?? code;
}
