// Show Director — vision pass. Optional: lets a vision model read what is happening in each
// photo (occasion, setting, mood, emotional intensity) so the director can group and order
// by meaning, not just by date and look.
//
// Lanes (owner policy, services/ai/aiLane.ts): personal photos are privacy-facing.
//   • On this PC — the desktop engine's models are text-only today, so on-device direction
//     uses the director's own analysis (dates, likeness, faces, light) and needs no model.
//   • Cloud (Gemini, through the signed-in /api/ai/gemini proxy) — only after the person sees
//     the estimated cost/time and says yes.
//     Small 384 px thumbnails are sent, six per request; nothing else leaves the device.

import type { ShowPhoto } from './types';
import type { VisionContext } from './director';
import { uprightTrimmed } from './photoPrep';
import { costUsd } from '../ai/aiLane';
import { callGeminiDetailed } from '../geminiService';

/** Browser path: the platform's signed-in Gemini proxy (/api/ai/gemini). */
const MODEL = 'gemini-2.5-flash';

const BATCH = 6;
const IMG_TOKENS = 258;      // Gemini bills a small image at ~258 tokens
const PROMPT_TOKENS = 320;
const OUT_TOKENS_PER = 110;


export function visionEstimate(count: number) {
  const calls = Math.ceil(count / BATCH);
  const model = MODEL;
  const inTok = count * IMG_TOKENS + calls * PROMPT_TOKENS;
  const outTok = count * OUT_TOKENS_PER;
  return { calls, model, usd: costUsd(model, inTok, outTok), seconds: Math.round(calls * 4 + 2) };
}

async function thumb(p: ShowPhoto): Promise<string> {
  const bmp = await uprightTrimmed(p);
  const s = Math.min(1, 384 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.78).split(',')[1];
}

const SYSTEM = `You are the story editor for a memorial photo slideshow. For each photo, describe only what is visible.
Never guess names or identities. Return JSON: {"photos":[{"i":<index>,"kind":"<photo or graphic (poster, obituary or program cover, flyer, card, screenshot, document)>","caption":"<one short sentence>","setting":"<place type>","occasion":"<one of: wedding, birthday, holiday, christmas, graduation, baby, vacation, beach, party, church, sports, reunion, everyday, portrait, unknown>","people":<number>,"mood":"<one or two words>","era":"<decade guess from the photo's look, e.g. 1970s>","emotion":<0..1 how much feeling the picture carries>,"energy":<0..1 celebration/motion vs stillness>,"tags":["<up to 4 short tags>"]}]}`;

export async function readPhotos(photos: ShowPhoto[], onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<Map<string, VisionContext>> {
  const out = new Map<string, VisionContext>();
  const todo = photos.filter((p) => !p.context);
  let done = 0;
  for (let k = 0; k < todo.length; k += BATCH) {
    if (signal?.aborted) throw new DOMException('Stopped', 'AbortError');
    const batch = todo.slice(k, k + BATCH);
    const parts: any[] = [{ text: SYSTEM }];
    for (let j = 0; j < batch.length; j++) {
      parts.push({ text: `Photo ${j}:` });
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: await thumb(batch[j]) } });
    }
    parts.push({ text: `Describe photos 0 to ${batch.length - 1}. JSON only.` });
    try {
      const res = await callGeminiDetailed(parts, { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: OUT_TOKENS_PER * batch.length + 200 }, MODEL);
      if (!res.ok) throw Object.assign(new Error(res.message || 'Vision is unavailable.'), { code: res.code });
      const text = res.text;
      const parsed = JSON.parse(text.replace(/^```(json)?|```$/g, '').trim());
      for (const r of parsed.photos || []) {
        const p = batch[r.i];
        if (!p) continue;
        out.set(p.id, {
          caption: String(r.caption || '').slice(0, 160),
          setting: r.setting, occasion: r.occasion, people: Number.isFinite(+r.people) ? +r.people : undefined,
          mood: r.mood, era: r.era,
          emotion: clamp01(+r.emotion), energy: clamp01(+r.energy),
          tags: Array.isArray(r.tags) ? r.tags.slice(0, 4).map(String) : undefined,
          kind: r.kind === 'graphic' ? 'graphic' : 'photo',
        });
      }
    } catch (e: any) {
      // sign-in / not configured: stop and tell the caller rather than silently skipping everything
      if (e?.code === 'SIGN_IN_REQUIRED' || e?.code === 'NOT_CONFIGURED') throw e;
      console.warn('[director] vision batch failed', e);
    }
    done += batch.length;
    onProgress?.(done, todo.length);
  }
  return out;
}

function clamp01(v: number) { return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : undefined as unknown as number; }
