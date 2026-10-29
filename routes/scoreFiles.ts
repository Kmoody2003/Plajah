// scoreFiles router — public sheet music served from Plajah's own copy.
//
//   GET /api/scores/file/<key>?src=<original url>   → 302
//
// The score catalogue (public/scores/catalog.json) is mirrored into the object store under
// scores/v1/… by scripts/scores/mirrorScores.mts. The bucket is private, so this route signs a
// short GET for our copy. If our copy isn't there (a bucket that hasn't been filled yet, a file
// that failed to mirror, or the store isn't configured) it redirects to the original source
// instead — so a score never breaks because of the mirror.
//
// No auth: every file here is public domain or CC-licensed for redistribution. `src` is only
// followed to the two upstream hosts the catalogue uses, so this is not an open redirect.
//
// Mounted in server.ts as:  app.use('/api/scores', scoreFilesRouter)

import { Router, Request, Response } from 'express';
import { presignUrl } from '../services/objectStore/sigv4';
import { objectStoreConfigFromEnv } from './objectStore';

const KEY_RE = /^scores\/v1\/(openscore_lieder|openscore_quartets|mutopia)\/[A-Za-z0-9-]{1,160}(\.pdf|-parts\.zip|\.mxl|\.mid)$/;

/** Upstream hosts the catalogue was built from — the only places `src` may point. */
export function allowedSource(src: unknown): string | null {
  if (typeof src !== 'string' || src.length > 2000) return null;
  try {
    const u = new URL(src);
    if (u.protocol !== 'https:') return null;
    if (u.host === 'raw.githubusercontent.com' && /^\/OpenScore\/(Lieder|StringQuartets)\//.test(u.pathname)) return u.toString();
    if (u.host === 'www.mutopiaproject.org' && u.pathname.startsWith('/ftp/')) return u.toString();
    return null;
  } catch {
    return null;
  }
}

export const validScoreKey = (key: string) => KEY_RE.test(key);

/** Whether our copy exists, remembered for a while so most requests skip the HEAD. */
const presence = new Map<string, { ok: boolean; at: number }>();
const PRESENCE_TTL_MS = 10 * 60 * 1000;
const SIGN_SECONDS = 600;

export const scoreFilesRouter = Router();

scoreFilesRouter.get(/^\/file\/(.+)$/, async (req: Request, res: Response) => {
  const key = decodeURIComponent((req.params as Record<string, string>)[0] || '');
  if (!validScoreKey(key)) return res.status(400).json({ code: 'bad_key' });
  const fallback = allowedSource(req.query.src);
  const cfg = objectStoreConfigFromEnv();

  if (cfg) {
    const sign = (method: 'GET' | 'HEAD') => presignUrl({
      method, endpoint: cfg.endpoint, bucket: cfg.bucket, key, region: cfg.region,
      accessKeyId: cfg.keyId, secretAccessKey: cfg.appKey, expiresSec: SIGN_SECONDS,
    });
    let known = presence.get(key);
    if (!known || Date.now() - known.at > PRESENCE_TTL_MS) {
      const head = await fetch(sign('HEAD'), { method: 'HEAD' }).catch(() => null);
      known = { ok: !!head?.ok, at: Date.now() };
      presence.set(key, known);
    }
    if (known.ok) {
      // Shorter than the signature so a cached redirect never points at an expired link.
      res.set('Cache-Control', 'public, max-age=300');
      return res.redirect(302, sign('GET'));
    }
  }

  if (fallback) {
    res.set('Cache-Control', 'public, max-age=300');
    return res.redirect(302, fallback);
  }
  return res.status(404).json({ code: 'not_found' });
});
