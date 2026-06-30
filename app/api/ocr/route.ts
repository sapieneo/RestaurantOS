import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { OcrResult, OcrMenuItem } from '@/types'

export const runtime = 'nodejs'
export const maxDuration = 60

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const RequestSchema = z.object({
  imageBase64: z.string().min(100),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
})

const MenuItemSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  price: z.number().nullable(),
  category: z.string(),
  confidence: z.number().min(0).max(1),
})

const OcrResponseSchema = z.object({
  items: z.array(MenuItemSchema),
  low_confidence_detected: z.boolean(),
})

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const body = await request.json()
    const parsed = RequestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Geçersiz istek formatı.' },
        { status: 400 }
      )
    }

    const { imageBase64, mimeType } = parsed.data

    const prompt = `Sen bir restoran menüsü analiz uzmanısın. Aşağıdaki menü görselini analiz et ve tüm ürünleri çıkar.

Her ürün için şunları belirle:
- name: Ürün adı (orijinal Türkçe)
- description: Açıklama varsa, yoksa null
- price: Fiyat (sadece sayı, TL işareti olmadan), okunamıyorsa null
- category: Ürünün hangi kategoriye ait olduğu (ör: "Başlangıçlar", "Ana Yemekler", "İçecekler")
- confidence: Bu ürün kaydının ne kadar güvenilir olduğu (0.0-1.0)

Önemli kurallar:
- Eğer bir alan okunaklı değilse null döndür, tahmin yapma
- Fiyatları sadece sayı olarak ver (249.90 gibi)
- Tüm ürünleri eksiksiz çıkar
- low_confidence_detected: Görselin %30'undan fazlası okunamıyorsa true

Sadece JSON döndür, başka açıklama ekleme:`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp',
                data: imageBase64,
              },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    })

    const rawContent = response.content[0]?.type === 'text' ? response.content[0].text : null
    if (!rawContent) {
      return NextResponse.json(
        { success: false, error: 'AI yanıt üretemedi. Lütfen tekrar deneyin.' },
        { status: 500 }
      )
    }

    // JSON bloğunu çıkar (```json ... ``` varsa temizle)
    const jsonMatch = rawContent.match(/```json\s*([\s\S]*?)\s*```/) ||
                      rawContent.match(/```\s*([\s\S]*?)\s*```/)
    const jsonStr = jsonMatch ? jsonMatch[1] : rawContent.trim()

    let parsed_ai: unknown
    try {
      parsed_ai = JSON.parse(jsonStr)
    } catch {
      return NextResponse.json(
        { success: false, error: 'AI yanıtı işlenemedi. Lütfen tekrar deneyin.' },
        { status: 500 }
      )
    }

    const validated = OcrResponseSchema.safeParse(parsed_ai)
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Menü okunamadı. Daha net bir fotoğraf yükleyin.' },
        { status: 422 }
      )
    }

    const result: OcrResult = {
      items: validated.data.items as OcrMenuItem[],
      raw_text: rawContent,
      low_confidence_detected: validated.data.low_confidence_detected,
      processing_time_ms: Date.now() - startTime,
    }

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error('[OCR] Hata:', error)
    return NextResponse.json(
      { success: false, error: 'Menü işlenirken bir hata oluştu. Lütfen tekrar deneyin.' },
      { status: 500 }
    )
  }
}
