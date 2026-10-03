// In-memory PhiDb — for tests only. Behaves like the real database where the logic depends on it:
// atomic batches, create-only/update-only preconditions, server timestamps, equality/range queries,
// and the optimistic-concurrency check the Firestore rules apply to records (`rev` must go up by one).
import type { Filter, PhiDb, PhiDoc, WriteOp } from './phiPort';
import { PhiError } from './types';

const SERVER_TIME = { __serverTime: true } as const;
const isSentinel = (v: unknown) => !!v && typeof v === 'object' && (v as any).__serverTime === true;

export class MemoryPhiDb implements PhiDb {
  private docs = new Map<string, Record<string, any>>();
  private clock = 1_700_000_000_000;
  /** Test hook: reject a commit (e.g. to prove a failed batch leaves nothing behind). */
  failNextCommit: Error | null = null;
  readonly commits: WriteOp[][] = [];

  serverNow() { return SERVER_TIME; }
  private tick() { return (this.clock += 1000); }

  async get(path: string) { const d = this.docs.get(path); return d ? structuredClone(d) : null; }

  async query(collection: string, filters: Filter[], opts: { orderBy?: string; desc?: boolean; limit?: number } = {}): Promise<PhiDoc[]> {
    const prefix = collection + '/';
    let out: PhiDoc[] = [];
    for (const [path, data] of this.docs) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      if (rest.includes('/')) continue;
      const ok = filters.every(([f, op, v]) => {
        const x = data[f];
        if (op === '==') return x === v;
        if (op === 'in') return Array.isArray(v) && v.includes(x);
        if (x === undefined) return false;
        return op === '>=' ? x >= (v as any) : x <= (v as any);
      });
      if (ok) out.push({ id: rest, data: structuredClone(data) });
    }
    if (opts.orderBy) { const f = opts.orderBy, dir = opts.desc ? -1 : 1; out.sort((a, b) => (a.data[f] > b.data[f] ? dir : a.data[f] < b.data[f] ? -dir : 0)); }
    if (opts.limit) out = out.slice(0, opts.limit);
    return out;
  }

  async commit(ops: WriteOp[]): Promise<void> {
    this.commits.push(structuredClone(ops));
    if (this.failNextCommit) { const e = this.failNextCommit; this.failNextCommit = null; throw e; }
    const staged = new Map(this.docs);
    const now = this.tick();
    const stamp = (v: any): any => {
      if (isSentinel(v)) return now;
      if (Array.isArray(v)) return v.map(stamp);
      if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, stamp(x)]));
      return v;
    };
    for (const op of ops) {
      const exists = staged.has(op.path);
      if (op.op === 'create') {
        if (exists) throw new PhiError('conflict', `already exists: ${op.path}`);
        staged.set(op.path, stamp(structuredClone(op.data)));
      } else if (op.op === 'set') {
        staged.set(op.path, stamp(structuredClone(op.data)));
      } else if (op.op === 'update') {
        if (!exists) throw new PhiError('not-found', `missing: ${op.path}`);
        const cur = staged.get(op.path)!;
        const next = { ...cur, ...stamp(structuredClone(op.data)) };
        // The rule on records: a write must be exactly one revision ahead of what is stored.
        if (/\/records\/[^/]+$/.test(op.path) && next.rev !== cur.rev + 1) throw new PhiError('conflict', 'stale revision');
        staged.set(op.path, next);
      } else {
        staged.delete(op.path);
      }
    }
    this.docs = staged;
  }

  /** Test helper: everything stored, raw. */
  dump(): Record<string, Record<string, any>> { return Object.fromEntries([...this.docs].map(([k, v]) => [k, structuredClone(v)])); }
  /** Test helper: overwrite a stored doc directly (simulates a hostile or buggy writer). */
  poke(path: string, patch: Record<string, any>) { this.docs.set(path, { ...(this.docs.get(path) || {}), ...patch }); }
}
