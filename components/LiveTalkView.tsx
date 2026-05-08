import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MessageSquare, Users, Mic, MicOff, Settings, 
  X, Plus, Play, Pause, Music, Film, Book, 
  Send, ExternalLink, Share2, Globe, Heart,
  TrendingUp, Clock, User, LogOut, Radio,
  Shield, Volume2, List, Trash2
} from 'lucide-react';
import { LiveTalk, SharedAsset, ChatMessage, UserProfile } from '../types';
import { 
  auth, 
  createLiveTalk, 
  updateLiveTalk, 
  listenToLiveTalk, 
  joinLiveTalk, 
  leaveLiveTalk, 
  shareAssetToTalk,
  endLiveTalk,
  listenToMessages,
  sendMessage,
  listenToActiveLiveTalks
} from '../services/backendService';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';

interface LiveTalkViewProps {
  onBrowse: () => void;
}

const LiveTalkView: React.FC<LiveTalkViewProps> = ({ onBrowse }) => {
  const [activeTalk, setActiveTalk] = useState<LiveTalk | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [setupData, setSetupData] = useState({ title: '', description: '', topic: '', category: '' });
  const [activeTalks, setActiveTalks] = useState<LiveTalk[]>([]);
  
  const { currentTrack, currentVideo, currentAlbum, playTrack, playVideo } = useGlobalPlayerState();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = listenToActiveLiveTalks(setActiveTalks);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (activeTalk) {
      const roomId = `live_talk_${activeTalk.id}`;
      const unsubscribeMessages = listenToMessages(roomId, (msgs) => {
        setMessages(msgs);
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      });
      const unsubscribeTalk = listenToLiveTalk(activeTalk.id, (talk) => {
        setActiveTalk(talk);
        if (!talk.isActive) setActiveTalk(null);
      });
      return () => {
        unsubscribeMessages();
        unsubscribeTalk();
      };
    }
  }, [activeTalk?.id]);

  useEffect(() => {
    if (activeTalk && auth.currentUser) {
      setIsHost(activeTalk.hostId === auth.currentUser.uid);
    } else {
      setIsHost(false);
    }
  }, [activeTalk, auth.currentUser]);

  const handleCreateTalk = async () => {
    if (!setupData.title.trim()) return;
    const talk = await createLiveTalk(setupData);
    if (talk) {
      setActiveTalk(talk);
      setShowSetup(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !auth.currentUser || !activeTalk) return;
    const roomId = `live_talk_${activeTalk.id}`;
    await sendMessage(roomId, {
      senderId: auth.currentUser.uid,
      senderName: auth.currentUser.displayName || 'Anonymous',
      senderPhoto: auth.currentUser.photoURL || '',
      text: inputText,
      type: 'TEXT'
    });
    setInputText('');
  };

  const handleShareCurrent = async () => {
    if (!activeTalk || !isHost) return;
    let asset: Partial<SharedAsset> | null = null;
    
    if (currentTrack) {
      asset = {
        type: 'MUSIC',
        title: currentTrack.title,
        url: currentTrack.url,
        mediaId: currentTrack.id
      };
    } else if (currentVideo) {
      asset = {
        type: 'VIDEO',
        title: currentVideo.title,
        url: currentVideo.url,
        mediaId: currentVideo.id
      };
    }

    if (asset) {
      await shareAssetToTalk(activeTalk.id, asset);
    }
  };

  const [talkTab, setTalkTab] = useState<'CHAT' | 'ASSETS'>('CHAT');

  if (activeTalk) {
    return (
      <div className="flex-1 flex flex-col h-full bg-black/40">
        {/* Talk Header */}
        <div className="p-6 border-b border-white/5 bg-white/[0.02]">
          <div className="flex items-center justify-between mb-4">
             <div className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_red]" />
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-red-500">Live Audio</span>
             </div>
             <button 
               onClick={async () => {
                 if (isHost) {
                   if (window.confirm("End this Live Talk for everyone?")) {
                     await endLiveTalk(activeTalk.id);
                   }
                 } else {
                   await leaveLiveTalk(activeTalk.id);
                   setActiveTalk(null);
                 }
               }} 
               className="p-2 hover:bg-white/5 rounded-full text-white/40 transition-colors"
             >
               <X size={16} />
             </button>
          </div>
          
          <h3 className="text-lg font-black uppercase tracking-tight text-white mb-1">{activeTalk.title}</h3>
          <p className="text-[10px] text-white/40 font-bold uppercase tracking-[0.1em]">Topic: {activeTalk.topic} • {activeTalk.category}</p>
        </div>

        {/* Participation Panel */}
        <div className="p-6 flex flex-col gap-6 border-b border-white/5 bg-black/20">
           <div className="space-y-4">
              <div className="flex items-center justify-between">
                 <h4 className="text-[10px] font-black uppercase tracking-widest text-[#00DAF3]">Speakers</h4>
                 <span className="text-[10px] font-black font-mono text-white/20">{activeTalk.speakers.length}</span>
              </div>
              <div className="flex flex-wrap gap-4">
                 <div className="relative group cursor-pointer">
                    <div className="w-12 h-12 rounded-2xl overflow-hidden ring-2 ring-[#00DAF3] shadow-lg">
                       <img src={activeTalk.hostPhoto || null} className="w-full h-full object-cover" />
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-black border border-white/10 rounded-full flex items-center justify-center">
                       <Shield size={10} className="text-[#00DAF3]" />
                    </div>
                    <span className="absolute -top-1 -left-1 px-1.5 py-0.5 bg-red-500 rounded text-[6px] font-black text-white uppercase">Host</span>
                 </div>
                 {activeTalk.speakers.filter(s => s !== activeTalk.hostId).map(uid => (
                    <div key={uid} className="w-12 h-12 rounded-2xl overflow-hidden bg-white/5 border border-white/10 shadow-lg relative group">
                       <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`} className="w-full h-full" />
                       <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <Mic size={14} className="text-white" />
                       </div>
                    </div>
                 ))}
              </div>
           </div>

           <div className="space-y-4">
              <div className="flex items-center justify-between">
                 <h4 className="text-[10px] font-black uppercase tracking-widest text-white/40">Listeners</h4>
                 <span className="text-[10px] font-black font-mono text-white/20">{activeTalk.listeners.length}</span>
              </div>
              <div className="flex flex-wrap gap-3">
                 {activeTalk.listeners.map(uid => (
                    <div key={uid} className="w-8 h-8 rounded-xl overflow-hidden bg-white/5 border border-white/5 shadow-sm opacity-60 hover:opacity-100 transition-opacity">
                       <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`} className="w-full h-full" />
                    </div>
                 ))}
                 {activeTalk.listeners.length === 0 && <p className="text-[9px] font-bold uppercase tracking-widest text-white/10 italic">Waiting for audience...</p>}
              </div>
           </div>
        </div>

        {/* Live Chat & Shared Assets */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
           <div className="flex border-b border-white/5">
              <button 
                onClick={() => setTalkTab('CHAT')}
                className={`flex-1 py-3 text-[8px] font-black uppercase tracking-widest transition-all ${talkTab === 'CHAT' ? 'bg-white/5 text-white border-b-2 border-[#00DAF3]' : 'text-white/20 hover:text-white/40'}`}
              >
                Chat
              </button>
              <button 
                onClick={() => setTalkTab('ASSETS')}
                className={`flex-1 py-3 text-[8px] font-black uppercase tracking-widest transition-all ${talkTab === 'ASSETS' ? 'bg-white/5 text-white border-b-2 border-[#00DAF3]' : 'text-white/20 hover:text-white/40'}`}
              >
                Shared Assets ({activeTalk.sharedAssets.length})
              </button>
           </div>
           
           <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              {talkTab === 'CHAT' ? (
                <>
                  {/* Asset Section (Pinned if latest) */}
                  {activeTalk.sharedAssets.length > 0 && (
                    <div className="p-4 bg-primary/5 border border-primary/20 rounded-2xl mb-8 space-y-3">
                       <div className="flex items-center justify-between">
                          <span className="text-[8px] font-black uppercase tracking-widest text-primary">Live Playback Highlight</span>
                          <Music size={12} className="text-primary" />
                       </div>
                       <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-black rounded-xl border border-white/10 flex items-center justify-center">
                             {activeTalk.sharedAssets[activeTalk.sharedAssets.length - 1].type === 'MUSIC' ? <Music size={20} className="text-white/40" /> : <Film size={20} className="text-white/40" />}
                          </div>
                          <div className="flex-1 min-w-0">
                             <h5 className="text-[10px] font-black text-white truncate">{activeTalk.sharedAssets[activeTalk.sharedAssets.length - 1].title}</h5>
                             <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest">Shared by {isHost ? 'You' : 'Host'}</p>
                          </div>
                          <button 
                            onClick={() => {
                              const asset = activeTalk.sharedAssets[activeTalk.sharedAssets.length - 1];
                              if (asset.type === 'MUSIC' && asset.mediaId) playTrack({ id: asset.mediaId, title: asset.title, url: asset.url } as any, null, 'RADIO');
                              else if (asset.type === 'VIDEO' && asset.mediaId) playVideo({ id: asset.mediaId, title: asset.title, url: asset.url } as any);
                            }}
                            className="p-2 bg-white text-black rounded-lg hover:scale-105 transition-all"
                          >
                             <Play size={14} fill="black" />
                          </button>
                       </div>
                    </div>
                  )}

                  {messages.map((msg) => (
                    <div key={msg.id} className="flex gap-4">
                      <img 
                        src={msg.senderPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.senderId}`} 
                        className="w-10 h-10 rounded-xl bg-white/5 border border-white/10" 
                      />
                      <div className="space-y-1">
                         <div className="flex items-center gap-2">
                           <span className="text-[9px] font-black uppercase tracking-widest text-[#00DAF3]">{msg.senderName}</span>
                           <span className="text-[8px] font-mono text-white/10">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                         </div>
                         <p className="text-sm text-white/70 leading-relaxed">{msg.text}</p>
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <div className="space-y-4">
                   {activeTalk.sharedAssets.slice().reverse().map((asset, idx) => (
                      <div key={idx} className="p-4 bg-white/5 rounded-2xl border border-white/5 flex items-center gap-4 group hover:bg-white/10 transition-all">
                         <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center">
                            {asset.type === 'MUSIC' ? <Music size={16} className="text-white/40" /> : <Film size={16} className="text-white/40" />}
                         </div>
                         <div className="flex-1 min-w-0">
                            <h5 className="text-[10px] font-black text-white truncate">{asset.title}</h5>
                            <p className="text-[8px] font-bold text-white/20 uppercase tracking-widest">{asset.type} • {new Date(asset.timestamp).toLocaleTimeString()}</p>
                         </div>
                         <button 
                           onClick={() => {
                             if (asset.type === 'MUSIC' && asset.mediaId) playTrack({ id: asset.mediaId, title: asset.title, url: asset.url } as any, null, 'RADIO');
                             else if (asset.type === 'VIDEO' && asset.mediaId) playVideo({ id: asset.mediaId, title: asset.title, url: asset.url } as any);
                           }}
                           className="p-2 opacity-0 group-hover:opacity-100 transition-opacity hover:text-primary"
                         >
                            <Play size={14} fill="currentColor" />
                         </button>
                      </div>
                   ))}
                   {activeTalk.sharedAssets.length === 0 && (
                     <div className="text-center py-12">
                        <List size={32} className="mx-auto mb-4 text-white/10" />
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/20">No assets shared yet</p>
                     </div>
                   )}
                </div>
              )}
              <div ref={messagesEndRef} />
           </div>

           {/* Controls */}
           <div className="p-6 bg-black/40 border-t border-white/5 space-y-4">
              {isHost && (
                <div className="flex gap-2">
                   <button 
                     onClick={handleShareCurrent}
                     className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest text-white hover:bg-white/10 flex items-center justify-center gap-2"
                   >
                     <Share2 size={14} /> Share Media
                   </button>
                   <button className="px-3 py-3 bg-white/5 border border-white/10 rounded-xl text-white hover:bg-white/10">
                     <Settings size={14} />
                   </button>
                </div>
              )}
              
              <form onSubmit={handleSendMessage} className="relative">
                <input 
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Say something..."
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 pr-14 text-sm outline-none focus:border-[#00DAF3]/50 transition-all shadow-inner"
                />
                <button type="submit" className="absolute right-4 top-1/2 -translate-y-1/2 text-[#00DAF3] hover:scale-110 transition-transform">
                  <Send size={20} />
                </button>
              </form>
           </div>
        </div>
      </div>
    );
  }

  if (showSetup) {
    return (
      <div className="flex-1 flex flex-col p-8 space-y-8 bg-black/40">
        <div className="flex items-center justify-between">
           <h3 className="text-2xl font-headline uppercase tracking-tight">Setup Talk</h3>
           <button onClick={() => setShowSetup(false)} className="p-2 hover:bg-white/5 rounded-full text-white/40"><X size={20} /></button>
        </div>

        <div className="space-y-6">
           <div className="space-y-2">
              <label className="text-[9px] font-black uppercase tracking-widest text-white/20 ml-2">Talk Title</label>
              <input 
                type="text" 
                placeholder="The Future of Plajah..."
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm outline-none focus:border-primary/50 transition-all"
                value={setupData.title}
                onChange={e => setSetupData({...setupData, title: e.target.value})}
              />
           </div>
           
           <div className="space-y-2">
              <label className="text-[9px] font-black uppercase tracking-widest text-white/20 ml-2">Topic</label>
              <input 
                type="text" 
                placeholder="Tech, Philosophy, Music..."
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm outline-none focus:border-primary/50 transition-all"
                value={setupData.topic}
                onChange={e => setSetupData({...setupData, topic: e.target.value})}
              />
           </div>

           <div className="space-y-2">
              <label className="text-[9px] font-black uppercase tracking-widest text-white/20 ml-2">Category</label>
              <select 
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm outline-none focus:border-primary/50 transition-all appearance-none"
                value={setupData.category}
                onChange={e => setSetupData({...setupData, category: e.target.value})}
              >
                <option value="Discussion">Discussion</option>
                <option value="Education">Education</option>
                <option value="Entertainment">Entertainment</option>
                <option value="Music">Music</option>
                <option value="Q&A">Q&A</option>
              </select>
           </div>
        </div>

        <button 
          onClick={handleCreateTalk}
          className="w-full py-5 aurora-bg rounded-2xl text-[10px] font-black uppercase tracking-[0.4em] shadow-bloom hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          Launch Broadcast
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-black/40">
      <div className="p-12 text-center space-y-12">
        <div className="space-y-4">
          <div className="w-24 h-24 bg-primary/20 rounded-[2.5rem] flex items-center justify-center mx-auto shadow-bloom group hover:scale-110 transition-transform duration-500">
             <Mic size={40} className="text-primary group-hover:animate-pulse" />
          </div>
          <div>
            <h3 className="text-3xl font-headline uppercase tracking-tight">LiveTalk</h3>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-primary mt-2">Audio Only Social Space</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {activeTalks.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between px-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-white/20">Now Streaming</span>
                <span className="text-[10px] font-black text-red-500 uppercase tracking-widest animate-pulse">Live</span>
              </div>
              <div className="space-y-3">
                 {activeTalks.map(talk => (
                    <button 
                      key={talk.id}
                      onClick={() => {
                        joinLiveTalk(talk.id);
                        setActiveTalk(talk);
                      }}
                      className="w-full p-6 glass border border-white/5 rounded-3xl text-left hover:bg-white/10 transition-all group"
                    >
                       <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                             <img src={talk.hostPhoto || null} className="w-8 h-8 rounded-lg shadow-lg" />
                             <span className="text-[10px] font-black uppercase tracking-widest text-white/60">{talk.hostName}</span>
                          </div>
                          <div className="flex items-center gap-2">
                             <Users size={12} className="text-white/20" />
                             <span className="text-[10px] font-black font-mono text-white/40">{talk.listeners.length + talk.speakers.length}</span>
                          </div>
                       </div>
                       <h5 className="text-sm font-black uppercase tracking-tight text-white group-hover:text-primary transition-colors">{talk.title}</h5>
                       <p className="text-[9px] text-white/30 font-bold uppercase tracking-widest mt-1">Topic: {talk.topic}</p>
                    </button>
                 ))}
              </div>
            </div>
          ) : (
            <div className="py-12 glass border border-white/5 rounded-3xl opacity-40">
               <Radio size={32} className="mx-auto mb-4 text-white/20" />
               <p className="text-[10px] font-black uppercase tracking-widest">No active sessions</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
           <button 
             onClick={() => setShowSetup(true)}
             className="w-full py-5 bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-[0.4em] shadow-2xl hover:bg-primary hover:text-white transition-all"
           >
             Host a Talk
           </button>
           <button 
             onClick={onBrowse}
             className="w-full py-5 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-[0.4em] text-white/60 hover:bg-white/10"
           >
             Browse Archives
           </button>
        </div>
      </div>
    </div>
  );
};

export default LiveTalkView;
