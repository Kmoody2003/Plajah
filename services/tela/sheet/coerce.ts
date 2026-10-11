// coerce — Excel's type-coercion, comparison, and criteria rules.
//
// These are the quiet rules that make a spreadsheet feel "right": "3"+1 is 4,
// TRUE+1 is 2, a blank is 0 or "" depending on who asks, "abc"<1 is FALSE
// because text sorts after numbers, and COUNTIF(">=5") is a tiny query
// language. Every function file builds on this instead of improvising.

import { parseDateTime } from './dates';
import { CellError, ERR, Lambda, Matrix, OMITTED, Ref, type Scalar, type Value, isErr, round15 } from './values';

/** What a function sees as its context (the engine's evaluation frame). */
export interface Frame {
  e: EngineAccess;
  /** Host sheet index, row, col (0-based). */
  s: number;
  row: number;
  col: number;
  /** LET / LAMBDA variables in scope. */
  vars: Map<string, Value> | null;
}

/** The subset of the engine functions are allowed to touch. */
export interface EngineAccess {
  cellValue(sheet: number, row: number, col: number): Scalar;
  /** Values of a single-area ref. `clamp` trims to the sheet's used extent (aggregates). */
  refMatrix(ref: Ref, clamp?: boolean): Matrix;
  /** Filtered-out rows are always hidden; `manual` also counts user-hidden rows. */
  isRowHidden(sheet: number, row: number, manual: boolean): boolean;
  isFormulaCell(sheet: number, row: number, col: number): boolean;
  formulaText(sheet: number, row: number, col: number): string | null;
  /** True when the cell's formula is itself a SUBTOTAL/AGGREGATE (they skip each other). */
  isSubtotalCell(sheet: number, row: number, col: number): boolean;
  sheetIndex(name: string): number;
  sheetName(index: number): string;
  sheetCount(): number;
  numFmtAt(sheet: number, row: number, col: number): string;
  usedExtent(sheet: number): { r2: number; c2: number };
  /** INDIRECT: parse reference text relative to a frame. */
  parseRef(text: string, a1: boolean, f: Frame): Ref | CellError;
  /** Serial date-time "now" (wall clock, injectable for tests). */
  now(): number;
  random(): number;
  /** Cached exact-match index for lookups (value key → first position). */
  lookupIndex(ref: Ref | Matrix, byCol: boolean, key: string): Map<string, number> | null;
}

// ── Number ↔ text ────────────────────────────────────────────────────────────

/** Excel's General number → text (used by &, TEXT conversions, CONCAT). */
export function numberToText(n: number): string {
  if (!Number.isFinite(n)) return '#NUM!';
  if (n === 0) return '0';
  const a = Math.abs(n);
  if (a >= 1e15 || a < 1e-9) {
    const [m, e] = n.toExponential(14).split('e');
    const mant = m.includes('.') ? m.replace(/0+$/, '').replace(/\.$/, '') : m;
    const ex = Number(e);
    return `${mant}E${ex < 0 ? '-' : '+'}${String(Math.abs(ex)).padStart(2, '0')}`;
  }
  const r = Number(n.toPrecision(15));
  let s = String(r);
  if (s.includes('e')) s = r.toFixed(Math.min(20, Math.max(0, -Math.floor(Math.log10(a)) + 15)));
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}

const NUM_TEXT = /^[-+]?(\d+(,\d{3})*(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/;

/** Text → number the way Excel's implicit coercion does ("1,000", "$5", "50%", dates, times). */
export function textToNumber(s: string): number | null {
  let t = s.trim();
  if (!t) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1).trim(); }
  let pct = false;
  if (t.endsWith('%')) { pct = true; t = t.slice(0, -1).trim(); }
  if (t.startsWith('$')) t = t.slice(1).trim();
  else if (/^-\$/.test(t)) t = '-' + t.slice(2);
  if (NUM_TEXT.test(t)) {
    let n = Number(t.replace(/,/g, ''));
    if (pct) n /= 100;
    return neg ? -n : n;
  }
  if (pct || neg) return null;
  const d = parseDateTime(t);
  return d ? d.serial : null;
}

export function toNum(v: Scalar): number | CellError {
  switch (typeof v) {
    case 'number': return v;
    case 'boolean': return v ? 1 : 0;
    case 'string': { const n = textToNumber(v); return n === null ? ERR.VALUE : n; }
    default: return v === null ? 0 : (v as CellError);
  }
}

export function toStr(v: Scalar): string | CellError {
  switch (typeof v) {
    case 'string': return v;
    case 'number': return numberToText(v);
    case 'boolean': return v ? 'TRUE' : 'FALSE';
    default: return v === null ? '' : (v as CellError);
  }
}

export function toBool(v: Scalar): boolean | CellError {
  switch (typeof v) {
    case 'boolean': return v;
    case 'number': return v !== 0;
    case 'string': { const u = v.trim().toUpperCase(); if (u === 'TRUE') return true; if (u === 'FALSE') return false; return ERR.VALUE; }
    default: return v === null ? false : (v as CellError);
  }
}

/** A finite number or #NUM!. */
export const numResult = (n: number): number | CellError => (Number.isFinite(n) ? n : ERR.NUM);

// ── Reference / array → scalar ───────────────────────────────────────────────

/** Implicit intersection: a multi-cell ref picks the host row/col, else #VALUE!. */
export function scalarOf(v: Value, f: Frame): Scalar {
  if (v === null || typeof v !== 'object') return v === OMITTED ? null : (v as Scalar);
  if (v instanceof CellError) return v;
  if (v instanceof Ref) {
    const a = v.areas[0];
    if (v.areas.length !== 1) return ERR.VALUE;
    if (a.r1 === a.r2 && a.c1 === a.c2) return v.ext ? v.sheet === -1 ? f.e.refMatrix(v).get(0, 0) : ERR.REF : f.e.cellValue(v.sheet, a.r1, a.c1);
    if (v.ext) return ERR.VALUE;
    if (a.c1 === a.c2 && f.row >= a.r1 && f.row <= a.r2 && v.sheet === f.s) return f.e.cellValue(v.sheet, f.row, a.c1);
    if (a.r1 === a.r2 && f.col >= a.c1 && f.col <= a.c2 && v.sheet === f.s) return f.e.cellValue(v.sheet, a.r1, f.col);
    return ERR.VALUE;
  }
  if (v instanceof Matrix) return v.rows ? v.data[0][0] : ERR.VALUE;
  if (v instanceof Lambda) return ERR.CALC;
  return ERR.VALUE;
}

/** Ref → its values; Matrix as-is; Scalar → 1×1. */
export function toMatrix(v: Value, f: Frame): Matrix | CellError {
  if (v instanceof Matrix) return v;
  if (v instanceof Ref) { if (v.areas.length !== 1) return ERR.VALUE; return f.e.refMatrix(v); }
  if (v instanceof Lambda) return ERR.CALC;
  if (v === OMITTED) return new Matrix([[null]]);
  return new Matrix([[v as Scalar]]);
}

/** True when a value spans more than one cell (would broadcast). */
export function isMulti(v: Value): boolean {
  if (v instanceof Matrix) return v.rows * v.cols > 1;
  if (v instanceof Ref) return v.areas.length > 1 || !v.isCell;
  return false;
}

// ── Iteration for aggregates ─────────────────────────────────────────────────

/**
 * Walk every value of every argument. `direct` is true for literal scalar args
 * (Excel treats those differently from values found in references/arrays).
 * Return false from `cb` to stop early. Multi-area refs (unions) are walked area by area.
 */
export function eachValue(args: Value[], f: Frame, cb: (v: Scalar, direct: boolean, sheet: number, row: number, col: number) => boolean | void, opts: { clamp?: boolean; skipHidden?: boolean; skipFiltered?: boolean; skipSubtotals?: boolean } = {}): void {
  for (const a of args) {
    if (a === OMITTED) continue;
    if (a instanceof Ref) {
      for (const area of a.areas) {
        const m = f.e.refMatrix(new Ref(a.sheet, [area], a.ext), opts.clamp !== false);
        for (let r = 0; r < m.rows; r++) {
          const row = area.r1 + r;
          if ((opts.skipHidden || opts.skipFiltered) && !a.ext && f.e.isRowHidden(a.sheet, row, !!opts.skipHidden)) continue;
          const rowData = m.data[r];
          for (let c = 0; c < rowData.length; c++) {
            if (opts.skipSubtotals && !a.ext && f.e.isSubtotalCell(a.sheet, row, area.c1 + c)) continue;
            if (cb(rowData[c], false, a.sheet, row, area.c1 + c) === false) return;
          }
        }
      }
    } else if (a instanceof Matrix) {
      for (const row of a.data) for (const v of row) if (cb(v, false, -1, -1, -1) === false) return;
    } else if (a instanceof Lambda) {
      if (cb(ERR.CALC, true, -1, -1, -1) === false) return;
    } else if (cb(a as Scalar, true, -1, -1, -1) === false) return;
  }
}

export interface NumCollectOpts {
  /** 'A' functions: text in refs counts as 0, logicals as 1/0. */
  aMode?: boolean;
  skipHidden?: boolean;
  skipFiltered?: boolean;
  skipSubtotals?: boolean;
  /** Ignore errors instead of propagating (AGGREGATE option 6). */
  ignoreErrors?: boolean;
}

/** SUM-style numeric collection with Excel's direct-vs-reference rules. */
export function collectNums(args: Value[], f: Frame, opts: NumCollectOpts = {}): number[] | CellError {
  const out: number[] = [];
  let err: CellError | null = null;
  eachValue(args, f, (v, direct) => {
    if (typeof v === 'number') { out.push(v); return; }
    if (v === null) return;
    if (v instanceof CellError) { if (opts.ignoreErrors) return; err = v; return false; }
    if (direct) {
      const n = toNum(v);
      if (isErr(n)) { err = n; return false; }
      out.push(n);
      return;
    }
    if (opts.aMode) out.push(typeof v === 'boolean' ? (v ? 1 : 0) : 0);
  }, { skipHidden: opts.skipHidden, skipFiltered: opts.skipFiltered, skipSubtotals: opts.skipSubtotals });
  return err ?? out;
}

/** Flatten all args into scalars (row-major), keeping blanks. */
export function flatScalars(args: Value[], f: Frame, clamp = false): Scalar[] {
  const out: Scalar[] = [];
  eachValue(args, f, v => { out.push(v); }, { clamp });
  return out;
}

// ── Comparison ───────────────────────────────────────────────────────────────

const typeRank = (v: Scalar) => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : typeof v === 'boolean' ? 2 : 3);

/**
 * Excel comparison: numbers < text < logicals; text is case-insensitive; a
 * blank adopts the other side's type (0, "", FALSE). Returns -1/0/1.
 */
export function compareScalars(a: Scalar, b: Scalar): number {
  if (a === null && b === null) return 0;
  if (a === null) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0;
  if (b === null) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
  const ta = typeRank(a), tb = typeRank(b);
  if (ta !== tb) return ta < tb ? -1 : 1;
  if (typeof a === 'number') { const x = round15(a), y = round15(b as number); return x < y ? -1 : x > y ? 1 : 0; }
  if (typeof a === 'string') {
    const x = a.toLowerCase(), y = (b as string).toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  }
  if (typeof a === 'boolean') return a === b ? 0 : a ? 1 : -1;
  return 0;
}

/** Sort comparator for SORT / range sort: numbers < text < logicals < errors < blanks (always last). */
export function sortCompare(a: Scalar, b: Scalar, caseSensitive = false): number {
  const rank = (v: Scalar) => (v === null || v === '' ? 5 : typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : typeof v === 'boolean' ? 2 : 3);
  const ra = rank(a), rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (typeof a === 'number') return a - (b as number);
  if (typeof a === 'string') {
    const x = caseSensitive ? a : a.toLowerCase(), y = caseSensitive ? (b as string) : (b as string).toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  }
  if (typeof a === 'boolean') return (a ? 1 : 0) - ((b as boolean) ? 1 : 0);
  return 0;
}

/** Key for exact-match hashing (case-insensitive text, typed). */
export function matchKey(v: Scalar): string {
  if (v === null) return 'b:';
  if (typeof v === 'number') return 'n:' + round15(v);
  if (typeof v === 'string') return 's:' + v.toLowerCase();
  if (typeof v === 'boolean') return v ? 'l:1' : 'l:0';
  return 'e:' + (v as CellError).code;
}

// ── Wildcards & criteria ─────────────────────────────────────────────────────

const reCache = new Map<string, RegExp>();
/** Excel wildcard pattern (* ? with ~ escape) → anchored case-insensitive RegExp. */
export function wildcardRegex(pattern: string): RegExp {
  let re = reCache.get(pattern);
  if (re) return re;
  let src = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '~' && i + 1 < pattern.length && '*?~'.includes(pattern[i + 1])) { src += '\\' + pattern[++i]; continue; }
    if (c === '*') src += '[\\s\\S]*';
    else if (c === '?') src += '[\\s\\S]';
    else src += c.replace(/[.+^${}()|[\]\\\/-]/g, '\\$&');
  }
  re = new RegExp('^' + src + '$', 'i');
  if (reCache.size > 500) reCache.clear();
  reCache.set(pattern, re);
  return re;
}
export const hasWildcard = (s: string) => /(^|[^~])[*?]/.test(s);

export type Criterion = (v: Scalar) => boolean;

/** COUNTIF/SUMIF/… criteria → predicate. */
export function makeCriterion(crit: Scalar): Criterion {
  if (crit === null) return makeCriterion(0); // blank criteria cell acts as 0 (Excel docs)
  if (typeof crit === 'number') { const c = round15(crit); return v => typeof v === 'number' ? round15(v) === c : typeof v === 'string' && textToNumber(v) === c && /^[-+\d.,$%() ]+$/.test(v.trim()); }
  if (typeof crit === 'boolean') return v => v === crit;
  if (crit instanceof CellError) return v => v instanceof CellError && v.code === crit.code;
  const s = crit;
  const m = /^(<=|>=|<>|<|>|=)?([\s\S]*)$/.exec(s)!;
  const op = m[1] ?? '';
  const rhs = m[2];
  if (op === '' && rhs === '') return v => v === null || v === '';
  if (op === '=' && rhs === '') return v => v === null || v === '';
  if (op === '<>' && rhs === '') return v => !(v === null || v === '');
  const n = textToNumber(rhs);
  const up = rhs.toUpperCase();
  const boolRhs = up === 'TRUE' ? true : up === 'FALSE' ? false : null;
  const errRhs = /^#/.test(rhs) ? up : null;
  if (op === '' || op === '=' || op === '<>') {
    let eq: Criterion;
    if (n !== null) eq = v => (typeof v === 'number' && round15(v) === round15(n)) || (typeof v === 'string' && v.trim() !== '' && textToNumber(v) === n);
    else if (boolRhs !== null) eq = v => v === boolRhs;
    else if (errRhs) eq = v => v instanceof CellError && v.code === errRhs;
    else if (hasWildcard(rhs)) { const re = wildcardRegex(rhs); eq = v => typeof v === 'string' && re.test(v); }
    else { const low = rhs.replace(/~([*?~])/g, '$1').toLowerCase(); eq = v => typeof v === 'string' && v.toLowerCase() === low; }
    return op === '<>' ? v => !eq(v) : eq;
  }
  // Ordering operators: numbers compare with numbers, text with text.
  const cmp = (c: number) => (op === '<' ? c < 0 : op === '<=' ? c <= 0 : op === '>' ? c > 0 : c >= 0);
  if (n !== null) return v => typeof v === 'number' && cmp(round15(v) - round15(n));
  if (boolRhs !== null) return v => typeof v === 'boolean' && cmp((v ? 1 : 0) - (boolRhs ? 1 : 0));
  const low = rhs.toLowerCase();
  return v => typeof v === 'string' && cmp(v.toLowerCase() < low ? -1 : v.toLowerCase() > low ? 1 : 0);
}

// ── Broadcasting ─────────────────────────────────────────────────────────────

/** Elementwise map over 1..n matrices with Excel's broadcast rules (1-row/1-col expand; misfit → #N/A). */
export function broadcast(ms: Matrix[], fn: (vals: Scalar[]) => Scalar): Matrix {
  let rows = 1, cols = 1;
  for (const m of ms) { rows = Math.max(rows, m.rows); cols = Math.max(cols, m.cols); }
  const out: Scalar[][] = new Array(rows);
  const vals: Scalar[] = new Array(ms.length);
  for (let r = 0; r < rows; r++) {
    const row: Scalar[] = new Array(cols);
    for (let c = 0; c < cols; c++) {
      let bad = false;
      for (let i = 0; i < ms.length; i++) {
        const m = ms[i];
        const rr = m.rows === 1 ? 0 : r, cc = m.cols === 1 ? 0 : c;
        if (rr >= m.rows || cc >= m.cols) { bad = true; break; }
        vals[i] = m.data[rr][cc];
      }
      row[c] = bad ? ERR.NA : fn(vals);
    }
    out[r] = row;
  }
  return new Matrix(out);
}
