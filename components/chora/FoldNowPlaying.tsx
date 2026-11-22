import React, { useRef } from 'react';
import { Pause, Play, SkipBack, SkipForward, Music2 } from 'lucide-react';
import { useGlobalPlayerState, useGlobalPlayerProgress } from '../../contexts/GlobalPlayerContext';
import { useTabletopTop } from '../../hooks/useFoldLayout';

// Now-playing pane for Chora on an unfolded foldable.
//   'side'     — a column beside the library (inner screen flat, or book posture)
//   'tabletop' — cover art fills the top half down to the hinge, transport sits below it

const fmt = (s: number) => {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

function Transport({ compact }: { compact?: boolean }) {
  const { isPlaying, togglePlay, next, prev } = useGlobalPlayerState();
  const { currentTime, duration, seek } = useGlobalPlayerProgress();
  const pct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  return (
    <div className="w-full">
      <div
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration || 0)}
        aria-valuenow={Math.round(currentTime || 0)}
        className="h-6 flex items-center cursor-pointer"
        onClick={(e) => {
          if (!duration) return;
          const r = e.currentTarget.getBoundingClientRect();
          seek(((e.clientX - r.left) / r.width) * duration);
        }}
      >
        <div className="relative w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#FF8C00,#D40055)' }} />
        </div>
      </div>
      <div className="flex justify-between text-[11px] font-mono text-white/45 -mt-0.5">
        <span>{fmt(currentTime)}</span><span>{fmt(duration)}</span>
      </div>
      <div className={`flex items-center justify-center ${compact ? 'gap-6 mt-1' : 'gap-8 mt-3'}`}>
        <button type="button" onClick={prev} aria-label="Previous" className="w-11 h-11 grid place-items-center rounded-full text-white/75 hover:text-white hover:bg-white/10"><SkipBack size={20} /></button>
        <button type="button" onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'} className="w-14 h-14 grid place-items-center rounded-full bg-white text-black shadow-lg">
          {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-0.5" />}
        </button>
        <button type="button" onClick={next} aria-label="Next" className="w-11 h-11 grid place-items-center rounded-full text-white/75 hover:text-white hover:bg-white/10"><SkipForward size={20} /></button>
      </div>
    </div>
  );
}

export default function FoldNowPlaying({ variant }: { variant: 'side' | 'tabletop' }) {
  const { currentTrack, currentAlbum } = useGlobalPlayerState();
  const topRef = useRef<HTMLDivElement>(null);
  useTabletopTop(topRef, variant === 'tabletop' && !!currentTrack);
  if (!currentTrack) return null;
  const art = currentAlbum?.coverImage || currentTrack.images?.[0] || '';
  const title = currentTrack.title;
  const artist = currentTrack.artist || currentAlbum?.artist || '';

  const cover = art
    ? <img src={art} alt="" className="w-full h-full object-cover" loading="lazy" />
    : <div className="w-full h-full grid place-items-center bg-white/5"><Music2 size={48} className="text-white/25" /></div>;

  if (variant === 'tabletop') {
    return (
      <div className="shrink-0 flex flex-col" data-fold-now-playing="tabletop">
        {/* Top half, ends on the hinge: the art is the "screen" when the phone sits like a laptop. */}
        <div ref={topRef} className="pj-fold-top relative overflow-hidden flex items-center justify-center gap-5 px-6 bg-black">
          {art && <img src={art} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover opacity-40 blur-2xl scale-110" />}
          <div className="relative h-[78%] aspect-square rounded-2xl overflow-hidden border border-white/10 shadow-2xl">{cover}</div>
          <div className="relative min-w-0 max-w-[40%]">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 mb-1">Now playing</p>
            <h2 className="text-xl font-black leading-tight line-clamp-2">{title}</h2>
            <p className="text-sm text-white/60 truncate">{artist}</p>
          </div>
        </div>
        {/* Bottom half starts below the hinge: controls first, the library scrolls under them. */}
        <div className="pj-fold-bottom px-6 py-3 border-b border-white/10 bg-black/40 backdrop-blur-xl">
          <Transport compact />
        </div>
      </div>
    );
  }

  return (
    <aside
      data-fold-now-playing="side"
      className="flex flex-col w-[clamp(260px,36vw,340px)] fold-book:flex-1 fold-book:w-auto fold-book:min-w-0 shrink-0 border-l border-white/10 bg-black/30 backdrop-blur-xl overflow-y-auto custom-scrollbar"
    >
      <div className="p-5 pt-6 flex flex-col items-center text-center">
        <p className="self-start text-[10px] font-black uppercase tracking-[0.2em] text-white/45 mb-4">Now playing</p>
        <div className="w-full max-w-[280px] aspect-square rounded-3xl overflow-hidden border border-white/10 shadow-2xl">{cover}</div>
        <h2 className="mt-5 text-lg font-black leading-tight line-clamp-2">{title}</h2>
        <p className="text-sm text-white/55 truncate max-w-full">{artist}</p>
        <div className="w-full mt-4"><Transport /></div>
      </div>
    </aside>
  );
}
