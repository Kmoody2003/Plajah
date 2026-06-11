// Book content fetching with an IndexedDB cache.
//
// Why this exists: letting epub.js (or any reader library) fetch its own URL
// gives us no retry, no dedup, no caching and no error surface — a single
// failed request (rate limit, StrictMode double-mount race, flaky network)
// permanently wedges the reader with a blank page. All book bytes flow
// through here instead:
//   - in-flight dedup: concurrent requests for the same URL share one fetch
//   - retry with backoff for transient upstream failures
//   - IndexedDB cache so a book opens instantly every time after the first
//   - download progress callback for real loading UI
//   - magic-byte validation so corrupt payloads fail loudly, not blankly

const DB_NAME = 'plajah-book-cache';
const DB_VERSION = 1;
const STORE = 'content';
const MAX_CACHE_BYTES = 250 * 1024 * 1024; // ~250 MB of cached books
const FETCH_TIMEOUT_MS = 60_000;
const RETRY_DELAYS_MS = [0, 800, 2500];

interface CacheRecord {
  url: string;
  buffer: ArrayBuffer;
  size: number;
  lastAccess: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

const openDb = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'url' });
        store.createIndex('lastAccess', 'lastAccess');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
  // If opening fails (private mode, quota), don't poison future attempts.
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
};

const idbGet = async (url: string): Promise<CacheRecord | null> => {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.get(url);
      req.onsuccess = () => {
        const rec = req.result as CacheRecord | undefined;
        if (rec) {
          rec.lastAccess = Date.now();
          store.put(rec); // refresh LRU stamp
          resolve(rec);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
};

const idbPut = async (rec: CacheRecord): Promise<void> => {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(rec);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    void evictIfNeeded();
  } catch {
    /* cache is best-effort */
  }
};

const evictIfNeeded = async (): Promise<void> => {
  try {
    const db = await openDb();
    const records: Array<{ url: string; size: number; lastAccess: number }> = await new Promise((resolve) => {
      const out: Array<{ url: string; size: number; lastAccess: number }> = [];
      const tx = db.transaction(STORE, 'readonly');
      const cursorReq = tx.objectStore(STORE).openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          const v = cursor.value as CacheRecord;
          out.push({ url: v.url, size: v.size, lastAccess: v.lastAccess });
          cursor.continue();
        } else {
          resolve(out);
        }
      };
      cursorReq.onerror = () => resolve(out);
    });
    let total = records.reduce((s, r) => s + r.size, 0);
    if (total <= MAX_CACHE_BYTES) return;
    records.sort((a, b) => a.lastAccess - b.lastAccess);
    const doomed: string[] = [];
    for (const r of records) {
      if (total <= MAX_CACHE_BYTES) break;
      doomed.push(r.url);
      total -= r.size;
    }
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      doomed.forEach(url => store.delete(url));
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* best-effort */
  }
};

export const clearBookCache = async (): Promise<void> => {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* nothing to clear */
  }
};

const proxied = (url: string): string =>
  url.startsWith('http') ? `/api/proxy?url=${encodeURIComponent(url)}` : url;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const fetchWithProgress = async (
  url: string,
  onProgress?: (loaded: number, total: number | null) => void,
): Promise<ArrayBuffer> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(proxied(url), { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const total = Number(response.headers.get('content-length')) || null;
    if (!response.body || !onProgress) {
      const buf = await response.arrayBuffer();
      onProgress?.(buf.byteLength, buf.byteLength);
      return buf;
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      onProgress(loaded, total);
    }
    const out = new Uint8Array(loaded);
    let offset = 0;
    for (const c of chunks) { out.set(c, offset); offset += c.byteLength; }
    return out.buffer;
  } finally {
    clearTimeout(timer);
  }
};

const looksLikeZip = (buf: ArrayBuffer): boolean => {
  const b = new Uint8Array(buf.slice(0, 2));
  return b[0] === 0x50 && b[1] === 0x4b; // "PK"
};

const looksLikeHtmlError = (buf: ArrayBuffer): boolean => {
  // Upstream error pages arrive as small HTML bodies; real books don't.
  if (buf.byteLength > 4096) return false;
  const head = new TextDecoder().decode(buf.slice(0, 256)).trimStart().toLowerCase();
  return head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('{"error');
};

const inflight = new Map<string, Promise<ArrayBuffer>>();

export interface FetchBookOptions {
  onProgress?: (loaded: number, total: number | null) => void;
  /** Expect a zip container (EPUB). Non-zip payloads are rejected. */
  expectZip?: boolean;
  /** Bypass the cache and refetch. */
  refresh?: boolean;
}

export const fetchBookBinary = async (url: string, opts: FetchBookOptions = {}): Promise<ArrayBuffer> => {
  if (!opts.refresh) {
    const cached = await idbGet(url);
    if (cached && (!opts.expectZip || looksLikeZip(cached.buffer))) {
      opts.onProgress?.(cached.size, cached.size);
      return cached.buffer;
    }
  }

  const existing = inflight.get(url);
  if (existing) return existing;

  const job = (async () => {
    let lastErr: unknown;
    for (const delay of RETRY_DELAYS_MS) {
      if (delay) await sleep(delay);
      try {
        const buf = await fetchWithProgress(url, opts.onProgress);
        if (buf.byteLength === 0) throw new Error('Empty response');
        if (looksLikeHtmlError(buf)) throw new Error('Upstream returned an error page');
        if (opts.expectZip && !looksLikeZip(buf)) throw new Error('Not a valid EPUB (zip) payload');
        await idbPut({ url, buffer: buf, size: buf.byteLength, lastAccess: Date.now() });
        return buf;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('Download failed');
  })();

  inflight.set(url, job);
  try {
    return await job;
  } finally {
    inflight.delete(url);
  }
};

export const fetchBookText = async (url: string, opts: FetchBookOptions = {}): Promise<string> => {
  const buf = await fetchBookBinary(url, opts);
  const text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  if (!text.trim()) throw new Error('Empty text content');
  return text;
};
