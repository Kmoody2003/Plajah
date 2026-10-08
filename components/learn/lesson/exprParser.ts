/**
 * A small, safe formula parser so a teacher can type "x^2 - 2x - 3" or "sin(2*pi*x)" into a graph. It builds a closure from a
 * recursive-descent parse: no eval, no Function, no access to anything but the variable x, a few constants and a few functions.
 * Supported: numbers, x, pi, e, + - * / ^ (right-associative), unary minus, parentheses, implicit multiplication ("2x", "3(x+1)", "2pi"),
 * and sin cos tan asin acos atan sqrt abs ln log (base 10) exp floor ceil.
 */
const FUNCS: Record<string, (n: number) => number> = { sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, sqrt: Math.sqrt, abs: Math.abs, ln: Math.log, log: Math.log10, exp: Math.exp, floor: Math.floor, ceil: Math.ceil };
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };
type Node = (x: number) => number;
type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = []; let i = 0; const s = src.toLowerCase().replace(/−/g, '-').replace(/·|×/g, '*');
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (/[0-9.]/.test(c)) { let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++; const v = Number(s.slice(i, j)); if (!isFinite(v)) throw new Error(`Bad number "${s.slice(i, j)}"`); out.push({ t: 'num', v }); i = j; continue; }
    if (/[a-z]/.test(c)) { let j = i; while (j < s.length && /[a-z]/.test(s[j])) j++; out.push({ t: 'id', v: s.slice(i, j) }); i = j; continue; }
    if ('+-*/^()'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    throw new Error(`Unexpected "${c}"`);
  }
  return out;
}

export function compileExpr(src: string): (x: number) => number {
  const toks = tokenize(src); let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek()?.t === 'op' && (peek() as any).v === v;
  const expect = (v: string) => { if (!isOp(v)) throw new Error(`Expected "${v}"`); p++; };

  // Splits a run of letters like "xpi" or "sinx" the user typed without spaces: only exact names are accepted.
  function primary(): Node {
    const k = peek(); if (!k) throw new Error('The formula ends too soon');
    if (k.t === 'num') { p++; const v = k.v; return () => v; }
    if (k.t === 'id') {
      p++;
      if (k.v === 'x') return x => x;
      if (k.v in CONSTS) { const v = CONSTS[k.v]; return () => v; }
      if (k.v in FUNCS) { const f = FUNCS[k.v]; expect('('); const a = expr(); expect(')'); return x => f(a(x)); }
      throw new Error(`Unknown name "${k.v}". Use x, pi, e, or sin, cos, tan, sqrt, abs, ln, log, exp.`);
    }
    if (k.v === '(') { p++; const a = expr(); expect(')'); return a; }
    throw new Error(`Unexpected "${k.v}"`);
  }
  function unary(): Node { if (isOp('-')) { p++; const a = unary(); return x => -a(x); } if (isOp('+')) { p++; return unary(); } return power(); }
  function power(): Node {
    const base = primary();
    if (isOp('^')) { p++; const e = unary(); return x => Math.pow(base(x), e(x)); }
    return base;
  }
  // implicit multiplication: a number, constant or closing parenthesis followed by x, a name or "("
  const startsOperand = () => { const k = peek(); return !!k && (k.t === 'num' || k.t === 'id' || (k.t === 'op' && k.v === '(')); };
  function term(): Node {
    let a = unary();
    for (;;) {
      if (isOp('*')) { p++; const b = unary(); const l = a; a = x => l(x) * b(x); }
      else if (isOp('/')) { p++; const b = unary(); const l = a; a = x => l(x) / b(x); }
      else if (startsOperand()) { const b = power(); const l = a; a = x => l(x) * b(x); }
      else return a;
    }
  }
  function expr(): Node {
    let a = term();
    for (;;) {
      if (isOp('+')) { p++; const b = term(); const l = a; a = x => l(x) + b(x); }
      else if (isOp('-')) { p++; const b = term(); const l = a; a = x => l(x) - b(x); }
      else return a;
    }
  }
  if (!toks.length) throw new Error('Type a formula such as x^2 - 2x - 3');
  const root = expr();
  if (p < toks.length) throw new Error(`Unexpected "${(toks[p] as any).v}"`);
  return root;
}

/** Returns an error message, or null when the formula is valid and gives numbers on a sample of points. */
export function checkExpr(src: string): string | null {
  try { const f = compileExpr(src); let ok = 0; for (const x of [-2, -1, -0.5, 0.5, 1, 2, 3]) if (isFinite(f(x))) ok++; return ok === 0 ? 'This formula gives no real values on the sample points.' : null; }
  catch (e: any) { return e?.message || 'This formula is not valid.'; }
}
