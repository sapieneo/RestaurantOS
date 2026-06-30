import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { z } from 'zod'

export const runtime = 'nodejs'

const Schema = z.object({
  plan: z.enum(['starter', 'pro', 'chain']),
})

const PLAN_PRICES: Record<string, { price: number; name: string }> = {
  starter: { price: 499,  name: 'RestaurantOS Başlangıç' },
  pro:     { price: 1499, name: 'RestaurantOS Pro' },
  chain:   { price: 3999, name: 'RestaurantOS Zincir' },
}

export async function POST(req: NextRequest) {
  try {
    // Auth kontrolü
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const parsed = Schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Geçersiz plan.' }, { status: 400 })
    }

    const { plan } = parsed.data
    const planInfo = PLAN_PRICES[plan]

    // Test / development modunda ödemeyi atla
    if (process.env.NODE_ENV === 'development' || process.env.SKIP_PAYMENT === 'true') {
      // Supabase'de planı güncelle (service client — RLS bypass)
      const supabase = createServiceClient()
      const { data: { user } } = await supabase.auth.getUser(token)

      if (user) {
        await supabase
          .from('restaurants')
          .update({ plan: plan as 'starter' | 'pro' | 'chain' })
          .eq('user_id', user.id)
      }

      return NextResponse.json({
        success: true,
        data: { dev_mode: true, plan, message: 'Geliştirme modunda ödeme atlandı.' },
      })
    }

    // ── İYZİCO ─────────────────────────────────────────────
    // Gerçek iyzico entegrasyonu için:
    // 1. npm install iyzipay
    // 2. IYZICO_API_KEY ve IYZICO_SECRET_KEY env var'larını ekle
    // 3. Aşağıdaki kodu uncomment et

    /*
    const Iyzipay = require('iyzipay')
    const iyzipay = new Iyzipay({
      apiKey: process.env.IYZICO_API_KEY!,
      secretKey: process.env.IYZICO_SECRET_KEY!,
      uri: process.env.NODE_ENV === 'production'
        ? 'https://api.iyzipay.com'
        : 'https://sandbox-api.iyzipay.com',
    })

    const supabase = createServiceClient()
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return NextResponse.json({ success: false, error: 'Kullanıcı bulunamadı.' }, { status: 401 })

    // Kullanıcı bilgilerini çek
    const phone = user.email?.replace('@restaurantos.app', '').replace('905', '05')
    const conversationId = crypto.randomUUID()

    const request = {
      locale: 'tr',
      conversationId,
      price: planInfo.price.toString(),
      paidPrice: planInfo.price.toString(),
      currency: 'TRY',
      basketId: `plan_${plan}_${user.id}`,
      paymentGroup: 'SUBSCRIPTION',
      callbackUrl: `${process.env.APP_URL}/api/payment/callback`,
      enabledInstallments: [1, 2, 3, 6],
      buyer: {
        id: user.id,
        name: 'İşletme Sahibi',
        surname: 'RestaurantOS',
        gsmNumber: phone ?? '+905000000000',
        email: user.email!,
        identityNumber: '00000000000',
        registrationDate: new Date().toISOString().split('T')[0],
        lastLoginDate: new Date().toISOString().split('T')[0],
        registrationAddress: 'Türkiye',
        ip: req.headers.get('x-forwarded-for') ?? '127.0.0.1',
        city: 'Istanbul',
        country: 'Turkey',
      },
      shippingAddress: { contactName: 'RestaurantOS', city: 'Istanbul', country: 'Turkey', address: 'Dijital Ürün' },
      billingAddress: { contactName: 'RestaurantOS', city: 'Istanbul', country: 'Turkey', address: 'Dijital Ürün' },
      basketItems: [{
        id: plan,
        name: planInfo.name,
        category1: 'SaaS',
        itemType: 'VIRTUAL',
        price: planInfo.price.toString(),
      }],
    }

    const result = await new Promise((resolve, reject) => {
      iyzipay.checkoutFormInitialize.create(request, (err: Error, res: unknown) => {
        if (err) reject(err); else resolve(res)
      })
    }) as { status: string; checkoutFormContent?: string; errorMessage?: string }

    if (result.status !== 'success') {
      return NextResponse.json({ success: false, error: result.errorMessage ?? 'Ödeme başlatılamadı.' }, { status: 400 })
    }

    return NextResponse.json({ success: true, data: { checkoutFormContent: result.checkoutFormContent } })
    */

    // Şimdilik placeholder — iyzico entegrasyonu yukarıda
    return NextResponse.json({
      success: false,
      error: 'Ödeme entegrasyonu henüz yapılandırılmadı. IYZICO_API_KEY env var\'ı eksik.',
    }, { status: 503 })

  } catch (err) {
    console.error('[payment/init]', err)
    return NextResponse.json({ success: false, error: 'Sunucu hatası.' }, { status: 500 })
  }
}
