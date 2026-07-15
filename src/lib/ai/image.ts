import { randomUUID } from 'node:crypto';

/**
 * Runware görsel üretimi (A7/A8).
 * HTTP API: POST https://api.runware.ai/v1, Authorization: Bearer <key>,
 * gövde = task dizisi. imageInference → data[].imageURL.
 */

const RUNWARE_URL = 'https://api.runware.ai/v1';
// AIR model kimliği. Varsayılan: FLUX.1 schnell (hızlı/ucuz). Env ile değişir.
const MODEL = process.env.RUNWARE_MODEL ?? 'runware:100@1';
const STEPS = Number(process.env.RUNWARE_STEPS ?? '4');

export class ImageError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'ImageError';
  }
}

export function isImageConfigured(): boolean {
  return Boolean(process.env.RUNWARE_API_KEY);
}

/** Ürün adı + açıklama/içindekilerden yemek fotoğrafı prompt'u üretir. */
export function buildFoodPrompt(name: string, description?: string | null, ingredients?: string | null): string {
  const extra = [description, ingredients].filter(Boolean).join(', ');
  const detail = extra ? `, featuring ${extra}` : '';
  return (
    `Professional food and beverage photography of "${name}"${detail}. ` +
    `Appetizing, restaurant menu style, served on a plate or glass on a wooden table, ` +
    `soft natural lighting, shallow depth of field, high detail, photorealistic. ` +
    `No text, no watermark.`
  );
}

const NEGATIVE_PROMPT =
  'text, letters, watermark, logo, blurry, low quality, deformed, cartoon, illustration, cgi, extra objects';

/**
 * Verilen prompt'tan tek görsel üretir ve WEBP baytlarını döndürür.
 * Runware URL döndürür; bytes'ı kalıcı depolamak için indiririz.
 */
export async function generateImage(prompt: string): Promise<Buffer> {
  const key = process.env.RUNWARE_API_KEY;
  if (!key) {
    throw new ImageError('Görsel üretimi yapılandırılmamış: RUNWARE_API_KEY eksik.');
  }

  let res: Response;
  try {
    res = await fetch(RUNWARE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify([
        {
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
        },
      ]),
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
    const msg = json.errors?.[0]?.message ?? json.error ?? `Görsel üretilemedi (${res.status}).`;
    throw new ImageError(msg);
  }

  const imageURL = json.data?.find((d) => d.taskType === 'imageInference')?.imageURL;
  if (!imageURL) {
    throw new ImageError('Görsel servisi görsel döndürmedi.');
  }

  let imgRes: Response;
  try {
    imgRes = await fetch(imageURL);
  } catch (err) {
    throw new ImageError('Üretilen görsel indirilemedi.', err);
  }
  if (!imgRes.ok) {
    throw new ImageError('Üretilen görsel indirilemedi.');
  }
  return Buffer.from(await imgRes.arrayBuffer());
}
