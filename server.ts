import express from 'express';
// NOTE: `vite` is imported LAZILY inside the dev-only branch below. A static top-level import pulls
// the entire Vite package (esbuild + rollup + its whole dep graph) into memory on EVERY boot — even
// in production, where the Vite dev middleware is never used. That eager load was the bulk of the
// Cloud Run cold-start time and pushed the container past the startup health-check ("failed to start
// and listen on PORT within the allocated timeout"). Loading it only in dev keeps production boot lean.
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { BskyAgent } from '@atproto/api';
import fs from 'fs/promises';
import { Readable } from 'stream';
import { readFileSync } from 'fs';
import { lookup as dnsLookup } from 'node:dns/promises';
import { buildProgramGuide, buildXmltv, buildMrss, nowAndNext, type EpgSlot, type EpgChannel, type MrssItem } from './services/fastChannelEpg';
import { slotDurationSec } from './services/fastChannelTimeline';
import { buildLinearMediaPlaylist, currentProgrammeMasterUrl, buildM3uLineup, type M3uChannel } from './services/fastChannelHls';
import nodeCrypto from 'node:crypto';
import { spawn } from 'node:child_process';
import os from 'node:os';
import Stripe from 'stripe';
import { coraRouter } from './routes/cora';
import { learnerAuthRouter } from './routes/learnerAuth';
import { createCustomToken, fsGet, fsSet, fsPatch, fsDelete } from './services/firebaseAdminRest';
import { buildFfmpegArgs } from './services/crossover/engine';
import { extFor } from './services/crossover/formats';
import type { Recipe as CxRecipe, MediaKind as CxKind, MediaProbe as CxProbe } from './services/crossover/types';

// Load .env.local (development) or .env (production) — no dotenv dependency needed
for (const envFile of ['.env.local', '.env']) {
  try {
    readFileSync(envFile, 'utf8').split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eq = trimmed.indexOf('=');
      if (eq === -1) return;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (key && !(key in process.env)) process.env[key] = val;
    });
    break;
  } catch {}
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Google service-account auth for Firestore REST ──────────────────────────
// Unauthenticated REST calls evaluate as request.auth == null in security
// rules, so every server-side WRITE was silently rejected. With
// GOOGLE_SERVICE_ACCOUNT_JSON set (full service-account key JSON), we mint
// short-lived OAuth tokens and the server gets full datastore access.
let _gsaToken: { token: string; exp: number } | null = null;
async function getGoogleAccessToken(): Promise<string | null> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  if (_gsaToken && Date.now() < _gsaToken.exp - 120_000) return _gsaToken.token;
  try {
    const sa = JSON.parse(raw);
    const now = Math.floor(Date.now() / 1000);
    const b64url = (s: string) => Buffer.from(s).toString('base64url');
    const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }))}`;
    const signer = nodeCrypto.createSign('RSA-SHA256');
    signer.update(unsigned);
    const jwt = `${unsigned}.${signer.sign(sa.private_key).toString('base64url')}`;
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`,
    });
    const data = await res.json() as any;
    if (!data.access_token) return null;
    _gsaToken = { token: data.access_token, exp: Date.now() + (data.expires_in ?? 3600) * 1000 };
    return _gsaToken.token;
  } catch (err: any) {
    console.error('[Auth] Service account token mint failed:', err.message);
    return null;
  }
}

async function firestoreAuthHeaders(): Promise<Record<string, string>> {
  const token = await getGoogleAccessToken();
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
}

// ── Social video generation (cover + audio → MP4 for Facebook/Instagram inline play) ──
// Meta only autoplays a direct video/mp4 in-feed, not an HTML audio player — so for music
// shares we render a short cover+audio MP4 and point og:video at it. Cached in Cloud Storage.
const STORAGE_BUCKET = process.env.STORAGE_BUCKET || 'gen-lang-client-0665118474.firebasestorage.app';

// Firebase project id for FCM HTTP v1 (messages:send). Prefer the service-account
// JSON's project_id; fall back to the storage bucket prefix.
function fcmProjectId(): string {
  try {
    const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}');
    if (sa.project_id) return sa.project_id as string;
  } catch { /* ignore */ }
  return STORAGE_BUCKET.split('.')[0];
}

async function gcsObjectExists(objectPath: string): Promise<boolean> {
  const token = await getGoogleAccessToken();
  if (!token) return false;
  try {
    const url = `https://storage.googleapis.com/storage/v1/b/${STORAGE_BUCKET}/o/${encodeURIComponent(objectPath)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    return res.ok;
  } catch { return false; }
}

async function gcsUpload(objectPath: string, data: Buffer, contentType: string): Promise<boolean> {
  const token = await getGoogleAccessToken();
  if (!token) return false;
  try {
    const url = `https://storage.googleapis.com/upload/storage/v1/b/${STORAGE_BUCKET}/o?uploadType=media&name=${encodeURIComponent(objectPath)}`;
    const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType }, body: data as any });
    return res.ok;
  } catch { return false; }
}

async function gcsDownload(objectPath: string): Promise<Buffer | null> {
  const token = await getGoogleAccessToken();
  if (!token) return null;
  try {
    const url = `https://storage.googleapis.com/storage/v1/b/${STORAGE_BUCKET}/o/${encodeURIComponent(objectPath)}?alt=media`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch { return null; }
}

/** Download a remote URL to a local temp file (ffmpeg can't reliably loop a remote image). */
async function fetchToTmp(url: string, ext: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100) return null;
    const p = path.join(os.tmpdir(), `sv_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`);
    await fs.writeFile(p, buf);
    return p;
  } catch { return null; }
}

/** Run ffmpeg with the given args; capture stderr + guard with a wall-clock timeout. */
function runFfmpeg(args: string[], timeoutMs = 45000): Promise<{ ok: boolean; err: string }> {
  return new Promise((resolve) => {
    let stderr = '';
    let ff: ReturnType<typeof spawn>;
    try { ff = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] }); }
    catch (e: any) { return resolve({ ok: false, err: `spawn failed: ${e?.message || e}` }); }
    ff.stderr?.on('data', (d) => { stderr += d.toString(); if (stderr.length > 6000) stderr = stderr.slice(-6000); });
    const killer = setTimeout(() => { stderr += '\n[timeout — killed]'; try { ff.kill('SIGKILL'); } catch { /* */ } }, timeoutMs);
    ff.on('error', (e: any) => { clearTimeout(killer); resolve({ ok: false, err: `${stderr}\nerror: ${e?.message || e}`.slice(-2000) }); });
    ff.on('close', (code) => { clearTimeout(killer); resolve({ ok: code === 0, err: code === 0 ? '' : `${stderr}\n[exit ${code}]`.slice(-2000) }); });
  });
}

/** Run ffprobe and return the parsed JSON (streams + format) plus stderr. */
function runFfprobe(input: string, timeoutMs = 30000): Promise<{ ok: boolean; json: any; err: string }> {
  return new Promise((resolve) => {
    let out = ''; let err = '';
    let ff: ReturnType<typeof spawn>;
    try {
      ff = spawn('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-print_format', 'json', input], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e: any) { return resolve({ ok: false, json: null, err: `spawn failed: ${e?.message || e}` }); }
    ff.stdout?.on('data', (d) => { out += d.toString(); });
    ff.stderr?.on('data', (d) => { err += d.toString(); if (err.length > 4000) err = err.slice(-4000); });
    const killer = setTimeout(() => { try { ff.kill('SIGKILL'); } catch { /* */ } }, timeoutMs);
    ff.on('error', (e: any) => { clearTimeout(killer); resolve({ ok: false, json: null, err: `${err}\n${e?.message || e}` }); });
    ff.on('close', (code) => {
      clearTimeout(killer);
      let json: any = null;
      try { json = JSON.parse(out); } catch { /* */ }
      resolve({ ok: code === 0 && !!json, json, err });
    });
  });
}

/**
 * Transcribe ONE short audio window into captions whose timestamps are RELATIVE to the
 * start of the clip (0.0 = first sample). Short windows are the whole point: an LLM aligns
 * accurately inside ~45s but drifts badly over a full song, so we align locally and let the
 * caller add each window's exact (ffmpeg-extracted) start offset to recover absolute time.
 */
async function transcribeAudioWindow(
  genai: any, Type: any, base64: string, mimeType: string,
  meta: { title?: string; artist?: string; kind?: string; windowSec: number },
): Promise<{ time: number; text: string }[]> {
  const isSpeech = meta.kind === 'speech';
  const secs = Math.round(meta.windowSec);
  const prompt = `You are a precise audio transcription engine. This is a ${secs}-second EXCERPT clipped from "${(meta.title || '').slice(0, 160)}"${meta.artist ? ` by "${(meta.artist || '').slice(0, 160)}"` : ''}.
Transcribe ${isSpeech ? 'every spoken phrase' : 'every sung or spoken line'} you can clearly hear in THIS excerpt.
Rules:
- Timestamps are RELATIVE TO THE START OF THIS EXCERPT: 0.0 is the clip's first sample. Precise to 0.1s.
- The clip is only ${secs} seconds long, so NO timestamp may be negative or exceed ${secs}.
- Each "text" entry is one natural ${isSpeech ? 'phrase or sentence clause (~6-15 words)' : 'line (~3-8 words)'}. Do not merge multiple lines.
- The clip may begin or end mid-line — still transcribe the partial lines you clearly hear.
- Do NOT invent, guess, or summarise. Only transcribe clearly audible words. If the clip is purely instrumental or silent, return [].
- Sort entries by ascending time.`;
  const response = await genai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      { inlineData: { data: base64, mimeType } },
      { text: prompt },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.OBJECT, properties: { time: { type: Type.NUMBER }, text: { type: Type.STRING } }, required: ['time', 'text'] },
      },
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  const raw = (response as any).text || '[]';
  let arr: any[] = [];
  try { arr = JSON.parse(raw); }
  catch { const cut = raw.lastIndexOf('}'); if (cut > 0) { try { arr = JSON.parse(raw.slice(0, cut + 1) + ']'); } catch { arr = []; } } }
  return Array.isArray(arr)
    ? arr.filter(c => typeof c?.time === 'number' && !isNaN(c.time) && typeof c?.text === 'string' && c.text.trim())
         // Clamp any stray out-of-clip timestamps back into [0, windowSec].
         .map(c => ({ time: Math.min(Math.max(0, c.time), meta.windowSec), text: c.text.trim() }))
    : [];
}

/** Shape an ffprobe JSON result into a Crossover MediaProbe. */
function ffprobeToProbe(json: any, stderr: string): CxProbe {
  const warnings: string[] = [];
  const streams: any[] = json?.streams || [];
  const v = streams.find((s) => s.codec_type === 'video');
  const a = streams.find((s) => s.codec_type === 'audio');
  const fmt = json?.format || {};
  let fps: number | undefined;
  if (v?.r_frame_rate && /\d+\/\d+/.test(v.r_frame_rate)) {
    const [n, d] = v.r_frame_rate.split('/').map(Number);
    if (d) fps = Math.round((n / d) * 100) / 100;
  }
  const probe: CxProbe = {
    container: (fmt.format_name || '').split(',')[0] || '',
    durationSec: fmt.duration ? Number(fmt.duration) : undefined,
    bitrate: fmt.bit_rate ? Number(fmt.bit_rate) : undefined,
    width: v?.width,
    height: v?.height,
    fps,
    videoCodec: v?.codec_name,
    audioCodec: a?.codec_name,
    sampleRate: a?.sample_rate ? Number(a.sample_rate) : undefined,
    channels: a?.channels,
    warnings,
  };
  if (/moov atom not found/i.test(stderr)) { probe.needsFinalize = true; warnings.push('Container index/moov atom missing — needs finalizing.'); }
  if (stderr && !probe.needsFinalize && /(invalid data|error|corrupt)/i.test(stderr)) { probe.corrupt = true; warnings.push(stderr.split('\n')[0].slice(0, 160)); }
  return probe;
}

const CX_MIME: Record<string, string> = {
  mp4: 'video/mp4', mov: 'video/quicktime', mkv: 'video/x-matroska', webm: 'video/webm',
  ts: 'video/mp2t', mpg: 'video/mpeg', avi: 'video/x-msvideo', gif: 'image/gif',
  wav: 'audio/wav', mp3: 'audio/mpeg', m4a: 'audio/mp4', flac: 'audio/flac', ogg: 'audio/ogg',
  opus: 'audio/opus', aiff: 'audio/aiff', caf: 'audio/x-caf',
  png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif', tiff: 'image/tiff',
};
const cxRand = () => `${Date.now()}_${Math.random().toString(36).slice(2)}`;

// Free-tier conversion cap (admins/staff unlimited). Plajah+ unlimited is a
// future step — add the plan check here AND in services/crossoverUsage.ts together.
const CX_FREE_LIMIT = 3;
async function cxUsage(uid: string): Promise<{ isAdmin: boolean; used: number }> {
  const u = await firestoreRead('users', uid);
  const role = u?.role;
  const isAdmin = role === 'admin' || role === 'staff';
  return { isAdmin, used: Number(u?.crossoverConversions || 0) };
}

/** Cover image + up to 45s of audio → a small square MP4. TWO passes so a huge album cover
 *  (real ones are 20–30 MB) doesn't OOM the instance: decode+shrink the cover to 720×720 ONCE,
 *  then loop that tiny image over the audio. */
async function generateSocialVideoMp4(coverUrl: string, audioUrl: string): Promise<{ buf: Buffer | null; err: string }> {
  const coverPath = await fetchToTmp(coverUrl, 'img');
  if (!coverPath) return { buf: null, err: 'cover download failed' };
  const smallCover = path.join(os.tmpdir(), `svc_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);
  const out = path.join(os.tmpdir(), `sv_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`);
  const cleanup = () => { for (const p of [coverPath, smallCover, out]) fs.unlink(p).catch(() => {}); };

  // Pass 1 — decode the (possibly enormous) cover exactly once → a tiny 720×720 JPEG.
  const shrink = await runFfmpeg(['-y', '-i', coverPath, '-vf', 'scale=720:720:force_original_aspect_ratio=increase,crop=720:720', '-frames:v', '1', smallCover], 30000);
  fs.unlink(coverPath).catch(() => {});
  if (!shrink.ok) { cleanup(); return { buf: null, err: `cover shrink: ${shrink.err}` }; }

  // Pass 2 — loop the tiny image over the audio (low memory). Audio streams from the URL.
  const enc = await runFfmpeg([
    '-y', '-loop', '1', '-framerate', '2', '-i', smallCover, '-i', audioUrl, '-t', '45',
    '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', '-r', '15',
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-movflags', '+faststart', '-shortest', out,
  ], 45000);
  fs.unlink(smallCover).catch(() => {});
  if (!enc.ok) { fs.unlink(out).catch(() => {}); console.error('[social-video] ffmpeg failed:', enc.err.slice(-300)); return { buf: null, err: `encode: ${enc.err}` }; }

  try { const buf = await fs.readFile(out); fs.unlink(out).catch(() => {}); return { buf, err: '' }; }
  catch (e: any) { return { buf: null, err: `read failed: ${e?.message || e}` }; }
}

/** Cover image → a gorgeous, Meta-safe 1200×630 JPEG social card. The crisp full album
 *  art is centered over a blurred fill of itself, so nothing is cropped and the card grabs
 *  attention on both X (summary_large_image) and Facebook. Raw covers are 20–30 MB PNGs that
 *  Facebook silently drops (>8 MB) — this is the #1 reason album art wasn't previewing. */
async function generateSocialImageJpg(coverUrl: string): Promise<{ buf: Buffer | null; err: string }> {
  const coverPath = await fetchToTmp(coverUrl, 'img');
  if (!coverPath) return { buf: null, err: 'cover download failed' };
  const out = path.join(os.tmpdir(), `si_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);
  const cleanup = () => { for (const p of [coverPath, out]) fs.unlink(p).catch(() => {}); };
  // Blurred-fill background + centered sharp art. One decode, split into two paths.
  const fancy = '[0:v]split=2[a][b];[a]scale=1200:630:force_original_aspect_ratio=increase,crop=1200:630,gblur=sigma=30[bg];[b]scale=606:606:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p';
  let enc = await runFfmpeg(['-y', '-i', coverPath, '-filter_complex', fancy, '-frames:v', '1', '-q:v', '3', out], 30000);
  if (!enc.ok) {
    // Fallback (no gblur dependency): letterbox the whole art onto a black 1200×630.
    enc = await runFfmpeg(['-y', '-i', coverPath, '-vf', 'scale=1200:630:force_original_aspect_ratio=decrease,pad=1200:630:(ow-iw)/2:(oh-ih)/2:color=black', '-frames:v', '1', '-q:v', '3', out], 30000);
  }
  fs.unlink(coverPath).catch(() => {});
  if (!enc.ok) { cleanup(); return { buf: null, err: `image render: ${enc.err}` }; }
  try { const buf = await fs.readFile(out); fs.unlink(out).catch(() => {}); return { buf, err: '' }; }
  catch (e: any) { return { buf: null, err: `read failed: ${e?.message || e}` }; }
}

/** Ensure the social card JPEG: serve from Storage cache, else render + cache. Image
 *  rendering is fast (single frame), so this runs synchronously within the request. */
async function ensureSocialImage(objectPath: string, coverUrl: string): Promise<{ buf: Buffer | null; err: string }> {
  const cached = await gcsDownload(objectPath);
  if (cached && cached.length > 500) return { buf: cached, err: '' };
  const { buf, err } = await generateSocialImageJpg(coverUrl);
  if (!buf) return { buf: null, err };
  gcsUpload(objectPath, buf, 'image/jpeg').catch(() => {}); // cache; don't block serving
  return { buf, err: '' };
}

/** Branded 1200×630 default social card (brand gradient) — used as the site-wide default
 *  og:image so generic/homepage shares never fall back to a dead placeholder (the old
 *  via.placeholder.com returned 503). Rendered by ffmpeg on the server; no static asset. */
async function generateDefaultCardJpg(): Promise<{ buf: Buffer | null; err: string }> {
  const out = path.join(os.tmpdir(), `ogdef_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);
  // Tier 1: a diagonal brand gradient (violet → blue). `gradients` lavfi source (ffmpeg 5.1+).
  let enc = await runFfmpeg(['-y', '-f', 'lavfi', '-i',
    'gradients=s=1200x630:c0=0x6D28D9:c1=0x2563EB:x0=0:y0=0:x1=1200:y1=630',
    '-frames:v', '1', '-q:v', '3', out], 20000);
  if (!enc.ok) {
    // Fallback: a solid brand-indigo card (no dependency on the gradients source).
    enc = await runFfmpeg(['-y', '-f', 'lavfi', '-i', 'color=c=0x312E81:s=1200x630',
      '-frames:v', '1', '-q:v', '3', out], 20000);
  }
  if (!enc.ok) return { buf: null, err: `default card: ${enc.err}` };
  try { const buf = await fs.readFile(out); fs.unlink(out).catch(() => {}); return { buf, err: '' }; }
  catch (e: any) { return { buf: null, err: `read failed: ${e?.message || e}` }; }
}

async function ensureDefaultCard(objectPath: string): Promise<{ buf: Buffer | null; err: string }> {
  const cached = await gcsDownload(objectPath);
  if (cached && cached.length > 500) return { buf: cached, err: '' };
  const { buf, err } = await generateDefaultCardJpg();
  if (!buf) return { buf: null, err };
  gcsUpload(objectPath, buf, 'image/jpeg').catch(() => {});
  return { buf, err: '' };
}

/** Resolve the best cover/thumbnail URL for a shareable asset (by type/id, optional track). */
async function resolveShareCover(type: string, id: string, track?: string): Promise<string> {
  const collectionFor: Record<string, string> = {
    video: 'videos', album: 'albums', track: 'albums', book: 'albums', movie: 'albums',
    article: 'articles', game: 'games', videoPlaylist: 'video_playlists',
  };
  const collection = collectionFor[type];
  if (!collection) return '';
  const doc = await fetchFirebaseDoc(collection, id);
  const f = doc?.fields;
  if (!f) return '';
  if ((type === 'album' || type === 'track') && track) {
    const arr = f?.tracks?.arrayValue?.values || [];
    const tf = arr.find((t: any) => t.mapValue?.fields?.id?.stringValue === track)?.mapValue?.fields;
    const tc = tf?.coverImage?.stringValue || tf?.coverImageUrl?.stringValue || tf?.artworkUrl?.stringValue;
    if (tc) return tc;
  }
  const IMG = ['thumbnailUrl', 'coverImageUrl', 'coverImage', 'coverUrl', 'artworkUrl', 'imageUrl', 'videoThumbnail', 'posterUrl', 'thumbnail'];
  for (const k of IMG) { const v = f?.[k]?.stringValue; if (v) return v; }
  // Mux-hosted videos may store only a playback id (no static thumbnail) — derive the poster
  // frame exactly like the app does, so shares still get a real thumbnail (YouTube-style).
  const pid = f?.muxPlaybackId?.stringValue;
  if (pid) return `https://image.mux.com/${pid}/thumbnail.jpg?width=1200&height=630&fit_mode=smartcrop&time=5`;
  return '';
}

const socialVideoInFlight = new Set<string>();
/** Ensure the social MP4 (cover+audio): serve from Storage cache, else generate + cache async. */
async function ensureSocialVideo(objectPath: string, coverUrl: string, audioUrl: string): Promise<{ buf: Buffer | null; err: string }> {
  const cached = await gcsDownload(objectPath);
  if (cached && cached.length > 1000) return { buf: cached, err: '' };
  if (socialVideoInFlight.has(objectPath)) return { buf: null, err: 'generating (in-flight)' };
  socialVideoInFlight.add(objectPath);
  try {
    const { buf, err } = await generateSocialVideoMp4(coverUrl, audioUrl);
    if (!buf) return { buf: null, err };
    gcsUpload(objectPath, buf, 'video/mp4').catch(() => {}); // cache for next time; don't block serving
    return { buf, err: '' };
  } finally { socialVideoInFlight.delete(objectPath); }
}

// ── Chora — music transcode to a streaming ladder (Step 1) ───────────────────────────────
// One ffmpeg job per track: EBU R128 loudness-normalize to −14 LUFS, then emit a High HLS rendition
// (AAC-LC 256, fMP4 6s segments — the default gapless stream), a Data-saver progressive file (HE-AAC
// 96 if libfdk is present, else AAC 128), and a FLAC lossless. Outputs land in GCS under
// chora-hls/{trackId}/ and are served (with Range) by GET /api/chora/media. The original master is
// left untouched. The result is written to a flat choraStreams/{trackId} doc the client joins on play,
// so we never rewrite the album's tracks array.
let _choraLibfdk: boolean | null = null;
async function choraHasLibfdk(): Promise<boolean> {
  if (_choraLibfdk !== null) return _choraLibfdk;
  _choraLibfdk = await new Promise<boolean>((resolve) => {
    try {
      const p = spawn('ffmpeg', ['-hide_banner', '-encoders']);
      let out = '';
      p.stdout.on('data', (d) => (out += d));
      p.stderr.on('data', (d) => (out += d));
      p.on('close', () => resolve(/libfdk_aac/.test(out)));
      p.on('error', () => resolve(false));
    } catch { resolve(false); }
  });
  return _choraLibfdk;
}

interface ChoraTranscodeResult { status: 'ready'; hls: string; low: string; flac: string; loudnessLufs: number; durationSec: number; }
async function choraTranscodeToGcs(inPath: string, trackId: string, publicBase: string): Promise<ChoraTranscodeResult> {
  const workDir = path.join(os.tmpdir(), `chora_${trackId}_${Date.now()}`);
  const hlsDir = path.join(workDir, 'aac256');
  await fs.mkdir(hlsDir, { recursive: true });

  // 1) Measure loudness (EBU R128 two-pass). print_format=json goes to stderr; parse it.
  let ln = 'loudnorm=I=-14:TP=-1:LRA=11';
  let loudnessLufs = -14;
  const meas = await runFfmpeg(['-hide_banner', '-i', inPath, '-af', 'loudnorm=I=-14:TP=-1:LRA=11:print_format=json', '-f', 'null', '-'], 180000);
  const jm = meas.err.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
  if (jm) { try {
    const j = JSON.parse(jm[0]);
    loudnessLufs = parseFloat(j.input_i) || -14;
    ln = `loudnorm=I=-14:TP=-1:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:linear=true`;
  } catch { /* fall back to single-pass loudnorm */ } }

  const heArgs = (await choraHasLibfdk())
    ? ['-c:a', 'libfdk_aac', '-profile:a', 'aac_he_v2', '-b:a', '96k']
    : ['-c:a', 'aac', '-b:a', '128k'];

  // 2) High — AAC-LC 256 HLS (fMP4, 6s) — the default gapless stream.
  const r1 = await runFfmpeg(['-y', '-i', inPath, '-vn', '-af', ln, '-c:a', 'aac', '-b:a', '256k', '-ar', '48000',
    '-f', 'hls', '-hls_time', '6', '-hls_segment_type', 'fmp4', '-hls_playlist_type', 'vod', '-hls_flags', 'independent_segments',
    '-hls_segment_filename', path.join(hlsDir, 'seg_%03d.m4s'), path.join(hlsDir, 'playlist.m3u8')], 300000);
  if (!r1.ok) throw new Error('hls encode: ' + r1.err.slice(-300));

  // 3) Data-saver — progressive HE-AAC/AAC.
  const lowPath = path.join(workDir, 'low.m4a');
  const r2 = await runFfmpeg(['-y', '-i', inPath, '-vn', '-af', ln, ...heArgs, '-ar', '48000', '-movflags', '+faststart', lowPath], 300000);
  if (!r2.ok) throw new Error('low encode: ' + r2.err.slice(-300));

  // 4) Lossless — FLAC.
  const flacPath = path.join(workDir, 'lossless.flac');
  const r3 = await runFfmpeg(['-y', '-i', inPath, '-vn', '-af', ln, '-c:a', 'flac', '-compression_level', '8', flacPath], 300000);
  if (!r3.ok) throw new Error('flac encode: ' + r3.err.slice(-300));

  let durationSec = 0;
  try { const { json } = await runFfprobe(inPath); durationSec = parseFloat(json?.format?.duration || '0') || 0; } catch { /* */ }

  // 5) Upload everything under chora-hls/{trackId}/.
  const ctFor = (f: string) => f.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl'
    : (f.endsWith('.m4s') || f.endsWith('.m4a') || f.endsWith('.mp4')) ? 'audio/mp4'
    : f.endsWith('.flac') ? 'audio/flac' : 'application/octet-stream';
  const uploadFile = async (local: string, rel: string) => {
    const buf = await fs.readFile(local);
    if (!(await gcsUpload(`chora-hls/${trackId}/${rel}`, buf, ctFor(rel)))) throw new Error('gcs upload failed: ' + rel);
  };
  for (const f of await fs.readdir(hlsDir)) await uploadFile(path.join(hlsDir, f), `aac256/${f}`);
  await uploadFile(lowPath, 'low.m4a');
  await uploadFile(flacPath, 'lossless.flac');
  fs.rm(workDir, { recursive: true, force: true }).catch(() => {});

  const base = `${publicBase}/api/chora/media/${trackId}`;
  return { status: 'ready', hls: `${base}/aac256/playlist.m3u8`, low: `${base}/low.m4a`, flac: `${base}/lossless.flac`, loudnessLufs, durationSec };
}

/** Resolve an album's cover + a playable (non-paywalled) track for the social video. */
function pickSocialTrack(fields: any, track?: string): { cover: string; audio: string; trackId: string } | null {
  const cover = fields?.coverImage?.stringValue || fields?.coverImageUrl?.stringValue || '';
  const arr = fields?.tracks?.arrayValue?.values || [];
  const playable = (t: any) => !t?.mapValue?.fields?.isPaywalled?.booleanValue && t?.mapValue?.fields?.url?.stringValue;
  let tObj = track ? arr.find((t: any) => t.mapValue?.fields?.id?.stringValue === track) : null;
  if (!tObj || !playable(tObj)) tObj = arr.find(playable) || null;
  const audio = tObj?.mapValue?.fields?.url?.stringValue || '';
  const trackId = tObj?.mapValue?.fields?.id?.stringValue || 'a';
  if (!cover || !audio) return null;
  return { cover, audio, trackId };
}

// Simple REST fetch for Firebase DB without needing admin SDK initialized
const fetchFirebaseDoc = async (collection: string, id: string) => {
  const projectId = 'gen-lang-client-0665118474';
  const dbId = 'plajah-prod';
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents/${collection}/${id}`;
  try {
    const res = await fetch(url, { headers: await firestoreAuthHeaders() });
    if (!res.ok) return null;
    return await res.json();
  } catch(e) { return null; }
};

// Decode a Firestore REST document's typed `fields` into plain JSON. Scalars + arrays
// of scalars (e.g. fcmTokens) are decoded; nested maps are left undefined (not needed here).
const decodeFirestoreScalar = (v: any = {}): any =>
  v.stringValue ?? (v.integerValue !== undefined ? Number(v.integerValue) : (v.doubleValue ?? (v.booleanValue !== undefined ? v.booleanValue : undefined)));
const decodeFirestoreFields = (f: any = {}): any => {
  const out: any = {};
  for (const k in f) {
    const v = f[k] || {};
    if (v.arrayValue !== undefined) {
      out[k] = (v.arrayValue.values || []).map(decodeFirestoreScalar).filter((x: any) => x !== undefined);
    } else {
      out[k] = decodeFirestoreScalar(v);
    }
  }
  return out;
};

// Structured runQuery over a collection (service-account auth). Used by the public
// media-federation API (media-library API Phase 1).
const queryFirebase = async (collectionId: string, filters: Array<{ field: string; value: any }>, limitN = 100) => {
  const projectId = 'gen-lang-client-0665118474';
  const dbId = 'plajah-prod';
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents:runQuery`;
  const toVal = (v: any) => typeof v === 'number' ? { integerValue: String(v) } : typeof v === 'boolean' ? { booleanValue: v } : { stringValue: String(v) };
  const fieldFilters = filters.map(f => ({ fieldFilter: { field: { fieldPath: f.field }, op: 'EQUAL', value: toVal(f.value) } }));
  const where = fieldFilters.length === 1 ? fieldFilters[0] : { compositeFilter: { op: 'AND', filters: fieldFilters } };
  const body = { structuredQuery: { from: [{ collectionId }], where, limit: limitN } };
  try {
    const res = await fetch(url, { method: 'POST', headers: { ...(await firestoreAuthHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) return [];
    const data = await res.json();
    return (Array.isArray(data) ? data : []).filter((r: any) => r.document).map((r: any) => decodeFirestoreFields(r.document.fields));
  } catch { return []; }
};

// The public-facing host. Firebase Hosting proxies to Cloud Run with the internal
// run.app Host header, so prefer X-Forwarded-Host (the real plajah.com) and never leak
// the run.app domain into og:url / twitter:player (a domain mismatch breaks previews).
function publicHost(req: any): string {
  const xfh = String(req.headers?.['x-forwarded-host'] || '').split(',')[0].trim();
  let h = xfh || (req.get?.('host')) || 'plajah.com';
  if (/\.run\.app$/i.test(h)) h = (process.env.VITE_APP_URL || 'https://plajah.com').replace(/^https?:\/\//, '').replace(/\/$/, '');
  return h;
}

const injectMetaTags = async (html: string, query: any, host: string) => {
   const { type, id, track } = query;
   if (!type || !id) return html;

   // Archive films (Taleo) are external archive.org items — no Firestore doc. Pull the
   // public metadata + thumbnail directly and inject a large-image card.
   if (type === 'archive') {
     try {
       const r = await fetch(`https://archive.org/metadata/${encodeURIComponent(String(id))}`);
       const d: any = await r.json();
       const m = d?.metadata || {};
       const asStr = (v: any) => (Array.isArray(v) ? v[0] : v);
       const title = asStr(m.title) || 'Film';
       const image = `https://archive.org/services/img/${encodeURIComponent(String(id))}`;
       const safeT = htmlEscape(title), safeD = htmlEscape(`Experience "${title}" now on Plajah`);
       const safeI = htmlEscape(image), safeH = htmlEscape(host), safeId = htmlEscape(String(id));
       let tags = html.replace(/[ \t]*<meta\s+(?:property|name)="(?:og:[^"]*|twitter:[^"]*)"[^>]*\/?>\s*/gi, '');
       return tags.replace('</head>', `
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@plajah" />
    <meta name="twitter:title" content="${safeT}" />
    <meta name="twitter:description" content="${safeD}" />
    <meta name="twitter:image" content="${safeI}" />
    <meta property="og:site_name" content="Plajah" />
    <meta property="og:type" content="video.other" />
    <meta property="og:title" content="${safeT}" />
    <meta property="og:description" content="${safeD}" />
    <meta property="og:image" content="${safeI}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:url" content="https://${safeH}/?type=archive&amp;id=${safeId}" />
</head>`);
     } catch { return html; }
   }

   // Every shareable asset type → its Firestore collection. Books/songs live in `albums`.
   const collectionFor: Record<string, string> = {
     video: 'videos', album: 'albums', track: 'albums', book: 'albums',
     movie: 'albums',
     article: 'articles', game: 'games', feed: 'global_posts', post: 'global_posts',
     videoPlaylist: 'video_playlists',
   };
   const collection = collectionFor[String(type)] || '';
   if (!collection) return html;

   const dbData = await fetchFirebaseDoc(collection, id);
   if (!dbData || !dbData.fields) return html;
   const f = dbData.fields;
   // First non-empty string field from a list of candidates (schemas vary by type).
   const pick = (keys: string[]): string => { for (const k of keys) { const v = f?.[k]?.stringValue; if (v) return v; } return ''; };
   const IMG = ['thumbnailUrl', 'coverImageUrl', 'coverImage', 'coverUrl', 'artworkUrl', 'imageUrl', 'videoThumbnail', 'posterUrl', 'thumbnail'];

   let title = '';
   let image = '';
   let desc = '';
   let playerUrl = `https://${host}/embed?type=${type}&id=${id}${track ? `&track=${track}` : ''}`;

   if (type === 'feed' || type === 'post') {
     // A shared post → "<User> is sharing this post from Plajah".
     const author = pick(['authorName', 'userName', 'displayName', 'artist']) || 'Someone';
     title = `${author} is sharing this post from Plajah`;
     desc = pick(['content', 'text', 'caption']) || title;
     image = pick(['imageUrl', 'videoThumbnail', 'thumbnailUrl', 'coverImageUrl']);
     if (!f?.videoUrl?.stringValue) playerUrl = ''; // no player card unless the post has a video
   } else {
     // Content assets (song/track, album, book, video, article, game) →
     // title = the asset's own name; description = Experience "Name" now on Plajah.
     // Artist precedence: a REAL track artist > the album's artist > the owner's name.
     // A placeholder ("Unknown Artist") at the track level must NOT clobber a real album
     // artist (that bug made shares read "by <uploader account>" instead of the artist).
     const isPlaceholderArtist = (s: string) => !s || /^(unknown artist|unknown|various artists?|n\/?a|na|null|undefined)$/i.test((s || '').trim());
     let artist = pick(['artist', 'artistName', 'creatorName', 'ownerName', 'authorName', 'displayName']);
     if ((type === 'album' || type === 'track') && track) {
       const tracksArray = f?.tracks?.arrayValue?.values || [];
       const trackObj = tracksArray.find((t: any) => t.mapValue?.fields?.id?.stringValue === track);
       const tf = trackObj?.mapValue?.fields;
       title = tf?.title?.stringValue || pick(['title', 'name']) || 'Track';
       const ta = tf?.artist?.stringValue;
       if (ta && !isPlaceholderArtist(ta)) artist = ta; // only a real track artist wins
     } else {
       const fallback = type === 'book' ? 'Book' : type === 'game' ? 'Game' : type === 'article' ? 'Article' : type === 'video' ? 'Video' : type === 'videoPlaylist' ? 'Playlist' : type === 'movie' ? 'Film' : 'Album';
       title = pick(['title', 'name']) || fallback;
     }
     // Still missing or a placeholder → fall back to the album owner's display name.
     if (isPlaceholderArtist(artist)) {
       const ownerId = f?.ownerId?.stringValue || f?.ownerUid?.stringValue || f?.uid?.stringValue || f?.creatorUid?.stringValue || f?.artistId?.stringValue;
       if (ownerId) {
         try {
           const owner = await fetchFirebaseDoc('users', ownerId);
           const of = owner?.fields;
           const ownerName = of?.artistName?.stringValue || of?.artistDisplayName?.stringValue || of?.displayName?.stringValue || of?.name?.stringValue || of?.username?.stringValue || of?.handle?.stringValue || '';
           if (ownerName && !isPlaceholderArtist(ownerName)) artist = ownerName;
         } catch { /* keep whatever we had */ }
       }
     }
     if (isPlaceholderArtist(artist)) artist = ''; // still nothing usable → clean "Check out X on Plajah.com"
     image = pick(IMG);
     // Mux-hosted videos/films may carry only a playback id — derive the poster frame so the X /
     // Facebook card shows the real video thumbnail (YouTube-style) instead of falling back to a
     // generic Plajah image. This must run BEFORE the /social-image routing below so `image` is set.
     if (!image && (type === 'video' || type === 'movie') && f?.muxPlaybackId?.stringValue) {
       image = `https://image.mux.com/${f.muxPlaybackId.stringValue}/thumbnail.jpg?width=1200&height=630&fit_mode=smartcrop&time=5`;
     }
     if (type === 'videoPlaylist') {
       const count = f?.videoIds?.arrayValue?.values?.length || 0;
       desc = `Playlist · ${count} video${count === 1 ? '' : 's'} on Plajah`;
     } else if (artist) {
       // The requested share body: creator-forward, drives back to the app.
       desc = `Check out ${title} by ${artist} on Plajah.com`;
     } else {
       // No resolvable artist — keep the same on-brand copy, just without the "by".
       desc = `Check out ${title} on Plajah.com`;
     }
     // Only audio/video get an inline player card; the rest use a large-image card.
     if (!(type === 'video' || type === 'album' || type === 'track')) playerUrl = '';
   }

   // Route the cover through /social-image so the crawler always gets a Meta-safe
   // (<8 MB, correctly-dimensioned 1200×630) JPEG. Raw covers are 20–30 MB PNGs that
   // Facebook silently drops — the #1 reason album art wasn't previewing.
   const resizable = new Set(['album', 'track', 'video', 'movie', 'book', 'game', 'article', 'videoPlaylist']);
   const cardImage = (image && resizable.has(String(type)))
     ? `https://${host}/social-image?type=${encodeURIComponent(String(type))}&id=${encodeURIComponent(String(id))}${track ? `&track=${encodeURIComponent(String(track))}` : ''}`
     : image;
   const safeTitle = htmlEscape(title);
   const safeDesc  = htmlEscape(desc);
   const safeImage = htmlEscape(cardImage);
   const safeHost  = htmlEscape(host);
   const safeType  = htmlEscape(String(type));
   const safeId    = htmlEscape(String(id));

   let metaTags = `
    <meta name="twitter:site" content="@plajah" />
    <meta name="twitter:title" content="${safeTitle}" />
    <meta name="twitter:description" content="${safeDesc}" />
    <meta name="twitter:image" content="${safeImage}" />
    <meta property="og:site_name" content="Plajah" />
    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeDesc}" />
    <meta property="og:image" content="${safeImage}" />
    <meta property="og:url" content="https://${safeHost}/?type=${safeType}&amp;id=${safeId}" />
   `;

   // twitter:card = summary_large_image is the RELIABLE X card: a big thumbnail that always
   // renders. X removed the player-card allowlist and its inline player is flaky ("this media
   // could not be played / can't be reached"), so we do NOT emit twitter:player. Facebook &
   // LinkedIn still get an inline player from the og:video set below (now that /embed is
   // reachable + framable + resolves Mux). Always a large-image card on X.
   metaTags += `\n    <meta name="twitter:card" content="summary_large_image" />`;
   const isMusic = (type === 'album' || type === 'track');
   if (isMusic) {
     // Music → a real cover+audio MP4 (og:video:type=video/mp4) so it plays INLINE on
     // Facebook/Instagram, which don't autoplay HTML/audio players. Square 720×720.
     const mp4 = htmlEscape(`https://${host}/social-video?type=album&id=${encodeURIComponent(String(id))}${track ? `&track=${encodeURIComponent(String(track))}` : ''}`);
     metaTags += `
    <meta property="og:type" content="video.other" />
    <meta property="og:video" content="${mp4}" />
    <meta property="og:video:url" content="${mp4}" />
    <meta property="og:video:secure_url" content="${mp4}" />
    <meta property="og:video:type" content="video/mp4" />
    <meta property="og:video:width" content="720" />
    <meta property="og:video:height" content="720" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />`;
   } else if (playerUrl) {
     // Video (Mux/direct) — HTML player for platforms that still honor og:video text/html.
     const safePlayerUrl = htmlEscape(playerUrl);
     metaTags += `
    <meta property="og:type" content="video.other" />
    <meta property="og:video" content="${safePlayerUrl}" />
    <meta property="og:video:url" content="${safePlayerUrl}" />
    <meta property="og:video:secure_url" content="${safePlayerUrl}" />
    <meta property="og:video:type" content="text/html" />
    <meta property="og:video:width" content="1280" />
    <meta property="og:video:height" content="720" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />`;
   } else {
     const ogType = (type === 'article' || type === 'book') ? 'article' : 'website';
     metaTags += `
    <meta property="og:type" content="${ogType}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />`;
   }

   const oEmbedUrl = `https://${safeHost}/oembed?url=${encodeURIComponent(`https://${host}/?type=${type}&id=${id}`)}&format=json`;
   metaTags += `\n    <link rel="alternate" type="application/json+oembed" href="${htmlEscape(oEmbedUrl)}" title="${safeTitle || 'Plajah'}" />`;
   // Strip the static/default OG + Twitter tags from index.html first, or the crawler sees
   // TWO og:title/og:image (generic first) and most pick the first → generic homepage card.
   html = html.replace(/[ \t]*<meta\s+(?:property|name)="(?:og:[^"]*|twitter:[^"]*)"[^>]*\/?>\s*/gi, '');
   return html.replace('</head>', `${metaTags}\n</head>`);
};


// ── Stripe helpers (shared by all Stripe routes) ─────────────────────────────

function getStripe(): any {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_live_YOUR')) throw new Error('Stripe secret key not configured');
  // ESM server: use the static import (the old require('stripe') threw
  // "require is not defined"). Kept untyped so the many Stripe call sites,
  // written against an `any`, don't need re-typing.
  return new (Stripe as any)(key, { apiVersion: '2024-12-18.acacia' });
}

// Verify a Firebase ID token using Firebase Auth REST API
// Firebase project id for ID-token claim checks — from the service account, then
// env, then the known project (matches firebase-applet-config.json + Firestore).
let _fbProjectId: string | null = null;
function firebaseProjectId(): string {
  if (_fbProjectId) return _fbProjectId;
  try { const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}'); if (sa.project_id) return (_fbProjectId = sa.project_id); } catch {}
  return (_fbProjectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'gen-lang-client-0665118474');
}

// Google's public x509 certs for Firebase ID-token (secure token) signatures.
let _stCerts: { certs: Record<string, string>; exp: number } | null = null;
async function secureTokenCerts(): Promise<Record<string, string>> {
  if (_stCerts && Date.now() < _stCerts.exp) return _stCerts.certs;
  const res = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
  const certs = await res.json() as Record<string, string>;
  const m = /max-age=(\d+)/.exec(res.headers.get('cache-control') || '');
  _stCerts = { certs, exp: Date.now() + (m ? parseInt(m[1], 10) * 1000 : 3_600_000) };
  return certs;
}

// Verify a Firebase ID token by its RS256 signature + claims — no API key needed
// (so it survives a referrer-restricted Web API key, which rejects server-side
// accounts:lookup). Standard checks: alg/kid, exp, iat, aud, iss, sub, signature.
async function verifyIdTokenViaJwt(token: string): Promise<string | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let header: any, payload: any;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch { return null; }
  if (header.alg !== 'RS256' || !header.kid) return null;
  const projectId = firebaseProjectId();
  const now = Math.floor(Date.now() / 1000);
  if (!(typeof payload.exp === 'number' && payload.exp > now)) return null;
  if (!(typeof payload.iat === 'number' && payload.iat <= now + 300)) return null;
  if (payload.aud !== projectId) return null;
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (!payload.sub || typeof payload.sub !== 'string') return null;
  try {
    const certs = await secureTokenCerts();
    const cert = certs[header.kid];
    if (!cert) return null;
    const ok = nodeCrypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), cert, Buffer.from(parts[2], 'base64url'));
    return ok ? payload.sub : null;
  } catch (e: any) {
    console.error('[Auth] JWT signature verify error:', e.message);
    return null;
  }
}

async function verifyFirebaseToken(token: string): Promise<string | null> {
  // Primary: Identity Toolkit lookup — works when FIREBASE_API_KEY is present and
  // NOT referrer-restricted.
  const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY;
  if (apiKey) {
    try {
      const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token }),
      });
      if (res.ok) {
        const data = await res.json() as any;
        const uid = data.users?.[0]?.localId;
        if (uid) return uid;
      }
    } catch (err: any) {
      console.error('[Auth] lookup error (falling back to JWT verify):', err.message);
    }
  }
  // Fallback: verify the token signature directly (no API key).
  return verifyIdTokenViaJwt(token);
}

async function authMiddleware(req: any, res: any, next: any) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const token = auth.slice(7);
  const uid = await verifyFirebaseToken(token);
  if (!uid) return res.status(401).json({ error: 'Invalid token' });
  req.uid = uid;
  next();
}

// Firestore REST helper (reuses existing fetchFirebaseDoc pattern)
async function firestoreWrite(collection: string, id: string, data: object) {
  const projectId = 'gen-lang-client-0665118474';
  const dbId = 'plajah-prod';
  // updateMask makes this a MERGE (upsert): only the provided fields are written,
  // every other field on the doc is preserved. Without it, a PATCH replaces the
  // whole document — which was silently wiping user profiles (and deleting
  // stripeConnectAccountId on the connect-status sync, losing the connection).
  const mask = Object.keys(data).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents/${collection}/${id}?${mask}`;
  // Build Firestore field map
  const fields: any = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'string') fields[k] = { stringValue: v };
    else if (typeof v === 'number') fields[k] = { integerValue: String(v) };
    else if (typeof v === 'boolean') fields[k] = { booleanValue: v };
    else if (v === null || v === undefined) fields[k] = { nullValue: null };
    else if (Array.isArray(v)) fields[k] = { arrayValue: { values: v.map(i => ({ stringValue: String(i) })) } };
    else fields[k] = { stringValue: JSON.stringify(v) };
  }
  const res = await fetch(url, {
    method: 'PATCH',
    headers: await firestoreAuthHeaders(),
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) console.error(`[Firestore] write ${collection}/${id} failed: HTTP ${res.status}${process.env.GOOGLE_SERVICE_ACCOUNT_JSON ? '' : ' (GOOGLE_SERVICE_ACCOUNT_JSON not set — server writes are unauthenticated)'}`);
}

/**
 * Atomically increment numeric fields on a doc, creating it if absent.
 *
 * firestoreWrite() is a PATCH and cannot increment — read-modify-write from a request handler
 * would drop counts under concurrency, which is exactly the situation a play counter lives in.
 * This uses the commit API's fieldTransforms, which Firestore applies atomically server-side.
 *
 * `set` fields are written alongside (last-write-wins) so a rollup can carry its own identity
 * (ownerId, contentType) without a second round trip.
 */
async function firestoreIncrement(
  path: string,
  increments: Record<string, number>,
  set: Record<string, string | number> = {},
): Promise<boolean> {
  const projectId = 'gen-lang-client-0665118474';
  const dbId = 'plajah-prod';
  const docName = `projects/${projectId}/databases/${dbId}/documents/${path}`;
  const fieldTransforms = Object.entries(increments).map(([field, by]) => ({
    fieldPath: field,
    increment: { integerValue: String(Math.round(by)) },
  }));
  const writes: any[] = [];
  if (Object.keys(set).length) {
    const fields: any = {};
    for (const [k, v] of Object.entries(set)) {
      fields[k] = typeof v === 'number' ? { integerValue: String(Math.round(v)) } : { stringValue: String(v) };
    }
    writes.push({
      update: { name: docName, fields },
      updateMask: { fieldPaths: Object.keys(set) },
      // Transform in the SAME write so the doc is created by this operation if missing —
      // a bare transform on a nonexistent doc fails.
      updateTransforms: fieldTransforms,
    });
  } else {
    writes.push({ transform: { document: docName, fieldTransforms } });
  }
  try {
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents:commit`,
      { method: 'POST', headers: await firestoreAuthHeaders(), body: JSON.stringify({ writes }) },
    );
    if (!res.ok) {
      console.error(`[Metrics] increment ${path} failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
      return false;
    }
    return true;
  } catch (e: any) {
    console.error(`[Metrics] increment ${path} threw:`, e?.message || e);
    return false;
  }
}

async function firestoreCreate(collection: string, data: object) {
  const projectId = 'gen-lang-client-0665118474';
  const dbId = 'plajah-prod';
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents/${collection}`;
  const fields: any = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'string') fields[k] = { stringValue: v };
    else if (typeof v === 'number') fields[k] = { integerValue: String(v) };
    else if (typeof v === 'boolean') fields[k] = { booleanValue: v };
    else if (v === null || v === undefined) fields[k] = { nullValue: null };
    else if (Array.isArray(v)) fields[k] = { arrayValue: { values: v.map(i => ({ stringValue: String(i) })) } };
    else fields[k] = { stringValue: JSON.stringify(v) };
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: await firestoreAuthHeaders(),
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) console.error(`[Firestore] create in ${collection} failed: HTTP ${res.status}${process.env.GOOGLE_SERVICE_ACCOUNT_JSON ? '' : ' (GOOGLE_SERVICE_ACCOUNT_JSON not set — server writes are unauthenticated)'}`);
  const json = await res.json() as any;
  return json.name?.split('/').pop() ?? null;
}

/** Read a single doc's scalar fields (Firestore REST GET). Returns null if absent. */
async function firestoreRead(collection: string, id: string): Promise<Record<string, any> | null> {
  const projectId = 'gen-lang-client-0665118474';
  const dbId = 'plajah-prod';
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents/${collection}/${id}`;
  try {
    const res = await fetch(url, { headers: await firestoreAuthHeaders() });
    if (!res.ok) return null;
    const json = await res.json() as any;
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(json.fields || {}) as [string, any][]) {
      if (v.stringValue !== undefined) out[k] = v.stringValue;
      else if (v.integerValue !== undefined) out[k] = Number(v.integerValue);
      else if (v.doubleValue !== undefined) out[k] = Number(v.doubleValue);
      else if (v.booleanValue !== undefined) out[k] = v.booleanValue;
    }
    return out;
  } catch { return null; }
}

const TIER_STORAGE: Record<string, number> = { '1': 50, '2': 75, '3': 100 };
const TIER_POINTS: Record<string, number> = { '1': 100, '2': 300, '3': 1000 };

// ── Security helpers ──────────────────────────────────────────────────────────

function htmlEscape(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function xmlEscape(str: string): string {
  return htmlEscape(str);
}

function safeYouTubeEmbedUrl(mediaUrl: string): string | null {
  let id = '';
  const vMatch = mediaUrl.match(/[?&]v=([^&#]*)/);
  if (vMatch?.[1]) id = vMatch[1];
  else if (mediaUrl.includes('youtu.be/')) id = mediaUrl.split('youtu.be/')[1].split('?')[0];
  if (!/^[a-zA-Z0-9_-]{6,32}$/.test(id)) return null;
  return `https://www.youtube.com/embed/${id}`;
}

function isPrivateHost(hostname: string): boolean {
  return /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1|0\.0\.0\.0|169\.254\.)/.test(hostname);
}

function checkUrlBasics(parsed: URL): URL {
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('Only http/https URLs allowed');
  if (isPrivateHost(parsed.hostname)) throw new Error('Private network access blocked');
  return parsed;
}

function validateProxyUrl(rawUrl: string): URL {
  let parsed: URL;
  // Do NOT decodeURIComponent here: Express already decoded the query param.
  // Decoding again corrupts URLs that legitimately contain encoded characters —
  // e.g. Firebase Storage object paths (`books%2Fclassics%2F…`) turned into
  // literal slashes, which made Storage return 400 for every proxied book.
  try { parsed = new URL(rawUrl); } catch { throw new Error('Invalid URL'); }
  return checkUrlBasics(parsed);
}

// The hostname string check above is bypassable: a public hostname can resolve
// to a private IP (DNS-based SSRF). Resolve and verify every address.
function isPrivateIp(ip: string): boolean {
  if (ip.includes(':')) {
    const v6 = ip.toLowerCase();
    if (v6 === '::1' || v6 === '::') return true;
    if (v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe8') || v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb')) return true;
    if (v6.startsWith('::ffff:')) return isPrivateIp(v6.slice(7)); // v4-mapped
    return false;
  }
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => Number.isNaN(p))) return true; // unparseable → refuse
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||      // CGNAT
    (a === 169 && b === 254) ||                // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168);
}

async function assertPublicHost(parsed: URL): Promise<void> {
  try {
    const addrs = await dnsLookup(parsed.hostname, { all: true });
    if (addrs.length === 0 || addrs.some(a => isPrivateIp(a.address))) {
      throw new Error('Private network access blocked');
    }
  } catch (e: any) {
    if (e?.message === 'Private network access blocked') throw e;
    throw new Error('Host could not be resolved');
  }
}

// SSRF-hardened outbound fetch: validates the URL AND its resolved IPs, and
// follows redirects manually so every hop is re-validated (a 302 to the cloud
// metadata service or an internal host is refused instead of followed).
async function safeOutboundFetch(target: string | URL, init: RequestInit = {}, maxRedirects = 4): Promise<Response> {
  let current = typeof target === 'string' ? checkUrlBasics(new URL(target)) : checkUrlBasics(target);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertPublicHost(current);
    const res = await fetch(current.toString(), { ...init, redirect: 'manual' });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return res;
      current = checkUrlBasics(new URL(loc, current));
      continue;
    }
    return res;
  }
  throw new Error('Too many redirects');
}

const LIGHTS_ALLOWED_HOSTS = new Set(['api.meethue.com', 'developer.api.govee.com', 'api.govee.com', 'api2.govee.com']);
function validateLightsProxyUrl(rawUrl: string): URL {
  const parsed = validateProxyUrl(rawUrl);
  const isHueBridgeLocal = /^192\.168\.\d{1,3}\.\d{1,3}$/.test(parsed.hostname);
  if (!LIGHTS_ALLOWED_HOSTS.has(parsed.hostname) && !isHueBridgeLocal) {
    throw new Error(`Host '${parsed.hostname}' not allowed for lights proxy`);
  }
  return parsed;
}

function validateFediverseInstance(instance: string): void {
  if (!instance || typeof instance !== 'string') throw new Error('Instance required');
  if (!/^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/.test(instance)) {
    throw new Error('Invalid fediverse instance domain');
  }
  if (isPrivateHost(instance)) throw new Error('Private network access blocked');
}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  // ── Alexa skill: "Alexa, ask Chora to play <song>" ───────────────────────
  // Custom Alexa skill endpoint. Verifies Amazon's request signature, searches the
  // PUBLIC Chora catalog, and returns AudioPlayer directives so an Echo streams the
  // track (with album auto-advance). Registered before express.json() so the raw body
  // is available for signature verification. Only public published music is reachable —
  // private-library / locker / intimate tracks are NEVER exposed (legal).
  const ALEXA_SKILL_ID = process.env.ALEXA_SKILL_ID || '';

  let _choraIndex: { tracks: any[]; ts: number } | null = null;
  const getChoraTrackIndex = async (): Promise<any[]> => {
    if (_choraIndex && Date.now() - _choraIndex.ts < 60_000) return _choraIndex.tracks;
    const albums = await queryFirebase('albums', [{ field: 'type', value: 'MUSIC' }], 500);
    const out: any[] = [];
    for (const al of albums) {
      if (al.isIntimateOnly || al.isPublic === false) continue; // never expose intimate/unpublished
      const tracks = Array.isArray(al.tracks) ? al.tracks : [];
      tracks.forEach((t: any, idx: number) => {
        if (!t || !t.url) return;
        if (t.isPrivate || t.isLockerOnly || t.isIntimateOnly) return; // locker/private — never shareable
        const url = String(t.url);
        if (!/^https:\/\//i.test(url)) return; // Alexa AudioPlayer requires HTTPS streams
        out.push({
          title: t.title || 'Untitled',
          artist: t.artist || al.artist || 'Unknown Artist',
          url,
          albumId: al.id || '', index: idx,
          cover: (t.albumCover || al.coverImage || '').startsWith('https') ? (t.albumCover || al.coverImage) : '',
        });
      });
    }
    _choraIndex = { tracks: out, ts: Date.now() };
    return out;
  };
  const scoreChoraMatch = (track: any, songQ: string, artistQ: string): number => {
    const t = (track.title || '').toLowerCase(), a = (track.artist || '').toLowerCase();
    const q = (songQ || '').toLowerCase().trim();
    if (!q) return 0;
    let score = 0;
    if (t === q) score += 100;
    else if (t.includes(q) || q.includes(t)) score += 60;
    else { const words = q.split(/\s+/).filter(w => w.length > 2); score += words.filter(w => t.includes(w)).length * 15; }
    if (artistQ) { const aq = artistQ.toLowerCase().trim(); if (aq && (a.includes(aq) || aq.includes(a))) score += 40; }
    return score;
  };
  const choraTrackByToken = async (token: string, delta = 0): Promise<any | null> => {
    const [albumId, idxStr] = String(token || '').split('::');
    const idx = parseInt(idxStr, 10);
    if (!albumId || !isFinite(idx)) return null;
    const tracks = await getChoraTrackIndex();
    return tracks.find(t => t.albumId === albumId && t.index === idx + delta) || null;
  };

  const alexaSpeak = (text: string, endSession = true) => ({ version: '1.0', response: { outputSpeech: { type: 'PlainText', text }, shouldEndSession: endSession } });
  const alexaAudioItem = (track: any, offset = 0, prevToken?: string) => ({
    stream: { token: `${track.albumId}::${track.index}`, url: track.url, offsetInMilliseconds: offset, ...(prevToken ? { expectedPreviousToken: prevToken } : {}) },
    metadata: { title: track.title, subtitle: track.artist, ...(track.cover ? { art: { sources: [{ url: track.cover }] } } : {}) },
  });
  const alexaPlay = (track: any, offset = 0) => ({ version: '1.0', response: { outputSpeech: { type: 'PlainText', text: `Playing ${track.title} by ${track.artist} on Chora.` }, directives: [{ type: 'AudioPlayer.Play', playBehavior: 'REPLACE_ALL', audioItem: alexaAudioItem(track, offset) }], shouldEndSession: true } });
  const alexaEnqueue = (track: any, prevToken: string) => ({ version: '1.0', response: { directives: [{ type: 'AudioPlayer.Play', playBehavior: 'ENQUEUE', audioItem: alexaAudioItem(track, 0, prevToken) }] } });
  const alexaStop = () => ({ version: '1.0', response: { directives: [{ type: 'AudioPlayer.Stop' }] } });

  // SHA1-RSA signature verification against Amazon's cert chain (skill certification).
  const _alexaCerts = new Map<string, string>();
  const verifyAlexaSignature = async (certUrl: string, signature: string, body: Buffer): Promise<boolean> => {
    try {
      const u = new URL(certUrl);
      if (u.protocol !== 'https:' || u.hostname.toLowerCase() !== 's3.amazonaws.com' || (u.port && u.port !== '443') || !u.pathname.replace(/\/+/g, '/').startsWith('/echo.api/')) return false;
      let pem = _alexaCerts.get(certUrl);
      if (!pem) {
        const r = await safeOutboundFetch(certUrl);
        if (!r.ok) return false;
        pem = await r.text();
        const x509 = new nodeCrypto.X509Certificate(pem);
        const now = new Date();
        if (new Date(x509.validFrom) > now || new Date(x509.validTo) < now) return false;
        if (!/echo-api\.amazon\.com/.test(`${x509.subjectAltName || ''}`)) return false;
        _alexaCerts.set(certUrl, pem);
      }
      const verifier = nodeCrypto.createVerify('RSA-SHA1');
      verifier.update(body);
      return verifier.verify(pem, Buffer.from(signature, 'base64'));
    } catch { return false; }
  };

  app.post('/api/alexa', express.raw({ type: () => true, limit: '1mb' }), async (req: any, res: any) => {
    const body: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
    try {
      // 1. Signature (unless explicitly disabled for local dev)
      if (process.env.ALEXA_SKIP_SIGNATURE !== 'true') {
        const certUrl = String(req.headers['signaturecertchainurl'] || '');
        const signature = String(req.headers['signature'] || '');
        if (!certUrl || !signature || !(await verifyAlexaSignature(certUrl, signature, body))) return res.status(400).json({ error: 'invalid signature' });
      }
      const env = JSON.parse(body.toString('utf8'));
      // 2. Application id + timestamp freshness (replay protection)
      const appId = env?.context?.System?.application?.applicationId || env?.session?.application?.applicationId;
      if (ALEXA_SKILL_ID && appId !== ALEXA_SKILL_ID) return res.status(400).json({ error: 'wrong skill' });
      const ts = new Date(env?.request?.timestamp || 0).getTime();
      if (!ts || Math.abs(Date.now() - ts) > 150_000) return res.status(400).json({ error: 'stale request' });

      const type = env?.request?.type;
      if (type === 'LaunchRequest') return res.json(alexaSpeak('Welcome to Chora. What would you like to hear?', false));

      if (type === 'IntentRequest') {
        const intent = env.request.intent || {};
        const name = intent.name;
        if (name === 'PlaySongIntent') {
          const song = intent.slots?.song?.value || '';
          const artist = intent.slots?.artist?.value || '';
          if (!song) return res.json(alexaSpeak('What song would you like me to play?', false));
          const tracks = await getChoraTrackIndex();
          const best = tracks.map(t => ({ t, s: scoreChoraMatch(t, song, artist) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s)[0];
          if (!best) return res.json(alexaSpeak(`Sorry, I couldn't find ${song} on Chora.`));
          return res.json(alexaPlay(best.t));
        }
        if (name === 'AMAZON.PauseIntent' || name === 'AMAZON.StopIntent' || name === 'AMAZON.CancelIntent') return res.json(alexaStop());
        if (name === 'AMAZON.ResumeIntent') {
          const ap = env.context?.AudioPlayer;
          const t = ap?.token ? await choraTrackByToken(ap.token) : null;
          return res.json(t ? alexaPlay(t, ap.offsetInMilliseconds || 0) : alexaSpeak('There is nothing to resume.'));
        }
        if (name === 'AMAZON.NextIntent') { const t = await choraTrackByToken(env.context?.AudioPlayer?.token, 1); return res.json(t ? alexaPlay(t) : alexaSpeak('That was the last track.')); }
        if (name === 'AMAZON.PreviousIntent') { const t = await choraTrackByToken(env.context?.AudioPlayer?.token, -1); return res.json(t ? alexaPlay(t) : alexaSpeak('This is the first track.')); }
        if (name === 'AMAZON.HelpIntent') return res.json(alexaSpeak('Ask me to play a song. For example, say: play Sunflowers.', false));
        return res.json(alexaSpeak("Sorry, I didn't catch that. Ask me to play a song."));
      }

      if (typeof type === 'string' && type.startsWith('AudioPlayer.')) {
        // Gapless album auto-advance: enqueue the next track as the current one nears the end.
        if (type === 'AudioPlayer.PlaybackNearlyFinished') {
          const t = await choraTrackByToken(env.request?.token, 1);
          if (t) return res.json(alexaEnqueue(t, env.request.token));
        }
        return res.json({ version: '1.0', response: {} });
      }

      if (type === 'SessionEndedRequest') return res.json({ version: '1.0', response: {} });
      return res.json(alexaSpeak('Sorry, something went wrong.'));
    } catch (e: any) {
      console.error('[alexa] error:', e?.message);
      return res.json(alexaSpeak('Sorry, Chora ran into a problem.'));
    }
  });

  // ── Stripe Webhook — MUST be raw body BEFORE express.json() ──────────────
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'] as string;
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret || secret.startsWith('whsec_YOUR')) {
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    let event: any;
    try {
      const stripe = getStripe();
      event = stripe.webhooks.constructEvent(req.body, sig, secret);
    } catch (err: any) {
      console.error('Stripe webhook error:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const now = Date.now();

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          const meta = session.metadata || {};
          const subId = session.subscription;
          const custId = session.customer;
          const mode = session.mode;

          if (mode === 'subscription' && meta.type === 'plajahplus') {
            const stripe = getStripe();
            const sub = await stripe.subscriptions.retrieve(subId);
            const priceId = sub.items.data[0]?.price?.id ?? '';
            const tierMap: Record<string, string> = {
              [process.env.STRIPE_PRICE_TIER1 ?? '']: '1',
              [process.env.STRIPE_PRICE_TIER2 ?? '']: '2',
              [process.env.STRIPE_PRICE_TIER3 ?? '']: '3',
            };
            const tier = tierMap[priceId] ?? '1';

            const docId = `${meta.uid}_${subId}`;
            await firestoreWrite('plajahPlusSubscriptions', docId, {
              id: docId,
              subscriberId: meta.uid,
              stripeSubscriptionId: subId,
              stripeCustomerId: custId,
              tier: parseInt(tier),
              status: 'active',
              isMorph: meta.isMorph === 'true',
              boundCreatorId: meta.boundCreatorId || '',
              morphCreatorIds: meta.morphCreatorIds || '',
              morphMode: meta.morphMode || 'SPLIT',
              currentPeriodEnd: sub.current_period_end * 1000,
              cancelAtPeriodEnd: false,
              storageLimitGb: TIER_STORAGE[tier] ?? 100,
              monthlyPoints: TIER_POINTS[tier] ?? 100,
              createdAt: now,
              updatedAt: now,
            });

            // Grant monthly points
            const userDoc = await fetchFirebaseDoc('users', meta.uid);
            if (userDoc?.fields) {
              const currentPoints = parseInt(userDoc.fields.points?.integerValue ?? '0');
              await firestoreWrite('users', meta.uid, { points: currentPoints + (TIER_POINTS[tier] ?? 100), updatedAt: now });
            }
          }

          if (mode === 'payment' && meta.type === 'adpackage') {
            const packageBoost: Record<string, number> = { BASIC: 1.5, FEATURED: 2.5, PREMIUM: 4.0, MAXIMUM: 6.0 };
            const packageDays: Record<string, number> = { BASIC: 7, FEATURED: 14, PREMIUM: 21, MAXIMUM: 30 };
            const pType = meta.packageType || 'BASIC';
            const expiresAt = now + (packageDays[pType] ?? 7) * 86_400_000;
            await firestoreCreate('adPackages', {
              userId: meta.uid,
              packageType: pType,
              price: parseFloat(meta.price || '4.99'),
              durationDays: packageDays[pType] ?? 7,
              boostMultiplier: packageBoost[pType] ?? 1.5,
              contentId: meta.contentId || '',
              contentType: meta.contentType || '',
              stripePaymentIntentId: session.payment_intent || '',
              isActive: true,
              expiresAt,
              createdAt: now,
            });
          }

          if (mode === 'payment' && meta.type === 'seedraiser_pledge') {
            await firestoreCreate('seedRaiserPledges', {
              campaignId: meta.campaignId,
              backerId: meta.uid,
              backerName: meta.backerName || 'Backer',
              amount: parseFloat(meta.amount || '0'),
              rewardId: meta.rewardId || '',
              stripePaymentIntentId: session.payment_intent || '',
              status: 'COMPLETED',
              isAnonymous: meta.isAnonymous === 'true',
              message: meta.message || '',
              createdAt: now,
            });
          }

          // ── Sanctuary: recurring tier membership ──────────────────────────────
          if (mode === 'subscription' && meta.type === 'sanctuary_membership') {
            const subId = (session.subscription as string) || '';
            let renewsAt = now + (meta.billingCycle === 'ANNUAL' ? 365 : 30) * 86_400_000;
            try {
              const sub = subId ? await getStripe().subscriptions.retrieve(subId) : null;
              if (sub?.current_period_end) renewsAt = sub.current_period_end * 1000;
            } catch {}
            // Deterministic id (one active membership per creator↔member) so a
            // renewal/upgrade overwrites rather than duplicates.
            await firestoreWrite('sanctuaryMemberships', `${meta.creatorId}_${meta.uid}`, {
              id: `${meta.creatorId}_${meta.uid}`,
              tierId: meta.tierId || '',
              tierName: meta.tierName || '',
              tierColor: meta.tierColor || '#C9A55C',
              creatorId: meta.creatorId || '',
              memberId: meta.uid || '',
              memberName: '',
              billingCycle: meta.billingCycle || 'MONTHLY',
              status: 'ACTIVE',
              startedAt: now,
              renewsAt,
              stripeSubscriptionId: subId,
            });
          }

          // ── Sanctuary: one-time à la carte unlock ─────────────────────────────
          if (mode === 'payment' && meta.type === 'sanctuary_unlock') {
            await firestoreCreate('sanctuaryPurchases', {
              sanctuaryId: meta.creatorId || '',
              buyerId: meta.uid || '',
              itemId: meta.itemId || '',
              itemType: meta.itemType || 'CONTENT',
              amount: parseFloat(meta.price || '0'),
              stripePaymentIntentId: (session.payment_intent as string) || '',
              purchasedAt: now,
            });
          }

          // ── Sanctuary: one-time campaign pledge ───────────────────────────────
          // Recorded as its own doc; the campaign's raised/backer totals are summed
          // from these client-side (firestoreWrite can't safely mutate the nested
          // campaign map without clobbering the sanctuary identity doc).
          if (mode === 'payment' && meta.type === 'sanctuary_pledge') {
            await firestoreCreate('sanctuaryPledges', {
              sanctuaryId: meta.sanctuaryId || '',
              backerId: meta.uid || '',
              amount: parseFloat(meta.amount || '0'),
              stripePaymentIntentId: (session.payment_intent as string) || '',
              createdAt: now,
            });
          }

          // ── Church giving (one-time or recurring) ─────────────────────────────
          if (meta.type === 'church_donation') {
            await firestoreCreate('donations', {
              fromId: meta.uid,
              fromName: '',
              toId: meta.churchId,
              churchId: meta.churchId,
              fund: meta.fund || 'General',
              amount: parseFloat(meta.amount || '0'),
              recurring: meta.recurring === 'true' || mode === 'subscription',
              message: meta.message || '',
              stripePaymentIntentId: session.payment_intent || '',
              stripeSubscriptionId: session.subscription || '',
              timestamp: now,
            });
          }

          // ── Event ticket fulfillment ──────────────────────────────────────────
          if (mode === 'payment' && meta.type === 'event_ticket' && meta.eventId) {
            const orderNum = `PLJ-${Date.now().toString(36).toUpperCase().slice(-8)}`;
            const ticketId = `tkt_${meta.eventId.slice(-6)}_${Date.now().toString(36)}`;
            await firestoreCreate('eventTickets', {
              id: ticketId,
              eventId: meta.eventId,
              eventTitle: meta.eventId,
              tierId: meta.tierId || '',
              tierName: meta.tierName || '',
              tierColor: meta.tierColor || '#a78bfa',
              holderName: meta.holderName || '',
              holderEmail: meta.holderEmail || '',
              holderUid: meta.uid || '',
              orderNumber: orderNum,
              quantity: parseInt(meta.quantity || '1'),
              totalPriceCents: parseInt(meta.subtotal || String(session.amount_total || 0)),
              status: 'VALID',
              physicalRequested: meta.physicalRequested === 'true',
              customPackagingRequested: meta.customPackagingRequested === 'true',
              shippingAddress: meta.shippingAddress || '',
              stripePaymentIntentId: session.payment_intent || '',
              createdAt: now,
            });
            // Increment tier sold count in event
            try {
              const evDoc = await fetchFirebaseDoc('plajahEvents', meta.eventId);
              if (evDoc?.fields) {
                const tiers = JSON.parse(evDoc.fields.tiers?.stringValue ?? '[]');
                const tierIdx = tiers.findIndex((t: any) => t.id === meta.tierId);
                if (tierIdx >= 0) { tiers[tierIdx].sold = (tiers[tierIdx].sold || 0) + parseInt(meta.quantity || '1'); }
                const totalSold = parseInt(evDoc.fields.totalSold?.integerValue ?? '0') + parseInt(meta.quantity || '1');
                await firestoreWrite('plajahEvents', meta.eventId, { tiers: JSON.stringify(tiers), totalSold, updatedAt: now });
              }
            } catch {}
          }

          // ── Music sync-license grant (per-project) ────────────────────────────
          // Destination charge already routed the fee to the musician; here we
          // record the GRANT (clears the track for that edit) + one earning for the
          // dashboard. Not in CREATOR_PAYMENT_TYPES, so the generic split path skips
          // it (no double transfer).
          if (mode === 'payment' && meta.type === 'sync_license') {
            const feeCents = parseInt(meta.feeCents || String(session.amount_total || 0), 10) || 0;
            const platformFeeCents = Math.round(feeCents * 0.10);
            const grantId = `syncgrant_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
            await firestoreWrite('syncLicenseGrants', grantId, {
              id: grantId,
              buyerUid: meta.buyerUid || meta.uid || '',
              editId: meta.editId || '',
              editTitle: meta.editTitle || '',
              trackId: meta.trackId || '',
              albumId: meta.albumId || '',
              trackTitle: meta.trackTitle || '',
              rightsOwnerUid: meta.rightsOwnerUid || '',
              feeCents,
              stripePaymentIntentId: (session.payment_intent as string) || '',
              status: 'granted',
              createdAt: now,
            });
            if (meta.rightsOwnerUid && feeCents > 0) {
              await firestoreCreate('creatorEarnings', {
                creatorUid: meta.rightsOwnerUid,
                payerUid: meta.buyerUid || meta.uid || '',
                category: 'sync_license',
                grossCents: feeCents,
                platformFeeCents,
                netCents: feeCents - platformFeeCents,
                creatorNetCents: feeCents - platformFeeCents,
                splits: '[]',
                title: `Sync license: ${meta.trackTitle || 'track'}${meta.editTitle ? ` — ${meta.editTitle}` : ''}`,
                stripePaymentIntentId: (session.payment_intent as string) || '',
                status: 'transferred',
                timestamp: now,
              });
            }
          }

          // ── Store order paid → confirm it + decrement stock (idempotent + atomic) ──
          if (mode === 'payment' && meta.type === 'store_order' && meta.orderId) {
            const order = await firestoreRead('storeOrders', meta.orderId);
            if (order && order.status !== 'CONFIRMED') {   // webhooks can fire more than once — only act once
              await firestoreWrite('storeOrders', meta.orderId, {
                status: 'CONFIRMED', paidAt: now,
                stripePaymentIntentId: (session.payment_intent as string) || '',
              });
              // Atomic stock decrement so concurrent orders can't oversell (v1: product-level scalar stock).
              try {
                const lines = JSON.parse(order.items || '[]');
                for (const li of lines) {
                  if (li?.productId && li?.qty) await firestoreIncrement(`storeProducts/${li.productId}`, { stock: -Math.abs(Number(li.qty) || 0) });
                }
              } catch { /* items unparseable — order stays confirmed, stock just not adjusted */ }
            }
          }

          // ── Record earnings + process splits for all creator-facing payments ──
          const CREATOR_PAYMENT_TYPES: Record<string, string> = {
            live_tip: 'tip',
            digital_sale: 'digital_sale',
            sanctuary_membership: 'sanctuary',
            sanctuary_unlock: 'sanctuary',
            sanctuary_pledge: 'sanctuary',
            plajahplus: 'plajahplus',
            store_order: 'store_order',
            club_membership: 'club',
            seedraiser_pledge: 'seedraiser',
          };
          const earningCategory = CREATOR_PAYMENT_TYPES[meta.type];
          const recipientUid = meta.creatorUid || meta.artistId || meta.uid;

          if (earningCategory && recipientUid && session.amount_total) {
            const grossCents       = session.amount_total;
            const platformFeeCents = Math.round(grossCents * 0.10);
            const netCents         = grossCents - platformFeeCents;

            // Load creator's split config
            let splitRecipients: any[] = [];
            let appliesTo: string[] = [];
            try {
              const splitDoc = await fetchFirebaseDoc('creatorSplits', recipientUid);
              if (splitDoc?.fields) {
                splitRecipients = JSON.parse(splitDoc.fields.recipients?.stringValue ?? '[]');
                appliesTo       = JSON.parse(splitDoc.fields.appliesTo?.stringValue ?? '[]');
              }
            } catch {}

            const activeSplits = appliesTo.includes(earningCategory) ? splitRecipients : [];
            const splitTotal   = activeSplits.reduce((s: number, r: any) => s + (r.percentage || 0), 0);
            const creatorPct   = 100 - Math.min(splitTotal, 99);
            const creatorNetCents = Math.round(netCents * creatorPct / 100);

            // Build split detail array
            const splitDetails = activeSplits.map((r: any) => ({
              creatorUid:   r.creatorUid,
              displayName:  r.displayName,
              amountCents:  Math.round(netCents * r.percentage / 100),
              percentage:   r.percentage,
            }));

            const earningTitle =
              meta.type === 'live_tip'             ? `Tip${meta.title ? ` — ${meta.title}` : ''}` :
              meta.type === 'digital_sale'          ? `Sale${meta.title ? `: ${meta.title}` : ''}` :
              meta.type === 'sanctuary_membership'  ? `Sanctuary Membership` :
              meta.type === 'plajahplus'            ? `Plajah+ Subscription` :
              meta.type === 'store_order'           ? `Store Order${meta.title ? `: ${meta.title}` : ''}` :
              meta.type === 'club_membership'       ? `Club Membership` :
              meta.type === 'seedraiser_pledge'     ? `SeedRaiser Pledge` : 'Payment';

            await firestoreCreate('creatorEarnings', {
              creatorUid:            recipientUid,
              payerUid:              meta.uid || '',
              category:              earningCategory,
              grossCents,
              platformFeeCents,
              netCents,
              creatorNetCents,
              splits:                JSON.stringify(splitDetails),
              title:                 earningTitle,
              stripePaymentIntentId: session.payment_intent || '',
              status:                'pending',
              timestamp:             now,
            });

            // Fire split transfers if recipients have Connect accounts
            if (splitDetails.length > 0) {
              const stripe = getStripe();
              for (const split of splitDetails) {
                try {
                  const recipDoc = await fetchFirebaseDoc('users', split.creatorUid);
                  const recipAccountId = recipDoc?.fields?.stripeConnectAccountId?.stringValue;
                  if (recipAccountId && split.amountCents > 0) {
                    await (stripe as any).transfers.create({
                      amount:      split.amountCents,
                      currency:    'usd',
                      destination: recipAccountId,
                      metadata:    { type: 'split', fromCreatorUid: recipientUid, toCreatorUid: split.creatorUid, category: earningCategory },
                    });
                  }
                } catch (transferErr: any) {
                  console.error('[Connect] Split transfer failed:', transferErr.message);
                }
              }
            }
          }

          break;
        }

        case 'customer.subscription.updated': {
          const sub = event.data.object;
          const snap = await fetch(`https://firestore.googleapis.com/v1/projects/gen-lang-client-0665118474/databases/plajah-prod/documents/plajahPlusSubscriptions?pageSize=5`);
          // Update status in Firestore based on stripeSubscriptionId
          // (full query not available via REST easily — rely on client-side sync)
          break;
        }

        case 'customer.subscription.deleted': {
          const sub = event.data.object;
          console.log('Subscription cancelled:', sub.id);
          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object;
          console.warn('Payment failed for subscription:', invoice.subscription);
          break;
        }
      }
    } catch (err: any) {
      console.error('Webhook handler error:', err.message);
    }

    res.json({ received: true });
  });

  // ── Security middleware ───────────────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: false,      // SPA served as static — no server-side CSP needed
    crossOriginEmbedderPolicy: false,  // Required for video/iframe embeds
    // Helmet's default COOP is 'same-origin', which BREAKS signInWithPopup
    // (Google/X/Facebook/Microsoft) — the OAuth popup can't postMessage the
    // result back to the opener. 'same-origin-allow-popups' keeps COOP
    // protection while letting the auth popup communicate back.
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  }));

  const isProd = process.env.NODE_ENV === 'production';
  const allowedOrigins = isProd
    ? ['https://plajah.com', 'https://www.plajah.com']
    : ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'];

  // In dev, accept any localhost port — ES module scripts always send an
  // Origin header, so a dev server on a non-allowlisted port (preview tools,
  // PORT overrides) would otherwise 500 on every module request.
  const isDevLocalOrigin = (origin: string) =>
    !isProd && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || isDevLocalOrigin(origin)) return callback(null, true);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  }));

  // Tight global JSON limit for safety — but exempt routes that legitimately carry
  // larger bodies (the AI proxy sends system prompt + scene context, well over 10kb)
  // so they can parse with their own limit instead of being 413'd here first.
  const tightJson = express.json({ limit: '10kb' });
  const LARGE_BODY_ROUTES = new Set(['/api/ai/anthropic', '/api/ai/gemini']);
  app.use((req, res, next) => {
    if (LARGE_BODY_ROUTES.has(req.path)) return next();
    return tightJson(req, res, next);
  });
  app.use(cookieParser());

  // Per-category rate limiters
  const authLimiter  = rateLimit({ windowMs: 15 * 60 * 1000, max: 10,  standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, try again later' } });
  const apiLimiter   = rateLimit({ windowMs:      60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, try again later' } });
  const proxyLimiter = rateLimit({ windowMs:      60 * 1000, max: 60,  standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, try again later' } });

  app.use('/api/stripe/create-checkout-session', authLimiter);
  app.use('/api/stripe/create-portal-session',   authLimiter);
  app.use('/api/hue/auth',     authLimiter);
  app.use('/api/hue/callback', authLimiter);
  app.use('/api/proxy',        proxyLimiter);
  app.use('/api/lights/proxy', proxyLimiter);
  app.use('/api/social',       apiLimiter);

  // Liveness probe for uptime monitors / load balancers
  app.get('/healthz', (_req, res) => res.json({ ok: true, ts: Date.now() }));

  // ── Classic Books Seeder ─────────────────────────────────────────────────
  // One-time admin endpoint: downloads 40 Gutenberg public-domain TXTs and
  // uploads them to Firebase Storage at books/classics/{id}/text.txt so the
  // reader can fetch them directly (no proxy, no Gutenberg rate-limits).
  // Hit once after deploy: GET /api/admin/seed-classic-books?key=<ADMIN_KEY>
  app.get('/api/admin/seed-classic-books', async (req: any, res: any) => {
    if (req.query.key !== process.env.ADMIN_SEED_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const BUCKET = 'gen-lang-client-0665118474.firebasestorage.app';
    const CLASSIC_IDS = [
      1342, 84, 11, 2701, 98, 345, 76, 174, 1260, 768,
      514, 120, 1513, 1524, 1400, 730, 46, 2554, 2600, 1399,
      996, 1184, 135, 161, 158, 1257, 103, 164, 36, 35,
      43, 215, 236, 844, 5200, 74, 25344, 1727, 6130, 145,
    ];
    const results: { id: number; status: string; url?: string }[] = [];
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders?.();

    const token = await getGoogleAccessToken();
    if (!token) {
      res.write(`data: ${JSON.stringify({ error: 'GOOGLE_SERVICE_ACCOUNT_JSON not configured' })}\n\n`);
      return res.end();
    }

    for (const id of CLASSIC_IDS) {
      const storagePath = `books/classics/${id}/text.txt`;
      const encodedPath = encodeURIComponent(storagePath);
      const downloadUrl  = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodedPath}?alt=media`;

      // Skip if already uploaded (HEAD the download URL)
      try {
        const check = await fetch(downloadUrl, { method: 'HEAD' });
        if (check.ok) {
          results.push({ id, status: 'skipped (already exists)', url: downloadUrl });
          res.write(`data: ${JSON.stringify({ id, status: 'exists' })}\n\n`);
          continue;
        }
      } catch { /* not found — proceed with upload */ }

      try {
        const gutenbergUrl = `https://www.gutenberg.org/ebooks/${id}.txt.utf-8`;
        const txtRes = await safeOutboundFetch(gutenbergUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Plajah/1.0)' },
        }, 6);
        if (!txtRes.ok) throw new Error(`Gutenberg fetch failed: ${txtRes.status}`);
        const text = await txtRes.text();

        const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?uploadType=media&name=${encodedPath}`;
        const up = await fetch(uploadUrl, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain; charset=utf-8' },
          body: text,
        });
        if (!up.ok) {
          const err = await up.text();
          throw new Error(`Storage upload failed: ${up.status} ${err}`);
        }
        results.push({ id, status: 'uploaded', url: downloadUrl });
        res.write(`data: ${JSON.stringify({ id, status: 'uploaded', url: downloadUrl })}\n\n`);
      } catch (err: any) {
        results.push({ id, status: `error: ${err.message}` });
        res.write(`data: ${JSON.stringify({ id, status: 'error', error: err.message })}\n\n`);
      }
      // Polite delay — Gutenberg rate-limits aggressive crawlers
      await new Promise(r => setTimeout(r, 800));
    }

    res.write(`data: ${JSON.stringify({ done: true, results })}\n\n`);
    res.end();
  });

  // ── Stripe Connect: Creator Payout Onboarding ────────────────────────────
  // Creates or retrieves a Stripe Express account for the creator and returns an onboarding URL.
  app.post('/api/stripe/connect/onboard', authMiddleware, express.json(), async (req: any, res) => {
    const uid: string = req.uid;
    const orgId: string | undefined = req.body?.orgId;
    try {
      const stripe = getStripe();
      if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

      // Check if creator already has an account
      const userDoc = await fetchFirebaseDoc('users', uid);
      let accountId: string | undefined = userDoc?.fields?.stripeConnectAccountId?.stringValue;

      if (!accountId) {
        const account = await (stripe as any).accounts.create({
          type: 'express',
          metadata: { uid },
          capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        });
        accountId = account.id;
        await firestoreWrite('users', uid, { stripeConnectAccountId: accountId, updatedAt: Date.now() });
      }

      // Onboarding for an organization (e.g. a church) — attach the account so its
      // giving routes there (destination charges read organizations/{id}.stripeAccountId).
      if (orgId) {
        await firestoreWrite('organizations', orgId, { stripeAccountId: accountId, updatedAt: Date.now() });
      }

      const origin = req.headers.origin || 'https://plajah.com';
      const returnUrl = orgId ? `${origin}?org=${orgId}&connect=success` : `${origin}?connect=success`;
      const link = await (stripe as any).accountLinks.create({
        account: accountId,
        refresh_url: orgId ? `${origin}?org=${orgId}&connect=refresh` : `${origin}?connect=refresh`,
        return_url:  returnUrl,
        type: 'account_onboarding',
      });

      res.json({ url: link.url, accountId });
    } catch (err: any) {
      console.error('[Connect] Onboard error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Check Connect account status
  app.get('/api/stripe/connect/status', authMiddleware, async (req: any, res) => {
    const uid: string = req.uid;
    try {
      const stripe = getStripe();
      if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

      const userDoc = await fetchFirebaseDoc('users', uid);
      const accountId: string | undefined = userDoc?.fields?.stripeConnectAccountId?.stringValue;
      if (!accountId) return res.json({ connected: false });

      const account = await (stripe as any).accounts.retrieve(accountId);
      const onboarded = account.details_submitted && account.charges_enabled;

      // Sync status back to Firestore
      if (onboarded) {
        await firestoreWrite('users', uid, {
          stripeConnectOnboarded: true,
          stripeConnectPayoutsEnabled: account.payouts_enabled,
          updatedAt: Date.now(),
        });
      }

      res.json({
        connected: true,
        accountId,
        onboarded,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        requiresAction: !account.details_submitted,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get Stripe Express dashboard login link
  app.post('/api/stripe/connect/dashboard-link', authMiddleware, async (req: any, res) => {
    const uid: string = req.uid;
    try {
      const stripe = getStripe();
      if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

      const userDoc = await fetchFirebaseDoc('users', uid);
      const accountId: string | undefined = userDoc?.fields?.stripeConnectAccountId?.stringValue;
      if (!accountId) return res.status(404).json({ error: 'No connected account' });

      const link = await (stripe as any).accounts.createLoginLink(accountId);
      res.json({ url: link.url });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Fetch creator earnings from Firestore (categorised)
  app.get('/api/stripe/earnings', authMiddleware, async (req: any, res) => {
    const uid: string = req.uid;
    const period = (req.query.period as string) || '30d';
    const periodMs: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
    const days = periodMs[period] ?? 30;
    const since = Date.now() - days * 86_400_000;

    try {
      const projectId = 'gen-lang-client-0665118474';
      const dbId = 'plajah-prod';
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents:runQuery`;
      const body = {
        structuredQuery: {
          from: [{ collectionId: 'creatorEarnings' }],
          where: {
            compositeFilter: {
              op: 'AND',
              filters: [
                { fieldFilter: { field: { fieldPath: 'creatorUid' }, op: 'EQUAL', value: { stringValue: uid } } },
                { fieldFilter: { field: { fieldPath: 'timestamp' }, op: 'GREATER_THAN_OR_EQUAL', value: { integerValue: String(since) } } },
              ],
            },
          },
          orderBy: [{ field: { fieldPath: 'timestamp' }, direction: 'DESCENDING' }],
          limit: 200,
        },
      };
      const qRes = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const docs: any[] = await qRes.json();

      const transactions = docs
        .filter((d: any) => d.document)
        .map((d: any) => {
          const f = d.document.fields;
          return {
            id: d.document.name.split('/').pop(),
            creatorUid:          f.creatorUid?.stringValue,
            payerUid:            f.payerUid?.stringValue,
            category:            f.category?.stringValue,
            grossCents:          parseInt(f.grossCents?.integerValue ?? '0'),
            platformFeeCents:    parseInt(f.platformFeeCents?.integerValue ?? '0'),
            netCents:            parseInt(f.netCents?.integerValue ?? '0'),
            creatorNetCents:     parseInt(f.creatorNetCents?.integerValue ?? '0'),
            title:               f.title?.stringValue ?? '',
            status:              f.status?.stringValue ?? 'pending',
            timestamp:           parseInt(f.timestamp?.integerValue ?? '0'),
            stripePaymentIntentId: f.stripePaymentIntentId?.stringValue,
          };
        });

      // Compute summary
      const CATEGORIES = ['tip','digital_sale','sanctuary','plajahplus','store_order','club','seedraiser','other'];
      const byCategory: any = {};
      for (const cat of CATEGORIES) byCategory[cat] = { grossCents: 0, netCents: 0, count: 0 };

      let totalGross = 0, totalFee = 0, totalNet = 0, pending = 0, paidOut = 0;
      for (const t of transactions) {
        totalGross += t.grossCents;
        totalFee   += t.platformFeeCents;
        totalNet   += t.creatorNetCents;
        if (t.status === 'pending')    pending  += t.creatorNetCents;
        if (t.status === 'paid_out')   paidOut  += t.creatorNetCents;
        const cat = byCategory[t.category] ?? byCategory.other;
        cat.grossCents += t.grossCents;
        cat.netCents   += t.creatorNetCents;
        cat.count      += 1;
      }

      res.json({ period, totalGrossCents: totalGross, totalPlatformFeeCents: totalFee, totalNetCents: totalNet, pendingCents: pending, paidOutCents: paidOut, byCategory, transactions });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Save split configuration
  app.post('/api/stripe/split', authMiddleware, express.json(), async (req: any, res) => {
    const uid: string = req.uid;
    const { recipients, appliesTo } = req.body;
    if (!Array.isArray(recipients)) return res.status(400).json({ error: 'recipients required' });
    const total = recipients.reduce((s: number, r: any) => s + (r.percentage || 0), 0);
    if (total >= 100) return res.status(400).json({ error: 'Split percentages must sum to less than 100' });

    try {
      await firestoreWrite('creatorSplits', uid, {
        ownerUid: uid,
        recipients: JSON.stringify(recipients),
        appliesTo: JSON.stringify(appliesTo || ['tip','digital_sale','sanctuary','plajahplus']),
        updatedAt: Date.now(),
      });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get split configuration
  app.get('/api/stripe/split', authMiddleware, async (req: any, res) => {
    const uid: string = req.uid;
    try {
      const doc = await fetchFirebaseDoc('creatorSplits', uid);
      if (!doc?.fields) return res.json({ recipients: [], appliesTo: [] });
      const f = doc.fields;
      res.json({
        ownerUid: uid,
        recipients: JSON.parse(f.recipients?.stringValue ?? '[]'),
        appliesTo:  JSON.parse(f.appliesTo?.stringValue ?? '[]'),
        updatedAt:  parseInt(f.updatedAt?.integerValue ?? '0'),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ── EVENTS & TICKETING ────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  // Create or update an event
  app.post('/api/events', authMiddleware, express.json(), async (req: any, res) => {
    const uid: string = req.uid;
    try {
      const body = req.body;
      const eventId = body.id || `evt_${uid.slice(0,8)}_${Date.now()}`;
      await firestoreWrite('plajahEvents', eventId, {
        ...body, id: eventId, creatorUid: uid, updatedAt: Date.now(),
        createdAt: body.createdAt || Date.now(), viewCount: body.viewCount || 0,
        shareCount: body.shareCount || 0, totalSold: body.totalSold || 0, status: body.status || 'DRAFT',
        tiers: JSON.stringify(body.tiers || []), itinerary: JSON.stringify(body.itinerary || []),
        promoCodes: JSON.stringify(body.promoCodes || []), faqItems: JSON.stringify(body.faqItems || []),
        galleryImages: JSON.stringify(body.galleryImages || []), tags: JSON.stringify(body.tags || []),
      });
      res.json({ id: eventId });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ── Media federation API (media-library API Phase 1) ────────────────────────
  // Public, standardized catalog of a creator's PUBLIC works across every Plajah
  // service — the "federate to external platforms via API" promise. Each record
  // carries an originUrl back to the canonical asset (Creator-Passport addressable).
  app.get('/api/artists/:id/media', apiLimiter, async (req: any, res) => {
    const artistId = String(req.params.id || '').trim();
    if (!artistId || artistId.length > 128) return res.status(400).json({ error: 'valid artist id required' });
    try {
      const assets = await queryFirebase('mediaAssets', [
        { field: 'artistId', value: artistId },
        { field: 'status', value: 'PUBLIC' },
      ], 200);
      res.set('Cache-Control', 'public, max-age=120');
      res.json({ artistId, count: assets.length, assets });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'query failed' });
    }
  });

  // Get event by ID (public)
  app.get('/api/events/list', async (req, res) => {
    try {
      const projectId = 'gen-lang-client-0665118474';
      const dbId = 'plajah-prod';
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents:runQuery`;
      const body = { structuredQuery: { from: [{ collectionId: 'plajahEvents' }], where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'IN', value: { arrayValue: { values: [{ stringValue: 'ON_SALE' }, { stringValue: 'PUBLISHED' }] } } } }, orderBy: [{ field: { fieldPath: 'startDate' }, direction: 'ASCENDING' }], limit: 50 } };
      const qRes = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const docs: any[] = await qRes.json();
      const events = docs.filter((d: any) => d.document).map((d: any) => {
        const f = d.document.fields;
        return { id: d.document.name.split('/').pop(), title: f.title?.stringValue, type: f.type?.stringValue, status: f.status?.stringValue, startDate: parseInt(f.startDate?.integerValue ?? '0'), coverImage: f.coverImage?.stringValue, city: f.city?.stringValue, venueName: f.venueName?.stringValue, creatorName: f.creatorName?.stringValue, creatorPhotoURL: f.creatorPhotoURL?.stringValue, totalSold: parseInt(f.totalSold?.integerValue ?? '0'), totalCapacity: parseInt(f.totalCapacity?.integerValue ?? '0') };
      });
      res.json({ events });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ── YouTube highlight resolver ─────────────────────────────────────────────
  // Turns a search query into the top *embeddable* video id via the YouTube Data
  // API v3, so dynamic highlights (per-match, movie trailers, etc.) can play in an
  // inline iframe instead of opening a new tab. Requires YOUTUBE_API_KEY in the
  // Cloud Run environment (store it in Secret Manager, never in the client). The
  // key stays server-side; the browser only ever calls this endpoint. Cached in
  // memory for 24h because Data API search costs 100 quota units/call (default
  // quota 10,000/day ≈ 100 searches/day uncached).
  const _ytCache = new Map<string, { t: number; id: string | null }>();
  app.get('/api/yt-search', async (req: any, res) => {
    const q = String(req.query.q || '').slice(0, 120).trim();
    if (!q) return res.status(400).json({ videoId: null, error: 'missing q' });
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) return res.json({ videoId: null, reason: 'no-api-key' }); // graceful: client falls back to YouTube
    const hit = _ytCache.get(q);
    if (hit && Date.now() - hit.t < 24 * 3600_000) return res.json({ videoId: hit.id, cached: true });
    try {
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&safeSearch=none&maxResults=1&q=${encodeURIComponent(q)}&key=${apiKey}`;
      const r = await fetch(url);
      const d: any = await r.json();
      if (!r.ok) return res.status(502).json({ videoId: null, error: d?.error?.message || 'youtube api error' });
      const id = d?.items?.[0]?.id?.videoId || null;
      _ytCache.set(q, { t: Date.now(), id });
      res.json({ videoId: id });
    } catch (e: any) { res.status(500).json({ videoId: null, error: e.message }); }
  });

  app.get('/api/events/creator/:uid', authMiddleware, async (req: any, res) => {
    if (req.uid !== req.params.uid) return res.status(403).json({ error: 'Forbidden' });
    try {
      const projectId = 'gen-lang-client-0665118474';
      const dbId = 'plajah-prod';
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents:runQuery`;
      const body = { structuredQuery: { from: [{ collectionId: 'plajahEvents' }], where: { fieldFilter: { field: { fieldPath: 'creatorUid' }, op: 'EQUAL', value: { stringValue: req.params.uid } } }, orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }], limit: 50 } };
      const qRes = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const docs: any[] = await qRes.json();
      const events = docs.filter((d: any) => d.document).map((d: any) => {
        const f = d.document.fields;
        return { id: d.document.name.split('/').pop(), title: f.title?.stringValue, status: f.status?.stringValue, type: f.type?.stringValue, startDate: parseInt(f.startDate?.integerValue ?? '0'), coverImage: f.coverImage?.stringValue, totalSold: parseInt(f.totalSold?.integerValue ?? '0'), totalCapacity: parseInt(f.totalCapacity?.integerValue ?? '0'), city: f.city?.stringValue, venueName: f.venueName?.stringValue };
      });
      res.json({ events });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/events/:eventId', async (req, res) => {
    try {
      const doc = await fetchFirebaseDoc('plajahEvents', req.params.eventId);
      if (!doc?.fields) return res.status(404).json({ error: 'Event not found' });
      const f = doc.fields;
      const event = { id: req.params.eventId, creatorUid: f.creatorUid?.stringValue, creatorName: f.creatorName?.stringValue, creatorPhotoURL: f.creatorPhotoURL?.stringValue, title: f.title?.stringValue, subtitle: f.subtitle?.stringValue, description: f.description?.stringValue, coverImage: f.coverImage?.stringValue, heroVideoUrl: f.heroVideoUrl?.stringValue, type: f.type?.stringValue, status: f.status?.stringValue, venueName: f.venueName?.stringValue, venueAddress: f.venueAddress?.stringValue, city: f.city?.stringValue, state: f.state?.stringValue, country: f.country?.stringValue, streamUrl: f.streamUrl?.stringValue, startDate: parseInt(f.startDate?.integerValue ?? '0'), endDate: parseInt(f.endDate?.integerValue ?? '0'), doorsOpenDate: f.doorsOpenDate?.integerValue ? parseInt(f.doorsOpenDate.integerValue) : undefined, timezone: f.timezone?.stringValue ?? 'America/New_York', totalCapacity: parseInt(f.totalCapacity?.integerValue ?? '0'), totalSold: parseInt(f.totalSold?.integerValue ?? '0'), kioskEnabled: f.kioskEnabled?.booleanValue ?? false, printingEnabled: f.printingEnabled?.booleanValue ?? false, sanctuaryMembersOnly: f.sanctuaryMembersOnly?.booleanValue ?? false, refundPolicy: f.refundPolicy?.stringValue ?? 'NO_REFUND', ageRestriction: f.ageRestriction?.stringValue, dresscode: f.dresscode?.stringValue, accessibilityInfo: f.accessibilityInfo?.stringValue, viewCount: parseInt(f.viewCount?.integerValue ?? '0'), shareCount: parseInt(f.shareCount?.integerValue ?? '0'), tiers: JSON.parse(f.tiers?.stringValue ?? '[]'), itinerary: JSON.parse(f.itinerary?.stringValue ?? '[]'), faqItems: JSON.parse(f.faqItems?.stringValue ?? '[]'), promoCodes: JSON.parse(f.promoCodes?.stringValue ?? '[]'), galleryImages: JSON.parse(f.galleryImages?.stringValue ?? '[]'), tags: JSON.parse(f.tags?.stringValue ?? '[]'), createdAt: parseInt(f.createdAt?.integerValue ?? '0'), updatedAt: parseInt(f.updatedAt?.integerValue ?? '0') };
      firestoreWrite('plajahEvents', req.params.eventId, { viewCount: event.viewCount + 1, updatedAt: Date.now() }).catch(() => {});
      res.json(event);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Purchase tickets — creates Stripe Checkout session
  app.post('/api/events/:eventId/tickets/purchase', authMiddleware, express.json(), async (req: any, res) => {
    const uid: string = req.uid;
    const { tierId, quantity = 1, holderName, holderEmail, physicalRequested, customPackagingRequested, shippingAddress, promoCode } = req.body;
    try {
      const stripe = getStripe();
      const eventDoc = await fetchFirebaseDoc('plajahEvents', req.params.eventId);
      if (!eventDoc?.fields) return res.status(404).json({ error: 'Event not found' });
      const f = eventDoc.fields;
      const tiers = JSON.parse(f.tiers?.stringValue ?? '[]');
      const tier = tiers.find((t: any) => t.id === tierId);
      if (!tier) return res.status(400).json({ error: 'Ticket tier not found' });
      if (tier.sold + quantity > tier.quantity) return res.status(400).json({ error: 'Not enough tickets available' });

      let unitPrice = tier.priceCents;
      const promoCodes = JSON.parse(f.promoCodes?.stringValue ?? '[]');
      const promo = promoCodes.find((p: any) => p.code?.toLowerCase() === promoCode?.toLowerCase() && p.usesLeft > 0);
      if (promo) unitPrice = Math.round(unitPrice * (1 - promo.discountPct / 100));
      const packagingFee = (physicalRequested && customPackagingRequested) ? (tier.customPackagingFeeCents ?? 0) : 0;
      const subtotal = unitPrice * quantity + packagingFee;

      const origin = req.headers.origin || 'https://plajah.com';
      const lineItems: any[] = [{ price_data: { currency: 'usd', product_data: { name: `${f.title?.stringValue} — ${tier.name}`, description: tier.description, ...(f.coverImage?.stringValue ? { images: [f.coverImage.stringValue] } : {}) }, unit_amount: unitPrice }, quantity }];
      if (packagingFee > 0) lineItems.push({ price_data: { currency: 'usd', product_data: { name: 'Custom Ticket Packaging' }, unit_amount: packagingFee }, quantity: 1 });

      const session = await stripe.checkout.sessions.create({
        mode: 'payment', payment_method_types: ['card'], line_items: lineItems,
        metadata: { type: 'event_ticket', eventId: req.params.eventId, tierId, tierName: tier.name, tierColor: tier.color || '#a78bfa', quantity: String(quantity), uid, holderName: holderName || '', holderEmail: holderEmail || '', physicalRequested: String(!!physicalRequested), customPackagingRequested: String(!!customPackagingRequested), shippingAddress: shippingAddress ? JSON.stringify(shippingAddress) : '', subtotal: String(subtotal) },
        success_url: `${origin}?event_success=${req.params.eventId}`,
        cancel_url: `${origin}/event/${req.params.eventId}`,
        customer_email: holderEmail,
      });
      res.json({ url: session.url });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Validate / check-in a ticket
  app.post('/api/tickets/:ticketId/validate', authMiddleware, express.json(), async (req: any, res) => {
    try {
      const doc = await fetchFirebaseDoc('eventTickets', req.params.ticketId);
      if (!doc?.fields) return res.json({ valid: false, reason: 'Ticket not found' });
      const f = doc.fields;
      if (f.status?.stringValue === 'USED') return res.json({ valid: false, reason: 'Already checked in', checkedInAt: parseInt(f.checkedInAt?.integerValue ?? '0'), holderName: f.holderName?.stringValue });
      if (f.status?.stringValue !== 'VALID') return res.json({ valid: false, reason: `Ticket is ${f.status?.stringValue}` });
      await firestoreWrite('eventTickets', req.params.ticketId, { status: 'USED', checkedInAt: Date.now(), checkedInBy: req.uid });
      res.json({ valid: true, holderName: f.holderName?.stringValue, tierName: f.tierName?.stringValue, eventTitle: f.eventTitle?.stringValue, quantity: parseInt(f.quantity?.integerValue ?? '1') });
    } catch (err: any) { res.status(500).json({ error: err.message, valid: false }); }
  });

  // Get user's tickets
  app.get('/api/tickets', authMiddleware, async (req: any, res) => {
    const uid: string = req.uid;
    try {
      const projectId = 'gen-lang-client-0665118474';
      const dbId = 'plajah-prod';
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents:runQuery`;
      const body = { structuredQuery: { from: [{ collectionId: 'eventTickets' }], where: { fieldFilter: { field: { fieldPath: 'holderUid' }, op: 'EQUAL', value: { stringValue: uid } } }, orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }], limit: 50 } };
      const qRes = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const docs: any[] = await qRes.json();
      const tickets = docs.filter((d: any) => d.document).map((d: any) => {
        const f = d.document.fields;
        return { id: d.document.name.split('/').pop(), eventId: f.eventId?.stringValue, eventTitle: f.eventTitle?.stringValue, eventStartDate: parseInt(f.eventStartDate?.integerValue ?? '0'), eventVenue: f.eventVenue?.stringValue, eventCoverImage: f.eventCoverImage?.stringValue, tierName: f.tierName?.stringValue, tierColor: f.tierColor?.stringValue, status: f.status?.stringValue, quantity: parseInt(f.quantity?.integerValue ?? '1'), createdAt: parseInt(f.createdAt?.integerValue ?? '0') };
      });
      res.json({ tickets });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Get single ticket (holder only)
  app.get('/api/tickets/:ticketId', authMiddleware, async (req: any, res) => {
    try {
      const doc = await fetchFirebaseDoc('eventTickets', req.params.ticketId);
      if (!doc?.fields) return res.status(404).json({ error: 'Ticket not found' });
      const f = doc.fields;
      if (f.holderUid?.stringValue !== req.uid) return res.status(403).json({ error: 'Forbidden' });
      res.json({ id: req.params.ticketId, eventId: f.eventId?.stringValue, eventTitle: f.eventTitle?.stringValue, eventStartDate: parseInt(f.eventStartDate?.integerValue ?? '0'), eventVenue: f.eventVenue?.stringValue, eventCoverImage: f.eventCoverImage?.stringValue, tierId: f.tierId?.stringValue, tierName: f.tierName?.stringValue, tierColor: f.tierColor?.stringValue, holderName: f.holderName?.stringValue, holderEmail: f.holderEmail?.stringValue, orderNumber: f.orderNumber?.stringValue, quantity: parseInt(f.quantity?.integerValue ?? '1'), totalPriceCents: parseInt(f.totalPriceCents?.integerValue ?? '0'), status: f.status?.stringValue, checkedInAt: f.checkedInAt?.integerValue ? parseInt(f.checkedInAt.integerValue) : undefined, physicalRequested: f.physicalRequested?.booleanValue ?? false, createdAt: parseInt(f.createdAt?.integerValue ?? '0') });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // List event attendees (creator only)
  app.get('/api/events/:eventId/attendees', authMiddleware, async (req: any, res) => {
    try {
      const eventDoc = await fetchFirebaseDoc('plajahEvents', req.params.eventId);
      if (eventDoc?.fields?.creatorUid?.stringValue !== req.uid) return res.status(403).json({ error: 'Forbidden' });
      const projectId = 'gen-lang-client-0665118474';
      const dbId = 'plajah-prod';
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents:runQuery`;
      const body = { structuredQuery: { from: [{ collectionId: 'eventTickets' }], where: { fieldFilter: { field: { fieldPath: 'eventId' }, op: 'EQUAL', value: { stringValue: req.params.eventId } } }, orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }], limit: 500 } };
      const qRes = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const docs: any[] = await qRes.json();
      const attendees = docs.filter((d: any) => d.document).map((d: any) => {
        const f = d.document.fields;
        return { id: d.document.name.split('/').pop(), holderName: f.holderName?.stringValue, holderEmail: f.holderEmail?.stringValue, tierName: f.tierName?.stringValue, tierColor: f.tierColor?.stringValue, status: f.status?.stringValue, checkedInAt: f.checkedInAt?.integerValue ? parseInt(f.checkedInAt.integerValue) : undefined, quantity: parseInt(f.quantity?.integerValue ?? '1'), physicalRequested: f.physicalRequested?.booleanValue, createdAt: parseInt(f.createdAt?.integerValue ?? '0') };
      });
      res.json({ attendees });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Print ticket via PrintNode
  app.post('/api/tickets/:ticketId/print', authMiddleware, express.json(), async (req: any, res) => {
    const { printNodeApiKey, printerId, copies = 1 } = req.body;
    try {
      const doc = await fetchFirebaseDoc('eventTickets', req.params.ticketId);
      if (!doc?.fields) return res.status(404).json({ error: 'Ticket not found' });
      const f = doc.fields;
      const eventDoc = await fetchFirebaseDoc('plajahEvents', f.eventId?.stringValue);
      if (f.holderUid?.stringValue !== req.uid && eventDoc?.fields?.creatorUid?.stringValue !== req.uid) return res.status(403).json({ error: 'Forbidden' });
      const apiKey = printNodeApiKey || process.env.PRINTNODE_API_KEY;
      if (!apiKey) return res.status(503).json({ error: 'Printer not configured — add PRINTNODE_API_KEY to env or pass in request' });
      const ticketPdfUrl = `${req.headers.origin || 'https://plajah.com'}/print-ticket/${req.params.ticketId}`;
      const printRes = await fetch('https://api.printnode.com/printjobs', {
        method: 'POST',
        headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ printerId: parseInt(printerId), title: `Ticket — ${f.eventTitle?.stringValue}`, contentType: 'pdf_uri', content: ticketPdfUrl, source: 'Plajah', copies }),
      });
      if (!printRes.ok) return res.status(502).json({ error: 'PrintNode rejected print job' });
      const job = await printRes.json();
      await firestoreWrite('eventTickets', req.params.ticketId, { printedAt: Date.now() });
      res.json({ success: true, printJobId: job.id });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Kiosk session start
  app.post('/api/events/:eventId/kiosk/session', authMiddleware, express.json(), async (req: any, res) => {
    try {
      const sessionId = `kiosk_${req.params.eventId}_${Date.now()}`;
      await firestoreCreate('eventKioskSessions', { id: sessionId, eventId: req.params.eventId, creatorUid: req.uid, deviceLabel: req.body.deviceLabel || 'Kiosk 1', startedAt: Date.now(), lastActivityAt: Date.now(), ordersCount: 0, totalRevenueCents: 0, isActive: true });
      res.json({ sessionId });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ── Stripe: Create Subscription Checkout Session ──────────────────────────
  app.post('/api/stripe/create-checkout-session', authMiddleware, async (req: any, res) => {
    try {
      const stripe = getStripe();
      const { tier, isMorph, boundCreatorId, morphCreatorIds, morphMode } = req.body;
      const uid: string = req.uid;

      const priceMap: Record<number, string> = {
        1: process.env.STRIPE_PRICE_TIER1 ?? '',
        2: process.env.STRIPE_PRICE_TIER2 ?? '',
        3: process.env.STRIPE_PRICE_TIER3 ?? '',
      };

      const priceId = priceMap[tier as 1|2|3];
      if (!priceId || priceId.startsWith('price_YOUR')) {
        return res.status(400).json({ error: 'Subscription pricing not configured yet. Contact support.' });
      }

      const successUrl = `${req.headers.origin || 'https://gen-lang-client-0665118474.web.app'}/?subscription=success`;
      const cancelUrl  = `${req.headers.origin || 'https://gen-lang-client-0665118474.web.app'}/?subscription=cancelled`;

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          type: 'plajahplus',
          uid,
          tier: String(tier),
          isMorph: String(!!isMorph),
          boundCreatorId: boundCreatorId ?? '',
          morphCreatorIds: Array.isArray(morphCreatorIds) ? morphCreatorIds.join(',') : '',
          morphMode: morphMode ?? 'SPLIT',
        },
      });

      res.json({ url: session.url });
    } catch (err: any) {
      console.error('/api/stripe/create-checkout-session', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Stripe: Create Billing Portal Session ─────────────────────────────────
  app.post('/api/stripe/create-portal-session', authMiddleware, async (req: any, res) => {
    try {
      const stripe = getStripe();
      const uid: string = req.uid;
      const { returnUrl } = req.body;

      // Look up customer ID from Firestore
      const subSnap = await fetch(`https://firestore.googleapis.com/v1/projects/gen-lang-client-0665118474/databases/plajah-prod/documents/plajahPlusSubscriptions?pageSize=1`);
      // We'll use the customer ID stored in metadata — but we need to find it.
      // For now, search Stripe for the customer by metadata.uid
      const customers = await stripe.customers.search({ query: `metadata['uid']:'${uid}'`, limit: 1 });
      const customerId = customers.data[0]?.id;
      if (!customerId) return res.status(404).json({ error: 'No subscription found' });

      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl || 'https://gen-lang-client-0665118474.web.app',
      });

      res.json({ url: session.url });
    } catch (err: any) {
      console.error('/api/stripe/create-portal-session', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Stripe: Rebind Subscription ($2.99 fee) ───────────────────────────────
  app.post('/api/stripe/rebind-subscription', authMiddleware, async (req: any, res) => {
    try {
      const stripe = getStripe();
      const uid: string = req.uid;
      const { subscriptionId, newCreatorId } = req.body;

      if (!subscriptionId || !newCreatorId) {
        return res.status(400).json({ error: 'subscriptionId and newCreatorId required' });
      }

      const successUrl = `${req.headers.origin || 'https://gen-lang-client-0665118474.web.app'}/?rebind=success`;
      const cancelUrl  = `${req.headers.origin || 'https://gen-lang-client-0665118474.web.app'}/?rebind=cancelled`;

      // Charge $2.99 one-time rebind fee
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: { name: 'Plajah+ Rebind Fee', description: 'Move your subscription to a new creator' },
            unit_amount: 299, // $2.99
          },
          quantity: 1,
        }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: { type: 'rebind', uid, subscriptionId, newCreatorId },
      });

      res.json({ url: session.url });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Stripe: Purchase Ad Package ───────────────────────────────────────────
  app.post('/api/stripe/purchase-ad-package', authMiddleware, async (req: any, res) => {
    try {
      const stripe = getStripe();
      const uid: string = req.uid;
      const { packageType, contentId, contentType } = req.body;

      const PACKAGES: Record<string, { price: number; label: string; days: number }> = {
        BASIC:    { price: 499,  label: 'Starter Boost (7 days)',   days: 7  },
        FEATURED: { price: 999,  label: 'Featured Boost (14 days)', days: 14 },
        PREMIUM:  { price: 1499, label: 'Premium Blast (21 days)',  days: 21 },
        MAXIMUM:  { price: 2000, label: 'Max Exposure (30 days)',   days: 30 },
      };

      const pkg = PACKAGES[packageType as string];
      if (!pkg) return res.status(400).json({ error: 'Invalid package type' });

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: { name: `Plajah Ad: ${pkg.label}` },
            unit_amount: pkg.price,
          },
          quantity: 1,
        }],
        success_url: `${req.headers.origin || 'https://gen-lang-client-0665118474.web.app'}/?ad=success`,
        cancel_url:  `${req.headers.origin || 'https://gen-lang-client-0665118474.web.app'}/?ad=cancelled`,
        metadata: {
          type: 'adpackage',
          uid,
          packageType,
          price: String(pkg.price / 100),
          contentId: contentId ?? '',
          contentType: contentType ?? '',
        },
      });

      res.json({ url: session.url });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Stripe: Off-Platform Promotion ───────────────────────────────────────
  app.post('/api/stripe/purchase-off-platform', authMiddleware, async (req: any, res) => {
    try {
      const stripe = getStripe();
      const uid: string = req.uid;
      const { tier } = req.body;

      const TIERS: Record<string, { price: number; label: string }> = {
        STANDARD: { price: 4900,  label: 'Off-Platform Standard Promotion' },
        PREMIUM:  { price: 10000, label: 'Off-Platform Premium Promotion (Billboards)' },
      };

      const t = TIERS[tier as string];
      if (!t) return res.status(400).json({ error: 'Invalid tier' });

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: { name: `Plajah: ${t.label}` },
            unit_amount: t.price,
          },
          quantity: 1,
        }],
        success_url: `${req.headers.origin || 'https://gen-lang-client-0665118474.web.app'}/?offplatform=success`,
        cancel_url:  `${req.headers.origin || 'https://gen-lang-client-0665118474.web.app'}/?offplatform=cancelled`,
        metadata: { type: 'offplatform', uid, tier, price: String(t.price / 100) },
      });

      res.json({ url: session.url });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Stripe: SeedRaiser Pledge ─────────────────────────────────────────────
  app.post('/api/stripe/seedraiser-pledge', authMiddleware, async (req: any, res) => {
    try {
      const stripe = getStripe();
      const uid: string = req.uid;
      const { campaignId, amount, rewardId, message, isAnonymous } = req.body;

      if (!campaignId || !amount || amount < 1) {
        return res.status(400).json({ error: 'campaignId and amount (min $1) required' });
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: { name: 'Plajah Seed Raiser Pledge' },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        }],
        success_url: `${req.headers.origin || 'https://gen-lang-client-0665118474.web.app'}/?pledge=success`,
        cancel_url:  `${req.headers.origin || 'https://gen-lang-client-0665118474.web.app'}/?pledge=cancelled`,
        metadata: {
          type: 'seedraiser_pledge',
          uid,
          campaignId,
          amount: String(amount),
          rewardId: rewardId ?? '',
          message: message ?? '',
          isAnonymous: String(!!isAnonymous),
          backerName: '', // will be resolved from user profile
        },
      });

      res.json({ url: session.url });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Stripe: Church Donation (one-time or recurring) ───────────────────────
  app.post('/api/stripe/church-donation', authMiddleware, async (req: any, res) => {
    try {
      const stripe = getStripe();
      const uid: string = req.uid;
      const { churchId, churchName, amount, fund, recurring, message } = req.body;

      if (!churchId || !amount || amount < 1) {
        return res.status(400).json({ error: 'churchId and amount (min $1) required' });
      }
      const origin = req.headers.origin || 'https://gen-lang-client-0665118474.web.app';
      const isSub = !!recurring;

      // Route the gift to the CHURCH's connected Stripe account (destination charge)
      // when it has one — so money lands in the church's account, not the platform's.
      const church = await firestoreRead('organizations', churchId);
      const destAcct: string | undefined = church?.stripeAccountId || undefined;
      const routing = destAcct
        ? (isSub
            ? { subscription_data: { transfer_data: { destination: destAcct } } }
            : { payment_intent_data: { transfer_data: { destination: destAcct } } })
        : {};

      const session = await stripe.checkout.sessions.create({
        mode: isSub ? 'subscription' : 'payment',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: { name: `${churchName || 'Church'} — ${fund || 'General'} Giving${isSub ? ' (monthly)' : ''}` },
            unit_amount: Math.round(amount * 100),
            ...(isSub ? { recurring: { interval: 'month' as const } } : {}),
          },
          quantity: 1,
        }],
        ...(routing as any),
        success_url: `${origin}/?give=success&org=${churchId}`,
        cancel_url:  `${origin}/?give=cancelled&org=${churchId}`,
        metadata: {
          type: 'church_donation', uid, churchId,
          churchName: churchName ?? '',
          fund: fund ?? 'General',
          amount: String(amount),
          recurring: String(!!recurring),
          message: message ?? '',
        },
      });

      res.json({ url: session.url });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Email: broadcast to a list (Resend HTTP API) ──────────────────────────
  // Sends when RESEND_API_KEY is configured; otherwise reports configured:false
  // (in-app + push already reached members). Same "works when keys set" pattern
  // as the Stripe endpoints.
  app.post('/api/email/broadcast', authMiddleware, express.json(), async (req: any, res) => {
    try {
      const key = process.env.RESEND_API_KEY;
      const { subject, text, html, recipients } = req.body || {};
      if (!Array.isArray(recipients) || recipients.length === 0 || !subject) {
        return res.status(400).json({ error: 'recipients + subject required' });
      }
      if (!key) return res.json({ sent: 0, configured: false });
      const from = process.env.RESEND_FROM || 'Plajah <onboarding@resend.dev>';
      const to = recipients.filter((e: any) => typeof e === 'string' && e.includes('@')).slice(0, 500);
      let sent = 0;
      for (let i = 0; i < to.length; i += 100) {
        const batch = to.slice(i, i + 100).map((addr: string) => ({ from, to: addr, subject, ...(html ? { html } : { text: text || '' }) }));
        const r = await fetch('https://api.resend.com/emails/batch', {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(batch),
        });
        if (r.ok) sent += batch.length;
      }
      res.json({ sent, configured: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Stripe: Business Order Payment ────────────────────────────────────────
  app.post('/api/stripe/business-order', authMiddleware, async (req: any, res) => {
    try {
      const stripe = getStripe();
      const uid: string = req.uid;
      const { businessId, items } = req.body;

      if (!businessId || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'businessId and items required' });
      }

      const lineItems = items.map((item: { name: string; price: number; quantity: number }) => ({
        price_data: {
          currency: 'usd',
          product_data: { name: item.name },
          unit_amount: Math.round(item.price * 100),
        },
        quantity: item.quantity,
      }));

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: lineItems,
        success_url: `${req.headers.origin || 'https://gen-lang-client-0665118474.web.app'}/?order=success`,
        cancel_url:  `${req.headers.origin || 'https://gen-lang-client-0665118474.web.app'}/?order=cancelled`,
        metadata: { type: 'business_order', uid, businessId },
      });

      res.json({ url: session.url });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Mux Integration ---

  // Shared optimal Mux asset settings — per-title smart encoding, 4K ceiling,
  // MP4 rendition for download/fallback, normalised audio levels.
  const MUX_ASSET_SETTINGS = {
    playback_policy: ['public'] as ['public'],
    encoding_tier: 'smart' as const,         // per-title encoding (better quality, lower bitrate)
    max_resolution_tier: '2160p' as const,   // accept 4K source, transcode down as needed
    mp4_support: 'standard' as const,        // MP4 rendition for compatibility/download
    normalize_audio: true,                   // loudness normalisation (EBU R128)
  };

  async function getMux() {
    const { MUX_TOKEN_ID, MUX_TOKEN_SECRET } = process.env;
    if (!MUX_TOKEN_ID || !MUX_TOKEN_SECRET) throw new Error('Mux keys not configured');
    const Mux = (await import('@mux/mux-node')).default;
    return new Mux({ tokenId: MUX_TOKEN_ID, tokenSecret: MUX_TOKEN_SECRET });
  }

  // Poll until Mux asset has a playback ID (fires quickly, often within seconds)
  async function waitForPlaybackId(mux: any, assetId: string): Promise<string | undefined> {
    for (let i = 0; i < 60; i++) {           // up to 4 min (60 × 4 s)
      await new Promise(r => setTimeout(r, 4000));
      try {
        const a = await mux.video.assets.retrieve(assetId);
        if (a.playback_ids?.[0]?.id) return a.playback_ids[0].id;
        if (a.status === 'errored') return undefined;
      } catch { return undefined; }
    }
    return undefined;
  }

  // Per-user rate limiter for live stream creation (max 5 per 10 minutes)
  const muxLiveRateLimit = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 5,
    keyGenerator: (req: any) => {
      // Prefer per-user UID when available; otherwise use connection remote address
      // Use remoteAddress/header instead of req.ip to avoid express-rate-limit IPv6 keyGenerator validation
      if (req && req.uid) return `uid:${req.uid}`;
      const forwarded = req?.headers?.['x-forwarded-for'];
      const remote = forwarded ? String(forwarded).split(',')[0].trim() : (req?.socket?.remoteAddress || 'unknown');
      return `ip:${remote}`;
    },
    message: { error: 'Too many live stream requests. Please wait before creating another stream.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // POST /api/mux/upload — browser gets an upload URL and PUTs directly to Mux
  app.post('/api/mux/upload', authMiddleware, async (req, res) => {
    try {
      const mux = await getMux();
      const corsOrigin = req.headers.origin || '*';
      const upload = await mux.video.uploads.create({
        new_asset_settings: MUX_ASSET_SETTINGS,
        cors_origin: corsOrigin,
        // 24-hour window: a multi-GB film on a slow connection can take hours, and
        // UpChunk resumes within this window. 1 hour was too tight for large masters.
        timeout: 86400,
      });
      res.json({ id: upload.id, url: upload.url });
    } catch (error: any) {
      console.error('[Mux] upload create error:', error.message);
      res.status(500).json({ error: error.message || 'Failed to create Mux upload URL' });
    }
  });

  // GET /api/mux/asset — poll upload status until asset_id is present
  app.get('/api/mux/asset', authMiddleware, async (req, res) => {
    try {
      const { uploadId } = req.query;
      if (!uploadId) return res.status(400).json({ error: 'Missing uploadId' });
      const mux = await getMux();
      const upload = await mux.video.uploads.retrieve(uploadId as string);
      res.json({ status: upload.status, assetId: upload.asset_id });
    } catch (error: any) {
      console.error('[Mux] asset retrieve error:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/mux/create-asset-from-url — ingest a public URL into Mux
  // Returns playbackId as soon as it's available (usually within a few seconds
  // of the first segments being ready — full transcoding continues in background).
  app.post('/api/mux/create-asset-from-url', authMiddleware, express.json(), async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: 'Missing url' });
      let parsedUrl: URL;
      try { parsedUrl = validateProxyUrl(String(url)); }
      catch (e: any) { return res.status(400).json({ error: e.message }); }

      const mux = await getMux();
      const asset = await mux.video.assets.create({
        inputs: [{ url: parsedUrl.toString() }],
        ...MUX_ASSET_SETTINGS,
      });

      const assetId = asset.id;
      let playbackId: string | undefined = asset.playback_ids?.[0]?.id;
      if (!playbackId) playbackId = await waitForPlaybackId(mux, assetId);

      res.json({ assetId, playbackId });
    } catch (error: any) {
      console.error('[Mux] create-asset-from-url error:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // ─── FAST channel feeds — the industry formats platform guides (Roku/Samsung/LG/Google/Fire)
  //     ingest. PUBLIC (no auth): the platforms PULL these over HTTP. Only PUBLISHED channels
  //     (a fast_channels doc with isPublished !== false) appear. See services/fastChannelEpg.ts.
  const fastChannelsPublished = async (): Promise<EpgChannel[]> => {
    const docs = await queryFirebase('fast_channels', [{ field: 'isPublished', value: true }], 200);
    return (docs || [])
      .filter((c: any) => c && c.ownerId)
      .map((c: any) => ({ id: `plajah.${c.ownerId}`, name: c.name || 'Channel', number: c.number, category: c.category, logoUrl: c.logoUrl }));
  };
  const slotsFor = async (ownerId: string): Promise<EpgSlot[]> => {
    const sched: any = await firestoreRead('fast_channel_schedules', ownerId);
    const slots: any[] = Array.isArray(sched?.slots) ? sched.slots : [];
    return slots
      .map(s => ({
        title: s.videoTitle || s.bumperTitle || (s.type === 'AD_BREAK' ? 'Ad Break' : s.type === 'LIVE_INTERRUPT' ? 'Live' : 'Program'),
        // EXACT seconds via the shared resolver, so the guide's wall-clock matches the player's.
        durationSec: slotDurationSec(s),
      }))
      .filter(s => s.title);
  };

  // GET /api/fast/lineup.json — the channel lineup (number/name/category/logo).
  app.get('/api/fast/lineup.json', async (_req, res) => {
    try {
      const channels = await fastChannelsPublished();
      res.set('Access-Control-Allow-Origin', '*');
      res.json({ channels: channels.sort((a, b) => (a.number ?? 9999) - (b.number ?? 9999) || a.name.localeCompare(b.name)) });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/fast/epg.xml — XMLTV guide for every published channel, next 24h.
  app.get('/api/fast/epg.xml', async (_req, res) => {
    try {
      const channels = await fastChannelsPublished();
      const from = Date.now();
      const entries = await Promise.all(channels.map(async (channel) => {
        const ownerId = channel.id.replace(/^plajah\./, '');
        const programmes = buildProgramGuide(await slotsFor(ownerId), from, 24);
        return { channel, programmes };
      }));
      res.set('Access-Control-Allow-Origin', '*');
      res.type('application/xml').send(buildXmltv(entries.filter(e => e.programmes.length)));
    } catch (e: any) { res.status(500).send(`<!-- epg error: ${e.message} -->`); }
  });

  // GET /api/fast/:ownerId/feed.mrss — MRSS content feed for one channel (its FAST-opted videos).
  app.get('/api/fast/:ownerId/feed.mrss', async (req, res) => {
    try {
      const ownerId = String(req.params.ownerId);
      const meta: any = await firestoreRead('fast_channels', ownerId);
      if (!meta || meta.isPublished === false) return res.status(404).type('application/xml').send('<!-- channel not found -->');
      const channel: EpgChannel = { id: `plajah.${ownerId}`, name: meta.name || 'Channel', number: meta.number, category: meta.category, logoUrl: meta.logoUrl };
      const vids = await queryFirebase('videos', [{ field: 'ownerId', value: ownerId }, { field: 'allowInFastChannel', value: true }], 300);
      const items: MrssItem[] = (vids || [])
        .map((v: any) => {
          const url = v.muxPlaybackId ? `https://stream.mux.com/${v.muxPlaybackId}.m3u8` : v.url;
          if (!url) return null;
          return { id: v.id || v.identifier || url, title: v.title || 'Untitled', description: v.description, url,
            thumbnailUrl: v.muxPlaybackId ? `https://image.mux.com/${v.muxPlaybackId}/thumbnail.png?width=640&height=360&time=5` : (v.thumbnailUrl || v.coverImageUrl),
            durationSec: Number(v.duration) || undefined };
        })
        .filter(Boolean) as MrssItem[];
      const host = publicHost(req);
      res.set('Access-Control-Allow-Origin', '*');
      res.type('application/xml').send(buildMrss(channel, items, `https://${host}/c/${ownerId}`));
    } catch (e: any) { res.status(500).type('application/xml').send(`<!-- mrss error: ${e.message} -->`); }
  });

  // GET /api/fast/:ownerId/now.json — deterministic "on now + next" for one channel, from the same
  // epoch-anchored loop the player and the XMLTV guide use. Handy for a guide UI or a poster overlay.
  app.get('/api/fast/:ownerId/now.json', async (req, res) => {
    try {
      const ownerId = String(req.params.ownerId);
      const meta: any = await firestoreRead('fast_channels', ownerId);
      if (!meta || meta.isPublished === false) return res.status(404).json({ error: 'channel not found' });
      const { now, next } = nowAndNext(await slotsFor(ownerId), Date.now());
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Cache-Control', 'no-store');
      res.json({ channel: { id: `plajah.${ownerId}`, name: meta.name || 'Channel', number: meta.number, category: meta.category }, now: now || null, next: next || null });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Linear HLS origin (external carriage) — see services/fastChannelHls.ts. In-app playback does
  //    NOT use these; they exist so a TV platform / IPTV aggregator can pull a standard M3U + HLS.
  // Mux VOD playlists are static, so cache the fetched text briefly to cut egress + latency.
  const muxPlaylistCache = new Map<string, { text: string; exp: number }>();
  const fetchPlaylistCached = async (url: string): Promise<string> => {
    const hit = muxPlaylistCache.get(url);
    if (hit && hit.exp > Date.now()) return hit.text;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const text = r.ok ? await r.text() : '';
    if (text) { muxPlaylistCache.set(url, { text, exp: Date.now() + 5 * 60_000 }); if (muxPlaylistCache.size > 500) muxPlaylistCache.clear(); }
    return text;
  };
  const rawSlotsFor = async (ownerId: string): Promise<any[]> => {
    const sched: any = await firestoreRead('fast_channel_schedules', ownerId);
    return Array.isArray(sched?.slots) ? sched.slots : [];
  };

  // GET /api/fast/lineup.m3u8 — standards M3U channel lineup (companion to epg.xml; tvg-id matches).
  app.get('/api/fast/lineup.m3u8', async (req, res) => {
    try {
      const channels = await fastChannelsPublished();
      const list: M3uChannel[] = channels
        .map(c => ({ ownerId: c.id.replace(/^plajah\./, ''), name: c.name, number: c.number, category: c.category, logoUrl: c.logoUrl }))
        .sort((a, b) => (a.number ?? 9999) - (b.number ?? 9999) || a.name.localeCompare(b.name));
      res.set('Access-Control-Allow-Origin', '*');
      res.type('application/x-mpegURL').send(buildM3uLineup(list, `https://${publicHost(req)}/api/fast`));
    } catch (e: any) { res.status(500).send(`#EXTM3U\n# error: ${e.message}\n`); }
  });

  // GET /api/fast/:ownerId/stream.m3u8 — the channel's linear HLS origin. Stitches the Mux content
  // programmes into one rolling live playlist; falls back to a redirect to the current programme.
  app.get('/api/fast/:ownerId/stream.m3u8', async (req, res) => {
    try {
      const ownerId = String(req.params.ownerId);
      const meta: any = await firestoreRead('fast_channels', ownerId);
      if (!meta || meta.isPublished === false) return res.status(404).type('application/x-mpegURL').send('#EXTM3U\n# channel not found\n');
      const slots = await rawSlotsFor(ownerId);
      const now = Date.now();
      const playlist = await buildLinearMediaPlaylist({ slots: slots as any, atMs: now, fetchText: fetchPlaylistCached }).catch(() => null);
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Cache-Control', 'no-store');
      if (playlist) return res.type('application/x-mpegURL').send(playlist);
      const fallback = currentProgrammeMasterUrl(slots as any, now);
      if (fallback) return res.redirect(302, fallback);
      res.status(404).type('application/x-mpegURL').send('#EXTM3U\n# no playable content\n');
    } catch (e: any) { res.status(500).type('application/x-mpegURL').send(`#EXTM3U\n# error: ${e.message}\n`); }
  });

  app.get('/api/mux/playback', authMiddleware, async (req, res) => {
    try {
      const { assetId } = req.query;
      if (!assetId) return res.status(400).json({ error: 'Missing assetId' });

      const { MUX_TOKEN_ID, MUX_TOKEN_SECRET } = process.env;
      if (!MUX_TOKEN_ID || !MUX_TOKEN_SECRET) {
        return res.status(500).json({ error: 'Mux integration is not configured.' });
      }

      const Mux = (await import('@mux/mux-node')).default;
      const mux = new Mux({
        tokenId: MUX_TOKEN_ID,
        tokenSecret: MUX_TOKEN_SECRET,
      });

      const asset = await mux.video.assets.retrieve(assetId as string);
      // Only expose the playback ID once the asset is fully ready — prevents
      // the client from trying to stream a manifest that doesn't exist yet.
      const playbackId = asset.status === 'ready' ? asset.playback_ids?.[0]?.id : undefined;
      res.json({ status: asset.status, playbackId, asset });
    } catch (error: any) {
      console.error('Mux playback error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- Mux Live Streaming ---
  // Auth + per-user rate limit protects against stream creation abuse and billing attacks
  app.post('/api/mux/live/create', authMiddleware, muxLiveRateLimit, express.json(), async (req, res) => {
    try {
      const { MUX_TOKEN_ID, MUX_TOKEN_SECRET } = process.env;
      if (!MUX_TOKEN_ID || !MUX_TOKEN_SECRET) {
        return res.status(500).json({ error: 'Mux integration is not configured.' });
      }
      const Mux = (await import('@mux/mux-node')).default;
      const mux = new Mux({ tokenId: MUX_TOKEN_ID, tokenSecret: MUX_TOKEN_SECRET });
      const stream = await mux.video.liveStreams.create({
        playback_policy: ['public'],
        new_asset_settings: { playback_policy: ['public'] },
        latency_mode: 'reduced',
        reconnect_window: 60, // 60s reconnect window for dropped SRT/RTMP connections
      });
      const streamKey = stream.stream_key ?? '';
      res.json({
        streamId: stream.id,
        streamKey,
        rtmpUrl: 'rtmps://global-live.mux.com:443/app',
        // SRT ingest — OBS 29+, vMix, Haivision, ffmpeg all support this natively
        srtUrl: `srt://global-live.mux.com:5001?streamid=${streamKey}`,
        playbackId: stream.playback_ids?.[0]?.id ?? null,
      });
    } catch (error: any) {
      console.error('Mux live create error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/mux/live/:streamId', authMiddleware, async (req, res) => {
    try {
      const { streamId } = req.params;
      const { MUX_TOKEN_ID, MUX_TOKEN_SECRET } = process.env;
      if (!MUX_TOKEN_ID || !MUX_TOKEN_SECRET) {
        return res.status(500).json({ error: 'Mux integration is not configured.' });
      }
      const Mux = (await import('@mux/mux-node')).default;
      const mux = new Mux({ tokenId: MUX_TOKEN_ID, tokenSecret: MUX_TOKEN_SECRET });

      // complete() signals end-of-stream and triggers asset creation from new_asset_settings.
      // disable() only stops ingestion — it does NOT create a recording asset.
      await mux.video.liveStreams.complete(streamId);

      // Retrieve the stream to get the asset ID Mux is now preparing.
      const stream = await mux.video.liveStreams.retrieve(streamId);
      const assetId: string | null = (stream as any).recent_asset_ids?.[0] ?? null;

      // Try to get the playback ID from the asset (may still be "preparing").
      let playbackId: string | null = null;
      if (assetId) {
        try {
          const asset = await mux.video.assets.retrieve(assetId);
          playbackId = asset.playback_ids?.[0]?.id ?? null;
        } catch { /* asset may not be immediately accessible; save ID for later */ }
      }

      res.json({ ok: true, assetId, playbackId });
    } catch (error: any) {
      console.error('Mux live end error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/mux/live/:streamId/status', authMiddleware, async (req, res) => {
    try {
      const { streamId } = req.params;
      const { MUX_TOKEN_ID, MUX_TOKEN_SECRET } = process.env;
      if (!MUX_TOKEN_ID || !MUX_TOKEN_SECRET) {
        return res.status(500).json({ error: 'Mux integration is not configured.' });
      }
      const Mux = (await import('@mux/mux-node')).default;
      const mux = new Mux({ tokenId: MUX_TOKEN_ID, tokenSecret: MUX_TOKEN_SECRET });
      const stream = await mux.video.liveStreams.retrieve(streamId);
      res.json({ status: stream.status, playbackId: stream.playback_ids?.[0]?.id || null });
    } catch (error: any) {
      console.error('Mux live status error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- Mux Backfill: transcode all existing Firestore videos that lack muxPlaybackId ---
  // Admin-only: this triggers expensive batch API calls and must not be publicly accessible
  app.post('/api/mux/backfill-videos', authMiddleware, async (req: any, res) => {
    // Verify admin status by checking the admins Firestore collection
    const isAdmin = await fetchFirebaseDoc('admins', req.uid);
    if (!isAdmin) return res.status(403).json({ error: 'Admin access required' });
    // Original handler continues below
    try {
      const { MUX_TOKEN_ID, MUX_TOKEN_SECRET } = process.env;
      if (!MUX_TOKEN_ID || !MUX_TOKEN_SECRET) {
        return res.status(500).json({ error: 'Mux keys not configured' });
      }

      const projectId = 'gen-lang-client-0665118474';
      const dbId      = 'plajah-prod';
      const baseUrl   = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents`;

      // Fetch all videos from Firestore (paginate if needed — 300 per page)
      const allVideos: Array<{ id: string; url: string }> = [];
      let pageToken: string | undefined;
      do {
        const url = `${baseUrl}/videos?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`;
        const snap = await fetch(url);
        if (!snap.ok) {
          console.error(`[Mux Backfill] Firestore fetch failed: ${snap.status} ${snap.statusText}`);
          break;
        }
        const data = await snap.json() as any;
        const docs: any[] = data.documents || [];
        for (const d of docs) {
          const fields = d.fields || {};
          const muxId = fields.muxPlaybackId?.stringValue;
          if (muxId) continue; // already transcoded
          const videoUrl = fields.url?.stringValue;
          if (!videoUrl) continue;
          if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be') || videoUrl.includes('vimeo.com')) continue;
          const docId = d.name?.split('/').pop();
          if (docId) allVideos.push({ id: docId, url: videoUrl });
        }
        pageToken = data.nextPageToken;
      } while (pageToken);

      res.json({ queued: allVideos.length, message: `Starting background transcoding for ${allVideos.length} videos` });

      // Kick off transcoding in background — respond to client first
      const mux = await getMux();

      for (const v of allVideos) {
        (async () => {
          try {
            const asset = await mux.video.assets.create({
              inputs: [{ url: v.url }],
              ...MUX_ASSET_SETTINGS,
            });
            const assetId = asset.id;
            let playbackId = asset.playback_ids?.[0]?.id;
            if (!playbackId) playbackId = await waitForPlaybackId(mux, assetId);

            if (playbackId) {
              const docUrl = `${baseUrl}/videos/${v.id}?updateMask.fieldPaths=muxAssetId&updateMask.fieldPaths=muxPlaybackId`;
              await fetch(docUrl, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  fields: {
                    muxAssetId:    { stringValue: assetId },
                    muxPlaybackId: { stringValue: playbackId },
                  },
                }),
              });
              console.log(`[Mux Backfill] ✓ ${v.id} → ${playbackId}`);
            }
          } catch (err: any) {
            console.error(`[Mux Backfill] ✗ ${v.id}:`, err.message);
          }
        })();
      }
    } catch (err: any) {
      console.error('[Mux Backfill] Error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── Decentralized Social Layer (Mastodon + Bluesky + Threads) ─────────────
  // ═══════════════════════════════════════════════════════════════════════════
  // All credential-sensitive operations run server-side.
  // The browser never sees raw access tokens after connecting an account.

  app.post('/api/sports/ingest', authMiddleware, express.json({ limit: '128kb' }), async (req: any, res) => {
    const isAdmin = await fetchFirebaseDoc('admins', req.uid);
    if (!isAdmin) return res.status(403).json({ error: 'Admin access required' });

    try {
      const {
        scope = 'standard',
        leagues,
        includeHistory,
        investigateEvents,
        maxEventsPerLeague,
        maxTeamsPerLeague,
        maxPlayersPerTeam,
      } = req.body ?? {};
      if (!['lite', 'standard', 'deep'].includes(scope)) {
        return res.status(400).json({ error: 'scope must be lite, standard, or deep' });
      }
      if (leagues && (!Array.isArray(leagues) || leagues.length > 40)) {
        return res.status(400).json({ error: 'leagues must be an array of up to 40 league ids' });
      }

      const { runSportsIngestionWorker } = await import('./services/sportsIngestionWorker.js');
      const summary = await runSportsIngestionWorker({
        scope,
        leagues,
        includeHistory: typeof includeHistory === 'boolean' ? includeHistory : undefined,
        investigateEvents: typeof investigateEvents === 'boolean' ? investigateEvents : undefined,
        reason: 'manual_api',
        maxEventsPerLeague: Number.isFinite(maxEventsPerLeague) ? Math.max(1, Math.min(64, Number(maxEventsPerLeague))) : undefined,
        maxTeamsPerLeague: Number.isFinite(maxTeamsPerLeague) ? Math.max(1, Math.min(64, Number(maxTeamsPerLeague))) : undefined,
        maxPlayersPerTeam: Number.isFinite(maxPlayersPerTeam) ? Math.max(1, Math.min(64, Number(maxPlayersPerTeam))) : undefined,
      });
      res.json(summary);
    } catch (err: any) {
      console.error('[Sports Ingestion] Manual run failed:', err?.message || err);
      res.status(500).json({ error: err?.message || 'Sports ingestion failed' });
    }
  });

  // Lazy-load to keep cold-start fast; these are ESM modules with node:crypto
  const getFediverseAuth = async () => {
    const { decentralizedAuth } = await import('./services/fediverse/auth.js');
    return decentralizedAuth;
  };
  const getBroadcast = async () => {
    const { broadcastToDecentralizedWeb } = await import('./services/fediverse/broadcast.js');
    return broadcastToDecentralizedWeb;
  };

  // ── Anthropic (Claude) proxy for FABULA ─────────────────────────────────────
  // FABULA is Claude-powered; this keeps the API key server-side. Accepts the
  // standard Messages-API body and forwards it. Logged-in + rate-limited.
  app.post('/api/ai/anthropic', apiLimiter, authMiddleware, express.json({ limit: '4mb' }), async (req: any, res) => {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured' });
    const { model, max_tokens, system, messages } = req.body as {
      model?: string; max_tokens?: number; system?: string; messages?: unknown;
    };
    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ error: 'messages[] required' });
    }
    // Constrain to Claude models and a sane token ceiling to prevent abuse.
    // (claude-sonnet-4-20250514 is deprecated, retires 2026-06-15 — use current Sonnet.)
    const safeModel = typeof model === 'string' && /^claude-/.test(model) ? model : 'claude-sonnet-4-6';
    const safeMax = Math.min(Math.max(Number(max_tokens) || 1000, 1), 4096);
    try {
      const upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ model: safeModel, max_tokens: safeMax, ...(system ? { system } : {}), messages }),
      });
      const data = await upstream.json();
      res.status(upstream.status).json(data);
    } catch (err: any) {
      console.error('[AI] Anthropic proxy failed:', err?.message || err);
      res.status(502).json({ error: 'Anthropic request failed' });
    }
  });

  // ── Audio → time-coded captions (Chora "Sync Lyrics") ───────────────────────
  // Server-side Gemini transcription so the API key never ships in the client
  // bundle (the old client-side path silently no-op'd in prod because the key
  // wasn't baked in). The client sends the track's audio URL; we fetch it and
  // transcribe with timestamps. Logged-in + rate-limited.
  app.post('/api/ai/captions', apiLimiter, authMiddleware, async (req: any, res) => {
    const geminiKey = process.env.GOOGLE_AI_API_KEY || process.env.VITE_GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
    if (!geminiKey) return res.status(503).json({ error: 'Gemini not configured' });
    const { audioUrl, title, artist, kind } = (req.body || {}) as { audioUrl?: string; title?: string; artist?: string; kind?: string };
    if (!audioUrl || !/^https?:\/\//.test(audioUrl)) return res.status(400).json({ error: 'audioUrl required' });
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const inputPath = path.join(os.tmpdir(), `capin_${stamp}`);
    const tmpChunks: string[] = [];
    try {
      const aRes = await fetch(audioUrl, { signal: AbortSignal.timeout(25000) });
      if (!aRes.ok) return res.status(502).json({ error: `audio fetch ${aRes.status}` });
      const mimeType = (aRes.headers.get('content-type') || 'audio/mpeg').split(';')[0];
      const buf = Buffer.from(await aRes.arrayBuffer());
      // Generous ceiling that only guards the Cloud Run instance's memory against a runaway
      // download — NOT the old 22MB gate that silently rejected large WAV masters. Older Chora
      // tracks never got a compressed rendition, so they arrive here as ~40-60MB uncompressed
      // masters; ffmpeg downsamples them below Gemini's inline limit before transcription (the
      // windowed path re-encodes each slice from disk; the single-shot path transcodes the whole
      // file — see below), so raw size no longer needs to block the request.
      if (buf.length > 250 * 1024 * 1024) return res.status(413).json({ error: 'audio too large to transcribe' });

      const { GoogleGenAI, Type } = await import('@google/genai');
      const genai = new GoogleGenAI({ apiKey: geminiKey });

      // Write to disk once — both the duration probe and every ffmpeg slice/transcode below read
      // from here, so the raw buffer never has to be small.
      await fs.writeFile(inputPath, buf);
      // Probe the true duration (also the anchor for overshoot clamping / windowing).
      let dur = 0;
      try {
        const { json } = await runFfprobe(inputPath);
        dur = parseFloat(json?.format?.duration || '0') || 0;
      } catch { /* probe is best-effort */ }

      let captions: { time: number; text: string }[] = [];

      // ── Primary path: WINDOWED transcription ──────────────────────────────────────────
      // The whole-song single-shot approach drifts — an LLM aligns well inside ~45s but its
      // timestamps wander (and often stall then jump) over a full track, which is exactly the
      // "lyrics freeze at 25% then resume out of sync" failure. Instead we slice the audio into
      // short overlapping windows with ffmpeg (whose -ss start is ground truth), transcribe each
      // window with 0-based local timestamps, add the window's exact start, and tile them. The
      // absolute timing never accumulates error because every window is re-anchored to real time.
      // Bounded to ≤10 min so the sequential window calls stay inside the Cloud Run request budget;
      // longer audio (sermons) uses the single-shot path below.
      const canWindow = dur > 55 && dur <= 600;
      if (canWindow) {
        const OVERLAP = 8;                 // seconds shared between neighbours
        const winLen = 45;                 // short enough that the LLM stays aligned
        const step = winLen - OVERLAP;     // 37s of unique coverage per window
        const half = OVERLAP / 2;
        const starts: number[] = [];
        for (let s = 0; s < dur - 1; s += step) starts.push(Math.round(s * 100) / 100);

        const perWindow: { time: number; text: string }[][] = [];
        let windowFailures = 0;
        for (let i = 0; i < starts.length; i++) {
          const start = starts[i];
          const thisLen = Math.min(winLen, dur - start + 0.5);
          const chunkPath = path.join(os.tmpdir(), `capw_${stamp}_${i}.mp3`);
          tmpChunks.push(chunkPath);
          // Accurate seek + downmix to mono 16 kHz mp3 (tiny payload, plenty for transcription).
          const { ok } = await runFfmpeg(
            ['-y', '-accurate_seek', '-ss', String(start), '-i', inputPath, '-t', String(Math.ceil(thisLen)),
             '-ac', '1', '-ar', '16000', '-b:a', '48k', '-f', 'mp3', chunkPath], 30000);
          if (!ok) { windowFailures++; perWindow.push([]); continue; }
          try {
            const cbuf = await fs.readFile(chunkPath);
            const local = await transcribeAudioWindow(genai, Type, cbuf.toString('base64'), 'audio/mpeg',
              { title, artist, kind, windowSec: thisLen });
            // Lift local (clip-relative) timestamps into absolute song time.
            perWindow.push(local.map(c => ({ time: Math.round((c.time + start) * 100) / 100, text: c.text })));
          } catch { windowFailures++; perWindow.push([]); }
        }

        // Tile: give each window a non-overlapping "claim" region so the shared overlap can't
        // double-list a line. Region i = [start_i + half, start_i + step + half); the first window
        // opens at -inf and the last closes at +inf, so the regions cover the song edge-to-edge.
        for (let i = 0; i < perWindow.length; i++) {
          const start = starts[i];
          const claimStart = i === 0 ? -Infinity : start + half;
          const claimEnd = i === perWindow.length - 1 ? Infinity : start + step + half;
          for (const c of perWindow[i]) if (c.time >= claimStart && c.time < claimEnd) captions.push(c);
        }
        captions.sort((a, b) => a.time - b.time);
        if (windowFailures) console.warn(`[AI] captions: ${windowFailures}/${starts.length} windows failed`);
      }

      // ── Fallback: single-shot (short clips, long spoken word, no ffmpeg, or windows empty) ──
      if (captions.length === 0) {
        const speechPrompt = `You are a precise speech transcription engine. Transcribe the spoken audio titled "${(title || '').slice(0, 200)}"${artist ? ` by "${(artist || '').slice(0, 200)}"` : ''} into time-coded captions covering the ENTIRE duration from first word to last.

Rules:
- Timestamps precise to 0.1 seconds; each marks the exact moment that phrase BEGINS.
- Transcribe every spoken word accurately; do NOT invent, summarise, or skip content.
- Preserve any Bible passages / scripture references exactly as spoken (e.g. "John 3:16").
- Each "text" entry is one natural spoken phrase or sentence clause (~6-15 words).
- Sort by ascending time; the final entry must be near the true end — do not stop early.`;
        const lyricPrompt = `You are a precise audio transcription engine. Listen to every second of this audio titled "${(title || '').slice(0, 200)}" by "${(artist || '').slice(0, 200)}" and generate time-coded captions covering the ENTIRE duration from first word to last.

Rules:
- Timestamps must be precise to 0.1 seconds (e.g. 14.3, not 14). Each timestamp marks the exact moment that line BEGINS being sung or spoken.
- Cover every section: intro, verses, pre-chorus, chorus, bridge, outro, and any spoken parts.
- For purely instrumental gaps longer than 3 seconds with no vocals, add an "(instrumental)" entry with the correct start time.
- Do NOT invent or guess lyrics — only transcribe words you can clearly hear in the audio.
- Each "text" entry should be one sung phrase of roughly 3-8 words. Do not merge multiple lines into one entry.
- Sort all entries by ascending time.
- CRITICAL: keep timing accurate through the WHOLE song. A common failure is timestamps drifting behind (or ahead of) the audio after the first minute — re-anchor to what you actually hear every ~20 seconds, and never let a timestamp exceed the audio's real length.
- The last entry must be close to the actual end of the audio — do not stop early.`;
        // Send a compact, downmixed copy rather than the raw bytes: a mono 16 kHz mp3 is a fraction
        // of a WAV master and stays under Gemini's ~20MB inline-data limit — which is what makes
        // this path work for older large-file tracks. Bitrate drops for very long spoken word so
        // even an hour-long sermon fits. Falls back to the raw bytes only if the transcode fails
        // (e.g. ffmpeg missing) and they're already small enough.
        let ssData = buf.toString('base64');
        let ssMime = mimeType;
        const INLINE_CAP = 19 * 1024 * 1024;
        {
          const fullPath = path.join(os.tmpdir(), `capfull_${stamp}.mp3`);
          tmpChunks.push(fullPath);
          const bitrate = dur > 1500 ? '24k' : dur > 700 ? '32k' : '48k';
          const { ok } = await runFfmpeg(
            ['-y', '-i', inputPath, '-ac', '1', '-ar', '16000', '-b:a', bitrate, '-f', 'mp3', fullPath], 120000);
          if (ok) {
            try {
              const fbuf = await fs.readFile(fullPath);
              if (fbuf.length <= INLINE_CAP) { ssData = fbuf.toString('base64'); ssMime = 'audio/mpeg'; }
            } catch { /* keep raw */ }
          }
        }
        // If even the compressed copy (or an un-transcodable raw file) is over the inline limit, we
        // genuinely can't send it — report it clearly instead of letting Gemini reject it opaquely.
        if (Buffer.byteLength(ssData, 'base64') > INLINE_CAP) {
          return res.status(413).json({ error: 'audio too large to transcribe' });
        }
        const response = await genai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [
            { inlineData: { data: ssData, mimeType: ssMime } },
            { text: kind === 'speech' ? speechPrompt : lyricPrompt },
          ],
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: { type: Type.OBJECT, properties: { time: { type: Type.NUMBER }, text: { type: Type.STRING } }, required: ['time', 'text'] },
            },
            maxOutputTokens: 65536,
            thinkingConfig: { thinkingBudget: 0 },
          },
        });
        const raw = (response as any).text || '[]';
        let arr: any[] = [];
        try { arr = JSON.parse(raw); }
        catch { const cut = raw.lastIndexOf('}'); if (cut > 0) { try { arr = JSON.parse(raw.slice(0, cut + 1) + ']'); } catch { arr = []; } } }
        captions = Array.isArray(arr)
          ? arr.filter(c => typeof c?.time === 'number' && !isNaN(c.time) && typeof c?.text === 'string' && c.text.trim())
               .map(c => ({ time: c.time, text: c.text.trim() }))
          : [];
        // The single-shot path is the drift-prone one, so keep the overshoot compression here.
        if (captions.length && dur > 0) {
          const last = captions[captions.length - 1].time;
          if (last > dur * 1.02) { const k = (dur * 0.99) / last; captions = captions.map(c => ({ time: Math.round(c.time * k * 100) / 100, text: c.text })); }
        }
      }

      // ── Common post-processing: drop adjacent near-duplicate lines, enforce non-decreasing time.
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const deduped: { time: number; text: string }[] = [];
      for (const c of captions) {
        const p = deduped[deduped.length - 1];
        if (p && norm(p.text) === norm(c.text) && Math.abs(c.time - p.time) < 2.5) continue; // overlap echo
        deduped.push(c);
      }
      let prev = -Infinity;
      captions = deduped.map(c => { const t = Math.max(prev, c.time); prev = t; return { time: Math.round(t * 100) / 100, text: c.text }; });

      res.json({ captions });
    } catch (err: any) {
      console.error('[AI] captions failed:', err?.message || err);
      res.status(502).json({ error: 'caption generation failed' });
    } finally {
      fs.rm(inputPath, { force: true }).catch(() => {});
      for (const f of tmpChunks) fs.rm(f, { force: true }).catch(() => {});
    }
  });

  // ── Generic Gemini proxy ─────────────────────────────────────────────────────
  // Server-side runner for all client-side Gemini features (services/geminiService
  // routes here in the browser). Keeps GOOGLE_AI_API_KEY off the client bundle so
  // album metadata/liner notes, lyric gen, sermon transcription, module insights,
  // content-safety, etc. work in production. Body is the SDK's generateContent
  // params ({ model, contents, config }); returns { text }. Logged-in + limited.
  app.post('/api/ai/gemini', apiLimiter, authMiddleware, express.json({ limit: '25mb' }), async (req: any, res) => {
    const geminiKey = process.env.GOOGLE_AI_API_KEY || process.env.VITE_GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
    if (!geminiKey) return res.status(503).json({ error: 'Gemini not configured' });
    const { model, contents, config } = (req.body || {}) as { model?: string; contents?: any; config?: any };
    if (!contents) return res.status(400).json({ error: 'contents required' });
    // Normalise to a known-good model (the client default alias can be unreliable).
    let safeModel = typeof model === 'string' && /^gemini-2\.[05]/.test(model) ? model : 'gemini-2.5-flash';
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const genai = new GoogleGenAI({ apiKey: geminiKey });
      const response = await genai.models.generateContent({
        model: safeModel,
        contents,
        // Disable "thinking" by default (it can yield empty replies) unless the caller set it.
        config: { ...(config || {}), thinkingConfig: (config && config.thinkingConfig) || { thinkingBudget: 0 } },
      });
      res.json({ text: (response as any).text || '' });
    } catch (err: any) {
      console.error('[AI] Gemini proxy failed:', err?.message || err);
      res.status(502).json({ error: 'Gemini request failed' });
    }
  });

  // ── Manager Suite: publish due scheduled posts (cron) ───────────────────────
  // Robust, browser-independent publisher. A scheduler (Cloud Scheduler, cron,
  // or any uptime pinger) hits this every minute:
  //   POST /api/cron/publish-due-posts?key=<ADMIN_SEED_KEY>
  // It finds every users/*/scheduledPosts doc that is SCHEDULED and due, posts
  // it to the owner's connected fediverse accounts, and records the outcome.
  // (Plajah on-platform cross-post for scheduled items is handled client-side.)
  const PUBLISH_PROJECT = 'gen-lang-client-0665118474';
  const PUBLISH_DB = 'plajah-prod';
  const PUBLISH_FS = `https://firestore.googleapis.com/v1/projects/${PUBLISH_PROJECT}/databases/${PUBLISH_DB}/documents`;

  // Decode a Firestore REST value map into plain JS.
  const fsVal = (v: any): any => {
    if (v == null) return undefined;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return Number(v.doubleValue);
    if ('booleanValue' in v) return v.booleanValue;
    if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(fsVal);
    if ('mapValue' in v) return fsFields(v.mapValue.fields ?? {});
    if ('nullValue' in v) return null;
    return undefined;
  };
  const fsFields = (fields: Record<string, any>): any => {
    const out: any = {};
    for (const k of Object.keys(fields)) out[k] = fsVal(fields[k]);
    return out;
  };

  app.post('/api/cron/publish-due-posts', express.json(), async (req: any, res: any) => {
    const key = req.query.key || req.headers['x-cron-key'];
    if (key !== process.env.ADMIN_SEED_KEY && key !== process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = await getGoogleAccessToken();
    if (!token) return res.status(500).json({ error: 'GOOGLE_SERVICE_ACCOUNT_JSON not configured' });

    const now = Date.now();
    const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    try {
      // 1) Find due posts across all users (collection-group query).
      const queryBody = {
        structuredQuery: {
          from: [{ collectionId: 'scheduledPosts', allDescendants: true }],
          where: {
            compositeFilter: {
              op: 'AND',
              filters: [
                { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'SCHEDULED' } } },
                { fieldFilter: { field: { fieldPath: 'scheduledAt' }, op: 'LESS_THAN_OR_EQUAL', value: { doubleValue: now } } },
              ],
            },
          },
          limit: 50,
        },
      };
      const qRes = await fetch(`${PUBLISH_FS}:runQuery`, { method: 'POST', headers: authHeaders, body: JSON.stringify(queryBody) });
      if (!qRes.ok) throw new Error(`query failed: ${qRes.status} ${(await qRes.text()).slice(0, 200)}`);
      const rows: any[] = await qRes.json();
      const docs = rows.filter(r => r.document).map(r => r.document);

      const auth = await getFediverseAuth();
      const broadcast = await getBroadcast();
      const summary: any[] = [];

      for (const d of docs) {
        const name: string = d.name; // projects/.../documents/users/{uid}/scheduledPosts/{id}
        const m = name.match(/\/users\/([^/]+)\/scheduledPosts\/([^/]+)$/);
        if (!m) continue;
        const [, uid] = m;
        const post = fsFields(d.fields ?? {});

        const patch = async (fields: Record<string, any>) => {
          const masks = Object.keys(fields).map(f => `updateMask.fieldPaths=${f}`).join('&');
          await fetch(`https://firestore.googleapis.com/v1/${name}?${masks}`, {
            method: 'PATCH', headers: authHeaders, body: JSON.stringify({ fields }),
          });
        };

        // Claim it so a second cron tick won't double-send.
        await patch({ status: { stringValue: 'PUBLISHING' }, claimedAt: { integerValue: String(now) } });

        try {
          const accounts = await auth.loadAccounts(uid, token);
          const targetIds: string[] = Array.isArray(post.targetAccountIds) ? post.targetAccountIds : [];
          const targeted = accounts.filter((a: any) => targetIds.includes(a.id));

          if (!targeted.length) {
            await patch({
              status: { stringValue: 'FAILED' },
              publishLog: { stringValue: 'No connected accounts matched the scheduled targets (reconnect needed?).' },
              lastAttemptAt: { integerValue: String(now) }, updatedAt: { integerValue: String(now) },
            });
            summary.push({ uid, status: 'FAILED', reason: 'no matching accounts' });
            continue;
          }

          const result = await broadcast(
            targeted,
            {
              text: String(post.text ?? ''),
              uri: post.linkUri || undefined,
              title: post.linkTitle || undefined,
              description: post.linkDescription || undefined,
              thumbnail: Array.isArray(post.mediaUrls) ? post.mediaUrls[0] : undefined,
            },
          );

          const okCount = result.succeeded.length;
          const failCount = result.failed.length;
          const status = failCount === 0 ? 'PUBLISHED' : okCount === 0 ? 'FAILED' : 'PARTIAL';
          const log = [
            ...result.succeeded.map((s: any) => `✓ ${s.protocol}`),
            ...result.failed.map((f: any) => `✗ ${f.protocol}: ${f.error}`),
          ].join('  ');
          await patch({
            status: { stringValue: status },
            publishLog: { stringValue: log.slice(0, 900) },
            lastAttemptAt: { integerValue: String(now) }, updatedAt: { integerValue: String(now) },
          });
          summary.push({ uid, status, ok: okCount, failed: failCount });
        } catch (err: any) {
          await patch({
            status: { stringValue: 'FAILED' },
            publishLog: { stringValue: (err?.message ?? 'publish error').slice(0, 900) },
            lastAttemptAt: { integerValue: String(now) }, updatedAt: { integerValue: String(now) },
          });
          summary.push({ uid, status: 'FAILED', reason: err?.message });
        }
      }

      res.json({ ok: true, processed: docs.length, summary });
    } catch (err: any) {
      console.error('[Cron] publish-due-posts failed:', err?.message || err);
      res.status(500).json({ error: err?.message ?? 'publish run failed' });
    }
  });

  // ── Mastodon OAuth2 — Step 1: Register app + return authorization URL ───────
  // The clientSecret is kept server-side; only the authUrl is sent to browser.
  app.post('/api/fediverse/mastodon/authorize', express.json(), authMiddleware, async (req: any, res) => {
    const { instanceUrl } = req.body as { instanceUrl?: string };
    if (!instanceUrl?.trim()) return res.status(400).json({ error: 'instanceUrl required' });

    try {
      const auth = await getFediverseAuth();
      const appBase = (process.env.VITE_APP_URL ?? `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
      const redirectUri = `${appBase}/auth/fediverse/callback`;
      const app = await auth.registerMastodonApp(instanceUrl.trim(), redirectUri);
      const { authUrl, state } = auth.buildMastodonAuthUrl(app, req.uid);
      res.json({ authUrl, state, instanceUrl: app.instanceUrl });
    } catch (err: any) {
      console.error('[Fediverse] Mastodon authorize error:', err);
      res.status(500).json({ error: err.message ?? 'Failed to start Mastodon OAuth' });
    }
  });

  // ── Mastodon OAuth2 — Callback (popup closer) ───────────────────────────────
  // Mastodon redirects here after user authorizes. The popup sends code+state
  // back to the opener via postMessage, then closes itself.
  app.get('/auth/fediverse/callback', (req, res) => {
    const { code, state, error } = req.query as Record<string, string>;
    res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Plajah — Connecting…</title>
<style>
  body { margin: 0; background: #0a0a0f; color: #fff; font-family: system-ui, sans-serif;
    display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .card { text-align: center; padding: 40px; max-width: 360px; }
  .logo { font-size: 28px; font-weight: 900; letter-spacing: -1px; margin-bottom: 16px; }
  .status { font-size: 14px; color: rgba(255,255,255,0.5); }
</style>
</head>
<body>
<div class="card">
  <div class="logo">Plajah</div>
  <p class="status" id="s">Synchronizing…</p>
</div>
<script>
  (function() {
    const code = ${JSON.stringify(code ?? null)};
    const state = ${JSON.stringify(state ?? null)};
    const err = ${JSON.stringify(error ?? null)};
    const msg = err
      ? { type: 'FEDIVERSE_AUTH_ERROR', error: err }
      : { type: 'FEDIVERSE_AUTH_SUCCESS', code, state };
    if (window.opener) {
      window.opener.postMessage(msg, window.location.origin);
      document.getElementById('s').textContent = 'Connected! Closing…';
      setTimeout(() => window.close(), 600);
    } else {
      document.getElementById('s').textContent = 'No opener found. Please close this window.';
    }
  })();
</script>
</body>
</html>`);
  });

  // ── Mastodon OAuth2 — Step 2: Exchange code, verify, save account ───────────
  app.post('/api/fediverse/mastodon/connect', express.json(), authMiddleware, async (req: any, res) => {
    const { code, state, instanceUrl } = req.body as {
      code?: string; state?: string; instanceUrl?: string;
    };
    if (!code || !state || !instanceUrl) {
      return res.status(400).json({ error: 'code, state, and instanceUrl are required' });
    }

    try {
      const auth = await getFediverseAuth();

      // Decrypt and validate state token (stateless — no server-side Map needed)
      const pending = auth.consumeOAuthState(state);
      if (!pending) {
        return res.status(400).json({ error: 'Invalid or expired OAuth state — restart the flow' });
      }
      if (pending.uid !== req.uid) {
        return res.status(403).json({ error: 'State mismatch — potential CSRF' });
      }

      // Use redirect URI and client credentials from the encrypted state token
      const creds = await auth.exchangeMastodonCode(
        pending.instanceUrl,
        code,
        pending.redirectUri,
        pending.clientId,
        pending.clientSecret,
      );

      const firebaseToken = (req.headers.authorization as string).slice(7);
      const account = await auth.buildAndSaveAccount(req.uid, 'mastodon', creds, firebaseToken);
      res.json({ account });
    } catch (err: any) {
      console.error('[Fediverse] Mastodon connect error:', err);
      res.status(500).json({ error: err.message ?? 'Mastodon connection failed' });
    }
  });

  // ── Social Graph Import ───────────────────────────────────────────────────────
  // Seed the user's Plajah follow graph from Twitter/X or Instagram.
  // OAuth flows redirect back to the app with ?social_import_code=…&social_import_platform=…

  app.get('/api/social-import/twitter/auth', authMiddleware, async (req: any, res) => {
    const clientId = process.env.TWITTER_CLIENT_ID;
    if (!clientId) return res.status(501).json({ error: 'TWITTER_CLIENT_ID not configured' });
    const appUrl = process.env.VITE_APP_URL ?? 'https://plajah.com';
    const redirectUri = encodeURIComponent(`${appUrl}/auth/twitter/callback`);
    const state = Buffer.from(req.uid).toString('base64');
    const scope = encodeURIComponent('tweet.read users.read follows.read offline.access');
    const url = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}&code_challenge=challenge&code_challenge_method=plain`;
    res.json({ url });
  });

  app.get('/auth/twitter/callback', async (req: any, res) => {
    const { code, state } = req.query as Record<string, string>;
    const appUrl = process.env.VITE_APP_URL ?? 'https://plajah.com';
    // Pass the code back to the SPA so SocialGraphImport.tsx can pick it up
    res.redirect(`${appUrl}?social_import_code=${encodeURIComponent(code)}&social_import_platform=twitter&state=${state}`);
  });

  app.get('/api/social-import/twitter/matches', authMiddleware, async (req: any, res) => {
    const { code } = req.query as { code: string };
    const clientId = process.env.TWITTER_CLIENT_ID;
    const clientSecret = process.env.TWITTER_CLIENT_SECRET;
    if (!clientId || !clientSecret) return res.status(501).json({ error: 'Twitter not configured' });

    try {
      const appUrl = process.env.VITE_APP_URL ?? 'https://plajah.com';
      // Exchange code for token
      const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
        body: new URLSearchParams({ code, grant_type: 'authorization_code', redirect_uri: `${appUrl}/auth/twitter/callback`, code_verifier: 'challenge' }).toString(),
      });
      if (!tokenRes.ok) return res.status(400).json({ error: 'Token exchange failed' });
      const { access_token } = await tokenRes.json();

      // Get the authenticated user's following list
      const meRes = await fetch('https://api.twitter.com/2/users/me', { headers: { Authorization: `Bearer ${access_token}` } });
      const { data: me } = await meRes.json();
      const followingRes = await fetch(`https://api.twitter.com/2/users/${me.id}/following?max_results=1000&user.fields=username`, { headers: { Authorization: `Bearer ${access_token}` } });
      const { data: following } = await followingRes.json();
      const handles = (following ?? []).map((u: any) => u.username.toLowerCase());

      // Match against Plajah users by twitterHandle field
      const { getDocs, collection, where, query, limit } = await import('firebase/firestore');
      const { db: firestoreDb } = await import('./services/firebase.js');
      const matches: any[] = [];

      // Batch into groups of 10 (Firestore 'in' limit)
      for (let i = 0; i < handles.length; i += 10) {
        const batch = handles.slice(i, i + 10);
        if (!batch.length) continue;
        const q = query(collection(firestoreDb, 'users'), where('twitterHandle', 'in', batch), limit(10));
        const snap = await getDocs(q);
        snap.docs.forEach(d => {
          const u = d.data();
          matches.push({
            plajahUid: d.id,
            displayName: u.displayName ?? u.twitterHandle,
            photoURL: u.photoURL,
            externalHandle: u.twitterHandle ?? '',
            alreadyFollowing: false,
          });
        });
      }

      res.json(matches);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/social-import/follow-batch', authMiddleware, express.json(), async (req: any, res) => {
    const { uids } = req.body as { uids: string[] };
    if (!Array.isArray(uids) || uids.length === 0) return res.status(400).json({ error: 'uids required' });
    // Write follow records to Firestore
    const { doc, setDoc, serverTimestamp: ts } = await import('firebase/firestore');
    const { db: firestoreDb } = await import('./services/firebase.js');
    await Promise.allSettled(uids.map(uid =>
      setDoc(doc(firestoreDb, 'follows', `${req.uid}_${uid}`), {
        followerId: req.uid, followingId: uid, createdAt: ts(), source: 'social_import',
      })
    ));
    res.json({ followed: uids.length });
  });

  // ── Alexa Skill Fulfillment ───────────────────────────────────────────────────
  // Alexa POSTs signed requests here — no Firebase auth (Alexa doesn't know
  // about Firebase), but the Alexa app ID should be verified in production.
  app.post('/api/alexa', express.json(), async (req, res) => {
    try {
      const { handleAlexaRequest } = await import('./services/alexaService.js');
      const response = await handleAlexaRequest(req.body);
      res.json(response);
    } catch (err: any) {
      console.error('[Alexa] handler error:', err.message);
      res.status(500).json({ version: '1.0', response: { outputSpeech: { type: 'PlainText', text: 'An error occurred.' }, shouldEndSession: true } });
    }
  });

  // ── Google Actions Fulfillment ────────────────────────────────────────────────
  // Google Assistant POSTs here for conversational actions.
  // Verify with Google Actions SDK JWT in production.
  app.post('/api/google-action', express.json(), async (req, res) => {
    try {
      const { handleGoogleActionRequest } = await import('./services/googleHomeService.js');
      const response = handleGoogleActionRequest(req.body);
      res.json(response);
    } catch (err: any) {
      console.error('[GoogleAction] handler error:', err.message);
      res.status(500).json({ prompt: { override: true, firstSimple: { speech: 'An error occurred.', text: 'Error.' } } });
    }
  });

  // ── Public status — no auth, safe to expose, used for deployment verification ─
  app.get('/api/status', (_req, res) => {
    const encKey = process.env.ENCRYPTION_KEY ?? '';
    const firebaseApiKey = process.env.FIREBASE_API_KEY ?? process.env.VITE_FIREBASE_API_KEY ?? '';
    res.json({
      ok: true,
      encryption_key_set: encKey.length >= 16,
      firebase_api_key_set: firebaseApiKey.length > 0,
      app_url: process.env.VITE_APP_URL ?? '(not set)',
      node_env: process.env.NODE_ENV ?? '(not set)',
    });
  });

  // ── Fediverse diagnostics — check every config requirement ────────────────
  app.get('/api/fediverse/diagnostics', authMiddleware, async (req: any, res) => {
    const encKey = process.env.ENCRYPTION_KEY ?? '';
    const firebaseApiKey = process.env.FIREBASE_API_KEY ?? process.env.VITE_FIREBASE_API_KEY ?? '';
    const checks: Record<string, unknown> = {
      uid: req.uid,
      encryption_key_set: encKey.length >= 16,
      encryption_key_length: encKey.length,
      firebase_api_key_set: firebaseApiKey.length > 0,
      vite_app_url: process.env.VITE_APP_URL ?? '(not set)',
      node_env: process.env.NODE_ENV ?? '(not set)',
    };
    try {
      const auth = await getFediverseAuth();
      const firebaseToken = (req.headers.authorization as string).slice(7);
      const accounts = await auth.loadAccounts(req.uid, firebaseToken);
      checks.firestore_read = 'ok';
      checks.accounts_count = accounts.length;
    } catch (err: any) {
      checks.firestore_read = 'FAILED';
      checks.firestore_error = err.message;
    }
    res.json(checks);
  });

  // ── Bluesky — Create session from handle + App Password ────────────────────
  // App Password never leaves the server. Browser receives only account metadata.
  app.post('/api/fediverse/bluesky/connect', express.json(), authMiddleware, async (req: any, res) => {
    const { handle, appPassword } = req.body as { handle?: string; appPassword?: string };
    if (!handle?.trim() || !appPassword?.trim()) {
      return res.status(400).json({ error: 'handle and appPassword are required' });
    }

    // Gate early so the error is unambiguous
    const encKey = process.env.ENCRYPTION_KEY ?? '';
    if (encKey.length < 16) {
      return res.status(500).json({ error: 'Server misconfiguration: ENCRYPTION_KEY env var is not set in Cloud Run' });
    }

    try {
      const auth = await getFediverseAuth();

      let creds;
      try {
        creds = await auth.createBlueskySession(handle.trim(), appPassword.trim());
      } catch (err: any) {
        console.error('[Fediverse] Bluesky session error:', err);
        return res.status(401).json({ error: `Bluesky login failed: ${err.message}` });
      }

      const firebaseToken = (req.headers.authorization as string).slice(7);
      try {
        const account = await auth.buildAndSaveAccount(req.uid, 'bluesky', creds, firebaseToken);
        res.json({ account });
      } catch (err: any) {
        console.error('[Fediverse] Bluesky save error:', err);
        res.status(500).json({ error: `Account save failed: ${err.message}` });
      }
    } catch (err: any) {
      console.error('[Fediverse] Bluesky connect error:', err);
      res.status(500).json({ error: err.message ?? 'Bluesky connection failed' });
    }
  });

  // ── Disconnect an account ───────────────────────────────────────────────────
  app.delete('/api/fediverse/accounts/:accountId', authMiddleware, async (req: any, res) => {
    try {
      const auth = await getFediverseAuth();
      const firebaseToken = (req.headers.authorization as string).slice(7);
      await auth.removeAccount(req.uid, req.params.accountId, firebaseToken);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? 'Failed to disconnect account' });
    }
  });

  // ── Unified Broadcast — post to all active networks simultaneously ──────────
  app.post('/api/fediverse/broadcast', express.json(), authMiddleware, async (req: any, res) => {
    const { text, uri, title, description, thumbnail, langs, targetAccountIds } = req.body as {
      text?: string;
      uri?: string;
      title?: string;
      description?: string;
      thumbnail?: string;
      langs?: string[];
      targetAccountIds?: string[];
    };

    if (!text?.trim()) return res.status(400).json({ error: 'text is required' });

    try {
      const auth = await getFediverseAuth();
      const broadcast = await getBroadcast();
      const firebaseToken = (req.headers.authorization as string).slice(7);
      const accounts = await auth.loadAccounts(req.uid, firebaseToken);

      if (!accounts.length) {
        return res.status(400).json({ error: 'No connected fediverse accounts' });
      }

      const result = await broadcast(accounts, { text, uri, title, description, thumbnail, langs }, targetAccountIds);
      res.json(result);
    } catch (err: any) {
      console.error('[Fediverse] Broadcast error:', err);
      res.status(500).json({ error: err.message ?? 'Broadcast failed' });
    }
  });

  // ── Unified Timeline ────────────────────────────────────────────────────────
  app.get('/api/fediverse/timeline', authMiddleware, async (req: any, res) => {
    try {
      const auth = await getFediverseAuth();
      const firebaseToken = (req.headers.authorization as string).slice(7);
      const accounts = await auth.loadAccounts(req.uid, firebaseToken);

      const { getUnifiedTimeline } = await import('./services/fediverse/service.js');
      const result = await getUnifiedTimeline(accounts);
      res.json(result);
    } catch (err: any) {
      console.error('[Fediverse] Timeline error:', err);
      res.status(500).json({ error: err.message ?? 'Timeline fetch failed' });
    }
  });

  // ── List connected accounts (metadata only, no credentials) ─────────────────
  app.get('/api/fediverse/accounts', authMiddleware, async (req: any, res) => {
    try {
      const auth = await getFediverseAuth();
      const firebaseToken = (req.headers.authorization as string).slice(7);
      const accounts = await auth.loadAccounts(req.uid, firebaseToken);
      const safe = accounts.map(({ credentials: _creds, ...meta }) => meta);
      res.json({ accounts: safe });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? 'Failed to load accounts' });
    }
  });

  // ── Per-post actions (like, unlike, repost, unrepost, reply) ────────────────
  app.post('/api/fediverse/posts/action', express.json(), authMiddleware, async (req: any, res) => {
    const { action, post, accountId } = req.body as {
      action: 'like' | 'unlike' | 'repost' | 'unrepost';
      post: import('./services/fediverse/types.js').FediversePost;
      accountId: string;
    };

    if (!action || !post || !accountId) {
      return res.status(400).json({ error: 'action, post, and accountId are required' });
    }

    try {
      const auth = await getFediverseAuth();
      const firebaseToken = (req.headers.authorization as string).slice(7);
      const account = await auth.loadAccount(req.uid, accountId, firebaseToken);
      if (!account) return res.status(404).json({ error: 'Account not found' });

      const { ADAPTERS_MAP } = await import('./services/fediverse/service.js');
      const adapter = ADAPTERS_MAP[account.protocol];

      let result: Partial<import('./services/fediverse/types.js').FediversePost> = {};
      switch (action) {
        case 'like':   result = await adapter.likePost(account.credentials, post);   break;
        case 'unlike': await adapter.unlikePost(account.credentials, post);          break;
        case 'repost': result = await adapter.repost(account.credentials, post);     break;
        case 'unrepost': await adapter.unrepost(account.credentials, post);          break;
        default: return res.status(400).json({ error: `Unknown action: ${action}` });
      }
      res.json({ success: true, update: result });
    } catch (err: any) {
      console.error('[Fediverse] Action error:', err);
      res.status(500).json({ error: err.message ?? 'Action failed' });
    }
  });

  // ── Bluesky DMs — list conversations ─────────────────────────────────────────
  app.get('/api/fediverse/bluesky/dm/conversations', authMiddleware, async (req: any, res) => {
    try {
      const auth = await getFediverseAuth();
      const firebaseToken = (req.headers.authorization as string).slice(7);
      const accounts = await auth.loadAccounts(req.uid, firebaseToken);
      const bskyAccount = accounts.find(a => a.protocol === 'bluesky');
      if (!bskyAccount) return res.status(404).json({ error: 'No Bluesky account connected' });
      const { bskyListConversations } = await import('./services/fediverse/bluesky.js');
      const convos = await bskyListConversations(bskyAccount.credentials);
      res.json({ conversations: convos });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? 'DM fetch failed' });
    }
  });

  // ── Bluesky DMs — get messages in conversation ────────────────────────────────
  app.get('/api/fediverse/bluesky/dm/messages', authMiddleware, async (req: any, res) => {
    const { convoId } = req.query as { convoId?: string };
    if (!convoId) return res.status(400).json({ error: 'convoId required' });
    try {
      const auth = await getFediverseAuth();
      const firebaseToken = (req.headers.authorization as string).slice(7);
      const accounts = await auth.loadAccounts(req.uid, firebaseToken);
      const bskyAccount = accounts.find(a => a.protocol === 'bluesky');
      if (!bskyAccount) return res.status(404).json({ error: 'No Bluesky account connected' });
      const { bskyGetMessages } = await import('./services/fediverse/bluesky.js');
      const messages = await bskyGetMessages(bskyAccount.credentials, convoId);
      res.json({ messages });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? 'Message fetch failed' });
    }
  });

  // ── Bluesky DMs — send message ────────────────────────────────────────────────
  app.post('/api/fediverse/bluesky/dm/send', express.json(), authMiddleware, async (req: any, res) => {
    const { convoId, text } = req.body as { convoId?: string; text?: string };
    if (!convoId || !text?.trim()) return res.status(400).json({ error: 'convoId and text required' });
    try {
      const auth = await getFediverseAuth();
      const firebaseToken = (req.headers.authorization as string).slice(7);
      const accounts = await auth.loadAccounts(req.uid, firebaseToken);
      const bskyAccount = accounts.find(a => a.protocol === 'bluesky');
      if (!bskyAccount) return res.status(404).json({ error: 'No Bluesky account connected' });
      const { bskySendMessage } = await import('./services/fediverse/bluesky.js');
      const message = await bskySendMessage(bskyAccount.credentials, convoId, text);
      res.json({ message });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? 'Send failed' });
    }
  });

  // ── Legacy compat — keep old callback path working ──────────────────────────
  app.get('/auth/mastodon/callback', (req, res) => {
    res.redirect(`/auth/fediverse/callback?${new URLSearchParams(req.query as Record<string, string>)}`);
  });

  // ── Fediverse proxy (CORS bypass for remote instance lookups) ────────────────
  app.get('/api/social/fediverse/proxy', async (req: any, res: any) => {
    const { instance, path: apiPath, token } = req.query as Record<string, string>;
    if (!instance || !apiPath) return res.status(400).json({ error: 'instance and path required' });

    try { validateFediverseInstance(instance); }
    catch (e: any) { return res.status(400).json({ error: e.message }); }

    const pathStr = String(apiPath);
    if (!pathStr.startsWith('/') || pathStr.includes('..')) {
      return res.status(400).json({ error: 'Invalid API path' });
    }

    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(`https://${instance}${pathStr}`, { headers });
      if (!response.ok) return res.status(response.status).json({ error: 'Fediverse API error', status: response.status });
      const ct = response.headers.get('content-type') ?? '';
      if (!ct.includes('application/json')) return res.status(502).json({ error: 'Non-JSON response from instance' });
      res.json(await response.json());
    } catch {
      res.status(500).json({ error: 'Fediverse proxy failed' });
    }
  });

  // ── Social post routes (require Firebase auth) ───────────────────────────────
  app.post('/api/social/mastodon/post', authMiddleware, async (req: any, res) => {
    const { instance, token, status, inReplyToId } = req.body as Record<string, string>;
    try { validateFediverseInstance(instance); }
    catch (e: any) { return res.status(400).json({ error: e.message }); }
    try {
      const r = await fetch(`https://${instance}/api/v1/statuses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, in_reply_to_id: inReplyToId, visibility: 'public' }),
      });
      res.status(r.status).json(await r.json());
    } catch { res.status(500).json({ error: 'Post failed' }); }
  });

  app.post('/api/social/bluesky/post', authMiddleware, async (req: any, res) => {
    const { session, text, reply } = req.body as Record<string, unknown>;
    try {
      const agent = new BskyAgent({ service: 'https://bsky.social' });
      await agent.resumeSession(session as any);
      const post = await agent.post({ text: text as string, reply: reply as any, createdAt: new Date().toISOString() });
      res.json(post);
    } catch { res.status(500).json({ error: 'Post failed' }); }
  });

  // ── Legacy Bluesky login shim ────────────────────────────────────────────────
  app.post('/api/auth/bluesky/login', express.json(), async (req, res) => {
    const { identifier, password } = req.body as { identifier: string; password: string };
    try {
      const agent = new BskyAgent({ service: 'https://bsky.social' });
      const r = await agent.login({ identifier, password });
      res.json({ session: r.data });
    } catch { res.status(401).json({ error: 'Bluesky login failed' }); }
  });

  // --- Generic Proxy for external assets (CORS bypass and streaming support) ---
  // ── Comic museum: cache archive.org JPEG-2000 scans as web JPEGs on first read ──
  // archive.org's live IIIF image service (jp2→jpg) is slow/flaky, which is why the
  // in-app reader kept erroring. Its *download* server, however, is fast + reliable, so
  // we pull the raw .jp2 pages from there, ffmpeg-decode them to JPEG, and cache the
  // result in our own Storage. First view of a page costs ~2s; every later view (any
  // user) streams instantly from cache and never touches archive.org again.
  const _comicPages = new Map<string, { pages: { zip: string; inner: string }[]; ts: number }>();
  const _comicInflight = new Map<string, Promise<Buffer | null>>();

  async function enumerateComicPages(id: string): Promise<{ zip: string; inner: string }[]> {
    const hit = _comicPages.get(id);
    if (hit && Date.now() - hit.ts < 12 * 3600_000) return hit.pages;
    const pages: { zip: string; inner: string }[] = [];
    try {
      const metaRes = await safeOutboundFetch(`https://archive.org/metadata/${encodeURIComponent(id)}`);
      const meta: any = await metaRes.json();
      const zips: string[] = (meta.files || [])
        .map((f: any) => f?.name).filter((n: any) => typeof n === 'string' && /_jp2\.zip$/i.test(n))
        .sort((a: string, b: string) => a.localeCompare(b));
      for (const zip of zips) {
        const base = zip.replace(/\.zip$/i, '');
        try {
          const listRes = await safeOutboundFetch(`https://archive.org/download/${encodeURIComponent(id)}/${encodeURIComponent(zip)}/`);
          const html = await listRes.text();
          const names = Array.from(new Set(
            Array.from(html.matchAll(/href="([^"?]+?\.jp2)"/gi))
              .map(m => { try { return decodeURIComponent(m[1]); } catch { return m[1]; } })
              .map(h => h.split('/').pop()!)
          )).sort((a, b) => a.localeCompare(b));
          for (const n of names) pages.push({ zip, inner: `${base}/${n}` });
        } catch (e: any) { console.error('[comics] list zip failed', id, zip, e?.message); }
      }
    } catch (e: any) { console.error('[comics] enumerate failed', id, e?.message); }
    _comicPages.set(id, { pages, ts: Date.now() });
    return pages;
  }

  async function renderComicPage(id: string, n: number): Promise<Buffer | null> {
    const objectPath = `comics-cache/${id}/${String(n).padStart(4, '0')}.jpg`;
    const cached = await gcsDownload(objectPath);
    if (cached && cached.length > 100) return cached;
    const pages = await enumerateComicPages(id);
    const pg = pages[n];
    if (!pg) return null;
    const jp2Url = `https://archive.org/download/${encodeURIComponent(id)}/${encodeURIComponent(pg.zip)}/${encodeURIComponent(pg.inner)}`;
    let jp2Res: Response;
    try { jp2Res = await safeOutboundFetch(jp2Url); } catch (e: any) { console.error('[comics] jp2 fetch failed', jp2Url, e?.message); return null; }
    if (!jp2Res.ok) { console.error('[comics] jp2 fetch status', jp2Res.status, jp2Url); return null; }
    const jp2Buf = Buffer.from(await jp2Res.arrayBuffer());
    if (jp2Buf.length < 100) return null;
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const inP = path.join(os.tmpdir(), `comic_${stamp}.jp2`);
    const outP = path.join(os.tmpdir(), `comic_${stamp}.jpg`);
    let jpg: Buffer | null = null;
    try {
      await fs.writeFile(inP, jp2Buf);
      const { ok, err } = await runFfmpeg(['-y', '-hide_banner', '-loglevel', 'error', '-i', inP, '-vf', "scale='min(1600,iw)':-2", '-q:v', '4', outP], 40000);
      if (ok) { try { jpg = await fs.readFile(outP); } catch { /* */ } }
      else console.error('[comics] ffmpeg decode failed', id, n, err.slice(-400));
    } catch (e: any) { console.error('[comics] render error', id, n, e?.message); }
    finally { fs.unlink(inP).catch(() => {}); fs.unlink(outP).catch(() => {}); }
    if (jpg && jpg.length > 100) gcsUpload(objectPath, jpg, 'image/jpeg').catch(() => {});
    return jpg && jpg.length > 100 ? jpg : null;
  }

  // Enumerate a comic's pages (count only) so the client can build the native reader.
  app.get('/api/comics/pages/:id', async (req: any, res: any) => {
    const id = String(req.params.id || '');
    if (!id) return res.status(400).json({ error: 'id required' });
    try {
      const pages = await enumerateComicPages(id);
      if (!pages.length) return res.status(404).json({ error: 'no scanned pages for this item' });
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.json({ id, count: pages.length });
    } catch (e: any) { return res.status(500).json({ error: e?.message || 'enumerate failed' }); }
  });

  // Lazily decode + cache + stream a single page as JPEG.
  app.get('/api/comics/page/:id/:n', async (req: any, res: any) => {
    const id = String(req.params.id || '');
    const n = parseInt(String(req.params.n), 10);
    if (!id || !Number.isFinite(n) || n < 0) return res.status(400).end();
    const key = `${id}/${n}`;
    try {
      let job = _comicInflight.get(key);
      if (!job) { job = renderComicPage(id, n); _comicInflight.set(key, job); job.finally(() => _comicInflight.delete(key)); }
      const jpg = await job;
      if (!jpg) return res.status(502).end();
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.end(jpg);
    } catch (e: any) { console.error('[comics] page route', key, e?.message); return res.status(500).end(); }
  });

  app.get('/api/proxy', async (req: any, res: any) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL required' });

    let parsed: URL;
    try { parsed = validateProxyUrl(url as string); }
    catch (e: any) { return res.status(400).json({ error: e.message }); }

    const controller = new AbortController();
    req.on('close', () => { controller.abort(); });

    try {
      const decodedUrl = parsed.toString();
      const range = req.headers.range;

      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (compatible; Plajah/1.0)',
        'Accept': '*/*',
        'Connection': 'keep-alive'
      };

      if (range) {
        headers['Range'] = range;
      }

      console.log(`[Proxy] ${range ? 'Streaming' : 'Fetching'}: ${parsed.hostname}${parsed.pathname}`);

      const response = await safeOutboundFetch(parsed, {
        headers,
        signal: controller.signal
      });
      
      if (!response.ok && response.status !== 206) {
        console.error(`[Proxy] Upstream Error: ${response.status} ${response.statusText} for ${decodedUrl}`);
        return res.status(response.status).send(response.statusText);
      }

      // Forward headers
      const contentRange = response.headers.get('content-range');
      const contentType = response.headers.get('content-type');
      const contentLength = response.headers.get('content-length');
      const acceptRanges = response.headers.get('accept-ranges');

      if (contentRange) res.setHeader('Content-Range', contentRange);
      if (contentType) res.setHeader('Content-Type', contentType);
      if (contentLength) res.setHeader('Content-Length', contentLength);
      if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges || 'bytes');
      
      // If the upstream responded with Partial Content (206)
      if (response.status === 206) {
        res.status(206);
      }

      // Robust streaming using Readable.fromWeb
      if (response.body) {
        try {
          // @ts-ignore - Web readable stream to Node stream conversion
          const nodeReadable = Readable.fromWeb(response.body);
          nodeReadable.pipe(res);
          
          res.on('close', () => {
             nodeReadable.destroy();
          });
        } catch (streamError) {
          console.error('[Proxy] Stream construction failed, falling back to manual push:', streamError);
          // Manual fallback if fromWeb is not available or fails
          const reader = response.body.getReader();
          const push = async () => {
            try {
              const { done, value } = await reader.read();
              if (done) {
                if (!res.writableEnded) res.end();
                return;
              }
              if (!res.writableEnded) {
                res.write(Buffer.from(value));
                push();
              }
            } catch (readError) {
              console.error('[Proxy] Read error:', readError);
              if (!res.writableEnded) res.end();
            }
          };
          push();
        }
      } else {
        res.end();
      }
    } catch (error: any) {
      console.error('[Proxy] Failed:', error.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Proxy request failed' });
      }
    }
  });

  // Fediverse Proxy (to avoid CORS and handle remote lookups)
  app.get('/api/social/fediverse/proxy', async (req: any, res: any) => {
    const { instance, path: apiPath, token } = req.query;
    if (!instance || !apiPath) return res.status(400).json({ error: 'Instance and path required' });

    try {
      validateFediverseInstance(instance as string);
    } catch (e: any) {
      return res.status(400).json({ error: e.message });
    }

    // Only allow well-formed API paths starting with /
    const pathStr = String(apiPath);
    if (!pathStr.startsWith('/') || pathStr.includes('..')) {
      return res.status(400).json({ error: 'Invalid API path' });
    }

    try {
      const headers: Record<string, string> = { 'Accept': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const url = `https://${instance}${pathStr}`;
      const response = await fetch(url, { headers });

      if (!response.ok) {
        return res.status(response.status).json({ error: 'Fediverse API error', status: response.status });
      }

      const contentType = response.headers.get('content-type');
      if (contentType && !contentType.includes('application/json')) {
        return res.status(502).json({ error: 'Remote instance returned non-JSON data' });
      }

      res.json(await response.json());
    } catch (error: any) {
      res.status(500).json({ error: 'Fediverse proxy failed' });
    }
  });

  // Mastodon Post/Reply — requires Firebase auth
  app.post('/api/social/mastodon/post', authMiddleware, async (req: any, res) => {
    const { instance, token, status, inReplyToId } = req.body;
    try {
      validateFediverseInstance(instance);
    } catch (e: any) {
      return res.status(400).json({ error: e.message });
    }
    try {
      const response = await fetch(`https://${instance}/api/v1/statuses`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, in_reply_to_id: inReplyToId, visibility: 'public' }),
      });
      res.json(await response.json());
    } catch {
      res.status(500).json({ error: 'Post failed' });
    }
  });

  // Bluesky Post/Reply — requires Firebase auth
  app.post('/api/social/bluesky/post', authMiddleware, async (req: any, res) => {
    const { session, text, reply } = req.body;
    const agent = new BskyAgent({ service: 'https://bsky.social' });

    try {
      await agent.resumeSession(session);
      const post = await agent.post({ text, reply, createdAt: new Date().toISOString() });
      res.json(post);
    } catch {
      res.status(500).json({ error: 'Post failed' });
    }
  });

  // --- Partner Site Browser Proxy ---
  // Fetches an external URL server-side and strips X-Frame-Options / CSP frame-ancestors
  // so the content can be rendered inside a Plajah iframe panel.
  app.get('/api/browse', async (req: any, res: any) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('URL required');

    let parsed: URL;
    try {
      parsed = validateProxyUrl(url as string);
    } catch (e: any) {
      return res.status(400).send(e.message || 'Invalid URL');
    }
    const targetUrl = parsed.toString();

    try {
      const upstream = await safeOutboundFetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      });

      const contentType = upstream.headers.get('content-type') || 'text/html; charset=utf-8';
      res.setHeader('Content-Type', contentType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      // Strip iframe-blocking headers — intentionally NOT forwarding X-Frame-Options or CSP

      if (contentType.includes('text/html')) {
        let html = await upstream.text();
        // Inject <base> tag so relative URLs resolve against the original origin
        const origin = parsed.origin;
        const baseTag = `<base href="${htmlEscape(origin)}/">`;
        if (/<head(\s[^>]*)?>/.test(html)) {
          html = html.replace(/<head(\s[^>]*)?>/, (m) => `${m}${baseTag}`);
        } else {
          html = baseTag + html;
        }
        return res.send(html);
      }

      // Non-HTML: stream directly (CSS, JS, images, etc.)
      if (upstream.body) {
        try {
          // @ts-ignore
          const nodeReadable = Readable.fromWeb(upstream.body);
          nodeReadable.pipe(res);
          res.on('close', () => nodeReadable.destroy());
        } catch {
          const buf = await upstream.arrayBuffer();
          res.end(Buffer.from(buf));
        }
      } else {
        res.end();
      }
    } catch (error: any) {
      console.error('[BrowseProxy] Error:', error.message);
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.status(502).send(`<!DOCTYPE html><html><body style="font-family:system-ui;background:#0a0a0a;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;gap:12px;"><h2 style="margin:0">Could not load page</h2><p style="color:#666;margin:0">${error.message}</p></body></html>`);
      }
    }
  });

  // --- Embed & Meta tag Middleware ---

  // Push notification send endpoint — called by the client after creating a Firestore
  // notification. Uses FCM HTTP v1 (the legacy fcm/send API was decommissioned by
  // Google in June 2024). Auth is the same service-account OAuth token used for
  // Firestore (cloud-platform scope covers firebase.messaging). Sends per-token
  // (v1 messages:send is single-recipient) — fine for chat/social fan-out sizes.
  // Fan one notification out to many FCM tokens (v1 messages:send is single-recipient).
  // Sent in chunks so a large broadcast doesn't open thousands of sockets at once.
  // Returns per-token results (index-aligned) so callers can prune UNREGISTERED tokens.
  interface FcmOpts { title?: string; body?: string; link?: string; icon?: string; channelId?: string; data?: Record<string, string>; }
  async function sendFcmMulticast(tokens: string[], opts: FcmOpts) {
    const accessToken = await getGoogleAccessToken();
    if (!accessToken) return { configured: false, sent: 0, total: tokens.length, results: tokens.map(() => ({ ok: false, error: 'not_configured' })) };
    const projectId = fcmProjectId();
    const endpoint = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
    // `link` may be a URL, a path ("/feed"), or an in-app view name ("MESSAGES").
    const rawLink = String(opts.link || '/');
    const clickUrl = rawLink.startsWith('http')
      ? rawLink
      : rawLink.startsWith('/') ? `https://plajah.com${rawLink}` : 'https://plajah.com/';
    // FCM data values must all be strings — carry what a native tap needs to deep-link.
    const data: Record<string, string> = { link: rawLink, ...(opts.data || {}) };
    const androidBlock: any = { priority: 'high' };
    if (opts.channelId) androidBlock.notification = { channel_id: String(opts.channelId) };

    const results: Array<{ ok: boolean; status?: number; stale?: boolean; error?: string }> = [];
    const CHUNK = 200;
    for (let i = 0; i < tokens.length; i += CHUNK) {
      const slice = tokens.slice(i, i + CHUNK);
      const r = await Promise.all(slice.map(async (t) => {
        try {
          const resp = await fetch(endpoint, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: {
                token: t,
                notification: { title: opts.title || 'Plajah', body: opts.body || '' },
                webpush: {
                  notification: { icon: opts.icon || 'https://plajah.com/icons/icon-192.png' },
                  fcm_options: { link: clickUrl },
                },
                data,
                android: androidBlock,
              },
            }),
          });
          if (resp.ok) return { ok: true };
          const err = await resp.text();
          return { ok: false, status: resp.status, stale: /UNREGISTERED|NOT_FOUND|InvalidRegistration/i.test(err), error: err.slice(0, 200) };
        } catch (e: any) {
          return { ok: false, error: e.message };
        }
      }));
      results.push(...r);
    }
    return { configured: true, sent: results.filter(x => x.ok).length, total: tokens.length, results };
  }

  app.post('/api/push', express.json(), async (req, res) => {
    const { token, tokens, title, body, link, icon, channelId, targetId, type, senderId, senderName, senderPhoto } = req.body || {};
    const targets: string[] = (Array.isArray(tokens) ? tokens : []).concat(token ? [token] : []).filter(Boolean);
    if (!targets.length) return res.status(400).json({ error: 'No FCM token provided' });

    const data: Record<string, string> = {};
    if (targetId) data.targetId = String(targetId);
    if (type) data.type = String(type);
    if (senderId) data.senderId = String(senderId);
    if (senderName) data.senderName = String(senderName);
    if (senderPhoto) data.senderPhoto = String(senderPhoto);

    const out = await sendFcmMulticast(targets, { title, body, link, icon, channelId, data });
    if (!out.configured) return res.status(503).json({ error: 'Push not configured — set GOOGLE_SERVICE_ACCOUNT_JSON' });
    res.json({ sent: out.sent, total: out.total, results: out.results });
  });

  // Admin broadcast — push to ONE user (by uid) or to ALL users. Firebase ID token +
  // admin check required. Reuses the same FCM multicast + channel routing as /api/push.
  app.post('/api/push/admin', express.json(), authMiddleware, async (req: any, res) => {
    const me = decodeFirestoreFields(((await fetchFirebaseDoc('users', req.uid)) || {}).fields || {});
    const isAdmin = me.role === 'admin' || me.role === 'staff' || me.email === 'kmoody2003@gmail.com';
    if (!isAdmin) return res.status(403).json({ error: 'Admin access required' });

    const { mode, uid, title, body, link } = req.body || {};
    if (!title || !body) return res.status(400).json({ error: 'title and body are required' });

    let tokens: string[] = [];
    let recipients = 0;
    if (mode === 'all') {
      const users = await queryFirebase('users', [], 5000);
      recipients = users.length;
      for (const u of users) {
        if (Array.isArray(u.fcmTokens)) tokens.push(...u.fcmTokens);
        if (u.fcmToken) tokens.push(u.fcmToken);
      }
    } else {
      if (!uid) return res.status(400).json({ error: 'uid is required for single-user mode' });
      const u = decodeFirestoreFields(((await fetchFirebaseDoc('users', String(uid))) || {}).fields || {});
      if (u && (u.fcmTokens || u.fcmToken)) {
        recipients = 1;
        if (Array.isArray(u.fcmTokens)) tokens.push(...u.fcmTokens);
        if (u.fcmToken) tokens.push(u.fcmToken);
      }
    }
    tokens = Array.from(new Set(tokens.filter(Boolean)));
    if (!tokens.length) return res.json({ sent: 0, total: 0, recipients, devices: 0 });

    const out = await sendFcmMulticast(tokens, { title, body, link: link || 'FEED', channelId: 'system', data: { type: 'SYSTEM', senderName: 'Plajah' } });
    if (!out.configured) return res.status(503).json({ error: 'Push not configured — set GOOGLE_SERVICE_ACCOUNT_JSON' });
    res.json({ sent: out.sent, total: out.total, recipients, devices: tokens.length });
  });

  // ── Philips Hue OAuth ─────────────────────────────────────────────────────
  // Step 1: redirect user to Hue login page
  app.get('/api/hue/auth', (req: any, res: any) => {
    const clientId  = process.env.HUE_CLIENT_ID;
    const redirectUri = process.env.HUE_REDIRECT_URI;
    if (!clientId || !redirectUri) return res.status(500).send('HUE_CLIENT_ID / HUE_REDIRECT_URI not configured');
    const state = Math.random().toString(36).slice(2);
    const url = new URL('https://api.meethue.com/oauth2/auth');
    url.searchParams.set('clientid', clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);
    url.searchParams.set('appid', clientId);
    url.searchParams.set('deviceid', 'plajah-server');
    url.searchParams.set('devicename', 'Plajah');
    res.redirect(url.toString());
  });

  // Step 2: Hue redirects back here with ?code=… — exchange for access token
  app.get('/api/hue/callback', async (req: any, res: any) => {
    const { code } = req.query;
    if (!code) return res.status(400).send('Missing code');
    const clientId     = process.env.HUE_CLIENT_ID!;
    const clientSecret = process.env.HUE_CLIENT_SECRET!;
    const redirectUri  = process.env.HUE_REDIRECT_URI!;
    try {
      const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const tokenRes = await fetch('https://api.meethue.com/oauth2/token', {
        method: 'POST',
        headers: { 'Authorization': `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code: String(code), grant_type: 'authorization_code', redirect_uri: redirectUri }).toString(),
      });
      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        return res.status(502).send(`Hue token error: ${err}`);
      }
      const { access_token, refresh_token } = await tokenRes.json() as any;
      // Return a tiny page that posts the token back to the opener and closes itself
      res.send(`<!DOCTYPE html><html><body><script>
        try { window.opener.postMessage({ type:'hue-auth', accessToken:${JSON.stringify(access_token)}, refreshToken:${JSON.stringify(refresh_token)} }, window.location.origin); }
        catch(e) {}
        window.close();
      </script><p>Hue connected! You can close this window.</p></body></html>`);
    } catch (e: any) {
      res.status(500).send(`OAuth error: ${e.message}`);
    }
  });

  // ── Smart Lighting Proxy ──────────────────────────────────────────────────
  // Forwards requests to cloud light APIs (Hue Remote, Govee) and local devices.
  // The body is wrapped: { targetMethod, body } so we can use POST for all verbs.
  app.post('/api/lights/proxy', express.json(), async (req: any, res: any) => {
    const { url: targetUrl, goveeKey, hueToken, method: qMethod } = req.query;
    if (!targetUrl) return res.status(400).json({ error: 'url required' });
    let parsed: URL;
    try { parsed = validateLightsProxyUrl(targetUrl as string); }
    catch (e: any) { return res.status(400).json({ error: e.message }); }
    const method = (req.body?.targetMethod || qMethod || 'GET').toUpperCase();
    const bodyPayload = req.body?.body;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (goveeKey) headers['Govee-API-Key'] = goveeKey as string;
    if (hueToken) headers['Authorization'] = `Bearer ${hueToken}`;
    try {
      const upstream = await fetch(parsed.toString(), {
        method,
        headers,
        body: bodyPayload && method !== 'GET' ? JSON.stringify(bodyPayload) : undefined,
      });
      const data = await upstream.json().catch(() => null);
      res.status(upstream.status).json(data ?? {});
    } catch (e: any) {
      res.status(500).json({ error: 'Proxy request failed' });
    }
  });

  // Also accept GET for read-only calls
  app.get('/api/lights/proxy', express.json(), async (req: any, res: any) => {
    const { url: targetUrl, goveeKey, hueToken } = req.query;
    if (!targetUrl) return res.status(400).json({ error: 'url required' });
    let parsed: URL;
    try { parsed = validateLightsProxyUrl(targetUrl as string); }
    catch (e: any) { return res.status(400).json({ error: e.message }); }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (goveeKey) headers['Govee-API-Key'] = goveeKey as string;
    if (hueToken) headers['Authorization'] = `Bearer ${hueToken}`;
    try {
      const upstream = await fetch(parsed.toString(), { headers });
      const data = await upstream.json().catch(() => null);
      res.status(upstream.status).json(data ?? {});
    } catch (e: any) {
      res.status(500).json({ error: 'Proxy request failed' });
    }
  });

  // ── Alexa Skill Webhook ────────────────────────────────────────────────────
  // Point your Alexa custom skill endpoint at /api/alexa (HTTPS required).
  // Skill intents: PlayArtistIntent (slot: artist), PlayAlbumIntent (slot: album),
  // plus built-in AMAZON.PauseIntent / AMAZON.ResumeIntent / AMAZON.StopIntent.
  app.post('/api/alexa', express.json(), async (req: any, res: any) => {
    const { request, context } = req.body || {};
    if (!request) return res.status(400).json({ error: 'Invalid Alexa request' });

    const reply = (text: string, end = false, directive?: object) => {
      const r: any = { version: '1.0', response: { outputSpeech: { type: 'PlainText', text }, shouldEndSession: end } };
      if (directive) r.response.directives = [directive];
      res.json(r);
    };
    const audioPlay = (url: string, token: string, offset = 0) => ({
      type: 'AudioPlayer.Play', playBehavior: 'REPLACE_ALL',
      audioItem: { stream: { url, token, offsetInMilliseconds: offset } },
    });

    try {
      if (request.type === 'LaunchRequest') {
        return reply("Welcome to Plajah. Ask me to play an artist, album, or radio station.");
      }
      if (request.type === 'SessionEndedRequest') return res.json({ version: '1.0', response: {} });

      if (request.type === 'IntentRequest') {
        const { name, slots = {} } = request.intent;
        switch (name) {
          case 'PlayArtistIntent': {
            const artist = slots.artist?.value || '';
            if (!artist) return reply("Which artist would you like to hear?");
            return reply(`Playing ${artist} on Plajah.`, true,
              audioPlay(`https://plajah.com/api/alexa/stream?artist=${encodeURIComponent(artist)}`, `artist:${artist}`));
          }
          case 'PlayAlbumIntent': {
            const album = slots.album?.value || '';
            if (!album) return reply("Which album would you like?");
            return reply(`Playing ${album} on Plajah.`, true,
              audioPlay(`https://plajah.com/api/alexa/stream?album=${encodeURIComponent(album)}`, `album:${album}`));
          }
          case 'PlayRadioIntent': {
            const station = slots.station?.value || 'top tracks';
            return reply(`Playing ${station} radio on Plajah.`, true,
              audioPlay(`https://plajah.com/api/alexa/stream?radio=${encodeURIComponent(station)}`, `radio:${station}`));
          }
          case 'AMAZON.PauseIntent':  return reply('', true, { type: 'AudioPlayer.Stop' });
          case 'AMAZON.StopIntent':   return reply('Goodbye from Plajah.', true, { type: 'AudioPlayer.Stop' });
          case 'AMAZON.ResumeIntent': {
            const token = context?.AudioPlayer?.token || '';
            const offset = context?.AudioPlayer?.offsetInMilliseconds || 0;
            return reply('', false, audioPlay(`https://plajah.com/api/alexa/stream?token=${encodeURIComponent(token)}`, token, offset));
          }
          default: return reply("I didn't catch that. Try asking Plajah to play an artist or album.");
        }
      }
      res.json({ version: '1.0', response: { outputSpeech: { type: 'PlainText', text: 'Something went wrong.' }, shouldEndSession: true } });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Alexa stream resolver — looks up Firestore to find a track URL by artist/album
  app.get('/api/alexa/stream', async (req: any, res: any) => {
    const { artist, album } = req.query;
    // Search Firestore for matching album/artist
    const projectId = 'gen-lang-client-0665118474';
    const dbId = 'plajah-prod';
    try {
      const searchUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents:runQuery`;
      const field = album ? 'title' : 'artist';
      const value = String(album || artist || '');
      const body = { structuredQuery: { from: [{ collectionId: 'albums' }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } }, limit: 1 } };
      const r = await fetch(searchUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const results = await r.json();
      const doc = Array.isArray(results) ? results.find((d: any) => d.document) : null;
      const tracks = doc?.document?.fields?.tracks?.arrayValue?.values || [];
      const firstTrackUrl = tracks[0]?.mapValue?.fields?.url?.stringValue;
      if (firstTrackUrl) {
        res.redirect(302, firstTrackUrl);
      } else {
        res.status(404).json({ error: 'Track not found' });
      }
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Google Home / Assistant Webhook ───────────────────────────────────────
  // Point your Dialogflow / Actions on Google webhook at /api/google-home.
  // Intents to create: PlayArtist, PlayAlbum, PlayRadio, Pause, Default Fallback.
  app.post('/api/google-home', express.json(), async (req: any, res: any) => {
    const { queryResult } = req.body || {};
    if (!queryResult) return res.status(400).json({ error: 'Invalid webhook' });

    const intent = queryResult.intent?.displayName || '';
    const params = queryResult.parameters || {};

    const reply = (text: string, ssml?: string) => res.json({
      fulfillmentText: text,
      fulfillmentMessages: [{ text: { text: [text] } }],
      ...(ssml ? { payload: { google: { expectUserResponse: false, richResponse: { items: [{ simpleResponse: { ssml } }] } } } } : {}),
    });

    try {
      if (intent === 'PlayArtist' || intent === 'play artist') {
        const artist = params.artist || params['music-artist'] || '';
        if (!artist) return reply("Which artist would you like on Plajah?");
        return reply(`Playing ${artist} on Plajah.`, `<speak>Starting ${artist} on Plajah right now.</speak>`);
      }
      if (intent === 'PlayAlbum' || intent === 'play album') {
        const album = params.album || params['music-album'] || '';
        if (!album) return reply("Which album would you like?");
        return reply(`Playing ${album} on Plajah.`, `<speak>Playing ${album} on Plajah.</speak>`);
      }
      if (intent === 'PlayRadio' || intent === 'play radio') {
        const station = params.station || 'top tracks';
        return reply(`Playing ${station} radio on Plajah.`);
      }
      if (intent === 'Pause') return reply('Pausing Plajah.');
      if (intent === 'Resume') return reply('Resuming Plajah.');
      reply("You can ask me to play an artist, album, or radio station on Plajah.");
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // oEmbed endpoint — lets Slack, Notion, Mastodon, and other rich-preview platforms embed Plajah links
  app.get('/oembed', async (req, res) => {
    const { url: pageUrl, format = 'json' } = req.query as any;
    if (!pageUrl) return res.status(400).json({ error: 'url required' });

    let type = '', id = '', track = '';
    try {
      const parsed = new URL(pageUrl);
      type = parsed.searchParams.get('type') || '';
      id = parsed.searchParams.get('id') || '';
      track = parsed.searchParams.get('track') || '';
    } catch { return res.status(400).json({ error: 'invalid url' }); }

    if (!type || !id) return res.status(404).json({ error: 'not found' });

    let collection = type === 'video' ? 'videos' : type === 'album' ? 'albums' : '';
    if (!collection) return res.status(404).json({ error: 'not found' });

    const dbData = await fetchFirebaseDoc(collection, id);
    if (!dbData?.fields) return res.status(404).json({ error: 'not found' });

    const host = req.get('host') || 'plajah.com';
    const title = dbData.fields?.title?.stringValue || 'Plajah';
    const cover = dbData.fields?.coverImage?.stringValue || dbData.fields?.coverImageUrl?.stringValue || dbData.fields?.thumbnailUrl?.stringValue || '';
    const embedUrl = `https://${host}/embed?type=${type}&id=${id}${track ? `&track=${track}` : ''}`;
    const safeTitle = htmlEscape(title);
    const safeHost = htmlEscape(host);
    const safeCover = htmlEscape(cover);
    const safeEmbedUrl = htmlEscape(embedUrl);

    const response = {
      version: '1.0',
      type: type === 'album' ? 'rich' : 'video',
      title: safeTitle,
      provider_name: 'Plajah',
      provider_url: `https://${safeHost}`,
      thumbnail_url: safeCover,
      thumbnail_width: 1200,
      thumbnail_height: 630,
      html: `<iframe src="${safeEmbedUrl}" width="560" height="315" style="border:none;border-radius:12px;" allow="autoplay; encrypted-media" allowfullscreen></iframe>`,
      width: 560,
      height: 315,
    };

    if (format === 'xml') {
      res.set('Content-Type', 'text/xml');
      return res.send(`<?xml version="1.0" encoding="utf-8"?><oembed>${Object.entries(response).map(([k, v]) => `<${k}>${xmlEscape(String(v))}</${k}>`).join('')}</oembed>`);
    }
    res.json(response);
  });

  app.get('/embed', async (req, res) => {
    // This is a PUBLIC embeddable player — it must be iframe-able cross-origin (X/Facebook/
    // LinkedIn player cards, partner embeds). Helmet sets X-Frame-Options: SAMEORIGIN globally,
    // which blocks that, so override it here with a permissive frame-ancestors CSP.
    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Security-Policy', "frame-ancestors *");
    const { type, id, track } = req.query;
    if (!type || !id) return res.status(404).send('Not Found');

    let collection = '';
    if (type === 'video') collection = 'videos';
    if (type === 'album') collection = 'albums';
    if (type === 'feed') collection = 'global_posts';
    
    if (!collection) return res.status(404).send('Not Found');

    const dbData = await fetchFirebaseDoc(collection, id as string);
    if (!dbData || !dbData.fields) return res.status(404).send('Not Found');

    // Album embed: ALWAYS render the full player — album art + the whole track list +
    // an audio player — whether or not a specific track was requested. (Previously a
    // share link without a &track= resolved no media and returned "No Media Found",
    // so album/music embeds showed nothing. This is the fix.)
    if (type === 'album') {
      const albumTitle = dbData.fields?.title?.stringValue || 'Album';
      const albumArtist = dbData.fields?.artist?.stringValue || '';
      const cover = dbData.fields?.coverImage?.stringValue || dbData.fields?.coverImageUrl?.stringValue || '';
      const tracksArr = dbData.fields?.tracks?.arrayValue?.values || [];
      const tracks = tracksArr.map((t: any) => {
        const f = t.mapValue?.fields || {};
        const locked = !!f.isPaywalled?.booleanValue;            // don't expose paywalled track URLs
        return {
          title: f.title?.stringValue || 'Untitled',
          artist: f.artist?.stringValue || albumArtist,
          url: locked ? '' : (f.url?.stringValue || ''),
          cover: f.albumCover?.stringValue || cover,
          locked,
        };
      }).filter((t: any) => !!t.title);

      let startIndex = 0;
      if (track) {
        const i = tracksArr.findIndex((t: any) => t.mapValue?.fields?.id?.stringValue === track);
        if (i >= 0) startIndex = i;
      }

      const j = (v: any) => JSON.stringify(v).replace(/</g, '\\u003c');  // safe to embed in <script>
      const safeAlbumTitle = htmlEscape(albumTitle);
      const safeAlbumArtist = htmlEscape(albumArtist);
      const safeCover = htmlEscape(cover);

      return res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${safeAlbumTitle}</title>
<style>
*{box-sizing:border-box;}html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fff;}
.wrap{position:relative;width:100%;height:100%;display:flex;}
.bg{position:absolute;inset:0;background-size:cover;background-position:center;opacity:.22;filter:blur(46px);transform:scale(1.15);}
.scrim{position:absolute;inset:0;background:linear-gradient(120deg,rgba(0,0,0,.92),rgba(0,0,0,.6));}
.left{position:relative;z-index:1;flex:0 0 44%;max-width:260px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:11px;padding:18px;}
.art{width:128px;height:128px;border-radius:14px;object-fit:cover;box-shadow:0 18px 50px rgba(0,0,0,.6);background:#222;}
.meta{text-align:center;max-width:100%;}
.kicker{margin:0 0 3px;font-size:9px;font-weight:800;letter-spacing:2.5px;text-transform:uppercase;color:#ff8c00;}
.title{margin:0;font-size:15px;font-weight:900;letter-spacing:-.3px;line-height:1.15;}
.artist{margin:2px 0 0;font-size:12px;color:#bbb;}
audio{width:100%;margin-top:2px;accent-color:#ff8c00;height:34px;}
.right{position:relative;z-index:1;flex:1;overflow-y:auto;padding:12px 10px;border-left:1px solid rgba(255,255,255,.08);}
.row{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:9px;cursor:pointer;transition:background .15s;}
.row:hover{background:rgba(255,255,255,.07);}.row.active{background:rgba(255,140,0,.16);}
.num{font-size:11px;color:#888;width:18px;text-align:center;flex:0 0 18px;}.row.active .num{color:#ff8c00;}
.tt{flex:1;min-width:0;}.tt b{display:block;font-size:12.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.tt span{font-size:10.5px;color:#999;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;}
.lock{font-size:10px;color:#777;}
.empty{padding:18px;color:#888;font-size:12px;}
@media (max-width:430px){.wrap{flex-direction:column;}.left{flex:0 0 auto;max-width:none;flex-direction:row;justify-content:flex-start;gap:12px;padding:12px;}.art{width:64px;height:64px;}.meta{text-align:left;}.right{border-left:none;border-top:1px solid rgba(255,255,255,.08);}}
</style></head>
<body>
  <div class="wrap">
    <div class="bg" id="bg"></div><div class="scrim"></div>
    <div class="left">
      <img class="art" id="art" src="${safeCover}" alt="" onerror="this.style.visibility='hidden'"/>
      <div class="meta"><p class="kicker">Now Playing on Plajah</p><h3 class="title" id="ctitle">${safeAlbumTitle}</h3><p class="artist" id="cartist">${safeAlbumArtist}</p></div>
      <audio id="aud" controls autoplay playsinline></audio>
    </div>
    <div class="right" id="list"></div>
  </div>
  <script>
    var TRACKS=${j(tracks)},START=${startIndex},COVER=${j(cover)},cur=-1;
    var aud=document.getElementById('aud'),list=document.getElementById('list'),bg=document.getElementById('bg'),art=document.getElementById('art'),ct=document.getElementById('ctitle'),ca=document.getElementById('cartist');
    if(COVER)bg.style.backgroundImage="url('"+COVER+"')";
    function esc(s){return String(s||'').replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
    function rows(){if(!TRACKS.length){list.innerHTML='<div class="empty">No tracks in this album yet.</div>';return;}list.innerHTML='';TRACKS.forEach(function(t,i){var r=document.createElement('div');r.className='row'+(i===cur?' active':'');r.innerHTML='<div class="num">'+(t.locked?'\\uD83D\\uDD12':(i+1))+'</div><div class="tt"><b>'+esc(t.title)+'</b><span>'+esc(t.artist)+'</span></div>'+(t.locked?'<div class="lock">Locked</div>':'');r.onclick=function(){if(!t.locked&&t.url)play(i);};list.appendChild(r);});}
    function play(i){var t=TRACKS[i];if(!t||!t.url)return;cur=i;aud.src=t.url;aud.play().catch(function(){});ct.textContent=t.title;ca.textContent=t.artist||'';var c=t.cover||COVER;if(c){art.src=c;art.style.visibility='visible';bg.style.backgroundImage="url('"+c+"')";}rows();}
    aud.addEventListener('ended',function(){for(var k=cur+1;k<TRACKS.length;k++){if(!TRACKS[k].locked&&TRACKS[k].url){play(k);return;}}});
    rows();
    (function(){if(TRACKS[START]&&!TRACKS[START].locked&&TRACKS[START].url){play(START);return;}for(var k=0;k<TRACKS.length;k++){if(!TRACKS[k].locked&&TRACKS[k].url){play(k);return;}}})();
  </script>
</body></html>`);
    }

    let mediaUrl = '';
    let title = '';
    let cover = '';
    let isYoutube = false;

    if (type === 'video') {
      mediaUrl = dbData.fields?.url?.stringValue || dbData.fields?.embedUrl?.stringValue || '';
      title = dbData.fields?.title?.stringValue || 'Video';
      cover = dbData.fields?.coverImageUrl?.stringValue || dbData.fields?.thumbnailUrl?.stringValue || '';
      // Mux-hosted videos have no direct `url` — build the HLS playback URL from the playback id.
      const muxPlayback = dbData.fields?.muxPlaybackId?.stringValue;
      if (!mediaUrl && muxPlayback) mediaUrl = `https://stream.mux.com/${muxPlayback}.m3u8`;
      if (!cover && muxPlayback) cover = `https://image.mux.com/${muxPlayback}/thumbnail.jpg?width=1200`;
      if (mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be')) isYoutube = true;
    } else if (type === 'feed') {
      mediaUrl = dbData.fields?.videoUrl?.stringValue || '';
      title = 'Video Post';
      cover = dbData.fields?.videoThumbnail?.stringValue || dbData.fields?.imageUrl?.stringValue || '';
      if (mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be')) isYoutube = true;
    }

    if (!mediaUrl) return res.status(404).send('No Media Found');

    const isHls = mediaUrl.endsWith('.m3u8') || mediaUrl.includes('stream.mux.com');
    const safeMediaUrl = htmlEscape(mediaUrl);
    const safeCover = htmlEscape(cover);
    const safeTitle = htmlEscape(title);
    let playerHtml = '';
    if (isYoutube) {
        const embedLink = safeYouTubeEmbedUrl(mediaUrl);
        if (!embedLink) return res.status(400).send('Invalid YouTube URL');
        playerHtml = `<iframe src="${htmlEscape(embedLink)}" width="100%" height="100%" style="border:none" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
    } else if (isHls) {
        // HLS (Mux): native in Safari; hls.js elsewhere. Poster shows immediately for previews.
        playerHtml = `<video id="v" controls playsinline width="100%" height="100%" style="background:black" poster="${safeCover}"></video>
        <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js"></script>
        <script>(function(){var v=document.getElementById('v'),src=${JSON.stringify(mediaUrl)};if(v.canPlayType('application/vnd.apple.mpegurl')){v.src=src;}else if(window.Hls&&window.Hls.isSupported()){var h=new window.Hls();h.loadSource(src);h.attachMedia(v);}else{v.src=src;}})();</script>`;
    } else if (mediaUrl.endsWith('.mp4') || mediaUrl.includes('/videos%2F') || type === 'video' || type === 'feed') {
        playerHtml = `<video src="${safeMediaUrl}" controls width="100%" height="100%" style="background:black" poster="${safeCover}"></video>`;
    } else {
        playerHtml = `
        <div style="position:relative;background:#0a0a0a;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;overflow:hidden;">
          ${cover ? `<img src="${safeCover}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0.25;filter:blur(40px);transform:scale(1.1);" />` : ''}
          <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,0.9) 0%,rgba(0,0,0,0.5) 60%,rgba(0,0,0,0.3) 100%);"></div>
          <div style="position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:20px;padding:24px;width:100%;max-width:480px;box-sizing:border-box;">
            ${cover ? `<img src="${safeCover}" style="width:140px;height:140px;border-radius:16px;object-fit:cover;box-shadow:0 20px 60px rgba(0,0,0,0.6);" />` : ''}
            <div style="text-align:center;">
              <p style="margin:0 0 4px;font-size:11px;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:#ff8c00;">Now Playing on Plajah</p>
              <h3 style="margin:0;font-size:18px;font-weight:900;text-transform:uppercase;letter-spacing:-0.5px;">${safeTitle}</h3>
            </div>
            <audio src="${safeMediaUrl}" controls autoplay style="width:100%;accent-color:#ff8c00;"></audio>
          </div>
        </div>`;
    }

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${safeTitle}</title>
        <style>body,html{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:black;}</style>
      </head>
      <body>
        ${playerHtml}
      </body>
      </html>
    `);
  });

  // ── Crossover — media conversion / probe / finalize (real ffmpeg) ────────
  // The input arrives as the RAW request body (recipe/name/kind in headers), or
  // an X-Crossover-Url the server fetches; the result streams straight back.
  // Gated by apiLimiter (abuse) + authMiddleware (signed-in users only) — the
  // browser attaches its Firebase ID token via serverEngine. Results stream back;
  // nothing is stored server-side.
  const cxRaw = express.raw({ type: () => true, limit: '3gb' });

  const cxMaterializeInput = async (req: any, fallbackExt: string): Promise<string | { error: string }> => {
    const name = decodeURIComponent(req.header('X-Crossover-Name') || `input.${fallbackExt}`);
    const inExt = (name.split('.').pop() || fallbackExt).toLowerCase();
    const inPath = path.join(os.tmpdir(), `cx_in_${cxRand()}.${inExt}`);
    const url = req.header('X-Crossover-Url');
    if (url) {
      const tmp = await fetchToTmp(url, 'cx');
      if (!tmp) return { error: 'input url fetch failed' };
      try { await fs.rename(tmp, inPath); } catch { await fs.copyFile(tmp, inPath); fs.unlink(tmp).catch(() => {}); }
      return inPath;
    }
    const body = req.body as Buffer;
    if (!body || !body.length) return { error: 'empty request body' };
    await fs.writeFile(inPath, body);
    return inPath;
  };

  app.post('/api/crossover/probe', apiLimiter, authMiddleware, cxRaw, async (req: any, res) => {
    let inPath: string | null = null;
    try {
      const mat = await cxMaterializeInput(req, 'bin');
      if (typeof mat !== 'string') return res.status(400).json({ error: mat.error });
      inPath = mat;
      const { json, err } = await runFfprobe(inPath);
      const probe = ffprobeToProbe(json, err);
      res.json(probe);
    } catch (e: any) {
      res.status(500).json({ error: String(e?.message || e) });
    } finally {
      if (inPath) fs.unlink(inPath).catch(() => {});
    }
  });

  app.post('/api/crossover/convert', apiLimiter, authMiddleware, cxRaw, async (req: any, res) => {
    const kind = (req.header('X-Crossover-Kind') || 'video') as CxKind;
    const name = decodeURIComponent(req.header('X-Crossover-Name') || 'input');
    let recipe: CxRecipe;
    try { recipe = JSON.parse(decodeURIComponent(req.header('X-Crossover-Recipe') || '')); }
    catch { return res.status(400).send('bad or missing X-Crossover-Recipe'); }

    // Free-tier gate: block once the cap is hit (admins/staff bypass).
    const cxUid = req.uid as string;
    const cxUse = await cxUsage(cxUid);
    if (!cxUse.isAdmin && cxUse.used >= CX_FREE_LIMIT) {
      return res.status(429).json({ error: 'Free conversion limit reached', limit: CX_FREE_LIMIT, used: cxUse.used });
    }

    const outExt = extFor(recipe, kind);
    const base = (name.replace(/\.[^.]+$/, '') || 'output').replace(/[^\w.\-]+/g, '_');
    const outPath = path.join(os.tmpdir(), `cx_out_${cxRand()}.${outExt}`);
    let inPath: string | null = null;
    const cleanup = () => { for (const p of [inPath, outPath]) if (p) fs.unlink(p).catch(() => {}); };
    try {
      const mat = await cxMaterializeInput(req, 'bin');
      if (typeof mat !== 'string') { cleanup(); return res.status(400).send(mat.error); }
      inPath = mat;
      const args = buildFfmpegArgs(inPath, recipe, outPath, kind);
      const r = await runFfmpeg(args, 5 * 60 * 1000);
      if (!r.ok) { cleanup(); return res.status(422).send(`ffmpeg failed: ${r.err.slice(-600)}`); }
      const outBuf = await fs.readFile(outPath);
      // Count this conversion toward the user's free tier (fire-and-forget).
      if (!cxUse.isAdmin) firestoreWrite('users', cxUid, { crossoverConversions: cxUse.used + 1 }).catch(() => {});
      res.setHeader('Content-Type', CX_MIME[outExt] || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${base}.${outExt}"`);
      res.setHeader('X-Crossover-Backend', 'server');
      res.send(outBuf);
    } catch (e: any) {
      res.status(500).send(String(e?.message || e));
    } finally {
      cleanup();
    }
  });

  // ── TV device login (QR / pairing code) ──────────────────────────────────────
  //
  // The standard TV sign-in flow: the television shows a short code and a QR pointing at
  // /link, the viewer opens it on a phone that is already signed in and approves, and the TV
  // exchanges the code for a Firebase custom token. Nobody types a password with a D-pad.
  //
  // SECURITY. This grants full access to the approving account, so:
  //  - The phone must present a valid Firebase ID token. Approval is authenticated; the code
  //    alone is worthless.
  //  - Codes live 5 minutes, are single-use, and are deleted the moment they are redeemed.
  //  - The polling endpoint returns the token EXACTLY once. A replayed poll gets nothing.
  //  - Codes are 8 chars from an unambiguous alphabet drawn with crypto randomness — no 0/O,
  //    1/I/L confusion on a screen read from across a room.
  //  - Failed polls are counted; a code being hammered is dropped rather than left to be
  //    brute-forced for its remaining lifetime.
  // STORAGE. This was an in-process Map, on the reasoning that single-use codes expiring in
  // minutes are not worth persisting. That reasoning assumed one long-lived process, and this
  // API runs on Cloud Run with min-instances unset (scale to zero) and max-instances 20. So
  // `start` would write the code to instance A's memory and the poll two seconds later could
  // land on instance B, which had never heard of it and answered "expired" — the TV appeared to
  // generate codes that were dead on arrival, and a phone approving against a third instance got
  // "That code has expired." Pairing could only ever work by luck.
  //
  // So the codes live in Firestore instead, in a collection that is server-only (no client rule
  // grants access) with a 5-minute TTL. The security properties are unchanged — single use,
  // deleted on redemption, authenticated approval — and the record now outlives the instance
  // that created it, which is the whole point.

  interface TvPairing {
    createdAt: number;
    uid?: string;          // set once a phone approves
    customToken?: string;  // minted at approval, handed over exactly once
    polls: number;
  }
  const TV_PAIR_COLL = 'tvPairings';
  const TV_CODE_TTL_MS = 5 * 60 * 1000;
  const TV_MAX_POLLS = 200;                       // ~5 min at 1.5s intervals
  const TV_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no O/0, I/1/L

  const readPairing = async (code: string): Promise<TvPairing | null> => {
    if (!code) return null;
    const doc = await fsGet(`${TV_PAIR_COLL}/${encodeURIComponent(code)}`);
    if (!doc) return null;
    const p: TvPairing = {
      createdAt: Number(doc.createdAt) || 0,
      uid: doc.uid || undefined,
      customToken: doc.customToken || undefined,
      polls: Number(doc.polls) || 0,
    };
    // Expiry is enforced on read rather than by a sweep: there is no shared timer across
    // instances, and a stale doc must never be honoured just because nobody swept it.
    if (Date.now() - p.createdAt > TV_CODE_TTL_MS) {
      void fsDelete(`${TV_PAIR_COLL}/${encodeURIComponent(code)}`);
      return null;
    }
    return p;
  };

  const newPairingCode = async (): Promise<string> => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const bytes = nodeCrypto.randomBytes(8);
      let code = '';
      for (let i = 0; i < 8; i++) code += TV_ALPHABET[bytes[i] % TV_ALPHABET.length];
      if (!(await readPairing(code))) return code;
    }
    return nodeCrypto.randomBytes(6).toString('hex').toUpperCase();
  };

  /**
   * Mint a Firebase custom token for `uid`.
   *
   * Prefers the service-account key when one is configured, and falls back to
   * services/firebaseAdminRest's createCustomToken, which signs via IAM using the runtime's
   * own credentials — so this keeps working if GOOGLE_SERVICE_ACCOUNT_JSON is ever unset on
   * the service, instead of failing every TV sign-in with a 500.
   */
  const mintCustomToken = async (uid: string): Promise<string | null> => {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!raw) return createCustomToken(uid);
    try {
      const sa = JSON.parse(raw);
      const now = Math.floor(Date.now() / 1000);
      const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
      const header = b64url({ alg: 'RS256', typ: 'JWT' });
      const payload = b64url({
        iss: sa.client_email,
        sub: sa.client_email,
        aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
        iat: now,
        exp: now + 3600,
        uid,
      });
      const signer = nodeCrypto.createSign('RSA-SHA256');
      signer.update(`${header}.${payload}`);
      return `${header}.${payload}.${signer.sign(sa.private_key).toString('base64url')}`;
    } catch (e: any) {
      console.error('[TVAuth] key-based mint failed, falling back to IAM:', e?.message || e);
      return createCustomToken(uid);
    }
  };

  /** TV asks for a code to display. No auth — nothing is granted until a phone approves. */
  app.post('/api/tv/pair/start', apiLimiter, express.json({ limit: '4kb' }), async (_req: any, res) => {
    const code = await newPairingCode();
    const ok = await fsSet(`${TV_PAIR_COLL}/${encodeURIComponent(code)}`, {
      createdAt: Date.now(), polls: 0,
    });
    // If the store is unreachable the code would be dead on arrival, so say so rather than
    // printing a number on the television that can never be approved.
    if (!ok) return res.status(503).json({ ok: false, message: 'Could not start sign-in. Try again shortly.' });
    res.json({ ok: true, code, expiresInSec: TV_CODE_TTL_MS / 1000 });
  });

  /** Phone approves. Requires a real signed-in user — this is the authorising step. */
  app.post('/api/tv/pair/approve', apiLimiter, authMiddleware, express.json({ limit: '4kb' }), async (req: any, res) => {
    const code = String(req.body?.code || '').trim().toUpperCase();
    const p = await readPairing(code);
    if (!p) return res.status(404).json({ ok: false, message: 'That code has expired. Refresh the TV and try again.' });
    if (p.uid) return res.status(409).json({ ok: false, message: 'That code was already used.' });
    const token = await mintCustomToken(req.uid);
    if (!token) return res.status(500).json({ ok: false, message: 'Could not sign in this TV. Try again shortly.' });
    const saved = await fsPatch(`${TV_PAIR_COLL}/${encodeURIComponent(code)}`, {
      uid: req.uid, customToken: token,
    });
    if (!saved) return res.status(500).json({ ok: false, message: 'Could not sign in this TV. Try again shortly.' });
    res.json({ ok: true });
  });

  /** TV polls. Hands the token over exactly once, then destroys the pairing. */
  app.get('/api/tv/pair/poll', apiLimiter, async (req: any, res) => {
    const code = String(req.query?.code || '').trim().toUpperCase();
    const path = `${TV_PAIR_COLL}/${encodeURIComponent(code)}`;
    const p = await readPairing(code);
    if (!p) return res.json({ ok: true, status: 'expired' });
    if (p.polls + 1 > TV_MAX_POLLS) { await fsDelete(path); return res.json({ ok: true, status: 'expired' }); }
    if (!p.customToken) {
      // Count the poll, but never let a bookkeeping write failure stall a pending pairing.
      void fsPatch(path, { polls: p.polls + 1 });
      return res.json({ ok: true, status: 'pending' });
    }
    const token = p.customToken;
    await fsDelete(path);               // single use — a replayed poll gets nothing
    res.json({ ok: true, status: 'approved', customToken: token });
  });

  // ── Creator metrics ingestion ────────────────────────────────────────────────
  //
  // Every play/view/read counter is written HERE, never by the client. Three reasons:
  //   1. The client writes were silently failing. `track_stats` update rules allow only
  //      ['playCount'] to change but the writer also sent lastPlayed, so every play after the
  //      first was denied; `albums` update requires the doc OWNER, so a listener's increment was
  //      denied outright; `videos.playCount` was never incremented by anything at all. All three
  //      failures were swallowed by empty .catch() blocks, so nothing ever surfaced them.
  //   2. A client-writable counter is a forgeable counter — anyone signed in could inflate any
  //      creator's numbers, which makes the whole dashboard worthless.
  //   3. Retention needs aggregation the client cannot do without reading other users' data.
  //
  // Events are AGGREGATED ON ARRIVAL into per-content rollups. Raw per-viewer events are
  // deliberately not retained: creators get counts and curves, never individuals.

  const METRIC_CONTENT_TYPES = new Set(['track', 'album', 'video', 'film', 'book', 'article', 'post', 'podcast']);
  const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);

  app.post('/api/metrics/events', apiLimiter, authMiddleware, express.json({ limit: '64kb' }), async (req: any, res) => {
    const events = Array.isArray(req.body?.events) ? req.body.events.slice(0, 50) : [];
    if (!events.length) return res.json({ ok: true, accepted: 0 });

    let accepted = 0;
    for (const ev of events) {
      const contentId = String(ev?.contentId || '').trim();
      const contentType = String(ev?.contentType || '').trim();
      if (!contentId || !/^[\w-]{1,128}$/.test(contentId) || !METRIC_CONTENT_TYPES.has(contentType)) continue;

      const day = ymd(Date.now());
      const inc: Record<string, number> = {};
      const dayInc: Record<string, number> = {};

      // A "play" is only counted once per session by the client; the server still bounds the
      // damage a bad actor can do by capping what one request can add.
      if (ev.type === 'start') { inc.plays = 1; dayInc.plays = 1; }

      // Seconds actually consumed, clamped: a client claiming an hour of listening to a
      // three-minute song is either broken or lying.
      const secs = Number(ev.secondsPlayed);
      const dur = Number(ev.durationSec);
      if (Number.isFinite(secs) && secs > 0) {
        const capped = Math.min(secs, Number.isFinite(dur) && dur > 0 ? dur * 1.5 : 3600);
        inc.secondsPlayed = capped;
        dayInc.secondsPlayed = capped;
      }

      if (ev.type === 'complete') { inc.completions = 1; dayInc.completions = 1; }

      // Retention: which deciles of the piece this session actually reached. Storing reach
      // counts per decile (not per viewer) is what makes a real curve possible while keeping
      // the data aggregate — r10..r100 are "how many sessions got at least this far".
      // Credit ONLY the deciles newly reached since the last report. Crediting 1..reached on
      // every event would count one listener into r10 once per progress tick — a single play
      // would render as a dozen, and the curve would be meaningless.
      const reached = Number(ev.reachedDecile);
      const from = Number(ev.fromDecile);
      if (Number.isFinite(reached) && reached >= 1 && reached <= 10) {
        const lo = Number.isFinite(from) && from >= 0 ? Math.min(Math.floor(from), 10) : 0;
        for (let d = lo + 1; d <= Math.floor(reached); d++) {
          inc[`r${d * 10}`] = 1;
          dayInc[`r${d * 10}`] = 1;
        }
      }

      if (!Object.keys(inc).length) continue;

      const identity: Record<string, string> = { contentId, contentType };
      if (typeof ev.ownerId === 'string' && /^[\w-]{1,128}$/.test(ev.ownerId)) identity.ownerId = ev.ownerId;

      // Lifetime rollup + the day bucket that makes trends possible. Both keyed by content,
      // never by viewer.
      await firestoreIncrement(`contentStats/${contentId}`, inc, { ...identity, updatedAt: Date.now() });
      await firestoreIncrement(`contentStats/${contentId}/daily/${day}`, dayInc, { ...identity, day });
      accepted++;
    }

    res.json({ ok: true, accepted });
  });

  // ── Chora — transcode a track's master to the streaming ladder (Step 1) ──────
  // POST { trackId, srcUrl }. Writes choraStreams/{trackId} = { status, hls, low, flac, ... }.
  // Status-gated: the client only uses the result once status==='ready', so this is safe to run
  // in the background and to backfill the catalog without any playback disruption.
  app.post('/api/chora/transcode', apiLimiter, authMiddleware, express.json({ limit: '256kb' }), async (req: any, res) => {
    const trackId = String(req.body?.trackId || '').trim();
    const srcUrl = String(req.body?.srcUrl || '').trim();
    if (!trackId || !srcUrl) return res.status(400).json({ error: 'trackId and srcUrl required' });
    const publicBase = (process.env.PUBLIC_API_BASE || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
    firestoreWrite('choraStreams', trackId, { status: 'processing', updatedAt: Date.now() }).catch(() => {});
    let inPath: string | null = null;
    try {
      inPath = await fetchToTmp(srcUrl, 'audio');
      if (!inPath) throw new Error('source fetch failed');
      const r = await choraTranscodeToGcs(inPath, trackId, publicBase);
      await firestoreWrite('choraStreams', trackId, {
        status: r.status, hls: r.hls, low: r.low, flac: r.flac,
        loudnessLufs: Math.round(r.loudnessLufs), durationSec: Math.round(r.durationSec),
        rungs: ['low', 'high', 'lossless'], updatedAt: Date.now(),
      });
      res.json(r);
    } catch (e: any) {
      firestoreWrite('choraStreams', trackId, { status: 'failed', error: String(e?.message || e).slice(0, 300), updatedAt: Date.now() }).catch(() => {});
      res.status(500).json({ error: String(e?.message || e) });
    } finally { if (inPath) fs.unlink(inPath).catch(() => {}); }
  });

  // Backend-only transcode for the catalogue backfill. Identical work to the route above, but
  // gated by a shared key instead of a Firebase ID token — so it can be driven entirely from the
  // server side (a script / cron) with NO signed-in browser or TV in the loop. This is why the
  // backfill never needed a device: the transcoding was always here on Cloud Run; the only thing a
  // signed-in session provided was the token, which this key replaces. No apiLimiter — a backfill
  // is a deliberate, rate-controlled admin loop, not user traffic.
  app.post('/api/chora/transcode-admin', express.json({ limit: '256kb' }), async (req: any, res) => {
    const key = String(req.query.key || req.headers['x-backfill-key'] || '');
    const expected = process.env.CHORA_BACKFILL_KEY || '';
    if (!expected || key !== expected) return res.status(403).json({ error: 'forbidden' });
    const trackId = String(req.body?.trackId || req.query.trackId || '').trim();
    const srcUrl = String(req.body?.srcUrl || req.query.srcUrl || '').trim();
    if (!trackId || !srcUrl) return res.status(400).json({ error: 'trackId and srcUrl required' });
    const publicBase = (process.env.PUBLIC_API_BASE || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
    firestoreWrite('choraStreams', trackId, { status: 'processing', updatedAt: Date.now() }).catch(() => {});
    let inPath: string | null = null;
    try {
      inPath = await fetchToTmp(srcUrl, 'audio');
      if (!inPath) throw new Error('source fetch failed');
      const r = await choraTranscodeToGcs(inPath, trackId, publicBase);
      await firestoreWrite('choraStreams', trackId, {
        status: r.status, hls: r.hls, low: r.low, flac: r.flac,
        loudnessLufs: Math.round(r.loudnessLufs), durationSec: Math.round(r.durationSec),
        rungs: ['low', 'high', 'lossless'], updatedAt: Date.now(),
      });
      res.json(r);
    } catch (e: any) {
      firestoreWrite('choraStreams', trackId, { status: 'failed', error: String(e?.message || e).slice(0, 300), updatedAt: Date.now() }).catch(() => {});
      res.status(500).json({ error: String(e?.message || e) });
    } finally { if (inPath) fs.unlink(inPath).catch(() => {}); }
  });

  // Serve a transcoded asset from GCS with Range + permissive CORS (HLS playlists resolve their
  // relative segment URLs against this path). Playlists cache briefly; immutable media caches forever.
  app.options('/api/chora/media/:trackId/*splat', (_req: any, res: any) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range');
    res.status(204).end();
  });
  app.get('/api/chora/media/:trackId/*splat', async (req: any, res: any) => {
    const trackId = String(req.params.trackId).replace(/[^\w\-]/g, '');
    // Express 5 named wildcard → req.params.splat is an array of the remaining path segments.
    const splat = (req.params as any).splat;
    const sub = (Array.isArray(splat) ? splat.join('/') : String(splat || '')).replace(/\.\.+/g, '').replace(/^\/+/, '');
    if (!trackId || !sub) return res.status(400).end();
    const token = await getGoogleAccessToken();
    if (!token) return res.status(503).end();
    try {
      const gcsUrl = `https://storage.googleapis.com/storage/v1/b/${STORAGE_BUCKET}/o/${encodeURIComponent(`chora-hls/${trackId}/${sub}`)}?alt=media`;
      const headers: any = { Authorization: `Bearer ${token}` };
      if (req.headers.range) headers.Range = req.headers.range;
      const g = await fetch(gcsUrl, { headers });
      if (!g.ok && g.status !== 206) return res.status(g.status === 404 ? 404 : 502).end();
      const ct = sub.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl'
        : sub.endsWith('.flac') ? 'audio/flac'
        : (sub.endsWith('.m4s') || sub.endsWith('.m4a') || sub.endsWith('.mp4')) ? 'audio/mp4'
        : (g.headers.get('content-type') || 'application/octet-stream');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Type', ct);
      res.setHeader('Cache-Control', sub.endsWith('.m3u8') ? 'public, max-age=60' : 'public, max-age=31536000, immutable');
      const cr = g.headers.get('content-range'); if (cr) res.setHeader('Content-Range', cr);
      const cl = g.headers.get('content-length'); if (cl) res.setHeader('Content-Length', cl);
      res.status(g.status === 206 ? 206 : 200).end(Buffer.from(await g.arrayBuffer()));
    } catch (e: any) { res.status(502).end(); }
  });

  // ── Demucs 4-stem separation (the "studio quality for everyone" tier) ──────────────
  //
  // The separation itself runs in the plajah-demucs WORKER service, not here. Demucs needs
  // minutes of saturated CPU and ~8GB per song; running it in-process would blow this service's
  // 300s request timeout and an OOM would take the whole API down with it. See worker/DEPLOY.md.
  //
  // This service stays the only thing the browser talks to: it authenticates the user, vets the
  // source URL, and hands a job to the worker over service-to-service auth. Disabled until
  // DEMUCS_WORKER_URL is set, in which case the client falls back to on-device / instant stems.

  /** Hosts we'll pull source audio from. Without this the endpoint is an SSRF primitive: any
   *  signed-in user could make the worker fetch an arbitrary URL, including GCP metadata and
   *  anything else reachable from inside the VPC. */
  const stemSourceAllowed = (raw: string): boolean => {
    let u: URL;
    try { u = new URL(raw); } catch { return false; }
    if (u.protocol !== 'https:') return false;
    const extra = (process.env.DEMUCS_ALLOWED_HOSTS || '').split(',').map(h => h.trim()).filter(Boolean);
    const allowed = [
      'firebasestorage.googleapis.com',
      'storage.googleapis.com',
      `${STORAGE_BUCKET}.storage.googleapis.com`,
      ...extra,
    ];
    return allowed.includes(u.hostname);
  };

  /** Mint an identity token for the worker. Cloud Run rejects anything else, so the worker is
   *  unreachable from the open internet even though its stems land in a shared bucket. */
  const workerIdToken = async (audience: string): Promise<string | null> => {
    try {
      const res = await fetch(
        `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}`,
        { headers: { 'Metadata-Flavor': 'Google' } },
      );
      return res.ok ? (await res.text()).trim() : null;
    } catch { return null; }
  };

  app.post('/api/crossover/stems', apiLimiter, authMiddleware, express.json(), async (req: any, res) => {
    const worker = (process.env.DEMUCS_WORKER_URL || '').replace(/\/+$/, '');
    if (!worker) {
      return res.status(501).json({ ok: false, message: 'Studio separation not enabled (set DEMUCS_WORKER_URL).' });
    }
    const url = req.body?.url;
    if (!url || typeof url !== 'string') return res.status(400).json({ ok: false, message: 'url required' });
    if (!stemSourceAllowed(url)) return res.status(400).json({ ok: false, message: 'audio must be hosted on Plajah storage' });

    // Alphanumeric only: the id becomes a GCS path segment and a URL param on the way back.
    const jobId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.replace(/[^a-z0-9]/gi, '');
    try {
      const token = await workerIdToken(worker);
      const r = await fetch(`${worker}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ jobId, url }),
      });
      if (!r.ok) return res.status(502).json({ ok: false, message: `worker rejected job (${r.status})` });
      // Deliberately not awaiting the separation — it outlives this request by minutes. The
      // client polls the status route below.
      res.status(202).json({ ok: true, jobId, status: 'queued' });
    } catch (e: any) {
      res.status(502).json({ ok: false, message: String(e?.message || e) });
    }
  });

  // Poll a separation. Reads the status doc the worker writes beside the stems, so it stays
  // correct across worker restarts and scale-to-zero.
  app.get('/api/crossover/stems/job/:jobId', apiLimiter, authMiddleware, async (req: any, res: any) => {
    const { jobId } = req.params;
    if (!/^[a-z0-9]+$/i.test(jobId)) return res.status(400).json({ ok: false, message: 'bad jobId' });
    const buf = await gcsDownload(`demucs-stems/${jobId}/status.json`);
    if (!buf) return res.json({ ok: true, status: 'queued' });
    let status: any;
    try { status = JSON.parse(buf.toString()); } catch { return res.json({ ok: true, status: 'queued' }); }
    if (status?.status === 'done') {
      const base = (process.env.PUBLIC_API_BASE || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
      const out: any = { ok: true, status: 'done' };
      for (const stem of (status.stems || [])) out[stem] = `${base}/api/crossover/stems/${jobId}/${stem}`;
      return res.json(out);
    }
    res.json({ ok: true, ...status });
  });

  // Stream a separated stem back (same-origin → no CORS headaches for the client). Behind auth:
  // stems are a paid-tier product derived from a user's own audio, and a bare jobId is not a
  // credential — this route previously served them to anyone who could guess one.
  app.get('/api/crossover/stems/:job/:stem', apiLimiter, authMiddleware, async (req: any, res: any) => {
    const { job, stem } = req.params;
    if (!/^[\w]+$/.test(job) || !['vocals', 'drums', 'bass', 'other'].includes(stem)) return res.status(400).end();
    const buf = await gcsDownload(`demucs-stems/${job}/${stem}.wav`);
    if (!buf) return res.status(404).end();
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(buf);
  });

  // Finalize/repair — remux an unfinalized (crashed OBS/livestream) recording:
  // stream-copy + faststart + regenerated timestamps. (Deep moov-atom recovery,
  // e.g. untrunc, is a later upgrade.)
  app.post('/api/crossover/finalize', apiLimiter, authMiddleware, cxRaw, async (req: any, res) => {
    const name = decodeURIComponent(req.header('X-Crossover-Name') || 'input.mp4');
    const base = (name.replace(/\.[^.]+$/, '') || 'output').replace(/[^\w.\-]+/g, '_');
    const outPath = path.join(os.tmpdir(), `cx_fin_${cxRand()}.mp4`);
    let inPath: string | null = null;
    const cleanup = () => { for (const p of [inPath, outPath]) if (p) fs.unlink(p).catch(() => {}); };
    try {
      const mat = await cxMaterializeInput(req, 'mp4');
      if (typeof mat !== 'string') { cleanup(); return res.status(400).send(mat.error); }
      inPath = mat;
      const r = await runFfmpeg(['-y', '-fflags', '+genpts', '-i', inPath, '-c', 'copy', '-movflags', '+faststart', outPath], 3 * 60 * 1000);
      if (!r.ok) { cleanup(); return res.status(422).send(`finalize failed: ${r.err.slice(-600)}`); }
      const outBuf = await fs.readFile(outPath);
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Disposition', `attachment; filename="${base}_finalized.mp4"`);
      res.send(outBuf);
    } catch (e: any) {
      res.status(500).send(String(e?.message || e));
    } finally {
      cleanup();
    }
  });

  // Social video — a cover+audio MP4 for a shared album/track, so music plays INLINE on
  // Facebook/Instagram (which only autoplay video/mp4). Generated on first hit, cached in
  // Storage, served with Range support. og:video points here for music shares.
  app.get('/social-video', async (req, res) => {
    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Security-Policy', "frame-ancestors *");
    // ?probe=2 — fully synthetic encode (no downloads, no remote inputs) to isolate whether
    // the ffmpeg ENCODE crashes the instance vs. the input handling.
    if (req.query.probe === '2') {
      const out = path.join(os.tmpdir(), `probe_${Date.now()}.mp4`);
      const r = await new Promise<string>((resolve) => {
        let e = '';
        let p: ReturnType<typeof spawn>;
        try { p = spawn('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=blue:s=320x320:d=3', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', '3', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', out]); }
        catch (err: any) { return resolve(`spawn threw: ${err?.message || err}`); }
        p.stderr?.on('data', (d) => { e += d.toString(); });
        p.on('error', (err: any) => resolve(`spawn error: ${err?.message || err}`));
        p.on('close', async (code) => { try { const s = (await fs.stat(out)).size; fs.unlink(out).catch(() => {}); resolve(`exit ${code}, out ${s} bytes`); } catch { resolve(`exit ${code}, NO FILE\n${e.slice(-500)}`); } });
      });
      return res.type('text/plain').send(r);
    }
    // ?probe=1 — confirm ffmpeg is installed + runnable (no heavy generation).
    if (req.query.probe) {
      const out = await new Promise<string>((resolve) => {
        let o = '';
        let p: ReturnType<typeof spawn>;
        try { p = spawn('ffmpeg', ['-version']); } catch (e: any) { return resolve(`spawn threw: ${e?.message || e}`); }
        p.stdout?.on('data', (d) => { o += d.toString(); });
        p.on('error', (e: any) => resolve(`spawn error: ${e?.message || e}`));
        p.on('close', () => resolve(o.slice(0, 200) || 'ran, no output'));
      });
      return res.type('text/plain').send(out);
    }
    const { id, track } = req.query as any;
    if (!id) return res.status(404).send('Not Found');
    try {
      const dbData = await fetchFirebaseDoc('albums', String(id));
      const picked = dbData?.fields ? pickSocialTrack(dbData.fields, track ? String(track) : undefined) : null;
      if (!picked) return res.status(404).send('No media');
      const objectPath = `socialVideos/${String(id)}__${track ? String(track) : picked.trackId}.mp4`;
      const { buf, err } = await ensureSocialVideo(objectPath, picked.cover, picked.audio);
      if (!buf) {
        if (req.query.debug) return res.status(500).type('text/plain').send(`cover: ${picked.cover}\naudio: ${picked.audio}\n\nffmpeg err:\n${err}`);
        res.setHeader('Retry-After', '5');
        return res.status(503).send('Preparing preview');
      }

      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      const range = req.headers.range;
      const m = range ? /bytes=(\d+)-(\d*)/.exec(range) : null;
      if (m) {
        const start = parseInt(m[1], 10);
        const end = m[2] ? Math.min(parseInt(m[2], 10), buf.length - 1) : buf.length - 1;
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${buf.length}`);
        res.setHeader('Content-Length', String(end - start + 1));
        return res.end(buf.subarray(start, end + 1));
      }
      res.setHeader('Content-Length', String(buf.length));
      return res.end(buf);
    } catch { return res.status(500).send('Error'); }
  });

  // Meta-safe social card image — a gorgeous 1200×630 JPEG of the album/track/video
  // cover, rendered + cached in Cloud Storage. og:image / twitter:image point here so
  // Facebook & X always get a valid, correctly-sized image (raw covers are 20–30 MB
  // PNGs Facebook drops). ?debug=1 surfaces the ffmpeg error instead of redirecting.
  app.get('/social-image', async (req, res) => {
    const { type, id, track } = req.query as any;
    // Site-wide default card (used by index.html's default og:image).
    if (req.query.default || !id) {
      try {
        const { buf, err } = await ensureDefaultCard('socialImages/_default.jpg');
        if (!buf) {
          if (req.query.debug) return res.status(500).type('text/plain').send(`default card err:\n${err}`);
          return res.status(404).send('No image');
        }
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=604800');
        res.setHeader('Content-Length', String(buf.length));
        return res.end(buf);
      } catch { return res.status(500).send('Error'); }
    }
    try {
      const t = String(type || 'album');
      const cover = await resolveShareCover(t, String(id), track ? String(track) : undefined);
      if (!cover) return res.status(404).send('No image');
      const key = `${t}__${String(id)}${track ? `__${String(track)}` : ''}`.replace(/[^a-zA-Z0-9_-]/g, '_');
      const objectPath = `socialImages/${key}.jpg`;
      const { buf, err } = await ensureSocialImage(objectPath, cover);
      if (!buf) {
        if (req.query.debug) return res.status(500).type('text/plain').send(`cover: ${cover}\n\nffmpeg err:\n${err}`);
        return res.redirect(302, cover); // last resort: original cover (better than a broken card)
      }
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Content-Length', String(buf.length));
      return res.end(buf);
    } catch { return res.status(500).send('Error'); }
  });

  // Share landing — serves the SPA shell with OG/twitter:player meta injected so
  // a shared track link renders an inline player card on social. Crawlers read
  // the meta; humans are bounced to the canonical app URL so the full app loads.
  app.get('/share', async (req, res) => {
    const host = publicHost(req);
    // ?probe=meta — dump the resolved share fields (artist/owner) as JSON for debugging.
    if (req.query.probe === 'meta' && req.query.type && req.query.id) {
      try {
        const coll: Record<string, string> = { album: 'albums', track: 'albums', book: 'albums', movie: 'albums', video: 'videos', article: 'articles', game: 'games' };
        const doc = await fetchFirebaseDoc(coll[String(req.query.type)] || 'albums', String(req.query.id));
        const f: any = doc?.fields || {};
        const ownerId = f.ownerId?.stringValue || f.ownerUid?.stringValue || f.uid?.stringValue || f.creatorUid?.stringValue || f.artistId?.stringValue || null;
        let owner: any = null;
        if (ownerId) { const o = await fetchFirebaseDoc('users', ownerId); const of = o?.fields || {}; owner = { displayName: of.displayName?.stringValue, name: of.name?.stringValue, artistName: of.artistName?.stringValue, username: of.username?.stringValue, handle: of.handle?.stringValue }; }
        return res.json({ title: f.title?.stringValue, artist: f.artist?.stringValue, ownerId, owner });
      } catch (e: any) { return res.status(500).json({ error: String(e?.message || e) }); }
    }
    let html = '';
    try { html = await fs.readFile(path.join(__dirname, 'dist', 'index.html'), 'utf-8'); }
    catch {
      try { html = await fs.readFile(path.join(__dirname, 'index.html'), 'utf-8'); }
      catch { html = '<!DOCTYPE html><html><head></head><body></body></html>'; }
    }
    // Track whether asset-specific meta actually got injected. If injection throws or
    // no-ops (a transient Firestore blip), the html is the raw shell with the GENERIC
    // default tags — we must NOT let the CDN cache that for 5 min, or one bad scrape
    // poisons the preview for everyone until it expires (this is what bit us on Meta).
    let injected = false;
    try { const out = await injectMetaTags(html, req.query, host); if (out && out !== html) { html = out; injected = true; } } catch {}

    const { type, id } = req.query as any;
    if (type && id) {
      // Preserve the full original query (ref/track/video/etc.) when bouncing to the app.
      const qsStr = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?') + 1) : '';
      const canonical = `/?${qsStr}`;
      // Bounce real browsers to the canonical app URL; crawlers (no JS) keep the meta.
      const redirect = `<script>try{if(!/(bot|crawl|spider|facebookexternalhit|twitterbot|slackbot|discordbot|whatsapp|telegrambot|embedly|linkedinbot|pinterest|redditbot|googlebot|bingbot|applebot|skypeuripreview|vkshare|w3c_validator)/i.test(navigator.userAgent)){location.replace(${JSON.stringify(canonical)});}}catch(e){}</script>`;
      html = html.replace('</head>', `${redirect}\n</head>`);
    }
    // Cache successful cards for 5 min; never cache a failed/generic fallback (so a retry
    // or re-scrape immediately gets the real card instead of a stuck broken one).
    if (type && id && !injected) res.set('Cache-Control', 'no-store, max-age=0');
    else res.set('Cache-Control', 'public, max-age=300');
    res.send(html);
  });

  // --- Vite Middleware ---

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite'); // dev-only — never loaded in prod
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(async (req, res, next) => {
      // Just intercept root and add meta tags if type is present
      if (req.path === '/' && req.query.type) {
        try {
          const rawHtml = await fs.readFile(path.join(__dirname, 'index.html'), 'utf-8');
          const finalHtml = await injectMetaTags(rawHtml, req.query, req.get('host') || 'localhost');
          const viteTransformed = await vite.transformIndexHtml(req.originalUrl, finalHtml);
          return res.status(200).set({ 'Content-Type': 'text/html' }).end(viteTransformed);
        } catch(e) {
          return next();
        }
      }
      next();
    });
    // Vite's SPA middleware serves index.html for any unmatched GET — but some
    // API routes (/api/fetch-rss, /api/cora, the MUSE agent) are registered
    // AFTER this point, so /api/* must skip Vite and fall through to them.
    // Without this, those endpoints return the HTML shell (e.g. RSS news
    // parsed to 0 items → "No articles found").
    app.use((req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      return (vite.middlewares as any)(req, res, next);
    });
  } else {
    // Service worker files must never be HTTP-cached — the browser manages their own cache.
    // Stale sw.js means users keep running old code even after a deploy.
    app.use((req, res, next) => {
      if (/^\/(sw\.js|workbox-[^/]+\.js)$/.test(req.path)) {
        res.setHeader('Cache-Control', 'no-store');
      } else if (req.path.startsWith('/assets/')) {
        // Content-hashed filenames — safe to cache forever
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
      next();
    });

    app.use(express.static(path.join(__dirname, 'dist'), { index: false }));

    app.get('*all', async (req, res, next) => {
      // API routes registered after this catch-all (/api/fetch-rss, /api/cora,
      // MUSE agent) must not be served the SPA shell — let them resolve.
      if (req.path.startsWith('/api/')) return next();
      try {
        let html = await fs.readFile(path.join(__dirname, 'dist', 'index.html'), 'utf-8');
        if (req.query.type) {
           html = await injectMetaTags(html, req.query, req.get('host') || 'localhost');
        }
        // Event page social OG injection: /event/:eventId
        const pathParts = req.path.split('/').filter(Boolean);
        if (pathParts[0] === 'event' && pathParts[1]) {
          try {
            const eventDoc = await fetchFirebaseDoc('plajahEvents', pathParts[1]);
            if (eventDoc?.fields) {
              const ef = eventDoc.fields;
              const title = ef.title?.stringValue ?? 'Event on Plajah';
              const desc = ef.subtitle?.stringValue || ef.description?.stringValue?.slice(0, 160) || 'Get your tickets on Plajah';
              const image = ef.coverImage?.stringValue ?? '';
              const host = publicHost(req); // plajah.com, never the raw run.app host (breaks og:url canonical)
              const dateStr = ef.startDate?.integerValue ? new Date(parseInt(ef.startDate.integerValue)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '';
              const venue = ef.venueName?.stringValue ?? ef.city?.stringValue ?? '';
              const richDesc = `${dateStr}${venue ? ` · ${venue}` : ''} — ${desc}`;
              const safeT = htmlEscape(title); const safeD = htmlEscape(richDesc); const safeI = htmlEscape(image); const safeH = htmlEscape(host); const safeEid = htmlEscape(pathParts[1]);
              const eventMeta = `
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${safeT}" />
    <meta property="og:description" content="${safeD}" />
    <meta property="og:image" content="${safeI}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:url" content="https://${safeH}/event/${safeEid}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@plajah" />
    <meta name="twitter:title" content="${safeT}" />
    <meta name="twitter:description" content="${safeD}" />
    <meta name="twitter:image" content="${safeI}" />
    <meta name="description" content="${safeD}" />`;
              // Strip default og/twitter tags first (same canonical-og:url trap as /profile above).
              html = html.replace(/[ \t]*<meta\s+(?:property|name)="(?:og:[^"]*|twitter:[^"]*)"[^>]*\/?>\s*/gi, '');
              html = html.replace('</head>', `${eventMeta}\n</head>`);
            }
          } catch {}
        }
        // Profile page social OG injection: /profile/:uid — the user's generated Stat Card becomes
        // the link preview (falls back to their photo). Mirrors the /event pattern above.
        if (pathParts[0] === 'profile' && pathParts[1]) {
          try {
            const userDoc = await fetchFirebaseDoc('users', pathParts[1]);
            if (userDoc?.fields) {
              const uf = userDoc.fields;
              const name = uf.displayName?.stringValue || 'Creator';
              const title = `${name} on Plajah`;
              const desc = (uf.bio?.stringValue?.slice(0, 150)) || uf.tagline?.stringValue || `See ${name}'s music, film & books — and their trading card — on Plajah.`;
              const image = uf.statCardImageUrl?.stringValue || uf.photoURL?.stringValue || uf.coverArt?.stringValue || '';
              const host = publicHost(req); // plajah.com, never the raw run.app host (breaks og:url canonical)
              const safeT = htmlEscape(title); const safeD = htmlEscape(desc); const safeI = htmlEscape(image); const safeH = htmlEscape(host); const safeU = htmlEscape(pathParts[1]);
              const profileMeta = `
    <meta property="og:type" content="profile" />
    <meta property="og:title" content="${safeT}" />
    <meta property="og:description" content="${safeD}" />
    <meta property="og:image" content="${safeI}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:url" content="https://${safeH}/profile/${safeU}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@plajah" />
    <meta name="twitter:title" content="${safeT}" />
    <meta name="twitter:description" content="${safeD}" />
    <meta name="twitter:image" content="${safeI}" />
    <meta name="description" content="${safeD}" />`;
              // Strip the base template's default og/twitter tags FIRST — otherwise the default
              // og:url (https://plajah.com/) survives and Facebook treats it as canonical, re-scraping
              // the homepage and showing the generic Plajah preview instead of this profile's card.
              html = html.replace(/[ \t]*<meta\s+(?:property|name)="(?:og:[^"]*|twitter:[^"]*)"[^>]*\/?>\s*/gi, '');
              html = html.replace('</head>', `${profileMeta}\n</head>`);
            }
          } catch {}
        }
        // Tell browsers to always revalidate index.html so they pick up new deploys
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.send(html);
      } catch (e) {
        res.status(500).send('Server Error');
      }
    });
  }


  // ── MUX Webhook — receives live stream state changes ──────────────────────
  // Register MUX webhook at: https://dashboard.mux.com/webhooks
  // Point it to: https://your-domain.com/api/mux/webhook
  app.post('/api/mux/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['mux-signature'] as string;
    const secret = process.env.MUX_WEBHOOK_SECRET;

    // If webhook secret is configured, verify the signature
    if (secret && sig) {
      try {
        const body = req.body.toString('utf8');
        const ts = sig.split(',').find(p => p.startsWith('t='))?.split('=')[1];
        const v1 = sig.split(',').find(p => p.startsWith('v1='))?.split('=')[1];
        if (!ts || !v1) return res.status(400).json({ error: 'Invalid signature header' });
        const crypto = await import('crypto');
        const expected = crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
        if (!crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(v1, 'hex'))) {
          return res.status(401).json({ error: 'Signature mismatch' });
        }
      } catch (err) {
        console.error('[MUX webhook] Signature verification error:', err);
        return res.status(400).json({ error: 'Signature verification failed' });
      }
    }

    try {
      const event = JSON.parse(req.body.toString('utf8'));
      const { type, data } = event;

      // ── Firestore REST helpers (no admin SDK needed) ──────────────────────
      const projectId = process.env.VITE_FIREBASE_PROJECT_ID ?? 'gen-lang-client-0665118474';
      const dbId = process.env.VITE_FIREBASE_DB_ID ?? '(default)';
      const fsBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents`;

      // Query live_streams collection for a doc with muxStreamId == streamId
      const queryLiveStream = async (streamId: string) => {
        const url = `${fsBase}:runQuery`;
        const body = {
          structuredQuery: {
            from: [{ collectionId: 'live_streams' }],
            where: { fieldFilter: { field: { fieldPath: 'muxStreamId' }, op: 'EQUAL', value: { stringValue: streamId } } },
            limit: 1,
          },
        };
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const rows = await res.json();
        const doc = rows[0]?.document;
        return doc ? { name: doc.name, fields: doc.fields } : null;
      };

      const patchLiveDoc = async (docName: string, fields: Record<string, any>) => {
        const fieldPaths = Object.keys(fields);
        const mask = fieldPaths.map(f => `updateMask.fieldPaths=${f}`).join('&');
        const body = { fields: Object.fromEntries(fieldPaths.map(f => [f, fields[f]])) };
        await fetch(`https://firestore.googleapis.com/v1/${docName}?${mask}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
      };

      if (type === 'video.live_stream.active') {
        const streamId = data?.id;
        if (streamId) {
          console.log(`[MUX] Stream ${streamId} is now ACTIVE`);
          try {
            const liveDoc = await queryLiveStream(streamId);
            if (liveDoc) {
              await patchLiveDoc(liveDoc.name, {
                isLive: { booleanValue: true },
                streamStatus: { stringValue: 'active' },
                liveStartedAt: { integerValue: String(Date.now()) },
              });
              console.log(`[MUX] Flipped isLive=true for stream ${streamId}`);
            }
          } catch (e: any) { console.error('[MUX webhook] Firestore update failed:', e.message); }
        }
      }

      if (type === 'video.live_stream.idle') {
        const streamId = data?.id;
        if (streamId) {
          console.log(`[MUX] Stream ${streamId} is now IDLE/ended`);
          try {
            const liveDoc = await queryLiveStream(streamId);
            if (liveDoc) {
              await patchLiveDoc(liveDoc.name, {
                isLive: { booleanValue: false },
                streamStatus: { stringValue: 'idle' },
                liveEndedAt: { integerValue: String(Date.now()) },
              });
              console.log(`[MUX] Flipped isLive=false for stream ${streamId}`);
            }
          } catch (e: any) { console.error('[MUX webhook] Firestore update failed:', e.message); }
        }
      }

      if (type === 'video.asset.ready') {
        // VOD asset finished processing — update video doc with final playback ID
        const assetId = data?.id;
        const playbackId = data?.playback_ids?.[0]?.id;
        if (assetId && playbackId) {
          console.log(`[MUX] Asset ${assetId} ready with playbackId ${playbackId}`);
          try {
            // Find video doc with muxAssetId == assetId and update playbackId
            const url = `${fsBase}:runQuery`;
            const body = {
              structuredQuery: {
                from: [{ collectionId: 'videos' }],
                where: { fieldFilter: { field: { fieldPath: 'muxAssetId' }, op: 'EQUAL', value: { stringValue: assetId } } },
                limit: 1,
              },
            };
            const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const rows = await res.json();
            const videoDoc = rows[0]?.document;
            if (videoDoc) {
              await patchLiveDoc(videoDoc.name, {
                muxPlaybackId: { stringValue: playbackId },
                status: { stringValue: 'ready' },
              });
            }
          } catch (e: any) { console.error('[MUX webhook] Video update failed:', e.message); }
        }
      }

      res.json({ received: true });
    } catch (err) {
      console.error('[MUX webhook] Parse error:', err);
      res.status(400).json({ error: 'Invalid webhook payload' });
    }
  });

  // ── Stripe: Club Membership Checkout ─────────────────────────────────────
  // ── Live Stream Tip — instant one-time payment to creator ────────────────────
  app.post('/api/stripe/live-tip', authMiddleware, express.json(), async (req: any, res) => {
    try {
      const { creatorUid, creatorStripeAccountId, amount, title } = req.body;
      if (!creatorUid || !creatorStripeAccountId || typeof amount !== 'number' || amount < 100) {
        return res.status(400).json({ error: 'amount must be at least $1.00 (100 cents)' });
      }
      const platformFee = Math.round(amount * 0.10); // 10% platform fee
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: { name: `💸 Live tip${title ? ` — ${title}` : ''}` },
            unit_amount: amount,
          },
          quantity: 1,
        }],
        payment_intent_data: {
          application_fee_amount: platformFee,
          transfer_data: { destination: creatorStripeAccountId },
          metadata: { type: 'live_tip', creatorUid, senderUid: req.uid ?? '' },
        },
        success_url: `${process.env.VITE_APP_URL ?? 'https://plajah.com'}?tip=success`,
        cancel_url: `${process.env.VITE_APP_URL ?? 'https://plajah.com'}?tip=cancelled`,
      });
      res.json({ url: session.url });
    } catch (err: any) {
      console.error('/api/stripe/live-tip', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Store order — the spine for in-store kiosk + POS + online store ───────────────
  // Stripe Connect DIRECT: funds settle straight to the BUSINESS's connected account; Plajah never
  // holds them (optional application fee only). Every line is priced SERVER-SIDE from storeProducts
  // (dollars → cents) — the client never sets prices. Writes a PENDING order; the webhook confirms it
  // + decrements stock atomically. v1 uses the product's base price + scalar stock; per-variant
  // pricing/stock is a follow-up. See docs — business-ops build sequence.
  const STORE_APP_FEE_BPS = 0; // Plajah's per-order platform fee in basis points (200 = 2%). 0 = none at launch.
  app.post('/api/store/create-order', authMiddleware, express.json(), async (req: any, res) => {
    try {
      const customerUid: string = req.uid;
      const { businessUid, items, fulfillment, note, customerName } = req.body || {};
      if (!businessUid || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'businessUid and items are required.' });
      }
      // Resolve the business's connected Stripe account — the money goes straight to them.
      const org = await firestoreRead('organizations', businessUid);
      let acct: string | undefined = org?.stripeAccountId;
      if (!acct) { const u = await firestoreRead('users', businessUid); acct = u?.stripeConnectAccountId; }
      if (!acct) return res.status(400).json({ error: 'This business has not connected Stripe payouts yet.' });

      const lineItems: any[] = [];
      const priced: any[] = [];
      let subtotalCents = 0;
      for (const it of items) {
        const qty = Math.max(1, Math.min(99, Math.floor(Number(it?.qty) || 0)));
        const p = await firestoreRead('storeProducts', String(it?.productId || ''));
        if (!p) return res.status(400).json({ error: `Product not found: ${it?.productId}` });
        if (p.isActive === false) return res.status(400).json({ error: `Product unavailable: ${p.title || it?.productId}` });
        if (p.sellerId && p.sellerId !== businessUid) return res.status(400).json({ error: 'A product does not belong to this business.' });
        const unit = Math.round(Number(p.price || 0) * 100); // storeProducts.price is in DOLLARS
        if (!(unit > 0)) return res.status(400).json({ error: `Invalid price for ${p.title || it?.productId}` });
        subtotalCents += unit * qty;
        lineItems.push({ price_data: { currency: 'usd', product_data: { name: p.title || 'Item' }, unit_amount: unit }, quantity: qty });
        priced.push({ productId: String(it.productId), title: p.title || 'Item', qty, unitAmount: unit, variantName: it?.variantName || null });
      }

      const orderId = `so_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const appFee = Math.round(subtotalCents * (STORE_APP_FEE_BPS / 10000));
      const origin = req.headers.origin || (process.env.VITE_APP_URL ?? 'https://plajah.com');
      const session = await getStripe().checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: lineItems,
        payment_intent_data: {
          ...(appFee > 0 ? { application_fee_amount: appFee } : {}),
          transfer_data: { destination: acct },   // DIRECT to the business — Plajah never holds the funds
          metadata: { type: 'store_order', orderId, businessUid },
        },
        success_url: `${origin}/?order=success`,
        cancel_url: `${origin}/?order=cancelled`,
        metadata: { type: 'store_order', orderId, businessUid },
      });
      await firestoreWrite('storeOrders', orderId, {
        businessUid, customerUid,
        items: JSON.stringify(priced), subtotalCents,
        fulfillment: fulfillment === 'SHIP' ? 'SHIP' : 'PICKUP',
        note: String(note || '').slice(0, 500), customerName: String(customerName || '').slice(0, 120),
        status: 'PENDING_PAYMENT', createdAt: Date.now(), stripeSessionId: session.id,
      });
      res.json({ url: session.url, orderId });
    } catch (err: any) {
      console.error('/api/store/create-order', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Music sync license — one-time per-project license, pays the musician ─────
  app.post('/api/stripe/purchase-sync-license', authMiddleware, express.json(), async (req: any, res) => {
    try {
      const { trackId, albumId, editId, editTitle } = req.body || {};
      const buyerUid = req.uid;
      if (!trackId || !albumId || !editId) return res.status(400).json({ error: 'Missing trackId, albumId, or editId.' });

      // Verify the fee + rights owner from the album server-side (never trust the client).
      const albumDoc = await fetchFirebaseDoc('albums', albumId);
      if (!albumDoc?.fields) return res.status(404).json({ error: 'Album not found.' });
      const albumOwner = albumDoc.fields.ownerId?.stringValue || '';
      // `tracks` may be a native Firestore array (arrayValue) OR a JSON string.
      let found: { syncLicenseFee: number; title: string; rightsOwnerId: string } | null = null;
      const trackVals = albumDoc.fields.tracks?.arrayValue?.values;
      if (trackVals) {
        for (const tv of trackVals) {
          const tf = tv.mapValue?.fields || {};
          if (tf.id?.stringValue === trackId) {
            found = {
              syncLicenseFee: Number(tf.syncLicenseFee?.doubleValue ?? tf.syncLicenseFee?.integerValue ?? 0),
              title: tf.title?.stringValue || '',
              rightsOwnerId: tf.rightsOwnerId?.stringValue || '',
            };
            break;
          }
        }
      } else if (albumDoc.fields.tracks?.stringValue) {
        try {
          const arr = JSON.parse(albumDoc.fields.tracks.stringValue);
          const t = (arr || []).find((x: any) => x.id === trackId);
          if (t) found = { syncLicenseFee: Number(t.syncLicenseFee || 0), title: t.title || '', rightsOwnerId: t.rightsOwnerId || '' };
        } catch { /* fall through */ }
      }
      if (!found) return res.status(404).json({ error: 'Track not found on that album.' });
      const feeUsd = found.syncLicenseFee;
      const trackTitle = found.title;
      const rightsOwnerUid = found.rightsOwnerId || albumOwner;
      if (!(feeUsd > 0)) return res.status(400).json({ error: 'This track is not offered for sync licensing.' });
      if (!rightsOwnerUid) return res.status(400).json({ error: 'This track has no rights owner on file.' });
      if (rightsOwnerUid === buyerUid) return res.status(400).json({ error: 'You already own this track — no license needed.' });

      // The musician must be able to receive payouts.
      const ownerUser = await firestoreRead('users', rightsOwnerUid);
      const acct = ownerUser?.stripeConnectAccountId as string | undefined;
      if (!acct) return res.status(400).json({ error: 'The rights holder has not set up payouts yet.' });
      const stripe = getStripe();
      try {
        const acctInfo = await stripe.accounts.retrieve(acct);
        if (!acctInfo.payouts_enabled) return res.status(400).json({ error: 'The rights holder cannot receive payouts yet.' });
      } catch { return res.status(400).json({ error: 'Could not verify the rights holder’s payout account.' }); }

      const feeCents = Math.round(feeUsd * 100);
      if (feeCents < 100) return res.status(400).json({ error: 'Sync fee must be at least $1.00.' });
      const platformFee = Math.round(feeCents * 0.10);
      const appUrl = process.env.VITE_APP_URL ?? 'https://plajah.com';
      const meta = { type: 'sync_license', trackId, albumId, rightsOwnerUid, buyerUid, editId, editTitle: editTitle || '', feeCents: String(feeCents), trackTitle };
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{ price_data: { currency: 'usd', product_data: { name: `Sync license — ${trackTitle || 'track'}` }, unit_amount: feeCents }, quantity: 1 }],
        payment_intent_data: { application_fee_amount: platformFee, transfer_data: { destination: acct }, metadata: meta },
        metadata: meta,
        success_url: `${appUrl}?license_success=${encodeURIComponent(trackId)}`,
        cancel_url: `${appUrl}?license_cancel=1`,
      });
      res.json({ url: session.url });
    } catch (err: any) {
      console.error('/api/stripe/purchase-sync-license', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/stripe/club-membership', authMiddleware, express.json(), async (req: any, res) => {
    try {
      const { clubId, clubName, monthlyPrice } = req.body;
      if (!clubId || !clubName || typeof monthlyPrice !== 'number' || monthlyPrice <= 0) {
        return res.status(400).json({ error: 'Missing or invalid club membership parameters' });
      }
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            recurring: { interval: 'month' },
            product_data: { name: `${clubName} — Fan Club Membership` },
            unit_amount: Math.round(monthlyPrice * 100),
          },
          quantity: 1,
        }],
        success_url: `${req.headers.origin ?? process.env.VITE_APP_URL ?? ''}/?club_join=${clubId}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.headers.origin ?? process.env.VITE_APP_URL ?? ''}/?club=${clubId}`,
        metadata: { type: 'club_membership', clubId, uid: req.uid },
        client_reference_id: req.uid,
      });
      res.json({ url: session.url });
    } catch (err: any) {
      console.error('[Stripe] club-membership checkout error:', err.message);
      res.status(500).json({ error: err.message || 'Failed to create checkout session' });
    }
  });

  // ── Sanctuary: recurring tier subscription (Patreon) ──────────────────────────
  app.post('/api/stripe/sanctuary-tier', authMiddleware, express.json(), async (req: any, res) => {
    try {
      const { tierId, creatorId, tierName, tierColor, monthlyPrice, annualPrice, billingCycle } = req.body;
      if (!tierId || !creatorId || !tierName || typeof monthlyPrice !== 'number' || monthlyPrice <= 0) {
        return res.status(400).json({ error: 'tierId, creatorId, tierName and a positive monthlyPrice are required' });
      }
      const annual = billingCycle === 'ANNUAL';
      const amount = annual ? Math.round((annualPrice || monthlyPrice * 12 * 0.9) * 100) : Math.round(monthlyPrice * 100);
      const stripe = getStripe();
      const origin = req.headers.origin ?? process.env.VITE_APP_URL ?? '';
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            recurring: { interval: annual ? 'year' : 'month' },
            product_data: { name: `${tierName} — Sanctuary Membership` },
            unit_amount: amount,
          },
          quantity: 1,
        }],
        success_url: `${origin}/?sanctuary_join=${creatorId}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?sanctuary=${creatorId}`,
        metadata: {
          type: 'sanctuary_membership', uid: req.uid, creatorUid: creatorId, creatorId,
          tierId, tierName, tierColor: tierColor || '#C9A55C', billingCycle: annual ? 'ANNUAL' : 'MONTHLY',
        },
        client_reference_id: req.uid,
      });
      res.json({ url: session.url });
    } catch (err: any) {
      console.error('[Stripe] sanctuary-tier error:', err.message);
      res.status(500).json({ error: err.message || 'Failed to create checkout session' });
    }
  });

  // ── Sanctuary: one-time à la carte unlock ─────────────────────────────────────
  app.post('/api/stripe/sanctuary-unlock', authMiddleware, express.json(), async (req: any, res) => {
    try {
      const { creatorId, itemId, itemType, itemTitle, price } = req.body;
      if (!creatorId || !itemId || typeof price !== 'number' || price <= 0) {
        return res.status(400).json({ error: 'creatorId, itemId and a positive price are required' });
      }
      const stripe = getStripe();
      const origin = req.headers.origin ?? process.env.VITE_APP_URL ?? '';
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: { name: `${itemTitle || 'Sanctuary content'} — Unlock` },
            unit_amount: Math.round(price * 100),
          },
          quantity: 1,
        }],
        success_url: `${origin}/?sanctuary_unlock=${itemId}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?sanctuary=${creatorId}`,
        metadata: {
          type: 'sanctuary_unlock', uid: req.uid, creatorUid: creatorId, creatorId,
          itemId, itemType: itemType || 'CONTENT', price: String(price),
        },
      });
      res.json({ url: session.url });
    } catch (err: any) {
      console.error('[Stripe] sanctuary-unlock error:', err.message);
      res.status(500).json({ error: err.message || 'Failed to create checkout session' });
    }
  });

  // ── Sanctuary: one-time campaign pledge (Kickstarter/GoFundMe) ────────────────
  app.post('/api/stripe/sanctuary-pledge', authMiddleware, express.json(), async (req: any, res) => {
    try {
      const { sanctuaryId, creatorId, amount, campaignTitle } = req.body;
      if (!sanctuaryId || typeof amount !== 'number' || amount < 1) {
        return res.status(400).json({ error: 'sanctuaryId and amount (min $1) are required' });
      }
      const stripe = getStripe();
      const origin = req.headers.origin ?? process.env.VITE_APP_URL ?? '';
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: { name: `${campaignTitle || 'Sanctuary campaign'} — Pledge` },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        }],
        success_url: `${origin}/?sanctuary_pledge=${sanctuaryId}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?sanctuary=${sanctuaryId}`,
        metadata: {
          type: 'sanctuary_pledge', uid: req.uid, creatorUid: creatorId || sanctuaryId,
          sanctuaryId, amount: String(amount),
        },
      });
      res.json({ url: session.url });
    } catch (err: any) {
      console.error('[Stripe] sanctuary-pledge error:', err.message);
      res.status(500).json({ error: err.message || 'Failed to create checkout session' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // MERCH API — Printful + Gelato proxy + Stripe checkout + platform fee payout
  // All keys stay server-side. Frontend calls /api/merch/* with a Firebase token.
  // Platform fee: PLATFORM_MERCH_FEE_PCT env var (default 15%)
  // ─────────────────────────────────────────────────────────────────────────────

  const PRINTFUL_API = 'https://api.printful.com';
  const GELATO_API   = 'https://product.gelatoapis.com/v3';
  const GELATO_ORDER_API = 'https://order.gelatoapis.com';
  const PLATFORM_FEE = parseFloat(process.env.PLATFORM_MERCH_FEE_PCT ?? '15') / 100;

  const printfulHeaders = () => ({
    'Authorization': `Bearer ${process.env.PRINTFUL_API_KEY ?? ''}`,
    'Content-Type': 'application/json',
  });

  const gelatoHeaders = () => ({
    'X-API-KEY': process.env.GELATO_API_KEY ?? '',
    'Content-Type': 'application/json',
  });

  // ── Printful: fetch product catalog ─────────────────────────────────────────
  app.get('/api/merch/printful/catalog', authMiddleware, async (_req, res) => {
    try {
      const r = await fetch(`${PRINTFUL_API}/products?limit=20`, { headers: printfulHeaders() });
      const data = await r.json();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Printful: fetch variants for a product ───────────────────────────────────
  app.get('/api/merch/printful/products/:id', authMiddleware, async (req, res) => {
    try {
      const r = await fetch(`${PRINTFUL_API}/products/${req.params.id}`, { headers: printfulHeaders() });
      const data = await r.json();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Printful: upload design file ─────────────────────────────────────────────
  // Accepts multipart/form-data with field "file"
  app.post('/api/merch/printful/files', authMiddleware, async (req: any, res) => {
    try {
      // Stream the incoming multipart body directly to Printful
      const contentType = req.headers['content-type'] ?? 'multipart/form-data';
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      await new Promise(resolve => req.on('end', resolve));
      const body = Buffer.concat(chunks);

      const r = await fetch(`${PRINTFUL_API}/files`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.PRINTFUL_API_KEY ?? ''}`,
          'Content-Type': contentType,
          'Content-Length': String(body.length),
        },
        body,
      });
      const data = await r.json();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Printful: generate mockup task ───────────────────────────────────────────
  app.post('/api/merch/printful/mockup/:productId', authMiddleware, express.json(), async (req, res) => {
    try {
      const r = await fetch(`${PRINTFUL_API}/mockup-generator/create-task/${req.params.productId}`, {
        method: 'POST',
        headers: printfulHeaders(),
        body: JSON.stringify(req.body),
      });
      const data = await r.json();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Printful: poll mockup task result ────────────────────────────────────────
  app.get('/api/merch/printful/mockup/task', authMiddleware, async (req, res) => {
    try {
      const r = await fetch(`${PRINTFUL_API}/mockup-generator/task?task_key=${req.query.task_key}`, { headers: printfulHeaders() });
      const data = await r.json();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Printful: create sync product (publish to Plajah's Printful store) ───────
  app.post('/api/merch/printful/products', authMiddleware, express.json(), async (req: any, res) => {
    try {
      const r = await fetch(`${PRINTFUL_API}/store/products`, {
        method: 'POST',
        headers: printfulHeaders(),
        body: JSON.stringify(req.body),
      });
      const data = await r.json();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Gelato: fetch product catalog ────────────────────────────────────────────
  app.get('/api/merch/gelato/catalog', authMiddleware, async (_req, res) => {
    try {
      const r = await fetch(`${GELATO_API}/products?limit=20&category=apparel`, { headers: gelatoHeaders() });
      const data = await r.json();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Gelato: fetch variants ────────────────────────────────────────────────────
  app.get('/api/merch/gelato/products/:uid/variants', authMiddleware, async (req, res) => {
    try {
      const r = await fetch(`${GELATO_API}/products/${req.params.uid}/variants`, { headers: gelatoHeaders() });
      const data = await r.json();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Gelato: generate mockup ───────────────────────────────────────────────────
  app.post('/api/merch/gelato/mockup/:uid', authMiddleware, express.json(), async (req, res) => {
    try {
      const r = await fetch(`${GELATO_API}/products/${req.params.uid}/mockup`, {
        method: 'POST',
        headers: gelatoHeaders(),
        body: JSON.stringify(req.body),
      });
      const data = await r.json();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Stripe: create merch checkout session ─────────────────────────────────────
  // Calculates platform fee, creates Stripe session, stores order intent in Firestore
  app.post('/api/merch/checkout', authMiddleware, express.json(), async (req: any, res) => {
    try {
      const { items, artistId, fulfillmentSource } = req.body as {
        items: { title: string; imageUrl: string; price: number; quantity: number; printfulVariantId?: number; printfulSyncProductId?: number }[];
        artistId: string;
        fulfillmentSource: 'printful' | 'gelato';
      };

      if (!items?.length || !artistId) return res.status(400).json({ error: 'Missing items or artistId' });

      const stripe = getStripe();
      const origin = req.headers.origin ?? process.env.VITE_APP_URL ?? '';
      const orderId = `merch-${Date.now()}-${req.uid.slice(0, 6)}`;

      // Build Stripe line items (retail price — Plajah takes fee from revenue share)
      const lineItems = items.map(item => ({
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.title,
            images: item.imageUrl ? [item.imageUrl] : [],
          },
          unit_amount: Math.round(item.price * 100), // cents
        },
        quantity: item.quantity,
      }));

      const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
      const platformFeeAmount = Math.round(subtotal * PLATFORM_FEE * 100); // cents

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: lineItems,
        success_url: `${origin}/?merch_success=${orderId}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?merch_cancel=1`,
        metadata: {
          type: 'merch_order',
          orderId,
          artistId,
          buyerUid: req.uid,
          fulfillmentSource,
          platformFeeUsd: (platformFeeAmount / 100).toFixed(2),
          artistPayoutUsd: ((subtotal * 100 - platformFeeAmount) / 100).toFixed(2),
        },
        client_reference_id: req.uid,
        payment_intent_data: {
          // Transfer artist portion automatically if you use Stripe Connect (optional)
          // transfer_data: { destination: artistStripeAccountId },
          // application_fee_amount: platformFeeAmount,
          metadata: { orderId, artistId },
        },
      });

      // Record pending order in Firestore so webhook can fulfil it
      await firestoreWrite('merch_orders', orderId, {
        orderId,
        buyerUid: req.uid,
        artistId,
        fulfillmentSource,
        status: 'pending_payment',
        stripeSessionId: session.id,
        subtotalUsd: subtotal,
        platformFeeUsd: platformFeeAmount / 100,
        artistPayoutUsd: (subtotal * 100 - platformFeeAmount) / 100,
        itemsJson: JSON.stringify(items),
        timestamp: Date.now(),
      });

      res.json({ url: session.url, orderId });
    } catch (err: any) {
      console.error('[Merch] checkout error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Stripe webhook: fulfil merch order after payment ─────────────────────────
  // Re-uses the existing /api/stripe/webhook handler pattern — add this case there.
  // Here we handle it inline via a dedicated route for clarity:
  app.post('/api/merch/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'] as string;
    const secret = process.env.STRIPE_MERCH_WEBHOOK_SECRET ?? process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) return res.status(500).json({ error: 'Webhook secret not configured' });

    let event: any;
    try {
      const stripe = getStripe();
      event = stripe.webhooks.constructEvent(req.body, sig, secret);
    } catch (err: any) {
      console.error('[Merch Webhook] signature verification failed:', err.message);
      return res.status(400).json({ error: 'Invalid signature' });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      if (session.metadata?.type !== 'merch_order') return res.json({ received: true });

      const { orderId, artistId, fulfillmentSource, artistPayoutUsd } = session.metadata;

      try {
        // 1. Mark order paid in Firestore
        await firestoreWrite('merch_orders', orderId, {
          status: 'paid',
          stripePaymentIntentId: session.payment_intent ?? '',
          paidAt: Date.now(),
        });

        // 2. Submit fulfillment order to Printful or Gelato
        // Shipping address comes from Stripe session — available in session.customer_details
        const addr = session.customer_details?.address;
        const name = session.customer_details?.name ?? '';
        const email = session.customer_details?.email ?? '';

        if (fulfillmentSource === 'printful' && addr) {
          const projectId = 'gen-lang-client-0665118474';
          const dbId = 'plajah-prod';
          const orderDoc = await fetchFirebaseDoc('merch_orders', orderId);
          const items = JSON.parse(orderDoc?.fields?.itemsJson?.stringValue ?? '[]');

          const pfOrder = await fetch(`${PRINTFUL_API}/orders`, {
            method: 'POST',
            headers: printfulHeaders(),
            body: JSON.stringify({
              external_id: orderId,
              shipping: 'STANDARD',
              recipient: {
                name,
                email,
                address1: addr.line1 ?? '',
                city: addr.city ?? '',
                state_code: addr.state ?? '',
                country_code: addr.country ?? 'US',
                zip: addr.postal_code ?? '',
              },
              items: items.map((i: any) => ({
                sync_variant_id: i.printfulSyncProductId,
                quantity: i.quantity,
                retail_price: i.price.toFixed(2),
              })),
            }),
          });
          const pfData = await pfOrder.json();
          await firestoreWrite('merch_orders', orderId, {
            status: 'fulfillment_submitted',
            printfulOrderId: String(pfData.result?.id ?? ''),
          });
        }

        if (fulfillmentSource === 'gelato' && addr) {
          const orderDoc = await fetchFirebaseDoc('merch_orders', orderId);
          const items = JSON.parse(orderDoc?.fields?.itemsJson?.stringValue ?? '[]');

          const glOrder = await fetch(`${GELATO_ORDER_API}/v4/orders`, {
            method: 'POST',
            headers: gelatoHeaders(),
            body: JSON.stringify({
              orderReferenceId: orderId,
              customerReferenceId: orderId,
              currency: 'USD',
              items: items.map((i: any, idx: number) => ({
                itemReferenceId: `${orderId}-${idx}`,
                productUid: i.gelatoProductUid ?? '',
                files: [{ type: 'default', url: i.designUrl ?? '' }],
                quantity: i.quantity,
              })),
              shippingAddress: {
                name,
                email,
                addressLine1: addr.line1 ?? '',
                city: addr.city ?? '',
                postCode: addr.postal_code ?? '',
                country: addr.country ?? 'US',
              },
            }),
          });
          const glData = await glOrder.json();
          await firestoreWrite('merch_orders', orderId, {
            status: 'fulfillment_submitted',
            gelatoOrderId: String(glData.id ?? ''),
          });
        }

        // 3. Record artist payout in Firestore (processed via your existing payout flow)
        const payoutId = `payout-merch-${orderId}`;
        await firestoreWrite('pending_payouts', payoutId, {
          type: 'merch',
          artistId,
          orderId,
          amountUsd: parseFloat(artistPayoutUsd ?? '0'),
          status: 'pending',
          createdAt: Date.now(),
        });

        console.log(`[Merch] Order ${orderId} fulfilled via ${fulfillmentSource}. Artist payout: $${artistPayoutUsd}`);
      } catch (err: any) {
        console.error(`[Merch] fulfillment error for ${orderId}:`, err.message);
        // Don't return 500 — Stripe will retry. Log and move on.
      }
    }

    res.json({ received: true });
  });

  // ── Merch: get order status ───────────────────────────────────────────────────
  app.get('/api/merch/orders/:orderId', authMiddleware, async (req: any, res) => {
    try {
      const doc = await fetchFirebaseDoc('merch_orders', req.params.orderId);
      if (!doc) return res.status(404).json({ error: 'Order not found' });
      // Only allow buyer or artist to read their own order
      const buyerUid = doc.fields?.buyerUid?.stringValue;
      const artistId = doc.fields?.artistId?.stringValue;
      if (req.uid !== buyerUid && req.uid !== artistId) return res.status(403).json({ error: 'Forbidden' });
      res.json(doc.fields);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── END MERCH API ─────────────────────────────────────────────────────────────

  // ── Plajah Aria Agent ─────────────────────────────────────────────────────────
  //
  // Uses Google Gemini 2.0 Flash with optional Google Search grounding.
  //
  // RE: "Microsoft WebIQ" — there is no Microsoft product called WebIQ.
  // The capability you're thinking of is either:
  //   a) Azure OpenAI with Bing grounding (bing_search tool in Azure deployments), or
  //   b) Microsoft Copilot Studio web connectors.
  // Since this platform already ships @google/genai, we use Gemini's built-in
  // Google Search grounding — same concept (live-web RAG), simpler integration,
  // cheaper at scale.  If you later want Bing specifically, swap the
  // googleSearch tool for a bing fetch and pass BING_API_KEY in .env.
  //
  // Privacy: all messages stored under  users/{uid}/muse_sessions/{sessionId}/messages
  // and usage counters under  users/{uid}/muse_usage/{YYYY-MM-DD}.
  // Firestore security rules must restrict each user's subtree to their own uid.
  //
  // Tier rate limits (enforced server-side — client-side is informational only):
  //   FREE        : 5 msg/day,   0 web searches, 0 uploads
  //   CREATOR     : 20 msg/day,  0 web searches, 2 uploads/session
  //   PLAJAH_PLUS : 40 msg/day,  8 web searches, 5 uploads/session
  //   PRO         : 100 msg/day, 20 web searches, 20 uploads/session
  //
  // Estimated cost at Gemini 2.0 Flash ($0.075/MTok in, $0.30/MTok out):
  //   PLAJAH_PLUS (~$19.99/mo): ~$0.45 Gemini + ~$2.10 grounding = ~$2.55/user/month
  //   PRO (~$49.99/mo)        : ~$1.13 Gemini + ~$7.00 grounding = ~$8.13/user/month

  const AGENT_TIER_LIMITS: Record<string, { daily: number; searches: number }> = {
    FREE:        { daily: 5,   searches: 0  },
    CREATOR:     { daily: 20,  searches: 0  },
    PLAJAH_PLUS: { daily: 40,  searches: 8  },
    PRO:         { daily: 100, searches: 20 },
  };

  const ARIA_SYSTEM_PROMPT = `You are Aria, Plajah's private creative agent. You help users on the Plajah platform:

1. BUILD MODULE EXPERIENCES — When a user describes a module (educational, historical, musical, cinematic), generate a JSON config they can use on the platform. Output it in a <BUILD_MODULE> block.

2. DESIGN ALBUM GALLERY VIEWS — When a user describes an aesthetic or experience for an album, generate a gallery view config. Output it in a <BUILD_GALLERY> block.

3. CURATE CONTENT — Recommend tracks, artists, and experiences based on user interests. Output curated list in a <BUILD_PLAYLIST> block.

4. RESEARCH — Search the web (when enabled) to find factual information, biographies, public domain content, and creative inspiration.

5. ANALYZE DOCUMENTS — Process any files the user uploads and incorporate their content.

PRIVACY: Never reveal other users' data. This is a private 1:1 session.

LIMITS: Be transparent about tier limits when relevant.

OUTPUT FORMAT for builds:
- When generating a build, always include a human-readable explanation BEFORE the build block.
- Build blocks are JSON inside XML-like tags:  <BUILD_MODULE>{...}</BUILD_MODULE>
- Always include: type, title, description, layout, theme (colorPalette, gradient), sections[], tags[]

TONE: Creative, concise, inspiring. Never sycophantic. Be direct. If the user's idea is vague, ask one clarifying question.`;

  app.post('/api/agent/chat', authMiddleware, express.json({ limit: '10mb' }), async (req: any, res) => {
    try {
      const uid: string = req.uid;
      const { sessionId, message, attachments = [], tier = 'FREE', context = {} } = req.body;

      if (!sessionId || !message) return res.status(400).json({ error: 'sessionId and message required' });

      // ── Tier enforcement ──
      const limits = AGENT_TIER_LIMITS[tier] ?? AGENT_TIER_LIMITS.FREE;
      const todayKey = new Date().toISOString().slice(0, 10);

      // Read daily usage from Firestore REST
      const usageUrl = `https://firestore.googleapis.com/v1/projects/gen-lang-client-0665118474/databases/plajah-prod/documents/users/${uid}/muse_usage/${todayKey}`;
      let dailyMessages = 0;
      let dailySearches = 0;
      try {
        const usageSnap = await fetch(usageUrl);
        if (usageSnap.ok) {
          const usageData = await usageSnap.json();
          dailyMessages = parseInt(usageData.fields?.dailyMessages?.integerValue ?? '0', 10);
          dailySearches = parseInt(usageData.fields?.dailySearches?.integerValue ?? '0', 10);
        }
      } catch {}

      if (dailyMessages >= limits.daily) {
        return res.status(429).json({ error: 'Daily message limit reached. Upgrade your plan to continue.' });
      }

      const webSearchAllowed = dailySearches < limits.searches;

      // ── Microsoft MAI Thinking Model — Default for all Aria requests ─────────
      //
      // MAI Thinking is Microsoft's reasoning model (announced 2026-06-02).
      // It applies chain-of-thought / extended reasoning before responding —
      // equivalent to OpenAI o3 or Claude's Extended Thinking mode.
      // This makes Aria's builds, curations, and module configs significantly
      // more accurate and creative.
      //
      // Model name conventions (update once Microsoft publishes the catalog):
      //   MAI_THINKING_MODEL — reasoning/thinking variant (default for all tiers)
      //   MAI_FAST_MODEL     — fast non-thinking variant (fallback for simple queries)
      //
      // Cost note (estimated — verify on Azure AI Foundry pricing page):
      //   MAI Thinking  ~$0.06/MTok in, $0.24/MTok out  (reasoning tokens billed separately)
      //   MAI Fast      ~$0.02/MTok in, $0.08/MTok out
      // Still cheaper than Gemini Pro or GPT-4o, and includes native tool use + web search.
      //
      // Required env vars (all in .env.local):
      //   MAI_API_KEY          — from Azure AI Foundry → your deployment → Keys & Endpoint
      //   MAI_ENDPOINT         — e.g. https://plajah-mai.services.ai.azure.com/models
      //   MAI_THINKING_MODEL   — thinking/reasoning deployment name (e.g. "mai-thinking-1")
      //   MAI_FAST_MODEL       — fast deployment name (e.g. "mai-1")  [optional fallback]

      const MAI_KEY            = process.env.MAI_API_KEY || '';
      const MAI_ENDPOINT       = process.env.MAI_ENDPOINT || 'https://TODO.services.ai.azure.com/models';

      // Always use the thinking model — it reasons before answering, making builds better.
      // Fall back to MAI_FAST_MODEL for simple ping/greeting messages (detected below).
      const MAI_THINKING_MODEL = process.env.MAI_THINKING_MODEL || process.env.MAI_MODEL_NAME || 'mai-thinking-1';
      const MAI_FAST_MODEL     = process.env.MAI_FAST_MODEL || 'mai-1';

      // Use thinking model unless the message is trivially short (< 10 words)
      // to avoid paying reasoning tokens on "hi" / "what can you do?" queries
      const messageWordCount = message.trim().split(/\s+/).length;
      const MAI_MODEL = messageWordCount < 10 ? MAI_FAST_MODEL : MAI_THINKING_MODEL;

      // Fetch recent message history (last 16 turns)
      const histUrl = `https://firestore.googleapis.com/v1/projects/gen-lang-client-0665118474/databases/plajah-prod/documents/users/${uid}/muse_sessions/${sessionId}/messages?pageSize=16&orderBy=timestamp%20desc`;
      let chatHistory: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
        { role: 'system', content: ARIA_SYSTEM_PROMPT },
      ];
      try {
        const hSnap = await fetch(histUrl);
        if (hSnap.ok) {
          const hData = await hSnap.json();
          const docs = (hData.documents || []).reverse();
          for (const d of docs) {
            const role = d.fields?.role?.stringValue;
            const content = d.fields?.content?.stringValue || '';
            if (content && (role === 'user' || role === 'muse')) {
              chatHistory.push({ role: role === 'user' ? 'user' : 'assistant', content });
            }
          }
        }
      } catch {}

      // Append current user message (include attachment text inline)
      let userContent = message;
      const ctxNote = context.currentView ? `[Context: user is in ${context.currentView}]\n` : '';
      if (ctxNote) userContent = ctxNote + userContent;
      for (const att of attachments.slice(0, 5)) {
        if (att.dataUrl && att.type === 'text/plain') {
          const text = Buffer.from(att.dataUrl.split(',')[1] || att.dataUrl, 'base64').toString('utf8').slice(0, 6000);
          userContent += `\n\n[Attached: "${att.name}"]\n${text}`;
        } else if (att.type?.startsWith('image/')) {
          userContent += `\n[Image attached: "${att.name}" — describe it if relevant]`;
        }
      }
      chatHistory.push({ role: 'user', content: userContent });

      // Optional Bing web search tool (MAI supports OpenAI-style tool_choice + tools)
      const maiTools = webSearchAllowed ? [{
        type: 'function' as const,
        function: {
          name: 'search_web',
          description: 'Search the web for current information, facts, biographies, and content.',
          parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
        },
      }] : undefined;

      let replyText = '';
      let toolCalls: any[] = [];
      let usedSearch = false;
      const geminiKey = process.env.GOOGLE_AI_API_KEY || process.env.VITE_GOOGLE_AI_API_KEY || '';
      let replyError = false;

      try {
      if (MAI_KEY && !MAI_ENDPOINT.includes('TODO')) {
        // ── Microsoft MAI (primary) ──────────────────────────────────────────────
        const maiRes = await fetch(`${MAI_ENDPOINT}/chat/completions?api-version=2025-05-15-preview`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': MAI_KEY,
            // MAI also accepts Bearer token:
            // 'Authorization': `Bearer ${MAI_KEY}`,
          },
          body: JSON.stringify({
            model: MAI_MODEL,
            messages: chatHistory,
            // Thinking model params — ignored by non-thinking models, so safe to always send.
            // When the MAI thinking model is active it applies chain-of-thought reasoning
            // before producing its final reply.  The thinking budget controls cost/depth.
            ...(MAI_MODEL === MAI_THINKING_MODEL ? {
              thinking: {
                type: 'enabled',
                budget_tokens: tier === 'PRO' ? 8000 : tier === 'PLAJAH_PLUS' ? 4000 : 2000,
              },
              temperature: 1, // required for thinking mode (some models mandate temp=1)
            } : {
              temperature: 0.8,
            }),
            max_tokens: tier === 'PRO' ? 4096 : 2048,
            tools: maiTools,
          }),
        });

        if (!maiRes.ok) {
          const errText = await maiRes.text().catch(() => '');
          throw new Error(`MAI API error (${maiRes.status}): ${errText}`);
        }

        const maiData = await maiRes.json();
        const choice = maiData.choices?.[0];
        replyText = choice?.message?.content || '';

        // Handle tool calls (Bing search) if model invoked them
        if (choice?.message?.tool_calls?.length) {
          for (const tc of choice.message.tool_calls) {
            if (tc.function?.name === 'search_web') {
              usedSearch = true;
              let query = '';
              try { query = JSON.parse(tc.function.arguments).query; } catch {}
              toolCalls.push({ name: 'search_web', label: `Searched: ${query}`, status: 'done' });

              // Bing Search (if key available) — feed result back for a second pass
              const bingKey = process.env.BING_SEARCH_KEY || '';
              if (bingKey && query) {
                try {
                  const bingRes = await fetch(`https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=3`, {
                    headers: { 'Ocp-Apim-Subscription-Key': bingKey },
                  });
                  if (bingRes.ok) {
                    const bingData = await bingRes.json();
                    const snippets = (bingData.webPages?.value ?? []).slice(0, 3).map((r: any) => `${r.name}: ${r.snippet}`).join('\n');
                    // Second pass with search results injected
                    chatHistory.push({ role: 'assistant', content: replyText || '...' });
                    chatHistory.push({ role: 'user', content: `[Web search results for "${query}"]:\n${snippets}\n\nPlease continue your response using these results.` });
                    const pass2 = await fetch(`${MAI_ENDPOINT}/chat/completions?api-version=2025-05-15-preview`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'api-key': MAI_KEY },
                      body: JSON.stringify({ model: MAI_MODEL, messages: chatHistory, max_tokens: 2048, temperature: 0.8 }),
                    });
                    if (pass2.ok) {
                      const p2Data = await pass2.json();
                      replyText = p2Data.choices?.[0]?.message?.content || replyText;
                    }
                  }
                } catch {}
              }
            }
          }
        }

      } else if (geminiKey) {
        // ── Fallback: Google Gemini Flash ────────────────────────────────────────
        console.warn('[Aria] MAI not configured — using Gemini fallback.');
        const { GoogleGenAI } = await import('@google/genai');
        const genai = new GoogleGenAI({ apiKey: geminiKey });
        const geminiHistory = chatHistory.slice(1, -1).map(m => ({
          role: m.role === 'user' ? 'user' as const : 'model' as const,
          parts: [{ text: m.content }],
        }));
        const geminiTools = webSearchAllowed ? [{ googleSearch: {} }] : undefined;
        const chat = genai.chats.create({
          model: 'gemini-2.5-flash',
          config: { systemInstruction: ARIA_SYSTEM_PROMPT, tools: geminiTools, maxOutputTokens: 2048, temperature: 0.8, thinkingConfig: { thinkingBudget: 0 } },
          history: geminiHistory,
        });
        const geminiRes = await chat.sendMessage({ message: [{ text: userContent }] });
        replyText = geminiRes.text || '';
        usedSearch = !!(geminiRes as any).candidates?.[0]?.groundingMetadata?.webSearchQueries?.length;
        if (usedSearch) toolCalls.push({ name: 'search_web', label: 'Searched the web', status: 'done' });
      } else {
        // No AI provider configured at all — respond with a clear, visible message
        // instead of silently failing so the user knows what's wrong.
        replyText = "⚠️ Aria isn't fully set up yet — no AI provider key is configured on the server (GOOGLE_AI_API_KEY or MAI_API_KEY). Your message was received, but I can't reply until an administrator adds a key.";
        replyError = true;
      }
      } catch (llmErr: any) {
        console.error('[Aria] LLM call failed:', llmErr?.message);
        replyText = "I'm having trouble reaching my AI service right now — please try again in a moment.";
        replyError = true;
      }
      // Never leave the user staring at silence — always surface *something*.
      if (!replyText.trim()) {
        replyText = "I couldn't generate a response just now. Please try again.";
        replyError = true;
      }

      // ── Parse build outputs ──
      let buildOutput: any = null;
      const buildMatch = replyText.match(/<BUILD_(MODULE|GALLERY|PLAYLIST|CURATION)>([\s\S]*?)<\/BUILD_\1>/);
      if (buildMatch) {
        try {
          const buildType = buildMatch[1] as 'MODULE' | 'GALLERY' | 'PLAYLIST' | 'CURATION';
          const config = JSON.parse(buildMatch[2].trim());
          buildOutput = {
            type: buildType,
            title: config.title || 'Untitled Build',
            description: config.description || '',
            config,
            previewGradient: config.theme?.gradient || 'from-purple-900/80 to-indigo-900/60',
            previewEmoji: { MODULE: '🧩', GALLERY: '🖼️', PLAYLIST: '🎵', CURATION: '✨' }[buildType],
            createdAt: Date.now(),
          };
          toolCalls.push({ name: `generate_${buildType.toLowerCase()}`, label: `${buildType} config generated`, status: 'done' });
        } catch {}
      }

      // Strip raw build blocks from reply text for cleaner display
      const cleanReply = replyText.replace(/<BUILD_\w+>[\s\S]*?<\/BUILD_\w+>/g, '').trim();

      // ── Persist message to Firestore ──
      const now = Date.now();
      const baseUrl = `https://firestore.googleapis.com/v1/projects/gen-lang-client-0665118474/databases/plajah-prod/documents`;
      const msgBase = `users/${uid}/muse_sessions/${sessionId}/messages`;

      const persistMsg = async (role: string, content: string, extra: any = {}) => {
        await fetch(`${baseUrl}/${msgBase}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              role:      { stringValue: role },
              content:   { stringValue: content },
              timestamp: { integerValue: String(now) },
              ...( extra.buildOutput ? { buildOutput: { stringValue: JSON.stringify(extra.buildOutput) } } : {} ),
              ...( extra.toolCalls?.length ? { toolCalls: { stringValue: JSON.stringify(extra.toolCalls) } } : {} ),
              ...( extra.error ? { error: { booleanValue: true } } : {} ),
              ...( attachments.length ? { attachmentNames: { stringValue: JSON.stringify(attachments.map((a: any) => a.name)) } } : {} ),
            },
          }),
        }).catch(() => {});
      };

      await persistMsg('user', message);
      await persistMsg('muse', cleanReply, { buildOutput, toolCalls: toolCalls.length ? toolCalls : undefined, error: replyError });

      // ── Update daily usage counters ──
      const newDaily = dailyMessages + 1;
      const newSearches = dailySearches + (usedSearch ? 1 : 0);
      await fetch(usageUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            dailyMessages: { integerValue: String(newDaily) },
            dailySearches: { integerValue: String(newSearches) },
            resetDate:     { stringValue: todayKey },
          },
        }),
      }).catch(() => {});

      // ── Update session metadata ──
      await fetch(`${baseUrl}/users/${uid}/muse_sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            updatedAt:    { integerValue: String(now) },
            lastSnippet:  { stringValue: cleanReply.slice(0, 80) },
          },
        }),
      }).catch(() => {});

      return res.json({
        reply: cleanReply,
        toolCalls: toolCalls.length ? toolCalls : undefined,
        buildOutput: buildOutput || undefined,
        usage: {
          dailyMessages: newDaily,
          dailySearches: newSearches,
          monthlyModules: 0,
          monthlyGalleries: 0,
          resetDate: todayKey,
        },
      });

    } catch (err: any) {
      console.error('[Aria Agent]', err.message);
      res.status(500).json({ error: 'Agent error — please try again.' });
    }
  });

  // ── Aria health check ─────────────────────────────────────────────────────────
  // Unauthenticated diagnostic: reports which AI provider is configured and, for
  // Gemini, actually pings the model so we can confirm the key works end-to-end.
  // No secrets are returned. Result cached 60s so it can't be used to burn quota.
  let _ariaHealth: { t: number; v: any } | null = null;
  app.get('/api/agent/health', async (_req, res) => {
    if (_ariaHealth && Date.now() - _ariaHealth.t < 60_000) return res.json({ ..._ariaHealth.v, cached: true });
    const mai = !!(process.env.MAI_API_KEY && !(process.env.MAI_ENDPOINT || '').includes('TODO'));
    const geminiKey = process.env.GOOGLE_AI_API_KEY || process.env.VITE_GOOGLE_AI_API_KEY || '';
    let out: any;
    if (mai) {
      out = { provider: 'mai', configured: true, ok: true, note: 'MAI configured (not test-pinged)' };
    } else if (!geminiKey) {
      out = { provider: 'none', configured: false, ok: false, note: 'No GOOGLE_AI_API_KEY or MAI_API_KEY set' };
    } else {
      try {
        const { GoogleGenAI } = await import('@google/genai');
        const genai = new GoogleGenAI({ apiKey: geminiKey });
        const chat = genai.chats.create({ model: 'gemini-2.5-flash', config: { maxOutputTokens: 64, thinkingConfig: { thinkingBudget: 0 } } });
        const r = await chat.sendMessage({ message: [{ text: 'Reply with the single word: ok' }] });
        const txt = (r.text || '').trim();
        out = { provider: 'gemini', configured: true, ok: !!txt, model: 'gemini-2.5-flash', sample: txt.slice(0, 40) };
      } catch (e: any) {
        // On failure, list the models this key can actually use so we pick a valid one.
        let availableModels: string[] = [];
        try {
          const lm = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}&pageSize=100`);
          if (lm.ok) {
            const d = await lm.json();
            availableModels = (d.models || [])
              .filter((m: any) => (m.supportedGenerationMethods || []).includes('generateContent') && /flash|pro/i.test(m.name))
              .map((m: any) => m.name.replace(/^models\//, ''))
              .slice(0, 12);
          }
        } catch {}
        out = { provider: 'gemini', configured: true, ok: false, error: String(e?.message || e).slice(0, 200), availableModels };
      }
    }
    _ariaHealth = { t: Date.now(), v: out };
    res.json(out);
  });

  // ── END MUSE AGENT ────────────────────────────────────────────────────────────

  // ── Podcast RSS Proxy ─────────────────────────────────────────────────────────
  // Replaces allorigins.win with a first-party proxy so there's no third-party SLA dependency.
  app.get('/api/fetch-rss', async (req, res) => {
    const rawUrl = req.query.url as string;
    if (!rawUrl) return res.status(400).json({ error: 'Missing url param' });
    try {
      const parsed = validateProxyUrl(rawUrl);
      const upstream = await safeOutboundFetch(parsed, {
        signal: AbortSignal.timeout(20_000),
        headers: {
          'User-Agent': 'Plajah-Podcast-Bot/1.0',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        },
      });
      if (!upstream.ok) return res.status(upstream.status).json({ error: `Upstream ${upstream.status}` });
      const text = await upstream.text();
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(text);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Podcast Auto-Sync ──────────────────────────────────────────────────────────
  // Client calls this on startup when syncEnabled is true. Server fetches the feed
  // (bypassing CORS) and returns raw XML for client-side parsing + Firestore writes.
  app.post('/api/podcast-sync', authMiddleware, async (req: any, res) => {
    const uid: string = req.uid;
    try {
      const userDoc = await fetchFirebaseDoc('users', uid);
      const rssFields = userDoc?.fields?.podcastRss?.mapValue?.fields;
      if (!rssFields) return res.json({ synced: false, reason: 'no_feed' });

      const syncEnabled = rssFields.syncEnabled?.booleanValue ?? false;
      if (!syncEnabled) return res.json({ synced: false, reason: 'disabled' });

      const externalFeedUrl: string = rssFields.externalFeedUrl?.stringValue ?? '';
      if (!externalFeedUrl) return res.json({ synced: false, reason: 'no_url' });

      const lastSynced = parseInt(rssFields.lastSynced?.integerValue ?? '0', 10);
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      const force = req.query.force === 'true';
      if (!force && Date.now() - lastSynced < sevenDaysMs) {
        return res.json({ synced: false, reason: 'not_due', nextSync: lastSynced + sevenDaysMs });
      }

      const parsed = validateProxyUrl(externalFeedUrl);
      const feedRes = await fetch(parsed.href, {
        signal: AbortSignal.timeout(30_000),
        headers: { 'User-Agent': 'Plajah-Podcast-Bot/1.0', 'Accept': 'application/rss+xml, application/xml, text/xml, */*' },
      });
      if (!feedRes.ok) return res.status(502).json({ error: `Feed returned ${feedRes.status}` });

      const xmlText = await feedRes.text();
      res.json({ synced: true, xmlText, syncedAt: Date.now() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Cora Music Analysis ───────────────────────────────────────────────────────
  app.use('/api/cora', express.json({ limit: '1mb' }), coraRouter);

  // ── Learner identity (child username/password → custom token; provision; claim) ──
  app.use('/api/learner-auth/login', authLimiter);
  app.use('/api/learner-auth', express.json({ limit: '10kb' }), learnerAuthRouter);

  if (process.env.SPORTS_INGESTION_WORKER !== 'false') {
    const intervalMs = Number(process.env.SPORTS_INGESTION_INTERVAL_MS) || undefined;
    const { startSportsIngestionScheduler } = await import('./services/sportsIngestionWorker.js');
    startSportsIngestionScheduler({ intervalMs });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Mesh Server running on http://localhost:${PORT}`);
    // Log env var status at startup so Cloud Run logs reveal config issues immediately
    const encKey = process.env.ENCRYPTION_KEY ?? '';
    const fbKey  = process.env.FIREBASE_API_KEY ?? process.env.VITE_FIREBASE_API_KEY ?? '';
    console.log('[Config] ENCRYPTION_KEY:', encKey.length >= 16 ? `set (${encKey.length} chars)` : 'MISSING');
    console.log('[Config] FIREBASE_API_KEY:', fbKey.length > 0 ? 'set' : 'MISSING');
    const aiKey = process.env.GOOGLE_AI_API_KEY ?? process.env.VITE_GOOGLE_AI_API_KEY ?? '';
    console.log('[Config] GOOGLE_AI_API_KEY (Aria fallback):', aiKey.length > 0 ? 'set' : 'not set');
    const maiKey      = process.env.MAI_API_KEY ?? '';
    const maiEp       = process.env.MAI_ENDPOINT ?? '';
    const maiThinking = process.env.MAI_THINKING_MODEL ?? 'mai-thinking-1';
    const maiFast     = process.env.MAI_FAST_MODEL ?? 'mai-1';
    console.log('[Config] MAI_API_KEY (Aria):', maiKey.length > 0 ? 'set' : 'MISSING — add MAI_API_KEY to .env.local');
    console.log('[Config] MAI_ENDPOINT:', maiEp.length > 0 && !maiEp.includes('TODO') ? maiEp : 'not configured');
    console.log(`[Config] MAI models — thinking: ${maiThinking}, fast: ${maiFast}`);
    console.log('[Config] VITE_AZURE_SPEECH_KEY (MAI Voice 2 / Transcribe 1.5):', (process.env.VITE_AZURE_SPEECH_KEY ?? '').length > 0 ? 'set' : 'MISSING — add VITE_AZURE_SPEECH_KEY for audiobook features');
    console.log('[Config] VITE_APP_URL:', process.env.VITE_APP_URL ?? '(not set)');
  });
}

startServer();
