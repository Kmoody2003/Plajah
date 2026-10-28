// components/collab/CollabHistory.tsx — shared history and your own saved versions.
//
// Every version can be previewed as a list of what restoring it would change, element by element,
// and restored whole or only in part ("bring back just the cover page"). Restores are themselves
// undoable: the state just before is always saved first.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bookmark, Check, ChevronLeft, Eye, Loader2, Lock, Pencil, RotateCcw, Save, Trash2 } from 'lucide-react';
import { auth } from '../../services/firebase';
import { formatBytes } from '../../services/creativeCloud/policy';
import type { CoeditSession, VersionMeta } from '../../services/coedit/session';
import type { ChangeGroup } from '../../services/coedit/labels';
import { PersonDot } from './CollabPeople';
import { ago, btn, btnPrimary, card, input, lbl } from './collabUi';

type Filter = 'all' | 'named' | 'mine';

const REASON: Record<VersionMeta['reason'], string> = {
  checkpoint: 'Autosave',
  named: 'Named version',
  personal: 'My copy',
  'before-restore': 'Before a restore',
  'before-publish': 'Before a draft was shared',
  import: 'Imported',
};

export const CollabHistory: React.FC<{ session: CoeditSession<any>; canEdit: boolean }> = ({ session, canEdit }) => {
  const [versions, setVersions] = useState<VersionMeta[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [naming, setNaming] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<VersionMeta | null>(null);
  const uid = auth.currentUser?.uid;

  const reload = useCallback(() => {
    void session.listVersions().then(setVersions, () => setVersions([]));
  }, [session]);
  useEffect(reload, [reload]);

  const shown = useMemo(
    () =>
      (versions ?? []).filter((v) =>
        filter === 'named' ? v.reason !== 'checkpoint' : filter === 'mine' ? v.by === uid || v.contributors?.includes(uid ?? '') : true
      ),
    [versions, filter, uid]
  );

  const save = async (reason: 'named' | 'personal') => {
    setBusy(reason);
    try {
      await session.saveVersion(reason, naming.trim() || (reason === 'personal' ? 'My copy' : 'Named version'));
      setNaming('');
      reload();
    } finally {
      setBusy(null);
    }
  };

  if (open) return <VersionDetail session={session} version={open} canEdit={canEdit} onBack={() => (setOpen(null), reload())} />;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="p-3 flex flex-col gap-2 border-b border-white/[0.06]">
        <input className={input} placeholder="Name this moment (e.g. “Sent to pastor”)" value={naming} onChange={(e) => setNaming(e.target.value)} />
        <div className="flex gap-1.5">
          {canEdit && (
            <button className={btnPrimary} disabled={!!busy} onClick={() => void save('named')} title="Everyone on the project sees this version">
              {busy === 'named' ? <Loader2 size={12} className="animate-spin" /> : <Bookmark size={12} />} Save version
            </button>
          )}
          <button className={btn} disabled={!!busy} onClick={() => void save('personal')} title="Only you see this copy — includes your draft">
            {busy === 'personal' ? <Loader2 size={12} className="animate-spin" /> : <Lock size={11} />} Save my copy
          </button>
        </div>
        <div className="flex gap-1">
          {(['all', 'named', 'mine'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`h-6 px-2 rounded-full text-[.6rem] font-bold ${filter === f ? 'bg-white/15 text-white' : 'text-white/45 hover:text-white/80'}`}>
              {f === 'all' ? 'All' : f === 'named' ? 'Named' : 'Mine'}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 flex flex-col gap-1">
        {versions == null && (
          <div className="p-4 text-center text-white/40">
            <Loader2 size={14} className="animate-spin inline" />
          </div>
        )}
        {versions && shown.length === 0 && <div className="p-4 text-[.68rem] text-white/40 text-center">No versions yet. Autosaves appear every ten minutes while people work.</div>}
        {shown.map((v) => (
          <button key={v.id} onClick={() => setOpen(v)} className="text-left flex items-start gap-2 px-2 py-1.5 rounded-[8px] hover:bg-white/[0.05]">
            <PersonDot uid={v.by} name={v.byName} size={20} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[.7rem] font-bold text-white truncate">{v.label || REASON[v.reason]}</span>
                {v.private && <Lock size={9} className="text-white/40 shrink-0" />}
              </div>
              <div className="text-[.6rem] text-white/45 truncate">
                {new Date(v.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {v.byName}
                {v.label ? ` · ${REASON[v.reason]}` : ''}
              </div>
              {v.summary && <div className="text-[.6rem] text-white/35 truncate">{v.summary}</div>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

const VersionDetail: React.FC<{ session: CoeditSession<any>; version: VersionMeta; canEdit: boolean; onBack: () => void }> = ({ session, version, canEdit, onBack }) => {
  const [groups, setGroups] = useState<ChangeGroup[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState(version.label ?? '');
  const [editing, setEditing] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    let alive = true;
    void session.loadVersion(version).then(
      (old) => alive && setGroups(session.compare(old)),
      () => alive && setGroups([])
    );
    return () => {
      alive = false;
    };
  }, [session, version]);

  const restore = async (only?: ChangeGroup[]) => {
    setBusy(true);
    try {
      await session.restore(version, only?.map((g) => g.target));
      setDone(only ? `Restored ${only.length} part${only.length === 1 ? '' : 's'}.` : 'Restored for everyone.');
      setPicked(new Set());
      setGroups(session.compare(await session.loadVersion(version)));
    } finally {
      setBusy(false);
    }
  };

  const verb = (g: ChangeGroup) => (g.kinds.has('added') ? 'Bring back' : g.kinds.has('removed') ? 'Remove' : 'Revert');

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="p-3 flex flex-col gap-2 border-b border-white/[0.06]">
        <button onClick={onBack} className="self-start text-[.64rem] font-bold text-white/55 hover:text-white flex items-center gap-0.5">
          <ChevronLeft size={12} /> History
        </button>
        {editing ? (
          <div className="flex gap-1.5">
            <input className={input} value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
            <button
              className={btn}
              onClick={async () => {
                await session.renameVersion(version, label);
                version.label = label;
                setEditing(false);
              }}
            >
              <Check size={12} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <div className="text-[.82rem] font-extrabold text-white truncate flex-1">{version.label || REASON[version.reason]}</div>
            {(version.by === uid || canEdit) && (
              <button className="text-white/40 hover:text-white" title="Rename" onClick={() => setEditing(true)}>
                <Pencil size={12} />
              </button>
            )}
            {version.by === uid && (
              <button
                className="text-white/40 hover:text-red-300"
                title="Delete this version"
                onClick={async () => {
                  if (!confirm('Delete this saved version?')) return;
                  await session.deleteVersion(version);
                  onBack();
                }}
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        )}
        <div className="text-[.62rem] text-white/45">
          {version.byName} · {ago(version.at)} · {formatBytes(version.size)}
          {version.private ? ' · only you' : ''}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-2">
        {done && <div className="text-[.66rem] text-emerald-300 font-bold">{done} The state before was saved to history.</div>}
        <div className={lbl}>Restoring this would change</div>
        {groups == null && <Loader2 size={14} className="animate-spin text-white/40" />}
        {groups && groups.length === 0 && <div className="text-[.68rem] text-white/45">Nothing — the project already matches this version.</div>}
        {groups?.map((g) => (
          <label key={g.key} className={`${card} px-2 py-1.5 flex items-center gap-2 cursor-pointer`}>
            <input
              type="checkbox"
              className="accent-[var(--pj-cyan,#00DAF3)]"
              checked={picked.has(g.key)}
              disabled={!canEdit}
              onChange={() =>
                setPicked((s) => {
                  const n = new Set(s);
                  n.has(g.key) ? n.delete(g.key) : n.add(g.key);
                  return n;
                })
              }
            />
            <span className="text-[.6rem] font-extrabold uppercase tracking-wider text-white/45 w-[64px] shrink-0">{verb(g)}</span>
            <span className="text-[.7rem] text-white/85 truncate">{g.label}</span>
          </label>
        ))}
      </div>

      {canEdit && !!groups?.length && (
        <div className="p-3 border-t border-white/[0.06] flex gap-1.5">
          <button className={btn} disabled={busy || !picked.size} onClick={() => void restore(groups.filter((g) => picked.has(g.key)))}>
            <Eye size={11} /> Restore selected
          </button>
          <button className={`${btnPrimary} ml-auto`} disabled={busy} onClick={() => confirm('Restore this whole version for everyone? The current state is saved first.') && void restore()}>
            {busy ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} Restore all
          </button>
        </div>
      )}
      {!canEdit && (
        <div className="p-3 border-t border-white/[0.06]">
          <p className="text-[.62rem] text-white/45 leading-relaxed">
            <Save size={10} className="inline mr-1" />
            You can view this version. Ask an editor to restore it, or use “Save my copy” to keep the current project for yourself.
          </p>
        </div>
      )}
    </div>
  );
};
