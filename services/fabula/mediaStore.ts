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

// One browser, many accounts: each person's bytes live in their own folder and keys. Files from before this split have
// no owner, so one moves across only when an account's own project asks for it by id. Nothing lists them.
const scopeOf = async (): Promise<string> => {
  try { const { activeScopeUid } = await import('../userScope'); return activeScopeUid() || 'guest'; } catch { return 'guest'; }
};
const idbKey = (scope: string, key: string) => `plajah:u:${scope}:${key}`;

let legacyPromise: Promise<FileSystemDirectoryHandle | null> | null = null;
async function legacyDir(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof navigator === 'undefined' || !(navigator as any).storage?.getDirectory) return null;
  if (!legacyPromise) {
    legacyPromise = (async () => {
      const root = await (navigator as any).storage.getDirectory();
      return root.getDirectoryHandle('fabula-media', { create: true });
    })().catch(() => null);
  }
  return legacyPromise;
}
const dirs = new Map<string, Promise<FileSystemDirectoryHandle | null>>();
async function mediaDir(): Promise<FileSystemDirectoryHandle | null> {
  const scope = await scopeOf();
  if (!dirs.has(scope)) {
    dirs.set(scope, (async () => {
      const base = await legacyDir();
      return base ? base.getDirectoryHandle(`u_${scope.replace(/[^\w-]/g, '_')}`, { create: true }) : null;
    })().catch(() => null));
  }
  return dirs.get(scope)!;
}

// OPFS filenames must be filesystem-safe; the key ("studio:blob:<id>") has colons → sanitize.
const fname = (key: string) => key.replace(/[^\w.\-]+/g, '_');

const memStore = new Map<string, Blob>();

export function opfsAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as any).storage?.getDirectory;
}

/** Store bytes for a media/proxy key. OPFS first, IndexedDB fallback, in-memory resilient fallback. */
export async function putBytes(key: string, blob: Blob): Promise<boolean> {
  const dir = await mediaDir();
  if (dir) {
    try {
      const fh = await dir.getFileHandle(fname(key), { create: true });
      const w = await (fh as any).createWritable();
      await w.write(blob);
      await w.close();
      // If a stale IDB copy exists from before the OPFS migration, drop it so we don't keep two.
      idbDel(idbKey(await scopeOf(), key)).catch(() => {});
      memStore.delete(key);
      return true;
    } catch { /* OPFS write failed (quota?) → fall through to IDB */ }
  }
  try {
    await idbSet(idbKey(await scopeOf(), key), blob);
    memStore.delete(key);
    return true;
  } catch {
    memStore.set(key, blob);
    return true;
  }
}

/** Read bytes for a media/proxy key. Checks OPFS, then IDB (migrating an IDB-only hit into OPFS), then in-memory fallback. */
export async function getBytes(key: string): Promise<Blob | null> {
  const dir = await mediaDir();
  if (dir) {
    try {
      const fh = await dir.getFileHandle(fname(key));
      const f = await fh.getFile();
      if (f && f.size) return f;
    } catch { /* not in OPFS — check IDB below */ }
    // An unowned file from before the per-account split: this account's project named it, so it moves in.
    try {
      const old = await legacyDir();
      if (old) {
        const fh = await old.getFileHandle(fname(key));
        const f = await fh.getFile();
        if (f && f.size) {
          if (await putBytes(key, f)) await old.removeEntry(fname(key)).catch(() => {});
          return f;
        }
      }
    } catch { /* not there either */ }
  }
  try {
    const scope = await scopeOf();
    const v = (await idbGet(idbKey(scope, key))) ?? (await idbGet(key));
    if (v && (v as Blob).size) {
      // Move a legacy IDB copy into this account's space for next time (best-effort, non-blocking).
      putBytes(key, v as Blob).then(() => idbDel(key)).catch(() => {});
      return v as Blob;
    }
  } catch { /* */ }
  return memStore.get(key) || null;
}

export async function hasBytes(key: string): Promise<boolean> {
  const dir = await mediaDir();
  if (dir) {
    try { const fh = await dir.getFileHandle(fname(key)); const f = await fh.getFile(); if (f && f.size) return true; } catch { /* */ }
    try { const old = await legacyDir(); if (old) { const f = await (await old.getFileHandle(fname(key))).getFile(); if (f && f.size) return true; } } catch { /* */ }
  }
  try { const v = (await idbGet(idbKey(await scopeOf(), key))) ?? (await idbGet(key)); return !!(v && (v as Blob).size); } catch { return memStore.has(key); }
}

export async function delBytes(key: string): Promise<void> {
  memStore.delete(key);
  const dir = await mediaDir();
  if (dir) { try { await dir.removeEntry(fname(key)); } catch { /* */ } }
  try { const old = await legacyDir(); if (old) await old.removeEntry(fname(key)); } catch { /* */ }
  try { await idbDel(idbKey(await scopeOf(), key)); await idbDel(key); } catch { /* */ }
}
