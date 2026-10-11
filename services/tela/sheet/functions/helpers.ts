// helpers — argument conversion shorthands for function implementations.
// Lifted parameters arrive as Scalars (or OMITTED); these collapse the
// "convert, check for error, return early" dance into one call each.

import { collectNums, scalarOf, toBool, toMatrix, toNum, toStr, numResult, type Frame, type NumCollectOpts } from '../coerce';
import { CellError, ERR, Matrix, OMITTED, Ref, type Scalar, type Value, isErr } from '../values';
import { currentFrame, type FnImpl } from './registry';

export const omitted = (v: Value | undefined) => v === undefined || v === OMITTED;

const sc = (v: Value | undefined, f?: Frame): Scalar => {
  if (v === undefined || v === OMITTED) return null;
  if (v !== null && typeof v === 'object' && !(v instanceof CellError)) { const fr = f ?? currentFrame; return fr ? scalarOf(v, fr) : v instanceof Matrix ? v.get(0, 0) : ERR.VALUE; }
  return v as Scalar;
};

export const N = (v: Value | undefined, f?: Frame): number | CellError => toNum(sc(v, f));
export const NO = (v: Value | undefined, d: number, f?: Frame): number | CellError => (omitted(v) ? d : toNum(sc(v, f)));
export const S = (v: Value | undefined, f?: Frame): string | CellError => toStr(sc(v, f));
export const SO = (v: Value | undefined, d: string, f?: Frame): string | CellError => (omitted(v) ? d : toStr(sc(v, f)));
export const B = (v: Value | undefined, f?: Frame): boolean | CellError => toBool(sc(v, f));
export const BO = (v: Value | undefined, d: boolean, f?: Frame): boolean | CellError => (omitted(v) ? d : toBool(sc(v, f)));
export const SC = sc;

/** Truncated integer argument. */
export const I = (v: Value | undefined, f?: Frame): number | CellError => { const n = N(v, f); return isErr(n) ? n : Math.trunc(n); };
export const IO = (v: Value | undefined, d: number, f?: Frame): number | CellError => (omitted(v) ? d : I(v, f));

export const M = (v: Value, f: Frame): Matrix | CellError => toMatrix(v, f);
export const nums = (args: Value[], f: Frame, o?: NumCollectOpts) => collectNums(args, f, o);
export { numResult, isErr, ERR, Matrix, Ref, OMITTED };

/** First error among already-converted values. */
export function firstErr(...vals: unknown[]): CellError | null {
  for (const v of vals) if (v instanceof CellError) return v;
  return null;
}

/** One-number function (lifted). */
export function num1(fn: (x: number) => number | CellError): FnImpl {
  return a => { const x = N(a[0]); if (isErr(x)) return x; const r = fn(x); return typeof r === 'number' ? numResult(r) : r; };
}
/** Two-number function (lifted); second may be optional with default. */
export function num2(fn: (x: number, y: number) => number | CellError, dflt?: number): FnImpl {
  return a => {
    const x = N(a[0]); if (isErr(x)) return x;
    const y = dflt === undefined ? N(a[1]) : NO(a[1], dflt); if (isErr(y)) return y;
    const r = fn(x, y);
    return typeof r === 'number' ? numResult(r) : r;
  };
}

/** Numeric values of a range/array where non-numbers are skipped, keeping position (for paired stats). */
export function numsAt(v: Value, f: Frame): (number | null)[] | CellError {
  const m = toMatrix(v, f);
  if (isErr(m)) return m;
  const out: (number | null)[] = [];
  for (const row of m.data) for (const x of row) {
    if (x instanceof CellError) return x;
    out.push(typeof x === 'number' ? x : null);
  }
  return out;
}

/** Paired numeric arrays (CORREL, SLOPE, …): same size, keep pairs where both are numbers. */
export function pairs(a: Value, b: Value, f: Frame): { x: number[]; y: number[] } | CellError {
  const xa = numsAt(a, f); if (isErr(xa)) return xa;
  const ya = numsAt(b, f); if (isErr(ya)) return ya;
  if (xa.length !== ya.length) return ERR.NA;
  const x: number[] = [], y: number[] = [];
  for (let i = 0; i < xa.length; i++) if (xa[i] !== null && ya[i] !== null) { x.push(xa[i]!); y.push(ya[i]!); }
  return { x, y };
}

/** Row-major scalars of a value. */
export function flat(v: Value, f: Frame): Scalar[] | CellError {
  const m = toMatrix(v, f);
  if (isErr(m)) return m;
  const out: Scalar[] = [];
  for (const row of m.data) for (const x of row) out.push(x);
  return out;
}

export const col = (vals: Scalar[]) => new Matrix(vals.map(v => [v]));
