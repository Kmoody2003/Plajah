import React, { useState, useEffect, useMemo } from 'react';
import { Video, VideoPlaylist, UserProfile, MovieMetadata, Album, LiveFeed, Track, Character, Club } from '../types';
import {
  fetchAllVideos, uploadVideo, fetchVideoPlaylists, fetchFollowedVideos,
  fetchVideosByInterests, fetchUserVideos, auth, fetchAllPublicAlbums,
  publishToCloud, fetchAllLiveFeeds, fetchSystemSettingsConfig, fetchVideoPlaylistsByIds,
  fetchVideosByIds, fetchUserWorlds, fetchWorldCharacters, fetchUserProfile, updateVideo,
  fetchAllUsers, fetchFollowedArtists, followUser, unfollowUser,
  fetchUserClubs, createClubPost,
} from '../services/backendService';
import { captureVideoFrame } from '../src/lib/videoUtils';
import { getContinueWatching, WatchEntry } from '../services/watchHistoryService';
import {
  Play, Heart, MessageCircle, Share2, Plus, Search, Upload, X, Check, Users,
  TrendingUp, Radio, Clock, Sparkles, Globe, Music2, Camera, Image as ImageIcon,
  Film, Tv, Monitor, Settings2, ChevronRight, MoreVertical, Mic2, Gamepad2,
  BookOpen, List, Layers, Lock, Smartphone, ChevronUp, ChevronDown, Volume2, VolumeX, ListPlus
} from 'lucide-react';
import { AddToPlaylistModal, VideoPlaylistSection, VideoPlaylistDetailView } from './VideoPlaylistKit';
import { SubscriptionsSection, LikedVideosSection, HistorySection } from './VideoLibraryKit';
import { motion, AnimatePresence } from 'motion/react';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';
import { useUpload } from '../contexts/UploadContext';
import ThreeDImage from './ThreeDImage';
import YoutubeImportModal from './YoutubeImportModal';
import { LiveStudio, LiveViewer } from './MobileLiveStreamer';
import CommentSection from './CommentSection';
import SignInPrompt from './SignInPrompt';
import StoriesBar from './StoriesBar';
import PlajahPlusBanner from './PlajahPlusBanner';
import WorldBadge from './WorldBadge';
import { thumb as thumbUrl, onThumbError, THUMB } from '../src/lib/imageThumb';

interface VideoTabProps {
  profile: UserProfile | null;
  isOwner: boolean;
  onSelectVideo?: (item: Video | Album) => void;
  mode?: 'VIDEOS' | 'MOVIES_TV';
  currentUser?: UserProfile | null;
  onVisitUser?: (uid: string) => void;
  /** Open a specific playlist on mount (from a shared /share?type=videoPlaylist link). */
  initialPlaylistId?: string;
  onPlaylistOpened?: () => void;
  /** Set the autoplay queue when playing from a playlist. */
  onSetQueue?: (videos: Video[]) => void;
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

// â"€â"€ Video Card â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const VideoCard: React.FC<{
  video: Video | Album | any;
  onPlay: () => void;
  size?: 'default' | 'small' | 'wide';
  showChannel?: boolean;
  currentUser?: UserProfile | null;
  onAssignWorld?: () => void;
  onShareToClub?: () => void;
  onSave?: () => void;
}> = ({ video, onPlay, size = 'default', showChannel = true, currentUser, onAssignWorld, onShareToClub, onSave }) => {
  const [isHovered, setIsHovered] = React.useState(false);
  const muxId = (video as any).muxPlaybackId as string | undefined;
  const thumb = muxId
    ? `https://image.mux.com/${muxId}/thumbnail.png?width=640&height=360&time=5`
    : ((video as any).thumbnailUrl || (video as any).coverImage || `https://picsum.photos/seed/${video.id}/800/450`);
  const isLive = (video as any).genre === 'Live';
  const isMV = (video as any).genre === 'Music Video' || (video as any).category === 'MUSIC_VIDEO';
  const isCardOwner = !!(currentUser?.uid && currentUser.uid === (video as any).ownerId);

  const handleThumbnailChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !video.id) return;
    try {
      const { uploadFile: ctxUpload } = (window as any).__uploadCtx__ || {};
      // Upload via a fresh Firebase storage ref if context not available
      const { getStorage, ref: storageRef, uploadBytes, getDownloadURL } = await import('firebase/storage');
      const storage = getStorage();
      const fileRef = storageRef(storage, `thumbnails/${video.id}_${Date.now()}_${file.name}`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      await updateVideo(video.id, { thumbnailUrl: url });
    } catch (err) {
      console.error('Thumbnail update failed', err);
    }
  };

  return (
    <motion.div
      whileHover={{ y: -4 }}
      className="group cursor-pointer"
      onClick={onPlay}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
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
        {/* Mux animated preview on hover */}
        {muxId && isHovered && (
          <img
            src={`https://image.mux.com/${muxId}/animated.webp?width=480&fps=12`}
            className="absolute inset-0 w-full h-full object-cover"
            alt=""
            loading="lazy"
          />
        )}
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
          {(video as any).playsCount ? `${(video as any).playsCount}` : 'â€"'} views
        </div>
        {/* Change Thumbnail button (owner only, not on live streams) */}
        {isCardOwner && !isLive && (
          <label
            onClick={(e) => e.stopPropagation()}
            className="absolute top-2.5 right-2.5 w-8 h-8 rounded-xl bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity hover:bg-small-orange/80 hover:border-small-orange/60"
            title="Change Thumbnail"
          >
            <Camera size={13} className="text-white" />
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleThumbnailChange}
            />
          </label>
        )}
      </div>

      {/* Info */}
      <div className="flex gap-3">
        {showChannel && (
          <div className="w-8 h-8 rounded-full bg-white/10 shrink-0 mt-0.5 overflow-hidden ring-1 ring-white/10">
            <img loading="lazy" decoding="async" src={thumbUrl((video as any).ownerPhoto, THUMB.micro) || `https://picsum.photos/seed/${(video as any).ownerId}/64/64`} onError={onThumbError((video as any).ownerPhoto)} alt="" className="w-full h-full object-cover" />
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
            {(video as any).genre && <><span>Â·</span><span>{(video as any).genre}</span></>}
          </div>
        </div>
        {onAssignWorld && (
          <button
            onClick={e => { e.stopPropagation(); onAssignWorld(); }}
            className="p-2 text-white/20 hover:text-small-orange transition-colors opacity-0 group-hover:opacity-100 shrink-0"
            title="Assign to World"
          >
            <MoreVertical size={14} />
          </button>
        )}
        {onShareToClub && (
          <button
            onClick={e => { e.stopPropagation(); onShareToClub(); }}
            className="p-2 text-white/20 hover:text-small-orange transition-colors opacity-0 group-hover:opacity-100 shrink-0"
            title="Share to Club"
          >
            <Users size={13} />
          </button>
        )}
        {onSave && (
          <button
            onClick={e => { e.stopPropagation(); onSave(); }}
            className="p-2 text-white/20 hover:text-small-orange transition-colors opacity-0 group-hover:opacity-100 shrink-0"
            title="Save to playlist"
          >
            <ListPlus size={14} />
          </button>
        )}
      </div>
      {(video as any).worldId && (
        <div className="mt-2" onClick={e => e.stopPropagation()}>
          <WorldBadge worldId={(video as any).worldId} contentTitle={video.title} compact />
        </div>
      )}
    </motion.div>
  );
};

// ── Video World Assign Modal ─────────────────────────────────────────────────
const VideoWorldAssignModal: React.FC<{
  video: Video;
  worlds: { id: string; name: string }[];
  onClose: () => void;
  onSaved: (updated: Partial<Video>) => void;
}> = ({ video, worlds, onClose, onSaved }) => {
  const [worldId, setWorldId] = useState(video.worldId || '');
  const [characters, setCharacters] = useState<Character[]>([]);
  const [charIds, setCharIds] = useState<string[]>(video.characterIds || []);
  const [year, setYear] = useState<string>(video.timelinePointYear?.toString() || '');
  const [saving, setSaving] = useState(false);
  const [loadingChars, setLoadingChars] = useState(false);

  useEffect(() => {
    if (!worldId) { setCharacters([]); return; }
    setLoadingChars(true);
    fetchWorldCharacters(worldId, false)
      .then(c => setCharacters(c))
      .catch(() => setCharacters([]))
      .finally(() => setLoadingChars(false));
  }, [worldId]);

  const toggleChar = (id: string) =>
    setCharIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);

  const handleSave = async () => {
    setSaving(true);
    const updates: Partial<Video> = {
      worldId: worldId || undefined,
      characterIds: charIds.length ? charIds : undefined,
      timelinePointYear: year ? parseInt(year) : undefined,
    };
    try {
      await updateVideo(video.id, updates);
      onSaved(updates);
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#111] border border-white/10 rounded-3xl p-5 sm:p-8 w-full max-w-md space-y-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
            <Globe size={16} className="text-small-orange" /> Assign to World
          </h2>
          <button onClick={onClose} className="p-2 text-white/30 hover:text-white transition-colors"><X size={18} /></button>
        </div>
        <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest -mt-2">"{video.title}"</p>

        <div>
          <label className="block text-[9px] font-black uppercase tracking-widest text-white/40 mb-2">World</label>
          <select
            value={worldId}
            onChange={e => { setWorldId(e.target.value); setCharIds([]); }}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold outline-none appearance-none text-white"
          >
            <option value="" className="bg-[#111]">No World</option>
            {worlds.map(w => <option key={w.id} value={w.id} className="bg-[#111]">{w.name}</option>)}
          </select>
        </div>

        {worldId && (
          <div>
            <label className="block text-[9px] font-black uppercase tracking-widest text-white/40 mb-2">Characters (optional)</label>
            {loadingChars ? (
              <div className="text-[9px] text-white/30 font-bold uppercase tracking-widest">Loading…</div>
            ) : characters.length === 0 ? (
              <div className="text-[9px] text-white/20 font-bold uppercase tracking-widest">No characters in this world yet</div>
            ) : (
              <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto custom-scrollbar">
                {characters.map(c => (
                  <button
                    key={c.id}
                    onClick={() => toggleChar(c.id)}
                    className={`px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all border ${
                      charIds.includes(c.id)
                        ? 'bg-small-orange/20 border-small-orange/50 text-small-orange'
                        : 'bg-white/5 border-white/10 text-white/40 hover:border-white/30'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {worldId && (
          <div>
            <label className="block text-[9px] font-black uppercase tracking-widest text-white/40 mb-2">In-Universe Year / Timestamp (optional)</label>
            <input
              type="number"
              placeholder="e.g. 2047"
              value={year}
              onChange={e => setYear(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold outline-none text-white placeholder-white/20"
            />
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest text-white/40 border border-white/10 hover:border-white/30 transition-all">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest bg-small-orange text-white hover:bg-small-orange/80 transition-all disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

// â"€â"€ Section Row â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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

// â"€â"€ Live Feed Card (extracted to avoid hook-in-map) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const LiveFeedCard: React.FC<{ feed: LiveFeed; onSelect: () => void }> = ({ feed, onSelect }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="shrink-0 w-72 aspect-video rounded-2xl overflow-hidden bg-black relative cursor-pointer shadow-2xl ring-1 ring-red-500/30"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onSelect}
    >
      {/* Static preview — no iframe, no audio */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-black via-zinc-900 to-black">
        {feed.ownerPhoto ? (
          <img src={thumbUrl(feed.ownerPhoto, THUMB.micro) || undefined} loading="lazy" decoding="async" onError={onThumbError(feed.ownerPhoto)} alt="" className="w-14 h-14 rounded-full object-cover ring-2 ring-red-500/50" />
        ) : (
          <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center">
            <Radio size={24} className="text-white/30" />
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[8px] font-black uppercase tracking-widest text-red-400">Live</span>
        </div>
      </div>

      {/* Hover overlay — "tap to watch" prompt */}
      <div className={`absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity duration-200 ${hovered ? 'opacity-100' : 'opacity-0'}`}>
        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-full bg-red-500/90 flex items-center justify-center shadow-lg">
            <Play size={20} className="text-white ml-0.5" fill="white" />
          </div>
          <span className="text-[8px] font-black uppercase tracking-widest text-white/80">Watch Live</span>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/90 to-transparent">
        <p className="text-[10px] font-black uppercase tracking-widest truncate">{feed.title}</p>
        <p className="text-[8px] text-white/40 truncate mt-0.5">{feed.ownerName}</p>
      </div>
    </div>
  );
};

// â"€â"€ Main Component â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const VideoTab: React.FC<VideoTabProps> = ({ profile, isOwner, onSelectVideo, mode = 'VIDEOS', currentUser, onVisitUser, initialPlaylistId, onPlaylistOpened, onSetQueue }) => {
  const { playVideo } = useGlobalPlayerState();
  const { uploadFile } = useUpload();

  // Playlist UI state
  const [saveVideo, setSaveVideo] = useState<Video | null>(null);
  const [openPlaylistId, setOpenPlaylistId] = useState<string | null>(null);

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
  const [heroVideo, setHeroVideo] = useState<any>(null);
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeView, setActiveView] = useState<'discover' | 'uploads' | 'live' | 'playlists' | 'channel' | 'shorts' | 'subscriptions' | 'history' | 'liked'>('discover');
  // Deep-link: a shared playlist link opens straight to its detail under the Playlists tab.
  useEffect(() => {
    if (initialPlaylistId) {
      setActiveView('playlists');
      setOpenPlaylistId(initialPlaylistId);
      onPlaylistOpened?.();
    }
  }, [initialPlaylistId, onPlaylistOpened]);
  const [shortsIndex, setShortsIndex] = useState(0);
  const [shortsMuted, setShortsMuted] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [assigningVideo, setAssigningVideo] = useState<Video | null>(null);
  const [uploadStep, setUploadStep] = useState(1);
  const [thumbPreview, setThumbPreview] = useState('');
  const [coverPreview, setCoverPreview] = useState('');
  const [showYoutubeImport, setShowYoutubeImport] = useState(false);
  const [showGoLiveModal, setShowGoLiveModal] = useState(false);
  const [isLiveStreamActive, setIsLiveStreamActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [followingProfiles, setFollowingProfiles] = useState<UserProfile[]>([]);
  const [recommendedProfiles, setRecommendedProfiles] = useState<UserProfile[]>([]);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [signInAction, setSignInAction] = useState<string | null>(null);
  const [activeLiveStream, setActiveLiveStream] = useState<{ streamId: string; title: string; ownerName: string } | null>(null);

  // Continue Watching shelf — resume in-progress videos.
  const [continueWatching, setContinueWatching] = useState<WatchEntry[]>([]);
  useEffect(() => {
    let alive = true;
    getContinueWatching('VIDEO')
      .then(entries => { if (alive) setContinueWatching(entries); })
      .catch(() => { if (alive) setContinueWatching([]); });
    return () => { alive = false; };
  }, [currentUser?.uid]);

  // Open a Continue Watching card: prefer the loaded Video object; fall back to a
  // minimal Video shape so the player can still resume by id.
  const openWatchEntry = (entry: WatchEntry) => {
    const full = videos.find(v => v.id === entry.id);
    if (full) { handlePlay(full); return; }
    handlePlay({
      id: entry.id,
      title: entry.title || 'Video',
      url: '',
      ownerId: '',
      thumbnailUrl: entry.thumbnailUrl,
      worldId: entry.worldId,
      timestamp: entry.updatedAt,
    } as Video);
  };

  // Share to Club
  const [shareToClubVideo, setShareToClubVideo] = useState<Video | Album | null>(null);
  const [userClubs, setUserClubs] = useState<Club[]>([]);
  const [shareClubId, setShareClubId] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [shareSubmitting, setShareSubmitting] = useState(false);
  const [shareDone, setShareDone] = useState(false);

  // Load user's clubs for Share to Club
  useEffect(() => {
    const uid = currentUser?.uid || auth.currentUser?.uid;
    if (uid) fetchUserClubs(uid).then(setUserClubs).catch(() => {});
  }, [currentUser?.uid]);

  // Fetch discoverable channels — always load public channels, personalize when logged in
  useEffect(() => {
    const loadChannels = async () => {
      const userId = currentUser?.uid || auth.currentUser?.uid;
      try {
        const allUsers = await fetchAllUsers();
        if (userId) {
          const followed = await fetchFollowedArtists(userId);
          const ids = new Set(followed.map(u => u.uid));
          ids.add(userId);
          setFollowingProfiles(followed);
          setFollowedIds(ids);
          setRecommendedProfiles(allUsers.filter(u => u.uid !== userId && !ids.has(u.uid)).slice(0, 18));
        } else {
          setFollowingProfiles([]);
          setFollowedIds(new Set());
          setRecommendedProfiles(allUsers.slice(0, 18));
        }
      } catch (err) {
        setFollowingProfiles([]);
        setRecommendedProfiles([]);
        setFollowedIds(new Set());
      }
    };
    loadChannels();
  }, [currentUser?.uid]);

  const handleToggleFollow = async (profile: UserProfile) => {
    if (!auth.currentUser) { setSignInAction('follow creators'); return; }
    const isFollowed = followedIds.has(profile.uid);
    if (isFollowed) {
      await unfollowUser(profile.uid);
      setFollowingProfiles(prev => prev.filter(p => p.uid !== profile.uid));
      setRecommendedProfiles(prev => [profile, ...prev]);
      setFollowedIds(prev => {
        const next = new Set(prev);
        next.delete(profile.uid);
        return next;
      });
    } else {
      await followUser(profile.uid);
      setFollowingProfiles(prev => [...prev, profile]);
      setRecommendedProfiles(prev => prev.filter(p => p.uid !== profile.uid));
      setFollowedIds(prev => new Set(prev).add(profile.uid));
    }
  };

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
  const [selectedMovie, setSelectedMovie] = useState<Album | null>(null);
  const [movieCharacters, setMovieCharacters] = useState<Character[]>([]);

  useEffect(() => {
    if (!selectedMovie?.worldId) { setMovieCharacters([]); return; }
    fetchWorldCharacters(selectedMovie.worldId, false)
      .then(chars => setMovieCharacters(chars))
      .catch(() => setMovieCharacters([]));
  }, [selectedMovie?.worldId]);

  useEffect(() => { loadData(); }, [profile?.uid]);

  // Client-side Mux backfill — runs once per browser session.
  // Handles two cases:
  //   A) Videos with a public URL but no muxPlaybackId → re-ingest via create-asset-from-url
  //   B) Videos with a muxUploadId (direct upload) but no muxPlaybackId → resume polling
  useEffect(() => {
    if ((window as any).__muxBackfillTriggered) return;
    (window as any).__muxBackfillTriggered = true;

    (async () => {
      try {
        const { fetchAllVideos, updateVideo, pollMuxUploadUntilReady, createMuxAssetFromUrl } = await import('../services/backendService');
        const allVideos = await fetchAllVideos();

        // Case B: direct uploads still processing — resume polling by upload ID
        const pendingUploads = allVideos.filter(v => !v.muxPlaybackId && (v as any).muxUploadId);
        for (const v of pendingUploads) {
          const uploadId = (v as any).muxUploadId as string;
          console.log(`[Mux Backfill] Resuming poll for direct upload: ${v.id}`);
          pollMuxUploadUntilReady(uploadId, async (playbackId, assetId) => {
            await updateVideo(v.id, {
              muxPlaybackId: playbackId,
              muxAssetId: assetId,
              muxUploadId: null,
            } as any);
            console.log(`[Mux Backfill] ✓ direct upload resolved: ${v.id} → ${playbackId}`);
          }, 300, 5000);
        }

        // Case A: URL-based videos not yet in Mux
        const toBackfill = allVideos.filter(v =>
          !v.muxPlaybackId &&
          !(v as any).muxUploadId &&
          v.url &&
          !v.url.includes('youtube.com') &&
          !v.url.includes('youtu.be') &&
          !v.url.includes('vimeo.com')
        );
        if (toBackfill.length === 0 && pendingUploads.length === 0) {
          console.log('[Mux Backfill] All videos already transcoded.');
          return;
        }
        if (toBackfill.length > 0) {
          console.log(`[Mux Backfill] Queuing ${toBackfill.length} URL-based videos for Mux transcoding…`);
          for (const v of toBackfill.slice(0, 20)) {
            (async () => {
              try {
                const { assetId, playbackId } = await createMuxAssetFromUrl(v.url);
                if (assetId || playbackId) {
                  await updateVideo(v.id, {
                    ...(assetId    ? { muxAssetId:    assetId    } : {}),
                    ...(playbackId ? { muxPlaybackId: playbackId } : {}),
                  });
                  console.log(`[Mux Backfill] ✓ ${v.id} → ${playbackId}`);
                }
              } catch (err) {
                console.warn(`[Mux Backfill] ✗ ${v.id}:`, err);
              }
            })();
          }
        }
      } catch (err) {
        console.warn('[Mux Backfill] failed:', err);
      }
    })();
  }, []);

  const loadData = async () => {
    try {
      const [vids, pls, uVids, allAlbums, settings] = await Promise.all([
        fetchAllVideos(),
        fetchVideoPlaylists(),
        profile?.uid ? fetchUserVideos(profile.uid) : Promise.resolve([]),
        fetchAllPublicAlbums(),
        fetchSystemSettingsConfig()
      ]);
      fetchAllLiveFeeds(setLiveFeeds);
      if (vids.length) {
        const pool = vids.slice(0, Math.min(vids.length, 20));
        setHeroVideo(pool[Math.floor(Math.random() * pool.length)]);
      }
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
    } catch (error) {
      console.error('VideoTab: failed to load content:', error);
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
    const sub = (item as any).subType || '';
    const isCinema = sub === 'MOVIE' || sub === 'Movie' || sub === 'Short Film' || sub === 'TV_SERIES' || sub === 'TV Series';
    if (!isCinema && (item as any).type === 'VIDEO' && sub) playVideo(item as any);
    onSelectVideo?.(item);
  };

  const handleShareToClub = async () => {
    if (!shareClubId || !shareToClubVideo) return;
    setShareSubmitting(true);
    try {
      const thumb = (shareToClubVideo as any).muxPlaybackId
        ? `https://image.mux.com/${(shareToClubVideo as any).muxPlaybackId}/thumbnail.png?width=400&height=225&time=5`
        : (shareToClubVideo as any).thumbnailUrl || (shareToClubVideo as any).coverImage || '';
      await createClubPost({
        clubId: shareClubId,
        content: shareMessage || `Check out "${shareToClubVideo.title}" on Reelo!`,
        type: 'POST',
        attachments: [{
          type: 'VIDEO',
          url: (shareToClubVideo as any).url || '',
          title: shareToClubVideo.title,
          thumbnailUrl: thumb,
          assetId: shareToClubVideo.id,
        }],
      });
      setShareDone(true);
      setTimeout(() => { setShareToClubVideo(null); setShareDone(false); setShareMessage(''); setShareClubId(''); }, 2000);
    } finally {
      setShareSubmitting(false);
    }
  };

  const addTag = () => {
    if (tagInput.trim() && !(newVideo.tags || []).includes(tagInput.trim())) {
      setNewVideo(v => ({ ...v, tags: [...(v.tags || []), tagInput.trim()] }));
      setTagInput('');
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
      setUploadStep(1);
      setThumbPreview('');
      setCoverPreview('');
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

  // â"€â"€ Render â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  return (
    <div className="flex-1 min-h-0">
      {/* â"€â"€ Top Bar â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      <div className="sticky top-0 z-40 glass-nav border-b border-white/5 px-4 sm:px-6 lg:px-12 py-4">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <h1 className="text-xl font-black uppercase tracking-widest shrink-0 hidden lg:block">
            {mode === 'MOVIES_TV' ? 'Plajah Taleo' : 'Plajah Reello'}
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

          {/* Actions — always visible; require auth when clicked */}
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            <button
              onClick={() => { if (!auth.currentUser) { setSignInAction('go live'); return; } setShowGoLiveModal(true); }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all font-black text-[9px] uppercase tracking-widest ${isLiveStreamActive ? 'bg-green-600 text-white' : 'bg-red-600/80 text-white hover:bg-red-600'}`}
            >
              <Radio size={14} /> {isLiveStreamActive ? 'Live' : 'Go Live'}
            </button>
            {isOwner && (
              <button onClick={() => setShowYoutubeImport(true)} className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 text-white rounded-xl hover:bg-white/10 transition-all font-black text-[9px] uppercase tracking-widest">
                <Plus size={14} /> Import
              </button>
            )}
            <button
              onClick={() => { if (!auth.currentUser) { setSignInAction('upload videos'); return; } setShowUpload(true); }}
              className="flex items-center gap-2 px-4 py-2.5 bg-white text-black rounded-xl hover:bg-small-orange hover:text-white transition-all font-black text-[9px] uppercase tracking-widest shadow-lg"
            >
              <Upload size={14} /> Upload
            </button>
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

      {/* Plajah+ Banner */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 pt-4 pb-2">
        <PlajahPlusBanner variant="COMPACT" />
      </div>

      <div className="flex max-w-7xl mx-auto">
        {/* Sidebar nav (desktop) */}
        <div className="hidden lg:flex flex-col gap-1 w-44 shrink-0 sticky top-32 h-fit pt-8 px-6">
          {[
            { id: 'discover', label: 'Discover', icon: Sparkles },
            { id: 'subscriptions', label: 'Subscriptions', icon: Users },
            { id: 'shorts', label: 'Shorts', icon: Smartphone },
            { id: 'uploads', label: 'My Videos', icon: Film },
            { id: 'live', label: 'Live', icon: Radio },
            { id: 'playlists', label: 'Playlists', icon: List },
            { id: 'liked', label: 'Liked', icon: Heart },
            { id: 'history', label: 'History', icon: Clock },
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
        <div className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 lg:pl-0 space-y-2">

          {/* Mobile view tabs */}
          <div className="flex gap-2 lg:hidden mb-6 overflow-x-auto no-scrollbar">
            {(['discover', 'subscriptions', 'shorts', 'uploads', 'live', 'playlists', 'liked', 'history', 'channel'] as const).map(v => (
              <button key={v} onClick={() => setActiveView(v)} className={`px-4 py-2 rounded-full font-black text-[9px] uppercase tracking-widest whitespace-nowrap shrink-0 transition-all ${activeView === v ? 'bg-white text-black' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>{v}</button>
            ))}
          </div>

          {/* â"€â"€ DISCOVER â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
          {activeView === 'discover' && (
            <div className="space-y-2">
              {/* Owner upload CTA banner */}
              {isOwner && (
                <div className="flex items-center gap-4 mb-6 p-4 bg-white/[0.03] border border-white/5 rounded-2xl">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black uppercase tracking-widest text-white/60">Share your content</p>
                    <p className="text-[10px] text-white/30 mt-0.5">Upload videos, movies, or import from YouTube</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setShowGoLiveModal(true)} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-600/80 text-white font-black text-[9px] uppercase tracking-widest hover:bg-red-600 transition-all">
                      <Radio size={12} /> Go Live
                    </button>
                    <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-black font-black text-[9px] uppercase tracking-widest hover:bg-small-orange hover:text-white transition-all shadow-lg">
                      <Upload size={12} /> Upload Video
                    </button>
                  </div>
                </div>
              )}

              {/* Stories bar */}
              {(currentUser?.uid || auth.currentUser?.uid) && (
                <div className="mb-6 -mx-2">
                  <StoriesBar
                    currentUserId={currentUser?.uid || auth.currentUser?.uid || ''}
                    currentUserName={currentUser?.displayName || auth.currentUser?.displayName || 'You'}
                    currentUserPhoto={currentUser?.photoURL || auth.currentUser?.photoURL || ''}
                    followedUids={Array.from(followedIds)}
                    onVisitUser={uid => onVisitUser?.(uid)}
                  />
                </div>
              )}

              {/* Continue Watching shelf — resume in-progress videos */}
              {!searchTerm && continueWatching.length > 0 && (
                <section className="mb-10">
                  <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2.5 mb-5">
                    <Clock className="text-small-orange" size={16} /> Continue Watching
                  </h2>
                  <div className="flex gap-4 overflow-x-auto pb-3 custom-scrollbar snap-x -mx-1 px-1">
                    {continueWatching.map(entry => {
                      const pct = entry.durationSec > 0
                        ? Math.min(100, Math.max(0, (entry.positionSec / entry.durationSec) * 100))
                        : 0;
                      return (
                        <button
                          key={entry.id}
                          onClick={() => openWatchEntry(entry)}
                          className="shrink-0 snap-start w-56 text-left group"
                        >
                          <div className="relative overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/5 aspect-video mb-2">
                            {entry.thumbnailUrl
                              ? <img src={thumbUrl(entry.thumbnailUrl, THUMB.card) || undefined} alt={entry.title || ''} loading="lazy" decoding="async" onError={onThumbError(entry.thumbnailUrl)} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                              : <div className="w-full h-full flex items-center justify-center text-white/20"><Play size={22} /></div>}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                              <div className="w-10 h-10 rounded-full bg-white/0 group-hover:bg-white/20 border-2 border-white/0 group-hover:border-white/60 flex items-center justify-center transition-all scale-75 group-hover:scale-100">
                                <Play fill="white" size={15} className="ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                            </div>
                            {/* Progress bar */}
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                              <div className="h-full bg-small-orange" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                          <h3 className="text-[10px] font-black uppercase tracking-widest text-white leading-tight line-clamp-2 group-hover:text-small-orange transition-colors">
                            {entry.title || 'Untitled'}
                          </h3>
                          {entry.ownerName && (
                            <p className="text-[8px] font-bold text-white/30 uppercase tracking-widest truncate mt-0.5">{entry.ownerName}</p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Search results — shown instead of discover when query is active */}
              {searchTerm.length >= 2 && (
                <section className="mb-10">
                  <h2 className="text-xs font-black uppercase tracking-widest text-white/50 mb-5 flex items-center gap-2">
                    <Search size={13} className="text-small-orange" />
                    {filteredVideos.length} result{filteredVideos.length !== 1 ? 's' : ''} for &ldquo;{searchTerm}&rdquo;
                  </h2>
                  {filteredVideos.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                      {filteredVideos.map(v => (
                        <VideoCard key={v.id} video={v} onPlay={() => handlePlay(v)} showChannel currentUser={currentUser} onShareToClub={auth.currentUser ? () => setShareToClubVideo(v) : undefined} onSave={auth.currentUser ? () => setSaveVideo(v as Video) : undefined} />
                      ))}
                    </div>
                  ) : (
                    <div className="py-20 bg-white/[0.02] rounded-2xl border border-dashed border-white/5 text-center">
                      <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest">No videos match &ldquo;{searchTerm}&rdquo;</p>
                    </div>
                  )}
                </section>
              )}

              {/* Prominent hero — random user video, hidden when searching */}
              {!searchTerm && (() => {
                const heroItem = mode === 'MOVIES_TV'
                  ? ([...movies, ...tvSeries][Math.floor(Math.random() * (movies.length + tvSeries.length))] ?? heroVideo)
                  : heroVideo;
                if (!heroItem) return null;
                const heroMuxId = (heroItem as any).muxPlaybackId as string | undefined;
                const thumb = heroMuxId
                  ? `https://image.mux.com/${heroMuxId}/thumbnail.png?width=1280&height=720&time=5`
                  : (heroItem.thumbnailUrl || heroItem.coverImage || `https://picsum.photos/seed/${heroItem.id}/1280/720`);
                const creator = heroItem.artist || heroItem.ownerName || 'Creator';
                const genre = heroItem.genre || heroItem.subType?.replace('_', ' ') || 'Video';
                return (
                  <div
                    className="relative rounded-[2rem] overflow-hidden mb-6 sm:mb-12 cursor-pointer group shadow-2xl"
                    style={{ height: 480 }}
                    onClick={() => handlePlay(heroItem)}
                  >
                    <img
                      src={thumbUrl(thumb, THUMB.large)}
                      alt={heroItem.title}
                      loading="lazy"
                      decoding="async"
                      onError={onThumbError(thumb)}
                      className="absolute inset-0 w-full h-full object-cover scale-105 group-hover:scale-110 transition-transform duration-700"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/10" />
                    <div className="absolute top-6 left-6 flex items-center gap-2">
                      <span className="px-3 py-1.5 bg-small-orange/90 backdrop-blur-md rounded-xl text-[9px] font-black uppercase tracking-widest text-white shadow-lg">
                        Featured
                      </span>
                      <span className="px-3 py-1.5 bg-white/10 backdrop-blur-md rounded-xl text-[9px] font-black uppercase tracking-widest text-white/80 border border-white/10">
                        {genre}
                      </span>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                      <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-md border-2 border-white/50 flex items-center justify-center shadow-2xl">
                        <Play fill="white" size={32} className="ml-1" />
                      </div>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-8">
                      <div className="flex items-end justify-between gap-4 sm:gap-6">
                        <div className="flex-1 min-w-0">
                          <p className="text-[9px] font-black uppercase tracking-widest text-white/50 mb-2">{creator}</p>
                          <h2 className="text-3xl lg:text-5xl font-black uppercase tracking-tight leading-tight text-white mb-1 drop-shadow-lg line-clamp-2">
                            {heroItem.title}
                          </h2>
                        </div>
                        <button
                          className="flex items-center gap-3 px-7 py-4 bg-white text-black rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-small-orange hover:text-white transition-all shadow-2xl shrink-0"
                          onClick={(e) => { e.stopPropagation(); handlePlay(heroItem); }}
                        >
                          <Play fill="currentColor" size={16} /> Watch Now
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {!searchTerm && <>
              {/* Music Videos section */}
              {mode === 'VIDEOS' && musicVideos.length > 0 && (
                <VideoRow title="Music Videos" icon={Music2} videos={musicVideos} onSelect={handlePlay} />
              )}

              {/* Club Picks — videos shared in clubs */}
              {mode === 'VIDEOS' && auth.currentUser && userClubs.length > 0 && (
                <section className="mb-14">
                  <div className="flex items-center justify-between mb-5">
                    <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2.5">
                      <Users className="text-small-orange" size={16} /> Club Picks
                    </h2>
                    <span className="text-[9px] font-black uppercase tracking-widest text-white/25 border border-white/10 px-2 py-0.5 rounded-lg">{userClubs.length} clubs</span>
                  </div>
                  <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                    {userClubs.map(club => (
                      <div key={club.id} className="shrink-0 w-52 p-4 bg-white/[0.03] border border-white/8 hover:border-small-orange/30 rounded-2xl transition-all group cursor-pointer space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl overflow-hidden bg-white/10 shrink-0">
                            {club.iconImage
                              ? <img src={thumbUrl(club.iconImage, THUMB.micro) || undefined} decoding="async" onError={onThumbError(club.iconImage)} className="w-full h-full object-cover" alt="" loading="lazy" />
                              : <div className="w-full h-full flex items-center justify-center"><Users size={14} className="text-white/20" /></div>}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[9px] font-black uppercase tracking-tight truncate group-hover:text-small-orange transition-colors">{club.name}</p>
                            <p className="text-[7px] text-white/25 font-bold uppercase">{club.memberCount || 0} members</p>
                          </div>
                        </div>
                        <p className="text-[8px] text-white/30 line-clamp-2">{club.description || 'A community for fans'}</p>
                      </div>
                    ))}
                  </div>
                </section>
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
                      <LiveFeedCard
                        key={feed.id}
                        feed={feed}
                        onSelect={() => {
                          if (feed.url?.startsWith('livestream:')) {
                            const sid = feed.url.replace('livestream:', '');
                            setActiveLiveStream({ streamId: sid, title: feed.title, ownerName: (feed as any).ownerName || '' });
                          } else {
                            onSelectVideo?.(feed as any);
                          }
                        }}
                      />
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
                  {mustWatchMovies.length > 0 && <VideoRow title="Must Watch Cinema" icon={Monitor} videos={mustWatchMovies} onSelect={(item) => { setSelectedMovie(item as Album); handlePlay(item); }} />}
                  <VideoRow title="Movies" icon={Film} videos={movies} onSelect={(item) => { setSelectedMovie(item as Album); handlePlay(item); }} />
                  <VideoRow title="TV Series" icon={Tv} videos={tvSeries} onSelect={(item) => { setSelectedMovie(item as Album); handlePlay(item); }} />

                  {/* Movie / TV detail panel */}
                  {selectedMovie && (
                    <div className="mt-6 p-4 sm:p-8 bg-white/[0.03] border border-white/10 rounded-[3rem] space-y-8 animate-in fade-in duration-300">
                      {/* Header */}
                      <div className="flex items-start gap-4 sm:gap-6">
                        <div className="w-28 h-40 rounded-2xl overflow-hidden shrink-0 shadow-2xl ring-1 ring-white/10">
                          <img loading="lazy" decoding="async" src={thumbUrl(selectedMovie.coverImage, THUMB.card) || undefined} onError={onThumbError(selectedMovie.coverImage)} alt={selectedMovie.title} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[9px] font-black uppercase tracking-[0.4em] text-white/30 mb-2">{selectedMovie.subType?.replace('_', ' ')} Â· {selectedMovie.movieMetadata?.releaseYear}</p>
                          <h3 className="text-3xl font-display font-black tracking-tight uppercase mb-2 leading-tight">{selectedMovie.title}</h3>
                          <p className="text-sm text-white/50 leading-relaxed line-clamp-3">{selectedMovie.description}</p>
                          <button type="button" onClick={() => setSelectedMovie(null)} className="mt-4 text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-white transition-colors">Dismiss</button>
                        </div>
                      </div>

                      {/* Characters */}
                      {movieCharacters.length > 0 && (
                        <div className="space-y-4">
                          <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 flex items-center gap-2">
                            <span className="w-4 h-px bg-white/20" /> Characters
                          </h4>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {movieCharacters.map(char => (
                              <div key={char.id} className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-2">
                                <div className="w-10 h-10 rounded-xl bg-white/10 overflow-hidden">
                                  {char.imageUrl ? <img loading="lazy" decoding="async" src={thumbUrl(char.imageUrl, THUMB.micro) || undefined} onError={onThumbError(char.imageUrl)} alt={char.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white/20 text-lg font-black">{char.name[0]}</div>}
                                </div>
                                <p className="text-xs font-black uppercase tracking-tight text-white leading-tight">{char.name}</p>
                                {char.role && <p className="text-[8px] font-bold uppercase tracking-widest text-white/30">{char.role}</p>}
                                {char.actorName && <p className="text-[8px] font-bold text-white/40">played by {char.actorName}</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Cast */}
                      {(selectedMovie.movieMetadata?.castMembers?.length ?? 0) > 0 && (
                        <div className="space-y-4">
                          <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 flex items-center gap-2">
                            <span className="w-4 h-px bg-white/20" /> Cast
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {selectedMovie.movieMetadata!.castMembers!.map(m => (
                              <div key={m.id} className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/5">
                                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 text-sm font-black text-blue-300">{m.actorName[0]}</div>
                                <div className="min-w-0">
                                  <p className="text-sm font-black text-white truncate">{m.actorName}</p>
                                  {m.characterName && <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">as {m.characterName}{m.role ? ` Â· ${m.role}` : ''}</p>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Production Credits */}
                      {(selectedMovie.movieMetadata?.productionCredits?.length ?? 0) > 0 && (
                        <div className="space-y-4">
                          <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 flex items-center gap-2">
                            <span className="w-4 h-px bg-white/20" /> Production
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                            {selectedMovie.movieMetadata!.productionCredits!.map(c => (
                              <div key={c.id} className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                <p className="text-sm font-black text-white">{c.name}</p>
                                <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">{c.role}</p>
                                <p className="text-[8px] font-bold text-white/20 uppercase tracking-widest">{c.department}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Fallback for legacy cast/crew strings */}
                      {!(selectedMovie.movieMetadata?.castMembers?.length) && (selectedMovie.movieMetadata?.cast?.length ?? 0) > 0 && (
                        <div className="space-y-3">
                          <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Cast</h4>
                          <div className="flex flex-wrap gap-2">
                            {selectedMovie.movieMetadata!.cast!.filter(Boolean).map((name, i) => (
                              <span key={i} className="px-4 py-2 bg-white/5 rounded-full text-[10px] font-black uppercase tracking-widest text-white/60 border border-white/5">{name}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Global latest */}
              {interestVideos[0] && mode === 'VIDEOS' && (
                <section className="mb-10">
                  <div className="relative rounded-[2.5rem] overflow-hidden bg-gradient-to-br from-white/[0.04] to-transparent border border-white/5 p-4 sm:p-8 lg:p-12">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-10 items-center">
                      <div className="relative aspect-video rounded-2xl overflow-hidden shadow-2xl group cursor-pointer" onClick={() => handlePlay(interestVideos[0])}>
                        <img src={thumbUrl(interestVideos[0].thumbnailUrl, THUMB.large) || `https://picsum.photos/seed/${interestVideos[0].id}/1280/720`} onError={onThumbError(interestVideos[0].thumbnailUrl)} decoding="async" className="w-full h-full object-cover" alt="" loading="lazy" />
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
              </>}
            </div>
          )}

          {/* â"€â"€ MY VIDEOS â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
          {activeView === 'uploads' && (
            <div className="space-y-6 pt-2">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black uppercase tracking-widest">My Videos <span className="text-white/20 ml-2">{userVideos.length}</span></h2>
                {isOwner && <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 px-5 py-2.5 bg-white text-black rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-small-orange hover:text-white transition-all"><Plus size={14} /> Upload</button>}
              </div>
              {userVideos.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {userVideos.map(video => (
                    <VideoCard
                      key={video.id}
                      video={video}
                      onPlay={() => handlePlay(video)}
                      currentUser={currentUser}
                      onAssignWorld={isOwner ? () => setAssigningVideo(video) : undefined}
                      onShareToClub={auth.currentUser ? () => setShareToClubVideo(video) : undefined}
                      onSave={auth.currentUser ? () => setSaveVideo(video as Video) : undefined}
                    />
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

          {/* â"€â"€ LIVE â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
          {activeView === 'live' && (
            <div className="space-y-8 pt-2">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black uppercase tracking-widest">Live Studio</h2>
                <button onClick={() => setShowGoLiveModal(true)} className="flex items-center gap-2 px-5 py-2.5 bg-white/5 border border-white/10 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-white/10 transition-all"><Settings2 size={14} /> Broadcast Studio</button>
              </div>
              <div className={`p-4 sm:p-8 rounded-3xl border flex items-center gap-4 sm:gap-6 ${isLiveStreamActive ? 'bg-green-500/10 border-green-500/30' : 'bg-white/[0.02] border-white/5 border-dashed'}`}>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isLiveStreamActive ? 'bg-green-500' : 'bg-white/5'}`}>
                  <Radio size={22} className={isLiveStreamActive ? 'text-white' : 'text-white/20'} />
                </div>
                <div className="flex-1">
                  <h3 className="font-black uppercase tracking-widest text-sm mb-1">{isLiveStreamActive ? 'Broadcast is Live' : 'Currently Offline'}</h3>
                  <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest">{isLiveStreamActive ? 'You are broadcasting right now.' : 'Start a broadcast to go live.'}</p>
                </div>
                <button onClick={() => setShowGoLiveModal(true)} className={`px-6 py-3 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all ${isLiveStreamActive ? 'bg-red-600 text-white' : 'bg-white text-black hover:bg-small-orange hover:text-white'}`}>{isLiveStreamActive ? 'End Broadcast' : 'Go Live'}</button>
              </div>
              <VideoRow title="Past Live Streams" icon={Radio} videos={userVideos.filter(v => v.isLiveRecording || v.genre === 'Live')} onSelect={handlePlay} emptyMessage="No past live streams yet — saved replays land here when you end a stream." />
            </div>
          )}

          {/* ── SHORTS ───────────────────────────────────────────────────────────────────── */}
          {activeView === 'shorts' && (() => {
            const shortVideos = [...videos].sort((a, b) => b.timestamp - a.timestamp).slice(0, 30);
            if (!shortVideos.length) return (
              <div className="py-32 text-center">
                <Smartphone size={48} className="text-white/10 mx-auto mb-4" />
                <p className="text-[10px] font-black uppercase tracking-widest text-white/20">No shorts yet</p>
              </div>
            );
            const short = shortVideos[shortsIndex] as any;
            const thumb = short?.thumbnailUrl || short?.coverImage || `https://picsum.photos/seed/${short?.id}/720/1280`;
            return (
              <div className="relative flex justify-center py-4">
                <div className="relative overflow-hidden rounded-[2.5rem] shadow-2xl" style={{ width: 380, height: 680, background: '#000' }}>
                  <div className="absolute inset-0" style={{ backgroundImage: `url(${thumb})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(40px) brightness(0.25)', transform: 'scale(1.15)' }} />
                  <img src={thumbUrl(thumb, THUMB.large)} loading="lazy" decoding="async" onError={onThumbError(thumb)} className="absolute inset-0 w-full h-full object-contain z-[1]" alt={short?.title} />
                  <div className="absolute inset-0 z-[2]" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, transparent 50%, rgba(0,0,0,0.25) 100%)' }} />
                  <button className="absolute inset-0 z-[3] flex items-center justify-center" onClick={() => handlePlay(short)}>
                    <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md border-2 border-white/50 flex items-center justify-center shadow-2xl hover:bg-white/30 transition-all">
                      <Play fill="white" size={24} className="ml-1" />
                    </div>
                  </button>
                  <div className="absolute right-4 bottom-28 z-[4] flex flex-col items-center gap-5">
                    <button className="flex flex-col items-center gap-1 group" onClick={() => { if (!auth.currentUser) setSignInAction('like videos'); }}>
                      <div className="w-11 h-11 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center group-hover:bg-white/20 transition-all"><Heart size={20} className="text-white" /></div>
                      <span className="text-[9px] font-black text-white/60">{(short?.likesCount || 0) > 999 ? `${((short?.likesCount||0)/1000).toFixed(1)}k` : (short?.likesCount||0)}</span>
                    </button>
                    <button className="flex flex-col items-center gap-1 group" onClick={() => handlePlay(short)}>
                      <div className="w-11 h-11 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center group-hover:bg-white/20 transition-all"><MessageCircle size={20} className="text-white" /></div>
                      <span className="text-[9px] font-black text-white/60">{short?.commentsCount || 0}</span>
                    </button>
                    <button className="flex flex-col items-center gap-1 group">
                      <div className="w-11 h-11 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center group-hover:bg-white/20 transition-all"><Share2 size={20} className="text-white" /></div>
                      <span className="text-[9px] font-black text-white/60">Share</span>
                    </button>
                    <button onClick={() => setShortsMuted(v => !v)} className="w-11 h-11 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-white/20 transition-all">
                      {shortsMuted ? <VolumeX size={18} className="text-white" /> : <Volume2 size={18} className="text-white" />}
                    </button>
                  </div>
                  <div className="absolute left-4 right-16 bottom-6 z-[4]">
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/50 mb-1">{short?.artist || short?.ownerName || 'Creator'}</p>
                    <h3 className="text-base font-black uppercase tracking-tight text-white leading-tight line-clamp-2 mb-2">{short?.title}</h3>
                    {short?.description && <p className="text-[10px] text-white/40 line-clamp-2 leading-relaxed">{short.description}</p>}
                  </div>
                  <div className="absolute top-4 left-0 right-0 flex justify-center gap-1 z-[4]">
                    {shortVideos.slice(0, Math.min(shortVideos.length, 8)).map((_, i) => (
                      <div key={i} className={`h-0.5 rounded-full transition-all ${i === shortsIndex % 8 ? 'w-6 bg-white' : 'w-2 bg-white/30'}`} />
                    ))}
                  </div>
                </div>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 flex flex-col gap-3 pr-2">
                  <button onClick={() => setShortsIndex(i => Math.max(0, i - 1))} disabled={shortsIndex === 0} className="w-12 h-12 rounded-full bg-white/8 border border-white/10 flex items-center justify-center hover:bg-white/20 transition-all disabled:opacity-20"><ChevronUp size={20} /></button>
                  <button onClick={() => setShortsIndex(i => Math.min(shortVideos.length - 1, i + 1))} disabled={shortsIndex >= shortVideos.length - 1} className="w-12 h-12 rounded-full bg-white/8 border border-white/10 flex items-center justify-center hover:bg-white/20 transition-all disabled:opacity-20"><ChevronDown size={20} /></button>
                </div>
              </div>
            );
          })()}

          {/* â"€â"€ PLAYLISTS â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
          {activeView === 'playlists' && (
            openPlaylistId ? (
              <VideoPlaylistDetailView
                playlistId={openPlaylistId}
                onBack={() => setOpenPlaylistId(null)}
                onPlayVideo={(v, q) => { if (q && q.length) onSetQueue?.(q); handlePlay(v); }}
              />
            ) : (
              <VideoPlaylistSection onOpenPlaylist={(id) => setOpenPlaylistId(id)} />
            )
          )}

          {/* ── SUBSCRIPTIONS ── */}
          {activeView === 'subscriptions' && (
            <SubscriptionsSection onPlay={(v) => handlePlay(v)} onVisitUser={onVisitUser} />
          )}

          {/* ── LIKED ── */}
          {activeView === 'liked' && (
            <LikedVideosSection onPlay={(v) => handlePlay(v)} />
          )}

          {/* ── HISTORY ── */}
          {activeView === 'history' && (
            <HistorySection onPlay={(v) => handlePlay(v)} />
          )}

          {/* â"€â"€ CHANNELS â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
          {activeView === 'channel' && (
            <div className="space-y-8 pt-2">
              <div>
                <h2 className="text-lg font-black uppercase tracking-widest">Channels</h2>
                <p className="text-[10px] text-white/40 uppercase tracking-[0.4em] mt-2 max-w-2xl">
                  Discover creators to follow and build your channel network with fresh accounts.
                </p>
              </div>

              {followingProfiles.length > 0 ? (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 mb-4">Following</h3>
                    <div className="flex gap-4 flex-wrap">
                      {followingProfiles.map(p => (
                        <button key={p.uid} onClick={() => onVisitUser?.(p.uid)} className="flex flex-col items-center gap-2 group">
                          <div className="w-14 h-14 rounded-full overflow-hidden ring-2 ring-white/10 group-hover:ring-small-orange/60 transition-all">
                            {p.photoURL
                              ? <img loading="lazy" decoding="async" src={thumbUrl(p.photoURL, THUMB.micro) || undefined} onError={onThumbError(p.photoURL)} alt={p.displayName} className="w-full h-full object-cover" />
                              : <div className="w-full h-full bg-white/10 flex items-center justify-center text-white/40 text-lg font-black">{p.displayName?.[0]}</div>}
                          </div>
                          <span className="text-[8px] font-black uppercase tracking-widest text-white/40 group-hover:text-white transition-colors max-w-[60px] truncate">{p.displayName}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-20 text-center bg-white/5 rounded-[3rem] border border-dashed border-white/10">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/20">You aren't following any channels yet</p>
                </div>
              )}

              {recommendedProfiles.length > 0 && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                    <div>
                      <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 mb-2">Discover</h3>
                      <p className="text-[9px] text-white/30 uppercase tracking-widest">Suggested accounts you can follow.</p>
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-white/30">{recommendedProfiles.length} suggestions</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {recommendedProfiles.map(p => {
                      const isFollowed = followedIds.has(p.uid);
                      return (
                        <div key={p.uid} className="p-4 bg-white/5 border border-white/5 rounded-3xl">
                          <button onClick={() => onVisitUser?.(p.uid)} className="w-full text-left">
                            <div className="flex items-center gap-3 mb-4">
                              <div className="w-12 h-12 rounded-full overflow-hidden bg-white/10 ring-1 ring-white/10">
                                {p.photoURL
                                  ? <img loading="lazy" decoding="async" src={thumbUrl(p.photoURL, THUMB.micro) || undefined} onError={onThumbError(p.photoURL)} alt={p.displayName} className="w-full h-full object-cover" />
                                  : <div className="w-full h-full flex items-center justify-center text-white/40 text-lg font-black">{p.displayName?.[0]}</div>}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-black uppercase tracking-widest text-white truncate">{p.displayName}</p>
                                <p className="text-[8px] text-white/30 uppercase tracking-widest truncate">{p.bio || 'Creator'}</p>
                              </div>
                            </div>
                          </button>
                          <button
                            onClick={() => handleToggleFollow(p)}
                            className={`w-full px-3 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${isFollowed ? 'bg-white/10 border border-white/10 text-white/70 hover:bg-white/15' : 'bg-white text-black hover:bg-small-orange hover:text-white'}`}
                          >
                            {isFollowed ? 'Following' : 'Follow'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* â"€â"€ Upload Wizard â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      <AnimatePresence>
        {showUpload && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-2xl z-[200] flex items-center justify-center p-4 lg:p-8">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="max-w-4xl w-full max-h-[92vh] bg-[#0a0a0a]/98 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] overflow-hidden shadow-[0_40px_80px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.06)] flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 sm:px-8 pt-6 sm:pt-8 pb-5 border-b border-white/5 shrink-0">
                <div>
                  <h2 className="text-2xl font-display font-black tracking-tight uppercase">Upload Video</h2>
                  <p className="text-[9px] font-black uppercase tracking-[0.4em] text-white/30 mt-1">Step {uploadStep} of 3</p>
                </div>
                <button onClick={() => { if (!uploading) { setShowUpload(false); setUploadStep(1); } }} className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl text-white/40 hover:text-white transition-all">
                  <X size={20} />
                </button>
              </div>

              {/* Step indicator */}
              <div className="flex px-4 sm:px-8 py-4 gap-3 shrink-0">
                {[
                  { n: 1, label: 'Select' },
                  { n: 2, label: 'Details' },
                  { n: 3, label: 'Publish' },
                ].map(({ n, label }) => (
                  <div key={n} className="flex items-center gap-2 flex-1">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-black transition-all shrink-0 ${uploadStep >= n ? 'bg-white text-black' : 'bg-white/10 text-white/30'}`}>
                      {uploadStep > n ? <Check size={12} /> : n}
                    </div>
                    <span className={`text-[9px] font-black uppercase tracking-widest transition-all ${uploadStep >= n ? 'text-white' : 'text-white/25'}`}>{label}</span>
                    {n < 3 && <div className={`h-px flex-1 transition-all ${uploadStep > n ? 'bg-white/40' : 'bg-white/10'}`} />}
                  </div>
                ))}
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                <AnimatePresence mode="wait">

                  {/* â"€â"€ STEP 1: SELECT â"€â"€ */}
                  {uploadStep === 1 && (
                    <motion.div
                      key="step1"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="p-4 sm:p-8 space-y-8"
                    >
                      {/* Video type */}
                      <div>
                        <label className="block text-[9px] font-black uppercase tracking-[0.4em] text-white/30 mb-5">What are you uploading?</label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {[
                            { label: 'Video', value: 'VIDEO', icon: Film, desc: 'General content, vlogs, tutorials' },
                            { label: 'Music Video', value: 'MUSIC_VIDEO', icon: Music2, desc: 'Link to a song on your profile' },
                            { label: 'Movie', value: 'MOVIE', icon: Monitor, desc: 'Feature film or short film' },
                            { label: 'TV Series', value: 'TV_SERIES', icon: Tv, desc: 'Multi-episode series' },
                          ].map(({ label, value, icon: Icon, desc }) => {
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
                                  if (value === 'MUSIC_VIDEO') setNewVideo(v => ({ ...v, subType: undefined, genre: 'Music Video', category: 'MUSIC_VIDEO' }));
                                  else if (value === 'VIDEO') setNewVideo(v => ({ ...v, subType: undefined, genre: 'General', category: undefined }));
                                  else setNewVideo(v => ({ ...v, subType: value as any, genre: 'General', category: undefined }));
                                }}
                                className={`flex flex-col items-center gap-3 p-5 rounded-2xl transition-all border text-center ${isActive ? 'bg-white text-black border-white shadow-xl' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white'}`}
                              >
                                <Icon size={24} />
                                <div>
                                  <p className="text-[10px] font-black uppercase tracking-widest leading-tight">{label}</p>
                                  <p className={`text-[8px] font-bold uppercase tracking-widest mt-1 leading-tight ${isActive ? 'text-black/50' : 'text-white/25'}`}>{desc}</p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* File drop zone */}
                      <div>
                        <label className="block text-[9px] font-black uppercase tracking-[0.4em] text-white/30 mb-3">
                          {newVideo.subType === 'TV_SERIES' ? 'Primary Episode File' : 'Video File'}
                        </label>
                        <label className={`relative flex flex-col items-center justify-center rounded-[2rem] border-2 border-dashed transition-all cursor-pointer overflow-hidden ${newVideo.file ? 'border-green-500/50 bg-green-500/5' : 'border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]'}`} style={{ minHeight: 220 }}>
                          {newVideo.file ? (
                            <div className="flex flex-col items-center gap-4 p-8">
                              <div className="w-16 h-16 rounded-2xl bg-green-500/20 flex items-center justify-center">
                                <Check size={28} className="text-green-400" />
                              </div>
                              <div className="text-center">
                                <p className="text-sm font-black uppercase tracking-tight text-green-400 max-w-xs truncate">{newVideo.file.name}</p>
                                <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest mt-1">{(newVideo.file.size / 1024 / 1024).toFixed(1)} MB</p>
                              </div>
                              <button
                                type="button"
                                onClick={e => { e.preventDefault(); setNewVideo(v => ({ ...v, file: undefined })); }}
                                className="text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-white transition-colors"
                              >
                                Change File
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-4 p-6 sm:p-12">
                              <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
                                <Upload size={28} className="text-white/30" />
                              </div>
                              <div className="text-center">
                                <p className="text-sm font-black uppercase tracking-widest text-white/40">Drop your video here</p>
                                <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest mt-1">or click to browse â€" MP4, MOV, AVI, MKV supported</p>
                              </div>
                            </div>
                          )}
                          <input
                            type="file"
                            accept="video/*"
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            onChange={e => { const f = e.target.files?.[0]; if (f) setNewVideo(v => ({ ...v, file: f })); }}
                          />
                        </label>
                      </div>

                      {/* TV Episodes */}
                      {newVideo.subType === 'TV_SERIES' && (
                        <div className="p-6 bg-white/5 rounded-2xl border border-white/10 space-y-4">
                          <div className="flex items-center justify-between">
                            <h3 className="text-[10px] font-black uppercase tracking-widest">Episodes</h3>
                            <button type="button" onClick={() => setTvEpisodes(eps => [...eps, { title: `Episode ${eps.length + 1}`, description: '' }])} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all text-small-orange">+ Add Episode</button>
                          </div>
                          <div className="space-y-3 max-h-52 overflow-y-auto custom-scrollbar pr-1">
                            {tvEpisodes.map((ep, idx) => (
                              <div key={idx} className="p-4 bg-black/40 rounded-xl border border-white/5 space-y-3">
                                <div className="flex items-center gap-3">
                                  <input type="text" value={ep.title} onChange={e => { const eps = [...tvEpisodes]; eps[idx].title = e.target.value; setTvEpisodes(eps); }} className="flex-1 bg-transparent text-[10px] font-black uppercase tracking-widest outline-none" placeholder="Episode Title" />
                                  <input type="number" value={ep.episodeNumber || ''} placeholder="#" onChange={e => { const eps = [...tvEpisodes]; eps[idx].episodeNumber = parseInt(e.target.value); setTvEpisodes(eps); }} className="w-10 bg-white/5 border border-white/10 rounded-lg p-1 text-[8px] font-bold text-center outline-none" />
                                  <button type="button" onClick={() => setTvEpisodes(eps => eps.filter((_, i) => i !== idx))} className="text-white/20 hover:text-red-500"><X size={12} /></button>
                                </div>
                                <label className="block p-2 bg-white/5 border border-dashed border-white/10 rounded-lg cursor-pointer hover:bg-white/10 text-center">
                                  <span className="text-[8px] font-black uppercase tracking-widest text-white/30">{ep.file ? ep.file.name : 'Select Episode File'}</span>
                                  <input type="file" className="hidden" accept="video/*" onChange={e => { const eps = [...tvEpisodes]; eps[idx].file = e.target.files?.[0]; setTvEpisodes(eps); }} />
                                </label>
                              </div>
                            ))}
                            {tvEpisodes.length === 0 && <p className="text-[9px] text-white/20 uppercase tracking-widest text-center py-4">Add episodes above</p>}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* â"€â"€ STEP 2: DETAILS â"€â"€ */}
                  {uploadStep === 2 && (
                    <motion.div
                      key="step2"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="p-4 sm:p-8"
                    >
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
                        {/* Left: text fields */}
                        <div className="space-y-6">
                          <div>
                            <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Title <span className="text-red-400">*</span></label>
                            <input
                              type="text"
                              required
                              value={newVideo.title}
                              onChange={e => setNewVideo(v => ({ ...v, title: e.target.value }))}
                              placeholder="Give your video a title"
                              className="w-full bg-white/5 border border-white/10 focus:border-white/30 rounded-xl px-5 py-3.5 text-sm font-bold outline-none transition-all"
                            />
                          </div>

                          <div>
                            <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Description</label>
                            <textarea
                              rows={4}
                              value={newVideo.description}
                              onChange={e => setNewVideo(v => ({ ...v, description: e.target.value }))}
                              placeholder="Tell viewers what this video is about..."
                              className="w-full bg-white/5 border border-white/10 focus:border-white/30 rounded-xl px-5 py-3.5 text-sm font-bold outline-none transition-all resize-none"
                            />
                          </div>

                          {/* Genre */}
                          {!isMusicVideoMode && !newVideo.subType && (
                            <div>
                              <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Genre</label>
                              <select value={newVideo.genre} onChange={e => setNewVideo(v => ({ ...v, genre: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-3.5 text-sm font-bold outline-none appearance-none text-white">
                                {['General', 'Short Film', 'Tutorial', 'Vlog', 'Documentary', 'Gaming', 'Education', 'Podcast', 'Comedy', 'News', 'Sports', 'Fitness'].map(g => <option key={g} value={g} className="bg-[#0a0a0a]">{g}</option>)}
                              </select>
                            </div>
                          )}

                          {/* Tags */}
                          <div>
                            <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Tags</label>
                            <div className="flex gap-2 mb-3">
                              <input
                                type="text"
                                value={tagInput}
                                onChange={e => setTagInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                                placeholder="Add tag..."
                                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold outline-none placeholder:text-white/20"
                              />
                              <button type="button" onClick={addTag} className="px-5 bg-white/10 hover:bg-white/20 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all">Add</button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {(newVideo.tags || []).map(tag => (
                                <span key={tag} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 rounded-full text-[9px] font-black uppercase tracking-widest">
                                  {tag}
                                  <button type="button" onClick={() => setNewVideo(v => ({ ...v, tags: v.tags?.filter(t => t !== tag) }))} className="text-white/30 hover:text-red-400"><X size={9} /></button>
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Music Video track linker */}
                          {isMusicVideoMode && (
                            <div className="p-5 bg-small-orange/10 border border-small-orange/20 rounded-2xl space-y-4">
                              <h3 className="text-[10px] font-black uppercase tracking-widest text-small-orange flex items-center gap-2"><Music2 size={13} /> Link to a Song</h3>
                              <input type="text" placeholder="Search your songs..." value={trackSearch} onChange={e => setTrackSearch(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold outline-none placeholder:text-white/20" />
                              <div className="max-h-36 overflow-y-auto custom-scrollbar space-y-2">
                                {filteredTracks.length === 0 && <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest py-2 text-center">No songs found.</p>}
                                {filteredTracks.map(track => (
                                  <button key={track.id} type="button" onClick={() => { setLinkedTrackId(track.id); setLinkedAlbumId(track.albumId); }} className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all border ${linkedTrackId === track.id ? 'bg-small-orange/20 border-small-orange/50' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}>
                                    <Music2 size={13} className={linkedTrackId === track.id ? 'text-small-orange' : 'text-white/30'} />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-[10px] font-black uppercase tracking-widest truncate">{track.title}</p>
                                      <p className="text-[8px] font-bold text-white/30 uppercase tracking-widest truncate">{track.albumTitle}</p>
                                    </div>
                                    {linkedTrackId === track.id && <Check size={13} className="text-small-orange shrink-0" />}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Movie metadata */}
                          {newVideo.subType === 'MOVIE' && (
                            <div className="p-5 bg-white/5 rounded-2xl border border-white/10 space-y-4">
                              <h3 className="text-[10px] font-black uppercase tracking-widest">Movie Details</h3>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-[8px] font-black uppercase tracking-widest text-white/20 mb-2">Release Year</label>
                                  <input type="number" value={movieMetadata.releaseYear} onChange={e => setMovieMetadata(m => ({ ...m, releaseYear: parseInt(e.target.value) }))} className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs font-bold outline-none text-white" />
                                </div>
                                <div>
                                  <label className="block text-[8px] font-black uppercase tracking-widest text-white/20 mb-2">Trailer URL</label>
                                  <input type="url" value={movieMetadata.trailerUrl} onChange={e => setMovieMetadata(m => ({ ...m, trailerUrl: e.target.value }))} placeholder="YouTube/Vimeo" className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs font-bold outline-none text-white placeholder:text-white/20" />
                                </div>
                              </div>
                              <div>
                                <label className="block text-[8px] font-black uppercase tracking-widest text-white/20 mb-2">Cast (comma separated)</label>
                                <input type="text" value={movieMetadata.cast?.join(', ')} onChange={e => setMovieMetadata(m => ({ ...m, cast: e.target.value.split(',').map(s => s.trim()) }))} placeholder="Actor 1, Actor 2..." className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs font-bold outline-none text-white placeholder:text-white/20" />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Right: thumbnail / cover */}
                        <div className="space-y-5">
                          {/* Thumbnail preview */}
                          <div>
                            <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Thumbnail <span className="text-white/20">(16:9 recommended)</span></label>
                            <label className="relative aspect-video flex items-center justify-center rounded-2xl overflow-hidden bg-white/5 border border-dashed border-white/10 cursor-pointer group hover:border-white/25 transition-all">
                              {thumbPreview
                                ? <img loading="lazy" decoding="async" src={thumbPreview} alt="thumb" className="w-full h-full object-cover" />
                                : <div className="flex flex-col items-center gap-2 text-white/25">
                                    <ImageIcon size={28} />
                                    <span className="text-[9px] font-black uppercase tracking-widest">Upload Thumbnail</span>
                                  </div>}
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
                                <div className="opacity-0 group-hover:opacity-100 transition-all flex items-center gap-2 px-4 py-2 bg-white/20 rounded-full">
                                  <Camera size={14} />
                                  <span className="text-[9px] font-black uppercase tracking-widest">Change</span>
                                </div>
                              </div>
                              <input type="file" accept="image/*" className="hidden" onChange={e => {
                                const f = e.target.files?.[0];
                                if (f) { setNewVideo(v => ({ ...v, thumbnailFile: f })); setThumbPreview(URL.createObjectURL(f)); }
                              }} />
                            </label>
                          </div>

                          {/* Cover image */}
                          <div>
                            <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Cover / Background Image</label>
                            <label className="relative h-28 flex items-center justify-center rounded-2xl overflow-hidden bg-white/5 border border-dashed border-white/10 cursor-pointer group hover:border-white/25 transition-all">
                              {coverPreview
                                ? <img loading="lazy" decoding="async" src={coverPreview} alt="cover" className="w-full h-full object-cover" />
                                : <div className="flex items-center gap-2 text-white/25">
                                    <ImageIcon size={18} />
                                    <span className="text-[9px] font-black uppercase tracking-widest">Upload Cover</span>
                                  </div>}
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
                                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-2 px-3 py-1.5 bg-white/20 rounded-full">
                                  <Camera size={12} /><span className="text-[8px] font-black uppercase tracking-widest">Change</span>
                                </div>
                              </div>
                              <input type="file" accept="image/*" className="hidden" onChange={e => {
                                const f = e.target.files?.[0];
                                if (f) { setNewVideo(v => ({ ...v, coverImageFile: f })); setCoverPreview(URL.createObjectURL(f)); }
                              }} />
                            </label>
                          </div>

                          {/* Auto-capture */}
                          <button
                            type="button"
                            disabled={!newVideo.file || isCapturing}
                            onClick={async () => {
                              if (!newVideo.file) return;
                              setIsCapturing(true);
                              try {
                                const [b1, b2] = await Promise.all([captureVideoFrame(newVideo.file), captureVideoFrame(newVideo.file)]);
                                const f1 = new File([b1], 'thumb.jpg', { type: 'image/jpeg' });
                                const f2 = new File([b2], 'cover.jpg', { type: 'image/jpeg' });
                                setNewVideo(v => ({ ...v, thumbnailFile: f1, coverImageFile: f2 }));
                                setThumbPreview(URL.createObjectURL(f1));
                                setCoverPreview(URL.createObjectURL(f2));
                              } catch {} finally { setIsCapturing(false); }
                            }}
                            className="w-full py-3 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-widest hover:bg-white/10 transition-all disabled:opacity-30"
                          >
                            <Camera size={14} /> {isCapturing ? 'Capturing frameâ€¦' : 'Auto-generate from video'}
                          </button>

                          {/* World link */}
                          {userWorlds.length > 0 && (
                            <div>
                              <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Link to World (Optional)</label>
                              <select value={newVideo.worldId || ''} onChange={e => setNewVideo(v => ({ ...v, worldId: e.target.value || undefined }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-3 text-sm font-bold outline-none appearance-none text-white">
                                <option value="" className="bg-[#0a0a0a]">No World</option>
                                {userWorlds.map(w => <option key={w.id} value={w.id} className="bg-[#0a0a0a]">{w.name}</option>)}
                              </select>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* â"€â"€ STEP 3: PUBLISH â"€â"€ */}
                  {uploadStep === 3 && (
                    <motion.div
                      key="step3"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="p-4 sm:p-8 space-y-6"
                    >
                      {/* Summary card */}
                      <div className="flex gap-5 p-5 bg-white/[0.04] rounded-2xl border border-white/5">
                        <div className="w-32 aspect-video rounded-xl overflow-hidden bg-white/5 shrink-0">
                          {thumbPreview
                            ? <img loading="lazy" decoding="async" src={thumbPreview} alt="" className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center"><Film size={20} className="text-white/20" /></div>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black uppercase tracking-tight text-white leading-tight">{newVideo.title || 'Untitled'}</p>
                          <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest mt-1">{newVideo.genre || 'General'}</p>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {(newVideo.tags || []).slice(0, 4).map(t => <span key={t} className="px-2 py-1 bg-white/10 rounded-full text-[8px] font-black uppercase tracking-widest">{t}</span>)}
                          </div>
                          {newVideo.file && <p className="text-[8px] font-bold text-white/20 uppercase tracking-widest mt-2">{newVideo.file.name}</p>}
                        </div>
                      </div>

                      {/* Visibility */}
                      <div className="flex items-center justify-between p-5 bg-white/[0.03] rounded-2xl border border-white/5">
                        <div className="flex items-center gap-4">
                          {newVideo.isPrivate
                            ? <Lock size={18} className="text-white/30" />
                            : <Globe size={18} className="text-green-400" />}
                          <div>
                            <p className="text-sm font-black uppercase tracking-tight">{newVideo.isPrivate ? 'Private' : 'Public'}</p>
                            <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest mt-0.5">
                              {newVideo.isPrivate ? 'Only you can see this' : 'Visible to everyone on the platform'}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setNewVideo(v => ({ ...v, isPrivate: !v.isPrivate }))}
                          className={`w-12 h-7 rounded-full relative transition-all shrink-0 ${!newVideo.isPrivate ? 'bg-green-500' : 'bg-white/10'}`}
                        >
                          <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full transition-all shadow-lg ${!newVideo.isPrivate ? 'left-5' : 'left-0.5'}`} />
                        </button>
                      </div>

                      {/* Upload progress / submit */}
                      {uploading ? (
                        <div className="space-y-4 pt-4">
                          <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                            <motion.div className="h-full bg-gradient-to-r from-purple-600 to-small-orange rounded-full" initial={{ width: 0 }} animate={{ width: `${uploadProgress}%` }} />
                          </div>
                          <p className="text-center text-[9px] font-black uppercase tracking-[0.4em] text-small-orange animate-pulse">Uploadingâ€¦ {Math.round(uploadProgress)}%</p>
                          <button type="button" onClick={() => setShowUpload(false)} className="w-full py-3 bg-white/5 rounded-xl text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-white transition-all">Run in Background</button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={e => handleUpload(e as any)}
                          disabled={!newVideo.title?.trim() || (!newVideo.file && newVideo.subType !== 'TV_SERIES' && newVideo.subType !== 'MOVIE')}
                          className="w-full py-5 bg-white text-black rounded-2xl font-black text-xs uppercase tracking-[0.3em] hover:bg-small-orange hover:text-white transition-all active:scale-95 shadow-2xl disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Publish to Platform
                        </button>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Footer nav */}
              {!uploading && (
                <div className="flex items-center justify-between px-4 sm:px-8 pb-6 sm:pb-8 pt-5 border-t border-white/5 shrink-0">
                  <button
                    type="button"
                    onClick={() => uploadStep === 1 ? (setShowUpload(false), setUploadStep(1)) : setUploadStep(s => s - 1)}
                    className="px-6 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all"
                  >
                    {uploadStep === 1 ? 'Cancel' : 'Back'}
                  </button>
                  {uploadStep < 3 && (
                    <button
                      type="button"
                      onClick={() => setUploadStep(s => s + 1)}
                      disabled={uploadStep === 1 && !newVideo.file && newVideo.subType !== 'TV_SERIES' && newVideo.subType !== 'MOVIE'}
                      className="px-8 py-3 bg-white text-black hover:bg-small-orange hover:text-white rounded-xl font-black text-[9px] uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Continue â†’
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {showYoutubeImport && <YoutubeImportModal onClose={() => setShowYoutubeImport(false)} onImported={() => { setShowYoutubeImport(false); loadData(); }} />}
      {showGoLiveModal && <LiveStudio onClose={() => { setShowGoLiveModal(false); setIsLiveStreamActive(false); }} />}

      {assigningVideo && (
        <VideoWorldAssignModal
          video={assigningVideo}
          worlds={userWorlds}
          onClose={() => setAssigningVideo(null)}
          onSaved={updates => {
            setUserVideos(prev => prev.map(v => v.id === assigningVideo.id ? { ...v, ...updates } : v));
          }}
        />
      )}

      {activeLiveStream && (
        <LiveViewer
          streamId={activeLiveStream.streamId}
          title={activeLiveStream.title}
          ownerName={activeLiveStream.ownerName}
          onClose={() => setActiveLiveStream(null)}
        />
      )}

      <AnimatePresence>
        {signInAction && (
          <SignInPrompt action={signInAction} onClose={() => setSignInAction(null)} />
        )}
      </AnimatePresence>

      {/* ── Save to Playlist Modal ──────────────────────────────────────── */}
      {saveVideo && <AddToPlaylistModal video={saveVideo} onClose={() => setSaveVideo(null)} />}

      {/* ── Share to Club Modal ─────────────────────────────────────────── */}
      <AnimatePresence>
        {shareToClubVideo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => { setShareToClubVideo(null); setShareDone(false); }}
          >
            <motion.div
              initial={{ scale: 0.92, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 20 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="bg-[#0E0E1A] border border-white/10 rounded-3xl p-5 sm:p-8 w-full max-w-md space-y-5 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.4em] text-small-orange mb-1">Reelo → Club</p>
                  <h3 className="text-xl font-black uppercase tracking-tight text-white">Share to Club</h3>
                </div>
                <button onClick={() => setShareToClubVideo(null)} className="p-2 text-white/30 hover:text-white transition-colors">
                  <X size={18} />
                </button>
              </div>

              <div className="flex items-center gap-3 p-3 bg-white/[0.04] border border-white/[0.07] rounded-2xl">
                <div className="w-16 h-10 rounded-xl overflow-hidden bg-white/5 shrink-0">
                  {(() => {
                    const thumb = (shareToClubVideo as any).muxPlaybackId
                      ? `https://image.mux.com/${(shareToClubVideo as any).muxPlaybackId}/thumbnail.png?width=300&height=169&time=5`
                      : (shareToClubVideo as any).thumbnailUrl || (shareToClubVideo as any).coverImage || '';
                    return thumb ? <img src={thumbUrl(thumb, THUMB.micro)} loading="lazy" decoding="async" onError={onThumbError(thumb)} className="w-full h-full object-cover" alt="" /> : null;
                  })()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black text-white truncate">{shareToClubVideo.title}</p>
                  <p className="text-[9px] text-white/30 font-bold uppercase tracking-widest">{(shareToClubVideo as any).genre || 'Video'}</p>
                </div>
              </div>

              {shareDone ? (
                <div className="flex flex-col items-center gap-3 py-4">
                  <div className="w-12 h-12 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center">
                    <Check size={20} className="text-green-400" />
                  </div>
                  <p className="text-sm font-black text-white uppercase tracking-widest">Shared to Club!</p>
                </div>
              ) : (
                <>
                  {userClubs.length === 0 ? (
                    <p className="text-[10px] text-white/25 font-black uppercase tracking-widest text-center py-4">You haven't joined any clubs yet.</p>
                  ) : (
                    <div className="space-y-2 max-h-44 overflow-y-auto custom-scrollbar">
                      {userClubs.map(club => (
                        <button
                          key={club.id}
                          onClick={() => setShareClubId(club.id)}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                            shareClubId === club.id
                              ? 'bg-small-orange/15 border-small-orange/40'
                              : 'bg-white/[0.03] border-white/[0.07] hover:border-white/20'
                          }`}
                        >
                          <div className="w-8 h-8 rounded-lg bg-white/10 overflow-hidden shrink-0">
                            {club.iconImage && <img src={thumbUrl(club.iconImage, THUMB.micro) || undefined} loading="lazy" decoding="async" onError={onThumbError(club.iconImage)} className="w-full h-full object-cover" alt="" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-black text-white truncate">{club.name}</p>
                            <p className="text-[9px] text-white/30 font-black uppercase tracking-widest">{club.memberCount || 0} members</p>
                          </div>
                          {shareClubId === club.id && <Check size={14} className="text-small-orange shrink-0" />}
                        </button>
                      ))}
                    </div>
                  )}

                  <textarea
                    value={shareMessage}
                    onChange={e => setShareMessage(e.target.value)}
                    placeholder="Add a message… (optional)"
                    rows={2}
                    className="w-full bg-white/[0.05] border border-white/[0.10] focus:border-small-orange/50 rounded-xl px-4 py-3 text-sm font-bold text-white placeholder-white/20 outline-none resize-none transition-all"
                  />

                  <button
                    onClick={handleShareToClub}
                    disabled={!shareClubId || shareSubmitting}
                    className="w-full h-12 bg-small-orange hover:bg-small-orange/80 disabled:opacity-40 text-white font-black text-sm uppercase tracking-widest rounded-full flex items-center justify-center gap-2 transition-all"
                  >
                    <Share2 size={16} /> {shareSubmitting ? 'Sharing…' : 'Share to Club'}
                  </button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default VideoTab;
