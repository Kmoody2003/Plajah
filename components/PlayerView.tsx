import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Album, Track, Comment } from '../types';
import Visualizer from './Visualizer';
import AnimatedSlideshow from './AnimatedSlideshow';
import Logo from './Logo';
import { publishToCloud, postComment, subscribeToComments, updateAlbum } from '../services/backendService';
import { generateTimeCodedCaptions } from '../services/geminiService';
import { useGlobalPlayerState, useGlobalPlayerProgress } from '../contexts/GlobalPlayerContext';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, Pause, ArrowLeft, Disc, Globe, 
  Copy, Check, X, Loader2, Cloud, Sparkles, Share2, Link as LinkIcon,
  Twitter, Facebook, Linkedin, ExternalLink, Zap,
  Instagram, Youtube, Mail,
  Layers, Music2, Plus, MessageSquare, Send, User, Clock, Activity, BookOpen, ChevronDown, ChevronUp, Image as ImageIcon,
  AlertCircle, Video, Radio, List, HeartHandshake, Heart, Pen, Maximize2
} from 'lucide-react';

import { User as FirebaseUser } from 'firebase/auth';
import DonationModal from './DonationModal';
import GlobalPhotosView from './GlobalPhotosView';
import CommentSection from './CommentSection';
import The411 from './The411';
import { LyricItem, TimeCodedLyrics } from './LyricItem';

type RepeatMode = 'NONE' | 'ONE' | 'ALL';

/**
 * ANIMATED SLIDESHOW COMPONENT
 */
const AtmosphericBackground: React.FC<{ album: Album; analyser: AnalyserNode | null; isPlaying: boolean; simplified?: boolean }> = ({ album, analyser, isPlaying, simplified }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const [imgCorsError, setImgCorsError] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Performance optimization for TV: skip if not playing or if simplified
    if (simplified && !isPlaying) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const img = new Image();
    img.src = album.coverImage;
    if (!imgCorsError) {
      img.crossOrigin = "anonymous";
    }

    img.onerror = () => {
      if (!imgCorsError) {
        setImgCorsError(true);
      }
    };

    const dataArray = new Uint8Array(analyser?.frequencyBinCount || 1024);
    let offset = 0;

    const render = () => {
      // Throttle render for TV performance
      if (simplified) {
        animationRef.current = requestAnimationFrame(() => {
          setTimeout(render, 33); // Cap to ~30fps for TV stability
        });
      } else {
        animationRef.current = requestAnimationFrame(render);
      }
      
      if (analyser) analyser.getByteFrequencyData(dataArray);

      const width = (canvas.width = window.innerWidth / (simplified ? 2 : 1));
      const height = (canvas.height = window.innerHeight / (simplified ? 2 : 1));

      let bass = 0;
      for (let i = 0; i < 10; i++) bass += dataArray[i];
      bass = (bass / 10) / 255;

      ctx.clearRect(0, 0, width, height);
      
      if (img.complete && img.naturalWidth > 0) {
        ctx.save();
        // TV optimization: use simpler filter or no filter if simplified
        if (simplified) {
          ctx.globalAlpha = 0.2;
        } else {
          ctx.filter = `blur(40px) contrast(0.9) saturate(1.1)`;
          ctx.globalAlpha = 0.4;
        }
        
        offset += 0.0003;
        const driftX = Math.sin(offset) * 60;
        const driftY = Math.cos(offset * 1.2) * 60;
        const scale = 1.3;
        
        ctx.drawImage(img, (width - width*scale)/2 + driftX, (height - height*scale)/2 + driftY, width*scale, height*scale);
        ctx.restore();
      }

      // Darken and Vignette for better UI contrast
      const grad = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, Math.max(width, height) * 1.1);
      grad.addColorStop(0, 'rgba(0,0,0,0.3)');
      grad.addColorStop(0.5, 'rgba(0,0,0,0.5)');
      grad.addColorStop(1, 'rgba(0,0,0,0.7)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
      
      // Add a subtle noise texture for that "frosted" look - skip for TV
      if (!simplified) {
        ctx.globalAlpha = 0.03;
        for (let i = 0; i < 100; i++) {
          const x = Math.random() * width;
          const y = Math.random() * height;
          const size = Math.random() * 2;
          ctx.fillStyle = 'white';
          ctx.fillRect(x, y, size, size);
        }
        ctx.globalAlpha = 1.0;
      }
    };

    render();
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [album, analyser, isPlaying, simplified, imgCorsError]);

  return <canvas ref={canvasRef} className={`fixed inset-0 w-full h-full pointer-events-none z-0 ${simplified ? 'opacity-20 scale-110 blur-xl' : 'opacity-40'}`} />;
};

const HUDCommentModule: React.FC<{ album: Album; trackId: string | null; videoId?: string | null; isPublic: boolean; themeColor: string; user: FirebaseUser | null; minimal?: boolean; onVisitUser?: (uid: string) => void; onUpdate?: (album: Album) => void }> = ({ album, trackId, videoId = null, isPublic, themeColor, user, minimal, onVisitUser, onUpdate }) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [isOpen, setIsOpen] = useState(!minimal);
  const [activeTab, setActiveTab] = useState<'COMMENTS' | 'STICKY'>('COMMENTS');
  const [newSticky, setNewSticky] = useState('');
  
  const isOwner = user?.uid === album.ownerId;
  const currentTrack = album.tracks.find(t => t.id === trackId);

  useEffect(() => {
    const unsubscribe = subscribeToComments(album.id, trackId, videoId, setComments);
    return () => unsubscribe();
  }, [album.id, trackId, videoId]);

  const handlePost = async (text: string, parentId?: string) => {
    if (!text.trim()) return;
    await postComment(album.id, { 
      author: user?.displayName || 'LISTENER', 
      text, 
      timestamp: Date.now(), 
      trackId: videoId ? undefined : (trackId || 'album'),
      videoId: videoId || undefined,
      parentId: parentId || undefined
    });
  };

  const handleAddSticky = async () => {
    if (!newSticky.trim() || !trackId || !onUpdate) return;
    
    const updatedTracks = album.tracks.map(t => {
      if (t.id === trackId) {
        return {
          ...t,
          artistNotes: [...(t.artistNotes || []), newSticky.trim()]
        };
      }
      return t;
    });

    const updatedAlbum = { ...album, tracks: updatedTracks };
    await updateAlbum(album.id, updatedAlbum);
    onUpdate(updatedAlbum);
    setNewSticky('');
  };

  const handleRemoveSticky = async (idx: number) => {
    if (!trackId || !onUpdate) return;

    const updatedTracks = album.tracks.map(t => {
      if (t.id === trackId) {
        const notes = [...(t.artistNotes || [])];
        notes.splice(idx, 1);
        return { ...t, artistNotes: notes };
      }
      return t;
    });

    const updatedAlbum = { ...album, tracks: updatedTracks };
    await updateAlbum(album.id, updatedAlbum);
    onUpdate(updatedAlbum);
  };

  if (!isOpen && minimal) {
    return (
      <button onClick={() => setIsOpen(true)} className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white transition-all py-4">
        <MessageSquare size={14} /> Open Comments ({comments.length})
        {currentTrack?.artistNotes && currentTrack.artistNotes.length > 0 && (
          <span className="flex items-center gap-1 text-small-orange">
            <Zap size={10} /> {currentTrack.artistNotes.length} Notes
          </span>
        )}
      </button>
    );
  }

  return (
    <div className={`flex flex-col h-full font-sans transition-all duration-500 animate-in slide-in-from-top-4`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-4">
          <button 
            onClick={() => setActiveTab('COMMENTS')}
            className={`text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'COMMENTS' ? 'text-small-orange' : 'text-white/20 hover:text-white'}`}
          >
            Feed
          </button>
          <button 
            onClick={() => setActiveTab('STICKY')}
            className={`text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'STICKY' ? 'text-small-orange' : 'text-white/20 hover:text-white'}`}
          >
            Sticky Notes {currentTrack?.artistNotes?.length ? `(${currentTrack.artistNotes.length})` : ''}
          </button>
        </div>
        {minimal && (
          <button onClick={() => setIsOpen(false)}><ChevronUp size={16} className="text-white/20" /></button>
        )}
      </div>

      <div className={minimal ? 'max-h-[400px]' : 'h-full flex-1 overflow-hidden'}>
        {activeTab === 'COMMENTS' ? (
          <CommentSection 
            comments={comments}
            onPostComment={handlePost}
            onVisitUser={onVisitUser}
            currentUser={user}
            themeColor={themeColor}
            title={minimal ? "Quick Feed" : "Global Discussion"}
            onClose={() => setIsOpen(false)}
          />
        ) : (
          <div className="h-full flex flex-col gap-4 overflow-y-auto custom-scrollbar">
            {isOwner && (
              <div className="p-4 bg-white/5 border border-white/10 rounded-2xl space-y-4">
                <span className="text-[10px] font-black uppercase tracking-widest text-small-orange">Leave a context note</span>
                <textarea 
                  value={newSticky}
                  onChange={(e) => setNewSticky(e.target.value)}
                  placeholder="Share the vibe or background behind this track..."
                  className="w-full bg-transparent border-none outline-none text-xs font-bold p-0 resize-none h-20 placeholder:text-white/10"
                />
                <button 
                  onClick={handleAddSticky}
                  disabled={!newSticky.trim()}
                  className="w-full py-3 bg-white text-black rounded-xl text-[9px] font-black uppercase tracking-widest disabled:opacity-30 transition-all hover:bg-small-orange hover:text-white"
                >
                  Post Sticky Note
                </button>
              </div>
            )}
            
            <div className="space-y-3">
              {currentTrack?.artistNotes?.map((note, idx) => (
                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  key={idx} 
                  className="p-5 bg-gradient-to-br from-white/10 to-white/5 border border-white/10 rounded-3xl relative group"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles size={12} className="text-small-orange" />
                    <span className="text-[8px] font-black uppercase tracking-[0.3em] text-white/40">Artist Insight</span>
                  </div>
                  <p className="text-xs font-bold leading-relaxed tracking-wide text-white/80">{note}</p>
                  
                  {isOwner && (
                    <button 
                      onClick={() => handleRemoveSticky(idx)}
                      className="absolute top-4 right-4 p-2 bg-white/5 hover:bg-red-500/20 text-white/10 hover:text-red-500 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                    >
                      <X size={12} />
                    </button>
                  )}
                </motion.div>
              ))}
              
              {(!currentTrack?.artistNotes || currentTrack.artistNotes.length === 0) && (
                <div className="py-20 text-center space-y-4 opacity-20">
                  <Zap size={32} className="mx-auto" />
                  <p className="text-[10px] font-black uppercase tracking-widest">No artist notes for this track yet.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface PlayerViewProps {
  album: Album;
  onBack: () => void;
  onEdit?: (album: Album) => void;
  onUpdate?: (album: Album) => void;
  onPurchase?: (item: any, isAlbum: boolean) => void;
  onVisitUser?: (uid: string) => void;
  isPublic?: boolean;
  isPreview?: boolean;
  user: FirebaseUser | null;
}

const PlayerView: React.FC<PlayerViewProps> = ({ 
  album, 
  onBack, 
  onEdit, 
  onUpdate, 
  onPurchase,
  onVisitUser,
  isPublic = false, 
  isPreview = false, 
  user 
}) => {
  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const { 
    currentTrack: globalTrack, 
    isPlaying: globalIsPlaying, 
    volume: globalVolume,
    playTrack,
    playVideo,
    pause,
    resume,
    setVolume,
    togglePlay,
    analyser: globalAnalyser,
    isSlideshowActive,
    setIsSlideshowActive,
    setVideoElement,
    setYtPlayer,
    isTVMode,
    setIsTVMode,
    clearMedia
  } = useGlobalPlayerState();
  const { currentTime: globalCurrentTime, duration: globalDuration, seek } = useGlobalPlayerProgress();

  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [activeHUD, setActiveHUD] = useState<'INFO' | 'COMMENTS' | 'TRACKS' | 'ABOUT' | 'MEDIA' | 'LYRICS'>('TRACKS');
  const [isFlipped, setIsFlipped] = useState(false);
  const [isTracksCollapsed, setIsTracksCollapsed] = useState(false);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [showCaptions, setShowCaptions] = useState(true);
  const [isGeneratingCaptions, setIsGeneratingCaptions] = useState(false);
  const [corsError, setCorsError] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  
  const [comments, setComments] = useState<Comment[]>([]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState({ text: '', percent: 0 });
  const [publicUrl, setPublicUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [isDonationModalOpen, setIsDonationModalOpen] = useState(false);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const handleResize = () => { clearTimeout(t); t = setTimeout(() => setIsMobile(window.innerWidth < 1024), 150); };
    window.addEventListener('resize', handleResize, { passive: true });
    return () => { window.removeEventListener('resize', handleResize); clearTimeout(t); };
  }, []);

  const currentTrack = album?.tracks?.[currentTrackIndex] || null;
  const isOwner = user && album.ownerId === user.uid;

  useEffect(() => {
    const unsubscribe = subscribeToComments(album.id, currentTrack?.id || null, null, setComments);
    return () => unsubscribe();
  }, [album.id, currentTrack?.id]);

  const scrollingText = comments.length > 0 
    ? comments.map(c => `${c.author}: ${c.text}`).join(" • ")
    : album.description || "Liner notes unavailable";

  // Sync with global player if it's playing a track from THIS album
  useEffect(() => {
    if (globalTrack && album.tracks.some(t => t.id === globalTrack.id)) {
      const index = album.tracks.findIndex(t => t.id === globalTrack.id);
      if (index !== -1) setCurrentTrackIndex(index);
    }
  }, [globalTrack, album.tracks]);

  useEffect(() => {
    setCorsError(false);
  }, [currentTrackIndex]);

  useEffect(() => {
    if (album.id) {
      setPublicUrl(`${window.location.origin}/?type=album&id=${album.id}${activeVideoId ? `&video=${activeVideoId}` : (currentTrack?.id ? `&track=${currentTrack.id}` : '')}`);
    }
  }, [album.id, activeVideoId, currentTrack?.id]);

  const handlePublish = async () => {
    setIsPublishing(true);
    try {
      const publishedAlbum = await publishToCloud(album, (text, percent) => { setPublishStatus({ text, percent }); });
      const albumUrl = `${window.location.origin}/?type=album&id=${publishedAlbum.id}${activeVideoId ? `&video=${activeVideoId}` : (currentTrack?.id ? `&track=${currentTrack.id}` : '')}`;
      setPublicUrl(albumUrl);
    } catch (err) { console.error("Cloud uplink error:", err); } finally { setIsPublishing(false); }
  };

  const handleGenerateCaptions = async () => {
    if (!currentTrack.url || isGeneratingCaptions) return;
    
    setIsGeneratingCaptions(true);
    try {
      // 1. Fetch audio as blob
      const response = await fetch(currentTrack.url);
      const blob = await response.blob();
      
      // 2. Convert to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
      });
      reader.readAsDataURL(blob);
      const base64 = await base64Promise;
      
      // 3. Generate captions
      const captions = await generateTimeCodedCaptions(base64, blob.type, currentTrack.title, album.artist);
      
      if (captions && captions.length > 0) {
        // 4. Update album locally and in cloud
        const updatedTracks = [...album.tracks];
        updatedTracks[currentTrackIndex] = {
          ...currentTrack,
          timeCodedLyrics: captions
        };
        
        const updatedAlbum = { ...album, tracks: updatedTracks };
        
        if (!isPreview) {
          await updateAlbum(album.id, { tracks: updatedTracks });
        }
        
        onUpdate?.(updatedAlbum);
      }
    } catch (error) {
      console.error("Failed to generate captions:", error);
    } finally {
      setIsGeneratingCaptions(false);
    }
  };

  const getCurrentCaption = () => {
    if (!currentTrack) return "...";
    if (currentTrack.timeCodedLyrics && currentTrack.timeCodedLyrics.length > 0) {
      // Find the caption that matches the current time
      const activeCaption = [...currentTrack.timeCodedLyrics]
        .reverse()
        .find(c => c.time <= globalCurrentTime);
      return activeCaption ? activeCaption.text : "...";
    }
    
    if (currentTrack.lyrics) {
      const lines = currentTrack.lyrics.split('\n');
      return lines[Math.floor((globalCurrentTime / (globalDuration || 1)) * lines.length)] || "...";
    }
    
    return "...";
  };

  const isCurrentTrackGlobal = globalTrack?.id === currentTrack?.id;
  const activeVideo = album.musicVideos?.find(v => v.id === activeVideoId);
  const ytPlayerRef = useRef<any>(null);
  const ytContainerId = useRef(`yt-player-${Math.random().toString(36).substr(2, 9)}`);

  // YouTube API initialization and handling
  useEffect(() => {
    if (!activeVideoId) {
      setYtPlayer(null);
      return;
    }
    
    const video = album.musicVideos?.find(v => v.id === activeVideoId);
    if (!video) return;
    
    const isYoutube = video.url.includes('youtube.com') || video.url.includes('youtu.be');
    if (!isYoutube) return;

    let vId = '';
    if (video.url.includes('v=')) {
      vId = video.url.split('v=')[1]?.split('&')[0];
    } else {
      vId = video.url.split('/').pop() || '';
    }
    
    if (!vId || vId.length < 5) {
      console.warn("Invalid YouTube ID extracted:", vId);
      return;
    }

    const initPlayer = () => {
      if (document.getElementById(ytContainerId.current)) {
        try {
          if (ytPlayerRef.current && typeof ytPlayerRef.current.loadVideoById === 'function') {
            ytPlayerRef.current.loadVideoById(vId);
          } else {
            if (ytPlayerRef.current && typeof ytPlayerRef.current.destroy === 'function') {
              ytPlayerRef.current.destroy();
              ytPlayerRef.current = null;
            }

            ytPlayerRef.current = new (window as any).YT.Player(ytContainerId.current, {
              height: '100%',
              width: '100%',
              videoId: vId,
              playerVars: {
                autoplay: 1,
                controls: 0,
                modestbranding: 1,
                rel: 0,
                showinfo: 0,
                iv_load_policy: 3,
                fs: 0
              },
              events: {
                onReady: (event: any) => {
                  setYtPlayer(event.target);
                  event.target.playVideo();
                }
              }
            });
          }
        } catch (e) {
          console.error("YouTube Player initialization failed:", e);
        }
      } else {
        console.warn("YT container not found for init:", ytContainerId.current);
      }
    };

    if (!(window as any).YT || !(window as any).YT.Player) {
      if (!document.getElementById('youtube-api-script')) {
        const tag = document.createElement('script');
        tag.id = 'youtube-api-script';
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
      }
      
      const checkYt = setInterval(() => {
        if ((window as any).YT && (window as any).YT.Player) {
          clearInterval(checkYt);
          initPlayer();
        }
      }, 100);
      
      return () => clearInterval(checkYt);
    } else {
      initPlayer();
    }

    return () => {
      if (ytPlayerRef.current) {
        ytPlayerRef.current.destroy();
        ytPlayerRef.current = null;
        setYtPlayer(null);
      }
    };
  }, [activeVideoId, album.musicVideos, setYtPlayer]);

  const getAutoplayUrl = (url: string) => {
    if (!url) return '';
    const isYoutube = url.includes('youtube.com') || url.includes('youtu.be');
    const isVimeo = url.includes('vimeo.com');
    
    try {
      const urlObj = new URL(url);
      if (isYoutube) {
        urlObj.searchParams.set('autoplay', '1');
      } else if (isVimeo) {
        urlObj.searchParams.set('autoplay', '1');
      }
      return urlObj.toString();
    } catch (e) {
      if (isYoutube) return `${url}${url.includes('?') ? '&' : '?'}autoplay=1`;
      if (isVimeo) return `${url}${url.includes('?') ? '&' : '?'}autoplay=1`;
      return url;
    }
  };

  if (isMobile && !isTVMode) {
    return (
      <div className="h-[100dvh] bg-transparent text-primary overflow-hidden relative selection:bg-white selection:text-black font-sans flex flex-col">
        {/* Mobile Atmospheric Background — blurred artwork at 60%, fades into app bg at bottom */}
        <div className="fixed inset-0 z-0 pointer-events-none">
          <img
            src={activeVideo?.coverImageUrl || album.coverImage || undefined}
            alt=""
            className="w-full h-full object-cover scale-110 blur-[40px] opacity-60 transition-all duration-1000"
            referrerPolicy="no-referrer"
          />
          {/* Fade into background towards the bottom */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/20 to-black/70" />
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/50 to-transparent" />
        </div>

        {/* Mobile Header */}
        <header className="p-4 flex items-center justify-between bg-white/5 backdrop-blur-xl border-b border-white/5 z-50">
          <button onClick={onBack} className="p-2 text-white/40 hover:text-white transition-all">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 text-center min-w-0 px-4">
            <h1 className="text-xs font-black uppercase tracking-widest truncate">{album.title}</h1>
            <p className="text-[8px] font-bold text-small-orange uppercase tracking-[0.3em] truncate">{album.artist}</p>
          </div>
          <button onClick={() => setShowShareModal(true)} className="p-2 text-white/40 hover:text-white transition-all">
            <Share2 size={20} />
          </button>
        </header>

        {/* Top Media Section (Shared Placement for Cover Art & Video) */}
        <div id="mobile-video-container" className="relative w-full flex-1 bg-transparent overflow-hidden border-b border-white/5 z-10">
          {activeVideoId ? (
            <div className="w-full h-full animate-in fade-in duration-500">
              {(() => {
                const video = album.musicVideos?.find(v => v.id === activeVideoId);
                if (!video) return null;
                const isYoutube = video.url.includes('youtube.com') || video.url.includes('youtu.be');
                const isVimeo = video.url.includes('vimeo.com');
                let embedUrl = video.url;
                if (isYoutube) {
                  return (
                    <div className="w-full h-full relative">
                      <div id={ytContainerId.current} className="w-full h-full" />
                      <button 
                        onClick={() => {
                          setActiveVideoId(null);
                          clearMedia();
                        }}
                        className="absolute top-4 right-4 p-2 bg-black/60 backdrop-blur-md rounded-full text-white/40 hover:text-white z-20"
                      >
                        <X size={16} />
                      </button>
                      <button 
                        onClick={() => {
                          const container = document.getElementById('mobile-video-container');
                          if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
                            if (document.exitFullscreen) document.exitFullscreen();
                            else if ((document as any).webkitExitFullscreen) (document as any).webkitExitFullscreen();
                          } else if (container) {
                            if (container.requestFullscreen) container.requestFullscreen();
                            else if ((container as any).webkitRequestFullscreen) (container as any).webkitRequestFullscreen();
                          }
                        }}
                        className="absolute bottom-4 right-4 p-2 bg-black/60 backdrop-blur-md rounded-full text-white/40 hover:text-white z-20"
                      >
                        <Maximize2 size={16} />
                      </button>
                    </div>
                  );
                } else if (isVimeo) {
                  const vid = video.url.split('/').pop();
                  embedUrl = `https://player.vimeo.com/video/${vid}?autoplay=1`;
                }
                return (
                  <div className="w-full h-full relative">
                    {isVimeo ? (
                      <iframe src={embedUrl} className="w-full h-full" allow="autoplay; fullscreen" allowFullScreen />
                    ) : (
                      <video 
                        ref={setVideoElement}
                        src={video.url || undefined} 
                        playsInline
                        autoPlay 
                        className="w-full h-full object-contain cursor-pointer" 
                        onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                      />
                    )}
                    <button 
                      onClick={() => {
                        setActiveVideoId(null);
                        clearMedia();
                      }}
                      className="absolute top-4 right-4 p-2 bg-black/60 backdrop-blur-md rounded-full text-white/40 hover:text-white z-20"
                    >
                      <X size={16} />
                    </button>
                    <button 
                      onClick={() => {
                        const container = document.getElementById('mobile-video-container');
                        if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
                          if (document.exitFullscreen) document.exitFullscreen();
                          else if ((document as any).webkitExitFullscreen) (document as any).webkitExitFullscreen();
                        } else if (container) {
                          if (container.requestFullscreen) container.requestFullscreen();
                          else if ((container as any).webkitRequestFullscreen) (container as any).webkitRequestFullscreen();
                        }
                      }}
                      className="absolute bottom-4 right-4 p-2 bg-black/60 backdrop-blur-md rounded-full text-white/40 hover:text-white z-20"
                    >
                      <Maximize2 size={16} />
                    </button>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="w-full h-full relative text-left block">
              <img 
                src={album.coverImage} 
                alt={album.title} 
                className="w-full h-full object-cover opacity-80"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
              
              <div className="absolute inset-0 flex items-center justify-center p-8">
                {(!globalIsPlaying || !isCurrentTrackGlobal) && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); playTrack(album.tracks[0], album, 'LIBRARY'); setCurrentTrackIndex(0); }}
                    className="w-20 h-20 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center transform scale-100 opacity-100 transition-all duration-500 border border-white/30 shadow-2xl z-10"
                  >
                    <Play size={32} />
                  </button>
                )}
              </div>
              {/* Floating Track Info on Cover */}
              <div className="absolute bottom-6 left-6 right-6">
                <h2 className="text-2xl font-black uppercase tracking-tightest leading-none mb-1 shadow-md">{currentTrack?.title}</h2>
                <p className="text-xs font-bold text-small-orange uppercase tracking-widest shadow-md">{album.artist}</p>
              </div>
            </div>
          )}
        </div>

        {/* Tabbed Navigation */}
        <div className="flex items-center bg-black/40 backdrop-blur-md border-b border-white/5 sticky top-0 z-40 overflow-x-auto no-scrollbar">
          {[
            { id: 'TRACKS', label: 'Tracklist', icon: List },
            { id: 'LYRICS', label: 'Lyrics', icon: Music2 },
            { id: 'MEDIA', label: 'Videos & Art', icon: Video },
            { id: 'COMMENTS', label: 'Feed', icon: MessageSquare },
            { id: 'INFO', label: 'Notes', icon: Sparkles }
          ].map(tab => (
            <button 
              key={tab.id} 
              onClick={() => setActiveHUD(tab.id as any)}
              className={`flex-1 py-4 flex flex-col items-center gap-1 transition-all relative ${activeHUD === tab.id ? 'text-white' : 'text-white/20'}`}
            >
              <tab.icon size={16} />
              <span className="text-[8px] font-black uppercase tracking-widest">{tab.label}</span>
              {activeHUD === tab.id && (
                <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-small-orange" />
              )}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 z-10 relative">
          {activeHUD === 'TRACKS' && (
            <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
              {album.tracks.map((t, i) => (
                <div key={t.id} className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${currentTrackIndex === i ? 'bg-gradient-to-br from-[#6B0099]/40 via-[#D40055]/30 to-[#FF8C00]/30 backdrop-blur-2xl border-[#FF8C00]/50 shadow-[0_0_30px_rgba(107,0,153,0.3)]' : 'bg-gradient-to-br from-[#6B0099]/10 via-transparent to-[#FF8C00]/10 backdrop-blur-xl border-white/5 hover:border-white/20 hover:from-[#6B0099]/20 hover:to-[#FF8C00]/20'}`}>
                  <button onClick={() => { setCurrentTrackIndex(i); playTrack(t, album, 'LIBRARY'); }} className="flex items-center gap-4 text-left flex-1 min-w-0">
                    <span className="text-[10px] font-black text-small-orange w-4">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-widest truncate">{t.title}</p>
                      <p className="text-[8px] font-bold text-white/20 uppercase tracking-widest">{t.artist || album.artist}</p>
                    </div>
                  </button>
                  <div className="flex items-center gap-2">
                    {currentTrackIndex === i && globalIsPlaying && isCurrentTrackGlobal ? (
                      <Activity size={14} className="text-small-orange" />
                    ) : (
                      <Play size={14} className="text-white/20" fill="currentColor" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeHUD === 'LYRICS' && (
            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
               <div className="flex items-center gap-3 mb-6">
                 <Music2 size={16} className="text-small-orange" />
                 <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Synchronized Lyrics</span>
               </div>
               
               <div className="space-y-6" ref={lyricsContainerRef}>
                 {currentTrack?.timeCodedLyrics ? (
                   <TimeCodedLyrics 
                     tracks={currentTrack.timeCodedLyrics}
                     currentTime={globalCurrentTime}
                     seek={seek}
                     containerRef={lyricsContainerRef}
                   />
                 ) : currentTrack?.lyrics ? (
                   <div className="space-y-6 opacity-60">
                     {currentTrack.lyrics.split('\n').map((line, idx) => (
                       <p key={idx} className="text-xl font-display font-black uppercase tracking-tight">{line}</p>
                     ))}
                   </div>
                 ) : (
                   <div className="flex flex-col items-center justify-center text-center p-8 gap-6 opacity-40">
                     <Music2 size={32} className="text-white/20" />
                     <p className="text-[10px] font-black uppercase tracking-[0.3em]">No lyrics available.</p>
                   </div>
                 )}
               </div>
            </div>
          )}

          {activeHUD === 'MEDIA' && (
            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
              <div className="grid grid-cols-2 gap-4">
                {album.musicVideos?.map(video => (
                  <button 
                    key={video.id} 
                    onClick={() => { setActiveVideoId(video.id); playVideo(video); }}
                    className={`relative aspect-video rounded-xl overflow-hidden border transition-all ${activeVideoId === video.id ? 'border-white' : 'border-white/10'}`}
                  >
                    <img src={video.thumbnailUrl || album.coverImage || undefined} className="w-full h-full object-cover opacity-60" />
                    <div className="absolute inset-0 flex flex-col justify-end p-3 bg-gradient-to-t from-black/80 to-transparent">
                      <span className="text-[8px] font-black uppercase tracking-widest truncate">{video.title}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeHUD === 'COMMENTS' && (
            <div className="h-full animate-in slide-in-from-bottom-4 duration-500">
              <div className="mb-4 flex items-center gap-2 text-[#00FF00] drop-shadow-[0_0_12px_rgba(0,255,0,0.8)]">
                <Radio size={12} />
                <span className="text-[9px] font-black uppercase tracking-widest">live chat</span>
              </div>
              <HUDCommentModule album={album} trackId={currentTrack?.id || null} isPublic={true} themeColor={album.themeColor} user={user} onVisitUser={onVisitUser} onUpdate={onUpdate} />
            </div>
          )}

          {activeHUD === 'INFO' && (
            <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center gap-4">
                <img src={album.artistImage || album.coverImage || undefined} className="w-16 h-16 rounded-2xl object-cover border border-white/10" />
                <div>
                  <h3 className="text-lg font-black uppercase tracking-tight">{album.artist}</h3>
                  <p className="text-[9px] font-bold text-small-orange uppercase tracking-widest">Archive Identity</p>
                </div>
              </div>
              <p className="text-sm font-medium leading-relaxed text-white/60 italic font-display">
                {album.artistBio || album.description}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (isTVMode) {
    return (
      <div className="h-[100dvh] bg-[#080808] text-white relative overflow-hidden font-sans selection:bg-small-orange selection:text-black">
        <AtmosphericBackground album={album} analyser={globalAnalyser} isPlaying={globalIsPlaying && isCurrentTrackGlobal} simplified={true} />
        
        <div className="relative z-40 w-full h-full flex flex-col p-8 lg:p-14 gap-10">
          {/* TV HEADER - LARGE TABS */}
          <header className="flex items-center justify-between gap-8">
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/60">Navigate</span>
              <div className="flex items-center gap-6">
                <button onClick={onBack} className="p-5 bg-white/5 border border-white/10 rounded-full hover:bg-white/20 transition-all">
                  <ArrowLeft size={28} />
                </button>
                <nav className="flex bg-white/5 backdrop-blur-2xl rounded-[2rem] p-2 border border-white/10 shadow-2xl overflow-x-auto no-scrollbar">
                  {[
                    { id: 'TRACKS', label: 'Playlist', icon: List },
                    { id: 'LYRICS', label: 'Signal', icon: Music2 },
                    { id: 'MEDIA', label: 'Visuals', icon: Video },
                    { id: 'COMMENTS', label: 'Feed', icon: MessageSquare },
                    { id: 'INFO', label: 'Notes', icon: Sparkles },
                    { id: 'ABOUT', label: 'Identity', icon: User }
                  ].map(tab => (
                    <button 
                      key={tab.id} 
                      onClick={() => setActiveHUD(tab.id as any)}
                      className={`px-8 py-4 rounded-[1.5rem] flex items-center gap-3 text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeHUD === tab.id ? 'bg-white text-black shadow-[0_0_40px_rgba(255,255,255,0.2)]' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                    >
                      <tab.icon size={18} /> {tab.label}
                    </button>
                  ))}
                </nav>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex flex-col gap-2 items-end">
                <span className="text-[10px] font-black uppercase tracking-widest text-white/60">Themes</span>
                <button 
                  onClick={() => setIsTVMode(false)}
                  className="px-8 py-4 bg-white/10 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-white/20 transition-all flex items-center gap-3"
                >
                  <Zap size={14} className="text-small-orange" /> Desktop UI
                </button>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#6B0099] to-[#FF8C00] flex items-center justify-center shadow-2xl">
                <Logo size={32} />
              </div>
            </div>
          </header>

          {/* MAIN TV BODY */}
          <main className="flex-1 flex gap-12 overflow-hidden">
            {/* LEFT: DOMINANT MEDIA (ART/SLIDESHOW/VIDEO) */}
            <section className="w-[58%] flex flex-col gap-6">
              <div className="flex-1 relative rounded-[4rem] overflow-hidden border border-white/5 bg-black shadow-[0_0_100px_rgba(0,0,0,0.8)] group">
                {activeVideoId ? (
                   <div className="w-full h-full">
                     {(() => {
                       const video = album.musicVideos?.find(v => v.id === activeVideoId);
                       if (!video) return null;
                       const isYoutube = video.url.includes('youtube.com') || video.url.includes('youtu.be');
                       const isVimeo = video.url.includes('vimeo.com');
                       let embedUrl = video.url;
                       if (isYoutube) {
                        return (
                          <div className="w-full h-full relative">
                            <div id={ytContainerId.current} className="w-full h-full" />
                          </div>
                        );
                       } else if (isVimeo) {
                         const vid = video.url.split('/').pop();
                         embedUrl = `https://player.vimeo.com/video/${vid}?autoplay=1&muted=1`;
                       }
                       return (
                         <div className="w-full h-full relative">
                           {isVimeo ? (
                             <iframe src={embedUrl} className="w-full h-full" allow="autoplay; fullscreen" />
                           ) : (
                             <video ref={setVideoElement} src={video.url || undefined} playsInline autoPlay className="w-full h-full object-contain" onClick={() => togglePlay()} />
                           )}
                           <button onClick={() => {
                             setActiveVideoId(null);
                             clearMedia();
                           }} className="absolute top-8 right-8 p-4 bg-black/60 backdrop-blur-2xl rounded-full text-white/40 hover:text-white transition-all z-20">
                             <X size={24} />
                           </button>
                         </div>
                       );
                     })()}
                   </div>
                ) : (
                  <div className="w-full h-full">
                    {isSlideshowActive ? (
                      <AnimatedSlideshow 
                        images={(currentTrack?.images && currentTrack.images.length > 0) ? currentTrack.images : (album.slideshow && album.slideshow.length > 0) ? album.slideshow : [album.coverImage]} 
                        isPlaying={globalIsPlaying && isCurrentTrackGlobal} 
                        themeColor={album.themeColor}
                      />
                    ) : (
                      <Visualizer 
                        analyser={globalAnalyser} 
                        themeColor={album.themeColor}
                        trackTitle={currentTrack?.title || album.title}
                        artist={album.artist}
                        isPlaying={globalIsPlaying && isCurrentTrackGlobal}
                      />
                    )}
                  </div>
                )}
                
                {/* Media Controls Overlay */}
                <div className="absolute bottom-12 right-12 flex flex-col gap-2 items-end opacity-0 group-hover:opacity-100 transition-all duration-500">
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/60">View Features</span>
                  <div className="flex items-center gap-6 bg-black/40 backdrop-blur-xl p-2 rounded-full border border-white/10">
                    <button onClick={() => setIsSlideshowActive(false)} className={`px-10 py-4 rounded-full font-black text-xs uppercase tracking-widest transition-all ${!isSlideshowActive ? 'bg-white text-black' : 'text-white hover:bg-white/10'}`}>Visualizer</button>
                    <button onClick={() => setIsSlideshowActive(true)} className={`px-10 py-4 rounded-full font-black text-xs uppercase tracking-widest transition-all ${isSlideshowActive ? 'bg-white text-black' : 'text-white hover:bg-white/10'}`}>Slideshow</button>
                  </div>
                </div>
              </div>
            </section>

            {/* RIGHT: COMPACT CONTENT GRID (42%) */}
            <section className="w-[42%] flex flex-col gap-10 overflow-hidden">
              {/* COMPACT TRACKLIST */}
              <div className={`transition-all duration-700 overflow-hidden bg-gradient-to-br from-[#6B0099]/20 via-[#D40055]/10 to-[#FF8C00]/20 backdrop-blur-3xl border border-white/10 rounded-[3.5rem] p-10 flex flex-col shadow-[0_0_50px_rgba(107,0,153,0.15)] ${activeHUD === 'TRACKS' ? 'flex-1' : 'h-48 shrink-0'}`}>
                <div className="flex items-center justify-between mb-6">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.5em] text-white/50">Operational Tracks</h4>
                  <span className="text-[10px] font-bold text-small-orange/40 uppercase tracking-widest">{currentTrackIndex + 1} / {album.tracks.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-4 space-y-3">
                  {album.tracks.map((t, i) => (
                    <button 
                      key={t.id} 
                      onClick={() => { setCurrentTrackIndex(i); playTrack(t, album, 'LIBRARY'); }}
                      className={`w-full flex items-center justify-between p-5 rounded-2xl border transition-all group scale-active ${currentTrackIndex === i ? 'bg-gradient-to-br from-[#6B0099]/40 via-[#D40055]/40 to-[#FF8C00]/40 text-white border-white/30 shadow-[0_0_30px_rgba(107,0,153,0.3)] backdrop-blur-3xl' : 'bg-gradient-to-br from-[#6B0099]/10 via-transparent to-[#FF8C00]/10 backdrop-blur-2xl border-white/5 hover:border-white/20'}`}
                    >
                      <div className="flex items-center gap-6 min-w-0">
                        <span className={`text-[10px] font-black w-4 ${currentTrackIndex === i ? 'text-white' : 'text-white/20'}`}>{i + 1}</span>
                        <p className={`text-sm font-black uppercase tracking-widest truncate ${currentTrackIndex === i ? 'text-white' : 'text-white/80'}`}>{t.title}</p>
                      </div>
                      {currentTrackIndex === i && globalIsPlaying ? (
                        <div className="flex gap-1 items-end h-3">
                          {[0, 1, 2].map(b => <motion.div key={b} animate={{ height: [4, 12, 6, 12, 4] }} transition={{ duration: 1, repeat: Infinity, delay: b * 0.2 }} className={`w-1 rounded-full ${currentTrackIndex === i ? 'bg-small-orange' : 'bg-small-orange'}`} />)}
                        </div>
                      ) : (
                        <Play size={14} className={currentTrackIndex === i ? 'text-white' : 'text-white/20'} fill="currentColor" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* BOTTOM: SIDE-BY-SIDE ANALYTICS (VISUALIZER + LYRICS) */}
              <div className="flex-1 min-h-0 flex gap-6">
                {/* VISUALIZER SIDE */}
                <div className="flex-1 bg-black/40 backdrop-blur-3xl border border-white/5 rounded-[3.5rem] relative flex items-center justify-center p-10 overflow-hidden">
                   <h5 className="absolute top-8 left-10 text-[9px] font-black uppercase tracking-[0.4em] text-white/20">Frequency Spectrum</h5>
                   <Visualizer analyser={globalAnalyser} themeColor={album.themeColor} trackTitle={currentTrack?.title || ''} artist={album.artist} isPlaying={globalIsPlaying && isCurrentTrackGlobal} simplified={true} />
                </div>
                
                {/* ACTIVE TAB CONTENT SIDE (LYRICS/COMMENTS/BIO) */}
                <div className="flex-1 bg-black/40 backdrop-blur-3xl border border-white/5 rounded-[3.5rem] p-10 flex flex-col overflow-hidden">
                  <h5 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/20 mb-6 flex items-center justify-between">
                    <span>{activeHUD === 'LYRICS' ? 'Transmissions' : activeHUD === 'COMMENTS' ? 'The Social Feed' : 'Metadata'}</span>
                    <Activity size={12} className="text-small-orange" />
                  </h5>
                  <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                    {activeHUD === 'LYRICS' && (
                       <div className="space-y-6">
                         {currentTrack?.timeCodedLyrics ? (
                           currentTrack.timeCodedLyrics.map((line, idx) => {
                             const isActive = globalCurrentTime >= line.time && (!currentTrack.timeCodedLyrics![idx + 1] || globalCurrentTime < currentTrack.timeCodedLyrics![idx + 1].time);
                             return (
                               <motion.p key={idx} animate={{ opacity: isActive ? 1 : 0.2, scale: isActive ? 1.05 : 1 }} className={`text-xl font-display font-black uppercase tracking-tight leading-tight transition-all duration-700 ${isActive ? 'text-small-orange' : 'text-white'}`}>{line.text}</motion.p>
                             );
                           })
                         ) : (
                           <p className="text-lg font-medium italic text-white/40 leading-relaxed">{currentTrack?.lyrics || "Lyrics unavailable for this signal."}</p>
                         )}
                       </div>
                    )}
                    {activeHUD === 'COMMENTS' && (
                      <HUDCommentModule album={album} trackId={currentTrack?.id || null} isPublic={true} themeColor={album.themeColor} user={user} minimal onVisitUser={onVisitUser} onUpdate={onUpdate} />
                    )}
                    {activeHUD === 'INFO' && (
                      <p className="text-sm font-medium leading-relaxed italic text-white/60">{album.linerNotes || "Operational data compilation in progress."}</p>
                    )}
                    {activeHUD === 'ABOUT' && (
                      <div className="space-y-4">
                        <img src={album.artistImage || album.coverImage} className="w-full aspect-square object-cover rounded-2xl mb-4" />
                        <h3 className="text-2xl font-display font-black uppercase">{album.artist}</h3>
                        <p className="text-xs font-medium italic text-white/40 leading-relaxed">{album.artistBio}</p>
                      </div>
                    )}
                    {activeHUD === 'MEDIA' && (
                      <div className="grid grid-cols-1 gap-4">
                        {album.musicVideos?.map(v => (
                          <button key={v.id} onClick={() => { setActiveVideoId(v.id); playVideo(v); }} className={`relative aspect-video rounded-2xl overflow-hidden border transition-all ${activeVideoId === v.id ? 'border-white' : 'border-white/10 hover:border-white/30'}`}>
                            <img src={v.thumbnailUrl || album.coverImage} className="w-full h-full object-cover opacity-40 hover:opacity-100" />
                            <div className="absolute inset-0 flex flex-col justify-end p-4 bg-gradient-to-t from-black/80 to-transparent">
                              <span className="text-[10px] font-black uppercase tracking-widest text-white truncate">{v.title}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {activeHUD === 'TRACKS' && (
                       <div className="flex flex-col items-center justify-center h-full text-center opacity-20">
                         <Activity size={32} className="mb-4" />
                         <p className="text-[9px] font-black uppercase tracking-[0.4em]">Signal monitoring active</p>
                       </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </main>

          {/* TV FOOTER */}
          <footer className="flex justify-between items-center text-[11px] font-black uppercase tracking-[0.5em] text-white/10 pt-4 border-t border-white/5">
             <div className="flex gap-12"><span>OS v4.20 - TV OPTIMIZED</span><span>Sync Protocol Active</span></div>
             <div className="flex items-center gap-4 text-white/20">
                <span>Secure Link: {publicUrl.split('?')[0]}</span>
             </div>
          </footer>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] bg-transparent text-primary overflow-hidden relative selection:bg-white selection:text-black font-sans">
      {/* Large Dominant Blurred Background Image */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <img
          src={activeVideo?.coverImageUrl || album.coverImage || undefined}
          alt=""
          className="w-full h-full object-cover scale-110 blur-[50px] opacity-60 transition-all duration-1000"
          referrerPolicy="no-referrer"
        />
        {/* Fade artwork into background towards the bottom */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-black/20 to-black/80" />
        <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/60 to-transparent" />
      </div>

      <AtmosphericBackground album={album} analyser={globalAnalyser} isPlaying={globalIsPlaying && isCurrentTrackGlobal} />

      {/* Subtle depth overlay — no blur so background stays visible */}
      <div className="fixed inset-0 bg-black/5 pointer-events-none z-[1]" />

      <div className="fixed inset-0 lg:right-[50%] z-10 flex flex-col p-6 lg:p-12">
         {activeVideoId ? (
           <div className="relative w-full h-full flex items-center justify-center animate-in fade-in zoom-in-95 duration-700">
             {(() => {
               const video = album.musicVideos?.find(v => v.id === activeVideoId);
               if (!video) return null;
               
               const isYoutube = video.url.includes('youtube.com') || video.url.includes('youtu.be');
               const isVimeo = video.url.includes('vimeo.com');
               let embedUrl = video.url;
               
               if (isYoutube) {
                 const vid = video.url.split('v=')[1]?.split('&')[0] || video.url.split('/').pop();
                 embedUrl = `https://www.youtube.com/embed/${vid}?autoplay=1&mute=1`;
               } else if (isVimeo) {
                 const vid = video.url.split('/').pop();
                 embedUrl = `https://player.vimeo.com/video/${vid}?autoplay=1&muted=1`;
               }

               return (
                 <div className="w-full h-full relative group">
                   <div className="absolute inset-0 bg-gradient-to-br from-[#6B0099]/20 to-[#FF8C00]/20 blur-3xl opacity-50" />
                   <div className="relative w-full h-full rounded-[2rem] overflow-hidden border border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.5)] bg-black">
                     {isYoutube || isVimeo ? (
                       <iframe src={embedUrl} className="w-full h-full" allow="autoplay; fullscreen" allowFullScreen />
                     ) : (
                       <video 
                         ref={setVideoElement}
                         src={video.url || undefined} playsInline autoPlay 
                         className="w-full h-full object-contain cursor-pointer" 
                         onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                       />
                     )}
                   </div>
                   <button 
                     onClick={() => {
                       setActiveVideoId(null);
                       clearMedia();
                     }}
                     className="absolute top-4 right-4 p-3 bg-black/60 backdrop-blur-md rounded-full text-white/40 hover:text-white hover:scale-110 transition-all z-20 opacity-0 group-hover:opacity-100"
                   >
                     <X size={20} />
                   </button>
                 </div>
               );
             })()}
           </div>
         ) : (
           <div className="w-full h-full relative flex flex-col items-center justify-center gap-8">
             <div className="absolute inset-0">
               {isSlideshowActive ? (
                 <AnimatedSlideshow 
                    images={(currentTrack?.images && currentTrack.images.length > 0) ? currentTrack.images : (album.slideshow && album.slideshow.length > 0) ? album.slideshow : [album.coverImage, 'https://picsum.photos/seed/slide1/1920/1080', 'https://picsum.photos/seed/slide2/1920/1080']} 
                    isPlaying={globalIsPlaying && isCurrentTrackGlobal} 
                    themeColor={album.themeColor}
                    artistNotes={currentTrack?.artistNotes}
                  />
               ) : (
                 <div className="pointer-events-none w-full h-full">
                                       <Visualizer analyser={globalAnalyser} themeColor={album.themeColor} trackTitle={currentTrack?.title || album.title} artist={album.artist} isPlaying={globalIsPlaying && isCurrentTrackGlobal} scrollingText={scrollingText} />
                 </div>
               )}
             </div>
             
             {/* Prominent Cover Art */}
             <motion.button 
               initial={{ scale: 0.9, opacity: 0 }}
               animate={{ scale: isSlideshowActive ? 0.9 : 1, opacity: isSlideshowActive ? 0 : 1 }}
               onClick={() => {
                 if (album.tracks && album.tracks.length > 0) {
                   playTrack(album.tracks[0], album, 'LIBRARY');
                   setCurrentTrackIndex(0);
                 }
               }}
               className={`relative z-10 w-full max-w-[400px] aspect-square rounded-[2.5rem] overflow-hidden shadow-3xl border border-white/10 group cursor-pointer text-left ${isSlideshowActive ? 'pointer-events-none' : 'block'}`}
             >
               <img src={album.coverImage || undefined} alt={album.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
               <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/40 to-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-8">
                 <div className="w-20 h-20 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center transform scale-50 group-hover:scale-100 transition-all duration-500 opacity-0 group-hover:opacity-100 mb-6 border border-white/30 shadow-2xl">
                   <Play size={32} className="text-white ml-2 drop-shadow-lg" fill="white" />
                 </div>
                 <div className="absolute bottom-8 left-8 right-8 flex flex-col justify-end text-left">
                     <h2 className="text-2xl font-black uppercase tracking-tightest drop-shadow-md">{album.title}</h2>
                     <p className="text-sm font-bold text-white/80 uppercase tracking-widest drop-shadow-md">{album.artist}</p>
                 </div>
               </div>
             </motion.button>

             <div className="relative z-20 flex items-center gap-4">
               <button 
                 onClick={() => setIsSlideshowActive(false)}
                 className={`px-6 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${!isSlideshowActive ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'}`}
               >
                 Visualizer
               </button>
               <button 
                 onClick={() => setIsSlideshowActive(true)}
                 className={`px-6 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${isSlideshowActive ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'}`}
               >
                 Slideshow
               </button>
             </div>
           </div>
         )}
         
         {showCaptions && (currentTrack.lyrics || currentTrack.timeCodedLyrics) && !activeVideoId && (
           <div className="mt-auto mb-8 animate-in slide-in-from-bottom-4 duration-700">
             <div className="h-16 flex items-center justify-center overflow-hidden">
               <p className="text-xl lg:text-2xl font-display font-black text-center text-white/80 tracking-tight leading-tight transition-all duration-700">
                 {getCurrentCaption()}
               </p>
             </div>
           </div>
         )}
      </div>

      <div className="relative z-40 w-full h-full flex flex-col p-6 lg:p-12">
        <header className="flex flex-nowrap items-center gap-4 mb-6 overflow-x-auto no-scrollbar pb-2 w-full shrink-0">
             {!isPublic ? (
               <button onClick={onBack} className="flex items-center gap-4 px-8 py-4 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-all font-black text-xs uppercase tracking-widest">
                 <ArrowLeft size={18} /> Library
               </button>
             ) : (
                <div className="flex items-center gap-4 px-8 py-4 bg-theme-card backdrop-blur-md border border-white/10 rounded-full font-black text-xs uppercase tracking-widest">
                 <Globe size={18} className="text-green-500" /> Live Microsite
               </div>
             )}
             {isOwner && onEdit && (
               <button onClick={() => onEdit(album)} className="flex items-center gap-4 px-8 py-4 bg-orange-500 text-white rounded-full hover:bg-orange-600 transition-all font-black text-xs uppercase tracking-widest shadow-xl">
                 <Zap size={18} /> Edit Album
               </button>
             )}
             <button 
               onClick={() => setIsTVMode(!isTVMode)}
               className={`flex items-center gap-4 px-8 py-4 rounded-full transition-all font-black text-xs uppercase tracking-widest shadow-xl ${isTVMode ? 'bg-small-orange text-black' : 'bg-white/10 text-white border border-white/10'}`}
             >
               <Video size={18} /> {isTVMode ? 'TV Mode On' : 'TV Mode Off'}
             </button>

             {!isOwner && !isPreview && (
               <>
                 <button 
                   onClick={() => setIsDonationModalOpen(true)}
                   className="flex items-center gap-4 px-8 py-4 bg-small-orange text-black rounded-full hover:scale-105 transition-all font-black text-xs uppercase tracking-widest shadow-[0_4px_20px_rgba(255,140,0,0.3)] active:scale-95"
                 >
                   <HeartHandshake size={18} /> Gifts & tips
                 </button>
                 <button 
                   onClick={() => {
                     const event = new CustomEvent('OPEN_PIF_MODAL');
                     window.dispatchEvent(event);
                   }}
                   className="flex items-center gap-4 px-8 py-4 bg-white/5 border border-white/10 text-white rounded-full hover:bg-white/10 transition-all font-black text-xs uppercase tracking-widest shadow-xl active:scale-95"
                 >
                   <Heart size={18} /> Pay It Forward
                 </button>
               </>
             )}
             
             {[
               { id: 'TRACKS', label: album.type === 'BOOK' ? 'Table of Contents' : 'Track List', icon: album.type === 'BOOK' ? BookOpen : List },
               { id: 'LYRICS', label: 'Lyrics', icon: Music2 },
               { id: 'MEDIA', label: 'Music Videos & Art', icon: Video },
               { id: 'COMMENTS', label: 'The Social Feed', icon: MessageSquare },
               { id: 'INFO', label: album.type === 'BOOK' ? 'Synopsis' : 'Liner Notes', icon: Sparkles }
             ].map(tab => (
               <button key={tab.id} onClick={() => setActiveHUD(tab.id as any)} className={`flex items-center whitespace-nowrap gap-2 px-4 py-2 lg:px-4 lg:py-2.5 rounded-full border transition-all text-[10px] font-black uppercase tracking-widest ${activeHUD === tab.id ? 'bg-white text-black border-white shadow-xl scale-105' : 'bg-black/60 border-white/10 text-white/30 hover:bg-white/5'}`}>
                 <tab.icon size={16} /> {tab.label}
               </button>
             ))}

             <button 
               onClick={() => setActiveHUD(activeHUD === 'ABOUT' ? 'TRACKS' : 'ABOUT')} 
               className={`px-8 py-4 rounded-full font-black text-xs uppercase tracking-widest border transition-all whitespace-nowrap ${
                 activeHUD === 'ABOUT' 
                   ? 'bg-small-orange text-black border-small-orange shadow-[0_4px_15px_rgba(255,140,0,0.2)]' 
                   : 'bg-white/5 border-white/10 hover:bg-white/10'
               }`}
             >
                {activeHUD === 'ABOUT' ? 'Close Bio' : 'About Artist'}
             </button>
             {album.galleryUrl && (
               <a 
                 href={album.galleryUrl} 
                 target="_blank" 
                 rel="noopener noreferrer"
                 className="px-8 py-4 bg-white text-black rounded-full font-black text-xs uppercase tracking-widest shadow-2xl hover:scale-105 transition-all flex items-center gap-3"
               >
                 <Globe size={18} /> Gallery
               </a>
             )}
             <button 
               onClick={() => setShowCaptions(!showCaptions)} 
               className={`px-8 py-4 rounded-full font-black text-xs uppercase tracking-widest border transition-all ${
                 showCaptions 
                   ? 'bg-small-orange text-black border-small-orange shadow-[0_4px_15px_rgba(255,140,0,0.2)]' 
                   : 'bg-white/5 border-white/10 hover:bg-white/10'
               }`}
             >
                {showCaptions ? 'Hide Captions' : 'Show Captions'}
             </button>
             {!isPublic && (
               <div className="ml-auto">
                 <button onClick={() => setShowShareModal(true)} className="px-10 py-4 bg-white text-black rounded-full font-black text-xs uppercase tracking-widest shadow-2xl hover:scale-105 transition-all flex items-center gap-3">
                   <Share2 size={18} /> Share
                 </button>
               </div>
             )}
        </header>

        <div className="flex flex-col gap-6 lg:w-[50%] lg:ml-[44%] lg:mr-auto flex-1 overflow-hidden">
          <div className="w-full bg-theme-card backdrop-blur-3xl p-6 lg:p-8 rounded-[2.5rem] shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_8px_40px_rgba(0,0,0,0.25)]">
             <div className="flex flex-col gap-4">
                <div className="flex items-center gap-4">
                   <span className="px-3 py-1 bg-white/10 rounded-md text-[10px] font-black tracking-widest text-small-orange uppercase">Audio Session</span>
                   <span className="text-[10px] font-bold opacity-30 uppercase tracking-widest">Track {currentTrackIndex+1} / {album.tracks.length}</span>
                   {isOwner && (
                     <button 
                       onClick={async () => {
                         try {
                           const { fetchUserProfile, updateUserProfile } = await import('../services/backendService');
                           const { auth } = await import('../services/backendService');
                           if (!auth.currentUser) return;
                           const profile = await fetchUserProfile(auth.currentUser.uid);
                           if (profile) {
                             const pinnedItems = profile.pinnedItems || [];
                             const newPin: { id: string; type: "AUDIO"; refId: string } = { id: Date.now().toString(), type: 'AUDIO', refId: album.id };
                             if (!pinnedItems.find((p: any) => p.refId === album.id)) {
                               await updateUserProfile(auth.currentUser.uid, { pinnedItems: [...pinnedItems, newPin] });
                               alert('Project Pinned to Profile!');
                             } else {
                               alert('Project is already pinned.');
                             }
                           }
                         } catch (e) { console.error(e); }
                       }}
                       className="flex items-center gap-2 px-3 py-1 bg-small-orange/20 hover:bg-small-orange/30 rounded-md text-[10px] font-black tracking-widest text-small-orange uppercase transition-all"
                     >
                       <Zap size={12} /> Pin
                     </button>
                   )}
                   {isOwner && !currentTrack.timeCodedLyrics && (
                     <button 
                       onClick={handleGenerateCaptions}
                       disabled={isGeneratingCaptions}
                       className="flex items-center gap-2 px-3 py-1 bg-white/5 hover:bg-white/10 rounded-md text-[10px] font-black tracking-widest text-white/40 uppercase transition-all disabled:opacity-50"
                     >
                       {isGeneratingCaptions ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                       {isGeneratingCaptions ? 'Analyzing...' : 'Auto-Caption'}
                     </button>
                   )}
                </div>
                <h1 className="text-4xl lg:text-5xl font-display font-black tracking-tightest leading-[0.9]">{currentTrack?.title || album.title}</h1>
                <p className="text-xl lg:text-2xl font-medium text-primary/40 italic">{album.artist}</p>
             </div>
          </div>

          <div className="w-full flex-1 flex flex-col gap-6 overflow-hidden">
              {activeHUD === 'ABOUT' && (
               <div className="flex-1 bg-black/80 backdrop-blur-3xl p-8 lg:p-16 rounded-[3rem] animate-in zoom-in-95 duration-700 flex flex-col lg:flex-row gap-10 overflow-y-auto shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_8px_40px_rgba(0,0,0,0.3)]">
                  <div className="lg:w-1/3 shrink-0">
                    <img src={album.artistImage || album.coverImage || undefined} alt={album.artist} className="w-full aspect-square object-cover rounded-[2rem] shadow-2xl ring-1 ring-white/10" />
                  </div>
                  <div className="flex-1 space-y-8">
                    <div>
                      <span className="text-[11px] font-black uppercase tracking-[0.5em] text-small-orange mb-4 block">Archive Identity</span>
                      <h2 className="text-5xl font-display font-black tracking-tighter leading-none mb-6">{album.artist}</h2>
                      <div className="w-20 h-1 bg-white" />
                    </div>
                    <p className="text-lg lg:text-xl font-medium leading-relaxed text-white/60 italic font-display">{album.artistBio}</p>
                    
                    {album.socialLinks && (
                      <div className="flex flex-wrap gap-6 pt-6">
                        {album.socialLinks.twitter && (
                          <a href={album.socialLinks.twitter} target="_blank" rel="noopener noreferrer" className="p-4 bg-white/5 rounded-2xl text-white/40 hover:text-white hover:bg-white/10 transition-all">
                            <Twitter size={20} />
                          </a>
                        )}
                        {album.socialLinks.instagram && (
                          <a href={album.socialLinks.instagram} target="_blank" rel="noopener noreferrer" className="p-4 bg-white/5 rounded-2xl text-white/40 hover:text-white hover:bg-white/10 transition-all">
                            <Instagram size={20} />
                          </a>
                        )}
                        {album.socialLinks.youtube && (
                          <a href={album.socialLinks.youtube} target="_blank" rel="noopener noreferrer" className="p-4 bg-white/5 rounded-2xl text-white/40 hover:text-white hover:bg-white/10 transition-all">
                            <Youtube size={20} />
                          </a>
                        )}
                        {album.socialLinks.spotify && (
                          <a href={album.socialLinks.spotify} target="_blank" rel="noopener noreferrer" className="p-4 bg-white/5 rounded-2xl text-white/40 hover:text-white hover:bg-white/10 transition-all">
                            <Music2 size={20} />
                          </a>
                        )}
                        {album.socialLinks.website && (
                          <a href={album.socialLinks.website} target="_blank" rel="noopener noreferrer" className="p-4 bg-white/5 rounded-2xl text-white/40 hover:text-white hover:bg-white/10 transition-all">
                            <Globe size={20} />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
               </div>
             )}

             {activeHUD !== 'ABOUT' && (
               <div className="flex-1 animate-in slide-in-from-right-20 duration-1000 overflow-hidden flex flex-col">
                  <div className="w-full h-full bg-gradient-to-br from-[#6B0099]/30 via-black/40 to-[#FF8C00]/30 backdrop-blur-3xl p-6 lg:p-10 rounded-[2.5rem] lg:rounded-[3rem] shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_0_60px_rgba(107,0,153,0.08),0_16px_48px_rgba(0,0,0,0.2)] overflow-hidden flex flex-col">
                    {activeHUD === 'LYRICS' && (
                      <div className="flex-1 flex flex-col gap-6 overflow-hidden">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <Music2 size={16} className="text-small-orange" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Synchronized Lyrics</span>
                          </div>
                        </div>
                        <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar space-y-6" ref={lyricsContainerRef}>
                          {(() => {
                            const track = album.tracks[currentTrackIndex];
                            if (track?.timeCodedLyrics && track.timeCodedLyrics.length > 0) {
                              return (
                                <TimeCodedLyrics 
                                  tracks={track.timeCodedLyrics}
                                  currentTime={globalCurrentTime}
                                  seek={seek}
                                  containerRef={lyricsContainerRef}
                                />
                              );
                            } else if (track?.lyrics) {
                              return (
                                <div className="space-y-6 opacity-60">
                                  {track.lyrics.split('\n').map((line, idx) => (
                                    <p key={idx} className="text-xl lg:text-2xl font-display font-black uppercase tracking-tight">{line}</p>
                                  ))}
                                  {isOwner && (
                                    <div className="pt-8 border-t border-white/10">
                                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20 mb-4 text-center">Sync these lyrics with AI</p>
                                      <button 
                                        onClick={handleGenerateCaptions}
                                        className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center gap-3 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                                      >
                                        <Sparkles size={14} className="text-small-orange" />
                                      {isGeneratingCaptions ? 'Synchronizing...' : 'Sync Audio to Lyrics'}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            } else {
                              return (
                                <div className="h-full flex flex-col items-center justify-center text-center p-12 gap-6 opacity-40">
                                  <Music2 size={48} className="text-white/20" />
                                  <p className="text-sm font-black uppercase tracking-[0.3em]">No lyrics available for this transmission.</p>
                                  {isOwner && (
                                    <button 
                                      onClick={() => onEdit?.(album)}
                                      className="px-8 py-3 bg-white text-black rounded-full text-[10px] font-black uppercase tracking-widest"
                                    >
                                      Add Lyrics in Creator
                                    </button>
                                  )}
                                </div>
                              );
                            }
                          })()}
                        </div>
                      </div>
                    )}
                    {activeHUD === 'TRACKS' && (
                      <div className="flex-1 flex flex-col gap-6 overflow-hidden">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            {album.type === 'BOOK' ? <BookOpen size={16} className="text-small-orange" /> : <List size={16} className="text-small-orange" />}
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{album.type === 'BOOK' ? 'Table of Contents' : 'Track List'}</span>
                          </div>
                          <button 
                            onClick={() => setIsTracksCollapsed(!isTracksCollapsed)}
                            className="p-2 hover:bg-white/5 rounded-lg transition-all text-white/20 hover:text-white"
                          >
                            {isTracksCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                          </button>
                        </div>
                        
                        {!isTracksCollapsed && (
                          <div className="flex-1 flex flex-col gap-2 overflow-y-auto pr-4 custom-scrollbar animate-in slide-in-from-top-2 duration-300">
                            {album.tracks.map((t, i) => (
                              <div key={t.id} className="flex flex-col gap-2">
                                <div className={`flex items-center justify-between px-3 py-1.5 lg:px-3 lg:py-1.5 rounded-2xl border transition-all group outline-none relative overflow-hidden ${currentTrackIndex === i ? 'border-[#FF8C00]/50 bg-gradient-to-r from-[#6B0099]/30 via-[#D40055]/30 to-[#FF8C00]/30 shadow-[0_0_50px_rgba(107,0,153,0.4)] backdrop-blur-2xl scale-[1.02]' : 'border-white/5 bg-gradient-to-r from-[#6B0099]/10 via-transparent to-[#FF8C00]/10 backdrop-blur-xl hover:from-[#6B0099]/20 hover:to-[#FF8C00]/20 hover:shadow-[0_0_25px_rgba(107,0,153,0.15)] hover:border-white/20'}`}>
                                  {currentTrackIndex === i && (
                                    <div className="absolute inset-0 bg-gradient-to-r from-[#6B0099]/40 via-[#D40055]/20 to-transparent pointer-events-none" />
                                  )}
                                  <button 
                                    onClick={() => { setCurrentTrackIndex(i); playTrack(t, album, 'LIBRARY'); }} 
                                    className="flex items-center gap-6 text-left flex-1 outline-none relative z-10"
                                  >
                                    <span className={`text-[10px] font-black w-4 transition-colors ${currentTrackIndex === i ? 'text-small-orange' : 'text-white/20 group-hover:text-white/40'}`}>{i + 1}</span>
                                    <span className={`text-sm font-bold uppercase tracking-widest truncate transition-all ${currentTrackIndex === i ? 'text-white drop-shadow-[0_0_15px_rgba(255,140,0,0.8)]' : 'text-white/60 group-hover:text-white'}`}>{t.title || 'Untitled Track'}</span>
                                  </button>
                                  <div className="flex items-center gap-3">
                                    {t.isExclusive && (
                                      <div className="px-2 py-1 bg-small-orange/20 border border-small-orange/30 rounded-md flex items-center gap-1">
                                        <Sparkles size={10} className="text-small-orange" />
                                        <span className="text-[8px] font-black text-small-orange uppercase">Exclusive</span>
                                      </div>
                                    )}
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); alert(`Redirecting to payment for: ${t.title}. Price: $${t.price || '0.99'}`); }}
                                      className="px-3 py-1.5 bg-white/10 hover:bg-white text-white hover:text-black rounded-lg text-[8px] font-black uppercase tracking-widest transition-all outline-none"
                                    >
                                      Buy ${t.price || '0.99'}
                                    </button>
                                    {currentTrackIndex === i && globalIsPlaying && isCurrentTrackGlobal ? (
                                      <div className="flex gap-0.5 items-end h-3">
                                        {[0, 1, 2].map(bar => (
                                          <motion.div 
                                            key={bar}
                                            animate={{ height: [4, 12, 6, 10, 4] }}
                                            transition={{ duration: 1, repeat: Infinity, delay: bar * 0.2 }}
                                            className="w-0.5 bg-small-orange rounded-full"
                                          />
                                        ))}
                                      </div>
                                    ) : (
                                      <Play size={14} className="text-white/10 group-hover:text-white/40 transition-colors" fill="currentColor" />
                                    )}
                                  </div>
                                </div>
                                {currentTrackIndex === i && (
                                  <div className="px-4 pb-2">
                                    <HUDCommentModule album={album} trackId={t.id} isPublic={true} themeColor={album.themeColor} user={user} minimal onVisitUser={onVisitUser} onUpdate={onUpdate} />
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {isTracksCollapsed && (
                          <div className="flex items-center justify-center py-20 border border-dashed border-white/5 rounded-[2rem] bg-white/[0.02]">
                            <button 
                              onClick={() => setIsTracksCollapsed(false)}
                              className="flex flex-col items-center gap-4 text-white/20 hover:text-white transition-all group"
                            >
                              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Plus size={20} />
                              </div>
                              <span className="text-[10px] font-black uppercase tracking-widest">Expand Registry</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {activeHUD === 'MEDIA' && (
                      <div className="flex-1 flex flex-col gap-8 overflow-y-auto pr-4 custom-scrollbar">
                        {/* Video Player Section */}
                        {(activeVideoId || (album.musicVideos && album.musicVideos.length > 0)) && (
                          <div className="space-y-6 animate-in fade-in duration-500">
                            {(() => {
                              const video = album.musicVideos?.find(v => v.id === activeVideoId) || album.musicVideos?.[0];
                              if (!video) return null;
                              
                              return (
                                <div className="space-y-6">
                                  <div className="p-8 bg-white/[0.04] border border-white/10 rounded-[2.5rem] flex items-center justify-between group hover:bg-white/[0.08] transition-all cursor-pointer" onClick={() => { setActiveVideoId(video.id); playVideo(video); }}>
                                    <div className="flex items-center gap-6">
                                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#6B0099] to-[#FF8C00] flex items-center justify-center shadow-xl">
                                        <Video size={24} className="text-white" />
                                      </div>
                                      <div>
                                        <h3 className="text-xl font-black uppercase tracking-tight text-white">{video.title}</h3>
                                        <p className="text-[10px] font-bold text-small-orange uppercase tracking-widest">Active Music Video & Art</p>
                                      </div>
                                    </div>
                                    <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center group-hover:bg-white group-hover:text-black transition-all">
                                      <Play size={16} fill="currentColor" />
                                    </div>
                                  </div>
                                  
                                  {/* Video Comments */}
                                  <div className="p-8 bg-white/[0.02] border border-white/10 rounded-[2rem]">
                                    <HUDCommentModule album={album} trackId={null} videoId={video.id} isPublic={true} themeColor={album.themeColor} user={user} onVisitUser={onVisitUser} onUpdate={onUpdate} />
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        )}

                        {/* Playlists Section */}
                        {album.videoPlaylists && album.videoPlaylists.length > 0 && (
                          <div className="space-y-6">
                            <div className="flex items-center gap-3">
                              <List size={16} className="text-small-orange" />
                              <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Curated Playlists</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {album.videoPlaylists.map(playlist => (
                                <button 
                                  key={playlist.id} 
                                  onClick={() => setActivePlaylistId(activePlaylistId === playlist.id ? null : playlist.id)}
                                  className={`p-6 rounded-[2rem] border transition-all text-left group ${activePlaylistId === playlist.id ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                                >
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-black uppercase tracking-widest">{playlist.title}</span>
                                    <ChevronDown size={14} className={`transition-transform ${activePlaylistId === playlist.id ? 'rotate-180' : ''}`} />
                                  </div>
                                  <p className={`text-[9px] font-bold uppercase tracking-widest ${activePlaylistId === playlist.id ? 'text-black/40' : 'text-white/20'}`}>
                                    {playlist.videoIds.length} Visuals
                                  </p>
                                  
                                  {activePlaylistId === playlist.id && (
                                    <div className="mt-4 space-y-2 animate-in slide-in-from-top-2">
                                      {playlist.videoIds.map(vidId => {
                                        const v = album.musicVideos?.find(mv => mv.id === vidId);
                                        if (!v) return null;
                                        return (
                                          <div 
                                            key={vidId} 
                                            onClick={(e) => { e.stopPropagation(); setActiveVideoId(vidId); playVideo(v); }}
                                            className={`p-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${activeVideoId === vidId ? 'bg-black text-white' : 'bg-black/10 hover:bg-black/20 text-black/60'}`}
                                          >
                                            {v.title}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* All Videos Grid */}
                        <div className="space-y-6">
                          <div className="flex items-center gap-3">
                            <Video size={16} className="text-small-orange" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Music Videos & Art</span>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {album.musicVideos?.map(video => (
                              <div 
                                key={video.id} 
                                className={`group relative aspect-video rounded-2xl overflow-hidden border transition-all ${activeVideoId === video.id ? 'border-white scale-105 shadow-2xl' : 'border-white/10 hover:border-white/30'}`}
                              >
                                <button 
                                  onClick={() => { setActiveVideoId(video.id); playVideo(video); }}
                                  className="w-full h-full"
                                >
                                  {video.thumbnailUrl ? (
                                    <img src={video.thumbnailUrl || undefined} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                                  ) : (
                                    <div className="w-full h-full bg-white/5 flex items-center justify-center">
                                      <Video size={24} className="text-white/10" />
                                    </div>
                                  )}
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-4">
                                    <span className="text-[9px] font-black uppercase tracking-widest text-white truncate">{video.title}</span>
                                  </div>
                                </button>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); alert(`Redirecting to payment for video: ${video.title}. Price: $${video.price || '1.99'}`); }}
                                  className="absolute top-2 right-2 px-3 py-1 bg-black/60 backdrop-blur-md text-white rounded-lg text-[8px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white hover:text-black"
                                >
                                  Buy ${video.price || '1.99'}
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        {album.liveFeedUrl && (
                          <div className="space-y-4 pt-8 border-t border-white/5">
                            <div className="flex items-center gap-3">
                              <Radio size={16} className="text-red-500" />
                              <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Live Studio Feed</span>
                            </div>
                            <div className="relative aspect-video rounded-[2rem] overflow-hidden border border-white/10 shadow-2xl">
                              <iframe 
                                src={album.liveFeedUrl || undefined} 
                                className="w-full h-full" 
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                                allowFullScreen 
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {activeHUD === 'COMMENTS' && (
                      <div className="flex-1 h-full flex flex-col">
                        <div className="flex items-center justify-between mb-4 px-2">
                          <div className="flex items-center gap-3">
                            <MessageSquare size={16} className="text-small-orange" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">
                              {album.tracks[currentTrackIndex]?.title ? `Live Chat: ${album.tracks[currentTrackIndex].title}` : 'The Social Feed'}
                            </span>
                          </div>
                          <button 
                            onClick={() => {
                              const url = `${window.location.origin}${window.location.pathname}?id=${album.id}&track=${album.tracks[currentTrackIndex]?.id || 'album'}`;
                              navigator.clipboard.writeText(url);
                              alert('Global Feed link copied to clipboard!');
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-[8px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-all"
                          >
                            <Share2 size={12} /> Share Feed
                          </button>
                        </div>
                        <div className="flex-1 min-h-0">
                          <HUDCommentModule album={album} trackId={album.tracks[currentTrackIndex]?.id || null} isPublic={true} themeColor={album.themeColor} user={user} onVisitUser={onVisitUser} onUpdate={onUpdate} />
                        </div>
                      </div>
                    )}
                    {activeHUD === 'INFO' && (
                      <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar space-y-10 animate-in fade-in duration-700">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black uppercase tracking-[0.4em] text-small-orange">Operational Overview</span>
                          {isOwner && (
                            <button onClick={() => onEdit?.(album)} className="text-[10px] font-bold text-white/20 hover:text-white uppercase tracking-widest flex items-center gap-2">
                              <Pen size={12} /> Edit Notes
                            </button>
                          )}
                        </div>
                        
                        <div className="space-y-8">
                          <p className="text-2xl font-medium leading-relaxed text-white/80 italic font-display">
                            {album.linerNotes || `This transmission represents a curated soundscape by ${album.artist}. Each signal has been captured and compiled under the ${album.title} directive, exploring themes of digital resonance and sonic architecture within the Plajah ecosytem.`}
                          </p>

                          <The411 itemId={album.id} itemType="MUSIC" title={album.title} author={album.artist} />
                          
                          <div className="pt-8 border-t border-white/5 space-y-4">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-white/20">Album Metadata</h4>
                            <div className="grid grid-cols-2 gap-6">
                              <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                <span className="text-[8px] font-black text-white/20 uppercase block mb-1">Release Date</span>
                                <span className="text-xs font-bold text-white">{album.releaseDate ? new Date(album.releaseDate).toLocaleDateString() : new Date(album.createdAt).toLocaleDateString()}</span>
                              </div>
                              <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                <span className="text-[8px] font-black text-white/20 uppercase block mb-1">Genre Spectrum</span>
                                <span className="text-xs font-bold text-white">{album.genre || 'Multi-Experimental'}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        {corsError && (
                          <div className="p-8 bg-red-500/10 border border-red-500/30 rounded-3xl space-y-4">
                            <div className="flex items-center gap-4 text-red-400">
                              <AlertCircle size={20} />
                              <span className="text-sm font-black uppercase tracking-widest">CORS Configuration Required</span>
                            </div>
                            <p className="text-xs text-white/40 leading-relaxed">
                              Visualizers are disabled because the music files are hosted on a domain that hasn't authorized this origin. 
                              Please run the <code className="bg-white/5 px-2 py-1 rounded text-white/80">gsutil cors set</code> command on your Firebase bucket to enable full functionality.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
               </div>
             )}
          </div>
        </div>

        <footer className="mt-auto pt-16 flex justify-between items-center text-[10px] font-black uppercase tracking-[0.4em] text-white/10">
           <div className="flex gap-16"><span>System v3.0</span><span>End-to-End Encryption</span></div>
           <div className="flex gap-6 items-center">
             <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#6B0099] to-[#FF8C00] flex items-center justify-center shadow-lg">
               <Logo size={16} />
             </div>
             Plajah — Creative Control by {album.artist}
           </div>
        </footer>
      </div>

      {/* Local Audio Element Removed - Now Global */}

      {showShareModal && (
        <div className="fixed inset-0 bg-black/98 backdrop-blur-3xl z-[200] flex items-center justify-center p-6">
          <div className="max-w-xl w-full bg-[#080808] border border-white/10 p-12 rounded-[3rem] text-center shadow-3xl animate-in zoom-in-95 font-sans">
            <button onClick={() => setShowShareModal(false)} className="absolute top-12 right-12 text-white/20 hover:text-white p-2 transition-transform hover:rotate-90"><X size={32} /></button>
            <div className={`w-24 h-24 bg-green-500/10 border-green-500/30 flex items-center justify-center mx-auto mb-8 border rounded-[2.5rem] shadow-2xl`}>
              <Share2 size={36} className="text-green-500" />
            </div>
            <h2 className="text-4xl font-display font-black tracking-tight mb-6 uppercase tracking-widest">Share Microsite</h2>
            <p className="text-xs font-bold text-white/30 mb-16 tracking-widest uppercase leading-loose">Your album is hosted and ready for distribution.</p>
            
            <div className="space-y-8">
              <div className="flex items-center gap-4 p-10 bg-white/[0.04] border border-white/10 rounded-[3rem] group">
                 <LinkIcon size={24} className="text-white/20 shrink-0" />
                 <span className="flex-1 text-left text-sm font-bold text-white/60 truncate">{publicUrl}</span>
                 <button onClick={() => { navigator.clipboard.writeText(publicUrl); setCopied(true); setTimeout(()=>setCopied(false),2000); }} className="p-5 bg-white text-black rounded-2xl hover:bg-gray-200 transition-all active:scale-90">
                   {copied ? <Check size={24} className="text-green-600" /> : <Copy size={24} />}
                 </button>
              </div>
              <div className="p-12 border border-white/10 bg-white/[0.02] rounded-[4rem] flex flex-col gap-6">
                <div className="flex items-center justify-between text-left">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.4em] text-green-500 mb-2">Status: Online</p>
                    <p className="text-sm font-bold text-white/40 uppercase tracking-widest">Public Microsite Validated</p>
                  </div>
                  <button onClick={() => window.open(publicUrl, '_blank')} className="p-6 bg-white/10 hover:bg-white/20 rounded-3xl transition-all shadow-xl"><ExternalLink size={28} /></button>
                </div>
                
                <div className="pt-6 border-t border-white/5 grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => {
                      const text = `Check out ${album.title} by ${album.artist} on @Plajah!`;
                      window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(publicUrl)}`, '_blank');
                    }}
                    className="flex flex-col items-center gap-3 p-6 bg-white/5 rounded-3xl hover:bg-white/10 transition-all group"
                  >
                    <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white group-hover:text-black transition-all">
                      <X size={20} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest">Post to X</span>
                  </button>
                  <button 
                    onClick={() => {
                      const text = `I'm listening to ${album.title} by ${album.artist} on Plajah. Check it out!`;
                      window.open(`mailto:?subject=${encodeURIComponent(album.title)}&body=${encodeURIComponent(`${text}\n\n${publicUrl}`)}`);
                    }}
                    className="flex flex-col items-center gap-3 p-6 bg-white/5 rounded-3xl hover:bg-white/10 transition-all group"
                  >
                    <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white group-hover:text-black transition-all">
                      <Mail size={20} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest">Email Link</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <DonationModal 
        isOpen={isDonationModalOpen}
        onClose={() => setIsDonationModalOpen(false)}
        toId={album.ownerId || ''}
        toName={album.artist}
        albumId={album.id}
        albumTitle={album.title}
      />
    </div>
  );
};

export default PlayerView;