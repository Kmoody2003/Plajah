/**
 * Pure (no Firebase) helpers for the social safety layer. Kept separate from
 * socialSafetyService.ts so they can be unit-tested without a Firebase app.
 *
 * Semantics of the "hidden" set (see useSocialSafety):
 *   hidden = blocked ∪ blockedBy ∪ muted
 * It is the set of uids whose CONTENT should not be surfaced to the viewer in
 * feeds, search, suggestions, comments, mentions and DM lists. A mute is softer
 * than a block (the muted person can still follow/see you), but for the viewer's
 * own surfaces it hides identically. Use `blocked`/`blockedBy` (not `hidden`)
 * for hard interaction gates (follow, DM, say-hi); a mute never gates those.
 */

export type HiddenLookup = { has(uid: string): boolean } | readonly string[];

const toHas = (hidden: HiddenLookup): ((uid: string) => boolean) =>
  Array.isArray(hidden)
    ? (u: string) => (hidden as readonly string[]).includes(u)
    : (u: string) => (hidden as { has(uid: string): boolean }).has(u);

/** Drop every item whose author/owner uid is in `hidden`. Items with no uid are kept. */
export function filterHidden<T>(items: readonly T[], getUid: (item: T) => string | null | undefined, hidden: HiddenLookup): T[] {
  const has = toHas(hidden);
  return items.filter(it => {
    const uid = getUid(it);
    return !uid || !has(uid);
  });
}

export function computeHidden(blocked: Iterable<string>, blockedBy: Iterable<string>, muted: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const s of [blocked, blockedBy, muted]) for (const u of s) out.add(u);
  return out;
}

/** Doc id of `blocks/{blocker_blocked}`. */
export const blockDocId = (blockerUid: string, blockedUid: string) => `${blockerUid}_${blockedUid}`;
/** Doc id of `follow_requests/{requester_target}` (same shape as follows). */
export const followRequestId = (requesterUid: string, targetUid: string) => `${requesterUid}_${targetUid}`;

/** Firestore doc ids cannot contain '/'; report ids embed arbitrary content refs. */
export const sanitizeDocIdPart = (s: string) => s.replace(/[\/\s]/g, '-').slice(0, 120);

export const REPORT_REASONS = [
  { id: 'spam', label: 'Spam' },
  { id: 'harassment', label: 'Harassment or bullying' },
  { id: 'hate', label: 'Hate speech' },
  { id: 'sexual_minor_safety', label: 'Sexual content / minor safety' },
  { id: 'violence_self_harm', label: 'Violence or self-harm' },
  { id: 'scam_impersonation', label: 'Scam or impersonation' },
  { id: 'misinformation', label: 'Misinformation' },
  { id: 'other', label: 'Something else' },
] as const;
export type SocialReportReason = typeof REPORT_REASONS[number]['id'];

export type ReportTargetType = 'post' | 'comment' | 'profile' | 'live';

/** Deterministic doc id so one reporter can only report one target once (rules deny the overwrite). */
export const reportDocId = (reporterUid: string, targetType: string, targetId: string) =>
  sanitizeDocIdPart(`${reporterUid}_${targetType}_${targetId}`);

/** Can viewer see a followers-only post? Soft client gate — see PRIVATE ACCOUNT limitation in socialSafetyService. */
export function canViewerSeePost(
  post: { authorId?: string; authorIsPrivate?: boolean },
  viewerUid: string | null | undefined,
  viewerFollows: (authorUid: string) => boolean,
): boolean {
  if (!post.authorIsPrivate) return true;
  if (!post.authorId) return true;
  if (viewerUid && viewerUid === post.authorId) return true;
  return !!viewerUid && viewerFollows(post.authorId);
}

// ─── Follow-request cooldown (declined requests) ─────────────────────────────

/** A decline blocks a new request for this long (mirrored by the follow_requests delete rule). */
export const DECLINE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export const declineCooldownRemaining = (resolvedAtMs: number | null | undefined, now: number): number =>
  resolvedAtMs ? Math.max(0, resolvedAtMs + DECLINE_COOLDOWN_MS - now) : DECLINE_COOLDOWN_MS;

export type RequestFollowPlan =
  | { action: 'create' }                                  // no request yet
  | { action: 'none'; shown: 'pending' | 'approved' }    // already there; do nothing
  | { action: 'recreate'; reason: 'declined-cooldown-over' | 'stale-approved' };

/**
 * What requestFollow should do given the existing request doc. A declined request inside its
 * cooldown is SHOWN to the requester as 'pending' ("Requested") and never re-written, so the
 * target is not re-notified and the decline is not revealed.
 */
export function planRequestFollow(
  existing: { status?: string; resolvedAtMs?: number | null } | null,
  followEdgeExists: boolean,
  now: number,
): RequestFollowPlan {
  if (!existing) return { action: 'create' };
  if (existing.status === 'pending') return { action: 'none', shown: 'pending' };
  if (existing.status === 'approved') {
    return followEdgeExists ? { action: 'none', shown: 'approved' } : { action: 'recreate', reason: 'stale-approved' };
  }
  if (existing.status === 'declined') {
    return declineCooldownRemaining(existing.resolvedAtMs, now) > 0
      ? { action: 'none', shown: 'pending' }
      : { action: 'recreate', reason: 'declined-cooldown-over' };
  }
  return { action: 'create' };
}

// ─── Follow-request rate counter (mirrors rateLimits rules) ──────────────────

export const FR_MAX_PER_WINDOW = 30;
export const FR_WINDOW_MS = 60 * 60 * 1000;
export const FR_MIN_GAP_MS = 2000;

export interface FrCounterDoc { frCount?: number; frWindowStartMs?: number; lastFollowRequestAtMs?: number }
export type FrPlan =
  | { ok: true; resetWindow: boolean; nextCount: number }
  | { ok: false; retryAfterMs: number };

/** Mirror of firestore.rules rlFrAdvance, evaluated on the client so we fail politely before the write. */
export function planFollowRequestCounter(doc: FrCounterDoc | null | undefined, now: number): FrPlan {
  const last = doc?.lastFollowRequestAtMs ?? 0;
  if (last && now - last < FR_MIN_GAP_MS) return { ok: false, retryAfterMs: FR_MIN_GAP_MS - (now - last) };
  const start = doc?.frWindowStartMs ?? 0;
  if (!start || start + FR_WINDOW_MS <= now) return { ok: true, resetWindow: true, nextCount: 1 };
  const count = doc?.frCount ?? 0;
  if (count + 1 > FR_MAX_PER_WINDOW) return { ok: false, retryAfterMs: start + FR_WINDOW_MS - now };
  return { ok: true, resetWindow: false, nextCount: count + 1 };
}

// ─── Counter reconcile guard ─────────────────────────────────────────────────

export const RECONCILE_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** True when no reconcile ran in the last day (or the stored stamp is missing/garbage/in the future). */
export function shouldReconcile(lastMs: number | null | undefined, now: number, minIntervalMs: number = RECONCILE_MIN_INTERVAL_MS): boolean {
  if (typeof lastMs !== 'number' || !Number.isFinite(lastMs) || lastMs > now) return true;
  return now - lastMs >= minIntervalMs;
}
