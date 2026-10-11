// logical — IF family (lazy, array-aware), AND/OR/XOR/NOT, SWITCH, and the
// LAMBDA helpers (MAP, REDUCE, SCAN, BYROW, BYCOL, MAKEARRAY). LET and LAMBDA
// themselves are compiled by the engine (they bind names lexically); they are
// registered here only for metadata and arity.

import { broadcast, eachValue, isMulti, scalarOf, toBool, toMatrix, compareScalars, type Frame } from '../coerce';
import { CellError, ERR, Lambda, Matrix, OMITTED, type Scalar, type Value, isErr } from '../values';
import { B, I, IO, firstErr } from './helpers';
import { def, define, type Thunk } from './registry';

/** Collapse a value to a matrix (for array-aware branching). */
const asMatrix = (v: Value, f: Frame): Matrix | CellError => toMatrix(v, f);
const branch = (v: Value): Value => (v === OMITTED ? 0 : v);

define({
  name: 'IF', category: 'logical', min: 1, max: 3, sig: 'logical_test, [value_if_true], [value_if_false]', desc: 'Returns one value if a condition is TRUE and another if FALSE.',
  lazy: (a: Thunk[], f: Frame) => {
    const c = a[0]();
    if (isMulti(c)) {
      const cm = asMatrix(c, f); if (isErr(cm)) return cm;
      const tv = a.length > 1 ? branch(a[1]()) : true;
      const fv = a.length > 2 ? branch(a[2]()) : false;
      const tm = asMatrix(tv, f), fm = asMatrix(fv, f);
      if (isErr(tm)) return tm; if (isErr(fm)) return fm;
      return broadcast([cm, tm, fm], ([x, t, e]) => { if (x instanceof CellError) return x; const b = toBool(x); return isErr(b) ? b : b ? t : e; });
    }
    const s = scalarOf(c, f);
    if (s instanceof CellError) return s;
    const b = toBool(s); if (isErr(b)) return b;
    if (b) return a.length > 1 ? branch(a[1]()) : true;
    return a.length > 2 ? branch(a[2]()) : false;
  },
});

define({
  name: 'IFS', category: 'logical', min: 2, max: 254, sig: 'logical_test1, value_if_true1, ...', desc: 'First value whose condition is TRUE.', future: true,
  lazy: (a, f) => {
    if (a.length % 2) return ERR.VALUE;
    for (let i = 0; i < a.length; i += 2) {
      const s = scalarOf(a[i](), f);
      if (s instanceof CellError) return s;
      const b = toBool(s); if (isErr(b)) return b;
      if (b) return branch(a[i + 1]());
    }
    return ERR.NA;
  },
});

function errCatch(name: string, desc: string, test: (e: CellError) => boolean, future = false) {
  define({
    name, category: 'logical', min: 2, max: 2, sig: 'value, value_if_error', desc, future,
    lazy: (a, f) => {
      const v = a[0]();
      if (isMulti(v)) {
        const m = asMatrix(v, f); if (isErr(m)) return test(m) ? branch(a[1]()) : m;
        if (!m.data.some(r => r.some(x => x instanceof CellError && test(x)))) return v;
        const alt = branch(a[1]());
        const am = asMatrix(alt, f); if (isErr(am)) return am;
        return broadcast([m, am], ([x, y]) => (x instanceof CellError && test(x) ? y : x));
      }
      const s = v instanceof Matrix ? v.get(0, 0) : scalarOf(v, f);
      if (s instanceof CellError && test(s)) return branch(a[1]());
      return v instanceof Matrix ? v : s === null ? 0 : s;
    },
  });
}
errCatch('IFERROR', 'Value, or an alternative if it is any error.', () => true);
errCatch('IFNA', 'Value, or an alternative if it is #N/A.', e => e.code === '#N/A', true);

define({
  name: 'SWITCH', category: 'logical', min: 3, max: 254, sig: 'expression, value1, result1, ..., [default]', desc: 'Match an expression against values.', future: true,
  lazy: (a, f) => {
    const x = scalarOf(a[0](), f);
    if (x instanceof CellError) return x;
    let i = 1;
    for (; i + 1 < a.length; i += 2) {
      const v = scalarOf(a[i](), f);
      if (v instanceof CellError) return v;
      if (typeof v === typeof x && compareScalars(x, v) === 0) return branch(a[i + 1]());
    }
    return i < a.length ? branch(a[i]()) : ERR.NA;
  },
});

define({
  name: 'CHOOSE', category: 'lookup', min: 2, max: 255, sig: 'index_num, value1, [value2], ...', desc: 'Pick a value by position.',
  lazy: (a, f) => {
    const iv = a[0]();
    if (isMulti(iv)) {
      const im = asMatrix(iv, f); if (isErr(im)) return im;
      const opts = a.slice(1).map(t => asMatrix(branch(t()), f));
      for (const o of opts) if (isErr(o)) return o;
      const ms = opts as Matrix[];
      return broadcast([im, ...ms], ([i, ...vals]) => { if (i instanceof CellError) return i; const n = Math.trunc(typeof i === 'number' ? i : NaN); return n >= 1 && n <= vals.length ? vals[n - 1] : ERR.VALUE; });
    }
    const n = I(scalarOf(iv, f)); if (isErr(n)) return n;
    if (n < 1 || n >= a.length) return ERR.VALUE;
    return branch(a[n]());
  },
});

function logicFold(name: string, desc: string, fold: (acc: boolean, b: boolean) => boolean, init: boolean) {
  def(name, 'logical', 1, 255, 'logical1, [logical2], ...', desc, (a, f) => {
    let acc = init, seen = false; let err: CellError | null = null;
    eachValue(a, f, (v, direct) => {
      if (v instanceof CellError) { err = v; return false; }
      if (typeof v === 'boolean') { acc = fold(acc, v); seen = true; return; }
      if (typeof v === 'number') { acc = fold(acc, v !== 0); seen = true; return; }
      if (direct && typeof v === 'string') { const b = toBool(v); if (isErr(b)) { err = b; return false; } acc = fold(acc, b); seen = true; }
    });
    if (err) return err;
    return seen ? acc : ERR.VALUE;
  }, name === 'XOR' ? { future: true } : {});
}
logicFold('AND', 'TRUE if all arguments are TRUE.', (x, b) => x && b, true);
logicFold('OR', 'TRUE if any argument is TRUE.', (x, b) => x || b, false);
logicFold('XOR', 'TRUE if an odd number of arguments are TRUE.', (x, b) => x !== b, false);
def('NOT', 'logical', 1, 1, 'logical', 'Reverses a logical value.', a => { const b = B(a[0]); return isErr(b) ? b : !b; }, { lift: 'all' });
def('TRUE', 'logical', 0, 0, '', 'The logical value TRUE.', () => true);
def('FALSE', 'logical', 0, 0, '', 'The logical value FALSE.', () => false);

// LET / LAMBDA — compiled specially by the engine; these entries carry metadata only.
def('LET', 'logical', 3, 253, 'name1, value1, [name2, value2, ...], calculation', 'Name intermediate results inside a formula.', () => ERR.CALC, { future: true });
def('LAMBDA', 'logical', 1, 254, '[parameter1, ...], calculation', 'Create a reusable function.', () => ERR.CALC, { future: true });
def('ISOMITTED', 'logical', 1, 1, 'argument', 'TRUE if a LAMBDA argument was omitted.', a => a[0] === OMITTED, { future: true });

const needLambda = (v: Value, n: number): Lambda | CellError => (v instanceof Lambda ? (v.params.length < n ? ERR.VALUE : v) : ERR.VALUE);
const one = (v: Value, f: Frame): Scalar => {
  if (v instanceof Matrix) return v.rows * v.cols === 1 ? v.data[0][0] : ERR.CALC;
  return scalarOf(v, f);
};

def('MAP', 'logical', 2, 254, 'array1, [array2, ...], lambda', 'Apply a LAMBDA to each value.', (a, f) => {
  const lam = needLambda(a[a.length - 1], a.length - 1); if (isErr(lam)) return lam;
  const ms: Matrix[] = [];
  for (const x of a.slice(0, -1)) { const m = toMatrix(x, f); if (isErr(m)) return m; ms.push(m); }
  return broadcast(ms, vals => one(lam.invoke(vals), f));
}, { future: true });
def('REDUCE', 'logical', 3, 3, 'initial_value, array, lambda', 'Accumulate an array with a LAMBDA.', (a, f) => {
  const lam = needLambda(a[2], 2); if (isErr(lam)) return lam;
  const m = toMatrix(a[1], f); if (isErr(m)) return m;
  let acc: Value = a[0] === OMITTED ? 0 : a[0];
  for (const row of m.data) for (const v of row) acc = lam.invoke([acc, v]);
  return acc;
}, { future: true });
def('SCAN', 'logical', 3, 3, 'initial_value, array, lambda', 'Running accumulation as an array.', (a, f) => {
  const lam = needLambda(a[2], 2); if (isErr(lam)) return lam;
  const m = toMatrix(a[1], f); if (isErr(m)) return m;
  let acc: Value = a[0] === OMITTED ? 0 : a[0];
  return new Matrix(m.data.map(row => row.map(v => { acc = lam.invoke([acc, v]); return one(acc, f); })));
}, { future: true });
def('BYROW', 'logical', 2, 2, 'array, lambda', 'Apply a LAMBDA to each row.', (a, f) => {
  const lam = needLambda(a[1], 1); if (isErr(lam)) return lam;
  const m = toMatrix(a[0], f); if (isErr(m)) return m;
  return new Matrix(m.data.map(row => [one(lam.invoke([new Matrix([row])]), f)]));
}, { future: true });
def('BYCOL', 'logical', 2, 2, 'array, lambda', 'Apply a LAMBDA to each column.', (a, f) => {
  const lam = needLambda(a[1], 1); if (isErr(lam)) return lam;
  const m = toMatrix(a[0], f); if (isErr(m)) return m;
  return new Matrix([Array.from({ length: m.cols }, (_, c) => one(lam.invoke([new Matrix(m.data.map(r => [r[c]]))]), f))]);
}, { future: true });
def('MAKEARRAY', 'logical', 3, 3, 'rows, columns, lambda', 'Build an array by calling a LAMBDA per cell.', (a, f) => {
  const r = I(a[0], f), c = IO(a[1], 1, f); const e = firstErr(r, c); if (e) return e;
  const lam = needLambda(a[2], 2); if (isErr(lam)) return lam;
  if ((r as number) < 1 || (c as number) < 1) return ERR.VALUE;
  return new Matrix(Array.from({ length: r as number }, (_, i) => Array.from({ length: c as number }, (_, j) => one(lam.invoke([i + 1, j + 1]), f))));
}, { future: true });
