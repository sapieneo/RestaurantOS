'use client'

import { useEffect, useState, useRef } from 'react'
import { ShoppingCart, Plus, Minus, X, ChevronDown, Loader2, CheckCircle2 } from 'lucide-react'

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

export interface MenuItem {
  id: string
  name: string
  description: string | null
  price: number | null
  category: string
  photo_url: string | null
  compliance_approved: boolean
  allergen_ids: string[]
  nutrition: {
    kcal?: number
    protein_g?: number
    fat_g?: number
    carb_g?: number
    portion_desc?: string
  } | null
}

export interface Restaurant {
  id: string
  name: string
  slug: string
  address: string | null
  phone: string | null
  website: string | null
  description: string | null
  theme: string | null
  language: string | null
  plan: 'starter' | 'pro' | 'chain'
}

interface CartItem { item: MenuItem; qty: number }

interface Props {
  restaurant: Restaurant
  grouped: Record<string, MenuItem[]>
}

const THEME: Record<string, { bg: string; header: string; accent: string; accentLight: string }> = {
  classic: { bg: '#F9FAFB', header: '#0D1B2A', accent: '#0D9488', accentLight: '#CCFBF1' },
  warm:    { bg: '#FFF7ED', header: '#7C2D12', accent: '#EA580C', accentLight: '#FFEDD5' },
  fresh:   { bg: '#F0FDF4', header: '#14532D', accent: '#16A34A', accentLight: '#DCFCE7' },
  elegant: { bg: '#FAF5FF', header: '#1E1B4B', accent: '#7C3AED', accentLight: '#EDE9FE' },
}

type OrderStep = 'idle' | 'form' | 'submitting' | 'done'

export default function MenuClient({ restaurant, grouped }: Props) {
  const [cart, setCart] = useState<CartItem[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [orderStep, setOrderStep] = useState<OrderStep>('idle')
  const [orderNote, setOrderNote] = useState('')
  const [tableNo, setTableNo] = useState('')
  const [orderId, setOrderId] = useState<string | null>(null)
  const analyticsfired = useRef(false)

  const theme = THEME[restaurant.theme ?? 'classic'] ?? THEME.classic
  const isPro = restaurant.plan === 'pro' || restaurant.plan === 'chain'
  const categories = Object.keys(grouped)

  // QR menü görüntülenme eventi — sadece bir kere
  useEffect(() => {
    if (analyticsfired.current) return
    analyticsfired.current = true
    fetch('/api/analytics/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurant_id: restaurant.id, event_type: 'menu_view' }),
    }).catch(() => {})
  }, [restaurant.id])

  function addToCart(item: MenuItem) {
    setCart((prev) => {
      const existing = prev.find((c) => c.item.id === item.id)
      if (existing) return prev.map((c) => c.item.id === item.id ? { ...c, qty: c.qty + 1 } : c)
      return [...prev, { item, qty: 1 }]
    })
    // item_view eventi
    fetch('/api/analytics/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurant_id: restaurant.id, event_type: 'item_view', item_id: item.id }),
    }).catch(() => {})
  }

  function removeFromCart(itemId: string) {
    setCart((prev) => {
      const existing = prev.find((c) => c.item.id === itemId)
      if (!existing) return prev
      if (existing.qty <= 1) return prev.filter((c) => c.item.id !== itemId)
      return prev.map((c) => c.item.id === itemId ? { ...c, qty: c.qty - 1 } : c)
    })
  }

  const cartTotal = cart.reduce((sum, c) => sum + (c.item.price ?? 0) * c.qty, 0)
  const cartCount = cart.reduce((sum, c) => sum + c.qty, 0)

  async function handlePlaceOrder() {
    if (cart.length === 0) return
    setOrderStep('submitting')

    // order_start eventi
    fetch('/api/analytics/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurant_id: restaurant.id, event_type: 'order_start' }),
    }).catch(() => {})

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurant_id: restaurant.id,
          table_no: tableNo || null,
          note: orderNote || null,
          items: cart.map((c) => ({
            menu_item_id: c.item.id,
            quantity: c.qty,
            unit_price: c.item.price ?? 0,
          })),
        }),
      })
      const result = await res.json()
      if (!result.success) {
        alert('Sipariş iletilemedi. Lütfen tekrar deneyin.')
        setOrderStep('form')
        return
      }
      setOrderId(result.data.order_id)
      setOrderStep('done')
      setCart([])
      setCartOpen(false)

      fetch('/api/analytics/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurant_id: restaurant.id, event_type: 'order_complete' }),
      }).catch(() => {})
    } catch {
      alert('Sipariş iletilemedi.')
      setOrderStep('form')
    }
  }

  return (
    <div style={{ backgroundColor: theme.bg, minHeight: '100vh', fontFamily: 'system-ui, sans-serif', paddingBottom: isPro ? '90px' : '32px' }}>

      {/* Header */}
      <div style={{ backgroundColor: theme.header, color: '#fff', padding: '24px 20px 20px' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>{restaurant.name}</h1>
        {restaurant.description && (
          <p style={{ fontSize: '0.875rem', opacity: 0.75, margin: '6px 0 0' }}>{restaurant.description}</p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '12px', fontSize: '0.75rem', opacity: 0.6 }}>
          {restaurant.address && <span>📍 {restaurant.address}</span>}
          {restaurant.phone && <span>📞 {restaurant.phone}</span>}
        </div>
      </div>

      {/* Kategori hızlı navigasyon */}
      {categories.length > 3 && (
        <div style={{
          display: 'flex', gap: '8px', padding: '12px 16px', overflowX: 'auto',
          backgroundColor: '#fff', borderBottom: '1px solid #E5E7EB',
          scrollbarWidth: 'none',
        }}>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => document.getElementById(`cat-${cat}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              style={{
                flexShrink: 0, padding: '6px 14px', borderRadius: '999px',
                border: `1.5px solid ${theme.accent}`, backgroundColor: 'transparent',
                color: theme.accent, fontSize: '0.8125rem', fontWeight: 500, cursor: 'pointer',
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Uyum notu */}
      <div style={{ margin: '12px 16px', padding: '10px 14px', backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '12px', fontSize: '0.6875rem', color: '#1D4ED8' }}>
        ✓ Bu menü Türkiye Gıda Etiketleme Yönetmeliği (2026) kapsamında alerjen beyanı içermektedir.
      </div>

      {/* Menü */}
      <div style={{ padding: '8px 16px' }}>
        {categories.map((category) => (
          <div key={category} id={`cat-${category}`} style={{ marginBottom: '28px', scrollMarginTop: '64px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', paddingBottom: '8px', borderBottom: `2px solid ${theme.accent}22` }}>
              <div style={{ width: '3px', height: '20px', backgroundColor: theme.accent, borderRadius: '2px' }} />
              <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827', margin: 0 }}>{category}</h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {grouped[category].map((item) => (
                <div key={item.id} style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #E5E7EB', padding: '14px' }}>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#111827', margin: 0 }}>{item.name}</h3>
                      {item.description && (
                        <p style={{ fontSize: '0.8125rem', color: '#6B7280', margin: '4px 0 0', lineHeight: 1.4 }}>{item.description}</p>
                      )}

                      {/* Alerjenler */}
                      {item.allergen_ids.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
                          {item.allergen_ids.map((id) => {
                            const a = ALLERGEN_LABELS[id] ?? { emoji: '⚠️', label: id }
                            return (
                              <span key={id} title={a.label} style={{ fontSize: '0.75rem', backgroundColor: '#FFF7ED', border: '1px solid #FED7AA', color: '#92400E', padding: '2px 8px', borderRadius: '8px' }}>
                                {a.emoji} {a.label}
                              </span>
                            )
                          })}
                        </div>
                      )}

                      {/* Kalori */}
                      {item.nutrition?.kcal && (
                        <p style={{ fontSize: '0.75rem', color: '#9CA3AF', margin: '6px 0 0' }}>
                          🔥 {item.nutrition.kcal} kcal{item.nutrition.portion_desc ? ` · ${item.nutrition.portion_desc}` : ''}
                        </p>
                      )}
                    </div>

                    <div style={{ flexShrink: 0, textAlign: 'right' }}>
                      {item.photo_url && (
                        <img src={item.photo_url} alt={item.name} style={{ width: '64px', height: '64px', objectFit: 'cover', borderRadius: '10px', display: 'block', marginBottom: '6px' }} />
                      )}
                      {item.price && (
                        <span style={{ fontSize: '1rem', fontWeight: 700, color: theme.accent, display: 'block', marginBottom: '6px' }}>
                          {item.price.toFixed(2)} ₺
                        </span>
                      )}
                      {isPro && item.price && (
                        <button
                          onClick={() => addToCart(item)}
                          style={{
                            width: '32px', height: '32px', borderRadius: '50%',
                            backgroundColor: theme.accent, color: '#fff',
                            border: 'none', cursor: 'pointer', fontSize: '1.25rem',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          +
                        </button>
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
      <div style={{ padding: '20px', borderTop: '1px solid #E5E7EB', textAlign: 'center', fontSize: '0.75rem', color: '#9CA3AF' }}>
        <strong style={{ color: theme.accent }}>RestaurantOS</strong> · Yönetmelik uyumlu dijital menü
      </div>

      {/* ── SEPET (sadece Pro/Chain) ─────────────────────── */}
      {isPro && (
        <>
          {/* Sepet FAB */}
          {cartCount > 0 && (
            <button
              onClick={() => setCartOpen(true)}
              style={{
                position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
                backgroundColor: theme.accent, color: '#fff',
                padding: '14px 28px', borderRadius: '999px', border: 'none',
                display: 'flex', alignItems: 'center', gap: '10px',
                fontSize: '0.9375rem', fontWeight: 600, cursor: 'pointer',
                boxShadow: '0 4px 20px rgba(0,0,0,0.25)', zIndex: 50,
              }}
            >
              <span>🛒 Sepet ({cartCount})</span>
              <span style={{ backgroundColor: 'rgba(255,255,255,0.25)', padding: '2px 10px', borderRadius: '999px' }}>
                {cartTotal.toFixed(2)} ₺
              </span>
            </button>
          )}

          {/* Sepet drawer */}
          {cartOpen && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
              {/* Backdrop */}
              <div
                onClick={() => { if (orderStep !== 'submitting') setCartOpen(false) }}
                style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)' }}
              />
              {/* Panel */}
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                backgroundColor: '#fff', borderRadius: '20px 20px 0 0',
                maxHeight: '85vh', overflow: 'auto', padding: '24px 20px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                  <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0 }}>Siparişim</h2>
                  <button onClick={() => setCartOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280' }}>
                    <X size={20} />
                  </button>
                </div>

                {/* Sipariş tamamlandı */}
                {orderStep === 'done' && (
                  <div style={{ textAlign: 'center', padding: '32px 0' }}>
                    <CheckCircle2 size={48} color="#10B981" style={{ margin: '0 auto 16px' }} />
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>Sipariş Alındı!</h3>
                    <p style={{ color: '#6B7280', fontSize: '0.875rem', margin: '0 0 4px' }}>Siparişiniz mutfağa iletildi.</p>
                    {orderId && <p style={{ color: '#9CA3AF', fontSize: '0.75rem' }}>#{orderId.slice(-8).toUpperCase()}</p>}
                    <button
                      onClick={() => { setOrderStep('idle'); setCartOpen(false) }}
                      style={{ marginTop: '20px', padding: '12px 32px', backgroundColor: theme.accent, color: '#fff', borderRadius: '12px', border: 'none', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Tamam
                    </button>
                  </div>
                )}

                {/* Sepet içeriği */}
                {orderStep !== 'done' && (
                  <>
                    <div style={{ marginBottom: '16px' }}>
                      {cart.map(({ item, qty }) => (
                        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', borderBottom: '1px solid #F3F4F6' }}>
                          <div style={{ flex: 1 }}>
                            <p style={{ margin: 0, fontWeight: 500, color: '#111827', fontSize: '0.9375rem' }}>{item.name}</p>
                            <p style={{ margin: '2px 0 0', color: theme.accent, fontWeight: 600, fontSize: '0.875rem' }}>
                              {((item.price ?? 0) * qty).toFixed(2)} ₺
                            </p>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
                              onClick={() => removeFromCart(item.id)}
                              style={{ width: '28px', height: '28px', borderRadius: '50%', border: `1.5px solid ${theme.accent}`, backgroundColor: 'transparent', color: theme.accent, cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >−</button>
                            <span style={{ fontWeight: 600, minWidth: '20px', textAlign: 'center' }}>{qty}</span>
                            <button
                              onClick={() => addToCart(item)}
                              style={{ width: '28px', height: '28px', borderRadius: '50%', border: 'none', backgroundColor: theme.accent, color: '#fff', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >+</button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Sipariş formu */}
                    {orderStep === 'form' && (
                      <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <input
                          value={tableNo}
                          onChange={(e) => setTableNo(e.target.value)}
                          placeholder="Masa no (opsiyonel)"
                          style={{ padding: '12px 14px', borderRadius: '12px', border: '1.5px solid #E5E7EB', fontSize: '0.9375rem', outline: 'none' }}
                        />
                        <textarea
                          value={orderNote}
                          onChange={(e) => setOrderNote(e.target.value)}
                          placeholder="Notunuz (opsiyonel)"
                          rows={2}
                          style={{ padding: '12px 14px', borderRadius: '12px', border: '1.5px solid #E5E7EB', fontSize: '0.9375rem', resize: 'none', outline: 'none' }}
                        />
                      </div>
                    )}

                    {/* Toplam + buton */}
                    <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', fontSize: '1rem', fontWeight: 700 }}>
                        <span>Toplam</span>
                        <span style={{ color: theme.accent }}>{cartTotal.toFixed(2)} ₺</span>
                      </div>
                      <button
                        onClick={() => orderStep === 'idle' ? setOrderStep('form') : handlePlaceOrder()}
                        disabled={orderStep === 'submitting'}
                        style={{
                          width: '100%', padding: '14px', borderRadius: '14px',
                          backgroundColor: theme.accent, color: '#fff', border: 'none',
                          fontSize: '1rem', fontWeight: 600, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                          opacity: orderStep === 'submitting' ? 0.7 : 1,
                        }}
                      >
                        {orderStep === 'submitting'
                          ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> İletiliyor...</>
                          : orderStep === 'form'
                            ? 'Siparişi Gönder'
                            : 'Siparişe Devam Et'
                        }
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
