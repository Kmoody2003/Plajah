import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Play, Pause, SkipBack, SkipForward, Repeat, Repeat1, Shuffle, Music2 } from 'lucide-react';
import { useGlobalPlayer } from '../../contexts/GlobalPlayerContext';
import { thumb, THUMB } from '../../src/lib/imageThumb';

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
    currentTrack, currentAlbum, audioSource, isPlaying, isSlideshowActive, isTvFxActive,
    currentTime, duration, togglePlay, next, prev,
    repeatMode, setRepeatMode, isShuffle, setIsShuffle,
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
  // the slideshow) or a fullscreen visual takeover is up (FX Stage).
  const visible = active && !isSlideshowActive && !isTvFxActive && !albumViewActive;
  if (!visible) return null;

  const pct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const art = (currentTrack as any)?.albumCover || (currentAlbum as any)?.coverImage;
  const cycleRepeat = () => setRepeatMode(repeatMode === 'OFF' ? 'ALL' : repeatMode === 'ALL' ? 'ONE' : 'OFF');
  const ACCENT = '#FF8C00';

  return createPortal(
    <div
      className="fixed left-0 right-0 bottom-0 z-[120] px-10 py-4 flex items-center gap-6 bg-[#0a0510]/95 border-t border-white/10"
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

      {/* Transport. Not D-pad targets — the remote's media keys drive these (see the handler above),
          which is what lets the bar stay reachable without stealing arrow focus from the screen. */}
      <div className="flex items-center gap-4 shrink-0 text-white/85">
        <button onClick={() => prev()} aria-label="Previous" className="p-1.5"><SkipBack size={20} fill="currentColor" /></button>
        <button onClick={() => togglePlay()} aria-label={isPlaying ? 'Pause' : 'Play'}
          className="w-12 h-12 rounded-full grid place-items-center" style={{ background: ACCENT, color: '#000' }}>
          {isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" className="ml-0.5" />}
        </button>
        <button onClick={() => next()} aria-label="Next" className="p-1.5"><SkipForward size={20} fill="currentColor" /></button>
        <button onClick={cycleRepeat} aria-label="Repeat" className="p-1.5" style={{ color: repeatMode !== 'OFF' ? ACCENT : undefined }}>
          {repeatMode === 'ONE' ? <Repeat1 size={18} /> : <Repeat size={18} />}
        </button>
        <button onClick={() => setIsShuffle(!isShuffle)} aria-label="Shuffle" className="p-1.5" style={{ color: isShuffle ? ACCENT : undefined }}>
          <Shuffle size={17} />
        </button>
      </div>
    </div>,
    document.body,
  );
};

export default TvNowPlayingBar;
