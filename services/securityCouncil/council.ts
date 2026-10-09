/**
 * Council orchestration: signals → agents → dedupe/upsert findings → (flag-gated) reversible mitigations
 * → enforcement-queue recommendations → capped LLM triage → once-a-day brief.
 *
 * GUARDRAILS (enforced here, not just documented):
 *  - Nothing in this module writes firestore.rules, env/config, code, or any collection owned by another
 *    system (enforcement_actions, appeals, moderation/*, csam_cases, users). It only writes security_*.
 *  - The only automatic action is `tighten_rate_limit` for a salted IP hash: requires
 *    SECURITY_COUNCIL_AUTO_MITIGATE=true, expires (≤ 1h), is recorded with an undo, is never a block, and
 *    never targets a uid. At most MAX_MITIGATIONS_PER_RUN per run.
 *  - Account-level concerns become `security_council_recommendations` docs for humans.
 *  - LLM output is advisory and cannot lower a severity floor.
 */
import { createHash } from 'node:crypto';
import {
  COUNCIL_AGENTS, SEVERITY_RANK, clean,
  type CouncilAgentId, type CouncilEnv, type CouncilStore, type FindingDraft, type FindingSeverity,
  type SecurityBrief, type SecurityFinding, type SecurityMitigation, type FindingStatus,
} from './types';
import { collectSignals, nextBaseline, type SignalContext } from './signals';
import { AGENT_CHARTERS, AGENT_RUNNERS, baselineMetrics } from './agents';
import { synthesizeBrief, triageFinding, redact } from './llm';
import { toMs } from './store';

export const MAX_MITIGATIONS_PER_RUN = 5;
const MAX_MITIGATION_TTL = 3_600_000;
const RUN_SLOT_MS = 15 * 60_000;

export const findingIdFor = (dedupeKey: string) => 'f_' + createHash('sha256').update(dedupeKey).digest('hex').slice(0, 24);
export const dateKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const maxSev = (a: FindingSeverity, b: FindingSeverity) => (SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b);

export interface RunOptions {
  now?: number;
  force?: boolean;
  /** 'auto' = once a day after briefHourUtc; 'force' = now; 'skip' = never. */
  brief?: 'auto' | 'force' | 'skip';
  fetchImpl?: typeof fetch;
  skipProbes?: boolean;
  /** Injected for tests; defaults to the real Claude calls. */
  triage?: typeof triageFinding;
  synthesize?: typeof synthesizeBrief;
}

export interface RunSummary {
  runId: string;
  skipped?: string;
  durationMs: number;
  perAgent: Record<string, { drafts: number; created: number; updated: number; error?: string }>;
  triaged: number;
  mitigationsCreated: number;
  mitigationsExpired: number;
  recommendations: number;
  brief?: { id: string; engine: string } | null;
  dataGaps: string[];
}

interface UpsertResult { finding: SecurityFinding; isNew: boolean; escalated: boolean; regressed: boolean }

export async function upsertFinding(store: CouncilStore, d: FindingDraft, runId: string, now: number): Promise<UpsertResult | null> {
  const id = findingIdFor(d.dedupeKey);
  const evidence = clean(d.evidence, 600) as Record<string, unknown>;
  const fresh: SecurityFinding = {
    id, agent: d.agent, severity: d.severity, title: redact(d.title).slice(0, 200), evidence,
    proposedFix: d.proposedFix.slice(0, 2000), status: 'open', firstSeen: now, lastSeen: now,
    dedupeKey: d.dedupeKey.slice(0, 300), occurrences: 1, lastRunId: runId,
  };
  const created = await store.createOnce('security_findings', id, fresh as unknown as Record<string, unknown>);
  if (created === 'created') return { finding: fresh, isNew: true, escalated: false, regressed: false };
  if (created === 'error') return null;
  const prev = (await store.get('security_findings', id)) as SecurityFinding | null;
  if (!prev) return null;
  const severity = maxSev(prev.severity || 'info', d.severity); // never silently de-escalate an open finding
  const escalated = SEVERITY_RANK[severity] > SEVERITY_RANK[prev.severity || 'info'];
  const regressed = prev.status === 'fixed';
  const patch: Partial<SecurityFinding> = {
    severity, title: fresh.title, evidence, proposedFix: fresh.proposedFix,
    lastSeen: now, occurrences: (Number(prev.occurrences) || 1) + (prev.lastRunId === runId ? 0 : 1), lastRunId: runId,
  };
  if (regressed) {
    // A "fixed" problem came back: reopen it so it is seen again.
    patch.status = 'open';
    patch.regressedAt = now;
    patch.statusHistory = [...(prev.statusHistory || []), { status: 'open' as FindingStatus, by: 'council', at: now, note: 'regressed: signal returned after fix' }].slice(-20);
  }
  // false_positive stays suppressed (lastSeen still advances so humans can see it recurring).
  await store.patch('security_findings', id, patch as Record<string, unknown>);
  return { finding: { ...prev, ...patch } as SecurityFinding, isNew: false, escalated, regressed };
}

export async function createMitigation(store: CouncilStore, env: CouncilEnv, d: FindingDraft, findingId: string, now: number): Promise<SecurityMitigation | null> {
  const m = d.mitigation;
  if (!m || !env.autoMitigate) return null;
  if (m.kind !== 'tighten_rate_limit' || !/^[0-9a-f]{12,64}$/.test(m.ipHash)) return null;
  if (env.mitigationAllowlist.includes(m.ipHash)) return null;
  const slot = Math.floor(now / MAX_MITIGATION_TTL);
  const id = `m_${m.ipHash.slice(0, 20)}_${slot}`;
  const doc: SecurityMitigation = {
    id, kind: 'tighten_rate_limit', target: { ipHash: m.ipHash },
    limitPerMin: Math.max(10, Math.min(120, Math.round(m.limitPerMin))),
    reason: m.reason.slice(0, 300), findingId, createdBy: `council:${d.agent}`, createdAt: now,
    expiresAt: now + Math.min(MAX_MITIGATION_TTL, Math.max(60_000, m.ttlMs)), status: 'active',
    undo: { method: 'POST', path: `/api/security/council/mitigations/${id}/undo` },
  };
  const r = await store.createOnce('security_mitigations', id, doc as unknown as Record<string, unknown>);
  return r === 'created' ? doc : null;
}

export async function undoMitigation(store: CouncilStore, id: string, by: string, now = Date.now()): Promise<SecurityMitigation | null> {
  const m = (await store.get('security_mitigations', id)) as SecurityMitigation | null;
  if (!m) return null;
  if (m.status !== 'active') return m;
  const ok = await store.patch('security_mitigations', id, { status: 'undone', undoneBy: by.slice(0, 128), undoneAt: now });
  return ok ? { ...m, status: 'undone', undoneBy: by, undoneAt: now } : null;
}

async function expireMitigations(store: CouncilStore, ctx: SignalContext): Promise<number> {
  let n = 0;
  for (const d of ctx.activeMitigations) {
    if (toMs(d.data.expiresAt) <= ctx.now && (await store.patch('security_mitigations', d.id, { status: 'expired' }))) n++;
  }
  return n;
}

export async function updateFindingStatus(store: CouncilStore, id: string, status: FindingStatus, by: string, note?: string, now = Date.now()): Promise<SecurityFinding | null> {
  const prev = (await store.get('security_findings', id)) as SecurityFinding | null;
  if (!prev) return null;
  const statusHistory = [...(prev.statusHistory || []), { status, by: by.slice(0, 128), at: now, ...(note ? { note: note.slice(0, 500) } : {}) }].slice(-20);
  const ok = await store.patch('security_findings', id, { status, statusHistory });
  return ok ? { ...prev, status, statusHistory } : null;
}

// ── Daily brief ──────────────────────────────────────────────────────────────
export async function buildBrief(store: CouncilStore, env: CouncilEnv, now: number, synth: typeof synthesizeBrief = synthesizeBrief, fetchImpl?: typeof fetch): Promise<SecurityBrief> {
  const rows = await store.query('security_findings', { where: [{ field: 'status', op: 'in', value: ['open', 'ack'] }], limit: 500 });
  const findings = rows.map(r => r.data as SecurityFinding).sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.lastSeen - a.lastSeen);
  const mitigations = await store.query('security_mitigations', { where: [{ field: 'status', op: '==', value: 'active' }], limit: 300 });
  const runs = await store.query('security_council_runs', { where: [{ field: 'at', op: '>=', value: now - 86_400_000 }], limit: 200, select: ['at'] });

  const perAgent: SecurityBrief['perAgent'] = {};
  for (const a of COUNCIL_AGENTS) {
    const mine = findings.filter(f => f.agent === a);
    perAgent[a] = {
      open: mine.length,
      critical: mine.filter(f => f.severity === 'critical').length,
      high: mine.filter(f => f.severity === 'high').length,
      headline: mine[0] ? mine[0].title : 'No open findings.',
    };
  }
  const date = dateKey(now);
  const deterministic: SecurityBrief = {
    id: date, date, generatedAt: now, engine: 'deterministic',
    summary: findings.length
      ? `${findings.length} open finding(s): ${findings.filter(f => f.severity === 'critical').length} critical, ${findings.filter(f => f.severity === 'high').length} high. ` +
        `${mitigations.length} temporary mitigation(s) active. Council ran ${runs.length} time(s) in the last 24h.`
      : `No open findings. Council ran ${runs.length} time(s) in the last 24h${runs.length < 48 ? ' — fewer than expected for a 15-minute schedule; check Cloud Scheduler' : ''}.`,
    topRisks: findings.slice(0, 6).map(f => `[${f.severity}] ${AGENT_CHARTERS[f.agent]?.name || f.agent}: ${f.title}`),
    recommendedActions: findings.slice(0, 6).map(f => f.proposedFix.split(/(?<=\.)\s/)[0].slice(0, 240)),
    perAgent, activeMitigations: mitigations.length, openFindings: findings.length, councilRunsLast24h: runs.length,
  };
  if (!env.anthropicApiKey || !findings.length) return deterministic;

  // Digest for the model: trusted metrics + titles; evidence is code-computed but still redacted.
  const digest = [
    `Date: ${date}. Council runs in last 24h: ${runs.length}. Active temporary mitigations: ${mitigations.length}.`,
    'Open findings (most severe first):',
    ...findings.slice(0, 40).map(f => `- [${f.severity}] ${f.agent} · ${redact(f.title)} · seen ${f.occurrences}x · status ${f.status}` +
      `${f.triage?.summary ? ` · triage: ${redact(f.triage.summary).slice(0, 200)}` : ''} · evidence ${redact(JSON.stringify(f.evidence)).slice(0, 400)}`),
  ].join('\n');
  const llm = await synth(env.anthropicApiKey, env.briefModel, digest, fetchImpl);
  if (!llm) return deterministic;
  return { ...deterministic, engine: llm.model, summary: llm.summary || deterministic.summary, topRisks: llm.topRisks.length ? llm.topRisks : deterministic.topRisks, recommendedActions: llm.recommendedActions.length ? llm.recommendedActions : deterministic.recommendedActions };
}

// ── The run ──────────────────────────────────────────────────────────────────
export async function runCouncil(store: CouncilStore, env: CouncilEnv, opts: RunOptions = {}): Promise<RunSummary> {
  const t0 = Date.now();
  const now = opts.now ?? Date.now();
  const runId = `r_${Math.floor(now / RUN_SLOT_MS) * RUN_SLOT_MS}`;
  const summary: RunSummary = { runId, durationMs: 0, perAgent: {}, triaged: 0, mitigationsCreated: 0, mitigationsExpired: 0, recommendations: 0, dataGaps: [] };

  // Single-flight per 15-minute slot: Cloud Scheduler retries / overlapping instances become no-ops.
  const claim = await store.createOnce('security_council_runs', runId, { at: now, status: 'running', expireAt: new Date(now + 30 * 86_400_000) });
  if (claim === 'exists' && !opts.force) { summary.skipped = 'already ran in this 15-minute slot'; summary.durationMs = Date.now() - t0; return summary; }
  if (claim === 'error') { summary.skipped = 'could not claim run slot (store unavailable?)'; summary.durationMs = Date.now() - t0; return summary; }

  const ctx = await collectSignals(store, env, { now, fetchImpl: opts.fetchImpl, skipProbes: opts.skipProbes });
  if (!ctx.telemetry.docs) summary.dataGaps.push('no security_telemetry in the last hour (edge middleware not mounted, idle, or flush failing)');
  if (!ctx.events.length) summary.dataGaps.push('no security_events in the last hour (services/securityEvents.ts not wired yet, or quiet)');
  if (ctx.eventsTruncated) summary.dataGaps.push('security_events window truncated at 2000 docs');
  if (!ctx.audit) summary.dataGaps.push('security_audit/latest missing (CI ingest not configured)');

  const triage = opts.triage || triageFinding;
  let triageBudget = env.anthropicApiKey ? env.maxTriagePerRun : 0;
  let mitigationBudget = MAX_MITIGATIONS_PER_RUN;

  for (const agent of COUNCIL_AGENTS) {
    const stats = { drafts: 0, created: 0, updated: 0 } as RunSummary['perAgent'][string];
    summary.perAgent[agent] = stats;
    let drafts: FindingDraft[] = [];
    try { drafts = AGENT_RUNNERS[agent as CouncilAgentId](ctx, env).slice(0, 40); }
    catch (e: any) { stats.error = String(e?.message || e).slice(0, 200); continue; }
    stats.drafts = drafts.length;
    for (const d of drafts) {
      const r = await upsertFinding(store, d, runId, now);
      if (!r) continue;
      if (r.isNew) stats.created++; else stats.updated++;
      const extra: Partial<SecurityFinding> = {};

      if (d.mitigation && mitigationBudget > 0 && !r.finding.mitigationId && r.finding.status !== 'false_positive') {
        const m = await createMitigation(store, env, d, r.finding.id, now);
        if (m) { mitigationBudget--; summary.mitigationsCreated++; extra.mitigationId = m.id; }
      }
      if (d.recommendation && !r.finding.recommendationId) {
        const recId = `rec_${r.finding.id.slice(2)}`;
        const created = await store.createOnce('security_council_recommendations', recId, {
          id: recId, findingId: r.finding.id, agent: d.agent, ...d.recommendation, status: 'pending_human_review', createdAt: now,
          note: 'Recommendation only. The Security Council never suspends, bans or locks accounts; a human decides under Fair Process.',
        });
        if (created === 'created') { summary.recommendations++; extra.recommendationId = recId; }
      }
      const worthTriage = (r.isNew || r.escalated || r.regressed) && SEVERITY_RANK[d.severity] >= SEVERITY_RANK.medium && r.finding.status !== 'false_positive';
      if (worthTriage && triageBudget > 0 && env.anthropicApiKey) {
        triageBudget--;
        const t = await triage(env.anthropicApiKey, env.triageModel, d, opts.fetchImpl);
        if (t) {
          summary.triaged++;
          extra.triage = t;
          // Triage may RAISE severity; it may never go below the draft's floor (child safety, secrets).
          const floor = d.severityFloor || 'info';
          if (SEVERITY_RANK[t.severitySuggestion] > SEVERITY_RANK[r.finding.severity]) extra.severity = t.severitySuggestion;
          else if (SEVERITY_RANK[t.severitySuggestion] < SEVERITY_RANK[r.finding.severity] && r.isNew) extra.severity = maxSev(t.severitySuggestion, floor);
        }
      }
      if (Object.keys(extra).length) await store.patch('security_findings', r.finding.id, extra as Record<string, unknown>);
    }
  }

  summary.mitigationsExpired = await expireMitigations(store, ctx);
  await store.patch('security_council_state', 'baseline', nextBaseline(ctx.baseline, baselineMetrics(ctx), now) as unknown as Record<string, unknown>);

  // Daily brief: once per UTC day, after briefHourUtc (or forced). createOnce on the date is the lock.
  const briefMode = opts.brief || 'auto';
  const hour = new Date(now).getUTCHours();
  if (briefMode === 'force' || (briefMode === 'auto' && hour >= env.briefHourUtc)) {
    const id = dateKey(now);
    const lock = briefMode === 'force' ? 'created' : await store.createOnce('security_briefs', id, { id, date: id, status: 'generating', generatedAt: now });
    if (lock === 'created') {
      try {
        const brief = await buildBrief(store, env, now, opts.synthesize || synthesizeBrief, opts.fetchImpl);
        await store.patch('security_briefs', id, { ...brief, status: 'ready' } as unknown as Record<string, unknown>);
        summary.brief = { id, engine: brief.engine };
      } catch (e: any) {
        await store.patch('security_briefs', id, { status: 'failed', error: String(e?.message || e).slice(0, 200) });
        summary.brief = null;
      }
    }
  }

  summary.durationMs = Date.now() - t0;
  await store.patch('security_council_runs', runId, {
    at: now, status: 'done', durationMs: summary.durationMs, perAgent: summary.perAgent, triaged: summary.triaged,
    mitigationsCreated: summary.mitigationsCreated, mitigationsExpired: summary.mitigationsExpired, recommendations: summary.recommendations,
    dataGaps: summary.dataGaps, brief: summary.brief ?? null,
    signals: { events: ctx.events.length, errorReports: ctx.errorReportsCount, telemetryDocs: ctx.telemetry.docs, instances: ctx.telemetry.instances, probes: ctx.probes.map(p => ({ path: p.path, status: p.status, ms: p.ms })) },
  });
  return summary;
}
