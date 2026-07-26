import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Pause, Volume2, VolumeX, SkipForward, SkipBack, Tv, X, Radio, Wifi } from 'lucide-react';
import MuxPlayer from '@mux/mux-player-react';
import Hls from 'hls.js';
import { UserProfile, FastChannelSchedule, FastChannelSlot } from '../types';
import { fetchFastChannelVideos, fetchFastChannelSchedule, auth } from '../services/backendService';
import { checkMembership } from '../services/sanctuaryService';
import { linearPosition, resolveSlotMedia, slotIsPlayable, slotsFromVideos } from '../services/fastChannelTimeline';

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

const FastChannelPlayer: React.FC<FastChannelPlayerProps> = ({ profile, onClose }) => {
  // The channel is now driven by its SLOT SCHEDULE (video / bumper / ad / public-domain / live),
  // not the raw video list — so bumpers, ad breaks, commercial-free and scheduled live all actually
  // air, and the on-screen "now" is computed the same deterministic way the EPG computes the guide.
  const [slots, setSlots] = useState<FastChannelSlot[]>([]);
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
  const [viewerIsMember, setViewerIsMember] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const muxRef = useRef<any>(null);
  const hlsRef = useRef<Hls | null>(null);
  const joinOffsetRef = useRef(0);   // seconds to seek into the joined slot (consumed once)
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interruptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const returnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasLiveFeed = Boolean(profile.liveStreamConfig?.streamUrl && profile.liveStreamConfig?.isActive);
  const liveEmbedUrl = profile.liveStreamConfig?.streamUrl ? buildEmbedUrl(profile.liveStreamConfig.streamUrl) : '';

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      const me = auth.currentUser?.uid;
      const [vids, schedule, isMember] = await Promise.all([
        fetchFastChannelVideos(profile.uid),
        fetchFastChannelSchedule(profile.uid).catch(() => null),
        // Sanctuary gate: a member (or the owner) sees the SPECIAL programming; everyone else gets
        // the regular loop. Linear channel → we FILTER members-only slots rather than paywall.
        (me && me === profile.uid) ? Promise.resolve(true) : checkMembership(profile.uid).then(m => !!m).catch(() => false),
      ]);
      setViewerIsMember(isMember);
      if (schedule) setChannelSchedule(schedule);

      // Which videos are members-only? Used to drop their slots for non-members.
      const exclusiveIds = new Set(vids.filter(v => (v as any).isExclusive).map(v => v.id));

      // Prefer the generated slot schedule; fall back to an ad-hoc video-only schedule so a channel
      // that hasn't been generated yet still plays. Then gate + keep only playable slots.
      let built: FastChannelSlot[] = schedule?.slots?.length
        ? [...schedule.slots].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        : slotsFromVideos(vids as any);
      if (!isMember) built = built.filter(s => !(s.videoId && exclusiveIds.has(s.videoId)));
      built = built.filter(slotIsPlayable);

      if (built.length > 0) {
        const { index, offsetSec } = linearPosition(built, Date.now());
        joinOffsetRef.current = offsetSec;
        setSlots(built);
        setCurrentIndex(index);
        setHasExternalUrl(false);
      } else if (profile.liveStreamConfig?.fastChannelUrl) {
        setHasExternalUrl(true);
      }
      setIsLoading(false);
    };
    load();
  }, [profile.uid]);

  // Ad-hoc scheduled live interrupt (pendingLiveInterrupt) — separate from LIVE_INTERRUPT slots in
  // the schedule (those air inline as the loop reaches them). This is the "cut to live NOW" path.
  useEffect(() => {
    if (!channelSchedule?.pendingLiveInterrupt || !hasLiveFeed) return;
    const { scheduledAt, maxDurationSeconds, membersOnly } = channelSchedule.pendingLiveInterrupt;
    if (membersOnly && !viewerIsMember) return;
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
  }, [channelSchedule, hasLiveFeed, viewerIsMember]);

  const currentSlot = slots[currentIndex];
  const media = currentSlot ? resolveSlotMedia(currentSlot) : null;
  const usingMux = Boolean(media?.muxPlaybackId);

  const advance = useCallback(() => {
    setCurrentIndex(prev => (slots.length ? (prev + 1) % slots.length : 0));
    setCurrentTime(0);
    setDuration(0);
    setIsPaused(false); // AD/LIVE slots have no media play event to clear a stale paused state
  }, [slots.length]);

  const goBack = useCallback(() => {
    setCurrentIndex(prev => (slots.length ? (prev - 1 + slots.length) % slots.length : 0));
    setCurrentTime(0);
    setDuration(0);
    setIsPaused(false);
  }, [slots.length]);

  // Raw <video> / HLS setup — for MEDIA slots that aren't Mux (mp4 uploads or non-Mux .m3u8).
  useEffect(() => {
    if (!media || media.kind !== 'MEDIA' || media.muxPlaybackId) return;
    const v = videoRef.current;
    if (!v || !media.url) return;
    if (media.isHls) {
      if (v.canPlayType('application/vnd.apple.mpegurl')) {
        v.src = media.url;
      } else if (Hls.isSupported()) {
        const hls = new Hls({ maxBufferLength: 30, enableWorker: true });
        hls.loadSource(media.url); hls.attachMedia(v); hlsRef.current = hls;
      } else {
        v.src = media.url;
      }
    } else {
      v.src = media.url;
    }
    v.load?.();
    v.play().catch(() => {});
    return () => { if (hlsRef.current) { try { hlsRef.current.destroy(); } catch { /* */ } hlsRef.current = null; } };
  }, [currentIndex, media?.url, media?.muxPlaybackId, media?.isHls]);

  // Advance driver. MEDIA slots normally advance on the element's `ended` event, but a safety timer
  // guarantees the loop never stalls if `ended` never fires (HLS stall / decode error on a TV). AD
  // and LIVE slots have no media end event, so their timer IS the advance. All timers honor the join
  // offset so a mid-slot join only waits out the remaining time.
  useEffect(() => {
    if (!media || isPaused) return;
    const off = joinOffsetRef.current || 0;
    const remaining = Math.max(1, media.durationSec - off);
    // For AD/LIVE the offset is consumed here (no metadata handler will); MEDIA consumes it on seek.
    if (media.kind !== 'MEDIA') joinOffsetRef.current = 0;
    const ms = (media.kind === 'MEDIA' ? remaining + 5 : remaining) * 1000; // +5s grace for MEDIA
    const t = setTimeout(advance, ms);
    return () => clearTimeout(t);
  }, [currentIndex, media?.kind, media?.durationSec, isPaused, advance]);

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

  // Program guide entries — only the real content slots (skip bumpers/ads), each pointing at its slot.
  const contentEntries = slots
    .map((s, i) => ({ slot: s, index: i }))
    .filter(({ slot }) => slot.type === 'VIDEO' || slot.type === 'PUBLIC_DOMAIN' || slot.type === 'LIVE_INTERRUPT');

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

  // Live Feed view (manual tab or an ad-hoc interrupt)
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

  if (slots.length === 0) {
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
      {/* Media layer — the current slot decides what renders. */}
      {media?.kind === 'AD' ? (
        // House ad break / commercial break — a branded interstitial for the slot's duration.
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-gradient-to-br from-[#1a0033] via-black to-[#33001a]">
          {profile.photoURL && <img src={profile.photoURL} className="w-16 h-16 rounded-2xl object-cover border border-white/15" alt="" />}
          <p className="text-[10px] font-black uppercase tracking-[0.5em] text-white/40">We'll be right back</p>
          <p className="text-2xl font-black uppercase tracking-tight text-white">{channelName}</p>
        </div>
      ) : media?.kind === 'LIVE' ? (
        // A scheduled live programme in the loop — show the creator's live feed for its window.
        liveEmbedUrl ? (
          <iframe src={liveEmbedUrl} className="absolute inset-0 w-full h-full border-none" allowFullScreen allow="autoplay; fullscreen" title="Live programme" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <Wifi size={44} className="text-white/20" />
            <p className="text-white/40 text-sm font-black uppercase tracking-widest">Live programme starting…</p>
          </div>
        )
      ) : usingMux ? (
        <MuxPlayer
          key={`mux-${currentIndex}`}
          ref={muxRef}
          playbackId={media!.muxPlaybackId!}
          autoPlay
          muted={isMuted}
          className="w-full h-full"
          onTimeUpdate={(e: any) => setCurrentTime(e.target.currentTime)}
          onLoadedMetadata={(e: any) => {
            setDuration(e.target.duration);
            if (joinOffsetRef.current > 0 && joinOffsetRef.current < e.target.duration - 2) {
              try { e.target.currentTime = joinOffsetRef.current; } catch { /* */ }
            }
            joinOffsetRef.current = 0;   // only the initial join seeks; auto-advance starts at 0
          }}
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
          onLoadedMetadata={e => {
            const el = e.currentTarget;
            setDuration(el.duration);
            if (joinOffsetRef.current > 0 && joinOffsetRef.current < el.duration - 2) {
              try { el.currentTime = joinOffsetRef.current; } catch { /* */ }
            }
            joinOffsetRef.current = 0;
          }}
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
                  {media?.isBumper && (
                    <span className="text-[7px] font-black uppercase tracking-widest bg-white/10 px-1.5 py-0.5 rounded-full text-white/40">Bumper</span>
                  )}
                  {media?.isPublicDomain && (
                    <span className="text-[7px] font-black uppercase tracking-widest bg-white/10 px-1.5 py-0.5 rounded-full text-white/40">Public Domain</span>
                  )}
                </div>
                <h3 className="text-2xl md:text-4xl font-black uppercase tracking-tight text-white line-clamp-1">
                  {media?.title}
                </h3>
              </div>

              {duration > 0 && media?.kind === 'MEDIA' && (
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
                  {currentIndex + 1} / {slots.length}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* EPG Panel — the channel's content line-up. */}
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
              {contentEntries.map(({ slot, index }) => {
                const m = resolveSlotMedia(slot);
                const isCurrent = index === currentIndex;
                const isPast = index < currentIndex;
                return (
                  <button
                    key={slot.id}
                    onClick={() => { joinOffsetRef.current = 0; setCurrentIndex(index); setShowEPG(false); }}
                    className={`w-full flex items-start gap-4 px-6 py-4 border-b border-white/5 transition-colors text-left ${
                      isCurrent ? 'bg-white/10' : 'hover:bg-white/5'
                    } ${isPast ? 'opacity-40' : ''}`}
                  >
                    <div className="relative w-16 h-10 rounded-lg overflow-hidden shrink-0 bg-white/5">
                      {m.thumbnail ? (
                        <img src={m.thumbnail} className="w-full h-full object-cover" alt="" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : m.muxPlaybackId ? (
                        <img
                          src={`https://image.mux.com/${m.muxPlaybackId}/thumbnail.jpg?width=128&time=5`}
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
                        {m.title}
                      </p>
                      {slot.type === 'LIVE_INTERRUPT' && (
                        <p className="text-[8px] font-black uppercase tracking-widest text-red-400/70 mt-0.5">Live programme</p>
                      )}
                      {isCurrent && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                          <span className="text-[8px] font-black uppercase tracking-widest text-red-400">Now Playing</span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default FastChannelPlayer;
