// document/tables — pure table structure edits on `TableBlock` (rows, columns, merges, widths).
//
// Grid model (like OOXML): every row's cells, with their colSpan, cover the grid columns
// exactly; a vertical merge is a top cell with `rowSpan` plus `vMerged` placeholders below that
// cover the same grid columns. All edits keep that invariant, so layout and docx export never
// see a ragged table.

import { type TableBlock, type TableCell, type TableRow, type TextStory, newId } from '../model';
import { tableGrid } from './paginate';

export function cellStory(text = '', styleId = 'table-text'): TextStory {
  return { id: newId('s'), paragraphs: [{ id: newId(), styleId, runs: [{ text }] }] };
}
export function newCell(extra: Partial<TableCell> = {}): TableCell { return { id: newId('c'), story: cellStory(), ...extra }; }
export function newRow(cells: number, extra: Partial<TableRow> = {}): TableRow { return { id: newId('r'), cells: Array.from({ length: cells }, () => newCell()), ...extra }; }

export function createTable(rows: number, cols: number, width: number, opts: { header?: boolean } = {}): TableBlock {
  const w = width / cols;
  const t: TableBlock = { id: newId('t'), columns: Array(cols).fill(w), rows: Array.from({ length: rows }, (_, i) => newRow(cols, i === 0 && opts.header ? { header: true } : {})) };
  if (opts.header) t.rows[0] = { ...t.rows[0], cells: t.rows[0].cells.map(c => ({ ...c, shading: '#efeaf5' })) };
  return t;
}

/** Grid position of a cell id. */
export function cellPos(t: TableBlock, cellId: string): { row: number; index: number; col: number; span: number } | null {
  const grid = tableGrid(t);
  for (let r = 0; r < t.rows.length; r++) {
    const i = t.rows[r].cells.findIndex(c => c.id === cellId);
    if (i >= 0) return { row: r, index: i, col: grid[r][i], span: t.rows[r].cells[i].colSpan ?? 1 };
  }
  return null;
}

/** The cell covering grid column `col` in row `row` (and its index). */
export function cellAt(t: TableBlock, row: number, col: number): { cell: TableCell; index: number; start: number } | null {
  const r = t.rows[row];
  if (!r) return null;
  let gc = 0;
  for (let i = 0; i < r.cells.length; i++) {
    const span = r.cells[i].colSpan ?? 1;
    if (col >= gc && col < gc + span) return { cell: r.cells[i], index: i, start: gc };
    gc += span;
  }
  return null;
}

/** The visible (non-vMerged) cell owning grid (row, col). */
export function ownerCell(t: TableBlock, row: number, col: number): { cell: TableCell; row: number } | null {
  for (let r = row; r >= 0; r--) {
    const hit = cellAt(t, r, col);
    if (!hit) return null;
    if (!hit.cell.vMerged) return { cell: hit.cell, row: r };
  }
  return null;
}

export function insertRow(t: TableBlock, at: number, below: boolean): TableBlock {
  const src = t.rows[at];
  const idx = below ? at + 1 : at;
  const cells: TableCell[] = src.cells.map(c => {
    // Inside a vertical merge: extend it rather than break it.
    const continues = below ? (c.vMerged || (c.rowSpan ?? 1) > 1) && idx < t.rows.length && t.rows[idx]?.cells.some(x => x.vMerged) : c.vMerged;
    return continues ? newCell({ colSpan: c.colSpan, vMerged: true }) : newCell({ colSpan: c.colSpan, shading: src.header ? undefined : c.shading });
  });
  const rows = t.rows.slice();
  rows.splice(idx, 0, { id: newId('r'), cells });
  return fixSpans({ ...t, rows });
}

export function deleteRow(t: TableBlock, at: number): TableBlock | null {
  if (t.rows.length <= 1) return null;
  const rows = t.rows.slice();
  const removed = rows.splice(at, 1)[0];
  // A removed merge origin hands its content and span to the cell below.
  if (rows[at]) rows[at] = { ...rows[at], cells: rows[at].cells.map((c, i) => { const o = removed.cells[i]; return c.vMerged && o && !o.vMerged && (o.rowSpan ?? 1) > 1 ? { ...o, id: c.id, rowSpan: (o.rowSpan ?? 1) - 1, vMerged: undefined } : c; }) };
  return fixSpans({ ...t, rows });
}

export function insertColumn(t: TableBlock, col: number, right: boolean): TableBlock {
  const at = right ? col + 1 : col;
  const w = t.columns[Math.min(col, t.columns.length - 1)] ?? 96;
  const scale = t.columns.reduce((a, b) => a + b, 0) / (t.columns.reduce((a, b) => a + b, 0) + w);
  const columns = t.columns.slice();
  columns.splice(at, 0, w);
  const rows = t.rows.map(r => {
    let gc = 0;
    const cells = r.cells.slice();
    for (let i = 0; i <= cells.length; i++) {
      if (gc === at) { cells.splice(i, 0, newCell()); break; }
      if (i === cells.length) break;
      const span = cells[i].colSpan ?? 1;
      if (at > gc && at < gc + span) { cells[i] = { ...cells[i], colSpan: span + 1 }; break; }
      gc += span;
    }
    return { ...r, cells };
  });
  return { ...t, columns: columns.map(c => c * scale), rows };
}

export function deleteColumn(t: TableBlock, col: number): TableBlock | null {
  if (t.columns.length <= 1) return null;
  const columns = t.columns.slice();
  const freed = columns.splice(col, 1)[0];
  const rows = t.rows.map(r => {
    const cells: TableCell[] = [];
    let gc = 0;
    for (const c of r.cells) {
      const span = c.colSpan ?? 1;
      if (col >= gc && col < gc + span) { if (span > 1) cells.push({ ...c, colSpan: span - 1 }); }
      else cells.push(c);
      gc += span;
    }
    return { ...r, cells };
  });
  const total = columns.reduce((a, b) => a + b, 0);
  return { ...t, columns: columns.map(c => c * (total + freed) / total), rows };
}

function storyText(s: TextStory): string { return s.paragraphs.map(p => p.runs.map(r => r.text).join('')).join(''); }

/** Merge the grid rectangle [r0..r1] × [c0..c1] into its top-left cell. Null if a merge would split a cell. */
export function mergeCells(t: TableBlock, r0: number, c0: number, r1: number, c1: number): TableBlock | null {
  [r0, r1] = [Math.min(r0, r1), Math.max(r0, r1)];
  [c0, c1] = [Math.min(c0, c1), Math.max(c0, c1)];
  // Every row must have cell boundaries at c0 and c1+1.
  for (let r = r0; r <= r1; r++) {
    const a = cellAt(t, r, c0), b = cellAt(t, r, c1);
    if (!a || !b || a.start !== c0 || b.start + (b.cell.colSpan ?? 1) - 1 !== c1) return null;
  }
  const merged: TextStory['paragraphs'] = [];
  for (let r = r0; r <= r1; r++) {
    let gc = 0;
    for (const c of t.rows[r].cells) {
      if (gc >= c0 && gc <= c1 && !c.vMerged && storyText(c.story).trim()) merged.push(...c.story.paragraphs);
      gc += c.colSpan ?? 1;
    }
  }
  const rows = t.rows.map((row, r) => {
    if (r < r0 || r > r1) return row;
    const cells: TableCell[] = [];
    let gc = 0;
    let placed = false;
    for (const c of row.cells) {
      const inside = gc >= c0 && gc <= c1;
      if (!inside) cells.push(c);
      else if (!placed) {
        placed = true;
        if (r === r0) cells.push({ ...c, colSpan: c1 - c0 + 1, rowSpan: r1 > r0 ? r1 - r0 + 1 : undefined, vMerged: undefined, story: merged.length ? { ...c.story, paragraphs: merged } : c.story });
        else cells.push(newCell({ colSpan: c1 - c0 + 1, vMerged: true }));
      }
      gc += c.colSpan ?? 1;
    }
    return { ...row, cells };
  });
  return fixSpans({ ...t, rows });
}

/** Undo a merge on one cell: back to single grid cells (content stays in the first). */
export function splitCell(t: TableBlock, cellId: string): TableBlock {
  const pos = cellPos(t, cellId);
  if (!pos) return t;
  const cell = t.rows[pos.row].cells[pos.index];
  const span = cell.colSpan ?? 1, rspan = cell.rowSpan ?? 1;
  const rows = t.rows.map((row, r) => {
    if (r < pos.row || r >= pos.row + rspan) return row;
    const cells: TableCell[] = [];
    let gc = 0;
    for (const c of row.cells) {
      if (gc === pos.col && (r === pos.row ? c.id === cellId : c.vMerged)) {
        for (let k = 0; k < span; k++) cells.push(k === 0 && r === pos.row ? { ...c, colSpan: undefined, rowSpan: undefined } : newCell());
      } else cells.push(c);
      gc += c.colSpan ?? 1;
    }
    return { ...row, cells };
  });
  return { ...t, rows };
}

/** Recompute rowSpan of merge origins from their vMerged continuations. */
export function fixSpans(t: TableBlock): TableBlock {
  const rows = t.rows.map(r => ({ ...r, cells: r.cells.slice() }));
  for (let r = 0; r < rows.length; r++) {
    let gc = 0;
    rows[r].cells.forEach((c, i) => {
      if (!c.vMerged) {
        let n = 1;
        while (r + n < rows.length) { const below = cellAtRows(rows, r + n, gc); if (!below || !below.vMerged) break; n++; }
        const span = n > 1 ? n : undefined;
        if (span !== c.rowSpan) rows[r].cells[i] = { ...c, rowSpan: span };
      }
      gc += c.colSpan ?? 1;
    });
  }
  return { ...t, rows };
}
function cellAtRows(rows: TableRow[], row: number, col: number): TableCell | null {
  let gc = 0;
  for (const c of rows[row].cells) { if (gc === col) return c; gc += c.colSpan ?? 1; if (gc > col) return null; }
  return null;
}

export function setColumnWidth(t: TableBlock, col: number, width: number): TableBlock {
  const columns = t.columns.slice();
  const delta = width - columns[col];
  columns[col] = Math.max(18, width);
  // Keep the table width: the neighbour gives or takes the difference.
  const n = col + 1 < columns.length ? col + 1 : col - 1;
  if (n >= 0 && n !== col) columns[n] = Math.max(18, columns[n] - delta);
  return { ...t, columns };
}

export function distributeColumns(t: TableBlock): TableBlock {
  const total = t.columns.reduce((a, b) => a + b, 0);
  return { ...t, columns: t.columns.map(() => total / t.columns.length) };
}

export function mapCells(t: TableBlock, ids: Set<string>, f: (c: TableCell) => TableCell): TableBlock {
  return { ...t, rows: t.rows.map(r => ({ ...r, cells: r.cells.map(c => (ids.has(c.id) ? f(c) : c)) })) };
}
