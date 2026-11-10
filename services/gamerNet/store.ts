// Storage the gamer network needs, kept behind an interface so the router runs against Firestore REST
// in production (server.ts wires restCas + firebaseAdminRest) and against memory in tests.

import { memoryCasStore, type CasStore } from '../casCore';

export type Filter = { field: string; value: string | number | boolean; op?: 'EQUAL' | 'LESS_THAN_OR_EQUAL' };

export interface GamerStore {
  cas(collection: string): CasStore;
  get(collection: string, id: string): Promise<Record<string, any> | null>;
  createOnce(collection: string, id: string, data: Record<string, unknown>): Promise<'created' | 'exists' | 'error'>;
  query(collection: string, filters: Filter[], limit: number, orderBy?: { field: string; direction: 'ASCENDING' | 'DESCENDING' }): Promise<Array<{ id: string; data: Record<string, any> }>>;
  del(collection: string, id: string): Promise<boolean>;
}

const pathGet = (o: Record<string, any>, p: string) => p.split('.').reduce<any>((a, k) => (a == null ? a : a[k]), o);

/** In-memory store for tests and the local lab. */
export function memoryGamerStore(): GamerStore & { dump(collection: string): Record<string, Record<string, any>> } {
  const cols = new Map<string, ReturnType<typeof memoryCasStore>>();
  const col = (c: string) => { let s = cols.get(c); if (!s) { s = memoryCasStore(); cols.set(c, s); } return s; };
  return {
    cas: col,
    async get(c, id) { const d = col(c).docs.get(id); return d ? { ...d.data } : null; },
    async createOnce(c, id, data) { const s = col(c); if (s.docs.has(id)) return 'exists'; s.docs.set(id, { data: { ...data }, v: 1 }); return 'created'; },
    async query(c, filters, limit, orderBy) {
      let rows = [...col(c).docs.entries()].map(([id, d]) => ({ id, data: { ...d.data } }));
      rows = rows.filter(r => filters.every(f => {
        const v = pathGet(r.data, f.field);
        return f.op === 'LESS_THAN_OR_EQUAL' ? typeof v === typeof f.value && v <= f.value : v === f.value;
      }));
      if (orderBy) rows.sort((a, b) => { const x = pathGet(a.data, orderBy.field), y = pathGet(b.data, orderBy.field); return (x < y ? -1 : x > y ? 1 : 0) * (orderBy.direction === 'ASCENDING' ? 1 : -1); });
      return rows.slice(0, limit);
    },
    async del(c, id) { return col(c).docs.delete(id); },
    dump(c) { return Object.fromEntries([...col(c).docs.entries()].map(([k, v]) => [k, v.data])); },
  };
}
