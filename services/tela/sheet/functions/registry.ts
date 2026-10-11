// registry — the function table with autocomplete metadata.
//
// A function is either eager (`fn` gets evaluated args; references stay Refs
// so ROW/INDEX/SUBTOTAL can see cells) or lazy (`lazy` gets thunks, for IF /
// IFERROR / LET / LAMBDA / CHOOSE short-circuiting). `lift` lists scalar
// parameters: when a range/array lands there, the call broadcasts elementwise
// and spills — that is how =LEN(A1:A5) or =A1:A3*2 behave in dynamic-array Excel.

import { broadcast, isMulti, scalarOf, toMatrix, type Frame } from '../coerce';
import { CellError, ERR, Lambda, Matrix, OMITTED, Ref, type Scalar, type Value, isErr } from '../values';
import type { Node } from '../ast';

export type FnCategory = 'math' | 'stat' | 'logical' | 'lookup' | 'text' | 'date' | 'financial' | 'info' | 'engineering' | 'database' | 'compat';
export type FnImpl = (args: Value[], f: Frame) => Value;
export type Thunk = () => Value;
export type LazyImpl = (args: Thunk[], f: Frame, nodes: Node[]) => Value;

export interface FnDef {
  name: string;
  category: FnCategory;
  min: number;
  max: number;
  /** Signature for autocomplete, e.g. "number, num_digits". */
  sig: string;
  desc: string;
  lift?: 'all' | number[];
  fn?: FnImpl;
  lazy?: LazyImpl;
  volatile?: boolean;
  /** Reads row visibility (SUBTOTAL/AGGREGATE) — recalculated on hide/filter. */
  usesHidden?: boolean;
  /** Reaches references computed at runtime (INDIRECT/OFFSET) — treated as volatile. */
  dynamicRefs?: boolean;
  /** Needs `_xlfn.` prefix in OOXML. */
  future?: boolean;
}

const REGISTRY = new Map<string, FnDef>();

export function define(d: FnDef): void { REGISTRY.set(d.name, d); }

/** Compact definer: def('ABS', 'math', 1, 1, 'number', 'Absolute value', impl, { lift: 'all' }). */
export function def(name: string, category: FnCategory, min: number, max: number, sig: string, desc: string, fn: FnImpl, extra: Partial<FnDef> = {}): void {
  define({ name, category, min, max, sig, desc, fn, ...extra });
}

export function alias(name: string, target: string, extra: Partial<FnDef> = {}): void {
  const t = REGISTRY.get(target);
  if (!t) throw new Error(`alias target ${target} missing`);
  REGISTRY.set(name, { ...t, name, ...extra });
}

export const getFn = (name: string) => REGISTRY.get(name.toUpperCase());

export interface FnInfo { name: string; category: FnCategory; sig: string; desc: string; min: number; max: number; volatile: boolean }
/** Metadata for autocomplete / function browser, sorted by name. */
export function listFunctions(): FnInfo[] {
  return [...REGISTRY.values()].map(d => ({ name: d.name, category: d.category, sig: d.sig, desc: d.desc, min: d.min, max: d.max, volatile: !!d.volatile }))
    .sort((a, b) => (a.name < b.name ? -1 : 1));
}
export const functionCount = () => REGISTRY.size;

/** Autocomplete: functions whose name starts with `prefix` (case-insensitive). */
export function suggestFunctions(prefix: string, limit = 12): FnInfo[] {
  const p = prefix.toUpperCase();
  return listFunctions().filter(f => f.name.startsWith(p)).slice(0, limit);
}

/** Collapse any value to a scalar result cell (used inside broadcasts). */
function scalarResult(v: Value, f: Frame): Scalar {
  if (v instanceof Matrix) return v.rows ? v.data[0][0] : ERR.CALC;
  if (v instanceof Ref || v instanceof Lambda || v === OMITTED) return scalarOf(v, f);
  return v as Scalar;
}

/** Frame of the innermost running function — lets arg helpers dereference Refs without threading it. */
export let currentFrame: Frame | null = null;

/** Call an eager function with lifting. */
export function invoke(d: FnDef, args: Value[], f: Frame): Value {
  const prev = currentFrame;
  currentFrame = f;
  try { return invokeInner(d, args, f); } finally { currentFrame = prev; }
}
function invokeInner(d: FnDef, args: Value[], f: Frame): Value {
  const fn = d.fn!;
  if (!d.lift) return fn(args, f);
  const pos: number[] = d.lift === 'all' ? args.map((_, i) => i) : d.lift.filter(i => i < args.length);
  let multi = false;
  for (const i of pos) if (isMulti(args[i])) { multi = true; break; }
  const a = args.slice();
  if (!multi) {
    for (const i of pos) if (a[i] !== OMITTED) a[i] = scalarOf(a[i], f);
    return fn(a, f);
  }
  const mats: Matrix[] = [];
  for (const i of pos) {
    if (a[i] === OMITTED) { mats.push(new Matrix([[null]])); continue; }
    const m = toMatrix(a[i], f);
    if (isErr(m)) return m;
    mats.push(m);
  }
  return broadcast(mats, vals => {
    for (let k = 0; k < pos.length; k++) a[pos[k]] = args[pos[k]] === OMITTED ? OMITTED : vals[k];
    return scalarResult(fn(a, f), f);
  });
}

export type { Scalar, Value, Frame, CellError };
