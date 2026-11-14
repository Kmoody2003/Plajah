// services/files/syncPlanner.ts — Pure two-way & selective folder synchronization planner.
// Zero I/O or DOM globals so it runs identically in Node tests, Web, WinUI WebView2, and Android.

import type { SyncDirection } from './unifiedVfs';

export interface LocalSnapshotEntry {
  relPath: string;
  isDirectory: boolean;
  size: number;
  mtimeMs: number;
  hash?: string;
}

export interface RemoteSnapshotEntry {
  relPath: string;
  id: string;
  isDirectory: boolean;
  size: number;
  updatedAt: number;
  version?: number;
  hash?: string;
}

export interface SyncBaselineEntry {
  relPath: string;
  localSize: number;
  localMtimeMs: number;
  remoteId: string;
  remoteVersion?: number;
  remoteSize: number;
  remoteUpdatedAt: number;
  hash?: string;
  syncedAt: number;
}

export type SyncActionKind =
  | 'mkdir_remote'
  | 'mkdir_local'
  | 'upload_new'
  | 'upload_modified'
  | 'download_new'
  | 'download_modified'
  | 'delete_remote'
  | 'delete_local'
  | 'conflict';

export interface SyncAction {
  kind: SyncActionKind;
  relPath: string;
  local?: LocalSnapshotEntry;
  remote?: RemoteSnapshotEntry;
  baseline?: SyncBaselineEntry;
  conflictCopyRelPath?: string;
  reason: string;
}

export interface SyncConflict {
  relPath: string;
  conflictCopyRelPath: string;
  localMtimeMs: number;
  localSize: number;
  remoteUpdatedAt: number;
  remoteSize: number;
  remoteId: string;
}

export interface SyncPlanResult {
  actions: SyncAction[];
  conflicts: SyncConflict[];
  stats: {
    uploads: number;
    downloads: number;
    deletions: number;
    conflicts: number;
    directories: number;
    unchanged: number;
  };
}

export const DEFAULT_SYNC_IGNORES = [
  'desktop.ini',
  'thumbs.db',
  '.ds_store',
  '~$*',
  '*.tmp',
  '*.crdownload',
  '*.part',
  '.git/**',
];

/** Tolerance for FAT/MTP/clock jitter when timestamps differ by a couple seconds. */
const MTIME_TOLERANCE_MS = 2500;

export function normalizeSyncRelPath(relPath: string): string {
  return (relPath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/{2,}/g, '/');
}

function globToRegex(glob: string): RegExp {
  const clean = normalizeSyncRelPath(glob).toLowerCase();
  const escaped = clean
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '::DOUBLE_STAR::')
    .replace(/\*/g, '[^/]*')
    .replace(/::DOUBLE_STAR::/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

export function isSyncPathIgnored(relPath: string, extraGlobs: string[] = []): boolean {
  const norm = normalizeSyncRelPath(relPath);
  if (!norm) return true;
  const segments = norm.split('/');
  const baseName = segments[segments.length - 1];
  const patterns = [...DEFAULT_SYNC_IGNORES, ...extraGlobs];
  for (const pat of patterns) {
    const cleanPat = normalizeSyncRelPath(pat);
    if (!cleanPat) continue;
    const re = globToRegex(cleanPat);
    if (cleanPat.includes('/')) {
      if (re.test(norm)) return true;
    } else {
      if (re.test(baseName) || segments.some(s => re.test(s))) return true;
    }
  }
  return false;
}

export function isPathIncludedSelective(relPath: string, includedFolders?: string[]): boolean {
  if (!includedFolders || includedFolders.length === 0) return true;
  const norm = normalizeSyncRelPath(relPath).toLowerCase();
  return includedFolders.some(folder => {
    const clean = normalizeSyncRelPath(folder).toLowerCase();
    if (!clean) return true;
    return norm === clean || norm.startsWith(`${clean}/`);
  });
}

export function buildConflictCopyName(
  relPath: string,
  timestampMs: number,
  deviceTag: string = 'local',
): string {
  const norm = normalizeSyncRelPath(relPath);
  const d = new Date(timestampMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}-${pad(d.getUTCMinutes())}`;
  const tag = deviceTag.replace(/[^a-zA-Z0-9_-]/g, '') || 'local';
  const slash = norm.lastIndexOf('/');
  const dir = slash >= 0 ? norm.slice(0, slash + 1) : '';
  const file = slash >= 0 ? norm.slice(slash + 1) : norm;
  const dot = file.lastIndexOf('.');
  if (dot <= 0) return `${dir}${file} (${tag} conflict ${stamp})`;
  return `${dir}${file.slice(0, dot)} (${tag} conflict ${stamp})${file.slice(dot)}`;
}

function localChangedSinceBaseline(local: LocalSnapshotEntry, base: SyncBaselineEntry): boolean {
  if (local.hash && base.hash) return local.hash !== base.hash;
  if (local.size !== base.localSize) return true;
  return Math.abs(local.mtimeMs - base.localMtimeMs) > MTIME_TOLERANCE_MS;
}

function remoteChangedSinceBaseline(remote: RemoteSnapshotEntry, base: SyncBaselineEntry): boolean {
  if (remote.hash && base.hash) return remote.hash !== base.hash;
  if (remote.version !== undefined && base.remoteVersion !== undefined) {
    return remote.version !== base.remoteVersion;
  }
  if (remote.size !== base.remoteSize) return true;
  return Math.abs(remote.updatedAt - base.remoteUpdatedAt) > MTIME_TOLERANCE_MS;
}

function sameContent(local: LocalSnapshotEntry, remote: RemoteSnapshotEntry): boolean {
  if (local.hash && remote.hash) return local.hash === remote.hash;
  return local.size === remote.size && Math.abs(local.mtimeMs - remote.updatedAt) <= MTIME_TOLERANCE_MS;
}

export function planSyncRun(opts: {
  direction: SyncDirection;
  localEntries: LocalSnapshotEntry[];
  remoteEntries: RemoteSnapshotEntry[];
  baseline: Record<string, SyncBaselineEntry>;
  includedFolders?: string[];
  ignoreGlobs?: string[];
  now?: number;
  deviceTag?: string;
}): SyncPlanResult {
  const {
    direction,
    localEntries,
    remoteEntries,
    baseline,
    includedFolders,
    ignoreGlobs = [],
    now = Date.now(),
    deviceTag = 'device',
  } = opts;

  const localMap = new Map<string, LocalSnapshotEntry>();
  for (const e of localEntries) {
    const rel = normalizeSyncRelPath(e.relPath);
    if (!rel || isSyncPathIgnored(rel, ignoreGlobs) || !isPathIncludedSelective(rel, includedFolders)) continue;
    localMap.set(rel, { ...e, relPath: rel });
  }

  const remoteMap = new Map<string, RemoteSnapshotEntry>();
  for (const e of remoteEntries) {
    const rel = normalizeSyncRelPath(e.relPath);
    if (!rel || isSyncPathIgnored(rel, ignoreGlobs) || !isPathIncludedSelective(rel, includedFolders)) continue;
    remoteMap.set(rel, { ...e, relPath: rel });
  }

  const allPaths = Array.from(new Set([...localMap.keys(), ...remoteMap.keys(), ...Object.keys(baseline)]))
    .filter(rel => !isSyncPathIgnored(rel, ignoreGlobs) && isPathIncludedSelective(rel, includedFolders))
    .sort((a, b) => a.localeCompare(b));

  const actions: SyncAction[] = [];
  const conflicts: SyncConflict[] = [];
  const stats = { uploads: 0, downloads: 0, deletions: 0, conflicts: 0, directories: 0, unchanged: 0 };

  for (const rel of allPaths) {
    const l = localMap.get(rel);
    const r = remoteMap.get(rel);
    const b = baseline[rel];

    // Directories first
    if ((l?.isDirectory && !r) || (!l && r?.isDirectory)) {
      if (l?.isDirectory && !r) {
        if (direction !== 'downloadOnly' && !b) {
          actions.push({ kind: 'mkdir_remote', relPath: rel, local: l, reason: 'new_local_directory' });
          stats.directories++;
        } else if (direction === 'twoWay' && b) {
          actions.push({ kind: 'delete_local', relPath: rel, local: l, baseline: b, reason: 'deleted_remotely' });
          stats.deletions++;
        }
      } else if (r?.isDirectory && !l) {
        if (direction !== 'uploadOnly' && !b) {
          actions.push({ kind: 'mkdir_local', relPath: rel, remote: r, reason: 'new_remote_directory' });
          stats.directories++;
        } else if (direction === 'twoWay' && b) {
          actions.push({ kind: 'delete_remote', relPath: rel, remote: r, baseline: b, reason: 'deleted_locally' });
          stats.deletions++;
        }
      }
      continue;
    }

    if (l?.isDirectory && r?.isDirectory) {
      stats.unchanged++;
      continue;
    }

    // Files
    if (l && !r) {
      if (!b) {
        if (direction === 'downloadOnly') {
          stats.unchanged++;
        } else {
          actions.push({ kind: 'upload_new', relPath: rel, local: l, reason: 'new_local_file' });
          stats.uploads++;
        }
      } else if (direction === 'twoWay') {
        if (localChangedSinceBaseline(l, b)) {
          // Local was edited after remote deleted it -> keep local via conflict upload
          actions.push({ kind: 'upload_modified', relPath: rel, local: l, baseline: b, reason: 'local_modified_after_remote_delete' });
          stats.uploads++;
        } else {
          actions.push({ kind: 'delete_local', relPath: rel, local: l, baseline: b, reason: 'deleted_remotely' });
          stats.deletions++;
        }
      } else if (direction === 'uploadOnly') {
        actions.push({ kind: 'upload_new', relPath: rel, local: l, reason: 'mirror_upload' });
        stats.uploads++;
      } else {
        actions.push({ kind: 'delete_local', relPath: rel, local: l, baseline: b, reason: 'mirror_download_prune' });
        stats.deletions++;
      }
      continue;
    }

    if (!l && r) {
      if (!b) {
        if (direction === 'uploadOnly') {
          stats.unchanged++;
        } else {
          actions.push({ kind: 'download_new', relPath: rel, remote: r, reason: 'new_remote_file' });
          stats.downloads++;
        }
      } else if (direction === 'twoWay') {
        if (remoteChangedSinceBaseline(r, b)) {
          actions.push({ kind: 'download_modified', relPath: rel, remote: r, baseline: b, reason: 'remote_modified_after_local_delete' });
          stats.downloads++;
        } else {
          actions.push({ kind: 'delete_remote', relPath: rel, remote: r, baseline: b, reason: 'deleted_locally' });
          stats.deletions++;
        }
      } else if (direction === 'downloadOnly') {
        actions.push({ kind: 'download_new', relPath: rel, remote: r, reason: 'mirror_download' });
        stats.downloads++;
      } else {
        actions.push({ kind: 'delete_remote', relPath: rel, remote: r, baseline: b, reason: 'mirror_upload_prune' });
        stats.deletions++;
      }
      continue;
    }

    if (l && r) {
      if (!b) {
        if (sameContent(l, r)) {
          stats.unchanged++;
        } else if (direction === 'uploadOnly') {
          actions.push({ kind: 'upload_modified', relPath: rel, local: l, remote: r, reason: 'upload_overwrite' });
          stats.uploads++;
        } else if (direction === 'downloadOnly') {
          actions.push({ kind: 'download_modified', relPath: rel, local: l, remote: r, reason: 'download_overwrite' });
          stats.downloads++;
        } else {
          const copyPath = buildConflictCopyName(rel, now, deviceTag);
          actions.push({ kind: 'conflict', relPath: rel, local: l, remote: r, conflictCopyRelPath: copyPath, reason: 'both_created_different' });
          conflicts.push({
            relPath: rel,
            conflictCopyRelPath: copyPath,
            localMtimeMs: l.mtimeMs,
            localSize: l.size,
            remoteUpdatedAt: r.updatedAt,
            remoteSize: r.size,
            remoteId: r.id,
          });
          stats.conflicts++;
        }
        continue;
      }

      const lDirty = localChangedSinceBaseline(l, b);
      const rDirty = remoteChangedSinceBaseline(r, b);
      if (!lDirty && !rDirty) {
        stats.unchanged++;
      } else if (lDirty && !rDirty) {
        if (direction === 'downloadOnly') {
          stats.unchanged++;
        } else {
          actions.push({ kind: 'upload_modified', relPath: rel, local: l, remote: r, baseline: b, reason: 'local_modified' });
          stats.uploads++;
        }
      } else if (!lDirty && rDirty) {
        if (direction === 'uploadOnly') {
          stats.unchanged++;
        } else {
          actions.push({ kind: 'download_modified', relPath: rel, local: l, remote: r, baseline: b, reason: 'remote_modified' });
          stats.downloads++;
        }
      } else {
        // Both sides modified since last baseline
        if (sameContent(l, r)) {
          stats.unchanged++;
        } else if (direction === 'uploadOnly') {
          actions.push({ kind: 'upload_modified', relPath: rel, local: l, remote: r, baseline: b, reason: 'upload_wins' });
          stats.uploads++;
        } else if (direction === 'downloadOnly') {
          actions.push({ kind: 'download_modified', relPath: rel, local: l, remote: r, baseline: b, reason: 'download_wins' });
          stats.downloads++;
        } else {
          const copyPath = buildConflictCopyName(rel, now, deviceTag);
          actions.push({ kind: 'conflict', relPath: rel, local: l, remote: r, baseline: b, conflictCopyRelPath: copyPath, reason: 'both_modified' });
          conflicts.push({
            relPath: rel,
            conflictCopyRelPath: copyPath,
            localMtimeMs: l.mtimeMs,
            localSize: l.size,
            remoteUpdatedAt: r.updatedAt,
            remoteSize: r.size,
            remoteId: r.id,
          });
          stats.conflicts++;
        }
      }
    }
  }

  return { actions, conflicts, stats };
}
