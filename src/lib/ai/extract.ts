import Anthropic from '@anthropic-ai/sdk';
import { extractedMenuSchema, ALLERGEN_CODES, type ExtractedMenu } from '@/lib/schemas/menu';

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5';

const SYSTEM_PROMPT = `Sen bir restoran menüsü sayısallaştırma uzmanısın.
Sana bir menünün fotoğrafı veya PDF'i verilecek. Görevin:

1. TÜM kategorileri ve ürünleri eksiksiz çıkar. Emin olamadığın bölümleri
   atlama; en iyi tahminini yap ve "warnings" listesine not düş.
2. Fiyatları sayı olarak çıkar (para birimi simgelerini sayıya dahil etme).
   Fiyat okunamıyorsa null bırak.
3. Her ürün için içerik adından ve açıklamasından yola çıkarak olası
   alerjenleri tahmin et. Yalnız şu kodları kullan: ${ALLERGEN_CODES.join(', ')}.
   Her tahmine 0-1 arası güven skoru ver. Emin değilsen düşük skor ver;
   uydurma. Bu tahminler işletme sahibi tarafından tek tek onaylanacak.
4. Tipik porsiyon için kalori tahmini yapabiliyorsan calories_kcal doldur,
   yapamıyorsan null bırak.
5. Menünün dilini (language_guess, BCP 47) ve para birimini
   (currency_guess, ISO 4217) tahmin et.

Sonucu MUTLAKA submit_menu aracıyla gönder.`;

const SUBMIT_MENU_TOOL: Anthropic.Messages.Tool = {
  name: 'submit_menu',
  description: 'Çıkarılan menüyü yapılandırılmış olarak gönderir.',
  input_schema: {
    type: 'object' as const,
    required: ['menu_name', 'categories'],
    properties: {
      menu_name: { type: 'string' },
      currency_guess: { type: ['string', 'null'] },
      language_guess: { type: ['string', 'null'] },
      warnings: { type: 'array', items: { type: 'string' } },
      categories: {
        type: 'array',
        items: {
          type: 'object',
          required: ['name', 'items'],
          properties: {
            name: { type: 'string' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string' },
                  description: { type: ['string', 'null'] },
                  price: { type: ['number', 'null'] },
                  calories_kcal: { type: ['integer', 'null'] },
                  allergens: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['code', 'confidence'],
                      properties: {
                        code: { type: 'string', enum: [...ALLERGEN_CODES] },
                        confidence: { type: 'number' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

export class MenuExtractionError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'MenuExtractionError';
  }
}

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/**
 * Menü dosyasından (görsel/PDF) yapılandırılmış menü çıkarır.
 * Çıktı zod ile doğrulanır — doğrulanamayan yanıt hata sayılır,
 * yarım/bozuk veri asla veritabanına inmez.
 */
export async function extractMenuFromFile(
  fileBuffer: Buffer,
  mimeType: string
): Promise<{ extracted: ExtractedMenu; model: string }> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const base64 = fileBuffer.toString('base64');

  let fileBlock: Anthropic.Messages.ContentBlockParam;
  if (mimeType === 'application/pdf') {
    fileBlock = {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: base64 },
    };
  } else if (IMAGE_TYPES.has(mimeType)) {
    fileBlock = {
      type: 'image',
      source: {
        type: 'base64',
        media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
        data: base64,
      },
    };
  } else {
    throw new MenuExtractionError(`Desteklenmeyen dosya türü: ${mimeType}`);
  }

  let response: Anthropic.Messages.Message;
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 16384,
      system: SYSTEM_PROMPT,
      tools: [SUBMIT_MENU_TOOL],
      tool_choice: { type: 'tool', name: 'submit_menu' },
      messages: [
        {
          role: 'user',
          content: [
            fileBlock,
            { type: 'text', text: 'Bu menüyü eksiksiz çıkar ve submit_menu ile gönder.' },
          ],
        },
      ],
    });
  } catch (err) {
    throw new MenuExtractionError('AI servisi yanıt vermedi. Lütfen tekrar deneyin.', err);
  }

  const toolUse = response.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use' && b.name === 'submit_menu'
  );
  if (!toolUse) {
    throw new MenuExtractionError('AI yapılandırılmış çıktı üretmedi. Lütfen tekrar deneyin.');
  }

  const parsed = extractedMenuSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new MenuExtractionError(
      'AI çıktısı doğrulanamadı. Daha net bir fotoğrafla tekrar deneyin.',
      parsed.error.flatten()
    );
  }

  return { extracted: parsed.data, model: MODEL };
}
