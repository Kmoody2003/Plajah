import React, { useState, useEffect } from 'react';
import { Video, VideoPlaylist, UserProfile, MovieMetadata, Album, LiveFeed } from '../types';
import { 
  fetchAllVideos, uploadVideo, fetchVideoPlaylists, fetchFollowedVideos, 
  fetchVideosByInterests, fetchUserVideos, auth, fetchAllPublicAlbums,
  publishToCloud, fetchAllLiveFeeds, fetchSystemSettingsConfig, fetchVideoPlaylistsByIds, fetchVideosByIds
} from '../services/backendService';
import { captureVideoFrame } from '../src/lib/videoUtils';
import { Play, Heart, MessageCircle, Share2, Plus, Search, Filter, MoreVertical, ListMusic, Upload, X, Check, Users, TrendingUp, Radio, Layout, Clock, Sparkles, Globe, Music2, BookOpen, Camera, Image as ImageIcon, Mic2, Film, Tv, List, Monitor, Settings2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';
import { useUpload } from '../contexts/UploadContext';
import FeaturedCarousel from './FeaturedCarousel';
import ThreeDImage from './ThreeDImage';
import YoutubeImportModal from './YoutubeImportModal';
import { LiveStreamModal } from './LiveStreamModal';

interface VideoTabProps {
  profile: UserProfile;
  isOwner: boolean;
  onSelectVideo?: (item: Video | Album) => void;
  mode?: 'VIDEOS' | 'MOVIES_TV';
}

const VideoTab: React.FC<VideoTabProps> = ({ profile, isOwner, onSelectVideo, mode = 'VIDEOS' }) => {
  const { playVideo } = useGlobalPlayerState();
  const { uploadFile } = useUpload();
  const [videos, setVideos] = useState<Video[]>([]);
  const [movies, setMovies] = useState<any[]>([]);
  const [tvSeries, setTvSeries] = useState<any[]>([]);
  const [userVideos, setUserVideos] = useState<Video[]>([]);
  const [followedVideos, setFollowedVideos] = useState<Video[]>([]);
  const [interestVideos, setInterestVideos] = useState<Video[]>([]);
  const [curatedVideoPlaylists, setCuratedVideoPlaylists] = useState<VideoPlaylist[]>([]);
  const [mustWatchMovies, setMustWatchMovies] = useState<Video[]>([]);
  const [playlists, setPlaylists] = useState<VideoPlaylist[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [showYoutubeImport, setShowYoutubeImport] = useState(false);
  const [showGoLiveModal, setShowGoLiveModal] = useState(false);
  const [isLiveStreamActive, setIsLiveStreamActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [activeCategory, setActiveCategory] = useState('All');
  const [activeSecondaryTab, setActiveSecondaryTab] = useState('Uploads');
  const [liveFeeds, setLiveFeeds] = useState<LiveFeed[]>([]);
  
  // Upload form state
  const [newVideo, setNewVideo] = useState<Partial<Video>>({
    title: '',
    description: '',
    genre: 'General',
    isPrivate: false,
    tags: [],
    subType: undefined
  });
  const [movieMetadata, setMovieMetadata] = useState<MovieMetadata>({
    cast: [],
    crew: [],
    trailerUrl: '',
    releaseYear: new Date().getFullYear(),
    specialFeatures: []
  });
  const [tvEpisodes, setTvEpisodes] = useState<{ title: string; file?: File; description: string; duration?: number; seasonNumber?: number; episodeNumber?: number }[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isCapturing, setIsCapturing] = useState(false);

  useEffect(() => {
    loadData();
  }, [profile.uid]);

  const loadData = async () => {
    const [vids, pls, uVids, allAlbums, settings] = await Promise.all([
      fetchAllVideos(),
      fetchVideoPlaylists(),
      fetchUserVideos(profile.uid),
      fetchAllPublicAlbums(),
      fetchSystemSettingsConfig()
    ]);
    fetchAllLiveFeeds(setLiveFeeds);
    setVideos(vids);
    setPlaylists(pls);
    setUserVideos(uVids);

    if (settings.curatedVideoPlaylists && settings.curatedVideoPlaylists.length > 0) {
      const curPls = await fetchVideoPlaylistsByIds(settings.curatedVideoPlaylists);
      setCuratedVideoPlaylists(curPls);
    }

    if (settings.mustWatchMovies && settings.mustWatchMovies.length > 0) {
      const curMovies = await fetchVideosByIds(settings.mustWatchMovies);
      setMustWatchMovies(curMovies);
    }
    
    // Filter movies and TV series from albums
    setMovies(allAlbums.filter(a => a.type === 'VIDEO' && a.subType === 'MOVIE'));
    setTvSeries(allAlbums.filter(a => a.type === 'VIDEO' && a.subType === 'TV_SERIES'));

    if (auth.currentUser) {
      const [followed, interested] = await Promise.all([
        fetchFollowedVideos(auth.currentUser.uid),
        fetchVideosByInterests(auth.currentUser.uid)
      ]);
      setFollowedVideos(followed);
      setInterestVideos(interested);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setUploading(true);
    try {
      if (newVideo.subType === 'MOVIE') {
        const albumId = `movie_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const albumData: any = {
          id: albumId,
          title: newVideo.title,
          artist: profile.displayName,
          type: 'VIDEO',
          subType: 'MOVIE',
          description: newVideo.description,
          genre: newVideo.genre,
          coverImage: '',
          coverFile: newVideo.coverImageFile,
          tracks: [{
            id: 'movie_track',
            title: newVideo.title,
            file: newVideo.file,
            duration: 0
          }],
          movieMetadata: {
            ...movieMetadata,
            specialFeatures: movieMetadata.specialFeatures?.map((f, i) => ({
              ...f,
              id: `sf_${i}`
            }))
          }
        };
        await publishToCloud(albumData, (status, percent) => {
          setUploadProgress(percent);
        });
      } else if (newVideo.subType === 'TV_SERIES') {
        const albumId = `tv_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const albumData: any = {
          id: albumId,
          title: newVideo.title,
          artist: profile.displayName,
          type: 'VIDEO',
          subType: 'TV_SERIES',
          description: newVideo.description,
          genre: newVideo.genre,
          coverImage: '',
          coverFile: newVideo.coverImageFile,
          seasons: [{
            seasonNumber: 1,
            episodes: tvEpisodes.map((ep, i) => ({
              id: `ep_${i}`,
              title: ep.title,
              description: ep.description,
              episodeNumber: ep.episodeNumber || (i + 1),
              file: ep.file
            }))
          }]
        };
        await publishToCloud(albumData, (status, percent) => {
          setUploadProgress(percent);
        });
      } else {
        // Standard Video Upload
        if (!newVideo.file) return;
        
        let finalThumb = newVideo.thumbnailFile;
        let finalCover = newVideo.coverImageFile;

        // Auto-generate if missing
        if (!finalThumb) {
          try {
            const blob = await captureVideoFrame(newVideo.file);
            finalThumb = new File([blob], 'thumb.jpg', { type: 'image/jpeg' });
          } catch (e) { console.error(e); }
        }
        if (!finalCover) {
          try {
            const blob = await captureVideoFrame(newVideo.file);
            finalCover = new File([blob], 'cover.jpg', { type: 'image/jpeg' });
          } catch (e) { console.error(e); }
        }

        await uploadVideo({ 
          ...newVideo, 
          thumbnailFile: finalThumb, 
          coverImageFile: finalCover 
        }, (p) => setUploadProgress(p));
      }
      
      setShowUpload(false);
      setNewVideo({ title: '', description: '', genre: 'General', isPrivate: false, tags: [] });
      setTvEpisodes([]);
      loadData();
    } catch (err) {
      console.error(err);
      alert('Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const addTag = () => {
    if (tagInput.trim() && !(newVideo.tags || []).includes(tagInput.trim())) {
      setNewVideo({ ...newVideo, tags: [...(newVideo.tags || []), tagInput.trim()] });
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setNewVideo({ ...newVideo, tags: (newVideo.tags || []).filter(t => t !== tag) });
  };

  const getAutoplayUrl = (url: string) => {
    if (!url) return '';
    try {
      const urlObj = new URL(url);
      urlObj.searchParams.set('autoplay', '1');
      urlObj.searchParams.set('mute', '1');
      // For YouTube, ensure it's the embed URL
      if (url.includes('youtube.com/watch')) {
        urlObj.pathname = urlObj.pathname.replace('/watch', '/embed');
      }
      return urlObj.toString();
    } catch (e) {
      return `${url.includes('?') ? url + '&' : url + '?'}autoplay=1&mute=1`;
    }
  };

  const categories = ['All', 'Music', 'Movies', 'TV Series', 'Gaming', 'Education', 'Vlogs', 'Live', 'Podcasts'];

  const filteredVideos = videos.filter(v => {
    if (mode === 'MOVIES_TV') return false;
    const matchesSearch = v.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         v.artist.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = activeCategory === 'All' || 
                           (activeCategory === 'Music' && v.genre === 'Music Video') ||
                           (activeCategory === 'Movies' && v.genre === 'Short Film') ||
                           (activeCategory === 'Live' && v.genre === 'Live') ||
                           v.genre === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const filteredMovies = movies.filter(m => {
    if (mode === 'VIDEOS') return false;
    return m.title.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const filteredTvSeries = tvSeries.filter(t => {
    if (mode === 'VIDEOS') return false;
    return t.title.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const trendingVideos = [...filteredVideos].sort((a, b) => (b.likesCount || 0) - (a.likesCount || 0)).slice(0, 6);
  const liveVideos = filteredVideos.filter(v => v.genre === 'Live' || v.isScheduled).slice(0, 6);
  const recentVideos = [...filteredVideos].sort((a, b) => b.timestamp - a.timestamp).slice(0, 6);

  const VideoRow = ({ title, icon: Icon, videos: rowVideos, emptyMessage, onSelect, isVertical = false, cardSize = 'large', className = '' }: { title: string, icon: any, videos: any[], emptyMessage: string, onSelect?: (item: any) => void, isVertical?: boolean, cardSize?: 'large' | 'small' | 'micro', className?: string }) => (
    <section className={`mb-16 last:mb-0 ${className}`}>
      <div className="flex items-center justify-between mb-8 px-2">
        <h2 className="text-lg font-black uppercase tracking-widest flex items-center gap-3">
          <Icon className="text-small-orange" size={20} /> {title}
        </h2>
        {rowVideos.length > 4 && (
          <button className="text-[9px] font-black uppercase tracking-widest text-white/20 hover:text-white transition-colors">View All</button>
        )}
      </div>
      {rowVideos.length > 0 ? (
        <div className="flex gap-4 lg:gap-8 overflow-x-auto pb-4 custom-scrollbar snap-x touch-pan-x -mx-2 px-2 lg:mx-0 lg:px-0">
          {rowVideos.map(item => (
            <motion.div 
              key={item.id}
              className={`${
                cardSize === 'micro' ? 'min-w-[50px] lg:min-w-[60px]' : 
                cardSize === 'small' ? 'min-w-[140px] lg:min-w-[160px]' : 
                isVertical ? 'min-w-[180px] lg:min-w-[240px]' : 
                'min-w-[260px] sm:min-w-[280px] lg:min-w-[320px]'
              } group cursor-pointer snap-start`}
              onClick={() => onSelect ? onSelect(item) : onSelectVideo?.(item)}
            >
              <div className={`relative ${cardSize === 'micro' ? 'aspect-[2/3] rounded-lg' : cardSize === 'small' ? 'aspect-[16/9]' : isVertical ? 'aspect-[2/3]' : 'aspect-video'} overflow-hidden mb-2 bg-white/5 ring-1 ring-white/5 shadow-xl ${cardSize !== 'micro' && 'rounded-2xl'}`}>
                <ThreeDImage src={item.thumbnailUrl || item.coverImage || `https://picsum.photos/seed/${item.id}/${cardSize === 'small' ? '300/170' : cardSize === 'micro' ? '150/225' : isVertical ? '600/900' : '800/450'}`} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt={item.title} />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center backdrop-blur-sm">
                  <div className={`${cardSize === 'micro' ? 'w-6 h-6' : 'w-10 h-10'} rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/20`}>
                    <Play fill="white" size={cardSize === 'micro' ? 10 : 16} className="ml-0.5" />
                  </div>
                </div>
                {(item.genre === 'Live' || item.isScheduled) && (
                  <div className="absolute top-2 left-2 px-2 py-1 bg-red-600 rounded-lg text-[7px] font-black uppercase tracking-widest flex items-center gap-1 shadow-xl">
                    <div className="w-1 h-1 rounded-full bg-white" /> Live
                  </div>
                )}
              </div>
              <div className="px-1">
                <h3 className={`font-black uppercase tracking-widest truncate text-white mb-0.5 ${cardSize === 'micro' ? 'text-[8px]' : 'text-[10px]'}`}>{item.title}</h3>
                {cardSize !== 'small' && cardSize !== 'micro' && (
                  <div className="flex items-center justify-between">
                    <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest truncate">{item.artist}</p>
                    <p className="text-[7px] font-black text-small-orange uppercase">{(item as any).playsCount || Math.floor(Math.random() * 10000)} views</p>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="py-12 bg-white/5 rounded-3xl border border-dashed border-white/10 text-center">
          <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">{emptyMessage}</p>
        </div>
      )}
    </section>
  );

  const LiveStreamRow = ({ title, icon: Icon, feeds, emptyMessage }: { title: string, icon: any, feeds: LiveFeed[], emptyMessage: string }) => {
    const [hoveredFeedId, setHoveredFeedId] = useState<string | null>(null);
    return (
      <section className="mb-16">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-xl font-black uppercase tracking-widest flex items-center gap-3">
            <Icon className="text-small-orange" size={24} /> {title}
          </h2>
        </div>
        {feeds.length > 0 ? (
          <div className="flex gap-6 overflow-x-auto pb-8 custom-scrollbar">
            {feeds.map(feed => (
              <div 
                key={feed.id} 
                className="min-w-[280px] lg:min-w-[320px] aspect-video rounded-3xl overflow-hidden bg-black relative group cursor-pointer shadow-2xl"
                onMouseEnter={() => setHoveredFeedId(feed.id)}
                onMouseLeave={() => setHoveredFeedId(null)}
                onClick={() => onSelectVideo?.(feed as any)}
              >
                {hoveredFeedId === feed.id ? (
                  <iframe 
                    src={getAutoplayUrl(feed.url)} 
                    className="w-full h-full" 
                    allow="autoplay; muted" 
                    allowFullScreen 
                  />
                ) : (
                  <div className="w-full h-full bg-white/5 flex flex-col items-center justify-center">
                    <Radio size={32} className="text-white/20 mb-4" />
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Live: {feed.title}</p>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                  <h3 className="text-[10px] font-black uppercase tracking-widest truncate">{feed.title}</h3>
                  <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest">{feed.ownerName}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-12 bg-white/5 rounded-3xl border border-dashed border-white/10 text-center">
            <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">{emptyMessage}</p>
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="flex-1 p-6 lg:p-12 max-w-7xl mx-auto w-full">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-12">
        <div>
          <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">
            {mode === 'MOVIES_TV' ? 'Cinema & Series' : 'Video Archive'}
          </h1>
          <p className="text-sm font-bold text-white/40 uppercase tracking-widest">
            {mode === 'MOVIES_TV' ? 'Premium Streaming Experience' : 'Discover & Share Visual Content'}
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-white transition-colors" size={16} />
            <input 
              type="text" 
              placeholder={mode === 'MOVIES_TV' ? "Search Cinema..." : "Search Videos..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-6 text-xs font-black uppercase tracking-widest outline-none focus:ring-2 ring-white/20 transition-all w-64 lg:w-80"
            />
          </div>
          {isOwner && (
            <div className="flex gap-2">
              <button 
                onClick={() => setShowGoLiveModal(true)}
                className={`flex items-center gap-3 px-6 py-3 rounded-2xl transition-all font-black text-[10px] uppercase tracking-widest shadow-xl ${isLiveStreamActive ? 'bg-green-600 text-white hover:bg-green-500' : 'bg-red-600 text-white hover:bg-red-500'}`}
              >
                <Radio size={16} /> {isLiveStreamActive ? 'Live Broadcasting' : 'Go Live'}
              </button>
              <button 
                onClick={() => setShowYoutubeImport(true)}
                className="flex items-center gap-3 px-6 py-3 bg-red-600 text-white rounded-2xl hover:bg-red-500 transition-all font-black text-[10px] uppercase tracking-widest shadow-xl"
              >
                <Plus size={16} /> YouTube Import
              </button>
              <button 
                onClick={() => setShowUpload(true)}
                className="flex items-center gap-3 px-6 py-3 bg-white text-black rounded-2xl hover:bg-small-orange hover:text-white transition-all font-black text-[10px] uppercase tracking-widest shadow-xl"
              >
                <Plus size={16} /> {mode === 'MOVIES_TV' ? 'Add Cinema' : 'Upload'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Featured Carousel */}
      <section className="mb-12">
        <FeaturedCarousel 
          items={(mode === 'MOVIES_TV' ? [...filteredMovies, ...filteredTvSeries] : videos).slice(0, 5).map(item => ({
            id: item.id,
            title: item.title,
            subtitle: (item as any).genre || (item as any).type,
            imageUrl: (item as any).thumbnailUrl || (item as any).coverImage || `https://picsum.photos/seed/${item.id}/1280/720`,
            videoUrl: (item as any).url || (item as any).trailerUrl,
            onClick: () => {
              if ((item as any).type === 'VIDEO') playVideo(item as any);
              onSelectVideo?.(item as any);
            }
          }))}
        />
      </section>

      {/* Curated Sections */}
      {mode === 'VIDEOS' && curatedVideoPlaylists.length > 0 && (
        <VideoRow 
          title="Staff Recommendation Playlists" 
          icon={Sparkles} 
          videos={curatedVideoPlaylists.map(pl => ({
            id: pl.id,
            ownerId: pl.ownerId,
            title: pl.title,
            artist: 'Curator',
            description: pl.description,
            coverImage: pl.thumbnailUrl || '',
            thumbnailUrl: pl.thumbnailUrl || '',
            type: 'VIDEO',
            subType: 'TV_SERIES',
            seasons: [{
               seasonNumber: 1,
               episodes: (pl.videos || []).map((v, i) => ({
                 id: v.id,
                 title: v.title,
                 description: '',
                 episodeNumber: i + 1,
                 url: v.url
               }))
            }],
            createdAt: pl.timestamp,
            isPublic: pl.isPublic
          }))} 
          emptyMessage="" 
          className="mb-12 px-6 lg:px-12"
        />
      )}

      {mode === 'MOVIES_TV' && mustWatchMovies.length > 0 && (
        <VideoRow 
          title="Must Watch Cinema" 
          icon={Monitor} 
          videos={mustWatchMovies} 
          emptyMessage="" 
          className="mb-12 px-6 lg:px-12"
        />
      )}

      {/* Categories Bar */}
      <div className="flex overflow-x-auto no-scrollbar gap-4 mb-12 pb-2">
        {categories.map(cat => (
          <button 
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`rounded-xl flex flex-col items-center justify-center p-3 sm:p-4 min-w-[70px] sm:min-w-[80px] aspect-square transition-all group border shrink-0 ${activeCategory === cat ? 'bg-small-orange border-small-orange shadow-lg shadow-small-orange/20' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
          >
            <div className={`p-1 rounded-lg group-hover:scale-110 transition-transform ${activeCategory === cat ? 'bg-white/20' : 'bg-white/5'}`}>
              <Layout size={16} className={activeCategory === cat ? 'text-white' : 'text-white/60'} />
            </div>
            <span className={`text-[8px] font-black uppercase tracking-widest ${activeCategory === cat ? 'text-white' : 'text-white/60'}`}>{cat}</span>
          </button>
        ))}
      </div>

      {/* Main Exploration Area */}
      <div className="flex flex-col lg:flex-row gap-8 min-w-0">
        {/* Vertical Tabs Sidebar */}
        <div className="flex lg:flex-col gap-2 overflow-x-auto no-scrollbar lg:w-48 lg:sticky lg:top-12 lg:h-fit shrink-0">
          {(isOwner ? ['Uploads', 'Lives', 'Playlist', 'History', 'Your channel', 'Shorts'] : ['Playlist', 'History', 'Your channel', 'Shorts']).map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveSecondaryTab(tab)}
              className={`px-4 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all text-left whitespace-nowrap shrink-0 ${activeSecondaryTab === tab ? 'bg-small-orange text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 min-w-0 space-y-12">
          {activeSecondaryTab === 'Lives' && (
             <div className="space-y-12">
               <section>
                 <div className="flex items-center justify-between mb-8">
                   <h2 className="text-2xl font-black uppercase tracking-widest flex items-center gap-3">
                     <Radio className="text-primary animate-pulse" /> Active Live Dashboard
                   </h2>
                   <button onClick={() => setShowGoLiveModal(true)} className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-2">
                      <Settings2 size={16} /> Broadcast Studio
                   </button>
                 </div>
                 {isLiveStreamActive ? (
                   <div className="p-8 bg-green-900/40 border border-green-500/50 rounded-3xl flex items-center gap-6">
                     <div className="w-4 h-4 bg-green-500 rounded-full animate-bounce" />
                     <div>
                       <h3 className="font-black uppercase tracking-widest">Broadcast is live</h3>
                       <p className="text-xs opacity-60">You are currently broadcasting. You can manage your stream from the Broadcast Studio.</p>
                     </div>
                   </div>
                 ) : (
                   <div className="p-12 border border-dashed border-white/10 bg-black/20 rounded-3xl text-center">
                     <Monitor size={48} className="mx-auto mb-4 opacity-20" />
                     <h3 className="font-black uppercase tracking-widest opacity-60 mb-2">You are currently offline</h3>
                     <button onClick={() => setShowGoLiveModal(true)} className="mt-4 px-8 py-3 bg-primary text-black rounded-full font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-transform">
                        Start Broadcast
                     </button>
                   </div>
                 )}
               </section>
               <VideoRow title="Past Live Streams" icon={Radio} videos={userVideos.filter(v => v.genre === 'Live')} emptyMessage="No past broadcasts found." />
             </div>
          )}

          {activeSecondaryTab === 'Uploads' && (
            <div className="space-y-16">
              <section>
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-xl font-black uppercase tracking-widest flex items-center gap-3">
                    <Film className="text-small-orange" size={24} /> Video Gallery
                  </h2>
                  <div className="flex items-center gap-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/20">
                      {userVideos.length} Uploads
                    </p>
                  </div>
                </div>
                
                {userVideos.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                    {userVideos.map((video, idx) => (
                      <motion.div 
                        key={video.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className="group cursor-pointer"
                        onClick={() => onSelectVideo?.(video)}
                      >
                        <div className="relative aspect-video rounded-[2.5rem] overflow-hidden mb-6 bg-white/5 ring-1 ring-white/10 group-hover:ring-small-orange/50 transition-all group-hover:shadow-[0_0_50px_rgba(255,140,0,0.15)] group-hover:-translate-y-2">
                          <ThreeDImage 
                            src={video.thumbnailUrl || `https://picsum.photos/seed/${video.id}/800/450`} 
                            className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" 
                            alt={video.title} 
                          />
                          
                          {/* Hover Overlay */}
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all duration-500 flex items-center justify-center backdrop-blur-[2px]">
                            <motion.div 
                              initial={{ scale: 0.8, opacity: 0 }}
                              whileHover={{ scale: 1.1 }}
                              className="w-16 h-16 rounded-full bg-white flex items-center justify-center text-black shadow-2xl"
                            >
                              <Play fill="currentColor" size={24} className="ml-1" />
                            </motion.div>
                          </div>

                          {/* Stats Badge */}
                          <div className="absolute bottom-4 right-4 flex items-center gap-2">
                            <span className="px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-[8px] font-black uppercase tracking-[0.2em] text-white/90 border border-white/10">
                              {video.playsCount || 0} Views
                            </span>
                          </div>

                          {/* Genre Tag */}
                          {video.genre && (
                            <div className="absolute top-4 left-4">
                              <span className="px-3 py-1 bg-small-orange text-white text-[7px] font-black uppercase tracking-[0.3em] rounded-full shadow-lg">
                                {video.genre}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="px-2">
                          <div className="flex items-start justify-between gap-4 mb-2">
                            <h3 className="text-sm font-black uppercase tracking-widest text-white leading-tight group-hover:text-small-orange transition-colors truncate">
                              {video.title}
                            </h3>
                            <button className="p-2 text-white/20 hover:text-white transition-colors">
                              <MoreVertical size={16} />
                            </button>
                          </div>
                          
                          <div className="flex items-center gap-4 text-[9px] font-bold text-white/30 uppercase tracking-widest">
                            <div className="flex items-center gap-1.5">
                              <Clock size={12} className="text-small-orange" />
                              {new Date(video.timestamp || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                            <div className="w-1 h-1 rounded-full bg-white/10" />
                            <div className="flex items-center gap-1.5">
                              <Heart size={12} />
                              {video.likesCount || 0}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="py-32 bg-white/[0.02] border-2 border-dashed border-white/5 rounded-[4rem] text-center flex flex-col items-center justify-center">
                    <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mb-8">
                      <Film size={40} className="text-white/10" />
                    </div>
                    <h3 className="text-xl font-black uppercase tracking-widest mb-4">No content detected</h3>
                    <p className="text-[10px] font-bold text-white/20 uppercase tracking-[0.4em] mb-10 max-w-xs leading-relaxed">
                      This user's archive is currently offline or waiting for content uplink.
                    </p>
                    {isOwner && (
                      <button 
                        onClick={() => setShowUpload(true)}
                        className="px-12 py-5 bg-white text-black rounded-full font-black text-xs uppercase tracking-widest hover:scale-110 active:scale-95 transition-all shadow-2xl"
                      >
                        Initiate Upload
                      </button>
                    )}
                  </div>
                )}
              </section>

              {/* Keep other valuable discovery sections below */}
              {followedVideos.length > 0 && (
                <VideoRow title="From Your Network" icon={Users} videos={followedVideos} emptyMessage="" cardSize="small" />
              )}
              {trendingVideos.length > 0 && (
                <VideoRow title="Hyperlink Trending" icon={TrendingUp} videos={trendingVideos} emptyMessage="" />
              )}
            </div>
          )}
          {activeSecondaryTab === 'Playlist' && (
              <VideoRow title="My Playlists" icon={ListMusic} videos={playlists} emptyMessage="No playlists found" />
          )}
          {activeSecondaryTab === 'Your channel' && (
            <div className="space-y-12">
              <section>
                <h2 className="text-xl font-black uppercase tracking-widest mb-10 flex items-center gap-3">
                  <Film className="text-small-orange" size={24} /> Channel Archive
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                  {userVideos.map(video => (
                    <motion.div 
                      key={video.id} 
                      whileHover={{ y: -5 }}
                      className="bg-white/5 border border-white/10 rounded-[2.5rem] p-4 hover:bg-white/10 transition-all cursor-pointer group" 
                      onClick={() => onSelectVideo?.(video)}
                    >
                      <div className="relative aspect-video rounded-3xl overflow-hidden mb-4 bg-black">
                        <ThreeDImage src={video.thumbnailUrl || `https://picsum.photos/seed/${video.id}/800/450`} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt={video.title} />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Play fill="white" size={24} />
                        </div>
                      </div>
                      <div className="px-2 pb-2">
                        <h3 className="text-xs font-black uppercase tracking-widest truncate text-white mb-2">{video.title}</h3>
                        <div className="flex items-center justify-between">
                          <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest">{video.playsCount || 0} views</p>
                          <div className="flex items-center gap-2">
                            <Heart size={10} className="text-white/20" />
                            <MessageCircle size={10} className="text-white/20" />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                  {userVideos.length === 0 && (
                    <div className="col-span-full py-20 text-center bg-white/5 rounded-[3rem] border border-dashed border-white/10">
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/20">Archive is empty</p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}
          {['History', 'Shorts'].includes(activeSecondaryTab) && (
            <div className="py-20 text-center bg-white/5 rounded-3xl">
              <p className="text-white/20 font-black uppercase tracking-widest">{activeSecondaryTab} content coming soon</p>
            </div>
          )}
        </div>
      </div>
      
      {/* Categories Section */}
      <VideoRow title="For You" icon={Sparkles} videos={interestVideos} emptyMessage="Set your interests in your profile for better recommendations" />
      <VideoRow title="Recent Uploads" icon={Clock} videos={recentVideos} emptyMessage="No recent uploads" />
      
      {/* Global Latest Section */}
      <section className="mb-16">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-xl font-black uppercase tracking-widest flex items-center gap-3">
            <Globe className="text-small-orange" size={24} /> Global Latest
          </h2>
        </div>
        <div className="bg-gradient-to-br from-white/5 to-transparent p-8 lg:p-12 rounded-[3rem] border border-white/5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {interestVideos[0] ? (
              <>
                <div className="relative aspect-video rounded-[2.5rem] overflow-hidden shadow-3xl group cursor-pointer" onClick={() => onSelectVideo(interestVideos[0])}>
                  <img src={interestVideos[0].thumbnailUrl || `https://picsum.photos/seed/${interestVideos[0].id}/1280/720`} className="w-full h-full object-cover" alt="Latest" loading="lazy" decoding="async" />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                    <div className="w-20 h-20 rounded-full bg-white text-black flex items-center justify-center">
                      <Play fill="black" size={32} />
                    </div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <span className="px-3 py-1 bg-small-orange text-white text-[8px] font-black uppercase tracking-widest rounded-full">New Release</span>
                    <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Based on your interests</span>
                  </div>
                  <h3 className="text-4xl lg:text-6xl font-display font-black tracking-tightest uppercase mb-6">{interestVideos[0].title}</h3>
                  <p className="text-white/40 text-sm leading-relaxed mb-8 max-w-md">{interestVideos[0].description || "Experience the latest global release tailored to your unique taste and interests."}</p>
                  <div className="flex items-center gap-6">
                    <button onClick={() => onSelectVideo(interestVideos[0])} className="px-10 py-4 bg-white text-black rounded-full font-black text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-xl">Watch Now</button>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-white/10" />
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest">{interestVideos[0].artist}</p>
                        <p className="text-[8px] font-bold text-white/20 uppercase tracking-widest">Official Artist</p>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="col-span-full py-20 text-center opacity-20">
                <Globe size={64} className="mx-auto mb-6" />
                <p className="text-xs font-black uppercase tracking-widest">No global releases found</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Upload Modal */}
      <AnimatePresence>
        {showUpload && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-2xl z-[200] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="max-w-4xl w-full bg-[#0a0a0a] border border-white/10 rounded-[3rem] overflow-hidden shadow-3xl"
            >
              <div className="p-8 lg:p-12">
                <div className="flex items-center justify-between mb-10">
                  <div>
                    <h2 className="text-3xl font-display font-black tracking-tight uppercase mb-2">Upload Video</h2>
                    <p className="text-white/40 text-[10px] font-black uppercase tracking-widest">Share your vision with the world</p>
                  </div>
                  <button onClick={() => !uploading && setShowUpload(false)} className="p-4 bg-white/5 rounded-full text-white/40 hover:text-white transition-all">
                    <X size={24} />
                  </button>
                </div>

                <form onSubmit={handleUpload} className="space-y-8">
                  <div className="flex flex-wrap gap-4 mb-8 p-4 bg-white/5 rounded-2xl border border-white/5">
                    {(['VIDEO', 'MOVIE', 'TV_SERIES'] as const).map(type => (
                      <button 
                        key={type}
                        type="button"
                        onClick={() => setNewVideo({ ...newVideo, subType: type === 'VIDEO' ? undefined : type as any })}
                        className={`px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all border ${
                          (type === 'VIDEO' && !newVideo.subType) || (newVideo.subType === type)
                            ? 'bg-white text-black border-white shadow-lg' 
                            : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'
                        }`}
                      >
                        {type.replace('_', ' ')}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                    <div className="space-y-6">
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 ml-2">Title</label>
                        <input 
                          type="text" 
                          required
                          value={newVideo.title}
                          onChange={(e) => setNewVideo({ ...newVideo, title: e.target.value })}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 text-sm font-bold outline-none focus:ring-2 ring-white/20 transition-all"
                          placeholder={newVideo.subType === 'MOVIE' ? "Movie Title" : newVideo.subType === 'TV_SERIES' ? "Series Title" : "Video Title"}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 ml-2">Description</label>
                        <textarea 
                          rows={4}
                          value={newVideo.description}
                          onChange={(e) => setNewVideo({ ...newVideo, description: e.target.value })}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 text-sm font-bold outline-none focus:ring-2 ring-white/20 transition-all resize-none"
                          placeholder="What's this about?"
                        />
                      </div>

                      {newVideo.subType === 'MOVIE' && (
                        <div className="p-6 bg-white/5 rounded-3xl border border-white/10 space-y-6 animate-in fade-in slide-in-from-top-4">
                          <h3 className="text-xs font-black uppercase tracking-widest text-white">Movie Details</h3>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-[8px] font-black uppercase tracking-widest text-white/20 mb-2">Release Year</label>
                              <input 
                                type="number" 
                                value={movieMetadata.releaseYear}
                                onChange={(e) => setMovieMetadata({ ...movieMetadata, releaseYear: parseInt(e.target.value) })}
                                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs font-bold outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[8px] font-black uppercase tracking-widest text-white/20 mb-2">Trailer URL</label>
                              <input 
                                type="url" 
                                value={movieMetadata.trailerUrl}
                                onChange={(e) => setMovieMetadata({ ...movieMetadata, trailerUrl: e.target.value })}
                                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs font-bold outline-none"
                                placeholder="YouTube/Vimeo"
                              />
                            </div>
                          </div>

                          {/* Special Features */}
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <label className="text-[8px] font-black uppercase tracking-widest text-white/20">Special Features</label>
                              <button 
                                type="button" 
                                onClick={() => setMovieMetadata({
                                  ...movieMetadata,
                                  specialFeatures: [...(movieMetadata.specialFeatures || []), { id: Math.random().toString(36).substring(7), title: '', url: '', type: 'BEHIND_THE_SCENES' }]
                                })}
                                className="text-[8px] font-black text-small-orange uppercase tracking-widest"
                              >
                                + Add Feature
                              </button>
                            </div>
                            {movieMetadata.specialFeatures?.map((feature, idx) => (
                              <div key={idx} className="grid grid-cols-2 gap-2 p-3 bg-black/20 rounded-xl border border-white/5">
                                <input 
                                  placeholder="Feature Title"
                                  value={feature.title}
                                  onChange={(e) => {
                                    const newFeatures = [...(movieMetadata.specialFeatures || [])];
                                    newFeatures[idx].title = e.target.value;
                                    setMovieMetadata({ ...movieMetadata, specialFeatures: newFeatures });
                                  }}
                                  className="bg-transparent text-[10px] font-bold outline-none"
                                />
                                <input 
                                  placeholder="Video URL"
                                  value={feature.url}
                                  onChange={(e) => {
                                    const newFeatures = [...(movieMetadata.specialFeatures || [])];
                                    newFeatures[idx].url = e.target.value;
                                    setMovieMetadata({ ...movieMetadata, specialFeatures: newFeatures });
                                  }}
                                  className="bg-transparent text-[10px] font-bold outline-none"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {newVideo.subType === 'TV_SERIES' && (
                        <div className="p-6 bg-white/5 rounded-3xl border border-white/10 space-y-6 animate-in fade-in slide-in-from-top-4">
                          <div className="flex items-center justify-between">
                            <h3 className="text-xs font-black uppercase tracking-widest text-white">Episodes Batch</h3>
                            <button 
                              type="button" 
                              onClick={() => setTvEpisodes([...tvEpisodes, { title: `Episode ${tvEpisodes.length + 1}`, description: '' }])}
                              className="p-2 bg-white/10 rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-white/20"
                            >
                              Add Episode
                            </button>
                          </div>
                          <div className="space-y-4 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                            {tvEpisodes.map((ep, idx) => (
                              <div key={idx} className="p-4 bg-black/40 rounded-2xl border border-white/5 space-y-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex-1 mr-4">
                                    <input 
                                      type="text" 
                                      value={ep.title}
                                      onChange={(e) => {
                                        const newEps = [...tvEpisodes];
                                        newEps[idx].title = e.target.value;
                                        setTvEpisodes(newEps);
                                      }}
                                      className="bg-transparent border-none text-[10px] font-black uppercase tracking-widest text-white outline-none w-full"
                                      placeholder="Episode Title"
                                    />
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <input 
                                      type="number"
                                      placeholder="Ep #"
                                      value={ep.episodeNumber}
                                      onChange={(e) => {
                                        const newEps = [...tvEpisodes];
                                        newEps[idx].episodeNumber = parseInt(e.target.value);
                                        setTvEpisodes(newEps);
                                      }}
                                      className="w-12 bg-white/5 border border-white/10 rounded-lg p-1 text-[8px] font-bold text-center"
                                    />
                                    <button type="button" onClick={() => setTvEpisodes(tvEpisodes.filter((_, i) => i !== idx))} className="text-white/20 hover:text-red-500"><X size={14} /></button>
                                  </div>
                                </div>
                                <textarea 
                                  placeholder="Episode Description"
                                  value={ep.description}
                                  onChange={(e) => {
                                    const newEps = [...tvEpisodes];
                                    newEps[idx].description = e.target.value;
                                    setTvEpisodes(newEps);
                                  }}
                                  className="w-full bg-white/5 border border-white/10 rounded-xl p-2 text-[9px] font-medium outline-none resize-none"
                                  rows={2}
                                />
                                <div className="flex gap-3">
                                  <label className="flex-1 p-3 bg-white/5 border border-dashed border-white/10 rounded-xl cursor-pointer hover:bg-white/10 text-center">
                                    <span className="text-[8px] font-black uppercase tracking-widest text-white/40">{ep.file ? ep.file.name : 'Select File'}</span>
                                    <input type="file" className="hidden" accept="video/*" onChange={(e) => {
                                      const newEps = [...tvEpisodes];
                                      newEps[idx].file = e.target.files?.[0];
                                      setTvEpisodes(newEps);
                                    }} />
                                  </label>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 ml-2">Tags (Searchability)</label>
                        <div className="flex gap-2 mb-4">
                          <input 
                            type="text" 
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                            className="flex-1 bg-white/5 border border-white/10 rounded-2xl p-4 text-sm font-bold outline-none focus:ring-2 ring-white/20 transition-all"
                            placeholder="Add a tag..."
                          />
                          <button type="button" onClick={addTag} className="px-6 bg-white text-black rounded-2xl font-black text-[10px] uppercase tracking-widest">Add</button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {(newVideo.tags || []).map(tag => (
                            <span key={tag} className="px-3 py-1.5 bg-white/10 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-2">
                              {tag}
                              <button type="button" onClick={() => removeTag(tag)} className="text-white/40 hover:text-white"><X size={10} /></button>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="relative aspect-video bg-white/5 border-2 border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center group hover:border-white/20 transition-all overflow-hidden">
                        {newVideo.file ? (
                          <div className="absolute inset-0 flex flex-col items-center justify-center bg-green-500/10">
                            <Check size={48} className="text-green-500 mb-4" />
                            <p className="text-[10px] font-black uppercase tracking-widest text-green-500">{newVideo.file.name}</p>
                            <button 
                              type="button"
                              onClick={() => setNewVideo({ ...newVideo, file: undefined })}
                              className="mt-4 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white"
                            >
                              Change File
                            </button>
                          </div>
                        ) : (
                          <>
                            <Upload size={32} className="text-white/20 group-hover:text-white transition-colors mb-4" />
                            <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Select Main Video File</p>
                            <input 
                              type="file" 
                              accept="video/*"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) setNewVideo({ ...newVideo, file });
                              }}
                              className="absolute inset-0 opacity-0 cursor-pointer"
                            />
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 ml-2">Genre</label>
                          <select 
                            value={newVideo.genre}
                            onChange={(e) => setNewVideo({ ...newVideo, genre: e.target.value })}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 text-sm font-bold outline-none focus:ring-2 ring-white/20 transition-all appearance-none"
                          >
                            <option value="General" className="bg-[#0a0a0a]">General</option>
                            <option value="Music Video" className="bg-[#0a0a0a]">Music Video</option>
                            <option value="Short Film" className="bg-[#0a0a0a]">Short Film</option>
                            <option value="Tutorial" className="bg-[#0a0a0a]">Tutorial</option>
                            <option value="Vlog" className="bg-[#0a0a0a]">Vlog</option>
                            <option value="Live" className="bg-[#0a0a0a]">Live Stream</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <label className="flex flex-col gap-2 p-4 bg-white/5 border border-dashed border-white/10 rounded-2xl cursor-pointer hover:bg-white/10 transition-all">
                          <div className="flex items-center gap-2">
                            <ImageIcon size={14} className="text-white/40" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Thumbnail</span>
                          </div>
                          <span className="text-[8px] font-bold text-white/20 truncate">{newVideo.thumbnailFile ? newVideo.thumbnailFile.name : 'Upload (Optional)'}</span>
                          <input type="file" className="hidden" accept="image/*" onChange={(e) => setNewVideo({ ...newVideo, thumbnailFile: e.target.files?.[0] })} />
                        </label>
                        <label className="flex flex-col gap-2 p-4 bg-white/5 border border-dashed border-white/10 rounded-2xl cursor-pointer hover:bg-white/10 transition-all">
                          <div className="flex items-center gap-2">
                            <ImageIcon size={14} className="text-white/40" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Cover Image</span>
                          </div>
                          <span className="text-[8px] font-bold text-white/20 truncate">{newVideo.coverImageFile ? newVideo.coverImageFile.name : 'Upload (Optional)'}</span>
                          <input type="file" className="hidden" accept="image/*" onChange={(e) => setNewVideo({ ...newVideo, coverImageFile: e.target.files?.[0] })} />
                        </label>
                      </div>

                      <button 
                        type="button"
                        disabled={!newVideo.file || isCapturing}
                        onClick={async () => {
                          if (!newVideo.file) return;
                          setIsCapturing(true);
                          try {
                            const thumbBlob = await captureVideoFrame(newVideo.file);
                            const thumbFile = new File([thumbBlob], 'thumb.jpg', { type: 'image/jpeg' });
                            
                            const coverBlob = await captureVideoFrame(newVideo.file);
                            const coverFile = new File([coverBlob], 'cover.jpg', { type: 'image/jpeg' });
                            
                            setNewVideo({ ...newVideo, thumbnailFile: thumbFile, coverImageFile: coverFile });
                          } catch (err) {
                            console.error("Capture failed:", err);
                          } finally {
                            setIsCapturing(false);
                          }
                        }}
                        className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center gap-3 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all disabled:opacity-30"
                      >
                        <Camera size={18} /> {isCapturing ? 'Capturing...' : 'Auto-generate Visuals'}
                      </button>
                    </div>
                  </div>

                  <div className="pt-8 border-t border-white/5">
                    {uploading ? (
                      <div className="space-y-4">
                        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                          <motion.div 
                            className="h-full bg-gradient-to-r from-[#6B0099] to-[#FF8C00]"
                            initial={{ width: 0 }}
                            animate={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                        <p className="text-center text-[10px] font-black uppercase tracking-[0.3em] text-small-orange animate-pulse">
                          Uplinking to Global Archive... {Math.round(uploadProgress)}%
                        </p>
                        <button 
                          type="button" 
                          onClick={() => setShowUpload(false)}
                          className="w-full py-3 bg-white/5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white"
                        >
                          Minimize to Background
                        </button>
                      </div>
                    ) : (
                      <button 
                        type="submit"
                        className="w-full py-6 bg-white text-black rounded-[2rem] font-black text-xs uppercase tracking-[0.3em] hover:scale-[1.02] transition-all active:scale-95 shadow-2xl"
                      >
                        Deploy to Cloud
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {showYoutubeImport && (
        <YoutubeImportModal 
           onClose={() => setShowYoutubeImport(false)} 
           onImported={() => {
              setShowYoutubeImport(false);
              loadData();
           }} 
        />
      )}

      {showGoLiveModal && (
        <LiveStreamModal onClose={() => setShowGoLiveModal(false)} onStreamActive={setIsLiveStreamActive} />
      )}
    </div>
  );
};

export default VideoTab;
