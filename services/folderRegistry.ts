// folderRegistry — the ONE list of local folders the user has added, shared by every file
// viewer (Ambo, Fabula, Pixels, TV Studio, Melos, Photos, My Library ...).
//
// Before this each app kept its own list (or none): a folder added in Ambo was unknown to
// Fabula, and several pickers forgot their folder on reload. Now any picker that adds a folder
// calls addFolder(), and every viewer lists savedFolders() — so a folder is added once and is
// there everywhere, every time the app opens.
//
// Two kinds of folder, the same two mediaFolders already handles:
//   'windows' — a real path, read through the Plajah Windows app bridge
//   'handle'  — a browser FileSystemDirectoryHandle (Chrome/Edge), kept in IndexedDB under the
//               same key mediaFolders uses, so Ambo's existing handles keep working
// The list itself lives in localStorage (it survives restarts of the browser and the WebView2
// app alike); handles can't be serialised there, so they stay in IndexedDB.

import { saveFolderHandle, loadFolderHandle, deleteFolderHandle, type DirEntryLike } from './ambo/mediaFolders';

export interface SavedFolder {
  id: string;
  name: string;
  kind: 'windows' | 'handle';
  /** Windows: the absolute path. Browser: a display label. */
  path: string;
  /** Which app added it first (for display only — every app sees every folder). */
  addedFrom?: string;
  addedAt: number;
  /** Last time any viewer opened it — viewers sort by this. */
  lastUsedAt?: number;
}

const KEY = 'plajah_saved_folders';
const LEGACY_AMBO_KEY = 'ambo_pinned_folders';
const EVENT = 'plajah:folders-changed';

function read(): SavedFolder[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* fall through */ }
  return migrateLegacy();
}

/** First run: adopt the folders Ambo had already pinned (same ids, so their handles still resolve). */
function migrateLegacy(): SavedFolder[] {
  let out: SavedFolder[] = [];
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_AMBO_KEY) || '[]');
    if (Array.isArray(legacy)) {
      out = legacy
        .filter((f: any) => f && (f.kind === 'windows' || f.kind === 'handle') && f.id)
        .map((f: any) => ({ id: f.id, name: f.name || 'Folder', kind: f.kind, path: f.path || f.name, addedFrom: 'ambo', addedAt: Date.now() }));
    }
  } catch { /* nothing to migrate */ }
  write(out, false);
  return out;
}

function write(list: SavedFolder[], notify = true) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage full / blocked */ }
  if (notify && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT));
}

const samePath = (a: string, b: string) => a.replace(/[\\/]+$/, '').toLowerCase() === b.replace(/[\\/]+$/, '').toLowerCase();

/** Every saved folder, most recently used first. */
export function savedFolders(): SavedFolder[] {
  return [...read()].sort((a, b) => (b.lastUsedAt ?? b.addedAt) - (a.lastUsedAt ?? a.addedAt));
}

export function getFolder(id: string): SavedFolder | undefined {
  return read().find(f => f.id === id);
}

/**
 * Remember a Windows folder (by path). Adding a path that's already saved returns the existing
 * entry instead of a duplicate.
 */
export function addWindowsFolder(path: string, name?: string, addedFrom?: string): SavedFolder {
  const list = read();
  const existing = list.find(f => f.kind === 'windows' && samePath(f.path, path));
  if (existing) { touchFolder(existing.id); return existing; }
  const entry: SavedFolder = {
    id: `fld_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: name || path.split(/[\\/]/).filter(Boolean).pop() || 'Folder',
    kind: 'windows', path, addedFrom, addedAt: Date.now(), lastUsedAt: Date.now(),
  };
  write([...list, entry]);
  return entry;
}

/**
 * Remember a browser folder handle. A handle the registry already holds (isSameEntry) returns
 * the existing entry.
 */
export async function addHandleFolder(handle: DirEntryLike, addedFrom?: string): Promise<SavedFolder> {
  const list = read();
  for (const f of list) {
    if (f.kind !== 'handle') continue;
    const h: any = await loadFolderHandle(f.id);
    try { if (h && typeof h.isSameEntry === 'function' && await h.isSameEntry(handle)) { touchFolder(f.id); return f; } } catch { /* different origin / stale */ }
  }
  const name = (handle as any).name || 'Folder';
  const entry: SavedFolder = {
    id: `fld_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name, kind: 'handle', path: `Local Folder: ${name}`, addedFrom, addedAt: Date.now(), lastUsedAt: Date.now(),
  };
  await saveFolderHandle(entry.id, handle);
  write([...read(), entry]);
  return entry;
}

export async function removeFolder(id: string): Promise<void> {
  const list = read();
  const gone = list.find(f => f.id === id);
  write(list.filter(f => f.id !== id));
  if (gone?.kind === 'handle') await deleteFolderHandle(id);
}

export function renameFolder(id: string, name: string): void {
  write(read().map(f => (f.id === id ? { ...f, name } : f)));
}

/** Mark a folder as just used (viewers list recent folders first). Quiet: no change event. */
export function touchFolder(id: string): void {
  write(read().map(f => (f.id === id ? { ...f, lastUsedAt: Date.now() } : f)), false);
}

/** The stored handle for a browser folder (null for Windows folders or a forgotten handle). */
export function folderHandle(id: string): Promise<DirEntryLike | null> {
  return loadFolderHandle(id);
}

/** Call `fn` whenever any app adds/removes/renames a folder (also across tabs/windows). */
export function onFoldersChanged(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) fn(); };
  window.addEventListener(EVENT, fn);
  window.addEventListener('storage', onStorage);
  return () => { window.removeEventListener(EVENT, fn); window.removeEventListener('storage', onStorage); };
}
