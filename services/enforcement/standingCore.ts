/**
 * Fair Process — account standing core (PURE: no Firebase, no I/O, no Date.now()).
 *
 * Owner policy (docs/FAIR_PROCESS_POLICY.md): nobody is ever locked out 100%. Every level keeps
 * sign-in, reading and private messaging; restrictions are graduated and specific to the harm, and
 * appealing is ALWAYS possible. This file is shared by the client (hooks/useAccountStanding.ts) and
 * the server (routes/enforcement.ts `requireCapability`), so both sides compute the same answer.
 *
 * Source of truth: `user_sanctions/{uid}` (admin/server write, subject read):
 *   actions.{actionId}   summary of each enforcement action (written by routes/enforcement.ts)
 *   suspendedUntil       LEGACY ReportsQueue suspension marker → treated as RESTRICTED_PUBLIC
 *   criminalReview       {active, since, caseId} written by services/safety/* → CRIMINAL_REVIEW
 */

export type StandingLevel = 'GOOD' | 'LIMITED_REACH' | 'RESTRICTED_PUBLIC' | 'RESTRICTED_MEDIA' | 'CRIMINAL_REVIEW';

export const LEVELS: StandingLevel[] = ['GOOD', 'LIMITED_REACH', 'RESTRICTED_PUBLIC', 'RESTRICTED_MEDIA', 'CRIMINAL_REVIEW'];
export const LEVEL_RANK: Record<StandingLevel, number> = { GOOD: 0, LIMITED_REACH: 1, RESTRICTED_PUBLIC: 2, RESTRICTED_MEDIA: 3, CRIMINAL_REVIEW: 4 };

/** Action lifecycle. ACTIVE / APPEALED / CORRECTION_PENDING are in force; the rest are not. */
export type ActionStatus = 'ACTIVE' | 'APPEALED' | 'CORRECTION_PENDING' | 'RESTORED' | 'OVERTURNED' | 'EXPIRED';
export const IN_FORCE: ReadonlySet<ActionStatus> = new Set<ActionStatus>(['ACTIVE', 'APPEALED', 'CORRECTION_PENDING']);

export interface ContentRef { kind: string; id: string; path?: string; snapshot?: string }

export interface SanctionActionSummary {
  id: string;
  level: StandingLevel;
  rule: string;            // short rule id, e.g. "harassment"
  ruleText: string;        // the plain-language rule the user is shown
  contentRef?: ContentRef | null;
  expiresAt: number | null; // ms epoch; null = until reviewed
  status: ActionStatus;
  createdAt: number;
  /** Confirmed CSAM: content is never restored; specifics may be withheld. */
  csam?: boolean;
}

export interface CriminalReview { active?: boolean; since?: number; caseId?: string }

export interface SanctionsDoc {
  actions?: Record<string, SanctionActionSummary> | null;
  suspendedUntil?: number | null;
  suspendedReason?: string | null;
  warnings?: number | null;
  criminalReview?: CriminalReview | null;
  reportBlocked?: boolean | null;
}

export interface DMCapability {
  allowed: boolean;          // ALWAYS true: private messaging is never fully removed
  maxPerHour: number | null; // null = no limit
  existingThreadsOnly: boolean;
  textOnly: boolean;
  noMinors: boolean;
}

export interface StandingReason {
  actionId: string;
  level: StandingLevel;
  rule: string;
  ruleText: string;
  contentRef: ContentRef | null;
  expiresAt: number | null;
  status: ActionStatus | 'UNDER_REVIEW';
  withheld?: boolean;
}

export interface Capabilities {
  level: StandingLevel;
  canSignIn: true;
  canRead: true;
  canPost: boolean;
  canComment: boolean;
  canGoLive: boolean;
  canUpload: boolean;
  canDM: DMCapability;
  canAppeal: true;
  reachMultiplier: number;
  reasons: StandingReason[];
  /** When every current restriction lifts (null = at least one lasts until reviewed). */
  expiresAt: number | null;
  /** The next moment standing changes (earliest expiry), or null. */
  nextChangeAt: number | null;
  /** Human-readable list of what is limited, for notices/banners. */
  restrictions: string[];
}

/** Hourly DM allowance while under serious criminal review. */
export const CRIMINAL_REVIEW_DM_PER_HOUR = 20;

interface LevelSpec {
  canPost: boolean; canComment: boolean; canGoLive: boolean; canUpload: boolean;
  dm: DMCapability; reach: number; restrictions: string[];
}

const DM_OPEN: DMCapability = { allowed: true, maxPerHour: null, existingThreadsOnly: false, textOnly: false, noMinors: false };

/** The capability matrix. Each level includes everything the level below it restricts. */
export const MATRIX: Record<StandingLevel, LevelSpec> = {
  GOOD: { canPost: true, canComment: true, canGoLive: true, canUpload: true, dm: DM_OPEN, reach: 1, restrictions: [] },
  LIMITED_REACH: {
    canPost: true, canComment: true, canGoLive: true, canUpload: true, dm: DM_OPEN, reach: 0.25,
    restrictions: ['Your posts are shown to fewer people (not recommended in feeds or Discover).'],
  },
  RESTRICTED_PUBLIC: {
    canPost: false, canComment: false, canGoLive: false, canUpload: true, dm: DM_OPEN, reach: 0.25,
    restrictions: [
      'Your posts are shown to fewer people.',
      'You can\'t publish public posts, comments or replies.',
      'You can\'t go live.',
    ],
  },
  RESTRICTED_MEDIA: {
    canPost: false, canComment: false, canGoLive: false, canUpload: false,
    dm: { allowed: true, maxPerHour: null, existingThreadsOnly: false, textOnly: true, noMinors: false }, reach: 0.25,
    restrictions: [
      'Your posts are shown to fewer people.',
      'You can\'t publish public posts, comments or replies.',
      'You can\'t go live or upload media.',
      'Private messages are text-only.',
    ],
  },
  CRIMINAL_REVIEW: {
    canPost: false, canComment: false, canGoLive: false, canUpload: false,
    dm: { allowed: true, maxPerHour: CRIMINAL_REVIEW_DM_PER_HOUR, existingThreadsOnly: true, textOnly: true, noMinors: true }, reach: 0,
    restrictions: [
      'Your existing posts are hidden from feeds and Discover while the review runs.',
      'You can\'t publish public posts, comments or replies.',
      'You can\'t go live or upload media.',
      `Private messages: text-only, up to ${CRIMINAL_REVIEW_DM_PER_HOUR} per hour, existing conversations only, and not with accounts belonging to minors.`,
    ],
  },
};

export function restrictionsFor(level: StandingLevel): string[] { return [...MATRIX[level].restrictions]; }

export function isLevel(x: unknown): x is StandingLevel { return typeof x === 'string' && (LEVELS as string[]).includes(x); }
export function maxLevel(a: StandingLevel, b: StandingLevel): StandingLevel { return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b; }

/** Is this action currently in force at `now`? */
export function isInForce(a: Pick<SanctionActionSummary, 'status' | 'expiresAt'>, now: number): boolean {
  if (!IN_FORCE.has(a.status)) return false;
  return a.expiresAt == null || a.expiresAt > now;
}

function num(v: unknown): number | null { return typeof v === 'number' && Number.isFinite(v) ? v : null; }

/** Normalise an untrusted Firestore map entry; returns null if unusable. */
export function normaliseAction(id: string, raw: any): SanctionActionSummary | null {
  if (!raw || typeof raw !== 'object' || !isLevel(raw.level)) return null;
  const status: ActionStatus = (['ACTIVE', 'APPEALED', 'CORRECTION_PENDING', 'RESTORED', 'OVERTURNED', 'EXPIRED'] as string[]).includes(raw.status) ? raw.status : 'ACTIVE';
  return {
    id: String(raw.id || id), level: raw.level, rule: String(raw.rule || 'unspecified'),
    ruleText: String(raw.ruleText || ''), contentRef: raw.contentRef && typeof raw.contentRef === 'object' ? raw.contentRef : null,
    expiresAt: num(raw.expiresAt), status, createdAt: num(raw.createdAt) ?? 0, csam: raw.csam === true,
  };
}

/** Every action summary on the doc (normalised), newest first. */
export function listActions(s: SanctionsDoc | null | undefined): SanctionActionSummary[] {
  const out: SanctionActionSummary[] = [];
  for (const [id, raw] of Object.entries(s?.actions || {})) { const a = normaliseAction(id, raw); if (a) out.push(a); }
  return out.sort((x, y) => y.createdAt - x.createdAt);
}

/** The actions in force at `now`, including the synthesized legacy suspension and criminal review. */
export function activeReasons(s: SanctionsDoc | null | undefined, now: number): StandingReason[] {
  const out: StandingReason[] = [];
  for (const a of listActions(s)) {
    if (!isInForce(a, now)) continue;
    out.push({
      actionId: a.id, level: a.level, rule: a.rule, ruleText: a.ruleText,
      contentRef: a.csam ? (a.contentRef ? { kind: a.contentRef.kind, id: a.contentRef.id } : null) : (a.contentRef ?? null),
      expiresAt: a.expiresAt, status: a.status, ...(a.csam ? { withheld: true } : {}),
    });
  }
  const legacy = num(s?.suspendedUntil);
  if (legacy != null && legacy > now) {
    out.push({
      actionId: 'legacy-suspension', level: 'RESTRICTED_PUBLIC', rule: String(s?.suspendedReason || 'community_guidelines'),
      ruleText: 'A moderator limited public posting after a report (recorded before Fair Process notices existed).',
      contentRef: null, expiresAt: legacy, status: 'ACTIVE',
    });
  }
  if (s?.criminalReview?.active === true) {
    out.push({
      actionId: 'criminal-review', // case id deliberately not exposed
      level: 'CRIMINAL_REVIEW', rule: 'legal_review',
      ruleText: 'Your account is part of a review that may involve a legal obligation. Some details may be withheld while it runs.',
      contentRef: null, expiresAt: null, status: 'UNDER_REVIEW', withheld: true,
    });
  }
  return out;
}

/**
 * The capability answer. Never removes sign-in, reading, DMs or appeal — that is the policy, encoded.
 */
export function capabilitiesFor(s: SanctionsDoc | null | undefined, now: number): Capabilities {
  const reasons = activeReasons(s, now);
  let level: StandingLevel = 'GOOD';
  for (const r of reasons) level = maxLevel(level, r.level);
  const spec = MATRIX[level];
  let expiresAt: number | null = null;
  let nextChangeAt: number | null = null;
  if (reasons.length) {
    const indefinite = reasons.some(r => r.expiresAt == null);
    const ends = reasons.map(r => r.expiresAt).filter((x): x is number => x != null);
    expiresAt = indefinite ? null : Math.max(...ends);
    nextChangeAt = ends.length ? Math.min(...ends) : null;
  }
  return {
    level, canSignIn: true, canRead: true,
    canPost: spec.canPost, canComment: spec.canComment, canGoLive: spec.canGoLive, canUpload: spec.canUpload,
    canDM: { ...spec.dm, allowed: true }, canAppeal: true,
    reachMultiplier: spec.reach, reasons, expiresAt, nextChangeAt, restrictions: [...spec.restrictions],
  };
}

export type CapabilityKey = 'canPost' | 'canComment' | 'canGoLive' | 'canUpload' | 'canDM';

/** Boolean view used by server middleware. canDM is always true (limits are per-message, see checkDM). */
export function allows(c: Capabilities, cap: CapabilityKey): boolean {
  if (cap === 'canDM') return c.canDM.allowed;
  return c[cap];
}

export const CAPABILITY_LABEL: Record<CapabilityKey, string> = {
  canPost: 'publish public posts', canComment: 'comment or reply', canGoLive: 'go live', canUpload: 'upload media', canDM: 'send private messages',
};

// ── DM checks (per message) ───────────────────────────────────────────────────

export interface DMAttempt {
  hasMedia: boolean;           // voice, image, video, tela, gif, media share
  isExistingThread: boolean;   // the room had messages from this user (or existed) before the restriction began
  recipientIsMinor: boolean;
  sentInLastHour: number;
}

export type DMCheck = { ok: true } | { ok: false; code: 'DM_TEXT_ONLY' | 'DM_EXISTING_ONLY' | 'DM_NO_MINORS' | 'DM_RATE'; message: string };

export function checkDM(c: Capabilities, a: DMAttempt): DMCheck {
  const d = c.canDM;
  // Child safety outranks access: checked first.
  if (d.noMinors && a.recipientIsMinor) return { ok: false, code: 'DM_NO_MINORS', message: 'While your account is under review you can\'t message accounts that belong to minors.' };
  if (d.existingThreadsOnly && !a.isExistingThread) return { ok: false, code: 'DM_EXISTING_ONLY', message: 'While your account is under review you can message people you already have conversations with, but not start new ones.' };
  if (d.textOnly && a.hasMedia) return { ok: false, code: 'DM_TEXT_ONLY', message: 'Right now your private messages are text-only. Your text will still send.' };
  if (d.maxPerHour != null && a.sentInLastHour >= d.maxPerHour) return { ok: false, code: 'DM_RATE', message: `You can send up to ${d.maxPerHour} messages an hour right now. Try again a little later.` };
  return { ok: true };
}

// ── Appeals / review rules ────────────────────────────────────────────────────

export type AppealOutcome = 'uphold' | 'modify' | 'overturn';
export type AppealStatus = 'PENDING' | 'UPHELD' | 'MODIFIED' | 'OVERTURNED';

/** SLA targets (hours) for the first human decision. */
export const SLA_HOURS = { correction: 24, appeal: { GOOD: 72, LIMITED_REACH: 72, RESTRICTED_PUBLIC: 48, RESTRICTED_MEDIA: 48, CRIMINAL_REVIEW: 168 } as Record<StandingLevel, number> };

export function appealSlaDueAt(level: StandingLevel, createdAt: number): number { return createdAt + SLA_HOURS.appeal[level] * 3_600_000; }
export function correctionSlaDueAt(createdAt: number): number { return createdAt + SLA_HOURS.correction * 3_600_000; }

/** Anything harsher than LIMITED_REACH must be decided on appeal by someone other than who imposed it. */
export function needsSecondReviewer(level: StandingLevel): boolean { return LEVEL_RANK[level] > LEVEL_RANK.LIMITED_REACH; }

export function canDecide(level: StandingLevel, actionCreatedBy: string, reviewerUid: string): { ok: true } | { ok: false; error: string } {
  if (needsSecondReviewer(level) && actionCreatedBy === reviewerUid) {
    return { ok: false, error: 'A different reviewer must decide this appeal (the action is above LIMITED_REACH and you imposed it).' };
  }
  return { ok: true };
}

/** The action-summary patch an appeal outcome produces (null = no change to the action). */
export function applyOutcome(
  a: Pick<SanctionActionSummary, 'level' | 'expiresAt' | 'csam'>,
  outcome: AppealOutcome,
  mod?: { level?: StandingLevel; expiresAt?: number | null },
): { status: ActionStatus; level: StandingLevel; expiresAt: number | null; contentRestorable: boolean } {
  if (outcome === 'overturn') return { status: 'OVERTURNED', level: a.level, expiresAt: a.expiresAt, contentRestorable: !a.csam };
  if (outcome === 'modify') {
    const level = mod?.level && isLevel(mod.level) ? mod.level : a.level;
    const expiresAt = mod && 'expiresAt' in mod ? (mod.expiresAt ?? null) : a.expiresAt;
    return { status: level === 'GOOD' ? 'RESTORED' : 'ACTIVE', level, expiresAt, contentRestorable: !a.csam };
  }
  return { status: 'ACTIVE', level: a.level, expiresAt: a.expiresAt, contentRestorable: false };
}

export const APPEAL_STATUS_FOR: Record<AppealOutcome, AppealStatus> = { uphold: 'UPHELD', modify: 'MODIFIED', overturn: 'OVERTURNED' };

// ── Input validation (server) ─────────────────────────────────────────────────

/** Reasons that have no enforcement_actions doc but can still be appealed. */
export const SYNTHETIC_ACTION_IDS: ReadonlySet<string> = new Set(['legacy-suspension', 'criminal-review']);

export const STATEMENT_MAX = 4000;
export const EVIDENCE_MAX = 10;

export function validateAppealInput(body: any): { ok: true; actionId: string; statement: string; evidence: string[]; correctionTaken: string | null } | { ok: false; error: string } {
  const actionId = typeof body?.actionId === 'string' ? body.actionId.trim() : '';
  if (!/^[A-Za-z0-9_-]{4,80}$/.test(actionId)) return { ok: false, error: 'actionId required' };
  const statement = typeof body?.statement === 'string' ? body.statement.trim() : '';
  if (statement.length < 1) return { ok: false, error: 'Please tell us your side in a sentence or two.' };
  if (statement.length > STATEMENT_MAX) return { ok: false, error: `Statement is limited to ${STATEMENT_MAX} characters.` };
  const evidence = (Array.isArray(body?.evidence) ? body.evidence : [])
    .filter((u: unknown): u is string => typeof u === 'string' && /^https?:\/\//i.test(u) && u.length <= 1000)
    .slice(0, EVIDENCE_MAX);
  const ct = typeof body?.correctionTaken === 'string' ? body.correctionTaken.trim().slice(0, 1000) : '';
  return { ok: true, actionId, statement, evidence, correctionTaken: ct || null };
}

/** Human "for how long" text. */
export function durationLabel(expiresAt: number | null, now: number): string {
  if (expiresAt == null) return 'until a reviewer decides';
  const ms = expiresAt - now;
  if (ms <= 0) return 'ending now';
  const h = Math.ceil(ms / 3_600_000);
  if (h < 48) return `for about ${h} more hour${h === 1 ? '' : 's'}`;
  const d = Math.ceil(ms / 86_400_000);
  return `for ${d} more day${d === 1 ? '' : 's'}`;
}

/** Plain-language rule text per report reason (shown to the user verbatim). */
export const RULE_TEXT: Record<string, string> = {
  spam: 'No spam: repeated, misleading or unwanted bulk posts, links or messages.',
  harassment: 'No harassment or bullying: targeting a person with insults, threats or unwanted contact.',
  hate: 'No hate speech: attacking people for who they are (race, ethnicity, religion, gender, sexuality, disability, and similar).',
  sexual_minor_safety: 'No sexual content involving minors, and no sexualising or endangering children in any way.',
  violence_self_harm: 'No threats or promotion of violence, and no encouraging self-harm.',
  scam_impersonation: 'No scams, fraud or pretending to be someone you are not.',
  misinformation: 'No harmful misinformation presented as fact.',
  other: 'Plajah Community Guidelines.',
};
export const ruleTextFor = (rule: string) => RULE_TEXT[rule] ?? RULE_TEXT.other;

export const LEVEL_TITLE: Record<StandingLevel, string> = {
  GOOD: 'Good standing',
  LIMITED_REACH: 'Reach limited',
  RESTRICTED_PUBLIC: 'Public posting paused',
  RESTRICTED_MEDIA: 'Posting and uploads paused',
  CRIMINAL_REVIEW: 'Account under review',
};
