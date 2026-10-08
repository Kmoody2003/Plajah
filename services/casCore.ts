// casCore - PURE optimistic-concurrency (compare-and-swap) loop. The server backs `CasStore` with Firestore
// REST preconditions (`currentDocument.updateTime` / `currentDocument.exists=false`), so two requests that
// read the same version cannot both write: the loser gets 'conflict', re-reads and re-decides. Tests back
// it with an in-memory store that yields on get() to simulate concurrent requests.

export interface CasDoc { data: Record<string, any>; version: string }
export interface CasStore {
  get(key: string): Promise<CasDoc | null>;
  /** Merge `patch` into the doc iff its version still equals `expectedVersion` (null = must not exist yet). */
  put(key: string, patch: Record<string, any>, expectedVersion: string | null): Promise<'ok' | 'conflict' | 'error'>;
}
export type CasDecision<T> = { patch: Record<string, any>; result: T } | { abort: true; result: T };
export type CasOutcome<T> = { ok: true; result: T } | { ok: false; reason: 'ABORT' | 'CONFLICT' | 'ERROR'; result?: T };

export async function casUpdate<T>(
  store: CasStore, key: string,
  decide: (cur: Record<string, any> | null) => Promise<CasDecision<T>> | CasDecision<T>,
  maxTries = 12,
): Promise<CasOutcome<T>> {
  for (let i = 0; i < maxTries; i++) {
    const cur = await store.get(key);
    const d = await decide(cur ? cur.data : null);
    if ('abort' in d) return { ok: false, reason: 'ABORT', result: d.result };
    const r = await store.put(key, d.patch, cur ? cur.version : null);
    if (r === 'ok') return { ok: true, result: d.result };
    if (r === 'error') return { ok: false, reason: 'ERROR' };
    // conflict: someone else wrote first -> re-read and re-decide
  }
  return { ok: false, reason: 'CONFLICT' };
}

/** In-memory CasStore for tests (and nothing else). get() yields so concurrent callers read the same version. */
export function memoryCasStore(initial: Record<string, Record<string, any>> = {}): CasStore & { docs: Map<string, { data: Record<string, any>; v: number }> } {
  const docs = new Map<string, { data: Record<string, any>; v: number }>();
  for (const [k, v] of Object.entries(initial)) docs.set(k, { data: { ...v }, v: 1 });
  return {
    docs,
    async get(key) {
      const d = docs.get(key);
      const snap = d ? { data: { ...d.data }, version: String(d.v) } : null;
      await new Promise(r => setTimeout(r, 0));
      return snap;
    },
    async put(key, patch, expected) {
      const d = docs.get(key);
      if (expected === null ? !!d : !d || String(d.v) !== expected) return 'conflict';
      docs.set(key, { data: { ...(d?.data || {}), ...patch }, v: (d?.v || 0) + 1 });
      return 'ok';
    },
  };
}
