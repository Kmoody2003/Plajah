/**
 * altTextService — optional AI suggestion for image descriptions.
 * Reuses the existing Gemini browser proxy (callGeminiDetailed in geminiService).
 * Returns '' on any failure; callers must keep whatever the author typed.
 */
import { callGeminiDetailed } from './geminiService';

async function toJpegBase64(url: string, maxDim = 1024): Promise<string | null> {
  try {
    const blob = await (await fetch(url)).blob();
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    return dataUrl.split(',')[1] || null;
  } catch { return null; }
}

/** One-sentence, plain description of an image for screen-reader users. */
export async function suggestAltText(imageUrl: string): Promise<string> {
  const data = await toJpegBase64(imageUrl);
  if (!data) return '';
  const res = await callGeminiDetailed([
    { inlineData: { data, mimeType: 'image/jpeg' } },
    { text: 'Write alt text for this image for a screen-reader user: one factual sentence, under 200 characters, no "image of" or "photo of" prefix, no guessing at identities. Return only the sentence.' },
  ]);
  return res.ok ? res.text.trim().replace(/^["']|["']$/g, '').slice(0, 300) : '';
}
