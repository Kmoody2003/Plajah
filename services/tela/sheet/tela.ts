// tela — the bridge between the sheet engine and Tela documents.
//
// * Legacy migration: a pre-workbook Grid ({rows, cols, cells: A1 → string})
//   lifts into a Workbook; legacy cross-device syntax with spaces
//   (`=My Grid!A1`, `=SUM(My Base.unit price)`) is rewritten into the Excel
//   grammar ('My Grid'!A1, My Base[unit price]) so the parser never guesses.
// * Resolver: other Grid devices answer `GridName!A1` (first sheet) or
//   `'GridName/Sheet2'!A1`; Base devices answer `SUM(Orders.price)`,
//   `SUM(Orders[price])`, `COUNT(Orders)` with the legacy aggregate semantics,
//   and expose columns as arrays for everything else (=XLOOKUP(…, Orders.sku, …)).
// * Chart access: range values / labels the same way telaChartData reads them.

import { parseA1, parseRange, toA1 } from './address';
import { SheetEngine, type ExternalResolver, type ExternalSheet } from './engine';
import { forEachCell, fromLegacyGrid, usedRange, type LegacyGrid, type Workbook } from './model';
import { ERR, Matrix, type Scalar } from './values';

/** A Base as the legacy formula engine saw it. */
export interface TelaBaseLite { fields: { id: string; name: string; type: string }[]; rows: { values: Record<string, string> }[] }

/** What a Grid device looks like to the engine (legacy fields + the optional workbook). */
export interface GridLike { rows: number; cols: number; cells: Record<string, string>; workbook?: Workbook }

export interface TelaLinkContext {
  /** Grid by case-insensitive frame label / name / id. */
  resolveGrid?: (name: string) => GridLike | Record<string, string> | null;
  /** Base by case-insensitive name / label / id. */
  resolveBase?: (name: string) => TelaBaseLite | null;
}

// ── Legacy migration ─────────────────────────────────────────────────────────

/** Rewrite legacy space-containing cross-device references into Excel grammar. */
export function migrateLegacyFormula(f: string): string {
  let out = f;
  // Base aggregates with spaces: SUM(My Base.unit price) → SUM(My_Base[unit price]). Names cannot hold
  // spaces, so the table name gets underscores (the resolver maps them back) and the field goes in brackets.
  out = out.replace(/\b(COUNT|SUM|AVG|AVERAGE|MIN|MAX)\(\s*([A-Za-z_][A-Za-z0-9_ ]*?)(?:\.([A-Za-z_][A-Za-z0-9_ ]*?))?\s*\)/gi, (m, fn: string, name: string, field?: string) => {
    if (!name.includes(' ') && !(field ?? '').includes(' ')) return m;
    return `${fn}(${name.trim().replace(/\s+/g, '_')}[${(field ?? '').trim() || '#All'}])`.replace('[#All]', '');
  });
  // Grid refs with spaces: My Grid!A1 → 'My Grid'!A1
  out = out.replace(/(^|[=(,+\-*/^&<>: ])([A-Za-z_][A-Za-z0-9_]*(?: [A-Za-z0-9_]+)+)!(\$?[A-Z]+\$?[0-9]+)/g, (_m, pre: string, name: string, cell: string) => `${pre}'${name.trim()}'!${cell}`);
  return out;
}

/** Workbook for a Grid device: its own `workbook`, or a migration of the legacy cells. */
export function workbookFromGrid(device: GridLike): Workbook {
  if (device.workbook) return device.workbook;
  const wb = fromLegacyGrid(device as LegacyGrid);
  const sh = wb.sheets[0];
  forEachCell(sh.cells, (r, c, cell) => { if (cell.f) { const nf = migrateLegacyFormula(cell.f); if (nf !== cell.f) sh.cells[r][c] = { ...cell, f: nf }; } });
  return wb;
}

// ── Resolver ─────────────────────────────────────────────────────────────────

const MAX_LINK_DEPTH = 8;

function baseColumn(base: TelaBaseLite, column?: string): Matrix | null {
  if (!column) {
    // Whole table: one row per record, one column per field.
    return new Matrix(base.rows.map(r => base.fields.map(f => fieldValue(f.type, r.values[f.id]))));
  }
  const f = base.fields.find(x => x.name.toLowerCase() === column.toLowerCase() || x.id === column);
  if (!f) return null;
  return Matrix.col(base.rows.map(r => fieldValue(f.type, r.values[f.id])));
}
function fieldValue(type: string, raw: string | undefined): Scalar {
  if (raw === undefined || raw === '') return null;
  if (type === 'NUMBER') { const n = parseFloat(raw); return Number.isFinite(n) ? n : raw; }
  if (type === 'CHECKBOX') return raw === 'true' || raw === '1' || raw === 'TRUE';
  return raw;
}
/** Legacy semantics: COUNT(Base) = rows; COUNT(Base.f) = non-empty; SUM/MIN/MAX/AVG over the named or first NUMBER field. */
export function legacyBaseAggregate(base: TelaBaseLite, fn: string, field?: string): number {
  const f = field ? base.fields.find(x => x.name.toUpperCase() === field.toUpperCase()) : null;
  const F = fn.toUpperCase();
  if (F === 'COUNT' || F === 'COUNTA') {
    if (!field) return base.rows.length;
    if (!f) return 0;
    return base.rows.filter(r => (r.values[f.id] ?? '').trim() !== '').length;
  }
  const fid = f?.id ?? base.fields.find(x => x.type === 'NUMBER')?.id;
  const nums: number[] = [];
  if (fid) for (const r of base.rows) { const n = parseFloat(r.values[fid]); if (Number.isFinite(n)) nums.push(n); }
  if (F === 'SUM') return nums.reduce((s, v) => s + v, 0);
  if (F === 'MIN') return nums.length ? Math.min(...nums) : 0;
  if (F === 'MAX') return nums.length ? Math.max(...nums) : 0;
  return nums.length ? nums.reduce((s, v) => s + v, 0) / nums.length : 0;
}

/**
 * External resolver for one Grid's engine. Engines for linked Grids are built
 * lazily and cached per workbook object; a depth guard stops Grid↔Grid loops.
 */
export function createTelaResolver(ctx: TelaLinkContext, depth = 0, cache = new WeakMap<object, SheetEngine>()): ExternalResolver {
  const engineFor = (g: GridLike | Record<string, string>): SheetEngine | null => {
    if (depth >= MAX_LINK_DEPTH) return null;
    const grid: GridLike = 'cells' in g && typeof (g as GridLike).cells === 'object' && 'rows' in g ? (g as GridLike) : { rows: 0, cols: 0, cells: g as Record<string, string> };
    const key: object = grid.workbook ?? (g as object);
    let e = cache.get(key);
    if (!e) {
      // Register first (placeholder-free): constructing evaluates, which may re-enter for cycles.
      e = new SheetEngine(workbookFromGrid(grid), { resolver: createTelaResolver(ctx, depth + 1, cache) });
      cache.set(key, e);
    }
    return e;
  };
  return {
    sheet(name: string): ExternalSheet | null {
      const [gridName, sheetName] = name.split('/');
      const g = ctx.resolveGrid?.(gridName.trim());
      if (!g) return null;
      const e = engineFor(g); if (!e) return null;
      const wb = e.wb;
      const sh = sheetName ? wb.sheets.find(s => s.name.toLowerCase() === sheetName.trim().toLowerCase()) : wb.sheets[0];
      if (!sh) return null;
      return {
        getValue: (r, c) => e.getValue(sh.id, r, c),
        extent: () => usedRange(sh),
      };
    },
    table(name: string, column?: string) {
      const b = ctx.resolveBase?.(name.replace(/_/g, ' ').trim()) ?? ctx.resolveBase?.(name.trim());
      if (!b) return null;
      return baseColumn(b, column) ?? ERR.REF;
    },
    aggregate(fn: string, name: string, column?: string) {
      const b = ctx.resolveBase?.(name.replace(/_/g, ' ').trim()) ?? ctx.resolveBase?.(name.trim());
      if (!b) return null;
      return legacyBaseAggregate(b, fn === 'AVERAGE' ? 'AVG' : fn, column);
    },
  };
}

/** One-call helper: an engine for a Grid device with Tela links wired. */
export function engineForGrid(device: GridLike, ctx: TelaLinkContext = {}): SheetEngine {
  return new SheetEngine(workbookFromGrid(device), { resolver: createTelaResolver(ctx) });
}

// ── Chart data access ────────────────────────────────────────────────────────

/** Display strings of an A1 range in reading order (chart labels). */
export function rangeLabels(engine: SheetEngine, sheetId: string, range: string): string[] {
  const r = parseRange(range); if (!r) return [];
  const out: string[] = [];
  for (let row = r.r1; row <= r.r2; row++) for (let col = r.c1; col <= r.c2; col++) out.push(engine.getDisplay(sheetId, row, col, 255).text || toA1(row, col));
  return out;
}
/** Numbers of an A1 range in reading order (non-numbers → 0, like telaChartData). */
export function rangeNumbers(engine: SheetEngine, sheetId: string, range: string): number[] {
  const r = parseRange(range); if (!r) return [];
  const out: number[] = [];
  for (let row = r.r1; row <= r.r2; row++) for (let col = r.c1; col <= r.c2; col++) {
    const v = engine.getValue(sheetId, row, col);
    out.push(typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[$,%\s]/g, '')) || 0 : typeof v === 'boolean' ? (v ? 1 : 0) : 0);
  }
  return out;
}
