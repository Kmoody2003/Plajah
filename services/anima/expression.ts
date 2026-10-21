/**
 * services/anima/expression.ts — safe math expressions for Anima channels.
 *
 * Replaces `new Function`: expressions are parsed into a small AST and evaluated with no
 * access to globals. Supported:
 *   numbers, + - * / % ^ (power), parentheses, unary minus
 *   variables: time, frame, fps, value, PI
 *   functions: sin cos tan abs min max floor ceil round sqrt pow clamp
 *              wiggle(freq, amp)  — smooth random offset added on top of the keyed value
 *   `Math.` prefixes are accepted (Math.sin → sin) for older saved projects.
 * Anything else fails to parse, and the channel falls back to its keyed value.
 */

type Node =
  | { k: 'num'; v: number }
  | { k: 'var'; name: string }
  | { k: 'neg'; a: Node }
  | { k: 'bin'; op: string; a: Node; b: Node }
  | { k: 'call'; name: string; args: Node[] };

const FUNCS: Record<string, (...a: number[]) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  abs: Math.abs,
  min: Math.min,
  max: Math.max,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  sqrt: Math.sqrt,
  pow: Math.pow,
  clamp: (x, lo, hi) => Math.min(hi, Math.max(lo, x)),
};
const VARS = new Set(['time', 'frame', 'fps', 'value', 'PI']);

/** Smooth value noise in [-amp, amp], `freq` changes per second. */
export function wiggleNoise(freq: number, amp: number, time: number): number {
  const t = time * freq;
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  const h = (n: number) => {
    const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  };
  return (h(i) + (h(i + 1) - h(i)) * u) * amp;
}

function tokenize(src: string): string[] | null {
  const out: string[] = [];
  const re = /\s*(\d+\.?\d*|\.\d+|[A-Za-z_][A-Za-z_0-9]*|[-+*/%^(),])/y;
  let pos = 0;
  const s = src.replace(/\bMath\./g, '');
  while (pos < s.length) {
    re.lastIndex = pos;
    const m = re.exec(s);
    if (!m) return /^\s*$/.test(s.slice(pos)) ? out : null;
    out.push(m[1]);
    pos = re.lastIndex;
  }
  return out;
}

function parse(tokens: string[]): Node | null {
  let i = 0;
  const peek = () => tokens[i];
  const eat = (t?: string) => {
    const tok = tokens[i];
    if (t !== undefined && tok !== t) throw new Error(`expected ${t}`);
    i++;
    return tok;
  };
  const expr = (): Node => {
    let a = term();
    while (peek() === '+' || peek() === '-') {
      const op = eat();
      a = { k: 'bin', op, a, b: term() };
    }
    return a;
  };
  const term = (): Node => {
    let a = power();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = eat();
      a = { k: 'bin', op, a, b: power() };
    }
    return a;
  };
  const power = (): Node => {
    const a = unary();
    if (peek() === '^') {
      eat();
      return { k: 'bin', op: '^', a, b: power() };
    }
    return a;
  };
  const unary = (): Node => {
    if (peek() === '-') {
      eat();
      return { k: 'neg', a: unary() };
    }
    if (peek() === '+') {
      eat();
      return unary();
    }
    return atom();
  };
  const atom = (): Node => {
    const tok = peek();
    if (tok === undefined) throw new Error('unexpected end');
    if (tok === '(') {
      eat();
      const e = expr();
      eat(')');
      return e;
    }
    if (/^[\d.]/.test(tok)) {
      eat();
      return { k: 'num', v: parseFloat(tok) };
    }
    if (/^[A-Za-z_]/.test(tok)) {
      eat();
      if (peek() === '(') {
        if (!(tok in FUNCS) && tok !== 'wiggle') throw new Error(`unknown function ${tok}`);
        eat('(');
        const args: Node[] = [];
        if (peek() !== ')') {
          args.push(expr());
          while (peek() === ',') {
            eat();
            args.push(expr());
          }
        }
        eat(')');
        return { k: 'call', name: tok, args };
      }
      if (!VARS.has(tok)) throw new Error(`unknown name ${tok}`);
      return { k: 'var', name: tok };
    }
    throw new Error(`unexpected ${tok}`);
  };
  try {
    const n = expr();
    return i === tokens.length ? n : null;
  } catch {
    return null;
  }
}

export interface ExpressionScope {
  time: number;
  frame: number;
  fps: number;
  value: number;
}

function run(n: Node, s: ExpressionScope): number {
  switch (n.k) {
    case 'num':
      return n.v;
    case 'var':
      return n.name === 'PI' ? Math.PI : s[n.name as keyof ExpressionScope];
    case 'neg':
      return -run(n.a, s);
    case 'bin': {
      const a = run(n.a, s);
      const b = run(n.b, s);
      switch (n.op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return a / b;
        case '%': return a % b;
        default: return Math.pow(a, b);
      }
    }
    case 'call': {
      const args = n.args.map((a) => run(a, s));
      if (n.name === 'wiggle') return wiggleNoise(args[0] ?? 2, args[1] ?? 10, s.time);
      return FUNCS[n.name](...args);
    }
  }
}

const cache = new Map<string, Node | null>();

/** Compiles once per distinct source; null when it isn't a valid expression. */
export function compileExpression(code: string): ((s: ExpressionScope) => number) | null {
  let node = cache.get(code);
  if (node === undefined) {
    const tokens = tokenize(code);
    node = tokens ? parse(tokens) : null;
    if (cache.size > 500) cache.clear();
    cache.set(code, node);
  }
  if (!node) return null;
  const root = node;
  return (s) => {
    const v = run(root, s);
    return Number.isFinite(v) ? v : s.value;
  };
}
