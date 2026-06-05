import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  MessageSquare, Users, Globe, User, Send, X,
  ChevronLeft, Mic, MicOff, VideoOff, Settings,
  Radio, Music, Share2, Heart, TrendingUp, AtSign,
  Mail, ChevronRight, Loader2, Clock, MapPin,
} from 'lucide-react';
import { ChatMessage, UserProfile, FeedItem, AppView } from '../types';

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
import LiveTalkView from './LiveTalkView';

type TabType = 'LIVE' | 'LIVETALK' | 'GLOBAL_FEED' | 'MY_FEED';

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
  const [text, setText] = useState(
    songId ? `🎵 Check out "${songTitle}" on Plajah! ` : ''
  );
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    if (!text.trim() || !auth.currentUser) return;
    setSending(true);
    try {
      const roomId = await createChatRoom(
        [auth.currentUser.uid, targetId],
        'PRIVATE'
      );
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
          <img
            src={targetPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${targetId}`}
            className="w-7 h-7 rounded-full border border-white/10"
            alt=""
          />
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
          isMe
            ? 'bg-orange-500/20 text-white border border-orange-500/20'
            : 'bg-white/6 text-white/90 border border-white/8'
        }`}>
          {msg.text}
        </div>
        <span className="text-[10px] text-white/25 px-1">{time}</span>
      </div>

      {/* DM button — appears on hover for other users' messages */}
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

// ── Main Drawer ────────────────────────────────────────────────────────────────

const PersistentChatDrawer: React.FC<{ currentView?: AppView }> = ({ currentView }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('LIVE');

  // Message cache: roomId → messages[]
  const [msgCache, setMsgCache] = useState<Record<string, ChatMessage[]>>({});
  const [inputText, setInputText] = useState('');
  const [posts, setPosts] = useState<FeedItem[]>([]);
  const [myPosts, setMyPosts] = useState<FeedItem[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const listenerRef = useRef<(() => void) | null>(null);
  const currentRoomRef = useRef<string | null>(null);

  // DM composer state
  const [dmTarget, setDmTarget] = useState<{ id: string; name: string; photo: string } | null>(null);

  const { currentVideo, currentTrack, currentAlbum } = useGlobalPlayerState();
  const activeContentId = currentVideo?.id || currentTrack?.id || currentAlbum?.id;
  const activeContentTitle = currentVideo?.title || currentTrack?.title || currentAlbum?.title;
  const activeContentCover = currentTrack?.albumCover || (currentAlbum as any)?.coverArt || (currentAlbum as any)?.coverUrl || currentVideo?.thumbnailUrl;
  const activeContentArtist = currentTrack?.artist || (currentAlbum as any)?.artist;
  const liveRoomId = activeContentId ? `live_chat_${activeContentId}` : 'live_chat_global';

  const uid = auth.currentUser?.uid;

  // ── Always maintain live chat listener ────────────────────────────────────────
  useEffect(() => {
    // Only re-subscribe when the room actually changes
    if (currentRoomRef.current === liveRoomId) return;
    currentRoomRef.current = liveRoomId;

    // Unsub previous
    listenerRef.current?.();

    // Upsert the room document with song metadata so ChatSystem shows cover art
    if (activeContentId && auth.currentUser) {
      ensureLiveChatRoom(liveRoomId, {
        name: activeContentTitle || 'Live Chat',
        coverUrl: activeContentCover,
        mediaId: activeContentId,
        mediaArtist: activeContentArtist,
      }).catch(() => {});
    }

    listenerRef.current = listenToMessages(liveRoomId, (msgs) => {
      setMsgCache(prev => ({ ...prev, [liveRoomId]: msgs }));
      // Auto-scroll if drawer is open on LIVE tab
      if (isOpen && activeTab === 'LIVE') {
        requestAnimationFrame(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        });
      }
    });

    return () => {
      listenerRef.current?.();
      listenerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveRoomId, activeContentTitle, activeContentCover, activeContentArtist, activeContentId]);

  // Scroll to bottom when opening on LIVE tab
  useEffect(() => {
    if (isOpen && activeTab === 'LIVE') {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
      });
    }
  }, [isOpen, activeTab]);

  // Feed subscription
  useEffect(() => {
    if (activeTab !== 'GLOBAL_FEED' && activeTab !== 'MY_FEED') return;
    const unsub = fetchFeed((items) => {
      setPosts(items);
      if (auth.currentUser) {
        setMyPosts(items.filter(p => p.authorId === auth.currentUser?.uid));
      }
    });
    return () => unsub();
  }, [activeTab]);

  const currentMessages = msgCache[liveRoomId] ?? [];

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
    // Opens DM composer pre-filled with a song share — user picks recipient by typing handle
    // For now we open a generic DM prompt; full user-picker is in ChatSystem
    setDmTarget({ id: '_song_share', name: 'a friend', photo: '' });
  }, [activeContentId]);

  const openDM = (msg: ChatMessage) => {
    if (!auth.currentUser || msg.senderId === auth.currentUser.uid) return;
    setDmTarget({ id: msg.senderId, name: msg.senderName, photo: msg.senderPhoto || '' });
  };

  const tabs = [
    { id: 'LIVE' as TabType, icon: MessageSquare, label: 'Live' },
    { id: 'LIVETALK' as TabType, icon: Mic, label: 'Talk' },
    { id: 'GLOBAL_FEED' as TabType, icon: Globe, label: 'Global' },
    { id: 'MY_FEED' as TabType, icon: User, label: 'Me' },
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
        {/* Unread badge */}
        {!isOpen && currentMessages.length > 0 && (
          <span className="absolute -top-1 -left-1 w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center text-[10px] font-black text-black">
            {currentMessages.length > 9 ? '9+' : currentMessages.length}
          </span>
        )}
      </button>

      {/* Main drawer */}
      <motion.aside
        initial={false}
        animate={{ x: isOpen ? 0 : '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 200 }}
        className="fixed top-0 right-0 h-full w-[380px] bg-black/70 backdrop-blur-3xl border-l border-white/5 z-[450] flex flex-col shadow-[-40px_0_80px_rgba(0,0,0,0.5)]"
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-white/5 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 bg-orange-400 rounded-full shadow-[0_0_8px_rgba(255,140,0,0.8)]" />
              <span className="text-xs font-black uppercase tracking-widest text-white/50">Plajah Comms</span>
            </div>
            <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-white/8 rounded-full text-white/40 hover:text-white transition-colors">
              <X size={15} />
            </button>
          </div>
          <div className="flex bg-black/40 rounded-2xl p-0.5 border border-white/5">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex flex-col items-center py-2 transition-all rounded-xl relative ${
                  activeTab === tab.id ? 'text-white' : 'text-white/35 hover:text-white/60'
                }`}
              >
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="drawerActiveTab"
                    className="absolute inset-0 bg-white/6 rounded-xl border border-white/10"
                  />
                )}
                <tab.icon size={15} className="relative z-10" />
                <span className="text-[11px] font-bold mt-0.5 relative z-10">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0 relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex-1 flex flex-col min-h-0"
            >

              {/* ── LIVE TAB ── */}
              {activeTab === 'LIVE' && (
                <div className="flex-1 flex flex-col min-h-0">
                  {/* Song context bar */}
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
                          <span className="text-xs font-bold text-white/50">{currentMessages.length > 0 ? `${currentMessages.length}` : '—'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0 scrollbar-hide">
                    {currentMessages.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center gap-3 text-white/20">
                        <MessageSquare size={32} />
                        <p className="text-sm font-bold">No messages yet</p>
                        <p className="text-xs text-white/15">Be the first to say something</p>
                      </div>
                    ) : (
                      currentMessages.map(msg => (
                        <MsgBubble
                          key={msg.id}
                          msg={msg}
                          isMe={msg.senderId === uid}
                          onDM={openDM}
                        />
                      ))
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Input */}
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
                    <div className="px-4 py-3 border-t border-white/5 text-center text-xs text-white/30">
                      Sign in to chat
                    </div>
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
