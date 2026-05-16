import React, { useState, useEffect, useRef } from 'react';
import { Send, Mic, Video, Phone, Plus, Image as ImageIcon, Link as LinkIcon, Sparkles, ChevronLeft, MoreVertical, X, Play, Pause, Layers, MessageSquare, Users, Globe, Music, Check, CheckCheck, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ChatMessage, ChatRoom, UserProfile, CollabProject, Album } from '../types';
import { sendMessage, listenToMessages, fetchUserProfile, auth, createCollabProject, fetchCollabProjects, fetchUserContent, updateTypingStatus, markMessageAsSeen, fetchUserProfiles } from '../services/backendService';
import { encryptText, decryptText } from '../services/cryptoService';
import VoiceRecorder from './VoiceRecorder';

interface ChatWindowProps {
  room: ChatRoom;
  onBack?: () => void;
  onOpenCollab: (projectId: string) => void;
  onStartVideo?: () => void;
}

const RoomIcon: React.FC<{ room: ChatRoom; profiles: Record<string, UserProfile> }> = ({ room, profiles }) => {
  const currentUid = auth.currentUser?.uid;
  
  if (room.type === 'PRIVATE') {
    const otherId = room.participants.find(uid => uid !== currentUid);
    const profile = otherId ? profiles[otherId] : null;
    return (
      <div className="w-12 h-12 rounded-2xl overflow-hidden border border-white/10 flex-shrink-0 bg-white/5 shadow-xl">
        {profile?.photoURL ? (
          <img src={profile.photoURL || null} alt={profile.displayName} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <User size={20} className="text-white/20" />
          </div>
        )}
      </div>
    );
  }

  // Group Chat Cluster Icon
  const otherParticipants = room.participants.filter(uid => uid !== currentUid).slice(0, 4);
  return (
    <div className="w-12 h-12 rounded-2xl overflow-hidden border border-white/10 flex-shrink-0 bg-white/5 relative shadow-xl">
      <div className="grid grid-cols-2 grid-rows-2 h-full w-full">
        {otherParticipants.map((uid, i) => (
          <div key={uid} className="border-[0.5px] border-black/20 overflow-hidden">
            {profiles[uid]?.photoURL ? (
              <img src={profiles[uid].photoURL || null} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-white/10" />
            )}
          </div>
        ))}
        {otherParticipants.length === 0 && (
          <div className="col-span-2 row-span-2 flex items-center justify-center">
            <Users size={20} className="text-white/20" />
          </div>
        )}
      </div>
    </div>
  );
};

const ChatWindow: React.FC<ChatWindowProps> = ({ room, onBack, onOpenCollab, onStartVideo }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [decryptedMessages, setDecryptedMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [collabProjects, setCollabProjects] = useState<CollabProject[]>([]);
  const [showCollabMenu, setShowCollabMenu] = useState(false);
  const [showMediaSelector, setShowMediaSelector] = useState(false);
  const [userMedia, setUserMedia] = useState<Album[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Decrypt messages as they arrive
  useEffect(() => {
    if (messages.length === 0) { setDecryptedMessages([]); return; }
    let cancelled = false;
    Promise.all(
      messages.map(async (m) => ({
        ...m,
        text: m.text ? await decryptText(m.text, room.id) : m.text,
      }))
    ).then((decrypted) => {
      if (!cancelled) setDecryptedMessages(decrypted);
    });
    return () => { cancelled = true; };
  }, [messages, room.id]);

  useEffect(() => {
    const unsubscribe = listenToMessages(room.id, (msgs) => {
      setMessages(msgs);
      scrollToBottom();
      
      // Mark last message as seen if it's not from me
      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg && lastMsg.senderId !== auth.currentUser?.uid && (!lastMsg.seenBy || !lastMsg.seenBy.includes(auth.currentUser?.uid || ''))) {
        markMessageAsSeen(room.id, lastMsg.id);
      }
    });

    const loadProfiles = async () => {
      const uids = room.participants;
      const fetchedProfiles = await fetchUserProfiles(uids);
      const profileMap: Record<string, UserProfile> = {};
      fetchedProfiles.forEach(p => {
        profileMap[p.uid] = p;
      });
      setProfiles(profileMap);
    };

    const loadCollabProjects = async () => {
      const projects = await fetchCollabProjects(room.id);
      setCollabProjects(projects);
    };

    const loadUserMedia = async () => {
      if (auth.currentUser) {
        const media = await fetchUserContent(auth.currentUser.uid);
        setUserMedia(media);
      }
    };

    loadProfiles();
    loadCollabProjects();
    loadUserMedia();
    return () => {
      unsubscribe();
      if (isTyping) updateTypingStatus(room.id, false);
    };
  }, [room.id]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    
    if (!isTyping) {
      setIsTyping(true);
      updateTypingStatus(room.id, true);
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      updateTypingStatus(room.id, false);
    }, 3000);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim()) return;
    
    if (isTyping) {
      setIsTyping(false);
      updateTypingStatus(room.id, false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    }

    const encryptedText = await encryptText(inputText, room.id);
    await sendMessage(room.id, {
      senderId: auth.currentUser?.uid || '',
      senderName: auth.currentUser?.displayName || 'Anonymous',
      senderPhoto: auth.currentUser?.photoURL || '',
      text: encryptedText,
      type: 'TEXT'
    });
    setInputText('');
  };

  const handleSendVoice = async (blob: Blob) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = async () => {
      const base64data = reader.result as string;
      await sendMessage(room.id, {
        senderId: auth.currentUser?.uid || '',
        senderName: auth.currentUser?.displayName || 'Anonymous',
        senderPhoto: auth.currentUser?.photoURL || '',
        voiceUrl: base64data,
        type: 'VOICE'
      });
      setShowVoiceRecorder(false);
    };
  };

  const handleCreateCollab = async () => {
    const name = prompt("Enter Collaboration Project Name:");
    if (name) {
      const projectId = await createCollabProject(name, room.id);
      onOpenCollab(projectId);
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
      type: 'MEDIA'
    });
    setShowMediaSelector(false);
  };

  const typingUsers = room.typingUsers?.filter(uid => uid !== auth.currentUser?.uid) || [];

  return (
    <div className="flex-1 flex flex-col bg-[#0a0a0a] h-full overflow-hidden relative">
      {/* Chat Header */}
      <div className="p-6 bg-white/5 border-b border-white/10 flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          {onBack && (
            <button onClick={onBack} className="lg:hidden p-3 hover:bg-white/10 rounded-2xl transition-all">
              <ChevronLeft size={20} />
            </button>
          )}
          <div className="relative">
            <RoomIcon room={room} profiles={profiles} />
            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-theme-card rounded-full" />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest">
              {room.type === 'PRIVATE' 
                ? (room.participants.find(uid => uid !== auth.currentUser?.uid) ? profiles[room.participants.find(uid => uid !== auth.currentUser?.uid)!]?.displayName || 'Loading...' : 'Saved Messages')
                : room.name || 'Group Chat'}
            </h3>
            <div className="flex items-center gap-2">
              {typingUsers.length > 0 ? (
                <span className="text-[10px] font-bold text-small-orange uppercase tracking-widest">
                  {typingUsers.length === 1 ? 'Someone is typing...' : 'Multiple people typing...'}
                </span>
              ) : (
                <>
                  <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">
                    {room.type === 'PRIVATE' ? 'Direct Message' : 'Public Group'}
                  </span>
                  <div className="w-1 h-1 bg-white/20 rounded-full" />
                  <span className="text-[10px] font-bold text-green-500 uppercase tracking-widest">Active Now</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="p-3 text-white/40 hover:text-white hover:bg-white/5 rounded-2xl transition-all">
            <Phone size={20} />
          </button>
          <button 
            onClick={onStartVideo}
            className="p-3 text-white/40 hover:text-white hover:bg-white/5 rounded-2xl transition-all"
          >
            <Video size={20} />
          </button>
          <button 
            onClick={() => setShowCollabMenu(!showCollabMenu)}
            className={`p-3 rounded-2xl transition-all flex items-center gap-2 border ${showCollabMenu ? 'bg-small-orange border-small-orange text-white' : 'bg-white/5 border-white/10 text-white/60 hover:text-white'}`}
          >
            <Layers size={20} />
            <span className="text-[10px] font-black uppercase tracking-widest hidden sm:block">Collabo</span>
          </button>
          <button className="p-3 text-white/40 hover:text-white hover:bg-white/5 rounded-2xl transition-all">
            <MoreVertical size={20} />
          </button>
        </div>
      </div>

      {/* Collaboration Menu */}
      <AnimatePresence>
        {showCollabMenu && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-24 left-6 right-6 bg-theme-card border border-white/10 rounded-[2rem] p-8 z-20 shadow-3xl"
          >
            <div className="flex items-center justify-between mb-8">
              <div>
                <h4 className="text-lg font-black uppercase tracking-tightest">Collaboration Projects</h4>
                <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Real-time whiteboard & asset sharing</p>
              </div>
              <button onClick={handleCreateCollab} className="px-6 py-3 bg-small-orange text-white text-[10px] font-black uppercase tracking-widest rounded-full hover:bg-small-orange/80 transition-all">
                New Project
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {collabProjects.map(project => (
                <button 
                  key={project.id}
                  onClick={() => onOpenCollab(project.id)}
                  className="p-6 bg-white/5 border border-white/10 rounded-2xl text-left hover:bg-white/10 transition-all group"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-small-orange/20 rounded-xl group-hover:bg-small-orange transition-all">
                      <Layers size={20} className="text-small-orange group-hover:text-white" />
                    </div>
                    <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">
                      {new Date(project.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <h5 className="text-sm font-black uppercase tracking-widest mb-1">{project.name}</h5>
                  <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">
                    {project.assets?.length || 0} Assets • {project.links?.length || 0} Links
                  </p>
                </button>
              ))}
              {collabProjects.length === 0 && (
                <div className="col-span-full py-12 text-center border-2 border-dashed border-white/5 rounded-3xl">
                  <Sparkles size={32} className="text-white/10 mx-auto mb-4" />
                  <p className="text-xs font-bold text-white/20 uppercase tracking-widest">No active collaborations yet</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
        {decryptedMessages.map((msg, i) => {
          const isMe = msg.senderId === auth.currentUser?.uid;
          const isSeen = msg.seenBy && msg.seenBy.length > (isMe ? 1 : 0);
          
          return (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              key={msg.id} 
              className={`flex items-end gap-3 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div className="w-8 h-8 rounded-xl overflow-hidden border border-white/10 flex-shrink-0">
                <img src={msg.senderPhoto || null} alt={msg.senderName} className="w-full h-full object-cover" />
              </div>
              <div className={`max-w-[70%] space-y-1 ${isMe ? 'items-end' : 'items-start'}`}>
                <div className={`p-4 rounded-[1.5rem] relative ${isMe ? 'bg-small-orange text-white rounded-br-none' : 'bg-[var(--chat-bubble-bg)] text-[var(--chat-bubble-text)] rounded-bl-none border border-white/10'}`}>
                  {msg.type === 'VOICE' ? (
                    <div className="flex items-center gap-3 min-w-[200px]">
                      <button className="p-2 bg-white/20 rounded-full">
                        <Play size={16} fill="white" />
                      </button>
                      <div className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden">
                        <div className="h-full bg-white w-1/3" />
                      </div>
                      <span className="text-[10px] font-mono">0:12</span>
                    </div>
                  ) : msg.type === 'MEDIA' ? (
                    <div className="space-y-3 min-w-[240px]">
                      <div className="aspect-video rounded-xl overflow-hidden relative group">
                        <img src={msg.senderPhoto || null} className="w-full h-full object-cover blur-sm opacity-50" />
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40">
                          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-black mb-2">
                            <Play size={20} fill="black" />
                          </div>
                          <span className="text-[10px] font-black uppercase tracking-widest">Shared Media</span>
                        </div>
                      </div>
                      <div className="p-3 bg-white/10 rounded-xl border border-white/10">
                        <p className="text-xs font-black uppercase tracking-widest mb-1">{msg.text}</p>
                        <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">{msg.mediaType}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm leading-relaxed">{msg.text}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 px-1">
                  <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {isMe && (
                    <div className="flex items-center">
                      {isSeen ? (
                        <CheckCheck size={12} className="text-blue-400" />
                      ) : (
                        <Check size={12} className="text-white/20" />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Media Selector Modal */}
      <AnimatePresence>
        {showMediaSelector && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="absolute bottom-24 left-6 right-6 bg-theme-card border border-white/10 rounded-[2rem] p-8 z-20 shadow-3xl max-h-[60vh] overflow-y-auto scrollbar-hide"
          >
            <div className="flex items-center justify-between mb-8">
              <div>
                <h4 className="text-lg font-black uppercase tracking-tightest">Share from Library</h4>
                <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Select an album or video to share</p>
              </div>
              <button onClick={() => setShowMediaSelector(false)} className="p-2 hover:bg-white/10 rounded-full">
                <X size={20} />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {userMedia.map(media => (
                <button 
                  key={media.id}
                  onClick={() => handleSendMedia(media)}
                  className="group flex flex-col items-center text-center p-4 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all"
                >
                  <div className="w-full aspect-square rounded-xl overflow-hidden mb-3 relative">
                    <img src={media.coverImage || null} className="w-full h-full object-cover group-hover:scale-110 transition-all duration-500" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                      <Plus size={24} className="text-white" />
                    </div>
                  </div>
                  <h5 className="text-[10px] font-black uppercase tracking-widest truncate w-full">{media.title}</h5>
                  <p className="text-[8px] font-bold text-white/30 uppercase tracking-widest">{media.type}</p>
                </button>
              ))}
              {userMedia.length === 0 && (
                <div className="col-span-full py-12 text-center opacity-20">
                  <Music size={32} className="mx-auto mb-4" />
                  <p className="text-xs font-bold uppercase tracking-widest">No media found in your library</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input Area */}
      <div className="p-6 bg-white/5 border-t border-white/10 pb-12 lg:pb-16">
        {showVoiceRecorder ? (
          <VoiceRecorder onSend={handleSendVoice} onCancel={() => setShowVoiceRecorder(false)} />
        ) : (
          <form onSubmit={handleSendMessage} className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <button 
                type="button" 
                onClick={() => setShowMediaSelector(!showMediaSelector)}
                className="p-3 text-white/40 hover:text-white hover:bg-white/5 rounded-2xl transition-all"
              >
                <Music size={20} />
              </button>
              <button 
                type="button" 
                onClick={() => setShowVoiceRecorder(true)}
                className="p-3 text-white/40 hover:text-white hover:bg-white/5 rounded-2xl transition-all"
              >
                <Mic size={20} />
              </button>
            </div>
            <div className="flex-1 relative">
              <input 
                type="text" 
                value={inputText}
                onChange={handleInputChange}
                placeholder="Message your vibe..."
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 pr-12 text-white focus:border-small-orange transition-all outline-none"
              />
              <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-small-orange hover:text-white transition-all">
                <Send size={20} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="p-3 text-white/40 hover:text-white hover:bg-white/5 rounded-2xl transition-all">
                <ImageIcon size={20} />
              </button>
              <button type="button" className="p-3 text-white/40 hover:text-white hover:bg-white/5 rounded-2xl transition-all">
                <Sparkles size={20} className="text-small-orange" />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ChatWindow;
