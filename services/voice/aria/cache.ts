import type { WordMark } from './types';

/** Audio cache: sha-256 keyed, IndexedDB-backed, LRU-capped. Every call is try/catch'd; failure = cache miss. */

export interface CacheEntry { blob: Blob; marks: WordMark[]; durationMs: number }
export interface MetaRec { key: string; size: number; lastUsed: number }
export interface DataRec extends CacheEntry { key: string }

export interface CacheStore {
  getMeta(): Promise<MetaRec[]>;
  getData(key: string): Promise<DataRec | undefined>;
  put(meta: MetaRec, data: DataRec): Promise<void>;
  setMeta(meta: MetaRec): Promise<void>;
  del(key: string): Promise<void>;
}

export const DEFAULT_CAP_BYTES = 150 * 1024 * 1024;

export async function hashKey(provider: string, voice: string, speed: number, text: string): Promise<string> {
  const input = `${provider}|${voice}|${speed}|${text}`;
  try {
    const subtle = (globalThis as any).crypto?.subtle;
    if (subtle) {
      const buf = await subtle.digest('SHA-256', new TextEncoder().encode(input));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch { /* fall through */ }
  let h1 = 0x811c9dc5, h2 = 0x1b873593;                                   // non-crypto fallback, still stable
  for (let i = 0; i < input.length; i++) { const c = input.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 + c, 2246822519) ^ (h2 >>> 13); }
  return 'f' + (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

export function createMemoryStore(): CacheStore {
  const meta = new Map<string, MetaRec>();
  const data = new Map<string, DataRec>();
  return {
    async getMeta() { return [...meta.values()]; },
    async getData(k) { return data.get(k); },
    async put(m, d) { meta.set(m.key, m); data.set(m.key, d); },
    async setMeta(m) { if (meta.has(m.key)) meta.set(m.key, m); },
    async del(k) { meta.delete(k); data.delete(k); },
  };
}

const DB = 'aria-voice-cache';
const req = <T>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

/** IndexedDB store (two object stores so LRU bookkeeping never loads audio blobs). Null when IDB is unavailable. */
export function createIdbStore(): CacheStore | null {
  const idb: IDBFactory | undefined = (globalThis as any).indexedDB;
  if (!idb) return null;
  let dbp: Promise<IDBDatabase> | null = null;
  const open = () => dbp ??= new Promise<IDBDatabase>((res, rej) => {
    const r = idb.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('meta', { keyPath: 'key' }); r.result.createObjectStore('data', { keyPath: 'key' }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('idb blocked'));
  }).catch(e => { dbp = null; throw e; });
  const store = async (name: 'meta' | 'data', mode: IDBTransactionMode) => (await open()).transaction(name, mode).objectStore(name);
  return {
    async getMeta() { return (await req((await store('meta', 'readonly')).getAll())) as MetaRec[]; },
    async getData(k) { return (await req((await store('data', 'readonly')).get(k))) as DataRec | undefined; },
    async put(m, d) { await req((await store('data', 'readwrite')).put(d)); await req((await store('meta', 'readwrite')).put(m)); },
    async setMeta(m) { await req((await store('meta', 'readwrite')).put(m)); },
    async del(k) { await req((await store('data', 'readwrite')).delete(k)); await req((await store('meta', 'readwrite')).delete(k)); },
  };
}

export class AudioCache {
  private chain: Promise<unknown> = Promise.resolve();
  constructor(private store: CacheStore, private capBytes = DEFAULT_CAP_BYTES, private now: () => number = Date.now) {}

  key = hashKey;

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.chain.then(fn, fn);
    this.chain = p.catch(() => undefined);
    return p;
  }

  get(key: string): Promise<CacheEntry | null> {
    return this.serial(async () => {
      try {
        const d = await this.store.getData(key);
        if (!d?.blob) return null;
        await this.store.setMeta({ key, size: d.blob.size, lastUsed: this.now() });
        return { blob: d.blob, marks: d.marks ?? [], durationMs: d.durationMs ?? 0 };
      } catch { return null; }
    });
  }

  put(key: string, entry: CacheEntry): Promise<void> {
    return this.serial(async () => {
      try {
        const size = entry.blob.size;
        if (size > this.capBytes) return;
        await this.store.put({ key, size, lastUsed: this.now() }, { key, ...entry });
        const metas = (await this.store.getMeta()).sort((a, b) => a.lastUsed - b.lastUsed);
        let total = metas.reduce((a, m) => a + m.size, 0);
        for (const m of metas) {
          if (total <= this.capBytes) break;
          if (m.key === key) continue;
          await this.store.del(m.key);
          total -= m.size;
        }
      } catch { /* cache is best-effort */ }
    });
  }

  async totalBytes(): Promise<number> { try { return (await this.store.getMeta()).reduce((a, m) => a + m.size, 0); } catch { return 0; } }
}

/** Default cache: IndexedDB, else a small in-memory one. */
export function createDefaultCache(): AudioCache {
  let store: CacheStore | null = null;
  try { store = createIdbStore(); } catch { store = null; }
  return store ? new AudioCache(store) : new AudioCache(createMemoryStore(), 20 * 1024 * 1024);
}
