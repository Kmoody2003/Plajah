import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Play, Pause, SkipBack, SkipForward, Repeat, Repeat1, Shuffle, Music2, Images, Speaker } from 'lucide-react';
import { useGlobalPlayer } from '../../contexts/GlobalPlayerContext';
import { thumb, THUMB } from '../../src/lib/imageThumb';
import { resolveSlideshowImages } from '../../services/slideshow';
import { useTvOverlayClaim, isTopTvOverlay } from '../../hooks/useTvOverlay';
import { setPlayerBarAvailable, FOCUS_PLAYER_BAR_EVENT } from '../../hooks/useTvPlayerBar';

/** Fired to open the "Play on" speaker picker (App listens; only where speakers are supported). */
export const OPEN_SPEAKERS_EVENT = 'plajah:open-speakers';

type BarControl = 'prev' | 'play' | 'next' | 'slideshow' | 'speakers' | 'repeat' | 'shuffle';

/**
 * The always-there television transport.
 *
 * The rule the viewer stated: once a song or an album is playing, you must NEVER lose the ability to
 * pause or play — wherever you wander in the app. So this bar is pinned to the bottom of the screen
 * for the whole session and it answers the remote's media keys globally, which is the one control
 * every TV remote has and the reason media keys exist. A basic D-pad remote gets the same guarantee:
 * the keys work no matter which grid currently owns arrow navigation, because media keys are not
 * part of D-pad navigation and so never collide with it.
 *
 * Two things it must NOT do, both by the viewer's instruction — never show a SECOND transport:
 *   • the slideshow is a fullscreen takeover with its own controls  → hide the bar,
 *   • the Chora album screen renders its own bottom transport        → hide the bar (App passes
 *     `albumViewActive`); the album's is the one on screen there.
 * The media-key handler stays live even while the bar is hidden, so pause/play still works on those
 * screens too — there is simply never a duplicate control drawn.
 */

const fmt = (s?: number): string => {
  if (!s || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
};

const TvNowPlayingBar: React.FC<{ albumViewActive?: boolean }> = ({ albumViewActive }) => {
  const {
    currentTrack, currentAlbum, audioSource, isPlaying, isSlideshowActive, isSlideshowAuto, isTvFxActive,
    currentTime, duration, togglePlay, next, prev,
    repeatMode, setRepeatMode, isShuffle, setIsShuffle, setIsSlideshowActive,
  } = useGlobalPlayer();

  const active = !!currentTrack && audioSource !== 'VIDEO';

  // Media keys, globally, for the whole time a track is loaded — the "never lose play/pause"
  // guarantee. Capture phase + stopImmediatePropagation so nothing else double-handles them; but
  // ONLY media keys are touched, so D-pad arrows/OK are left entirely to whichever grid is active.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const kc = e.keyCode || e.which;
      const k = e.key;
      const take = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      if (k === 'MediaPlayPause' || kc === 85 || kc === 179) { take(); togglePlay(); return; }
      if (k === 'MediaPlay' || kc === 126) { take(); if (!isPlaying) togglePlay(); return; }
      if (k === 'MediaPause' || kc === 127) { take(); if (isPlaying) togglePlay(); return; }
      if (k === 'MediaTrackNext' || kc === 87 || kc === 176) { take(); next(); return; }
      if (k === 'MediaTrackPrevious' || kc === 88 || kc === 177) { take(); prev(); return; }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active, isPlaying, togglePlay, next, prev]);

  // Draw the bar everywhere EXCEPT where another transport already owns the screen (album view or
  // the slideshow) or a fullscreen visual takeover is up (FX Stage). An AUTO slideshow (creator
  // toggle) never takes the TV screen — only one the viewer starts does — so it doesn't hide the bar.
  const slideshowOnScreen = isSlideshowActive && !isSlideshowAuto;
  const visible = active && !slideshowOnScreen && !isTvFxActive && !albumViewActive;

  // ── The bar as a D-pad destination ───────────────────────────────────────────────────────────
  // Reached by Down past a screen's last row, by holding Down, or by the Menu key (see
  // hooks/useTvPlayerBar). While focused it owns the remote as an overlay: Left/Right walk the
  // controls, OK presses one, Up or Back hands the remote back to the screen.
  const hasSlides = resolveSlideshowImages(currentAlbum as any, currentTrack as any).length > 0;
  const controls: BarControl[] = ['prev', 'play', 'next', ...(hasSlides ? ['slideshow' as const] : []), 'speakers', 'repeat', 'shuffle'];
  const [focused, setFocused] = useState(false);
  const [sel, setSel] = useState(1);
  useTvOverlayClaim('player-bar', focused && visible);
  useEffect(() => { setPlayerBarAvailable(visible); return () => setPlayerBarAvailable(false); }, [visible]);
  useEffect(() => { if (!visible) setFocused(false); }, [visible]);
  useEffect(() => {
    const onFocus = () => { setSel(1); setFocused(true); };
    window.addEventListener(FOCUS_PLAYER_BAR_EVENT, onFocus);
    return () => window.removeEventListener(FOCUS_PLAYER_BAR_EVENT, onFocus);
  }, []);

  const runRef = useRef<(c: BarControl) => void>(() => {});
  runRef.current = (c: BarControl) => {
    if (c === 'prev') prev();
    else if (c === 'play') togglePlay();
    else if (c === 'next') next();
    else if (c === 'slideshow') { setFocused(false); setIsSlideshowActive(true); }
    else if (c === 'speakers') { setFocused(false); window.dispatchEvent(new CustomEvent(OPEN_SPEAKERS_EVENT)); }
    else if (c === 'repeat') setRepeatMode(repeatMode === 'OFF' ? 'ALL' : repeatMode === 'ALL' ? 'ONE' : 'OFF');
    else if (c === 'shuffle') setIsShuffle(!isShuffle);
  };
  const navRef = useRef({ focused, sel, controls });
  navRef.current = { focused, sel, controls };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = navRef.current;
      if (!n.focused || !isTopTvOverlay('player-bar')) return;
      const kc = e.keyCode || e.which;
      if (kc === 24 || kc === 25 || kc === 164) return;   // volume / mute stay the system's
      const take = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      if (e.key === 'ArrowLeft' || kc === 37 || kc === 21) { take(); setSel(i => Math.max(0, i - 1)); return; }
      if (e.key === 'ArrowRight' || kc === 39 || kc === 22) { take(); setSel(i => Math.min(n.controls.length - 1, i + 1)); return; }
      if (e.key === 'Enter' || e.key === 'Select' || kc === 13 || kc === 23) { take(); runRef.current(n.controls[Math.min(n.sel, n.controls.length - 1)]); return; }
      if (e.key === 'ArrowUp' || kc === 38 || kc === 19 || kc === 4 || e.key === 'Escape' || e.key === 'Backspace' || e.key === 'GoBack' || e.key === 'BrowserBack' || e.key === 'XF86Back') {
        take(); setFocused(false); return;
      }
      if (e.key === 'ArrowDown' || kc === 40 || kc === 20) { take(); return; }   // already at the bottom
    };
    const onHwBack = (ev: Event) => {
      if (!navRef.current.focused || !isTopTvOverlay('player-bar')) return;
      ev.preventDefault(); setFocused(false);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('plajah:hardware-back', onHwBack);
    return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('plajah:hardware-back', onHwBack); };
  }, []);

  if (!visible) return null;
  const selected = focused ? controls[Math.min(sel, controls.length - 1)] : null;
  const ring = (c: BarControl): React.CSSProperties | undefined =>
    selected === c ? { boxShadow: '0 0 0 4px #FF8C00, 0 0 0 7px rgba(0,0,0,0.7)', transform: 'scale(1.08)' } : undefined;

  const pct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const art = (currentTrack as any)?.albumCover || (currentAlbum as any)?.coverImage;
  const cycleRepeat = () => setRepeatMode(repeatMode === 'OFF' ? 'ALL' : repeatMode === 'ALL' ? 'ONE' : 'OFF');
  const ACCENT = '#FF8C00';

  return createPortal(
    <div
      className={`fixed left-0 right-0 bottom-0 z-[120] px-10 py-4 flex items-center gap-6 bg-[#0a0510]/95 border-t transition-colors ${focused ? 'border-[#FF8C00]/60' : 'border-white/10'}`}
      role="group"
      aria-label="Now playing"
    >
      {/* Art + title */}
      <div className="flex items-center gap-4 w-[22%] min-w-0 shrink-0">
        <div className="w-12 h-12 rounded-lg overflow-hidden bg-white/[0.06] shrink-0 grid place-items-center">
          {art ? <img src={thumb(art, THUMB.small)} alt="" className="w-full h-full object-cover" /> : <Music2 size={18} className="text-white/30" />}
        </div>
        <div className="min-w-0">
          <p className="text-[14px] font-black text-white truncate">{currentTrack?.title || ''}</p>
          <p className="text-[12px] text-white/45 truncate">{currentTrack?.artist || (currentAlbum as any)?.artist || ''}</p>
        </div>
      </div>

      {/* Progress */}
      <div className="flex-1 min-w-0 flex items-center gap-3">
        <span className="text-[11px] tabular-nums text-white/45 w-11 text-right">{fmt(currentTime)}</span>
        <div className="flex-1 h-1.5 rounded-full bg-white/12 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: ACCENT }} />
        </div>
        <span className="text-[11px] tabular-nums text-white/45 w-11">{fmt(duration)}</span>
      </div>

      {/* Transport. The remote's media keys drive it from anywhere; the D-pad reaches it by Down past
          the last row, holding Down, or Menu — then ◀ ▶ walk these and OK presses. */}
      <div className="flex items-center gap-3 shrink-0 text-white/85">
        <button onClick={() => prev()} aria-label="Previous" className="p-2 rounded-full transition-transform" style={ring('prev')}><SkipBack size={20} fill="currentColor" /></button>
        <button onClick={() => togglePlay()} aria-label={isPlaying ? 'Pause' : 'Play'}
          className="w-12 h-12 rounded-full grid place-items-center transition-transform" style={{ background: ACCENT, color: '#000', ...ring('play') }}>
          {isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" className="ml-0.5" />}
        </button>
        <button onClick={() => next()} aria-label="Next" className="p-2 rounded-full transition-transform" style={ring('next')}><SkipForward size={20} fill="currentColor" /></button>
        {hasSlides && (
          <button onClick={() => runRef.current('slideshow')} aria-label="Slideshow" className="flex items-center gap-2 px-3 py-2 rounded-full transition-transform text-[11px] font-black uppercase tracking-widest" style={ring('slideshow')}>
            <Images size={18} /> Slideshow
          </button>
        )}
        <button onClick={() => runRef.current('speakers')} aria-label="Play on" className="flex items-center gap-2 px-3 py-2 rounded-full transition-transform text-[11px] font-black uppercase tracking-widest" style={ring('speakers')}>
          <Speaker size={18} /> Play on
        </button>
        <button onClick={cycleRepeat} aria-label="Repeat" className="p-2 rounded-full transition-transform" style={{ color: repeatMode !== 'OFF' ? ACCENT : undefined, ...ring('repeat') }}>
          {repeatMode === 'ONE' ? <Repeat1 size={18} /> : <Repeat size={18} />}
        </button>
        <button onClick={() => setIsShuffle(!isShuffle)} aria-label="Shuffle" className="p-2 rounded-full transition-transform" style={{ color: isShuffle ? ACCENT : undefined, ...ring('shuffle') }}>
          <Shuffle size={17} />
        </button>
      </div>
      {!focused && (
        <span className="hidden xl:block text-[10px] font-black uppercase tracking-[0.2em] text-white/30 shrink-0">Hold ▼ or Menu for controls</span>
      )}
    </div>,
    document.body,
  );
};

export default TvNowPlayingBar;
