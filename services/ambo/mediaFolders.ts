// mediaFolders — custom media folders for Ambo that READ and WRITE reliably.
//
//   · Browser (Chrome/Edge): a FileSystemDirectoryHandle is persisted in IndexedDB, so the
//     folder survives a reload. Permission is re-checked on load; when the browser needs a
//     user gesture the UI shows "Reconnect" and calls ensurePermission(handle, true) on click.
//   · Windows app: folders are plain paths served through the localmedia.plajah bridge, which
//     already streams from disk and survives restarts. Writes go through the bridge's
//     SAVE_IMAGE_FILE message (it writes arbitrary bytes, collision-safe on the C# side).
//   · Anything else: honest "needs Chrome/Edge or the Windows app" — no fake data.
//
// Pure parts (name sanitising, collision-safe naming, the recursive scanner over a
// directory-like object, reorder math) are separate from the IndexedDB / bridge parts so
// tests/amboMediaFolders.test.ts can run them under node.

import { classifyFile, type MediaKindOrDoc } from './mediaLibrary';

// ── Types ───────────────────────────────────────────────────────────────────

export interface FolderMediaItem {
  /** `${folderId}:${relPath}` — stable across rescans. */
  id: string;
  name: string;
  /** Path under the folder root, forward slashes. */
  relPath: string;
  kind: MediaKindOrDoc;
  size: number;
  lastModified: number;
  /** Playable URL. Blob URLs (browser) are tracked per folder and revoked by revokeFolderUrls. */
  url?: string;
}

export interface ScanOptions {
  maxDepth?: number;   // default 6
  maxItems?: number;   // default 2000
  /** Which kinds to keep. Default: everything in the table except DOC. */
  kinds?: MediaKindOrDoc[];
  /** Called per matched file. Return a URL to attach (browser: createObjectURL). */
  makeUrl?: (file: File, relPath: string) => string | undefined;
}

export interface ScanResult {
  items: FolderMediaItem[];
  truncated: boolean;
  /** Entries that could not be read (permission, vanished file). */
  errors: string[];
}

/** The minimal slice of FileSystem Access API the scanner and writer use (fakeable in tests). */
export interface FileEntryLike { kind: 'file'; name: string; getFile(): Promise<File>; }
export interface DirEntryLike {
  kind: 'directory';
  name: string;
  values(): AsyncIterable<FileEntryLike | DirEntryLike>;
  getFileHandle?(name: string, opts?: { create?: boolean }): Promise<any>;
  getDirectoryHandle?(name: string, opts?: { create?: boolean }): Promise<DirEntryLike>;
  queryPermission?(d: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(d: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}

export type FolderPermission = 'granted' | 'prompt' | 'denied';

export class FolderPermissionError extends Error {
  constructor(message = 'Folder needs permission — click Reconnect.') { super(message); this.name = 'FolderPermissionError'; }
}

// ── Pure: names ─────────────────────────────────────────────────────────────

const RESERVED_WIN = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Make a user-supplied/dropped name safe for any filesystem. Never returns ''. */
export function sanitizeFileName(raw: string, fallback = 'file'): string {
  // eslint-disable-next-line no-control-regex
  let n = (raw || '').replace(/[\\/]+/g, '_').replace(/[<>:"|?*\u0000-\u001f]/g, '_').trim();
  n = n.replace(/[. ]+$/, '');
  if (n.startsWith('.')) n = n.replace(/^\.+/, '');
  if (n.length > 120) {
    const dot = n.lastIndexOf('.');
    const ext = dot > 0 && n.length - dot <= 10 ? n.slice(dot) : '';
    n = n.slice(0, 120 - ext.length) + ext;
  }
  const stem = n.replace(/\.[^.]*$/, '');
  if (RESERVED_WIN.test(stem)) n = `_${n}`;
  return n || fallback;
}

/**
 * Collision-safe name: "a.png" -> "a (1).png" -> "a (2).png" ... Comparison is
 * case-insensitive (Windows/macOS volumes), so "A.PNG" collides with "a.png".
 */
export function uniqueName(desired: string, existing: Iterable<string>): string {
  const taken = new Set<string>();
  for (const e of existing) taken.add(e.toLowerCase());
  const name = sanitizeFileName(desired);
  if (!taken.has(name.toLowerCase())) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 1; i < 10000; i++) {
    const cand = `${stem} (${i})${ext}`;
    if (!taken.has(cand.toLowerCase())) return cand;
  }
  return `${stem} (${Date.now()})${ext}`;
}

// ── Pure: recursive scan over a directory-like object ───────────────────────

const DEFAULT_KINDS: MediaKindOrDoc[] = ['IMAGE', 'VIDEO', 'AUDIO', 'LOTTIE'];

export async function scanDirectory(folderId: string, root: DirEntryLike, opts: ScanOptions = {}): Promise<ScanResult> {
  const maxDepth = opts.maxDepth ?? 6;
  const maxItems = opts.maxItems ?? 2000;
  const kinds = new Set(opts.kinds ?? DEFAULT_KINDS);
  const items: FolderMediaItem[] = [];
  const errors: string[] = [];
  let truncated = false;

  async function walk(dir: DirEntryLike, prefix: string, depth: number): Promise<void> {
    try {
      for await (const entry of dir.values()) {
        if (items.length >= maxItems) { truncated = true; return; }
        if (entry.name.startsWith('.') || entry.name.startsWith('$')) continue; // hidden / system
        if (entry.kind === 'directory') {
          if (depth >= maxDepth) { truncated = true; continue; }
          await walk(entry as DirEntryLike, `${prefix}${entry.name}/`, depth + 1);
          if (truncated && items.length >= maxItems) return;
          continue;
        }
        const kind = classifyFile(entry.name, '', false);
        if (!kind || !kinds.has(kind)) continue;
        try {
          const file = await (entry as FileEntryLike).getFile();
          const relPath = `${prefix}${entry.name}`;
          items.push({
            id: `${folderId}:${relPath}`,
            name: entry.name,
            relPath,
            kind: classifyFile(entry.name, file.type, false) ?? kind,
            size: file.size,
            lastModified: file.lastModified,
            url: opts.makeUrl?.(file, relPath),
          });
        } catch (e: any) {
          errors.push(`${prefix}${entry.name}: ${e?.message || 'unreadable'}`);
        }
      }
    } catch (e: any) {
      errors.push(`${prefix || '/'}: ${e?.message || 'unreadable folder'}`);
    }
  }

  await walk(root, '', 0);
  return { items, truncated, errors };
}

// ── Pure: writes into a directory-like object ───────────────────────────────

async function resolveSubdir(root: DirEntryLike, subpath: string | undefined, create: boolean): Promise<DirEntryLike> {
  let dir = root;
  const parts = (subpath || '').split('/').map(p => p.trim()).filter(Boolean);
  for (const p of parts) {
    if (!dir.getDirectoryHandle) throw new Error('This folder handle cannot open subfolders.');
    dir = await dir.getDirectoryHandle(sanitizeFileName(p, 'folder'), { create });
  }
  return dir;
}

async function namesIn(dir: DirEntryLike): Promise<string[]> {
  const out: string[] = [];
  for await (const e of dir.values()) out.push(e.name);
  return out;
}

export interface WrittenFile { name: string; relPath: string; size: number; file: File; }

/** Save `data` into `root` (optionally under `subpath`), never overwriting: collisions get " (n)". */
export async function writeFileToDirectory(root: DirEntryLike, name: string, data: Blob, subpath?: string): Promise<WrittenFile> {
  if (root.queryPermission) {
    const p = await root.queryPermission({ mode: 'readwrite' });
    if (p !== 'granted') throw new FolderPermissionError();
  }
  const dir = await resolveSubdir(root, subpath, true);
  if (!dir.getFileHandle) throw new Error('This folder handle is read-only.');
  const finalName = uniqueName(name, await namesIn(dir));
  const fh = await dir.getFileHandle(finalName, { create: true });
  const w = await fh.createWritable();
  try { await w.write(data); } finally { await w.close(); }
  const file: File = await fh.getFile();
  const clean = (subpath || '').split('/').map(p => sanitizeFileName(p.trim(), 'folder')).filter(Boolean).join('/');
  return { name: finalName, relPath: clean ? `${clean}/${finalName}` : finalName, size: file.size, file };
}

/** Create (or open) a subfolder; returns its sanitised name. */
export async function createSubfolderIn(root: DirEntryLike, name: string): Promise<string> {
  if (root.queryPermission) {
    const p = await root.queryPermission({ mode: 'readwrite' });
    if (p !== 'granted') throw new FolderPermissionError();
  }
  if (!root.getDirectoryHandle) throw new Error('This folder handle is read-only.');
  const clean = sanitizeFileName(name, 'New Folder');
  await root.getDirectoryHandle(clean, { create: true });
  return clean;
}

// ── Pure: list helpers (slide reorder) ──────────────────────────────────────

/**
 * Move the item at `from` so it lands BEFORE the item currently at `insertBefore`
 * (insertBefore === length means "to the end"). Returns a new array; a no-op move
 * (dropping onto its own position or the gap right after itself) returns the same order.
 */
export function moveBefore<T>(list: readonly T[], from: number, insertBefore: number): T[] {
  const n = list.length;
  if (from < 0 || from >= n) return list.slice();
  const target = Math.max(0, Math.min(n, insertBefore));
  if (target === from || target === from + 1) return list.slice();
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(target > from ? target - 1 : target, 0, item);
  return next;
}

/** Index of the slide a moved slide ends up at (so the selection can follow it). */
export function movedIndex(length: number, from: number, insertBefore: number): number {
  const target = Math.max(0, Math.min(length, insertBefore));
  if (target === from || target === from + 1) return from;
  return target > from ? target - 1 : target;
}

/** Drop on the left half of a card inserts before it, the right half after it. */
export function insertionIndexFor(cardIndex: number, offsetX: number, cardWidth: number): number {
  return offsetX < cardWidth / 2 ? cardIndex : cardIndex + 1;
}

// ── Browser: persistence (IndexedDB) ────────────────────────────────────────

const handleKey = (id: string) => `ambo:mediaFolder:${id}`;

async function idb() { return import('idb-keyval'); }

export function browserFolderAccessSupported(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).showDirectoryPicker === 'function';
}

export async function saveFolderHandle(id: string, handle: DirEntryLike): Promise<void> {
  const { set } = await idb();
  await set(handleKey(id), handle);
}
export async function loadFolderHandle(id: string): Promise<DirEntryLike | null> {
  try { const { get } = await idb(); return ((await get(handleKey(id))) as DirEntryLike) || null; } catch { return null; }
}
export async function deleteFolderHandle(id: string): Promise<void> {
  try { const { del } = await idb(); await del(handleKey(id)); } catch { /* ignore */ }
}

/**
 * Check (and, with `interactive`, request) permission. Interactive calls MUST come from a
 * user gesture (click/drop); a non-interactive call never prompts and returns 'prompt'
 * so the UI can show "Reconnect".
 */
export async function ensurePermission(handle: DirEntryLike, interactive: boolean, mode: 'read' | 'readwrite' = 'readwrite'): Promise<FolderPermission> {
  try {
    if (!handle.queryPermission) return 'granted';
    let p = await handle.queryPermission({ mode });
    if (p === 'granted') return 'granted';
    if (interactive && handle.requestPermission) p = await handle.requestPermission({ mode });
    return p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'prompt';
  } catch { return 'denied'; }
}

/** Pick a folder with the browser picker (readwrite) and persist its handle under `id`. */
export async function pickAndSaveBrowserFolder(id: string): Promise<{ name: string; handle: DirEntryLike } | null> {
  if (!browserFolderAccessSupported()) throw new Error(UNSUPPORTED_MESSAGE);
  let handle: DirEntryLike;
  try { handle = await (window as any).showDirectoryPicker({ id: 'ambo-media', mode: 'readwrite' }); }
  catch (e: any) { if (e?.name === 'AbortError') return null; throw e; }
  await saveFolderHandle(id, handle);
  return { name: handle.name || 'Folder', handle };
}

export const UNSUPPORTED_MESSAGE =
  'Folder access needs Chrome or Edge, or the Plajah Windows app. This browser cannot open local folders.';

// ── Browser: blob URL registry (revoked on rescan / removal) ────────────────

const liveUrls = new Map<string, Set<string>>();

export function trackUrl(folderId: string, url: string): string {
  let s = liveUrls.get(folderId);
  if (!s) { s = new Set(); liveUrls.set(folderId, s); }
  s.add(url);
  return url;
}
export function revokeFolderUrls(folderId: string): number {
  const s = liveUrls.get(folderId);
  if (!s) return 0;
  let n = 0;
  for (const u of s) { try { URL.revokeObjectURL(u); n++; } catch { /* ignore */ } }
  liveUrls.delete(folderId);
  return n;
}

/** Rescan a stored browser handle. Revokes the folder's previous blob URLs first. */
export async function scanBrowserFolder(folderId: string, handle: DirEntryLike, opts: ScanOptions = {}): Promise<ScanResult> {
  revokeFolderUrls(folderId);
  return scanDirectory(folderId, handle, {
    ...opts,
    makeUrl: (file) => trackUrl(folderId, URL.createObjectURL(file)),
  });
}

// ── Windows bridge ──────────────────────────────────────────────────────────

export interface WindowsFolderPick { path: string; name: string; }

export async function pickWindowsMediaFolder(): Promise<WindowsFolderPick | null> {
  const bridge = await import('../windowsBridgeService');
  const res = await bridge.pickWindowsFolder();
  if (!res || res.cancelled || !res.folderPath) return null;
  return { path: res.folderPath, name: res.folderName || res.folderPath.split(/[\\/]/).filter(Boolean).pop() || 'Folder' };
}

export async function scanWindowsMediaFolder(folderId: string, path: string, kinds?: MediaKindOrDoc[]): Promise<ScanResult> {
  const bridge = await import('../windowsBridgeService');
  const res = await bridge.scanWindowsLibrary('custom', path);
  if (!res || !res.success) return { items: [], truncated: false, errors: [res?.error || 'Folder is unavailable (moved, renamed, or offline).'] };
  const want = new Set(kinds ?? DEFAULT_KINDS);
  const items: FolderMediaItem[] = [];
  for (const f of res.files || []) {
    const kind = classifyFile(f.name, '', false);
    if (!kind || !want.has(kind)) continue;
    const rel = (f as any).relativePath || f.name;
    items.push({
      id: `${folderId}:${rel}`,
      name: f.name,
      relPath: rel,
      kind,
      size: f.size || 0,
      lastModified: f.lastModified || 0,
      url: f.url || (f as any).streamUrl,
    });
  }
  return { items, truncated: items.length >= 2000, errors: [] };
}

const WIN_WRITE_MAX = 48 * 1024 * 1024; // base64 over the WebView2 message bridge — keep it sane

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < buf.length; i += CH) bin += String.fromCharCode(...buf.subarray(i, i + CH));
  return btoa(bin);
}

/** Windows: write into a real folder through the bridge (collision-safe: name_1.ext). Returns a durable URL. */
export async function writeFileToWindowsFolder(folderPath: string, name: string, data: Blob): Promise<{ name: string; url: string; path: string }> {
  if (data.size > WIN_WRITE_MAX) throw new Error(`"${name}" is larger than ${Math.round(WIN_WRITE_MAX / 1048576)} MB — copy it into the folder in Explorer instead.`);
  const bridge = await import('../windowsBridgeService');
  const sep = folderPath.includes('/') && !folderPath.includes('\\') ? '/' : '\\';
  const target = `${folderPath.replace(/[\\/]+$/, '')}${sep}${sanitizeFileName(name)}`;
  const res = await bridge.saveLocalImageFile(target, await blobToBase64(data), false);
  if (!res.success || !res.url) throw new Error(res.error || 'Could not write to the folder.');
  return { name: res.fileName || name, url: res.url, path: res.savedPath || target };
}

// ── Import target + "import into folder" ────────────────────────────────────
//
// The operator marks ONE folder as the import target (star in the Media tab). Dropped /
// imported OS files are then copied there so the asset persists instead of dying with a
// blob URL.

export interface ImportTarget { folderId: string; kind: 'handle' | 'windows'; path?: string; name: string; }
const TARGET_KEY = 'ambo_media_import_target';

export function getImportTarget(): ImportTarget | null {
  try { const raw = localStorage.getItem(TARGET_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export function setImportTarget(t: ImportTarget | null): void {
  try { if (t) localStorage.setItem(TARGET_KEY, JSON.stringify(t)); else localStorage.removeItem(TARGET_KEY); } catch { /* ignore */ }
}

export interface ImportedMedia {
  name: string;
  kind: MediaKindOrDoc | null;
  url: string;
  /** True when a copy now lives in the media folder. */
  persisted: boolean;
  /** Why it was not persisted (shown to the operator). */
  note?: string;
}

/**
 * Copy files into the configured import folder and return playable URLs. Call from a user
 * gesture (drop/click) so a lapsed browser permission can be re-requested. Never throws per
 * file: a failed copy falls back to a blob URL with a note.
 */
export async function importFilesIntoTarget(files: File[], targetOverride?: ImportTarget | null): Promise<ImportedMedia[]> {
  const target = targetOverride ?? getImportTarget();
  const out: ImportedMedia[] = [];
  let handle: DirEntryLike | null = null;
  let targetNote: string | undefined;

  if (!target) {
    targetNote = 'No media folder set — this file lives only in memory for this session. Add a folder in the Media tab and star it to keep dropped files.';
  } else if (target.kind === 'handle') {
    handle = await loadFolderHandle(target.folderId);
    if (!handle) targetNote = `Folder "${target.name}" is no longer connected.`;
    else if ((await ensurePermission(handle, true, 'readwrite')) !== 'granted') { targetNote = `Folder "${target.name}" needs permission — reconnect it in the Media tab.`; handle = null; }
  } else if (target.kind === 'windows' && !target.path) {
    targetNote = 'Import folder has no path.';
  }

  for (const file of files) {
    const kind = classifyFile(file.name, file.type);
    if (target && !targetNote) {
      try {
        if (target.kind === 'handle' && handle) {
          const w = await writeFileToDirectory(handle, file.name, file);
          const url = trackUrl(target.folderId, URL.createObjectURL(w.file));
          out.push({ name: w.name, kind, url, persisted: true });
          continue;
        }
        if (target.kind === 'windows' && target.path) {
          const w = await writeFileToWindowsFolder(target.path, file.name, file);
          out.push({ name: w.name, kind, url: w.url, persisted: true });
          continue;
        }
      } catch (e: any) {
        out.push({ name: file.name, kind, url: trackUrl('__session', URL.createObjectURL(file)), persisted: false, note: `Could not copy into "${target.name}": ${e?.message || 'write failed'}` });
        continue;
      }
    }
    out.push({ name: file.name, kind, url: trackUrl('__session', URL.createObjectURL(file)), persisted: false, note: targetNote });
  }
  return out;
}

// ── Dropped folders / files from the OS ─────────────────────────────────────

/**
 * Flatten a drop into Files, descending into dropped folders (getAsFileSystemHandle on
 * Chrome/Edge, webkitGetAsEntry elsewhere). DataTransferItems die after the first await,
 * so every handle/entry is captured synchronously before anything is awaited.
 */
export async function filesFromDataTransfer(dt: DataTransfer, opts: { maxFiles?: number } = {}): Promise<File[]> {
  const maxFiles = opts.maxFiles ?? 500;
  const jobs: Array<Promise<File[]>> = [];
  const items = Array.from(dt.items || []);
  let usedItems = false;

  for (const it of items) {
    if (it.kind !== 'file') continue;
    usedItems = true;
    const anyIt = it as any;
    const file = it.getAsFile();
    if (typeof anyIt.getAsFileSystemHandle === 'function') {
      const hp: Promise<any> = anyIt.getAsFileSystemHandle();
      jobs.push(hp.then(async (h: any) => {
        if (h && h.kind === 'directory') return collectDirFiles(h, maxFiles);
        return file ? [file] : h?.getFile ? [await h.getFile()] : [];
      }).catch(() => (file ? [file] : [])));
    } else if (typeof anyIt.webkitGetAsEntry === 'function') {
      const entry = anyIt.webkitGetAsEntry();
      if (entry && entry.isDirectory) jobs.push(collectEntryFiles(entry, maxFiles).catch(() => []));
      else if (file) jobs.push(Promise.resolve([file]));
    } else if (file) {
      jobs.push(Promise.resolve([file]));
    }
  }
  if (!usedItems) return Array.from(dt.files || []);
  const files = (await Promise.all(jobs)).flat();
  return files.slice(0, maxFiles);
}

async function collectDirFiles(dir: DirEntryLike, max: number, depth = 0): Promise<File[]> {
  const out: File[] = [];
  if (depth > 6) return out;
  for await (const e of dir.values()) {
    if (out.length >= max) break;
    if (e.name.startsWith('.')) continue;
    if (e.kind === 'directory') out.push(...await collectDirFiles(e as DirEntryLike, max - out.length, depth + 1));
    else if (classifyFile(e.name, '', false)) { try { out.push(await (e as FileEntryLike).getFile()); } catch { /* skip */ } }
  }
  return out;
}

async function collectEntryFiles(entry: any, max: number, depth = 0): Promise<File[]> {
  if (depth > 6) return [];
  if (entry.isFile) {
    if (!classifyFile(entry.name, '', false)) return [];
    return new Promise<File[]>(res => entry.file((f: File) => res([f]), () => res([])));
  }
  const reader = entry.createReader();
  const out: File[] = [];
  for (;;) {
    const batch: any[] = await new Promise(res => reader.readEntries(res, () => res([])));
    if (!batch.length) break;
    for (const c of batch) {
      if (out.length >= max) return out;
      if (c.name.startsWith('.')) continue;
      out.push(...await collectEntryFiles(c, max - out.length, depth + 1));
    }
  }
  return out;
}
