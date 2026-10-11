// math — Math & trig functions (Excel semantics, incl. its rounding and sign rules).

import { eachValue, makeCriterion, scalarOf, toNum, type Frame } from '../coerce';
import { CellError, ERR, Matrix, OMITTED, Ref, type Scalar, type Value, isErr } from '../values';
import { B, I, IO, M, N, NO, S, firstErr, num1, num2, nums, numResult, omitted } from './helpers';
import { def, alias } from './registry';
import * as st from './statcore';

const L = { lift: 'all' as const };

/** Excel-style decimal rounding: fix binary noise at 15 digits, then round half away from zero. */
export function roundHalfAway(x: number, d: number): number {
  if (!Number.isFinite(x)) return x;
  const p = Math.pow(10, d);
  const y = Number((Math.abs(x) * p).toPrecision(15));
  const r = Math.floor(y + 0.5) / p;
  return x < 0 ? -r : r;
}
const roundUp = (x: number, d: number) => { const p = Math.pow(10, d); const y = Number((Math.abs(x) * p).toPrecision(15)); const r = Math.ceil(y) / p; return x < 0 ? -r : r; };
const roundDown = (x: number, d: number) => { const p = Math.pow(10, d); const y = Number((Math.abs(x) * p).toPrecision(15)); const r = Math.floor(y) / p; return x < 0 ? -r : r; };
/** Floor/ceil that forgive binary noise (x/sig = 2.9999999999999996 → 3). */
const fl = (x: number) => Math.floor(Number(x.toPrecision(15)));
const ce = (x: number) => Math.ceil(Number(x.toPrecision(15)));

export function power(b: number, e: number): number | CellError {
  if (b === 0 && e === 0) return ERR.NUM;
  if (b === 0 && e < 0) return ERR.DIV0;
  const r = Math.pow(b, e);
  if (Number.isNaN(r)) return ERR.NUM; // (-8)^(1/3) is #NUM! in Excel too
  return numResult(r);
}

def('ABS', 'math', 1, 1, 'number', 'Absolute value of a number.', num1(Math.abs), L);
def('SIGN', 'math', 1, 1, 'number', 'Sign of a number: 1, 0 or -1.', num1(x => (x > 0 ? 1 : x < 0 ? -1 : 0)), L);
def('SQRT', 'math', 1, 1, 'number', 'Positive square root.', num1(x => (x < 0 ? ERR.NUM : Math.sqrt(x))), L);
def('SQRTPI', 'math', 1, 1, 'number', 'Square root of (number × π).', num1(x => (x < 0 ? ERR.NUM : Math.sqrt(x * Math.PI))), L);
def('EXP', 'math', 1, 1, 'number', 'e raised to a power.', num1(Math.exp), L);
def('LN', 'math', 1, 1, 'number', 'Natural logarithm.', num1(x => (x <= 0 ? ERR.NUM : Math.log(x))), L);
def('LOG10', 'math', 1, 1, 'number', 'Base-10 logarithm.', num1(x => (x <= 0 ? ERR.NUM : Math.log10(x))), L);
def('LOG', 'math', 1, 2, 'number, [base]', 'Logarithm to a base (default 10).', num2((x, b) => (x <= 0 || b <= 0 ? ERR.NUM : b === 1 ? ERR.DIV0 : Math.log(x) / Math.log(b)), 10), L);
def('POWER', 'math', 2, 2, 'number, power', 'Number raised to a power.', num2(power), L);
def('PI', 'math', 0, 0, '', 'The value of π.', () => Math.PI);
def('INT', 'math', 1, 1, 'number', 'Round down to the nearest integer.', num1(x => fl(x)), L);
def('TRUNC', 'math', 1, 2, 'number, [num_digits]', 'Truncate to a number of digits.', num2((x, d) => roundDown(x, Math.trunc(d)), 0), L);
def('ROUND', 'math', 2, 2, 'number, num_digits', 'Round half away from zero.', num2((x, d) => roundHalfAway(x, Math.trunc(d))), L);
def('ROUNDUP', 'math', 2, 2, 'number, num_digits', 'Round away from zero.', num2((x, d) => roundUp(x, Math.trunc(d))), L);
def('ROUNDDOWN', 'math', 2, 2, 'number, num_digits', 'Round toward zero.', num2((x, d) => roundDown(x, Math.trunc(d))), L);
def('MROUND', 'math', 2, 2, 'number, multiple', 'Round to the nearest multiple.', num2((x, m) => {
  if (m === 0) return 0;
  if (x * m < 0) return ERR.NUM;
  return roundHalfAway(x / m, 0) * m;
}), L);
def('CEILING', 'math', 1, 2, 'number, [significance]', 'Round up to a multiple of significance.', num2((x, s) => {
  if (s === 0) return 0;
  if (x > 0 && s < 0) return ERR.NUM;
  return ce(x / s) * s;
}, 1), L);
def('FLOOR', 'math', 1, 2, 'number, [significance]', 'Round down to a multiple of significance.', num2((x, s) => {
  if (s === 0) return x === 0 ? 0 : ERR.DIV0;
  if (x > 0 && s < 0) return ERR.NUM;
  return fl(x / s) * s;
}, 1), L);
const ceilMath = (x: number, s: number, mode: number) => {
  s = Math.abs(s); if (s === 0) return 0;
  if (x >= 0) return ce(x / s) * s;
  return mode ? -ce(-x / s) * s : -fl(-x / s) * s;
};
const floorMath = (x: number, s: number, mode: number) => {
  s = Math.abs(s); if (s === 0) return 0;
  if (x >= 0) return fl(x / s) * s;
  return mode ? -fl(-x / s) * s : -ce(-x / s) * s;
};
def('CEILING.MATH', 'math', 1, 3, 'number, [significance], [mode]', 'Round up to a multiple; mode controls negatives.', a => {
  const x = N(a[0]), s = NO(a[1], 1), m = NO(a[2], 0); const e = firstErr(x, s, m); if (e) return e;
  return ceilMath(x as number, s as number, m as number);
}, { ...L, future: true });
def('FLOOR.MATH', 'math', 1, 3, 'number, [significance], [mode]', 'Round down to a multiple; mode controls negatives.', a => {
  const x = N(a[0]), s = NO(a[1], 1), m = NO(a[2], 0); const e = firstErr(x, s, m); if (e) return e;
  return floorMath(x as number, s as number, m as number);
}, { ...L, future: true });
def('CEILING.PRECISE', 'math', 1, 2, 'number, [significance]', 'Round up regardless of sign.', num2((x, s) => ceilMath(x, s, 0), 1), { ...L, future: true });
alias('ISO.CEILING', 'CEILING.PRECISE');
def('FLOOR.PRECISE', 'math', 1, 2, 'number, [significance]', 'Round down regardless of sign.', num2((x, s) => floorMath(x, s, 0), 1), { ...L, future: true });
def('EVEN', 'math', 1, 1, 'number', 'Round away from zero to an even integer.', num1(x => { const r = ce(Math.abs(x) / 2) * 2; return x < 0 ? -r : r; }), L);
def('ODD', 'math', 1, 1, 'number', 'Round away from zero to an odd integer.', num1(x => { let r = ce(Math.abs(x)); if (r % 2 === 0) r += 1; return x < 0 ? -r : r; }), L);
def('MOD', 'math', 2, 2, 'number, divisor', 'Remainder with the sign of the divisor.', num2((n, d) => {
  if (d === 0) return ERR.DIV0;
  const r = n - d * Math.floor(n / d);
  return Math.abs(r - d) < Math.abs(d) * 1e-15 ? 0 : Number(r.toPrecision(15));
}), L);
def('QUOTIENT', 'math', 2, 2, 'numerator, denominator', 'Integer portion of a division.', num2((n, d) => (d === 0 ? ERR.DIV0 : Math.trunc(n / d))), L);

function fact(n: number): number { if (n < 0) return NaN; n = Math.trunc(n); let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }
def('FACT', 'math', 1, 1, 'number', 'Factorial.', num1(x => (x < 0 ? ERR.NUM : x > 170 ? ERR.NUM : fact(x))), L);
def('FACTDOUBLE', 'math', 1, 1, 'number', 'Double factorial.', num1(x => { if (x < -1) return ERR.NUM; let r = 1; for (let i = Math.trunc(x); i > 1; i -= 2) r *= i; return r; }), L);
def('COMBIN', 'math', 2, 2, 'number, number_chosen', 'Number of combinations.', num2((n, k) => { n = Math.trunc(n); k = Math.trunc(k); return n < 0 || k < 0 || n < k ? ERR.NUM : st.combin(n, k); }), L);
def('COMBINA', 'math', 2, 2, 'number, number_chosen', 'Combinations with repetition.', num2((n, k) => { n = Math.trunc(n); k = Math.trunc(k); if (n < 0 || k < 0 || (n === 0 && k > 0)) return ERR.NUM; return k === 0 ? 1 : st.combin(n + k - 1, k); }), { ...L, future: true });
def('MULTINOMIAL', 'math', 1, 255, 'number1, ...', 'Multinomial coefficient.', (a, f) => {
  const xs = nums(a, f); if (isErr(xs)) return xs;
  let s = 0, r = 1;
  for (const x0 of xs) { const x = Math.trunc(x0); if (x < 0) return ERR.NUM; for (let i = 1; i <= x; i++) { s++; r = (r * s) / i; } }
  return Math.round(r);
});

const gcd2 = (a: number, b: number): number => { while (b) [a, b] = [b, a % b]; return a; };
def('GCD', 'math', 1, 255, 'number1, ...', 'Greatest common divisor.', (a, f) => {
  const xs = nums(a, f); if (isErr(xs)) return xs;
  let g = 0; for (const x of xs) { if (x < 0) return ERR.NUM; g = gcd2(g, Math.trunc(x)); } return g;
});
def('LCM', 'math', 1, 255, 'number1, ...', 'Least common multiple.', (a, f) => {
  const xs = nums(a, f); if (isErr(xs)) return xs;
  let l = 1; for (const x0 of xs) { const x = Math.trunc(x0); if (x < 0) return ERR.NUM; if (x === 0) return 0; l = (l * x) / gcd2(l, x); } return l;
});

// Trig
def('SIN', 'math', 1, 1, 'number', 'Sine (radians).', num1(Math.sin), L);
def('COS', 'math', 1, 1, 'number', 'Cosine (radians).', num1(Math.cos), L);
def('TAN', 'math', 1, 1, 'number', 'Tangent (radians).', num1(Math.tan), L);
def('ASIN', 'math', 1, 1, 'number', 'Arcsine.', num1(x => (Math.abs(x) > 1 ? ERR.NUM : Math.asin(x))), L);
def('ACOS', 'math', 1, 1, 'number', 'Arccosine.', num1(x => (Math.abs(x) > 1 ? ERR.NUM : Math.acos(x))), L);
def('ATAN', 'math', 1, 1, 'number', 'Arctangent.', num1(Math.atan), L);
def('ATAN2', 'math', 2, 2, 'x_num, y_num', 'Arctangent of x/y coordinates.', num2((x, y) => (x === 0 && y === 0 ? ERR.DIV0 : Math.atan2(y, x))), L);
def('SINH', 'math', 1, 1, 'number', 'Hyperbolic sine.', num1(Math.sinh), L);
def('COSH', 'math', 1, 1, 'number', 'Hyperbolic cosine.', num1(Math.cosh), L);
def('TANH', 'math', 1, 1, 'number', 'Hyperbolic tangent.', num1(Math.tanh), L);
def('ASINH', 'math', 1, 1, 'number', 'Inverse hyperbolic sine.', num1(Math.asinh), L);
def('ACOSH', 'math', 1, 1, 'number', 'Inverse hyperbolic cosine.', num1(x => (x < 1 ? ERR.NUM : Math.acosh(x))), L);
def('ATANH', 'math', 1, 1, 'number', 'Inverse hyperbolic tangent.', num1(x => (Math.abs(x) >= 1 ? ERR.NUM : Math.atanh(x))), L);
def('COT', 'math', 1, 1, 'number', 'Cotangent.', num1(x => (x === 0 ? ERR.DIV0 : 1 / Math.tan(x))), { ...L, future: true });
def('COTH', 'math', 1, 1, 'number', 'Hyperbolic cotangent.', num1(x => (x === 0 ? ERR.DIV0 : 1 / Math.tanh(x))), { ...L, future: true });
def('CSC', 'math', 1, 1, 'number', 'Cosecant.', num1(x => (x === 0 ? ERR.DIV0 : 1 / Math.sin(x))), { ...L, future: true });
def('CSCH', 'math', 1, 1, 'number', 'Hyperbolic cosecant.', num1(x => (x === 0 ? ERR.DIV0 : 1 / Math.sinh(x))), { ...L, future: true });
def('SEC', 'math', 1, 1, 'number', 'Secant.', num1(x => 1 / Math.cos(x)), { ...L, future: true });
def('SECH', 'math', 1, 1, 'number', 'Hyperbolic secant.', num1(x => 1 / Math.cosh(x)), { ...L, future: true });
def('ACOT', 'math', 1, 1, 'number', 'Arccotangent.', num1(x => Math.PI / 2 - Math.atan(x)), { ...L, future: true });
def('ACOTH', 'math', 1, 1, 'number', 'Inverse hyperbolic cotangent.', num1(x => (Math.abs(x) <= 1 ? ERR.NUM : 0.5 * Math.log((x + 1) / (x - 1)))), { ...L, future: true });
def('DEGREES', 'math', 1, 1, 'angle', 'Radians to degrees.', num1(x => (x * 180) / Math.PI), L);
def('RADIANS', 'math', 1, 1, 'angle', 'Degrees to radians.', num1(x => (x * Math.PI) / 180), L);

// Random
def('RAND', 'math', 0, 0, '', 'Random number in [0, 1).', (_a, f) => f.e.random(), { volatile: true });
def('RANDBETWEEN', 'math', 2, 2, 'bottom, top', 'Random integer between two numbers.', (a, f) => {
  const lo = N(a[0]), hi = N(a[1]); const e = firstErr(lo, hi); if (e) return e;
  const l = Math.ceil(lo as number), h = Math.floor(hi as number);
  if (l > h) return ERR.NUM;
  return l + Math.floor(f.e.random() * (h - l + 1));
}, { volatile: true, lift: 'all' });
def('RANDARRAY', 'math', 0, 5, '[rows], [columns], [min], [max], [integer]', 'Array of random numbers.', (a, f) => {
  const r = IO(a[0], 1), c = IO(a[1], 1), lo = NO(a[2], 0), hi = NO(a[3], 1), int = omitted(a[4]) ? false : B(a[4]);
  const e = firstErr(r, c, lo, hi, int); if (e) return e;
  if ((r as number) < 1 || (c as number) < 1 || (lo as number) > (hi as number)) return ERR.VALUE;
  const out = Matrix.fill(r as number, c as number, 0);
  for (const row of out.data) for (let j = 0; j < row.length; j++) {
    row[j] = int ? Math.ceil(lo as number) + Math.floor(f.e.random() * (Math.floor(hi as number) - Math.ceil(lo as number) + 1)) : (lo as number) + f.e.random() * ((hi as number) - (lo as number));
  }
  return out;
}, { volatile: true, future: true });
def('SEQUENCE', 'math', 1, 4, 'rows, [columns], [start], [step]', 'Array of sequential numbers.', a => {
  const r = I(a[0]), c = IO(a[1], 1), s = NO(a[2], 1), st2 = NO(a[3], 1);
  const e = firstErr(r, c, s, st2); if (e) return e;
  if ((r as number) < 1 || (c as number) < 1) return ERR.CALC;
  if ((r as number) * (c as number) > 4_000_000) return ERR.NUM;
  const out: Scalar[][] = [];
  let v = s as number;
  for (let i = 0; i < (r as number); i++) { const row: Scalar[] = []; for (let j = 0; j < (c as number); j++) { row.push(v); v += st2 as number; } out.push(row); }
  return new Matrix(out);
}, { future: true });

// Aggregates
def('SUM', 'math', 1, 255, 'number1, [number2], ...', 'Adds numbers.', (a, f) => {
  let s = 0; let err: CellError | null = null;
  eachValue(a, f, (v, direct) => {
    if (typeof v === 'number') { s += v; return; }
    if (v === null) return;
    if (v instanceof CellError) { err = v; return false; }
    if (direct) { const n = toNum(v); if (isErr(n)) { err = n; return false; } s += n; }
  });
  return err ?? s;
});
def('PRODUCT', 'math', 1, 255, 'number1, ...', 'Multiplies numbers.', (a, f) => {
  const xs = nums(a, f); if (isErr(xs)) return xs;
  if (!xs.length) return 0;
  let p = 1; for (const x of xs) p *= x; return numResult(p);
});
def('SUMSQ', 'math', 1, 255, 'number1, ...', 'Sum of squares.', (a, f) => { const xs = nums(a, f); if (isErr(xs)) return xs; let s = 0; for (const x of xs) s += x * x; return s; });

/** Same-shape numeric arrays for SUMPRODUCT/SUMX… (non-numbers → 0, errors propagate). */
function numericGrid(v: Value, f: Frame): { rows: number; cols: number; vals: number[] } | CellError {
  const m = M(v, f); if (isErr(m)) return m;
  const vals: number[] = [];
  for (const row of m.data) for (const x of row) { if (x instanceof CellError) return x; vals.push(typeof x === 'number' ? x : 0); }
  return { rows: m.rows, cols: m.cols, vals };
}
def('SUMPRODUCT', 'math', 1, 255, 'array1, [array2], ...', 'Sum of products of corresponding entries.', (a, f) => {
  const grids = [];
  for (const x of a) { const g = numericGrid(x, f); if (isErr(g)) return g; grids.push(g); }
  const { rows, cols } = grids[0];
  if (grids.some(g => g.rows !== rows || g.cols !== cols)) return ERR.VALUE;
  let s = 0;
  for (let i = 0; i < grids[0].vals.length; i++) { let p = 1; for (const g of grids) p *= g.vals[i]; s += p; }
  return s;
});
function pairSum(fn: (x: number, y: number) => number) {
  return (a: Value[], f: Frame) => {
    const ma = M(a[0], f), mb = M(a[1], f); if (isErr(ma)) return ma; if (isErr(mb)) return mb;
    if (ma.rows * ma.cols !== mb.rows * mb.cols) return ERR.NA;
    const xa = ma.data.flat(), xb = mb.data.flat();
    let s = 0;
    for (let i = 0; i < xa.length; i++) { const x = xa[i], y = xb[i]; if (x instanceof CellError) return x; if (y instanceof CellError) return y; if (typeof x === 'number' && typeof y === 'number') s += fn(x, y); }
    return s;
  };
}
def('SUMX2MY2', 'math', 2, 2, 'array_x, array_y', 'Sum of x²−y².', pairSum((x, y) => x * x - y * y));
def('SUMX2PY2', 'math', 2, 2, 'array_x, array_y', 'Sum of x²+y².', pairSum((x, y) => x * x + y * y));
def('SUMXMY2', 'math', 2, 2, 'array_x, array_y', 'Sum of (x−y)².', pairSum((x, y) => (x - y) ** 2));

// SUMIF / SUMIFS live in stat.ts with the rest of the criteria family.

// Matrices
function numMatrix(v: Value, f: Frame): number[][] | CellError {
  const m = M(v, f); if (isErr(m)) return m;
  const out: number[][] = [];
  for (const row of m.data) { const r: number[] = []; for (const x of row) { if (x instanceof CellError) return x; if (typeof x !== 'number') return ERR.VALUE; r.push(x); } out.push(r); }
  return out;
}
def('MMULT', 'math', 2, 2, 'array1, array2', 'Matrix product.', (a, f) => {
  const x = numMatrix(a[0], f), y = numMatrix(a[1], f); if (isErr(x)) return x; if (isErr(y)) return y;
  if (x[0].length !== y.length) return ERR.VALUE;
  return new Matrix(x.map(row => y[0].map((_, j) => row.reduce((s, v, k) => s + v * y[k][j], 0))));
});
function luDet(m: number[][]): number {
  const n = m.length, a = m.map(r => r.slice());
  let det = 1;
  for (let i = 0; i < n; i++) {
    let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(a[r][i]) > Math.abs(a[p][i])) p = r;
    if (a[p][i] === 0) return 0;
    if (p !== i) { [a[p], a[i]] = [a[i], a[p]]; det = -det; }
    det *= a[i][i];
    for (let r = i + 1; r < n; r++) { const k = a[r][i] / a[i][i]; for (let c = i; c < n; c++) a[r][c] -= k * a[i][c]; }
  }
  return det;
}
export function invertMatrix(m: number[][]): number[][] | null {
  const n = m.length, a = m.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let i = 0; i < n; i++) {
    let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(a[r][i]) > Math.abs(a[p][i])) p = r;
    if (Math.abs(a[p][i]) < 1e-300) return null;
    [a[p], a[i]] = [a[i], a[p]];
    const d = a[i][i]; for (let c = 0; c < 2 * n; c++) a[i][c] /= d;
    for (let r = 0; r < n; r++) if (r !== i) { const k = a[r][i]; if (k) for (let c = 0; c < 2 * n; c++) a[r][c] -= k * a[i][c]; }
  }
  return a.map(r => r.slice(n));
}
def('MDETERM', 'math', 1, 1, 'array', 'Matrix determinant.', (a, f) => {
  const m = numMatrix(a[0], f); if (isErr(m)) return m;
  if (m.length !== m[0].length) return ERR.VALUE;
  return Number(luDet(m).toPrecision(15));
});
def('MINVERSE', 'math', 1, 1, 'array', 'Matrix inverse.', (a, f) => {
  const m = numMatrix(a[0], f); if (isErr(m)) return m;
  if (m.length !== m[0].length) return ERR.VALUE;
  const inv = invertMatrix(m); if (!inv) return ERR.NUM;
  return new Matrix(inv.map(r => r.map(v => Number(v.toPrecision(15)))));
});
def('MUNIT', 'math', 1, 1, 'dimension', 'Identity matrix.', a => {
  const n = I(a[0]); if (isErr(n)) return n; if (n < 1) return ERR.VALUE;
  return new Matrix(Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))));
}, { future: true });

// SUBTOTAL / AGGREGATE
type Agg = (xs: number[], all: Scalar[], k?: number) => number | CellError;
const AGG: Record<number, Agg> = {
  1: xs => (xs.length ? st.mean(xs) : ERR.DIV0),
  2: xs => xs.length,
  3: (_xs, all) => all.filter(v => v !== null && v !== '').length,
  4: xs => (xs.length ? Math.max(...xs) : 0),
  5: xs => (xs.length ? Math.min(...xs) : 0),
  6: xs => { if (!xs.length) return 0; let p = 1; for (const x of xs) p *= x; return p; },
  7: xs => (xs.length < 2 ? ERR.DIV0 : Math.sqrt(st.varS(xs))),
  8: xs => (xs.length < 1 ? ERR.DIV0 : Math.sqrt(st.varP(xs))),
  9: xs => st.sum(xs),
  10: xs => (xs.length < 2 ? ERR.DIV0 : st.varS(xs)),
  11: xs => (xs.length < 1 ? ERR.DIV0 : st.varP(xs)),
  12: xs => (xs.length ? st.median(xs) : ERR.NUM),
  13: xs => { const m = st.modes(xs); return m.length ? m[0] : ERR.NA; },
  14: (xs, _a, k) => { const r = st.kth(xs, Math.ceil(k ?? NaN), true); return Number.isNaN(r) ? ERR.NUM : r; },
  15: (xs, _a, k) => { const r = st.kth(xs, Math.ceil(k ?? NaN), false); return Number.isNaN(r) ? ERR.NUM : r; },
  16: (xs, _a, k) => { const r = st.percentileInc(xs, k ?? NaN); return Number.isNaN(r) ? ERR.NUM : r; },
  17: (xs, _a, k) => { const q = Math.trunc(k ?? NaN); if (q < 0 || q > 4) return ERR.NUM; return st.percentileInc(xs, q / 4); },
  18: (xs, _a, k) => { const r = st.percentileExc(xs, k ?? NaN); return Number.isNaN(r) ? ERR.NUM : r; },
  19: (xs, _a, k) => { const q = Math.trunc(k ?? NaN); if (q <= 0 || q >= 4) return ERR.NUM; const r = st.percentileExc(xs, q / 4); return Number.isNaN(r) ? ERR.NUM : r; },
};

def('SUBTOTAL', 'math', 2, 255, 'function_num, ref1, ...', 'Subtotal that skips filtered rows (101–111 also skip hidden rows).', (a, f) => {
  const code = I(a[0], f); if (isErr(code)) return code;
  const base = code > 100 ? code - 100 : code;
  if (base < 1 || base > 11) return ERR.VALUE;
  const refs = a.slice(1);
  if (refs.some(r => !(r instanceof Ref))) return ERR.VALUE;
  const opts = { skipHidden: code > 100, skipFiltered: true, skipSubtotals: true };
  const xs: number[] = []; const all: Scalar[] = []; let err: CellError | null = null;
  eachValue(refs, f, v => { if (v instanceof CellError) { err = v; return false; } all.push(v); if (typeof v === 'number') xs.push(v); }, opts);
  if (err) return err;
  const r = AGG[base](xs, all);
  return typeof r === 'number' ? numResult(r) : r;
}, { usesHidden: true });

def('AGGREGATE', 'math', 3, 255, 'function_num, options, ref1, [k]', 'Aggregate that can ignore errors, hidden rows and nested subtotals.', (a, f) => {
  const code = I(a[0], f), opt = I(a[1], f); const e = firstErr(code, opt); if (e) return e;
  if ((code as number) < 1 || (code as number) > 19 || (opt as number) < 0 || (opt as number) > 7) return ERR.VALUE;
  const o = opt as number;
  const skipSubtotals = o <= 3, skipHidden = o === 1 || o === 3 || o === 5 || o === 7, ignoreErrors = o === 2 || o === 3 || o === 6 || o === 7;
  const takesK = (code as number) >= 14;
  const refs: Value[] = takesK ? [a[2]] : a.slice(2);
  let k: number | undefined;
  if (takesK) { if (a.length < 4) return ERR.VALUE; const kv = N(a[3], f); if (isErr(kv)) return kv; k = kv; }
  const xs: number[] = []; const all: Scalar[] = []; let err: CellError | null = null;
  eachValue(refs, f, v => {
    if (v instanceof CellError) { if (ignoreErrors) return; err = v; return false; }
    all.push(v); if (typeof v === 'number') xs.push(v);
  }, { skipHidden, skipFiltered: true, skipSubtotals });
  if (err) return err;
  const r = AGG[code as number](xs, all, k);
  return typeof r === 'number' ? numResult(r) : r;
}, { usesHidden: true });

// Number systems
const ROMAN: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
def('ROMAN', 'math', 1, 2, 'number, [form]', 'Arabic → Roman numeral (classic form).', a => {
  let n = N(a[0]); if (isErr(n)) return n; n = Math.trunc(n);
  if (n < 0 || n > 3999) return ERR.VALUE;
  let s = ''; for (const [v, r] of ROMAN) while (n >= v) { s += r; n -= v; } return s;
}, L);
def('ARABIC', 'math', 1, 1, 'text', 'Roman numeral → Arabic.', a => {
  const t = S(a[0]); if (isErr(t)) return t;
  let s = t.trim().toUpperCase(), neg = false; if (s.startsWith('-')) { neg = true; s = s.slice(1); }
  const val: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  for (let i = 0; i < s.length; i++) { const v = val[s[i]]; if (!v) return ERR.VALUE; const nx = val[s[i + 1]] ?? 0; total += v < nx ? -v : v; }
  return neg ? -total : total;
}, { ...L, future: true });
def('BASE', 'math', 2, 3, 'number, radix, [min_length]', 'Number → text in a base.', a => {
  const n = N(a[0]), r = I(a[1]), m = IO(a[2], 0); const e = firstErr(n, r, m); if (e) return e;
  if ((n as number) < 0 || (r as number) < 2 || (r as number) > 36) return ERR.NUM;
  return Math.trunc(n as number).toString(r as number).toUpperCase().padStart(m as number, '0');
}, { ...L, future: true });
def('DECIMAL', 'math', 2, 2, 'text, radix', 'Text in a base → number.', a => {
  const t = S(a[0]), r = I(a[1]); const e = firstErr(t, r); if (e) return e;
  if ((r as number) < 2 || (r as number) > 36) return ERR.NUM;
  const digits = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.slice(0, r as number);
  let v = 0; for (const ch of (t as string).toUpperCase()) { const d = digits.indexOf(ch); if (d < 0) return ERR.NUM; v = v * (r as number) + d; }
  return v;
}, { ...L, future: true });
def('SERIESSUM', 'math', 4, 4, 'x, n, m, coefficients', 'Sum of a power series.', (a, f) => {
  const x = N(a[0], f), n = N(a[1], f), m = N(a[2], f); const e = firstErr(x, n, m); if (e) return e;
  const cs = nums([a[3]], f); if (isErr(cs)) return cs;
  let s = 0; cs.forEach((c, i) => { s += c * Math.pow(x as number, (n as number) + i * (m as number)); }); return numResult(s);
});

export { OMITTED };
