// registerAuthCore - PURE register permission rules (mirrors the orgPermissions.ts pattern: a role ->
// default permission table plus an explicit per-person override). Used by the server to gate
// endpoints and by the UI to hide controls. PIN hashing / session tokens are node-only and live in
// registerAuthServer.ts.

export type RegisterPermission = 'RING_SALES' | 'REFUND' | 'DISCOUNT_OVERRIDE' | 'CLOSE_DRAWER' | 'VIEW_REPORTS';
export type RegisterRole = 'OWNER' | 'MANAGER' | 'STAFF';

export const REGISTER_ROLE_PERMISSIONS: Record<RegisterRole, RegisterPermission[]> = {
  OWNER: ['RING_SALES', 'REFUND', 'DISCOUNT_OVERRIDE', 'CLOSE_DRAWER', 'VIEW_REPORTS'],
  MANAGER: ['RING_SALES', 'REFUND', 'DISCOUNT_OVERRIDE', 'CLOSE_DRAWER', 'VIEW_REPORTS'],
  STAFF: ['RING_SALES'],
};
const ALL: RegisterPermission[] = ['RING_SALES', 'REFUND', 'DISCOUNT_OVERRIDE', 'CLOSE_DRAWER', 'VIEW_REPORTS'];

/** Effective permissions: an explicit non-empty override wins, else the role default. Unknown roles get STAFF. */
export function registerPermissionsFor(role: string | undefined, override?: string[] | null): Set<RegisterPermission> {
  if (override && override.length) return new Set(override.filter((p): p is RegisterPermission => (ALL as string[]).includes(p)));
  return new Set(REGISTER_ROLE_PERMISSIONS[(role as RegisterRole)] || REGISTER_ROLE_PERMISSIONS.STAFF);
}
export const registerCan = (perms: Set<RegisterPermission> | RegisterPermission[], p: RegisterPermission): boolean =>
  (perms instanceof Set ? perms : new Set(perms)).has(p);

/**
 * PIN policy: PINs are exactly 6 digits (1M combos vs 10k for 4 digits). Together with the 5-strikes /
 * 15-minute lockout that makes online guessing impractical (about 1,000 days of continuous lockouts on
 * average) while staying typeable on a till. No legacy 4-digit PINs exist (no business has used this yet).
 */
export const isValidNewPin = (pin: any): boolean => typeof pin === 'string' && /^\d{6}$/.test(pin);
export const isValidPin = isValidNewPin;

// ── Discounts ────────────────────────────────────────────────────────────────────────────────────
export interface ManualDiscountIn { type?: 'PCT' | 'AMOUNT'; value?: number }   // PCT: percent; AMOUNT: cents
export const DEFAULT_DISCOUNT_LIMIT_PCT = 10;
/**
 * Compose ticket discounts. Auto offers + loyalty are decided elsewhere (ungated). The MANUAL discount is
 * computed on the after-offer base and capped by what is left after loyalty. `overLimit` = bigger than
 * `limitPct` of that base -> needs DISCOUNT_OVERRIDE or a manager PIN.
 */
export function composeDiscounts(a: { subtotalCents: number; offerCents: number; redeemCents: number; manual?: ManualDiscountIn | null; limitPct?: number }) {
  const base = Math.max(0, a.subtotalCents - a.offerCents);
  const v = Math.max(0, Number(a.manual?.value) || 0);
  const raw = a.manual?.type === 'PCT' ? Math.round(base * Math.min(100, v) / 100) : a.manual?.type === 'AMOUNT' ? Math.round(v) : 0;
  const manualCents = Math.max(0, Math.min(raw, base - a.redeemCents));
  const limit = a.limitPct ?? DEFAULT_DISCOUNT_LIMIT_PCT;
  return {
    manualCents, overLimit: manualCents > 0 && manualCents * 100 > limit * base,
    totalCents: a.offerCents + a.redeemCents + manualCents,
  };
}

/** A manager override is accepted only from someone who holds REFUND (managers/owners by default). */
export const canApprove = (role: string | undefined, override?: string[] | null): boolean => registerCan(registerPermissionsFor(role, override), 'REFUND') && role !== 'STAFF';

/** Failed-attempt lockout: after `max` failures inside `windowMs`, lock for `lockMs`. Pure so it is testable. */
export interface AttemptState { fails: number[]; lockedUntil?: number }
export function recordAttempt(st: AttemptState | undefined, ok: boolean, now: number, opts = { max: 5, windowMs: 10 * 60_000, lockMs: 15 * 60_000 }): AttemptState {
  if (ok) return { fails: [] };
  const fails = [...(st?.fails || []).filter(t => now - t < opts.windowMs), now];
  return { fails, lockedUntil: fails.length >= opts.max ? now + opts.lockMs : st?.lockedUntil };
}
export const isLocked = (st: AttemptState | undefined, now: number): boolean => !!st?.lockedUntil && st.lockedUntil > now;
