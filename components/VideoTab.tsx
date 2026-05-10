import React, { useState, useEffect, useMemo } from 'react';
import { Video, VideoPlaylist, UserProfile, MovieMetadata, Album, LiveFeed, Track } from '../types';
import {
  fetchAllVideos, uploadVideo, fetchVideoPlaylists, fetchFollowedVideos,
  fetchVideosByInterests, fetchUserVideos, auth, fetchAllPublicAlbums,
  publishToCloud, fetchAllLiveFeeds, fetchSystemSettingsConfig, fetchVideoPlaylistsByIds,
  fetchVideosByIds, fetchUserWorlds
} from '../services/backendService';
import { captureVideoFrame } from '../src/lib/videoUtils';
import {
  Play, Heart, MessageCircle, Share2, Plus, Search, Upload, X, Check, Users,
  TrendingUp, Radio, Clock, Sparkles, Globe, Music2, Camera, Image as ImageIcon,
  Film, Tv, Monitor, Settings2, ChevronRight, MoreVertical, Mic2, Gamepad2,
  BookOpen, List, Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';
import { useUpload } from '../contexts/UploadContext';
import FeaturedCarousel from './FeaturedCarousel';
import ThreeDImage from './ThreeDImage';
import YoutubeImportModal from './YoutubeImportModal';
import { LiveStreamModal } from './LiveStreamModal';
import CommentSection from './CommentSection';

interface VideoTabProps {
  profile: UserProfile | null;
  isOwner: boolean;
  onSelectVideo?: (item: Video | Album) => void;
  mode?: 'VIDEOS' | 'MOVIES_TV';
}

const CATEGORIES = [
  { id: 'All', label: 'All', icon: Sparkles },
  { id: 'Music Video', label: 'Music Videos', icon: Music2 },
  { id: 'Short Film', label: 'Short Films', icon: Film },
  { id: 'Movie', label: 'Movies', icon: Monitor },
  { id: 'TV Series', label: 'TV Series', icon: Tv },
  { id: 'Gaming', label: 'Gaming', icon: Gamepad2 },
  { id: 'Education', label: 'Education', icon: BookOpen },
  { id: 'Vlog', label: 'Vlogs', icon: Camera },
  { id: 'Live', label: 'Live', icon: Radio },
  { id: 'Podcasts', label: 'Podcasts', icon: Mic2 },
];

function timeAgo(ts: number) {
  const d = Date.now() - ts;
  if (d < 60000) return 'just now';
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
  if (d < 2592000000) return `${Math.floor(d / 86400000)}d ago`;
  return `${Math.floor(d / 2592000000)}mo ago`;
}

// ── Video Card ────────────────────────────────────────────────────────────────
const VideoCard: React.FC<{
  video: Video | Album | any;
  onPlay: () => void;
  size?: 'default' | 'small' | 'wide';
  showChannel?: boolean;
}> = ({ video, onPlay, size = 'default', showChannel = true }) => {
  const thumb = (video as any).thumbnailUrl || (video as any).coverImage || `https://picsum.photos/seed/${video.id}/800/450`;
  const isLive = (video as any).genre === 'Live';
  const isMV = (video as any).genre === 'Music Video' || (video as any).category === 'MUSIC_VIDEO';

  return (
    <motion.div
      whileHover={{ y: -4 }}
      className="group cursor-pointer"
      onClick={onPlay}
    >
      {/* Thumbnail */}
      <div className={`relative overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/5 mb-3 ${
        size === 'wide' ? 'aspect-[16/7]' : 'aspect-video'
      }`}>
        <ThreeDImage
          src={thumb}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          alt={video.title}
        />
        {/* Hover glass overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-300 flex items-center justify-center backdrop-blur-0 group-hover:backdrop-blur-[1px]">
          <div className="w-12 h-12 rounded-full bg-white/0 group-hover:bg-white/20 border-2 border-white/0 group-hover:border-white/60 flex items-center justify-center transition-all duration-300 scale-75 group-hover:scale-100">
            <Play fill="white" size={18} className="ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
        {/* Badges */}
        {isLive && (
          <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 px-2.5 py-1 bg-red-600 rounded-lg text-[8px] font-black uppercase tracking-widest shadow-xl">
            <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Live
          </div>
        )}
        {isMV && !isLive && (
          <div className="absolute top-2.5 left-2.5 px-2.5 py-1 bg-small-orange/90 backdrop-blur-md rounded-lg text-[8px] font-black uppercase tracking-widest shadow-xl">
            MV
          </div>
        )}
        {/* Duration / views pill */}
        <div className="absolute bottom-2.5 right-2.5 px-2 py-1 bg-black/70 backdrop-blur-md rounded-md text-[8px] font-black tracking-widest text-white/80">
          {(video as any).playsCount ? `${(video as any).playsCount}` : '—'} views
        </div>
      </div>

      {/* Info */}
      <div className="flex gap-3">
        {showChannel && (
          <div className="w-8 h-8 rounded-full bg-white/10 shrink-0 mt-0.5 overflow-hidden ring-1 ring-white/10">
            <img src={(video as any).ownerPhoto || `https://picsum.photos/seed/${(video as any).ownerId}/64/64`} alt="" className="w-full h-full object-cover" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-[11px] font-black uppercase tracking-widest text-white leading-tight mb-1 line-clamp-2 group-hover:text-small-orange transition-colors">
            {video.title}
          </h3>
          <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest truncate">
            {(video as any).artist || (video as any).ownerName || 'Creator'}
          </p>
          <div className="flex items-center gap-2 mt-1 text-[8px] font-bold text-white/25 uppercase tracking-widest">
            <span>{timeAgo((video as any).timestamp || (video as any).createdAt || Date.now())}</span>
            {(video as any).genre && <><span>·</span><span>{(video as any).genre}</span></>}
          </div>
        </div>
        <button className="p-1 text-white/20 hover:text-white transition-colors opacity-0 group-hover:opacity-100 shrink-0">
          <MoreVertical size={14} />
        </button>
      </div>
    </motion.div>
  );
};

// ── Section Row ───────────────────────────────────────────────────────────────
const VideoRow: React.FC<{
  title: string;
  icon: React.ComponentType<any>;
  videos: any[];
  emptyMessage?: string;
  onSelect?: (item: any) => void;
  size?: 'default' | 'small';
}> = ({ title, icon: Icon, videos, emptyMessage, onSelect, size = 'default' }) => (
  <section className="mb-14">
    <div className="flex items-center justify-between mb-5">
      <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2.5">
        <Icon className="text-small-orange" size={16} /> {title}
      </h2>
      {videos.length > 5 && (
        <button className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-white transition-colors">
          View All <ChevronRight size={12} />
        </button>
      )}
    </div>
    {videos.length > 0 ? (
      <div className={`flex gap-5 overflow-x-auto pb-3 custom-scrollbar snap-x -mx-1 px-1`}>
        {videos.slice(0, 8).map(item => (
          <div
            key={item.id}
            className={`shrink-0 snap-start ${size === 'small' ? 'w-48' : 'w-72 lg:w-80'}`}
          >
            <VideoCard video={item} onPlay={() => onSelect?.(item)} size="default" />
          </div>
        ))}
      </div>
    ) : emptyMessage ? (
      <div className="py-10 bg-white/[0.02] rounded-2xl border border-dashed border-white/5 text-center">
        <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest">{emptyMessage}</p>
      </div>
    ) : null}
  </section>
);

// ── Live Feed Card (extracted to avoid hook-in-map) ───────────────────────────
const LiveFeedCard: React.FC<{ feed: LiveFeed; autoplayUrl: string; onSelect: () => void }> = ({ feed, autoplayUrl, onSelect }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="shrink-0 w-72 aspect-video rounded-2xl overflow-hidden bg-black relative group cursor-pointer shadow-2xl ring-1 ring-red-500/30"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onSelect}
    >
      {hovered
        ? <iframe src={autoplayUrl} className="w-full h-full" allow="autoplay; muted" allowFullScreen />
        : <div className="w-full h-full bg-white/5 flex items-center justify-center"><Radio size={28} className="text-white/20" /></div>
      }
      <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[8px] font-black uppercase tracking-widest text-red-400">Live</span>
        </div>
        <p className="text-[10px] font-black uppercase tracking-widest truncate">{feed.title}</p>
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
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
  const [liveFeeds, setLiveFeeds] = useState<LiveFeed[]>([]);
  const [userAlbums, setUserAlbums] = useState<Album[]>([]);
  const [userTracks, setUserTracks] = useState<(Track & { albumTitle: string; albumId: string })[]>([]);
  const [userWorlds, setUserWorlds] = useState<{ id: string; name: string }[]>([]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeView, setActiveView] = useState<'discover' | 'uploads' | 'live' | 'playlists' | 'channel'>('discover');
  const [showUpload, setShowUpload] = useState(false);
  const [showYoutubeImport, setShowYoutubeImport] = useState(false);
  const [showGoLiveModal, setShowGoLiveModal] = useState(false);
  const [isLiveStreamActive, setIsLiveStreamActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);

  // Upload form
  const [newVideo, setNewVideo] = useState<Partial<Video & { file?: File; thumbnailFile?: File; coverImageFile?: File }>>({
    title: '', description: '', genre: 'General', isPrivate: false, tags: [], subType: undefined, category: undefined, worldId: undefined
  });
  const [linkedTrackId, setLinkedTrackId] = useState('');
  const [linkedAlbumId, setLinkedAlbumId] = useState('');
  const [trackSearch, setTrackSearch] = useState('');
  const [movieMetadata, setMovieMetadata] = useState<MovieMetadata>({ cast: [], crew: [], trailerUrl: '', releaseYear: new Date().getFullYear(), specialFeatures: [] });
  const [tvEpisodes, setTvEpisodes] = useState<{ title: string; file?: File; description: string; episodeNumber?: number }[]>([]);
  const [tagInput, setTagInput] = useState('');

  useEffect(() => { loadData(); }, [profile?.uid]);

  const loadData = async () => {
    const [vids, pls, uVids, allAlbums, settings] = await Promise.all([
      fetchAllVideos(),
      fetchVideoPlaylists(),
      profile?.uid ? fetchUserVideos(profile.uid) : Promise.resolve([]),
      fetchAllPublicAlbums(),
      fetchSystemSettingsConfig()
    ]);
    fetchAllLiveFeeds(setLiveFeeds);
    setVideos(vids);
    setPlaylists(pls);
    setUserVideos(uVids);
    setUserAlbums(allAlbums.filter(a => a.ownerId === auth.currentUser?.uid));
    setMovies(allAlbums.filter(a => a.type === 'VIDEO' && a.subType === 'MOVIE'));
    setTvSeries(allAlbums.filter(a => a.type === 'VIDEO' && a.subType === 'TV_SERIES'));

    // Build flat track list from user's music albums for MV linking
    const musicAlbums = allAlbums.filter(a => a.ownerId === auth.currentUser?.uid && a.type === 'MUSIC');
    const tracks = musicAlbums.flatMap(album =>
      (album.tracks || []).map(t => ({ ...t, albumTitle: album.title, albumId: album.id }))
    );
    setUserTracks(tracks);

    if (auth.currentUser) {
      const [followed, interested, worlds] = await Promise.all([
        fetchFollowedVideos(auth.currentUser.uid),
        fetchVideosByInterests(auth.currentUser.uid),
        fetchUserWorlds(auth.currentUser.uid)
      ]);
      setFollowedVideos(followed);
      setInterestVideos(interested);
      setUserWorlds(worlds.map((w: any) => ({ id: w.id, name: w.name || w.title || 'World' })));
    }

    if (settings.curatedVideoPlaylists?.length) {
      setCuratedVideoPlaylists(await fetchVideoPlaylistsByIds(settings.curatedVideoPlaylists));
    }
    if (settings.mustWatchMovies?.length) {
      setMustWatchMovies(await fetchVideosByIds(settings.mustWatchMovies));
    }
  };

  const filteredTracks = useMemo(() =>
    userTracks.filter(t => t.title.toLowerCase().includes(trackSearch.toLowerCase()) || t.albumTitle.toLowerCase().includes(trackSearch.toLowerCase())),
    [userTracks, trackSearch]
  );

  const filteredVideos = useMemo(() => {
    if (mode === 'MOVIES_TV') return [];
    return videos.filter(v => {
      const matchSearch = v.title.toLowerCase().includes(searchTerm.toLowerCase()) || (v.artist || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchCat = activeCategory === 'All' || v.genre === activeCategory ||
        (activeCategory === 'Music Video' && v.category === 'MUSIC_VIDEO') ||
        (activeCategory === 'Live' && (v.genre === 'Live' || v.isScheduled));
      return matchSearch && matchCat;
    });
  }, [videos, searchTerm, activeCategory, mode]);

  const musicVideos = useMemo(() => filteredVideos.filter(v => v.genre === 'Music Video' || v.category === 'MUSIC_VIDEO'), [filteredVideos]);
  const trendingVideos = useMemo(() => [...filteredVideos].sort((a, b) => (b.likesCount || 0) - (a.likesCount || 0)).slice(0, 8), [filteredVideos]);
  const recentVideos = useMemo(() => [...filteredVideos].sort((a, b) => b.timestamp - a.timestamp).slice(0, 8), [filteredVideos]);

  const handlePlay = (item: Video | Album | any) => {
    if ((item as any).type === 'VIDEO' && (item as any).subType) playVideo(item as any);
    onSelectVideo?.(item);
  };

  const addTag = () => {
    if (tagInput.trim() && !(newVideo.tags || []).includes(tagInput.trim())) {
      setNewVideo(v => ({ ...v, tags: [...(v.tags || []), tagInput.trim()] }));
      setTagInput('');
    }
  };

  const getAutoplayUrl = (url: string) => {
    if (!url) return '';
    try {
      const u = new URL(url);
      u.searchParams.set('autoplay', '1');
      u.searchParams.set('mute', '1');
      if (url.includes('youtube.com/watch')) u.pathname = u.pathname.replace('/watch', '/embed');
      return u.toString();
    } catch {
      return `${url.includes('?') ? url + '&' : url + '?'}autoplay=1&mute=1`;
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploading(true);
    try {
      if (newVideo.subType === 'MOVIE') {
        await publishToCloud({
          id: `movie_${Date.now()}`, title: newVideo.title, artist: profile?.displayName || 'Unknown',
          type: 'VIDEO', subType: 'MOVIE', description: newVideo.description, genre: newVideo.genre,
          coverImage: '', coverFile: newVideo.coverImageFile, createdAt: Date.now(), themeColor: '#ffffff',
          tracks: [{ id: 'movie_track', title: newVideo.title || '', artist: profile?.displayName || 'Unknown', url: '', file: newVideo.file, duration: 0 }],
          movieMetadata, worldId: newVideo.worldId, tags: newVideo.tags, isPrivate: newVideo.isPrivate,
        } as any, (_, p) => setUploadProgress(p));
      } else if (newVideo.subType === 'TV_SERIES') {
        await publishToCloud({
          id: `tv_${Date.now()}`, title: newVideo.title, artist: profile?.displayName || 'Unknown',
          type: 'VIDEO', subType: 'TV_SERIES', description: newVideo.description, genre: newVideo.genre,
          coverImage: '', coverFile: newVideo.coverImageFile, createdAt: Date.now(), themeColor: '#ffffff',
          seasons: [{ id: 's1', number: 1, episodes: tvEpisodes.map((ep, i) => ({ id: `ep_${i}`, ...ep, episodeNumber: ep.episodeNumber || i + 1, ownerId: auth.currentUser?.uid || '', url: '', timestamp: Date.now() })) }],
          worldId: newVideo.worldId, tags: newVideo.tags, isPrivate: newVideo.isPrivate,
        } as any, (_, p) => setUploadProgress(p));
      } else {
        if (!newVideo.file) return;
        let finalThumb = newVideo.thumbnailFile;
        let finalCover = newVideo.coverImageFile;
        if (!finalThumb) { try { const b = await captureVideoFrame(newVideo.file); finalThumb = new File([b], 'thumb.jpg', { type: 'image/jpeg' }); } catch {} }
        if (!finalCover) { try { const b = await captureVideoFrame(newVideo.file); finalCover = new File([b], 'cover.jpg', { type: 'image/jpeg' }); } catch {} }
        await uploadVideo({
          ...newVideo,
          thumbnailFile: finalThumb, coverImageFile: finalCover,
          category: newVideo.genre === 'Music Video' ? 'MUSIC_VIDEO' : newVideo.category,
          // Store the linked track/album so album page can surface this MV
          ...(linkedTrackId ? { linkedTrackId, linkedAlbumId } : {}),
        } as any, (p) => setUploadProgress(p));
      }
      setShowUpload(false);
      setNewVideo({ title: '', description: '', genre: 'General', isPrivate: false, tags: [] });
      setLinkedTrackId(''); setLinkedAlbumId(''); setTrackSearch('');
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

  const isMusicVideoMode = newVideo.genre === 'Music Video';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 min-h-0">
      {/* ── Top Bar ─────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-40 bg-[#050505]/80 backdrop-blur-2xl border-b border-white/5 px-6 lg:px-12 py-4">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <h1 className="text-xl font-black uppercase tracking-widest shrink-0 hidden lg:block">
            {mode === 'MOVIES_TV' ? 'Cinema' : 'Video'}
          </h1>

          {/* Search */}
          <div className="flex-1 relative max-w-xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={16} />
            <input
              type="text"
              placeholder="Search videos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white/5 border border-white/10 focus:border-white/30 rounded-xl py-2.5 pl-10 pr-10 text-xs font-black uppercase tracking-widest text-white placeholder:text-white/20 outline-none transition-all"
            />
            {searchTerm && <button onClick={() => setSearchTerm('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white"><X size={14} /></button>}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            {isOwner && (
              <>
                <button onClick={() => setShowGoLiveModal(true)} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all font-black text-[9px] uppercase tracking-widest ${isLiveStreamActive ? 'bg-green-600 text-white' : 'bg-red-600/80 text-white hover:bg-red-600'}`}>
                  <Radio size={14} /> {isLiveStreamActive ? 'Live' : 'Go Live'}
                </button>
                <button onClick={() => setShowYoutubeImport(true)} className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 text-white rounded-xl hover:bg-white/10 transition-all font-black text-[9px] uppercase tracking-widest">
                  <Plus size={14} /> Import
                </button>
                <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 px-4 py-2.5 bg-white text-black rounded-xl hover:bg-small-orange hover:text-white transition-all font-black text-[9px] uppercase tracking-widest shadow-lg">
                  <Upload size={14} /> Upload
                </button>
              </>
            )}
          </div>
        </div>

        {/* Category chips */}
        <div className="max-w-7xl mx-auto mt-3 flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {CATEGORIES.map(cat => {
            const active = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full font-black text-[9px] uppercase tracking-widest whitespace-nowrap shrink-0 transition-all border ${active ? 'bg-white text-black border-white shadow-lg' : 'bg-white/5 border-white/5 text-white/50 hover:bg-white/10 hover:text-white hover:border-white/10'}`}
              >
                <cat.icon size={11} /> {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      <div className="flex max-w-7xl mx-auto">
        {/* Sidebar nav (desktop) */}
        <div className="hidden lg:flex flex-col gap-1 w-44 shrink-0 sticky top-32 h-fit pt-8 px-6">
          {[
            { id: 'discover', label: 'Discover', icon: Sparkles },
            { id: 'uploads', label: 'My Videos', icon: Film },
            { id: 'live', label: 'Live', icon: Radio },
            { id: 'playlists', label: 'Playlists', icon: List },
            { id: 'channel', label: 'Channel', icon: Layers },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id as any)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all font-black text-[9px] uppercase tracking-widest ${activeView === item.id ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white hover:bg-white/5'}`}
            >
              <item.icon size={14} className={activeView === item.id ? 'text-small-orange' : ''} /> {item.label}
            </button>
          ))}
        </div>

        {/* Main */}
        <div className="flex-1 min-w-0 p-6 lg:p-8 lg:pl-0 space-y-2">

          {/* Mobile view tabs */}
          <div className="flex gap-2 lg:hidden mb-6 overflow-x-auto no-scrollbar">
            {(['discover', 'uploads', 'live', 'playlists', 'channel'] as const).map(v => (
              <button key={v} onClick={() => setActiveView(v)} className={`px-4 py-2 rounded-full font-black text-[9px] uppercase tracking-widest whitespace-nowrap shrink-0 transition-all ${activeView === v ? 'bg-white text-black' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>{v}</button>
            ))}
          </div>

          {/* ── DISCOVER ──────────────────────────────────────────────────── */}
          {activeView === 'discover' && (
            <div className="space-y-2">
              {/* Featured hero */}
              <div className="mb-10">
                <FeaturedCarousel
                  items={(mode === 'MOVIES_TV' ? [...movies, ...tvSeries] : filteredVideos).slice(0, 5).map(item => ({
                    id: item.id,
                    title: item.title,
                    subtitle: (item as any).genre || '',
                    imageUrl: (item as any).thumbnailUrl || (item as any).coverImage || `https://picsum.photos/seed/${item.id}/1280/720`,
                    videoUrl: (item as any).url,
                    onClick: () => handlePlay(item)
                  }))}
                />
              </div>

              {/* Music Videos section */}
              {mode === 'VIDEOS' && musicVideos.length > 0 && (
                <VideoRow title="Music Videos" icon={Music2} videos={musicVideos} onSelect={handlePlay} />
              )}

              {/* Trending */}
              <VideoRow title="Trending Now" icon={TrendingUp} videos={trendingVideos} onSelect={handlePlay} />

              {/* Live feeds */}
              {liveFeeds.length > 0 && (
                <section className="mb-14">
                  <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2.5 mb-5">
                    <Radio className="text-red-500" size={16} /> Live Now
                  </h2>
                  <div className="flex gap-5 overflow-x-auto pb-3 custom-scrollbar">
                    {liveFeeds.map(feed => (
                      <LiveFeedCard key={feed.id} feed={feed} autoplayUrl={getAutoplayUrl(feed.url)} onSelect={() => onSelectVideo?.(feed as any)} />
                    ))}
                  </div>
                </section>
              )}

              {/* Recent */}
              <VideoRow title="Recent Uploads" icon={Clock} videos={recentVideos} onSelect={handlePlay} />

              {/* For You */}
              {interestVideos.length > 0 && (
                <VideoRow title="For You" icon={Sparkles} videos={interestVideos} onSelect={handlePlay} />
              )}

              {/* From Network */}
              {followedVideos.length > 0 && (
                <VideoRow title="From Your Network" icon={Users} videos={followedVideos} onSelect={handlePlay} size="small" />
              )}

              {/* Movies / TV (in MOVIES_TV mode) */}
              {mode === 'MOVIES_TV' && (
                <>
                  {mustWatchMovies.length > 0 && <VideoRow title="Must Watch Cinema" icon={Monitor} videos={mustWatchMovies} onSelect={handlePlay} />}
                  <VideoRow title="Movies" icon={Film} videos={movies} onSelect={handlePlay} />
                  <VideoRow title="TV Series" icon={Tv} videos={tvSeries} onSelect={handlePlay} />
                </>
              )}

              {/* Global latest */}
              {interestVideos[0] && mode === 'VIDEOS' && (
                <section className="mb-10">
                  <div className="relative rounded-[2.5rem] overflow-hidden bg-gradient-to-br from-white/[0.04] to-transparent border border-white/5 p-8 lg:p-12">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
                      <div className="relative aspect-video rounded-2xl overflow-hidden shadow-2xl group cursor-pointer" onClick={() => handlePlay(interestVideos[0])}>
                        <img src={interestVideos[0].thumbnailUrl || `https://picsum.photos/seed/${interestVideos[0].id}/1280/720`} className="w-full h-full object-cover" alt="" loading="lazy" />
                        <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-all flex items-center justify-center">
                          <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center shadow-2xl">
                            <Play fill="white" size={24} className="ml-1" />
                          </div>
                        </div>
                      </div>
                      <div>
                        <span className="inline-block px-3 py-1 bg-small-orange text-white text-[8px] font-black uppercase tracking-widest rounded-full mb-5">Global Latest</span>
                        <h3 className="text-3xl lg:text-5xl font-display font-black tracking-tightest uppercase mb-4 leading-tight">{interestVideos[0].title}</h3>
                        <p className="text-white/40 text-sm leading-relaxed mb-6 max-w-md line-clamp-3">{interestVideos[0].description || "Experience the latest release tailored to your taste."}</p>
                        <div className="flex items-center gap-4">
                          <button onClick={() => handlePlay(interestVideos[0])} className="px-8 py-3.5 bg-white text-black rounded-full font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all shadow-xl">Watch Now</button>
                          <div className="flex items-center gap-3">
                            <Heart size={16} className="text-white/30" />
                            <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">{interestVideos[0].likesCount || 0}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}

          {/* ── MY VIDEOS ────────────────────────────────────────────────── */}
          {activeView === 'uploads' && (
            <div className="space-y-6 pt-2">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black uppercase tracking-widest">My Videos <span className="text-white/20 ml-2">{userVideos.length}</span></h2>
                {isOwner && <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 px-5 py-2.5 bg-white text-black rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-small-orange hover:text-white transition-all"><Plus size={14} /> Upload</button>}
              </div>
              {userVideos.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {userVideos.map(video => (
                    <VideoCard key={video.id} video={video} onPlay={() => handlePlay(video)} />
                  ))}
                </div>
              ) : (
                <div className="py-32 bg-white/[0.02] border-2 border-dashed border-white/5 rounded-[3rem] flex flex-col items-center justify-center text-center">
                  <Film size={48} className="text-white/10 mb-6" />
                  <p className="text-sm font-black uppercase tracking-widest text-white/20 mb-2">No videos uploaded yet</p>
                  {isOwner && <button onClick={() => setShowUpload(true)} className="mt-6 px-10 py-4 bg-white text-black rounded-full font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all shadow-xl">Upload First Video</button>}
                </div>
              )}
            </div>
          )}

          {/* ── LIVE ─────────────────────────────────────────────────────── */}
          {activeView === 'live' && (
            <div className="space-y-8 pt-2">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black uppercase tracking-widest">Live Studio</h2>
                <button onClick={() => setShowGoLiveModal(true)} className="flex items-center gap-2 px-5 py-2.5 bg-white/5 border border-white/10 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-white/10 transition-all"><Settings2 size={14} /> Broadcast Studio</button>
              </div>
              <div className={`p-8 rounded-3xl border flex items-center gap-6 ${isLiveStreamActive ? 'bg-green-500/10 border-green-500/30' : 'bg-white/[0.02] border-white/5 border-dashed'}`}>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isLiveStreamActive ? 'bg-green-500' : 'bg-white/5'}`}>
                  <Radio size={22} className={isLiveStreamActive ? 'text-white' : 'text-white/20'} />
                </div>
                <div className="flex-1">
                  <h3 className="font-black uppercase tracking-widest text-sm mb-1">{isLiveStreamActive ? 'Broadcast is Live' : 'Currently Offline'}</h3>
                  <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest">{isLiveStreamActive ? 'You are broadcasting right now.' : 'Start a broadcast to go live.'}</p>
                </div>
                <button onClick={() => setShowGoLiveModal(true)} className={`px-6 py-3 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all ${isLiveStreamActive ? 'bg-red-600 text-white' : 'bg-white text-black hover:bg-small-orange hover:text-white'}`}>{isLiveStreamActive ? 'End Broadcast' : 'Go Live'}</button>
              </div>
              <VideoRow title="Past Broadcasts" icon={Radio} videos={userVideos.filter(v => v.genre === 'Live')} onSelect={handlePlay} emptyMessage="No past broadcasts." />
            </div>
          )}

          {/* ── PLAYLISTS ────────────────────────────────────────────────── */}
          {activeView === 'playlists' && (
            <VideoRow title="My Playlists" icon={List} videos={playlists} onSelect={handlePlay} emptyMessage="No playlists found." />
          )}

          {/* ── CHANNEL ──────────────────────────────────────────────────── */}
          {activeView === 'channel' && (
            <div className="space-y-6 pt-2">
              <h2 className="text-lg font-black uppercase tracking-widest">Channel Archive</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {userVideos.map(video => (
                  <VideoCard key={video.id} video={video} onPlay={() => handlePlay(video)} />
                ))}
                {userVideos.length === 0 && (
                  <div className="col-span-full py-20 text-center bg-white/5 rounded-[3rem] border border-dashed border-white/10">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/20">Archive is empty</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Upload Modal ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showUpload && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-2xl z-[200] flex items-center justify-center p-4 lg:p-8">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="max-w-5xl w-full max-h-[90vh] bg-[#0a0a0a]/95 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] overflow-hidden shadow-[0_40px_80px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.06)] flex flex-col"
            >
              {/* Modal header */}
              <div className="flex items-center justify-between px-10 pt-10 pb-6 border-b border-white/5 shrink-0">
                <div>
                  <h2 className="text-2xl font-display font-black tracking-tight uppercase">Upload Video</h2>
                  <p className="text-[9px] font-black uppercase tracking-[0.4em] text-white/30 mt-1">Share your vision with the world</p>
                </div>
                <button onClick={() => !uploading && setShowUpload(false)} className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl text-white/40 hover:text-white transition-all">
                  <X size={20} />
                </button>
              </div>

              <div className="overflow-y-auto custom-scrollbar flex-1">
                <form onSubmit={handleUpload} className="p-10 space-y-8">
                  {/* Video type selector */}
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-[0.4em] text-white/30 mb-4">Video Type</label>
                    <div className="flex flex-wrap gap-3">
                      {[
                        { label: 'Video', value: 'VIDEO', icon: Film },
                        { label: 'Music Video', value: 'MUSIC_VIDEO', icon: Music2 },
                        { label: 'Movie', value: 'MOVIE', icon: Monitor },
                        { label: 'TV Series', value: 'TV_SERIES', icon: Tv },
                      ].map(({ label, value, icon: Icon }) => {
                        const isActive = value === 'MUSIC_VIDEO'
                          ? newVideo.genre === 'Music Video'
                          : value === 'VIDEO'
                          ? !newVideo.subType && newVideo.genre !== 'Music Video'
                          : newVideo.subType === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => {
                              if (value === 'MUSIC_VIDEO') {
                                setNewVideo(v => ({ ...v, subType: undefined, genre: 'Music Video', category: 'MUSIC_VIDEO' }));
                              } else if (value === 'VIDEO') {
                                setNewVideo(v => ({ ...v, subType: undefined, genre: 'General', category: undefined }));
                              } else {
                                setNewVideo(v => ({ ...v, subType: value as any, genre: 'General', category: undefined }));
                              }
                            }}
                            className={`flex items-center gap-2.5 px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border ${isActive ? 'bg-white text-black border-white shadow-lg' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'}`}
                          >
                            <Icon size={14} /> {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                    {/* Left column */}
                    <div className="space-y-6">
                      <div>
                        <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-3">Title</label>
                        <input type="text" required value={newVideo.title} onChange={(e) => setNewVideo(v => ({ ...v, title: e.target.value }))} placeholder="Give your video a title" className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold outline-none focus:border-white/30 transition-all" />
                      </div>
                      <div>
                        <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-3">Description</label>
                        <textarea rows={3} value={newVideo.description} onChange={(e) => setNewVideo(v => ({ ...v, description: e.target.value }))} placeholder="What's this video about?" className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold outline-none focus:border-white/30 transition-all resize-none" />
                      </div>

                      {/* Music Video — song linker */}
                      {isMusicVideoMode && (
                        <div className="p-6 bg-small-orange/10 border border-small-orange/20 rounded-2xl space-y-4">
                          <h3 className="text-[10px] font-black uppercase tracking-widest text-small-orange flex items-center gap-2"><Music2 size={14} /> Link to a Song</h3>
                          <p className="text-[8px] font-bold text-white/30 uppercase tracking-widest">When published, this video will auto-appear on the linked song's album page.</p>
                          <input
                            type="text"
                            placeholder="Search your songs..."
                            value={trackSearch}
                            onChange={(e) => setTrackSearch(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-3 text-xs font-bold outline-none placeholder:text-white/20"
                          />
                          <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-2">
                            {filteredTracks.length === 0 && (
                              <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest py-4 text-center">No songs found. Upload music first.</p>
                            )}
                            {filteredTracks.map(track => (
                              <button
                                key={track.id}
                                type="button"
                                onClick={() => { setLinkedTrackId(track.id); setLinkedAlbumId(track.albumId); }}
                                className={`w-full flex items-center gap-4 p-3 rounded-xl text-left transition-all border ${linkedTrackId === track.id ? 'bg-small-orange/20 border-small-orange/50' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                              >
                                <Music2 size={14} className={linkedTrackId === track.id ? 'text-small-orange' : 'text-white/30'} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-[10px] font-black uppercase tracking-widest truncate">{track.title}</p>
                                  <p className="text-[8px] font-bold text-white/30 uppercase tracking-widest truncate">{track.albumTitle}</p>
                                </div>
                                {linkedTrackId === track.id && <Check size={14} className="text-small-orange shrink-0" />}
                              </button>
                            ))}
                          </div>
                          {linkedTrackId && (
                            <div className="flex items-center justify-between p-3 bg-small-orange/10 rounded-xl border border-small-orange/20">
                              <span className="text-[9px] font-black uppercase tracking-widest text-small-orange">Linked: {userTracks.find(t => t.id === linkedTrackId)?.title}</span>
                              <button type="button" onClick={() => { setLinkedTrackId(''); setLinkedAlbumId(''); }} className="text-white/30 hover:text-white"><X size={12} /></button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Movie metadata */}
                      {newVideo.subType === 'MOVIE' && (
                        <div className="p-6 bg-white/5 rounded-2xl border border-white/10 space-y-5">
                          <h3 className="text-[10px] font-black uppercase tracking-widest">Movie Details</h3>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-[8px] font-black uppercase tracking-widest text-white/20 mb-2">Release Year</label>
                              <input type="number" value={movieMetadata.releaseYear} onChange={(e) => setMovieMetadata(m => ({ ...m, releaseYear: parseInt(e.target.value) }))} className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs font-bold outline-none text-white" />
                            </div>
                            <div>
                              <label className="block text-[8px] font-black uppercase tracking-widest text-white/20 mb-2">Trailer URL</label>
                              <input type="url" value={movieMetadata.trailerUrl} onChange={(e) => setMovieMetadata(m => ({ ...m, trailerUrl: e.target.value }))} placeholder="YouTube/Vimeo" className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs font-bold outline-none text-white placeholder:text-white/20" />
                            </div>
                          </div>
                          <div>
                            <label className="block text-[8px] font-black uppercase tracking-widest text-white/20 mb-2">Cast (comma separated)</label>
                            <input type="text" value={movieMetadata.cast?.join(', ')} onChange={(e) => setMovieMetadata(m => ({ ...m, cast: e.target.value.split(',').map(s => s.trim()) }))} placeholder="Actor 1, Actor 2..." className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs font-bold outline-none text-white placeholder:text-white/20" />
                          </div>
                        </div>
                      )}

                      {/* TV Episodes */}
                      {newVideo.subType === 'TV_SERIES' && (
                        <div className="p-6 bg-white/5 rounded-2xl border border-white/10 space-y-4">
                          <div className="flex items-center justify-between">
                            <h3 className="text-[10px] font-black uppercase tracking-widest">Episodes</h3>
                            <button type="button" onClick={() => setTvEpisodes(eps => [...eps, { title: `Episode ${eps.length + 1}`, description: '' }])} className="text-[8px] font-black uppercase tracking-widest text-small-orange hover:scale-105 transition-all">+ Add</button>
                          </div>
                          <div className="space-y-3 max-h-52 overflow-y-auto custom-scrollbar pr-1">
                            {tvEpisodes.map((ep, idx) => (
                              <div key={idx} className="p-4 bg-black/40 rounded-xl border border-white/5 space-y-3">
                                <div className="flex items-center gap-3">
                                  <input type="text" value={ep.title} onChange={(e) => { const eps = [...tvEpisodes]; eps[idx].title = e.target.value; setTvEpisodes(eps); }} className="flex-1 bg-transparent text-[10px] font-black uppercase tracking-widest outline-none" placeholder="Episode Title" />
                                  <input type="number" value={ep.episodeNumber} placeholder="#" onChange={(e) => { const eps = [...tvEpisodes]; eps[idx].episodeNumber = parseInt(e.target.value); setTvEpisodes(eps); }} className="w-10 bg-white/5 border border-white/10 rounded-lg p-1 text-[8px] font-bold text-center outline-none" />
                                  <button type="button" onClick={() => setTvEpisodes(eps => eps.filter((_, i) => i !== idx))} className="text-white/20 hover:text-red-500"><X size={12} /></button>
                                </div>
                                <label className="block p-2 bg-white/5 border border-dashed border-white/10 rounded-lg cursor-pointer hover:bg-white/10 text-center">
                                  <span className="text-[8px] font-black uppercase tracking-widest text-white/30">{ep.file ? ep.file.name : 'Select Video File'}</span>
                                  <input type="file" className="hidden" accept="video/*" onChange={(e) => { const eps = [...tvEpisodes]; eps[idx].file = e.target.files?.[0]; setTvEpisodes(eps); }} />
                                </label>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Tags */}
                      <div>
                        <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-3">Tags</label>
                        <div className="flex gap-2 mb-3">
                          <input type="text" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())} placeholder="Add a tag..." className="flex-1 bg-white/5 border border-white/10 rounded-xl p-3 text-xs font-bold outline-none placeholder:text-white/20" />
                          <button type="button" onClick={addTag} className="px-5 bg-white/10 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-white/20 transition-all">Add</button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {(newVideo.tags || []).map(tag => (
                            <span key={tag} className="px-3 py-1.5 bg-white/10 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-2">
                              {tag} <button type="button" onClick={() => setNewVideo(v => ({ ...v, tags: v.tags?.filter(t => t !== tag) }))} className="text-white/40 hover:text-white"><X size={9} /></button>
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* World selector */}
                      {userWorlds.length > 0 && (
                        <div>
                          <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-3">Link to World (Optional)</label>
                          <select value={newVideo.worldId || ''} onChange={(e) => setNewVideo(v => ({ ...v, worldId: e.target.value || undefined }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-3 text-xs font-bold outline-none appearance-none text-white">
                            <option value="" className="bg-[#0a0a0a]">No World</option>
                            {userWorlds.map(w => <option key={w.id} value={w.id} className="bg-[#0a0a0a]">{w.name}</option>)}
                          </select>
                        </div>
                      )}

                      {/* Privacy */}
                      <div className="flex items-center justify-between p-5 bg-white/[0.03] rounded-2xl border border-white/5">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest">Visibility</p>
                          <p className="text-[8px] font-bold text-white/30 uppercase tracking-widest mt-1">{newVideo.isPrivate ? 'Private — only you' : 'Public — visible to everyone'}</p>
                        </div>
                        <button type="button" onClick={() => setNewVideo(v => ({ ...v, isPrivate: !v.isPrivate }))} className={`w-12 h-7 rounded-full transition-all relative ${!newVideo.isPrivate ? 'bg-green-500' : 'bg-white/10'}`}>
                          <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full transition-all shadow-lg ${!newVideo.isPrivate ? 'left-5' : 'left-0.5'}`} />
                        </button>
                      </div>
                    </div>

                    {/* Right column — file upload */}
                    <div className="space-y-5">
                      {/* Video file drop */}
                      <div className="relative aspect-video bg-white/[0.03] border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center group hover:border-white/20 transition-all overflow-hidden">
                        {newVideo.file ? (
                          <div className="absolute inset-0 flex flex-col items-center justify-center bg-green-500/10">
                            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-4"><Check size={32} className="text-green-400" /></div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-green-400 px-4 text-center truncate max-w-full">{newVideo.file.name}</p>
                            <button type="button" onClick={() => setNewVideo(v => ({ ...v, file: undefined }))} className="mt-4 text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-white">Change File</button>
                          </div>
                        ) : (
                          <>
                            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4 group-hover:bg-white/10 transition-all"><Upload size={28} className="text-white/30 group-hover:text-white transition-colors" /></div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Drop video file here</p>
                            <p className="text-[8px] font-bold text-white/20 mt-1 uppercase tracking-widest">or click to browse</p>
                            <input type="file" accept="video/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) setNewVideo(v => ({ ...v, file: f })); }} className="absolute inset-0 opacity-0 cursor-pointer" />
                          </>
                        )}
                      </div>

                      {/* Thumbnail + Cover */}
                      <div className="grid grid-cols-2 gap-3">
                        <label className="flex flex-col gap-2 p-4 bg-white/5 border border-dashed border-white/10 rounded-xl cursor-pointer hover:bg-white/10 transition-all">
                          <div className="flex items-center gap-2"><ImageIcon size={13} className="text-white/30" /><span className="text-[9px] font-black uppercase tracking-widest text-white/30">Thumbnail</span></div>
                          <span className="text-[8px] font-bold text-white/20 truncate">{newVideo.thumbnailFile ? newVideo.thumbnailFile.name : 'Optional'}</span>
                          <input type="file" className="hidden" accept="image/*" onChange={(e) => setNewVideo(v => ({ ...v, thumbnailFile: e.target.files?.[0] }))} />
                        </label>
                        <label className="flex flex-col gap-2 p-4 bg-white/5 border border-dashed border-white/10 rounded-xl cursor-pointer hover:bg-white/10 transition-all">
                          <div className="flex items-center gap-2"><ImageIcon size={13} className="text-white/30" /><span className="text-[9px] font-black uppercase tracking-widest text-white/30">Cover</span></div>
                          <span className="text-[8px] font-bold text-white/20 truncate">{newVideo.coverImageFile ? newVideo.coverImageFile.name : 'Optional'}</span>
                          <input type="file" className="hidden" accept="image/*" onChange={(e) => setNewVideo(v => ({ ...v, coverImageFile: e.target.files?.[0] }))} />
                        </label>
                      </div>

                      {/* Auto-capture */}
                      <button type="button" disabled={!newVideo.file || isCapturing} onClick={async () => {
                        if (!newVideo.file) return;
                        setIsCapturing(true);
                        try {
                          const b1 = await captureVideoFrame(newVideo.file);
                          const b2 = await captureVideoFrame(newVideo.file);
                          setNewVideo(v => ({ ...v, thumbnailFile: new File([b1], 'thumb.jpg', { type: 'image/jpeg' }), coverImageFile: new File([b2], 'cover.jpg', { type: 'image/jpeg' }) }));
                        } catch {} finally { setIsCapturing(false); }
                      }} className="w-full py-3.5 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center gap-3 text-[9px] font-black uppercase tracking-widest hover:bg-white/10 transition-all disabled:opacity-30">
                        <Camera size={16} /> {isCapturing ? 'Capturing...' : 'Auto-generate Visuals from Video'}
                      </button>

                      {/* Genre (only for non-music-video, non-movie) */}
                      {!isMusicVideoMode && !newVideo.subType && (
                        <div>
                          <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-3">Genre</label>
                          <select value={newVideo.genre} onChange={(e) => setNewVideo(v => ({ ...v, genre: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-3 text-xs font-bold outline-none appearance-none text-white">
                            {['General', 'Short Film', 'Tutorial', 'Vlog', 'Live Stream', 'Documentary', 'Gaming', 'Education', 'Podcast'].map(g => <option key={g} value={g} className="bg-[#0a0a0a]">{g}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Submit */}
                  <div className="pt-6 border-t border-white/5">
                    {uploading ? (
                      <div className="space-y-4">
                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                          <motion.div className="h-full bg-gradient-to-r from-purple-600 to-small-orange" initial={{ width: 0 }} animate={{ width: `${uploadProgress}%` }} />
                        </div>
                        <p className="text-center text-[9px] font-black uppercase tracking-[0.4em] text-small-orange animate-pulse">Uploading to cloud... {Math.round(uploadProgress)}%</p>
                        <button type="button" onClick={() => setShowUpload(false)} className="w-full py-3 bg-white/5 rounded-xl text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-white">Minimize to Background</button>
                      </div>
                    ) : (
                      <button type="submit" className="w-full py-5 bg-white text-black rounded-2xl font-black text-xs uppercase tracking-[0.3em] hover:scale-[1.02] transition-all active:scale-95 shadow-2xl hover:bg-small-orange hover:text-white">
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

      {showYoutubeImport && <YoutubeImportModal onClose={() => setShowYoutubeImport(false)} onImported={() => { setShowYoutubeImport(false); loadData(); }} />}
      {showGoLiveModal && <LiveStreamModal onClose={() => setShowGoLiveModal(false)} onStreamActive={setIsLiveStreamActive} />}
    </div>
  );
};

export default VideoTab;
