import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const RequestSchema = z.object({
  phone: z.string().regex(/^(05\d{9}|5\d{9}|\+905\d{9})$/, 'Gecerli bir Turkiye telefon numarasi girin.'),
})

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('05')) return '+9' + digits
  if (digits.startsWith('5')) return '+90' + digits
  return phone
}

async function sendSmsNetgsm(phone: string, code: string): Promise<boolean> {
  const normalizedPhone = normalizePhone(phone).replace('+', '')
  const params = new URLSearchParams({
    usercode: process.env.NETGSM_USERCODE!,
    password: process.env.NETGSM_PASSWORD!,
    gsmno: normalizedPhone,
    message: `RestaurantOS dogrulama kodunuz: ${code}. 10 dakika gecerlidir.`,
    msgheader: process.env.NETGSM_MSGHEADER!,
    dil: 'TR',
  })
  try {
    const response = await fetch(`https://api.netgsm.com.tr/sms/send/get?${params.toString()}`)
    const text = await response.text()
    return text.startsWith('00') || text.startsWith('01')
  } catch (err) {
    console.error('[OTP] Netgsm SMS hatasi:', err)
    return false
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = RequestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? 'Gecersiz telefon numarasi.' },
        { status: 400 }
      )
    }

    const phone = normalizePhone(parsed.data.phone)
    const supabase = createServiceClient()

    const { count } = await supabase
      .from('otp_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('phone', phone)
      .gte('created_at', new Date(Date.now() - 60_000).toISOString())

    if ((count ?? 0) >= 3) {
      return NextResponse.json(
        { success: false, error: 'Cok fazla deneme. 1 dakika bekleyin.' },
        { status: 429 }
      )
    }

    const code = generateOtp()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    const { error: insertError } = await supabase
      .from('otp_sessions')
      .insert({ phone, code, expires_at: expiresAt })

    if (insertError) {
      console.error('[OTP] Insert hatasi:', insertError)
      return NextResponse.json(
        { success: false, error: 'Dogrulama kodu olusturulamadi.' },
        { status: 500 }
      )
    }

    if (process.env.NETGSM_DEV_BYPASS === 'true') {
      console.log(`[OTP DEV] ${phone} KOD: ${code}`)
      return NextResponse.json({
        success: true,
        data: { sent: true, expires_at: expiresAt, dev_code: code },
      })
    }

    const sent = await sendSmsNetgsm(phone, code)
    if (!sent) {
      return NextResponse.json(
        { success: false, error: 'SMS gonderilemedi. Lutfen tekrar deneyin.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: { sent: true, expires_at: expiresAt },
    })
  } catch (error) {
    console.error('[OTP Send] Hata:', error)
    return NextResponse.json(
      { success: false, error: 'Beklenmeyen bir hata olustu.' },
      { status: 500 }
    )
  }
}
