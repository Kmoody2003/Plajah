// cache — where fetched font bytes live between sessions.
//
// Browser: the Cache API (keyed by the CDN URL, survives reloads, evictable by the browser).
// Node (tests, proof scripts, puppeteer setup): `.cache/text-fonts/<file>` at the repo root —
// gitignored, and the same directory the Rust integration tests read, so one download serves both.

export interface ByteCache {
  get(url: string, file: string): Promise<Uint8Array | undefined>;
  put(url: string, file: string, bytes: Uint8Array): Promise<void>;
}

const isNode = typeof process !== 'undefined' && !!process.versions?.node && typeof window === 'undefined';

async function nodeFs() {
  const spec = 'node:fs/promises';
  return import(/* @vite-ignore */ spec) as Promise<typeof import('node:fs/promises')>;
}

/** `<repo>/.cache/text-fonts`, resolved from this module's location. */
export function nodeCacheDir(): URL {
  return new URL('../../../.cache/text-fonts/', import.meta.url);
}

/** Keep google/fonts names readable (`Inter[opsz,wght].ttf`) but never path-hostile. */
const safeName = (f: string) => f.replace(/[^A-Za-z0-9._\-\[\],]/g, '_');

class NodeDiskCache implements ByteCache {
  async get(_url: string, file: string) {
    try {
      const fs = await nodeFs();
      return new Uint8Array(await fs.readFile(new URL(safeName(file), nodeCacheDir())));
    } catch { return undefined; }
  }
  async put(_url: string, file: string, bytes: Uint8Array) {
    try {
      const fs = await nodeFs();
      await fs.mkdir(nodeCacheDir(), { recursive: true });
      await fs.writeFile(new URL(safeName(file), nodeCacheDir()), bytes);
    } catch { /* read-only checkout: keep going uncached */ }
  }
}

class BrowserCache implements ByteCache {
  private name = 'plajah-text-fonts-v1';
  async get(url: string) {
    try {
      if (typeof caches === 'undefined') return undefined;
      const c = await caches.open(this.name);
      const r = await c.match(url);
      return r ? new Uint8Array(await r.arrayBuffer()) : undefined;
    } catch { return undefined; }
  }
  async put(url: string, _file: string, bytes: Uint8Array) {
    try {
      if (typeof caches === 'undefined') return;
      const c = await caches.open(this.name);
      await c.put(url, new Response(bytes.slice().buffer, { headers: { 'content-type': 'font/ttf' } }));
    } catch { /* private mode / quota: fine */ }
  }
}

class MemoryCache implements ByteCache {
  private m = new Map<string, Uint8Array>();
  async get(url: string) { return this.m.get(url); }
  async put(url: string, _f: string, b: Uint8Array) { this.m.set(url, b); }
}

export function defaultByteCache(): ByteCache {
  if (isNode) return new NodeDiskCache();
  if (typeof caches !== 'undefined') return new BrowserCache();
  return new MemoryCache();
}
