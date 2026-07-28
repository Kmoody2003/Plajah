import React, { useState, useEffect } from 'react';
import { Tv, Play, Info, Users, ExternalLink, Sparkles, Layout, Radio, ChevronLeft, Search, Filter, Home, Heart, TrendingUp, Compass, Share2, VolumeX, Maximize2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TVChannel, UserProfile, LiveFeed } from '../types';
import { fetchTVChannels, fetchUserProfile, fetchRankedLiveFeeds, auth } from '../services/backendService';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';

interface TVViewProps {
  onBack?: () => void;
}

const TVView: React.FC<TVViewProps> = ({ onBack }) => {
  const { pause, clearMedia } = useGlobalPlayerState();
  const [channels, setChannels] = useState<TVChannel[]>([]);
  const [liveFeeds, setLiveFeeds] = useState<LiveFeed[]>([]);
  const [activeChannel, setActiveChannel] = useState<{ id: string, title: string, url: string, ownerId: string, description?: string, isLive?: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [channelOwners, setChannelOwners] = useState<Record<string, UserProfile>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('For You');
  const [isMuted, setIsMuted] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    clearMedia();
    return () => clearMedia();
  }, []);

  useEffect(() => {
    const loadTV = async () => {
      const uid = auth.currentUser?.uid || '';
      const [allChannels, rankedFeeds] = await Promise.all([
        fetchTVChannels(),
        fetchRankedLiveFeeds(uid)
      ]);
      
      setChannels(allChannels);
      setLiveFeeds(rankedFeeds);
      setLoading(false);
      
      if (rankedFeeds.length > 0) {
        const feed = rankedFeeds[0];
        setActiveChannel({
          id: feed.id,
          title: feed.title,
          url: feed.url,
          ownerId: feed.ownerId,
          isLive: true
        });
      } else if (allChannels.length > 0) {
        const channel = allChannels[0];
        setActiveChannel({
          id: channel.id,
          title: channel.title,
          url: channel.liveStreamUrl || '',
          ownerId: channel.ownerId,
          description: channel.description
        });
      }

      // Parallel owner fetch
      const ownerIds = [...new Set([
        ...allChannels.map(c => c.ownerId),
        ...rankedFeeds.map(f => f.ownerId),
      ])];
      const ownerProfiles = await Promise.all(ownerIds.map(id => fetchUserProfile(id).catch(() => null)));
      const owners: Record<string, UserProfile> = {};
      ownerIds.forEach((id, i) => { if (ownerProfiles[i]) owners[id] = ownerProfiles[i]!; });
      setChannelOwners(owners);
    };
    loadTV();
  }, []);

  const filteredFeeds = liveFeeds.filter(f => {
    // Only currently-live streams belong here — an ended one is a replay, not live.
    if ((f as any).status === 'ENDED' || (f as any).status === 'OFFLINE') return false;
    const matchesSearch = f.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         f.ownerName.toLowerCase().includes(searchTerm.toLowerCase());
    if (activeCategory === 'For You') return matchesSearch;
    if (activeCategory === 'Following') return matchesSearch; // Ranking already handles this
    if (f.genre === activeCategory) return matchesSearch;
    return matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-theme text-white">
        <div className="w-16 h-16 border-4 border-small-orange border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-xs font-black uppercase tracking-widest opacity-40">Tuning In...</p>
      </div>
    );
  }

  const getAutoplayUrl = (url: string, muted: boolean = true) => {
    if (!url) return '';
    const isYoutube = url.includes('youtube.com') || url.includes('youtu.be');
    const isTwitch = url.includes('twitch.tv');
    
    try {
      const urlObj = new URL(url);
      if (isYoutube) {
        urlObj.searchParams.set('autoplay', '1');
        urlObj.searchParams.set('mute', muted ? '1' : '0');
        urlObj.searchParams.set('controls', muted ? '0' : '1');
        urlObj.searchParams.set('modestbranding', '1');
      } else if (isTwitch) {
        urlObj.searchParams.set('autoplay', 'true');
        urlObj.searchParams.set('muted', muted ? 'true' : 'false');
        urlObj.searchParams.set('parent', window.location.hostname);
      }
      return urlObj.toString();
    } catch (e) {
      // Fallback for non-standard URLs
      if (isYoutube) return `${url}${url.includes('?') ? '&' : '?'}autoplay=1&mute=${muted ? '1' : '0'}&controls=${muted ? '0' : '1'}&modestbranding=1`;
      if (isTwitch) return `${url}${url.includes('?') ? '&' : '?'}autoplay=true&muted=${muted ? 'true' : 'false'}&parent=${window.location.hostname}`;
      return url;
    }
  };

  return (
    <div className="h-full bg-black text-white overflow-hidden flex flex-col font-sans">
      <div className="flex-1 flex overflow-hidden">
        {/* OTT Channel Navigation */}
        <div className="w-20 lg:w-72 bg-[#050505] border-r border-white/5 flex flex-col p-6 lg:p-10">
          <div className="mb-12 hidden lg:block">
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-small-orange transition-colors" size={18} />
              <input 
                type="text"
                placeholder="Find Channels..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-14 pr-4 text-[11px] font-black uppercase tracking-widest outline-none focus:border-small-orange/50 focus:bg-white/[0.07] transition-all"
              />
            </div>
          </div>

          <nav className="flex-1 space-y-3">
            <p className="text-[9px] font-black uppercase tracking-[0.4em] text-white/20 mb-6 px-4">Discovery</p>
            {[
              { id: 'For You', icon: Sparkles, color: 'text-purple-500' },
              { id: 'Following', icon: Heart, color: 'text-red-500' },
              { id: 'Trending', icon: TrendingUp, color: 'text-green-500' },
              { id: 'Explore', icon: Compass, color: 'text-blue-500' },
              { id: 'Music', icon: Radio, color: 'text-pink-500' },
              { id: 'Gaming', icon: Layout, color: 'text-orange-500' }
            ].map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`w-full flex items-center gap-5 p-5 rounded-[2rem] transition-all duration-500 group ${
                  activeCategory === cat.id 
                    ? 'bg-white text-black shadow-[0_0_40px_rgba(255,255,255,0.1)]' 
                    : 'text-white/40 hover:bg-white/5 hover:text-white'
                }`}
              >
                <cat.icon size={22} className={activeCategory === cat.id ? 'text-black' : `group-hover:${cat.color} transition-colors`} />
                <span className="text-[11px] font-black uppercase tracking-widest hidden lg:block">{cat.id}</span>
              </button>
            ))}
          </nav>

          <div className="mt-auto p-8 bg-gradient-to-br from-white/5 to-transparent rounded-[2.5rem] border border-white/5 hidden lg:block">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-2 h-2 bg-red-500 rounded-full" />
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40">On Air Now</p>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-3xl font-display font-black tracking-tightest">{liveFeeds.length}</span>
              <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Global Channels</span>
            </div>
          </div>
        </div>

        {/* Immersive Player Area */}
        <div className="flex-1 flex flex-col overflow-hidden bg-black">
          <div className="flex-1 relative group/player">
            {activeChannel ? (
              <div className="w-full h-full flex flex-col">
                <div className="flex-1 relative bg-black">
                  {activeChannel.url ? (
                    <>
                    <iframe 
                      src={getAutoplayUrl(activeChannel.url, true)}
                      className={`w-full h-full border-none pointer-events-none`}
                      allow="autoplay; encrypted-media; fullscreen"
                      title={activeChannel.title}
                    />
                    <div className="absolute inset-0 z-10 flex items-center justify-center cursor-pointer bg-black/20 group/unmute hover:bg-black/40 transition-colors" onClick={(e) => { e.stopPropagation(); setIsFullScreen(true); }}>
                       <button className="bg-black/50 text-white rounded-full p-6 backdrop-blur-md opacity-0 group-hover/unmute:opacity-100 transition-opacity flex flex-col items-center">
                          <Maximize2 size={36} />
                          <span className="block text-[10px] mt-2 font-black uppercase tracking-widest text-[#ff8c00]">Click to Unmute & Open Full Screen</span>
                       </button>
                    </div>
                    </>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#0a0a0a] to-black p-12 text-center">
                      <div className="w-40 h-40 bg-white/5 rounded-full flex items-center justify-center mb-10 relative">
                        <div className="absolute inset-0 bg-small-orange/20 rounded-full animate-ping opacity-20" />
                        <Tv size={64} className="text-white/20" />
                      </div>
                      <h3 className="text-5xl lg:text-7xl font-display font-black uppercase tracking-tightest mb-6 text-white/10">{activeChannel.title}</h3>
                      <p className="text-white/20 max-w-md mb-10 font-bold uppercase tracking-widest text-[10px] leading-relaxed">
                        {activeChannel.description || "This channel is currently curating its next broadcast experience."}
                      </p>
                    </div>
                  )}

                  {/* Overlay Controls (Visible on Hover) */}
                  <div className="absolute inset-x-0 top-0 p-10 flex items-center justify-between opacity-0 group-hover/player:opacity-100 transition-opacity duration-700 pointer-events-none">
                    <div className="flex items-center gap-6 pointer-events-auto">
                      {onBack && (
                        <button onClick={onBack} className="p-5 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full text-white hover:bg-white/20 transition-all">
                          <ChevronLeft size={24} />
                        </button>
                      )}
                      <div className="px-6 py-3 bg-red-600 rounded-full flex items-center gap-3 shadow-2xl">
                        <div className="w-2 h-2 bg-white rounded-full" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-white">Live Broadcast</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 pointer-events-auto">
                      <button className="p-5 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full text-white hover:bg-white/20 transition-all">
                        <Users size={24} />
                      </button>
                      <button className="p-5 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full text-white hover:bg-white/20 transition-all">
                        <Share2 size={24} />
                      </button>
                    </div>
                  </div>
                </div>
                
                {/* Channel Info Bar - OTT Style */}
                <div className="p-10 lg:p-16 bg-gradient-to-t from-black to-transparent border-t border-white/5 flex flex-col lg:flex-row lg:items-center justify-between gap-10">
                  <div className="flex items-center gap-10">
                    <div className="relative shrink-0">
                      <img 
                        src={channelOwners[activeChannel.ownerId]?.photoURL || 'https://picsum.photos/seed/user/100/100'} 
                        className="w-20 h-20 lg:w-28 lg:h-28 rounded-[2.5rem] border-4 border-white/10 object-cover shadow-3xl" 
                        alt="Channel Owner"
                      />
                      <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-small-orange rounded-2xl flex items-center justify-center border-4 border-black">
                        <Sparkles size={16} className="text-white" />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-4 mb-3">
                        <h4 className="text-3xl lg:text-5xl font-display font-black uppercase tracking-tightest text-white">{activeChannel.title}</h4>
                      </div>
                      <div className="flex items-center gap-6">
                        <p className="text-xs font-black text-small-orange uppercase tracking-[0.3em]">
                          {channelOwners[activeChannel.ownerId]?.displayName || 'Artist'}
                        </p>
                        <div className="w-1 h-1 bg-white/20 rounded-full" />
                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                          {liveFeeds.length * 124} Watching
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => {
                        const feed = liveFeeds.find(f => f.id === activeChannel.id);
                        if (feed) {
                          window.dispatchEvent(new CustomEvent('PLAY_LIVE_FEED', { detail: { feed } }));
                        }
                      }}
                      className="px-10 py-5 bg-white text-black rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-2xl"
                    >
                      Mini Player
                    </button>
                    <button className="p-5 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all text-white/40 hover:text-white">
                      <Info size={24} />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/20">
                <div className="text-center">
                  <Tv size={80} className="mx-auto mb-8 opacity-10" />
                  <p className="text-sm font-black uppercase tracking-[0.5em]">Select Channel</p>
                </div>
              </div>
            )}
          </div>

          {/* Horizontal Channel Guide (OTT Style) */}
          <div className="h-64 bg-[#050505] border-t border-white/5 p-8 overflow-x-auto custom-scrollbar flex gap-6 items-center">
            {filteredFeeds.map((feed) => (
              <button 
                key={feed.id}
                onClick={() => {
                  setActiveChannel({
                    id: feed.id,
                    title: feed.title,
                    url: feed.url,
                    ownerId: feed.ownerId,
                    isLive: true
                  });
                  setIsMuted(true);
                  pause();
                }}
                className={`flex-shrink-0 w-80 h-full p-6 rounded-[2.5rem] border transition-all duration-500 flex flex-col justify-between group relative overflow-hidden ${
                  activeChannel?.id === feed.id 
                    ? 'bg-white border-white' 
                    : 'bg-white/5 border-white/5 hover:bg-white/10'
                }`}
              >
                {activeChannel?.id === feed.id && (
                  <div className="absolute top-0 left-0 w-full h-1 bg-small-orange" />
                )}
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-2xl overflow-hidden border border-white/10">
                    <img 
                      src={channelOwners[feed.ownerId]?.photoURL || 'https://picsum.photos/seed/thumb/200/200'} 
                      className="w-full h-full object-cover"
                      alt="Thumbnail"
                    />
                  </div>
                  <div className="px-3 py-1 bg-red-600/10 border border-red-600/20 rounded-full">
                    <span className="text-[8px] font-black uppercase tracking-widest text-red-500">Live</span>
                  </div>
                </div>
                <div>
                  <h5 className={`text-sm font-black uppercase tracking-tight mb-1 truncate ${activeChannel?.id === feed.id ? 'text-black' : 'text-white'}`}>
                    {feed.title}
                  </h5>
                  <p className={`text-[9px] font-bold uppercase tracking-widest truncate ${activeChannel?.id === feed.id ? 'text-black/40' : 'text-white/20'}`}>
                    {feed.ownerName}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {isFullScreen && activeChannel && (
        <div className="fixed inset-0 z-[1000] bg-black">
          <iframe 
             src={getAutoplayUrl(activeChannel.url, false)} 
             className="w-full h-full border-none" 
             allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
             allowFullScreen 
          />
          <button 
             onClick={() => setIsFullScreen(false)}
             className="absolute top-6 right-6 p-4 bg-white/10 hover:bg-white/30 text-white rounded-full backdrop-blur-md transition-colors z-[1010]"
          >
             <X size={24} />
          </button>
          <div className="absolute top-6 left-6 px-6 py-3 bg-black/60 backdrop-blur-md rounded-2xl border border-white/10 text-white z-[1010]">
             <h3 className="font-bold uppercase tracking-widest text-sm">{activeChannel.title}</h3>
             <p className="text-[#ff8c00] text-[10px] uppercase font-black">{channelOwners[activeChannel.ownerId]?.displayName || 'Artist'}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default TVView;
