import type { Scalar } from '../contracts';

export type VarOp = 'set' | 'inc' | 'dec' | 'toggle';
export type VarListener = (name: string, value: Scalar, prev: Scalar | undefined) => void;

/** Page-local variables. Tiny on purpose: a map, an `apply` for the contract's var ops, and change subscription. */
export class VarStore {
  private m = new Map<string, Scalar>();
  private listeners = new Set<VarListener>();
  constructor(private initial: Record<string, Scalar> = {}) { this.reset(); }

  get = (name: string): Scalar | undefined => this.m.get(name);
  num(name: string, d = 0): number { const v = this.m.get(name); const n = typeof v === 'number' ? v : Number(v); return Number.isFinite(n) ? n : d; }
  snapshot(): Record<string, Scalar> { return Object.fromEntries(this.m); }

  set(name: string, value: Scalar) {
    const prev = this.m.get(name);
    if (prev === value) return;
    this.m.set(name, value);
    for (const l of [...this.listeners]) l(name, value, prev);
  }

  apply(name: string, op: VarOp, value?: Scalar) {
    const cur = this.m.get(name);
    switch (op) {
      case 'set': this.set(name, value ?? 0); break;
      case 'inc': this.set(name, (typeof cur === 'number' ? cur : Number(cur) || 0) + (typeof value === 'number' ? value : 1)); break;
      case 'dec': this.set(name, (typeof cur === 'number' ? cur : Number(cur) || 0) - (typeof value === 'number' ? value : 1)); break;
      case 'toggle': this.set(name, !(cur === true || (typeof cur === 'number' && cur !== 0) || (typeof cur === 'string' && cur !== '' && cur !== 'false'))); break;
    }
  }

  /** Back to the page's declared starting values (Play again / next visit). Listeners are not fired. */
  reset(initial: Record<string, Scalar> = this.initial) { this.initial = initial; this.m = new Map(Object.entries(initial)); }

  subscribe(fn: VarListener): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
}
