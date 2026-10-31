// objectStore router — short-lived links into the private bucket (Backblaze B2, S3-compatible).
//
//   POST /sign  { op: 'get'|'put'|'delete', key, size?, contentType? }  → { url, method, headers, expiresAt }
//   POST /sign  { op: 'get'|'delete', keys: [...] }                      → { urls: [...], expiresAt }
//
// The browser never holds a storage key. It asks here, this route checks the caller against the thing the
// file belongs to, then signs one request for a few minutes:
//   collab/…    coedit/{projectId}.members (plajah-ops) — something Storage rules can't do
//   meetings/…  chat_rooms/{roomId}.participants; uploads only by the recording's host while its cloud
//               recording runs, and the 365-day `plus` folder only with an active Plajah Plus subscription
// A PUT's Content-Type and Content-Length are signed, so the store refuses anything bigger than approved.
// A batch (playing or deleting a recording's segments) must share one scope, so it costs one check.
//
// Config (Cloud Run env + Secret Manager; .env.local for dev):
//   OBJECT_STORE_ENDPOINT  https://s3.us-east-005.backblazeb2.com
//   OBJECT_STORE_REGION    us-east-005 (read from the endpoint when unset)
//   OBJECT_STORE_BUCKET    plajah-private (plajah-dev on a laptop)
//   OBJECT_STORE_KEY_ID / OBJECT_STORE_APP_KEY
// Unset → 503 { code: 'not_configured' }, and clients fall back to Firebase Storage.
//
// Mounted in server.ts as:  app.use('/api/object-store', express.json({ limit: '8kb' }), objectStoreRouter)

import { Router, Request, Response } from 'express';
import { verifyIdTokenDetailed, fsGet, fsQuery } from '../services/firebaseAdminRest';
import { presignUrl } from '../services/objectStore/sigv4';
import {
  collabDecision, keyScope, MAX_BATCH_KEYS, MAX_OBJECT_BYTES, MAX_SEGMENT_BYTES, meetingDecision, parseObjectKey, validMime,
  type ObjectKey, type ObjectOp,
} from '../services/objectStore/objectKeys';

export interface ObjectStoreConfig {
  endpoint: string;
  region: string;
  bucket: string;
  keyId: string;
  appKey: string;
}

export function objectStoreConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ObjectStoreConfig | null {
  const endpoint = env.OBJECT_STORE_ENDPOINT?.trim();
  const bucket = env.OBJECT_STORE_BUCKET?.trim();
  const keyId = env.OBJECT_STORE_KEY_ID?.trim();
  const appKey = env.OBJECT_STORE_APP_KEY?.trim();
  if (!endpoint || !bucket || !keyId || !appKey) return null;
  const url = endpoint.startsWith('http') ? endpoint : `https://${endpoint}`;
  const region = env.OBJECT_STORE_REGION?.trim() || /^s3\.([\w-]+)\./.exec(new URL(url).host)?.[1] || 'us-east-1';
  return { endpoint: url, region, bucket, keyId, appKey };
}

export interface ObjectStoreDeps {
  verify: typeof verifyIdTokenDetailed;
  get: typeof fsGet;
  /** Active Plajah Plus subscription (plajahPlusSubscriptions, same test as services/subscriptionService). */
  isPaid: (uid: string) => Promise<boolean>;
  config: () => ObjectStoreConfig | null;
  now?: () => Date;
}

async function livePaid(uid: string): Promise<boolean> {
  const rows = await fsQuery('plajahPlusSubscriptions', [{ field: 'subscriberId', value: uid }], 20);
  return rows.some((r) => r.data.status === 'active' || r.data.status === 'trialing');
}
const live: ObjectStoreDeps = { verify: verifyIdTokenDetailed, get: fsGet, isPaid: livePaid, config: () => objectStoreConfigFromEnv() };

const TTL_SEC: Record<ObjectOp, number> = { get: 600, put: 900, delete: 120 };
const OPS = new Set<ObjectOp>(['get', 'put', 'delete']);

export function createObjectStoreRouter({ verify, get, isPaid, config, now = () => new Date() }: ObjectStoreDeps = live) {
  const router = Router();
  // A host uploads a segment every ~10 s; the subscription answer holds for a few minutes.
  const paidCache = new Map<string, { paid: boolean; at: number }>();
  const paid = async (uid: string) => {
    const hit = paidCache.get(uid);
    if (hit && Date.now() - hit.at < 5 * 60_000) return hit.paid;
    const p = await isPaid(uid).catch(() => false);
    if (paidCache.size > 5000) paidCache.clear();
    paidCache.set(uid, { paid: p, at: Date.now() });
    return p;
  };

  async function decide(op: ObjectOp, k: ObjectKey, uid: string): Promise<string | null> {
    if (k.area === 'collab') {
      const project = (await get(`coedit/${k.projectId}`)) as { members?: Record<string, string>; expires?: Record<string, number> } | null;
      // Access past its end date reaches the media no more than the document.
      const ended = !!project?.expires?.[uid] && project.expires[uid] <= Date.now();
      return collabDecision(op, k, uid, ended ? null : project);
    }
    const [room, recording] = await Promise.all([
      get(`chat_rooms/${k.roomId}`),
      op === 'get' ? Promise.resolve(null) : get(`chat_rooms/${k.roomId}/recordings/${k.recId}`),
    ]);
    return meetingDecision(op, k, uid, { room, recording, paid: op === 'put' && k.plan === 'plus' ? await paid(uid) : false });
  }

  const sign = (cfg: ObjectStoreConfig, op: ObjectOp, key: string, at: Date, headers: Record<string, string> = {}) =>
    presignUrl({
      method: op === 'get' ? 'GET' : op === 'put' ? 'PUT' : 'DELETE',
      endpoint: cfg.endpoint, region: cfg.region, bucket: cfg.bucket, key, accessKeyId: cfg.keyId, secretAccessKey: cfg.appKey,
      expiresSec: TTL_SEC[op], now: at, headers,
    });

  router.post('/sign', async (req: Request, res: Response) => {
    const cfg = config();
    if (!cfg) return res.status(503).json({ error: 'File storage isn’t set up on this server.', code: 'not_configured' });
    const auth = req.headers.authorization;
    const t = auth?.startsWith('Bearer ') ? await verify(auth.slice(7)) : null;
    if (!t || t.isAnonymous) return res.status(401).json({ error: 'Sign in to open shared files.' });

    const { op, key, keys, size, contentType } = req.body || {};
    if (!OPS.has(op)) return res.status(400).json({ error: 'Unknown request.' });

    if (Array.isArray(keys)) {
      if (op === 'put' || !keys.length || keys.length > MAX_BATCH_KEYS) return res.status(400).json({ error: 'Unknown request.' });
      const parsed = keys.map(parseObjectKey);
      // Only recordings batch: every segment of one recording shares a single decision.
      if (parsed.some((p) => p?.area !== 'meetings') || new Set(parsed.map((p) => keyScope(p!))).size !== 1) return res.status(400).json({ error: 'Those file paths aren’t valid.' });
      const denied = await decide(op, parsed[0]!, t.uid);
      if (denied) return res.status(403).json({ error: denied });
      const at = now();
      return res.json({ urls: keys.map((k: string) => sign(cfg, op, k, at)), expiresAt: at.getTime() + TTL_SEC[op as ObjectOp] * 1000 });
    }

    const k = parseObjectKey(key);
    if (!k) return res.status(400).json({ error: 'That file path isn’t valid.' });
    const denied = await decide(op, k, t.uid);
    if (denied) return res.status(403).json({ error: denied });

    const headers: Record<string, string> = {};
    if (op === 'put') {
      const cap = k.area === 'meetings' ? MAX_SEGMENT_BYTES : MAX_OBJECT_BYTES;
      if (!Number.isSafeInteger(size) || size <= 0 || size > cap) return res.status(400).json({ error: k.area === 'meetings' ? 'That recording segment is too large.' : 'Files can be up to 2 GB.' });
      if (!validMime(contentType)) return res.status(400).json({ error: 'Unknown file type.' });
      headers['content-type'] = contentType;
      headers['content-length'] = String(size);
    }
    const at = now();
    const url = sign(cfg, op, key, at, headers);
    // The browser sets Content-Length itself; it only needs to send the matching Content-Type.
    res.json({
      url, method: op === 'get' ? 'GET' : op === 'put' ? 'PUT' : 'DELETE',
      headers: op === 'put' ? { 'Content-Type': contentType } : {},
      expiresAt: at.getTime() + TTL_SEC[op as ObjectOp] * 1000,
    });
  });

  return router;
}

export const objectStoreRouter = createObjectStoreRouter();
