import React, { useEffect, useMemo } from 'react';
import AnimatedSlideshow from '../AnimatedSlideshow';
import { useGlobalPlayer } from '../../contexts/GlobalPlayerContext';
import { resolveSlideshowImages } from '../../services/slideshow';

/**
 * The slideshow, on a television.
 *
 * The trigger already existed — GlobalPlayerContext starts a slideshow after twenty seconds of
 * uninterrupted TV playback, which is the lean-back behaviour a ten-foot screen wants. What was
 * missing was anything to draw it: the only renderers were the desktop player and the nano back
 * face, so on a TV the flag flipped and the screen carried on showing a browse grid.
 *
 * This is that surface. It takes the display outright, because a slideshow competing with a rail
 * of album art is neither one thing nor the other, and because the images are the creator's own
 * photographs — the reason the feature exists at all.
 *
 * Any press dismisses it and hands the remote straight back. A viewer who reaches for the remote
 * wants the app, not a transition, so this listens in the capture phase and consumes exactly the
 * one press that closes it. It deliberately does NOT use the data-tv-capture grid: there is
 * nothing here to navigate, and claiming the arrows would strand focus when the surface closes.
 */
const TvSlideshowSurface: React.FC = () => {
  const { currentAlbum, currentTrack, isPlaying, isSlideshowActive, setIsSlideshowActive, currentTime } = useGlobalPlayer();
  const images = resolveSlideshowImages(currentAlbum as any, currentTrack as any);
  const showing = isSlideshowActive && images.length > 0;

  // Synced lyrics for the right-hand column — the same karaoke the desktop TV-mode fullscreen
  // shows. A window of lines around the playhead, the active one lifted.
  const lyrics = (currentTrack as any)?.timeCodedLyrics as { time: number; text: string }[] | undefined;
  const lyricWindow = useMemo(() => {
    if (!lyrics?.length) return null;
    const t = currentTime || 0;
    let active = lyrics.findIndex((l, i) => t >= l.time && (!lyrics[i + 1] || t < lyrics[i + 1].time));
    if (active === -1) active = t < lyrics[0].time ? 0 : lyrics.length - 1;
    const from = Math.max(0, active - 2);
    return { active, lines: lyrics.slice(from, from + 6).map((l, i) => ({ text: l.text, on: from + i === active })) };
  }, [lyrics, currentTime]);

  useEffect(() => {
    if (!showing) return;
    const dismiss = (e: KeyboardEvent) => {
      // Volume and power are the system's, not ours — swallowing them would be rude and would
      // make the remote feel broken.
      const kc = e.keyCode || e.which;
      if (kc === 24 || kc === 25 || kc === 26 || kc === 164) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setIsSlideshowActive(false);
    };
    window.addEventListener('keydown', dismiss, true);
    return () => window.removeEventListener('keydown', dismiss, true);
  }, [showing, setIsSlideshowActive]);

  if (!showing) return null;

  return (
    <div
      // Above the TV tab bar (z-60) and the player takeover's siblings, below nothing that
      // matters — this is the whole screen while it is up.
      className="fixed inset-0 z-[300] bg-black"
      // A screen, not a dialog: without this the D-pad layer would treat a full-viewport fixed
      // element as a modal and trap focus in a surface that has no focusables at all.
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

      {/* Right-hand synced lyrics — only when the track carries them. A left-to-right scrim keeps
          them legible over the photography without a blur (blur is a fill-rate killer on this TV). */}
      {lyricWindow && (
        <div
          className="absolute top-0 right-0 bottom-0 w-[46%] flex flex-col justify-center px-14 pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(6,2,12,0.55) 30%, rgba(6,2,12,0.82) 100%)' }}
        >
          <div className="space-y-5">
            {lyricWindow.lines.map((ln, i) => (
              <p
                key={i}
                className={`font-black leading-tight transition-all duration-500 ${
                  ln.on ? 'text-4xl' : 'text-2xl text-white/30'
                }`}
                style={ln.on ? { color: '#FFB68D' } : undefined}
              >
                {ln.text || '♪'}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* What is playing, and how to leave. Small and low-contrast: the photographs are the
          point, and a TV overlay that shouts competes with them. */}
      <div className="absolute left-0 right-0 bottom-0 p-10 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Now playing</p>
        <p className="text-3xl font-black text-white mt-1 truncate">{currentTrack?.title || ''}</p>
        <p className="text-lg text-white/60 truncate">{currentTrack?.artist || ''}</p>
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/30 mt-4">
          Press any button to return
        </p>
      </div>
    </div>
  );
};

export default TvSlideshowSurface;
