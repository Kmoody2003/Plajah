// Unified matchmaking — pure. One queue per game; a ticket pairs with the closest-rated live ticket
// inside a window that widens the longer either player has waited (±100 at once, +50 every 5 s,
// anyone after 30 s), so quiet hours still find a match and busy hours stay fair.

export interface Ticket { uid: string; rating: number; joinedAt: number; seenAt: number }

export const TICKET_STALE_MS = 15_000;

export function windowFor(waitMs: number): number {
  if (waitMs >= 30_000) return Infinity;
  return 100 + 50 * Math.floor(waitMs / 5_000);
}

/** Best opponent for `me`, or null. Ties go to whoever has waited longest. */
export function pickOpponent(me: Ticket, others: ReadonlyArray<Ticket>, now: number, blocked: ReadonlySet<string> = new Set()): Ticket | null {
  let best: Ticket | null = null;
  for (const t of others) {
    if (t.uid === me.uid || blocked.has(t.uid) || now - t.seenAt > TICKET_STALE_MS) continue;
    const gap = Math.abs(t.rating - me.rating);
    const allowed = Math.max(windowFor(now - me.joinedAt), windowFor(now - t.joinedAt));
    if (gap > allowed) continue;
    if (!best) { best = t; continue; }
    const bg = Math.abs(best.rating - me.rating);
    if (gap < bg || (gap === bg && t.joinedAt < best.joinedAt)) best = t;
  }
  return best;
}
