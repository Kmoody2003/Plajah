// services/files/androidFilesBridge.ts — Typed Capacitor bridge for Android PlajahFilesPlugin.
// Enables full Android File Explorer (MediaStore + Device Storage + SAF folder trees), Sharesheet,
// external Open With, Zip/Unzip, native URL download, and local Folder Sync tracking.

import { Capacitor, registerPlugin } from '@capacitor/core';
import type { StorageRoot, SyncPair, UnifiedEntry } from './unifiedVfs';
import { classifyMediaKind, guessMimeType, parentUnifiedPath } from './unifiedVfs';
import type { LocalSnapshotEntry } from './syncPlanner';

export interface AndroidRawEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  lastModified: number;
  mimeType?: string;
  streamUrl?: string;
  thumbUrl?: string;
  isReadOnly?: boolean;
}

interface PlajahFilesCapPlugin {
  getStorageRoots(): Promise<{ roots: StorageRoot[]; permissionsGranted?: boolean }>;
  requestStoragePermission(): Promise<{ granted: boolean }>;
  pickSafFolder(): Promise<{ cancelled: boolean; root?: StorageRoot }>;
  removeSafFolder(opts: { uri: string }): Promise<{ success: boolean }>;
  listDirectory(opts: { path: string; recursive?: boolean; query?: string; limit?: number }): Promise<{ path: string; entries: AndroidRawEntry[] }>;
  createFolder(opts: { parentPath: string; name: string }): Promise<{ success: boolean; path?: string; error?: string }>;
  renameEntry(opts: { path: string; newName: string }): Promise<{ success: boolean; newPath?: string; error?: string }>;
  copyEntries(opts: { paths: string[]; targetDir: string }): Promise<{ success: boolean; copied?: number; error?: string }>;
  moveEntries(opts: { paths: string[]; targetDir: string }): Promise<{ success: boolean; moved?: number; error?: string }>;
  deleteEntries(opts: { paths: string[] }): Promise<{ success: boolean; deleted?: number; error?: string }>;
  zipEntries(opts: { paths: string[]; targetZipPath: string }): Promise<{ success: boolean; zipPath?: string; error?: string }>;
  unzipArchive(opts: { zipPath: string; targetDir: string }): Promise<{ success: boolean; count?: number; error?: string }>;
  readTextPreview(opts: { path: string; maxBytes?: number }): Promise<{ success: boolean; text?: string; truncated?: boolean; size?: number; error?: string }>;
  readFileBase64Chunk(opts: { path: string; offset: number; length: number }): Promise<{ data: string; eof: boolean; totalSize: number }>;
  downloadUrlToLocal(opts: { url: string; targetDir: string; fileName: string; headers?: Record<string, string> }): Promise<{ success: boolean; path?: string; size?: number; error?: string }>;
  openExternal(opts: { path: string; mimeType?: string }): Promise<{ success: boolean; error?: string }>;
  shareEntries(opts: { paths: string[]; title?: string }): Promise<{ success: boolean; error?: string }>;
  saveSyncPairs(opts: { pairsJson: string }): Promise<{ success: boolean }>;
  getSyncPairs(): Promise<{ pairsJson: string }>;
  scanLocalFolder(opts: { path: string; ignoreGlobs?: string[] }): Promise<{ entries: LocalSnapshotEntry[] }>;
  saveSyncBaseline(opts: { pairId: string; baselineJson: string }): Promise<{ success: boolean }>;
  getSyncBaseline(opts: { pairId: string }): Promise<{ baselineJson: string }>;
  saveConnectorSecret(opts: { id: string; secret: string }): Promise<{ success: boolean }>;
  getConnectorSecret(opts: { id: string }): Promise<{ secret?: string | null }>;
  deleteConnectorSecret(opts: { id: string }): Promise<{ success: boolean }>;
}

const AndroidFiles = registerPlugin<PlajahFilesCapPlugin>('PlajahFiles');

export function isAndroidFilesAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export function androidEntryToUnified(e: AndroidRawEntry, parentPath: string): UnifiedEntry {
  const mime = e.mimeType || (e.isDirectory ? 'inode/directory' : guessMimeType(e.name));
  const mediaKind = e.isDirectory ? 'OTHER' : classifyMediaKind(e.name, mime);
  return {
    id: `and:${e.path}`,
    name: e.name,
    path: e.path,
    parentPath: parentUnifiedPath(e.path) || parentPath,
    kind: 'local',
    isDirectory: e.isDirectory,
    size: Number(e.size || 0),
    lastModified: Number(e.lastModified || 0),
    mimeType: mime,
    extension: e.isDirectory ? '' : (e.name.includes('.') ? e.name.split('.').pop()?.toLowerCase() : ''),
    mediaKind,
    isReadOnly: e.isReadOnly,
    streamUrl: e.streamUrl,
    downloadUrl: e.streamUrl,
    thumbUrl: e.thumbUrl,
  };
}

export async function getAndroidStorageRoots(): Promise<{ roots: StorageRoot[]; permissionsGranted: boolean }> {
  if (!isAndroidFilesAvailable()) return { roots: [], permissionsGranted: false };
  const res = await AndroidFiles.getStorageRoots();
  return { roots: res.roots || [], permissionsGranted: res.permissionsGranted !== false };
}

export const requestAndroidStoragePermission = () => AndroidFiles.requestStoragePermission();
export const pickAndroidSafFolder = () => AndroidFiles.pickSafFolder();
export const removeAndroidSafFolder = (uri: string) => AndroidFiles.removeSafFolder({ uri });

export async function listAndroidDirectory(
  path: string,
  opts: { recursive?: boolean; query?: string; limit?: number } = {},
): Promise<{ path: string; entries: UnifiedEntry[] }> {
  const res = await AndroidFiles.listDirectory({ path, ...opts });
  const actual = res.path || path;
  return {
    path: actual,
    entries: (res.entries || []).map(e => androidEntryToUnified(e, actual)),
  };
}

export const createAndroidFolder = (parentPath: string, name: string) =>
  AndroidFiles.createFolder({ parentPath, name });
export const renameAndroidEntry = (path: string, newName: string) =>
  AndroidFiles.renameEntry({ path, newName });
export const copyAndroidEntries = (paths: string[], targetDir: string) =>
  AndroidFiles.copyEntries({ paths, targetDir });
export const moveAndroidEntries = (paths: string[], targetDir: string) =>
  AndroidFiles.moveEntries({ paths, targetDir });
export const deleteAndroidEntries = (paths: string[]) =>
  AndroidFiles.deleteEntries({ paths });
export const zipAndroidEntries = (paths: string[], targetZipPath: string) =>
  AndroidFiles.zipEntries({ paths, targetZipPath });
export const unzipAndroidArchive = (zipPath: string, targetDir: string) =>
  AndroidFiles.unzipArchive({ zipPath, targetDir });
export const readAndroidTextPreview = (path: string, maxBytes = 262_144) =>
  AndroidFiles.readTextPreview({ path, maxBytes });
export const downloadUrlToAndroidLocal = (url: string, targetDir: string, fileName: string, headers?: Record<string, string>) =>
  AndroidFiles.downloadUrlToLocal({ url, targetDir, fileName, headers });
export const openAndroidExternal = (path: string, mimeType?: string) =>
  AndroidFiles.openExternal({ path, mimeType });
export const shareAndroidEntries = (paths: string[], title?: string) =>
  AndroidFiles.shareEntries({ paths, title });

/** Read an Android local file/content URI into a browser File object for Drive/HQ/Transfer multipart uploads. */
export async function readAndroidPathAsFile(path: string, name: string, mimeType = 'application/octet-stream'): Promise<File> {
  const chunks: Uint8Array[] = [];
  let offset = 0;
  const chunkLen = 512 * 1024;
  while (true) {
    const part = await AndroidFiles.readFileBase64Chunk({ path, offset, length: chunkLen });
    if (part.data) {
      const bin = atob(part.data);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      chunks.push(arr);
      offset += arr.length;
    }
    if (part.eof || !part.data) break;
  }
  return new File(chunks as BlobPart[], name, { type: mimeType });
}

export async function getAndroidSyncPairs(): Promise<SyncPair[]> {
  if (!isAndroidFilesAvailable()) return [];
  try {
    const res = await AndroidFiles.getSyncPairs();
    const parsed = JSON.parse(res.pairsJson || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveAndroidSyncPairs(pairs: SyncPair[]): Promise<void> {
  if (!isAndroidFilesAvailable()) return;
  await AndroidFiles.saveSyncPairs({ pairsJson: JSON.stringify(pairs) });
}

export const scanAndroidSyncLocal = async (path: string, ignoreGlobs?: string[]): Promise<LocalSnapshotEntry[]> => {
  const res = await AndroidFiles.scanLocalFolder({ path, ignoreGlobs });
  return res.entries || [];
};

export async function getAndroidSyncBaseline(pairId: string): Promise<Record<string, any>> {
  try {
    const res = await AndroidFiles.getSyncBaseline({ pairId });
    return JSON.parse(res.baselineJson || '{}');
  } catch {
    return {};
  }
}

export async function saveAndroidSyncBaseline(pairId: string, baseline: Record<string, any>): Promise<void> {
  await AndroidFiles.saveSyncBaseline({ pairId, baselineJson: JSON.stringify(baseline) });
}

export const saveAndroidConnectorSecret = (id: string, secret: string) =>
  AndroidFiles.saveConnectorSecret({ id, secret }).then(() => {});
export const getAndroidConnectorSecret = async (id: string) =>
  (await AndroidFiles.getConnectorSecret({ id })).secret || null;
export const deleteAndroidConnectorSecret = (id: string) =>
  AndroidFiles.deleteConnectorSecret({ id }).then(() => {});
