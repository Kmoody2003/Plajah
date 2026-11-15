// Org media — organizations publish media as themselves (Reello / Lorea / Chora) to an audience:
// PUBLIC, ORG, DEPARTMENT or CLASS (services/orgPublish/audienceCore.ts). Internal items play through
// signed Mux playback, so access is checked here on every play, never by Firestore rules.
//
//   POST   /uploads { orgId, audience, departmentId?, classId?, app, title, playlist?, source? }
//                      → { id, url }   creates a Mux direct upload (signed unless PUBLIC); the browser PUTs to url
//   POST   /:id/finalize               owner: Mux upload → asset → playback id; { status } (poll until READY)
//   GET    /list?orgId=&departmentId?&classId?&app?   items the caller may see, grouped into playlists
//   GET    /:id/play                   { playbackId, token?, thumbToken? } for a viewer the rules let in
//   DELETE /:id                        its owner, or someone who may publish to that audience
//
// Records live in `orgMedia/{id}` (plajah-ops, server-only: no client rule matches it).
// Mounted in server.ts as: app.use('/api/org-media', apiLimiter, express.json({ limit: '8kb' }), createOrgMediaRouter({ mux }))

import { Router, Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { verifyIdTokenDetailed, fsGet, fsSet, fsPatch, fsQuery } from '../services/firebaseAdminRest';
import {
  ORG_MEDIA_APPS, canPublishOrgMedia, canViewOrgMedia, groupPlaylists, inScope, parseTarget, publicView,
  type AccessCtx, type ClassRef, type OrgMediaApp, type OrgMediaRecord, type OrgMediaTarget,
} from '../services/orgPublish/audienceCore';
import { signMuxPlayback, signingKeyFromEnv, type MuxSigningKey } from '../services/orgPublish/muxSign';

export interface OrgMediaStore {
  get(path: string): Promise<Record<string, any> | null>;
  set(path: string, data: Record<string, unknown>): Promise<boolean>;
  patch(path: string, data: Record<string, unknown>): Promise<boolean>;
  query(collection: string, filters: { field: string; value: string | number | boolean }[], limit?: number): Promise<Array<{ id: string; data: Record<string, any> }>>;
}
export interface OrgMediaMux {
  createUpload(opts: { signed: boolean; passthrough: string; corsOrigin: string }): Promise<{ id: string; url: string }>;
  getUpload(id: string): Promise<{ status?: string; assetId?: string }>;
  getAsset(id: string): Promise<{ status?: string; playbackId?: string; durationSec?: number }>;
}

const adminStore: OrgMediaStore = {
  get: fsGet,
  set: fsSet,
  patch: fsPatch,
  query: (c, f, l) => fsQuery(c, f, l),
};

async function tokenUid(req: Request): Promise<string | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  const t = await verifyIdTokenDetailed(auth.slice(7));
  return t && !t.isAnonymous ? t.uid : null;
}
const badId = (s: string) => !s || s.length > 128 || /[\/]/.test(s);
const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

export function createOrgMediaRouter(deps: {
  mux: OrgMediaMux | null;
  store?: OrgMediaStore;
  callerUid?: (req: Request) => Promise<string | null>;
  signingKey?: () => MuxSigningKey | null;
  corsOrigin?: (req: Request) => string;
}): Router {
  const r = Router();
  const store = deps.store || adminStore;
  const callerUid = deps.callerUid || tokenUid;
  const signingKey = deps.signingKey || (() => signingKeyFromEnv());
  const corsOrigin = deps.corsOrigin || ((req: Request) => String(req.headers.origin || '*'));

  async function ctxFor(uid: string, t: OrgMediaTarget): Promise<AccessCtx> {
    const [org, rows, cls] = await Promise.all([
      store.get(`organizations/${t.orgId}`),
      uid ? store.query('orgMemberships', [{ field: 'userId', value: uid }], 200) : Promise.resolve([]),
      t.classId ? store.get(`churchPrograms/${t.classId}`) : Promise.resolve(null),
    ]);
    const membership = rows.map(x => x.data).find(m => m.orgId === t.orgId) || null;
    return { org, membership, cls: (cls as ClassRef | null) || null };
  }

  // ── Create an upload ──
  r.post('/uploads', async (req: Request, res: Response) => {
    const uid = await callerUid(req);
    if (!uid) return res.status(401).json({ error: 'Sign in first.' });
    if (!deps.mux) return res.status(503).json({ error: 'Video uploads are not configured.' });
    const t = parseTarget(req.body || {});
    if (typeof t === 'string') return res.status(400).json({ error: t });
    const signed = t.audience !== 'PUBLIC';
    if (signed && !signingKey()) return res.status(503).json({ error: 'Private playback is not set up yet (Mux signing key missing).', code: 'NO_SIGNING_KEY' });
    const app: OrgMediaApp = ORG_MEDIA_APPS.includes(req.body?.app) ? req.body.app : 'reello';
    const ctx = await ctxFor(uid, t);
    if (!ctx.org) return res.status(404).json({ error: 'Organization not found.' });
    if (!canPublishOrgMedia(uid, t, ctx)) return res.status(403).json({ error: 'You can’t publish to that audience.' });
    const cls = ctx.cls;
    const id = `om_${Date.now().toString(36)}${randomBytes(4).toString('hex')}`;
    const upload = await deps.mux.createUpload({ signed, passthrough: `uid=${uid};orgMedia=${id}`, corsOrigin: corsOrigin(req) });
    const now = Date.now();
    const rec: OrgMediaRecord = {
      id, ...t,
      // A class item also belongs to its class's department, so the department page can list it.
      ...(t.audience === 'CLASS' && cls?.departmentId && !t.departmentId ? { departmentId: cls.departmentId } : {}),
      app, kind: 'video', title: clip(req.body?.title, 200) || 'Untitled', playlist: clip(req.body?.playlist, 120) || undefined,
      ownerUid: uid, status: 'UPLOADING', muxUploadId: upload.id, playbackPolicy: signed ? 'signed' : 'public',
      source: req.body?.source === 'class-live' ? 'class-live' : 'upload', createdAt: now, updatedAt: now,
    };
    await store.set(`orgMedia/${id}`, JSON.parse(JSON.stringify(rec)));
    return res.json({ id, url: upload.url });
  });

  // ── Finalize (owner polls until READY) ──
  r.post('/:id/finalize', async (req: Request, res: Response) => {
    const uid = await callerUid(req);
    if (!uid) return res.status(401).json({ error: 'Sign in first.' });
    if (badId(req.params.id)) return res.status(400).json({ error: 'Bad request.' });
    const rec = await store.get(`orgMedia/${req.params.id}`) as OrgMediaRecord | null;
    if (!rec || rec.status === 'DELETED') return res.status(404).json({ error: 'Not found.' });
    if (rec.ownerUid !== uid) return res.status(403).json({ error: 'Not your upload.' });
    if (rec.status === 'READY') return res.json({ status: 'READY' });
    if (!deps.mux) return res.status(503).json({ error: 'Video uploads are not configured.' });
    const patch: Partial<OrgMediaRecord> = { updatedAt: Date.now() };
    let assetId = rec.muxAssetId;
    if (!assetId && rec.muxUploadId) {
      const up = await deps.mux.getUpload(rec.muxUploadId);
      if (up.status === 'errored' || up.status === 'cancelled' || up.status === 'timed_out') patch.status = 'ERRORED';
      assetId = up.assetId;
      if (assetId) { patch.muxAssetId = assetId; patch.status = 'PROCESSING'; }
    }
    if (assetId) {
      const a = await deps.mux.getAsset(assetId);
      if (a.status === 'errored') patch.status = 'ERRORED';
      else if (a.playbackId && a.status === 'ready') {
        patch.status = 'READY';
        patch.muxPlaybackId = a.playbackId;
        if (a.durationSec) patch.durationSec = Math.round(a.durationSec);
      }
    }
    await store.patch(`orgMedia/${rec.id}`, patch as Record<string, unknown>);
    return res.json({ status: patch.status || rec.status });
  });

  // ── List what the caller may see ──
  r.get('/list', async (req: Request, res: Response) => {
    const uid = (await callerUid(req)) || '';
    const orgId = String(req.query.orgId || '');
    if (badId(orgId)) return res.status(400).json({ error: 'Bad request.' });
    const scope = { departmentId: String(req.query.departmentId || '') || undefined, classId: String(req.query.classId || '') || undefined };
    const app = String(req.query.app || '');
    const rows = await store.query('orgMedia', [{ field: 'orgId', value: orgId }], 500);
    const candidates = rows.map(x => x.data as OrgMediaRecord)
      .filter(rec => rec.status !== 'DELETED' && inScope(rec, scope) && (!app || rec.app === app))
      // The uploader sees their own items while they process; everyone else only finished ones.
      .filter(rec => rec.status === 'READY' || rec.ownerUid === uid);
    // One access context per class (or the org) — not one per item.
    const ctxCache = new Map<string, Promise<AccessCtx>>();
    const ctx = (rec: OrgMediaRecord) => {
      const k = rec.classId || '';
      if (!ctxCache.has(k)) ctxCache.set(k, ctxFor(uid, rec));
      return ctxCache.get(k)!;
    };
    const visible: OrgMediaRecord[] = [];
    for (const rec of candidates) if (rec.ownerUid === uid || canViewOrgMedia(uid, rec, await ctx(rec))) visible.push(rec);
    const playlists = groupPlaylists(visible.map(publicView));
    return res.json({ playlists, signedPlayback: !!signingKey() });
  });

  // ── Play ──
  r.get('/:id/play', async (req: Request, res: Response) => {
    const uid = (await callerUid(req)) || '';
    if (badId(req.params.id)) return res.status(400).json({ error: 'Bad request.' });
    const rec = await store.get(`orgMedia/${req.params.id}`) as OrgMediaRecord | null;
    if (!rec || rec.status === 'DELETED') return res.status(404).json({ error: 'Not found.' });
    if (rec.ownerUid !== uid && !canViewOrgMedia(uid, rec, await ctxFor(uid, rec))) return res.status(403).json({ error: 'This is only for members.' });
    if (rec.status !== 'READY' || !rec.muxPlaybackId) return res.status(409).json({ error: 'Still processing.', status: rec.status });
    if (rec.playbackPolicy === 'public') return res.json({ playbackId: rec.muxPlaybackId });
    const key = signingKey();
    if (!key) return res.status(503).json({ error: 'Private playback is not set up yet.', code: 'NO_SIGNING_KEY' });
    return res.json({
      playbackId: rec.muxPlaybackId,
      token: signMuxPlayback(rec.muxPlaybackId, 'v', key),
      thumbToken: signMuxPlayback(rec.muxPlaybackId, 't', key),
    });
  });

  // ── Delete ──
  r.delete('/:id', async (req: Request, res: Response) => {
    const uid = await callerUid(req);
    if (!uid) return res.status(401).json({ error: 'Sign in first.' });
    if (badId(req.params.id)) return res.status(400).json({ error: 'Bad request.' });
    const rec = await store.get(`orgMedia/${req.params.id}`) as OrgMediaRecord | null;
    if (!rec || rec.status === 'DELETED') return res.status(404).json({ error: 'Not found.' });
    if (rec.ownerUid !== uid && !canPublishOrgMedia(uid, rec, await ctxFor(uid, rec))) return res.status(403).json({ error: 'Not allowed.' });
    await store.patch(`orgMedia/${rec.id}`, { status: 'DELETED', updatedAt: Date.now() });
    return res.json({ ok: true });
  });

  return r;
}
