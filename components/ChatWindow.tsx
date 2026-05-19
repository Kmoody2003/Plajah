import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send, Mic, Video, Phone, Plus, Image as ImageIcon, Sparkles,
  ChevronLeft, MoreVertical, X, Play, Pause, Layers, Music,
  Check, CheckCheck, User, Download, StopCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ChatMessage, ChatRoom, UserProfile, CollabProject, Album } from '../types';
import {
  sendMessage, listenToMessages, auth,
  createCollabProject, fetchCollabProjects, fetchUserContent,
  updateTypingStatus, markMessageAsSeen, fetchUserProfiles,
} from '../services/backendService';
import { uploadFile } from '../services/backendService';
import { encryptText, decryptText } from '../services/cryptoService';
import VoiceRecorder from './VoiceRecorder';

interface ChatWindowProps {
  room: ChatRoom;
  onBack?: () => void;
  onOpenCollab: (projectId: string) => void;
  onStartVideo?: () => void;
}

// ── Voice Message Player ──────────────────────────────────────────────────────
const VoicePlayer: React.FC<{ src: string; accent?: string }> = ({ src, accent = '#FF8C00' }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = new Audio(src);
    audioRef.current = audio;
    audio.onloadedmetadata = () => setDuration(audio.duration);
    audio.ontimeupdate = () => setProgress(audio.currentTime / (audio.duration || 1));
    audio.onended = () => { setPlaying(false); setProgress(0); };
    return () => { audio.pause(); audio.src = ''; };
  }, [src]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); setPlaying(false); }
    else { audio.play(); setPlaying(true); }
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-3 min-w-[180px]">
      <button onClick={toggle} className="w-9 h-9 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-all shrink-0">
        {playing ? <Pause size={14} fill="white" /> : <Play size={14} fill="white" />}
      </button>
      <div className="flex-1 space-y-1">
        <div
          className="h-1.5 rounded-full bg-white/20 overflow-hidden cursor-pointer"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = (e.clientX - rect.left) / rect.width;
            if (audioRef.current) { audioRef.current.currentTime = ratio * (audioRef.current.duration || 0); }
          }}
        >
          <div className="h-full rounded-full transition-all" style={{ width: `${progress * 100}%`, background: 'white' }} />
        </div>
        <span className="text-[9px] font-mono opacity-60">
          {playing ? fmt((audioRef.current?.currentTime) ?? 0) : fmt(duration)}
        </span>
      </div>
    </div>
  );
};

// ── Room avatar ───────────────────────────────────────────────────────────────
const RoomIcon: React.FC<{ room: ChatRoom; profiles: Record<string, UserProfile> }> = ({ room, profiles }) => {
  const currentUid = auth.currentUser?.uid;
  if (room.type === 'PRIVATE') {
    const otherId = room.participants.find(uid => uid !== currentUid);
    const profile = otherId ? profiles[otherId] : null;
    return (
      <div className="w-11 h-11 rounded-2xl overflow-hidden border border-white/10 flex-shrink-0 bg-white/5 shadow-xl">
        {profile?.photoURL
          ? <img src={profile.photoURL} alt={profile.displayName} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center"><User size={18} className="text-white/20" /></div>}
      </div>
    );
  }
  const others = room.participants.filter(uid => uid !== currentUid).slice(0, 4);
  return (
    <div className="w-11 h-11 rounded-2xl overflow-hidden border border-white/10 flex-shrink-0 bg-white/5 relative shadow-xl">
      <div className="grid grid-cols-2 grid-rows-2 h-full w-full">
        {others.map(uid => (
          <div key={uid} className="border-[0.5px] border-black/20 overflow-hidden">
            {profiles[uid]?.photoURL
              ? <img src={profiles[uid].photoURL!} className="w-full h-full object-cover" />
              : <div className="w-full h-full bg-white/10" />}
          </div>
        ))}
        {others.length === 0 && <div className="col-span-2 row-span-2 flex items-center justify-center"><User size={18} className="text-white/20" /></div>}
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
const ChatWindow: React.FC<ChatWindowProps> = ({ room, onBack, onOpenCollab, onStartVideo }) => {
  const [messages, setMessages]               = useState<ChatMessage[]>([]);
  const [decryptedMessages, setDecryptedMsgs] = useState<ChatMessage[]>([]);
  const [inputText, setInputText]             = useState('');
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [profiles, setProfiles]               = useState<Record<string, UserProfile>>({});
  const [collabProjects, setCollabProjects]   = useState<CollabProject[]>([]);
  const [showCollabMenu, setShowCollabMenu]   = useState(false);
  const [showMediaSelector, setShowMediaSelector] = useState(false);
  const [userMedia, setUserMedia]             = useState<Album[]>([]);
  const [isTyping, setIsTyping]               = useState(false);
  const [uploadingImage, setUploadingImage]   = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef   = useRef<HTMLDivElement | null>(null);
  const imageInputRef    = useRef<HTMLInputElement | null>(null);

  // Decrypt messages
  useEffect(() => {
    if (messages.length === 0) { setDecryptedMsgs([]); return; }
    let cancelled = false;
    Promise.all(messages.map(async m => ({
      ...m,
      text: m.text ? await decryptText(m.text, room.id) : m.text,
    }))).then(dec => { if (!cancelled) setDecryptedMsgs(dec); });
    return () => { cancelled = true; };
  }, [messages, room.id]);

  useEffect(() => {
    const unsub = listenToMessages(room.id, (msgs) => {
      setMessages(msgs);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
      const last = msgs[msgs.length - 1];
      if (last && last.senderId !== auth.currentUser?.uid && !last.seenBy?.includes(auth.currentUser?.uid ?? '')) {
        markMessageAsSeen(room.id, last.id);
      }
    });

    fetchUserProfiles(room.participants).then(ps => {
      const m: Record<string, UserProfile> = {};
      ps.forEach(p => { m[p.uid] = p; });
      setProfiles(m);
    });
    fetchCollabProjects(room.id).then(setCollabProjects);
    if (auth.currentUser) fetchUserContent(auth.currentUser.uid).then(setUserMedia);

    return () => { unsub(); if (isTyping) updateTypingStatus(room.id, false); };
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

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim()) return;
    if (isTyping) { setIsTyping(false); updateTypingStatus(room.id, false); if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current); }
    const encrypted = await encryptText(inputText, room.id);
    await sendMessage(room.id, { senderId: auth.currentUser?.uid || '', senderName: auth.currentUser?.displayName || 'Anonymous', senderPhoto: auth.currentUser?.photoURL || '', text: encrypted, type: 'TEXT' });
    setInputText('');
  };

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

  const handleCreateCollab = async () => {
    const name = prompt('Enter collaboration project name:');
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
      text: `Shared an album: ${media.title}`,
      type: 'MEDIA',
    });
    setShowMediaSelector(false);
  };

  const typingUsers = room.typingUsers?.filter(uid => uid !== auth.currentUser?.uid) || [];
  const roomName = room.type === 'PRIVATE'
    ? (profiles[room.participants.find(uid => uid !== auth.currentUser?.uid) ?? '']?.displayName || 'Direct Message')
    : (room.name || 'Group Chat');

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden relative bg-black/20 backdrop-blur-2xl">
      {/* Hidden image input */}
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageFile} />

      {/* Header */}
      <div className="p-4 bg-white/[0.04] backdrop-blur-xl border-b border-white/[0.06] flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          {onBack && (
            <button onClick={onBack} className="lg:hidden p-2.5 hover:bg-white/10 rounded-xl transition-all shrink-0">
              <ChevronLeft size={18} />
            </button>
          )}
          <div className="relative shrink-0">
            <RoomIcon room={room} profiles={profiles} />
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-black rounded-full" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-black uppercase tracking-widest truncate">{roomName}</h3>
            <div className="flex items-center gap-1.5">
              {typingUsers.length > 0
                ? <span className="text-[9px] font-bold text-small-orange uppercase tracking-widest">typing…</span>
                : <>
                    <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest">{room.type === 'PRIVATE' ? 'Direct' : `${room.participants.length} members`}</span>
                    <span className="text-[9px] font-bold text-green-500 uppercase tracking-widest">· Active</span>
                  </>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button className="p-2.5 text-white/40 hover:text-white hover:bg-white/5 rounded-xl transition-all">
            <Phone size={18} />
          </button>
          <button onClick={onStartVideo} className="p-2.5 text-white/40 hover:text-white hover:bg-white/5 rounded-xl transition-all">
            <Video size={18} />
          </button>
          <button
            onClick={() => { setShowCollabMenu(!showCollabMenu); setShowMediaSelector(false); }}
            className={`p-2.5 rounded-xl transition-all ${showCollabMenu ? 'bg-small-orange text-white' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
          >
            <Layers size={18} />
          </button>
        </div>
      </div>

      {/* Collab dropdown */}
      <AnimatePresence>
        {showCollabMenu && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="absolute top-[4.5rem] left-4 right-4 bg-black/80 backdrop-blur-2xl border border-white/10 rounded-2xl p-5 z-20 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-black uppercase tracking-tightest">Collab Boards</h4>
              <button onClick={handleCreateCollab} className="px-4 py-2 bg-small-orange text-white text-[9px] font-black uppercase tracking-widest rounded-full hover:bg-small-orange/80 transition-all">
                + New
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto">
              {collabProjects.map(p => (
                <button key={p.id} onClick={() => { onOpenCollab(p.id); setShowCollabMenu(false); }}
                  className="p-4 bg-white/5 border border-white/10 rounded-xl text-left hover:bg-white/10 transition-all">
                  <div className="p-2 bg-small-orange/20 rounded-lg w-fit mb-2"><Layers size={14} className="text-small-orange" /></div>
                  <p className="text-[10px] font-black uppercase tracking-widest truncate">{p.name}</p>
                  <p className="text-[8px] text-white/30 mt-0.5">{p.assets?.length ?? 0} assets</p>
                </button>
              ))}
              {collabProjects.length === 0 && (
                <p className="col-span-2 text-[9px] text-white/20 font-bold uppercase tracking-widest text-center py-4">No boards yet — create one above</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scrollbar-hide">
        {decryptedMessages.map((msg, i) => {
          const isMe = msg.senderId === auth.currentUser?.uid;
          const isSeen = (msg.seenBy?.length ?? 0) > (isMe ? 1 : 0);
          const showName = !isMe && room.type !== 'PRIVATE';
          const senderProfile = profiles[msg.senderId];

          if (msg.type === 'SYSTEM') {
            return (
              <div key={msg.id} className="flex justify-center py-1">
                <span className="text-[8px] font-bold uppercase tracking-widest text-white/20 bg-white/5 px-3 py-1 rounded-full">{msg.text}</span>
              </div>
            );
          }

          return (
            <motion.div key={msg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className={`flex items-end gap-2.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className="w-7 h-7 rounded-lg overflow-hidden border border-white/10 flex-shrink-0 bg-white/5">
                {msg.senderPhoto
                  ? <img src={msg.senderPhoto} alt={msg.senderName} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center"><User size={12} className="text-white/20" /></div>}
              </div>

              <div className={`max-w-[72%] sm:max-w-[60%] space-y-1 ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                {showName && <span className="text-[8px] font-black uppercase tracking-widest text-white/30 px-1">{senderProfile?.displayName || msg.senderName}</span>}

                <div className={`px-4 py-3 rounded-2xl relative ${
                  isMe
                    ? 'bg-small-orange text-white rounded-br-sm'
                    : 'bg-white/[0.08] backdrop-blur-md text-white rounded-bl-sm border border-white/[0.06]'
                }`}>
                  {msg.type === 'VOICE' && msg.voiceUrl ? (
                    <VoicePlayer src={msg.voiceUrl} />
                  ) : msg.type === 'IMAGE' && msg.imageUrl ? (
                    <div className="space-y-2">
                      <img src={msg.imageUrl} alt="" className="rounded-xl max-w-[240px] max-h-[320px] object-cover" loading="lazy" />
                      <a href={msg.imageUrl} download target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-widest opacity-60 hover:opacity-100 transition-opacity">
                        <Download size={10} /> Download
                      </a>
                    </div>
                  ) : msg.type === 'MEDIA' ? (
                    <div className="flex items-center gap-3 min-w-[180px]">
                      <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center shrink-0">
                        <Music size={16} className="text-white/50" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black uppercase truncate">{msg.text?.replace('Shared an album: ', '') || 'Media'}</p>
                        <p className="text-[8px] text-white/40 uppercase">{msg.mediaType}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm leading-relaxed break-words">{msg.text}</p>
                  )}
                </div>

                <div className={`flex items-center gap-1.5 px-1 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                  <span className="text-[8px] font-bold text-white/20">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {isMe && (isSeen ? <CheckCheck size={11} className="text-blue-400" /> : <Check size={11} className="text-white/20" />)}
                </div>
              </div>
            </motion.div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Media selector */}
      <AnimatePresence>
        {showMediaSelector && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-20 left-4 right-4 bg-black/80 backdrop-blur-2xl border border-white/10 rounded-2xl p-5 z-20 shadow-2xl max-h-[50vh] overflow-y-auto scrollbar-hide">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-black uppercase tracking-tightest">Share from Library</h4>
              <button onClick={() => setShowMediaSelector(false)} className="p-1.5 hover:bg-white/10 rounded-lg"><X size={16} /></button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {userMedia.map(media => (
                <button key={media.id} onClick={() => handleSendMedia(media)}
                  className="group flex flex-col items-center text-center p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all">
                  <div className="w-full aspect-square rounded-lg overflow-hidden mb-2 relative">
                    <img src={media.coverImage || ''} className="w-full h-full object-cover group-hover:scale-110 transition-all duration-500" loading="lazy" />
                  </div>
                  <p className="text-[9px] font-black uppercase tracking-widest truncate w-full">{media.title}</p>
                </button>
              ))}
              {userMedia.length === 0 && <p className="col-span-3 text-[9px] text-white/20 font-bold uppercase tracking-widest text-center py-8">No media in library</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input area */}
      <div className="shrink-0 p-3 bg-white/[0.03] backdrop-blur-xl border-t border-white/[0.06]">
        {showVoiceRecorder ? (
          <VoiceRecorder onSend={handleSendVoice} onCancel={() => setShowVoiceRecorder(false)} />
        ) : (
          <form onSubmit={handleSendMessage} className="flex items-center gap-2">
            <button type="button" onClick={() => { setShowMediaSelector(!showMediaSelector); setShowCollabMenu(false); }}
              className="p-2.5 text-white/40 hover:text-small-orange hover:bg-white/5 rounded-xl transition-all shrink-0">
              <Music size={18} />
            </button>
            <button type="button" onClick={() => imageInputRef.current?.click()} disabled={uploadingImage}
              className="p-2.5 text-white/40 hover:text-small-orange hover:bg-white/5 rounded-xl transition-all shrink-0 disabled:opacity-30">
              {uploadingImage ? <div className="w-4 h-4 border-2 border-small-orange/40 border-t-small-orange rounded-full animate-spin" /> : <ImageIcon size={18} />}
            </button>
            <button type="button" onClick={() => setShowVoiceRecorder(true)}
              className="p-2.5 text-white/40 hover:text-small-orange hover:bg-white/5 rounded-xl transition-all shrink-0">
              <Mic size={18} />
            </button>

            <div className="flex-1 relative min-w-0">
              <input
                type="text"
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleSendMessage(); }}
                placeholder="Message…"
                className="w-full bg-white/[0.06] border border-white/[0.08] rounded-2xl px-4 py-3 text-sm text-white placeholder-white/20 focus:border-small-orange/50 focus:bg-white/[0.09] transition-all outline-none"
              />
            </div>

            <button type="submit" disabled={!inputText.trim()}
              className="p-2.5 bg-small-orange text-white rounded-xl hover:bg-small-orange/80 transition-all shrink-0 disabled:opacity-30 disabled:cursor-not-allowed">
              <Send size={18} />
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ChatWindow;
