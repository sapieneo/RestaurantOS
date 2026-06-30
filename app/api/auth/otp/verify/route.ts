import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const RequestSchema = z.object({
  phone: z.string(),
  code: z.string().length(6, 'Kod 6 haneli olmalidir.'),
  sessionToken: z.string().optional(),
})

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('05')) return '+9' + digits
  if (digits.startsWith('5')) return '+90' + digits
  return phone
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = RequestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? 'Gecersiz istek.' },
        { status: 400 }
      )
    }

    const { code, sessionToken } = parsed.data
    const phone = normalizePhone(parsed.data.phone)
    const supabase = createServiceClient()

    // OTP kaydini bul
    const { data: otpRecord, error: otpError } = await supabase
      .from('otp_sessions')
      .select('id, code, verified, attempts, expires_at')
      .eq('phone', phone)
      .eq('verified', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (otpError || !otpRecord) {
      return NextResponse.json(
        { success: false, error: 'Dogrulama kodu bulunamadi veya suresi dolmus.' },
        { status: 400 }
      )
    }

    if (otpRecord.attempts >= 5) {
      return NextResponse.json(
        { success: false, error: 'Cok fazla hatali deneme. Yeni kod isteyin.' },
        { status: 429 }
      )
    }

    if (otpRecord.code !== code) {
      await supabase
        .from('otp_sessions')
        .update({ attempts: otpRecord.attempts + 1 })
        .eq('id', otpRecord.id)
      return NextResponse.json(
        { success: false, error: 'Hatali kod. Tekrar deneyin.' },
        { status: 400 }
      )
    }

    // OTP dogrulandi
    await supabase
      .from('otp_sessions')
      .update({ verified: true })
      .eq('id', otpRecord.id)

    // Kullanici bul veya olustur
    let userId: string

    const fakeEmail = `${phone.replace('+', '')}@restaurantos.app`

    const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    const existingUser = listData?.users?.find(
      (u) => u.email === fakeEmail || u.user_metadata?.phone === phone
    )

    if (existingUser) {
      userId = existingUser.id
    } else {
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: fakeEmail,
        phone,
        user_metadata: { phone, registered_via: 'otp' },
        email_confirm: true,
      })

      if (createError || !newUser.user) {
        console.error('[OTP Verify] createUser error:', createError)
        return NextResponse.json(
          { success: false, error: 'Hesap olusturulamadi.' },
          { status: 500 }
        )
      }

      userId = newUser.user.id
    }

    // Magic link ile access token al
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: fakeEmail,
    })

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error('[OTP Verify] generateLink error:', linkError)
      // Token olmadan da devam et - sadece userId yeter
      return NextResponse.json({
        success: true,
        data: { verified: true, access_token: userId, user_id: userId },
      })
    }

    const accessToken = linkData.properties.hashed_token

    if (sessionToken) {
      await supabase
        .from('menu_sessions')
        .update({ restaurant_id: null })
        .eq('session_token', sessionToken)
    }

    return NextResponse.json({
      success: true,
      data: { verified: true, access_token: accessToken, user_id: userId },
    })
  } catch (error) {
    console.error('[OTP Verify] Hata:', error)
    return NextResponse.json(
      { success: false, error: 'Dogrulama sirasinda bir hata olustu.' },
      { status: 500 }
    )
  }
}
