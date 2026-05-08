import React, { useState, useEffect, useRef } from 'react';
import { Video, VideoComment, UserProfile, Track } from '../types';
import { likeVideo, unlikeVideo, postVideoComment, listenToVideoComments, fetchUserProfile, checkIfLiked } from '../services/backendService';
import { Heart, MessageCircle, Share2, Plus, X, Send, User, ChevronDown, ChevronUp, Maximize2, Minimize2, ChevronRight, Info, Volume2, VolumeX, Play, Pause, ArrowLeft, Zap } from 'lucide-react';
import { MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useGlobalPlayerState, useGlobalPlayerProgress } from '../contexts/GlobalPlayerContext';
import CommentSection from './CommentSection';
import MuxPlayer from '@mux/mux-player-react';

interface VideoPlayerProps {
  video: Video;
  onBack: () => void;
  currentUser: any;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ video, onBack, currentUser }) => {
  const { isPlaying, pause, resume, setVideoElement, setYtPlayer, playVideo, currentVideo, clearMedia, togglePlay: globalTogglePlay } = useGlobalPlayerState();
  const { currentTime, duration, seek } = useGlobalPlayerProgress();

  const [comments, setComments] = useState<VideoComment[]>([]);
  const [videoError, setVideoError] = useState(false);
  
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

  const [isLiked, setIsLiked] = useState(false);
  const [showComments, setShowComments] = useState(true);
  const [ownerProfile, setOwnerProfile] = useState<UserProfile | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showExitFullscreenOnly, setShowExitFullscreenOnly] = useState(false);
  
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const ytPlayerRef = useRef<any>(null);
  const ytContainerId = useRef(`yt-video-player-${Math.random().toString(36).substr(2, 9)}`);
  const mousePos = useRef({ x: 0, y: 0 });
  const introHandledRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const showExitTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!(document.fullscreenElement || (document as any).webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    let fadeOutTimer: NodeJS.Timeout;
    let fullscreenTimer: NodeJS.Timeout;

    if (isPlaying && !introHandledRef.current) {
      introHandledRef.current = true;
      // 1. Fade out controls after 4s
      fadeOutTimer = setTimeout(() => {
        setControlsVisible(false);
        
        // 2. Auto-fullscreen after additional 2s (if not already fullscreen)
        fullscreenTimer = setTimeout(() => {
          if (playerContainerRef.current && document.fullscreenElement === null) {
            playerContainerRef.current.requestFullscreen().catch((err) => {
              console.log("Auto fullscreen prevented by browser", err);
            });
          }
        }, 2000);
      }, 4000);
    }

    return () => {
      clearTimeout(fadeOutTimer);
      clearTimeout(fullscreenTimer);
    };
  }, [isPlaying]);

  const handleMouseMove = (e: React.MouseEvent) => {
    const deltaX = Math.abs(e.clientX - mousePos.current.x);
    const deltaY = Math.abs(e.clientY - mousePos.current.y);

    if (isFullscreen && !controlsVisible) {
      setShowExitFullscreenOnly(true);
      clearTimeout(showExitTimer.current);
      showExitTimer.current = setTimeout(() => setShowExitFullscreenOnly(false), 2000);
    }

    // Require significant movement to bring back full controls
    if (deltaX > 150 || deltaY > 150) {
      setControlsVisible(true);
      setShowExitFullscreenOnly(false);
      mousePos.current = { x: e.clientX, y: e.clientY };
      
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setControlsVisible(false), 4000);
    }
  };

  useEffect(() => {
    const isYoutube = video.url.includes('youtube.com') || video.url.includes('youtu.be');
    if (!isYoutube) {
      setYtPlayer(null);
      return;
    }

    let vId = '';
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = video.url.match(regExp);
    if (match && match[2].length === 11) {
      vId = match[2];
    } else {
      vId = video.url.split('/').pop()?.split('?')[0] || '';
    }

    if (!vId || vId.length < 5) {
      console.warn("Invalid YouTube ID in VideoPlayer:", vId);
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
          console.error("YouTube Player initialization failed in VideoPlayer:", e);
        }
      } else {
        console.warn("YT container not found in VideoPlayer for init:", ytContainerId.current);
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
  }, [video.url, setYtPlayer]);

  useEffect(() => {
    const unsub = listenToVideoComments(video.id, setComments);
    loadOwnerProfile();
    checkInitialLike();
    
    // Auto-play via global player context
    if (currentVideo?.id !== video.id) {
      playVideo(video);
    }

    return () => {
      unsub();
      clearMedia();
    };
  }, [video.id]);

  const loadOwnerProfile = async () => {
    const p = await fetchUserProfile(video.ownerId);
    setOwnerProfile(p);
  };

  const checkInitialLike = async () => {
    const liked = await checkIfLiked(video.id);
    setIsLiked(liked);
  };

  const handleLike = async () => {
    if (!currentUser) return;
    if (isLiked) {
      await unlikeVideo(video.id);
      setIsLiked(false);
    } else {
      await likeVideo(video.id);
      setIsLiked(true);
    }
  };

  const handlePostComment = async (text: string, parentId?: string) => {
    if (!currentUser) return;
    await postVideoComment(video.id, text, parentId);
  };

  const togglePlay = () => {
    if (isPlaying) pause();
    else resume();
  };

  const progress = (currentTime / duration) * 100 || 0;

  return (
    <div ref={playerContainerRef} className="fixed inset-0 bg-black z-[200] flex flex-col lg:flex-row overflow-hidden" onMouseMove={handleMouseMove}>
      {/* Video Section */}
      <div className="flex-1 relative bg-black flex items-center justify-center group" onClick={togglePlay}>
        {(() => {
          const isYoutube = video.url.includes('youtube.com') || video.url.includes('youtu.be');
          const isVimeo = video.url.includes('vimeo.com');
          
          if (isYoutube) {
            return (
              <div className="w-full h-full relative pointer-events-none">
                <div id={ytContainerId.current} className="w-full h-full" />
              </div>
            );
          }

          if (isVimeo) {
            const vid = video.url.split('/').pop();
            const embedUrl = `https://player.vimeo.com/video/${vid}?autoplay=1`;
            return (
              <iframe 
                src={embedUrl} 
                className="w-full h-full" 
                allow="autoplay; fullscreen" 
                allowFullScreen 
              />
            );
          }

          const isArchiveEmbed = video.url.includes('archive.org/embed/');
          
          if (isArchiveEmbed) {
            return (
              <iframe 
                src={video.url} 
                className="w-full h-full" 
                allow="autoplay; fullscreen" 
                allowFullScreen 
              />
            );
          }

          const isArchive = video.url.includes('archive.org');

          if (isArchive && videoError) {
            // Get identifier from URL
            const parts = video.url.split('/');
            const downloadIndex = parts.indexOf('download');
            const id = downloadIndex !== -1 ? parts[downloadIndex + 1] : '';
            return (
              <iframe 
                src={`https://archive.org/embed/${id}?autoplay=1`} 
                className="w-full h-full" 
                allow="autoplay; fullscreen" 
                allowFullScreen 
              />
            );
          }

          if (video.muxPlaybackId) {
            return (
              <div className="w-full h-full cursor-pointer" onClick={togglePlay}>
                <MuxPlayer
                  ref={setVideoElement as any}
                  playbackId={video.muxPlaybackId}
                  autoPlay="any"
                  className="w-full h-full object-contain pointer-events-none"
                />
              </div>
            );
          }

          return (
            <video 
              ref={setVideoElement}
              src={video.url || undefined}
              playsInline
              crossOrigin="anonymous"
              className="w-full h-full object-contain cursor-pointer"
              onClick={togglePlay}
              autoPlay
              onError={() => {
                console.error("Video streaming failed, switching to archive embed.");
                setVideoError(true);
              }}
            />
          );
        })()}
        
        {/* Isolated Exit Fullscreen Button (Minor Mouse Move) */}
        <AnimatePresence>
          {isFullscreen && showExitFullscreenOnly && !controlsVisible && (
            <motion.button 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (document.exitFullscreen) {
                  document.exitFullscreen();
                } else if ((document as any).webkitExitFullscreen) {
                  (document as any).webkitExitFullscreen();
                }
              }}
              className="absolute top-8 right-8 p-4 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-black/80 transition-all z-[300]"
            >
              <Minimize2 size={24} />
            </motion.button>
          )}
        </AnimatePresence>
        
        {/* Custom Controls Overlay */}
        <div className={`absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 transition-all duration-500 ease-in-out z-10 ${controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <button 
            onClick={onBack}
            className="absolute top-8 left-8 p-4 bg-white/10 backdrop-blur-md rounded-full text-white hover:bg-white/20 transition-all shadow-xl"
          >
            <ArrowLeft size={24} />
          </button>
          
          <button 
             onClick={() => setShowComments(!showComments)}
             className="absolute top-8 right-8 px-6 py-4 bg-white/10 backdrop-blur-md rounded-full inline-flex items-center gap-2 text-white hover:bg-white/20 transition-all shadow-xl font-bold uppercase tracking-widest text-xs"
          >
             {showComments ? 'Hide Details' : 'Show Details'}
             {showComments ? <ChevronRight size={16}/> : <Info size={16}/>}
          </button>

          <div className="absolute bottom-0 left-0 right-0 p-8 space-y-6 bg-gradient-to-t from-black/60 to-transparent pt-32">
            <button className="px-6 py-2 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white rounded-full text-xs font-black uppercase tracking-widest transition-colors w-fit mb-4">Highlight</button>
            
            {/* Progress Bar */}
            <div className="flex items-center gap-4">
              <span className="text-[10px] font-black text-white/60 w-10 text-right">{formatTime(currentTime)}</span>
              <div 
                className="h-2 flex-1 bg-white/20 rounded-full overflow-hidden cursor-pointer group/progress relative"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const pct = x / rect.width;
                  seek(pct * duration);
                }}
              >
                <div 
                  className="h-full bg-gradient-to-r from-[#6B0099] to-[#FF8C00] relative drop-shadow-md"
                  style={{ width: `${progress}%` }}
                >
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.8)] scale-0 group-hover/progress:scale-100 transition-transform" />
                </div>
              </div>
              <span className="text-[10px] font-black text-white/60 w-10">{formatTime(duration)}</span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-8">
                <button onClick={togglePlay} className="text-white hover:scale-110 transition-transform">
                  {isPlaying ? <Pause size={32} fill="white" /> : <Play size={32} fill="white" />}
                </button>
                <div className="flex items-center gap-4">
                  <button onClick={() => setIsMuted(!isMuted)} className="text-white/60 hover:text-white transition-colors">
                    {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
                  </button>
                  <div className="hidden lg:block">
                    <h2 className="text-2xl font-display font-black uppercase tracking-tight text-white drop-shadow-md">{video.title}</h2>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#00DAF3]">{video.artist}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-8">
                <button onClick={handleLike} className={`flex flex-col items-center gap-1 transition-all ${isLiked ? 'text-red-500 scale-110' : 'text-white/60 hover:text-white'}`}>
                  <Heart size={24} fill={isLiked ? 'currentColor' : 'none'} />
                  <span className="text-[10px] font-black">{video.likesCount || 0}</span>
                </button>
                <button onClick={() => setShowComments(true)} className={`flex flex-col items-center gap-1 transition-all ${showComments ? 'text-[#00DAF3]' : 'text-white/60 hover:text-white'}`}>
                  <MessageCircle size={24} />
                  <span className="text-[10px] font-black">{comments.length}</span>
                </button>
                <button className="text-white/60 hover:text-white transition-colors flex flex-col items-center gap-1">
                  <Share2 size={24} />
                  <span className="text-[10px] font-black">Share</span>
                </button>
                {currentUser?.uid === video.ownerId && (
                  <button 
                    onClick={async () => {
                      try {
                        const { fetchUserProfile, updateUserProfile } = await import('../services/backendService');
                        const profile = await fetchUserProfile(currentUser.uid);
                        if (profile) {
                          const pinnedItems = profile.pinnedItems || [];
                          const newPin: { id: string; type: 'VIDEO'; refId: string } = { id: Date.now().toString(), type: 'VIDEO', refId: video.id };
                          if (!pinnedItems.find((p: any) => p.refId === video.id)) {
                            await updateUserProfile(currentUser.uid, { pinnedItems: [...pinnedItems, newPin] });
                            alert('Video Pinned to Profile!');
                          } else {
                            alert('Video is already pinned.');
                          }
                        }
                      } catch (e) { console.error(e); }
                    }}
                    className="text-small-orange/80 hover:text-small-orange transition-colors flex flex-col items-center gap-1"
                  >
                    <Zap size={24} />
                    <span className="text-[10px] font-black">Pin</span>
                  </button>
                )}
                <button 
                  onClick={() => {
                    if (isFullscreen) {
                      if (document.exitFullscreen) {
                        document.exitFullscreen();
                      } else if ((document as any).webkitExitFullscreen) {
                        (document as any).webkitExitFullscreen();
                      }
                    } else {
                      const container = playerContainerRef.current as any;
                      if (container) {
                        if (container.requestFullscreen) {
                          container.requestFullscreen().catch((err: any) => console.log(err));
                        } else if (container.webkitRequestFullscreen) {
                          container.webkitRequestFullscreen();
                        } else {
                          const videoElement = container.querySelector('video');
                          if (videoElement && videoElement.webkitEnterFullscreen) {
                            videoElement.webkitEnterFullscreen();
                          }
                        }
                      }
                    }
                  }}
                  className="text-white/60 hover:text-white transition-colors flex flex-col items-center gap-1 ml-4"
                >
                  {isFullscreen ? <Minimize2 size={28} /> : <Maximize2 size={28} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sidebar Section (Comments & Info) */}
      <AnimatePresence>
        {showComments && (
          <motion.aside 
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="w-full lg:w-[450px] bg-[#050505] border-l border-white/10 flex flex-col h-full z-50 relative"
          >
            <div className="p-8 border-b border-white/10 bg-gradient-to-b from-white/5 to-transparent">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-2xl font-black uppercase tracking-tighter text-white">Details</h3>
                <button onClick={() => setShowComments(false)} className="p-3 bg-white/5 hover:bg-white/10 rounded-full text-white/60 transition-colors"><X size={20} /></button>
              </div>

              {ownerProfile && (
                <div className="flex items-center gap-4 p-4 bg-white/5 rounded-3xl mb-6 border border-white/5">
                  <div className="w-12 h-12 rounded-full overflow-hidden ring-2 ring-[#00DAF3]/30">
                    <img src={ownerProfile.photoURL || null} alt={ownerProfile.displayName} className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black uppercase tracking-tight text-white">{ownerProfile.displayName}</h4>
                    <p className="text-[9px] font-black uppercase tracking-widest text-[#00DAF3]">Creator</p>
                  </div>
                  <button className="ml-auto px-6 py-2 bg-white text-black rounded-full text-[9px] font-black uppercase tracking-widest hover:scale-105 transition-all">Follow</button>
                </div>
              )}

              <p className="text-xs font-medium text-white/50 leading-relaxed uppercase tracking-wider">
                {video.description || "No description provided for this visual deployment."}
              </p>
            </div>

            {/* Comments List */}
            <div className="flex-1 overflow-hidden bg-[#0A0A0A]">
              <CommentSection 
                comments={comments}
                onPostComment={handlePostComment}
                currentUser={currentUser}
                title="Sourced Insights"
              />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
};

export default VideoPlayer;
