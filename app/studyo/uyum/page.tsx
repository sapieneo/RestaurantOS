'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, ArrowRight, Loader2, CheckCircle2,
  AlertTriangle, ShieldCheck, Phone, KeyRound
} from 'lucide-react'
import toast from 'react-hot-toast'
import type { StudioSession, EditedMenuItem, ComplianceAnalysis } from '@/types'

const STEPS = ['Yükle', 'Düzelt', 'Uyum', 'Bilgiler', 'Önizle', 'Yayınla']

// Alerjen ikonları (slug → emoji + Türkçe ad)
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

type UyumStep = 'analyzing' | 'review' | 'otp_phone' | 'otp_code' | 'signing' | 'done'

export default function UyumPage() {
  const router = useRouter()
  const [session, setSession] = useState<StudioSession | null>(null)
  const [items, setItems] = useState<EditedMenuItem[]>([])
  const [complianceData, setComplianceData] = useState<Record<string, ComplianceAnalysis>>({})
  const [step, setStep] = useState<UyumStep>('analyzing')

  // OTP state
  const [phone, setPhone] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [otpSending, setOtpSending] = useState(false)
  const [otpVerifying, setOtpVerifying] = useState(false)
  const [otpExpiresAt, setOtpExpiresAt] = useState<string | null>(null)

  // Onay state
  const [approvedItems, setApprovedItems] = useState<Set<string>>(new Set())
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

  function handleApproveItem(itemId: string) {
    setApprovedItems((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) { next.delete(itemId) } else { next.add(itemId) }
      return next
    })
  }

  function handleApproveAll() {
    setApprovedItems(new Set(items.map((i) => i.id)))
    toast.success('Tüm ürünler onaylandı.')
  }

  function handleProceedToOtp() {
    if (approvedItems.size !== items.length) {
      toast.error(`Henuz ${items.length - approvedItems.size} urun onaylanmadi.`)
      return
    }
    setStep('signing')
  }

  async function handleSendOtp() {
    if (!phone.match(/^(05\d{9}|5\d{9})$/)) {
      toast.error('Geçerli bir Türkiye numarası girin. (05XX XXX XX XX)')
      return
    }
    setOtpSending(true)
    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const result = await res.json()
      if (!result.success) {
        toast.error(result.error ?? 'SMS gönderilemedi.')
        return
      }
      setOtpExpiresAt(result.data.expires_at)
      setStep('otp_code')
      if (result.data.dev_code) {
        toast.success(`[DEV] Kod: ${result.data.dev_code}`, { duration: 30000 })
      } else {
        toast.success(`${phone} numarasına kod gönderildi.`)
      }
    } catch {
      toast.error('SMS gönderimi başarısız.')
    } finally {
      setOtpSending(false)
    }
  }

  async function handleVerifyOtp() {
    if (otpCode.length !== 6) {
      toast.error('6 haneli kodu girin.')
      return
    }
    setOtpVerifying(true)
    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code: otpCode, sessionToken: session?.sessionToken }),
      })
      const result = await res.json()
      if (!result.success) {
        toast.error(result.error ?? 'Kod hatalı.')
        return
      }
      // Token sakla
      localStorage.setItem('ros_access_token', result.data.access_token)
      localStorage.setItem('ros_user_id', result.data.user_id)
      setStep('signing')
    } catch {
      toast.error('Doğrulama başarısız.')
    } finally {
      setOtpVerifying(false)
    }
  }

  function handleFinalSign() {
    if (!legalSigned) {
      toast.error('Lutfen onay kutusunu isaretleyin.')
      return
    }
    // OTP atlandiysa geçici kullanici oturumu olustur
    if (!localStorage.getItem('ros_user_id')) {
      localStorage.setItem('ros_user_id', 'guest-' + Math.random().toString(36).slice(2, 10))
      localStorage.setItem('ros_access_token', 'guest')
    }

    const now = new Date().toISOString()
    const updatedItems = items.map((item) => ({
      ...item,
      compliance_approved: approvedItems.has(item.id),
      compliance_approved_at: approvedItems.has(item.id) ? now : undefined,
      allergen_ids: complianceData[item.id]?.allergen_ids ?? [],
      nutrition: complianceData[item.id] ? {
        kcal: complianceData[item.id].kcal,
        protein_g: complianceData[item.id].protein_g,
        fat_g: complianceData[item.id].fat_g,
        carb_g: complianceData[item.id].carb_g,
        portion_desc: complianceData[item.id].portion_desc,
        ai_suggested: true,
        confirmed_at: now,
      } : undefined,
    }))

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

  // Uyum skoru hesapla
  const complianceScore = items.length > 0
    ? Math.round((approvedItems.size / items.length) * 100)
    : 0

  // ─── RENDER ───────────────────────────────────────────────

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

        {/* ── ANALİZ YÜKLENIYOR ── */}
        {step === 'analyzing' && (
          <div className="flex flex-col items-center justify-center py-32 gap-6">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-teal-50 flex items-center justify-center">
                <ShieldCheck className="w-10 h-10 text-teal-500" />
              </div>
              <div className="absolute inset-0 rounded-full border-4 border-teal-200 border-t-teal-500 animate-spin" />
            </div>
            <div className="text-center">
              <h2 className="font-display text-xl font-bold text-gray-900 mb-2">
                Uyum analizi yapılıyor...
              </h2>
              <p className="text-gray-500 text-sm">
                AI {items.length} ürün için 14 alerjeni ve kalori bilgilerini inceliyor.
                <br />Bu işlem 15-30 saniye sürebilir.
              </p>
            </div>
            <div className="flex gap-1">
              {[0,1,2].map((i) => (
                <div key={i} className="w-2 h-2 rounded-full bg-teal-400 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}

        {/* ── ÜRÜN İNCELEME ── */}
        {step === 'review' && (
          <>
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="font-display text-2xl font-bold text-gray-900">Uyum Kontrolü</h1>
                <p className="text-gray-500 mt-1 text-sm">
                  AI her ürün için alerjen ve kalori önerdi. İnceleyin ve onaylayın.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className={`px-4 py-2 rounded-xl font-bold text-lg ${
                  complianceScore >= 86 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                  complianceScore >= 61 ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                  'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {complianceScore}/100
                </div>
                <button onClick={handleApproveAll} className="btn-secondary text-sm">
                  Tümünü Onayla
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {items.map((item) => {
                const compliance = complianceData[item.id]
                const approved = approvedItems.has(item.id)

                return (
                  <div key={item.id} className={`bg-white rounded-2xl border-2 transition-all ${
                    approved ? 'border-emerald-300' : 'border-gray-200'
                  }`}>
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-gray-900">{item.name}</h3>
                            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                              {item.category}
                            </span>
                            {compliance?.confidence === 'low' && (
                              <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                                <AlertTriangle className="w-3 h-3" />
                                Düşük güven
                              </span>
                            )}
                          </div>

                          {compliance ? (
                            <div className="space-y-3 mt-3">
                              {/* Alerjenler */}
                              <div>
                                <p className="text-xs text-gray-500 font-medium mb-1.5">Alerjenler</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {compliance.allergen_ids.length > 0 ? (
                                    compliance.allergen_ids.map((slug) => {
                                      const info = ALLERGEN_LABELS[slug] ?? { emoji: '⚠️', label: slug }
                                      return (
                                        <span key={slug} className="flex items-center gap-1 text-xs bg-orange-50 border border-orange-200 text-orange-700 px-2 py-1 rounded-lg">
                                          <span>{info.emoji}</span>
                                          <span>{info.label}</span>
                                        </span>
                                      )
                                    })
                                  ) : (
                                    <span className="text-xs text-gray-400 italic">Alerjen tespit edilmedi</span>
                                  )}
                                  {compliance.contains_alcohol && (
                                    <span className="text-xs bg-purple-50 border border-purple-200 text-purple-700 px-2 py-1 rounded-lg">🍷 Alkol</span>
                                  )}
                                  {compliance.contains_pork && (
                                    <span className="text-xs bg-red-50 border border-red-200 text-red-700 px-2 py-1 rounded-lg">🐷 Domuz türevi</span>
                                  )}
                                </div>
                              </div>

                              {/* Besin değerleri */}
                              {compliance.kcal && (
                                <div className="flex items-center gap-4">
                                  <div className="text-center">
                                    <p className="text-lg font-bold text-gray-900">{compliance.kcal}</p>
                                    <p className="text-xs text-gray-400">kcal</p>
                                  </div>
                                  {compliance.protein_g && (
                                    <div className="text-center">
                                      <p className="text-sm font-semibold text-gray-700">{compliance.protein_g}g</p>
                                      <p className="text-xs text-gray-400">protein</p>
                                    </div>
                                  )}
                                  {compliance.fat_g && (
                                    <div className="text-center">
                                      <p className="text-sm font-semibold text-gray-700">{compliance.fat_g}g</p>
                                      <p className="text-xs text-gray-400">yağ</p>
                                    </div>
                                  )}
                                  {compliance.carb_g && (
                                    <div className="text-center">
                                      <p className="text-sm font-semibold text-gray-700">{compliance.carb_g}g</p>
                                      <p className="text-xs text-gray-400">karbonhidrat</p>
                                    </div>
                                  )}
                                  <p className="text-xs text-gray-400 ml-2">{compliance.portion_desc}</p>
                                </div>
                              )}

                              {compliance.confidence_notes && (
                                <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                                  ⚠️ {compliance.confidence_notes}
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400 mt-2 italic">Analiz bekleniyor...</p>
                          )}
                        </div>

                        {/* Onay butonu */}
                        <button
                          onClick={() => handleApproveItem(item.id)}
                          className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all ${
                            approved
                              ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-200'
                              : 'bg-gray-100 text-gray-500 hover:bg-emerald-50 hover:text-emerald-600'
                          }`}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          {approved ? 'Onaylandı' : 'Onayla'}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-8 flex items-center justify-between pt-6 border-t border-gray-200">
              <button onClick={() => router.push('/studyo/duzelt')} className="btn-secondary">
                <ArrowLeft className="w-4 h-4" />
                Geri
              </button>
              <button
                onClick={handleProceedToOtp}
                disabled={approvedItems.size !== items.length}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Devam Et ({approvedItems.size}/{items.length})
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </>
        )}

        {/* ── TELEFON GİRİŞİ ── */}
        {step === 'otp_phone' && (
          <div className="max-w-md mx-auto py-16">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-teal-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Phone className="w-8 h-8 text-teal-500" />
              </div>
              <h2 className="font-display text-2xl font-bold text-gray-900 mb-2">
                Telefon doğrulama
              </h2>
              <p className="text-gray-500 text-sm">
                Uyum raporunuzu görmek için telefon numaranızı doğrulayın.
                Numaranız hesabınızı oluşturmak için kullanılacak.
              </p>
            </div>
            <div className="card space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                  Telefon numarası
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  placeholder="05XX XXX XX XX"
                  className="input text-lg tracking-widest"
                  maxLength={11}
                />
                <p className="text-xs text-gray-400 mt-1">Türkiye numarası (05XX ile başlayan)</p>
              </div>
              <button
                onClick={handleSendOtp}
                disabled={otpSending || phone.length < 10}
                className="btn-primary w-full justify-center"
              >
                {otpSending ? <><Loader2 className="w-4 h-4 animate-spin" /> Gönderiliyor...</> : 'SMS Kodu Gönder'}
              </button>
              <button onClick={() => setStep('review')} className="btn-secondary w-full justify-center text-sm">
                <ArrowLeft className="w-4 h-4" />
                Geri Dön
              </button>
            </div>
          </div>
        )}

        {/* ── OTP KODU ── */}
        {step === 'otp_code' && (
          <div className="max-w-md mx-auto py-16">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-teal-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <KeyRound className="w-8 h-8 text-teal-500" />
              </div>
              <h2 className="font-display text-2xl font-bold text-gray-900 mb-2">Kodu girin</h2>
              <p className="text-gray-500 text-sm">
                <span className="font-medium text-gray-700">{phone}</span> numarasına
                6 haneli kod gönderdik.
              </p>
            </div>
            <div className="card space-y-4">
              <input
                type="text"
                inputMode="numeric"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="______"
                className="input text-center text-3xl tracking-[1rem] font-mono"
                maxLength={6}
              />
              <button
                onClick={handleVerifyOtp}
                disabled={otpVerifying || otpCode.length !== 6}
                className="btn-primary w-full justify-center"
              >
                {otpVerifying ? <><Loader2 className="w-4 h-4 animate-spin" /> Doğrulanıyor...</> : 'Doğrula'}
              </button>
              <button
                onClick={() => { setOtpCode(''); setStep('otp_phone') }}
                className="text-sm text-gray-400 hover:text-gray-600 w-full text-center transition-colors"
              >
                Kodu almadım, yeniden gönder
              </button>
            </div>
          </div>
        )}

        {/* ── HUKUKİ ONAY ── */}
        {step === 'signing' && (
          <div className="max-w-2xl mx-auto py-12">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-teal-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <ShieldCheck className="w-8 h-8 text-teal-500" />
              </div>
              <h2 className="font-display text-2xl font-bold text-gray-900 mb-2">
                Bilgileri onaylayın
              </h2>
              <p className="text-gray-500 text-sm">
                Yönetmelik gereği, menüdeki bilgilerin doğruluğunu işletme olarak onaylamanız gerekiyor.
              </p>
            </div>

            <div className="card space-y-6">
              {/* Özet */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Toplam ürün</span>
                  <span className="font-semibold">{items.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Onaylanan</span>
                  <span className="font-semibold text-emerald-600">{approvedItems.size}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Uyum skoru</span>
                  <span className={`font-bold ${complianceScore >= 86 ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {complianceScore}/100
                  </span>
                </div>
              </div>

              {/* Hukuki onay metni */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 leading-relaxed">
                Yukarıdaki menü bilgilerinin (alerjenler, kalori değerleri ve içerik listesi) doğruluğunu
                teyit ediyorum. AI tarafından önerilen bilgileri inceledim ve uygun gördüğüm değişiklikleri
                yaptım. Hatalı bilgi içermesi durumunda yasal sorumluluğun işletmeme ait olduğunu kabul
                ediyorum. Bu onay, <strong>{new Date().toLocaleDateString('tr-TR')}</strong> tarihinde
                kayıt altına alınacaktır.
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

              <button
                onClick={handleFinalSign}
                disabled={!legalSigned}
                className="btn-primary w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ShieldCheck className="w-4 h-4" />
                Onayla ve İlerle
              </button>
            </div>
          </div>
        )}

        {/* ── TAMAMLANDI ── */}
        {step === 'done' && (
          <div className="flex flex-col items-center justify-center py-24 gap-6">
            <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            </div>
            <div className="text-center">
              <h2 className="font-display text-2xl font-bold text-gray-900 mb-2">
                Uyum kontrolü tamamlandı!
              </h2>
              <p className="text-gray-500">
                {items.length} ürün onaylandı. Sıradaki adımda işletme bilgilerinizi girin.
              </p>
            </div>
            <div className={`px-6 py-3 rounded-2xl font-bold text-2xl ${
              complianceScore >= 86 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
            }`}>
              Uyum Skoru: {complianceScore}/100
            </div>
            <button onClick={handleNext} className="btn-primary text-base px-8 py-4 rounded-2xl">
              İşletme Bilgilerine Geç
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
