// Reello watch folders + folder batches.
//
// A WATCH folder keeps uploading: every new video that lands in it is uploaded with the folder's
// upload template (title, description, tags, visibility, Story Intelligence). A BATCH folder is the
// "more than 5 files" path: everything in it uploads once, in the background, then it's done.
//
// Built on the Fabula sync-folder store (services/fabula/syncFolders.ts — persisted directory
// handles + a seen-set), namespaced per account. Browsers can't push file events, so "watch" means
// a rescan every minute and on window focus while Plajah is open. A file is only taken once it has
// stopped changing (same size + mtime across two scans, or untouched for 20 s), so a video still
// being exported or copied isn't uploaded half-written.

import { get as idbGet, set as idbSet } from 'idb-keyval';
import {
  addSyncFolder, listSyncFolders, removeSyncFolder, getHandle, folderPermission, scanFolder, markSeen,
  type ScannedFile, type SyncFolder,
} from '../fabula/syncFolders';
import { isVideoFile } from './uploadPrefs';

export interface ReelloFolderMeta {
  /** true = keep watching for new files; false = a one-time batch. */
  watch: boolean;
  templateId?: string;
  paused?: boolean;
  /** A batch whose every file has uploaded. */
  done?: boolean;
  createdAt: number;
}

export interface ReelloFolder extends SyncFolder {
  meta: ReelloFolderMeta;
  permission: 'granted' | 'prompt' | 'denied' | 'missing';
}

const projectOf = (uid: string) => `reello-${uid}`;
const metaKey = (uid: string) => `reello:folderMeta:${uid}`;

export const folderPickerSupported = () => typeof window !== 'undefined' && typeof (window as any).showDirectoryPicker === 'function';

async function readMeta(uid: string): Promise<Record<string, ReelloFolderMeta>> { return (await idbGet(metaKey(uid))) || {}; }
async function writeMeta(uid: string, m: Record<string, ReelloFolderMeta>) { await idbSet(metaKey(uid), m); }

export async function listFolders(uid: string): Promise<ReelloFolder[]> {
  const [folders, meta] = await Promise.all([listSyncFolders(projectOf(uid)), readMeta(uid)]);
  return Promise.all(folders.map(async f => ({ ...f, meta: meta[f.id] || { watch: true, createdAt: f.addedAt }, permission: await folderPermission(f.id) })));
}

/** Pick a folder (user gesture). Null when the picker was dismissed. */
export async function addFolder(uid: string, meta: Omit<ReelloFolderMeta, 'createdAt'>): Promise<ReelloFolder | null> {
  const f = await addSyncFolder(projectOf(uid));
  if (!f) return null;
  const all = await readMeta(uid);
  // Re-adding a folder that was a finished batch starts it over as whatever was asked for now.
  all[f.id] = { ...meta, done: false, createdAt: all[f.id]?.createdAt || Date.now() };
  await writeMeta(uid, all);
  return { ...f, meta: all[f.id], permission: 'granted' };
}

export async function updateFolder(uid: string, id: string, p: Partial<ReelloFolderMeta>) {
  const all = await readMeta(uid);
  all[id] = { ...(all[id] || { watch: true, createdAt: Date.now() }), ...p };
  await writeMeta(uid, all);
}

export async function removeFolder(uid: string, id: string) {
  await removeSyncFolder(projectOf(uid), id);
  const all = await readMeta(uid); delete all[id]; await writeMeta(uid, all);
}

/** Re-grant read access after a restart (must be called from a click). */
export async function reconnectFolder(id: string): Promise<boolean> { return !!(await getHandle(id, true)); }

const STABLE_MS = 20_000;
const lastSeenShape = new Map<string, string>(); // folderId/path → size|mtime from the previous scan

/**
 * Video files in the folder not uploaded yet and no longer changing. Null when the folder can't be
 * read right now (permission lapsed — needs reconnectFolder from a click).
 */
export async function scanForNew(uid: string, id: string, now = Date.now()): Promise<{ ready: ScannedFile[]; settling: number; total: number } | null> {
  const handle = await getHandle(id, false);
  if (!handle) return null;
  const folders = await listSyncFolders(projectOf(uid));
  const folder = folders.find(f => f.id === id);
  if (!folder) return null;
  const seen = new Set(folder.seen || []);
  const all = (await scanFolder(handle)).filter(f => isVideoFile(f.file));
  const ready: ScannedFile[] = []; let settling = 0;
  for (const f of all) {
    if (seen.has(f.key)) continue;
    const k = `${id}/${f.path}/${f.name}`;
    const shape = `${f.file.size}|${f.file.lastModified}`;
    const stable = f.file.size > 0 && (lastSeenShape.get(k) === shape || now - f.file.lastModified > STABLE_MS);
    lastSeenShape.set(k, shape);
    if (stable) ready.push(f); else settling++;
  }
  return { ready, settling, total: all.length };
}

export const markUploaded = (uid: string, id: string, keys: string[]) => markSeen(projectOf(uid), id, keys);
