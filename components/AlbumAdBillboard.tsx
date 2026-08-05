import React, { useRef, useState, useEffect } from 'react';
import { Volume2, Music2, Disc3 } from 'lucide-react';
import { Album, UserProfile } from '../types';
import { thumb, onThumbError, THUMB } from '../src/lib/imageThumb';

interface AlbumAdBillboardProps {
  album: Album;
  profile: UserProfile;
  onOpenAlbum: (album: Album) => void;
  dotCount: number;
  dotIdx: number;
}

const TRACK_PLAY_MS = 13000;
const FADE_MS = 2000;
const FADE_STEPS = 20;
const TARGET_VOL = 0.65;

const AlbumAdBillboard: React.FC<AlbumAdBillboardProps> = ({
  album, profile, onOpenAlbum, dotCount, dotIdx,
}) => {
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [activeTrackIdx, setActiveTrackIdx] = useState(0);
  const audiosRef = useRef<HTMLAudioElement[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const playableTracks = (album.tracks ?? []).filter(t => !!t.url).slice(0, 3);

  const clearTimer = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  };

  const stopAll = () => {
    clearTimer();
    audiosRef.current.forEach(a => { try { a.pause(); } catch {} a.src = ''; });
    audiosRef.current = [];
  };

  const fade = (el: HTMLAudioElement, to: number) => {
    const from = el.volume;
    const step = (to - from) / FADE_STEPS;
    let n = 0;
    const id = setInterval(() => {
      n++;
      el.volume = Math.min(1, Math.max(0, from + step * n));
      if (n >= FADE_STEPS) {
        clearInterval(id);
        el.volume = to;
        if (to === 0) try { el.pause(); } catch {}
      }
    }, FADE_MS / FADE_STEPS);
  };

  const scheduleTrack = (idx: number, els: HTMLAudioElement[]) => {
    const el = els[idx];
    if (!el) return;
    setActiveTrackIdx(idx);
    el.currentTime = 0;
    el.volume = 0;
    el.play().catch(() => {});
    fade(el, TARGET_VOL);

    if (idx < els.length - 1) {
      timerRef.current = setTimeout(() => {
        fade(el, 0);
        scheduleTrack(idx + 1, els);
      }, TRACK_PLAY_MS);
    }
  };

  const startPreview = () => {
    if (playableTracks.length === 0) return;
    stopAll();
    const els = playableTracks.map(t => {
      const a = new Audio(t.url);
      a.volume = 0;
      a.preload = 'auto';
      return a;
    });
    audiosRef.current = els;
    setIsPreviewing(true);
    setActiveTrackIdx(0);
    scheduleTrack(0, els);
  };

  const stopPreview = () => {
    stopAll();
    setIsPreviewing(false);
    setActiveTrackIdx(0);
  };

  useEffect(() => () => stopAll(), []);

  const dotTotal = Math.min(dotCount, 7);
  const activeDot = dotIdx % dotTotal;

  return (
    <div
      className="relative w-full h-full overflow-hidden group"
      onMouseEnter={startPreview}
      onMouseLeave={stopPreview}
    >
      {/* Full-bleed blurred album art background */}
      {album.coverImage ? (
        <img
          src={album.coverImage}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover object-center scale-110"
          style={{ filter: 'blur(28px) brightness(0.35) saturate(1.4)' }}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-black" />
      )}

      {/* Gradient scrims for legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/60" />

      {/* "New Release" badge */}
      <div className="absolute top-4 left-0 right-0 flex justify-center z-10">
        <span className="flex items-center gap-1.5 px-3 py-1 bg-black/55 backdrop-blur-md border border-white/10 rounded-full text-[7px] font-black uppercase tracking-[0.35em] text-white/50">
          <Disc3 size={7} className="text-small-orange" /> New Release
        </span>
      </div>

      {/* Waveform pulse — visible when previewing */}
      <div className={`absolute top-14 left-0 right-0 flex justify-center gap-[3px] transition-opacity duration-300 ${isPreviewing ? 'opacity-100' : 'opacity-0'}`}>
        {[10, 16, 22, 14, 8, 18, 12].map((h, i) => (
          <span
            key={i}
            className="w-[3px] bg-small-orange rounded-full"
            style={{ height: `${h}px`, animation: `pulse 0.6s ease-in-out ${i * 0.08}s infinite alternate` }}
          />
        ))}
      </div>

      {/* Main body — vertically centered */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6">

        {/* Album art thumbnail */}
        <button
          onClick={() => onOpenAlbum(album)}
          className="relative w-44 h-44 rounded-[1.75rem] overflow-hidden shadow-[0_8px_60px_rgba(0,0,0,0.85)] ring-2 ring-white/10 hover:ring-white/35 transition-all duration-300 hover:scale-[1.04] active:scale-95 group/thumb shrink-0"
          aria-label={`Open ${album.title}`}
        >
          {album.coverImage ? (
            <img
              src={thumb(album.coverImage, THUMB.card) || undefined}
              onError={onThumbError(album.coverImage)}
              loading="lazy"
              decoding="async"
              alt={album.title}
              className="w-full h-full object-cover transition-transform duration-700 group-hover/thumb:scale-105"
            />
          ) : (
            <div className="w-full h-full bg-white/10 flex items-center justify-center">
              <Music2 size={48} className="text-white/20" />
            </div>
          )}

          {/* Speaker icon — appears on hover or while previewing */}
          <div className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ${isPreviewing ? 'bg-black/30' : 'bg-black/0 group-hover/thumb:bg-black/45'}`}>
            <Volume2
              size={36}
              className={`text-white drop-shadow-[0_0_12px_rgba(255,140,0,0.8)] transition-all duration-300 ${isPreviewing ? 'opacity-100 scale-110' : 'opacity-0 group-hover/thumb:opacity-100 scale-90 group-hover/thumb:scale-100'}`}
            />
          </div>

          {/* "Hover to Preview" / active track tag */}
          <div className={`absolute bottom-0 left-0 right-0 flex justify-center pb-2.5 transition-opacity duration-300 ${isPreviewing || false ? 'opacity-100' : 'opacity-0 group-hover/thumb:opacity-100'}`}>
            <span className={`px-2.5 py-1 rounded-full text-[7px] font-black uppercase tracking-[0.2em] text-white backdrop-blur-sm ${isPreviewing ? 'bg-small-orange/90' : 'bg-black/70'}`}>
              {isPreviewing
                ? `${activeTrackIdx + 1} / ${playableTracks.length} playing`
                : 'Hover to Preview'}
            </span>
          </div>
        </button>

        {/* Copy */}
        <div className="text-center space-y-0.5">
          <p className="text-[8px] text-white/35 font-bold uppercase tracking-[0.3em]">Listen To</p>
          <p className="text-[17px] font-black text-white leading-tight drop-shadow-lg">
            {profile.displayName || album.artist}
          </p>
          <p className="text-[8px] text-white/35 font-bold uppercase tracking-[0.3em]">latest release</p>
          <p className="text-[19px] font-black uppercase tracking-tight leading-tight text-white drop-shadow-lg line-clamp-2">
            {album.title}
          </p>
          <p className="text-[9px] text-small-orange font-black uppercase tracking-[0.3em] pt-1">Right Now →</p>
        </div>

        {/* CTA button */}
        <button
          onClick={() => onOpenAlbum(album)}
          className="px-6 py-2.5 bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white hover:text-black text-white rounded-full text-[9px] font-black uppercase tracking-widest transition-all duration-300 mt-0.5"
        >
          Open Album
        </button>
      </div>

      {/* Dot progress indicators */}
      <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-1.5">
        {Array.from({ length: dotTotal }).map((_, i) => (
          <span
            key={i}
            className="rounded-full transition-all duration-300"
            style={{
              width: i === activeDot ? '16px' : '5px',
              height: '5px',
              background: i === activeDot ? '#ff8c00' : 'rgba(255,255,255,0.2)',
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default AlbumAdBillboard;
