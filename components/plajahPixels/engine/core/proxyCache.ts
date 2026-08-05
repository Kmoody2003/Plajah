// proxyCache.ts — persistent OPFS cache + idle-gated queue for video proxies.
//
// Flow: ensureProxy(originalUrl, onReady)
//   1. fetch the source bytes once
//   2. content-hash them (stable across sessions, unlike blob: URLs)
//   3. OPFS hit  → hand back a proxy object-URL immediately
//      OPFS miss → queue a transcode (only while idle + not recording),
//                  persist the result to OPFS, then hand it back
// Everything is best-effort: any failure just leaves the caller on the original.

import { transcodeToProxy } from './proxyTranscoder';

const DIR = 'plajah-pixels-proxies';
const FILE_CAP = 200; // soft cap on stored proxies to bound OPFS growth

// originalUrl → resolved proxy object-URL (this session)
const resolved = new Map<string, string>();
// originalUrl → in-flight promise (single-flight per url)
const inflight = new Map<string, Promise<string | null>>();

let recording = false;
/** The studio calls this so background transcodes pause during recording. */
export function setRecording(on: boolean) { recording = on; }

async function opfsDir(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const root = await (navigator.storage as any)?.getDirectory?.();
    if (!root) return null;
    return await root.getDirectoryHandle(DIR, { create: true });
  } catch { return null; }
}

async function hashBytes(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

async function readCached(dir: FileSystemDirectoryHandle, name: string): Promise<string | null> {
  try {
    const fh = await dir.getFileHandle(name);
    const file = await fh.getFile();
    if (file.size < 1024) return null;
    return URL.createObjectURL(file);
  } catch { return null; }
}

async function writeCached(dir: FileSystemDirectoryHandle, name: string, blob: Blob): Promise<void> {
  try {
    const fh = await dir.getFileHandle(name, { create: true });
    const ws = await (fh as any).createWritable();
    await ws.write(blob); await ws.close();
    void evictIfNeeded(dir, name);
  } catch { /* OPFS write unavailable — in-session memo still applies */ }
}

async function evictIfNeeded(dir: FileSystemDirectoryHandle, keep: string): Promise<void> {
  try {
    const names: string[] = [];
    for await (const [n] of (dir as any).entries()) names.push(n);
    if (names.length <= FILE_CAP) return;
    let toRemove = names.length - FILE_CAP;
    for (const n of names) {
      if (toRemove <= 0) break;
      if (n === keep) continue;
      try { await (dir as any).removeEntry(n); toRemove--; } catch { /* */ }
    }
  } catch { /* */ }
}

// ── idle gate ────────────────────────────────────────────────────────────────
function whenIdle(): Promise<void> {
  return new Promise(resolve => {
    const go = () => {
      if (recording || document.hidden) { setTimeout(go, 600); return; } // hold off during record / hidden tab
      const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void, o?: any) => number);
      if (ric) ric(() => resolve(), { timeout: 2000 });
      else setTimeout(resolve, 200);
    };
    go();
  });
}

// Sequential queue — one transcode at a time so we never fight the live render.
let chain: Promise<unknown> = Promise.resolve();
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(() => whenIdle()).then(task);
  chain = run.catch(() => {}); // keep the chain alive on failure
  return run;
}

/**
 * Ensure a playback proxy exists for `originalUrl`. Calls `onReady(proxyUrl)` once
 * (and only if) a proxy is available. Never throws; if no proxy can be made the
 * caller simply keeps using the original.
 */
export function ensureProxy(originalUrl: string, onReady: (proxyUrl: string) => void): void {
  const hit = resolved.get(originalUrl);
  if (hit) { onReady(hit); return; }
  if (inflight.has(originalUrl)) { inflight.get(originalUrl)!.then(u => { if (u) onReady(u); }); return; }

  const job = (async (): Promise<string | null> => {
    // Fetch the source bytes (blob:/data:/same-origin/CORS all work; remote no-CORS throws → skip).
    let buf: ArrayBuffer;
    try { buf = await (await fetch(originalUrl)).arrayBuffer(); }
    catch { return null; }
    if (buf.byteLength < 4096) return null; // too small to be worth proxying

    const key = await hashBytes(buf) + '.mp4';
    const dir = await opfsDir();

    // OPFS hit → done, no transcode.
    if (dir) { const cached = await readCached(dir, key); if (cached) return cached; }

    // Miss → transcode during idle, then persist.
    const proxyBlob = await enqueue(() => transcodeToProxy(new Blob([buf], { type: 'video/mp4' })));
    if (!proxyBlob) return null;
    if (dir) await writeCached(dir, key, proxyBlob);
    return URL.createObjectURL(proxyBlob);
  })();

  inflight.set(originalUrl, job);
  job.then(u => { if (u) { resolved.set(originalUrl, u); onReady(u); } })
     .finally(() => inflight.delete(originalUrl));
}
