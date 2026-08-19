import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  MessageSquare, Users, Search, Plus, Settings, ChevronLeft,
  Globe, Phone, Video, Edit3, Mail, Mic, Radio, Star,
  Hash, Lock, Bell, Archive, UserPlus, X, Check, ChevronRight,
  Sparkles, User, AtSign, Shield, MoreHorizontal, Heart,
  Copy, Share2, QrCode, BookUser, UserCheck, Trash2, LogOut, Clapperboard,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ChatRoom, UserProfile } from '../types';
import {
  listenToChatRooms, auth, createChatRoom,
  fetchUserProfiles, renameChatRoom, searchUserProfiles, deleteChatRoom,
  updateRoomIntimate,
} from '../services/backendService';
import {
  isPrivateDM, isBlockedMinor, isIntimateEligible, ineligibilityReason,
  beginIntimate, pauseIntimate, reconcileStalePartner, type IntimateProfile,
} from '../services/intimateGating';
import IntimateEnrollmentModal from './IntimateEnrollmentModal';
import { useCall } from '../contexts/CallContext';
import { buildShareUrl, shareOrigin } from '../services/deepLinkService';
import ChatWindow from './ChatWindow';
import CollaboBoard from './CollaboBoard';
import PostmanSystem from './PostmanSystem';
import ChatSpaces from './chat/ChatSpaces';
import { useShellNext } from '../hooks/useShellNext';

// ─── Types ────────────────────────────────────────────────────────────────────
type SidebarTab = 'ALL' | 'DIRECT' | 'GROUPS' | 'PRODUCTIONS' | 'CHANNELS' | 'SONGS' | 'POSTMAN';
type MainView = 'CHAT_LIST' | 'NEW_MESSAGE' | 'INVITE_FRIENDS' | 'FIND_CONTACTS';
const EMOJI_STATUS = ['😊', '🎵', '🎨', '💤', '🔥', '👻', '🌙', '⚡', '🎯', '🌊', '🎤', '🏆'];

interface ChatSystemProps {
  onBack?: () => void;
  initialRoomId?: string;
  currentUserProfile?: UserProfile;
}

// ─── Room avatar ──────────────────────────────────────────────────────────────
const RoomAvatar: React.FC<{ room: ChatRoom; profiles: Record<string, UserProfile>; size?: 'sm' | 'md' }> = ({
  room, profiles, size = 'md',
}) => {
  const uid = auth.currentUser?.uid;
  const dim = size === 'md' ? 'w-12 h-12' : 'w-9 h-9';

  if (room.type === 'PRIVATE') {
    const otherId = room.participants.find(id => id !== uid);
    const p = otherId ? profiles[otherId] : null;
    return (
      <div className={`${dim} rounded-2xl overflow-hidden border border-white/10 flex-shrink-0 bg-white/5 relative`}>
        {p?.photoURL
          ? <img src={p.photoURL} alt={p.displayName} className="w-full h-full object-cover" loading="lazy" />
          : <div className="w-full h-full flex items-center justify-center"><User size={size === 'md' ? 20 : 14} className="text-white/20" /></div>}
        <div className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 bg-green-500 border-2 border-black rounded-full" />
      </div>
    );
  }
  if (room.type === 'PUBLIC_LIVE') {
    // Song live chat — show cover art if available
    if (room.coverUrl) {
      return (
        <div className={`${dim} rounded-2xl flex-shrink-0 overflow-hidden border border-orange-500/30 relative`}>
          <img src={room.coverUrl} alt={room.name} className="w-full h-full object-cover" loading="lazy" />
          <div className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-red-500 rounded-full border border-black flex items-center justify-center">
            <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
          </div>
        </div>
      );
    }
    return (
      <div className={`${dim} rounded-2xl flex-shrink-0 flex items-center justify-center bg-gradient-to-br from-red-500/30 to-orange-500/30 border border-red-500/30`}>
        <Radio size={size === 'md' ? 18 : 14} className="text-red-400" />
      </div>
    );
  }
  const others = room.participants.filter(id => id !== uid).slice(0, 4);
  return (
    <div className={`${dim} rounded-2xl overflow-hidden border border-white/10 flex-shrink-0 bg-white/5`}>
      <div className="grid grid-cols-2 grid-rows-2 h-full w-full">
        {others.map(id => (
          <div key={id} className="border-[0.5px] border-black/20 overflow-hidden">
            {profiles[id]?.photoURL
              ? <img src={profiles[id].photoURL!} className="w-full h-full object-cover" alt="" loading="lazy" />
              : <div className="w-full h-full bg-white/10" />}
          </div>
        ))}
        {others.length === 0 && (
          <div className="col-span-2 row-span-2 flex items-center justify-center">
            <Users size={size === 'md' ? 18 : 14} className="text-white/20" />
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Room row ─────────────────────────────────────────────────────────────────
const RoomRow: React.FC<{
  room: ChatRoom;
  profiles: Record<string, UserProfile>;
  isActive: boolean;
  isDeleting?: boolean;
  menuOpen?: boolean;
  onSelect: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  onMenuToggle?: () => void;
  onMenuClose?: () => void;
  onToggleIntimate?: () => void;
  intimateMode?: boolean;
}> = ({ room, profiles, isActive, isDeleting, menuOpen, onSelect, onRename, onDelete, onMenuToggle, onMenuClose, onToggleIntimate, intimateMode }) => {
  const uid = auth.currentUser?.uid;
  const isOwner = room.ownerId === uid;

  let displayName = room.name || 'Conversation';
  if (room.type === 'PRIVATE') {
    const otherId = room.participants.find(id => id !== uid);
    displayName = otherId ? profiles[otherId]?.displayName || 'Loading…' : 'Saved Messages';
  } else if (room.type === 'GROUP' && !room.name) {
    displayName = 'Group Chat';
  } else if (room.type === 'PUBLIC_LIVE') {
    displayName = room.name || 'Live Channel';
  }
  const lastMsgTime = room.updatedAt
    ? new Date(room.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <motion.div layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="relative group">
      <button
        onClick={onSelect}
        disabled={isDeleting}
        className={`w-full p-3 rounded-2xl flex items-center gap-3 transition-all border text-left ${
          isDeleting ? 'opacity-40 pointer-events-none' :
          isActive
            ? intimateMode
              ? 'bg-rose-500/15 border-rose-500/30'
              : 'bg-small-orange/15 border-small-orange/30'
            : 'bg-white/[0.03] border-white/[0.05] hover:bg-white/[0.07] hover:border-white/10'
        }`}
      >
        <RoomAvatar room={room} profiles={profiles} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className={`text-sm font-black uppercase tracking-wider truncate ${
              isActive ? (intimateMode ? 'text-rose-300' : 'text-small-orange') : 'text-white'
            }`}>
              {displayName}
            </span>
            {isDeleting
              ? <div className="w-3 h-3 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin shrink-0" />
              : <span className="text-[8px] font-bold text-white/20 shrink-0">{lastMsgTime}</span>}
          </div>
          <p className="text-[11px] font-medium truncate text-white/30">
            {room.typingUsers?.filter(id => id !== uid).length
              ? <span className="text-green-400">typing…</span>
              : room.id.startsWith('live_chat_') && room.mediaArtist
                ? <span className="text-orange-400/70">{room.mediaArtist}</span>
                : room.lastMessage || 'No messages yet'}
          </p>
        </div>
      </button>

      {/* More options button */}
      {!isDeleting && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <button
            onClick={e => { e.stopPropagation(); onMenuToggle?.(); }}
            className="p-1.5 bg-black/40 text-white/25 hover:text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all"
          >
            <MoreHorizontal size={13} />
          </button>

          <AnimatePresence>
            {menuOpen && (
              <>
                {/* Click-away backdrop */}
                <div className="fixed inset-0 z-40" onClick={e => { e.stopPropagation(); onMenuClose?.(); }} />
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: -4 }}
                  className="absolute right-0 top-full mt-1 bg-[#111] border border-white/10 rounded-2xl p-1.5 z-50 shadow-2xl min-w-[148px]"
                  onClick={e => e.stopPropagation()}
                >
                  {room.type === 'PRIVATE' && (
                    <button
                      onClick={() => { onMenuClose?.(); onToggleIntimate?.(); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all text-left ${
                        intimateMode ? 'text-rose-300 hover:bg-rose-500/10' : 'hover:bg-white/5'
                      }`}
                    >
                      <Heart size={13} fill={intimateMode ? 'currentColor' : 'none'} className={intimateMode ? 'text-rose-400' : 'text-white/40'} />
                      <span className="text-[10px] font-black uppercase tracking-widest">
                        {intimateMode ? 'Nibbles On' : 'Nibbles'}
                      </span>
                    </button>
                  )}
                  {room.type === 'GROUP' && isOwner && (
                    <button
                      onClick={() => { onMenuClose?.(); onRename?.(); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/5 transition-all text-left"
                    >
                      <Edit3 size={13} className="text-white/40" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Rename</span>
                    </button>
                  )}
                  <button
                    onClick={() => onDelete?.()}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-red-500/10 transition-all text-left text-red-400"
                  >
                    <Trash2 size={13} />
                    <span className="text-[10px] font-black uppercase tracking-widest">
                      {room.type === 'PRIVATE' ? 'Delete Chat' : isOwner ? 'Delete Group' : 'Leave Group'}
                    </span>
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
};

// ─── Invite Friends panel ─────────────────────────────────────────────────────
const InviteFriendsPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [contactsSupported] = useState(() =>
    typeof window !== 'undefined' && 'contacts' in (navigator as any) && 'ContactsManager' in window,
  );
  const [contactsList, setContactsList] = useState<{ name: string; phone?: string; email?: string }[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [foundOnPlajah, setFoundOnPlajah] = useState<UserProfile[]>([]);
  const [inviteStep, setInviteStep] = useState<'main' | 'contacts'>('main');

  // Land the recipient directly on the inviter's profile (where they can message /
  // follow) instead of the bare homepage — a direct, working invite link.
  const inviteLink = auth.currentUser?.uid
    ? buildShareUrl('profile', auth.currentUser.uid)
    : shareOrigin();

  const copyLink = async () => {
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const shareLink = async () => {
    if (navigator.share) {
      await navigator.share({ title: 'Join me on Plajah', text: 'Connect with me on Plajah — the creator platform.', url: inviteLink }).catch(() => {});
    } else {
      copyLink();
    }
  };

  const loadContacts = async () => {
    if (!contactsSupported) return;
    setLoadingContacts(true);
    try {
      const cm = (navigator as any).contacts;
      const contacts = await cm.select(['name', 'tel', 'email'], { multiple: true });
      const list = (contacts as any[]).map((c: any) => ({
        name: c.name?.[0] ?? 'Unknown',
        phone: c.tel?.[0],
        email: c.email?.[0],
      }));
      setContactsList(list);

      // Search Plajah for matching users (by name)
      const names = list.map(c => c.name).filter(Boolean).slice(0, 20);
      if (names.length) {
        const searchProms = names.slice(0, 5).map(n => searchUserProfiles(n).catch(() => []));
        const results = (await Promise.all(searchProms)).flat();
        const unique = results.filter((u, i, a) => a.findIndex(x => x.uid === u.uid) === i && u.uid !== auth.currentUser?.uid);
        setFoundOnPlajah(unique.slice(0, 10));
      }
      setInviteStep('contacts');
    } catch {
      // User cancelled or permission denied
    } finally {
      setLoadingContacts(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-5 pb-4 border-b border-white/8 flex items-center gap-3">
        <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl transition-all">
          <ChevronLeft size={18} />
        </button>
        <h2 className="text-base font-black uppercase tracking-widest text-white">Invite to Plajah</h2>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {inviteStep === 'main' ? (
          <div className="p-5 space-y-4">
            {/* Invite link card */}
            <div className="p-5 bg-gradient-to-br from-small-orange/10 to-purple-500/10 border border-white/10 rounded-[1.5rem] space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-small-orange/20 flex items-center justify-center border border-small-orange/30">
                  <Share2 size={18} className="text-small-orange" />
                </div>
                <div>
                  <p className="text-sm font-black text-white">Your Invite Link</p>
                  <p className="text-[9px] text-white/40 font-bold">Share to bring friends to Plajah</p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-xl px-3 py-2">
                <p className="flex-1 text-[10px] font-bold text-white/50 truncate">{inviteLink}</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={copyLink}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${
                    copied ? 'bg-green-500/20 border-green-500/30 text-green-400' : 'bg-white/5 border-white/10 text-white/60 hover:text-white hover:border-white/20'
                  }`}
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  onClick={() => setShowQR(p => !p)}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${
                    showQR ? 'bg-purple-500/20 border-purple-500/30 text-purple-300' : 'bg-white/5 border-white/10 text-white/60 hover:text-white hover:border-white/20'
                  }`}
                >
                  <QrCode size={12} /> QR
                </button>
                <button
                  onClick={shareLink}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest bg-small-orange text-black hover:bg-small-orange/80 transition-all"
                >
                  <Share2 size={12} /> Share
                </button>
              </div>
              {/* QR Code */}
              {showQR && (
                <div className="mt-3 flex flex-col items-center gap-3 p-4 bg-white rounded-2xl">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(inviteLink)}`}
                    alt="QR Code"
                    className="w-40 h-40 rounded-xl"
                  />
                  <p className="text-[8px] font-black uppercase tracking-widest text-black/40">Scan to join Plajah</p>
                </div>
              )}
            </div>

            {/* Contacts option */}
            <div className="space-y-2">
              <p className="text-[8px] font-black uppercase tracking-[0.35em] text-white/30 px-1">From Your Contacts</p>
              {contactsSupported ? (
                <button
                  onClick={loadContacts}
                  disabled={loadingContacts}
                  className="w-full flex items-center gap-4 p-4 bg-white/[0.03] border border-white/8 rounded-[1.5rem] hover:bg-white/[0.07] hover:border-white/15 transition-all text-left group"
                >
                  <div className="w-11 h-11 rounded-2xl bg-blue-500/15 border border-blue-500/25 flex items-center justify-center shrink-0">
                    {loadingContacts
                      ? <div className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                      : <User size={18} className="text-blue-400" />}
                  </div>
                  <div>
                    <p className="text-sm font-black text-white group-hover:text-small-orange transition-colors">Browse Contacts</p>
                    <p className="text-[9px] text-white/35 mt-0.5">See who's already on Plajah and invite others</p>
                  </div>
                  <ChevronRight size={16} className="text-white/20 group-hover:text-small-orange transition-colors ml-auto shrink-0" />
                </button>
              ) : (
                <div className="p-4 bg-white/[0.02] border border-white/5 rounded-[1.5rem]">
                  <p className="text-[9px] font-black text-white/30">Contacts access is available on Chrome for Android and Safari on iOS. Share your invite link above to connect!</p>
                </div>
              )}
            </div>

            {/* SMS / Email */}
            <div className="space-y-2">
              <p className="text-[8px] font-black uppercase tracking-[0.35em] text-white/30 px-1">Other Ways to Invite</p>
              <div className="space-y-2">
                {[
                  { icon: <Phone size={16} className="text-green-400" />, label: 'SMS', desc: 'Send via text message', bg: 'bg-green-500/15', border: 'border-green-500/25',
                    onClick: () => window.open(`sms:?body=${encodeURIComponent(`Join me on Plajah! ${inviteLink}`)}`) },
                  { icon: <Mail size={16} className="text-blue-400" />, label: 'Email', desc: 'Send via email', bg: 'bg-blue-500/15', border: 'border-blue-500/25',
                    onClick: () => window.open(`mailto:?subject=${encodeURIComponent('Join me on Plajah')}&body=${encodeURIComponent(`Hey! Join me on Plajah — the creator platform.\n\n${inviteLink}`)}`) },
                ].map(item => (
                  <button key={item.label} onClick={item.onClick}
                    className="w-full flex items-center gap-4 p-3.5 bg-white/[0.03] border border-white/8 rounded-[1.5rem] hover:bg-white/[0.07] hover:border-white/15 transition-all text-left group"
                  >
                    <div className={`w-9 h-9 rounded-xl ${item.bg} border ${item.border} flex items-center justify-center shrink-0`}>{item.icon}</div>
                    <div>
                      <p className="text-[10px] font-black text-white group-hover:text-small-orange transition-colors">{item.label}</p>
                      <p className="text-[8px] text-white/35">{item.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Contacts found */
          <div className="p-5 space-y-5">
            <button onClick={() => setInviteStep('main')} className="flex items-center gap-2 text-white/40 hover:text-white text-[9px] font-black uppercase tracking-widest transition-all">
              <ChevronLeft size={14} /> Back
            </button>

            {foundOnPlajah.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <UserCheck size={14} className="text-green-400" />
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/50">{foundOnPlajah.length} Contacts on Plajah</p>
                </div>
                <div className="space-y-2">
                  {foundOnPlajah.map(u => (
                    <div key={u.uid} className="flex items-center gap-3 p-3 bg-white/[0.03] border border-white/8 rounded-2xl">
                      <img src={u.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.uid}`} className="w-9 h-9 rounded-xl object-cover border border-white/10" alt="" loading="lazy" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black text-white truncate">{u.displayName}</p>
                        <p className="text-[8px] text-green-400 font-black uppercase tracking-widest">On Plajah</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {contactsList.length > 0 && (
              <div className="space-y-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Invite from Contacts ({contactsList.length})</p>
                <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                  {contactsList.slice(0, 30).map((c, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-white/[0.02] border border-white/5 rounded-xl">
                      <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                        <span className="text-sm font-black text-white/40">{c.name[0]}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black text-white truncate">{c.name}</p>
                        <p className="text-[8px] text-white/25">{c.phone || c.email || ''}</p>
                      </div>
                      <button
                        onClick={() => {
                          const body = `Hey ${c.name}! Join me on Plajah — the creator platform. ${inviteLink}`;
                          if (c.phone) window.open(`sms:${c.phone}?body=${encodeURIComponent(body)}`);
                          else if (c.email) window.open(`mailto:${c.email}?subject=${encodeURIComponent('Join me on Plajah')}&body=${encodeURIComponent(body)}`);
                        }}
                        className="px-2.5 py-1.5 bg-small-orange/15 border border-small-orange/25 text-small-orange text-[7px] font-black uppercase tracking-widest rounded-lg hover:bg-small-orange/25 transition-all shrink-0"
                      >
                        Invite
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Find Contacts panel ──────────────────────────────────────────────────────
const FindContactsPanel: React.FC<{
  onClose: () => void;
  onStartDM: (user: UserProfile) => void;
}> = ({ onClose, onStartDM }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [dmStarting, setDmStarting] = useState<string | null>(null);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const users = await searchUserProfiles(query);
        setResults(users.filter(u => u.uid !== auth.currentUser?.uid));
      } catch { setResults([]); }
      setSearching(false);
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const handleDM = async (user: UserProfile) => {
    setDmStarting(user.uid);
    await onStartDM(user);
    setDmStarting(null);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-5 pb-4 border-b border-white/8 flex items-center gap-3">
        <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl transition-all">
          <ChevronLeft size={18} />
        </button>
        <h2 className="text-base font-black uppercase tracking-widest text-white">Find People</h2>
      </div>

      <div className="px-4 py-3 border-b border-white/[0.05]">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20" size={14} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name…"
            autoFocus
            className="w-full bg-white/[0.05] border border-white/[0.07] rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-small-orange/40 transition-all"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {searching ? (
          <div className="py-14 flex flex-col items-center gap-3">
            <div className="w-6 h-6 border-2 border-small-orange/30 border-t-small-orange rounded-full animate-spin" />
            <p className="text-[8px] font-black uppercase tracking-widest text-white/25">Searching…</p>
          </div>
        ) : results.length > 0 ? (
          <div className="p-3 space-y-1.5">
            {results.map(u => (
              <div key={u.uid} className="flex items-center gap-3 p-3 bg-white/[0.03] border border-white/[0.05] rounded-2xl">
                <img
                  src={u.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.uid}`}
                  className="w-10 h-10 rounded-xl object-cover border border-white/10 shrink-0"
                  alt=""
                  loading="lazy"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-wider text-white truncate">{u.displayName}</p>
                  <p className="text-[9px] text-white/30 truncate">{u.bio || 'Plajah Creator'}</p>
                </div>
                <button
                  onClick={() => handleDM(u)}
                  disabled={dmStarting === u.uid}
                  className="px-3 py-1.5 bg-small-orange/15 border border-small-orange/25 text-small-orange text-[8px] font-black uppercase tracking-widest rounded-lg hover:bg-small-orange/25 transition-all disabled:opacity-50 shrink-0 flex items-center gap-1.5"
                >
                  {dmStarting === u.uid
                    ? <div className="w-3 h-3 border-2 border-small-orange/30 border-t-small-orange rounded-full animate-spin" />
                    : <MessageSquare size={11} />}
                  DM
                </button>
              </div>
            ))}
          </div>
        ) : query.length >= 2 ? (
          <div className="py-14 text-center space-y-3">
            <BookUser size={28} className="mx-auto text-white/10" />
            <p className="text-[9px] font-black uppercase tracking-widest text-white/20">No people found</p>
          </div>
        ) : (
          <div className="p-6 space-y-5">
            <p className="text-[8px] font-black uppercase tracking-[0.35em] text-white/25 text-center pt-4">
              Search to find people on Plajah
            </p>
            <div className="p-4 bg-white/[0.02] border border-white/[0.05] rounded-2xl flex items-center gap-4">
              <div className="w-10 h-10 rounded-2xl bg-purple-500/15 border border-purple-500/20 flex items-center justify-center shrink-0">
                <BookUser size={18} className="text-purple-400" />
              </div>
              <div>
                <p className="text-[10px] font-black text-white">Discover Creators</p>
                <p className="text-[9px] text-white/30 mt-0.5">Search by name to find and message anyone on Plajah</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Couples / Intimate mode styling ──────────────────────────────────────────
const INTIMATE_STYLE = {
  bg: 'linear-gradient(160deg, #1a0008 0%, #2d0010 50%, #0d0005 100%)',
  accent: '#c0392b',
  accentLight: '#ff6b6b',
  bubble: {
    backdropFilter: 'blur(10px) saturate(180%)',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
} as const;

// ─── Main ChatSystem ───────────────────────────────────────────────────────────
const ChatSystem: React.FC<ChatSystemProps> = ({ onBack, initialRoomId, currentUserProfile }) => {
  const [rooms, setRooms]                   = useState<ChatRoom[]>([]);
  const [profiles, setProfiles]             = useState<Record<string, UserProfile>>({});
  const [activeRoom, setActiveRoom]         = useState<ChatRoom | null>(null);
  const [activeCollabId, setActiveCollabId] = useState<string | null>(null);
  const { placeCall } = useCall();
  const { enabled: shellNext } = useShellNext();
  // Land on DMs first — a user's direct conversations are what they open chat for,
  // not the firehose of every group/channel.
  const [sidebarTab, setSidebarTab]         = useState<SidebarTab>('DIRECT');
  const [searchTerm, setSearchTerm]         = useState('');
  const [mainView, setMainView]             = useState<MainView>('CHAT_LIST');
  // Intimate rooms are now persisted on each room doc (shared across both participants),
  // so derive the set from the live room list instead of ephemeral local state.
  const intimateRooms = useMemo(() => new Set(rooms.filter(r => r.isIntimate).map(r => r.id)), [rooms]);

  // New room modal
  const [showNewModal, setShowNewModal]     = useState<'GROUP' | 'CHANNEL' | null>(null);
  const [newRoomName, setNewRoomName]       = useState('');
  const [newRoomDesc, setNewRoomDesc]       = useState('');

  // DM search
  const [showUserSearch, setShowUserSearch] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [foundUsers, setFoundUsers]         = useState<UserProfile[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);

  // Status
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [myStatus, setMyStatus]             = useState('');

  // Tracks a just-created DM so we auto-open it when the listener fires
  const pendingDmUidRef = useRef<string | null>(null);

  // Room context menu (delete / leave / rename)
  const [roomMenu, setRoomMenu]             = useState<string | null>(null); // roomId
  const [deletingRoom, setDeletingRoom]     = useState<string | null>(null);

  // ── User search debounce ────────────────────────────────────────────────────
  useEffect(() => {
    if (!userSearchTerm.trim()) { setFoundUsers([]); return; }
    setIsSearchingUsers(true);
    const t = setTimeout(async () => {
      try {
        const users = await searchUserProfiles(userSearchTerm);
        setFoundUsers(users.filter(u => u.uid !== auth.currentUser?.uid));
      } catch { setFoundUsers([]); }
      setIsSearchingUsers(false);
    }, 350);
    return () => clearTimeout(t);
  }, [userSearchTerm]);

  // ── Room + call listeners ───────────────────────────────────────────────────
  useEffect(() => {
    const unsubRooms = listenToChatRooms(items => {
      setRooms(items);
      // Keep the open conversation in sync with its latest doc so shared changes
      // (intimate background/theme/pet name, from either partner) reflect live.
      setActiveRoom(prev => (prev ? (items.find(r => r.id === prev.id) || prev) : prev));

      // Auto-open a DM room that was just created via handleStartDM
      if (pendingDmUidRef.current) {
        const myUid = auth.currentUser?.uid;
        const pendingRoom = items.find(r =>
          r.type === 'PRIVATE' &&
          r.participants.includes(myUid ?? '') &&
          r.participants.includes(pendingDmUidRef.current!),
        );
        if (pendingRoom) {
          setActiveRoom(pendingRoom);
          pendingDmUidRef.current = null;
        }
      }

      const allUids = Array.from(new Set(items.flatMap(r => r.participants)));
      setProfiles(prev => {
        const missing = allUids.filter(uid => !prev[uid]);
        if (missing.length) {
          fetchUserProfiles(missing).then(ps => {
            setProfiles(cur => {
              const map = { ...cur };
              ps.forEach(p => { map[p.uid] = p; });
              return map;
            });
          }).catch(() => {});
        }
        return prev;
      });
    });

    return () => { unsubRooms(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-open room from URL/prop ────────────────────────────────────────────
  useEffect(() => {
    if (initialRoomId && rooms.length) {
      const room = rooms.find(r => r.id === initialRoomId);
      if (room) setActiveRoom(room);
    }
  }, [initialRoomId, rooms]);

  // ── Room filtering ──────────────────────────────────────────────────────────
  const filteredRooms = rooms.filter(room => {
    const uid = auth.currentUser?.uid;
    let name = room.name || '';
    if (room.type === 'PRIVATE') {
      const otherId = room.participants.find(id => id !== uid);
      name = otherId ? profiles[otherId]?.displayName || '' : 'Saved Messages';
    }
    if (searchTerm && !name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (sidebarTab === 'ALL') return true;
    if (sidebarTab === 'DIRECT') return room.type === 'PRIVATE';
    if (sidebarTab === 'GROUPS') return (room.type === 'GROUP' || room.type === 'CLASSROOM') && room.workspaceType !== 'PRODUCTION';
    if (sidebarTab === 'PRODUCTIONS') return room.workspaceType === 'PRODUCTION';
    if (sidebarTab === 'CHANNELS') return room.type === 'PUBLIC_LIVE' && !room.id.startsWith('live_chat_');
    if (sidebarTab === 'SONGS') return room.id.startsWith('live_chat_');
    return false;
  });

  // ── Actions ─────────────────────────────────────────────────────────────────
  const handleCreateRoom = async () => {
    if (!newRoomName.trim() || !showNewModal) return;
    const type = showNewModal === 'CHANNEL' ? 'PUBLIC_LIVE' : 'GROUP';
    await createChatRoom([auth.currentUser?.uid || ''], type, newRoomName).catch(() => {});
    setShowNewModal(null);
    setNewRoomName('');
    setNewRoomDesc('');
  };

  const handleRenameRoom = async (roomId: string) => {
    const room = rooms.find(r => r.id === roomId);
    if (!room || room.ownerId !== auth.currentUser?.uid) return;
    const newName = prompt('Rename group:', room.name || '');
    if (newName && newName !== room.name) await renameChatRoom(roomId, newName).catch(() => {});
  };

  const handleDeleteRoom = async (roomId: string) => {
    setRoomMenu(null);
    setDeletingRoom(roomId);
    if (activeRoom?.id === roomId) setActiveRoom(null);
    await deleteChatRoom(roomId).catch(() => {});
    setDeletingRoom(null);
  };

  const handleStartDM = async (user: UserProfile) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    // Pre-populate profile so the room row shows the name immediately
    setProfiles(prev => prev[user.uid] ? prev : { ...prev, [user.uid]: user });
    const existing = rooms.find(r =>
      r.type === 'PRIVATE' &&
      r.participants.length === 2 &&
      r.participants.includes(user.uid) &&
      r.participants.includes(uid),
    );
    if (existing) {
      setActiveRoom(existing);
    } else {
      pendingDmUidRef.current = user.uid;
      await createChatRoom([uid, user.uid], 'PRIVATE').catch(() => {});
    }
    setShowUserSearch(false);
    setUserSearchTerm('');
    setFoundUsers([]);
  };

  const [enrollForRoomId, setEnrollForRoomId] = useState<string | null>(null);

  const me = currentUserProfile as IntimateProfile | null;

  // Optimistically flip the shared room flag on in local state.
  const markRoomIntimateOn = (roomId: string) => {
    setRooms(prev => prev.map(r => (r.id === roomId ? { ...r, isIntimate: true } : r)));
    setActiveRoom(prev => (prev && prev.id === roomId ? { ...prev, isIntimate: true } : prev));
  };

  // Enable intimate mode for a room after all gates pass (or right after enrollment).
  const enableIntimate = async (roomId: string, skipEligibility = false) => {
    const room = rooms.find(r => r.id === roomId) || (activeRoom?.id === roomId ? activeRoom : null);
    if (!room) return;
    const otherUid = room.participants.find(id => id !== auth.currentUser?.uid);
    if (!otherUid) return;
    const partner = (profiles[otherUid] as IntimateProfile) || null;
    const res = await beginIntimate(room, me as IntimateProfile, partner, otherUid, skipEligibility);
    if (!res.ok) { if (res.reason) alert(res.reason); return; }
    markRoomIntimateOn(roomId);
  };

  const toggleIntimate = (roomId: string) => {
    const room = rooms.find(r => r.id === roomId) || (activeRoom?.id === roomId ? activeRoom : null);
    if (!room) return;
    // Hard guard: intimate mode is 1:1 private DMs only (never org/group/live).
    if (!isPrivateDM(room)) { alert('Nibbles only works in a one-on-one direct message.'); return; }

    const turningOn = !room.isIntimate;
    if (!turningOn) {
      // Toggle OFF just pauses (keeps the thread + diary). "Call it off" fully ends it.
      setRooms(prev => prev.map(r => (r.id === roomId ? { ...r, isIntimate: false } : r)));
      setActiveRoom(prev => (prev && prev.id === roomId ? { ...prev, isIntimate: false } : prev));
      pauseIntimate(roomId).catch(() => {});
      return;
    }

    // Turning ON — enforce the adult + enrollment gate.
    if (isBlockedMinor(me)) { alert('Nibbles is for adult accounts only.'); return; }
    if (!isIntimateEligible(me)) { setEnrollForRoomId(roomId); return; } // opt-in / DOB flow
    const reason = ineligibilityReason(me);
    if (reason) { alert(reason); return; }
    enableIntimate(roomId);
  };

  // Free up a stale single-active partner link if that connection is gone.
  useEffect(() => {
    if (me?.uid && rooms.length) reconcileStalePartner(me, rooms).catch(() => {});
  }, [me?.uid, rooms.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentRoomIsIntimate = activeRoom ? !!activeRoom.isIntimate : false;

  const TABS: { id: SidebarTab; label: string; icon: React.FC<any> }[] = [
    { id: 'ALL',      label: 'All',     icon: MessageSquare },
    { id: 'DIRECT',   label: 'DMs',     icon: User },
    { id: 'GROUPS',   label: 'Groups',  icon: Users },
    { id: 'PRODUCTIONS', label: 'Sets', icon: Clapperboard },
    { id: 'SONGS',    label: 'Songs',   icon: Hash },
    { id: 'CHANNELS', label: 'Live',    icon: Radio },
    { id: 'POSTMAN',  label: 'Mail',    icon: Mail },
  ];

  // ── Render ───────────────────────────────────────────────────────────────────
  // New "Workspaces & Servers" shell (beta): gated internally so the classic chat
  // below is byte-for-byte preserved when the flag is off. Reuses the same live
  // room list, profiles, ChatWindow and intimate handlers — only the shell changes.
  if (shellNext) {
    return (
      <ChatSpaces
        rooms={rooms}
        profiles={profiles}
        activeRoom={activeRoom}
        setActiveRoom={setActiveRoom}
        currentUserProfile={currentUserProfile}
        intimateRooms={intimateRooms}
        onBack={onBack}
        onStartDM={handleStartDM}
        onToggleIntimate={toggleIntimate}
        onDeleteRoom={handleDeleteRoom}
        onRenameRoom={handleRenameRoom}
        enrollForRoomId={enrollForRoomId}
        setEnrollForRoomId={setEnrollForRoomId}
        me={me}
        enableIntimate={enableIntimate}
      />
    );
  }

  return (
    <div
      className="h-full flex overflow-hidden relative pb-20 md:pb-0"
      style={currentRoomIsIntimate ? { background: INTIMATE_STYLE.bg } : {}}
    >
      {/* Intimate ambient glow */}
      {currentRoomIsIntimate && (
        <div className="absolute inset-0 pointer-events-none z-0">
          <div className="absolute top-0 left-1/4 w-64 h-64 bg-rose-900/20 rounded-full blur-[80px]" />
          <div className="absolute bottom-0 right-1/4 w-48 h-48 bg-red-900/15 rounded-full blur-[60px]" />
        </div>
      )}

      {/* ── LEFT SIDEBAR — full-width room list on phone; fixed panel at md+ ── */}
      <div className={`w-full md:w-80 lg:w-96 border-r flex flex-col z-10 ${
        currentRoomIsIntimate ? 'border-rose-900/30 bg-black/20 backdrop-blur-xl' : 'border-white/[0.06] bg-black/20 backdrop-blur-xl'
      } ${activeRoom || activeCollabId || mainView !== 'CHAT_LIST' ? 'hidden md:flex' : 'flex'}`}>

        {/* Invite Friends panel */}
        {mainView === 'INVITE_FRIENDS' && (
          <InviteFriendsPanel onClose={() => setMainView('CHAT_LIST')} />
        )}

        {/* Find Contacts panel */}
        {mainView === 'FIND_CONTACTS' && (
          <FindContactsPanel
            onClose={() => setMainView('CHAT_LIST')}
            onStartDM={async user => {
              await handleStartDM(user);
              setMainView('CHAT_LIST');
            }}
          />
        )}

        {mainView === 'CHAT_LIST' && (
          <>
            {/* Header */}
            <div className="px-5 pt-5 pb-4 border-b border-white/[0.05] space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {onBack && (
                    <button onClick={onBack} className="p-2 bg-white/5 rounded-xl hover:bg-white/10 transition-all">
                      <ChevronLeft size={16} />
                    </button>
                  )}
                  {/* Status emoji */}
                  <div className="relative">
                    <button
                      onClick={() => setShowStatusPicker(p => !p)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-xl hover:bg-white/10 border border-white/[0.06] transition-all"
                    >
                      <div className="w-2 h-2 bg-green-500 rounded-full" />
                      <span className="text-[9px] font-black uppercase tracking-widest text-white/60">
                        {myStatus || 'Online'}
                      </span>
                    </button>
                    <AnimatePresence>
                      {showStatusPicker && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.92, y: -4 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.92, y: -4 }}
                          className="absolute top-full left-0 mt-2 bg-black/95 backdrop-blur-2xl border border-white/10 rounded-2xl p-3 z-50 shadow-2xl grid grid-cols-6 gap-1.5 w-max"
                        >
                          {EMOJI_STATUS.map(e => (
                            <button key={e} onClick={() => { setMyStatus(e); setShowStatusPicker(false); }}
                              className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-white/10 transition-all text-base">
                              {e}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button onClick={() => setShowUserSearch(true)} className="p-2 text-white/35 hover:text-white hover:bg-white/5 rounded-xl transition-all" title="New Message">
                    <Search size={16} />
                  </button>
                  <button onClick={() => setMainView('FIND_CONTACTS')} className="p-2 text-white/35 hover:text-white hover:bg-white/5 rounded-xl transition-all" title="Find People">
                    <BookUser size={16} />
                  </button>
                  <button onClick={() => setShowNewModal('GROUP')} className="p-2 text-white/35 hover:text-white hover:bg-white/5 rounded-xl transition-all" title="New Group">
                    <Users size={16} />
                  </button>
                  <button onClick={() => setMainView('INVITE_FRIENDS')} className="p-2 text-white/35 hover:text-white hover:bg-white/5 rounded-xl transition-all" title="Invite Friends">
                    <UserPlus size={16} />
                  </button>
                </div>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20" size={14} />
                <input
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search conversations…"
                  className="w-full bg-white/[0.05] border border-white/[0.07] rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-small-orange/40 transition-all"
                />
              </div>
            </div>

            {/* Tab bar */}
            <div className="flex items-center gap-1 px-3 py-2 border-b border-white/[0.05] overflow-x-auto no-scrollbar">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setSidebarTab(tab.id)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all text-[8px] font-black uppercase tracking-widest ${
                    sidebarTab === tab.id
                      ? 'bg-small-orange/20 text-small-orange border border-small-orange/25'
                      : 'text-white/30 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <tab.icon size={11} /> {tab.label}
                </button>
              ))}
            </div>

            {/* Room list */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {sidebarTab === 'POSTMAN' ? (
                <div className="p-4">
                  <PostmanSystem />
                </div>
              ) : (
                <div className="p-3 space-y-1">
                  {filteredRooms.length === 0 ? (
                    <div className="py-14 text-center space-y-4">
                      <MessageSquare size={32} className="text-white/10 mx-auto" />
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/20">
                        {searchTerm ? 'No conversations match' : 'No conversations yet'}
                      </p>
                      {!searchTerm && (
                        <div className="flex flex-col items-center gap-2">
                          <button
                            onClick={() => setShowUserSearch(true)}
                            className="px-5 py-2.5 bg-small-orange/20 border border-small-orange/30 text-small-orange text-[9px] font-black uppercase tracking-widest rounded-full hover:bg-small-orange/30 transition-all"
                          >
                            Start a Conversation
                          </button>
                          <button
                            onClick={() => setMainView('INVITE_FRIENDS')}
                            className="px-5 py-2.5 bg-white/5 border border-white/10 text-white/40 text-[9px] font-black uppercase tracking-widest rounded-full hover:bg-white/10 transition-all"
                          >
                            Invite Friends
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <AnimatePresence>
                      {filteredRooms.map(room => (
                        <RoomRow
                          key={room.id}
                          room={room}
                          profiles={profiles}
                          isActive={activeRoom?.id === room.id}
                          isDeleting={deletingRoom === room.id}
                          menuOpen={roomMenu === room.id}
                          intimateMode={intimateRooms.has(room.id)}
                          onSelect={() => { setActiveRoom(room); setActiveCollabId(null); setRoomMenu(null); }}
                          onRename={() => handleRenameRoom(room.id)}
                          onDelete={() => handleDeleteRoom(room.id)}
                          onMenuToggle={() => setRoomMenu(prev => prev === room.id ? null : room.id)}
                          onMenuClose={() => setRoomMenu(null)}
                          onToggleIntimate={() => toggleIntimate(room.id)}
                        />
                      ))}
                    </AnimatePresence>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── MAIN CHAT AREA — hidden on phone until a room is open (single-pane) ── */}
      <div className={`${activeRoom || activeCollabId ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0 relative z-10`}>
        {activeCollabId ? (
          <CollaboBoard projectId={activeCollabId} onBack={() => setActiveCollabId(null)} />
        ) : activeRoom ? (
          <div className="flex flex-col h-full">
            {/* Intimate mode toggle bar */}
            {activeRoom.type === 'PRIVATE' && (
              <div className={`shrink-0 px-4 py-2 flex items-center justify-end border-b transition-all ${
                currentRoomIsIntimate ? 'border-rose-900/30 bg-black/20' : 'border-white/5 bg-transparent'
              }`}>
                <button
                  onClick={() => toggleIntimate(activeRoom.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest border transition-all ${
                    currentRoomIsIntimate
                      ? 'bg-rose-500/20 border-rose-500/30 text-rose-300'
                      : 'bg-white/5 border-white/10 text-white/30 hover:text-white hover:border-white/20'
                  }`}
                >
                  <Heart size={11} fill={currentRoomIsIntimate ? 'currentColor' : 'none'} />
                  {currentRoomIsIntimate ? 'Nibbles On' : 'Nibbles'}
                </button>
              </div>
            )}
            <ChatWindow
              room={activeRoom}
              profiles={profiles}
              currentUserProfile={currentUserProfile}
              onBack={() => { setActiveRoom(null); setActiveCollabId(null); }}
              onOpenCollab={id => setActiveCollabId(id)}
              onStartVideo={() => activeRoom && placeCall(activeRoom, 'VIDEO')}
              onStartAudio={() => activeRoom && placeCall(activeRoom, 'AUDIO')}
            />
          </div>
        ) : (
          <div className="hidden lg:flex flex-1 flex-col items-center justify-center p-12 text-center">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 24 }}
              className="w-28 h-28 bg-gradient-to-br from-small-orange/20 to-purple-500/20 rounded-[2rem] flex items-center justify-center mb-8 border border-white/10 shadow-2xl"
            >
              <Sparkles size={44} className="text-small-orange" />
            </motion.div>
            <h2 className="text-3xl font-black uppercase tracking-tighter mb-3">Plajah Messenger</h2>
            <p className="text-[11px] font-bold text-white/25 uppercase tracking-[0.2em] max-w-xs leading-loose">
              Encrypted messages · Voice & video · Reactions · Fediverse ready
            </p>
            <div className="flex items-center gap-3 mt-8">
              <button
                onClick={() => setShowUserSearch(true)}
                className="px-7 py-3.5 bg-small-orange text-white font-black uppercase tracking-widest text-[9px] rounded-full hover:bg-small-orange/80 transition-all shadow-lg"
              >
                New Message
              </button>
              <button
                onClick={() => setMainView('INVITE_FRIENDS')}
                className="px-7 py-3.5 bg-white/5 border border-white/10 text-white/50 font-black uppercase tracking-widest text-[9px] rounded-full hover:bg-white/10 hover:text-white transition-all"
              >
                Invite Friends
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Video calls + incoming rings are handled globally by CallProvider. */}

      {/* ── INTIMATE ENROLLMENT (opt-in, 18+) ────────────────────────────── */}
      {enrollForRoomId && me?.uid && (
        <IntimateEnrollmentModal
          uid={me.uid}
          accent={INTIMATE_STYLE.accentLight}
          onClose={() => setEnrollForRoomId(null)}
          onEnrolled={() => { const rid = enrollForRoomId; setEnrollForRoomId(null); if (rid) enableIntimate(rid, true); }}
        />
      )}

      {/* ── NEW ROOM MODAL ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {showNewModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/85 backdrop-blur-xl z-[500] flex items-end sm:items-center justify-center sm:p-6"
            onClick={() => setShowNewModal(null)}
          >
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
              className="w-full sm:max-w-sm bg-[#0e0e0e] border border-white/10 rounded-t-[2rem] sm:rounded-[2rem] p-7 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className={`p-3 rounded-2xl ${showNewModal === 'CHANNEL' ? 'bg-red-500/20' : 'bg-small-orange/20'}`}>
                  {showNewModal === 'CHANNEL'
                    ? <Radio size={18} className="text-red-400" />
                    : <Users size={18} className="text-small-orange" />}
                </div>
                <div>
                  <h2 className="text-base font-black uppercase tracking-tighter">{showNewModal === 'CHANNEL' ? 'New Channel' : 'New Group'}</h2>
                  <p className="text-[8px] text-white/30 font-bold uppercase tracking-widest">{showNewModal === 'CHANNEL' ? 'Broadcast to followers' : 'Private group chat'}</p>
                </div>
              </div>
              <div className="space-y-3 mb-6">
                <input
                  value={newRoomName} onChange={e => setNewRoomName(e.target.value)}
                  placeholder={showNewModal === 'CHANNEL' ? 'Channel name…' : 'Group name…'}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white text-sm outline-none focus:border-small-orange/50 transition-all"
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateRoom(); }}
                />
                <textarea
                  value={newRoomDesc} onChange={e => setNewRoomDesc(e.target.value)}
                  placeholder="Description (optional)"
                  rows={2}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white text-sm outline-none focus:border-small-orange/50 transition-all resize-none"
                />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowNewModal(null)} className="flex-1 py-3 bg-white/5 text-white/40 font-black uppercase text-[9px] tracking-widest rounded-full hover:bg-white/10 transition-all">Cancel</button>
                <button onClick={handleCreateRoom} disabled={!newRoomName.trim()}
                  className="flex-1 py-3 bg-small-orange text-white font-black uppercase text-[9px] tracking-widest rounded-full hover:bg-small-orange/80 transition-all disabled:opacity-30">
                  Create
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── NEW MESSAGE / USER SEARCH ─────────────────────────────────────── */}
      <AnimatePresence>
        {showUserSearch && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/85 backdrop-blur-xl z-[500] flex items-end sm:items-center justify-center sm:p-6"
            onClick={() => { setShowUserSearch(false); setUserSearchTerm(''); setFoundUsers([]); }}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              className="w-full sm:max-w-md bg-[#0e0e0e] border border-white/10 rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl flex flex-col max-h-[75vh]"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-5 border-b border-white/[0.06] space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-black uppercase tracking-tighter">New Message</h2>
                  <button onClick={() => { setShowUserSearch(false); setUserSearchTerm(''); setFoundUsers([]); }}
                    className="p-1.5 hover:bg-white/10 rounded-xl transition-all">
                    <X size={16} />
                  </button>
                </div>
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20" size={14} />
                  <input
                    value={userSearchTerm} onChange={e => setUserSearchTerm(e.target.value)}
                    placeholder="Search Plajah users…"
                    className="w-full bg-white/[0.05] border border-white/[0.07] rounded-xl pl-9 pr-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-small-orange/40 transition-all"
                    autoFocus
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1.5">
                {isSearchingUsers ? (
                  <div className="py-10 flex flex-col items-center gap-3">
                    <div className="w-6 h-6 border-2 border-small-orange/30 border-t-small-orange rounded-full animate-spin" />
                    <p className="text-[8px] font-black uppercase tracking-widest text-white/25">Searching…</p>
                  </div>
                ) : foundUsers.length > 0 ? (
                  foundUsers.map(u => (
                    <button key={u.uid} onClick={() => handleStartDM(u)}
                      className="w-full p-3 rounded-2xl bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.08] hover:border-white/10 transition-all flex items-center gap-3 group"
                    >
                      <img src={u.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.uid}`} className="w-10 h-10 rounded-xl object-cover border border-white/10" alt="" loading="lazy" />
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-sm font-black group-hover:text-small-orange transition-colors truncate">{u.displayName}</p>
                        <p className="text-[9px] font-bold text-white/25 truncate">{u.bio || 'Plajah Creator'}</p>
                      </div>
                      <MessageSquare size={15} className="text-white/20 group-hover:text-small-orange transition-all shrink-0" />
                    </button>
                  ))
                ) : userSearchTerm.length >= 2 ? (
                  <div className="py-12 text-center space-y-3">
                    <User size={28} className="mx-auto text-white/10" />
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/20">No users found</p>
                    <button onClick={() => { setShowUserSearch(false); setMainView('INVITE_FRIENDS'); }}
                      className="px-4 py-2 bg-small-orange/15 border border-small-orange/25 text-small-orange text-[8px] font-black uppercase tracking-widest rounded-full hover:bg-small-orange/25 transition-all">
                      Invite Friends
                    </button>
                  </div>
                ) : (
                  <div className="py-10 text-center">
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/20">Type to search Plajah users</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ChatSystem;
