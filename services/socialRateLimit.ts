/**
 * Client-side anti-abuse throttles (pure + a thin localStorage recorder).
 *
 * This is a courtesy/first line of defence, NOT a security boundary: a hostile
 * client can skip it. Rules-level enforcement is deliberately not shipped (see
 * socialSafetyService header) because it would break existing writers.
 *
 * Which table applies is decided by the account TRUST TIER (services/trust/trustCore.ts), not a
 * hard-coded age: a NEW-tier account gets NEW_ACCOUNT_LIMITS, BASIC+ gets ESTABLISHED_LIMITS, and
 * the follow / cold-DM ceilings scale with the tier. With no extra signals registered (tests,
 * server) the tier degrades to the old age-only rule (NEW until NEW_ACCOUNT_AGE_MS = 7 days).
 * The client registers live signals (email verified, OAuth provider…) via
 * registerTrustSignalProvider (services/trust/trustClient.ts), so a verified human leaves NEW
 * after 2 days instead of 7.
 */

import { computeTrust, BASIC_MIN_AGE_UNVERIFIED_MS, type TrustSignals, type TrustTier } from './trust/trustCore';

/** 'dm_cold' = starting a NEW 1:1 conversation with someone who doesn't follow you. */
export type RateAction = 'follow' | 'hello' | 'post' | 'comment' | 'report' | 'dm_cold';

export interface RateRule {
  /** Max actions inside `windowMs`. */
  max: number;
  windowMs: number;
  /** Minimum gap between two consecutive actions. */
  cooldownMs: number;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const NEW_ACCOUNT_AGE_MS = BASIC_MIN_AGE_UNVERIFIED_MS; // 7 days (age-only fallback)

export const ESTABLISHED_LIMITS: Record<RateAction, RateRule> = {
  follow:  { max: 60, windowMs: HOUR, cooldownMs: 500 },
  hello:   { max: 30, windowMs: DAY,  cooldownMs: 5_000 },
  post:    { max: 6,  windowMs: MIN,  cooldownMs: 3_000 },
  comment: { max: 20, windowMs: MIN,  cooldownMs: 1_500 },
  report:  { max: 20, windowMs: HOUR, cooldownMs: 1_000 },
  dm_cold: { max: 20, windowMs: DAY,  cooldownMs: 2_000 },
};

export const NEW_ACCOUNT_LIMITS: Record<RateAction, RateRule> = {
  follow:  { max: 20, windowMs: HOUR, cooldownMs: 2_000 },
  hello:   { max: 10, windowMs: DAY,  cooldownMs: 15_000 },
  post:    { max: 2,  windowMs: MIN,  cooldownMs: 15_000 },
  comment: { max: 8,  windowMs: MIN,  cooldownMs: 5_000 },
  report:  { max: 10, windowMs: HOUR, cooldownMs: 2_000 },
  dm_cold: { max: 5,  windowMs: DAY,  cooldownMs: 10_000 },
};

// ── Trust-tier plumbing ──────────────────────────────────────────────────────
type SignalProvider = (uid?: string) => Partial<TrustSignals> | null | undefined;
let signalProvider: SignalProvider | null = null;
/** Client installs this once (services/trust/trustClient.ts). Pass null to clear (tests). */
export function registerTrustSignalProvider(fn: SignalProvider | null): void { signalProvider = fn; }

const YEAR_MS = 365 * DAY;
function trustFor(accountAgeMs: number, signals?: Partial<TrustSignals> | null) {
  // NaN/negative → brand new; Infinity (creation date unknown) → long-established (never punish missing data).
  const age = accountAgeMs === Infinity ? 100 * YEAR_MS : (Number.isFinite(accountAgeMs) && accountAgeMs > 0 ? accountAgeMs : 0);
  return computeTrust({ ...(signals || {}), accountAgeMs: age });
}
export function tierFor(accountAgeMs: number, signals?: Partial<TrustSignals> | null): TrustTier {
  return trustFor(accountAgeMs, signals).tier;
}

export const isNewAccount = (accountAgeMs: number, signals?: Partial<TrustSignals> | null) => tierFor(accountAgeMs, signals) === 'NEW';

export function limitFor(action: RateAction, accountAgeMs: number, signals?: Partial<TrustSignals> | null): RateRule {
  const trust = trustFor(accountAgeMs, signals);
  const tier = trust.tier;
  const base = (tier === 'NEW' ? NEW_ACCOUNT_LIMITS : ESTABLISHED_LIMITS)[action];
  if (trust.restricted && action === 'dm_cold') return { ...base, max: trust.limits.dmsToNonFollowersPerDay };
  if (trust.restricted && action === 'follow') return { ...base, max: trust.limits.followsPerHour };
  if (tier === 'NEW' || tier === 'BASIC') return base;
  // TRUSTED / VERIFIED_CREATOR: lift the ceilings that bots care about (humans never notice).
  const lim = trust.limits;
  if (action === 'follow') return { ...base, max: lim.followsPerHour };
  if (action === 'dm_cold') return { ...base, max: lim.dmsToNonFollowersPerDay };
  return base;
}

export interface RateCheck {
  ok: boolean;
  /** ms until the action would be allowed (0 when ok). */
  retryAfterMs: number;
  remaining: number;
  reason?: 'cooldown' | 'window';
}

/** `history` = epoch-ms timestamps of past actions of this kind (any order). */
export function checkRate(history: readonly number[], rule: RateRule, now: number): RateCheck {
  const inWindow = history.filter(t => t > now - rule.windowMs && t <= now).sort((a, b) => a - b);
  const last = inWindow.length ? inWindow[inWindow.length - 1] : undefined;
  if (last !== undefined && now - last < rule.cooldownMs) {
    return { ok: false, retryAfterMs: rule.cooldownMs - (now - last), remaining: Math.max(0, rule.max - inWindow.length), reason: 'cooldown' };
  }
  if (inWindow.length >= rule.max) {
    // The oldest still-blocking action must age out before the next is allowed.
    const oldestBlocking = inWindow[inWindow.length - rule.max];
    return { ok: false, retryAfterMs: Math.max(0, oldestBlocking + rule.windowMs - now), remaining: 0, reason: 'window' };
  }
  return { ok: true, retryAfterMs: 0, remaining: rule.max - inWindow.length };
}

/** Human-readable wait, e.g. "12s", "4 min", "2 h". */
export function formatRetry(ms: number): string {
  if (ms < 1000) return 'a moment';
  if (ms < MIN) return `${Math.ceil(ms / 1000)}s`;
  if (ms < HOUR) return `${Math.ceil(ms / MIN)} min`;
  return `${Math.ceil(ms / HOUR)} h`;
}

// ── localStorage recorder (per uid + action) ──────────────────────────────────

type StoreLike = Pick<Storage, 'getItem' | 'setItem'>;
const storeKey = (uid: string, action: RateAction) => `plajah.rate.${uid}.${action}`;

function defaultStore(): StoreLike | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

export function readHistory(uid: string, action: RateAction, store: StoreLike | null = defaultStore()): number[] {
  if (!store) return [];
  try {
    const raw = JSON.parse(store.getItem(storeKey(uid, action)) || '[]');
    return Array.isArray(raw) ? raw.filter((n: unknown): n is number => typeof n === 'number') : [];
  } catch { return []; }
}

/**
 * Check and (when allowed) record one action. Call right before performing it.
 * `accountCreatedAtMs` unknown -> treated as established (never punish missing data).
 */
export function tryConsume(
  uid: string, action: RateAction, accountCreatedAtMs?: number | null,
  now: number = Date.now(), store: StoreLike | null = defaultStore(),
): RateCheck {
  const age = accountCreatedAtMs ? now - accountCreatedAtMs : Infinity;
  let signals: Partial<TrustSignals> | null | undefined = null;
  try { signals = signalProvider?.(uid); } catch { signals = null; }
  const rule = limitFor(action, age, signals);
  const hist = readHistory(uid, action, store);
  const res = checkRate(hist, rule, now);
  if (res.ok && store) {
    try {
      const keep = hist.filter(t => t > now - rule.windowMs);
      keep.push(now);
      store.setItem(storeKey(uid, action), JSON.stringify(keep.slice(-200)));
    } catch { /* storage full/blocked: throttle simply not persisted */ }
  }
  return res;
}
