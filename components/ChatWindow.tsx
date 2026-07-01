import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send, Mic, Video, Phone, Plus, Image as ImageIcon, Sparkles,
  ChevronLeft, MoreVertical, X, Play, Pause, Layers, Music,
  Check, CheckCheck, User, Download, StopCircle, Reply, Pin,
  Forward, Search, Globe, Smile, Hash, Copy, Trash2, Star,
  Bold, Italic, Link, AtSign, BarChart2, AlertCircle, Volume2,
  Flame, Timer, Camera, Radio,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ChatMessage, ChatRoom, UserProfile, CollabProject, Album } from '../types';
import {
  sendMessage, listenToMessages, auth,
  createCollabProject, fetchCollabProjects, fetchUserContent,
  updateTypingStatus, markMessageAsSeen, fetchUserProfiles,
  uploadFile,
} from '../services/backendService';
import { encryptText, decryptText } from '../services/cryptoService';
import GifStickerPicker from './GifStickerPicker';
import VoiceRecorder from './VoiceRecorder';
import WalkieTalkie from './WalkieTalkie';
import {
  doc, updateDoc, arrayUnion, arrayRemove, deleteDoc, collection,
} from 'firebase/firestore';
import { db } from '../services/firebase';

// ── Extended ChatMessage with reactions + reply ───────────────────────────────
type ExtendedMessage = ChatMessage & {
  replyToId?: string;
  replyToText?: string;
  replyToSender?: string;
  reactions?: Record<string, string[]>;  // emoji → UIDs
  isPinned?: boolean;
  forwardedFrom?: string;
  burnAfterSeen?: boolean; // arm flag — countdown starts when recipient sees it
  burnAfter?: number;      // epoch ms set by markMessageAsSeen when recipient views
  videoNoteUrl?: string;
  gifUrl?: string;         // GIF (Giphy) attached to the message
};

interface ChatWindowProps {
  room: ChatRoom;
  profiles?: Record<string, UserProfile>;
  currentUserProfile?: UserProfile;
  onBack?: () => void;
  onOpenCollab: (projectId: string) => void;
  onStartVideo?: () => void;
}

const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '🔥', '👏', '💯', '🎯'];

// ── Voice player ──────────────────────────────────────────────────────────────
const VoicePlayer: React.FC<{ src: string }> = ({ src }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const a = new Audio(src);
    audioRef.current = a;
    a.onloadedmetadata = () => setDuration(a.duration);
    a.ontimeupdate = () => setProgress(a.currentTime / (a.duration || 1));
    a.onended = () => { setPlaying(false); setProgress(0); };
    return () => { a.pause(); a.src = ''; };
  }, [src]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <div className="flex items-center gap-3 min-w-[200px]">
      <button onClick={() => {
        if (!audioRef.current) return;
        playing ? audioRef.current.pause() : audioRef.current.play();
        setPlaying(p => !p);
      }} className="w-9 h-9 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center shrink-0 transition-all">
        {playing ? <Pause size={13} fill="white" /> : <Play size={13} fill="white" />}
      </button>
      <div className="flex-1 space-y-1">
        <div
          className="h-1.5 rounded-full bg-white/20 cursor-pointer overflow-hidden"
          onClick={e => {
            const r = e.currentTarget.getBoundingClientRect();
            if (audioRef.current) audioRef.current.currentTime = ((e.clientX - r.left) / r.width) * (audioRef.current.duration || 0);
          }}
        >
          <div className="h-full rounded-full bg-white transition-all" style={{ width: `${progress * 100}%` }} />
        </div>
        <span className="text-[9px] font-mono opacity-50">{fmt(playing && audioRef.current ? audioRef.current.currentTime : duration)}</span>
      </div>
      <Volume2 size={12} className="opacity-30 shrink-0" />
    </div>
  );
};

// ── Room Avatar (inline helper) ───────────────────────────────────────────────
const RoomHeaderAvatar: React.FC<{ room: ChatRoom; profiles: Record<string, UserProfile> }> = ({ room, profiles }) => {
  const uid = auth.currentUser?.uid;
  if (room.type === 'PRIVATE') {
    const otherId = room.participants.find(id => id !== uid);
    const p = otherId ? profiles[otherId] : null;
    return (
      <div className="w-9 h-9 rounded-xl overflow-hidden border border-white/10 shrink-0">
        {p?.photoURL ? <img src={p.photoURL} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-white/10 flex items-center justify-center"><User size={14} className="text-white/20" /></div>}
      </div>
    );
  }
  // Song live chat — show cover art
  if (room.id.startsWith('live_chat_') && room.coverUrl) {
    return (
      <div className="w-9 h-9 rounded-xl overflow-hidden border border-orange-500/30 shrink-0 relative">
        <img src={room.coverUrl} alt={room.name} className="w-full h-full object-cover" />
        <div className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border border-black" />
      </div>
    );
  }
  return (
    <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/10 shrink-0 flex items-center justify-center">
      <Hash size={16} className="text-white/40" />
    </div>
  );
};

// ── Reaction badge ────────────────────────────────────────────────────────────
const ReactionBadge: React.FC<{
  emoji: string; count: number; hasReacted: boolean;
  onClick: () => void;
}> = ({ emoji, count, hasReacted, onClick }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border transition-all ${
      hasReacted ? 'bg-small-orange/20 border-small-orange/40 text-small-orange' : 'bg-white/5 border-white/10 hover:bg-white/10'
    }`}
  >
    <span>{emoji}</span>
    <span className="font-bold text-[9px]">{count}</span>
  </button>
);

// ── Main Component ─────────────────────────────────────────────────────────────
const ChatWindow: React.FC<ChatWindowProps> = ({
  room, profiles: externalProfiles = {}, currentUserProfile, onBack, onOpenCollab, onStartVideo,
}) => {
  const [messages, setMessages] = useState<ExtendedMessage[]>([]);
  const [decryptedMessages, setDecryptedMsgs] = useState<ExtendedMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>(externalProfiles);
  const [collabProjects, setCollabProjects] = useState<CollabProject[]>([]);
  const [showCollabMenu, setShowCollabMenu] = useState(false);
  const [showMediaSelector, setShowMediaSelector] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [userMedia, setUserMedia] = useState<Album[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  // New UX state
  const [replyTo, setReplyTo] = useState<ExtendedMessage | null>(null);
  const [pinnedMessages, setPinnedMessages] = useState<ExtendedMessage[]>([]);
  const [showPinnedPanel, setShowPinnedPanel] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenuMsg, setContextMenuMsg] = useState<ExtendedMessage | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null); // messageId
  const [showFediversePanel, setShowFediversePanel] = useState(false);
  const [fediverseText, setFediverseText] = useState('');
  const [showMembersPanel, setShowMembersPanel] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showWalkie, setShowWalkie] = useState(false);

  // Burn-after-read (self-destructing) toggle
  const [burnMode, setBurnMode]             = useState(false);
  // Video note recording
  const [showVideoNote, setShowVideoNote]   = useState(false);
  const [videoRecording, setVideoRecording] = useState(false);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const videoStreamRef  = useRef<MediaStream | null>(null);
  const videoRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef  = useRef<Blob[]>([]);

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Merge external profiles
  useEffect(() => {
    setProfiles(prev => ({ ...externalProfiles, ...prev }));
  }, [externalProfiles]);

  // Decrypt messages
  useEffect(() => {
    if (messages.length === 0) { setDecryptedMsgs([]); return; }
    let cancelled = false;
    Promise.all(messages.map(async m => ({
      ...m,
      text: m.text ? await decryptText(m.text, room.id) : m.text,
    }))).then(dec => {
      if (!cancelled) {
        setDecryptedMsgs(dec as ExtendedMessage[]);
        setPinnedMessages(dec.filter(m => (m as ExtendedMessage).isPinned) as ExtendedMessage[]);
      }
    });
    return () => { cancelled = true; };
  }, [messages, room.id]);

  useEffect(() => {
    const unsub = listenToMessages(room.id, (msgs) => {
      setMessages(msgs as ExtendedMessage[]);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
      // Only mark-as-seen (and arm burn timers) in PRIVATE DMs — not in PUBLIC_LIVE channels
      if (room.type === 'PRIVATE') {
        const last = msgs[msgs.length - 1];
        if (last && last.senderId !== auth.currentUser?.uid && !last.seenBy?.includes(auth.currentUser?.uid ?? '')) {
          markMessageAsSeen(room.id, last.id);
        }
      }
    });

    fetchUserProfiles(room.participants).then(ps => {
      const m: Record<string, UserProfile> = {};
      ps.forEach(p => { m[p.uid] = p; });
      setProfiles(prev => ({ ...prev, ...m }));
    });
    fetchCollabProjects(room.id).then(setCollabProjects);
    if (auth.currentUser) fetchUserContent(auth.currentUser.uid).then(setUserMedia);

    return () => {
      unsub();
      if (isTyping) updateTypingStatus(room.id, false);
    };
  }, [room.id]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    if (!isTyping) { setIsTyping(true); updateTypingStatus(room.id, true); }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      updateTypingStatus(room.id, false);
    }, 3000);
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim()) return;
    if (isTyping) { setIsTyping(false); updateTypingStatus(room.id, false); clearTimeout(typingTimeoutRef.current!); }

    const encrypted = await encryptText(inputText, room.id);
    const msgData: any = {
      senderId: auth.currentUser?.uid || '',
      senderName: auth.currentUser?.displayName || 'Anonymous',
      senderPhoto: auth.currentUser?.photoURL || '',
      text: encrypted,
      type: 'TEXT',
    };

    if (replyTo) {
      msgData.replyToId = replyTo.id;
      msgData.replyToText = replyTo.text?.slice(0, 80);
      msgData.replyToSender = replyTo.senderName;
    }

    if (burnMode) {
      msgData.burnAfterSeen = true; // countdown starts when recipient sees it, not now
    }

    await sendMessage(room.id, msgData);
    setInputText('');
    setReplyTo(null);
  };

  // Send a GIF (Giphy) — carries a gifUrl the bubble renders inline.
  const sendGif = async (url: string) => {
    setShowGif(false);
    await sendMessage(room.id, {
      senderId: auth.currentUser?.uid || '',
      senderName: auth.currentUser?.displayName || 'Anonymous',
      senderPhoto: auth.currentUser?.photoURL || '',
      text: '',
      gifUrl: url,
      type: 'IMAGE',
      ...(replyTo ? { replyToId: replyTo.id, replyToText: replyTo.text?.slice(0, 80), replyToSender: replyTo.senderName } : {}),
    } as any);
    setReplyTo(null);
  };

  // ── Video note handlers ───────────────────────────────────────────────────────
  const openVideoNote = async () => {
    setShowVideoNote(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      videoStreamRef.current = stream;
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
        videoPreviewRef.current.play().catch(() => {});
      }
    } catch {
      setShowVideoNote(false);
    }
  };

  const startVideoRecord = () => {
    if (!videoStreamRef.current) return;
    videoChunksRef.current = [];
    const recorder = new MediaRecorder(videoStreamRef.current);
    recorder.ondataavailable = e => { if (e.data.size > 0) videoChunksRef.current.push(e.data); };
    recorder.onstop = async () => {
      const blob = new Blob(videoChunksRef.current, { type: 'video/webm' });
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        await sendMessage(room.id, {
          senderId: auth.currentUser?.uid || '',
          senderName: auth.currentUser?.displayName || 'Anonymous',
          senderPhoto: auth.currentUser?.photoURL || '',
          videoNoteUrl: reader.result as string,
          type: 'VIDEO_NOTE',
          ...(burnMode ? { burnAfterSeen: true } : {}),
        });
        closeVideoNote();
      };
    };
    recorder.start();
    videoRecorderRef.current = recorder;
    setVideoRecording(true);
  };

  const stopVideoRecord = () => {
    videoRecorderRef.current?.stop();
    setVideoRecording(false);
  };

  const closeVideoNote = () => {
    videoStreamRef.current?.getTracks().forEach(t => t.stop());
    videoStreamRef.current = null;
    setShowVideoNote(false);
    setVideoRecording(false);
  };

  // ── Auto-delete burned messages ───────────────────────────────────────────────
  useEffect(() => {
    const now = Date.now();
    const timers: ReturnType<typeof setTimeout>[] = [];

    decryptedMessages.forEach(m => {
      if (!m.burnAfter) return;
      const msLeft = m.burnAfter - now;
      if (msLeft <= 0) {
        // Already expired — delete immediately
        deleteDoc(doc(db, 'chat_rooms', room.id, 'messages', m.id)).catch(() => {});
      } else {
        // Schedule deletion when the countdown reaches zero
        const t = setTimeout(() => {
          deleteDoc(doc(db, 'chat_rooms', room.id, 'messages', m.id)).catch(() => {});
        }, msLeft);
        timers.push(t);
      }
    });

    return () => timers.forEach(clearTimeout);
  }, [decryptedMessages, room.id]);

  const handleSendVoice = async (blob: Blob) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = async () => {
      await sendMessage(room.id, {
        senderId: auth.currentUser?.uid || '',
        senderName: auth.currentUser?.displayName || 'Anonymous',
        senderPhoto: auth.currentUser?.photoURL || '',
        voiceUrl: reader.result as string,
        type: 'VOICE',
      });
      setShowVoiceRecorder(false);
    };
  };

  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const path = `chat/${room.id}/images/${Date.now()}_${file.name}`;
      const url = await uploadFile(path, file);
      if (url) {
        await sendMessage(room.id, {
          senderId: auth.currentUser?.uid || '',
          senderName: auth.currentUser?.displayName || 'Anonymous',
          senderPhoto: auth.currentUser?.photoURL || '',
          imageUrl: url,
          type: 'IMAGE',
        });
      }
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  const handleReact = async (msgId: string, emoji: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const msg = decryptedMessages.find(m => m.id === msgId);
    if (!msg) return;
    const current = (msg.reactions?.[emoji] || []) as string[];
    const hasReacted = current.includes(uid);
    const msgRef = doc(db, 'chatRooms', room.id, 'messages', msgId);
    const field = `reactions.${emoji}`;
    if (hasReacted) {
      await updateDoc(msgRef, { [field]: arrayRemove(uid) });
    } else {
      await updateDoc(msgRef, { [field]: arrayUnion(uid) });
    }
    setShowEmojiPicker(null);
  };

  const handlePinMessage = async (msgId: string, currentPinned: boolean) => {
    const msgRef = doc(db, 'chatRooms', room.id, 'messages', msgId);
    await updateDoc(msgRef, { isPinned: !currentPinned });
    setContextMenuMsg(null);
  };

  const handleDeleteMessage = async (msgId: string) => {
    if (!window.confirm('Delete this message?')) return;
    await deleteDoc(doc(db, 'chat_rooms', room.id, 'messages', msgId));
    setContextMenuMsg(null);
  };

  const handleCopyText = (text?: string) => {
    if (text) navigator.clipboard.writeText(text);
    setContextMenuMsg(null);
  };

  const handleForwardMessage = (msg: ExtendedMessage) => {
    setContextMenuMsg(null);
    setInputText(`↪ ${msg.text || '[media]'}`);
    inputRef.current?.focus();
  };

  const handleBroadcastToFediverse = async () => {
    if (!fediverseText.trim()) return;
    try {
      const res = await fetch('/api/fediverse/broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await auth.currentUser?.getIdToken()}`,
        },
        body: JSON.stringify({ text: fediverseText, url: window.location.href }),
      });
      if (res.ok) {
        setFediverseText('');
        setShowFediversePanel(false);
        await sendMessage(room.id, {
          senderId: auth.currentUser?.uid || '',
          senderName: auth.currentUser?.displayName || 'Anonymous',
          senderPhoto: auth.currentUser?.photoURL || '',
          text: await encryptText(`📡 Posted to Fediverse: "${fediverseText}"`, room.id),
          type: 'SYSTEM',
        });
      }
    } catch (err) {
      console.error('Fediverse broadcast failed:', err);
    }
  };

  const handleCreateCollab = async () => {
    const name = prompt('Collaboration board name:');
    if (name) {
      const id = await createCollabProject(name, room.id);
      setCollabProjects(prev => [...prev, { id, name, chatRoomId: room.id, assets: [], links: [], updatedAt: Date.now(), ownerId: auth.currentUser?.uid || '' }]);
      onOpenCollab(id);
    }
  };

  const handleSendMedia = async (media: Album) => {
    await sendMessage(room.id, {
      senderId: auth.currentUser?.uid || '',
      senderName: auth.currentUser?.displayName || 'Anonymous',
      senderPhoto: auth.currentUser?.photoURL || '',
      mediaId: media.id,
      mediaType: 'ALBUM',
      text: await encryptText(`Shared: ${media.title}`, room.id),
      type: 'MEDIA',
    });
    setShowMediaSelector(false);
  };

  const uid = auth.currentUser?.uid;
  const typingUsers = room.typingUsers?.filter(id => id !== uid) || [];
  const roomName = room.type === 'PRIVATE'
    ? (profiles[room.participants.find(id => id !== uid) ?? '']?.displayName || 'Direct Message')
    : (room.name || (room.type === 'PUBLIC_LIVE' ? 'Live Channel' : 'Group Chat'));
  const walkiePeerUid = room.type === 'PRIVATE' ? room.participants.find(id => id !== uid) : undefined;

  const displayedMessages = searchMode && searchQuery
    ? decryptedMessages.filter(m => m.text?.toLowerCase().includes(searchQuery.toLowerCase()))
    : decryptedMessages;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-black/10">
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageFile} />

      {/* ── HEADER — song live chat gets a full cover banner ───────── */}
      {room.id.startsWith('live_chat_') && room.coverUrl && (
        <div className="shrink-0 relative h-24 overflow-hidden">
          <img src={room.coverUrl} alt="" className="w-full h-full object-cover opacity-50" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/80" />
          <div className="absolute bottom-2 left-4 right-4">
            <p className="text-base font-black text-white truncate">{room.name || 'Live Chat'}</p>
            {room.mediaArtist && <p className="text-xs text-orange-400 font-bold">{room.mediaArtist}</p>}
          </div>
        </div>
      )}

      {/* ── HEADER ──────────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 py-3 bg-black/30 backdrop-blur-xl border-b border-white/[0.06] flex items-center gap-3 z-20">
        {onBack && (
          <button onClick={onBack} className="lg:hidden p-2 hover:bg-white/10 rounded-xl transition-all shrink-0">
            <ChevronLeft size={18} />
          </button>
        )}

        <RoomHeaderAvatar room={room} profiles={profiles} />

        <div className="flex-1 min-w-0" onClick={() => room.type === 'GROUP' && setShowMembersPanel(true)} style={{ cursor: room.type === 'GROUP' ? 'pointer' : 'default' }}>
          <h3 className="text-sm font-black uppercase tracking-wider truncate">{roomName}</h3>
          <div className="flex items-center gap-2">
            {typingUsers.length > 0 ? (
              <span className="text-[9px] font-bold text-small-orange">typing…</span>
            ) : (
              <>
                <span className="text-[9px] font-bold text-white/25">
                  {room.type === 'PRIVATE' ? 'Direct Message' : `${room.participants.length} members`}
                </span>
                {pinnedMessages.length > 0 && (
                  <button onClick={() => setShowPinnedPanel(p => !p)} className="flex items-center gap-1 text-[9px] font-bold text-amber-400 hover:text-amber-300 transition-colors">
                    <Pin size={9} />
                    {pinnedMessages.length} pinned
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => { setSearchMode(p => !p); }} className={`p-2 rounded-xl transition-all ${searchMode ? 'bg-small-orange/20 text-small-orange' : 'text-white/30 hover:text-white hover:bg-white/5'}`}>
            <Search size={17} />
          </button>
          <button className="p-2 text-white/30 hover:text-white hover:bg-white/5 rounded-xl transition-all">
            <Phone size={17} />
          </button>
          <button onClick={onStartVideo} className="p-2 text-white/30 hover:text-white hover:bg-white/5 rounded-xl transition-all">
            <Video size={17} />
          </button>
          {walkiePeerUid && uid && (
            <button onClick={() => setShowWalkie(p => !p)} title="Two-Way (walkie-talkie)" className={`p-2 rounded-xl transition-all ${showWalkie ? 'bg-small-orange/20 text-small-orange' : 'text-white/30 hover:text-white hover:bg-white/5'}`}>
              <Radio size={17} />
            </button>
          )}
          <button
            onClick={() => setShowCollabMenu(p => !p)}
            className={`p-2 rounded-xl transition-all ${showCollabMenu ? 'bg-small-orange/20 text-small-orange' : 'text-white/30 hover:text-white hover:bg-white/5'}`}
          >
            <Layers size={17} />
          </button>
          <div className="relative">
            <button onClick={() => setShowMoreMenu(p => !p)} className="p-2 text-white/30 hover:text-white hover:bg-white/5 rounded-xl transition-all">
              <MoreVertical size={17} />
            </button>
            <AnimatePresence>
              {showMoreMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -4 }}
                  className="absolute right-0 top-full mt-2 bg-[#111] border border-white/10 rounded-2xl p-2 z-50 shadow-2xl min-w-[160px]"
                >
                  {[
                    { icon: Pin, label: `${showPinnedPanel ? 'Hide' : 'Show'} Pinned`, action: () => setShowPinnedPanel(p => !p) },
                    { icon: Globe, label: 'Fediverse Broadcast', action: () => { setShowFediversePanel(p => !p); setShowMoreMenu(false); } },
                    { icon: Globe, label: 'Members', action: () => { setShowMembersPanel(p => !p); setShowMoreMenu(false); } },
                  ].map(({ icon: Icon, label, action }) => (
                    <button
                      key={label}
                      onClick={() => { action(); setShowMoreMenu(false); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-all text-left"
                    >
                      <Icon size={14} className="text-white/40" />
                      <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ── TWO-WAY (WALKIE-TALKIE) ─────────────────────────────────── */}
      {showWalkie && walkiePeerUid && uid && (
        <div className="fixed right-4 top-20 z-[60]">
          <WalkieTalkie selfUid={uid} peerUid={walkiePeerUid} peerName={roomName} onClose={() => setShowWalkie(false)} />
        </div>
      )}

      {/* ── SEARCH BAR ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {searchMode && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="shrink-0 px-4 py-2 bg-black/20 border-b border-white/[0.05] overflow-hidden"
          >
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={14} />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search messages…"
                className="w-full bg-white/[0.06] border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-small-orange/40 transition-all"
                autoFocus
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── PINNED PANEL ──────────────────────────────────────────── */}
      <AnimatePresence>
        {showPinnedPanel && pinnedMessages.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="shrink-0 px-4 py-2 bg-amber-500/5 border-b border-amber-500/20 overflow-hidden"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Pin size={12} className="text-amber-400" />
              <span className="text-[9px] font-black uppercase tracking-widest text-amber-400">Pinned Messages</span>
            </div>
            <div className="space-y-1 max-h-28 overflow-y-auto scrollbar-hide">
              {pinnedMessages.map(m => (
                <div key={m.id} className="text-[10px] text-white/60 truncate px-2 py-1 bg-white/[0.03] rounded-lg">
                  <span className="text-white/30 mr-1">{m.senderName}:</span>
                  {m.text || '[media]'}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── FEDIVERSE PANEL ─────────────────────────────────────────── */}
      <AnimatePresence>
        {showFediversePanel && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="shrink-0 p-4 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border-b border-indigo-500/20 overflow-hidden"
          >
            <div className="flex items-center gap-2 mb-2">
              <Globe size={14} className="text-indigo-400" />
              <span className="text-[9px] font-black uppercase tracking-widest text-indigo-400">Broadcast to Fediverse (Mastodon + Bluesky)</span>
              <button onClick={() => setShowFediversePanel(false)} className="ml-auto p-1 hover:bg-white/10 rounded-lg"><X size={12} /></button>
            </div>
            <textarea
              value={fediverseText}
              onChange={e => setFediverseText(e.target.value)}
              placeholder="What's happening? This will post to all your connected fediverse accounts…"
              rows={2}
              maxLength={500}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-indigo-500/50 resize-none transition-all"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-[9px] text-white/20">{fediverseText.length}/500</span>
              <button
                onClick={handleBroadcastToFediverse}
                disabled={!fediverseText.trim()}
                className="px-4 py-1.5 bg-indigo-500 text-white text-[9px] font-black uppercase tracking-widest rounded-full hover:bg-indigo-400 transition-all disabled:opacity-30"
              >
                Broadcast
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── COLLAB DROPDOWN ─────────────────────────────────────────── */}
      <AnimatePresence>
        {showCollabMenu && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="absolute top-[4rem] right-4 bg-black/90 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 z-30 shadow-2xl w-72"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black uppercase tracking-widest">Collab Boards</span>
              <button onClick={handleCreateCollab} className="px-3 py-1.5 bg-small-orange text-white text-[8px] font-black uppercase tracking-widest rounded-full hover:bg-small-orange/80 transition-all">+ New</button>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-hide">
              {collabProjects.map(p => (
                <button key={p.id} onClick={() => { onOpenCollab(p.id); setShowCollabMenu(false); }}
                  className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-left hover:bg-white/10 transition-all flex items-center gap-3">
                  <Layers size={14} className="text-small-orange shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-wider truncate">{p.name}</p>
                    <p className="text-[8px] text-white/25">{p.assets?.length ?? 0} assets</p>
                  </div>
                </button>
              ))}
              {collabProjects.length === 0 && <p className="text-[9px] text-white/20 text-center py-4">No boards — create one</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── MESSAGES ────────────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto px-4 py-4 space-y-2 scrollbar-hide"
        onClick={() => { setContextMenuMsg(null); setShowEmojiPicker(null); setShowMoreMenu(false); }}
      >
        {displayedMessages.map((msg, i) => {
          const isMe = msg.senderId === uid;
          const isSeen = (msg.seenBy?.length ?? 0) > (isMe ? 1 : 0);
          const showName = !isMe && room.type !== 'PRIVATE';
          const senderProfile = profiles[msg.senderId];
          const hasReactions = msg.reactions && Object.values(msg.reactions).some(uids => uids.length > 0);

          if (msg.type === 'SYSTEM') {
            return (
              <div key={msg.id} className="flex justify-center py-1">
                <span className="text-[8px] font-bold uppercase tracking-widest text-white/20 bg-white/5 px-3 py-1.5 rounded-full">{msg.text}</span>
              </div>
            );
          }

          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}
            >
              {/* Avatar */}
              <div className="w-7 h-7 rounded-lg overflow-hidden border border-white/10 flex-shrink-0 bg-white/5 mb-1">
                {msg.senderPhoto
                  ? <img src={msg.senderPhoto} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center"><User size={10} className="text-white/20" /></div>}
              </div>

              {/* Bubble */}
              <div className={`max-w-[72%] sm:max-w-[62%] flex flex-col gap-1 ${isMe ? 'items-end' : 'items-start'}`}>
                {showName && <span className="text-[8px] font-black uppercase tracking-widest text-white/30 px-1">{senderProfile?.displayName || msg.senderName}</span>}

                {/* Reply-to preview */}
                {msg.replyToId && (
                  <div className={`px-3 py-1.5 rounded-xl bg-white/[0.05] border border-white/10 text-[9px] max-w-full overflow-hidden ${isMe ? 'rounded-br-sm' : 'rounded-bl-sm'}`}>
                    <span className="text-small-orange font-black uppercase">{msg.replyToSender}: </span>
                    <span className="text-white/40 truncate">{msg.replyToText}</span>
                  </div>
                )}

                {/* Main bubble */}
                <div
                  className={`px-4 py-3 rounded-2xl relative cursor-pointer select-text ${
                    isMe
                      ? 'bg-small-orange text-white rounded-br-sm'
                      : 'bg-white/[0.08] backdrop-blur-md text-white rounded-bl-sm border border-white/[0.06]'
                  } ${msg.isPinned ? 'ring-1 ring-amber-400/30' : ''}`}
                  onContextMenu={e => {
                    e.preventDefault();
                    setContextMenuMsg(msg);
                    setContextMenuPos({ x: e.clientX, y: e.clientY });
                  }}
                  onDoubleClick={() => setReplyTo(msg)}
                >
                  {msg.isPinned && <Pin size={9} className="absolute top-1.5 right-1.5 text-amber-400 opacity-60" />}
                  {(msg.burnAfterSeen || msg.burnAfter) && (
                    <div className="absolute top-1.5 left-1.5 flex items-center gap-1 text-[8px] font-black text-orange-400 opacity-70">
                      <Flame size={9} />
                      {msg.burnAfter ? 'Burning…' : 'Burns on read'}
                    </div>
                  )}

                  {msg.type === 'VIDEO_NOTE' && msg.videoNoteUrl ? (
                    <div className="w-40 h-40 rounded-full overflow-hidden border-4 border-white/20 relative">
                      <video src={msg.videoNoteUrl} className="w-full h-full object-cover" controls playsInline loop />
                    </div>
                  ) : msg.type === 'VOICE' && msg.voiceUrl ? (
                    <VoicePlayer src={msg.voiceUrl} />
                  ) : (msg as any).gifUrl ? (
                    <img src={(msg as any).gifUrl} alt="GIF" className="rounded-xl max-w-[220px] max-h-[300px] object-contain" loading="lazy" />
                  ) : msg.type === 'IMAGE' && msg.imageUrl ? (
                    <div className="space-y-2">
                      <img src={msg.imageUrl} alt="" className="rounded-xl max-w-[260px] max-h-[340px] object-cover" loading="lazy" />
                      <a href={msg.imageUrl} download target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-widest opacity-60 hover:opacity-100 transition-opacity">
                        <Download size={9} /> Download
                      </a>
                    </div>
                  ) : msg.type === 'MEDIA' ? (
                    <div className="flex items-center gap-3 min-w-[180px]">
                      <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center shrink-0">
                        <Music size={14} className="text-white/50" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase truncate">{msg.text?.replace(/^Shared: /, '') || 'Media'}</p>
                        <p className="text-[8px] text-white/40 uppercase">{msg.mediaType}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{msg.text}</p>
                  )}
                </div>

                {/* Reactions */}
                {hasReactions && (
                  <div className="flex flex-wrap gap-1 px-1">
                    {Object.entries(msg.reactions!).map(([emoji, uids]) =>
                      uids.length > 0 ? (
                        <ReactionBadge
                          key={emoji}
                          emoji={emoji}
                          count={uids.length}
                          hasReacted={uids.includes(uid || '')}
                          onClick={() => handleReact(msg.id, emoji)}
                        />
                      ) : null
                    )}
                    <button
                      onClick={() => setShowEmojiPicker(showEmojiPicker === msg.id ? null : msg.id)}
                      className="w-6 h-6 flex items-center justify-center rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
                    >
                      <Plus size={9} className="text-white/30" />
                    </button>
                  </div>
                )}

                {/* Emoji picker for this message */}
                <AnimatePresence>
                  {showEmojiPicker === msg.id && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="flex items-center gap-1.5 bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl p-2 shadow-xl z-40"
                    >
                      {QUICK_REACTIONS.map(emoji => (
                        <button
                          key={emoji}
                          onClick={() => handleReact(msg.id, emoji)}
                          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-white/10 transition-all text-lg"
                        >
                          {emoji}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Timestamp + status */}
                <div className={`flex items-center gap-1.5 px-1 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                  <span className="text-[8px] font-bold text-white/20">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {isMe && (isSeen ? <CheckCheck size={10} className="text-blue-400" /> : <Check size={10} className="text-white/20" />)}
                  <button
                    onClick={() => setShowEmojiPicker(showEmojiPicker === msg.id ? null : msg.id)}
                    className="p-0.5 opacity-0 group-hover:opacity-100 hover:opacity-100 text-white/20 hover:text-white transition-all"
                  >
                    <Smile size={11} />
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* ── CONTEXT MENU ────────────────────────────────────────────── */}
      <AnimatePresence>
        {contextMenuMsg && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed z-[200] bg-[#111] border border-white/10 rounded-2xl p-2 shadow-2xl min-w-[160px]"
            style={{ top: contextMenuPos.y, left: Math.min(contextMenuPos.x, window.innerWidth - 200) }}
            onClick={e => e.stopPropagation()}
          >
            {[
              { icon: Reply, label: 'Reply', action: () => { setReplyTo(contextMenuMsg); setContextMenuMsg(null); inputRef.current?.focus(); } },
              { icon: Smile, label: 'React', action: () => { setShowEmojiPicker(contextMenuMsg.id); setContextMenuMsg(null); } },
              { icon: Copy, label: 'Copy', action: () => handleCopyText(contextMenuMsg.text) },
              { icon: Pin, label: contextMenuMsg.isPinned ? 'Unpin' : 'Pin', action: () => handlePinMessage(contextMenuMsg.id, !!contextMenuMsg.isPinned) },
              { icon: Forward, label: 'Forward', action: () => handleForwardMessage(contextMenuMsg) },
              ...(contextMenuMsg.senderId === uid ? [{ icon: Trash2, label: 'Delete', action: () => handleDeleteMessage(contextMenuMsg.id) }] : []),
            ].map(({ icon: Icon, label, action }) => (
              <button
                key={label}
                onClick={action}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-all text-left ${label === 'Delete' ? 'text-red-400 hover:bg-red-500/10' : ''}`}
              >
                <Icon size={14} className={label === 'Delete' ? 'text-red-400' : 'text-white/40'} />
                <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── MEDIA SELECTOR ──────────────────────────────────────────── */}
      <AnimatePresence>
        {showMediaSelector && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="absolute bottom-20 left-4 right-4 bg-black/90 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 z-30 shadow-2xl max-h-[45vh] overflow-y-auto scrollbar-hide"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black uppercase tracking-widest">Share from Library</span>
              <button onClick={() => setShowMediaSelector(false)}><X size={16} /></button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {userMedia.map(media => (
                <button key={media.id} onClick={() => handleSendMedia(media)}
                  className="aspect-square rounded-xl overflow-hidden relative group border border-white/10">
                  <img src={media.coverImage || ''} className="w-full h-full object-cover group-hover:scale-110 transition-all duration-500" loading="lazy" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                    <span className="text-[8px] font-black uppercase tracking-widest text-white">{media.title}</span>
                  </div>
                </button>
              ))}
              {userMedia.length === 0 && <p className="col-span-3 text-[9px] text-white/20 text-center py-6">No media in library</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── INPUT AREA ──────────────────────────────────────────────── */}
      <div className="shrink-0 bg-black/25 backdrop-blur-xl border-t border-white/[0.05]">
        {/* Reply preview */}
        <AnimatePresence>
          {replyTo && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="px-4 pt-2 overflow-hidden"
            >
              <div className="flex items-center gap-2 px-3 py-2 bg-small-orange/10 border border-small-orange/20 rounded-xl">
                <Reply size={12} className="text-small-orange shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-[9px] font-black text-small-orange">{replyTo.senderName}</span>
                  <p className="text-[9px] text-white/40 truncate">{replyTo.text || '[media]'}</p>
                </div>
                <button onClick={() => setReplyTo(null)} className="p-1 hover:bg-white/10 rounded-lg shrink-0">
                  <X size={12} className="text-white/30" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="p-3 relative">
          {/* Emoji picker — same set used by the universal composer */}
          <AnimatePresence>
            {showEmoji && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowEmoji(false)} />
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                  className="absolute bottom-full left-3 mb-2 z-40 bg-[#141019] border border-white/10 rounded-2xl shadow-2xl p-2 grid grid-cols-8 gap-1 w-[292px]">
                  {['😀','😂','🥺','😍','🔥','👏','🎵','🎨','🌟','💯','🚀','❤️','🎉','👀','🤔','😎','🙏','💪','🌈','✨','😅','🥳','😭','🙌'].map(e => (
                    <button key={e} type="button" onClick={() => { setInputText(t => t + e); setShowEmoji(false); inputRef.current?.focus(); }}
                      className="text-xl p-1 rounded-lg hover:bg-white/10 transition-all">{e}</button>
                  ))}
                </motion.div>
              </>
            )}
          </AnimatePresence>
          {/* GIF picker — shared GifStickerPicker (same as the composer) */}
          <AnimatePresence>
            {showGif && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowGif(false)} />
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                  className="absolute bottom-full left-3 mb-2 z-40 w-[320px] max-w-[88vw]">
                  <GifStickerPicker onSelect={(url) => sendGif(url)} onClose={() => setShowGif(false)} />
                </motion.div>
              </>
            )}
          </AnimatePresence>
          {showVoiceRecorder ? (
            <VoiceRecorder onSend={handleSendVoice} onCancel={() => setShowVoiceRecorder(false)} />
          ) : (
            <form onSubmit={handleSend} className="flex items-center gap-2">
              {/* Attachment menu */}
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" onClick={() => { setShowMediaSelector(p => !p); setShowCollabMenu(false); }}
                  className="p-2 text-white/30 hover:text-small-orange hover:bg-white/5 rounded-xl transition-all">
                  <Music size={17} />
                </button>
                <button type="button" onClick={() => imageInputRef.current?.click()} disabled={uploadingImage}
                  className="p-2 text-white/30 hover:text-small-orange hover:bg-white/5 rounded-xl transition-all disabled:opacity-30">
                  {uploadingImage
                    ? <div className="w-4 h-4 border-2 border-small-orange/30 border-t-small-orange rounded-full animate-spin" />
                    : <ImageIcon size={17} />}
                </button>
                {/* Video note */}
                <button type="button" onClick={openVideoNote}
                  className="p-2 text-white/30 hover:text-small-orange hover:bg-white/5 rounded-xl transition-all">
                  <Camera size={17} />
                </button>
                {/* Emoji */}
                <button type="button" onClick={() => { setShowEmoji(v => !v); setShowGif(false); }}
                  className={`p-2 rounded-xl transition-all ${showEmoji ? 'text-small-orange bg-white/10' : 'text-white/30 hover:text-small-orange hover:bg-white/5'}`}>
                  <Smile size={17} />
                </button>
                {/* GIF */}
                <button type="button" onClick={() => { setShowGif(v => !v); setShowEmoji(false); }}
                  className={`px-1.5 py-1 rounded-lg text-[10px] font-black transition-all ${showGif ? 'text-small-orange bg-white/10' : 'text-white/30 hover:text-small-orange hover:bg-white/5'}`}>
                  GIF
                </button>
                {/* Burn-after-read toggle */}
                <button
                  type="button"
                  onClick={() => setBurnMode(m => !m)}
                  title="Burn after read (30s)"
                  className={`p-2 rounded-xl transition-all ${burnMode ? 'text-orange-400 bg-orange-400/15' : 'text-white/30 hover:text-orange-400 hover:bg-white/5'}`}
                >
                  <Flame size={17} />
                </button>
              </div>

              {/* Text input */}
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleSend(); }}
                placeholder={burnMode ? '🔥 Burns 30s after read…' : replyTo ? `Reply to ${replyTo.senderName}…` : 'Message…'}
                className={`flex-1 bg-white/[0.06] border rounded-2xl px-4 py-3 text-sm text-white placeholder-white/20 focus:bg-white/[0.08] transition-all outline-none min-w-0 ${
                  burnMode ? 'border-orange-400/30 focus:border-orange-400/60' : 'border-white/[0.08] focus:border-small-orange/40'
                }`}
              />

              <button type="button" onClick={() => setShowVoiceRecorder(true)}
                className="p-2 text-white/30 hover:text-small-orange hover:bg-white/5 rounded-xl transition-all shrink-0">
                <Mic size={17} />
              </button>

              <button
                type="submit"
                disabled={!inputText.trim()}
                className="p-2.5 bg-small-orange text-white rounded-xl hover:bg-small-orange/80 transition-all shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Send size={17} />
              </button>
            </form>
          )}
        </div>
      </div>

      {/* ── VIDEO NOTE MODAL ────────────────────────────────────────── */}
      <AnimatePresence>
        {showVideoNote && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[500] flex flex-col items-center justify-center gap-6 p-8"
          >
            <div className="w-64 h-64 rounded-full overflow-hidden border-4 border-small-orange/40 bg-black relative shadow-2xl">
              <video ref={videoPreviewRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
              {videoRecording && (
                <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 bg-red-500/80 rounded-full">
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  <span className="text-[8px] font-black text-white uppercase tracking-widest">REC</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              {!videoRecording ? (
                <button
                  onClick={startVideoRecord}
                  className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center shadow-[0_0_30px_rgba(239,68,68,0.5)] transition-all"
                >
                  <div className="w-6 h-6 rounded-full bg-white" />
                </button>
              ) : (
                <button
                  onClick={stopVideoRecord}
                  className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center shadow-[0_0_30px_rgba(239,68,68,0.5)] transition-all"
                >
                  <div className="w-6 h-6 rounded-sm bg-white" />
                </button>
              )}
              <button onClick={closeVideoNote} className="p-3 bg-white/10 rounded-full hover:bg-white/20 transition-all">
                <X size={20} />
              </button>
            </div>
            <p className="text-[9px] font-black uppercase tracking-widest text-white/30">
              {videoRecording ? 'Recording — tap square to stop & send' : 'Tap circle to record a video note'}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── MEMBERS SIDE PANEL ──────────────────────────────────────── */}
      <AnimatePresence>
        {showMembersPanel && room.type === 'GROUP' && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            className="absolute right-0 top-0 bottom-0 w-72 bg-[#0e0e0e] border-l border-white/[0.06] z-40 flex flex-col shadow-2xl"
          >
            <div className="p-5 border-b border-white/[0.06] flex items-center justify-between">
              <span className="text-sm font-black uppercase tracking-tighter">Members ({room.participants.length})</span>
              <button onClick={() => setShowMembersPanel(false)} className="p-1.5 hover:bg-white/10 rounded-xl"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5 scrollbar-hide">
              {room.participants.map(participantId => {
                const p = profiles[participantId];
                const isOwner = participantId === room.ownerId;
                return (
                  <div key={participantId} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                    <div className="w-9 h-9 rounded-xl overflow-hidden border border-white/10 shrink-0">
                      {p?.photoURL
                        ? <img src={p.photoURL} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full bg-white/10 flex items-center justify-center"><User size={14} className="text-white/20" /></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-black uppercase tracking-wider truncate">{p?.displayName || 'Loading…'}</p>
                      {isOwner && <p className="text-[8px] text-small-orange font-bold uppercase tracking-widest">Owner</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ChatWindow;
