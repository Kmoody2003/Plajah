// lookup — lookup & reference functions plus the dynamic-array shapers
// (FILTER, SORT, SORTBY, UNIQUE, TAKE, DROP, VSTACK, ...). INDEX/OFFSET/
// INDIRECT/XLOOKUP return live Refs when given refs, so `A1:INDEX(...)` and
// `SUM(OFFSET(...))` work like Excel. Exact-match lookups use a per-recalc
// hash index from the engine, so 100k VLOOKUPs into one table stay linear.

import { compareScalars, matchKey, scalarOf, sortCompare, toBool, toMatrix, wildcardRegex, hasWildcard, type Frame } from '../coerce';
import { colToLetters, quoteSheetName, MAX_COLS, MAX_ROWS } from '../address';
import { CellError, ERR, Matrix, OMITTED, Ref, type Scalar, type Value, isErr } from '../values';
import { B, BO, I, IO, N, S, SO, firstErr, omitted } from './helpers';
import { def } from './registry';

const M = (v: Value, f: Frame) => toMatrix(v, f);

// ── Core search ──────────────────────────────────────────────────────────────

// Per-matrix caches: range matrices are shared for a whole recalc pass (the
// engine's range cache), so 10k VLOOKUPs into one table build its key column
// and hash index once, not 10k times.
const lineCache = new WeakMap<Matrix, Map<string, Scalar[]>>();
const indexCache = new WeakMap<Scalar[], Map<string, number>>();
function lineOf(m: Matrix, vertical: boolean, i: number): Scalar[] {
  let per = lineCache.get(m);
  if (!per) { per = new Map(); lineCache.set(m, per); }
  const k = (vertical ? 'c' : 'r') + i;
  let v = per.get(k);
  if (!v) { v = vertical ? m.data.map(r => r[i]) : m.data[i] ?? []; per.set(k, v); }
  return v;
}
function indexOf(vec: Scalar[]): Map<string, number> {
  let idx = indexCache.get(vec);
  if (!idx) { idx = new Map(); for (let i = 0; i < vec.length; i++) { const k = matchKey(vec[i]); if (!idx.has(k)) idx.set(k, i); } indexCache.set(vec, idx); }
  return idx;
}

/** Vector of a lookup range (row or column) as scalars. */
function vectorOf(v: Value, f: Frame): Scalar[] | CellError {
  const m = M(v, f); if (isErr(m)) return m;
  if (m.rows === 1) return m.data[0];
  if (m.cols === 1) return lineOf(m, true, 0);
  return ERR.NA;
}

function sameType(a: Scalar, b: Scalar) {
  return (typeof a === 'number' && typeof b === 'number') || (typeof a === 'string' && typeof b === 'string') || (typeof a === 'boolean' && typeof b === 'boolean');
}

/** Exact match index (first or last), wildcard-aware for text. */
function exactFind(vec: Scalar[], x: Scalar, wildcards: boolean, reverse = false, _f?: Frame, _src?: Value, _byCol = false): number {
  if (typeof x === 'string' && wildcards && hasWildcard(x)) {
    const re = wildcardRegex(x);
    if (reverse) { for (let i = vec.length - 1; i >= 0; i--) { const v = vec[i]; if (typeof v === 'string' && re.test(v)) return i; } }
    else for (let i = 0; i < vec.length; i++) { const v = vec[i]; if (typeof v === 'string' && re.test(v)) return i; }
    return -1;
  }
  if (!reverse && vec.length > 16) { const i = indexOf(vec).get(matchKey(x)); return i === undefined ? -1 : i; }
  const k = matchKey(x);
  if (reverse) { for (let i = vec.length - 1; i >= 0; i--) if (matchKey(vec[i]) === k) return i; }
  else for (let i = 0; i < vec.length; i++) if (matchKey(vec[i]) === k) return i;
  return -1;
}

/** Binary search: last index whose value <= x (asc) — Excel's approximate MATCH/VLOOKUP. */
function approxAsc(vec: Scalar[], x: Scalar): number {
  let lo = 0, hi = vec.length - 1, res = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    let v = vec[mid];
    // Skip blanks / other types the way Excel's search degrades: walk to a comparable neighbour.
    if (!sameType(v, x)) {
      let j = mid - 1; while (j >= lo && !sameType(vec[j], x)) j--;
      if (j < lo) { lo = mid + 1; continue; }
      v = vec[j];
      if (compareScalars(v, x) <= 0) { res = j; lo = mid + 1; } else hi = j - 1;
      continue;
    }
    if (compareScalars(v, x) <= 0) { res = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return res;
}
/** Binary search for descending data: last index whose value >= x. */
function approxDesc(vec: Scalar[], x: Scalar): number {
  let lo = 0, hi = vec.length - 1, res = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = vec[mid];
    if (sameType(v, x) && compareScalars(v, x) >= 0) { res = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return res;
}

// ── VLOOKUP / HLOOKUP / LOOKUP / MATCH ───────────────────────────────────────

function vhlookup(a: Value[], f: Frame, vertical: boolean): Value {
  const x = scalarOf(a[0], f); if (x instanceof CellError) return x;
  const idx = I(a[2], f); if (isErr(idx)) return idx;
  const approx = BO(a[3], true, f); if (isErr(approx)) return approx;
  const table = a[1];
  const m = M(table, f); if (isErr(m)) return m;
  if (idx < 1) return ERR.VALUE;
  if (idx > (vertical ? m.cols : m.rows)) return ERR.REF;
  const key = lineOf(m, vertical, 0);
  let pos: number;
  if (approx) pos = approxAsc(key, x);
  else pos = exactFind(key, x, true, false, f, firstLine(table, vertical), vertical);
  if (pos < 0) return ERR.NA;
  return vertical ? m.data[pos][idx - 1] ?? null : m.data[idx - 1][pos] ?? null;
}
/** First column (vertical) / row of a table as a Ref/Matrix, for the lookup index cache. */
function firstLine(table: Value, vertical: boolean): Value {
  if (table instanceof Ref && table.single) {
    const a = table.single;
    return new Ref(table.sheet, [vertical ? { ...a, c2: a.c1 } : { ...a, r2: a.r1 }], table.ext);
  }
  if (table instanceof Matrix) return vertical ? new Matrix(table.data.map(r => [r[0]])) : new Matrix([table.data[0]]);
  return table;
}
const noBlank = (v: Scalar) => (v === null ? 0 : v);
def('VLOOKUP', 'lookup', 3, 4, 'lookup_value, table_array, col_index_num, [range_lookup]', 'Look down the first column and return a value from another column.', (a, f) => noBlank(vhlookup(a, f, true) as Scalar), { lift: [0, 2, 3] });
def('HLOOKUP', 'lookup', 3, 4, 'lookup_value, table_array, row_index_num, [range_lookup]', 'Look across the first row and return a value from another row.', (a, f) => noBlank(vhlookup(a, f, false) as Scalar), { lift: [0, 2, 3] });

def('MATCH', 'lookup', 2, 3, 'lookup_value, lookup_array, [match_type]', 'Position of a value in a range.', (a, f) => {
  const x = scalarOf(a[0], f); if (x instanceof CellError) return x;
  const t = IO(a[2], 1, f); if (isErr(t)) return t;
  const vec = vectorOf(a[1], f); if (isErr(vec)) return vec;
  let pos: number;
  if (t === 0) pos = exactFind(vec, x, true, false, f, a[1], true);
  else if (t > 0) pos = approxAsc(vec, x);
  else pos = approxDesc(vec, x);
  return pos < 0 ? ERR.NA : pos + 1;
}, { lift: [0, 2] });

def('LOOKUP', 'lookup', 2, 3, 'lookup_value, lookup_vector, [result_vector]', 'Approximate lookup in a vector or array.', (a, f) => {
  const x = scalarOf(a[0], f); if (x instanceof CellError) return x;
  const m = M(a[1], f); if (isErr(m)) return m;
  let key: Scalar[], res: Scalar[];
  if (omitted(a[2])) {
    const wide = m.cols > m.rows;
    key = wide ? m.data[0] : m.data.map(r => r[0]);
    res = wide ? m.data[m.rows - 1] : m.data.map(r => r[m.cols - 1]);
  } else {
    const k = vectorOf(a[1], f), r = vectorOf(a[2], f);
    if (isErr(k)) return k; if (isErr(r)) return r;
    key = k; res = r;
  }
  const pos = approxAsc(key, x);
  if (pos < 0) return ERR.NA;
  return pos < res.length ? noBlank(res[pos]) : ERR.NA;
}, { lift: [0] });

/** XMATCH/XLOOKUP search. mode: 0 exact, -1 next smaller, 1 next larger, 2 wildcard. search: 1, -1, 2, -2. */
function xsearch(vec: Scalar[], x: Scalar, mode: number, search: number, f: Frame, src: Value): number {
  if (search === 2 || search === -2) {
    // Binary search.
    const asc = search === 2;
    let lo = 0, hi = vec.length - 1, best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const c = compareScalars(vec[mid], x);
      if (c === 0) return mid;
      if ((c < 0) === asc) { if (mode === -1) best = mid; lo = mid + 1; } else { if (mode === 1) best = mid; hi = mid - 1; }
    }
    return mode === 0 || mode === 2 ? -1 : best;
  }
  const rev = search === -1;
  if (mode === 0 || mode === 2) return exactFind(vec, x, mode === 2, rev, f, src, true);
  let best = -1;
  const n = vec.length;
  for (let k = 0; k < n; k++) {
    const i = rev ? n - 1 - k : k;
    const v = vec[i];
    if (!sameType(v, x)) continue;
    const c = compareScalars(v, x);
    if (c === 0) return i;
    if (mode === -1 && c < 0 && (best < 0 || compareScalars(v, vec[best]) > 0)) best = i;
    if (mode === 1 && c > 0 && (best < 0 || compareScalars(v, vec[best]) < 0)) best = i;
  }
  return best;
}

def('XMATCH', 'lookup', 2, 4, 'lookup_value, lookup_array, [match_mode], [search_mode]', 'Position of a value with exact / nearest / wildcard modes.', (a, f) => {
  const x = scalarOf(a[0], f); if (x instanceof CellError) return x;
  const mode = IO(a[2], 0, f), search = IO(a[3], 1, f); const e = firstErr(mode, search); if (e) return e;
  const vec = vectorOf(a[1], f); if (isErr(vec)) return vec;
  const pos = xsearch(vec, x, mode as number, search as number, f, a[1]);
  return pos < 0 ? ERR.NA : pos + 1;
}, { lift: [0], future: true });

def('XLOOKUP', 'lookup', 3, 6, 'lookup_value, lookup_array, return_array, [if_not_found], [match_mode], [search_mode]', 'Search a range and return the matching item from another.', (a, f) => {
  const x = scalarOf(a[0], f); if (x instanceof CellError) return x;
  const mode = IO(a[4], 0, f), search = IO(a[5], 1, f); const e = firstErr(mode, search); if (e) return e;
  const lm = M(a[1], f); if (isErr(lm)) return lm;
  const vertical = lm.cols === 1;
  if (lm.rows !== 1 && lm.cols !== 1) return ERR.VALUE;
  const vec = lineOf(lm, vertical, 0);
  const pos = xsearch(vec, x, mode as number, search as number, f, a[1]);
  if (pos < 0) return omitted(a[3]) ? ERR.NA : a[3];
  const ret = a[2];
  if (ret instanceof Ref && ret.single) {
    const ar = ret.single;
    if ((vertical ? ar.r2 - ar.r1 + 1 : ar.c2 - ar.c1 + 1) !== vec.length) return ERR.VALUE;
    return new Ref(ret.sheet, [vertical ? { r1: ar.r1 + pos, r2: ar.r1 + pos, c1: ar.c1, c2: ar.c2 } : { r1: ar.r1, r2: ar.r2, c1: ar.c1 + pos, c2: ar.c1 + pos }], ret.ext);
  }
  const rm = M(ret, f); if (isErr(rm)) return rm;
  if ((vertical ? rm.rows : rm.cols) !== vec.length) return ERR.VALUE;
  return vertical ? new Matrix([rm.data[pos]]) : new Matrix(rm.data.map(r => [r[pos]]));
}, { lift: [0], future: true });

// ── INDEX / OFFSET / INDIRECT / ROW / COLUMN ─────────────────────────────────

def('INDEX', 'lookup', 2, 4, 'array, row_num, [column_num], [area_num]', 'Value or reference at a row/column position.', (a, f) => {
  const r = IO(a[1], 0, f), c = IO(a[2], 0, f), ar = IO(a[3], 1, f); const e = firstErr(r, c, ar); if (e) return e;
  let row = r as number, colN = c as number;
  const src = a[0];
  if (src instanceof Ref) {
    const area = src.areas[(ar as number) - 1]; if (!area) return ERR.REF;
    const h = area.r2 - area.r1 + 1, w = area.c2 - area.c1 + 1;
    if (omitted(a[2]) && h === 1 && w > 1) { colN = row; row = 1; }
    if (row < 0 || colN < 0 || row > h || colN > w) return ERR.REF;
    return new Ref(src.sheet, [{ r1: row ? area.r1 + row - 1 : area.r1, r2: row ? area.r1 + row - 1 : area.r2, c1: colN ? area.c1 + colN - 1 : area.c1, c2: colN ? area.c1 + colN - 1 : area.c2 }], src.ext);
  }
  const m = M(src, f); if (isErr(m)) return m;
  if (omitted(a[2]) && m.rows === 1 && m.cols > 1) { colN = row; row = 1; }
  if (row < 0 || colN < 0 || row > m.rows || colN > m.cols) return ERR.REF;
  if (row && colN) return m.data[row - 1][colN - 1];
  if (row) return new Matrix([m.data[row - 1]]);
  if (colN) return new Matrix(m.data.map(x => [x[colN - 1]]));
  return m;
}, { lift: [1, 2, 3] });

def('OFFSET', 'lookup', 3, 5, 'reference, rows, cols, [height], [width]', 'Reference shifted from a starting reference.', (a, f) => {
  const ref = a[0];
  if (!(ref instanceof Ref) || !ref.single) return ERR.VALUE;
  const ar = ref.single;
  const r = I(a[1], f), c = I(a[2], f), h = IO(a[3], ar.r2 - ar.r1 + 1, f), w = IO(a[4], ar.c2 - ar.c1 + 1, f);
  const e = firstErr(r, c, h, w); if (e) return e;
  if ((h as number) === 0 || (w as number) === 0) return ERR.REF;
  let r1 = ar.r1 + (r as number), c1 = ar.c1 + (c as number);
  let r2 = r1 + (h as number) - (Math.sign(h as number)), c2 = c1 + (w as number) - Math.sign(w as number);
  if (r2 < r1) [r1, r2] = [r2, r1];
  if (c2 < c1) [c1, c2] = [c2, c1];
  if (r1 < 0 || c1 < 0 || r2 >= MAX_ROWS || c2 >= MAX_COLS) return ERR.REF;
  return new Ref(ref.sheet, [{ r1, c1, r2, c2 }], ref.ext);
}, { volatile: true, dynamicRefs: true, lift: [1, 2, 3, 4] });

def('INDIRECT', 'lookup', 1, 2, 'ref_text, [a1]', 'Reference from text.', (a, f) => {
  const t = S(a[0], f); if (isErr(t)) return t;
  const a1 = BO(a[1], true, f); if (isErr(a1)) return a1;
  return f.e.parseRef(t, a1, f);
}, { volatile: true, dynamicRefs: true, lift: [0, 1] });

def('ROW', 'lookup', 0, 1, '[reference]', 'Row number of a reference.', (a, f) => {
  if (omitted(a[0])) return f.row + 1;
  const r = a[0];
  if (!(r instanceof Ref)) return ERR.VALUE;
  const ar = r.areas[0];
  if (ar.r1 === ar.r2) return ar.r1 + 1;
  return Matrix.col(Array.from({ length: ar.r2 - ar.r1 + 1 }, (_, i) => ar.r1 + i + 1));
});
def('COLUMN', 'lookup', 0, 1, '[reference]', 'Column number of a reference.', (a, f) => {
  if (omitted(a[0])) return f.col + 1;
  const r = a[0];
  if (!(r instanceof Ref)) return ERR.VALUE;
  const ar = r.areas[0];
  if (ar.c1 === ar.c2) return ar.c1 + 1;
  return Matrix.row(Array.from({ length: ar.c2 - ar.c1 + 1 }, (_, i) => ar.c1 + i + 1));
});
def('ROWS', 'lookup', 1, 1, 'array', 'Number of rows.', (a, f) => {
  const v = a[0];
  if (v instanceof Ref) return v.areas.length === 1 ? v.rows : ERR.REF;
  const m = M(v, f); return isErr(m) ? m : m.rows;
});
def('COLUMNS', 'lookup', 1, 1, 'array', 'Number of columns.', (a, f) => {
  const v = a[0];
  if (v instanceof Ref) return v.areas.length === 1 ? v.cols : ERR.REF;
  const m = M(v, f); return isErr(m) ? m : m.cols;
});
def('AREAS', 'lookup', 1, 1, 'reference', 'Number of areas in a reference.', a => (a[0] instanceof Ref ? a[0].areas.length : ERR.VALUE));
def('ADDRESS', 'lookup', 2, 5, 'row_num, column_num, [abs_num], [a1], [sheet_text]', 'Cell address as text.', a => {
  const r = I(a[0]), c = I(a[1]), ab = IO(a[2], 1), a1 = BO(a[3], true), sh = SO(a[4], ''); const e = firstErr(r, c, ab, a1, sh); if (e) return e;
  const row = r as number, cl = c as number, abs = ab as number;
  if (row < 1 || cl < 1 || row > MAX_ROWS || cl > MAX_COLS || abs < 1 || abs > 4) return ERR.VALUE;
  let ref: string;
  if (a1) ref = `${abs === 1 || abs === 3 ? '$' : ''}${colToLetters(cl - 1)}${abs === 1 || abs === 2 ? '$' : ''}${row}`;
  else ref = `R${abs === 1 || abs === 2 ? row : `[${row}]`}C${abs === 1 || abs === 3 ? cl : `[${cl}]`}`;
  return sh ? `${quoteSheetName(sh as string)}!${ref}` : ref;
}, { lift: 'all' });
def('HYPERLINK', 'lookup', 1, 2, 'link_location, [friendly_name]', 'Clickable link; shows the friendly name.', a => {
  if (!omitted(a[1])) return a[1] as Scalar;
  return a[0] as Scalar;
}, { lift: 'all' });
def('FORMULATEXT', 'lookup', 1, 1, 'reference', 'Formula of a cell as text.', (a, f) => {
  const r = a[0];
  if (!(r instanceof Ref) || r.ext) return ERR.NA;
  const ar = r.areas[0];
  const t = f.e.formulaText(r.sheet, ar.r1, ar.c1);
  return t === null ? ERR.NA : '=' + t;
}, { future: true });

def('TRANSPOSE', 'lookup', 1, 1, 'array', 'Swap rows and columns.', (a, f) => {
  const m = M(a[0], f); if (isErr(m)) return m;
  return new Matrix(Array.from({ length: m.cols }, (_, c) => m.data.map(r => noBlank(r[c]))));
});

// ── Dynamic-array shapers ────────────────────────────────────────────────────

def('FILTER', 'lookup', 2, 3, 'array, include, [if_empty]', 'Rows or columns that meet a condition.', (a, f) => {
  const m = M(a[0], f), inc = M(a[1], f); if (isErr(m)) return m; if (isErr(inc)) return inc;
  const byRow = inc.cols === 1 && inc.rows === m.rows;
  const byCol = inc.rows === 1 && inc.cols === m.cols && !byRow;
  if (!byRow && !byCol) return ERR.VALUE;
  const flags: boolean[] = [];
  for (const v of byRow ? inc.data.map(r => r[0]) : inc.data[0]) {
    if (v instanceof CellError) return v;
    const b = typeof v === 'string' ? ERR.VALUE : toBool(v); if (isErr(b)) return b;
    flags.push(b);
  }
  const out = byRow ? m.data.filter((_, i) => flags[i]) : m.data.map(r => r.filter((_, i) => flags[i]));
  if (!out.length || !out[0].length) return omitted(a[2]) ? ERR.CALC : a[2];
  return new Matrix(out);
}, { future: true });

function sortRows(rows: Scalar[][], keys: { idx: number; desc: boolean }[]): Scalar[][] {
  return rows.map((r, i) => ({ r, i })).sort((x, y) => {
    for (const k of keys) {
      const c = sortCompare(x.r[k.idx], y.r[k.idx]);
      if (c) return k.desc ? -c : c;
    }
    return x.i - y.i;
  }).map(o => o.r);
}
const transposeData = (d: Scalar[][]) => (d.length ? d[0].map((_, c) => d.map(r => r[c])) : d);

def('SORT', 'lookup', 1, 4, 'array, [sort_index], [sort_order], [by_col]', 'Sort an array.', (a, f) => {
  const m = M(a[0], f); if (isErr(m)) return m;
  const byCol = BO(a[3], false, f); if (isErr(byCol)) return byCol;
  const idxs = omitted(a[1]) ? [1] : (M(a[1], f) as Matrix).data.flat();
  const ords = omitted(a[2]) ? [1] : (M(a[2], f) as Matrix).data.flat();
  const keys: { idx: number; desc: boolean }[] = [];
  for (let i = 0; i < idxs.length; i++) {
    const ix = Math.trunc(Number(idxs[i])), od = Number(ords[Math.min(i, ords.length - 1)]);
    if (!(ix >= 1) || ix > (byCol ? m.rows : m.cols) || (od !== 1 && od !== -1)) return ERR.VALUE;
    keys.push({ idx: ix - 1, desc: od === -1 });
  }
  const data = byCol ? transposeData(m.data) : m.data;
  const sorted = sortRows(data, keys);
  return new Matrix(byCol ? transposeData(sorted) : sorted);
}, { future: true });

def('SORTBY', 'lookup', 2, 253, 'array, by_array1, [sort_order1], ...', 'Sort an array by other arrays.', (a, f) => {
  const m = M(a[0], f); if (isErr(m)) return m;
  const keys: { vals: Scalar[]; desc: boolean }[] = [];
  let byCol: boolean | null = null;
  for (let i = 1; i < a.length; i += 2) {
    const k = M(a[i], f); if (isErr(k)) return k;
    const isCol = k.cols === 1 && k.rows === m.rows;
    const isRow = k.rows === 1 && k.cols === m.cols && !isCol;
    if (!isCol && !isRow) return ERR.VALUE;
    if (byCol === null) byCol = isRow; else if (byCol !== isRow) return ERR.VALUE;
    const od = omitted(a[i + 1]) ? 1 : N(a[i + 1], f); if (isErr(od)) return od;
    if (od !== 1 && od !== -1) return ERR.VALUE;
    keys.push({ vals: isCol ? k.data.map(r => r[0]) : k.data[0], desc: od === -1 });
  }
  const n = byCol ? m.cols : m.rows;
  const order = Array.from({ length: n }, (_, i) => i).sort((x, y) => {
    for (const k of keys) { const c = sortCompare(k.vals[x], k.vals[y]); if (c) return k.desc ? -c : c; }
    return x - y;
  });
  return byCol ? new Matrix(m.data.map(r => order.map(i => r[i]))) : new Matrix(order.map(i => m.data[i]));
}, { future: true });

def('UNIQUE', 'lookup', 1, 3, 'array, [by_col], [exactly_once]', 'Distinct rows or columns.', (a, f) => {
  const m = M(a[0], f); if (isErr(m)) return m;
  const byCol = BO(a[1], false, f), once = BO(a[2], false, f); const e = firstErr(byCol, once); if (e) return e;
  const items = byCol ? transposeData(m.data) : m.data;
  const counts = new Map<string, { row: Scalar[]; n: number }>();
  const order: string[] = [];
  for (const row of items) {
    const k = row.map(matchKey).join('\u0001');
    const hit = counts.get(k);
    if (hit) hit.n++; else { counts.set(k, { row, n: 1 }); order.push(k); }
  }
  const out = order.map(k => counts.get(k)!).filter(x => !once || x.n === 1).map(x => x.row.map(noBlank));
  if (!out.length) return ERR.CALC;
  return new Matrix(byCol ? transposeData(out) : out);
}, { future: true });

def('TAKE', 'lookup', 2, 3, 'array, rows, [columns]', 'Rows/columns from the start or end.', (a, f) => {
  const m = M(a[0], f); if (isErr(m)) return m;
  const r = omitted(a[1]) ? m.rows : I(a[1], f), c = omitted(a[2]) ? m.cols : I(a[2], f); const e = firstErr(r, c); if (e) return e;
  if (r === 0 || c === 0) return ERR.CALC;
  const rows = (r as number) > 0 ? m.data.slice(0, r as number) : m.data.slice(r as number);
  return new Matrix(rows.map(x => ((c as number) > 0 ? x.slice(0, c as number) : x.slice(c as number))));
}, { future: true });
def('DROP', 'lookup', 2, 3, 'array, rows, [columns]', 'Array without rows/columns at the start or end.', (a, f) => {
  const m = M(a[0], f); if (isErr(m)) return m;
  const r = omitted(a[1]) ? 0 : I(a[1], f), c = omitted(a[2]) ? 0 : I(a[2], f); const e = firstErr(r, c); if (e) return e;
  const rows = (r as number) >= 0 ? m.data.slice(r as number) : m.data.slice(0, r as number);
  const out = rows.map(x => ((c as number) >= 0 ? x.slice(c as number) : x.slice(0, c as number)));
  if (!out.length || !out[0].length) return ERR.CALC;
  return new Matrix(out);
}, { future: true });
function pickLines(a: Value[], f: Frame, cols: boolean): Value {
  const m = M(a[0], f); if (isErr(m)) return m;
  const n = cols ? m.cols : m.rows;
  const picks: number[] = [];
  for (const v of a.slice(1)) {
    const mm = M(v, f); if (isErr(mm)) return mm;
    for (const x of mm.data.flat()) { const i = Math.trunc(Number(x)); if (!i || Math.abs(i) > n) return ERR.VALUE; picks.push(i > 0 ? i - 1 : n + i); }
  }
  return cols ? new Matrix(m.data.map(r => picks.map(i => r[i]))) : new Matrix(picks.map(i => m.data[i]));
}
def('CHOOSEROWS', 'lookup', 2, 255, 'array, row_num1, ...', 'Selected rows of an array.', (a, f) => pickLines(a, f, false), { future: true });
def('CHOOSECOLS', 'lookup', 2, 255, 'array, col_num1, ...', 'Selected columns of an array.', (a, f) => pickLines(a, f, true), { future: true });
def('EXPAND', 'lookup', 2, 4, 'array, rows, [columns], [pad_with]', 'Pad an array to a size.', (a, f) => {
  const m = M(a[0], f); if (isErr(m)) return m;
  const r = omitted(a[1]) ? m.rows : I(a[1], f), c = omitted(a[2]) ? m.cols : I(a[2], f); const e = firstErr(r, c); if (e) return e;
  if ((r as number) < m.rows || (c as number) < m.cols) return ERR.VALUE;
  const pad = omitted(a[3]) ? ERR.NA : scalarOf(a[3], f);
  return new Matrix(Array.from({ length: r as number }, (_, i) => Array.from({ length: c as number }, (_, j) => (i < m.rows && j < m.cols ? m.data[i][j] : pad))));
}, { future: true });
function stack(a: Value[], f: Frame, vertical: boolean): Value {
  const ms: Matrix[] = [];
  for (const v of a) { if (v === OMITTED) continue; const m = M(v, f); if (isErr(m)) return m; ms.push(m); }
  if (vertical) {
    const w = Math.max(...ms.map(m => m.cols));
    return new Matrix(ms.flatMap(m => m.data.map(r => [...r.map(noBlank), ...new Array(w - r.length).fill(ERR.NA)])));
  }
  const h = Math.max(...ms.map(m => m.rows));
  return new Matrix(Array.from({ length: h }, (_, i) => ms.flatMap(m => (i < m.rows ? m.data[i].map(noBlank) : new Array(m.cols).fill(ERR.NA)))));
}
def('VSTACK', 'lookup', 1, 254, 'array1, [array2], ...', 'Stack arrays vertically.', (a, f) => stack(a, f, true), { future: true });
def('HSTACK', 'lookup', 1, 254, 'array1, [array2], ...', 'Stack arrays horizontally.', (a, f) => stack(a, f, false), { future: true });
function toVector(a: Value[], f: Frame, asCol: boolean): Value {
  const m = M(a[0], f); if (isErr(m)) return m;
  const ignore = IO(a[1], 0, f), byCol = BO(a[2], false, f); const e = firstErr(ignore, byCol); if (e) return e;
  const data = byCol ? transposeData(m.data) : m.data;
  const vals = data.flat().filter(v => !(((ignore as number) & 1) && v === null) && !(((ignore as number) & 2) && v instanceof CellError));
  if (!vals.length) return ERR.CALC;
  return asCol ? Matrix.col(vals.map(noBlank)) : Matrix.row(vals.map(noBlank));
}
def('TOCOL', 'lookup', 1, 3, 'array, [ignore], [scan_by_column]', 'Array as a single column.', (a, f) => toVector(a, f, true), { future: true });
def('TOROW', 'lookup', 1, 3, 'array, [ignore], [scan_by_column]', 'Array as a single row.', (a, f) => toVector(a, f, false), { future: true });
function wrap(a: Value[], f: Frame, rowsFirst: boolean): Value {
  const m = M(a[0], f); if (isErr(m)) return m;
  if (m.rows !== 1 && m.cols !== 1) return ERR.VALUE;
  const n = I(a[1], f); if (isErr(n)) return n; if (n < 1) return ERR.NUM;
  const pad = omitted(a[2]) ? ERR.NA : scalarOf(a[2], f);
  const vals = m.data.flat();
  const groups = Math.ceil(vals.length / n);
  const grid = Array.from({ length: groups }, (_, g) => Array.from({ length: n }, (_, i) => (g * n + i < vals.length ? noBlank(vals[g * n + i]) : pad)));
  return new Matrix(rowsFirst ? grid : transposeData(grid));
}
def('WRAPROWS', 'lookup', 2, 3, 'vector, wrap_count, [pad_with]', 'Wrap a vector into rows.', (a, f) => wrap(a, f, true), { future: true });
def('WRAPCOLS', 'lookup', 2, 3, 'vector, wrap_count, [pad_with]', 'Wrap a vector into columns.', (a, f) => wrap(a, f, false), { future: true });

export { B };
