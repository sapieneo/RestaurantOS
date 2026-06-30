'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, ArrowLeft, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { EditableMenuItem } from '@/components/studio/EditableMenuItem'
import type { StudioSession, EditedMenuItem, OcrResult } from '@/types'

const STEPS = ['Yükle', 'Düzelt', 'Uyum', 'Bilgiler', 'Önizle', 'Yayınla']

function groupByCategory(items: EditedMenuItem[]): Record<string, EditedMenuItem[]> {
  return items.reduce<Record<string, EditedMenuItem[]>>((acc, item) => {
    const cat = item.category || 'Genel'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})
}

function ocrToEdited(ocrResult: OcrResult): EditedMenuItem[] {
  return ocrResult.items.map((item) => ({
    ...item,
    id: crypto.randomUUID(),
    compliance_approved: false,
  }))
}

export default function DuzeltPage() {
  const router = useRouter()
  const [items, setItems] = useState<EditedMenuItem[]>([])
  const [session, setSession] = useState<StudioSession | null>(null)
  const [lowConfidenceCount, setLowConfidenceCount] = useState(0)

  // LocalStorage'dan session yükle
  useEffect(() => {
    try {
      const raw = localStorage.getItem('ros_session')
      if (!raw) { router.push('/studyo'); return }

      const parsed: StudioSession = JSON.parse(raw)
      if (!parsed.ocrResult) { router.push('/studyo'); return }

      setSession(parsed)

      // Daha önce düzenlenmiş items varsa onları kullan
      if (parsed.editedItems && parsed.editedItems.length > 0) {
        setItems(parsed.editedItems)
      } else {
        const edited = ocrToEdited(parsed.ocrResult)
        setItems(edited)
      }
    } catch {
      router.push('/studyo')
    }
  }, [router])

  useEffect(() => {
    const count = items.filter((i) => i.confidence < 0.7).length
    setLowConfidenceCount(count)
  }, [items])

  // Item güncelle
  function handleUpdate(id: string, updates: Partial<EditedMenuItem>) {
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, ...updates } : item))
  }

  // Item sil
  function handleDelete(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id))
    toast.success('Ürün silindi.')
  }

  // Yeni boş ürün ekle
  function handleAddItem(category = 'Genel') {
    const newItem: EditedMenuItem = {
      id: crypto.randomUUID(),
      name: '',
      description: null,
      price: null,
      category,
      confidence: 1,
    }
    setItems((prev) => [...prev, newItem])
  }

  // Session'a kaydet ve Adım 3'e geç
  function handleNext() {
    const emptyNames = items.filter((i) => !i.name.trim())
    if (emptyNames.length > 0) {
      toast.error(`${emptyNames.length} ürünün adı boş. Lütfen doldurun veya silin.`)
      return
    }
    if (items.length === 0) {
      toast.error('En az 1 ürün gereklidir.')
      return
    }

    const updated: StudioSession = {
      ...session!,
      step: 3,
      editedItems: items,
    }
    localStorage.setItem('ros_session', JSON.stringify(updated))
    router.push('/studyo/uyum')
  }

  function handleBack() {
    // Mevcut ilererlemeyi kaydet
    if (session && items.length > 0) {
      localStorage.setItem('ros_session', JSON.stringify({ ...session, editedItems: items }))
    }
    router.push('/studyo')
  }

  const grouped = groupByCategory(items)
  const categories = Object.keys(grouped)

  if (items.length === 0 && !session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#0D1B2A] border-b border-[#1E3A52] sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="font-display font-bold text-white text-xl">
            Restaurant<span className="text-teal-400">OS</span>
            <span className="ml-3 text-xs text-slate-500 font-mono font-normal">Menü Stüdyosu</span>
          </span>
          <div className="flex items-center gap-2 text-xs">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  i < 1 ? 'bg-teal-600 text-white' :
                  i === 1 ? 'bg-teal-500 text-white ring-2 ring-teal-400/30' :
                  'bg-[#1E3A52] text-slate-500'
                }`}>
                  {i < 1 ? '✓' : i + 1}
                </div>
                <span className={`hidden sm:block ${i === 1 ? 'text-white' : i < 1 ? 'text-teal-400' : 'text-slate-600'}`}>
                  {label}
                </span>
                {i < 5 && <span className="text-slate-700">›</span>}
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Sayfa başlığı + özet */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl font-bold text-gray-900">Menüyü Kontrol Et</h1>
            <p className="text-gray-500 mt-1 text-sm">
              AI {items.length} ürün tanıdı. Hataları düzeltin, fiyatları kontrol edin.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {lowConfidenceCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
                <AlertCircle className="w-4 h-4" />
                <span>{lowConfidenceCount} ürün kontrol istiyor</span>
              </div>
            )}
            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
              <span>{items.length} ürün</span>
            </div>
          </div>
        </div>

        {/* Kategorilere göre gruplu ürün listesi */}
        <div className="space-y-8">
          {categories.map((category) => (
            <div key={category}>
              {/* Kategori başlığı */}
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-700 flex items-center gap-2">
                  <span className="w-1 h-4 bg-teal-500 rounded-full inline-block" />
                  {category}
                  <span className="text-xs text-gray-400 font-normal">
                    ({grouped[category].length} ürün)
                  </span>
                </h2>
                <button
                  onClick={() => handleAddItem(category)}
                  className="flex items-center gap-1.5 text-xs text-teal-600 hover:text-teal-700 font-medium transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Bu kategoriye ekle
                </button>
              </div>

              {/* Ürün kartları */}
              <div className="space-y-2">
                {grouped[category].map((item, idx) => (
                  <EditableMenuItem
                    key={item.id}
                    item={item}
                    index={idx}
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Yeni kategori + ürün ekle */}
        <div className="mt-6">
          <button
            onClick={() => {
              const cat = prompt('Yeni kategori adı:')
              if (cat?.trim()) handleAddItem(cat.trim())
            }}
            className="flex items-center gap-2 w-full py-4 border-2 border-dashed border-gray-200 rounded-2xl text-sm text-gray-400 hover:border-teal-400 hover:text-teal-500 transition-colors justify-center"
          >
            <Plus className="w-4 h-4" />
            Yeni kategori + ürün ekle
          </button>
        </div>

        {/* Alt navigasyon */}
        <div className="mt-10 flex items-center justify-between pt-6 border-t border-gray-200">
          <button onClick={handleBack} className="btn-secondary">
            <ArrowLeft className="w-4 h-4" />
            Geri
          </button>

          <div className="text-center">
            <p className="text-xs text-gray-400">
              {items.length} ürün · {categories.length} kategori
            </p>
          </div>

          <button onClick={handleNext} className="btn-primary">
            Uyum Kontrolüne Geç
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </main>
    </div>
  )
}
