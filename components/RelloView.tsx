import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { ArrowLeft, Heart, MessageCircle, Share2, ChevronUp, ChevronDown, Radio, FlaskConical, ExternalLink, X } from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';
import { fetchAllVideos, fetchVideoById, fetchVideosByInterests, fetchFollowedVideos } from '../services/backendService';
import { shareAsset, shareText } from '../services/deepLinkService';
import { blendRelloFeed } from '../services/relloFeedService';
import { recordProgress } from '../services/watchHistoryService';
import { likeVideo, unlikeVideo, checkIfLiked, fetchUserProfile } from '../services/backendService';
// Blueprint 1A.7 — the Reello feed respects the EXISTING kids-mode / content-safety
// engine (services/contentSafety.ts). No new safety logic lives here: we resolve the
// viewer's profile and run the assembled feed through the shared filter, which already
// force-clamps child accounts and reads the isExplicit/isNSFW/contentRating flags.
import { filterForViewer, isContentAllowed } from '../services/contentSafety';
import { Video, UserProfile } from '../types';
import { SCIENCE_STREAMS, ScienceStream } from './scienceStreams';
import ShortsGestureLayer from './reello/ShortsGestureLayer';
import ShortsCommentSheet, { SHEET_VH } from './reello/ShortsCommentSheet';
import { SubtitleTracks, usableSubtitles } from './reello/CaptionTracks';

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
  // A shared video link opens a FOCUSED page (just that video) — no discovery chrome.
  const focused = !!initialVideoId;
  const [showScienceBanner, setShowScienceBanner] = useState(!initialVideoId);
  const [activeStream, setActiveStream] = useState<ScienceStream | null>(null);
  const [shared, setShared] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [commentCount, setCommentCount] = useState<number | null>(null);
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

      // FOCUSED SHARE MODE — a shared Reello link opens THAT video's own page and nothing else:
      // fetch it by id, show it alone, skip the whole personalized feed + all discovery chrome.
      // (Playlist/channel shares never reach here — they route to VideoTab / the profile.)
      if (initialVideoId) {
        let target: Video | undefined;
        try { target = (await fetchVideoById(initialVideoId)) || undefined; } catch { /* fall back below */ }
        if (cancelled) return;
        // A deep link must not become a hole in the filter — gate the single video too.
        if (target && !isContentAllowed(target, viewer)) target = undefined;
        if (target) { setVideos([target]); setCurrentIndex(0); setLoading(false); return; }
        // Unknown/removed/blocked id → fall through to the normal feed so it isn't a dead end.
      }
      const all = await fetchAllVideos();
      if (cancelled) return;
      // A historical bug dropped the isRello flag on upload, so many UGC videos were saved
      // without it and became invisible here. Recover them: treat a flagless public video as
      // Reello UGC unless it's clearly a Taleo cinema item (movie/TV genre) or a live replay.
      const CINEMA_GENRES = ['Movie', 'Short Film', 'TV Series', 'Short', 'Teaser', 'Trailer', 'Feature Film'];
      const isRelloVideo = (v: Video) => v.isRello === true || (v.isRello == null && !v.isLiveRecording && !(v.genre && CINEMA_GENRES.includes(v.genre)));
      // Kids-mode / content-rating gate (1A.7). Applied to the feed INPUTS, not just the
      // output, so the personalization blend doesn't spend its quota on items that are
      // about to be dropped. For an unrestricted adult this is a no-op fast path.
      const safe = (vs: Video[]) => filterForViewer(vs, viewer);
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
          } else {
            const { default: Hls } = await import('hls.js');
            if (cancelled) return;
            if (Hls.isSupported()) {
              hls = new Hls({ enableWorker: true, maxBufferLength: 30, startLevel: -1 });
              hls.loadSource(streamUrl);
              hls.attachMedia(v);
            } else {
              v.src = streamUrl; // last resort
            }
          }
        } else if (direct) {
          v.src = direct;
        }
        v.play?.().catch(() => { v.muted = true; v.play?.().catch(() => {}); });
      } catch { if (direct) { v.src = direct; v.play?.().catch(() => {}); } }
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

  return (
    <div className="w-full h-screen bg-black overflow-hidden relative flex items-center justify-center">
      {/* Back button */}
      <button
        onClick={onBack}
        className="absolute top-4 left-4 z-20 w-10 h-10 rounded-full bg-black/50 backdrop-blur flex items-center justify-center hover:bg-black/70 transition-all text-white"
      >
        <ArrowLeft size={18} />
      </button>

      {/* Title badge */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-4 py-1.5 bg-black/50 backdrop-blur rounded-full">
        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Rello</span>
      </div>

      {/* Go Live button */}
      {currentUser && (
        <button
          onClick={() => setShowGoLive(true)}
          className="absolute top-4 right-4 z-20 flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 rounded-full transition-all shadow-lg"
        >
          <Radio size={13} className="text-white animate-pulse" />
          <span className="text-[9px] font-black uppercase tracking-widest text-white">Go Live</span>
        </button>
      )}

      {/* GoLiveWizard */}
      {showGoLive && (
        <Suspense fallback={null}>
          <GoLiveWizard onClose={() => setShowGoLive(false)} currentUser={currentUser} />
        </Suspense>
      )}

      {/* Science & Space Live discovery row — never on a shared/focused video page */}
      {!focused && showScienceBanner && !activeStream && (
        <div className="absolute bottom-6 left-4 right-16 z-20">
          <div className="bg-black/70 backdrop-blur-xl border border-white/10 rounded-2xl p-3">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <FlaskConical size={11} className="text-[#00B4D8]" />
                <span className="text-[8px] font-black uppercase tracking-widest text-[#00B4D8]">Science Live</span>
              </div>
              <button onClick={() => setShowScienceBanner(false)} className="text-white/25 hover:text-white transition-colors">
                <X size={12} />
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar" style={{ scrollbarWidth: 'none' }}>
              {liveStreams.map(stream => (
                <button
                  key={stream.id}
                  onClick={() => setActiveStream(stream)}
                  className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-white/8 hover:bg-white/15 border border-white/10 rounded-xl transition-all"
                >
                  <span className="text-base">{stream.emoji}</span>
                  <div className="text-left">
                    <p className="text-[8px] font-black text-white leading-tight">{stream.source}</p>
                    <p className="text-[7px] text-white/40 leading-tight truncate max-w-[80px]">{stream.title.split('—')[0].trim()}</p>
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
        <div className="absolute inset-0 z-30 bg-black flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur border-b border-white/8 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-lg">{activeStream.emoji}</span>
              <div>
                <p className="text-[8px] font-black uppercase tracking-widest text-[#00B4D8]">{activeStream.source}</p>
                <p className="text-[11px] font-black text-white">{activeStream.title}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a href={activeStream.directUrl} target="_blank" rel="noopener noreferrer"
                className="p-2 bg-white/8 border border-white/10 rounded-xl text-white/50 hover:text-white transition-colors">
                <ExternalLink size={13} />
              </a>
              <button onClick={() => setActiveStream(null)}
                className="p-2 bg-white/8 border border-white/10 rounded-xl text-white/40 hover:text-white transition-colors">
                <X size={13} />
              </button>
            </div>
          </div>
          <div className="flex-1">
            <iframe src={activeStream.embedUrl} className="w-full h-full border-none"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen />
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center gap-4 text-white/40">
          <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          <p className="text-[9px] font-black uppercase tracking-widest">Loading Rello...</p>
        </div>
      ) : videos.length === 0 ? (
        <div className="flex flex-col items-center gap-4 text-white/40 max-w-xs text-center px-6">
          <p className="text-[10px] font-black uppercase tracking-widest leading-relaxed">
            No Rello videos yet. Attach a video to a post and tap "Send to Rello".
          </p>
        </div>
      ) : (
        <>
          {/* Video */}
          {current && (
            <video
              ref={videoRef}
              key={current.id}
              poster={(current as any).thumbnailUrl || (current as any).coverImageUrl || undefined}
              crossOrigin={usableSubtitles(current).length ? 'anonymous' : undefined}
              // With the comment sheet open the clip is SCALED INTO the band above it rather
              // than hidden behind it — you keep watching while you read and type.
              style={showComments
                ? { height: `${100 - SHEET_VH}vh`, top: 0, bottom: 'auto', objectFit: 'contain' }
                : undefined}
              className="w-full h-full object-cover absolute inset-0 transition-[height] duration-300"
              autoPlay
              loop
              playsInline
              muted={false}
            >
              <SubtitleTracks video={current} />
            </video>
          )}

          {/* Vertical gesture vocabulary: tap = play/pause, double-tap = like, hold = 2×. */}
          {current && (
            <ShortsGestureLayer
              videoElRef={videoRef}
              isLiked={isLiked}
              onLike={toggleLike}
              disabled={showComments || !!activeStream}
            />
          )}

          {/* Nothing playable yet (e.g. a Mux upload still transcoding) — show a hint, not a black void */}
          {current && !current.url && !(current as any).muxPlaybackId && !verticalUrlOf(current) && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 text-white/50 pointer-events-none">
              <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              <p className="text-[9px] font-black uppercase tracking-widest">Processing video…</p>
            </div>
          )}

          {/* Gradient overlays */}
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/60 to-transparent pointer-events-none z-10" />
          <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/80 to-transparent pointer-events-none z-10" />

          {/* Nav: up/down */}
          <div className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-3">
            <button
              onClick={goPrev}
              disabled={currentIndex === 0}
              className="w-10 h-10 rounded-full bg-white/10 backdrop-blur flex items-center justify-center hover:bg-white/20 transition-all disabled:opacity-20 text-white"
            >
              <ChevronUp size={20} />
            </button>
            <button
              onClick={goNext}
              disabled={currentIndex >= videos.length - 1}
              className="w-10 h-10 rounded-full bg-white/10 backdrop-blur flex items-center justify-center hover:bg-white/20 transition-all disabled:opacity-20 text-white"
            >
              <ChevronDown size={20} />
            </button>
          </div>

          {/* Right action bar */}
          <div
            style={showComments ? { bottom: `calc(${SHEET_VH}vh + 1rem)` } : undefined}
            className="absolute right-3 sm:right-4 bottom-32 z-40 flex flex-col gap-5 items-center transition-[bottom] duration-300"
          >
            <button onClick={toggleLike} className="flex flex-col items-center gap-1 text-white group">
              <div className={`w-10 h-10 rounded-full backdrop-blur flex items-center justify-center transition-all ${isLiked ? 'bg-[#D40055]/25' : 'bg-white/10 group-hover:bg-white/20'}`}>
                <Heart size={18} className={isLiked ? 'text-[#FF3D7F]' : undefined} fill={isLiked ? 'currentColor' : 'none'} />
              </div>
              <span className="text-[8px] font-black uppercase tracking-widest text-white/60">{isLiked ? 'Liked' : 'Like'}</span>
            </button>
            <button onClick={() => setShowComments(o => !o)} className="flex flex-col items-center gap-1 text-white group">
              <div className="w-10 h-10 rounded-full bg-white/10 backdrop-blur flex items-center justify-center group-hover:bg-white/20 transition-all">
                <MessageCircle size={18} />
              </div>
              <span className="text-[8px] font-black uppercase tracking-widest text-white/60">
                {commentCount !== null ? commentCount : 'Comment'}
              </span>
            </button>
            <button onClick={shareCurrent} className="flex flex-col items-center gap-1 text-white group">
              <div className="w-10 h-10 rounded-full bg-white/10 backdrop-blur flex items-center justify-center group-hover:bg-white/20 transition-all">
                <Share2 size={18} />
              </div>
              <span className="text-[8px] font-black uppercase tracking-widest text-white/60">{shared ? 'Copied' : 'Share'}</span>
            </button>
          </div>

          {/* Bottom overlay: title + artist — yields to the comment sheet */}
          {current && !showComments && (
            <div className="absolute bottom-6 left-4 right-20 z-20 space-y-1">
              <p className="text-white font-black text-lg leading-tight line-clamp-2">{current.title}</p>
              {current.artist && (
                <p className="text-white/60 text-xs font-bold">{current.artist}</p>
              )}
              {current.description && (
                <p className="text-white/50 text-xs leading-relaxed line-clamp-2">{current.description}</p>
              )}
              {/* Progress indicator */}
              <p className="text-[8px] font-black uppercase tracking-widest text-white/30 mt-2">
                {currentIndex + 1} / {videos.length}
              </p>
            </div>
          )}

          {/* Comments — occupies the bottom band; the clip scales into the band above it. */}
          {current && (
            <ShortsCommentSheet
              video={current}
              open={showComments}
              onClose={() => setShowComments(false)}
              currentUser={currentUser}
              onCountChange={setCommentCount}
            />
          )}
        </>
      )}
    </div>
  );
};

export default RelloView;
