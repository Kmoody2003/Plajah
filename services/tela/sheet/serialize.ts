// serialize — AST → formula text, plus the reference transforms that make
// copy/paste, fill, insert/delete rows/cols, moves and sheet renames correct.
//
// Every transform is AST → AST; callers parse, transform, then serialize. A
// reference pushed off the grid or into a deleted band becomes #REF!, exactly
// like Excel.

import { MAX_COLS, MAX_ROWS, colToLetters, quoteSheetName } from './address';
import { mapNode, type Node, type RangeNode, type RefNode } from './ast';
import { parseFormula } from './parser';

function fmtNum(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) < 1e21) return String(n);
  const s = String(n);
  return s.replace('e+', 'E+').replace('e-', 'E-');
}

function sheetPrefix(sheet?: string, sheet2?: string): string {
  if (sheet === undefined) return '';
  if (sheet2) {
    const both = `${sheet}:${sheet2}`;
    const needs = quoteSheetName(sheet) !== sheet || quoteSheetName(sheet2) !== sheet2;
    return (needs ? `'${both.replace(/'/g, "''")}'` : both) + '!';
  }
  return quoteSheetName(sheet) + '!';
}

const cellText = (row: number, col: number, rowAbs: boolean, colAbs: boolean) =>
  `${colAbs ? '$' : ''}${colToLetters(col)}${rowAbs ? '$' : ''}${row + 1}`;

export function rangeText(n: RangeNode): string {
  if (n.kind === 'cols') return `${n.c1Abs ? '$' : ''}${colToLetters(n.c1)}:${n.c2Abs ? '$' : ''}${colToLetters(n.c2)}`;
  if (n.kind === 'rows') return `${n.r1Abs ? '$' : ''}${n.r1 + 1}:${n.r2Abs ? '$' : ''}${n.r2 + 1}`;
  return `${cellText(n.r1, n.c1, n.r1Abs, n.c1Abs)}:${cellText(n.r2, n.c2, n.r2Abs, n.c2Abs)}`;
}

export interface SerializeOptions {
  /** Prefix future functions with _xlfn. (xlsx export). */
  xlfn?: (name: string) => string;
}

/** Serialize an AST back to formula text (no leading '='). */
export function toFormula(node: Node, opts: SerializeOptions = {}): string {
  const s = (n: Node): string => {
    switch (n.t) {
      case 'num': return fmtNum(n.v);
      case 'str': return `"${n.v.replace(/"/g, '""')}"`;
      case 'bool': return n.v ? 'TRUE' : 'FALSE';
      case 'err': return n.v;
      case 'ref': return sheetPrefix(n.sheet, n.sheet2) + cellText(n.row, n.col, n.rowAbs, n.colAbs) + (n.spill ? '#' : '');
      case 'range': return sheetPrefix(n.sheet, n.sheet2) + rangeText(n);
      case 'refErr': return sheetPrefix(n.sheet) + '#REF!';
      case 'name': return sheetPrefix(n.sheet) + n.name;
      case 'struct': {
        const esc = (c: string) => c.replace(/([\[\]#'])/g, "'$1");
        const parts: string[] = [];
        const itemText = { all: '#All', data: '#Data', headers: '#Headers', totals: '#Totals', thisRow: '#This Row' } as const;
        if (n.item === 'thisRow' && n.column && !n.column2) return `${n.table}[@${/[\s\[\]#']/.test(n.column) ? `[${esc(n.column)}]` : n.column}]`;
        if (n.item) parts.push(`[${itemText[n.item]}]`);
        if (n.column) parts.push(n.column2 ? `[${esc(n.column)}]:[${esc(n.column2)}]` : `[${esc(n.column)}]`);
        if (parts.length === 1 && !n.item && !n.column2) return `${n.table}[${esc(n.column!)}]`;
        if (parts.length === 1 && n.item && !n.column) return `${n.table}[${itemText[n.item]}]`;
        return `${n.table}[${parts.join(',')}]`;
      }
      case 'array': return '{' + n.rows.map(r => r.map(s).join(',')).join(';') + '}';
      case 'unary': return n.op + s(n.a);
      case 'postfix': return s(n.a) + n.op;
      case 'bin': return s(n.a) + n.op + s(n.b);
      case 'union': return '(' + n.items.map(s).join(',') + ')';
      case 'paren': return '(' + s(n.a) + ')';
      case 'call': return (opts.xlfn ? opts.xlfn(n.name) : n.name) + '(' + n.args.map(s).join(',') + ')';
      case 'invoke': return s(n.fn) + '(' + n.args.map(s).join(',') + ')';
      case 'missing': return '';
    }
  };
  return s(node);
}

// ── Transforms ───────────────────────────────────────────────────────────────

const REF_ERR = (sheet?: string): Node => (sheet !== undefined ? { t: 'refErr', sheet } : { t: 'refErr' });

/** Copy/fill: shift relative parts by (dr, dc). Off-grid → #REF!. */
export function shiftRelative(node: Node, dr: number, dc: number): Node {
  if (!dr && !dc) return node;
  return mapNode(node, n => {
    if (n.t === 'ref') {
      const row = n.rowAbs ? n.row : n.row + dr;
      const col = n.colAbs ? n.col : n.col + dc;
      if (row < 0 || row >= MAX_ROWS || col < 0 || col >= MAX_COLS) return REF_ERR(n.sheet);
      return { ...n, row, col };
    }
    if (n.t === 'range') {
      const r1 = n.kind === 'cols' || n.r1Abs ? n.r1 : n.r1 + dr;
      const r2 = n.kind === 'cols' || n.r2Abs ? n.r2 : n.r2 + dr;
      const c1 = n.kind === 'rows' || n.c1Abs ? n.c1 : n.c1 + dc;
      const c2 = n.kind === 'rows' || n.c2Abs ? n.c2 : n.c2 + dc;
      if (r1 < 0 || r2 >= MAX_ROWS || c1 < 0 || c2 >= MAX_COLS || r2 < 0 || c2 < 0) return REF_ERR(n.sheet);
      return { ...n, r1: Math.min(r1, r2), r2: Math.max(r1, r2), c1: Math.min(c1, c2), c2: Math.max(c1, c2) };
    }
    return n;
  });
}

export type StructuralEdit =
  | { kind: 'insertRows' | 'insertCols'; at: number; count: number }
  | { kind: 'deleteRows' | 'deleteCols'; at: number; count: number };

/**
 * Insert/delete rows or cols on `targetSheet`. `hostSheet` is the sheet that
 * owns the formula (unqualified refs point there). Names compare case-insensitively.
 */
export function adjustForStructural(node: Node, edit: StructuralEdit, targetSheet: string, hostSheet: string): Node {
  const t = targetSheet.toLowerCase();
  const onTarget = (sheet?: string) => (sheet ?? hostSheet).toLowerCase() === t;
  const rows = edit.kind === 'insertRows' || edit.kind === 'deleteRows';
  const ins = edit.kind === 'insertRows' || edit.kind === 'insertCols';
  const { at, count } = edit;
  const end = at + count; // deleted band is [at, end)
  const limit = rows ? MAX_ROWS : MAX_COLS;
  const movePoint = (x: number): number | null => {
    if (ins) return x >= at ? x + count : x;
    if (x >= at && x < end) return null;
    return x >= end ? x - count : x;
  };
  const moveSpan = (a: number, b: number): [number, number] | null => {
    if (ins) {
      const na = a >= at ? a + count : a;
      const nb = b >= at ? b + count : b;
      return [na, Math.min(nb, limit - 1)];
    }
    if (a >= at && b < end) return null;
    const na = a < at ? a : a >= end ? a - count : at;
    const nb = b < at ? b : b >= end ? b - count : at - 1;
    return nb < na ? null : [na, nb];
  };
  return mapNode(node, n => {
    if (n.t === 'ref' && onTarget(n.sheet) && !n.sheet2) {
      const v = movePoint(rows ? n.row : n.col);
      if (v === null || v >= limit) return REF_ERR(n.sheet);
      return rows ? { ...n, row: v } : { ...n, col: v };
    }
    if (n.t === 'range' && onTarget(n.sheet) && !n.sheet2) {
      if (rows && n.kind === 'cols') return n;
      if (!rows && n.kind === 'rows') return n;
      const span = rows ? moveSpan(n.r1, n.r2) : moveSpan(n.c1, n.c2);
      if (!span) return REF_ERR(n.sheet);
      return rows ? { ...n, r1: span[0], r2: span[1] } : { ...n, c1: span[0], c2: span[1] };
    }
    return n;
  });
}

/**
 * Cut/paste: references (from anywhere) that point entirely inside `src` on
 * `srcSheet` follow the cells to the destination (dr, dc[, destSheet]).
 */
export function adjustForMove(node: Node, src: { r1: number; c1: number; r2: number; c2: number }, srcSheet: string, hostSheet: string, dr: number, dc: number, destSheet?: string): Node {
  const s = srcSheet.toLowerCase();
  const onSrc = (sheet?: string) => (sheet ?? hostSheet).toLowerCase() === s;
  const inside = (r: number, c: number) => r >= src.r1 && r <= src.r2 && c >= src.c1 && c <= src.c2;
  const retarget = <T extends RefNode | RangeNode>(n: T): T => {
    if (!destSheet || destSheet.toLowerCase() === s) return n;
    return { ...n, sheet: destSheet };
  };
  return mapNode(node, n => {
    if (n.t === 'ref' && onSrc(n.sheet) && !n.sheet2 && inside(n.row, n.col)) return retarget({ ...n, row: n.row + dr, col: n.col + dc });
    if (n.t === 'range' && n.kind === 'cells' && onSrc(n.sheet) && !n.sheet2 && inside(n.r1, n.c1) && inside(n.r2, n.c2))
      return retarget({ ...n, r1: n.r1 + dr, r2: n.r2 + dr, c1: n.c1 + dc, c2: n.c2 + dc });
    return n;
  });
}

/** Rename a sheet inside references (and 3D bounds). */
export function renameSheetRefs(node: Node, from: string, to: string): Node {
  const f = from.toLowerCase();
  return mapNode(node, n => {
    if ((n.t === 'ref' || n.t === 'range' || n.t === 'refErr' || n.t === 'name') && n.sheet?.toLowerCase() === f) n = { ...n, sheet: to } as Node;
    if ((n.t === 'ref' || n.t === 'range') && n.sheet2?.toLowerCase() === f) n = { ...n, sheet2: to } as Node;
    return n;
  });
}

/** Deleting a sheet turns references to it into #REF!. */
export function deleteSheetRefs(node: Node, name: string): Node {
  const f = name.toLowerCase();
  return mapNode(node, n => {
    if ((n.t === 'ref' || n.t === 'range') && (n.sheet?.toLowerCase() === f || n.sheet2?.toLowerCase() === f)) return { t: 'refErr' };
    return n;
  });
}

/** Text-level helpers: parse → transform → serialize; unparsable formulas pass through unchanged. */
export function transformFormula(formula: string, fn: (n: Node) => Node): string {
  try { return toFormula(fn(parseFormula(formula))); } catch { return formula; }
}

export const copyFormula = (formula: string, dr: number, dc: number) => transformFormula(formula, n => shiftRelative(n, dr, dc));

/** Convert R1C1 text (Google Sheets clipboard) to A1, relative to the host cell. */
export function r1c1ToA1(formula: string, hostRow: number, hostCol: number): string {
  let out = '';
  let i = 0;
  const re = /^R(\[-?\d+\]|\d+)?C(\[-?\d+\]|\d+)?(?![A-Za-z0-9_(])/i;
  while (i < formula.length) {
    const ch = formula[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < formula.length) { if (formula[j] === '"') { if (formula[j + 1] === '"') { j += 2; continue; } break; } j++; }
      out += formula.slice(i, j + 1); i = j + 1; continue;
    }
    const prevOk = i === 0 || !/[A-Za-z0-9_.$]/.test(formula[i - 1]);
    if (prevOk && (ch === 'R' || ch === 'r')) {
      const m = re.exec(formula.slice(i));
      if (m) {
        const part = (p: string | undefined, host: number): [number, boolean] => {
          if (p === undefined) return [host, false];
          if (p.startsWith('[')) return [host + Number(p.slice(1, -1)), false];
          return [Number(p) - 1, true];
        };
        const [row, rowAbs] = part(m[1], hostRow);
        const [col, colAbs] = part(m[2], hostCol);
        out += cellText(row, col, rowAbs, colAbs);
        i += m[0].length; continue;
      }
    }
    out += ch; i++;
  }
  return out;
}

/** R1C1-relative signature: identical for formulas that differ only by a fill offset. */
export function relativeSignature(node: Node, hostRow: number, hostCol: number): string {
  return toFormula(mapNode(node, n => {
    if (n.t === 'ref') return { t: 'name', name: `R${n.rowAbs ? n.row : `[${n.row - hostRow}]`}C${n.colAbs ? n.col : `[${n.col - hostCol}]`}${n.spill ? '#' : ''}`, ...(n.sheet ? { sheet: n.sheet } : {}) };
    if (n.t === 'range') return { t: 'name', name: `R${n.r1Abs ? n.r1 : `[${n.r1 - hostRow}]`}C${n.c1Abs ? n.c1 : `[${n.c1 - hostCol}]`}:R${n.r2Abs ? n.r2 : `[${n.r2 - hostRow}]`}C${n.c2Abs ? n.c2 : `[${n.c2 - hostCol}]`}`, ...(n.sheet ? { sheet: n.sheet } : {}) };
    return n;
  }));
}
