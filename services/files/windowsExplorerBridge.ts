// services/files/windowsExplorerBridge.ts — Typed bridge for WinUI 3 full File Explorer, Sync Engine,
// Credential Vault, FileZilla auto-import, and native FTP/FTPS/FTPES/SFTP/WebDAV/SMB connectors.

import {
  isWindowsApp,
  onNativeMessage,
  requestNativeResponse,
} from '../windowsBridgeService';
import type {
  ConnectedLocationMeta,
  StorageRoot,
  SyncPair,
  UnifiedEntry,
} from './unifiedVfs';
import { classifyMediaKind, guessMimeType, isComicFileName, parentUnifiedPath } from './unifiedVfs';
import type { LocalSnapshotEntry } from './syncPlanner';

function nextReqId(prefix = 'fx'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export interface WindowsRawEntry {
  name: string;
  fullPath: string;
  isDirectory: boolean;
  size: number;
  lastModified: number;
  createdAt?: number;
  extension?: string;
  isHidden?: boolean;
  isReadOnly?: boolean;
  url?: string;
  thumbUrl?: string;
}

export function windowsEntryToUnified(e: WindowsRawEntry, currentFolder: string): UnifiedEntry {
  const mime = e.isDirectory ? 'inode/directory' : guessMimeType(e.name);
  const mediaKind = e.isDirectory ? 'OTHER' : classifyMediaKind(e.name, mime);
  const safeName = encodeURIComponent(e.name);
  const safePath = encodeURIComponent(e.fullPath);
  const streamUrl = e.isDirectory ? undefined : (e.url || `https://localmedia.plajah/${safeName}?path=${safePath}`);
  const thumbUrl =
    e.isDirectory
      ? undefined
      : e.thumbUrl ||
        (mediaKind === 'IMAGE' || mediaKind === 'VIDEO' || isComicFileName(e.name, mime)
          ? `https://localmedia.plajah/__thumb?path=${safePath}&size=320`
          : undefined);
  return {
    id: `win:${e.fullPath}`,
    name: e.name,
    path: e.fullPath,
    parentPath: parentUnifiedPath(e.fullPath) || currentFolder,
    kind: 'local',
    isDirectory: e.isDirectory,
    size: Number(e.size || 0),
    lastModified: Number(e.lastModified || 0),
    createdAt: e.createdAt,
    mimeType: mime,
    extension: e.isDirectory ? '' : (e.extension || '').replace(/^\./, '').toLowerCase(),
    mediaKind,
    isHidden: e.isHidden,
    isReadOnly: e.isReadOnly,
    thumbUrl,
    streamUrl,
    downloadUrl: streamUrl,
  };
}

export async function getWindowsStorageRoots(): Promise<StorageRoot[]> {
  if (!isWindowsApp()) return [];
  const res = await requestNativeResponse<{ success: boolean; roots?: StorageRoot[] }>(
    'FILES_GET_ROOTS',
    'FILES_GET_ROOTS_RESULT',
    {},
    undefined,
    10_000,
  );
  return res?.roots || [];
}

export async function listWindowsDirectory(
  dirPath: string,
  opts: { includeHidden?: boolean; recursive?: boolean; query?: string; limit?: number } = {},
): Promise<{ path: string; entries: UnifiedEntry[]; error?: string }> {
  const reqId = nextReqId('ls');
  const res = await requestNativeResponse<{
    requestId: string;
    success: boolean;
    path: string;
    entries?: WindowsRawEntry[];
    error?: string;
  }>(
    'FILES_LIST_DIR',
    'FILES_LIST_DIR_RESULT',
    {
      requestId: reqId,
      path: dirPath,
      includeHidden: Boolean(opts.includeHidden),
      recursive: Boolean(opts.recursive),
      query: opts.query || '',
      limit: opts.limit || 2000,
    },
    m => m?.requestId === reqId,
    45_000,
  );
  if (!res.success) {
    return { path: res.path || dirPath, entries: [], error: res.error || 'Failed to read directory' };
  }
  const actualPath = res.path || dirPath;
  return {
    path: actualPath,
    entries: (res.entries || []).map(e => windowsEntryToUnified(e, actualPath)),
  };
}

async function fileOp<T = { success: boolean; path?: string; error?: string }>(
  requestType: string,
  responseType: string,
  payload: Record<string, any>,
  timeoutMs = 60_000,
): Promise<T> {
  const reqId = nextReqId('op');
  return requestNativeResponse<T>(
    requestType,
    responseType,
    { requestId: reqId, ...payload },
    m => m?.requestId === reqId,
    timeoutMs,
  );
}

export const createWindowsFolder = (parentPath: string, name: string) =>
  fileOp<{ success: boolean; path?: string; error?: string }>(
    'FILES_CREATE_FOLDER',
    'FILES_CREATE_FOLDER_RESULT',
    { parentPath, name },
  );

export const renameWindowsEntry = (path: string, newName: string) =>
  fileOp<{ success: boolean; newPath?: string; error?: string }>(
    'FILES_RENAME',
    'FILES_RENAME_RESULT',
    { path, newName },
  );

export const copyWindowsEntries = (paths: string[], targetDir: string) =>
  fileOp<{ success: boolean; copied?: number; error?: string }>(
    'FILES_COPY',
    'FILES_COPY_RESULT',
    { paths, targetDir },
    120_000,
  );

export const moveWindowsEntries = (paths: string[], targetDir: string) =>
  fileOp<{ success: boolean; moved?: number; error?: string }>(
    'FILES_MOVE',
    'FILES_MOVE_RESULT',
    { paths, targetDir },
    120_000,
  );

export const deleteWindowsEntries = (paths: string[], recycle: boolean = true) =>
  fileOp<{ success: boolean; deleted?: number; error?: string }>(
    'FILES_DELETE_BATCH',
    'FILES_DELETE_BATCH_RESULT',
    { paths, recycle },
    60_000,
  );

export const zipWindowsEntries = (paths: string[], targetZipPath: string) =>
  fileOp<{ success: boolean; zipPath?: string; error?: string }>(
    'FILES_ZIP',
    'FILES_ZIP_RESULT',
    { paths, targetZipPath },
    180_000,
  );

export const unzipWindowsArchive = (zipPath: string, targetDir: string) =>
  fileOp<{ success: boolean; targetDir?: string; count?: number; error?: string }>(
    'FILES_UNZIP',
    'FILES_UNZIP_RESULT',
    { zipPath, targetDir },
    180_000,
  );

export const openWindowsExternal = (path: string) =>
  fileOp<{ success: boolean; error?: string }>('FILES_OPEN_EXTERNAL', 'FILES_OPEN_EXTERNAL_RESULT', { path });

export const readWindowsTextPreview = (path: string, maxBytes = 262_144) =>
  fileOp<{ success: boolean; text?: string; truncated?: boolean; size?: number; error?: string }>(
    'FILES_READ_TEXT',
    'FILES_READ_TEXT_RESULT',
    { path, maxBytes },
  );

export const readWindowsZipContents = (path: string) =>
  fileOp<{
    success: boolean;
    entries?: Array<{ fullName: string; size: number; compressedSize: number; lastModified: number; isDirectory: boolean }>;
    error?: string;
  }>('FILES_LIST_ZIP', 'FILES_LIST_ZIP_RESULT', { path });

export const downloadUrlToWindowsLocal = (
  url: string,
  targetPath: string,
  headers?: Record<string, string>,
) =>
  fileOp<{ success: boolean; path?: string; size?: number; error?: string }>(
    'FILES_DOWNLOAD_TO_LOCAL',
    'FILES_DOWNLOAD_TO_LOCAL_RESULT',
    { url, targetPath, headers },
    300_000,
  );

export const uploadWindowsFileToSignedUrl = (
  localPath: string,
  signedPutUrl: string,
  headers?: Record<string, string>,
) =>
  fileOp<{ success: boolean; status?: number; etag?: string; size?: number; error?: string }>(
    'FILES_UPLOAD_SIGNED',
    'FILES_UPLOAD_SIGNED_RESULT',
    { localPath, url: signedPutUrl, headers },
    300_000,
  );

// ── FileZilla auto-discovery + Windows PasswordVault secrets + Native Connectors ─────────────────

export async function readDefaultWindowsFileZillaXml(): Promise<{
  found: boolean;
  siteManagerXml?: string;
  recentServersXml?: string;
  paths?: string[];
}> {
  if (!isWindowsApp()) return { found: false };
  return fileOp('FILES_READ_FILEZILLA_DEFAULT', 'FILES_READ_FILEZILLA_DEFAULT_RESULT', {}, 10_000);
}

export async function saveWindowsConnectorSecret(id: string, user: string, secret: string): Promise<void> {
  if (!isWindowsApp()) return;
  await fileOp('CONNECTOR_SAVE_SECRET', 'CONNECTOR_SAVE_SECRET_RESULT', { id, user, secret });
}

export async function getWindowsConnectorSecret(id: string): Promise<string | null> {
  if (!isWindowsApp()) return null;
  const res = await fileOp<{ success: boolean; secret?: string | null }>(
    'CONNECTOR_GET_SECRET',
    'CONNECTOR_GET_SECRET_RESULT',
    { id },
  );
  return res.success ? res.secret || null : null;
}

export async function deleteWindowsConnectorSecret(id: string): Promise<void> {
  if (!isWindowsApp()) return;
  await fileOp('CONNECTOR_DELETE_SECRET', 'CONNECTOR_DELETE_SECRET_RESULT', { id });
}

export async function invokeWindowsConnectorOp(
  location: ConnectedLocationMeta,
  op: 'list' | 'mkdir' | 'rename' | 'delete' | 'download_to_local' | 'upload_from_local',
  params: {
    remotePath?: string;
    newName?: string;
    localPath?: string;
    secret?: string | null;
  } = {},
): Promise<{
  success: boolean;
  entries?: WindowsRawEntry[];
  localPath?: string;
  error?: string;
}> {
  return fileOp(
    'CONNECTOR_OP',
    'CONNECTOR_OP_RESULT',
    {
      location,
      op,
      ...params,
    },
    120_000,
  );
}

// ── Native WinUI Sync Engine (FileSystemWatcher + persistent pair registry) ──────────────────────

export async function getWindowsSyncState(): Promise<{
  pairs: SyncPair[];
  recentChanges?: Array<{ pairId: string; localPath: string; kind: string; timestamp: number }>;
}> {
  if (!isWindowsApp()) return { pairs: [] };
  const res = await fileOp<{
    success: boolean;
    pairs?: SyncPair[];
    recentChanges?: Array<{ pairId: string; localPath: string; kind: string; timestamp: number }>;
  }>('SYNC_GET_STATE', 'SYNC_GET_STATE_RESULT', {});
  return { pairs: res.pairs || [], recentChanges: res.recentChanges || [] };
}

export const saveWindowsSyncPair = (pair: SyncPair) =>
  fileOp<{ success: boolean; pairs?: SyncPair[]; error?: string }>('SYNC_SAVE_PAIR', 'SYNC_SAVE_PAIR_RESULT', { pair });

export const removeWindowsSyncPair = (pairId: string) =>
  fileOp<{ success: boolean; pairs?: SyncPair[]; error?: string }>('SYNC_REMOVE_PAIR', 'SYNC_REMOVE_PAIR_RESULT', { pairId });

export const scanWindowsSyncPairLocal = (localPath: string, ignoreGlobs?: string[]) =>
  fileOp<{ success: boolean; entries?: LocalSnapshotEntry[]; error?: string }>(
    'SYNC_SCAN_LOCAL',
    'SYNC_SCAN_LOCAL_RESULT',
    { localPath, ignoreGlobs },
    60_000,
  );

export const getWindowsSyncBaseline = (pairId: string) =>
  fileOp<{ success: boolean; baseline?: Record<string, any> }>(
    'SYNC_GET_BASELINE',
    'SYNC_GET_BASELINE_RESULT',
    { pairId },
  );

export const saveWindowsSyncBaseline = (pairId: string, baseline: Record<string, any>, status?: string, lastSyncAt?: number, lastError?: string) =>
  fileOp<{ success: boolean }>('SYNC_SAVE_BASELINE', 'SYNC_SAVE_BASELINE_RESULT', {
    pairId,
    baseline,
    status,
    lastSyncAt,
    lastError,
  });

export function onWindowsSyncChanges(
  cb: (ev: { pairId?: string; localPath?: string; changeKind?: string; timestamp?: number }) => void,
): () => void {
  return onNativeMessage(msg => {
    if (msg.type === 'SYNC_LOCAL_CHANGES') {
      cb(msg as any);
    }
  });
}
