// components/creative/CreativeCloudPanels.tsx — shared cloud UI for every creative tool:
// a sync status pill, a version-history panel (name, restore, delete), and a storage meter.
// Tools pass their kind + local id and how to apply a restored JSON; the cloud store does the rest.

import React, { useCallback, useEffect, useState } from 'react';
import { Cloud, CloudOff, History, Loader2, RotateCcw, Tag, Trash2 } from 'lucide-react';
import {
  CREATIVE_SYNC_EVENT,
  deleteVersion,
  getCloudHead,
  listVersions,
  loadVersionJson,
  nameCurrentVersion,
  syncCreativeProject,
  type CloudHead,
  type CloudVersion,
  type CreativeSyncDetail,
  type SyncState,
} from '../../services/creativeCloud/cloudStore';
import { describeReason } from '../../services/creativeCloud/history';
import { formatBytes } from '../../services/creativeCloud/policy';
import { useCreativeStorageUsage } from '../../services/creativeCloud/usage';

const lbl = 'text-[.6rem] font-extrabold uppercase tracking-[.14em] text-white/40';
const btn = 'h-7 px-2 rounded-[8px] text-[.64rem] font-bold flex items-center justify-center gap-1 border border-white/10 bg-white/[0.05] hover:bg-white/[0.1] text-white/80 disabled:opacity-40';

/** Live cloud sync state for one project. */
export function useCreativeSyncState(kind: string, localId: string | undefined): SyncState | 'idle' {
  const [state, setState] = useState<SyncState | 'idle'>('idle');
  useEffect(() => {
    setState('idle');
    const on = (e: Event) => {
      const d = (e as CustomEvent<CreativeSyncDetail>).detail;
      if (d?.kind === kind && d.localId === localId) setState(d.state);
    };
    window.addEventListener(CREATIVE_SYNC_EVENT, on);
    return () => window.removeEventListener(CREATIVE_SYNC_EVENT, on);
  }, [kind, localId]);
  return state;
}

const SYNC_LABEL: Record<SyncState | 'idle', string> = {
  idle: 'Saved',
  syncing: 'Saving to cloud…',
  synced: 'Saved to cloud',
  offline: 'Offline · saved on this device',
  guest: 'Saved on this device · sign in to sync',
  'over-quota': 'Storage full · saved on this device',
  error: "Couldn't reach the cloud · saved on this device",
};

export const CreativeSyncPill: React.FC<{ kind: string; localId?: string }> = ({ kind, localId }) => {
  const state = useCreativeSyncState(kind, localId);
  const ok = state === 'synced' || state === 'idle';
  const Icon = state === 'syncing' ? Loader2 : ok ? Cloud : CloudOff;
  return (
    <span
      className="inline-flex items-center gap-1 text-[9.5px] font-bold"
      style={{ color: state === 'error' || state === 'over-quota' ? '#fca5a5' : ok ? '#6ee7b7' : 'rgba(255,255,255,0.55)' }}
      title={SYNC_LABEL[state]}
    >
      <Icon size={11} className={state === 'syncing' ? 'animate-spin' : undefined} />
      {SYNC_LABEL[state]}
    </span>
  );
};

export const CreativeStorageMeter: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const { usage } = useCreativeStorageUsage();
  if (!usage) return null;
  const pct = usage.limitBytes ? Math.min(100, (usage.countedBytes / usage.limitBytes) * 100) : 0;
  const over = usage.countedBytes > usage.limitBytes;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[9.5px] text-white/55">
        <span>
          Creative storage {formatBytes(usage.countedBytes)} of {formatBytes(usage.limitBytes)}
          {usage.plus ? ' · Plajah+' : ''}
        </span>
        {!compact && <span>{pct.toFixed(0)}%</span>}
      </div>
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.max(1, pct)}%`, background: over ? '#f87171' : pct > 85 ? '#fbbf24' : '#00DAF3' }} />
      </div>
      {!compact && (
        <div className="text-[9px] text-white/35">
          Music, film and book releases don't count.{over && !usage.enforced ? ' Over the free allowance; nothing is blocked yet.' : ''}
        </div>
      )}
    </div>
  );
};

export interface VersionHistoryProps {
  kind: string;
  localId: string;
  title: string;
  /** The project as currently stored locally (what gets kept before a restore). */
  getCurrentJson: () => string | Promise<string>;
  /** Apply a restored version as the project's current state. */
  onRestore: (json: string) => void | Promise<void>;
}

export const CreativeVersionHistory: React.FC<VersionHistoryProps> = ({ kind, localId, title, getCurrentJson, onRestore }) => {
  const [versions, setVersions] = useState<CloudVersion[] | null>(null);
  const [head, setHead] = useState<CloudHead | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const syncState = useCreativeSyncState(kind, localId);

  const refresh = useCallback(async () => {
    try {
      const [h, v] = await Promise.all([getCloudHead(kind, localId), listVersions(kind, localId)]);
      setHead(h);
      setVersions(v);
      setError(null);
    } catch {
      setVersions([]);
      setError('Version history needs you to be signed in and online.');
    }
  }, [kind, localId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (syncState === 'synced') void refresh();
  }, [syncState, refresh]);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  const nameNow = () =>
    run('name', async () => {
      // Upload what's on screen first so the name lands on the latest edit.
      const r = await syncCreativeProject({ kind, localId, title, json: await getCurrentJson() });
      if (r.state !== 'synced') throw new Error(SYNC_LABEL[r.state]);
      await nameCurrentVersion(kind, localId, name || new Date().toLocaleString());
      setName('');
    });

  const restore = (v: CloudVersion) =>
    run(v.id, async () => {
      const json = await loadVersionJson(v);
      // Keep the current state in history before replacing it.
      const r = await syncCreativeProject({ kind, localId, title, json: await getCurrentJson() });
      if (r.state === 'synced') await nameCurrentVersion(kind, localId, 'Before restore', 'before-restore');
      await onRestore(json);
    });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className={`${lbl} flex items-center gap-1`}>
          <History size={11} /> Version history
        </span>
        <CreativeSyncPill kind={kind} localId={localId} />
      </div>

      <div className="flex items-center gap-1.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name this version"
          className="flex-1 min-w-0 h-7 px-2 rounded-[8px] text-[.66rem] text-white/85 outline-none"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)' }}
          onKeyDown={(e) => e.key === 'Enter' && void nameNow()}
        />
        <button className={btn} disabled={!!busy} onClick={() => void nameNow()}>
          {busy === 'name' ? <Loader2 size={11} className="animate-spin" /> : <Tag size={11} />} Save
        </button>
      </div>

      {error && <div className="text-[10px] text-red-300">{error}</div>}
      {head && (
        <div className="text-[9.5px] text-white/45">
          Current · {new Date(head.updatedAt).toLocaleString()}
          {head.updatedByDeviceLabel ? ` · ${head.updatedByDeviceLabel}` : ''} · {formatBytes(head.sizeBytes)}
        </div>
      )}
      {versions === null && <div className="text-[10px] text-white/40">Loading…</div>}
      {versions?.length === 0 && !error && (
        <div className="text-[10px] text-white/40">Autosave keeps a version every 10 minutes while you work. Named versions are kept forever.</div>
      )}
      <div className="flex flex-col gap-1">
        {versions?.map((v) => (
          <div key={v.id} className="flex items-center gap-1.5 px-2 py-1.5 rounded-[8px]" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex-1 min-w-0">
              <div className="text-[.66rem] font-bold text-white/85 truncate">{v.label || describeReason(v.reason)}</div>
              <div className="text-[9px] text-white/40 truncate">
                {new Date(v.createdAt).toLocaleString()}
                {v.deviceLabel ? ` · ${v.deviceLabel}` : ''}
                {v.label && v.reason !== 'named' ? ` · ${describeReason(v.reason)}` : ''}
              </div>
            </div>
            <button
              className={btn}
              disabled={!!busy}
              title="Restore this version"
              onClick={() => {
                if (window.confirm('Restore this version? Your current work is kept in history first.')) void restore(v);
              }}
            >
              {busy === v.id ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
            </button>
            {v.reason !== 'publish' && (
              <button
                className={btn}
                disabled={!!busy}
                title="Delete this version"
                onClick={() => {
                  if (window.confirm('Delete this version from history?')) void run(`del-${v.id}`, () => deleteVersion(kind, localId, v));
                }}
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
