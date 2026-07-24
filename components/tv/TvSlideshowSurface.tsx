import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Play, Pause, SkipBack, SkipForward, Music2 } from 'lucide-react';
import AnimatedSlideshow from '../AnimatedSlideshow';
import { useGlobalPlayer } from '../../contexts/GlobalPlayerContext';
import { resolveSlideshowImages } from '../../services/slideshow';
import { thumb, THUMB } from '../../src/lib/imageThumb';

/**
 * The slideshow, on a television — now with transport controls, like the desktop fullscreen player.
 *
 * The old rule was "any press dismisses". That was fine when there was nothing to do here, but the
 * creator's photography IS the now-playing screen, so the remote should drive playback from it, not
 * bounce you out of it. New model:
 *   • the FIRST press wakes the controls (a bottom transport bar) instead of leaving,
 *   • Left/Right skip tracks, OK toggles play/pause, and the bar auto-hides after a few seconds,
 *   • BACK is the one key that leaves — so exiting is deliberate, not accidental.
 *
 * Still not a data-tv-capture grid: there is no free-form navigation here, just those few keys,
 * handled in the capture phase so nothing behind reacts to them.
 */

const fmt = (s?: number): string => {
  if (!s || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
};

const TvSlideshowSurface: React.FC = () => {
  const {
    currentAlbum, currentTrack, isPlaying, isSlideshowActive, setIsSlideshowActive,
    currentTime, duration, togglePlay, next, prev,
  } = useGlobalPlayer();
  const images = resolveSlideshowImages(currentAlbum as any, currentTrack as any);
  const showing = isSlideshowActive && images.length > 0;

  const [controls, setControls] = useState(false);
  const hideTimer = useRef<any>(null);
  const wake = useCallback(() => {
    setControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControls(false), 4500);
  }, []);

  // Synced lyrics for the right-hand column — a window of lines around the playhead, active lifted.
  const lyrics = (currentTrack as any)?.timeCodedLyrics as { time: number; text: string }[] | undefined;
  const lyricWindow = useMemo(() => {
    if (!lyrics?.length) return null;
    const t = currentTime || 0;
    let active = lyrics.findIndex((l, i) => t >= l.time && (!lyrics[i + 1] || t < lyrics[i + 1].time));
    if (active === -1) active = t < lyrics[0].time ? 0 : lyrics.length - 1;
    const from = Math.max(0, active - 2);
    return { lines: lyrics.slice(from, from + 6).map((l, i) => ({ text: l.text, on: from + i === active })) };
  }, [lyrics, currentTime]);

  useEffect(() => {
    if (!showing) return;
    const onKey = (e: KeyboardEvent) => {
      const kc = e.keyCode || e.which;
      if (kc === 24 || kc === 25 || kc === 26 || kc === 164) return;   // volume / power — system's
      const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      // BACK is the only way out — deliberate, not any-key-accidental.
      if (kc === 4 || e.key === 'Backspace' || e.key === 'Escape' || e.key === 'XF86Back' || e.key === 'GoBack') {
        stop(); setIsSlideshowActive(false); return;
      }
      stop();
      // First press just wakes the controls; a woken remote operates playback.
      if (!controls) { wake(); return; }
      wake();
      if (e.key === 'ArrowLeft' || kc === 37 || kc === 21) prev();
      else if (e.key === 'ArrowRight' || kc === 39 || kc === 22) next();
      else if (e.key === 'Enter' || e.key === 'Select' || kc === 13 || kc === 23) togglePlay();
    };
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('keydown', onKey, true); if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [showing, controls, wake, setIsSlideshowActive, prev, next, togglePlay]);

  // Reset the controls each time the surface opens.
  useEffect(() => { if (!showing) setControls(false); }, [showing]);

  if (!showing) return null;

  const pct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const art = (currentTrack as any)?.albumCover || (currentAlbum as any)?.coverImage;

  // Portalled to document.body: `fixed inset-0` is contained to the nearest transformed/filtered
  // ancestor, and the TV content area has one that stops short of the screen bottom — which clipped
  // the slideshow above the bottom edge. Rendering straight into <body> makes inset-0 mean the real
  // viewport, so it fills the whole screen (same reason the Taleo player is portalled).
  return createPortal(
    <div
      className="fixed inset-0 z-[300] bg-black"
      data-tv-no-trap
      role="img"
      aria-label={`${currentTrack?.title || 'Now playing'} — slideshow`}
    >
      <AnimatedSlideshow
        images={images}
        isPlaying={isPlaying}
        themeColor={(currentAlbum as any)?.themeColor || '#FF8C00'}
        artistNotes={(currentTrack as any)?.artistNotes || []}
      />

      {/* Right-hand synced lyrics — a left-to-right scrim (no blur; blur is a TV fill-rate killer). */}
      {lyricWindow && (
        <div
          className="absolute top-0 right-0 bottom-0 w-[46%] flex flex-col justify-center px-14 pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(6,2,12,0.55) 30%, rgba(6,2,12,0.82) 100%)' }}
        >
          <div className="space-y-5">
            {lyricWindow.lines.map((ln, i) => (
              <p
                key={i}
                className={`font-black leading-tight transition-all duration-500 ${ln.on ? 'text-4xl' : 'text-2xl text-white/30'}`}
                style={ln.on ? { color: '#FF8C00' } : undefined}
              >
                {ln.text || '♪'}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Transport overlay — wakes on a press, auto-hides. Progress + prev / play-pause / next. */}
      <div
        className="absolute left-0 right-0 bottom-0 px-12 pb-9 pt-24 bg-gradient-to-t from-black/85 via-black/45 to-transparent transition-opacity duration-300"
        style={{ opacity: controls ? 1 : 0 }}
      >
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 rounded-xl overflow-hidden bg-white/[0.06] shrink-0 grid place-items-center">
            {art ? <img src={thumb(art, THUMB.small)} alt="" className="w-full h-full object-cover" /> : <Music2 size={22} className="text-white/30" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-2xl font-black text-white truncate">{currentTrack?.title || ''}</p>
            <p className="text-base text-white/55 truncate">{currentTrack?.artist || ''}</p>
          </div>
          <div className="flex items-center gap-5 shrink-0 text-white/85">
            <SkipBack size={26} fill="currentColor" />
            <span className="w-14 h-14 rounded-full grid place-items-center" style={{ background: '#FF8C00', color: '#000' }}>
              {isPlaying ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" className="ml-0.5" />}
            </span>
            <SkipForward size={26} fill="currentColor" />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <span className="text-[11px] tabular-nums text-white/45 w-11 text-right">{fmt(currentTime)}</span>
          <div className="flex-1 h-1.5 rounded-full bg-white/15 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: '#FF8C00' }} />
          </div>
          <span className="text-[11px] tabular-nums text-white/45 w-11">{fmt(duration)}</span>
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/30 mt-4 text-center">
          ◀ ▶ skip · OK play/pause · Back to return
        </p>
      </div>
    </div>,
    document.body,
  );
};

export default TvSlideshowSurface;
