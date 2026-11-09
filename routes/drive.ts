// routes/drive.ts — Plajah Drive uploads with quota checks. Files on B2, downloads via Bunny.
//
//   POST   /uploads                 { scope, name, size, mime, parentId? } → single PUT link or multipart id
//   POST   /uploads/:id/parts       { partNumbers: [1..] }                 → part links (≤100 per call)
//   POST   /uploads/:id/complete    { parts?: [{ partNumber, etag }] }    → file record (true size checked)
//   DELETE /uploads/:id                                                    → abort, space released
//   GET    /usage?org=<orgId>                                              → allowance, used, reserved, state
//   GET    /items?org=&parent=&trash=1                                     → folder contents + breadcrumb
//   POST   /folders                 { org?, name, parentId?, departmentId? }
//   PATCH  /items/:id               { org?, name?, parentId? }             → rename / move
//   POST   /items/:id/trash | /restore | DELETE /items/:id (forever, trash only)
//   GET    /items/:id/download?org=&inline=1                               → signed link (10 min)
// scope = { kind: 'u' } (personal Drive) | { kind: 'o', orgId, departmentId? } (org pool)
//
// Mounted in server.ts at /api/drive; OFF until DRIVE_ENABLED=1 (503 drive_off):
//   app.use('/api/drive', express.json({ limit: '64kb' }), driveRouter)
// Uses the same B2 env as routes/objectStore.ts (OBJECT_STORE_*). Server-only Firestore docs:
//   driveAccounts/{uid}  { plan?, addOnSkus[] }       orgDrive/{orgId}  { plan?, poolSkus[], extraTb?, departmentCaps, memberCaps }
//   driveUsage/{u_uid|o_orgId}   driveUploads/{id}   driveFiles/{fileId}
// These need deny-all client rules (server writes only) before the route is mounted.

import { Router, type Request, type Response } from 'express';
import { randomBytes } from 'node:crypto';
import { verifyIdTokenDetailed, fsGet, fsSet, fsQuery, fsDelete } from '../services/firebaseAdminRest';
import { objectStoreConfigFromEnv } from './objectStore';
import {
  abortUpload, beginUpload, completeUpload, DriveError, signParts, usageSummary, type Scope, type UploadDeps, type OrgAccess,
} from '../services/drive/uploads';
import type { DrivePlan } from '../services/drive/plans';
import {
  createFolder, deleteForever, downloadLink, listFolder, restoreItem, trashItem, updateItem, type LibraryDeps,
} from '../services/drive/library';

export interface DriveRouteDeps extends LibraryDeps {
  callerUid: (req: Request) => Promise<string | null>;
  enabled: () => boolean;
}

const newId = () => randomBytes(12).toString('base64url');

/** Plajah+ tier → Drive plan. New tiers (All Access, Studio Max, team plans) map here when they exist. */
const TIER_PLAN: Record<number, DrivePlan> = { 1: 'spark', 2: 'glow', 3: 'nova' };

async function livePersonal(uid: string) {
  const [acct, subs] = await Promise.all([
    fsGet(`driveAccounts/${uid}`),
    fsQuery('plajahPlusSubscriptions', [{ field: 'subscriberId', value: uid }], 20).catch(() => []),
  ]);
  const active = subs.find(r => r.data.status === 'active' || r.data.status === 'trialing');
  const plan: DrivePlan = (acct?.plan as DrivePlan) || (active ? TIER_PLAN[Number(active.data.tier)] ?? 'spark' : 'free');
  return { plan, addOnSkus: Array.isArray(acct?.addOnSkus) ? acct!.addOnSkus : [] };
}

async function liveOrgAccess(uid: string, orgId: string): Promise<OrgAccess> {
  const org = await fsGet(`organizations/${orgId}`);
  if (!org) return null;
  if (org.creatorId === uid || (org.admins || []).includes(uid) || (org.itAdminUids || []).includes(uid)) return 'admin';
  if ((org.staffUids || []).includes(uid)) return 'staff';
  return null;
}

/** Department membership from org-level sources (head lists + departmentUids index). */
async function liveInDepartment(uid: string, orgId: string, departmentId: string): Promise<boolean> {
  const org = await fsGet(`organizations/${orgId}`);
  if (!org) return false;
  const m = (org.ministries || []).find((x: any) => x.id === departmentId);
  if (m && (m.headUids || []).includes(uid)) return true;
  const idx = org.departmentUids?.[departmentId];
  return Array.isArray(idx) && idx.includes(uid);
}

const live: DriveRouteDeps = {
  callerUid: async req => {
    const h = req.headers.authorization;
    const t = h?.startsWith('Bearer ') ? await verifyIdTokenDetailed(h.slice(7)) : null;
    return t && !t.isAnonymous ? t.uid : null;
  },
  enabled: () => process.env.DRIVE_ENABLED === '1',
  store: { get: fsGet, set: fsSet },
  s3: () => objectStoreConfigFromEnv(),
  personal: livePersonal,
  orgPool: async orgId => {
    const d = await fsGet(`orgDrive/${orgId}`);
    return d ? { plan: d.plan, poolSkus: d.poolSkus || [], extraTb: d.extraTb || 0, departmentCaps: d.departmentCaps || {}, memberCaps: d.memberCaps || {} } : null;
  },
  orgAccess: liveOrgAccess,
  inDepartment: liveInDepartment,
  now: () => Date.now(),
  newId,
  query: (collection, field, value, limit) => fsQuery(collection, [{ field, value }], limit),
  remove: fsDelete,
};

function parseScope(s: any): Scope | null {
  if (s?.kind === 'u') return { kind: 'u' };
  if (s?.kind === 'o' && typeof s.orgId === 'string') return { kind: 'o', orgId: s.orgId, ...(typeof s.departmentId === 'string' ? { departmentId: s.departmentId } : {}) };
  return null;
}

export function createDriveRouter(deps: DriveRouteDeps = live) {
  const router = Router();

  router.use(async (req: Request, res: Response, next) => {
    if (!deps.enabled()) return res.status(503).json({ error: 'Drive isn’t open yet.', code: 'drive_off' });
    const uid = await deps.callerUid(req).catch(() => null);
    if (!uid) return res.status(401).json({ error: 'Sign in to use Drive.' });
    (req as any).uid = uid;
    next();
  });

  const handle = (fn: (req: Request) => Promise<unknown>) => async (req: Request, res: Response) => {
    try { res.json(await fn(req)); }
    catch (e: any) {
      if (e instanceof DriveError) return res.status(e.status).json({ error: e.message, code: e.code });
      console.warn('[drive]', e?.message || e);
      res.status(502).json({ error: 'Storage is having trouble. Please try again.', code: 'storage_error' });
    }
  };

  router.post('/uploads', handle(async req => {
    const b = req.body || {};
    const scope = parseScope(b.scope);
    if (!scope) throw new DriveError('bad_scope', 'Choose where the file goes.');
    return beginUpload((req as any).uid, { scope, name: b.name, size: b.size, mime: b.mime, parentId: b.parentId }, deps);
  }));

  router.post('/uploads/:id/parts', handle(async req => ({ parts: await signParts((req as any).uid, String(req.params.id), req.body?.partNumbers, deps) })));

  router.post('/uploads/:id/complete', handle(async req => ({ file: await completeUpload((req as any).uid, String(req.params.id), req.body?.parts, deps) })));

  router.delete('/uploads/:id', handle(async req => { await abortUpload((req as any).uid, String(req.params.id), deps); return { ok: true }; }));

  router.get('/usage', handle(async req => {
    const org = typeof req.query.org === 'string' ? req.query.org : '';
    return usageSummary((req as any).uid, org ? { kind: 'o', orgId: org } : { kind: 'u' }, deps);
  }));

  const orgScope = (v: unknown): Scope => (typeof v === 'string' && v ? { kind: 'o', orgId: v } : { kind: 'u' });
  const id = (req: Request) => String(req.params.id);

  router.get('/items', handle(async req => {
    const parent = typeof req.query.parent === 'string' && req.query.parent ? req.query.parent : null;
    return listFolder((req as any).uid, orgScope(req.query.org), parent, { trash: req.query.trash === '1' }, deps);
  }));

  router.post('/folders', handle(async req => {
    const b = req.body || {};
    return { folder: await createFolder((req as any).uid, orgScope(b.org), { name: b.name, parentId: b.parentId ?? null, departmentId: b.departmentId ?? null }, deps) };
  }));

  router.patch('/items/:id', handle(async req => {
    const b = req.body || {};
    return { item: await updateItem((req as any).uid, orgScope(b.org), id(req), {
      ...(b.name !== undefined ? { name: b.name } : {}), ...(b.parentId !== undefined ? { parentId: b.parentId } : {}),
    }, deps) };
  }));

  router.post('/items/:id/trash', handle(async req => trashItem((req as any).uid, orgScope(req.body?.org), id(req), deps)));
  router.post('/items/:id/restore', handle(async req => restoreItem((req as any).uid, orgScope(req.body?.org), id(req), deps)));
  router.delete('/items/:id', handle(async req => deleteForever((req as any).uid, orgScope(req.query.org), id(req), deps)));
  router.get('/items/:id/download', handle(async req => downloadLink((req as any).uid, orgScope(req.query.org), id(req), { inline: req.query.inline === '1' }, deps)));

  return router;
}

export const driveRouter = createDriveRouter();
