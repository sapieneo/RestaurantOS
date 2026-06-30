'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Download, Copy, ExternalLink, Loader2, Share2, QrCode } from 'lucide-react'
import toast from 'react-hot-toast'
import type { StudioSession } from '@/types'

const STEPS = ['Yukle', 'Duzelt', 'Uyum', 'Bilgiler', 'Onizle', 'Yayinla']

export default function YayinlaPage() {
  const router = useRouter()
  const [session, setSession] = useState<StudioSession | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished] = useState(false)
  const [menuUrl, setMenuUrl] = useState<string | null>(null)
  const [slug, setSlug] = useState<string | null>(null)
  const qrRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const raw = localStorage.getItem('ros_session')
    if (!raw) { router.push('/studyo'); return }
    const parsed: StudioSession = JSON.parse(raw)
    setSession(parsed)
    if (parsed.restaurantId) {
      const url = `${window.location.origin}/m/${parsed.restaurantId}`
      setMenuUrl(url)
      setSlug(parsed.restaurantId)
      setPublished(true)
      generateQR(url)
    }
  }, [router])

  async function generateQR(url: string) {
    try {
      const QRCode = (await import('qrcode')).default
      if (qrRef.current) {
        await QRCode.toCanvas(qrRef.current, url, {
          width: 280,
          margin: 2,
          color: { dark: '#0D1B2A', light: '#FFFFFF' },
        })
      }
    } catch (err) {
      console.error('QR olusturulamadi:', err)
    }
  }

  async function handlePublish() {
    if (!session) return

    const accessToken = localStorage.getItem('ros_access_token')
    const userId = localStorage.getItem('ros_user_id')
    if (!accessToken && !userId) {
      toast.error('Oturum suresi dolmus. Lutfen tekrar dogrulayin.')
      router.push('/studyo/uyum')
      return
    }

    setPublishing(true)
    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken ?? ''}`,
        },
        body: JSON.stringify({
          restaurantInfo: session.restaurantInfo,
          items: session.editedItems,
          theme: session.theme ?? 'classic',
          language: session.language ?? 'tr',
          userId: userId ?? undefined,
        }),
      })

      const result = await res.json()
      if (!result.success) {
        toast.error(result.error ?? 'Yayinlama basarisiz.')
        return
      }

      const { menuUrl: url, slug: menuSlug } = result.data
      setMenuUrl(url)
      setSlug(menuSlug)
      setPublished(true)

      const updated: StudioSession = { ...session, step: 6, restaurantId: menuSlug }
      localStorage.setItem('ros_session', JSON.stringify(updated))
      setSession(updated)

      await generateQR(url)
      toast.success('Menuunuz yayinlandi!')
    } catch {
      toast.error('Yayinlama sirasinda hata olustu.')
    } finally {
      setPublishing(false)
    }
  }

  function handleCopyUrl() {
    if (!menuUrl) return
    navigator.clipboard.writeText(menuUrl)
    toast.success('Baglanti kopyalandi!')
  }

  async function handleDownloadQR() {
    if (!qrRef.current) return
    const url = qrRef.current.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = `${slug ?? 'menu'}-qr.png`
    a.click()
    toast.success('QR kod indirildi.')
  }

  async function handleDownloadPDF() {
    if (!qrRef.current || !menuUrl) return
    try {
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ unit: 'mm', format: 'a5' })
      doc.setFontSize(18)
      doc.setFont('helvetica', 'bold')
      doc.text(session?.restaurantInfo?.name ?? 'Menu', 74, 30, { align: 'center' })
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(100)
      doc.text('Alerjen ve besin bilgileri icin QR kodu okutun', 74, 40, { align: 'center' })
      const qrData = qrRef.current.toDataURL('image/png')
      doc.addImage(qrData, 'PNG', 34, 50, 80, 80)
      doc.setFontSize(8)
      doc.setTextColor(150)
      doc.text(menuUrl, 74, 140, { align: 'center' })
      doc.setFontSize(7)
      doc.text('RestaurantOS - Yonetmelik uyumlu menu', 74, 185, { align: 'center' })
      doc.save(`${slug ?? 'menu'}-qr-poster.pdf`)
      toast.success('PDF indirildi.')
    } catch {
      toast.error('PDF olusturulamadi.')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
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
                  i < 5 ? 'bg-teal-600 text-white' :
                  i === 5 ? (published ? 'bg-teal-600 text-white' : 'bg-teal-500 text-white ring-2 ring-teal-400/30') :
                  'bg-[#1E3A52] text-slate-500'
                }`}>
                  {(i < 5 || published) ? '✓' : i + 1}
                </div>
                <span className={`hidden sm:block ${
                  i === 5 ? 'text-white' : i < 5 ? 'text-teal-400' : 'text-slate-600'
                }`}>
                  {label}
                </span>
                {i < 5 && <span className="text-slate-700">&rsaquo;</span>}
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">

        {!published && (
          <div className="text-center py-12">
            <div className="w-20 h-20 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <QrCode className="w-10 h-10 text-teal-500" />
            </div>
            <h1 className="font-display text-3xl font-bold text-gray-900 mb-3">
              Menuunuzu yayinlayin
            </h1>
            <p className="text-gray-500 mb-8 max-w-md mx-auto">
              Onaylanan {session?.editedItems?.length ?? 0} urun Supabase kaydedilecek,
              QR kod olusturulacak ve menuunuz musterilerinizle paylasilabilir hale gelecek.
            </p>
            <button
              onClick={handlePublish}
              disabled={publishing}
              className="btn-primary text-base px-10 py-4 rounded-2xl shadow-lg shadow-teal-200"
            >
              {publishing
                ? <><Loader2 className="w-5 h-5 animate-spin" /> Yayinlaniyor...</>
                : <><Share2 className="w-5 h-5" /> Menuyu Yayinla</>
              }
            </button>
          </div>
        )}

        {published && (
          <div className="space-y-6">
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="font-display font-bold text-lg text-emerald-800">Menuunuz yayinda!</h2>
                <p className="text-emerald-700 text-sm mt-0.5">
                  {session?.editedItems?.length} urun yayinlandi - Yonetmelik uyumlu
                </p>
              </div>
            </div>

            <div className="card">
              <h3 className="font-semibold text-gray-800 mb-3">Menu Baglantisi</h3>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-600 font-mono truncate">
                  {menuUrl}
                </div>
                <button onClick={handleCopyUrl} className="btn-secondary py-3">
                  <Copy className="w-4 h-4" />
                  Kopyala
                </button>
                <a href={menuUrl ?? '#'} target="_blank" rel="noopener noreferrer" className="btn-secondary py-3">
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>

            <div className="card">
              <h3 className="font-semibold text-gray-800 mb-4">QR Kod</h3>
              <div className="flex items-start gap-8">
                <div className="bg-white border border-gray-200 rounded-2xl p-4 inline-block">
                  <canvas ref={qrRef} className="block" />
                </div>
                <div className="flex-1 space-y-3">
                  <p className="text-sm text-gray-500">
                    Bu QR kodu masaniza ve girise yerlestirin. Musterileriniz okutunca
                    alerjen ve kalori bilgilerini iceren dijital menuunuzu gorecek.
                  </p>
                  <div className="space-y-2">
                    <button onClick={handleDownloadQR} className="btn-secondary w-full justify-center">
                      <Download className="w-4 h-4" />
                      QR Kodu Indir (.png)
                    </button>
                    <button onClick={handleDownloadPDF} className="btn-secondary w-full justify-center">
                      <Download className="w-4 h-4" />
                      Masa Posteri Indir (.pdf)
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="card bg-blue-50 border-blue-200">
              <h3 className="font-semibold text-blue-900 mb-3">Sonraki Adimlar</h3>
              <div className="space-y-2 text-sm text-blue-800">
                <p>QR kodu yazdirip masalara ve girise yerlestirin.</p>
                <p>Menuunuzu guncellemeniz gerekirse studyoya geri donebilirsiniz.</p>
                <p>1 Temmuz 2026 yonetmelik tarihine kadar menuunuz uyumlu durumda.</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
