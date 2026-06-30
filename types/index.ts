// ============================================================
// RestaurantOS — Core Types
// ============================================================

export type PlanType = 'starter' | 'pro' | 'chain'
export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled'

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
  created_at: string
  updated_at: string
  // joined
  allergens?: Allergen[]
  nutrition?: NutritionValues
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
  portion_desc: string | null
  ai_suggested: boolean
  confirmed_at: string | null
}

// ──────────────────────────────────────────────────────────
// OCR Types
// ──────────────────────────────────────────────────────────

export interface OcrMenuItem {
  name: string
  description: string | null
  price: number | null
  category: string
  confidence: number  // 0-1, OCR güven skoru
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
  allergen_ids: string[]          // allergens tablosundaki id'ler
  kcal: number | null
  protein_g: number | null
  fat_g: number | null
  carb_g: number | null
  portion_desc: string
  contains_alcohol: boolean | null
  contains_pork: boolean | null
  confidence: 'high' | 'medium' | 'low'
  confidence_notes: string | null
}

export interface ComplianceScore {
  score: number          // 0-100
  total_items: number
  approved_items: number
  missing_items: number
  status: 'compliant' | 'partial' | 'non_compliant'
}

// ──────────────────────────────────────────────────────────
// Studio Session (multi-step form state)
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
  id: string   // geçici client-side id
  photo_url?: string
  allergen_ids?: string[]
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
