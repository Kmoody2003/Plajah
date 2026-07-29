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
  return /failed to (fetch|load) dynamically imported module|error loading dynamically imported module|importing a module script failed|dynamically imported module|ChunkLoadError|Loading chunk [\w-]+ failed|Unable to preload (CSS|module)/i.test(String(m))
    // React.lazy manifestation of the SAME stale-chunk problem: when the dead chunk request
    // is answered with index.html (SPA rewrite) instead of JS, the imported module has no
    // default export, so React.lazy throws "Cannot read properties of undefined (reading 'default')".
    // Treat it as a stale-shell error so we bust caches + reload instead of soft-resetting into
    // the same dead chunk forever. Loop-guarded, so a genuine bug still surfaces after one try.
    || /cannot read propert(?:y|ies) of undefined \(reading ['"]default['"]\)/i.test(String(m));
}

let recovering = false;

/**
 * Recover from a stale-chunk error: unregister service workers, clear Cache Storage,
 * then hard-reload. Loop-guarded — at most one recovery per 20s window across reloads,
 * so a genuinely broken server surfaces the crash screen instead of reloading forever.
 */
export async function recoverFromStaleChunk(force = false): Promise<boolean> {
  if (recovering) return true;
  // `force` is for an explicit user tap on "Reboot Instance": a manual request must ALWAYS
  // fully bust caches + reload, even inside the 20s window, or the user stays stranded on the
  // crash screen (a soft reset just re-mounts into the same dead chunk). The auto path keeps
  // the loop-guard so a genuinely broken server surfaces the crash instead of reloading forever.
  if (!force) {
    try {
      const KEY = 'plajah_stale_recover_at';
      const last = Number(sessionStorage.getItem(KEY) || '0');
      if (Date.now() - last < 20_000) return false; // just tried — let the error show rather than loop
      sessionStorage.setItem(KEY, String(Date.now()));
    } catch { /* sessionStorage may be blocked; proceed once */ }
  }

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
