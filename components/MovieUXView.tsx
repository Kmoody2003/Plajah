import React, { useState, useEffect, useRef } from 'react';
import { Video, Album, UserProfile, ChatRoom, ChatMessage, IPWorld, Character } from '../types';
import { 
  Play, Plus, Share2, ArrowLeft, Star, Clock, 
  ChevronRight, Info, Volume2, VolumeX, 
  Calendar, Film, List, Sparkles, Globe,
  Heart, MessageCircle, MoreHorizontal,
  ChevronDown, ChevronUp, Send, X, Users,
  Maximize2, Minimize2, Settings, Pause, Bookmark,
  Subtitles, SkipBack, SkipForward
} from 'lucide-react';
import CharacterCard from './CharacterCard';
import CommentSection from './CommentSection';
import { motion, AnimatePresence } from 'motion/react';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';
import { getDoc, doc } from 'firebase/firestore';
import MuxPlayer from '@mux/mux-player-react';
import { 
  auth, db,
  listenToChatRooms, 
  createChatRoom, 
  sendMessage, 
  listenToMessages,
  fetchUserProfiles,
  isFollowing,
  fetchChatRooms,
  fetchWorldCharacters
} from '../services/backendService';

import The411 from './The411';

interface MovieUXViewProps {
  item: Video | Album;
  onBack: () => void;
  onVisitUser: (uid: string) => void;
  currentUser: any;
}

const MovieUXView: React.FC<MovieUXViewProps> = ({ item, onBack, onVisitUser, currentUser }) => {
  const { 
    playVideo, 
    setVideoElement, 
    isPlaying, 
    pause, 
    resume, 
    volume, 
    setVolume,
    currentVideo,
    isNanoView,
    setIsNanoView,
    isUserActive,
    setTheme
  } = useGlobalPlayerState();
  const [isMuted, setIsMuted] = useState(true);
  const [activeSeason, setActiveSeason] = useState(1);
  const [scrolled, setScrolled] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isUIVisible, setIsUIVisible] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [world, setWorld] = useState<IPWorld | null>(null);
  const [worldCharacters, setWorldCharacters] = useState<Character[]>([]);
  const [comments, setComments] = useState<any[]>([]); // simplified

  const handlePostComment = async (text: string) => {
    // We would actually submit this via backendService
    const newComment = {
      id: Date.now().toString(),
      userId: currentUser?.uid || 'anon',
      userName: currentUser?.displayName || 'Anonymous',
      userPhoto: currentUser?.photoURL || '',
      rating: 5,
      comment: text,
      timestamp: Date.now()
    };
    setComments(prev => [newComment, ...prev]);
  };
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const worldId = (item as any).worldId;
    if (worldId) {
      getDoc(doc(db, 'worlds', worldId)).then(s => {
        if (s.exists()) {
          setWorld({ id: s.id, ...s.data() } as IPWorld);
        }
      });
      fetchWorldCharacters(worldId).then(setWorldCharacters);
    }
  }, [item]);

  useEffect(() => {
    setTheme('ETHEREAL');
    const handleScroll = () => {
      if (containerRef.current) {
        setScrolled(containerRef.current.scrollTop > 100);
      }
    };
    const container = containerRef.current;
    container?.addEventListener('scroll', handleScroll);
    return () => {
        container?.removeEventListener('scroll', handleScroll);
        setTheme('DARK');
    };
  }, []);

  const isTV = (item as any).type === 'VIDEO' && (item as any).subType === 'TV_SERIES';
  const isMovie = (item as any).category === 'MOVIE' || (item as any).subType === 'MOVIE';

  const title = item.title;
  const description = item.description;
  const coverImage = (item as Album).coverImage || (item as Video).coverImageUrl || (item as Video).thumbnailUrl;
  const trailerUrl = (item as Video).movieMetadata?.trailerUrl || (item as Video).url;
  const artist = (item as Album).artist || (item as Video).artist;
  const ownerId = (item as Album).ownerId || (item as Video).ownerId;
  const cast = (item as Video).movieMetadata?.cast || ['Elias Thorne', 'Lyra Vance', 'Dr. Aris Fenn', 'Command Elara', 'The Observer'];

  useEffect(() => {
    if (videoRef.current) {
      setVideoElement(videoRef.current);
    }
  }, [videoRef.current]);

  const handlePlay = () => {
    setIsUIVisible(false);
    const album = item as Album;
    if (isTV) {
      if (album.seasons && album.seasons.length > 0 && album.seasons[0].episodes.length > 0) {
        playVideo(album.seasons[0].episodes[0]);
      } else if (album.tracks && album.tracks.length > 0) {
        playVideo({
          id: album.id,
          ownerId: album.ownerId || 'system',
          title: album.title,
          url: album.tracks[0].url,
          artist: album.artist,
          timestamp: album.createdAt || Date.now()
        } as Video);
      } else if (album.customVideoUrl || (item as Video).url) {
        playVideo({
          id: item.id,
          ownerId: album.ownerId || 'system',
          title: album.title,
          url: album.customVideoUrl || (item as Video).url,
          artist: album.artist,
          timestamp: album.createdAt || Date.now()
        } as Video);
      }
    } else {
      if (album.type === 'VIDEO' && album.tracks && album.tracks.length > 0 && album.tracks[0]) {
        const videoFromMovie: Video = {
          id: album.id,
          ownerId: album.ownerId || 'system',
          title: album.title,
          url: album.tracks[0].url,
          artist: album.artist,
          timestamp: album.createdAt || Date.now(),
          description: album.description,
          thumbnailUrl: album.coverImage,
          genre: album.genre,
          movieMetadata: album.movieMetadata,
          subType: 'MOVIE'
        };
        playVideo(videoFromMovie);
      } else if (album.customVideoUrl || (item as Video).url) {
         playVideo({
          id: item.id,
          ownerId: album.ownerId || 'system',
          title: album.title,
          url: album.customVideoUrl || (item as Video).url,
          artist: album.artist,
          timestamp: album.createdAt || Date.now()
        } as Video);
      } else {
        alert("Video source not found or unavailable. This archive item might be restricted.");
        setIsUIVisible(true);
      }
    }
  };

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 bg-[#131314] text-[#E5E2E3] overflow-y-auto custom-scrollbar z-[100] theme-ethereal"
    >
      {/* Background Hero / Player Area */}
      <div className="fixed inset-0 z-0">
        {/* Frosted blurred cover art — always visible as backdrop */}
        <img
          src={coverImage || undefined}
          alt=""
          className="absolute inset-0 w-full h-full object-cover scale-110 blur-[60px] opacity-60 transition-all duration-1000 pointer-events-none"
        />
        {/* Bottom fade so content area bleeds naturally into background */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-[#131314]/50 to-[#131314]/90 z-10 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#131314]/60 via-transparent to-transparent z-10 pointer-events-none" />

        {currentVideo && isPlaying && (currentVideo.id === item.id || currentVideo.id === (item as any)?.tracks?.[0]?.id || (item as any)?.seasons?.[0]?.episodes?.some((e: any) => e.id === currentVideo.id)) ? (
          <div className="w-full h-full relative z-20">
            {currentVideo.muxPlaybackId ? (
              <MuxPlayer
                key={currentVideo.id}
                ref={setVideoElement as any}
                playbackId={currentVideo.muxPlaybackId}
                className="w-full h-full object-cover border-none bg-black"
                autoPlay="any"
                playsInline
              />
            ) : currentVideo.embedUrl ? (
              <iframe
                key={currentVideo.id}
                src={`${currentVideo.embedUrl}${currentVideo.embedUrl.includes('?') ? '&' : '?'}autoplay=1`}
                className="w-full h-full border-none"
                allow="autoplay; fullscreen"
                allowFullScreen
              />
            ) : (
              <video
                key={currentVideo.id}
                ref={setVideoElement}
                src={currentVideo.url}
                className="w-full h-full object-cover"
                autoPlay
                playsInline
              />
            )}
            {/* Overlay buttons for the on-page video */}
            <div className={`absolute bottom-40 left-8 lg:left-24 z-20 flex gap-4 pointer-events-auto transition-opacity duration-1000 ${isUserActive ? 'opacity-100' : 'opacity-0'}`}>
               <button
                onClick={() => {
                   const v = document.querySelector('video');
                   if (v) {
                     if (v.requestFullscreen) {
                       v.requestFullscreen().catch(e => console.log('Fullscreen failed', e));
                     } else if ((v as any).webkitEnterFullscreen) {
                       (v as any).webkitEnterFullscreen();
                     } else if ((v as any).webkitRequestFullscreen) {
                       (v as any).webkitRequestFullscreen();
                     }
                   }
                }}
                className="glass p-4 rounded-full text-white hover:text-primary transition-all border border-white/20 shadow-2xl"
                title="Toggle Fullscreen"
               >
                 <Maximize2 size={24} />
               </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Detail Content */}
      {/* Show UI Toggle when hidden */}
      {!isUIVisible && (
        <button 
          onClick={() => setIsUIVisible(true)}
          className="fixed top-32 left-8 lg:left-24 z-50 glass p-4 rounded-full text-white/40 hover:text-white transition-all border border-white/10"
          title="Show UI"
        >
          <ChevronUp size={24} />
        </button>
      )}

      <AnimatePresence>
        {isUIVisible && isUserActive && (
          <motion.main 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ duration: 0.8 }}
            className="relative z-20 pt-40 px-8 lg:px-24 mb-32 max-w-7xl mx-auto"
          >
            <div className="flex flex-col lg:flex-row gap-20 items-end lg:items-start">
              <div className="flex-1 space-y-10">
                <motion.div 
                   initial={{ opacity: 0, y: 30 }}
                   animate={{ opacity: 1, y: 0 }}
                   className="space-y-6"
                >
                  <div className="flex items-center gap-4">
                    <span className="bg-[#FFB68D]/20 text-[#FFB68D] rounded-lg text-xs font-black tracking-[0.2em] uppercase border border-[#FFB68D]/30 backdrop-blur-md px-3 py-1">Cinematic Premiere</span>
                    <span className="text-[#00DAF3] font-label text-[10px] tracking-[0.3em] uppercase font-black">Available in 8K Neural-Link</span>
                  </div>
                  <h2 className="text-7xl md:text-9xl font-display font-black tracking-tighter text-on-surface leading-[0.85] drop-shadow-2xl uppercase">
                    {title.split(' ').slice(0, 2).join(' ')} <br/>
                    <span className="text-primary italic">{title.split(' ').slice(2).join(' ')}</span>
                  </h2>
                  <div className="flex items-center gap-6 font-label text-[#CBC3D7] text-[10px] font-black tracking-[0.2em] flex-wrap">
                    <span className="flex items-center gap-2 text-[#00DAF3]"><Star fill="currentColor" size={14} /> 9.8</span>
                    <span>2H 44M</span>
                    <span>2024</span>
                    <span className="border border-white/20 px-3 py-1 rounded">PG-13</span>
                    <span className="text-[#D0BCFF]">DIRECTED BY • <span className="text-white">{artist || 'Unknown Director'}</span></span>
                  </div>
                </motion.div>

                <motion.p 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-xl md:text-2xl text-[#CBC3D7] leading-relaxed max-w-2xl font-light italic font-body drop-shadow-md mb-8"
                >
                  "{description || "In a future where dreams are the only currency left, one navigator must sail across the collective unconscious to retrieve a forgotten memory."}"
                </motion.p>
                
                <The411 itemId={item.id} itemType="VIDEO" title={title} author={artist} />

                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="flex flex-wrap gap-8 pt-6"
                >
                  <button 
                    onClick={handlePlay}
                    className="rounded-full h-16 px-12 aurora-bg text-on-primary font-black flex items-center gap-4 hover:scale-105 transition-transform duration-300 shadow-[0_15px_40px_rgba(208,188,255,0.4)] uppercase tracking-widest text-sm"
                  >
                    <Play fill="currentColor" size={24} /> WATCH NOW
                  </button>
                  <button className="rounded-full h-16 px-10 glass border border-white/20 text-[#D0BCFF] font-black flex items-center gap-4 hover:bg-white/5 transition-all duration-300 uppercase tracking-widest text-sm">
                    <Bookmark size={24} /> WATCHLIST
                  </button>
                  <button className="rounded-full w-16 h-16 glass flex items-center justify-center text-white hover:text-primary transition-all duration-300 border border-white/10 shadow-xl">
                    <Share2 size={24} />
                  </button>
                </motion.div>
              </div>

              {/* Character Cards & World Connection */}
              <div className="w-full lg:w-[400px] space-y-12 pt-10 lg:pt-0 shrink-0">
                {world && (
                  <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 }}
                    className="glass bg-surface-variant/20 rounded-[2rem] p-8 border border-primary/20 shadow-bloom relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                      <Globe size={100} />
                    </div>
                    <span className="font-bebas text-xs uppercase tracking-[0.3em] text-tertiary">Connected Universe</span>
                    <h3 className="font-display text-4xl uppercase tracking-widest text-primary mt-2">{world.name}</h3>
                    <p className="text-[10px] uppercase font-black text-on-surface/60 mt-4 leading-relaxed tracking-widest">{world.description}</p>
                    <button className="mt-6 flex items-center justify-between w-full p-4 rounded-xl bg-white/5 hover:bg-primary/20 hover:text-primary transition-all text-left text-xs font-black uppercase tracking-widest border border-white/5">
                      Explore This World <ChevronRight size={16} />
                    </button>
                  </motion.div>
                )}

                <div className="space-y-8">
                  <h3 className="font-display text-4xl italic text-primary uppercase tracking-widest px-2 border-l-2 border-primary">Character Dossiers</h3>
                  <div className="flex flex-col gap-6">
                    {worldCharacters.length > 0 ? (
                      worldCharacters.map((char) => (
                        <CharacterCard 
                          key={char.id}
                          name={char.name}
                          role="Character"
                          bio={char.bio}
                          imageUrl={char.imageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(char.name)}&background=random`}
                        />
                      ))
                    ) : (
                      cast.map((name, i) => (
                        <CharacterCard 
                          key={i}
                          name={name}
                          role="Cast"
                          bio="Unknown."
                          imageUrl={`https://picsum.photos/seed/cast${name}/150/150`}
                        />
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Similar Content */}
            <section className="mt-40 space-y-12">
              <div className="flex justify-between items-end">
                <div>
                  <h3 className="font-display text-6xl uppercase tracking-tighter">Similar Wonders</h3>
                  <p className="text-[10px] font-black text-tertiary uppercase tracking-[0.4em] mt-2">More from the stellar collective</p>
                </div>
                <button className="text-secondary font-black text-[10px] uppercase tracking-widest hover:underline mb-1">Explore Full Galaxy</button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8">
                {[1, 2, 3, 4, 5].map((i) => (
                  <motion.div 
                    key={i}
                    whileHover={{ y: -12, scale: 1.02 }}
                    className="group relative aspect-[2/3] rounded-2xl overflow-hidden glass transition-all duration-500 shadow-2xl border border-white/5 cursor-pointer"
                  >
                    <img src={`https://picsum.photos/seed/similar${i}/300/450`} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" />
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent opacity-90 transition-opacity group-hover:opacity-100"></div>
                    <div className="absolute bottom-0 left-0 right-0 p-6 transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                      <h5 className="font-black text-sm uppercase tracking-tight">Celestial Gate {i}</h5>
                      <p className="text-[9px] text-[#00DAF3] font-black uppercase tracking-widest mt-2">Drama • 2024</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </section>
            {/* Comments */}
            <section className="mt-40">
               <h3 className="font-display text-4xl italic text-primary uppercase tracking-widest px-2 border-l-2 border-primary mb-10">Fan Transmissions</h3>
               <div className="bg-black/20 backdrop-blur-md rounded-3xl p-8 border border-white/5">
                 <CommentSection 
                   comments={comments}
                   onPostComment={handlePostComment}
                   currentUser={currentUser}
                   onVisitUser={onVisitUser}
                 />
               </div>
            </section>
          </motion.main>
        )}
      </AnimatePresence>

      {!isUIVisible && isUserActive && (
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          onClick={() => setIsUIVisible(true)}
          className="fixed bottom-32 left-1/2 -translate-x-1/2 z-[100] glass px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-[0.3em] text-primary border border-primary/20 hover:bg-primary/10 transition-all flex items-center gap-3 shadow-bloom"
        >
          <Info size={14} /> Show Movie Details
        </motion.button>
      )}

      {/* Floating Cinema Header Controls */}
      <div className={`fixed top-0 left-0 right-0 z-[150] px-10 py-6 flex items-center justify-between transition-all duration-1000 ${isUserActive ? 'opacity-100' : 'opacity-0'} ${scrolled ? 'bg-black/60 backdrop-blur-2xl border-b border-white/5' : 'bg-transparent'}`}>
        <button 
          onClick={onBack}
          className="flex items-center gap-4 text-primary font-black uppercase tracking-[0.3em] text-[10px] group"
        >
          <div className="w-10 h-10 rounded-full glass flex items-center justify-center border border-white/10 group-hover:scale-110 transition-transform">
            <ArrowLeft size={18} />
          </div>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity">Back to Archives</span>
        </button>
        
        <h1 className={`font-display text-2xl tracking-[0.4em] text-white/20 transition-all duration-700 ${scrolled ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}>
          ETHEREAL <span className="italic">VOYAGE</span>
        </h1>

        <div className="flex items-center gap-6">
           <button className="glass p-3 rounded-full text-white/60 hover:text-primary transition-all border border-white/10">
             <Plus size={20} />
           </button>
           <div className="w-10 h-10 rounded-full border-2 border-primary/20 overflow-hidden shadow-2xl">
             <img src="https://picsum.photos/seed/profile/100/100" className="w-full h-full object-cover" />
           </div>
        </div>
      </div>
    </div>
  );
};

export default MovieUXView;
