'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Loader2, ShieldCheck, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import type { StudioSession, EditedMenuItem, ComplianceAnalysis } from '@/types'
import ComplianceCard from '@/components/studio/ComplianceCard'
import type { ComplianceCardData } from '@/components/studio/ComplianceCard'

const STEPS = ['Yükle', 'Düzelt', 'Uyum', 'Bilgiler', 'Önizle', 'Yayınla']

export default function UyumPage() {
  const router = useRouter()
  const [session, setSession] = useState<StudioSession | null>(null)
  const [items, setItems] = useState<EditedMenuItem[]>([])
  const [complianceData, setComplianceData] = useState<Record<string, ComplianceAnalysis>>({})
  const [step, setStep] = useState<'analyzing' | 'review' | 'signing' | 'done'>('analyzing')
  const [savedItems, setSavedItems] = useState<Record<string, ComplianceCardData>>({})
  const [legalSigned, setLegalSigned] = useState(false)

  useEffect(() => {
    const raw = localStorage.getItem('ros_session')
    if (!raw) { router.push('/studyo'); return }
    const parsed: StudioSession = JSON.parse(raw)
    if (!parsed.editedItems?.length) { router.push('/studyo/duzelt'); return }
    setSession(parsed)
    setItems(parsed.editedItems)

    if (parsed.complianceResults && Object.keys(parsed.complianceResults).length > 0) {
      setComplianceData(parsed.complianceResults)
      setStep('review')
    } else {
      runComplianceAnalysis(parsed.editedItems)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function runComplianceAnalysis(itemsToAnalyze: EditedMenuItem[]) {
    setStep('analyzing')
    try {
      const res = await fetch('/api/compliance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: itemsToAnalyze.map((i) => ({
            id: i.id,
            name: i.name,
            description: i.description,
            category: i.category,
          })),
        }),
      })
      const result = await res.json()
      if (!result.success) {
        toast.error(result.error ?? 'Uyum analizi başarısız.')
        setStep('review')
        return
      }
      setComplianceData(result.data)
      setStep('review')
    } catch {
      toast.error('Analiz sırasında hata oluştu.')
      setStep('review')
    }
  }

  function handleCardSave(itemId: string, data: ComplianceCardData) {
    setSavedItems((prev) => ({ ...prev, [itemId]: data }))
    toast.success('Bilgiler kaydedildi.')
  }

  const confirmedCount = Object.values(savedItems).filter((s) => s.confirmed).length
  const allConfirmed = confirmedCount === items.length

  function handleProceedToSign() {
    // Tüm ürünler onaylı olması zorunlu DEĞİL — uyarıyla geçebilir
    setStep('signing')
  }

  function handleFinalSign() {
    if (!legalSigned) {
      toast.error('Lütfen onay kutusunu işaretleyin.')
      return
    }

    if (!localStorage.getItem('ros_user_id')) {
      localStorage.setItem('ros_user_id', 'guest-' + Math.random().toString(36).slice(2, 10))
      localStorage.setItem('ros_access_token', 'guest')
    }

    const now = new Date().toISOString()
    const updatedItems = items.map((item) => {
      const saved = savedItems[item.id]
      const comp = complianceData[item.id]
      return {
        ...item,
        compliance_approved: saved?.confirmed ?? false,
        compliance_approved_at: saved?.confirmed ? now : undefined,
        allergen_ids: saved?.allergen_slugs ?? comp?.allergen_ids ?? [],
        ingredients: saved?.ingredients ?? comp?.ingredients ?? [],
        meat_type: saved?.meat_type ?? comp?.meat_type ?? null,
        contains_alcohol: saved?.contains_alcohol ?? comp?.contains_alcohol ?? null,
        contains_pork: saved?.contains_pork ?? comp?.contains_pork ?? null,
        nutrition: {
          kcal: saved?.kcal ?? comp?.kcal ?? null,
          protein_g: saved?.protein_g ?? comp?.protein_g ?? null,
          fat_g: saved?.fat_g ?? comp?.fat_g ?? null,
          carb_g: saved?.carb_g ?? comp?.carb_g ?? null,
          portion_g: saved?.portion_g ?? comp?.portion_g ?? null,
          portion_desc: comp?.portion_desc ?? '',
          ai_suggested: !saved?.confirmed,
          confirmed_at: saved?.confirmed ? now : null,
        },
      }
    })

    const updated: StudioSession = {
      ...session!,
      step: 4,
      editedItems: updatedItems,
      complianceResults: complianceData,
    }
    localStorage.setItem('ros_session', JSON.stringify(updated))
    setStep('done')
  }

  function handleNext() {
    router.push('/studyo/isletme')
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
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  i < 2 ? 'bg-teal-600 text-white' :
                  i === 2 ? 'bg-teal-500 text-white ring-2 ring-teal-400/30' :
                  'bg-[#1E3A52] text-slate-500'
                }`}>
                  {i < 2 ? '✓' : i + 1}
                </div>
                <span className={`hidden sm:block ${i === 2 ? 'text-white' : i < 2 ? 'text-teal-400' : 'text-slate-600'}`}>
                  {label}
                </span>
                {i < 5 && <span className="text-slate-700">›</span>}
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">

        {/* Analiz yükleniyor */}
        {step === 'analyzing' && (
          <div className="flex flex-col items-center justify-center py-32 gap-6">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-teal-50 flex items-center justify-center">
                <ShieldCheck className="w-10 h-10 text-teal-500" />
              </div>
              <div className="absolute inset-0 rounded-full border-4 border-teal-200 border-t-teal-500 animate-spin" />
            </div>
            <div className="text-center">
              <h2 className="font-display text-xl font-bold text-gray-900 mb-2">Uyum analizi yapılıyor...</h2>
              <p className="text-gray-500 text-sm">
                AI {items.length} ürün için alerjen, kalori, içindekiler ve et türü analizi yapıyor.
              </p>
            </div>
            <div className="flex gap-1">
              {[0,1,2].map((i) => (
                <div key={i} className="w-2 h-2 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}

        {/* Ürün kartları — ComplianceCard */}
        {step === 'review' && (
          <>
            <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
              <div>
                <h1 className="font-display text-2xl font-bold text-gray-900">Uyum Kontrolü</h1>
                <p className="text-gray-500 mt-1 text-sm">
                  AI her ürün için içindekiler, alerjen, et türü ve kalori önerdi. İnceleyin, düzeltin ve onaylayın.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className={`px-4 py-2 rounded-xl font-bold text-sm ${
                  allConfirmed ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                  confirmedCount > 0 ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                  'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {confirmedCount}/{items.length} onaylı
                </div>
              </div>
            </div>

            {/* Renk lejantı */}
            <div className="flex flex-wrap gap-4 mb-4 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500" /> Eksik — bilgi girilmedi</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-500" /> AI önerisi — onay bekliyor</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500" /> İşletme onayladı</span>
            </div>

            <div className="space-y-3">
              {items.map((item, idx) => (
                <ComplianceCard
                  key={item.id}
                  itemId={item.id}
                  itemName={item.name}
                  itemPrice={item.price}
                  itemCategory={item.category}
                  compliance={complianceData[item.id] ?? null}
                  onSave={handleCardSave}
                  defaultOpen={idx === 0}
                />
              ))}
            </div>

            <div className="mt-8 flex items-center justify-between pt-6 border-t border-gray-200">
              <button onClick={() => router.push('/studyo/duzelt')} className="btn-secondary">
                <ArrowLeft className="w-4 h-4" /> Geri
              </button>
              <button onClick={handleProceedToSign} className="btn-primary">
                Devam Et ({confirmedCount}/{items.length} onaylı)
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </>
        )}

        {/* Hukuki onay */}
        {step === 'signing' && (
          <div className="max-w-2xl mx-auto py-12">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-teal-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <ShieldCheck className="w-8 h-8 text-teal-500" />
              </div>
              <h2 className="font-display text-2xl font-bold text-gray-900 mb-2">Bilgileri onaylayın</h2>
              <p className="text-gray-500 text-sm">
                Yönetmelik gereği, menüdeki bilgilerin doğruluğunu işletme olarak onaylamanız gerekiyor.
              </p>
            </div>

            <div className="card space-y-6">
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Toplam ürün</span>
                  <span className="font-semibold">{items.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Bilgileri onaylanan</span>
                  <span className="font-semibold text-emerald-600">{confirmedCount}</span>
                </div>
                {confirmedCount < items.length && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Eksik / onaysız</span>
                    <span className="font-semibold text-amber-600">{items.length - confirmedCount}</span>
                  </div>
                )}
              </div>

              {confirmedCount < items.length && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                  ⚠️ {items.length - confirmedCount} ürün için uyum bilgileri eksik veya onaylanmamış.
                  Bu ürünler menüde içerik/alerjen bilgisi olmadan yayınlanır.
                  Yönetmelik gereği doğruluk sorumluluğu işletmeye aittir.
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 leading-relaxed">
                Menü bilgilerinin (alerjenler, kalori, içerikler, et türü beyanı) doğruluğunu
                teyit ediyorum. AI tarafından önerilen bilgileri inceledim ve uygun gördüğüm
                değişiklikleri yaptım. Hatalı bilgi içermesi durumunda yasal sorumluluğun
                işletmeme ait olduğunu kabul ediyorum. Bu onay,{' '}
                <strong>{new Date().toLocaleDateString('tr-TR')}</strong> tarihinde kayıt altına alınacaktır.
              </div>

              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={legalSigned}
                  onChange={(e) => setLegalSigned(e.target.checked)}
                  className="mt-0.5 w-5 h-5 rounded border-gray-300 text-teal-500 focus:ring-teal-400 cursor-pointer"
                />
                <span className="text-sm text-gray-700 group-hover:text-gray-900 transition-colors">
                  Yukarıdaki bilgilerin doğruluğunu onaylıyorum. Hatalı bilgi sonucunda
                  doğabilecek yasal yükümlülüğün işletmeme ait olduğunu kabul ediyorum.
                </span>
              </label>

              <div className="flex gap-3">
                <button onClick={() => setStep('review')} className="btn-secondary flex-1 justify-center">
                  <ArrowLeft className="w-4 h-4" /> Geri Dön
                </button>
                <button
                  onClick={handleFinalSign}
                  disabled={!legalSigned}
                  className="btn-primary flex-1 justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ShieldCheck className="w-4 h-4" /> Onayla ve İlerle
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tamamlandı */}
        {step === 'done' && (
          <div className="flex flex-col items-center justify-center py-24 gap-6">
            <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            </div>
            <div className="text-center">
              <h2 className="font-display text-2xl font-bold text-gray-900 mb-2">Uyum kontrolü tamamlandı!</h2>
              <p className="text-gray-500">
                {confirmedCount} ürün onaylandı. Sıradaki adımda işletme bilgilerinizi girin.
              </p>
            </div>
            <button onClick={handleNext} className="btn-primary text-base px-8 py-4 rounded-2xl">
              İşletme Bilgilerine Geç <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
