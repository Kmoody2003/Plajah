import React, { useState, useEffect } from 'react';
import { LiveFeed, UserProfile } from '../types';
import { fetchAllLiveFeeds, publishLiveFeed, deleteLiveFeed, searchLiveChannels } from '../services/backendService';
import { ArrowLeft, Radio, Plus, X, User, ExternalLink, Trash2, Search, Tv, Maximize2, VolumeX } from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';

import { useAchievements } from '../contexts/AchievementContext';
import TVView from './TVView';
import PPVEventsView from './PPVEventsView';

interface LiveHubViewProps {
  onBack: () => void;
  currentUser: FirebaseUser | null;
  onJoinPool: (poolId: string) => void;
}

const LiveHubView: React.FC<LiveHubViewProps> = ({ onBack, currentUser, onJoinPool }) => {
  const { triggerAction } = useAchievements();
  const [activeTab, setActiveTab] = useState<'STREAMS' | 'LIVE_TV' | 'EVENTS'>('STREAMS');
  const [feeds, setFeeds] = useState<LiveFeed[]>([]);
  const [liveArtists, setLiveArtists] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showPublisher, setShowPublisher] = useState(false);
  const [newFeedTitle, setNewFeedTitle] = useState('');
  const [newFeedUrl, setNewFeedUrl] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [fullScreenFeed, setFullScreenFeed] = useState<{ id: string, title: string, url: string, ownerName: string } | null>(null);

  useEffect(() => {
    const unsubscribe = fetchAllLiveFeeds((items) => {
      setFeeds(items);
    });
    
    const loadLiveArtists = async () => {
      const artists = await searchLiveChannels(' ');
      setLiveArtists(artists);
    };
    loadLiveArtists();

    return () => unsubscribe();
  }, []);

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFeedTitle || !newFeedUrl) return;
    setIsPublishing(true);
    try {
      await publishLiveFeed({
        title: newFeedTitle,
        url: newFeedUrl
      });
      setShowPublisher(false);
      setNewFeedTitle('');
      setNewFeedUrl('');
    } catch (err) {
      alert("Failed to publish live feed.");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Remove this live feed from the hub?")) {
      await deleteLiveFeed(id);
    }
  };

  const filteredFeeds = feeds.filter(f => 
    f.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    f.ownerName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredArtists = liveArtists.filter(a => 
    a.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (a.liveStreamConfig?.title || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleFeelingLucky = () => {
    triggerAction('USE_FEELING_LUCKY');
    const allLive = [...feeds, ...liveArtists.map(a => ({ 
      id: a.uid, 
      title: a.liveStreamConfig?.title || 'Live Stream', 
      url: a.liveStreamConfig?.fastChannelUrl || a.liveStreamConfig?.streamUrl || '',
      ownerId: a.uid,
      ownerName: a.displayName
    }))].filter(f => f.url);

    if (allLive.length > 0) {
      const random = allLive[Math.floor(Math.random() * allLive.length)];
      // Open this feed
      const event = new CustomEvent('OPEN_LIVE_FEED', { detail: { feed: random } });
      window.dispatchEvent(event);
    }
  };

  const getAutoplayUrl = (url: string, muted: boolean = true) => {
    if (!url) return '';
    const isYoutube = url.includes('youtube.com') || url.includes('youtu.be');
    const isTwitch = url.includes('twitch.tv');
    
    try {
      if (isYoutube) {
        const urlObj = new URL(url);
        urlObj.searchParams.set('autoplay', '1');
        urlObj.searchParams.set('mute', muted ? '1' : '0');
        urlObj.searchParams.set('controls', muted ? '1' : '1');
        return urlObj.toString();
      } else if (isTwitch) {
        // Twitch allows muted and autoplay through query params
        const urlObj = new URL(url);
        urlObj.searchParams.set('autoplay', 'true');
        urlObj.searchParams.set('muted', muted ? 'true' : 'false');
        urlObj.searchParams.set('parent', window.location.hostname);
        return urlObj.toString();
      }
      
      // General fallback for unknown providers
      const urlObj = new URL(url);
      urlObj.searchParams.set('muted', muted ? '1' : '0');
      urlObj.searchParams.set('mute', muted ? '1' : '0');
      urlObj.searchParams.set('autoplay', '1');
      return urlObj.toString();
    } catch (e) {
      const separator = url.includes('?') ? '&' : '?';
      if (isYoutube) return `${url}${separator}autoplay=1&mute=${muted ? '1' : '0'}`;
      if (isTwitch) return `${url}${separator}autoplay=true&muted=${muted ? 'true' : 'false'}&parent=${window.location.hostname}`;
      return `${url}${separator}muted=${muted ? '1' : '0'}&mute=${muted ? '1' : '0'}&autoplay=1`;
    }
  };

  return (
    <div className="w-full h-full flex flex-col pt-8 lg:pt-16 pb-24">
      <header className="px-8 lg:px-24 mb-12 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 shrink-0">
        <div className="flex items-start gap-8">
          <button onClick={onBack} className="p-4 bg-white/5 rounded-full text-primary hover:bg-white/10 transition-all mt-2 shrink-0">
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Live Hub</h1>
            <div className="flex items-center gap-6 border-b border-white/5 pb-2 overflow-x-auto no-scrollbar">
              {(['STREAMS', 'LIVE_TV', 'EVENTS'] as const).map(tab => (
                <button 
                  key={tab}
                  onClick={() => setActiveTab(tab)} 
                  className={`text-xs font-black uppercase tracking-[0.3em] transition-all whitespace-nowrap pb-2 border-b-2 ${activeTab === tab ? 'text-small-orange border-small-orange' : 'text-white/20 border-transparent hover:text-white/40'}`}
                >
                  {tab === 'STREAMS' ? 'Studio Streams' : tab === 'LIVE_TV' ? 'Live TV' : 'Live Events'}
                </button>
              ))}
            </div>
          </div>
        </div>
        
        {activeTab === 'STREAMS' && (
          <div className="flex flex-wrap gap-4 items-center">
            <button 
              onClick={handleFeelingLucky}
              className="flex items-center justify-center gap-3 px-8 py-4 bg-white/5 border border-white/10 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all group"
            >
              <Tv size={18} className="text-small-orange group-hover:rotate-12 transition-transform" /> Feeling Lucky
            </button>
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-white transition-colors" size={18} />
              <input 
                type="text" 
                placeholder="Search live events..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-full py-3 pl-12 pr-6 text-sm font-bold outline-none focus:ring-2 ring-white/20 transition-all w-64"
              />
            </div>
            {currentUser && (
              <button 
                onClick={() => setShowPublisher(true)}
                className="flex items-center justify-center gap-3 px-10 py-5 bg-red-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-red-600 transition-all"
              >
                <Radio size={18} className="animate-pulse" /> Go Live Now
              </button>
            )}
          </div>
        )}
      </header>

      <div className="flex-1 w-full relative flex flex-col">
        {activeTab === 'STREAMS' && (
          <div className="px-8 lg:px-24 w-full max-w-7xl mx-auto flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              {filteredArtists.map((artist) => {
          const streamUrl = artist.liveStreamConfig?.activeStreamType === 'FAST' 
            ? artist.liveStreamConfig.fastChannelUrl 
            : artist.liveStreamConfig?.streamUrl;
          
          return (
             <div key={artist.uid} className="group bg-theme-card border border-theme rounded-[3rem] overflow-hidden shadow-2xl transition-all hover:scale-[1.01]" onClick={() => setFullScreenFeed(streamUrl ? { id: artist.uid, title: artist.liveStreamConfig?.title || 'Live Stream', url: streamUrl, ownerName: artist.displayName } : null)}>
              <div className="relative aspect-video bg-black cursor-pointer">
                {streamUrl ? (
                  <iframe 
                    src={getAutoplayUrl(streamUrl, true)} 
                    className="w-full h-full pointer-events-none" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowFullScreen 
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-white/5">
                    <Tv size={48} className="text-white/10" />
                  </div>
                )}
                
                <div className="absolute inset-0 z-10 flex items-center justify-center cursor-pointer bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="bg-black/50 text-white rounded-full p-4 backdrop-blur-md">
                       <Maximize2 size={32} />
                       <span className="block text-[10px] mt-2 font-bold uppercase tracking-widest text-center">Full Screen & Unmute</span>
                    </button>
                </div>

                <div className="absolute top-6 left-6 px-4 py-2 bg-red-600 text-white text-[10px] font-black uppercase tracking-widest rounded-full flex items-center gap-2 shadow-lg z-20">
                  <div className="w-2 h-2 bg-white rounded-full animate-ping" />
                  Artist Live
                </div>
              </div>
              <div className="p-10">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-10 h-10 rounded-full bg-white/10 overflow-hidden">
                    {artist.photoURL ? <img src={artist.photoURL || null} alt={artist.displayName} className="w-full h-full object-cover" /> : <User size={18} className="text-white/20" />}
                  </div>
                  <div>
                    <h3 className="font-bold text-xl uppercase tracking-tight">{artist.liveStreamConfig?.title || 'Live Stream'}</h3>
                    <p className="text-small-orange text-[10px] font-black uppercase tracking-widest">{artist.displayName}</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {filteredFeeds.map((feed) => (
          <div key={feed.id} className="group bg-theme-card border border-theme rounded-[3rem] overflow-hidden shadow-2xl transition-all hover:scale-[1.01]" onClick={() => setFullScreenFeed(feed)}>
            <div className="relative aspect-video bg-black cursor-pointer">
              <iframe 
                src={getAutoplayUrl(feed.url, true)} 
                className="w-full h-full pointer-events-none" 
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                allowFullScreen 
              />
              
              <div className="absolute inset-0 z-10 flex items-center justify-center cursor-pointer bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="bg-black/50 text-white rounded-full p-4 backdrop-blur-md">
                     <Maximize2 size={32} />
                     <span className="block text-[10px] mt-2 font-bold uppercase tracking-widest text-center">Full Screen & Unmute</span>
                  </button>
              </div>

              <div className="absolute top-6 left-6 px-4 py-2 bg-red-500 text-white text-[10px] font-black uppercase tracking-widest rounded-full flex items-center gap-2 shadow-lg z-20">
                <div className="w-2 h-2 bg-white rounded-full animate-ping" />
                Live
              </div>
              {currentUser?.uid === feed.ownerId && (
                <button 
                  onClick={(e) => { e.stopPropagation(); handleDelete(feed.id); }}
                  className="absolute top-6 right-6 p-4 bg-black/60 text-white/40 hover:text-red-500 rounded-full backdrop-blur-md transition-all z-20"
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
            <div className="p-10">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-10 h-10 rounded-full bg-white/10 overflow-hidden">
                  {feed.ownerPhoto ? <img src={feed.ownerPhoto || null} alt={feed.ownerName} className="w-full h-full object-cover" /> : <User size={18} className="text-white/20" />}
                </div>
                <div>
                  <h3 className="font-bold text-xl uppercase tracking-tight">{feed.title}</h3>
                  <p className="text-small-orange text-[10px] font-black uppercase tracking-widest">{feed.ownerName}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
        {filteredFeeds.length === 0 && filteredArtists.length === 0 && (
          <div className="col-span-full py-40 text-center opacity-20 flex flex-col items-center gap-6">
            <Radio size={64} className="mb-4" />
            <p className="text-[10px] font-black uppercase tracking-[0.4em]">
              {searchTerm ? `No live events matching "${searchTerm}"` : 'No active studio streams at this moment'}
            </p>
          </div>
        )}
            </div>
          </div>
        )}
        
        {activeTab === 'LIVE_TV' && (
          <div className="absolute inset-0 pb-16">
            <TVView />
          </div>
        )}
        
        {activeTab === 'EVENTS' && (
          <div className="absolute inset-0 overflow-y-auto">
            <PPVEventsView onBack={() => {}} user={currentUser} onJoinPool={onJoinPool} isNested={true} />
          </div>
        )}
      </div>

      {showPublisher && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-2xl z-[300] flex items-center justify-center p-6">
          <div className="max-w-xl w-full bg-[#0a0a0a] border border-white/10 p-12 rounded-[3rem] shadow-3xl">
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-3xl font-display font-black tracking-tight uppercase">Broadcast Signal</h2>
              <button onClick={() => setShowPublisher(false)} className="text-white/20 hover:text-white transition-all"><X size={24} /></button>
            </div>
            <form onSubmit={handlePublish} className="space-y-8">
              <div className="space-y-4">
                <label className="block text-[10px] font-black uppercase tracking-[0.3em] text-small-orange">Stream Title</label>
                <input 
                  type="text" 
                  value={newFeedTitle} 
                  onChange={(e) => setNewFeedTitle(e.target.value)} 
                  placeholder="Studio Session #42" 
                  className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-8 py-5 text-white font-bold focus:outline-none focus:border-red-500/50 transition-all" 
                  required 
                />
              </div>
              <div className="space-y-4">
                <label className="block text-[10px] font-black uppercase tracking-[0.3em] text-small-orange">Embed URL</label>
                <input 
                  type="url" 
                  value={newFeedUrl} 
                  onChange={(e) => setNewFeedUrl(e.target.value)} 
                  placeholder="https://www.youtube.com/embed/live_id" 
                  className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-8 py-5 text-white font-bold focus:outline-none focus:border-red-500/50 transition-all" 
                  required 
                />
                <p className="text-[8px] text-white/20 uppercase tracking-widest">Use the embed URL from YouTube or Twitch.</p>
              </div>
              <button 
                type="submit" 
                disabled={isPublishing}
                className="w-full py-6 bg-red-500 text-white font-black uppercase tracking-widest text-xs rounded-full hover:bg-red-600 transition-all shadow-xl disabled:opacity-50"
              >
                {isPublishing ? 'Establishing Uplink...' : 'Start Broadcasting'}
              </button>
            </form>
          </div>
        </div>
      )}

      {fullScreenFeed && (
        <div className="fixed inset-0 z-[1000] bg-black">
          <iframe 
             src={getAutoplayUrl(fullScreenFeed.url, false)} 
             className="w-full h-full border-none" 
             allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
             allowFullScreen 
          />
          <button 
             onClick={() => setFullScreenFeed(null)}
             className="absolute top-6 right-6 p-4 bg-white/10 hover:bg-white/30 text-white rounded-full backdrop-blur-md transition-colors z-[1010]"
          >
             <X size={24} />
          </button>
          <div className="absolute top-6 left-6 px-6 py-3 bg-black/60 backdrop-blur-md rounded-2xl border border-white/10 text-white z-[1010]">
             <h3 className="font-bold uppercase tracking-widest text-sm">{fullScreenFeed.title}</h3>
             <p className="text-[#ff8c00] text-[10px] uppercase font-black">{fullScreenFeed.ownerName}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveHubView;
