// objectStore router — short-lived links into the private bucket (Backblaze B2, S3-compatible).
//
//   POST /sign  { op: 'get'|'put'|'delete', key, size?, contentType? }  → { url, method, headers, expiresAt }
//
// The browser never holds a storage key. It asks here, this route checks the caller against the thing the
// file belongs to (for collab/… keys: coedit/{projectId}.members in plajah-ops — something Storage rules
// can't do), then signs one request for a few minutes. A PUT's Content-Type and Content-Length are signed,
// so the store refuses anything bigger than what was approved.
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
import { verifyIdTokenDetailed, fsGet } from '../services/firebaseAdminRest';
import { presignUrl } from '../services/objectStore/sigv4';
import { collabDecision, MAX_OBJECT_BYTES, parseObjectKey, validMime, type ObjectOp } from '../services/objectStore/objectKeys';

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
  config: () => ObjectStoreConfig | null;
  now?: () => Date;
}
const live: ObjectStoreDeps = { verify: verifyIdTokenDetailed, get: fsGet, config: () => objectStoreConfigFromEnv() };

const TTL_SEC: Record<ObjectOp, number> = { get: 600, put: 900, delete: 120 };
const OPS = new Set<ObjectOp>(['get', 'put', 'delete']);

export function createObjectStoreRouter({ verify, get, config, now = () => new Date() }: ObjectStoreDeps = live) {
  const router = Router();

  router.post('/sign', async (req: Request, res: Response) => {
    const cfg = config();
    if (!cfg) return res.status(503).json({ error: 'File storage isn’t set up on this server.', code: 'not_configured' });
    const auth = req.headers.authorization;
    const t = auth?.startsWith('Bearer ') ? await verify(auth.slice(7)) : null;
    if (!t || t.isAnonymous) return res.status(401).json({ error: 'Sign in to open shared files.' });

    const { op, key, size, contentType } = req.body || {};
    if (!OPS.has(op)) return res.status(400).json({ error: 'Unknown request.' });
    const k = parseObjectKey(key);
    if (!k) return res.status(400).json({ error: 'That file path isn’t valid.' });

    const project = await get(`coedit/${k.projectId}`);
    const denied = collabDecision(op, k, t.uid, project as { members?: Record<string, string> } | null);
    if (denied) return res.status(403).json({ error: denied });

    const headers: Record<string, string> = {};
    if (op === 'put') {
      if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_OBJECT_BYTES) return res.status(400).json({ error: 'Files can be up to 2 GB.' });
      if (!validMime(contentType)) return res.status(400).json({ error: 'Unknown file type.' });
      headers['content-type'] = contentType;
      headers['content-length'] = String(size);
    }
    const at = now();
    const url = presignUrl({
      method: op === 'get' ? 'GET' : op === 'put' ? 'PUT' : 'DELETE',
      endpoint: cfg.endpoint, region: cfg.region, bucket: cfg.bucket, key, accessKeyId: cfg.keyId, secretAccessKey: cfg.appKey,
      expiresSec: TTL_SEC[op as ObjectOp], now: at, headers,
    });
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
