// fill — data-shaped operations: autofill series, sort, AutoFilter, and
// find / replace. They read computed values through a ValueSource (the live
// engine, or the model's literals/cached values when no engine is at hand).

import { parseA1, toA1, type RangeAddr } from './address';
import { compareScalars, sortCompare, wildcardRegex } from './coerce';
import { dateToSerial, daysInMonth, serialToYMD } from './dates';
import type { SheetEngine } from './engine';
import { cellEntriesA1, clean, getCell, withCells, type Cell, type FilterColumn, type FilterCondition, type FilterState, type Sheet, type SortKey, type Workbook } from './model';
import { formatValue, guessInput, isDateFormat } from './numfmt';
import { setCellInputs, toRange, writeCells, type OpResult, type Patch, type RangeLike } from './ops';
import { shiftRelative, transformFormula } from './serialize';
import { CellError, fromStored, type Scalar } from './values';

// ── Value sources ────────────────────────────────────────────────────────────

export interface ValueSource {
  value(sheetId: string, row: number, col: number): Scalar;
  text(sheetId: string, row: number, col: number): string;
}
export function engineSource(engine: SheetEngine): ValueSource {
  return {
    value: (s, r, c) => engine.getValue(s, r, c),
    text: (s, r, c) => engine.getDisplay(s, r, c, 255).text,
  };
}
export function modelSource(wb: Workbook): ValueSource {
  const cell = (s: string, r: number, c: number) => { const sh = wb.sheets.find(x => x.id === s); return sh ? getCell(sh.cells, r, c) : undefined; };
  const fmt = (s: string, cl?: Cell) => (cl?.s !== undefined ? wb.styles[cl.s]?.numFmt : undefined);
  const val = (s: string, r: number, c: number): Scalar => { const cl = cell(s, r, c); return cl?.f !== undefined ? fromStored(cl.c) : (cl?.v ?? null); };
  return { value: val, text: (s, r, c) => formatValue(val(s, r, c), fmt(s, cell(s, r, c)), 255).text };
}

const sheetOf = (wb: Workbook, id: string): [number, Sheet] => {
  const i = wb.sheets.findIndex(s => s.id === id || s.name.toLowerCase() === id.toLowerCase());
  if (i < 0) throw new Error(`No sheet ${id}`);
  return [i, wb.sheets[i]];
};

// ── Autofill ─────────────────────────────────────────────────────────────────

const MONTHS_L = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const DAYS_L = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
interface ListHit { list: string[]; idx: number; short: boolean; caseMode: 'upper' | 'lower' | 'title' }
function listMatch(t: string): ListHit | null {
  const low = t.trim().toLowerCase();
  const caseMode = t === t.toUpperCase() && t !== t.toLowerCase() ? 'upper' : t === t.toLowerCase() ? 'lower' : 'title';
  for (const list of [MONTHS_L, DAYS_L]) {
    let i = list.indexOf(low); if (i >= 0) return { list, idx: i, short: false, caseMode };
    i = list.findIndex(x => x.slice(0, 3) === low); if (i >= 0 && low.length === 3) return { list, idx: i, short: true, caseMode };
  }
  return null;
}
function listText(h: ListHit, idx: number): string {
  const n = h.list.length;
  let s = h.list[((idx % n) + n) % n];
  if (h.short) s = s.slice(0, 3);
  return h.caseMode === 'upper' ? s.toUpperCase() : h.caseMode === 'lower' ? s : s[0].toUpperCase() + s.slice(1);
}

/**
 * Series generator for one line of source cells. `i` is an index in source
 * coordinates: the source occupies 0..n-1, forward fill asks for n, n+1, …,
 * backward fill for -1, -2, …. Formulas are returned as-is (caller shifts them).
 */
function lineSeries(cells: (Cell | undefined)[], wb: Workbook): (i: number) => Cell | undefined {
  const n = cells.length;
  const mod = (i: number) => ((i % n) + n) % n;
  const fmtOf = (c?: Cell) => (c?.s !== undefined ? wb.styles[c.s]?.numFmt : undefined);
  const allNum = n > 0 && cells.every(c => c && c.f === undefined && typeof c.v === 'number');
  if (allNum) {
    const xs = cells.map(c => c!.v as number);
    const isDate = isDateFormat(fmtOf(cells[0]));
    const edge = (i: number) => cells[i < 0 ? 0 : n - 1]!;
    if (n === 1) return i => ({ ...cells[0]!, v: isDate ? xs[0] + i : xs[0] });
    if (isDate) {
      const a = serialToYMD(xs[0]), b = serialToYMD(xs[1]);
      const monthStep = (b.y - a.y) * 12 + (b.m - a.m);
      if (a.d === b.d && monthStep !== 0 && xs.every((x, k) => { const p = serialToYMD(x); return p.d === a.d && (p.y - a.y) * 12 + (p.m - a.m) === k * monthStep; })) {
        return i => {
          const total = a.y * 12 + (a.m - 1) + monthStep * i;
          const y = Math.floor(total / 12), m = (total % 12) + 1;
          return { ...edge(i), v: dateToSerial(y, m, Math.min(a.d, daysInMonth(y, m))) };
        };
      }
    }
    // Least-squares linear trend (exact for arithmetic sequences).
    const mx = (n - 1) / 2, my = xs.reduce((t, v) => t + v, 0) / n;
    let sxy = 0, sxx = 0; xs.forEach((y, k) => { sxy += (k - mx) * (y - my); sxx += (k - mx) ** 2; });
    const step = sxy / sxx, b0 = my - step * mx;
    return i => ({ ...edge(i), v: Number((b0 + step * i).toPrecision(15)) });
  }
  // Text series: "Item 3" → "Item 4"; months/weekdays; Q1..Q4.
  type TI = { kind: 'list'; lh: ListHit } | { kind: 'quarter'; p: string; n: number } | { kind: 'num'; pre: string; n: number; width: number; post: string } | null;
  const info: TI[] = cells.map(c => {
    if (!c || c.f !== undefined || typeof c.v !== 'string') return null;
    const lh = listMatch(c.v); if (lh) return { kind: 'list', lh };
    const q = /^([Qq])([1-4])$/.exec(c.v.trim()); if (q) return { kind: 'quarter', p: q[1], n: Number(q[2]) };
    const m = /^(.*?)(\d+)(\D*)$/.exec(c.v); if (m) return { kind: 'num', pre: m[1], n: Number(m[2]), width: m[2].length, post: m[3] };
    return null;
  });
  const first = info[0];
  const sameNum = n >= 2 && first?.kind === 'num' && info.every(t => t?.kind === 'num' && t.pre === first.pre && t.post === first.post);
  const sameList = n >= 2 && first?.kind === 'list' && info.every(t => t?.kind === 'list' && t.lh.list === first.lh.list);
  const numStep = sameNum ? ((info[n - 1] as { n: number }).n - (first as { n: number }).n) / (n - 1) : 1;
  const listStep = sameList ? (info[1] as { lh: ListHit }).lh.idx - (first as { lh: ListHit }).lh.idx : 1;
  const pad = (v: number, w: number) => String(Math.max(0, Math.round(v))).padStart(w, '0');
  return i => {
    const pos = mod(i), reps = Math.floor(i / n);
    const src = cells[pos];
    if (!src || src.f !== undefined) return src;
    const t = info[pos];
    if (!t) return src;
    if (sameNum && t.kind === 'num' && first?.kind === 'num') return { ...src, v: `${t.pre}${pad(first.n + numStep * i, t.width)}${t.post}` };
    if (sameList && t.kind === 'list' && first?.kind === 'list') return { ...src, v: listText(t.lh, first.lh.idx + listStep * i) };
    if (t.kind === 'list') return { ...src, v: listText(t.lh, t.lh.idx + reps) };
    if (t.kind === 'quarter') return { ...src, v: `${t.p}${((((t.n - 1 + reps) % 4) + 4) % 4) + 1}` };
    return { ...src, v: `${t.pre}${pad(t.n + reps, t.width)}${t.post}` };
  };
}

/**
 * Autofill: extend `src` to cover `target` (which must contain src and extend
 * it down, up, right or left). Numbers continue their linear trend, dates step
 * by day/month, "Item 1" → "Item 2", Jan → Feb, Mon → Tue, Q1 → Q2; formulas
 * copy with relative references shifted; everything else repeats.
 */
export function fillRange(wb: Workbook, sheetId: string, srcRange: RangeLike, targetRange: RangeLike): OpResult {
  const src = toRange(srcRange), tgt = toRange(targetRange);
  const [, sh] = sheetOf(wb, sheetId);
  const vertical = tgt.c1 === src.c1 && tgt.c2 === src.c2 && (tgt.r1 !== src.r1 || tgt.r2 !== src.r2);
  const horizontal = tgt.r1 === src.r1 && tgt.r2 === src.r2;
  if (!vertical && !horizontal) throw new Error('Fill target must extend the source in one direction');
  const changes: [string, Cell | undefined][] = [];
  const lines = vertical ? src.c2 - src.c1 + 1 : src.r2 - src.r1 + 1;
  const n = vertical ? src.r2 - src.r1 + 1 : src.c2 - src.c1 + 1;
  const lo = vertical ? tgt.r1 - src.r1 : tgt.c1 - src.c1;   // ≤ 0
  const hi = vertical ? tgt.r2 - src.r1 : tgt.c2 - src.c1;   // ≥ n-1
  for (let li = 0; li < lines; li++) {
    const at = (i: number): [number, number] => (vertical ? [src.r1 + i, src.c1 + li] : [src.r1 + li, src.c1 + i]);
    const cells = Array.from({ length: n }, (_, p) => { const [r, c] = at(p); return getCell(sh.cells, r, c); });
    const gen = lineSeries(cells, wb);
    for (let i = lo; i <= hi; i++) {
      if (i >= 0 && i < n) continue;
      const [tr, tc] = at(i);
      const pos = ((i % n) + n) % n;
      const [r0, c0] = at(pos);
      const sc = cells[pos];
      let out: Cell | undefined;
      if (sc?.f !== undefined) out = { ...sc, f: transformFormula(sc.f, x => shiftRelative(x, tr - r0, tc - c0)) };
      else out = gen(i);
      if (out) { out = { ...out }; delete out.c; }
      changes.push([toA1(tr, tc), out ? clean(out) : undefined]);
    }
  }
  return writeCells(wb, sheetId, changes, 'Fill');
}

// ── Sort ─────────────────────────────────────────────────────────────────────

export interface SortOptions { hasHeader?: boolean; values?: ValueSource }

/**
 * Sort the rows of a range by one or more columns (stable). Blanks sort last
 * either way; formulas move with their row (relative refs shift like a paste).
 */
export function sortRange(wb: Workbook, sheetId: string, range: RangeLike, keys: SortKey[], opts: SortOptions = {}): OpResult {
  const r = toRange(range);
  const [si, sh] = sheetOf(wb, sheetId);
  const src = opts.values ?? modelSource(wb);
  const start = r.r1 + (opts.hasHeader ? 1 : 0);
  const rows: number[] = [];
  for (let row = start; row <= r.r2; row++) rows.push(row);
  const keyVals = new Map<number, Scalar[]>();
  for (const row of rows) keyVals.set(row, keys.map(k => src.value(sh.id, row, k.col)));
  const order = rows.slice().sort((x, y) => {
    const a = keyVals.get(x)!, b = keyVals.get(y)!;
    for (let i = 0; i < keys.length; i++) {
      const blankA = a[i] === null || a[i] === '', blankB = b[i] === null || b[i] === '';
      if (blankA || blankB) { if (blankA && blankB) continue; return blankA ? 1 : -1; }
      const c = sortCompare(a[i], b[i], keys[i].caseSensitive);
      if (c) return keys[i].descending ? -c : c;
    }
    return x - y;
  });
  const writes: [number, number, Cell | undefined][] = [];
  order.forEach((from, i) => {
    const to = start + i;
    for (let col = r.c1; col <= r.c2; col++) {
      const c = getCell(sh.cells, from, col);
      writes.push([to, col, c && c.f !== undefined && to !== from ? { ...c, f: transformFormula(c.f, n => shiftRelative(n, to - from, 0)) } : c]);
    }
  });
  const after: Sheet = { ...sh, cells: withCells(sh.cells, writes), sort: clean({ range: `${toA1(r.r1, r.c1)}:${toA1(r.r2, r.c2)}`, keys, hasHeader: opts.hasHeader }) };
  const sheets = wb.sheets.slice(); sheets[si] = after;
  return { workbook: { ...wb, sheets }, patch: { label: 'Sort', sheets: [{ id: sh.id, before: sh, after }] } };
}

// ── AutoFilter ───────────────────────────────────────────────────────────────

function condTest(c: FilterCondition, v: Scalar, text: string): boolean {
  const blank = v === null || v === '';
  if (c.op === 'blank') return blank;
  if (c.op === 'notBlank') return !blank;
  const rhs = c.value ?? '';
  if (c.op === 'contains' || c.op === 'notContains' || c.op === 'beginsWith' || c.op === 'endsWith') {
    const t = text.toLowerCase(), q = String(rhs).toLowerCase();
    const hit = c.op === 'beginsWith' ? t.startsWith(q) : c.op === 'endsWith' ? t.endsWith(q) : String(rhs).match(/[*?]/) ? wildcardRegex(`*${rhs}*`).test(text) : t.includes(q);
    return c.op === 'notContains' ? !hit : hit;
  }
  const num = typeof rhs === 'number' ? rhs : Number(rhs);
  const rv: Scalar = typeof rhs === 'number' || (rhs !== '' && !Number.isNaN(num)) ? num : String(rhs);
  const cmp = compareScalars(v, rv);
  switch (c.op) {
    case 'eq': return typeof rv === 'string' && /[*?]/.test(rv) ? wildcardRegex(rv).test(text) : cmp === 0 || text.toLowerCase() === String(rhs).toLowerCase();
    case 'ne': return !(cmp === 0 || text.toLowerCase() === String(rhs).toLowerCase());
    case 'gt': return typeof v === typeof rv && cmp > 0;
    case 'gte': return typeof v === typeof rv && cmp >= 0;
    case 'lt': return typeof v === typeof rv && cmp < 0;
    case 'lte': return typeof v === typeof rv && cmp <= 0;
  }
  return true;
}

/** Rows (absolute) hidden by a filter state. Row 1 of the range is the header. */
export function computeFilteredRows(sheet: Sheet, filter: FilterState, src: ValueSource): number[] {
  const r = toRange(filter.range);
  const hidden: number[] = [];
  const tops = new Map<number, Set<number>>();
  for (const fc of filter.columns) {
    if (!fc.top) continue;
    const vals: [number, number][] = [];
    for (let row = r.r1 + 1; row <= r.r2; row++) { const v = src.value(sheet.id, row, fc.col); if (typeof v === 'number') vals.push([row, v]); }
    vals.sort((a, b) => (fc.top!.bottom ? a[1] - b[1] : b[1] - a[1]));
    const n = fc.top.percent ? Math.max(1, Math.floor((vals.length * fc.top.n) / 100)) : fc.top.n;
    tops.set(fc.col, new Set(vals.slice(0, n).map(x => x[0])));
  }
  for (let row = r.r1 + 1; row <= r.r2; row++) {
    let keep = true;
    for (const fc of filter.columns) {
      const v = src.value(sheet.id, row, fc.col);
      const text = src.text(sheet.id, row, fc.col);
      if (fc.values && !fc.values.includes(text)) { keep = false; break; }
      if (fc.conditions?.length) {
        const res = fc.conditions.map(c => condTest(c, v, text));
        if (!(fc.join === 'or' ? res.some(Boolean) : res.every(Boolean))) { keep = false; break; }
      }
      if (fc.top && !tops.get(fc.col)!.has(row)) { keep = false; break; }
    }
    if (!keep) hidden.push(row);
  }
  return hidden;
}

/** Set (or clear with null) the AutoFilter and recompute which rows it hides. */
export function setFilter(wb: Workbook, sheetId: string, filter: FilterState | null, values?: ValueSource): OpResult {
  const [si, sh] = sheetOf(wb, sheetId);
  const after: Sheet = { ...sh };
  if (!filter) { delete after.filter; delete after.filteredRows; }
  else { after.filter = clean(filter); after.filteredRows = computeFilteredRows(sh, filter, values ?? modelSource(wb)); }
  const sheets = wb.sheets.slice(); sheets[si] = after;
  return { workbook: { ...wb, sheets }, patch: { label: filter ? 'Filter' : 'Clear filter', sheets: [{ id: sh.id, before: sh, after }] } };
}
/** Re-apply the current filter (after data changed). */
export const reapplyFilter = (wb: Workbook, sheetId: string, values?: ValueSource) => {
  const [, sh] = sheetOf(wb, sheetId);
  return setFilter(wb, sheetId, sh.filter ?? null, values);
};
/** Distinct display values in a filter column (for the dropdown checklist). */
export function filterColumnValues(sheet: Sheet, filter: FilterState, col: number, src: ValueSource): string[] {
  const r = toRange(filter.range);
  const set = new Set<string>();
  for (let row = r.r1 + 1; row <= r.r2; row++) set.add(src.text(sheet.id, row, col));
  return [...set].sort((a, b) => sortCompare(a === '' ? null : a, b === '' ? null : b));
}
export type { FilterColumn };

// ── Find & replace ───────────────────────────────────────────────────────────

export interface FindOptions {
  matchCase?: boolean;
  /** Whole cell must match. */
  entireCell?: boolean;
  /** Search formula text (default) or displayed values. */
  lookIn?: 'formulas' | 'values';
  /** Restrict to one sheet. */
  sheetId?: string;
  /** Treat the query as a regular expression (otherwise Excel wildcards * ? ~). */
  regex?: boolean;
  values?: ValueSource;
}
export interface FindMatch { sheetId: string; a1: string; row: number; col: number; text: string }

function matcher(query: string, o: FindOptions): RegExp {
  let src: string;
  if (o.regex) src = query;
  else { const w = wildcardRegex(query).source.slice(1, -1); src = w; }
  if (o.entireCell) src = `^(?:${src})$`;
  return new RegExp(src, o.matchCase ? 'g' : 'gi');
}

/** All matches in row-major order per sheet. */
export function findAll(wb: Workbook, query: string, o: FindOptions = {}): FindMatch[] {
  if (!query) return [];
  const re = matcher(query, o);
  const out: FindMatch[] = [];
  const src = o.values ?? modelSource(wb);
  for (const sh of wb.sheets) {
    if (o.sheetId && sh.id !== o.sheetId) continue;
    const hits: FindMatch[] = [];
    for (const [a1, c] of cellEntriesA1(sh.cells)) {
      const a = parseA1(a1)!;
      const text = o.lookIn === 'values' ? src.text(sh.id, a.row, a.col) : c.f !== undefined ? '=' + c.f : c.v === undefined ? '' : typeof c.v === 'boolean' ? (c.v ? 'TRUE' : 'FALSE') : String(c.v);
      re.lastIndex = 0;
      if (text && re.test(text)) hits.push({ sheetId: sh.id, a1, row: a.row, col: a.col, text });
    }
    hits.sort((x, y) => x.row - y.row || x.col - y.col);
    out.push(...hits);
  }
  return out;
}

/** Replace in cell inputs (formulas and literals); edited literals are re-interpreted like typing. */
export function replaceAll(wb: Workbook, query: string, replacement: string, o: FindOptions = {}): OpResult & { count: number } {
  const matches = findAll(wb, query, { ...o, lookIn: 'formulas' });
  const re = matcher(query, o);
  const bySheet = new Map<string, FindMatch[]>();
  for (const m of matches) { const l = bySheet.get(m.sheetId) ?? []; l.push(m); bySheet.set(m.sheetId, l); }
  let cur = wb;
  const cells: NonNullable<Patch['cells']> = [];
  let count = 0;
  for (const [sid, list] of bySheet) {
    const inputs: [string, string][] = list.map(m => { re.lastIndex = 0; count++; return [m.a1, m.text.replace(re, o.regex ? replacement : replacement.replace(/\$/g, '$$$$'))]; });
    const res = setCellInputs(cur, sid, inputs, 'Replace');
    cur = res.workbook;
    cells.push(...(res.patch.cells ?? []));
  }
  return { workbook: cur, patch: { label: `Replace ${count}`, cells }, count };
}

export { guessInput, CellError };
export type { RangeAddr };
