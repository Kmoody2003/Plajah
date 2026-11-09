// routes/hqB2.ts — Content HQ uploads to B2 (resumable, size-pinned), and deleting B2-held HQ files.
//
//   POST   /uploads                 { scopeKind, scopeId, name, size, mime, folder? } → single PUT or multipart id
//   POST   /uploads/:id/parts       { partNumbers }                                  → part links
//   POST   /uploads/:id/complete    { parts? }                                       → the orgAssets record
//   DELETE /uploads/:id                                                              → abort
//   DELETE /assets/:id                                                               → erase a B2-held file
//
// OFF until HQ_B2_ENABLED=1 (begin answers 503 b2_off and the browser keeps using Firebase Storage).
// Turn on only after plajah-private's CORS allows PUT from Plajah origins and exposes ETag.
// Mounted in server.ts next to /api/hq/quota-check, with HQ's own canWriteHqScope + resolveHqCapBytes.

import { Router, type Request, type Response } from 'express';
import { randomBytes } from 'node:crypto';
import { verifyIdTokenDetailed, fsGet, fsSet, fsQuery, fsDelete } from '../services/firebaseAdminRest';
import { objectStoreConfigFromEnv } from './objectStore';
import { canWriteHqFileServer } from '../services/hqServerAccess';
import { addOnBySku } from '../services/drive/plans';
import {
  abortHqUpload, beginHqUpload, completeHqUpload, deleteHqB2Objects, HqUploadError, isB2Path, signHqParts,
  type HqB2Deps, type HqScopeKind,
} from '../services/hq/b2Store';

export interface HqB2RouteDeps extends HqB2Deps {
  callerUid: (req: Request) => Promise<string | null>;
  canWriteFile: (uid: string, asset: Record<string, any>) => Promise<boolean>;
  /** Storage paths of every version of a file. */
  versionPaths: (assetId: string) => Promise<string[]>;
}

/** Drive storage add-ons stack on top of HQ's plan cap: personal for a person (or a business page's owner), pools for an org. */
export async function addOnBytes(kind: HqScopeKind, scopeId: string, uid: string, get = fsGet): Promise<number> {
  const sum = (skus: unknown, scope: 'personal' | 'org') => (Array.isArray(skus) ? skus : [])
    .reduce((t: number, s: string) => { const a = addOnBySku(String(s)); return t + (a?.scope === scope ? a.bytes : 0); }, 0);
  if (kind === 'org') { const d = await get(`orgDrive/${scopeId}`); return d ? sum(d.poolSkus, 'org') : 0; }
  let owner = uid;
  if (kind === 'business') { const page = await get(`businessPages/${scopeId}`); if (!page?.ownerId) return 0; owner = String(page.ownerId); }
  const d = await get(`driveAccounts/${owner}`);
  return d ? sum(d.addOnSkus, 'personal') : 0;
}

export function liveHqB2Deps(hq: {
  canWriteScope: (uid: string, kind: string, scopeId: string) => Promise<boolean>;
  capBytes: (kind: string, scopeId: string, uid: string) => Promise<number>;
}): HqB2RouteDeps {
  return {
    callerUid: async req => {
      const h = req.headers.authorization;
      const t = h?.startsWith('Bearer ') ? await verifyIdTokenDetailed(h.slice(7)) : null;
      return t && !t.isAnonymous ? t.uid : null;
    },
    enabled: () => process.env.HQ_B2_ENABLED === '1',
    s3: () => objectStoreConfigFromEnv(),
    get: fsGet,
    set: fsSet,
    remove: fsDelete,
    pendingFor: scopeId => fsQuery('hqUploads', [{ field: 'scopeId', value: scopeId }, { field: 'status', value: 'pending' }], 200),
    canWrite: hq.canWriteScope,
    usedBytes: async (_kind, scopeId) => (await fsQuery('orgAssets', [{ field: 'scopeId', value: scopeId }], 5000))
      .reduce((t, r) => t + (r.data.deletedAt ? 0 : Number(r.data.sizeBytes || 0)), 0),
    capBytes: async (kind, scopeId, uid) => {
      const base = await hq.capBytes(kind, scopeId, uid);
      return base > 0 ? base + await addOnBytes(kind, scopeId, uid) : 0;
    },
    canWriteFile: canWriteHqFileServer,
    versionPaths: async assetId => (await fsQuery('hqAssetVersions', [{ field: 'assetId', value: assetId }], 300)).map(r => String(r.data.storagePath || '')),
    now: () => Date.now(),
    newId: () => randomBytes(12).toString('base64url'),
  };
}

export function createHqB2Router(deps: HqB2RouteDeps) {
  const router = Router();
  router.use(async (req: Request, res: Response, next) => {
    const uid = await deps.callerUid(req).catch(() => null);
    if (!uid) return res.status(401).json({ error: 'Sign in first.' });
    (req as any).uid = uid;
    res.setHeader('Cache-Control', 'private, no-store');
    next();
  });
  const handle = (fn: (req: Request) => Promise<unknown>) => async (req: Request, res: Response) => {
    try { res.json(await fn(req)); }
    catch (e: any) {
      if (e instanceof HqUploadError) return res.status(e.status).json({ error: e.message, code: e.code });
      console.warn('[hq-b2]', e?.message || e);
      res.status(502).json({ error: 'Storage is having trouble. Please try again.', code: 'storage_error' });
    }
  };
  const uid = (req: Request) => String((req as any).uid);
  const id = (req: Request) => String(req.params.id);

  router.post('/uploads', handle(req => beginHqUpload(uid(req), req.body || {}, deps)));
  router.post('/uploads/:id/parts', handle(async req => ({ parts: await signHqParts(uid(req), id(req), req.body?.partNumbers, deps) })));
  router.post('/uploads/:id/complete', handle(async req => ({ asset: await completeHqUpload(uid(req), id(req), req.body?.parts, deps) })));
  router.delete('/uploads/:id', handle(async req => { await abortHqUpload(uid(req), id(req), deps); return { ok: true }; }));

  router.delete('/assets/:id', handle(async req => {
    const assetId = id(req);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(assetId)) throw new HqUploadError('not_found', 'File not found.', 404);
    const asset = await deps.get(`orgAssets/${assetId}`);
    if (!asset) throw new HqUploadError('not_found', 'File not found.', 404);
    if (!(await deps.canWriteFile(uid(req), asset))) throw new HqUploadError('forbidden', 'Forbidden', 403);
    const versions = await deps.versionPaths(assetId);
    const paths = [String(asset.storagePath || ''), ...versions].filter(isB2Path);
    const erased = paths.length ? await deleteHqB2Objects(paths, deps) : 0;
    await deps.remove(`orgAssetText/${assetId}`);
    await deps.remove(`orgAssets/${assetId}`);
    return { ok: true, erased };
  }));

  return router;
}
