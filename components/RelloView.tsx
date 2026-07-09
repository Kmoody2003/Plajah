import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { ArrowLeft, Heart, MessageCircle, Share2, ChevronUp, ChevronDown, Radio, FlaskConical, ExternalLink, X } from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';
import { fetchAllVideos, fetchVideoById, fetchVideosByInterests, fetchFollowedVideos } from '../services/backendService';
import { shareAsset } from '../services/deepLinkService';
import { blendRelloFeed } from '../services/relloFeedService';
import { recordProgress } from '../services/watchHistoryService';
import { Video } from '../types';
import { SCIENCE_STREAMS, ScienceStream } from './scienceStreams';

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
  const [showScienceBanner, setShowScienceBanner] = useState(true);
  const [activeStream, setActiveStream] = useState<ScienceStream | null>(null);
  const [shared, setShared] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const liveStreams = SCIENCE_STREAMS.filter(s => s.isLive && s.isEmbeddable).slice(0, 5);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all = await fetchAllVideos();
      if (cancelled) return;
      // A historical bug dropped the isRello flag on upload, so many UGC videos were saved
      // without it and became invisible here. Recover them: treat a flagless public video as
      // Reello UGC unless it's clearly a Taleo cinema item (movie/TV genre) or a live replay.
      const CINEMA_GENRES = ['Movie', 'Short Film', 'TV Series', 'Short', 'Teaser', 'Trailer', 'Feature Film'];
      const isRelloVideo = (v: Video) => v.isRello === true || (v.isRello == null && !v.isLiveRecording && !(v.genre && CINEMA_GENRES.includes(v.genre)));
      const recentRello = all.filter(isRelloVideo);
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
          const onlyRello = (vs: Video[]) => vs.filter(isRelloVideo);
          const blended = blendRelloFeed({
            interestVideos: onlyRello(interested),
            followedVideos: onlyRello(followed),
            recentVideos: recentRello,
          });
          if (blended.length > 0) relloVideos = blended;
        } catch { /* keep flat recent list */ }
      }
      // A shared link → start on that video, surfacing it first. The feed is only
      // the recent-50, so fetch the exact video by id if it isn't already there.
      if (initialVideoId) {
        let target = all.find(v => v.id === initialVideoId);
        if (!target) { try { target = (await fetchVideoById(initialVideoId)) || undefined; } catch { /* */ } }
        if (cancelled) return;
        if (target && !relloVideos.some(v => v.id === initialVideoId)) relloVideos = [target, ...relloVideos];
        const idx = relloVideos.findIndex(v => v.id === initialVideoId);
        if (idx >= 0) setCurrentIndex(idx);
      }
      setVideos(relloVideos);
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

  const shareCurrent = async () => {
    if (!current) return;
    await shareAsset('video', current.id, { title: current.title, text: `${current.title} on Plajah` });
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

      {/* Science & Space Live discovery row */}
      {showScienceBanner && !activeStream && (
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
              src={current.url}
              className="w-full h-full object-cover absolute inset-0"
              autoPlay
              loop
              playsInline
              muted={false}
            />
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
          <div className="absolute right-3 sm:right-4 bottom-32 z-20 flex flex-col gap-5 items-center">
            <button className="flex flex-col items-center gap-1 text-white group">
              <div className="w-10 h-10 rounded-full bg-white/10 backdrop-blur flex items-center justify-center group-hover:bg-white/20 transition-all">
                <Heart size={18} />
              </div>
              <span className="text-[8px] font-black uppercase tracking-widest text-white/60">Like</span>
            </button>
            <button className="flex flex-col items-center gap-1 text-white group">
              <div className="w-10 h-10 rounded-full bg-white/10 backdrop-blur flex items-center justify-center group-hover:bg-white/20 transition-all">
                <MessageCircle size={18} />
              </div>
              <span className="text-[8px] font-black uppercase tracking-widest text-white/60">Comment</span>
            </button>
            <button onClick={shareCurrent} className="flex flex-col items-center gap-1 text-white group">
              <div className="w-10 h-10 rounded-full bg-white/10 backdrop-blur flex items-center justify-center group-hover:bg-white/20 transition-all">
                <Share2 size={18} />
              </div>
              <span className="text-[8px] font-black uppercase tracking-widest text-white/60">{shared ? 'Copied' : 'Share'}</span>
            </button>
          </div>

          {/* Bottom overlay: title + artist */}
          {current && (
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
        </>
      )}
    </div>
  );
};

export default RelloView;
