import { UserAvatar } from './avatar/UserAvatar';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  MessageSquare, Users, Send, X, ChevronLeft, Mic, Music, Heart,
  Mail, Loader2, MapPin, Bell, MessageCircle, Plus, UserPlus, Zap,
  Inbox, CheckCheck, Radio, Play, Lock, ExternalLink, Headphones, BellOff,
} from 'lucide-react';
import { ChatMessage, ChatRoom, AppView, AppNotification, UserProfile, NowActiveEntry } from '../types';
import {
  auth,
  listenToMessages,
  listenToChatRooms,
  sendMessage,
  createChatRoom,
  ensureLiveChatRoom,
  fetchUserProfiles,
  markMessageAsSeen,
} from '../services/backendService';
import { encryptText, decryptText } from '../services/cryptoService';
import { listenToFollowedPresence } from '../services/presenceService';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';
import { useNotifications } from '../contexts/NotificationContext';
import { useFollowedLive } from '../hooks/useFollowedLive';
import { useFollowing } from '../hooks/useFollowing';
import LiveTalkView from './LiveTalkView';
import RoomMessagePreview from './chat/RoomMessagePreview';
import { useChatRoomPrefs } from '../hooks/useChatRoomPrefs';
import { roomUnreadCount, isRoomMuted } from '../services/chat/chatCore';
import { formatDistanceToNow } from 'date-fns';
import { HelloActions } from './NotificationCenter';
import FollowRequestsInbox from './safety/FollowRequestsInbox';

// Friendly label for the page the user was on when they posted
const PAGE_LABELS: Partial<Record<AppView, string>> = {
  DASHBOARD: 'Home', MUSIC: 'Music', VIDEOS: 'Videos', MOVIES_TV: 'Movies & TV',
  BOOKS: 'Books', GAMES: 'Games', LIVE_HUB: 'Live', FEED: 'Feed',
  DISCUSSION: 'Discussion', ARTICLES: 'Articles', GLOBAL_PHOTOS: 'Photos',
  CLUBS: 'Clubs', WORLDS: 'Worlds', APPS: 'Apps', STORE: 'Store',
  SANCTUARY: 'Backstage', RADIO: 'Radio', CHAT: 'Chat',
  USER_PROFILE: 'Profile', SEARCH: 'Search', PEOPLE: 'Find People',
  PLAJAH_SPORTS: 'Sports', CHARITY: 'Charity', CLASSROOMS: 'Classes',
  PPV_EVENTS: 'Events', RELLO: 'Reello', PLAJAH_LABS: 'Labs',
};

export type CommsTab = 'INBOX' | 'LIVE' | 'ALERTS';

/** Anything can open the drawer: `window.dispatchEvent(new CustomEvent(COMMS_EVENT, { detail }))`. */
export const COMMS_EVENT = 'plajah:comms';
export interface CommsEventDetail {
  action?: 'open' | 'toggle' | 'close';
  tab?: CommsTab;
  /** Open this conversation in the Inbox quick-chat. */
  roomId?: string;
}

const INBOX_ROOM_LIMIT = 30;
const THREAD_PAGE_SIZE = 40;
// Followed-user presence is one listener per 30 uids; the strip only needs a handful of faces.
const PRESENCE_UID_CAP = 120;

const avatarFor = (id?: string, photo?: string | null) =>
  photo || `https://api.dicebear.com/7.x/avataaars/svg?seed=${id || 'plajah'}`;

// ── Notification icon + color ──────────────────────────────────────────────────

function getNotifStyle(type: string) {
  switch (type) {
    case 'COMMENT': return { Icon: MessageSquare, color: 'text-green-400', bg: 'bg-green-500/15', border: 'border-green-500/20' };
    case 'LIKE':    return { Icon: Heart,         color: 'text-red-400',   bg: 'bg-red-500/15',   border: 'border-red-500/20'   };
    case 'FOLLOW':  return { Icon: UserPlus,      color: 'text-cyan-400',  bg: 'bg-cyan-500/15',  border: 'border-cyan-500/20'  };
    case 'CONTENT': return { Icon: Plus,          color: 'text-purple-400',bg: 'bg-purple-500/15',border: 'border-purple-500/20'};
    case 'MESSAGE': return { Icon: MessageCircle, color: 'text-blue-400',  bg: 'bg-blue-500/15',  border: 'border-blue-500/20'  };
    default:        return { Icon: Zap,           color: 'text-orange-400',bg: 'bg-orange-500/15',border: 'border-orange-500/20'};
  }
}

/** What a non-text message reads as in the quick view (the full Chat page renders the real thing). */
function messageStandIn(msg: ChatMessage): string | null {
  if (msg.text) return null;
  switch (msg.type) {
    case 'VOICE': return 'Voice note';
    case 'IMAGE': return 'Photo';
    case 'VIDEO_NOTE': return 'Video note';
    case 'MEDIA': return 'Shared media';
    default: return msg.gifUrl ? 'GIF' : msg.letterId ? 'Letter' : 'Attachment';
  }
}

// ── Room title / avatar ────────────────────────────────────────────────────────

function roomTitle(room: ChatRoom, profiles: Record<string, UserProfile>, uid?: string): string {
  if (room.type === 'PRIVATE') {
    const otherId = room.participants.find(id => id !== uid);
    return otherId ? profiles[otherId]?.displayName || 'Loading…' : 'Saved Messages';
  }
  return room.name || (room.type === 'CLASSROOM' ? 'Class chat' : 'Group Chat');
}

const RoomFace: React.FC<{ room: ChatRoom; profiles: Record<string, UserProfile>; uid?: string; size?: number }> = ({
  room, profiles, uid, size = 40,
}) => {
  const others = room.participants.filter(id => id !== uid);
  if (room.type === 'PRIVATE') {
    const p = others[0] ? profiles[others[0]] : undefined;
    return (
      <UserAvatar uid={others[0]} src={avatarFor(others[0], p?.photoURL)} alt="" referrerPolicy="no-referrer"
        className="rounded-full object-cover border border-white/10 shrink-0" style={{ width: size, height: size }} />
    );
  }
  const faces = others.slice(0, 2);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {faces.length === 0 ? (
        <div className="w-full h-full rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
          <Users size={size * 0.4} className="text-white/30" />
        </div>
      ) : faces.map((id, i) => (
        <UserAvatar key={id} uid={id} src={avatarFor(id, profiles[id]?.photoURL)} alt="" referrerPolicy="no-referrer"
          className="absolute rounded-full object-cover border-2 border-[#080808]"
          style={{ width: size * 0.7, height: size * 0.7, left: i ? size * 0.3 : 0, top: i ? size * 0.3 : 0 }} />
      ))}
    </div>
  );
};

// ── Live-room message bubble ───────────────────────────────────────────────────

interface MsgBubbleProps {
  msg: ChatMessage;
  isMe: boolean;
  onDM?: (msg: ChatMessage) => void;
}

const MsgBubble: React.FC<MsgBubbleProps> = ({ msg, isMe, onDM }) => {
  const [hovered, setHovered] = useState(false);
  const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const standIn = messageStandIn(msg);

  return (
    <div
      className={`flex gap-3 group ${isMe ? 'flex-row-reverse' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {!isMe && (
        <UserAvatar
          uid={msg.senderId}
          src={avatarFor(msg.senderId, msg.senderPhoto)}
          className="w-8 h-8 rounded-xl bg-white/10 border border-white/10 shadow-md shrink-0 mt-1"
          alt=""
        />
      )}
      <div className={`flex flex-col gap-0.5 max-w-[75%] ${isMe ? 'items-end' : 'items-start'}`}>
        {!isMe && (
          <div className="flex items-center gap-1.5 px-1">
            <span className="text-xs font-bold text-orange-400/80">{msg.senderName}</span>
            {msg.pageTag && (
              <span className="flex items-center gap-0.5 text-[8px] font-black uppercase tracking-widest bg-white/8 border border-white/10 text-white/35 px-1.5 py-0.5 rounded-full">
                <MapPin size={7} />
                {msg.pageTag}
              </span>
            )}
          </div>
        )}
        <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed break-words ${
          isMe ? 'bg-orange-500/20 text-white border border-orange-500/20' : 'bg-white/6 text-white/90 border border-white/8'
        } ${standIn ? 'italic text-white/50' : ''}`}>
          {standIn ?? msg.text}
        </div>
        <span className="text-[10px] text-white/25 px-1">{time}</span>
      </div>

      <AnimatePresence>
        {hovered && !isMe && onDM && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.1 }}
            onClick={() => onDM(msg)}
            title={`Message ${msg.senderName}`}
            className="self-center p-1.5 rounded-full bg-white/8 border border-white/10 text-white/50 hover:text-orange-400 hover:border-orange-500/30 hover:bg-orange-500/10 transition-all shrink-0"
          >
            <Mail size={12} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};

// ── Composer ───────────────────────────────────────────────────────────────────

const Composer: React.FC<{ placeholder: string; onSend: (text: string) => Promise<void> }> = ({ placeholder, onSend }) => {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    setError(null);
    setText('');
    try {
      await onSend(value);
    } catch (err: any) {
      // Restore the text so a failed send (offline, messaging limits) can be retried.
      setText(value);
      setError(err?.message || 'Could not send');
    } finally {
      setSending(false);
    }
  };

  const uid = auth.currentUser?.uid;
  return (
    <form onSubmit={submit} className="px-3 py-3 border-t border-white/5 shrink-0">
      {error && <p className="text-[11px] text-red-400/80 mb-2 px-1">{error}</p>}
      <div className="flex items-center gap-2">
        <UserAvatar uid={uid} src={avatarFor(uid, auth.currentUser?.photoURL)} className="w-7 h-7 rounded-full border border-white/10 shrink-0" alt="" />
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={placeholder}
          className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-orange-500/40 transition-colors"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          aria-label="Send"
          className="p-2 rounded-xl bg-orange-500 text-black disabled:opacity-40 hover:bg-orange-400 transition-colors shrink-0"
        >
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </div>
    </form>
  );
};

// ── Inbox quick-chat thread ────────────────────────────────────────────────────

interface QuickThreadProps {
  room: ChatRoom;
  profiles: Record<string, UserProfile>;
  onBack: () => void;
  onOpenFull: (roomId: string) => void;
}

const QuickThread: React.FC<QuickThreadProps> = ({ room, profiles, onBack, onOpenFull }) => {
  const uid = auth.currentUser?.uid;
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // Protected and intimate threads carry screen guards and burn rules that live in the full
  // ChatWindow; the quick view never renders their contents.
  const guarded = !!room.protected || !!room.isIntimate;

  useEffect(() => {
    if (guarded) return;
    setMessages(null);
    let live = true;
    const unsub = listenToMessages(room.id, (msgs) => {
      Promise.all(msgs.map(async m => ({ ...m, text: m.text ? await decryptText(m.text, room.id) : m.text })))
        .then(dec => { if (live) setMessages(dec); });
      if (room.type === 'PRIVATE') {
        const last = msgs[msgs.length - 1];
        if (last && uid && last.senderId !== uid && !last.seenBy?.includes(uid)) markMessageAsSeen(room.id, last.id);
      }
    }, THREAD_PAGE_SIZE);
    return () => { live = false; unsub(); };
  }, [room.id, room.type, guarded, uid]);

  useEffect(() => {
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }));
  }, [messages]);

  const send = async (text: string) => {
    if (!auth.currentUser) return;
    await sendMessage(room.id, {
      senderId: auth.currentUser.uid,
      senderName: auth.currentUser.displayName || 'Anonymous',
      senderPhoto: auth.currentUser.photoURL || '',
      text: await encryptText(text, room.id),
      type: 'TEXT',
    });
  };

  const title = roomTitle(room, profiles, uid);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-2 py-2 border-b border-white/5 flex items-center gap-2 shrink-0">
        <button onClick={onBack} aria-label="Back to inbox" className="p-1.5 rounded-full hover:bg-white/8 text-white/50 hover:text-white">
          <ChevronLeft size={16} />
        </button>
        <RoomFace room={room} profiles={profiles} uid={uid} size={30} />
        <span className="flex-1 min-w-0 text-sm font-bold text-white truncate">{title}</span>
        <button
          onClick={() => onOpenFull(room.id)}
          title="Open in Chat"
          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-white/50 hover:text-white hover:bg-white/10 transition-colors text-[11px] font-bold"
        >
          <ExternalLink size={11} />
          Open in Chat
        </button>
      </div>

      {guarded ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8 text-center">
          <Lock size={28} className="text-white/25" />
          <p className="text-sm font-bold text-white/60">This conversation opens in Chat</p>
          <p className="text-xs text-white/30">Protected and private-mode threads aren't shown in the quick view.</p>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-0 scrollbar-hide">
            {messages === null ? (
              <div className="h-full flex items-center justify-center"><Loader2 size={20} className="animate-spin text-white/20" /></div>
            ) : messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-white/20">
                <MessageCircle size={28} />
                <p className="text-sm font-bold">Say hello</p>
              </div>
            ) : messages.map((msg, i) => {
              const isMe = msg.senderId === uid;
              const showName = !isMe && room.type !== 'PRIVATE' && messages[i - 1]?.senderId !== msg.senderId;
              const standIn = messageStandIn(msg);
              return (
                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  {showName && <span className="text-[10px] font-bold text-orange-400/70 px-2 mb-0.5">{msg.senderName}</span>}
                  <div
                    title={new Date(msg.timestamp).toLocaleString()}
                    className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-relaxed break-words ${
                      isMe ? 'bg-orange-500/20 text-white border border-orange-500/20 rounded-br-md' : 'bg-white/6 text-white/90 border border-white/8 rounded-bl-md'
                    } ${standIn ? 'italic text-white/50' : ''}`}
                  >
                    {standIn ? (
                      <button onClick={() => onOpenFull(room.id)} className="hover:underline">{standIn} · open in Chat</button>
                    ) : msg.text}
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
          <Composer placeholder={`Message ${title}…`} onSend={send} />
        </>
      )}
    </div>
  );
};

// ── Notification row ──────────────────────────────────────────────────────────

interface NotifRowProps {
  notif: AppNotification;
  onRead: (id: string) => void;
  onNavigate?: (notif: AppNotification) => void;
}

const NotifRow: React.FC<NotifRowProps> = ({ notif, onRead, onNavigate }) => {
  const { Icon, color, bg, border } = getNotifStyle(notif.type);
  const clickable = Boolean(notif.link && onNavigate);

  const handleClick = () => {
    if (!notif.isRead) onRead(notif.id);
    if (clickable) onNavigate!(notif);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      onClick={handleClick}
      className={`flex gap-3 px-4 py-3.5 border-b border-white/[0.04] transition-colors relative ${
        !notif.isRead ? 'bg-white/[0.025]' : ''
      } ${clickable ? 'cursor-pointer hover:bg-white/[0.04]' : ''}`}
    >
      {!notif.isRead && (
        <div className="absolute left-2 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-orange-400" />
      )}

      <div className="relative shrink-0">
        <UserAvatar
          uid={notif.senderId}
          src={avatarFor(notif.senderId, notif.senderPhoto)}
          className="w-10 h-10 rounded-full object-cover border border-white/10"
          alt=""
          referrerPolicy="no-referrer"
        />
        <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border ${border} ${bg} flex items-center justify-center`}>
          <Icon size={10} className={color} />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-0.5">
          <p className={`text-[11px] font-black uppercase tracking-wide leading-tight ${notif.isRead ? 'text-white/60' : 'text-white'}`}>
            {notif.title}
          </p>
          <span className="text-[9px] text-white/20 shrink-0 mt-0.5">
            {formatDistanceToNow(notif.timestamp, { addSuffix: false })}
          </span>
        </div>
        <p className="text-[11px] text-white/45 leading-snug">{notif.message}</p>
        {notif.type === 'HELLO' && <HelloActions n={notif} className="mt-2" />}
        {clickable && (
          <p className="text-[9px] font-black uppercase tracking-widest text-orange-400/50 mt-1">
            View →
          </p>
        )}
      </div>
    </motion.div>
  );
};

// ── Main Drawer ────────────────────────────────────────────────────────────────

interface PersistentChatDrawerProps {
  currentView?: AppView;
  onNotificationNavigate?: (notif: AppNotification) => void;
  /** Legacy trigger from the Classic sidebar bell. */
  externalTrigger?: { tab: string; ts: number } | null;
  /** "Open in Chat" from a quick thread — the host switches to the full Chat page on that room. */
  onOpenChatRoom?: (roomId: string) => void;
  /** Total unread (messages + alerts), for the bell badge the host renders. */
  onUnreadChange?: (count: number) => void;
}

const PersistentChatDrawer: React.FC<PersistentChatDrawerProps> = ({
  currentView, onNotificationNavigate, externalTrigger, onOpenChatRoom, onUnreadChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<CommsTab>('INBOX');
  const [liveMode, setLiveMode] = useState<'CHAT' | 'TALK'>('CHAT');
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const prevTriggerTs = useRef<number | null>(null);

  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [listening, setListening] = useState<NowActiveEntry[]>([]);
  const [startingDm, setStartingDm] = useState<string | null>(null);

  const [liveMessages, setLiveMessages] = useState<ChatMessage[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const liveEndRef = useRef<HTMLDivElement>(null);

  const { currentVideo, currentTrack, currentAlbum } = useGlobalPlayerState();
  const { notifications, markAsRead, clearAll } = useNotifications();

  const uid = auth.currentUser?.uid;
  const followedLive = useFollowedLive(uid);
  const { list: followingList } = useFollowing(uid);

  const activeContentId = currentVideo?.id || currentTrack?.id || currentAlbum?.id;
  const activeContentTitle = currentVideo?.title || currentTrack?.title || currentAlbum?.title;
  const activeContentCover = currentTrack?.albumCover || (currentAlbum as any)?.coverArt || (currentAlbum as any)?.coverUrl || currentVideo?.thumbnailUrl;
  const activeContentArtist = currentTrack?.artist || (currentAlbum as any)?.artist;
  const liveRoomId = activeContentId ? `live_chat_${activeContentId}` : 'live_chat_global';
  const isOwnWork = !!activeContentId && (currentTrack?.artistId === uid || (currentAlbum as any)?.ownerId === uid);

  // ── Unread, split between Inbox (messages) and Alerts (everything else) ──
  // sendMessage files a MESSAGE notification per recipient with targetId = room id, so the
  // per-conversation unread count is just the unread MESSAGE notifications for that room.
  // Public live rooms also file MESSAGE notifications (every joiner is a participant); those are
  // crowd chatter, not someone writing to you, so they don't count toward the Inbox.
  // The per-room read cursor (users/{uid}/chat_prefs) then corrects it: a room you've opened is read
  // even if its notifications weren't, and muted rooms don't add to the Inbox badge.
  const roomPrefs = useChatRoomPrefs(uid);
  const unreadByRoom = useMemo(() => {
    const fromNotifications: Record<string, number> = {};
    for (const n of notifications) {
      if (n.type === 'MESSAGE' && !n.isRead && n.targetId && !n.targetId.startsWith('live_chat_')) {
        fromNotifications[n.targetId] = (fromNotifications[n.targetId] || 0) + 1;
      }
    }
    const map: Record<string, number> = {};
    for (const r of rooms) {
      if (r.id.startsWith('live_chat_')) continue;
      const count = roomUnreadCount(r, fromNotifications[r.id] || 0, roomPrefs[r.id], uid);
      if (count) map[r.id] = count;
    }
    return map;
  }, [notifications, rooms, roomPrefs, uid]);
  const unreadMessages = useMemo(
    () => Object.entries(unreadByRoom).reduce((a, [id, n]) => a + (isRoomMuted(roomPrefs[id]) ? 0 : n), 0),
    [unreadByRoom, roomPrefs],
  );
  const alerts = useMemo(() => notifications.filter(n => n.type !== 'MESSAGE'), [notifications]);
  const unreadAlerts = useMemo(() => alerts.filter(n => !n.isRead).length, [alerts]);

  useEffect(() => { onUnreadChange?.(unreadMessages + unreadAlerts); }, [unreadMessages, unreadAlerts, onUnreadChange]);

  // ── Open / close ──
  const openTo = useCallback((tab?: CommsTab, roomId?: string) => {
    setIsOpen(true);
    if (roomId) { setActiveTab('INBOX'); setActiveRoomId(roomId); return; }
    if (tab) { setActiveTab(tab); return; }
    // No tab asked for: land wherever something is waiting.
    if (unreadMessages > 0) setActiveTab('INBOX');
    else if (unreadAlerts > 0) setActiveTab('ALERTS');
  }, [unreadMessages, unreadAlerts]);

  const openToRef = useRef(openTo);
  openToRef.current = openTo;

  useEffect(() => {
    const onComms = (e: Event) => {
      const d = ((e as CustomEvent).detail || {}) as CommsEventDetail;
      if (d.action === 'close') { setIsOpen(false); return; }
      if (d.action === 'toggle' && !d.tab && !d.roomId) {
        setIsOpen(open => { if (!open) openToRef.current(); return !open; });
        return;
      }
      openToRef.current(d.tab, d.roomId);
    };
    window.addEventListener(COMMS_EVENT, onComms);
    return () => window.removeEventListener(COMMS_EVENT, onComms);
  }, []);

  useEffect(() => {
    if (!externalTrigger) return;
    if (prevTriggerTs.current === externalTrigger.ts) return;
    prevTriggerTs.current = externalTrigger.ts;
    openTo(externalTrigger.tab === 'ALERTS' ? 'ALERTS' : externalTrigger.tab === 'LIVE' ? 'LIVE' : 'INBOX');
  }, [externalTrigger, openTo]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  // ── Inbox data ──
  // listenToChatRooms is one shared Firestore listener per uid, so keeping it mounted is free.
  useEffect(() => {
    if (!uid) return;
    return listenToChatRooms(items => {
      setRooms(items.filter(r => r.type !== 'PUBLIC_LIVE'));
    });
  }, [uid]);

  const inboxRooms = useMemo(() => rooms.slice(0, INBOX_ROOM_LIMIT), [rooms]);

  useEffect(() => {
    if (!isOpen) return;
    const wanted = new Set<string>();
    inboxRooms.forEach(r => r.participants.forEach(p => { if (p !== uid) wanted.add(p); }));
    const missing = [...wanted].filter(id => !profiles[id]);
    if (!missing.length) return;
    fetchUserProfiles(missing).then(ps => {
      setProfiles(cur => {
        const next = { ...cur };
        ps.forEach(p => { next[p.uid] = p; });
        return next;
      });
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, inboxRooms, uid]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'INBOX' || activeRoomId) return;
    const capped = followingList.slice(0, PRESENCE_UID_CAP);
    return listenToFollowedPresence(capped, setListening);
  }, [isOpen, activeTab, activeRoomId, followingList]);

  // Reading a conversation in the drawer clears its message notifications.
  useEffect(() => {
    if (!isOpen || !activeRoomId) return;
    notifications.forEach(n => {
      if (n.type === 'MESSAGE' && !n.isRead && n.targetId === activeRoomId) markAsRead(n.id);
    });
  }, [isOpen, activeRoomId, notifications, markAsRead]);

  const activeRoom = useMemo<ChatRoom | null>(() => {
    if (!activeRoomId) return null;
    return rooms.find(r => r.id === activeRoomId)
      // A just-created DM can be open before the room listener delivers its doc.
      ?? { id: activeRoomId, participants: uid ? [uid] : [], type: 'PRIVATE', updatedAt: Date.now() };
  }, [activeRoomId, rooms, uid]);

  const startDM = useCallback(async (otherId: string, other?: { name?: string; photo?: string }) => {
    if (!uid || otherId === uid) return;
    if (other?.name && !profiles[otherId]) {
      setProfiles(cur => ({ ...cur, [otherId]: { uid: otherId, displayName: other.name, photoURL: other.photo || '' } as UserProfile }));
    }
    const existing = rooms.find(r => r.type === 'PRIVATE' && r.participants.length === 2 && r.participants.includes(otherId));
    setIsOpen(true);
    setActiveTab('INBOX');
    if (existing) { setActiveRoomId(existing.id); return; }
    setStartingDm(otherId);
    try {
      setActiveRoomId(await createChatRoom([uid, otherId], 'PRIVATE'));
    } finally {
      setStartingDm(null);
    }
  }, [uid, rooms, profiles]);

  const openFullChat = (roomId: string) => {
    setIsOpen(false);
    onOpenChatRoom?.(roomId);
  };

  // ── Live room for whatever is playing ──
  useEffect(() => {
    if (!isOpen || activeTab !== 'LIVE' || liveMode !== 'CHAT') return;
    if (activeContentId && auth.currentUser) {
      ensureLiveChatRoom(liveRoomId, {
        name: activeContentTitle || 'Live Chat',
        coverUrl: activeContentCover,
        mediaId: activeContentId,
        mediaArtist: activeContentArtist,
      }).catch(() => {});
    }
    setLiveLoading(true);
    let first = true;
    const unsub = listenToMessages(liveRoomId, (msgs) => {
      if (first) { first = false; setLiveLoading(false); }
      setLiveMessages(msgs);
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeTab, liveMode, liveRoomId]);

  useEffect(() => {
    requestAnimationFrame(() => liveEndRef.current?.scrollIntoView({ behavior: 'smooth' }));
  }, [liveMessages]);

  const sendLive = async (text: string) => {
    if (!auth.currentUser) return;
    const pageTag = currentView ? (PAGE_LABELS[currentView] ?? null) : null;
    await sendMessage(liveRoomId, {
      senderId: auth.currentUser.uid,
      senderName: auth.currentUser.displayName || 'Anonymous',
      senderPhoto: auth.currentUser.photoURL || '',
      text,
      type: 'TEXT',
      ...(pageTag ? { pageTag } : {}),
    });
  };

  const handleMarkAllRead = () => {
    alerts.filter(n => !n.isRead).forEach(n => markAsRead(n.id));
  };

  const tabs: { id: CommsTab; icon: React.ElementType; label: string; badge?: number }[] = [
    { id: 'INBOX',  icon: MessageCircle, label: 'Inbox',  badge: unreadMessages },
    { id: 'LIVE',   icon: Radio,         label: 'Live',   badge: followedLive.length },
    { id: 'ALERTS', icon: Bell,          label: 'Alerts', badge: unreadAlerts },
  ];

  // Portal to <body>: the drawer is position:fixed, but a `fixed` element is positioned relative
  // to any ancestor that has a transform/filter/backdrop-filter (this app applies a global
  // --app-zoom scale transform on a wrapper). Rendering into <body> escapes every transformed
  // ancestor so `fixed right-0` is viewport-relative again.
  const tree = (
    <motion.aside
      initial={false}
      animate={{ x: isOpen ? 0 : '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 200 }}
      aria-hidden={!isOpen}
      aria-label="Plajah Comms"
      className={`fixed top-0 right-0 h-full w-full sm:w-[400px] bg-[#080808]/90 backdrop-blur-3xl border-l border-white/8 z-[450] flex flex-col shadow-[-40px_0_80px_rgba(0,0,0,0.6)] ${isOpen ? '' : 'pointer-events-none'}`}
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-0 border-b border-white/5 shrink-0">
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2.5">
            <div className="w-2 h-2 bg-orange-400 rounded-full shadow-[0_0_8px_rgba(255,140,0,0.8)]" />
            <span className="text-xs font-black uppercase tracking-widest text-white/50">Plajah Comms</span>
          </div>
          <button onClick={() => setIsOpen(false)} aria-label="Close" className="p-1.5 hover:bg-white/8 rounded-full text-white/40 hover:text-white transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="flex">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); if (tab.id === 'INBOX') setActiveRoomId(null); }}
              className={`flex-1 flex flex-col items-center gap-1 pt-2 pb-3 relative transition-colors ${
                activeTab === tab.id ? 'text-white' : 'text-white/30 hover:text-white/55'
              }`}
            >
              <div className="relative">
                {React.createElement(tab.icon as any, { size: 16 })}
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className={`absolute -top-1.5 -right-2 min-w-[14px] h-[14px] rounded-full text-[8px] font-black text-black flex items-center justify-center px-0.5 border border-black ${tab.id === 'LIVE' ? 'bg-red-500' : 'bg-orange-500'}`}>
                    {tab.badge > 9 ? '9+' : tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-black tracking-wider">{tab.label}</span>
              {activeTab === tab.id && (
                <motion.div layoutId="drawerTabLine" className="absolute bottom-0 left-2 right-2 h-[2px] bg-orange-400 rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0 relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab + (activeTab === 'INBOX' && activeRoomId ? ':thread' : '')}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="flex-1 flex flex-col min-h-0"
          >

            {/* ── INBOX: quick thread ── */}
            {activeTab === 'INBOX' && activeRoom && (
              <QuickThread
                room={activeRoom}
                profiles={profiles}
                onBack={() => setActiveRoomId(null)}
                onOpenFull={openFullChat}
              />
            )}

            {/* ── INBOX: conversation list ── */}
            {activeTab === 'INBOX' && !activeRoom && (
              <div className="flex-1 flex flex-col min-h-0">
                {listening.length > 0 && (
                  <div className="px-3.5 py-2.5 border-b border-white/5 shrink-0">
                    <div className="flex items-center gap-1.5 mb-2 px-0.5">
                      <Headphones size={11} className="text-emerald-400" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Active now</span>
                    </div>
                    <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-0.5">
                      {listening.map(p => (
                        <button
                          key={p.uid}
                          onClick={() => startDM(p.uid, { name: p.displayName, photo: p.photoURL })}
                          title={`${p.displayName} · ${p.trackTitle || p.videoTitle || 'listening'}`}
                          className="flex flex-col items-center gap-1 w-14 shrink-0 group"
                        >
                          <div className="relative">
                            <UserAvatar uid={p.uid} src={avatarFor(p.uid, p.photoURL)} alt="" referrerPolicy="no-referrer"
                              className="w-11 h-11 rounded-full object-cover border-2 border-emerald-500/40 group-hover:border-emerald-400 transition-colors" />
                            <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[#080808]" />
                            {startingDm === p.uid && (
                              <span className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center"><Loader2 size={14} className="animate-spin text-white" /></span>
                            )}
                          </div>
                          <span className="text-[10px] text-white/60 truncate w-full text-center">{p.displayName?.split(' ')[0] || 'Friend'}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto min-h-0 scrollbar-hide py-1">
                  {inboxRooms.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center gap-3 text-white/20 px-8 text-center">
                      <MessageCircle size={36} />
                      <p className="text-sm font-black uppercase tracking-widest">No conversations yet</p>
                      <p className="text-xs text-white/15">Messages from friends show up here, so you can reply without leaving what you're doing.</p>
                    </div>
                  ) : inboxRooms.map(room => {
                    const unread = unreadByRoom[room.id] || 0;
                    const typing = room.typingUsers?.some(id => id !== uid);
                    return (
                      <button
                        key={room.id}
                        onClick={() => setActiveRoomId(room.id)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.04] transition-colors text-left"
                      >
                        <RoomFace room={room} profiles={profiles} uid={uid} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-sm truncate ${unread ? 'font-black text-white' : 'font-bold text-white/80'}`}>
                              {roomTitle(room, profiles, uid)}
                            </span>
                            {room.updatedAt ? (
                              <span className="text-[10px] text-white/25 shrink-0">{formatDistanceToNow(room.updatedAt, { addSuffix: false })}</span>
                            ) : null}
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <p className={`text-xs truncate ${unread ? 'text-white/70' : 'text-white/35'}`}>
                              {typing ? <span className="text-green-400">typing…</span>
                                : room.protected ? 'Protected conversation'
                                : <RoomMessagePreview roomId={room.id} text={room.lastMessage} />}
                            </p>
                            {isRoomMuted(roomPrefs[room.id]) && <BellOff size={11} className="text-white/30 shrink-0" aria-label="Muted" />}
                            {unread > 0 && (
                              <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black flex items-center justify-center shrink-0 ${
                                isRoomMuted(roomPrefs[room.id]) ? 'bg-white/20 text-white' : 'bg-orange-500 text-black'
                              }`}>
                                {unread > 9 ? '9+' : unread}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => { setIsOpen(false); onOpenChatRoom?.(''); }}
                  className="mx-3 mb-3 mt-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-white/50 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center gap-1.5 shrink-0"
                >
                  <ExternalLink size={12} />
                  Open full Chat
                </button>
              </div>
            )}

            {/* ── LIVE ── */}
            {activeTab === 'LIVE' && (
              <div className="flex-1 flex flex-col min-h-0">
                {followedLive.length > 0 && (
                  <div className="px-3.5 py-2.5 bg-gradient-to-r from-red-950/40 via-red-900/20 to-black/60 border-b border-red-500/20 shrink-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-widest text-red-300">
                        Live now ({followedLive.length})
                      </span>
                    </div>
                    <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5">
                      {followedLive.map(feed => (
                        <div
                          key={feed.id}
                          className="flex items-center gap-2 p-1.5 pr-2.5 bg-white/[0.04] hover:bg-white/[0.08] border border-red-500/30 hover:border-red-500/60 rounded-xl shrink-0 transition-all"
                        >
                          <div className="relative">
                            <UserAvatar uid={feed.ownerId} src={avatarFor(feed.ownerId, feed.ownerPhoto)} alt="" className="w-7 h-7 rounded-full object-cover border border-red-500/50" />
                            <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full border border-black animate-pulse" />
                          </div>
                          <div className="max-w-[110px]">
                            <p className="text-[11px] font-bold text-white truncate leading-tight">{feed.ownerName || 'Creator'}</p>
                            <p className="text-[9px] text-white/40 truncate leading-tight">{feed.title || 'Live Stream'}</p>
                          </div>
                          <button
                            onClick={() => window.dispatchEvent(new CustomEvent('plajah:watch-live', { detail: feed }))}
                            className="px-2 py-0.5 bg-red-500 hover:bg-red-400 text-black text-[9px] font-black uppercase tracking-wider rounded-md flex items-center gap-1 shrink-0 transition-colors ml-1"
                          >
                            <Play size={9} className="fill-black" />
                            Watch
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Chat about what's playing | Live Talk audio rooms */}
                <div className="flex gap-1 p-1 mx-3 my-2.5 rounded-xl bg-white/[0.04] border border-white/5 shrink-0">
                  {([['CHAT', MessageSquare, 'Now playing'], ['TALK', Mic, 'Live Talk']] as const).map(([id, Icon, label]) => (
                    <button
                      key={id}
                      onClick={() => setLiveMode(id)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                        liveMode === id ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60'
                      }`}
                    >
                      <Icon size={12} />
                      {label}
                    </button>
                  ))}
                </div>

                {liveMode === 'TALK' ? (
                  <div className="flex-1 flex flex-col min-h-0 overflow-y-auto"><LiveTalkView onBrowse={() => {}} /></div>
                ) : (
                  <>
                    <div className="px-4 pb-2 shrink-0 flex items-center gap-2 min-w-0">
                      {activeContentCover
                        ? <img src={activeContentCover} alt="" className="w-7 h-7 rounded-md object-cover border border-white/10 shrink-0" />
                        : <Music size={13} className="text-orange-400 shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate leading-tight">{activeContentTitle || 'Global live chat'}</p>
                        <p className="text-[10px] text-white/35 truncate leading-tight">
                          {isOwnWork ? 'Your listeners are in this room' : activeContentId ? 'Everyone playing this right now' : 'Play something to chat about it'}
                        </p>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3 min-h-0 scrollbar-hide border-t border-white/5">
                      {liveLoading ? (
                        <div className="h-full flex items-center justify-center"><Loader2 size={20} className="animate-spin text-white/20" /></div>
                      ) : liveMessages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center gap-3 text-white/20">
                          <MessageSquare size={32} />
                          <p className="text-sm font-bold">No messages yet</p>
                          <p className="text-xs text-white/15">Be the first to say something</p>
                        </div>
                      ) : liveMessages.map(msg => (
                        <MsgBubble
                          key={msg.id}
                          msg={msg}
                          isMe={msg.senderId === uid}
                          onDM={m => startDM(m.senderId, { name: m.senderName, photo: m.senderPhoto })}
                        />
                      ))}
                      <div ref={liveEndRef} />
                    </div>
                    {auth.currentUser
                      ? <Composer placeholder={isOwnWork ? 'Talk to your listeners…' : 'Say something…'} onSend={sendLive} />
                      : <div className="px-4 py-3 border-t border-white/5 text-center text-xs text-white/30">Sign in to chat</div>}
                  </>
                )}
              </div>
            )}

            {/* ── ALERTS ── */}
            {activeTab === 'ALERTS' && (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <Bell size={13} className="text-orange-400" />
                    <span className="text-xs font-black uppercase tracking-widest text-white/60">Alerts</span>
                    {unreadAlerts > 0 && (
                      <span className="bg-orange-500/20 border border-orange-500/30 text-orange-400 text-[9px] font-black px-2 py-0.5 rounded-full">
                        {unreadAlerts} unread
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {unreadAlerts > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        title="Mark all read"
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/8 transition-colors text-[10px] font-black uppercase tracking-wider"
                      >
                        <CheckCheck size={12} />
                        All read
                      </button>
                    )}
                    {notifications.length > 0 && (
                      <button
                        onClick={() => clearAll?.()}
                        title="Clear all"
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/8 transition-colors text-[10px] font-black uppercase tracking-wider"
                      >
                        <X size={12} />
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0 scrollbar-hide">
                  <div className="px-3 pt-3"><FollowRequestsInbox /></div>
                  {alerts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-4 text-white/15 px-8 py-16 text-center">
                      <Inbox size={40} />
                      <div>
                        <p className="text-sm font-black uppercase tracking-widest mb-1">All clear</p>
                        <p className="text-xs text-white/10">Comments, replies, follows, and new posts from people you follow will appear here.</p>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {alerts.map(n => (
                        <NotifRow key={n.id} notif={n} onRead={markAsRead} onNavigate={onNotificationNavigate} />
                      ))}
                      <div className="h-8" />
                    </div>
                  )}
                </div>
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </div>
    </motion.aside>
  );
  return typeof document !== 'undefined' ? createPortal(tree, document.body) : tree;
};

export default PersistentChatDrawer;
