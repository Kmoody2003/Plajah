import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Maximize2, Minimize2, X, Play, Pause, Tv, ChevronDown, ChevronUp, MessageCircle, Send } from 'lucide-react';
import { LiveFeed } from '../types';
import { auth } from '../services/backendService';
import MuxPlayer from '@mux/mux-player-react';

interface LiveFeedPlayerProps {
  feed: LiveFeed | null;
  onClose: () => void;
}

const LiveFeedPlayer: React.FC<LiveFeedPlayerProps> = ({ feed, onClose }) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<{user: string, text: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // Generate dummy messages to simulate real active platform
    const interval = setInterval(() => {
      if (showChat && !isMinimized && isPlaying) {
         setChatMessages(prev => [...prev, { user: `Fan_${Math.floor(Math.random()*1000)}`, text: 'This stream is amazing! 🔥' }]);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [showChat, isMinimized, isPlaying]);

  useEffect(() => {
    if (isMinimized) {
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
    }
  }, [isMinimized]);

  if (!feed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0, scale: 0.9 }}
        animate={{ 
          y: 0, 
          opacity: 1, 
          scale: 1,
          width: isMinimized ? 240 : (showChat ? 700 : 400),
          height: isMinimized ? 60 : 350
        }}
        exit={{ y: 100, opacity: 0, scale: 0.9 }}
        className="fixed bottom-24 right-8 z-[400] bg-black/90 backdrop-blur-2xl border border-white/10 rounded-[2rem] shadow-3xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="p-4 bg-white/5 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-2 h-2 bg-red-500 rounded-full shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-widest truncate">{feed.title}</span>
          </div>
          <div className="flex items-center gap-2">
            {!isMinimized && (
              <button 
                onClick={() => setShowChat(!showChat)}
                className={`p-2 rounded-full transition-colors ${showChat ? 'bg-primary text-black' : 'hover:bg-white/10 text-white'}`}
              >
                <MessageCircle size={14} />
              </button>
            )}
            <button 
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
            >
              {isMinimized ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/40 hover:text-white"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Player & Chat Content */}
        {!isMinimized && (
          <div className="flex flex-1 overflow-hidden relative">
            <div className="flex-1 bg-black relative">
              {isPlaying ? (
                feed.muxPlaybackId ? (
                   <div className="w-full h-full relative bg-zinc-900 flex items-center justify-center overflow-hidden">
                     <MuxPlayer
                        streamType="live"
                        playbackId={feed.muxPlaybackId}
                        autoPlay="any"
                        muted
                        className="w-full h-full object-cover"
                     />
                     <div className="absolute top-2 left-2 bg-red-600 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest text-white animate-pulse">
                        LIVE
                     </div>
                   </div>
                ) : feed.url === 'live_stream_placeholder' ? (
                   <div className="w-full h-full relative bg-zinc-900">
                      <video 
                        src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4" 
                        autoPlay 
                        muted 
                        loop 
                        playsInline
                        className="w-full h-full object-cover" 
                      />
                      <div className="absolute top-2 left-2 bg-red-600 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest text-white animate-pulse">
                        LIVE
                      </div>
                   </div>
                ) : (
                  <iframe
                    ref={iframeRef}
                    src={`${feed.url}${feed.url.includes('?') ? '&' : '?'}autoplay=1&muted=1&mute=1`}
                    className="w-full h-full border-none"
                    allow="autoplay; encrypted-media; fullscreen"
                    title={feed.title}
                  />
                )
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <button 
                    onClick={() => setIsPlaying(true)}
                    className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-all"
                  >
                    <Play size={32} fill="white" />
                  </button>
                </div>
              )}
            </div>

            {/* Chat Sidebar */}
            {showChat && (
               <div className="w-[300px] bg-black/60 border-l border-white/10 flex flex-col">
                  <div className="flex-1 p-4 overflow-y-auto space-y-3 no-scrollbar flex flex-col justify-end">
                     {chatMessages.length === 0 ? (
                        <div className="text-center opacity-40 text-[10px] font-black uppercase tracking-widest my-auto">
                           Start the conversation
                        </div>
                     ) : (
                        chatMessages.slice(-20).map((msg, i) => (
                           <div key={i} className="text-xs break-words">
                              <span className="font-black text-primary uppercase">{msg.user}</span> <span className="opacity-80">{msg.text}</span>
                           </div>
                        ))
                     )}
                  </div>
                  <div className="p-3 border-t border-white/10 bg-white/5">
                     <form 
                       onSubmit={e => {
                         e.preventDefault();
                         if (!chatInput.trim()) return;
                         setChatMessages(prev => [...prev, { user: auth.currentUser?.displayName || 'You', text: chatInput }]);
                         setChatInput('');
                       }} 
                       className="relative"
                     >
                       <input 
                         type="text" 
                         value={chatInput}
                         onChange={e => setChatInput(e.target.value)}
                         placeholder="Say something..." 
                         className="w-full bg-black/50 border border-white/10 rounded-lg py-2 pl-3 pr-10 text-[10px] font-bold outline-none focus:border-white/30 transition-colors"
                       />
                       <button type="submit" className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 hover:bg-white/10 rounded-md transition-colors text-white/60 hover:text-white">
                          <Send size={12} />
                       </button>
                     </form>
                  </div>
               </div>
            )}
          </div>
        )}

        {/* Minimized Controls */}
        {isMinimized && (
          <div className="flex-1 flex items-center justify-between px-4">
            <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest truncate max-w-[120px]">
              {feed.ownerName}
            </p>
            <button 
              onClick={() => setIsMinimized(false)}
              className="px-3 py-1 bg-white/10 rounded-full text-[8px] font-black uppercase tracking-widest hover:bg-white/20 transition-all"
            >
              Expand
            </button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default LiveFeedPlayer;
