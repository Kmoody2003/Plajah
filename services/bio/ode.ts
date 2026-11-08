// ODE solvers for models (pathways, populations, chemistry). Our own code.
//   dopri5  Dormand-Prince 5(4), adaptive: fast for smooth, non-stiff systems.
//   ros23   Rosenbrock 2(3) (the ode23s scheme, Shampine & Reichelt 1997): L-stable, for stiff
//           chemistry such as Robertson, where explicit solvers need millions of steps.
//   solve   tries dopri5 and switches to ros23 when it detects stiffness.

export type Rhs = (t: number, y: Float64Array, out: Float64Array) => void;
export interface SolveOptions { rtol?: number; atol?: number; maxSteps?: number; hInit?: number; nonNegative?: boolean; /** Wall-clock limit (ms), so a hard model cannot freeze the page. */ budgetMs?: number; /** Which rows each state (column) affects; enables grouped finite differences. */ jacPattern?: JacPattern }

/** Sparsity of the Jacobian: rows[j] lists the equations that read state j; colors group columns that share no row. */
export interface JacPattern { rows: number[][]; colors: number[][] }

/** Greedy column colouring (Curtis-Powell-Reid): columns in one colour never touch the same row, so one perturbation estimates them all. */
export function colorColumns(rows: number[][], n: number): JacPattern {
  const colorOf = new Int32Array(n).fill(-1); const colors: number[][] = []; const used: Array<Set<number>> = [];
  // Columns touching many rows first: fewer colours in practice.
  const order = Array.from({ length: n }, (_, j) => j).sort((a, b) => rows[b].length - rows[a].length);
  for (const j of order) {
    let c = 0; while (c < colors.length && rows[j].some(r => used[c].has(r))) c++;
    if (c === colors.length) { colors.push([]); used.push(new Set()); }
    colors[c].push(j); for (const r of rows[j]) used[c].add(r); colorOf[j] = c;
  }
  return { rows, colors };
}

export class SolverError extends Error {}
const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
/** Every attempt (accepted or rejected) counts, and time is checked every 64 attempts. */
function guard(out: { steps: number; rejected: number }, maxSteps: number, start: number, budget: number | undefined, t: number, h: number) {
  const tries = out.steps + out.rejected;
  if (tries > maxSteps) throw new SolverError(`Too many steps (${maxSteps}) by t=${t.toPrecision(4)}`);
  if (!Number.isFinite(h) || Math.abs(h) < 1e-15 * Math.max(1e-300, Math.abs(t)) && Math.abs(h) < 1e-300) throw new SolverError(`Step size collapsed at t=${t.toPrecision(4)}`);
  if (budget && (tries & 63) === 0 && clock() - start > budget) throw new SolverError(`Stopped after ${Math.round(budget / 1000)} s at t=${t.toPrecision(4)}; try a shorter run or the stiff solver`);
}
export interface Solution { t: number[]; y: Float64Array[]; steps: number; rejected: number; method: 'dopri5' | 'ros23'; stiffSwitch?: boolean }

class StiffError extends Error {}

const norm = (err: Float64Array, y0: Float64Array, y1: Float64Array, rtol: number, atol: number) => {
  let s = 0; for (let i = 0; i < err.length; i++) { const sc = atol + rtol * Math.max(Math.abs(y0[i]), Math.abs(y1[i])); s += (err[i] / sc) ** 2; }
  return Math.sqrt(s / Math.max(1, err.length));
};

function initialStep(f: Rhs, t0: number, y0: Float64Array, f0: Float64Array, order: number, rtol: number, atol: number, span: number) {
  const n = y0.length; let d0 = 0, d1 = 0;
  for (let i = 0; i < n; i++) { const sc = atol + rtol * Math.abs(y0[i]); d0 += (y0[i] / sc) ** 2; d1 += (f0[i] / sc) ** 2; }
  d0 = Math.sqrt(d0 / n); d1 = Math.sqrt(d1 / n);
  let h0 = d0 < 1e-5 || d1 < 1e-5 ? 1e-6 : 0.01 * d0 / d1; h0 = Math.min(h0, Math.abs(span));
  const y1 = new Float64Array(n); const f1 = new Float64Array(n);
  for (let i = 0; i < n; i++) y1[i] = y0[i] + h0 * f0[i];
  f(t0 + h0, y1, f1);
  let d2 = 0; for (let i = 0; i < n; i++) { const sc = atol + rtol * Math.abs(y0[i]); d2 += ((f1[i] - f0[i]) / sc) ** 2; }
  d2 = Math.sqrt(d2 / n) / h0;
  const h1 = Math.max(d1, d2) <= 1e-15 ? Math.max(1e-6, h0 * 1e-3) : (0.01 / Math.max(d1, d2)) ** (1 / (order + 1));
  return Math.min(100 * h0, h1, Math.abs(span));
}

// Dormand-Prince coefficients
const C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];
const A = [[], [1 / 5], [3 / 40, 9 / 40], [44 / 45, -56 / 15, 32 / 9], [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729], [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656], [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84]];
const E = [71 / 57600, 0, -71 / 16695, 71 / 1920, -17253 / 339200, 22 / 525, -1 / 40]; // b5 - b4

/** Integrate and report y at every time in `times` (ascending, times[0] = start). */
export function dopri5(f: Rhs, y0: ArrayLike<number>, times: number[], o: SolveOptions = {}, detectStiff = false): Solution {
  const rtol = o.rtol ?? 1e-6, atol = o.atol ?? 1e-9, maxSteps = o.maxSteps ?? 200000; const n = y0.length; const started = clock();
  let t = times[0]; let y = Float64Array.from(y0); const out: Solution = { t: [t], y: [y.slice()], steps: 0, rejected: 0, method: 'dopri5' };
  const k = Array.from({ length: 7 }, () => new Float64Array(n)); const tmp = new Float64Array(n); const yn = new Float64Array(n); const err = new Float64Array(n); const g6 = new Float64Array(n);
  f(t, y, k[0]);
  let h = o.hInit ?? initialStep(f, t, y, k[0], 5, rtol, atol, times[times.length - 1] - t);
  let stiffHits = 0; let next = 1;
  while (next < times.length) {
    guard(out, maxSteps, started, o.budgetMs, t, h);
    const target = times[next]; if (t + h > target) h = target - t;
    for (let s = 1; s < 7; s++) { for (let i = 0; i < n; i++) { let acc = y[i]; for (let j = 0; j < s; j++) acc += h * A[s][j] * k[j][i]; tmp[i] = acc; } f(t + C[s] * h, tmp, k[s]); if (s === 5) g6.set(tmp); if (s === 6) yn.set(tmp); }
    for (let i = 0; i < n; i++) { let e = 0; for (let s = 0; s < 7; s++) e += E[s] * k[s][i]; err[i] = h * e; }
    const en = norm(err, y, yn, rtol, atol);
    if (!Number.isFinite(en)) { out.rejected++; h *= 0.25; continue; }
    if (en <= 1 || Math.abs(h) < 1e-14 * Math.max(1, Math.abs(t))) {
      t += h; y.set(yn); if (o.nonNegative) for (let i = 0; i < n; i++) if (y[i] < 0) y[i] = 0;
      k[0].set(k[6]); out.steps++;
      if (detectStiff) { // Hairer's test: h*|lambda| near the stability boundary (3.25) repeatedly
        let num = 0, den = 0; for (let i = 0; i < n; i++) { num += (k[6][i] - k[5][i]) ** 2; den += (yn[i] - g6[i]) ** 2; }
        if (den > 0 && h * h * num / den > 3.25 * 3.25) { if (++stiffHits >= 15) throw new StiffError('stiff'); } else stiffHits = Math.max(0, stiffHits - 1);
      }
      if (t >= target - 1e-12 * Math.max(1, Math.abs(target))) { out.t.push(target); out.y.push(y.slice()); next++; }
    } else out.rejected++;
    const fac = en === 0 ? 5 : Math.min(5, Math.max(0.2, 0.9 * en ** -0.2)); h = h * fac;
    if (next < times.length && h > times[next] - t && times[next] - t > 0) { /* clipped at loop top */ }
  }
  return out;
}

// ── Rosenbrock 2(3) ─────────────────────────────────────────────────────────

function luFactor(a: Float64Array, n: number, piv: Int32Array) {
  for (let k = 0; k < n; k++) {
    let p = k, max = Math.abs(a[k * n + k]);
    for (let i = k + 1; i < n; i++) { const v = Math.abs(a[i * n + k]); if (v > max) { max = v; p = i; } }
    piv[k] = p; if (max === 0) throw new Error('Singular matrix in stiff solver');
    if (p !== k) for (let j = 0; j < n; j++) { const t = a[k * n + j]; a[k * n + j] = a[p * n + j]; a[p * n + j] = t; }
    for (let i = k + 1; i < n; i++) { const m = (a[i * n + k] /= a[k * n + k]); if (m) for (let j = k + 1; j < n; j++) a[i * n + j] -= m * a[k * n + j]; }
  }
}
function luSolve(a: Float64Array, n: number, piv: Int32Array, b: Float64Array) {
  for (let k = 0; k < n; k++) { const p = piv[k]; if (p !== k) { const t = b[k]; b[k] = b[p]; b[p] = t; } }
  for (let i = 1; i < n; i++) { let s = b[i]; for (let j = 0; j < i; j++) s -= a[i * n + j] * b[j]; b[i] = s; }
  for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let j = i + 1; j < n; j++) s -= a[i * n + j] * b[j]; b[i] = s / a[i * n + i]; }
}

/** Forward-difference Jacobian. */
function jacobian(f: Rhs, t: number, y: Float64Array, f0: Float64Array, J: Float64Array, pattern?: JacPattern) {
  const n = y.length; const yp = y.slice(); const fp = new Float64Array(n);
  if (pattern) {
    J.fill(0); const d = new Float64Array(n);
    for (const group of pattern.colors) {
      for (const j of group) { d[j] = Math.sqrt(2.2e-16) * Math.max(1e-5, Math.abs(y[j])); yp[j] = y[j] + d[j]; }
      f(t, yp, fp);
      for (const j of group) { for (const i of pattern.rows[j]) J[i * n + j] = (fp[i] - f0[i]) / d[j]; yp[j] = y[j]; }
    }
    return;
  }
  for (let j = 0; j < n; j++) {
    const d = Math.sqrt(2.2e-16) * Math.max(1e-5, Math.abs(y[j])); yp[j] = y[j] + d; f(t, yp, fp); yp[j] = y[j];
    for (let i = 0; i < n; i++) J[i * n + j] = (fp[i] - f0[i]) / d;
  }
}

export function ros23(f: Rhs, y0: ArrayLike<number>, times: number[], o: SolveOptions = {}): Solution {
  const rtol = o.rtol ?? 1e-6, atol = o.atol ?? 1e-9, maxSteps = o.maxSteps ?? 200000; const n = y0.length; const started = clock();
  const d = 1 / (2 + Math.SQRT2), e32 = 6 + Math.SQRT2;
  let t = times[0]; const y = Float64Array.from(y0); const out: Solution = { t: [t], y: [y.slice()], steps: 0, rejected: 0, method: 'ros23' };
  const F0 = new Float64Array(n), F1 = new Float64Array(n), F2 = new Float64Array(n), k1 = new Float64Array(n), k2 = new Float64Array(n), k3 = new Float64Array(n);
  const T = new Float64Array(n), tmp = new Float64Array(n), yn = new Float64Array(n), err = new Float64Array(n);
  const J = new Float64Array(n * n), W = new Float64Array(n * n), piv = new Int32Array(n);
  f(t, y, F0);
  let h = o.hInit ?? initialStep(f, t, y, F0, 3, rtol, atol, times[times.length - 1] - t);
  let next = 1; let needJ = true;
  while (next < times.length) {
    guard(out, maxSteps, started, o.budgetMs, t, h);
    const target = times[next]; if (t + h > target) h = target - t;
    if (needJ) {
      jacobian(f, t, y, F0, J, o.jacPattern);
      const dt = Math.sqrt(2.2e-16) * Math.max(1e-5, Math.abs(t)); f(t + dt, y, tmp); for (let i = 0; i < n; i++) T[i] = (tmp[i] - F0[i]) / dt;
      needJ = false;
    }
    for (let i = 0; i < n * n; i++) W[i] = -h * d * J[i]; for (let i = 0; i < n; i++) W[i * n + i] += 1;
    luFactor(W, n, piv);
    for (let i = 0; i < n; i++) k1[i] = F0[i] + h * d * T[i]; luSolve(W, n, piv, k1);
    for (let i = 0; i < n; i++) tmp[i] = y[i] + 0.5 * h * k1[i]; f(t + 0.5 * h, tmp, F1);
    for (let i = 0; i < n; i++) k2[i] = F1[i] - k1[i]; luSolve(W, n, piv, k2); for (let i = 0; i < n; i++) k2[i] += k1[i];
    for (let i = 0; i < n; i++) yn[i] = y[i] + h * k2[i]; f(t + h, yn, F2);
    for (let i = 0; i < n; i++) k3[i] = F2[i] - e32 * (k2[i] - F1[i]) - 2 * (k1[i] - F0[i]) + h * d * T[i]; luSolve(W, n, piv, k3);
    for (let i = 0; i < n; i++) err[i] = h / 6 * (k1[i] - 2 * k2[i] + k3[i]);
    const en = norm(err, y, yn, rtol, atol);
    if (!Number.isFinite(en)) { out.rejected++; h *= 0.25; continue; }
    if (en <= 1 || Math.abs(h) < 1e-14 * Math.max(1, Math.abs(t))) {
      t += h; y.set(yn); if (o.nonNegative) for (let i = 0; i < n; i++) if (y[i] < 0) y[i] = 0;
      F0.set(F2); out.steps++; needJ = true;
      if (t >= target - 1e-12 * Math.max(1, Math.abs(target))) { out.t.push(target); out.y.push(y.slice()); next++; }
    } else out.rejected++;
    h *= en === 0 ? 5 : Math.min(5, Math.max(0.2, 0.8 * en ** (-1 / 3)));
  }
  return out;
}

/** dopri5 first; on detected stiffness, start again with ros23. */
export function solve(f: Rhs, y0: ArrayLike<number>, times: number[], o: SolveOptions = {}): Solution {
  try { return dopri5(f, y0, times, { ...o, maxSteps: Math.min(o.maxSteps ?? 50000, 50000) }, true); }
  catch (e) {
    const r = ros23(f, y0, times, o); r.stiffSwitch = true;
    if (!(e instanceof StiffError) && !/Too many steps|Step size collapsed/.test(String((e as Error).message))) throw e;
    return r;
  }
}

export const linspace = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1));
