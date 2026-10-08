// AmboTemplateLibraryTabs — Platform | My templates | Shared with me | Community.
//
// useTemplateLibrary loads the three saved-template lists (live-refreshed via
// subscribeTemplateLibrary and auth changes, errors captured per list so an
// offline / permission failure shows a message and never crashes the gallery).
// SavedTemplateGrid draws the tiles with owner actions: rename, visibility,
// share and delete (in-page confirm).
import React, { useCallback, useEffect, useState } from 'react';
import { LayoutTemplate, User, Users, Globe, Lock, Pencil, Trash2, Loader2, AlertTriangle, Check, X } from 'lucide-react';
import { auth } from '../../services/backendService';
import {
  listMyTemplates, listSharedWithMe, listCommunityTemplates, subscribeTemplateLibrary, saveTemplate, deleteTemplate,
  type SavedTemplate, type TemplateKind, type TemplateVisibility,
} from '../../services/ambo/templateLibrary';
import { AmboShareDialog } from './AmboShareDialog';

const LILAC = '#D0BCFF', CYAN = '#00DAF3';

export type LibTab = 'platform' | 'mine' | 'shared' | 'community';
type SavedTab = Exclude<LibTab, 'platform'>;

export const currentUid = (): string => auth.currentUser?.uid || 'local';
export const isMine = (t: SavedTemplate | null | undefined): boolean => !!t && t.ownerUid === currentUid();

function errText(e: any): string {
  const code = e?.code || '';
  if (code === 'permission-denied' || /permission/i.test(String(e?.message))) return 'You don’t have permission to read these templates.';
  if (code === 'unavailable' || (typeof navigator !== 'undefined' && navigator.onLine === false)) return 'Offline — saved templates will appear when you reconnect.';
  if (code === 'failed-precondition') return 'This list needs a database index that isn’t ready yet.';
  return `Couldn’t load: ${e?.message || e}`;
}

export interface TemplateLibraryState {
  mine: SavedTemplate[]; shared: SavedTemplate[]; community: SavedTemplate[];
  loading: Record<SavedTab, boolean>; errors: Partial<Record<SavedTab, string>>;
  signedIn: boolean; refresh: () => void;
}

export function useTemplateLibrary(kind: TemplateKind, enabled: boolean): TemplateLibraryState {
  const [mine, setMine] = useState<SavedTemplate[]>([]);
  const [shared, setShared] = useState<SavedTemplate[]>([]);
  const [community, setCommunity] = useState<SavedTemplate[]>([]);
  const [loading, setLoading] = useState<Record<SavedTab, boolean>>({ mine: false, shared: false, community: false });
  const [errors, setErrors] = useState<Partial<Record<SavedTab, string>>>({});
  const [signedIn, setSignedIn] = useState(() => !!auth.currentUser);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    if (!enabled) return;
    const off1 = subscribeTemplateLibrary(refresh);
    let off2: (() => void) | undefined;
    try { off2 = (auth as any).onAuthStateChanged?.((u: any) => { setSignedIn(!!u); refresh(); }); } catch { /* */ }
    const onOnline = () => refresh();
    window.addEventListener('online', onOnline);
    return () => { off1(); off2?.(); window.removeEventListener('online', onOnline); };
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const run = (tab: SavedTab, fn: () => Promise<SavedTemplate[]>, set: (r: SavedTemplate[]) => void) => {
      setLoading(l => ({ ...l, [tab]: true }));
      fn().then(r => { if (alive) { set(r); setErrors(e => ({ ...e, [tab]: undefined })); } })
        .catch(e => { if (alive) setErrors(x => ({ ...x, [tab]: errText(e) })); })
        .finally(() => { if (alive) setLoading(l => ({ ...l, [tab]: false })); });
    };
    run('mine', () => listMyTemplates(kind), setMine);
    run('shared', () => listSharedWithMe(kind), setShared);
    run('community', () => listCommunityTemplates(kind), setCommunity);
    return () => { alive = false; };
  }, [enabled, kind, tick, signedIn]);

  return { mine, shared, community, loading, errors, signedIn, refresh };
}

const TAB_META: Record<LibTab, { label: string; Icon: typeof User }> = {
  platform: { label: 'Platform', Icon: LayoutTemplate },
  mine: { label: 'My templates', Icon: User },
  shared: { label: 'Shared with me', Icon: Users },
  community: { label: 'Community', Icon: Globe },
};

export const LibraryTabBar: React.FC<{ tab: LibTab; onTab: (t: LibTab) => void; lib: TemplateLibraryState; tabs?: LibTab[]; labels?: Partial<Record<LibTab, string>>; size?: 'md' | 'sm' }> = ({ tab, onTab, lib, tabs = ['platform', 'mine', 'shared', 'community'], labels = {}, size = 'md' }) => (
  <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ background: 'rgba(255,255,255,.05)' }} role="tablist">
    {tabs.map(t => {
      const { Icon } = TAB_META[t];
      const n = t === 'platform' ? null : lib[t].length;
      const on = tab === t;
      return (
        <button key={t} role="tab" aria-selected={on} data-libtab={t} onClick={() => onTab(t)}
          className={`${size === 'sm' ? 'px-1.5 py-0.5 text-[9.5px]' : 'px-2.5 py-1 text-[10.5px]'} rounded-md font-bold inline-flex items-center gap-1 transition-all`}
          style={{ color: on ? '#0b0a12' : 'rgba(255,255,255,.65)', background: on ? LILAC : 'transparent' }}>
          <Icon size={size === 'sm' ? 10 : 12} />{labels[t] || TAB_META[t].label}
          {n !== null && n > 0 && <span className="text-[9px] font-mono opacity-60">{n}</span>}
          {t !== 'platform' && lib.loading[t] && <Loader2 size={9} className="animate-spin opacity-60" />}
        </button>
      );
    })}
  </div>
);

const VIS_ICON: Record<TemplateVisibility, typeof Lock> = { private: Lock, shared: Users, public: Globe };
const VIS_LABEL: Record<TemplateVisibility, string> = { private: 'Private', shared: 'Shared', public: 'Community' };

/** One saved-template tile with owner actions. */
const SavedTile: React.FC<{
  t: SavedTemplate; selected: boolean; subtitle: string; onOpen: () => void; onShare: () => void; compact?: boolean;
  renderThumb?: (t: SavedTemplate) => React.ReactNode; onError: (msg: string) => void;
}> = ({ t, selected, subtitle, onOpen, onShare, compact, renderThumb, onError }) => {
  const mine = isMine(t);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(t.name);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const signedIn = !!auth.currentUser;
  const VIcon = VIS_ICON[t.visibility] || Lock;
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); } catch (e: any) { onError(e?.code === 'permission-denied' ? 'Only the owner can change this template.' : `Couldn’t update: ${e?.message || e}`); }
    finally { setBusy(false); }
  };
  const owner = mine ? 'You' : t.ownerName || 'Plajah creator';
  return (
    <div className={`rounded-xl ${compact ? 'p-1.5 w-[168px] flex-none' : 'p-2'} text-left transition-all relative`} data-saved-tile={t.id}
      style={{ border: `1px solid ${selected ? CYAN : 'rgba(255,255,255,.08)'}`, background: selected ? 'rgba(0,218,243,.08)' : 'rgba(255,255,255,.03)' }}>
      <button onClick={onOpen} className="block w-full text-left" title={t.description || `Open “${t.name}”`} data-saved-open>
        <div className="relative rounded-md overflow-hidden grid place-items-center" style={{ height: compact ? 86 : 104, background: '#0c0a14' }}>
          {t.thumb ? <img src={t.thumb} alt="" className="max-w-full max-h-full object-contain" draggable={false} /> : renderThumb ? renderThumb(t) : <LayoutTemplate size={22} className="text-white/20" />}
          <span className="absolute top-1 left-1 text-[8.5px] font-bold px-1 py-0.5 rounded inline-flex items-center gap-0.5" style={{ background: 'rgba(8,6,16,.78)', color: t.visibility === 'private' ? 'rgba(255,255,255,.6)' : CYAN }}>
            <VIcon size={9} />{VIS_LABEL[t.visibility]}
          </span>
          {!!t.uses && <span className="absolute top-1 right-1 text-[8.5px] font-mono px-1 py-0.5 rounded" style={{ background: 'rgba(8,6,16,.78)', color: 'rgba(255,255,255,.7)' }}>{t.uses} use{t.uses === 1 ? '' : 's'}</span>}
        </div>
      </button>
      {renaming ? (
        <div className="mt-1.5 flex items-center gap-1">
          <input autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={80} data-rename-input
            onKeyDown={e => { if (e.key === 'Enter' && name.trim()) { void act(() => saveTemplate({ ...t, name: name.trim() })); setRenaming(false); } if (e.key === 'Escape') { e.stopPropagation(); setRenaming(false); setName(t.name); } }}
            className="flex-1 min-w-0 bg-white/5 border border-white/15 rounded px-1.5 py-0.5 text-[11px] outline-none" />
          <button onClick={() => { if (name.trim()) void act(() => saveTemplate({ ...t, name: name.trim() })); setRenaming(false); }} className="w-5 h-5 grid place-items-center rounded hover:bg-white/10" aria-label="Save name"><Check size={11} style={{ color: CYAN }} /></button>
          <button onClick={() => { setRenaming(false); setName(t.name); }} className="w-5 h-5 grid place-items-center rounded hover:bg-white/10" aria-label="Cancel rename"><X size={11} /></button>
        </div>
      ) : (
        <div className="mt-1.5 min-w-0">
          <div className="text-[11px] font-bold truncate">{t.name}</div>
          <div className="text-[9px] text-white/40 truncate">{owner} · {subtitle}</div>
        </div>
      )}
      {mine && !renaming && (
        confirmDel ? (
          <div className="mt-1 flex items-center gap-1 text-[9.5px]" data-confirm-delete>
            <span className="text-[#FF8A8A] font-bold flex-1">Delete for good?</span>
            <button disabled={busy} onClick={() => void act(() => deleteTemplate(t.id))} data-confirm-yes className="px-1.5 py-0.5 rounded font-bold" style={{ background: 'rgba(255,90,90,.2)', color: '#FF8A8A' }}>Delete</button>
            <button onClick={() => setConfirmDel(false)} className="px-1.5 py-0.5 rounded font-bold bg-white/5 text-white/70">Keep</button>
          </div>
        ) : (
          <div className="mt-1 flex items-center gap-0.5">
            <button onClick={() => { setName(t.name); setRenaming(true); }} title="Rename" className="w-6 h-6 grid place-items-center rounded hover:bg-white/10 text-white/55"><Pencil size={11} /></button>
            {signedIn && <button onClick={onShare} title="Share with people" data-share-open className="w-6 h-6 grid place-items-center rounded hover:bg-white/10 text-white/55"><Users size={11} /></button>}
            {signedIn ? (
              <select value={t.visibility} disabled={busy} title="Who can use it" data-vis-select
                onChange={e => { const v = e.target.value as TemplateVisibility; if (v === 'shared' && !(t.sharedWith || []).length) { onShare(); return; } void act(() => saveTemplate({ ...t, visibility: v })); }}
                className="min-w-0 flex-1 bg-white/5 border border-white/10 rounded px-1 py-0.5 text-[9.5px] text-white/75">
                <option value="private">Private</option><option value="shared">Shared</option><option value="public">Community</option>
              </select>
            ) : <span className="flex-1 text-[8.5px] text-white/30 truncate px-1">This browser only</span>}
            <button onClick={() => setConfirmDel(true)} title="Delete" data-delete className="w-6 h-6 grid place-items-center rounded hover:bg-white/10 text-white/55 hover:text-[#FF8A8A]"><Trash2 size={11} /></button>
            {busy && <Loader2 size={11} className="animate-spin text-white/40" />}
          </div>
        )
      )}
    </div>
  );
};

export interface SavedTemplateGridProps {
  tab: SavedTab;
  lib: TemplateLibraryState;
  selectedId?: string;
  onOpen: (t: SavedTemplate) => void;
  subtitle: (t: SavedTemplate) => string;
  renderThumb?: (t: SavedTemplate) => React.ReactNode;
  filter?: string;
  /** Horizontal strip (scripture looks) instead of a grid. */
  compact?: boolean;
  noun?: string;
  shareWhere?: string;
}

export const SavedTemplateGrid: React.FC<SavedTemplateGridProps> = ({ tab, lib, selectedId, onOpen, subtitle, renderThumb, filter = '', compact, noun = 'templates', shareWhere }) => {
  const [shareT, setShareT] = useState<SavedTemplate | null>(null);
  const [actionErr, setActionErr] = useState('');
  const all = lib[tab];
  const q = filter.trim().toLowerCase();
  const items = q ? all.filter(t => [t.name, t.description, t.ownerName, ...(t.tags || [])].some(s => String(s || '').toLowerCase().includes(q))) : all;
  const err = lib.errors[tab];
  const msg = (() => {
    if (tab === 'shared' && !lib.signedIn) return `Sign in to see ${noun} people share with you.`;
    if (err) return null;
    if (lib.loading[tab] && !all.length) return 'Loading…';
    if (!all.length) {
      if (tab === 'mine') return lib.signedIn ? `No saved ${noun} yet — customise one and choose “Save as my template”.` : `No saved ${noun} yet. Signed out, they’re kept in this browser only — sign in to keep them on your account and share them.`;
      if (tab === 'shared') return `Nothing shared with you yet. When someone shares, it shows up here.`;
      return `No community ${noun} yet — set one of yours to Community to be the first.`;
    }
    if (!items.length) return `No ${noun} match “${filter}”.`;
    return null;
  })();
  const banner = (err || actionErr) && (
    <div className={`${compact ? '' : 'col-span-full'} text-[10.5px] rounded-md px-2 py-1.5 flex items-start gap-1.5`} style={{ color: '#FFB547', background: 'rgba(255,181,71,.08)' }} data-lib-error>
      <AlertTriangle size={12} className="flex-none mt-px" /><span className="flex-1">{actionErr || err}</span>
      {actionErr ? <button onClick={() => setActionErr('')} className="font-bold">Dismiss</button> : <button onClick={lib.refresh} className="font-bold">Retry</button>}
    </div>
  );
  const localNote = tab === 'mine' && !lib.signedIn && all.length > 0 && (
    <div className={`${compact ? '' : 'col-span-full'} text-[9.5px] text-white/40`}>Signed out — these are saved in this browser only.</div>
  );
  return (<>
    {compact ? (
      <div className="flex flex-col gap-1.5">
        {banner}{localNote}
        {msg ? <div className="text-[10.5px] text-white/40 py-2">{msg}</div> : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {items.map(t => <SavedTile key={t.id} t={t} compact selected={t.id === selectedId} subtitle={subtitle(t)} onOpen={() => onOpen(t)} onShare={() => setShareT(t)} renderThumb={renderThumb} onError={setActionErr} />)}
          </div>
        )}
      </div>
    ) : (<>
      {banner}{localNote}
      {msg && <div className="col-span-full text-[11px] text-white/40 p-6 text-center" data-lib-empty>{msg}</div>}
      {!msg && items.map(t => <SavedTile key={t.id} t={t} selected={t.id === selectedId} subtitle={subtitle(t)} onOpen={() => onOpen(t)} onShare={() => setShareT(t)} renderThumb={renderThumb} onError={setActionErr} />)}
    </>)}
    <AmboShareDialog template={shareT} where={shareWhere} onClose={() => setShareT(null)} />
  </>);
};
