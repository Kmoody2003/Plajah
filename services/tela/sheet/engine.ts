// engine — compile, dependency graph, and incremental recalculation.
//
// Formulas compile to closures once (AST → (frame) => Value). Cells live in
// per-sheet numeric-key Maps (row * 16384 + col). Precedents are indexed two
// ways: single-cell refs in a key → dependents map, and ranges in a segment
// tree over row blocks × 16-column blocks, so "who depends on C7?" is
// O(log rows), never a scan of every range (whole columns are one node).
//
// Recalc is pull-based: each dirty cell evaluates, and reading a dirty
// precedent computes it first (bounded recursion; past the bound the read
// throws NeedDep and an explicit stack takes over, so 100k-long chains in
// either direction never blow the JS stack). A cell met while it is being
// computed is a circular reference (reported; 0 like Excel, or iterated when
// workbook.calc.iterative is on). Dynamic arrays spill into empty cells; a
// blocked spill is #SPILL!, and spill-extent changes re-dirty readers and run
// another pass. External hooks resolve Tela cross-device refs (GridName!A1)
// and Base aggregates (SUM(Orders.price), COUNT(Orders)).

import { MAX_COLS, MAX_ROWS, parseA1, toA1, lettersToCol } from './address';
import { walk, type Node } from './ast';
import { broadcast, compareScalars, isMulti, matchKey, numberToText, scalarOf, toMatrix, toNum, toStr, type EngineAccess, type Frame } from './coerce';
import { jsDateToSerial } from './dates';
import { getFn, invoke, type FnDef } from './functions';
import { power } from './functions/math';
import { forEachCell, getCell, withCells, type Cell, type Sheet, type TableDef, type Workbook } from './model';
import { formatValue, type Formatted } from './numfmt';
import { parseFormula, refTextToNode } from './parser';
import { r1c1ToA1 } from './serialize';
import { CellError, ERR, Lambda, Matrix, OMITTED, Ref, type Area, type Scalar, type Value, errorFromCode, isErr } from './values';

// ── External resolution (Tela cross-device bindings) ─────────────────────────

export interface ExternalSheet {
  getValue(row: number, col: number): Scalar;
  /** Used extent (inclusive, 0-based) so whole-column refs stay bounded. */
  extent?(): { r2: number; c2: number };
}
export interface ExternalResolver {
  /** Another grid by Tela name/label/id → its cells. */
  sheet?(name: string): ExternalSheet | null;
  /** A Base/table column (`Orders.price`, `Orders[price]`) or whole table (`Orders`) → values. */
  table?(name: string, column?: string): Matrix | CellError | null;
  /** Legacy semantics for `COUNT(Base)` (= row count) / `SUM(Base)` (= first number field). Return null to fall through. */
  aggregate?(fn: string, name: string, column?: string): Scalar | null;
  /** Any other unknown bare name. */
  name?(name: string): Value | null;
}

export interface EngineOptions {
  resolver?: ExternalResolver;
  /** Wall clock for NOW()/TODAY() (tests pin it). */
  now?: () => Date;
  random?: () => number;
}

export interface RecalcStats { computed: number; passes: number; ms: number; cycles: number }

// ── Internal records ─────────────────────────────────────────────────────────

const CLEAN = 0, DIRTY = 1, COMPUTING = 2;
const MAX_DEPTH = 48;
const ROW_SHIFT = 3;                 // row block = 8 rows
const SEG_N = 1 << (20 - ROW_SHIFT); // leaves
const SEG_KEY = SEG_N * 2;           // node ids < 2*SEG_N
const WIDE_COLS = 32;                // ranges wider than this go to the per-sheet wide set

type Compiled = (f: Frame) => Value;

interface FCell {
  sheet: number; row: number; col: number; key: number;
  formula: string;
  ast: Node | null;
  parseError?: string;
  fn: Compiled;
  value: Scalar;
  spill: Matrix | null;
  spillArea: Area | null;
  wantArea: Area | null;
  state: number;
  waiting: boolean;
  volatile: boolean;
  external: boolean;
  usesHidden: boolean;
  isSubtotal: boolean;
  circular: boolean;
  cellRegs: [number, number][];  // [sheet, key]
  rangeRegs: RangeDep[];
}
/** One distinct range on a sheet and every formula that reads it (10k VLOOKUPs into $A$1:$B$10000 share one entry). */
interface RangeDep { sheet: number; r1: number; c1: number; r2: number; c2: number; cells: Set<FCell>; keys: number[]; wide: boolean; id: string }

interface ESheet {
  id: string;
  name: string;
  model: Sheet;
  values: Map<number, Scalar>;
  formulas: Map<number, FCell>;
  spillOwner: Map<number, FCell>;
  /** Anchors currently spilling on this sheet. */
  anchors: Set<FCell>;
  cellDeps: Map<number, Set<FCell>>;
  rangeIdx: Map<number, Set<RangeDep>>;
  wide: Set<RangeDep>;
  rangeGroups: Map<string, RangeDep>;
  hidden: Set<number>;
  filtered: Set<number>;
  maxRow: number;
  maxCol: number;
}

class NeedDep { constructor(public cell: FCell) {} }

const keyOf = (row: number, col: number) => row * MAX_COLS + col;

function segNodes(lo: number, hi: number): number[] {
  const out: number[] = [];
  let l = lo + SEG_N, r = hi + SEG_N + 1;
  while (l < r) { if (l & 1) out.push(l++); if (r & 1) out.push(--r); l >>= 1; r >>= 1; }
  return out;
}

const AGG_HOOK = new Set(['SUM', 'COUNT', 'COUNTA', 'AVG', 'AVERAGE', 'MIN', 'MAX']);

function storedToScalar(v: Cell['v']): Scalar {
  if (v === undefined) return null;
  return v;
}

// ── Engine ───────────────────────────────────────────────────────────────────

export class SheetEngine {
  wb!: Workbook;
  private sheets: ESheet[] = [];
  private sheetByName = new Map<string, number>();
  private sheetById = new Map<string, number>();
  private names = new Map<string, { ref: string; ast: Node | null; fn?: Compiled }>();
  private tables: { def: TableDef; sheet: number; r1: number; c1: number; r2: number; c2: number; headers: string[] }[] = [];
  private dirtyQueue: FCell[] = [];
  private depth = 0;
  private path: FCell[] = [];
  private rangeCache = new Map<string, Matrix>();
  private indexCache = new Map<string, Map<string, number>>();
  private matrixIndex = new WeakMap<Matrix, Map<string, number>>();
  private refTextCache = new Map<string, Compiled>();
  private spillDirty: { sheet: number; area: Area }[] = [];
  private blocked = new Set<FCell>();
  private cycleSet = new Set<FCell>();
  private allowStale = false;
  private override: { s: number; k: number; v: Scalar } | null = null;
  private nowSerial = 0;
  private computedCount = 0;
  readonly access: EngineAccess;
  lastStats: RecalcStats = { computed: 0, passes: 0, ms: 0, cycles: 0 };

  constructor(wb: Workbook, private opts: EngineOptions = {}) {
    const self = this;
    this.access = {
      cellValue: (s, r, c) => self.readCell(s, r, c),
      refMatrix: (ref, clamp) => self.refMatrix(ref, !!clamp),
      isRowHidden: (s, r, manual) => { const sh = self.sheets[s]; return !!sh && (sh.filtered.has(r) || (manual && sh.hidden.has(r))); },
      isFormulaCell: (s, r, c) => !!self.sheets[s]?.formulas.has(keyOf(r, c)),
      formulaText: (s, r, c) => self.sheets[s]?.formulas.get(keyOf(r, c))?.formula ?? null,
      isSubtotalCell: (s, r, c) => !!self.sheets[s]?.formulas.get(keyOf(r, c))?.isSubtotal,
      sheetIndex: name => self.sheetByName.get(name.toLowerCase()) ?? -1,
      sheetName: i => self.sheets[i]?.name ?? '',
      sheetCount: () => self.sheets.length,
      numFmtAt: (s, r, c) => self.numFmtAt(s, r, c),
      usedExtent: s => { const sh = self.sheets[s]; return sh ? { r2: sh.maxRow, c2: sh.maxCol } : { r2: -1, c2: -1 }; },
      parseRef: (text, a1, f) => self.parseRefText(text, a1, f),
      now: () => self.nowSerial || self.currentNow(),
      random: () => (self.opts.random ?? Math.random)(),
      lookupIndex: (src) => self.lookupIndex(src),
    };
    this.load(wb);
  }

  setResolver(r: ExternalResolver | undefined) { this.opts.resolver = r; this.invalidateExternal(); }

  // ── Loading ────────────────────────────────────────────────────────────────

  /** Full rebuild from a workbook (sheets, names, tables, dependency graph) + recalc. */
  load(wb: Workbook): RecalcStats {
    this.wb = wb;
    this.sheets = [];
    this.sheetByName.clear(); this.sheetById.clear();
    this.names.clear(); this.refTextCache.clear();
    this.dirtyQueue = []; this.blocked.clear(); this.cycleSet.clear();
    wb.sheets.forEach((s, i) => {
      this.sheets.push(this.makeESheet(s));
      this.sheetByName.set(s.name.toLowerCase(), i);
      this.sheetById.set(s.id, i);
    });
    for (const n of wb.names) {
      const scope = n.sheetId !== undefined ? this.sheetById.get(n.sheetId) : undefined;
      const key = (scope !== undefined ? `${scope}!` : '') + n.name.toLowerCase();
      let ast: Node | null = null;
      try { ast = parseFormula(n.ref); } catch { ast = null; }
      this.names.set(key, { ref: n.ref, ast });
    }
    this.buildTables();
    const all: FCell[] = [];
    this.sheets.forEach((sh, si) => {
      forEachCell(sh.model.cells, (row, col, cell) => {
        const k = keyOf(row, col);
        if (cell.f !== undefined && cell.f !== '') {
          const fc = this.newFCell(si, row, col, cell.f, cell);
          sh.formulas.set(k, fc);
          all.push(fc);
        } else if (cell.v !== undefined) sh.values.set(k, storedToScalar(cell.v));
        if (row > sh.maxRow) sh.maxRow = row;
        if (col > sh.maxCol) sh.maxCol = col;
      });
    });
    for (const fc of all) this.register(fc);
    all.sort((x, y) => x.sheet - y.sheet || x.key - y.key);
    for (const fc of all) { fc.state = DIRTY; this.dirtyQueue.push(fc); }
    if (wb.calc?.manual) return this.lastStats;
    return this.recalc();
  }

  private makeESheet(s: Sheet): ESheet {
    return {
      id: s.id, name: s.name, model: s,
      values: new Map(), formulas: new Map(), spillOwner: new Map(), anchors: new Set(), cellDeps: new Map(), rangeIdx: new Map(), wide: new Set(), rangeGroups: new Map(),
      hidden: new Set(s.hiddenRows ?? []), filtered: new Set(s.filteredRows ?? []),
      maxRow: -1, maxCol: -1,
    };
  }

  private buildTables() {
    this.tables = [];
    this.sheets.forEach((sh, si) => {
      for (const t of sh.model.tables ?? []) {
        const [p, q] = t.range.split(':');
        const a = parseA1(p), b = parseA1(q ?? p);
        if (!a || !b) continue;
        const headers: string[] = [];
        for (let c = a.col; c <= b.col; c++) {
          const cell = getCell(sh.model.cells, a.row, c);
          headers.push(String(cell?.v ?? `Column${c - a.col + 1}`).toLowerCase());
        }
        this.tables.push({ def: t, sheet: si, r1: a.row, c1: a.col, r2: b.row, c2: b.col, headers });
      }
    });
  }

  /**
   * Sync to a new immutable workbook. Unchanged sheets/cells are skipped by
   * reference; structural changes (sheet list, names, tables) rebuild fully.
   */
  update(next: Workbook): RecalcStats {
    const prev = this.wb;
    if (next === prev) return this.lastStats;
    const structural = next.sheets.length !== prev.sheets.length || next.names !== prev.names
      || next.sheets.some((s, i) => s.id !== prev.sheets[i].id || s.name !== prev.sheets[i].name || s.tables !== prev.sheets[i].tables);
    if (structural) return this.load(next);
    this.wb = next;
    this.rangeCache.clear(); this.indexCache.clear();
    next.sheets.forEach((ns, si) => {
      const ps = prev.sheets[si];
      if (ns === ps) return;
      const es = this.sheets[si];
      es.model = ns;
      if (ns.cells !== ps.cells) {
        // Rows are immutable objects: unchanged rows are skipped by identity.
        const pc = ps.cells, nc = ns.cells;
        for (const rk in nc) {
          const nr = nc[rk], pr = pc[rk];
          if (nr === pr) continue;
          const r = +rk;
          for (const ck in nr) if (!pr || pr[ck] !== nr[ck]) this.applyCellChange(si, r, +ck, pr?.[ck], nr[ck]);
          if (pr) for (const ck in pr) if (!(ck in nr)) this.applyCellChange(si, r, +ck, pr[ck], undefined);
        }
        for (const rk in pc) if (!(rk in nc)) for (const ck in pc[rk]) this.applyCellChange(si, +rk, +ck, pc[rk][ck], undefined);
      }
      if (ns.hiddenRows !== ps.hiddenRows || ns.filteredRows !== ps.filteredRows) {
        es.hidden = new Set(ns.hiddenRows ?? []);
        es.filtered = new Set(ns.filteredRows ?? []);
        const seeds: FCell[] = [];
        for (const s of this.sheets) for (const fc of s.formulas.values()) if (fc.usesHidden) seeds.push(fc);
        this.markDirty(seeds);
      }
    });
    if (next.calc?.manual) return this.lastStats;
    return this.recalc();
  }

  private applyCellChange(si: number, row: number, col: number, prev: Cell | undefined, next: Cell | undefined) {
    if (prev && next && prev.f === next.f && prev.v === next.v) {
      // Style / note only. CELL("format") is volatile, so nothing to do.
      return;
    }
    const a = { row, col };
    const es = this.sheets[si];
    const k = keyOf(a.row, a.col);
    const old = es.formulas.get(k);
    if (old) {
      this.unregister(old);
      if (old.spillArea) { this.queueSpillDirty(old.sheet, old.spillArea); this.clearSpill(old); }
      es.formulas.delete(k);
      this.blocked.delete(old);
      this.cycleSet.delete(old);
    }
    es.values.delete(k);
    if (next?.f !== undefined && next.f !== '') {
      const fc = this.newFCell(si, a.row, a.col, next.f, next);
      es.formulas.set(k, fc);
      this.register(fc);
      fc.state = DIRTY; this.dirtyQueue.push(fc);
    } else if (next?.v !== undefined) es.values.set(k, storedToScalar(next.v));
    if (next) { if (a.row > es.maxRow) es.maxRow = a.row; if (a.col > es.maxCol) es.maxCol = a.col; }
    this.cellChanged(si, a.row, a.col);
  }

  /** A literal changed at (s,row,col): dirty its dependents, the spill it sits in, and blocked spills over it. */
  private cellChanged(s: number, row: number, col: number) {
    const seeds = this.dependentsOf(s, row, col);
    const es = this.sheets[s];
    const owner = es.spillOwner.get(keyOf(row, col));
    if (owner) seeds.push(owner);
    for (const b of this.blocked) if (b.sheet === s && b.wantArea && row >= b.wantArea.r1 && row <= b.wantArea.r2 && col >= b.wantArea.c1 && col <= b.wantArea.c2) seeds.push(b);
    this.markDirty(seeds);
  }

  // ── Formula cells & dependency registration ───────────────────────────────

  private newFCell(sheet: number, row: number, col: number, formula: string, cell?: Cell): FCell {
    const fc: FCell = {
      sheet, row, col, key: keyOf(row, col), formula, ast: null, fn: () => ERR.NAME,
      value: cell?.c !== undefined ? (typeof cell.c === 'object' && cell.c !== null ? errorFromCode(cell.c.e) ?? ERR.VALUE : cell.c) : 0,
      spill: null, spillArea: null, wantArea: null, state: CLEAN, waiting: false,
      volatile: false, external: false, usesHidden: false, isSubtotal: false, circular: false, cellRegs: [], rangeRegs: [],
    };
    try {
      fc.ast = parseFormula(formula);
      fc.fn = this.compile(fc.ast, new Set(), sheet);
    } catch (e) {
      fc.parseError = (e as Error).message;
      fc.fn = () => ERR.NAME;
    }
    return fc;
  }

  private register(fc: FCell) {
    if (!fc.ast) return;
    const seenNames = new Set<string>();
    const visit = (n: Node, host: number) => {
      walk(n, x => {
        switch (x.t) {
          case 'ref': {
            const sheets = this.sheetSpan(x.sheet, x.sheet2, host);
            if (!sheets) { fc.external = true; return; }
            for (const s of sheets) this.addCellDep(fc, s, x.row, x.col);
            return;
          }
          case 'range': {
            const sheets = this.sheetSpan(x.sheet, x.sheet2, host);
            if (!sheets) { fc.external = true; return; }
            for (const s of sheets) this.addRangeDep(fc, s, x.r1, x.c1, x.r2, x.c2);
            return;
          }
          case 'struct': {
            const t = this.tableFor(x.table, fc);
            if (!t) { fc.external = true; return; }
            this.addRangeDep(fc, t.sheet, t.r1, t.c1, t.r2, t.c2);
            return;
          }
          case 'name': {
            const nm = this.lookupName(x.name, x.sheet !== undefined ? this.sheetByName.get(x.sheet.toLowerCase()) : host);
            if (!nm) { fc.external = true; return; }
            const key = x.name.toLowerCase();
            if (seenNames.has(key) || !nm.ast) return;
            seenNames.add(key);
            visit(nm.ast, host);
            return;
          }
          case 'call': {
            const d = getFn(x.name);
            if (!d) {
              const nm = this.lookupName(x.name, host);
              if (nm?.ast && !seenNames.has(x.name.toLowerCase())) { seenNames.add(x.name.toLowerCase()); visit(nm.ast, host); }
              return;
            }
            if (d.volatile || d.dynamicRefs) fc.volatile = true;
            if (d.usesHidden) fc.usesHidden = true;
            return;
          }
        }
      });
    };
    visit(fc.ast, fc.sheet);
    // Excel only skips nested SUBTOTALs when the formula is a SUBTOTAL at heart.
    if (fc.ast.t === 'call' && (fc.ast.name === 'SUBTOTAL' || fc.ast.name === 'AGGREGATE')) fc.isSubtotal = true;
  }

  private sheetSpan(sheet: string | undefined, sheet2: string | undefined, host: number): number[] | null {
    if (sheet === undefined) return [host];
    const a = this.sheetByName.get(sheet.toLowerCase());
    if (a === undefined) return null;
    if (!sheet2) return [a];
    const b = this.sheetByName.get(sheet2.toLowerCase());
    if (b === undefined) return null;
    const out: number[] = [];
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.push(i);
    return out;
  }

  private addCellDep(fc: FCell, s: number, row: number, col: number) {
    const k = keyOf(row, col);
    const es = this.sheets[s];
    let set = es.cellDeps.get(k);
    if (!set) { set = new Set(); es.cellDeps.set(k, set); }
    set.add(fc);
    fc.cellRegs.push([s, k]);
  }

  private addRangeDep(fc: FCell, s: number, r1: number, c1: number, r2: number, c2: number) {
    const es = this.sheets[s];
    if (r1 === r2 && c1 === c2) { this.addCellDep(fc, s, r1, c1); return; }
    const id = `${r1}:${c1}:${r2}:${c2}`;
    let dep = es.rangeGroups.get(id);
    if (!dep) {
      dep = { sheet: s, r1, c1, r2, c2, cells: new Set(), keys: [], wide: c2 - c1 >= WIDE_COLS, id };
      es.rangeGroups.set(id, dep);
      if (dep.wide) es.wide.add(dep);
      else {
        // Segment tree over 8-row blocks, one tree per column.
        const nodes = segNodes(r1 >> ROW_SHIFT, r2 >> ROW_SHIFT);
        for (let c = c1; c <= c2; c++) for (const nd of nodes) {
          const key = c * SEG_KEY + nd;
          let set = es.rangeIdx.get(key);
          if (!set) { set = new Set(); es.rangeIdx.set(key, set); }
          set.add(dep);
          dep.keys.push(key);
        }
      }
    }
    if (!dep.cells.has(fc)) { dep.cells.add(fc); fc.rangeRegs.push(dep); }
  }

  private unregister(fc: FCell) {
    for (const [s, k] of fc.cellRegs) { const set = this.sheets[s]?.cellDeps.get(k); if (set) { set.delete(fc); if (!set.size) this.sheets[s].cellDeps.delete(k); } }
    for (const d of fc.rangeRegs) {
      const es = this.sheets[d.sheet]; if (!es) continue;
      d.cells.delete(fc);
      if (d.cells.size) continue;
      es.rangeGroups.delete(d.id);
      if (d.wide) es.wide.delete(d);
      else for (const key of d.keys) { const set = es.rangeIdx.get(key); if (set) { set.delete(d); if (!set.size) es.rangeIdx.delete(key); } }
    }
    fc.cellRegs = []; fc.rangeRegs = [];
  }

  /** Formula cells that read (s,row,col) directly or through a range. */
  private dependentsOf(s: number, row: number, col: number): FCell[] {
    const es = this.sheets[s]; if (!es) return [];
    const out: FCell[] = [];
    const direct = es.cellDeps.get(keyOf(row, col));
    if (direct) for (const fc of direct) out.push(fc);
    if (es.rangeIdx.size) {
      const base = col * SEG_KEY;
      for (let nd = (row >> ROW_SHIFT) + SEG_N; nd >= 1; nd >>= 1) {
        const set = es.rangeIdx.get(base + nd);
        if (set) for (const d of set) if (row >= d.r1 && row <= d.r2) for (const fc of d.cells) out.push(fc);
      }
    }
    if (es.wide.size) for (const d of es.wide) if (row >= d.r1 && row <= d.r2 && col >= d.c1 && col <= d.c2) for (const fc of d.cells) out.push(fc);
    return out;
  }

  /** Mark cells and everything downstream dirty (iterative BFS). */
  private markDirty(seeds: FCell[]) {
    const q: FCell[] = [];
    for (const fc of seeds) if (fc.state === CLEAN) { fc.state = DIRTY; this.dirtyQueue.push(fc); q.push(fc); }
    while (q.length) {
      const fc = q.pop()!;
      const next = this.dependentsOf(fc.sheet, fc.row, fc.col);
      if (fc.spillArea) {
        const a = fc.spillArea;
        if ((a.r2 - a.r1 + 1) * (a.c2 - a.c1 + 1) <= 100000)
          for (let r = a.r1; r <= a.r2; r++) for (let c = a.c1; c <= a.c2; c++) if (r !== fc.row || c !== fc.col) for (const d of this.dependentsOf(fc.sheet, r, c)) next.push(d);
      }
      for (const d of next) if (d.state === CLEAN) { d.state = DIRTY; this.dirtyQueue.push(d); q.push(d); }
    }
  }

  private queueSpillDirty(sheet: number, area: Area) { this.spillDirty.push({ sheet, area }); }

  // ── Recalculation ─────────────────────────────────────────────────────────

  private currentNow(): number { return jsDateToSerial(this.opts.now ? this.opts.now() : new Date()); }

  /** Recalculate dirty cells (and volatile ones). */
  recalc(): RecalcStats {
    const t0 = Date.now();
    this.nowSerial = this.currentNow();
    this.computedCount = 0;
    this.rangeCache.clear(); this.indexCache.clear();
    const vol: FCell[] = [];
    for (const s of this.sheets) for (const fc of s.formulas.values()) if (fc.volatile && fc.state === CLEAN) vol.push(fc);
    this.markDirty(vol);
    for (const fc of this.dirtyQueue) if (fc.circular || this.cycleSet.has(fc)) { fc.circular = false; this.cycleSet.delete(fc); }
    let passes = 0;
    while ((this.dirtyQueue.length || this.spillDirty.length) && passes < 24) {
      passes++;
      const list = this.dirtyQueue; this.dirtyQueue = [];
      for (const fc of list) if (fc.state === DIRTY) this.computeRoot(fc);
      if (this.spillDirty.length) {
        const areas = this.spillDirty; this.spillDirty = [];
        this.rangeCache.clear(); this.indexCache.clear();
        const seeds: FCell[] = [];
        for (const { sheet, area } of areas) {
          const cells = (area.r2 - area.r1 + 1) * (area.c2 - area.c1 + 1);
          if (cells > 200000) continue;
          for (let r = area.r1; r <= area.r2; r++) for (let c = area.c1; c <= area.c2; c++) for (const d of this.dependentsOf(sheet, r, c)) seeds.push(d);
        }
        this.markDirty(seeds);
      }
      if (this.cycleSet.size && !this.dirtyQueue.length) this.resolveCycles();
    }
    this.nowSerial = 0;
    this.lastStats = { computed: this.computedCount, passes, ms: Date.now() - t0, cycles: this.cycleSet.size };
    return this.lastStats;
  }

  /** Circular cells: 0 (Excel's display) or iterative calculation when enabled. */
  private resolveCycles() {
    const calc = this.wb.calc;
    const cyc = [...this.cycleSet].filter(fc => !fc.circular);
    if (!cyc.length) return;
    for (const fc of cyc) fc.circular = true;
    if (calc?.iterative) {
      const maxIt = Math.max(1, calc.maxIterations ?? 100), maxChange = calc.maxChange ?? 0.001;
      this.allowStale = true;
      for (let it = 0; it < maxIt; it++) {
        let delta = 0;
        for (const fc of cyc) {
          const before = fc.value;
          fc.state = DIRTY;
          this.computeRoot(fc);
          if (typeof before === 'number' && typeof fc.value === 'number') delta = Math.max(delta, Math.abs(fc.value - before));
          else if (before !== fc.value) delta = Infinity;
        }
        if (delta < maxChange) break;
      }
      this.allowStale = false;
    } else {
      for (const fc of cyc) { fc.value = 0; fc.spill = null; fc.state = CLEAN; }
    }
    const seeds: FCell[] = [];
    for (const fc of cyc) for (const d of this.dependentsOf(fc.sheet, fc.row, fc.col)) if (!d.circular) seeds.push(d);
    this.markDirty(seeds);
  }

  private computeRoot(root: FCell) {
    const stack: FCell[] = [root];
    while (stack.length) {
      const fc = stack[stack.length - 1];
      if (fc.state === CLEAN) { stack.pop(); fc.waiting = false; continue; }
      try {
        this.depth = 0;
        this.compute(fc);
        stack.pop(); fc.waiting = false;
      } catch (e) {
        if (!(e instanceof NeedDep)) throw e;
        fc.waiting = true;
        stack.push(e.cell);
      }
    }
  }

  private compute(fc: FCell) {
    fc.state = COMPUTING;
    this.depth++;
    this.path.push(fc);
    let v: Value;
    try {
      v = fc.fn({ e: this.access, s: fc.sheet, row: fc.row, col: fc.col, vars: null });
      // Dereference inside the computing window so cycles through `=A1` are seen whole.
      if (v instanceof Ref) v = this.derefResult(v);
    } catch (e) {
      if (e instanceof NeedDep) { this.depth--; this.path.pop(); fc.state = DIRTY; throw e; }
      if ((globalThis as { __SHEET_DEBUG__?: boolean }).__SHEET_DEBUG__) console.error(e);
      v = ERR.VALUE; // a function bug must not abort the whole recalc
    }
    this.depth--; this.path.pop();
    this.setResult(fc, v);
    fc.state = CLEAN;
    this.computedCount++;
  }

  /** Read hook for a precedent that may be dirty. */
  private ensure(fc: FCell) {
    if (fc.state === COMPUTING || fc.waiting) {
      if (this.allowStale && fc.circular) return;
      // Circular reference: record the loop, read the stale value.
      const i = this.path.indexOf(fc);
      if (i >= 0) for (const c of this.path.slice(i)) this.cycleSet.add(c);
      this.cycleSet.add(fc);
      return;
    }
    if (fc.state === DIRTY) {
      if (this.depth >= MAX_DEPTH) throw new NeedDep(fc);
      this.compute(fc);
    }
  }

  private setResult(fc: FCell, v: Value) {
    if (v instanceof Ref) v = this.derefResult(v);
    if (v instanceof Lambda) v = ERR.CALC;
    if (v === OMITTED) v = 0;
    if (v instanceof Matrix && v.rows === 1 && v.cols === 1) v = v.data[0][0];
    if (v instanceof Matrix) {
      if (v.rows === 0 || v.cols === 0) { this.clearSpill(fc); fc.value = ERR.CALC; return; }
      this.applySpill(fc, v);
      return;
    }
    if (fc.spillArea) { this.queueSpillDirty(fc.sheet, fc.spillArea); this.clearSpill(fc); }
    if (fc.wantArea) { this.blocked.delete(fc); fc.wantArea = null; }
    fc.spill = null;
    let s = v as Scalar;
    if (s === null) s = 0;
    else if (typeof s === 'number' && !Number.isFinite(s)) s = ERR.NUM;
    fc.value = s;
  }

  private derefResult(r: Ref): Value {
    if (r.areas.length !== 1) return ERR.VALUE;
    if (r.isCell) { const v = r.ext ? this.refMatrix(r, false).get(0, 0) : this.readCell(r.sheet, r.areas[0].r1, r.areas[0].c1); return v === null ? 0 : v; }
    return this.refMatrix(r, false);
  }

  private applySpill(fc: FCell, m: Matrix) {
    const es = this.sheets[fc.sheet];
    const area: Area = { r1: fc.row, c1: fc.col, r2: fc.row + m.rows - 1, c2: fc.col + m.cols - 1 };
    let blocked = area.r2 >= MAX_ROWS || area.c2 >= MAX_COLS || m.rows * m.cols > 5_000_000;
    if (!blocked) {
      outer: for (let r = area.r1; r <= area.r2; r++) for (let c = area.c1; c <= area.c2; c++) {
        if (r === fc.row && c === fc.col) continue;
        const k = keyOf(r, c);
        if (es.values.has(k) || es.formulas.has(k)) { blocked = true; break outer; }
        const o = es.spillOwner.get(k);
        if (o && o !== fc && o.spillArea) { blocked = true; break outer; }
      }
    }
    if (blocked) {
      if (fc.spillArea) { this.queueSpillDirty(fc.sheet, fc.spillArea); this.clearSpill(fc); }
      fc.spill = null; fc.value = ERR.SPILL; fc.wantArea = area; this.blocked.add(fc);
      return;
    }
    if (fc.wantArea) { this.blocked.delete(fc); fc.wantArea = null; }
    const old = fc.spillArea;
    const same = old && old.r1 === area.r1 && old.c1 === area.c1 && old.r2 === area.r2 && old.c2 === area.c2;
    if (!same) {
      if (old) { this.queueSpillDirty(fc.sheet, old); this.clearSpill(fc); }
      for (let r = area.r1; r <= area.r2; r++) for (let c = area.c1; c <= area.c2; c++) if (r !== fc.row || c !== fc.col) es.spillOwner.set(keyOf(r, c), fc);
      fc.spillArea = area;
      es.anchors.add(fc);
      if (area.r2 > es.maxRow) es.maxRow = area.r2;
      if (area.c2 > es.maxCol) es.maxCol = area.c2;
      this.queueSpillDirty(fc.sheet, area);
      this.rangeCache.clear();
    } else {
      // Same extent, new values: readers of the spilled cells are dependents via cellDeps/ranges.
      this.queueSpillDirtyIfChanged(fc, m);
    }
    fc.spill = new Matrix(m.data.map(row => row.map(x => (x === null ? 0 : typeof x === 'number' && !Number.isFinite(x) ? ERR.NUM : x))));
    fc.value = fc.spill.data[0][0];
  }

  private queueSpillDirtyIfChanged(fc: FCell, m: Matrix) {
    const old = fc.spill;
    if (!old) { this.queueSpillDirty(fc.sheet, fc.spillArea!); return; }
    for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) {
      const a = old.data[r][c], b = m.data[r][c] === null ? 0 : m.data[r][c];
      if (a !== b && !(a instanceof CellError && b instanceof CellError && a.code === b.code)) { this.queueSpillDirty(fc.sheet, fc.spillArea!); this.rangeCache.clear(); return; }
    }
  }

  private clearSpill(fc: FCell) {
    const a = fc.spillArea; if (!a) return;
    const es = this.sheets[fc.sheet];
    for (let r = a.r1; r <= a.r2; r++) for (let c = a.c1; c <= a.c2; c++) { const k = keyOf(r, c); if (es.spillOwner.get(k) === fc) es.spillOwner.delete(k); }
    fc.spillArea = null;
    es.anchors.delete(fc);
    this.rangeCache.clear();
  }

  // ── Reading values during evaluation ──────────────────────────────────────

  private readCell(s: number, row: number, col: number): Scalar {
    const es = this.sheets[s];
    if (!es) return ERR.REF;
    const k = row * MAX_COLS + col;
    if (this.override && this.override.s === s && this.override.k === k) return this.override.v;
    const fc = es.formulas.get(k);
    if (fc !== undefined) {
      if (fc.state !== CLEAN) this.ensure(fc);
      return fc.value;
    }
    const v = es.values.get(k);
    if (v !== undefined) return v;
    if (es.spillOwner.size) {
      const o = es.spillOwner.get(k);
      if (o) {
        if (o.state !== CLEAN) this.ensure(o);
        const a = o.spillArea;
        if (a && o.spill && row >= a.r1 && row <= a.r2 && col >= a.c1 && col <= a.c2) return o.spill.data[row - a.r1][col - a.c1];
      }
    }
    return null;
  }

  /** Values of a single-area Ref. `clamp` trims to the used extent (aggregates over A:A). */
  private refMatrix(ref: Ref, clamp: boolean): Matrix {
    const m = this.refMatrixRaw(ref, clamp);
    const o = this.override;
    if (o && o.s === ref.sheet && ref.ext === undefined) {
      const a = ref.areas[0], row = Math.floor(o.k / MAX_COLS), col = o.k % MAX_COLS;
      if (row >= a.r1 && col >= a.c1 && row - a.r1 < m.rows && col - a.c1 < m.cols) {
        const data = m.data.map(r => r.slice());
        data[row - a.r1][col - a.c1] = o.v;
        return new Matrix(data);
      }
    }
    return m;
  }

  private refMatrixRaw(ref: Ref, clamp: boolean): Matrix {
    const a = ref.areas[0];
    if (ref.ext !== undefined) return this.extMatrix(ref.ext, a, clamp);
    const es = this.sheets[ref.sheet];
    if (!es) return new Matrix([[ERR.REF]]);
    let { r2, c2 } = a;
    const cells = (a.r2 - a.r1 + 1) * (a.c2 - a.c1 + 1);
    if (clamp || cells > 2_000_000) { r2 = Math.min(r2, es.maxRow); c2 = Math.min(c2, es.maxCol); }
    if (r2 < a.r1 || c2 < a.c1) return clamp ? new Matrix([]) : new Matrix([[null]]);
    const ck = `${ref.sheet}:${a.r1}:${a.c1}:${r2}:${c2}`;
    const hit = this.rangeCache.get(ck);
    if (hit) return hit;
    const rows = r2 - a.r1 + 1, cols = c2 - a.c1 + 1;
    // Make sure every formula inside is computed first.
    if (es.formulas.size) {
      if (rows * cols <= es.formulas.size * 2) {
        for (let r = a.r1; r <= r2; r++) for (let c = a.c1; c <= c2; c++) { const fc = es.formulas.get(r * MAX_COLS + c); if (fc && fc.state !== CLEAN) this.ensure(fc); }
      } else {
        for (const fc of es.formulas.values()) if (fc.state !== CLEAN && fc.row >= a.r1 && fc.row <= r2 && fc.col >= a.c1 && fc.col <= c2) this.ensure(fc);
      }
    }
    if (es.anchors.size) for (const o of es.anchors) {
      const sa = o.spillArea;
      if (o.state !== CLEAN && sa && sa.r1 <= r2 && a.r1 <= sa.r2 && sa.c1 <= c2 && a.c1 <= sa.c2) this.ensure(o);
    }
    const data: Scalar[][] = new Array(rows);
    const spills = es.spillOwner.size > 0;
    for (let r = 0; r < rows; r++) {
      const row: Scalar[] = new Array(cols);
      const base = (a.r1 + r) * MAX_COLS + a.c1;
      for (let c = 0; c < cols; c++) {
        const k = base + c;
        const fc = es.formulas.get(k);
        if (fc !== undefined) { row[c] = fc.value; continue; }
        const v = es.values.get(k);
        if (v !== undefined) { row[c] = v; continue; }
        if (spills) {
          const o = es.spillOwner.get(k);
          if (o && o.spill && o.spillArea) { row[c] = o.spill.data[a.r1 + r - o.spillArea.r1][a.c1 + c - o.spillArea.c1]; continue; }
        }
        row[c] = null;
      }
      data[r] = row;
    }
    const m = new Matrix(data);
    this.rangeCache.set(ck, m);
    return m;
  }

  private extMatrix(name: string, a: Area, clamp: boolean): Matrix {
    const ext = this.opts.resolver?.sheet?.(name);
    if (!ext) return new Matrix([[ERR.REF]]);
    let { r2, c2 } = a;
    const e = ext.extent?.();
    if (e && (clamp || (r2 - a.r1 + 1) * (c2 - a.c1 + 1) > 2_000_000)) { r2 = Math.min(r2, e.r2); c2 = Math.min(c2, e.c2); }
    if (r2 < a.r1 || c2 < a.c1) return new Matrix(clamp ? [] : [[null]]);
    const data: Scalar[][] = [];
    for (let r = a.r1; r <= r2; r++) { const row: Scalar[] = []; for (let c = a.c1; c <= c2; c++) row.push(ext.getValue(r, c)); data.push(row); }
    return new Matrix(data);
  }

  private lookupIndex(src: Ref | Matrix): Map<string, number> | null {
    if (src instanceof Matrix) {
      let idx = this.matrixIndex.get(src);
      if (!idx) { idx = buildIndex(src); this.matrixIndex.set(src, idx); }
      return idx;
    }
    if (src.areas.length !== 1 || src.ext !== undefined) return null;
    const a = src.areas[0];
    const ck = `${src.sheet}:${a.r1}:${a.c1}:${a.r2}:${a.c2}`;
    let idx = this.indexCache.get(ck);
    if (!idx) { idx = buildIndex(this.refMatrix(src, false)); this.indexCache.set(ck, idx); }
    return idx;
  }

  private numFmtAt(s: number, row: number, col: number): string {
    const sh = this.sheets[s]; if (!sh) return 'General';
    const cell = getCell(sh.model.cells, row, col);
    let st = cell?.s;
    if (st === undefined) { const o = sh.spillOwner.get(keyOf(row, col)); if (o) st = getCell(sh.model.cells, o.row, o.col)?.s; }
    return (st !== undefined ? this.wb.styles[st]?.numFmt : undefined) ?? 'General';
  }

  // ── Names, tables, INDIRECT ───────────────────────────────────────────────

  private lookupName(name: string, sheet?: number) {
    const low = name.toLowerCase();
    if (sheet !== undefined) { const scoped = this.names.get(`${sheet}!${low}`); if (scoped) return scoped; }
    return this.names.get(low);
  }

  private tableFor(name: string, fc?: { sheet: number; row: number; col: number }) {
    if (!name && fc) return this.tables.find(t => t.sheet === fc.sheet && fc.row >= t.r1 && fc.row <= t.r2 && fc.col >= t.c1 && fc.col <= t.c2);
    const low = name.toLowerCase();
    return this.tables.find(t => t.def.name.toLowerCase() === low);
  }

  private parseRefText(text: string, a1: boolean, f: Frame): Ref | CellError {
    let src = text.trim();
    if (!src) return ERR.REF;
    if (!a1) src = r1c1ToA1(src, f.row, f.col);
    const ck = `${f.s}|${src}`;
    let fn = this.refTextCache.get(ck);
    if (!fn) {
      try {
        const ast = parseFormula(src);
        if (!['ref', 'range', 'name', 'bin', 'struct'].includes(ast.t)) return ERR.REF;
        fn = this.compile(ast, new Set(), f.s);
      } catch { return ERR.REF; }
      if (this.refTextCache.size > 5000) this.refTextCache.clear();
      this.refTextCache.set(ck, fn);
    }
    const v = fn({ ...f, vars: null });
    return v instanceof Ref ? v : ERR.REF;
  }

  // ── Compiler ──────────────────────────────────────────────────────────────

  private compile(node: Node, scope: Set<string>, host: number): Compiled {
    const self = this;
    switch (node.t) {
      case 'num': { const v = node.v; return () => v; }
      case 'str': { const v = node.v; return () => v; }
      case 'bool': { const v = node.v; return () => v; }
      case 'err': { const e = errorFromCode(node.v) ?? ERR.VALUE; return () => e; }
      case 'refErr': return () => ERR.REF;
      case 'missing': return () => OMITTED;
      case 'paren': return this.compile(node.a, scope, host);
      case 'array': {
        const m = new Matrix(node.rows.map(r => r.map(x => (x.t === 'num' || x.t === 'str' || x.t === 'bool' ? x.v : x.t === 'err' ? errorFromCode(x.v) ?? ERR.VALUE : null))));
        return () => m;
      }
      case 'ref': {
        const { row, col } = node;
        if (node.sheet2) return this.compile3D(node.sheet!, node.sheet2, { r1: row, c1: col, r2: row, c2: col });
        const s = node.sheet === undefined ? host : this.sheetByName.get(node.sheet.toLowerCase());
        if (s === undefined) {
          const ext = node.sheet!;
          return () => new Ref(-1, [{ r1: row, c1: col, r2: row, c2: col }], ext);
        }
        if (node.spill) return () => self.spillRef(s, row, col);
        const area = [{ r1: row, c1: col, r2: row, c2: col }];
        return () => new Ref(s, area);
      }
      case 'range': {
        const area = { r1: node.r1, c1: node.c1, r2: node.r2, c2: node.c2 };
        if (node.sheet2) return this.compile3D(node.sheet!, node.sheet2, area);
        const s = node.sheet === undefined ? host : this.sheetByName.get(node.sheet.toLowerCase());
        if (s === undefined) { const ext = node.sheet!; return () => new Ref(-1, [area], ext); }
        const areas = [area];
        return () => new Ref(s, areas);
      }
      case 'struct': {
        return (f: Frame) => {
          const t = self.tableFor(node.table, { sheet: f.s, row: f.row, col: f.col });
          if (!t) {
            const r = self.opts.resolver?.table?.(node.table, node.column);
            return r ?? ERR.REF;
          }
          let r1 = t.r1, r2 = t.r2, c1 = t.c1, c2 = t.c2;
          const hasHeader = t.def.headerRow !== false, hasTotals = !!t.def.totalsRow;
          const item = node.item ?? 'data';
          if (item === 'data' || item === 'thisRow') { if (hasHeader) r1++; if (hasTotals) r2--; }
          if (item === 'headers') { if (!hasHeader) return ERR.REF; r2 = r1; }
          if (item === 'totals') { if (!hasTotals) return ERR.REF; r1 = r2; }
          if (item === 'thisRow') { if (f.row < r1 || f.row > r2) return ERR.VALUE; r1 = r2 = f.row; }
          if (node.column !== undefined) {
            const i = t.headers.indexOf(node.column.toLowerCase());
            if (i < 0) return ERR.REF;
            const j = node.column2 !== undefined ? t.headers.indexOf(node.column2.toLowerCase()) : i;
            if (j < 0) return ERR.REF;
            c1 = t.c1 + Math.min(i, j); c2 = t.c1 + Math.max(i, j);
          }
          return new Ref(t.sheet, [{ r1, c1, r2, c2 }]);
        };
      }
      case 'name': {
        const low = node.name.toLowerCase();
        if (scope.has(low) && node.sheet === undefined) return (f: Frame) => { const v = f.vars?.get(low); return v === undefined ? ERR.NAME : v; };
        const scopeSheet = node.sheet !== undefined ? this.sheetByName.get(node.sheet.toLowerCase()) : host;
        const nm = this.lookupName(node.name, scopeSheet);
        if (nm) {
          return (f: Frame) => {
            if (!nm.fn) {
              if (!nm.ast) return ERR.NAME;
              nm.fn = () => ERR.NAME; // recursion guard while compiling
              nm.fn = self.compile(nm.ast, new Set(), scopeSheet ?? host);
            }
            return nm.fn({ ...f, vars: null });
          };
        }
        const name = node.name;
        return () => {
          const r = self.opts.resolver;
          const v = r?.name?.(name);
          if (v !== undefined && v !== null) return v;
          const dot = name.indexOf('.');
          const t = dot > 0 ? r?.table?.(name.slice(0, dot), name.slice(dot + 1)) : r?.table?.(name);
          return t ?? ERR.NAME;
        };
      }
      case 'unary': {
        const a = this.compile(node.a, scope, host);
        if (node.op === '+') return a;
        if (node.op === '@') return (f: Frame) => { const v = a(f); return v instanceof Matrix ? (v.rows ? v.data[0][0] : ERR.VALUE) : v instanceof Ref ? scalarOf(v, f) : v; };
        return (f: Frame) => {
          const v = a(f);
          if (typeof v === 'number') return -v;
          return unaryNeg(v, f);
        };
      }
      case 'postfix': {
        const a = this.compile(node.a, scope, host);
        if (node.op === '#') return (f: Frame) => { const v = a(f); if (v instanceof Ref && v.isCell && v.ext === undefined) return self.spillRef(v.sheet, v.areas[0].r1, v.areas[0].c1); return v; };
        return (f: Frame) => mapNumeric(a(f), f, x => x / 100);
      }
      case 'union': {
        const items = node.items.map(n => this.compile(n, scope, host));
        return (f: Frame) => {
          const areas: Area[] = []; let sheet = -2;
          for (const it of items) {
            const v = it(f);
            if (v instanceof CellError) return v;
            if (!(v instanceof Ref) || v.ext !== undefined) return ERR.VALUE;
            if (sheet === -2) sheet = v.sheet; else if (sheet !== v.sheet) return ERR.VALUE;
            areas.push(...v.areas);
          }
          return new Ref(sheet, areas);
        };
      }
      case 'bin': return this.compileBin(node.op, node.a, node.b, scope, host);
      case 'invoke': {
        const fnv = this.compile(node.fn, scope, host);
        const args = node.args.map(a => this.compile(a, scope, host));
        return (f: Frame) => {
          const lam = fnv(f);
          if (lam instanceof CellError) return lam;
          if (!(lam instanceof Lambda)) return ERR.VALUE;
          if (args.length > lam.params.length) return ERR.VALUE;
          return lam.invoke(args.map(a => a(f)));
        };
      }
      case 'call': return this.compileCall(node.name, node.args, scope, host);
    }
  }

  private compile3D(s1: string, s2: string, area: Area): Compiled {
    return () => {
      const a = this.sheetByName.get(s1.toLowerCase()), b = this.sheetByName.get(s2.toLowerCase());
      if (a === undefined || b === undefined) return ERR.REF;
      const vals: Scalar[] = [];
      for (let s = Math.min(a, b); s <= Math.max(a, b); s++) for (const row of this.refMatrix(new Ref(s, [area]), true).data) vals.push(...row);
      return vals.length ? Matrix.row(vals) : ERR.REF;
    };
  }

  private spillRef(s: number, row: number, col: number): Value {
    const es = this.sheets[s];
    const fc = es?.formulas.get(keyOf(row, col));
    if (!fc) return ERR.REF;
    if (fc.state !== CLEAN) this.ensure(fc);
    if (fc.spillArea) return new Ref(s, [{ ...fc.spillArea }]);
    if (fc.value === ERR.SPILL) return ERR.SPILL;
    return new Ref(s, [{ r1: row, c1: col, r2: row, c2: col }]);
  }

  /** Operand compiler with a fast path for plain local cell refs (no Ref allocation). */
  private compileOperand(n: Node, scope: Set<string>, host: number): Compiled {
    if (n.t === 'ref' && !n.spill && !n.sheet2) {
      const s = n.sheet === undefined ? host : this.sheetByName.get(n.sheet.toLowerCase());
      if (s !== undefined) { const { row, col } = n; return () => this.readCell(s, row, col); }
    }
    if (n.t === 'paren') return this.compileOperand(n.a, scope, host);
    return this.compile(n, scope, host);
  }

  private compileBin(op: string, an: Node, bn: Node, scope: Set<string>, host: number): Compiled {
    if (op === ':' || op === ' ') {
      const a = this.compile(an, scope, host), b = this.compile(bn, scope, host);
      return (f: Frame) => {
        const x = a(f), y = b(f);
        if (x instanceof CellError) return x;
        if (y instanceof CellError) return y;
        if (!(x instanceof Ref) || !(y instanceof Ref) || x.sheet !== y.sheet || x.ext !== y.ext) return ERR.VALUE;
        const p = x.areas[0], q = y.areas[0];
        if (op === ':') return new Ref(x.sheet, [{ r1: Math.min(p.r1, q.r1), c1: Math.min(p.c1, q.c1), r2: Math.max(p.r2, q.r2), c2: Math.max(p.c2, q.c2) }], x.ext);
        const r1 = Math.max(p.r1, q.r1), c1 = Math.max(p.c1, q.c1), r2 = Math.min(p.r2, q.r2), c2 = Math.min(p.c2, q.c2);
        if (r1 > r2 || c1 > c2) return ERR.NULL;
        return new Ref(x.sheet, [{ r1, c1, r2, c2 }], x.ext);
      };
    }
    const a = this.compileOperand(an, scope, host), b = this.compileOperand(bn, scope, host);
    switch (op) {
      case '+': return f => { const x = a(f), y = b(f); if (typeof x === 'number' && typeof y === 'number') return snapAdd(x + y, x, y); return binSlow('+', x, y, f); };
      case '-': return f => { const x = a(f), y = b(f); if (typeof x === 'number' && typeof y === 'number') return snapAdd(x - y, x, y); return binSlow('-', x, y, f); };
      case '*': return f => { const x = a(f), y = b(f); if (typeof x === 'number' && typeof y === 'number') { const r = x * y; return Number.isFinite(r) ? r : ERR.NUM; } return binSlow('*', x, y, f); };
      case '/': return f => { const x = a(f), y = b(f); if (typeof x === 'number' && typeof y === 'number') { if (y === 0) return ERR.DIV0; const r = x / y; return Number.isFinite(r) ? r : ERR.NUM; } return binSlow('/', x, y, f); };
      default: return f => binSlow(op, a(f), b(f), f);
    }
  }

  private compileCall(name: string, argNodes: Node[], scope: Set<string>, host: number): Compiled {
    const self = this;
    if (name === 'LET') return this.compileLet(argNodes, scope, host);
    if (name === 'LAMBDA') return this.compileLambda(argNodes, scope, host);
    const low = name.toLowerCase();
    // A LET/LAMBDA-bound function or a workbook LAMBDA name.
    if (scope.has(low) || (!getFn(name) && this.lookupName(name, host))) {
      const fnv = this.compile({ t: 'name', name }, scope, host);
      const args = argNodes.map(a => this.compile(a, scope, host));
      return (f: Frame) => {
        const lam = fnv(f);
        if (lam instanceof CellError) return lam;
        if (!(lam instanceof Lambda)) return ERR.VALUE;
        if (args.length > lam.params.length) return ERR.VALUE;
        return lam.invoke(args.map(a => a(f)));
      };
    }
    const d = getFn(name);
    if (!d) return () => ERR.NAME;
    if (argNodes.length < d.min || argNodes.length > d.max) return () => ERR.VALUE;
    const args = argNodes.map(a => this.compile(a, scope, host));
    // Legacy Tela Base aggregates: COUNT(Orders) / SUM(Orders.price) / SUM(Orders[price]).
    let aggHook: ((f: Frame) => Scalar | null) | null = null;
    if (AGG_HOOK.has(name) && argNodes.length === 1) {
      const n0 = argNodes[0];
      if ((n0.t === 'name' && !scope.has(n0.name.toLowerCase()) && !this.lookupName(n0.name, host)) || (n0.t === 'struct' && !this.tableFor(n0.table))) {
        const table = n0.t === 'name' ? n0.name.split('.')[0] : n0.table;
        const column = n0.t === 'name' ? (n0.name.includes('.') ? n0.name.slice(n0.name.indexOf('.') + 1) : undefined) : n0.column;
        aggHook = () => self.opts.resolver?.aggregate?.(name, table, column) ?? null;
      }
    }
    if (d.lazy) {
      const lazy = d.lazy;
      return (f: Frame) => lazy(args.map(a => () => a(f)), f, argNodes);
    }
    return (f: Frame) => {
      if (aggHook) { const r = aggHook(f); if (r !== null) return r; }
      const vals: Value[] = new Array(args.length);
      for (let i = 0; i < args.length; i++) vals[i] = args[i](f);
      return callDef(d, vals, f);
    };
  }

  private compileLet(argNodes: Node[], scope: Set<string>, host: number): Compiled {
    if (argNodes.length < 3 || argNodes.length % 2 === 0) return () => ERR.VALUE;
    const inner = new Set(scope);
    const binds: [string, Compiled][] = [];
    for (let i = 0; i < argNodes.length - 1; i += 2) {
      const n = argNodes[i];
      if (n.t !== 'name') return () => ERR.NAME;
      const low = n.name.toLowerCase();
      const val = this.compile(argNodes[i + 1], inner, host);
      inner.add(low);
      binds.push([low, val]);
    }
    const body = this.compile(argNodes[argNodes.length - 1], inner, host);
    return (f: Frame) => {
      const vars = new Map(f.vars ?? []);
      const g: Frame = { ...f, vars };
      for (const [k, fn] of binds) vars.set(k, fn(g));
      return body(g);
    };
  }

  private compileLambda(argNodes: Node[], scope: Set<string>, host: number): Compiled {
    if (!argNodes.length) return () => ERR.VALUE;
    const params: string[] = [];
    for (const n of argNodes.slice(0, -1)) { if (n.t !== 'name') return () => ERR.VALUE; params.push(n.name.toLowerCase()); }
    const inner = new Set([...scope, ...params]);
    const body = this.compile(argNodes[argNodes.length - 1], inner, host);
    return (f: Frame) => new Lambda(params, (args: Value[]) => {
      const vars = new Map(f.vars ?? []);
      params.forEach((p, i) => vars.set(p, i < args.length ? args[i] : OMITTED));
      return body({ ...f, vars });
    });
  }

  // ── Public read API ───────────────────────────────────────────────────────

  sheetIndexOf(idOrName: string): number {
    return this.sheetById.get(idOrName) ?? this.sheetByName.get(idOrName.toLowerCase()) ?? -1;
  }

  /** Computed value at a cell (passive read; formulas are current after recalc). */
  getValue(sheet: string | number, row: number, col: number): Scalar {
    const s = typeof sheet === 'number' ? sheet : this.sheetIndexOf(sheet);
    const es = this.sheets[s]; if (!es) return null;
    const k = keyOf(row, col);
    const fc = es.formulas.get(k);
    if (fc) return fc.value;
    const v = es.values.get(k);
    if (v !== undefined) return v;
    const o = es.spillOwner.get(k);
    if (o?.spill && o.spillArea) return o.spill.data[row - o.spillArea.r1]?.[col - o.spillArea.c1] ?? null;
    return null;
  }
  getValueA1(sheet: string | number, a1: string): Scalar { const a = parseA1(a1); return a ? this.getValue(sheet, a.row, a.col) : null; }

  /** Values of an A1 range ("A1:C10") as rows. */
  getRangeValues(sheet: string | number, range: string): Scalar[][] {
    const s = typeof sheet === 'number' ? sheet : this.sheetIndexOf(sheet);
    const [p, q] = range.replace(/\$/g, '').split(':');
    let a = parseA1(p), b = parseA1(q ?? p);
    if (!a || !b) {
      const rn = refTextToNode(range.replace(/\$/g, ''));
      if (rn.t !== 'range') return [];
      a = { row: rn.r1, col: rn.c1 }; b = { row: Math.min(rn.r2, this.sheets[s]?.maxRow ?? 0), col: Math.min(rn.c2, this.sheets[s]?.maxCol ?? 0) };
    }
    const out: Scalar[][] = [];
    for (let r = Math.min(a.row, b.row); r <= Math.max(a.row, b.row); r++) {
      const row: Scalar[] = [];
      for (let c = Math.min(a.col, b.col); c <= Math.max(a.col, b.col); c++) row.push(this.getValue(s, r, c));
      out.push(row);
    }
    return out;
  }

  /** Display text/colour/alignment for a cell, honoring its number format. */
  getDisplay(sheet: string | number, row: number, col: number, maxChars = 11): Formatted {
    const s = typeof sheet === 'number' ? sheet : this.sheetIndexOf(sheet);
    return formatValue(this.getValue(s, row, col), this.numFmtAt(s, row, col), maxChars);
  }

  /** Formula info for the UI: formula text, parse error, spill anchor/extent, circular flag. */
  getCellInfo(sheet: string | number, row: number, col: number): { formula?: string; parseError?: string; spill?: Area; spillAnchor?: { row: number; col: number }; spillBlocked?: boolean; circular?: boolean } {
    const s = typeof sheet === 'number' ? sheet : this.sheetIndexOf(sheet);
    const es = this.sheets[s]; if (!es) return {};
    const k = keyOf(row, col);
    const fc = es.formulas.get(k);
    if (fc) return { formula: fc.formula, parseError: fc.parseError, spill: fc.spillArea ?? undefined, spillBlocked: !!fc.wantArea, circular: fc.circular || this.cycleSet.has(fc) };
    const o = es.spillOwner.get(k);
    if (o) return { spillAnchor: { row: o.row, col: o.col }, spill: o.spillArea ?? undefined };
    return {};
  }

  /** All spill anchors and their extents on a sheet (for drawing spill borders). */
  getSpills(sheet: string | number): { row: number; col: number; area: Area }[] {
    const s = typeof sheet === 'number' ? sheet : this.sheetIndexOf(sheet);
    const out: { row: number; col: number; area: Area }[] = [];
    for (const fc of this.sheets[s]?.formulas.values() ?? []) if (fc.spillArea) out.push({ row: fc.row, col: fc.col, area: fc.spillArea });
    return out;
  }

  /** Cells this cell reads (A1 strings, sheet-qualified when not local). */
  getPrecedents(sheet: string | number, row: number, col: number): string[] {
    const s = typeof sheet === 'number' ? sheet : this.sheetIndexOf(sheet);
    const fc = this.sheets[s]?.formulas.get(keyOf(row, col));
    if (!fc) return [];
    const q = (si: number) => (si === s ? '' : `${this.sheets[si].name}!`);
    const out = fc.cellRegs.map(([si, k]) => q(si) + toA1(Math.floor(k / MAX_COLS), k % MAX_COLS));
    for (const d of fc.rangeRegs) out.push(q(d.sheet) + `${toA1(d.r1, d.c1)}:${toA1(Math.min(d.r2, MAX_ROWS - 1), d.c2)}`);
    return [...new Set(out)];
  }
  /** Formula cells that read this cell. */
  getDependents(sheet: string | number, row: number, col: number): { sheet: string; a1: string }[] {
    const s = typeof sheet === 'number' ? sheet : this.sheetIndexOf(sheet);
    return [...new Set(this.dependentsOf(s, row, col))].map(fc => ({ sheet: this.sheets[fc.sheet].id, a1: toA1(fc.row, fc.col) }));
  }
  /** Cells involved in circular references after the last recalc. */
  getCircularRefs(): { sheet: string; a1: string }[] {
    return [...this.cycleSet].map(fc => ({ sheet: this.sheets[fc.sheet].id, a1: toA1(fc.row, fc.col) }));
  }

  /**
   * Evaluate a formula as if it sat in (row, col) of `sheet` — for conditional
   * formats, validation, the formula-bar preview. Does not change the workbook.
   */
  evaluate(formula: string, sheet: string | number, row = 0, col = 0): Value {
    const s = typeof sheet === 'number' ? sheet : this.sheetIndexOf(sheet);
    let fn: Compiled;
    try { fn = this.compile(parseFormula(formula), new Set(), s); } catch { return ERR.NAME; }
    return this.runAdhoc(fn, s, row, col);
  }
  /** Same as evaluate() for an already-parsed AST (CF rules cache their ASTs). */
  evaluateAst(ast: Node, sheet: number, row: number, col: number, override?: { row: number; col: number; value: Scalar }): Value {
    let fn: Compiled;
    try { fn = this.compile(ast, new Set(), sheet); } catch { return ERR.NAME; }
    if (!override) return this.runAdhoc(fn, sheet, row, col);
    // Data validation: evaluate as if the cell already held the proposed value.
    this.override = { s: sheet, k: keyOf(override.row, override.col), v: override.value };
    try { return this.runAdhoc(fn, sheet, row, col); } finally { this.override = null; }
  }
  private runAdhoc(fn: Compiled, s: number, row: number, col: number): Value {
    this.depth = MAX_DEPTH + 1000; // never recurse into dirty cells from an ad-hoc read
    try {
      const v = fn({ e: this.access, s, row, col, vars: null });
      if (v instanceof Ref) return v.isCell ? (this.getValue(v.sheet, v.areas[0].r1, v.areas[0].c1) ?? 0) : v.ext ? this.refMatrix(v, false) : this.refMatrix(v, false);
      return v;
    } catch (e) {
      if (e instanceof NeedDep) return ERR.CALC;
      return ERR.VALUE;
    } finally { this.depth = 0; }
  }

  /** Mark external-dependent cells dirty (another Grid/Base changed) and recalc. */
  invalidateExternal(): RecalcStats {
    const seeds: FCell[] = [];
    for (const s of this.sheets) for (const fc of s.formulas.values()) if (fc.external) seeds.push(fc);
    this.markDirty(seeds);
    return this.recalc();
  }
  /** Force every formula to recompute. */
  recalcAll(): RecalcStats {
    const all: FCell[] = [];
    for (const s of this.sheets) for (const fc of s.formulas.values()) all.push(fc);
    all.sort((x, y) => x.sheet - y.sheet || x.key - y.key);
    for (const fc of all) { fc.state = CLEAN; fc.circular = false; }
    this.cycleSet.clear();
    for (const fc of all) { fc.state = DIRTY; this.dirtyQueue.push(fc); }
    return this.recalc();
  }

  /** Workbook copy with every formula cell's cached value `c` refreshed (for persistence / export). */
  snapshot(): Workbook {
    const sheets = this.wb.sheets.map((sh, si) => {
      const es = this.sheets[si];
      const changes: [number, number, Cell][] = [];
      for (const fc of es.formulas.values()) {
        const v = fc.value;
        const stored = v instanceof CellError ? { e: v.code } : v;
        const cur = getCell(sh.cells, fc.row, fc.col);
        if (!cur) continue;
        const same = cur.c !== undefined && (typeof stored === 'object' && stored !== null ? typeof cur.c === 'object' && cur.c !== null && (cur.c as { e: string }).e === stored.e : cur.c === stored);
        if (!same) changes.push([fc.row, fc.col, { ...cur, c: stored }]);
      }
      return changes.length ? { ...sh, cells: withCells(sh.cells, changes) } : sh;
    });
    return { ...this.wb, sheets };
  }

  stats() {
    let formulas = 0, values = 0, rangeDeps = 0, cellDeps = 0;
    for (const s of this.sheets) {
      formulas += s.formulas.size; values += s.values.size;
      for (const fc of s.formulas.values()) { rangeDeps += fc.rangeRegs.length; cellDeps += fc.cellRegs.length; }
    }
    return { sheets: this.sheets.length, formulas, values, rangeDeps, cellDeps, last: this.lastStats };
  }
}

// ── Operators ────────────────────────────────────────────────────────────────

function buildIndex(m: Matrix): Map<string, number> {
  const idx = new Map<string, number>();
  let i = 0;
  for (const row of m.data) for (const v of row) { const k = matchKey(v); if (!idx.has(k)) idx.set(k, i); i++; }
  return idx;
}

/** Snap results that are binary noise around zero (0.1+0.2-0.3) to exactly 0. */
function snapAdd(r: number, x: number, y: number): number | CellError {
  if (!Number.isFinite(r)) return ERR.NUM;
  if (r !== 0 && Math.abs(r) < Math.max(Math.abs(x), Math.abs(y)) * 2.2e-16 * 4) return 0;
  return r;
}

function scalarBin(op: string, x: Scalar, y: Scalar): Scalar {
  if (op === '&') {
    if (x instanceof CellError) return x;
    if (y instanceof CellError) return y;
    const a = toStr(x), b = toStr(y);
    if (isErr(a)) return a; if (isErr(b)) return b;
    return a + b;
  }
  if (op === '=' || op === '<>' || op === '<' || op === '>' || op === '<=' || op === '>=') {
    if (x instanceof CellError) return x;
    if (y instanceof CellError) return y;
    const c = compareScalars(x, y);
    switch (op) { case '=': return c === 0; case '<>': return c !== 0; case '<': return c < 0; case '>': return c > 0; case '<=': return c <= 0; default: return c >= 0; }
  }
  if (x instanceof CellError) return x;
  if (y instanceof CellError) return y;
  const a = toNum(x), b = toNum(y);
  if (isErr(a)) return a; if (isErr(b)) return b;
  switch (op) {
    case '+': return snapAdd(a + b, a, b);
    case '-': return snapAdd(a - b, a, b);
    case '*': { const r = a * b; return Number.isFinite(r) ? r : ERR.NUM; }
    case '/': { if (b === 0) return ERR.DIV0; const r = a / b; return Number.isFinite(r) ? r : ERR.NUM; }
    case '^': return power(a, b);
  }
  return ERR.VALUE;
}

function binSlow(op: string, x: Value, y: Value, f: Frame): Value {
  if (x instanceof Lambda || y instanceof Lambda) return ERR.CALC;
  if (isMulti(x) || isMulti(y)) {
    const a = toMatrix(x, f), b = toMatrix(y, f);
    if (isErr(a)) return a; if (isErr(b)) return b;
    return broadcast([a, b], ([p, q]) => scalarBin(op, p, q));
  }
  const p = x instanceof Matrix ? x.get(0, 0) : x instanceof Ref ? scalarOf(x, f) : x === OMITTED ? null : (x as Scalar);
  const q = y instanceof Matrix ? y.get(0, 0) : y instanceof Ref ? scalarOf(y, f) : y === OMITTED ? null : (y as Scalar);
  return scalarBin(op, p, q);
}

function unaryNeg(v: Value, f: Frame): Value {
  return mapNumeric(v, f, x => -x);
}
function mapNumeric(v: Value, f: Frame, fn: (x: number) => number): Value {
  if (isMulti(v)) {
    const m = toMatrix(v, f); if (isErr(m)) return m;
    return broadcast([m], ([x]) => { if (x instanceof CellError) return x; const n = toNum(x); return isErr(n) ? n : fn(n); });
  }
  const s = v instanceof Matrix ? v.get(0, 0) : v instanceof Ref ? scalarOf(v, f) : v === OMITTED ? null : v instanceof Lambda ? ERR.CALC : (v as Scalar);
  if (s instanceof CellError) return s;
  const n = toNum(s); if (isErr(n)) return n;
  return fn(n);
}

function callDef(d: FnDef, vals: Value[], f: Frame): Value {
  for (const v of vals) if (v instanceof Lambda && !['MAP', 'REDUCE', 'SCAN', 'BYROW', 'BYCOL', 'MAKEARRAY', 'ISOMITTED'].includes(d.name)) return ERR.VALUE;
  return invoke(d, vals, f);
}

export { numberToText, lettersToCol };
