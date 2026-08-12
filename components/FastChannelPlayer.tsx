import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Pause, Volume2, VolumeX, SkipForward, SkipBack, Tv, X, Radio, Wifi } from 'lucide-react';
import Hls from 'hls.js';
import { UserProfile, FastChannelSchedule, FastChannelSlot } from '../types';
import { fetchFastChannelVideos, fetchFastChannelSchedule, auth } from '../services/backendService';
import { checkMembership } from '../services/sanctuaryService';
import { resolveSlotMedia, slotIsPlayable, slotsFromVideos, activeDaySlots, dayAnchoredPosition, linearPositionMidnight } from '../services/fastChannelTimeline';
import { hlsTuning, capLevelsToPanel } from '../services/hlsTuning';
import AdBreakBumper from './tv/AdBreakBumper';
import type { UpNextItem } from './tv/ComingUpNextBumper';

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
  // Midnight-anchored channel that has run out of programming for the day → off-air until midnight.
  const [offAirResumeMs, setOffAirResumeMs] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const joinOffsetRef = useRef(0);   // seconds to seek into the joined slot (consumed once)
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interruptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const returnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Reliability: a broken/empty asset must never stall the channel on black. These drive a load
  // watchdog + HLS error recovery that skip a dead slot fast instead of waiting out its full duration.
  const startedRef = useRef(false);      // did the current MEDIA slot actually start playing?
  const recoverRef = useRef(0);          // HLS fatal-error recovery attempts for the current slot
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipGuardRef = useRef(false);    // ensure we only auto-skip a given slot once

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

      // Prefer the generated slot schedule for TODAY (per-day weeklySlots override → default loop);
      // fall back to an ad-hoc video-only schedule so a channel that hasn't been generated yet still
      // plays. Then gate + keep only playable slots.
      const daySlots = activeDaySlots(schedule, Date.now());
      let built: FastChannelSlot[] = daySlots.length
        ? [...daySlots].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        : slotsFromVideos(vids as any);
      // Backfill playable URLs: an older/auto-generated slot may have stored only a videoId (or a stale
      // empty videoUrl). Resolve it from the live library (Mux master preferred) so it plays instead of
      // being dropped — a major reliability win for channels built before URLs were denormalised.
      const vById = new Map((vids as any[]).map(v => [v.id, v]));
      built = built.map(s => {
        if ((s.type === 'VIDEO' || s.type === 'PUBLIC_DOMAIN') && s.videoId && vById.has(s.videoId)) {
          const v = vById.get(s.videoId);
          const resolved = v.muxPlaybackId ? `https://stream.mux.com/${v.muxPlaybackId}.m3u8` : (v.url || '');
          const needsUrl = !s.videoUrl || (!/\.m3u8|stream\.mux\.com/.test(s.videoUrl) && v.muxPlaybackId);
          return {
            ...s,
            videoUrl: needsUrl && resolved ? resolved : s.videoUrl,
            videoThumbnail: s.videoThumbnail || v.thumbnailUrl || v.coverImageUrl,
            videoDurationSeconds: s.videoDurationSeconds || (v.duration ? Math.round(v.duration) : undefined),
          };
        }
        return s;
      });
      if (!isMember) built = built.filter(s => !(s.videoId && exclusiveIds.has(s.videoId)));
      built = built.filter(slotIsPlayable);
      // Robustness: a scheduled channel whose slots don't resolve to a playable URL (e.g. slots that
      // stored only a videoId, or a Mux id that never got written to videoUrl) would otherwise show
      // "No content". Fall back to the raw library so the channel still airs its videos.
      if (built.length === 0 && vids.length > 0) {
        built = slotsFromVideos(vids as any).filter(s => (isMember || !(s.videoId && exclusiveIds.has(s.videoId)))).filter(slotIsPlayable);
      }

      if (built.length > 0) {
        // Terrestrial join: anchor to the TIME OF DAY (local-midnight) so tuning in at 3pm lands on
        // the 3pm programme AND seeks mid-way into it — never restarts the schedule from the top.
        const pos = schedule?.midnightAnchored
          ? linearPositionMidnight(built, Date.now())
          : dayAnchoredPosition(built, Date.now());
        setSlots(built);
        setHasExternalUrl(false);
        if ('offAir' in pos && pos.offAir) {
          setOffAirResumeMs(Date.now() + pos.resumesInSec * 1000);
        } else {
          joinOffsetRef.current = pos.offsetSec;
          setCurrentIndex(pos.index);
        }
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

  // The next 3 real programmes after the current slot (skip ads/bumpers), for the coming-up-next bumper.
  const upNext: UpNextItem[] = (() => {
    const out: UpNextItem[] = [];
    for (let k = 1; k <= slots.length && out.length < 3; k++) {
      const s = slots[(currentIndex + k) % slots.length];
      if (!s || !(s.type === 'VIDEO' || s.type === 'PUBLIC_DOMAIN' || s.type === 'LIVE_INTERRUPT')) continue;
      const m = resolveSlotMedia(s);
      out.push({
        title: m.title,
        thumbnail: m.thumbnail || (m.muxPlaybackId ? `https://image.mux.com/${m.muxPlaybackId}/thumbnail.jpg?width=320&time=5` : undefined),
        badge: s.isReplay ? 'Replay' : s.type === 'LIVE_INTERRUPT' ? 'Live' : s.type === 'PUBLIC_DOMAIN' ? 'Public Domain' : undefined,
      });
    }
    return out;
  })();
  // All FAST video plays through ONE adaptive HLS.js path (like VideoPlayer) rather than MuxPlayer —
  // so it honors the app's per-panel rendition cap (capLevelsToPanel) on the TV instead of letting a
  // web component authorise a 4K rendition on a 1080p Mali GPU. Mux ids become their master .m3u8.
  const hlsSrc = media?.kind === 'MEDIA'
    ? (media.muxPlaybackId ? `https://stream.mux.com/${media.muxPlaybackId}.m3u8` : (media.isHls ? media.url : undefined))
    : undefined;
  const mp4Src = media?.kind === 'MEDIA' && !hlsSrc ? media.url : undefined;
  const isHlsMedia = Boolean(hlsSrc);

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

  // Video setup for MEDIA slots. HLS (Mux master or a non-Mux .m3u8) → hls.js with the shared,
  // device-tuned config + per-panel rendition cap (adaptive/auto: startLevel -1, ABR picks up, never
  // decodes more pixels than the panel). Plain mp4 → the element plays it directly.
  useEffect(() => {
    if (!media || media.kind !== 'MEDIA') return;
    const v = videoRef.current;
    if (!v) return;
    startedRef.current = false;
    recoverRef.current = 0;
    skipGuardRef.current = false;

    const clearWatch = () => { if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; } };
    // Skip a dead slot ONCE — a broken/unreachable asset should never hold the channel on black.
    const skipBroken = () => { if (skipGuardRef.current) return; skipGuardRef.current = true; clearWatch(); advance(); };
    // Watchdog: if the asset hasn't started within 9s, it's almost certainly unplayable → skip.
    clearWatch();
    watchdogRef.current = setTimeout(() => { if (!startedRef.current) skipBroken(); }, 9000);
    const onStarted = () => { startedRef.current = true; clearWatch(); };
    v.addEventListener('playing', onStarted);
    v.addEventListener('loadeddata', onStarted);

    if (hlsSrc) {
      if (v.canPlayType('application/vnd.apple.mpegurl')) {
        v.src = hlsSrc;                       // Safari — native adaptive HLS
        v.play().catch(() => {});
      } else if (Hls.isSupported()) {
        const hls = new Hls(hlsTuning());
        hlsRef.current = hls;
        hls.loadSource(hlsSrc); hls.attachMedia(v);
        hls.on(Hls.Events.MANIFEST_PARSED, () => { capLevelsToPanel(hls as any); v.play().catch(() => {}); });
        // Recover from transient network/media faults; give up (skip) after 2 tries so a genuinely
        // dead stream doesn't loop errors forever behind a black screen.
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (!data?.fatal) return;
          if (recoverRef.current >= 2) { skipBroken(); return; }
          recoverRef.current++;
          try {
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
            else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
            else skipBroken();
          } catch { skipBroken(); }
        });
      } else {
        v.src = hlsSrc;
        v.play().catch(() => {});
      }
    } else if (mp4Src) {
      v.src = mp4Src;
      v.load?.();
      v.play().catch(() => {});
    }
    return () => {
      clearWatch();
      v.removeEventListener('playing', onStarted);
      v.removeEventListener('loadeddata', onStarted);
      if (hlsRef.current) { try { hlsRef.current.destroy(); } catch { /* */ } hlsRef.current = null; }
    };
  }, [currentIndex, hlsSrc, mp4Src, advance]);

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
    const v = videoRef.current;
    if (!v) return;
    isPaused ? v.play() : v.pause();
  }, [isPaused]);

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

  // Off-air card — a midnight-anchored channel that finished its day's programming (terrestrial sign-off).
  if (offAirResumeMs) {
    return (
      <div className="fixed inset-0 bg-black z-[200] flex flex-col items-center justify-center gap-5 p-8">
        {FeedTabs}
        {profile.photoURL && <img src={profile.photoURL} className="w-16 h-16 rounded-2xl object-cover border border-white/15" alt="" />}
        <Tv size={40} className="text-white/20" />
        <p className="text-[10px] font-black uppercase tracking-[0.5em] text-white/40">{channelName}</p>
        <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight text-white text-center">Programming resumes at midnight</h2>
        <p className="text-[10px] uppercase tracking-widest text-white/30">Back in {Math.max(1, Math.round((offAirResumeMs - Date.now()) / 60000))} min</p>
        <button onClick={onClose} className="mt-2 px-8 py-3 bg-white/10 rounded-full text-white text-[10px] font-black uppercase tracking-widest hover:bg-white/20 transition-colors">Close</button>
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
        // Ad break with no user ad → the default Plajah "back shortly" bumper: Plajah FM fades in over
        // full-screen cover art (gift/like/add), a coming-up-next card opens the break, then the ad rail
        // cycles in 16:9 for the rest of the slot's duration (set by the channel's ad settings).
        <AdBreakBumper channelName={channelName} durationSec={media.durationSec} upcoming={upNext} logoUrl={profile.photoURL || undefined} />
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
      ) : (
        // One adaptive <video> for every MEDIA slot (Mux master, non-Mux HLS, or mp4). The hls.js
        // setup effect above attaches the stream; this element owns join-seek + auto-advance.
        <video
          key={`vid-${currentIndex}`}
          ref={videoRef}
          className="w-full h-full object-contain"
          autoPlay
          muted={isMuted}
          playsInline
          preload="auto"
          poster={media?.thumbnail || (media?.muxPlaybackId ? `https://image.mux.com/${media.muxPlaybackId}/thumbnail.jpg?width=640&time=5` : undefined)}
          onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={e => {
            const el = e.currentTarget;
            setDuration(el.duration);
            if (joinOffsetRef.current > 0 && joinOffsetRef.current < el.duration - 2) {
              try { el.currentTime = joinOffsetRef.current; } catch { /* */ }
            }
            joinOffsetRef.current = 0;   // only the initial join seeks; auto-advance starts at 0
          }}
          onEnded={advance}
          onPlay={() => setIsPaused(false)}
          onPause={() => setIsPaused(true)}
          onError={() => { if (!startedRef.current && !skipGuardRef.current) { skipGuardRef.current = true; advance(); } }}
        />
      )}

      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/70 via-transparent to-black/30" />

      {/* Corner bug — REPLAY (saved Reello live stream) / PROMO, over the playout like broadcast TV. */}
      {media?.kind === 'MEDIA' && (currentSlot?.isReplay || currentSlot?.isPromo || currentSlot?.bugLabel) && (
        <div className={`absolute top-4 right-4 z-20 px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-[0.3em] backdrop-blur-sm border ${currentSlot?.isReplay ? 'bg-red-600/80 border-red-400/40 text-white' : 'bg-fuchsia-600/80 border-fuchsia-400/40 text-white'}`}>
          {currentSlot?.bugLabel || (currentSlot?.isReplay ? 'REPLAY' : 'PROMO')}
        </div>
      )}

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
                  {isHlsMedia && (
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
