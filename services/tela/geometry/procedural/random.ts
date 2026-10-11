// random — seeded randomness for procedural illustration.
//
// Deterministic (a page must render identically on every machine and every export) and
// splittable: `fork(label)` derives an independent stream so adding a cloud never changes
// the shape of the tree drawn after it. mulberry32 core, hashed string seeds.

export type Rng = () => number;

/** mulberry32 — fast, 32-bit state, good enough statistics for art. */
export function rng(seed: number | string): Rng {
  let a = typeof seed === 'string' ? hashString(seed) : (Math.floor(seed * 2654435761) ^ 0x9e3779b9) >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function hashString(s: string): number { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/** A richer API over one stream. */
export class Random {
  readonly next: Rng;
  constructor(readonly seed: number | string) { this.next = rng(seed); }
  /** Independent child stream (stable under unrelated changes). */
  fork(label: string | number): Random { return new Random(`${this.seed}/${label}`); }
  float(a = 0, b = 1) { return a + (b - a) * this.next(); }
  int(a: number, b: number) { return Math.floor(this.float(a, b + 1)); }
  /** Symmetric jitter in [-amp, amp]. */
  jit(amp: number) { return (this.next() * 2 - 1) * amp; }
  chance(p: number) { return this.next() < p; }
  pick<T>(xs: readonly T[]): T { return xs[Math.floor(this.next() * xs.length) % xs.length]; }
  /** Weighted pick: [[value, weight], ...]. */
  weighted<T>(xs: ReadonlyArray<readonly [T, number]>): T { const tot = xs.reduce((s, x) => s + x[1], 0); let r = this.next() * tot; for (const [v, w] of xs) { r -= w; if (r <= 0) return v; } return xs[xs.length - 1][0]; }
  /** Approximately normal (Irwin–Hall, 4 draws). */
  gauss(mean = 0, sd = 1) { return mean + sd * ((this.next() + this.next() + this.next() + this.next() - 2) * 1.7320508); }
  shuffle<T>(xs: T[]): T[] { const a = xs.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
}
