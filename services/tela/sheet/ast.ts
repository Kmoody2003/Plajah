// ast — formula syntax tree for the Tela sheet engine.
//
// References are stored with ABSOLUTE 0-based coordinates (already resolved
// against the host cell) plus `$` flags. That makes structural edits (insert /
// delete rows) a pure coordinate transform, and copy/fill a flag-aware offset.

import type { ErrorCode } from './values';

export interface RefNode {
  t: 'ref';
  sheet?: string;
  /** Last sheet of a 3D reference (Sheet1:Sheet3!A1). */
  sheet2?: string;
  row: number; col: number;
  rowAbs: boolean; colAbs: boolean;
  /** `A1#` — the spill range anchored at this cell. */
  spill?: boolean;
}

export interface RangeNode {
  t: 'range';
  sheet?: string;
  sheet2?: string;
  r1: number; c1: number; r2: number; c2: number;
  r1Abs: boolean; c1Abs: boolean; r2Abs: boolean; c2Abs: boolean;
  /** 'cols' = A:C (whole columns), 'rows' = 1:3 (whole rows). */
  kind: 'cells' | 'cols' | 'rows';
}

export interface StructNode {
  t: 'struct';
  /** Table name; empty = the table containing the host cell. */
  table: string;
  /** Column (or first column of a [[A]:[B]] span). */
  column?: string;
  column2?: string;
  /** #All / #Data / #Headers / #Totals / #This Row. */
  item?: 'all' | 'data' | 'headers' | 'totals' | 'thisRow';
}

export type Node =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'bool'; v: boolean }
  | { t: 'err'; v: ErrorCode }
  | RefNode
  | RangeNode
  | StructNode
  | { t: 'refErr'; sheet?: string }
  | { t: 'name'; name: string; sheet?: string }
  | { t: 'array'; rows: Node[][] }
  | { t: 'unary'; op: '-' | '+' | '@'; a: Node }
  | { t: 'postfix'; op: '%' | '#'; a: Node }
  | { t: 'bin'; op: BinOp; a: Node; b: Node }
  | { t: 'union'; items: Node[] }
  | { t: 'call'; name: string; args: Node[] }
  | { t: 'invoke'; fn: Node; args: Node[] }
  | { t: 'paren'; a: Node }
  | { t: 'missing' };

export type BinOp = ':' | ' ' | '^' | '*' | '/' | '+' | '-' | '&' | '=' | '<>' | '<' | '>' | '<=' | '>=';

export class FormulaParseError extends Error {
  constructor(message: string, public readonly pos: number) { super(message); }
}

/** Visit every node (pre-order). */
export function walk(node: Node, fn: (n: Node) => void): void {
  fn(node);
  switch (node.t) {
    case 'unary': case 'postfix': case 'paren': walk(node.a, fn); break;
    case 'bin': walk(node.a, fn); walk(node.b, fn); break;
    case 'union': node.items.forEach(n => walk(n, fn)); break;
    case 'call': node.args.forEach(n => walk(n, fn)); break;
    case 'invoke': walk(node.fn, fn); node.args.forEach(n => walk(n, fn)); break;
    case 'array': node.rows.forEach(r => r.forEach(n => walk(n, fn))); break;
  }
}

/** Rebuild a tree bottom-up through `fn` (return the node unchanged to keep it). */
export function mapNode(node: Node, fn: (n: Node) => Node): Node {
  let n: Node = node;
  switch (node.t) {
    case 'unary': n = { ...node, a: mapNode(node.a, fn) }; break;
    case 'postfix': n = { ...node, a: mapNode(node.a, fn) }; break;
    case 'paren': n = { ...node, a: mapNode(node.a, fn) }; break;
    case 'bin': n = { ...node, a: mapNode(node.a, fn), b: mapNode(node.b, fn) }; break;
    case 'union': n = { ...node, items: node.items.map(x => mapNode(x, fn)) }; break;
    case 'call': n = { ...node, args: node.args.map(x => mapNode(x, fn)) }; break;
    case 'invoke': n = { ...node, fn: mapNode(node.fn, fn), args: node.args.map(x => mapNode(x, fn)) }; break;
    case 'array': n = { ...node, rows: node.rows.map(r => r.map(x => mapNode(x, fn))) }; break;
  }
  return fn(n);
}
