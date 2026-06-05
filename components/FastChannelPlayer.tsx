import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Pause, Volume2, VolumeX, SkipForward, SkipBack, Tv, X, Radio, Wifi } from 'lucide-react';
import MuxPlayer from '@mux/mux-player-react';
import { Video, UserProfile, FastChannelSchedule } from '../types';
import { fetchFastChannelVideos, fetchFastChannelSchedule } from '../services/backendService';

interface FastChannelPlayerProps {
  profile: UserProfile;
  onClose: () => void;
}

const formatTime = (secs: number) => {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

function buildEmbedUrl(url: string): string {
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    try {
      const u = new URL(url);
      const v = u.searchParams.get('v') || u.pathname.split('/').pop();
      return `https://www.youtube.com/embed/${v}?autoplay=1&mute=0`;
    } catch {}
  } else if (url.includes('twitch.tv')) {
    const channel = url.split('twitch.tv/')[1]?.split('/')[0];
    return `https://player.twitch.tv/?channel=${channel}&parent=${window.location.hostname}&autoplay=true`;
  }
  return url;
}

// Resolve the best playable URL for a video — mux HLS takes priority
function resolveVideoSrc(video: Video): { muxId?: string; url?: string } {
  if (video.muxPlaybackId) return { muxId: video.muxPlaybackId };
  return { url: video.url || '' };
}

const FastChannelPlayer: React.FC<FastChannelPlayerProps> = ({ profile, onClose }) => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showEPG, setShowEPG] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [hasExternalUrl, setHasExternalUrl] = useState(false);
  const [activeView, setActiveView] = useState<'FAST' | 'LIVE'>('FAST');
  const [liveInterruptActive, setLiveInterruptActive] = useState(false);
  const [channelSchedule, setChannelSchedule] = useState<FastChannelSchedule | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const muxRef = useRef<any>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interruptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const returnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasLiveFeed = Boolean(profile.liveStreamConfig?.streamUrl && profile.liveStreamConfig?.isActive);
  const liveEmbedUrl = profile.liveStreamConfig?.streamUrl ? buildEmbedUrl(profile.liveStreamConfig.streamUrl) : '';

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      const [vids, schedule] = await Promise.all([
        fetchFastChannelVideos(profile.uid),
        fetchFastChannelSchedule(profile.uid).catch(() => null),
      ]);
      const playable = vids.filter(v => v.muxPlaybackId || v.url);
      if (playable.length > 0) {
        setVideos(playable);
        setHasExternalUrl(false);
      } else if (profile.liveStreamConfig?.fastChannelUrl) {
        setHasExternalUrl(true);
      }
      if (schedule) setChannelSchedule(schedule);
      setIsLoading(false);
    };
    load();
  }, [profile.uid]);

  // Schedule live interrupt auto-switch
  useEffect(() => {
    if (!channelSchedule?.pendingLiveInterrupt || !hasLiveFeed) return;
    const { scheduledAt, maxDurationSeconds } = channelSchedule.pendingLiveInterrupt;
    const msUntil = scheduledAt - Date.now();
    if (msUntil < 0) return;

    interruptTimerRef.current = setTimeout(() => {
      setActiveView('LIVE');
      setLiveInterruptActive(true);
      if (maxDurationSeconds) {
        returnTimerRef.current = setTimeout(() => {
          setActiveView('FAST');
          setLiveInterruptActive(false);
        }, maxDurationSeconds * 1000);
      }
    }, msUntil);

    return () => {
      if (interruptTimerRef.current) clearTimeout(interruptTimerRef.current);
      if (returnTimerRef.current) clearTimeout(returnTimerRef.current);
    };
  }, [channelSchedule, hasLiveFeed]);

  const currentVideo = videos[currentIndex];
  const currentSrc = currentVideo ? resolveVideoSrc(currentVideo) : {};
  const usingMux = Boolean(currentSrc.muxId);

  const advance = useCallback(() => {
    setCurrentIndex(prev => (prev + 1) % videos.length);
    setCurrentTime(0);
    setDuration(0);
  }, [videos.length]);

  const goBack = useCallback(() => {
    setCurrentIndex(prev => (prev - 1 + videos.length) % videos.length);
    setCurrentTime(0);
    setDuration(0);
  }, [videos.length]);

  // For raw <video> fallback only
  useEffect(() => {
    if (usingMux) return;
    const v = videoRef.current;
    if (!v || !currentSrc.url) return;
    v.src = currentSrc.url;
    v.load();
    v.play().catch(() => {});
  }, [currentIndex, currentSrc.url, usingMux]);

  const resetControlsTimer = useCallback(() => {
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    setShowControls(true);
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 4000);
  }, []);

  useEffect(() => {
    resetControlsTimer();
    return () => { if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current); };
  }, []);

  const togglePlayback = useCallback(() => {
    if (usingMux) {
      const el = muxRef.current as HTMLVideoElement | null;
      if (!el) return;
      isPaused ? el.play() : el.pause();
    } else {
      const v = videoRef.current;
      if (!v) return;
      isPaused ? v.play() : v.pause();
    }
  }, [usingMux, isPaused]);

  const epgSchedule = videos.map((v, i) => ({
    video: v,
    index: i,
    isCurrent: i === currentIndex,
    isPast: i < currentIndex,
  }));

  const channelName = profile.displayName ? `${profile.displayName}'s Channel` : 'FAST Channel';

  const FeedTabs = hasLiveFeed ? (
    <div className="absolute top-0 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 pt-4">
      {(['FAST', 'LIVE'] as const).map(view => (
        <button
          key={view}
          onClick={() => setActiveView(view)}
          className={`flex items-center gap-1.5 px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-[0.3em] transition-all border ${
            activeView === view
              ? 'bg-white text-black border-white shadow-xl'
              : 'bg-black/50 text-white/60 border-white/10 backdrop-blur-md hover:border-white/30'
          }`}
        >
          {view === 'FAST' ? <Tv size={11} /> : <Wifi size={11} />}
          {view === 'FAST' ? 'FAST Channel' : 'Live Feed'}
          {view === 'LIVE' && profile.liveStreamConfig?.isActive && (
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
          )}
          {liveInterruptActive && view === 'LIVE' && (
            <span className="ml-1 text-[7px] bg-red-500 text-white px-1.5 py-0.5 rounded-full">AUTO</span>
          )}
        </button>
      ))}
    </div>
  ) : null;

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black z-[200] flex flex-col items-center justify-center gap-6">
        <div className="w-16 h-16 border-2 border-white/10 border-t-white rounded-full animate-spin" />
        <p className="text-[10px] font-black uppercase tracking-[0.5em] text-white/40">Tuning Channel...</p>
      </div>
    );
  }

  // Live Feed view
  if (activeView === 'LIVE') {
    return (
      <div className="fixed inset-0 bg-black z-[200] flex flex-col">
        {FeedTabs}
        <div className="flex items-center justify-between px-6 py-4 bg-black/80 backdrop-blur-sm z-10 mt-12">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-red-400">
              {liveInterruptActive ? 'Channel Interruption' : `${channelName} — Live`}
            </span>
          </div>
          <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
            <X size={16} className="text-white" />
          </button>
        </div>
        {liveEmbedUrl ? (
          <iframe src={liveEmbedUrl} className="flex-1 w-full border-none" allowFullScreen allow="autoplay; fullscreen" />
        ) : (
          <div className="flex-1 flex items-center justify-center flex-col gap-6">
            <Wifi size={48} className="text-white/20" />
            <p className="text-white/40 text-sm font-black uppercase tracking-widest">No live stream active</p>
          </div>
        )}
      </div>
    );
  }

  // External URL fallback (FAST view)
  if (hasExternalUrl && profile.liveStreamConfig?.fastChannelUrl) {
    return (
      <div className="fixed inset-0 bg-black z-[200] flex flex-col">
        {FeedTabs}
        <div className="flex items-center justify-between px-6 py-4 bg-black/80 backdrop-blur-sm z-10 mt-12">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/80">{channelName}</span>
          </div>
          <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
            <X size={16} className="text-white" />
          </button>
        </div>
        <iframe
          src={buildEmbedUrl(profile.liveStreamConfig.fastChannelUrl)}
          className="flex-1 w-full border-none"
          allowFullScreen
          allow="autoplay; fullscreen"
        />
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="fixed inset-0 bg-black z-[200] flex flex-col items-center justify-center gap-6 p-8">
        {FeedTabs}
        <Tv size={48} className="text-white/20" />
        <p className="text-xl font-black uppercase tracking-widest text-white/40">No content in channel</p>
        <p className="text-[10px] uppercase tracking-widest text-white/20 text-center max-w-xs">
          {profile.displayName} hasn't added any videos to their FAST channel yet.
        </p>
        <button
          onClick={onClose}
          className="px-8 py-3 bg-white/10 rounded-full text-white text-[10px] font-black uppercase tracking-widest hover:bg-white/20 transition-colors"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black z-[200] overflow-hidden select-none"
      onMouseMove={resetControlsTimer}
      onClick={resetControlsTimer}
    >
      {/* Video layer — Mux player or raw <video> fallback */}
      {usingMux ? (
        <MuxPlayer
          key={`mux-${currentIndex}`}
          ref={muxRef}
          playbackId={currentSrc.muxId!}
          autoPlay
          muted={isMuted}
          className="w-full h-full"
          onTimeUpdate={(e: any) => setCurrentTime(e.target.currentTime)}
          onLoadedMetadata={(e: any) => setDuration(e.target.duration)}
          onEnded={advance}
          onPlay={() => setIsPaused(false)}
          onPause={() => setIsPaused(true)}
        />
      ) : (
        <video
          key={`vid-${currentIndex}`}
          ref={videoRef}
          className="w-full h-full object-contain"
          autoPlay
          muted={isMuted}
          playsInline
          preload="auto"
          onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={e => setDuration(e.currentTarget.duration)}
          onEnded={advance}
          onPlay={() => setIsPaused(false)}
          onPause={() => setIsPaused(true)}
        />
      )}

      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/70 via-transparent to-black/30" />

      {FeedTabs}

      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 flex flex-col"
          >
            {/* Top bar */}
            <div className={`flex items-center justify-between px-6 pb-4 ${hasLiveFeed ? 'pt-16' : 'pt-6'}`}>
              <div className="flex items-center gap-3">
                {profile.photoURL && (
                  <img src={profile.photoURL} className="w-8 h-8 rounded-full object-cover border border-white/20" alt="" />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-[9px] font-black uppercase tracking-[0.4em] text-red-400">FAST Channel</span>
                  </div>
                  <p className="text-sm font-black uppercase tracking-widest text-white">{channelName}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowEPG(v => !v)}
                  className="flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-md rounded-full text-white text-[9px] font-black uppercase tracking-widest hover:bg-white/20 transition-colors border border-white/10"
                >
                  <Radio size={12} /> Guide
                </button>
                <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
                  <X size={16} className="text-white" />
                </button>
              </div>
            </div>

            <div className="flex-1" onClick={togglePlayback} />

            {/* Now Playing + Controls */}
            <div className="px-6 pb-8 space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-[8px] font-black uppercase tracking-[0.4em] text-white/40">Now Playing</p>
                  {usingMux && (
                    <span className="text-[7px] font-black uppercase tracking-widest bg-white/10 px-1.5 py-0.5 rounded-full text-white/40">HLS</span>
                  )}
                </div>
                <h3 className="text-2xl md:text-4xl font-black uppercase tracking-tight text-white line-clamp-1">
                  {currentVideo?.title}
                </h3>
                {currentVideo?.genre && (
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mt-1">{currentVideo.genre}</p>
                )}
              </div>

              {duration > 0 && (
                <div className="space-y-1">
                  <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-white rounded-full transition-all"
                      style={{ width: `${(currentTime / duration) * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[8px] font-black uppercase tracking-widest text-white/30">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4">
                <button onClick={goBack} className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
                  <SkipBack size={18} className="text-white" />
                </button>
                <button
                  onClick={togglePlayback}
                  className="p-4 rounded-full bg-white text-black hover:scale-105 transition-transform shadow-xl"
                >
                  {isPaused ? <Play size={22} fill="black" /> : <Pause size={22} />}
                </button>
                <button onClick={advance} className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
                  <SkipForward size={18} className="text-white" />
                </button>
                <button
                  onClick={() => setIsMuted(v => !v)}
                  className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors ml-auto"
                >
                  {isMuted ? <VolumeX size={18} className="text-white" /> : <Volume2 size={18} className="text-white" />}
                </button>
                <div className="text-[9px] font-black uppercase tracking-widest text-white/40">
                  {currentIndex + 1} / {videos.length}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* EPG Panel */}
      <AnimatePresence>
        {showEPG && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            className="absolute top-0 right-0 h-full w-80 bg-black/95 backdrop-blur-xl border-l border-white/10 flex flex-col z-10"
          >
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
              <div>
                <p className="text-[8px] font-black uppercase tracking-[0.4em] text-white/40 mb-0.5">Program Guide</p>
                <h4 className="text-sm font-black uppercase tracking-widest text-white">{channelName}</h4>
              </div>
              <button onClick={() => setShowEPG(false)} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                <X size={14} className="text-white/60" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {epgSchedule.map(({ video, index, isCurrent, isPast }) => (
                <button
                  key={video.id}
                  onClick={() => { setCurrentIndex(index); setShowEPG(false); }}
                  className={`w-full flex items-start gap-4 px-6 py-4 border-b border-white/5 transition-colors text-left ${
                    isCurrent ? 'bg-white/10' : 'hover:bg-white/5'
                  } ${isPast ? 'opacity-40' : ''}`}
                >
                  <div className="relative w-16 h-10 rounded-lg overflow-hidden shrink-0 bg-white/5">
                    {video.thumbnailUrl ? (
                      <img src={video.thumbnailUrl} className="w-full h-full object-cover" alt="" />
                    ) : video.muxPlaybackId ? (
                      <img
                        src={`https://image.mux.com/${video.muxPlaybackId}/thumbnail.jpg?width=128&time=5`}
                        className="w-full h-full object-cover"
                        alt=""
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Tv size={16} className="text-white/20" />
                      </div>
                    )}
                    {isCurrent && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <Play size={12} className="text-white" fill="white" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[10px] font-black uppercase tracking-tight truncate ${isCurrent ? 'text-white' : 'text-white/60'}`}>
                      {video.title}
                    </p>
                    {video.genre && (
                      <p className="text-[8px] font-black uppercase tracking-widest text-white/25 mt-0.5">{video.genre}</p>
                    )}
                    {isCurrent && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                        <span className="text-[8px] font-black uppercase tracking-widest text-red-400">Now Playing</span>
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default FastChannelPlayer;
