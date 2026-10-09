// securityEvents — cheap, batched security telemetry for the server (Cloud Run).
//
// Anything anti-abuse on the server calls `recordSecurityEvent(type, data)`. Calls are
// aggregated IN MEMORY and flushed as ONE Firestore document per instance per minute (only
// when something happened), so even a bot flood costs at most ~1 write/min/instance. A few
// raw samples ride along with each rollup for forensics. Events marked `urgent` are written
// immediately (capped) so the security council does not wait for the next flush.
//
// The Security Council agent (services/securityCouncil/*) reads this collection.
//
// ── Collection: `security_events` (server-only; clients have no rules access) ──────────
//   Rollup doc (kind: 'rollup'), auto id:
//     kind:         'rollup'
//     windowStart:  number   epoch ms of the first event aggregated into this doc
//     windowEnd:    number   epoch ms of the flush
//     instance:     string   Cloud Run revision + random instance tag
//     total:        number   total events in the window
//     counts:       { [type: string]: number }                  events per type
//     byRoute:      { [type: string]: { [route: string]: number } }  per-type route breakdown (top 20 routes)
//     samples:      Array<{ type, at, route?, uid?, ipHash?, detail? }>  ≤ 25 raw samples, ≤ 3 per type
//     expireAt:     timestamp  (now + 30 days) — configure a Firestore TTL policy on this field
//   Urgent doc (kind: 'urgent'), auto id:
//     kind: 'urgent', type, at, route?, uid?, ipHash?, detail?, instance, expireAt
//
// ── Event types in use (free-form strings; keep snake_case) ─────────────────────────────
//   appcheck_valid | appcheck_invalid | appcheck_missing | appcheck_blocked | appcheck_jwks_error
//   signup_check_ok | signup_check_disposable | signup_check_rate_limited
//   shared_rate_limited | auth_methods_lookup | csp_report | spam_blocked_server
//
// `data.ip` is NEVER stored raw — it is reduced to a salted 16-hex-char hash (`ipHash`).
// `data.detail` is truncated to 300 chars. Do not pass message bodies, emails or tokens.

import * as nodeCrypto from 'node:crypto';
import { getAccessToken, adminConfig } from './firebaseAdminRest';

// Local serializer: firebaseAdminRest's toValue() has no timestamp support, and the TTL
// policy needs `expireAt` to be a real Firestore timestamp.
function val(v: unknown): any {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  if (typeof v === 'object') return { mapValue: { fields: fieldsOf(v as Record<string, unknown>) } };
  return { stringValue: String(v) };
}
function fieldsOf(o: Record<string, unknown>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = val(v);
  return out;
}
async function fsCreate(collection: string, data: Record<string, unknown>): Promise<void> {
  const token = await getAccessToken();
  if (!token) return;
  const url = `https://firestore.googleapis.com/v1/projects/${adminConfig.PROJECT_ID}/databases/${adminConfig.DB_ID}/documents/${collection}`;
  await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: fieldsOf(data) }),
    signal: AbortSignal.timeout(8000),
  });
}

export type SecurityEventData = {
  route?: string;
  uid?: string;
  ip?: string;
  detail?: string;
  /** Write now instead of waiting for the rollup (rate-capped). */
  urgent?: boolean;
};

type Sample = { type: string; at: number; route?: string; uid?: string; ipHash?: string; detail?: string };

const FLUSH_MS = 60_000;
const MAX_SAMPLES = 25;
const MAX_SAMPLES_PER_TYPE = 3;
const MAX_ROUTES_PER_TYPE = 20;
const URGENT_PER_MINUTE = 10;
const TTL_DAYS = 30;

const INSTANCE = `${process.env.K_REVISION || 'local'}:${nodeCrypto.randomBytes(3).toString('hex')}`;
const IP_SALT = process.env.SECURITY_EVENTS_IP_SALT || 'plajah-sec-v1';

let counts: Record<string, number> = {};
let byRoute: Record<string, Record<string, number>> = {};
let samples: Sample[] = [];
let sampleCountByType: Record<string, number> = {};
let total = 0;
let windowStart = 0;
let urgentWindow = 0;
let urgentInWindow = 0;
let timer: ReturnType<typeof setInterval> | null = null;

export function hashIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  return nodeCrypto.createHash('sha256').update(`${IP_SALT}|${ip}`).digest('hex').slice(0, 16);
}

function sampleOf(type: string, data: SecurityEventData, at: number): Sample {
  const s: Sample = { type, at };
  if (data.route) s.route = String(data.route).slice(0, 120);
  if (data.uid) s.uid = String(data.uid).slice(0, 128);
  const ipHash = hashIp(data.ip);
  if (ipHash) s.ipHash = ipHash;
  if (data.detail) s.detail = String(data.detail).slice(0, 300);
  return s;
}

const expireAt = () => new Date(Date.now() + TTL_DAYS * 86_400_000);

function ensureTimer() {
  if (timer) return;
  timer = setInterval(() => { void flushSecurityEvents(); }, FLUSH_MS);
  (timer as any).unref?.();
}

/** Record one security-relevant event. Never throws, never awaits I/O on the hot path. */
export function recordSecurityEvent(type: string, data: SecurityEventData = {}): void {
  try {
    const now = Date.now();
    if (!windowStart) windowStart = now;
    total++;
    counts[type] = (counts[type] || 0) + 1;
    if (data.route) {
      const route = String(data.route).split('?')[0].slice(0, 120);
      const r = (byRoute[type] ||= {});
      if (r[route] !== undefined || Object.keys(r).length < MAX_ROUTES_PER_TYPE) r[route] = (r[route] || 0) + 1;
    }
    if (samples.length < MAX_SAMPLES && (sampleCountByType[type] || 0) < MAX_SAMPLES_PER_TYPE) {
      samples.push(sampleOf(type, data, now));
      sampleCountByType[type] = (sampleCountByType[type] || 0) + 1;
    }
    if (data.urgent) {
      const minute = Math.floor(now / 60_000);
      if (minute !== urgentWindow) { urgentWindow = minute; urgentInWindow = 0; }
      if (urgentInWindow++ < URGENT_PER_MINUTE && adminConfig.hasCredentials()) {
        void fsCreate('security_events', { kind: 'urgent', ...sampleOf(type, data, now), instance: INSTANCE, expireAt: expireAt() }).catch(() => {});
      }
    }
    ensureTimer();
  } catch { /* telemetry must never break a request */ }
}

/** Flush the current rollup (also called on SIGTERM). Exposed for tests/shutdown hooks. */
export async function flushSecurityEvents(): Promise<void> {
  if (!total) return;
  const doc = {
    kind: 'rollup', windowStart, windowEnd: Date.now(), instance: INSTANCE, total,
    counts, byRoute, samples, expireAt: expireAt(),
  };
  counts = {}; byRoute = {}; samples = []; sampleCountByType = {}; total = 0; windowStart = 0;
  if (!adminConfig.hasCredentials()) return;
  try { await fsCreate('security_events', doc as any); } catch { /* drop — best effort */ }
}

/** Snapshot of the not-yet-flushed window (for an admin health endpoint / tests). */
export function pendingSecuritySnapshot() {
  return { windowStart, total, counts: { ...counts } };
}

if (typeof process !== 'undefined' && typeof process.once === 'function') {
  process.once('SIGTERM', () => { void flushSecurityEvents(); });
}
