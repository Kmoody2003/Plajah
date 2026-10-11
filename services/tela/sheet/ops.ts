// ops — pure workbook operations. Every op takes a Workbook and returns
// { workbook, patch }: a NEW workbook (structural sharing — untouched sheets
// and cells keep their identity, which is what SheetEngine.update() diffs on)
// and a Patch that undoes/redoes it. Cell-level ops produce cell-granular
// patches (safe to undo under concurrent edits to other cells); structural
// ops (insert/delete rows, sheet changes, sort) swap whole sheet objects.
// Nothing here ever writes `undefined` into the model (Firestore rejects it).

import { MAX_COLS, MAX_ROWS, parseA1, parseRange, rangeToA1, toA1, type CellAddr, type RangeAddr } from './address';
import type { Node } from './ast';
import { cellsInRange, clean, createSheet, forEachCell, getCell, internStyle, mergeStyle, newId, usedRange, withCells, type Cell, type CellGrid, type CellStyle, type ConditionalFormat, type DataValidation, type DefinedName, type Sheet, type Workbook } from './model';
import { guessInput } from './numfmt';
import { parseFormula } from './parser';
import { adjustForMove, adjustForStructural, deleteSheetRefs, renameSheetRefs, shiftRelative, toFormula, transformFormula, type StructuralEdit } from './serialize';
import { mapNode } from './ast';
import type { Scalar } from './values';
import { CellError } from './values';

// ── Patches ──────────────────────────────────────────────────────────────────

export interface CellChange { sheetId: string; a1: string; before?: Cell; after?: Cell }
export interface SheetChange { id: string; before: Sheet | null; after: Sheet | null }
export interface Patch {
  label: string;
  cells?: CellChange[];
  sheets?: SheetChange[];
  order?: { before: string[]; after: string[] };
  names?: { before: DefinedName[]; after: DefinedName[] };
  active?: { before: string; after: string };
}
export interface OpResult { workbook: Workbook; patch: Patch }

/** Apply a patch backwards (undo) or forwards (redo). */
export function applyPatch(wb: Workbook, patch: Patch, dir: 'undo' | 'redo'): Workbook {
  const pick = <T>(x: { before: T; after: T }) => (dir === 'undo' ? x.before : x.after);
  let sheets = wb.sheets.slice();
  if (patch.sheets) {
    for (const ch of patch.sheets) {
      const target = pick(ch);
      const i = sheets.findIndex(s => s.id === ch.id);
      if (target === null) { if (i >= 0) sheets.splice(i, 1); }
      else if (i >= 0) sheets[i] = target;
      else sheets.push(target);
    }
  } else if (patch.cells) {
    const bySheet = new Map<string, CellChange[]>();
    for (const c of patch.cells) { const l = bySheet.get(c.sheetId) ?? []; l.push(c); bySheet.set(c.sheetId, l); }
    sheets = sheets.map(s => {
      const list = bySheet.get(s.id); if (!list) return s;
      return { ...s, cells: withCells(s.cells, list.map(c => { const a = parseA1(c.a1)!; return [a.row, a.col, dir === 'undo' ? c.before : c.after] as [number, number, Cell | undefined]; })) };
    });
  }
  if (patch.order) {
    const order = pick(patch.order);
    sheets.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }
  let out: Workbook = { ...wb, sheets };
  if (patch.names) out = { ...out, names: pick(patch.names) };
  if (patch.active) out = { ...out, activeSheet: pick(patch.active) };
  if (!out.sheets.some(s => s.id === out.activeSheet) && out.sheets.length) out = { ...out, activeSheet: out.sheets[0].id };
  return out;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export type Addr = string | CellAddr;
export type RangeLike = string | RangeAddr;

export const toAddr = (a: Addr): CellAddr => {
  if (typeof a !== 'string') return a;
  const p = parseA1(a); if (!p) throw new Error(`Bad cell address ${a}`);
  return p;
};
export const toRange = (r: RangeLike): RangeAddr => {
  if (typeof r !== 'string') return r;
  const p = parseRange(r); if (!p) throw new Error(`Bad range ${r}`);
  return p;
};

function sheetIndex(wb: Workbook, sheetId: string): number {
  const i = wb.sheets.findIndex(s => s.id === sheetId);
  if (i < 0) { const j = wb.sheets.findIndex(s => s.name.toLowerCase() === sheetId.toLowerCase()); if (j >= 0) return j; throw new Error(`No sheet ${sheetId}`); }
  return i;
}
const withSheet = (wb: Workbook, i: number, sh: Sheet): Workbook => {
  const sheets = wb.sheets.slice(); sheets[i] = sh; return { ...wb, sheets };
};

/** Bound a (possibly whole-column) range to something iterable. */
function boundRange(sh: Sheet, r: RangeAddr, limit = 250_000): RangeAddr {
  const cells = (r.r2 - r.r1 + 1) * (r.c2 - r.c1 + 1);
  if (cells <= limit) return r;
  const u = usedRange(sh);
  return { r1: r.r1, c1: r.c1, r2: Math.min(r.r2, Math.max(u.r2, r.r1)), c2: Math.min(r.c2, Math.max(u.c2, r.c1)) };
}

/** Core cell writer: one sheet, many cells, cell-granular patch. `undefined` deletes. */
export function writeCells(wb: Workbook, sheetId: string, changes: [string, Cell | undefined][], label: string, styles?: CellStyle[]): OpResult {
  const i = sheetIndex(wb, sheetId);
  const sh = wb.sheets[i];
  const patchCells: CellChange[] = [];
  const writes: [number, number, Cell | undefined][] = [];
  for (const [a1, next] of changes) {
    const a = parseA1(a1)!;
    const before = getCell(sh.cells, a.row, a.col);
    const after = next && Object.keys(next).length ? clean(next) : undefined;
    if (before === after) continue;
    writes.push([a.row, a.col, after]);
    patchCells.push(clean({ sheetId: sh.id, a1, before, after }));
  }
  let out = writes.length ? withSheet(wb, i, { ...sh, cells: withCells(sh.cells, writes) }) : wb;
  if (styles && styles !== wb.styles) out = { ...out, styles };
  return { workbook: out, patch: { label, cells: patchCells } };
}

/** Keep the non-content parts of a cell (style, note, link). */
const shell = (c?: Cell): Cell | undefined => {
  if (!c) return undefined;
  const o: Cell = {};
  if (c.s !== undefined) o.s = c.s;
  if (c.note !== undefined) o.note = c.note;
  if (c.link !== undefined) o.link = c.link;
  return Object.keys(o).length ? o : undefined;
};

// ── Cell input ───────────────────────────────────────────────────────────────

/**
 * Set a cell from what the user typed: "=SUM(A1:A3)", "$1,200", "12%",
 * "3/4/2026", "TRUE", "'007". Applies the guessed number format when the
 * cell is still General. Empty string clears the content (style kept).
 */
export function setCellInput(wb: Workbook, sheetId: string, addr: Addr, raw: string): OpResult {
  return setCellInputs(wb, sheetId, [[addr, raw]]);
}

export function setCellInputs(wb: Workbook, sheetId: string, inputs: [Addr, string][], label?: string): OpResult {
  const i = sheetIndex(wb, sheetId);
  const sh = wb.sheets[i];
  const styles = wb.styles.slice();
  const changes: [string, Cell | undefined][] = [];
  for (const [addr, raw] of inputs) {
    const a = toAddr(addr);
    const a1 = toA1(a.row, a.col);
    const before = getCell(sh.cells, a.row, a.col);
    const style = before?.s !== undefined ? styles[before.s] ?? {} : {};
    const fmt = style.numFmt;
    const g = guessInput(raw, fmt);
    const base: Cell = shell(before) ?? {};
    let next: Cell | undefined;
    switch (g.kind) {
      case 'blank': next = shell(before); break;
      case 'formula': next = { ...base, f: g.formula }; break;
      case 'error': next = { ...base, f: g.code }; break;
      case 'bool': next = { ...base, v: g.value }; break;
      case 'text': next = { ...base, v: g.value }; break;
      case 'number': {
        next = { ...base, v: g.value };
        if (g.numFmt && (!fmt || /^general$/i.test(fmt))) {
          const s = internStyle(styles, mergeStyle(style, { numFmt: g.numFmt }));
          if (s) next.s = s;
        }
        break;
      }
    }
    changes.push([a1, next]);
  }
  return writeCells(wb, sheetId, changes, label ?? (inputs.length === 1 ? `Edit ${toA1(toAddr(inputs[0][0]).row, toAddr(inputs[0][0]).col)}` : `Edit ${inputs.length} cells`), styles);
}

/** Set typed values directly (no guessing). null clears content. */
export function setCellValues(wb: Workbook, sheetId: string, values: [Addr, Scalar | { formula: string }][], label = 'Set values'): OpResult {
  const sh = wb.sheets[sheetIndex(wb, sheetId)];
  const changes: [string, Cell | undefined][] = values.map(([addr, v]) => {
    const a = toAddr(addr); const a1 = toA1(a.row, a.col);
    const base = shell(getCell(sh.cells, a.row, a.col));
    if (v === null) return [a1, base];
    if (v instanceof CellError) return [a1, { ...(base ?? {}), f: v.code }];
    if (typeof v === 'object') return [a1, { ...(base ?? {}), f: v.formula.replace(/^=/, '') }];
    return [a1, { ...(base ?? {}), v }];
  });
  return writeCells(wb, sheetId, changes, label);
}

export type ClearWhat = 'all' | 'contents' | 'formats' | 'notes';
export function clearRange(wb: Workbook, sheetId: string, range: RangeLike, what: ClearWhat = 'contents'): OpResult {
  const sh = wb.sheets[sheetIndex(wb, sheetId)];
  const r = toRange(range);
  const changes: [string, Cell | undefined][] = [];
  for (const [row, col, c] of cellsInRange(sh.cells, r)) {
    const a1 = toA1(row, col);
    let next: Cell | undefined;
    if (what === 'all') next = undefined;
    else if (what === 'contents') next = shell(c);
    else if (what === 'formats') { next = { ...c }; delete next.s; }
    else { next = { ...c }; delete next.note; }
    changes.push([a1, next]);
  }
  let res = writeCells(wb, sheetId, changes, `Clear ${what}`);
  if (what === 'all' || what === 'formats') {
    // Formats also live in merges; clearing formats unmerges like Excel.
    const i = sheetIndex(res.workbook, sheetId);
    const s2 = res.workbook.sheets[i];
    const merges = (s2.merges ?? []).filter(m => { const mr = parseRange(m)!; return !(mr.r1 >= r.r1 && mr.r2 <= r.r2 && mr.c1 >= r.c1 && mr.c2 <= r.c2); });
    if (merges.length !== (s2.merges ?? []).length) {
      const after = { ...s2, merges };
      res = { workbook: withSheet(res.workbook, i, after), patch: { label: res.patch.label, sheets: [{ id: sh.id, before: sh, after }] } };
    }
  }
  return res;
}

// ── Styles ───────────────────────────────────────────────────────────────────

/** A style patch: nested partial; `null` removes a key (e.g. { fill: null }). */
export type StylePatch = { [K in keyof CellStyle]?: CellStyle[K] | null | Record<string, unknown> };

export function getStyleAt(wb: Workbook, sheetId: string, addr: Addr): CellStyle {
  const sh = wb.sheets[sheetIndex(wb, sheetId)];
  const a = toAddr(addr);
  const s = getCell(sh.cells, a.row, a.col)?.s;
  return s !== undefined ? wb.styles[s] ?? {} : {};
}

/** Merge a style patch into every cell of the ranges (creating style-only cells as needed). */
export function setStyle(wb: Workbook, sheetId: string, ranges: RangeLike | RangeLike[], patch: StylePatch, label = 'Format cells'): OpResult {
  const sh = wb.sheets[sheetIndex(wb, sheetId)];
  const styles = wb.styles.slice();
  const memo = new Map<number, number>();
  const changes: [string, Cell | undefined][] = [];
  for (const rl of Array.isArray(ranges) ? ranges : [ranges]) {
    const r = boundRange(sh, toRange(rl));
    for (let row = r.r1; row <= r.r2; row++) for (let col = r.c1; col <= r.c2; col++) {
      const a1 = toA1(row, col);
      const c = getCell(sh.cells, row, col);
      const cur = c?.s ?? 0;
      let ns = memo.get(cur);
      if (ns === undefined) { ns = internStyle(styles, mergeStyle(styles[cur] ?? {}, patch as Record<string, unknown>)); memo.set(cur, ns); }
      if (ns === cur) continue;
      const next: Cell = { ...(c ?? {}) };
      if (ns) next.s = ns; else delete next.s;
      changes.push([a1, next]);
    }
  }
  return writeCells(wb, sheetId, changes, label, styles);
}

export const setNumberFormat = (wb: Workbook, sheetId: string, ranges: RangeLike | RangeLike[], numFmt: string) =>
  setStyle(wb, sheetId, ranges, { numFmt: numFmt === 'General' ? null : numFmt }, 'Number format');

// ── Sheet-level property ops ─────────────────────────────────────────────────

function sheetOp(wb: Workbook, sheetId: string, label: string, fn: (s: Sheet) => Sheet): OpResult {
  const i = sheetIndex(wb, sheetId);
  const before = wb.sheets[i];
  const after = clean(fn(before));
  return { workbook: withSheet(wb, i, after), patch: { label, sheets: [{ id: before.id, before, after }] } };
}

export const freezePanes = (wb: Workbook, sheetId: string, rows: number, cols: number) =>
  sheetOp(wb, sheetId, 'Freeze panes', s => { const o = { ...s }; if (rows || cols) o.freeze = { rows: Math.max(0, rows), cols: Math.max(0, cols) }; else delete o.freeze; return o; });

export function setColWidths(wb: Workbook, sheetId: string, cols: number[], px: number | null): OpResult {
  return sheetOp(wb, sheetId, 'Resize columns', s => {
    const m = { ...(s.colWidths ?? {}) };
    for (const c of cols) { if (px === null) delete m[c]; else m[c] = Math.max(0, Math.round(px)); }
    return { ...s, colWidths: m };
  });
}
export function setRowHeights(wb: Workbook, sheetId: string, rows: number[], px: number | null): OpResult {
  return sheetOp(wb, sheetId, 'Resize rows', s => {
    const m = { ...(s.rowHeights ?? {}) };
    for (const r of rows) { if (px === null) delete m[r]; else m[r] = Math.max(0, Math.round(px)); }
    return { ...s, rowHeights: m };
  });
}
export function setRowsHidden(wb: Workbook, sheetId: string, rows: number[], hidden: boolean): OpResult {
  return sheetOp(wb, sheetId, hidden ? 'Hide rows' : 'Unhide rows', s => {
    const set = new Set(s.hiddenRows ?? []);
    for (const r of rows) hidden ? set.add(r) : set.delete(r);
    return { ...s, hiddenRows: [...set].sort((a, b) => a - b) };
  });
}
export function setColsHidden(wb: Workbook, sheetId: string, cols: number[], hidden: boolean): OpResult {
  return sheetOp(wb, sheetId, hidden ? 'Hide columns' : 'Unhide columns', s => {
    const set = new Set(s.hiddenCols ?? []);
    for (const c of cols) hidden ? set.add(c) : set.delete(c);
    return { ...s, hiddenCols: [...set].sort((a, b) => a - b) };
  });
}
export const setSheetProps = (wb: Workbook, sheetId: string, props: Partial<Pick<Sheet, 'tabColor' | 'hidden' | 'showGridLines' | 'rowCount' | 'colCount' | 'defaultColWidth' | 'defaultRowHeight'>>) =>
  sheetOp(wb, sheetId, 'Sheet properties', s => ({ ...s, ...props }));

// ── Merges ───────────────────────────────────────────────────────────────────

const intersects = (a: RangeAddr, b: RangeAddr) => a.r1 <= b.r2 && b.r1 <= a.r2 && a.c1 <= b.c2 && b.c1 <= a.c2;

/** Merge a range (Excel keeps the top-left value and clears the rest). */
export function mergeCells(wb: Workbook, sheetId: string, range: RangeLike): OpResult {
  const r = toRange(range);
  return sheetOp(wb, sheetId, 'Merge cells', s => {
    const merges = (s.merges ?? []).filter(m => !intersects(parseRange(m)!, r));
    if (r.r1 !== r.r2 || r.c1 !== r.c2) merges.push(rangeToA1(r));
    const writes: [number, number, Cell | undefined][] = [];
    for (const [row, col, c] of cellsInRange(s.cells, r)) if (!(row === r.r1 && col === r.c1)) writes.push([row, col, shell(c)]);
    return { ...s, merges, cells: withCells(s.cells, writes) };
  });
}
export function unmergeCells(wb: Workbook, sheetId: string, range: RangeLike): OpResult {
  const r = toRange(range);
  return sheetOp(wb, sheetId, 'Unmerge cells', s => ({ ...s, merges: (s.merges ?? []).filter(m => !intersects(parseRange(m)!, r)) }));
}
/** The merge covering a cell, if any. */
export function mergeAt(sheet: Sheet, row: number, col: number): RangeAddr | null {
  for (const m of sheet.merges ?? []) { const r = parseRange(m); if (r && row >= r.r1 && row <= r.r2 && col >= r.c1 && col <= r.c2) return r; }
  return null;
}

// ── Structural edits (insert / delete rows & cols) ───────────────────────────

/** Quick text test: could this formula reference the target sheet at all? */
function mayReference(f: string, onTarget: boolean, targetName: string): boolean {
  if (!/[A-Za-z$]\$?\d|[A-Za-z]:|\d:/.test(f) && !f.includes('[')) return false;
  return onTarget || f.toLowerCase().includes(targetName.toLowerCase());
}

function adjustRangeList(list: string, edit: StructuralEdit): string | null {
  const parts = list.split(/\s+/).filter(Boolean).map(r => adjustRangeA1(r, edit)).filter((x): x is string => !!x);
  return parts.length ? parts.join(' ') : null;
}
function adjustRangeA1(r: string, edit: StructuralEdit): string | null {
  const t = '\u0000target';
  try {
    const n = adjustForStructural(parseFormula(r), edit, t, t);
    if (n.t === 'refErr') return null;
    return toFormula(n).replace(/\$/g, '');
  } catch { return r; }
}
function shiftIndex(i: number, edit: StructuralEdit): number | null {
  const ins = edit.kind === 'insertRows' || edit.kind === 'insertCols';
  if (ins) return i >= edit.at ? i + edit.count : i;
  if (i >= edit.at && i < edit.at + edit.count) return null;
  return i >= edit.at + edit.count ? i - edit.count : i;
}
function shiftIndexMap(m: Record<string, number> | undefined, edit: StructuralEdit) {
  if (!m) return m;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(m)) { const n = shiftIndex(Number(k), edit); if (n !== null) out[n] = v; }
  return out;
}
const shiftList = (l: number[] | undefined, edit: StructuralEdit) => (l ? l.map(i => shiftIndex(i, edit)).filter((x): x is number => x !== null) : l);

function structuralEdit(wb: Workbook, sheetId: string, edit: StructuralEdit, label: string): OpResult {
  const ti = sheetIndex(wb, sheetId);
  const target = wb.sheets[ti];
  const tName = target.name;
  const rows = edit.kind === 'insertRows' || edit.kind === 'deleteRows';
  const fx = (f: string, host: string, onTarget: boolean) => (mayReference(f, onTarget, tName) ? transformFormula(f, n => adjustForStructural(n, edit, tName, host)) : f);
  const sheetChanges: SheetChange[] = [];
  const sheets = wb.sheets.map((sh, si) => {
    const isT = si === ti;
    let changed = false;
    const outCells: CellGrid = {};
    const formulaWrites: [number, number, Cell][] = [];
    forEachCell(sh.cells, (row, col, c0) => {
      let c = c0;
      if (c.f) { const nf = fx(c.f, sh.name, isT); if (nf !== c.f) { c = { ...c, f: nf }; changed = true; } }
      if (isT) {
        const p = shiftIndex(rows ? row : col, edit);
        if (p === null || p >= (rows ? MAX_ROWS : MAX_COLS)) { changed = true; return; }
        const nr = rows ? p : row, nc = rows ? col : p;
        if (nr !== row || nc !== col) changed = true;
        (outCells[nr] ??= {})[nc] = c;
      } else if (c !== c0) formulaWrites.push([row, col, c]);
    });
    let next: Sheet = sh;
    if (isT) {
      next = { ...sh, cells: outCells };
      if (sh.merges) next.merges = sh.merges.map(m => adjustRangeA1(m, edit)).filter((m): m is string => !!m && m.includes(':'));
      if (rows) {
        next.rowHeights = shiftIndexMap(sh.rowHeights, edit);
        next.hiddenRows = shiftList(sh.hiddenRows, edit);
        next.filteredRows = shiftList(sh.filteredRows, edit);
        if (sh.rowCount) next.rowCount = Math.max(1, sh.rowCount + (edit.kind === 'insertRows' ? edit.count : -edit.count));
      } else {
        next.colWidths = shiftIndexMap(sh.colWidths, edit);
        next.hiddenCols = shiftList(sh.hiddenCols, edit);
        if (sh.colCount) next.colCount = Math.max(1, sh.colCount + (edit.kind === 'insertCols' ? edit.count : -edit.count));
      }
      if (sh.conditionalFormats) next.conditionalFormats = sh.conditionalFormats.map(cf => {
        const ranges = adjustRangeList(cf.ranges, edit); if (!ranges) return null;
        return { ...cf, ranges, rule: adjustRuleFormulas(cf.rule, f => fx(f, sh.name, true)) } as ConditionalFormat;
      }).filter((x): x is ConditionalFormat => !!x);
      if (sh.dataValidations) next.dataValidations = sh.dataValidations.map(dv => {
        const ranges = adjustRangeList(dv.ranges, edit); if (!ranges) return null;
        const o: DataValidation = { ...dv, ranges };
        if (dv.formula1) o.formula1 = fx(dv.formula1, sh.name, true);
        if (dv.formula2) o.formula2 = fx(dv.formula2, sh.name, true);
        return o;
      }).filter((x): x is DataValidation => !!x);
      if (sh.tables) next.tables = sh.tables.map(t => { const r = adjustRangeA1(t.range, edit); return r ? { ...t, range: r } : null; }).filter((t): t is NonNullable<typeof t> => !!t);
      if (sh.filter) {
        const r = adjustRangeA1(sh.filter.range, edit);
        if (!r) delete next.filter;
        else next.filter = { range: r, columns: rows ? sh.filter.columns : sh.filter.columns.map(fc => { const c = shiftIndex(fc.col, edit); return c === null ? null : { ...fc, col: c }; }).filter((x): x is NonNullable<typeof x> => !!x) };
      }
      next = clean(next);
    } else if (changed) next = { ...sh, cells: withCells(sh.cells, formulaWrites) };
    if (next !== sh) sheetChanges.push({ id: sh.id, before: sh, after: next });
    return next;
  });
  let names = wb.names;
  const nn = wb.names.map(n => { const host = n.sheetId ? wb.sheets.find(s => s.id === n.sheetId)?.name ?? tName : tName; const r = mayReference(n.ref, true, tName) ? transformFormula(n.ref, x => adjustForStructural(x, edit, tName, host)) : n.ref; return r === n.ref ? n : { ...n, ref: r }; });
  if (nn.some((n, i) => n !== wb.names[i])) names = nn;
  const patch: Patch = { label, sheets: sheetChanges };
  if (names !== wb.names) patch.names = { before: wb.names, after: names };
  return { workbook: { ...wb, sheets, names }, patch };
}

function adjustRuleFormulas(rule: ConditionalFormat['rule'], fx: (f: string) => string): ConditionalFormat['rule'] {
  if (rule.type === 'cellIs') return { ...rule, formulas: rule.formulas.map(fx) };
  if (rule.type === 'expression') return { ...rule, formula: fx(rule.formula) };
  return rule;
}

export const insertRows = (wb: Workbook, sheetId: string, at: number, count = 1) => structuralEdit(wb, sheetId, { kind: 'insertRows', at, count }, `Insert ${count} row${count > 1 ? 's' : ''}`);
export const deleteRows = (wb: Workbook, sheetId: string, at: number, count = 1) => structuralEdit(wb, sheetId, { kind: 'deleteRows', at, count }, `Delete ${count} row${count > 1 ? 's' : ''}`);
export const insertCols = (wb: Workbook, sheetId: string, at: number, count = 1) => structuralEdit(wb, sheetId, { kind: 'insertCols', at, count }, `Insert ${count} column${count > 1 ? 's' : ''}`);
export const deleteCols = (wb: Workbook, sheetId: string, at: number, count = 1) => structuralEdit(wb, sheetId, { kind: 'deleteCols', at, count }, `Delete ${count} column${count > 1 ? 's' : ''}`);

// ── Move (cut/paste) and copy ────────────────────────────────────────────────

/** Qualify unqualified refs with a sheet name (a formula leaving its sheet keeps pointing home). */
function qualify(node: Node, sheet: string): Node {
  return mapNode(node, n => ((n.t === 'ref' || n.t === 'range') && n.sheet === undefined ? { ...n, sheet } : n));
}

/**
 * Cut `src` and paste at (destRow, destCol) on `destSheetId`. Formulas
 * anywhere that pointed into the moved block follow it; moved formulas keep
 * their references (Excel cut semantics). Merges inside the block move too.
 */
export function moveRange(wb: Workbook, sheetId: string, src: RangeLike, destSheetId: string, dest: Addr): OpResult {
  const r = toRange(src);
  const d = toAddr(dest);
  const si = sheetIndex(wb, sheetId), di = sheetIndex(wb, destSheetId);
  const srcSheet = wb.sheets[si], destSheet = wb.sheets[di];
  const dr = d.row - r.r1, dc = d.col - r.c1;
  if (r.r2 + dr >= MAX_ROWS || r.c2 + dc >= MAX_COLS) throw new Error('Move goes off the grid');
  const destR: RangeAddr = { r1: r.r1 + dr, c1: r.c1 + dc, r2: r.r2 + dr, c2: r.c2 + dc };
  const cross = si !== di;
  const moved: [CellAddr, Cell][] = cellsInRange(srcSheet.cells, r).map(([row, col, c]) => [{ row, col }, c]);
  const adj = (f: string, host: string, isMovedCell: boolean) => transformFormula(f, n => {
    let x = n;
    if (isMovedCell && cross) x = qualify(x, srcSheet.name);
    return adjustForMove(x, r, srcSheet.name, host, dr, dc, cross ? destSheet.name : undefined);
  });
  const sheetChanges: SheetChange[] = [];
  const sheets = wb.sheets.map((sh, i) => {
    const writes: [number, number, Cell | undefined][] = [];
    forEachCell(sh.cells, (row, col, c) => {
      if (i === si && row >= r.r1 && row <= r.r2 && col >= r.c1 && col <= r.c2) { writes.push([row, col, undefined]); return; }
      if (i === di && row >= destR.r1 && row <= destR.r2 && col >= destR.c1 && col <= destR.c2) { writes.push([row, col, undefined]); return; }
      if (c.f && (i === si || c.f.toLowerCase().includes(srcSheet.name.toLowerCase()))) {
        const nf = adj(c.f, sh.name, false);
        if (nf !== c.f) writes.push([row, col, { ...c, f: nf }]);
      }
    });
    if (i === di) for (const [a, c] of moved) writes.push([a.row + dr, a.col + dc, c.f ? { ...c, f: adj(c.f, srcSheet.name, true) } : c]);
    let next: Sheet = writes.length ? { ...sh, cells: withCells(sh.cells, writes) } : sh;
    if ((i === si || i === di) && (sh.merges?.length || srcSheet.merges?.length)) {
      let merges = (sh.merges ?? []).slice();
      if (i === si) merges = merges.filter(m => { const mr = parseRange(m)!; return !(mr.r1 >= r.r1 && mr.r2 <= r.r2 && mr.c1 >= r.c1 && mr.c2 <= r.c2); });
      if (i === di) {
        merges = merges.filter(m => !intersects(parseRange(m)!, destR));
        for (const m of srcSheet.merges ?? []) { const mr = parseRange(m)!; if (mr.r1 >= r.r1 && mr.r2 <= r.r2 && mr.c1 >= r.c1 && mr.c2 <= r.c2) merges.push(rangeToA1({ r1: mr.r1 + dr, c1: mr.c1 + dc, r2: mr.r2 + dr, c2: mr.c2 + dc })); }
      }
      next = { ...next, merges };
    }
    if (next !== sh) sheetChanges.push({ id: sh.id, before: sh, after: next });
    return next;
  });
  return { workbook: { ...wb, sheets }, patch: { label: 'Move cells', sheets: sheetChanges } };
}

export type PasteMode = 'all' | 'values' | 'formulas' | 'formats';
export interface CopyOptions {
  mode?: PasteMode;
  transpose?: boolean;
  /** Skip blank source cells (Excel "skip blanks"). */
  skipBlanks?: boolean;
  /** Computed value source (for 'values' mode); defaults to the cached value / literal. */
  valueAt?: (sheetId: string, row: number, col: number) => Scalar;
}

/**
 * Copy `src` to a destination. `dest` may be a single cell (top-left) or a
 * range that is a multiple of the source size (tiled, like Excel). Relative
 * references shift by the offset; absolute ones stay.
 */
export function copyRange(wb: Workbook, sheetId: string, src: RangeLike, destSheetId: string, dest: Addr | RangeLike, opts: CopyOptions = {}): OpResult {
  const r = toRange(src);
  const srcSheet = wb.sheets[sheetIndex(wb, sheetId)];
  const destSheet = wb.sheets[sheetIndex(wb, destSheetId)];
  const h = r.r2 - r.r1 + 1, w = r.c2 - r.c1 + 1;
  const th = opts.transpose ? w : h, tw = opts.transpose ? h : w;
  let dr: RangeAddr;
  if (typeof dest === 'string' && dest.includes(':') || (typeof dest === 'object' && 'r1' in dest)) {
    const d = toRange(dest as RangeLike);
    const rows = (d.r2 - d.r1 + 1) % th === 0 ? d.r2 - d.r1 + 1 : th;
    const cols = (d.c2 - d.c1 + 1) % tw === 0 ? d.c2 - d.c1 + 1 : tw;
    dr = { r1: d.r1, c1: d.c1, r2: d.r1 + rows - 1, c2: d.c1 + cols - 1 };
  } else {
    const d = toAddr(dest as Addr);
    dr = { r1: d.row, c1: d.col, r2: d.row + th - 1, c2: d.col + tw - 1 };
  }
  const mode = opts.mode ?? 'all';
  const changes: [string, Cell | undefined][] = [];
  for (let row = dr.r1; row <= dr.r2; row++) for (let col = dr.c1; col <= dr.c2; col++) {
    const i = (row - dr.r1) % th, j = (col - dr.c1) % tw;
    const sr = r.r1 + (opts.transpose ? j : i), sc = r.c1 + (opts.transpose ? i : j);
    const sCell = getCell(srcSheet.cells, sr, sc);
    if (opts.skipBlanks && (!sCell || (sCell.v === undefined && sCell.f === undefined))) continue;
    const a1 = toA1(row, col);
    const cur = getCell(destSheet.cells, row, col);
    let next: Cell | undefined;
    if (mode === 'formats') {
      next = { ...(cur ?? {}) };
      if (sCell?.s !== undefined) next.s = sCell.s; else delete next.s;
    } else if (mode === 'values') {
      const v = opts.valueAt ? opts.valueAt(srcSheet.id, sr, sc) : sCell?.f !== undefined ? (sCell.c as Scalar ?? null) : sCell?.v ?? null;
      next = { ...(shell(cur) ?? {}) };
      if (v instanceof CellError) next.f = v.code;
      else if (v && typeof v === 'object' && 'e' in (v as object)) next.f = (v as unknown as { e: string }).e;
      else if (v !== null && v !== undefined) next.v = v as string | number | boolean;
    } else {
      const base = mode === 'formulas' ? shell(cur) ?? {} : shell(sCell) ?? {};
      next = { ...base };
      if (sCell?.f !== undefined) {
        next.f = opts.transpose
          ? transformFormula(sCell.f, n => shiftRelative(n, row - sr, col - sc))
          : transformFormula(sCell.f, n => shiftRelative(n, row - sr, col - sc));
      } else if (sCell?.v !== undefined) next.v = sCell.v;
    }
    changes.push([a1, next && Object.keys(next).length ? next : undefined]);
  }
  const res = writeCells(wb, destSheetId, changes, mode === 'all' ? 'Paste' : `Paste ${mode}`);
  // Merges inside the source block are copied in 'all' / 'formats' mode.
  if ((mode === 'all' || mode === 'formats') && !opts.transpose && srcSheet.merges?.length) {
    const inside = srcSheet.merges.map(m => parseRange(m)!).filter(m => m.r1 >= r.r1 && m.r2 <= r.r2 && m.c1 >= r.c1 && m.c2 <= r.c2);
    if (inside.length) {
      const di = sheetIndex(res.workbook, destSheetId);
      const ds = res.workbook.sheets[di];
      const merges = (ds.merges ?? []).filter(m => !intersects(parseRange(m)!, dr));
      for (let ti = 0; ti * th < dr.r2 - dr.r1 + 1; ti++) for (let tj = 0; tj * tw < dr.c2 - dr.c1 + 1; tj++)
        for (const m of inside) merges.push(rangeToA1({ r1: dr.r1 + ti * th + m.r1 - r.r1, c1: dr.c1 + tj * tw + m.c1 - r.c1, r2: dr.r1 + ti * th + m.r2 - r.r1, c2: dr.c1 + tj * tw + m.c2 - r.c1 }));
      const after = { ...ds, merges };
      const before = wb.sheets[sheetIndex(wb, destSheetId)];
      return { workbook: withSheet(res.workbook, di, after), patch: { label: res.patch.label, sheets: [{ id: before.id, before, after }] } };
    }
  }
  return res;
}

// ── Sheets ───────────────────────────────────────────────────────────────────

const BAD_SHEET_CHARS = /[\[\]:*?\/\\]/;
export function validateSheetName(wb: Workbook, name: string, exceptId?: string): string | null {
  const n = name.trim();
  if (!n) return 'Sheet name cannot be empty.';
  if (n.length > 31) return 'Sheet names are at most 31 characters.';
  if (BAD_SHEET_CHARS.test(n)) return 'Sheet names cannot contain [ ] : * ? / \\';
  if (n.startsWith("'") || n.endsWith("'")) return "Sheet names cannot start or end with an apostrophe.";
  if (wb.sheets.some(s => s.id !== exceptId && s.name.toLowerCase() === n.toLowerCase())) return 'That sheet name is already used.';
  return null;
}
export function uniqueSheetName(wb: Workbook, base = 'Sheet'): string {
  for (let i = wb.sheets.length + 1; ; i++) { const n = `${base}${i}`; if (!wb.sheets.some(s => s.name.toLowerCase() === n.toLowerCase())) return n; }
}

export function addSheet(wb: Workbook, name?: string, index?: number): OpResult {
  const nm = name ?? uniqueSheetName(wb);
  const err = validateSheetName(wb, nm); if (err) throw new Error(err);
  const sh = createSheet(nm.trim());
  const sheets = wb.sheets.slice();
  sheets.splice(index ?? sheets.length, 0, sh);
  return {
    workbook: { ...wb, sheets, activeSheet: sh.id },
    patch: { label: 'Add sheet', sheets: [{ id: sh.id, before: null, after: sh }], order: { before: wb.sheets.map(s => s.id), after: sheets.map(s => s.id) }, active: { before: wb.activeSheet, after: sh.id } },
  };
}

/** Rename and rewrite every formula / name / CF / DV reference to the old name. */
export function renameSheet(wb: Workbook, sheetId: string, name: string): OpResult {
  const i = sheetIndex(wb, sheetId);
  const old = wb.sheets[i].name;
  const err = validateSheetName(wb, name, wb.sheets[i].id); if (err) throw new Error(err);
  const nn = name.trim();
  const fx = (f: string) => (f.toLowerCase().includes(old.toLowerCase()) ? transformFormula(f, n => renameSheetRefs(n, old, nn)) : f);
  return rewriteAllFormulas(wb, fx, 'Rename sheet', (sh, si) => (si === i ? { ...sh, name: nn } : sh));
}

export function deleteSheet(wb: Workbook, sheetId: string): OpResult {
  if (wb.sheets.length <= 1) throw new Error('A workbook needs at least one sheet.');
  const i = sheetIndex(wb, sheetId);
  const victim = wb.sheets[i];
  const fx = (f: string) => (f.toLowerCase().includes(victim.name.toLowerCase()) ? transformFormula(f, n => deleteSheetRefs(n, victim.name)) : f);
  const res = rewriteAllFormulas(wb, fx, 'Delete sheet');
  const sheets = res.workbook.sheets.filter(s => s.id !== victim.id);
  const names = res.workbook.names.filter(n => n.sheetId !== victim.id);
  const active = wb.activeSheet === victim.id ? sheets[Math.max(0, i - 1)].id : wb.activeSheet;
  const patch: Patch = {
    label: 'Delete sheet',
    sheets: [...(res.patch.sheets ?? []).filter(c => c.id !== victim.id), { id: victim.id, before: victim, after: null }],
    order: { before: wb.sheets.map(s => s.id), after: sheets.map(s => s.id) },
    active: { before: wb.activeSheet, after: active },
  };
  if (names.length !== wb.names.length || res.patch.names) patch.names = { before: wb.names, after: names };
  return { workbook: { ...res.workbook, sheets, names, activeSheet: active }, patch };
}

export function moveSheet(wb: Workbook, sheetId: string, toIndex: number): OpResult {
  const i = sheetIndex(wb, sheetId);
  const sheets = wb.sheets.slice();
  const [s] = sheets.splice(i, 1);
  sheets.splice(Math.max(0, Math.min(toIndex, sheets.length)), 0, s);
  return { workbook: { ...wb, sheets }, patch: { label: 'Move sheet', order: { before: wb.sheets.map(x => x.id), after: sheets.map(x => x.id) } } };
}

export function duplicateSheet(wb: Workbook, sheetId: string, name?: string): OpResult {
  const i = sheetIndex(wb, sheetId);
  const src = wb.sheets[i];
  let nm = name;
  if (!nm) { let k = 2; do { nm = `${src.name} (${k++})`; } while (wb.sheets.some(s => s.name.toLowerCase() === nm!.toLowerCase())); }
  const err = validateSheetName(wb, nm); if (err) throw new Error(err);
  const copy: Sheet = { ...JSON.parse(JSON.stringify(src)), id: newId('sh'), name: nm };
  const sheets = wb.sheets.slice(); sheets.splice(i + 1, 0, copy);
  return {
    workbook: { ...wb, sheets, activeSheet: copy.id },
    patch: { label: 'Duplicate sheet', sheets: [{ id: copy.id, before: null, after: copy }], order: { before: wb.sheets.map(s => s.id), after: sheets.map(s => s.id) }, active: { before: wb.activeSheet, after: copy.id } },
  };
}

export const setActiveSheet = (wb: Workbook, sheetId: string): OpResult =>
  ({ workbook: { ...wb, activeSheet: wb.sheets[sheetIndex(wb, sheetId)].id }, patch: { label: 'Switch sheet', active: { before: wb.activeSheet, after: wb.sheets[sheetIndex(wb, sheetId)].id } } });

/** Apply a formula rewrite to every formula-bearing place in the workbook. */
function rewriteAllFormulas(wb: Workbook, fx: (f: string) => string, label: string, sheetMap?: (s: Sheet, i: number) => Sheet): OpResult {
  const sheetChanges: SheetChange[] = [];
  const sheets = wb.sheets.map((sh, si) => {
    const writes: [number, number, Cell][] = [];
    forEachCell(sh.cells, (row, col, c) => { if (!c.f) return; const nf = fx(c.f); if (nf !== c.f) writes.push([row, col, { ...c, f: nf }]); });
    let next: Sheet = writes.length ? { ...sh, cells: withCells(sh.cells, writes) } : sh;
    if (sh.conditionalFormats?.length) {
      const cfs = sh.conditionalFormats.map(cf => { const r = adjustRuleFormulas(cf.rule, fx); return r === cf.rule || JSON.stringify(r) === JSON.stringify(cf.rule) ? cf : { ...cf, rule: r }; });
      if (cfs.some((c, k) => c !== sh.conditionalFormats![k])) next = { ...next, conditionalFormats: cfs };
    }
    if (sh.dataValidations?.length) {
      const dvs = sh.dataValidations.map(dv => {
        const f1 = dv.formula1 ? fx(dv.formula1) : undefined, f2 = dv.formula2 ? fx(dv.formula2) : undefined;
        return f1 !== dv.formula1 || f2 !== dv.formula2 ? clean({ ...dv, formula1: f1, formula2: f2 }) : dv;
      });
      if (dvs.some((d, k) => d !== sh.dataValidations![k])) next = { ...next, dataValidations: dvs };
    }
    if (sheetMap) next = sheetMap(next, si);
    if (next !== sh) sheetChanges.push({ id: sh.id, before: sh, after: next });
    return next;
  });
  const nn = wb.names.map(n => { const r = fx(n.ref); return r === n.ref ? n : { ...n, ref: r }; });
  const names = nn.some((n, i) => n !== wb.names[i]) ? nn : wb.names;
  const patch: Patch = { label, sheets: sheetChanges };
  if (names !== wb.names) patch.names = { before: wb.names, after: names };
  return { workbook: { ...wb, sheets, names }, patch };
}

// ── Defined names ────────────────────────────────────────────────────────────

const NAME_RE = /^[A-Za-z_\\][A-Za-z0-9_.\\?]*$/;
export function validateName(wb: Workbook, name: string, sheetId?: string, except?: string): string | null {
  if (!NAME_RE.test(name)) return 'Names start with a letter or underscore and contain no spaces.';
  if (/^[A-Za-z]{1,3}\d+$/.test(name) || /^R\d*C\d*$/i.test(name) || /^(TRUE|FALSE)$/i.test(name)) return 'A name cannot look like a cell reference.';
  if (name.length > 255) return 'Names are at most 255 characters.';
  if (wb.names.some(n => n.name.toLowerCase() === name.toLowerCase() && (n.sheetId ?? '') === (sheetId ?? '') && n.name.toLowerCase() !== except?.toLowerCase())) return 'That name already exists.';
  return null;
}

/** Add or replace a defined name (ref is formula text with or without '='). */
export function setName(wb: Workbook, def: DefinedName): OpResult {
  const ref = def.ref.replace(/^=/, '');
  const existing = wb.names.findIndex(n => n.name.toLowerCase() === def.name.toLowerCase() && (n.sheetId ?? '') === (def.sheetId ?? ''));
  if (existing < 0) { const err = validateName(wb, def.name, def.sheetId); if (err) throw new Error(err); }
  const names = wb.names.slice();
  const nd = clean({ ...def, ref });
  if (existing >= 0) names[existing] = nd; else names.push(nd);
  return { workbook: { ...wb, names }, patch: { label: 'Define name', names: { before: wb.names, after: names } } };
}
export function deleteName(wb: Workbook, name: string, sheetId?: string): OpResult {
  const names = wb.names.filter(n => !(n.name.toLowerCase() === name.toLowerCase() && (n.sheetId ?? '') === (sheetId ?? '')));
  return { workbook: { ...wb, names }, patch: { label: 'Delete name', names: { before: wb.names, after: names } } };
}
/** Rename a defined name and every formula that uses it. */
export function renameName(wb: Workbook, from: string, to: string, sheetId?: string): OpResult {
  const err = validateName(wb, to, sheetId, from); if (err) throw new Error(err);
  const low = from.toLowerCase();
  const fx = (f: string) => (f.toLowerCase().includes(low) ? transformFormula(f, n => mapNode(n, x => (x.t === 'name' && x.name.toLowerCase() === low ? { ...x, name: to } : x.t === 'call' && x.name.toLowerCase() === low ? { ...x, name: to } : x))) : f);
  const res = rewriteAllFormulas(wb, fx, 'Rename name');
  const names = res.workbook.names.map(n => (n.name.toLowerCase() === low && (n.sheetId ?? '') === (sheetId ?? '') ? { ...n, name: to } : n));
  return { workbook: { ...res.workbook, names }, patch: { ...res.patch, names: { before: wb.names, after: names } } };
}

// ── Conditional formats & validation CRUD ────────────────────────────────────

export function addConditionalFormat(wb: Workbook, sheetId: string, cf: Omit<ConditionalFormat, 'id'> & { id?: string }): OpResult {
  return sheetOp(wb, sheetId, 'Add conditional format', s => {
    const list = (s.conditionalFormats ?? []).slice();
    list.push(clean({ ...cf, id: cf.id ?? newId('cf'), priority: cf.priority ?? list.length + 1 }));
    return { ...s, conditionalFormats: list };
  });
}
export const updateConditionalFormat = (wb: Workbook, sheetId: string, id: string, patch: Partial<ConditionalFormat>) =>
  sheetOp(wb, sheetId, 'Edit conditional format', s => ({ ...s, conditionalFormats: (s.conditionalFormats ?? []).map(c => (c.id === id ? clean({ ...c, ...patch, id }) : c)) }));
export const removeConditionalFormat = (wb: Workbook, sheetId: string, id: string) =>
  sheetOp(wb, sheetId, 'Remove conditional format', s => ({ ...s, conditionalFormats: (s.conditionalFormats ?? []).filter(c => c.id !== id) }));

export function addDataValidation(wb: Workbook, sheetId: string, dv: Omit<DataValidation, 'id'> & { id?: string }): OpResult {
  return sheetOp(wb, sheetId, 'Add data validation', s => {
    const r = dv.ranges.split(/\s+/).map(x => parseRange(x)!).filter(Boolean);
    // A new rule replaces existing rules on the same cells (Excel keeps one rule per cell).
    const list = (s.dataValidations ?? []).filter(o => !o.ranges.split(/\s+/).some(x => { const q = parseRange(x); return q && r.some(p => intersects(p, q)); }));
    list.push(clean({ ...dv, id: dv.id ?? newId('dv') }));
    return { ...s, dataValidations: list };
  });
}
export const removeDataValidation = (wb: Workbook, sheetId: string, id: string) =>
  sheetOp(wb, sheetId, 'Remove data validation', s => ({ ...s, dataValidations: (s.dataValidations ?? []).filter(d => d.id !== id) }));

/** Turn a range into a table (structured references Table1[Col] start working). */
export function addTable(wb: Workbook, sheetId: string, range: RangeLike, name?: string): OpResult {
  const r = toRange(range);
  const taken = new Set(wb.sheets.flatMap(s => (s.tables ?? []).map(t => t.name.toLowerCase())));
  let nm = name; if (!nm) { let k = 1; while (taken.has(`table${k}`)) k++; nm = `Table${k}`; }
  if (taken.has(nm.toLowerCase())) throw new Error('That table name is already used.');
  return sheetOp(wb, sheetId, 'Create table', s => ({ ...s, tables: [...(s.tables ?? []), { id: newId('tb'), name: nm!, range: rangeToA1(r), headerRow: true }] }));
}

export { shiftRelative, parseFormula, toFormula };
