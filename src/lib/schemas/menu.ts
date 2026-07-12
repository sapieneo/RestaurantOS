import { z } from 'zod';

/** 0001_init.sql'deki allergens.code seed'iyle birebir aynı liste. */
export const ALLERGEN_CODES = [
  'gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soybeans',
  'milk', 'nuts', 'celery', 'mustard', 'sesame', 'sulphites',
  'lupin', 'molluscs', 'alcohol', 'pork',
] as const;

export const allergenSuggestionSchema = z.object({
  code: z.enum(ALLERGEN_CODES),
  confidence: z.number().min(0).max(1),
});

export const extractedItemSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  price: z.number().min(0).nullish(),
  calories_kcal: z.number().int().min(0).max(20000).nullish(),
  allergens: z.array(allergenSuggestionSchema).default([]),
});

export const extractedCategorySchema = z.object({
  name: z.string().min(1).max(120),
  items: z.array(extractedItemSchema).default([]),
});

/** Claude'un submit_menu aracına vermesi zorunlu şema. */
export const extractedMenuSchema = z.object({
  menu_name: z.string().min(1).max(120).default('Menü'),
  currency_guess: z.string().length(3).nullish(), // ISO 4217 tahmini
  language_guess: z.string().min(2).max(5).nullish(), // BCP 47 tahmini
  categories: z.array(extractedCategorySchema).min(1),
  warnings: z.array(z.string()).default([]), // okunamayan bölümler vb.
});

export type ExtractedMenu = z.infer<typeof extractedMenuSchema>;
export type ExtractedCategory = z.infer<typeof extractedCategorySchema>;
export type ExtractedItem = z.infer<typeof extractedItemSchema>;

/** menu_ingestions.raw_result alanının tam şekli. */
export const rawResultSchema = z.object({
  extracted: extractedMenuSchema,
  /** Onay (approve) idempotency'si: yeniden onaylanırsa eski menü silinip yenisi yazılır. */
  created_menu_id: z.string().uuid().nullish(),
  model: z.string(),
  extracted_at: z.string(),
});

export type RawResult = z.infer<typeof rawResultSchema>;
