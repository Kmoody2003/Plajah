// selection — the Grid's selection model and keyboard navigation reducer.
//
// Pure functions over a small immutable Selection so the behaviour can be
// unit-tested without a DOM (tests/telaGridSelection.test.ts). The model is
// Excel's: one or more rectangles, an active cell that is always inside the
// last rectangle, and an anchor the last rectangle grows from when extended.
// Navigation follows Excel semantics: Ctrl+arrow jumps to the edge of a data
// region, Enter/Tab cycle inside a multi-cell selection, hidden lines are
// skipped, and merged cells move as a block.

export interface Pos { row: number; col: number }
export interface Rect { r1: number; c1: number; r2: number; c2: number }
export interface Selection {
  ranges: Rect[];
  active: Pos;
  anchor: Pos;
}

export const rect = (a: Pos, b: Pos): Rect => ({ r1: Math.min(a.row, b.row), c1: Math.min(a.col, b.col), r2: Math.max(a.row, b.row), c2: Math.max(a.col, b.col) });
export const single = (row: number, col: number): Selection => ({ ranges: [{ r1: row, c1: col, r2: row, c2: col }], active: { row, col }, anchor: { row, col } });
export const lastRange = (s: Selection): Rect => s.ranges[s.ranges.length - 1];
export const inRect = (r: Rect, row: number, col: number) => row >= r.r1 && row <= r.r2 && col >= r.c1 && col <= r.c2;
export const isSingleCell = (s: Selection) => s.ranges.length === 1 && s.ranges[0].r1 === s.ranges[0].r2 && s.ranges[0].c1 === s.ranges[0].c2;
export const rectCells = (r: Rect) => (r.r2 - r.r1 + 1) * (r.c2 - r.c1 + 1);
export const unionRect = (a: Rect, b: Rect): Rect => ({ r1: Math.min(a.r1, b.r1), c1: Math.min(a.c1, b.c1), r2: Math.max(a.r2, b.r2), c2: Math.max(a.c2, b.c2) });
export const rectsIntersect = (a: Rect, b: Rect) => a.r1 <= b.r2 && b.r1 <= a.r2 && a.c1 <= b.c2 && b.c1 <= a.c2;

/** What the navigation reducer needs to know about the sheet. */
export interface NavContext {
  /** Last addressable row / col (inclusive). */
  maxRow: number;
  maxCol: number;
  isBlank(row: number, col: number): boolean;
  rowHidden?(row: number): boolean;
  colHidden?(col: number): boolean;
  /** Merged area containing (row, col), if any. */
  mergeAt?(row: number, col: number): Rect | null;
  /** Rows per page for PageUp/PageDown, columns per page for Alt+PageUp/Down. */
  pageRows: number;
  pageCols?: number;
  /** Last used cell (Ctrl+End). */
  usedEnd?: Pos;
  /** Top-left of the unfrozen area (Ctrl+Home goes here, like Excel). */
  home?: Pos;
}

export interface NavKey { key: string; shift?: boolean; ctrl?: boolean; alt?: boolean }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Grow a rect so it fully contains every merged area it touches. */
export function expandForMerges(r: Rect, ctx: Pick<NavContext, 'mergeAt'>): Rect {
  if (!ctx.mergeAt) return r;
  let out = r; let changed = true; let guard = 0;
  while (changed && guard++ < 16) {
    changed = false;
    const edges: Pos[] = [];
    for (let c = out.c1; c <= out.c2 && edges.length < 4000; c++) { edges.push({ row: out.r1, col: c }, { row: out.r2, col: c }); }
    for (let rr = out.r1; rr <= out.r2 && edges.length < 8000; rr++) { edges.push({ row: rr, col: out.c1 }, { row: rr, col: out.c2 }); }
    for (const p of edges) {
      const m = ctx.mergeAt(p.row, p.col);
      if (m && !(m.r1 >= out.r1 && m.r2 <= out.r2 && m.c1 >= out.c1 && m.c2 <= out.c2)) { out = unionRect(out, m); changed = true; }
    }
  }
  return out;
}

function stepLine(i: number, delta: number, max: number, hidden?: (i: number) => boolean): number {
  let j = i; const dir = delta < 0 ? -1 : 1; let n = Math.abs(delta);
  while (n > 0) {
    let k = j + dir;
    while (k >= 0 && k <= max && hidden?.(k)) k += dir;
    if (k < 0 || k > max) break;
    j = k; n--;
  }
  return j;
}

/**
 * Excel's Ctrl+arrow: from a filled cell whose neighbour is filled, run to the
 * last filled cell; otherwise jump to the next filled cell, or the sheet edge.
 */
export function edgeJump(from: Pos, dr: number, dc: number, ctx: NavContext): Pos {
  const max = dr ? ctx.maxRow : ctx.maxCol;
  const hidden = dr ? ctx.rowHidden : ctx.colHidden;
  const at = (i: number): Pos => (dr ? { row: i, col: from.col } : { row: from.row, col: i });
  const blank = (i: number) => { const p = at(i); return ctx.isBlank(p.row, p.col); };
  const d = dr || dc;
  let i = dr ? from.row : from.col;
  const next = (k: number) => stepLine(k, d, max, hidden);
  let n = next(i);
  if (n === i) return from;
  if (!blank(i) && !blank(n)) {
    // Run to the end of the filled block.
    while (true) { const m = next(n); if (m === n || blank(m)) break; n = m; }
    return at(n);
  }
  // Skip blanks to the next filled cell, or stop at the edge.
  while (blank(n)) { const m = next(n); if (m === n) return at(n); n = m; }
  return at(n);
}

/** Contiguous data block around a cell (Ctrl+A first press, like Excel's current region). */
export function currentRegion(p: Pos, ctx: NavContext, limit = 200_000): Rect {
  let r: Rect = { r1: p.row, c1: p.col, r2: p.row, c2: p.col };
  let grew = true; let guard = 0;
  const filledRow = (row: number, c1: number, c2: number) => { for (let c = c1; c <= c2; c++) if (!ctx.isBlank(row, c)) return true; return false; };
  const filledCol = (col: number, r1: number, r2: number) => { for (let rr = r1; rr <= r2; rr++) if (!ctx.isBlank(rr, col)) return true; return false; };
  while (grew && guard++ < limit) {
    grew = false;
    const c1 = Math.max(0, r.c1 - 1), c2 = Math.min(ctx.maxCol, r.c2 + 1);
    if (r.r1 > 0 && filledRow(r.r1 - 1, c1, c2)) { r = { ...r, r1: r.r1 - 1 }; grew = true; }
    if (r.r2 < ctx.maxRow && filledRow(r.r2 + 1, c1, c2)) { r = { ...r, r2: r.r2 + 1 }; grew = true; }
    const r1 = Math.max(0, r.r1 - 1), r2 = Math.min(ctx.maxRow, r.r2 + 1);
    if (r.c1 > 0 && filledCol(r.c1 - 1, r1, r2)) { r = { ...r, c1: r.c1 - 1 }; grew = true; }
    if (r.c2 < ctx.maxCol && filledCol(r.c2 + 1, r1, r2)) { r = { ...r, c2: r.c2 + 1 }; grew = true; }
  }
  return r;
}

/** Collapse to a cell (respecting merges: the whole merged block is selected). */
export function selectCell(row: number, col: number, ctx?: Pick<NavContext, 'mergeAt'>): Selection {
  const m = ctx?.mergeAt?.(row, col);
  if (m) return { ranges: [m], active: { row: m.r1, col: m.c1 }, anchor: { row: m.r1, col: m.c1 } };
  return single(row, col);
}

/** Shift-extend the last range from its anchor to (row, col). */
export function extendTo(s: Selection, row: number, col: number, ctx?: Pick<NavContext, 'mergeAt'>): Selection {
  const r = expandForMerges(rect(s.anchor, { row, col }), ctx ?? {});
  return { ...s, ranges: [...s.ranges.slice(0, -1), r] };
}

/** Ctrl-click: start a new range (multi-area selection). */
export function addRange(s: Selection, row: number, col: number, ctx?: Pick<NavContext, 'mergeAt'>): Selection {
  const m = ctx?.mergeAt?.(row, col);
  const r = m ?? { r1: row, c1: col, r2: row, c2: col };
  return { ranges: [...s.ranges, r], active: { row: r.r1, col: r.c1 }, anchor: { row, col } };
}

export function selectRows(r1: number, r2: number, maxCol: number, extend?: Selection): Selection {
  const rr: Rect = { r1: Math.min(r1, r2), r2: Math.max(r1, r2), c1: 0, c2: maxCol };
  if (extend) return { ranges: [...extend.ranges, rr], active: { row: r1, col: 0 }, anchor: { row: r1, col: 0 } };
  return { ranges: [rr], active: { row: r1, col: 0 }, anchor: { row: r1, col: 0 } };
}
export function selectCols(c1: number, c2: number, maxRow: number, extend?: Selection): Selection {
  const rr: Rect = { r1: 0, r2: maxRow, c1: Math.min(c1, c2), c2: Math.max(c1, c2) };
  if (extend) return { ranges: [...extend.ranges, rr], active: { row: 0, col: c1 }, anchor: { row: 0, col: c1 } };
  return { ranges: [rr], active: { row: 0, col: c1 }, anchor: { row: 0, col: c1 } };
}
export const selectAll = (maxRow: number, maxCol: number): Selection => ({ ranges: [{ r1: 0, c1: 0, r2: maxRow, c2: maxCol }], active: { row: 0, col: 0 }, anchor: { row: 0, col: 0 } });

/** Is the selection a whole-row / whole-column / whole-sheet block? */
export function selectionKind(s: Selection, maxRow: number, maxCol: number): 'cells' | 'rows' | 'cols' | 'all' {
  const r = lastRange(s);
  const fullRows = r.c1 === 0 && r.c2 >= maxCol;
  const fullCols = r.r1 === 0 && r.r2 >= maxRow;
  if (fullRows && fullCols) return 'all';
  if (fullRows) return 'rows';
  if (fullCols) return 'cols';
  return 'cells';
}

/** Move the active cell inside the selection (Enter / Tab with a multi-cell selection). */
function cycleInside(s: Selection, forward: boolean, byRow: boolean, ctx: NavContext): Selection {
  const r = lastRange(s);
  let { row, col } = s.active;
  const m = ctx.mergeAt?.(row, col);
  const rowsN = r.r2 - r.r1 + 1, colsN = r.c2 - r.c1 + 1;
  const total = rowsN * colsN;
  for (let tries = 0; tries < Math.min(total, 100_000); tries++) {
    if (byRow) {
      // Tab: across, then wrap to the next row.
      col += forward ? 1 : -1;
      if (m && forward && col <= m.c2 && row >= m.r1 && row <= m.r2) col = m.c2 + 1;
      if (col > r.c2) { col = r.c1; row = row + 1 > r.r2 ? r.r1 : row + 1; }
      if (col < r.c1) { col = r.c2; row = row - 1 < r.r1 ? r.r2 : row - 1; }
    } else {
      row += forward ? 1 : -1;
      if (m && forward && row <= m.r2 && col >= m.c1 && col <= m.c2) row = m.r2 + 1;
      if (row > r.r2) { row = r.r1; col = col + 1 > r.c2 ? r.c1 : col + 1; }
      if (row < r.r1) { row = r.r2; col = col - 1 < r.c1 ? r.c2 : col - 1; }
    }
    if (ctx.rowHidden?.(row) || ctx.colHidden?.(col)) continue;
    const mm = ctx.mergeAt?.(row, col);
    if (mm && (mm.r1 !== row || mm.c1 !== col)) continue;
    break;
  }
  return { ...s, active: { row, col } };
}

/**
 * The keyboard navigation reducer. Returns the next selection for a key, or
 * null when the key is not a navigation key (so the caller handles it).
 * `enterMoves` is the direction Enter moves (Excel's default: down).
 */
export function navigate(s: Selection, k: NavKey, ctx: NavContext): Selection | null {
  const { key } = k;
  const shift = !!k.shift, ctrl = !!k.ctrl;
  const arrows: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  const multi = !isSingleCell(s) && !(s.ranges.length === 1 && ctx.mergeAt?.(s.active.row, s.active.col) && rectEquals(s.ranges[0], ctx.mergeAt(s.active.row, s.active.col)!));

  if (key === 'Enter' || key === 'Tab') {
    const byRow = key === 'Tab';
    if (multi && s.ranges.length === 1) return cycleInside(s, !shift, byRow, ctx);
    const [dr, dc] = byRow ? [0, shift ? -1 : 1] : [shift ? -1 : 1, 0];
    return moveBy(s, dr, dc, ctx);
  }

  if (arrows[key]) {
    const [dr, dc] = arrows[key];
    if (shift) {
      // Extend: the moving corner is the one opposite the anchor.
      const r = lastRange(s);
      const corner: Pos = { row: s.anchor.row === r.r1 ? r.r2 : r.r1, col: s.anchor.col === r.c1 ? r.c2 : r.c1 };
      const to = ctrl ? edgeJump(corner, dr, dc, ctx) : {
        row: dr ? stepLine(corner.row, dr, ctx.maxRow, ctx.rowHidden) : corner.row,
        col: dc ? stepLine(corner.col, dc, ctx.maxCol, ctx.colHidden) : corner.col,
      };
      return extendTo(s, to.row, to.col, ctx);
    }
    if (ctrl) { const p = edgeJump(s.active, dr, dc, ctx); return selectCell(p.row, p.col, ctx); }
    return moveBy(s, dr, dc, ctx);
  }

  if (key === 'Home') {
    const to: Pos = ctrl ? (ctx.home ?? { row: 0, col: 0 }) : { row: s.active.row, col: 0 };
    return shift ? extendTo(s, to.row, to.col, ctx) : selectCell(to.row, to.col, ctx);
  }
  if (key === 'End') {
    let to: Pos;
    if (ctrl) to = ctx.usedEnd ?? s.active;
    else {
      // Last filled cell in the row (Sheets semantics), else stay.
      let c = ctx.usedEnd?.col ?? ctx.maxCol;
      while (c > 0 && ctx.isBlank(s.active.row, c)) c--;
      to = { row: s.active.row, col: c };
    }
    return shift ? extendTo(s, to.row, to.col, ctx) : selectCell(to.row, to.col, ctx);
  }
  if (key === 'PageDown' || key === 'PageUp') {
    const d = key === 'PageDown' ? 1 : -1;
    if (k.alt) {
      const col = stepLine(s.active.col, d * (ctx.pageCols ?? 8), ctx.maxCol, ctx.colHidden);
      return shift ? extendTo(s, s.active.row, col, ctx) : selectCell(s.active.row, col, ctx);
    }
    const row = stepLine(s.active.row, d * Math.max(1, ctx.pageRows), ctx.maxRow, ctx.rowHidden);
    return shift ? extendTo(s, row, s.active.col, ctx) : selectCell(row, s.active.col, ctx);
  }
  if (key === ' ' && (shift || ctrl) && !(shift && ctrl)) {
    const r = lastRange(s);
    if (shift) return { ranges: [{ r1: r.r1, r2: r.r2, c1: 0, c2: ctx.maxCol }], active: s.active, anchor: { row: r.r1, col: 0 } };
    return { ranges: [{ r1: 0, r2: ctx.maxRow, c1: r.c1, c2: r.c2 }], active: s.active, anchor: { row: 0, col: r.c1 } };
  }
  if ((key === 'a' || key === 'A') && ctrl) {
    const region = currentRegion(s.active, ctx);
    const cur = lastRange(s);
    if (rectCells(region) > 1 && !rectEquals(region, cur)) return { ranges: [region], active: s.active, anchor: { row: region.r1, col: region.c1 } };
    return selectAll(ctx.maxRow, ctx.maxCol);
  }
  return null;
}

export const rectEquals = (a: Rect, b: Rect) => a.r1 === b.r1 && a.r2 === b.r2 && a.c1 === b.c1 && a.c2 === b.c2;

function moveBy(s: Selection, dr: number, dc: number, ctx: NavContext): Selection {
  let { row, col } = s.active;
  // Leaving a merged block steps from its far edge.
  const m = ctx.mergeAt?.(row, col);
  if (m) { if (dr > 0) row = m.r2; if (dc > 0) col = m.c2; if (dr < 0) row = m.r1; if (dc < 0) col = m.c1; }
  const nr = dr ? stepLine(row, dr, ctx.maxRow, ctx.rowHidden) : row;
  const nc = dc ? stepLine(col, dc, ctx.maxCol, ctx.colHidden) : col;
  if (m && nr === row && nc === col) return s;
  return selectCell(clamp(nr, 0, ctx.maxRow), clamp(nc, 0, ctx.maxCol), ctx);
}
