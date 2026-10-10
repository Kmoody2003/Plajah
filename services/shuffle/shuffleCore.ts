/**
 * Shuffle (Omegle-style random 1:1 video on Rooms) — PURE rules, shared by server + tests.
 *
 * Safety model (owner's Fair Process + child-safety policy):
 *   • 18+ only. Minor-flagged accounts (isChild / CHILD / STUDENT / school-provisioned) can never
 *     enter; the first date of birth given is locked server-side (shuffle_profiles is server-only),
 *     so it can't be "corrected" upward later. Real ID / age-estimation verification is an owner
 *     decision still open — this is a self-attested gate plus the account flags we already have.
 *   • Registered (non-anonymous) accounts in good-enough standing; a restriction pauses Shuffle with
 *     a stated reason + appeal path — never a silent lockout.
 *   • Never re-matched with someone you reported or blocked; a short cooldown before meeting the
 *     same person again; a rate cap on skips so it can't be used to scan people.
 */

export const MIN_AGE = 18;
export const MAX_INTERESTS = 5;
export const QUEUE_STALE_MS = 20_000;          // a waiter who stopped polling is gone
export const REMATCH_COOLDOWN_MS = 6 * 3600_000;
export const RATE_WINDOW_MS = 10 * 60_000;
export const RATE_MAX_MATCHES = 40;            // matches per 10 min (skipping fast is fine; scanning isn't)

export type ShuffleMode = 'video' | 'text';

export interface QueueEntry {
  uid: string;
  name: string;
  photo?: string;
  interests: string[];
  interestsOnly: boolean;
  mode: ShuffleMode;
  status: 'waiting' | 'claiming' | 'matched';
  createdAt: number;
  heartbeatAt: number;
  match?: MatchInfo | null;
}

export interface MatchInfo {
  matchId: string;
  sessionId: string;
  peerUid: string;
  peerName: string;
  peerPhoto?: string;
  shared: string[];
  /** Exactly one side is the initiator (deterministic: lower uid). */
  initiator: boolean;
  createdAt: number;
}

export interface Eligibility { ok: boolean; code: string; message: string; needsDob?: boolean }

/** Age in whole years from YYYY-MM-DD; null when unparsable / in the future / absurd. */
export function ageFromDob(dob: string, now = Date.now()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dob || '').trim());
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const birth = new Date(Date.UTC(y, mo - 1, d));
  if (birth.getUTCMonth() !== mo - 1) return null;          // e.g. 2001-02-31
  const n = new Date(now);
  let age = n.getUTCFullYear() - y;
  if (n.getUTCMonth() < mo - 1 || (n.getUTCMonth() === mo - 1 && n.getUTCDate() < d)) age--;
  if (age < 0 || age > 120) return null;
  return age;
}

export function isMinorProfile(p: Record<string, any> | null | undefined): boolean {
  if (!p) return false;
  return p.isChild === true || p.accountType === 'CHILD' || p.accountType === 'STUDENT' || p.childState === 'SCHOOL_PROVISIONED';
}

export function eligibility(input: {
  anonymous: boolean;
  profile: Record<string, any> | null;     // users/{uid}
  attestedDob: string | null;              // shuffle_profiles/{uid}.dob (locked)
  canUse: boolean;                         // standing gate (Fair Process)
  restrictionMessage?: string;
  now?: number;
}): Eligibility {
  if (input.anonymous) return { ok: false, code: 'SIGN_IN', message: 'Shuffle needs a registered Plajah account.' };
  if (isMinorProfile(input.profile)) return { ok: false, code: 'UNDER_18', message: 'Shuffle is for adults (18+) only.' };
  if (!input.attestedDob) return { ok: false, code: 'NEEDS_DOB', message: 'Confirm your date of birth to use Shuffle.', needsDob: true };
  const age = ageFromDob(input.attestedDob, input.now);
  if (age === null || age < MIN_AGE) return { ok: false, code: 'UNDER_18', message: 'Shuffle is for adults (18+) only.' };
  if (!input.canUse) return { ok: false, code: 'STANDING', message: input.restrictionMessage || "Shuffle is paused on your account right now. You can still use the rest of Plajah, and you can fix or appeal from the Appeal Center." };
  return { ok: true, code: 'OK', message: '' };
}

/** Lowercase, trimmed, de-duplicated, ≤5 tags of ≤24 safe chars. */
export function normalizeInterests(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const raw of list) {
    const t = String(raw ?? '').toLowerCase().replace(/[^a-z0-9 +#&-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= MAX_INTERESTS) break;
  }
  return out;
}

export const pairKey = (a: string, b: string) => (a < b ? `${a}__${b}` : `${b}__${a}`);
export const sharedInterests = (a: string[], b: string[]) => a.filter(x => b.includes(x));

export interface PairContext {
  /** true = these two must never meet (a report or a block either way). */
  blocked: (a: string, b: string) => boolean;
  /** last time the two met (ms), or 0. */
  lastMet: (a: string, b: string) => number;
  now: number;
}

/**
 * Candidates for `me`, best first. `onlyNewer` is set when a WAITER scans: it may only claim
 * waiters who joined after it, so two waiters can never claim each other at the same time.
 */
export function rankPartners(me: Pick<QueueEntry, 'uid' | 'interests' | 'interestsOnly' | 'mode' | 'createdAt'>, queue: QueueEntry[], ctx: PairContext, onlyNewer = false): QueueEntry[] {
  const scored: Array<{ e: QueueEntry; score: number }> = [];
  for (const e of queue) {
    if (e.uid === me.uid || e.status !== 'waiting') continue;
    if (ctx.now - e.heartbeatAt > QUEUE_STALE_MS) continue;
    if (e.mode !== me.mode) continue;
    if (onlyNewer && !(e.createdAt > me.createdAt || (e.createdAt === me.createdAt && e.uid > me.uid))) continue;
    if (ctx.blocked(me.uid, e.uid)) continue;
    const met = ctx.lastMet(me.uid, e.uid);
    if (met && ctx.now - met < REMATCH_COOLDOWN_MS) continue;
    const shared = sharedInterests(me.interests, e.interests).length;
    if ((me.interestsOnly || e.interestsOnly) && shared === 0) continue;
    // Shared interests first, then whoever has waited longest.
    scored.push({ e, score: shared * 1_000_000 + Math.min(999_999, ctx.now - e.createdAt) });
  }
  return scored.sort((a, b) => b.score - a.score).map(x => x.e);
}

/** Sliding-window cap on matches. Returns the pruned list and whether one more is allowed. */
export function rateCheck(times: number[], now: number): { ok: boolean; times: number[] } {
  const kept = (Array.isArray(times) ? times : []).filter(t => typeof t === 'number' && now - t < RATE_WINDOW_MS);
  return { ok: kept.length < RATE_MAX_MATCHES, times: kept };
}

export const REPORT_REASONS = ['nudity_sexual', 'minor', 'harassment_hate', 'violence_threat', 'spam_scam', 'other'] as const;
export type ShuffleReportReason = typeof REPORT_REASONS[number];
