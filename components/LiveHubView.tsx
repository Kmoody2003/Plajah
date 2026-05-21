import React, { useState, useEffect } from 'react';
import { LiveFeed, UserProfile } from '../types';
import PageHeader from './PageHeader';
import { fetchAllLiveFeeds, publishLiveFeed, deleteLiveFeed, searchLiveChannels } from '../services/backendService';
import { ArrowLeft, Radio, Plus, X, User, ExternalLink, Trash2, Search, Tv, Maximize2, VolumeX, Play } from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';

import { useAchievements } from '../contexts/AchievementContext';
import TVView from './TVView';
import PPVEventsView from './PPVEventsView';
import GoLiveWizard from './GoLiveWizard';

interface LiveHubViewProps {
  onBack: () => void;
  currentUser: FirebaseUser | null;
  onJoinPool: (poolId: string) => void;
}

// Hover-triggered stream preview: loads iframe once on first hover, stays mounted
function HoverStreamPreview({ url, mutedUrl }: { url: string; mutedUrl: string }) {
  const [hovered, setHovered] = useState(false);
  const [iframeReady, setIframeReady] = useState(false);
  const isHls = url.toLowerCase().includes('.m3u8');
  const isEmbeddable = url.includes('youtube.com') || url.includes('youtu.be') ||
    url.includes('twitch.tv') || url.includes('vimeo.com') || url.includes('archive.org');

  return (
    <div
      className="w-full h-full relative"
      onMouseEnter={() => { setHovered(true); if (isEmbeddable && !isHls) setIframeReady(true); }}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Placeholder — hidden once iframe is live */}
      <div className={`absolute inset-0 flex items-center justify-center bg-black/60 transition-opacity duration-300 z-10 ${hovered && iframeReady ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-full bg-white/10 border border-white/20 flex items-center justify-center backdrop-blur-md">
            {hovered ? <Play size={24} fill="white" className="ml-1" /> : <Tv size={24} className="text-white/40" />}
          </div>
          {!hovered && <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Hover to preview</span>}
        </div>
      </div>

      {/* Iframe mounts only while hovered — unmounting on mouse-leave stops audio */}
      {hovered && iframeReady && (
        <iframe
          src={mutedUrl}
          className="absolute inset-0 w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      )}

      {/* HLS notice */}
      {isHls && hovered && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 z-20">
          <Tv size={32} className="text-white/30 mb-2" />
          <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">Click to open full screen</p>
        </div>
      )}
    </div>
  );
}

const LiveHubView: React.FC<LiveHubViewProps> = ({ onBack, currentUser, onJoinPool }) => {
  const { triggerAction } = useAchievements();
  const [activeTab, setActiveTab] = useState<'STREAMS' | 'LIVE_TV' | 'EVENTS'>('STREAMS');
  const [feeds, setFeeds] = useState<LiveFeed[]>([]);
  const [liveArtists, setLiveArtists] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [fullScreenFeed, setFullScreenFeed] = useState<{ id: string, title: string, url: string, ownerName: string } | null>(null);
  const [showGoLiveWizard, setShowGoLiveWizard] = useState(false);

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

  const isHlsStream = (url: string) => url.toLowerCase().includes('.m3u8');
  const isEmbeddableUrl = (url: string) => {
    const lower = url.toLowerCase();
    return lower.includes('youtube.com') || lower.includes('youtu.be') || lower.includes('twitch.tv') || lower.includes('vimeo.com') || lower.includes('archive.org');
  };

  const renderStreamPreview = (url: string | undefined) => {
    if (!url) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-white/5">
          <Tv size={48} className="text-white/10" />
        </div>
      );
    }

    if (isHlsStream(url)) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-black text-white/40 px-6 text-center">
          <Tv size={48} className="mb-4 text-white/20" />
          <p className="text-sm font-bold uppercase tracking-widest">HLS stream detected</p>
          <p className="mt-2 text-[10px] leading-relaxed">This stream uses an HLS playlist and cannot be previewed in the card view.</p>
        </div>
      );
    }

    if (isEmbeddableUrl(url)) {
      return (
        <iframe 
          src={getAutoplayUrl(url, true)} 
          className="w-full h-full pointer-events-none" 
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
          allowFullScreen 
        />
      );
    }

    return (
      <div className="w-full h-full flex items-center justify-center bg-white/5">
        <Tv size={48} className="text-white/10" />
      </div>
    );
  };

  const renderFullScreenFeed = (feed: { id: string; title: string; url: string; ownerName: string }) => {
    if (isHlsStream(feed.url)) {
      return (
        <video controls autoPlay muted className="w-full h-full bg-black">
          <source src={feed.url} type="application/x-mpegURL" />
          <p className="text-white p-6">This HLS stream is not supported by your browser.</p>
        </video>
      );
    }

    return (
      <iframe 
        src={getAutoplayUrl(feed.url, false)} 
        className="w-full h-full border-none" 
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
        allowFullScreen 
      />
    );
  };

  return (
    <div className="w-full h-full flex flex-col pt-8 lg:pt-16 pb-24">
      <header className="px-8 lg:px-24 mb-12 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 shrink-0">
        <div className="flex items-start gap-8">
          <button onClick={onBack} className="p-4 bg-white/5 rounded-full text-primary hover:bg-white/10 transition-all mt-2 shrink-0">
            <ArrowLeft size={24} />
          </button>
          <div>
            <PageHeader textClassName="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Plajah Live Hub</PageHeader>
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
              onClick={() => setShowGoLiveWizard(true)}
              className="flex items-center justify-center gap-3 px-8 py-4 bg-red-600 hover:bg-red-700 rounded-2xl font-black text-xs uppercase tracking-widest transition-all group"
            >
              <div className="w-2 h-2 bg-white rounded-full animate-ping group-hover:animate-none" />
              <Radio size={18} className="text-white" /> Go Live
            </button>
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
          const mutedUrl = streamUrl ? getAutoplayUrl(streamUrl, true) : '';

          return (
            <div
              key={artist.uid}
              className="group bg-theme-card border border-theme rounded-[3rem] overflow-hidden shadow-2xl transition-all hover:scale-[1.01] cursor-pointer"
              onClick={() => streamUrl && setFullScreenFeed({ id: artist.uid, title: artist.liveStreamConfig?.title || 'Live Stream', url: streamUrl, ownerName: artist.displayName })}
            >
              <div className="relative aspect-video bg-black overflow-hidden">
                <HoverStreamPreview url={streamUrl || ''} mutedUrl={mutedUrl} />
                <div className="absolute inset-0 z-20 flex items-end justify-end p-4 pointer-events-none">
                  <div className="px-4 py-2 bg-red-600 text-white text-[10px] font-black uppercase tracking-widest rounded-full flex items-center gap-2 shadow-lg">
                    <div className="w-2 h-2 bg-white rounded-full animate-ping" />
                    Artist Live
                  </div>
                </div>
              </div>
              <div className="p-8">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-white/10 overflow-hidden shrink-0">
                    {artist.photoURL ? <img src={artist.photoURL} alt={artist.displayName} className="w-full h-full object-cover" /> : <User size={18} className="text-white/20" />}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-base uppercase tracking-tight truncate">{artist.liveStreamConfig?.title || 'Live Stream'}</h3>
                    <p className="text-small-orange text-[10px] font-black uppercase tracking-widest">{artist.displayName}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); streamUrl && setFullScreenFeed({ id: artist.uid, title: artist.liveStreamConfig?.title || 'Live Stream', url: streamUrl, ownerName: artist.displayName }); }}
                    className="ml-auto p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all shrink-0"
                  >
                    <Maximize2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {filteredFeeds.map((feed) => {
          const mutedUrl = getAutoplayUrl(feed.url, true);
          return (
            <div
              key={feed.id}
              className="group bg-theme-card border border-theme rounded-[3rem] overflow-hidden shadow-2xl transition-all hover:scale-[1.01] cursor-pointer"
              onClick={() => setFullScreenFeed(feed)}
            >
              <div className="relative aspect-video bg-black overflow-hidden">
                <HoverStreamPreview url={feed.url} mutedUrl={mutedUrl} />
                <div className="absolute inset-0 z-20 flex items-end justify-between p-4 pointer-events-none">
                  <div className="px-4 py-2 bg-red-500 text-white text-[10px] font-black uppercase tracking-widest rounded-full flex items-center gap-2 shadow-lg">
                    <div className="w-2 h-2 bg-white rounded-full animate-ping" /> Live
                  </div>
                  {currentUser?.uid === feed.ownerId && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(feed.id); }}
                      className="p-3 bg-black/60 text-white/40 hover:text-red-500 rounded-full backdrop-blur-md transition-all pointer-events-auto"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
              <div className="p-8">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-white/10 overflow-hidden shrink-0">
                    {feed.ownerPhoto ? <img src={feed.ownerPhoto} alt={feed.ownerName} className="w-full h-full object-cover" /> : <User size={18} className="text-white/20" />}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-base uppercase tracking-tight truncate">{feed.title}</h3>
                    <p className="text-small-orange text-[10px] font-black uppercase tracking-widest">{feed.ownerName}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setFullScreenFeed(feed); }}
                    className="ml-auto p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all shrink-0"
                  >
                    <Maximize2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
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


      {showGoLiveWizard && (
        <GoLiveWizard
          onClose={() => setShowGoLiveWizard(false)}
          currentUser={currentUser}
        />
      )}

      {fullScreenFeed && (
        <div className="fixed inset-0 z-[1000] bg-black">
          {renderFullScreenFeed(fullScreenFeed)}
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
