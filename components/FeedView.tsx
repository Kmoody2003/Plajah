import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FeedItem, UserProfile, FeedPage, Game, Album, PostThemeBackground, LiveTalk, Post } from '../types';
import PageHeader from './PageHeader';
import { fetchFeed, fetchFollowedFeed, postToFeed, followUser, unfollowUser, isFollowing, deleteFeedItem, fetchUserProfile, fetchUserAlbums, fetchThemeBackgrounds, listenToActiveLiveTalks, updateUserProfile, searchUserProfiles, subscribeToComments, postComment, listenToGlobalPosts, listenToFollowedPosts, listenToLikedPosts, createPost } from '../services/backendService';
import { prefetchSports } from '../services/sportsService';
import { SportsCenterView } from './SportsCenterView';
import { fetchNewsFromRSS } from '../services/rssService';
import { ArrowLeft, User, Music2, MessageSquare, Image as ImageIcon, Send, Play, UserPlus, UserMinus, Globe, Newspaper, Zap, TrendingUp, Reply, Trash2, Sparkles, Book, Disc, Gamepad2, Tv, Radio, Layers, ChevronLeft, ChevronRight, Maximize2, ExternalLink, Volume2, VolumeX, Pause, Plus, Check, X, Heart, Pen, Share2, Mic, Search, Users, Cloud, Smile, MoreHorizontal, Info, Clock } from 'lucide-react';
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
import FediversePostCard from './FediversePostCard';
import { useFediverse } from '../contexts/FediverseContext';
import MiniMusicPlayer from './MiniMusicPlayer';
import StoriesBar from './StoriesBar';
import StoryCreator from './StoryCreator';
import SignInPrompt from './SignInPrompt';
import PlajahPlusPill from './PlajahPlusPill';

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
}

type FeedTab = 'SOCIAL' | 'GLOBAL' | 'NEWS' | 'LIVETALK' | 'TRENDING' | 'TOP_10' | 'MOST_SHARED';

const LiveTalkDiscovery: React.FC<{ 
  currentUser: FirebaseUser | null;
  onJoin: (id: string) => void;
}> = ({ currentUser, onJoin }) => {
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
                   placeholder="Search frequency / topic..."
                   className="w-full md:w-[400px] bg-white/5 border border-white/10 rounded-[2rem] py-6 pl-16 pr-8 text-sm outline-none focus:border-primary/40 focus:ring-4 focus:ring-primary/5 transition-all shadow-2xl"
                 />
              </div>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
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
                         <img loading="lazy" decoding="async" src={talk.hostPhoto || null} className="w-12 h-12 rounded-2xl object-cover shadow-2xl ring-2 ring-white/10" />
                         <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-black border border-white/10 rounded-full flex items-center justify-center">
                            <Mic size={10} className="text-primary" />
                         </div>
                      </div>
                      <div>
                         <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Hosted by</h4>
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
      </div>
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
          <img src={userPhoto || `https://picsum.photos/seed/${userId}/100/100`} alt={userName} className="w-full h-full object-cover" loading="lazy" />
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
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
          </div>
        )}
      </div>
    </div>
  );
};

const DeepLinkPost: React.FC<{ type: 'WATCH_ALONG' | 'LIVE_FEED'; url: string; title: string }> = ({ type, url, title }) => {
  return (
    <div className="bg-gradient-to-br from-small-orange/20 to-purple-500/20 rounded-[2.5rem] p-8 border border-white/10 relative overflow-hidden group">
      <div className="absolute -top-24 -right-24 w-64 h-64 bg-white/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-1000" />
      
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 bg-white text-black rounded-2xl flex items-center justify-center shadow-xl">
          {type === 'WATCH_ALONG' ? <Tv size={24} /> : <Radio size={24} />}
        </div>
        <div>
          <h4 className="text-[10px] font-black uppercase tracking-widest text-white/40">{type === 'WATCH_ALONG' ? 'Watch Along Event' : 'Live Broadcast'}</h4>
          <h3 className="text-xl font-black uppercase tracking-tight">{title}</h3>
        </div>
      </div>

      <button 
        onClick={() => {
        // Handle deep link without page reload
        try {
          const urlObj = new URL(url, window.location.origin);
          if (urlObj.origin === window.location.origin) {
            window.history.pushState({}, '', url);
            window.dispatchEvent(new PopStateEvent('popstate'));
            return;
          }
          // If external or same-origin but not handled by history, only use href as last resort
          window.open(url, '_blank');
        } catch (e) {
          console.error("Invalid URL in DeepLinkPost:", e);
        }
      }}
        className="w-full py-4 bg-white text-black rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-3 hover:bg-small-orange hover:text-white transition-all shadow-2xl"
      >
        Join Now <ExternalLink size={14} />
      </button>
    </div>
  );
};

const RenderTextWithMentions: React.FC<{ text: string; onVisitUser: (uid: string) => void }> = ({ text, onVisitUser }) => {
  // Regex to find @[Name](uid) pattern or just @Name
  // We'll use @[Name](uid) as the canonical mention format internally
  const parts = text.split(/(@\[[^\]]+\]\([^\)]+\))/g);
  return (
    <>
      {parts.map((part, i) => {
        const mentionMatch = part.match(/@\[([^\]]+)\]\(([^)]+)\)/);
        if (mentionMatch) {
          const name = mentionMatch[1];
          const uid = mentionMatch[2];
          return (
            <span 
              key={i}
              className="text-small-orange hover:underline cursor-pointer font-bold transition-all hover:scale-105 inline-block"
              onClick={(e) => {
                e.stopPropagation();
                onVisitUser(uid);
              }}
            >
              @{name}
            </span>
          );
        }
        return part;
      })}
    </>
  );
};

const FeedItemComponent: React.FC<{
  item: FeedItem;
  allFeedItems: FeedItem[];
  currentUser: FirebaseUser | null;
  onVisitUser: (uid: string) => void;
  onMessage?: (uid: string) => void;
  depth?: number;
  onReply: (parentId: string, text: string, mediaTimestamp?: number) => Promise<void>;
  isPosting: boolean;
  onSelectGame?: (game: Game) => void;
  availableBackgrounds: PostThemeBackground[];
}> = ({ item, allFeedItems, currentUser, onVisitUser, onMessage, depth = 0, onReply, isPosting, onSelectGame, availableBackgrounds }) => {
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [hoveredUserId, setHoveredUserId] = useState<string | null>(null);
  const { playTrack } = useGlobalPlayerState();

  const getThreadItems = (parentId: string): typeof allFeedItems => {
    const children = allFeedItems.filter(f => f.parentId === parentId);
    return children.reduce((acc, child) => [...acc, child, ...getThreadItems(child.id)], children);
  };

  const [comments, setComments] = useState<any[]>([]);
  const background = availableBackgrounds.find(bg => bg.id === item.backgroundId);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCommentPanelOpen, setIsCommentPanelOpen] = useState(false);
  const [likes, setLikes] = useState(item.likesCount || 0);
  const [isLiked, setIsLiked] = useState(false);

  useEffect(() => {
    let unsubscribe: () => void;
    if (isCommentPanelOpen || item.commentCount > 0) {
      unsubscribe = subscribeToComments(item.id, null, null, setComments, item.sourceCollection || 'feed');
    }
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [isCommentPanelOpen, item.id, item.sourceCollection]);

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
    await onReply(item.id, replyText);
    setReplyText('');
    setReplyingToId(null);
  };

  return (
    <div ref={inViewRef} className="w-full flex flex-col items-center my-12 md:my-20">
      <motion.div
        className="w-[98vw] max-w-7xl backdrop-blur-[100px] bg-white/5 border border-white/20 rounded-[3rem] md:rounded-[4rem] p-8 md:p-16 shadow-[0_40px_100px_rgba(0,0,0,0.6)] z-10 transition-all hover:bg-white/10 group/item"
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex flex-col md:flex-row items-start gap-12 md:gap-20">
          <div
            className="w-24 h-24 md:w-32 md:h-32 rounded-[2.5rem] overflow-hidden bg-white/10 ring-8 ring-white/5 cursor-pointer hover:ring-small-orange transition-all flex-shrink-0 relative group/avatar shadow-[0_30px_60px_rgba(0,0,0,0.4)]"
            onClick={() => item.authorId !== 'system' && onVisitUser(item.authorId)}
            onMouseEnter={() => setHoveredUserId(item.authorId)}
            onMouseLeave={() => setHoveredUserId(null)}
          >
            {item.authorPhoto ? (
              <img loading="lazy" decoding="async" 
                src={item.authorPhoto || null} 
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
                    className="font-display font-black text-4xl md:text-7xl uppercase tracking-tighter text-white cursor-pointer hover:text-small-orange transition-all leading-none italic"
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

            <p className="text-2xl md:text-5xl font-black text-white leading-[1.1] mb-14 whitespace-pre-wrap tracking-tighter selection:bg-small-orange selection:text-black italic">
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

            {item.imageUrl && !item.theme && (
              <div className={`relative ${item.aspectRatio === 'VERTICAL' ? 'aspect-[3/4] md:aspect-[9/16]' : 'aspect-video'} rounded-[3rem] md:rounded-[4rem] overflow-hidden mb-12 shadow-[0_40px_80px_rgba(0,0,0,0.4)] ring-1 ring-white/10 group-hover/item:scale-[1.01] transition-transform duration-700`}>
                <img
                  src={item.imageUrl || null}
                  alt="Post content"
                  className={`w-full h-full ${item.autoCrop ? 'object-cover' : 'object-contain'}`}
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
              </div>
            )}

            {/* Interaction Footer */}
            <div className="flex flex-wrap items-center gap-4 md:gap-10 pt-10 border-t border-white/5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
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
                <span className="text-sm font-black uppercase tracking-widest font-mono">{Math.max(item.commentCount || 0, comments.length)}</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  // Open X share intent
                  const text = `${item.authorName} signal broadcast: ${item.content.substring(0, 50)}... via Plajah`;
                  const url = `${window.location.origin}/?type=feed&id=${item.id}`;
                  window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
                }}
                className="flex items-center gap-3 text-white/40 hover:text-white transition-all px-6 py-4 rounded-3xl hover:bg-white/5"
              >
                <X size={22} />
              </button>

              <PayItForwardButton />

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
            className="w-[98vw] max-w-7xl backdrop-blur-[80px] bg-black/40 border-x border-b border-white/20 rounded-b-[4rem] flex flex-col z-0 overflow-hidden shadow-2xl"
          >
            <div className="flex-1 overflow-hidden p-2 md:p-6">
              <CommentSection 
                comments={comments}
                onPostComment={async (text, parentId, mediaTimestamp) => {
                  if (currentUser) {
                    await postComment(item.id, {
                      author: currentUser.displayName || 'User',
                      text,
                      timestamp: Date.now(),
                      uid: currentUser.uid,
                      parentId: parentId || null,
                      mediaTimestamp
                    }, item.sourceCollection || 'feed');
                  }
                }}
                onVisitUser={onVisitUser}
                currentUser={currentUser}
                title="Feed Discussion"
                onClose={() => setIsCommentPanelOpen(false)}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const FeedView: React.FC<FeedViewProps> = ({ onBack, currentUser, onVisitUser, onMessage, onSelectGame }) => {
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [globalPosts, setGlobalPosts] = useState<Post[]>([]);
  const [signInAction, setSignInAction] = useState<string | null>(null);
  const [simplePostText, setSimplePostText] = useState('');
  const [isSimplePosting, setIsSimplePosting] = useState(false);
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [composerMedia, setComposerMedia] = useState<{ type: 'PHOTO'|'VIDEO'|'AUDIO'|'GIF'; url: string; title?: string }[]>([]);
  const [showPlatformPicker, setShowPlatformPicker] = useState(false);
  const [gifSearch, setGifSearch] = useState('');
  const [gifResults, setGifResults] = useState<any[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadLabel, setUploadLabel] = useState('');
  const [userAlbums, setUserAlbums] = useState<Album[]>([]);
  const [composerAlbumEmbed, setComposerAlbumEmbed] = useState<Album | null>(null);
  const [globalComposerTheme, setGlobalComposerTheme] = useState<FeedItem['theme']>('STANDARD');
  const [activeTab, setActiveTab] = useState<FeedTab>('GLOBAL');
  const [plajahFilter, setPlajahFilter] = useState<'ALL' | 'FOLLOWING' | 'LIKED'>('ALL');
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
  const [selectedSportsTab, setSelectedSportsTab] = useState<'HEADLINES' | 'SPORTS' | 'NBA' | 'NFL' | 'NHL' | 'MLB' | 'NCAA' | 'ESPORTS' | 'SCIENCE' | 'FINANCE'>('HEADLINES');
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

  // Compute at render scope so React always sees changes — avoids IIFE-in-JSX issues
  const displayedPosts = plajahFilter === 'LIKED' ? likedPosts : globalPosts;

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
      });
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
          'NBA': 'SPORTS_NBA',
          'NFL': 'SPORTS_NFL',
          'NHL': 'SPORTS_NHL',
          'MLB': 'SPORTS_MLB',
          'NCAA': 'SPORTS_NCAA'
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
      NBA: 'basketball/nba',
      NFL: 'football/nfl',
      NHL: 'hockey/nhl',
      MLB: 'baseball/mlb',
      NCAA: 'basketball/mens-college-basketball'
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

  const trendingTopics = [
    { tag: '#GlobalMusic', count: '1.2k' },
    { tag: '#ArtRevolution', count: '850' },
    { tag: '#StudioLife', count: '2.4k' },
    { tag: '#NewTech', count: '500' }
  ];

  return (
    <>
    <div className={`flex-1 ${activeTab === 'GLOBAL' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto custom-scrollbar'} bg-transparent`}>
      <div className={`${activeTab === 'GLOBAL' ? 'flex flex-col flex-1 overflow-hidden' : ''} p-4 md:p-12 max-w-full mx-auto w-full`}>
        {/* BOLDER HEADER */}
        <header className={`${activeTab === 'GLOBAL' ? 'mb-3 shrink-0' : 'mb-20'} space-y-12`}>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-b-8 border-white/5 pb-12">
            <div>
              <div className="flex items-center gap-6 mb-6">
                <button 
                  onClick={onBack} 
                  className={`p-4 rounded-[1.5rem] transition-all border ${theme === 'LIGHT' ? 'bg-black text-white border-black/5 hover:bg-black/90' : 'bg-white text-black border-white/5 hover:bg-white/90'}`}
                >
                  <ArrowLeft size={24} />
                </button>
                <span className="text-[10px] md:text-[12px] font-black uppercase tracking-[1em] text-white/20 block px-4">Connections: The Signal</span>
              </div>
              <PageHeader>
                {activeTab === 'SOCIAL' ? 'Interstellar' :
                 activeTab === 'GLOBAL' ? 'Plajah Social' :
                 activeTab === 'LIVETALK' ? 'Talks' :
                 activeTab === 'NEWS' ? 'Broadcast' : 'Signal'}
              </PageHeader>
            </div>
            <div className="flex flex-col items-end gap-3 px-4">
               <span className="text-[12px] font-black uppercase tracking-[0.5em] text-small-orange">Uplink: Active</span>
               <div className="w-48 h-2 bg-gradient-to-r from-transparent via-small-orange to-transparent" />
            </div>
          </div>

          <nav className="flex flex-wrap gap-4 px-4 overflow-x-auto no-scrollbar">
            {[
              { id: 'SOCIAL', label: 'Interstellar Social', description: 'Timelines across external networks', icon: Globe },
              { id: 'GLOBAL', label: 'Plajah Social', description: 'On-platform aggregated experience', icon: Cloud },
              { id: 'NEWS', label: 'Broadcast News', description: 'Real-time global events & sports', icon: Newspaper },
              { id: 'LIVETALK', label: 'Satellite Talks', description: 'Live audio & video broadcasts', icon: Mic },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as FeedTab)}
                className={`group/tab relative overflow-hidden flex flex-col items-start gap-4 p-8 md:p-12 rounded-[2.5rem] md:rounded-[3.5rem] transition-all min-w-[200px] md:min-w-[300px] flex-1 ${
                  activeTab === tab.id 
                    ? `bg-white text-black shadow-[0_30px_60px_rgba(0,0,0,0.5)]` 
                    : `bg-white/5 border border-white/5 text-white/40 hover:bg-white/10 hover:border-white/10`
                }`}
              >
                <div className="relative z-10 flex flex-col gap-8 w-full">
                  <tab.icon size={32} className={activeTab === tab.id ? 'text-small-orange' : 'text-white/20 group-hover/tab:text-white transition-colors'} />
                  <div>
                     <span className={`text-[8px] font-black uppercase tracking-widest block mb-1 ${activeTab === tab.id ? 'text-black/40' : 'text-white/10'}`}>Frequency Node</span>
                     <h4 className="text-xl md:text-3xl font-black uppercase tracking-tight italic leading-tight">{tab.label}</h4>
                     <p className={`text-[10px] md:text-[12px] font-medium mt-2 max-w-[200px] leading-relaxed ${activeTab === tab.id ? 'text-black/60' : 'text-white/30'}`}>
                       {tab.description}
                     </p>
                  </div>
                </div>
                
                {activeTab === tab.id && (
                  <motion.div 
                    layoutId="tabUnderline"
                    className="absolute bottom-0 left-0 right-0 h-2 bg-small-orange"
                  />
                )}
              </button>
            ))}
          </nav>

          {activeTab === 'GLOBAL' && (
            <div className="flex flex-wrap items-center gap-4 px-4 mt-8">
              <div className="flex p-1 bg-white/5 rounded-full border border-white/10 mr-4">
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
              {trendingTopics.map(topic => (
                <button key={topic.tag} className="px-6 py-3 bg-white/5 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-[0.2em] hover:bg-white text-white hover:text-black transition-all flex items-center gap-3">
                  <span className="text-small-orange">#</span>
                  <span>{topic.tag}</span>
                  <span className="opacity-40 font-mono">{topic.count}</span>
                </button>
              ))}
            </div>
          )}
        </header>

      {activeTab === 'LIVETALK' ? (
        <div className="pt-4 lg:pt-12 px-6 lg:px-20 max-w-[1600px] mx-auto w-full">
           <LiveTalkDiscovery 
             currentUser={currentUser} 
             onJoin={(id) => {
               // Logic to open drawer and join talk will be handled by context or event
               // For now, we can use a custom event or just let the user open the drawer
               window.dispatchEvent(new CustomEvent('open-drawer', { detail: { tab: 'LIVETALK', talkId: id } }));
             }} 
           />
        </div>
      ) : activeTab === 'NEWS' ? (
        <div className="px-6 lg:px-20 max-w-[1600px] mx-auto w-full space-y-12 pb-20">
           {/* SPORTS & SCIENCE & FINANCE SUB NAVIGATION */}
           <div className="flex items-center gap-4 overflow-x-auto no-scrollbar pb-6 sticky top-0 bg-transparent z-40 backdrop-blur-sm">
             {['HEADLINES', 'SPORTS', 'NBA', 'NFL', 'NHL', 'MLB', 'NCAA', 'ESPORTS', 'SCIENCE', 'FINANCE'].map((tab) => (
               <button
                 key={tab}
                 onClick={() => setSelectedSportsTab(tab as any)}
                 className={`px-8 py-4 rounded-3xl text-[10px] font-black uppercase tracking-widest transition-all border whitespace-nowrap ${
                   selectedSportsTab === tab 
                     ? 'bg-white text-black border-white shadow-2xl' 
                     : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'
                 }`}
               >
                 {tab}
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
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
                </div>
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
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8">
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
                      </div>
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
                <div className="flex gap-6 overflow-x-auto no-scrollbar py-4 -mx-6 px-6">
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
                                <span className={`text-xl font-black italic ${team.winner ? 'text-small-orange' : 'text-white'}`}>{team.score}</span>
                             </div>
                           ))}
                        </div>
                     </div>
                   ))}
                </div>
             </div>
           )}

           {/* ── SPORTS CENTER (per-league) ─────────────────────────── */}
           {['NBA','NFL','NHL','MLB','NCAA','ESPORTS'].includes(selectedSportsTab) && (
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
                    <div className="bg-white/5 border border-white/10 rounded-[3.5rem] p-12 hover:border-white/20 transition-all group overflow-hidden relative">
                       <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                          <Newspaper size={120} className="stroke-[1]" />
                       </div>
                       <div className="relative z-10 space-y-8">
                          <div className="flex items-center justify-between">
                             <div className="flex items-center gap-4">
                               <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center font-black text-xs text-small-orange overflow-hidden">
                                  <img loading="lazy" decoding="async" src={item.authorPhoto || null} className="w-full h-full object-cover" />
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
        </div>
      ) : (
        <div className={`${activeTab === 'GLOBAL' ? 'flex-1 overflow-hidden' : 'pt-4 pb-20'} max-w-[1700px] mx-auto w-full px-4 lg:px-8 flex flex-col xl:flex-row gap-8 lg:gap-16`}>
          <div className={`flex-1 min-w-0 ${activeTab === 'GLOBAL' ? 'flex flex-col overflow-hidden' : ''}`}>
          {userProfile?.isFan && suggestedArtist && (
        <div className="mb-12 p-8 bg-gradient-to-br from-[#6B0099]/20 to-[#FF8C00]/20 border border-white/10 rounded-[3rem] shadow-2xl">
          <div className="flex items-center gap-4 mb-6">
            <Sparkles size={24} className="text-small-orange" />
            <h2 className="text-xl font-black uppercase tracking-widest">Discover This User</h2>
          </div>
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-white/10">
              <img loading="lazy" decoding="async" src={suggestedArtist.photoURL || `https://picsum.photos/seed/${suggestedArtist.uid}/100/100`} alt={suggestedArtist.displayName} className="w-full h-full object-cover" />
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
        <div className="mb-16 p-10 bg-theme-card/50 backdrop-blur-3xl border border-theme rounded-[3.5rem] shadow-3xl max-w-4xl mx-auto w-full">
          <div className="flex items-center gap-6 mb-8">
            <div className="w-16 h-16 rounded-full bg-white/10 overflow-hidden ring-2 ring-white/5">
              {currentUser.photoURL ? <img src={currentUser.photoURL || null} alt={currentUser.displayName || ''} className="w-full h-full object-cover" loading="lazy" /> : <User size={24} className="text-white/20" />}
            </div>
            <div>
              <p className="font-black text-[10px] uppercase tracking-[0.4em] text-primary/40">Create Masterpiece</p>
              <p className="font-bold text-lg text-primary/80">{currentUser.displayName}</p>
            </div>
          </div>

          <div className="relative mb-8">
            <textarea 
              value={newPost}
              onChange={handleInputChange}
              placeholder="What's happening in the studio? Design a gorgeous post..."
              className="w-full bg-white/5 border border-theme rounded-[2.5rem] p-10 text-xl font-medium focus:outline-none focus:ring-4 focus:ring-white/5 transition-all min-h-[200px] resize-none placeholder:text-primary/10"
            />
            {showMentionDropdown && (
              <div className="absolute left-0 bottom-full mb-4 w-72 bg-[#1A1A1A] border border-white/10 rounded-[2rem] shadow-4xl overflow-hidden z-[100] animate-in fade-in slide-in-from-bottom-2">
                <div className="p-4 border-b border-white/10 bg-white/5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Mention Someone</p>
                </div>
                <div className="max-h-60 overflow-y-auto no-scrollbar">
                  {suggestedUsers.map(user => (
                    <button
                      key={user.uid}
                      onClick={() => handleSelectMention(user)}
                      className="w-full flex items-center gap-4 p-4 hover:bg-white/5 transition-colors text-left group"
                    >
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-white/10 ring-2 ring-white/5 group-hover:ring-small-orange transition-all">
                        {user.photoURL ? (
                          <img loading="lazy" decoding="async" src={user.photoURL || null} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white/20">
                            <User size={16} />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{user.displayName}</p>
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Connect Node</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Theme Specific Configs */}
          <AnimatePresence>
            {selectedTheme !== 'STANDARD' && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }} 
                className="mb-8 p-8 bg-white/5 rounded-[2.5rem] border border-white/10"
              >
                <h4 className="text-[10px] font-black uppercase tracking-widest text-small-orange mb-6">Select Visual Background (Max 4)</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {availableBackgrounds
                    .filter(bg => bg.theme === selectedTheme)
                    .slice(0, 4)
                    .map(bg => (
                      <button 
                        key={bg.id}
                        onClick={() => setSelectedBackgroundId(bg.id)}
                        className={`aspect-video rounded-2xl overflow-hidden border-2 transition-all relative group ${selectedBackgroundId === bg.id ? 'border-small-orange shadow-lg scale-105' : 'border-white/5 hover:border-white/20'}`}
                      >
                        <img loading="lazy" decoding="async" src={bg.imageUrl || null} className="w-full h-full object-cover" alt="" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <p className="text-[8px] font-black uppercase tracking-widest text-white">{bg.name}</p>
                        </div>
                        {selectedBackgroundId === bg.id && (
                          <div className="absolute top-2 right-2 bg-small-orange text-white rounded-full p-1">
                            <Check size={10} />
                          </div>
                        )}
                      </button>
                    ))}
                  {availableBackgrounds.filter(bg => bg.theme === selectedTheme).length === 0 && (
                    <div className="col-span-full py-8 text-center border-2 border-dashed border-white/5 rounded-2xl">
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/20">No backgrounds available for this theme</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {selectedTheme === 'SCRAPBOOK' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8 p-8 bg-white/5 rounded-[2.5rem] border border-white/10">
                <div className="flex justify-between items-center mb-6">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-small-orange">Scrapbook Pages ({pages.length}/10)</h4>
                  <div className="flex gap-2">
                    <FileUploader 
                      type="PHOTO" 
                      multiple
                      onBulkUploadComplete={(urls) => {
                        const newPages = urls.map(url => ({ id: Math.random().toString(36).substr(2, 9), type: 'IMAGE' as const, url, content: '' }));
                        setPages([...pages, ...newPages].slice(0, 10));
                      }}
                      label="Bulk Upload"
                      className="mr-2"
                    />
                    <button 
                      onClick={() => setPages([...pages, { id: Date.now().toString(), type: 'IMAGE', content: '' }])}
                      disabled={pages.length >= 10}
                      className="flex items-center gap-2 px-6 py-3 bg-white/5 rounded-full text-[9px] font-black uppercase tracking-widest hover:bg-white/10 disabled:opacity-20 transition-all"
                    >
                      <Plus size={14} /> Add Page
                    </button>
                  </div>
                </div>
                <div className="space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar pr-4">
                  {pages.map((p, i) => (
                    <div key={p.id} className="flex gap-4 items-start p-6 bg-black/40 rounded-3xl border border-white/5">
                      <div className="flex-1 space-y-4">
                        <div className="flex gap-4">
                          <select 
                            value={p.type}
                            onChange={(e) => {
                              const newPages = [...pages];
                              newPages[i].type = e.target.value as any;
                              setPages(newPages);
                            }}
                            className="bg-black border border-white/10 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest outline-none focus:ring-2 ring-small-orange transition-all"
                          >
                            <option value="IMAGE">Image</option>
                            <option value="VIDEO">Video</option>
                          </select>
                          <input 
                            type="text" 
                            placeholder={`${p.type === 'IMAGE' ? 'Image' : 'Video'} URL`} 
                            value={p.url || ''} 
                            onChange={(e) => {
                              const newPages = [...pages];
                              newPages[i].url = e.target.value;
                              setPages(newPages);
                            }}
                            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold"
                          />
                          <FileUploader 
                            type={p.type === 'IMAGE' ? 'PHOTO' : 'VIDEO'} 
                            onUploadComplete={(url) => {
                              const newPages = [...pages];
                              newPages[i].url = url;
                              setPages(newPages);
                            }}
                            label="Upload"
                          />
                        </div>
                        <textarea 
                          placeholder="Page description..." 
                          value={p.content || ''} 
                          onChange={(e) => {
                            const newPages = [...pages];
                            newPages[i].content = e.target.value;
                            setPages(newPages);
                          }}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-medium resize-none h-20"
                        />
                      </div>
                      <button onClick={() => setPages(pages.filter((_, idx) => idx !== i))} className="p-3 bg-red-500/10 text-red-500 rounded-full hover:bg-red-500/20 transition-all">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {selectedTheme === 'PHOTO_ALBUM' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8 p-8 bg-white/5 rounded-[2.5rem] border border-white/10">
                <div className="flex justify-between items-center mb-6">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-small-orange">Photo Album Pages ({pages.length}/10)</h4>
                  <button 
                    onClick={() => setPages([...pages, { id: Date.now().toString(), type: 'IMAGE', content: '', media: [] }])}
                    disabled={pages.length >= 10}
                    className="flex items-center gap-2 px-6 py-3 bg-white/5 rounded-full text-[9px] font-black uppercase tracking-widest hover:bg-white/10 disabled:opacity-20 transition-all"
                  >
                    <Plus size={14} /> Add Page
                  </button>
                </div>
                <div className="space-y-6 max-h-[400px] overflow-y-auto custom-scrollbar pr-4">
                  {pages.map((p, i) => (
                    <div key={p.id} className="p-6 bg-black/40 rounded-3xl border border-white/5 space-y-4">
                      <div className="flex justify-between items-center">
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Page {i + 1}</p>
                        <button onClick={() => setPages(pages.filter((_, idx) => idx !== i))} className="text-red-500 hover:text-red-400">
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        {[0, 1, 2, 3].map(mIdx => (
                          <div key={`media-${p.id}-${mIdx}`} className="space-y-2">
                            <div className="flex gap-2">
                              <input 
                                type="text" 
                                placeholder="Media URL" 
                                value={p.media?.[mIdx]?.url || ''} 
                                onChange={(e) => {
                                  const newPages = [...pages];
                                  const media = [...(newPages[i].media || [])];
                                  media[mIdx] = { url: e.target.value, type: 'IMAGE' };
                                  newPages[i].media = media;
                                  setPages(newPages);
                                }}
                                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[10px] font-bold"
                              />
                              <FileUploader 
                                type="PHOTO" 
                                onUploadComplete={(url) => {
                                  const newPages = [...pages];
                                  const media = [...(newPages[i].media || [])];
                                  media[mIdx] = { url, type: 'IMAGE' };
                                  newPages[i].media = media;
                                  setPages(newPages);
                                }}
                                label="+"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                      <textarea 
                        placeholder="Album page description..." 
                        value={p.content || ''} 
                        onChange={(e) => {
                          const newPages = [...pages];
                          newPages[i].content = e.target.value;
                          setPages(newPages);
                        }}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-medium resize-none h-20"
                      />
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {selectedTheme === 'MUSIC_PLAYER' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8 p-8 bg-white/5 rounded-[2.5rem] border border-white/10">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-small-orange mb-6">Select Track from Archive</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[300px] overflow-y-auto custom-scrollbar pr-4">
                  {userSongs.map((s, i) => (
                    <button 
                      key={i}
                      onClick={() => setSelectedSong(s)}
                      className={`flex items-center gap-4 p-4 rounded-2xl border transition-all text-left ${selectedSong?.url === s.url ? 'bg-small-orange/20 border-small-orange shadow-lg' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                    >
                      <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/10 shrink-0">
                        <img loading="lazy" decoding="async" src={s.albumCover || null} className="w-full h-full object-cover" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-black uppercase tracking-tight truncate">{s.title}</p>
                        <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Archive Track</p>
                      </div>
                      {selectedSong?.url === s.url && <Check size={16} className="ml-auto text-small-orange" />}
                    </button>
                  ))}
                </div>

                <div className="mt-8 pt-8 border-t border-white/5">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-small-orange mb-4">Or Upload New Track</h4>
                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <input 
                        type="text" 
                        placeholder="Song Title" 
                        value={selectedSong?.title || ''} 
                        onChange={(e) => setSelectedSong({ ...selectedSong!, title: e.target.value, url: selectedSong?.url || '' })}
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold"
                      />
                      <FileUploader 
                        type="MUSIC" 
                        onUploadComplete={(url) => setSelectedSong({ ...selectedSong!, url, title: selectedSong?.title || 'New Track' })}
                        label="Upload Audio"
                      />
                    </div>
                    <div className="flex gap-4">
                      <input 
                        type="text" 
                        placeholder="Album Cover URL" 
                        value={selectedSong?.albumCover || ''} 
                        onChange={(e) => setSelectedSong({ ...selectedSong!, albumCover: e.target.value, title: selectedSong?.title || '', url: selectedSong?.url || '' })}
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold"
                      />
                      <FileUploader 
                        type="PHOTO" 
                        onUploadComplete={(url) => setSelectedSong({ ...selectedSong!, albumCover: url, title: selectedSong?.title || '', url: selectedSong?.url || '' })}
                        label="Upload Cover"
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {selectedTheme === 'NEWSPAPER' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8 p-8 bg-white/5 rounded-[2.5rem] border border-white/10 space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-small-orange mb-2">Newspaper Preview Config</h4>
                <div className="flex gap-4">
                  <input 
                    type="text" 
                    placeholder="Article Preview Image URL" 
                    value={selectedSong?.albumCover || ''} 
                    onChange={(e) => setSelectedSong({ ...selectedSong!, albumCover: e.target.value })}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold"
                  />
                  <FileUploader 
                    type="PHOTO" 
                    onUploadComplete={(url) => setSelectedSong({ ...selectedSong!, albumCover: url, title: selectedSong?.title || '', url: selectedSong?.url || '' })}
                    label="Upload"
                  />
                </div>
                <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest">This image will be featured as the main visual for your newspaper post.</p>
              </motion.div>
            )}

            {selectedTheme === 'ARCADE' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8 p-8 bg-white/5 rounded-[2.5rem] border border-white/10">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-small-orange mb-6">Select Game to Share</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[300px] overflow-y-auto custom-scrollbar pr-4">
                  {userGames.map((g) => (
                    <button 
                      key={g.id}
                      onClick={() => setSelectedGameId(g.id)}
                      className={`flex items-center gap-4 p-4 rounded-2xl border transition-all text-left ${selectedGameId === g.id ? 'bg-small-orange/20 border-small-orange shadow-lg' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                    >
                      <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/10 shrink-0">
                        <img loading="lazy" decoding="async" src={g.thumbnailUrl || null} className="w-full h-full object-cover" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-black uppercase tracking-tight truncate">{g.title}</p>
                        <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Arcade Game</p>
                      </div>
                      {selectedGameId === g.id && <Check size={16} className="ml-auto text-small-orange" />}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {(selectedTheme === 'WATCH_ALONG' || selectedTheme === 'LIVE_FEED') && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8 p-8 bg-white/5 rounded-[2.5rem] border border-white/10 space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-small-orange mb-2">Deep Link Configuration</h4>
                <input 
                  type="text" 
                  placeholder="Event Title" 
                  value={deepLink?.title || ''} 
                  onChange={(e) => setDeepLink({ type: selectedTheme as any, url: deepLink?.url || '', title: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold"
                />
                <input 
                  type="text" 
                  placeholder="Destination URL (e.g. /tv, /live/123)" 
                  value={deepLink?.url || ''} 
                  onChange={(e) => setDeepLink({ type: selectedTheme as any, url: e.target.value, title: deepLink?.title || '' })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold"
                />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center justify-between pt-12 border-t border-white/5">
            <div className="flex flex-wrap items-center gap-4">
              <button 
                onClick={() => setShowThemeSelector(!showThemeSelector)}
                className={`flex items-center gap-3 px-8 py-4 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${selectedTheme !== 'STANDARD' ? 'bg-small-orange text-white shadow-[0_0_30px_rgba(255,140,0,0.4)]' : 'bg-white/5 text-white shadow-2xl border border-white/10 hover:bg-white/10'}`}
              >
                <Layers size={18} /> {selectedTheme === 'STANDARD' ? 'Themes' : selectedTheme.replace('_', ' ')}
              </button>

              <div className="flex items-center gap-2 p-1.5 bg-black/40 backdrop-blur-3xl rounded-full border border-white/10">
                 <button onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowGifPicker(false); }} className={`p-3 rounded-full transition-all ${showEmojiPicker ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}>
                   <Smile size={18} />
                 </button>
                 <button onClick={() => { setShowGifPicker(!showGifPicker); setShowEmojiPicker(false); }} className={`p-3 rounded-full transition-all ${showGifPicker ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}>
                   <ImageIcon size={18} />
                 </button>
                 <div className="w-px h-6 bg-white/5 mx-2" />
                 <button 
                  onClick={() => setAspectRatio('HORIZONTAL')}
                  className={`px-4 py-2 rounded-full text-[8px] font-black uppercase tracking-widest transition-all ${aspectRatio === 'HORIZONTAL' ? 'bg-white text-black' : 'text-white/40'}`}
                >
                  16:9
                </button>
                <button 
                  onClick={() => setAspectRatio('VERTICAL')}
                  className={`px-4 py-2 rounded-full text-[8px] font-black uppercase tracking-widest transition-all ${aspectRatio === 'VERTICAL' ? 'bg-white text-black' : 'text-white/40'}`}
                >
                  9:16
                </button>
              </div>
              
              <AnimatePresence>
                {showThemeSelector && (
                  <motion.div 
                    initial={{ opacity: 0, x: -20, scale: 0.9 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -20, scale: 0.9 }}
                    className="flex gap-2 p-3 bg-black/60 backdrop-blur-3xl rounded-[2rem] border border-white/20 shadow-3xl"
                  >
                    {[
                      { id: 'SCRAPBOOK', icon: Book, label: 'Scrapbook' },
                      { id: 'PHOTO_ALBUM', icon: ImageIcon, label: 'Album' },
                      { id: 'MUSIC_PLAYER', icon: Disc, label: 'Music' },
                      { id: 'NEWSPAPER', icon: Newspaper, label: 'Journal' },
                      { id: 'ARCADE', icon: Gamepad2, label: 'Arcade' },
                      { id: 'WATCH_ALONG', icon: Tv, label: 'Cinema' },
                      { id: 'LIVE_FEED', icon: Radio, label: 'Broadcast' }
                    ].map(t => (
                      <button 
                        key={`theme-opt-${t.id}`}
                        onClick={() => { setSelectedTheme(t.id as any); setShowThemeSelector(false); }}
                        className={`p-4 rounded-2xl transition-all group relative ${selectedTheme === t.id ? 'bg-small-orange text-white shadow-xl' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
                      >
                        <t.icon size={20} />
                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 px-3 py-1.5 bg-black border border-white/10 text-[8px] font-black uppercase tracking-widest rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-2xl">
                          {t.label}
                        </span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {showEmojiPicker && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="flex gap-2 p-3 bg-black/80 backdrop-blur-3xl rounded-2xl border border-white/10"
                  >
                    {['🔥', '❤️', '🙌', '✨', '💎', '🚀', '🎸', '🎨', '🎧', '💯'].map(emoji => (
                      <button 
                        key={emoji} 
                        onClick={() => { setNewPost(prev => prev + emoji); setShowEmojiPicker(false); }}
                        className="text-2xl hover:scale-125 transition-transform p-1"
                      >
                        {emoji}
                      </button>
                    ))}
                  </motion.div>
                )}
                {showGifPicker && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="grid grid-cols-4 gap-2 p-3 bg-black/80 backdrop-blur-3xl rounded-2xl border border-white/10 w-80"
                  >
                    {[
                      'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNHJqZ3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6JmVwPXYxX2ludGVybmFsX2dpZl9ieV9pZCZjdD1n/l41lI4bYvYvYvYvYv/giphy.gif',
                      'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNHJqZ3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6JmVwPXYxX2ludGVybmFsX2dpZl9ieV9pZCZjdD1n/3o7TKD5lJvYvYvYvYv/giphy.gif',
                      'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNHJqZ3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6JmVwPXYxX2ludGVybmFsX2dpZl9ieV9pZCZjdD1n/l0HlHFRbmaZtBRhXG/giphy.gif',
                      'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNHJqZ3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6JmVwPXYxX2ludGVybmFsX2dpZl9ieV9pZCZjdD1n/3o7TKVUn7iM8FMEU24/giphy.gif'
                    ].map((gif, i) => (
                      <button 
                        key={i} 
                        onClick={() => { setNewPost(prev => prev + '\n' + gif); setShowGifPicker(false); }}
                        className="aspect-video rounded-lg overflow-hidden border border-white/10 hover:scale-105 transition-all"
                      >
                        <img loading="lazy" decoding="async" src={gif || null} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button 
              onClick={handlePost}
              disabled={isPosting || (!newPost.trim() && !pages.length && !selectedSong && !deepLink)}
              className="px-12 py-5 bg-white text-black rounded-[2rem] font-black uppercase tracking-[0.3em] text-[11px] hover:bg-small-orange hover:text-white transition-all shadow-[0_20px_40px_rgba(0,0,0,0.4)] disabled:opacity-20 active:scale-95 italic"
            >
              {isPosting ? 'Posting...' : 'Post'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'SOCIAL' ? (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Sub-tab selector — only show when fediverse accounts are connected */}
          {fediverseAccounts.length > 0 && (
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
                  {t === 'FEDIVERSE' ? 'Timeline' : 'My Posts'}
                </button>
              ))}
              <button
                onClick={() => refreshFediverse()}
                className="ml-auto p-2 rounded-full text-white/30 hover:text-white hover:bg-white/5 transition-all"
                title="Refresh timeline"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
              </button>
            </div>
          )}

          {/* Fediverse timeline */}
          {fediverseAccounts.length > 0 && socialSubTab === 'FEDIVERSE' ? (
            <div className="flex-1 overflow-y-auto">
              {fediverseLoading ? (
                <div className="flex items-center justify-center py-20 text-white/30 text-sm font-bold uppercase tracking-widest">
                  Loading timeline…
                </div>
              ) : fediverseFeed.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4 text-white/30">
                  <Share2 size={32} />
                  <p className="text-sm font-bold uppercase tracking-widest">No posts yet — your timeline will appear here</p>
                </div>
              ) : (
                <div className="max-w-2xl mx-auto divide-y divide-white/5">
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
            /* My Posts — original ProfileFeed, or connect-accounts prompt */
            fediverseAccounts.length === 0 ? (
              <div className="flex-1 overflow-y-auto">
                <div className="flex flex-col items-center gap-6 py-16 px-8 max-w-md mx-auto text-center">
                  <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                    <Share2 size={24} className="text-white/40" />
                  </div>
                  <div>
                    <p className="text-white font-black uppercase tracking-widest text-sm mb-2">Connect your social networks</p>
                    <p className="text-white/40 text-xs leading-relaxed">Link Mastodon, Bluesky, or Threads in Account Settings → Social Networks to see your unified timeline here.</p>
                  </div>
                </div>
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
            )
          )}
        </div>
      ) : activeTab === 'GLOBAL' ? (
        /* ── Plajah Social Canvas ───────────────────────────── */
        <div className="w-full max-w-2xl mx-auto flex flex-col flex-1 overflow-hidden">

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

          {/* ── Rich Composer ── */}
          {currentUser && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/[0.04] border border-white/8 rounded-[2rem] shadow-xl overflow-hidden"
            >
              <div className="flex items-start gap-4 p-5">
                <button onClick={() => onVisitUser?.(currentUser.uid)} className="w-10 h-10 rounded-xl overflow-hidden bg-white/10 shrink-0 ring-1 ring-white/10 hover:ring-small-orange transition-all">
                  {currentUser.photoURL
                    ? <img loading="lazy" decoding="async" src={currentUser.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    : <User size={18} className="text-white/30 m-auto mt-2.5" />}
                </button>
                <div className="flex-1 min-w-0">
                  <textarea
                    value={simplePostText}
                    onClick={() => setComposerExpanded(true)}
                    onChange={e => { setSimplePostText(e.target.value); setComposerExpanded(true); }}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSimplePost(); }}
                    placeholder="What's on your mind?"
                    rows={composerExpanded ? 4 : 2}
                    className="w-full bg-transparent text-sm font-medium text-white placeholder:text-white/20 resize-none outline-none leading-relaxed transition-all"
                  />
                </div>
              </div>

              {/* Theme selector */}
              <AnimatePresence>
                {composerExpanded && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="px-5 pb-3 border-t border-white/5">
                    <p className="text-[8px] font-black uppercase tracking-widest text-white/20 mt-3 mb-2">Theme</p>
                    <div className="flex flex-wrap gap-1.5">
                      {([
                        { id: 'STANDARD', label: 'Standard' },
                        { id: 'SCRAPBOOK', label: 'Scrapbook' },
                        { id: 'PHOTO_ALBUM', label: 'Photo Album' },
                        { id: 'MUSIC_PLAYER', label: 'Music' },
                        { id: 'NEWSPAPER', label: 'Newspaper' },
                        { id: 'ARCADE', label: 'Arcade' },
                      ] as { id: FeedItem['theme']; label: string }[]).map(t => (
                        <button
                          key={t.id}
                          onClick={() => { setGlobalComposerTheme(t.id); if (t.id !== 'STANDARD' && availableBackgrounds.length === 0) fetchThemeBackgrounds().then(setAvailableBackgrounds); }}
                          className={`px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest transition-all
                            ${globalComposerTheme === t.id ? 'bg-small-orange/20 text-small-orange border border-small-orange/40' : 'bg-white/5 text-white/30 border border-white/5 hover:text-white hover:bg-white/10'}`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>

                    {/* Background picker for non-standard themes */}
                    {globalComposerTheme !== 'STANDARD' && availableBackgrounds.filter(bg => bg.theme === globalComposerTheme).length > 0 && (
                      <div className="mt-3">
                        <p className="text-[8px] font-black uppercase tracking-widest text-white/20 mb-2">Background</p>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                          {availableBackgrounds.filter(bg => bg.theme === globalComposerTheme).slice(0, 6).map(bg => (
                            <button
                              key={bg.id}
                              onClick={() => setSelectedBackgroundId(selectedBackgroundId === bg.id ? '' : bg.id)}
                              className={`shrink-0 w-16 h-10 rounded-xl overflow-hidden border-2 transition-all ${selectedBackgroundId === bg.id ? 'border-small-orange' : 'border-white/10 hover:border-white/30'}`}
                            >
                              <img loading="lazy" decoding="async" src={bg.imageUrl || undefined} alt={bg.name} className="w-full h-full object-cover" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Scrapbook pages */}
                    {globalComposerTheme === 'SCRAPBOOK' && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[8px] font-black uppercase tracking-widest text-white/20">Pages ({pages.length}/10)</p>
                          <button onClick={() => setPages(prev => [...prev, { id: Date.now().toString(), type: 'IMAGE', content: '' }])} disabled={pages.length >= 10}
                            className="text-[8px] font-black uppercase tracking-widest text-small-orange hover:text-white disabled:opacity-30 flex items-center gap-1">
                            <Plus size={10} /> Add
                          </button>
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                          {pages.map((p, i) => (
                            <div key={p.id} className="shrink-0 w-16 h-16 rounded-xl border border-white/10 bg-white/5 relative overflow-hidden group">
                              {p.url ? <img loading="lazy" decoding="async" src={p.url} alt="" className="w-full h-full object-cover" /> : (
                                <label className="w-full h-full flex items-center justify-center cursor-pointer text-white/20 hover:text-white transition-colors">
                                  <Plus size={14} />
                                  <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file || !currentUser) return;
                                    const { uploadFile } = await import('../services/backendService');
                                    const url = await uploadFile(`posts/${currentUser.uid}/${Date.now()}.${file.name.split('.').pop()}`, file);
                                    setPages(prev => prev.map((pg, j) => j === i ? { ...pg, url } : pg));
                                  }} />
                                </label>
                              )}
                              <button onClick={() => setPages(prev => prev.filter((_, j) => j !== i))}
                                className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/70 rounded-full opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                                <X size={8} className="text-white" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Music player song picker */}
                    {globalComposerTheme === 'MUSIC_PLAYER' && (
                      <div className="mt-3">
                        <p className="text-[8px] font-black uppercase tracking-widest text-white/20 mb-2">Track</p>
                        {userSongs.length === 0
                          ? <p className="text-[9px] text-white/20">No tracks in archive</p>
                          : <div className="flex gap-2 overflow-x-auto pb-1">
                              {userSongs.slice(0, 6).map((s, i) => (
                                <button key={i} onClick={() => setSelectedSong(selectedSong?.url === s.url ? null : s)}
                                  className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border text-left transition-all
                                    ${selectedSong?.url === s.url ? 'bg-small-orange/20 border-small-orange' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
                                  <div className="w-8 h-8 rounded-lg overflow-hidden bg-white/10 shrink-0">
                                    {s.albumCover && <img loading="lazy" decoding="async" src={s.albumCover} className="w-full h-full object-cover" alt="" />}
                                  </div>
                                  <span className="text-[8px] font-black uppercase truncate max-w-[60px]">{s.title}</span>
                                  {selectedSong?.url === s.url && <Check size={10} className="text-small-orange shrink-0" />}
                                </button>
                              ))}
                            </div>
                        }
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Album embed preview */}
              <AnimatePresence>
                {composerAlbumEmbed && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="px-5 pb-3">
                    <div className="relative rounded-2xl overflow-hidden border border-small-orange/30">
                      <MiniMusicPlayer album={composerAlbumEmbed} />
                      <button onClick={() => setComposerAlbumEmbed(null)}
                        className="absolute top-2 right-2 w-6 h-6 bg-black/70 border border-white/20 rounded-full flex items-center justify-center hover:bg-red-500 transition-all z-10">
                        <X size={10} className="text-white" />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Media previews */}
              <AnimatePresence>
                {composerMedia.length > 0 && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="px-5 pb-3 flex flex-wrap gap-2">
                    {composerMedia.map((m, i) => (
                      <div key={i} className="relative group">
                        {m.type === 'PHOTO' || m.type === 'GIF' ? (
                          <img loading="lazy" decoding="async" src={m.url} alt="" className="h-24 w-24 object-cover rounded-2xl border border-white/10" />
                        ) : m.type === 'VIDEO' ? (
                          <video src={m.url} className="h-24 w-24 object-cover rounded-2xl border border-white/10" />
                        ) : (
                          <div className="h-24 w-24 bg-white/5 rounded-2xl border border-white/10 flex flex-col items-center justify-center gap-1">
                            <Volume2 size={20} className="text-small-orange" />
                            <span className="text-[8px] font-black uppercase text-white/30 truncate w-16 text-center">{m.title || 'Audio'}</span>
                          </div>
                        )}
                        <button onClick={() => setComposerMedia(prev => prev.filter((_, idx) => idx !== i))}
                          className="absolute -top-2 -right-2 w-5 h-5 bg-black border border-white/20 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500">
                          <X size={10} className="text-white" />
                        </button>
                        {m.type === 'GIF' && <span className="absolute bottom-1 left-1 text-[7px] font-black bg-black/70 px-1 rounded text-white">GIF</span>}
                      </div>
                    ))}
                    {uploading && (
                      <div className="h-24 w-24 bg-white/5 rounded-2xl border border-white/10 flex flex-col items-center justify-center gap-2">
                        <Zap size={18} className="text-small-orange animate-pulse" />
                        <span className="text-[8px] font-black uppercase text-white/30 text-center px-1">{uploadLabel}</span>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* GIF picker */}
              <AnimatePresence>
                {showGifPicker && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="border-t border-white/5 px-5 py-4">
                    <div className="relative mb-3">
                      <input value={gifSearch} onChange={e => { setGifSearch(e.target.value); searchGifs(e.target.value); }}
                        placeholder="Search GIFs…"
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/30" />
                      {gifLoading && <Zap size={14} className="absolute right-4 top-3 text-small-orange animate-pulse" />}
                    </div>
                    {gifResults.length === 0 && !gifLoading && (
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/20 text-center py-4">Type to search GIPHY</p>
                    )}
                    <div className="grid grid-cols-4 gap-1.5 max-h-48 overflow-y-auto">
                      {gifResults.map((gif: any) => (
                        <button key={gif.id} onClick={() => {
                          const url = gif.images?.fixed_height_small?.url || gif.images?.original?.url;
                          if (url) { setComposerMedia(prev => [...prev, { type: 'GIF', url, title: gif.title }]); }
                          setShowGifPicker(false); setGifSearch(''); setGifResults([]);
                        }} className="rounded-xl overflow-hidden hover:scale-105 transition-transform">
                          <img src={gif.images?.fixed_height_small?.url} alt={gif.title} className="w-full h-16 object-cover" loading="lazy" />
                        </button>
                      ))}
                    </div>
                    <p className="text-[8px] text-white/15 text-right mt-2 font-bold">Powered by GIPHY</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Platform media picker — embeds a playable MiniMusicPlayer */}
              <AnimatePresence>
                {showPlatformPicker && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="border-t border-white/5 px-5 py-4">
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-1">Share Album Player</p>
                    <p className="text-[8px] text-white/20 mb-3">Select an album to embed a playable music player in your post</p>
                    {userAlbums.length === 0
                      ? <p className="text-[9px] text-white/20 text-center py-4">No albums found</p>
                      : <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                          {userAlbums.map(a => (
                            <button key={a.id} onClick={() => {
                              setComposerAlbumEmbed(a);
                              setShowPlatformPicker(false);
                            }} className={`relative rounded-2xl overflow-hidden border transition-all group
                              ${composerAlbumEmbed?.id === a.id ? 'border-small-orange' : 'border-white/10 hover:border-small-orange/50'}`}>
                              <img loading="lazy" decoding="async" src={a.coverImage || ''} alt={a.title} className="w-full h-20 object-cover opacity-70 group-hover:opacity-100 transition-all" />
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                                <p className="text-[8px] font-black uppercase text-white truncate">{a.title}</p>
                                <p className="text-[7px] text-white/40 font-bold uppercase">{a.tracks?.length || 0} tracks</p>
                              </div>
                              {composerAlbumEmbed?.id === a.id && (
                                <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-small-orange rounded-full flex items-center justify-center">
                                  <Check size={10} className="text-white" />
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                    }
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Toolbar */}
              <div className="px-5 pb-4 flex items-center gap-2 pt-3 border-t border-white/5">
                {/* Photo */}
                <label className="cursor-pointer p-2 rounded-xl text-white/30 hover:text-white hover:bg-white/5 transition-all" title="Photo">
                  <ImageIcon size={16} />
                  <input type="file" accept="image/*" className="hidden" onChange={e => handleFileAttach(e, 'PHOTO')} />
                </label>
                {/* Video */}
                <label className="cursor-pointer p-2 rounded-xl text-white/30 hover:text-white hover:bg-white/5 transition-all" title="Video">
                  <Play size={16} />
                  <input type="file" accept="video/*" className="hidden" onChange={e => handleFileAttach(e, 'VIDEO')} />
                </label>
                {/* Audio */}
                <label className="cursor-pointer p-2 rounded-xl text-white/30 hover:text-white hover:bg-white/5 transition-all" title="Audio">
                  <Volume2 size={16} />
                  <input type="file" accept="audio/*" className="hidden" onChange={e => handleFileAttach(e, 'AUDIO')} />
                </label>
                {/* GIF */}
                <button onClick={() => { setShowGifPicker(v => !v); setShowPlatformPicker(false); }}
                  className={`px-2.5 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all
                    ${showGifPicker ? 'bg-small-orange/20 text-small-orange' : 'text-white/30 hover:text-white hover:bg-white/5'}`}>
                  GIF
                </button>
                {/* Platform media */}
                <button onClick={() => { setShowPlatformPicker(v => !v); setShowGifPicker(false); if (!showPlatformPicker) loadUserAlbums(); }}
                  className={`p-2 rounded-xl transition-all ${showPlatformPicker ? 'bg-small-orange/20 text-small-orange' : 'text-white/30 hover:text-white hover:bg-white/5'}`}
                  title="From Platform">
                  <Music2 size={16} />
                </button>
                {/* Story */}
                {currentUser && (
                  <button onClick={() => setShowStoryCreator(true)}
                    className="p-2 rounded-xl text-white/30 hover:text-small-orange hover:bg-white/5 transition-all"
                    title="Share to Story">
                    <Plus size={16} />
                  </button>
                )}

                <div className="ml-auto flex items-center gap-2">
                  {(simplePostText.length > 0 || composerMedia.length > 0) && (
                    <span className={`text-[9px] font-black tabular-nums ${simplePostText.length > 260 ? 'text-red-400' : 'text-white/20'}`}>
                      {280 - simplePostText.length}
                    </span>
                  )}
                  <button
                    onClick={handleSimplePost}
                    disabled={isSimplePosting || (!simplePostText.trim() && composerMedia.length === 0 && !composerAlbumEmbed) || simplePostText.length > 280}
                    className="px-5 py-2 bg-white text-black rounded-full text-[9px] font-black uppercase tracking-widest hover:bg-small-orange hover:text-white transition-all disabled:opacity-30 flex items-center gap-2"
                  >
                    <Send size={11} />
                    {isSimplePosting ? 'Posting…' : 'Post'}
                  </button>
                </div>
              </div>
            </motion.div>
          )}

            </div>{/* end frosted glass panel */}
          </div>{/* end pinned composer */}

          {/* ── Posts: independently scrollable ── */}
          <div ref={feedScrollRef} className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="pb-8">

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

          {/* Post feed - bordered list */}
          <div className="border border-white/[0.06] rounded-2xl overflow-hidden">
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
          </div>{/* end bordered list */}

          </div>{/* end pb-8 */}
          </div>{/* end posts scroll area */}

        </div>
      ) : (
        <div className="space-y-12">
          {isLoadingNews ? (
            <div className="py-20 text-center">
              <Zap className="mx-auto mb-6 text-small-orange" size={48} />
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Scanning Global Satellites for Breaking News...</p>
            </div>
          ) : (
            feedItems.filter(item => !item.parentId).map((item) => (
              <RolodexCard key={item.id}>
                <FeedItemComponent
                  item={item}
                  allFeedItems={feedItems}
                  currentUser={currentUser}
                  onVisitUser={onVisitUser}
                  onMessage={onMessage}
                  onReply={handleReply}
                  isPosting={isPosting}
                  onSelectGame={onSelectGame}
                  availableBackgrounds={availableBackgrounds}
                />
              </RolodexCard>
            ))
          )}
          {feedItems.length === 0 && !isLoadingNews && (
            <div className="py-20 text-center opacity-20 uppercase font-black tracking-[0.4em] text-xs">The feed is currently quiet</div>
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
                                             {team.score}
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
   </>
  );
};

export default FeedView;
