// runtime — one live SheetEngine per Grid device, shared by every reader.
//
// The Grid editor, Charts bound to a Grid, other Grids that reference it
// (`=Sales!B2`), the embed / Fabula read paths and the legacy-view writer all
// ask this registry for the device's engine. An engine is built once and then
// follows the device's immutable workbook with `engine.update()` (an
// incremental, row-identity diff), so a chart re-reading a 100k-row Grid after
// an edit costs one dirty cell, not a rebuild. Entries are LRU-evicted unless a
// mounted Grid pins them.
//
// Read-only views get a fast first paint: when every formula cell carries a
// cached value (`c`, written by the Grid's snapshot), the engine loads in
// manual-calc mode (no recalculation, just compile + cached values) and a full
// recalculation runs at idle time to bring spills / volatiles up to date.
//
// It also derives the bounded legacy `cells` view (A1 → value string, sheet 1)
// that older readers of TelaGridDevice.cells still use.

import {
  SheetEngine, createTelaResolver, createWorkbook, forEachCell, numberToText, parseRange, rangeLabels, rangeNumbers, toA1, workbookFromGrid,
  CellError, type ExternalResolver, type ExternalSheet, type Scalar, type Workbook,
} from '../../../services/tela/sheet';

/** Base as the formula engine sees it (fields + rows). */
export interface TelaBaseLite {
  fields: { id: string; name: string; type: string }[];
  rows: { values: Record<string, string> }[];
}

/** Minimal Grid device shape the runtime needs. */
export interface GridDeviceLike { id: string; rows: number; cols: number; cells: Record<string, string>; workbook?: Workbook }

/** Cross-device resolution context (TelaFormulaContext is a superset). */
export interface GridLinkContext {
  /** Legacy: another Grid's A1 → string cells, by name/label/id. */
  resolveGrid?: (name: string) => Record<string, string> | null;
  /** Another Grid device (with its workbook) by name/label/id. */
  resolveGridDevice?: (name: string) => GridDeviceLike | null;
  resolveBase?: (name: string) => TelaBaseLite | null;
}

// ── Workbook for a device (legacy migration is cached by the cells object) ───

const migrated = new WeakMap<object, Workbook>();
export function deviceWorkbook(d: GridDeviceLike): Workbook {
  if (d.workbook) return d.workbook;
  const key = d.cells ?? {};
  let wb = migrated.get(key);
  if (!wb) { wb = workbookFromGrid({ rows: d.rows, cols: d.cols, cells: d.cells ?? {} }); migrated.set(key, wb); }
  return wb;
}

/** True when every formula cell has a cached value (fast read-only load is safe). */
export function hasFullCache(wb: Workbook): boolean {
  for (const sh of wb.sheets) {
    let ok = true;
    forEachCell(sh.cells, (_r, _c, cell) => { if (cell.f !== undefined && cell.f !== '' && cell.c === undefined) { ok = false; return false; } });
    if (!ok) return false;
  }
  return true;
}

// ── Registry ─────────────────────────────────────────────────────────────────

interface Entry {
  id: string;
  engine: SheetEngine;
  wb: Workbook;
  ctx: GridLinkContext | undefined;
  used: number;
  pins: number;
  loading: boolean;
  /** Loaded from cached values without recalculation (read-only fast path). */
  provisional: boolean;
  listeners: Set<() => void>;
}

const registry = new Map<string, Entry>();
const MAX_UNPINNED = 8;
let depth = 0;
let clock = 0;

function evict() {
  const unpinned = [...registry.values()].filter(e => e.pins === 0).sort((a, b) => a.used - b.used);
  while (unpinned.length > MAX_UNPINNED) { const e = unpinned.shift()!; registry.delete(e.id); }
}

const legacyEngines = new WeakMap<object, SheetEngine>();

function makeResolver(entry: () => Entry | undefined): ExternalResolver {
  const base = createTelaResolver({ resolveBase: n => entry()?.ctx?.resolveBase?.(n) ?? null });
  return {
    sheet(name: string): ExternalSheet | null {
      if (depth > 8) return null;
      const ctx = entry()?.ctx; if (!ctx) return null;
      const [gridName, sheetName] = name.split('/');
      const dev = ctx.resolveGridDevice?.(gridName.trim());
      let engine: SheetEngine | null = null;
      if (dev) {
        depth++;
        try { engine = engineFor(dev, ctx); } finally { depth--; }
      } else {
        const cells = ctx.resolveGrid?.(gridName.trim());
        if (!cells) return null;
        engine = legacyEngines.get(cells) ?? null;
        if (!engine) { engine = new SheetEngine(workbookFromGrid({ rows: 0, cols: 0, cells })); legacyEngines.set(cells, engine); }
      }
      const e = engine;
      const wb = e.wb;
      const sh = sheetName ? wb.sheets.find(s => s.name.toLowerCase() === sheetName.trim().toLowerCase()) : wb.sheets[0];
      if (!sh) return null;
      const si = e.sheetIndexOf(sh.id);
      return {
        getValue: (r, c) => e.getValue(si, r, c),
        extent: () => { let r2 = -1, c2 = -1; for (const rk in sh.cells) { const r = +rk; if (r > r2) r2 = r; for (const ck in sh.cells[rk]) if (+ck > c2) c2 = +ck; } return { r2, c2 }; },
      };
    },
    table: base.table,
    aggregate: base.aggregate,
  };
}

export interface EngineRequest {
  /** Read-only callers accept a provisional engine built from cached values. */
  readOnly?: boolean;
}

/**
 * The live engine for a Grid device, synced to its current workbook. `ctx`
 * (when given) becomes the entry's link context; a changed context
 * re-evaluates only the formulas that reach outside the workbook.
 */
export function engineFor(device: GridDeviceLike, ctx?: GridLinkContext, req: EngineRequest = {}): SheetEngine {
  const wb = deviceWorkbook(device);
  let e = registry.get(device.id);
  if (!e) {
    const holder: { e?: Entry } = {};
    const engine = new SheetEngine(createWorkbook(), { resolver: makeResolver(() => holder.e) });
    e = { id: device.id, engine, wb, ctx, used: ++clock, pins: 0, loading: true, provisional: false, listeners: new Set() };
    holder.e = e;
    registry.set(device.id, e);
    try {
      if (req.readOnly && hasFullCache(wb) && wb.sheets.some(s => Object.keys(s.cells).length > 2000)) {
        engine.load({ ...wb, calc: { ...(wb.calc ?? {}), manual: true } });
        // engine.wb must stay the real workbook so later update() diffs against it.
        (engine as { wb: Workbook }).wb = wb;
        e.provisional = true;
        scheduleFullCalc(e);
      } else engine.load(wb);
    } finally { e.loading = false; }
    evict();
    return engine;
  }
  e.used = ++clock;
  if (e.loading) return e.engine;
  if (e.wb !== wb) {
    e.loading = true;
    try { e.engine.update(wb); } finally { e.loading = false; }
    e.wb = wb;
  }
  if (ctx && ctx !== e.ctx) {
    e.ctx = ctx;
    e.loading = true;
    try { e.engine.invalidateExternal(); } finally { e.loading = false; }
  }
  if (e.provisional && !req.readOnly) { e.provisional = false; e.engine.load(e.wb); }
  return e.engine;
}

function scheduleFullCalc(e: Entry) {
  const run = () => {
    if (registry.get(e.id) !== e || !e.provisional) return;
    e.provisional = false;
    e.loading = true;
    try { e.engine.load(e.wb); } finally { e.loading = false; }
    for (const l of e.listeners) l();
  };
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (ric) ric(run, { timeout: 1500 }); else setTimeout(run, 30);
}

/** Keep an engine resident while a Grid view is mounted. Returns the release fn. */
export function pinEngine(deviceId: string): () => void {
  const e = registry.get(deviceId); if (!e) return () => {};
  e.pins++;
  return () => { e.pins = Math.max(0, e.pins - 1); evict(); };
}
/** Repaint hook for views of a provisional engine (fires after the idle full calc). */
export function onEngineSettled(deviceId: string, fn: () => void): () => void {
  const e = registry.get(deviceId); if (!e) return () => {};
  e.listeners.add(fn);
  return () => { e.listeners.delete(fn); };
}
/** Drop a device's engine (tests, deleted devices). */
export function releaseEngine(deviceId: string) { registry.delete(deviceId); }
export const registrySize = () => registry.size;

// ── Legacy `cells` view ──────────────────────────────────────────────────────

/** Bounds of the derived legacy view: big enough for every legacy reader, small enough for the doc. */
export const LEGACY_MAX_ROWS = 1000;
export const LEGACY_MAX_COLS = 52;
export const LEGACY_MAX_CELLS = 20_000;

export function scalarText(v: Scalar): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return numberToText(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v instanceof CellError) return v.code;
  return String(v);
}

/**
 * Sheet 1 flattened to A1 → computed value text (numbers unformatted, so old
 * readers can still compute with them), bounded by the LEGACY_* limits.
 * Includes dynamic-array spill cells.
 */
export function legacyView(engine: SheetEngine, wb: Workbook): { cells: Record<string, string>; rows: number; cols: number } {
  const sh = wb.sheets[0];
  const cells: Record<string, string> = {};
  let n = 0, maxR = -1, maxC = -1;
  if (sh) {
    const si = engine.sheetIndexOf(sh.id);
    forEachCell(sh.cells, (r, c) => {
      if (r > maxR) maxR = r; if (c > maxC) maxC = c;
      if (r >= LEGACY_MAX_ROWS || c >= LEGACY_MAX_COLS || n >= LEGACY_MAX_CELLS) return;
      const t = scalarText(engine.getValue(si, r, c));
      if (t !== '') { cells[toA1(r, c)] = t; n++; }
    });
    for (const sp of engine.getSpills(si)) {
      const a = sp.area;
      for (let r = a.r1; r <= Math.min(a.r2, LEGACY_MAX_ROWS - 1); r++) for (let c = a.c1; c <= Math.min(a.c2, LEGACY_MAX_COLS - 1); c++) {
        if (n >= LEGACY_MAX_CELLS) break;
        if (r > maxR) maxR = r; if (c > maxC) maxC = c;
        const k = toA1(r, c); if (k in cells) continue;
        const t = scalarText(engine.getValue(si, r, c)); if (t !== '') { cells[k] = t; n++; }
      }
    }
  }
  return { cells, rows: Math.max(sh?.rowCount ?? 0, maxR + 1, 1), cols: Math.max(sh?.colCount ?? 0, maxC + 1, 1) };
}

// ── Chart / external reads ───────────────────────────────────────────────────

/** "Sheet2!B2:B8" / "'My sheet'!B2:B8" / "B2:B8" → sheet id + bare range. */
export function splitSheetRange(engine: SheetEngine, ref: string): { sheetId: string; range: string } | null {
  const wb = engine.wb;
  const m = ref.trim().match(/^(?:'((?:[^']|'')+)'|([^!'\s]+))!(.+)$/);
  let sheetId = wb.sheets[0]?.id;
  let range = ref.trim();
  if (m) {
    const name = (m[1] ?? m[2]).replace(/''/g, "'");
    const sh = wb.sheets.find(s => s.name.toLowerCase() === name.toLowerCase());
    if (!sh) return null;
    sheetId = sh.id; range = m[3];
  }
  range = range.replace(/\$/g, '').toUpperCase();
  if (!sheetId || !parseRange(range)) return null;
  return { sheetId, range };
}

/** Chart labels from a Grid range (display text; empty cells fall back to their A1, like telaChartData). */
export function gridRangeLabels(device: GridDeviceLike, ref: string, ctx?: GridLinkContext): string[] {
  const engine = engineFor(device, ctx, { readOnly: true });
  const sr = splitSheetRange(engine, ref); if (!sr) return [];
  return rangeLabels(engine, sr.sheetId, sr.range);
}
/** Chart numbers from a Grid range (non-numbers → 0). */
export function gridRangeNumbers(device: GridDeviceLike, ref: string, ctx?: GridLinkContext): number[] {
  const engine = engineFor(device, ctx, { readOnly: true });
  const sr = splitSheetRange(engine, ref); if (!sr) return [];
  return rangeNumbers(engine, sr.sheetId, sr.range);
}
