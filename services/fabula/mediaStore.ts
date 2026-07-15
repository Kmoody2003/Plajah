// mediaStore — the on-device media BYTE substrate for Fabula (Phase 1 of the engine plan).
//
// Large media + proxy bytes live in the Origin Private File System (OPFS): a real, high-performance
// browser filesystem with byte-level file access, instead of being marshalled through IndexedDB
// *values* (which balloons the IDB store and is slow for big binaries). OPFS can hold up to ~60% of
// disk and reads at NVMe speed from workers. Where OPFS is unavailable (older Safari, some private
// modes) we fall back to IndexedDB via idb-keyval, and we MIGRATE-ON-READ so existing projects (whose
// bytes are still in IDB) keep working and lazily move to OPFS the first time they're touched.
//
// Keys are the same the editor already uses ("studio:blob:<id>", "studio:proxy:<id>") so nothing else
// has to change — Fabula's stGet/stSet just delegate media/proxy keys here.

import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';

let dirPromise: Promise<FileSystemDirectoryHandle | null> | null = null;
async function mediaDir(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof navigator === 'undefined' || !(navigator as any).storage?.getDirectory) return null;
  if (!dirPromise) {
    dirPromise = (async () => {
      const root = await (navigator as any).storage.getDirectory();
      return root.getDirectoryHandle('fabula-media', { create: true });
    })().catch(() => null);
  }
  return dirPromise;
}

// OPFS filenames must be filesystem-safe; the key ("studio:blob:<id>") has colons → sanitize.
const fname = (key: string) => key.replace(/[^\w.\-]+/g, '_');

export function opfsAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as any).storage?.getDirectory;
}

/** Store bytes for a media/proxy key. OPFS first, IndexedDB fallback. */
export async function putBytes(key: string, blob: Blob): Promise<boolean> {
  const dir = await mediaDir();
  if (dir) {
    try {
      const fh = await dir.getFileHandle(fname(key), { create: true });
      const w = await (fh as any).createWritable();
      await w.write(blob);
      await w.close();
      // If a stale IDB copy exists from before the OPFS migration, drop it so we don't keep two.
      idbDel(key).catch(() => {});
      return true;
    } catch { /* OPFS write failed (quota?) → fall through to IDB */ }
  }
  try { await idbSet(key, blob); return true; } catch { return false; }
}

/** Read bytes for a media/proxy key. Checks OPFS, then IDB (migrating an IDB-only hit into OPFS). */
export async function getBytes(key: string): Promise<Blob | null> {
  const dir = await mediaDir();
  if (dir) {
    try {
      const fh = await dir.getFileHandle(fname(key));
      const f = await fh.getFile();
      if (f && f.size) return f;
    } catch { /* not in OPFS — check IDB below */ }
  }
  try {
    const v = await idbGet(key);
    if (v && (v as Blob).size) {
      // Migrate the legacy IDB copy into OPFS for next time (best-effort, non-blocking).
      if (dir) putBytes(key, v as Blob).catch(() => {});
      return v as Blob;
    }
  } catch { /* */ }
  return null;
}

export async function hasBytes(key: string): Promise<boolean> {
  const dir = await mediaDir();
  if (dir) {
    try { const fh = await dir.getFileHandle(fname(key)); const f = await fh.getFile(); if (f && f.size) return true; } catch { /* */ }
  }
  try { const v = await idbGet(key); return !!(v && (v as Blob).size); } catch { return false; }
}

export async function delBytes(key: string): Promise<void> {
  const dir = await mediaDir();
  if (dir) { try { await dir.removeEntry(fname(key)); } catch { /* */ } }
  try { await idbDel(key); } catch { /* */ }
}
