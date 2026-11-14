// In-memory stand-in for Firestore behind routes/labels.ts, for tests and label-lab only.
import type { CasStore } from '../../services/casCore';
import type { LabelStore } from '../../routes/labels';

export function makeMemoryLabelBackend() {
  const docs = new Map<string, Record<string, any>>();
  const versions = new Map<string, number>();
  const store: LabelStore = {
    get: async path => { const d = docs.get(path); return d ? structuredClone(d) : null; },
    set: async (path, data) => { docs.set(path, structuredClone(data)); versions.set(path, (versions.get(path) || 0) + 1); return true; },
    patch: async (path, data) => { docs.set(path, { ...(docs.get(path) || {}), ...structuredClone(data) }); versions.set(path, (versions.get(path) || 0) + 1); return true; },
    del: async path => { docs.delete(path); versions.delete(path); return true; },
    query: async (collection, filters, limit) => {
      const out: { id: string; data: Record<string, any> }[] = [];
      for (const [path, data] of docs) {
        const [c, id, more] = path.split('/');
        if (c !== collection || more) continue;
        const hit = filters.every(f => (f.op === 'ARRAY_CONTAINS' ? (data[f.field] || []).includes(f.value) : data[f.field] === f.value));
        if (hit) out.push({ id, data: structuredClone(data) });
        if (out.length >= limit) break;
      }
      return out;
    },
  };
  const cas = (collection: string): CasStore => ({
    async get(key) {
      const path = `${collection}/${key}`;
      const d = docs.get(path);
      return d ? { data: structuredClone(d), version: String(versions.get(path) || 0) } : null;
    },
    async put(key, patch, expected) {
      const path = `${collection}/${key}`;
      const exists = docs.has(path);
      if (expected === null ? exists : !exists || String(versions.get(path) || 0) !== expected) return 'conflict';
      await store.patch(path, patch);
      return 'ok';
    },
  });
  return { docs, store, cas };
}
