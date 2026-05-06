import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MessageSquare, Users, Globe, User, Send, X, 
  ChevronRight, ChevronLeft, MoreHorizontal, Maximize2, 
  Video as VideoIcon, Mic, MicOff, VideoOff, Menu,
  Hash, Radio, Music, Film, Bell, Heart, Share2,
  TrendingUp, Clock, Settings
} from 'lucide-react';
import { ChatMessage, UserProfile, FeedItem, Video, Album, Track } from '../types';
import { 
  auth, 
  listenToMessages, 
  sendMessage, 
  fetchFeed, 
  postToFeed,
  fetchUserProfiles,
  listenToChatRooms,
} from '../services/backendService';
import { useGlobalPlayerState, useGlobalPlayerProgress } from '../contexts/GlobalPlayerContext';
import LiveTalkView from './LiveTalkView';

type TabType = 'LIVE' | 'LIVETALK' | 'WATCH_ALONG' | 'GLOBAL_FEED' | 'MY_FEED';

const PersistentChatDrawer: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('GLOBAL_FEED');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [posts, setPosts] = useState<FeedItem[]>([]);
  const [myPosts, setMyPosts] = useState<FeedItem[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  
  const { currentVideo, currentTrack, currentAlbum } = useGlobalPlayerState();
  const { currentTime, seek } = useGlobalPlayerProgress();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // LIVE Tab Logic: Auto-switch based on content
  const [liveRoomId, setLiveRoomId] = useState<string | null>(null);
  const activeContentId = currentVideo?.id || currentTrack?.id || currentAlbum?.id;

  useEffect(() => {
    if (activeContentId) {
      const roomId = `live_chat_${activeContentId}`;
      setLiveRoomId(roomId);
      // Automatically switch to LIVE tab if content changes? Maybe just update state
      // setActiveTab('LIVE'); 
    }
  }, [activeContentId]);

  useEffect(() => {
    if (liveRoomId && activeTab === 'LIVE') {
      const unsubscribe = listenToMessages(liveRoomId, (msgs) => {
        setMessages(msgs);
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      });
      return () => unsubscribe();
    }
  }, [liveRoomId, activeTab]);

  // Feed Logic
  useEffect(() => {
    if (activeTab === 'GLOBAL_FEED' || activeTab === 'MY_FEED') {
      const unsubscribe = fetchFeed((items) => {
        setPosts(items);
        if (auth.currentUser) {
          setMyPosts(items.filter(p => p.authorId === auth.currentUser?.uid));
        }
      });
      return () => unsubscribe();
    }
  }, [activeTab]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !auth.currentUser || !liveRoomId) return;

    await sendMessage(liveRoomId, {
      senderId: auth.currentUser.uid,
      senderName: auth.currentUser.displayName || 'Anonymous',
      senderPhoto: auth.currentUser.photoURL || '',
      text: inputText,
      type: 'TEXT'
    });
    setInputText('');
  };

  const handleSendPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !auth.currentUser) return;

    await postToFeed({
      authorId: auth.currentUser.uid,
      authorName: auth.currentUser.displayName || 'Anonymous',
      authorPhoto: auth.currentUser.photoURL || '',
      content: inputText,
      type: 'COMMENT',
      shareCount: 0
    });
    setInputText('');
  };

  const tabs = [
    { id: 'LIVE', icon: MessageSquare, label: 'Live' },
    { id: 'LIVETALK', icon: Mic, label: 'Talk' },
    { id: 'WATCH_ALONG', icon: Users, label: 'Watch' },
    { id: 'GLOBAL_FEED', icon: Globe, label: 'Global' },
    { id: 'MY_FEED', icon: User, label: 'Me' },
  ];

  return (
    <>
      {/* Drawer Toggle Handle */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-1/2 right-0 -translate-y-1/2 z-[500] bg-black/40 backdrop-blur-3xl border border-white/10 p-3 rounded-l-2xl shadow-2xl group transition-all hover:bg-white/10"
      >
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          className="text-white/60 group-hover:text-white"
        >
          <ChevronLeft size={20} />
        </motion.div>
      </button>

      {/* Main Drawer */}
      <motion.aside
        initial={false}
        animate={{ x: isOpen ? 0 : '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 200 }}
        className="fixed top-0 right-0 h-full w-[380px] bg-black/60 backdrop-blur-3xl border-l border-white/5 z-[450] flex flex-col shadow-[-40px_0_80px_rgba(0,0,0,0.5)]"
      >
        {/* Header with Navigation */}
        <div className="p-6 border-b border-white/5">
          <div className="flex items-center justify-between mb-8">
             <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-primary rounded-full shadow-[0_0_10px_rgba(208,188,255,1)]" />
                <h2 className="text-xs font-black uppercase tracking-[0.4em] text-white/50">Plajah Coms Relay</h2>
             </div>
             <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-white/5 rounded-full text-white/40 transition-colors">
               <X size={16} />
             </button>
          </div>

          <div className="flex bg-black/40 rounded-full p-1 border border-white/5 shadow-inner">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex-1 flex flex-col items-center py-2 transition-all rounded-full relative ${
                  activeTab === tab.id ? 'text-white' : 'text-white/40 hover:text-white/60'
                }`}
              >
                {activeTab === tab.id && (
                  <motion.div 
                    layoutId="activeTabChat"
                    className="absolute inset-0 bg-white/5 rounded-full border border-white/10"
                  />
                )}
                <tab.icon size={16} className="relative z-10" />
                <span className="text-[8px] font-black uppercase tracking-widest mt-1 relative z-10">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="flex-1 flex flex-col h-full"
            >
              {activeTab === 'LIVETALK' && (
                <LiveTalkView onBrowse={() => {}} />
              )}

              {activeTab === 'LIVE' && (
                <div className="flex-1 flex flex-col h-full">
                  <div className="p-6 bg-white/[0.02] border-b border-white/5 flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-black uppercase tracking-widest text-primary mb-1">
                        {currentVideo ? 'Movie Sync' : currentTrack ? 'Audio Wave' : 'Echo Chamber'}
                      </h4>
                      <p className="text-xs text-white/40 font-black uppercase tracking-widest truncate max-w-[200px]">
                        {currentVideo?.title || currentTrack?.title || 'Global Lobby'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/10">
                      <Users size={12} className="text-white/40" />
                      <span className="text-[10px] font-black font-mono text-white/60">1.2K</span>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                    {messages.length === 0 && (
                      <div className="h-full flex flex-col items-center justify-center opacity-20 space-y-4">
                        <MessageSquare size={48} />
                        <p className="text-[10px] font-black uppercase tracking-widest">No signals detected</p>
                      </div>
                    )}
                    {messages.map((msg) => (
                      <div key={msg.id} className="flex gap-4 group">
                        <img 
                          src={msg.senderPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.senderId}`} 
                          className="w-10 h-10 rounded-xl bg-white/10 border border-white/10 shadow-xl" 
                        />
                        <div className="space-y-1">
                           <div className="flex items-center gap-2">
                             <span className="text-[10px] font-black uppercase tracking-widest text-primary">{msg.senderName}</span>
                             <span className="text-[8px] font-mono text-white/20">21:40</span>
                           </div>
                           <p className="text-base text-white/80 leading-relaxed">{msg.text}</p>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>

                  <form onSubmit={handleSendMessage} className="p-6 bg-black/40 border-t border-white/5">
                    <div className="relative">
                      <input 
                        type="text"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        placeholder="Say something..."
                        className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 pr-14 text-sm outline-none focus:border-primary/50 transition-all"
                      />
                      <button type="submit" className="absolute right-4 top-1/2 -translate-y-1/2 text-primary hover:scale-110 transition-transform">
                        <Send size={20} />
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {activeTab === 'WATCH_ALONG' && (
                <div className="flex-1 flex flex-col h-full">
                  <div className="m-6 relative rounded-[2rem] overflow-hidden bg-black aspect-video border border-white/10 group shadow-2xl">
                    <img src="https://picsum.photos/seed/host/400/225" className="w-full h-full object-cover opacity-60" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40">
                      <div className="w-16 h-16 rounded-full aurora-bg flex items-center justify-center mb-4 shadow-bloom">
                         <VideoIcon size={24} className="text-white" />
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-[0.4em] text-white">Connecting Host...</span>
                    </div>
                    
                    {/* Host Controls */}
                    <div className="absolute bottom-4 left-4 right-4 flex justify-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-2 bg-white/10 backdrop-blur-xl border border-white/20 rounded-full text-white"><MicOff size={14}/></button>
                      <button className="p-2 bg-white/10 backdrop-blur-xl border border-white/20 rounded-full text-white"><VideoOff size={14}/></button>
                      <button className="p-2 bg-white/10 backdrop-blur-xl border border-white/20 rounded-full text-white"><Settings size={14}/></button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                     <div className="flex items-center justify-between mb-4">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-[#00DAF3]">Live Audience</h4>
                        <span className="text-[10px] font-black font-mono text-white/40">432 Watching</span>
                     </div>
                     <div className="grid grid-cols-4 gap-4">
                        {[1,2,3,4,5,6,7,8].map(i => (
                          <div key={i} className="aspect-square rounded-full bg-white/5 border border-white/10 overflow-hidden relative group cursor-pointer shadow-lg">
                            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=u${i}`} className="w-full h-full" />
                            <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        ))}
                     </div>
                  </div>
                  
                  <div className="p-6 bg-black/40 border-t border-white/5 space-y-4">
                    <button className="w-full py-4 aurora-bg rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] shadow-bloom">
                      Join Watch Session
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'GLOBAL_FEED' && (
                <div className="flex-1 flex flex-col h-full">
                  <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-primary tracking-[0.5em]">The Archive Feed</h4>
                    <TrendingUp size={16} className="text-primary" />
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 space-y-10 custom-scrollbar">
                    {posts.map((post) => (
                      <div key={post.id} className="space-y-4 group">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <img src={post.authorPhoto || null} className="w-8 h-8 rounded-lg shadow-lg" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/90">{post.authorName}</span>
                          </div>
                          <span className="text-[8px] font-mono text-white/20">2m</span>
                        </div>
                        <p className="text-base text-white/70 leading-relaxed">{post.content}</p>
                        <div className="flex items-center gap-6">
                           <button className="flex items-center gap-2 text-white/20 hover:text-primary transition-colors">
                              <Heart size={14} />
                              <span className="text-[8px] font-black font-mono">{post.shareCount || 0}</span>
                           </button>
                           <button className="flex items-center gap-2 text-white/20 hover:text-[#00DAF3] transition-colors">
                              <Share2 size={14} />
                              <span className="text-[8px] font-black font-mono">12</span>
                           </button>
                        </div>
                        <div className="h-px bg-white/5 w-full group-last:hidden" />
                      </div>
                    ))}
                  </div>
                  <form onSubmit={handleSendPost} className="p-6 bg-black/40 border-t border-white/5">
                    <textarea 
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      placeholder="Share a vision..."
                      className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 text-sm outline-none focus:border-primary/50 transition-all resize-none h-24"
                    />
                    <button type="submit" className="w-full mt-4 py-4 glass border border-white/10 rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-white/5 transition-all">
                      Post to Global Feed
                    </button>
                  </form>
                </div>
              )}

              {activeTab === 'MY_FEED' && (
                <div className="flex-1 flex flex-col h-full text-center p-12 space-y-8">
                  <div className="w-32 h-32 rounded-3xl overflow-hidden mx-auto border-2 border-primary/20 shadow-2xl">
                    <img src={auth.currentUser?.photoURL || 'https://picsum.photos/seed/me/300/300'} className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <h3 className="text-3xl font-headline uppercase tracking-tight">{auth.currentUser?.displayName || 'Voyager'}</h3>
                    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-primary mt-2">Active Curator</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="glass p-4 rounded-2xl border border-white/5">
                      <div className="text-lg font-headline">12</div>
                      <div className="text-[9px] font-black uppercase tracking-widest text-white/40">Posts</div>
                    </div>
                    <div className="glass p-4 rounded-2xl border border-white/5">
                      <div className="text-lg font-headline">342</div>
                      <div className="text-[9px] font-black uppercase tracking-widest text-white/40">Vibes</div>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-6 pt-10 text-left">
                    {myPosts.map(p => (
                      <div key={p.id} className="p-6 glass rounded-2xl border border-white/5">
                         <p className="text-xs text-white/60 leading-relaxed italic">"{p.content}"</p>
                         <div className="mt-4 flex justify-between items-center text-[8px] font-black uppercase tracking-widest text-white/20">
                            <span>{new Date(p.timestamp).toLocaleDateString()}</span>
                            <span>{p.shareCount || 0} High Vibes</span>
                         </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.aside>
    </>
  );
};

export default PersistentChatDrawer;
