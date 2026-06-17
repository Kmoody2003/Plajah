import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  MessageSquare, Users, Globe, User, Send, X,
  ChevronLeft, Mic, Music, Share2, Heart,
  TrendingUp, Mail, Loader2, MapPin,
  Bell, MessageCircle, Plus, UserPlus, Zap, Inbox, Check, CheckCheck,
} from 'lucide-react';
import { ChatMessage, FeedItem, AppView, AppNotification } from '../types';
import {
  auth,
  listenToMessages,
  sendMessage,
  fetchFeed,
  postToFeed,
  createChatRoom,
  ensureLiveChatRoom,
} from '../services/backendService';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';
import { useNotifications } from '../contexts/NotificationContext';
import LiveTalkView from './LiveTalkView';
import { formatDistanceToNow } from 'date-fns';

// Friendly label for the page the user was on when they posted
const PAGE_LABELS: Partial<Record<AppView, string>> = {
  DASHBOARD: 'Home', MUSIC: 'Music', VIDEOS: 'Videos', MOVIES_TV: 'Movies & TV',
  BOOKS: 'Books', GAMES: 'Games', LIVE_HUB: 'Live', FEED: 'Feed',
  DISCUSSION: 'Discussion', ARTICLES: 'Articles', GLOBAL_PHOTOS: 'Photos',
  CLUBS: 'Clubs', WORLDS: 'Worlds', APPS: 'Apps', STORE: 'Store',
  SANCTUARY: 'Sanctuary', RADIO: 'Radio', CHAT: 'Chat',
  USER_PROFILE: 'Profile', SEARCH: 'Search', PEOPLE: 'Find People',
  PLAJAH_SPORTS: 'Sports', CHARITY: 'Charity', CLASSROOMS: 'Classes',
  PPV_EVENTS: 'Events', RELLO: 'Rello', PLAJAH_LABS: 'Labs',
};

type TabType = 'LIVE' | 'LIVETALK' | 'GLOBAL_FEED' | 'MY_FEED' | 'ALERTS' | 'MUSIC';

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

// ── Mini DM composer ──────────────────────────────────────────────────────────

interface DMComposerProps {
  targetId: string;
  targetName: string;
  targetPhoto: string;
  songTitle?: string;
  songId?: string;
  onClose: () => void;
}

const DMComposer: React.FC<DMComposerProps> = ({
  targetId, targetName, targetPhoto, songTitle, songId, onClose,
}) => {
  const [text, setText] = useState(songId ? `🎵 Check out "${songTitle}" on Plajah! ` : '');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    if (!text.trim() || !auth.currentUser) return;
    setSending(true);
    try {
      const roomId = await createChatRoom([auth.currentUser.uid, targetId], 'PRIVATE');
      await sendMessage(roomId, {
        senderId: auth.currentUser.uid,
        senderName: auth.currentUser.displayName || 'User',
        senderPhoto: auth.currentUser.photoURL || '',
        text: text.trim(),
        type: songId ? 'MEDIA' : 'TEXT',
        ...(songId ? { mediaId: songId, mediaTitle: songTitle } : {}),
      });
      setSent(true);
      setTimeout(onClose, 1200);
    } finally {
      setSending(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.97 }}
      transition={{ duration: 0.18 }}
      className="absolute bottom-0 left-0 right-0 z-50 bg-[#111]/95 backdrop-blur-xl border-t border-white/10 rounded-t-2xl p-4 shadow-2xl"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <img src={targetPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${targetId}`} className="w-7 h-7 rounded-full border border-white/10" alt="" />
          <span className="text-sm font-bold text-white">{targetName}</span>
        </div>
        <button onClick={onClose} className="p-1 rounded-full hover:bg-white/10 text-white/50 hover:text-white">
          <X size={14} />
        </button>
      </div>
      {sent ? (
        <div className="text-center py-3 text-sm font-bold text-green-400">Sent!</div>
      ) : (
        <>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={3}
            placeholder={`Message to ${targetName}…`}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/30 resize-none focus:outline-none focus:border-orange-500/40 mb-3"
            autoFocus
          />
          <button
            onClick={handleSend}
            disabled={!text.trim() || sending}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-orange-500 text-black text-sm font-bold disabled:opacity-50 hover:bg-orange-400 transition-colors"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {sending ? 'Sending…' : 'Send DM'}
          </button>
        </>
      )}
    </motion.div>
  );
};

// ── Message bubble ─────────────────────────────────────────────────────────────

interface MsgBubbleProps {
  msg: ChatMessage;
  isMe: boolean;
  onDM: (msg: ChatMessage) => void;
}

const MsgBubble: React.FC<MsgBubbleProps> = ({ msg, isMe, onDM }) => {
  const [hovered, setHovered] = useState(false);
  const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div
      className={`flex gap-3 group ${isMe ? 'flex-row-reverse' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {!isMe && (
        <img
          src={msg.senderPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.senderId}`}
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
        {isMe && msg.pageTag && (
          <span className="flex items-center gap-0.5 text-[8px] font-black uppercase tracking-widest bg-orange-500/10 border border-orange-500/15 text-orange-400/50 px-1.5 py-0.5 rounded-full self-end mr-1">
            <MapPin size={7} />
            {msg.pageTag}
          </span>
        )}
        <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed break-words ${
          isMe ? 'bg-orange-500/20 text-white border border-orange-500/20' : 'bg-white/6 text-white/90 border border-white/8'
        }`}>
          {msg.text}
        </div>
        <span className="text-[10px] text-white/25 px-1">{time}</span>
      </div>

      <AnimatePresence>
        {hovered && !isMe && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.1 }}
            onClick={() => onDM(msg)}
            title={`DM ${msg.senderName}`}
            className="self-center p-1.5 rounded-full bg-white/8 border border-white/10 text-white/50 hover:text-orange-400 hover:border-orange-500/30 hover:bg-orange-500/10 transition-all shrink-0"
          >
            <Mail size={12} />
          </motion.button>
        )}
      </AnimatePresence>
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
      {/* Unread dot */}
      {!notif.isRead && (
        <div className="absolute left-2 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-orange-400" />
      )}

      {/* Avatar + icon badge */}
      <div className="relative shrink-0">
        <img
          src={notif.senderPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${notif.senderId}`}
          className="w-10 h-10 rounded-full object-cover border border-white/10"
          alt=""
          referrerPolicy="no-referrer"
        />
        <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border ${border} ${bg} flex items-center justify-center`}>
          <Icon size={10} className={color} />
        </div>
      </div>

      {/* Text */}
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
  externalTrigger?: { tab: string; ts: number } | null;
}

const PersistentChatDrawer: React.FC<PersistentChatDrawerProps> = ({ currentView, onNotificationNavigate, externalTrigger }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('LIVE');
  const prevTriggerTs = useRef<number | null>(null);

  const [msgCache, setMsgCache] = useState<Record<string, ChatMessage[]>>({});
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [inputText, setInputText] = useState('');
  const [posts, setPosts] = useState<FeedItem[]>([]);
  const [myPosts, setMyPosts] = useState<FeedItem[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const listenerRef = useRef<(() => void) | null>(null);
  const currentRoomRef = useRef<string | null>(null);

  const [dmTarget, setDmTarget] = useState<{ id: string; name: string; photo: string } | null>(null);

  const { currentVideo, currentTrack, currentAlbum } = useGlobalPlayerState();
  const { notifications, unreadCount, markAsRead, clearAll } = useNotifications();

  const activeContentId = currentVideo?.id || currentTrack?.id || currentAlbum?.id;
  const activeContentTitle = currentVideo?.title || currentTrack?.title || currentAlbum?.title;
  const activeContentCover = currentTrack?.albumCover || (currentAlbum as any)?.coverArt || (currentAlbum as any)?.coverUrl || currentVideo?.thumbnailUrl;
  const activeContentArtist = currentTrack?.artist || (currentAlbum as any)?.artist;
  const liveRoomId = activeContentId ? `live_chat_${activeContentId}` : 'live_chat_global';

  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!externalTrigger) return;
    if (prevTriggerTs.current === externalTrigger.ts) return;
    prevTriggerTs.current = externalTrigger.ts;
    setIsOpen(true);
    setActiveTab(externalTrigger.tab as TabType);
  }, [externalTrigger]);

  useEffect(() => {
    if (currentRoomRef.current === liveRoomId) return;
    currentRoomRef.current = liveRoomId;
    listenerRef.current?.();

    if (activeContentId && auth.currentUser) {
      ensureLiveChatRoom(liveRoomId, {
        name: activeContentTitle || 'Live Chat',
        coverUrl: activeContentCover,
        mediaId: activeContentId,
        mediaArtist: activeContentArtist,
      }).catch(() => {});
    }

    setMessagesLoading(true);
    let firstCallback = true;
    listenerRef.current = listenToMessages(liveRoomId, (msgs) => {
      if (firstCallback) { firstCallback = false; setMessagesLoading(false); }
      setMsgCache(prev => ({ ...prev, [liveRoomId]: msgs }));
      if (isOpen && activeTab === 'LIVE') {
        requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }));
      }
    });

    return () => { listenerRef.current?.(); listenerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveRoomId, activeContentTitle, activeContentCover, activeContentArtist, activeContentId]);

  useEffect(() => {
    if (isOpen && activeTab === 'LIVE') {
      requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ behavior: 'instant' }));
    }
  }, [isOpen, activeTab]);

  useEffect(() => {
    if (activeTab !== 'GLOBAL_FEED' && activeTab !== 'MY_FEED') return;
    const unsub = fetchFeed((items) => {
      setPosts(items);
      if (auth.currentUser) setMyPosts(items.filter(p => p.authorId === auth.currentUser?.uid));
    });
    return () => unsub();
  }, [activeTab]);

  const currentMessages = msgCache[liveRoomId] ?? [];
  const isOwnWork = !!activeContentId && (currentTrack?.artistId === uid || (currentAlbum as any)?.ownerId === uid);
  const hasPostedInRoom = currentMessages.some(m => m.senderId === uid);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !auth.currentUser) return;
    const text = inputText;
    setInputText('');
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

  const handleSendPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !auth.currentUser) return;
    const text = inputText;
    setInputText('');
    await postToFeed({
      authorId: auth.currentUser.uid,
      authorName: auth.currentUser.displayName || 'Anonymous',
      authorPhoto: auth.currentUser.photoURL || '',
      content: text,
      type: 'COMMENT',
      shareCount: 0,
    });
  };

  const handleShareSongDM = useCallback(() => {
    if (!activeContentId) return;
    setDmTarget({ id: '_song_share', name: 'a friend', photo: '' });
  }, [activeContentId]);

  const openDM = (msg: ChatMessage) => {
    if (!auth.currentUser || msg.senderId === auth.currentUser.uid) return;
    setDmTarget({ id: msg.senderId, name: msg.senderName, photo: msg.senderPhoto || '' });
  };

  const handleMarkAllRead = () => {
    notifications.filter(n => !n.isRead).forEach(n => markAsRead(n.id));
  };

  const totalBadge = unreadCount + (currentMessages.length > 0 ? 1 : 0);

  const tabs: { id: TabType; icon: React.ElementType; label: string; badge?: number }[] = [
    { id: 'LIVE',        icon: MessageSquare, label: 'Live' },
    { id: 'LIVETALK',   icon: Mic,           label: 'Talk' },
    { id: 'GLOBAL_FEED', icon: Globe,         label: 'Global' },
    { id: 'MY_FEED',    icon: User,          label: 'Me' },
    { id: 'ALERTS',     icon: Bell,          label: 'Alerts', badge: unreadCount },
    ...(isOwnWork ? [{ id: 'MUSIC' as TabType, icon: Music, label: 'My Chat' }] : []),
  ];

  return (
    <>
      {/* Toggle handle */}
      <button
        onClick={() => setIsOpen(v => !v)}
        className="fixed top-1/2 right-0 -translate-y-1/2 z-[500] bg-black/40 backdrop-blur-3xl border border-white/10 p-3 rounded-l-2xl shadow-2xl group transition-all hover:bg-white/10"
      >
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} className="text-white/60 group-hover:text-white">
          <ChevronLeft size={20} />
        </motion.div>
        {!isOpen && totalBadge > 0 && (
          <span className="absolute -top-1 -left-1 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center text-[9px] font-black text-black border-2 border-black">
            {totalBadge > 9 ? '9+' : totalBadge}
          </span>
        )}
      </button>

      {/* Main drawer */}
      <motion.aside
        initial={false}
        animate={{ x: isOpen ? 0 : '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 200 }}
        className="fixed top-0 right-0 h-full w-[400px] bg-[#080808]/85 backdrop-blur-3xl border-l border-white/8 z-[450] flex flex-col shadow-[-40px_0_80px_rgba(0,0,0,0.6)]"
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-0 border-b border-white/5 shrink-0">
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 bg-orange-400 rounded-full shadow-[0_0_8px_rgba(255,140,0,0.8)]" />
              <span className="text-xs font-black uppercase tracking-widest text-white/50">Plajah Comms</span>
            </div>
            <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-white/8 rounded-full text-white/40 hover:text-white transition-colors">
              <X size={15} />
            </button>
          </div>

          {/* Tab bar — full width, no pill bg, border-bottom indicator style */}
          <div className="flex">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex flex-col items-center gap-1 pt-2 pb-3 relative transition-colors ${
                  activeTab === tab.id ? 'text-white' : 'text-white/30 hover:text-white/55'
                }`}
              >
                <div className="relative">
                  {React.createElement(tab.icon as any, { size: 16 })}
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[14px] h-[14px] bg-orange-500 rounded-full text-[8px] font-black text-black flex items-center justify-center px-0.5 border border-black">
                      {tab.badge > 9 ? '9+' : tab.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-black tracking-wider">{tab.label}</span>
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="drawerTabLine"
                    className="absolute bottom-0 left-2 right-2 h-[2px] bg-orange-400 rounded-full"
                  />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0 relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="flex-1 flex flex-col min-h-0"
            >

              {/* ── LIVE TAB ── */}
              {activeTab === 'LIVE' && (
                <div className="flex-1 flex flex-col min-h-0">
                  <div className="px-4 py-2.5 bg-white/[0.02] border-b border-white/5 shrink-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <Music size={13} className="text-orange-400 shrink-0" />
                        <span className="text-sm font-bold text-white truncate">
                          {activeContentTitle || 'Global Chat'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {activeContentId && (
                          <button
                            onClick={handleShareSongDM}
                            title="Share this song via DM"
                            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400 hover:bg-orange-500/20 transition-colors"
                          >
                            <Share2 size={11} />
                            <span className="text-[11px] font-bold">Share</span>
                          </button>
                        )}
                        <div className="flex items-center gap-1 px-2 py-1 bg-white/5 rounded-lg border border-white/8">
                          <Users size={11} className="text-white/40" />
                          <span className="text-xs font-bold text-white/50">{currentMessages.length > 0 ? currentMessages.length : '—'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Loading skeleton — prevents gate from flashing before messages hydrate */}
                  {messagesLoading && !isOwnWork && activeContentId ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3">
                      <div className="w-10 h-10 rounded-full border-2 border-orange-500/30 border-t-orange-500 animate-spin" />
                      <p className="text-xs text-white/20">Loading chat…</p>
                    </div>
                  ) : /* Gate: must post first unless you're the artist or there's no content-specific room */
                  !hasPostedInRoom && !isOwnWork && activeContentId ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
                      <div className="w-14 h-14 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                        <MessageSquare size={24} className="text-orange-400" />
                      </div>
                      <div>
                        <p className="text-sm font-black text-white mb-1">Join the live chat</p>
                        <p className="text-xs text-white/35 leading-relaxed">Send your first message to see the full conversation around this {currentTrack ? 'track' : 'content'}.</p>
                      </div>
                      {auth.currentUser ? (
                        <form onSubmit={handleSendMessage} className="w-full">
                          <div className="flex items-center gap-2">
                            <img
                              src={auth.currentUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`}
                              className="w-7 h-7 rounded-full border border-white/10 shrink-0"
                              alt=""
                            />
                            <input
                              type="text"
                              value={inputText}
                              onChange={e => setInputText(e.target.value)}
                              placeholder="Your first message…"
                              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-orange-500/40 transition-colors"
                            />
                            <button
                              type="submit"
                              disabled={!inputText.trim()}
                              className="p-2 rounded-xl bg-orange-500 text-black disabled:opacity-40 hover:bg-orange-400 transition-colors shrink-0"
                            >
                              <Send size={14} />
                            </button>
                          </div>
                        </form>
                      ) : (
                        <p className="text-xs text-white/30">Sign in to join</p>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0 scrollbar-hide">
                        {currentMessages.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center gap-3 text-white/20">
                            <MessageSquare size={32} />
                            <p className="text-sm font-bold">No messages yet</p>
                            <p className="text-xs text-white/15">Be the first to say something</p>
                          </div>
                        ) : (
                          currentMessages.map(msg => (
                            <MsgBubble key={msg.id} msg={msg} isMe={msg.senderId === uid} onDM={openDM} />
                          ))
                        )}
                        <div ref={messagesEndRef} />
                      </div>

                      {auth.currentUser ? (
                        <form onSubmit={handleSendMessage} className="px-3 py-3 border-t border-white/5 shrink-0">
                          <div className="relative flex items-center gap-2">
                            <img
                              src={auth.currentUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`}
                              className="w-7 h-7 rounded-full border border-white/10 shrink-0"
                              alt=""
                            />
                            <input
                              type="text"
                              value={inputText}
                              onChange={e => setInputText(e.target.value)}
                              placeholder="Say something…"
                              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-orange-500/40 transition-colors"
                            />
                            <button
                              type="submit"
                              disabled={!inputText.trim()}
                              className="p-2 rounded-xl bg-orange-500 text-black disabled:opacity-40 hover:bg-orange-400 transition-colors shrink-0"
                            >
                              <Send size={14} />
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="px-4 py-3 border-t border-white/5 text-center text-xs text-white/30">Sign in to chat</div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ── LIVETALK TAB ── */}
              {activeTab === 'LIVETALK' && <LiveTalkView onBrowse={() => {}} />}

              {/* ── GLOBAL FEED TAB ── */}
              {activeTab === 'GLOBAL_FEED' && (
                <div className="flex-1 flex flex-col min-h-0">
                  <div className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between shrink-0">
                    <span className="text-sm font-black uppercase tracking-widest text-orange-400">Archive Feed</span>
                    <TrendingUp size={14} className="text-orange-400" />
                  </div>
                  <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 scrollbar-hide">
                    {posts.map(post => (
                      <div key={post.id} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <img src={post.authorPhoto || undefined} className="w-7 h-7 rounded-lg border border-white/10" alt="" />
                            <span className="text-xs font-bold text-white/80">{post.authorName}</span>
                          </div>
                          <span className="text-[11px] text-white/25">{new Date(post.timestamp).toLocaleDateString()}</span>
                        </div>
                        <p className="text-sm text-white/60 leading-relaxed">{post.content}</p>
                        <div className="flex items-center gap-4 pt-1">
                          <button className="flex items-center gap-1.5 text-white/25 hover:text-orange-400 transition-colors">
                            <Heart size={12} />
                            <span className="text-xs font-bold">{post.shareCount || 0}</span>
                          </button>
                          <button className="flex items-center gap-1.5 text-white/25 hover:text-blue-400 transition-colors">
                            <Share2 size={12} />
                            <span className="text-xs font-bold">Share</span>
                          </button>
                        </div>
                        <div className="h-px bg-white/4" />
                      </div>
                    ))}
                  </div>
                  <form onSubmit={handleSendPost} className="px-3 py-3 border-t border-white/5 shrink-0">
                    <textarea
                      value={inputText}
                      onChange={e => setInputText(e.target.value)}
                      placeholder="Share a thought…"
                      rows={2}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/30 resize-none focus:outline-none focus:border-orange-500/40 mb-2"
                    />
                    <button
                      type="submit"
                      disabled={!inputText.trim()}
                      className="w-full py-2.5 bg-white/6 border border-white/10 rounded-xl text-sm font-bold text-white/60 hover:bg-white/10 hover:text-white transition-all disabled:opacity-40"
                    >
                      Post
                    </button>
                  </form>
                </div>
              )}

              {/* ── MY FEED TAB ── */}
              {activeTab === 'MY_FEED' && (
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-hide">
                  <div className="flex items-center gap-3 pb-3 border-b border-white/5">
                    <img
                      src={auth.currentUser?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`}
                      className="w-12 h-12 rounded-2xl border-2 border-orange-500/30 object-cover"
                      alt=""
                    />
                    <div>
                      <p className="text-sm font-black text-white">{auth.currentUser?.displayName || 'Voyager'}</p>
                      <p className="text-xs text-orange-400 font-bold">Active Creator</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white/4 border border-white/8 rounded-xl p-3 text-center">
                      <div className="text-xl font-black text-white">{myPosts.length}</div>
                      <div className="text-xs text-white/40 font-bold mt-0.5">Posts</div>
                    </div>
                    <div className="bg-white/4 border border-white/8 rounded-xl p-3 text-center">
                      <div className="text-xl font-black text-white">{currentMessages.length}</div>
                      <div className="text-xs text-white/40 font-bold mt-0.5">Live msgs</div>
                    </div>
                  </div>
                  {myPosts.map(p => (
                    <div key={p.id} className="bg-white/4 border border-white/8 rounded-xl p-3">
                      <p className="text-sm text-white/60 leading-relaxed italic">"{p.content}"</p>
                      <div className="mt-2 flex justify-between items-center text-xs text-white/25 font-bold">
                        <span>{new Date(p.timestamp).toLocaleDateString()}</span>
                        <span>{p.shareCount || 0} vibes</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── MUSIC TAB (artist-only: always-open chat for own content) ── */}
              {activeTab === 'MUSIC' && isOwnWork && (
                <div className="flex-1 flex flex-col min-h-0">
                  <div className="px-4 py-2.5 bg-orange-500/5 border-b border-orange-500/15 shrink-0">
                    <div className="flex items-center gap-2">
                      <Music size={13} className="text-orange-400" />
                      <span className="text-sm font-black text-orange-300 truncate">Artist Chat — {activeContentTitle}</span>
                    </div>
                    <p className="text-[11px] text-orange-400/50 mt-0.5">Your fans in this live room</p>
                  </div>

                  <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0 scrollbar-hide">
                    {currentMessages.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center gap-3 text-white/20">
                        <Music size={32} />
                        <p className="text-sm font-bold">No messages yet</p>
                        <p className="text-xs text-white/15">Your listeners will appear here as they join</p>
                      </div>
                    ) : (
                      currentMessages.map(msg => (
                        <MsgBubble key={msg.id} msg={msg} isMe={msg.senderId === uid} onDM={openDM} />
                      ))
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {auth.currentUser && (
                    <form onSubmit={handleSendMessage} className="px-3 py-3 border-t border-orange-500/15 shrink-0">
                      <div className="flex items-center gap-2">
                        <img
                          src={auth.currentUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`}
                          className="w-7 h-7 rounded-full border border-orange-500/30 shrink-0"
                          alt=""
                        />
                        <input
                          type="text"
                          value={inputText}
                          onChange={e => setInputText(e.target.value)}
                          placeholder="Talk to your listeners…"
                          className="flex-1 bg-orange-500/5 border border-orange-500/20 rounded-xl px-3 py-2 text-sm text-white placeholder-orange-400/30 focus:outline-none focus:border-orange-500/50 transition-colors"
                        />
                        <button
                          type="submit"
                          disabled={!inputText.trim()}
                          className="p-2 rounded-xl bg-orange-500 text-black disabled:opacity-40 hover:bg-orange-400 transition-colors shrink-0"
                        >
                          <Send size={14} />
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {/* ── ALERTS TAB ── */}
              {activeTab === 'ALERTS' && (
                <div className="flex-1 flex flex-col min-h-0">
                  {/* Alerts header bar */}
                  <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                      <Bell size={13} className="text-orange-400" />
                      <span className="text-xs font-black uppercase tracking-widest text-white/60">
                        Alerts
                      </span>
                      {unreadCount > 0 && (
                        <span className="bg-orange-500/20 border border-orange-500/30 text-orange-400 text-[9px] font-black px-2 py-0.5 rounded-full">
                          {unreadCount} unread
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {unreadCount > 0 && (
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

                  {/* Scrollable notification list */}
                  <div className="flex-1 overflow-y-auto min-h-0 scrollbar-hide">
                    {notifications.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center gap-4 text-white/15 px-8 text-center">
                        <Inbox size={40} />
                        <div>
                          <p className="text-sm font-black uppercase tracking-widest mb-1">All clear</p>
                          <p className="text-xs text-white/10">Comments, replies, follows, and new posts from people you follow will appear here.</p>
                        </div>
                      </div>
                    ) : (
                      <div>
                        {notifications.map(n => (
                          <NotifRow
                            key={n.id}
                            notif={n}
                            onRead={markAsRead}
                            onNavigate={onNotificationNavigate}
                          />
                        ))}
                        <div className="h-8" />
                      </div>
                    )}
                  </div>
                </div>
              )}

            </motion.div>
          </AnimatePresence>

          {/* DM composer overlay */}
          <AnimatePresence>
            {dmTarget && (
              <DMComposer
                targetId={dmTarget.id}
                targetName={dmTarget.name}
                targetPhoto={dmTarget.photo}
                songTitle={dmTarget.id === '_song_share' ? activeContentTitle : undefined}
                songId={dmTarget.id === '_song_share' ? activeContentId : undefined}
                onClose={() => setDmTarget(null)}
              />
            )}
          </AnimatePresence>
        </div>
      </motion.aside>
    </>
  );
};

export default PersistentChatDrawer;
