import React, { useState, useEffect, useRef, useCallback } from 'react';
import { scoreText } from '../src/lib/scoreText';
import { thumb, onThumbError, THUMB } from '../src/lib/imageThumb';
import { AdaptiveGrid, TYPE } from '../src/lib/designSystem';
import HistoryMomentPulseCard from './HistoryMomentPulseCard';
import { FeedItem, UserProfile, FeedPage, Game, Album, PostThemeBackground, LiveTalk, Post } from '../types';
import PageHeader from './PageHeader';
import { fetchFeed, fetchFollowedFeed, postToFeed, followUser, unfollowUser, isFollowing, deleteFeedItem, fetchUserProfile, fetchUserAlbums, fetchThemeBackgrounds, listenToActiveLiveTalks, updateUserProfile, searchUserProfiles, listenToGlobalPosts, listenToFollowedPosts, listenToLikedPosts, createPost, postFieldsForAssetEmbed, recordFeedInteraction, fetchAlbumsByIds, fetchAllPublicAlbums, fetchPublicBooks, fetchAllLiveFeeds, fetchStreamArchives } from '../services/backendService';
import { getDailyFigure } from '../services/historyData';
import { filterPostsForViewer } from '../services/contentSafety';
import { useViewerDiscovery, useDwellTracker } from '../hooks/useFeedScoring';
import { prefetchSports } from '../services/sportsService';
import { SportsCenterView } from './SportsCenterView';
import { fetchNewsFromRSS } from '../services/rssService';
import { ArrowLeft, User, Music2, MessageSquare, Image as ImageIcon, Send, Play, UserPlus, UserMinus, Globe, Newspaper, Zap, TrendingUp, Reply, Trash2, Sparkles, Book, BookOpen, Disc, Film, Gamepad2, Tv, Radio, Layers, ChevronLeft, ChevronRight, Maximize2, ExternalLink, Volume2, VolumeX, Pause, Plus, Check, X, Heart, Pen, Share2, Mic, Search, Users, Cloud, Smile, MoreHorizontal, Info, Clock, Swords } from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';
import { motion, AnimatePresence, useScroll, useTransform, useSpring, useInView } from 'motion/react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, Cell } from 'recharts';
import { callGemini } from '../services/geminiService';
import FileUploader from './FileUploader';
import CommentSection from './CommentSection';
import ProfileFeed from './ProfileFeed';
import PayItForwardButton from './PayItForwardButton';
import PostCard from './PostCard';
import PostMediaCarousel from './PostMediaCarousel';
import BroadcastHub from './broadcast/BroadcastHub';
import FediversePostCard from './FediversePostCard';
import RightNowFeed, { PresenceSync } from './RightNowFeed';
import { RightNowOnboardingController, RightNowAnnouncementBanner, STORAGE_KEY as NOW_STORAGE_KEY } from './RightNowOnboarding';
import { updateUserProfile as _updatePresence } from '../services/backendService';
import { useFediverse } from '../contexts/FediverseContext';
import MiniMusicPlayer from './MiniMusicPlayer';
import UniversalPostComposer from './UniversalPostComposer';
import { useActiveIdentity, IdentitySwitcher } from '../contexts/ActiveIdentityContext';
import StoriesBar from './StoriesBar';
import StoryCreator from './StoryCreator';
import DualPanelTimeline from './DualPanelTimeline';
import SignInPrompt from './SignInPrompt';
import PlajahPlusPill from './PlajahPlusPill';
import { lazy, Suspense } from 'react';
import PostDebateModal from './PostDebateModal';
import DebateView from './DebateView';
import DebatePulseFeed from './DebatePulseFeed';
import Portal from './Portal';
// Blueprint 1B.4 ("Today" — 24h ephemeral posts) + Part 2B student walls.
import { TODAY_TTL_MS, withoutExpiredTodays } from '../services/todayPosts';
import { StudentWallRow } from './StudentWall';
import RichText from '../src/lib/richText';
const GoLiveWizard = lazy(() => import('./GoLiveWizard'));
const LiveTalkView = lazy(() => import('./LiveTalkView'));

type ResolvedMedia = { type: 'PHOTO' | 'VIDEO' | 'AUDIO' | 'GIF' | 'MODEL3D'; url: string; title?: string; thumbnail?: string };
/** Shared composer → post media pipeline: uploads any local blobs and, for VIDEO
 *  attachments, captures + uploads a real poster frame so the feed shows a
 *  thumbnail instead of a blank/black box. Used by every composer on this page. */
export async function resolveComposerMedia(attachments: any[], uid: string): Promise<ResolvedMedia[]> {
  const out = await Promise.all(attachments.map(async (att): Promise<ResolvedMedia | null> => {
    if (att.file && typeof att.url === 'string' && att.url.startsWith('blob:')) {
      try {
        const { uploadFile } = await import('../services/backendService');
        const { uploadOrReuse } = await import('../services/mediaDedup');
        const { url } = await uploadOrReuse(
          uid,
          `posts/${uid}/${Date.now()}_${att.file.name}`,
          att.file, uploadFile,
          { type: att.type, title: att.title, forceNew: (att as any).forceNew },
        );
        let thumbnail: string | undefined = att.thumbnail;
        if (att.type === 'VIDEO' && !thumbnail) {
          try {
            const { captureVideoPoster } = await import('../services/videoPoster');
            const poster = await captureVideoPoster(att.file);
            if (poster) {
              const { uploadFile } = await import('../services/backendService');
              thumbnail = await uploadFile(`posts/${uid}/poster_${Date.now()}.jpg`, poster);
            }
          } catch { /* poster is best-effort — the <video> still renders without it */ }
        }
        return { type: att.type, url, title: att.title, ...(thumbnail ? { thumbnail } : {}) };
      } catch (e) {
        // Don't drop media silently — a failed upload here is why "pictures/videos don't post."
        console.error('[composer] media upload failed', e);
        try { const { reportError } = await import('../services/errorReporting'); reportError(e as any, { source: 'upload', context: `composer-media · ${att.type}` }); } catch { /* */ }
        return null;
      }
    }
    return { type: att.type, url: att.url, title: att.title, ...(att.thumbnail ? { thumbnail: att.thumbnail } : {}) };
  }));
  return out.filter(Boolean) as ResolvedMedia[];
}

const RolodexCard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"]
  });

  const rotateX = useTransform(scrollYProgress, [0, 0.5, 1], [15, 0, -15]);
  const opacity = useTransform(scrollYProgress, [0, 0.2, 0.8, 1], [0, 1, 1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [0.95, 1, 0.95]);
  const y = useTransform(scrollYProgress, [0, 0.5, 1], [50, 0, -50]);

  const springConfig = { stiffness: 100, damping: 30, restDelta: 0.001 };
  const springRotateX = useSpring(rotateX, springConfig);
  const springScale = useSpring(scale, springConfig);
  const springY = useSpring(y, springConfig);

  return (
    <motion.div
      ref={ref}
      style={{
        rotateX: springRotateX,
        opacity,
        scale: springScale,
        y: springY,
        perspective: "1000px"
      }}
      className="w-full mb-12 origin-center will-change-transform"
    >
      {children}
    </motion.div>
  );
};

interface FeedViewProps {
  onBack: () => void;
  currentUser: FirebaseUser | null;
  onVisitUser: (uid: string) => void;
  onMessage?: (uid: string) => void;
  onSelectGame?: (game: Game) => void;
  /** Viewer's profile — drives child-safety filtering of the feed. */
  viewerProfile?: UserProfile | null;
}

type FeedTab = 'SOCIAL' | 'GLOBAL' | 'NEWS' | 'LIVETALK' | 'TRENDING' | 'TOP_10' | 'MOST_SHARED' | 'NOW' | 'PULSE';

const LiveTalkDiscovery: React.FC<{
  currentUser: FirebaseUser | null;
  onJoin: (id: string) => void;
  onStartTalk?: () => void;
}> = ({ currentUser, onJoin, onStartTalk }) => {
  const [talks, setTalks] = useState<LiveTalk[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [category, setCategory] = useState('ALL');

  useEffect(() => {
    const unsubscribe = listenToActiveLiveTalks(setTalks);
    return () => unsubscribe();
  }, []);

  const filteredTalks = talks.filter(t => {
    const matchesSearch = t.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         t.topic.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = category === 'ALL' || t.category === category;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-12 pb-20">
      <div className="relative group">
        <div className="absolute inset-x-0 -top-40 h-[500px] bg-gradient-to-b from-primary/20 via-transparent to-transparent blur-[120px] pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-end justify-between gap-8 mb-12">
           <div className="max-w-2xl">
              <div className="flex items-center gap-4 mb-6">
                 <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_red]" />
                 <span className="text-[10px] font-black uppercase tracking-[0.4em] text-red-500 italic">Global Frequency</span>
              </div>
              <h2 className="text-5xl font-headline uppercase tracking-tighter leading-none mb-6">Live Talk Discovery</h2>
              <p className="text-white/40 text-lg font-medium leading-relaxed uppercase tracking-tight">Real-time voice ecosystems. Listen, participate, and build the playlist together.</p>
           </div>
           <div className="flex flex-col gap-4 w-full md:w-auto">
              <div className="relative">
                 <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-white/20" size={20} />
                 <input
                   type="text"
                   value={searchTerm}
                   onChange={e => setSearchTerm(e.target.value)}
                   placeholder="Search live talk / topic..."
                   className="w-full md:w-[400px] bg-white/5 border border-white/10 rounded-[2rem] py-6 pl-16 pr-8 text-sm outline-none focus:border-primary/40 focus:ring-4 focus:ring-primary/5 transition-all shadow-2xl"
                 />
              </div>
              {currentUser && onStartTalk && (
                <button
                  onClick={onStartTalk}
                  className="flex items-center justify-center gap-3 px-8 py-4 bg-red-600 hover:bg-red-500 text-white rounded-[2rem] text-[10px] font-black uppercase tracking-widest transition-all shadow-[0_0_24px_rgba(239,68,68,0.4)]"
                >
                  <Mic size={16} className="animate-pulse" />
                  Start Live Talk
                </button>
              )}
           </div>
        </div>
      </div>

      <AdaptiveGrid phone={1} tablet={2} desktop={3} gap="2rem">
        {filteredTalks.map(talk => (
          <motion.div 
            key={talk.id}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="group relative"
          >
             <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-[3rem] blur-2xl" />
             <div className="relative glass border border-white/5 rounded-[3rem] p-10 flex flex-col h-full hover:border-white/20 hover:-translate-y-2 transition-all duration-500">
                <div className="flex items-center justify-between mb-8">
                   <div className="flex items-center gap-3">
                      <div className="relative">
                         <img loading="lazy" decoding="async" src={thumb(talk.hostPhoto, THUMB.micro) || null} onError={onThumbError(talk.hostPhoto)} className="w-12 h-12 rounded-2xl object-cover shadow-2xl ring-2 ring-white/10" />
                         <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-black border border-white/10 rounded-full flex items-center justify-center">
                            <Mic size={10} className="text-primary" />
                         </div>
                      </div>
                      <div>
                         <h4 className={`${TYPE.labelSm} font-black uppercase tracking-[0.2em] text-white/40`}>Hosted by</h4>
                         <p className="text-xs font-bold text-white uppercase">{talk.hostName}</p>
                      </div>
                   </div>
                   <div className="flex flex-col items-end">
                      <div className="flex items-center gap-2 mb-1">
                         <span className="w-1 h-1 bg-red-500 rounded-full animate-pulse" />
                         <span className="text-[10px] font-black font-mono text-red-500 uppercase tracking-widest">Live</span>
                      </div>
                      <div className="flex items-center gap-2">
                         <Users size={12} className="text-white/20" />
                         <span className="text-[10px] font-black font-mono text-white/40">{talk.listeners.length + talk.speakers.length}</span>
                      </div>
                   </div>
                </div>

                <div className="flex-1 space-y-4 mb-10">
                   <h3 className="text-2xl font-black uppercase tracking-tight text-white group-hover:text-primary transition-colors leading-tight italic">{talk.title}</h3>
                   <div className="flex flex-wrap gap-2">
                      <span className="px-3 py-1 bg-white/5 border border-white/5 rounded-full text-[8px] font-black uppercase tracking-widest text-[#00DAF3]/60">{talk.topic}</span>
                      <span className="px-3 py-1 bg-white/5 border border-white/5 rounded-full text-[8px] font-black uppercase tracking-widest text-white/20">{talk.category}</span>
                   </div>
                   <p className="text-sm text-white/40 font-medium line-clamp-3 leading-relaxed italic opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                     {talk.description || "Join this audio discussion to share insights and build the global playlist."}
                   </p>
                </div>

                <button 
                  onClick={() => onJoin(talk.id)}
                  className="w-full py-5 bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-[0.4em] shadow-2xl hover:bg-primary hover:text-white transition-all transform group-active:scale-[0.98]"
                >
                   TUNE IN NOW
                </button>
             </div>
          </motion.div>
        ))}
        {filteredTalks.length === 0 && (
          <div className="col-span-full py-40 flex flex-col items-center justify-center opacity-20 text-center space-y-6">
             <Radio size={80} className="stroke-[0.5]" />
             <div>
                <p className="text-[10px] font-black uppercase tracking-[0.6em]">No Signals Found</p>
                <p className="text-xs font-bold mt-2 italic opacity-60">Try searching for other frequencies or stay tuned for upcoming broadcasts.</p>
             </div>
          </div>
        )}
      </AdaptiveGrid>
    </div>
  );
};

const UserHoverCard: React.FC<{
  userId: string; 
  userName: string; 
  userPhoto: string;
  currentUser: FirebaseUser | null;
  onVisit: (uid: string) => void;
  onMessage?: (uid: string) => void;
}> = ({ userId, userName, userPhoto, currentUser, onVisit, onMessage }) => {
  const [isFollowed, setIsFollowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [xHandle, setXHandle] = useState<string | null>(null);

  useEffect(() => {
    const checkFollowAndSocial = async () => {
      try {
        const [following, profile] = await Promise.all([
          currentUser ? isFollowing(userId) : Promise.resolve(false),
          fetchUserProfile(userId).catch(() => null)
        ]);
        setIsFollowed(following);
        if (profile?.xHandle) setXHandle(profile.xHandle);
      } catch (error) {
        console.error("Error loading hover card data:", error);
      }
      setLoading(false);
    };
    checkFollowAndSocial();
  }, [userId, currentUser]);

  const handleFollow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser) return;
    if (isFollowed) {
      await unfollowUser(userId);
      setIsFollowed(false);
    } else {
      await followUser(userId);
      setIsFollowed(true);
    }
  };

  return (
    <div className="absolute bottom-full left-0 mb-4 w-64 bg-theme-card/95 backdrop-blur-2xl border border-white/10 rounded-[2rem] p-6 shadow-3xl z-[100] animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-full overflow-hidden ring-2 ring-white/5">
          <img src={thumb(userPhoto, THUMB.micro) || `https://picsum.photos/seed/${userId}/100/100`} onError={onThumbError(userPhoto)} decoding="async" alt={userName} className="w-full h-full object-cover" loading="lazy" />
        </div>
        <div className="min-w-0">
          <h4 className="font-black text-sm uppercase tracking-tight truncate text-white">{userName}</h4>
          <p className="text-[9px] font-bold text-small-orange uppercase tracking-widest">Global Artist</p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <button 
          onClick={(e) => { e.stopPropagation(); onVisit(userId); }}
          className="w-full py-3 bg-white text-black rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-small-orange hover:text-white transition-all"
        >
          View Profile
        </button>
        
        {xHandle && (
          <div className="grid grid-cols-2 gap-2 mt-1">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                window.open(`https://x.com/intent/follow?screen_name=${xHandle}`, '_blank');
              }}
              className="py-3 bg-white/5 border border-white/10 rounded-xl font-black text-[8px] uppercase tracking-widest hover:bg-white/10 transition-all flex items-center justify-center gap-2"
              title={`Follow @${xHandle} on X`}
            >
              <X size={12} /> Follow
            </button>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                window.open(`https://x.com/intent/tweet?text=@${xHandle}%20`, '_blank');
              }}
              className="py-3 bg-white/5 border border-white/10 rounded-xl font-black text-[8px] uppercase tracking-widest hover:bg-white/10 transition-all flex items-center justify-center gap-2"
              title={`Mention @${xHandle} on X`}
            >
              <X size={12} /> Mention
            </button>
          </div>
        )}

        {onMessage && currentUser?.uid !== userId && (
          <button 
            onClick={(e) => { e.stopPropagation(); onMessage(userId); }}
            className="w-full py-3 bg-white/5 border border-white/10 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all flex items-center justify-center gap-2"
          >
            <MessageSquare size={12} />
            Message
          </button>
        )}
        {currentUser?.uid !== userId && (
          <button 
            onClick={handleFollow}
            disabled={loading}
            className={`w-full py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
              isFollowed ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20' : 'bg-small-orange text-white hover:bg-small-orange/80'
            }`}
          >
            {isFollowed ? <UserMinus size={12} /> : <UserPlus size={12} />}
            {isFollowed ? 'Unfollow' : 'Follow'}
          </button>
        )}
      </div>
    </div>
  );
};

const ScrapbookPost: React.FC<{ pages: FeedPage[]; background?: PostThemeBackground }> = ({ pages, background }) => {
  const [currentPage, setCurrentPage] = useState(0);
  
  if (!pages || pages.length === 0) return null;
  
  const page = pages[currentPage];
  const photoZones = background?.zones.filter(z => z.type === 'PHOTO') || [];
  const textZones = background?.zones.filter(z => z.type === 'TEXT') || [];
  
  return (
    <div className="relative bg-[#f4f1ea] rounded-[2rem] shadow-inner border-8 border-[#e8e4d9] text-[#4a3f35] font-serif min-h-[500px] flex flex-col overflow-hidden">
      {background ? (
        <div className="absolute inset-0 z-0">
          <img loading="lazy" decoding="async" src={background.imageUrl || null} className="w-full h-full object-cover opacity-40" alt="" />
          {/* Render User Content in AI Zones */}
          {photoZones.map((zone, idx) => (
            <div 
              key={zone.id}
              className="absolute overflow-hidden shadow-lg"
              style={{
                left: `${zone.x}%`,
                top: `${zone.y}%`,
                width: `${zone.width}%`,
                height: `${zone.height}%`,
                transform: `rotate(${zone.rotation || 0}deg)`,
                zIndex: 1
              }}
            >
              {page.type === 'IMAGE' && page.url && (
                <img loading="lazy" decoding="async" src={page.url || null} className="w-full h-full object-cover" alt="" />
              )}
              {page.type === 'VIDEO' && page.url && (
                <video src={page.url || null} className="w-full h-full object-cover" autoPlay muted loop playsInline />
              )}
            </div>
          ))}
          {textZones.map((zone, idx) => (
            <div 
              key={zone.id}
              className="absolute flex items-center justify-center p-4"
              style={{
                left: `${zone.x}%`,
                top: `${zone.y}%`,
                width: `${zone.width}%`,
                height: `${zone.height}%`,
                transform: `rotate(${zone.rotation || 0}deg)`,
                zIndex: 2
              }}
            >
              <p className="font-handwritten text-2xl text-center leading-tight text-black/80">
                {page.content}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-full bg-black/5 shadow-inner" />
          <div className="flex-1 relative z-10 flex flex-col p-8">
            <div className="flex justify-between items-center mb-6">
              <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Page {currentPage + 1} of {pages.length}</span>
              <div className="flex gap-2">
                <button 
                  onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
                  disabled={currentPage === 0}
                  className="p-2 hover:bg-black/5 rounded-full disabled:opacity-20 transition-all"
                >
                  <ChevronLeft size={20} />
                </button>
                <button 
                  onClick={() => setCurrentPage(prev => Math.min(pages.length - 1, prev + 1))}
                  disabled={currentPage === pages.length - 1}
                  className="p-2 hover:bg-black/5 rounded-full disabled:opacity-20 transition-all"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div 
                key={currentPage}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex-1 flex flex-col"
              >
                {page.type === 'IMAGE' && page.url && (
                  <div className="relative mb-6 rotate-1">
                    <div className="absolute inset-0 bg-white shadow-lg -rotate-2" />
                    <img loading="lazy" decoding="async" src={page.url || null} className="relative w-full h-64 object-cover border-4 border-white shadow-sm" />
                  </div>
                )}
                {page.type === 'VIDEO' && page.url && (
                  <div className="relative mb-6 -rotate-1">
                    <video src={page.url || null} className="w-full h-64 object-cover border-4 border-white shadow-lg" preload="metadata" playsInline controls />
                  </div>
                )}
                <p className="text-lg leading-relaxed italic opacity-80">{page.content}</p>
              </motion.div>
            </AnimatePresence>
          </div>
        </>
      )}
      
      <div className="absolute bottom-4 right-8 flex gap-1 z-20">
        {pages.map((_, i) => (
          <button 
            key={i} 
            onClick={() => setCurrentPage(i)}
            className={`w-1.5 h-1.5 rounded-full transition-all ${i === currentPage ? 'bg-[#4a3f35] scale-125' : 'bg-[#4a3f35]/20'}`} 
          />
        ))}
      </div>
    </div>
  );
};

const PhotoAlbumPost: React.FC<{ pages: FeedPage[]; background?: PostThemeBackground }> = ({ pages, background }) => {
  const [currentPage, setCurrentPage] = useState(0);
  
  if (!pages || pages.length === 0) return null;
  
  const page = pages[currentPage];
  const photoZones = background?.zones.filter(z => z.type === 'PHOTO') || [];
  
  return (
    <div className="bg-white/5 rounded-[3rem] p-8 border border-white/10 overflow-hidden relative min-h-[400px]">
      {background && (
        <div className="absolute inset-0 z-0">
          <img loading="lazy" decoding="async" src={background.imageUrl || null} className="w-full h-full object-cover opacity-60" alt="" />
          {photoZones.map((zone, idx) => {
            const mediaItem = page.media?.[idx % (page.media?.length || 1)];
            return (
              <div 
                key={zone.id}
                className="absolute overflow-hidden shadow-2xl border-4 border-white/20"
                style={{
                  left: `${zone.x}%`,
                  top: `${zone.y}%`,
                  width: `${zone.width}%`,
                  height: `${zone.height}%`,
                  transform: `rotate(${zone.rotation || 0}deg)`,
                  zIndex: 1
                }}
              >
                {mediaItem && <img loading="lazy" decoding="async" src={mediaItem.url || null} className="w-full h-full object-cover" alt="" />}
              </div>
            );
          })}
        </div>
      )}

      <div className="relative z-10">
        <div className="flex justify-between items-center mb-8">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-white/40">Photo Collection</h4>
          <div className="flex gap-2">
            <button 
              onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
              disabled={currentPage === 0}
              className="p-2 bg-white/5 hover:bg-white/10 rounded-full disabled:opacity-20 transition-all"
            >
              <ChevronLeft size={16} />
            </button>
            <button 
              onClick={() => setCurrentPage(prev => Math.min(pages.length - 1, prev + 1))}
              disabled={currentPage === pages.length - 1}
              className="p-2 bg-white/5 hover:bg-white/10 rounded-full disabled:opacity-20 transition-all"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {!background && (
          <AnimatePresence mode="wait">
            <motion.div 
              key={currentPage}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="grid grid-cols-2 gap-4"
            >
              {page.media?.map((m, i) => (
                <div key={i} className="relative aspect-square rounded-2xl overflow-hidden group">
                  <img loading="lazy" decoding="async" src={m.url || null} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                </div>
              ))}
            </motion.div>
          </AnimatePresence>
        )}
        
        {page.content && (
          <p className={`mt-6 text-sm leading-relaxed text-center ${background ? 'text-white font-bold drop-shadow-lg' : 'text-white/60'}`}>
            {page.content}
          </p>
        )}
      </div>
    </div>
  );
};

const MusicPlayerPost: React.FC<{ songTitle: string; songUrl: string; authorName: string; imageUrl?: string; background?: PostThemeBackground }> = ({ songTitle, songUrl, authorName, imageUrl, background }) => {
  const { playTrack, currentTrack, isPlaying, togglePlay } = useGlobalPlayerState();
  const isCurrent = currentTrack?.url === songUrl;
  const vinylZone = background?.zones.find(z => z.type === 'VINYL');

  return (
    <div className="bg-black/40 rounded-[3rem] p-10 border border-white/10 flex flex-col items-center text-center relative overflow-hidden group min-h-[400px]">
      {background && (
        <div className="absolute inset-0 z-0">
          <img loading="lazy" decoding="async" src={background.imageUrl || null} className="w-full h-full object-cover opacity-60" alt="" />
          {vinylZone && (
            <motion.div 
              animate={isCurrent && isPlaying ? { rotate: 360 } : {}}
              transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
              className="absolute rounded-full border-4 border-black/40 shadow-2xl overflow-hidden"
              style={{
                left: `${vinylZone.x}%`,
                top: `${vinylZone.y}%`,
                width: `${vinylZone.width}%`,
                height: `${vinylZone.height}%`,
                zIndex: 1
              }}
            >
              <img loading="lazy" decoding="async" src={imageUrl || `https://picsum.photos/seed/${songTitle}/400/400`} className="w-full h-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-1/4 h-1/4 bg-black rounded-full border-2 border-white/10" />
              </div>
            </motion.div>
          )}
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-b from-small-orange/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-10" />
      
      {!background && (
        <div className="relative mb-8 z-20">
          <motion.div 
            animate={isCurrent && isPlaying ? { rotate: 360 } : {}}
            transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
            className="w-48 h-48 rounded-full border-8 border-white/5 shadow-2xl overflow-hidden relative"
          >
            <img loading="lazy" decoding="async" src={imageUrl || `https://picsum.photos/seed/${songTitle}/400/400`} className="w-full h-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-12 bg-black rounded-full border-4 border-white/10" />
            </div>
          </motion.div>
        </div>
      )}
      
      <button 
        onClick={() => {
          if (isCurrent) {
            togglePlay();
          } else {
            playTrack({
              id: songUrl,
              title: songTitle,
              url: songUrl,
              artist: authorName,
              albumCover: imageUrl || ''
            } as any, null, 'LIBRARY');
          }
        }}
        className="absolute bottom-8 right-8 w-16 h-16 bg-white text-black rounded-full flex items-center justify-center shadow-2xl hover:scale-110 transition-transform z-30"
      >
        {isCurrent && isPlaying ? <Pause size={24} fill="black" /> : <Play size={24} fill="black" className="ml-1" />}
      </button>

      <div className="relative z-20 mt-auto">
        <h4 className="text-2xl font-black uppercase tracking-tight mb-2 drop-shadow-lg">{songTitle}</h4>
        <p className="text-[10px] font-black uppercase tracking-widest text-white/60 drop-shadow-lg">{authorName}</p>
      </div>
    </div>
  );
};

const ArcadePost: React.FC<{ gameId: string; onExpand?: () => void; background?: PostThemeBackground }> = ({ gameId, onExpand, background }) => {
  const screenZone = background?.zones.find(z => z.type === 'GAME_SCREEN');
  
  return (
    <div className="bg-[#1a1a1a] rounded-[2.5rem] border-4 border-[#333] p-8 shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative overflow-hidden group min-h-[400px]">
      {background && (
        <div className="absolute inset-0 z-0">
          <img loading="lazy" decoding="async" src={background.imageUrl || null} className="w-full h-full object-cover opacity-80" alt="" />
          {screenZone && (
            <div 
              className="absolute bg-black rounded-sm overflow-hidden"
              style={{
                left: `${screenZone.x}%`,
                top: `${screenZone.y}%`,
                width: `${screenZone.width}%`,
                height: `${screenZone.height}%`,
                transform: `rotate(${screenZone.rotation || 0}deg)`,
                zIndex: 1
              }}
            >
              <iframe src={`/game/${gameId}`} className="w-full h-full border-none" />
            </div>
          )}
        </div>
      )}

      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent z-10" />
      
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Gamepad2 className="text-red-500" size={24} />
            <h4 className="text-lg font-black uppercase tracking-tighter text-white italic">Arcade Mode</h4>
          </div>
          <div className="px-3 py-1 bg-red-500/20 rounded-full text-[8px] font-black text-red-500 uppercase tracking-widest">Insert Coin</div>
        </div>

        {!background && (
          <div className="aspect-video bg-black rounded-xl border-2 border-white/5 overflow-hidden relative group/game">
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm opacity-100 group-hover/game:opacity-0 transition-opacity z-10">
              <Play size={48} className="text-white mb-4" />
              <p className="text-[10px] font-black uppercase tracking-widest text-white/60">Click to Play</p>
            </div>
            <iframe src={`/game/${gameId}`} className="w-full h-full border-none" />
          </div>
        )}

        <div className="mt-6 flex justify-between items-center">
          <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
            <div className="w-3 h-3 rounded-full bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]" />
            <div className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
          </div>
          <button 
            onClick={onExpand}
            className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-all"
          >
            <Maximize2 size={14} /> Fullscreen
          </button>
        </div>
      </div>
    </div>
  );
};

const NewspaperPost: React.FC<{ articleIds: string[]; content: string; imageUrl?: string; background?: PostThemeBackground }> = ({ articleIds, content, imageUrl, background }) => {
  const photoZones = background?.zones.filter(z => z.type === 'PHOTO') || [];
  const textZones = background?.zones.filter(z => z.type === 'TEXT') || [];

  return (
    <div className="bg-[#fdfcf0] rounded-xl p-10 shadow-xl border border-[#e5e1c9] text-[#2c2c2c] font-serif relative overflow-hidden min-h-[500px]">
      {background && (
        <div className="absolute inset-0 z-0">
          <img loading="lazy" decoding="async" src={background.imageUrl || null} className="w-full h-full object-cover opacity-50 grayscale" alt="" />
          {photoZones.map((zone, idx) => (
            <div 
              key={zone.id}
              className="absolute overflow-hidden border border-black/20 grayscale"
              style={{
                left: `${zone.x}%`,
                top: `${zone.y}%`,
                width: `${zone.width}%`,
                height: `${zone.height}%`,
                transform: `rotate(${zone.rotation || 0}deg)`,
                zIndex: 1
              }}
            >
              <img loading="lazy" decoding="async" src={imageUrl || null || `https://picsum.photos/seed/${idx}/400/400`} className="w-full h-full object-cover" alt="" />
            </div>
          ))}
          {textZones.map((zone, idx) => (
            <div 
              key={zone.id}
              className="absolute p-2 overflow-hidden"
              style={{
                left: `${zone.x}%`,
                top: `${zone.y}%`,
                width: `${zone.width}%`,
                height: `${zone.height}%`,
                transform: `rotate(${zone.rotation || 0}deg)`,
                zIndex: 2
              }}
            >
              <p className="text-[10px] font-bold leading-tight text-black/80 line-clamp-6">
                {content}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="relative z-10">
        <div className="text-center border-b-2 border-[#2c2c2c] pb-6 mb-8">
          <h4 className="text-4xl font-black uppercase tracking-tighter mb-2 font-sans">The Daily Stream</h4>
          <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest opacity-60">
            <span>Vol. 12 No. 42</span>
            <span>{new Date().toLocaleDateString()}</span>
            <span>Price: Free</span>
          </div>
        </div>

        {!background && (
          <AdaptiveGrid phone={1} tablet={2} gap="2rem">
            <div className="space-y-4">
              <h3 className="text-2xl font-black leading-tight hover:underline cursor-pointer">Breaking: New Creative Era Begins on Platform</h3>
              <p className="text-sm leading-relaxed opacity-80 line-clamp-6">{content}</p>
              <button className="text-[10px] font-black uppercase tracking-widest border-b border-[#2c2c2c] pb-1 hover:opacity-60 transition-all">Read More</button>
            </div>
            <div className="bg-[#2c2c2c]/5 p-4 rounded-lg border border-[#2c2c2c]/10">
              <h5 className="text-xs font-black uppercase tracking-widest mb-4 border-b border-[#2c2c2c]/10 pb-2">Related Articles</h5>
              <div className="space-y-4">
                {[1, 2].map(i => (
                  <div key={i} className="group cursor-pointer">
                    <h6 className="text-sm font-bold group-hover:underline">How to master the new scrapbook feature...</h6>
                    <p className="text-[10px] opacity-60 mt-1">By Editorial Staff</p>
                  </div>
                ))}
              </div>
            </div>
          </AdaptiveGrid>
        )}
      </div>
    </div>
  );
};

const DeepLinkPost: React.FC<{ type: 'WATCH_ALONG' | 'LIVE_FEED'; url: string; title: string; authorId?: string }> = ({ type, url, title, authorId }) => {
  // A live-broadcast post has to tell the truth about the stream. While the author is
  // actually live it invites you to join; the moment the stream ends it flips to
  // "Live Ended" and offers the replay — instead of forever implying they're still on air.
  const [liveState, setLiveState] = useState<'CHECKING' | 'LIVE' | 'ENDED'>(type === 'LIVE_FEED' ? 'CHECKING' : 'LIVE');
  const [replay, setReplay] = useState<{ url: string; ownerName: string } | null>(null);
  const isLiveFeed = type === 'LIVE_FEED';

  // Real-time: watch this broadcaster's live feeds so the card switches to "ended"
  // the instant the stream stops, even while the post sits on screen.
  useEffect(() => {
    if (!isLiveFeed || !authorId) return;
    const unsub = fetchAllLiveFeeds((feeds) => {
      const stillLive = feeds.some(f => f.ownerId === authorId && (f as any).status !== 'ENDED' && (f as any).status !== 'OFFLINE');
      setLiveState(stillLive ? 'LIVE' : 'ENDED');
    });
    return () => { try { (unsub as any)?.(); } catch { /* */ } };
  }, [isLiveFeed, authorId]);

  // Once ended, locate the most recent replay for this broadcaster.
  useEffect(() => {
    if (liveState !== 'ENDED' || !authorId || replay) return;
    let alive = true;
    fetchStreamArchives(40).then(list => {
      if (!alive) return;
      const mine = (list || []).filter(a => a.ownerId === authorId && a.muxPlaybackId).sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0));
      if (mine[0]) setReplay({ url: `https://stream.mux.com/${mine[0].muxPlaybackId}.m3u8`, ownerName: mine[0].ownerName });
    }).catch(() => {});
    return () => { alive = false; };
  }, [liveState, authorId, replay]);

  const ended = isLiveFeed && liveState === 'ENDED';

  const openDeepLink = () => {
    try {
      const urlObj = new URL(url, window.location.origin);
      if (urlObj.origin === window.location.origin) {
        window.history.pushState({}, '', url);
        window.dispatchEvent(new PopStateEvent('popstate'));
        return;
      }
      window.open(url, '_blank');
    } catch (e) {
      console.error("Invalid URL in DeepLinkPost:", e);
    }
  };

  const openReplay = () => {
    if (!replay) return;
    window.dispatchEvent(new CustomEvent('PLAY_LIVE_FEED', { detail: { feed: {
      id: `replay_${authorId}`, streamId: `replay_${authorId}`, url: replay.url,
      title, ownerId: authorId, ownerName: replay.ownerName, status: 'ENDED', isPublic: true, timestamp: Date.now(),
    } } }));
  };

  return (
    <div className={`rounded-[2.5rem] p-8 border border-white/10 relative overflow-hidden group bg-gradient-to-br ${ended ? 'from-white/[0.08] to-white/[0.03]' : 'from-small-orange/20 to-purple-500/20'}`}>
      <div className="absolute -top-24 -right-24 w-64 h-64 bg-white/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-1000" />

      <div className="flex items-center gap-4 mb-6">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-xl ${ended ? 'bg-white/15 text-white' : 'bg-white text-black'}`}>
          {type === 'WATCH_ALONG' ? <Tv size={24} /> : ended ? <Play size={22} fill="currentColor" /> : <Radio size={24} />}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-white/40">
              {type === 'WATCH_ALONG' ? 'Watch Along Event' : ended ? 'Live Broadcast · Ended' : 'Live Broadcast'}
            </h4>
            {isLiveFeed && liveState === 'LIVE' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-600 text-white text-[8px] font-black uppercase tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" /> Live
              </span>
            )}
            {ended && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/15 text-white/70 text-[8px] font-black uppercase tracking-widest">
                <Clock size={9} /> Ended
              </span>
            )}
          </div>
          <h3 className="text-xl font-black uppercase tracking-tight">{title}</h3>
        </div>
      </div>

      {ended ? (
        replay ? (
          <button
            onClick={openReplay}
            className="w-full py-4 bg-white/10 border border-white/15 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-3 hover:bg-white/20 transition-all"
          >
            <Play size={14} fill="currentColor" /> Watch Replay
          </button>
        ) : (
          <div className="w-full py-4 bg-white/5 border border-white/10 text-white/40 rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-3">
            <Clock size={14} /> Broadcast Ended
          </div>
        )
      ) : (
        <button
          onClick={openDeepLink}
          className="w-full py-4 bg-white text-black rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-3 hover:bg-small-orange hover:text-white transition-all shadow-2xl"
        >
          Join Now <ExternalLink size={14} />
        </button>
      )}
    </div>
  );
};

// Mentions, scripture references and plain text — see src/lib/richText.tsx.
// Was duplicated with PostCard; both now share one implementation.
const RenderTextWithMentions: React.FC<{ text: string; onVisitUser: (uid: string) => void }> = ({ text, onVisitUser }) => (
  <RichText text={text} onVisitUser={onVisitUser} />
);

const FeedItemComponent: React.FC<{
  item: FeedItem;
  allFeedItems: FeedItem[];
  onStartTalk?: () => void;
  currentUser: FirebaseUser | null;
  onVisitUser: (uid: string) => void;
  onMessage?: (uid: string) => void;
  depth?: number;
  onReply: (parentId: string, text: string, mediaTimestamp?: number) => Promise<void>;
  isPosting: boolean;
  onSelectGame?: (game: Game) => void;
  availableBackgrounds: PostThemeBackground[];
}> = ({ item, allFeedItems, currentUser, onVisitUser, onMessage, depth = 0, onReply, isPosting, onSelectGame, availableBackgrounds, onStartTalk }) => {
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [hoveredUserId, setHoveredUserId] = useState<string | null>(null);
  const { playTrack } = useGlobalPlayerState();

  // Dwell time scoring — fires DWELL_10S every 10s while card is in viewport
  const dwellRef = useDwellTracker(item.id, item.sourceCollection ?? 'feed', depth === 0);

  const getThreadItems = (parentId: string): typeof allFeedItems => {
    const children = allFeedItems.filter(f => f.parentId === parentId);
    return children.reduce((acc, child) => [...acc, child, ...getThreadItems(child.id)], children);
  };

  const background = availableBackgrounds.find(bg => bg.id === item.backgroundId);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCommentPanelOpen, setIsCommentPanelOpen] = useState(false);
  const [likes, setLikes] = useState(item.likesCount || 0);
  const [isLiked, setIsLiked] = useState(false);
  const [isDebateModalOpen, setIsDebateModalOpen] = useState(false);
  const [activeDebateId, setActiveDebateId] = useState<string | null>(null);

  // Scroll-past trigger: when this post comes into view, check if there's a
  // pending challenge targeting the current user and fire the VS screen once.
  const vsTriggered = useRef(false);
  const vsRef = useRef<HTMLDivElement>(null);
  const vsInView = useInView(vsRef, { once: true, amount: 0.4 });

  useEffect(() => {
    if (!vsInView || vsTriggered.current || !currentUser) return;
    if (item.authorId === currentUser.uid) return; // can't challenge yourself
    const sessionKey = `vs_shown_${item.id}`;
    if (sessionStorage.getItem(sessionKey)) return;

    vsTriggered.current = true;

    import('../services/debateService').then(({ getPendingChallengeForPost }) => {
      getPendingChallengeForPost(item.id, currentUser.uid).then(debate => {
        if (!debate) return;
        sessionStorage.setItem(sessionKey, '1');
        window.dispatchEvent(new CustomEvent('CHALLENGE_VS', {
          detail: {
            debateId:       debate.id,
            challengerId:   debate.challengerId,
            challengerName: debate.challengerName,
            challengerPhoto: debate.challengerPhoto,
          },
        }));
      });
    });
  }, [vsInView, currentUser, item.id, item.authorId]);


  const inViewRef = useRef(null);
  const inView = useInView(inViewRef, { amount: 0.1 });

  useEffect(() => {
    if (!inView && replyingToId === item.id) {
      setReplyingToId(null);
    }
  }, [inView, replyingToId, item.id]);

  // Auto-retract comment panel when scrolling out of view
  useEffect(() => {
    if (!inView) {
      setIsCommentPanelOpen(false);
    }
  }, [inView]);

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this item?")) return;
    try {
      await deleteFeedItem(item.id);
    } catch (error) {
      console.error("Failed to delete feed item:", error);
      alert("Failed to delete item. Please try again.");
    }
  };

  const handleReplySubmit = async () => {
    if (!replyText.trim()) return;
    const uid = currentUser?.uid;
    const isSubstantive = replyText.trim().length > 40 && !/^[\p{Emoji}\s]+$/u.test(replyText.trim());
    if (isSubstantive && uid) {
      // If another non-author comment already exists in thread → this is a debate reply (higher value)
      const existingCommenters = (item.interactions as any)?.commentAuthorIds as string[] | undefined;
      const otherVoicesPresent = existingCommenters?.some(id => id !== uid && id !== item.authorId);
      const action = otherVoicesPresent ? 'DEBATE_REPLY' : 'LONG_COMMENT';
      recordFeedInteraction(item.id, action, item.sourceCollection ?? 'feed').catch(() => {});
    }
    await onReply(item.id, replyText);
    setReplyText('');
    setReplyingToId(null);
  };

  return (
    <div ref={el => { (inViewRef as any).current = el; (dwellRef as any).current = el; (vsRef as any).current = el; }} className="w-full flex flex-col items-center my-12 md:my-20">
      <motion.div
        className="w-full backdrop-blur-[100px] bg-white/5 border border-white/20 rounded-[2rem] md:rounded-[4rem] p-5 sm:p-8 md:p-16 xl:p-20 2xl:p-24 shadow-[0_40px_100px_rgba(0,0,0,0.6)] z-10 transition-all hover:bg-white/10 group/item"
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex flex-col md:flex-row items-start gap-6 md:gap-20 xl:gap-24">
          <div
            className="w-24 h-24 md:w-32 md:h-32 xl:w-44 xl:h-44 2xl:w-52 2xl:h-52 rounded-[2.5rem] overflow-hidden bg-white/10 ring-8 ring-white/5 cursor-pointer hover:ring-small-orange transition-all flex-shrink-0 relative group/avatar shadow-[0_30px_60px_rgba(0,0,0,0.4)]"
            onClick={() => item.authorId !== 'system' && onVisitUser(item.authorId)}
            onMouseEnter={() => setHoveredUserId(item.authorId)}
            onMouseLeave={() => setHoveredUserId(null)}
          >
            {item.authorPhoto ? (
              <img loading="lazy" decoding="async"
                src={thumb(item.authorPhoto, THUMB.card) || null}
                onError={onThumbError(item.authorPhoto)}
                className="w-full h-full object-cover transition-transform duration-700 group-hover/avatar:scale-110"
                referrerPolicy="no-referrer"
              />
            ) : (
              <User size={48} className="text-white/20 p-6 w-full h-full" />
            )}
            
            <AnimatePresence>
              {hoveredUserId === item.authorId && item.authorId !== 'system' && (
                <UserHoverCard
                  userId={item.authorId}
                  userName={item.authorName}
                  userPhoto={item.authorPhoto || ''}
                  currentUser={currentUser}
                  onVisit={onVisitUser}
                  onMessage={onMessage}
                />
              )}
            </AnimatePresence>
          </div>

          <div className="flex-1 w-full min-w-0">
            <div className="flex flex-wrap items-center gap-6 mb-10">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                   <h3
                    className="font-display font-black uppercase tracking-tighter text-white cursor-pointer hover:text-small-orange transition-all leading-none italic break-words min-w-0"
                    style={{ fontSize: 'clamp(1.5rem, 6vw, 4rem)' }}
                    onClick={() => item.authorId !== 'system' && onVisitUser(item.authorId)}
                  >
                    {item.authorName}
                  </h3>
                  {item.authorId !== 'system' && (
                    <PlajahPlusPill creatorId={item.authorId} creatorName={item.authorName} />
                  )}
                  {item.authorId === 'system' && (
                    <div className="bg-primary/20 border border-primary/20 px-3 py-1 rounded-full flex items-center gap-2">
                       <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                       <span className="text-[10px] font-black uppercase text-primary tracking-widest">Master</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-white/40 font-black text-[10px] md:text-[12px] uppercase tracking-[0.4em] font-mono">{new Date(item.timestamp).toLocaleString()}</span>
                  <div className="w-1 h-1 bg-white/10 rounded-full" />
                  <span className="text-small-orange font-black text-[10px] md:text-[12px] uppercase tracking-[0.4em]">Broadcast Node</span>
                </div>
              </div>
              
              <div className="ml-auto flex items-center gap-6">
                <button className="text-white/20 hover:text-white transition-colors group/opt">
                  <MoreHorizontal size={24} className="group-hover/opt:scale-110 transition-transform" />
                </button>
              </div>
            </div>

            <p className="font-black text-white leading-[1.1] mb-8 md:mb-14 whitespace-pre-wrap break-words tracking-tighter selection:bg-small-orange selection:text-black italic" style={{ fontSize: 'clamp(1.1rem, 4vw, 2.75rem)' }}>
               <RenderTextWithMentions text={item.content} onVisitUser={onVisitUser} />
            </p>

            {/* Theme Rendering */}
            <div className="mb-12">
              {item.theme === 'SCRAPBOOK' && item.pages && (
                <ScrapbookPost pages={item.pages} background={background} />
              )}
              {item.theme === 'PHOTO_ALBUM' && item.pages && (
                <PhotoAlbumPost pages={item.pages} background={background} />
              )}
              {item.theme === 'MUSIC_PLAYER' && item.songUrl && (
                <MusicPlayerPost
                  songTitle={item.songTitle || 'Untitled'}
                  songUrl={item.songUrl}
                  authorName={item.authorName}
                  imageUrl={item.imageUrl}
                  background={background}
                />
              )}
              {item.theme === 'ARCADE' && item.gameId && (
                <ArcadePost
                  gameId={item.gameId}
                  background={background}
                  onExpand={() => onSelectGame?.({
                    id: item.gameId!,
                    title: 'Arcade Game',
                    url: `/game/${item.gameId}`,
                    ownerId: item.authorId,
                    timestamp: item.timestamp,
                    playCount: 0,
                    description: 'Arcade game shared on feed',
                    thumbnailUrl: `https://picsum.photos/seed/${item.gameId}/400/300`
                  })}
                />
              )}
              {item.theme === 'NEWSPAPER' && (
                <NewspaperPost
                  articleIds={item.articleIds || []}
                  content={item.content}
                  imageUrl={item.imageUrl}
                  background={background}
                />
              )}
              {(item.theme === 'WATCH_ALONG' || item.theme === 'LIVE_FEED') && item.deepLinkUrl && (
                <DeepLinkPost
                  type={item.theme as any}
                  url={item.deepLinkUrl}
                  title={item.content.split('\n')[0]}
                />
              )}
            </div>

            {/* Attached media. Prefer the full media[] array (photos AND videos,
                single or carousel) — the old path shoved videos into an <img>, so
                they showed as text only. Fall back to the legacy single imageUrl
                for old `feed`-collection docs that only ever stored that field. */}
            {!item.theme && (item.media?.length ? (
              <div className="mb-12">
                <PostMediaCarousel items={item.media.filter(m => (m.url || m.id || (m as any).muxPlaybackId) && (m.type === 'PHOTO' || m.type === 'GIF' || m.type === 'STICKER' || m.type === 'VIDEO')).map(m => ({ type: m.type, url: m.url, thumbnail: m.thumbnail, title: m.title, id: m.id, muxPlaybackId: (m as any).muxPlaybackId }))} />
              </div>
            ) : item.imageUrl ? (
              <div className={`relative ${item.aspectRatio === 'VERTICAL' ? 'aspect-[3/4] md:aspect-[9/16]' : 'aspect-video'} rounded-[3rem] md:rounded-[4rem] overflow-hidden mb-12 shadow-[0_40px_80px_rgba(0,0,0,0.4)] ring-1 ring-white/10 group-hover/item:scale-[1.01] transition-transform duration-700`}>
                <img
                  src={item.imageUrl || undefined}
                  alt="Post content"
                  className={`w-full h-full ${item.autoCrop ? 'object-cover' : 'object-contain'}`}
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
              </div>
            ) : null)}

            {/* Interaction Footer */}
            <div className="flex flex-wrap items-center gap-4 md:gap-10 pt-10 border-t border-white/5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isLiked) {
                    // Only record when liking (not un-liking) to avoid score manipulation
                    recordFeedInteraction(item.id, 'LIKE', item.sourceCollection ?? 'feed').catch(() => {});
                  }
                  setLikes(prev => isLiked ? prev - 1 : prev + 1);
                  setIsLiked(!isLiked);
                }}
                className={`flex items-center gap-3 transition-all px-6 py-4 rounded-3xl ${isLiked ? 'bg-small-orange text-black' : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'}`}
              >
                <Heart size={22} className={isLiked ? "fill-black" : ""} />
                <span className="text-sm font-black uppercase tracking-widest font-mono">
                  {likes > 0 ? likes : 'Signal'}
                </span>
              </button>
              
              <button
                onClick={() => setIsCommentPanelOpen(!isCommentPanelOpen)}
                className={`flex items-center gap-3 transition-all px-6 py-4 rounded-3xl ${isCommentPanelOpen ? 'bg-white text-black' : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'}`}
              >
                <MessageSquare size={22} />
                <span className="text-sm font-black uppercase tracking-widest font-mono">{item.commentCount || 0}</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  recordFeedInteraction(item.id, 'NATIVE_SHARE', item.sourceCollection ?? 'feed').catch(() => {});
                  const text = `${item.authorName} signal broadcast: ${item.content.substring(0, 50)}... via Plajah`;
                  const url = `${window.location.origin}/?type=feed&id=${item.id}`;
                  window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
                }}
                className="flex items-center gap-3 text-white/40 hover:text-white transition-all px-6 py-4 rounded-3xl hover:bg-white/5"
              >
                <X size={22} />
              </button>

              {currentUser && onStartTalk && (
                <button
                  onClick={onStartTalk}
                  className="flex items-center gap-3 text-white/40 hover:text-red-400 transition-all px-4 py-4 rounded-3xl hover:bg-red-500/10"
                  title="Start Live Talk"
                >
                  <Radio size={20} />
                </button>
              )}

              <PayItForwardButton />

              {/* Debate this post — only for posts with text content, not your own */}
              {currentUser && item.content && currentUser.uid !== item.authorId && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsDebateModalOpen(true);
                  }}
                  title="Challenge this post to a structured debate"
                  className="flex items-center gap-3 text-white/40 hover:text-orange-400 transition-all px-6 py-4 rounded-3xl hover:bg-orange-500/10"
                >
                  <Swords size={22} />
                </button>
              )}

              {['SCRAPBOOK', 'PHOTO_ALBUM', 'MUSIC_PLAYER', 'ARCADE', 'NEWSPAPER'].includes(item.theme || '') && (
                <button
                  onClick={() => setIsFullscreen(true)}
                  className="flex items-center gap-3 text-white/40 hover:text-white transition-all px-6 py-4 rounded-3xl hover:bg-white/5"
                >
                  <Maximize2 size={22} />
                </button>
              )}

              {currentUser?.uid === item.authorId && (
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-3 text-white/20 hover:text-red-500 transition-all p-4 rounded-3xl ml-auto"
                >
                  <Trash2 size={22} />
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Cascading comment panel */}
      <AnimatePresence>
        {isCommentPanelOpen && (
          <motion.div 
            initial={{ height: 0, opacity: 0, y: -20 }}
            animate={{ height: '70vh', opacity: 1, y: -40 }}
            exit={{ height: 0, opacity: 0, y: -20 }}
            className="w-full backdrop-blur-[80px] bg-black/40 border-x border-b border-white/20 rounded-b-[4rem] flex flex-col z-0 overflow-hidden max-h-[85dvh] overflow-y-auto shadow-2xl"
          >
            <div className="flex-1 overflow-hidden p-2 md:p-6">
              <CommentSection
                postId={item.id}
                postAuthorId={item.authorId}
                onVisitUser={onVisitUser}
                onClose={() => setIsCommentPanelOpen(false)}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Post Debate — modal + active debate view */}
      {isDebateModalOpen && item.content && (
        <PostDebateModal
          postId={item.id}
          postText={item.content}
          postAuthorId={item.authorId}
          postAuthorName={item.authorName}
          postAuthorPhoto={item.authorPhoto || ''}
          heroImageUrl={item.imageUrl}
          onClose={() => setIsDebateModalOpen(false)}
          onDebateCreated={(id) => {
            setIsDebateModalOpen(false);
            setActiveDebateId(id);
          }}
        />
      )}

      {activeDebateId && (
        <div className="fixed inset-0 z-50 bg-black overflow-y-auto" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <DebateView
            debateId={activeDebateId}
            onBack={() => setActiveDebateId(null)}
          />
        </div>
      )}
    </div>
  );
};

// ── Recommended Clubs — shown in feed empty state ─────────────────────────────

const RecommendedClubsEmptyState: React.FC = () => {
  const [clubs, setClubs] = React.useState<any[]>([]);
  React.useEffect(() => {
    import('../services/backendService').then(({ fetchPublicClubs }: any) => {
      if (typeof fetchPublicClubs === 'function') {
        fetchPublicClubs().then((result: any[]) => setClubs(result.slice(0, 4))).catch(() => {});
      }
    });
  }, []);

  return (
    <div className="py-16 text-center">
      <div className="text-xs font-black uppercase tracking-[0.4em] text-white/20 mb-8">The feed is currently quiet</div>
      {clubs.length > 0 && (
        <div className="max-w-2xl mx-auto px-4">
          <p className="text-xs text-white/30 uppercase tracking-widest font-bold mb-4">Recommended clubs to join</p>
          <div className="grid grid-cols-2 gap-3">
            {clubs.map((club: any) => (
              <div key={club.id} className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 text-left hover:bg-white/5 transition-colors cursor-pointer">
                {club.bannerImage && (
                  <img src={thumb(club.bannerImage, THUMB.card) || undefined} loading="lazy" decoding="async" onError={onThumbError(club.bannerImage)} alt="" className="w-full h-16 object-cover rounded-xl mb-3"/>
                )}
                <div className="font-bold text-sm truncate">{club.name}</div>
                <div className="text-xs text-white/30 mt-1 line-clamp-2">{club.description}</div>
                <div className="text-[10px] text-white/20 mt-2">{club.memberCount ?? 0} members</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const FeedView: React.FC<FeedViewProps> = ({ onBack, currentUser, onVisitUser, onMessage, onSelectGame, viewerProfile }) => {
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [globalPosts, setGlobalPosts] = useState<Post[]>([]);
  const [signInAction, setSignInAction] = useState<string | null>(null);
  const [simplePostText, setSimplePostText] = useState('');
  const [isSimplePosting, setIsSimplePosting] = useState(false);
  const [composerExpanded, setComposerExpanded] = useState(false);
  /**
   * "Post to Today" (Blueprint 1B.4). When armed, the next post from this composer is
   * written as a 24h ephemeral Today (`isToday` + `expiresAt`) instead of a permanent
   * post — same `Post`, same collection, same createPost path, just a TTL. Disarms
   * itself after each post so it can never silently make everything ephemeral.
   */
  const [postToToday, setPostToToday] = useState(false);
  /** Fields the composer's createPost call spreads when Today is armed. */
  const todayFields = useCallback(
    () => (postToToday ? { isToday: true, expiresAt: Date.now() + TODAY_TTL_MS } : {}),
    [postToToday],
  );
  const [composerMedia, setComposerMedia] = useState<{ type: 'PHOTO'|'VIDEO'|'AUDIO'|'GIF'; url: string; title?: string }[]>([]);
  const [showPlatformPicker, setShowPlatformPicker] = useState(false);
  const [gifSearch, setGifSearch] = useState('');
  const [gifResults, setGifResults] = useState<any[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadLabel, setUploadLabel] = useState('');
  const [isPastingMedia, setIsPastingMedia] = useState(false);
  const [userAlbums, setUserAlbums] = useState<Album[]>([]);
  const [composerAlbumEmbed, setComposerAlbumEmbed] = useState<Album | null>(null);
  const [globalComposerTheme, setGlobalComposerTheme] = useState<FeedItem['theme']>('STANDARD');
  const [activeTab, setActiveTab] = useState<FeedTab>('GLOBAL');
  const { activeOrg } = useActiveIdentity();
  const [plajahFilter, setPlajahFilter] = useState<'ALL' | 'FOLLOWING' | 'LIKED'>('ALL');
  const [showNowOnboarding, setShowNowOnboarding] = useState(false);
  const [showNowBanner, setShowNowBanner] = useState(() => {
    try { return !localStorage.getItem(NOW_STORAGE_KEY); } catch { return false; }
  });
  const [showGoLive, setShowGoLive] = useState(false);
  const [showStartTalk, setShowStartTalk] = useState(false);
  const [joinTalkId, setJoinTalkId] = useState<string | null>(null);   // room to auto-join in the overlay
  const [globalActiveTalks, setGlobalActiveTalks] = useState<LiveTalk[]>([]);
  const [subscribedPodcasts, setSubscribedPodcasts] = useState<Album[]>([]);
  const [clockTime, setClockTime] = useState(() => new Date());
  const [featuredMusic, setFeaturedMusic] = useState<Album | null>(null);
  const [featuredFilm, setFeaturedFilm] = useState<Album | null>(null);
  const [featuredBook, setFeaturedBook] = useState<Album | null>(null);
  const [likedPosts, setLikedPosts] = useState<Post[]>([]);
  const [timelineValue, setTimelineValue] = useState(0);
  const [isTimelineDragging, setIsTimelineDragging] = useState(false);
  const timelineTrackRef = useRef<HTMLDivElement>(null);
  const feedScrollRef = useRef<HTMLDivElement>(null);
  const [newPost, setNewPost] = useState('');
  const [selectedTheme, setSelectedTheme] = useState<FeedItem['theme']>('STANDARD');
  const [pages, setPages] = useState<FeedPage[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string>('');
  const [selectedSong, setSelectedSong] = useState<{ title: string; url: string; albumCover?: string } | null>(null);
  const [deepLink, setDeepLink] = useState<{ type: 'WATCH_ALONG' | 'LIVE_FEED'; url: string; title: string } | null>(null);
  const [availableBackgrounds, setAvailableBackgrounds] = useState<PostThemeBackground[]>([]);
  const [selectedBackgroundId, setSelectedBackgroundId] = useState<string>('');
  const [showThemeSelector, setShowThemeSelector] = useState(false);
  const [userGames, setUserGames] = useState<Game[]>([]);
  const [userSongs, setUserSongs] = useState<any[]>([]);
  const [isPosting, setIsPosting] = useState(false);
  const [showStoryCreator, setShowStoryCreator] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<'VERTICAL' | 'HORIZONTAL' | 'SQUARE'>('HORIZONTAL');
  const [autoCrop, setAutoCrop] = useState(true);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [isLoadingNews, setIsLoadingNews] = useState(false);
  const [selectedSportsTab, setSelectedSportsTab] = useState<'ON_AIR' | 'HEADLINES' | 'SPORTS' | 'NBA' | 'NFL' | 'NHL' | 'MLB' | 'NCAA' | 'ESPORTS' | 'FIFA' | 'MLS' | 'F1' | 'NASCAR' | 'INDYCAR' | 'SCIENCE' | 'FINANCE'>('ON_AIR');
  const [selectedScienceCategory, setSelectedScienceCategory] = useState<'ALL' | 'BIOLOGY' | 'PHYSICS' | 'SPACE' | 'TECH' | 'CHEMISTRY'>('ALL');
  const [selectedFinanceSubTab, setSelectedFinanceSubTab] = useState<'MARKETS' | 'NEWS' | 'LEARN' | 'LOCAL' | 'GLOBAL'>('MARKETS');
  const [sportsScores, setSportsScores] = useState<any[]>([]);
  const [marketPrices, setMarketPrices] = useState<any[]>([]);
  const [financeCharts, setFinanceCharts] = useState<Record<string, any[]>>({});
  const [sciencePapers, setSciencePapers] = useState<any[]>([]);
  const [showSportsSettings, setShowSportsSettings] = useState(false);
  const [showScienceSettings, setShowScienceSettings] = useState(false);
  const [showFinanceSettings, setShowFinanceSettings] = useState(false);
  const [favoriteTeams, setFavoriteTeams] = useState<string[]>([]);
  const [favoriteScienceFields, setFavoriteScienceFields] = useState<string[]>([]);
  const [favoriteCoins, setFavoriteCoins] = useState<string[]>(['BTC', 'ETH', 'SOL']);
  const [favoriteStocks, setFavoriteStocks] = useState<string[]>(['AAPL', 'TSLA', 'NVDA']);
  const [hoveredUserId, setHoveredUserId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [suggestedArtist, setSuggestedArtist] = useState<UserProfile | null>(null);
  const { playTrack, theme } = useGlobalPlayerState();
  const { feed: fediverseFeed, accounts: fediverseAccounts, isLoadingFeed: fediverseLoading, refreshFeed: refreshFediverse, toggleLike: fediverseToggleLike, toggleRepost: fediverseToggleRepost } = useFediverse();
  const [socialSubTab, setSocialSubTab] = useState<'FEDIVERSE' | 'MY_POSTS'>('FEDIVERSE');
  const [feedPanelMode, setFeedPanelMode] = useState<'SINGLE' | 'DUAL'>('SINGLE');
  const [feedSyncScroll, setFeedSyncScroll] = useState(true);
  const [feedLightboxUrl, setFeedLightboxUrl] = useState<string | null>(null);

  // Apply δ_discovery personalization — re-sorts feedItems by score × viewer context
  const discoveryFeedItems = useViewerDiscovery(feedItems, currentUser?.uid);
  // Child-safety: hide adult-themed / age-restricted posts for child accounts.
  const personalizedFeedItems = React.useMemo(() => filterPostsForViewer(discoveryFeedItems, viewerProfile), [discoveryFeedItems, viewerProfile]);

  // Compute at render scope so React always sees changes — avoids IIFE-in-JSX issues
  // Expired "Today" posts are dropped on read. Firestore has no query-time TTL and its
  // native TTL policy deletes lazily, so this client guard is what users actually
  // experience. `withoutExpiredTodays` returns the same array when nothing is filtered,
  // so ordinary feeds keep referential equality.
  const displayedPosts = withoutExpiredTodays(plajahFilter === 'LIKED' ? likedPosts : globalPosts);

  const getThemeStyles = () => {
    switch (theme) {
      case 'LIGHT':
        return {
          tabActive: 'text-small-orange border-small-orange shadow-[0_4px_12px_rgba(255,140,0,0.2)]',
          tabInactive: 'text-black/30 hover:text-black hover:bg-black/5',
          heading: 'text-black',
        };
      case 'PASTEL':
        return {
          tabActive: 'text-small-orange border-small-orange shadow-[0_4px_12px_rgba(255,140,0,0.2)]',
          tabInactive: 'text-[#073642]/30 hover:text-[#073642] hover:bg-[#073642]/5',
          heading: 'text-[#073642]',
        };
      case 'ETHEREAL':
        return {
          tabActive: 'text-small-orange border-small-orange shadow-[0_0_20px_rgba(255,140,0,0.3)]',
          tabInactive: 'text-white/20 hover:text-white hover:bg-white/5',
          heading: 'text-white',
        };
      case 'CITRUS':
        return {
          tabActive: 'text-[#FF3B00] border-[#FF3B00] shadow-[0_0_15px_rgba(255,59,0,0.3)]',
          tabInactive: 'text-white/40 hover:text-[#FF3B00] hover:bg-[#FF3B00]/10',
          heading: 'text-white',
        };
      default:
        return {
          tabActive: 'text-small-orange border-small-orange shadow-[0_0_20px_rgba(255,140,0,0.3)]',
          tabInactive: 'text-white/40 hover:text-white hover:bg-white/5',
          heading: 'text-white',
        };
    }
  };

  const s = getThemeStyles();

  useEffect(() => {
    if (currentUser) {
      fetchUserProfile(currentUser.uid).then(profile => {
        setUserProfile(profile);
        if (profile?.favoriteSportsTeams) {
          setFavoriteTeams(profile.favoriteSportsTeams);
        }
        if (profile?.favoriteScienceFields) {
          setFavoriteScienceFields(profile.favoriteScienceFields);
        }
        if (profile?.favoriteCoins) {
          setFavoriteCoins(profile.favoriteCoins);
        }
        if (profile?.favoriteStocks) {
          setFavoriteStocks(profile.favoriteStocks);
        }
      });
    }
  }, [currentUser]);

  useEffect(() => {
    const loadBackgrounds = async () => {
      const bgs = await fetchThemeBackgrounds();
      setAvailableBackgrounds(bgs);
    };
    loadBackgrounds();
  }, []);

  useEffect(() => {
    const loadSuggested = async () => {
      try {
        const { fetchRandomActiveUser } = await import('../services/backendService');
        const user = await fetchRandomActiveUser();
        setSuggestedArtist(user);
      } catch (e) {
        console.error("Failed to load suggested artist", e);
      }
    };
    if (userProfile?.isFan) {
      loadSuggested();
    }
  }, [userProfile?.isFan]);

  useEffect(() => {
    let unsubscribe: () => void = () => {};

    if (activeTab === 'GLOBAL' || activeTab === 'SOCIAL') {
      if (activeTab === 'GLOBAL' && plajahFilter === 'FOLLOWING' && currentUser) {
        fetchFollowedFeed(currentUser.uid, (items) => {
          setFeedItems(items);
        }).then(unsub => {
          unsubscribe = unsub;
        });
      } else {
        unsubscribe = fetchFeed((items) => {
          setFeedItems(items);
        });
      }
    } else if (activeTab === 'NEWS') {
      fetchGlobalNews();
      fetchSportsScores();
    } else if (activeTab === 'TRENDING') {
      unsubscribe = fetchFeed((items) => {
        const sorted = [...items].sort((a, b) => (b.shareCount || 0) + (b.playCount || 0) - ((a.shareCount || 0) + (a.playCount || 0)));
        setFeedItems(sorted);
      });
    } else if (activeTab === 'TOP_10') {
      unsubscribe = fetchFeed((items) => {
        const sorted = [...items].sort((a, b) => (b.playCount || 0) - (a.playCount || 0)).slice(0, 10);
        setFeedItems(sorted);
      });
    } else if (activeTab === 'MOST_SHARED') {
      unsubscribe = fetchFeed((items) => {
        const sorted = [...items].sort((a, b) => (b.shareCount || 0) - (a.shareCount || 0)).slice(0, 20);
        setFeedItems(sorted);
      });
    }

    return () => unsubscribe();
  }, [activeTab, currentUser]);

  // Dedicated real-time subscription for Plajah Social (GLOBAL) tab
  useEffect(() => {
    if (activeTab !== 'GLOBAL') { setGlobalPosts([]); setLikedPosts([]); return; }
    let unsub: (() => void) | undefined;
    if (plajahFilter === 'LIKED' && currentUser) {
      unsub = listenToLikedPosts(currentUser.uid, setLikedPosts);
    } else if (plajahFilter === 'FOLLOWING' && currentUser) {
      listenToFollowedPosts(currentUser.uid, setGlobalPosts).then(fn => { unsub = fn; });
    } else {
      unsub = listenToGlobalPosts(setGlobalPosts);
    }
    return () => unsub?.();
  }, [activeTab, plajahFilter, currentUser?.uid]);

  // Live clock — ticks every second
  useEffect(() => {
    const t = setInterval(() => setClockTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Featured content for Today on Plajah discovery strip
  useEffect(() => {
    if (activeTab !== 'GLOBAL') return;
    fetchAllPublicAlbums().then(albums => {
      const music = albums.find(a => a.type === 'MUSIC');
      const film  = albums.find(a => a.type === 'VIDEO');
      if (music) setFeaturedMusic(music);
      if (film)  setFeaturedFilm(film);
    }).catch(() => {});
    fetchPublicBooks().then(books => {
      if (!books.length) return;
      const seed = Math.floor(Date.now() / 86400000) % books.length;
      setFeaturedBook(books[seed]);
    }).catch(() => {});
  }, [activeTab]);

  // Live talks listener for the GLOBAL tab strip
  useEffect(() => {
    if (activeTab !== 'GLOBAL') return;
    const unsub = listenToActiveLiveTalks(setGlobalActiveTalks);
    return () => unsub();
  }, [activeTab]);

  // Subscribed podcast albums for the GLOBAL tab strip
  useEffect(() => {
    if (activeTab !== 'GLOBAL' || !userProfile) return;
    const ids: string[] = (userProfile as any).subscribedPodcastIds ?? [];
    if (!ids.length) { setSubscribedPodcasts([]); return; }
    fetchAlbumsByIds(ids.slice(0, 20)).then(albums => setSubscribedPodcasts(albums)).catch(() => {});
  }, [activeTab, userProfile?.uid]);

  // Timeline scrubber ↔ feed scroll sync
  useEffect(() => {
    if (activeTab !== 'GLOBAL' || isTimelineDragging) return;
    const container = feedScrollRef.current;
    if (!container) return;
    const onScroll = () => {
      const posts = container.querySelectorAll('[data-post-index]');
      if (posts.length === 0) return;
      const containerTop = container.getBoundingClientRect().top;
      const threshold = container.clientHeight * 0.4;
      let topIdx = 0;
      posts.forEach((el, i) => {
        if (el.getBoundingClientRect().top - containerTop <= threshold) topIdx = i;
      });
      setTimelineValue((topIdx / Math.max(posts.length - 1, 1)) * 100);
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [activeTab, isTimelineDragging]);

  const scrubToPosition = useCallback((pct: number) => {
    const container = feedScrollRef.current;
    if (!container) return;
    const posts = container.querySelectorAll('[data-post-index]');
    if (posts.length === 0) return;
    const idx = Math.round((pct / 100) * (posts.length - 1));
    const el = posts[Math.min(idx, posts.length - 1)] as HTMLElement;
    if (!el) return;
    const elTop = el.getBoundingClientRect().top;
    const containerTop = container.getBoundingClientRect().top;
    container.scrollTop += elTop - containerTop;
  }, []);

  const handleTimelinePointer = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const track = timelineTrackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    setTimelineValue(pct);
    scrubToPosition(pct);
  }, [scrubToPosition]);

  const getTimelineLabel = useCallback((pct: number): string => {
    const posts = plajahFilter === 'LIKED' ? likedPosts : globalPosts;
    if (posts.length === 0) return '';
    const idx = Math.round((pct / 100) * (posts.length - 1));
    const post = posts[Math.min(idx, posts.length - 1)];
    if (!post) return '';
    const diffMs = Date.now() - post.timestamp;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  }, [globalPosts, likedPosts, plajahFilter]);

  const handleSimplePost = async () => {
    if (!currentUser || (!simplePostText.trim() && composerMedia.length === 0 && !composerAlbumEmbed)) return;
    setIsSimplePosting(true);
    try {
      await createPost({
        text: simplePostText.trim(),
        isPublic: true,
        ...(globalComposerTheme !== 'STANDARD' ? { theme: globalComposerTheme } : {}),
        ...(composerMedia.length > 0 ? { media: composerMedia } : {}),
        ...(composerAlbumEmbed ? { albumEmbed: composerAlbumEmbed, autoPlayEmbed: false } : {}),
        ...(selectedSong && globalComposerTheme === 'MUSIC_PLAYER' ? { songUrl: selectedSong.url, songTitle: selectedSong.title, imageUrl: selectedSong.albumCover } : {}),
        ...(pages.length > 0 && globalComposerTheme === 'SCRAPBOOK' ? { pages } : {}),
        ...(selectedBackgroundId ? { backgroundId: selectedBackgroundId } : {}),
        ...todayFields(),
      });
      setPostToToday(false);
      setSimplePostText('');
      setComposerMedia([]);
      setComposerExpanded(false);
      setComposerAlbumEmbed(null);
      setGlobalComposerTheme('STANDARD');
      setSelectedSong(null);
      setPages([]);
      setSelectedBackgroundId('');
    } catch (e) {
      console.error('Post failed:', e);
    } finally {
      setIsSimplePosting(false);
    }
  };

  const handleComposerPaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter(item => item.kind === 'file' && item.type.startsWith('image/'));
    if (!imageItems.length || !currentUser) return;
    e.preventDefault();
    setIsPastingMedia(true);
    setComposerExpanded(true);
    try {
      const { uploadFile: uploadToStorage } = await import('../services/backendService');
      const uploads = imageItems.map(async item => {
        const file = item.getAsFile();
        if (!file) return null;
        const ext = file.type.split('/')[1] || 'png';
        const url = await uploadToStorage(`posts/${currentUser.uid}/paste_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`, file);
        return { type: 'PHOTO' as const, url };
      });
      const results = (await Promise.all(uploads)).filter(Boolean) as { type: 'PHOTO'; url: string }[];
      if (results.length) setComposerMedia(prev => [...prev, ...results]);
    } catch (err) {
      console.error('[FeedView] Paste upload failed:', err);
    } finally {
      setIsPastingMedia(false);
    }
  }, [currentUser]);

  const handleFileAttach = async (e: React.ChangeEvent<HTMLInputElement>, mediaType: 'PHOTO'|'VIDEO'|'AUDIO') => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;
    setUploading(true);
    setUploadLabel(`Uploading ${mediaType.toLowerCase()}…`);
    try {
      const { uploadFile: uploadToStorage } = await import('../services/backendService');
      const ext = file.name.split('.').pop() || 'bin';
      const path = `posts/${currentUser.uid}/${Date.now()}.${ext}`;
      const url = await uploadToStorage(path, file);
      setComposerMedia(prev => [...prev, { type: mediaType, url, title: file.name }]);
    } catch (e) {
      console.error('Upload failed:', e);
    } finally {
      setUploading(false);
      setUploadLabel('');
      e.target.value = '';
    }
  };

  const searchGifs = async (q: string) => {
    if (!q.trim()) { setGifResults([]); return; }
    setGifLoading(true);
    try {
      const res = await fetch(
        `https://api.giphy.com/v1/gifs/search?api_key=dc6zaTOxFJmzC&q=${encodeURIComponent(q)}&limit=24&rating=pg`
      );
      const data = await res.json();
      setGifResults(data.data || []);
    } catch { setGifResults([]); }
    finally { setGifLoading(false); }
  };

  const loadUserAlbums = async () => {
    if (!currentUser) return;
    try {
      const albums = await fetchUserAlbums(currentUser.uid);
      setUserAlbums(albums);
    } catch {}
  };

  const fetchGlobalNews = async () => {
    setIsLoadingNews(true);
    try {
      let newsItems: any[] = [];
      let mappedRssCategory = 'GENERAL';

      // Map selectedSportsTab to RSS category
      if (selectedSportsTab === 'HEADLINES') mappedRssCategory = 'GENERAL';
      else if (selectedSportsTab === 'SPORTS') mappedRssCategory = 'SPORTS_ALL';
      else if (selectedSportsTab === 'SCIENCE') mappedRssCategory = 'SCIENCE';
      else if (selectedSportsTab === 'FINANCE') mappedRssCategory = 'FINANCE';
      else {
        // Sports specific tabs
        const tabMap: Record<string, string> = {
          'NBA':     'SPORTS_NBA',
          'NFL':     'SPORTS_NFL',
          'NHL':     'SPORTS_NHL',
          'MLB':     'SPORTS_MLB',
          'NCAA':    'SPORTS_NCAA',
          'FIFA':    'SPORTS_ALL',
          'MLS':     'SPORTS_ALL',
          'ESPORTS': 'SPORTS_ALL',
          'F1':      'SPORTS_ALL',
          'NASCAR':  'SPORTS_ALL',
          'INDYCAR': 'SPORTS_ALL',
        };
        mappedRssCategory = tabMap[selectedSportsTab] || 'SPORTS_ALL';
      }

      // If we're on heavily customizable tabs, or need special "Google Search" format, we can still use Gemini if preferred,
      // but the user requested SNAPPY and INSTANTANEOUS loading for EVERYTHING, especially sports. 
      // So we will use RSS for ALL of them.
      const rssNews = await fetchNewsFromRSS(mappedRssCategory);
      
      if (rssNews && rssNews.length > 0) {
        newsItems = rssNews.map((n: any) => ({
          id: n.id,
          title: n.headline,
          content: n.summary,
          source: n.source,
          url: n.url,
          timestamp: new Date(n.pubDate).getTime() || Date.now(),
          type: selectedSportsTab === 'SCIENCE' ? 'RESEARCH_PAPER' : 'NEWS'
        }));
      } else {
        // In case RSS is empty, fallback to Gemini
        let promptText = "Search for the top 10 breaking general news headlines across the globe for today, excluding sports and finance. Focus on current events, politics, and technology. Return them as a JSON array of objects with fields: id, title, content (short summary), source, url, and timestamp (current time in ms). CRITICAL: The 'url' field MUST be the direct, full canonical link to the specific article on the source website. Do not return homepage links.";
        
        if (selectedSportsTab !== 'HEADLINES') {
          promptText = `Search for the latest ${selectedSportsTab} news and headlines for today. Focus on major updates, trades, and upcoming games. Return as a JSON array of objects with fields: id, title, content, source, url (direct link to article), and timestamp.`;
        }

        if (selectedSportsTab === 'SCIENCE') {
          const interests = favoriteScienceFields.length > 0 ? favoriteScienceFields.join(', ') : 'general science, technology, space, and research';
          const categoryFilter = selectedScienceCategory !== 'ALL' ? `specifically in the field of ${selectedScienceCategory}` : '';
          promptText = `Search for the top 10 breaking science news headlines and academic research papers for today ${categoryFilter}. Focus on areas liked by the user: ${interests}. 
          Include a mix of general science news and recently published papers from sources like Nature, Science, arXiv, and NASA. 
          Return as a JSON array of objects with fields: id, title, content (summary), source, url (MUST be direct link to the article or paper), timestamp (ms), and type (e.g., 'RESEARCH_PAPER' or 'GLOBAL_NEWS').`;
        }

        if (selectedSportsTab === 'FINANCE') {
          const assets = [...favoriteCoins, ...favoriteStocks].join(', ');
          let financeContext = `General global economy and markets news. Focus on inflation, interest rates, and big tech.`;
          if (selectedFinanceSubTab === 'LEARN') financeContext = `Educational content for crypto and finance beginners. Explain fundamentals of blockchain, trading strategies, and essential vocabulary.`;
          if (selectedFinanceSubTab === 'LOCAL') financeContext = `Local economic news for the US (state and city level) and international regions based on common user locations. Focus on local labor markets, real estate, and regional policy.`;
          if (selectedFinanceSubTab === 'GLOBAL') financeContext = `Macroeconomic global news, focus on G7 economies, emerging markets, and international trade agreements.`;
          
          promptText = `Search for the top 10 finance and economy headlines for today. Context: ${financeContext}. Also provide updates on user interests: ${assets}.
          Return as a JSON array of objects with fields: id, title, content (summary/explanation), source, url (direct link), timestamp (ms), and sentiment ('POSITIVE', 'NEGATIVE', or 'NEUTRAL').`;
        }

        const responseText = await callGemini(
          promptText,
          {
            responseMimeType: "application/json",
            tools: [{ googleSearch: {} }]
          },
          "gemini-3-flash-preview"
        );

        newsItems = JSON.parse(responseText || '[]');
      }


      setFeedItems(newsItems.map((n: any) => ({
        ...n,
        type: n.type || 'NEWS',
        authorName: n.source,
        authorPhoto: `https://ui-avatars.com/api/?name=${n.source}&background=random`,
        authorId: 'system'
      })));

    } catch (err) {
      console.error("Failed to fetch news:", err);
    } finally {
      setIsLoadingNews(false);
    }
  };

  const fetchSportsScores = async () => {
    const endpoints: Record<string, string> = {
      NBA:    'basketball/nba',
      NFL:    'football/nfl',
      NHL:    'hockey/nhl',
      MLB:    'baseball/mlb',
      NCAA:   'basketball/mens-college-basketball',
      FIFA:   'soccer/eng.1',
      MLS:    'soccer/usa.1',
      // Racing handled by RacingCenterView directly — no generic scoreboard endpoint
    };

    try {
      if (selectedSportsTab === 'SPORTS') {
        // Fetch all top leagues
        const allScores = await Promise.all(
          Object.values(endpoints).map(async (league) => {
            const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${league}/scoreboard`);
            if (!res.ok) return [];
            const data = await res.json();
            return data.events || [];
          })
        );
        // Flatten and take a mix of events
        setSportsScores(allScores.flat().sort(() => 0.5 - Math.random()).slice(0, 15));
      } else {
        const league = endpoints[selectedSportsTab];
        if (!league) {
          setSportsScores([]);
          return;
        }
        const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${league}/scoreboard`);
        const data = await res.json();
        setSportsScores(data.events || []);
      }
    } catch (error) {
      console.error(`Failed to fetch ${selectedSportsTab} scores:`, error);
      setSportsScores([]);
    }
  };
 
  const fetchFinanceMarketData = async () => {
    try {
      // Fetch Crypto Prices (Public CoinGecko)
      const coins = favoriteCoins.length > 0 ? favoriteCoins.join(',') : 'bitcoin,ethereum,solana';
      // CoinGecko usually needs IDs, so we'll map common ones or just hit a general list
      const cryptoRes = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1&sparkline=true`);
      const cryptoData = await cryptoRes.json();
      
      const formattedMarket = cryptoData.map((coin: any) => ({
        id: coin.id,
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        price: coin.current_price,
        change: coin.price_change_percentage_24h,
        image: coin.image,
        history: coin.sparkline_in_7d?.price?.map((p: number, i: number) => ({ time: i, value: p })) || []
      }));

      setMarketPrices(formattedMarket);
    } catch (error) {
      console.error("Failed to fetch finance market data:", error);
    }
  };

  useEffect(() => {
    if (activeTab === 'NEWS' || activeTab === 'GLOBAL') {
      fetchSportsScores();
    }
    if (activeTab === 'NEWS') {
      fetchGlobalNews();
      if (selectedSportsTab === 'FINANCE') {
        fetchFinanceMarketData();
      }
    }
  }, [selectedSportsTab, selectedScienceCategory, selectedFinanceSubTab, activeTab]);

  // Prefetch all league data silently when NEWS tab first opens
  useEffect(() => {
    if (activeTab === 'NEWS') prefetchSports();
  }, [activeTab]);

const toggleFavoriteTeam = async (team: string) => {
    if (!currentUser) return;
    const newFavorites = favoriteTeams.includes(team) 
      ? favoriteTeams.filter(t => t !== team)
      : [...favoriteTeams, team];
    
    setFavoriteTeams(newFavorites);
    await updateUserProfile(currentUser.uid, { favoriteSportsTeams: newFavorites });
  };

  const toggleScienceField = async (field: string) => {
    if (!currentUser) return;
    const newFields = favoriteScienceFields.includes(field)
      ? favoriteScienceFields.filter(f => f !== field)
      : [...favoriteScienceFields, field];
    
    setFavoriteScienceFields(newFields);
    
    // Also sync to public interests in the notebook for global discovery
    const currentPublic = userProfile?.publicInterests || [];
    const newPublic = newFields.includes(field)
      ? Array.from(new Set([...currentPublic, `Science: ${field}`]))
      : currentPublic.filter(p => !p.startsWith(`Science: ${field}`));

    await updateUserProfile(currentUser.uid, { 
      favoriteScienceFields: newFields,
      publicInterests: newPublic
    });
  };
  
  const toggleCoin = async (coinId: string) => {
    if (!currentUser) return;
    const newCoins = favoriteCoins.includes(coinId)
      ? favoriteCoins.filter(c => c !== coinId)
      : [...favoriteCoins, coinId];
    setFavoriteCoins(newCoins);
    await updateUserProfile(currentUser.uid, { favoriteCoins: newCoins });
  };

  const toggleStock = async (stockSymbol: string) => {
    if (!currentUser) return;
    const newStocks = favoriteStocks.includes(stockSymbol)
      ? favoriteStocks.filter(s => s !== stockSymbol)
      : [...favoriteStocks, stockSymbol];
    setFavoriteStocks(newStocks);
    await updateUserProfile(currentUser.uid, { favoriteStocks: newStocks });
  };

  useEffect(() => {
    const loadUserAssets = async () => {
      if (currentUser) {
        const albums = await fetchUserAlbums(currentUser.uid);
        setUserAlbums(albums);
        const songs: any[] = [];
        albums.forEach(a => {
          a.tracks?.forEach(t => songs.push({ title: t.title, url: t.url, albumCover: a.coverImage }));
        });
        setUserSongs(songs);
      }
    };
    loadUserAssets();
  }, [currentUser]);


  const [mentionSearch, setMentionSearch] = useState('');
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [suggestedUsers, setSuggestedUsers] = useState<UserProfile[]>([]);
  const [mentionTriggerIndex, setMentionTriggerIndex] = useState(-1);

  useEffect(() => {
    const handleMentionSearch = async () => {
      if (mentionSearch.length > 0) {
        const users = await searchUserProfiles(mentionSearch);
        setSuggestedUsers(users);
        setShowMentionDropdown(users.length > 0);
      } else if (mentionTriggerIndex !== -1) {
        setShowMentionDropdown(false);
      } else {
        setShowMentionDropdown(false);
      }
    };
    handleMentionSearch();
  }, [mentionSearch, mentionTriggerIndex]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursorIndex = e.target.selectionStart || 0;
    setNewPost(val);

    const lastAtPos = val.lastIndexOf('@', cursorIndex - 1);
    if (lastAtPos !== -1) {
      const textAfterAt = val.substring(lastAtPos + 1, cursorIndex);
      if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
        setMentionSearch(textAfterAt);
        setMentionTriggerIndex(lastAtPos);
        return;
      }
    }
    setMentionTriggerIndex(-1);
    setMentionSearch('');
    setShowMentionDropdown(false);
  };

  const handleSelectMention = (user: UserProfile) => {
    const beforeMention = newPost.substring(0, mentionTriggerIndex);
    const afterMention = newPost.substring(mentionTriggerIndex + 1 + mentionSearch.length);
    const newContent = `${beforeMention}@[${user.displayName}](${user.uid})${afterMention}`;
    setNewPost(newContent);
    setMentionTriggerIndex(-1);
    setMentionSearch('');
    setShowMentionDropdown(false);
  };

  const handlePost = async () => {
    if (!currentUser || (!newPost.trim() && !pages.length && !selectedSong && !selectedGameId && !deepLink)) return;
    setIsPosting(true);
    try {
      const postData: any = {
        authorId: currentUser.uid,
        authorName: currentUser.displayName || 'Artist',
        authorPhoto: currentUser.photoURL || '',
        type: selectedTheme === 'MUSIC_PLAYER' ? 'SONG' : 
              selectedTheme === 'ARCADE' ? 'GAME' : 
              selectedTheme === 'WATCH_ALONG' ? 'WATCH_ALONG' :
              selectedTheme === 'LIVE_FEED' ? 'LIVE_FEED' : 'PICTURE',
        theme: selectedTheme,
        content: newPost,
      };

      if (pages.length > 0) postData.pages = pages;
      if (selectedSong) {
        postData.songUrl = selectedSong.url;
        postData.songTitle = selectedSong.title;
        if (selectedSong.albumCover) postData.imageUrl = selectedSong.albumCover;
      }
      
      // Fallback image from first page if not set by song
      if (!postData.imageUrl && pages.length > 0 && pages[0].url) {
        postData.imageUrl = pages[0].url;
      }

      if (selectedGameId) postData.gameId = selectedGameId;
      if (deepLink?.url) postData.deepLinkUrl = deepLink.url;
      if (selectedBackgroundId) postData.backgroundId = selectedBackgroundId;
      
      postData.aspectRatio = aspectRatio;
      postData.autoCrop = autoCrop;

      await postToFeed(postData);
      
      setNewPost('');
      setPages([]);
      setSelectedSong(null);
      setSelectedGameId('');
      setDeepLink(null);
      setSelectedTheme('STANDARD');
      setSelectedBackgroundId('');
    } catch (error) {
      console.error("Failed to post:", error);
    } finally {
      setIsPosting(false);
    }
  };

  const handleReply = async (parentId: string, text: string, mediaTimestamp?: number) => {
    if (!currentUser || !text.trim()) return;
    setIsPosting(true);
    await postToFeed({
      authorId: currentUser.uid,
      authorName: currentUser.displayName || 'Artist',
      authorPhoto: currentUser.photoURL || '',
      type: 'COMMENT',
      content: text,
      parentId: parentId,
      shareCount: 0,
      mediaTimestamp
    });
    setIsPosting(false);
  };


  return (
    <>
    {/* Frosted backdrop — FIXED to the viewport, not the content box. Painting it on the
        flex-1 container gave the dark layer and the blur a hard rectangular edge wherever the
        container ended, which read as a rendering mistake. Full-bleed has no seam. */}
    <div aria-hidden className="fixed inset-0 z-0 pointer-events-none bg-black/40 backdrop-blur-2xl" />
    <div className={`relative z-10 flex-1 ${activeTab === 'GLOBAL' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto custom-scrollbar'}`}>
      <div className={`${activeTab === 'GLOBAL' ? 'flex flex-col flex-1 overflow-hidden' : ''} p-3 sm:p-4 md:p-8 max-w-full mx-auto w-full`}>
        {/* HEADER */}
        <header className={`${activeTab === 'GLOBAL' ? 'mb-3 shrink-0' : 'mb-8'} space-y-5`}>
          <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
            <div className="min-w-0">
              <div className="flex items-center gap-3 mb-3">
                <button
                  onClick={onBack}
                  className={`p-2.5 rounded-2xl transition-all border ${theme === 'LIGHT' ? 'bg-black text-white border-black/5 hover:bg-black/90' : 'bg-white/8 text-white border-white/10 hover:bg-white/15'}`}
                >
                  <ArrowLeft size={18} />
                </button>
                <span className="text-[9px] font-black uppercase tracking-[0.45em] text-white/30">
                  {activeTab === 'GLOBAL' ? 'Your people · your culture · right now' : 'The Signal'}
                </span>
              </div>
              <PageHeader>
                {activeTab === 'SOCIAL' ? 'Interstellar' :
                 activeTab === 'GLOBAL' ? 'Plajah Social' :
                 activeTab === 'LIVETALK' ? 'Live Talk' :
                 activeTab === 'NEWS' ? 'Broadcast' :
                 activeTab === 'PULSE' ? 'Platform Pulse' : 'Signal'}
              </PageHeader>
            </div>
            <div className="hidden sm:flex items-center gap-2 shrink-0 mt-1">
               <span className="w-1.5 h-1.5 rounded-full bg-small-orange animate-pulse" />
               <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40">Live</span>
            </div>
          </div>

          <nav className="flex gap-1.5 px-0.5 overflow-x-auto no-scrollbar pb-1">
            {[
              { id: 'GLOBAL',   label: 'Plajah Social', icon: Cloud },
              { id: 'SOCIAL',   label: 'Interstellar', icon: Globe },
              { id: 'NEWS',     label: 'Broadcast',     icon: Newspaper },
              { id: 'LIVETALK', label: 'Live Talk',     icon: Mic },
              { id: 'NOW',      label: 'Right Now',     icon: Zap,    isNew: true },
              { id: 'PULSE',    label: 'Pulse',         icon: Swords },
            ].map((tab: any) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as FeedTab)}
                aria-current={activeTab === tab.id ? 'page' : undefined}
                className={`relative flex items-center gap-1.5 px-3 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all shrink-0 ${
                  activeTab === tab.id
                    ? 'bg-white text-black shadow-lg'
                    : 'bg-white/5 border border-white/8 text-white/45 hover:text-white hover:bg-white/10'
                }`}
              >
                <tab.icon size={11} className={tab.id === 'NOW' && activeTab !== tab.id ? 'text-green-400' : ''} />
                {tab.label}
                {tab.isNew && activeTab !== tab.id && (
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                )}
              </button>
            ))}
          </nav>

          {activeTab === 'GLOBAL' && (
            <div className="flex flex-wrap items-center gap-4 px-0.5 mt-1">
              <div className="flex p-1 bg-white/5 rounded-full border border-white/10">
                <button
                  onClick={() => setPlajahFilter('ALL')}
                  className={`px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${plajahFilter === 'ALL' ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}
                >
                  Global
                </button>
                <button
                  onClick={() => setPlajahFilter('FOLLOWING')}
                  className={`px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${plajahFilter === 'FOLLOWING' ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}
                >
                  Following
                </button>
                {currentUser && (
                  <button
                    onClick={() => setPlajahFilter('LIKED')}
                    className={`px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5
                      ${plajahFilter === 'LIKED' ? 'bg-red-400/90 text-white' : 'text-white/40 hover:text-red-400'}`}
                  >
                    <Heart size={10} fill={plajahFilter === 'LIKED' ? 'currentColor' : 'none'} strokeWidth={2} />
                    Liked
                  </button>
                )}
              </div>
            </div>
          )}
        </header>

      {/* ── Right Now announcement banner ── */}
      {showNowBanner && activeTab !== 'NOW' && (
        <RightNowAnnouncementBanner
          onLearnMore={() => { setShowNowBanner(false); setShowNowOnboarding(true); try { localStorage.setItem(NOW_STORAGE_KEY, '1'); } catch {} }}
          onDismiss={() => { setShowNowBanner(false); try { localStorage.setItem(NOW_STORAGE_KEY, '1'); } catch {}; }}
        />
      )}

      {/* ── PresenceSync — writes to Firestore when user plays content ── */}
      {userProfile && <PresenceSync currentUser={userProfile} />}

      {/* ── Right Now Onboarding Modal ── */}
      <RightNowOnboardingController
        show={showNowOnboarding}
        onActivate={async () => {
          if (userProfile?.uid) await _updatePresence(userProfile.uid, { presenceEnabled: true });
        }}
        onDismiss={() => setShowNowOnboarding(false)}
      />

      {activeTab === 'PULSE' ? (
        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 lg:px-16 pt-6 max-w-[1200px] mx-auto w-full">
          {currentUser ? (
            <DebatePulseFeed
              uid={currentUser.uid}
              followingIds={userProfile?.following ?? []}
              onOpenDebate={(id) => {
                window.dispatchEvent(new CustomEvent('OPEN_DEBATE', { detail: { debateId: id } }));
              }}
            />
          ) : (
            <div className="py-32 text-center">
              <Swords size={40} className="text-white/15 mx-auto mb-4" />
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/25">Sign in to see Platform Pulse</p>
            </div>
          )}
        </div>
      ) : activeTab === 'NOW' ? (
        <div className="flex-1 overflow-y-auto">
          <RightNowFeed
            currentUser={userProfile}
            followingUids={userProfile?.following ?? []}
            onVisitUser={onVisitUser}
          />
        </div>
      ) : activeTab === 'LIVETALK' ? (
        <div className="pt-4 lg:pt-12 px-1 sm:px-6 lg:px-20 max-w-[1600px] mx-auto w-full">
           <LiveTalkDiscovery
             currentUser={currentUser}
             onJoin={(id) => { setJoinTalkId(id); setShowStartTalk(true); }}
             onStartTalk={() => { setJoinTalkId(null); setShowStartTalk(true); }}
           />
        </div>
      ) : activeTab === 'NEWS' ? (
        <div className="px-1 sm:px-6 lg:px-20 max-w-[1600px] mx-auto w-full space-y-12 pb-20">
           {/* SPORTS & SCIENCE & FINANCE SUB NAVIGATION */}
           <div className="flex items-center gap-4 overflow-x-auto no-scrollbar pb-6 sticky top-0 bg-transparent z-40 backdrop-blur-sm">
             {['ON_AIR', 'HEADLINES', 'SPORTS', 'NBA', 'NFL', 'NHL', 'MLB', 'NCAA', 'FIFA', 'MLS', 'ESPORTS', 'F1', 'NASCAR', 'INDYCAR', 'SCIENCE', 'FINANCE'].map((tab) => (
               <button
                 key={tab}
                 onClick={() => setSelectedSportsTab(tab as any)}
                 className={`px-8 py-4 rounded-3xl text-[10px] font-black uppercase tracking-widest transition-all border whitespace-nowrap ${
                   selectedSportsTab === tab
                     ? (tab === 'ON_AIR' ? 'text-white border-transparent shadow-2xl' : 'bg-white text-black border-white shadow-2xl')
                     : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'
                 }`}
                 style={tab === 'ON_AIR' && selectedSportsTab === tab ? { background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)' } : undefined}
               >
                 {tab === 'ON_AIR' ? 'On Air' : tab}
               </button>
             ))}
             <button 
               onClick={() => {
                 if (selectedSportsTab === 'SCIENCE') setShowScienceSettings(!showScienceSettings);
                 else if (selectedSportsTab === 'FINANCE') setShowFinanceSettings(!showFinanceSettings);
                 else setShowSportsSettings(!showSportsSettings);
               }}
               className="ml-auto p-4 rounded-full bg-white/5 border border-white/5 text-white/40 hover:text-white transition-all"
             >
               <Zap size={20} className={(selectedSportsTab === 'SCIENCE' ? favoriteScienceFields.length > 0 : selectedSportsTab === 'FINANCE' ? (favoriteCoins.length > 0 || favoriteStocks.length > 0) : favoriteTeams.length > 0) ? "text-small-orange" : ""} />
             </button>
           </div>

           {/* On Air — the broadcast mega-guide (live streams, FAST channels, radio). */}
           {selectedSportsTab === 'ON_AIR' && <BroadcastHub currentUserId={currentUser?.uid} />}
           {selectedSportsTab !== 'ON_AIR' && <>

           {selectedSportsTab === 'FINANCE' && (
              <div className="flex items-center gap-4 overflow-x-auto no-scrollbar pb-8">
                {['MARKETS', 'NEWS', 'LEARN', 'LOCAL', 'GLOBAL'].map(sub => (
                  <button
                    key={sub}
                    onClick={() => setSelectedFinanceSubTab(sub as any)}
                    className={`px-6 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all ${
                      selectedFinanceSubTab === sub 
                        ? 'bg-[#00DAF3] text-black shadow-[0_0_20px_rgba(0,218,243,0.3)]' 
                        : 'bg-white/5 text-white/20 hover:text-white/40'
                    }`}
                  >
                    {sub}
                  </button>
                ))}
              </div>
           )}

           {showFinanceSettings && selectedSportsTab === 'FINANCE' && (
             <motion.div 
               initial={{ opacity: 0, y: -20 }}
               animate={{ opacity: 1, y: 0 }}
               className="p-8 bg-white/5 border border-white/10 rounded-[3rem] mb-12"
             >
               <div className="flex items-center justify-between mb-8">
                 <div>
                   <h3 className="text-2xl font-black uppercase tracking-tight italic">Finance & Crypto Radar</h3>
                   <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-1">Select assets to prioritize in the market frequency</p>
                 </div>
                 <button onClick={() => setShowFinanceSettings(false)} className="p-2 hover:bg-white/10 rounded-full transition-all">
                    <X size={24} />
                 </button>
               </div>

               <div className="space-y-8">
                 <div className="space-y-4">
                   <h4 className="text-[10px] font-black uppercase tracking-widest text-white/20">Cryptocurrencies</h4>
                   <div className="flex flex-wrap gap-4">
                     {['bitcoin', 'ethereum', 'solana', 'binancecoin', 'cardano', 'ripple', 'dogecoin'].map(coin => (
                       <button 
                        key={coin}
                        onClick={() => toggleCoin(coin)}
                        className={`inline-flex items-center gap-3 px-6 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
                          favoriteCoins.includes(coin) 
                            ? 'bg-[#00DAF3] text-black' 
                            : 'bg-white/5 border border-white/10 text-white/40 hover:bg-white/10'
                        }`}
                       >
                         {favoriteCoins.includes(coin) ? <Check size={12} /> : <Plus size={12} />}
                         {coin.toUpperCase()}
                       </button>
                     ))}
                   </div>
                 </div>
                 <div className="space-y-4">
                   <h4 className="text-[10px] font-black uppercase tracking-widest text-white/20">Stocks & Indices</h4>
                   <div className="flex flex-wrap gap-4">
                     {['AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN', 'GOOGL', 'SPX', 'NAS'].map(stock => (
                       <button 
                        key={stock}
                        onClick={() => toggleStock(stock)}
                        className={`inline-flex items-center gap-3 px-6 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
                          favoriteStocks.includes(stock) 
                            ? 'bg-small-orange text-white' 
                            : 'bg-white/5 border border-white/10 text-white/40 hover:bg-white/10'
                        }`}
                       >
                         {favoriteStocks.includes(stock) ? <Check size={12} /> : <Plus size={12} />}
                         {stock}
                       </button>
                     ))}
                   </div>
                 </div>
               </div>
             </motion.div>
           )}

           {selectedSportsTab === 'SCIENCE' && (
              <div className="flex items-center gap-4 overflow-x-auto no-scrollbar pb-8">
                {['ALL', 'BIOLOGY', 'PHYSICS', 'SPACE', 'TECH', 'CHEMISTRY'].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedScienceCategory(cat as any)}
                    className={`px-6 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all ${
                      selectedScienceCategory === cat 
                        ? 'bg-small-orange text-white' 
                        : 'bg-white/5 text-white/20 hover:text-white/40'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
           )}

           {showScienceSettings && selectedSportsTab === 'SCIENCE' && (
             <motion.div 
               initial={{ opacity: 0, y: -20 }}
               animate={{ opacity: 1, y: 0 }}
               className="p-8 bg-white/5 border border-white/10 rounded-[3rem] mb-12"
             >
               <div className="flex items-center justify-between mb-8">
                 <div>
                   <h3 className="text-2xl font-black uppercase tracking-tight italic">Science Interest Notebook</h3>
                   <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-1">Select fields to filter your research broadcast</p>
                 </div>
                 <button onClick={() => setShowScienceSettings(false)} className="p-2 hover:bg-white/10 rounded-full transition-all">
                    <X size={24} />
                 </button>
               </div>

               <div className="space-y-8">
                 {['Astrophysics', 'Quantum Mechanics', 'Microbiology', 'Robotics', 'Neuroscience', 'Genetics', 'Climate Science', 'AI Research'].map(field => (
                   <button 
                    key={field}
                    onClick={() => toggleScienceField(field)}
                    className={`inline-flex items-center gap-3 px-6 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all mr-4 mb-4 ${
                      favoriteScienceFields.includes(field) 
                        ? 'bg-blue-500 text-white shadow-[0_0_20px_rgba(59,130,246,0.3)]' 
                        : 'bg-white/5 border border-white/10 text-white/40 hover:bg-white/10'
                    }`}
                   >
                     {favoriteScienceFields.includes(field) ? <Check size={12} /> : <Plus size={12} />}
                     {field}
                   </button>
                 ))}
               </div>
             </motion.div>
           )}

           {showSportsSettings && selectedSportsTab !== 'SCIENCE' && (
             <motion.div 
               initial={{ opacity: 0, y: -20 }}
               animate={{ opacity: 1, y: 0 }}
               className="p-8 bg-white/5 border border-white/10 rounded-[3rem] mb-12"
             >
               <div className="flex items-center justify-between mb-8">
                 <div>
                   <h3 className="text-2xl font-black uppercase tracking-tight italic">Sports Ecosystem Settings</h3>
                   <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-1">Select your favorite teams to personalize the broadcast</p>
                 </div>
                 <button onClick={() => setShowSportsSettings(false)} className="p-2 hover:bg-white/10 rounded-full transition-all">
                    <X size={24} />
                 </button>
               </div>

               <div className="space-y-8">
                 {['LAKERS', 'CHIEFS', 'WARRIORS', 'YANKEES', 'COWBOYS', '76ERS'].map(team => (
                   <button 
                    key={team}
                    onClick={() => toggleFavoriteTeam(team)}
                    className={`inline-flex items-center gap-3 px-6 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all mr-4 mb-4 ${
                      favoriteTeams.includes(team) 
                        ? 'bg-small-orange text-white' 
                        : 'bg-white/5 border border-white/10 text-white/40 hover:bg-white/10'
                    }`}
                   >
                     {favoriteTeams.includes(team) ? <Check size={12} /> : <Plus size={12} />}
                     {team}
                   </button>
                 ))}
               </div>
             </motion.div>
           )}

           {/* FINANCE MARKETS OVERVIEW */}
           {selectedSportsTab === 'FINANCE' && selectedFinanceSubTab === 'MARKETS' && marketPrices.length > 0 && (
             <div className="space-y-8">
                <div className="flex items-center gap-4">
                   <div className="w-1.5 h-1.5 bg-[#00DAF3] rounded-full animate-pulse shadow-[0_0_8px_#00DAF3]" />
                   <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 italic">Live Frequency: Market Oscillations</h4>
                </div>
                <AdaptiveGrid phone={1} tablet={2} desktop={3} gap="2rem">
                   {marketPrices.map((asset) => (
                     <div key={asset.id} className="bg-white/5 border border-white/10 rounded-[3rem] p-10 hover:bg-white/10 transition-all cursor-pointer group overflow-hidden relative">
                        <div className="absolute -right-8 -bottom-8 opacity-5 group-hover:opacity-10 transition-opacity">
                           <TrendingUp size={160} className="stroke-[1]" />
                        </div>
                        <div className="relative z-10 flex flex-col gap-8">
                           <div className="flex items-center justify-between">
                              <div className="flex items-center gap-4">
                                 <img loading="lazy" decoding="async" src={asset.image || null} alt="" className="w-10 h-10 object-contain" />
                                 <div>
                                    <h3 className="text-xl font-black italic uppercase tracking-tighter leading-none">{asset.symbol}</h3>
                                    <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest">{asset.name}</p>
                                 </div>
                              </div>
                              <div className={`px-4 py-2 rounded-xl text-[10px] font-black italic ${asset.change >= 0 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                                 {asset.change >= 0 ? '+' : ''}{asset.change.toFixed(2)}%
                              </div>
                           </div>
                           
                           <div className="space-y-1">
                              <span className="text-[9px] font-black uppercase tracking-widest text-white/20">Current Value</span>
                              <p className="text-4xl font-black italic tracking-tighter text-white">
                                 ${asset.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </p>
                           </div>

                           <div className="h-24 w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                 <AreaChart data={asset.history}>
                                    <defs>
                                       <linearGradient id={`grad-${asset.id}`} x1="0" y1="0" x2="0" y2="1">
                                          <stop offset="5%" stopColor={asset.change >= 0 ? "#10b981" : "#ef4444"} stopOpacity={0.3}/>
                                          <stop offset="95%" stopColor={asset.change >= 0 ? "#10b981" : "#ef4444"} stopOpacity={0}/>
                                       </linearGradient>
                                    </defs>
                                    <Area 
                                       type="monotone" 
                                       dataKey="value" 
                                       stroke={asset.change >= 0 ? "#10b981" : "#ef4444"} 
                                       fillOpacity={1} 
                                       fill={`url(#grad-${asset.id})`} 
                                       strokeWidth={3}
                                    />
                                 </AreaChart>
                              </ResponsiveContainer>
                           </div>
                        </div>
                     </div>
                   ))}
                </AdaptiveGrid>
             </div>
           )}

           {selectedSportsTab === 'FINANCE' && selectedFinanceSubTab === 'LEARN' && (
             <div className="space-y-12">
                <div className="p-12 md:p-20 bg-white/5 border border-white/10 rounded-[4rem] relative overflow-hidden group">
                   <div className="absolute top-0 right-0 p-12 opacity-5">
                      <Book size={200} className="stroke-[1]" />
                   </div>
                   <div className="relative z-10 max-w-4xl space-y-8">
                      <div className="flex items-center gap-4">
                         <div className="w-1.5 h-1.5 bg-small-orange rounded-full animate-pulse" />
                         <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-small-orange italic">Educational Broadcast</h4>
                      </div>
                      <h2 className="text-6xl md:text-8xl font-black uppercase tracking-tighter leading-[0.8] italic">Interstellar <br/> Finance <br/> <span className="text-small-orange">Primer</span></h2>
                      <p className="text-xl text-white/60 font-medium italic leading-relaxed">Decrypting the complex frequencies of global trade and digital assets for the modern voyager.</p>
                      
                      <AdaptiveGrid phone={1} tablet={2} gap="2rem" className="pt-8">
                         {[
                            { title: 'Blockchain Fundamentals', duration: '12 min search', color: 'blue' },
                            { title: 'Technical Analysis 101', duration: '18 min search', color: 'orange' },
                            { title: 'Risk Management Protocols', duration: '15 min search', color: 'purple' },
                            { title: 'DeFi Ecosystem Mapping', duration: '22 min search', color: 'green' }
                         ].map(topic => (
                            <div key={topic.title} className="p-8 bg-white/5 border border-white/5 rounded-[2.5rem] hover:bg-white/10 transition-all cursor-pointer group/item">
                               <h3 className="text-xl font-black uppercase tracking-tighter italic mb-2 group-hover/item:text-small-orange transition-colors">{topic.title}</h3>
                               <p className="text-[10px] font-black uppercase tracking-widest text-white/20 italic">{topic.duration}</p>
                            </div>
                         ))}
                      </AdaptiveGrid>
                   </div>
                </div>
             </div>
           )}

           {/* LIVE SCORES ROW — only for SPORTS overview tab, not individual leagues */}
           {selectedSportsTab === 'SPORTS' && sportsScores.length > 0 && (
             <div className="space-y-6">
                <div className="flex items-center gap-4">
                   <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_red]" />
                   <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 italic">Live Scores Across Leagues</h4>
                </div>
                <div className="flex gap-6 overflow-x-auto no-scrollbar py-4 -mx-1 px-1 sm:-mx-6 sm:px-6">
                   {sportsScores.map((event: any) => (
                     <div key={event.id} className="min-w-[280px] bg-white/5 border border-white/10 rounded-[2.5rem] p-6 flex flex-col gap-4 hover:bg-white/10 transition-all cursor-pointer group">
                        <div className="flex items-center justify-between">
                           <span className="text-[9px] font-black uppercase tracking-widest text-white/20">{event.status?.type?.detail}</span>
                           {event.status?.type?.state === 'in' && <span className="text-[8px] font-black uppercase tracking-widest text-red-500 animate-pulse">Live</span>}
                        </div>
                        <div className="space-y-3">
                           {event.competitions?.[0]?.competitors?.map((team: any) => (
                             <div key={team.id} className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                   <img loading="lazy" decoding="async" src={team.team?.logo || null} alt="" className="w-7 h-7 object-contain opacity-80 group-hover:opacity-100 transition-opacity" />
                                   <span className={`text-sm font-black uppercase tracking-tight ${team.winner ? 'text-white' : 'text-white/40'}`}>{team.team?.abbreviation}</span>
                                </div>
                                <span className={`text-xl font-black italic ${team.winner ? 'text-small-orange' : 'text-white'}`}>{scoreText(team.score)}</span>
                             </div>
                           ))}
                        </div>
                     </div>
                   ))}
                </div>
             </div>
           )}

           {/* ── SPORTS CENTER (per-league) ─────────────────────────── */}
           {['NBA','NFL','NHL','MLB','NCAA','FIFA','MLS','ESPORTS','F1','NASCAR','INDYCAR'].includes(selectedSportsTab) && (
             <SportsCenterView selectedSportsTab={selectedSportsTab} />
           )}


                      {/* NEWS FEED */}
           <div className="space-y-12">
             {isLoadingNews ? (
               <div className="py-20 text-center">
                 <Zap className="mx-auto mb-6 text-small-orange animate-pulse" size={48} />
                 <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 italic">Sensing Global Waves for {selectedSportsTab} updates...</p>
               </div>
             ) : (
               feedItems.map((item) => (
                 <RolodexCard key={item.id}>
                    <div className="bg-white/5 border border-white/10 rounded-[2rem] md:rounded-[3.5rem] p-5 sm:p-8 md:p-12 hover:border-white/20 transition-all group overflow-hidden relative">
                       <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                          <Newspaper size={120} className="stroke-[1]" />
                       </div>
                       <div className="relative z-10 space-y-8">
                          <div className="flex items-center justify-between">
                             <div className="flex items-center gap-4">
                               <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center font-black text-xs text-small-orange overflow-hidden">
                                  <img loading="lazy" decoding="async" src={thumb(item.authorPhoto, THUMB.micro) || null} onError={onThumbError(item.authorPhoto)} className="w-full h-full object-cover" />
                               </div>
                               <div>
                                 <h4 className="text-[10px] font-black uppercase tracking-widest text-white/40 italic">{item.authorName}</h4>
                                 <p className="text-[8px] font-bold text-white/20 uppercase tracking-widest">{new Date(item.timestamp).toLocaleDateString()}</p>
                               </div>
                             </div>
                             <div className="flex items-center gap-2">
                                <div className={`w-1.5 h-1.5 ${item.type === 'RESEARCH_PAPER' ? 'bg-purple-500' : 'bg-[#00DAF3]'} rounded-full animate-pulse shadow-[0_0_8px_${item.type === 'RESEARCH_PAPER' ? '#A855F7' : '#00DAF3'}]`} />
                                <span className={`text-[8px] font-black uppercase tracking-widest ${item.type === 'RESEARCH_PAPER' ? 'text-purple-400' : 'text-[#00DAF3]'}`}>
                                   {item.type === 'RESEARCH_PAPER' ? 'Academic Publication' : 'Broadcast Signal'}
                                </span>
                             </div>
                          </div>
                          
                          <div className="space-y-4">
                            {item.source === 'NASA' && (
                              <div className="flex items-center gap-2 mb-2">
                                <Radio size={12} className="text-small-orange" />
                                <span className="text-[8px] font-black uppercase tracking-widest text-small-orange">Galactic Uplink Active</span>
                              </div>
                            )}
                            <h3 className="text-3xl md:text-5xl font-black uppercase tracking-tighter leading-none italic group-hover:text-small-orange transition-colors cursor-pointer" onClick={() => item.url && window.open(item.url, '_blank')}>
                              {item.title}
                            </h3>
                            <p className="text-white/60 text-lg leading-relaxed font-medium italic max-w-4xl">{item.content}</p>
                          </div>

                          <div className="flex items-center gap-8 pt-8 border-t border-white/5">
                             <button className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-all group/btn">
                                <Reply size={16} className="group-hover/btn:-translate-x-1 transition-transform" /> {item.commentCount || 0} Responses
                             </button>
                             <button className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-all group/btn">
                                <Zap size={16} className="group-hover/btn:scale-110 transition-transform" /> {item.likesCount || 0} Uplinks
                             </button>
                             <button 
                                onClick={() => item.url && window.open(item.url, '_blank')}
                                className="ml-auto flex items-center gap-3 px-8 py-4 bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-small-orange hover:text-white transition-all shadow-2xl"
                             >
                                READ FULL COVERAGE <ExternalLink size={14} />
                             </button>
                          </div>
                       </div>
                    </div>
                 </RolodexCard>
               ))
             )}
           </div>
           </>}
        </div>
      ) : (
        <div className={`${activeTab === 'GLOBAL' ? 'flex-1 overflow-hidden' : 'pt-4 pb-20'} max-w-[1700px] mx-auto w-full px-0 sm:px-4 lg:px-8 flex flex-col xl:flex-row gap-8 lg:gap-16`}>
          <div className={`flex-1 min-w-0 ${activeTab === 'GLOBAL' ? 'flex flex-col overflow-hidden' : ''}`}>
          {userProfile?.isFan && suggestedArtist && (
        <div className="mb-12 p-8 bg-gradient-to-br from-[#6B0099]/20 to-[#FF8C00]/20 border border-white/10 rounded-[3rem] shadow-2xl">
          <div className="flex items-center gap-4 mb-6">
            <Sparkles size={24} className="text-small-orange" />
            <h2 className="text-xl font-black uppercase tracking-widest">Discover This User</h2>
          </div>
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-white/10">
              <img loading="lazy" decoding="async" src={thumb(suggestedArtist.photoURL, THUMB.micro) || `https://picsum.photos/seed/${suggestedArtist.uid}/100/100`} onError={onThumbError(suggestedArtist.photoURL)} alt={suggestedArtist.displayName} className="w-full h-full object-cover" />
            </div>
            <div>
              <h3 className="font-bold text-lg">{suggestedArtist.displayName}</h3>
              <p className="text-sm text-white/50">Suggested Artist</p>
            </div>
            <button 
              onClick={() => onVisitUser(suggestedArtist.uid)}
              className="ml-auto px-6 py-3 bg-white text-black rounded-full font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-transform"
            >
              View Profile
            </button>
          </div>
        </div>
      )}

      {currentUser && activeTab === 'SOCIAL' && (
        <div className="mb-6 max-w-2xl mx-auto w-full">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('plajah:start-room'))}
            className="w-full mb-3 flex items-center gap-3 rounded-2xl px-5 py-3.5 text-left transition-all hover:scale-[1.005]"
            style={{ border: '1px solid rgba(255,140,0,0.35)', background: 'linear-gradient(120deg, rgba(255,140,0,0.12), rgba(129,102,230,0.1))' }}
          >
            <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,140,0,0.18)' }}>
              <span className="w-2.5 h-2.5 rounded-full bg-[#e23b3b] animate-pulse" />
            </span>
            <div className="flex-1">
              <div className="text-sm font-black text-white">Start a Room</div>
              <div className="text-[11px] text-white/50">Go live for 15–45 min — anyone can join &amp; chat. Posts to your feed.</div>
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-[#FF8C00]">Go live →</span>
          </button>
          <div className="mb-2"><IdentitySwitcher selfName={currentUser?.displayName} selfPhoto={currentUser?.photoURL} /></div>
          <UniversalPostComposer
            currentUser={currentUser}
            placeholder="What's happening in the studio? Design a gorgeous post..."
            avatarUrl={currentUser.photoURL || undefined}
            userAlbums={userAlbums}
            userSanctuaryId={currentUser.uid}
            onPost={async (data) => {
              const resolvedMedia = await resolveComposerMedia(data.attachments, currentUser.uid);
              const embedFields = await postFieldsForAssetEmbed(data.assetEmbed);
              await createPost({
                text: data.text,
                isPublic: true,
                ...(data.theme !== 'STANDARD' ? { theme: data.theme } : {}),
                ...(resolvedMedia.length > 0 ? { media: resolvedMedia } : {}),
                ...(data.contentLabels?.length ? { contentLabels: data.contentLabels } : {}),
                ...(data.sanctuaryGate ? { sanctuaryGate: data.sanctuaryGate } : {}),
                ...embedFields,
                ...(activeOrg ? { authorName: activeOrg.name, authorPhoto: activeOrg.logoUrl || '', authorOrgId: activeOrg.id } : {}),
                ...todayFields(),
              } as any);
              setPostToToday(false);
            }}
            onMakeStory={() => setShowStoryCreator(true)}
          />
        </div>
      )}

      {activeTab === 'SOCIAL' ? (
        <div className="flex flex-col flex-1 overflow-hidden">

          {/* Sub-tab bar — always visible */}
          <div className="shrink-0 flex gap-1 px-4 pt-3 pb-2 border-b border-white/5">
            {(['FEDIVERSE', 'MY_POSTS'] as const).map(t => (
              <button
                key={t}
                onClick={() => setSocialSubTab(t)}
                className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
                  socialSubTab === t
                    ? 'bg-white text-black shadow-lg'
                    : 'text-white/40 hover:text-white hover:bg-white/5'
                }`}
              >
                {t === 'FEDIVERSE' ? `Timeline${fediverseAccounts.length ? ` (${fediverseAccounts.length})` : ''}` : 'My Posts'}
              </button>
            ))}
            {socialSubTab === 'FEDIVERSE' && fediverseAccounts.length > 0 && (
              <button
                onClick={() => refreshFediverse()}
                disabled={fediverseLoading}
                className="ml-auto p-2 rounded-full text-white/30 hover:text-white hover:bg-white/5 transition-all disabled:opacity-40"
                title="Refresh timeline"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  className={fediverseLoading ? 'animate-spin' : ''}>
                  <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
              </button>
            )}
          </div>

          {socialSubTab === 'FEDIVERSE' ? (
            <div className="flex-1 overflow-y-auto">
              {/* No accounts connected — prompt */}
              {!fediverseAccounts.length ? (
                <div className="flex flex-col items-center gap-5 py-16 px-8 max-w-sm mx-auto text-center">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                    style={{ background: 'rgba(99,100,255,0.1)', border: '1px solid rgba(99,100,255,0.2)' }}>
                    <Share2 size={26} className="text-[#6364FF]" />
                  </div>
                  <div>
                    <p className="text-white font-black uppercase tracking-widest text-sm mb-2">Connect Mastodon or Bluesky</p>
                    <p className="text-white/40 text-xs leading-relaxed">
                      Your home timelines from Mastodon and Bluesky will appear here once you connect an account.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 text-[10px] text-white/30 leading-relaxed">
                    <p>Go to <span className="text-white/60 font-bold">Account Settings → Social Networks</span> to connect.</p>
                  </div>
                </div>
              ) : fediverseLoading ? (
                <div className="flex items-center justify-center gap-3 py-20 text-white/30">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
                    <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                  </svg>
                  <span className="text-sm font-bold uppercase tracking-widest">Loading timeline…</span>
                </div>
              ) : fediverseFeed.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-white/30">
                  <Share2 size={28} />
                  <p className="text-sm font-bold uppercase tracking-widest">Your timeline is empty</p>
                  <p className="text-xs text-white/20">Follow people on Mastodon or Bluesky to see posts here.</p>
                </div>
              ) : (
                <div className="w-full min-w-0 max-w-2xl mx-auto space-y-3 [&_iframe]:max-w-full [&_img]:max-w-full [&_video]:max-w-full">
                  {fediverseFeed.map(post => (
                    <FediversePostCard
                      key={`${post.protocol}-${post.id}`}
                      post={post}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <ProfileFeed
                uid={currentUser?.uid || ''}
                profileName={currentUser?.displayName || 'User'}
                onVisitUser={onVisitUser}
                xHandle={userProfile?.xHandle}
                mastodonHandle={userProfile?.mastodonHandle}
                mastodonInstance={userProfile?.mastodonInstance}
                blueskyHandle={userProfile?.blueskyHandle}
                threadsHandle={userProfile?.threadsHandle}
                hideBroadcaster={true}
                initialFeedType="X_FEED"
              />
            </div>
          )}
        </div>
      ) : activeTab === 'GLOBAL' ? (
        /* ── Plajah Social Canvas ───────────────────────────── */
        <div className="w-full min-w-0 max-w-full md:max-w-3xl lg:max-w-5xl xl:max-w-[1400px] 2xl:max-w-[1700px] mx-auto flex flex-col flex-1 overflow-hidden">

          {/* ── Today on Plajah — Clock · Featured Releases · History Cards ── */}
          {(() => {
            const musicFigure = getDailyFigure('MUSIC');
            const filmFigure  = getDailyFigure('FILM_TV');
            const hh = String(clockTime.getHours()).padStart(2, '0');
            const mm = String(clockTime.getMinutes()).padStart(2, '0');
            const ss = String(clockTime.getSeconds()).padStart(2, '0');
            const dateStr = clockTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
            return (
              <div className="shrink-0 px-4 pt-4 pb-3 border-b border-white/5">
                <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">

                  {/* ── Gorgeous Clock ── */}
                  <div className="shrink-0 w-[260px] h-[170px] rounded-[1.75rem] relative overflow-hidden border border-white/8 flex flex-col items-center justify-center"
                    style={{ background: 'radial-gradient(ellipse at 30% 20%, rgba(255,140,0,0.12) 0%, rgba(0,0,0,0.7) 70%)', boxShadow: '0 0 48px rgba(255,140,0,0.07)' }}>
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(255,255,255,0.03)_0%,transparent_70%)]" />
                    <div className="relative text-center px-5">
                      <div className="text-[8px] font-black uppercase tracking-[0.4em] text-small-orange/60 mb-3 flex items-center justify-center gap-1.5">
                        <Clock size={8} />
                        Plajah · Now
                      </div>
                      <div className="flex items-baseline justify-center gap-1">
                        <span className="text-5xl font-black tabular-nums leading-none text-white" style={{ letterSpacing: '-0.02em' }}>{hh}:{mm}</span>
                        <span className="text-xl font-black tabular-nums text-small-orange/70 leading-none" style={{ letterSpacing: '-0.02em' }}>:{ss}</span>
                      </div>
                      <div className="text-[9px] font-bold text-white/30 uppercase tracking-widest mt-3 leading-tight">{dateStr}</div>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-small-orange/30 to-transparent" />
                  </div>

                  {/* ── Latest Chora Release ── */}
                  {featuredMusic && (
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent('SELECT_ALBUM', { detail: { album: featuredMusic } }))}
                      className="shrink-0 w-[180px] h-[170px] rounded-[1.75rem] overflow-hidden relative border border-white/8 hover:border-small-orange/30 transition-all group text-left"
                    >
                      {featuredMusic.coverImage
                        ? <img src={thumb(featuredMusic.coverImage, THUMB.card) || undefined} loading="lazy" decoding="async" onError={onThumbError(featuredMusic.coverImage)} alt={featuredMusic.title} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                        : <div className="absolute inset-0 bg-white/5" />}
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                      <div className="absolute top-2.5 left-2.5">
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-black/70 border border-small-orange/25 rounded-full text-[7px] font-black uppercase tracking-widest text-small-orange">
                          <Music2 size={7} /> Chora · New
                        </span>
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 p-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-white truncate leading-tight">{featuredMusic.title}</p>
                        {featuredMusic.artist && <p className="text-[8px] text-white/40 font-bold truncate mt-0.5">{featuredMusic.artist}</p>}
                        <span className="inline-block mt-1.5 text-[7px] font-black uppercase tracking-widest text-small-orange">Play →</span>
                      </div>
                    </button>
                  )}

                  {/* ── Latest Taleo Release ── */}
                  {featuredFilm && (
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent('SELECT_ALBUM', { detail: { album: featuredFilm } }))}
                      className="shrink-0 w-[180px] h-[170px] rounded-[1.75rem] overflow-hidden relative border border-white/8 hover:border-cyan-400/30 transition-all group text-left"
                    >
                      {featuredFilm.coverImage
                        ? <img src={thumb(featuredFilm.coverImage, THUMB.card) || undefined} loading="lazy" decoding="async" onError={onThumbError(featuredFilm.coverImage)} alt={featuredFilm.title} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                        : <div className="absolute inset-0 bg-white/5" />}
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                      <div className="absolute top-2.5 left-2.5">
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-black/70 border border-cyan-400/25 rounded-full text-[7px] font-black uppercase tracking-widest text-cyan-400">
                          <Film size={7} /> Taleo · New
                        </span>
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 p-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-white truncate leading-tight">{featuredFilm.title}</p>
                        {featuredFilm.artist && <p className="text-[8px] text-white/40 font-bold truncate mt-0.5">{featuredFilm.artist}</p>}
                        <span className="inline-block mt-1.5 text-[7px] font-black uppercase tracking-widest text-cyan-400">Watch →</span>
                      </div>
                    </button>
                  )}

                  {/* ── Random Lorea Book ── */}
                  {featuredBook && (
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent('SELECT_ALBUM', { detail: { album: featuredBook } }))}
                      className="shrink-0 w-[180px] h-[170px] rounded-[1.75rem] overflow-hidden relative border border-white/8 hover:border-emerald-400/30 transition-all group text-left"
                    >
                      {featuredBook.coverImage
                        ? <img src={thumb(featuredBook.coverImage, THUMB.card) || undefined} loading="lazy" decoding="async" onError={onThumbError(featuredBook.coverImage)} alt={featuredBook.title} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                        : <div className="absolute inset-0 bg-white/5" />}
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                      <div className="absolute top-2.5 left-2.5">
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-black/70 border border-emerald-400/25 rounded-full text-[7px] font-black uppercase tracking-widest text-emerald-400">
                          <BookOpen size={7} /> Lorea · Classic
                        </span>
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 p-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-white truncate leading-tight">{featuredBook.title}</p>
                        {featuredBook.artist && <p className="text-[8px] text-white/40 font-bold truncate mt-0.5">{featuredBook.artist}</p>}
                        <span className="inline-block mt-1.5 text-[7px] font-black uppercase tracking-widest text-emerald-400">Read →</span>
                      </div>
                    </button>
                  )}

                  {/* ── Music History Today (Chora) ── */}
                  <div
                    onClick={() => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'CHORA_HISTORY' } }))}
                    className="shrink-0 w-[180px] h-[170px] rounded-[1.75rem] overflow-hidden relative border border-amber-500/20 hover:border-amber-400/40 cursor-pointer transition-all group"
                    style={{ boxShadow: '0 0 24px rgba(245,158,11,0.06)' }}
                  >
                    {musicFigure.imageUrl && (
                      <>
                        <img src={musicFigure.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover object-top" style={{ filter: 'blur(14px) brightness(0.25) saturate(1.8)' }} />
                        <img src={thumb(musicFigure.imageUrl, THUMB.card) || undefined} loading="lazy" decoding="async" onError={onThumbError(musicFigure.imageUrl)} alt={musicFigure.name} className="absolute inset-0 w-full h-full object-cover object-top opacity-60 group-hover:scale-105 transition-transform duration-700" />
                      </>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
                    <div className="absolute top-2.5 left-2.5">
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-black/70 border border-amber-500/25 rounded-full text-[7px] font-black uppercase tracking-widest text-amber-400">
                        <Music2 size={7} /> Music History
                      </span>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-white leading-tight">{musicFigure.name}</p>
                      <p className="text-[8px] text-amber-400/70 font-bold mt-0.5">{musicFigure.era}</p>
                      <p className="text-[8px] text-white/30 mt-1 leading-relaxed line-clamp-2">{musicFigure.bio.slice(0, 70)}…</p>
                    </div>
                  </div>

                  {/* ── Film History Today (Taleo) ── */}
                  <div
                    onClick={() => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'TALEO_HISTORY' } }))}
                    className="shrink-0 w-[180px] h-[170px] rounded-[1.75rem] overflow-hidden relative border border-blue-500/20 hover:border-blue-400/40 cursor-pointer transition-all group"
                    style={{ boxShadow: '0 0 24px rgba(59,130,246,0.06)' }}
                  >
                    {filmFigure.imageUrl && (
                      <>
                        <img src={filmFigure.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover object-top" style={{ filter: 'blur(14px) brightness(0.25) saturate(1.8)' }} />
                        <img src={thumb(filmFigure.imageUrl, THUMB.card) || undefined} loading="lazy" decoding="async" onError={onThumbError(filmFigure.imageUrl)} alt={filmFigure.name} className="absolute inset-0 w-full h-full object-cover object-top opacity-60 group-hover:scale-105 transition-transform duration-700" />
                      </>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
                    <div className="absolute top-2.5 left-2.5">
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-black/70 border border-blue-500/25 rounded-full text-[7px] font-black uppercase tracking-widest text-blue-400">
                        <Film size={7} /> Film History
                      </span>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-white leading-tight">{filmFigure.name}</p>
                      <p className="text-[8px] text-blue-400/70 font-bold mt-0.5">{filmFigure.era}</p>
                      <p className="text-[8px] text-white/30 mt-1 leading-relaxed line-clamp-2">{filmFigure.bio.slice(0, 70)}…</p>
                    </div>
                  </div>

                </div>
              </div>
            );
          })()}

          {/* ── Go Live button ── */}
          {currentUser && (
            <div className="shrink-0 px-4 pt-3 flex justify-end">
              <button
                onClick={() => setShowGoLive(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-full text-[10px] font-black uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(239,68,68,0.35)]"
              >
                <Radio size={13} className="animate-pulse" />
                Go Live
              </button>
            </div>
          )}

          {/* ── Stories Bar ── */}
          {currentUser && (
            <div className="shrink-0 border-b border-white/5">
              <StoriesBar
                currentUserId={currentUser.uid}
                currentUserName={currentUser.displayName || 'Me'}
                currentUserPhoto={currentUser.photoURL || undefined}
                followedUids={userProfile?.following ?? []}
                onVisitUser={onVisitUser}
              />
            </div>
          )}

          {/* ── Active Live Talks & Streams strip ── */}
          {globalActiveTalks.length > 0 && (
            <div className="shrink-0 px-4 py-3 border-b border-white/5">
              <div className="flex items-center gap-2 mb-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[8px] font-black uppercase tracking-[0.3em] text-red-400">Live Now</span>
              </div>
              <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                {globalActiveTalks.slice(0, 10).map(talk => (
                  <button
                    key={talk.id}
                    onClick={() => { setJoinTalkId(talk.id); setShowStartTalk(true); }}
                    className="flex-shrink-0 flex items-center gap-2.5 bg-red-500/10 border border-red-500/20 hover:border-red-500/40 rounded-2xl px-3.5 py-2 transition-all group"
                  >
                    <div className="relative shrink-0">
                      <img src={thumb(talk.hostPhoto, THUMB.micro) || undefined} loading="lazy" decoding="async" onError={onThumbError(talk.hostPhoto)} alt={talk.hostName} className="w-7 h-7 rounded-full object-cover ring-1 ring-red-500/40" />
                      <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border border-black" />
                    </div>
                    <div className="text-left min-w-0">
                      <p className="text-[9px] font-black uppercase tracking-widest text-white truncate max-w-[120px]">{talk.title}</p>
                      <p className="text-[8px] text-red-400/80 font-bold truncate max-w-[120px]">{talk.hostName}</p>
                    </div>
                    <div className="flex items-center gap-1 text-[8px] text-white/40 shrink-0">
                      <Users size={9} />
                      <span>{talk.listeners?.length + talk.speakers?.length || 0}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Subscribed Podcast Episodes strip ── */}
          {subscribedPodcasts.length > 0 && (
            <div className="shrink-0 px-4 py-3 border-b border-white/5">
              <div className="flex items-center gap-2 mb-2.5">
                <Mic size={10} className="text-purple-400" />
                <span className="text-[8px] font-black uppercase tracking-[0.3em] text-purple-400">Your Podcasts</span>
              </div>
              <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                {subscribedPodcasts.map(pod => (
                  <button
                    key={pod.id}
                    onClick={() => window.dispatchEvent(new CustomEvent('SELECT_ALBUM', { detail: { album: pod } }))}
                    className="flex-shrink-0 flex items-center gap-2.5 bg-white/[0.04] border border-white/8 hover:border-white/20 rounded-2xl px-3 py-2 transition-all group"
                  >
                    <img src={thumb(pod.coverImage, THUMB.micro) || undefined} loading="lazy" decoding="async" onError={onThumbError(pod.coverImage)} alt={pod.title} className="w-8 h-8 rounded-xl object-cover shrink-0" />
                    <div className="text-left min-w-0">
                      <p className="text-[9px] font-black uppercase tracking-widest text-white truncate max-w-[110px] group-hover:text-small-orange transition-colors">{pod.title}</p>
                      <p className="text-[8px] text-white/35 font-bold">{pod.tracks?.length ?? 0} ep</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Composer + Timeline (pinned, does not scroll) ── */}
          <div className="shrink-0">
            {/* Frosted glass panel */}
            <div className="backdrop-blur-3xl bg-black/40 border-b border-white/[0.06] shadow-[0_8px_32px_rgba(0,0,0,0.6)] pt-3 pb-3">

          {/* ── Horizontal 24hr Timeline Scrubber ── */}
          {displayedPosts.length > 0 && (
            <div className="mb-4 px-2 select-none">
              <div className="flex items-center gap-3">
                <span className="text-[8px] font-black uppercase tracking-widest text-white/30 shrink-0">
                  {getTimelineLabel(0)}
                </span>
                <div
                  ref={timelineTrackRef}
                  className="flex-1 h-1.5 bg-white/8 rounded-full relative cursor-pointer"
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setIsTimelineDragging(true);
                    handleTimelinePointer(e);
                  }}
                  onPointerMove={(e) => { if (isTimelineDragging) handleTimelinePointer(e); }}
                  onPointerUp={() => setIsTimelineDragging(false)}
                  onPointerCancel={() => setIsTimelineDragging(false)}
                >
                  {/* Quarter-hour tick marks */}
                  {[25, 50, 75].map(pct => (
                    <div
                      key={pct}
                      style={{ left: `${pct}%` }}
                      className="absolute top-1/2 -translate-y-1/2 w-px h-3 bg-white/15 pointer-events-none"
                    />
                  ))}
                  {/* Active fill */}
                  <div
                    className="absolute top-0 left-0 bottom-0 bg-gradient-to-r from-small-orange/60 to-small-orange/20 rounded-full transition-none"
                    style={{ width: `${timelineValue}%` }}
                  />
                  {/* Thumb */}
                  <motion.div
                    style={{ left: `${timelineValue}%` }}
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 bg-small-orange rounded-full shadow-lg shadow-small-orange/50 ring-2 ring-black cursor-grab active:cursor-grabbing flex items-center justify-center"
                    animate={{ scale: isTimelineDragging ? 1.3 : 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  >
                    <div className="w-1 h-1 bg-white rounded-full" />
                  </motion.div>
                  {/* Time tooltip on drag */}
                  {isTimelineDragging && (
                    <div
                      className="absolute -top-8 -translate-x-1/2 px-2 py-1 bg-black/90 border border-white/10 rounded-lg text-[9px] font-black uppercase tracking-widest text-white whitespace-nowrap pointer-events-none"
                      style={{ left: `${timelineValue}%` }}
                    >
                      {getTimelineLabel(timelineValue)}
                    </div>
                  )}
                </div>
                <span className="text-[8px] font-black uppercase tracking-widest text-white/20 shrink-0">
                  {getTimelineLabel(100)}
                </span>
              </div>
            </div>
          )}

          {/* ── Sign-in CTA (unauthenticated) ── */}
          {!currentUser && (
            <button
              onClick={() => setSignInAction('post to Plajah Social')}
              className="w-full flex items-center gap-4 px-5 py-4 bg-white/[0.03] border border-white/8 rounded-[2rem] hover:bg-white/[0.06] transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center shrink-0 group-hover:bg-small-orange/20 transition-all">
                <User size={18} className="text-white/30 group-hover:text-small-orange transition-colors" />
              </div>
              <span className="text-sm font-medium text-white/25 group-hover:text-white/50 transition-colors">
                Sign in to post…
              </span>
            </button>
          )}

          {/* ── Composer ── */}
          {currentUser && (
            <>
            {/* "Post to Today" — arms the next post as a 24h ephemeral Today (1B.4). */}
            <div className="flex items-center gap-2 px-1 pb-2">
              <button
                onClick={() => setPostToToday(v => !v)}
                aria-pressed={postToToday}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-widest transition-all ${
                  postToToday
                    ? 'bg-small-orange text-black border-small-orange shadow-[0_4px_14px_rgba(255,140,0,0.25)]'
                    : 'bg-white/5 text-white/35 border-white/10 hover:text-white/70 hover:bg-white/10'
                }`}
                title="Post to Today — disappears after 24 hours"
              >
                <Clock size={10} />
                Post to Today
              </button>
              <AnimatePresence>
                {postToToday && (
                  <motion.span
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -6 }}
                    className="text-[9px] font-bold uppercase tracking-widest text-small-orange/70"
                  >
                    Disappears in 24h
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            <UniversalPostComposer
              currentUser={currentUser}
              placeholder={postToToday ? 'Share a Today — gone in 24 hours…' : "What's on your mind?"}
              avatarUrl={currentUser.photoURL || undefined}
              userAlbums={userAlbums}
              onPost={async (data) => {
                const resolvedMedia = await resolveComposerMedia(data.attachments, currentUser.uid);
                const embedFields = await postFieldsForAssetEmbed(data.assetEmbed);
                await createPost({
                  text: data.text,
                  isPublic: true,
                  ...(data.theme !== 'STANDARD' ? { theme: data.theme } : {}),
                  ...(resolvedMedia.length > 0 ? { media: resolvedMedia } : {}),
                  ...embedFields,
                  ...(activeOrg ? { authorName: activeOrg.name, authorPhoto: activeOrg.logoUrl || '', authorOrgId: activeOrg.id } : {}),
                  ...todayFields(),
                } as any);
                setPostToToday(false);
              }}
              onMakeStory={() => setShowStoryCreator(true)}
            />
            </>
          )}

            </div>{/* end frosted glass panel */}
          </div>{/* end pinned composer */}

          {/* ── Posts: independently scrollable ── */}
          <div ref={feedScrollRef} className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
          <div className="pb-8">

          {/* Panel mode toggle */}
          <div className="flex items-center gap-2 mb-4 px-4 pt-3">
            {(['SINGLE', 'DUAL'] as const).map(m => (
              <button key={m} onClick={() => setFeedPanelMode(m)}
                className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest transition-all ${feedPanelMode === m ? 'bg-small-orange text-black' : 'bg-white/5 text-white/30 hover:bg-white/10'}`}>
                {m}
              </button>
            ))}
            {feedPanelMode === 'DUAL' && (
              <button onClick={() => setFeedSyncScroll(s => !s)}
                className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest transition-all ${feedSyncScroll ? 'bg-small-orange text-black' : 'bg-white/5 text-white/30 hover:bg-white/10'}`}>
                {feedSyncScroll ? 'Sync' : 'Async'}
              </button>
            )}
          </div>

          {/* DUAL panel layout */}
          {feedPanelMode === 'DUAL' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-[calc(100vh-200px)] px-3 md:px-4">
              <div className="overflow-y-auto overflow-x-hidden pr-2 scrollbar-hide space-y-4 min-w-0 [&_iframe]:max-w-full [&_img]:max-w-full [&_video]:max-w-full">
                <p className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-3">Posts</p>
                {displayedPosts.map((post) => (
                  <PostCard key={post.id} post={post} onVisitUser={onVisitUser} />
                ))}
              </div>
              <div className="overflow-y-auto pr-2 scrollbar-hide">
                <p className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-3">Media</p>
                <div className="grid grid-cols-2 gap-2">
                  {displayedPosts.flatMap(p => p.media || []).filter(m => m.type === 'PHOTO' || m.type === 'VIDEO').map((m, i) => (
                    <div
                      key={i}
                      className="aspect-square rounded-2xl overflow-hidden cursor-zoom-in"
                      onClick={() => m.type === 'PHOTO' && m.url && setFeedLightboxUrl(m.url)}
                    >
                      {m.type === 'VIDEO'
                        ? <video src={m.url} className="w-full h-full object-cover" muted />
                        : <img src={thumb(m.url, THUMB.card) || undefined} onError={onThumbError(m.url)} decoding="async" className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" loading="lazy" alt="" />}
                    </div>
                  ))}
                  {displayedPosts.flatMap(p => p.media || []).filter(m => m.type === 'PHOTO' || m.type === 'VIDEO').length === 0 && (
                    <div className="col-span-2 py-12 text-center text-[9px] font-black uppercase tracking-widest text-white/20">No media yet</div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {/* SINGLE mode: Timeline header + posts */}
          {feedPanelMode === 'SINGLE' && (
            <>
          {/* Student walls — published assignment work from the Film / Photo / Art /
              Chora schools. Self-hiding: renders nothing until a wall has work. */}
          <div className="px-4 pt-1">
            <StudentWallRow onVisitUser={onVisitUser} />
          </div>

          {/* Timeline header */}
          {displayedPosts.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 mt-3">
              <div className="flex-1 h-px bg-white/5" />
              <span className="text-[8px] font-black uppercase tracking-[0.4em] text-white/15 flex items-center gap-1.5">
                <Clock size={9} />
                {plajahFilter === 'LIKED' ? 'Liked' : 'Latest'}
              </span>
              <div className="flex-1 h-px bg-white/5" />
            </div>
          )}

          {/* Post feed */}
          <div className="space-y-3 w-full min-w-0 [&_iframe]:max-w-full [&_img]:max-w-full [&_video]:max-w-full">
          <AnimatePresence mode="popLayout" initial={false}>
            {displayedPosts.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-24 text-center"
              >
                <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center mx-auto mb-6">
                  {plajahFilter === 'LIKED'
                    ? <Heart size={28} className="text-red-400/30" />
                    : <Cloud size={28} className="text-white/20" />
                  }
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/20">
                  {plajahFilter === 'LIKED' ? 'Nothing liked yet' : 'The signal is quiet'}
                </p>
                <p className="text-[9px] font-bold text-white/10 uppercase tracking-widest mt-2">
                  {plajahFilter === 'LIKED' ? 'Heart posts to see them here' : 'Be the first to post'}
                </p>
              </motion.div>
            ) : (
              displayedPosts.map((post, idx) => (
                <motion.div
                  key={post.id}
                  data-post-index={idx}
                  layout
                  initial={{ opacity: 0, y: -12, scale: 0.99 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 340, damping: 32 }}
                >
                  <PostCard post={post} onVisitUser={onVisitUser} />
                </motion.div>
              ))
            )}
          </AnimatePresence>
          </div>{/* end post feed */}
            </>
          )}{/* end SINGLE mode */}

          </div>{/* end pb-8 */}
          </div>{/* end posts scroll area */}

        </div>
      ) : (
        <div className="space-y-12 w-full min-w-0 [&_iframe]:max-w-full [&_img]:max-w-full [&_video]:max-w-full">
          {isLoadingNews ? (
            <div className="py-20 text-center">
              <Zap className="mx-auto mb-6 text-small-orange" size={48} />
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Scanning Global Satellites for Breaking News...</p>
            </div>
          ) : (
            (() => {
              const rootItems = personalizedFeedItems.filter(item => !item.parentId);
              const HISTORY_EVERY = 5; // inject one history card every N posts
              return rootItems.flatMap((item, idx) => {
                const elements: React.ReactNode[] = [
                  <RolodexCard key={item.id}>
                    <FeedItemComponent
                      item={item}
                      allFeedItems={personalizedFeedItems}
                      currentUser={currentUser}
                      onVisitUser={onVisitUser}
                      onMessage={onMessage}
                      onReply={handleReply}
                      isPosting={isPosting}
                      onSelectGame={onSelectGame}
                      availableBackgrounds={availableBackgrounds}
                      onStartTalk={() => { setJoinTalkId(null); setShowStartTalk(true); }}
                    />
                  </RolodexCard>
                ];
                // Every HISTORY_EVERY posts, splice in a history moment card
                if ((idx + 1) % HISTORY_EVERY === 0) {
                  const slotOffset = Math.floor((idx + 1) / HISTORY_EVERY) - 1;
                  elements.push(
                    <div key={`history-pulse-${idx}`} className="px-0 md:px-4">
                      <HistoryMomentPulseCard
                        uid={currentUser?.uid}
                        category="MIX"
                        size="feed"
                        startOffset={slotOffset}
                        rotationIntervalSeconds={14}
                      />
                    </div>
                  );
                }
                return elements;
              });
            })()
          )}
          {personalizedFeedItems.length === 0 && !isLoadingNews && (
            <RecommendedClubsEmptyState />
          )}
        </div>
      )}
      </div>

          {/* THE 411 SIDEBAR */}
          {activeTab !== 'SOCIAL' && activeTab !== 'GLOBAL' && (
            <div className="w-full xl:w-[380px] shrink-0 space-y-8">
               <div className="sticky top-24 space-y-8 pb-12">
                  <div className="flex items-center gap-3 mb-6 px-4">
                    <Info className="text-small-orange" size={24} />
                    <h2 className="text-xl font-black uppercase tracking-widest text-[#CBC3D7]">The 411</h2>
                  </div>

                  {/* Sports Scores */}
                  {sportsScores.length > 0 && (
                     <div className="bg-white/5 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-8 shadow-2xl">
                        <h3 className="text-xs font-black uppercase tracking-widest mb-6 flex items-center gap-2"><Zap className="text-small-orange" size={16}/> Essential Scores</h3>
                        <div className="space-y-6">
                           {sportsScores.slice(0, 3).map(event => (
                              <div key={event.id} className="flex flex-col gap-3 group border-b border-white/5 pb-4 last:border-0 last:pb-0">
                                 <div className="flex items-center justify-between">
                                    <span className="text-[9px] font-black uppercase tracking-widest text-white/30">{event.status.type.detail}</span>
                                    {event.status.type.state === 'in' && <span className="text-[8px] font-black uppercase tracking-widest text-red-500 animate-pulse">Live</span>}
                                 </div>
                                 <div className="space-y-3">
                                    {event.competitions[0].competitors.map((team: any) => (
                                       <div key={team.id} className="flex items-center justify-between">
                                          <div className="flex items-center gap-3">
                                             <img loading="lazy" decoding="async" src={team.team.logo || null} alt="" className="w-6 h-6 object-contain opacity-80 group-hover:opacity-100 transition-opacity" />
                                             <span className={`text-xs font-black uppercase tracking-tight ${team.winner ? 'text-white' : 'text-white/60'}`}>
                                                {team.team.abbreviation}
                                             </span>
                                          </div>
                                          <span className={`text-base font-black italic ${team.winner ? 'text-small-orange' : 'text-white/80'}`}>
                                             {scoreText(team.score)}
                                          </span>
                                       </div>
                                    ))}
                                 </div>
                              </div>
                           ))}
                        </div>
                     </div>
                  )}

                  {/* Suggested Topics / Headlines */}
                  <div className="bg-white/5 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-8 space-y-8 shadow-2xl">
                     <div>
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-5">Trending Discussions</h3>
                        <div className="flex flex-wrap gap-2">
                           {['#CosmicSounds', '#MusicTheory', '#DigitalArt', '#IndieDev', '#FutureTech'].map(t => (
                              <span key={t} className="px-4 py-2 bg-black/40 rounded-full text-[9px] font-bold uppercase tracking-widest text-small-orange border border-white/5 hover:bg-white/10 transition-colors cursor-pointer">{t}</span>
                           ))}
                        </div>
                     </div>
                     <div className="pt-8 border-t border-white/5">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-6">On-Platform Articles</h3>
                        <div className="space-y-6">
                           {[1, 2, 3].map(i => (
                             <div key={i} className="flex gap-4 group cursor-pointer">
                                <div className="w-16 h-16 rounded-2xl bg-white/10 shrink-0 overflow-hidden relative">
                                   <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors z-10" />
                                   <img loading="lazy" decoding="async" src={`https://picsum.photos/seed/article${i}/150`} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                </div>
                                <div className="flex-1 flex flex-col justify-center">
                                   <p className="text-xs font-bold leading-snug group-hover:text-small-orange transition-colors line-clamp-2">The Evolution of Sound Design in Virtual Spaces</p>
                                   <p className="text-[8px] font-black uppercase tracking-widest text-white/40 mt-2">By Creator {i}</p>
                                </div>
                             </div>
                           ))}
                        </div>
                     </div>
                  </div>
               </div>
            </div>
          )}

        </div>
      )}
    </div>
   </div>

   {/* Global Story Creator modal */}
   <AnimatePresence>
     {showStoryCreator && currentUser && (
       <StoryCreator
         currentUserId={currentUser.uid}
         currentUserName={currentUser.displayName || 'Me'}
         currentUserPhoto={currentUser.photoURL || undefined}
         onClose={() => setShowStoryCreator(false)}
       />
     )}
   </AnimatePresence>

   <AnimatePresence>
     {signInAction && (
       <SignInPrompt action={signInAction} onClose={() => setSignInAction(null)} />
     )}
   </AnimatePresence>

   {showGoLive && (
     <Suspense fallback={null}>
       <GoLiveWizard onClose={() => setShowGoLive(false)} currentUser={currentUser} />
     </Suspense>
   )}

   {showStartTalk && (
     <div className="fixed inset-0 z-[500] bg-black">
       <Suspense fallback={<div className="w-full h-full flex items-center justify-center"><div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>}>
         <LiveTalkView
           initialShowSetup={!joinTalkId}
           initialTalkId={joinTalkId || undefined}
           onBrowse={() => { setShowStartTalk(false); setJoinTalkId(null); }}
         />
       </Suspense>
     </div>
   )}
   {/* Feed image lightbox — portaled so it opens centered, not at the page top */}
   {feedLightboxUrl && (
     <Portal>
     <div
       className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
       onClick={() => setFeedLightboxUrl(null)}
     >
       <div
         className="relative max-w-5xl max-h-[85dvh] w-full flex items-center justify-center"
         onClick={e => e.stopPropagation()}
       >
         <img
           src={feedLightboxUrl}
           alt="Full size"
           className="max-w-full max-h-[85vh] w-auto h-auto rounded-2xl object-contain shadow-2xl"
         />
         <div className="absolute top-3 right-3 flex items-center gap-2">
           <a
             href={feedLightboxUrl}
             target="_blank"
             rel="noopener noreferrer"
             onClick={e => e.stopPropagation()}
             className="p-2 rounded-xl bg-black/70 backdrop-blur border border-white/10 text-white/70 hover:text-white transition-colors"
             title="Open fullscreen"
           >
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
           </a>
           <button
             onClick={() => setFeedLightboxUrl(null)}
             className="p-2 rounded-xl bg-black/70 backdrop-blur border border-white/10 text-white/70 hover:text-white transition-colors"
           >
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
           </button>
         </div>
       </div>
     </div>
     </Portal>
   )}
   </>
  );
};

export default FeedView;
