import React, { useEffect } from 'react';
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
  const { currentAlbum, currentTrack, isPlaying, isSlideshowActive, setIsSlideshowActive } = useGlobalPlayer();
  const images = resolveSlideshowImages(currentAlbum as any, currentTrack as any);
  const showing = isSlideshowActive && images.length > 0;

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
