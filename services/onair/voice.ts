// SERVER-SIDE ONLY. Voices a host line with the persona's designed ElevenLabs voice, once.
//
// Each line is rendered one time and stored in Firebase Storage at onair/voice/<hash>.mp3, where the
// hash covers voice + model + text. Every listener then streams the same file, so the voice bill
// follows the number of distinct lines, never the size of the audience. Repeated lines (station IDs,
// show opens, the same song pair) cost nothing after the first render.
//
// Guard rails:
//  • only personas with a picked voice (services/onair/elevenVoices.json) are voiced;
//  • a monthly character cap (ONAIR_VOICE_MAX_CHARS, default 2,000,000) — past it, lines stay captions;
//  • when ElevenLabs refuses (quota, unpaid invoice), voicing pauses for 10 minutes instead of retrying
//    on every request. A failure always falls back to the caption; it never blocks the line.

import { createHash } from 'node:crypto';

export const VOICE_MODEL = 'eleven_flash_v2_5';
export const VOICE_FORMAT = 'mp3_44100_64';
const FIREBASE_STORAGE_HOST = 'https://firebasestorage.googleapis.com/v0/b';

export interface PickedVoice { voiceId: string; name?: string }

export interface VoiceDeps {
  apiKey: string | null;
  bucket: string;
  /** Picked voices by persona id (re-read so a new pick lands without a restart). */
  voices: () => Record<string, PickedVoice>;
  /** Store bytes and register `token` as the Firebase download token. */
  upload(path: string, bytes: Uint8Array, contentType: string, token: string): Promise<boolean>;
  fetch?: typeof fetch;
  now?: () => number;
  maxCharsPerMonth?: number;
  log?: (msg: string) => void;
}

export function lineHash(voiceId: string, text: string): string {
  return createHash('sha256').update(`${voiceId}|${VOICE_MODEL}|${VOICE_FORMAT}|${text}`).digest('hex').slice(0, 40);
}

export const lineAudioPath = (hash: string) => `onair/voice/${hash}.mp3`;

export function lineAudioUrl(bucket: string, hash: string): string {
  // The download token is the hash itself: the URL is computable, so a render is found again after a restart.
  return `${FIREBASE_STORAGE_HOST}/${bucket}/o/${encodeURIComponent(lineAudioPath(hash))}?alt=media&token=${hash}`;
}

export interface Voicer {
  /** The audio URL for this persona saying this text, or null (no voice, over budget, or paused). */
  voice(personaId: string, text: string): Promise<string | null>;
  status(): { charsThisMonth: number; cap: number; pausedUntil: number; voiced: string[] };
}

export function createVoicer(d: VoiceDeps): Voicer {
  const f = d.fetch ?? fetch;
  const now = d.now ?? (() => Date.now());
  const cap = d.maxCharsPerMonth ?? (Number(process.env.ONAIR_VOICE_MAX_CHARS) || 2_000_000);
  const log = d.log ?? ((m: string) => console.warn(`[onair voice] ${m}`));
  const known = new Map<string, string>();               // hash → url, renders we know exist
  const inflight = new Map<string, Promise<string | null>>();
  let month = '';
  let chars = 0;
  let pausedUntil = 0;

  const monthKey = () => new Date(now()).toISOString().slice(0, 7);

  async function exists(url: string): Promise<boolean> {
    try { const r = await f(url, { method: 'HEAD' }); return r.ok; } catch { return false; }
  }

  async function render(voiceId: string, text: string, hash: string): Promise<string | null> {
    const url = lineAudioUrl(d.bucket, hash);
    if (await exists(url)) { known.set(hash, url); return url; }
    if (!d.apiKey) return null;
    if (now() < pausedUntil) return null;
    if (monthKey() !== month) { month = monthKey(); chars = 0; }
    if (chars + text.length > cap) return null;

    const res = await f(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${VOICE_FORMAT}`, {
      method: 'POST',
      headers: { 'xi-api-key': d.apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: VOICE_MODEL, voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true } }),
    }).catch(() => null);
    if (!res || !res.ok) {
      const status = res?.status ?? 0;
      // Quota, payment or auth problems will not fix themselves on the next request.
      if ([401, 402, 403, 429].includes(status)) { pausedUntil = now() + 10 * 60_000; log(`ElevenLabs refused (${status}); captions only for 10 minutes`); }
      return null;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!bytes.length) return null;
    chars += text.length;
    if (!(await d.upload(lineAudioPath(hash), bytes, 'audio/mpeg', hash))) return null;
    known.set(hash, url);
    return url;
  }

  return {
    async voice(personaId, text) {
      const v = d.voices()[personaId];
      const clean = text.trim();
      if (!v?.voiceId || !clean || clean.length > 600) return null;
      const hash = lineHash(v.voiceId, clean);
      const hit = known.get(hash);
      if (hit) return hit;
      let job = inflight.get(hash);
      if (!job) {
        job = render(v.voiceId, clean, hash).catch(() => null).finally(() => inflight.delete(hash));
        inflight.set(hash, job);
      }
      return job;
    },
    status() {
      return { charsThisMonth: monthKey() === month ? chars : 0, cap, pausedUntil, voiced: Object.keys(d.voices()) };
    },
  };
}
