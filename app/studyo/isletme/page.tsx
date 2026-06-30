'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Building2, Check, Loader2, Globe, Phone, MapPin } from 'lucide-react'
import toast from 'react-hot-toast'
import type { StudioSession } from '@/types'

const STEPS = ['Yukle', 'Duzelt', 'Uyum', 'Bilgiler', 'Onizle', 'Yayinla']

const PLANS = [
  {
    id: 'starter' as const,
    name: 'Baslangic',
    price: 499,
    period: '/ay',
    features: ['1 sube', 'QR menu', 'Uyum raporu', 'Email destek'],
    highlight: false,
  },
  {
    id: 'pro' as const,
    name: 'Pro',
    price: 1499,
    period: '/ay',
    features: ['3 sube', 'QR menu + siparis', 'Uyum raporu', 'Oncelikli destek', 'Ozel tema'],
    highlight: true,
  },
  {
    id: 'chain' as const,
    name: 'Zincir',
    price: 3999,
    period: '/ay',
    features: ['Sinırsız sube', 'QR menu + siparis', 'API erisimi', 'Ozel entegrasyon'],
    highlight: false,
  },
]

const BUSINESS_TYPES = [
  'Restoran', 'Kafe', 'Pastane', 'Otel', 'Hastane',
  'Okul / Yemekhane', 'Fast Food', 'Diger',
]

const THEMES = [
  { id: 'classic', label: 'Klasik', colors: ['#0D1B2A', '#0D9488', '#FFFFFF'] },
  { id: 'warm',    label: 'Sicak',  colors: ['#7C2D12', '#EA580C', '#FFF7ED'] },
  { id: 'fresh',   label: 'Taze',   colors: ['#14532D', '#16A34A', '#F0FDF4'] },
  { id: 'elegant', label: 'Zarif',  colors: ['#1E1B4B', '#7C3AED', '#FAF5FF'] },
]

export default function IsletmePage() {
  const router = useRouter()
  const [session, setSession] = useState<StudioSession | null>(null)
  const [view, setView] = useState<'plan' | 'form'>('plan')
  const [selectedPlan, setSelectedPlan] = useState<'starter' | 'pro' | 'chain'>('pro')
  const [paying, setPaying] = useState(false)

  const [form, setForm] = useState({
    name: '',
    type: 'Restoran',
    address: '',
    phone: '',
    website: '',
    description: '',
    theme: 'classic',
    language: 'tr' as 'tr' | 'tr_en',
  })

  useEffect(() => {
    const raw = localStorage.getItem('ros_session')
    if (!raw) { router.push('/studyo'); return }
    const parsed: StudioSession = JSON.parse(raw)
    if (!parsed.editedItems?.length) { router.push('/studyo/duzelt'); return }
    setSession(parsed)

    if (parsed.restaurantInfo) {
      const ri = parsed.restaurantInfo
      setForm((f) => ({
        ...f,
        name: ri.name ?? f.name,
        address: ri.address ?? f.address,
        phone: ri.phone ?? f.phone,
        website: ri.website ?? f.website,
        description: ri.description ?? f.description,
        theme: (ri.theme as string) ?? f.theme,
        language: (ri.language as 'tr' | 'tr_en') ?? f.language,
      }))
      setView('form')
    }

    const userId = localStorage.getItem('ros_user_id')
    if (userId && parsed.step >= 4) setView('form')
  }, [router])

  async function handlePayment() {
    const accessToken = localStorage.getItem('ros_access_token')
    if (!accessToken) {
      toast.error('Oturum bulunamadi. Lutfen tekrar dogrulayin.')
      router.push('/studyo/uyum')
      return
    }

    setPaying(true)
    try {
      const res = await fetch('/api/payment/init', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ plan: selectedPlan }),
      })
      const result = await res.json()

      if (!result.success) {
        toast.error(result.error ?? 'Odeme baslatılamadi.')
        return
      }

      if (result.data?.checkoutFormContent) {
        const div = document.createElement('div')
        div.innerHTML = result.data.checkoutFormContent
        document.body.appendChild(div)
        const script = div.querySelector('script')
        if (script) {
          const s = document.createElement('script')
          s.src = script.src
          document.body.appendChild(s)
        }
      } else if (result.data?.paymentPageUrl) {
        window.location.href = result.data.paymentPageUrl
      } else {
        const updated: StudioSession = { ...session!, step: 4 }
        localStorage.setItem('ros_session', JSON.stringify(updated))
        setSession(updated)
        setView('form')
        toast.success('Plan secildi.')
      }
    } catch {
      toast.error('Odeme islemi basarisiz.')
    } finally {
      setPaying(false)
    }
  }

  function handleFormChange(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleNext() {
    if (!form.name.trim()) { toast.error('Isletme adi zorunludur.'); return }
    if (!form.address.trim()) { toast.error('Adres zorunludur.'); return }

    const updated: StudioSession = {
      ...session!,
      step: 5,
      restaurantInfo: {
        name: form.name,
        address: form.address,
        phone: form.phone,
        website: form.website,
        description: form.description,
      },
      theme: form.theme as 'classic' | 'fresh' | 'editorial' | 'bistro',
      language: form.language as 'tr' | 'tr_en',
    }
    localStorage.setItem('ros_session', JSON.stringify(updated))
    router.push('/studyo/onizle')
  }

  const StepHeader = () => (
    <header className="bg-[#0D1B2A] border-b border-[#1E3A52] sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        <span className="font-display font-bold text-white text-xl">
          Restaurant<span className="text-teal-400">OS</span>
          <span className="ml-3 text-xs text-slate-500 font-mono font-normal">Menu Studyosu</span>
        </span>
        <div className="flex items-center gap-2 text-xs">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                i < 3 ? 'bg-teal-600 text-white' :
                i === 3 ? 'bg-teal-500 text-white ring-2 ring-teal-400/30' :
                'bg-[#1E3A52] text-slate-500'
              }`}>
                {i < 3 ? '✓' : i + 1}
              </div>
              <span className={`hidden sm:block ${i === 3 ? 'text-white' : i < 3 ? 'text-teal-400' : 'text-slate-600'}`}>
                {label}
              </span>
              {i < 5 && <span className="text-slate-700">&rsaquo;</span>}
            </div>
          ))}
        </div>
      </div>
    </header>
  )

  // Plan secimi
  if (view === 'plan') {
    return (
      <div className="min-h-screen bg-gray-50">
        <StepHeader />
        <main className="max-w-4xl mx-auto px-6 py-12">
          <div className="text-center mb-10">
            <h1 className="font-display text-3xl font-bold text-gray-900 mb-3">Plan secin</h1>
            <p className="text-gray-500">
              Menunuz hazir &mdash; simdi yayinlamak icin bir plan secin.<br />
              Istediginiz zaman plan degistirebilirsiniz.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-5 mb-8">
            {PLANS.map((plan) => (
              <div
                key={plan.id}
                onClick={() => setSelectedPlan(plan.id)}
                className={`cursor-pointer rounded-2xl border-2 p-6 transition-all relative ${
                  selectedPlan === plan.id
                    ? 'border-teal-500 bg-teal-50/50 shadow-md shadow-teal-100'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                } ${plan.highlight ? 'ring-2 ring-teal-400/20' : ''}`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-teal-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                      Onerilen
                    </span>
                  </div>
                )}
                <div className={`w-5 h-5 rounded-full border-2 absolute top-5 right-5 flex items-center justify-center ${
                  selectedPlan === plan.id ? 'border-teal-500 bg-teal-500' : 'border-gray-300'
                }`}>
                  {selectedPlan === plan.id && <Check className="w-3 h-3 text-white" />}
                </div>

                <h3 className="font-display font-bold text-lg text-gray-900 mb-1">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-3xl font-bold text-gray-900">{plan.price.toLocaleString('tr-TR')} TL</span>
                  <span className="text-gray-400 text-sm">{plan.period}</span>
                </div>
                <ul className="space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                      <Check className="w-4 h-4 text-teal-500 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="flex justify-center">
            <button
              onClick={handlePayment}
              disabled={paying}
              className="btn-primary text-base px-10 py-4 rounded-2xl shadow-lg shadow-teal-200"
            >
              {paying ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Odeme hazirlaniyor...</>
              ) : (
                <>Odemeyi Tamamla &mdash; {PLANS.find(p => p.id === selectedPlan)?.price.toLocaleString('tr-TR')} TL/ay <ArrowRight className="w-5 h-5" /></>
              )}
            </button>
          </div>
          <p className="text-center text-xs text-gray-400 mt-4">
            Guvenli odeme &middot; iyzico altyapisi &middot; Istediginiz zaman iptal
          </p>
        </main>
      </div>
    )
  }

  // Isletme bilgileri formu
  return (
    <div className="min-h-screen bg-gray-50">
      <StepHeader />
      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-bold text-gray-900">Isletme bilgileri</h1>
          <p className="text-gray-500 mt-1 text-sm">QR menuunuzde gorunecek bilgileri girin.</p>
        </div>

        <div className="space-y-6">
          <div className="card space-y-4">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-teal-500" />
              Temel Bilgiler
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-500 mb-1 block">Isletme Adi *</label>
                <input
                  value={form.name}
                  onChange={(e) => handleFormChange('name', e.target.value)}
                  placeholder="Orn: Bogaz Mangal"
                  className="input"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Isletme Turu</label>
                <select
                  value={form.type}
                  onChange={(e) => handleFormChange('type', e.target.value)}
                  className="input"
                >
                  {BUSINESS_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">
                  <Phone className="inline w-3 h-3 mr-1" />Telefon
                </label>
                <input
                  value={form.phone}
                  onChange={(e) => handleFormChange('phone', e.target.value)}
                  placeholder="0212 XXX XX XX"
                  className="input"
                />
              </div>

              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-500 mb-1 block">
                  <MapPin className="inline w-3 h-3 mr-1" />Adres *
                </label>
                <input
                  value={form.address}
                  onChange={(e) => handleFormChange('address', e.target.value)}
                  placeholder="Mahalle, cadde, ilce, sehir"
                  className="input"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">
                  <Globe className="inline w-3 h-3 mr-1" />Website
                </label>
                <input
                  value={form.website}
                  onChange={(e) => handleFormChange('website', e.target.value)}
                  placeholder="https://..."
                  className="input"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Menu Dili</label>
                <select
                  value={form.language}
                  onChange={(e) => handleFormChange('language', e.target.value)}
                  className="input"
                >
                  <option value="tr">Turkce</option>
                  <option value="tr_en">Turkce + English</option>
                </select>
              </div>

              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-500 mb-1 block">Kisa Aciklama</label>
                <textarea
                  value={form.description}
                  onChange={(e) => handleFormChange('description', e.target.value)}
                  placeholder="Isletmeniz hakkinda kisa bir aciklama..."
                  rows={3}
                  className="input resize-none"
                />
              </div>
            </div>
          </div>

          <div className="card space-y-4">
            <h2 className="font-semibold text-gray-800">Menu Temasi</h2>
            <div className="grid grid-cols-4 gap-3">
              {THEMES.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => handleFormChange('theme', theme.id)}
                  className={`rounded-xl p-3 border-2 transition-all ${
                    form.theme === theme.id
                      ? 'border-teal-500 bg-teal-50/30'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex gap-1 mb-2 justify-center">
                    {theme.colors.map((c, i) => (
                      <div
                        key={i}
                        className="w-5 h-5 rounded-full border border-gray-200"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <p className="text-xs font-medium text-gray-700 text-center">{theme.label}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between pt-6 border-t border-gray-200">
          <button onClick={() => router.push('/studyo/uyum')} className="btn-secondary">
            <ArrowLeft className="w-4 h-4" />
            Geri
          </button>
          <button onClick={handleNext} className="btn-primary">
            Onizlemeye Gec
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </main>
    </div>
  )
}
