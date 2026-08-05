import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronDown, ChevronUp, MessageCircle, Send, Maximize2, Minimize2 } from 'lucide-react';
import { LiveFeed } from '../types';
import { auth } from '../services/backendService';
import PlajahLivePlayer from './PlajahLivePlayer';
import { LiveViewer } from './MobileLiveStreamer';

interface LiveFeedPlayerProps {
  feed: LiveFeed | null;
  onClose: () => void;
  onExpand?: () => void;
}

function getEmbedSrc(url: string): string {
  // YouTube
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&mute=1`;
  // Twitch
  const twitchMatch = url.match(/twitch\.tv\/([^/?]+)/);
  if (twitchMatch) return `https://player.twitch.tv/?channel=${twitchMatch[1]}&parent=${window.location.hostname}&autoplay=true&muted=true`;
  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1&muted=1`;
  // Already an embed or other
  return url;
}

function isHls(url: string) { return url.includes('.m3u8'); }
function isEmbeddable(url: string) {
  return url.includes('youtube') || url.includes('youtu.be') || url.includes('twitch') || url.includes('vimeo');
}

const LiveFeedPlayer: React.FC<LiveFeedPlayerProps> = ({ feed, onClose, onExpand }) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ user: string; text: string }[]>([]);
  const [chatInput, setChatInput] = useState('');

  useEffect(() => {
    if (!showChat || isMinimized) return;
    const interval = setInterval(() => {
      setChatMessages(prev => [
        ...prev,
        { user: `fan_${Math.floor(Math.random() * 9999)}`, text: ['🔥 Let\'s goo!', 'W stream', 'this is FIRE 🎵', 'first!', '❤️❤️❤️'][Math.floor(Math.random() * 5)] },
      ]);
    }, 6000);
    return () => clearInterval(interval);
  }, [showChat, isMinimized]);

  if (!feed) return null;

  // Determine source type
  const hasMux = !!feed.muxPlaybackId;
  const feedUrl = feed.url || '';
  const isPlaceholder = feedUrl === 'live_stream_placeholder';
  // WebRTC (the unified `streams` engine) is identified by streamSource or a
  // streamId on the discovery mirror, or the legacy `livestream:` url prefix.
  const feedStreamId = (feed as any)?.streamId || (feedUrl.startsWith('livestream:') ? feedUrl.replace('livestream:', '') : '');
  const isWebRTC = (feed as any)?.streamSource === 'webrtc' || feedUrl.startsWith('livestream:') || (!!feedStreamId && !hasMux);
  const webRTCStreamId = feedStreamId;
  const isHlsSrc = !hasMux && !isWebRTC && isHls(feedUrl);
  const isEmbed = !hasMux && !isWebRTC && !isHlsSrc && isEmbeddable(feedUrl);

  // WebRTC stream → open the unified viewer (reads the `streams` collection)
  if (isWebRTC && webRTCStreamId) {
    return (
      <LiveViewer
        streamId={webRTCStreamId}
        title={feed?.title}
        ownerName={(feed as any)?.ownerName}
        onClose={onClose}
      />
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0, scale: 0.9 }}
        animate={{
          y: 0, opacity: 1, scale: 1,
          width: isMinimized ? 240 : (showChat ? 700 : 400),
          height: isMinimized ? 60 : 350,
        }}
        exit={{ y: 100, opacity: 0, scale: 0.9 }}
        className="fixed bottom-24 right-8 z-[400] bg-black/95 backdrop-blur-2xl border border-white/10 rounded-[2rem] shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="px-4 py-3 bg-white/5 flex items-center justify-between border-b border-white/5 shrink-0">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-2 h-2 bg-red-500 rounded-full shrink-0 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest truncate">{feed.title}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {!isMinimized && (
              <button
                onClick={() => setShowChat(v => !v)}
                className={`p-2 rounded-full transition-all ${showChat ? 'bg-orange-500/20 text-orange-400' : 'hover:bg-white/10 text-white/60'}`}
              >
                <MessageCircle size={13} />
              </button>
            )}
            <button
              onClick={() => setIsMinimized(v => !v)}
              className="p-2 hover:bg-white/10 rounded-full transition-all text-white/60 hover:text-white"
            >
              {isMinimized ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-full transition-all text-white/40 hover:text-white"
            >
              <X size={13} />
            </button>
          </div>
        </div>

        {/* Player + Chat */}
        {!isMinimized && (
          <div className="flex flex-1 overflow-hidden">
            {/* Player */}
            <div className="flex-1 relative">
              {isPlaceholder ? (
                /* Fallback demo video */
                <video
                  src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
                  autoPlay muted loop playsInline
                  className="w-full h-full object-cover"
                />
              ) : hasMux ? (
                <PlajahLivePlayer
                  playbackId={feed.muxPlaybackId}
                  isLive
                  title={feed.title}
                  autoPlay
                  muted
                  className="w-full h-full"
                  onError={() => {}}
                />
              ) : isHlsSrc ? (
                <PlajahLivePlayer
                  src={feedUrl}
                  isLive
                  title={feed.title}
                  autoPlay
                  muted
                  className="w-full h-full"
                  onError={() => {}}
                />
              ) : isEmbed ? (
                <PlajahLivePlayer
                  embedSrc={getEmbedSrc(feedUrl)}
                  isLive
                  title={feed.title}
                  className="w-full h-full"
                />
              ) : (
                <PlajahLivePlayer
                  embedSrc={feedUrl}
                  isLive
                  title={feed.title}
                  className="w-full h-full"
                />
              )}
            </div>

            {/* Chat Sidebar */}
            {showChat && (
              <div className="w-72 border-l border-white/10 flex flex-col bg-black/60">
                <div className="flex-1 p-3 overflow-y-auto space-y-2 flex flex-col justify-end custom-scrollbar">
                  {chatMessages.length === 0 ? (
                    <p className="text-center text-[9px] font-black uppercase tracking-widest text-white/20 my-auto">
                      Start the conversation
                    </p>
                  ) : chatMessages.slice(-25).map((msg, i) => (
                    <div key={i} className="text-xs break-words">
                      <span className="font-black text-orange-400 uppercase text-[9px]">{msg.user}</span>{' '}
                      <span className="text-white/70">{msg.text}</span>
                    </div>
                  ))}
                </div>
                <div className="p-3 border-t border-white/10 bg-white/5">
                  <form onSubmit={e => {
                    e.preventDefault();
                    if (!chatInput.trim()) return;
                    setChatMessages(prev => [...prev, { user: auth.currentUser?.displayName || 'You', text: chatInput }]);
                    setChatInput('');
                  }} className="relative">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      placeholder="Say something…"
                      className="w-full bg-black/50 border border-white/10 rounded-xl py-2 pl-3 pr-9 text-[10px] font-bold outline-none focus:border-white/30 transition-all"
                    />
                    <button type="submit" className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 hover:bg-white/10 rounded-lg transition-all text-white/60 hover:text-white">
                      <Send size={11} />
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Minimized state */}
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
