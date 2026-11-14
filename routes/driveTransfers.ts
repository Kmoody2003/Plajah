// routes/driveTransfers.ts — Plajah Drive temporary "Send" transfers (expiring + optional password links).
// Mounted in server.ts at /api/drive/transfers (before /api/drive auth wall so recipients can inspect/download).

import { Router, type Request, type Response } from 'express';
import { randomBytes } from 'node:crypto';
import { verifyIdTokenDetailed, fsGet, fsSet, fsQuery, fsDelete } from '../services/firebaseAdminRest';
import { objectStoreConfigFromEnv } from './objectStore';
import type { DrivePlan } from '../services/drive/plans';
import {
  beginTransfer,
  completeTransfer,
  inspectTransferPublic,
  listMyTransfers,
  revokeTransfer,
  signTransferParts,
  TransferError,
  unlockTransferWithPassword,
  type TransferDeps,
} from '../services/drive/transfersService';

export interface DriveTransferRouteDeps extends TransferDeps {
  callerUid: (req: Request) => Promise<string | null>;
  enabled: () => boolean;
}

const TIER_PLAN: Record<number, DrivePlan> = { 1: 'spark', 2: 'glow', 3: 'nova' };

async function livePlanOf(uid: string): Promise<DrivePlan> {
  const [acct, subs] = await Promise.all([
    fsGet(`driveAccounts/${uid}`).catch(() => null),
    fsQuery('plajahPlusSubscriptions', [{ field: 'subscriberId', value: uid }], 20).catch(() => []),
  ]);
  const active = subs.find(r => r.data.status === 'active' || r.data.status === 'trialing');
  return (acct?.plan as DrivePlan) || (active ? TIER_PLAN[Number(active.data.tier)] ?? 'spark' : 'free');
}

const live: DriveTransferRouteDeps = {
  callerUid: async req => {
    const h = req.headers.authorization;
    const t = h?.startsWith('Bearer ') ? await verifyIdTokenDetailed(h.slice(7)) : null;
    return t && !t.isAnonymous ? t.uid : null;
  },
  enabled: () => process.env.DRIVE_ENABLED === '1',
  store: {
    get: fsGet,
    set: fsSet,
    query: (collection, field, value, limit) => fsQuery(collection, [{ field, value }], limit),
    remove: fsDelete,
  },
  s3: () => objectStoreConfigFromEnv(),
  planOf: livePlanOf,
  now: () => Date.now(),
  newId: () => randomBytes(12).toString('base64url'),
};

function handleErr(res: Response, err: unknown) {
  if (err instanceof TransferError) {
    return res.status(err.status).json({ error: err.code, message: err.message });
  }
  console.error('[driveTransfers]', err);
  return res.status(500).json({ error: 'internal', message: 'Transfer service error' });
}

export function createDriveTransfersRouter(deps: DriveTransferRouteDeps = live) {
  const r = Router();

  const requireEnabled = (_req: Request, res: Response, next: () => void) => {
    if (!deps.enabled()) return res.status(503).json({ error: 'drive_off', message: 'Plajah Drive is not enabled on this server.' });
    next();
  };

  const requireAuth = async (req: Request, res: Response): Promise<string | null> => {
    const uid = await deps.callerUid(req);
    if (!uid) {
      res.status(401).json({ error: 'unauthorized', message: 'Sign in to manage transfers.' });
      return null;
    }
    return uid;
  };

  r.use(requireEnabled);

  // List current user's active transfers
  r.get('/', async (req, res) => {
    try {
      const uid = await requireAuth(req, res);
      if (!uid) return;
      const transfers = await listMyTransfers(uid, deps);
      res.json({ transfers });
    } catch (e) {
      handleErr(res, e);
    }
  });

  // Begin multi-file temporary Send transfer
  r.post('/', async (req, res) => {
    try {
      const uid = await requireAuth(req, res);
      if (!uid) return;
      const out = await beginTransfer(uid, req.body || {}, deps);
      res.json(out);
    } catch (e) {
      handleErr(res, e);
    }
  });

  // Sign multipart upload chunks for a transfer file
  r.post('/:id/parts', async (req, res) => {
    try {
      const uid = await requireAuth(req, res);
      if (!uid) return;
      const { fileId, partNumbers } = req.body || {};
      const out = await signTransferParts(uid, String(req.params.id), String(fileId || ''), partNumbers, deps);
      res.json(out);
    } catch (e) {
      handleErr(res, e);
    }
  });

  // Finalize transfer after B2 PUT/multipart finishes
  r.post('/:id/complete', async (req, res) => {
    try {
      const uid = await requireAuth(req, res);
      if (!uid) return;
      const out = await completeTransfer(uid, String(req.params.id), req.body?.multiparts || {}, deps);
      res.json(out);
    } catch (e) {
      handleErr(res, e);
    }
  });

  // Revoke and purge objects from B2
  r.delete('/:id', async (req, res) => {
    try {
      const uid = await requireAuth(req, res);
      if (!uid) return;
      const out = await revokeTransfer(uid, String(req.params.id), deps);
      res.json(out);
    } catch (e) {
      handleErr(res, e);
    }
  });

  // Public inspection + signed download URLs (when unlocked)
  r.get('/:id', async (req, res) => {
    try {
      const token = String(req.headers['x-transfer-token'] || req.query.token || '');
      const countDownload = req.query.download === '1';
      const inline = req.query.inline === '1';
      const out = await inspectTransferPublic(String(req.params.id), { unlockToken: token || undefined, countDownload, inline }, deps);
      res.json(out);
    } catch (e) {
      handleErr(res, e);
    }
  });

  // Public password verification -> returns unlockToken + signed links
  r.post('/:id/verify', async (req, res) => {
    try {
      const out = await unlockTransferWithPassword(String(req.params.id), String(req.body?.password || ''), deps);
      res.json(out);
    } catch (e) {
      handleErr(res, e);
    }
  });

  return r;
}

export const driveTransfersRouter = createDriveTransfersRouter();
