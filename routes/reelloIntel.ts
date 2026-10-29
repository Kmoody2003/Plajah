/**
 * Reello Story Intelligence + upload preferences — API routes.
 *
 * Same shape as routes/musicIntel.ts: Firestore over REST with the service account (every route
 * authorises itself), so the two collections need no client rule:
 *   reelloUploadPrefs/{uid}   templates + defaults (services/reello/uploadPrefs.ts)
 *   reelloIntel/{videoId}     the job, the report and the drafts (services/reello/intel/types.ts)
 *
 *   GET  /api/reello/prefs                       the caller's templates + defaults
 *   PUT  /api/reello/prefs                       replace them
 *   POST /api/reello/intel/analyze  { videoId, options?, force? }   owner. Starts (or resumes) a watch.
 *   POST /api/reello/intel/continue { videoId }  owner. Resumes a WAITING_MEDIA / stalled job.
 *   GET  /api/reello/intel                       the caller's jobs (the drafts inbox), newest first
 *   GET  /api/reello/intel/:videoId              one job — owner only: drafts are private until posted
 *   POST /api/reello/intel/:videoId/post    { key, edits? }   approve one draft → it goes live
 *   POST /api/reello/intel/:videoId/discard { key }
 *   POST /api/reello/intel/sweep                 key-gated (REELLO_CRON_KEY) — resumes WAITING_MEDIA jobs
 *
 * The watch: the video's own Mux stream (a ≤480p rendition) → ffmpeg 1 fps / mono proxy in
 * 20-minute pieces → Gemini Files API → one JSON read per piece (speech + on-screen graphics) →
 * buildReport → an article written from the report (text-only call). Stills and clips are Mux
 * URLs (thumbnail time= / instant-clip asset_start_time), so nothing is re-encoded or stored.
 *
 * Mount (server.ts): app.use('/api/reello', apiLimiter, express.json({ limit: '64kb' }), createReelloIntelRouter())
 */
import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { fsGet, fsPatch, fsSet, fsCreate, fsQuery, verifyIdToken, adminConfig } from '../services/firebaseAdminRest';
import { sanitizePrefs, DEFAULT_PREFS } from '../services/reello/uploadPrefs';
import {
  ARTICLE_PROMPT, WATCH_PROMPT, DEFAULT_INTEL_OPTIONS, autoNotice, buildArticleDraft, buildProductDraft, buildReport,
  formatClock, muxClipStreamUrl, muxStillUrl, productHoldReason, watchUrl,
} from '../services/reello/intel/core';
import type { ArticleDraft, DraftState, IntelOptions, ReelloIntelJob, VideoIntelReport } from '../services/reello/intel/types';

const JOBS = 'reelloIntel';
const PREFS = 'reelloUploadPrefs';
const ID_RE = /^[\w-]{1,128}$/;
const LEASE_MS = 12 * 60_000;
const PIECE_SEC = 20 * 60;
const GEMINI_BASE = 'https://generativelanguage.googleapis.com';
const maxWatchSec = () => Math.max(60, Math.round(parseFloat(process.env.REELLO_INTEL_MAX_MIN || '90') * 60));
const watchModels = () => [process.env.REELLO_INTEL_MODEL || 'gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.5-flash'];
const geminiKey = () => process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.VITE_GOOGLE_AI_API_KEY || '';
const appBase = () => process.env.APP_URL || process.env.VITE_APP_URL || 'https://plajah.com';

// ── Injectable edges (tests pass fakes) ──────────────────────────────────────

export interface ReelloIntelStore {
  get(path: string): Promise<Record<string, any> | null>;
  set(path: string, data: Record<string, unknown>): Promise<unknown>;
  patch(path: string, data: Record<string, unknown>): Promise<unknown>;
  create(collection: string, data: Record<string, unknown>): Promise<string | null>;
  query(collection: string, filters: { field: string; value: string | number | boolean }[], limit: number): Promise<Array<{ id: string; data: Record<string, any> }>>;
}

export interface ReelloIntelDeps {
  store?: ReelloIntelStore;
  /** Watch the video → the model's raw JSON (merged across pieces). */
  watch?(media: { playbackId: string; durationSec: number; title: string; description: string }, onProgress: (pct: number, note: string) => void): Promise<{ raw: any; usage: Usage }>;
  /** Text-only JSON generation (the article). */
  write?(prompt: string): Promise<{ raw: any; usage: Usage }>;
  /** Resolve a still-transcoding upload's playback id (Mux upload → asset). */
  resolvePlayback?(video: Record<string, any>): Promise<string | null>;
  callerUid?(req: Request): Promise<string | null>;
  now?(): number;
}

interface Usage { inTokens: number; outTokens: number; costUsd: number }
const addUsage = (a: Usage, b?: Usage): Usage => ({ inTokens: a.inTokens + (b?.inTokens || 0), outTokens: a.outTokens + (b?.outTokens || 0), costUsd: Math.round((a.costUsd + (b?.costUsd || 0)) * 10000) / 10000 });

const adminStore: ReelloIntelStore = {
  get: fsGet, set: fsSet, patch: fsPatch, create: fsCreate, query: fsQuery,
};

async function defaultCallerUid(req: Request): Promise<string | null> {
  const a = req.headers.authorization;
  return a?.startsWith('Bearer ') ? verifyIdToken(a.slice(7)) : null;
}

// ── Media: Mux low-res rendition → ffmpeg proxy pieces ───────────────────────

async function lowResVariant(playbackId: string): Promise<{ url: string; durationSec: number }> {
  const master = `https://stream.mux.com/${playbackId}.m3u8`;
  try {
    const res = await fetch(master, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return { url: master, durationSec: 0 };
    const lines = (await res.text()).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let url = '';
    for (let i = 0; i < lines.length - 1; i++) {
      if (lines[i].startsWith('#EXT-X-STREAM-INF') && /RESOLUTION=(854x|640x|480x|\d+x(360|480))/i.test(lines[i])) { url = lines[i + 1]; if (/854x|x480/i.test(lines[i])) break; }
    }
    url = url || lines.find(l => l.startsWith('http')) || master;
    const v = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    let total = 0;
    if (v.ok) for (const l of (await v.text()).split(/\r?\n/)) if (l.startsWith('#EXTINF:')) { const s = parseFloat(l.slice(8)); if (Number.isFinite(s)) total += s; }
    return { url, durationSec: total };
  } catch { return { url: master, durationSec: 0 }; }
}

function ffmpeg(args: string[], timeoutMs: number): Promise<boolean> {
  return new Promise(resolve => {
    let ff: ReturnType<typeof spawn>;
    try { ff = spawn(process.env.FFMPEG_PATH || 'ffmpeg', args, { stdio: ['ignore', 'ignore', 'ignore'] }); }
    catch { return resolve(false); }
    const killer = setTimeout(() => { try { ff.kill('SIGKILL'); } catch { /* */ } }, timeoutMs);
    ff.on('error', () => { clearTimeout(killer); resolve(false); });
    ff.on('close', code => { clearTimeout(killer); resolve(code === 0); });
  });
}

async function geminiUpload(buf: Buffer, name: string): Promise<{ name: string; uri: string }> {
  const key = geminiKey();
  const start = await fetch(`${GEMINI_BASE}/upload/v1beta/files?key=${key}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(buf.length), 'X-Goog-Upload-Header-Content-Type': 'video/mp4',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: name } }),
  });
  if (!start.ok) throw new Error(`files start ${start.status}`);
  const uploadUrl = start.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('files start: no upload url');
  const up = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Length': String(buf.length), 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' }, body: buf as any });
  if (!up.ok) throw new Error(`files upload ${up.status}`);
  const meta = (await up.json() as any).file;
  let state = meta?.state;
  const deadline = Date.now() + 8 * 60_000;
  while (state === 'PROCESSING' && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 4000));
    const p = await fetch(`${GEMINI_BASE}/v1beta/${meta.name}?key=${key}`).catch(() => null);
    if (p?.ok) state = ((await p.json()) as any).state;
  }
  if (state !== 'ACTIVE') throw new Error(`video file not ready (${state})`);
  return { name: meta.name, uri: meta.uri };
}

/** Lenient JSON: the model's answer may be fenced or cut short at its output cap. */
export function parseModelJson(text: string): any {
  const t = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  try { return JSON.parse(t); } catch { /* fall through */ }
  const s = t.indexOf('{');
  if (s < 0) return {};
  let body = t.slice(s);
  for (let cut = body.length; cut > 1; cut = body.lastIndexOf(',', cut - 1)) {
    let candidate = body.slice(0, cut);
    const stack: string[] = []; let inStr = false, esc = false;
    for (const ch of candidate) {
      if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true; else if (ch === '{') stack.push('}'); else if (ch === '[') stack.push(']'); else if (ch === '}' || ch === ']') stack.pop();
    }
    if (inStr) continue;
    candidate += stack.reverse().join('');
    try { return JSON.parse(candidate); } catch { /* shorter */ }
    if (cut <= 0) break;
  }
  return {};
}

async function generate(parts: any[], maxOutputTokens: number): Promise<{ raw: any; usage: Usage }> {
  const key = geminiKey();
  if (!key) throw new Error('Story Intelligence is not configured on this server.');
  let lastErr = '';
  for (const model of watchModels()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(`${GEMINI_BASE}/v1beta/models/${model}:generateContent?key=${key}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens, ...(/^gemini-3/.test(model) ? { thinkingConfig: { thinkingLevel: 'minimal' } } : {}), ...(parts.some(p => p.fileData) ? { mediaResolution: 'MEDIA_RESOLUTION_LOW' } : {}) },
        }),
        signal: AbortSignal.timeout(6 * 60_000),
      }).catch((e: any) => ({ ok: false, status: 0, text: async () => String(e?.message || e) } as any));
      if (res.ok) {
        const data = await res.json() as any;
        const text = (data.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join('');
        const um = data.usageMetadata || {};
        const inT = Number(um.promptTokenCount) || 0, outT = Number(um.candidatesTokenCount) || 0;
        // Blended estimate (video frames + audio in, JSON out) — for the job doc, not invoicing.
        return { raw: parseModelJson(text), usage: { inTokens: inT, outTokens: outT, costUsd: Math.round((inT * 0.45 + outT * 2.5) / 1e6 * 10000) / 10000 } };
      }
      lastErr = `${model} ${res.status}: ${(await res.text()).slice(0, 200)}`;
      if (res.status !== 429 && res.status !== 503 && res.status !== 500 && res.status !== 0) break;
      await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
    }
  }
  throw new Error(lastErr || 'model unavailable');
}

const mergeRaw = (pieces: any[]): any => {
  const cat = (k: string) => pieces.flatMap(p => (Array.isArray(p?.[k]) ? p[k] : []));
  return {
    summary: pieces.map(p => p?.summary).filter(Boolean).join(' '),
    topics: [...new Set(cat('topics'))],
    language: pieces.find(p => p?.language)?.language,
    chapters: cat('chapters'), stills: cat('stills'), offers: cat('offers'), links: cat('links'), quotes: cat('quotes'),
    callsToAction: [...new Set(cat('callsToAction'))],
  };
};

async function liveWatch(media: { playbackId: string; durationSec: number; title: string; description: string }, onProgress: (pct: number, note: string) => void) {
  const variant = await lowResVariant(media.playbackId);
  const dur = Math.min(maxWatchSec(), Math.max(variant.durationSec, media.durationSec, 1));
  const pieces = Math.max(1, Math.ceil(dur / PIECE_SEC));
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rintel_'));
  const raws: any[] = [];
  let usage: Usage = { inTokens: 0, outTokens: 0, costUsd: 0 };
  try {
    for (let i = 0; i < pieces; i++) {
      const offset = i * PIECE_SEC;
      const out = path.join(tmp, `p${i}.mp4`);
      onProgress(10 + Math.round((i / pieces) * 70), `Watching ${formatClock(offset)}–${formatClock(Math.min(dur, offset + PIECE_SEC))}`);
      const ok = await ffmpeg(['-y', '-ss', String(offset), '-i', variant.url, '-t', String(Math.min(PIECE_SEC, dur - offset)),
        '-vf', 'fps=1,scale=-2:360', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '34', '-c:a', 'aac', '-b:a', '48k', '-ac', '1', '-movflags', '+faststart', out], 15 * 60_000);
      if (!ok) throw new Error('Could not read the video stream (ffmpeg).');
      const buf = await fs.readFile(out);
      const file = await geminiUpload(buf, `reello-${media.playbackId}-${i}`);
      try {
        const r = await generate([{ fileData: { fileUri: file.uri, mimeType: 'video/mp4' } }, { text: WATCH_PROMPT({ title: media.title, description: media.description, durationSec: dur, offsetSec: offset }) }], 8192);
        raws.push(r.raw); usage = addUsage(usage, r.usage);
      } finally {
        fetch(`${GEMINI_BASE}/v1beta/${file.name}?key=${geminiKey()}`, { method: 'DELETE' }).catch(() => {});
        fs.unlink(out).catch(() => {});
      }
    }
  } finally { fs.rm(tmp, { recursive: true, force: true }).catch(() => {}); }
  return { raw: mergeRaw(raws), usage };
}

async function liveResolvePlayback(video: Record<string, any>): Promise<string | null> {
  if (video.muxPlaybackId) return video.muxPlaybackId;
  const { MUX_TOKEN_ID, MUX_TOKEN_SECRET } = process.env;
  if (!MUX_TOKEN_ID || !MUX_TOKEN_SECRET || !video.muxUploadId) return null;
  const auth = 'Basic ' + Buffer.from(`${MUX_TOKEN_ID}:${MUX_TOKEN_SECRET}`).toString('base64');
  try {
    const up = await fetch(`https://api.mux.com/video/v1/uploads/${video.muxUploadId}`, { headers: { Authorization: auth } });
    const assetId = up.ok ? (await up.json() as any)?.data?.asset_id : null;
    if (!assetId) return null;
    const as = await fetch(`https://api.mux.com/video/v1/assets/${assetId}`, { headers: { Authorization: auth } });
    const a = as.ok ? (await as.json() as any)?.data : null;
    return a?.status === 'ready' ? (a.playback_ids?.[0]?.id || null) : null;
  } catch { return null; }
}

// ── Drafts → live content ────────────────────────────────────────────────────

/** Organisations whose store this uid may stock: creator, linked account, or an admin. */
export async function canStockOrg(store: ReelloIntelStore, uid: string, orgId: string): Promise<Record<string, any> | null> {
  if (!ID_RE.test(orgId)) return null;
  const org = await store.get(`organizations/${orgId}`);
  if (!org) return null;
  const ok = org.creatorId === uid || org.accountUid === uid || (Array.isArray(org.admins) && org.admins.includes(uid));
  return ok ? org : null;
}

function articleBlocks(a: ArticleDraft) {
  return a.blocks.map((b, i) => ({ id: `b${i + 1}`, type: b.type, content: b.content, ...(b.caption ? { caption: b.caption } : {}), ...(b.type === 'IMAGE' ? { layout: 'FULL' } : {}) }));
}

/**
 * Put one draft live. `auto` = no person approved it: the auto-created notice rides along.
 * Returns the new state for drafts[key].
 */
export async function postDraft(store: ReelloIntelStore, job: ReelloIntelJob, key: string, opts: { auto: boolean; now: number; owner: Record<string, any>; video: Record<string, any>; edits?: any }): Promise<DraftState> {
  const notice = autoNotice(job.accountName, job.videoTitle);
  const ownerName = String(opts.owner.displayName || job.accountName || 'Creator');
  const ownerPhoto = String(opts.owner.photoURL || opts.owner.photoUrl || '');
  const report = job.report as VideoIntelReport;
  // An article or a public clip sends people to the video — not while they can't watch it.
  const hidden = opts.video.isPrivate === true || (opts.video.isScheduled === true && Number(opts.video.releaseDate) > opts.now);
  const hiddenReason = 'The video is private or not released yet — publish it first, so readers aren’t sent to a video they can’t watch.';
  const sendsToVideo = key === 'article' || (key.startsWith('clip:') && (opts.edits?.visibility ? opts.edits.visibility !== 'PRIVATE' : job.options.clipVisibility !== 'PRIVATE'));
  if (hidden && sendsToVideo) {
    if (opts.auto) return { status: 'NEEDS_REVIEW', heldReason: hiddenReason };
    throw new Error(hiddenReason);
  }

  if (key === 'article') {
    const a: ArticleDraft = { ...(job.article as ArticleDraft), ...(opts.edits && typeof opts.edits === 'object' ? pickArticleEdits(opts.edits) : {}) };
    const bodyText = a.blocks.filter(b => b.type === 'TEXT' || b.type === 'HEADING' || b.type === 'QUOTE').map(b => b.content).join('\n\n');
    const words = bodyText.split(/\s+/).filter(Boolean).length;
    const id = await store.create('articles', {
      authorId: job.ownerId, authorName: ownerName, authorPhoto: ownerPhoto,
      title: a.title, subtitle: a.subtitle, coverImage: a.coverImage || '', category: 'Article', tags: a.tags,
      blocks: articleBlocks(a), bodyText, wordCount: words, readTime: Math.max(1, Math.round(words / 230)),
      timestamp: opts.now, publishedAt: opts.now, isPublic: true, status: 'PUBLISHED', likesCount: 0, commentsCount: 0,
      access: 'FREE',
      disclosures: { aiAssisted: true, aiNote: 'Drafted by Story Intelligence from the video.', sponsored: false, affiliateLinks: false, conflictOfInterest: false },
      notices: opts.auto ? [{ id: `n_${opts.now.toString(36)}`, label: 'EDITORS_NOTE', text: notice, at: opts.now, byUid: job.ownerId, byName: 'Story Intelligence' }] : [],
      fromVideoIntel: { videoId: job.videoId, auto: opts.auto },
    });
    if (!id) throw new Error('The article could not be saved.');
    await store.create('feed', {
      authorId: job.ownerId, authorName: ownerName, authorPhoto: ownerPhoto, type: 'NEWS',
      content: `New article: ${a.title}`, imageUrl: a.coverImage || '', url: id, shareCount: 0,
      timestamp: opts.now, score: 0, scoreUpdatedAt: opts.now, interactions: { deep: {}, medium: {}, base: {}, dmSharerIds: [] },
    }).catch(() => null);
    return { status: 'POSTED', postedId: id, postedAt: opts.now, auto: opts.auto };
  }

  if (key.startsWith('clip:')) {
    const q = report.quotes.find(x => `clip:${x.id}` === key);
    const pid = opts.video.muxPlaybackId;
    if (!q || !pid) throw new Error('This clip can’t be made until the video finishes processing.');
    const title = String(opts.edits?.title || `“${q.text}”`).slice(0, 180);
    const videoId = `clip_${job.videoId}_${q.id}`.slice(0, 120);
    const isPrivate = opts.edits?.visibility ? opts.edits.visibility === 'PRIVATE' : job.options.clipVisibility === 'PRIVATE';
    await store.set(`videos/${videoId}`, {
      id: videoId, ownerId: job.ownerId, title,
      description: [`From “${job.videoTitle}” at ${formatClock(q.startSec)}. Watch the full video: ${watchUrl(job.videoId, appBase(), q.startSec)}`, opts.auto ? notice : ''].filter(Boolean).join('\n\n'),
      url: muxClipStreamUrl(pid, q.startSec, q.endSec),
      muxClip: { sourcePlaybackId: pid, startSec: q.startSec, endSec: q.endSec },
      thumbnailUrl: muxStillUrl(pid, q.startSec + 1.5, 640),
      artist: ownerName, genre: String(opts.video.genre || 'General'), duration: Math.round(q.endSec - q.startSec),
      isRello: true, isPrivate, likesCount: 0, commentsCount: 0, timestamp: opts.now, tags: ['quote', 'clip'],
      provenance: { originVideoId: job.videoId, originOwnerId: job.ownerId, stampedAt: opts.now },
      fromVideoIntel: { videoId: job.videoId, quoteId: q.id, auto: opts.auto },
    });
    return { status: 'POSTED', postedId: videoId, postedAt: opts.now, auto: opts.auto };
  }

  if (key.startsWith('product:')) {
    const o0 = report.offers.find(x => `product:${x.id}` === key);
    if (!o0) throw new Error('No such product.');
    const o = { ...o0, ...pickOfferEdits(opts.edits) };
    if (opts.auto) {
      const held = productHoldReason(o);
      if (held) return { status: 'NEEDS_REVIEW', heldReason: held };
    }
    if (o.price == null && !o.packages.length) throw new Error('Add a price before this goes on sale.');
    let sellerId = job.ownerId, sellerName = ownerName, sellerType: 'USER' | 'ORG' = 'USER';
    if (job.options.merchTarget.kind === 'ORG' && job.options.merchTarget.orgId) {
      const org = await canStockOrg(store, job.ownerId, job.options.merchTarget.orgId);
      if (!org) throw new Error('You no longer manage that organization’s store.');
      sellerId = String(org.accountUid || org.creatorId); sellerName = String(org.name || job.options.merchTarget.orgName || 'Store'); sellerType = 'ORG';
    }
    const body = buildProductDraft(o, { sellerId, sellerName, sellerType, videoId: job.videoId, videoTitle: job.videoTitle, notice: opts.auto ? notice : undefined, now: opts.now, active: true });
    const id = await store.create('storeProducts', body as any);
    if (!id) throw new Error('The listing could not be saved.');
    return { status: 'POSTED', postedId: id, postedAt: opts.now, auto: opts.auto };
  }
  throw new Error('Unknown draft.');
}

function pickArticleEdits(e: any): Partial<ArticleDraft> {
  const out: Partial<ArticleDraft> = {};
  if (typeof e.title === 'string' && e.title.trim()) out.title = e.title.slice(0, 140);
  if (typeof e.subtitle === 'string') out.subtitle = e.subtitle.slice(0, 200);
  if (Array.isArray(e.blocks)) out.blocks = e.blocks.slice(0, 80).filter((b: any) => ['HEADING', 'TEXT', 'QUOTE', 'IMAGE', 'VIDEO'].includes(b?.type) && typeof b.content === 'string')
    .map((b: any) => ({ type: b.type, content: b.content.slice(0, 6000), ...(typeof b.caption === 'string' ? { caption: b.caption.slice(0, 400) } : {}) }));
  return out;
}

function pickOfferEdits(e: any) {
  const out: Record<string, any> = {};
  if (!e || typeof e !== 'object') return out;
  if (typeof e.name === 'string' && e.name.trim()) out.name = e.name.slice(0, 120);
  if (typeof e.description === 'string') out.description = e.description.slice(0, 600);
  if (typeof e.price === 'number' && e.price >= 0 && e.price < 1e6) out.price = Math.round(e.price * 100) / 100;
  if (typeof e.url === 'string') out.url = e.url.slice(0, 500) || undefined;
  if (Array.isArray(e.packages)) out.packages = e.packages.slice(0, 10).filter((p: any) => p?.quantity >= 1 && p?.price > 0).map((p: any) => ({ quantity: Math.round(p.quantity), price: Math.round(p.price * 100) / 100, label: String(p.label || `${p.quantity} for ${p.price}`).slice(0, 80) }));
  return out;
}

// ── The run ───────────────────────────────────────────────────────────────────

export function sanitizeOptions(raw: any): IntelOptions {
  const o = { ...DEFAULT_INTEL_OPTIONS, ...(raw && typeof raw === 'object' ? raw : {}) };
  return {
    article: o.article !== false, clips: o.clips !== false, merch: o.merch !== false,
    publishMode: o.publishMode === 'AUTO' ? 'AUTO' : 'APPROVE',
    merchTarget: o.merchTarget?.kind === 'ORG' && typeof o.merchTarget.orgId === 'string' ? { kind: 'ORG', orgId: String(o.merchTarget.orgId).slice(0, 128), orgName: String(o.merchTarget.orgName || '').slice(0, 120) } : { kind: 'USER' },
    clipVisibility: o.clipVisibility === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC',
  };
}

export async function runReelloIntel(deps: Required<Pick<ReelloIntelDeps, 'store' | 'watch' | 'write' | 'resolvePlayback' | 'now'>>, videoId: string): Promise<ReelloIntelJob | null> {
  const { store } = deps;
  const jp = `${JOBS}/${videoId}`;
  const job = await store.get(jp) as ReelloIntelJob | null;
  if (!job) return null;
  const now = deps.now();
  if (job.leaseUntil && job.leaseUntil > now && job.status !== 'WAITING_MEDIA') return job;
  if (job.status === 'READY' || job.status === 'SKIPPED') return job;
  const video = await store.get(`videos/${videoId}`);
  if (!video) { await store.patch(jp, { status: 'FAILED', error: 'The video was deleted.', updatedAt: now }); return { ...job, status: 'FAILED' }; }

  const playbackId = await deps.resolvePlayback(video);
  if (!playbackId) {
    await store.patch(jp, { status: 'WAITING_MEDIA', progress: { stage: 'Waiting for the upload to finish processing', pct: 2 }, updatedAt: now });
    return { ...job, status: 'WAITING_MEDIA' };
  }
  if (!video.muxPlaybackId) await store.patch(`videos/${videoId}`, { muxPlaybackId: playbackId }).catch(() => null);

  const attempts = (job.attempts || 0) + 1;
  await store.patch(jp, { status: 'WATCHING', leaseUntil: now + LEASE_MS, attempts, progress: { stage: 'Watching and listening', pct: 8 }, error: null, updatedAt: now });
  try {
    const durationSec = Number(video.timebase?.durationSec || video.duration || 0);
    const watched = await deps.watch(
      { playbackId, durationSec, title: String(video.title || job.videoTitle), description: String(video.description || '') },
      (pct, note) => { store.patch(jp, { progress: { stage: 'Watching and listening', pct, note }, leaseUntil: deps.now() + LEASE_MS, updatedAt: deps.now() }).catch(() => null); },
    );
    let usage = addUsage({ inTokens: 0, outTokens: 0, costUsd: 0 }, watched.usage);
    const report = buildReport(watched.raw, { durationSec, description: String(video.description || ''), playbackId });
    await store.patch(jp, { status: 'DRAFTING', report, progress: { stage: 'Writing the drafts', pct: 85 }, updatedAt: deps.now() });

    let article: ArticleDraft | undefined;
    if (job.options.article && (report.summary || report.quotes.length)) {
      const w = await deps.write(ARTICLE_PROMPT({ title: String(video.title || job.videoTitle), accountName: job.accountName, report }));
      usage = addUsage(usage, w.usage);
      article = buildArticleDraft(w.raw, report, { videoId, videoTitle: String(video.title || job.videoTitle), baseUrl: appBase(), coverImage: video.thumbnailUrl || undefined });
    }

    const drafts: Record<string, DraftState> = { ...(job.drafts || {}) };
    const fresh = (k: string) => { if (!drafts[k]) drafts[k] = { status: 'DRAFT' }; };
    if (article) fresh('article');
    if (job.options.clips) for (const q of report.quotes) fresh(`clip:${q.id}`);
    if (job.options.merch) for (const o of report.offers) fresh(`product:${o.id}`);

    let done: ReelloIntelJob = { ...job, report, ...(article ? { article } : {}), drafts, usage, status: 'READY' };
    if (job.options.publishMode === 'AUTO') {
      const owner = (await store.get(`users/${job.ownerId}`)) || {};
      for (const key of Object.keys(drafts)) {
        if (drafts[key].status !== 'DRAFT') continue;
        try { drafts[key] = await postDraft(store, done, key, { auto: true, now: deps.now(), owner, video: { ...video, muxPlaybackId: playbackId } }); }
        catch (e: any) { drafts[key] = { status: 'NEEDS_REVIEW', heldReason: e?.message || 'Could not post automatically.' }; }
      }
      done = { ...done, drafts };
    }
    await store.patch(jp, { status: 'READY', report, ...(article ? { article } : {}), drafts, usage, leaseUntil: 0, progress: { stage: 'Ready', pct: 100 }, updatedAt: deps.now() });
    return done;
  } catch (e: any) {
    const msg = String(e?.message || e).slice(0, 300);
    await store.patch(jp, { status: attempts >= 3 ? 'FAILED' : 'QUEUED', error: msg, leaseUntil: 0, progress: { stage: attempts >= 3 ? 'Failed' : 'Will retry', pct: 0, note: msg }, updatedAt: deps.now() });
    return { ...job, status: attempts >= 3 ? 'FAILED' : 'QUEUED', error: msg };
  }
}

// ── Router ────────────────────────────────────────────────────────────────────

export function createReelloIntelRouter(extra: ReelloIntelDeps = {}): Router {
  const r = Router();
  const store = extra.store || adminStore;
  const now = extra.now || (() => Date.now());
  const caller = extra.callerUid || defaultCallerUid;
  const deps = {
    store, now,
    watch: extra.watch || liveWatch,
    write: extra.write || ((prompt: string) => generate([{ text: prompt }], 4096)),
    resolvePlayback: extra.resolvePlayback || liveResolvePlayback,
  };
  const running = new Set<string>();
  const kick = (videoId: string) => {
    if (running.has(videoId)) return Promise.resolve(null);
    running.add(videoId);
    return runReelloIntel(deps, videoId).catch(e => { console.error('[reello-intel]', videoId, e?.message || e); return null; }).finally(() => running.delete(videoId));
  };
  const configured = () => !!extra.store || adminConfig.hasCredentials();

  r.get('/prefs', async (req, res) => {
    const uid = await caller(req);
    if (!uid) return res.status(401).json({ error: 'Sign in required.' });
    const doc = await store.get(`${PREFS}/${uid}`);
    res.json(doc ? sanitizePrefs(doc) : DEFAULT_PREFS);
  });

  r.put('/prefs', async (req, res) => {
    const uid = await caller(req);
    if (!uid) return res.status(401).json({ error: 'Sign in required.' });
    const prefs = sanitizePrefs(req.body);
    for (const t of prefs.templates) {
      if (t.intel.merchTarget.kind === 'ORG' && !(await canStockOrg(store, uid, t.intel.merchTarget.orgId || ''))) {
        return res.status(403).json({ error: `Template “${t.name}”: you don’t manage that organization’s store.` });
      }
    }
    await store.set(`${PREFS}/${uid}`, { ...prefs, ownerId: uid } as any);
    res.json(prefs);
  });

  r.post('/intel/analyze', async (req: Request, res: Response) => {
    if (!configured()) return res.status(503).json({ error: 'Server not configured.' });
    const uid = await caller(req);
    if (!uid) return res.status(401).json({ error: 'Sign in required.' });
    const videoId = String(req.body?.videoId || '').trim();
    if (!ID_RE.test(videoId)) return res.status(400).json({ error: 'videoId is required.' });
    const video = await store.get(`videos/${videoId}`);
    if (!video) return res.status(404).json({ error: 'No such video.' });
    if (video.ownerId !== uid) return res.status(403).json({ error: 'Not your video.' });
    const options = sanitizeOptions(req.body?.options);
    if (options.merchTarget.kind === 'ORG' && !(await canStockOrg(store, uid, options.merchTarget.orgId || ''))) {
      return res.status(403).json({ error: 'You don’t manage that organization’s store.' });
    }
    const existing = await store.get(`${JOBS}/${videoId}`) as ReelloIntelJob | null;
    if (existing && existing.status === 'READY' && req.body?.force !== true) return res.json({ status: 'READY' });
    const owner = (await store.get(`users/${uid}`)) || {};
    const t = now();
    await store.set(`${JOBS}/${videoId}`, {
      videoId, ownerId: uid, status: 'QUEUED', progress: { stage: 'Queued', pct: 0 }, options,
      accountName: String(owner.displayName || owner.username || video.artist || 'Creator').slice(0, 80),
      videoTitle: String(video.title || 'Untitled').slice(0, 200),
      drafts: existing?.drafts && req.body?.force !== true ? existing.drafts : {}, attempts: 0, leaseUntil: 0,
      createdAt: existing?.createdAt || t, updatedAt: t,
    });
    // The watch takes minutes; answer now and keep going (resumable via /continue and the sweep).
    void kick(videoId);
    res.json({ status: 'QUEUED' });
  });

  r.post('/intel/continue', async (req, res) => {
    const uid = await caller(req);
    if (!uid) return res.status(401).json({ error: 'Sign in required.' });
    const videoId = String(req.body?.videoId || '').trim();
    if (!ID_RE.test(videoId)) return res.status(400).json({ error: 'videoId is required.' });
    const job = await store.get(`${JOBS}/${videoId}`) as ReelloIntelJob | null;
    if (!job || job.ownerId !== uid) return res.status(404).json({ error: 'No such job.' });
    if (job.status === 'READY' || job.status === 'FAILED' || job.status === 'SKIPPED') return res.json({ status: job.status });
    void kick(videoId);
    res.json({ status: job.status });
  });

  r.post('/intel/sweep', async (req, res) => {
    const expected = process.env.REELLO_CRON_KEY || process.env.CHORA_CRON_KEY || '';
    if (!expected || String(req.get('x-reello-cron-key') || '') !== expected) return res.status(401).json({ error: 'invalid or missing cron key' });
    const n = await sweepWaiting(store, kick);
    res.json({ ok: true, resumed: n });
  });

  r.get('/intel', async (req, res) => {
    const uid = await caller(req);
    if (!uid) return res.status(401).json({ error: 'Sign in required.' });
    const rows = await store.query(JOBS, [{ field: 'ownerId', value: uid }], 200);
    const jobs = rows.map(r => r.data as ReelloIntelJob).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    res.json({ jobs });
  });

  r.get('/intel/:videoId', async (req, res) => {
    const uid = await caller(req);
    if (!uid) return res.status(401).json({ error: 'Sign in required.' });
    const videoId = String(req.params.videoId || '');
    if (!ID_RE.test(videoId)) return res.status(400).json({ error: 'bad id' });
    const job = await store.get(`${JOBS}/${videoId}`) as ReelloIntelJob | null;
    if (!job || job.ownerId !== uid) return res.status(404).json({ error: 'No such job.' });
    res.json({ job });
  });

  r.post('/intel/:videoId/post', async (req, res) => {
    const uid = await caller(req);
    if (!uid) return res.status(401).json({ error: 'Sign in required.' });
    const videoId = String(req.params.videoId || '');
    const key = String(req.body?.key || '');
    if (!ID_RE.test(videoId) || !/^(article|clip:[\w-]+|product:[\w-]+)$/.test(key)) return res.status(400).json({ error: 'bad request' });
    const job = await store.get(`${JOBS}/${videoId}`) as ReelloIntelJob | null;
    if (!job || job.ownerId !== uid) return res.status(404).json({ error: 'No such job.' });
    const cur = job.drafts?.[key];
    if (!cur) return res.status(404).json({ error: 'No such draft.' });
    if (cur.status === 'POSTED') return res.json({ draft: cur });
    const video = (await store.get(`videos/${videoId}`)) || {};
    const owner = (await store.get(`users/${uid}`)) || {};
    try {
      const next = await postDraft(store, job, key, { auto: false, now: now(), owner, video, edits: req.body?.edits });
      // Keep the job's copy of the article in step with what was actually published.
      const article = key === 'article' && job.article && req.body?.edits ? { ...job.article, ...pickArticleEdits(req.body.edits) } : undefined;
      await store.patch(`${JOBS}/${videoId}`, { drafts: { ...(job.drafts || {}), [key]: next }, ...(article ? { article } : {}), updatedAt: now() });
      res.json({ draft: next, ...(article ? { article } : {}) });
    } catch (e: any) {
      res.status(422).json({ error: e?.message || 'Could not post.' });
    }
  });

  r.post('/intel/:videoId/discard', async (req, res) => {
    const uid = await caller(req);
    if (!uid) return res.status(401).json({ error: 'Sign in required.' });
    const videoId = String(req.params.videoId || '');
    const key = String(req.body?.key || '');
    const job = await store.get(`${JOBS}/${videoId}`) as ReelloIntelJob | null;
    if (!job || job.ownerId !== uid || !job.drafts?.[key]) return res.status(404).json({ error: 'No such draft.' });
    if (job.drafts[key].status === 'POSTED') return res.status(409).json({ error: 'Already posted — remove it where it lives.' });
    const next: DraftState = { status: 'DISCARDED' };
    await store.patch(`${JOBS}/${videoId}`, { drafts: { ...job.drafts, [key]: next }, updatedAt: now() });
    res.json({ draft: next });
  });

  return r;
}

/** Resume every job waiting on a transcode (called by the Mux asset-ready webhook and the sweep). */
export async function sweepWaiting(store: ReelloIntelStore = adminStore, kick?: (id: string) => Promise<unknown>): Promise<number> {
  const rows = [
    ...(await store.query(JOBS, [{ field: 'status', value: 'WAITING_MEDIA' }], 20)),
    ...(await store.query(JOBS, [{ field: 'status', value: 'QUEUED' }], 20)),
  ];
  const run = kick || ((id: string) => runReelloIntel({ store, now: () => Date.now(), watch: liveWatch, write: (p: string) => generate([{ text: p }], 4096), resolvePlayback: liveResolvePlayback }, id));
  for (const row of rows) void run(String(row.data?.videoId || row.id));
  return rows.length;
}
