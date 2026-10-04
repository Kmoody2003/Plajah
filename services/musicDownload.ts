// musicDownload — save purchased music to the listener's own device.
//
// Where it lands, by host:
//   • Android app (Capacitor)   → /Music/Plajah/<Artist>/<Album>/  via the native Filesystem plugin
//   • Windows app + desktop web → the user's chosen Music folder via the File System Access API.
//                                 They pick it once; the handle is remembered, so later downloads
//                                 write silently while the permission is still granted.
//   • Anything else             → a normal browser download.
//
// Purchased tracks are also added to the buyer's private locker server-side (Stripe webhook), so
// they play from My Library on every device whether or not a local copy exists.

import { registerPlugin } from '@capacitor/core';
import type { Album, Track } from '../types';

export type SaveTarget = 'android-music' | 'folder' | 'browser';
export interface DownloadProgress { done: number; total: number; current?: string }
export interface DownloadResult { saved: number; failed: string[]; target: SaveTarget; folderName?: string }

const clean = (s: string) => (s || 'Unknown').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Unknown';

const extFor = (url: string, mime?: string) => {
  const m = /\.(mp3|m4a|aac|flac|wav|ogg|opus|aiff?)(?:$|[?#])/i.exec(url);
  if (m) return m[1].toLowerCase();
  if (mime?.includes('mpeg')) return 'mp3';
  if (mime?.includes('flac')) return 'flac';
  if (mime?.includes('wav')) return 'wav';
  if (mime?.includes('ogg')) return 'ogg';
  if (mime?.includes('mp4') || mime?.includes('aac')) return 'm4a';
  return 'mp3';
};

// ── host detection ──
const isAndroidApp = () => {
  try { return !!(window as any).Capacitor?.isNativePlatform?.() && (window as any).Capacitor?.getPlatform?.() === 'android'; }
  catch { return false; }
};
export const canPickFolder = () => typeof (window as any).showDirectoryPicker === 'function';

// ── remembered folder handle (IndexedDB) ──
const DB = 'plajah-music-folder', STORE = 'h', KEY = 'dir';
const idb = (): Promise<IDBDatabase> => new Promise((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
async function getSavedFolder(): Promise<any | null> {
  try {
    const db = await idb();
    return await new Promise(res => { const g = db.transaction(STORE).objectStore(STORE).get(KEY); g.onsuccess = () => res(g.result || null); g.onerror = () => res(null); });
  } catch { return null; }
}
async function saveFolder(handle: any) {
  try { const db = await idb(); db.transaction(STORE, 'readwrite').objectStore(STORE).put(handle, KEY); } catch { /* best effort */ }
}

/** True when we can write to the remembered folder right now without asking (no user gesture needed). */
export async function hasSilentFolderAccess(): Promise<boolean> {
  if (isAndroidApp()) return true;
  const h = await getSavedFolder();
  if (!h) return false;
  try { return (await h.queryPermission({ mode: 'readwrite' })) === 'granted'; } catch { return false; }
}

/** Must be called from a click: asks the user to pick (or re-confirm) their Music folder. */
export async function chooseMusicFolder(): Promise<any | null> {
  if (!canPickFolder()) return null;
  try {
    const h = await (window as any).showDirectoryPicker({ id: 'plajah-music', mode: 'readwrite', startIn: 'music' });
    await saveFolder(h);
    return h;
  } catch { return null; }
}

async function folderHandle(allowPrompt: boolean): Promise<any | null> {
  const saved = await getSavedFolder();
  if (saved) {
    try {
      if ((await saved.queryPermission({ mode: 'readwrite' })) === 'granted') return saved;
      if (allowPrompt && (await saved.requestPermission({ mode: 'readwrite' })) === 'granted') return saved;
    } catch { /* fall through to picker */ }
  }
  return allowPrompt ? chooseMusicFolder() : null;
}

const blobToBase64 = (b: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1] || '');
  r.onerror = () => rej(r.error);
  r.readAsDataURL(b);
});

interface FilesystemPlugin { writeFile(o: { path: string; data: string; directory: string; recursive: boolean }): Promise<unknown> }
// Resolved by Capacitor at runtime from the native plugin (@capacitor/filesystem + `npx cap sync android`).
const NativeFilesystem = registerPlugin<FilesystemPlugin>('Filesystem');

/**
 * Download tracks of a purchased release. `interactive` = called from a click, so we may show the
 * folder picker / permission prompt; otherwise we only write if access is already granted and
 * otherwise return target 'browser' with nothing saved (caller shows a Download button).
 */
export async function downloadRelease(
  album: Pick<Album, 'title' | 'artist'>,
  tracks: Track[],
  opts: { interactive: boolean; onProgress?: (p: DownloadProgress) => void },
): Promise<DownloadResult> {
  const failed: string[] = [];
  let saved = 0;
  const artistDir = clean(album.artist), albumDir = clean(album.title);
  const total = tracks.length;

  let target: SaveTarget = 'browser';
  let root: any = null;
  if (isAndroidApp()) target = 'android-music';
  else if (canPickFolder()) {
    root = await folderHandle(opts.interactive);
    if (root) target = 'folder';
    else if (!opts.interactive) return { saved: 0, failed: [], target: 'browser' };
  }

  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    opts.onProgress?.({ done: i, total, current: t.title });
    try {
      if (!t.url) throw new Error('no url');
      const res = await fetch(t.url);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const no = String(t.trackNo ?? i + 1).padStart(2, '0');
      const file = `${no} ${clean(t.title)}.${extFor(t.url, blob.type)}`;

      if (target === 'android-music') {
        const data = await blobToBase64(blob);
        const path = `Music/Plajah/${artistDir}/${albumDir}/${file}`;
        try { await NativeFilesystem.writeFile({ path, data, directory: 'EXTERNAL_STORAGE', recursive: true }); }
        catch { await NativeFilesystem.writeFile({ path: `Plajah Music/${artistDir}/${albumDir}/${file}`, data, directory: 'DOCUMENTS', recursive: true }); }
      } else if (target === 'folder') {
        const a = await root.getDirectoryHandle(artistDir, { create: true });
        const b = await a.getDirectoryHandle(albumDir, { create: true });
        const fh = await b.getFileHandle(file, { create: true });
        const w = await fh.createWritable();
        await w.write(blob); await w.close();
      } else {
        const u = URL.createObjectURL(blob);
        const el = document.createElement('a');
        el.href = u; el.download = `${clean(album.artist)} - ${file}`;
        document.body.appendChild(el); el.click(); el.remove();
        setTimeout(() => URL.revokeObjectURL(u), 10_000);
      }
      saved++;
    } catch {
      failed.push(t.title);
    }
  }
  opts.onProgress?.({ done: total, total });
  return { saved, failed, target, folderName: root?.name };
}
