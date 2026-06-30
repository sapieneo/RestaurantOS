'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  QrCode, Copy, ExternalLink, RefreshCw, ShieldCheck,
  BarChart3, CheckCircle2, AlertTriangle, Download,
  ChevronRight, LogOut
} from 'lucide-react'
import toast from 'react-hot-toast'

interface Restaurant {
  id: string
  name: string
  slug: string
  plan: 'starter' | 'pro' | 'chain'
  is_published: boolean
  published_at: string | null
  theme: string | null
}

interface Stats {
  itemCount: number
  approvedCount: number
  scanCount: number
  complianceScore: number
}

interface Props {
  restaurant: Restaurant
  stats: Stats
  menuUrl: string
}

const PLAN_LABELS: Record<string, { label: string; color: string }> = {
  starter: { label: 'Başlangıç',  color: 'bg-gray-100 text-gray-700' },
  pro:     { label: 'Pro',        color: 'bg-teal-100 text-teal-700' },
  chain:   { label: 'Zincir',     color: 'bg-purple-100 text-purple-700' },
}

export default function DashboardClient({ restaurant, stats, menuUrl }: Props) {
  const qrRef = useRef<HTMLCanvasElement>(null)
  const [qrReady, setQrReady] = useState(false)

  useEffect(() => {
    async function buildQR() {
      try {
        const QRCode = (await import('qrcode')).default
        if (qrRef.current) {
          await QRCode.toCanvas(qrRef.current, menuUrl, {
            width: 160,
            margin: 2,
            color: { dark: '#0D1B2A', light: '#FFFFFF' },
          })
          setQrReady(true)
        }
      } catch { /* QR library yüklenmedi */ }
    }
    buildQR()
  }, [menuUrl])

  function handleCopyUrl() {
    navigator.clipboard.writeText(menuUrl)
    toast.success('Bağlantı kopyalandı!')
  }

  async function handleDownloadQR() {
    if (!qrRef.current) return
    const url = qrRef.current.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = `${restaurant.slug}-qr.png`
    a.click()
  }

  async function handleSignOut() {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    await supabase.auth.signOut()
    localStorage.removeItem('ros_session')
    localStorage.removeItem('ros_access_token')
    localStorage.removeItem('ros_user_id')
    window.location.href = '/studyo'
  }

  const plan = PLAN_LABELS[restaurant.plan] ?? PLAN_LABELS.starter
  const deadlineDate = new Date('2026-07-01')
  const today = new Date()
  const daysLeft = Math.max(0, Math.floor((deadlineDate.getTime() - today.getTime()) / 86400000))

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#0D1B2A] border-b border-[#1E3A52]">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="font-display font-bold text-white text-xl">
            Restaurant<span className="text-teal-400">OS</span>
          </span>
          <div className="flex items-center gap-4">
            <span className={`text-xs font-semibold px-3 py-1 rounded-full ${plan.color}`}>
              {plan.label}
            </span>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Çıkış
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Karşılama + işletme adı */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-gray-900">{restaurant.name}</h1>
            <p className="text-gray-500 text-sm mt-1">
              {restaurant.is_published
                ? `Menünüz yayında · ${stats.itemCount} ürün`
                : 'Menünüz henüz yayınlanmadı'}
            </p>
          </div>
          <Link href="/studyo" className="btn-primary">
            <RefreshCw className="w-4 h-4" />
            Menüyü Güncelle
          </Link>
        </div>

        {/* Yasal deadline uyarısı */}
        {daysLeft > 0 && stats.complianceScore < 100 && (
          <div className={`flex items-start gap-3 p-4 rounded-2xl border ${
            daysLeft <= 30
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}>
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">
                Yönetmelik uyum tarihine {daysLeft} gün kaldı (1 Temmuz 2026)
              </p>
              <p className="text-xs mt-0.5 opacity-80">
                Mevcut uyum skorunuz: {stats.complianceScore}/100 · Tüm ürünleri onaylamanız gerekiyor.
              </p>
            </div>
          </div>
        )}

        {daysLeft === 0 && (
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <p className="font-semibold text-sm">Yönetmelik tarihini geçtiniz — menünüz uyumlu 🎉</p>
          </div>
        )}

        {/* İstatistik kartları */}
        <div className="grid grid-cols-4 gap-4">
          {[
            {
              label: 'Toplam Ürün',
              value: stats.itemCount,
              icon: <BarChart3 className="w-5 h-5 text-teal-500" />,
              sub: 'aktif menüde',
            },
            {
              label: 'Onaylanan',
              value: stats.approvedCount,
              icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
              sub: `${stats.itemCount > 0 ? Math.round((stats.approvedCount / stats.itemCount) * 100) : 0}% uyumlu`,
            },
            {
              label: 'Uyum Skoru',
              value: `${stats.complianceScore}/100`,
              icon: <ShieldCheck className="w-5 h-5 text-blue-500" />,
              sub: stats.complianceScore >= 100 ? 'Tam uyumlu ✓' : 'Güncelleme gerekiyor',
            },
            {
              label: 'QR Tarama',
              value: stats.scanCount,
              icon: <QrCode className="w-5 h-5 text-purple-500" />,
              sub: 'son 7 gün',
            },
          ].map((card) => (
            <div key={card.label} className="card">
              <div className="flex items-start justify-between mb-3">
                <p className="text-xs text-gray-500 font-medium">{card.label}</p>
                {card.icon}
              </div>
              <p className="text-2xl font-bold text-gray-900">{card.value}</p>
              <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* QR Kod */}
          <div className="card col-span-1">
            <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <QrCode className="w-4 h-4 text-teal-500" />
              QR Kod
            </h2>
            <div className="flex justify-center mb-4">
              <div className="bg-white border border-gray-200 rounded-xl p-3 inline-block">
                <canvas ref={qrRef} />
                {!qrReady && (
                  <div className="w-40 h-40 flex items-center justify-center">
                    <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={handleDownloadQR}
              disabled={!qrReady}
              className="btn-secondary w-full justify-center text-sm"
            >
              <Download className="w-4 h-4" />
              İndir (.png)
            </button>
          </div>

          {/* Menü bağlantısı + hızlı eylemler */}
          <div className="col-span-2 space-y-4">
            <div className="card">
              <h2 className="font-semibold text-gray-800 mb-3">Menü Bağlantısı</h2>
              <div className="flex items-center gap-2 mb-3">
                <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-500 font-mono truncate">
                  {menuUrl}
                </div>
                <button onClick={handleCopyUrl} className="btn-secondary py-2.5">
                  <Copy className="w-4 h-4" />
                </button>
                <a href={menuUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary py-2.5">
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
              <div className={`flex items-center gap-2 text-xs ${
                restaurant.is_published ? 'text-emerald-600' : 'text-gray-400'
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  restaurant.is_published ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'
                }`} />
                {restaurant.is_published
                  ? `Yayında · ${restaurant.published_at ? new Date(restaurant.published_at).toLocaleDateString('tr-TR') : ''}`
                  : 'Yayınlanmadı'}
              </div>
            </div>

            {/* Hızlı eylemler */}
            <div className="card">
              <h2 className="font-semibold text-gray-800 mb-3">Hızlı İşlemler</h2>
              <div className="space-y-1">
                {[
                  { label: 'Menüyü Güncelle / Yeni Versiyon', href: '/studyo', icon: <RefreshCw className="w-4 h-4" /> },
                  { label: 'Uyum Raporunu Görüntüle', href: '/studyo/uyum', icon: <ShieldCheck className="w-4 h-4" /> },
                  { label: 'Public Menüyü Aç', href: menuUrl, icon: <ExternalLink className="w-4 h-4" />, external: true },
                ].map((action) => (
                  <Link
                    key={action.label}
                    href={action.href}
                    target={action.external ? '_blank' : undefined}
                    rel={action.external ? 'noopener noreferrer' : undefined}
                    className="flex items-center justify-between px-4 py-3 rounded-xl hover:bg-gray-50 transition-colors group"
                  >
                    <div className="flex items-center gap-3 text-sm text-gray-700 group-hover:text-teal-600">
                      {action.icon}
                      {action.label}
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-teal-400" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
