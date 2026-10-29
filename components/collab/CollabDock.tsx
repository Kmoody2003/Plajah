// components/collab/CollabDock.tsx — the collaboration side panel for every creative editor
// (Tela, Chora, Fabula, Pixels…). Mount it once next to the editor with the hook's result:
//
//   const co = useCoedit({ kind: 'tela', localId, title, doc, applyRemote });
//   <CollabDock co={co} title={title} />
//
// It shows a presence pill (who's here, sync state) and opens a panel with People, Chat (the
// project's team room on the platform chat stack), Call (rtcCore, same call as Chat), History
// (shared + private versions, partial restore) and Activity (live changes and anything that needs
// a decision: "Jordan changed this right after you — keep mine?").

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { doc as fsDoc, onSnapshot } from 'firebase/firestore';
import {
  Activity as ActivityIcon,
  AlertTriangle,
  Check,
  Cloud,
  CloudOff,
  GitBranch,
  History,
  Loader2,
  MessageSquare,
  PanelRightClose,
  Phone,
  Redo2,
  Undo2,
  Users,
  Video,
  WifiOff,
  X,
} from 'lucide-react';
import { auth, db } from '../../services/firebase';
import { syncTeamChat } from '../../services/coedit/project';
import type { DraftConflict, SessionSnapshot } from '../../services/coedit/session';
import type { UseCoedit } from '../../hooks/useCoedit';
import type { ChatRoom } from '../../types';
import ChatWindow from '../ChatWindow';
import VideoChat from '../VideoChat';
import { CreativeVersionHistory } from '../creative/CreativeCloudPanels';
import { CollabPeople, PersonDot } from './CollabPeople';
import { CollabHistory } from './CollabHistory';
import { CollabCall } from './CollabCall';
import { ago, btn, btnPrimary, card, lbl } from './collabUi';

type Tab = 'people' | 'chat' | 'call' | 'history' | 'activity' | 'extra';

export interface CollabDockProps<T> {
  co: UseCoedit<T>;
  kind: string;
  title: string;
  /** The editor's current document and local id (solo history before the project is shared). */
  doc?: T | null;
  localId?: string | null;
  /** Solo (not yet shared) history uses the personal creative cloud; how to (de)serialize the doc. */
  serialize?: (doc: T) => string | Promise<string>;
  restoreSolo?: (json: string) => void | Promise<void>;
  /** Pixels from the top of the window where the panel starts (below the app's own toolbar). */
  top?: number;
  /** Open the panel just below this element (e.g. the editor's top bar) instead of at `top`. */
  anchor?: React.RefObject<HTMLElement | null>;
  /** Where the presence pill goes; 'inline' renders it in place (inside the app's own toolbar). */
  pill?: 'top-right' | 'bottom-right' | 'inline' | 'none';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Stacking order for the panel (above full-screen editors like standalone Chora). */
  zIndex?: number;
  /** One app-specific tab after Activity (Chora: the contribution ledger / credits). */
  extraTab?: { label: string; icon: React.ComponentType<{ size?: number }>; render: () => React.ReactNode };
}

export function CollabDock<T>(props: CollabDockProps<T>) {
  const { co, kind, title, pill = 'bottom-right' } = props;
  const [anchorTop, setAnchorTop] = useState<number | null>(null);
  const [openState, setOpenState] = useState(false);
  const open = props.open ?? openState;
  const setOpen = (v: boolean) => (props.onOpenChange ? props.onOpenChange(v) : setOpenState(v));
  const [tab, setTab] = useState<Tab>('people');
  const [inCall, setInCall] = useState(false);
  const [popOut, setPopOut] = useState(false);
  const [callers, setCallers] = useState<string[]>([]);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const snap = co.snap;
  const session = co.session;
  const project = co.project;
  const uid = auth.currentUser?.uid;
  const canEdit = co.role === 'owner' || co.role === 'editor';
  const top = anchorTop ?? props.top ?? 56;

  useEffect(() => {
    const el = props.anchor?.current;
    if (!open || !el) return;
    const measure = () => setAnchorTop(Math.max(0, Math.round(el.getBoundingClientRect().bottom)));
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open, props.anchor]);

  // Team chat room (created/refreshed on first open of Chat or Call).
  useEffect(() => {
    if (!project || !co.isShared) return;
    if (project.chatRoomId) setRoomId(project.chatRoomId);
  }, [project, co.isShared]);
  useEffect(() => {
    if (!roomId) return;
    return onSnapshot(
      fsDoc(db, 'chat_rooms', roomId),
      (s) => setRoom(s.exists() ? ({ id: s.id, ...s.data() } as ChatRoom) : null),
      () => setRoom(null)
    );
  }, [roomId]);
  const ensureRoom = async () => {
    if (!project) return null;
    const id = await syncTeamChat(project);
    setRoomId(id);
    return id;
  };

  // Keyboard: Ctrl/Cmd+Shift+Z-free selective undo lives in the editor; the dock offers buttons.
  const notices = snap?.notices ?? [];
  const decisions = notices.filter((n) => n.kind !== 'info');

  const pillEl = pill !== 'none' && (
    <PresencePill snap={snap} isShared={co.isShared} onClick={() => setOpen(!open)} placement={pill} decisions={decisions.length} />
  );

  const panel = open && (
    <aside
      className="fixed right-0 bottom-0 flex flex-col bg-[#0e0d14] border-l border-white/[0.08] shadow-[-12px_0_40px_rgba(0,0,0,0.45)] text-white"
      style={{ top, width: 'min(348px, 100vw)', zIndex: props.zIndex ?? 160 }}
      aria-label="Collaboration"
    >
      <header className="px-3 pt-2.5 pb-2 border-b border-white/[0.08] flex flex-col gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[.78rem] font-extrabold truncate">{title || 'Untitled'}</div>
            <ConnectionLine snap={snap} isShared={co.isShared} />
          </div>
          {session && canEdit && (
            <>
              <button className="text-white/50 hover:text-white disabled:opacity-25" title="Undo my last change (never anyone else's)" disabled={!snap?.canUndo} onClick={() => session.undo()}>
                <Undo2 size={14} />
              </button>
              <button className="text-white/50 hover:text-white disabled:opacity-25" title="Redo" disabled={!snap?.canRedo} onClick={() => session.redo()}>
                <Redo2 size={14} />
              </button>
            </>
          )}
          <button className="text-white/50 hover:text-white" title="Close" onClick={() => setOpen(false)}>
            <PanelRightClose size={15} />
          </button>
        </div>
        {session && canEdit && <ModeSwitch snap={snap} onMode={(m) => session.setMode(m)} onReview={() => setReviewing(true)} onDiscard={() => confirm('Throw away your private changes? This can’t be undone.') && session.discardDraft()} />}
        <nav className="flex items-center gap-0.5">
          {(
            [
              ['people', Users, 'People'],
              ['chat', MessageSquare, 'Chat'],
              ['call', Video, 'Call'],
              ['history', History, 'History'],
              ['activity', ActivityIcon, 'Activity'],
              ...(props.extraTab ? [['extra', props.extraTab.icon, props.extraTab.label] as const] : []),
            ] as ReadonlyArray<readonly [Tab, React.ComponentType<{ size?: number }>, string]>
          ).map(([id, Icon, label]) => (
            <button
              key={id}
              onClick={() => {
                setTab(id);
                if ((id === 'chat' || id === 'call') && co.isShared && !roomId) void ensureRoom();
              }}
              className={`relative h-7 px-2 rounded-[7px] text-[.62rem] font-bold flex items-center gap-1 transition-colors ${tab === id ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white/80'}`}
            >
              <Icon size={11} /> {label}
              {id === 'activity' && decisions.length > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-[var(--pj-magenta,#D40055)] text-[.5rem] flex items-center justify-center">{decisions.length}</span>}
              {id === 'call' && inCall && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
            </button>
          ))}
        </nav>
      </header>

      {/* The call keeps running while you look at other tabs. */}
      {co.isShared && roomId && inCall && !popOut && (
        <div className={tab === 'call' ? '' : 'border-b border-white/[0.06] max-h-[150px] overflow-hidden'}>
          <CollabCall roomId={roomId} joined={inCall && !popOut} onLeave={() => setInCall(false)} onPopOut={() => setPopOut(true)} onParticipants={setCallers} />
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col">
        {tab === 'people' && (
          <CollabPeople project={co.isShared ? project : null} presence={snap?.presence ?? []} me={session?.me ?? null} onShare={co.share} signedIn={co.signedIn} inCall={new Set(callers)} />
        )}
        {tab === 'chat' &&
          (!co.isShared ? (
            <NotShared what="Chat" onShare={() => setTab('people')} />
          ) : room ? (
            <div className="flex-1 min-h-0 flex flex-col collab-chat">
              <ChatWindow room={room} onOpenCollab={() => {}} onStartVideo={() => (setTab('call'), setInCall(true))} onStartAudio={() => (setTab('call'), setInCall(true))} />
            </div>
          ) : (
            <Centered>
              <Loader2 size={16} className="animate-spin text-white/40" />
            </Centered>
          ))}
        {tab === 'call' &&
          (!co.isShared ? (
            <NotShared what="Video calls" onShare={() => setTab('people')} />
          ) : !inCall ? (
            <Centered>
              <div className="flex flex-col items-center gap-2 text-center px-6">
                <div className="flex -space-x-1.5">{(snap?.presence ?? []).slice(0, 5).map((p) => <PersonDot key={p.key} uid={p.uid} name={p.name} photo={p.photo} size={28} ring />)}</div>
                <p className="text-[.7rem] text-white/55">Talk it through without leaving the work. Anyone on the project can join, here or from Chat.</p>
                <button
                  className={btnPrimary}
                  disabled={!roomId}
                  onClick={async () => {
                    if (!roomId) await ensureRoom();
                    setInCall(true);
                    setPopOut(false);
                  }}
                >
                  <Phone size={12} /> Join call
                </button>
              </div>
            </Centered>
          ) : popOut ? (
            <Centered>
              <span className="text-[.7rem] text-white/50">The call is open full screen.</span>
            </Centered>
          ) : null)}
        {tab === 'history' &&
          (session ? (
            <CollabHistory session={session} canEdit={canEdit} />
          ) : props.localId && props.doc && props.serialize && props.restoreSolo && co.signedIn ? (
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
              <CreativeVersionHistory kind={kind} localId={props.localId} title={title} getCurrentJson={() => props.serialize!(props.doc as T)} onRestore={props.restoreSolo} />
            </div>
          ) : (
            <NotShared what="History" onShare={() => setTab('people')} />
          ))}
        {tab === 'activity' && <ActivityPanel snap={snap} session={session} />}
        {tab === 'extra' && props.extraTab?.render()}
      </div>

      {reviewing && session && <PublishReview conflicts={session.draftConflicts()} count={snap?.draftCount ?? 0} onCancel={() => setReviewing(false)} onPublish={async (keep, label) => (await session.publishDraft(keep, label), setReviewing(false))} />}
    </aside>
  );

  return (
    <>
      {pillEl}
      {typeof document !== 'undefined' && panel ? createPortal(panel, document.body) : null}
      {popOut && room && typeof document !== 'undefined' &&
        createPortal(
          <VideoChat
            room={room}
            user={auth.currentUser}
            onClose={() => {
              setPopOut(false);
              setInCall(false);
            }}
          />,
          document.body
        )}
    </>
  );
}

// ── pieces ──────────────────────────────────────────────────────────────────

const Centered: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="flex-1 flex items-center justify-center p-4">{children}</div>;

const NotShared: React.FC<{ what: string; onShare: () => void }> = ({ what, onShare }) => (
  <Centered>
    <div className="text-center flex flex-col items-center gap-2 px-6">
      <p className="text-[.7rem] text-white/50">{what} opens once this project is shared with someone.</p>
      <button className={btn} onClick={onShare}>
        <Users size={11} /> Share this project
      </button>
    </div>
  </Centered>
);

function connectionText(snap: SessionSnapshot<unknown> | null, isShared: boolean): { icon: React.ReactNode; text: string; tone: string } {
  if (!isShared) return { icon: <Cloud size={10} />, text: 'Only you · autosaved to your cloud', tone: 'text-white/45' };
  if (!snap) return { icon: <Loader2 size={10} className="animate-spin" />, text: 'Connecting…', tone: 'text-white/45' };
  const pending = snap.pending;
  switch (snap.connection) {
    case 'offline':
      return { icon: <WifiOff size={10} />, text: pending ? `Offline · ${pending} change${pending === 1 ? '' : 's'} saved on this device` : 'Offline · keep working, it all syncs later', tone: 'text-amber-300' };
    case 'error':
      return { icon: <CloudOff size={10} />, text: pending ? `Reconnecting · ${pending} waiting` : 'Reconnecting…', tone: 'text-amber-300' };
    case 'read-only':
      return { icon: <Cloud size={10} />, text: 'View only · live', tone: 'text-white/45' };
    case 'connecting':
      return { icon: <Loader2 size={10} className="animate-spin" />, text: 'Connecting…', tone: 'text-white/45' };
    default:
      return pending
        ? { icon: <Loader2 size={10} className="animate-spin" />, text: 'Saving…', tone: 'text-white/55' }
        : { icon: <Check size={10} />, text: `Live · all changes saved${snap.lastSyncedAt ? ` ${ago(snap.lastSyncedAt)}` : ''}`, tone: 'text-emerald-300/90' };
  }
}

const ConnectionLine: React.FC<{ snap: SessionSnapshot<unknown> | null; isShared: boolean }> = ({ snap, isShared }) => {
  const c = connectionText(snap, isShared);
  return <div className={`text-[.6rem] font-bold flex items-center gap-1 ${c.tone}`}>{c.icon} {c.text}</div>;
};

const PresencePill: React.FC<{ snap: SessionSnapshot<unknown> | null; isShared: boolean; onClick: () => void; placement: 'top-right' | 'bottom-right' | 'inline'; decisions: number }> = ({ snap, isShared, onClick, placement, decisions }) => {
  const people = useMemo(() => {
    const m = new Map<string, NonNullable<typeof snap>['presence'][number]>();
    for (const p of snap?.presence ?? []) if (!m.has(p.uid)) m.set(p.uid, p);
    return [...m.values()];
  }, [snap?.presence]);
  const c = connectionText(snap, isShared);
  return (
    <button
      onClick={onClick}
      className={`${placement === 'inline' ? 'relative shrink-0 h-8' : 'fixed z-[159] right-4 h-9 shadow-lg'} pl-1.5 pr-3 rounded-full bg-[#14121c]/95 border border-white/10 flex items-center gap-2 hover:border-white/25 transition-colors backdrop-blur`}
      style={placement === 'inline' ? undefined : placement === 'top-right' ? { top: 12 } : { bottom: 16 }}
      title="Collaboration: people, chat, call, history"
    >
      {people.length ? (
        <span className="flex -space-x-1.5">
          {people.slice(0, 4).map((p) => (
            <PersonDot key={p.uid} uid={p.uid} name={p.name} photo={p.photo} size={24} ring />
          ))}
        </span>
      ) : (
        <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center">
          <Users size={12} className="text-white/70" />
        </span>
      )}
      <span className={`text-[.62rem] font-bold flex items-center gap-1 ${c.tone}`}>
        {c.icon}
        {!isShared ? 'Share' : snap?.mode === 'draft' ? `Draft · ${snap.draftCount}` : people.length ? `${people.length + 1} here` : c.text.split(' · ')[0]}
      </span>
      {decisions > 0 && <span className="min-w-[16px] h-4 px-1 rounded-full bg-[var(--pj-magenta,#D40055)] text-[.55rem] font-extrabold flex items-center justify-center text-white">{decisions}</span>}
    </button>
  );
};

const ModeSwitch: React.FC<{ snap: SessionSnapshot<unknown> | null; onMode: (m: 'live' | 'draft') => void; onReview: () => void; onDiscard: () => void }> = ({ snap, onMode, onReview, onDiscard }) => {
  const mode = snap?.mode ?? 'live';
  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-2 p-0.5 rounded-[9px] bg-black/30 border border-white/[0.06]">
        <button onClick={() => onMode('live')} className={`h-7 rounded-[7px] text-[.64rem] font-bold flex items-center justify-center gap-1 ${mode === 'live' ? 'bg-white/12 text-white bg-white/10' : 'text-white/45 hover:text-white/80'}`} title="Your edits appear for everyone as you make them">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Live together
        </button>
        <button onClick={() => onMode('draft')} className={`h-7 rounded-[7px] text-[.64rem] font-bold flex items-center justify-center gap-1 ${mode === 'draft' ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white/80'}`} title="Keep your edits to yourself until you share them; everyone else's changes still flow in">
          <GitBranch size={11} /> My draft
        </button>
      </div>
      {mode === 'draft' && (
        <div className={`${card} px-2.5 py-2 flex items-center gap-2`}>
          <div className="text-[.64rem] text-white/70 flex-1 leading-snug">
            {snap?.draftCount ? `${snap.draftCount} private change${snap.draftCount === 1 ? '' : 's'} on top of the live project.` : 'Edits you make now stay yours until you share them.'}
          </div>
          {!!snap?.draftCount && (
            <>
              <button className="text-[.62rem] font-bold text-white/45 hover:text-red-300" onClick={onDiscard}>
                Discard
              </button>
              <button className={btnPrimary} onClick={onReview}>
                Share…
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

const PublishReview: React.FC<{ conflicts: DraftConflict[]; count: number; onCancel: () => void; onPublish: (keepTheirs: DraftConflict['path'][], label?: string) => Promise<void> }> = ({ conflicts, count, onCancel, onPublish }) => {
  const [keepTheirs, setKeepTheirs] = useState<Set<number>>(new Set());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const show = (v: unknown) => (typeof v === 'string' ? `“${v.length > 60 ? `${v.slice(0, 59)}…` : v}”` : v === undefined ? 'removed' : typeof v === 'object' ? 'changed' : String(v));
  return (
    <div className="absolute inset-0 z-10 bg-black/60 backdrop-blur-sm flex items-end">
      <div className="w-full max-h-[85%] bg-[#14121c] border-t border-white/10 rounded-t-[14px] p-3 flex flex-col gap-2.5">
        <div className="flex items-center">
          <div className="text-[.8rem] font-extrabold flex-1">Share your {count} change{count === 1 ? '' : 's'}</div>
          <button onClick={onCancel} className="text-white/50 hover:text-white">
            <X size={14} />
          </button>
        </div>
        {conflicts.length === 0 ? (
          <p className="text-[.68rem] text-white/55">Nobody else touched the same things while you worked, so this merges cleanly.</p>
        ) : (
          <>
            <p className="text-[.68rem] text-white/60">
              <AlertTriangle size={11} className="inline text-amber-300 mr-1" />
              {conflicts.length} place{conflicts.length === 1 ? ' was' : 's were'} also changed by someone else. Pick which to keep:
            </p>
            <div className="flex flex-col gap-1.5 overflow-y-auto custom-scrollbar max-h-[260px]">
              {conflicts.map((c, i) => (
                <div key={i} className={`${card} p-2 flex flex-col gap-1`}>
                  <div className="text-[.68rem] font-bold text-white truncate">{c.label}</div>
                  <div className="grid grid-cols-2 gap-1">
                    <Choice active={!keepTheirs.has(i)} onClick={() => setKeepTheirs((s) => (s.delete(i), new Set(s)))} title="Mine" value={show(c.mine)} />
                    <Choice active={keepTheirs.has(i)} onClick={() => setKeepTheirs((s) => new Set(s).add(i))} title={c.byName} value={show(c.theirs)} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        <input className="h-8 rounded-[8px] bg-black/30 border border-white/10 px-2.5 text-[.72rem] placeholder:text-white/30" placeholder="What changed? (optional, shows in history)" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex justify-end gap-1.5">
          <button className={btn} onClick={onCancel}>
            Keep drafting
          </button>
          <button
            className={btnPrimary}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onPublish(
                conflicts.filter((_, i) => keepTheirs.has(i)).map((c) => c.path),
                note.trim() || undefined
              );
            }}
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Share with everyone
          </button>
        </div>
        <p className="text-[.58rem] text-white/35">The project as it was just before is saved to history first.</p>
      </div>
    </div>
  );
};

const Choice: React.FC<{ active: boolean; onClick: () => void; title: string; value: string }> = ({ active, onClick, title, value }) => (
  <button onClick={onClick} className={`text-left rounded-[8px] px-2 py-1.5 border ${active ? 'border-[var(--pj-cyan,#00DAF3)] bg-[var(--pj-cyan,#00DAF3)]/10' : 'border-white/10 hover:border-white/25'}`}>
    <div className="text-[.56rem] font-extrabold uppercase tracking-wider text-white/45">{title}</div>
    <div className="text-[.64rem] text-white/85 truncate">{value}</div>
  </button>
);

const ActivityPanel: React.FC<{ snap: SessionSnapshot<unknown> | null; session: UseCoedit<unknown>['session'] }> = ({ snap, session }) => {
  if (!snap || !session) return <NotShared what="Live activity" onShare={() => {}} />;
  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-3">
      {snap.notices.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <div className={lbl}>Needs a look</div>
          {snap.notices.map((n) => (
            <div key={n.id} className={`${card} p-2 flex flex-col gap-1.5`}>
              <div className="text-[.68rem] text-white/85 leading-snug">{n.text}</div>
              <div className="flex gap-1.5">
                {(n.kind === 'overwritten' || n.kind === 'text-overlap' || n.kind === 'offline-lost') && n.mine !== undefined && (
                  <button className={btn} onClick={() => session.keepMine(n.id)}>
                    Use mine
                  </button>
                )}
                {n.kind === 'kept-deleted' && (
                  <button className={btn} onClick={() => session.deleteAnyway(n.id)}>
                    Delete anyway
                  </button>
                )}
                <button className={`${btn} ml-auto`} onClick={() => session.dismissNotice(n.id)}>
                  {n.kind === 'kept-deleted' ? 'Keep it' : 'Keep theirs'}
                </button>
              </div>
            </div>
          ))}
        </section>
      )}
      <section className="flex flex-col gap-1">
        <div className={lbl}>Live changes</div>
        {snap.activity.length === 0 && <div className="text-[.68rem] text-white/40">Changes from others show up here as they happen.</div>}
        {snap.activity.map((a) => (
          <div key={a.id} className="flex items-start gap-2 px-1 py-1">
            <PersonDot uid={a.uid} name={a.name} size={18} />
            <div className="min-w-0">
              <div className="text-[.66rem] text-white/80 leading-snug">{a.summary}</div>
              <div className="text-[.58rem] text-white/35">{ago(a.at)}</div>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
};

/** For editors that want the collaborator rings on selected items: uid → colour for an element id. */
export function useRemoteSelections(snap: SessionSnapshot<unknown> | null): Map<string, { color: string; name: string }> {
  return useMemo(() => {
    const m = new Map<string, { color: string; name: string }>();
    for (const p of snap?.presence ?? []) for (const id of p.sel ?? []) if (!m.has(id)) m.set(id, { color: p.color, name: p.name });
    return m;
  }, [snap?.presence]);
}
