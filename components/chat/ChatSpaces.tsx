import React, { useEffect, useMemo, useState } from 'react';
import {
  MessageSquare, Search, Hash, Users, Radio, Mail, Plus, ChevronLeft,
  Heart, X, User, GraduationCap, Clapperboard, Sparkles, ClipboardList,
  MoreHorizontal, Trash2, Edit3, Music, Pin,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { ChatRoom, UserProfile } from '../../types';
import { auth, searchUserProfiles } from '../../services/backendService';
import { useCall } from '../../contexts/CallContext';
import type { IntimateProfile } from '../../services/intimateGating';
import ChatWindow from '../ChatWindow';
import PostmanSystem from '../PostmanSystem';
import IntimateEnrollmentModal from '../IntimateEnrollmentModal';
import ProductionChatContextPanel from '../film/ProductionChatContextPanel';

// ─── Bridged / connected sources ────────────────────────────────────────────
// No real bridge exists yet: these are top-level Space entries that open a
// "Connect {source}" coming-soon panel. We NEVER fake messages for them.
type SourceKey = 'slack' | 'teams' | 'discord' | 'telegram' | 'whatsapp';
const SOURCES: { key: SourceKey; label: string; glyph: string; badge: string; color: string; bg: string }[] = [
  { key: 'slack',    label: 'Slack',    glyph: '#', badge: 'S', color: '#fff',    bg: '#4A154B' },
  { key: 'teams',    label: 'Teams',    glyph: 'T', badge: 'T', color: '#fff',    bg: '#4B53BC' },
  { key: 'discord',  label: 'Discord',  glyph: '🎮', badge: 'D', color: '#fff',   bg: '#5865F2' },
  { key: 'telegram', label: 'Telegram', glyph: '✈', badge: 'T', color: '#fff',    bg: '#28A8E9' },
  { key: 'whatsapp', label: 'WhatsApp', glyph: '💬', badge: 'W', color: '#04240f', bg: '#25D366' },
];

// A Space is either a built-in destination, one production, or a bridged source.
type SpaceId = 'home' | 'live' | 'classrooms' | 'mail' | `prod:${string}` | `src:${SourceKey}`;

interface ChatSpacesProps {
  rooms: ChatRoom[];
  profiles: Record<string, UserProfile>;
  activeRoom: ChatRoom | null;
  setActiveRoom: (room: ChatRoom | null) => void;
  currentUserProfile?: UserProfile;
  intimateRooms: Set<string>;
  onBack?: () => void;
  onStartDM: (user: UserProfile) => Promise<void> | void;
  onToggleIntimate: (roomId: string) => void;
  onDeleteRoom: (roomId: string) => void;
  onRenameRoom: (roomId: string) => void;
  // Intimate enrollment gate (classic modals are skipped on the early return,
  // so the Spaces shell renders its own).
  enrollForRoomId: string | null;
  setEnrollForRoomId: (v: string | null) => void;
  me: IntimateProfile | null;
  enableIntimate: (roomId: string, skipEligibility?: boolean) => void;
}

const roomDisplayName = (room: ChatRoom, profiles: Record<string, UserProfile>, uid?: string): string => {
  if (room.type === 'PRIVATE') {
    const otherId = room.participants.find(id => id !== uid);
    return otherId ? profiles[otherId]?.displayName || 'Loading…' : 'Saved Messages';
  }
  if (room.type === 'PUBLIC_LIVE') return room.name || 'Live Channel';
  return room.name || (room.type === 'CLASSROOM' ? 'Classroom' : 'Group Chat');
};

// ─── Small avatar (mirrors the classic RoomAvatar palette) ──────────────────
const Avatar: React.FC<{ room?: ChatRoom; profiles: Record<string, UserProfile>; size?: number }> = ({ room, profiles, size = 34 }) => {
  const uid = auth.currentUser?.uid;
  const dim = { width: size, height: size };
  if (room?.type === 'PRIVATE') {
    const otherId = room.participants.find(id => id !== uid);
    const p = otherId ? profiles[otherId] : null;
    return (
      <div style={dim} className="rounded-xl overflow-hidden border border-white/10 shrink-0 bg-white/5 flex items-center justify-center">
        {p?.photoURL
          ? <img src={p.photoURL} alt="" className="w-full h-full object-cover" loading="lazy" />
          : <User size={size * 0.5} className="text-white/25" />}
      </div>
    );
  }
  if (room?.coverUrl) {
    return <div style={dim} className="rounded-xl overflow-hidden border border-white/10 shrink-0"><img src={room.coverUrl} alt="" className="w-full h-full object-cover" loading="lazy" /></div>;
  }
  return (
    <div style={dim} className="rounded-xl shrink-0 flex items-center justify-center bg-gradient-to-br from-small-orange/25 to-purple-500/25 border border-white/10">
      <Users size={size * 0.42} className="text-white/40" />
    </div>
  );
};

// ─── Space icon button (left 64px rail) ─────────────────────────────────────
const SpaceButton: React.FC<{
  active: boolean; title: string; onClick: () => void; children: React.ReactNode;
  badge?: { text: string; color: string; bg: string };
}> = ({ active, title, onClick, children, badge }) => (
  <button
    onClick={onClick}
    title={title}
    className={`relative w-11 h-11 rounded-2xl grid place-items-center text-lg transition-all shrink-0 ${
      active ? 'ring-2 ring-small-orange bg-white/10' : 'bg-white/[0.04] hover:bg-white/10 hover:rounded-xl'
    }`}
  >
    {children}
    {badge && (
      <span
        className="absolute -bottom-0.5 -right-0.5 text-[7px] font-black leading-none px-1 py-0.5 rounded-md border border-black/40"
        style={{ color: badge.color, background: badge.bg }}
      >
        {badge.text}
      </span>
    )}
  </button>
);

// ─── Channel / conversation row (channel column) ────────────────────────────
const ChannelRow: React.FC<{
  room: ChatRoom;
  profiles: Record<string, UserProfile>;
  active: boolean;
  compact?: boolean;
  intimate?: boolean;
  glyph?: React.ReactNode;
  onSelect: () => void;
  onDelete?: () => void;
  onRename?: () => void;
  onToggleIntimate?: () => void;
}> = ({ room, profiles, active, compact, intimate, glyph, onSelect, onDelete, onRename, onToggleIntimate }) => {
  const uid = auth.currentUser?.uid;
  const isOwner = room.ownerId === uid;
  const [menu, setMenu] = useState(false);
  const name = roomDisplayName(room, profiles, uid);
  return (
    <div className="relative group">
      <button
        onClick={onSelect}
        className={`w-full flex items-center gap-2.5 rounded-xl text-left transition-all border ${compact ? 'px-2.5 py-2' : 'px-2.5 py-2.5'} ${
          active
            ? intimate ? 'bg-rose-500/15 border-rose-500/30' : 'bg-small-orange/15 border-small-orange/30'
            : 'bg-transparent border-transparent hover:bg-white/[0.05]'
        }`}
      >
        {glyph
          ? <span className={`shrink-0 grid place-items-center ${active ? 'text-small-orange' : 'text-white/35'}`}>{glyph}</span>
          : <Avatar room={room} profiles={profiles} size={compact ? 24 : 34} />}
        <div className="flex-1 min-w-0">
          <div className={`truncate ${compact ? 'text-[12px] font-semibold' : 'text-[13px] font-bold'} ${active ? (intimate ? 'text-rose-300' : 'text-small-orange') : 'text-white/90'}`}>
            {name}
          </div>
          {!compact && (
            <div className="text-[10px] text-white/30 truncate">
              {room.typingUsers?.filter(id => id !== uid).length
                ? <span className="text-green-400">typing…</span>
                : room.id.startsWith('live_chat_') && room.mediaArtist
                  ? <span className="text-orange-400/70">{room.mediaArtist}</span>
                  : room.lastMessage || (room.channelDescription || 'No messages yet')}
            </div>
          )}
        </div>
      </button>
      {(onDelete || onRename || onToggleIntimate) && (
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
          <button
            onClick={e => { e.stopPropagation(); setMenu(m => !m); }}
            className="p-1 bg-black/40 text-white/25 hover:text-white rounded-md opacity-0 group-hover:opacity-100 transition-all"
          >
            <MoreHorizontal size={12} />
          </button>
          <AnimatePresence>
            {menu && (
              <>
                <div className="fixed inset-0 z-40" onClick={e => { e.stopPropagation(); setMenu(false); }} />
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: -4 }}
                  className="absolute right-0 top-full mt-1 bg-[#111] border border-white/10 rounded-xl p-1.5 z-50 shadow-2xl min-w-[140px]"
                  onClick={e => e.stopPropagation()}
                >
                  {room.type === 'PRIVATE' && onToggleIntimate && (
                    <button onClick={() => { setMenu(false); onToggleIntimate(); }} className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-all ${intimate ? 'text-rose-300 hover:bg-rose-500/10' : 'hover:bg-white/5'}`}>
                      <Heart size={12} fill={intimate ? 'currentColor' : 'none'} className={intimate ? 'text-rose-400' : 'text-white/40'} />
                      <span className="text-[9px] font-black uppercase tracking-widest">{intimate ? 'Nibbles On' : 'Nibbles'}</span>
                    </button>
                  )}
                  {room.type === 'GROUP' && isOwner && onRename && (
                    <button onClick={() => { setMenu(false); onRename(); }} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/5 text-left">
                      <Edit3 size={12} className="text-white/40" />
                      <span className="text-[9px] font-black uppercase tracking-widest">Rename</span>
                    </button>
                  )}
                  {onDelete && (
                    <button onClick={() => { setMenu(false); onDelete(); }} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-red-500/10 text-left text-red-400">
                      <Trash2 size={12} />
                      <span className="text-[9px] font-black uppercase tracking-widest">{room.type === 'PRIVATE' ? 'Delete' : isOwner ? 'Delete' : 'Leave'}</span>
                    </button>
                  )}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

const GroupLabel: React.FC<{ children: React.ReactNode; action?: React.ReactNode }> = ({ children, action }) => (
  <div className="flex items-center justify-between px-2 pt-3 pb-1.5">
    <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/30">{children}</p>
    {action}
  </div>
);

// ─── New DM search (self-contained, reuses searchUserProfiles + onStartDM) ──
const NewDmModal: React.FC<{ onClose: () => void; onStartDM: (u: UserProfile) => void }> = ({ onClose, onStartDM }) => {
  const [term, setTerm] = useState('');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!term.trim()) { setUsers([]); return; }
    setBusy(true);
    const t = setTimeout(async () => {
      try { const u = await searchUserProfiles(term); setUsers(u.filter(x => x.uid !== auth.currentUser?.uid)); } catch { setUsers([]); }
      setBusy(false);
    }, 350);
    return () => clearTimeout(t);
  }, [term]);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/85 backdrop-blur-xl z-[500] flex items-end sm:items-center justify-center sm:p-6" onClick={onClose}>
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
        className="w-full sm:max-w-md bg-[#0e0e0e] border border-white/10 rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl flex flex-col max-h-[75vh]" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-white/[0.06] space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black uppercase tracking-tighter">New Message</h2>
            <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-xl"><X size={16} /></button>
          </div>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20" size={14} />
            <input value={term} onChange={e => setTerm(e.target.value)} placeholder="Search Plajah users…" autoFocus
              className="w-full bg-white/[0.05] border border-white/[0.07] rounded-xl pl-9 pr-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-small-orange/40" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1.5">
          {busy ? (
            <div className="py-10 flex justify-center"><div className="w-6 h-6 border-2 border-small-orange/30 border-t-small-orange rounded-full animate-spin" /></div>
          ) : users.length > 0 ? users.map(u => (
            <button key={u.uid} onClick={() => onStartDM(u)} className="w-full p-3 rounded-2xl bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.08] flex items-center gap-3 group">
              <img src={u.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.uid}`} className="w-10 h-10 rounded-xl object-cover border border-white/10" alt="" loading="lazy" />
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-black group-hover:text-small-orange truncate">{u.displayName}</p>
                <p className="text-[9px] font-bold text-white/25 truncate">{u.bio || 'Plajah Creator'}</p>
              </div>
              <MessageSquare size={15} className="text-white/20 group-hover:text-small-orange shrink-0" />
            </button>
          )) : (
            <p className="py-10 text-center text-[9px] font-black uppercase tracking-widest text-white/20">Type to search Plajah users</p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

// ─── Main Spaces shell ──────────────────────────────────────────────────────
const ChatSpaces: React.FC<ChatSpacesProps> = ({
  rooms, profiles, activeRoom, setActiveRoom, currentUserProfile, intimateRooms, onBack,
  onStartDM, onToggleIntimate, onDeleteRoom, onRenameRoom,
  enrollForRoomId, setEnrollForRoomId, me, enableIntimate,
}) => {
  const uid = auth.currentUser?.uid;
  const { placeCall } = useCall();
  const [space, setSpace] = useState<SpaceId>('home');
  const [showNewDm, setShowNewDm] = useState(false);
  const [showBrief, setShowBrief] = useState(false);

  // ── Derive the Space model from the shared room list ──────────────────────
  const productions = useMemo(() => {
    const map = new Map<string, { id: string; title: string; rooms: ChatRoom[] }>();
    rooms.filter(r => r.workspaceType === 'PRODUCTION' && r.productionId).forEach(r => {
      const pid = r.productionId!;
      if (!map.has(pid)) map.set(pid, { id: pid, title: r.productionTitle || 'Production', rooms: [] });
      map.get(pid)!.rooms.push(r);
    });
    return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [rooms]);

  const homeDMs = useMemo(() => rooms.filter(r => r.type === 'PRIVATE'), [rooms]);
  const homeGroups = useMemo(() => rooms.filter(r => r.type === 'GROUP' && r.workspaceType !== 'PRODUCTION'), [rooms]);
  const liveChannels = useMemo(() => rooms.filter(r => r.type === 'PUBLIC_LIVE' && !r.id.startsWith('live_chat_')), [rooms]);
  const songRooms = useMemo(() => rooms.filter(r => r.id.startsWith('live_chat_')), [rooms]);
  const classrooms = useMemo(() => rooms.filter(r => r.type === 'CLASSROOM'), [rooms]);

  const activeProduction = space.startsWith('prod:') ? productions.find(p => p.id === space.slice(5)) : undefined;
  const activeSource = space.startsWith('src:') ? SOURCES.find(s => `src:${s.key}` === space) : undefined;

  // Rooms that belong to the currently selected space (for auto-selection).
  const spaceRooms = useMemo<ChatRoom[]>(() => {
    if (activeProduction) return activeProduction.rooms;
    if (space === 'live') return [...liveChannels, ...songRooms];
    if (space === 'classrooms') return classrooms;
    if (space === 'home') return [...homeDMs, ...homeGroups];
    return [];
  }, [space, activeProduction, liveChannels, songRooms, classrooms, homeDMs, homeGroups]);

  // For production spaces, auto-open a channel (mirrors ProductionChatWorkspace).
  useEffect(() => {
    if (!activeProduction) return;
    const inSpace = activeRoom && activeProduction.rooms.some(r => r.id === activeRoom.id);
    if (!inSpace) {
      const first = activeProduction.rooms.find(r => r.productionChannelKey === 'general')
        || activeProduction.rooms.find(r => r.productionChannelKind === 'ANNOUNCEMENTS')
        || activeProduction.rooms[0] || null;
      setActiveRoom(first);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [space]);

  const selectSpace = (s: SpaceId) => {
    setSpace(s);
    setShowBrief(false);
    // Non-conversation destinations clear the thread; message spaces keep/adjust it.
    if (s === 'mail' || s.startsWith('src:')) return;
  };

  const isProductionThread = !!activeRoom?.productionId && !!activeProduction;
  const currentRoomIsIntimate = activeRoom ? !!activeRoom.isIntimate : false;

  // ── Production channel grouping (mirrors ProductionChatWorkspace) ──────────
  const prodGroups = useMemo(() => {
    const src = activeProduction?.rooms || [];
    return {
      CORE: src.filter(r => ['ANNOUNCEMENTS', 'GENERAL', 'SCHEDULE', 'SAFETY', 'HELP'].includes(r.productionChannelKind || '')),
      DEPARTMENTS: src.filter(r => r.productionChannelKind === 'DEPARTMENT'),
      'SHOOT DAYS': src.filter(r => r.productionChannelKind === 'SHOOT_DAY'),
    };
  }, [activeProduction]);

  const memberProfiles = useMemo(() => {
    if (!activeRoom) return [] as UserProfile[];
    return activeRoom.participants.map(id => profiles[id]).filter(Boolean).slice(0, 20) as UserProfile[];
  }, [activeRoom, profiles]);

  // ── Channel column contents per space ─────────────────────────────────────
  const renderChannelColumn = () => {
    if (space === 'mail') {
      return <div className="p-3"><PostmanSystem /></div>;
    }
    if (activeSource) {
      return (
        <div className="p-4 space-y-2">
          <GroupLabel>Bridged workspace</GroupLabel>
          <div className="px-2 text-[11px] text-white/40 leading-relaxed">
            Bring your {activeSource.label} channels and DMs into Plajah. Nothing is connected yet.
          </div>
        </div>
      );
    }
    if (activeProduction) {
      return (
        <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-4">
          <div className="px-2 pt-3 pb-2">
            <button onClick={() => setShowBrief(true)} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-white/10 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/70">
              <ClipboardList size={13} className="text-small-orange" /> Sets · Ops brief
            </button>
          </div>
          {Object.entries(prodGroups).map(([label, list]) => list.length > 0 && (
            <section key={label}>
              <GroupLabel>{label}</GroupLabel>
              <div className="space-y-0.5">
                {list.map(r => (
                  <ChannelRow key={r.id} room={r} profiles={profiles} active={activeRoom?.id === r.id} compact
                    glyph={<Hash size={14} />} onSelect={() => setActiveRoom(r)} />
                ))}
              </div>
            </section>
          ))}
          {homeDMs.length > 0 && (
            <section>
              <GroupLabel>Direct</GroupLabel>
              <div className="space-y-0.5">
                {homeDMs.map(r => (
                  <ChannelRow key={r.id} room={r} profiles={profiles} active={activeRoom?.id === r.id} compact
                    intimate={intimateRooms.has(r.id)} onSelect={() => setActiveRoom(r)}
                    onToggleIntimate={() => onToggleIntimate(r.id)} onDelete={() => onDeleteRoom(r.id)} />
                ))}
              </div>
            </section>
          )}
        </div>
      );
    }
    if (space === 'live') {
      return (
        <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-4">
          {liveChannels.length > 0 && <section><GroupLabel>Live Channels</GroupLabel><div className="space-y-0.5">{liveChannels.map(r => <ChannelRow key={r.id} room={r} profiles={profiles} active={activeRoom?.id === r.id} glyph={<Radio size={16} />} onSelect={() => setActiveRoom(r)} onDelete={() => onDeleteRoom(r.id)} />)}</div></section>}
          {songRooms.length > 0 && <section><GroupLabel>Song Rooms</GroupLabel><div className="space-y-0.5">{songRooms.map(r => <ChannelRow key={r.id} room={r} profiles={profiles} active={activeRoom?.id === r.id} onSelect={() => setActiveRoom(r)} />)}</div></section>}
          {liveChannels.length + songRooms.length === 0 && <EmptyHint icon={<Radio size={24} />} text="No live or song rooms yet" />}
        </div>
      );
    }
    if (space === 'classrooms') {
      return (
        <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-4">
          <GroupLabel>Classrooms</GroupLabel>
          <div className="space-y-0.5">{classrooms.map(r => <ChannelRow key={r.id} room={r} profiles={profiles} active={activeRoom?.id === r.id} glyph={<GraduationCap size={16} />} onSelect={() => setActiveRoom(r)} onDelete={() => onDeleteRoom(r.id)} />)}</div>
          {classrooms.length === 0 && <EmptyHint icon={<GraduationCap size={24} />} text="No classrooms yet" />}
        </div>
      );
    }
    // Home
    return (
      <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-4">
        <section>
          <GroupLabel action={<button onClick={() => setShowNewDm(true)} className="text-[8px] font-black uppercase tracking-widest text-small-orange hover:text-small-orange/80">＋ New</button>}>Direct Messages</GroupLabel>
          <div className="space-y-0.5">
            {homeDMs.map(r => (
              <ChannelRow key={r.id} room={r} profiles={profiles} active={activeRoom?.id === r.id}
                intimate={intimateRooms.has(r.id)} onSelect={() => setActiveRoom(r)}
                onToggleIntimate={() => onToggleIntimate(r.id)} onDelete={() => onDeleteRoom(r.id)} />
            ))}
            {homeDMs.length === 0 && <EmptyHint icon={<MessageSquare size={22} />} text="No direct messages yet" />}
          </div>
        </section>
        {homeGroups.length > 0 && (
          <section>
            <GroupLabel>Groups</GroupLabel>
            <div className="space-y-0.5">
              {homeGroups.map(r => (
                <ChannelRow key={r.id} room={r} profiles={profiles} active={activeRoom?.id === r.id}
                  onSelect={() => setActiveRoom(r)} onDelete={() => onDeleteRoom(r.id)} onRename={() => onRenameRoom(r.id)} />
              ))}
            </div>
          </section>
        )}
      </div>
    );
  };

  // ── Main pane: connect panel / mail / thread / empty ──────────────────────
  const renderMain = () => {
    if (activeSource) return <ConnectSourcePanel source={activeSource} />;
    if (space === 'mail') {
      return (
        <div className="hidden md:flex flex-1 flex-col items-center justify-center p-12 text-center">
          <Mail size={44} className="text-small-orange mb-6" />
          <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">The Post Man</h2>
          <p className="text-[11px] font-bold text-white/25 uppercase tracking-[0.2em]">Your mail lives in the left column</p>
        </div>
      );
    }
    if (activeRoom) {
      return (
        <div className="flex flex-col h-full relative">
          {activeRoom.type === 'PRIVATE' && (
            <div className={`shrink-0 px-4 py-2 flex items-center justify-end border-b ${currentRoomIsIntimate ? 'border-rose-900/30 bg-black/20' : 'border-white/5'}`}>
              <button onClick={() => onToggleIntimate(activeRoom.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest border transition-all ${currentRoomIsIntimate ? 'bg-rose-500/20 border-rose-500/30 text-rose-300' : 'bg-white/5 border-white/10 text-white/30 hover:text-white'}`}>
                <Heart size={11} fill={currentRoomIsIntimate ? 'currentColor' : 'none'} />
                {currentRoomIsIntimate ? 'Nibbles On' : 'Nibbles'}
              </button>
            </div>
          )}
          <ChatWindow
            room={activeRoom}
            profiles={profiles}
            currentUserProfile={currentUserProfile}
            onBack={() => setActiveRoom(null)}
            onOpenCollab={() => {}}
            onStartVideo={() => activeRoom && placeCall(activeRoom, 'VIDEO')}
            onStartAudio={() => activeRoom && placeCall(activeRoom, 'AUDIO')}
          />
          {isProductionThread && showBrief && (
            <ProductionChatContextPanel room={activeRoom} uid={uid || ''} onClose={() => setShowBrief(false)} />
          )}
        </div>
      );
    }
    return (
      <div className="hidden md:flex flex-1 flex-col items-center justify-center p-12 text-center">
        <div className="w-24 h-24 bg-gradient-to-br from-small-orange/20 to-purple-500/20 rounded-[2rem] flex items-center justify-center mb-6 border border-white/10">
          <Sparkles size={40} className="text-small-orange" />
        </div>
        <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">Plajah Spaces</h2>
        <p className="text-[11px] font-bold text-white/25 uppercase tracking-[0.2em] max-w-xs leading-loose">Pick a space, then a channel to start</p>
      </div>
    );
  };

  const spaceTitle = space === 'home' ? 'Home'
    : space === 'live' ? 'Live & Songs'
    : space === 'classrooms' ? 'Classrooms'
    : space === 'mail' ? 'Mail'
    : activeProduction ? activeProduction.title
    : activeSource ? activeSource.label
    : 'Spaces';

  // Show right rail only for a production thread (members + brief).
  const showRightRail = isProductionThread && !!activeRoom;

  return (
    <div className="h-full flex overflow-hidden relative pb-20 md:pb-0" style={currentRoomIsIntimate ? { background: 'linear-gradient(160deg,#1a0008 0%,#2d0010 50%,#0d0005 100%)' } : {}}>
      {currentRoomIsIntimate && (
        <div className="absolute inset-0 pointer-events-none z-0">
          <div className="absolute top-0 left-1/4 w-64 h-64 bg-rose-900/20 rounded-full blur-[80px]" />
        </div>
      )}

      {/* ── SPACES RAIL (64px) ── */}
      <div className="w-16 shrink-0 border-r border-white/[0.06] bg-black/30 backdrop-blur-xl flex flex-col items-center gap-2 py-3 overflow-y-auto no-scrollbar z-20">
        {onBack && (
          <>
            <button onClick={onBack} title="Back" className="w-11 h-11 rounded-2xl grid place-items-center bg-white/[0.04] hover:bg-white/10 text-white/50"><ChevronLeft size={18} /></button>
            <div className="w-6 h-px bg-white/10" />
          </>
        )}
        <SpaceButton active={space === 'home'} title="Home · DMs & Groups" onClick={() => selectSpace('home')}><MessageSquare size={18} className="text-white/80" /></SpaceButton>
        <div className="w-6 h-px bg-white/10" />
        {productions.map(p => (
          <SpaceButton key={p.id} active={space === `prod:${p.id}`} title={`${p.title} (Production)`} onClick={() => selectSpace(`prod:${p.id}`)}
            badge={{ text: 'SET', color: '#fff', bg: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)' }}>
            <Clapperboard size={18} className="text-white/80" />
          </SpaceButton>
        ))}
        <SpaceButton active={space === 'live'} title="Live & Song rooms" onClick={() => selectSpace('live')}><Radio size={18} className="text-red-400" /></SpaceButton>
        {classrooms.length > 0 && <SpaceButton active={space === 'classrooms'} title="Classrooms" onClick={() => selectSpace('classrooms')}><GraduationCap size={18} className="text-blue-400" /></SpaceButton>}
        <SpaceButton active={space === 'mail'} title="Postman / Mail" onClick={() => selectSpace('mail')}><Mail size={18} className="text-white/80" /></SpaceButton>
        <div className="w-6 h-px bg-white/10" />
        {SOURCES.map(s => (
          <SpaceButton key={s.key} active={space === `src:${s.key}`} title={`${s.label} · connect`} onClick={() => selectSpace(`src:${s.key}`)}
            badge={{ text: s.badge, color: s.color, bg: s.bg }}>
            <span className="text-white/70" style={{ fontSize: 15 }}>{s.glyph}</span>
          </SpaceButton>
        ))}
        <SpaceButton active={false} title="Connect a source" onClick={() => selectSpace('src:slack')}><Plus size={18} className="text-small-orange" /></SpaceButton>
      </div>

      {/* ── CHANNEL COLUMN ── */}
      <div className={`w-full md:w-72 shrink-0 border-r border-white/[0.06] bg-black/20 backdrop-blur-xl flex flex-col z-10 ${activeRoom || activeSource || space === 'mail' ? 'hidden md:flex' : 'flex'}`}>
        <div className="px-4 pt-4 pb-3 border-b border-white/[0.05] flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-widest text-white truncate">{spaceTitle}</h2>
          {space === 'home' && (
            <button onClick={() => setShowNewDm(true)} title="New message" className="p-1.5 text-white/35 hover:text-white hover:bg-white/5 rounded-lg"><Search size={15} /></button>
          )}
        </div>
        {renderChannelColumn()}
      </div>

      {/* ── MAIN (thread / connect / mail) ── */}
      <div className={`${activeRoom || activeSource || space === 'mail' ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0 relative z-10`}>
        {renderMain()}
      </div>

      {/* ── RIGHT RAIL (production only) ── */}
      {showRightRail && (
        <div className="hidden lg:flex w-60 shrink-0 border-l border-white/[0.06] bg-black/20 backdrop-blur-xl flex-col overflow-y-auto custom-scrollbar z-10">
          <div className="p-4 border-b border-white/[0.06]">
            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/30 mb-2">Daily brief</p>
            <button onClick={() => setShowBrief(true)} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-small-orange/15 border border-small-orange/25 text-small-orange text-[10px] font-black uppercase tracking-widest">
              <ClipboardList size={13} /> Open ops brief
            </button>
          </div>
          <div className="p-4 border-b border-white/[0.06]">
            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/30 mb-3">Members · {activeRoom?.participants.length ?? 0}</p>
            <div className="space-y-2">
              {memberProfiles.map(p => (
                <div key={p.uid} className="flex items-center gap-2 text-[11px] text-white/60">
                  <img src={p.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.uid}`} className="w-6 h-6 rounded-lg object-cover border border-white/10" alt="" loading="lazy" />
                  <span className="truncate">{p.displayName}</span>
                </div>
              ))}
              {(activeRoom?.participants.length ?? 0) > memberProfiles.length && (
                <p className="text-[10px] text-white/25">+{(activeRoom!.participants.length) - memberProfiles.length} more</p>
              )}
            </div>
          </div>
          <div className="p-4">
            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/30 mb-2 flex items-center gap-1.5"><Pin size={10} /> Channel</p>
            <p className="text-[11px] text-white/50 leading-relaxed">{activeRoom?.channelDescription || 'Production channel'}</p>
          </div>
        </div>
      )}

      {/* ── New DM modal ── */}
      <AnimatePresence>
        {showNewDm && (
          <NewDmModal onClose={() => setShowNewDm(false)} onStartDM={async u => { await onStartDM(u); setShowNewDm(false); }} />
        )}
      </AnimatePresence>

      {/* ── Intimate enrollment (18+ gate) — rendered here since classic modals are skipped ── */}
      {enrollForRoomId && me?.uid && (
        <IntimateEnrollmentModal
          uid={me.uid}
          accent="#ff6b6b"
          onClose={() => setEnrollForRoomId(null)}
          onEnrolled={() => { const rid = enrollForRoomId; setEnrollForRoomId(null); if (rid) enableIntimate(rid, true); }}
        />
      )}
    </div>
  );
};

const EmptyHint: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
  <div className="py-12 text-center space-y-3">
    <div className="mx-auto text-white/10 w-fit">{icon}</div>
    <p className="text-[9px] font-black uppercase tracking-widest text-white/20">{text}</p>
  </div>
);

const ConnectSourcePanel: React.FC<{ source: typeof SOURCES[number] }> = ({ source }) => (
  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
    <div className="w-20 h-20 rounded-3xl grid place-items-center mb-6 text-3xl border border-white/10" style={{ background: source.bg, color: source.color }}>
      {source.glyph}
    </div>
    <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">Connect {source.label}</h2>
    <p className="text-[12px] text-white/40 max-w-sm leading-relaxed mb-6">
      Bridge your {source.label} channels and DMs into Plajah so every conversation lives in one place.
      This source isn't connected yet — bridging is coming soon.
    </p>
    <button disabled className="px-6 py-3 rounded-full bg-white/5 border border-white/10 text-white/40 text-[10px] font-black uppercase tracking-widest cursor-not-allowed">
      Connect {source.label} · Coming soon
    </button>
  </div>
);

export default ChatSpaces;
