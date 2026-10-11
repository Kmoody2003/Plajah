// fillHandle — maps a fill-handle drag to an autofill operation.
//
// Excel's rules: the drag extends the source block in ONE direction, whichever
// axis the pointer has left the block further along; dragging back inside the
// block shrinks it, which clears the cells released. The result is applied as
// one workbook op (one undo step) by the Grid with the user's fill option:
// series (default), copy, formats only, or values without formatting.

import { copyRange, fillRange, getCell, withCells, type Cell, type Workbook } from '../../../services/tela/sheet';
import type { Pos, Rect } from './selection';

export type FillPlan =
  | { kind: 'extend'; source: Rect; target: Rect; dir: 'down' | 'up' | 'right' | 'left' }
  | { kind: 'clear'; source: Rect; keep: Rect; cleared: Rect }
  | { kind: 'none' };

/** Where would releasing the fill handle at `p` fill to? */
export function planFill(src: Rect, p: Pos, maxRow: number, maxCol: number): FillPlan {
  const row = Math.max(0, Math.min(maxRow, p.row)), col = Math.max(0, Math.min(maxCol, p.col));
  const below = row - src.r2, above = src.r1 - row, right = col - src.c2, left = src.c1 - col;
  const outV = Math.max(below, above, 0), outH = Math.max(right, left, 0);
  if (outV === 0 && outH === 0) {
    // Inside: shrink from the bottom (or the right when dragging horizontally further).
    const shrinkRows = src.r2 - row, shrinkCols = src.c2 - col;
    if (shrinkRows <= 0 && shrinkCols <= 0) return { kind: 'none' };
    if (shrinkRows >= shrinkCols && shrinkRows > 0) {
      return { kind: 'clear', source: src, keep: { ...src, r2: row }, cleared: { ...src, r1: row + 1 } };
    }
    return { kind: 'clear', source: src, keep: { ...src, c2: col }, cleared: { ...src, c1: col + 1 } };
  }
  if (outV >= outH) {
    if (below > 0) return { kind: 'extend', source: src, target: { ...src, r2: row }, dir: 'down' };
    return { kind: 'extend', source: src, target: { ...src, r1: row }, dir: 'up' };
  }
  if (right > 0) return { kind: 'extend', source: src, target: { ...src, c2: col }, dir: 'right' };
  return { kind: 'extend', source: src, target: { ...src, c1: col }, dir: 'left' };
}

export type FillMode = 'series' | 'copy' | 'formats' | 'values';

/** The cells a plan writes, outside the source (for the "fill options" re-apply). */
export function filledArea(plan: FillPlan): Rect | null {
  if (plan.kind !== 'extend') return null;
  const { source: s, target: t, dir } = plan;
  if (dir === 'down') return { ...t, r1: s.r2 + 1 };
  if (dir === 'up') return { ...t, r2: s.r1 - 1 };
  if (dir === 'right') return { ...t, c1: s.c2 + 1 };
  return { ...t, c2: s.c1 - 1 };
}

const a1 = (r: Rect) => ({ r1: r.r1, c1: r.c1, r2: r.r2, c2: r.c2 });

/** Apply a fill plan to a workbook in the chosen mode. Returns the new workbook (immutable). */
export function applyFill(wb: Workbook, sheetId: string, plan: FillPlan, mode: FillMode = 'series'): Workbook {
  if (plan.kind === 'none') return wb;
  if (plan.kind === 'clear') {
    const i = wb.sheets.findIndex(s => s.id === sheetId); if (i < 0) return wb;
    const sh = wb.sheets[i]; const c = plan.cleared; const changes: [number, number, Cell | undefined][] = [];
    for (let r = c.r1; r <= c.r2; r++) for (let col = c.c1; col <= c.c2; col++) {
      const cur = getCell(sh.cells, r, col); if (!cur) continue;
      const keep: Cell = {}; if (cur.s !== undefined) keep.s = cur.s;
      changes.push([r, col, Object.keys(keep).length ? keep : undefined]);
    }
    if (!changes.length) return wb;
    const sheets = wb.sheets.slice(); sheets[i] = { ...sh, cells: withCells(sh.cells, changes) };
    return { ...wb, sheets };
  }
  const area = filledArea(plan)!;
  if (mode === 'copy') return copyRange(wb, sheetId, a1(plan.source), sheetId, a1(area), { mode: 'all' }).workbook;
  if (mode === 'formats') return copyRange(wb, sheetId, a1(plan.source), sheetId, a1(area), { mode: 'formats' }).workbook;
  const filled = fillRange(wb, sheetId, a1(plan.source), a1(plan.target)).workbook;
  if (mode === 'series') return filled;
  // values: keep the target cells' own formatting.
  const i = filled.sheets.findIndex(s => s.id === sheetId);
  const before = wb.sheets[i], after = filled.sheets[i];
  const changes: [number, number, Cell | undefined][] = [];
  for (let r = area.r1; r <= area.r2; r++) for (let c = area.c1; c <= area.c2; c++) {
    const nc = getCell(after.cells, r, c), oc = getCell(before.cells, r, c);
    if (!nc) continue;
    const out: Cell = { ...nc }; if (oc?.s !== undefined) out.s = oc.s; else delete out.s;
    changes.push([r, c, Object.keys(out).length ? out : undefined]);
  }
  const sheets = filled.sheets.slice(); sheets[i] = { ...after, cells: withCells(after.cells, changes) };
  return { ...filled, sheets };
}
