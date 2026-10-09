// appCheckServer — Firebase App Check verification for the Express API (server only).
//
// Verifies the `X-Firebase-AppCheck` JWT the web client attaches to same-origin /api calls
// (services/appCheckFetch.ts). Per Firebase's "verify App Check tokens with a JWT library"
// guidance a token is valid only if ALL hold:
//   • header.alg == RS256, header.typ == JWT, header.kid matches a key in the App Check JWKS
//   • RSA-SHA256 signature verifies against that key
//   • iss == https://firebaseappcheck.googleapis.com/<PROJECT_NUMBER>
//   • aud contains projects/<PROJECT_NUMBER>   (projects/<PROJECT_ID> also accepted)
//   • exp in the future (60 s clock skew)       • sub is a non-empty app id
//
// PROJECT_NUMBER: env FIREBASE_PROJECT_NUMBER, default 538331111809 (the messagingSenderId /
// appId prefix in firebase-applet-config.json for gen-lang-client-0665118474).
//
// The middleware NEVER blocks by default (monitor mode). It sets req.appCheck to
// 'valid' | 'invalid' | 'missing' and counts outcomes into security_events. Blocking:
//   APPCHECK_ENFORCE=true                → reject 'missing' and 'invalid' on every /api route
//                                          except the exempt list (webhooks, OAuth callbacks,
//                                          server-to-server endpoints, native-only paths).
//   APPCHECK_STRICT_ROUTES=true          → reject 'invalid' (NOT 'missing') on the short
//                                          high-abuse list even while APPCHECK_ENFORCE is off.
// A JWKS fetch failure is treated as 'missing' (never as 'invalid') so a Google outage can't
// lock real people out of the strict routes.

import * as nodeCrypto from 'node:crypto';
import { recordSecurityEvent } from './securityEvents';

export type AppCheckOutcome = 'valid' | 'invalid' | 'missing';

const PROJECT_NUMBER = (process.env.FIREBASE_PROJECT_NUMBER || '538331111809').trim();
const PROJECT_ID = (process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0665118474').trim();
const ISSUER = `https://firebaseappcheck.googleapis.com/${PROJECT_NUMBER}`;
const JWKS_URL = 'https://firebaseappcheck.googleapis.com/v1/jwks';

let jwksCache: { keys: Map<string, nodeCrypto.KeyObject>; exp: number } | null = null;
let jwksInflight: Promise<Map<string, nodeCrypto.KeyObject>> | null = null;

async function jwks(): Promise<Map<string, nodeCrypto.KeyObject>> {
  if (jwksCache && Date.now() < jwksCache.exp) return jwksCache.keys;
  if (jwksInflight) return jwksInflight;
  jwksInflight = (async () => {
    const res = await fetch(JWKS_URL, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`App Check JWKS HTTP ${res.status}`);
    const data = await res.json() as { keys?: Array<Record<string, any>> };
    const keys = new Map<string, nodeCrypto.KeyObject>();
    for (const k of data.keys ?? []) {
      if (!k.kid) continue;
      try { keys.set(k.kid, nodeCrypto.createPublicKey({ key: k as any, format: 'jwk' })); } catch { /* skip bad key */ }
    }
    // Google recommends caching the JWKS for no longer than 6 hours.
    jwksCache = { keys, exp: Date.now() + 6 * 3_600_000 };
    return keys;
  })().finally(() => { jwksInflight = null; });
  return jwksInflight;
}

/** Pure claim check (exported for tests). */
export function appCheckClaimsOk(header: any, payload: any, nowSec = Math.floor(Date.now() / 1000)): boolean {
  if (!header || header.alg !== 'RS256' || !header.kid) return false;
  if (header.typ && header.typ !== 'JWT') return false;
  if (!payload || payload.iss !== ISSUER) return false;
  const aud: string[] = Array.isArray(payload.aud) ? payload.aud : (typeof payload.aud === 'string' ? [payload.aud] : []);
  if (!aud.includes(`projects/${PROJECT_NUMBER}`) && !aud.includes(`projects/${PROJECT_ID}`)) return false;
  if (typeof payload.exp !== 'number' || payload.exp + 60 <= nowSec) return false;
  if (typeof payload.sub !== 'string' || !payload.sub) return false;
  return true;
}

// Small verified-token cache: the SDK reuses one token for ~1 h, so most requests skip crypto.
const verified = new Map<string, number>(); // sha256(token) → exp (ms)
const VERIFIED_MAX = 5000;

/**
 * Verify a token. Returns 'valid' / 'invalid', or 'missing' when the token can't be checked
 * right now (JWKS unreachable) — callers treat that as "no attestation", never as an attack.
 */
export async function verifyAppCheck(token: string | undefined | null): Promise<AppCheckOutcome> {
  if (!token || typeof token !== 'string') return 'missing';
  if (token.length > 4096) return 'invalid';
  const h = nodeCrypto.createHash('sha256').update(token).digest('base64url');
  const cachedExp = verified.get(h);
  if (cachedExp && cachedExp > Date.now()) return 'valid';

  const parts = token.split('.');
  if (parts.length !== 3) return 'invalid';
  let header: any, payload: any;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch { return 'invalid'; }
  if (!appCheckClaimsOk(header, payload)) return 'invalid';

  let keys: Map<string, nodeCrypto.KeyObject>;
  try { keys = await jwks(); } catch (e: any) {
    recordSecurityEvent('appcheck_jwks_error', { detail: e?.message });
    return 'missing';
  }
  const key = keys.get(header.kid);
  if (!key) return 'invalid';
  let ok = false;
  try {
    ok = nodeCrypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'));
  } catch { ok = false; }
  if (!ok) return 'invalid';
  if (verified.size >= VERIFIED_MAX) verified.clear();
  verified.set(h, payload.exp * 1000);
  return 'valid';
}

/** Back-compat boolean form for older call sites. */
export async function verifyAppCheckTokenStrict(token: string): Promise<boolean> {
  return (await verifyAppCheck(token)) === 'valid';
}

// High-abuse routes: 'invalid' is blocked here when APPCHECK_STRICT_ROUTES=true.
export const APPCHECK_STRICT_PREFIXES = [
  '/api/auth/signup-check',
  '/api/auth-methods',
  '/api/ai/',
  '/api/character/chat',
  '/api/push',
  '/api/email/',
  '/api/social-import/',
  '/api/link-preview',
  '/api/aria/speak',
];

// Never require App Check here even under APPCHECK_ENFORCE: provider webhooks, OAuth
// redirects, scheduler/server-to-server endpoints, CSP reports, and the native TV/launcher
// endpoints that have no App Check provider yet.
export const APPCHECK_EXEMPT_PREFIXES = [
  '/api/stripe/webhook', '/api/stripe/connect-webhook', '/api/merch/stripe-webhook', '/api/mux/webhook',
  '/api/hue/callback', '/api/social-import/twitter/callback', '/api/fediverse/bluesky/oauth',
  '/api/social/oauth', '/api/google-action', '/api/bixby',
  '/api/social/publish-due-posts', '/api/security/csp-report',
  '/api/home/', '/api/tv/', '/api/health',
];

const startsWithAny = (path: string, list: string[]) => list.some(p => path.startsWith(p));

export interface AppCheckMiddlewareOptions {
  enforce?: () => boolean;
  strictRoutes?: () => boolean;
}

/** Mount once: app.use('/api', createAppCheckMiddleware()). */
export function createAppCheckMiddleware(opts: AppCheckMiddlewareOptions = {}) {
  const enforce = opts.enforce || (() => process.env.APPCHECK_ENFORCE === 'true');
  const strict = opts.strictRoutes || (() => process.env.APPCHECK_STRICT_ROUTES === 'true');
  return async (req: any, res: any, next: any) => {
    if (req.method === 'OPTIONS') return next();
    const path: string = req.originalUrl ? String(req.originalUrl).split('?')[0] : req.path;
    const header = req.headers['x-firebase-appcheck'];
    let outcome: AppCheckOutcome;
    try { outcome = await verifyAppCheck(typeof header === 'string' ? header : undefined); }
    catch { outcome = 'missing'; }
    req.appCheck = outcome;
    req.appCheckValid = outcome === 'valid';
    recordSecurityEvent(`appcheck_${outcome}`, outcome === 'valid' ? { route: path } : { route: path, uid: req.uid, ip: req.ip });

    if (startsWithAny(path, APPCHECK_EXEMPT_PREFIXES)) return next();
    const block =
      (enforce() && outcome !== 'valid') ||
      (strict() && outcome === 'invalid' && startsWithAny(path, APPCHECK_STRICT_PREFIXES));
    if (block) {
      recordSecurityEvent('appcheck_blocked', { route: path, ip: req.ip, detail: outcome });
      return res.status(401).json({ error: 'This request could not be verified. Please refresh the page and try again.', code: 'APPCHECK_FAILED' });
    }
    next();
  };
}
