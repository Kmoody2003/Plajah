/**
 * Plajah Offline Storage Service
 *
 * Two-tier caching:
 *  - Cache API  → binary media blobs (music, video, images)
 *  - IndexedDB  → structured metadata (track lists, album info, download queue)
 *
 * Usage:
 *   cacheMediaFile(url)              — download + store a media file
 *   getCachedMedia(url)              → Blob | null
 *   removeCachedMedia(url)           — evict one file
 *   listCachedItems()               → OfflineCacheEntry[]
 *   clearAllOfflineMedia()           — nuke everything
 *   isAvailableOffline(url)         → boolean
 *   addToDownloadQueue(entry)        — queue a file for background download
 *   processDownloadQueue()           — drain the queue (call on SW fetch)
 */

const CACHE_NAME   = 'plajah-media-v1';
const DB_NAME      = 'plajah-offline';
const DB_VERSION   = 1;
const STORE_META   = 'metadata';
const STORE_QUEUE  = 'download_queue';

export interface OfflineCacheEntry {
  url:       string;
  title:     string;
  type:      'MUSIC' | 'VIDEO' | 'IMAGE' | 'PODCAST' | 'BOOK';
  artist?:   string;
  cover?:    string;
  size?:     number;    // bytes
  cachedAt:  number;    // ms timestamp
  albumId?:  string;
  trackId?:  string;
}

export interface DownloadQueueEntry {
  url:    string;
  meta:   Omit<OfflineCacheEntry, 'cachedAt' | 'size'>;
  addedAt: number;
}

// ── IndexedDB helpers ─────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'url' });
      }
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        db.createObjectStore(STORE_QUEUE, { keyPath: 'url' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function dbGet<T>(store: string, key: string): Promise<T | null> {
  return openDB().then(db => new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror   = () => reject(req.error);
  }));
}

function dbPut(store: string, value: any): Promise<void> {
  return openDB().then(db => new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).put(value);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  }));
}

function dbDelete(store: string, key: string): Promise<void> {
  return openDB().then(db => new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  }));
}

function dbGetAll<T>(store: string): Promise<T[]> {
  return openDB().then(db => new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  }));
}

// ── Cache API helpers ─────────────────────────────────────────────────────────

async function getMediaCache(): Promise<Cache | null> {
  if (typeof caches === 'undefined') return null;
  return caches.open(CACHE_NAME);
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Download a media file and store it for offline playback. Returns file size in bytes. */
export async function cacheMediaFile(
  url: string,
  meta: Omit<OfflineCacheEntry, 'cachedAt' | 'size' | 'url'>
): Promise<number> {
  const cache = await getMediaCache();
  if (!cache) throw new Error('Cache API unavailable');

  const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);

  const clone = response.clone();
  await cache.put(url, response);

  const blob = await clone.blob();
  const entry: OfflineCacheEntry = { ...meta, url, cachedAt: Date.now(), size: blob.size };
  await dbPut(STORE_META, entry);

  return blob.size;
}

/** Retrieve a cached media file as a Blob URL (or null if not cached). */
export async function getCachedMedia(url: string): Promise<string | null> {
  const cache = await getMediaCache();
  if (!cache) return null;
  const resp = await cache.match(url);
  if (!resp) return null;
  const blob = await resp.blob();
  return URL.createObjectURL(blob);
}

/** Check synchronously-ish whether a URL is available offline (metadata lookup). */
export async function isAvailableOffline(url: string): Promise<boolean> {
  const entry = await dbGet<OfflineCacheEntry>(STORE_META, url);
  return entry !== null;
}

/** Remove a single cached file and its metadata. */
export async function removeCachedMedia(url: string): Promise<void> {
  const cache = await getMediaCache();
  if (cache) await cache.delete(url);
  await dbDelete(STORE_META, url);
}

/** List all cached items with their metadata. */
export async function listCachedItems(): Promise<OfflineCacheEntry[]> {
  return dbGetAll<OfflineCacheEntry>(STORE_META);
}

/** Nuke all offline media. */
export async function clearAllOfflineMedia(): Promise<void> {
  if (typeof caches !== 'undefined') await caches.delete(CACHE_NAME);
  const db = await openDB();
  const tx = db.transaction([STORE_META, STORE_QUEUE], 'readwrite');
  tx.objectStore(STORE_META).clear();
  tx.objectStore(STORE_QUEUE).clear();
}

/** Total storage used in bytes. */
export async function getOfflineStorageUsed(): Promise<number> {
  const items = await listCachedItems();
  return items.reduce((sum, item) => sum + (item.size || 0), 0);
}

// ── Download queue ────────────────────────────────────────────────────────────

/** Add a file to the background download queue. */
export async function addToDownloadQueue(
  url: string,
  meta: Omit<OfflineCacheEntry, 'cachedAt' | 'size' | 'url'>
): Promise<void> {
  const already = await isAvailableOffline(url);
  if (already) return;
  await dbPut(STORE_QUEUE, { url, meta, addedAt: Date.now() } as DownloadQueueEntry);
}

/** Process up to `batchSize` items from the download queue. Returns count processed. */
export async function processDownloadQueue(batchSize = 3): Promise<number> {
  const queue = await dbGetAll<DownloadQueueEntry>(STORE_QUEUE);
  const batch = queue.slice(0, batchSize);
  let processed = 0;
  for (const item of batch) {
    try {
      await cacheMediaFile(item.url, item.meta);
      await dbDelete(STORE_QUEUE, item.url);
      processed++;
    } catch {
      // Leave in queue for retry
    }
  }
  return processed;
}

/** Pending download queue length. */
export async function getQueueLength(): Promise<number> {
  const q = await dbGetAll<DownloadQueueEntry>(STORE_QUEUE);
  return q.length;
}

// ── Convenience: cache a full album ──────────────────────────────────────────

export async function cacheAlbumForOffline(
  album: { id: string; title: string; artist: string; coverImage?: string },
  tracks: { id: string; title: string; url: string; artist: string }[]
): Promise<void> {
  for (const track of tracks) {
    await addToDownloadQueue(track.url, {
      title:   track.title,
      type:    'MUSIC',
      artist:  track.artist || album.artist,
      cover:   album.coverImage,
      albumId: album.id,
      trackId: track.id,
    });
  }
}
