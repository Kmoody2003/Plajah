/**
 * Deterministic signal collection — one shared read pass per council run, no LLM.
 *
 * Every read is windowed (last 60 min) and capped, and wherever possible uses a field projection so we
 * never pull large or sensitive fields (traces, report text, media). Guardian's sources are projection-only
 * BY CONSTRUCTION: csam_cases / child-safety reports are read with `select` limited to status + timestamps.
 *
 * Baselines: instead of re-reading 24h of history each run, the council keeps an EWMA per metric in
 * security_council_state/baseline (one doc read + one write per run).
 */
import type { CouncilEnv, CouncilStore, QuerySpec, StoredDoc } from './types';
import { toMs } from './store';
import { createHash } from 'node:crypto';

export const WINDOW_MS = 60 * 60 * 1000;

export type EventCategory =
  | 'privilege' | 'appCheck' | 'appCheckOk' | 'appCheckInfra' | 'authFail' | 'authLookup' | 'cspReport' | 'rateLimited'
  | 'adminAction' | 'signup' | 'spam' | 'follow' | 'report' | 'permissionDenied' | 'tokenAnomaly' | 'other';

// Order matters: first match wins. security_events types are free-form snake_case strings written via
// services/securityEvents.ts recordSecurityEvent() — currently: appcheck_valid|invalid|missing|blocked|jwks_error,
// signup_check_ok|disposable|rate_limited, shared_rate_limited, auth_methods_lookup, csp_report, spam_blocked_server.
const CATEGORY_RULES: Array<[EventCategory, RegExp]> = [
  ['privilege', /privilege|role[_.-]?change|admin[_.-]?grant|escalat|claims?[_.-]?change/i],
  ['appCheckOk', /^appcheck_valid$/i],
  ['appCheckInfra', /^appcheck_jwks_error$/i],
  ['appCheck', /app[_.-]?check/i],
  ['signup', /^signup_check_|sign[_.-]?up|register|account[_.-]?created|user[_.-]?created/i],
  ['authLookup', /^auth_methods_lookup$/i],
  ['cspReport', /^csp_report$/i],
  ['authFail', /(auth|login|signin|sign[_.-]in|password|otp|mfa).*(fail|invalid|denied|wrong|bad|mismatch)|credential|brute/i],
  ['rateLimited', /rate[_.-]?limit|throttl|\b429\b/i],
  ['adminAction', /admin/i],
  ['spam', /spam|post[_.-]?blocked|blocked[_.-]?post|link[_.-]?flood|flood/i],
  ['follow', /follow/i],
  ['report', /report/i],
  ['permissionDenied', /permission|forbidden|unauthori[sz]ed|\b403\b/i],
  ['tokenAnomaly', /token|session[_.-]?(hijack|reuse)|replay/i],
];
export function categorize(type: string): EventCategory {
  for (const [cat, re] of CATEGORY_RULES) if (re.test(type)) return cat;
  return 'other';
}

export interface SecEvent { id: string; type: string; category: EventCategory; at: number; uid?: string; ipHash?: string; route?: string; data: Record<string, any> }
export interface TelemetryRoute { route: string; n: number; e4xx: number; e5xx: number; r429: number; avgMs: number; p95Ms: number; maxMs: number }
export interface ProbeResult { path: string; status: number; ms: number; ok: boolean; error?: string }

export interface BaselineState { metrics: Record<string, { ewma: number; samples: number }>; updatedAt: number }

export interface SignalContext {
  now: number;
  since: number;
  /** SAMPLED events (rollup samples ≤3/type/min/instance + urgent docs). Use for per-subject signals only. */
  events: SecEvent[];
  /** EXACT counts per event type over the window, from rollup docs (falls back to samples if no rollups). */
  eventTypeCounts: Map<string, number>;
  eventsTruncated: boolean;
  errorReports: StoredDoc[];
  errorReportsCount: number | null;
  loginIssues: Array<{ provider: string; code: string; at: number; emailHash: string }>;
  contentReports: StoredDoc[];
  contentReportsCount: number | null;
  childSafetyReports: Array<{ id: string; status: string; at: number; contentType: string }>;
  csamCases: Array<{ id: string; status: string; at: number; updatedAt: number }>;
  csamCasesReadable: boolean;
  enforcementActions: StoredDoc[];
  appeals: Array<{ id: string; status: string; at: number; slaDueAt: number }>;
  signupsCount: number | null;
  telemetry: { docs: number; instances: number; routes: TelemetryRoute[]; ip429: Map<string, number>; ipTop: Map<string, number>; appCheckInvalid: number; total: number };
  audit: Record<string, any> | null;
  probes: ProbeResult[];
  activeMitigations: StoredDoc[];
  baseline: BaselineState;
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);

/** Query a window on a timestamp field whose type we don't control (ms number OR Firestore Timestamp). */
async function windowed(store: CouncilStore, collection: string, field: string, since: number, extra: Omit<QuerySpec, 'where' | 'orderBy'>): Promise<StoredDoc[]> {
  const spec = (value: unknown): QuerySpec => ({ ...extra, where: [{ field, op: '>=', value }], orderBy: { field, dir: 'desc' } });
  const [asNum, asTs] = await Promise.all([store.query(collection, spec(since)), store.query(collection, spec(new Date(since)))]);
  const seen = new Set<string>();
  return [...asNum, ...asTs].filter(d => (seen.has(d.id) ? false : (seen.add(d.id), true)));
}
async function windowedCount(store: CouncilStore, collection: string, field: string, since: number): Promise<number | null> {
  const [a, b] = await Promise.all([
    store.count(collection, [{ field, op: '>=', value: since }]),
    store.count(collection, [{ field, op: '>=', value: new Date(since) }]),
  ]);
  if (a === null && b === null) return null;
  return (a || 0) + (b || 0);
}

async function probe(base: string, path: string, fetchImpl: typeof fetch): Promise<ProbeResult> {
  const t0 = Date.now();
  try {
    const res = await fetchImpl(base.replace(/\/$/, '') + path, { method: 'GET', signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'plajah-security-council/1' } });
    await res.arrayBuffer().catch(() => null);
    return { path, status: res.status, ms: Date.now() - t0, ok: res.ok };
  } catch (e: any) {
    return { path, status: 0, ms: Date.now() - t0, ok: false, error: String(e?.name || e?.message || e).slice(0, 80) };
  }
}

export async function collectSignals(store: CouncilStore, env: CouncilEnv, opts: { now?: number; fetchImpl?: typeof fetch; skipProbes?: boolean } = {}): Promise<SignalContext> {
  const now = opts.now ?? Date.now();
  const since = now - WINDOW_MS;
  const f = opts.fetchImpl || fetch;

  const [
    rollupsRaw, urgentRaw, errorReports, errorReportsCount, loginRaw, contentReports, contentReportsCount,
    childRaw, csamRaw, enforcementActions, appealsRaw, signupsCount, telemetryRaw, audit, activeMitigations, baselineDoc,
  ] = await Promise.all([
    // services/securityEvents.ts writes per-instance per-minute ROLLUPS {kind:'rollup', windowEnd, counts, samples}
    // and capped URGENT docs {kind:'urgent', type, at, ...}. Each query filters one field → no composite index.
    store.query('security_events', { where: [{ field: 'windowEnd', op: '>=', value: since }], orderBy: { field: 'windowEnd', dir: 'desc' }, limit: 1500 }),
    store.query('security_events', { where: [{ field: 'at', op: '>=', value: since }], orderBy: { field: 'at', dir: 'desc' }, limit: 600 }),
    store.query('errorReports', {
      where: [{ field: 'createdAt', op: '>=', value: since }], orderBy: { field: 'createdAt', dir: 'desc' }, limit: 500,
      select: ['message', 'source', 'context', 'severity', 'url', 'currentView', 'createdAt'],
    }),
    store.count('errorReports', [{ field: 'createdAt', op: '>=', value: since }]),
    store.query('loginIssues', { where: [{ field: 'createdAt', op: '>=', value: since }], orderBy: { field: 'createdAt', dir: 'desc' }, limit: 500, select: ['provider', 'code', 'email', 'createdAt'] }),
    windowed(store, 'content_reports', 'createdAt', since, { limit: 500, select: ['reason', 'contentType', 'authorId', 'createdAt', 'status'] }),
    windowedCount(store, 'content_reports', 'createdAt', since),
    // Guardian: metadata projection only — never `details`, `snapshot`, media refs.
    // Two equality filters merge single-field indexes — no composite index needed.
    store.query('content_reports', { where: [{ field: 'reason', op: '==', value: 'sexual_minor_safety' }, { field: 'status', op: '==', value: 'OPEN' }], limit: 300, select: ['status', 'createdAt', 'contentType'] }),
    // services/safety/csamCase.ts: {status: pending_report|report_drafted|report_failed|reported, detectedAt}. Metadata only.
    store.query('csam_cases', { where: [{ field: 'status', op: 'in', value: ['pending_report', 'report_drafted', 'report_failed'] }], limit: 300, select: ['status', 'detectedAt', 'updatedAt'] }),
    windowed(store, 'enforcement_actions', 'createdAt', since, { limit: 500, select: ['createdBy', 'actorUid', 'level', 'status', 'createdAt'] }),
    // services/enforcement: appeals {status: PENDING|UPHELD|MODIFIED|OVERTURNED, createdAt, slaDueAt}
    store.query('appeals', { where: [{ field: 'status', op: '==', value: 'PENDING' }], limit: 300, select: ['status', 'createdAt', 'slaDueAt'] }),
    windowedCount(store, 'users', 'createdAt', since),
    store.query('security_telemetry', { where: [{ field: 'at', op: '>=', value: since }], orderBy: { field: 'at', dir: 'desc' }, limit: 300 }),
    store.get('security_audit', 'latest'),
    store.query('security_mitigations', { where: [{ field: 'status', op: '==', value: 'active' }], limit: 300 }),
    store.get('security_council_state', 'baseline'),
  ]);

  const toEvent = (id: string, x: Record<string, any>): SecEvent => {
    const type = String(x.type || 'unknown').slice(0, 80);
    return {
      id, type, category: categorize(type), at: toMs(x.at),
      uid: typeof x.uid === 'string' ? x.uid : undefined,
      ipHash: typeof x.ipHash === 'string' ? x.ipHash : undefined,
      route: typeof x.route === 'string' ? x.route.slice(0, 200) : undefined,
      // `detail` is free text from the server (e.g. CSP directive) — untrusted; never sent to an LLM unwrapped.
      data: typeof x.detail === 'string' ? { detail: x.detail.slice(0, 300) } : (x.data && typeof x.data === 'object' ? x.data : {}),
    };
  };
  const eventTypeCounts = new Map<string, number>();
  const events: SecEvent[] = [];
  const seenSample = new Set<string>();
  for (const d of rollupsRaw) {
    if (d.data.kind && d.data.kind !== 'rollup') continue;
    for (const [type, n] of Object.entries(d.data.counts || {})) eventTypeCounts.set(type, (eventTypeCounts.get(type) || 0) + (Number(n) || 0));
    (Array.isArray(d.data.samples) ? d.data.samples : []).forEach((s: any, i: number) => {
      const key = `${s?.type}|${s?.at}|${s?.ipHash || ''}|${s?.uid || ''}`;
      if (s && !seenSample.has(key)) { seenSample.add(key); events.push(toEvent(`${d.id}#${i}`, s)); }
    });
  }
  for (const d of urgentRaw) {
    if (d.data.kind === 'rollup') continue;
    const key = `${d.data.type}|${d.data.at}|${d.data.ipHash || ''}|${d.data.uid || ''}`;
    if (!seenSample.has(key)) { seenSample.add(key); events.push(toEvent(d.id, d.data)); }
    // Urgent events are ALSO counted in their instance's next rollup; only count them when no rollups exist yet.
    if (!rollupsRaw.length) eventTypeCounts.set(String(d.data.type), (eventTypeCounts.get(String(d.data.type)) || 0) + 1);
  }
  events.sort((a, b) => b.at - a.at);

  const loginIssues = loginRaw.map(d => ({
    provider: String(d.data.provider || '').slice(0, 40),
    code: String(d.data.code || '').slice(0, 80),
    at: toMs(d.data.createdAt),
    // Hash immediately; the address itself never leaves this function.
    emailHash: d.data.email ? sha(String(d.data.email).toLowerCase().trim()) : '',
  }));

  const childSafetyReports = childRaw.map(d => ({ id: d.id, status: String(d.data.status || ''), at: toMs(d.data.createdAt), contentType: String(d.data.contentType || '') }));
  const csamCases = csamRaw.map(d => ({ id: d.id, status: String(d.data.status || ''), at: toMs(d.data.detectedAt), updatedAt: toMs(d.data.updatedAt) }));
  const appeals = appealsRaw.map(d => ({ id: d.id, status: String(d.data.status || ''), at: toMs(d.data.createdAt), slaDueAt: toMs(d.data.slaDueAt) }));

  // Merge telemetry across instances.
  const routeAgg = new Map<string, TelemetryRoute & { wP95: number }>();
  const ip429 = new Map<string, number>();
  const ipTop = new Map<string, number>();
  const instances = new Set<string>();
  let appCheckInvalid = 0, total = 0;
  for (const d of telemetryRaw) {
    instances.add(String(d.data.instance || d.id));
    appCheckInvalid += Number(d.data.appCheckInvalid) || 0;
    total += Number(d.data.total) || 0;
    for (const r of Array.isArray(d.data.routes) ? d.data.routes : []) {
      const key = String(r.route || '?');
      const a = routeAgg.get(key) || { route: key, n: 0, e4xx: 0, e5xx: 0, r429: 0, avgMs: 0, p95Ms: 0, maxMs: 0, wP95: 0 };
      const n = Number(r.n) || 0;
      a.avgMs = Math.round((a.avgMs * a.n + (Number(r.avgMs) || 0) * n) / Math.max(1, a.n + n));
      a.wP95 += (Number(r.p95Ms) || 0) * n; // request-weighted p95 approximation across buckets
      a.n += n; a.e4xx += Number(r.e4xx) || 0; a.e5xx += Number(r.e5xx) || 0; a.r429 += Number(r.r429) || 0;
      a.maxMs = Math.max(a.maxMs, Number(r.maxMs) || 0);
      routeAgg.set(key, a);
    }
    for (const x of Array.isArray(d.data.ip429) ? d.data.ip429 : []) if (x?.ipHash) ip429.set(x.ipHash, (ip429.get(x.ipHash) || 0) + (Number(x.n) || 0));
    for (const x of Array.isArray(d.data.ipTop) ? d.data.ipTop : []) if (x?.ipHash) ipTop.set(x.ipHash, (ipTop.get(x.ipHash) || 0) + (Number(x.n) || 0));
  }
  const routes = [...routeAgg.values()].map(({ wP95, ...r }) => ({ ...r, p95Ms: Math.round(wP95 / Math.max(1, r.n)) }));

  const probes = opts.skipProbes || !env.probeBase ? [] : await Promise.all(env.probePaths.slice(0, 8).map(p => probe(env.probeBase!, p, f)));

  const baseline: BaselineState = baselineDoc && typeof baselineDoc.metrics === 'object'
    ? { metrics: baselineDoc.metrics, updatedAt: toMs(baselineDoc.updatedAt) }
    : { metrics: {}, updatedAt: 0 };

  return {
    now, since, events, eventTypeCounts, eventsTruncated: rollupsRaw.length >= 1500 || urgentRaw.length >= 600,
    errorReports, errorReportsCount, loginIssues, contentReports, contentReportsCount,
    childSafetyReports, csamCases, csamCasesReadable: true, enforcementActions, appeals, signupsCount,
    telemetry: { docs: telemetryRaw.length, instances: instances.size, routes, ip429, ipTop, appCheckInvalid, total },
    audit, probes, activeMitigations, baseline,
  };
}

/** Exact event count for a category over the window (rollup counts; samples only if there are no rollups). */
export function categoryCount(ctx: SignalContext, cat: EventCategory): number {
  if (ctx.eventTypeCounts.size) {
    let n = 0;
    for (const [type, c] of ctx.eventTypeCounts) if (categorize(type) === cat) n += c;
    return n;
  }
  return ctx.events.filter(e => e.category === cat).length;
}

// ── Baseline helpers ─────────────────────────────────────────────────────────
const ALPHA = 0.03; // per 15-min run ≈ 5.7h half-life

export function baselineOf(ctx: SignalContext, key: string): { value: number; warm: boolean } {
  const m = ctx.baseline.metrics[key];
  return m ? { value: m.ewma, warm: m.samples >= 8 } : { value: 0, warm: false };
}

/** A spike = current ≥ minAbs AND (cold baseline ? current ≥ coldAbs : current ≥ mult × baseline). */
export function isSpike(ctx: SignalContext, key: string, current: number, minAbs: number, mult: number, coldAbs = minAbs * 3): boolean {
  if (current < minAbs) return false;
  const b = baselineOf(ctx, key);
  return b.warm ? current >= mult * Math.max(b.value, 1) : current >= coldAbs;
}

export function nextBaseline(prev: BaselineState, current: Record<string, number>, now: number): BaselineState {
  const metrics = { ...prev.metrics };
  for (const [k, v] of Object.entries(current)) {
    if (!Number.isFinite(v)) continue;
    const m = metrics[k];
    metrics[k] = m ? { ewma: m.ewma + ALPHA * (v - m.ewma), samples: Math.min(m.samples + 1, 100000) } : { ewma: v, samples: 1 };
  }
  return { metrics, updatedAt: now };
}
