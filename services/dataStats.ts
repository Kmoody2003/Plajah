/**
 * Small, dependency-free statistics for the Investigation Studio: summaries, correlation, least-
 * squares fit, and the transforms students use to linearise data (square, root, logarithm).
 * Pure functions so every number a student sees is unit-tested.
 */
export const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
export const mean = (a: number[]) => (a.length ? sum(a) / a.length : NaN);
export function median(a: number[]): number {
  if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function mode(a: number[]): number[] {
  const c = new Map<number, number>(); a.forEach(v => c.set(v, (c.get(v) || 0) + 1));
  const top = Math.max(0, ...c.values()); return top > 1 ? [...c.entries()].filter(([, n]) => n === top).map(([v]) => v).sort((x, y) => x - y) : [];
}
/** Sample standard deviation (n - 1). */
export function stdev(a: number[]): number {
  if (a.length < 2) return NaN; const m = mean(a); return Math.sqrt(sum(a.map(v => (v - m) ** 2)) / (a.length - 1));
}
export const range = (a: number[]) => (a.length ? Math.max(...a) - Math.min(...a) : NaN);

export interface Fit { slope: number; intercept: number; r: number; r2: number; n: number }

/** Ordinary least squares y = slope x + intercept, with Pearson r. Needs >= 2 points and some spread in x. */
export function linearFit(xs: number[], ys: number[]): Fit | null {
  const n = Math.min(xs.length, ys.length); if (n < 2) return null;
  const x = xs.slice(0, n), y = ys.slice(0, n); const mx = mean(x), my = mean(y);
  const sxx = sum(x.map(v => (v - mx) ** 2)), syy = sum(y.map(v => (v - my) ** 2)), sxy = sum(x.map((v, i) => (v - mx) * (y[i] - my)));
  if (sxx === 0) return null;
  const slope = sxy / sxx, intercept = my - slope * mx;
  const r = syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy);
  return { slope, intercept, r, r2: r * r, n };
}

export type Transform = 'none' | 'square' | 'sqrt' | 'ln' | 'inverse';
export const TRANSFORMS: Array<{ id: Transform; label: string }> = [
  { id: 'none', label: 'as measured' }, { id: 'square', label: 'squared' }, { id: 'sqrt', label: 'square root' }, { id: 'ln', label: 'natural log' }, { id: 'inverse', label: 'reciprocal (1/x)' },
];
/** Apply a transform; returns NaN where it is undefined (log of <= 0, 1/0, sqrt of < 0) so callers can drop those points. */
export function applyTransform(v: number, t: Transform): number {
  switch (t) { case 'square': return v * v; case 'sqrt': return v < 0 ? NaN : Math.sqrt(v); case 'ln': return v <= 0 ? NaN : Math.log(v); case 'inverse': return v === 0 ? NaN : 1 / v; default: return v; }
}

/** Histogram counts for `bins` equal-width bins across the data range. */
export function histogram(a: number[], bins = 6): Array<{ from: number; to: number; count: number }> {
  if (!a.length) return []; const lo = Math.min(...a), hi = Math.max(...a); const w = (hi - lo) / bins || 1;
  const out = Array.from({ length: bins }, (_, i) => ({ from: lo + i * w, to: lo + (i + 1) * w, count: 0 }));
  a.forEach(v => { out[Math.min(bins - 1, Math.floor((v - lo) / w))].count++; });
  return out;
}

/** Percent error of a measurement against an accepted value. */
export const percentError = (measured: number, accepted: number) => (accepted === 0 ? NaN : (Math.abs(measured - accepted) / Math.abs(accepted)) * 100);

/** Significant-figure-friendly display: trims float noise without hiding precision. */
export function fmt(n: number, digits = 4): string {
  if (!Number.isFinite(n)) return '—';
  const s = Number(n.toPrecision(digits)); return Math.abs(s) >= 1e6 || (Math.abs(s) < 1e-3 && s !== 0) ? s.toExponential(2) : String(s);
}

/** Parse pasted CSV/TSV into a header + numeric/text rows. First row is the header when it has non-numbers. */
export function parseTable(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };
  const split = (l: string) => l.split(l.includes('\t') ? '\t' : ',').map(c => c.trim().replace(/^"|"$/g, ''));
  const cells = lines.map(split);
  const hasHeader = cells[0].some(c => c !== '' && Number.isNaN(Number(c)));
  const headers = hasHeader ? cells[0] : cells[0].map((_, i) => `Column ${i + 1}`);
  return { headers, rows: hasHeader ? cells.slice(1) : cells };
}
