// Seeded randomness for worksheet generation: mulberry32 over a string hash, so a lesson id + profile + seed always
// produces the same page.

export function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(xs: readonly T[]): T;
  shuffle<T>(xs: readonly T[]): T[];
  chance(p: number): boolean;
  /** n distinct picks (n ≤ xs.length). */
  sample<T>(xs: readonly T[], n: number): T[];
}

export function makeRng(seed: number | string): Rng {
  let a = typeof seed === 'number' ? seed >>> 0 : hashStr(seed);
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const shuffle = <T,>(xs: readonly T[]) => {
    const out = xs.slice();
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  };
  return {
    next, int, shuffle,
    pick: xs => xs[Math.floor(next() * xs.length)],
    chance: p => next() < p,
    sample: (xs, n) => shuffle(xs).slice(0, Math.min(n, xs.length)),
  };
}

export const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
export const lcm = (a: number, b: number) => Math.abs(a * b) / gcd(a, b);
export const fmtNum = (n: number) => (Number.isInteger(n) ? n.toLocaleString('en-US') : String(+n.toFixed(4)));
export const frac = (n: number, d: number) => { const g = gcd(n, d) || 1; const [a, b] = [n / g, d / g]; return b === 1 ? String(a) : `${a}/${b}`; };
