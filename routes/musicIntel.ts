/**
 * Chora Music Intelligence — API routes + real wiring for services/musicIntel/worker.
 *
 * Same shape as routes/taleo.ts (Story Intelligence): Firestore over REST with the service
 * account (bypasses firestore.rules — every route authorises itself), job state at
 * musicIntel/{albumId}, per-song reads at musicIntel/{albumId}/tracks/{trackId}. Reads are
 * served from here, so the collection needs no client rule.
 *
 *   POST /api/music-intel/analyze   { albumId, force? }  owner/admin. Runs a budgeted slice and
 *                                    returns { status, remaining }; the uploader loops while
 *                                    remaining > 0 (publishToCloud does this in the background).
 *   POST /api/music-intel/continue  { albumId }           anyone who can see the album: resumes a
 *                                    stalled job (lease-guarded, never re-hears a finished song).
 *   GET  /api/music-intel/:albumId                        the bundle { job, tracks }.
 *   POST /api/music-intel/link-film { filmAlbumId }       owner: a film just published — re-read
 *                                    the creator's soundtracks in its light once its Story
 *                                    Intelligence report is ready.
 *   POST /api/music-intel/cron                            key-gated (CHORA_CRON_KEY) driver.
 *
 * Mount (server.ts): app.use('/api/music-intel', express.json({ limit: '16kb' }), createMusicIntelRouter({...}))
 */
import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { fsGet, fsPatch, fsSet, fsList, fsQuery, verifyIdToken, adminConfig, getAccessToken } from '../services/firebaseAdminRest';
import { runMusicIntel, pendingTracks, type IntelAlbum, type IntelTrack, type MusicIntelDeps } from '../services/musicIntel/worker';
import { filmTitleTokens } from '../services/musicIntel/prompts';
import type { FilmContext, MusicIntelBundle, MusicIntelJob, TrackIntel } from '../services/musicIntel/types';

const JOBS = 'musicIntel';
const ID_RE = /^[\w-]{1,128}$/;
const STORAGE_BUCKET = 'gen-lang-client-0665118474.firebasestorage.app';
const MODEL = 'gemini-3.6-flash';
/** DSP hears at most this much of a song; the listening model a little more. */
const MEASURE_SEC = 480;
const LISTEN_SEC = 540;

/** Where jobs, reads, albums and Story Intelligence reports are read from / written to. */
export interface IntelStore {
  get(path: string): Promise<Record<string, any> | null>;
  patch(path: string, data: Record<string, unknown>): Promise<unknown>;
  set(path: string, data: Record<string, unknown>): Promise<unknown>;
  list(collectionPath: string): Promise<Array<{ id: string; data: Record<string, any> }>>;
  query(collection: string, filters: { field: string; value: string | number | boolean }[], limit: number): Promise<Array<{ id: string; data: Record<string, any> }>>;
  storageJson(objectPath: string): Promise<any | null>;
}

export interface MusicIntelRouterDeps {
  /** Run the Chora lyric sync for one song now; returns its timed lines (empty = instrumental). */
  ensureLyrics?(albumId: string, track: IntelTrack, artist?: string): Promise<{ time: number; text: string }[]>;
  /** Defaults to the API's service-account Firestore/Storage (scripts pass their own). */
  store?: IntelStore;
}

async function callerUid(req: Request): Promise<string | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  return verifyIdToken(auth.slice(7));
}

const isAdmin = async (uid: string) => !!(await fsGet(`admins/${uid}`).catch(() => null));

function geminiKey(): string {
  return process.env.GOOGLE_AI_API_KEY || process.env.VITE_GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
}

// ─── Audio I/O ────────────────────────────────────────────────────────────────

async function download(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`audio fetch ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 250 * 1024 * 1024) throw new Error('audio too large');
  const file = path.join(os.tmpdir(), `mi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  await fs.writeFile(file, buf);
  return file;
}

function ffmpegToBuffer(args: string[], timeoutMs: number): Promise<Buffer | null> {
  return new Promise(resolve => {
    const chunks: Buffer[] = [];
    let ff: ReturnType<typeof spawn>;
    try { ff = spawn(process.env.FFMPEG_PATH || 'ffmpeg', args, { stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch { return resolve(null); }
    const killer = setTimeout(() => { try { ff.kill('SIGKILL'); } catch { /* */ } }, timeoutMs);
    ff.stdout?.on('data', (d: Buffer) => chunks.push(d));
    ff.on('error', () => { clearTimeout(killer); resolve(null); });
    ff.on('close', code => { clearTimeout(killer); resolve(code === 0 && chunks.length ? Buffer.concat(chunks) : null); });
  });
}

/** One download per song per run: decode() and encodeForListening() share the temp file. */
function audioCache() {
  const files = new Map<string, Promise<string>>();
  const get = (url: string) => {
    let p = files.get(url);
    if (!p) { p = download(url); files.set(url, p); p.catch(() => files.delete(url)); }
    return p;
  };
  const cleanup = async () => {
    for (const p of files.values()) { try { await fs.unlink(await p); } catch { /* */ } }
    files.clear();
  };
  return { get, cleanup };
}

// ─── Model calls ──────────────────────────────────────────────────────────────

async function gemini(contents: any[], maxOutputTokens: number): Promise<string> {
  const key = geminiKey();
  if (!key) throw new Error('Gemini not configured');
  const { GoogleGenAI } = await import('@google/genai');
  const genai = new GoogleGenAI({ apiKey: key });
  const response = await genai.models.generateContent({
    model: MODEL,
    contents,
    config: { responseMimeType: 'application/json', maxOutputTokens, thinkingConfig: { thinkingLevel: 'low' } as any },
  });
  return (response as any).text || '';
}

// ─── Story Intelligence (film context) ────────────────────────────────────────

async function readStorageJson(objectPath: string): Promise<any | null> {
  try {
    const token = await getAccessToken();
    const res = await fetch(`https://storage.googleapis.com/storage/v1/b/${STORAGE_BUCKET}/o/${encodeURIComponent(objectPath)}?alt=media`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(20_000),
    });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

/** The creator's own film this soundtrack is for: an explicit related-project link first, then
 *  the best title match among their movies / series. Its Story Intelligence read rides along
 *  once that report is READY; until then the link is PENDING and re-checked on read. */
export async function findFilmFor(album: IntelAlbum, store: IntelStore = adminStore): Promise<FilmContext> {
  if (!album.ownerId) return { status: 'NONE' };
  const own = await store.query('albums', [{ field: 'ownerId', value: album.ownerId }], 200);
  const films = own.filter(a => a.data?.type === 'VIDEO' && ['MOVIE', 'TV_SERIES'].includes(String(a.data?.subType)) && a.id !== album.id);
  if (!films.length) return { status: 'NONE' };
  const want = new Set(filmTitleTokens(album.title || ''));
  let best: { id: string; data: any } | null = films.find(f => (album.relatedProjectIds || []).includes(f.id)) || null;
  if (!best && want.size) {
    let bestScore = 0;
    for (const f of films) {
      const have = filmTitleTokens(String(f.data?.title || ''));
      const hit = have.filter(w => want.has(w)).length;
      const score = have.length ? hit / Math.max(have.length, want.size) : 0;
      if (score > bestScore) { bestScore = score; best = f; }
    }
    if (bestScore < 0.5) best = null;
  }
  if (!best) return { status: 'NONE' };
  const filmTitle = String(best.data?.title || '');
  const job = await store.get(`taleoAnalysis/${best.id}`);
  if (!job || !['READY', 'PARTIAL'].includes(String(job.status))) return { status: 'PENDING', filmAlbumId: best.id, filmTitle };
  const report = await store.storageJson(String(job.reportPath || `taleoAnalysis/${job.ownerId}/${best.id}/report.json`));
  if (!report) return { status: 'PENDING', filmAlbumId: best.id, filmTitle };
  return {
    status: 'LINKED',
    filmAlbumId: best.id,
    filmTitle,
    logline: String(report.logline || '').slice(0, 600),
    themes: (Array.isArray(report.themes) ? report.themes : []).map(String).slice(0, 8),
    characters: (Array.isArray(report.characters) ? report.characters : []).map((c: any) => String(c?.name || '')).filter(Boolean).slice(0, 12),
  };
}

const adminStore: IntelStore = {
  get: fsGet, patch: fsPatch, set: fsSet,
  list: (c) => fsList(c, { maxDocs: 200 }),
  query: fsQuery,
  storageJson: readStorageJson,
};

// ─── Deps ─────────────────────────────────────────────────────────────────────

function liveDeps(extra: MusicIntelRouterDeps): MusicIntelDeps & { cleanup(): Promise<void> } {
  const store = extra.store || adminStore;
  const cache = audioCache();
  // Source url → compressed rendition (same preference as the lyric worker: same notes,
  // a fraction of the bytes of a WAV master).
  const listenUrl = new Map<string, string>();
  const resolve = (url: string) => listenUrl.get(url) || url;

  return {
    readAlbum: async (albumId) => {
      const a = await store.get(`albums/${albumId}`);
      if (!a) return null;
      const album = { ...a, id: albumId } as IntelAlbum;
      await Promise.all((album.tracks || []).map(async t => {
        if (!t?.id || !t.url) return;
        const st = await store.get(`choraStreams/${t.id}`).catch(() => null);
        if (st?.status === 'ready' && /^https?:/i.test(String(st.low || ''))) listenUrl.set(t.url, String(st.low));
      }));
      return album;
    },
    readJob: async (albumId) => (await store.get(`${JOBS}/${albumId}`)) as MusicIntelJob | null,
    patchJob: async (albumId, patch) => {
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) if (v !== undefined) clean[k] = v;
      await store.patch(`${JOBS}/${albumId}`, clean);
    },
    readTracks: async (albumId) => {
      const rows = await store.list(`${JOBS}/${albumId}/tracks`);
      return Object.fromEntries(rows.map(r => [r.id, r.data as TrackIntel]));
    },
    writeTrack: async (albumId, intel) => { await store.set(`${JOBS}/${albumId}/tracks/${encodeURIComponent(intel.trackId)}`, intel as any); },
    decode: async (url) => {
      const file = await cache.get(resolve(url));
      const buf = await ffmpegToBuffer(['-v', 'error', '-i', file, '-t', String(MEASURE_SEC), '-ac', '2', '-ar', '22050', '-f', 'f32le', 'pipe:1'], 120_000);
      if (!buf) return null;
      const pcm = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
      return { pcm, sampleRate: 22050, channels: 2 };
    },
    encodeForListening: async (url) => {
      const file = await cache.get(resolve(url));
      // Stereo, so the model can hear width and panning; 64 kb/s keeps a 9-minute song ~4 MB.
      const buf = await ffmpegToBuffer(['-v', 'error', '-i', file, '-t', String(LISTEN_SEC), '-ac', '2', '-ar', '32000', '-b:a', '64k', '-f', 'mp3', 'pipe:1'], 120_000);
      return buf ? { base64: buf.toString('base64'), mimeType: 'audio/mpeg' } : null;
    },
    listen: (prompt, audio) => gemini(audio ? [{ inlineData: { data: audio.base64, mimeType: audio.mimeType } }, { text: prompt }] : [{ text: prompt }], 12_000),
    think: (prompt) => gemini([{ text: prompt }], 10_000),
    ensureLyrics: extra.ensureLyrics ? (album, track) => extra.ensureLyrics!(album.id, track, album.artist) : undefined,
    findFilm: (album) => findFilmFor(album, store),
    cleanup: cache.cleanup,
  };
}

export async function runWith(extra: MusicIntelRouterDeps, albumId: string, opts: Parameters<typeof runMusicIntel>[2]) {
  const deps = liveDeps(extra);
  try { return await runMusicIntel(deps, albumId, opts); }
  finally { await deps.cleanup(); }
}

/** One in-flight run per album per container (the job lease covers other containers). */
const inflight = new Map<string, Promise<any>>();
function runOnce(extra: MusicIntelRouterDeps, albumId: string, opts: Parameters<typeof runMusicIntel>[2]) {
  let p = inflight.get(albumId);
  if (!p) { p = runWith(extra, albumId, opts).finally(() => inflight.delete(albumId)); inflight.set(albumId, p); }
  return p;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export function createMusicIntelRouter(extra: MusicIntelRouterDeps = {}): Router {
  const r = Router();

  r.post('/analyze', async (req: Request, res: Response) => {
    if (!adminConfig.hasCredentials()) return res.status(503).json({ error: 'Server not configured.' });
    const uid = await callerUid(req);
    if (!uid) return res.status(401).json({ error: 'Sign in required.' });
    const albumId = String(req.body?.albumId || '').trim();
    if (!ID_RE.test(albumId)) return res.status(400).json({ error: 'albumId is required.' });
    const album = await fsGet(`albums/${albumId}`);
    if (!album) return res.status(404).json({ error: 'No such album.' });
    if (album.ownerId !== uid && !(await isAdmin(uid))) return res.status(403).json({ error: 'Not your album.' });
    if (album.type !== 'MUSIC') return res.status(200).json({ status: 'NOT_MUSIC', remaining: 0 });
    try {
      const out = await runOnce(extra, albumId, { force: req.body?.force === true, ownerId: String(album.ownerId || uid), budgetMs: 5 * 60_000 });
      res.json(out);
    } catch (e: any) {
      console.error('[music-intel] analyze failed:', e?.message || e);
      res.status(502).json({ error: 'Analysis hit a snag; it will resume.' });
    }
  });

  r.post('/continue', async (req: Request, res: Response) => {
    const albumId = String(req.body?.albumId || '').trim();
    if (!ID_RE.test(albumId)) return res.status(400).json({ error: 'albumId is required.' });
    const album = await fsGet(`albums/${albumId}`);
    if (!album || album.type !== 'MUSIC') return res.status(404).json({ error: 'No such album.' });
    if (album.isPrivate === true) {
      const uid = await callerUid(req);
      if (uid !== album.ownerId) return res.status(404).json({ error: 'No such album.' });
    }
    const job = await fsGet(`${JOBS}/${albumId}`) as MusicIntelJob | null;
    // Only resume what the creator started: a page view never starts a paid analysis.
    if (!job) return res.json({ status: 'NONE' });
    const albumOnly = (job as any).needsResynth === true && !pendingTracks({ ...album, id: albumId } as IntelAlbum, job).length;
    if (!albumOnly && job.status !== 'LISTENING' && job.status !== 'SYNTHESIZING' && job.status !== 'QUEUED') return res.json({ status: job.status });
    try {
      if (albumOnly) await fsPatch(`${JOBS}/${albumId}`, { needsResynth: false });
      res.json(await runOnce(extra, albumId, { budgetMs: 3 * 60_000, albumOnly }));
    } catch (e: any) {
      res.status(502).json({ error: 'resume failed' });
    }
  });

  r.post('/link-film', async (req: Request, res: Response) => {
    const uid = await callerUid(req);
    if (!uid) return res.status(401).json({ error: 'Sign in required.' });
    const filmAlbumId = String(req.body?.filmAlbumId || '').trim();
    if (!ID_RE.test(filmAlbumId)) return res.status(400).json({ error: 'filmAlbumId is required.' });
    const film = await fsGet(`albums/${filmAlbumId}`);
    if (!film || film.ownerId !== uid) return res.status(404).json({ error: 'No such film.' });
    const jobs = (await fsQuery(JOBS, [{ field: 'ownerId', value: uid }], 100)).filter(j => j.data?.isSoundtrack && j.data?.film?.status !== 'LINKED');
    let linked = 0, pending = 0;
    for (const j of jobs) {
      const album = await fsGet(`albums/${j.id}`);
      if (!album) continue;
      const ctx = await findFilmFor({ ...album, id: j.id } as IntelAlbum);
      if (ctx.status === 'NONE' || ctx.filmAlbumId !== filmAlbumId) continue;
      await fsPatch(`${JOBS}/${j.id}`, { film: ctx, ...(ctx.status === 'LINKED' ? { needsResynth: true } : {}), filmCheckedAt: Date.now() });
      if (ctx.status === 'LINKED') linked++; else pending++;
    }
    res.json({ ok: true, linked, pending });
  });

  r.post('/cron', async (req: Request, res: Response) => {
    const expected = process.env.CHORA_CRON_KEY || '';
    if (!expected || String(req.get('x-chora-cron-key') || '') !== expected) return res.status(401).json({ error: 'invalid or missing cron key' });
    const started = Date.now();
    const out: any[] = [];
    for (const status of ['LISTENING', 'SYNTHESIZING', 'QUEUED']) {
      for (const j of await fsQuery(JOBS, [{ field: 'status', value: status }], 25)) {
        if (Date.now() - started > 4 * 60_000) break;
        out.push({ albumId: j.id, ...(await runOnce(extra, j.id, { budgetMs: Math.max(30_000, 4 * 60_000 - (Date.now() - started)) }).catch((e: any) => ({ error: e?.message }))) });
      }
    }
    res.json({ ok: true, ran: out });
  });

  r.get('/:albumId', async (req: Request, res: Response) => {
    const albumId = String(req.params.albumId || '');
    if (!ID_RE.test(albumId)) return res.status(400).json({ error: 'bad id' });
    const album = await fsGet(`albums/${albumId}`);
    if (!album) return res.status(404).json({ error: 'No such album.' });
    if (album.isPrivate === true) {
      const uid = await callerUid(req);
      if (uid !== album.ownerId) return res.status(404).json({ error: 'No such album.' });
    }
    let job = await fsGet(`${JOBS}/${albumId}`) as (MusicIntelJob & Record<string, any>) | null;
    // A soundtrack whose film wasn't analysed yet: re-check at most every 10 minutes, and when
    // the film's Story Intelligence has landed, flag the album read for a re-write in its light.
    if (job?.isSoundtrack && job.film?.status !== 'LINKED' && Date.now() - (Number(job.filmCheckedAt) || 0) > 10 * 60_000) {
      const ctx = await findFilmFor({ ...album, id: albumId } as IntelAlbum).catch(() => null);
      if (ctx) {
        const patch: Record<string, unknown> = { film: ctx, filmCheckedAt: Date.now(), ...(ctx.status === 'LINKED' ? { needsResynth: true } : {}) };
        await fsPatch(`${JOBS}/${albumId}`, patch);
        job = { ...job, ...patch } as any;
      }
    }
    const tracks = job ? Object.fromEntries((await fsList(`${JOBS}/${albumId}/tracks`, { maxDocs: 200 })).map(t => [t.data.trackId || decodeURIComponent(t.id), t.data as TrackIntel])) : {};
    if (job) { delete (job as any).leaseUntil; delete (job as any).attempts; }
    const body: MusicIntelBundle & { stalled?: boolean } = {
      job: job as MusicIntelJob | null,
      tracks,
      // The page offers to resume a job nobody is driving (uploader left, container recycled).
      stalled: !!job && ((['LISTENING', 'SYNTHESIZING', 'QUEUED'].includes(job.status) && Date.now() - job.updatedAt > 2 * 60_000) || job.needsResynth === true),
    };
    res.set('Cache-Control', 'private, max-age=15');
    res.json(body);
  });

  return r;
}
