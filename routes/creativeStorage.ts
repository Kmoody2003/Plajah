// Creative storage usage — server recount. Pure policy: services/creativeCloud/policy.ts.
// Mounted in server.ts:  app.use('/api/creative-storage', createCreativeStorageRouter({ authMiddleware }))
//
// The client can't be trusted to report its own usage, so this lists the user's real Storage
// objects under the creative prefixes, tallies counted vs exempt bytes, resolves the allowance
// (free 5 GB, or the Plajah+ tier), and writes users/{uid}/storageUsage/current (server-only in
// firestore.rules). Nothing here blocks a save: enforcement is config/storagePolicy, default off.
//
// Endpoints
//   GET /api/creative-storage/usage     auth: recount and return CreativeUsage

import { Router } from 'express';
import { fsGet, fsQuery, fsSet, getAccessToken } from '../services/firebaseAdminRest';
import {
  creativeLimitBytes,
  creativePrefixes,
  isPlusStatusActive,
  tallyUsage,
  type CreativeUsage,
  type PlusStatus,
} from '../services/creativeCloud/policy';

const BUCKET = process.env.STORAGE_BUCKET || 'gen-lang-client-0665118474.firebasestorage.app';
const RECOUNT_MIN_INTERVAL_MS = 30_000;

export interface CreativeStorageDeps {
  authMiddleware: any;
}

async function listObjectSizes(prefix: string): Promise<{ name: string; size: number }[]> {
  const token = await getAccessToken();
  if (!token) throw new Error('no storage credentials');
  const out: { name: string; size: number }[] = [];
  let pageToken = '';
  do {
    const url =
      `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o?prefix=${encodeURIComponent(prefix)}` +
      `&fields=items(name,size),nextPageToken&maxResults=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`storage list ${res.status}`);
    const json = (await res.json()) as any;
    for (const item of json.items ?? []) out.push({ name: String(item.name), size: Number(item.size) || 0 });
    pageToken = json.nextPageToken || '';
  } while (pageToken && out.length < 200_000);
  return out;
}

async function plusStatusFor(uid: string): Promise<PlusStatus> {
  const subs = await fsQuery('plajahPlusSubscriptions', [{ field: 'subscriberId', value: uid }], 10);
  const active = subs.map((s) => s.data).find((s) => isPlusStatusActive(String(s.status || '')));
  return active
    ? { active: true, tier: Number(active.tier) || undefined, storageLimitGb: Number(active.storageLimitGb) || undefined }
    : { active: false };
}

export async function recountCreativeUsage(uid: string): Promise<CreativeUsage> {
  const objects: { kind: string; size: number }[] = [];
  for (const { prefix, kindFromPath } of creativePrefixes(uid)) {
    for (const o of await listObjectSizes(prefix)) objects.push({ kind: kindFromPath(o.name), size: o.size });
  }
  const plus = await plusStatusFor(uid);
  const policy = await fsGet('config/storagePolicy');
  const usage: CreativeUsage = {
    ...tallyUsage(objects),
    limitBytes: creativeLimitBytes(plus),
    plus: plus.active,
    enforced: policy?.enforceCreativeQuota === true,
    measuredAt: Date.now(),
  };
  await fsSet(`users/${uid}/storageUsage/current`, usage as unknown as Record<string, unknown>);
  return usage;
}

export function createCreativeStorageRouter(deps: CreativeStorageDeps) {
  const router = Router();

  router.get('/usage', deps.authMiddleware, async (req: any, res: any) => {
    const uid: string = req.uid;
    if (!uid) return res.status(401).json({ error: 'Sign in required' });
    try {
      // Recounting lists Storage; serve the ledger if it was measured moments ago.
      const last = (await fsGet(`users/${uid}/storageUsage/current`)) as CreativeUsage | null;
      if (last && Date.now() - Number(last.measuredAt || 0) < RECOUNT_MIN_INTERVAL_MS) return res.json(last);
      res.json(await recountCreativeUsage(uid));
    } catch (err: any) {
      console.warn('[creativeStorage] recount failed', err?.message || err);
      res.status(503).json({ error: 'Usage is unavailable right now' });
    }
  });

  return router;
}
