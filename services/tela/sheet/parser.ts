// parser — Excel formula tokenizer + Pratt parser.
//
// Grammar coverage: numbers, strings, booleans, error literals, A1 refs with
// $ (absolute/mixed), ranges, whole columns/rows (A:A, 1:1), sheet-qualified
// and 3D refs ('My Sheet'!A1, Sheet1:Sheet3!A1), spill refs (A1#), named
// ranges, structured refs (Table[Col], [@Col]), array constants {1,2;3,4},
// union (A1,B1) inside parens, space intersection, `@` implicit intersection,
// LAMBDA invocation `LAMBDA(x,x+1)(2)`, and Excel operator precedence:
//   :  >  space  >  unary -  >  %  >  ^  >  * /  >  + -  >  &  >  comparisons
// (unary minus binds tighter than ^, so -2^2 = 4; ^ is left-associative.)
//
// The tokenizer is exported with positions so the formula bar can colour refs
// and drive autocomplete without re-implementing the lexing rules.

import { MAX_COLS, MAX_ROWS, lettersToCol } from './address';
import { FormulaParseError, type Node, type BinOp, type StructNode } from './ast';
import { ERROR_CODES, type ErrorCode } from './values';

export type TokenType =
  | 'num' | 'str' | 'bool' | 'err' | 'ref' | 'func' | 'name' | 'struct' | 'op' | 'lparen' | 'rparen'
  | 'comma' | 'semi' | 'lbrace' | 'rbrace' | 'ws' | 'sheet' | 'hash' | 'at';

export interface Token { type: TokenType; text: string; start: number; end: number }

const ERR_LITERALS = [...ERROR_CODES].sort((a, b) => b.length - a.length);

const RE_NUM = /(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/y;
const RE_SHEET_QUOTED = /'((?:[^']|'')+)'!/y;

// Character classes by code (no regex in the hot path).
const isLetter = (c: number) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
const isDigit = (c: number) => c >= 48 && c <= 57;
const isIdentStart = (c: number) => isLetter(c) || c === 95 || c === 92 || c >= 0xa1;
const isIdentChar = (c: number) => isIdentStart(c) || isDigit(c) || c === 46 || c === 63;

/** `$?L{1,3}` → end index or -1; sets `colLen`. */
function scanCol(src: string, i: number): number {
  let j = i;
  if (src.charCodeAt(j) === 36) j++;
  const s0 = j;
  while (j < src.length && j - s0 < 4 && isLetter(src.charCodeAt(j))) j++;
  const n = j - s0;
  if (n < 1 || n > 3) return -1;
  if (n === 3 && src.slice(s0, j).toUpperCase() > 'XFD') return -1;
  return j;
}
/** `$?D+` → end index or -1. */
function scanRow(src: string, i: number): number {
  let j = i;
  if (src.charCodeAt(j) === 36) j++;
  const s0 = j;
  while (j < src.length && isDigit(src.charCodeAt(j))) j++;
  if (j === s0 || src.charCodeAt(s0) === 48) return -1;
  return j;
}
/** A1 cell at i → end or -1. */
function scanCell(src: string, i: number): number {
  const c = scanCol(src, i); if (c < 0) return -1;
  return scanRow(src, c);
}
/** Reference token length at i (cell, range, A:A, 1:1) or 0. */
function scanRef(src: string, i: number): number {
  const endsOk = (j: number) => j >= src.length || (!isIdentChar(src.charCodeAt(j)) && src.charCodeAt(j) !== 40 /* ( */);
  const cell = scanCell(src, i);
  if (cell > 0) {
    if (src.charCodeAt(cell) === 58 /* : */) { const c2 = scanCell(src, cell + 1); if (c2 > 0 && endsOk(c2)) return c2 - i; }
    return endsOk(cell) ? cell - i : 0;
  }
  const col = scanCol(src, i);
  if (col > 0 && src.charCodeAt(col) === 58) { const c2 = scanCol(src, col + 1); if (c2 > 0 && endsOk(c2) && !isDigit(src.charCodeAt(c2))) return c2 - i; }
  const row = scanRow(src, i);
  if (row > 0 && src.charCodeAt(row) === 58) { const r2 = scanRow(src, row + 1); if (r2 > 0 && endsOk(r2)) return r2 - i; }
  return 0;
}
/** Unquoted sheet prefix `Name!` / `A:B!` at i → length or 0. */
function scanSheet(src: string, i: number): number {
  let j = i;
  for (let part = 0; part < 2; part++) {
    if (!isIdentStart(src.charCodeAt(j))) return 0;
    j++;
    while (j < src.length && isIdentChar(src.charCodeAt(j)) && src.charCodeAt(j) !== 63) j++;
    if (src.charCodeAt(j) === 33 /* ! */) return j + 1 - i;
    if (part === 0 && src.charCodeAt(j) === 58) { j++; continue; }
    return 0;
  }
  return 0;
}

const tok = (out: Token[], type: TokenType, src: string, i: number, len: number) => { out.push({ type, text: src.slice(i, i + len), start: i, end: i + len }); return i + len; };

/** Tokenize a formula body (no leading '='). Never throws: unknown chars become 'op' tokens the parser rejects. */
export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src.charCodeAt(i);
    if (c === 32 || c === 10 || c === 13 || c === 9) {
      let j = i; while (j < n) { const d = src.charCodeAt(j); if (d !== 32 && d !== 10 && d !== 13 && d !== 9) break; j++; }
      i = tok(out, 'ws', src, i, j - i); continue;
    }
    if (c === 34 /* " */) {
      let j = i + 1;
      while (j < n) { if (src.charCodeAt(j) === 34) { if (src.charCodeAt(j + 1) === 34) { j += 2; continue; } j++; break; } j++; }
      if (j > n) j = n;
      i = tok(out, 'str', src, i, j - i); continue;
    }
    if (c === 39 /* ' */) { RE_SHEET_QUOTED.lastIndex = i; const m = RE_SHEET_QUOTED.exec(src); if (m) { i = tok(out, 'sheet', src, i, m[0].length); continue; } }
    if (isIdentStart(c)) { const L = scanSheet(src, i); if (L) { i = tok(out, 'sheet', src, i, L); continue; } }
    if (c === 36 || isLetter(c) || isDigit(c)) { const L = scanRef(src, i); if (L) { i = tok(out, 'ref', src, i, L); continue; } }
    if (isDigit(c) || c === 46) { RE_NUM.lastIndex = i; const m = RE_NUM.exec(src); if (m) { i = tok(out, 'num', src, i, m[0].length); continue; } }
    if (c === 35 /* # */) {
      const up = src.slice(i, i + 14).toUpperCase();
      const lit = ERR_LITERALS.find(e => up.startsWith(e));
      i = tok(out, lit ? 'err' : 'hash', src, i, lit ? lit.length : 1); continue;
    }
    if (c === 91 /* [ */) { i = tok(out, 'struct', src, i, bracketLen(src, i)); continue; }
    if (isIdentStart(c)) {
      let j = i + 1; while (j < n && isIdentChar(src.charCodeAt(j))) j++;
      if (src.charCodeAt(j) === 91) { j += bracketLen(src, j); i = tok(out, 'struct', src, i, j - i); continue; }
      if (src.charCodeAt(j) === 40) { i = tok(out, 'func', src, i, j - i); continue; }
      const up = src.slice(i, j).toUpperCase();
      const afterSheet = out.length > 0 && out[out.length - 1].type === 'sheet';
      i = tok(out, (up === 'TRUE' || up === 'FALSE') && !afterSheet ? 'bool' : 'name', src, i, j - i); continue;
    }
    const ch = src[i];
    if (ch === '<' && (src[i + 1] === '=' || src[i + 1] === '>')) { i = tok(out, 'op', src, i, 2); continue; }
    if (ch === '>' && src[i + 1] === '=') { i = tok(out, 'op', src, i, 2); continue; }
    switch (ch) {
      case '(': i = tok(out, 'lparen', src, i, 1); continue;
      case ')': i = tok(out, 'rparen', src, i, 1); continue;
      case ',': i = tok(out, 'comma', src, i, 1); continue;
      case ';': i = tok(out, 'semi', src, i, 1); continue;
      case '{': i = tok(out, 'lbrace', src, i, 1); continue;
      case '}': i = tok(out, 'rbrace', src, i, 1); continue;
      case '@': i = tok(out, 'at', src, i, 1); continue;
    }
    i = tok(out, 'op', src, i, 1);
  }
  return out;
}

function bracketLen(src: string, i: number): number {
  let depth = 0, j = i;
  while (j < src.length) {
    const c = src[j];
    if (c === "'" && j + 1 < src.length) { j += 2; continue; } // escape char in structured refs
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) return j - i + 1; }
    j++;
  }
  return src.length - i;
}

// ── Reference text → node ────────────────────────────────────────────────────

function cellPart(s: string): { col: number; row: number; colAbs: boolean; rowAbs: boolean } {
  const m = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/.exec(s)!;
  return { colAbs: m[1] === '$', col: lettersToCol(m[2]), rowAbs: m[3] === '$', row: Number(m[4]) - 1 };
}

export function refTextToNode(text: string, sheet?: string, sheet2?: string): Node {
  const sh = sheet !== undefined ? { sheet, ...(sheet2 ? { sheet2 } : {}) } : {};
  if (text.includes(':')) {
    const [a, b] = text.split(':');
    if (/^\$?[A-Za-z]+$/.test(a)) {
      const c1 = lettersToCol(a.replace('$', '')), c2 = lettersToCol(b.replace('$', ''));
      return { t: 'range', ...sh, r1: 0, r2: MAX_ROWS - 1, c1: Math.min(c1, c2), c2: Math.max(c1, c2), r1Abs: true, r2Abs: true, c1Abs: a.startsWith('$'), c2Abs: b.startsWith('$'), kind: 'cols' };
    }
    if (/^\$?\d+$/.test(a)) {
      const r1 = Number(a.replace('$', '')) - 1, r2 = Number(b.replace('$', '')) - 1;
      return { t: 'range', ...sh, c1: 0, c2: MAX_COLS - 1, r1: Math.min(r1, r2), r2: Math.max(r1, r2), c1Abs: true, c2Abs: true, r1Abs: a.startsWith('$'), r2Abs: b.startsWith('$'), kind: 'rows' };
    }
    const p = cellPart(a), q = cellPart(b);
    // Normalize so r1<=r2, c1<=c2 (Excel does the same on entry).
    const [top, bot] = p.row <= q.row ? [p, q] : [q, p];
    const [lef, rig] = p.col <= q.col ? [p, q] : [q, p];
    return { t: 'range', ...sh, r1: top.row, r1Abs: top.rowAbs, r2: bot.row, r2Abs: bot.rowAbs, c1: lef.col, c1Abs: lef.colAbs, c2: rig.col, c2Abs: rig.colAbs, kind: 'cells' };
  }
  const p = cellPart(text);
  return { t: 'ref', ...sh, row: p.row, col: p.col, rowAbs: p.rowAbs, colAbs: p.colAbs };
}

function parseStruct(text: string): StructNode {
  const b = text.indexOf('[');
  const table = text.slice(0, b);
  const inner = text.slice(b + 1, -1).trim();
  const node: StructNode = { t: 'struct', table };
  const unesc = (s: string) => s.replace(/'(.)/g, '$1');
  const items = inner.startsWith('[') ? inner.match(/\[[^\]]*\]/g)?.map(s => s.slice(1, -1)) ?? [] : [inner];
  // [[#This Row],[A]:[B]] arrives as ["#This Row", "A", "B"] (':' is outside brackets).
  const spanned = inner.includes(']:[');
  const cols: string[] = [];
  for (let it of items) {
    it = it.trim();
    if (!it) continue;
    if (it.startsWith('@')) { node.item = 'thisRow'; it = it.slice(1).trim(); if (it.startsWith('[')) it = it.slice(1, -1); if (!it) continue; }
    const low = it.toLowerCase();
    if (low === '#all') node.item = 'all';
    else if (low === '#data') node.item = 'data';
    else if (low === '#headers') node.item = 'headers';
    else if (low === '#totals') node.item = 'totals';
    else if (low === '#this row') node.item = 'thisRow';
    else cols.push(unesc(it));
  }
  if (cols[0] !== undefined) node.column = cols[0];
  if (spanned && cols[1] !== undefined) node.column2 = cols[1];
  return node;
}

function unquoteSheet(tok: string): { sheet: string; sheet2?: string } {
  const body = tok.slice(0, -1); // drop '!'
  if (body.startsWith("'")) {
    const inner = body.slice(1, -1).replace(/''/g, "'");
    const parts = inner.split(':');
    return parts.length === 2 ? { sheet: parts[0], sheet2: parts[1] } : { sheet: inner };
  }
  const parts = body.split(':');
  return parts.length === 2 ? { sheet: parts[0], sheet2: parts[1] } : { sheet: body };
}

// ── Pratt parser ─────────────────────────────────────────────────────────────

const BIN_BP: Record<string, number> = {
  '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1,
  '&': 2, '+': 3, '-': 3, '*': 4, '/': 4, '^': 5,
  ' ': 8, ':': 9,
};
const UNARY_BP = 6;
const PERCENT_BP = 7;

class Parser {
  private toks: Token[];
  private p = 0;
  constructor(private src: string) {
    this.toks = tokenize(src);
  }
  private peekRaw(): Token | undefined { return this.toks[this.p]; }
  /** Next significant token, reporting whether whitespace was skipped. */
  private peek(): { tok?: Token; ws: boolean; idx: number } {
    let i = this.p, ws = false;
    while (this.toks[i]?.type === 'ws') { ws = true; i++; }
    return { tok: this.toks[i], ws, idx: i };
  }
  private next(): Token | undefined {
    const { tok, idx } = this.peek();
    this.p = idx + 1;
    return tok;
  }
  private fail(msg: string, tok?: Token): never {
    throw new FormulaParseError(msg, tok ? tok.start : this.src.length);
  }
  private expect(type: TokenType, text?: string): Token {
    const t = this.next();
    if (!t || t.type !== type || (text !== undefined && t.text !== text)) this.fail(`Expected ${text ?? type}`, t);
    return t;
  }

  parseFormula(): Node {
    const n = this.parseExpr(0);
    const { tok } = this.peek();
    if (tok) this.fail(`Unexpected '${tok.text}'`, tok);
    return n;
  }

  private startsOperand(t?: Token): boolean {
    return !!t && (t.type === 'ref' || t.type === 'name' || t.type === 'func' || t.type === 'sheet' || t.type === 'lparen' || t.type === 'struct');
  }

  parseExpr(minBp: number): Node {
    let left = this.parsePrefix();
    for (;;) {
      const { tok, ws } = this.peek();
      if (!tok) break;
      // Postfix percent / spill.
      if (tok.type === 'op' && tok.text === '%') {
        if (PERCENT_BP < minBp) break;
        this.next(); left = { t: 'postfix', op: '%', a: left }; continue;
      }
      if (tok.type === 'hash' && !ws) {
        this.next();
        left = left.t === 'ref' ? { ...left, spill: true } : { t: 'postfix', op: '#', a: left };
        continue;
      }
      // Invocation of a lambda-valued expression: LAMBDA(x,x)(1).
      if (tok.type === 'lparen' && !ws && (left.t === 'call' || left.t === 'invoke' || left.t === 'paren')) {
        this.next();
        left = { t: 'invoke', fn: left, args: this.parseArgs() };
        continue;
      }
      let op: string | null = null;
      if (tok.type === 'op' && tok.text in BIN_BP) op = tok.text;
      else if (ws && this.startsOperand(tok) && minBp <= BIN_BP[' ']) op = ' ';
      if (!op) break;
      const bp = BIN_BP[op];
      if (bp < minBp) break;
      if (op !== ' ') this.next();
      const right = this.parseExpr(bp + 1);
      left = { t: 'bin', op: op as BinOp, a: left, b: right };
    }
    return left;
  }

  private parseArgs(): Node[] {
    const args: Node[] = [];
    let { tok } = this.peek();
    if (tok?.type === 'rparen') { this.next(); return args; }
    for (;;) {
      ({ tok } = this.peek());
      if (tok?.type === 'comma' || tok?.type === 'rparen') args.push({ t: 'missing' });
      else args.push(this.parseExpr(0));
      const t = this.next();
      if (t?.type === 'comma') continue;
      if (t?.type === 'rparen') break;
      this.fail('Expected , or )', t);
    }
    return args;
  }

  private parsePrefix(): Node {
    const t = this.next();
    if (!t) this.fail('Unexpected end of formula');
    switch (t.type) {
      case 'num': return { t: 'num', v: Number(t.text) };
      case 'str': return { t: 'str', v: t.text.slice(1, t.text.endsWith('"') && t.text.length > 1 ? -1 : undefined).replace(/""/g, '"') };
      case 'bool': return { t: 'bool', v: t.text.toUpperCase() === 'TRUE' };
      case 'err': {
        const code = t.text.toUpperCase() as ErrorCode;
        return code === '#REF!' ? { t: 'refErr' } : { t: 'err', v: code };
      }
      case 'ref': return refTextToNode(t.text);
      case 'struct': return parseStruct(t.text);
      case 'sheet': {
        const { sheet, sheet2 } = unquoteSheet(t.text);
        const n = this.peekRaw();
        if (!n) this.fail('Expected reference after sheet name', t);
        this.p++;
        if (n.type === 'ref') return refTextToNode(n.text, sheet, sheet2);
        if (n.type === 'err' && n.text.toUpperCase() === '#REF!') return { t: 'refErr', sheet };
        if (n.type === 'name') return { t: 'name', name: n.text, sheet };
        if (n.type === 'bool') return { t: 'name', name: n.text, sheet };
        return this.fail('Expected reference after sheet name', n);
      }
      case 'name': return { t: 'name', name: t.text };
      case 'func': {
        const name = t.text;
        this.expect('lparen');
        return { t: 'call', name: normalizeFnName(name), args: this.parseArgs() };
      }
      case 'lparen': {
        const first = this.parseExpr(0);
        const items = [first];
        for (;;) {
          const n = this.next();
          if (n?.type === 'rparen') break;
          if (n?.type === 'comma') { items.push(this.parseExpr(0)); continue; }
          this.fail('Expected )', n);
        }
        return items.length === 1 ? { t: 'paren', a: first } : { t: 'union', items };
      }
      case 'lbrace': return this.parseArray();
      case 'op':
        if (t.text === '-' || t.text === '+') return { t: 'unary', op: t.text, a: this.parseExpr(UNARY_BP) };
        return this.fail(`Unexpected '${t.text}'`, t);
      case 'at': return { t: 'unary', op: '@', a: this.parseExpr(UNARY_BP) };
      default: return this.fail(`Unexpected '${t.text}'`, t);
    }
  }

  private parseArray(): Node {
    const rows: Node[][] = [[]];
    for (;;) {
      let t = this.next();
      if (!t) this.fail('Unterminated array constant');
      let sign = 1;
      while (t && t.type === 'op' && (t.text === '-' || t.text === '+')) { if (t.text === '-') sign = -sign; t = this.next(); }
      if (!t) this.fail('Unterminated array constant');
      let el: Node;
      if (t.type === 'num') el = { t: 'num', v: sign * Number(t.text) };
      else if (t.type === 'str') el = { t: 'str', v: t.text.slice(1, -1).replace(/""/g, '"') };
      else if (t.type === 'bool') el = { t: 'bool', v: t.text.toUpperCase() === 'TRUE' };
      else if (t.type === 'err') el = { t: 'err', v: t.text.toUpperCase() as ErrorCode };
      else this.fail('Array constants may only contain literals', t);
      rows[rows.length - 1].push(el);
      const sep = this.next();
      if (sep?.type === 'rbrace') break;
      if (sep?.type === 'comma') continue;
      if (sep?.type === 'semi') { rows.push([]); continue; }
      this.fail('Expected , ; or }', sep);
    }
    const w = rows[0].length;
    if (rows.some(r => r.length !== w)) this.fail('Array constant rows must be the same length');
    return { t: 'array', rows };
  }
}

let isBuiltin: ((upper: string) => boolean) | null = null;
/** The function registry tells the parser which names are built-ins (those are upper-cased; user LAMBDA names keep their case). */
export function setBuiltinCheck(fn: (upper: string) => boolean) { isBuiltin = fn; }

/** Strip OOXML future-function prefixes; upper-case built-in names. */
export function normalizeFnName(name: string): string {
  const bare = name.replace(/^_xlfn\._xlws\./i, '').replace(/^_xlfn\./i, '').replace(/^_xlws\./i, '').replace(/^_xll\./i, '');
  const up = bare.toUpperCase();
  return !isBuiltin || isBuiltin(up) ? up : bare;
}

/** Parse a formula body (with or without the leading '='). Throws FormulaParseError. */
export function parseFormula(formula: string): Node {
  const src = formula.startsWith('=') ? formula.slice(1) : formula;
  if (!src.trim()) throw new FormulaParseError('Empty formula', 0);
  return new Parser(src).parseFormula();
}

/** Parse without throwing. */
export function tryParseFormula(formula: string): { ast: Node } | { error: FormulaParseError } {
  try { return { ast: parseFormula(formula) }; } catch (e) {
    return { error: e instanceof FormulaParseError ? e : new FormulaParseError(String((e as Error)?.message ?? e), 0) };
  }
}
