// components/files/PlajahFilesWorkspace.tsx
// Unified File Explorer + Cloud Drive + Content HQ + Sync Client + Send Transfers + Connected Locations.
// Built to replace OS File Explorer / Android Files inside Web, WinUI 3 Desktop, and Android APK.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Cloud,
  Columns2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileCode2,
  FileText,
  Film,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderSync,
  HardDrive,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Menu,
  Music,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  Scissors,
  Search,
  Send,
  Server,
  Share2,
  Shield,
  Smartphone,
  Square,
  Trash2,
  UploadCloud,
  Sparkles,
  X,
} from 'lucide-react';
import { auth } from '../../services/backendService';
import { fetchUserOrganizations } from '../../services/organizationService';
import { createDriveApi, formatBytes } from '../../services/drive/client';
import PlajahDrive, { type DriveOrg } from '../drive/PlajahDrive';
import ContentHQ from '../ContentHQ';
import { NetworkFileExplorer } from '../home/NetworkFileExplorer';
import {
  classifyMediaKind,
  joinUnifiedPath,
  parentUnifiedPath,
  sortUnifiedEntries,
  splitBreadcrumbs,
  toStageMediaItem,
  type ConnectedLocationMeta,
  type StageMediaItem,
  type StorageRoot,
  type UnifiedEntry,
  classifyPlajahRichKind,
} from '../../services/files/unifiedVfs';
import {
  copyWindowsEntries,
  createWindowsFolder,
  deleteWindowsEntries,
  getWindowsStorageRoots,
  invokeWindowsConnectorOp,
  listWindowsDirectory,
  moveWindowsEntries,
  renameWindowsEntry,
  unzipWindowsArchive,
  windowsEntryToUnified,
  zipWindowsEntries,
} from '../../services/files/windowsExplorerBridge';
import {
  copyAndroidEntries,
  createAndroidFolder,
  deleteAndroidEntries,
  getAndroidStorageRoots,
  isAndroidFilesAvailable,
  listAndroidDirectory,
  moveAndroidEntries,
  pickAndroidSafFolder,
  renameAndroidEntry,
  requestAndroidStoragePermission,
  shareAndroidEntries,
  unzipAndroidArchive,
  zipAndroidEntries,
} from '../../services/files/androidFilesBridge';
import {
  ensureNativeVaultRegistered,
  openItemWithSystemApp,
  readStageItemAsFile,
  saveRemoteUrlToLocal,
} from '../../services/files/nativeFileBridges';
import {
  listWebDavBrowser,
  loadSavedConnectors,
  removeConnectedLocation,
  resolveConnectorSecret,
} from '../../services/storageConnectors/connectorRegistry';
import {
  isWindowsApp,
  pickWindowsFolder,
  showInExplorer,
} from '../../services/windowsBridgeService';
import { PlajahMediaStage } from '../media/PlajahMediaStage';
import { ExplorerEntryThumb, ExplorerRichHoverPreview } from './ExplorerRichHoverPreview';
import { choraHoverAudio } from '../../services/files/richPreviewCache';
import { SendTransferModal } from './SendTransferModal';
import { ConnectedLocationModal } from './ConnectedLocationModal';
import { SyncFoldersPanel } from './SyncFoldersPanel';

type SidebarSection =
  | { kind: 'local'; root: StorageRoot; path: string }
  | { kind: 'drive' }
  | { kind: 'hq'; orgId?: string }
  | { kind: 'sync' }
  | { kind: 'transfers' }
  | { kind: 'connector'; location: ConnectedLocationMeta; path: string }
  | { kind: 'mesh' };

function renderKindBadge(entry: UnifiedEntry) {
  if (entry.isDirectory) {
    return <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold tracking-wide">DIR</span>;
  }
  const richKind = classifyPlajahRichKind(entry.name, entry.mimeType);
  if (richKind === 'TELA_DOC') {
    return <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-bold tracking-wide">TELA</span>;
  }
  if (richKind === 'COMIC') {
    return <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-bold tracking-wide">COMIC</span>;
  }
  switch (entry.mediaKind) {
    case 'IMAGE':
      return <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold tracking-wide">IMG</span>;
    case 'VIDEO':
      return <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-bold tracking-wide">VID</span>;
    case 'AUDIO':
      return <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 text-[10px] font-bold tracking-wide">AUD</span>;
    case 'ARCHIVE':
      return <span className="px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 text-[10px] font-bold tracking-wide">ZIP</span>;
    default:
      return <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[10px] font-bold tracking-wide">DOC</span>;
  }
}

export interface PlajahFilesWorkspaceProps {
  onBack?: () => void;
  orgs?: DriveOrg[];
  apiBase?: string;
  onOpenCinemaPlayer?: (item: StageMediaItem, siblings: StageMediaItem[]) => void;
  onSendToChora?: (item: StageMediaItem) => void;
}

export const PlajahFilesWorkspace: React.FC<PlajahFilesWorkspaceProps> = ({
  onBack,
  orgs: propOrgs,
  apiBase = '',
  onOpenCinemaPlayer,
  onSendToChora,
}) => {
  const driveApi = useMemo(
    () => createDriveApi({ apiBase, getToken: async () => (auth.currentUser ? auth.currentUser.getIdToken() : null) }),
    [apiBase],
  );

  // Orgs & Identity
  const [orgs, setOrgs] = useState<DriveOrg[]>(propOrgs || []);
  const [rawOrgs, setRawOrgs] = useState<any[]>([]);
  const [uid, setUid] = useState<string | null>(() => auth.currentUser?.uid || null);

  // Device Roots & Connectors
  const [localRoots, setLocalRoots] = useState<StorageRoot[]>([]);
  const [androidNeedsPerm, setAndroidNeedsPerm] = useState(false);
  const [connectors, setConnectors] = useState<ConnectedLocationMeta[]>(() => loadSavedConnectors());
  const [webDirHandles, setWebDirHandles] = useState<Map<string, any>>(() => new Map());

  // Navigation State
  const [active, setActive] = useState<SidebarSection>(() =>
    isWindowsApp() || isAndroidFilesAvailable()
      ? { kind: 'local', root: { id: 'loading', label: 'Device', kind: 'local', path: '', writable: true }, path: '' }
      : { kind: 'drive' },
  );
  const [history, setHistory] = useState<SidebarSection[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  // Directory Entries
  const [entries, setEntries] = useState<UnifiedEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [dirError, setDirError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [recursiveSearch, setRecursiveSearch] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'modified' | 'type'>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [splitCloudPane, setSplitCloudPane] = useState(false);

  // Selection & Clipboard
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [clipboard, setClipboard] = useState<{ mode: 'copy' | 'cut'; sourceKind: 'local' | 'connector'; paths: string[] } | null>(null);

  // Inspector / Unified Stage
  const [previewItem, setPreviewItem] = useState<StageMediaItem | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [showPreviewPane, setShowPreviewPane] = useState(true);

  // Modals & Progress
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [sendInitialItems, setSendInitialItems] = useState<StageMediaItem[]>([]);
  const [connectorModalOpen, setConnectorModalOpen] = useState(false);
  const [transferToast, setTransferToast] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<UnifiedEntry | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [mobileSourcesOpen, setMobileSourcesOpen] = useState(false);

  const [hoverPreviewEnabled, setHoverPreviewEnabled] = useState(true);
  const [autoplayAudioOnHover, setAutoplayAudioOnHover] = useState(true);
  const [hoveredEntryState, setHoveredEntryState] = useState<{
    entry: UnifiedEntry;
    rect: { left: number; top: number; right: number; bottom: number };
  } | null>(null);
  const [pinnedAudioEntry, setPinnedAudioEntry] = useState<UnifiedEntry | null>(null);
  const hoverIntentTimerRef = useRef<number | null>(null);
  const hoverCloseTimerRef = useRef<number | null>(null);

  const clearHoverTimers = useCallback(() => {
    if (hoverIntentTimerRef.current !== null) {
      window.clearTimeout(hoverIntentTimerRef.current);
      hoverIntentTimerRef.current = null;
    }
    if (hoverCloseTimerRef.current !== null) {
      window.clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
  }, []);

  const handleEntryHoverEnter = useCallback((entry: UnifiedEntry, el: HTMLElement) => {
    if (!hoverPreviewEnabled || entry.isDirectory) return;
    clearHoverTimers();
    const r = el.getBoundingClientRect();
    const rect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    hoverIntentTimerRef.current = window.setTimeout(() => {
      setHoveredEntryState({ entry, rect });
    }, 140);
  }, [hoverPreviewEnabled, clearHoverTimers]);

  const handleEntryHoverLeave = useCallback(() => {
    clearHoverTimers();
    hoverCloseTimerRef.current = window.setTimeout(() => {
      setHoveredEntryState(null);
    }, 160);
  }, [clearHoverTimers]);

  useEffect(() => {
    if (!hoverPreviewEnabled) {
      clearHoverTimers();
      setHoveredEntryState(null);
      if (!pinnedAudioEntry) choraHoverAudio.stop();
    }
  }, [hoverPreviewEnabled, pinnedAudioEntry, clearHoverTimers]);

  useEffect(() => {
    if (previewItem && (showPreviewPane || lightboxOpen) && previewItem.mediaKind === 'AUDIO') {
      setPinnedAudioEntry(null);
      choraHoverAudio.stop();
    }
  }, [previewItem, showPreviewPane, lightboxOpen]);

  useEffect(() => {
    return () => {
      clearHoverTimers();
      choraHoverAudio.stop();
    };
  }, [clearHoverTimers]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const flash = useCallback((msg: string) => {
    setTransferToast(msg);
    window.setTimeout(() => setTransferToast(prev => (prev === msg ? null : prev)), 3200);
  }, []);

  useEffect(() => {
    ensureNativeVaultRegistered();
  }, []);

  // Load Firebase User + Organizations
  useEffect(() => {
    const unsub = auth.onAuthStateChanged?.(u => setUid(u?.uid || null));
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (!uid) {
      setOrgs(propOrgs || []);
      return;
    }
    fetchUserOrganizations(uid)
      .then(list => {
        setRawOrgs(list || []);
        if (!propOrgs) {
          setOrgs((list || []).map((o: any) => ({ id: o.id, name: o.name })));
        }
      })
      .catch(() => {});
  }, [uid, propOrgs]);

  // Discover Device Storage Roots
  const loadRoots = useCallback(async () => {
    if (isWindowsApp()) {
      const roots = await getWindowsStorageRoots();
      setLocalRoots(roots);
      return roots;
    }
    if (isAndroidFilesAvailable()) {
      const res = await getAndroidStorageRoots();
      setAndroidNeedsPerm(!res.permissionsGranted);
      setLocalRoots(res.roots || []);
      return res.roots || [];
    }
    return [];
  }, []);

  useEffect(() => {
    let alive = true;
    loadRoots().then(roots => {
      if (!alive || roots.length === 0) return;
      // Check pending reveal path from ?open=media "Reveal in Explorer"
      let pendingPath = '';
      try {
        const raw = sessionStorage.getItem('plajah:pending-files-target');
        if (raw) {
          sessionStorage.removeItem('plajah:pending-files-target');
          const parsed = JSON.parse(raw);
          pendingPath = parsed?.folderPath || '';
        }
      } catch { /* ignore */ }

      const preferredRoot =
        (pendingPath && roots.find(r => pendingPath.toLowerCase().startsWith(r.path.toLowerCase()))) ||
        roots.find(r => r.id.includes('downloads')) ||
        roots[0];
      if (preferredRoot) {
        navigateTo({ kind: 'local', root: preferredRoot, path: pendingPath || preferredRoot.path });
      }
    });
    return () => {
      alive = false;
    };
  }, [loadRoots]);

  const navigateTo = useCallback((next: SidebarSection, recordHistory = true) => {
    setActive(next);
    setSelectedIds(new Set());
    setDirError(null);
    setMobileSourcesOpen(false);
    if (recordHistory) {
      setHistory(prev => {
        const sliced = prev.slice(0, historyIdx + 1);
        return [...sliced, next];
      });
      setHistoryIdx(idx => idx + 1);
    }
  }, [historyIdx]);

  // Read directory contents whenever `active` or search/sort changes
  const refreshCurrentDir = useCallback(async () => {
    if (active.kind === 'local') {
      if (!active.path) return;
      setLoading(true);
      setDirError(null);
      try {
        if (isWindowsApp()) {
          const res = await listWindowsDirectory(active.path, {
            recursive: recursiveSearch && searchQuery.trim().length > 0,
            query: recursiveSearch ? searchQuery.trim() : undefined,
          });
          if (res.error) setDirError(res.error);
          setEntries(res.entries);
        } else if (isAndroidFilesAvailable()) {
          const res = await listAndroidDirectory(active.path, {
            recursive: recursiveSearch && searchQuery.trim().length > 0,
            query: recursiveSearch ? searchQuery.trim() : undefined,
          });
          setEntries(res.entries);
        } else {
          // Web File System Access API fallback
          const handle = webDirHandles.get(active.path);
          if (handle) {
            const list: UnifiedEntry[] = [];
            for await (const [name, entry] of handle.entries()) {
              const p = `${active.path}/${name}`;
              const isDir = entry.kind === 'directory';
              let size = 0;
              let lastModified = 0;
              let streamUrl: string | undefined;
              let mimeType: string | undefined;
              if (!isDir) {
                try {
                  const file: File = await entry.getFile();
                  size = file.size;
                  lastModified = file.lastModified;
                  mimeType = file.type || undefined;
                  streamUrl = URL.createObjectURL(file);
                } catch { /* ignore */ }
              }
              list.push({
                id: `web:${p}`,
                name,
                path: p,
                parentPath: active.path,
                kind: 'local',
                isDirectory: isDir,
                size,
                lastModified,
                mimeType,
                mediaKind: isDir ? 'OTHER' : classifyMediaKind(name, mimeType),
                streamUrl,
                downloadUrl: streamUrl,
              });
              if (isDir) {
                setWebDirHandles(m => new Map(m).set(p, entry));
              }
            }
            setEntries(list);
          }
        }
      } catch (err: any) {
        setDirError(err?.message || 'Unable to list folder contents');
        setEntries([]);
      } finally {
        setLoading(false);
      }
    } else if (active.kind === 'connector') {
      setLoading(true);
      setDirError(null);
      try {
        const loc = active.location;
        const secret = await resolveConnectorSecret(loc.id);
        if (isWindowsApp()) {
          const res = await invokeWindowsConnectorOp(loc, 'list', {
            remotePath: active.path,
            secret,
          });
          if (!res.success) {
            setDirError(res.error || 'Connection failed');
            setEntries([]);
          } else {
            const mapped = (res.entries || []).map(r => ({
              ...windowsEntryToUnified(r, active.path),
              kind: 'connector' as const,
              id: `conn:${loc.id}:${r.fullPath}`,
              path: r.fullPath,
              parentPath: active.path,
            }));
            setEntries(mapped);
          }
        } else if (loc.protocol === 'webdav' || loc.protocol === 'webdavs') {
          const list = await listWebDavBrowser(loc, active.path, secret);
          setEntries(list);
        } else {
          setDirError(`${loc.protocol.toUpperCase()} connections run directly via the Plajah Desktop (Windows) or Android app.`);
          setEntries([]);
        }
      } catch (err: any) {
        setDirError(err?.message || 'Remote connection failed');
        setEntries([]);
      } finally {
        setLoading(false);
      }
    }
  }, [active, recursiveSearch, searchQuery, webDirHandles]);

  useEffect(() => {
    refreshCurrentDir();
  }, [active, recursiveSearch]);

  const visibleEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q ? entries.filter(e => e.name.toLowerCase().includes(q)) : entries;
    return sortUnifiedEntries(filtered, sortBy, sortAsc);
  }, [entries, searchQuery, sortBy, sortAsc]);

  const folderPlaylist = useMemo(
    () => visibleEntries.filter(e => !e.isDirectory).map(toStageMediaItem),
    [visibleEntries],
  );

  // Open Web Folder Picker (Chrome / Edge File System Access API)
  const handlePickWebLocalFolder = async () => {
    if (isWindowsApp()) {
      const picked = await pickWindowsFolder();
      if (picked && !picked.cancelled && picked.folderPath) {
        const customRoot: StorageRoot = {
          id: `custom:${picked.folderPath}`,
          label: picked.folderName || picked.folderPath,
          kind: 'local',
          path: picked.folderPath,
          writable: true,
        };
        navigateTo({ kind: 'local', root: customRoot, path: picked.folderPath });
      }
      return;
    }
    if (isAndroidFilesAvailable()) {
      const picked = await pickAndroidSafFolder();
      if (picked && !picked.cancelled && picked.root) {
        await loadRoots();
        navigateTo({ kind: 'local', root: picked.root, path: picked.root.path });
      }
      return;
    }
    const showDir = (window as any).showDirectoryPicker;
    if (typeof showDir !== 'function') {
      flash('Folder mounting requires Plajah Desktop, Android APK, or Chromium browser.');
      return;
    }
    try {
      const handle = await showDir({ mode: 'readwrite' });
      const rootPath = `/${handle.name}`;
      setWebDirHandles(m => new Map(m).set(rootPath, handle));
      const root: StorageRoot = {
        id: `web:${rootPath}`,
        label: handle.name,
        kind: 'local',
        path: rootPath,
        writable: true,
      };
      setLocalRoots(prev => [root, ...prev.filter(x => x.id !== root.id)]);
      navigateTo({ kind: 'local', root, path: rootPath });
    } catch { /* cancelled */ }
  };

  // Actions inside active Local / Connector directory
  const selectedEntries = useMemo(
    () => visibleEntries.filter(e => selectedIds.has(e.id)),
    [visibleEntries, selectedIds],
  );

  const handleOpenEntry = (entry: UnifiedEntry) => {
    if (entry.isDirectory) {
      if (active.kind === 'local') {
        navigateTo({ kind: 'local', root: active.root, path: entry.path });
      } else if (active.kind === 'connector') {
        navigateTo({ kind: 'connector', location: active.location, path: entry.path });
      }
      return;
    }
    const item = toStageMediaItem(entry);
    setPreviewItem(item);
    setLightboxOpen(true);
  };

  const handleCreateFolder = async () => {
    const name = window.prompt('New folder name:');
    if (!name || !name.trim()) return;
    if (active.kind === 'local') {
      if (isWindowsApp()) await createWindowsFolder(active.path, name.trim());
      else if (isAndroidFilesAvailable()) await createAndroidFolder(active.path, name.trim());
      else {
        const handle = webDirHandles.get(active.path);
        if (handle) await handle.getDirectoryHandle(name.trim(), { create: true });
      }
      refreshCurrentDir();
    } else if (active.kind === 'connector' && isWindowsApp()) {
      const secret = await resolveConnectorSecret(active.location.id);
      await invokeWindowsConnectorOp(active.location, 'mkdir', {
        remotePath: `${active.path.replace(/\/$/, '')}/${name.trim()}`,
        secret,
      });
      refreshCurrentDir();
    }
  };

  const handleCommitRename = async () => {
    if (!renameTarget || !renameDraft.trim()) {
      setRenameTarget(null);
      return;
    }
    if (active.kind === 'local') {
      if (isWindowsApp()) await renameWindowsEntry(renameTarget.path, renameDraft.trim());
      else if (isAndroidFilesAvailable()) await renameAndroidEntry(renameTarget.path, renameDraft.trim());
      refreshCurrentDir();
    } else if (active.kind === 'connector' && isWindowsApp()) {
      const secret = await resolveConnectorSecret(active.location.id);
      await invokeWindowsConnectorOp(active.location, 'rename', {
        remotePath: renameTarget.path,
        newName: renameDraft.trim(),
        secret,
      });
      refreshCurrentDir();
    }
    setRenameTarget(null);
  };

  const handleDeleteSelected = async () => {
    const targets = selectedEntries.map(e => e.path);
    if (!targets.length) return;
    const ok = window.confirm(`Delete ${targets.length} item(s)?${isWindowsApp() ? ' (Sends to Recycle Bin)' : ''}`);
    if (!ok) return;
    if (active.kind === 'local') {
      if (isWindowsApp()) await deleteWindowsEntries(targets, true);
      else if (isAndroidFilesAvailable()) await deleteAndroidEntries(targets);
      refreshCurrentDir();
    } else if (active.kind === 'connector' && isWindowsApp()) {
      const secret = await resolveConnectorSecret(active.location.id);
      for (const p of targets) {
        await invokeWindowsConnectorOp(active.location, 'delete', { remotePath: p, secret });
      }
      refreshCurrentDir();
    }
  };

  const handlePaste = async () => {
    if (!clipboard || active.kind !== 'local') return;
    if (isWindowsApp()) {
      if (clipboard.mode === 'copy') await copyWindowsEntries(clipboard.paths, active.path);
      else await moveWindowsEntries(clipboard.paths, active.path);
    } else if (isAndroidFilesAvailable()) {
      if (clipboard.mode === 'copy') await copyAndroidEntries(clipboard.paths, active.path);
      else await moveAndroidEntries(clipboard.paths, active.path);
    }
    if (clipboard.mode === 'cut') setClipboard(null);
    flash('Paste complete');
    refreshCurrentDir();
  };

  const handleZipSelected = async () => {
    if (active.kind !== 'local' || selectedEntries.length === 0) return;
    const defaultName = selectedEntries.length === 1 ? `${selectedEntries[0].name}.zip` : 'Archive.zip';
    const zipName = window.prompt('Create zip archive:', defaultName);
    if (!zipName?.trim()) return;
    const targetZip = joinUnifiedPath(active.path, zipName.trim().endsWith('.zip') ? zipName.trim() : `${zipName.trim()}.zip`);
    const paths = selectedEntries.map(e => e.path);
    if (isWindowsApp()) await zipWindowsEntries(paths, targetZip);
    else if (isAndroidFilesAvailable()) await zipAndroidEntries(paths, targetZip);
    flash(`Created ${zipName}`);
    refreshCurrentDir();
  };

  const handleExtractZip = async (entry: UnifiedEntry) => {
    if (active.kind !== 'local') return;
    const outFolder = joinUnifiedPath(active.path, entry.name.replace(/\.zip$/i, ''));
    if (isWindowsApp()) await unzipWindowsArchive(entry.path, outFolder);
    else if (isAndroidFilesAvailable()) await unzipAndroidArchive(entry.path, outFolder);
    flash(`Extracted to ${outFolder}`);
    refreshCurrentDir();
  };

  const handleUploadItemsToDrive = async (items: StageMediaItem[]) => {
    if (!uid) {
      flash('Sign in to upload files into Plajah Drive.');
      return;
    }
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      flash(`Uploading (${i + 1}/${items.length}): ${it.name}…`);
      try {
        const file = await readStageItemAsFile(it);
        const ctrl = new AbortController();
        await driveApi.upload({ kind: 'u' }, file, null, pct => {
          if (file.size > 0) {
            flash(`Uploading ${it.name}: ${Math.min(100, Math.round((pct / file.size) * 100))}%`);
          }
        }, ctrl.signal);
      } catch (err: any) {
        flash(`Failed uploading ${it.name}: ${err?.message || 'error'}`);
        return;
      }
    }
    flash(`Uploaded ${items.length} file(s) to My Plajah Drive`);
  };

  const handleSaveCloudItemToCurrentLocal = async (url: string, fileName: string) => {
    if (active.kind !== 'local' || !active.path) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    flash(`Saving ${fileName} to ${active.root.label}…`);
    const r = await saveRemoteUrlToLocal(url, active.path, fileName);
    if (r.success) {
      flash(`Saved to ${r.path || active.path}`);
      refreshCurrentDir();
    } else {
      flash(r.error || 'Download failed');
    }
  };

  const canGoBack = historyIdx > 0;
  const canGoForward = historyIdx < history.length - 1;
  const crumbs =
    active.kind === 'local'
      ? splitBreadcrumbs(active.root.label, active.root.path, active.path)
      : active.kind === 'connector'
        ? [{ label: active.location.name, path: active.location.remoteDir || '/' }, { label: active.path, path: active.path }]
        : [];

  return (
    <div className="h-[calc(100vh-48px)] min-h-[580px] w-full flex flex-col bg-[#07080d] text-white overflow-hidden select-none">
      {/* Top Shell Header */}
      <header className="h-12 px-3 sm:px-4 border-b border-white/10 bg-[#0b0d14] flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          {onBack && (
            <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white cursor-pointer" title="Back">
              <ArrowLeft size={16} />
            </button>
          )}
          <button
            onClick={() => setMobileSourcesOpen(o => !o)}
            className={`md:hidden p-1.5 rounded-lg border cursor-pointer ${
              mobileSourcesOpen ? 'bg-amber-500/20 border-amber-400/50 text-amber-300' : 'bg-white/8 border-white/10 text-white/80'
            }`}
            title="Toggle Sources & Drives"
          >
            {mobileSourcesOpen ? <X size={15} /> : <Menu size={15} />}
          </button>
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-purple-600 flex items-center justify-center shrink-0">
            <HardDrive size={15} className="text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-bold leading-none truncate">Plajah Files & Content HQ</h1>
            <p className="text-[10px] text-white/45 truncate">Explorer • Cloud Drive • Sync • Locations</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => {
              setSendInitialItems(selectedEntries.filter(e => !e.isDirectory).map(toStageMediaItem));
              setSendModalOpen(true);
            }}
            className="px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Send size={13} />
            <span className="hidden sm:inline">Send Link</span>
          </button>

          <button
            onClick={() => setSplitCloudPane(s => !s)}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer border ${
              splitCloudPane
                ? 'bg-purple-500/20 border-purple-400/50 text-purple-200'
                : 'bg-white/8 border-white/10 hover:bg-white/14 text-white/80'
            }`}
            title="Toggle Dual-Pane Split (Local + Cloud Drive side-by-side)"
          >
            <Columns2 size={13} />
            <span className="hidden md:inline">Split Drive</span>
          </button>

          <button
            onClick={() => setShowPreviewPane(s => !s)}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer border ${
              showPreviewPane
                ? 'bg-sky-500/20 border-sky-400/50 text-sky-200'
                : 'bg-white/8 border-white/10 hover:bg-white/14 text-white/80'
            }`}
            title="Toggle Quick-View Stage"
          >
            <Eye size={13} />
            <span className="hidden md:inline">Preview</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Body */}
      <div className="relative flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        {mobileSourcesOpen && (
          <div
            onClick={() => setMobileSourcesOpen(false)}
            className="md:hidden fixed inset-0 z-30 bg-black/60 backdrop-blur-[1px]"
          />
        )}
        {/* ── LEFT UNIFIED LOCATION SIDEBAR ── */}
        <aside
          className={`${
            mobileSourcesOpen ? 'fixed top-12 bottom-0 left-0 z-40 w-64 shadow-2xl block' : 'hidden md:block md:w-56 lg:w-60'
          } border-r border-white/10 bg-[#0a0b11] overflow-y-auto p-2.5 space-y-4 shrink-0`}
        >
          {/* This Device */}
          <div>
            <div className="px-2 pb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-white/45">
              <span className="flex items-center gap-1">
                {isAndroidFilesAvailable() ? <Smartphone size={11} /> : <HardDrive size={11} />}
                This Device
              </span>
              <button
                onClick={handlePickWebLocalFolder}
                className="text-amber-400 hover:text-amber-300 cursor-pointer flex items-center gap-0.5"
                title="Mount or pick a local folder"
              >
                <Plus size={12} /> Mount
              </button>
            </div>
            <div className="space-y-0.5">
              {localRoots.length === 0 ? (
                <button
                  onClick={handlePickWebLocalFolder}
                  className="w-full px-2.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-left text-xs text-white/75 flex items-center gap-2 cursor-pointer"
                >
                  <FolderOpen size={14} className="text-amber-300" /> Open Local Folder…
                </button>
              ) : (
                localRoots.map(root => {
                  const isAct = active.kind === 'local' && active.root.id === root.id;
                  const pctUsed =
                    root.totalBytes && root.freeBytes !== undefined
                      ? Math.round(((root.totalBytes - root.freeBytes) / root.totalBytes) * 100)
                      : null;
                  return (
                    <button
                      key={root.id}
                      onClick={() => navigateTo({ kind: 'local', root, path: root.path })}
                      className={`w-full px-2.5 py-1.5 rounded-xl text-left text-xs transition cursor-pointer ${
                        isAct ? 'bg-amber-500/20 text-amber-200 border border-amber-500/30' : 'hover:bg-white/8 text-white/80'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="flex items-center gap-2 truncate">
                          <HardDrive size={13} className={isAct ? 'text-amber-300 shrink-0' : 'text-white/50 shrink-0'} />
                          <span className="truncate font-medium">{root.label}</span>
                        </span>
                        {root.freeBytes !== undefined && (
                          <span className="text-[9px] font-mono text-white/45 shrink-0">{formatBytes(root.freeBytes)}</span>
                        )}
                      </div>
                      {pctUsed !== null && (
                        <div className="mt-1 h-1 rounded-full bg-white/10 overflow-hidden">
                          <div className="h-full bg-amber-400/80" style={{ width: `${Math.min(100, pctUsed)}%` }} />
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Cloud Drive & Content HQ */}
          <div>
            <div className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-white/45 flex items-center gap-1">
              <Cloud size={11} /> Cloud & Content HQ
            </div>
            <div className="space-y-0.5">
              <button
                onClick={() => navigateTo({ kind: 'drive' })}
                className={`w-full px-2.5 py-1.5 rounded-xl text-left text-xs flex items-center gap-2 cursor-pointer ${
                  active.kind === 'drive' ? 'bg-amber-500/20 text-amber-200 border border-amber-500/30' : 'hover:bg-white/8 text-white/80'
                }`}
              >
                <Cloud size={14} className="text-sky-300 shrink-0" /> Plajah Drive
              </button>
              <button
                onClick={() => navigateTo({ kind: 'hq' })}
                className={`w-full px-2.5 py-1.5 rounded-xl text-left text-xs flex items-center gap-2 cursor-pointer ${
                  active.kind === 'hq' && !active.orgId ? 'bg-amber-500/20 text-amber-200 border border-amber-500/30' : 'hover:bg-white/8 text-white/80'
                }`}
              >
                <Shield size={14} className="text-purple-300 shrink-0" /> My Content HQ
              </button>
              {orgs.map(o => (
                <button
                  key={o.id}
                  onClick={() => navigateTo({ kind: 'hq', orgId: o.id })}
                  className={`w-full px-2.5 py-1.5 rounded-xl text-left text-xs flex items-center gap-2 cursor-pointer ${
                    active.kind === 'hq' && active.orgId === o.id ? 'bg-amber-500/20 text-amber-200 border border-amber-500/30' : 'hover:bg-white/8 text-white/75'
                  }`}
                >
                  <Folder size={13} className="text-emerald-300 shrink-0" />
                  <span className="truncate">{o.name} HQ</span>
                </button>
              ))}
            </div>
          </div>

          {/* Sync & Send */}
          <div>
            <div className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-white/45">Sync & Transfers</div>
            <div className="space-y-0.5">
              <button
                onClick={() => navigateTo({ kind: 'sync' })}
                className={`w-full px-2.5 py-1.5 rounded-xl text-left text-xs flex items-center gap-2 cursor-pointer ${
                  active.kind === 'sync' ? 'bg-amber-500/20 text-amber-200 border border-amber-500/30' : 'hover:bg-white/8 text-white/80'
                }`}
              >
                <FolderSync size={14} className="text-amber-300 shrink-0" /> Synced Folders
              </button>
              <button
                onClick={() => {
                  setSendInitialItems([]);
                  setSendModalOpen(true);
                }}
                className="w-full px-2.5 py-1.5 rounded-xl text-left text-xs flex items-center gap-2 hover:bg-white/8 text-white/80 cursor-pointer"
              >
                <Send size={14} className="text-pink-300 shrink-0" /> Send & Shared Links
              </button>
            </div>
          </div>

          {/* Connected Locations (FileZilla / FTP / SFTP / WebDAV / SMB) & LAN Mesh */}
          <div>
            <div className="px-2 pb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-white/45">
              <span>Locations</span>
              <button
                onClick={() => setConnectorModalOpen(true)}
                className="text-sky-400 hover:text-sky-300 cursor-pointer flex items-center gap-0.5"
              >
                <Plus size={12} /> Add
              </button>
            </div>
            <div className="space-y-0.5">
              {connectors.map(loc => {
                const isAct = active.kind === 'connector' && active.location.id === loc.id;
                return (
                  <div key={loc.id} className="group flex items-center gap-1">
                    <button
                      onClick={() => navigateTo({ kind: 'connector', location: loc, path: loc.remoteDir || '/' })}
                      className={`flex-1 min-w-0 px-2.5 py-1.5 rounded-xl text-left text-xs flex items-center gap-2 cursor-pointer ${
                        isAct ? 'bg-sky-500/20 text-sky-200 border border-sky-500/30' : 'hover:bg-white/8 text-white/80'
                      }`}
                    >
                      <Server size={13} className="text-sky-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{loc.name}</div>
                        <div className="text-[9px] font-mono uppercase text-white/40">{loc.protocol} • {loc.host}</div>
                      </div>
                    </button>
                    <button
                      onClick={async () => {
                        const updated = await removeConnectedLocation(loc.id);
                        setConnectors(updated);
                        if (isAct) navigateTo({ kind: 'drive' });
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 text-white/45 hover:text-red-300 cursor-pointer"
                      title="Disconnect"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                );
              })}

              <button
                onClick={() => navigateTo({ kind: 'mesh' })}
                className={`w-full px-2.5 py-1.5 rounded-xl text-left text-xs flex items-center gap-2 cursor-pointer ${
                  active.kind === 'mesh' ? 'bg-amber-500/20 text-amber-200 border border-amber-500/30' : 'hover:bg-white/8 text-white/80'
                }`}
              >
                <Network size={14} className="text-emerald-300 shrink-0" /> Device Mesh (LAN)
              </button>
            </div>
          </div>
        </aside>

        {/* ── CENTER EXPLORER / CLOUD PANE ── */}
        <section className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
          {active.kind === 'drive' && (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <PlajahDrive api={driveApi} orgs={orgs} onAddStorage={() => setConnectorModalOpen(true)} />
            </div>
          )}

          {active.kind === 'hq' && (
            <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4">
              {(() => {
                const orgObj = active.orgId ? rawOrgs.find(o => o.id === active.orgId) : null;
                if (orgObj) {
                  return (
                    <ContentHQ
                      scope={{
                        kind: 'org',
                        id: orgObj.id,
                        ownerUid: orgObj.creatorId,
                        adminUids: orgObj.admins || [],
                        label: orgObj.name,
                        departments: orgObj.ministries || [],
                      }}
                      canEdit={true}
                      mediaOwnerUid={uid || ''}
                    />
                  );
                }
                return <ContentHQ scope={{ kind: 'user', id: uid || 'guest', label: 'My Content HQ' }} canEdit={true} mediaOwnerUid={uid || ''} />;
              })()}
            </div>
          )}

          {active.kind === 'sync' && (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <SyncFoldersPanel driveApi={driveApi} orgs={orgs} onRefreshExplorer={refreshCurrentDir} />
            </div>
          )}

          {active.kind === 'mesh' && (
            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              <NetworkFileExplorer />
            </div>
          )}

          {(active.kind === 'local' || active.kind === 'connector') && (
            <>
              {/* Explorer Address & Action Bar */}
              <div className="px-3 py-2 border-b border-white/10 bg-[#0d1018] space-y-2 shrink-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    disabled={!canGoBack}
                    onClick={() => {
                      if (!canGoBack) return;
                      const idx = historyIdx - 1;
                      setHistoryIdx(idx);
                      navigateTo(history[idx], false);
                    }}
                    className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30 cursor-pointer"
                    title="Back"
                  >
                    <ArrowLeft size={14} />
                  </button>
                  <button
                    disabled={!canGoForward}
                    onClick={() => {
                      if (!canGoForward) return;
                      const idx = historyIdx + 1;
                      setHistoryIdx(idx);
                      navigateTo(history[idx], false);
                    }}
                    className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30 cursor-pointer"
                    title="Forward"
                  >
                    <ArrowRight size={14} />
                  </button>
                  <button
                    onClick={() => {
                      if (active.kind === 'local') {
                        const up = parentUnifiedPath(active.path);
                        if (up && up !== active.path) navigateTo({ kind: 'local', root: active.root, path: up });
                      } else if (active.kind === 'connector') {
                        const parts = active.path.split('/').filter(Boolean);
                        parts.pop();
                        navigateTo({ kind: 'connector', location: active.location, path: '/' + parts.join('/') });
                      }
                    }}
                    className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer"
                    title="Up One Level"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button onClick={refreshCurrentDir} className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer" title="Refresh">
                    <RefreshCw size={14} className={loading ? 'animate-spin text-amber-400' : ''} />
                  </button>

                  {/* Breadcrumbs */}
                  <div className="flex-1 min-w-[180px] px-2.5 py-1 rounded-xl bg-black/50 border border-white/10 flex items-center gap-1 overflow-x-auto text-xs">
                    {crumbs.map((c, idx) => (
                      <React.Fragment key={`${c.path}-${idx}`}>
                        {idx > 0 && <ChevronRight size={12} className="text-white/35 shrink-0" />}
                        <button
                          onClick={() => {
                            if (active.kind === 'local') navigateTo({ kind: 'local', root: active.root, path: c.path });
                            else if (active.kind === 'connector') navigateTo({ kind: 'connector', location: active.location, path: c.path });
                          }}
                          className="hover:text-amber-300 truncate shrink-0 cursor-pointer"
                        >
                          {c.label}
                        </button>
                      </React.Fragment>
                    ))}
                  </div>

                  {/* Search */}
                  <div className="flex items-center gap-1 bg-black/50 border border-white/10 rounded-xl px-2.5 py-1">
                    <Search size={13} className="text-white/40" />
                    <input
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && recursiveSearch) refreshCurrentDir();
                      }}
                      placeholder="Filter or search…"
                      className="bg-transparent text-xs text-white focus:outline-none w-32 sm:w-44"
                    />
                    {isWindowsApp() && active.kind === 'local' && (
                      <button
                        onClick={() => setRecursiveSearch(r => !r)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer ${
                          recursiveSearch ? 'bg-amber-500/25 text-amber-300' : 'text-white/45 hover:text-white'
                        }`}
                        title="Toggle recursive subfolder search (Press Enter)"
                      >
                        Sub
                      </button>
                    )}
                  </div>

                  <button
                    onClick={() => setHoverPreviewEnabled(v => !v)}
                    className={`px-2 py-1 rounded-lg border text-[11px] font-medium cursor-pointer hidden sm:flex items-center gap-1 ${
                      hoverPreviewEnabled
                        ? 'bg-amber-500/15 border-amber-500/35 text-amber-200'
                        : 'bg-white/8 border-transparent text-white/60 hover:text-white'
                    }`}
                    title="Toggle fast rich hover previews (Tela, Comics, Video, Photos, Chora Audio)"
                  >
                    <Sparkles size={12} />
                    <span>Hover Rich</span>
                  </button>
                  <button
                    onClick={() => setAutoplayAudioOnHover(v => !v)}
                    className={`px-2 py-1 rounded-lg border text-[11px] font-medium cursor-pointer hidden md:flex items-center gap-1 ${
                      autoplayAudioOnHover
                        ? 'bg-orange-500/15 border-orange-500/35 text-orange-200'
                        : 'bg-white/8 border-transparent text-white/60 hover:text-white'
                    }`}
                    title="Toggle Chora audio autoplay when hovering songs"
                  >
                    <Music size={12} />
                    <span>Chora Auto</span>
                  </button>
                  <button
                    onClick={() => setViewMode(m => (m === 'list' ? 'grid' : 'list'))}
                    className="p-1.5 rounded-lg bg-white/8 hover:bg-white/14 cursor-pointer"
                    title="Switch List / Grid view"
                  >
                    {viewMode === 'list' ? <LayoutGrid size={14} /> : <List size={14} />}
                  </button>
                </div>

                {/* File Action Strip */}
                <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                  <button
                    onClick={handleCreateFolder}
                    className="px-2.5 py-1 rounded-lg bg-white/8 hover:bg-white/14 flex items-center gap-1 cursor-pointer"
                  >
                    <FolderPlus size={13} /> New Folder
                  </button>

                  {selectedEntries.length > 0 && (
                    <>
                      <button
                        onClick={() => setClipboard({ mode: 'copy', sourceKind: 'local', paths: selectedEntries.map(e => e.path) })}
                        className="px-2.5 py-1 rounded-lg bg-white/8 hover:bg-white/14 flex items-center gap-1 cursor-pointer"
                      >
                        <Copy size={13} /> Copy ({selectedEntries.length})
                      </button>
                      <button
                        onClick={() => setClipboard({ mode: 'cut', sourceKind: 'local', paths: selectedEntries.map(e => e.path) })}
                        className="px-2.5 py-1 rounded-lg bg-white/8 hover:bg-white/14 flex items-center gap-1 cursor-pointer"
                      >
                        <Scissors size={13} /> Move
                      </button>
                      {selectedEntries.length === 1 && (
                        <button
                          onClick={() => {
                            setRenameTarget(selectedEntries[0]);
                            setRenameDraft(selectedEntries[0].name);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-white/8 hover:bg-white/14 flex items-center gap-1 cursor-pointer"
                        >
                          <Pencil size={13} /> Rename
                        </button>
                      )}
                      {active.kind === 'local' && (
                        <button
                          onClick={handleZipSelected}
                          className="px-2.5 py-1 rounded-lg bg-white/8 hover:bg-white/14 flex items-center gap-1 cursor-pointer"
                        >
                          <Archive size={13} /> Zip
                        </button>
                      )}
                      {selectedEntries.length === 1 && selectedEntries[0].name.toLowerCase().endsWith('.zip') && active.kind === 'local' && (
                        <button
                          onClick={() => handleExtractZip(selectedEntries[0])}
                          className="px-2.5 py-1 rounded-lg bg-white/8 hover:bg-white/14 flex items-center gap-1 cursor-pointer"
                        >
                          <Archive size={13} /> Extract
                        </button>
                      )}
                      <button
                        onClick={() => handleUploadItemsToDrive(selectedEntries.filter(e => !e.isDirectory).map(toStageMediaItem))}
                        className="px-2.5 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 flex items-center gap-1 cursor-pointer"
                      >
                        <UploadCloud size={13} /> Upload to Drive
                      </button>
                      <button
                        onClick={() => {
                          setSendInitialItems(selectedEntries.filter(e => !e.isDirectory).map(toStageMediaItem));
                          setSendModalOpen(true);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 flex items-center gap-1 cursor-pointer"
                      >
                        <Send size={13} /> Send
                      </button>
                      {isAndroidFilesAvailable() && active.kind === 'local' && (
                        <button
                          onClick={() => shareAndroidEntries(selectedEntries.map(e => e.path))}
                          className="px-2.5 py-1 rounded-lg bg-white/8 hover:bg-white/14 flex items-center gap-1 cursor-pointer"
                        >
                          <Share2 size={13} /> Share
                        </button>
                      )}
                      <button
                        onClick={handleDeleteSelected}
                        className="px-2.5 py-1 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-200 flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    </>
                  )}

                  {clipboard && active.kind === 'local' && (
                    <button
                      onClick={handlePaste}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 flex items-center gap-1 cursor-pointer"
                    >
                      <ClipboardPaste size={13} /> Paste {clipboard.paths.length}
                    </button>
                  )}

                  {isWindowsApp() && active.kind === 'local' && active.path && (
                    <button
                      onClick={() => showInExplorer(active.path)}
                      className="ml-auto px-2 py-1 rounded-lg hover:bg-white/10 text-white/50 hover:text-white flex items-center gap-1 cursor-pointer"
                      title="Open in Windows Explorer"
                    >
                      <ExternalLink size={12} /> OS Explorer
                    </button>
                  )}
                </div>
              </div>

              {/* Rename Inline Bar */}
              {renameTarget && (
                <div className="px-3 py-2 bg-amber-500/15 border-b border-amber-500/30 flex items-center gap-2 text-xs">
                  <span>Rename <strong>{renameTarget.name}</strong> to:</span>
                  <input
                    autoFocus
                    value={renameDraft}
                    onChange={e => setRenameDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleCommitRename();
                      else if (e.key === 'Escape') setRenameTarget(null);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-black/60 border border-white/20 text-white"
                  />
                  <button onClick={handleCommitRename} className="px-3 py-1 rounded-lg bg-amber-500 text-black font-bold cursor-pointer">Save</button>
                  <button onClick={() => setRenameTarget(null)} className="px-2 py-1 rounded-lg bg-white/10 cursor-pointer">Cancel</button>
                </div>
              )}

              {/* Android Storage Permission Prompt */}
              {androidNeedsPerm && active.kind === 'local' && (
                <div className="m-3 p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-between gap-3 text-xs">
                  <span>Grant media & folder permissions to browse all folders on your Android device cleanly.</span>
                  <button
                    onClick={async () => {
                      await requestAndroidStoragePermission();
                      await loadRoots();
                      refreshCurrentDir();
                    }}
                    className="px-3 py-1.5 rounded-xl bg-amber-500 text-black font-bold shrink-0 cursor-pointer"
                  >
                    Grant Access
                  </button>
                </div>
              )}

              {dirError && (
                <div className="m-3 p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-xs text-red-200">{dirError}</div>
              )}

              {/* File Grid / Details Table */}
              <div
                onScroll={() => {
                  if (hoveredEntryState) {
                    clearHoverTimers();
                    setHoveredEntryState(null);
                  }
                }}
                className="flex-1 min-h-0 overflow-y-auto p-2.5"
              >
                {visibleEntries.length === 0 && !loading ? (
                  <div className="h-48 flex flex-col items-center justify-center text-white/40 text-xs">
                    <FolderOpen size={30} className="mb-2 opacity-50" />
                    Folder is empty
                  </div>
                ) : viewMode === 'grid' ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2.5">
                    {visibleEntries.map(entry => {
                      const sel = selectedIds.has(entry.id);
                      const isRowHovered = hoveredEntryState?.entry.id === entry.id;
                      const iconFallback =
                        entry.mediaKind === 'VIDEO' ? (
                          <Film size={32} className="text-purple-300" />
                        ) : entry.mediaKind === 'AUDIO' ? (
                          <Music size={32} className="text-amber-300" />
                        ) : entry.mediaKind === 'ARCHIVE' ? (
                          <Archive size={32} className="text-emerald-300" />
                        ) : (
                          <FileText size={32} className="text-sky-300" />
                        );
                      return (
                        <div
                          key={entry.id}
                          onMouseEnter={e => handleEntryHoverEnter(entry, e.currentTarget)}
                          onMouseLeave={handleEntryHoverLeave}
                          onClick={() => {
                            setSelectedIds(new Set([entry.id]));
                            if (!entry.isDirectory) setPreviewItem(toStageMediaItem(entry));
                          }}
                          onDoubleClick={() => handleOpenEntry(entry)}
                          className={`group rounded-2xl p-2.5 border transition cursor-pointer flex flex-col gap-2 ${
                            sel ? 'bg-amber-500/18 border-amber-400/60' : 'bg-white/[0.03] border-white/8 hover:bg-white/[0.07]'
                          }`}
                        >
                          <div className="aspect-[4/3] rounded-xl bg-black/45 flex items-center justify-center overflow-hidden relative">
                            {entry.isDirectory ? (
                              <Folder size={36} className="text-amber-400" />
                            ) : (
                              <ExplorerEntryThumb
                                entry={entry}
                                variant="grid"
                                isHovered={isRowHovered}
                                hoverMotionEnabled={hoverPreviewEnabled}
                                iconFallback={iconFallback}
                              />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-medium truncate">{entry.name}</div>
                            <div className="mt-1 flex items-center justify-between gap-1">
                              {renderKindBadge(entry)}
                              <span className="text-[10px] text-white/45 font-mono">
                                {entry.isDirectory ? '—' : formatBytes(entry.size)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-[#0d1018] text-[10px] uppercase tracking-wider text-white/45 border-b border-white/10">
                      <tr>
                        <th className="py-2 pl-2 w-7">
                          <button
                            onClick={() => {
                              if (selectedIds.size === visibleEntries.length) setSelectedIds(new Set());
                              else setSelectedIds(new Set(visibleEntries.map(e => e.id)));
                            }}
                            className="cursor-pointer"
                          >
                            {selectedIds.size > 0 && selectedIds.size === visibleEntries.length ? (
                              <CheckSquare size={14} className="text-amber-400" />
                            ) : (
                              <Square size={14} />
                            )}
                          </button>
                        </th>
                        <th
                          className="py-2 px-2 cursor-pointer hover:text-white"
                          onClick={() => { setSortBy('name'); setSortAsc(s => (sortBy === 'name' ? !s : true)); }}
                        >
                          Name
                        </th>
                        <th
                          className="py-2 px-2 cursor-pointer hover:text-white hidden sm:table-cell"
                          onClick={() => { setSortBy('modified'); setSortAsc(s => (sortBy === 'modified' ? !s : false)); }}
                        >
                          Modified
                        </th>
                        <th
                          className="py-2 px-2 cursor-pointer hover:text-white"
                          onClick={() => { setSortBy('type'); setSortAsc(s => (sortBy === 'type' ? !s : true)); }}
                        >
                          Type
                        </th>
                        <th
                          className="py-2 pr-3 text-right cursor-pointer hover:text-white"
                          onClick={() => { setSortBy('size'); setSortAsc(s => (sortBy === 'size' ? !s : false)); }}
                        >
                          Size
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {visibleEntries.map(entry => {
                        const sel = selectedIds.has(entry.id);
                        const isRowHovered = hoveredEntryState?.entry.id === entry.id;
                        const rowIconFallback =
                          entry.mediaKind === 'IMAGE' ? (
                            <ImageIcon size={15} className="text-emerald-300 shrink-0" />
                          ) : entry.mediaKind === 'VIDEO' ? (
                            <Film size={15} className="text-purple-300 shrink-0" />
                          ) : entry.mediaKind === 'AUDIO' ? (
                            <Music size={15} className="text-amber-300 shrink-0" />
                          ) : entry.mediaKind === 'ARCHIVE' ? (
                            <Archive size={15} className="text-teal-300 shrink-0" />
                          ) : (
                            <FileCode2 size={15} className="text-sky-300 shrink-0" />
                          );
                        return (
                          <tr
                            key={entry.id}
                            onMouseEnter={e => handleEntryHoverEnter(entry, e.currentTarget)}
                            onMouseLeave={handleEntryHoverLeave}
                            onClick={() => {
                              setSelectedIds(new Set([entry.id]));
                              if (!entry.isDirectory) setPreviewItem(toStageMediaItem(entry));
                            }}
                            onDoubleClick={() => handleOpenEntry(entry)}
                            className={`cursor-pointer transition ${
                              sel ? 'bg-amber-500/15 text-white' : 'hover:bg-white/[0.04] text-white/85'
                            }`}
                          >
                            <td
                              className="py-2 pl-2"
                              onClick={e => {
                                e.stopPropagation();
                                setSelectedIds(prev => {
                                  const next = new Set(prev);
                                  if (next.has(entry.id)) next.delete(entry.id);
                                  else next.add(entry.id);
                                  return next;
                                });
                              }}
                            >
                              {sel ? <CheckSquare size={14} className="text-amber-400" /> : <Square size={14} className="text-white/30" />}
                            </td>
                            <td className="py-1.5 px-2">
                              <div className="flex items-center gap-2.5 min-w-0">
                                {entry.isDirectory ? (
                                  <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                                    <Folder size={16} className="text-amber-400" />
                                  </div>
                                ) : (
                                  <ExplorerEntryThumb
                                    entry={entry}
                                    variant="list"
                                    isHovered={isRowHovered}
                                    hoverMotionEnabled={hoverPreviewEnabled}
                                    iconFallback={rowIconFallback}
                                  />
                                )}
                                <span className="truncate font-medium">{entry.name}</span>
                              </div>
                            </td>
                            <td className="py-2 px-2 text-white/50 font-mono text-[11px] hidden sm:table-cell">
                              {entry.lastModified ? new Date(entry.lastModified).toLocaleDateString() : '—'}
                            </td>
                            <td className="py-2 px-2">
                              {renderKindBadge(entry)}
                            </td>
                            <td className="py-2 pr-3 text-right font-mono text-white/60 text-[11px]">
                              {entry.isDirectory ? '—' : formatBytes(entry.size)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </section>

        {/* ── OPTIONAL SPLIT DUAL-PANE CLOUD DRIVE ── */}
        {splitCloudPane && active.kind !== 'drive' && (
          <section className="h-[44%] lg:h-auto lg:w-[380px] xl:w-[440px] border-t lg:border-t-0 lg:border-l border-white/10 bg-[#090a10] overflow-y-auto shrink-0">
            <div className="px-3 py-2 border-b border-white/10 text-[11px] font-bold uppercase tracking-wider text-purple-300 flex items-center justify-between">
              <span>Split Pane • Plajah Drive</span>
              <button onClick={() => setSplitCloudPane(false)} className="text-white/50 hover:text-white cursor-pointer">Close</button>
            </div>
            <PlajahDrive api={driveApi} orgs={orgs} />
          </section>
        )}

        {/* ── RIGHT EMBEDDED QUICK-VIEW MEDIA & DOC STAGE (DESKTOP / TABLET) ── */}
        {showPreviewPane && previewItem && !lightboxOpen && (active.kind === 'local' || active.kind === 'connector') && (
          <aside className="w-80 xl:w-96 shrink-0 hidden md:block">
            <PlajahMediaStage
              activeItem={previewItem}
              playlist={folderPlaylist}
              mode="embedded"
              onSelectItem={setPreviewItem}
              onExpand={() => setLightboxOpen(true)}
              onClose={() => setPreviewItem(null)}
              onUploadToCloud={it => handleUploadItemsToDrive([it])}
              onShareTransfer={it => {
                setSendInitialItems([it]);
                setSendModalOpen(true);
              }}
              onDownloadCloud={it => it.url && handleSaveCloudItemToCurrentLocal(it.url, it.name)}
              onOpenCinemaPlayer={onOpenCinemaPlayer}
              onSendToChora={onSendToChora}
              onDeleted={() => refreshCurrentDir()}
            />
          </aside>
        )}

        {/* ── COMPACT DOCKED QUICK-VIEW BAR (PORTRAIT PHONES / NARROW WINDOWS) ── */}
        {showPreviewPane && previewItem && !lightboxOpen && (active.kind === 'local' || active.kind === 'connector') && (
          <div className="md:hidden border-t border-white/12 bg-[#0b0d14] px-3 py-2.5 flex items-center gap-2 shrink-0">
            <div className="min-w-0 flex-1" onClick={() => setLightboxOpen(true)}>
              <div className="text-xs font-semibold truncate">{previewItem.name}</div>
              <div className="text-[10px] text-white/50 font-mono">
                {previewItem.mediaKind} · {previewItem.size ? formatBytes(previewItem.size) : 'Local'} · Tap to expand Stage
              </div>
            </div>
            <button
              onClick={() => {
                const idx = folderPlaylist.findIndex(p => p.id === previewItem.id);
                if (idx > 0) setPreviewItem(folderPlaylist[idx - 1]);
              }}
              disabled={folderPlaylist.findIndex(p => p.id === previewItem.id) <= 0}
              className="p-1.5 rounded-lg bg-white/8 disabled:opacity-30 cursor-pointer"
              title="Previous"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => setLightboxOpen(true)}
              className="px-2.5 py-1.5 rounded-lg bg-amber-500 text-black text-[11px] font-bold cursor-pointer"
            >
              Open Stage
            </button>
            <button
              onClick={() => {
                const idx = folderPlaylist.findIndex(p => p.id === previewItem.id);
                if (idx >= 0 && idx < folderPlaylist.length - 1) setPreviewItem(folderPlaylist[idx + 1]);
              }}
              disabled={(() => {
                const idx = folderPlaylist.findIndex(p => p.id === previewItem.id);
                return idx < 0 || idx >= folderPlaylist.length - 1;
              })()}
              className="p-1.5 rounded-lg bg-white/8 disabled:opacity-30 cursor-pointer"
              title="Next"
            >
              <ChevronRight size={14} />
            </button>
            <button
              onClick={() => setPreviewItem(null)}
              className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 cursor-pointer"
              title="Dismiss preview"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Fullscreen Unified Stage Lightbox */}
      {lightboxOpen && previewItem && (
        <PlajahMediaStage
          activeItem={previewItem}
          playlist={folderPlaylist}
          mode="lightbox"
          onSelectItem={setPreviewItem}
          onClose={() => setLightboxOpen(false)}
          onRevealInExplorer={() => setLightboxOpen(false)}
          onUploadToCloud={it => handleUploadItemsToDrive([it])}
          onShareTransfer={it => {
            setSendInitialItems([it]);
            setSendModalOpen(true);
          }}
          onDownloadCloud={it => it.url && handleSaveCloudItemToCurrentLocal(it.url, it.name)}
          onOpenCinemaPlayer={onOpenCinemaPlayer}
          onSendToChora={onSendToChora}
          onDeleted={() => refreshCurrentDir()}
        />
      )}

      {/* Toast Overlay */}
      {transferToast && (
        <div className="fixed bottom-5 right-5 z-[135] px-4 py-2.5 rounded-2xl bg-black/90 border border-amber-400/40 text-xs text-white shadow-2xl">
          {transferToast}
        </div>
      )}

      <SendTransferModal
        open={sendModalOpen}
        onClose={() => setSendModalOpen(false)}
        initialLocalItems={sendInitialItems}
      />

      <ExplorerRichHoverPreview
        entry={hoverPreviewEnabled ? hoveredEntryState?.entry ?? null : null}
        anchorRect={hoverPreviewEnabled ? hoveredEntryState?.rect ?? null : null}
        autoplayAudioOnHover={autoplayAudioOnHover}
        pinnedAudioEntry={pinnedAudioEntry}
        onToggleAutoplayAudio={() => setAutoplayAudioOnHover(v => !v)}
        onPinAudioEntry={it => {
          if (!it) {
            setPinnedAudioEntry(null);
            return;
          }
          const match = visibleEntries.find(e => e.id === it.id);
          if (match) setPinnedAudioEntry(match);
        }}
        onCardPointerEnter={clearHoverTimers}
        onCardPointerLeave={handleEntryHoverLeave}
        onOpenStage={it => {
          clearHoverTimers();
          setHoveredEntryState(null);
          const match = visibleEntries.find(e => e.id === it.id);
          if (match) handleOpenEntry(match);
          else setLightboxOpen(true);
        }}
        onSendToChora={
          onSendToChora
            ? it => {
                const match = visibleEntries.find(e => e.id === it.id);
                onSendToChora(match ? toStageMediaItem(match) : { id: it.id, name: it.name, url: it.streamUrl || it.url, fullPath: it.fullPath || it.path, mimeType: it.mimeType, size: it.size });
              }
            : undefined
        }
      />

      <ConnectedLocationModal
        open={connectorModalOpen}
        onClose={() => setConnectorModalOpen(false)}
        onSaved={created => {
          setConnectors(loadSavedConnectors());
          if (created) {
            navigateTo({ kind: 'connector', location: created, path: created.remoteDir || '/' });
          }
        }}
      />

      <input ref={fileInputRef} type="file" multiple className="hidden" />
    </div>
  );
};

export default PlajahFilesWorkspace;
