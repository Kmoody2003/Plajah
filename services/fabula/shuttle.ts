// JKL shuttle transport math (pure, so it can be unit-tested away from React).
export const SHUTTLE_LADDER = [1, 2, 4, 8];

/** Next transport rate for a JKL shuttle key press.
 *  dir = +1 (L, forward) / -1 (J, reverse).
 *  - First press in a direction (or from a stop / the opposite direction) → 1× that way.
 *  - Tapping the SAME key while already shuttling that way steps up 1→2→4→8× (capped).
 *  1× forward is meant to run through the audio engine (with sound); reverse/fast are wall-clock
 *  (silent by design). K should reset the rate to 1 and stop — handled by the caller. */
export function nextShuttleRate(cur: number, playing: boolean, dir: 1 | -1): number {
  const sameDir = playing && Math.sign(cur) === dir;
  const mag = sameDir
    ? (SHUTTLE_LADDER[Math.min(SHUTTLE_LADDER.indexOf(Math.abs(cur)) + 1, SHUTTLE_LADDER.length - 1)] || Math.abs(cur))
    : 1;
  return dir * mag;
}
