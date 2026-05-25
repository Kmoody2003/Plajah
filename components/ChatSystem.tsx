import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MessageSquare, Users, Search, Plus, Settings, ChevronLeft,
  Globe, Phone, Video, Edit3, Mail, Mic, Radio, Star,
  Hash, Lock, Bell, BellOff, Archive, Trash2, UserPlus,
  Camera, Image as ImageIcon, X, Check, ChevronRight, Sparkles, User,
  AtSign, Bookmark, Shield, MoreHorizontal,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ChatRoom, UserProfile, CallSession } from '../types';
import {
  listenToChatRooms, auth, createChatRoom, listenToCalls,
  fetchUserProfiles, renameChatRoom, searchUserProfiles,
} from '../services/backendService';
import ChatWindow from './ChatWindow';
import CollaboBoard from './CollaboBoard';
import CallInterface from './CallInterface';
import VideoChat from './VideoChat';
import PostmanSystem from './PostmanSystem';

interface ChatSystemProps {
  onBack?: () => void;
  initialRoomId?: string;
  currentUserProfile?: UserProfile;
}

type SidebarTab = 'ALL' | 'DIRECT' | 'GROUPS' | 'CHANNELS' | 'POSTMAN';

const EMOJI_STATUS = ['😊', '🎵', '🎨', '💤', '🔥', '👻', '🌙', '⚡', '🎯', '🌊'];

// ── Room Avatar ────────────────────────────────────────────────────────────────
const RoomAvatar: React.FC<{
  room: ChatRoom;
  profiles: Record<string, UserProfile>;
  size?: 'sm' | 'md';
}> = ({ room, profiles, size = 'md' }) => {
  const uid = auth.currentUser?.uid;
  const dim = size === 'md' ? 'w-12 h-12' : 'w-9 h-9';

  if (room.type === 'PRIVATE') {
    const otherId = room.participants.find(id => id !== uid);
    const p = otherId ? profiles[otherId] : null;
    return (
      <div className={`${dim} rounded-2xl overflow-hidden border border-white/10 flex-shrink-0 bg-white/5 relative`}>
        {p?.photoURL
          ? <img src={p.photoURL} alt={p.displayName} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center"><User size={size === 'md' ? 20 : 14} className="text-white/20" /></div>}
        <div className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 bg-green-500 border-2 border-black rounded-full" />
      </div>
    );
  }

  if (room.type === 'PUBLIC_LIVE') {
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
              ? <img src={profiles[id].photoURL!} className="w-full h-full object-cover" />
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

// ── Room List Item ─────────────────────────────────────────────────────────────
const RoomRow: React.FC<{
  room: ChatRoom;
  profiles: Record<string, UserProfile>;
  isActive: boolean;
  onSelect: () => void;
  onRename?: () => void;
  unreadCount?: number;
}> = ({ room, profiles, isActive, onSelect, onRename, unreadCount = 0 }) => {
  const uid = auth.currentUser?.uid;

  let displayName = room.name || 'Conversation';
  if (room.type === 'PRIVATE') {
    const otherId = room.participants.find(id => id !== uid);
    displayName = otherId ? profiles[otherId]?.displayName || 'Loading...' : 'Saved Messages';
  } else if (room.type === 'GROUP' && !room.name) {
    displayName = 'Group Chat';
  } else if (room.type === 'PUBLIC_LIVE') {
    displayName = room.name || 'Live Channel';
  }

  const lastMsgTime = room.updatedAt
    ? new Date(room.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="relative group"
    >
      <button
        onClick={onSelect}
        className={`w-full p-3 rounded-2xl flex items-center gap-3 transition-all border text-left ${
          isActive
            ? 'bg-small-orange/15 border-small-orange/30'
            : 'bg-white/[0.03] border-white/[0.05] hover:bg-white/[0.07] hover:border-white/10'
        }`}
      >
        <RoomAvatar room={room} profiles={profiles} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className={`text-sm font-black uppercase tracking-wider truncate ${isActive ? 'text-small-orange' : 'text-white'}`}>
              {displayName}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              {unreadCount > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 bg-small-orange text-white text-[8px] font-black rounded-full flex items-center justify-center">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
              <span className="text-[8px] font-bold text-white/20">{lastMsgTime}</span>
            </div>
          </div>
          <p className={`text-[10px] font-medium truncate ${isActive ? 'text-small-orange/60' : 'text-white/30'}`}>
            {room.typingUsers && room.typingUsers.filter(id => id !== uid).length > 0
              ? <span className="text-green-400">typing…</span>
              : room.lastMessage || 'No messages yet'}
          </p>
        </div>
      </button>

      {room.type === 'GROUP' && room.ownerId === uid && (
        <button
          onClick={(e) => { e.stopPropagation(); onRename?.(); }}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 bg-black/40 text-white/30 hover:text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all"
        >
          <Edit3 size={12} />
        </button>
      )}
    </motion.div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────
const ChatSystem: React.FC<ChatSystemProps> = ({ onBack, initialRoomId, currentUserProfile }) => {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [activeRoom, setActiveRoom] = useState<ChatRoom | null>(null);
  const [activeCollabId, setActiveCollabId] = useState<string | null>(null);
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [showVideoChat, setShowVideoChat] = useState(false);

  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // New Group / Channel creation
  const [showNewModal, setShowNewModal] = useState<'GROUP' | 'CHANNEL' | null>(null);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDesc, setNewRoomDesc] = useState('');

  // User search for DMs
  const [showUserSearch, setShowUserSearch] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [foundUsers, setFoundUsers] = useState<UserProfile[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);

  // Group settings panel
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [addMemberSearch, setAddMemberSearch] = useState('');
  const [foundMembersToAdd, setFoundMembersToAdd] = useState<UserProfile[]>([]);

  // Status emoji picker
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [myStatus, setMyStatus] = useState('');

  useEffect(() => {
    if (userSearchTerm.trim()) {
      setIsSearchingUsers(true);
      const t = setTimeout(async () => {
        const users = await searchUserProfiles(userSearchTerm);
        setFoundUsers(users.filter(u => u.uid !== auth.currentUser?.uid));
        setIsSearchingUsers(false);
      }, 400);
      return () => clearTimeout(t);
    } else {
      setFoundUsers([]);
    }
  }, [userSearchTerm]);

  useEffect(() => {
    if (addMemberSearch.trim()) {
      const t = setTimeout(async () => {
        const users = await searchUserProfiles(addMemberSearch);
        setFoundMembersToAdd(users.filter(u => !activeRoom?.participants.includes(u.uid)));
      }, 400);
      return () => clearTimeout(t);
    } else {
      setFoundMembersToAdd([]);
    }
  }, [addMemberSearch, activeRoom]);

  useEffect(() => {
    const unsubRooms = listenToChatRooms((items) => {
      setRooms(items);
      const allUids = Array.from(new Set(items.flatMap(r => r.participants)));
      const missing = allUids.filter(uid => !profiles[uid]);
      if (missing.length > 0) {
        fetchUserProfiles(missing).then(ps => {
          setProfiles(prev => {
            const map = { ...prev };
            ps.forEach(p => { map[p.uid] = p; });
            return map;
          });
        });
      }
    });

    const unsubCalls = listenToCalls((calls) => {
      if (calls.length > 0 && !activeCall) setActiveCall(calls[0]);
    });

    return () => { unsubRooms(); unsubCalls(); };
  }, []);

  useEffect(() => {
    if (initialRoomId && rooms.length > 0) {
      const room = rooms.find(r => r.id === initialRoomId);
      if (room) setActiveRoom(room);
    }
  }, [initialRoomId, rooms]);

  const filteredRooms = rooms.filter(room => {
    const uid = auth.currentUser?.uid;
    let name = room.name || '';
    if (room.type === 'PRIVATE') {
      const otherId = room.participants.find(id => id !== uid);
      name = otherId ? profiles[otherId]?.displayName || '' : 'Saved Messages';
    }

    const matchesSearch = !searchTerm || name.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    if (sidebarTab === 'ALL') return true;
    if (sidebarTab === 'DIRECT') return room.type === 'PRIVATE';
    if (sidebarTab === 'GROUPS') return room.type === 'GROUP';
    if (sidebarTab === 'CHANNELS') return room.type === 'PUBLIC_LIVE';
    return false;
  });

  const handleCreateRoom = async () => {
    if (!newRoomName.trim() || !showNewModal) return;
    const type = showNewModal === 'CHANNEL' ? 'PUBLIC_LIVE' : 'GROUP';
    const roomId = await createChatRoom([auth.currentUser?.uid || ''], type, newRoomName);
    setShowNewModal(null);
    setNewRoomName('');
    setNewRoomDesc('');
  };

  const handleRenameRoom = async (roomId: string) => {
    const room = rooms.find(r => r.id === roomId);
    if (!room || room.ownerId !== auth.currentUser?.uid) return;
    const newName = prompt('Rename group:', room.name || '');
    if (newName && newName !== room.name) await renameChatRoom(roomId, newName);
  };

  const handleStartDM = async (user: UserProfile) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const existing = rooms.find(
      r => r.type === 'PRIVATE' && r.participants.includes(user.uid) && r.participants.includes(uid),
    );
    if (existing) { setActiveRoom(existing); }
    else { await createChatRoom([uid, user.uid], 'PRIVATE'); }
    setShowUserSearch(false);
    setUserSearchTerm('');
  };

  const TABS: { id: SidebarTab; label: string; icon: React.FC<any> }[] = [
    { id: 'ALL', label: 'All', icon: MessageSquare },
    { id: 'DIRECT', label: 'DMs', icon: User },
    { id: 'GROUPS', label: 'Groups', icon: Users },
    { id: 'CHANNELS', label: 'Live', icon: Radio },
    { id: 'POSTMAN', label: 'Mail', icon: Mail },
  ];

  const showSidebar = !activeRoom && !activeCollabId;

  return (
    <div className="h-full flex overflow-hidden relative bg-black/15 backdrop-blur-2xl pb-20 lg:pb-0">

      {/* ── LEFT SIDEBAR ──────────────────────────────────────────── */}
      <div className={`w-full lg:w-80 xl:w-96 border-r border-white/[0.06] flex flex-col bg-black/20 ${activeRoom || activeCollabId ? 'hidden lg:flex' : 'flex'}`}>

        {/* Header */}
        <div className="px-5 pt-6 pb-4 border-b border-white/[0.05]">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              {onBack && (
                <button onClick={onBack} className="p-2 bg-white/5 rounded-xl hover:bg-white/10 transition-all">
                  <ChevronLeft size={18} />
                </button>
              )}
              {/* My status */}
              <div className="relative">
                <button
                  onClick={() => setShowStatusPicker(p => !p)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-xl hover:bg-white/10 transition-all border border-white/[0.06]"
                >
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/60">
                    {myStatus || 'Online'}
                  </span>
                </button>
                <AnimatePresence>
                  {showStatusPicker && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -4 }}
                      className="absolute top-full left-0 mt-2 bg-black/90 backdrop-blur-2xl border border-white/10 rounded-2xl p-3 z-50 shadow-2xl grid grid-cols-5 gap-2 w-max"
                    >
                      {EMOJI_STATUS.map(emoji => (
                        <button
                          key={emoji}
                          onClick={() => { setMyStatus(emoji); setShowStatusPicker(false); }}
                          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-white/10 transition-all text-lg"
                        >
                          {emoji}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowUserSearch(true)}
                className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded-xl transition-all"
                title="New Direct Message"
              >
                <Search size={18} />
              </button>
              <button
                onClick={() => setShowNewModal('GROUP')}
                className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded-xl transition-all"
                title="New Group"
              >
                <Users size={18} />
              </button>
              <button
                onClick={() => setShowNewModal('CHANNEL')}
                className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded-xl transition-all"
                title="New Channel"
              >
                <Radio size={18} />
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20" size={15} />
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search conversations…"
              className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-white/20 focus:border-small-orange/40 outline-none transition-all"
            />
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 p-2 border-b border-white/[0.05]">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setSidebarTab(tab.id)}
              className={`flex-1 py-2 rounded-xl flex flex-col items-center gap-0.5 transition-all ${
                sidebarTab === tab.id
                  ? 'bg-small-orange/15 text-small-orange'
                  : 'text-white/30 hover:text-white hover:bg-white/5'
              }`}
            >
              <tab.icon size={14} />
              <span className="text-[8px] font-black uppercase tracking-widest hidden sm:block">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Room list / Postman */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {sidebarTab === 'POSTMAN' ? (
            <div className="p-4 flex-1">
              <PostmanSystem />
            </div>
          ) : (
            <div className="p-3 space-y-1">
              {filteredRooms.length === 0 ? (
                <div className="py-16 text-center">
                  <MessageSquare size={28} className="text-white/10 mx-auto mb-3" />
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/20">
                    {searchTerm ? 'No results' : 'No conversations yet'}
                  </p>
                  {!searchTerm && (
                    <button
                      onClick={() => setShowUserSearch(true)}
                      className="mt-4 px-4 py-2 bg-small-orange/20 text-small-orange text-[9px] font-black uppercase tracking-widest rounded-full hover:bg-small-orange/30 transition-all"
                    >
                      Start a conversation
                    </button>
                  )}
                </div>
              ) : (
                filteredRooms.map(room => (
                  <RoomRow
                    key={room.id}
                    room={room}
                    profiles={profiles}
                    isActive={activeRoom?.id === room.id}
                    onSelect={() => { setActiveRoom(room); setActiveCollabId(null); }}
                    onRename={() => handleRenameRoom(room.id)}
                  />
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── MAIN AREA ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeCollabId ? (
          <CollaboBoard projectId={activeCollabId} onBack={() => setActiveCollabId(null)} />
        ) : activeRoom ? (
          <ChatWindow
            room={activeRoom}
            profiles={profiles}
            currentUserProfile={currentUserProfile}
            onBack={() => { setActiveRoom(null); setActiveCollabId(null); }}
            onOpenCollab={id => setActiveCollabId(id)}
            onStartVideo={() => setShowVideoChat(true)}
          />
        ) : (
          <div className="hidden lg:flex flex-1 flex-col items-center justify-center p-12 text-center">
            <div className="w-28 h-28 bg-gradient-to-br from-small-orange/20 to-purple-500/20 rounded-[2rem] flex items-center justify-center mb-8 border border-white/10">
              <Sparkles size={44} className="text-small-orange" />
            </div>
            <h2 className="text-3xl font-black uppercase tracking-tighter mb-3">Plajah Messenger</h2>
            <p className="text-[11px] font-bold text-white/25 uppercase tracking-[0.25em] max-w-xs leading-loose">
              Encrypted messages, voice, video, reactions, and a direct line to the fediverse.
            </p>
            <button
              onClick={() => setShowUserSearch(true)}
              className="mt-8 px-8 py-4 bg-small-orange text-white font-black uppercase tracking-widest text-[10px] rounded-full hover:bg-small-orange/80 transition-all"
            >
              Start a conversation
            </button>
          </div>
        )}
      </div>

      {/* ── VIDEO CHAT OVERLAY ─────────────────────────────────────── */}
      <AnimatePresence>
        {showVideoChat && activeRoom && (
          <VideoChat room={activeRoom} user={auth.currentUser} onClose={() => setShowVideoChat(false)} />
        )}
      </AnimatePresence>

      {/* ── CALL INTERFACE ─────────────────────────────────────────── */}
      <AnimatePresence>
        {activeCall && <CallInterface call={activeCall} onEnd={() => setActiveCall(null)} />}
      </AnimatePresence>

      {/* ── NEW ROOM MODAL ─────────────────────────────────────────── */}
      <AnimatePresence>
        {showNewModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[500] flex items-center justify-center p-6"
            onClick={() => setShowNewModal(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="max-w-sm w-full bg-[#111] border border-white/10 rounded-3xl p-8 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className={`p-3 rounded-2xl ${showNewModal === 'CHANNEL' ? 'bg-red-500/20' : 'bg-small-orange/20'}`}>
                  {showNewModal === 'CHANNEL' ? <Radio size={20} className="text-red-400" /> : <Users size={20} className="text-small-orange" />}
                </div>
                <div>
                  <h2 className="text-lg font-black uppercase tracking-tighter">
                    {showNewModal === 'CHANNEL' ? 'New Channel' : 'New Group'}
                  </h2>
                  <p className="text-[9px] text-white/30 font-bold uppercase tracking-widest">
                    {showNewModal === 'CHANNEL' ? 'Broadcast to followers' : 'Private group chat'}
                  </p>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <input
                  value={newRoomName}
                  onChange={e => setNewRoomName(e.target.value)}
                  placeholder={showNewModal === 'CHANNEL' ? 'Channel name…' : 'Group name…'}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white text-sm outline-none focus:border-small-orange/50 transition-all"
                  autoFocus
                />
                <textarea
                  value={newRoomDesc}
                  onChange={e => setNewRoomDesc(e.target.value)}
                  placeholder="Description (optional)"
                  rows={2}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white text-sm outline-none focus:border-small-orange/50 transition-all resize-none"
                />
              </div>

              <div className="flex gap-3">
                <button onClick={() => setShowNewModal(null)} className="flex-1 py-3 bg-white/5 text-white/40 font-black uppercase text-[9px] tracking-widest rounded-full hover:bg-white/10 transition-all">
                  Cancel
                </button>
                <button
                  onClick={handleCreateRoom}
                  disabled={!newRoomName.trim()}
                  className="flex-1 py-3 bg-small-orange text-white font-black uppercase text-[9px] tracking-widest rounded-full hover:bg-small-orange/80 transition-all disabled:opacity-30"
                >
                  Create
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── USER SEARCH MODAL (Start DM) ───────────────────────────── */}
      <AnimatePresence>
        {showUserSearch && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[500] flex items-end sm:items-center justify-center sm:p-6"
            onClick={() => setShowUserSearch(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              className="w-full sm:max-w-md bg-[#111] border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[75vh]"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 border-b border-white/[0.06]">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-black uppercase tracking-tighter">New Message</h2>
                  <button onClick={() => setShowUserSearch(false)} className="p-1.5 hover:bg-white/10 rounded-xl transition-all">
                    <X size={18} />
                  </button>
                </div>
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20" size={15} />
                  <input
                    value={userSearchTerm}
                    onChange={e => setUserSearchTerm(e.target.value)}
                    placeholder="Search creators…"
                    className="w-full bg-white/[0.06] border border-white/[0.08] rounded-2xl pl-10 pr-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-small-orange/40 transition-all"
                    autoFocus
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                {isSearchingUsers ? (
                  <div className="py-10 flex flex-col items-center gap-3">
                    <div className="w-6 h-6 border-2 border-small-orange/40 border-t-small-orange rounded-full animate-spin" />
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/20">Searching…</p>
                  </div>
                ) : foundUsers.length > 0 ? (
                  foundUsers.map(u => (
                    <button
                      key={u.uid}
                      onClick={() => handleStartDM(u)}
                      className="w-full p-3 rounded-2xl bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.09] hover:border-white/10 transition-all flex items-center gap-3 group"
                    >
                      <img
                        src={u.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.uid}`}
                        className="w-10 h-10 rounded-xl object-cover border border-white/10"
                      />
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-sm font-black uppercase tracking-wider group-hover:text-small-orange transition-colors truncate">{u.displayName}</p>
                        <p className="text-[9px] font-bold text-white/20 truncate">{u.bio || 'Creator'}</p>
                      </div>
                      <MessageSquare size={16} className="text-white/20 group-hover:text-small-orange transition-all shrink-0" />
                    </button>
                  ))
                ) : userSearchTerm ? (
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/20 text-center py-10">No creators found</p>
                ) : (
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/20 text-center py-10">Type to search</p>
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
