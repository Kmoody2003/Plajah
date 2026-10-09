/**
 * Council storage: a Firestore REST implementation (production, service-account auth) and an in-memory
 * implementation (tests). Server-only. Every write is passed through clean() so undefined never reaches
 * Firestore.
 */
import { clean, type CouncilStore, type QueryFilter, type QuerySpec, type StoredDoc } from './types';

// ── Firestore value converters (deep) ────────────────────────────────────────
function fsToJs(v: any): any {
  if (v == null) return undefined;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return Number(v.doubleValue);
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.nullValue !== undefined) return null;
  if (v.timestampValue !== undefined) return v.timestampValue; // ISO string — use toMs()
  if (v.referenceValue !== undefined) return v.referenceValue;
  if (v.arrayValue !== undefined) return (v.arrayValue.values || []).map(fsToJs);
  if (v.mapValue !== undefined) {
    const out: Record<string, any> = {};
    for (const [k, mv] of Object.entries(v.mapValue.fields || {})) out[k] = fsToJs(mv);
    return out;
  }
  return undefined;
}
function jsToFs(x: any): any {
  if (x === null || x === undefined) return { nullValue: null };
  if (x instanceof Date) return { timestampValue: x.toISOString() };
  if (typeof x === 'string') return { stringValue: x };
  if (typeof x === 'boolean') return { booleanValue: x };
  if (typeof x === 'number') return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(jsToFs) } };
  if (typeof x === 'object') {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(x)) if (v !== undefined) fields[k] = jsToFs(v);
    return { mapValue: { fields } };
  }
  return { stringValue: String(x) };
}

/** Any timestamp-ish value → epoch ms (number ms, ISO string, Firestore {seconds}). 0 when unknown. */
export function toMs(v: unknown): number {
  if (typeof v === 'number') return v > 1e12 ? v : v > 1e9 ? v * 1000 : v; // tolerate seconds
  if (typeof v === 'string') { const t = Date.parse(v); return Number.isFinite(t) ? t : 0; }
  if (v instanceof Date) return v.getTime();
  if (v && typeof v === 'object' && 'seconds' in (v as any)) return Number((v as any).seconds) * 1000;
  return 0;
}

const OPS: Record<string, string> = { '==': 'EQUAL', '>=': 'GREATER_THAN_OR_EQUAL', '<=': 'LESS_THAN_OR_EQUAL', '>': 'GREATER_THAN', '<': 'LESS_THAN', in: 'IN' };

function buildWhere(where: QueryFilter[] | undefined): any {
  if (!where?.length) return undefined;
  const filters = where.map(f => ({ fieldFilter: { field: { fieldPath: f.field }, op: OPS[f.op], value: jsToFs(f.value) } }));
  return filters.length === 1 ? filters[0] : { compositeFilter: { op: 'AND', filters } };
}

export interface RestStoreOptions {
  getAccessToken: () => Promise<string | null>;
  projectId?: string;
  databaseId?: string;
  fetchImpl?: typeof fetch;
}

export function createFirestoreRestStore(opts: RestStoreOptions): CouncilStore {
  const projectId = opts.projectId || 'gen-lang-client-0665118474';
  const dbId = opts.databaseId || 'plajah-prod';
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents`;
  const f = opts.fetchImpl || fetch;
  const headers = async (): Promise<Record<string, string>> => {
    const t = await opts.getAccessToken();
    return t ? { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` } : { 'Content-Type': 'application/json' };
  };
  const enc = encodeURIComponent;
  const timeout = () => AbortSignal.timeout(15_000);

  return {
    async ready() { return !!(await opts.getAccessToken()); },

    async get(collection, id) {
      try {
        const res = await f(`${base}/${collection}/${enc(id)}`, { headers: await headers(), signal: timeout() });
        if (!res.ok) return null;
        const json: any = await res.json();
        const out: Record<string, any> = {};
        for (const [k, v] of Object.entries(json.fields || {})) out[k] = fsToJs(v);
        return out;
      } catch { return null; }
    },

    async patch(collection, id, data) {
      const cleaned = clean(data) as Record<string, unknown>;
      const keys = Object.keys(cleaned);
      if (!keys.length) return true;
      const mask = keys.map(k => `updateMask.fieldPaths=${enc(k)}`).join('&');
      const fields: Record<string, any> = {};
      for (const [k, v] of Object.entries(cleaned)) fields[k] = jsToFs(v);
      try {
        const res = await f(`${base}/${collection}/${enc(id)}?${mask}`, { method: 'PATCH', headers: await headers(), body: JSON.stringify({ fields }), signal: timeout() });
        if (!res.ok) console.error(`[security-council] patch ${collection}/${id} HTTP ${res.status}`);
        return res.ok;
      } catch (e: any) { console.error(`[security-council] patch ${collection}/${id} threw`, e?.message); return false; }
    },

    async createOnce(collection, id, data) {
      const cleaned = clean(data) as Record<string, unknown>;
      const fields: Record<string, any> = {};
      for (const [k, v] of Object.entries(cleaned)) fields[k] = jsToFs(v);
      try {
        const res = await f(`${base}/${collection}?documentId=${enc(id)}`, { method: 'POST', headers: await headers(), body: JSON.stringify({ fields }), signal: timeout() });
        if (res.ok) return 'created';
        if (res.status === 409) return 'exists';
        console.error(`[security-council] createOnce ${collection}/${id} HTTP ${res.status}`);
        return 'error';
      } catch { return 'error'; }
    },

    async query(collection, spec: QuerySpec): Promise<StoredDoc[]> {
      const structuredQuery: any = { from: [{ collectionId: collection }] };
      const where = buildWhere(spec.where);
      if (where) structuredQuery.where = where;
      if (spec.orderBy) structuredQuery.orderBy = [{ field: { fieldPath: spec.orderBy.field }, direction: spec.orderBy.dir === 'asc' ? 'ASCENDING' : 'DESCENDING' }];
      structuredQuery.limit = Math.max(1, Math.min(spec.limit ?? 500, 5000));
      if (spec.select?.length) structuredQuery.select = { fields: spec.select.map(fieldPath => ({ fieldPath })) };
      try {
        const res = await f(`${base}:runQuery`, { method: 'POST', headers: await headers(), body: JSON.stringify({ structuredQuery }), signal: timeout() });
        if (!res.ok) {
          console.warn(`[security-council] query ${collection} HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
          return [];
        }
        const rows: any[] = await res.json();
        const out: StoredDoc[] = [];
        for (const r of rows) {
          if (!r.document) continue;
          const data: Record<string, any> = {};
          for (const [k, v] of Object.entries(r.document.fields || {})) data[k] = fsToJs(v);
          out.push({ id: String(r.document.name).split('/').pop() || '', data });
        }
        return out;
      } catch (e: any) { console.warn(`[security-council] query ${collection} threw`, e?.message); return []; }
    },

    async count(collection, whereList) {
      const structuredQuery: any = { from: [{ collectionId: collection }] };
      const where = buildWhere(whereList);
      if (where) structuredQuery.where = where;
      try {
        const res = await f(`${base}:runAggregationQuery`, {
          method: 'POST', headers: await headers(), signal: timeout(),
          body: JSON.stringify({ structuredAggregationQuery: { structuredQuery, aggregations: [{ alias: 'n', count: {} }] } }),
        });
        if (!res.ok) return null;
        const rows: any[] = await res.json();
        const v = rows?.[0]?.result?.aggregateFields?.n;
        return v ? Number(v.integerValue ?? 0) : 0;
      } catch { return null; }
    },
  };
}

// ── In-memory store (tests / local dry runs) ─────────────────────────────────
const cmp = (a: unknown): number | string => {
  if (a instanceof Date) return a.getTime();
  if (typeof a === 'number') return a;
  return String(a);
};
/** Firestore range filters only match values of the same type — mimic that so tests catch it. */
const sameKind = (a: unknown, b: unknown) => (b instanceof Date ? typeof a === 'string' || a instanceof Date : typeof a === typeof b);
function matches(doc: Record<string, any>, f: QueryFilter): boolean {
  const v = doc[f.field];
  if (v === undefined) return false;
  if (f.op === '==') return v === f.value;
  if (f.op === 'in') return Array.isArray(f.value) && f.value.includes(v);
  if (!sameKind(v, f.value)) return false;
  const a = f.value instanceof Date ? toMs(v) : cmp(v);
  const b = cmp(f.value);
  if (f.op === '>=') return a >= b;
  if (f.op === '<=') return a <= b;
  if (f.op === '>') return a > b;
  return a < b;
}

export function createMemoryStore(seed: Record<string, Record<string, Record<string, any>>> = {}): CouncilStore & { dump(): Record<string, Record<string, Record<string, any>>> } {
  const db: Record<string, Record<string, Record<string, any>>> = JSON.parse(JSON.stringify(seed));
  const col = (c: string) => (db[c] ||= {});
  return {
    dump: () => db,
    async ready() { return true; },
    async get(c, id) { const d = col(c)[id]; return d ? JSON.parse(JSON.stringify(d)) : null; },
    async patch(c, id, data) { col(c)[id] = { ...(col(c)[id] || {}), ...(clean(data) as object) }; return true; },
    async createOnce(c, id, data) { if (col(c)[id]) return 'exists'; col(c)[id] = clean(data) as Record<string, any>; return 'created'; },
    async query(c, spec) {
      let rows = Object.entries(col(c)).map(([id, data]) => ({ id, data }));
      for (const f of spec.where || []) rows = rows.filter(r => matches(r.data, f));
      if (spec.orderBy) {
        const { field, dir } = spec.orderBy;
        rows = rows.filter(r => r.data[field] !== undefined);
        rows.sort((x, y) => { const a = cmp(x.data[field]), b = cmp(y.data[field]); return (a < b ? -1 : a > b ? 1 : 0) * (dir === 'asc' ? 1 : -1); });
      }
      rows = rows.slice(0, spec.limit ?? 500);
      if (spec.select?.length) rows = rows.map(r => ({ id: r.id, data: Object.fromEntries(spec.select!.filter(k => k in r.data).map(k => [k, r.data[k]])) }));
      return JSON.parse(JSON.stringify(rows));
    },
    async count(c, where) { return (await this.query(c, { where, limit: 1e9 })).length; },
  };
}
