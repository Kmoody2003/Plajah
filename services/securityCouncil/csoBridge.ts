/**
 * Bridges the legacy "Advance Threat Protection" API shapes (types.ts SecurityPlatformStats / CsoAssessment
 * / SecurityThreatEvent) onto REAL council data, replacing the old hard-coded seed telemetry.
 *
 * Anything we genuinely cannot measure is reported in `unavailableMetrics` and rendered as "n/a" by the UI —
 * never invented. There is no geo-IP source (IPs are only stored as salted hashes), so the map has no pings.
 */
import type { CsoAssessment, SecurityPlatformStats, SecurityThreatEvent, ThreatVector } from '../../types';
import type { CouncilStore, SecurityBrief, SecurityFinding } from './types';
import { categorize } from './signals';
import { toMs } from './store';

const VECTOR_BY_CATEGORY: Record<string, ThreatVector> = {
  authFail: 'CREDENTIAL_STUFFING', rateLimited: 'ANOMALOUS_API_VELOCITY', appCheck: 'TOKEN_POISONING',
  privilege: 'PRIVILEGE_ESCALATION', tokenAnomaly: 'SESSION_HIJACK', spam: 'BOT_SCRAPING', signup: 'BOT_SCRAPING',
  follow: 'BOT_SCRAPING', adminAction: 'ANOMALOUS_API_VELOCITY', permissionDenied: 'ANOMALOUS_API_VELOCITY',
};
const NO_GEO = { lat: 0, lng: 0, country: 'n/a', city: 'n/a' };

export async function councilThreatEvents(store: CouncilStore, now = Date.now()): Promise<SecurityThreatEvent[]> {
  const since = now - 86_400_000;
  // security_events holds per-minute rollups (with ≤25 samples) and capped urgent docs — see services/securityEvents.ts.
  const [rollups, urgent] = await Promise.all([
    store.query('security_events', { where: [{ field: 'windowEnd', op: '>=', value: since }], orderBy: { field: 'windowEnd', dir: 'desc' }, limit: 60, select: ['kind', 'samples'] }),
    store.query('security_events', { where: [{ field: 'at', op: '>=', value: since }], orderBy: { field: 'at', dir: 'desc' }, limit: 100 }),
  ]);
  const raw: Array<{ id: string; x: Record<string, any> }> = [];
  for (const r of rollups) (Array.isArray(r.data.samples) ? r.data.samples : []).forEach((x: any, i: number) => x && raw.push({ id: `${r.id}#${i}`, x }));
  for (const r of urgent) if (r.data.kind !== 'rollup') raw.push({ id: r.id, x: r.data });
  return raw
    .filter(({ x }) => categorize(String(x.type || '')) !== 'appCheckOk') // successful checks are not threats
    .map(({ id, x }) => {
      const type = String(x.type || 'unknown');
      const cat = categorize(type);
      const malicious = cat === 'privilege';
      return {
        id, timestamp: toMs(x.at), ip: x.ipHash ? `hash:${String(x.ipHash).slice(0, 10)}` : 'n/a', geo: NO_GEO,
        severity: malicious ? 'MALICIOUS_RED' : 'SUSPECTED',
        vector: VECTOR_BY_CATEGORY[cat] || 'ANOMALOUS_API_VELOCITY',
        targetEndpoint: String(x.route || '—').slice(0, 120),
        ...(typeof x.uid === 'string' ? { targetUid: x.uid } : {}),
        riskScore: malicious ? 90 : cat === 'authFail' || cat === 'appCheck' ? 60 : 40,
        mitigated: false, mitigationAction: 'LOGGED_MONITOR',
        details: `security_events (sampled): ${type}`,
      } as SecurityThreatEvent;
    })
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 150);
}

export async function councilPlatformStats(store: CouncilStore, now = Date.now()): Promise<SecurityPlatformStats> {
  const [findingsRows, mitigations, lastRuns, events] = await Promise.all([
    store.query('security_findings', { where: [{ field: 'status', op: 'in', value: ['open', 'ack'] }], limit: 500, select: ['agent', 'severity', 'title', 'lastSeen'] }),
    store.query('security_mitigations', { where: [{ field: 'status', op: '==', value: 'active' }], limit: 300, select: ['expiresAt'] }),
    store.query('security_council_runs', { orderBy: { field: 'at', dir: 'desc' }, limit: 1, select: ['at', 'status'] }),
    councilThreatEvents(store, now),
  ]);
  const f = findingsRows.map(r => r.data as Pick<SecurityFinding, 'agent' | 'severity'>);
  const critical = f.filter(x => x.severity === 'critical').length;
  const high = f.filter(x => x.severity === 'high').length;
  const medium = f.filter(x => x.severity === 'medium').length;
  const healthScore = Math.max(0, Math.min(100, 100 - critical * 15 - high * 6 - medium * 2));
  const threatLevel: SecurityPlatformStats['threatLevel'] = critical > 0 ? 'CRITICAL_RED' : high > 0 ? 'ELEVATED' : 'NORMAL';

  const dist = new Map<ThreatVector, number>();
  for (const e of events) dist.set(e.vector, (dist.get(e.vector) || 0) + 1);

  // 6 × 4h buckets over the last 24h from real security_events. "normal" traffic is not measured here.
  const timeline = Array.from({ length: 6 }, (_, i) => {
    const start = now - (6 - i) * 4 * 3_600_000, end = start + 4 * 3_600_000;
    const inB = events.filter(e => e.timestamp >= start && e.timestamp < end);
    return { time: new Date(start).toISOString().slice(11, 16), normal: 0, suspected: inB.filter(e => e.severity === 'SUSPECTED').length, malicious: inB.filter(e => e.severity === 'MALICIOUS_RED').length };
  });
  const activeMitigations = mitigations.filter(m => toMs(m.data.expiresAt) > now).length;
  const lastRunAt = lastRuns[0] ? toMs(lastRuns[0].data.at) : 0;

  return {
    healthScore, threatLevel,
    activeThreatCount: critical + high,
    blockedAttacks24h: activeMitigations, // honest meaning: active reversible rate-limit tightenings
    botTrafficPercent: 0,
    csoMode: 'SECURITY_COUNCIL',
    lastAssessmentAt: lastRunAt,
    recentPings: [],
    attackDistribution: [...dist.entries()].map(([vector, count]) => ({ vector, count })),
    timeline,
    dataSource: 'COUNCIL',
    councilLastRunAt: lastRunAt,
    unavailableMetrics: ['botTrafficPercent', 'geo', 'timeline.normal'],
    metricNotes: {
      blockedAttacks24h: 'Active temporary rate-limit tightenings (security_mitigations). Nothing is blocked outright.',
      healthScore: '100 minus weighted open council findings (critical 15, high 6, medium 2).',
    },
  } as SecurityPlatformStats;
}

export async function councilAssessment(store: CouncilStore): Promise<CsoAssessment | null> {
  const rows = await store.query('security_briefs', { orderBy: { field: 'generatedAt', dir: 'desc' }, limit: 3 });
  const b = rows.map(r => r.data as SecurityBrief & { status?: string }).find(x => x.status === 'ready' || (x.summary && x.status !== 'generating'));
  if (!b) return null;
  const critical = Object.values(b.perAgent || {}).reduce((n, a: any) => n + (Number(a?.critical) || 0), 0);
  const high = Object.values(b.perAgent || {}).reduce((n, a: any) => n + (Number(a?.high) || 0), 0);
  return {
    id: `brief-${b.date}`, timestamp: toMs(b.generatedAt), csoAgentName: 'Security & IT Council',
    threatLevel: critical ? 'CRITICAL_RED' : high ? 'ELEVATED' : 'NORMAL',
    executiveSummary: b.summary,
    riskScore: Math.min(100, critical * 15 + high * 6),
    indicatorsOfCompromise: b.topRisks || [],
    recommendedActions: b.recommendedActions || [],
    activeContainments: [`${b.activeMitigations || 0} temporary rate-limit tightening(s) active`],
    engineUsed: 'SECURITY_COUNCIL',
  };
}
