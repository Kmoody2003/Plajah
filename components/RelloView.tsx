import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { ArrowLeft, Heart, MessageCircle, Share2, ChevronUp, ChevronDown, Radio } from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';
import { fetchAllVideos } from '../services/backendService';
import { Video } from '../types';

const GoLiveWizard = lazy(() => import('./GoLiveWizard'));

interface RelloViewProps {
  onBack: () => void;
  currentUser: FirebaseUser | null;
}

const RelloView: React.FC<RelloViewProps> = ({ onBack, currentUser }) => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showGoLive, setShowGoLive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAllVideos().then(all => {
      if (cancelled) return;
      const relloVideos = all.filter(v => v.isRello === true);
      setVideos(relloVideos);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const goNext = () => setCurrentIndex(i => Math.min(i + 1, videos.length - 1));
  const goPrev = () => setCurrentIndex(i => Math.max(i - 1, 0));

  const current = videos[currentIndex] ?? null;

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
          <div className="absolute right-4 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-3">
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
          <div className="absolute right-4 bottom-32 z-20 flex flex-col gap-5 items-center">
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
            <button className="flex flex-col items-center gap-1 text-white group">
              <div className="w-10 h-10 rounded-full bg-white/10 backdrop-blur flex items-center justify-center group-hover:bg-white/20 transition-all">
                <Share2 size={18} />
              </div>
              <span className="text-[8px] font-black uppercase tracking-widest text-white/60">Share</span>
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
