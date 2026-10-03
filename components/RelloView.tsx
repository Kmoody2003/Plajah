import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { ArrowLeft, Heart, MessageCircle, Share2, ChevronUp, ChevronDown, Radio, FlaskConical, ExternalLink, X, Play, Volume2, VolumeX, Tv, Maximize2, Clock, Film, Sparkles, Clapperboard } from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';
import { fetchAllVideos, fetchVideoById, fetchVideosByInterests, fetchFollowedVideos, createPost } from '../services/backendService';
import { shareAsset, shareText, buildShareUrl } from '../services/deepLinkService';
import { blendRelloFeed } from '../services/relloFeedService';
import { recordProgress } from '../services/watchHistoryService';
import { likeVideo, unlikeVideo, checkIfLiked, fetchUserProfile } from '../services/backendService';
import ShareButton from './ShareButton';
// Blueprint 1A.7 — the Reello feed respects the EXISTING kids-mode / content-safety
// engine (services/contentSafety.ts). No new safety logic lives here: we resolve the
// viewer's profile and run the assembled feed through the shared filter, which already
// force-clamps child accounts and reads the isExplicit/isNSFW/contentRating flags.
import { filterForViewer, isContentAllowed } from '../services/contentSafety';
import { Video, UserProfile } from '../types';
import { SCIENCE_STREAMS, ScienceStream } from './scienceStreams';
import ShortsGestureLayer from './reello/ShortsGestureLayer';
import ReelloComments from './reello/ReelloComments';
import { SubtitleTracks, usableSubtitles } from './reello/CaptionTracks';
import ReelloUniversalVideoPlayer from './reello/ReelloUniversalVideoPlayer';
import ReelloLivePremierePlayer from './reello/ReelloLivePremierePlayer';
import ReelloPremiereSchedulerModal from './reello/ReelloPremiereSchedulerModal';

/**
 * Vertical-first: a creator may supply a pre-rendered 9:16 master. It isn't on the `Video`
 * interface yet, so read it structurally — when absent this is simply undefined and the
 * feed falls back to the Mux stream / landscape URL exactly as before.
 */
const verticalUrlOf = (v: Video | null | undefined): string | undefined =>
  (v as unknown as { verticalVideoUrl?: string } | null | undefined)?.verticalVideoUrl || undefined;

const GoLiveWizard = lazy(() => import('./GoLiveWizard'));

interface RelloViewProps {
  onBack: () => void;
  currentUser: FirebaseUser | null;
  /** Deep-link: open the feed positioned on this video (a shared Reello link). */
  initialVideoId?: string;
}

const RelloView: React.FC<RelloViewProps> = ({ onBack, currentUser, initialVideoId }) => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showGoLive, setShowGoLive] = useState(false);
  const [showPremiereScheduler, setShowPremiereScheduler] = useState(false);
  // A shared video link opens a FOCUSED page (just that video) — no discovery chrome.
  const focused = !!initialVideoId;
  const [showScienceBanner, setShowScienceBanner] = useState(!initialVideoId);
  const [activeStream, setActiveStream] = useState<ScienceStream | null>(null);
  const [shared, setShared] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [showComments, setShowComments] = useState(true);
  const [commentCount, setCommentCount] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [useUniversalPlayer, setUseUniversalPlayer] = useState(() => {
    try { return localStorage.getItem('plajah_use_universal_player') === 'true'; } catch { return false; }
  });
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const liveStreams = SCIENCE_STREAMS.filter(s => s.isLive && s.isEmbeddable).slice(0, 5);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Resolve the viewer's profile first — the content-safety engine needs the
      // UserProfile (child flag + parental controls), not just the auth user. A failed
      // lookup yields null, which resolveControls() treats as an unrestricted adult;
      // that matches every other surface's behaviour for signed-out viewers.
      let viewer: UserProfile | null = null;
      if (currentUser?.uid) {
        viewer = await fetchUserProfile(currentUser.uid).catch(() => null);
        if (cancelled) return;
      }

      const CINEMA_GENRES = ['Movie', 'TV Series', 'Feature Film'];
      const isRelloVideo = (v: Video) => v.isRello === true || (v.isRello == null && !v.isLiveRecording && !(v.genre && CINEMA_GENRES.includes(v.genre)));
      const safe = (vs: Video[]) => filterForViewer(vs, viewer);

      // FOCUSED SHARE MODE — a shared Reello link opens THAT video first:
      // fetch it by id, position it at index 0, start immediately, then load
      // the remaining Reello feed behind it so the user can keep browsing.
      if (initialVideoId) {
        let target: Video | undefined;
        try { target = (await fetchVideoById(initialVideoId)) || undefined; } catch { /* fall back below */ }
        if (cancelled) return;
        // A deep link must not become a hole in the filter — gate the single video too.
        if (target && !isContentAllowed(target, viewer)) target = undefined;
        if (target) {
          setVideos([target]);
          setCurrentIndex(0);
          setLoading(false);
          // Pre-load subsequent reels in background
          fetchAllVideos().then(all => {
            if (cancelled) return;
            const remaining = safe(all.filter(v => v.id !== target?.id && isRelloVideo(v)));
            setVideos([target!, ...remaining]);
          }).catch(() => {});
          return;
        }
        // Unknown/removed/blocked id → fall through to the normal feed so it isn't a dead end.
      }
      const all = await fetchAllVideos();
      if (cancelled) return;
      const recentRello = safe(all.filter(isRelloVideo));
      let relloVideos = recentRello;

      // Personalize the initial order: blend interest-scored + followed-creator
      // Reello shorts with trending/fresh. Falls back to the flat recent list when
      // signed out or when the personalization calls fail/return empty.
      const uid = currentUser?.uid;
      if (uid) {
        try {
          const [interested, followed] = await Promise.all([
            fetchVideosByInterests(uid).catch(() => [] as Video[]),
            fetchFollowedVideos(uid).catch(() => [] as Video[]),
          ]);
          if (cancelled) return;
          const onlyRello = (vs: Video[]) => safe(vs.filter(isRelloVideo));
          const blended = blendRelloFeed({
            interestVideos: onlyRello(interested),
            followedVideos: onlyRello(followed),
            recentVideos: recentRello,
          });
          if (blended.length > 0) relloVideos = blended;
        } catch { /* keep flat recent list */ }
      }
      // Belt and braces: the blender may reorder/merge, so gate the final list too.
      setVideos(safe(relloVideos));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [initialVideoId, currentUser?.uid]);

  // Record watch progress for the currently-playing Reello short (throttled ~5s
  // + on pause + on unmount / index change).
  const current = videos[currentIndex] ?? null;
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !current) return;
    let last = 0;
    const record = () => {
      const dur = el.duration;
      const pos = el.currentTime;
      if (!(dur > 0) || isNaN(dur) || !(pos > 0) || isNaN(pos)) return;
      recordProgress({
        id: current.id,
        kind: 'RELLO',
        title: current.title,
        thumbnailUrl: current.thumbnailUrl || current.coverImageUrl || undefined,
        ownerName: current.artist || undefined,
        positionSec: pos,
        durationSec: dur,
        worldId: current.worldId,
      }).catch(() => {});
    };
    const onTime = () => {
      setCurrentTime(el.currentTime);
      setDuration(el.duration);
      const now = Date.now();
      if (now - last >= 5000) { last = now; record(); }
    };
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('pause', record);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('pause', record);
      record();
    };
  }, [current?.id]);

  // Resolve playback. Plajah videos are uploaded to MUX — a Mux video has an EMPTY `url` and only a
  // `muxPlaybackId` (HLS at stream.mux.com), which a plain <video src> can't play → it rendered black.
  // Prefer the Mux HLS stream (via hls.js, native HLS on Safari); fall back to a direct `url`.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !current) return;
    let hls: any;
    let cancelled = false;
    // Vertical-first: a pre-rendered 9:16 master beats both the Mux ladder and the
    // landscape original — it needs no cropping and is already framed for this feed.
    const vertical = verticalUrlOf(current);
    const pid = vertical ? undefined : ((current as any).muxPlaybackId as string | undefined);
    const direct = vertical || current.url;
    (async () => {
      try {
        if (pid) {
          const streamUrl = `https://stream.mux.com/${pid}.m3u8`;
          if (v.canPlayType('application/vnd.apple.mpegurl')) {
            v.src = streamUrl;
            v.play?.().catch(() => {
              setIsMuted(true);
              v.muted = true;
              v.play?.().catch(() => { setIsPaused(true); });
            });
          } else {
            const { default: Hls } = await import('hls.js');
            if (cancelled) return;
            if (Hls.isSupported()) {
              hls = new Hls({ enableWorker: true, maxBufferLength: 30, startLevel: -1 });
              hls.loadSource(streamUrl);
              hls.attachMedia(v);
              hls.on(Hls.Events.MANIFEST_PARSED, () => {
                if (cancelled) return;
                v.play?.().catch(() => {
                  setIsMuted(true);
                  v.muted = true;
                  v.play?.().catch(() => { setIsPaused(true); });
                });
              });
            } else {
              v.src = streamUrl; // last resort
              v.play?.().catch(() => {
                setIsMuted(true);
                v.muted = true;
                v.play?.().catch(() => { setIsPaused(true); });
              });
            }
          }
        } else if (direct) {
          v.src = direct;
          v.play?.().catch(() => {
            setIsMuted(true);
            v.muted = true;
            v.play?.().catch(() => { setIsPaused(true); });
          });
        }
      } catch {
        if (direct) {
          v.src = direct;
          v.play?.().catch(() => {
            setIsMuted(true);
            v.muted = true;
            v.play?.().catch(() => { setIsPaused(true); });
          });
        }
      }
    })();
    return () => { cancelled = true; try { hls?.destroy(); } catch { /* */ } };
    // Re-run when the Mux id (or url) resolves so a still-transcoding shared video starts on its own.
  }, [current?.id, (current as any)?.muxPlaybackId, current?.url, verticalUrlOf(current)]);

  // If the current video (e.g. a link shared right after publishing) has no playable source yet,
  // watch its doc so it plays the moment Mux finishes transcoding — no manual reload needed.
  useEffect(() => {
    if (!current || (current as any).muxPlaybackId || current.url || verticalUrlOf(current)) return;
    const id = current.id;
    let unsub: (() => void) | undefined;
    (async () => {
      try {
        const { db } = await import('../services/firebase');
        const { doc, onSnapshot } = await import('firebase/firestore');
        unsub = onSnapshot(doc(db, 'videos', id), (snap) => {
          const d: any = snap.data(); if (!d) return;
          if (d.muxPlaybackId || d.url) {
            setVideos(vs => vs.map(v => v.id === id ? { ...v, muxPlaybackId: d.muxPlaybackId, url: d.url } : v));
          }
        });
      } catch { /* offline — the poster + Processing hint stay up */ }
    })();
    return () => { try { unsub?.(); } catch { /* */ } };
  }, [current?.id, (current as any)?.muxPlaybackId, current?.url]);

  // Reset per-clip interaction state and pull this viewer's like status.
  useEffect(() => {
    setShowComments(false);
    setCommentCount(null);
    setIsLiked(false);
    if (!current?.id || !currentUser) return;
    let alive = true;
    checkIfLiked(current.id).then(l => { if (alive) setIsLiked(!!l); }).catch(() => {});
    return () => { alive = false; };
  }, [current?.id, currentUser?.uid]);

  // Double-tap-to-like (and the action-bar heart). Optimistic; reverts on failure.
  const toggleLike = async () => {
    if (!current?.id || !currentUser || likeBusy) return;
    const next = !isLiked;
    setIsLiked(next);
    setLikeBusy(true);
    try {
      if (next) await likeVideo(current.id);
      else await unlikeVideo(current.id);
    } catch {
      setIsLiked(!next);
    } finally {
      setLikeBusy(false);
    }
  };

  const shareCurrent = async () => {
    if (!current) return;
    await shareAsset('video', current.id, { title: current.title, text: shareText(current.title, (current as any).channelName || (current as any).creatorName || (current as any).uploaderName) });
    setShared(true);
    setTimeout(() => setShared(false), 2000);
  };

  const goNext = () => setCurrentIndex(i => Math.min(i + 1, videos.length - 1));
  const goPrev = () => setCurrentIndex(i => Math.max(i - 1, 0));

  const seekTo = (seconds: number) => {
    const v = videoRef.current;
    if (v) {
      v.currentTime = seconds;
      v.play().catch(() => {});
      setIsPaused(false);
    }
  };

  const playRecommended = (index: number) => {
    setCurrentIndex(index);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const recommendedVideos = videos
    .map((v, i) => ({ video: v, index: i }))
    .filter(item => item.index !== currentIndex);

  return (
    <div className="w-full min-h-screen bg-[#07060a] text-white flex flex-col relative overflow-x-hidden">
      {/* ── Top Header Navigation Bar ── */}
      <header className="sticky top-0 z-30 w-full bg-black/80 backdrop-blur-xl border-b border-white/10 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all text-white active:scale-95"
            aria-label="Go Back"
          >
            <ArrowLeft size={18} />
          </button>

          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-[0.25em] text-white">Rello</span>
            {isTheaterMode && (
              <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-orange-500/20 text-orange-400 border border-orange-500/30">
                Theater Mode
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Universal Player Mode Toggle */}
          <button
            onClick={() => {
              const next = !useUniversalPlayer;
              setUseUniversalPlayer(next);
              try { localStorage.setItem('plajah_use_universal_player', next ? 'true' : 'false'); } catch {}
            }}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full border text-xs font-black uppercase tracking-wider transition-all active:scale-95 ${
              useUniversalPlayer
                ? 'bg-amber-500 text-black border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.4)]'
                : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/70 hover:text-white'
            }`}
            title={useUniversalPlayer ? 'Using Universal Video Player' : 'Switch to Universal Video Player'}
          >
            <Sparkles size={14} className={useUniversalPlayer ? 'text-black' : 'text-amber-400'} />
            <span className="hidden md:inline">{useUniversalPlayer ? 'Universal ON' : 'Universal'}</span>
          </button>

          {/* Theater Mode Toggle Button */}
          <button
            onClick={() => setIsTheaterMode(t => !t)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full border text-xs font-black uppercase tracking-wider transition-all active:scale-95 ${
              isTheaterMode
                ? 'bg-orange-500 text-black border-orange-400 shadow-[0_0_15px_rgba(255,140,0,0.35)]'
                : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/70 hover:text-white'
            }`}
            title={isTheaterMode ? 'Exit Theater Mode' : 'Enter Theater Mode'}
          >
            <Tv size={15} />
            <span className="hidden sm:inline">{isTheaterMode ? 'Standard' : 'Theater'}</span>
          </button>

          {/* Mute/Unmute */}
          <button
            onClick={() => {
              const next = !isMuted;
              setIsMuted(next);
              if (videoRef.current) videoRef.current.muted = next;
            }}
            className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all text-white active:scale-95"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX size={17} className="text-red-400" /> : <Volume2 size={17} className="text-white" />}
          </button>

          {/* Live Premiere Setup */}
          {currentUser && (
            <button
              onClick={() => setShowPremiereScheduler(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 rounded-full transition-all shadow-lg active:scale-95 text-xs font-black uppercase tracking-wider text-white"
              title="Schedule a Live Premiere with Countdown & Pre-roll"
            >
              <Clapperboard size={14} className="text-white" />
              <span className="hidden md:inline">Live Premiere</span>
            </button>
          )}

          {/* Go Live */}
          {currentUser && (
            <button
              onClick={() => setShowGoLive(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 rounded-full transition-all shadow-lg active:scale-95 text-xs font-black uppercase tracking-wider"
            >
              <Radio size={13} className="text-white animate-pulse" />
              <span className="hidden sm:inline">Go Live</span>
            </button>
          )}
        </div>
      </header>

      {/* GoLiveWizard modal */}
      {showGoLive && (
        <Suspense fallback={null}>
          <GoLiveWizard onClose={() => setShowGoLive(false)} currentUser={currentUser} />
        </Suspense>
      )}

      {/* Premiere Scheduler modal */}
      {showPremiereScheduler && current && (
        <ReelloPremiereSchedulerModal
          video={current}
          isOpen={showPremiereScheduler}
          onClose={() => setShowPremiereScheduler(false)}
          currentUser={currentUser}
          onUpdated={(updatedVideo) => {
            setVideos(vs => vs.map(v => v.id === updatedVideo.id ? updatedVideo : v));
          }}
        />
      )}

      {/* Science & Space Live discovery row */}
      {!focused && showScienceBanner && !activeStream && (
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 pt-4">
          <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <FlaskConical size={12} className="text-[#00B4D8]" />
                <span className="text-[9px] font-black uppercase tracking-widest text-[#00B4D8]">Science Live Discovery</span>
              </div>
              <button onClick={() => setShowScienceBanner(false)} className="text-white/30 hover:text-white transition-colors">
                <X size={13} />
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar" style={{ scrollbarWidth: 'none' }}>
              {liveStreams.map(stream => (
                <button
                  key={stream.id}
                  onClick={() => setActiveStream(stream)}
                  className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all"
                >
                  <span className="text-base">{stream.emoji}</span>
                  <div className="text-left">
                    <p className="text-[9px] font-black text-white leading-tight">{stream.source}</p>
                    <p className="text-[8px] text-white/40 leading-tight truncate max-w-[100px]">{stream.title.split('—')[0].trim()}</p>
                  </div>
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen science stream overlay */}
      {activeStream && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur border-b border-white/8 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-lg">{activeStream.emoji}</span>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-[#00B4D8]">{activeStream.source}</p>
                <p className="text-xs font-black text-white">{activeStream.title}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a href={activeStream.directUrl} target="_blank" rel="noopener noreferrer" className="p-2 bg-white/8 border border-white/10 rounded-xl text-white/50 hover:text-white transition-colors">
                <ExternalLink size={14} />
              </a>
              <button onClick={() => setActiveStream(null)} className="p-2 bg-white/8 border border-white/10 rounded-xl text-white/40 hover:text-white transition-colors">
                <X size={14} />
              </button>
            </div>
          </div>
          <div className="flex-1">
            <iframe src={activeStream.embedUrl} className="w-full h-full border-none" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center py-32 gap-4 text-white/40">
          <div className="w-12 h-12 border-2 border-white/20 border-t-orange-500 rounded-full animate-spin" />
          <p className="text-xs font-black uppercase tracking-widest text-white/60">Loading Rello...</p>
        </div>
      ) : videos.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-32 gap-4 text-white/40 max-w-sm mx-auto text-center px-6">
          <Film size={36} className="text-white/20" />
          <p className="text-xs font-black uppercase tracking-widest leading-relaxed">
            No Rello videos yet. Attach a video to a post and tap "Send to Rello".
          </p>
        </div>
      ) : useUniversalPlayer && current ? (
        <div className="flex-1 w-full relative min-h-[85vh]">
          <ReelloUniversalVideoPlayer
            video={current}
            context="REELLO"
            currentUser={currentUser}
            onClose={() => setUseUniversalPlayer(false)}
          />
        </div>
      ) : current?.isPremiere ? (
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-8 flex flex-col space-y-6">
              <ReelloLivePremierePlayer
                video={current}
                currentUser={currentUser}
                isTheaterMode={isTheaterMode}
                onToggleTheater={() => setIsTheaterMode(t => !t)}
                isOwner={currentUser?.uid === current.ownerId}
              />
              {/* Creator Premiere Controls */}
              {currentUser?.uid === current.ownerId && (
                <div className="bg-[#111116] border border-white/10 rounded-2xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Radio size={16} className="text-red-400" />
                    <div>
                      <p className="text-xs font-bold text-white">Live Premiere Settings</p>
                      <p className="text-[10px] text-white/50">Manage scheduled start, countdown themes, and pre-roll teaser</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowPremiereScheduler(true)}
                    className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition-all"
                  >
                    Edit Premiere
                  </button>
                </div>
              )}
            </div>

            {/* Right Column: Recommended Videos Grid */}
            <div className="lg:col-span-4 flex flex-col space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-white/8">
                <h3 className="text-xs font-black uppercase tracking-widest text-white/70 flex items-center gap-2">
                  <Film size={14} className="text-orange-400" />
                  Upcoming & Other Reels
                </h3>
                <span className="text-[10px] font-bold text-white/40">({recommendedVideos.length})</span>
              </div>

              <div className="space-y-3">
                {recommendedVideos.map(({ video: item, index: originalIdx }) => (
                  <div
                    key={item.id}
                    onClick={() => playRecommended(originalIdx)}
                    className="flex gap-3 p-2.5 rounded-2xl bg-[#111116] hover:bg-[#181820] border border-white/8 hover:border-white/20 transition-all cursor-pointer group active:scale-[0.98]"
                  >
                    <div className="w-24 h-32 rounded-xl overflow-hidden bg-black/60 shrink-0 relative border border-white/10">
                      <img
                        src={item.thumbnailUrl || item.coverImageUrl || ''}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors" />
                      <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-mono font-bold text-white">
                        {item.isPremiere ? (
                          <span className="text-red-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                            PREMIERE
                          </span>
                        ) : 'Reel'}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
                      <div>
                        <h4 className="text-xs font-black text-white group-hover:text-orange-400 transition-colors line-clamp-2 leading-snug">
                          {item.title}
                        </h4>
                        <p className="text-[11px] font-medium text-white/50 truncate mt-1">
                          {item.artist || (item as any).channelName || 'Creator'}
                        </p>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-orange-400/80">
                        {item.isPremiere ? 'Join Premiere ▶' : 'Watch Reel ▶'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      ) : (
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6">
          {/* ══════════════════════════════════════════════════════════════════
              THEATER MODE LAYOUT
             ══════════════════════════════════════════════════════════════════ */}
          {isTheaterMode ? (
            <div className="flex flex-col space-y-8">
              {/* Expanded Theater Video Container */}
              <div className="w-full bg-black rounded-3xl overflow-hidden relative shadow-[0_0_80px_rgba(0,0,0,0.85)] border border-white/15 aspect-[16/9] sm:h-[72vh] max-h-[750px] flex items-center justify-center">
                {current && (
                  <video
                    ref={videoRef}
                    key={current.id}
                    poster={(current as any).thumbnailUrl || (current as any).coverImageUrl || undefined}
                    crossOrigin={usableSubtitles(current).length ? 'anonymous' : undefined}
                    className="w-full h-full object-contain"
                    autoPlay
                    loop
                    playsInline
                    muted={isMuted}
                    onPlay={() => setIsPaused(false)}
                    onPause={() => setIsPaused(true)}
                  >
                    <SubtitleTracks video={current} />
                  </video>
                )}

                {/* Central Play button when paused */}
                {current && isPaused && (
                  <button
                    onClick={() => {
                      const v = videoRef.current;
                      if (v) {
                        v.play().then(() => setIsPaused(false)).catch(() => {
                          v.muted = true;
                          v.play().then(() => setIsPaused(false)).catch(() => {});
                        });
                      }
                    }}
                    className="absolute z-20 w-20 h-20 rounded-full bg-black/60 backdrop-blur-md border border-white/25 flex items-center justify-center text-white shadow-2xl hover:scale-110 active:scale-95 transition-all"
                  >
                    <Play size={36} fill="white" className="ml-1" />
                  </button>
                )}

                {/* Gesture Layer */}
                {current && (
                  <ShortsGestureLayer
                    videoElRef={videoRef}
                    isLiked={isLiked}
                    onLike={toggleLike}
                    disabled={!!activeStream}
                  />
                )}

                {/* Navigation Up / Down Overlay Buttons */}
                <div className="absolute right-4 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-2">
                  <button
                    onClick={goPrev}
                    disabled={currentIndex === 0}
                    className="w-10 h-10 rounded-full bg-black/60 hover:bg-black/90 backdrop-blur border border-white/20 flex items-center justify-center transition-all disabled:opacity-20 text-white"
                  >
                    <ChevronUp size={20} />
                  </button>
                  <button
                    onClick={goNext}
                    disabled={currentIndex >= videos.length - 1}
                    className="w-10 h-10 rounded-full bg-black/60 hover:bg-black/90 backdrop-blur border border-white/20 flex items-center justify-center transition-all disabled:opacity-20 text-white"
                  >
                    <ChevronDown size={20} />
                  </button>
                </div>
              </div>

              {/* Theater Mode Lower Grid: Left = Details + Comments, Right = Recommended */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <div className="lg:col-span-8 flex flex-col space-y-6">
                  {/* Title & Actions */}
                  {current && (
                    <div className="bg-[#111116] border border-white/10 rounded-3xl p-6 shadow-xl space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="min-w-0">
                          <h1 className="text-xl sm:text-2xl font-black text-white leading-tight">{current.title}</h1>
                          <p className="text-xs font-bold text-orange-400 mt-1 uppercase tracking-wider">
                            {current.artist || (current as any).channelName || 'Plajah Creator'}
                          </p>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2.5 shrink-0">
                          <button
                            onClick={toggleLike}
                            className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all active:scale-95 ${
                              isLiked
                                ? 'bg-pink-500/20 border-pink-500/50 text-pink-400'
                                : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/70 hover:text-white'
                            }`}
                          >
                            <Heart size={16} fill={isLiked ? 'currentColor' : 'none'} className={isLiked ? 'text-pink-400' : ''} />
                            <span className="text-xs font-bold">{isLiked ? 'Liked' : 'Like'}</span>
                          </button>

                          <ShareButton
                            title={current.title}
                            text={shareText(current.title, (current as any).channelName || (current as any).creatorName || (current as any).uploaderName || current.artist)}
                            url={buildShareUrl('reello', current.id)}
                            imageUrl={current.thumbnailUrl || current.coverImageUrl}
                            artist={(current as any).channelName || (current as any).creatorName || (current as any).uploaderName || current.artist}
                            contentType="video"
                            ctaText="▶ WATCH FULL CLIP ON PLAJAH"
                            className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white text-xs font-bold transition-all active:scale-95"
                          >
                            <Share2 size={16} />
                            <span>Share</span>
                          </ShareButton>

                          {currentUser?.uid === current.ownerId && (
                            <button
                              onClick={() => setShowPremiereScheduler(true)}
                              className="flex items-center gap-2 px-4 py-2 rounded-full bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-300 text-xs font-bold transition-all active:scale-95"
                              title="Configure Live Premiere"
                            >
                              <Clapperboard size={16} />
                              <span>{current.isPremiere ? 'Premiere Config' : 'Set Premiere'}</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Expandable Description */}
                      {current.description && (
                        <div className="pt-3 border-t border-white/5">
                          <p className={`text-xs text-white/70 leading-relaxed ${isDescriptionExpanded ? '' : 'line-clamp-2'}`}>
                            {current.description}
                          </p>
                          {current.description.length > 140 && (
                            <button
                              onClick={() => setIsDescriptionExpanded(v => !v)}
                              className="text-[11px] font-bold text-orange-400 hover:text-orange-300 mt-1 uppercase tracking-wider"
                            >
                              {isDescriptionExpanded ? 'Show less' : 'Show more'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Comments Section under Description */}
                  {current && (
                    <ReelloComments
                      video={current}
                      currentUser={currentUser}
                      onSeek={seekTo}
                      currentTime={currentTime}
                      onCountChange={setCommentCount}
                    />
                  )}
                </div>

                {/* Right Side: Recommended Videos Grid */}
                <div className="lg:col-span-4 flex flex-col space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-white/8">
                    <h3 className="text-xs font-black uppercase tracking-widest text-white/70 flex items-center gap-2">
                      <Film size={14} className="text-orange-400" />
                      Recommended Reels
                    </h3>
                    <span className="text-[10px] font-bold text-white/40">({recommendedVideos.length})</span>
                  </div>

                  <div className="space-y-3">
                    {recommendedVideos.map(({ video: item, index: originalIdx }) => (
                      <div
                        key={item.id}
                        onClick={() => playRecommended(originalIdx)}
                        className="flex gap-3 p-2.5 rounded-2xl bg-[#111116] hover:bg-[#181820] border border-white/8 hover:border-white/20 transition-all cursor-pointer group active:scale-[0.98]"
                      >
                        <div className="w-24 h-32 rounded-xl overflow-hidden bg-black/60 shrink-0 relative border border-white/10">
                          <img
                            src={item.thumbnailUrl || item.coverImageUrl || ''}
                            alt=""
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors" />
                          <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-mono font-bold text-white">
                            {item.isPremiere ? (
                              <span className="text-red-400 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                PREMIERE
                              </span>
                            ) : 'Reel'}
                          </div>
                        </div>

                        <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
                          <div>
                            <h4 className="text-xs font-black text-white group-hover:text-orange-400 transition-colors line-clamp-2 leading-snug">
                              {item.title}
                            </h4>
                            <p className="text-[11px] font-medium text-white/50 truncate mt-1">
                              {item.artist || (item as any).channelName || 'Creator'}
                            </p>
                          </div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-orange-400/80">
                            {item.isPremiere ? 'Join Premiere ▶' : 'Watch Reel ▶'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ══════════════════════════════════════════════════════════════════
               STANDARD VIEW LAYOUT (Video & Comments in Center, Recommended Beside)
               ══════════════════════════════════════════════════════════════════ */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left Column: Vertical Video Player + Details + Comments */}
              <div className="lg:col-span-8 flex flex-col space-y-6">
                {/* Vertical Reel Player Container */}
                <div className="w-full max-w-md mx-auto aspect-[9/16] max-h-[75vh] bg-black rounded-3xl overflow-hidden relative shadow-2xl border border-white/15 flex items-center justify-center">
                  {current && (
                    <video
                      ref={videoRef}
                      key={current.id}
                      poster={(current as any).thumbnailUrl || (current as any).coverImageUrl || undefined}
                      crossOrigin={usableSubtitles(current).length ? 'anonymous' : undefined}
                      className="w-full h-full object-cover"
                      autoPlay
                      loop
                      playsInline
                      muted={isMuted}
                      onPlay={() => setIsPaused(false)}
                      onPause={() => setIsPaused(true)}
                    >
                      <SubtitleTracks video={current} />
                    </video>
                  )}

                  {/* Play button overlay */}
                  {current && isPaused && (
                    <button
                      onClick={() => {
                        const v = videoRef.current;
                        if (v) {
                          v.play().then(() => setIsPaused(false)).catch(() => {
                            v.muted = true;
                            v.play().then(() => setIsPaused(false)).catch(() => {});
                          });
                        }
                      }}
                      className="absolute z-20 w-16 h-16 rounded-full bg-black/60 backdrop-blur-md border border-white/25 flex items-center justify-center text-white shadow-2xl hover:scale-110 active:scale-95 transition-all"
                    >
                      <Play size={28} fill="white" className="ml-0.5" />
                    </button>
                  )}

                  {/* Gesture Layer */}
                  {current && (
                    <ShortsGestureLayer
                      videoElRef={videoRef}
                      isLiked={isLiked}
                      onLike={toggleLike}
                      disabled={!!activeStream}
                    />
                  )}

                  {/* Up / Down Navigation buttons */}
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-2">
                    <button
                      onClick={goPrev}
                      disabled={currentIndex === 0}
                      className="w-9 h-9 rounded-full bg-black/60 hover:bg-black/90 backdrop-blur border border-white/20 flex items-center justify-center transition-all disabled:opacity-20 text-white"
                    >
                      <ChevronUp size={18} />
                    </button>
                    <button
                      onClick={goNext}
                      disabled={currentIndex >= videos.length - 1}
                      className="w-9 h-9 rounded-full bg-black/60 hover:bg-black/90 backdrop-blur border border-white/20 flex items-center justify-center transition-all disabled:opacity-20 text-white"
                    >
                      <ChevronDown size={18} />
                    </button>
                  </div>
                </div>

                {/* Details & Actions under Video */}
                {current && (
                  <div className="bg-[#111116] border border-white/10 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h1 className="text-xl font-black text-white leading-tight">{current.title}</h1>
                        <p className="text-xs font-bold text-orange-400 mt-1 uppercase tracking-wider">
                          {current.artist || (current as any).channelName || 'Plajah Creator'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={toggleLike}
                          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border transition-all active:scale-95 ${
                            isLiked
                              ? 'bg-pink-500/20 border-pink-500/50 text-pink-400'
                              : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/70 hover:text-white'
                          }`}
                        >
                          <Heart size={15} fill={isLiked ? 'currentColor' : 'none'} className={isLiked ? 'text-pink-400' : ''} />
                          <span className="text-xs font-bold">{isLiked ? 'Liked' : 'Like'}</span>
                        </button>

                        <ShareButton
                          title={current.title}
                          text={shareText(current.title, (current as any).channelName || (current as any).creatorName || (current as any).uploaderName || current.artist)}
                          url={buildShareUrl('reello', current.id)}
                          imageUrl={current.thumbnailUrl || current.coverImageUrl}
                          artist={(current as any).channelName || (current as any).creatorName || (current as any).uploaderName || current.artist}
                          contentType="video"
                          ctaText="▶ WATCH FULL CLIP ON PLAJAH"
                          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white text-xs font-bold transition-all active:scale-95"
                        >
                          <Share2 size={15} />
                          <span>Share</span>
                        </ShareButton>

                        <button
                          onClick={() => setIsTheaterMode(true)}
                          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white text-xs font-bold transition-all active:scale-95"
                          title="Expand to Theater Mode"
                        >
                          <Tv size={15} />
                          <span>Theater</span>
                        </button>

                        {currentUser?.uid === current.ownerId && (
                          <button
                            onClick={() => setShowPremiereScheduler(true)}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-300 text-xs font-bold transition-all active:scale-95"
                            title="Configure Live Premiere"
                          >
                            <Clapperboard size={15} />
                            <span>{current.isPremiere ? 'Premiere' : 'Set Premiere'}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {current.description && (
                      <div className="pt-3 border-t border-white/5">
                        <p className={`text-xs text-white/70 leading-relaxed ${isDescriptionExpanded ? '' : 'line-clamp-2'}`}>
                          {current.description}
                        </p>
                        {current.description.length > 140 && (
                          <button
                            onClick={() => setIsDescriptionExpanded(v => !v)}
                            className="text-[11px] font-bold text-orange-400 hover:text-orange-300 mt-1 uppercase tracking-wider"
                          >
                            {isDescriptionExpanded ? 'Show less' : 'Show more'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Comments Section under Description */}
                {current && (
                  <ReelloComments
                    video={current}
                    currentUser={currentUser}
                    onSeek={seekTo}
                    currentTime={currentTime}
                    onCountChange={setCommentCount}
                  />
                )}
              </div>

              {/* Right Column: Recommended Videos Sidebar */}
              <div className="lg:col-span-4 flex flex-col space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-white/8">
                  <h3 className="text-xs font-black uppercase tracking-widest text-white/70 flex items-center gap-2">
                    <Film size={14} className="text-orange-400" />
                    Recommended Videos
                  </h3>
                  <span className="text-[10px] font-bold text-white/40">({recommendedVideos.length})</span>
                </div>

                <div className="space-y-3">
                  {recommendedVideos.map(({ video: item, index: originalIdx }) => (
                    <div
                      key={item.id}
                      onClick={() => playRecommended(originalIdx)}
                      className="flex gap-3 p-2.5 rounded-2xl bg-[#111116] hover:bg-[#181820] border border-white/8 hover:border-white/20 transition-all cursor-pointer group active:scale-[0.98]"
                    >
                      <div className="w-24 h-32 rounded-xl overflow-hidden bg-black/60 shrink-0 relative border border-white/10">
                        <img
                          src={item.thumbnailUrl || item.coverImageUrl || ''}
                          alt=""
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors" />
                        <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-mono font-bold text-white">
                          {item.isPremiere ? (
                            <span className="text-red-400 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                              PREMIERE
                            </span>
                          ) : 'Reel'}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
                        <div>
                          <h4 className="text-xs font-black text-white group-hover:text-orange-400 transition-colors line-clamp-2 leading-snug">
                            {item.title}
                          </h4>
                          <p className="text-[11px] font-medium text-white/50 truncate mt-1">
                            {item.artist || (item as any).channelName || 'Creator'}
                          </p>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-orange-400/80">
                          {item.isPremiere ? 'Join Premiere ▶' : 'Watch Reel ▶'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>
      )}
    </div>
  );
};

export default RelloView;
