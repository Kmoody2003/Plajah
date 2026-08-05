type CacheRecord<T> = {
  expiresAt: number;
  data: T;
};

const memoryCache = new Map<string, CacheRecord<unknown>>();

const now = () => Date.now();

export function getCachedValue<T>(key: string, ttlMs: number): T | null {
  const mem = memoryCache.get(key) as CacheRecord<T> | undefined;
  if (mem && mem.expiresAt > now()) return mem.data;

  try {
    const raw = sessionStorage.getItem(`plajah-cache:${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheRecord<T>;
    if (parsed.expiresAt <= now()) {
      sessionStorage.removeItem(`plajah-cache:${key}`);
      return null;
    }
    memoryCache.set(key, parsed);
    return parsed.data;
  } catch {
    return null;
  }
}

export function setCachedValue<T>(key: string, data: T, ttlMs: number): T {
  const record: CacheRecord<T> = { data, expiresAt: now() + ttlMs };
  memoryCache.set(key, record);
  try {
    sessionStorage.setItem(`plajah-cache:${key}`, JSON.stringify(record));
  } catch {}
  return data;
}

export async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const hit = getCachedValue<T>(key, ttlMs);
  if (hit !== null) return hit;
  return setCachedValue(key, await loader(), ttlMs);
}

export function warmImage(url?: string | null): void {
  if (!url || typeof Image === 'undefined') return;
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
}

export function warmImages(urls: Array<string | null | undefined>, limit = 12): void {
  urls.filter(Boolean).slice(0, limit).forEach(url => warmImage(url));
}
