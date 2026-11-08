// MathML (the maths inside SBML) to a small expression tree we evaluate ourselves (no eval),
// and back to readable infix for the room.

import type { XNode } from '../tela/geometry/xml';

export type Expr =
  | { k: 'num'; v: number }
  | { k: 'sym'; name: string }
  | { k: 'time' }
  | { k: 'op'; op: string; args: Expr[] }
  | { k: 'call'; fn: string; args: Expr[] }
  | { k: 'piece'; pieces: Array<[Expr, Expr]>; otherwise?: Expr };

const local = (tag: string) => tag.replace(/^.*:/, '');
const kids = (n: XNode) => n.children.filter(c => !c.tag.startsWith('#'));

export function fromMathML(node: XNode): Expr {
  const tag = local(node.tag);
  if (tag === 'math' || tag === 'semantics') { const c = kids(node).filter(k => !/^annotation/.test(local(k.tag))); return fromMathML(c[c.length - 1]); }
  if (tag === 'cn') {
    const t = node.attrs.type; const parts = node.children.filter(c => local(c.tag) === 'sep');
    const text = (node.text || '').trim();
    if (t === 'e-notation' || t === 'rational') {
      const segs = collectText(node).split(/\s+/).filter(Boolean);
      if (segs.length >= 2) return { k: 'num', v: t === 'rational' ? +segs[0] / +segs[1] : +segs[0] * 10 ** +segs[1] };
    }
    void parts;
    return { k: 'num', v: parseFloat(text) };
  }
  if (tag === 'ci') return { k: 'sym', name: (node.text || '').trim() };
  if (tag === 'csymbol') {
    const url = node.attrs.definitionURL || '';
    if (/time$/.test(url)) return { k: 'time' };
    if (/avogadro$/.test(url)) return { k: 'num', v: 6.02214076e23 };
    return { k: 'sym', name: (node.text || '').trim() };
  }
  if (tag === 'pi') return { k: 'num', v: Math.PI };
  if (tag === 'exponentiale') return { k: 'num', v: Math.E };
  if (tag === 'true') return { k: 'num', v: 1 };
  if (tag === 'false') return { k: 'num', v: 0 };
  if (tag === 'infinity') return { k: 'num', v: Infinity };
  if (tag === 'notanumber') return { k: 'num', v: NaN };
  if (tag === 'piecewise') {
    const pieces: Array<[Expr, Expr]> = []; let otherwise: Expr | undefined;
    for (const c of kids(node)) { const cc = kids(c); if (local(c.tag) === 'piece') pieces.push([fromMathML(cc[0]), fromMathML(cc[1])]); else if (local(c.tag) === 'otherwise') otherwise = fromMathML(cc[0]); }
    return { k: 'piece', pieces, otherwise };
  }
  if (tag === 'apply') {
    const [head, ...rest] = kids(node); const h = local(head.tag);
    if (h === 'ci') return { k: 'call', fn: (head.text || '').trim(), args: rest.map(fromMathML) };
    if (h === 'root' || h === 'log') { // <degree>/<logbase> qualifiers
      const q = rest.find(r => local(r.tag) === (h === 'root' ? 'degree' : 'logbase'));
      const arg = rest.filter(r => r !== q).map(fromMathML)[0];
      const base = q ? fromMathML(kids(q)[0]) : { k: 'num', v: h === 'root' ? 2 : 10 } as Expr;
      return { k: 'op', op: h, args: [arg, base] };
    }
    return { k: 'op', op: h, args: rest.map(fromMathML) };
  }
  if (tag === 'lambda') { const c = kids(node); return fromMathML(c[c.length - 1]); }
  throw new Error(`MathML <${tag}> is not supported yet`);
}

const collectText = (n: XNode): string => (n.text || '') + ' ' + n.children.map(collectText).join(' ');

/** Lambda parameter names (functionDefinition). */
export function lambdaArgs(node: XNode): string[] {
  const lam = local(node.tag) === 'lambda' ? node : kids(node).find(c => local(c.tag) === 'lambda' || local(c.tag) === 'semantics');
  const l = lam && local(lam.tag) === 'semantics' ? kids(lam).find(c => local(c.tag) === 'lambda') : lam;
  return l ? kids(l).filter(c => local(c.tag) === 'bvar').map(b => (kids(b)[0]?.text || '').trim()) : [];
}

export interface Fn { args: string[]; body: Expr }
export type Scope = (name: string) => number;

export function evaluate(e: Expr, scope: Scope, t: number, fns: Record<string, Fn> = {}): number {
  switch (e.k) {
    case 'num': return e.v;
    case 'sym': return scope(e.name);
    case 'time': return t;
    case 'piece': { for (const [v, c] of e.pieces) if (evaluate(c, scope, t, fns)) return evaluate(v, scope, t, fns); return e.otherwise ? evaluate(e.otherwise, scope, t, fns) : NaN; }
    case 'call': {
      const f = fns[e.fn]; if (!f) throw new Error(`Unknown function ${e.fn}`);
      const vals = e.args.map(a => evaluate(a, scope, t, fns)); const map = new Map(f.args.map((n, i) => [n, vals[i]]));
      return evaluate(f.body, n => map.has(n) ? map.get(n)! : scope(n), t, fns);
    }
    case 'op': {
      const a = e.args.map(x => evaluate(x, scope, t, fns));
      switch (e.op) {
        case 'plus': return a.reduce((s, v) => s + v, 0);
        case 'minus': return a.length === 1 ? -a[0] : a[0] - a[1];
        case 'times': return a.reduce((s, v) => s * v, 1);
        case 'divide': return a[0] / a[1];
        case 'power': return a[0] ** a[1];
        case 'root': return a[0] ** (1 / a[1]);
        case 'exp': return Math.exp(a[0]);
        case 'ln': return Math.log(a[0]);
        case 'log': return Math.log(a[0]) / Math.log(a[1]);
        case 'abs': return Math.abs(a[0]);
        case 'floor': return Math.floor(a[0]);
        case 'ceiling': return Math.ceil(a[0]);
        case 'factorial': { let r = 1; for (let i = 2; i <= a[0]; i++) r *= i; return r; }
        case 'min': return Math.min(...a);
        case 'max': return Math.max(...a);
        case 'sin': return Math.sin(a[0]); case 'cos': return Math.cos(a[0]); case 'tan': return Math.tan(a[0]);
        case 'arcsin': return Math.asin(a[0]); case 'arccos': return Math.acos(a[0]); case 'arctan': return Math.atan(a[0]);
        case 'sinh': return Math.sinh(a[0]); case 'cosh': return Math.cosh(a[0]); case 'tanh': return Math.tanh(a[0]);
        case 'eq': return +(a[0] === a[1]); case 'neq': return +(a[0] !== a[1]);
        case 'lt': return +(a[0] < a[1]); case 'leq': return +(a[0] <= a[1]); case 'gt': return +(a[0] > a[1]); case 'geq': return +(a[0] >= a[1]);
        case 'and': return +a.every(Boolean); case 'or': return +a.some(Boolean); case 'xor': return +(a.filter(Boolean).length % 2 === 1); case 'not': return +!a[0];
        case 'rem': return a[0] % a[1]; case 'quotient': return Math.trunc(a[0] / a[1]);
        default: throw new Error(`MathML operator ${e.op} is not supported yet`);
      }
    }
  }
}

/** Every symbol an expression reads. */
export function symbols(e: Expr, out = new Set<string>()): Set<string> {
  if (e.k === 'sym') out.add(e.name);
  else if (e.k === 'op' || e.k === 'call') e.args.forEach(a => symbols(a, out));
  else if (e.k === 'piece') { e.pieces.forEach(([v, c]) => { symbols(v, out); symbols(c, out); }); if (e.otherwise) symbols(e.otherwise, out); }
  return out;
}

const INFIX: Record<string, [string, number]> = { plus: [' + ', 1], minus: [' − ', 1], times: ['·', 2], divide: ['/', 2], power: ['^', 3] };
export function toInfix(e: Expr, parent = 0): string {
  switch (e.k) {
    case 'num': return Number.isInteger(e.v) ? String(e.v) : String(+e.v.toPrecision(6));
    case 'sym': return e.name;
    case 'time': return 't';
    case 'piece': return `piecewise(${e.pieces.map(([v, c]) => `${toInfix(v)} if ${toInfix(c)}`).join(', ')}${e.otherwise ? `, else ${toInfix(e.otherwise)}` : ''})`;
    case 'call': return `${e.fn}(${e.args.map(a => toInfix(a)).join(', ')})`;
    case 'op': {
      const inf = INFIX[e.op];
      if (inf) { if (e.op === 'minus' && e.args.length === 1) return `−${toInfix(e.args[0], 3)}`; const s = e.args.map(a => toInfix(a, inf[1] + (e.op === 'power' ? 1 : 0))).join(inf[0]); return inf[1] < parent ? `(${s})` : s; }
      return `${e.op}(${e.args.map(a => toInfix(a)).join(', ')})`;
    }
  }
}

// ── Infix parser: what people type for a rate law ("Vmax*S/(Km+S)") ─────────

const FN_OPS: Record<string, string> = { exp: 'exp', ln: 'ln', log10: 'log', abs: 'abs', floor: 'floor', ceil: 'ceiling', min: 'min', max: 'max', sin: 'sin', cos: 'cos', tan: 'tan', sqrt: 'root', tanh: 'tanh' };

export function parseInfix(src: string): Expr {
  const toks = src.match(/\d+\.?\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?|[A-Za-z_][A-Za-z0-9_]*|\*\*|[-+*/^(),]/g) ?? [];
  if (toks.join('') !== src.replace(/\s+/g, '')) throw new Error(`Cannot read "${src}"`);
  let i = 0;
  const peek = () => toks[i]; const eat = (t?: string) => { const v = toks[i++]; if (t && v !== t) throw new Error(`Expected ${t} in "${src}"`); return v; };
  const expr = (): Expr => { let l = term(); while (peek() === '+' || peek() === '-') { const op = eat() === '+' ? 'plus' : 'minus'; l = { k: 'op', op, args: [l, term()] }; } return l; };
  const term = (): Expr => { let l = unary(); while (peek() === '*' || peek() === '/') { const op = eat() === '*' ? 'times' : 'divide'; l = { k: 'op', op, args: [l, unary()] }; } return l; };
  const unary = (): Expr => peek() === '-' ? (eat(), { k: 'op', op: 'minus', args: [unary()] }) : peek() === '+' ? (eat(), unary()) : power();
  const power = (): Expr => { const b = atom(); if (peek() === '^' || peek() === '**') { eat(); return { k: 'op', op: 'power', args: [b, unary()] }; } return b; };
  const atom = (): Expr => {
    const t = eat(); if (t === undefined) throw new Error(`Unexpected end of "${src}"`);
    if (t === '(') { const e = expr(); eat(')'); return e; }
    if (/^[\d.]/.test(t)) return { k: 'num', v: parseFloat(t) };
    if (peek() === '(') {
      eat('('); const args: Expr[] = []; if (peek() !== ')') { args.push(expr()); while (peek() === ',') { eat(); args.push(expr()); } } eat(')');
      if (t === 'sqrt') return { k: 'op', op: 'root', args: [args[0], { k: 'num', v: 2 }] };
      if (t === 'log10') return { k: 'op', op: 'log', args: [args[0], { k: 'num', v: 10 }] };
      return FN_OPS[t] ? { k: 'op', op: FN_OPS[t], args } : { k: 'call', fn: t, args };
    }
    if (t === 'time' || t === 't') return { k: 'time' };
    if (t === 'pi') return { k: 'num', v: Math.PI };
    return { k: 'sym', name: t };
  };
  const e = expr(); if (i < toks.length) throw new Error(`Unexpected "${toks[i]}" in "${src}"`);
  return e;
}

// ── Compiled evaluation: the tree becomes closures once, then runs fast ──────

export type Getter = () => number;

const UNARY: Record<string, (x: number) => number> = { exp: Math.exp, ln: Math.log, abs: Math.abs, floor: Math.floor, ceiling: Math.ceil, sin: Math.sin, cos: Math.cos, tan: Math.tan, arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh };

/** Compile an expression to a closure. `sym` resolves each name once, at compile time. */
export function compileExpr(e: Expr, sym: (name: string) => Getter, time: Getter, fns: Record<string, Fn> = {}, depth = 0): Getter {
  const c = (x: Expr) => compileExpr(x, sym, time, fns, depth);
  switch (e.k) {
    case 'num': { const v = e.v; return () => v; }
    case 'sym': return sym(e.name);
    case 'time': return time;
    case 'piece': {
      const ps = e.pieces.map(([v, cond]) => [c(v), c(cond)] as const); const other = e.otherwise ? c(e.otherwise) : () => NaN;
      return () => { for (const [v, cond] of ps) if (cond()) return v(); return other(); };
    }
    case 'call': {
      const f = fns[e.fn]; if (!f) throw new Error(`Unknown function ${e.fn}`);
      if (depth > 16) throw new Error(`Function ${e.fn} nests too deeply`);
      const args = e.args.map(c); const idx = new Map(f.args.map((n, i) => [n, i]));
      // Inline: the body's parameters read the call's argument closures.
      return compileExpr(f.body, n => idx.has(n) ? args[idx.get(n)!] : sym(n), time, fns, depth + 1);
    }
    case 'op': {
      const a = e.args.map(c); const [x, y] = a;
      switch (e.op) {
        case 'plus': return a.length === 2 ? () => x() + y() : a.length === 1 ? x : () => { let s = 0; for (const g of a) s += g(); return s; };
        case 'times': return a.length === 2 ? () => x() * y() : a.length === 1 ? x : () => { let s = 1; for (const g of a) s *= g(); return s; };
        case 'minus': return a.length === 1 ? () => -x() : () => x() - y();
        case 'divide': return () => x() / y();
        case 'power': return () => x() ** y();
        case 'root': return () => x() ** (1 / y());
        case 'log': return () => Math.log(x()) / Math.log(y());
        case 'min': return () => Math.min(...a.map(g => g()));
        case 'max': return () => Math.max(...a.map(g => g()));
        case 'eq': return () => +(x() === y()); case 'neq': return () => +(x() !== y());
        case 'lt': return () => +(x() < y()); case 'leq': return () => +(x() <= y()); case 'gt': return () => +(x() > y()); case 'geq': return () => +(x() >= y());
        case 'and': return () => +a.every(g => g()); case 'or': return () => +a.some(g => g()); case 'not': return () => +!x();
        case 'xor': return () => +(a.filter(g => g()).length % 2 === 1);
        case 'rem': return () => x() % y(); case 'quotient': return () => Math.trunc(x() / y());
        case 'factorial': return () => { let r = 1; for (let i = 2; i <= x(); i++) r *= i; return r; };
        default: { const u = UNARY[e.op]; if (u) return () => u(x()); throw new Error(`MathML operator ${e.op} is not supported yet`); }
      }
    }
  }
}
