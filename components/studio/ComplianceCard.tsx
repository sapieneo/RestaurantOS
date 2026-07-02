'use client'

import { useState, useCallback, useMemo } from 'react'
import {
  ChevronDown, ChevronUp, Plus, X, Check,
  AlertTriangle, ShieldCheck, Flame, Droplets
} from 'lucide-react'
import type { ComplianceAnalysis, MeatType, FieldState } from '@/types'
import { MEAT_TYPE_LABELS } from '@/types'

// ── Alerjen listesi (bakanlık numaralı) ──
const ALLERGENS = [
  { no: 1, slug: 'gluten', label: 'Gluten', emoji: '🌾' },
  { no: 2, slug: 'crustacean', label: 'Kabuklular', emoji: '🦐' },
  { no: 3, slug: 'egg', label: 'Yumurta', emoji: '🥚' },
  { no: 4, slug: 'fish', label: 'Balık', emoji: '🐟' },
  { no: 5, slug: 'peanut', label: 'Yer fıstığı', emoji: '🥜' },
  { no: 6, slug: 'soy', label: 'Soya', emoji: '🫘' },
  { no: 7, slug: 'milk', label: 'Süt', emoji: '🥛' },
  { no: 8, slug: 'nuts', label: 'Sert kabuklu', emoji: '🌰' },
  { no: 9, slug: 'celery', label: 'Kereviz', emoji: '🥬' },
  { no: 10, slug: 'mustard', label: 'Hardal', emoji: '🌭' },
  { no: 11, slug: 'sesame', label: 'Susam', emoji: '🟡' },
  { no: 12, slug: 'sulphite', label: 'Sülfit', emoji: '⚗️' },
  { no: 13, slug: 'lupin', label: 'Acı bakla', emoji: '🌿' },
  { no: 14, slug: 'mollusc', label: 'Yumuşakça', emoji: '🦑' },
]

const MEAT_OPTIONS: MeatType[] = ['dana', 'kuzu', 'tavuk', 'hindi', 'balik', 'karisik', 'yok']

// ── Props ──
interface ComplianceCardProps {
  itemId: string
  itemName: string
  itemPrice?: number | null
  itemCategory?: string
  compliance: ComplianceAnalysis | null
  onSave: (itemId: string, data: ComplianceCardData) => void
  defaultOpen?: boolean
}

export interface ComplianceCardData {
  ingredients: string[]
  allergen_slugs: string[]
  meat_type: MeatType | null
  kcal: number | null
  portion_g: number | null
  contains_alcohol: boolean | null
  contains_pork: boolean | null
  protein_g: number | null
  fat_g: number | null
  carb_g: number | null
  confirmed: boolean
  confirmed_at: string | null
}

// ── Helper ──
function getFieldState(value: unknown, aiHasValue: boolean, confirmed: boolean): FieldState {
  if (confirmed) return 'confirmed'
  if (value === null || value === undefined || (Array.isArray(value) && value.length === 0) || value === '') return 'missing'
  return aiHasValue ? 'ai_suggested' : 'confirmed'
}

function statusColor(state: FieldState) {
  if (state === 'missing') return 'border-red-400 bg-red-50 text-red-700'
  if (state === 'ai_suggested') return 'border-amber-400 bg-amber-50 text-amber-700'
  return 'border-emerald-400 bg-emerald-50 text-emerald-700'
}

function statusLabel(state: FieldState) {
  if (state === 'missing') return 'Eksik'
  if (state === 'ai_suggested') return 'AI önerisi'
  return 'Onaylı'
}

// ── Component ──
export default function ComplianceCard({
  itemId, itemName, itemPrice, itemCategory,
  compliance, onSave, defaultOpen = false,
}: ComplianceCardProps) {
  const [open, setOpen] = useState(defaultOpen)
  const [confirmed, setConfirmed] = useState(false)
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null)
  const [touched, setTouched] = useState(false) // kullanıcı herhangi bir alana dokundu mu?

  // ── Editable state (AI verisinden başlatılır) ──
  const [ingredients, setIngredients] = useState<string[]>(compliance?.ingredients ?? [])
  const [newIngredient, setNewIngredient] = useState('')
  const [allergenSlugs, setAllergenSlugs] = useState<string[]>(compliance?.allergen_ids ?? [])
  const [meatType, setMeatType] = useState<MeatType | null>(compliance?.meat_type ?? null)
  const [kcal, setKcal] = useState<string>(compliance?.kcal?.toString() ?? '')
  const [portionG, setPortionG] = useState<string>(compliance?.portion_g?.toString() ?? '')
  const [containsAlcohol, setContainsAlcohol] = useState<boolean | null>(compliance?.contains_alcohol ?? null)
  const [containsPork, setContainsPork] = useState<boolean | null>(compliance?.contains_pork ?? null)
  const [proteinG, setProteinG] = useState<string>(compliance?.protein_g?.toString() ?? '')
  const [fatG, setFatG] = useState<string>(compliance?.fat_g?.toString() ?? '')
  const [carbG, setCarbG] = useState<string>(compliance?.carb_g?.toString() ?? '')

  const aiProvided = compliance !== null
  const isAiField = aiProvided && !touched

  // ── Eksik alan sayısı ──
  const missingCount = useMemo(() => {
    let c = 0
    if (ingredients.length === 0) c++
    if (meatType === null) c++
    if (allergenSlugs.length === 0 && !confirmed) { /* allergen boş olabilir — et yok ise */ }
    if (kcal === '') c++
    if (portionG === '') c++
    if (containsAlcohol === null) c++
    if (containsPork === null) c++
    return c
  }, [ingredients, meatType, kcal, portionG, containsAlcohol, containsPork, confirmed])

  // ── Genel durum ──
  const overallState: FieldState = confirmed ? 'confirmed' : missingCount > 0 ? 'missing' : aiProvided ? 'ai_suggested' : 'missing'

  // ── Handlers ──
  const markTouched = useCallback(() => { if (!touched) setTouched(true) }, [touched])

  const addIngredient = useCallback(() => {
    const v = newIngredient.trim()
    if (!v) return
    setIngredients(prev => [...prev, v])
    setNewIngredient('')
    markTouched()
  }, [newIngredient, markTouched])

  const removeIngredient = useCallback((idx: number) => {
    setIngredients(prev => prev.filter((_, i) => i !== idx))
    markTouched()
  }, [markTouched])

  const toggleAllergen = useCallback((slug: string) => {
    setAllergenSlugs(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug])
    markTouched()
  }, [markTouched])

  const handleConfirm = useCallback(() => {
    // Zorunlu alanları kontrol et
    if (ingredients.length === 0) { alert('İçindekiler listesi boş olamaz.'); return }
    if (meatType === null) { alert('Et türünü seçin.'); return }
    if (kcal === '') { alert('Kalori bilgisini girin.'); return }
    if (portionG === '') { alert('Gramaj bilgisini girin.'); return }
    if (containsAlcohol === null) { alert('Alkol beyanını yapın.'); return }
    if (containsPork === null) { alert('Domuz türevi beyanını yapın.'); return }

    const now = new Date().toISOString()
    setConfirmed(true)
    setConfirmedAt(now)

    onSave(itemId, {
      ingredients,
      allergen_slugs: allergenSlugs,
      meat_type: meatType,
      kcal: kcal ? parseFloat(kcal) : null,
      portion_g: portionG ? parseFloat(portionG) : null,
      contains_alcohol: containsAlcohol,
      contains_pork: containsPork,
      protein_g: proteinG ? parseFloat(proteinG) : null,
      fat_g: fatG ? parseFloat(fatG) : null,
      carb_g: carbG ? parseFloat(carbG) : null,
      confirmed: true,
      confirmed_at: now,
    })
  }, [itemId, ingredients, allergenSlugs, meatType, kcal, portionG, containsAlcohol, containsPork, proteinG, fatG, carbG, onSave])

  // ── Render ──
  const barColor = overallState === 'confirmed' ? 'bg-emerald-500' : overallState === 'missing' ? 'bg-red-500' : 'bg-amber-500'

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden flex">
      {/* Sol renk şeridi */}
      <div className={`w-1.5 flex-shrink-0 ${barColor}`} />

      <div className="flex-1">
        {/* ── Başlık satırı ── */}
        <div className="px-5 py-4 flex items-center gap-3 flex-wrap">
          <h3 className="font-semibold text-gray-900">{itemName}</h3>
          {itemPrice && <span className="text-sm text-gray-400">₺{itemPrice}</span>}
          {itemCategory && (
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{itemCategory}</span>
          )}

          {/* Badge */}
          <span className={`ml-auto text-xs font-bold rounded-full px-3 py-1 border ${statusColor(overallState)}`}>
            {confirmed
              ? `✓ Onaylı · ${new Date(confirmedAt!).toLocaleDateString('tr-TR')}`
              : missingCount > 0
                ? `${missingCount} eksik alan`
                : 'AI önerisi — onay bekliyor'}
          </span>

          <button
            onClick={() => setOpen(!open)}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            {open ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>

        {/* ── Genişleyen uyum bölümü ── */}
        {open && (
          <div className="px-5 pb-5 border-t border-dashed border-gray-200 pt-4 space-y-5">

            {/* İçindekiler */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">İçindekiler</span>
                <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 border ${statusColor(getFieldState(ingredients.length > 0 ? ingredients : null, aiProvided, confirmed))}`}>
                  {statusLabel(getFieldState(ingredients.length > 0 ? ingredients : null, aiProvided, confirmed))}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {ingredients.map((ing, idx) => (
                  <span key={idx} className={`inline-flex items-center gap-1.5 text-sm rounded-full px-3 py-1 border ${
                    aiProvided && !touched ? 'border-dashed border-amber-400 bg-amber-50' : 'border-gray-200 bg-gray-50'
                  }`}>
                    {ing}
                    <button onClick={() => removeIngredient(idx)} className="text-gray-400 hover:text-red-500">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={newIngredient}
                    onChange={(e) => setNewIngredient(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addIngredient()}
                    placeholder="Bileşen ekle..."
                    className="text-sm border border-dashed border-gray-300 rounded-full px-3 py-1 w-36 focus:outline-none focus:border-teal-400"
                  />
                  <button onClick={addIngredient} className="text-gray-400 hover:text-teal-500">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Et türü */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Et türü</span>
                <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 border ${statusColor(getFieldState(meatType, aiProvided, confirmed))}`}>
                  {statusLabel(getFieldState(meatType, aiProvided, confirmed))}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {MEAT_OPTIONS.map((mt) => (
                  <button
                    key={mt}
                    onClick={() => { setMeatType(mt); markTouched() }}
                    className={`text-sm rounded-lg px-3 py-1.5 border transition-all ${
                      meatType === mt
                        ? aiProvided && !touched
                          ? 'border-dashed border-amber-400 bg-amber-50 text-amber-700 font-semibold'
                          : 'bg-gray-800 text-white border-gray-800 font-semibold'
                        : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {MEAT_TYPE_LABELS[mt]}
                  </button>
                ))}
              </div>
            </div>

            {/* Alerjenler */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Alerjenler (14)</span>
                <span className="text-[10px] text-gray-400">Bakanlık numaralı sistem</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {ALLERGENS.map((a) => {
                  const active = allergenSlugs.includes(a.slug)
                  const isAi = active && aiProvided && !touched
                  return (
                    <button
                      key={a.slug}
                      onClick={() => toggleAllergen(a.slug)}
                      className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 border transition-all text-left ${
                        active
                          ? isAi
                            ? 'border-dashed border-amber-400 bg-amber-50'
                            : 'border-red-300 bg-red-50'
                          : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                      }`}
                    >
                      <span className={`text-[10px] font-bold rounded px-1 py-0.5 min-w-[20px] text-center ${
                        active
                          ? isAi ? 'bg-amber-500 text-white' : 'bg-red-500 text-white'
                          : 'bg-gray-300 text-white'
                      }`}>
                        {a.no}
                      </span>
                      <span className="truncate">{a.emoji} {a.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Sayısal alanlar: kalori, gramaj, makrolar */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1">
                  Kalori
                  <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full border ${statusColor(getFieldState(kcal || null, aiProvided, confirmed))}`}>
                    {statusLabel(getFieldState(kcal || null, aiProvided, confirmed))}
                  </span>
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={kcal}
                    onChange={(e) => { setKcal(e.target.value); markTouched() }}
                    placeholder="—"
                    className={`w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:border-teal-400 ${
                      !kcal ? 'border-red-300 bg-red-50' : aiProvided && !touched ? 'border-dashed border-amber-400 bg-amber-50' : 'border-gray-200'
                    }`}
                  />
                  <span className="text-xs text-gray-400">kcal</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1">
                  Gramaj
                  <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full border ${statusColor(getFieldState(portionG || null, aiProvided, confirmed))}`}>
                    {statusLabel(getFieldState(portionG || null, aiProvided, confirmed))}
                  </span>
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={portionG}
                    onChange={(e) => { setPortionG(e.target.value); markTouched() }}
                    placeholder="—"
                    className={`w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:border-teal-400 ${
                      !portionG ? 'border-red-300 bg-red-50' : aiProvided && !touched ? 'border-dashed border-amber-400 bg-amber-50' : 'border-gray-200'
                    }`}
                  />
                  <span className="text-xs text-gray-400">g</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1">Protein</label>
                <div className="flex items-center gap-1">
                  <input type="number" value={proteinG} onChange={(e) => { setProteinG(e.target.value); markTouched() }} placeholder="—"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-400" />
                  <span className="text-xs text-gray-400">g</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1">Yağ</label>
                <div className="flex items-center gap-1">
                  <input type="number" value={fatG} onChange={(e) => { setFatG(e.target.value); markTouched() }} placeholder="—"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-400" />
                  <span className="text-xs text-gray-400">g</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1">Karbonhidrat</label>
                <div className="flex items-center gap-1">
                  <input type="number" value={carbG} onChange={(e) => { setCarbG(e.target.value); markTouched() }} placeholder="—"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-400" />
                  <span className="text-xs text-gray-400">g</span>
                </div>
              </div>
            </div>

            {/* Alkol ve domuz toggle */}
            <div className="flex flex-wrap gap-6">
              <div>
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-2">
                  Alkol içerir mi?
                  {containsAlcohol === null && <span className="ml-1 text-red-500 text-[10px]">● Eksik</span>}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setContainsAlcohol(false); markTouched() }}
                    className={`text-sm rounded-lg px-4 py-1.5 border transition-all ${
                      containsAlcohol === false ? 'bg-gray-800 text-white border-gray-800 font-semibold' : 'border-gray-200 bg-gray-50'
                    }`}
                  >Hayır</button>
                  <button
                    onClick={() => { setContainsAlcohol(true); markTouched() }}
                    className={`text-sm rounded-lg px-4 py-1.5 border transition-all ${
                      containsAlcohol === true ? 'bg-red-500 text-white border-red-500 font-semibold' : 'border-gray-200 bg-gray-50'
                    }`}
                  >Evet</button>
                </div>
              </div>

              <div>
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-2">
                  Domuz türevi içerir mi?
                  {containsPork === null && <span className="ml-1 text-red-500 text-[10px]">● Eksik</span>}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setContainsPork(false); markTouched() }}
                    className={`text-sm rounded-lg px-4 py-1.5 border transition-all ${
                      containsPork === false ? 'bg-gray-800 text-white border-gray-800 font-semibold' : 'border-gray-200 bg-gray-50'
                    }`}
                  >Hayır</button>
                  <button
                    onClick={() => { setContainsPork(true); markTouched() }}
                    className={`text-sm rounded-lg px-4 py-1.5 border transition-all ${
                      containsPork === true ? 'bg-red-500 text-white border-red-500 font-semibold' : 'border-gray-200 bg-gray-50'
                    }`}
                  >Evet</button>
                </div>
              </div>
            </div>

            {/* Uyarı notu */}
            {compliance?.confidence_notes && (
              <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {compliance.confidence_notes}
              </div>
            )}

            {/* Onay barı */}
            {!confirmed ? (
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-4 flex-wrap">
                <p className="text-xs text-gray-500 flex-1 min-w-[200px]">
                  AI önerileri yalnızca yardımcıdır. Menüde beyan edilen bilgilerin doğruluğu
                  işletmenin sorumluluğundadır. Onayladığınızda tarih ve saat kayıt altına alınır.
                </p>
                <button
                  onClick={handleConfirm}
                  disabled={missingCount > 0}
                  className={`flex items-center gap-2 font-semibold text-sm rounded-xl px-5 py-2.5 transition-all ${
                    missingCount > 0
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-gray-800 text-white hover:bg-gray-700'
                  }`}
                >
                  <Check className="w-4 h-4" />
                  Bilgileri Onayla
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
                <ShieldCheck className="w-5 h-5" />
                Onaylandı — {new Date(confirmedAt!).toLocaleString('tr-TR')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
