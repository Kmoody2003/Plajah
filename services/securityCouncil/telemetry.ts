/**
 * Council edge: one Express middleware mounted on /api BEFORE the global limiter. It does two things,
 * both O(1) per request and allocation-light so it cannot hurt user experience:
 *
 *  1. Telemetry — counts requests, 4xx/5xx/429 and latency per normalised route, 429s per salted IP hash,
 *     and App Check failures, in memory. Every few minutes each instance flushes ONE aggregate doc to
 *     `security_telemetry` (skipped when idle). The council's 15-minute cron reads those docs; this is how
 *     Medic/Steward/Warden see 5xx rates, slow endpoints and 429 bursts across all Cloud Run instances.
 *
 *  2. Mitigation gate — ONLY when SECURITY_COUNCIL_AUTO_MITIGATE=true. Active `security_mitigations` (cached,
 *     refreshed in the background every 60s, never awaited on the request path) tighten the per-minute
 *     limit for a specific salted IP hash. Excess requests get a normal 429 with Retry-After — never a 403,
 *     never a lockout, never applied to webhooks, cron, health or the admin security API.
 *
 * Raw IPs are never stored: hashIp() is services/securityEvents.ts's salted sha256 (16 hex).
 *
 * CAUTION — IP attribution: req.ip depends on `trust proxy`. Behind Firebase Hosting → Cloud Run a wrong hop
 * count makes many users share one "IP". The agents refuse to mitigate any source carrying a large share of
 * all traffic (see agents.ts SHARED_SOURCE_SHARE) and Medic raises a finding when attribution looks collapsed.
 */
import { randomBytes } from 'node:crypto';
import type { CouncilStore, SecurityMitigation } from './types';
import { toMs } from './store';
import { hashIp as securityEventsHashIp } from '../securityEvents';

/** Same salted hash as services/securityEvents.ts, so edge telemetry, security_events and mitigations line up. */
export function hashIp(ip: string): string {
  return securityEventsHashIp(ip) || 'unknown';
}

/** /api/users/abc123XYZ/posts/9f8e → /api/users/:id/posts/:id (bounded cardinality). */
export function normalizeRoute(path: string): string {
  const clean = path.split('?')[0].slice(0, 200);
  return clean.split('/').map(seg => {
    if (!seg) return seg;
    if (/^\d+$/.test(seg)) return ':n';
    if (seg.length >= 16 || /[0-9]/.test(seg) && seg.length >= 8) return ':id';
    if (/^[0-9a-f-]{8,}$/i.test(seg)) return ':id';
    return seg;
  }).slice(0, 6).join('/') || '/';
}

interface RouteAgg { n: number; e4xx: number; e5xx: number; r429: number; sumMs: number; maxMs: number; samples: number[] }

const MAX_ROUTES = 400;
const MAX_IPS = 3000;
const SAMPLES_PER_ROUTE = 120;

const EXEMPT = (p: string) =>
  p.startsWith('/api/cron/') || p.startsWith('/api/security/') || p.includes('webhook') || p === '/api/healthz';

export interface EdgeOptions {
  store: () => CouncilStore | null;
  flushMs?: number;
  instanceId?: string;
  /** Read at request time so a flag flip only needs a new revision, not code. */
  autoMitigate?: () => boolean;
  now?: () => number;
}

export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[i];
}

export function createCouncilEdge(opts: EdgeOptions) {
  const now = opts.now || Date.now;
  const instance = (opts.instanceId || `${process.env.K_REVISION || 'local'}-${randomBytes(3).toString('hex')}`).slice(0, 80);
  const flushMs = Math.max(60_000, opts.flushMs ?? (Number(process.env.SECURITY_COUNCIL_TELEMETRY_FLUSH_MS) || 300_000));
  const autoMitigate = opts.autoMitigate || (() => process.env.SECURITY_COUNCIL_AUTO_MITIGATE === 'true');

  let bucketStart = now();
  let routes = new Map<string, RouteAgg>();
  let ip429 = new Map<string, number>();
  let ipReq = new Map<string, number>();
  let appCheckInvalid = 0;
  let total = 0;

  // ── mitigation cache ──
  let mitigations = new Map<string, { limitPerMin: number; expiresAt: number; id: string }>();
  let mitigationsLoadedAt = 0;
  let loading = false;
  const windows = new Map<string, { start: number; n: number }>();

  async function refreshMitigations() {
    const store = opts.store();
    if (!store || loading) return;
    loading = true;
    try {
      const rows = await store.query('security_mitigations', { where: [{ field: 'status', op: '==', value: 'active' }], limit: 300 });
      const next = new Map<string, { limitPerMin: number; expiresAt: number; id: string }>();
      for (const r of rows) {
        const m = r.data as Partial<SecurityMitigation>;
        const exp = toMs(m.expiresAt);
        const ipHash = m.target?.ipHash;
        if (ipHash && exp > now()) next.set(ipHash, { limitPerMin: Math.max(5, Number(m.limitPerMin) || 30), expiresAt: exp, id: r.id });
      }
      mitigations = next;
    } catch { /* keep the previous cache */ } finally {
      mitigationsLoadedAt = now();
      loading = false;
    }
  }

  /** Called by the undo route so the instance that handled the undo stops gating at once. */
  function forgetMitigation(ipHash: string) { mitigations.delete(ipHash); windows.delete(ipHash); }

  function snapshot() {
    const routeRows = [...routes.entries()].map(([route, a]) => {
      const s = a.samples.slice().sort((x, y) => x - y);
      return { route, n: a.n, e4xx: a.e4xx, e5xx: a.e5xx, r429: a.r429, avgMs: Math.round(a.sumMs / Math.max(1, a.n)), p95Ms: Math.round(percentile(s, 0.95)), maxMs: Math.round(a.maxMs) };
    }).sort((a, b) => b.n - a.n).slice(0, 250);
    const top = (m: Map<string, number>, k: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([ipHash, n]) => ({ ipHash, n }));
    return { routes: routeRows, ip429: top(ip429, 50), ipTop: top(ipReq, 50), appCheckInvalid, total };
  }

  async function flush(force = false): Promise<boolean> {
    const end = now();
    if (!force && end - bucketStart < flushMs) return false;
    const snap = snapshot();
    const startedAt = bucketStart;
    bucketStart = end;
    routes = new Map(); ip429 = new Map(); ipReq = new Map(); appCheckInvalid = 0; total = 0;
    if (!snap.total) return false;
    const store = opts.store();
    if (!store) return false;
    const id = `${instance}_${startedAt}`.replace(/[^A-Za-z0-9_-]/g, '-');
    const r = await store.createOnce('security_telemetry', id, { instance, bucketStart: startedAt, bucketEnd: end, at: end, ...snap, expireAt: new Date(end + 14 * 86_400_000) });
    return r === 'created';
  }

  const timer = setInterval(() => { flush().catch(() => {}); }, Math.min(flushMs, 60_000));
  (timer as any).unref?.();

  function record(path: string, status: number, ms: number, ipHash: string, appCheckBad: boolean) {
    total++;
    const key = normalizeRoute(path);
    let a = routes.get(key);
    if (!a) {
      if (routes.size >= MAX_ROUTES) { a = routes.get('(other)'); if (!a) { a = { n: 0, e4xx: 0, e5xx: 0, r429: 0, sumMs: 0, maxMs: 0, samples: [] }; routes.set('(other)', a); } }
      else { a = { n: 0, e4xx: 0, e5xx: 0, r429: 0, sumMs: 0, maxMs: 0, samples: [] }; routes.set(key, a); }
    }
    a.n++; a.sumMs += ms; if (ms > a.maxMs) a.maxMs = ms;
    if (status >= 500) a.e5xx++; else if (status >= 400) a.e4xx++;
    if (status === 429) a.r429++;
    // Reservoir-ish: keep the first N then replace at random — bounded memory, unbiased enough for p95.
    if (a.samples.length < SAMPLES_PER_ROUTE) a.samples.push(ms); else a.samples[Math.floor(Math.random() * SAMPLES_PER_ROUTE)] = ms;
    if (ipReq.size < MAX_IPS || ipReq.has(ipHash)) ipReq.set(ipHash, (ipReq.get(ipHash) || 0) + 1);
    if (status === 429 && (ip429.size < MAX_IPS || ip429.has(ipHash))) ip429.set(ipHash, (ip429.get(ipHash) || 0) + 1);
    if (appCheckBad) appCheckInvalid++;
  }

  function middleware(req: any, res: any, next: any) {
    const started = process.hrtime.bigint();
    const path: string = (req.baseUrl || '') + (req.path || '');
    let ipHash = '';
    try { ipHash = hashIp(String(req.ip || req.socket?.remoteAddress || 'unknown')); } catch { ipHash = 'unknown'; }

    res.on('finish', () => {
      try {
        const ms = Number(process.hrtime.bigint() - started) / 1e6;
        record(path, res.statusCode, ms, ipHash, req.appCheckValid === false);
      } catch { /* telemetry must never throw */ }
    });

    if (!autoMitigate() || EXEMPT(path)) return next();
    const t = now();
    if (t - mitigationsLoadedAt > 60_000) refreshMitigations(); // fire-and-forget
    const m = mitigations.get(ipHash);
    if (!m || m.expiresAt <= t) return next();
    let w = windows.get(ipHash);
    if (!w || t - w.start >= 60_000) { w = { start: t, n: 0 }; windows.set(ipHash, w); if (windows.size > 5000) windows.clear(); }
    w.n++;
    if (w.n <= m.limitPerMin) return next();
    const retry = Math.max(1, Math.ceil((w.start + 60_000 - t) / 1000));
    res.setHeader('Retry-After', String(retry));
    return res.status(429).json({ error: 'Too many requests, try again shortly', retryAfterSec: retry });
  }

  return { middleware, flush, snapshot, refreshMitigations, forgetMitigation, instance };
}
