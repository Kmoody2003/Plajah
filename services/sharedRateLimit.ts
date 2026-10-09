// sharedRateLimit — a fixed-window counter shared across ALL Cloud Run instances.
//
// express-rate-limit keeps counts in memory, so with N instances an attacker gets N× the
// limit (and a fresh budget on every cold start). For the handful of routes bots love most
// (signup-check, auth-methods lookup, link-preview unfurl, social import) this helper adds a
// Firestore-backed counter that holds across instances.
//
// Cost model — deliberately cheap:
//   • ONE document per (limiter, key, window): `rate_limits/{name}_{window}_{hash(key)}`.
//   • ONE write per request (a REST `commit` with an atomic `increment` transform that also
//     returns the new value — no read, no transaction).
//   • A local in-memory shadow counter short-circuits keys already over the limit, so a flood
//     from one key costs ~1 write per instance per window once it is blocked, not 1 per request.
//   • `expireAt` is a real timestamp: add a Firestore TTL policy on rate_limits.expireAt so
//     old windows delete themselves (docs/ANTI_BOT_PLAYBOOK.md).
//
// FAILS OPEN: any Firestore error / missing credentials → the request is allowed (the
// per-instance express-rate-limit limiters still apply). Real people are never blocked by
// our infrastructure hiccups.
//
// Client IP: always `req.ip` (Express applies `trust proxy`), NEVER a raw X-Forwarded-For
// read — that header is client-forgeable.

import * as nodeCrypto from 'node:crypto';
import { ipKeyGenerator } from 'express-rate-limit';
import { getAccessToken, adminConfig } from './firebaseAdminRest';
import { recordSecurityEvent } from './securityEvents';

export interface SharedLimitResult { ok: boolean; count: number; limit: number; retryAfterMs: number; shared: boolean }

const shadow = new Map<string, { count: number; windowEnd: number }>();
const SHADOW_MAX = 20_000;

/** IPv6-safe client key from Express's trust-proxy-derived req.ip. */
export function clientIpKey(req: any): string {
  const ip = String(req?.ip || req?.socket?.remoteAddress || 'unknown');
  try { return ipKeyGenerator(ip); } catch { return ip; }
}

/** express-rate-limit keyGenerator: per-uid when authMiddleware already ran, else per-IP. */
export function uidOrIpKey(req: any): string {
  return req?.uid ? `uid:${req.uid}` : `ip:${clientIpKey(req)}`;
}

const docIdFor = (name: string, windowIdx: number, key: string) =>
  `${name.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40)}_${windowIdx}_${nodeCrypto.createHash('sha256').update(key).digest('hex').slice(0, 24)}`;

async function incrementShared(docId: string, name: string, windowEnd: number): Promise<number | null> {
  if (!adminConfig.hasCredentials()) return null;
  const token = await getAccessToken();
  if (!token) return null;
  const root = `projects/${adminConfig.PROJECT_ID}/databases/${adminConfig.DB_ID}/documents`;
  const res = await fetch(`https://firestore.googleapis.com/v1/${root}:commit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(2500),
    body: JSON.stringify({
      writes: [{
        update: {
          name: `${root}/rate_limits/${docId}`,
          fields: {
            name: { stringValue: name },
            expireAt: { timestampValue: new Date(windowEnd + 60_000).toISOString() },
          },
        },
        updateMask: { fieldPaths: ['name', 'expireAt'] },
        updateTransforms: [{ fieldPath: 'count', increment: { integerValue: '1' } }],
      }],
    }),
  });
  if (!res.ok) return null;
  const data: any = await res.json();
  const tr = data?.writeResults?.[0]?.transformResults?.[0];
  const n = Number(tr?.integerValue ?? tr?.doubleValue);
  return Number.isFinite(n) ? n : null;
}

/** Consume one unit for `key` under limiter `name`. Never throws. */
export async function consumeShared(name: string, key: string, limit: number, windowMs: number, now = Date.now()): Promise<SharedLimitResult> {
  const windowIdx = Math.floor(now / windowMs);
  const windowEnd = (windowIdx + 1) * windowMs;
  const shadowKey = `${name}|${key}`;
  let s = shadow.get(shadowKey);
  if (!s || s.windowEnd !== windowEnd) {
    if (shadow.size >= SHADOW_MAX) shadow.clear();
    s = { count: 0, windowEnd };
    shadow.set(shadowKey, s);
  }
  s.count++;
  // Already over the limit on this instance → definitely over globally; skip the write.
  if (s.count > limit) return { ok: false, count: s.count, limit, retryAfterMs: windowEnd - now, shared: false };
  try {
    const n = await incrementShared(docIdFor(name, windowIdx, key), name, windowEnd);
    if (n === null) return { ok: true, count: s.count, limit, retryAfterMs: 0, shared: false };
    if (n > s.count) s.count = n;   // learn the global count so later requests short-circuit locally
    return { ok: n <= limit, count: n, limit, retryAfterMs: n <= limit ? 0 : windowEnd - now, shared: true };
  } catch {
    return { ok: true, count: s.count, limit, retryAfterMs: 0, shared: false };
  }
}

export interface SharedLimiterOptions {
  name: string;
  limit: number;
  windowMs: number;
  /** Default: per-uid if authenticated (req.uid), otherwise per-IP. */
  key?: (req: any) => string;
  message?: string;
}

/** Express middleware form. Responds 429 with Retry-After when the shared window is exhausted. */
export function sharedRateLimit(opts: SharedLimiterOptions) {
  const keyOf = opts.key || uidOrIpKey;
  return async (req: any, res: any, next: any) => {
    let r: SharedLimitResult;
    try { r = await consumeShared(opts.name, keyOf(req), opts.limit, opts.windowMs); }
    catch { return next(); }
    if (r.ok) return next();
    if (r.count === opts.limit + 1 || r.count % 50 === 0) {
      recordSecurityEvent('shared_rate_limited', { route: req.originalUrl || req.path, uid: req.uid, ip: req.ip, detail: `${opts.name} count=${r.count} limit=${opts.limit}` });
    }
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil(r.retryAfterMs / 1000))));
    return res.status(429).json({ error: opts.message || 'Too many requests. Please wait a little and try again.' });
  };
}
