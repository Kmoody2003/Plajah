// Pure mirror of the firestore.rules `rlHlAdvance` say-hi counter (rateLimits/{uid}: hlCount,
// hlWindowStart, lastHelloAt). Evaluated client-side so we fail politely before the batch write.

export const HL_MAX_PER_WINDOW = 30;
export const HL_WINDOW_MS = 24 * 60 * 60 * 1000;
export const HL_MIN_GAP_MS = 3000;

export interface HlCounterDoc { hlCount?: number; hlWindowStartMs?: number; lastHelloAtMs?: number }
export type HlPlan =
  | { ok: true; resetWindow: boolean; nextCount: number; retryAfterMs?: undefined }
  | { ok: false; retryAfterMs: number; resetWindow?: undefined; nextCount?: undefined };

export function planHelloCounter(doc: HlCounterDoc | null | undefined, now: number): HlPlan {
  const last = doc?.lastHelloAtMs ?? 0;
  if (last && now - last < HL_MIN_GAP_MS) return { ok: false, retryAfterMs: HL_MIN_GAP_MS - (now - last) };
  const start = doc?.hlWindowStartMs ?? 0;
  if (!start || start + HL_WINDOW_MS <= now) return { ok: true, resetWindow: true, nextCount: 1 };
  const count = doc?.hlCount ?? 0;
  if (count + 1 > HL_MAX_PER_WINDOW) return { ok: false, retryAfterMs: start + HL_WINDOW_MS - now };
  return { ok: true, resetWindow: false, nextCount: count + 1 };
}

/** Fields to merge into rateLimits/{uid} for the plan (serverTimestamp injected by the caller). */
export function helloCounterFields<T>(plan: Extract<HlPlan, { ok: true }>, ts: T): Record<string, number | T> {
  return plan.resetWindow
    ? { hlCount: 1, hlWindowStart: ts, lastHelloAt: ts }
    : { hlCount: plan.nextCount, lastHelloAt: ts };
}
