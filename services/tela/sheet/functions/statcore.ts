// statcore — pure numeric kernels shared by the math/stat/database functions:
// descriptive statistics, special functions (erf, gamma, incomplete gamma and
// beta), and the CDFs / inverses behind NORM/T/CHISQ/F/BETA/GAMMA.DIST.
// Algorithms: Lanczos gammaln, series + Lentz continued fractions for the
// incomplete gamma/beta (Numerical Recipes style), Acklam + Halley for the
// normal inverse, and bracketed bisection for the other inverses.

export const sum = (a: number[]) => { let s = 0; for (const x of a) s += x; return s; };
export const mean = (a: number[]) => sum(a) / a.length;
export function devsq(a: number[]) { const m = mean(a); let s = 0; for (const x of a) s += (x - m) * (x - m); return s; }
export const varS = (a: number[]) => devsq(a) / (a.length - 1);
export const varP = (a: number[]) => devsq(a) / a.length;
export const sorted = (a: number[]) => a.slice().sort((x, y) => x - y);

export function median(a: number[]): number {
  const s = sorted(a), n = s.length, h = n >> 1;
  return n % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
}

/** MODE.MULT order: by frequency desc, ties in first-appearance order. Empty when no repeats. */
export function modes(a: number[]): number[] {
  const counts = new Map<number, number>();
  const first = new Map<number, number>();
  a.forEach((x, i) => { counts.set(x, (counts.get(x) ?? 0) + 1); if (!first.has(x)) first.set(x, i); });
  let best = 1;
  for (const c of counts.values()) best = Math.max(best, c);
  if (best < 2) return [];
  return [...counts.entries()].filter(([, c]) => c === best).map(([x]) => x).sort((x, y) => first.get(x)! - first.get(y)!);
}

export function percentileInc(a: number[], k: number): number {
  const s = sorted(a), n = s.length;
  if (n === 0 || k < 0 || k > 1) return NaN;
  const h = (n - 1) * k, lo = Math.floor(h);
  return lo + 1 < n ? s[lo] + (h - lo) * (s[lo + 1] - s[lo]) : s[lo];
}
export function percentileExc(a: number[], k: number): number {
  const s = sorted(a), n = s.length;
  if (n === 0 || k <= 0 || k >= 1) return NaN;
  const h = (n + 1) * k;
  if (h < 1 || h > n) return NaN;
  const lo = Math.floor(h);
  return lo < n ? s[lo - 1] + (h - lo) * (s[lo] - s[lo - 1]) : s[lo - 1];
}

export function kth(a: number[], k: number, largest: boolean): number {
  const s = sorted(a);
  if (k < 1 || k > s.length) return NaN;
  return largest ? s[s.length - k] : s[k - 1];
}

export function skew(a: number[]) {
  const n = a.length, m = mean(a), sd = Math.sqrt(varS(a));
  let s = 0; for (const x of a) s += ((x - m) / sd) ** 3;
  return (n / ((n - 1) * (n - 2))) * s;
}
export function skewP(a: number[]) {
  const n = a.length, m = mean(a), sd = Math.sqrt(varP(a));
  let s = 0; for (const x of a) s += ((x - m) / sd) ** 3;
  return s / n;
}
export function kurt(a: number[]) {
  const n = a.length, m = mean(a), sd = Math.sqrt(varS(a));
  let s = 0; for (const x of a) s += ((x - m) / sd) ** 4;
  return (n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3)) * s - (3 * (n - 1) ** 2) / ((n - 2) * (n - 3));
}

export function covariance(x: number[], y: number[], sample: boolean) {
  const mx = mean(x), my = mean(y);
  let s = 0; for (let i = 0; i < x.length; i++) s += (x[i] - mx) * (y[i] - my);
  return s / (x.length - (sample ? 1 : 0));
}
export function correl(x: number[], y: number[]) {
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxy / Math.sqrt(sxx * syy);
}
export function slopeIntercept(y: number[], x: number[]) {
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0;
  for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx };
}

// ── Special functions ────────────────────────────────────────────────────────

const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
export function gammaln(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - gammaln(1 - x);
  x -= 1;
  let a = LANCZOS[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
export function gamma(x: number): number {
  if (Number.isInteger(x)) { if (x <= 0) return NaN; if (x < 171) { let r = 1; for (let i = 2; i < x; i++) r *= i; return r; } }
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
  return Math.exp(gammaln(x));
}

export function erf(x: number): number {
  // High-precision series / continued fraction via the regularized gamma P(1/2, x²).
  if (x === 0) return 0;
  const v = lowerRegGamma(0.5, x * x);
  return x < 0 ? -v : v;
}
export const erfc = (x: number): number => (x < 0 ? 2 - erfc(-x) : upperRegGamma(0.5, x * x));

/** Regularized lower incomplete gamma P(a, x). */
export function lowerRegGamma(a: number, x: number): number {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let ap = a, del = 1 / a, s = del;
    for (let n = 0; n < 1000; n++) { ap++; del *= x / ap; s += del; if (Math.abs(del) < Math.abs(s) * 1e-16) break; }
    return s * Math.exp(-x + a * Math.log(x) - gammaln(a));
  }
  return 1 - upperRegGamma(a, x);
}
/** Regularized upper incomplete gamma Q(a, x). */
export function upperRegGamma(a: number, x: number): number {
  if (x <= 0) return 1;
  if (x < a + 1) return 1 - lowerRegGamma(a, x);
  const FPMIN = 1e-300;
  let b = x + 1 - a, c = 1 / FPMIN, d = 1 / b, h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return Math.exp(-x + a * Math.log(x) - gammaln(a)) * h;
}

function betacf(a: number, b: number, x: number): number {
  const FPMIN = 1e-300;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 1000; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return h;
}
/** Regularized incomplete beta I_x(a, b). */
export function regIncBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(gammaln(a + b) - gammaln(a) - gammaln(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** Monotone-increasing CDF inverse by bracketed bisection (robust, ~1e-15). */
export function invert(cdf: (x: number) => number, p: number, lo: number, hi: number, expandHi = true): number {
  if (expandHi) { let k = 0; while (cdf(hi) < p && k++ < 200) { lo = hi; hi *= 2; } }
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    if (mid === lo || mid === hi) break;
    if (cdf(mid) < p) lo = mid; else hi = mid;
    if (hi - lo <= 1e-15 * Math.max(1, Math.abs(mid))) break;
  }
  return (lo + hi) / 2;
}

// ── Distributions ────────────────────────────────────────────────────────────

export const normPdf = (x: number, m = 0, s = 1) => Math.exp(-0.5 * ((x - m) / s) ** 2) / (s * Math.sqrt(2 * Math.PI));
export const normCdf = (x: number, m = 0, s = 1) => { const z = (x - m) / (s * Math.SQRT2); return z < 0 ? 0.5 * erfc(-z) : 1 - 0.5 * erfc(z); };

/** Inverse standard normal (Acklam, refined with one Halley step). */
export function normSInv(p: number): number {
  if (p <= 0 || p >= 1) return NaN;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  let x: number;
  if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  else if (p <= 1 - pl) { const q = p - 0.5, r = q * q; x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  else { const q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  for (let i = 0; i < 2; i++) {
    const e = normCdf(x) - p;
    const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
    x = x - u / (1 + (x * u) / 2);
  }
  return x;
}

export function tCdf(t: number, df: number): number {
  const x = df / (df + t * t);
  const tail = 0.5 * regIncBeta(x, df / 2, 0.5);
  return t >= 0 ? 1 - tail : tail;
}
export const tPdf = (t: number, df: number) => Math.exp(gammaln((df + 1) / 2) - gammaln(df / 2)) / Math.sqrt(df * Math.PI) * (1 + (t * t) / df) ** (-(df + 1) / 2);
export function tInv(p: number, df: number): number {
  if (p === 0.5) return 0;
  if (p < 0.5) return -tInv(1 - p, df);
  return invert(x => tCdf(x, df), p, 0, 8);
}

export const chisqCdf = (x: number, k: number) => lowerRegGamma(k / 2, x / 2);
export const chisqPdf = (x: number, k: number) => (x <= 0 ? 0 : Math.exp((k / 2 - 1) * Math.log(x) - x / 2 - (k / 2) * Math.log(2) - gammaln(k / 2)));
export const chisqInv = (p: number, k: number) => invert(x => chisqCdf(x, k), p, 0, Math.max(1, k));

export const fCdf = (x: number, d1: number, d2: number) => (x <= 0 ? 0 : regIncBeta((d1 * x) / (d1 * x + d2), d1 / 2, d2 / 2));
export function fPdf(x: number, d1: number, d2: number) {
  if (x <= 0) return 0;
  return Math.exp(0.5 * (d1 * Math.log(d1 * x) + d2 * Math.log(d2) - (d1 + d2) * Math.log(d1 * x + d2)) - Math.log(x) - (gammaln(d1 / 2) + gammaln(d2 / 2) - gammaln((d1 + d2) / 2)));
}
export const fInv = (p: number, d1: number, d2: number) => invert(x => fCdf(x, d1, d2), p, 0, 4);

export const gammaCdf = (x: number, a: number, b: number) => lowerRegGamma(a, x / b);
export const gammaPdf = (x: number, a: number, b: number) => (x < 0 ? 0 : x === 0 ? (a === 1 ? 1 / b : 0) : Math.exp((a - 1) * Math.log(x) - x / b - gammaln(a) - a * Math.log(b)));
export const gammaInv = (p: number, a: number, b: number) => invert(x => gammaCdf(x, a, b), p, 0, Math.max(1, a * b));

export const betaCdf = (x: number, a: number, b: number) => regIncBeta(x, a, b);
export const betaPdf = (x: number, a: number, b: number) => (x < 0 || x > 1 ? 0 : Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - (gammaln(a) + gammaln(b) - gammaln(a + b))));
export const betaInv = (p: number, a: number, b: number) => invert(x => regIncBeta(x, a, b), p, 0, 1, false);

export function lnComb(n: number, k: number) { return gammaln(n + 1) - gammaln(k + 1) - gammaln(n - k + 1); }
export function combin(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}
export const binomPmf = (k: number, n: number, p: number) => (k < 0 || k > n ? 0 : p === 0 ? (k === 0 ? 1 : 0) : p === 1 ? (k === n ? 1 : 0) : Math.exp(lnComb(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p)));
export function binomCdf(k: number, n: number, p: number) { let s = 0; for (let i = 0; i <= k; i++) s += binomPmf(i, n, p); return Math.min(1, s); }
export const poissonPmf = (k: number, l: number) => (l === 0 ? (k === 0 ? 1 : 0) : Math.exp(k * Math.log(l) - l - gammaln(k + 1)));
export const poissonCdf = (k: number, l: number) => upperRegGamma(k + 1, l);
