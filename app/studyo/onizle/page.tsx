'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Eye, Loader2 } from 'lucide-react'
import type { StudioSession, EditedMenuItem } from '@/types'

const STEPS = ['Yükle', 'Düzelt', 'Uyum', 'Bilgiler', 'Önizle', 'Yayınla']

const ALLERGEN_LABELS: Record<string, { emoji: string; label: string }> = {
  gluten:     { emoji: '🌾', label: 'Gluten' },
  crustacean: { emoji: '🦐', label: 'Kabuklu deniz' },
  egg:        { emoji: '🥚', label: 'Yumurta' },
  fish:       { emoji: '🐟', label: 'Balık' },
  peanut:     { emoji: '🥜', label: 'Yer fıstığı' },
  soy:        { emoji: '🫘', label: 'Soya' },
  milk:       { emoji: '🥛', label: 'Süt' },
  nuts:       { emoji: '🌰', label: 'Kabuklu yemiş' },
  celery:     { emoji: '🥬', label: 'Kereviz' },
  mustard:    { emoji: '🌭', label: 'Hardal' },
  sesame:     { emoji: '🟡', label: 'Susam' },
  sulphite:   { emoji: '⚗️', label: 'Sülfit' },
  lupin:      { emoji: '🌿', label: 'Lupin' },
  mollusc:    { emoji: '🦑', label: 'Yumuşakça' },
}

const THEME_STYLES: Record<string, { bg: string; header: string; accent: string; card: string; text: string }> = {
  classic: {
    bg: 'bg-gray-50',
    header: 'bg-[#0D1B2A] text-white',
    accent: 'text-teal-500 border-teal-500',
    card: 'bg-white border border-gray-200',
    text: 'text-gray-900',
  },
  warm: {
    bg: 'bg-orange-50',
    header: 'bg-[#7C2D12] text-white',
    accent: 'text-orange-500 border-orange-500',
    card: 'bg-white border border-orange-100',
    text: 'text-stone-900',
  },
  fresh: {
    bg: 'bg-green-50',
    header: 'bg-[#14532D] text-white',
    accent: 'text-green-600 border-green-500',
    card: 'bg-white border border-green-100',
    text: 'text-gray-900',
  },
  elegant: {
    bg: 'bg-purple-50',
    header: 'bg-[#1E1B4B] text-white',
    accent: 'text-violet-500 border-violet-500',
    card: 'bg-white border border-violet-100',
    text: 'text-gray-900',
  },
}

function groupByCategory(items: EditedMenuItem[]): Record<string, EditedMenuItem[]> {
  return items.reduce<Record<string, EditedMenuItem[]>>((acc, item) => {
    const cat = item.category || 'Genel'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})
}

export default function OnizlePage() {
  const router = useRouter()
  const [session, setSession] = useState<StudioSession | null>(null)
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('mobile')

  useEffect(() => {
    const raw = localStorage.getItem('ros_session')
    if (!raw) { router.push('/studyo'); return }
    const parsed: StudioSession = JSON.parse(raw)
    if (!parsed.restaurantInfo) { router.push('/studyo/isletme'); return }
    setSession(parsed)
  }, [router])

  function handleNext() {
    const updated: StudioSession = { ...session!, step: 6 }
    localStorage.setItem('ros_session', JSON.stringify(updated))
    router.push('/studyo/yayinla')
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
      </div>
    )
  }

  const info = session.restaurantInfo!
  const items = session.editedItems ?? []
  const grouped = groupByCategory(items)
  const themeId = session.theme ?? 'classic'
  const styles = THEME_STYLES[themeId] ?? THEME_STYLES.classic

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Stüdyo header */}
      <header className="bg-[#0D1B2A] border-b border-[#1E3A52] sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="font-display font-bold text-white text-xl">
            Restaurant<span className="text-teal-400">OS</span>
            <span className="ml-3 text-xs text-slate-500 font-mono font-normal">Menü Stüdyosu</span>
          </span>
          <div className="flex items-center gap-4">
            {/* Mobile / Desktop toggle */}
            <div className="flex items-center gap-1 bg-[#1E3A52] rounded-lg p-1">
              {(['mobile', 'desktop'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setPreviewMode(mode)}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                    previewMode === mode
                      ? 'bg-teal-500 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {mode === 'mobile' ? '📱 Mobil' : '🖥️ Masaüstü'}
                </button>
              ))}
            </div>
            {/* Adım göstergesi */}
            <div className="flex items-center gap-2 text-xs">
              {STEPS.map((label, i) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    i < 4 ? 'bg-teal-600 text-white' :
                    i === 4 ? 'bg-teal-500 text-white ring-2 ring-teal-400/30' :
                    'bg-[#1E3A52] text-slate-500'
                  }`}>
                    {i < 4 ? '✓' : i + 1}
                  </div>
                  <span className={`hidden lg:block ${i === 4 ? 'text-white' : i < 4 ? 'text-teal-400' : 'text-slate-600'}`}>
                    {label}
                  </span>
                  {i < 5 && <span className="text-slate-700">›</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Önizleme alanı */}
      <div className="py-8 flex justify-center">
        <div className={`transition-all duration-300 ${
          previewMode === 'mobile'
            ? 'w-[390px] rounded-[2.5rem] border-[8px] border-gray-800 shadow-2xl overflow-hidden'
            : 'w-full max-w-4xl rounded-2xl shadow-xl overflow-hidden'
        }`}>

          {/* Menü içeriği */}
          <div className={`${styles.bg} min-h-[600px]`}>
            {/* Menü header */}
            <div className={`${styles.header} px-6 py-6`}>
              <h1 className="font-display text-2xl font-bold">{info.name}</h1>
              {info.description && (
                <p className="text-sm opacity-75 mt-1">{info.description}</p>
              )}
              <div className="flex flex-wrap gap-3 mt-3 text-xs opacity-60">
                {info.address && <span>📍 {info.address}</span>}
                {info.phone && <span>📞 {info.phone}</span>}
                {info.website && <span>🌐 {info.website}</span>}
              </div>
            </div>

            {/* Uyum uyarısı */}
            <div className="mx-4 mt-4 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700">
              ✓ Bu menü Türkiye Gıda Etiketleme Yönetmeliği'ne (2026) uygun olarak hazırlanmıştır.
            </div>

            {/* Kategoriler */}
            <div className="p-4 space-y-6">
              {Object.entries(grouped).map(([category, categoryItems]) => (
                <div key={category}>
                  <h2 className={`font-bold text-base mb-3 flex items-center gap-2 ${styles.text}`}>
                    <span className={`w-1 h-4 rounded-full border-l-4 ${styles.accent}`} />
                    {category}
                  </h2>
                  <div className="space-y-2">
                    {categoryItems.map((item) => (
                      <div key={item.id} className={`${styles.card} rounded-xl p-3`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className={`font-semibold text-sm ${styles.text}`}>{item.name}</h3>
                            </div>
                            {item.description && (
                              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{item.description}</p>
                            )}

                            {/* Alerjenler */}
                            {item.allergen_ids && item.allergen_ids.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {item.allergen_ids.map((id) => {
                                  const info = ALLERGEN_LABELS[id] ?? { emoji: '⚠️', label: id }
                                  return (
                                    <span key={id} title={info.label} className="text-base">{info.emoji}</span>
                                  )
                                })}
                              </div>
                            )}

                            {/* Kalori */}
                            {item.nutrition?.kcal && (
                              <span className="text-xs text-gray-400 mt-1 block">
                                {item.nutrition.kcal} kcal · {item.nutrition.portion_desc}
                              </span>
                            )}
                          </div>

                          <div className="flex-shrink-0 text-right">
                            {item.photo_url && (
                              <img
                                src={item.photo_url}
                                alt={item.name}
                                className="w-14 h-14 object-cover rounded-lg mb-1"
                              />
                            )}
                            {item.price && (
                              <span className={`font-bold text-sm ${styles.accent.split(' ')[0]}`}>
                                {item.price.toFixed(2)} ₺
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-200 text-center">
              <p className="text-xs text-gray-400">
                RestaurantOS ile oluşturuldu · Yönetmelik uyumlu menü
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Alt navigasyon */}
      <div className="max-w-5xl mx-auto px-6 pb-8">
        <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-200 px-6 py-4">
          <button onClick={() => router.push('/studyo/isletme')} className="btn-secondary">
            <ArrowLeft className="w-4 h-4" />
            Geri
          </button>

          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Eye className="w-4 h-4" />
            {items.length} ürün · {Object.keys(grouped).length} kategori
          </div>

          <button onClick={handleNext} className="btn-primary">
            Yayınla
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
