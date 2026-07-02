import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import type { ComplianceAnalysis, MeatType } from '@/types'

export const runtime = 'nodejs'
export const maxDuration = 120

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const BATCH_SIZE = 12

const RequestSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      category: z.string(),
    })
  ).min(1).max(200),
})

const ComplianceItemSchema = z.object({
  item_id: z.string(),
  allergen_slugs: z.array(z.string()),
  ingredients: z.array(z.string()),
  meat_type: z.enum(['dana', 'kuzu', 'tavuk', 'hindi', 'balik', 'karisik', 'yok']).nullable(),
  kcal: z.number().nullable(),
  protein_g: z.number().nullable(),
  fat_g: z.number().nullable(),
  carb_g: z.number().nullable(),
  portion_g: z.number().nullable(),
  portion_desc: z.string(),
  contains_alcohol: z.boolean().nullable(),
  contains_pork: z.boolean().nullable(),
  confidence: z.enum(['high', 'medium', 'low']),
  confidence_notes: z.string().nullable(),
})

type InputItem = { id: string; name: string; description: string | null; category: string }

async function analyzeChunk(
  items: InputItem[],
  allergenList: string,
  validSlugs: Set<string>
): Promise<Record<string, ComplianceAnalysis>> {
  const itemsText = items
    .map((item) => `ID: ${item.id}\nName: ${item.name}\nDescription: ${item.description ?? 'none'}\nCategory: ${item.category}`)
    .join('\n\n')

  const prompt = `You are a food safety expert analyzing Turkish restaurant menu items for the new "Şeffaf Menü" regulation (1 July 2026).

ALLERGENS (use ONLY these slugs):
${allergenList}

MEAT TYPES (use ONLY these values): dana, kuzu, tavuk, hindi, balik, karisik, yok

Return a JSON array (no wrapper object) with one entry per item:
[
  {
    "item_id": "<same ID as given>",
    "allergen_slugs": ["<slug>", ...],
    "ingredients": ["<ingredient in Turkish>", ...],
    "meat_type": "<dana|kuzu|tavuk|hindi|balik|karisik|yok|null>",
    "kcal": <number or null>,
    "protein_g": <number or null>,
    "fat_g": <number or null>,
    "carb_g": <number or null>,
    "portion_g": <number or null>,
    "portion_desc": "<e.g. 1 porsiyon (300g)>",
    "contains_alcohol": <true/false/null>,
    "contains_pork": <true/false/null>,
    "confidence": "<high|medium|low>",
    "confidence_notes": "<string or null>"
  }
]

CRITICAL RULES:
- "ingredients": list main ingredients in plain Turkish (e.g. "kuzu kıyma", "pul biber", "lavaş"). Keep it practical, 3-8 items.
- "meat_type": if the dish contains meat, specify which animal. Use "karisik" for mixed meats. Use "yok" for vegetarian/vegan dishes. Use null ONLY if you genuinely cannot determine from the name.
- "portion_g": estimate portion weight in grams. If you cannot make a reasonable estimate, use null. DO NOT GUESS wildly — null is better than a wrong number.
- Use null for ANY value you are not reasonably confident about. A missing field (null) is ALWAYS better than a wrong value — wrong allergen info can cause anaphylaxis.
- Use ONLY the slug values from the allergen list above
- Return ONLY the JSON array, no explanation, no markdown

Items:
${itemsText}`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  })

  const rawContent = response.content[0]?.type === 'text' ? response.content[0].text : null
  if (!rawContent) return {}

  let jsonStr = rawContent.trim()
  const codeMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (codeMatch) jsonStr = codeMatch[1].trim()

  const arrStart = jsonStr.indexOf('[')
  const arrEnd = jsonStr.lastIndexOf(']')
  if (arrStart === -1 || arrEnd === -1) {
    console.error('[Compliance] No JSON array found in chunk response')
    return {}
  }
  jsonStr = jsonStr.slice(arrStart, arrEnd + 1)

  let parsedAi: unknown
  try {
    parsedAi = JSON.parse(jsonStr)
  } catch (e) {
    console.error('[Compliance] JSON parse error in chunk:', e, 'Raw:', rawContent.slice(0, 300))
    return {}
  }

  const itemArray = Array.isArray(parsedAi) ? parsedAi : []
  const chunkResults: Record<string, ComplianceAnalysis> = {}

  for (const rawItem of itemArray) {
    const item = ComplianceItemSchema.safeParse(rawItem)
    if (!item.success) {
      console.warn('[Compliance] Item parse fail:', item.error.flatten())
      continue
    }
    chunkResults[item.data.item_id] = {
      menu_item_name: items.find((i) => i.id === item.data.item_id)?.name ?? '',
      allergen_ids: item.data.allergen_slugs.filter((slug) => validSlugs.has(slug)),
      ingredients: item.data.ingredients,
      meat_type: item.data.meat_type as MeatType | null,
      kcal: item.data.kcal,
      protein_g: item.data.protein_g,
      fat_g: item.data.fat_g,
      carb_g: item.data.carb_g,
      portion_g: item.data.portion_g,
      portion_desc: item.data.portion_desc,
      contains_alcohol: item.data.contains_alcohol,
      contains_pork: item.data.contains_pork,
      confidence: item.data.confidence,
      confidence_notes: item.data.confidence_notes,
    }
  }

  return chunkResults
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = RequestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Gecersiz istek formati.', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()
    const { data: allergens, error: allergenError } = await supabase
      .from('allergens')
      .select('id, name_tr, icon_slug')
      .order('sort_order')

    if (allergenError || !allergens) {
      console.error('[Compliance] Allergen error:', allergenError)
      return NextResponse.json(
        { success: false, error: 'Alerjen listesi yuklenemedi.' },
        { status: 500 }
      )
    }

    const allergenList = allergens.map((a) => `- ${a.icon_slug}: ${a.name_tr}`).join('\n')
    const validSlugs = new Set(allergens.map((a) => a.icon_slug))

    const allItems = parsed.data.items
    const chunks: InputItem[][] = []
    for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
      chunks.push(allItems.slice(i, i + BATCH_SIZE))
    }

    console.log(`[Compliance] ${allItems.length} items, ${chunks.length} chunks`)

    const CONCURRENCY = 3
    const results: Record<string, ComplianceAnalysis> = {}

    for (let i = 0; i < chunks.length; i += CONCURRENCY) {
      const batch = chunks.slice(i, i + CONCURRENCY)
      const batchResults = await Promise.all(
        batch.map((chunk) => analyzeChunk(chunk, allergenList, validSlugs))
      )
      for (const r of batchResults) {
        Object.assign(results, r)
      }
    }

    return NextResponse.json({ success: true, data: results })
  } catch (error) {
    console.error('[Compliance] Hata:', error)
    return NextResponse.json(
      { success: false, error: 'Uyum analizi sirasinda bir hata olustu.' },
      { status: 500 }
    )
  }
}
