/**
 * Firestore (REST) sink for the living-knowledge job. Server-side only: it needs an OAuth access
 * token (see getGoogleAccessToken in server.ts). No firebase SDK, so it runs anywhere with fetch.
 *
 *   knowledge_items/{id}      upserted (public records; the browser reads these)
 *   knowledge_impacts/{id}    INSERT-IF-ABSENT, so a reviewer's decision is never overwritten
 *   knowledge_state/c_<hash>  one cursor per watch target { key, v }
 * Firestore rejects undefined fields, so toValue drops them.
 */
import type { Impact, KnowledgeItem, KnowledgeSink } from './types';
import { hash } from './http';

type FsValue = Record<string, any>;
export function toValue(v: any): FsValue | undefined {
  if (v === undefined) return undefined;
  if (v === null) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue).filter(Boolean) as FsValue[] } };
  if (typeof v === 'object') return { mapValue: { fields: toFields(v) } };
  return undefined;
}
export function toFields(o: Record<string, any>): Record<string, FsValue> {
  const out: Record<string, FsValue> = {};
  for (const [k, v] of Object.entries(o)) { const x = toValue(v); if (x) out[k] = x; }
  return out;
}

export function firestoreRestSink(project: string, database: string, getToken: () => Promise<string | null>): KnowledgeSink {
  const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/${database}/documents`;
  const rootName = `projects/${project}/databases/${database}/documents`;
  let cursors: Map<string, string> | null = null;

  const call = async (url: string, body?: any, method = body ? 'POST' : 'GET') => {
    const token = await getToken(); if (!token) throw new Error('no Google access token (GOOGLE_SERVICE_ACCOUNT_JSON not configured)');
    const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) throw new Error(`firestore ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json() as Promise<any>;
  };
  const commit = async (writes: any[]) => { for (let i = 0; i < writes.length; i += 300) await call(`${base}:commit`, { writes: writes.slice(i, i + 300) }); };

  const loadCursors = async () => {
    cursors = new Map(); let page = '';
    do {
      const r = await call(`${base}/knowledge_state?pageSize=300${page ? `&pageToken=${page}` : ''}`);
      for (const d of r.documents || []) { const f = d.fields || {}; if (f.key?.stringValue && f.v?.stringValue) cursors.set(f.key.stringValue, f.v.stringValue); }
      page = r.nextPageToken || '';
    } while (page);
  };

  return {
    async getCursor(key) { if (!cursors) await loadCursors(); return cursors!.get(key); },
    async setCursor(key, v) {
      cursors?.set(key, v);
      await commit([{ update: { name: `${rootName}/knowledge_state/c_${hash(key)}`, fields: toFields({ key, v, updatedAt: Date.now() }) } }]);
    },
    async putItems(items: KnowledgeItem[]) {
      await commit(items.map(it => ({ update: { name: `${rootName}/knowledge_items/${it.id}`, fields: toFields(it as any) } })));
    },
    async putImpacts(impacts: Impact[]) {
      const fresh: Impact[] = [];
      for (let i = 0; i < impacts.length; i += 100) {
        const chunk = impacts.slice(i, i + 100);
        const r: any[] = await call(`${base}:batchGet`, { documents: chunk.map(x => `${rootName}/knowledge_impacts/${x.id}`), mask: { fieldPaths: ['state'] } });
        const existing = new Set(r.filter(x => x.found).map(x => String(x.found.name).split('/').pop()));
        fresh.push(...chunk.filter(x => !existing.has(x.id)));
      }
      if (fresh.length) await commit(fresh.map(x => ({ update: { name: `${rootName}/knowledge_impacts/${x.id}`, fields: toFields(x as any) } })));
    },
  };
}
