import React, { useState, useEffect } from 'react';
import { LiveFeed, UserProfile, StreamArchive } from '../types';
import PageHeader from './PageHeader';
import { fetchAllLiveFeeds, publishLiveFeed, deleteLiveFeed, searchLiveChannels, fetchStreamArchives, fetchAllFastChannels, type FastChannelListing } from '../services/backendService';
import { ArrowLeft, Radio, Plus, X, User, ExternalLink, Trash2, Search, Tv, Maximize2, VolumeX, Play, FlaskConical, Clock, PlayCircle } from 'lucide-react';
import { canGoLive } from '../services/tvCapabilities';
import { User as FirebaseUser } from 'firebase/auth';
import { SCIENCE_STREAMS, SCIENCE_CATEGORIES, ScienceCategory, ScienceStream } from './scienceStreams';

import { useAchievements } from '../contexts/AchievementContext';
import TVView from './TVView';
import PPVEventsView from './PPVEventsView';
import GoLiveWizard from './GoLiveWizard';
import MobileLiveStreamer, { MobileGoLiveButton } from './MobileLiveStreamer';
import PresenceBadge from './PresenceBadge';
import LiveTvPlus from './LiveTvPlus';
import PlajahEpgGuide from './tv/PlajahEpgGuide';
import ChipRail from './ui/ChipRail';

interface LiveHubViewProps {
  onBack: () => void;
  currentUser: FirebaseUser | null;
  onJoinPool: (poolId: string) => void;
  onOpenTVStudio?: () => void;
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

const LiveHubView: React.FC<LiveHubViewProps> = ({ onBack, currentUser, onJoinPool, onOpenTVStudio }) => {
  const { triggerAction } = useAchievements();
  const [activeTab, setActiveTab] = useState<'TV_PLUS' | 'STREAMS' | 'SCIENCE' | 'LIVE_TV' | 'EVENTS' | 'REPLAYS'>('TV_PLUS');
  const [archives, setArchives] = useState<StreamArchive[]>([]);
  const [archivesLoading, setArchivesLoading] = useState(false);
  const [scienceCat, setScienceCat] = useState<ScienceCategory | 'ALL'>('ALL');
  const [feeds, setFeeds] = useState<LiveFeed[]>([]);
  const [liveArtists, setLiveArtists] = useState<UserProfile[]>([]);
  const [fastChannels, setFastChannels] = useState<FastChannelListing[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [fullScreenFeed, setFullScreenFeed] = useState<{ id: string, title: string, url: string, ownerName: string } | null>(null);
  const [showGoLiveWizard, setShowGoLiveWizard] = useState(false);
  const [showMobileLive, setShowMobileLive] = useState(false);
  // When the guide tunes a FAST channel, jump to the TV+ surface focused on it.
  const [tuneOwnerId, setTuneOwnerId] = useState<string | undefined>(undefined);

  // Tune a channel from the EPG guide: FAST → TV+ focused on it; live/science → their existing viewers.
  const tuneChannel = (ch: any) => {
    if (ch.kind === 'fast' && ch.ownerId) { setTuneOwnerId(ch.ownerId); setActiveTab('TV_PLUS'); return; }
    if (ch.kind === 'science') { setFullScreenFeed(ch.feed); return; }
    if (ch.feed) window.dispatchEvent(new CustomEvent('OPEN_LIVE_FEED', { detail: { feed: ch.feed } }));
  };

  useEffect(() => {
    const unsubscribe = fetchAllLiveFeeds((items) => {
      setFeeds(items);
    });
    
    const loadLiveArtists = async () => {
      const artists = await searchLiveChannels(' ');
      setLiveArtists(artists);
    };
    loadLiveArtists();
    fetchAllFastChannels(300).then(setFastChannels).catch(() => {});

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (activeTab !== 'REPLAYS' || archives.length > 0) return;
    setArchivesLoading(true);
    fetchStreamArchives(24).then(data => {
      setArchives(data);
      setArchivesLoading(false);
    }).catch(() => setArchivesLoading(false));
  }, [activeTab]);

  const handleDelete = async (id: string) => {
    if (confirm("Remove this live feed from the hub?")) {
      await deleteLiveFeed(id);
    }
  };

  const filteredFeeds = feeds.filter(f =>
    // Only ACTUAL live streams belong in the live tab — an ended stream is a replay, not live.
    (f as any).status !== 'ENDED' && (f as any).status !== 'OFFLINE' &&
    (f.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
     f.ownerName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredArtists = liveArtists.filter(a =>
    a.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (a.liveStreamConfig?.title || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Replays = the various users' ENDED live streams (from live_feeds), newest first — a real, populated
  // list even before Mux archives finish processing. Attributed to and filterable BY user account.
  const [replayUser, setReplayUser] = useState<string>('ALL');
  const allEndedFeeds = feeds
    .filter(f => (f as any).status === 'ENDED')
    .sort((a, b) => (((b as any).endedAt || 0) as number) - (((a as any).endedAt || 0) as number));
  // Unique creators who have replays (ended streams + Mux archives), for the account filter.
  const replayOwners = (() => {
    const m = new Map<string, { id: string; name: string; photo?: string; count: number }>();
    allEndedFeeds.forEach(f => {
      const id = (f as any).ownerId || f.ownerName; if (!id) return;
      const e = m.get(id) || { id, name: f.ownerName || 'Creator', photo: (f as any).ownerPhoto, count: 0 }; e.count++; m.set(id, e);
    });
    archives.forEach(a => {
      const id = (a as any).ownerId || a.ownerName; if (!id) return;
      const e = m.get(id) || { id, name: a.ownerName || 'Creator', photo: undefined, count: 0 }; e.count++; m.set(id, e);
    });
    return Array.from(m.values()).sort((a, b) => b.count - a.count);
  })();
  const ownerKey = (o: any) => (o.ownerId || o.ownerName) as string;
  const endedFeedReplays = replayUser === 'ALL' ? allEndedFeeds : allEndedFeeds.filter(f => ownerKey(f) === replayUser);
  const filteredArchives = replayUser === 'ALL' ? archives : archives.filter(a => ownerKey(a) === replayUser);

  const handleFeelingLucky = () => {
    triggerAction('USE_FEELING_LUCKY');
    const allLive = [...feeds.filter(f => (f as any).status !== 'ENDED' && (f as any).status !== 'OFFLINE'), ...liveArtists.map(a => ({
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

  // Samsung-TV-Plus-style channel surface — the default Live Hub experience. Full-screen; the
  // classic tabbed hub (Streams/Events/Replays/Go Live) is one tap away via the grid button.
  if (activeTab === 'TV_PLUS') {
    return (
      <LiveTvPlus
        onBack={onBack}
        feeds={feeds}
        liveArtists={liveArtists}
        fastChannels={fastChannels}
        focusOwnerId={tuneOwnerId}
        onOpenClassic={() => setActiveTab('LIVE_TV')}
        onWatchWebrtc={(feed) => { if (feed) window.dispatchEvent(new CustomEvent('OPEN_LIVE_FEED', { detail: { feed } })); }}
      />
    );
  }

  return (
    <div className="w-full h-full flex flex-col pt-8 lg:pt-16 pb-24">
      <header className="px-8 lg:px-24 mb-12 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 shrink-0">
        <div className="flex items-start gap-8">
          <button onClick={onBack} className="p-4 bg-white/5 rounded-full text-primary hover:bg-white/10 transition-all mt-2 shrink-0">
            <ArrowLeft size={24} />
          </button>
          <div>
            <PageHeader textClassName="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Plajah Live Hub</PageHeader>
            {/* Platform Chip Rail treatment (components/ui/ChipRail).
                'Studio Streams' (STREAMS) is retired — kept in code, removed from the guide. */}
            <ChipRail
              items={[
                { id: 'TV_PLUS',  label: '📺 Live TV+'    },
                { id: 'LIVE_TV',  label: '📺 Guide'       },
                { id: 'SCIENCE',  label: '🔭 Science Live' },
                { id: 'EVENTS',   label: 'Live Events'    },
                { id: 'REPLAYS',  label: '▶ Replays'      },
              ]}
              activeId={activeTab}
              onSelect={(id) => setActiveTab(id as any)}
            />
          </div>
        </div>
        
        {activeTab === 'STREAMS' && (
          <div className="flex flex-wrap gap-4 items-center">
            {/* Every control in this row starts or produces a broadcast. On a television none of
                them can work — no camera, no capture, no way to run a show with a remote — so
                the whole creation row collapses and the Hub becomes what a TV actually wants it
                to be: a list of things to watch. */}
            {canGoLive() && (
              <>
                <button
                  onClick={() => setShowGoLiveWizard(true)}
                  className="flex items-center justify-center gap-3 px-8 py-4 bg-red-600 hover:bg-red-700 rounded-2xl font-black text-xs uppercase tracking-widest transition-all group"
                >
                  <div className="w-2 h-2 bg-white rounded-full animate-ping group-hover:animate-none" />
                  <Radio size={18} className="text-white" /> Go Live
                </button>
                <MobileGoLiveButton onClick={() => setShowMobileLive(true)} />
                {/* Smart Director — multi-camera auto-production for amateur sports */}
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('OPEN_SMART_DIRECTOR', { detail: {} }))}
                  className="flex items-center justify-center gap-3 px-8 py-4 bg-gradient-to-r from-[#FF8C00] to-[#D40055] hover:brightness-110 rounded-2xl font-black text-xs uppercase tracking-widest transition-all group"
                  title="Turn a sporting event into a professional multi-camera broadcast"
                >
                  <Tv size={18} className="text-white group-hover:scale-110 transition-transform" /> Smart Director
                </button>
              </>
            )}
            {/* Ambient presence — who else is in the Live Hub right now */}
            <PresenceBadge roomKey="livehub" verb="here now"
              className="inline-flex items-center gap-1.5 px-4 py-3 rounded-2xl bg-white/5 border border-white/10" />
            {onOpenTVStudio && canGoLive() && (
              <button
                onClick={onOpenTVStudio}
                className="flex items-center justify-center gap-3 px-8 py-4 bg-[#6B0099]/80 hover:bg-[#7d00b4] border border-[#6B0099] rounded-2xl font-black text-xs uppercase tracking-widest transition-all group"
              >
                <Tv size={18} className="text-white group-hover:scale-110 transition-transform" /> TV Studio
              </button>
            )}
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
                  {(feed as any).status === 'ENDED' ? (
                    <div className="px-4 py-2 bg-white/15 text-white text-[10px] font-black uppercase tracking-widest rounded-full flex items-center gap-2 shadow-lg backdrop-blur-md">
                      ▶ Replay
                    </div>
                  ) : (
                    <div className="px-4 py-2 bg-red-500 text-white text-[10px] font-black uppercase tracking-widest rounded-full flex items-center gap-2 shadow-lg">
                      <div className="w-2 h-2 bg-white rounded-full animate-ping" /> Live
                    </div>
                  )}
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
        
        {/* ── Science Live Tab ─────────────────────────────────────────── */}
        {activeTab === 'SCIENCE' && (
          <div className="px-8 lg:px-24 w-full max-w-7xl mx-auto pb-12 overflow-y-auto">
            {/* Category filter pills */}
            <div className="flex flex-wrap gap-2 mb-8 pt-2">
              <button
                onClick={() => setScienceCat('ALL')}
                className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${scienceCat === 'ALL' ? 'bg-[#00B4D8] text-white' : 'bg-white/5 text-white/40 hover:text-white border border-white/8'}`}
              >
                All Sources
              </button>
              {SCIENCE_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setScienceCat(cat.id)}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${scienceCat === cat.id ? 'text-white' : 'bg-white/5 text-white/40 hover:text-white border border-white/8'}`}
                  style={scienceCat === cat.id ? { backgroundColor: cat.accent } : {}}
                >
                  <span>{cat.emoji}</span> {cat.label}
                </button>
              ))}
            </div>

            {/* Per-category sections */}
            {(scienceCat === 'ALL' ? SCIENCE_CATEGORIES : SCIENCE_CATEGORIES.filter(c => c.id === scienceCat)).map(cat => {
              const streams = SCIENCE_STREAMS.filter(s => s.category === cat.id);
              if (!streams.length) return null;
              return (
                <div key={cat.id} className="mb-12">
                  <div className="flex items-center gap-3 mb-5">
                    <span className="text-2xl">{cat.emoji}</span>
                    <h2 className="text-sm font-black uppercase tracking-widest text-white">{cat.label}</h2>
                    <div className="h-px flex-1 bg-white/5" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {streams.map(stream => (
                      <div
                        key={stream.id}
                        className="group bg-theme-card border border-theme rounded-[2rem] overflow-hidden shadow-xl transition-all hover:scale-[1.01] cursor-pointer"
                        onClick={() => {
                          if (stream.isEmbeddable) {
                            setFullScreenFeed({ id: stream.id, title: stream.title, url: stream.embedUrl, ownerName: stream.source });
                          } else {
                            window.open(stream.directUrl, '_blank', 'noopener');
                          }
                        }}
                      >
                        {/* Preview area */}
                        <div className="relative aspect-video bg-black overflow-hidden">
                          {stream.isEmbeddable ? (
                            <HoverStreamPreview url={stream.embedUrl} mutedUrl={stream.embedUrl} />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-3"
                                 style={{ background: `linear-gradient(135deg, ${stream.accent}20, ${stream.accent}08)` }}>
                              <span className="text-5xl">{stream.emoji}</span>
                              <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Opens in new tab</p>
                            </div>
                          )}
                          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest text-white"
                               style={{ backgroundColor: stream.isLive ? '#dc2626' : `${stream.accent}cc` }}>
                            {stream.isLive && <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />}
                            {stream.isLive ? 'Live 24/7' : 'Event-based'}
                          </div>
                          {!stream.isEmbeddable && (
                            <div className="absolute top-3 right-3 p-1.5 bg-black/50 backdrop-blur rounded-full">
                              <ExternalLink size={11} className="text-white/60" />
                            </div>
                          )}
                        </div>
                        {/* Info */}
                        <div className="p-5">
                          <p className="text-[8px] font-black uppercase tracking-widest mb-1" style={{ color: stream.accent }}>
                            {stream.source}
                          </p>
                          <h3 className="font-black text-sm text-white mb-1 leading-tight">{stream.title}</h3>
                          <p className="text-[10px] text-white/35 leading-relaxed line-clamp-2">{stream.description}</p>
                          <div className="flex items-center gap-2 mt-3">
                            {stream.tags.slice(0, 3).map(tag => (
                              <span key={tag} className="px-2 py-0.5 bg-white/5 border border-white/8 rounded-full text-[7px] font-bold text-white/30 uppercase tracking-widest">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'LIVE_TV' && (
          <div className="absolute inset-0 pb-16">
            <PlajahEpgGuide feeds={feeds} fastChannels={fastChannels} onTune={tuneChannel} />
          </div>
        )}
        
        {activeTab === 'EVENTS' && (
          <div className="absolute inset-0 overflow-y-auto">
            <PPVEventsView onBack={() => {}} user={currentUser} onJoinPool={onJoinPool} isNested={true} />
          </div>
        )}

        {/* ── Replays ─────────────────────────────────────────────────────── */}
        {activeTab === 'REPLAYS' && (
          <div className="p-6 space-y-6">
            <div>
              <h2 className="text-2xl font-black uppercase tracking-tighter text-white">Past Broadcasts</h2>
              <p className="text-white/30 text-xs font-bold uppercase tracking-widest mt-1">Replays from ended live streams — filter by creator</p>
            </div>

            {/* Filter replays by user account */}
            {replayOwners.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setReplayUser('ALL')}
                  className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${replayUser === 'ALL' ? 'bg-small-orange text-black' : 'bg-white/5 text-white/40 hover:text-white border border-white/8'}`}>
                  All Creators
                </button>
                {replayOwners.map(o => (
                  <button key={o.id} onClick={() => setReplayUser(o.id)}
                    className={`flex items-center gap-2 pl-1.5 pr-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${replayUser === o.id ? 'bg-small-orange text-black' : 'bg-white/5 text-white/50 hover:text-white border border-white/8'}`}>
                    <span className="w-5 h-5 rounded-full overflow-hidden bg-white/10 shrink-0">
                      {o.photo ? <img src={o.photo} className="w-full h-full object-cover" alt="" /> : <User size={11} className="m-1 text-white/40" />}
                    </span>
                    {o.name} <span className="opacity-50">{o.count}</span>
                  </button>
                ))}
              </div>
            )}

            {archivesLoading && (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-[#6B0099]/30 border-t-[#6B0099] rounded-full animate-spin" />
              </div>
            )}

            {!archivesLoading && filteredArchives.length === 0 && endedFeedReplays.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-white/20">
                <PlayCircle size={40} strokeWidth={1.5} />
                <p className="text-sm font-black uppercase tracking-widest">No replays yet</p>
                <p className="text-xs text-center max-w-xs">Streams you end will appear here as rewatchable replays. Mux processes the recording for a few minutes after the stream ends.</p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {/* Users' ended live streams — the various creators' past broadcasts. */}
              {endedFeedReplays.map(f => {
                const rec = (f as any).recordingVideoId as string | undefined;
                const thumb = (f as any).thumbnailUrl || (f as any).ownerPhoto;
                const ended = (f as any).endedAt ? new Date((f as any).endedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
                const openReplay = () => {
                  if (rec) window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'RELLO', params: { videoId: rec } } }));
                  else if (f.url) setFullScreenFeed({ id: f.id, title: f.title, url: f.url, ownerName: f.ownerName });
                };
                return (
                  <div key={`fr_${f.id}`} className="group rounded-2xl overflow-hidden bg-white/5 border border-white/5 hover:border-white/15 transition-all cursor-pointer" onClick={openReplay}>
                    <div className="relative aspect-video bg-black overflow-hidden">
                      {/* Blanking fill: the full image (often a portrait-orientation profile
                          photo) is shown whole via object-contain, over a blurred copy of
                          itself filling the frame — no more cover-crop zooming into faces. */}
                      {thumb ? <>
                        <img src={thumb} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-50" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        <img src={thumb} alt={f.title} className="relative w-full h-full object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      </>
                        : <div className="w-full h-full flex items-center justify-center"><PlayCircle size={32} className="text-white/20" /></div>}
                      <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-white/15 backdrop-blur text-white text-[9px] font-black uppercase tracking-widest">▶ Replay</div>
                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors">
                        <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity scale-90 group-hover:scale-100"><Play size={20} fill="black" className="ml-1 text-black" /></div>
                      </div>
                    </div>
                    <div className="p-3 space-y-1">
                      <p className="text-sm font-black text-white truncate">{f.title}</p>
                      <div className="flex items-center gap-2 text-white/30 text-[10px]">
                        <span className="font-semibold">{f.ownerName}</span>
                        {ended && <><span>·</span><Clock size={9} /><span>{ended}</span></>}
                      </div>
                    </div>
                  </div>
                );
              })}
              {filteredArchives.map(archive => {
                const thumbUrl = archive.muxPlaybackId
                  ? `https://image.mux.com/${archive.muxPlaybackId}/thumbnail.jpg?width=640&time=5`
                  : null;
                const playUrl = archive.muxPlaybackId
                  ? `https://stream.mux.com/${archive.muxPlaybackId}.m3u8`
                  : null;
                const endedDate = archive.endedAt
                  ? new Date(archive.endedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  : '';
                const mins = Math.floor((archive.durationMs || 0) / 60000);
                const secs = Math.floor(((archive.durationMs || 0) % 60000) / 1000);
                const duration = archive.durationMs
                  ? `${mins}:${String(secs).padStart(2, '0')}`
                  : null;
                // Asset may still be processing if ended very recently (<10 min)
                const isProcessing = !archive.muxPlaybackId || (Date.now() - (archive.endedAt || 0) < 10 * 60 * 1000);

                return (
                  <div key={archive.id} className="group rounded-2xl overflow-hidden bg-white/5 border border-white/5 hover:border-white/15 transition-all">
                    {/* Thumbnail — blanking fill (contain over blurred self-fill), same as
                        the ended-stream cards, so no source ever gets a zoom-crop. */}
                    <div className="relative aspect-video bg-black overflow-hidden">
                      {thumbUrl ? (
                        <>
                          <img
                            src={thumbUrl}
                            alt=""
                            aria-hidden="true"
                            className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-50"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                          <img
                            src={thumbUrl}
                            alt={archive.title}
                            className="relative w-full h-full object-contain"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        </>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <PlayCircle size={32} className="text-white/20" />
                        </div>
                      )}

                      {/* Duration badge */}
                      {duration && (
                        <span className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/80 text-white text-[10px] font-mono rounded">
                          {duration}
                        </span>
                      )}

                      {/* Processing overlay */}
                      {isProcessing && !archive.muxPlaybackId && (
                        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2">
                          <div className="w-6 h-6 border-2 border-[#6B0099]/40 border-t-[#6B0099] rounded-full animate-spin" />
                          <span className="text-[9px] font-bold text-white/50 uppercase tracking-widest">Processing…</span>
                        </div>
                      )}

                      {/* Play overlay */}
                      {playUrl && !isProcessing && (
                        <a
                          href={playUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors"
                        >
                          <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity scale-90 group-hover:scale-100 transform">
                            <Play size={20} fill="black" className="ml-1 text-black" />
                          </div>
                        </a>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-3 space-y-1">
                      <p className="text-sm font-black text-white truncate">{archive.title}</p>
                      <div className="flex items-center gap-2 text-white/30 text-[10px]">
                        <span className="font-semibold">{archive.ownerName}</span>
                        <span>·</span>
                        <Clock size={9} />
                        <span>{endedDate}</span>
                      </div>
                      {isProcessing && archive.muxPlaybackId && (
                        <p className="text-[9px] text-yellow-400/60 font-bold uppercase tracking-wider">May still be processing</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>


      {showGoLiveWizard && (
        <GoLiveWizard
          onClose={() => setShowGoLiveWizard(false)}
          currentUser={currentUser}
        />
      )}
      {showMobileLive && (
        <MobileLiveStreamer
          mode="streamer"
          onClose={() => setShowMobileLive(false)}
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
