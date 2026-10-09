/**
 * mediaSafetyServer — SERVER-ONLY media scanning providers + the per-media scan.
 *
 * Providers (each optional, enabled by env; a missing key simply means "no signal from it"):
 *   PhotoDNA Cloud Service (hash match vs known CSAM)   PHOTODNA_SUBSCRIPTION_KEY [, PHOTODNA_ENDPOINT]
 *   OpenAI omni-moderation-latest (free)                 OPENAI_API_KEY [, OPENAI_MODERATION_MODEL]
 *   Gemini vision, art-aware second opinion             GOOGLE_AI_API_KEY | GEMINI_API_KEY [, SAFETY_GEMINI_MODEL]
 *
 * FAIL-SAFE: a provider error is recorded in `providerErrors`; it is never converted into "approved".
 * When nothing produced a signal the decision carries scanComplete=false and the caller marks the
 * target scanStatus:'unscanned' so the cron sweep retries.
 *
 * Video: frames, never the whole file. Mux → image.mux.com thumbnails; Storage video → ffmpeg
 * pulls single frames (only when ffmpeg is on PATH — it is in the Cloud Run image).
 *
 * Nothing here ever logs or returns media bytes, URLs with tokens, or model descriptions of content.
 */
import { spawn } from 'node:child_process';
import nodeCrypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import {
  decideSafety, maxScores,
  type SafetyContext, type SafetyDecision, type SafetySignals, type OpenAiScores, type GeminiSignal, type HashMatchSignal, type GeminiVerdict,
} from './safetyPolicy';
import { gcsDownload, storagePathFromUrl, STORAGE_BUCKET } from './safetyServerIo';

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_BYTES = 300 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;

/** Hosts we will fetch media from. Anything else is "external" and not scanned (no SSRF surface). */
const FETCH_ALLOW = new Set(['image.mux.com', 'firebasestorage.googleapis.com', 'storage.googleapis.com', `${STORAGE_BUCKET}.storage.googleapis.com`]);

const geminiKey = () => process.env.GOOGLE_AI_API_KEY || process.env.VITE_GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || '';

export function providerStatus() {
  return {
    photodna: !!process.env.PHOTODNA_SUBSCRIPTION_KEY,
    openai: !!process.env.OPENAI_API_KEY,
    gemini: !!geminiKey(),
  };
}

// ── Media inputs ──────────────────────────────────────────────────────────────

export interface MediaRef {
  kind: 'image' | 'video';
  url?: string | null;
  storagePath?: string | null;
  muxPlaybackId?: string | null;
  durationSec?: number | null;
}

interface Frame { bytes: Buffer; mime: string }

export interface MediaScanResult {
  decision: SafetyDecision;
  signals: SafetySignals;
  frames: number;
  storagePath: string | null;
  contentType: string | null;
  size: number | null;
  md5: string | null;
  sha256: string | null;
  photodnaTrackingId: string | null;
  /** Why media could not be fetched at all (decision is then unscanned). */
  fetchError: string | null;
}

async function fetchAllowed(url: string, maxBytes: number): Promise<{ bytes: Buffer; contentType: string | null } | null> {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:' || !FETCH_ALLOW.has(u.hostname)) return null;
  try {
    const res = await fetch(u, { redirect: 'error', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const len = Number(res.headers.get('content-length') || 0);
    if (len && len > maxBytes) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) return null;
    return { bytes: buf, contentType: (res.headers.get('content-type') || '').split(';')[0] || null };
  } catch { return null; }
}

// ── ffmpeg (optional) ─────────────────────────────────────────────────────────

let _ffmpeg: Promise<boolean> | null = null;
export function ffmpegAvailable(): Promise<boolean> {
  if (!_ffmpeg) {
    _ffmpeg = new Promise(resolve => {
      try {
        const p = spawn('ffmpeg', ['-version'], { stdio: 'ignore' });
        p.on('error', () => resolve(false));
        p.on('exit', code => resolve(code === 0));
      } catch { resolve(false); }
    });
  }
  return _ffmpeg;
}

function ffmpegToJpeg(args: string[], input?: Buffer, timeoutMs = 20_000): Promise<Buffer | null> {
  return new Promise(resolve => {
    let out: Buffer[] = [];
    let p: ReturnType<typeof spawn>;
    try { p = spawn('ffmpeg', args, { stdio: [input ? 'pipe' : 'ignore', 'pipe', 'ignore'] }); }
    catch { return resolve(null); }
    const killer = setTimeout(() => { try { p.kill('SIGKILL'); } catch { /* */ } }, timeoutMs);
    p.stdout?.on('data', (d: Buffer) => out.push(d));
    p.on('error', () => { clearTimeout(killer); resolve(null); });
    p.on('exit', code => {
      clearTimeout(killer);
      const buf = Buffer.concat(out); out = [];
      resolve(code === 0 && buf.length > 100 ? buf : null);
    });
    if (input && p.stdin) { p.stdin.on('error', () => { /* ignore EPIPE */ }); p.stdin.end(input); }
  });
}

/** PhotoDNA + OpenAI want JPEG/PNG (static). Normalise webp/heic/animated gif → first-frame JPEG. */
async function normaliseImage(f: Frame): Promise<Frame> {
  if (f.mime === 'image/jpeg' || f.mime === 'image/png') return f;
  if (!(await ffmpegAvailable())) return f;
  const jpg = await ffmpegToJpeg(['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-frames:v', '1', '-vf', 'scale=min(1280\\,iw):-2', '-f', 'image2', '-c:v', 'mjpeg', 'pipe:1'], f.bytes);
  return jpg ? { bytes: jpg, mime: 'image/jpeg' } : f;
}

function sniffMime(b: Buffer, fallback: string | null): string {
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png';
  if (b.slice(0, 3).toString('ascii') === 'GIF') return 'image/gif';
  if (b.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return fallback || 'application/octet-stream';
}

async function videoFrames(ref: MediaRef): Promise<{ frames: Frame[]; error: string | null }> {
  const frames: Frame[] = [];
  if (ref.muxPlaybackId && /^[A-Za-z0-9]+$/.test(ref.muxPlaybackId)) {
    const d = ref.durationSec && ref.durationSec > 2 ? ref.durationSec : 0;
    const times = d ? [0.1, 0.35, 0.6, 0.85].map(x => Math.floor(d * x)) : [1, 5, 15, 30];
    for (const t of [...new Set(times)]) {
      const got = await fetchAllowed(`https://image.mux.com/${ref.muxPlaybackId}/thumbnail.jpg?time=${t}&width=640`, MAX_IMAGE_BYTES);
      if (got) frames.push({ bytes: got.bytes, mime: 'image/jpeg' });
    }
    return { frames, error: frames.length ? null : 'mux_thumbnails_unavailable' };
  }
  if (!(await ffmpegAvailable())) return { frames, error: 'ffmpeg_unavailable' };
  // Pull the file to a temp path (ffmpeg seeks locally; avoids handing it tokened URLs).
  const sp = ref.storagePath || (ref.url ? storagePathFromUrl(ref.url) : null);
  const got = sp ? await gcsDownload(sp, MAX_VIDEO_BYTES) : ref.url ? await fetchAllowed(ref.url, MAX_VIDEO_BYTES) : null;
  if (!got) return { frames, error: 'video_fetch_failed' };
  const tmp = path.join(os.tmpdir(), `safety_${nodeCrypto.randomBytes(8).toString('hex')}`);
  try {
    await fs.writeFile(tmp, got.bytes);
    for (const t of [1, 4, 10, 25]) {
      const jpg = await ffmpegToJpeg(['-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', tmp, '-frames:v', '1', '-vf', 'scale=640:-2', '-f', 'image2', '-c:v', 'mjpeg', 'pipe:1']);
      if (jpg) frames.push({ bytes: jpg, mime: 'image/jpeg' });
    }
  } finally { fs.unlink(tmp).catch(() => {}); }
  return { frames, error: frames.length ? null : 'no_frames_extracted' };
}

// ── Providers ─────────────────────────────────────────────────────────────────

/** PhotoDNA Cloud Service Match. Binary body; Status.Code 3000 = OK. */
export async function photoDnaMatch(f: Frame): Promise<{ match: HashMatchSignal; trackingId: string | null } | { error: string }> {
  const key = process.env.PHOTODNA_SUBSCRIPTION_KEY;
  if (!key) return { error: 'photodna:not_configured' };
  if (!['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/tiff'].includes(f.mime)) return { error: 'photodna:unsupported_format' };
  const endpoint = process.env.PHOTODNA_ENDPOINT || 'https://api.microsoftmoderator.com/photodna/v1.0/Match';
  try {
    const res = await fetch(`${endpoint}?enhance=false`, {
      method: 'POST',
      headers: { 'Content-Type': f.mime, 'Ocp-Apim-Subscription-Key': key },
      body: f.bytes as any,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return { error: `photodna:http_${res.status}` };
    const j = await res.json() as any;
    const code = Number(j?.Status?.Code);
    if (code && code !== 3000) return { error: `photodna:status_${code}` };
    return { match: { source: 'photodna', matched: j?.IsMatch === true }, trackingId: j?.TrackingId ? String(j.TrackingId) : null };
  } catch (e: any) { return { error: `photodna:${e?.name === 'TimeoutError' ? 'timeout' : 'network'}` }; }
}

/** OpenAI moderation for one image (and optional text). Free endpoint. */
export async function openAiModerate(input: { frame?: Frame; text?: string }): Promise<{ scores: OpenAiScores } | { error: string }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { error: 'openai:not_configured' };
  const parts: any[] = [];
  if (input.text) parts.push({ type: 'text', text: input.text.slice(0, 4000) });
  if (input.frame) parts.push({ type: 'image_url', image_url: { url: `data:${input.frame.mime};base64,${input.frame.bytes.toString('base64')}` } });
  if (!parts.length) return { error: 'openai:empty' };
  try {
    const res = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: process.env.OPENAI_MODERATION_MODEL || 'omni-moderation-latest', input: parts }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return { error: `openai:http_${res.status}` };
    const j = await res.json() as any;
    const s = j?.results?.[0]?.category_scores;
    if (!s || typeof s !== 'object') return { error: 'openai:bad_response' };
    return { scores: s as OpenAiScores };
  } catch (e: any) { return { error: `openai:${e?.name === 'TimeoutError' ? 'timeout' : 'network'}` }; }
}

const GEMINI_VERDICTS: GeminiVerdict[] = ['safe', 'sensitive_artistic', 'sexual_adult', 'graphic_fictional', 'graphic_real', 'sexualized_minor', 'uncertain'];

export function geminiSafetyPrompt(ctx: SafetyContext, frameCount: number): string {
  return [
    'You are a content-safety CLASSIFIER for Plajah, a platform for artists, filmmakers, musicians, writers and educators.',
    frameCount > 1 ? `The ${frameCount} images are frames sampled from ONE video.` : 'Classify the attached image.',
    'Return ONLY the JSON object described by the schema. Do not describe the image.',
    '',
    'Creative, medical and educational work is NOT a violation. Treat these as safe or sensitive_artistic:',
    'horror and fantasy art, special-effects makeup, prop or stage gore, film and video-game stills, anatomy and surgical education,',
    'figure drawing and fine-art nudity, fashion, lingerie and swimwear, dance, music videos, war and news photography.',
    '',
    'verdict:',
    '- safe: nothing sensitive.',
    '- sensitive_artistic: nudity, darkness or injury inside clearly creative, medical or educational work.',
    '- sexual_adult: sexually explicit content involving adults (sexual acts or pornographic focus).',
    '- graphic_fictional: gore or violence that is fictional, staged, illustrated or special effects.',
    '- graphic_real: an apparently REAL photo or video of actual severe injury, death, mutilation or torture of a real person or animal.',
    '- sexualized_minor: anyone who appears under 18 shown nude in a sexual context, in sexual activity, or posed with a sexual focus. Applies to drawn, animated and AI-generated images too.',
    '- uncertain: you cannot tell.',
    'isArtistic: true when the image is plainly art, illustration, a film/game still, a costume/SFX shot, or educational material.',
    'minorsPresent: whether any depicted person appears to be under 18 (none / possible / likely).',
    'realVsFictional: real = appears to be an unstaged photograph of real events; fictional = art, illustration, CGI, staged or SFX; unclear otherwise.',
    'reason: at most 15 neutral words naming the category only. Never describe bodies or acts.',
    '',
    `Surface: ${ctx.surface}. Creator labels: ${(ctx.creatorLabels || []).join(', ') || 'none'}. From a creative tool: ${ctx.isCreativeWorkUpload ? 'yes' : 'no'}.`,
  ].join('\n');
}

export async function geminiClassify(frames: Frame[], ctx: SafetyContext): Promise<{ signal: GeminiSignal } | { refused: 'prohibited' | 'safety' } | { error: string }> {
  const key = geminiKey();
  if (!key) return { error: 'gemini:not_configured' };
  const usable = frames.filter(f => /^image\/(jpeg|png|webp|heic|heif)$/.test(f.mime)).slice(0, 6);
  if (!usable.length) return { error: 'gemini:unsupported_format' };
  const model = process.env.SAFETY_GEMINI_MODEL || 'gemini-3.6-flash';
  const body = {
    contents: [{ role: 'user', parts: [
      ...usable.map(f => ({ inlineData: { mimeType: f.mime, data: f.bytes.toString('base64') } })),
      { text: geminiSafetyPrompt(ctx, usable.length) },
    ] }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 300,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          verdict: { type: 'STRING', enum: GEMINI_VERDICTS },
          isArtistic: { type: 'BOOLEAN' },
          minorsPresent: { type: 'STRING', enum: ['none', 'possible', 'likely'] },
          realVsFictional: { type: 'STRING', enum: ['real', 'fictional', 'unclear'] },
          reason: { type: 'STRING' },
        },
        required: ['verdict', 'isArtistic', 'minorsPresent', 'realVsFictional', 'reason'],
      },
      thinkingConfig: { thinkingLevel: 'minimal' },
    },
    // A classifier has to be allowed to look. Google's non-configurable CSAM filter still applies
    // and surfaces as blockReason PROHIBITED_CONTENT, which we treat as a signal (see safetyPolicy).
    safetySettings: ['HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT', 'HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH']
      .map(category => ({ category, threshold: 'BLOCK_NONE' })),
  };
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return { error: `gemini:http_${res.status}` };
    const j = await res.json() as any;
    const block = String(j?.promptFeedback?.blockReason || '');
    const finish = String(j?.candidates?.[0]?.finishReason || '');
    if (block === 'PROHIBITED_CONTENT' || finish === 'PROHIBITED_CONTENT') return { refused: 'prohibited' };
    if (block || finish === 'SAFETY' || finish === 'IMAGE_SAFETY' || finish === 'BLOCKLIST') return { refused: 'safety' };
    const text = (j?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text || '').join('');
    const parsed = parseGeminiSignal(text);
    return parsed ? { signal: parsed } : { error: 'gemini:bad_json' };
  } catch (e: any) { return { error: `gemini:${e?.name === 'TimeoutError' ? 'timeout' : 'network'}` }; }
}

export function parseGeminiSignal(text: string): GeminiSignal | null {
  try {
    const o = JSON.parse(text);
    if (!GEMINI_VERDICTS.includes(o?.verdict)) return null;
    return {
      verdict: o.verdict,
      isArtistic: o.isArtistic === true,
      minorsPresent: ['none', 'possible', 'likely'].includes(o.minorsPresent) ? o.minorsPresent : 'possible',
      realVsFictional: ['real', 'fictional', 'unclear'].includes(o.realVsFictional) ? o.realVsFictional : 'unclear',
      reason: String(o.reason || '').slice(0, 200),
    };
  } catch { return null; }
}

// ── One media item ────────────────────────────────────────────────────────────

export async function scanMedia(ref: MediaRef, ctx: SafetyContext, opts: { text?: string } = {}): Promise<MediaScanResult> {
  const storagePath = ref.storagePath || (ref.url ? storagePathFromUrl(ref.url) : null);
  const base: Omit<MediaScanResult, 'decision' | 'signals'> = {
    frames: 0, storagePath, contentType: null, size: null, md5: null, sha256: null, photodnaTrackingId: null, fetchError: null,
  };

  let frames: Frame[] = [];
  if (ref.kind === 'video') {
    const v = await videoFrames({ ...ref, storagePath });
    frames = v.frames;
    base.fetchError = v.error;
  } else {
    const got = storagePath ? await gcsDownload(storagePath, MAX_IMAGE_BYTES) : ref.url ? await fetchAllowed(ref.url, MAX_IMAGE_BYTES) : null;
    if (got) {
      base.contentType = got.contentType;
      base.size = got.bytes.length;
      base.md5 = nodeCrypto.createHash('md5').update(got.bytes).digest('hex');
      base.sha256 = nodeCrypto.createHash('sha256').update(got.bytes).digest('hex');
      frames = [await normaliseImage({ bytes: got.bytes, mime: sniffMime(got.bytes, got.contentType) })];
    } else {
      base.fetchError = storagePath ? 'storage_fetch_failed' : ref.url ? 'external_or_unreachable_url' : 'no_media_reference';
    }
  }
  base.frames = frames.length;

  const signals: SafetySignals = { providerErrors: [] };
  if (!frames.length) {
    signals.providerErrors!.push(`fetch:${base.fetchError || 'none'}`);
    return { ...base, signals, decision: decideSafety(signals, ctx) };
  }

  const status = providerStatus();
  const [dna, oai, gem, txt] = await Promise.all([
    status.photodna ? Promise.all(frames.map(photoDnaMatch)) : Promise.resolve([]),
    status.openai ? Promise.all(frames.map(f => openAiModerate({ frame: f }))) : Promise.resolve([]),
    status.gemini ? geminiClassify(frames, ctx) : Promise.resolve(null),
    status.openai && opts.text?.trim() ? openAiModerate({ text: opts.text }) : Promise.resolve(null),
  ]);

  const hashList: HashMatchSignal[] = [];
  for (const r of dna) {
    if ('error' in r) signals.providerErrors!.push(r.error);
    else { hashList.push(r.match); base.photodnaTrackingId = base.photodnaTrackingId || r.trackingId; }
  }
  if (hashList.length) signals.hashMatch = hashList;

  const scoreList: OpenAiScores[] = [];
  for (const r of oai) { if ('error' in r) signals.providerErrors!.push(r.error); else scoreList.push(r.scores); }
  let merged = maxScores(scoreList);
  if (txt && 'scores' in txt) {
    const tm = txt.scores['sexual/minors'];
    if (typeof tm === 'number') merged = { ...(merged || {}), 'sexual/minors': tm };
  } else if (txt && 'error' in txt) signals.providerErrors!.push(`${txt.error}(text)`);
  if (merged) signals.openai = merged;

  if (gem) {
    if ('signal' in gem) signals.gemini = gem.signal;
    else if ('refused' in gem) signals.geminiRefused = gem.refused;
    else signals.providerErrors!.push(gem.error);
  }
  if (!signals.providerErrors!.length) delete signals.providerErrors;

  return { ...base, signals, decision: decideSafety(signals, ctx) };
}
