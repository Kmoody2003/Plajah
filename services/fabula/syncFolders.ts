// syncFolders — "watch folders" for a Fabula project. Persisted File System Access directory handles
// that the editor re-scans to auto-import new/changed media, mirroring the on-disk folder structure into
// the media/clip bins. Browsers can't push filesystem events, so "watch" = poll: rescan on demand, on
// window focus, and on an interval while the project is open — importing only files we haven't seen.
//
// Handles survive reloads (structured-clone into IndexedDB). Permission may need a user gesture to
// re-grant after a cold start, so rescans that require it are surfaced through the UI.

import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';

export interface SyncFolder {
  id: string;
  name: string;          // folder display name
  addedAt: number;
  lastScan: number;
  fileCount: number;     // files imported so far from this folder
  seen: string[];        // keys of files already imported (path|name|size|mtime) — the dedup set
}
export interface ScannedFile { path: string; name: string; file: File; key: string; }

const metaKey = (projectId: string) => `fabula:syncFolders:${projectId}`;
const handleKey = (id: string) => `fabula:syncHandle:${id}`;

export async function listSyncFolders(projectId: string): Promise<SyncFolder[]> {
  return (await idbGet(metaKey(projectId))) || [];
}
async function saveMeta(projectId: string, folders: SyncFolder[]) { await idbSet(metaKey(projectId), folders); }

/** Pick a directory and register it as a watch folder for the project. Returns the new folder (or null). */
export async function addSyncFolder(projectId: string): Promise<SyncFolder | null> {
  if (!(window as any).showDirectoryPicker) throw new Error('This browser can\'t watch folders — use Chrome, Edge, or Android Chrome.');
  let dir: any;
  try { dir = await (window as any).showDirectoryPicker({ id: 'fabula-sync', mode: 'read' }); }
  catch (e: any) { if (e?.name === 'AbortError') return null; throw e; }
  const id = `sf_${Date.now().toString(36)}`;
  await idbSet(handleKey(id), dir);
  const folders = await listSyncFolders(projectId);
  const folder: SyncFolder = { id, name: dir.name || 'Folder', addedAt: Date.now(), lastScan: 0, fileCount: 0, seen: [] };
  folders.push(folder); await saveMeta(projectId, folders);
  return folder;
}

export async function removeSyncFolder(projectId: string, id: string): Promise<void> {
  const folders = (await listSyncFolders(projectId)).filter((f) => f.id !== id);
  await saveMeta(projectId, folders);
  await idbDel(handleKey(id)).catch(() => {});
}

/** Get a stored directory handle, ensuring read permission (may prompt — call from a user gesture). */
export async function getHandle(id: string, interactive = false): Promise<any | null> {
  const h: any = await idbGet(handleKey(id));
  if (!h) return null;
  try {
    const q = await h.queryPermission?.({ mode: 'read' });
    if (q === 'granted') return h;
    if (interactive) { const r = await h.requestPermission?.({ mode: 'read' }); return r === 'granted' ? h : null; }
    return null; // needs a gesture to re-grant
  } catch { return h; }
}

const MEDIA_RE = /\.(mp4|mov|m4v|webm|mkv|avi|mpg|mpeg|mp3|wav|m4a|aac|flac|ogg|jpg|jpeg|png|gif|webp|avif|heic|tif|tiff|svg|ai|pdf|aep|json|lottie)$/i;

/** Recursively scan a directory handle → media files with their relative folder path (for bin mirroring). */
export async function scanFolder(handle: any, maxDepth = 8): Promise<ScannedFile[]> {
  const out: ScannedFile[] = [];
  const walk = async (h: any, rel: string, depth: number) => {
    if (depth > maxDepth) return;
    for await (const [nm, entry] of h.entries()) {
      if (entry.kind === 'file') {
        if (!MEDIA_RE.test(nm)) continue;
        try {
          const file: File = await entry.getFile();
          out.push({ path: rel, name: nm, file, key: `${rel}/${nm}|${file.size}|${file.lastModified}` });
        } catch { /* unreadable */ }
      } else if (entry.kind === 'directory') {
        await walk(entry, rel ? `${rel}/${nm}` : nm, depth + 1);
      }
    }
  };
  // Seed the relative path with the folder's own name so files at the root nest under a bin named
  // after the folder (and subfolders under it) — the pool's bin tree then mirrors the disk exactly,
  // instead of dropping top-level files into the generic "imports" bin.
  await walk(handle, handle.name || '', 0);
  return out;
}

/** Rescan a folder and return the files to import. `full` ignores the seen-set (re-import everything —
 *  the recovery path when files were counted but never actually landed in the pool). This does NOT
 *  mark anything seen: the caller commits via markSeen() only AFTER a successful import, so a failed
 *  import doesn't permanently hide files from future scans. Returns null if the handle can't be read. */
export async function rescanNew(projectId: string, id: string, interactive = false, full = false): Promise<{ folder: SyncFolder; fresh: ScannedFile[]; total: number } | null> {
  const handle = await getHandle(id, interactive);
  if (!handle) return null;
  const all = await scanFolder(handle);
  const folders = await listSyncFolders(projectId);
  const folder = folders.find((f) => f.id === id);
  if (!folder) return null;
  const seen = new Set(folder.seen || []);
  const fresh = full ? all : all.filter((f) => !seen.has(f.key));
  folder.lastScan = Date.now();
  folder.name = handle.name || folder.name;
  await saveMeta(projectId, folders);
  return { folder, fresh, total: all.length };
}

/** Mark files as imported (seen) — called by the caller AFTER importFilesToBins succeeds, so the
 *  seen-set reflects what actually made it into the pool. Updates fileCount to the seen total. */
export async function markSeen(projectId: string, id: string, keys: string[]): Promise<void> {
  if (!keys?.length) return;
  const folders = await listSyncFolders(projectId);
  const folder = folders.find((f) => f.id === id);
  if (!folder) return;
  const seen = new Set(folder.seen || []);
  keys.forEach((k) => seen.add(k));
  folder.seen = [...seen];
  folder.fileCount = folder.seen.length;
  await saveMeta(projectId, folders);
}
