// model — the persisted Workbook shape for Tela Grid devices.
//
// This is plain JSON on purpose: it lives inside a Tela doc in Firestore, so
// (1) no Maps / classes, (2) never an `undefined` field (Firestore throws on
// those — use `clean()`), (3) no nested arrays (Firestore rejects them; merges
// and lists are flat string arrays). Cells are a sparse two-level map
// `cells[row][col]` with 0-based numeric-string keys: V8 keeps integer-keyed
// objects in fast element storage, so a 100k-cell sheet copies a row (not the
// world) per edit — a flat A1-keyed record of 300k keys took ~750 ms to spread.
// A Tela cell op is "set cells.<row>.<col>". The engine builds its numeric
// indexes from this on load.

import { MAX_COLS, MAX_ROWS, parseA1, toA1 } from './address';
import type { StoredScalar } from './values';

export type CellInput = number | string | boolean;

export interface Cell {
  /** Typed literal input. Strings are never formulas (those live in `f`). */
  v?: CellInput;
  /** Formula text without the leading '='. */
  f?: string;
  /** Cached computed value (set by xlsx import / engine snapshot) — display hint only. */
  c?: StoredScalar;
  /** Style id into Workbook.styles (0 / missing = default). */
  s?: number;
  /** Hyperlink target, set by HYPERLINK-free link insertion. */
  link?: string;
  /** Cell note / comment text. */
  note?: string;
}

export type BorderStyle = 'thin' | 'medium' | 'thick' | 'dashed' | 'dotted' | 'double' | 'hair'
  | 'mediumDashed' | 'dashDot' | 'mediumDashDot' | 'dashDotDot' | 'mediumDashDotDot' | 'slantDashDot';
export interface BorderSide { style: BorderStyle; color?: string }
export type HAlign = 'general' | 'left' | 'center' | 'right' | 'fill' | 'justify' | 'centerContinuous' | 'distributed';
export type VAlign = 'top' | 'center' | 'bottom' | 'justify' | 'distributed';

export interface CellStyle {
  /** Excel number format code ("General", "0.00", "#,##0", "yyyy-mm-dd", ...). */
  numFmt?: string;
  font?: {
    bold?: boolean; italic?: boolean; underline?: boolean | 'single' | 'double'; strike?: boolean;
    color?: string; size?: number; family?: string;
  };
  fill?: { color: string };
  borders?: { top?: BorderSide; right?: BorderSide; bottom?: BorderSide; left?: BorderSide };
  align?: { h?: HAlign; v?: VAlign; wrap?: boolean; indent?: number; rotation?: number; shrink?: boolean };
  protection?: { locked?: boolean; hidden?: boolean };
}

// ── Conditional formats ──────────────────────────────────────────────────────

export type CfOperator = 'between' | 'notBetween' | 'equal' | 'notEqual' | 'greaterThan' | 'lessThan' | 'greaterThanOrEqual' | 'lessThanOrEqual';
export interface CfValueObject { type: 'min' | 'max' | 'num' | 'percent' | 'percentile' | 'formula'; value?: string }
export type ConditionalRule =
  | { type: 'cellIs'; operator: CfOperator; formulas: string[]; style: CellStyle }
  | { type: 'expression'; formula: string; style: CellStyle }
  | { type: 'containsText' | 'notContainsText' | 'beginsWith' | 'endsWith'; text: string; style: CellStyle }
  | { type: 'containsBlanks' | 'notContainsBlanks' | 'containsErrors' | 'notContainsErrors' | 'duplicateValues' | 'uniqueValues'; style: CellStyle }
  | { type: 'top10'; rank: number; bottom?: boolean; percent?: boolean; style: CellStyle }
  | { type: 'aboveAverage'; below?: boolean; equalAverage?: boolean; stdDev?: number; style: CellStyle }
  | { type: 'colorScale'; cfvo: CfValueObject[]; colors: string[] }
  | { type: 'dataBar'; cfvo: CfValueObject[]; color: string; showValue?: boolean; gradient?: boolean }
  | { type: 'iconSet'; iconSet: IconSetName; cfvo: CfValueObject[]; reverse?: boolean; showValue?: boolean };
export type IconSetName = '3Arrows' | '3ArrowsGray' | '3Flags' | '3TrafficLights1' | '3TrafficLights2' | '3Signs' | '3Symbols' | '3Symbols2' | '3Stars' | '3Triangles'
  | '4Arrows' | '4ArrowsGray' | '4RedToBlack' | '4Rating' | '4TrafficLights' | '5Arrows' | '5ArrowsGray' | '5Rating' | '5Quarters' | '5Boxes';

export interface ConditionalFormat {
  id: string;
  /** Space-separated A1 ranges ("A1:A10 C1:C10"), like OOXML sqref. */
  ranges: string;
  rule: ConditionalRule;
  priority?: number;
  stopIfTrue?: boolean;
}

// ── Data validation ──────────────────────────────────────────────────────────

export interface DataValidation {
  id: string;
  ranges: string;
  type: 'list' | 'whole' | 'decimal' | 'date' | 'time' | 'textLength' | 'custom' | 'any';
  operator?: CfOperator;
  /** formula1/2 without '=' ("1", "A1:A5", "DATE(2026,1,1)") — or for 'list' a literal "a,b,c" in `list`. */
  formula1?: string;
  formula2?: string;
  list?: string[];
  allowBlank?: boolean;
  showDropdown?: boolean;
  errorStyle?: 'stop' | 'warning' | 'information';
  errorTitle?: string;
  error?: string;
  promptTitle?: string;
  prompt?: string;
}

// ── Filter / sort / tables ───────────────────────────────────────────────────

export interface FilterCondition { op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'notContains' | 'beginsWith' | 'endsWith' | 'blank' | 'notBlank'; value?: string | number }
export interface FilterColumn {
  /** Absolute 0-based sheet column. */
  col: number;
  /** Keep rows whose display text is in this list (Excel value filter). */
  values?: string[];
  /** Custom conditions combined with `join` (default and). */
  conditions?: FilterCondition[];
  join?: 'and' | 'or';
  top?: { n: number; bottom?: boolean; percent?: boolean };
}
export interface FilterState { range: string; columns: FilterColumn[] }
export interface SortKey { col: number; descending?: boolean; caseSensitive?: boolean }
export interface SortState { range: string; keys: SortKey[]; hasHeader?: boolean }
export interface TableDef { id: string; name: string; range: string; headerRow?: boolean; totalsRow?: boolean; style?: string }

/** Sparse grid: cells[row][col], 0-based, numeric-string keys. */
export type CellGrid = Record<string, Record<string, Cell>>;

export interface Sheet {
  id: string;
  name: string;
  cells: CellGrid;
  /** Pixel widths/heights keyed by 0-based index. */
  colWidths?: Record<string, number>;
  rowHeights?: Record<string, number>;
  /** User-hidden rows/cols (0-based). Filter-hidden rows live in `filteredRows`. */
  hiddenRows?: number[];
  hiddenCols?: number[];
  filteredRows?: number[];
  /** A1 ranges, e.g. ["A1:C1"]. */
  merges?: string[];
  freeze?: { rows: number; cols: number };
  conditionalFormats?: ConditionalFormat[];
  dataValidations?: DataValidation[];
  filter?: FilterState;
  sort?: SortState;
  tables?: TableDef[];
  /** Visible extent hint for the UI (legacy rows/cols). */
  rowCount?: number;
  colCount?: number;
  defaultColWidth?: number;
  defaultRowHeight?: number;
  tabColor?: string;
  hidden?: boolean;
  showGridLines?: boolean;
}

export interface DefinedName {
  name: string;
  /** Formula text without '=' (e.g. "Sheet1!$A$1:$A$10" or "0.07" or "LAMBDA(x,x*2)"). */
  ref: string;
  /** Sheet id for sheet-scoped names; workbook scope when absent. */
  sheetId?: string;
  comment?: string;
}

export interface CalcSettings { iterative?: boolean; maxIterations?: number; maxChange?: number; manual?: boolean }

export interface Workbook {
  version: 1;
  sheets: Sheet[];
  names: DefinedName[];
  /** Style table; index 0 is always the default style {}. */
  styles: CellStyle[];
  activeSheet: string;
  calc?: CalcSettings;
  date1904?: boolean;
}

export const DEFAULT_COL_WIDTH = 88;
export const DEFAULT_ROW_HEIGHT = 24;
export { MAX_COLS, MAX_ROWS };

let idCounter = 0;
export const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(idCounter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Strip undefined fields recursively (Firestore rejects undefined). */
export function clean<T>(o: T): T {
  if (Array.isArray(o)) return o.map(clean) as unknown as T;
  if (o && typeof o === 'object' && Object.getPrototypeOf(o) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) if (v !== undefined) out[k] = clean(v);
    return out as T;
  }
  return o;
}

export function createSheet(name = 'Sheet1', id = newId('sh')): Sheet {
  return { id, name, cells: {}, rowCount: 100, colCount: 26 };
}

export function createWorkbook(sheetNames: string[] = ['Sheet1']): Workbook {
  const sheets = sheetNames.map(n => createSheet(n));
  return { version: 1, sheets, names: [], styles: [{}], activeSheet: sheets[0].id };
}

export const getSheet = (wb: Workbook, idOrName: string): Sheet | undefined =>
  wb.sheets.find(s => s.id === idOrName) ?? wb.sheets.find(s => s.name.toLowerCase() === idOrName.toLowerCase());

/** Stable JSON key for style dedupe. */
export function styleKey(st: CellStyle): string {
  const sort = (v: unknown): unknown => {
    if (!v || typeof v !== 'object') return v;
    return Object.keys(v as object).sort().reduce((o, k) => { const x = (v as Record<string, unknown>)[k]; if (x !== undefined) (o as Record<string, unknown>)[k] = sort(x); return o; }, {} as Record<string, unknown>);
  };
  return JSON.stringify(sort(st));
}

/** Return the id of `style` in the table, appending it if new (mutates `styles`). */
export function internStyle(styles: CellStyle[], style: CellStyle): number {
  const key = styleKey(clean(style));
  if (key === '{}') return 0;
  for (let i = 0; i < styles.length; i++) if (styleKey(styles[i]) === key) return i;
  styles.push(clean(style));
  return styles.length - 1;
}

/** Deep-merge a style patch onto a base style. `null` in the patch deletes a key. */
export function mergeStyle(base: CellStyle, patch: Record<string, unknown>): CellStyle {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined) { if (v === null) delete out[k]; continue; }
    if (typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object') out[k] = mergeStyle(out[k] as CellStyle, v as Record<string, unknown>);
    else out[k] = v;
  }
  return clean(out as CellStyle);
}

// ── Cell grid helpers ────────────────────────────────────────────────────────

export const getCell = (grid: CellGrid, row: number, col: number): Cell | undefined => grid[row]?.[col];
export function getCellA1(grid: CellGrid, a1: string): Cell | undefined { const a = parseA1(a1); return a ? grid[a.row]?.[a.col] : undefined; }

/** Visit every cell in row-major order. Return false to stop. */
export function forEachCell(grid: CellGrid, fn: (row: number, col: number, cell: Cell) => void | boolean): void {
  for (const rk in grid) {
    const row = grid[rk]; const r = +rk;
    for (const ck in row) if (fn(r, +ck, row[ck]) === false) return;
  }
}
/** [a1, cell] pairs in row-major order (cheap; no big intermediate object). */
export function cellEntriesA1(grid: CellGrid): [string, Cell][] {
  const out: [string, Cell][] = [];
  forEachCell(grid, (r, c, cell) => { out.push([toA1(r, c), cell]); });
  return out;
}
export function cellCount(grid: CellGrid): number { let n = 0; for (const rk in grid) for (const _ in grid[rk]) n++; return n; }
/** Cells inside a rectangle (row-major). */
export function cellsInRange(grid: CellGrid, r: { r1: number; c1: number; r2: number; c2: number }): [number, number, Cell][] {
  const out: [number, number, Cell][] = [];
  const rows = Object.keys(grid);
  const span = r.r2 - r.r1 + 1;
  const visit = (rk: string) => { const row = grid[rk]; if (!row) return; const rr = +rk; for (const ck in row) { const c = +ck; if (c >= r.c1 && c <= r.c2) out.push([rr, c, row[ck]]); } };
  if (span < rows.length) { for (let rr = r.r1; rr <= r.r2; rr++) if (grid[rr]) visit(String(rr)); }
  else for (const rk of rows) { const rr = +rk; if (rr >= r.r1 && rr <= r.r2) visit(rk); }
  return out;
}
/**
 * Immutable write: returns a new grid sharing every untouched row. `undefined` deletes.
 * Empty rows are dropped so the grid stays sparse.
 */
export function withCells(grid: CellGrid, changes: Iterable<[number, number, Cell | undefined]>): CellGrid {
  const out: CellGrid = { ...grid };
  const copied = new Set<number>();
  for (const [r, c, cell] of changes) {
    let row = out[r];
    if (!copied.has(r)) { row = { ...(row ?? {}) }; out[r] = row; copied.add(r); }
    if (cell) row![c] = cell; else delete row![c];
  }
  for (const r of copied) { const row = out[r]; let empty = true; for (const _ in row) { empty = false; break; } if (empty) delete out[r]; }
  return out;
}
/** Grid from an A1-keyed record (tests, legacy, fixtures). */
export function gridFromA1(rec: Record<string, Cell>): CellGrid {
  const g: CellGrid = {};
  for (const [k, c] of Object.entries(rec)) { const a = parseA1(k); if (a) (g[a.row] ??= {})[a.col] = c; }
  return g;
}
export function gridToA1(grid: CellGrid): Record<string, Cell> {
  const out: Record<string, Cell> = {};
  forEachCell(grid, (r, c, cell) => { out[toA1(r, c)] = cell; });
  return out;
}

/** Used extent of a sheet's cell map (inclusive, 0-based). Empty sheet → -1s. */
export function usedRange(sheet: Sheet): { r2: number; c2: number } {
  let r2 = -1, c2 = -1;
  for (const rk in sheet.cells) {
    const r = +rk; if (r > r2) r2 = r;
    for (const ck in sheet.cells[rk]) { const c = +ck; if (c > c2) c2 = c; }
  }
  return { r2, c2 };
}

// ── Legacy migration ─────────────────────────────────────────────────────────

/** The pre-workbook Grid shape: `{ rows, cols, cells: Record<A1, string> }`. */
export interface LegacyGrid { rows: number; cols: number; cells: Record<string, string> }

/**
 * Lift a legacy Grid into a one-sheet Workbook. "=..." becomes a formula, plain
 * numbers become numbers; everything else stays text exactly as typed (legacy
 * cells were strings, so we do not guess dates/currency here — the user typed
 * "$5" and saw "$5"; we keep that as text to avoid reinterpreting old docs).
 * Legacy formulas used AVG(), which the engine supports as an alias.
 */
export function fromLegacyGrid(legacy: LegacyGrid, sheetName = 'Sheet1'): Workbook {
  const wb = createWorkbook([sheetName]);
  const sh = wb.sheets[0];
  sh.rowCount = Math.max(legacy.rows || 0, 1);
  sh.colCount = Math.max(legacy.cols || 0, 1);
  for (const [key, raw] of Object.entries(legacy.cells || {})) {
    const a = parseA1(key);
    if (!a || raw === undefined || raw === null || raw === '') continue;
    const t = String(raw);
    const trimmed = t.trim();
    const row = (sh.cells[a.row] ??= {});
    if (trimmed.startsWith('=') && trimmed.length > 1) row[a.col] = { f: trimmed.slice(1) };
    else if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(trimmed)) row[a.col] = { v: Number(trimmed) };
    else row[a.col] = { v: t };
  }
  return wb;
}

/** Flatten sheet 0 back to the legacy string map (for old readers / previews). */
export function toLegacyCells(sheet: Sheet): Record<string, string> {
  const out: Record<string, string> = {};
  forEachCell(sheet.cells, (r, col, c) => {
    const k = toA1(r, col);
    if (c.f !== undefined) out[k] = '=' + c.f;
    else if (c.v !== undefined) out[k] = typeof c.v === 'boolean' ? (c.v ? 'TRUE' : 'FALSE') : String(c.v);
  });
  return out;
}
