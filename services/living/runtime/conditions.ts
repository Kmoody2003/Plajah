import type { Cond, Scalar } from '../contracts';

export type VarGetter = (name: string) => Scalar | undefined;

/** Compare two scalars; a missing variable counts as 0 / '' / false depending on what it is compared with. */
function coerce(v: Scalar | undefined, like: Scalar): Scalar {
  if (v === undefined) return typeof like === 'number' ? 0 : typeof like === 'boolean' ? false : '';
  if (typeof like === 'number' && typeof v !== 'number') { const n = Number(v); return Number.isNaN(n) ? 0 : n; }
  if (typeof like === 'boolean' && typeof v !== 'boolean') return !!v && v !== 'false' && v !== 0;
  return v;
}

export function compareScalars(a: Scalar | undefined, op: '==' | '!=' | '>=' | '<=' | '>' | '<', b: Scalar): boolean {
  const l = coerce(a, b);
  switch (op) {
    case '==': return l === b;
    case '!=': return l !== b;
    case '>=': return l >= b;
    case '<=': return l <= b;
    case '>': return l > b;
    case '<': return l < b;
    default: return false;
  }
}

export function evalCond(c: Cond | undefined, get: VarGetter): boolean {
  if (!c) return true;
  if ('var' in c) return compareScalars(get(c.var), c.op, c.value);
  if ('all' in c) return c.all.every(x => evalCond(x, get));
  if ('any' in c) return c.any.some(x => evalCond(x, get));
  if ('not' in c) return !evalCond(c.not, get);
  return false;
}

/** Every variable a condition reads (used to re-check `when` triggers only when something relevant changed). */
export function condVars(c: Cond | undefined, out: Set<string> = new Set()): Set<string> {
  if (!c) return out;
  if ('var' in c) out.add(c.var);
  else if ('all' in c) c.all.forEach(x => condVars(x, out));
  else if ('any' in c) c.any.forEach(x => condVars(x, out));
  else if ('not' in c) condVars(c.not, out);
  return out;
}
