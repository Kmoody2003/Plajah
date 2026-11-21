// Seeded randomness for refereed table games. A deal must be replayable from the stored state alone, so
// every random draw comes from a 32-bit generator whose position lives inside the match state (field `rs`),
// which viewFor() strips before anything reaches a player. Runs in the browser (local vs CPU) and on the server.

/** A fresh, unpredictable 32-bit seed (Web Crypto exists in Node 20+ and every browser). */
export function newSeed(): number {
  const a = new Uint32Array(1);
  globalThis.crypto.getRandomValues(a);
  return a[0] >>> 0;
}

/** mulberry32: one step. Returns [value in 0..1, next state]. */
export function next(rs: number): [number, number] {
  const s = (rs + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s];
}

/** Fisher–Yates with the seeded generator. Returns the shuffled copy and the advanced state. */
export function shuffle<T>(items: ReadonlyArray<T>, rs: number): [T[], number] {
  const out = [...items];
  let r = rs;
  for (let i = out.length - 1; i > 0; i--) {
    const [v, n] = next(r); r = n;
    const j = Math.floor(v * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return [out, r];
}

/** Parse a JSON state string; null when it isn't one. */
export function parse<T>(state: string): T | null {
  try { return JSON.parse(state) as T; } catch { return null; }
}
