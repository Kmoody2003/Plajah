// services/livewire/token.ts — who may push to (and pull from) the Livewire origin. SERVER ONLY.
//
// Publish tokens are short-lived HMAC-signed grants for exactly one stream:
//   base64url(JSON{ s: streamId, u: uid, e: expiresAtSec }) + "." + base64url(HMAC-SHA256)
// The API mints one when a host starts a Livewire stream; the broadcaster puts it in the SRT
// stream id / RTMP query; MediaMTX asks our auth endpoint (authMethod: http) before accepting.
// Reads at the origin are allowed only for the CDN's pull (by shared pull secret) and localhost —
// viewers always go through the CDN, which checks its own signed URLs (cdn.ts).

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface PublishGrant { streamId: string; uid: string; expiresAt: number }

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const sign = (payload: string, secret: string) => createHmac('sha256', secret).update(payload).digest();

export const STREAM_ID_RE = /^[A-Za-z0-9_-]{6,128}$/;
export const RUNG_RE = /^(1080p|720p|480p|360p|av1_1080p|av1_720p|audio)$/;

export function signPublishToken(g: PublishGrant, secret: string): string {
  if (!secret || secret.length < 32) throw new Error('LIVEWIRE_SECRET must be at least 32 characters');
  if (!STREAM_ID_RE.test(g.streamId)) throw new Error('bad stream id');
  const payload = b64u(JSON.stringify({ s: g.streamId, u: g.uid, e: Math.floor(g.expiresAt) }));
  return `${payload}.${b64u(sign(payload, secret))}`;
}

export function verifyPublishToken(token: string, secret: string, nowSec = Date.now() / 1000): PublishGrant | null {
  if (!token || !secret) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  let given: Buffer;
  try { given = Buffer.from(token.slice(dot + 1), 'base64url'); } catch { return null; }
  const want = sign(payload, secret);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof p.s !== 'string' || typeof p.u !== 'string' || typeof p.e !== 'number') return null;
    if (p.e < nowSec) return null;
    return { streamId: p.s, uid: p.u, expiresAt: p.e };
  } catch { return null; }
}

/** The JSON body MediaMTX POSTs to authHTTPAddress. */
export interface OriginAuthRequest {
  user?: string; password?: string; token?: string; ip?: string;
  action: 'publish' | 'read' | 'playback' | 'api' | 'metrics' | 'pprof' | string;
  path?: string; protocol?: string; query?: string;
}

export interface OriginAuthConfig {
  secret: string;
  /** Shared secret the CDN sends when pulling from the origin (Bunny: origin header / basic auth). */
  pullSecret: string;
  nowSec?: number;
}

const LOCAL_IP = /^(127\.|::1$|::ffff:127\.)/;

function constantEq(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Decide one MediaMTX auth request. Returns true = 200 (allow), false = 401. */
export function decideOriginAuth(req: OriginAuthRequest, cfg: OriginAuthConfig): boolean {
  const path = (req.path || '').replace(/^\/+/, '');
  const m = path.match(/^live\/([A-Za-z0-9_-]{6,128})\/([a-z0-9_]+)$/);

  if (req.action === 'publish') {
    if (!m || !RUNG_RE.test(m[2])) return false;
    const tok = req.password || req.token || '';
    const grant = verifyPublishToken(tok, cfg.secret, cfg.nowSec);
    return !!grant && grant.streamId === m[1];
  }
  if (req.action === 'read' || req.action === 'playback') {
    if (!m) return false;
    if (req.ip && LOCAL_IP.test(req.ip)) return true;
    const given = req.password || req.token || '';
    return !!cfg.pullSecret && !!given && constantEq(given, cfg.pullSecret);
  }
  // api / metrics / pprof: localhost only (monitoring runs on the box).
  return !!req.ip && LOCAL_IP.test(req.ip);
}
