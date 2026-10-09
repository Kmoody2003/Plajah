/**
 * The six council agents. Each is a PURE function over the shared SignalContext → FindingDraft[].
 * No I/O, no LLM — that keeps the 15-minute run cheap and makes every threshold unit-testable.
 *
 * Thresholds are deliberately conservative (false positives erode trust in the council). All of them are
 * listed in THRESHOLDS and documented in docs/SECURITY_IT_COUNCIL.md.
 */
import type { CouncilAgentId, FindingDraft, FindingSeverity } from './types';
import { baselineOf, categoryCount, isSpike, type SecEvent, type SignalContext } from './signals';
import { toMs } from './store';

export const THRESHOLDS = {
  // Sentinel
  authFailPerIpHigh: 50,            // auth failures from one IP hash in 60 min
  authFailDistinctAccountsPerIp: 10,// distinct accounts targeted from one IP hash (credential stuffing)
  authFailSpikeMin: 30, authFailSpikeMult: 3,
  loginSprayDistinctEmails: 25,     // distinct emails failing with credential codes in 60 min (client-reported)
  appCheckInvalidMin: 50, appCheckSpikeMult: 4,
  adminActionsPerActor: 50,         // admin/enforcement actions by one actor in 60 min
  tokenAnomalyMin: 10,
  authLookupSpikeMin: 200, authLookupSpikeMult: 4, // auth_methods_lookup = "which way did I sign up?" (enumeration surface)
  cspReportMin: 100,
  sharedSourceShare: 0.2,           // never mitigate a source carrying ≥ 20% of all traffic (shared proxy / NAT)
  ipAttributionShare: 0.5, ipAttributionMinRequests: 500,
  // Warden
  signupSpikeMin: 50, signupSpikeMult: 4, signupHigh: 200,
  signupsPerIp: 5,
  spamPerSubject: 20,
  followChurnPerUid: 200,
  reportSpikeMin: 20, reportSpikeMult: 4,
  reportsPerAuthor: 10,
  ip429Medium: 300,                 // 429s for one IP hash in 60 min, summed over instances
  ip429Hard: 1500,                  // hard threshold → reversible auto-mitigation (flag-gated)
  appealSlaDays: 7,
  // Guardian
  childSafetySlaMin: 60,            // sexual_minor_safety OPEN report age → high; ×4 → critical
  csamCaseStuckHours: 24,
  // Medic
  errorSpikeMin: 30, errorSpikeMult: 3, errorSevereMult: 10,
  errorClusterMin: 15,
  permissionDeniedClusterMin: 5,
  probeSlowMs: 2000,
  route5xxMin: 10, route5xxRate: 0.05, route5xxHighRate: 0.25,
  loginBrokenMin: 10,
  // Auditor
  auditStaleDays: 3,
  // Steward
  slowP95Ms: 1500, verySlowP95Ms: 4000, slowMinRequests: 30,
  hotRoutePerHour: 20000,
  bundleRegressionPct: 10, bundleChunkKb: 1500,
} as const;

const T = THRESHOLDS;
const countBy = <K>(items: K[], key: (x: K) => string | undefined) => {
  const m = new Map<string, number>();
  for (const x of items) { const k = key(x); if (k) m.set(k, (m.get(k) || 0) + 1); }
  return m;
};
const distinctBy = <K>(items: K[], group: (x: K) => string | undefined, val: (x: K) => string | undefined) => {
  const m = new Map<string, Set<string>>();
  for (const x of items) { const g = group(x), v = val(x); if (!g || !v) continue; let s = m.get(g); if (!s) m.set(g, s = new Set()); s.add(v); }
  return m;
};
const top = (m: Map<string, number>, n = 5) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
const short = (s: string) => (s.length > 12 ? s.slice(0, 12) : s);
const ofCat = (ctx: SignalContext, c: SecEvent['category']) => ctx.events.filter(e => e.category === c);
/** An IP hash from security_events is only mitigable when the edge also saw it (same hashing scheme + live traffic). */
const seenAtEdge = (ctx: SignalContext, ipHash: string) => ctx.telemetry.ipTop.has(ipHash) || ctx.telemetry.ip429.has(ipHash);
/** Share of all edge requests carried by one source. A big share means a shared proxy, not one actor. */
const shareOf = (ctx: SignalContext, ipHash: string) => (ctx.telemetry.total ? (ctx.telemetry.ipTop.get(ipHash) || 0) / ctx.telemetry.total : 0);
const mitigable = (ctx: SignalContext, env: { mitigationAllowlist: string[] }, ipHash: string) =>
  ipHash !== 'unknown' && !env.mitigationAllowlist.includes(ipHash) && seenAtEdge(ctx, ipHash) && shareOf(ctx, ipHash) < T.sharedSourceShare;

// ── Sentinel: threat intel ───────────────────────────────────────────────────
export function sentinel(ctx: SignalContext, env: { mitigationAllowlist: string[] }): FindingDraft[] {
  const out: FindingDraft[] = [];
  const fails = ofCat(ctx, 'authFail');
  const perIp = countBy(fails, e => e.ipHash);
  const accountsPerIp = distinctBy(fails, e => e.ipHash, e => e.uid || (e.data.emailHash as string) || (e.data.account as string));
  for (const [ipHash, n] of perIp) {
    const accounts = accountsPerIp.get(ipHash)?.size || 0;
    if (n < T.authFailPerIpHigh && accounts < T.authFailDistinctAccountsPerIp) continue;
    const stuffing = accounts >= T.authFailDistinctAccountsPerIp;
    const canMitigate = n >= T.authFailPerIpHigh * 2 && mitigable(ctx, env, ipHash);
    out.push({
      agent: 'sentinel', severity: 'high',
      title: stuffing ? `Credential stuffing pattern: ${accounts} accounts targeted from one source` : `Auth failure burst from one source (${n}/h)`,
      dedupeKey: `sentinel:authfail-ip:${ipHash}`,
      evidence: { ipHash, failures60m: n, distinctAccounts: accounts, sampleTypes: [...new Set(fails.filter(e => e.ipHash === ipHash).map(e => e.type))].slice(0, 5) },
      proposedFix: 'Confirm the source is not a shared NAT/test runner. If hostile: keep authLimiter as is, add Turnstile/App Check enforcement on the sign-in route, and consider a Cloud Armor rule for the source. Notify affected account owners to rotate passwords via the normal security-notice flow.',
      mitigation: canMitigate ? { kind: 'tighten_rate_limit', ipHash, limitPerMin: 20, ttlMs: 3_600_000, reason: `auth failure burst ${n}/h` } : undefined,
    });
  }
  const failTotal = categoryCount(ctx, 'authFail');
  if (isSpike(ctx, 'events.authFail', failTotal, T.authFailSpikeMin, T.authFailSpikeMult)) {
    out.push({
      agent: 'sentinel', severity: 'medium', title: `Platform-wide auth failure spike (${failTotal}/h)`,
      dedupeKey: 'sentinel:authfail-spike',
      evidence: { failures60m: failTotal, baselinePerRun: Math.round(baselineOf(ctx, 'events.authFail').value), topSources: top(perIp).map(([h, n]) => ({ ipHash: short(h), n })) },
      proposedFix: 'Check whether a client release broke sign-in (Medic will show matching errorReports) before treating as an attack. If distributed: enable ENFORCE_APP_CHECK on auth routes and review authLimiter windows.',
    });
  }
  // Client-reported login failures (loginIssues has no IP; distinct emails is the spray signal).
  const credCodes = ctx.loginIssues.filter(l => /wrong-password|invalid-credential|user-not-found|invalid-login/i.test(l.code));
  const distinctEmails = new Set(credCodes.map(l => l.emailHash).filter(Boolean)).size;
  if (distinctEmails >= T.loginSprayDistinctEmails) {
    out.push({
      agent: 'sentinel', severity: 'medium', title: `Possible password spray: ${distinctEmails} distinct emails failing sign-in in 60 min`,
      dedupeKey: 'sentinel:login-spray',
      evidence: { distinctEmails, failures: credCodes.length, byProvider: Object.fromEntries(countBy(credCodes, l => l.provider)) },
      proposedFix: 'Compare against normal daily volume; if anomalous enable Firebase Auth email enumeration protection and App Check on the password sign-in path.',
    });
  }
  const appCheckBad = Math.max(ctx.telemetry.appCheckInvalid, categoryCount(ctx, 'appCheck'));
  if (isSpike(ctx, 'appCheck.invalid', appCheckBad, T.appCheckInvalidMin, T.appCheckSpikeMult)) {
    out.push({
      agent: 'sentinel', severity: 'medium', title: `App Check failures elevated (${appCheckBad}/h)`,
      dedupeKey: 'sentinel:appcheck',
      evidence: { invalidTokens60m: appCheckBad, fromTelemetry: ctx.telemetry.appCheckInvalid, fromEvents: categoryCount(ctx, 'appCheck'), valid60m: categoryCount(ctx, 'appCheckOk'), enforce: process.env.ENFORCE_APP_CHECK === 'true' },
      proposedFix: 'Distinguish scripted clients (no/forged token) from a broken attestation provider after a release (debug tokens, reCAPTCHA key domain list). Do not flip ENFORCE_APP_CHECK until the legitimate failure rate is ~0.',
    });
  }
  for (const priv of ofCat(ctx, 'privilege').slice(0, 10)) {
    out.push({
      agent: 'sentinel', severity: 'high', title: `Privilege change event: ${priv.type}`,
      dedupeKey: `sentinel:privilege:${priv.id}`,
      evidence: { type: priv.type, uid: priv.uid, at: priv.at, route: priv.route },
      proposedFix: 'Verify this change was made by a platform admin through the admin console (admins/{uid} is server-only). If not, revoke the grant and rotate the affected session.',
    });
  }
  const adminActors = countBy([...ofCat(ctx, 'adminAction'), ...ctx.enforcementActions.map(d => ({ uid: d.data.createdBy || d.data.actorUid } as any))], (e: any) => e.uid);
  for (const [actor, n] of adminActors) {
    if (n < T.adminActionsPerActor) continue;
    out.push({
      agent: 'sentinel', severity: 'medium', title: `Unusual admin activity volume: ${n} actions in 60 min by one actor`,
      dedupeKey: `sentinel:admin-volume:${actor}`,
      evidence: { actorUid: actor, actions60m: n },
      proposedFix: 'Confirm with the actor that this is planned bulk work. If not recognised, revoke the admins/{uid} doc and review enforcement_actions written in this window (each is appealable under Fair Process).',
    });
  }
  const lookups = categoryCount(ctx, 'authLookup');
  if (isSpike(ctx, 'events.authLookup', lookups, T.authLookupSpikeMin, T.authLookupSpikeMult)) {
    out.push({
      agent: 'sentinel', severity: 'medium', title: `Sign-in method lookups elevated (${lookups}/h) — possible account enumeration`,
      dedupeKey: 'sentinel:auth-lookup-spike',
      evidence: { lookups60m: lookups, baselinePerRun: Math.round(baselineOf(ctx, 'events.authLookup').value) },
      proposedFix: '/api/auth-methods answers "which provider did this email use". It is behind authLimiter; if lookups keep climbing, require App Check on it and return the same generic answer for unknown emails.',
    });
  }
  const csp = categoryCount(ctx, 'cspReport');
  if (csp >= T.cspReportMin) {
    const directives = countBy(ofCat(ctx, 'cspReport'), e => String(e.data.detail || '').split(' ')[0] || undefined);
    out.push({
      agent: 'sentinel', severity: 'low', title: `CSP violation reports elevated (${csp}/h)`,
      dedupeKey: 'sentinel:csp',
      evidence: { reports60m: csp, sampledDirectives: Object.fromEntries(top(directives)) },
      proposedFix: 'Usually a new third-party origin after a deploy (add it to the CSP deliberately) or a browser extension. A burst on script-src from many users can indicate injected script — check the blocked URIs.',
      untrustedSamples: ofCat(ctx, 'cspReport').slice(0, 5).map(e => String(e.data.detail || '')),
    });
  }
  const tokenAnom = ofCat(ctx, 'tokenAnomaly');
  if (tokenAnom.length >= T.tokenAnomalyMin) {
    out.push({
      agent: 'sentinel', severity: 'medium', title: `Token/session anomalies (${tokenAnom.length}/h)`,
      dedupeKey: 'sentinel:token-anomaly',
      evidence: { count: tokenAnom.length, types: Object.fromEntries(countBy(tokenAnom, e => e.type)) },
      proposedFix: 'Inspect which routes reject tokens; a burst after deploy usually means a clock/audience mismatch, otherwise consider revoking refresh tokens for the affected uids (human decision).',
    });
  }
  return out;
}

// ── Warden: bots & abuse ─────────────────────────────────────────────────────
export function warden(ctx: SignalContext, env: { mitigationAllowlist: string[] }): FindingDraft[] {
  const out: FindingDraft[] = [];
  const signups = ctx.signupsCount ?? categoryCount(ctx, 'signup');
  if (isSpike(ctx, 'users.signups', signups, T.signupSpikeMin, T.signupSpikeMult)) {
    out.push({
      agent: 'warden', severity: signups >= T.signupHigh ? 'high' : 'medium', title: `Signup velocity spike (${signups}/h)`,
      dedupeKey: 'warden:signup-velocity',
      evidence: { signups60m: signups, baselinePerRun: Math.round(baselineOf(ctx, 'users.signups').value) },
      proposedFix: 'Check for a marketing push first. If organic traffic is flat: require App Check on account creation, add Turnstile to the signup form, and hold new accounts in the default low-trust tier (no DMs/links) for 24h.',
    });
  }
  for (const [ipHash, n] of countBy(ofCat(ctx, 'signup'), e => e.ipHash)) {
    if (n < T.signupsPerIp) continue;
    out.push({
      agent: 'warden', severity: 'medium', title: `Account farm signal: ${n} signups from one source in 60 min`,
      dedupeKey: `warden:signup-ip:${ipHash}`,
      evidence: { ipHash, signups60m: n },
      proposedFix: 'Review the new accounts together; if they are a farm, route them to the enforcement queue as one case (Fair Process notice per account).',
      recommendation: { subject: { ipHash }, reason: `${n} signups from one source in 60 min`, suggestedQueue: 'enforcement_review', evidence: { signups60m: n } },
    });
  }
  const spam = ofCat(ctx, 'spam');
  for (const [uid, n] of countBy(spam, e => e.uid)) {
    if (n < T.spamPerSubject) continue;
    out.push({
      agent: 'warden', severity: 'medium', title: `Spam burst from one account (${n} blocked posts/h)`,
      dedupeKey: `warden:spam-uid:${uid}`,
      evidence: { uid, spamEvents60m: n },
      proposedFix: 'The composer already blocks these posts. Queue the account for human review; do not suspend automatically.',
      recommendation: { subject: { uid }, reason: `${n} spam-blocked posts in 60 min`, suggestedQueue: 'enforcement_review', evidence: { spamEvents60m: n } },
    });
  }
  for (const [uid, n] of countBy(ofCat(ctx, 'follow'), e => e.uid)) {
    if (n < T.followChurnPerUid) continue;
    out.push({
      agent: 'warden', severity: 'medium', title: `Follow churn: ${n} follow/unfollow events in 60 min from one account`,
      dedupeKey: `warden:follow-churn:${uid}`,
      evidence: { uid, followEvents60m: n },
      proposedFix: 'Typical follow-for-follow automation. Propose a per-account follow rate limit (e.g. 100/h) in the follow endpoint; queue the account for review.',
      recommendation: { subject: { uid }, reason: `${n} follow events in 60 min`, suggestedQueue: 'enforcement_review', evidence: { followEvents60m: n } },
    });
  }
  const reports = ctx.contentReportsCount ?? ctx.contentReports.length;
  if (isSpike(ctx, 'content_reports.count', reports, T.reportSpikeMin, T.reportSpikeMult)) {
    out.push({
      agent: 'warden', severity: 'medium', title: `Report volume spike (${reports}/h)`,
      dedupeKey: 'warden:report-spike',
      evidence: { reports60m: reports, byReason: Object.fromEntries(countBy(ctx.contentReports, d => String(d.data.reason || 'other'))) },
      proposedFix: 'Check whether one piece of content is driving it (see per-author finding). Staff the ReportsQueue; consider temporarily raising the priority of the top reason.',
    });
  }
  for (const [authorId, n] of countBy(ctx.contentReports, d => d.data.authorId)) {
    if (n < T.reportsPerAuthor) continue;
    out.push({
      agent: 'warden', severity: 'medium', title: `${n} reports against one author in 60 min (pile-on or brigading)`,
      dedupeKey: `warden:reports-author:${authorId}`,
      evidence: { authorId, reports60m: n, reasons: Object.fromEntries(countBy(ctx.contentReports.filter(d => d.data.authorId === authorId), d => String(d.data.reason || 'other'))) },
      proposedFix: 'Review the reported content first; coordinated false reports are themselves abuse. Either outcome goes through the human queue.',
    });
  }
  for (const [ipHash, n] of ctx.telemetry.ip429) {
    if (n < T.ip429Medium) continue;
    const hard = n >= T.ip429Hard && mitigable(ctx, env, ipHash);
    out.push({
      agent: 'warden', severity: hard ? 'high' : 'medium', title: `Rate-limit burst: ${n} × 429 for one source in 60 min`,
      dedupeKey: `warden:429:${ipHash}`,
      evidence: { ipHash, r429_60m: n, requests60m: ctx.telemetry.ipTop.get(ipHash) || null, shareOfAllTraffic: Number(shareOf(ctx, ipHash).toFixed(3)), instancesReporting: ctx.telemetry.instances, autoMitigationEligible: hard },
      proposedFix: 'The global limiter is already absorbing this. If it persists across days, add a Cloud Armor / edge rule so it stops reaching Cloud Run at all.',
      mitigation: hard ? { kind: 'tighten_rate_limit', ipHash, limitPerMin: 30, ttlMs: 3_600_000, reason: `${n} rate-limited requests in 60 min` } : undefined,
    });
  }
  // Appeals are queried as status == PENDING; each carries its own Fair Process slaDueAt (fallback: appealSlaDays).
  const stale = ctx.appeals.filter(a => a.at && (a.slaDueAt ? ctx.now > a.slaDueAt : ctx.now - a.at > T.appealSlaDays * 86_400_000));
  if (stale.length) {
    out.push({
      agent: 'warden', severity: 'medium', title: `${stale.length} appeal(s) past their review SLA`,
      dedupeKey: 'warden:appeal-sla',
      evidence: { staleAppeals: stale.length, oldestDays: Math.floor((ctx.now - Math.min(...stale.map(a => a.at))) / 86_400_000) },
      proposedFix: 'Fair Process requires timely human review of appeals. Assign a reviewer; the council will not decide appeals.',
    });
  }
  return out;
}

// ── Guardian: child safety & illegal content (metadata only) ─────────────────
export function guardian(ctx: SignalContext): FindingDraft[] {
  const out: FindingDraft[] = [];
  const open = ctx.childSafetyReports.filter(r => /^open$/i.test(r.status) && r.at);
  if (open.length) {
    const oldestMin = Math.floor((ctx.now - Math.min(...open.map(r => r.at))) / 60_000);
    const breached = open.filter(r => ctx.now - r.at > T.childSafetySlaMin * 60_000).length;
    if (breached) {
      const sev: FindingSeverity = oldestMin > T.childSafetySlaMin * 4 ? 'critical' : 'high';
      out.push({
        agent: 'guardian', severity: sev, severityFloor: 'high',
        title: `Child-safety reports past SLA: ${breached} open longer than ${T.childSafetySlaMin} min`,
        dedupeKey: 'guardian:minor-safety-sla',
        evidence: { openReports: open.length, pastSla: breached, oldestMinutes: oldestMin, slaMinutes: T.childSafetySlaMin },
        proposedFix: 'Page the on-call trust & safety reviewer now. These reports must be reviewed by a trained human; the council never opens the content. If staffing is the bottleneck, route sexual_minor_safety reports to a dedicated priority queue with paging.',
      });
    }
  }
  const failed = ctx.csamCases.filter(c => /failed/i.test(c.status));
  if (failed.length) {
    out.push({
      agent: 'guardian', severity: 'critical', severityFloor: 'critical',
      title: `${failed.length} child-safety report submission(s) failed`,
      dedupeKey: 'guardian:csam-report-failed',
      evidence: { failedCases: failed.length, oldestHours: Math.floor((ctx.now - Math.min(...failed.map(c => c.at || ctx.now))) / 3_600_000) },
      proposedFix: 'The NCMEC CyberTipline submission returned an error (services/safety/csamCase.ts sets report_failed). A trained human must submit manually from the case draft now and fix the integration; the council never touches the case or the media.',
    });
  }
  const TERMINAL = /^reported$|submitted|closed|resolved|dismissed|false[_ ]?positive|complete|failed/i;
  const stuck = ctx.csamCases.filter(c => c.at && !TERMINAL.test(c.status) && ctx.now - Math.max(c.at, c.updatedAt || 0) > T.csamCaseStuckHours * 3_600_000);
  if (stuck.length) {
    out.push({
      agent: 'guardian', severity: 'critical', severityFloor: 'critical',
      title: `${stuck.length} child-safety case(s) stalled > ${T.csamCaseStuckHours}h without a terminal status`,
      dedupeKey: 'guardian:csam-case-stalled',
      evidence: { stalledCases: stuck.length, statuses: Object.fromEntries(countBy(stuck, c => c.status || '(none)')), oldestHours: Math.floor((ctx.now - Math.min(...stuck.map(c => c.at))) / 3_600_000) },
      proposedFix: 'Check the services/safety pipeline worker and the reporting integration (NCMEC CyberTipline submission). Legal reporting obligations are time-bound; escalate to the owner immediately.',
    });
  }
  return out;
}

// ── Medic: platform health ───────────────────────────────────────────────────
function componentOf(d: Record<string, any>): string {
  let p = '';
  try { p = new URL(String(d.url || '')).pathname.split('/').filter(Boolean)[0] || ''; } catch { /* not a URL */ }
  const ctx = String(d.context || d.currentView || '').split(/[:/\s]/)[0];
  return `${String(d.source || 'unknown').slice(0, 30)}:${(ctx || p || 'root').slice(0, 40)}`;
}

export function medic(ctx: SignalContext): FindingDraft[] {
  const out: FindingDraft[] = [];
  const errors = ctx.errorReportsCount ?? ctx.errorReports.length;
  if (isSpike(ctx, 'errorReports.count', errors, T.errorSpikeMin, T.errorSpikeMult)) {
    const b = baselineOf(ctx, 'errorReports.count');
    out.push({
      agent: 'medic', severity: b.warm && errors >= T.errorSevereMult * Math.max(b.value, 1) ? 'high' : 'medium',
      title: `Client error reports elevated (${errors}/h)`,
      dedupeKey: 'medic:error-spike',
      evidence: { errors60m: errors, baselinePerRun: Math.round(b.value), topComponents: top(countBy(ctx.errorReports.map(d => d.data), componentOf)).map(([c, n]) => ({ component: c, n })) },
      proposedFix: 'Correlate with the most recent deploy (Cloud Run revision). If a single component dominates, roll back or hotfix it; see the cluster findings for the message samples.',
    });
  }
  const isPerm = (m: string) => /permission[-_ ]denied|insufficient permissions/i.test(m);
  const clusters = new Map<string, Array<Record<string, any>>>();
  for (const d of ctx.errorReports) {
    const key = `${componentOf(d.data)}|${String(d.data.message || '').replace(/\d+/g, 'N').slice(0, 80)}`;
    let a = clusters.get(key); if (!a) clusters.set(key, a = []); a.push(d.data);
  }
  for (const [key, items] of clusters) {
    const perm = isPerm(String(items[0].message || ''));
    if (items.length < (perm ? T.permissionDeniedClusterMin : T.errorClusterMin)) continue;
    const [component] = key.split('|');
    out.push({
      agent: 'medic', severity: perm ? 'medium' : items.length >= T.errorClusterMin * 4 ? 'medium' : 'low',
      title: perm ? `Firestore permission-denied cluster in ${component} (${items.length}/h)` : `Error cluster in ${component} (${items.length}/h)`,
      dedupeKey: `medic:cluster:${key.slice(0, 120)}`,
      evidence: { component, count60m: items.length, severityMix: Object.fromEntries(countBy(items, i => String(i.severity || 'error'))), views: [...new Set(items.map(i => String(i.currentView || '')).filter(Boolean))].slice(0, 5) },
      proposedFix: perm
        ? 'A client read/write is being denied by firestore.rules. Find the query in this component, compare it to the matching rule (often a missing where-clause the rule requires, or a doc shape the rule rejects). Fix the client query or propose a rules change for human review — rules are never auto-deployed.'
        : 'Reproduce from the samples; check whether the component is missing a guard for absent data (undefined field, empty list) introduced by a recent change.',
      untrustedSamples: items.slice(0, 5).map(i => String(i.message || '')),
    });
  }
  for (const p of ctx.probes) {
    if (!p.ok) {
      out.push({
        agent: 'medic', severity: 'high', title: `Health probe failing: ${p.path} (${p.status || p.error})`,
        dedupeKey: `medic:probe-down:${p.path}`,
        evidence: { ...p },
        proposedFix: 'Check Cloud Run logs for the current revision; if the previous revision was healthy, shift traffic back to it.',
      });
    } else if (p.ms > T.probeSlowMs) {
      out.push({
        agent: 'medic', severity: 'medium', title: `Health probe slow: ${p.path} took ${p.ms} ms`,
        dedupeKey: `medic:probe-slow:${p.path}`,
        evidence: { ...p },
        proposedFix: 'Likely cold starts or event-loop blocking. Consider min-instances=1 and check for synchronous work at request time.',
      });
    }
  }
  for (const r of ctx.telemetry.routes) {
    if (r.e5xx < T.route5xxMin) continue;
    const rate = r.e5xx / Math.max(1, r.n);
    if (rate < T.route5xxRate) continue;
    out.push({
      agent: 'medic', severity: rate >= T.route5xxHighRate && r.e5xx >= 25 ? 'high' : 'medium',
      title: `5xx on ${r.route}: ${(rate * 100).toFixed(1)}% of ${r.n} requests`,
      dedupeKey: `medic:5xx:${r.route}`,
      evidence: { ...r, errorRate: Number(rate.toFixed(3)) },
      proposedFix: 'Open Cloud Run logs filtered to this path. Upstream timeouts (Firestore, AI providers) should return a handled 502/503 with a clear message instead of an unhandled 500.',
    });
  }
  const jwks = ctx.eventTypeCounts.get('appcheck_jwks_error') || 0;
  if (jwks > 0) {
    out.push({
      agent: 'medic', severity: 'medium', title: `App Check key fetch failing (${jwks} JWKS errors in 60 min)`,
      dedupeKey: 'medic:appcheck-jwks',
      evidence: { jwksErrors60m: jwks },
      proposedFix: 'The server could not fetch App Check public keys, so tokens cannot be verified. Check egress to firebaseappcheck.googleapis.com; while failing, keep ENFORCE_APP_CHECK off so real users are not rejected.',
    });
  }
  const [topSource] = [...ctx.telemetry.ipTop.entries()].sort((a, b) => b[1] - a[1]);
  if (topSource && ctx.telemetry.total >= T.ipAttributionMinRequests && topSource[1] / ctx.telemetry.total >= T.ipAttributionShare) {
    out.push({
      agent: 'medic', severity: 'medium', title: `Client IP attribution looks collapsed: one source = ${Math.round(topSource[1] / ctx.telemetry.total * 100)}% of requests`,
      dedupeKey: 'medic:ip-attribution',
      evidence: { topShare: Number((topSource[1] / ctx.telemetry.total).toFixed(3)), requests60m: ctx.telemetry.total, trustProxy: 'server.ts sets trust proxy = 1 in production' },
      proposedFix: 'Per-IP rate limits (express-rate-limit, council mitigations) are keyed on req.ip. Behind Firebase Hosting → Cloud Run the client is usually 2 hops back; if one hash dominates, verify `app.set("trust proxy", N)` against the real X-Forwarded-For chain before relying on per-IP limits. Auto-mitigation already refuses sources above 20% share.',
    });
  }
  const BROKEN = /popup-blocked|network-request-failed|internal-error|unauthorized-domain|operation-not-allowed|invalid-api-key|app-not-authorized/i;
  for (const [provider, n] of countBy(ctx.loginIssues.filter(l => BROKEN.test(l.code)), l => l.provider || 'unknown')) {
    if (n < T.loginBrokenMin) continue;
    out.push({
      agent: 'medic', severity: 'high', title: `Sign-in looks broken for ${provider} (${n} config/network failures in 60 min)`,
      dedupeKey: `medic:login-broken:${provider}`,
      evidence: { provider, failures60m: n, codes: Object.fromEntries(countBy(ctx.loginIssues.filter(l => l.provider === provider && BROKEN.test(l.code)), l => l.code)) },
      proposedFix: 'Check Firebase Auth authorized domains, the provider console (OAuth client, redirect URIs) and any recent auth-branding change.',
    });
  }
  return out;
}

// ── Auditor: dependencies & code ─────────────────────────────────────────────
export function auditor(ctx: SignalContext): FindingDraft[] {
  const out: FindingDraft[] = [];
  const a = ctx.audit;
  if (!a) {
    return [{
      agent: 'auditor', severity: 'info', title: 'Dependency/secret audit feed not connected',
      dedupeKey: 'auditor:feed-missing', evidence: { doc: 'security_audit/latest' },
      proposedFix: 'Set the SECURITY_COUNCIL_INGEST_KEY secret in GitHub and on Cloud Run so .github/workflows/security-audit.yml can POST its summary to /api/security/council/ingest-audit.',
    }];
  }
  const generatedAt = toMs(a.generatedAt);
  if (generatedAt && ctx.now - generatedAt > T.auditStaleDays * 86_400_000) {
    out.push({
      agent: 'auditor', severity: 'low', title: `Audit feed is stale (${Math.floor((ctx.now - generatedAt) / 86_400_000)} days old)`,
      dedupeKey: 'auditor:feed-stale', evidence: { generatedAt, ref: a.ref, commit: a.commit },
      proposedFix: 'Check the scheduled security-audit workflow run in GitHub Actions.',
    });
  }
  const advisories: any[] = Array.isArray(a.npmAudit?.advisories) ? a.npmAudit.advisories : [];
  for (const adv of advisories) {
    const sev = String(adv.severity || '').toLowerCase();
    if (sev !== 'high' && sev !== 'critical') continue;
    const name = String(adv.name || 'unknown').slice(0, 120);
    const fix = adv.fixAvailable && typeof adv.fixAvailable === 'object'
      ? `Upgrade to ${adv.fixAvailable.name}@${adv.fixAvailable.version}${adv.fixAvailable.isSemVerMajor ? ' (semver-major: test the affected feature)' : ''}.`
      : adv.fixAvailable === true ? 'Run `npm audit fix` (non-breaking fix available) and commit the lockfile.' : 'No fix published: assess exposure (is the vulnerable path reachable from user input?) and consider replacing the package.';
    out.push({
      agent: 'auditor', severity: sev as FindingSeverity, title: `${sev} vulnerability in ${name}${adv.title ? `: ${String(adv.title).slice(0, 100)}` : ''}`,
      dedupeKey: `auditor:npm:${name}:${String(adv.source || adv.url || adv.title || '').slice(0, 80)}`,
      evidence: { package: name, severity: sev, range: adv.range, via: adv.via, url: adv.url, direct: adv.isDirect, ref: a.ref, commit: a.commit },
      proposedFix: `${fix} Open a PR; never auto-merge dependency upgrades.`,
    });
  }
  const mod = Number(a.npmAudit?.counts?.moderate) || 0;
  if (mod > 0) {
    out.push({
      agent: 'auditor', severity: 'low', title: `${mod} moderate npm advisories (production deps)`,
      dedupeKey: 'auditor:npm-moderate', evidence: { counts: a.npmAudit?.counts },
      proposedFix: 'Batch these into the next routine dependency-refresh PR.',
    });
  }
  const secrets: any[] = Array.isArray(a.secretScan?.findings) ? a.secretScan.findings : [];
  for (const s of secrets.slice(0, 25)) {
    const where = `${String(s.file || '?').slice(0, 160)}:${Number(s.line) || 0}`;
    out.push({
      agent: 'auditor', severity: 'critical', severityFloor: 'critical',
      title: `Possible committed secret (${String(s.rule || 'secret').slice(0, 40)}) at ${where}`,
      dedupeKey: `auditor:secret:${s.rule}:${s.file}`,
      evidence: { rule: s.rule, file: s.file, line: s.line, ref: a.ref, commit: a.commit },
      proposedFix: 'Treat as leaked: rotate the credential at the provider first, then move it to Cloud Run env / Secret Manager, delete it from the file, and add the path to the scanner allowlist only if it is a verified false positive. Never print the value.',
    });
  }
  return out;
}

// ── Steward: efficiency & reliability ────────────────────────────────────────
export function steward(ctx: SignalContext): FindingDraft[] {
  const out: FindingDraft[] = [];
  for (const r of ctx.telemetry.routes) {
    if (r.n < T.slowMinRequests || r.p95Ms < T.slowP95Ms || r.route === '(other)') continue;
    const isAi = /\/ai\/|veo|gemini|anthropic|pokee|transcri|render|upload/i.test(r.route);
    out.push({
      agent: 'steward', severity: r.p95Ms >= T.verySlowP95Ms && !isAi ? 'medium' : 'low',
      title: `Slow endpoint ${r.route}: p95 ${r.p95Ms} ms over ${r.n} requests`,
      dedupeKey: `steward:slow:${r.route}`,
      evidence: { ...r, expectedSlow: isAi },
      proposedFix: isAi
        ? 'Long-running by nature: make sure the client streams or polls instead of holding the request, and that a timeout returns a friendly error.'
        : 'Patch proposal: (1) check for sequential awaits that can be Promise.all-ed, (2) add a short in-memory cache (30-60s) for read-mostly responses, (3) make sure Firestore reads are bounded with limit() and a projection. Measure p95 again after the change.',
    });
  }
  for (const r of ctx.telemetry.routes) {
    if (r.n < T.hotRoutePerHour || r.route === '(other)') continue;
    out.push({
      agent: 'steward', severity: 'low', title: `Hot endpoint ${r.route}: ${r.n} requests in 60 min`,
      dedupeKey: `steward:hot:${r.route}`,
      evidence: { ...r },
      proposedFix: 'Patch proposal: add Cache-Control for cacheable GETs so Firebase Hosting/CDN absorbs them, or debounce the client caller (often a polling interval or a re-render loop).',
    });
  }
  const scan = ctx.audit?.staticScan;
  const listeners: any[] = Array.isArray(scan?.unboundedListeners) ? scan.unboundedListeners : [];
  const queries: any[] = Array.isArray(scan?.unboundedQueries) ? scan.unboundedQueries : [];
  if (listeners.length + queries.length > 0) {
    out.push({
      agent: 'steward', severity: listeners.length > 20 ? 'medium' : 'low',
      title: `${listeners.length} unbounded realtime listeners, ${queries.length} unbounded queries (static scan)`,
      dedupeKey: 'steward:unbounded',
      evidence: { listeners: listeners.slice(0, 15), queries: queries.slice(0, 15), scannedAt: scan?.scannedAt },
      proposedFix: 'Patch proposal per site: add limit(N) to the query (and an orderBy so the window is meaningful); for onSnapshot in React components, return the unsubscribe from the useEffect and depend only on stable ids. Unbounded listeners re-bill every matching doc on reconnect.',
    });
  }
  const bundle = ctx.audit?.bundle;
  const cur = Number(bundle?.totalKb) || 0, prev = Number(bundle?.previousTotalKb) || 0;
  if (cur && prev && (cur - prev) / prev * 100 >= T.bundleRegressionPct) {
    out.push({
      agent: 'steward', severity: 'medium', title: `Bundle size regression: ${prev} KB → ${cur} KB (+${Math.round((cur - prev) / prev * 100)}%)`,
      dedupeKey: 'steward:bundle-regression',
      evidence: { totalKb: cur, previousTotalKb: prev, largest: Array.isArray(bundle?.largest) ? bundle.largest.slice(0, 10) : [] },
      proposedFix: 'Patch proposal: find the chunk that grew (largest list) and lazy-load the feature behind React.lazy / dynamic import; check for an accidental eager import of a heavy library (three, ffmpeg, onnx) into the shell.',
    });
  }
  for (const c of (Array.isArray(bundle?.largest) ? bundle.largest : []).filter((c: any) => Number(c.kb) >= T.bundleChunkKb).slice(0, 5)) {
    out.push({
      agent: 'steward', severity: 'low', title: `Large chunk ${String(c.file).slice(0, 80)} (${c.kb} KB)`,
      dedupeKey: `steward:chunk:${String(c.file).replace(/-[A-Za-z0-9_]{8}\./, '.')}`,
      evidence: { ...c },
      proposedFix: 'Patch proposal: split with manualChunks or dynamic import so first paint does not pay for it.',
    });
  }
  return out;
}

export const AGENT_RUNNERS: Record<CouncilAgentId, (ctx: SignalContext, env: { mitigationAllowlist: string[] }) => FindingDraft[]> = {
  sentinel, warden, guardian: ctx => guardian(ctx), medic: ctx => medic(ctx), auditor: ctx => auditor(ctx), steward: ctx => steward(ctx),
};

export const AGENT_CHARTERS: Record<CouncilAgentId, { name: string; charter: string }> = {
  sentinel: { name: 'Sentinel', charter: 'Threat intel: auth anomalies, credential stuffing, App Check failures, privilege changes, unusual admin activity.' },
  warden: { name: 'Warden', charter: 'Bots & abuse: signup velocity, spam bursts, follow churn, report spikes, rate-limit (429) bursts, appeal SLA.' },
  guardian: { name: 'Guardian', charter: 'Child safety & illegal content pipeline health: child-safety report SLA, stalled cases. Metadata only — never handles media or report text.' },
  medic: { name: 'Medic', charter: 'Platform health: client error rates and clusters, permission-denied clusters, health probes, 5xx by route, broken sign-in providers.' },
  auditor: { name: 'Auditor', charter: 'Dependencies & code: npm audit (production deps) and secret-scan results from CI; proposes upgrades and rotations.' },
  steward: { name: 'Steward', charter: 'Efficiency & reliability: slow and hot endpoints, unbounded listeners/queries, bundle size regressions; proposes concrete patches.' },
};

/** Metrics fed into the EWMA baseline after each run. */
export function baselineMetrics(ctx: SignalContext): Record<string, number> {
  return {
    'events.authFail': categoryCount(ctx, 'authFail'),
    'events.authLookup': categoryCount(ctx, 'authLookup'),
    'appCheck.invalid': Math.max(ctx.telemetry.appCheckInvalid, categoryCount(ctx, 'appCheck')),
    'users.signups': ctx.signupsCount ?? categoryCount(ctx, 'signup'),
    'content_reports.count': ctx.contentReportsCount ?? ctx.contentReports.length,
    'errorReports.count': ctx.errorReportsCount ?? ctx.errorReports.length,
  };
}
