// ─── Where media may be fetched from, and how much of it may be decoded ───────
//
// Two rules, both learned the hard way on the television.
//
// 1. NEVER route our own Firebase Storage through /api/proxy.
//    Firebase Hosting caps a Cloud Run response at 32 MiB. Chora masters are
//    uploaded as WAV, and a four-minute track is ~62 MiB — so the proxy returned a
//    bodiless 500 from Google Frontend (no app log, because the app never saw it)
//    and the album looked broken. Storage is CORS-open and speaks Range, so the
//    proxy was never buying us anything there: it only added a hop, an egress bill
//    and a hard ceiling.
//
// 2. NEVER whole-file decode without checking the size first.
//    decodeAudioData expands 16-bit PCM to Float32 — a 62 MiB WAV becomes ~250 MiB
//    of live heap. The TV has ~360 MiB free, so the OS killed the WebView before
//    the JS heap limit was anywhere near. To the viewer that is the app vanishing.

/** Hosts we own or that are known to serve CORS + Range correctly. */
const DIRECT_FETCH_HOSTS = [
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
];

/** Firebase Hosting's response ceiling for a Cloud Run rewrite. */
export const PROXY_MAX_BYTES = 32 * 1024 * 1024;

/**
 * Should this URL be fetched directly rather than through /api/proxy?
 * True for same-origin, for our own storage, and for hosts we know send CORS.
 */
export function shouldFetchDirect(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return true;                    // relative → same origin
  try {
    const u = new URL(url, typeof location !== 'undefined' ? location.href : undefined);
    if (typeof location !== 'undefined' && u.origin === location.origin) return true;
    return DIRECT_FETCH_HOSTS.some(h => u.hostname === h || u.hostname.endsWith('.' + h));
  } catch {
    return false;
  }
}

/** The URL to actually request: direct when we can, proxied only when we must. */
export function mediaFetchUrl(url: string): string {
  return shouldFetchDirect(url) ? url : `/api/proxy?url=${encodeURIComponent(url)}`;
}

/**
 * Roughly how much RAM this device should be willing to spend on one decoded
 * buffer. Deliberately conservative on TV, where the OOM killer is the real limit
 * and it fires long before jsHeapSizeLimit does.
 */
export function maxDecodeBytes(): number {
  const isTv = typeof navigator !== 'undefined' && /TV|BRAVIA|Tizen|Web0S|AFT/i.test(navigator.userAgent);
  const mem = (navigator as any)?.deviceMemory;                   // GiB, Chrome only
  if (isTv) return 24 * 1024 * 1024;
  if (typeof mem === 'number' && mem <= 4) return 48 * 1024 * 1024;
  return 128 * 1024 * 1024;
}

/**
 * HEAD the URL and report its size, so callers can refuse an oversized decode
 * BEFORE pulling the bytes down. Returns null when the size is unknown — callers
 * should treat that as "proceed, but you are flying blind".
 */
export async function probeContentLength(url: string, signal?: AbortSignal): Promise<number | null> {
  try {
    const res = await fetch(url, { method: 'HEAD', signal });
    const len = res.headers.get('content-length');
    return len ? Number(len) || null : null;
  } catch {
    return null;
  }
}
