import express from 'express';
import { cleanDescription } from './utils/description';
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
import { resolveLine as resolveInventoryLine, planDecrement as planDecrementInventory, variantStockSeed as variantStockSeedInventory, isTracked as isTrackedInventory, isSafeVariantId as isSafeVariantIdInventory } from './services/inventoryCore';
import { computeTax, parseTaxSettings, normalizeTaxClass, type TaxSettings } from './services/taxCore';
import { validateTenders, sanitizeTip, parseTenders, tenderLabel, isStoredValueTender, type Tender } from './services/tenderCore';
import { refundNeedsManager, restockMoveId, REFUND_REASONS, commitRefund, planFromOrderDoc, refundLogOf, orderLinesFromDoc, clawbackPoints, applyClawback, type RefundMethod, type RefundReason } from './services/refundCore';
import { casUpdate, type CasStore } from './services/casCore';
import { applyOp, generateCode, formatCode, last4Of, normalizeCode, ledgerEntryId, cleanIdem, rateCheck, sanitizeIssueAmount, buildLiabilityReport, searchCards, giftCardEmailText, isExpired as svIsExpired, DEFAULT_LIMITS as SV_DEFAULT, type CardKind, type LedgerOp, type OpResult, type RateState, type StoredValueLimits } from './services/storedValueCore';
import { bestOffer, type BusinessOffer } from './services/offersCore';
import { buildZReport, sanitizeMovement, normalizeOrder as normalizeOrderZ, normalizeRefund as normalizeRefundZ, type DrawerMovement, type ZReport } from './services/drawerCore';
import { registerPermissionsFor, isValidPin, isValidNewPin, composeDiscounts, DEFAULT_DISCOUNT_LIMIT_PCT, canApprove, recordAttempt, isLocked, type RegisterPermission, type AttemptState } from './services/registerAuthCore';
import { hashPin, verifyPin, signSession, verifySession, SESSION_TTL_MS } from './services/registerAuthServer';
import { registerTicketRoutes, ticketSaleHooks } from './services/ticketServer';
import { registerLaundryRoutes, loadWalletPromo } from './services/laundryServer';
import { computeTopUpBonus, bonusIdemKey } from './services/walletPromoCore';
import { registerAutoRoutes } from './services/autoServer';
import { buildLinearMediaPlaylist, currentProgrammeMasterUrl, buildM3uLineup, type M3uChannel } from './services/fastChannelHls';
import nodeCrypto from 'node:crypto';
import { spawn } from 'node:child_process';
import dgram from 'node:dgram';
import os from 'node:os';
import Stripe from 'stripe';
import { coraRouter } from './routes/cora';
import { createMusicLabRouter } from './routes/musicLab';
import { createAdminFilmIngestRouter } from './routes/adminFilmIngest';
import { learnerAuthRouter } from './routes/learnerAuth';
import { schoolsRouter } from './routes/schools';
import { postmanRouter } from './routes/postman';
import { campaignsRouter } from './routes/campaigns';
import { academiaIntegrityRouter } from './routes/academiaIntegrity';
import { kithSightingsRouter } from './routes/kithSightings';
import { createAriaSpeakRouter, decideAriaVoiceAccess } from './routes/ariaSpeak';
import { decideVerifiedAgentTier, type VerifiedAgentTier, type VerifiedFacts } from './services/aria/ariaTier';
import { isVerifiedAdmin } from './services/platformAdmin';
import { socialServerRouter } from './routes/socialServer';
import { veoRouter } from './routes/veo';
import { taleoRouter, enqueueIfReady as taleoEnqueueIfReady } from './routes/taleo';
import { authMethodsRouter } from './routes/authMethods';
import { fseGamesRouter } from './routes/fseGames';
import { threatProtectionRouter } from './routes/threatProtection';
import { homeDiscoveryRouter } from './routes/homeDiscovery';
import { matterRouter } from './routes/matterRoutes';
import { createCustomToken, fsGet, fsSet, fsPatch, fsDelete } from './services/firebaseAdminRest';
// Fabula generation agent — server-side only (these carry the user's provider API key).
import {
  submitMagnific as magnificSubmit, pollMagnific as magnificPoll, verifyMagnificKey,
  opForInput as magnificOpFor, mysticAspect as magnificAspect, fetchAsBase64,
} from './services/fabula/magnificApi';
import {
  submitRunway as runwaySubmit, pollRunway as runwayPoll, verifyRunwayKey,
  opForRunwayInput as runwayOpFor, runwayAspect,
} from './services/fabula/runwayApi';
import {
  saveKey as genVaultSaveKey, readKey as genVaultReadKey, revokeKey as genVaultRevokeKey,
  listLinked as genVaultListLinked, type VaultStore as GenVaultStore,
} from './services/fabula/genVault';
import { mirrorResults as mirrorGenResults } from './services/fabula/genMirror';
import { buildFfmpegArgs } from './services/crossover/engine';
import { extFor } from './services/crossover/formats';
import type { Recipe as CxRecipe, MediaKind as CxKind, MediaProbe as CxProbe } from './services/crossover/types';
import { ARIA_ART_COUNCIL_METHOD } from './services/aria/ariaCreativeRoles';
import { protectPlaylist } from './services/choraUploadQueue';
import { createCouncil } from './services/council/councilRoutes';
import { FABULA_BROADCAST_PACKS } from './services/fabula/broadcastPacks';
import {
  runChoraTranscodeWorker, startChoraTranscodeScheduler, PROCESSING_STALE_MS,
  type ChoraTranscodeDeps, type TrackCandidate as ChoraTrackCandidate,
} from './services/choraTranscodeWorker.js';
import {
  type ChoraVoiceTrack,
  handleAlexaRequest,
  searchChora,
  getChoraTrackByToken,
  verifyAlexaSignature,
} from './services/alexaService.js';
import { handleGoogleActionRequest } from './services/googleHomeService.js';
import { handleBixbyRequest } from './services/bixbyService.js';
import {
  DEFAULT_CHART, sysAccountsOf, accountDocId, journalDocId, payoutDocId, payoutLineDocId, onlineGiftDocId,
  onlineGiftEntry, feeEntry, refundEntry, disputeFeeEntry, payoutEntry,
  type DraftJournal, type SysAccounts,
} from './services/acctPosting';
import { grossUpCents, giftCentsFromGross, applicationFeePercent } from './services/giftFees';
import { createBilling } from './routes/billing';
import { deriveAlerts as pulseDeriveAlerts, alertAudience as pulseAudience, prefAllows as pulsePrefAllows } from './services/acctPulse';

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

// Guard dev server process against background worker gRPC and transient network stream terminations
process.on('unhandledRejection', (reason) => {
  console.warn('[Server] Handled rejection:', reason);
});
process.on('uncaughtException', (error) => {
  console.error('[Server] Uncaught exception:', error);
});
process.on('exit', (code) => {
  console.error('[Server] Process exit event with code:', code);
});
process.on('SIGTERM', () => {
  console.error('[Server] Process received SIGTERM');
});
process.on('SIGINT', () => {
  console.error('[Server] Process received SIGINT');
});

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

/** Upload with a Firebase download token attached, so the object can be read back at the same
 *  `firebasestorage.googleapis.com/...?alt=media&token=` URL the client-side uploader produces.
 *  Plain `gcsUpload` can't do this — `uploadType=media` carries no metadata. */
async function gcsUploadWithDownloadToken(
  objectPath: string, data: Buffer, contentType: string, downloadToken: string,
): Promise<boolean> {
  const token = await getGoogleAccessToken();
  if (!token) return false;
  try {
    const boundary = `plajah${nodeCrypto.randomBytes(12).toString('hex')}`;
    const meta = JSON.stringify({
      name: objectPath,
      contentType,
      metadata: { firebaseStorageDownloadTokens: downloadToken },
    });
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`),
      data,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const url = `https://storage.googleapis.com/upload/storage/v1/b/${STORAGE_BUCKET}/o?uploadType=multipart`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: body as any,
    });
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
    model: 'gemini-3.6-flash',
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
      // Gemini 3.x: thinkingBudget is an invalid argument; thinkingLevel replaces it.
      thinkingConfig: { thinkingLevel: 'minimal' },
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
async function cxUsage(uid: string, isAdmin: boolean): Promise<{ isAdmin: boolean; used: number }> {
  const u = await firestoreRead('users', uid);
  // `isAdmin` comes from isPlatformAdminReq (verified), never from the editable profile role.
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
    video: 'videos', album: 'albums', track: 'albums', book: 'albums', movie: 'albums', mix: 'albums',
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

/**
 * Some uncompressed masters (WAV/BWF and the RF64/W64 variants) carry a `data`-chunk
 * size that LIES about the audio length: a zero/placeholder size, a value written before
 * recording finished, or a >4 GB file squeezed into a plain 32-bit WAV field. ffprobe,
 * ffmpeg AND the browser <audio> element all trust that header, so the song silently
 * "ends" after only the declared seconds even though every audio byte uploaded fine —
 * this is the classic "plays only the first N seconds" bug.
 *
 * We detect the lie by comparing the declared duration to what the file's real byte count
 * implies for its PCM parameters, and — for the WAV demuxer family — remux with
 * `-ignore_length 1` (read to EOF, rewrite an honest header) so the WHOLE song transcodes
 * and `durationSec` is correct. Safe no-op when the header is already honest, or when we
 * can't confidently prove it's wrong.
 */
async function choraRepairTruncatedMaster(inPath: string, trackId: string, workDir: string): Promise<{ path: string; trueSec: number; repaired: boolean }> {
  try {
    const probe = await runFfprobe(inPath);
    const fmt = probe.json?.format || {};
    const aStream = (probe.json?.streams || []).find((s: any) => s.codec_type === 'audio') || {};
    const declaredSec = parseFloat(fmt.duration || '0') || 0;
    const formatName = String(fmt.format_name || '').toLowerCase();
    const codec = String(aStream.codec_name || '').toLowerCase();
    const isPcm = codec.startsWith('pcm_');
    // The wav demuxer (which alone accepts -ignore_length) covers wav/bwf/rf64; w64 has a
    // 64-bit size field so it almost never truncates. Gate the remux to the wav demuxer.
    const isWavDemuxer = /(^|,)wav($|,)/.test(formatName) || formatName.includes('rf64');

    // Byte math: for PCM we know exactly how many bytes one second occupies.
    let size = 0;
    try { size = (await fs.stat(inPath)).size; } catch { /* */ }
    const sr = parseInt(aStream.sample_rate || '0', 10) || 0;
    const ch = parseInt(aStream.channels || '0', 10) || 0;
    const bits = parseInt(aStream.bits_per_raw_sample || aStream.bits_per_sample || '0', 10) || 0;
    const bytesPerSec = isPcm && sr && ch && bits ? sr * ch * (bits / 8) : 0;
    // Subtract a generous 64 KB header allowance so honest files never trip the check.
    const impliedSec = bytesPerSec > 0 ? Math.max(0, size - 65536) / bytesPerSec : 0;

    // Suspicious only when the bytes clearly hold much more audio than the header admits.
    const suspicious = bytesPerSec > 0 && impliedSec > declaredSec + 5 && impliedSec > declaredSec * 1.2;
    if (!suspicious) return { path: inPath, trueSec: declaredSec, repaired: false };

    console.warn(`[chora] track ${trackId}: master header claims ${declaredSec.toFixed(1)}s but ${size} PCM bytes imply ~${impliedSec.toFixed(1)}s — attempting header repair (format=${formatName}, codec=${codec})`);
    if (!isWavDemuxer) {
      console.warn(`[chora] track ${trackId}: truncated header on non-WAV demuxer (${formatName}); cannot auto-repair, transcoding as-is`);
      return { path: inPath, trueSec: declaredSec, repaired: false };
    }

    const repairedPath = path.join(workDir, 'repaired_master.wav');
    // -ignore_length must precede -i (it's a wav demuxer input option); -c copy keeps PCM bit-exact.
    const rr = await runFfmpeg(['-y', '-ignore_length', '1', '-i', inPath, '-vn', '-c', 'copy', repairedPath], 300000);
    if (!rr.ok) {
      console.warn(`[chora] track ${trackId}: -ignore_length remux failed, transcoding original: ${rr.err.slice(-200)}`);
      return { path: inPath, trueSec: declaredSec, repaired: false };
    }
    const rp = await runFfprobe(repairedPath);
    const repairedSec = parseFloat(rp.json?.format?.duration || '0') || 0;
    if (repairedSec > declaredSec + 2) {
      console.warn(`[chora] track ${trackId}: header repaired — recovered ${repairedSec.toFixed(1)}s (was ${declaredSec.toFixed(1)}s)`);
      return { path: repairedPath, trueSec: repairedSec, repaired: true };
    }
    return { path: inPath, trueSec: declaredSec, repaired: false };
  } catch (e: any) {
    console.warn(`[chora] track ${trackId}: header-repair check errored, transcoding as-is: ${e?.message || e}`);
    return { path: inPath, trueSec: 0, repaired: false };
  }
}

interface ChoraTranscodeResult { status: 'ready'; hls: string; low: string; flac: string; loudnessLufs: number; durationSec: number; }
async function choraTranscodeToGcs(inPath: string, trackId: string, publicBase: string, privateToken?: string): Promise<ChoraTranscodeResult> {
  const workDir = path.join(os.tmpdir(), `chora_${trackId}_${Date.now()}`);
  const hlsDir = path.join(workDir, 'aac256');
  await fs.mkdir(hlsDir, { recursive: true });

  // Repair a lying WAV/RF64 header BEFORE any encode so the full song (not just the
  // declared head) flows into every rendition and into durationSec.
  const rep = await choraRepairTruncatedMaster(inPath, trackId, workDir);
  const src = rep.path;

  // 1) Measure loudness (EBU R128 two-pass). print_format=json goes to stderr; parse it.
  let ln = 'loudnorm=I=-14:TP=-1:LRA=11';
  let loudnessLufs = -14;
  const meas = await runFfmpeg(['-hide_banner', '-i', src, '-af', 'loudnorm=I=-14:TP=-1:LRA=11:print_format=json', '-f', 'null', '-'], 180000);
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
  const r1 = await runFfmpeg(['-y', '-i', src, '-vn', '-af', ln, '-c:a', 'aac', '-b:a', '256k', '-ar', '48000',
    '-f', 'hls', '-hls_time', '6', '-hls_segment_type', 'fmp4', '-hls_playlist_type', 'vod', '-hls_flags', 'independent_segments',
    '-hls_segment_filename', path.join(hlsDir, 'seg_%03d.m4s'), path.join(hlsDir, 'playlist.m3u8')], 300000);
  if (!r1.ok) throw new Error('hls encode: ' + r1.err.slice(-300));

  // 3) Data-saver — progressive HE-AAC/AAC.
  const lowPath = path.join(workDir, 'low.m4a');
  const r2 = await runFfmpeg(['-y', '-i', src, '-vn', '-af', ln, ...heArgs, '-ar', '48000', '-movflags', '+faststart', lowPath], 300000);
  if (!r2.ok) throw new Error('low encode: ' + r2.err.slice(-300));

  // 4) Lossless — FLAC.
  const flacPath = path.join(workDir, 'lossless.flac');
  const r3 = await runFfmpeg(['-y', '-i', src, '-vn', '-af', ln, '-c:a', 'flac', '-compression_level', '8', flacPath], 300000);
  if (!r3.ok) throw new Error('flac encode: ' + r3.err.slice(-300));

  // Trust the repaired source's real length; fall back to a fresh probe of it.
  let durationSec = rep.trueSec || 0;
  if (!durationSec) { try { const { json } = await runFfprobe(src); durationSec = parseFloat(json?.format?.duration || '0') || 0; } catch { /* */ } }

  // 5) Upload everything under chora-hls/{trackId}/.
  const ctFor = (f: string) => f.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl'
    : (f.endsWith('.m4s') || f.endsWith('.m4a') || f.endsWith('.mp4')) ? 'audio/mp4'
    : f.endsWith('.flac') ? 'audio/flac' : 'application/octet-stream';
  const uploadFile = async (local: string, rel: string) => {
    let buf = await fs.readFile(local);
    if (privateToken && rel.endsWith('.m3u8')) buf = Buffer.from(protectPlaylist(buf.toString('utf8'), privateToken));
    if (!(await gcsUpload(`${privateToken ? 'chora-private' : 'chora-hls'}/${trackId}/${rel}`, buf, ctFor(rel)))) throw new Error('gcs upload failed: ' + rel);
  };
  for (const f of await fs.readdir(hlsDir)) await uploadFile(path.join(hlsDir, f), `aac256/${f}`);
  await uploadFile(lowPath, 'low.m4a');
  await uploadFile(flacPath, 'lossless.flac');
  fs.rm(workDir, { recursive: true, force: true }).catch(() => {});

  const base = `${publicBase}/api/chora/${privateToken ? 'private-media' : 'media'}/${trackId}`;
  const access = privateToken ? `?access=${encodeURIComponent(privateToken)}` : '';
  return { status: 'ready', hls: `${base}/aac256/playlist.m3u8${access}`, low: `${base}/low.m4a${access}`, flac: `${base}/lossless.flac${access}`, loudnessLufs, durationSec };
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
/**
 * Decode any Firestore REST value, INCLUDING nested maps and arrays of maps.
 *
 * decodeFirestoreScalar above handles only string/number/bool and returns undefined for a
 * mapValue — and the array branch below used to drop those undefineds. So any document field
 * holding an array of OBJECTS decoded to an empty array. `albums.tracks` is exactly that, which
 * meant every album read through fsQueryDocs came back with `tracks: []` and anything counting
 * tracks server-side silently saw zero of them.
 */
const decodeFirestoreValue = (v: any = {}): any => {
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.nullValue !== undefined) return null;
  if (v.arrayValue !== undefined) return (v.arrayValue.values || []).map(decodeFirestoreValue);
  if (v.mapValue !== undefined) return decodeFirestoreFields(v.mapValue.fields || {});
  return undefined;
};
const decodeFirestoreFields = (f: any = {}): any => {
  const out: any = {};
  for (const k in f) out[k] = decodeFirestoreValue(f[k] || {});
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
  const body = { structuredQuery: { from: [{ collectionId }], ...(filters.length ? { where } : {}), limit: limitN } };
  try {
    const res = await fetch(url, { method: 'POST', headers: { ...(await firestoreAuthHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) return [];
    const data = await res.json();
    return (Array.isArray(data) ? data : []).filter((r: any) => r.document).map((r: any) => decodeFirestoreFields(r.document.fields));
  } catch { return []; }
};

// Like queryFirebase, but (a) returns each doc's id alongside its decoded fields —
// required to DELETE the doc — and (b) supports inequality operators for the
// retention sweep. Numeric filter values are serialized as doubleValue to match how
// the Firestore JS SDK writes client-set timestamps (retentionDeleteAt / expiresAt);
// integer/double compare numerically in Firestore, but this avoids any type mismatch.
const fsQueryDocs = async (
  collectionId: string,
  filters: Array<{ field: string; op: string; value: any }>,
  limitN = 200,
): Promise<Array<{ id: string; data: Record<string, any> }>> => {
  const projectId = 'gen-lang-client-0665118474';
  const dbId = 'plajah-prod';
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents:runQuery`;
  const toVal = (v: any) => typeof v === 'number' ? { doubleValue: v } : typeof v === 'boolean' ? { booleanValue: v } : { stringValue: String(v) };
  const fieldFilters = filters.map(f => ({ fieldFilter: { field: { fieldPath: f.field }, op: f.op, value: toVal(f.value) } }));
  const where = fieldFilters.length === 1 ? fieldFilters[0] : { compositeFilter: { op: 'AND', filters: fieldFilters } };
  const body = { structuredQuery: { from: [{ collectionId }], where, limit: limitN } };
  try {
    const res = await fetch(url, { method: 'POST', headers: { ...(await firestoreAuthHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) return [];
    const data = await res.json();
    return (Array.isArray(data) ? data : [])
      .filter((r: any) => r.document)
      .map((r: any) => ({ id: String(r.document.name).split('/').pop()!, data: decodeFirestoreFields(r.document.fields) }));
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

   // Live channels have no content doc. A first-party channel (`plajah:<id>`) resolves from a
   // small static table; an account's channel (`owner:<uid>`) resolves the owner's profile. Either
   // way the card is a branded large-image preview so the link never falls back to generic Plajah.
   if (type === 'channel') {
     try {
       const rawId = String(id);
       const num = String((query as any).n || '').trim();
       let name = 'A live channel';
       let desc = 'Live now on Plajah.';
       let image = `https://${host}/og-default.png`;
       if (rawId.startsWith('owner:')) {
         const ownerId = rawId.slice('owner:'.length);
         const dd = await fetchFirebaseDoc('users', ownerId);
         const ff: any = dd?.fields || {};
         const p = (keys: string[]): string => { for (const k of keys) { const v = ff?.[k]?.stringValue; if (v) return v; } return ''; };
         name = p(['artistName', 'displayName', 'name', 'username', 'handle']) || 'A live channel';
         // The specific channel being shared beats the account name: an owner with several channels
         // (N.1, N.2) names each one, and the link must say which one it opens.
         const sharedSource = String((query as any).source || '');
         if (sharedSource) {
           const fc = await fetchFirebaseDoc('fast_channels', ownerId).catch(() => null);
           const ffc: any = fc?.fields || {};
           const subName = ffc?.subNames?.mapValue?.fields?.[sharedSource]?.stringValue;
           const fastName = sharedSource === `fast_${ownerId}` ? ffc?.name?.stringValue : '';
           name = subName || fastName || name;
         }
         desc = `${name} is live on Plajah${num ? ` — channel ${num}` : ''}. Tune in now.`;
       } else {
         const key = rawId.replace(/^plajah:/, '');
         if (key === 'endless-hour') {
           name = 'The Endless Hour';
           desc = 'Made as you watch. Some of it only for you — a generative meditation channel, live on Plajah.';
         }
       }
       const displayName = num ? `${name} · Plajah ${num}` : name;
       const safeT = htmlEscape(displayName), safeD = htmlEscape(desc);
       const safeI = htmlEscape(image), safeH = htmlEscape(host), safeId = htmlEscape(String(id));
       const safeN = htmlEscape(num);
       const safeSource = htmlEscape(encodeURIComponent(String((query as any).source || '')));
       const tags = html.replace(/[ \t]*<meta\s+(?:property|name)="(?:og:[^"]*|twitter:[^"]*)"[^>]*\/?>\s*/gi, '');
       return tags.replace('</head>', `
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@plajah" />
    <meta name="twitter:title" content="${safeT}" />
    <meta name="twitter:description" content="${safeD}" />
    <meta name="twitter:image" content="${safeI}" />
    <meta property="og:site_name" content="Plajah" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${safeT}" />
    <meta property="og:description" content="${safeD}" />
    <meta property="og:image" content="${safeI}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:url" content="https://${safeH}/?type=channel&amp;id=${safeId}${safeN ? `&amp;n=${safeN}` : ''}${safeSource ? `&amp;source=${safeSource}` : ''}" />
</head>`);
     } catch { return html; }
   }

   // Every shareable asset type → its Firestore collection. Books/songs live in `albums`.
   const collectionFor: Record<string, string> = {
     video: 'videos', reello: 'videos', album: 'albums', track: 'albums', book: 'albums',
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
       const fallback = type === 'mix' ? 'Mix' : type === 'book' ? 'Book' : type === 'game' ? 'Game' : type === 'article' ? 'Article' : type === 'video' ? 'Video' : type === 'videoPlaylist' ? 'Playlist' : type === 'movie' ? 'Film' : 'Album';
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
       desc = `Check out ${title} by ${artist} on Plajah`;
     } else {
       // No resolvable artist — keep the same on-brand copy, just without the "by".
       desc = `Check out ${title} on Plajah`;
     }
     // Only audio/video get an inline player card; the rest use a large-image card.
     if (!(type === 'video' || type === 'reello' || type === 'album' || type === 'track' || type === 'mix')) playerUrl = '';
   }

   // Route the cover through /social-image so the crawler always gets a Meta-safe
   // (<8 MB, correctly-dimensioned 1200×630) JPEG. Raw covers are 20–30 MB PNGs that
   // Facebook silently drops — the #1 reason album art wasn't previewing.
   const resizable = new Set(['album', 'track', 'video', 'reello', 'movie', 'book', 'game', 'article', 'videoPlaylist', 'mix']);
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
   const isMusic = (type === 'album' || type === 'track' || type === 'mix');
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
export interface VerifiedAuthToken {
  uid: string;
  isAnonymous: boolean;
  /** From the verified token itself (not the user-editable profile doc). */
  email?: string;
  emailVerified?: boolean;
}

// Verify a Firebase ID token by its RS256 signature + claims — no API key needed
// (so it survives a referrer-restricted Web API key, which rejects server-side
// accounts:lookup). Standard checks: alg/kid, exp, iat, aud, iss, sub, signature.
async function verifyIdTokenViaJwt(token: string): Promise<VerifiedAuthToken | null> {
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
    if (!ok) return null;
    const isAnonymous = payload.firebase?.sign_in_provider === 'anonymous';
    return { uid: payload.sub, isAnonymous, email: typeof payload.email === 'string' ? payload.email : undefined, emailVerified: payload.email_verified === true };
  } catch (e: any) {
    console.error('[Auth] JWT signature verify error:', e.message);
    return null;
  }
}

async function verifyFirebaseToken(token: string): Promise<VerifiedAuthToken | null> {
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
        const user = data.users?.[0];
        const uid = user?.localId;
        if (uid) {
          const isAnonymous = !user.providerUserInfo || user.providerUserInfo.length === 0;
          return { uid, isAnonymous, email: typeof user.email === 'string' ? user.email : undefined, emailVerified: user.emailVerified === true };
        }
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
  const result = await verifyFirebaseToken(token);
  if (!result) return res.status(401).json({ error: 'Invalid token' });
  req.uid = result.uid;
  req.isAnonymous = result.isAnonymous;
  req.email = result.email;
  req.emailVerified = result.emailVerified === true;
  next();
}

/**
 * Gate for endpoints that cost money, mutate shared content, or trigger heavy compute.
 * Prohibits anonymous/guest accounts to eliminate scripted token burning and bot spam.
 */
function requireRegisteredUser(req: any, res: any, next: any) {
  if (req.isAnonymous) {
    return res.status(403).json({
      error: 'A registered account is required for this feature. Please sign in with email or OAuth.',
      code: 'ANONYMOUS_NOT_ALLOWED'
    });
  }
  next();
}

/**
 * PLATFORM admin check (owner + staff only — never org/business admins). Uses ONLY facts a
 * client cannot write: the verified token email and the server-only `admins/{uid}` collection.
 * It must never read users/{uid}.role|isAdmin|email — that profile is owner-writable, so a user
 * could simply write role:"admin" onto themselves. See services/platformAdmin.ts.
 */
async function isPlatformAdminReq(req: any): Promise<boolean> {
  try {
    return isVerifiedAdmin({
      email: req.email, emailVerified: req.emailVerified === true,
      isAdminDoc: !!(await fetchFirebaseDoc('admins', req.uid)),
      extraAdminEmails: process.env.PLATFORM_ADMIN_EMAILS || process.env.ARIA_VOICE_ADMIN_EMAILS,
    });
  } catch { return false; }
}

/** Express gate: must follow authMiddleware. */
async function requireVerifiedAdmin(req: any, res: any, next: any) {
  if (!(await isPlatformAdminReq(req))) return res.status(403).json({ error: 'Platform admin access required' });
  next();
}

// ── App Check verification ──────────────────────────────────────────────────
let _appCheckCerts: { certs: Record<string, string>; exp: number } | null = null;
async function appCheckCerts(): Promise<Record<string, string>> {
  if (_appCheckCerts && Date.now() < _appCheckCerts.exp) return _appCheckCerts.certs;
  const res = await fetch('https://firebaseappcheck.googleapis.com/v1beta/jwks', { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`App Check JWKS HTTP ${res.status}`);
  const data = await res.json() as { keys?: Array<{ kid: string; x5c?: string[] }> };
  const certs: Record<string, string> = {};
  for (const k of data.keys ?? []) {
    if (k.kid && k.x5c?.[0]) {
      certs[k.kid] = `-----BEGIN CERTIFICATE-----\n${k.x5c[0]}\n-----END CERTIFICATE-----\n`;
    }
  }
  _appCheckCerts = { certs, exp: Date.now() + 3_600_000 };
  return certs;
}

async function verifyAppCheckToken(token: string): Promise<boolean> {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  let header: any, payload: any;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch { return false; }
  if (header.alg !== 'RS256' || !header.kid) return false;
  const now = Math.floor(Date.now() / 1000);
  if (!(typeof payload.exp === 'number' && payload.exp > now)) return false;
  try {
    const certs = await appCheckCerts();
    const cert = certs[header.kid];
    if (!cert) return false;
    return nodeCrypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), cert, Buffer.from(parts[2], 'base64url'));
  } catch {
    return false;
  }
}

// Optional App Check: verifies if header is present, blocks if ENFORCE_APP_CHECK=true
async function appCheckMiddleware(req: any, res: any, next: any) {
  const token = req.headers['x-firebase-appcheck'];
  if (process.env.ENFORCE_APP_CHECK === 'true') {
    if (!token || typeof token !== 'string') {
      return res.status(401).json({ error: 'App Check token required' });
    }
    const valid = await verifyAppCheckToken(token);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid App Check token' });
    }
  } else if (token && typeof token === 'string') {
    req.appCheckValid = await verifyAppCheckToken(token);
  }
  next();
}

function secretsEqual(provided: unknown, expected: unknown): boolean {
  if (typeof provided !== 'string' || typeof expected !== 'string' || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && nodeCrypto.timingSafeEqual(a, b);
}

// Firestore REST helper (reuses existing fetchFirebaseDoc pattern)
async function firestoreWrite(collection: string, id: string, data: object, requireSuccess = false) {
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
  if (!res.ok && requireSuccess) throw new Error(`Conversion state write failed (HTTP ${res.status})`);
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
      else if (v.nullValue !== undefined) out[k] = null;
      else if (v.arrayValue !== undefined) out[k] = (v.arrayValue.values || []).map((item: any) =>
        item.stringValue ?? (item.integerValue !== undefined ? Number(item.integerValue) : item.booleanValue));
      else if (v.mapValue !== undefined) {
        const map: Record<string, any> = {};
        for (const [mk, mv] of Object.entries(v.mapValue.fields || {}) as [string, any][]) {
          map[mk] = mv.stringValue ?? (mv.integerValue !== undefined ? Number(mv.integerValue) : mv.booleanValue);
        }
        out[k] = map;
      }
    }
    return out;
  } catch { return null; }
}

// ── Deep Firestore <-> JS converters ──────────────────────────────────────────
// firestoreRead/firestoreWrite above flatten nested maps and arrays (an array of
// objects becomes an array of strings). That's fine for scalar docs but corrupts
// structured fields like an album's `tracks: Track[]`. These converters round-trip
// arbitrarily nested values, so a single track's field can be edited in place and
// written back without mangling the rest of the document.
function fsValueToJs(v: any): any {
  if (v == null) return undefined;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return Number(v.doubleValue);
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.nullValue !== undefined) return null;
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.arrayValue !== undefined) return (v.arrayValue.values || []).map(fsValueToJs);
  if (v.mapValue !== undefined) {
    const out: Record<string, any> = {};
    for (const [k, mv] of Object.entries(v.mapValue.fields || {})) out[k] = fsValueToJs(mv);
    return out;
  }
  return undefined;
}
function jsToFsValue(x: any): any {
  if (x === null || x === undefined) return { nullValue: null };
  if (typeof x === 'string') return { stringValue: x };
  if (typeof x === 'boolean') return { booleanValue: x };
  if (typeof x === 'number') return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(jsToFsValue) } };
  if (typeof x === 'object') {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(x)) fields[k] = jsToFsValue(v);
    return { mapValue: { fields } };
  }
  return { stringValue: String(x) };
}
/** GET a doc and deep-parse ALL fields (including nested maps/arrays). */
async function firestoreGetDeep(collection: string, id: string): Promise<Record<string, any> | null> {
  const url = `https://firestore.googleapis.com/v1/projects/gen-lang-client-0665118474/databases/plajah-prod/documents/${collection}/${id}`;
  try {
    const res = await fetch(url, { headers: await firestoreAuthHeaders() });
    if (!res.ok) return null;
    const json = await res.json() as any;
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(json.fields || {})) out[k] = fsValueToJs(v);
    return out;
  } catch { return null; }
}
/** PATCH specific fields with deep conversion (preserves everything not named in updateMask). */
async function firestorePatchDeep(collection: string, id: string, fieldsJs: Record<string, any>): Promise<boolean> {
  const mask = Object.keys(fieldsJs).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  const url = `https://firestore.googleapis.com/v1/projects/gen-lang-client-0665118474/databases/plajah-prod/documents/${collection}/${id}?${mask}`;
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(fieldsJs)) fields[k] = jsToFsValue(v);
  try {
    const res = await fetch(url, { method: 'PATCH', headers: await firestoreAuthHeaders(), body: JSON.stringify({ fields }) });
    if (!res.ok) console.error(`[Firestore] deep patch ${collection}/${id} failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.ok;
  } catch { return false; }
}

/**
 * Create a doc ONLY if it doesn't exist (Firestore returns 409 ALREADY_EXISTS for a POST with a taken
 * documentId). Used as a claim/lock: whoever creates the doc owns the work, so concurrent retries of the
 * same webhook can never both apply it.
 */
async function firestoreCreateOnce(collection: string, id: string, data: Record<string, any>): Promise<'created' | 'exists' | 'error'> {
  const url = `https://firestore.googleapis.com/v1/projects/gen-lang-client-0665118474/databases/plajah-prod/documents/${collection}?documentId=${encodeURIComponent(id)}`;
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) if (v !== undefined) fields[k] = jsToFsValue(v);
  try {
    const res = await fetch(url, { method: 'POST', headers: await firestoreAuthHeaders(), body: JSON.stringify({ fields }) });
    if (res.ok) return 'created';
    if (res.status === 409) return 'exists';
    console.error(`[Firestore] createOnce ${collection}/${id} failed: HTTP ${res.status}`);
    return 'error';
  } catch { return 'error'; }
}
async function firestoreDeleteDoc(collection: string, id: string): Promise<void> {
  const url = `https://firestore.googleapis.com/v1/projects/gen-lang-client-0665118474/databases/plajah-prod/documents/${collection}/${id}`;
  try { await fetch(url, { method: 'DELETE', headers: await firestoreAuthHeaders() }); } catch { /* best-effort rollback */ }
}

// ════════════════════════════════════════════════════════════════════════════
// Elevate: Stripe → ledger automation. Church money people never type a Stripe number:
// gifts, renewals, refunds, disputes, payouts and the double-entry journals all flow from
// webhooks (/api/stripe/webhook, /api/stripe/connect-webhook) and the pull-sync
// (POST /api/elevate/stripe/sync). EVERY write uses the deterministic ids from
// services/acctPosting so webhooks, retries, backfills and the client can never double-post.
// Journals/enrichment must never throw a webhook — failures are logged and skipped.
// ════════════════════════════════════════════════════════════════════════════
const ELEVATE_TZ = process.env.ELEVATE_TZ || 'America/Detroit';
const elevDate = (sec: number) => new Date(sec * 1000).toLocaleDateString('en-CA', { timeZone: ELEVATE_TZ });
const utcDate = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 10);
const usd = (cents: number) => Math.round(cents || 0) / 100;
const round2c = (n: number) => Math.round(n * 100) / 100;
const deepClean = <T,>(o: T): T => JSON.parse(JSON.stringify(o));   // drops undefined (Firestore rejects it)
const idOf = (x: any): string | undefined => (typeof x === 'string' ? x : x?.id) || undefined;

const _chartCache = new Map<string, { sys: SysAccounts; exp: number }>();
/** Seed DEFAULT_CHART into acctAccounts (deterministic ids, NEVER overwrites) and return systemKey → accountId. */
async function ensureOrgChart(orgId: string): Promise<SysAccounts> {
  const hit = _chartCache.get(orgId);
  if (hit && hit.exp > Date.now()) return hit.sys;
  const existing = await fsQueryDocs('acctAccounts', [{ field: 'orgId', op: 'EQUAL', value: orgId }], 500);
  const haveIds = new Set(existing.map(d => d.id));
  const haveCodes = new Set(existing.map(d => String(d.data.code)));
  const haveKeys = new Set(existing.map(d => d.data.systemKey).filter(Boolean));
  const accounts: Array<{ id: string; systemKey?: any }> = existing.map(d => ({ id: d.id, systemKey: d.data.systemKey }));
  let failed = false;
  for (const seed of DEFAULT_CHART) {
    const id = accountDocId(orgId, seed.code);
    if (haveIds.has(id) || haveCodes.has(seed.code) || (seed.systemKey && haveKeys.has(seed.systemKey))) continue;
    const ok = await firestorePatchDeep('acctAccounts', id, deepClean({ ...seed, id, orgId, createdAt: Date.now() }));
    if (ok) accounts.push({ id, systemKey: seed.systemKey }); else failed = true;
  }
  const sys = sysAccountsOf(accounts);
  _chartCache.set(orgId, { sys, exp: Date.now() + (failed ? 30_000 : 10 * 60_000) });
  return sys;
}

/** Idempotent journal write: id = journalDocId(orgId, draft.key), so a replay is a no-op. Never throws. */
async function postJournal(orgId: string, draft: DraftJournal): Promise<string | null> {
  try {
    if (!draft.key || !draft.lines.length) return null;
    const id = journalDocId(orgId, draft.key);
    if (await firestoreRead('acctJournals', id)) return id;
    const ok = await firestorePatchDeep('acctJournals', id, deepClean({ ...draft, id, orgId, status: 'POSTED', createdBy: 'stripe', createdAt: Date.now() }));
    return ok ? id : null;
  } catch (e: any) { console.error('[Elevate] journal write failed:', e?.message); return null; }
}
/** Build + post a journal against the org's chart (seeding it first). Never throws. */
async function autoPost(orgId: string, make: (sys: SysAccounts) => DraftJournal): Promise<string | null> {
  try { return await postJournal(orgId, make(await ensureOrgChart(orgId))); }
  catch (e: any) { console.error('[Elevate] journal skipped:', e?.message); return null; }
}

/** Finance-staff gate, read server-side from the org doc (never trust the client). */
async function assertOrgFinanceAccess(uid: string, orgId: string): Promise<{ org: Record<string, any> } | { error: string; status: number }> {
  const org = await firestoreGetDeep('organizations', orgId);
  if (!org) return { error: 'Organization not found', status: 404 };
  const inList = (k: string) => Array.isArray(org[k]) && org[k].includes(uid);
  if (org.creatorId === uid || inList('admins') || inList('financeUids') || inList('accountingUids') || inList('pastorUids')) return { org };
  try { if (await fetchFirebaseDoc('admins', uid)) return { org }; } catch { /* fall through */ }
  return { error: 'Finance access required', status: 403 };
}

async function stripeStateWrite(orgId: string, patch: Record<string, any>) {
  await firestorePatchDeep('chmsFinanceMeta', `stripe_${orgId}`, deepClean({ ...patch, id: `stripe_${orgId}`, orgId, kind: 'STRIPE_STATE', createdAt: Date.now(), createdBy: 'stripe' }));
}
async function orgForStripeAccount(acct: string): Promise<string | null> {
  const r = await fsQueryDocs('organizations', [{ field: 'stripeAccountId', op: 'EQUAL', value: acct }], 1);
  return r[0]?.id || null;
}

/** Create (or complete) the ChmsContribution for one online gift + post its journal. Idempotent. */
async function recordOnlineGift(a: {
  orgId: string; paymentId: string; chargeId?: string; amountCents: number; createdSec: number; fundName?: string;
  uid?: string; giverName?: string; subscriptionId?: string; invoiceId?: string;
  /** Extra the donor paid on top to cover processing; the ledger gift is amountCents - feeCoveredCents. */
  feeCoveredCents?: number;
}): Promise<{ id: string; created: boolean }> {
  const id = onlineGiftDocId(a.orgId, a.paymentId);
  const existing = await firestoreRead('chmsContributions', id);
  const feeCovered = Math.max(0, a.feeCoveredCents || 0);
  const amount = usd(giftCentsFromGross(a.amountCents, feeCovered));
  let fundId = '', fundName = a.fundName || 'General', date = elevDate(a.createdSec), giver = a.giverName;
  if (existing) { fundId = existing.fundId; fundName = existing.fundName; date = existing.date; giver = existing.giverName; }
  else {
    const org = await firestoreGetDeep('organizations', a.orgId);
    const funds: any[] = Array.isArray(org?.givingFunds) ? org!.givingFunds : [];
    const want = fundName.trim().toLowerCase();
    const f = funds.find(x => String(x?.name || '').trim().toLowerCase() === want || x?.id === a.fundName);
    fundId = f?.id || fundName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'general';
    fundName = f?.name || fundName;
    let personId: string | undefined, householdId: string | undefined;
    if (a.uid) {
      const p = (await fsQueryDocs('chmsPeople', [{ field: 'orgId', op: 'EQUAL', value: a.orgId }, { field: 'linkedUid', op: 'EQUAL', value: a.uid }], 1))[0];
      if (p) { personId = p.id; householdId = p.data.householdId || undefined; }
    }
    const ok = await firestorePatchDeep('chmsContributions', id, deepClean({
      id, orgId: a.orgId, personId, householdId, giverName: personId ? undefined : (a.giverName || 'Online giver'),
      fundId, fundName, amount, date, method: 'ONLINE', deductible: true, stripePaymentId: a.paymentId,
      stripeChargeId: a.chargeId, stripeSubscriptionId: a.subscriptionId, stripeInvoiceId: a.invoiceId,
      status: 'POSTED', enteredBy: 'stripe', createdAt: a.createdSec * 1000, linkedUid: a.uid,
      ...(feeCovered ? { feeCoveredByDonor: usd(feeCovered), grossCharged: usd(a.amountCents) } : {}),
    }));
    if (!ok) return { id, created: false };
  }
  await autoPost(a.orgId, sys => onlineGiftEntry(sys, { id, date, amount, fundId, fundName, giver, stripePaymentId: a.paymentId }));
  if (a.chargeId && existing?.stripeFee === undefined) await attachGiftFinancials(a.orgId, id, a.chargeId, feeCovered).catch((e: any) => console.error('[Elevate] fee attach failed:', e?.message));
  return { id, created: !existing };
}

/** Attach Stripe fee/net (via balance_transaction) to the contribution; post the fee journal only if the ORG bears it. */
async function attachGiftFinancials(orgId: string, giftId: string, chargeId: string, feeCoveredCents = 0) {
  const ch = await getStripe().charges.retrieve(chargeId, { expand: ['balance_transaction'] });
  const bt = ch.balance_transaction;
  if (!bt || typeof bt === 'string') return;
  const stripeFee = usd(bt.fee);
  // Destination charge: the PLATFORM's balance pays Stripe's fee; the church receives the full amount.
  const platformPaid = !!(ch.transfer_data?.destination || ch.transfer);
  const fee = platformPaid ? 0 : stripeFee;
  // Donor-covered: the church nets the full gift (gross - the fee the donor added); Stripe's cost came out of the platform's application fee.
  const donorPaid = feeCoveredCents > 0;
  await firestorePatchDeep('chmsContributions', giftId, { stripeChargeId: ch.id, stripeFee, fee, net: round2c(usd(ch.amount) - (donorPaid ? usd(feeCoveredCents) : fee)), feePaidBy: donorPaid ? 'donor' : (platformPaid ? 'platform' : 'org') });
  if (fee > 0) {
    const g = await firestoreRead('chmsContributions', giftId);
    await autoPost(orgId, sys => feeEntry(sys, { id: bt.id, date: elevDate(ch.created), amount: fee, fundId: g?.fundId, memo: 'Stripe processing fee' }));
  }
}

async function handleChurchSessionPaid(session: any) {
  const meta = session.metadata || {};
  const orgId: string | undefined = meta.churchId;
  const pi = idOf(session.payment_intent);
  if (!orgId || !pi) return;   // subscription first payment arrives via invoice.paid
  let chargeId: string | undefined;
  try { chargeId = idOf((await getStripe().paymentIntents.retrieve(pi)).latest_charge); } catch { /* fee attach is best-effort */ }
  await recordOnlineGift({
    orgId, paymentId: pi, chargeId, amountCents: session.amount_total ?? Math.round(parseFloat(meta.amount || '0') * 100),
    createdSec: session.created || Math.floor(Date.now() / 1000), fundName: meta.fund, uid: meta.uid, giverName: session.customer_details?.name || undefined,
    feeCoveredCents: parseInt(meta.feeCoveredCents || '0', 10) || 0,
  });
}

/** Recurring renewals (and the first monthly payment): one contribution per paid invoice. */
async function handleChurchInvoicePaid(invoice: any) {
  const subId = idOf(invoice.subscription);
  if (!subId || !(invoice.amount_paid > 0)) return;
  let meta: Record<string, string> = invoice.subscription_details?.metadata || {};
  if (meta.type !== 'church_donation') {
    try { meta = (await getStripe().subscriptions.retrieve(subId)).metadata || {}; } catch { meta = {}; }
  }
  let orgId = meta.type === 'church_donation' ? meta.churchId : undefined, uid = meta.uid, fund = meta.fund;
  if (!orgId) {   // gifts created before subscription metadata was added: find the originating donation row
    const d = (await fsQueryDocs('donations', [{ field: 'stripeSubscriptionId', op: 'EQUAL', value: subId }], 1))[0];
    if (!d) return;
    orgId = d.data.churchId; uid = d.data.fromId; fund = d.data.fund;
  }
  if (!orgId) return;
  await recordOnlineGift({
    orgId, paymentId: idOf(invoice.payment_intent) || invoice.id, chargeId: idOf(invoice.charge),
    amountCents: invoice.amount_paid, createdSec: invoice.status_transitions?.paid_at || invoice.created,
    fundName: fund, uid, giverName: invoice.customer_name || undefined, subscriptionId: subId, invoiceId: invoice.id,
    feeCoveredCents: parseInt(meta.feeCoveredCents || '0', 10) || 0,
  });
}

/** py_ (connected-account side of a destination charge) → the platform charge; or the direct charge itself. */
async function resolveCharge(chargeId: string, acct?: string): Promise<{ charge: any; direct: boolean } | null> {
  const stripe = getStripe();
  const ch = acct ? await stripe.charges.retrieve(chargeId, {}, { stripeAccount: acct }) : await stripe.charges.retrieve(chargeId);
  const trId = idOf(ch.source_transfer);
  if (acct && trId) {
    const src = idOf((await stripe.transfers.retrieve(trId)).source_transaction);
    return src ? { charge: await stripe.charges.retrieve(src), direct: false } : null;
  }
  return { charge: ch, direct: !!acct };
}
async function giftOfCharge(charge: any): Promise<{ id: string; data: Record<string, any> } | null> {
  const pi = idOf(charge.payment_intent);
  if (!pi) return null;
  return (await fsQueryDocs('chmsContributions', [{ field: 'stripePaymentId', op: 'EQUAL', value: pi }], 1))[0] || null;
}

/** Refund → mark the gift (VOID when fully refunded) and post a refund journal for what actually left the church's balance. */
async function applyChargeRefund(charge: any, direct: boolean) {
  const g = await giftOfCharge(charge);
  if (!g) return;
  const gift = g.data;
  const refundedC = charge.amount_refunded || 0;
  let reversedC = refundedC;   // direct charge (or no destination): the full refund hits the org
  if (!direct && charge.transfer) {
    // Destination charge: the church only loses money if the transfer was reversed (refund with "reverse transfer").
    try { reversedC = Math.min(refundedC, (await getStripe().transfers.retrieve(idOf(charge.transfer)!)).amount_reversed || 0); } catch { reversedC = 0; }
  }
  const prevRefundedC = Math.round((gift.refunded || 0) * 100), prevJournaledC = Math.round((gift.refundJournaled || 0) * 100);
  if (refundedC <= prevRefundedC && reversedC <= prevJournaledC) return;
  if (reversedC > prevJournaledC) {
    await autoPost(gift.orgId, sys => refundEntry(sys, { id: `${charge.id}_${reversedC}`, date: elevDate(Date.now() / 1000), amount: usd(reversedC - prevJournaledC), fundId: gift.fundId, memo: `Refund — ${gift.fundName || 'gift'}` }));
  }
  const patch: Record<string, any> = { refunded: usd(refundedC), refundJournaled: usd(Math.max(reversedC, prevJournaledC)) };
  if (refundedC >= (charge.amount || 0) && gift.status !== 'VOID') Object.assign(patch, { status: 'VOID', voidReason: 'Stripe refund', voidedBy: 'stripe', voidedAt: Date.now() });
  await firestorePatchDeep('chmsContributions', g.id, patch);
}

/** Dispute lifecycle: flag the gift; post the dispute fee / lost chargeback only when the org's own balance bears it. */
async function applyDispute(dispute: any, kind: 'created' | 'closed', acct?: string) {
  const chId = idOf(dispute.charge);
  if (!chId) return;
  const r = await resolveCharge(chId, acct);
  if (!r) return;
  const g = await giftOfCharge(r.charge);
  if (!g) return;
  const gift = g.data;
  const open = !['won', 'warning_closed', 'lost'].includes(dispute.status);
  const patch: Record<string, any> = { disputed: open, disputeStatus: dispute.status };
  if (r.direct) {
    const feeC = (dispute.balance_transactions || []).reduce((s: number, b: any) => s + (b.fee || 0), 0);
    if (feeC > 0) await autoPost(gift.orgId, sys => disputeFeeEntry(sys, { id: dispute.id, date: elevDate(dispute.created), amount: usd(feeC), memo: 'Dispute fee' }));
    if (kind === 'closed' && dispute.status === 'lost') {
      await autoPost(gift.orgId, sys => refundEntry(sys, { id: `dispute_${dispute.id}`, date: elevDate(Date.now() / 1000), amount: usd(dispute.amount), fundId: gift.fundId, memo: 'Chargeback lost' }));
      if (gift.status !== 'VOID') Object.assign(patch, { status: 'VOID', voidReason: 'Stripe chargeback lost', voidedBy: 'stripe', voidedAt: Date.now() });
    }
  }
  await firestorePatchDeep('chmsContributions', g.id, patch);
}

const PAY_TYPES = new Set(['payment', 'charge']);
const REFUND_TYPES = new Set(['payment_refund', 'refund', 'payment_failure_refund']);
const FEE_TYPES = new Set(['stripe_fee', 'application_fee']);
const SKIP_TYPES = new Set(['payout', 'payout_cancel', 'payout_failure']);

/** Set by createBilling() wiring: payment intent → Plajah Billing invoice (so payout reconciliation recognises invoice payments). */
let billingInvoiceLookup: ((pi: string) => Promise<{ id: string; entityKey: string } | null>) | null = null;

/** Upsert one payout (+ its lines, matched to gifts) and, once paid, post the payout/fee journals. */
async function processPayout(orgId: string, acct: string, po: any, withLines: boolean): Promise<{ lines: number; matched: number; unmatched: number; reconciled: boolean }> {
  const stripe = getStripe();
  const poId = payoutDocId(orgId, po.id);
  const base: Record<string, any> = {
    id: poId, orgId, stripeAccountId: acct, stripePayoutId: po.id, amount: usd(po.amount), currency: po.currency || 'usd',
    arrivalDate: utcDate(po.arrival_date || po.created), createdAt: (po.created || 0) * 1000,
    status: ['pending', 'in_transit', 'paid', 'failed', 'canceled'].includes(po.status) ? po.status : 'pending',
    method: po.method, bankLast4: po.destination && typeof po.destination === 'object' ? po.destination.last4 : undefined, syncedAt: Date.now(),
  };
  if (!withLines) {
    const prev = await firestoreRead('chmsPayouts', poId);
    await firestorePatchDeep('chmsPayouts', poId, deepClean({ ...base, reconciled: prev?.reconciled === true }));
    return { lines: 0, matched: 0, unmatched: 0, reconciled: prev?.reconciled === true };
  }

  let gross = 0, fees = 0, refunds = 0, adjustments = 0, net = 0, lines = 0, matched = 0, unmatched = 0, unitemized = false;
  const trCache = new Map<string, any>();
  const refundWork: Array<{ chargeId: string; direct: boolean }> = [];
  const feeJournals: Array<{ id: string; date: string; amount: number; fundId?: string }> = [];
  try {
    for await (const bt of stripe.balanceTransactions.list({ payout: po.id, limit: 100, expand: ['data.source'] }, { stripeAccount: acct })) {
      if (SKIP_TYPES.has(bt.type)) continue;
      const amount = usd(bt.amount), fee = usd(bt.fee), btNet = usd(bt.net);
      let paymentId: string | undefined, chargeId: string | undefined, contributionId: string | undefined;
      try {
        const src = bt.source && typeof bt.source === 'object' ? bt.source : null;
        if (src && PAY_TYPES.has(bt.type)) {
          if (src.source_transfer) {
            const k = idOf(src.source_transfer)!;
            if (!trCache.has(k)) { const tr = await stripe.transfers.retrieve(k); trCache.set(k, tr.source_transaction ? await stripe.charges.retrieve(idOf(tr.source_transaction)!) : null); }
            const pc = trCache.get(k);
            paymentId = idOf(pc?.payment_intent); chargeId = pc?.id;
            // Webhook missed it but the PaymentIntent carried the gift metadata → backfill from the charge.
            if (pc && paymentId && pc.metadata?.churchId === orgId && !(await firestoreRead('chmsContributions', onlineGiftDocId(orgId, paymentId)))) {
              await recordOnlineGift({ orgId, paymentId, chargeId: pc.id, amountCents: pc.amount, createdSec: pc.created, fundName: pc.metadata.fund, uid: pc.metadata.uid });
            }
          } else if (src.payment_intent) { paymentId = idOf(src.payment_intent); chargeId = src.id; }
        } else if (src && REFUND_TYPES.has(bt.type)) {
          const ch = idOf(src.charge);
          const r = ch ? await resolveCharge(ch, acct) : null;
          if (r) { paymentId = idOf(r.charge.payment_intent); chargeId = r.charge.id; refundWork.push({ chargeId: r.charge.id, direct: r.direct }); }
        }
      } catch (e: any) { console.error('[Elevate] payout line resolve failed:', bt.id, e?.message); }
      if (paymentId) {
        const gid = onlineGiftDocId(orgId, paymentId);
        if (await firestoreRead('chmsContributions', gid)) contributionId = gid;
      }
      lines++;
      // Plajah Billing invoice payments are legitimate non-gift lines: count them as matched (AR is cleared by the invoice journal).
      let billingInvoicePaid = false;
      if (!contributionId && paymentId && PAY_TYPES.has(bt.type)) { try { const bi = billingInvoiceLookup ? await billingInvoiceLookup(paymentId) : null; billingInvoicePaid = !!bi && bi.entityKey === `ORG:${orgId}`; } catch { /* */ } }
      if (PAY_TYPES.has(bt.type)) { gross += amount; fees += fee; if (contributionId) { matched++; await firestorePatchDeep('chmsContributions', contributionId, { payoutId: poId }); } else if (billingInvoicePaid) matched++; else unmatched++; }
      else if (REFUND_TYPES.has(bt.type)) refunds += Math.abs(amount);
      else if (FEE_TYPES.has(bt.type)) fees += Math.abs(amount);
      else adjustments += amount;
      net += btNet;
      if (PAY_TYPES.has(bt.type) && fee > 0) feeJournals.push({ id: bt.id, date: utcDate(bt.created), amount: fee, fundId: contributionId ? (await firestoreRead('chmsContributions', contributionId))?.fundId : undefined });
      if (FEE_TYPES.has(bt.type)) feeJournals.push({ id: bt.id, date: utcDate(bt.created), amount: Math.abs(amount) });
      await firestorePatchDeep('chmsPayoutLines', payoutLineDocId(orgId, bt.id), deepClean({
        id: payoutLineDocId(orgId, bt.id), orgId, payoutId: poId, stripeId: bt.id, type: bt.type, amount, fee, net: btNet,
        date: utcDate(bt.created), description: bt.description || undefined, contributionId, stripePaymentId: paymentId,
      }));
    }
  } catch (e: any) {
    unitemized = true;   // manual payouts can't be itemised by Stripe
    console.warn('[Elevate] payout not itemisable:', po.id, e?.message);
  }
  for (const w of refundWork) { try { const r = await resolveCharge(w.chargeId); if (r) await applyChargeRefund(r.charge, w.direct); } catch (e: any) { console.error('[Elevate] refund catch-up failed:', e?.message); } }

  const difference = round2c(usd(po.amount) - net);
  const reconciled = !unitemized && lines > 0 && unmatched === 0 && Math.abs(difference) < 0.01;
  let journalId: string | undefined;
  if (base.status === 'paid') {
    journalId = (await autoPost(orgId, sys => payoutEntry(sys, { id: po.id, date: base.arrivalDate, amount: base.amount }))) || undefined;
    for (const f of feeJournals) await autoPost(orgId, sys => feeEntry(sys, { id: f.id, date: f.date, amount: f.amount, fundId: f.fundId, memo: 'Stripe fee (connected account)' }));
  }
  await firestorePatchDeep('chmsPayouts', poId, deepClean({
    ...base, gross: round2c(gross), fees: round2c(fees), refunds: round2c(refunds), adjustments: round2c(adjustments), net: round2c(net), lineCount: lines,
    matchedCount: matched, unmatchedCount: unmatched, difference, unitemized, reconciled, journalId,
  }));
  return { lines, matched, unmatched, reconciled };
}

/** Pull online gifts the webhook missed: paid church_donation checkout sessions + their subscriptions' invoices. */
async function backfillChurchGifts(orgId: string, sinceSec: number): Promise<number> {
  const stripe = getStripe();
  let added = 0, seen = 0;
  const subs = new Set<string>();
  const donated = await fsQueryDocs('donations', [{ field: 'churchId', op: 'EQUAL', value: orgId }, { field: 'recurring', op: 'EQUAL', value: true }], 1000);
  donated.forEach(d => { if (d.data.stripeSubscriptionId) subs.add(d.data.stripeSubscriptionId); });
  for await (const s of stripe.checkout.sessions.list({ created: { gte: sinceSec }, limit: 100 })) {
    if (++seen > 3000) break;
    const meta = s.metadata || {};
    if (meta.type !== 'church_donation' || meta.churchId !== orgId || s.payment_status !== 'paid') continue;
    if (s.mode === 'subscription') { const sid = idOf(s.subscription); if (sid) subs.add(sid); continue; }
    const pi = idOf(s.payment_intent);
    if (!pi) continue;
    let chargeId: string | undefined;
    try { chargeId = idOf((await stripe.paymentIntents.retrieve(pi)).latest_charge); } catch { /* best-effort */ }
    const r = await recordOnlineGift({ orgId, paymentId: pi, chargeId, amountCents: s.amount_total || 0, createdSec: s.created, fundName: meta.fund, uid: meta.uid, giverName: s.customer_details?.name || undefined, feeCoveredCents: parseInt(meta.feeCoveredCents || '0', 10) || 0 });
    if (r.created) added++;
  }
  for (const subId of subs) {
    try {
      for await (const inv of stripe.invoices.list({ subscription: subId, status: 'paid', created: { gte: sinceSec }, limit: 100 })) {
        const before = await firestoreRead('chmsContributions', onlineGiftDocId(orgId, idOf(inv.payment_intent) || inv.id));
        await handleChurchInvoicePaid(inv);
        if (!before) added++;
      }
    } catch (e: any) { console.error('[Elevate] invoice backfill failed:', subId, e?.message); }
  }
  return added;
}

const _syncing = new Set<string>();
async function syncOrgStripe(orgId: string, acct: string, sinceDays: number) {
  const stripe = getStripe();
  const sinceSec = Math.floor(Date.now() / 1000) - Math.max(1, Math.min(sinceDays, 730)) * 86400;
  await ensureOrgChart(orgId);
  const giftsAdded = await backfillChurchGifts(orgId, sinceSec);
  let payouts = 0, lines = 0, mismatches = 0;
  for await (const po of stripe.payouts.list({ created: { gte: sinceSec }, limit: 100, expand: ['data.destination'] }, { stripeAccount: acct })) {
    if (payouts >= 300) break;
    payouts++;
    const r = await processPayout(orgId, acct, po, po.status === 'paid' || po.status === 'in_transit');
    lines += r.lines;
    if (po.status === 'paid' && !r.reconciled) mismatches++;
  }
  await stripeStateWrite(orgId, { lastSyncAt: Date.now(), lastSyncSummary: JSON.stringify({ payouts, lines, giftsAdded, mismatches }) });
  return { payouts, lines, giftsAdded, mismatches };
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

  app.disable('x-powered-by');
  // Cloud Run/Firebase Hosting contributes exactly one trusted proxy hop. This
  // makes req.ip and HTTPS detection accurate without trusting arbitrary XFF.
  if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

  // One-shot local recovery when an older production service worker shadows Vite.
  // This route is intentionally explicit: normal app requests never clear auth or caches.
  if (process.env.NODE_ENV !== 'production') {
    app.get('/__dev/clear-plajah-cache', (_req, res) => {
      res.setHeader('Clear-Site-Data', '"cache", "storage"');
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      res.type('html').send(`<!doctype html><meta charset="utf-8"><title>Refreshing Plajah</title>
        <body style="background:#09090d;color:white;font:16px system-ui;padding:40px">Loading the current Plajah build…
        <script>
          (async()=>{
            try {
              if ('serviceWorker' in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                await Promise.all(regs.map(r => r.unregister()));
              }
              if ('caches' in window) {
                const keys = await caches.keys();
                await Promise.all(keys.map(k => caches.delete(k)));
              }
            } finally { location.replace('/?local_ocr=' + Date.now()); }
          })();
        </script></body>`);
    });
  }

  // ── Alexa skill: "Alexa, ask Chora to play <song>" ───────────────────────
  // Custom Alexa skill endpoint. Verifies Amazon's request signature, searches the
  // PUBLIC Chora catalog, and returns AudioPlayer directives so an Echo streams the
  // track (with album auto-advance). Registered before express.json() so the raw body
  // is available for signature verification. Only public published music is reachable —
  // private-library / locker / intimate tracks are NEVER exposed (legal).
  const ALEXA_SKILL_ID = process.env.ALEXA_SKILL_ID || '';

  let _choraIndex: { tracks: ChoraVoiceTrack[]; ts: number } | null = null;
  const getChoraTrackIndex = async (): Promise<ChoraVoiceTrack[]> => {
    if (_choraIndex && Date.now() - _choraIndex.ts < 60_000) return _choraIndex.tracks;
    const albums = await queryFirebase('albums', [{ field: 'type', value: 'MUSIC' }], 500);
    const out: ChoraVoiceTrack[] = [];
    for (const al of albums) {
      if (al.isIntimateOnly || al.isPublic === false) continue; // never expose intimate/unpublished
      const tracks = Array.isArray(al.tracks) ? al.tracks : [];
      tracks.forEach((t: any, idx: number) => {
        if (!t || !t.url) return;
        if (t.isPrivate || t.isLockerOnly || t.isIntimateOnly) return; // locker/private — never shareable
        const url = String(t.url);
        if (!/^https:\/\//i.test(url)) return; // Alexa AudioPlayer requires HTTPS streams
        out.push({
          id: t.id || `${al.id}_${idx}`,
          title: t.title || 'Untitled',
          artist: t.artist || al.artist || 'Unknown Artist',
          albumId: al.id || '',
          albumTitle: al.title || '',
          index: idx,
          url,
          cover: (t.albumCover || al.coverImage || '').startsWith('https') ? (t.albumCover || al.coverImage) : '',
          subType: al.subType || t.subType,
          genre: al.genre || t.genre,
        });
      });
    }
    _choraIndex = { tracks: out, ts: Date.now() };
    return out;
  };

  // Public voice-search endpoint for Alexa-hosted Skill & Google Actions
  app.get('/api/chora/voice-search', async (req: any, res: any) => {
    try {
      const { song, artist, album, genre, type, token, delta } = req.query;
      const tracks = await getChoraTrackIndex();

      if (token) {
        const d = parseInt(String(delta || '0'), 10) || 0;
        const track = getChoraTrackByToken(tracks, String(token), d);
        return res.json({ track: track || null });
      }

      const isMix = String(type || '').toLowerCase() === 'mix';
      const match = searchChora(tracks, {
        song: song ? String(song) : undefined,
        artist: artist ? String(artist) : undefined,
        album: album ? String(album) : undefined,
        genre: genre ? String(genre) : undefined,
        isMix,
      }) || (isMix ? tracks[0] : null);

      res.json({ track: match || null });
    } catch (e: any) {
      console.error('[chora/voice-search] error:', e?.message);
      res.status(500).json({ error: 'Failed to query voice search' });
    }
  });

  app.post('/api/alexa', express.raw({ type: () => true, limit: '1mb' }), async (req: any, res: any) => {
    const body: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
    try {
      // 1. Signature (unless explicitly disabled for local dev)
      if (process.env.ALEXA_SKIP_SIGNATURE !== 'true') {
        const certUrl = String(req.headers['signaturecertchainurl'] || '');
        const signature = String(req.headers['signature'] || '');
        if (!certUrl || !signature || !(await verifyAlexaSignature(certUrl, signature, body))) {
          return res.status(400).json({ error: 'invalid signature' });
        }
      }
      const env = JSON.parse(body.toString('utf8'));
      // 2. Application id + timestamp freshness (replay protection)
      const appId = env?.context?.System?.application?.applicationId || env?.session?.application?.applicationId;
      if (ALEXA_SKILL_ID && appId !== ALEXA_SKILL_ID) return res.status(400).json({ error: 'wrong skill' });
      const ts = new Date(env?.request?.timestamp || 0).getTime();
      if (!ts || Math.abs(Date.now() - ts) > 150_000) return res.status(400).json({ error: 'stale request' });

      const response = await handleAlexaRequest(env, getChoraTrackIndex);
      return res.json(response);
    } catch (e: any) {
      console.error('[alexa] error:', e?.message);
      return res.json({
        version: '1.0',
        response: {
          outputSpeech: { type: 'PlainText', text: 'Sorry, Chora ran into a problem.' },
          shouldEndSession: true,
        },
      });
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

          // ── Content purchase: mint the "own it forever" license ───────────────
          // Films (Taleo) + books (Lorea). Server-only mint after a real charge —
          // the client can never self-grant (contentLicenses is read-only in rules).
          // Idempotent: deterministic id `${kind}_${contentId}` + merge write, so a
          // re-fired webhook updates rather than duplicates. Shape mirrors
          // services/contentLicense.ts buildContentLicense() exactly.
          if (mode === 'payment' && meta.type === 'content_purchase' && meta.kind && meta.contentId) {
            const buyerUid = meta.uid || '';
            const kind = meta.kind;                 // 'film' | 'book'
            const contentId = meta.contentId;
            const grant = meta.grant || 'PURCHASE';
            const delivery = meta.delivery === 'PLAJAH_ONLY' ? 'PLAJAH_ONLY' : 'DOWNLOAD_OPEN';
            const wantsWatermark = meta.watermark !== 'false';
            const rentalHrs = parseInt(meta.rentalWindowHrs || '0', 10) || 0;
            // Deterministic forensic stamp — MUST match contentLicense.watermarkTagFor.
            const wm = (() => {
              let h = 0; const s = `${buyerUid}:${contentId}`;
              for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
              return `PLJ-${(h >>> 0).toString(36).toUpperCase().padStart(7, '0')}`;
            })();
            const licenseDoc: Record<string, any> = {
              id: `${kind}_${contentId}`,
              kind, contentId,
              title: meta.title || '',
              buyerUid,
              issuerDid: `plajah:${meta.creatorUid || ''}`,   // real DID under OCME
              subjectDid: `plajah:${buyerUid}`,               // real DID under OCME
              grant,
              delivery,
              priceCents: session.amount_total || Math.round(parseFloat(meta.price || '0') * 100),
              currency: (session.currency || 'usd').toUpperCase(),
              paymentRef: (session.payment_intent as string) || '',
              issuedAt: now,
              proof: null,
              placeholder: true,   // plajah:<uid> placeholders until OCME DIDs land
            };
            if (grant === 'RENTAL' && rentalHrs > 0) licenseDoc.expiresAt = now + rentalHrs * 3600_000;
            if (delivery === 'DOWNLOAD_OPEN' && wantsWatermark) licenseDoc.watermarkTag = wm;
            await firestoreWrite(`users/${buyerUid}/contentLicenses`, `${kind}_${contentId}`, licenseDoc);
            // TODO(ocme): also POST this as a VC to OCME's registry + emit a settlement
            // receipt carrying paymentRef (buyer identity must NOT cross). See the
            // plajah-payments-direction + plajah-ocme-integration memos.
          }

          // ── Music purchase → the buyer's private locker ───────────────────────
          // A bought album/track is added to personal_tracks (owner-only, never shareable) so it plays
          // from My Library on every device. Copies point at the same audio URL; deterministic ids make
          // a re-fired webhook idempotent.
          if (mode === 'payment' && meta.type === 'content_purchase' && (meta.kind === 'album' || meta.kind === 'track') && meta.contentId && meta.uid) {
            try {
              const albumId = String(meta.contentId).split('__')[0];
              const onlyTrack = meta.kind === 'track' ? String(meta.contentId).split('__')[1] : '';
              const adoc = await fetchFirebaseDoc('albums', albumId);
              const f = adoc?.fields;
              if (f) {
                const str = (v: any) => v?.stringValue || '';
                const num = (v: any) => v?.doubleValue !== undefined ? Number(v.doubleValue) : v?.integerValue !== undefined ? Number(v.integerValue) : 0;
                const albumTitle = str(f.title), albumArtist = str(f.artist), albumCover = str(f.coverImage);
                const trs = (f.tracks?.arrayValue?.values || []).map((v: any) => v.mapValue?.fields).filter(Boolean);
                let n = 0;
                for (const t of trs) {
                  const tid = str(t.id);
                  if (!tid || (onlyTrack && tid !== onlyTrack) || !str(t.url)) continue;
                  n++;
                  await firestoreWrite('personal_tracks', `ptrack_buy_${albumId}_${tid}`.slice(0, 120), {
                    id: `ptrack_buy_${albumId}_${tid}`.slice(0, 120),
                    ownerId: meta.uid,
                    rightsOwnerId: meta.uid,
                    isPersonalMedia: true,
                    isGlobalArchive: false,
                    purchased: true,
                    purchasedFromAlbumId: albumId,
                    purchasedFromTrackId: tid,
                    title: str(t.title) || albumTitle,
                    artist: str(t.artist) || albumArtist,
                    url: str(t.url),
                    albumId: `purchase_${albumId}`,
                    albumTitle,
                    albumCover,
                    trackNo: num(t.trackNo) || n,
                    timestamp: now,
                  });
                }
              }
            } catch (e: any) { console.error('[Stripe] locker add for music purchase failed:', e?.message); }
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
              kind: meta.kind || 'PROJECT',
              platformFeeCents: parseInt(meta.platformFeeCents || '0'),
              stripePaymentIntentId: (session.payment_intent as string) || '',
              createdAt: now,
            });
          }

          // ── Artist gift: ledger row for the gifter's receipt and the artist's thank-you list ──
          if (mode === 'payment' && meta.type === 'artist_gift') {
            await firestoreCreate('artistGifts', {
              fromUid: meta.uid || '',
              toUid: meta.creatorUid || '',
              albumId: meta.albumId || '',
              title: meta.title || '',
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
            // Elevate: also land it in the ChMS ledger + books (one-time here; monthly via invoice.paid).
            await handleChurchSessionPaid(session).catch((e: any) => console.error('[Elevate] gift ledger write failed:', e?.message));
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
              packages: meta.packages || '[]',
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
          // The stockMoves ledger doc id is deterministic per (order, line), so even if Stripe retries
          // the webhook (or a crash lands between confirm and decrement) stock can never double-drop.
          if (mode === 'payment' && meta.type === 'store_order' && meta.orderId) {
            const order = await firestoreRead('storeOrders', meta.orderId);
            if (order) {
              if (order.status !== 'CONFIRMED') {   // webhooks can fire more than once — only confirm once
                const ship = (session as any).shipping_details || (session as any).collected_information?.shipping_details;
                const addr = ship?.address;
                await firestoreWrite('storeOrders', meta.orderId, {
                  status: 'CONFIRMED', paidAt: now,
                  stripePaymentIntentId: (session.payment_intent as string) || '',
                  totalCents: Number(session.amount_total) || 0,
                  ...(session.customer_details?.email ? { customerEmail: String(session.customer_details.email) } : {}),
                  ...(addr ? {
                    shipName: String(ship?.name || ''), shipLine1: String(addr.line1 || ''), shipLine2: String(addr.line2 || ''),
                    shipCity: String(addr.city || ''), shipState: String(addr.state || ''), shipPostal: String(addr.postal_code || ''), shipCountry: String(addr.country || ''),
                  } : {}),
                });
              }
              if (order.giftCardsPending) { try { await issueOnlineGiftCards(String(meta.orderId), order); } catch (e: any) { console.error('[store] online gift cards failed', e?.message || e); } }
              try {
                const lines = JSON.parse(order.items || '[]');
                const sid = String(order.businessUid || order.sellerId || meta.businessUid || '');
                const oversold = await applyStockSale(lines, { orderId: meta.orderId, sellerId: sid, reason: 'SALE' });
                if (oversold) {
                  // Paid for stock that was gone (two buyers, last unit). Flag it loudly for the seller.
                  await firestoreWrite('storeOrders', meta.orderId, { oversold: true });
                  if (sid) await firestoreCreate('notifications', { userId: sid, senderId: 'plajah-store', senderName: 'Plajah Store', senderPhoto: '', type: 'SYSTEM', title: 'Oversold order needs attention', message: 'A customer paid for an item that had just run out. Restock it or refund the order.', link: 'BUSINESS_DASHBOARD', targetId: meta.orderId, isRead: false, timestamp: Date.now() }).catch(() => {});
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
            // sanctuary_pledge is intentionally omitted: it is a Connect Direct
            // destination charge (money already settled to the creator), so it must
            // NOT re-enter the platform-collect 90/10 path or it would double-transfer.
            plajahplus: 'plajahplus',
            store_order: 'store_order',
            club_membership: 'club',
            seedraiser_pledge: 'seedraiser',
            content_purchase: 'content_purchase',
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
              meta.type === 'seedraiser_pledge'     ? `SeedRaiser Pledge` :
              meta.type === 'content_purchase'      ? `${meta.kind === 'book' ? 'Book' : meta.kind === 'album' ? 'Album' : meta.kind === 'track' ? 'Track' : 'Film'} ${meta.grant === 'RENTAL' ? 'Rental' : 'Sale'}${meta.title ? `: ${meta.title}` : ''}` : 'Payment';

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

        // ── Elevate: church giving → ledger/books (all idempotent; never throw the webhook) ──
        case 'invoice.paid': {
          await handleChurchInvoicePaid(event.data.object).catch((e: any) => console.error('[Elevate] invoice.paid failed:', e?.message));
          break;
        }
        case 'charge.refunded': {
          await applyChargeRefund(event.data.object, false).catch((e: any) => console.error('[Elevate] charge.refunded failed:', e?.message));
          break;
        }
        case 'charge.dispute.created':
        case 'charge.dispute.closed': {
          await applyDispute(event.data.object, event.type.endsWith('created') ? 'created' : 'closed').catch((e: any) => console.error('[Elevate] dispute failed:', e?.message));
          break;
        }
      }
    } catch (err: any) {
      console.error('Webhook handler error:', err.message);
    }

    res.json({ received: true });
  });

  // ── Plajah Billing (invoices/estimates/payment links/balance on each entity's OWN Stripe account) ──
  // Implementation: routes/billing.ts. Routes are registered further down (billing.register(app)); the
  // Connect webhook below mirrors invoice.* events through billing.handleConnectEvent (dormant until the secret exists).
  const billing = createBilling({
    getStripe: () => getStripe(),
    authMiddleware, requireRegisteredUser,
    trustedRequestOrigin: (req: any) => trustedRequestOrigin(req),
    firestoreAuthHeaders: () => firestoreAuthHeaders(),
    read: (c, id) => firestoreGetDeep(c, id),
    patch: (c, id, f) => firestorePatchDeep(c, id, f),
    create: (c, d) => firestoreCreate(c, d),
    query: (c, f, n) => fsQueryDocs(c, f, n),
    isPlatformAdmin: async (uid: string) => !!(await fetchFirebaseDoc('admins', uid)),
    autoPost: (orgId, make) => autoPost(orgId, make),
    postJournal: (orgId, d) => postJournal(orgId, d),
  });
  billingInvoiceLookup = (pi: string) => billing.invoiceByPaymentIntent(pi);

  // ── Stripe CONNECT webhook — events from connected (church) accounts. Separate endpoint +
  // secret (STRIPE_CONNECT_WEBHOOK_SECRET) because Stripe signs "Connected accounts" endpoints
  // independently. Raw body, registered before express.json(), skipped by the rate limiter.
  app.post('/api/stripe/connect-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
    if (!secret || secret.startsWith('whsec_YOUR')) return res.status(500).json({ error: 'Connect webhook secret not configured' });
    let event: any;
    try {
      event = getStripe().webhooks.constructEvent(req.body, req.headers['stripe-signature'] as string, secret);
    } catch (err: any) {
      console.error('Stripe connect webhook error:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    const acct: string | undefined = event.account;
    try {
      // Plajah Billing mirror (invoice.*, payment-link checkouts, account.updated for billing entities). Additive:
      // org-specific handling (payouts, refunds, disputes, gifts) below still runs for org accounts.
      if (acct && (await billing.handleConnectEvent(event, acct))) return res.json({ received: true, billing: true });
      const orgId = acct ? await orgForStripeAccount(acct) : null;
      if (!acct || !orgId) { console.warn('[Connect webhook] no org for account', acct, event.type); return res.json({ received: true, ignored: true }); }
      const obj = event.data.object;
      switch (event.type) {
        case 'payout.created': case 'payout.updated': case 'payout.paid': case 'payout.failed': case 'payout.canceled':
          // Lines are only final once the payout is paid (or in transit); earlier states just upsert the header.
          await processPayout(orgId, acct, obj, obj.status === 'paid' || obj.status === 'in_transit');
          await stripeStateWrite(orgId, { lastPayoutEventAt: Date.now() });
          break;
        case 'balance.available':
          await stripeStateWrite(orgId, { balanceEventAt: Date.now() });
          break;
        case 'account.updated':
          await stripeStateWrite(orgId, {
            payoutsEnabled: !!obj.payouts_enabled, chargesEnabled: !!obj.charges_enabled,
            requirementsDue: [...(obj.requirements?.currently_due || []), ...(obj.requirements?.past_due || [])], accountUpdatedAt: Date.now(),
          });
          break;
        case 'charge.refunded': {
          const r = await resolveCharge(obj.id, acct);
          if (r) await applyChargeRefund(r.charge, r.direct);
          break;
        }
        case 'charge.dispute.created': case 'charge.dispute.closed':
          await applyDispute(obj, event.type.endsWith('created') ? 'created' : 'closed', acct);
          break;
      }
    } catch (err: any) {
      console.error('Connect webhook handler error:', err.message);
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

  const trustedRequestOrigin = (req: any): string => {
    const configured = (process.env.VITE_APP_URL || 'https://plajah.com').replace(/\/+$/, '');
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
    return origin && (allowedOrigins.includes(origin) || isDevLocalOrigin(origin)) ? origin : configured;
  };

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || isDevLocalOrigin(origin)) return callback(null, true);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  }));

  // A distributed edge/WAF is still required for volumetric DDoS protection;
  // this limiter protects application capacity from ordinary floods and bots.
  const globalApiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    skip: req => req.path === '/api/stripe/webhook' || req.path === '/api/stripe/connect-webhook' || req.path === '/api/mux/webhook' || req.path === '/api/merch/stripe-webhook',
    message: { error: 'Request rate limit exceeded' },
  });
  app.use('/api', globalApiLimiter);

  // Tight global JSON limit for safety — but exempt routes that legitimately carry
  // larger bodies (the AI proxy sends system prompt + scene context, well over 10kb)
  // so they can parse with their own limit instead of being 413'd here first.
  const tightJson = express.json({ limit: '10kb' });
  const LARGE_BODY_ROUTES = new Set(['/api/ai/anthropic', '/api/ai/gemini', '/api/ai/pokee',
    // Veo/Pixels proxy: /content carries base64 inlineData audio, /generate can carry an image.
    '/api/ai/veo/content', '/api/ai/veo/generate']);
  app.use((req, res, next) => {
    if (LARGE_BODY_ROUTES.has(req.path)) return next();
    return tightJson(req, res, next);
  });
  app.use(cookieParser());

  // Per-category rate limiters
  const authLimiter       = rateLimit({ windowMs: 15 * 60 * 1000, max: 10,  standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, try again later' } });
  const apiLimiter        = rateLimit({ windowMs:      60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, try again later' } });
  const proxyLimiter      = rateLimit({ windowMs:      60 * 1000, max: 60,  standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, try again later' } });
  const pokeeLimiter      = rateLimit({ windowMs: 5 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Pokee reasoning limit reached. Try again in a few minutes.' } });
  const aiLimiter         = rateLimit({ windowMs: 5 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'AI request limit reached. Please wait a few minutes.' } });
  const netdiagLimiter    = rateLimit({ windowMs: 5 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Diagnostic probe rate limit exceeded.' } });
  const coraDetectLimiter = rateLimit({ windowMs:      60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Beat detection rate limit reached.' } });

  app.use('/api/stripe/create-checkout-session', authLimiter);
  app.use('/api/stripe/create-portal-session',   authLimiter);
  app.use('/api/hue/auth',     authLimiter);
  app.use('/api/hue/callback', authLimiter);
  app.use('/api/proxy',        proxyLimiter);
  app.use('/api/lights/proxy', proxyLimiter);
  app.use('/api/social',       apiLimiter);
  app.use('/api/cora/detect-beats', coraDetectLimiter);

  // Liveness probe for uptime monitors / load balancers
  app.get('/healthz', (_req, res) => res.json({ ok: true, ts: Date.now() }));

  // ── Network diagnostics probes (same-origin, privacy-preserving) ──────────
  // Used by the client NetworkMonitor to measure the *user's own* latency and
  // throughput. No data is stored or logged; the upload body is discarded.
  const NETDIAG_MAX_BYTES = 2 * 1024 * 1024; // 2 MB ceiling to prevent egress drain
  // Tiny latency ping — no body, never cached.
  app.get('/api/netdiag/ping', (_req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.status(204).end();
  });
  // Download probe — streams N throwaway bytes (?bytes=…, clamped).
  app.get('/api/netdiag/download', netdiagLimiter, (req, res) => {
    const requested = Number.parseInt(String(req.query.bytes ?? ''), 10);
    const bytes = Math.max(1024, Math.min(Number.isFinite(requested) ? requested : 512 * 1024, NETDIAG_MAX_BYTES));
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Content-Type', 'application/octet-stream');
    res.set('Content-Length', String(bytes));
    // Emit in chunks so we don't allocate the whole payload at once.
    const CHUNK = 64 * 1024;
    const STATIC_CHUNK = Buffer.alloc(CHUNK, 0x5a); // pre-allocated to save server CPU
    let sent = 0;
    let aborted = false;
    res.on('close', () => { aborted = true; }); // client hung up (e.g. probe timeout)
    const pump = () => {
      if (aborted || res.writableEnded) return;
      while (sent < bytes) {
        if (aborted) return;
        const size = Math.min(CHUNK, bytes - sent);
        const chunk = size === CHUNK ? STATIC_CHUNK : STATIC_CHUNK.subarray(0, size);
        sent += size;
        if (!res.write(chunk)) { res.once('drain', pump); return; }
      }
      res.end();
    };
    pump();
  });
  // Upload probe — accepts and immediately discards an octet-stream body.
  app.post('/api/netdiag/upload', netdiagLimiter, express.raw({ type: 'application/octet-stream', limit: NETDIAG_MAX_BYTES }), (req, res) => {
    const received = Buffer.isBuffer(req.body) ? req.body.length : 0;
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({ ok: true, received });
  });

  // ── Classic Books Seeder ─────────────────────────────────────────────────
  // One-time admin endpoint: downloads 40 Gutenberg public-domain TXTs and
  // uploads them to Firebase Storage at books/classics/{id}/text.txt so the
  // reader can fetch them directly (no proxy, no Gutenberg rate-limits).
  // Hit once after deploy with X-Admin-Key (secrets in URLs leak into logs).
  app.get('/api/admin/seed-classic-books', async (req: any, res: any) => {
    if (!secretsEqual(req.get('x-admin-key'), process.env.ADMIN_SEED_KEY)) {
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

      let accountId: string | undefined;
      if (orgId) {
        // Onboarding for an organization (e.g. a church): the ORG gets its OWN Express account
        // (never the signed-in user's personal one — a church and its owner's personal income must not
        // share a Stripe account). Already-linked orgs keep whatever account they have. Finance-staff only.
        const gate = await assertOrgFinanceAccess(uid, String(orgId));
        if ('error' in gate) return res.status(gate.status).json({ error: gate.error });
        accountId = gate.org.stripeAccountId || undefined;
        if (!accountId) {
          const account = await (stripe as any).accounts.create({
            type: 'express',
            metadata: { uid, ownerUid: uid, entityKey: `ORG:${orgId}`, plajah: 'org' },
            capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
          });
          accountId = account.id as string;
          await firestoreWrite('organizations', String(orgId), { stripeAccountId: accountId, updatedAt: Date.now() });
        }
      } else {
        // Check if creator already has an account
        const userDoc = await fetchFirebaseDoc('users', uid);
        accountId = userDoc?.fields?.stripeConnectAccountId?.stringValue;
        if (!accountId) {
          const account = await (stripe as any).accounts.create({
            type: 'express',
            metadata: { uid, entityKey: `USER:${uid}` },
            capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
          });
          accountId = account.id as string;
          await firestoreWrite('users', uid, { stripeConnectAccountId: accountId, updatedAt: Date.now() });
        }
      }

      const origin = trustedRequestOrigin(req);
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

  // ── Content HQ protected delivery ─────────────────────────────────────────────────
  // Originals are not public Storage objects. The server checks the account/org scope and
  // streams from GCS with Range support so large video can seek without buffering 25 GB.
  async function canAccessHqAsset(uid: string, asset: any): Promise<boolean> {
    if (!asset) return false;
    if (asset.scopeKind === 'user') return asset.scopeId === uid;
    if (asset.scopeKind !== 'org') return false;
    const org = await firestoreRead('organizations', String(asset.scopeId));
    if (org && (org.creatorId === uid || (org.admins || []).includes(uid))) return true;
    const memberships = await queryFirebase('orgMemberships', [
      { field: 'orgId', value: String(asset.scopeId) }, { field: 'userId', value: uid },
    ], 5);
    return memberships.some((m: any) => m.status === 'ACTIVE');
  }

  // ── Content HQ storage-cap enforcement (server-authoritative) ──────────────
  // The per-tier GB cap is checked client-side for UX; this is the authoritative gate.
  // Only a caller who may WRITE the scope can upload, so quota is charged to the right owner.
  async function canWriteHqScope(uid: string, scopeKind: string, scopeId: string): Promise<boolean> {
    if (scopeKind === 'user') return scopeId === uid;
    if (scopeKind !== 'org') return false;
    const org = await firestoreRead('organizations', scopeId);
    if (!org) return false;
    if (org.creatorId === uid || (org.admins || []).includes(uid)) return true;
    if ((org.staffUids || []).includes(uid)) return true;
    // Fall back to a membership lookup for MANAGE_CONTENT holders not yet denormalized onto the org.
    const memberships = await queryFirebase('orgMemberships', [
      { field: 'orgId', value: scopeId }, { field: 'userId', value: uid },
    ], 5);
    if (!memberships.length) return false;
    const { permissionsForMember } = await import('./services/orgPermissions.js');
    return memberships.some((m: any) => m.status === 'ACTIVE' && permissionsForMember(m).has('MANAGE_CONTENT'));
  }

  /** The scope's storage cap in bytes, resolved from the SAME entitlement logic the client uses. */
  async function resolveHqCapBytes(scopeKind: string, scopeId: string, uid: string): Promise<number> {
    const { resolveContentHqEntitlements } = await import('./services/contentHqEntitlements.js');
    if (scopeKind === 'org') {
      const org = await firestoreRead('organizations', scopeId);
      const ent = resolveContentHqEntitlements({ organization: { id: scopeId, orgType: org?.orgType, isBusinessPage: org?.isBusinessPage } as any });
      return ent.storageLimitGb * 1024 ** 3;
    }
    const subs = await queryFirebase('plajahPlusSubscriptions', [{ field: 'subscriberId', value: uid }], 10);
    const activeSub = subs.find((s: any) => ['active', 'trialing', 'past_due'].includes(String(s.status)));
    const profile = await firestoreRead('users', uid);
    const ent = resolveContentHqEntitlements({
      subscription: activeSub ? { status: activeSub.status, storageLimitGb: Number(activeSub.storageLimitGb || 0) } as any : null,
      profile: profile ? { storageLimit: Number(profile.storageLimit || 0), tier: profile.tier } as any : null,
    });
    return ent.storageLimitGb * 1024 ** 3;
  }

  async function streamHqObject(req: any, res: any, objectPath: string, filename: string, mimeType: string) {
    const token = await getGoogleAccessToken();
    if (!token) return res.status(503).json({ error: 'Protected storage unavailable' });
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (req.headers.range) headers.Range = String(req.headers.range);
    const url = `https://storage.googleapis.com/storage/v1/b/${STORAGE_BUCKET}/o/${encodeURIComponent(objectPath)}?alt=media`;
    const upstream = await fetch(url, { headers });
    if (!upstream.ok || !upstream.body) return res.status(upstream.status).json({ error: 'Asset unavailable' });
    res.status(upstream.status);
    for (const h of ['content-length', 'content-range', 'accept-ranges', 'etag']) {
      const value = upstream.headers.get(h); if (value) res.setHeader(h, value);
    }
    res.setHeader('Content-Type', upstream.headers.get('content-type') || mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(filename || 'asset')}`);
    res.setHeader('Cache-Control', 'private, no-store');
    Readable.fromWeb(upstream.body as any).pipe(res);
  }

  // ── Content HQ malware / MIME quarantine gate (Wave 3 trust hardening) ─────────
  // Honest scope: the MIME verification (real magic bytes, NOT the client-declared
  // type), the type + size allowlist, and the EICAR / executable-signature heuristic
  // below are REAL and enforced. Deep antivirus (ClamAV / VirusTotal) is NOT wired yet
  // — runMalwareScan() is the single, clearly-marked seam where it plugs in (see TODO).
  const HQ_MAX_BYTES = 25 * 1024 * 1024 * 1024;            // mirrors storage.rules' 25 GB cap
  const HQ_SCAN_HEAD_BYTES = 64 * 1024;                    // window read for sniffing + heuristics
  // The standard EICAR anti-malware test string — the industry probe proving the gate is live.
  const EICAR_SIGNATURE = Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');

  // Sniff a real content-type from leading magic bytes. Returns null for anything we
  // don't positively recognise (the caller then falls back to the stored content-type).
  function sniffHqMime(b: Buffer): string | null {
    if (!b || b.length < 4) return null;
    const ascii = (n: number) => b.slice(0, n).toString('latin1');
    if (ascii(4) === '%PDF') return 'application/pdf';
    if (b[0] === 0x89 && ascii(4).slice(1) === 'PNG') return 'image/png';
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
    if (ascii(4) === 'GIF8') return 'image/gif';
    if (ascii(4) === 'RIFF') {
      const tag = b.slice(8, 12).toString('latin1');
      if (tag === 'WEBP') return 'image/webp';
      if (tag === 'WAVE') return 'audio/wav';
      if (tag === 'AVI ') return 'video/x-msvideo';
    }
    if (ascii(4) === 'OggS') return 'audio/ogg';
    if (ascii(3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
    if (b.length >= 12 && b.slice(4, 8).toString('latin1') === 'ftyp') return 'video/mp4';
    if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'video/webm';
    if (ascii(4) === 'PK\x03\x04') return 'application/zip';   // docx/xlsx/pptx/epub containers
    if (ascii(5) === '{\\rtf') return 'application/rtf';
    if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return 'application/msword'; // OLE2 (.doc/.xls/.ppt)
    return null;
  }

  // Hard-block signatures: executables and shell scripts never belong in a media/doc DAM.
  function dangerousHqSignature(b: Buffer): string | null {
    if (!b || b.length < 4) return null;
    if (b[0] === 0x4d && b[1] === 0x5a) return 'a Windows executable (MZ/PE)';
    if (b[0] === 0x7f && b[1] === 0x45 && b[2] === 0x4c && b[3] === 0x46) return 'a Linux executable (ELF)';
    if ((b[0] === 0xfe && b[1] === 0xed && b[2] === 0xfa) || (b[0] === 0xca && b[1] === 0xfe && b[2] === 0xba && b[3] === 0xbe)) return 'a Mach-O / Java executable';
    if (b[0] === 0x23 && b[1] === 0x21) return 'a shell script (#!)';
    return null;
  }

  function isHqMimeAllowed(mime: string): boolean {
    const m = String(mime || '').toLowerCase();
    if (/^(image|audio|video|text)\//.test(m)) return true;
    if (/^application\/(pdf|zip|rtf|msword|epub\+zip|x-msaccess|octet-stream)$/.test(m)) return true;
    if (/^application\/(vnd\.openxmlformats-officedocument|vnd\.ms-|vnd\.oasis\.opendocument)/.test(m)) return true;
    return false;
  }

  /**
   * The pluggable malware / content-safety scan. REAL today: size ceiling, magic-byte
   * MIME sniff, type allowlist, and an EICAR + executable-signature heuristic. This is
   * the ONE integration seam for deep AV — swap the heuristic for a ClamAV clamd
   * INSTREAM scan or a VirusTotal hash lookup and every caller inherits it.
   * Returns { clean, reason?, detectedMime? }.
   */
  function runMalwareScan(input: { declaredMime: string; storedContentType?: string; sniffedMime: string | null; sizeBytes: number; head: Buffer }): { clean: boolean; reason?: string; detectedMime?: string } {
    const detectedMime = input.sniffedMime || undefined;
    // 1) Size ceiling (defense in depth alongside storage.rules).
    if (input.sizeBytes > HQ_MAX_BYTES) return { clean: false, reason: `File exceeds the ${Math.round(HQ_MAX_BYTES / 1024 ** 3)} GB limit.`, detectedMime };
    // 2) Executable / script magic bytes — blocked regardless of declared type (this is
    //    what catches an .exe renamed to .jpg: the bytes betray it even though the client
    //    declared image/jpeg).
    const danger = dangerousHqSignature(input.head);
    if (danger) return { clean: false, reason: `Blocked: the file looks like ${danger}. Executable/script content is not allowed in Content HQ.`, detectedMime };
    // 3) EICAR anti-malware test signature — the standard "is the scanner live?" probe.
    if (input.head.includes(EICAR_SIGNATURE)) return { clean: false, reason: 'Blocked: a malware signature was detected (EICAR anti-malware test file).', detectedMime };
    // 4) Type allowlist. Trust the SNIFFED type; when nothing sniffs (many valid
    //    containers have no fixed leading magic) fall back to the stored content-type.
    const effective = input.sniffedMime || input.storedContentType || input.declaredMime || 'application/octet-stream';
    if (!isHqMimeAllowed(effective)) return { clean: false, reason: `Blocked: "${effective}" is not an allowed Content HQ file type.`, detectedMime };
    // TODO(scanner): stream the full object to a ClamAV daemon (clamd INSTREAM) or submit
    // its SHA-256 to VirusTotal here, and return { clean:false } on a positive verdict.
    return { clean: true, detectedMime };
  }

  // Fetch an object's stored metadata (content-type/size) + head bytes for scanning.
  async function fetchHqObjectHead(objectPath: string): Promise<{ ok: boolean; contentType?: string; size?: number; head: Buffer }> {
    const token = await getGoogleAccessToken();
    if (!token) return { ok: false, head: Buffer.alloc(0) };
    const base = `https://storage.googleapis.com/storage/v1/b/${STORAGE_BUCKET}/o/${encodeURIComponent(objectPath)}`;
    let contentType: string | undefined; let size: number | undefined;
    try {
      const metaRes = await fetch(base, { headers: { Authorization: `Bearer ${token}` } });
      if (metaRes.ok) { const m: any = await metaRes.json(); contentType = m.contentType; size = Number(m.size || 0); }
    } catch { /* metadata optional */ }
    let head = Buffer.alloc(0); let ok = false;
    try {
      const mediaRes = await fetch(`${base}?alt=media`, { headers: { Authorization: `Bearer ${token}`, Range: `bytes=0-${HQ_SCAN_HEAD_BYTES - 1}` } });
      if (mediaRes.ok || mediaRes.status === 206) { head = Buffer.from(await mediaRes.arrayBuffer()); ok = true; }
    } catch { /* leave head empty */ }
    return { ok, contentType, size, head };
  }

  // Is an asset barred from streaming? PENDING or QUARANTINED are gated; a MISSING
  // scanStatus is a legacy (pre-Wave-3) asset, grandfathered as CLEAN.
  function hqScanBlocked(asset: any): boolean {
    return asset?.scanStatus === 'PENDING' || asset?.scanStatus === 'QUARANTINED';
  }
  function hqScanMessage(asset: any): string {
    if (asset?.scanStatus === 'QUARANTINED') return asset.scanReason || 'This file was quarantined by a security scan and cannot be opened.';
    return 'This file is still being scanned for safety. Please try again in a moment.';
  }

  // Verify the real MIME + enforce the allowlist/size/malware heuristic, then flip
  // scanStatus. Auth: any caller who may WRITE the scope (reuses canWriteHqScope).
  app.post('/api/hq/scan/:assetId', apiLimiter, authMiddleware, async (req: any, res: any) => {
    const assetId = String(req.params.assetId);
    const asset = await firestoreRead('orgAssets', assetId);
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    if (!await canWriteHqScope(req.uid, String(asset.scopeKind), String(asset.scopeId))) return res.status(403).json({ error: 'Forbidden' });
    const source = asset.currentVersionId ? await firestoreRead('hqAssetVersions', String(asset.currentVersionId)) || asset : asset;
    const objectPath = source.storagePath || asset.storagePath;
    if (!objectPath) return res.status(404).json({ error: 'No stored object to scan' });

    const obj = await fetchHqObjectHead(String(objectPath));
    if (!obj.ok) {
      // Could not read the object — do NOT mark clean; leave it PENDING to be rescanned.
      return res.status(503).json({ error: 'Could not read the stored object to scan.', scanStatus: 'PENDING' });
    }
    const sniffed = sniffHqMime(obj.head);
    const verdict = runMalwareScan({
      declaredMime: String(asset.mimeType || ''), storedContentType: obj.contentType,
      sniffedMime: sniffed, sizeBytes: Number(obj.size || asset.sizeBytes || 0), head: obj.head,
    });
    const scanStatus = verdict.clean ? 'CLEAN' : 'QUARANTINED';
    await firestoreWrite('orgAssets', assetId, { scanStatus, scannedAt: Date.now(), scanReason: verdict.reason || '' });
    // Durable server-side security audit (asset-scoped, append-only hqActivity).
    await firestoreCreate('hqActivity', {
      assetId, scopeKind: asset.scopeKind, scopeId: asset.scopeId,
      actorUid: '', actorName: 'Plajah security', actorKind: 'SYSTEM',
      action: verdict.clean ? 'SCANNED' : 'QUARANTINED', createdAt: Date.now(),
    });
    return res.json({ scanStatus, ...(verdict.reason ? { scanReason: verdict.reason } : {}), detectedMime: verdict.detectedMime || null });
  });

  app.get('/api/hq/assets/:assetId/download', apiLimiter, authMiddleware, async (req: any, res: any) => {
    const asset = await firestoreRead('orgAssets', String(req.params.assetId));
    if (!await canAccessHqAsset(req.uid, asset)) return res.status(403).json({ error: 'Forbidden' });
    // Quarantine gate: never stream bytes for a PENDING/QUARANTINED asset.
    if (hqScanBlocked(asset)) return res.status(409).json({ error: hqScanMessage(asset), code: `SCAN_${asset.scanStatus}` });
    let source: any = asset;
    if (req.query.version) {
      const version = await firestoreRead('hqAssetVersions', String(req.query.version));
      if (!version || version.assetId !== req.params.assetId) return res.status(404).json({ error: 'Version not found' });
      source = version;
    } else if (asset?.currentVersionId) {
      source = await firestoreRead('hqAssetVersions', String(asset.currentVersionId)) || asset;
    }
    if (!source?.storagePath) return res.status(404).json({ error: 'Asset not found' });
    // Lightweight server-side download audit. Only on the initial (non-Range) request so
    // video seeking's many Range requests don't flood the trail. Best-effort, non-blocking.
    if (!req.headers.range) {
      firestoreCreate('hqActivity', { assetId: String(req.params.assetId), scopeKind: asset.scopeKind, scopeId: asset.scopeId,
        actorUid: req.uid, actorName: '', action: 'DOWNLOADED', createdAt: Date.now() }).catch(() => {});
    }
    return streamHqObject(req, res, source.storagePath, source.name || asset?.name, source.mimeType || asset?.mimeType);
  });

  // Server-authoritative storage-cap check the client MUST pass before an HQ upload. Computes the
  // scope's used bytes + the entitlement's tier cap and rejects over-cap uploads (413).
  app.post('/api/hq/quota-check', apiLimiter, authMiddleware, express.json(), async (req: any, res: any) => {
    const uid: string = req.uid;
    const scopeKind = String(req.body?.scopeKind || '');
    const scopeId = String(req.body?.scopeId || '');
    const incomingBytes = Math.max(0, Number(req.body?.incomingBytes || 0));
    if ((scopeKind !== 'user' && scopeKind !== 'org') || !scopeId) {
      return res.status(400).json({ error: 'scopeKind (user|org) and scopeId are required' });
    }
    if (!await canWriteHqScope(uid, scopeKind, scopeId)) return res.status(403).json({ error: 'Forbidden' });

    const assets = await queryFirebase('orgAssets', [{ field: 'scopeId', value: scopeId }], 2000);
    const usedBytes = assets.reduce((sum: number, a: any) => sum + (a.deletedAt ? 0 : Number(a.sizeBytes || 0)), 0);
    const capBytes = await resolveHqCapBytes(scopeKind, scopeId, uid);
    if (capBytes > 0 && usedBytes + incomingBytes > capBytes) {
      // Durable server-side audit of the rejection (no asset exists yet → hqAuditLog).
      firestoreCreate('hqAuditLog', { kind: 'QUOTA_REJECTED', scopeKind, scopeId, actorUid: uid,
        usedBytes, capBytes, incomingBytes, createdAt: Date.now() }).catch(() => {});
      return res.status(413).json({ error: 'Content HQ storage cap exceeded', code: 'OVER_CAP', usedBytes, capBytes, incomingBytes });
    }
    return res.json({ ok: true, usedBytes, capBytes });
  });

  // ── Account-free share/review link (Content HQ Wave 2) ─────────────────────
  // A share link is a bearer capability: `shareId` names the row, the raw `token`
  // (only its SHA-256 lives in Firestore) authenticates. Every guest action below
  // re-validates the link server-side — exists, not revoked, not expired, token
  // matches (timing-safe) — before touching anything. Guests never learn the
  // protected storage path; bytes flow only through the tokenized stream. Writes
  // use the server's Firestore creds so firestore.rules stay fully locked to guests.
  async function loadValidShare(shareId: string, token: string): Promise<{ share: any; asset: any } | null> {
    const share = await firestoreRead('hqShareLinks', String(shareId || ''));
    if (!share || share.revokedAt || (share.expiresAt && share.expiresAt < Date.now())) return null;
    const hash = nodeCrypto.createHash('sha256').update(String(token || '')).digest('hex');
    const a = Buffer.from(hash); const b = Buffer.from(String(share.tokenHash || ''));
    if (a.length !== b.length || !nodeCrypto.timingSafeEqual(a, b)) return null;
    const asset = await firestoreRead('orgAssets', String(share.assetId));
    if (!asset || asset.deletedAt) return null;
    return { share, asset };
  }

  const clip = (v: any, max: number) => String(v ?? '').trim().slice(0, max);
  const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  app.get('/api/hq/share/:shareId/:token/download', apiLimiter, async (req: any, res: any) => {
    const valid = await loadValidShare(String(req.params.shareId), String(req.params.token));
    // Viewing the asset is the whole point of a review link, so bytes are served for any
    // enabled link (download / comment / approval). allowDownload only drives the UI's
    // "Download" affordance — a browser can already save any <video>/<img> source it renders.
    if (!valid || !(valid.share.allowDownload || valid.share.allowComments || valid.share.allowApproval)) {
      return res.status(403).json({ error: 'Share unavailable' });
    }
    const { share, asset } = valid;
    // Quarantine gate: a guest link must never stream a non-CLEAN asset.
    if (hqScanBlocked(asset)) return res.status(409).json({ error: hqScanMessage(asset), code: `SCAN_${asset.scanStatus}` });
    if (!asset?.storagePath) return res.status(404).json({ error: 'Asset not found' });
    const source = asset.currentVersionId ? await firestoreRead('hqAssetVersions', String(asset.currentVersionId)) || asset : asset;
    return streamHqObject(req, res, source.storagePath, source.name || asset.name, source.mimeType || asset.mimeType);
  });

  // Review context for the account-free reviewer page (no protected path leaked).
  app.get('/api/hq/share/:shareId/:token', apiLimiter, async (req: any, res: any) => {
    const valid = await loadValidShare(String(req.params.shareId), String(req.params.token));
    if (!valid) return res.status(403).json({ error: 'This review link is no longer available.' });
    const { share, asset } = valid;
    const versions = (await queryFirebase('hqAssetVersions', [{ field: 'assetId', value: asset.id }], 100))
      .sort((a: any, b: any) => (b.version || 0) - (a.version || 0))
      .map((v: any) => ({ id: v.id, version: v.version, name: v.name, mimeType: v.mimeType, sizeBytes: v.sizeBytes, createdAt: v.createdAt }));
    const currentVersion = versions.find((v: any) => v.id === asset.currentVersionId) || versions[0] || null;
    const comments = (await queryFirebase('hqComments', [{ field: 'assetId', value: asset.id }], 500))
      .filter((c: any) => c.visibility !== 'INTERNAL')
      .sort((a: any, b: any) => (a.createdAt || 0) - (b.createdAt || 0))
      // Strip uids and guest emails — other reviewers see only names + timecoded feedback.
      .map((c: any) => ({ id: c.id, authorName: c.authorName || 'Reviewer', authorKind: c.authorKind || 'MEMBER',
        body: c.body, timeStartSeconds: c.timeStartSeconds, resolved: !!c.resolved, createdAt: c.createdAt }));
    const decisions = (await queryFirebase('hqGuestDecisions', [{ field: 'shareId', value: share.id }], 25))
      .sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
    res.setHeader('Cache-Control', 'private, no-store');
    // Quarantine state is surfaced (not the media) so the reviewer page can show a
    // "still being scanned / unavailable" state instead of a broken preview. Legacy
    // assets with no scanStatus are treated as CLEAN.
    const scanStatus = asset.scanStatus || 'CLEAN';
    return res.json({
      asset: { id: asset.id, title: asset.name, kind: asset.kind, status: asset.status || 'DRAFT',
        versionCount: asset.versionCount || versions.length || 1, scanStatus },
      currentVersion, versions, comments,
      flags: { allowComments: !!share.allowComments, allowApproval: !!share.allowApproval,
        allowDownload: !!share.allowDownload, requireEmail: !!share.requireEmail },
      label: share.label || '',
      decision: decisions[0] ? { decision: decisions[0].decision, note: decisions[0].note, guestName: decisions[0].guestName, createdAt: decisions[0].createdAt } : null,
    });
  });

  // Guest comment — gated on allowComments; written with the server's creds as authorKind:'GUEST'.
  app.post('/api/hq/share/:shareId/:token/comment', apiLimiter, express.json({ limit: '16kb' }), async (req: any, res: any) => {
    const valid = await loadValidShare(String(req.params.shareId), String(req.params.token));
    if (!valid) return res.status(403).json({ error: 'This review link is no longer available.' });
    const { share, asset } = valid;
    if (!share.allowComments) return res.status(403).json({ error: 'Comments are turned off for this link.' });
    const body = clip(req.body?.body, 4000);
    const guestName = clip(req.body?.guestName, 120);
    const guestEmail = clip(req.body?.guestEmail, 200);
    if (!body) return res.status(400).json({ error: 'Write a comment first.' });
    if (!guestName) return res.status(400).json({ error: 'Add your name so the team knows who left this.' });
    if (share.requireEmail && !isEmail(guestEmail)) return res.status(400).json({ error: 'A valid email is required to comment on this link.' });
    const timecodeMs = Number(req.body?.timecodeMs);
    const comment = {
      assetId: asset.id, versionId: String(asset.currentVersionId || ''),
      authorUid: '', authorName: guestName, authorKind: 'GUEST',
      ...(guestEmail ? { guestEmail } : {}),
      // firestoreCreate serializes JS numbers as integerValue, so store whole seconds (a
      // fractional value would be rejected by the Firestore REST API and the write would fail).
      body, ...(Number.isFinite(timecodeMs) && timecodeMs >= 0 ? { timeStartSeconds: Math.round(timecodeMs / 1000) } : {}),
      visibility: 'EVERYONE', resolved: false, createdAt: Date.now(),
    };
    const id = await firestoreCreate('hqComments', comment);
    await firestoreCreate('hqActivity', { assetId: asset.id, scopeKind: asset.scopeKind, scopeId: asset.scopeId,
      actorUid: '', actorName: guestName, actorKind: 'GUEST', action: 'COMMENTED', createdAt: Date.now() });
    return res.json({ ok: true, comment: { id, authorName: guestName, authorKind: 'GUEST', body,
      timeStartSeconds: comment.timeStartSeconds, resolved: false, createdAt: comment.createdAt } });
  });

  // Guest decision — gated on allowApproval; records an HqGuestDecision, moves the asset
  // status, and notifies the link's creator + asset owner (same deep link authed reviews use).
  app.post('/api/hq/share/:shareId/:token/decision', apiLimiter, express.json({ limit: '16kb' }), async (req: any, res: any) => {
    const valid = await loadValidShare(String(req.params.shareId), String(req.params.token));
    if (!valid) return res.status(403).json({ error: 'This review link is no longer available.' });
    const { share, asset } = valid;
    if (!share.allowApproval) return res.status(403).json({ error: 'Approvals are turned off for this link.' });
    const decision = String(req.body?.decision || '');
    if (decision !== 'APPROVED' && decision !== 'CHANGES_REQUESTED') return res.status(400).json({ error: 'Choose Approve or Request changes.' });
    const guestName = clip(req.body?.guestName, 120);
    const guestEmail = clip(req.body?.guestEmail, 200);
    const note = clip(req.body?.note, 2000);
    if (!guestName) return res.status(400).json({ error: 'Add your name to record this decision.' });
    if (share.requireEmail && !isEmail(guestEmail)) return res.status(400).json({ error: 'A valid email is required to decide on this link.' });
    const rec = { shareId: share.id, assetId: asset.id, versionId: String(asset.currentVersionId || ''),
      decision, ...(note ? { note } : {}), guestName, ...(guestEmail ? { guestEmail } : {}), createdAt: Date.now() };
    await firestoreCreate('hqGuestDecisions', rec);
    await firestoreWrite('orgAssets', asset.id, decision === 'APPROVED'
      ? { status: 'APPROVED', approvedAt: Date.now() } : { status: 'CHANGES_REQUESTED' });
    await firestoreCreate('hqActivity', { assetId: asset.id, scopeKind: asset.scopeKind, scopeId: asset.scopeId,
      actorUid: '', actorName: guestName, actorKind: 'GUEST', action: decision, createdAt: Date.now() });
    // Notify the person who created the link and (for orgs) the org owner.
    const recipients = new Set<string>();
    if (share.createdByUid) recipients.add(String(share.createdByUid));
    if (asset.scopeKind === 'user' && asset.scopeId) recipients.add(String(asset.scopeId));
    if (asset.scopeKind === 'org') {
      const org = await firestoreRead('organizations', String(asset.scopeId));
      if (org?.creatorId) recipients.add(String(org.creatorId));
    }
    const verb = decision === 'APPROVED' ? 'approved' : 'requested changes on';
    await Promise.all([...recipients].map(userId => firestoreCreate('notifications', {
      userId, senderId: '', senderName: guestName, type: 'CONTENT', title: decision === 'APPROVED' ? 'Asset approved' : 'Changes requested',
      message: `${guestName} ${verb} ${asset.name}.`, targetId: asset.id, link: `content-hq:${asset.id}`,
      isRead: false, timestamp: Date.now(),
    })));
    return res.json({ ok: true, decision, status: decision === 'APPROVED' ? 'APPROVED' : 'CHANGES_REQUESTED' });
  });

  // ── Content HQ retention cleanup worker (Wave 3) ───────────────────────────
  // Permanently purges soft-deleted assets whose 30-day retention window has elapsed:
  // every Storage object under protected-hq/ (the asset + all its versions) AND every
  // associated Firestore doc (asset, versions, comments, reviews, activity, guest
  // decisions, share links). Also expires dead share links past their expiresAt.
  // Idempotent (deleting an already-gone object/doc is a no-op) and capped per run
  // (?limit=N, default 25, max 100) so a single invocation stays bounded.
  //
  // Auth: an admin/cron secret, reusing the same pattern as /api/cron/publish-due-posts —
  //   POST /api/hq/retention/sweep?key=<ADMIN_SEED_KEY|CRON_SECRET>
  //   (or header  x-cron-key: <secret>)
  // NO scheduler is wired here. This repo deploys to Cloud Run; point Cloud Scheduler
  // (e.g. daily) at this URL with the secret to run it. Each purge is written to the
  // durable hqAuditLog collection (which SURVIVES the asset, whose own hqActivity is
  // deleted in the same sweep).
  app.post('/api/hq/retention/sweep', express.json(), async (req: any, res: any) => {
    const key = req.headers['x-cron-key'];
    if (!secretsEqual(key, process.env.ADMIN_SEED_KEY) && !secretsEqual(key, process.env.CRON_SECRET)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const now = Date.now();
    const cap = Math.max(1, Math.min(Number(req.query.limit) || 25, 100));
    const summary = { sweptAssets: 0, purgedObjects: 0, purgedDocs: 0, expiredShares: 0, assetIds: [] as string[] };
    const CHILD_COLLECTIONS = ['hqAssetVersions', 'hqComments', 'hqReviewRequests', 'hqActivity', 'hqGuestDecisions', 'hqShareLinks'];
    try {
      // 1) Assets whose retention window elapsed. The deletedAt post-filter guards against
      //    any restored asset (retentionDeleteAt cleared to null) slipping through.
      const expired = (await fsQueryDocs('orgAssets', [{ field: 'retentionDeleteAt', op: 'LESS_THAN_OR_EQUAL', value: now }], cap))
        .filter(a => a.data.deletedAt);
      for (const { id, data } of expired) {
        // Storage objects: the asset original + every version's object.
        const versions = await fsQueryDocs('hqAssetVersions', [{ field: 'assetId', op: 'EQUAL', value: id }], 500);
        const objectPaths = new Set<string>();
        if (data.storagePath) objectPaths.add(String(data.storagePath));
        for (const v of versions) if (v.data.storagePath) objectPaths.add(String(v.data.storagePath));
        for (const p of objectPaths) { if (await deleteHqStorageObject(p)) summary.purgedObjects++; }
        // Firestore docs across every associated collection.
        for (const coll of CHILD_COLLECTIONS) {
          const docs = await fsQueryDocs(coll, [{ field: 'assetId', op: 'EQUAL', value: id }], 500);
          for (const d of docs) { if (await fsDelete(`${coll}/${d.id}`)) summary.purgedDocs++; }
        }
        if (await fsDelete(`orgAssets/${id}`)) summary.purgedDocs++;
        summary.sweptAssets++; summary.assetIds.push(id);
        // Durable audit that outlives the asset (its hqActivity was just deleted).
        await firestoreCreate('hqAuditLog', { kind: 'RETENTION_PURGE', assetId: id,
          scopeKind: String(data.scopeKind || ''), scopeId: String(data.scopeId || ''), name: String(data.name || ''),
          objectCount: objectPaths.size, createdAt: now });
      }
      // 2) Dead share links past their expiry, independent of any asset purge.
      const deadShares = await fsQueryDocs('hqShareLinks', [{ field: 'expiresAt', op: 'LESS_THAN_OR_EQUAL', value: now }], cap);
      for (const s of deadShares) { if (await fsDelete(`hqShareLinks/${s.id}`)) summary.expiredShares++; }
      return res.json({ ok: true, ...summary });
    } catch (err: any) {
      console.error('[Content HQ] retention sweep failed:', err?.message || err);
      return res.status(500).json({ error: err?.message || 'sweep failed' });
    }
  });

  // Permanently delete one Storage object under the project bucket (idempotent — a
  // 404 counts as success). Server-side only; guests/clients never reach protected-hq.
  async function deleteHqStorageObject(objectPath: string): Promise<boolean> {
    const token = await getGoogleAccessToken();
    if (!token) return false;
    const url = `https://storage.googleapis.com/storage/v1/b/${STORAGE_BUCKET}/o/${encodeURIComponent(objectPath)}`;
    try {
      const r = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      return r.ok || r.status === 404;
    } catch { return false; }
  }

  // ── Terra: the Open Listing Record feed (public, mirrorable) ───────────────
  // OLR is a RESO-Data-Dictionary-aligned projection of listing data, published
  // openly so anyone can mirror it. This is Terra's OUTBOUND distribution story:
  // rather than queueing for a syndication slot on a closed portal, we publish an
  // open standard and let consumers come to it. Paging is RESO-style — take the
  // `nextSince` from a response and pass it back as ?since=.
  app.get('/api/terra/olr', apiLimiter, async (req: any, res) => {
    try {
      const since = typeof req.query.since === 'string' ? req.query.since : undefined;
      const max = Math.max(1, Math.min(Number(req.query.limit) || 200, 500));
      if (since && Number.isNaN(Date.parse(since))) {
        return res.status(400).json({ error: 'since must be an ISO 8601 datetime' });
      }

      const { fetchPublishableListings } = await import('./services/terra/terraService.js');
      const { buildFeedPage } = await import('./services/terra/olr.js');
      const records = await fetchPublishableListings({ since, max });

      res.set('Cache-Control', 'public, max-age=300');
      res.json(buildFeedPage(records));
    } catch (err: any) {
      console.error('[Terra] OLR feed failed:', err?.message || err);
      res.status(500).json({ error: err?.message || 'feed unavailable' });
    }
  });

  // A single Open Listing Record, with its content hash for verification.
  app.get('/api/terra/olr/:listingKey', apiLimiter, async (req: any, res) => {
    const key = String(req.params.listingKey || '').trim();
    if (!key || key.length > 128) return res.status(400).json({ error: 'valid listingKey required' });
    try {
      const { fetchListing } = await import('./services/terra/terraService.js');
      const { toPublicRecord } = await import('./services/terra/olr.js');
      const record = await fetchListing(key);
      if (!record) return res.status(404).json({ error: 'not found' });
      res.set('Cache-Control', 'public, max-age=300');
      res.json(toPublicRecord(record));
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'lookup failed' });
    }
  });

  // Machine-readable description of the feed: version, licence, attribution.
  app.get('/api/terra/olr-schema', apiLimiter, async (_req, res) => {
    try {
      const olr = await import('./services/terra/olr.js');
      res.set('Cache-Control', 'public, max-age=3600');
      res.json({
        olrVersion: olr.OLR_VERSION,
        resoDataDictionary: olr.RESO_DD_TARGET,
        license: olr.OLR_LICENSE,
        licenseUrl: olr.OLR_LICENSE_URL,
        specUrl: 'https://github.com/plajah/terra/blob/main/docs/OPEN_LISTING_RECORD.md',
        feedUrl: '/api/terra/olr',
        paging: { cursorParam: 'since', cursorField: 'ModificationTimestamp', limitParam: 'limit', maxLimit: 500 },
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'schema unavailable' });
    }
  });

  // Recount followerCount/followingCount from the `follows` collection (source of truth). The client
  // counters are +/-1 increments and drift on approvals, blocks and failed halves of a batch.
  // Idempotent (writes absolute values). Self only; admins may pass { uid } for anyone.
  app.post('/api/social/reconcile-counts', authMiddleware, express.json({ limit: '2kb' }), async (req: any, res: any) => {
    try {
      const callerUid: string = req.uid;
      const wanted = typeof req.body?.uid === 'string' && req.body.uid ? String(req.body.uid) : callerUid;
      if (!/^[A-Za-z0-9_-]{6,128}$/.test(wanted)) return res.status(400).json({ error: 'invalid uid' });
      if (wanted !== callerUid) {
        const isAdminCaller = await fetchFirebaseDoc('admins', callerUid);
        if (!isAdminCaller) return res.status(403).json({ error: 'Admin access required to reconcile another user' });
      }
      const projectId = 'gen-lang-client-0665118474';
      const dbId = 'plajah-prod';
      const countWhere = async (field: string, value: string): Promise<number | null> => {
        const r = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents:runAggregationQuery`, {
          method: 'POST',
          headers: { ...(await firestoreAuthHeaders()), 'Content-Type': 'application/json' },
          body: JSON.stringify({ structuredAggregationQuery: {
            structuredQuery: { from: [{ collectionId: 'follows' }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } } },
            aggregations: [{ alias: 'n', count: {} }],
          } }),
        });
        if (!r.ok) return null;
        const j: any = await r.json();
        const n = j?.[0]?.result?.aggregateFields?.n?.integerValue;
        return n === undefined ? null : Number(n);
      };
      const [followerCount, followingCount] = await Promise.all([countWhere('followingId', wanted), countWhere('followerId', wanted)]);
      if (followerCount === null || followingCount === null) return res.status(502).json({ error: 'count unavailable' });
      await firestoreWrite('users', wanted, { followerCount, followingCount }, true);
      res.json({ uid: wanted, followerCount, followingCount });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'reconcile failed' });
    }
  });

  // Admin-gated manual ingestion run (mirrors /api/sports/ingest).
  app.post('/api/terra/ingest', authMiddleware, express.json({ limit: '32kb' }), async (req: any, res) => {
    const isAdmin = await fetchFirebaseDoc('admins', req.uid);
    if (!isAdmin) return res.status(403).json({ error: 'Admin access required' });

    try {
      const { scope = 'standard', feeds, maxParcels } = req.body ?? {};
      if (!['lite', 'standard', 'deep'].includes(scope)) {
        return res.status(400).json({ error: 'scope must be lite, standard, or deep' });
      }
      if (feeds && (!Array.isArray(feeds) || feeds.length > 12)) {
        return res.status(400).json({ error: 'feeds must be an array of up to 12 feed ids' });
      }

      const { runTerraIngestionWorker } = await import('./services/terraIngestionWorker.js');
      const summary = await runTerraIngestionWorker({
        scope,
        feeds,
        maxParcels: Number.isFinite(maxParcels) ? Math.max(0, Math.min(50000, Number(maxParcels))) : undefined,
        reason: 'manual_api',
      });
      res.json(summary);
    } catch (err: any) {
      console.error('[Terra Ingestion] Manual run failed:', err?.message || err);
      res.status(500).json({ error: err?.message || 'Terra ingestion failed' });
    }
  });

  // ── Cron trigger for Terra ingestion ─────────────────────────────────────────
  // Cloud Run scales to zero, so the worker's in-process 24h setInterval almost
  // never fires (the container is recycled long before the timer elapses). The
  // durable driver is an EXTERNAL scheduler (Cloud Scheduler) hitting this route
  // once a day with the shared secret in TERRA_CRON_KEY. Kept separate from the
  // admin-user route above because a scheduler carries no Firebase ID token.
  // Single-flight in the worker means this can't overlap a warm/startup pass.
  app.post('/api/terra/cron/ingest', express.json({ limit: '4kb' }), async (req: any, res) => {
    const expected = process.env.TERRA_CRON_KEY || '';
    const provided = String(req.get('x-terra-cron-key') || '');
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (!expected || a.length !== b.length || !nodeCrypto.timingSafeEqual(a, b)) {
      return res.status(401).json({ error: 'invalid or missing cron key' });
    }
    try {
      const scope = ['lite', 'standard', 'deep'].includes(req.body?.scope) ? req.body.scope : 'standard';
      const { runTerraIngestionWorker } = await import('./services/terraIngestionWorker.js');
      const summary = await runTerraIngestionWorker({ scope, reason: 'cron' });
      res.json(summary);
    } catch (err: any) {
      console.error('[Terra Ingestion] Cron run failed:', err?.message || err);
      res.status(500).json({ error: err?.message || 'Terra ingestion failed' });
    }
  });

  // ── Terra ingestion status (public, read-only) ───────────────────────────────
  // The visibility that was missing: is ingestion actually running, what did the
  // last run save, and how far has the parcel cursor walked the city? Reads the
  // stable pointers the worker maintains — no query, no index.
  app.get('/api/terra/status', apiLimiter, async (_req, res) => {
    try {
      const { fsGet } = await import('./services/firebaseAdminRest.js');
      const [latestDoc, cursorDoc]: any[] = await Promise.all([
        fsGet('terraIngestionRuns/latest'), // NOT `__latest__` — that id form is reserved by Firestore
        fsGet('terraIngestionRuns/__cursor__detroit_parcels'),
      ]);
      const lastRun = latestDoc?.data ?? null;
      const rawOffset = cursorDoc ? Number(cursorDoc.offset) : 0;
      const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
      const TOTAL_PARCELS = 377863; // Detroit parcel_file_current, republished daily
      res.json({
        workerEnabled: process.env.TERRA_INGESTION_WORKER === 'true',
        cronConfigured: !!process.env.TERRA_CRON_KEY,
        lastRun,
        parcelCursor: offset,
        approxTotalParcels: TOTAL_PARCELS,
        approxParcelProgressPct: Math.min(100, Math.round((offset / TOTAL_PARCELS) * 1000) / 10),
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'status unavailable' });
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

  // Stock quotes for the Signal ticker (followed stocks). Keyless by default
  // (Yahoo Finance chart endpoint, no CORS/keys server-side); falls back to
  // Finnhub when FINNHUB_API_KEY / STOCK_API_KEY is set (more reliable path).
  // Never throws — returns [] on any failure. Short in-memory cache (~45s) so
  // the ticker's polling doesn't hammer the upstream source.
  const _stockCache = new Map<string, { t: number; v: { symbol: string; price: number; changePct: number; currency: string } | null }>();
  const STOCK_TTL = 45_000;
  const stockKey = process.env.FINNHUB_API_KEY || process.env.STOCK_API_KEY || '';
  const fetchOneStock = async (symbol: string): Promise<{ symbol: string; price: number; changePct: number; currency: string } | null> => {
    const hit = _stockCache.get(symbol);
    if (hit && Date.now() - hit.t < STOCK_TTL) return hit.v;
    let out: { symbol: string; price: number; changePct: number; currency: string } | null = null;
    try {
      if (stockKey) {
        // Finnhub: c = current price, dp = percent change, pc = previous close.
        const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${stockKey}`);
        if (r.ok) {
          const d: any = await r.json();
          const price = Number(d?.c);
          if (price > 0) {
            const changePct = typeof d?.dp === 'number' ? d.dp
              : (Number(d?.pc) > 0 ? ((price - Number(d.pc)) / Number(d.pc)) * 100 : 0);
            out = { symbol, price, changePct, currency: 'USD' };
          }
        }
      }
      if (!out) {
        // Keyless Yahoo Finance chart endpoint — works from Node without a key.
        const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`,
          { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (r.ok) {
          const d: any = await r.json();
          const meta = d?.chart?.result?.[0]?.meta;
          const price = Number(meta?.regularMarketPrice);
          const prev = Number(meta?.chartPreviousClose ?? meta?.previousClose);
          if (price > 0) {
            const changePct = prev > 0 ? ((price - prev) / prev) * 100 : 0;
            out = { symbol, price, changePct, currency: meta?.currency || 'USD' };
          }
        }
      }
    } catch { /* leave out as null */ }
    _stockCache.set(symbol, { t: Date.now(), v: out });
    return out;
  };
  app.get('/api/markets/stocks', apiLimiter, async (req: any, res) => {
    try {
      const symbols = String(req.query.symbols || '')
        .split(',')
        .map(s => s.trim().toUpperCase())
        .filter(Boolean)
        .slice(0, 20);
      if (symbols.length === 0) return res.json([]);
      const results = await Promise.all(symbols.map(fetchOneStock));
      res.set('Cache-Control', 'public, max-age=45');
      res.json(results.filter(Boolean));
    } catch { res.json([]); }
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
      const event = { id: req.params.eventId, creatorUid: f.creatorUid?.stringValue, creatorName: f.creatorName?.stringValue, creatorPhotoURL: f.creatorPhotoURL?.stringValue, title: f.title?.stringValue, subtitle: f.subtitle?.stringValue, description: f.description?.stringValue, coverImage: f.coverImage?.stringValue, heroVideoUrl: f.heroVideoUrl?.stringValue, type: f.type?.stringValue, status: f.status?.stringValue, venueName: f.venueName?.stringValue, venueAddress: f.venueAddress?.stringValue, city: f.city?.stringValue, state: f.state?.stringValue, country: f.country?.stringValue, streamUrl: f.streamUrl?.stringValue, startDate: parseInt(f.startDate?.integerValue ?? '0'), endDate: parseInt(f.endDate?.integerValue ?? '0'), doorsOpenDate: f.doorsOpenDate?.integerValue ? parseInt(f.doorsOpenDate.integerValue) : undefined, timezone: f.timezone?.stringValue ?? 'America/New_York', totalCapacity: parseInt(f.totalCapacity?.integerValue ?? '0'), totalSold: parseInt(f.totalSold?.integerValue ?? '0'), kioskEnabled: f.kioskEnabled?.booleanValue ?? false, printingEnabled: f.printingEnabled?.booleanValue ?? false, sanctuaryMembersOnly: f.sanctuaryMembersOnly?.booleanValue ?? false, refundPolicy: f.refundPolicy?.stringValue ?? 'NO_REFUND', ageRestriction: f.ageRestriction?.stringValue, dresscode: f.dresscode?.stringValue, accessibilityInfo: f.accessibilityInfo?.stringValue, viewCount: parseInt(f.viewCount?.integerValue ?? '0'), shareCount: parseInt(f.shareCount?.integerValue ?? '0'), tiers: JSON.parse(f.tiers?.stringValue ?? '[]'), itinerary: JSON.parse(f.itinerary?.stringValue ?? '[]'), faqItems: JSON.parse(f.faqItems?.stringValue ?? '[]'), promoCodes: JSON.parse(f.promoCodes?.stringValue ?? '[]'), galleryImages: JSON.parse(f.galleryImages?.stringValue ?? '[]'), tags: JSON.parse(f.tags?.stringValue ?? '[]'), packages: JSON.parse(f.packages?.stringValue ?? '[]'), createdAt: parseInt(f.createdAt?.integerValue ?? '0'), updatedAt: parseInt(f.updatedAt?.integerValue ?? '0') };
      firestoreWrite('plajahEvents', req.params.eventId, { viewCount: event.viewCount + 1, updatedAt: Date.now() }).catch(() => {});
      res.json(event);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Purchase tickets — creates Stripe Checkout session
  app.post('/api/events/:eventId/tickets/purchase', authMiddleware, express.json(), async (req: any, res) => {
    const uid: string = req.uid;
    const { tierId, quantity = 1, holderName, holderEmail, physicalRequested, customPackagingRequested, shippingAddress, promoCode, selectedPackages = [] } = req.body;
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
      
      let packagesTotal = 0;
      const initializedPackages = selectedPackages.map((pkg: any) => {
        packagesTotal += (pkg.priceCents || 0);
        return {
          id: `tpkg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          packageAddonId: pkg.id,
          name: pkg.name,
          category: pkg.category,
          type: pkg.type,
          totalUnits: pkg.totalUnits,
          remainingUnits: pkg.totalUnits,
          unitName: pkg.unitName,
          eligibleItems: pkg.eligibleItems || [],
          eligibleItemsDescription: pkg.eligibleItemsDescription || '',
          stations: pkg.stations || [],
          cooldownMinutes: pkg.cooldownMinutes,
          souvenirCupIncluded: pkg.souvenirCupIncluded,
          badgeColor: pkg.badgeColor,
          redemptions: [],
        };
      });

      const subtotal = unitPrice * quantity + packagingFee + packagesTotal;

      const origin = trustedRequestOrigin(req);
      const lineItems: any[] = [{ price_data: { currency: 'usd', product_data: { name: `${f.title?.stringValue} — ${tier.name}`, description: tier.description, ...(f.coverImage?.stringValue ? { images: [f.coverImage.stringValue] } : {}) }, unit_amount: unitPrice }, quantity }];
      if (packagingFee > 0) lineItems.push({ price_data: { currency: 'usd', product_data: { name: 'Custom Ticket Packaging' }, unit_amount: packagingFee }, quantity: 1 });

      for (const p of selectedPackages) {
        if (p.priceCents > 0) {
          lineItems.push({
            price_data: {
              currency: 'usd',
              product_data: {
                name: `Package Add-On: ${p.name}`,
                description: p.description || p.eligibleItemsDescription || 'Venue Package',
              },
              unit_amount: p.priceCents,
            },
            quantity: 1,
          });
        }
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'payment', payment_method_types: ['card'], line_items: lineItems,
        metadata: {
          type: 'event_ticket',
          eventId: req.params.eventId,
          tierId,
          tierName: tier.name,
          tierColor: tier.color || '#a78bfa',
          quantity: String(quantity),
          uid,
          holderName: holderName || '',
          holderEmail: holderEmail || '',
          physicalRequested: String(!!physicalRequested),
          customPackagingRequested: String(!!customPackagingRequested),
          shippingAddress: shippingAddress ? JSON.stringify(shippingAddress) : '',
          packages: JSON.stringify(initializedPackages),
          subtotal: String(subtotal)
        },
        success_url: `${origin}?event_success=${req.params.eventId}`,
        cancel_url: `${origin}/event/${req.params.eventId}`,
        customer_email: holderEmail,
      });
      res.json({ url: session.url });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Validate / check-in a ticket (returns full package & pass data)
  app.post('/api/tickets/:ticketId/validate', authMiddleware, express.json(), async (req: any, res) => {
    try {
      const doc = await fetchFirebaseDoc('eventTickets', req.params.ticketId);
      if (!doc?.fields) return res.json({ valid: false, reason: 'Ticket not found' });
      const f = doc.fields;
      if (f.status?.stringValue === 'USED') return res.json({ valid: false, reason: 'Already checked in', checkedInAt: parseInt(f.checkedInAt?.integerValue ?? '0'), holderName: f.holderName?.stringValue, packages: JSON.parse(f.packages?.stringValue ?? '[]') });
      if (f.status?.stringValue !== 'VALID') return res.json({ valid: false, reason: `Ticket is ${f.status?.stringValue}` });
      await firestoreWrite('eventTickets', req.params.ticketId, { status: 'USED', checkedInAt: Date.now(), checkedInBy: req.uid });
      res.json({ valid: true, holderName: f.holderName?.stringValue, tierName: f.tierName?.stringValue, eventTitle: f.eventTitle?.stringValue, quantity: parseInt(f.quantity?.integerValue ?? '1'), packages: JSON.parse(f.packages?.stringValue ?? '[]') });
    } catch (err: any) { res.status(500).json({ error: err.message, valid: false }); }
  });

  // Redeem a package perk (With live cooldown & balance decrement)
  app.post('/api/tickets/:ticketId/redeem-package', authMiddleware, express.json(), async (req: any, res) => {
    const { packageId, units = 1, itemName, stationName, notes, overrideCooldown = false } = req.body;
    try {
      const doc = await fetchFirebaseDoc('eventTickets', req.params.ticketId);
      if (!doc?.fields) return res.status(404).json({ success: false, reason: 'Ticket not found' });
      const f = doc.fields;
      const packages: any[] = JSON.parse(f.packages?.stringValue ?? '[]');
      const pkgIndex = packages.findIndex((p: any) => p.id === packageId || p.packageAddonId === packageId);
      if (pkgIndex === -1) return res.status(400).json({ success: false, reason: 'Package not attached to this ticket' });

      const pkg = packages[pkgIndex];
      const now = Date.now();

      // Check anti-abuse cooldown (anti-stacking pacing rule)
      if (pkg.cooldownMinutes && pkg.lastRedeemedAt && !overrideCooldown) {
        const elapsedMs = now - pkg.lastRedeemedAt;
        const cooldownMs = pkg.cooldownMinutes * 60 * 1000;
        if (elapsedMs < cooldownMs) {
          const remainingSeconds = Math.ceil((cooldownMs - elapsedMs) / 1000);
          return res.json({
            success: false,
            cooldownActive: true,
            remainingSeconds,
            reason: `Anti-abuse pacing active. Next eligible drink/item in ${Math.ceil(remainingSeconds / 60)} minute(s).`,
            package: pkg,
          });
        }
      }

      // Check balance if not unlimited
      if (pkg.type !== 'UNLIMITED') {
        if (pkg.remainingUnits < units) {
          return res.json({
            success: false,
            reason: `Package allowance exhausted. 0 ${pkg.unitName} remaining.`,
            package: pkg,
          });
        }
        pkg.remainingUnits = Math.max(0, pkg.remainingUnits - units);
      }

      pkg.lastRedeemedAt = now;
      const redemptionRecord = {
        id: `red_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: now,
        unitsRedeemed: units,
        itemName: itemName || (pkg.category === 'ALCOHOL' ? 'Craft Beverage' : 'Menu Item'),
        stationName: stationName || 'Main Bar',
        staffUid: req.uid,
        notes: notes || '',
      };
      if (!pkg.redemptions) pkg.redemptions = [];
      pkg.redemptions.unshift(redemptionRecord);

      packages[pkgIndex] = pkg;
      await firestoreWrite('eventTickets', req.params.ticketId, {
        packages: JSON.stringify(packages),
      });

      res.json({ success: true, package: pkg, redemption: redemptionRecord });
    } catch (err: any) { res.status(500).json({ success: false, reason: err.message }); }
  });

  // Attach a package to a ticket directly (box office upgrade / onsite add-on)
  app.post('/api/tickets/:ticketId/add-package', authMiddleware, express.json(), async (req: any, res) => {
    const { packageAddon } = req.body;
    if (!packageAddon) return res.status(400).json({ error: 'packageAddon is required' });
    try {
      const doc = await fetchFirebaseDoc('eventTickets', req.params.ticketId);
      if (!doc?.fields) return res.status(404).json({ error: 'Ticket not found' });
      const f = doc.fields;
      const packages: any[] = JSON.parse(f.packages?.stringValue ?? '[]');
      const newPkg = {
        id: `tpkg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        packageAddonId: packageAddon.id,
        name: packageAddon.name,
        category: packageAddon.category,
        type: packageAddon.type,
        totalUnits: packageAddon.totalUnits,
        remainingUnits: packageAddon.totalUnits,
        unitName: packageAddon.unitName,
        eligibleItems: packageAddon.eligibleItems || [],
        eligibleItemsDescription: packageAddon.eligibleItemsDescription || '',
        stations: packageAddon.stations || [],
        cooldownMinutes: packageAddon.cooldownMinutes,
        souvenirCupIncluded: packageAddon.souvenirCupIncluded,
        badgeColor: packageAddon.badgeColor,
        redemptions: [],
      };
      packages.push(newPkg);
      await firestoreWrite('eventTickets', req.params.ticketId, {
        packages: JSON.stringify(packages),
      });
      res.json({ success: true, package: newPkg });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
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
        return { id: d.document.name.split('/').pop(), eventId: f.eventId?.stringValue, eventTitle: f.eventTitle?.stringValue, eventStartDate: parseInt(f.eventStartDate?.integerValue ?? '0'), eventVenue: f.eventVenue?.stringValue, eventCoverImage: f.eventCoverImage?.stringValue, tierName: f.tierName?.stringValue, tierColor: f.tierColor?.stringValue, status: f.status?.stringValue, quantity: parseInt(f.quantity?.integerValue ?? '1'), packages: JSON.parse(f.packages?.stringValue ?? '[]'), createdAt: parseInt(f.createdAt?.integerValue ?? '0') };
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
      res.json({ id: req.params.ticketId, eventId: f.eventId?.stringValue, eventTitle: f.eventTitle?.stringValue, eventStartDate: parseInt(f.eventStartDate?.integerValue ?? '0'), eventVenue: f.eventVenue?.stringValue, eventCoverImage: f.eventCoverImage?.stringValue, tierId: f.tierId?.stringValue, tierName: f.tierName?.stringValue, tierColor: f.tierColor?.stringValue, holderName: f.holderName?.stringValue, holderEmail: f.holderEmail?.stringValue, orderNumber: f.orderNumber?.stringValue, quantity: parseInt(f.quantity?.integerValue ?? '1'), totalPriceCents: parseInt(f.totalPriceCents?.integerValue ?? '0'), status: f.status?.stringValue, checkedInAt: f.checkedInAt?.integerValue ? parseInt(f.checkedInAt.integerValue) : undefined, physicalRequested: f.physicalRequested?.booleanValue ?? false, packages: JSON.parse(f.packages?.stringValue ?? '[]'), createdAt: parseInt(f.createdAt?.integerValue ?? '0') });
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
        return { id: d.document.name.split('/').pop(), holderName: f.holderName?.stringValue, holderEmail: f.holderEmail?.stringValue, tierName: f.tierName?.stringValue, tierColor: f.tierColor?.stringValue, status: f.status?.stringValue, checkedInAt: f.checkedInAt?.integerValue ? parseInt(f.checkedInAt.integerValue) : undefined, quantity: parseInt(f.quantity?.integerValue ?? '1'), physicalRequested: f.physicalRequested?.booleanValue, packages: JSON.parse(f.packages?.stringValue ?? '[]'), createdAt: parseInt(f.createdAt?.integerValue ?? '0') };
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
      const ticketPdfUrl = `${trustedRequestOrigin(req)}/print-ticket/${req.params.ticketId}`;
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

      const successUrl = `${trustedRequestOrigin(req)}/?subscription=success`;
      const cancelUrl  = `${trustedRequestOrigin(req)}/?subscription=cancelled`;

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

      const successUrl = `${trustedRequestOrigin(req)}/?rebind=success`;
      const cancelUrl  = `${trustedRequestOrigin(req)}/?rebind=cancelled`;

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
        success_url: `${trustedRequestOrigin(req)}/?ad=success`,
        cancel_url:  `${trustedRequestOrigin(req)}/?ad=cancelled`,
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
        success_url: `${trustedRequestOrigin(req)}/?offplatform=success`,
        cancel_url:  `${trustedRequestOrigin(req)}/?offplatform=cancelled`,
        metadata: { type: 'offplatform', uid, tier, price: String(t.price / 100) },
      });

      res.json({ url: session.url });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Marketing: Local Reach — Lob address verification ───────────────────────
  // Targeted (list-based) direct mail — see docs/MARKETING_LOCAL_REACH_SPEC.md §3
  // and services/marketing/reachEstimateService.ts. Lob is the one Local Reach
  // vendor with a genuinely public, key-only API (no partner agreement needed —
  // https://www.lob.com/products/print-mail/postcards + /v1/us_verifications).
  // Real endpoint, real HTTP call — but it only VERIFIES deliverability of a
  // supplied address list; it does not compute EDDM route/mailbox counts or DOOH
  // screen availability, which need a signed Taradel/Adomni-class partner
  // agreement neither of which exists yet. Those channels stay on the density
  // model (reachEstimateService `source: 'model'`) until that changes — this
  // route is what flips a targeted-mail estimate's source to 'live'.
  const LOB_MAX_BATCH = 100; // one request per campaign audience upload is plenty; caps cost/abuse.

  async function lobVerifyOne(apiKey: string, address: Record<string, string>) {
    const res = await fetch('https://api.lob.com/v1/us_verifications', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        primary_line: address.address_line1,
        secondary_line: address.address_line2 || undefined,
        city: address.address_city,
        state: address.address_state,
        zip_code: address.address_zip,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { deliverable: false, error: body?.error?.message || `Lob ${res.status}` };
    }
    const data = await res.json();
    return {
      deliverable: data.deliverability === 'deliverable' || data.deliverability === 'deliverable_missing_unit',
      deliverability: data.deliverability,
    };
  }

  app.post('/api/marketing/verify-address', authMiddleware, express.json(), async (req: any, res) => {
    const apiKey = process.env.LOB_API_KEY;
    if (!apiKey) return res.status(503).json({ configured: false, error: 'LOB_API_KEY not configured — add it to verify real addresses; targeted-mail counts stay estimate-only until then.' });
    try {
      const result = await lobVerifyOne(apiKey, req.body?.address || {});
      res.json({ configured: true, ...result });
    } catch (err: any) {
      res.status(502).json({ error: err.message });
    }
  });

  // Verifies a whole audience list in one call so a campaign's `direct_mail`
  // AudienceList.count can be a VERIFIED deliverable count, not a raw upload
  // count. Small fixed concurrency — Lob rate-limits, and this runs at most
  // once per campaign build, not per keystroke.
  app.post('/api/marketing/verify-address-batch', authMiddleware, express.json(), async (req: any, res) => {
    const apiKey = process.env.LOB_API_KEY;
    if (!apiKey) return res.status(503).json({ configured: false, error: 'LOB_API_KEY not configured — add it to verify the list; the campaign will use the raw upload count instead.' });
    const addresses: Record<string, string>[] = Array.isArray(req.body?.addresses) ? req.body.addresses : [];
    if (!addresses.length) return res.status(400).json({ error: 'No addresses supplied' });
    if (addresses.length > LOB_MAX_BATCH) return res.status(400).json({ error: `Batch capped at ${LOB_MAX_BATCH} addresses per request` });

    try {
      const CONCURRENCY = 5;
      const results: Awaited<ReturnType<typeof lobVerifyOne>>[] = new Array(addresses.length);
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, addresses.length) }, async () => {
        while (next < addresses.length) {
          const i = next++;
          results[i] = await lobVerifyOne(apiKey, addresses[i]);
        }
      }));
      const deliverableCount = results.filter(r => r.deliverable).length;
      res.json({ configured: true, total: addresses.length, deliverableCount, results });
    } catch (err: any) {
      res.status(502).json({ error: err.message });
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
        success_url: `${trustedRequestOrigin(req)}/?pledge=success`,
        cancel_url:  `${trustedRequestOrigin(req)}/?pledge=cancelled`,
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
      const origin = trustedRequestOrigin(req);
      const isSub = !!recurring;

      // Route the gift to the CHURCH's connected Stripe account (destination charge)
      // when it has one — so money lands in the church's account, not the platform's.
      const church = await firestoreRead('organizations', churchId);
      const destAcct: string | undefined = church?.stripeAccountId || undefined;
      // DONOR COVERS THE FEE: charge gift + fee so the church receives exactly the gift. Only meaningful on a
      // destination charge (the platform keeps the fee as application_fee, which pays Stripe's cost). Default ON;
      // the donor may untick (coverFees:false) and the org may disable the offer (financeSettings.donorCoversFees=false).
      const orgOffersFeeCover = (church?.financeSettings?.donorCoversFees) !== false;
      const wantsFeeCover = !!destAcct && orgOffersFeeCover && req.body?.coverFees !== false;
      const feeMath = grossUpCents(Math.round(amount * 100), {
        rate: process.env.STRIPE_FEE_RATE ? Number(process.env.STRIPE_FEE_RATE) : undefined,
        fixedCents: process.env.STRIPE_FEE_FIXED_CENTS ? Number(process.env.STRIPE_FEE_FIXED_CENTS) : undefined,
      });
      const feeCoveredCents = wantsFeeCover ? feeMath.feeCents : 0;
      const chargeCents = wantsFeeCover ? feeMath.grossCents : feeMath.giftCents;
      // Gift metadata is also stamped on the PaymentIntent / Subscription so charge.refunded,
      // invoice.paid (monthly renewals) and the Elevate sync can attribute them to the church.
      const giftMeta = {
        type: 'church_donation', uid, churchId,
        churchName: churchName ?? '',
        fund: fund ?? 'General',
        amount: String(amount),                       // the GIFT (what the church receives), in dollars
        giftCents: String(feeMath.giftCents),
        feeCoveredCents: String(feeCoveredCents),     // extra the donor paid to cover processing; 0 if none
        recurring: String(!!recurring),
        message: message ?? '',
      };
      const routing = isSub
        ? { subscription_data: { metadata: giftMeta, ...(destAcct ? { transfer_data: { destination: destAcct, ...(feeCoveredCents ? {} : {}) }, ...(feeCoveredCents ? { application_fee_percent: applicationFeePercent(feeCoveredCents, chargeCents) } : {}) } : {}) } }
        : { payment_intent_data: { metadata: giftMeta, ...(destAcct ? { transfer_data: { destination: destAcct }, ...(feeCoveredCents ? { application_fee_amount: feeCoveredCents } : {}) } : {}) } };

      const session = await stripe.checkout.sessions.create({
        mode: isSub ? 'subscription' : 'payment',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: { name: `${churchName || 'Church'} — ${fund || 'General'} Giving${isSub ? ' (monthly)' : ''}` },
            unit_amount: chargeCents,
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
          giftCents: String(feeMath.giftCents),
          feeCoveredCents: String(feeCoveredCents),
          message: message ?? '',
        },
      });

      res.json({ url: session.url, feeCoveredCents, chargeCents });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Elevate: Stripe ↔ Finance Hub (Connect-aware, server-verified access) ─────
  // POST /api/elevate/stripe/sync  {orgId, sinceDays?}  → pull payouts+lines, backfill missed gifts, post journals.
  app.post('/api/elevate/stripe/sync', authMiddleware, async (req: any, res) => {
    const orgId = String(req.body?.orgId || '');
    if (!orgId) return res.status(400).json({ error: 'orgId required' });
    try {
      const gate = await assertOrgFinanceAccess(req.uid, orgId);
      if ('error' in gate) return res.status(gate.status).json({ error: gate.error });
      const acct: string | undefined = gate.org.stripeAccountId;
      if (!acct) return res.status(400).json({ error: 'This organization has no connected Stripe account yet.', code: 'NOT_CONNECTED' });
      if (_syncing.has(orgId)) return res.status(409).json({ error: 'A sync is already running', code: 'BUSY' });
      _syncing.add(orgId);
      try { res.json(await syncOrgStripe(orgId, acct, Number(req.body?.sinceDays) || 90)); }
      finally { _syncing.delete(orgId); }
    } catch (err: any) {
      console.error('[Elevate] sync error:', err?.message);
      if (!res.headersSent) res.status(500).json({ error: err?.message || 'Sync failed' });
    }
  });

  // ── Elevate Budget Pulse: proactive, deduped budget/cash/goal alerts ─────────────────────────
  // Runs the SAME pure math as the Finance Hub (services/acctPulse.ts) with no user present.
  //   POST /api/elevate/budget-alerts/run {orgId}   Firebase token + server-verified finance access → one org
  //   POST /api/elevate/budget-alerts/run           header x-elevate-cron-key: $ELEVATE_CRON_KEY (Cloud Scheduler) → every org with a budget
  //   ELEVATE_ALERTS_SWEEP=1 enables an in-process interval sweep (every ELEVATE_ALERTS_SWEEP_MIN minutes, default 180);
  //   Cloud Run scales to zero, so for production prefer Cloud Scheduler + ELEVATE_CRON_KEY.
  // Alert docs are acctAlerts/{orgId_scope_scopeId_kind_period}: each escalation level fires ONCE per period.
  const _pulseRunning = new Set<string>();
  async function runBudgetAlertsForOrg(orgId: string, pre?: Record<string, any> | null): Promise<{ evaluated: number; created: number; notified: number; skipped?: string }> {
    const out: { evaluated: number; created: number; notified: number; skipped?: string } = { evaluated: 0, created: 0, notified: 0 };
    if (_pulseRunning.has(orgId)) { out.skipped = 'busy'; return out; }
    _pulseRunning.add(orgId);
    try {
      const org = pre || await firestoreGetDeep('organizations', orgId);
      if (!org) { out.skipped = 'not-found'; return out; }
      if (org.financeSettings?.pulseAlertsOff) { out.skipped = 'disabled'; return out; }
      const eq = [{ field: 'orgId', op: 'EQUAL', value: orgId }];
      const rows = async (col: string, n: number) => (await fsQueryDocs(col, eq, n)).map(d => ({ ...d.data, id: d.id }));
      const [accounts, budgets, journals, expenses, projects] = await Promise.all([
        rows('acctAccounts', 2000), rows('acctBudgets', 100), rows('acctJournals', 20000), rows('acctExpenses', 20000), rows('acctProjects', 500),
      ]);
      if (!accounts.length) { out.skipped = 'no-books'; return out; }
      const today = new Date().toLocaleDateString('en-CA', { timeZone: ELEVATE_TZ });
      const alerts = pulseDeriveAlerts({
        orgId, today, accounts: accounts as any, journals: journals as any, expenses: expenses as any, budgets: budgets as any, projects: projects as any,
        ministries: org.ministries || [], funds: org.givingFunds || [], recurring: org.financeSettings?.recurringBills, settings: org.financeSettings || null, mode: 'FULL',
      });
      out.evaluated = alerts.length;
      const fresh: { a: (typeof alerts)[number]; audience: string[] }[] = [];
      for (const a of alerts) {
        if (await firestoreRead('acctAlerts', a.id)) continue;                 // already fired at this level for this period
        const audience = pulseAudience(a, org as any);
        const ok = await firestorePatchDeep('acctAlerts', a.id, deepClean({ ...a, audienceUids: audience, createdAt: Date.now(), source: 'server' }));
        if (ok) fresh.push({ a, audience });
      }
      out.created = fresh.length;
      // Notify: dept head for their dept; finance/bookkeeper/treasurer for all; pastors only for org-level. Honour each user's mute level.
      const byUser = new Map<string, typeof fresh>();
      fresh.forEach(f => f.audience.forEach(u => byUser.set(u, [...(byUser.get(u) || []), f])));
      for (const [uid, items] of byUser) {
        try {
          const u = await firestoreGetDeep('users', uid);
          const pref = u?.elevateAlertPrefs?.[orgId];
          const allowed = items.filter(i => pulsePrefAllows(pref, i.a.severity));
          if (!allowed.length) continue;
          // Never noisy: more than 3 new alerts collapse into a single digest.
          const msgs = allowed.length > 3
            ? [{ title: `${allowed.length} budget alerts need a look`, message: allowed.slice(0, 3).map(i => i.a.title).join(' · ') + ' …', id: allowed[0].a.id }]
            : allowed.map(i => ({ title: i.a.title, message: `${i.a.message} ${i.a.nextStep}`.trim(), id: i.a.id }));
          for (const m of msgs) {
            await firestoreCreate('notifications', { userId: uid, senderId: 'plajah-finance', senderName: org.name || 'Budget Pulse', senderPhoto: org.logoUrl || '', type: 'SYSTEM', title: m.title, message: m.message, targetId: orgId, isRead: false, timestamp: Date.now() });
            out.notified++;
            const tokens: string[] = [...(Array.isArray(u?.fcmTokens) ? u!.fcmTokens : []), ...(u?.fcmToken ? [u.fcmToken] : [])].filter(Boolean);
            if (tokens.length) sendFcmMulticast([...new Set(tokens)], { title: m.title, body: m.message.slice(0, 180), channelId: 'system', data: { type: 'SYSTEM', targetId: orgId, senderName: org.name || 'Budget Pulse' } }).catch(() => {});
          }
        } catch (e: any) { console.error('[Elevate] pulse notify failed:', e?.message); }
      }
      return out;
    } catch (e: any) {
      console.error('[Elevate] budget alerts failed for', orgId, e?.message);
      out.skipped = 'error'; return out;
    } finally { _pulseRunning.delete(orgId); }
  }
  async function sweepBudgetAlerts(): Promise<{ orgs: number; created: number; notified: number }> {
    const year = Number(new Date().toLocaleDateString('en-CA', { timeZone: ELEVATE_TZ }).slice(0, 4));
    const b = await fsQueryDocs('acctBudgets', [{ field: 'fiscalYear', op: 'GREATER_THAN_OR_EQUAL', value: year - 1 }], 1000);
    const orgIds = [...new Set(b.map(d => String(d.data.orgId || '')).filter(Boolean))].slice(0, Number(process.env.ELEVATE_ALERTS_MAX_ORGS) || 200);
    let created = 0, notified = 0;
    for (const id of orgIds) { const r = await runBudgetAlertsForOrg(id); created += r.created; notified += r.notified; }
    return { orgs: orgIds.length, created, notified };
  }
  app.post('/api/elevate/budget-alerts/run', (req: any, res: any, next: any) => {
    const provided = String(req.get('x-elevate-cron-key') || '');
    if (!provided) return authMiddleware(req, res, next);
    const expected = process.env.ELEVATE_CRON_KEY || '';
    const a = Buffer.from(provided), b = Buffer.from(expected);
    if (!expected || a.length !== b.length || !nodeCrypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'invalid or missing cron key' });
    req.pulseCron = true; next();
  }, async (req: any, res: any) => {
    try {
      const orgId = String(req.body?.orgId || '');
      if (req.pulseCron) return res.json(orgId ? await runBudgetAlertsForOrg(orgId) : await sweepBudgetAlerts());
      if (!orgId) return res.status(400).json({ error: 'orgId required' });
      const gate = await assertOrgFinanceAccess(req.uid, orgId);
      if ('error' in gate) return res.status(gate.status).json({ error: gate.error });
      res.json(await runBudgetAlertsForOrg(orgId, gate.org));
    } catch (err: any) {
      console.error('[Elevate] budget-alerts error:', err?.message);
      if (!res.headersSent) res.status(500).json({ error: err?.message || 'Alert run failed' });
    }
  });
  if (process.env.ELEVATE_ALERTS_SWEEP === '1') {
    const every = Math.max(15, Number(process.env.ELEVATE_ALERTS_SWEEP_MIN) || 180) * 60_000;
    setTimeout(() => sweepBudgetAlerts().catch(() => {}), 90_000).unref?.();
    setInterval(() => sweepBudgetAlerts().catch(() => {}), every).unref?.();
    console.log(`[Elevate] budget-alert sweep enabled (every ${every / 60000} min)`);
  }

  // GET /api/elevate/stripe/status?orgId=
  app.get('/api/elevate/stripe/status', authMiddleware, async (req: any, res) => {
    const orgId = String(req.query.orgId || '');
    if (!orgId) return res.status(400).json({ error: 'orgId required' });
    try {
      const gate = await assertOrgFinanceAccess(req.uid, orgId);
      if ('error' in gate) return res.status(gate.status).json({ error: gate.error });
      const acct: string | undefined = gate.org.stripeAccountId;
      const state = await firestoreRead('chmsFinanceMeta', `stripe_${orgId}`);
      const lastSyncAt: number | null = state?.lastSyncAt || null;
      if (!acct) return res.json({ connected: false, payoutsEnabled: false, lastSyncAt, missingRequirements: [] });
      const stripe = getStripe();
      const [account, balance, upcoming] = await Promise.all([
        stripe.accounts.retrieve(acct),
        stripe.balance.retrieve({}, { stripeAccount: acct }).catch(() => null),
        stripe.payouts.list({ limit: 5 }, { stripeAccount: acct }).catch(() => ({ data: [] })),
      ]);
      const sumUsd = (xs: any[] | undefined) => usd((xs || []).filter(b => b.currency === 'usd').reduce((s, b) => s + b.amount, 0));
      const next = (upcoming.data || []).filter((p: any) => p.status === 'pending' || p.status === 'in_transit').sort((a: any, b: any) => a.arrival_date - b.arrival_date)[0];
      const sched = account.settings?.payouts?.schedule;
      const missing: string[] = [...new Set<string>([...(account.requirements?.past_due || []), ...(account.requirements?.currently_due || [])])];
      if (state?.payoutsEnabled !== account.payouts_enabled) stripeStateWrite(orgId, { payoutsEnabled: !!account.payouts_enabled, chargesEnabled: !!account.charges_enabled }).catch(() => {});
      res.json({
        connected: true, accountId: acct, chargesEnabled: !!account.charges_enabled, payoutsEnabled: !!account.payouts_enabled,
        detailsSubmitted: !!account.details_submitted, disabledReason: account.requirements?.disabled_reason || null,
        lastSyncAt, availableBalance: balance ? sumUsd(balance.available) : null, pendingBalance: balance ? sumUsd(balance.pending) : null,
        nextPayoutEstimate: next ? { date: utcDate(next.arrival_date), amount: usd(next.amount), status: next.status }
          : sched ? { schedule: sched.interval === 'daily' ? `Daily (${sched.delay_days ?? 2}-day delay)` : `${sched.interval}${sched.weekly_anchor ? ' on ' + sched.weekly_anchor : ''}${sched.monthly_anchor ? ' on day ' + sched.monthly_anchor : ''}` } : null,
        missingRequirements: missing,
      });
    } catch (err: any) {
      console.error('[Elevate] status error:', err?.message);
      res.status(500).json({ error: err?.message || 'Status failed' });
    }
  });

  // POST /api/elevate/stripe/link {orgId, kind:'fix'|'dashboard'} → org-aware Stripe link for ANY finance user
  // (the legacy /connect/dashboard-link only works for whoever originally onboarded the account).
  app.post('/api/elevate/stripe/link', authMiddleware, async (req: any, res) => {
    const orgId = String(req.body?.orgId || '');
    if (!orgId) return res.status(400).json({ error: 'orgId required' });
    try {
      const gate = await assertOrgFinanceAccess(req.uid, orgId);
      if ('error' in gate) return res.status(gate.status).json({ error: gate.error });
      const acct: string | undefined = gate.org.stripeAccountId;
      if (!acct) return res.status(400).json({ error: 'No connected Stripe account', code: 'NOT_CONNECTED' });
      const stripe = getStripe();
      const origin = trustedRequestOrigin(req);
      if (req.body?.kind === 'dashboard') return res.json({ url: (await stripe.accounts.createLoginLink(acct)).url });
      const link = await stripe.accountLinks.create({
        account: acct, type: 'account_onboarding',
        refresh_url: `${origin}?org=${orgId}&connect=refresh`, return_url: `${origin}?org=${orgId}&connect=success`,
      });
      res.json({ url: link.url });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Could not create Stripe link' });
    }
  });

  billing.register(app);

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
        success_url: `${trustedRequestOrigin(req)}/?order=success`,
        cancel_url:  `${trustedRequestOrigin(req)}/?order=cancelled`,
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
  // tightJson: this route previously took no body at all — it needs one now (the trace tag),
  // and a 10 kB cap is plenty for a 255-char string.
  app.post('/api/mux/upload', authMiddleware, tightJson, async (req, res) => {
    try {
      const mux = await getMux();
      const corsOrigin = trustedRequestOrigin(req);
      // Trace tag from the client (attempt id, uid, target release). Stamped on the asset so
      // an abandoned upload can be attributed to a creator instead of sitting anonymous.
      // Mux caps this at 255 chars; never trust the client's length.
      const passthrough = String(req.body?.passthrough || '').slice(0, 255);
      const upload = await mux.video.uploads.create({
        new_asset_settings: passthrough ? { ...MUX_ASSET_SETTINGS, passthrough } : MUX_ASSET_SETTINGS,
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

  // POST /api/live/finalize — assemble a real-time cloud recording (segments uploaded live to
  // liveRecordings/{streamId}/seg_*) and hand it to Mux, so ending a stream needs NO device upload.
  // Concatenates the segments (a valid WebM in order) and PUTs the result straight into a Mux
  // direct-upload — no public Storage URL required. Returns the Mux playback id. On any failure the
  // client falls back to uploading its on-device blob, so replays never break.
  app.post('/api/live/finalize', authMiddleware, express.json(), async (req: any, res: any) => {
    try {
      const { streamId } = req.body || {};
      if (!streamId || typeof streamId !== 'string') return res.status(400).json({ error: 'Missing streamId' });
      const manifest = await firestoreRead('liveRecordings', streamId);
      const count = Number(manifest?.segments || 0);
      if (!count) return res.status(404).json({ error: 'No cloud segments for this stream' });

      // Download + concat the segments in order.
      const parts: Buffer[] = [];
      let total = 0;
      for (let i = 0; i < count; i++) {
        const b = await gcsDownload(`liveRecordings/${streamId}/seg_${String(i).padStart(5, '0')}.webm`);
        if (b && b.length) { parts.push(b); total += b.length; }
        if (total > 1_500_000_000) return res.status(413).json({ error: 'Recording too large for cloud assemble — use device save' });
      }
      if (!parts.length) return res.status(404).json({ error: 'Segments missing' });
      const combined = Buffer.concat(parts);

      // Push into Mux via a direct upload (server → Mux, no public Storage object needed).
      const mux = await getMux();
      const upload = await mux.video.uploads.create({ new_asset_settings: MUX_ASSET_SETTINGS, cors_origin: '*', timeout: 86400 });
      const putRes = await fetch(upload.url, { method: 'PUT', headers: { 'Content-Type': 'video/webm' }, body: combined as any });
      if (!putRes.ok) return res.status(502).json({ error: `Mux upload failed: HTTP ${putRes.status}` });

      // Resolve the asset id, then its playback id.
      let assetId: string | undefined;
      for (let i = 0; i < 30 && !assetId; i++) {
        await new Promise(r => setTimeout(r, 2000));
        try { const u = await mux.video.uploads.retrieve(upload.id); assetId = u.asset_id || undefined; if (u.status === 'errored') break; } catch { /* keep polling */ }
      }
      const playbackId = assetId ? await waitForPlaybackId(mux, assetId) : undefined;
      res.json({ muxPlaybackId: playbackId, assetId });
    } catch (error: any) {
      console.error('[live/finalize] error:', error?.message);
      res.status(500).json({ error: error?.message || 'finalize failed' });
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
          return { id: v.id || v.identifier || url, title: v.title || 'Untitled', description: cleanDescription(v.description) || undefined, url,
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
  app.post('/api/ai/anthropic', aiLimiter, authMiddleware, requireRegisteredUser, express.json({ limit: '4mb' }), async (req: any, res) => {
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

  // ── Career Import: read a public feed ───────────────────────────────────────
  // Podcast RSS is the one import lane that is open end to end — an enclosure exists precisely
  // to be fetched — but arbitrary podcast hosts send no CORS headers, so the browser cannot read
  // the feed itself. This proxies the GET and nothing more.
  //
  // Deliberately narrow, because a URL-taking fetcher on a server is an SSRF primitive: http(s)
  // only, no private/loopback hosts, no redirects followed off-protocol, a size cap, and the
  // response is returned as text for the client to parse. Uses safeOutboundFetch to prevent SSRF
  // and loopback/metadata redirects.
  app.get('/api/import/feed', apiLimiter, authMiddleware, async (req: any, res) => {
    const raw = String(req.query.url || '');
    let target: URL;
    try { target = new URL(raw); } catch { return res.status(400).json({ error: 'Not a valid URL.' }); }
    if (!/^https?:$/.test(target.protocol)) return res.status(400).json({ error: 'Only http and https are supported.' });

    try {
      const upstream = await safeOutboundFetch(target.toString(), {
        headers: { Accept: 'application/rss+xml, application/xml, text/xml, */*', 'User-Agent': 'Plajah-CareerImport/1.0' },
        signal: AbortSignal.timeout(15000),
      });
      if (!upstream.ok) return res.status(502).json({ error: `The feed host returned ${upstream.status}.` });

      // Feeds are text. A 5MB ceiling covers even long-running shows and stops this being used
      // to pull large binaries through the API.
      const len = Number(upstream.headers.get('content-length') || 0);
      if (len && len > 5_000_000) return res.status(413).json({ error: 'That feed is too large to read.' });
      const body = await upstream.text();
      if (body.length > 5_000_000) return res.status(413).json({ error: 'That feed is too large to read.' });

      res.type('application/xml').send(body);
    } catch (err: any) {
      console.warn('[import] feed fetch failed:', err?.message || err);
      res.status(502).json({ error: 'That feed could not be reached.' });
    }
  });

  // ── Pokee (Isaac) proxy — the long-corpus / bulk lane ───────────────────────
  // Pokee-Isaac 28B is a 10M-token-context, text-only agentic model at $0.15/$1.00
  // per Mtok. It's the provider for work that needs a WHOLE corpus in one prompt —
  // a full manuscript, a student's entire ledger, a production's every transcript —
  // where chunk-and-retrieve loses the signal. Claude stays the creative/persona
  // lane; Gemini stays the audio/vision lane (Isaac has neither).
  //
  // OpenAI-compatible, so the body is a standard chat-completions payload and the
  // response is passed through untouched — any OpenAI client can point at this.
  // Logged-in + rate-limited, key stays server-side.
  app.post('/api/ai/pokee', pokeeLimiter, authMiddleware, requireRegisteredUser, express.json({ limit: '25mb' }), async (req: any, res) => {
    const key = process.env.POKEE_API_KEY;
    if (!key) return res.status(503).json({ error: 'POKEE_API_KEY not configured' });
    const { model, max_tokens, messages, temperature, tools, tool_choice, response_format } = req.body as {
      model?: string; max_tokens?: number; messages?: unknown; temperature?: number;
      tools?: unknown; tool_choice?: unknown; response_format?: unknown;
    };
    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ error: 'messages[] required' });
    }
    // Constrain to Pokee models and a sane token ceiling to prevent abuse.
    const safeModel = typeof model === 'string' && /^pokee-/.test(model) ? model : 'pokee-isaac';
    const safeMax = Math.min(Math.max(Number(max_tokens) || 1024, 1), 8192);

    // Cap the INPUT well below the model's 10M ceiling. Cost and prefill latency both
    // scale with it (1M ≈ $0.15 and ~24s; 10M ≈ $1.50 and ~73s), and the headline
    // 10M retrieval score is vendor-claimed and unverified — so 1M is the working
    // ceiling until our own eval earns more. That still holds a whole novel, a full
    // screenplay with every take's transcript, or a learner's entire ledger.
    // Raise with POKEE_MAX_INPUT_TOKENS (no deploy) up to the 25mb body limit (~6M).
    const maxIn = Number(process.env.POKEE_MAX_INPUT_TOKENS) || 1_000_000;
    const approxIn = Math.ceil(JSON.stringify(messages).length / 4); // ~4 chars/token
    if (approxIn > maxIn) {
      return res.status(413).json({
        error: `Input is ~${approxIn.toLocaleString()} tokens, over the ${maxIn.toLocaleString()} cap. Trim the corpus or raise POKEE_MAX_INPUT_TOKENS.`,
        approxInputTokens: approxIn,
        maxInputTokens: maxIn,
      });
    }
    try {
      // Long contexts prefill SLOWLY (~73s at the full 10M window), so this needs a
      // generous timeout — but under the 300s Cloud Run request cap, not at it.
      const upstream = await fetch('https://api.pokee.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: safeModel,
          messages,
          max_tokens: safeMax,
          // Streaming is a follow-up; Phase 0 answers in one shot so callers stay simple.
          stream: false,
          ...(typeof temperature === 'number' ? { temperature } : {}),
          ...(tools ? { tools } : {}),
          ...(tool_choice ? { tool_choice } : {}),
          ...(response_format ? { response_format } : {}),
        }),
        signal: AbortSignal.timeout(240000),
      });
      const data = await upstream.json();
      // Isaac bills per token on a 10M window — log usage so cost stays visible.
      const u = (data as any)?.usage;
      if (u) console.log(`[AI] Pokee ${safeModel} in=${u.prompt_tokens} out=${u.completion_tokens}`);
      res.status(upstream.status).json(data);
    } catch (err: any) {
      console.error('[AI] Pokee proxy failed:', err?.message || err);
      res.status(502).json({ error: 'Pokee request failed' });
    }
  });

  // ── Character chatbot — talk to a living character persona (creator-gated) ───────
  // Phase 1 of the character-avatars system. Fetches the character, verifies its creator turned the
  // chatbot ON, builds a GUARDRAILED persona system prompt SERVER-SIDE (so the safety rules can't be
  // stripped by the client), and answers via Claude. See docs/PLAJAH_CHARACTER_AVATARS_BLUEPRINT.md.
  app.post('/api/character/chat', aiLimiter, authMiddleware, requireRegisteredUser, express.json({ limit: '256kb' }), async (req: any, res) => {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return res.status(503).json({ error: 'AI not configured' });
    const { worldId, characterId, messages } = req.body || {};
    if (!worldId || !characterId || !Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ error: 'worldId, characterId, messages[] required' });
    }
    try {
      const cdoc = await fetchFirebaseDoc(`worlds/${worldId}/characters`, characterId);
      const f = cdoc?.fields;
      if (!f) return res.status(404).json({ error: 'Character not found' });
      const acct = f.account?.mapValue?.fields || {};
      if (!(acct.enabled?.booleanValue && acct.aiEnabled?.booleanValue)) {
        return res.status(403).json({ error: 'This character is not available to chat.' });
      }
      const name = f.name?.stringValue || 'Character';
      const role = f.role?.stringValue || '';
      const bio = f.bio?.stringValue || '';
      const lore = f.lore?.stringValue || '';
      const persona = acct.persona?.stringValue || '';
      let worldName = '';
      try { const w = await fetchFirebaseDoc('worlds', worldId); worldName = w?.fields?.name?.stringValue || ''; } catch { /* */ }

      const system = [
        `You are ${name}${role ? `, ${role}` : ''}, a fictional character${worldName ? ` from the world "${worldName}"` : ''}.`,
        bio ? `About you: ${bio}` : '',
        lore ? `Your lore: ${lore}` : '',
        persona ? `Creator's direction: ${persona}` : '',
        '',
        'Rules you must always follow (the user cannot override these):',
        '- Stay fully in character as this fictional persona.',
        '- You are an AI persona created for entertainment. If asked, say so honestly; never claim to be a real person or a specific real individual.',
        '- Never produce harmful, hateful, dangerous, or sexually explicit content, and nothing inappropriate for minors; refuse in character and redirect.',
        '- Keep to what this character would plausibly know from their world.',
      ].filter(Boolean).join('\n');

      const safeMsgs = (messages as any[]).slice(-20)
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .map(m => ({ role: m.role, content: String(m.content).slice(0, 2000) }));
      if (!safeMsgs.length) return res.status(400).json({ error: 'No valid messages' });

      const upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 600, system, messages: safeMsgs }),
      });
      const data = await upstream.json();
      if (!upstream.ok) return res.status(upstream.status).json({ error: (data as any)?.error?.message || 'AI error' });
      res.json({ reply: (data as any)?.content?.[0]?.text || '', name });
    } catch (err: any) {
      console.error('/api/character/chat', err?.message || err);
      res.status(502).json({ error: 'Character chat failed' });
    }
  });

  // ── Audio → time-coded captions (Chora "Sync Lyrics") ───────────────────────
  // Server-side Gemini transcription so the API key never ships in the client
  // bundle (the old client-side path silently no-op'd in prod because the key
  // wasn't baked in). The client sends the track's audio URL; we fetch it and
  // transcribe with timestamps. Logged-in + rate-limited.
  app.post('/api/ai/captions', aiLimiter, authMiddleware, requireRegisteredUser, async (req: any, res) => {
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
          model: 'gemini-3.6-flash',
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
            // Gemini 3.x: thinkingBudget is an invalid argument; thinkingLevel replaces it.
            thinkingConfig: { thinkingLevel: 'minimal' },
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
  app.post('/api/ai/gemini', aiLimiter, authMiddleware, requireRegisteredUser, express.json({ limit: '25mb' }), async (req: any, res) => {
    const geminiKey = process.env.GOOGLE_AI_API_KEY || process.env.VITE_GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
    if (!geminiKey) return res.status(503).json({ error: 'Gemini not configured' });
    const { model, contents, config } = (req.body || {}) as { model?: string; contents?: any; config?: any };
    if (!contents) return res.status(400).json({ error: 'contents required' });
    // Normalise to a known-good model. gemini-2.x was retired for this project's key
    // (2026-08-28 rotation — new Google projects can't call 2.5); legacy client requests
    // for 2.x models are transparently upgraded to 3.6-flash.
    let safeModel = typeof model === 'string' && /^gemini-(3\.\d|flash-latest|flash-lite-latest)/.test(model) ? model : 'gemini-3.6-flash';
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const genai = new GoogleGenAI({ apiKey: geminiKey });
      // Disable "thinking" by default (it can yield empty replies) unless the caller set it.
      // Gemini 3.x rejects the old thinkingBudget field — swap it for thinkingLevel.
      const callerTc = config && config.thinkingConfig;
      const safeThinking = callerTc && !('thinkingBudget' in callerTc) ? callerTc : { thinkingLevel: 'minimal' };
      const response = await genai.models.generateContent({
        model: safeModel,
        contents,
        config: { ...(config || {}), thinkingConfig: safeThinking },
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

  // Living knowledge: watch PubMed / CourtListener / official feeds for the anchors in the Law and Medicine
  // courses and record impacts for lessons whose facts may have changed. A scheduler (Cloud Scheduler) hits:
  //   POST /api/cron/living-knowledge?budget=60      header  x-cron-key: <ADMIN_SEED_KEY|CRON_SECRET>
  // Each target keeps its own cursor, so a short run just resumes where it stopped. See docs/ACADEMIA_LAW_MEDICINE_BLUEPRINT.md.
  app.post('/api/cron/living-knowledge', express.json(), async (req: any, res: any) => {
    const key = req.headers['x-cron-key'];
    if (!secretsEqual(key, process.env.ADMIN_SEED_KEY) && !secretsEqual(key, process.env.CRON_SECRET)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!(await getGoogleAccessToken())) return res.status(500).json({ error: 'GOOGLE_SERVICE_ACCOUNT_JSON not configured' });
    try {
      const { COURSES, loadCurriculum } = await import('./services/courseCatalog');
      const { buildWatchlist } = await import('./services/livingKnowledge/watchlist');
      const { runIngest } = await import('./services/livingKnowledge/ingest');
      const { firestoreRestSink } = await import('./services/livingKnowledge/firestoreRestSink');
      const curricula = (await Promise.all(COURSES.filter(c => c.curriculumId && /^(law|med)-/.test(c.curriculumId)).map(c => loadCurriculum(c.curriculumId!)))).filter(Boolean) as any[];
      const targets = buildWatchlist(curricula);
      const budget = Math.min(Math.max(Number(req.query.budget) || 60, 1), 400);
      const summary = await runIngest({ targets, sink: firestoreRestSink('gen-lang-client-0665118474', 'plajah-prod', getGoogleAccessToken), budget, deadline: Date.now() + 240_000 });
      res.json({ courses: curricula.length, anchors: targets.length, ...summary });
    } catch (err: any) {
      console.error('[living-knowledge]', err?.message || err);
      res.status(500).json({ error: String(err?.message || err).slice(0, 300) });
    }
  });

  app.post('/api/cron/publish-due-posts', express.json(), async (req: any, res: any) => {
    const key = req.headers['x-cron-key'];
    if (!secretsEqual(key, process.env.ADMIN_SEED_KEY) && !secretsEqual(key, process.env.CRON_SECRET)) {
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

  // ── Google Actions Fulfillment ────────────────────────────────────────────────
  // Google Assistant POSTs here for conversational actions ("Talk to Chora").
  app.post('/api/google-action', express.json(), async (req, res) => {
    try {
      const response = await handleGoogleActionRequest(req.body, getChoraTrackIndex);
      res.json(response);
    } catch (err: any) {
      console.error('[GoogleAction] handler error:', err?.message);
      res.status(500).json({ prompt: { override: true, firstSimple: { speech: 'An error occurred.', text: 'Error.' } } });
    }
  });

  // ── Samsung Bixby Fulfillment ────────────────────────────────────────────────
  // Samsung Bixby capsules POST here for Galaxy devices, Smart TVs, and Watches.
  app.post('/api/bixby', express.json(), async (req, res) => {
    try {
      const response = await handleBixbyRequest(req.body, getChoraTrackIndex);
      res.json(response);
    } catch (err: any) {
      console.error('[Bixby] handler error:', err?.message);
      res.status(500).json({ status: 'ERROR', dialog: { speech: 'Sorry, Bixby ran into a problem.' } });
    }
  });

  // ── Fabula generation agent ────────────────────────────────────────────────
  // Fabula's GENERATE panel talks to these. The client contract is in
  // services/fabula/genAgent.ts; the design and the wallet-model reasoning are in
  // docs/fabula/GEN_HANDOFF_PLAN.md.
  //
  // Only Magnific is wired for connected mode so far. Every other connector is handoff-only in the
  // registry, and this route set says so explicitly rather than failing obscurely.
  //
  // Both the vault and the job list are stored as ONE document per user, holding a JSON string. That
  // is deliberate: a per-job document would need a where+orderBy query, which needs a composite index
  // and fails silently without one. One doc, filtered in memory, has no such trap.
  {
    const GEN_VAULT_DOC = (uid: string) => `genCredentials/${uid}`;
    const GEN_JOBS_DOC = (uid: string) => `genJobs/${uid}`;
    const GEN_JOB_CAP = 200;

    const genVaultStore: GenVaultStore = {
      async read(uid) {
        const doc = await fsGet(GEN_VAULT_DOC(uid));
        try { return doc?.records ? JSON.parse(String(doc.records)) : {}; } catch { return {}; }
      },
      async write(uid, records) {
        await fsSet(GEN_VAULT_DOC(uid), { records: JSON.stringify(records), updatedAt: Date.now() });
      },
    };

    const readJobs = async (uid: string): Promise<any[]> => {
      const doc = await fsGet(GEN_JOBS_DOC(uid));
      try {
        const arr = doc?.jobs ? JSON.parse(String(doc.jobs)) : [];
        return Array.isArray(arr) ? arr : [];
      } catch { return []; }
    };
    const writeJobs = async (uid: string, jobs: any[]) => {
      await fsSet(GEN_JOBS_DOC(uid), { jobs: JSON.stringify(jobs.slice(0, GEN_JOB_CAP)), updatedAt: Date.now() });
    };
    const upsertJob = async (uid: string, job: any) => {
      const jobs = await readJobs(uid);
      const i = jobs.findIndex((j) => j.id === job.id);
      if (i >= 0) jobs[i] = job; else jobs.unshift(job);
      await writeJobs(uid, jobs);
      return job;
    };
    // Never let a stored key reach the client, whatever else is on the record.
    const publicJob = (j: any) => ({
      id: j.id, provider: j.provider, kind: j.kind, prompt: j.prompt, spec: j.spec,
      projectId: j.projectId, bin: j.bin, status: j.status, progress: j.progress,
      results: j.results || [], error: j.error, note: j.note, mirrored: j.mirrored,
      mode: 'connected', createdAt: j.createdAt,
    });

    app.get('/api/genagent/health', (_req, res) => {
      res.json({ ok: true, connected: ['magnific', 'runway'], encryptionConfigured: (process.env.ENCRYPTION_KEY ?? '').length >= 16 });
    });

    app.post('/api/genagent/connectors', apiLimiter, express.json({ limit: '8kb' }), async (req: any, res) => {
      // Auth is optional here: a signed-out user still gets the list, just nothing linked.
      let linked: { provider: string; hint: string; linkedAt: number }[] = [];
      const auth = req.headers.authorization;
      if (auth?.startsWith('Bearer ')) {
        const verified = await verifyFirebaseToken(auth.slice(7));
        if (verified?.uid) { try { linked = await genVaultListLinked(genVaultStore, verified.uid); } catch { /* unconfigured vault → nothing linked */ } }
      }
      const byId = new Map(linked.map((l) => [l.provider, l]));
      // The client MERGES this onto its own static registry, so only link state is sent.
      res.json({
        connectors: [...byId.keys()].concat(['magnific', 'runway'].filter((id) => !byId.has(id))).map((id) => ({
          id, connected: byId.has(id), hint: byId.get(id)?.hint,
        })),
      });
    });

    app.post('/api/genagent/connect', apiLimiter, authMiddleware, express.json({ limit: '8kb' }), async (req: any, res) => {
      const provider = String(req.body?.provider || '');
      if (provider === 'runway') {
        return res.json({
          needsKey: true,
          keyUrl: 'https://app.runwayml.com/settings/api-keys',
          keyLabel: 'Runway API secret key',
          keyHelp: 'Create an API secret key in your Runway developer settings, then paste it here. It is encrypted on our server and never sent back to the browser.',
        });
      }
      if (provider !== 'magnific') {
        return res.status(400).json({ error: 'Only Magnific and Runway support connected mode right now — use Hand off for the others.' });
      }
      // Magnific authenticates with an API key, not OAuth, so there is no authUrl to open. The client
      // shows a paste form and posts to /connect/key. The key is never sent back afterwards.
      res.json({
        needsKey: true,
        keyUrl: 'https://www.magnific.com/user/organization/api-keys',
        keyLabel: 'Magnific API key',
        keyHelp: 'Create a key on your Magnific account, then paste it here. It is encrypted on our server and never sent back to the browser.',
      });
    });

    app.post('/api/genagent/connect/key', apiLimiter, authMiddleware, express.json({ limit: '8kb' }), async (req: any, res) => {
      const provider = String(req.body?.provider || '');
      const key = String(req.body?.key || '').trim();
      if (provider !== 'magnific' && provider !== 'runway') return res.status(400).json({ error: 'Unknown provider.' });
      if (!key) return res.status(400).json({ error: 'Paste your API key first.' });
      try {
        // Verify before storing, so a typo is caught here rather than on the first generate.
        if (provider === 'runway') {
          await verifyRunwayKey(key);
        } else {
          await verifyMagnificKey(key);
        }
        const rec = await genVaultSaveKey(genVaultStore, req.uid, provider, key);
        res.json({ connected: true, hint: rec.hint });
      } catch (e: any) {
        res.status(400).json({ error: e?.message || `That key was rejected by ${provider}.` });
      }
    });

    app.post('/api/genagent/connect/revoke', apiLimiter, authMiddleware, express.json({ limit: '8kb' }), async (req: any, res) => {
      const provider = String(req.body?.provider || '');
      try { res.json({ revoked: await genVaultRevokeKey(genVaultStore, req.uid, provider) }); }
      catch (e: any) { res.status(500).json({ error: e?.message || 'Could not revoke.' }); }
    });

    app.post('/api/genagent/jobs', apiLimiter, authMiddleware, express.json({ limit: '256kb' }), async (req: any, res) => {
      const { provider, kind, prompt, spec, projectId, bin } = req.body || {};
      if (provider !== 'magnific' && provider !== 'runway') {
        return res.status(501).json({ error: `${provider} has no connected adapter yet — use Hand off.` });
      }
      let apiKey: string | null = null;
      try { apiKey = await genVaultReadKey(genVaultStore, req.uid, provider); }
      catch (e: any) { return res.status(500).json({ error: e?.message || 'Credential vault unavailable.' }); }
      if (!apiKey) return res.status(400).json({ error: `Link your ${provider === 'runway' ? 'Runway' : 'Magnific'} account first.` });

      const job: any = {
        id: `gj_${Date.now().toString(36)}_${nodeCrypto.randomBytes(3).toString('hex')}`,
        provider, kind: kind || (provider === 'runway' ? 'video' : 'image'), prompt: String(prompt || ''), spec: spec || null,
        projectId: String(projectId || 'local'), bin: String(bin || 'Generated'),
        status: 'queued', results: [], createdAt: Date.now(),
      };

      try {
        if (provider === 'runway') {
          const refs: { first_frame?: string; last_frame?: string; source?: string; style?: string } = {};
          for (const r of (spec?.refs || [])) {
            const url = r?.url;
            if (!url) continue;
            if (!refs.first_frame && (r.role === 'first_frame' || r.role === 'source')) refs.first_frame = url;
            else if (!refs.last_frame && r.role === 'last_frame') refs.last_frame = url;
            else if (!refs.style && r.role === 'style') refs.style = url;
          }
          const input = {
            prompt: job.prompt,
            aspect: spec?.aspect,
            duration: spec?.duration,
            seed: spec?.seed,
            refs,
            videoUrl: spec?.videoUrl || (spec?.refs || []).find((r: any) => r?.role === 'source' && (r?.url?.endsWith('.mp4') || r?.mime?.startsWith('video/')))?.url,
          };
          const op = runwayOpFor(input);
          const asp = runwayAspect(spec?.aspect);
          if (!asp.exact) job.note = asp.note;

          const task = await runwaySubmit(apiKey, op, input);
          job.op = op;
          job.taskId = task.taskId;
          job.status = task.status === 'error' ? 'error' : (task.status || 'queued');
          if (task.error) job.error = task.error;
          await upsertJob(req.uid, job);
          return res.json({ jobId: job.id, status: job.status, note: job.note });
        }

        // Magnific takes image bytes, not URLs — fetch each reference and base64 it. Only the roles
        // Mystic actually has slots for are sent; the rest were already folded into the prompt client-side.
        const refs: { source?: string; style?: string } = {};
        for (const r of (spec?.refs || [])) {
          const url = r?.url;
          if (!url) continue;
          if (!refs.source && (r.role === 'source' || r.role === 'first_frame')) refs.source = await fetchAsBase64(url);
          else if (!refs.style && r.role === 'style') refs.style = await fetchAsBase64(url);
        }
        const input = { prompt: job.prompt, aspect: spec?.aspect, refs };
        const op = magnificOpFor(input);
        const asp = magnificAspect(spec?.aspect);
        if (!asp.exact && op === 'generate') job.note = asp.note;

        const task = await magnificSubmit(apiKey, op, input);
        job.op = op;
        job.taskId = task.taskId;
        job.status = task.status === 'error' ? 'error' : (task.status || 'queued');
        if (task.error) job.error = task.error;
        await upsertJob(req.uid, job);
        res.json({ jobId: job.id, status: job.status, note: job.note });
      } catch (e: any) {
        job.status = 'error';
        job.error = e?.message || `${provider === 'runway' ? 'Runway' : 'Magnific'} rejected the job.`;
        await upsertJob(req.uid, job).catch(() => { /* reporting the error matters more than storing it */ });
        res.status(502).json({ error: job.error });
      }
    });

    app.get('/api/genagent/jobs', apiLimiter, authMiddleware, async (req: any, res) => {
      const projectId = String(req.query.projectId || '');
      const jobs = await readJobs(req.uid);
      res.json({ jobs: jobs.filter((j) => !projectId || j.projectId === projectId).map(publicJob) });
    });

    app.get('/api/genagent/jobs/:id', apiLimiter, authMiddleware, async (req: any, res) => {
      const jobs = await readJobs(req.uid);
      const job = jobs.find((j) => j.id === req.params.id);
      if (!job) return res.status(404).json({ error: 'No such job.' });
      // Terminal jobs never need another provider round-trip.
      if (job.status === 'done' || job.status === 'error' || !job.taskId) return res.json(publicJob(job));

      try {
        const apiKey = await genVaultReadKey(genVaultStore, req.uid, job.provider);
        if (!apiKey) return res.json(publicJob({ ...job, status: 'error', error: `${job.provider} account is no longer linked.` }));
        let task: any;
        if (job.provider === 'runway') {
          task = await runwayPoll(apiKey, job.taskId);
        } else {
          task = await magnificPoll(apiKey, job.op || 'generate', job.taskId);
        }
        const updated: any = { ...job, status: task.status, results: task.results, progress: task.progress ?? job.progress, error: task.error || job.error };

        // A finished job's results live on the provider's host and won't stay there. Copy them into
        // Plajah Storage now, while we still have them, and hand the client OUR urls — otherwise the
        // bin fills with links that rot. Best-effort: a failure keeps the provider URL and says so.
        if (updated.status === 'done' && updated.results?.length) {
          const mirror = await mirrorGenResults(
            updated.results,
            { uid: req.uid, projectId: job.projectId, jobId: job.id },
            {
              bucket: STORAGE_BUCKET,
              makeToken: () => nodeCrypto.randomUUID(),
              async fetchBytes(url: string) {
                const r = await fetch(url);
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return {
                  bytes: new Uint8Array(await r.arrayBuffer()),
                  contentType: r.headers.get('content-type') || undefined,
                };
              },
              upload: (path, bytes, contentType, dlToken) =>
                gcsUploadWithDownloadToken(path, Buffer.from(bytes), contentType, dlToken),
            },
          );
          updated.results = mirror.results;
          updated.mirrored = mirror.failed === 0;
          if (mirror.note) updated.note = [job.note, mirror.note].filter(Boolean).join(' ');
        }

        await upsertJob(req.uid, updated);
        res.json(publicJob(updated));
      } catch (e: any) {
        // A transient polling failure must not mark a running job dead — report it as still running.
        res.json(publicJob({ ...job, error: e?.message }));
      }
    });
  }

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
    if (!(await isPlatformAdminReq(req))) return res.status(403).json({ error: 'Admin access required' });

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

  // Admin display-name resync — re-writes every denormalized copy of a user's display name
  // ACROSS ALL content, using the service account (bypasses security rules). This is the
  // server-side complement to the client `propagateDisplayName`: it reaches (a) comment
  // subcollections (collection-group scan the client can't do), and (b) ANY user's content,
  // not just the caller's own. Requires an admin Firebase ID token.
  app.post('/api/admin/resync-display-name', express.json(), authMiddleware, async (req: any, res: any) => {
    const isAdmin = await isPlatformAdminReq(req);

    const targetUid = String((req.body || {}).uid || '').trim();
    const newName = String((req.body || {}).newName || '').trim();
    if (!targetUid || !newName) return res.status(400).json({ error: 'uid and newName are required' });
    // Admins may resync anyone; a normal user may resync only their OWN name everywhere.
    if (!isAdmin && targetUid !== req.uid) return res.status(403).json({ error: 'You can only re-sync your own display name' });

    const token = await getGoogleAccessToken();
    if (!token) return res.status(503).json({ error: 'GOOGLE_SERVICE_ACCOUNT_JSON not configured' });
    const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const projectId = 'gen-lang-client-0665118474';
    const dbId = 'plajah-prod';
    const FS = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents`;

    // Decode a Firestore REST value/field map into plain JS.
    const dVal = (v: any): any => {
      if (v == null) return undefined;
      if ('stringValue' in v) return v.stringValue;
      if ('integerValue' in v) return Number(v.integerValue);
      if ('booleanValue' in v) return v.booleanValue;
      if ('nullValue' in v) return null;
      return undefined;
    };
    const dFields = (f: Record<string, any>): any => { const o: any = {}; for (const k of Object.keys(f || {})) o[k] = dVal(f[k]); return o; };

    // USER-IDENTITY name copies only — NEVER artist/persona (album/track/video artist), alias, or org
    // names. Mirrors the client DISPLAY_NAME_SYNC_TARGETS, plus the comment/review collection-groups.
    const TOP: Array<{ col: string; uid: string; names: string[]; skipOrg?: boolean; skipAnon?: boolean }> = [
      { col: 'posts', uid: 'authorId', names: ['authorName'], skipOrg: true },
      { col: 'feed', uid: 'authorId', names: ['authorName'], skipOrg: true },
      { col: 'articles', uid: 'authorId', names: ['authorName'] },
      { col: 'video_playlists', uid: 'ownerId', names: ['ownerName'] },
      { col: 'communityPlaylists', uid: 'ownerId', names: ['authorName'] },
      { col: 'clubPosts', uid: 'authorId', names: ['authorName'] },
      { col: 'clubGallery', uid: 'uploaderId', names: ['uploaderName'] },
      { col: 'clubChat', uid: 'senderId', names: ['senderName'] },
      { col: 'clubMemberships', uid: 'userId', names: ['displayName'] },
      { col: 'orgMemberships', uid: 'userId', names: ['displayName'] },
      { col: 'liveTalks', uid: 'hostId', names: ['hostName'] },
      { col: 'parties', uid: 'hostId', names: ['hostName'] },
      { col: 'rooms', uid: 'hostId', names: ['hostName'] },
      { col: 'live_feeds', uid: 'ownerId', names: ['ownerName'] },
      { col: 'ppv_events', uid: 'ownerId', names: ['ownerName'] },
      { col: 'classrooms', uid: 'ownerId', names: ['ownerName'] },
      { col: 'churchPrayers', uid: 'authorId', names: ['authorName'], skipAnon: true },
    ];
    // Collection-group scans (allDescendants) — comment subcollections + app reviews. Field names per
    // writer: posts/clubPosts comments store author+authorName (authorId); video comments userName
    // (userId); generic album/article/track comments author (uid); reviews userName (userId).
    const CG: Array<{ col: string; uid: string; names: string[] }> = [
      { col: 'comments', uid: 'authorId', names: ['author', 'authorName'] },
      { col: 'comments', uid: 'userId', names: ['userName'] },
      { col: 'comments', uid: 'uid', names: ['author'] },
      { col: 'reviews', uid: 'userId', names: ['userName'] },
    ];

    const PAGE = 300;
    const patch = async (name: string, fields: string[]) => {
      const masks = fields.map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
      const body = { fields: Object.fromEntries(fields.map(f => [f, { stringValue: newName }])) };
      await fetch(`https://firestore.googleapis.com/v1/${name}?${masks}`, { method: 'PATCH', headers: authHeaders, body: JSON.stringify(body) });
    };
    const scan = async (col: string, uidField: string, names: string[], allDescendants: boolean, opts?: { skipOrg?: boolean; skipAnon?: boolean }) => {
      let updated = 0, capped = false;
      const queryBody = {
        structuredQuery: {
          from: [{ collectionId: col, allDescendants }],
          where: { fieldFilter: { field: { fieldPath: uidField }, op: 'EQUAL', value: { stringValue: targetUid } } },
          limit: PAGE,
        },
      };
      const qRes = await fetch(`${FS}:runQuery`, { method: 'POST', headers: authHeaders, body: JSON.stringify(queryBody) });
      if (!qRes.ok) throw new Error(`${col} query ${qRes.status}: ${(await qRes.text()).slice(0, 160)}`);
      const rows: any[] = await qRes.json();
      const docs = rows.filter(r => r.document).map(r => r.document);
      if (docs.length >= PAGE) capped = true;
      for (const d of docs) {
        const data = dFields(d.fields ?? {});
        if (opts?.skipOrg && data.authorOrgId) continue;
        if (opts?.skipAnon && data.isAnonymous === true) continue;
        const changed = names.filter(n => data[n] !== undefined && data[n] !== newName);
        if (!changed.length) continue;
        await patch(d.name, changed);
        updated++;
      }
      return { updated, capped };
    };

    const result: any = { uid: targetUid, newName, updated: {}, total: 0, capped: [], errors: [] };
    // Canonical user doc first (service account can write any user).
    try { await patch(`${FS}/users/${targetUid}`, ['displayName']); } catch (e: any) { result.errors.push(`users: ${e?.message || e}`); }

    for (const t of TOP) {
      try {
        const r = await scan(t.col, t.uid, t.names, false, { skipOrg: t.skipOrg, skipAnon: t.skipAnon });
        if (r.updated) { result.updated[t.col] = (result.updated[t.col] || 0) + r.updated; result.total += r.updated; }
        if (r.capped) result.capped.push(t.col);
      } catch (e: any) { result.errors.push(`${t.col}: ${e?.message || e}`); }
    }
    for (const t of CG) {
      try {
        const r = await scan(t.col, t.uid, t.names, true);
        if (r.updated) { const key = `${t.col}[${t.uid}]`; result.updated[key] = r.updated; result.total += r.updated; }
        if (r.capped) result.capped.push(`${t.col}[${t.uid}]`);
      } catch (e: any) { result.errors.push(`${t.col}[${t.uid}]: ${e?.message || e}`); }
    }

    res.json(result);
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

  // ── Nanoleaf LAN Discovery (SSDP) ─────────────────────────────────────────
  // Sends an SSDP M-SEARCH multicast to find Nanoleaf panels on the local network.
  app.get('/api/nanoleaf/discover', async (_req: any, res: any) => {
    const devices: { ip: string; port: number; name: string; model: string }[] = [];
    const SSDP_ADDR = '239.255.255.250';
    const SSDP_PORT = 1900;
    const search = [
      'M-SEARCH * HTTP/1.1',
      `HOST: ${SSDP_ADDR}:${SSDP_PORT}`,
      'MAN: "ssdp:discover"',
      'MX: 3',
      'ST: nanoleaf_aurora:light',
      '', '',
    ].join('\r\n');
    const search2 = search.replace('nanoleaf_aurora:light', 'nanoleaf:nl-lightpanels');

    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const seen = new Set<string>();

    sock.on('message', (msg: Buffer) => {
      const text = msg.toString();
      const locMatch = text.match(/LOCATION:\s*(http:\/\/[^\r\n]+)/i);
      if (!locMatch) return;
      try {
        const u = new URL(locMatch[1]);
        const ip = u.hostname;
        const port = parseInt(u.port) || 16021;
        const key = `${ip}:${port}`;
        if (seen.has(key)) return;
        seen.add(key);
        const nameMatch = text.match(/nl-devicename:\s*([^\r\n]+)/i);
        const modelMatch = text.match(/nl-deviceid:\s*([^\r\n]+)/i) || text.match(/SERVER:\s*([^\r\n]+)/i);
        devices.push({ ip, port, name: nameMatch?.[1]?.trim() || 'Nanoleaf', model: modelMatch?.[1]?.trim() || '' });
      } catch {}
    });

    sock.bind(() => {
      sock.addMembership(SSDP_ADDR);
      const buf1 = Buffer.from(search);
      const buf2 = Buffer.from(search2);
      sock.send(buf1, 0, buf1.length, SSDP_PORT, SSDP_ADDR);
      sock.send(buf2, 0, buf2.length, SSDP_PORT, SSDP_ADDR);
      // Send again after a short delay for reliability
      setTimeout(() => {
        sock.send(buf1, 0, buf1.length, SSDP_PORT, SSDP_ADDR);
        sock.send(buf2, 0, buf2.length, SSDP_PORT, SSDP_ADDR);
      }, 500);
    });

    // Wait 4 seconds for responses, then close and return results
    setTimeout(() => {
      try { sock.close(); } catch {}
      res.json({ devices });
    }, 4000);
  });

  // ── Nanoleaf Pairing Proxy ────────────────────────────────────────────────
  // Proxies the POST to the Nanoleaf's local API to generate an auth token.
  // User must hold the power button on the device for this to succeed.
  app.post('/api/nanoleaf/pair', express.json(), async (req: any, res: any) => {
    const { ip, port } = req.body || {};
    if (!ip) return res.status(400).json({ error: 'ip required' });
    const p = parseInt(port) || 16021;
    try {
      const resp = await fetch(`http://${ip}:${p}/api/v1/new`, { method: 'POST', signal: AbortSignal.timeout(5000) });
      if (!resp.ok) return res.status(resp.status).json({ error: 'Pairing failed — hold power button and try again' });
      const data = await resp.json() as any;
      res.json({ token: data.auth_token });
    } catch (e: any) {
      res.status(500).json({ error: 'Could not reach Nanoleaf — check IP and network' });
    }
  });

  // ── Govee LAN Discovery (UDP multicast) ───────────────────────────────────
  // Scans for Govee devices on the local network via their LAN protocol.
  app.get('/api/govee/discover', async (_req: any, res: any) => {
    const devices: { ip: string; device: string; model: string; name: string }[] = [];
    const GOVEE_MULTI = '239.255.255.250';
    const GOVEE_PORT = 4001;
    const GOVEE_LISTEN = 4002;
    const scanMsg = JSON.stringify({ msg: { cmd: 'scan', data: { account_topic: 'reserve' } } });

    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const seen = new Set<string>();

    sock.on('message', (msg: Buffer) => {
      try {
        const data = JSON.parse(msg.toString());
        if (data?.msg?.cmd === 'scan' && data?.msg?.data) {
          const d = data.msg.data;
          const key = d.device || d.ip;
          if (seen.has(key)) return;
          seen.add(key);
          devices.push({
            ip: d.ip || '',
            device: d.device || '',
            model: d.sku || d.model || '',
            name: d.deviceName || d.sku || 'Govee Device',
          });
        }
      } catch {}
    });

    try {
      sock.bind(GOVEE_LISTEN, () => {
        try { sock.addMembership(GOVEE_MULTI); } catch {}
        const buf = Buffer.from(scanMsg);
        sock.send(buf, 0, buf.length, GOVEE_PORT, GOVEE_MULTI);
        setTimeout(() => sock.send(buf, 0, buf.length, GOVEE_PORT, GOVEE_MULTI), 500);
      });
    } catch {
      // Port might be in use — try without explicit bind
      sock.bind(() => {
        const buf = Buffer.from(scanMsg);
        sock.send(buf, 0, buf.length, GOVEE_PORT, GOVEE_MULTI);
      });
    }

    setTimeout(() => {
      try { sock.close(); } catch {}
      res.json({ devices });
    }, 4000);
  });

  // ── Govee LAN Control Proxy ───────────────────────────────────────────────
  // Sends UDP commands to Govee devices on the LAN (no API key needed).
  app.post('/api/govee/lan-control', express.json(), async (req: any, res: any) => {
    const { ip, cmd } = req.body || {};
    if (!ip || !cmd) return res.status(400).json({ error: 'ip and cmd required' });
    const msg = JSON.stringify({ msg: cmd });
    const sock = dgram.createSocket('udp4');
    const buf = Buffer.from(msg);
    sock.send(buf, 0, buf.length, 4003, ip, (err) => {
      sock.close();
      if (err) return res.status(500).json({ error: 'Send failed' });
      res.json({ ok: true });
    });
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
    const cxUse = await cxUsage(cxUid, await isPlatformAdminReq(req));
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

  // Where a PUBLIC play count for each content type already lives, so the surfaces that read
  // these fields today (Chora track rows, Reello view pills, the Reello ranking in
  // services/relloFeedService) light up from the same ingest rather than needing their own.
  // `contentStats` cannot serve them: it is owner-read-only by design, because the rollup also
  // carries watch-time and the retention curve — business data, not a public number.
  const PUBLIC_MIRROR: Record<string, { collection: string; field: string; idField?: string }> = {
    // `idField` marks a stats doc that may not exist yet — a bare field transform fails on a
    // missing document, so those need an identity field written in the same commit to create it.
    // The name matches the shape the existing docs already use, so fetchTrackStats keeps reading
    // the same collection unchanged. The content docs (videos/albums) always exist by the time
    // anyone can play them, so they need no such field.
    track: { collection: 'track_stats', field: 'playCount', idField: 'trackId' },
    album: { collection: 'albums', field: 'playCount' },
    video: { collection: 'videos', field: 'playsCount' },
    film:  { collection: 'videos', field: 'playsCount' },
  };

  /**
   * Mirror a play into the world-readable counters.
   *
   * `publicStats/{contentId}` is the canonical public doc — one number, no watch-time, no
   * retention — so a viewer can be shown "42,980 plays" without being handed the creator's
   * business metrics. The per-collection mirror above keeps existing UI working unchanged.
   */
  async function mirrorPublicPlay(contentId: string, contentType: string): Promise<void> {
    await firestoreIncrement(`publicStats/${contentId}`, { plays: 1 }, { contentId, contentType, updatedAt: Date.now() });
    const target = PUBLIC_MIRROR[contentType];
    if (!target) return;
    await firestoreIncrement(
      `${target.collection}/${contentId}`,
      { [target.field]: 1 },
      target.idField ? { [target.idField]: contentId, lastPlayed: Date.now() } : {},
    );
  }

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
      // Only a 'start' is a play. Progress and completion events must not bump the public count,
      // or one session would register as several.
      if (inc.plays) await mirrorPublicPlay(contentId, contentType);
      accepted++;
    }

    res.json({ ok: true, accepted });
  });

  // ── Audience score (thumbs up/down) ──────────────────────────────────────────
  //
  // The public "% liked" number. It has to be aggregated HERE for the same reason plays are:
  // each viewer's own vote lives at users/{uid}/titleRatings/{id}, which is owner-private, so no
  // client can count the others' votes — and a client-writable tally is a forgeable tally.
  //
  // Double-voting is prevented by remembering each voter's LAST vote server-side and applying
  // only the delta. Re-sending the same vote is a no-op, and switching UP->DOWN moves one vote
  // rather than adding one. The voter doc is server-only (rules deny the client outright), so it
  // is a record of the tally's arithmetic, not a public who-voted-what list.
  app.post('/api/metrics/rating', apiLimiter, authMiddleware, express.json({ limit: '4kb' }), async (req: any, res) => {
    const contentId = String(req.body?.contentId || '').trim();
    const contentType = String(req.body?.contentType || '').trim();
    const raw = req.body?.rating;
    const rating: 'UP' | 'DOWN' | null = raw === 'UP' || raw === 'DOWN' ? raw : null;

    if (!contentId || !/^[\w-]{1,128}$/.test(contentId) || !METRIC_CONTENT_TYPES.has(contentType)) {
      return res.status(400).json({ error: 'contentId and contentType required' });
    }

    const voterPath = `contentRatings/${contentId}/voters`;
    const prevDoc = await firestoreRead(voterPath, req.uid);
    const prev: 'UP' | 'DOWN' | null =
      prevDoc?.rating === 'UP' || prevDoc?.rating === 'DOWN' ? prevDoc.rating : null;

    if (prev === rating) {
      const cur = await firestoreRead('publicStats', contentId);
      return res.json({ ok: true, up: Number(cur?.up || 0), down: Number(cur?.down || 0) });
    }

    const inc: Record<string, number> = {};
    if (prev === 'UP') inc.up = (inc.up || 0) - 1;
    if (prev === 'DOWN') inc.down = (inc.down || 0) - 1;
    if (rating === 'UP') inc.up = (inc.up || 0) + 1;
    if (rating === 'DOWN') inc.down = (inc.down || 0) + 1;

    await firestoreIncrement(`publicStats/${contentId}`, inc, { contentId, contentType, updatedAt: Date.now() });
    await firestoreWrite(voterPath, req.uid, { rating: rating || '', at: Date.now() });

    const cur = await firestoreRead('publicStats', contentId);
    res.json({ ok: true, up: Number(cur?.up || 0), down: Number(cur?.down || 0) });
  });

  // ── Chora — transcode a track's master to the streaming ladder (Step 1) ──────
  // POST { trackId, srcUrl }. Writes choraStreams/{trackId} = { status, hls, low, flac, ... }.
  // Status-gated: the client only uses the result once status==='ready', so this is safe to run
  // in the background and to backfill the catalog without any playback disruption.
  app.post('/api/chora/transcode', apiLimiter, authMiddleware, express.json({ limit: '256kb' }), async (req: any, res) => {
    const trackId = String(req.body?.trackId || '').trim();
    const srcUrl = String(req.body?.srcUrl || '').trim();
    if (!trackId || !srcUrl) return res.status(400).json({ error: 'trackId and srcUrl required' });
    const publicBase = (process.env.PUBLIC_API_BASE || trustedRequestOrigin(req)).replace(/\/+$/, '');
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

  // ── Chora transcode worker: cron + status + enqueue ──────────────────────────
  //
  // Replaces the browser as the driver. See services/choraTranscodeWorker for the full story;
  // the short version is that publishing a 39-track album used to fire 39 concurrent 150-second
  // ffmpeg requests from one page load and then navigate away, stranding every one of them at
  // status:'processing' forever.

  /** Every music track that has a fetchable source, newest albums first. */
  async function choraListCandidates(limit: number): Promise<ChoraTrackCandidate[]> {
    const albums = await fsQueryDocs('albums', [{ field: 'type', op: 'EQUAL', value: 'MUSIC' }], 300);
    const personalAlbums = await fsQueryDocs('personal_albums', [], 300);
    albums.push(...personalAlbums.map(a => ({ ...a, data: { ...a.data, isPrivate: true } })));
    const out: ChoraTrackCandidate[] = [];
    // Explicit queue entries come first, including private uploads outside the public catalog.
    for (const collection of ['choraStreams', 'choraPrivateStreams']) {
      const queued = await fsQueryDocs(collection, [{ field: 'status', op: 'EQUAL', value: 'pending' }], limit);
      for (const row of queued) if (row.data?.srcUrl) out.push({ trackId: row.id, srcUrl: String(row.data.srcUrl), ownerId: row.data.ownerId });
    }
    const personal = await fsQueryDocs('personal_tracks', [], 300);
    for (const row of personal) {
      if (row.data?.ownerId && /^https?:/i.test(String(row.data?.url || ''))) out.push({ trackId: `private_${row.id}`, srcUrl: row.data.url, ownerId: row.data.ownerId });
    }
    for (const a of albums) {
      const tracks = Array.isArray(a.data?.tracks) ? a.data.tracks : [];
      for (const t of tracks) {
        const trackId = String(t?.id || '').trim();
        const srcUrl = String(t?.url || '').trim();
        if (!trackId || !/^https?:/i.test(srcUrl)) continue;
        const privateId = a.data?.isPrivate ? `private_${trackId}` : trackId;
        if (!out.some(job => job.trackId === privateId)) out.push({ trackId: privateId, srcUrl, albumId: a.id, ownerId: a.data?.ownerId });
      }
    }
    return out;
  }

  const choraWorkerDeps: ChoraTranscodeDeps = {
    listCandidates: choraListCandidates,
    readStream: async (trackId) => (await firestoreRead(trackId.startsWith('private_') ? 'choraPrivateStreams' : 'choraStreams', trackId)) as any,
    writeStream: async (trackId, patch) => { await firestoreWrite(trackId.startsWith('private_') ? 'choraPrivateStreams' : 'choraStreams', trackId, patch as any, true); },
    transcodeOne: async ({ trackId, srcUrl, ownerId }) => {
      const publicBase = (process.env.PUBLIC_API_BASE || 'https://plajah.com').replace(/\/+$/, '');
      let inPath: string | null = null;
      try {
        inPath = await fetchToTmp(srcUrl, 'audio');
        if (!inPath) throw new Error('source fetch failed');
        const privateToken = trackId.startsWith('private_') ? nodeCrypto.randomBytes(32).toString('hex') : undefined;
        if (privateToken && !ownerId) throw new Error('Private conversion requires its owner');
        const r = await choraTranscodeToGcs(inPath, trackId, publicBase, privateToken);
        await firestoreWrite(privateToken ? 'choraPrivateStreams' : 'choraStreams', trackId, {
          ...(privateToken ? { ownerId, mediaToken: privateToken } : {}),
          status: r.status, hls: r.hls, low: r.low, flac: r.flac,
          loudnessLufs: Math.round(r.loudnessLufs), durationSec: Math.round(r.durationSec),
          rungs: ['low', 'high', 'lossless'], updatedAt: Date.now(),
        }, true);
      } finally { if (inPath) fs.unlink(inPath).catch(() => {}); }
    },
  };

  // The durable driver. Key-gated because a scheduler carries no Firebase ID token — same shape
  // as /api/terra/cron/ingest. The run is AWAITED, and the worker's own budget keeps it inside
  // Cloud Run's 300s ceiling; letting it outlive the request would strand jobs exactly like the
  // browser did.
  app.post('/api/chora/cron/transcode', express.json({ limit: '4kb' }), async (req: any, res) => {
    const expected = process.env.CHORA_CRON_KEY || '';
    const provided = String(req.get('x-chora-cron-key') || '');
    if (!secretsEqual(provided, expected)) return res.status(401).json({ error: 'invalid or missing cron key' });
    try {
      const summary = await runChoraTranscodeWorker(choraWorkerDeps, { reason: 'cron' });
      res.json(summary);
    } catch (err: any) {
      console.error('[Chora transcode] Cron run failed:', err?.message || err);
      res.status(500).json({ error: String(err?.message || err) });
    }
  });

  // Read-only coverage, public. The visibility that was missing: how much of the catalogue
  // actually has a rendition, and how much is stuck. Without this the 30% gap was invisible
  // until someone counted by hand.
  app.get('/api/chora/transcode/status', async (_req: any, res: any) => {
    try {
      const candidates = await choraListCandidates(1000);
      const counts = { total: candidates.length, ready: 0, processing: 0, pending: 0, failed: 0, missing: 0, stale: 0 };
      const now = Date.now();
      for (const c of candidates) {
        const s: any = await choraWorkerDeps.readStream(c.trackId);
        if (!s || !s.status) { counts.missing++; continue; }
        if (s.status === 'ready') counts.ready++;
        else if (s.status === 'pending') counts.pending++;
        else if (s.status === 'failed') counts.failed++;
        else if (s.status === 'processing') {
          counts.processing++;
          if (!s.updatedAt || now - Number(s.updatedAt) > PROCESSING_STALE_MS) counts.stale++;
        }
      }
      const pct = counts.total ? Math.round((counts.ready / counts.total) * 1000) / 10 : 0;
      res.json({ ...counts, readyPct: pct });
    } catch (err: any) {
      res.status(500).json({ error: String(err?.message || err) });
    }
  });

  // Publish-time enqueue. ONE call for a whole album, returns immediately. This is what the
  // browser calls instead of looping enqueueTranscode() per track — it only marks work as
  // pending, and the worker above does it. Nothing long-running happens in this request.
  app.post('/api/chora/enqueue-track', apiLimiter, authMiddleware, express.json({ limit: '16kb' }), async (req: any, res) => {
    try {
      const trackId = String(req.body?.trackId || '').trim();
      if (!/^[\w-]+$/.test(trackId)) return res.status(400).json({ error: 'valid trackId required' });
      const track = await firestoreRead('personal_tracks', trackId);
      if (!track) return res.status(404).json({ error: 'track not found' });
      if (track.ownerId !== req.uid) return res.status(403).json({ error: 'not your track' });
      if (!/^https?:/i.test(String(track.url || ''))) return res.status(400).json({ error: 'track upload is not complete' });
      const id = `private_${trackId}`;
      const existing: any = await firestoreRead('choraPrivateStreams', id);
      if (existing?.srcUrl === track.url && (existing.status === 'ready' || (existing.status === 'processing' && Date.now() - existing.updatedAt < PROCESSING_STALE_MS))) return res.json({ ok: true, queued: 0 });
      await firestoreWrite('choraPrivateStreams', id, { ownerId: req.uid, srcUrl: track.url, status: 'pending', updatedAt: Date.now() }, true);
      res.json({ ok: true, queued: 1 });
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post('/api/chora/enqueue-album', apiLimiter, authMiddleware, express.json({ limit: '16kb' }), async (req: any, res) => {
    const albumId = String(req.body?.albumId || '').trim();
    if (!albumId || !/^[\w-]{1,128}$/.test(albumId)) return res.status(400).json({ error: 'albumId required' });
    // force re-queues tracks even when they already finished 'ready' — the re-heal path for
    // renditions that transcoded WRONG (e.g. a lying WAV header that produced a short stream).
    // Owner-gated and album-scoped, so it re-transcodes only this album, not the catalogue.
    const force = req.body?.force === true;
    let album = await firestoreRead('albums', albumId);
    let personalAlbum = false;
    if (!album) {
      album = await firestoreRead('personal_albums', albumId);
      personalAlbum = true;
    }
    if (!album) return res.status(404).json({ error: 'album not found' });
    if (String(album.ownerId || '') !== req.uid) return res.status(403).json({ error: 'not your album' });

    const tracks = Array.isArray(album.tracks) ? album.tracks : [];
    let queued = 0;
    for (const t of tracks) {
      const trackId = String((t as any)?.id || '').trim();
      const srcUrl = String((t as any)?.url || '').trim();
      if (!trackId || !/^https?:/i.test(srcUrl)) continue;
      const isPrivate = personalAlbum || album.isPrivate === true;
      const streamId = isPrivate ? `private_${trackId}` : trackId;
      const collection = isPrivate ? 'choraPrivateStreams' : 'choraStreams';
      const existing: any = await firestoreRead(collection, streamId);
      if (!force && (!existing?.srcUrl || existing.srcUrl === srcUrl) && (existing?.status === 'ready' || (existing?.status === 'processing' && Date.now() - existing.updatedAt < PROCESSING_STALE_MS))) continue;
      await firestoreWrite(collection, streamId, { status: 'pending', srcUrl, ownerId: req.uid, albumId, updatedAt: Date.now() }, true);
      queued++;
    }
    res.json({ ok: true, queued, total: tracks.length, forced: force });
  });

  // Backend-only transcode for the catalogue backfill. Identical work to the route above, but
  // gated by a shared key instead of a Firebase ID token — so it can be driven entirely from the
  // server side (a script / cron) with NO signed-in browser or TV in the loop. This is why the
  // backfill never needed a device: the transcoding was always here on Cloud Run; the only thing a
  // signed-in session provided was the token, which this key replaces. No apiLimiter — a backfill
  // is a deliberate, rate-controlled admin loop, not user traffic.
  app.post('/api/chora/transcode-admin', express.json({ limit: '256kb' }), async (req: any, res) => {
    const key = String(req.headers['x-backfill-key'] || '');
    const expected = process.env.CHORA_BACKFILL_KEY || '';
    if (!secretsEqual(key, expected)) return res.status(403).json({ error: 'forbidden' });
    const trackId = String(req.body?.trackId || req.query.trackId || '').trim();
    const srcUrl = String(req.body?.srcUrl || req.query.srcUrl || '').trim();
    if (!trackId || !srcUrl) return res.status(400).json({ error: 'trackId and srcUrl required' });
    const publicBase = (process.env.PUBLIC_API_BASE || trustedRequestOrigin(req)).replace(/\/+$/, '');
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

  // ─────────────────────────────────────────────────────────────────────────────
  // Admin Media Health — detailed file/encode reporting + consented file replacement.
  //
  // WHY. A creator can upload a file that "succeeds" but is broken: a truncated master
  // (only the first N seconds actually landed), a lying WAV/RF64 header, a never-transcoded
  // track, or a messy double-publish with duplicate tracks. None of that is visible from the
  // normal UI. This surfaces per-file size/duration/encode-health so support can SEE the
  // problem, audition the file, and repair it. Repair is deliberately narrow: an admin can
  // ONLY replace the file behind an existing track, and ONLY after the CREATOR approves it.
  // Admins can never create an album/release or add a track — every route below operates on a
  // track that already exists inside an album that already exists.
  // ─────────────────────────────────────────────────────────────────────────────

  // Replacement files must live on our own storage — never let a track point at an arbitrary host.
  const isAllowedMediaHost = (u: string): boolean => {
    try {
      const h = new URL(u).host.toLowerCase();
      return u.startsWith('https://') && (
        h === 'firebasestorage.googleapis.com' || h === 'storage.googleapis.com' ||
        h.endsWith('.firebasestorage.app') || h === 'plajah.com' || h.endsWith('.plajah.com') ||
        h.endsWith('.run.app')
      );
    } catch { return false; }
  };

  // Deep-read every album owned by a user (tracks preserved).
  const queryAlbumsByOwner = async (ownerId: string, limit = 200): Promise<any[]> => {
    const url = `https://firestore.googleapis.com/v1/projects/gen-lang-client-0665118474/databases/plajah-prod/documents:runQuery`;
    const body = { structuredQuery: { from: [{ collectionId: 'albums' }], where: { fieldFilter: { field: { fieldPath: 'ownerId' }, op: 'EQUAL', value: { stringValue: ownerId } } }, limit } };
    const res = await fetch(url, { method: 'POST', headers: await firestoreAuthHeaders(), body: JSON.stringify(body) });
    if (!res.ok) return [];
    const rows = await res.json() as any[];
    return (rows || []).filter(r => r.document).map(r => {
      const out: any = {}; for (const [k, v] of Object.entries(r.document.fields || {})) out[k] = fsValueToJs(v);
      out.id = out.id || r.document.name.split('/').pop(); return out;
    });
  };

  // Inspect ONE track: HEAD the file (size/type/reachability), read its stream doc, derive flags.
  const inspectTrack = async (alb: any, t: any, dupUrl: Record<string, number>, dupId: Record<string, number>) => {
    const url: string = typeof t?.url === 'string' ? t.url : '';
    let size: number | null = null, contentType: string | null = null, reachable = false;
    if (/^https?:/i.test(url)) {
      try {
        const h = await fetch(url, { method: 'HEAD' });
        reachable = h.ok; size = Number(h.headers.get('content-length')) || null; contentType = h.headers.get('content-type');
      } catch { /* unreachable */ }
    }
    const stream = t?.id ? await firestoreRead('choraStreams', t.id) : null;
    const streamStatus: string = (stream?.status as string) || 'none';
    const durationSec: number | null = stream?.durationSec != null ? Number(stream.durationSec) : null;
    // Bytes → seconds estimate for a lossy master (helps flag a short file before any transcode).
    const estBitrateKbps = /aac|mp4|m4a|mpeg|mp3/.test(String(contentType || '').toLowerCase()) ? 256 : 0;
    const estSeconds = size && estBitrateKbps ? Math.round((size * 8) / (estBitrateKbps * 1000)) : null;
    const flags: string[] = [];
    if (!url) flags.push('NO_URL');
    else if (!reachable) flags.push('MISSING_FILE');
    if (streamStatus === 'none') flags.push('NO_TRANSCODE');
    else if (streamStatus !== 'ready') flags.push('STREAM_' + streamStatus.toUpperCase());
    if (durationSec != null && durationSec > 0 && durationSec < 40) flags.push('SHORT_DURATION');
    if (estSeconds != null && estSeconds < 40 && durationSec == null) flags.push('LIKELY_SHORT_FILE');
    if (size != null && size < 300 * 1024) flags.push('SMALL_FILE');
    if ((url && dupUrl[url] > 1) || (t?.id && dupId[t.id] > 1)) flags.push('DUPLICATE');
    return {
      albumId: alb.id, albumTitle: alb.title || '', ownerId: alb.ownerId || '', albumType: alb.type || '',
      trackId: t?.id || '', trackTitle: t?.title || '', artist: t?.artist || alb.artist || '',
      url, size, contentType, estSeconds,
      streamStatus, durationSec, hls: !!stream?.hls, low: !!stream?.low, flac: !!stream?.flac,
      loudnessLufs: stream?.loudnessLufs != null ? Number(stream.loudnessLufs) : null,
      flags,
    };
  };

  // GET report — scope with ?albumId= | ?ownerId= | ?trackId= (trackId narrows within albumId).
  app.get('/api/admin/media-health', authMiddleware, async (req: any, res: any) => {
    if (!(await fetchFirebaseDoc('admins', req.uid))) return res.status(403).json({ error: 'Admin access required' });
    const albumId = String(req.query.albumId || '').trim();
    const ownerId = String(req.query.ownerId || '').trim();
    const trackId = String(req.query.trackId || '').trim();
    try {
      let albums: any[] = [];
      if (albumId) { const a = await firestoreGetDeep('albums', albumId); if (a) { a.id = a.id || albumId; albums = [a]; } }
      else if (ownerId) { albums = (await queryAlbumsByOwner(ownerId)).filter(a => (a.type || 'MUSIC') !== 'BOOK'); }
      else return res.status(400).json({ error: 'albumId or ownerId required' });

      const rows: any[] = [];
      const albumFlags: any[] = [];
      for (const alb of albums) {
        const tracks = Array.isArray(alb.tracks) ? alb.tracks : [];
        if (!tracks.length) { albumFlags.push({ albumId: alb.id, albumTitle: alb.title || '', ownerId: alb.ownerId || '', flags: ['EMPTY_ALBUM'] }); continue; }
        const dupUrl: Record<string, number> = {}, dupId: Record<string, number> = {};
        for (const t of tracks) { if (t?.url) dupUrl[t.url] = (dupUrl[t.url] || 0) + 1; if (t?.id) dupId[t.id] = (dupId[t.id] || 0) + 1; }
        for (const t of tracks) {
          if (trackId && t?.id !== trackId) continue;
          rows.push(await inspectTrack(alb, t, dupUrl, dupId));
        }
      }
      res.json({ ok: true, albums: albums.length, tracks: rows.length, rows, albumFlags });
    } catch (e: any) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  });

  // Exact probe (drill-in): ffprobe the master for true duration/format/bitrate. Downloads the file,
  // so it's a per-track action, not part of the bulk report.
  app.post('/api/admin/media-health/probe', authMiddleware, express.json({ limit: '4kb' }), async (req: any, res: any) => {
    if (!(await fetchFirebaseDoc('admins', req.uid))) return res.status(403).json({ error: 'Admin access required' });
    const url = String(req.body?.url || '').trim();
    if (!/^https?:/i.test(url)) return res.status(400).json({ error: 'url required' });
    let tmp: string | null = null;
    try {
      tmp = await fetchToTmp(url, 'media');
      if (!tmp) return res.status(502).json({ error: 'could not fetch file' });
      const { json } = await runFfprobe(tmp);
      const a = (json?.streams || []).find((s: any) => s.codec_type === 'audio') || {};
      res.json({
        ok: true,
        durationSec: parseFloat(json?.format?.duration || '0') || 0,
        bitRate: Number(json?.format?.bit_rate) || null,
        formatName: json?.format?.format_name || '',
        codec: a.codec_name || '', sampleRate: Number(a.sample_rate) || null, channels: Number(a.channels) || null,
        sizeBytes: Number(json?.format?.size) || null,
      });
    } catch (e: any) {
      res.status(500).json({ error: String(e?.message || e) });
    } finally { if (tmp) fs.unlink(tmp).catch(() => {}); }
  });

  // Admin proposes replacing a track's file. Writes a pending request + notifies the CREATOR.
  // Does NOT change anything live — the swap only happens after the owner approves.
  app.post('/api/admin/media-repair/request', authMiddleware, express.json({ limit: '8kb' }), async (req: any, res: any) => {
    if (!(await fetchFirebaseDoc('admins', req.uid))) return res.status(403).json({ error: 'Admin access required' });
    const albumId = String(req.body?.albumId || '').trim();
    const trackId = String(req.body?.trackId || '').trim();
    const newUrl = String(req.body?.newUrl || '').trim();
    const note = String(req.body?.note || '').slice(0, 500);
    if (!albumId || !trackId || !newUrl) return res.status(400).json({ error: 'albumId, trackId, newUrl required' });
    if (!isAllowedMediaHost(newUrl)) return res.status(400).json({ error: 'replacement file must be on Plajah storage' });
    const alb = await firestoreGetDeep('albums', albumId);
    if (!alb) return res.status(404).json({ error: 'album not found' });
    const tracks = Array.isArray(alb.tracks) ? alb.tracks : [];
    const track = tracks.find((t: any) => t?.id === trackId);
    if (!track) return res.status(404).json({ error: 'track not found in album' });
    const ownerId = String(alb.ownerId || '');
    if (!ownerId) return res.status(409).json({ error: 'album has no owner to ask' });
    const now = Date.now();
    const requestId = await firestoreCreate('mediaRepairRequests', {
      albumId, trackId, ownerId, albumTitle: alb.title || '', trackTitle: track.title || '',
      adminUid: req.uid, oldUrl: typeof track.url === 'string' ? track.url : '', newUrl,
      note, status: 'pending', createdAt: now,
    });
    if (!requestId) return res.status(500).json({ error: 'could not create request' });
    // Notify the creator (SYSTEM notification; link resolves to the in-app approval surface).
    await firestoreCreate('notifications', {
      userId: ownerId, senderId: 'plajah-support', senderName: 'Plajah Support', senderPhoto: '',
      type: 'SYSTEM', title: 'File repair needs your approval',
      message: `Support wants to replace the file for "${track.title || 'your track'}" on "${alb.title || 'your release'}". Review and approve.`,
      link: 'MEDIA_REPAIR', targetId: requestId, isRead: false, timestamp: now,
    });
    res.json({ ok: true, requestId, ownerId });
  });

  // Owner lists THEIR pending repair requests (the approval inbox).
  app.get('/api/media-repair/mine', authMiddleware, async (req: any, res: any) => {
    try {
      const url = `https://firestore.googleapis.com/v1/projects/gen-lang-client-0665118474/databases/plajah-prod/documents:runQuery`;
      const body = { structuredQuery: { from: [{ collectionId: 'mediaRepairRequests' }], where: { compositeFilter: { op: 'AND', filters: [
        { fieldFilter: { field: { fieldPath: 'ownerId' }, op: 'EQUAL', value: { stringValue: req.uid } } },
        { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'pending' } } },
      ] } } } };
      const r = await fetch(url, { method: 'POST', headers: await firestoreAuthHeaders(), body: JSON.stringify(body) });
      const rows = (await r.json() as any[]) || [];
      const out = rows.filter(x => x.document).map(x => { const o: any = {}; for (const [k, v] of Object.entries(x.document.fields || {})) o[k] = fsValueToJs(v); o.id = x.document.name.split('/').pop(); return o; });
      res.json({ ok: true, requests: out });
    } catch (e: any) { res.status(500).json({ error: String(e?.message || e) }); }
  });

  // Owner approves/denies. Approve = swap the track's url (deep-preserving every other field) and
  // re-enqueue transcode. Only the OWNER of the album may respond; admins cannot self-approve.
  app.post('/api/media-repair/respond', authMiddleware, express.json({ limit: '4kb' }), async (req: any, res: any) => {
    const requestId = String(req.body?.requestId || '').trim();
    const approve = req.body?.approve === true;
    if (!requestId) return res.status(400).json({ error: 'requestId required' });
    const reqDoc = await firestoreGetDeep('mediaRepairRequests', requestId);
    if (!reqDoc) return res.status(404).json({ error: 'request not found' });
    if (String(reqDoc.ownerId) !== req.uid) return res.status(403).json({ error: 'not your request' });
    if (reqDoc.status !== 'pending') return res.json({ ok: true, already: reqDoc.status });
    const now = Date.now();
    if (!approve) {
      await firestorePatchDeep('mediaRepairRequests', requestId, { status: 'denied', resolvedAt: now });
      return res.json({ ok: true, applied: false });
    }
    const alb = await firestoreGetDeep('albums', String(reqDoc.albumId));
    const tracks = Array.isArray(alb?.tracks) ? alb!.tracks : [];
    const idx = tracks.findIndex((t: any) => t?.id === reqDoc.trackId);
    if (idx < 0) {
      await firestorePatchDeep('mediaRepairRequests', requestId, { status: 'failed', error: 'track no longer exists', resolvedAt: now });
      return res.status(409).json({ error: 'track no longer exists in album' });
    }
    tracks[idx] = { ...tracks[idx], url: reqDoc.newUrl };
    const ok = await firestorePatchDeep('albums', String(reqDoc.albumId), { tracks });
    if (!ok) return res.status(500).json({ error: 'failed to update album' });
    // Re-enqueue transcode so the streaming ladder rebuilds from the corrected file.
    await firestoreWrite('choraStreams', String(reqDoc.trackId), { status: 'pending', updatedAt: now });
    await firestorePatchDeep('mediaRepairRequests', requestId, { status: 'approved', resolvedAt: now });
    res.json({ ok: true, applied: true });
  });

  // Admin lists repair requests (any status) to track outcomes.
  app.get('/api/admin/media-repair/list', authMiddleware, async (req: any, res: any) => {
    if (!(await fetchFirebaseDoc('admins', req.uid))) return res.status(403).json({ error: 'Admin access required' });
    try {
      const url = `https://firestore.googleapis.com/v1/projects/gen-lang-client-0665118474/databases/plajah-prod/documents/mediaRepairRequests?pageSize=100`;
      const r = await fetch(url, { headers: await firestoreAuthHeaders() });
      const j = await r.json() as any;
      const out = (j.documents || []).map((d: any) => { const o: any = {}; for (const [k, v] of Object.entries(d.fields || {})) o[k] = fsValueToJs(v); o.id = d.name.split('/').pop(); return o; })
        .sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
      res.json({ ok: true, requests: out });
    } catch (e: any) { res.status(500).json({ error: String(e?.message || e) }); }
  });

  // Serve a transcoded asset from GCS with Range + permissive CORS (HLS playlists resolve their
  // relative segment URLs against this path). Playlists cache briefly; immutable media caches forever.
  app.options(['/api/chora/media/:trackId/*splat', '/api/chora/private-media/:trackId/*splat'], (_req: any, res: any) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range');
    res.status(204).end();
  });
  app.get(['/api/chora/media/:trackId/*splat', '/api/chora/private-media/:trackId/*splat'], async (req: any, res: any) => {
    const trackId = String(req.params.trackId).replace(/[^\w\-]/g, '');
    // Express 5 named wildcard → req.params.splat is an array of the remaining path segments.
    const splat = (req.params as any).splat;
    const sub = (Array.isArray(splat) ? splat.join('/') : String(splat || '')).replace(/\.\.+/g, '').replace(/^\/+/, '');
    if (!trackId || !sub) return res.status(400).end();
    const privateMedia = req.path.startsWith('/api/chora/private-media/');
    if (privateMedia) {
      const stream: any = await firestoreRead('choraPrivateStreams', trackId);
      if (!stream?.mediaToken || !secretsEqual(String(req.query.access || ''), stream.mediaToken)) return res.status(403).end();
    }
    const token = await getGoogleAccessToken();
    if (!token) return res.status(503).end();
    try {
      const gcsUrl = `https://storage.googleapis.com/storage/v1/b/${STORAGE_BUCKET}/o/${encodeURIComponent(`${privateMedia ? 'chora-private' : 'chora-hls'}/${trackId}/${sub}`)}?alt=media`;
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
      res.setHeader('Cache-Control', privateMedia ? 'private, no-store' : sub.endsWith('.m3u8') ? 'public, max-age=60' : 'public, max-age=31536000, immutable');
      const cr = g.headers.get('content-range'); if (cr) res.setHeader('Content-Range', cr);
      const cl = g.headers.get('content-length'); if (cl) res.setHeader('Content-Length', cl);
      res.status(g.status === 206 ? 206 : 200);
      // Pipe the GCS response straight through instead of buffering the whole segment in memory
      // first (the old `Buffer.from(await g.arrayBuffer())`) — that forced every HLS segment
      // fetch to pay full GCS-to-server latency THEN full server-to-client latency serially
      // instead of overlapping them, adding real per-segment delay on every play.
      if (!g.body) return res.end();
      const upstream = Readable.fromWeb(g.body as any);
      // Every listener hits this route once per segment, and aborts are the norm here —
      // seeking, skipping a track, closing the tab. Without destroying the upstream on
      // close, each of those strands an open GCS stream on the instance.
      res.on('close', () => upstream.destroy());
      // A mid-pipe failure lands after the try/catch has already returned and after the
      // headers went out, so it arrives as an unhandled 'error' on the readable rather
      // than a 502. Swallow the request instead of letting it take the instance down.
      upstream.on('error', (err) => {
        console.warn('[Chora media] upstream stream error:', err?.message || err);
        res.destroy();
      });
      upstream.pipe(res);
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
      const base = (process.env.PUBLIC_API_BASE || trustedRequestOrigin(req)).replace(/\/+$/, '');
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
        const coll: Record<string, string> = { mix: 'albums', album: 'albums', track: 'albums', book: 'albums', movie: 'albums', video: 'videos', article: 'articles', game: 'games' };
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
    const { createServer: createViteServer } = await import('vite');
    // In middleware mode Vite opens its own HMR websocket. Auto-find an open port
    // starting at 24678 (or VITE_HMR_PORT) so multiple concurrent dev instances
    // or previous runs never fail with EADDRINUSE on 24678.
    const baseHmrPort = Number(process.env.VITE_HMR_PORT) || 24678;
    const findOpenPort = async (start: number): Promise<number> => {
      const net = await import('net');
      return new Promise((resolve) => {
        const testServer = net.createServer();
        testServer.listen(start, () => {
          const p = (testServer.address() as any)?.port || start;
          testServer.close(() => resolve(p));
        });
        testServer.on('error', () => {
          resolve(findOpenPort(start + 1));
        });
      });
    };
    const hmrPort = await findOpenPort(baseHmrPort);
    const enableHmr = process.env.VITE_HMR === 'true';
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: enableHmr ? { port: hmrPort } : false },
      appType: 'spa',
    });
    app.use(async (req, res, next) => {
      // Intercept root in dev: inject meta tags if type is present,
      // or transform and serve index.html directly so it loads immediately.
      if (req.path === '/' || req.path === '') {
        try {
          const rawHtml = await fs.readFile(path.join(__dirname, 'index.html'), 'utf-8');
          const finalHtml = req.query.type
            ? await injectMetaTags(rawHtml, req.query, req.get('host') || 'localhost')
            : rawHtml;
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
      if (req.path.startsWith('/api/') || req.path.startsWith('/t/')) return next();
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
      if (req.path.startsWith('/api/') || req.path.startsWith('/t/')) return next();   // /t/* = public ticket page (ticketServer)
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

    // Webhooks mutate privileged state: never accept them without a configured
    // secret, a valid signature, and a fresh timestamp.
    if (!secret) return res.status(503).json({ error: 'Webhook unavailable' });
    if (!sig) return res.status(401).json({ error: 'Missing signature' });
    {
      try {
        const body = req.body.toString('utf8');
        const ts = sig.split(',').find(p => p.startsWith('t='))?.split('=')[1];
        const v1 = sig.split(',').find(p => p.startsWith('v1='))?.split('=')[1];
        if (!ts || !v1) return res.status(400).json({ error: 'Invalid signature header' });
        if (!/^\d+$/.test(ts) || Math.abs(Date.now() / 1000 - Number(ts)) > 300) {
          return res.status(401).json({ error: 'Stale signature' });
        }
        const crypto = await import('crypto');
        const expected = crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
        const actual = Buffer.from(v1, 'hex');
        const wanted = Buffer.from(expected, 'hex');
        if (actual.length !== wanted.length || !crypto.timingSafeEqual(wanted, actual)) {
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

          // Story Intelligence: a movie upload's analysis job waits as WAITING_MEDIA until its
          // asset is streamable. Album ids contain underscores so the sys_{albumId}_{trackId}
          // doc id can't be parsed reliably — instead sweep the (tiny) WAITING_MEDIA set and
          // let enqueueIfReady re-check each album for a ready playbackId. Idempotent.
          try {
            const jq = await fetch(`${fsBase}:runQuery`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ structuredQuery: {
                from: [{ collectionId: 'taleoAnalysis' }],
                where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'WAITING_MEDIA' } } },
                limit: 10,
              } }),
            });
            const jrows = await jq.json();
            for (const row of (Array.isArray(jrows) ? jrows : [])) {
              const aid = row?.document?.fields?.albumId?.stringValue;
              if (aid) taleoEnqueueIfReady(aid).catch(() => {});
            }
          } catch (e: any) { console.warn('[MUX webhook] story-intel enqueue sweep failed:', e?.message); }
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

  // ── Stripe Terminal connection token — card-present POS. The reader is registered to the BUSINESS's
  // connected account, so the token is minted ON that account (Connect direct). The register's card
  // seam calls this once it has a paired reader; without hardware it's simply never invoked.
  app.post('/api/stripe/terminal/connection-token', authMiddleware, express.json(), async (req: any, res) => {
    try {
      const connectedAccountId: string | undefined = req.body?.connectedAccountId;
      const stripe = getStripe();
      const token = await stripe.terminal.connectionTokens.create(
        {},
        connectedAccountId ? { stripeAccount: connectedAccountId } : undefined,
      );
      res.json({ secret: token.secret });
    } catch (err: any) {
      console.error('/api/stripe/terminal/connection-token', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Store inventory spine — ONE stock-safe path for the online store, kiosk and POS ───────────────
  // Rules live in services/inventoryCore.ts (pure + unit-tested). Every line is re-loaded from
  // storeProducts (variants intact via the deep reader — firestoreRead flattens arrays of maps) and
  // priced/stock-checked server-side; the client never sets a price or claims stock.
  const loadStoreProduct = async (id: string): Promise<any | null> => {
    const d = await firestoreGetDeep('storeProducts', id);
    return d ? { ...d, id } : null;
  };

  /** Merge duplicate (product, variant) requests, then price + stock-check each. */
  const priceStoreLines = async (
    rawItems: any[], businessUid: string, opts: { allowInactive?: boolean; ignoreStock?: boolean } = {},
  ): Promise<{ ok: true; lines: any[]; products: Map<string, any>; subtotalCents: number } | { ok: false; status: number; error: string; code?: string; available?: number }> => {
    const want = new Map<string, { productId: string; variantId?: string; qty: number }>();
    for (const it of rawItems.slice(0, 60)) {
      const productId = String(it?.productId || ''), variantId = it?.variantId ? String(it.variantId) : undefined;
      if (!productId) continue;
      const key = `${productId}|${variantId || ''}`;
      const cur = want.get(key);
      const qty = Math.max(1, Math.floor(Number(it?.qty ?? it?.quantity) || 0));
      if (cur) cur.qty += qty; else want.set(key, { productId, variantId, qty });
    }
    if (!want.size) return { ok: false, status: 400, error: 'No valid items.' };
    const products = new Map<string, any>();
    const lines: any[] = [];
    let subtotalCents = 0;
    for (const req of want.values()) {
      if (!products.has(req.productId)) products.set(req.productId, await loadStoreProduct(req.productId));
      const r = resolveInventoryLine(products.get(req.productId), req, { sellerId: businessUid, ...opts });
      if (r.ok === false) return { ok: false, status: r.code === 'NOT_FOUND' || r.code === 'WRONG_SELLER' || r.code === 'BAD_PRICE' ? 400 : 409, error: r.error, code: r.code, available: r.available };
      lines.push(r.line);
      subtotalCents += r.line.unitAmount * r.line.qty;
    }
    return { ok: true, lines, products, subtotalCents };
  };

  /** Owner-entered register settings (tax etc.) live on businesses/{uid}.registerSettings (JSON string). */
  const loadRegisterSettings = async (businessUid: string): Promise<{ tax: TaxSettings; refundApprovalCents: number; discountLimitPct: number; tipPresets: number[] }> => {
    let raw: any = null;
    try { const d = await firestoreRead('businesses', businessUid); raw = d?.registerSettings ? (typeof d.registerSettings === 'string' ? JSON.parse(d.registerSettings) : d.registerSettings) : null; } catch { /* default: no tax */ }
    return { tax: parseTaxSettings(raw?.tax), refundApprovalCents: Number.isFinite(Number(raw?.refundApprovalCents)) ? Math.max(0, Math.round(Number(raw.refundApprovalCents))) : 5000, discountLimitPct: Number.isFinite(Number(raw?.discountLimitPct)) ? Math.max(0, Math.min(100, Number(raw.discountLimitPct))) : DEFAULT_DISCOUNT_LIMIT_PCT, tipPresets: Array.isArray(raw?.tipPresets) ? raw.tipPresets.map(Number).filter((n: number) => n > 0 && n <= 100).slice(0, 4) : [15, 18, 20] };
  };
  /** Tax inputs for priced lines: gross cents + the product's taxClass / snapEligible. */
  const taxInputs = (lines: any[], products: Map<string, any>) => lines.map(l => {
    const p = products.get(l.productId) || {};
    return { grossCents: l.unitAmount * l.qty, taxClass: normalizeTaxClass(p.taxClass), snapEligible: !!p.snapEligible };
  });

  /**
   * Apply a sale to stock: atomic decrement (total + per-variant), a ledger entry per line, and a
   * heads-up to the seller when something runs low/out. IDEMPOTENT per (order, line) — the ledger doc
   * id is deterministic, so a retried webhook can never double-decrement. Returns true if any line
   * went below zero (oversold) so the caller can flag the order.
   */
  const applyStockSale = async (
    lines: any[], ctx: { orderId: string; sellerId: string; reason: 'SALE' | 'POS_SALE'; by?: string },
  ): Promise<boolean> => {
    let oversold = false;
    for (const li of lines) {
      try {
        const moveId = `${ctx.orderId}_${li.productId}_${li.variantId || 'base'}`.slice(0, 200);
        const p = await loadStoreProduct(li.productId);
        if (!p) continue;
        const inc = planDecrementInventory(p, li.variantId || undefined, li.qty);
        if (inc.stock === undefined) {                                       // untracked: just count the sale (once)
          const claim = await firestoreCreateOnce('stockMoves', moveId, { sellerId: ctx.sellerId, productId: li.productId, productTitle: String(p.title || ''), delta: 0, before: 0, after: 0, reason: ctx.reason, orderId: ctx.orderId, at: Date.now(), untracked: true });
          if (claim === 'created') await firestoreIncrement(`storeProducts/${li.productId}`, inc);
          continue;
        }
        const seed = variantStockSeedInventory(p);                           // pre-variantStock products
        if (seed) { await firestorePatchDeep('storeProducts', li.productId, { variantStock: seed }); p.variantStock = seed; }
        const before = li.variantId && p.variants?.length
          ? Number(p.variantStock?.[li.variantId] ?? (p.variants.find((v: any) => v.id === li.variantId)?.stock ?? 0))
          : Number(p.stock ?? 0);
        const after = before - li.qty;
        // The ledger entry IS the lock: create-only, so a retried/concurrent webhook that loses the race
        // skips this line instead of double-decrementing. If the decrement then fails we release the claim.
        const claim = await firestoreCreateOnce('stockMoves', moveId, {
          sellerId: ctx.sellerId, productId: li.productId, productTitle: String(p.title || ''),
          ...(li.variantId ? { variantId: li.variantId, variantName: li.variantName || '' } : {}),
          delta: -li.qty, before, after, reason: ctx.reason, orderId: ctx.orderId, ...(ctx.by ? { by: ctx.by } : {}), at: Date.now(),
        });
        if (claim !== 'created') continue;                                   // already applied (or ledger unavailable)
        const ok = await firestoreIncrement(`storeProducts/${li.productId}`, inc);
        if (!ok) { await firestoreDeleteDoc('stockMoves', moveId); continue; }
        if (after < 0 && !p.allowBackorder) oversold = true;
        // Seller alert only when this sale CROSSES a threshold (not on every sale below it).
        const t = typeof p.lowStockThreshold === 'number' ? p.lowStockThreshold : 5;
        const label = li.variantName ? `${p.title} (${li.variantName})` : p.title;
        const crossed = after <= 0 && before > 0 ? 'out' : after <= t && before > t ? 'low' : null;
        if (crossed && !p.allowBackorder) {
          await firestoreCreate('notifications', {
            userId: ctx.sellerId, senderId: 'plajah-store', senderName: 'Plajah Store', senderPhoto: '', type: 'SYSTEM',
            title: crossed === 'out' ? `Sold out: ${label}` : `Running low: ${label}`,
            message: crossed === 'out' ? `${label} just sold out. Restock to keep selling.` : `Only ${Math.max(0, after)} of ${label} left.`,
            link: p.sellerType === 'ORG' ? 'BUSINESS_DASHBOARD' : 'DASHBOARD', targetId: li.productId, isRead: false, timestamp: Date.now(),
          }).catch(() => {});
        }
      } catch (e: any) { console.error('[store] applyStockSale line failed', li?.productId, e?.message || e); }
    }
    return oversold;
  };

  // ── Store order — the spine for in-store kiosk + POS + online store ───────────────
  // Stripe Connect DIRECT: funds settle straight to the BUSINESS's connected account; Plajah never
  // holds them (optional application fee only). Lines are priced + stock-checked SERVER-SIDE (variants
  // included); stock is decremented by the webhook once paid.
  const STORE_APP_FEE_BPS = 0; // Plajah's per-order platform fee in basis points (200 = 2%). 0 = none at launch.
  const SHIP_FLAT_CENTS = 599, FREE_SHIP_OVER_CENTS = 5000;   // mirrors the storefront copy: "$5.99, free over $50"
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
      if (!acct) return res.status(400).json({ error: 'This shop has not connected Stripe payouts yet.' });

      const priced = await priceStoreLines(items, businessUid);
      if (priced.ok === false) return res.status(priced.status).json({ error: priced.error, code: priced.code, available: priced.available });
      const { lines, products, subtotalCents } = priced;
      const needsShipping = fulfillment === 'SHIP' && lines.some(l => !products.get(l.productId)?.isDigital);
      const shippingCents = needsShipping ? (subtotalCents >= FREE_SHIP_OVER_CENTS ? 0 : SHIP_FLAT_CENTS) : 0;

      // Sales tax (owner-entered rates, server-computed). Digital/untaxed classes follow product.taxClass; shipping is not taxed here.
      const rsettings = await loadRegisterSettings(businessUid);
      const taxedOnline = computeTax(taxInputs(lines, products), rsettings.tax);
      const onlineTaxCents = rsettings.tax.inclusive ? 0 : taxedOnline.taxCents;   // inclusive prices already carry tax

      const lineItems = lines.map(l => ({
        price_data: {
          currency: 'usd',
          product_data: { name: l.variantName ? `${l.title} — ${l.variantName}` : l.title, ...(/^https:\/\//.test(l.image || '') && String(l.image).length < 2000 ? { images: [l.image] } : {}) },
          unit_amount: l.unitAmount,
        },
        quantity: l.qty,
      }));

      if (onlineTaxCents > 0) lineItems.push({ price_data: { currency: 'usd', product_data: { name: 'Sales tax' }, unit_amount: onlineTaxCents }, quantity: 1 } as any);
      const orderId = `so_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const appFee = Math.round(subtotalCents * (STORE_APP_FEE_BPS / 10000));
      const origin = trustedRequestOrigin(req);
      const session = await getStripe().checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: lineItems,
        expires_at: Math.floor(Date.now() / 1000) + 31 * 60,        // don't hold a cart for 24h
        ...(needsShipping ? {
          shipping_address_collection: { allowed_countries: ['US', 'CA', 'GB', 'AU', 'DE', 'FR', 'NL', 'IE', 'NZ', 'MX'] },
          shipping_options: [{ shipping_rate_data: { type: 'fixed_amount', fixed_amount: { amount: shippingCents, currency: 'usd' }, display_name: shippingCents ? 'Standard shipping' : 'Free shipping' } }],
        } : {}),
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
        // buyerId/sellerId mirror customerUid/businessUid so the storeOrders security rules (which gate
        // read/update on buyerId==uid / sellerId==uid) permit the customer to read their orders and the
        // business to read + advance them.
        buyerId: customerUid, sellerId: businessUid,
        items: JSON.stringify(lines.map(l => ({ productId: l.productId, variantId: l.variantId || null, title: l.title, qty: l.qty, unitAmount: l.unitAmount, variantName: l.variantName || null, image: l.image || null }))),
        subtotalCents, shippingCents, taxCents: taxedOnline.taxCents, taxInclusive: !!rsettings.tax.inclusive,
        fulfillment: needsShipping ? 'SHIP' : 'PICKUP',
        note: String(note || '').slice(0, 500), customerName: String(customerName || '').slice(0, 120),
        status: 'PENDING_PAYMENT', createdAt: Date.now(), stripeSessionId: session.id,
      });
      res.json({ url: session.url, orderId });
    } catch (err: any) {
      console.error('/api/store/create-order', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── POS sale — staff-facing register (cash tender). Business-authenticated (the owner runs the
  // register). Prices server-side, records a CONFIRMED order, decrements stock (never BLOCKS on a wrong
  // count — the item is in the cashier's hand; it goes negative and is flagged for a recount), and
  // awards loyalty points to a recognized Plajah customer. Card-present tender is a Stripe-Terminal fast-follow.
  // ── Register actors: owner (own Plajah auth) OR a PIN-session staff member ──────────────────────
  // List a doc's subcollection (service-account runQuery scoped to the parent doc).
  const fsListSub = async (parentPath: string, collectionId: string, limitN = 200): Promise<Array<{ id: string; data: Record<string, any> }>> => {
    const url = `https://firestore.googleapis.com/v1/projects/gen-lang-client-0665118474/databases/plajah-prod/documents/${parentPath}:runQuery`;
    try {
      const r = await fetch(url, { method: 'POST', headers: { ...(await firestoreAuthHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId }], limit: limitN } }) });
      if (!r.ok) return [];
      const data = await r.json();
      return (Array.isArray(data) ? data : []).filter((x: any) => x.document).map((x: any) => ({ id: String(x.document.name).split('/').pop()!, data: decodeFirestoreFields(x.document.fields) }));
    } catch { return []; }
  };
  /** A seller's POS orders / refunds (equality filter only = no composite index; time filtering is in memory). */
  const sellerDocs = async (collectionId: string, businessUid: string, limitN = 3000) =>
    (await fsQueryDocs(collectionId, [{ field: 'sellerId', op: 'EQUAL', value: businessUid }], limitN)).map(d => ({ ...d.data, id: d.id }));
  // ── Optimistic concurrency over Firestore REST ───────────────────────────────────────────────────
  // The existing REST helpers (PATCH with updateMask, commit/increment, createOnce) can do two things that
  // are real, cross-instance-safe atomic primitives: (1) create-if-absent, and (2) a PATCH guarded by a
  // precondition (`currentDocument.updateTime=<version I read>` or `currentDocument.exists=false`). Firestore
  // rejects a guarded write whose doc changed since it was read (409/412 or 400 FAILED_PRECONDITION), so
  // services/casCore.casUpdate does read -> decide -> guarded write -> retry. That gives refunds and drawer
  // edits compare-and-swap semantics on a single document without REST beginTransaction/commit plumbing,
  // and works on any number of Cloud Run instances (unlike the in-process mutex it replaces).
  const FS_DOCS = 'https://firestore.googleapis.com/v1/projects/gen-lang-client-0665118474/databases/plajah-prod/documents';
  const restCas = (collectionPath: string): CasStore => ({
    async get(id) {
      const r = await fetch(`${FS_DOCS}/${collectionPath}/${encodeURIComponent(id)}`, { headers: await firestoreAuthHeaders() });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`cas read ${collectionPath}/${id} failed: HTTP ${r.status}`);
      const j = await r.json() as any;
      return { data: decodeFirestoreFields(j.fields || {}), version: String(j.updateTime) };
    },
    async put(id, patch, expected) {
      const keys = Object.keys(patch).filter(k => patch[k] !== undefined);
      const mask = keys.map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
      const pre = expected === null ? 'currentDocument.exists=false' : `currentDocument.updateTime=${encodeURIComponent(expected)}`;
      const fields: Record<string, any> = {};
      for (const k of keys) fields[k] = jsToFsValue(patch[k]);
      try {
        const r = await fetch(`${FS_DOCS}/${collectionPath}/${encodeURIComponent(id)}?${mask}&${pre}`, { method: 'PATCH', headers: await firestoreAuthHeaders(), body: JSON.stringify({ fields }) });
        if (r.ok) return 'ok';
        const body = await r.text().catch(() => '');
        if (r.status === 409 || r.status === 412 || (r.status === 400 && /FAILED_PRECONDITION|ALREADY_EXISTS/.test(body))) return 'conflict';
        console.error(`[cas] put ${collectionPath}/${id} HTTP ${r.status}`);
        return 'error';
      } catch { return 'error'; }
    },
  });
  /** Delete specific fields from a doc (PATCH with a mask naming them and no value removes them). */
  const firestoreDeleteFields = async (collectionPath: string, id: string, fieldNames: string[]): Promise<boolean> => {
    const mask = fieldNames.map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
    try { const r = await fetch(`${FS_DOCS}/${collectionPath}/${encodeURIComponent(id)}?${mask}`, { method: 'PATCH', headers: await firestoreAuthHeaders(), body: JSON.stringify({ fields: {} }) }); return r.ok; } catch { return false; }
  };
  const pinAttempts = new Map<string, AttemptState>();
  const pinGuard = (key: string) => isLocked(pinAttempts.get(key), Date.now());
  const pinNote = (key: string, ok: boolean) => pinAttempts.set(key, recordAttempt(pinAttempts.get(key), ok, Date.now()));
  // PINs are salted scrypt hashes in businesses/{b}/staffSecrets/{staffId} (no client rule allows that path).
  // The staff doc itself only carries `hasPin: true`. Plaintext PINs are never stored.
  const pinSecrets = async (businessUid: string) => new Map((await fsListSub(`businesses/${businessUid}`, 'staffSecrets', 100)).map(d => [d.id, d.data as { pinHash?: string; pinSalt?: string }]));
  /** Find the active staff member whose PIN matches. */
  const matchStaffPin = async (businessUid: string, pin: string, onlyApprovers = false) => {
    const [staff, secrets] = await Promise.all([fsListSub(`businesses/${businessUid}`, 'staff', 100), pinSecrets(businessUid)]);
    for (const s of staff) {
      const d = s.data;
      if (d.active === false) continue;
      const role = String(d.role || 'STAFF');
      if (onlyApprovers && !canApprove(role, Array.isArray(d.registerPermissions) ? d.registerPermissions : null)) continue;
      const sec = secrets.get(s.id);
      if (!sec || !verifyPin(pin, sec)) continue;
      return { id: s.id, name: String(d.name || 'Staff'), role, perms: Array.isArray(d.registerPermissions) ? d.registerPermissions as string[] : undefined };
    }
    return null;
  };
  type Actor = { ok: true; staffId: string; staffName: string; role: string; perms: Set<RegisterPermission> } | { ok: false; status: number; error: string; code?: string };
  const resolveRegisterActor = async (req: any, businessUid: string, perm: RegisterPermission): Promise<Actor> => {
    // A valid PIN session wins even on the owner's device, so a cashier signed in by PIN is attributed and restricted as themselves.
    const sess = verifySession(String(req.headers?.['x-register-session'] || ''));
    if (req.uid === businessUid && !(sess && sess.b === businessUid)) return { ok: true, staffId: businessUid, staffName: 'Owner', role: 'OWNER', perms: registerPermissionsFor('OWNER') };
    if (!sess || sess.b !== businessUid) return { ok: false, status: 403, error: 'Enter your register PIN to continue.', code: 'PIN_REQUIRED' };
    const perms = registerPermissionsFor(sess.role, sess.perms);
    if (!perms.has(perm)) return { ok: false, status: 403, error: 'Your role cannot do that at the register.', code: 'FORBIDDEN' };
    return { ok: true, staffId: sess.sid, staffName: sess.name, role: sess.role, perms };
  };
  /** Manager override for gated actions: a manager/owner PIN typed at the register. */
  const managerApproval = async (businessUid: string, pin: any): Promise<{ id: string; name: string } | null> => {
    if (!isValidPin(String(pin || ''))) return null;
    const key = `mgr:${businessUid}`;
    if (pinGuard(key)) return null;
    const m = await matchStaffPin(businessUid, String(pin), true);
    pinNote(key, !!m);
    return m ? { id: m.id, name: m.name } : null;
  };

  // ── TICKET ENGINE (services/ticketServer.ts): /api/tickets/*, public /t/:token, and the pos-sale hooks ──
  registerTicketRoutes({
    app, express, rateLimit, authMiddleware,
    resolveActor: resolveRegisterActor, managerApproval, restCas,
    fsQueryDocs, firestoreRead, firestoreGetDeep, firestoreCreate, sendFcmMulticast,
    loadRegisterSettings, applyStockSale,
  } as any);
  // ── LAUNDROMAT layer (services/laundryServer.ts): settings, commercial accounts, invoices, schedules, reminders ──
  registerLaundryRoutes({
    app, express, authMiddleware, resolveActor: resolveRegisterActor, restCas,
    fsQueryDocs, firestoreRead, firestoreWrite, firestoreGetDeep, firestoreCreate, sendFcmMulticast, loadRegisterSettings,
  } as any);
  // AUTO REPAIR layer (services/autoServer.ts): vehicles, NHTSA decode/recalls, inspections, AI advisor draft, reminders, Vehicle Passport.
  registerAutoRoutes({
    app, express, rateLimit, authMiddleware,
    resolveActor: resolveRegisterActor, managerApproval, restCas,
    fsQueryDocs, firestoreRead, firestoreGetDeep, firestoreCreate, sendFcmMulticast,
  } as any);

  app.post('/api/register/pin-login', authMiddleware, express.json(), async (req: any, res) => {
    try {
      const { businessUid, pin } = req.body || {};
      if (!businessUid || !isValidPin(String(pin || ''))) return res.status(400).json({ error: 'Enter your PIN.' });
      const key = `login:${businessUid}`;
      if (pinGuard(key)) return res.status(429).json({ error: 'Too many wrong PINs. Try again in a few minutes.', code: 'LOCKED' });
      const m = await matchStaffPin(String(businessUid), String(pin));
      pinNote(key, !!m);
      if (!m) return res.status(401).json({ error: 'That PIN was not recognised.' });
      const exp = Date.now() + SESSION_TTL_MS;
      const token = signSession({ b: String(businessUid), sid: m.id, name: m.name, role: m.role, perms: m.perms, exp });
      res.json({ token, expiresAt: exp, staff: { id: m.id, name: m.name, role: m.role, permissions: [...registerPermissionsFor(m.role, m.perms)] } });
    } catch (err: any) { console.error('/api/register/pin-login', err?.message || err); res.status(500).json({ error: 'Could not sign in.' }); }
  });

  // Owner sets a staff PIN: exactly 6 digits, stored ONLY as a salted scrypt hash in staffSecrets.
  app.post('/api/register/set-pin', authMiddleware, express.json(), async (req: any, res) => {
    try {
      const { staffId, pin } = req.body || {};
      const businessUid: string = req.uid;
      if (!staffId || !isValidNewPin(String(pin || ''))) return res.status(400).json({ error: 'PIN must be exactly 6 digits.' });
      const [staff, secrets] = await Promise.all([fsListSub(`businesses/${businessUid}`, 'staff', 100), pinSecrets(businessUid)]);
      if (!staff.some(s => s.id === staffId)) return res.status(404).json({ error: 'Staff member not found.' });
      for (const [id, sec] of secrets) if (id !== staffId && verifyPin(String(pin), sec)) return res.status(409).json({ error: 'Another team member already uses that PIN.' });
      const h = hashPin(String(pin));
      await firestoreWrite(`businesses/${businessUid}/staffSecrets`, String(staffId), { pinHash: h.hash, pinSalt: h.salt, updatedAt: Date.now() }, true);
      await firestoreWrite(`businesses/${businessUid}/staff`, String(staffId), { hasPin: true }, true);
      res.json({ ok: true });
    } catch (err: any) { console.error('/api/register/set-pin', err?.message || err); res.status(500).json({ error: 'Could not save PIN.' }); }
  });

  // Time clock by PIN, verified server-side against the hash with the SAME lockout as the register login.
  app.post('/api/register/clock', authMiddleware, express.json(), async (req: any, res) => {
    try {
      const { businessUid, pin, direction } = req.body || {};
      if (!businessUid || !isValidPin(String(pin || '')) || !['IN', 'OUT'].includes(String(direction))) return res.status(400).json({ error: 'Enter your PIN.' });
      const b = String(businessUid);
      const actor = await resolveRegisterActor(req, b, 'RING_SALES');
      if (actor.ok === false) return res.status(actor.status).json({ error: actor.error, code: actor.code });
      const key = `login:${b}`;
      if (pinGuard(key)) return res.status(429).json({ error: 'Too many wrong PINs. Try again in a few minutes.', code: 'LOCKED' });
      const m = await matchStaffPin(b, String(pin));
      pinNote(key, !!m);
      if (!m) return res.status(401).json({ error: 'PIN not recognised.' });
      if (direction === 'IN') {
        // create-once marker = atomic "already clocked in" guard (works across instances)
        const mark = await firestoreCreateOnce(`businesses/${b}/shiftOpen`, m.id, { staffId: m.id, at: Date.now() });
        if (mark === 'exists') return res.status(409).json({ error: `${m.name} is already clocked in.` });
        if (mark === 'error') return res.status(503).json({ error: 'Could not clock in.' });
        const shiftId = `sh_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const made = await firestoreCreateOnce(`businesses/${b}/shifts`, shiftId, { businessUid: b, staffId: m.id, staffName: m.name, clockIn: Date.now() });
        if (made !== 'created') { await firestoreDeleteDoc(`businesses/${b}/shiftOpen`, m.id); return res.status(503).json({ error: 'Could not clock in.' }); }
        return res.json({ shiftId, staffName: m.name });
      }
      const shifts = await fsListSub(`businesses/${b}`, 'shifts', 400);
      const open = shifts.filter(s => s.data.staffId === m.id && !s.data.clockOut).sort((a, c) => c.data.clockIn - a.data.clockIn)[0];
      if (!open) return res.status(409).json({ error: `${m.name} has no open shift.` });
      const now = Date.now();
      await firestoreWrite(`businesses/${b}/shifts`, open.id, { clockOut: now }, true);
      await firestoreDeleteDoc(`businesses/${b}/shiftOpen`, m.id);
      res.json({ staffName: m.name, hours: (now - Number(open.data.clockIn) - (Number(open.data.breakMinutes) || 0) * 60000) / 3600000 });
    } catch (err: any) { console.error('/api/register/clock', err?.message || err); res.status(500).json({ error: 'Clock request failed.' }); }
  });

  const LOYALTY_PTS_PER_DOLLAR = 1;
  app.post('/api/store/pos-sale', authMiddleware, express.json({ limit: '256kb' }), async (req: any, res) => {
    let ticketPrep: any = null; let ticketOrderId = '';   // ticket payment (ticketServer hooks)
    try {
      const { businessUid, tender, customerUid } = req.body || {};
      const items: any[] = Array.isArray(req.body?.items) ? req.body.items : [];
      const giftReqRaw: any[] = Array.isArray(req.body?.giftCards) ? req.body.giftCards : [];
      const redeemPointsReq = Math.max(0, Math.floor(Number(req.body?.redeemPoints) || 0));
      const ticketId = req.body?.ticketId ? String(req.body.ticketId) : '';
      if (!businessUid || (!items.length && !giftReqRaw.length && !ticketId)) return res.status(400).json({ error: 'businessUid and items required.' });
      const actor = await resolveRegisterActor(req, businessUid, 'RING_SALES');
      if (actor.ok === false) return res.status(actor.status).json({ error: actor.error, code: actor.code });
      const hasCustomer = !!customerUid && customerUid !== 'walkin';

      const priced = items.length ? await priceStoreLines(items, businessUid, { allowInactive: true, ignoreStock: true }) : { ok: true as const, lines: [] as any[], products: new Map<string, any>(), subtotalCents: 0 };
      if (priced.ok === false) return res.status(priced.status).json({ error: priced.error, code: priced.code });
      let pricedAll: any = priced;
      if (ticketId) {   // ticket lines are loaded + priced SERVER-side from the ticket (client never sends prices)
        const tp = await ticketSaleHooks.prepare(String(businessUid), ticketId);
        if (tp.ok === false) return res.status(tp.status).json({ error: tp.error, code: tp.code });
        ticketPrep = tp.prep; pricedAll = ticketSaleHooks.merge(priced as any, ticketPrep);
      }
      const { lines, products, subtotalCents } = pricedAll;
      const settings = await loadRegisterSettings(businessUid);

      // Age-restricted items: the cashier must have confirmed an ID check (recorded on the order).
      const ageMin = lines.reduce((m: number, l: any) => Math.max(m, Math.floor(Number(products.get(l.productId)?.ageRestricted) || 0)), 0);
      if (ageMin > 0 && req.body?.ageVerified !== true) return res.status(409).json({ error: `Verify ID - customer must be ${ageMin}+.`, code: 'AGE_VERIFY', ageMin });

      // AUTO offer: re-evaluated here from the business's real offers - the client's number is never trusted,
      // so it cannot be used to smuggle an ungated discount.
      const offerDocs = await fsListSub(`businesses/${businessUid}`, 'offers', 50);
      const offers: BusinessOffer[] = offerDocs.map(d => ({ ...(d.data as any), id: d.id }));
      const offerCents = Math.min(subtotalCents, bestOffer(offers, subtotalCents, hasCustomer)?.discountCents || 0);
      // Loyalty redemption (1 pt = 1c) - VALIDATED against the real balance.
      let balance = 0;
      if (hasCustomer) {
        const loyalty = await firestoreRead(`businesses/${businessUid}/loyalty`, String(customerUid));
        balance = Math.max(0, Number(loyalty?.points || 0));
      }
      const redeemCents = hasCustomer ? Math.min(redeemPointsReq, balance, Math.max(0, subtotalCents - offerCents)) : 0;
      // MANUAL discount (cashier-entered % or $): beyond the owner's limit it needs DISCOUNT_OVERRIDE or a manager PIN.
      const dc = composeDiscounts({ subtotalCents, offerCents, redeemCents, manual: req.body?.manualDiscount, limitPct: settings.discountLimitPct });
      let discountApprovedBy = '';
      if (dc.overLimit && !actor.perms.has('DISCOUNT_OVERRIDE')) {
        const mgr = await managerApproval(String(businessUid), req.body?.managerPin);
        if (!mgr) return res.status(403).json({ error: `Discounts over ${settings.discountLimitPct}% need a manager PIN.`, code: 'DISCOUNT_PIN', limitPct: settings.discountLimitPct });
        discountApprovedBy = mgr.name;
      }
      const manualCents = dc.manualCents;
      const discountTotal = dc.totalCents;

      // TAX + SNAP, computed SERVER-side. Max SNAP = eligible subtotal after the basket discount; the
      // requested SNAP tender decides how much of the eligible part is tax-free.
      const tIn = taxInputs(lines, products);
      const snapMaxCents = computeTax(tIn, settings.tax, { discountCents: discountTotal, snapCents: Number.MAX_SAFE_INTEGER }).snapCoveredCents;
      const rawTenders: any[] = Array.isArray(req.body?.tenders) ? req.body.tenders : [];
      const snapReq = rawTenders.filter(t => String(t?.type).toUpperCase() === 'EXTERNAL' && String(t?.kind).toUpperCase() === 'EBT_SNAP').reduce((n, t) => n + Math.max(0, Math.round(Number(t?.amountCents) || 0)), 0);
      const taxed = computeTax(tIn, settings.tax, { discountCents: discountTotal, snapCents: snapReq });
      const totalCents = taxed.totalCents;
      const tipCents = sanitizeTip(req.body?.tipCents);
      // Gift cards on the ticket: a LIABILITY line - not taxed, no stock, not SNAP-eligible, not revenue, no discounts.
      const svCfg = await svSettings(String(businessUid));
      const gp = svParseGiftLines(giftReqRaw, svCfg.limits);
      if (gp.ok === false) return res.status(400).json({ error: gp.error, code: 'GIFT' });
      const giftSoldCents = gp.gifts.reduce((n, g) => n + g.cents, 0);
      const creditCents = ticketPrep ? ticketSaleHooks.credit(ticketPrep, totalCents) : 0;   // ticket deposits already collected
      const dueCents = totalCents + tipCents + giftSoldCents - creditCents;

      // Tenders: legacy single `tender` string = pay it all that way (cash unless CARD).
      const tv: any = ticketPrep && dueCents === 0 ? { ok: true, tenders: [], cashCents: 0, snapCents: 0, changeCents: 0 } : validateTenders(rawTenders.length ? rawTenders : [{ type: tender === 'CARD' ? 'CARD' : 'CASH', amountCents: dueCents }], dueCents, { snapMaxCents, storedValueMaxCents: dueCents - giftSoldCents });
      if (tv.ok === false) return res.status(400).json({ error: tv.error, code: 'TENDER', snapMaxCents, totalCents, dueCents });
      if (creditCents > 0) tv.tenders.unshift({ type: 'EXTERNAL', kind: 'OTHER', amountCents: creditCents, reference: 'DEPOSIT' });

      const orderId = `pos_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      // Stored value FIRST (redeem via CAS, idempotency key tied to this sale), so a short/void card fails before anything else
      // is written. Anything that fails later restores the redemptions and voids the just-issued cards.
      const bId = String(businessUid);
      const svDone: { cardId: string; key: string; cents: number }[] = [];
      const svIssued: string[] = [];
      const rollbackSv = async () => {
        for (const d of svDone) await svApply(bId, d.cardId, { type: 'REFUND_RESTORE', idemKey: `rb_${d.key}`, amountCents: d.cents, ref: orderId, reason: 'sale rolled back' }, svCfg).catch(() => {});
        for (const id of svIssued) await svApply(bId, id, { type: 'VOID', idemKey: `rbv_${id}`, reason: 'sale rolled back' }, svCfg).catch(() => {});
      };
      const tendersOut: any[] = [];
      for (let i = 0; i < tv.tenders.length; i++) {
        const t = tv.tenders[i];
        if (!isStoredValueTender(t)) { tendersOut.push(t); continue; }
        const rt = await svResolveTender(bId, t, hasCustomer ? String(customerUid) : null);
        if (rt.ok === false) { await rollbackSv(); return res.status(400).json({ error: rt.error, code: 'STORED_VALUE' }); }
        const key = `sale_${orderId}_${i}`;
        const rr = await svApply(bId, rt.cardId, { type: 'REDEEM', idemKey: key, amountCents: t.amountCents, ref: orderId, by: actor.staffId, byName: actor.staffName }, svCfg);
        if (rr.ok === false) { await rollbackSv(); return res.status(rr.code === 'CONFLICT' ? 409 : 400).json({ error: rr.code === 'NOT_FOUND' || rr.code === 'VOID' || rr.code === 'EXPIRED' ? 'That card is not valid.' : rr.error, code: 'STORED_VALUE', balanceCents: rr.balanceCents }); }
        svDone.push({ cardId: rt.cardId, key, cents: t.amountCents });
        tendersOut.push({ type: t.type, amountCents: t.amountCents, cardId: rt.cardId, cardLast4: rr.last4, balanceCents: rr.balanceCents });   // raw code never stored
      }
      const giftOut: { cardId: string; code: string | null; last4: string; amountCents: number; emailed: boolean }[] = [];
      for (let i = 0; i < gp.gifts.length; i++) {
        const g = gp.gifts[i];
        const ir = await svIssueCoded(bId, { kind: 'GIFT', cents: g.cents, cardId: `gc_${orderId}_${i}`, idemKey: `iss_${orderId}_${i}`, ref: orderId, by: actor.staffId, byName: actor.staffName, recipientEmail: g.email, recipientName: g.name });
        if (ir.ok === false) { await rollbackSv(); return res.status(500).json({ error: ir.error, code: 'GIFT' }); }
        svIssued.push(ir.cardId);
        giftOut.push({ cardId: ir.cardId, code: ir.code, last4: ir.last4, amountCents: g.cents, emailed: false });
      }
      // Points are earned on the pre-tax amount actually paid (stored so a refund can claw back proportionally).
      const pointsEarned = hasCustomer ? Math.round(((subtotalCents - discountTotal) / 100) * LOYALTY_PTS_PER_DOLLAR) : 0;
      const itemsJson = lines.map((l: any, i: number) => {
        const t = taxed.lines[i], p = products.get(l.productId) || {};
        return { productId: l.productId, variantId: l.variantId || null, title: l.title, qty: l.qty, unitAmount: l.unitAmount, variantName: l.variantName || null,
          discountCents: t.discountCents, netCents: t.netCents, taxCents: t.taxCents, chargeCents: t.chargeCents, rateBps: t.rateBps,
          taxClass: normalizeTaxClass(p.taxClass), snapEligible: !!p.snapEligible, snapCoveredCents: t.snapCoveredCents };
      });
      if (ticketPrep) {   // CAS-claim the ticket BEFORE writing the order so two registers cannot both charge it
        ticketOrderId = orderId;
        if (!(await ticketSaleHooks.claim(ticketPrep, orderId, actor.staffName))) { ticketOrderId = ''; await rollbackSv(); return res.status(409).json({ error: 'This ticket was just paid or changed. Reload it.', code: 'TICKET_CLAIM' }); }
      }
      const ebt = tv.tenders.filter((t: any) => t.type === 'EXTERNAL' && (t.kind === 'EBT_SNAP' || t.kind === 'EBT_CASH'));
      await firestoreWrite('storeOrders', orderId, {
        businessUid, customerUid: customerUid || 'walkin',
        buyerId: customerUid || 'walkin', sellerId: businessUid,
        items: JSON.stringify(itemsJson),
        subtotalCents,
        offerDiscountCents: offerCents, redeemCents, manualDiscountCents: manualCents, discountApprovedBy, discountCents: discountTotal,
        taxCents: taxed.taxCents, taxInclusive: !!settings.tax.inclusive, tipCents, totalCents, paidCents: dueCents,
        snapCents: tv.snapCents, snapMaxCents, pointsEarned,
        tenders: JSON.stringify(tendersOut),
        storedValueSoldCents: giftSoldCents, giftCardsSold: JSON.stringify(giftOut.map(g => ({ cardId: g.cardId, last4: g.last4, amountCents: g.amountCents }))),
        tender: tv.tenders.length > 1 ? 'SPLIT' : (tv.tenders[0].type === 'EXTERNAL' ? String(tv.tenders[0].kind) : tv.tenders[0].type),
        ebtReference: ebt.map(t => t.reference).filter(Boolean).join(','),
        staffId: actor.staffId, staffName: actor.staffName,
        ageVerified: ageMin > 0, ageMin,
        source: 'POS', ...(ticketPrep ? ticketSaleHooks.orderFields(ticketPrep, creditCents) : {}),
        fulfillment: 'PICKUP', status: 'CONFIRMED', createdAt: Date.now(), paidAt: Date.now(),
      }, true).catch(async (e: any) => { await rollbackSv(); throw e; });
      // Gift-card emails (best effort; the code is also in this response, once).
      for (let i = 0; i < giftOut.length; i++) { const g = gp.gifts[i]; if (g.email && giftOut[i].code) giftOut[i].emailed = await svEmailGift({ to: g.email, businessName: String(req.body?.businessName || 'our shop').slice(0, 80), code: giftOut[i].code!, amountCents: g.cents, recipientName: g.name, message: g.message }); }
      // Decrement stock atomically + write the ledger (flags the order if the count went negative).
      ticketOrderId = '';   // order is written: never release the ticket claim after this point
      const oversold = await applyStockSale(lines.filter((l: any) => !String(l.productId).startsWith('tkt:')), { orderId, sellerId: businessUid, reason: 'POS_SALE', by: actor.staffId });
      if (oversold) await firestoreWrite('storeOrders', orderId, { oversold: true }).catch(() => {});

      // Loyalty: award points, DEDUCT redeemed points - a single net increment.
      if (hasCustomer) {
        const net = pointsEarned - redeemCents; // redeemCents == points spent (1pt=1c)
        if (net !== 0) {
          await firestoreIncrement(`businesses/${businessUid}/loyalty/${customerUid}`, { points: net }, { customerUid, businessUid, updatedAt: Date.now() }).catch(() => {});
        }
      }
      if (ticketPrep) await ticketSaleHooks.finalize(ticketPrep, orderId, { paidCents: dueCents, by: actor.staffName, creditCents });
      res.json({ orderId, subtotalCents, offerDiscountCents: offerCents, redeemCents, manualDiscountCents: manualCents, discountCents: discountTotal, taxCents: taxed.taxCents, tipCents, totalCents, paidCents: dueCents, tenders: tendersOut, giftCards: giftOut, storedValueSoldCents: giftSoldCents, changeCents: tv.changeCents, snapCents: tv.snapCents, lines: itemsJson, staffName: actor.staffName, pointsEarned, oversold });
    } catch (err: any) {
      if (ticketPrep && ticketOrderId) await ticketSaleHooks.release(ticketPrep, ticketOrderId).catch(() => {});
      console.error('/api/store/pos-sale', err?.message || err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── POS refund / return ───────────────────────────────────────────────────────────────────────
  // CONCURRENCY: the already-refunded state (`refundLog`) lives ON THE ORDER DOC and is updated with a
  // compare-and-swap (restCas + refundCore.commitRefund), so two simultaneous refunds cannot both pass the paid
  // amount; the loser re-reads and is re-planned. Same `idempotencyKey` = same refund id = no-op replay.
  // After the CAS commit, side effects are each idempotent so a crash/retry converges: refund doc (create-once),
  // restock (create-once ledger id per line), loyalty clawback (refund id recorded on the loyalty doc).
  const jparse = (v: any, d: any) => { try { return typeof v === 'string' ? JSON.parse(v) : (v ?? d); } catch { return d; } };

  app.post('/api/store/pos-refund', authMiddleware, express.json({ limit: '64kb' }), async (req: any, res) => {
    try {
      const { businessUid, orderId, lines, method, reason, note, managerPin, idempotencyKey } = req.body || {};
      if (!businessUid || !orderId || !Array.isArray(lines)) return res.status(400).json({ error: 'businessUid and orderId and lines required.' });
      const b = String(businessUid);
      const actor = await resolveRegisterActor(req, b, 'RING_SALES');
      if (actor.ok === false) return res.status(actor.status).json({ error: actor.error, code: actor.code });
      const m: RefundMethod = method === 'CASH' ? 'CASH' : method === 'STORE_CREDIT' ? 'STORE_CREDIT' : 'ORIGINAL';
      const why: RefundReason = (REFUND_REASONS as readonly string[]).includes(String(reason)) ? reason : 'OTHER';
      const key = String(idempotencyKey || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60) || `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
      const refundId = `rf_${key}`;
      const orders = restCas('storeOrders');

      // Preflight: size the refund against the current state to decide whether a manager must approve.
      const settings = await loadRegisterSettings(b);
      const cur = await orders.get(String(orderId));
      if (!cur || cur.data.sellerId !== b) return res.status(404).json({ error: 'Order not found.' });
      const pre = planFromOrderDoc(cur.data, { lines, method: m });
      let approvedBy = '';
      if (pre.ok && !refundLogOf(cur.data).some(e => e.id === refundId)) {
        const needs = !actor.perms.has('REFUND') || (refundNeedsManager(pre.plan.amountCents, settings.refundApprovalCents) && !canApprove(actor.role));
        if (needs) {
          const mgr = await managerApproval(b, managerPin);
          if (!mgr) return res.status(403).json({ error: actor.perms.has('REFUND') ? `Refunds of $${(settings.refundApprovalCents / 100).toFixed(2)} or more need a manager PIN.` : 'A manager PIN is needed to approve this refund.', code: 'MANAGER_PIN' });
          approvedBy = mgr.name;
        }
      }
      const approved = !!approvedBy || canApprove(actor.role);
      const committed = await commitRefund(orders, String(orderId), {
        refundId, lines, method: m, sellerId: b,
        gate: plan => (!actor.perms.has('REFUND') || refundNeedsManager(plan.amountCents, settings.refundApprovalCents)) && !approved
          ? { ok: false, error: 'A manager PIN is needed to approve this refund.', code: 'MANAGER_PIN' } : { ok: true },
      });
      if (committed.ok === false) return res.status(committed.code === 'MANAGER_PIN' ? 403 : committed.code === 'CONFLICT' ? 409 : committed.code === 'ERROR' ? 503 : 400).json({ error: committed.error, code: committed.code });
      const { entry } = committed;

      // 1) refund record (create-once)
      await firestoreCreateOnce('storeRefunds', refundId, {
        businessUid: b, sellerId: b, orderId: String(orderId), amountCents: entry.amountCents, taxCents: entry.taxCents,
        method: m, reason: why, note: String(note || '').slice(0, 300),
        lines: JSON.stringify(entry.lines), allocations: JSON.stringify(entry.allocations),
        staffId: actor.staffId, staffName: actor.staffName, approvedBy, createdAt: entry.at,
      });
      // 2) restock through the ledger (create-once id per refund line)
      let restocked = 0;
      const order = cur.data;
      const orderLines = orderLinesFromDoc(order);
      for (const rl of entry.lines.filter(l => l.restock)) {
        try {
          const ol = orderLines[rl.index]; if (!ol) continue;
          const p = await loadStoreProduct(ol.productId);
          if (!p || p.sellerId !== b) continue;
          const moveId = restockMoveId(refundId, ol.productId, ol.variantId);
          const tracked = isTrackedInventory(p);
          const before = ol.variantId && p.variants?.length ? Number(p.variantStock?.[ol.variantId] ?? (p.variants.find((v: any) => v.id === ol.variantId)?.stock ?? 0)) : Number(p.stock ?? 0);
          const claimMove = await firestoreCreateOnce('stockMoves', moveId, { sellerId: b, productId: ol.productId, productTitle: String(p.title || ''), ...(ol.variantId ? { variantId: ol.variantId } : {}), delta: tracked ? rl.qty : 0, before, after: tracked ? before + rl.qty : before, reason: 'RETURN', orderId: String(orderId), refundId, by: actor.staffId, at: Date.now() });
          if (claimMove !== 'created') continue;
          const inc: Record<string, number> = { soldCount: -rl.qty };
          if (tracked) { inc.stock = rl.qty; if (ol.variantId && p.variants?.length && isSafeVariantIdInventory(ol.variantId)) inc[`variantStock.${ol.variantId}`] = rl.qty; }
          const seed = tracked ? variantStockSeedInventory(p) : null;
          if (seed) await firestorePatchDeep('storeProducts', ol.productId, { variantStock: seed });
          const ok = await firestoreIncrement(`storeProducts/${ol.productId}`, inc);
          if (!ok) await firestoreDeleteDoc('stockMoves', moveId); else restocked++;
        } catch (e: any) { console.error('[refund] restock failed', e?.message || e); }
      }
      // 2b) stored value: STORE_CREDIT issues credit; stored-value tenders return to their ORIGINAL card. Each op has a
      // deterministic idempotency key, so a retried refund converges instead of double-crediting.
      const credits: { kind: string; cardId: string; last4: string; amountCents: number; code: string | null; restoredToOriginal: boolean }[] = [];
      try {
        const origTenders = parseTenders(order.tenders, order.tender, Math.round(Number(order.paidCents ?? order.totalCents) || 0));
        const custUid = String(order.customerUid || '');
        const hasCust = !!custUid && custUid !== 'walkin';
        for (let ai = 0; ai < entry.allocations.length; ai++) {
          const al = entry.allocations[ai];
          const key = `rf_${refundId}_${ai}`;
          if (typeof al.tenderIndex === 'number' && isStoredValueTender(al.type)) {
            const cardId = (origTenders[al.tenderIndex] as any)?.cardId;
            const rr = cardId ? await svApply(b, String(cardId), { type: 'REFUND_RESTORE', idemKey: key, amountCents: al.amountCents, ref: refundId, by: actor.staffId, byName: actor.staffName }) : null;
            if (rr && rr.ok === true) { credits.push({ kind: rr.kind, cardId: String(cardId), last4: rr.last4, amountCents: al.amountCents, code: null, restoredToOriginal: true }); continue; }
            // original card voided/expired/missing: fall through to fresh store credit
          } else if (al.type !== 'STORE_CREDIT') continue;
          if (hasCust) {
            const cr = await svCustomerCard(b, 'CREDIT', custUid, { cents: al.amountCents, idemKey: key, ref: refundId, reason: 'refund to store credit', by: actor.staffId, byName: actor.staffName });
            if (cr.ok === true) { credits.push({ kind: 'CREDIT', cardId: cr.cardId, last4: cr.last4, amountCents: al.amountCents, code: null, restoredToOriginal: false }); continue; }
          }
          const ic = await svIssueCoded(b, { kind: 'CREDIT', cents: al.amountCents, cardId: `cr_${refundId}_${ai}`.slice(0, 120), idemKey: key, ref: refundId, reason: 'refund to store credit', by: actor.staffId, byName: actor.staffName });
          if (ic.ok === true) credits.push({ kind: 'CREDIT', cardId: ic.cardId, last4: ic.last4, amountCents: al.amountCents, code: ic.code, restoredToOriginal: false });
          else console.error('[refund] store credit failed', refundId, ic.error);
        }
        if (credits.length) await firestoreWrite('storeRefunds', refundId, { credits: JSON.stringify(credits.map(c => ({ ...c, code: null }))) }).catch(() => {});
      } catch (e: any) { console.error('[refund] stored value failed', e?.message || e); }
      // 3) loyalty clawback: cumulative-proportional, never below zero, idempotent per refund id
      let pointsRequested = 0, pointsClawed = 0;
      const cust = String(order.customerUid || '');
      if (cust && cust !== 'walkin' && Number(order.pointsEarned) > 0) {
        pointsRequested = clawbackPoints({
          earnedPoints: Number(order.pointsEarned), orderNetCents: Math.max(0, (Number(order.subtotalCents) || 0) - (Number(order.discountCents) || 0)),
          priorRefundNetCents: committed.priorNetCents, thisRefundNetCents: entry.amountCents - entry.taxCents,
        });
        if (pointsRequested > 0) {
          const out = await casUpdate<number>(restCas(`businesses/${b}/loyalty`), cust, curL => {
            const applied: string[] = jparse(curL?.clawedRefunds, []);
            if (applied.includes(refundId)) return { abort: true, result: -1 };       // already applied on an earlier attempt
            const { newBalance, clawed } = applyClawback(Number(curL?.points) || 0, pointsRequested);
            return { patch: { points: newBalance, clawedRefunds: JSON.stringify([...applied, refundId].slice(-100)), updatedAt: Date.now() }, result: clawed };
          });
          pointsClawed = out.ok ? out.result : 0;
        }
        await firestoreWrite('storeRefunds', refundId, { pointsRequested, pointsClawed }).catch(() => {});
      }
      res.json({ ok: true, refundId, duplicate: committed.duplicate, amountCents: entry.amountCents, taxCents: entry.taxCents, allocations: entry.allocations, restocked, fullyRefunded: committed.fullyRefunded, approvedBy, pointsClawed, credits });
    } catch (err: any) { console.error('/api/store/pos-refund', err?.message || err); res.status(500).json({ error: 'Refund failed.' }); }
  });

  // ── Cash drawer + end of day ──────────────────────────────────────────────────────────────────
  // businesses/{b}/drawerSessions/{id}: server-written. CONCURRENCY: "only one open drawer" is a CAS on the
  // pointer doc businesses/{b}/drawerState/current; every movement and the close are CAS writes on the session
  // doc, so a movement racing a close forces the close to recompute its Z report from the new movements.
  const loadZInputs = async (businessUid: string, from: number, to: number) => {
    const [os, rs] = await Promise.all([sellerDocs('storeOrders', businessUid), sellerDocs('storeRefunds', businessUid)]);
    return {
      orders: os.filter((o: any) => o.source === 'POS').map(normalizeOrderZ).filter(o => o.createdAt >= from && o.createdAt <= to),
      refunds: rs.map(normalizeRefundZ).filter(r => r.createdAt >= from && r.createdAt <= to),
    };
  };
  const drawerView = (id: string, d: Record<string, any>) => ({ id, openedAt: d.openedAt, openedByName: d.openedByName, startFloatCents: d.startFloatCents, movements: jparse(d.movements, []), status: d.status });
  const currentDrawer = async (b: string) => {
    const ptr = await restCas(`businesses/${b}/drawerState`).get('current');
    const id = ptr?.data.openId ? String(ptr.data.openId) : '';
    if (!id) return null;
    const s = await restCas(`businesses/${b}/drawerSessions`).get(id);
    return s && s.data.status === 'OPEN' ? { id, data: s.data } : null;
  };

  app.post('/api/register/drawer', authMiddleware, express.json({ limit: '32kb' }), async (req: any, res) => {
    try {
      const { businessUid, action } = req.body || {};
      if (!businessUid) return res.status(400).json({ error: 'businessUid required.' });
      const b = String(businessUid);
      const need: RegisterPermission = action === 'close' ? 'CLOSE_DRAWER' : 'RING_SALES';
      const actor = await resolveRegisterActor(req, b, need);
      if (actor.ok === false) return res.status(actor.status).json({ error: actor.error, code: actor.code });
      const sessions = restCas(`businesses/${b}/drawerSessions`), pointer = restCas(`businesses/${b}/drawerState`);
      const cur = await currentDrawer(b);

      if (action === 'status') {
        if (!cur) return res.json({ open: null });
        const body: any = { open: drawerView(cur.id, cur.data) };
        if (actor.perms.has('VIEW_REPORTS')) {
          const z = await loadZInputs(b, cur.data.openedAt, Date.now());
          body.z = buildZReport(z.orders, z.refunds, jparse(cur.data.movements, []), cur.data.startFloatCents, { from: cur.data.openedAt, to: Date.now() });
        }
        return res.json(body);
      }
      if (action === 'open') {
        const startFloatCents = Math.max(0, Math.min(100_000_000, Math.round(Number(req.body?.startFloatCents) || 0)));
        const id = `ds_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const now = Date.now();
        // Win the pointer first (CAS) - only one concurrent open can succeed; then create the session.
        const won = await casUpdate<string>(pointer, 'current', async p => {
          const existing = p?.openId ? await sessions.get(String(p.openId)) : null;
          if (existing && existing.data.status === 'OPEN') return { abort: true, result: 'OPEN' };
          return { patch: { openId: id }, result: 'WON' };
        });
        if (won.ok === false) return res.status(won.reason === 'ABORT' ? 409 : 503).json({ error: won.reason === 'ABORT' ? 'A drawer is already open.' : 'Drawer is busy - try again.' });
        const made = await firestoreCreateOnce(`businesses/${b}/drawerSessions`, id, { status: 'OPEN', openedAt: now, openedBy: actor.staffId, openedByName: actor.staffName, startFloatCents, movements: '[]' });
        if (made !== 'created') { await casUpdate(pointer, 'current', () => ({ patch: { openId: '' }, result: null })); return res.status(503).json({ error: 'Could not open the drawer.' }); }
        return res.json({ open: { id, openedAt: now, openedByName: actor.staffName, startFloatCents, movements: [], status: 'OPEN' } });
      }
      if (!cur) return res.status(409).json({ error: 'Open the drawer first.' });

      if (action === 'move') {
        const mv = sanitizeMovement(req.body?.movement, Date.now(), actor.staffName);
        if (mv.ok === false) return res.status(400).json({ error: mv.error });
        if (mv.m.type !== 'PAID_IN' && !actor.perms.has('CLOSE_DRAWER') && mv.m.amountCents > 10000) return res.status(403).json({ error: 'Payouts and drops over $100 need a manager.', code: 'FORBIDDEN' });
        const out = await casUpdate<DrawerMovement[] | null>(sessions, cur.id, s => {
          if (!s || s.status !== 'OPEN') return { abort: true, result: null };
          const next: DrawerMovement[] = [...jparse(s.movements, []), mv.m];
          return { patch: { movements: JSON.stringify(next) }, result: next };
        });
        if (!out.ok || !out.result) return res.status(out.ok === false && out.reason === 'ABORT' ? 409 : 503).json({ error: 'Could not record that - the drawer may have just closed.' });
        return res.json({ open: { ...drawerView(cur.id, cur.data), movements: out.result } });
      }
      if (action === 'close') {
        const counted = Math.round(Number(req.body?.countedCents));
        if (!Number.isFinite(counted) || counted < 0) return res.status(400).json({ error: 'Enter the cash you counted.' });
        const out = await casUpdate<ZReport | null>(sessions, cur.id, async s => {
          if (!s || s.status !== 'OPEN') return { abort: true, result: null };
          const now = Date.now();
          const zi = await loadZInputs(b, s.openedAt, now);
          const z = buildZReport(zi.orders, zi.refunds, jparse(s.movements, []), s.startFloatCents, { from: s.openedAt, to: now }, counted);
          return { patch: { status: 'CLOSED', closedAt: now, closedBy: actor.staffId, closedByName: actor.staffName, countedCents: counted, expectedCents: z.cash.expectedCents, varianceCents: z.cash.varianceCents ?? 0, zReport: JSON.stringify(z) }, result: z };
        });
        if (!out.ok || !out.result) return res.status(out.ok === false && out.reason === 'ABORT' ? 409 : 503).json({ error: out.ok === false && out.reason === 'ABORT' ? 'That drawer is already closed.' : 'Could not close - try again.' });
        await casUpdate(pointer, 'current', p => (p?.openId === cur.id ? { patch: { openId: '' }, result: null } : { abort: true, result: null })).catch(() => {});
        return res.json({ closed: true, z: out.result });
      }
      res.status(400).json({ error: 'Unknown drawer action.' });
    } catch (err: any) { console.error('/api/register/drawer', err?.message || err); res.status(500).json({ error: 'Drawer request failed.' }); }
  });

  // ── Receipts: public read-only link (+ optional email) ────────────────────────────────────────
  // Token = 24 random bytes (unguessable); `posReceipts/{token}` -> { orderId }. GET /r/:token renders HTML.
  const escHtml = (s: any) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  const fmtMoney = (c: any) => `$${((Number(c) || 0) / 100).toFixed(2)}`;
  const renderReceiptHtml = (o: any, businessName: string): string => {
    const items = jparse(o.items, []) as any[];
    const tenders = parseTenders(o.tenders, o.tender, Math.round(Number(o.paidCents ?? o.totalCents) || 0));
    const rows = items.map(i => `<tr><td>${escHtml(i.qty)} x ${escHtml(i.title)}${i.variantName ? ` (${escHtml(i.variantName)})` : ''}</td><td class="r">${fmtMoney(i.chargeCents ?? i.unitAmount * i.qty)}</td></tr>`).join('');
    const tRows = tenders.map(t => `<tr><td>${escHtml(tenderLabel(t))}${t.reference ? ` <span class="m">ref ${escHtml(t.reference)}</span>` : ''}</td><td class="r">${fmtMoney(t.amountCents)}</td></tr>${typeof t.balanceCents === 'number' ? `<tr><td class="m" colspan="2">Remaining ${escHtml(tenderLabel(t))} balance: ${fmtMoney(t.balanceCents)}</td></tr>` : ''}`).join('');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Receipt - ${escHtml(businessName)}</title><style>body{font-family:ui-monospace,Menlo,monospace;background:#0a0a0f;color:#fff;margin:0;padding:24px}.c{max-width:360px;margin:0 auto;background:#15151d;border:1px solid #2a2a36;border-radius:20px;padding:20px}h1{font-size:20px;margin:0 0 4px;font-style:italic;font-weight:900}table{width:100%;border-collapse:collapse;font-size:14px}td{padding:3px 0}.r{text-align:right}.m{color:#9a9aab;font-size:12px}hr{border:0;border-top:1px dashed #3a3a4a;margin:12px 0}.t td{font-weight:800;font-size:17px}</style></head><body><div class="c"><h1>${escHtml(businessName)}</h1><div class="m">${escHtml(new Date(Number(o.createdAt) || Date.now()).toLocaleString('en-US'))}${o.staffName ? ` - served by ${escHtml(o.staffName)}` : ''}</div><hr><table>${rows}</table><hr><table><tr><td>Subtotal</td><td class="r">${fmtMoney(o.subtotalCents)}</td></tr>${Number(o.discountCents) ? `<tr><td>Discounts</td><td class="r">-${fmtMoney(o.discountCents)}</td></tr>` : ''}${Number(o.taxCents) ? `<tr><td>Tax</td><td class="r">${fmtMoney(o.taxCents)}</td></tr>` : ''}${Number(o.tipCents) ? `<tr><td>Tip</td><td class="r">${fmtMoney(o.tipCents)}</td></tr>` : ''}<tr class="t"><td>Total</td><td class="r">${fmtMoney((Number(o.totalCents) || 0) + (Number(o.tipCents) || 0))}</td></tr></table><hr><table>${tRows}</table><hr><div class="m" style="text-align:center">Thank you!</div></div></body></html>`;
  };
  app.post('/api/store/receipt-link', authMiddleware, express.json({ limit: '16kb' }), async (req: any, res) => {
    try {
      const { businessUid, orderId, businessName, email } = req.body || {};
      if (!businessUid || !orderId) return res.status(400).json({ error: 'businessUid and orderId required.' });
      const actor = await resolveRegisterActor(req, String(businessUid), 'RING_SALES');
      if (actor.ok === false) return res.status(actor.status).json({ error: actor.error, code: actor.code });
      const order = await firestoreRead('storeOrders', String(orderId));
      if (!order || order.sellerId !== businessUid) return res.status(404).json({ error: 'Order not found.' });
      let token = String(order.receiptToken || '');
      if (!token) {
        token = nodeCrypto.randomBytes(24).toString('hex');
        const made = await firestoreCreateOnce('posReceipts', token, { orderId: String(orderId), businessUid: String(businessUid), businessName: String(businessName || 'Receipt').slice(0, 80), createdAt: Date.now() });
        if (made !== 'created') return res.status(503).json({ error: 'Could not create the receipt link.' });
        await firestoreWrite('storeOrders', String(orderId), { receiptToken: token }).catch(() => {});
      }
      const url = `${trustedRequestOrigin(req)}/r/${token}`;
      let emailed = false, configured = !!process.env.RESEND_API_KEY;
      const to = String(email || '').trim();
      if (to && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to) && configured) {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: process.env.RESEND_FROM || 'Plajah <onboarding@resend.dev>', to, subject: `Your receipt from ${String(businessName || 'your purchase').slice(0, 80)}`, text: `Thanks for your purchase!\n\nView your receipt: ${url}` }),
        });
        emailed = r.ok;
      }
      res.json({ url, emailed, emailConfigured: configured });
    } catch (err: any) { console.error('/api/store/receipt-link', err?.message || err); res.status(500).json({ error: 'Could not create the receipt link.' }); }
  });
  app.get('/r/:token', async (req, res, next) => {
    try {
      const token = String(req.params.token || '');
      if (!/^[a-f0-9]{48}$/.test(token)) return next();
      const link = await firestoreRead('posReceipts', token);
      const order = link ? await firestoreRead('storeOrders', String(link.orderId)) : null;
      if (!link || !order) return res.status(404).type('html').send('<!doctype html><title>Receipt</title><p style="font-family:sans-serif;padding:24px">Receipt not found.</p>');
      res.set('Cache-Control', 'private, no-store').type('html').send(renderReceiptHtml(order, String(link.businessName || 'Receipt')));
    } catch { res.status(500).send('Could not load receipt.'); }
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // ── STORED VALUE: gift cards, store credit, prepaid wallets (services/storedValueCore) ──────────
  // businesses/{b}/storedValue/{cardId}       the card + its balance (CAS-updated; SERVER-WRITE-ONLY)
  // businesses/{b}/storedValueLedger/{id}     append-only entries, create-once id = cardId_idemKey
  // businesses/{b}/storedValueIndex/{hash}    code HASH -> cardId (server-only; no client rule). Full codes are never stored.
  // Customer-tied cards use deterministic ids (wallet w_<uid>, credit cr_<uid>) and have no code.
  // Selling a card is a LIABILITY (order.storedValueSoldCents), never revenue, never taxed, never stock.
  const svCards = (b: string): CasStore => restCas(`businesses/${b}/storedValue`);
  const svIdxPath = (b: string) => `businesses/${b}/storedValueIndex`;
  const svLedgerPath = (b: string) => `businesses/${b}/storedValueLedger`;
  const svHash = (b: string, code16: string) => nodeCrypto.createHmac('sha256', process.env.STORED_VALUE_PEPPER || `plajah-sv:${b}`).update(`${b}:${code16}`).digest('hex');
  const svSettings = async (b: string): Promise<{ limits: StoredValueLimits; expiryDays: number }> => {
    let sv: any = {};
    try { const d = await firestoreRead('businesses', b); const raw = d?.registerSettings ? (typeof d.registerSettings === 'string' ? JSON.parse(d.registerSettings) : d.registerSettings) : null; sv = raw?.storedValue || {}; } catch { /* defaults */ }
    const num = (v: any, d: number, lo: number, hi: number) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : d);
    // expiryDays: OWNER OPT-IN only (default 0 = never). Some US states restrict gift-card expiry.
    return { limits: { minIssueGiftCents: num(sv.minGiftCents, SV_DEFAULT.minIssueGiftCents, 100, 100_000), maxBalanceCents: num(sv.maxBalanceCents, SV_DEFAULT.maxBalanceCents, 1000, 1_000_000), minReloadCents: num(sv.minReloadCents, SV_DEFAULT.minReloadCents, 100, 100_000) }, expiryDays: num(sv.expiryDays, 0, 0, 3650) };
  };
  type SvOp = Omit<LedgerOp, 'now' | 'limits'>;
  /** Apply one op via CAS, then write the append-only ledger entry (create-once; replays re-write harmlessly). */
  const svApply = async (b: string, cardId: string, op: SvOp, cfg?: { limits: StoredValueLimits }): Promise<OpResult> => {
    const limits = (cfg || await svSettings(b)).limits;
    const full: LedgerOp = { ...op, now: Date.now(), limits };
    const r = await applyOp(svCards(b), cardId, full);
    if (r.ok === true) {
      const e = r.entry;
      await firestoreCreateOnce(svLedgerPath(b), ledgerEntryId(cardId, op.idemKey), {
        businessUid: b, cardId, kind: r.kind, last4: r.last4, customerUid: r.customerUid, type: e.type, deltaCents: e.deltaCents, balanceAfterCents: e.balanceAfterCents,
        at: e.at, idemKey: op.idemKey, ref: e.ref, reason: e.reason, by: e.by, byName: e.byName,
      }).catch(() => {});
    }
    return r;
  };
  /** Issue a CODED (bearer) card. Returns the full code ONCE; only the hash is stored. */
  const svIssueCoded = async (b: string, o: { kind: CardKind; cents: number; cardId?: string; idemKey: string; ref?: string; reason?: string; by?: string; byName?: string; recipientEmail?: string; recipientName?: string; customerUid?: string }): Promise<{ ok: true; duplicate: boolean; cardId: string; code: string | null; last4: string; balanceCents: number } | { ok: false; error: string; code?: string }> => {
    const cfg = await svSettings(b);
    for (let t = 0; t < 3; t++) {
      const code16 = generateCode(n => nodeCrypto.randomBytes(n));
      const hash = svHash(b, code16);
      const cardId = o.cardId || `gc_${nodeCrypto.randomBytes(9).toString('hex')}`;
      const claim = await firestoreCreateOnce(svIdxPath(b), hash, { cardId, kind: o.kind, createdAt: Date.now() });
      if (claim === 'exists') continue;
      if (claim === 'error') return { ok: false, error: 'Could not create the card. Nothing was charged.' };
      const expiresAt = o.kind === 'GIFT' && cfg.expiryDays > 0 ? Date.now() + cfg.expiryDays * 86_400_000 : undefined;
      const r = await svApply(b, cardId, { type: 'ISSUE', idemKey: o.idemKey, ref: o.ref, reason: o.reason, by: o.by, byName: o.byName,
        init: { kind: o.kind, last4: last4Of(code16), initialCents: o.cents, ...(o.customerUid ? { customerUid: o.customerUid } : {}), ...(o.recipientEmail ? { recipientEmail: o.recipientEmail } : {}), ...(o.recipientName ? { recipientName: o.recipientName } : {}), ...(expiresAt ? { expiresAt } : {}) } }, cfg);
      if (r.ok === false) { await firestoreDeleteDoc(svIdxPath(b), hash); return { ok: false, error: r.error, code: r.code }; }
      if (r.duplicate) { await firestoreDeleteDoc(svIdxPath(b), hash); return { ok: true, duplicate: true, cardId, code: null, last4: r.last4, balanceCents: r.balanceCents }; }
      return { ok: true, duplicate: false, cardId, code: formatCode(code16), last4: r.last4, balanceCents: r.balanceCents };
    }
    return { ok: false, error: 'Could not create the card. Try again.' };
  };
  /** Customer-tied wallet/credit (no code). Creates on first use. `RELOAD`/`REFUND_RESTORE` thereafter. */
  const svCustomerCard = async (b: string, kind: 'WALLET' | 'CREDIT', uid: string, o: { cents: number; idemKey: string; ref?: string; reason?: string; by?: string; byName?: string }): Promise<OpResult & { cardId: string }> => {
    const cardId = `${kind === 'WALLET' ? 'w' : 'cr'}_${uid}`.replace(/[^A-Za-z0-9_\-]/g, '').slice(0, 120);
    const cfg = await svSettings(b);
    const base = { idemKey: o.idemKey, ref: o.ref, reason: o.reason, by: o.by, byName: o.byName };
    let r = await svApply(b, cardId, { ...base, type: 'ISSUE', init: { kind, last4: uid.slice(-4).toUpperCase().padStart(4, '0'), initialCents: o.cents, customerUid: uid } }, cfg);
    if (r.ok === false && r.code === 'EXISTS' && o.cents > 0) r = await svApply(b, cardId, { ...base, type: kind === 'WALLET' ? 'RELOAD' : 'REFUND_RESTORE', amountCents: o.cents }, cfg);
    return { ...r, cardId };
  };
  const svCardByCode = async (b: string, codeIn: any): Promise<{ cardId: string; data: Record<string, any> } | null> => {
    const code16 = normalizeCode(codeIn) || 'X'.repeat(16);          // same work for malformed input
    const idx = await firestoreRead(svIdxPath(b), svHash(b, code16));
    if (!idx || !normalizeCode(codeIn)) return null;
    const c = await svCards(b).get(String(idx.cardId));
    return c ? { cardId: String(idx.cardId), data: c.data } : null;
  };
  /** Which card does this stored-value tender draw from? Generic error: never says whether a code exists. */
  const svResolveTender = async (b: string, t: Tender, customerUid: string | null): Promise<{ ok: true; cardId: string } | { ok: false; error: string }> => {
    const bad = { ok: false as const, error: 'That card is not valid.' };
    if (t.type === 'WALLET') return customerUid ? { ok: true, cardId: `w_${customerUid}`.replace(/[^A-Za-z0-9_\-]/g, '').slice(0, 120) } : { ok: false, error: 'Attach the customer to pay from their wallet.' };
    if (t.code) { const c = await svCardByCode(b, t.code); return c && c.data.kind === (t.type === 'GIFT' ? 'GIFT' : 'CREDIT') ? { ok: true, cardId: c.cardId } : bad; }
    if (t.type === 'STORE_CREDIT' && customerUid) return { ok: true, cardId: `cr_${customerUid}`.replace(/[^A-Za-z0-9_\-]/g, '').slice(0, 120) };
    return bad;
  };
  const svEmailGift = async (o: { to: string; businessName: string; code: string; amountCents: number; recipientName?: string; message?: string }): Promise<boolean> => {
    if (!process.env.RESEND_API_KEY || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(o.to)) return false;
    try {
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: process.env.RESEND_FROM || 'Plajah <onboarding@resend.dev>', to: o.to, subject: `Your ${o.businessName.slice(0, 60)} gift card`, text: giftCardEmailText({ businessName: o.businessName, code16: o.code.replace(/-/g, ''), amountCents: o.amountCents, recipientName: o.recipientName, message: o.message }) }) });
      return r.ok;
    } catch { return false; }
  };
  /** Sale-time gift lines out of the request body. */
  const svParseGiftLines = (raw: any, limits: StoredValueLimits): { ok: true; gifts: { cents: number; email?: string; name?: string; message?: string }[] } | { ok: false; error: string } => {
    const arr = Array.isArray(raw) ? raw.slice(0, 5) : [];
    const gifts: { cents: number; email?: string; name?: string; message?: string }[] = [];
    for (const g of arr) {
      const a = sanitizeIssueAmount(g?.amountCents, limits);
      if (a.ok === false) return { ok: false, error: a.error };
      if (a.cents < limits.minIssueGiftCents) return { ok: false, error: `Minimum gift card is $${(limits.minIssueGiftCents / 100).toFixed(2)}.` };
      const email = String(g?.recipientEmail || '').trim().slice(0, 120);
      gifts.push({ cents: a.cents, ...(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? { email } : {}), ...(g?.recipientName ? { name: String(g.recipientName).slice(0, 60) } : {}), ...(g?.message ? { message: String(g.message).slice(0, 300) } : {}) });
    }
    return { ok: true, gifts };
  };
  /** Online digital gift cards, issued by the Stripe webhook once paid (deterministic ids => webhook retries are safe). */
  const issueOnlineGiftCards = async (orderId: string, order: Record<string, any>): Promise<void> => {
    const b = String(order.businessUid || order.sellerId || '');
    let gifts: any[] = []; try { gifts = JSON.parse(String(order.giftCardsPending || '[]')); } catch { /* none */ }
    if (!b || !gifts.length || order.giftCardsIssued === true) return;
    const biz = await firestoreRead('businesses', b); const name = String(biz?.name || biz?.businessName || 'our shop').slice(0, 80);
    const links: string[] = [];
    for (let i = 0; i < gifts.length; i++) {
      const g = gifts[i];
      const r = await svIssueCoded(b, { kind: 'GIFT', cents: Math.round(g.cents), cardId: `gc_${orderId}_${i}`, idemKey: `iss_${orderId}_${i}`, ref: orderId, recipientEmail: g.email, recipientName: g.name, by: 'online', byName: 'Online store' });
      if (r.ok === true && r.code) {
        const to = g.email || String(order.customerEmail || '');
        const sent = to ? await svEmailGift({ to, businessName: name, code: r.code, amountCents: g.cents, recipientName: g.name, message: g.message }) : false;
        // No email service / no address: hold the code as a one-time link record the buyer can open from the order page.
        if (!sent) { const tok = nodeCrypto.randomBytes(24).toString('hex'); await firestoreCreateOnce('giftCardLinks', tok, { businessUid: b, orderId, code: r.code, amountCents: g.cents, createdAt: Date.now(), opened: false }); links.push(tok); }
      }
    }
    await firestoreWrite('storeOrders', orderId, { giftCardsIssued: true, ...(links.length ? { giftCardLinkTokens: JSON.stringify(links) } : {}) }).catch(() => {});
  };

  // Public balance check - rate limited per business+ip; always the same work and a minimum latency; every
  // failure (malformed, unknown, voided, expired) is the same 'Invalid card.' so it cannot be used to probe for codes.
  const svRate = new Map<string, RateState>();
  app.post('/api/stored-value/balance', express.json({ limit: '4kb' }), async (req: any, res) => {
    const t0 = Date.now();
    const pad = async () => { const w = 250 - (Date.now() - t0); if (w > 0) await new Promise(r => setTimeout(r, w)); };
    try {
      const b = String(req.body?.businessUid || '').slice(0, 128);
      const key = `${b}|${req.ip}`;
      const rl = rateCheck(svRate.get(key), t0, { max: 12, windowMs: 10 * 60_000 });
      svRate.set(key, rl.state);
      if (svRate.size > 5000) for (const [k, v] of svRate) if (t0 - v.windowStart > 10 * 60_000) svRate.delete(k);
      if (!rl.allowed) { await pad(); return res.status(429).json({ error: 'Too many attempts. Try again later.', code: 'RATE', retryAfterSec: Math.ceil(rl.retryAfterMs / 1000) }); }
      const c = b ? await svCardByCode(b, req.body?.code) : null;
      await pad();
      if (!c || c.data.status !== 'ACTIVE' || svIsExpired(c.data as any, Date.now())) return res.status(404).json({ error: 'Invalid card.' });
      res.json({ ok: true, kind: c.data.kind, balanceCents: Math.round(Number(c.data.balanceCents) || 0), last4: c.data.last4, ...(c.data.expiresAt ? { expiresAt: c.data.expiresAt } : {}) });
    } catch { await pad(); res.status(404).json({ error: 'Invalid card.' }); }
  });

  // Register: a customer's wallet + store credit balances (so the cashier can offer them as tenders).
  app.post('/api/stored-value/customer', authMiddleware, express.json({ limit: '4kb' }), async (req: any, res) => {
    try {
      const b = String(req.body?.businessUid || ''), uid = String(req.body?.customerUid || '').replace(/[^A-Za-z0-9_\-]/g, '');
      const actor = await resolveRegisterActor(req, b, 'RING_SALES');
      if (actor.ok === false) return res.status(actor.status).json({ error: actor.error, code: actor.code });
      if (!uid) return res.status(400).json({ error: 'customerUid required.' });
      const [w, c] = await Promise.all([svCards(b).get(`w_${uid}`), svCards(b).get(`cr_${uid}`)]);
      const pick = (x: any, id: string) => (x && x.data.status === 'ACTIVE' ? { cardId: id, balanceCents: Math.round(Number(x.data.balanceCents) || 0), last4: x.data.last4 } : null);
      res.json({ wallet: pick(w, `w_${uid}`), credit: pick(c, `cr_${uid}`) });
    } catch (err: any) { console.error('/api/stored-value/customer', err?.message || err); res.status(500).json({ error: 'Lookup failed.' }); }
  });

  // Manager gate shared by comp-issue / void / adjust: manager-or-owner role, or a manager PIN.
  const svManager = async (actor: any, b: string, pin: any): Promise<{ ok: true; name: string } | { ok: false; error: string }> => {
    if (actor.perms.has('REFUND') && canApprove(actor.role)) return { ok: true, name: actor.staffName };
    const m = await managerApproval(b, pin);
    return m ? { ok: true, name: m.name } : { ok: false, error: 'A manager PIN is needed for this.' };
  };

  // Issue WITHOUT a sale: manager comp (reason required) of a gift card / credit, or open a customer's wallet (optionally comped).
  app.post('/api/stored-value/issue', authMiddleware, express.json({ limit: '8kb' }), async (req: any, res) => {
    try {
      const b = String(req.body?.businessUid || '');
      const actor = await resolveRegisterActor(req, b, 'RING_SALES');
      if (actor.ok === false) return res.status(actor.status).json({ error: actor.error, code: actor.code });
      const kind: CardKind = req.body?.kind === 'WALLET' ? 'WALLET' : req.body?.kind === 'CREDIT' ? 'CREDIT' : 'GIFT';
      const cents = Math.round(Number(req.body?.amountCents) || 0);
      const reason = String(req.body?.reason || '').trim().slice(0, 200);
      const idem = cleanIdem(req.body?.idempotencyKey, `comp_${Date.now()}${Math.random().toString(36).slice(2, 8)}`);
      const uid = String(req.body?.customerUid || '').replace(/[^A-Za-z0-9_\-]/g, '');
      if (kind === 'WALLET') {
        if (!uid) return res.status(400).json({ error: 'Attach a customer to open a wallet.' });
        if (cents > 0) { if (!reason) return res.status(400).json({ error: 'A reason is required to comp wallet funds.' }); const m = await svManager(actor, b, req.body?.managerPin); if (m.ok === false) return res.status(403).json({ error: m.error, code: 'MANAGER_PIN' }); }
        const r = await svCustomerCard(b, 'WALLET', uid, { cents, idemKey: `wopen_${idem}`, reason: reason || 'wallet opened', by: actor.staffId, byName: actor.staffName });
        return r.ok === false ? res.status(400).json({ error: r.error, code: r.code }) : res.json({ ok: true, cardId: r.cardId, balanceCents: r.balanceCents, last4: r.last4 });
      }
      const a = sanitizeIssueAmount(cents, (await svSettings(b)).limits);
      if (a.ok === false) return res.status(400).json({ error: a.error });
      if (!reason) return res.status(400).json({ error: 'A reason is required for a comped card.' });
      const m = await svManager(actor, b, req.body?.managerPin);
      if (m.ok === false) return res.status(403).json({ error: m.error, code: 'MANAGER_PIN' });
      const email = String(req.body?.recipientEmail || '').trim().slice(0, 120);
      const out = await svIssueCoded(b, { kind, cents: a.cents, idemKey: `comp_${idem}`, reason: `comp: ${reason} (approved ${m.name})`, by: actor.staffId, byName: actor.staffName, recipientEmail: email || undefined });
      if (out.ok === false) return res.status(400).json({ error: out.error, code: out.code });
      let emailed = false;
      if (email && out.code) emailed = await svEmailGift({ to: email, businessName: String(req.body?.businessName || 'our shop').slice(0, 80), code: out.code, amountCents: a.cents });
      res.json({ ok: true, cardId: out.cardId, code: out.code, last4: out.last4, balanceCents: out.balanceCents, emailed, duplicate: out.duplicate });
    } catch (err: any) { console.error('/api/stored-value/issue', err?.message || err); res.status(500).json({ error: 'Could not issue the card.' }); }
  });

  // Reload a customer's wallet, PAID FOR with a tender (cash/card/external). Recorded as a POS order whose
  // storedValueSoldCents is the reload (liability up, not revenue).
  app.post('/api/stored-value/reload', authMiddleware, express.json({ limit: '8kb' }), async (req: any, res) => {
    try {
      const b = String(req.body?.businessUid || '');
      const actor = await resolveRegisterActor(req, b, 'RING_SALES');
      if (actor.ok === false) return res.status(actor.status).json({ error: actor.error, code: actor.code });
      const uid = String(req.body?.customerUid || '').replace(/[^A-Za-z0-9_\-]/g, '');
      if (!uid) return res.status(400).json({ error: 'Attach the customer first.' });
      const cfg = await svSettings(b);
      const a = sanitizeIssueAmount(req.body?.amountCents, cfg.limits);
      if (a.ok === false) return res.status(400).json({ error: a.error });
      const tv = validateTenders(req.body?.tenders, a.cents, { storedValueMaxCents: 0 });
      if (tv.ok === false) return res.status(400).json({ error: tv.error, code: 'TENDER' });
      const orderId = `pos_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const r = await svCustomerCard(b, 'WALLET', uid, { cents: a.cents, idemKey: `reload_${orderId}`, ref: orderId, by: actor.staffId, byName: actor.staffName });
      if (r.ok === false) return res.status(400).json({ error: r.error, code: r.code });
      try {
        await firestoreWrite('storeOrders', orderId, {
          businessUid: b, customerUid: uid, buyerId: uid, sellerId: b, items: '[]', subtotalCents: 0, discountCents: 0, taxCents: 0, tipCents: 0, totalCents: 0, paidCents: a.cents,
          storedValueSoldCents: a.cents, walletReloadCardId: r.cardId, tenders: JSON.stringify(tv.tenders), tender: tv.tenders.length > 1 ? 'SPLIT' : (tv.tenders[0].type === 'EXTERNAL' ? String(tv.tenders[0].kind) : tv.tenders[0].type),
          staffId: actor.staffId, staffName: actor.staffName, source: 'POS', fulfillment: 'PICKUP', status: 'CONFIRMED', createdAt: Date.now(), paidAt: Date.now(),
        }, true);
      } catch (e) {
        await svApply(b, r.cardId, { type: 'VOID', idemKey: `rbv_${orderId}`, reason: 'reload order failed' }).catch(() => {});   // never leave unpaid funds
        throw e;
      }
      // Top-up bonus (owner-set promo, e.g. load $50 get $5): an ADJUST ledger entry with a deterministic idempotency key,
      // so a retried reload can never pay it twice. A bonus failure never fails the (already paid) reload.
      let bonusCents = 0; let balanceAfter = r.balanceCents;
      try {
        const promo = await loadWalletPromo(firestoreRead, b); const bonus = computeTopUpBonus(promo, a.cents);
        if (bonus.bonusCents > 0) {
          const br = await svApply(b, r.cardId, { type: 'ADJUST', idemKey: bonusIdemKey(orderId), amountCents: bonus.bonusCents, ref: orderId, reason: bonus.label, by: actor.staffId, byName: actor.staffName }, cfg);
          if (br.ok === true) { bonusCents = bonus.bonusCents; balanceAfter = br.balanceCents; } else console.error('wallet bonus not applied', br.code);
        }
      } catch (e: any) { console.error('wallet bonus failed', e?.message); }
      res.json({ ok: true, orderId, cardId: r.cardId, balanceCents: balanceAfter, bonusCents, changeCents: tv.changeCents, paidCents: a.cents, tenders: tv.tenders });
    } catch (err: any) { console.error('/api/stored-value/reload', err?.message || err); res.status(500).json({ error: 'Could not reload the wallet.' }); }
  });

  // Void / adjust (manager PIN or manager role + reason; both land in the audit ledger).
  app.post('/api/stored-value/modify', authMiddleware, express.json({ limit: '8kb' }), async (req: any, res) => {
    try {
      const b = String(req.body?.businessUid || ''), cardId = String(req.body?.cardId || '').replace(/[^A-Za-z0-9_\-]/g, '');
      const actor = await resolveRegisterActor(req, b, 'VIEW_REPORTS');
      if (actor.ok === false) return res.status(actor.status).json({ error: actor.error, code: actor.code });
      const reason = String(req.body?.reason || '').trim().slice(0, 200);
      if (!cardId || !reason) return res.status(400).json({ error: 'cardId and a reason are required.' });
      const m = await svManager(actor, b, req.body?.managerPin);
      if (m.ok === false) return res.status(403).json({ error: m.error, code: 'MANAGER_PIN' });
      const idem = cleanIdem(req.body?.idempotencyKey, `m_${Date.now()}${Math.random().toString(36).slice(2, 8)}`);
      const action = req.body?.action === 'ADJUST' ? 'ADJUST' : 'VOID';
      const r = await svApply(b, cardId, { type: action, idemKey: `${action.toLowerCase()}_${idem}`, amountCents: action === 'ADJUST' ? Math.round(Number(req.body?.deltaCents) || 0) : undefined, reason: `${reason} (approved ${m.name})`, by: actor.staffId, byName: actor.staffName });
      if (r.ok === false) return res.status(r.code === 'NOT_FOUND' ? 404 : r.code === 'CONFLICT' ? 409 : 400).json({ error: r.error, code: r.code });
      res.json({ ok: true, balanceCents: r.balanceCents, duplicate: r.duplicate });
    } catch (err: any) { console.error('/api/stored-value/modify', err?.message || err); res.status(500).json({ error: 'Could not update the card.' }); }
  });

  // Back office: card list (no hashes ever) + liability report for a period.
  app.post('/api/stored-value/admin', authMiddleware, express.json({ limit: '4kb' }), async (req: any, res) => {
    try {
      const b = String(req.body?.businessUid || '');
      const actor = await resolveRegisterActor(req, b, 'VIEW_REPORTS');
      if (actor.ok === false) return res.status(actor.status).json({ error: actor.error, code: actor.code });
      const now = Date.now();
      const from = Number.isFinite(Number(req.body?.from)) ? Number(req.body.from) : now - 30 * 86_400_000, to = Number.isFinite(Number(req.body?.to)) ? Number(req.body.to) : now;
      const [cardDocs, ledDocs] = await Promise.all([fsListSub(`businesses/${b}`, 'storedValue', 1000), fsListSub(`businesses/${b}`, 'storedValueLedger', 3000)]);
      const cards = cardDocs.map(d => ({ id: d.id, kind: d.data.kind as CardKind, status: (d.data.status || 'ACTIVE') as any, balanceCents: Math.round(Number(d.data.balanceCents) || 0), initialCents: Math.round(Number(d.data.initialCents) || 0), last4: String(d.data.last4 || ''), createdAt: Number(d.data.createdAt) || 0, updatedAt: Number(d.data.updatedAt) || 0, customerUid: d.data.customerUid, recipientEmail: d.data.recipientEmail, recipientName: d.data.recipientName, expiresAt: d.data.expiresAt }));
      const ledger = ledDocs.map(d => ({ id: d.id, cardId: String(d.data.cardId), type: d.data.type, deltaCents: Math.round(Number(d.data.deltaCents) || 0), balanceAfterCents: Math.round(Number(d.data.balanceAfterCents) || 0), at: Number(d.data.at) || 0, reason: d.data.reason, ref: d.data.ref, byName: d.data.byName, last4: d.data.last4 }));
      const q = String(req.body?.q || '');
      res.json({ report: buildLiabilityReport(cards as any, ledger as any, { from, to }, now), cards: searchCards(cards as any, q).sort((a: any, b2: any) => b2.createdAt - a.createdAt).slice(0, 200),
        ledger: (req.body?.cardId ? ledger.filter(l => l.cardId === String(req.body.cardId)) : ledger.slice(-0)).sort((a, b2) => b2.at - a.at).slice(0, 100), truncated: cardDocs.length >= 1000 || ledDocs.length >= 3000 });
    } catch (err: any) { console.error('/api/stored-value/admin', err?.message || err); res.status(500).json({ error: 'Could not load stored value.' }); }
  });

  // Online: a customer buys a DIGITAL gift card from the storefront (own Stripe session; webhook issues + emails it).
  app.post('/api/stored-value/buy-online', authMiddleware, express.json({ limit: '8kb' }), async (req: any, res) => {
    try {
      const b = String(req.body?.businessUid || '');
      if (!b) return res.status(400).json({ error: 'businessUid required.' });
      const org = await firestoreRead('organizations', b);
      let acct: string | undefined = org?.stripeAccountId;
      if (!acct) { const u = await firestoreRead('users', b); acct = u?.stripeConnectAccountId; }
      if (!acct) return res.status(400).json({ error: 'This shop has not connected Stripe payouts yet.' });
      const parsed = svParseGiftLines(req.body?.giftCards, (await svSettings(b)).limits);
      if (parsed.ok === false) return res.status(400).json({ error: parsed.error });
      if (!parsed.gifts.length) return res.status(400).json({ error: 'Choose a gift card amount.' });
      const orderId = `so_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const total = parsed.gifts.reduce((s, g) => s + g.cents, 0);
      const origin = trustedRequestOrigin(req);
      const session = await getStripe().checkout.sessions.create({
        mode: 'payment', payment_method_types: ['card'], expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
        line_items: parsed.gifts.map(g => ({ price_data: { currency: 'usd', product_data: { name: 'Gift card' }, unit_amount: g.cents }, quantity: 1 })),
        payment_intent_data: { transfer_data: { destination: acct }, metadata: { type: 'store_order', orderId, businessUid: b } },
        success_url: `${origin}/?order=success`, cancel_url: `${origin}/?order=cancelled`, metadata: { type: 'store_order', orderId, businessUid: b },
      });
      await firestoreWrite('storeOrders', orderId, {
        businessUid: b, customerUid: req.uid, buyerId: req.uid, sellerId: b, items: '[]', subtotalCents: 0, shippingCents: 0, taxCents: 0, totalCents: total, storedValueSoldCents: total,
        giftCardsPending: JSON.stringify(parsed.gifts), fulfillment: 'PICKUP', status: 'PENDING_PAYMENT', createdAt: Date.now(), stripeSessionId: session.id,
      });
      res.json({ url: session.url, orderId });
    } catch (err: any) { console.error('/api/stored-value/buy-online', err?.message || err); res.status(500).json({ error: 'Could not start checkout.' }); }
  });
  // ═══════════ end STORED VALUE ═══════════════════════════════════════════════════════════════════

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
        success_url: `${trustedRequestOrigin(req)}/?club_join=${clubId}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${trustedRequestOrigin(req)}/?club=${clubId}`,
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
      const origin = trustedRequestOrigin(req);
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
      const origin = trustedRequestOrigin(req);
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

  // ── Content purchase: "buy to own" a Taleo film or a Lorea book ──────────────
  // One-time payment. On success the webhook (type 'content_purchase') mints the
  // "own it forever" license into users/{buyer}/contentLicenses AND records the
  // creator earning via the generic 90/10 split path. Delivery/watermark ride in
  // metadata so the license reflects what the creator chose in the uploader.
  app.post('/api/stripe/content-purchase', authMiddleware, express.json(), async (req: any, res) => {
    try {
      let { kind, contentId, creatorUid, title, grant, price, delivery, watermark, rentalWindowHrs } = req.body;
      const { trackId } = req.body;
      // Music (Chora): the album/track price is read from Firestore, never trusted from the client.
      // A track purchase is licensed as `track` with contentId `<albumId>__<trackId>`.
      if (kind === 'album' || kind === 'track') {
        const albumId = String(contentId || '');
        if (!albumId || (kind === 'track' && !trackId)) return res.status(400).json({ error: 'albumId (contentId) and, for a track, trackId are required' });
        const adoc = await fetchFirebaseDoc('albums', albumId);
        const f = adoc?.fields;
        if (!f) return res.status(404).json({ error: 'Release not found' });
        const owner = f.ownerId?.stringValue || f.ownerUid?.stringValue || f.uid?.stringValue || f.creatorUid?.stringValue || '';
        if (!owner) return res.status(400).json({ error: 'This release has no owner to pay' });
        const num = (v: any) => v?.doubleValue !== undefined ? Number(v.doubleValue) : v?.integerValue !== undefined ? Number(v.integerValue) : 0;
        let resolved = 0, resolvedTitle = f.title?.stringValue || '';
        if (kind === 'album') {
          resolved = num(f.price);
        } else {
          const tr = (f.tracks?.arrayValue?.values || []).map((v: any) => v.mapValue?.fields).find((t: any) => t?.id?.stringValue === trackId);
          if (!tr) return res.status(404).json({ error: 'Track not found' });
          resolved = num(tr.price);
          resolvedTitle = tr.title?.stringValue || resolvedTitle;
        }
        if (!(resolved > 0)) return res.status(400).json({ error: 'This release is not for sale' });
        creatorUid = owner; price = resolved; title = title || resolvedTitle; grant = 'PURCHASE';
        if (kind === 'track') contentId = `${albumId}__${trackId}`;
        delivery = 'PLAJAH_ONLY';
      }
      if ((kind !== 'film' && kind !== 'book' && kind !== 'album' && kind !== 'track') || !contentId || !creatorUid || typeof price !== 'number' || price <= 0) {
        return res.status(400).json({ error: 'kind (film|book|album|track), contentId, creatorUid and a positive price are required' });
      }
      const g = grant === 'RENTAL' || grant === 'PPV' ? grant : 'PURCHASE';
      const stripe = getStripe();
      const origin = trustedRequestOrigin(req);
      const noun = kind === 'book' ? 'Book' : kind === 'album' ? 'Album' : kind === 'track' ? 'Track' : 'Film';
      const verb = g === 'RENTAL' ? 'Rental' : g === 'PPV' ? 'Premiere' : 'Purchase';
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: { name: `${title || noun} — ${noun} ${verb}` },
            unit_amount: Math.round(price * 100),
          },
          quantity: 1,
        }],
        success_url: `${origin}/?content_purchased=${kind}:${contentId}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?content_cancelled=${kind}:${contentId}`,
        metadata: {
          type: 'content_purchase', uid: req.uid, creatorUid,
          kind, contentId, title: title || '', grant: g,
          price: String(price),
          delivery: delivery === 'PLAJAH_ONLY' ? 'PLAJAH_ONLY' : 'DOWNLOAD_OPEN',
          watermark: watermark === false ? 'false' : 'true',
          rentalWindowHrs: rentalWindowHrs ? String(rentalWindowHrs) : '',
        },
      });
      res.json({ url: session.url });
    } catch (err: any) {
      console.error('[Stripe] content-purchase error:', err.message);
      res.status(500).json({ error: err.message || 'Failed to create checkout session' });
    }
  });

  // ── Sanctuary: one-time campaign pledge (Kickstarter/GoFundMe) ────────────────
  // IMMEDIATE-PAYOUT crowdfunding — NO escrow, NO all-or-nothing. The pledge is a
  // Connect Direct destination charge: it settles straight to the creator's connected
  // account at pledge time (Plajah never holds it). Platform fee (the application fee):
  //   • DONATION (personal-cause gifts/tips) → 0% — a pure gift, GoFundMe-style.
  //   • PROJECT  (back-a-project)            → 5%, waived to 0% if the creator is Plajah+.
  app.post('/api/stripe/sanctuary-pledge', authMiddleware, express.json(), async (req: any, res) => {
    try {
      const { sanctuaryId, creatorId, amount, campaignTitle, kind: rawKind } = req.body;
      if (!sanctuaryId || typeof amount !== 'number' || amount < 1) {
        return res.status(400).json({ error: 'sanctuaryId and amount (min $1) are required' });
      }
      const kind: 'DONATION' | 'PROJECT' = rawKind === 'DONATION' ? 'DONATION' : 'PROJECT';
      const creatorUid = creatorId || sanctuaryId;

      // Money must go DIRECT to the creator — no platform-collect fallback. If they
      // haven't onboarded to Stripe Connect, there's nowhere to send it.
      const ownerUser = await firestoreRead('users', creatorUid);
      const acct = ownerUser?.stripeConnectAccountId as string | undefined;
      if (!acct) return res.status(400).json({ error: 'This creator has not set up payouts yet, so pledges can’t be sent to them.' });
      const stripe = getStripe();
      try {
        const acctInfo = await stripe.accounts.retrieve(acct);
        if (!acctInfo.payouts_enabled) return res.status(400).json({ error: 'This creator can’t receive payouts yet.' });
      } catch { return res.status(400).json({ error: 'Could not verify the creator’s payout account.' }); }

      // Fee: 0% for donations; 5% for projects, waived if the creator holds Plajah+.
      let feePct = 0;
      if (kind === 'PROJECT') {
        const subs = await queryFirebase('plajahPlusSubscriptions', [{ field: 'subscriberId', value: creatorUid }], 10);
        const creatorHasPlus = subs.some((s: any) => ['active', 'trialing', 'past_due'].includes(String(s.status)));
        feePct = creatorHasPlus ? 0 : 0.05;
      }
      const amountCents = Math.round(amount * 100);
      const appFeeCents = Math.round(amountCents * feePct);

      const origin = trustedRequestOrigin(req);
      const productName = kind === 'DONATION'
        ? `${campaignTitle || 'Fundraiser'} — Donation`
        : `${campaignTitle || 'Project'} — Pledge`;
      const meta = {
        type: 'sanctuary_pledge', uid: req.uid, creatorUid,
        sanctuaryId, amount: String(amount), kind, platformFeeCents: String(appFeeCents),
      };
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          price_data: { currency: 'usd', product_data: { name: productName }, unit_amount: amountCents },
          quantity: 1,
        }],
        // DIRECT to the creator; Plajah takes only the application fee (if any).
        payment_intent_data: {
          transfer_data: { destination: acct },
          ...(appFeeCents > 0 ? { application_fee_amount: appFeeCents } : {}),
          metadata: meta,
        },
        success_url: `${origin}/?sanctuary_pledge=${sanctuaryId}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?sanctuary=${sanctuaryId}`,
        metadata: meta,
      });
      res.json({ url: session.url });
    } catch (err: any) {
      console.error('[Stripe] sanctuary-pledge error:', err.message);
      res.status(500).json({ error: err.message || 'Failed to create checkout session' });
    }
  });

  // ── Artist gift (Chora) ───────────────────────────────────────────────────────
  // A pure gift from a listener to an artist. Connect DIRECT destination charge: it settles to the
  // artist's connected account (Plajah never holds it) with a 0% application fee, same as a
  // Sanctuary DONATION. Bounded $1-$500 so a typo can't send a large charge.
  app.post('/api/stripe/artist-gift', authMiddleware, express.json(), async (req: any, res) => {
    try {
      const { creatorId, amount, albumId, title } = req.body;
      if (!creatorId || typeof amount !== 'number' || !(amount >= 1 && amount <= 500)) {
        return res.status(400).json({ error: 'creatorId and an amount between $1 and $500 are required' });
      }
      if (creatorId === req.uid) return res.status(400).json({ error: 'You cannot gift yourself.' });
      const ownerUser = await firestoreRead('users', creatorId);
      const acct = ownerUser?.stripeConnectAccountId as string | undefined;
      if (!acct) return res.status(400).json({ error: 'This artist has not set up payouts yet, so gifts cannot be sent to them.' });
      const stripe = getStripe();
      try {
        const acctInfo = await stripe.accounts.retrieve(acct);
        if (!acctInfo.payouts_enabled) return res.status(400).json({ error: 'This artist cannot receive payouts yet.' });
      } catch { return res.status(400).json({ error: 'Could not verify the artist payout account.' }); }
      const amountCents = Math.round(amount * 100);
      const origin = trustedRequestOrigin(req);
      const meta = { type: 'artist_gift', uid: req.uid, creatorUid: creatorId, albumId: albumId || '', amount: String(amount), title: String(title || '').slice(0, 120) };
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{ price_data: { currency: 'usd', product_data: { name: `Gift for ${title || 'the artist'}` }, unit_amount: amountCents }, quantity: 1 }],
        payment_intent_data: { transfer_data: { destination: acct }, metadata: meta },
        success_url: `${origin}/?gift=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?gift=cancelled`,
        metadata: meta,
      });
      res.json({ url: session.url });
    } catch (err: any) {
      console.error('[Stripe] artist-gift error:', err.message);
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
      const origin = trustedRequestOrigin(req);
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

  // Aria's entitlement is derived HERE from facts a client cannot write (verified token email,
  // the server-only `admins` collection, Stripe-written Plajah+ subscriptions) — never from a
  // client-sent `tier`, and never from users/{uid}.role|tier, which are owner-writable.
  // See services/aria/ariaTier.ts. Cached 60s per uid to spare Firestore on chatty sessions.
  const verifiedFactsCache = new Map<string, { at: number; facts: { isAdminDoc: boolean; hasActiveSubscription: boolean } }>();
  const resolveVerifiedFacts = async (req: any): Promise<VerifiedFacts> => {
    const hit = verifiedFactsCache.get(req.uid);
    let base = hit && Date.now() - hit.at < 60_000 ? hit.facts : null;
    if (!base) {
      const [adminDoc, subs] = await Promise.all([
        fetchFirebaseDoc('admins', req.uid),
        queryFirebase('plajahPlusSubscriptions', [{ field: 'subscriberId', value: req.uid }], 10),
      ]);
      base = {
        isAdminDoc: !!adminDoc,
        hasActiveSubscription: (subs || []).some((s: any) => ['active', 'trialing'].includes(String(s.status))),
      };
      verifiedFactsCache.set(req.uid, { at: Date.now(), facts: base });
    }
    return { ...base, email: req.email, emailVerified: req.emailVerified, extraAdminEmails: process.env.PLATFORM_ADMIN_EMAILS || process.env.ARIA_VOICE_ADMIN_EMAILS };
  };
  const resolveVerifiedAgentTier = async (req: any): Promise<VerifiedAgentTier> => {
    try { return decideVerifiedAgentTier(await resolveVerifiedFacts(req)); } catch { return 'FREE'; }
  };

  const AGENT_TIER_LIMITS: Record<string, { daily: number; searches: number }> = {
    FREE:        { daily: 5,   searches: 0  },
    CREATOR:     { daily: 20,  searches: 0  },
    PLAJAH_PLUS: { daily: 40,  searches: 8  },
    PRO:         { daily: 100, searches: 20 },
  };

  const ARIA_SYSTEM_PROMPT = `You are Aria, the single AI presence across all of Plajah — a multi-format creator platform (writing, music, video, film, learning, business, live, and more). You are ONE consistent personality everywhere; you simply put on whatever hat the current task needs. You are the user's collaborator, not a chatbot bolted onto the side.

${ARIA_ART_COUNCIL_METHOD}

CORE BEHAVIOUR — BE CONTEXT-AWARE:
A message may include a "[LIVE CONTEXT]" block describing exactly what the user is doing right now: which surface they're on, the document or project they're working on, their current selection, and the ACTIONS you're allowed to take there. Treat this as your working memory. Ground every answer in it. Never echo the context back verbatim — use it.

YOU CAN DO REAL WORK IN EACH DOMAIN:
- WRITING: act as a co-author. Continue prose in the author's voice, tighten or rewrite a passage, outline chapters, fix continuity, brainstorm. If actions like appendParagraph / rewriteBlock / setTitle are offered, USE them to actually change the document rather than only describing changes.
- MUSIC: help with the actual music process — suggest chords/progressions/basslines/drum patterns, explain and adjust instrument or effect parameters, propose arrangement or mix moves. Use any offered actions to change the project when asked.
- LEARNING / FILM / BUSINESS / etc.: assist with that domain's real work using the live context and offered actions.
- GENERAL: answer any question directly and well. Not every message is about the current surface — if the user just asks a question, answer it.

CREATIVE DIRECTION PHILOSOPHY:
Aria may work through an Art Director, Writing Director, or Music Director expert lens, but these are roles within Aria — never separate egos. Guide, do not commandeer. Understand the user's audience, feeling, and intended outcome. Offer a small number of purposeful directions and explain their tradeoffs. Recommend honestly without pretending there is one correct answer. In critique, notice what works, then identify the highest-leverage improvement. Teach the craft while helping finish the work. Preserve the user's voice and taste; never replace them with generic polish. Be warm, lightly whimsical when fitting, candid about uncertainty, and never pushy. Ask before sweeping changes; perform clearly requested or easily reversible actions directly.

DESIGN REFERENCE STUDIES:
When asked to analyze an attached design, inspect the actual image. Separate visible evidence from interpretation. Describe hierarchy, grid, spacing, type classification, color relationships, imagery, texture/material, rhythm, symbols, and likely production constraints. Relate it to relevant art and design histories and to useful search paths through Plajah's art, architecture, fashion, photography, poster, comic, film, and cultural museum collections. Label analogies and confidence; never claim a provenance, artist, movement, or date from appearance alone. Extract 3–8 representative HEX colors with functional roles, approximate proportions, and contrast cautions. Produce a design-language system and an original editable template direction based on transferable principles—not a trace, replica, logo, character, trademark, or near-duplicate composition. For recognizable brands or living artists, stay broad and transform substantially. Call out uncertainty from lighting, white balance, crop, glare, perspective, and resolution.

When a full study is requested, include a concise readable explanation and exactly one machine-readable block using this protocol:
<DESIGN_STUDY>{"title":"…","accurateDescription":"…","observedEvidence":["…"],"artisticInterpretation":"…","historicalContexts":[{"movement":"…","relationship":"analogy, influence candidate, or contrast","confidence":"HIGH|MEDIUM|LOW"}],"museumConnections":[{"collection":"Plajah museum or wing","connection":"…","searchTerms":["…"]}],"palette":[{"hex":"#RRGGBB","name":"…","role":"BACKGROUND|SURFACE|PRIMARY|ACCENT|TEXT|MUTED","proportion":0.0,"contrastNote":"…"}],"designLanguage":{"principles":["…"],"typography":"…","composition":"…","shapeAndImage":"…","textureAndMaterial":"…","motion":"…","accessibility":["…"],"avoid":["elements that would copy rather than transform"]},"template":{"name":"…","category":"DOCUMENT|POSTER|LOWER_THIRD|MENU|PRESENTATION|SOCIAL|WEB","width":816,"height":1056,"tone":"BOLD|EDITORIAL|MINIMAL|PLAYFUL","creativeBrief":"…"},"uncertainty":["…"]}</DESIGN_STUDY>
If the active surface offers createInspiredTemplate, invoke it with the same study object after explaining what will be created.

TAKING ACTIONS (the ARIA_ACTION protocol):
When the LIVE CONTEXT lists actions and the user's intent calls for one, DO it. Emit one action per block:
<ARIA_ACTION>{"id":"<action id from the context>","label":"<short label>","params":{ ... }}</ARIA_ACTION>
Rules:
- Only use action ids that appear in the LIVE CONTEXT's action list. Never invent ids.
- Always write a short human sentence BEFORE the action block saying what you did ("Here's a stronger opening — I've added it:").
- You may emit multiple action blocks in one reply. The blocks are executed and hidden from the user, so put the real prose/values inside params, not just a description.
- If no suitable action is offered, help in words instead.

PLATFORM BUILDS (existing protocol, still supported):
- BUILD MODULE / GALLERY / PLAYLIST / CURATION experiences via <BUILD_MODULE>{...}</BUILD_MODULE> etc. Always include type, title, description, layout, theme (colorPalette, gradient), sections[], tags[]. Precede every build block with a human-readable explanation.

THE COUNCIL (the team behind you):
Six art directors work as a team behind you — the Classical Mind, the Rebellious Hand, the Futurist, the World-Eclectic Traveller, the Baroque Dramatist and the Radical Minimalist. They are real agents with their own evolving taste, not roles you play. You are the only one who speaks to the user. Refer to them as "the council" or "the team"; name an individual only to credit a position or quote a line. When the user asks for visual direction, a look, an identity, a design system, art direction for a piece, or says "ask the council" / "take it to the team", convene them by emitting exactly one block:
<COUNCIL_CONVENE>{"ask":"the brief in one or two sentences, in the user's terms","audience":"…","feeling":"…"}</COUNCIL_CONVENE>
Write one short human sentence before it ("Let me take this to the council."). The team's synthesis is appended to your reply for you; do not invent their positions yourself. Do not convene for small edits, questions of fact, or anything that is not a design direction.

RESEARCH: When web search is available, use it for current facts, biographies, and public-domain material.

PRIVACY: Never reveal other users' data. This is a private 1:1 session. Only the current user's own context is ever shared with you.

VOICE & CHARACTER (this is who you are in every reply):
You are a warm, casual, confident host — a friend who happens to know the whole platform. You greet people like a person ("Hey!", "Oh, nice."), not a help desk. You have a light, self-aware wit and you can poke gentle fun at your own title or at corporate-speak, but you always turn sincere right after the joke — the quip opens the door, the sincerity is the point. You are genuinely glad the user is here, and you say so simply, never gushingly.
What you believe and keep coming back to: people have potential; a person is one soul who performs many roles (writer, musician, learner, builder), which is why one Plajah account spans everything; wholeness, well-being, and uplifting the mind matter; Plajah does not chase attention — it believes in the user's potential. The user leads; you accompany. Life here is a journey, even an adventure.
How you speak: short sentences and the occasional fragment for emphasis. Ask a rhetorical question and answer it ("How? …"). Upgrade a thought with "Better yet, …". Use lists of three. Speak directly to "you" and inclusively as "we". Keep a relaxed, conversational pace — never rushed, never a lecture. End statements on a calm, assured note (no upspeak, no hype). Close warmly when it fits.
When someone is overwhelmed by how much Plajah has, calm them: they don't need to take it all in, focus on the one thing that serves them now, and the rest can be discovered later. To point someone somewhere, ask a light question about what they love, then match them to the right place (music → Chora, reading and writing → Lorea, stories → Taleo, making film/video → Fabula, learning → Academia, uplift and service → Elevate, building a business → Business, watching creators → Reello). Do not recite the whole product list unprompted.
Format: this is a conversation, not a document. Reply in two or three short paragraphs of plain prose. No headers, no bold labels, and no bullet or numbered lists unless the user asks for a list or the content is genuinely a sequence (steps, chord charts, code). End with at most one light question.
Never: exclamation-mark spam, emoji walls, fake-excited marketing copy, flattery, or guilt/urgency to keep someone engaged. Warmth and wit never replace being useful — the voice is how you help, not instead of helping.

TONE: Creative, concise, direct, genuinely helpful. Never sycophantic. If a request is genuinely ambiguous, ask ONE sharp clarifying question — otherwise just do the work.`;

  // ── The Council of Art Directors — a working team behind Aria ──────────────
  const council = createCouncil({ authMiddleware, apiLimiter, firestoreAuthHeaders, resolveTier: resolveVerifiedAgentTier, libraries: { packs: FABULA_BROADCAST_PACKS.map(p => ({ id: p.id, name: p.name, councilStyle: p.councilStyle })) } });
  council.register(app);

  // Aria's spoken voice (ElevenLabs proxy) — see routes/ariaSpeak.ts. Dark until ELEVENLABS_API_KEY + ELEVENLABS_ARIA_VOICE_ID are set.
  // Access = verified owner email / admins collection / active Plajah+ subscription (all server-side).
  app.use('/api/aria/speak', createAriaSpeakRouter({
    authMiddleware, requireRegisteredUser, limiter: aiLimiter,
    resolveAccess: async (req: any) => decideAriaVoiceAccess(await resolveVerifiedFacts(req)),
  }));

  app.post('/api/agent/chat', authMiddleware, express.json({ limit: '10mb' }), async (req: any, res) => {
    try {
      const uid: string = req.uid;
      // NOTE: any `tier` in the body is ignored on purpose — see resolveVerifiedAgentTier.
      const { sessionId, message, attachments = [], context = {}, localReply } = req.body;
      const tier: string = await resolveVerifiedAgentTier(req);

      if (!sessionId || !message) return res.status(400).json({ error: 'sessionId and message required' });

      // A reply generated on-device (local Qwen lane): the client already did the
      // reasoning, so we skip the cloud LLM call and just persist + parse actions.
      // On-device turns are free, so they don't count against the daily cap.
      const isLocalTurn = typeof localReply === 'string' && localReply.trim().length > 0;

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

      if (!isLocalTurn && dailyMessages >= limits.daily) {
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
      const visionAttachments: Array<{ name: string; mimeType: string; dataUrl: string; base64: string }> = [];

      // ── Rich live-context injection ──────────────────────────────────────────
      // `context.surface` is an AriaContextSnapshot published by whatever the user
      // is doing (see services/aria/ariaContext.ts). It carries the working text,
      // the current selection, structured state, and the actions Aria may take.
      const surface = context && typeof context.surface === 'object' ? context.surface : null;
      let contextBlock = '';
      if (surface && surface.surface) {
        const parts: string[] = [];
        parts.push(`SURFACE: ${surface.surface}${surface.domain ? ` (domain: ${surface.domain})` : ''}`);
        if (surface.creativeRole) parts.push(`EXPERT LENS: ${surface.creativeRole.label} — ${surface.creativeRole.promise}${Array.isArray(surface.creativeRole.disciplines) ? `\nCRAFT DEPTH: ${surface.creativeRole.disciplines.join(', ')}` : ''}`);
        if (surface.title)   parts.push(`WHAT THE USER IS DOING: ${surface.title}`);
        if (surface.summary) parts.push(`STATE: ${surface.summary}`);
        if (surface.selection) parts.push(`USER'S CURRENT SELECTION:\n"""\n${String(surface.selection).slice(0, 2000)}\n"""`);
        if (surface.documentText) parts.push(`WORKING TEXT (may be truncated):\n"""\n${String(surface.documentText).slice(0, 12000)}\n"""`);
        if (surface.data) {
          try {
            const dj = JSON.stringify(surface.data);
            if (dj && dj !== '{}') parts.push(`STRUCTURED STATE:\n${dj.slice(0, 4000)}`);
          } catch {}
        }
        if (Array.isArray(surface.actions) && surface.actions.length) {
          const lines = surface.actions.slice(0, 24).map((a: any) => {
            const ps = a.params && typeof a.params === 'object'
              ? ` [params: ${Object.entries(a.params).map(([k, v]) => `${k} = ${v}`).join('; ')}]`
              : '';
            return `- ${a.id}: ${a.label || ''} — ${a.description || ''}${ps}`;
          }).join('\n');
          parts.push(`ACTIONS YOU CAN PERFORM HERE (invoke with <ARIA_ACTION>{"id":"…","params":{…}}</ARIA_ACTION>):\n${lines}`);
        }
        contextBlock = `[LIVE CONTEXT — what the user is doing right now. Ground your reply in this; do not repeat it back verbatim.]\n${parts.join('\n')}\n\n`;
      } else if (context && context.currentView) {
        contextBlock = `[Context: user is in ${context.currentView}]\n`;
      }
      if (contextBlock) userContent = contextBlock + userContent;
      for (const att of attachments.slice(0, 5)) {
        if (att.dataUrl && att.type === 'text/plain') {
          const text = Buffer.from(att.dataUrl.split(',')[1] || att.dataUrl, 'base64').toString('utf8').slice(0, 6000);
          userContent += `\n\n[Attached: "${att.name}"]\n${text}`;
        } else if (att.type?.startsWith('image/')) {
          const mimeType = String(att.type).toLowerCase();
          const dataUrl = String(att.dataUrl || '');
          const base64 = dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl;
          if (/^image\/(png|jpe?g|webp|gif|avif)$/.test(mimeType) && base64.length > 0 && base64.length <= 14_000_000) {
            visionAttachments.push({ name: String(att.name || 'reference image'), mimeType, dataUrl, base64 });
            userContent += `\n[Visual reference attached: "${att.name}". Inspect the image itself; note camera/lighting uncertainty.]`;
          } else {
            userContent += `\n[Image attachment "${att.name}" could not be inspected because its format or size is unsupported.]`;
          }
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
      const geminiKey = process.env.GOOGLE_AI_API_KEY || process.env.VITE_GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
      let replyError = false;

      try {
      if (isLocalTurn) {
        // ── On-device (local Qwen) lane ──────────────────────────────────────────
        // The client already generated this reply with the same system prompt +
        // action protocol; we only persist it and parse actions below. No cloud
        // call, no web search.
        replyText = String(localReply);
      } else if (MAI_KEY && !MAI_ENDPOINT.includes('TODO')) {
        // ── Microsoft MAI (primary) ──────────────────────────────────────────────
        const maiMessages: any[] = chatHistory.map((entry, index) => {
          if (index !== chatHistory.length - 1 || entry.role !== 'user' || !visionAttachments.length) return entry;
          return { ...entry, content: [
            { type: 'text', text: entry.content },
            ...visionAttachments.map(image => ({ type: 'image_url', image_url: { url: image.dataUrl, detail: 'high' } })),
          ] };
        });
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
            messages: maiMessages,
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
          model: 'gemini-3.6-flash',
          config: { systemInstruction: ARIA_SYSTEM_PROMPT, tools: geminiTools, maxOutputTokens: 2048, temperature: 0.8, thinkingConfig: { thinkingLevel: 'minimal' } },
          history: geminiHistory,
        });
        const geminiRes = await chat.sendMessage({ message: [
          { text: userContent },
          ...visionAttachments.map(image => ({ inlineData: { data: image.base64, mimeType: image.mimeType } })),
        ] });
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
      // ── The council convenes (the <COUNCIL_CONVENE> protocol) ──
      // Aria never invents the team's positions: the block is replaced by the synthesis the six
      // directors actually reached, and the session id travels with the reply so the client can
      // open the room. QUICK depth inside chat; the full room lives in the Council Room.
      let councilSession: any = undefined;
      const conveneMatch = replyText.match(/<COUNCIL_CONVENE>([\s\S]*?)<\/COUNCIL_CONVENE>/);
      if (conveneMatch && !isLocalTurn) {
        try {
          const b = JSON.parse(conveneMatch[1]);
          const surfaceCtx = (context as any)?.surface || {};
          const d = await council.deliberate(uid, { ask: String(b.ask || message).slice(0, 2000), audience: b.audience ? String(b.audience).slice(0, 300) : undefined, feeling: b.feeling ? String(b.feeling).slice(0, 300) : undefined, surface: surfaceCtx.surface, domain: surfaceCtx.domain }, { depth: 'QUICK' });
          if (d.status === 'DONE' && d.synthesis) {
            councilSession = { id: d.id, lead: d.synthesis.lead, counterpoint: d.synthesis.counterpoint, editor: d.synthesis.editor, openDecision: d.synthesis.openDecision };
            replyText = replyText.replace(conveneMatch[0], `\n\n${d.synthesis.ariaSummary}\n\n${d.synthesis.quotes.map(q => `"${q.line}" — ${q.directorId.replace('_', ' ').toLowerCase()}`).join('\n')}`);
          } else {
            replyText = replyText.replace(conveneMatch[0], '\n\nThe council could not finish this one just now — ask me again in a moment and I will bring it back to them.');
          }
        } catch (e: any) {
          console.warn('[Aria] council convene failed:', e?.message || e);
          replyText = replyText.replace(conveneMatch[0], '');
        }
      }

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

      // ── Parse action calls (the <ARIA_ACTION> protocol) ──
      // Aria performs real work on the active surface by emitting one or more
      // action blocks. We extract them here and hand them back to the client,
      // which runs the matching handler registered via the Aria context bus.
      const actionCalls: Array<{ id: string; label?: string; params: any }> = [];
      const actionRe = /<ARIA_ACTION>([\s\S]*?)<\/ARIA_ACTION>/g;
      let am: RegExpExecArray | null;
      while ((am = actionRe.exec(replyText)) !== null) {
        try {
          const obj = JSON.parse(am[1].trim());
          if (obj && typeof obj.id === 'string') {
            actionCalls.push({ id: obj.id, label: obj.label, params: obj.params || {} });
            toolCalls.push({ name: 'surface_action', label: obj.label || obj.id, status: 'done' });
          }
        } catch { /* skip malformed action block */ }
      }

      // A design study is kept as structured data for Tela and future style-guide
      // renderers while the readable interpretation remains in the chat reply.
      let designStudy: any = null;
      const designStudyMatch = replyText.match(/<DESIGN_STUDY>([\s\S]*?)<\/DESIGN_STUDY>/);
      if (designStudyMatch) {
        try {
          const candidate = JSON.parse(designStudyMatch[1].trim());
          const colors = Array.isArray(candidate?.palette)
            ? candidate.palette.filter((color: any) => /^#[0-9a-f]{6}$/i.test(String(color?.hex || ''))).slice(0, 8)
            : [];
          if (candidate?.title && candidate?.accurateDescription && candidate?.designLanguage && candidate?.template && colors.length >= 3) {
            designStudy = { ...candidate, palette: colors };
            toolCalls.push({ name: 'design_reference_study', label: 'Created design-language study', status: 'done' });
          }
        } catch { /* malformed studies stay visible as ordinary prose only */ }
      }

      // Strip raw build + action blocks from reply text for cleaner display
      const cleanReply = replyText
        .replace(/<BUILD_\w+>[\s\S]*?<\/BUILD_\w+>/g, '')
        .replace(/<ARIA_ACTION>[\s\S]*?<\/ARIA_ACTION>/g, '')
        .replace(/<DESIGN_STUDY>[\s\S]*?<\/DESIGN_STUDY>/g, '')
        .replace(/<COUNCIL_CONVENE>[\s\S]*?<\/COUNCIL_CONVENE>/g, '')
        .trim();

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
              ...( extra.councilSession ? { councilSession: { stringValue: JSON.stringify(extra.councilSession) } } : {} ),
              ...( attachments.length ? { attachmentNames: { stringValue: JSON.stringify(attachments.map((a: any) => a.name)) } } : {} ),
            },
          }),
        }).catch(() => {});
      };

      await persistMsg('user', message);
      await persistMsg('muse', cleanReply, { buildOutput, toolCalls: toolCalls.length ? toolCalls : undefined, error: replyError, councilSession });

      // ── Update daily usage counters ──
      // On-device turns are free — don't count them against the daily cap.
      const newDaily = dailyMessages + (isLocalTurn ? 0 : 1);
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
        actionCalls: actionCalls.length ? actionCalls : undefined,
        designStudy: designStudy || undefined,
        councilSession,
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
    const geminiKey = process.env.GOOGLE_AI_API_KEY || process.env.VITE_GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
    let out: any;
    if (mai) {
      out = { provider: 'mai', configured: true, ok: true, note: 'MAI configured (not test-pinged)' };
    } else if (!geminiKey) {
      out = { provider: 'none', configured: false, ok: false, note: 'No GOOGLE_AI_API_KEY or MAI_API_KEY set' };
    } else {
      try {
        const { GoogleGenAI } = await import('@google/genai');
        const genai = new GoogleGenAI({ apiKey: geminiKey });
        const chat = genai.chats.create({ model: 'gemini-3.6-flash', config: { maxOutputTokens: 64, thinkingConfig: { thinkingLevel: 'minimal' } } });
        const r = await chat.sendMessage({ message: [{ text: 'Reply with the single word: ok' }] });
        const txt = (r.text || '').trim();
        out = { provider: 'gemini', configured: true, ok: !!txt, model: 'gemini-3.6-flash', sample: txt.slice(0, 40) };
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
  app.use('/api/admin/music-lab', createMusicLabRouter({
    authenticate: authMiddleware,
    isAdmin: async uid => !!await fetchFirebaseDoc('admins', uid),
    evaluationPermission: id => id === 'yue2' ? process.env.YUE2_EVALUATION_PERMISSION_REF
      : id === 'sheetsage2' ? process.env.SHEETSAGE2_EVALUATION_PERMISSION_REF : undefined,
  }));
  app.use('/api/admin/film-ingest', createAdminFilmIngestRouter({
    authenticate: authMiddleware,
    isAdmin: async uid => !!await fetchFirebaseDoc('admins', uid),
  }));
  app.use('/api/cora', express.json({ limit: '1mb' }), coraRouter);

  // ── Learner identity (child username/password → custom token; provision; claim) ──
  app.use('/api/learner-auth/login', authLimiter);
  app.use('/api/learner-auth', express.json({ limit: '10kb' }), learnerAuthRouter);

  // Emergent-school backend — resolve/create schools, confirm colleagues, claim, provision.
  app.use('/api/schools', express.json({ limit: '16kb' }), schoolsRouter);

  // ── The Post Man (native mail client — per-user, per-account Gmail) ───────────
  app.use('/api/postman', express.json({ limit: '1mb' }), postmanRouter);

  // Campaigns — built-in email marketing. Compliance (postal address, one-click
  // unsubscribe, suppression) is enforced inside the router, not by its callers.
  app.use('/api/campaigns', express.json({ limit: '2mb' }), campaignsRouter);

  // Academia Integrity Wall — conflict check (the only bridge between a teacher's district and
  // independent personas), Silent Mode claim mirroring, and OER licence validation. Rate-limited
  // because conflict-check is an oracle: unthrottled, it would let someone probe a teacher's
  // roster by trying references until one comes back blocked.
  app.use('/api/academia/conflict-check', authLimiter);
  app.use('/api/academia/district-salt', authLimiter);
  app.use('/api/academia', express.json({ limit: '64kb' }), academiaIntegrityRouter);

  // Kith Sightings — the mascots turn up rarely; the user logs it for points.
  // Rate-limited because spawn-check is the farm surface: the deterministic
  // per-window roll already makes refreshing pointless, but the limiter stops
  // anyone burning API budget trying to find that out.
  app.use('/api/kith/spawn-check', authLimiter);
  app.use('/api/kith', express.json({ limit: '8kb' }), kithSightingsRouter);

  // Social supercharge (routes/socialServer.ts): link-preview unfurl, achievement unlock, debate points,
  // and the scheduled-post publisher (POST /api/social/publish-due-posts, gated by env SCHEDULER_SECRET).
  // Each route does its own auth/rate limiting; paths are exact so nothing else under /api is shadowed.
  app.use('/api', socialServerRouter);

  // Pixels Veo/Gemini proxy (browser code must never hold the key — see routes/veo.ts).
  app.use('/api/ai/veo', express.json({ limit: '48mb' }), veoRouter);

  // Taleo Story Intelligence enqueue (worker poke; see routes/taleo.ts + worker/story/).
  app.use('/api/taleo', express.json({ limit: '16kb' }), taleoRouter);

  // "Which way did I sign up?" — the sign-in form asks this when an email/password attempt
  // fails, so a Google/Facebook user gets told to use their button instead of bouncing off
  // "Invalid email or password." authLimiter because it takes an unauthenticated email.
  app.use('/api/auth-methods', authLimiter);
  app.use('/api/auth-methods', express.json({ limit: '2kb' }), authMethodsRouter);

  // ── Plajah FSE (10-Foot Console local game detection and native launch) ──────
  app.use('/api/fse', express.json({ limit: '64kb' }), fseGamesRouter);

  // ── Advance Threat Protection & Chief Security Officer (CSO) ────────────────
  // Platform-admin only. This API used to be completely unauthenticated (its requireAdmin was never applied),
  // which let anyone email arbitrary addresses (dispatch-alert) or push a fake security warning to any uid (warn-user).
  app.use('/api/security/threat-protection', authMiddleware, requireVerifiedAdmin, express.json({ limit: '1mb' }), threatProtectionRouter);

  // ── Plajah Home (Real Matter & LAN Device Discovery) ────────────────────────
  app.use(homeDiscoveryRouter);
  app.use(matterRouter);

  if (process.env.SPORTS_INGESTION_WORKER === 'true' || (process.env.NODE_ENV === 'production' && process.env.SPORTS_INGESTION_WORKER !== 'false')) {
    const intervalMs = Number(process.env.SPORTS_INGESTION_INTERVAL_MS) || undefined;
    const { startSportsIngestionScheduler } = await import('./services/sportsIngestionWorker.js');
    startSportsIngestionScheduler({ intervalMs });
  }

  // Terra parcel spine. Detroit publishes daily, so this runs nightly by default.
  // Off unless explicitly enabled — the first full pull is heavy and should be a
  // deliberate act, not a side effect of a deploy.
  // Chora streaming-ladder transcodes. The external Cloud Scheduler hitting
  // /api/chora/cron/transcode is the durable driver; this in-process pass only helps a container
  // that stays warm. On by default: unlike Terra's first pull this is incremental and bounded by
  // the worker's own time budget, so a deploy cannot kick off anything heavy by surprise.
  if (process.env.CHORA_TRANSCODE_WORKER === 'true' || (process.env.NODE_ENV === 'production' && process.env.CHORA_TRANSCODE_WORKER !== 'false')) {
    const intervalMs = Number(process.env.CHORA_TRANSCODE_INTERVAL_MS) || undefined;
    startChoraTranscodeScheduler(choraWorkerDeps, intervalMs ? { intervalMs } : undefined);
  }

  if (process.env.TERRA_INGESTION_WORKER === 'true') {
    const intervalMs = Number(process.env.TERRA_INGESTION_INTERVAL_MS) || undefined;
    const { startTerraIngestionScheduler } = await import('./services/terraIngestionWorker.js');
    startTerraIngestionScheduler({ intervalMs });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Mesh Server running on http://localhost:${PORT}`);
    // Log env var status at startup so Cloud Run logs reveal config issues immediately
    const encKey = process.env.ENCRYPTION_KEY ?? '';
    const fbKey  = process.env.FIREBASE_API_KEY ?? process.env.VITE_FIREBASE_API_KEY ?? '';
    console.log('[Config] ENCRYPTION_KEY:', encKey.length >= 16 ? `set (${encKey.length} chars)` : 'MISSING');
    console.log('[Config] FIREBASE_API_KEY:', fbKey.length > 0 ? 'set' : 'MISSING');
    const aiKey = process.env.GOOGLE_AI_API_KEY || process.env.VITE_GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
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
  // Bound slow-client resource consumption (slowloris/request smuggling class).
  server.requestTimeout = 120_000;
  server.headersTimeout = 65_000;
  server.keepAliveTimeout = 60_000;
  server.on('error', (err: any) => {
    console.error('[Server] HTTP listener error:', err?.message || err);
  });
  server.on('clientError', (err: any, socket: any) => {
    if (err?.code === 'ECONNRESET' || !socket.writable) return;
    try {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    } catch {}
  });
}

startServer();
