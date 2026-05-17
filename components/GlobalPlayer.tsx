import React, { useState, useEffect, useRef } from 'react';
import { useGlobalPlayerState, useGlobalPlayerProgress } from '../contexts/GlobalPlayerContext';
import { useGoogleCast } from '../hooks/useGoogleCast';
import { Play, Pause, Activity, SkipBack, SkipForward, Volume2, Music, Radio, X, ChevronUp, ChevronDown, Library, Globe, Cast, Home, Search, MessageSquare, Bell, User as UserIcon, Moon, Sun, Palette, Sparkles, Tv, Repeat, Repeat1, Smartphone, Plus, Settings, LogOut, Upload, Shield, Maximize2, Minimize2, Share2, Users, Heart, Trophy, Layers, RotateCcw, List, Box, Video as VideoIcon, Headphones } from 'lucide-react';
import Logo from './Logo';
import { motion, AnimatePresence, useAnimation } from 'motion/react';
import MuxPlayer from '@mux/mux-player-react';
import { auth, listenToChatRooms } from '../services/backendService';
import { UserProfile, ChatRoom } from '../types';
import Visualizer from './Visualizer';
import AnimatedSlideshow from './AnimatedSlideshow';
import ThreeDImage from './ThreeDImage';

import { useAchievements } from '../contexts/AchievementContext';
import { fetchUserProfile } from '../services/backendService';

interface GlobalPlayerProps {
  onNavigate?: (view: any, params?: any) => void;
  bottomOffset?: string;
  topOffset?: string;
  theme?: string;
  setTheme?: (theme: any) => void;
  currentUser?: any;
  onLogout?: () => void;
  onUpload?: () => void;
  onOpenChat?: () => void;
  onOpenAchievements?: () => void;
  view?: string;
  isMobile?: boolean;
  userProfile?: UserProfile | null;
  onUpdateUserProfile?: (updates: Partial<UserProfile>) => void;
}

const GlobalPlayer: React.FC<GlobalPlayerProps> = ({
  onNavigate,
  bottomOffset = '0px',
  topOffset,
  theme,
  setTheme,
  currentUser,
  onLogout,
  onUpload,
  onOpenChat,
  onOpenAchievements,
  view,
  isMobile = false,
  userProfile,
  onUpdateUserProfile
}) => {
  const isBigScreen = theme === 'BIG_SCREEN';
  const isPhoneMode = theme === 'PHONE' || isMobile;
  const { isCastAvailable, isCasting, castTrack, stopCasting } = useGoogleCast();
  const { 
    currentTrack, 
    currentAlbum, 
    currentVideo, 
    isPlaying, 
    volume, 
    audioSource,
    pause, 
    resume, 
    togglePlay,
    setVolume, 
    next, 
    prev, 
    toggleFullScreen,
    toggleAppFullScreen,
    repeatMode, 
    setRepeatMode, 
    playTrack, 
    setVideoElement, 
    setCurrentVideo,
    analyser,
    isFrequencyVisualizerEnabled,
    setIsFrequencyVisualizerEnabled,
    isSlideshowActive, 
    setIsSlideshowActive,
    setIsUserActive,
    isUserActive,
    nanoPosition,
    setIsNanoView,
    isNanoView,
    isShrunk,
    setIsShrunk,
    isMinimized,
    setIsMinimized,
    isThreeDEnabled,
    setIsThreeDEnabled,
    isSpatialAudioEnabled,
    setSpatialAudioEnabled,
    isTVMode,
    setIsTVMode,
    isMiniPlayerActive,
    setIsMiniPlayerActive
  } = useGlobalPlayerState();
  const { currentTime, duration, seek } = useGlobalPlayerProgress();
  const { triggerAction } = useAchievements();

  const [isSpillOverOpen, setIsSpillOverOpen] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);

  // ── Music Video Sync ────────────────────────────────────────────────────────
  const musicVideoRef = useRef<HTMLVideoElement | null>(null);
  const [showMusicVideo, setShowMusicVideo] = useState(false);
  const [musicVideoReady, setMusicVideoReady] = useState(false);

  const isPlatformVideoUrl = (url?: string) =>
    !!url && url.includes('firebasestorage.googleapis.com');

  // Preload the linked music video whenever the track changes (platform uploads only)
  useEffect(() => {
    const videoUrl = currentTrack?.videoUrl;
    setShowMusicVideo(false);
    setMusicVideoReady(false);
    if (!videoUrl || !isPlatformVideoUrl(videoUrl)) return;
    const vid = document.createElement('video');
    vid.src = videoUrl;
    vid.preload = 'auto';
    vid.muted = false;
    vid.oncanplaythrough = () => setMusicVideoReady(true);
    musicVideoRef.current = vid;
    return () => { vid.pause(); vid.src = ''; };
  }, [currentTrack?.id, currentTrack?.videoUrl]);

  const switchToMusicVideo = () => {
    const vid = musicVideoRef.current;
    if (!vid || !currentTrack?.videoUrl || !isPlatformVideoUrl(currentTrack.videoUrl)) return;
    const videoDuration = vid.duration || 0;
    if (duration > 0 && videoDuration > 0) {
      const lyrics = currentTrack.lyrics || '';
      const words = lyrics.trim() ? lyrics.split(/\s+/).filter(Boolean) : [];
      let syncTime: number;
      if (words.length > 0) {
        const wordIdx = Math.round((currentTime / duration) * words.length);
        syncTime = (wordIdx / words.length) * videoDuration;
      } else {
        syncTime = (currentTime / duration) * videoDuration;
      }
      vid.currentTime = Math.max(0, Math.min(syncTime, videoDuration - 0.5));
    }
    vid.volume = volume;
    setShowMusicVideo(true);
    vid.play().catch(() => {});
  };

  const closeMusicVideo = () => {
    musicVideoRef.current?.pause();
    setShowMusicVideo(false);
  };

  useEffect(() => {
    const checkOrientation = () => {
      setIsLandscape(window.innerWidth > window.innerHeight && window.innerHeight < 500);
    };
    checkOrientation();
    let t: ReturnType<typeof setTimeout>;
    const onResize = () => { clearTimeout(t); t = setTimeout(checkOrientation, 150); };
    window.addEventListener('resize', onResize, { passive: true });
    return () => { window.removeEventListener('resize', onResize); clearTimeout(t); };
  }, []);
  const [isPlaylistExpanded, setIsPlaylistExpanded] = useState(false);
  const [isEssentialMode, setIsEssentialMode] = useState(false);
  const [pulse, setPulse] = useState(1);
  const [isMobileSlideshowOpen, setIsMobileSlideshowOpen] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showPreview, setShowPreview] = useState(true);
  const [latestRooms, setLatestRooms] = useState<ChatRoom[]>([]);
  const [showThemeGallery, setShowThemeGallery] = useState(false);

  // Artist Radio Station Logic
  const [radioStats, setRadioStats] = useState({ songCount: 0, lastCheckTime: Date.now() });
  const [isInterventionPlaying, setIsInterventionPlaying] = useState(false);
  const [interventionMessage, setInterventionMessage] = useState<string | null>(null);

  useEffect(() => {
    if (audioSource === 'RADIO' && currentTrack) {
      setRadioStats(prev => ({ ...prev, songCount: prev.songCount + 1 }));
    }
  }, [currentTrack?.id, audioSource]);

  useEffect(() => {
    const checkInterventions = async () => {
      if (audioSource !== 'RADIO' || isInterventionPlaying) return;

      const artistId = currentAlbum?.id.startsWith('artist_radio_') 
        ? currentAlbum.id.replace('artist_radio_', '') 
        : null;
      
      if (!artistId) return;

      try {
        const artist = await fetchUserProfile(artistId);
        if (!artist.radioSettings?.enabled) return;

        const { stingerFrequency = 5, adFrequency = 20, stingers = [], ads = [], scheduledEvents = [] } = artist.radioSettings;

        // Check for scheduled events (2 mins before)
        const now = Date.now();
        const upcomingEvent = scheduledEvents.find(e => {
          const timeToEvent = e.startTime - now;
          return timeToEvent > 0 && timeToEvent <= 120000; // Within 2 mins
        });

        if (upcomingEvent) {
          setIsInterventionPlaying(true);
          setInterventionMessage(`BREAKING: ${upcomingEvent.title} starting in 2 minutes!`);
          pause();
          setTimeout(() => {
            setIsInterventionPlaying(false);
            setInterventionMessage(null);
            resume();
            // In a real app, we'd navigate to the live event here
          }, 10000); // 10s message break for simulation
          return;
        }

        // Check for Ads
        if (radioStats.songCount > 0 && radioStats.songCount % adFrequency === 0) {
          if (ads.length > 0) {
            setIsInterventionPlaying(true);
            setInterventionMessage("PERSONALIZED ADVERTISEMENT");
            pause();
            const adAudio = new Audio(ads[Math.floor(Math.random() * ads.length)]);
            adAudio.play();
            adAudio.onended = () => {
              setIsInterventionPlaying(false);
              setInterventionMessage(null);
              resume();
            };
          }
        } 
        // Check for Stingers
        else if (radioStats.songCount > 0 && radioStats.songCount % stingerFrequency === 0) {
          if (stingers.length > 0) {
            setIsInterventionPlaying(true);
            setInterventionMessage("STATION IDENTIFICATION");
            pause();
            const stingerAudio = new Audio(stingers[Math.floor(Math.random() * stingers.length)]);
            stingerAudio.play();
            stingerAudio.onended = () => {
              setIsInterventionPlaying(false);
              setInterventionMessage(null);
              resume();
            };
          }
        }
      } catch (err) {
        console.error('Radio intervention error:', err);
      }
    };

    checkInterventions();
  }, [radioStats.songCount, audioSource]);

  useEffect(() => {
    // Only auto-collapse when nothing is playing — never hide an active session
    const nonMusicViews = ['CHAT', 'USER_PROFILE', 'SEARCH', 'FEED', 'DASHBOARD', 'SETTINGS', 'HELP_CENTER'];
    if (nonMusicViews.includes(view) && !isPlaying) {
        setIsMinimized(true);
    } else if (isPlaying) {
        setIsMinimized(false);
    }
  }, [view, isPlaying]);

  useEffect(() => {
    if (currentUser) {
      const unsubscribe = listenToChatRooms((rooms) => {
        setLatestRooms(rooms.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3));
      });
      return () => unsubscribe();
    }
  }, [currentUser]);

  const formatTime = (time: number) => {
    if (isNaN(time)) return '0:00';
    const hrs = Math.floor(time / 3600);
    const mins = Math.floor((time % 3600) / 60);
    const secs = Math.floor(time % 60);
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = (currentTime / duration) * 100 || 0;

  const handleShare = () => {
    let shareUrl = window.location.href;
    const baseUrl = window.location.origin;
    if (currentVideo) {
      shareUrl = `${baseUrl}/?type=video&id=${currentVideo.id}`;
    } else if (currentAlbum) {
      shareUrl = `${baseUrl}/?type=album&id=${currentAlbum.id}${currentTrack ? `&track=${currentTrack.id}` : ''}`;
    }

    if (navigator.share) {
      navigator.share({
        title: currentTrack?.title || currentVideo?.title || currentAlbum?.title || 'Check this out!',
        text: `Check out ${currentTrack?.title || currentVideo?.title || currentAlbum?.title} by ${currentTrack?.artist || currentAlbum?.artist || 'Unknown'} on Plajah!`,
        url: shareUrl,
      }).catch(console.error);
    } else {
      navigator.clipboard.writeText(shareUrl);
      alert('Link copied to clipboard!');
    }
  };

  const nanoControls = useAnimation();

  useEffect(() => {
    setPulse(1);
  }, []); // Permanently disabled sound reactivity

  useEffect(() => {
    if (isNanoView) {
      nanoControls.start({ 
        opacity: 1, 
        scale: 1, 
        height: isMinimized ? 150 : 480,
        rotateY: isSlideshowActive ? 180 : 0
      });
    }
  }, [isNanoView, isMinimized, isSlideshowActive, nanoControls]);

  const snapReset = async () => {
    await nanoControls.start({ x: 0, y: 0, transition: { type: 'spring', damping: 20 } });
  };

  if (isNanoView && !isPhoneMode) {
    return (
      <div className={`fixed bottom-8 left-8 z-[200] transition-opacity duration-1000 ${isUserActive ? 'opacity-100' : 'opacity-0'}`} style={{ perspective: '1200px' }}>
        <motion.div
          drag
          dragMomentum={true}
          onDragStart={() => document.body.style.userSelect = 'none'}
          onDragEnd={() => document.body.style.userSelect = ''}
          animate={nanoControls}
          initial={{ opacity: 0, scale: 0.9, x: 0, y: 0, height: 480 }}
          transition={{ rotateY: { duration: 0.8, ease: "circOut" }, height: { duration: 0.5, ease: "easeInOut" } }}
          style={{ transformStyle: 'preserve-3d' }}
          className="w-85 relative cursor-move select-none"
        >
          {/* FRONT: Player View */}
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-3xl border border-white/10 rounded-[3rem] shadow-[0_32px_64px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden"
            style={{ backfaceVisibility: 'hidden' }}
          >
            {/* Utility Header */}
            {!isMinimized && (
              <div className="px-6 pt-8 flex flex-col gap-4 z-20 relative pointer-events-auto" onPointerDown={e => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                  {/* Buttons */}
                  <div className="flex flex-col items-center">
                    <div className="flex items-center gap-1">
                       <button onClick={() => onNavigate?.('DASHBOARD')} className="p-2 text-white/40 hover:text-white transition-all bg-white/5 rounded-xl" title="Home"><Home size={14} /></button>
                       <button onClick={() => onNavigate?.('USER_PROFILE')} className="p-2 text-white/40 hover:text-white transition-all bg-white/5 rounded-xl" title="Profile"><UserIcon size={14} /></button>
                       <button 
                         onClick={() => setIsEssentialMode(!isEssentialMode)} 
                         className={`p-2 transition-all rounded-xl ${isEssentialMode ? 'bg-small-orange text-white' : 'text-white/40 hover:text-white bg-white/5'}`} 
                         title="Essential mode"
                       >
                         <Layers size={14} />
                       </button>
                       <button onClick={() => onNavigate?.('SETTINGS')} className="p-2 text-white/40 hover:text-white transition-all bg-white/5 rounded-xl" title="Settings"><Settings size={14} /></button>
                    </div>
                    <span className="text-[7px] font-black uppercase tracking-widest text-white/40 mt-1">Navigate</span>
                  </div>
                  
                  {/* Compact Theme Switcher */}
                  <div className="flex flex-col items-center">
                    <div className="flex items-center gap-0.5 p-1 bg-black/40 backdrop-blur-md rounded-xl border border-white/10">
                       <button onClick={() => setTheme?.('DARK')} className={`p-1.5 rounded-lg transition-all ${theme === 'DARK' ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`} title="Dark"><Moon size={12} /></button>
                       <button onClick={() => setTheme?.('LIGHT')} className={`p-1.5 rounded-lg transition-all ${theme === 'LIGHT' ? 'bg-black text-white' : 'text-white/40 hover:text-white'}`} title="Light"><Sun size={12} /></button>
                       <button onClick={() => setTheme?.('PLAJAH')} className={`p-1.5 rounded-lg transition-all ${theme === 'PLAJAH' ? 'bg-small-orange text-white' : 'text-white/40 hover:text-white'}`} title="Plajah"><Sparkles size={12} /></button>
                       <button onClick={() => setTheme?.('NEBULA')} className={`p-1.5 rounded-lg transition-all ${theme === 'NEBULA' ? 'bg-indigo-500 text-white' : 'text-white/40 hover:text-white'}`} title="Nebula"><Globe size={12} /></button>
                    </div>
                    <span className="text-[7px] font-black uppercase tracking-widest text-white/40 mt-1">Themes</span>
                  </div>
                </div>
              </div>
            )}
            
            {/* Visualizer/Art Area */}
            {!isMinimized && (
              <>
                <div className="absolute top-0 left-0 w-24 h-24 z-10 bg-white/[0.02] border-t border-l border-white/10 rounded-tl-[3rem] hover:bg-small-orange/10 transition-colors" />
                <div className="absolute top-0 right-0 w-24 h-24 z-10 bg-white/[0.02] border-t border-r border-white/10 rounded-tr-[3rem] hover:bg-small-orange/10 transition-colors" />
                <div className="absolute bottom-0 left-0 w-24 h-24 z-10 bg-white/[0.02] border-b border-l border-white/10 rounded-bl-[3rem] hover:bg-small-orange/10 transition-colors" />
                <div className="absolute bottom-0 right-0 w-24 h-24 z-10 bg-white/[0.02] border-b border-r border-white/10 rounded-br-[3rem] hover:bg-small-orange/10 transition-colors" />

                {/* Reset Button */}
                <button 
                  onClick={(e) => { e.stopPropagation(); snapReset(); }}
                  className="absolute top-4 right-4 z-50 p-2.5 bg-black/40 hover:bg-black/60 text-white/40 hover:text-white rounded-full transition-all border border-white/10 active:scale-90"
                  title="Reset Position"
                >
                  <RotateCcw size={12} />
                </button>

                {/* Visualizer Header */}
                <div className="flex-1 relative overflow-hidden">
                  <div className="absolute inset-0 pointer-events-none opacity-40">
                    <Visualizer 
                      analyser={analyser} 
                      themeColor={currentAlbum?.themeColor || '#FF8C00'} 
                      trackTitle={currentTrack?.title || ''} 
                      artist={currentAlbum?.artist || ''} 
                      isPlaying={isPlaying} 
                      isVideoMode={!!currentVideo}
                    />
                  </div>

                  {/* Album Art Overlay (Spinning Vinyl) */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <motion.div 
                      animate={isPlaying ? { rotate: 360 } : { rotate: 0 }}
                      transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                      className="w-40 h-40 rounded-full border-8 border-white/5 shadow-3xl relative overflow-hidden ring-1 ring-white/10"
                    >
                      <img 
                        src={currentAlbum?.coverImage || undefined} 
                        className="w-full h-full object-cover" 
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-10 h-10 rounded-full bg-black shadow-inner border border-white/20" />
                      </div>
                    </motion.div>
                  </div>

                  {/* Video Floating Preview inside Nano */}
                  {currentVideo && view !== 'MOVIE_UX' && view !== 'PLAYER' && (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute bottom-4 right-4 w-32 aspect-video bg-black rounded-xl overflow-hidden shadow-2xl border border-white/10 z-10 cursor-pointer group"
                      onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                    >
                      {currentVideo?.muxPlaybackId ? (
                        <MuxPlayer
                          ref={v => {
                            if (v) setVideoElement(v as any);
                          }}
                          playbackId={currentVideo.muxPlaybackId}
                          autoPlay="any"
                          muted // Nano preview usually muted
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <video 
                          ref={v => {
                            if (v) setVideoElement(v);
                          }}
                          src={currentVideo?.url || undefined}
                          className="w-full h-full object-cover"
                          playsInline
                          autoPlay
                          muted
                        />
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        {isPlaying ? <Pause size={16} className="text-white" /> : <Play size={16} className="text-white fill-white" />}
                      </div>
                    </motion.div>
                  )}
                </div>
              </>
            )}

            {/* Controls */}
            <div className={`relative z-10 border-t border-white/5 bg-black/40 backdrop-blur-2xl ${isMinimized ? 'px-2 py-2 flex items-center gap-2' : 'px-8 py-6'}`} onPointerDown={e => e.stopPropagation()}>
              
              {isMinimized && (
                <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 border border-white/10">
                  <img 
                    src={currentAlbum?.coverImage || undefined} 
                    className="w-full h-full object-cover" 
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}

              <div className={`flex flex-col flex-1 ${isMinimized ? 'gap-1' : 'gap-5'}`}>
                
                {!isMinimized && (
                  <div className={`text-center ${isMinimized ? 'mb-1' : 'mb-6'}`}>
                    <h3 className={`${isMinimized ? 'text-[10px]' : 'text-sm'} font-display font-black uppercase tracking-[0.1em] truncate text-white px-2`}>{currentTrack?.title || 'No Track Playing'}</h3>
                    {!isMinimized && <p className="text-[10px] font-label font-black text-small-orange uppercase tracking-[0.2em] truncate opacity-60">{currentAlbum?.artist || 'Unknown Artist'}</p>}
                    {currentTrack?.isEclipsa && !isMinimized && (
                      <div className="flex items-center justify-center gap-1.5 mt-1">
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/20 border border-violet-500/40 text-violet-300 text-[8px] font-black uppercase tracking-widest">
                          <Headphones size={9} /> Eclipsa Spatial Audio
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Progress Bar */}
                <div className="group/progress cursor-pointer" onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const percent = (e.clientX - rect.left) / rect.width;
                  seek(percent * duration);
                }}>
                  <div className="h-1 bg-white/10 rounded-full overflow-hidden relative">
                    <motion.div 
                      className="absolute inset-y-0 left-0 bg-small-orange shadow-[0_0_12px_rgba(255,140,0,0.4)]" 
                      initial={false}
                      animate={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Buttons Row */}
                <div className="flex items-center justify-between">
                  <div className="flex flex-col items-center">
                    <div className="flex items-center gap-0">
                      <button 
                        onClick={() => {
                          if (repeatMode === 'OFF') setRepeatMode('ALL');
                          else if (repeatMode === 'ALL') setRepeatMode('ONE');
                          else setRepeatMode('OFF');
                        }}
                        className={`p-1 transition-all ${repeatMode !== 'OFF' ? 'text-small-orange' : 'text-white/40 hover:text-white'}`}
                        title={repeatMode === 'ONE' ? "Repeat One" : repeatMode === 'ALL' ? "Repeat All" : "Repeat Off"}
                      >
                        {repeatMode === 'ONE' ? <Repeat1 size={isMinimized ? 11 : 14} /> : <Repeat size={isMinimized ? 11 : 14} />}
                      </button>
                      <button onClick={prev} className={`p-1 text-white/40 hover:text-white transition-all`}><SkipBack size={isMinimized ? 12 : 16} /></button>
                      <button 
                        onClick={togglePlay}
                        className={`${isMinimized ? 'w-8 h-8' : 'w-12 h-12'} rounded-full bg-white text-black flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-all`}
                      >
                        {isPlaying ? <Pause size={isMinimized ? 14 : 22} fill="black" /> : <Play size={isMinimized ? 14 : 22} fill="black" className="ml-0.5" />}
                      </button>
                      <button onClick={next} className={`p-1 text-white/40 hover:text-white transition-all`}><SkipForward size={isMinimized ? 12 : 16} /></button>
                    </div>
                    <span className="text-[7px] font-black uppercase tracking-widest text-white/40 mt-1">Playback</span>
                  </div>

                  <div className="flex flex-col items-center">
                    <div className="flex items-center gap-0">
                      <button 
                        onClick={() => setIsFrequencyVisualizerEnabled(!isFrequencyVisualizerEnabled)} 
                        className={`p-1 rounded-lg transition-all ${isFrequencyVisualizerEnabled ? 'text-small-orange bg-small-orange/10' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                        title="Frequency FX"
                      >
                        <Activity size={isMinimized ? 11 : 14} />
                      </button>
                      <button 
                        onClick={() => setIsMiniPlayerActive(!isMiniPlayerActive)} 
                        className={`p-1 rounded-lg transition-all ${isMiniPlayerActive ? 'text-small-orange bg-small-orange/10' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                        title="Toggle Mini Player"
                      >
                        <Tv size={isMinimized ? 11 : 14} />
                      </button>
                      <button
                        onClick={() => setIsThreeDEnabled(!isThreeDEnabled)}
                        className={`p-1 rounded-lg transition-all ${isThreeDEnabled ? 'text-small-orange bg-small-orange/10' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                        title="3D Depth Mapping"
                      >
                        <Box size={isMinimized ? 11 : 14} />
                      </button>
                      <button
                        onClick={() => setSpatialAudioEnabled(!isSpatialAudioEnabled)}
                        className={`p-1 rounded-lg transition-all ${isSpatialAudioEnabled ? 'text-violet-400 bg-violet-500/10' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                        title="Eclipsa Spatial Audio (HRTF)"
                      >
                        <Headphones size={isMinimized ? 11 : 14} />
                      </button>
                      <button 
                        onClick={() => setIsSlideshowActive(!isSlideshowActive)} 
                        className={`p-1 rounded-lg transition-all ${isSlideshowActive ? 'text-small-orange bg-small-orange/10' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                        title="Flip to Slideshow"
                      >
                        <Layers size={isMinimized ? 12 : 16} />
                      </button>
                      <button onClick={() => setIsMinimized(!isMinimized)} className={`p-1 rounded-lg transition-all ${isMinimized ? 'text-small-orange bg-small-orange/10' : 'text-white/40 hover:text-white hover:bg-white/5'}`} title="Minimize/Expand">
                        {isMinimized ? <Maximize2 size={isMinimized ? 12 : 16} /> : <Minimize2 size={isMinimized ? 12 : 16} />}
                      </button>
                      <button onClick={() => setIsNanoView?.(false)} className="p-1 text-white/40 hover:text-white hover:bg-white/5 rounded-lg transition-all" title="Expand View">
                        <Maximize2 size={isMinimized ? 12 : 16} />
                      </button>
                    </div>
                    <span className="text-[7px] font-black uppercase tracking-widest text-white/40 mt-1">View States</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* BACK: Slideshow View */}
          <div 
            className="absolute inset-0 bg-black/95 backdrop-blur-3xl border border-white/10 rounded-[3rem] shadow-[0_32px_64px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <div className="flex-1 relative overflow-hidden">
              {currentAlbum?.slideshow && currentAlbum.slideshow.length > 0 ? (
                <div className="w-full h-full relative">
                  <Slideshow images={currentAlbum.slideshow} />
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center text-white/20 gap-4">
                  <div className="w-16 h-16 rounded-3xl bg-white/5 flex items-center justify-center">
                    <Music size={24} />
                  </div>
                  <div className="space-y-2">
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Pure Audio Experience</span>
                    <p className="text-[8px] font-medium leading-relaxed uppercase tracking-widest text-white/20">No slideshow assets available for this release</p>
                  </div>
                </div>
              )}
              
              {/* Overlay Gradient for Text Readability */}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/40 pointer-events-none" />

              <button 
                onClick={() => setIsSlideshowActive(false)}
                className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white/40 hover:text-white transition-all z-20 border border-white/10 backdrop-blur-lg"
              >
                <RotateCcw size={16} />
              </button>
            </div>

            <div className="p-8 pb-10 space-y-6" onPointerDown={e => e.stopPropagation()}>
               <div className="text-center space-y-1">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-small-orange shadow-[0_0_8px_orange]" />
                  <span className="text-[9px] font-black text-small-orange uppercase tracking-[0.4em]">Cinematic</span>
                </div>
                <h3 className="text-xs font-black uppercase tracking-widest truncate text-white px-2">{currentTrack?.title}</h3>
              </div>
              
              <div className="flex items-center justify-center gap-8">
                <button onClick={prev} className="text-white/40 hover:text-white transition-all hover:scale-110"><SkipBack size={24} /></button>
                 <button 
                    onClick={togglePlay}
                    className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:scale-110 active:scale-95 transition-all"
                  >
                    {isPlaying ? <Pause size={28} fill="black" /> : <Play size={28} fill="black" className="ml-1" />}
                  </button>
                <button onClick={next} className="text-white/40 hover:text-white transition-all hover:scale-110"><SkipForward size={24} /></button>
              </div>
            </div>
          </div>

          {/* BACK: Slideshow Player */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-3xl border border-white/10 rounded-[3rem] shadow-[0_32px_64px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
             <div className="absolute inset-0 opacity-80">
               <AnimatedSlideshow 
                 images={(currentTrack?.images && currentTrack.images.length > 0) ? currentTrack.images : (currentAlbum?.slideshow && currentAlbum.slideshow.length > 0) ? currentAlbum.slideshow : [currentAlbum?.coverImage || '', 'https://picsum.photos/seed/slide1/1920/1080', 'https://picsum.photos/seed/slide2/1920/1080']} 
                 isPlaying={isPlaying} 
                 themeColor={currentAlbum?.themeColor || '#FF8C00'} 
                 artistNotes={currentTrack?.artistNotes || []}
               />
             </div>
             
             {/* Back Reset Button */}
             <button 
               onClick={(e) => { e.stopPropagation(); snapReset(); }}
               className="absolute top-4 left-4 z-50 p-2.5 bg-black/40 hover:bg-black/60 text-white/40 hover:text-white rounded-full transition-all border border-white/10 active:scale-90"
               title="Reset Position"
             >
               <RotateCcw size={12} className="rotate-180" />
             </button>

             <div className="mt-auto p-6 bg-black/40 backdrop-blur-2xl border-t border-white/5 relative z-10 flex flex-col gap-4">
                <div className="text-center">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] truncate text-white">{currentTrack?.title}</h3>
                </div>
                <div className="flex items-center justify-center gap-4">
                    <button onClick={prev} className="p-2 text-white/40 hover:text-white transition-all"><SkipBack size={16} /></button>
                    <button 
                      onClick={togglePlay}
                      className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center shadow-2xl transition-all"
                    >
                      {isPlaying ? <Pause size={18} fill="black" /> : <Play size={18} fill="black" className="ml-0.5" />}
                    </button>
                    <button onClick={next} className="p-2 text-white/40 hover:text-white transition-all"><SkipForward size={16} /></button>
                </div>
                <button 
                  onClick={() => setIsSlideshowActive(false)}
                  className="w-full py-2 bg-white/10 hover:bg-white/20 rounded-xl text-[8px] font-black uppercase tracking-widest text-white/60 transition-all"
                >
                  Flip Back
                </button>
             </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div
      className={`fixed left-0 right-0 z-[100] flex flex-col transition-opacity duration-1000 ${isUserActive ? 'opacity-100' : 'opacity-0'}`}
      style={{ bottom: topOffset ? 'auto' : bottomOffset, top: topOffset || 'auto' }}
    >

      {/* Mobile Slideshow Overlay */}
      <AnimatePresence>
        {isMobileSlideshowOpen && isPhoneMode && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[998] bg-black flex flex-col"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            {/* Slideshow fills the main area */}
            <div className="flex-1 relative overflow-hidden">
              <AnimatedSlideshow
                images={
                  (currentTrack?.images && currentTrack.images.length > 0)
                    ? currentTrack.images
                    : (currentAlbum?.slideshow && currentAlbum.slideshow.length > 0)
                    ? currentAlbum.slideshow
                    : [currentAlbum?.coverImage || '']
                }
                isPlaying={isPlaying}
                themeColor={currentAlbum?.themeColor || '#FF8C00'}
                artistNotes={currentTrack?.artistNotes || []}
              />
              {/* Track info gradient overlay */}
              <div className="absolute bottom-0 left-0 right-0 px-5 pt-16 pb-4 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none">
                <p className="text-[8px] font-black uppercase tracking-[0.4em] text-small-orange mb-1">{currentAlbum?.artist}</p>
                <h3 className="text-sm font-black uppercase tracking-widest truncate text-white">{currentTrack?.title}</h3>
              </div>
              {/* Close button */}
              <button
                onClick={() => setIsMobileSlideshowOpen(false)}
                className="absolute top-4 right-4 z-10 p-2.5 bg-black/50 border border-white/10 rounded-full text-white/60 hover:text-white backdrop-blur-md"
              >
                <X size={16} />
              </button>
            </div>

            {/* Track thumbnail strip */}
            {(currentAlbum?.tracks?.length ?? 0) > 1 && (
              <div className="flex gap-2.5 px-4 py-3 overflow-x-auto bg-black/60 border-t border-white/5" style={{ scrollbarWidth: 'none' }}>
                {currentAlbum!.tracks.map(track => (
                  <button
                    key={track.id}
                    onClick={() => playTrack(track, currentAlbum!, 'LIBRARY')}
                    className={`flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden border-2 transition-all ${track.id === currentTrack?.id ? 'border-small-orange shadow-[0_0_10px_rgba(255,140,0,0.5)]' : 'border-transparent opacity-50'}`}
                  >
                    <img src={track.albumCover || currentAlbum?.coverImage || undefined} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            {/* Playback controls bar */}
            <div className="flex items-center justify-between px-8 py-5 bg-black/80 border-t border-white/5">
              <button onClick={prev} className="p-2 text-white/40 active:text-white"><SkipBack size={20} /></button>
              <button
                onClick={togglePlay}
                className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center shadow-2xl active:scale-95 transition-transform"
              >
                {isPlaying ? <Pause size={24} fill="black" /> : <Play size={24} fill="black" className="ml-1" />}
              </button>
              <button onClick={next} className="p-2 text-white/40 active:text-white"><SkipForward size={20} /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* Message/Notification Preview Bar - DISABLED as per request */}
      {/* <AnimatePresence>
        {showPreview && latestRooms.length > 0 && (
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            className="mx-auto mb-2 px-6 py-2 bg-black/60 backdrop-blur-2xl border border-white/5 rounded-full flex items-center gap-4 shadow-2xl pointer-events-auto"
          >
            <div className="flex items-center gap-2 text-small-orange">
              <MessageSquare size={14} />
              <span className="text-[9px] font-black uppercase tracking-widest">Recent Activity</span>
            </div>
            <div className="h-4 w-px bg-white/10" />
            <div className="flex items-center gap-6">
              <button 
                onClick={() => onNavigate?.('CHAT')}
                className="p-2 bg-small-orange text-white rounded-lg hover:scale-105 transition-all"
                title="Start New Chat"
              >
                <Plus size={14} />
              </button>
              {latestRooms.map(room => (
                <button 
                  key={room.id}
                  onClick={() => onNavigate?.('CHAT')}
                  className="flex items-center gap-2 group"
                >
                  <div className="w-5 h-5 rounded-lg overflow-hidden border border-white/10">
                    <img src={`https://picsum.photos/seed/${room.id}/100/100`} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="text-[8px] font-black uppercase tracking-tight text-white group-hover:text-small-orange transition-colors truncate max-w-[80px]">
                      {room.name || 'Conversation'}
                    </span>
                    <span className="text-[7px] font-bold uppercase tracking-widest text-white/30 truncate max-w-[100px]">
                      {room.lastMessage || 'New message...'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
            <button onClick={() => setShowPreview(false)} className="p-1 text-white/20 hover:text-white transition-all">
              <X size={12} />
            </button>
          </motion.div>
        )}
      </AnimatePresence> */}

      {/* Persistent Plajah restore button — always visible, never slides with the bar */}
      {isMinimized && (
        <button
          onClick={() => setIsMinimized(false)}
          className="fixed z-[1010] flex items-center gap-2 px-3 py-1.5 bg-black/70 backdrop-blur-xl border border-white/10 rounded-full shadow-[0_0_20px_rgba(107,0,153,0.4)] hover:scale-105 active:scale-95 transition-all"
          style={{
            bottom: isPhoneMode && !isLandscape
              ? 'calc(4rem + env(safe-area-inset-bottom) + 0.5rem)'
              : '0.5rem',
            right: isPhoneMode ? '50%' : '5rem',
            transform: isPhoneMode ? 'translateX(50%)' : undefined,
          }}
          title="Show Player"
        >
          <Logo size={18} />
          {(currentTrack || currentVideo) && (
            <span className="text-[8px] font-black uppercase tracking-widest text-white/60 max-w-[120px] truncate">
              {currentTrack?.title || currentVideo?.title}
            </span>
          )}
        </button>
      )}

      <motion.div
        initial={{ y: 100 }}
        animate={{ y: isMinimized ? (isBigScreen ? 120 : (isPhoneMode ? (isLandscape ? 60 : 40) : 60)) : 0 }}
        className={`fixed left-0 right-0 z-[1000] w-full glass-nav shadow-[0_-8px_40px_rgba(0,0,0,0.6)] transition-all ${isPhoneMode ? (isShrunk ? 'px-4 pt-0.5' : (isLandscape ? 'px-4 py-0.5' : 'px-4 pt-2')) : (isShrunk ? 'px-6 py-1' : (isBigScreen ? 'px-12 py-3' : 'px-4 lg:px-6 py-2'))}`}
        style={{
          bottom: isPhoneMode && !isLandscape ? 'calc(4rem + env(safe-area-inset-bottom))' : '0px',
          paddingBottom: isPhoneMode && !isLandscape ? '0.75rem' : isPhoneMode && isLandscape ? '4px' : undefined,
          maxHeight: isLandscape ? '70px' : undefined,
        }}
      >
        {/* Radio Intervention Overlay */}
        <AnimatePresence>
          {isInterventionPlaying && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute -top-16 left-1/2 -translate-x-1/2 px-6 py-2 bg-[#00DAF3] text-black rounded-full shadow-[0_0_30px_rgba(0,218,243,0.5)] flex items-center gap-3 z-[1100]"
            >
              <div className="w-2 h-2 bg-black rounded-full animate-ping" />
              <span className="text-[10px] font-black uppercase tracking-widest">{interventionMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Minimize/Collapse Toggle */}
        <button 
          onClick={() => setIsMinimized(!isMinimized)}
          className={`absolute p-2 bg-theme-card/90 backdrop-blur-3xl border border-white/5 rounded-t-xl text-white/40 hover:text-white transition-all shadow-2xl ${isPhoneMode ? 'left-1/2 -translate-x-1/2' : 'right-8'} ${isLandscape && !isMinimized ? 'hidden' : '-top-10'}`}
          title="Toggle Minimized Pill Mode"
        >
          {isMinimized ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>

        {/* Mobile Swipe-Up Spillover Area */}
        {isPhoneMode && (
          <AnimatePresence>
            {isSpillOverOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className={`overflow-hidden glass-sheet mb-2 ${topOffset ? 'border-t rounded-b-m3-2xl' : 'border-b rounded-t-m3-2xl'}`}
              >
                <div className="p-6 flex flex-col gap-6">
                  {/* Unified Menu: Playlist + Navigation */}
                  {(currentAlbum?.tracks || []).length > 0 && (
                    <div className="space-y-3">
                      <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/20 px-2">Up Next</p>
                      <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
                        {currentAlbum?.tracks.map((track) => (
                          <button 
                            key={track.id}
                            onClick={() => {
                              playTrack(track, currentAlbum, 'LIBRARY');
                              setIsSpillOverOpen(false);
                            }}
                            className={`flex flex-col gap-2 min-w-[120px] p-3 rounded-2xl transition-all ${track.id === currentTrack?.id ? 'bg-white/10' : 'bg-white/5'}`}
                          >
                            <div className="w-full aspect-square rounded-xl overflow-hidden shadow-lg">
                              <img src={track.albumCover || currentAlbum?.coverImage || undefined} className="w-full h-full object-cover" />
                            </div>
                            <div className="text-left">
                              <p className={`text-[8px] font-black uppercase truncate ${track.id === currentTrack?.id ? 'text-small-orange' : 'text-white'}`}>{track.title}</p>
                              <p className="text-[7px] font-bold text-white/30 truncate">{track.artist || currentAlbum?.artist}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-4 gap-4">
                    <button onClick={() => { onNavigate?.('SEARCH'); setIsSpillOverOpen(false); }} className="flex flex-col items-center gap-2 p-4 bg-white/5 rounded-2xl">
                      <Search size={20} className="text-white/40" />
                      <span className="text-[8px] font-black uppercase tracking-widest text-white/40">Search</span>
                    </button>
                    <button onClick={() => { onOpenChat?.(); setIsSpillOverOpen(false); }} className="flex flex-col items-center gap-2 p-4 bg-white/5 rounded-2xl">
                      <MessageSquare size={20} className="text-white/40" />
                      <span className="text-[8px] font-black uppercase tracking-widest text-white/40">Chat</span>
                    </button>
                    <button onClick={() => { onUpload?.(); setIsSpillOverOpen(false); }} className="flex flex-col items-center gap-2 p-4 bg-white/5 rounded-2xl">
                      <Plus size={20} className="text-white/40" />
                      <span className="text-[8px] font-black uppercase tracking-widest text-white/40">Upload</span>
                    </button>
                    <button onClick={() => { onNavigate?.('LIBRARY'); setIsSpillOverOpen(false); }} className="flex flex-col items-center gap-2 p-4 bg-white/5 rounded-2xl">
                      <Library size={20} className="text-white/40" />
                      <span className="text-[8px] font-black uppercase tracking-widest text-white/40">Library</span>
                    </button>
                    <button onClick={() => { onNavigate?.('CLUBS'); setIsSpillOverOpen(false); }} className="flex flex-col items-center gap-2 p-4 bg-white/5 rounded-2xl">
                      <Users size={20} className="text-white/40" />
                      <span className="text-[8px] font-black uppercase tracking-widest text-white/40">Clubs</span>
                    </button>
                    <button onClick={() => { onNavigate?.('CHARITY'); setIsSpillOverOpen(false); }} className="flex flex-col items-center gap-2 p-4 bg-white/5 rounded-2xl">
                      <Heart size={20} className="text-white/40" />
                      <span className="text-[8px] font-black uppercase tracking-widest text-white/40">Charity</span>
                    </button>
                  </div>
                  
                  <div className="p-4 bg-white/5 rounded-2xl space-y-4">
                    <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/20 text-center">Interface Themes</p>
                    <div className="flex items-center justify-between gap-2">
                      <button onClick={() => setTheme?.('DARK')} className={`p-3 rounded-xl flex-1 ${(theme as string) === 'DARK' ? 'bg-white text-black' : 'bg-white/5 text-white/40'}`}><Moon size={16} className="mx-auto" /></button>
                      <button onClick={() => setTheme?.('LIGHT')} className={`p-3 rounded-xl flex-1 ${(theme as string) === 'LIGHT' ? 'bg-black text-white' : 'bg-white/5 text-white/40'}`}><Sun size={16} className="mx-auto" /></button>
                      <button onClick={() => setTheme?.('PASTEL')} className={`p-3 rounded-xl flex-1 ${(theme as string) === 'PASTEL' ? 'bg-[#ffb7b2] text-black' : 'bg-white/5 text-white/40'}`}><Palette size={16} className="mx-auto" /></button>
                      <button onClick={() => setTheme?.('CITRUS')} className={`p-3 rounded-xl flex-1 ${(theme as string) === 'CITRUS' ? 'bg-[#FF3B00] text-white' : 'bg-white/5 text-white/40'}`}><Palette size={16} className="mx-auto" /></button>
                      <button onClick={() => setTheme?.('PLAJAH')} className={`p-3 rounded-xl flex-1 ${(theme as string) === 'PLAJAH' ? 'bg-gradient-to-br from-[#6B0099] to-[#FF8C00] text-white' : 'bg-white/5 text-white/40'}`}><Sparkles size={16} className="mx-auto" /></button>
                    </div>
                    {currentUser && onUpdateUserProfile && (
                      <button
                        onClick={() => onUpdateUserProfile({ customThemeEnabled: userProfile?.customThemeEnabled === false ? true : false })}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all ${userProfile?.customThemeEnabled !== false ? 'bg-small-orange/20 text-small-orange' : 'bg-white/5 text-white/40'}`}
                      >
                        <span className="text-[8px] font-black uppercase tracking-widest">Custom Theme</span>
                        <Sparkles size={14} />
                      </button>
                    )}
                  </div>

                  {currentUser && (
                    <button onClick={() => { onLogout?.(); setIsSpillOverOpen(false); }} className="flex items-center justify-center gap-3 p-4 bg-red-500/10 text-red-500 rounded-2xl">
                      <LogOut size={16} />
                      <span className="text-[10px] font-black uppercase tracking-widest">Sign Out</span>
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}

        <div
          className={`w-full max-w-7xl mx-auto flex items-center justify-between gap-3 lg:gap-6 px-4 lg:px-6 ${isBigScreen ? 'scale-105' : ''}`}
          onTouchStart={(e) => {
            if (!isPhoneMode) return;
            const touch = e.touches[0];
            const startY = touch.clientY;
            const handleTouchEnd = (ee: TouchEvent) => {
              const endY = ee.changedTouches[0].clientY;
              if (startY - endY > 50) setIsSpillOverOpen(true);
              if (endY - startY > 50) setIsSpillOverOpen(false);
              document.removeEventListener('touchend', handleTouchEnd);
            };
            document.addEventListener('touchend', handleTouchEnd);
          }}
        >
          {/* Mobile Layout: Mini Control Player by Default */}
          {isPhoneMode ? (
            <div className={`w-full flex ${isLandscape ? 'flex-row items-center gap-4 px-4 h-full' : 'flex-col items-center'}`}>
              {/* Sleeker Info Bar at Top */}
              <div className={`${isLandscape ? 'w-auto flex-shrink-0' : 'w-full'} flex items-center justify-between px-2 relative ${isShrunk ? '' : (isLandscape ? 'gap-2' : 'gap-4 pb-2 mb-2')}`}>
                {/* Top-left utilities: Shrink & Home */}
                <div className={`absolute flex items-center gap-1 z-20 ${isLandscape ? '-top-1 left-0' : (isShrunk ? '-top-6 left-0' : '-top-8 left-0')}`}>
                  <button 
                    onClick={() => setIsShrunk(!isShrunk)}
                    className="p-1.5 bg-black/60 rounded-full border border-white/10 backdrop-blur-md text-white/40 hover:text-white active:scale-90 transition-all shadow-lg"
                    title={isShrunk ? "Expand Player" : "Shrink Player"}
                  >
                    {isShrunk ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
                  </button>
                  <button 
                    onClick={() => onNavigate?.('DASHBOARD')}
                    className="p-1.5 bg-black/60 rounded-full border border-white/10 backdrop-blur-md text-white/40 hover:text-white active:scale-90 transition-all shadow-lg"
                    title="Home"
                  >
                    <Home size={14} />
                  </button>
                </div>

                {!isShrunk && (
                  <div className={`flex items-center gap-3 min-w-0 flex-1 ${isLandscape ? '' : 'mt-2'}`} onClick={() => setIsSpillOverOpen(!isSpillOverOpen)}>
                    <div className={`${isLandscape ? 'w-8 h-8' : 'w-8 h-8'} rounded-lg overflow-hidden shrink-0 shadow-lg`}>
                      <img 
                        src={(currentTrack ? (currentTrack.albumCover || currentAlbum?.coverImage) : (currentVideo?.thumbnailUrl || 'https://picsum.photos/seed/video/200/200')) || null} 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="min-w-0">
                      <h4 className={`${isLandscape ? 'text-[8px] max-w-[100px]' : 'text-[9px]'} font-black uppercase tracking-tight text-white truncate mb-0.5`}>
                        {currentTrack?.title || currentVideo?.title || 'No Media'}
                      </h4>
                      {!isLandscape && (
                        <p className="text-[7px] font-bold text-small-orange uppercase tracking-widest truncate opacity-60">
                          {currentTrack?.artist || currentAlbum?.artist || 'Unknown'}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {!isShrunk && (
                  <div className="flex items-center gap-4">
                    <button onClick={handleShare} className="text-white/20 hover:text-white"><Share2 size={14} /></button>
                    {currentTrack && (
                      <button
                        onClick={() => setIsMobileSlideshowOpen(true)}
                        className={`${isMobileSlideshowOpen ? 'text-small-orange' : 'text-white/20 hover:text-white'} transition-colors`}
                        title="Slideshow"
                      >
                        <Tv size={14} />
                      </button>
                    )}
                    <button onClick={() => setIsSpillOverOpen(!isSpillOverOpen)} className="text-small-orange">
                      {topOffset ? (
                        <ChevronDown size={18} className={`transition-transform duration-500 ${isSpillOverOpen ? 'rotate-180' : ''}`} />
                      ) : (
                        <ChevronUp size={18} className={`transition-transform duration-500 ${isSpillOverOpen ? 'rotate-180' : ''}`} />
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Slender Progress Bar in the Middle */}
              <div 
                className={`h-0.5 lg:h-1 bg-white/5 rounded-full overflow-hidden relative cursor-pointer ${isShrunk ? 'mb-2' : (isLandscape ? 'flex-[2] mx-4' : 'mb-6 w-full')}`}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = (e.clientX - rect.left) / rect.width;
                  seek(pct * duration);
                }}
              >
                <motion.div 
                  className="absolute inset-y-0 left-0 bg-small-orange shadow-[0_0_8px_rgba(255,140,0,0.6)]"
                  style={{ width: `${progress}%` }}
                />
              </div>

              {/* Balanced Controls Hub at Bottom */}
              <div className={`flex items-center justify-between ${isLandscape ? 'flex-1 gap-2' : 'w-full'} ${isShrunk ? 'px-1 gap-2' : (isLandscape ? 'px-0' : 'px-3 gap-2')}`}>
                {/* Left Side: repeat toggle always visible in portrait */}
                <div className={`flex items-center justify-start shrink-0 ${isLandscape ? 'hidden' : ''}`}>
                  <button
                    onClick={() => {
                      if (repeatMode === 'OFF') setRepeatMode('ALL');
                      else if (repeatMode === 'ALL') setRepeatMode('ONE');
                      else setRepeatMode('OFF');
                    }}
                    className={`p-2 transition-all rounded-full android-press ${repeatMode !== 'OFF' ? 'text-small-orange' : 'text-white/20'}`}
                    style={{ minWidth: 36, minHeight: 36 }}
                    title="Repeat Mode"
                  >
                    {repeatMode === 'ONE' ? <Repeat1 size={16} /> : <Repeat size={16} />}
                  </button>
                </div>

                {/* Center Block: Prev / Play / Next pill */}
              <div className={`flex items-center justify-center gap-1 glass rounded-m3-full ${isLandscape ? 'px-1 py-0.5' : 'px-3 py-2'}`}>
                  <button onClick={prev} className={`p-2 text-white/40 active:text-white android-press transition-colors ${isLandscape ? 'hidden' : 'block'}`} style={{ minWidth: 36, minHeight: 36 }}><SkipBack size={18} /></button>

                  <button
                    onClick={isPlaying ? pause : resume}
                    className={`${isLandscape ? 'w-8 h-8' : 'w-11 h-11'} rounded-full bg-white text-black flex items-center justify-center shadow-[0_0_30px_rgba(255,255,255,0.3)] active:scale-90 android-press transition-all z-20`}
                  >
                    {isPlaying ? <Pause size={isLandscape ? 12 : 20} fill="black" /> : <Play size={isLandscape ? 12 : 20} className={isLandscape ? 'ml-0.5' : 'ml-1'} fill="black" />}
                  </button>

                  <button onClick={next} className={`p-2 text-white/40 active:text-white android-press transition-colors ${isLandscape ? 'hidden' : 'block'}`} style={{ minWidth: 36, minHeight: 36 }}><SkipForward size={18} /></button>
              </div>

                {/* Right Side: share + music video + queue buttons */}
                <div className={`flex items-center justify-end gap-1 shrink-0 ${isLandscape ? 'hidden' : ''}`}>
                  <button
                    onClick={handleShare}
                    className="p-2 android-press transition-all rounded-full text-white/30 hover:text-white"
                    style={{ minWidth: 36, minHeight: 36 }}
                    title="Share"
                  >
                    <Share2 size={16} />
                  </button>
                  {currentTrack?.videoUrl && isPlatformVideoUrl(currentTrack.videoUrl) && (
                    <button
                      onClick={switchToMusicVideo}
                      disabled={!musicVideoReady}
                      className={`p-2 android-press transition-all rounded-full ${musicVideoReady ? 'text-small-orange hover:bg-small-orange/10' : 'text-white/15'}`}
                      style={{ minWidth: 36, minHeight: 36 }}
                      title={musicVideoReady ? 'Switch to Music Video' : 'Loading video…'}
                    >
                      <VideoIcon size={16} />
                    </button>
                  )}
                  <button
                    onClick={() => setIsSpillOverOpen(!isSpillOverOpen)}
                    className={`p-2 android-press transition-all rounded-full ${isSpillOverOpen ? 'text-small-orange' : 'text-white/30'}`}
                    style={{ minWidth: 36, minHeight: 36 }}
                    title="Queue & Menu"
                  >
                    <List size={18} />
                  </button>
                </div>
              </div>
            </div>
          ) : isShrunk ? (
            /* COMPACT MODE FOR DESKTOP - VERY NARROW ONE-LINER */
            <div className="w-full flex items-center justify-between gap-6 overflow-hidden">
               {/* Shrink/Expand Toggle Leftmost */}
               <button 
                  onClick={() => setIsShrunk(false)}
                  className="p-3 text-small-orange hover:text-white transition-all transform hover:scale-110 active:scale-95"
                  title="Expand Interface"
                >
                  <Maximize2 size={18} />
                </button>

              {/* Media Info (Brief) */}
              <div className="flex items-center gap-3 min-w-0 max-w-[200px]">
                <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 shadow-2xl border border-white/10">
                  <img 
                    src={(currentTrack ? (currentTrack.albumCover || currentAlbum?.coverImage) : (currentVideo?.thumbnailUrl || 'https://picsum.photos/seed/video/200/200')) || null} 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="min-w-0">
                  <h4 className="text-[10px] font-black uppercase tracking-tight text-white truncate">
                    {currentTrack?.title || currentVideo?.title || 'No Media'}
                  </h4>
                  <p className="text-[8px] font-bold text-small-orange uppercase tracking-widest truncate opacity-60">
                    {currentTrack?.artist || currentAlbum?.artist || 'Unknown'}
                  </p>
                </div>
              </div>

              {/* Basic Playback */}
              <div className="flex items-center gap-6 shrink-0">
                <button onClick={prev} className="text-white/40 hover:text-white transition-all"><SkipBack size={16} /></button>
                <button 
                  onClick={isPlaying ? pause : resume}
                  className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-110 active:scale-90 transition-all shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                >
                  {isPlaying ? <Pause size={14} fill="black" /> : <Play size={14} fill="black" className="ml-0.5" />}
                </button>
                <button onClick={next} className="text-white/40 hover:text-white transition-all"><SkipForward size={16} /></button>
              </div>

              {/* One-Line Progress Bar */}
              <div className="flex-1 flex items-center gap-4">
                <span className="font-black text-white/20 text-[9px] w-10 text-right">{formatTime(currentTime)}</span>
                <div 
                  className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden cursor-pointer relative group/prog"
                  onMouseDown={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const handleMove = (me: MouseEvent) => {
                      const x = Math.max(0, Math.min(me.clientX - rect.left, rect.width));
                      seek((x / rect.width) * duration);
                    };
                    const handleUp = () => {
                      window.removeEventListener('mousemove', handleMove);
                      window.removeEventListener('mouseup', handleUp);
                    };
                    window.addEventListener('mousemove', handleMove);
                    window.addEventListener('mouseup', handleUp);
                    handleMove(e.nativeEvent);
                  }}
                >
                  <div className="absolute inset-y-0 left-0 bg-small-orange" style={{ width: `${progress}%` }} />
                </div>
                <span className="font-black text-white/20 text-[9px] w-10">{formatTime(duration)}</span>
              </div>

              {/* Extra Utils (Compact) */}
              <div className="flex items-center gap-4 shrink-0 pr-4">
                 {audioSource === 'VIDEO' && currentVideo && (
                    <button onClick={toggleFullScreen} className="text-white/20 hover:text-white transition-all"><Maximize2 size={16} /></button>
                 )}
                 <button onClick={onOpenChat} className="text-white/20 hover:text-white transition-all"><MessageSquare size={16} /></button>
                 {currentUser && onUpdateUserProfile && (
                    <button
                      onClick={() => onUpdateUserProfile({ customThemeEnabled: userProfile?.customThemeEnabled === false ? true : false })}
                      className={`transition-all ${userProfile?.customThemeEnabled !== false ? 'text-small-orange' : 'text-white/20 hover:text-white'}`}
                      title={userProfile?.customThemeEnabled !== false ? 'Custom Theme On' : 'Custom Theme Off'}
                    >
                      <Sparkles size={16} />
                    </button>
                 )}
                 <button onClick={() => isNanoView ? setIsNanoView(false) : setIsNanoView(true)} className="text-white/20 hover:text-white transition-all">
                    {isNanoView ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                 </button>
              </div>
            </div>
          ) : (
            <>
              {/* Desktop Layout (Existing Full Mode) */}
              {/* Left: Navigation & Track Info */}
              <div className="flex items-center gap-2 lg:gap-4 shrink-0">
                <div className="hidden sm:flex items-center gap-1.5 lg:gap-2">
                  <button 
                    onClick={() => onNavigate?.('DASHBOARD')}
                    className="p-2.5 bg-white/5 hover:bg-white/10 rounded-2xl text-white/40 hover:text-white transition-all focus:ring-2 focus:ring-small-orange outline-none"
                    title="Home / Archive"
                  >
                    <Home size={18} />
                  </button>
                  <button 
                    onClick={() => onNavigate?.('USER_PROFILE')}
                    className="p-1 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/10 transition-all overflow-hidden w-10 h-10 shrink-0 focus:ring-2 focus:ring-small-orange outline-none"
                    title="My Profile"
                  >
                    {currentUser?.photoURL ? (
                      <img src={currentUser.photoURL || null} className="w-full h-full object-cover rounded-xl" />
                    ) : (
                      <UserIcon size={18} className="text-white/40 m-auto" />
                    )}
                  </button>

                  <button 
                    onClick={() => setIsEssentialMode(!isEssentialMode)}
                    className={`px-4 py-2.5 rounded-2xl transition-all font-black uppercase tracking-widest text-[9px] flex items-center gap-2 ${isEssentialMode ? 'bg-small-orange text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
                  >
                    {isEssentialMode ? <Layers size={14} /> : <Box size={14} />}
                    {isEssentialMode ? 'ESSENTIAL' : 'FULL UI'}
                  </button>

                  {!isEssentialMode && (
                    <>
                      <button 
                        onClick={onUpload}
                        className="p-2.5 bg-white/10 hover:bg-white text-black rounded-2xl transition-all shadow-xl group"
                        title="Upload Content"
                      >
                        <Plus size={18} className="text-white group-hover:text-black transition-colors" />
                      </button>
                      <button 
                        onClick={() => onNavigate?.('CREATOR')}
                        className="p-2.5 bg-white text-black hover:bg-small-orange hover:text-white rounded-2xl transition-all shadow-xl"
                        title="Backend / Creator Dashboard"
                      >
                        <Settings size={18} />
                      </button>
                    </>
                  )}

                  {!isEssentialMode && (
                    <>
                      {/* Admin & Sign Out moved to the "other side" (before Sponsored Content) */}
                      {/* Universal Fullscreen Toggle */}
                      <button 
                        onClick={toggleAppFullScreen}
                        className="p-2.5 bg-white/5 hover:bg-white/10 rounded-2xl text-white/40 hover:text-white transition-all"
                        title="Toggle Universal Fullscreen"
                      >
                        <Maximize2 size={18} />
                      </button>

                      {currentUser && (currentUser.email === 'kmoody2003@gmail.com') && (
                        <button 
                          onClick={() => {
                            const event = new CustomEvent('NAVIGATE', { detail: { target: 'ADMIN_DASHBOARD' } });
                            window.dispatchEvent(event);
                          }}
                          className="p-2.5 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white rounded-2xl transition-all shadow-xl"
                          title="System Administration"
                        >
                          <Shield size={18} />
                        </button>
                      )}

                      {currentUser && (
                        <button 
                          onClick={onLogout}
                          className="p-2.5 bg-white/5 hover:bg-red-500/20 rounded-2xl text-white/20 hover:text-red-500 transition-all"
                          title="Sign Out"
                        >
                          <LogOut size={18} />
                        </button>
                      )}

                      <button 
                        onClick={() => onNavigate?.('LIBRARY')}
                        className="p-2.5 bg-white/5 hover:bg-white/10 rounded-2xl text-white/40 hover:text-white transition-all shadow-lg"
                        title="Library"
                      >
                        <Library size={18} />
                      </button>
                    </>
                  )}
                  
                  {/* Theme Control for Essential Mode */}
                  {isEssentialMode && (
                    <div className="flex items-center gap-1 p-1 bg-white/5 rounded-2xl border border-white/5 ml-2">
                        <button onClick={() => setTheme?.('DARK')} className={`p-2 rounded-xl transition-all ${theme === 'DARK' ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}><Moon size={14} /></button>
                        <button onClick={() => setTheme?.('LIGHT')} className={`p-2 rounded-xl transition-all ${theme === 'LIGHT' ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}><Sun size={14} /></button>
                        <button onClick={() => setTheme?.('NEBULA')} className={`p-2 rounded-xl transition-all ${theme === 'NEBULA' ? 'bg-indigo-500 text-white' : 'text-white/40 hover:text-white'}`}><Globe size={14} /></button>
                    </div>
                  )}

                  {!isEssentialMode && (
                    <div className="hidden xl:block w-40 h-14 bg-gradient-to-br from-[#6B0099]/20 to-[#FF8C00]/20 border border-white/5 rounded-xl overflow-hidden relative group shrink-0">
                      <div className="absolute inset-0 flex items-center justify-center p-2 text-center">
                        <p className="text-[6px] font-black uppercase tracking-widest text-white/40 group-hover:text-white transition-colors">Sponsored Content</p>
                      </div>
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-[7px] font-black uppercase tracking-widest text-white">Visit Partner</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Center: Controls & Media Info */}
              <div className={`flex flex-col items-start gap-1 flex-1 max-w-2xl px-4`}>

                <div className="flex items-center gap-4 lg:gap-6">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setIsMiniPlayerActive(!isMiniPlayerActive)}
                      className={`p-1.5 transition-all transform hover:scale-125 ${isMiniPlayerActive ? 'text-small-orange' : 'text-white/20 hover:text-white'}`}
                      title="Toggle Mini Video"
                    >
                      <Tv size={16} />
                    </button>
                    <button 
                      onClick={() => {
                        if (repeatMode === 'OFF') setRepeatMode('ALL');
                        else if (repeatMode === 'ALL') setRepeatMode('ONE');
                        else setRepeatMode('OFF');
                      }}
                      className={`p-1.5 transition-all transform hover:scale-125 ${repeatMode !== 'OFF' ? 'text-small-orange' : 'text-white/20 hover:text-white'}`}
                      title={repeatMode === 'ONE' ? "Repeat One" : repeatMode === 'ALL' ? "Repeat All" : "Repeat Off"}
                    >
                      {repeatMode === 'ONE' ? <Repeat1 size={16} /> : <Repeat size={16} />}
                    </button>
                    <button 
                      onClick={() => onNavigate?.('QUEUE')}
                      className="p-1.5 text-white/20 hover:text-white transition-all transform hover:scale-125"
                      title="Play Queue"
                    >
                      <List size={16} />
                    </button>
                  </div>
                  
                  <div className={`flex items-center gap-4 lg:gap-6`}>
                    <button onClick={prev} className="text-white/40 hover:text-white transition-all focus:outline-none transform hover:scale-110 active:scale-95">
                      <SkipBack size={20} />
                    </button>
                    <button 
                      onClick={isPlaying ? pause : resume}
                      className={`rounded-full bg-white text-black flex items-center justify-center hover:scale-110 transition-all shadow-[0_0_50px_rgba(255,255,255,0.3)] focus:outline-none w-10 h-10`}
                    >
                      {isPlaying ? <Pause size={24} fill="black" /> : <Play size={24} fill="black" className="ml-0.5" />}
                    </button>
                    <button onClick={next} className="text-white/40 hover:text-white transition-all focus:outline-none transform hover:scale-110 active:scale-95">
                      <SkipForward size={20} />
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="relative group">
                      <button 
                         onMouseEnter={() => setShowVolume(true)}
                         className="p-2 text-white/40 hover:text-white transition-all bg-white/5 rounded-xl border border-white/5"
                      >
                        <Volume2 size={16} />
                      </button>
                      <AnimatePresence>
                        {showVolume && (
                          <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            onMouseLeave={() => setShowVolume(false)}
                            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 p-4 bg-theme-card/90 backdrop-blur-2xl border border-white/10 rounded-[2rem] shadow-3xl flex flex-col items-center gap-2 min-w-[120px]"
                          >
                             <span className="text-[8px] font-black uppercase text-white/40 tracking-[0.2em]">Volume</span>
                             <input 
                              type="range" 
                              min="0" max="1" step="0.01" 
                              value={volume} 
                              onChange={(e) => setVolume(parseFloat(e.target.value))}
                              className="w-24 accent-small-orange"
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {isCastAvailable && (
                      <button 
                        onClick={() => isCasting ? stopCasting() : castTrack(currentTrack!)}
                        className={`p-2 rounded-xl transition-all border ${isCasting ? 'text-small-orange bg-small-orange/10 border-small-orange/30' : 'text-white/40 hover:text-white bg-white/5 border-white/5'}`}
                        title={isCasting ? "Stop Casting" : "Cast to Device"}
                      >
                        <Cast size={16} />
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="w-full flex items-center gap-3">
                  <span className="font-black text-white/30 text-right w-8 shrink-0 text-[9px]">{formatTime(currentTime)}</span>
                  {(currentTrack || currentVideo) && (
                    <button
                      onClick={() => onNavigate?.('PLAYER', { album: currentAlbum })}
                      className="shrink-0 min-w-0 max-w-[120px] lg:max-w-[180px] group text-left"
                    >
                      <p className={`font-black uppercase tracking-tight truncate text-white group-hover:text-small-orange transition-colors ${isBigScreen ? 'text-sm' : 'text-[9px]'}`}>
                        {currentTrack?.title || currentVideo?.title || 'Untitled'}
                      </p>
                      <p className={`font-bold text-small-orange uppercase tracking-widest truncate opacity-50 ${isBigScreen ? 'text-[10px]' : 'text-[7px]'}`}>
                        {currentTrack?.artist || currentAlbum?.artist || currentVideo?.artist || ''}
                      </p>
                    </button>
                  )}
                  <div
                    className="flex-1 bg-white/10 rounded-full overflow-hidden cursor-pointer relative h-1 hover:h-1.5 transition-all duration-300 group"
                    onMouseDown={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const handleMove = (me: MouseEvent) => {
                        const x = Math.max(0, Math.min(me.clientX - rect.left, rect.width));
                        seek((x / rect.width) * duration);
                      };
                      const handleUp = () => {
                        window.removeEventListener('mousemove', handleMove);
                        window.removeEventListener('mouseup', handleUp);
                      };
                      window.addEventListener('mousemove', handleMove);
                      window.addEventListener('mouseup', handleUp);
                      handleMove(e.nativeEvent);
                    }}
                  >
                    <div
                      className="absolute inset-y-0 left-0 bg-small-orange shadow-[0_0_12px_rgba(255,140,0,0.4)]"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="font-black text-white/30 w-8 shrink-0 text-[9px]">{formatTime(duration || 0)}</span>
                </div>
              </div>

              {/* Right: Personal Hub & Utilities */}
              <div className="flex items-center gap-3 lg:gap-4 shrink-0 transition-all duration-700">
                {/* Theme Selector (Condensed) */}
                {setTheme && !isEssentialMode && (
                  <div className="relative">
                    <button 
                      onClick={() => setShowThemeGallery(!showThemeGallery)}
                      className={`p-3 rounded-2xl bg-white/5 border border-white/10 text-white/40 hover:text-white hover:bg-white/10 transition-all shadow-lg flex items-center justify-center ${showThemeGallery ? 'bg-small-orange/20 text-small-orange border-small-orange/30' : ''}`}
                      title="Theme Gallery"
                    >
                      <Palette size={20} />
                    </button>

                    <AnimatePresence>
                      {showThemeGallery && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          className="absolute bottom-full right-0 mb-4 w-72 bg-theme-card/90 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] shadow-3xl overflow-hidden z-[120]"
                        >
                          <div className="p-6 border-b border-white/5">
                            <h3 className="text-xs font-black uppercase tracking-widest text-white/40">Theme Gallery</h3>
                          </div>
                          <div className="p-4 grid grid-cols-3 gap-3">
                            {[
                              { id: 'DARK', label: 'Dark', icon: Moon, color: 'bg-zinc-900' },
                              { id: 'LIGHT', label: 'Light', icon: Sun, color: 'bg-white' },
                              { id: 'NEBULA', label: 'Nebula', icon: Globe, color: 'bg-indigo-600' },
                              { id: 'PASTEL', label: 'Pastel', icon: Palette, color: 'bg-[#ffb7b2]' },
                              { id: 'CITRUS', label: 'Citrus', icon: Palette, color: 'bg-[#FF3B00]' },
                              { id: 'PLAJAH', label: 'Plajah', icon: Sparkles, color: 'bg-gradient-to-br from-[#6B0099] to-[#FF8C00]' },
                              { id: 'BIG_SCREEN', label: 'TV', icon: Tv, color: 'bg-blue-600' },
                              { id: 'PHONE', label: 'Phone', icon: Smartphone, color: 'bg-small-orange' },
                            ].map(t => (
                              <button 
                                key={t.id}
                                onClick={() => {
                                  setTheme(t.id as any);
                                  setShowThemeGallery(false);
                                }}
                                className={`flex flex-col items-center gap-2 p-3 rounded-2xl transition-all border ${theme === t.id ? 'bg-white/10 border-white/20' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                              >
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg ${t.color} ${theme === t.id ? 'scale-110' : ''}`}>
                                  <t.icon size={18} className={t.id === 'DARK' || t.id === 'BIG_SCREEN' || t.id === 'PLAJAH' || t.id === 'PHONE' ? 'text-white' : 'text-black'} />
                                </div>
                                <span className={`text-[8px] font-black uppercase tracking-widest ${theme === t.id ? 'text-white' : 'text-white/40'}`}>{t.label}</span>
                              </button>
                            ))}
                          </div>
                          <div className="p-4 bg-white/5 text-center">
                            <p className="text-[7px] font-black uppercase tracking-widest text-white/20">Select an Interface Aesthetic</p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* Enhancement Toggles (Grouped) */}
                {!isEssentialMode && (
                  <div className="flex items-center gap-1.5 p-1.5 bg-black/40 rounded-2xl border border-white/5">
                     <button
                      onClick={() => setIsFrequencyVisualizerEnabled(!isFrequencyVisualizerEnabled)}
                      className={`p-2 rounded-xl transition-all ${isFrequencyVisualizerEnabled ? 'text-small-orange bg-small-orange/20' : 'text-white/20 hover:text-white'}`}
                      title="FX"
                    >
                      <Activity size={16} />
                    </button>
                    <button
                      onClick={() => setIsThreeDEnabled(!isThreeDEnabled)}
                      className={`p-2 rounded-xl transition-all ${isThreeDEnabled ? 'text-small-orange bg-small-orange/20' : 'text-white/20 hover:text-white'}`}
                      title="3D Mode"
                    >
                      <Box size={16} />
                    </button>
                    <button
                      onClick={() => setIsMinimized(!isMinimized)}
                      className={`p-1.5 rounded-xl transition-all hover:scale-110 active:scale-95 ${isMinimized ? 'opacity-50' : 'opacity-100'}`}
                      title={isMinimized ? 'Show Player Controls' : 'Hide Player Controls'}
                    >
                      <Logo size={16} />
                    </button>
                    {((currentAlbum?.slideshow && currentAlbum.slideshow.length > 0) || (currentTrack?.images && currentTrack.images.length > 0)) && (
                      <button
                        onClick={() => setIsSlideshowActive(!isSlideshowActive)}
                        className={`p-2 rounded-xl transition-all ${isSlideshowActive ? 'text-small-orange bg-small-orange/20' : 'text-white/20 hover:text-white'}`}
                        title="Slideshow"
                      >
                        <Layers size={16} />
                      </button>
                    )}
                    {currentUser && onUpdateUserProfile && (
                      <button
                        onClick={() => onUpdateUserProfile({ customThemeEnabled: userProfile?.customThemeEnabled === false ? true : false })}
                        className={`p-2 rounded-xl transition-all ${userProfile?.customThemeEnabled !== false ? 'text-small-orange bg-small-orange/20' : 'text-white/20 hover:text-white'}`}
                        title={userProfile?.customThemeEnabled !== false ? 'Custom Theme On' : 'Custom Theme Off'}
                      >
                        <Sparkles size={16} />
                      </button>
                    )}
                  </div>
                )}

                {!isEssentialMode && <div className="h-8 w-px bg-white/5 mx-1" />}

                {!isEssentialMode && (
                  <>
                    <button 
                      onClick={onOpenChat}
                      className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl text-white/40 hover:text-white transition-all shadow-lg"
                      title="Messages"
                    >
                      <MessageSquare size={18} />
                    </button>

                    <button 
                      onClick={() => onOpenAchievements?.()}
                      className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl text-white/40 hover:text-white transition-all shadow-lg"
                      title="Trophy Cabinet"
                    >
                      <Trophy size={18} />
                    </button>
                  </>
                )}

                <div className="flex items-center gap-2 pl-2">
                  <button onClick={() => setIsNanoView?.(!isNanoView)} className="p-2 text-white/20 hover:text-white hover:bg-white/5 rounded-xl transition-all" title="Nano">
                    {isNanoView ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                  </button>
                  
                  {(currentTrack || currentVideo) && (
                    <div className="relative ml-2">
                      <motion.button 
                        onClick={() => setIsPlaylistExpanded(!isPlaylistExpanded)}
                        className={`relative rounded-2xl overflow-hidden shadow-3xl border border-white/20 flex-shrink-0 transition-all duration-500 hover:scale-105 active:scale-95 ${isBigScreen ? 'w-24 h-24' : 'w-14 h-14'}`}
                        title="Up Next"
                      >
                        <ThreeDImage 
                          src={(currentTrack ? (currentTrack.albumCover || currentAlbum?.coverImage) : (currentVideo?.thumbnailUrl || 'https://picsum.photos/seed/video/200/200')) || null} 
                          alt={currentTrack?.title || currentVideo?.title} 
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity">
                          <ChevronUp size={24} className={`text-white transition-transform ${isPlaylistExpanded ? 'rotate-180' : ''}`} />
                        </div>
                      </motion.button>

                    <AnimatePresence>
                      {isPlaylistExpanded && (
                        <motion.div 
                          initial={{ opacity: 0, y: 20, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 20, scale: 0.95 }}
                          className="absolute bottom-full right-0 mb-6 w-80 bg-theme-card/60 backdrop-blur-3xl border border-white/10 rounded-[2rem] shadow-3xl overflow-hidden z-[110]"
                        >
                          <div className="p-6 border-b border-white/5 flex items-center justify-between">
                            <h5 className="text-[10px] font-black uppercase tracking-widest text-white/40">Up Next</h5>
                            <button onClick={() => setIsPlaylistExpanded(false)} className="text-white/20 hover:text-white"><X size={14} /></button>
                          </div>
                          <div className="max-h-96 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                            {(currentAlbum?.tracks || []).map((track, idx) => (
                              <button 
                                key={track.id}
                                onClick={() => {
                                  playTrack(track, currentAlbum, 'LIBRARY');
                                  setIsPlaylistExpanded(false);
                                }}
                                className={`w-full flex items-center gap-4 p-3 rounded-xl transition-all ${track.id === currentTrack.id ? 'bg-white/10' : 'hover:bg-white/5'}`}
                              >
                                <span className="text-[10px] font-black text-white/20 w-4">{idx + 1}</span>
                                <div className="flex-1 text-left min-w-0">
                                  <p className={`text-xs font-bold uppercase tracking-wide truncate ${track.id === currentTrack.id ? 'text-small-orange' : 'text-white'}`}>{track.title}</p>
                                  <p className="text-[9px] font-medium text-white/30 uppercase tracking-widest truncate">{track.artist || currentAlbum?.artist}</p>
                                </div>
                                {track.id === currentTrack.id && <div className="w-1.5 h-1.5 rounded-full bg-small-orange" />}
                              </button>
                            ))}
                            {(!currentAlbum?.tracks || currentAlbum.tracks.length === 0) && (
                              <div className="py-8 text-center opacity-20">
                                <Music size={24} className="mx-auto mb-2" />
                                <p className="text-[8px] font-black uppercase tracking-widest">No other tracks in queue</p>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
                </div>
              </div>
            </>
          )}
        </div>
      </motion.div>
    <AnimatePresence>
      {isSlideshowActive && !isNanoView && currentAlbum?.slideshow && currentAlbum.slideshow.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] bg-black/95 flex flex-col items-center justify-center p-12"
        >
          <button 
            onClick={() => setIsSlideshowActive(false)}
            className="absolute top-12 right-12 p-4 bg-white/5 hover:bg-white/10 rounded-full text-white/40 hover:text-white transition-all z-[130]"
          >
            <X size={32} />
          </button>

          <div className="w-full max-w-5xl aspect-square lg:aspect-video relative rounded-[3rem] overflow-hidden shadow-2xl border border-white/10">
            <Slideshow images={currentAlbum.slideshow} />
            
            {/* Shrunken Album Art in Lower Right for full mode slideshow */}
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="absolute bottom-12 right-12 w-32 h-32 rounded-3xl overflow-hidden border-2 border-white/20 shadow-2xl z-[140] pointer-events-none"
            >
              <img 
                src={currentTrack?.albumCover || currentAlbum?.coverImage || null} 
                alt="Cover Art" 
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            </motion.div>

            <div className="absolute bottom-12 left-12 flex flex-col items-center gap-4 bg-black/40 backdrop-blur-xl px-12 py-6 rounded-full border border-white/10">
              <h2 className="text-2xl font-black uppercase tracking-tightest">{currentTrack?.title || 'Unknown Track'}</h2>
              <div className="flex items-center gap-6">
                 <button onClick={prev} className="text-white/40 hover:text-white"><SkipBack size={24} /></button>
                 <button 
                  onClick={isPlaying ? pause : resume}
                  className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center shadow-xl hover:scale-110 transition-transform"
                 >
                  {isPlaying ? <Pause size={32} fill="black" /> : <Play size={32} fill="black" className="ml-2" />}
                 </button>
                 <button onClick={next} className="text-white/40 hover:text-white"><SkipForward size={24} /></button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* ── Music Video Overlay ────────────────────────────────────────────── */}
    <AnimatePresence>
      {showMusicVideo && currentTrack?.videoUrl && (
        <motion.div
          initial={{ opacity: 0, y: '100%' }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 260 }}
          className="fixed inset-0 z-[120] bg-black flex flex-col"
        >
          {/* Header bar */}
          <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-5 pt-safe-top pt-4 pb-3 bg-gradient-to-b from-black/80 to-transparent">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.4em] text-white/40">Music Video</p>
              <h3 className="text-sm font-black uppercase tracking-tight text-white">{currentTrack.title}</h3>
            </div>
            <button onClick={closeMusicVideo} className="p-2 rounded-full bg-black/40 text-white/60 hover:text-white">
              <X size={20} />
            </button>
          </div>

          {/* Video */}
          <video
            ref={el => {
              if (el && musicVideoRef.current && el !== musicVideoRef.current) {
                el.src = currentTrack.videoUrl!;
                el.currentTime = musicVideoRef.current.currentTime;
                el.play().catch(() => {});
              }
              if (el) musicVideoRef.current = el;
            }}
            className="w-full h-full object-contain"
            controls
            playsInline
            autoPlay
            onEnded={closeMusicVideo}
          />
        </motion.div>
      )}
    </AnimatePresence>
    </div>
  );
};

const Slideshow: React.FC<{ images: string[] }> = ({ images }) => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex(prev => (prev + 1) % images.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [images.length]);

  return (
    <div className="w-full h-full relative">
      <AnimatePresence mode="wait">
          <motion.img 
            key={index}
            src={images[index] || null}
            initial={{ opacity: 0, scale: 1.15, filter: 'blur(20px)' }}
            animate={{ opacity: 1, scale: 1.05, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.95, filter: 'blur(20px)' }}
            transition={{ duration: 3, ease: "circOut" }}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
      </AnimatePresence>
      <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60" />
    </div>
  );
}

export default GlobalPlayer;
