// components/files/SyncFoldersPanel.tsx — Desktop & Android Two-Way / Selective Folder Sync Client.

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  FolderSync,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import type { DriveOrg } from '../drive/PlajahDrive';
import type { DriveApi, DriveItem } from '../../services/drive/client';
import {
  joinUnifiedPath,
  parentUnifiedPath,
  type StageMediaItem,
  type SyncDirection,
  type SyncPair,
} from '../../services/files/unifiedVfs';
import {
  planSyncRun,
  type RemoteSnapshotEntry,
  type SyncBaselineEntry,
  type SyncConflict,
} from '../../services/files/syncPlanner';
import {
  isWindowsApp,
  pickWindowsFolder,
} from '../../services/windowsBridgeService';
import {
  getWindowsSyncBaseline,
  getWindowsSyncState,
  onWindowsSyncChanges,
  removeWindowsSyncPair,
  saveWindowsSyncBaseline,
  saveWindowsSyncPair,
  scanWindowsSyncPairLocal,
} from '../../services/files/windowsExplorerBridge';
import {
  getAndroidSyncBaseline,
  getAndroidSyncPairs,
  isAndroidFilesAvailable,
  pickAndroidSafFolder,
  saveAndroidSyncBaseline,
  saveAndroidSyncPairs,
  scanAndroidSyncLocal,
} from '../../services/files/androidFilesBridge';
import {
  getActiveLocalPlatform,
  readStageItemAsFile,
  saveRemoteUrlToLocal,
} from '../../services/files/nativeFileBridges';
import { guessMimeType } from '../../services/files/unifiedVfs';

const WEB_SYNC_KEY = 'plajah_sync_pairs_web_v1';

export interface SyncFoldersPanelProps {
  driveApi: DriveApi;
  orgs: DriveOrg[];
  onRefreshExplorer?: () => void;
}

export const SyncFoldersPanel: React.FC<SyncFoldersPanelProps> = ({
  driveApi,
  orgs,
  onRefreshExplorer,
}) => {
  const [pairs, setPairs] = useState<SyncPair[]>([]);
  const [activeConflicts, setActiveConflicts] = useState<Record<string, SyncConflict[]>>({});
  const [syncLog, setSyncLog] = useState<Record<string, string>>({});
  const [showAdd, setShowAdd] = useState(false);

  // Add pair form
  const [localPath, setLocalPath] = useState('');
  const [label, setLabel] = useState('');
  const [targetScopeId, setTargetScopeId] = useState<string>('personal');
  const [targetFolderLabel, setTargetFolderLabel] = useState('Synced Folder');
  const [direction, setDirection] = useState<SyncDirection>('twoWay');
  const [selectiveCsv, setSelectiveCsv] = useState('');
  const [ignoreCsv, setIgnoreCsv] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPairs = async () => {
    if (isWindowsApp()) {
      const s = await getWindowsSyncState();
      setPairs(s.pairs || []);
      return;
    }
    if (isAndroidFilesAvailable()) {
      setPairs(await getAndroidSyncPairs());
      return;
    }
    try {
      const raw = window.localStorage.getItem(WEB_SYNC_KEY);
      setPairs(raw ? JSON.parse(raw) : []);
    } catch {
      setPairs([]);
    }
  };

  useEffect(() => {
    loadPairs();
    if (!isWindowsApp()) return;
    return onWindowsSyncChanges(ev => {
      if (!ev.pairId) return;
      setSyncLog(prev => ({
        ...prev,
        [ev.pairId!]: `Local change detected (${ev.changeKind || 'updated'})`,
      }));
    });
  }, []);

  const persistPairs = async (next: SyncPair[]) => {
    setPairs(next);
    if (isAndroidFilesAvailable()) {
      await saveAndroidSyncPairs(next);
    } else if (!isWindowsApp()) {
      window.localStorage.setItem(WEB_SYNC_KEY, JSON.stringify(next));
    }
  };

  const handleBrowseLocal = async () => {
    if (isWindowsApp()) {
      const picked = await pickWindowsFolder();
      if (picked && !picked.cancelled && picked.folderPath) {
        setLocalPath(picked.folderPath);
        if (!label) setLabel(picked.folderName || picked.folderPath.split(/[\\/]/).pop() || 'Folder');
        if (targetFolderLabel === 'Synced Folder') setTargetFolderLabel(picked.folderName || 'Synced Folder');
      }
      return;
    }
    if (isAndroidFilesAvailable()) {
      const picked = await pickAndroidSafFolder();
      if (picked && !picked.cancelled && picked.root?.path) {
        setLocalPath(picked.root.path);
        if (!label) setLabel(picked.root.label || 'Android Folder');
      }
    }
  };

  const handleCreatePair = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localPath.trim()) {
      setError('Pick or enter a local folder path.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const orgId = targetScopeId === 'personal' ? undefined : targetScopeId;
      // Ensure target folder exists cleanly inside Drive root
      let targetFolderId: string | null = null;
      const cleanFolderName = targetFolderLabel.trim() || label.trim() || 'Synced';
      try {
        const rootListing = await driveApi.list(orgId, null, false);
        const existing = rootListing.items.find(i => i.kind === 'folder' && i.name.toLowerCase() === cleanFolderName.toLowerCase());
        if (existing) targetFolderId = existing.id;
        else {
          const created = await driveApi.createFolder(orgId, cleanFolderName, null);
          targetFolderId = created.id;
        }
      } catch (err: any) {
        throw new Error(err?.message || 'Could not resolve Drive destination folder');
      }

      const pair: SyncPair = {
        id: `sync_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        label: label.trim() || cleanFolderName,
        localPath: localPath.trim(),
        localKind: getActiveLocalPlatform(),
        targetKind: 'drive',
        targetScopeKind: targetScopeId === 'personal' ? 'user' : 'org',
        targetScopeId,
        targetFolderId,
        targetFolderLabel: cleanFolderName,
        direction,
        selectiveFolders: selectiveCsv
          .split(',')
          .map(s => s.trim())
          .filter(Boolean),
        ignoreGlobs: ignoreCsv
          .split(',')
          .map(s => s.trim())
          .filter(Boolean),
        enabled: true,
        status: 'idle',
      };

      if (isWindowsApp()) {
        const res = await saveWindowsSyncPair(pair);
        if (!res.success) throw new Error(res.error || 'Failed to save Windows sync pair');
        setPairs(res.pairs || [...pairs, pair]);
      } else {
        await persistPairs([...pairs, pair]);
      }
      setShowAdd(false);
      setLocalPath('');
      setLabel('');
    } catch (err: any) {
      setError(err?.message || 'Failed to add sync folder.');
    } finally {
      setSaving(false);
    }
  };

  /** Recursively collect Drive subtree entries relative to pair.targetFolderId */
  async function collectRemoteTree(orgId: string | undefined, folderId: string | null, prefix: string): Promise<RemoteSnapshotEntry[]> {
    const out: RemoteSnapshotEntry[] = [];
    const listing = await driveApi.list(orgId, folderId, false);
    for (const item of listing.items) {
      const relPath = prefix ? `${prefix}/${item.name}` : item.name;
      const isDir = item.kind === 'folder';
      out.push({
        relPath,
        id: item.id,
        isDirectory: isDir,
        size: Number(item.size || 0),
        updatedAt: Number(item.updatedAt || item.createdAt || 0),
      });
      if (isDir) {
        const sub = await collectRemoteTree(orgId, item.id, relPath);
        out.push(...sub);
      }
    }
    return out;
  }

  const runPairSync = async (pair: SyncPair) => {
    const updatePairState = async (patch: Partial<SyncPair>) => {
      const updated = { ...pair, ...patch };
      if (isWindowsApp()) {
        await saveWindowsSyncPair(updated).catch(() => {});
      }
      setPairs(prev => prev.map(p => (p.id === pair.id ? updated : p)));
      return updated;
    };

    try {
      await updatePairState({ status: 'syncing', lastError: undefined });
      setSyncLog(prev => ({ ...prev, [pair.id]: 'Scanning local & cloud snapshots…' }));

      const orgId = pair.targetScopeKind === 'org' ? pair.targetScopeId : undefined;
      const scope = orgId ? ({ kind: 'o', orgId } as const) : ({ kind: 'u' } as const);

      // 1. Scan local
      let localEntries = [];
      if (isWindowsApp()) {
        const res = await scanWindowsSyncPairLocal(pair.localPath, pair.ignoreGlobs);
        if (!res.success) throw new Error(res.error || 'Local folder scan failed');
        localEntries = res.entries || [];
      } else if (isAndroidFilesAvailable()) {
        localEntries = await scanAndroidSyncLocal(pair.localPath, pair.ignoreGlobs);
      } else {
        throw new Error('Folder sync runner requires Windows Desktop or Android APK.');
      }

      // 2. Scan remote + baseline
      const rootId = pair.targetFolderId || null;
      const remoteEntries = await collectRemoteTree(orgId, rootId, '');
      const baseline: Record<string, SyncBaselineEntry> = isWindowsApp()
        ? ((await getWindowsSyncBaseline(pair.id)).baseline || {})
        : await getAndroidSyncBaseline(pair.id);

      // 3. Plan deterministic reconciliation
      const plan = planSyncRun({
        direction: pair.direction,
        localEntries,
        remoteEntries,
        baseline,
        includedFolders: pair.selectiveFolders,
        ignoreGlobs: pair.ignoreGlobs,
        deviceTag: isWindowsApp() ? 'windows' : 'android',
      });

      const nextBaseline: Record<string, SyncBaselineEntry> = { ...baseline };
      const remoteFolderByRel = new Map<string, string>();
      for (const r of remoteEntries) {
        if (r.isDirectory) remoteFolderByRel.set(r.relPath, r.id);
      }

      const ensureRemoteParentId = async (relPath: string): Promise<string | null> => {
        const parts = relPath.split('/').slice(0, -1);
        let curId = rootId;
        let acc = '';
        for (const seg of parts) {
          acc = acc ? `${acc}/${seg}` : seg;
          const existingId = remoteFolderByRel.get(acc);
          if (existingId) {
            curId = existingId;
          } else {
            const folder = await driveApi.createFolder(orgId, seg, curId);
            remoteFolderByRel.set(acc, folder.id);
            curId = folder.id;
          }
        }
        return curId;
      };

      let done = 0;
      const totalOps = Math.max(1, plan.actions.length);

      for (const act of plan.actions) {
        done++;
        setSyncLog(prev => ({ ...prev, [pair.id]: `[${done}/${totalOps}] ${act.kind}: ${act.relPath}` }));

        if (act.kind === 'mkdir_remote') {
          await ensureRemoteParentId(`${act.relPath}/_`);
          continue;
        }

        if (act.kind === 'upload_new' || act.kind === 'upload_modified') {
          const fullLocalPath = joinUnifiedPath(pair.localPath, act.relPath.replace(/\//g, isWindowsApp() ? '\\' : '/'));
          const parentId = await ensureRemoteParentId(act.relPath);
          const name = act.relPath.split('/').pop() || act.relPath;
          const mime = guessMimeType(name);
          const item: StageMediaItem = {
            name,
            fullPath: fullLocalPath,
            folderPath: parentUnifiedPath(fullLocalPath),
            url: isWindowsApp() ? `https://localmedia.plajah/${encodeURIComponent(name)}?path=${encodeURIComponent(fullLocalPath)}` : '',
            mimeType: mime,
            size: act.local?.size,
            lastModified: act.local?.mtimeMs,
            isLocal: true,
          };
          const file = await readStageItemAsFile(item);
          const ctrl = new AbortController();
          const uploaded: DriveItem = await driveApi.upload(scope, file, parentId, () => {}, ctrl.signal);
          nextBaseline[act.relPath] = {
            relPath: act.relPath,
            localSize: act.local?.size || file.size,
            localMtimeMs: act.local?.mtimeMs || Date.now(),
            remoteId: uploaded.id,
            remoteSize: uploaded.size,
            remoteUpdatedAt: uploaded.updatedAt || Date.now(),
            syncedAt: Date.now(),
          };
        } else if (act.kind === 'download_new' || act.kind === 'download_modified') {
          if (!act.remote) continue;
          const url = await driveApi.downloadUrl(orgId, act.remote.id, false);
          const relParts = act.relPath.split('/');
          const fileName = relParts.pop() || act.relPath;
          const targetDir = relParts.length
            ? joinUnifiedPath(pair.localPath, relParts.join(isWindowsApp() ? '\\' : '/'))
            : pair.localPath;
          const saved = await saveRemoteUrlToLocal(url, targetDir, fileName);
          if (!saved.success) throw new Error(saved.error || `Download failed for ${act.relPath}`);
          nextBaseline[act.relPath] = {
            relPath: act.relPath,
            localSize: act.remote.size,
            localMtimeMs: Date.now(),
            remoteId: act.remote.id,
            remoteSize: act.remote.size,
            remoteUpdatedAt: act.remote.updatedAt,
            syncedAt: Date.now(),
          };
        } else if (act.kind === 'delete_remote' && act.remote) {
          await driveApi.trash(orgId, act.remote.id);
          delete nextBaseline[act.relPath];
        } else if (act.kind === 'conflict') {
          // Safe non-destructive conflict preservation: save remote copy under conflictCopyRelPath
          if (act.remote && act.conflictCopyRelPath) {
            const url = await driveApi.downloadUrl(orgId, act.remote.id, false);
            const relParts = act.conflictCopyRelPath.split('/');
            const fileName = relParts.pop() || act.conflictCopyRelPath;
            const targetDir = relParts.length
              ? joinUnifiedPath(pair.localPath, relParts.join(isWindowsApp() ? '\\' : '/'))
              : pair.localPath;
            await saveRemoteUrlToLocal(url, targetDir, fileName);
          }
        }
      }

      const now = Date.now();
      const status = plan.conflicts.length > 0 ? 'conflict' : 'idle';
      if (isWindowsApp()) {
        await saveWindowsSyncBaseline(pair.id, nextBaseline, status, now);
      } else {
        await saveAndroidSyncBaseline(pair.id, nextBaseline);
      }

      setActiveConflicts(prev => ({ ...prev, [pair.id]: plan.conflicts }));
      await updatePairState({
        status,
        lastSyncAt: now,
        conflictCount: plan.conflicts.length,
        pendingCount: 0,
      });

      setSyncLog(prev => ({
        ...prev,
        [pair.id]: `Done • ↑${plan.stats.uploads} ↓${plan.stats.downloads} ✕${plan.stats.deletions}${
          plan.conflicts.length ? ` • ⚠ ${plan.conflicts.length} conflict copy saved` : ''
        }`,
      }));
      onRefreshExplorer?.();
    } catch (err: any) {
      await updatePairState({ status: 'error', lastError: err?.message || 'Sync error' });
      setSyncLog(prev => ({ ...prev, [pair.id]: err?.message || 'Sync error' }));
    }
  };

  const togglePause = async (pair: SyncPair) => {
    const nextEnabled = !pair.enabled;
    const updated: SyncPair = { ...pair, enabled: nextEnabled, status: nextEnabled ? 'idle' : 'paused' };
    if (isWindowsApp()) {
      await saveWindowsSyncPair(updated);
      setPairs(p => p.map(x => (x.id === pair.id ? updated : x)));
    } else {
      await persistPairs(pairs.map(x => (x.id === pair.id ? updated : x)));
    }
  };

  const handleDeletePair = async (id: string) => {
    if (isWindowsApp()) {
      const r = await removeWindowsSyncPair(id);
      setPairs(r.pairs || pairs.filter(x => x.id !== id));
    } else {
      await persistPairs(pairs.filter(x => x.id !== id));
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2">
            <FolderSync size={18} className="text-amber-400" />
            Desktop & Device Folder Sync
          </h2>
          <p className="text-xs text-white/55">
            Two-way or selective mirror between local PC / Android folders and Plajah Drive. Conflicts never overwrite data.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(s => !s)}
          className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-1.5 cursor-pointer"
        >
          <Plus size={14} /> Add Sync Folder
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleCreatePair} className="p-4 rounded-2xl border border-amber-500/30 bg-white/[0.04] space-y-3">
          {error && <div className="p-2.5 rounded-xl bg-red-500/15 text-red-200 text-xs">{error}</div>}
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={localPath}
              onChange={e => setLocalPath(e.target.value)}
              placeholder="C:\Users\...\Projects or Android SAF URI"
              className="flex-1 px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-xs text-white font-mono"
            />
            {(isWindowsApp() || isAndroidFilesAvailable()) && (
              <button
                type="button"
                onClick={handleBrowseLocal}
                className="px-3.5 py-2 rounded-xl bg-white/12 hover:bg-white/20 text-xs font-semibold cursor-pointer"
              >
                Pick Local Folder
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] text-white/55 mb-1">Sync Label</label>
              <input
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="Studio Sessions"
                className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] text-white/55 mb-1">Cloud Pool</label>
              <select
                value={targetScopeId}
                onChange={e => setTargetScopeId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-xs text-white"
              >
                <option value="personal">My Plajah Drive</option>
                {orgs.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.name} (Team Pool)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-white/55 mb-1">Cloud Folder Name</label>
              <input
                value={targetFolderLabel}
                onChange={e => setTargetFolderLabel(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-xs text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] text-white/55 mb-1">Direction</label>
              <select
                value={direction}
                onChange={e => setDirection(e.target.value as SyncDirection)}
                className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-xs text-white"
              >
                <option value="twoWay">Two-Way Sync (Default)</option>
                <option value="uploadOnly">Upload Only (Backup PC → Cloud)</option>
                <option value="downloadOnly">Download Only (Cloud → Device)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-white/55 mb-1">Selective Subfolders (optional)</label>
              <input
                value={selectiveCsv}
                onChange={e => setSelectiveCsv(e.target.value)}
                placeholder="Masters, Exports"
                className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] text-white/55 mb-1">Ignore Globs (optional)</label>
              <input
                value={ignoreCsv}
                onChange={e => setIgnoreCsv(e.target.value)}
                placeholder="*.bak, node_modules/**"
                className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-xs text-white"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowAdd(false)} className="px-3 py-1.5 rounded-xl bg-white/10 text-xs cursor-pointer">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-4 py-1.5 rounded-xl bg-amber-500 text-black font-bold text-xs cursor-pointer">
              {saving ? 'Connecting…' : 'Create Sync Pair'}
            </button>
          </div>
        </form>
      )}

      {pairs.length === 0 ? (
        <div className="p-8 rounded-2xl border border-white/10 bg-white/[0.02] text-center space-y-2">
          <ArrowLeftRight size={28} className="mx-auto text-white/30" />
          <div className="text-sm font-semibold">No synced folders configured</div>
          <p className="text-xs text-white/50 max-w-md mx-auto">
            Pair any folder on your Windows PC or Android device with a Plajah Drive folder for selective two-way sync.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pairs.map(p => (
            <div key={p.id} className="p-4 rounded-2xl border border-white/10 bg-white/[0.04] space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-bold flex items-center gap-2">
                    <span>{p.label}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/10 text-white/75">
                      {p.direction === 'twoWay' ? 'Two-Way' : p.direction === 'uploadOnly' ? 'Backup Up' : 'Mirror Down'}
                    </span>
                    {p.status === 'syncing' && (
                      <span className="text-[11px] text-amber-300 flex items-center gap-1">
                        <RefreshCw size={11} className="animate-spin" /> Syncing
                      </span>
                    )}
                    {p.status === 'conflict' && (
                      <span className="text-[11px] text-amber-300 flex items-center gap-1">
                        <AlertTriangle size={11} /> Conflict copy saved
                      </span>
                    )}
                    {p.status === 'idle' && p.lastSyncAt && (
                      <span className="text-[11px] text-emerald-300 flex items-center gap-1">
                        <CheckCircle2 size={11} /> Up to date
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-white/50 font-mono truncate">
                    {p.localPath} ⇄ Cloud/{p.targetFolderLabel}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => runPairSync(p)}
                    disabled={p.status === 'syncing'}
                    className="px-3 py-1.5 rounded-xl bg-amber-500 text-black font-semibold text-xs hover:bg-amber-400 disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw size={13} /> Sync Now
                  </button>
                  <button
                    onClick={() => togglePause(p)}
                    className="p-1.5 rounded-xl bg-white/10 hover:bg-white/15 cursor-pointer"
                    title={p.enabled ? 'Pause watcher' : 'Resume watcher'}
                  >
                    {p.enabled ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                  <button
                    onClick={() => handleDeletePair(p.id)}
                    className="p-1.5 rounded-xl hover:bg-red-500/20 text-white/50 hover:text-red-300 cursor-pointer"
                    title="Unlink sync pair (keeps files on both sides)"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {(syncLog[p.id] || p.lastError) && (
                <div className="text-[11px] font-mono text-white/65 bg-black/35 rounded-lg px-2.5 py-1.5">
                  {syncLog[p.id] || p.lastError}
                </div>
              )}

              {(activeConflicts[p.id] || []).length > 0 && (
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-1 text-[11px]">
                  <div className="font-semibold text-amber-300">Saved Conflict Copies:</div>
                  {(activeConflicts[p.id] || []).map(c => (
                    <div key={c.relPath} className="font-mono text-white/75">
                      {c.relPath} → kept local + downloaded cloud as {c.conflictCopyRelPath}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SyncFoldersPanel;
