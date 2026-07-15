import { randomUUID } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Runware görsel üretimi + iyileştirme (A7/A8).
 * HTTP API: POST https://api.runware.ai/v1, Authorization: Bearer <key>,
 * gövde = task dizisi. imageInference / imageUpscale → data[].imageURL.
 */

const RUNWARE_URL = 'https://api.runware.ai/v1';
// AIR model kimliği. Varsayılan: FLUX.1 schnell (hızlı/ucuz). Env ile değişir.
const MODEL = process.env.RUNWARE_MODEL ?? 'runware:100@1';
const STEPS = Number(process.env.RUNWARE_STEPS ?? '4');
// Ürün adı çevirisi için (adlar Türkçe → görsel modeli anlamaz).
const PROMPT_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5';

export class ImageError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'ImageError';
  }
}

export function isImageConfigured(): boolean {
  return Boolean(process.env.RUNWARE_API_KEY);
}

const DESCRIBE_SYSTEM = `Bir restoran menüsü için görsel üretim öznesi yazıyorsun.
Sana bir menü ürünü verilecek (adı Türkçe olabilir). Görevin: ürünün FİZİKSEL
olarak nasıl göründüğünü anlatan KISA, İngilizce, gerçekçi bir ifade üret —
tek bir fotoğrafın öznesi olacak şekilde. Yemekse tabakta, içecekse uygun
bardak/kadeh içinde. Türkçe adı olduğu gibi bırakabilirsin ama İngilizce
görsel betimleme ekle.
SADECE ifadeyi yaz; tırnak, açıklama, ekstra kelime yok.
Örnekler:
"Su" -> a clear glass of still water on a table
"Ayran" -> a glass of ayran, a white frothy Turkish yogurt drink
"Izgara Köfte" -> grilled Turkish meatballs (kofte) on a plate with garnish
"Efes Pilsen" -> a tall glass of golden pilsner beer with foam
"Şarap Kadeh" -> a glass of red wine`;

/** Türkçe ürün adını görsel için İngilizce betimlemeye çevirir (Claude). */
export async function describeDishInEnglish(
  name: string,
  description?: string | null,
  ingredients?: string | null
): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return name;
  try {
    const anthropic = new Anthropic({ apiKey: key });
    const parts = [`Ürün: ${name}`];
    if (description) parts.push(`Açıklama: ${description}`);
    if (ingredients) parts.push(`İçindekiler: ${ingredients}`);
    const res = await anthropic.messages.create({
      model: PROMPT_MODEL,
      max_tokens: 120,
      system: DESCRIBE_SYSTEM,
      messages: [{ role: 'user', content: parts.join('\n') }],
    });
    const block = res.content.find((b) => b.type === 'text');
    const text = block && 'text' in block ? block.text.trim() : '';
    return text || name;
  } catch {
    return name; // Çeviri başarısızsa ham adı kullan
  }
}

/** Görsel öznesini yemek fotoğrafı prompt'una sarar. */
export function buildFoodPrompt(subject: string): string {
  return (
    `Professional food and beverage photography of ${subject}. ` +
    `Appetizing, realistic, restaurant menu style, freshly served and plated on a table, ` +
    `soft natural lighting, shallow depth of field, high detail, photorealistic. ` +
    `No text, no watermark, no extra dishes.`
  );
}

const NEGATIVE_PROMPT =
  'text, letters, watermark, logo, blurry, low quality, deformed, cartoon, illustration, cgi, extra objects, wrong food';

type RunwareTask = Record<string, unknown> & { taskType: string; taskUUID: string };

/** Runware'e tek task gönderir, sonuç imageURL'ini döndürür. */
async function postRunwareImage(task: RunwareTask): Promise<string> {
  const key = process.env.RUNWARE_API_KEY;
  if (!key) throw new ImageError('Görsel üretimi yapılandırılmamış: RUNWARE_API_KEY eksik.');

  let res: Response;
  try {
    res = await fetch(RUNWARE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify([task]),
    });
  } catch (err) {
    throw new ImageError('Görsel servisine ulaşılamadı.', err);
  }

  let json: {
    data?: { taskType: string; imageURL?: string }[];
    error?: string;
    errors?: { message?: string }[];
  };
  try {
    json = await res.json();
  } catch {
    throw new ImageError(`Görsel servisi geçersiz yanıt verdi (${res.status}).`);
  }
  if (!res.ok || json.error || json.errors) {
    const msg = json.errors?.[0]?.message ?? json.error ?? `Görsel işlenemedi (${res.status}).`;
    throw new ImageError(msg);
  }
  const imageURL = json.data?.find((d) => d.taskType === task.taskType)?.imageURL;
  if (!imageURL) throw new ImageError('Görsel servisi görsel döndürmedi.');
  return imageURL;
}

async function download(url: string): Promise<Buffer> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new ImageError('İşlenen görsel indirilemedi.', err);
  }
  if (!res.ok) throw new ImageError('İşlenen görsel indirilemedi.');
  return Buffer.from(await res.arrayBuffer());
}

/** Verilen prompt'tan tek görsel üretir, WEBP baytlarını döndürür. */
export async function generateImage(prompt: string): Promise<Buffer> {
  const url = await postRunwareImage({
    taskType: 'imageInference',
    taskUUID: randomUUID(),
    positivePrompt: prompt.slice(0, 2000),
    negativePrompt: NEGATIVE_PROMPT,
    width: 768,
    height: 768,
    model: MODEL,
    steps: STEPS,
    numberResults: 1,
    outputType: 'URL',
    outputFormat: 'WEBP',
  });
  return download(url);
}

/**
 * Verilen görseli (URL) içeriğini değiştirmeden yükseltir/keskinleştirir
 * (super-resolution). WEBP baytlarını döndürür.
 */
export async function upscaleImage(inputImageUrl: string): Promise<Buffer> {
  const url = await postRunwareImage({
    taskType: 'imageUpscale',
    taskUUID: randomUUID(),
    inputImage: inputImageUrl,
    upscaleFactor: 2,
    outputType: 'URL',
    outputFormat: 'WEBP',
  });
  return download(url);
}
