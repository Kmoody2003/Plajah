// /api/story-intel — everything Story Intelligence has read for the signed-in account (Reello videos,
// films, albums), and filing what it found into the account's Worlds. Tela's workspace and Lorea's
// shelf use this; the per-video Reello routes (routes/reelloIntel.ts) stay for the uploader.
//
// Where each source keeps its record of what was filed (worldFiling):
//   video → reelloIntel/{videoId} · film → taleoAnalysis/{albumId} · album → musicIntel/{albumId}
// All three are server-written; the account can only file into Worlds it created.
//
// Rules (storyIntelRules/{uid}) add things without asking. Videos run them the moment a reading
// finishes (routes/reelloIntel.ts autoFileJob); films and albums are read by separate workers, so
// their rules run here the first time a newer reading is listed (rulesCheckedAt < updatedAt).

import { Router, Request } from 'express';
import { fsGet, fsPatch, fsSet, fsQuery, fsList, verifyIdToken, getAccessToken } from '../services/firebaseAdminRest';
import type { ReelloIntelJob, WorldFiling } from '../services/reello/intel/types';
import { FINDING_KEY_RE, autoFileKeys, sanitizeRules, type FindingEdits } from '../services/storyIntel/findings';
import { fileInto, matchesFor, ownWorld, skipIn, type FilingSource } from '../services/storyIntel/fileServer';
import {
  SOURCE_KINDS, albumFindings, filmFindings, videoSource, workingAlbum, workingFilm,
  type IntelSourceView, type SourceKind,
} from '../services/storyIntel/sources';

const RULES = 'storyIntelRules';
const ID_RE = /^[\w-]{1,128}$/;
const BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'gen-lang-client-0665118474.firebasestorage.app';
const DOC: Record<SourceKind, string> = { video: 'reelloIntel', film: 'taleoAnalysis', album: 'musicIntel' };

export interface StoryIntelStore {
  get(path: string): Promise<Record<string, any> | null>;
  set(path: string, data: Record<string, unknown>): Promise<unknown>;
  patch(path: string, data: Record<string, unknown>): Promise<unknown>;
  query(collection: string, filters: { field: string; value: string | number | boolean }[], limit: number): Promise<Array<{ id: string; data: Record<string, any> }>>;
  list?(collection: string, max: number): Promise<Array<{ id: string; data: Record<string, any> }>>;
  /** A JSON object from Cloud Storage (film reports). */
  storageJson(objectPath: string): Promise<any | null>;
}

export interface StoryIntelDeps {
  store?: StoryIntelStore;
  callerUid?(req: Request): Promise<string | null>;
  now?(): number;
}

async function readStorageJson(objectPath: string): Promise<any | null> {
  try {
    const token = await getAccessToken();
    const res = await fetch(`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(objectPath)}?alt=media`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(20_000),
    });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

const adminStore: StoryIntelStore = {
  get: fsGet, set: fsSet, patch: fsPatch, query: fsQuery,
  list: (c, max) => fsList(c, { maxDocs: max }), storageJson: readStorageJson,
};

// Film reports are large and change only when re-read: keep them per (path, updatedAt).
const reportCache = new Map<string, any>();
async function filmReport(store: StoryIntelStore, job: Record<string, any>, albumId: string) {
  const path = String(job.reportPath || `taleoAnalysis/${job.ownerId}/${albumId}/report.json`);
  const key = `${path}@${job.updatedAt || 0}`;
  if (reportCache.has(key)) return reportCache.get(key);
  const r = await store.storageJson(path);
  if (r) { if (reportCache.size > 60) reportCache.clear(); reportCache.set(key, r); }
  return r;
}

/** One source, as the workspace shows it. Null when it isn't the caller's. */
export async function loadSource(store: StoryIntelStore, kind: SourceKind, id: string, uid: string, docIn?: Record<string, any>): Promise<IntelSourceView | null> {
  if (!ID_RE.test(id)) return null;
  const doc = docIn || await store.get(`${DOC[kind]}/${id}`);
  if (!doc || doc.ownerId !== uid) return null;
  if (kind === 'video') {
    const video = await store.get(`videos/${id}`);
    return videoSource({ ...(doc as ReelloIntelJob), videoId: id }, video);
  }
  const album = (await store.get(`albums/${id}`)) || {};
  const title = String(album.title || (kind === 'film' ? 'Untitled film' : 'Untitled album'));
  const track0 = Array.isArray(album.tracks) ? album.tracks[0] : null;
  const base = {
    kind, id, title, error: doc.error, updatedAt: Number(doc.updatedAt || 0), filing: (doc.worldFiling || {}) as Record<string, WorldFiling>,
    thumbUrl: album.coverImage || album.thumbnailUrl || undefined,
  };
  if (kind === 'film') {
    const ready = doc.status === 'READY' || doc.status === 'PARTIAL';
    const report = ready ? await filmReport(store, doc, id) : null;
    const year = Number(album.releaseYear) || new Date(Number(album.createdAt) || Number(doc.createdAt) || Date.now()).getFullYear();
    return {
      ...base,
      status: ready ? 'READY' : workingFilm.has(doc.status) ? 'WORKING' : doc.status === 'SKIPPED' ? 'SKIPPED' : 'FAILED',
      stage: doc.progress?.stage, pct: doc.progress?.pct,
      playbackId: track0?.muxPlaybackId || (await store.get(`videos/${id}`))?.muxPlaybackId || undefined,
      durationSec: Number(track0?.duration) || undefined,
      findings: report ? filmFindings(report, { albumId: id, ownerId: uid, title, year, bucket: BUCKET }) : [],
      ...(ready && !report ? { error: 'The film report could not be read.' } : {}),
    };
  }
  const ready = doc.status === 'READY' || doc.status === 'PARTIAL';
  return {
    ...base,
    status: ready ? 'READY' : workingAlbum.has(doc.status) ? 'WORKING' : 'FAILED',
    stage: doc.progress ? `Listening · ${doc.progress.done || 0} of ${doc.progress.total || 0} songs` : undefined,
    pct: doc.progress?.total ? Math.round((100 * (doc.progress.done || 0)) / doc.progress.total) : undefined,
    findings: ready ? albumFindings(album, doc, { albumId: id }) : [],
  };
}

const asFiling = (v: IntelSourceView): FilingSource => ({ id: v.id, findings: v.findings, filing: v.filing });

/** Run the owner's rules on one source. Returns how many it added. */
export async function autoFileSource(store: StoryIntelStore, uid: string, v: IntelSourceView, now: () => number): Promise<number> {
  if (v.status !== 'READY' || !v.findings.length) return 0;
  const rules = sanitizeRules(await store.get(`${RULES}/${uid}`));
  if (!rules.enabled) return 0;
  const world = await ownWorld(store, uid, rules.worldId);
  if (!world) return 0;
  const matches = await matchesFor(store, world, rules.worldId, asFiling(v));
  const keys = autoFileKeys(v.findings, v.filing, new Set(Object.keys(matches)), rules);
  if (!keys.length) return 0;
  const ordered = [...keys.filter(k => !k.startsWith('rel:')), ...keys.filter(k => k.startsWith('rel:'))];
  const { results, filing } = await fileInto(store, { uid, world, worldId: rules.worldId, src: asFiling(v), items: ordered.map(key => ({ key })), now });
  for (const r of results) if (r.ok && filing[r.key]) filing[r.key] = { ...filing[r.key], auto: true };
  await store.patch(`${DOC[v.kind]}/${v.id}`, { worldFiling: filing });
  v.filing = filing;
  return results.filter(r => r.ok).length;
}

export function createStoryIntelRouter(deps: StoryIntelDeps = {}): Router {
  const store = deps.store || adminStore;
  const now = deps.now || (() => Date.now());
  const caller = deps.callerUid || (async (req: Request) => {
    const a = req.headers.authorization;
    return a?.startsWith('Bearer ') ? verifyIdToken(a.slice(7)) : null;
  });
  const r = Router();
  const kindOf = (s: unknown): SourceKind | null => (SOURCE_KINDS as string[]).includes(String(s)) ? s as SourceKind : null;

  const listAll = async (uid: string) => {
    const rows = await Promise.all(SOURCE_KINDS.map(k => store.query(DOC[k], [{ field: 'ownerId', value: uid }], 200).then(rs => rs.map(row => ({ k, row })))));
    const views = (await Promise.all(rows.flat().map(({ k, row }) => loadSource(store, k, row.id, uid, row.data).catch(() => null))))
      .filter((v): v is IntelSourceView => !!v);
    return { views, docs: new Map(rows.flat().map(({ k, row }) => [`${k}/${row.id}`, row.data])) };
  };

  r.get('/sources', async (req, res) => {
    const uid = await caller(req);
    if (!uid) return res.status(401).json({ error: 'Sign in required.' });
    const { views, docs } = await listAll(uid);
    // Films and albums: run the rules once per new reading.
    for (const v of views) {
      if (v.kind === 'video' || v.status !== 'READY') continue;
      const d = docs.get(`${v.kind}/${v.id}`) || {};
      if (Number(d.rulesCheckedAt || 0) >= Number(d.updatedAt || 0)) continue;
      await autoFileSource(store, uid, v, now).catch(() => 0);
      await store.patch(`${DOC[v.kind]}/${v.id}`, { rulesCheckedAt: Math.max(now(), Number(d.updatedAt || 0)) }).catch(() => null);
    }
    res.json({ sources: views.sort((a, b) => b.updatedAt - a.updatedAt) });
  });

  r.get('/rules', async (req, res) => {
    const uid = await caller(req);
    if (!uid) return res.status(401).json({ error: 'Sign in required.' });
    res.json({ rules: sanitizeRules(await store.get(`${RULES}/${uid}`)) });
  });

  r.put('/rules', async (req, res) => {
    const uid = await caller(req);
    if (!uid) return res.status(401).json({ error: 'Sign in required.' });
    const rules = sanitizeRules(req.body);
    if (rules.worldId && !(await ownWorld(store, uid, rules.worldId))) return res.status(404).json({ error: 'That World isn’t yours.' });
    await store.set(`${RULES}/${uid}`, { ...rules, updatedAt: now() });
    let applied = 0;
    // Turning a rule on does what it says straight away, for everything already waiting.
    if (rules.enabled) for (const v of (await listAll(uid)).views) applied += await autoFileSource(store, uid, v, now).catch(() => 0);
    res.json({ rules, applied });
  });

  r.get('/:kind/:id/world', async (req, res) => {
    const uid = await caller(req);
    if (!uid) return res.status(401).json({ error: 'Sign in required.' });
    const kind = kindOf(req.params.kind);
    const v = kind && await loadSource(store, kind, String(req.params.id), uid);
    if (!v) return res.status(404).json({ error: 'Not found.' });
    const worldId = String(req.query.worldId || '');
    const world = await ownWorld(store, uid, worldId);
    if (!world) return res.status(404).json({ error: 'That World isn’t yours.' });
    res.json({ matches: await matchesFor(store, world, worldId, asFiling(v)) });
  });

  r.post('/:kind/:id/file', async (req, res) => {
    const uid = await caller(req);
    if (!uid) return res.status(401).json({ error: 'Sign in required.' });
    const kind = kindOf(req.params.kind);
    const v = kind && await loadSource(store, kind, String(req.params.id), uid);
    if (!v || !kind) return res.status(404).json({ error: 'Not found.' });
    const worldId = String(req.body?.worldId || '');
    const world = await ownWorld(store, uid, worldId);
    if (!world) return res.status(404).json({ error: 'That World isn’t yours.' });
    const items = (Array.isArray(req.body?.items) ? req.body.items : []).slice(0, 100) as Array<{ key?: string; edits?: FindingEdits }>;
    if (!items.length || items.some(i => !FINDING_KEY_RE.test(String(i?.key || '')))) return res.status(400).json({ error: 'bad request' });
    const { results, filing } = await fileInto(store, { uid, world, worldId, src: asFiling(v), items: items.map(i => ({ key: String(i.key), edits: i.edits })), now });
    await store.patch(`${DOC[kind]}/${v.id}`, { worldFiling: filing });
    res.json({ results, worldFiling: filing });
  });

  r.post('/:kind/:id/skip', async (req, res) => {
    const uid = await caller(req);
    if (!uid) return res.status(401).json({ error: 'Sign in required.' });
    const kind = kindOf(req.params.kind);
    const v = kind && await loadSource(store, kind, String(req.params.id), uid);
    if (!v || !kind) return res.status(404).json({ error: 'Not found.' });
    const keys = (Array.isArray(req.body?.keys) ? req.body.keys : [req.body?.key]).map((k: unknown) => String(k || '')).slice(0, 100);
    if (!keys.length || keys.some((k: string) => !FINDING_KEY_RE.test(k))) return res.status(400).json({ error: 'bad request' });
    const filing = skipIn(v.filing, keys, req.body?.undo === true, now());
    await store.patch(`${DOC[kind]}/${v.id}`, { worldFiling: filing });
    res.json({ worldFiling: filing });
  });

  return r;
}
