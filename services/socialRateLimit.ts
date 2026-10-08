/**
 * Client-side anti-abuse throttles (pure + a thin localStorage recorder).
 *
 * This is a courtesy/first line of defence, NOT a security boundary: a hostile
 * client can skip it. Rules-level enforcement is deliberately not shipped (see
 * socialSafetyService header) because it would break existing writers.
 *
 * New accounts (< NEW_ACCOUNT_AGE_MS old) get tighter limits.
 */

export type RateAction = 'follow' | 'hello' | 'post' | 'comment' | 'report';

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

export const NEW_ACCOUNT_AGE_MS = 7 * DAY;

export const ESTABLISHED_LIMITS: Record<RateAction, RateRule> = {
  follow:  { max: 60, windowMs: HOUR, cooldownMs: 500 },
  hello:   { max: 30, windowMs: DAY,  cooldownMs: 5_000 },
  post:    { max: 6,  windowMs: MIN,  cooldownMs: 3_000 },
  comment: { max: 20, windowMs: MIN,  cooldownMs: 1_500 },
  report:  { max: 20, windowMs: HOUR, cooldownMs: 1_000 },
};

export const NEW_ACCOUNT_LIMITS: Record<RateAction, RateRule> = {
  follow:  { max: 20, windowMs: HOUR, cooldownMs: 2_000 },
  hello:   { max: 10, windowMs: DAY,  cooldownMs: 15_000 },
  post:    { max: 2,  windowMs: MIN,  cooldownMs: 15_000 },
  comment: { max: 8,  windowMs: MIN,  cooldownMs: 5_000 },
  report:  { max: 10, windowMs: HOUR, cooldownMs: 2_000 },
};

export const isNewAccount = (accountAgeMs: number) => !(accountAgeMs >= NEW_ACCOUNT_AGE_MS);

export function limitFor(action: RateAction, accountAgeMs: number): RateRule {
  return (isNewAccount(accountAgeMs) ? NEW_ACCOUNT_LIMITS : ESTABLISHED_LIMITS)[action];
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
  const rule = limitFor(action, age);
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
