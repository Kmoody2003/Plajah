// prefetch — pull UPCOMING timeline clips' bytes onto the device (OPFS studio:blob:<id>) ahead of the
// playhead, so resolveMediaSource finds them LOCAL by the time they play. This is the byte-level warm
// cache that replaces the old hidden-<video> warmers: those allocated hardware video decoders (there is
// a global cap — see decoderBudget.ts) and competed with the live monitor without ever handing it a
// decoded frame. Fetching bytes uses zero decoders, persists across passes, and turns a cloud clip into
// a local one after its first pull — which is exactly why "buffering" only shows on cloud clips and why
// the second playback is clean. Sequential + size-capped so it never saturates a lossy link.
import { hasBytes, putBytes } from './mediaStore';

const isHttp = (u: string) => /^https?:/i.test(u || '');
const needsCors = (u: string) => isHttp(u) && typeof location !== 'undefined' && !u.startsWith(location.origin);
// Per-asset ceiling. Above this a clip should ride a lightweight proxy, not a full local copy, so we
// skip it here rather than blow up OPFS or hog the link pulling a 4K master over a bad connection.
const MAX_PREFETCH_BYTES = 700 * 1024 * 1024;

interface Item { id: string; url: string }
let queue: Item[] = [];
let running = false;
let current: AbortController | null = null;
const done = new Set<string>();      // pulled OR permanently skipped (too big) this session
const inflight = new Set<string>();
const listeners = new Set<(id: string) => void>();

async function readCapped(res: Response): Promise<Blob> {
  if (!res.ok) throw new Error('http ' + res.status);
  const len = Number(res.headers.get('content-length') || 0);
  if (len && len > MAX_PREFETCH_BYTES) throw new Error('TOO_BIG');
  const blob = await res.blob();
  if (blob.size > MAX_PREFETCH_BYTES) throw new Error('TOO_BIG');
  if (!blob.size) throw new Error('empty');
  return blob;
}

async function fetchToStore(url: string, key: string, ac: AbortController): Promise<void> {
  let blob: Blob;
  try {
    const res = await fetch(url, { ...(needsCors(url) ? { mode: 'cors' as RequestMode } : {}), signal: ac.signal });
    blob = await readCapped(res);
  } catch (err: any) {
    // A cross-origin bucket with no CORS headers can't be read directly; retry once through our own
    // same-origin proxy (never recurses — the proxy URL is same-origin). Don't proxy a TOO_BIG/abort.
    if (err?.message === 'TOO_BIG' || ac.signal.aborted || !needsCors(url)) throw err;
    const res = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`, { signal: ac.signal });
    blob = await readCapped(res);
  }
  await putBytes(key, blob);
}

async function pump(): Promise<void> {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const item = queue.shift()!;
      if (done.has(item.id) || inflight.has(item.id)) continue;
      const key = 'studio:blob:' + item.id;
      try {
        if (await hasBytes(key)) { done.add(item.id); continue; }   // already local — nothing to do
        inflight.add(item.id);
        current = new AbortController();
        await fetchToStore(item.url, key, current);
        done.add(item.id);
        listeners.forEach((cb) => { try { cb(item.id); } catch { /* */ } });
      } catch (err: any) {
        // Too-big is permanent (needs a proxy); a network error is transient — leave it out of `done`
        // so a later playhead pass re-queues and retries it.
        if (err?.message === 'TOO_BIG') done.add(item.id);
      } finally { inflight.delete(item.id); current = null; }
    }
  } finally { running = false; }
}

/** Queue upcoming CLOUD assets to pull to OPFS ahead of the playhead. Already-local (blob:/cached/disk)
 *  assets should be filtered by the caller, but non-http urls are ignored here as a guard. Idempotent. */
export function prefetchAssets(list: Item[]): void {
  for (const a of list) {
    if (!a?.id || !isHttp(a.url)) continue;
    if (done.has(a.id) || inflight.has(a.id) || queue.some((q) => q.id === a.id)) continue;
    queue.push({ id: a.id, url: a.url });
  }
  void pump();
}

/** Subscribe to "an asset just became local" — the monitor uses this to upgrade a NON-playing layer
 *  from its cloud stream to the local copy without disturbing the live element. Returns unsubscribe. */
export function onPrefetched(cb: (id: string) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Drop the pending queue and abort the in-flight pull (e.g. project close / heavy edit). */
export function cancelPrefetch(): void { queue = []; try { current?.abort(); } catch { /* */ } }

export function prefetchStatus() { return { queued: queue.length, running, done: done.size, inflight: inflight.size }; }
