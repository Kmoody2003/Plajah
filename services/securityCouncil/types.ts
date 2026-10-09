/**
 * Security & IT Council — shared types (server only).
 *
 * The council is six always-on agents. Each one does cheap, deterministic signal collection and only
 * calls an LLM when a signal crosses a threshold. Agents PROPOSE; they never change production config,
 * rules or code. See docs/SECURITY_IT_COUNCIL.md.
 */

export type CouncilAgentId = 'sentinel' | 'warden' | 'guardian' | 'medic' | 'auditor' | 'steward';
export const COUNCIL_AGENTS: CouncilAgentId[] = ['sentinel', 'warden', 'guardian', 'medic', 'auditor', 'steward'];

export type FindingSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export const SEVERITY_RANK: Record<FindingSeverity, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

export type FindingStatus = 'open' | 'ack' | 'fixed' | 'false_positive';
export const FINDING_STATUSES: FindingStatus[] = ['open', 'ack', 'fixed', 'false_positive'];

/** What an agent emits for one run. Deterministic — no LLM involved yet. */
export interface FindingDraft {
  agent: CouncilAgentId;
  severity: FindingSeverity;
  title: string;
  /** Stable identity: the same underlying problem must produce the same key every run. */
  dedupeKey: string;
  /** Metrics + metadata samples. Never raw media; never secrets. */
  evidence: Record<string, unknown>;
  /** A concrete proposal for a human. Code proposals are patch DESCRIPTIONS, never applied. */
  proposedFix: string;
  /** Severity must never be lowered below this by triage (child safety, leaked secrets). */
  severityFloor?: FindingSeverity;
  /** Optional reversible protection the agent wants (only applied when the env flag allows it). */
  mitigation?: MitigationRequest;
  /** Optional human-review recommendation for the enforcement queue (never an action). */
  recommendation?: EnforcementRecommendation;
  /** Untrusted free text (error messages, report reasons) the triage model may read, delimited. */
  untrustedSamples?: string[];
}

/** Persisted at security_findings/{id}. */
export interface SecurityFinding {
  id: string;
  agent: CouncilAgentId;
  severity: FindingSeverity;
  title: string;
  evidence: Record<string, unknown>;
  proposedFix: string;
  status: FindingStatus;
  firstSeen: number;
  lastSeen: number;
  dedupeKey: string;
  occurrences: number;
  lastRunId: string;
  /** Set when a 'fixed' finding shows up again. */
  regressedAt?: number;
  triage?: FindingTriage;
  mitigationId?: string;
  recommendationId?: string;
  statusHistory?: Array<{ status: FindingStatus; by: string; at: number; note?: string }>;
}

export interface FindingTriage {
  model: string;
  at: number;
  summary: string;
  likelyFalsePositive: boolean;
  severitySuggestion: FindingSeverity;
  nextStep: string;
}

export interface MitigationRequest {
  kind: 'tighten_rate_limit';
  /** Only salted IP hashes (see telemetry.hashIp). Never a uid — uid-level actions belong to Fair Process. */
  ipHash: string;
  limitPerMin: number;
  ttlMs: number;
  reason: string;
}

/** Persisted at security_mitigations/{id}. Always reversible, always expiring, never a lockout. */
export interface SecurityMitigation {
  id: string;
  kind: 'tighten_rate_limit';
  target: { ipHash: string };
  limitPerMin: number;
  reason: string;
  findingId: string;
  createdBy: string;
  createdAt: number;
  expiresAt: number;
  status: 'active' | 'undone' | 'expired';
  undoneBy?: string;
  undoneAt?: number;
  undo: { method: 'POST'; path: string };
}

/** Persisted at security_council_recommendations/{id}. A human queue item — the council never acts on accounts. */
export interface EnforcementRecommendation {
  subject: { uid?: string; ipHash?: string };
  reason: string;
  suggestedQueue: 'enforcement_review';
  evidence: Record<string, unknown>;
}

/** Persisted at security_briefs/{yyyy-mm-dd}. */
export interface SecurityBrief {
  id: string;
  date: string;
  generatedAt: number;
  engine: string;
  summary: string;
  topRisks: string[];
  recommendedActions: string[];
  perAgent: Record<string, { open: number; critical: number; high: number; headline: string }>;
  activeMitigations: number;
  openFindings: number;
  councilRunsLast24h: number;
}

// ── Store abstraction ─────────────────────────────────────────────────────────
// Implemented by a Firestore REST store (production) and an in-memory store (tests).

export type FilterOp = '==' | '>=' | '<=' | '>' | '<' | 'in';
export interface QueryFilter { field: string; op: FilterOp; value: unknown }
export interface QuerySpec {
  where?: QueryFilter[];
  orderBy?: { field: string; dir?: 'asc' | 'desc' };
  limit?: number;
  /** Field projection. Guardian ALWAYS uses this so report text / media refs are never read. */
  select?: string[];
}
export interface StoredDoc { id: string; data: Record<string, any> }

export interface CouncilStore {
  get(collection: string, id: string): Promise<Record<string, any> | null>;
  /** Merge-write (only the given top-level fields). Undefined values are stripped before writing. */
  patch(collection: string, id: string, data: Record<string, unknown>): Promise<boolean>;
  createOnce(collection: string, id: string, data: Record<string, unknown>): Promise<'created' | 'exists' | 'error'>;
  query(collection: string, spec: QuerySpec): Promise<StoredDoc[]>;
  /** COUNT aggregation (cheap: billed per 1000 index entries). Returns null when unsupported/failed. */
  count(collection: string, where: QueryFilter[]): Promise<number | null>;
  /** True when the store can actually reach the database (e.g. service account configured). */
  ready(): Promise<boolean>;
}

export interface CouncilEnv {
  anthropicApiKey?: string;
  /** SECURITY_COUNCIL_AUTO_MITIGATE=true enables the ONLY automatic action (temporary rate tightening). */
  autoMitigate: boolean;
  /** Comma list of IP hashes never mitigated (office, uptime checkers). */
  mitigationAllowlist: string[];
  probeBase?: string;
  probePaths: string[];
  maxTriagePerRun: number;
  briefHourUtc: number;
  triageModel: string;
  briefModel: string;
}

export function councilEnvFromProcess(env: NodeJS.ProcessEnv = process.env): CouncilEnv {
  const port = env.PORT || '3000';
  return {
    anthropicApiKey: env.ANTHROPIC_API_KEY || undefined,
    autoMitigate: env.SECURITY_COUNCIL_AUTO_MITIGATE === 'true',
    mitigationAllowlist: String(env.SECURITY_COUNCIL_MITIGATION_ALLOWLIST || '').split(',').map(s => s.trim()).filter(Boolean),
    probeBase: env.SECURITY_COUNCIL_PROBE_BASE || `http://127.0.0.1:${port}`,
    probePaths: String(env.SECURITY_COUNCIL_PROBE_PATHS || '/healthz').split(',').map(s => s.trim()).filter(p => p.startsWith('/')),
    maxTriagePerRun: Math.max(0, Math.min(20, Number(env.SECURITY_COUNCIL_MAX_TRIAGE) || 6)),
    briefHourUtc: Math.max(0, Math.min(23, Number(env.SECURITY_COUNCIL_BRIEF_HOUR_UTC ?? 13))),
    triageModel: env.SECURITY_COUNCIL_TRIAGE_MODEL || 'claude-haiku-5-5',
    briefModel: env.SECURITY_COUNCIL_BRIEF_MODEL || 'claude-opus-5-5',
  };
}

/** Recursively drop undefined (Firestore REST rejects/garbles it) and cap string sizes. */
export function clean<T>(value: T, maxString = 4000): T {
  const walk = (v: any, depth: number): any => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    if (typeof v === 'string') return v.length > maxString ? v.slice(0, maxString) + '…' : v;
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    if (typeof v === 'boolean') return v;
    if (v instanceof Date) return v; // → Firestore timestampValue (TTL policies need real timestamps)
    if (depth > 8) return String(v).slice(0, 200);
    if (Array.isArray(v)) return v.slice(0, 200).map(x => walk(x, depth + 1)).filter(x => x !== undefined);
    if (typeof v === 'object') {
      const out: Record<string, any> = {};
      for (const [k, x] of Object.entries(v)) {
        const w = walk(x, depth + 1);
        if (w !== undefined) out[k] = w;
      }
      return out;
    }
    return String(v);
  };
  return walk(value, 0);
}
