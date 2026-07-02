// ============================================================
// RestaurantOS — Core Types (Uyum genişletmesi dahil)
// ============================================================

export type PlanType = 'starter' | 'pro' | 'chain'
export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled'
export type MeatType = 'dana' | 'kuzu' | 'tavuk' | 'hindi' | 'balik' | 'karisik' | 'yok'
export type FieldState = 'missing' | 'ai_suggested' | 'confirmed'

// ──────────────────────────────────────────────────────────
// Database Row Types
// ──────────────────────────────────────────────────────────

export interface Restaurant {
  id: string
  user_id: string
  name: string
  slug: string
  phone: string | null
  address: string | null
  website: string | null
  description: string | null
  working_hours: string | null
  instagram: string | null
  logo_url: string | null
  slogan: string | null
  theme: 'classic' | 'fresh' | 'editorial' | 'bistro'
  language: 'tr' | 'tr_en'
  is_published: boolean
  published_at: string | null
  plan: PlanType
  plan_expires_at: string | null
  iyzico_subscription_id: string | null
  created_at: string
  updated_at: string
}

export interface MenuItem {
  id: string
  restaurant_id: string
  category: string
  name: string
  name_en: string | null
  description: string | null
  description_en: string | null
  price: number | null
  photo_url: string | null
  sort_order: number
  is_active: boolean
  // ── Uyum alanları (yeni) ──
  meat_type: MeatType | null
  contains_alcohol: boolean | null
  contains_pork: boolean | null
  declarations_ai_suggested: boolean
  declarations_confirmed_at: string | null
  // ── Mevcut ──
  compliance_approved: boolean
  compliance_approved_at: string | null
  created_at: string
  updated_at: string
  // joined
  allergens?: Allergen[]
  nutrition?: NutritionValues
  ingredients?: Ingredient[]
}

export interface Allergen {
  id: string
  name_tr: string
  name_en: string
  icon_slug: string
  sort_order: number
}

export interface ItemAllergen {
  menu_item_id: string
  allergen_id: string
  ai_suggested: boolean
  confirmed_at: string | null
}

export interface NutritionValues {
  id: string
  menu_item_id: string
  kcal: number | null
  protein_g: number | null
  fat_g: number | null
  carb_g: number | null
  fiber_g: number | null
  portion_g: number | null          // ← yeni: porsiyon ağırlığı (g)
  portion_desc: string | null
  ai_suggested: boolean
  confirmed_at: string | null
}

export interface Ingredient {
  id: string
  menu_item_id: string
  name: string
  sort_order: number
  ai_suggested: boolean
  confirmed_at: string | null
  created_at: string
}

// ──────────────────────────────────────────────────────────
// OCR Types
// ──────────────────────────────────────────────────────────

export interface OcrMenuItem {
  name: string
  description: string | null
  price: number | null
  category: string
  confidence: number
}

export interface OcrResult {
  items: OcrMenuItem[]
  raw_text: string
  low_confidence_detected: boolean
  processing_time_ms: number
}

// ──────────────────────────────────────────────────────────
// Compliance Types
// ──────────────────────────────────────────────────────────

export interface ComplianceAnalysis {
  menu_item_name: string
  allergen_ids: string[]
  ingredients: string[]               // ← yeni: bileşen listesi
  meat_type: MeatType | null          // ← yeni
  kcal: number | null
  protein_g: number | null
  fat_g: number | null
  carb_g: number | null
  portion_g: number | null            // ← yeni
  portion_desc: string
  contains_alcohol: boolean | null
  contains_pork: boolean | null
  confidence: 'high' | 'medium' | 'low'
  confidence_notes: string | null
}

export interface ComplianceScore {
  score: number
  total_items: number
  approved_items: number
  missing_items: number
  status: 'compliant' | 'partial' | 'non_compliant'
}

// ──────────────────────────────────────────────────────────
// Studio Session
// ──────────────────────────────────────────────────────────

export interface StudioSession {
  sessionToken: string
  step: 1 | 2 | 3 | 4 | 5 | 6
  ocrResult?: OcrResult
  editedItems?: EditedMenuItem[]
  complianceResults?: Record<string, ComplianceAnalysis>
  restaurantInfo?: Partial<Restaurant>
  theme?: 'classic' | 'editorial' | 'bistro' | 'fresh'
  language?: 'tr' | 'tr_en'
  restaurantId?: string
}

export interface EditedMenuItem extends OcrMenuItem {
  id: string
  photo_url?: string
  allergen_ids?: string[]
  ingredients?: string[]             // ← yeni: bileşen listesi (string[])
  meat_type?: MeatType | null        // ← yeni
  contains_alcohol?: boolean | null  // ← yeni
  contains_pork?: boolean | null     // ← yeni
  nutrition?: Partial<NutritionValues>
  compliance_approved?: boolean
  compliance_approved_at?: string
}

// ──────────────────────────────────────────────────────────
// API Response Types
// ──────────────────────────────────────────────────────────

export interface ApiResponse<T = void> {
  success: boolean
  data?: T
  error?: string
}

export interface OtpSendResponse {
  sent: boolean
  expires_at: string
}

export interface OtpVerifyResponse {
  verified: boolean
  access_token?: string
  user_id?: string
}

export interface PublishResponse {
  restaurantId: string
  slug: string
  menuUrl: string
  itemsPublished: number
}

export interface MenuSession {
  session_token: string
  restaurant_id: string | null
  created_at: string
  expires_at: string
}

// ──────────────────────────────────────────────────────────
// UI Yardımcılar
// ──────────────────────────────────────────────────────────

/** Bir uyum alanının durumunu hesaplar → kırmızı/sarı/yeşil */
export function fieldState(
  value: unknown,
  aiSuggested: boolean,
  confirmedAt: string | null
): FieldState {
  if (confirmedAt) return 'confirmed'
  if (
    value === null ||
    value === undefined ||
    (Array.isArray(value) && value.length === 0) ||
    value === ''
  ) return 'missing'
  return aiSuggested ? 'ai_suggested' : 'confirmed'
}

/** Bakanlık numaralı alerjen sistemi — sort_order ile eşleşmeli */
export const ALLERGEN_NUMBERS: Record<number, { tr: string; en: string; slug: string }> = {
  1:  { tr: 'Gluten', en: 'Gluten', slug: 'gluten' },
  2:  { tr: 'Kabuklular', en: 'Crustaceans', slug: 'crustacean' },
  3:  { tr: 'Yumurta', en: 'Eggs', slug: 'egg' },
  4:  { tr: 'Balık', en: 'Fish', slug: 'fish' },
  5:  { tr: 'Yer fıstığı', en: 'Peanuts', slug: 'peanut' },
  6:  { tr: 'Soya', en: 'Soy', slug: 'soy' },
  7:  { tr: 'Süt', en: 'Milk', slug: 'milk' },
  8:  { tr: 'Sert kabuklu meyveler', en: 'Tree nuts', slug: 'nuts' },
  9:  { tr: 'Kereviz', en: 'Celery', slug: 'celery' },
  10: { tr: 'Hardal', en: 'Mustard', slug: 'mustard' },
  11: { tr: 'Susam', en: 'Sesame', slug: 'sesame' },
  12: { tr: 'Sülfit', en: 'Sulphites', slug: 'sulphite' },
  13: { tr: 'Acı bakla', en: 'Lupin', slug: 'lupin' },
  14: { tr: 'Yumuşakçalar', en: 'Molluscs', slug: 'mollusc' },
}

/** Et türü Türkçe etiketleri */
export const MEAT_TYPE_LABELS: Record<MeatType, string> = {
  dana: 'Dana',
  kuzu: 'Kuzu',
  tavuk: 'Tavuk',
  hindi: 'Hindi',
  balik: 'Balık',
  karisik: 'Karışık',
  yok: 'Et yok',
}
