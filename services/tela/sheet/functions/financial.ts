// financial — time-value-of-money, cash-flow, and depreciation functions with
// Excel's sign conventions (money you pay out is negative).

import { eachValue, toNum, type Frame } from '../coerce';
import { CellError, ERR, type Value, isErr } from '../values';
import { I, N, NO, firstErr, nums, numResult, omitted, pairs } from './helpers';
import { def } from './registry';

const L = { lift: 'all' as const };

export function pmt(r: number, n: number, pv: number, fv = 0, type = 0): number {
  if (r === 0) return -(pv + fv) / n;
  const q = Math.pow(1 + r, n);
  return -(r * (fv + pv * q)) / ((1 + r * type) * (q - 1));
}
export function fv(r: number, n: number, p: number, pv = 0, type = 0): number {
  if (r === 0) return -(pv + p * n);
  const q = Math.pow(1 + r, n);
  return -(pv * q + (p * (1 + r * type) * (q - 1)) / r);
}
export function pv(r: number, n: number, p: number, fvv = 0, type = 0): number {
  if (r === 0) return -(fvv + p * n);
  const q = Math.pow(1 + r, n);
  return -(fvv + (p * (1 + r * type) * (q - 1)) / r) / q;
}
export function ipmt(r: number, per: number, n: number, pvv: number, fvv = 0, type = 0): number {
  const p = pmt(r, n, pvv, fvv, type);
  if (per === 1 && type === 1) return 0;
  let i = fv(r, per - 1, p, pvv, type) * r;
  if (type === 1) i /= 1 + r;
  return i;
}

/** Numeric args with optional defaults; returns array or the first error. */
function nargs(a: Value[], defaults: (number | null)[]): number[] | CellError {
  const out: number[] = [];
  for (let i = 0; i < defaults.length; i++) {
    const d = defaults[i];
    const v = d === null ? N(a[i]) : NO(a[i], d);
    if (isErr(v)) return v;
    out.push(v);
  }
  return out;
}
const F = (name: string, sig: string, desc: string, defaults: (number | null)[], fn: (...x: number[]) => number | CellError) =>
  def(name, 'financial', defaults.filter(d => d === null).length, defaults.length, sig, desc, a => {
    const v = nargs(a, defaults); if (isErr(v)) return v;
    const r = fn(...v);
    return typeof r === 'number' ? numResult(r) : r;
  }, L);

F('PMT', 'rate, nper, pv, [fv], [type]', 'Payment for a loan.', [null, null, null, 0, 0], (r, n, p, f, t) => (n === 0 ? ERR.NUM : pmt(r, n, p, f, t ? 1 : 0)));
F('FV', 'rate, nper, pmt, [pv], [type]', 'Future value of an investment.', [null, null, null, 0, 0], (r, n, p, v, t) => fv(r, n, p, v, t ? 1 : 0));
F('PV', 'rate, nper, pmt, [fv], [type]', 'Present value of an investment.', [null, null, null, 0, 0], (r, n, p, f, t) => pv(r, n, p, f, t ? 1 : 0));
F('NPER', 'rate, pmt, pv, [fv], [type]', 'Number of periods.', [null, null, null, 0, 0], (r, p, v, f, t) => {
  if (r === 0) return p === 0 ? ERR.NUM : -(v + f) / p;
  const tt = t ? 1 : 0;
  const num = p * (1 + r * tt) - f * r, den = v * r + p * (1 + r * tt);
  if (num / den <= 0) return ERR.NUM;
  return Math.log(num / den) / Math.log(1 + r);
});
F('IPMT', 'rate, per, nper, pv, [fv], [type]', 'Interest portion of a payment.', [null, null, null, null, 0, 0], (r, per, n, v, f, t) => (per < 1 || per > n ? ERR.NUM : ipmt(r, per, n, v, f, t ? 1 : 0)));
F('PPMT', 'rate, per, nper, pv, [fv], [type]', 'Principal portion of a payment.', [null, null, null, null, 0, 0], (r, per, n, v, f, t) => (per < 1 || per > n ? ERR.NUM : pmt(r, n, v, f, t ? 1 : 0) - ipmt(r, per, n, v, f, t ? 1 : 0)));
F('CUMIPMT', 'rate, nper, pv, start_period, end_period, type', 'Cumulative interest between periods.', [null, null, null, null, null, null], (r, n, v, s, e, t) => {
  if (r <= 0 || n <= 0 || v <= 0 || s < 1 || e < s || e > n || (t !== 0 && t !== 1)) return ERR.NUM;
  let sum = 0; for (let p = Math.ceil(s); p <= Math.floor(e); p++) sum += ipmt(r, p, n, v, 0, t); return sum;
});
F('CUMPRINC', 'rate, nper, pv, start_period, end_period, type', 'Cumulative principal between periods.', [null, null, null, null, null, null], (r, n, v, s, e, t) => {
  if (r <= 0 || n <= 0 || v <= 0 || s < 1 || e < s || e > n || (t !== 0 && t !== 1)) return ERR.NUM;
  const p = pmt(r, n, v, 0, t);
  let sum = 0; for (let k = Math.ceil(s); k <= Math.floor(e); k++) sum += p - ipmt(r, k, n, v, 0, t); return sum;
});
F('ISPMT', 'rate, per, nper, pv', 'Interest paid in a period (straight-line principal).', [null, null, null, null], (r, per, n, v) => (n === 0 ? ERR.DIV0 : v * r * (per / n - 1)));
F('RATE', 'nper, pmt, pv, [fv], [type], [guess]', 'Interest rate per period.', [null, null, null, 0, 0, 0.1], (n, p, v, f, t, g) => {
  const tt = t ? 1 : 0;
  let r = g;
  for (let i = 0; i < 100; i++) {
    let y: number, dy: number;
    if (Math.abs(r) < 1e-10) {
      y = v + p * n + f; dy = v * n + p * n * (n - 1) / 2 + p * tt * n;
      // derivative at r≈0 via finite difference for robustness
      const h = 1e-7; const y2 = tvm(r + h, n, p, v, f, tt); dy = (y2 - tvm(r, n, p, v, f, tt)) / h;
    } else { y = tvm(r, n, p, v, f, tt); const h = Math.max(1e-10, Math.abs(r) * 1e-7); dy = (tvm(r + h, n, p, v, f, tt) - y) / h; }
    if (!Number.isFinite(dy) || dy === 0) break;
    const nr = r - y / dy;
    if (!Number.isFinite(nr)) break;
    if (Math.abs(nr - r) < 1e-12) return nr;
    r = nr;
  }
  return Math.abs(tvm(r, n, p, v, f, tt)) < 1e-7 ? r : ERR.NUM;
});
function tvm(r: number, n: number, p: number, v: number, f: number, t: number) {
  if (r === 0) return v + p * n + f;
  const q = Math.pow(1 + r, n);
  return v * q + p * (1 + r * t) * (q - 1) / r + f;
}
F('EFFECT', 'nominal_rate, npery', 'Effective annual rate.', [null, null], (r, n) => { const k = Math.trunc(n); return r <= 0 || k < 1 ? ERR.NUM : Math.pow(1 + r / k, k) - 1; });
F('NOMINAL', 'effect_rate, npery', 'Nominal annual rate.', [null, null], (r, n) => { const k = Math.trunc(n); return r <= 0 || k < 1 ? ERR.NUM : k * (Math.pow(1 + r, 1 / k) - 1); });
F('PDURATION', 'rate, pv, fv', 'Periods to reach a value.', [null, null, null], (r, p, f) => (r <= 0 || p <= 0 || f <= 0 ? ERR.NUM : (Math.log(f) - Math.log(p)) / Math.log(1 + r)));
F('RRI', 'nper, pv, fv', 'Equivalent interest rate for growth.', [null, null, null], (n, p, f) => (n <= 0 || p === 0 ? ERR.NUM : Math.pow(f / p, 1 / n) - 1));
F('SLN', 'cost, salvage, life', 'Straight-line depreciation.', [null, null, null], (c, s, l) => (l === 0 ? ERR.DIV0 : (c - s) / l));
F('SYD', 'cost, salvage, life, per', "Sum-of-years' digits depreciation.", [null, null, null, null], (c, s, l, p) => (l <= 0 || p <= 0 || p > l ? ERR.NUM : ((c - s) * (l - p + 1) * 2) / (l * (l + 1))));
function ddb(c: number, s: number, l: number, p: number, fct: number): number {
  let rate = fct / l, old: number;
  if (rate >= 1) { rate = 1; old = p === 1 ? c : 0; } else old = c * Math.pow(1 - rate, p - 1);
  const nw = c * Math.pow(1 - rate, p);
  return Math.max(nw < s ? old - s : old - nw, 0);
}
F('DDB', 'cost, salvage, life, period, [factor]', 'Double-declining balance depreciation.', [null, null, null, null, 2], (c, s, l, p, fct) => {
  if (c < 0 || s < 0 || l <= 0 || p <= 0 || p > l || fct <= 0) return ERR.NUM;
  return ddb(c, s, l, p, fct);
});
F('DB', 'cost, salvage, life, period, [month]', 'Fixed-declining balance depreciation.', [null, null, null, null, 12], (c, s, l, p, m) => {
  if (c < 0 || s < 0 || l <= 0 || p <= 0 || m < 1 || m > 12 || p > l + 1) return ERR.NUM;
  if (c === 0) return 0;
  const rate = Math.round((1 - Math.pow(s / c, 1 / l)) * 1000) / 1000;
  let total = 0, dep = 0;
  for (let i = 1; i <= p; i++) {
    if (i === 1) dep = (c * rate * m) / 12;
    else if (i === Math.floor(l) + 1) dep = ((c - total) * rate * (12 - m)) / 12;
    else dep = (c - total) * rate;
    total += dep;
  }
  return dep;
});
/** VDB inner loop: DDB with a switch to straight-line once it depreciates faster. */
function interVdb(c: number, s: number, life: number, life1: number, period: number, fct: number): number {
  let vdb = 0, sln = 0, nowSln = false, rest = c - s;
  const intEnd = Math.ceil(period);
  for (let i = 1; i <= intEnd; i++) {
    let term: number;
    if (!nowSln) {
      const d = ddb(c, s, life, i, fct);
      sln = rest / (life1 - (i - 1));
      if (sln > d) { term = sln; nowSln = true; } else { term = d; rest -= d; }
    } else term = sln;
    if (i === intEnd) term *= period + 1 - intEnd;
    vdb += term;
  }
  return vdb;
}
def('VDB', 'financial', 5, 7, 'cost, salvage, life, start_period, end_period, [factor], [no_switch]', 'Variable declining balance depreciation.', a => {
  const v = nargs(a, [null, null, null, null, null, 2, 0]); if (isErr(v)) return v;
  let [c, s, l, sp, ep] = v; const fct = v[5], ns = v[6];
  if (c < 0 || s < 0 || l <= 0 || sp < 0 || ep < sp || ep > l || fct <= 0) return ERR.NUM;
  let total = 0;
  if (ns) {
    const is = Math.floor(sp), ie = Math.ceil(ep);
    for (let i = is + 1; i <= ie; i++) {
      let t = ddb(c, s, l, i, fct);
      if (i === is + 1) t *= Math.min(ep, is + 1) - sp;
      else if (i === ie) t *= ep + 1 - ie;
      total += t;
    }
  } else {
    if (sp !== Math.floor(sp) && fct > 1 && sp >= l / 2) { const part = sp - l / 2; sp = l / 2; ep -= part; l += 1; }
    c -= interVdb(c, s, l, l, sp, fct);
    total = interVdb(c, s, l, l - sp, ep - sp, fct);
  }
  return numResult(total);
}, L);
def('DOLLARDE', 'financial', 2, 2, 'fractional_dollar, fraction', 'Fractional price → decimal.', a => {
  const x = N(a[0]), fr = I(a[1]); const e = firstErr(x, fr); if (e) return e;
  if ((fr as number) < 0) return ERR.NUM; if (fr === 0) return ERR.DIV0;
  const ip = Math.trunc(x as number), frac = (x as number) - ip;
  const digits = Math.ceil(Math.log10(fr as number + 1e-12));
  return ip + (frac * Math.pow(10, digits)) / (fr as number);
}, L);
def('DOLLARFR', 'financial', 2, 2, 'decimal_dollar, fraction', 'Decimal price → fractional.', a => {
  const x = N(a[0]), fr = I(a[1]); const e = firstErr(x, fr); if (e) return e;
  if ((fr as number) < 0) return ERR.NUM; if (fr === 0) return ERR.DIV0;
  const ip = Math.trunc(x as number), frac = (x as number) - ip;
  const digits = Math.ceil(Math.log10(fr as number + 1e-12));
  return ip + (frac * (fr as number)) / Math.pow(10, digits);
}, L);

def('NPV', 'financial', 2, 255, 'rate, value1, [value2], ...', 'Net present value of periodic cash flows.', (a, f) => {
  const r = N(a[0], f); if (isErr(r)) return r;
  const xs = nums(a.slice(1), f); if (isErr(xs)) return xs;
  let s = 0; xs.forEach((v, i) => { s += v / Math.pow(1 + r, i + 1); });
  return numResult(s);
});
def('FVSCHEDULE', 'financial', 2, 2, 'principal, schedule', 'Future value with a schedule of rates.', (a, f) => {
  const p = N(a[0], f); if (isErr(p)) return p;
  let v = p; let err: CellError | null = null;
  eachValue([a[1]], f, x => { const n = toNum(x); if (isErr(n)) { err = n; return false; } v *= 1 + n; });
  return err ?? v;
});
function irrSolve(cfs: number[], times: number[] | null, guess: number): number | CellError {
  const f = (r: number) => cfs.reduce((s, c, i) => s + c / Math.pow(1 + r, times ? times[i] : i), 0);
  const df = (r: number) => cfs.reduce((s, c, i) => { const t = times ? times[i] : i; return s - (t * c) / Math.pow(1 + r, t + 1); }, 0);
  if (!cfs.some(c => c > 0) || !cfs.some(c => c < 0)) return ERR.NUM;
  let r = guess;
  for (let i = 0; i < 200; i++) {
    const y = f(r), d = df(r);
    if (!Number.isFinite(y) || !Number.isFinite(d) || d === 0) break;
    let nr = r - y / d;
    if (nr <= -1) nr = (r - 1) / 2;
    if (Math.abs(nr - r) < 1e-12) return nr;
    r = nr;
  }
  // Fallback: bisection over a wide bracket.
  let lo = -0.9999999, hi = 10;
  let flo = f(lo), fhi = f(hi);
  if (flo * fhi > 0) return ERR.NUM;
  for (let i = 0; i < 300; i++) { const mid = (lo + hi) / 2, fm = f(mid); if (Math.abs(fm) < 1e-12) return mid; if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; } }
  void fhi;
  return (lo + hi) / 2;
}
def('IRR', 'financial', 1, 2, 'values, [guess]', 'Internal rate of return.', (a, f) => {
  const xs = nums([a[0]], f); if (isErr(xs)) return xs;
  const g = NO(a[1], 0.1, f); if (isErr(g)) return g;
  return irrSolve(xs, null, g);
});
def('XNPV', 'financial', 3, 3, 'rate, values, dates', 'Net present value of dated cash flows.', (a, f) => {
  const r = N(a[0], f); if (isErr(r)) return r;
  const p = pairs(a[1], a[2], f); if (isErr(p)) return p;
  if (!p.x.length) return ERR.NUM;
  const d0 = p.y[0];
  if (p.y.some(d => Math.floor(d) < Math.floor(d0))) return ERR.NUM;
  return numResult(p.x.reduce((s, v, i) => s + v / Math.pow(1 + r, (Math.floor(p.y[i]) - Math.floor(d0)) / 365), 0));
});
def('XIRR', 'financial', 2, 3, 'values, dates, [guess]', 'Internal rate of return of dated cash flows.', (a, f) => {
  const p = pairs(a[0], a[1], f); if (isErr(p)) return p;
  const g = NO(a[2], 0.1, f); if (isErr(g)) return g;
  const d0 = Math.floor(p.y[0]);
  return irrSolve(p.x, p.y.map(d => (Math.floor(d) - d0) / 365), g);
});
def('MIRR', 'financial', 3, 3, 'values, finance_rate, reinvest_rate', 'Modified internal rate of return.', (a, f) => {
  const xs = nums([a[0]], f); if (isErr(xs)) return xs;
  const fr = N(a[1], f), rr = N(a[2], f); const e = firstErr(fr, rr); if (e) return e;
  const n = xs.length;
  let pvNeg = 0, fvPos = 0;
  xs.forEach((v, i) => { if (v < 0) pvNeg += v / Math.pow(1 + (fr as number), i); else fvPos += v * Math.pow(1 + (rr as number), n - 1 - i); });
  if (pvNeg === 0 || fvPos === 0) return ERR.DIV0;
  return Math.pow(-fvPos / pvNeg, 1 / (n - 1)) - 1;
});

export { omitted };
