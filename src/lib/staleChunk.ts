// Stale-deploy recovery.
//
// After a new deploy, Vite rehashes asset filenames. A returning visitor whose
// service worker still serves the OLD cached index.html then asks for a lazy chunk
// (e.g. PlajahPlusBanner-DLN4k7Ha.js) that the new deploy has already purged — the
// server answers with index.html (HTML), the browser expected JS, and the dynamic
// import throws "Failed to fetch dynamically imported module". A plain reload just
// gets the same stale cached shell again, so we must bust the SW + Cache Storage
// first, THEN reload so the fresh index.html + new chunk hashes load.

/** True for the family of errors that mean "the app shell is stale" (dead chunk). */
export function isChunkLoadError(err: unknown): boolean {
  const m = (err && ((err as any).message || (err as any).toString?.() || String(err))) || '';
  return /failed to (fetch|load) dynamically imported module|error loading dynamically imported module|importing a module script failed|dynamically imported module|ChunkLoadError|Loading chunk [\w-]+ failed|Unable to preload (CSS|module)/i.test(String(m));
}

let recovering = false;

/**
 * Recover from a stale-chunk error: unregister service workers, clear Cache Storage,
 * then hard-reload. Loop-guarded — at most one recovery per 20s window across reloads,
 * so a genuinely broken server surfaces the crash screen instead of reloading forever.
 */
export async function recoverFromStaleChunk(): Promise<boolean> {
  if (recovering) return true;
  try {
    const KEY = 'plajah_stale_recover_at';
    const last = Number(sessionStorage.getItem(KEY) || '0');
    if (Date.now() - last < 20_000) return false; // just tried — let the error show rather than loop
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch { /* sessionStorage may be blocked; proceed once */ }

  recovering = true;
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => {})));
    }
  } catch { /* best effort — reload regardless */ }

  window.location.reload();
  return true;
}
