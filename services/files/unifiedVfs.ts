// services/files/unifiedVfs.ts — Unified Files, Cloud Drive, Content HQ, Sync & Connected Locations domain model.
// Pure module shared across Web, WinUI 3 Desktop, and Android (Capacitor + Compose).

export type LocationKind = 'local' | 'drive' | 'hq' | 'shared' | 'connector' | 'mesh';

export type UnifiedMediaKind = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOC' | 'ARCHIVE' | 'OTHER';

export type SyncState =
  | 'synced'
  | 'pending_upload'
  | 'pending_download'
  | 'conflict'
  | 'local_only'
  | 'cloud_only';

export type SyncDirection = 'twoWay' | 'uploadOnly' | 'downloadOnly';

export interface StorageRoot {
  id: string;
  label: string;
  kind: LocationKind;
  path: string;
  totalBytes?: number;
  freeBytes?: number;
  writable: boolean;
  readonlyReason?: string;
  badge?: string;
  protocol?: string;
}

export interface UnifiedEntry {
  id: string;
  name: string;
  path: string;
  parentPath: string;
  kind: LocationKind;
  isDirectory: boolean;
  size: number;
  lastModified: number;
  createdAt?: number;
  mimeType?: string;
  extension?: string;
  mediaKind: UnifiedMediaKind;
  isHidden?: boolean;
  isReadOnly?: boolean;
  thumbUrl?: string;
  streamUrl?: string;
  downloadUrl?: string;
  driveItemId?: string;
  hqAssetId?: string;
  status?: string;
  folder?: string;
  syncState?: SyncState;
}

export interface ConnectedLocationMeta {
  id: string;
  name: string;
  protocol: 'ftp' | 'ftps' | 'ftpes' | 'sftp' | 'webdav' | 'webdavs' | 'smb' | 's3';
  host: string;
  port: number;
  user: string;
  remoteDir: string;
  passive?: boolean;
  source: 'filezilla' | 'manual';
  hasSecret: boolean;
  lastConnectedAt?: number;
}

export interface SyncPair {
  id: string;
  label: string;
  localPath: string;
  localKind: 'windows' | 'android' | 'web';
  targetKind: 'drive' | 'hq';
  targetScopeKind: 'user' | 'org';
  targetScopeId: string;
  targetFolderId?: string | null;
  targetFolderLabel: string;
  direction: SyncDirection;
  selectiveFolders?: string[];
  ignoreGlobs?: string[];
  enabled: boolean;
  lastSyncAt?: number;
  status: 'idle' | 'syncing' | 'paused' | 'error' | 'conflict';
  lastError?: string;
  pendingCount?: number;
  conflictCount?: number;
}

export interface StageMediaItem {
  id?: string;
  name: string;
  fullPath?: string;
  folderPath?: string;
  url: string;
  thumbUrl?: string;
  size?: number;
  lastModified?: number;
  mimeType?: string;
  mediaKind?: 'IMAGE' | 'AUDIO' | 'VIDEO' | 'UNKNOWN' | UnifiedMediaKind;
  isLocal?: boolean;
  locationKind?: LocationKind;
  driveItemId?: string;
  hqAssetId?: string;
}

const IMAGE_EXTS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'tif', 'tiff', 'ico', 'svg', 'heic', 'heif', 'dng', 'raw', 'cr2', 'nef', 'arw',
]);

const VIDEO_EXTS = new Set([
  'mp4', 'mkv', 'mov', 'avi', 'webm', 'm4v', 'wmv', 'mpg', 'mpeg', 'flv', '3gp', 'mts', 'm2ts', 'braw',
]);

const AUDIO_EXTS = new Set([
  'mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'opus', 'wma', 'aiff', 'aif', 'alac', 'mid', 'midi',
]);

const DOC_EXTS = new Set([
  'pdf', 'txt', 'md', 'markdown', 'json', 'csv', 'tsv', 'xml', 'yaml', 'yml', 'log', 'ini', 'toml', 'env',
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'cs', 'kt', 'java', 'rs', 'go', 'cpp', 'c', 'h', 'hpp',
  'html', 'htm', 'css', 'scss', 'sql', 'sh', 'ps1', 'bat', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'rtf',
  'tela', 'tdoc', 'plajah',
]);

const COMIC_EXTS = new Set([
  'cbz', 'cbr', 'comic', 'pjc', 'manga',
]);

const ARCHIVE_EXTS = new Set([
  'zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar', 'iso', 'cab',
  'cbz', 'cbr', 'comic', 'pjc', 'manga',
]);

export type PlajahRichPreviewKind =
  | 'IMAGE'
  | 'VIDEO'
  | 'AUDIO'
  | 'TELA_DOC'
  | 'COMIC'
  | 'LOTTIE'
  | 'DOC'
  | 'ARCHIVE'
  | 'OTHER';

const MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  ico: 'image/x-icon',
  svg: 'image/svg+xml',
  heic: 'image/heic',
  heif: 'image/heif',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  wmv: 'video/x-ms-wmv',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  aac: 'audio/aac',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  opus: 'audio/opus',
  aiff: 'audio/aiff',
  aif: 'audio/aiff',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  json: 'application/json',
  csv: 'text/csv',
  xml: 'application/xml',
  html: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  ts: 'text/typescript',
  zip: 'application/zip',
  tela: 'application/vnd.plajah.tela+json',
  tdoc: 'application/vnd.plajah.tela+json',
  plajah: 'application/vnd.plajah.tela+json',
  cbz: 'application/vnd.comicbook+zip',
  cbr: 'application/vnd.comicbook-rar',
  comic: 'application/vnd.plajah.comic+zip',
  pjc: 'application/vnd.plajah.comic+zip',
  manga: 'application/vnd.plajah.comic+zip',
  lottie: 'application/vnd.lottie+json',
};

export function extractExtension(name: string): string {
  const clean = name.split('?')[0].split('#')[0];
  const base = clean.replace(/^.*[\\/]/, '');
  const idx = base.lastIndexOf('.');
  if (idx <= 0 || idx === base.length - 1) return '';
  return base.slice(idx + 1).toLowerCase();
}

export function guessMimeType(name: string): string {
  const ext = extractExtension(name);
  return MIME_MAP[ext] || 'application/octet-stream';
}

export function classifyMediaKind(name: string, mime?: string): UnifiedMediaKind {
  const m = (mime || '').toLowerCase();
  if (m.startsWith('image/')) return 'IMAGE';
  if (m.startsWith('video/')) return 'VIDEO';
  if (m.startsWith('audio/')) return 'AUDIO';
  if (m === 'application/pdf' || m.startsWith('text/') || m === 'application/json' || m === 'application/xml') return 'DOC';
  if (m === 'application/zip' || m === 'application/x-tar' || m === 'application/gzip' || m === 'application/x-7z-compressed') return 'ARCHIVE';

  const ext = extractExtension(name);
  if (IMAGE_EXTS.has(ext)) return 'IMAGE';
  if (VIDEO_EXTS.has(ext)) return 'VIDEO';
  if (AUDIO_EXTS.has(ext)) return 'AUDIO';
  if (DOC_EXTS.has(ext)) return 'DOC';
  if (ARCHIVE_EXTS.has(ext)) return 'ARCHIVE';
  return 'OTHER';
}

export function isTelaFileName(name: string, mime?: string): boolean {
  const m = (mime || '').toLowerCase();
  if (m.includes('plajah.tela')) return true;
  const lower = name.split('?')[0].toLowerCase();
  return lower.endsWith('.tela') || lower.endsWith('.tdoc') || lower.endsWith('.tela.json') || lower.endsWith('.tela-page.json');
}

export function isComicFileName(name: string, mime?: string): boolean {
  const m = (mime || '').toLowerCase();
  if (m.includes('comic')) return true;
  const ext = extractExtension(name);
  return COMIC_EXTS.has(ext);
}

export function isLottieAnimationFile(name: string, mime?: string): boolean {
  const m = (mime || '').toLowerCase();
  if (m.includes('lottie')) return true;
  return extractExtension(name) === 'lottie';
}

export function classifyPlajahRichKind(name: string, mime?: string): PlajahRichPreviewKind {
  if (isTelaFileName(name, mime)) return 'TELA_DOC';
  if (isComicFileName(name, mime)) return 'COMIC';
  if (isLottieAnimationFile(name, mime)) return 'LOTTIE';
  return classifyMediaKind(name, mime);
}

export function isTextReadableExtension(name: string, mime?: string): boolean {
  const m = (mime || '').toLowerCase();
  if (m.startsWith('text/') || m === 'application/json' || m === 'application/xml' || m.includes('plajah.tela')) return true;
  const ext = extractExtension(name);
  return [
    'txt', 'md', 'markdown', 'json', 'csv', 'tsv', 'xml', 'yaml', 'yml', 'log', 'ini', 'toml', 'env',
    'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'cs', 'kt', 'java', 'rs', 'go', 'cpp', 'c', 'h', 'hpp',
    'html', 'htm', 'css', 'scss', 'sql', 'sh', 'ps1', 'bat', 'svg', 'tela', 'tdoc',
  ].includes(ext);
}

export function normalizeUnifiedPath(p: string): string {
  const trimmed = (p || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('content://') || trimmed.startsWith('mediastore://') || trimmed.startsWith('vfs://')) {
    return trimmed;
  }
  // Preserve UNC prefix \\server\share while normalizing slashes elsewhere.
  if (trimmed.startsWith('\\\\')) {
    return '\\\\' + trimmed.slice(2).replace(/\/+/g, '\\').replace(/\\+$/, '');
  }
  if (/^[A-Za-z]:[\\/]?$/.test(trimmed)) {
    return `${trimmed[0].toUpperCase()}:\\`;
  }
  if (/^[A-Za-z]:/.test(trimmed)) {
    return trimmed.replace(/\//g, '\\').replace(/\\+$/, '');
  }
  return trimmed.replace(/\/+$/, '') || '/';
}

export function parentUnifiedPath(p: string): string {
  const norm = normalizeUnifiedPath(p);
  if (!norm || norm === '/' || /^[A-Za-z]:\\$/.test(norm)) return norm;
  if (norm.startsWith('content://') || norm.startsWith('mediastore://')) return '';
  const sep = /^[A-Za-z]:|^\\\\/.test(norm) ? '\\' : '/';
  const idx = norm.lastIndexOf(sep);
  if (idx <= 0) return sep === '\\' ? norm : '/';
  const parent = norm.slice(0, idx);
  if (/^[A-Za-z]:$/.test(parent)) return `${parent}\\`;
  if (norm.startsWith('\\\\') && parent === '\\') return norm;
  return parent;
}

export function joinUnifiedPath(base: string, segment: string): string {
  const cleanSeg = segment.replace(/^[\\/]+|[\\/]+$/g, '');
  if (!base) return cleanSeg;
  const sep = /^[A-Za-z]:|^\\\\/.test(base) ? '\\' : '/';
  const cleanBase = base.endsWith(sep) ? base.slice(0, -1) : base;
  return `${cleanBase}${sep}${cleanSeg}`;
}

export function splitBreadcrumbs(rootLabel: string, rootPath: string, currentPath: string): Array<{ label: string; path: string }> {
  const normRoot = normalizeUnifiedPath(rootPath);
  const normCur = normalizeUnifiedPath(currentPath);
  if (!normCur || normCur === normRoot) {
    return [{ label: rootLabel, path: normRoot || currentPath }];
  }
  if (normCur.startsWith('content://') || normCur.startsWith('mediastore://')) {
    return [{ label: rootLabel, path: normCur }];
  }
  const crumbs: Array<{ label: string; path: string }> = [{ label: rootLabel, path: normRoot }];
  if (normRoot && normCur.toLowerCase().startsWith(normRoot.toLowerCase())) {
    const sep = /^[A-Za-z]:|^\\\\/.test(normRoot) ? '\\' : '/';
    const rest = normCur.slice(normRoot.length).replace(/^[\\/]+/, '');
    if (!rest) return crumbs;
    let acc = normRoot;
    for (const part of rest.split(/[\\/]+/).filter(Boolean)) {
      acc = joinUnifiedPath(acc, part);
      crumbs.push({ label: part, path: acc });
    }
    return crumbs;
  }
  // Fallback split when navigating across a sibling volume
  const parts = normCur.split(/[\\/]+/).filter(Boolean);
  let acc = /^[A-Za-z]:/.test(normCur) ? `${parts[0]}\\` : normCur.startsWith('\\\\') ? `\\\\${parts[0]}` : '';
  const start = acc ? 1 : 0;
  if (acc) crumbs[0] = { label: acc, path: acc };
  for (let i = start; i < parts.length; i++) {
    acc = acc ? joinUnifiedPath(acc, parts[i]) : `/${parts[i]}`;
    crumbs.push({ label: parts[i], path: acc });
  }
  return crumbs;
}

export function sortUnifiedEntries(
  items: UnifiedEntry[],
  by: 'name' | 'size' | 'modified' | 'type' = 'name',
  asc: boolean = true,
): UnifiedEntry[] {
  const dirFactor = asc ? 1 : -1;
  return [...items].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    let cmp = 0;
    if (by === 'name') {
      cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    } else if (by === 'size') {
      cmp = (a.size || 0) - (b.size || 0);
    } else if (by === 'modified') {
      cmp = (a.lastModified || 0) - (b.lastModified || 0);
    } else if (by === 'type') {
      cmp = (a.extension || a.mediaKind).localeCompare(b.extension || b.mediaKind);
    }
    if (cmp === 0) cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    return cmp * dirFactor;
  });
}

export function toStageMediaItem(entry: UnifiedEntry): StageMediaItem {
  return {
    id: entry.id,
    name: entry.name,
    fullPath: entry.kind === 'local' ? entry.path : undefined,
    folderPath: entry.kind === 'local' ? entry.parentPath : undefined,
    url: entry.streamUrl || entry.downloadUrl || '',
    thumbUrl: entry.thumbUrl,
    size: entry.size,
    lastModified: entry.lastModified,
    mimeType: entry.mimeType || guessMimeType(entry.name),
    mediaKind: entry.mediaKind,
    isLocal: entry.kind === 'local',
    locationKind: entry.kind,
    driveItemId: entry.driveItemId,
    hqAssetId: entry.hqAssetId,
  };
}
