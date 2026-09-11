import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';
import ThreeDImage from './ThreeDImage';
import { Sparkles, Zap } from 'lucide-react';
import { getPlatformInfo } from '../hooks/usePlatform';
import { heroImage } from '../src/lib/imageThumb';

interface AnimatedSlideshowProps {
  images: string[];
  isPlaying: boolean;
  themeColor: string;
  artistNotes?: string[];
  /** Offset lets two simultaneous slideshows stay deliberately out of phase. */
  startIndex?: number;
  /** Sharp, restrained motion for an embedded artwork panel (never blur). */
  presentation?: 'ambient' | 'panel';
}

/**
 * On a television this ran choppily, and the cause was specific: the slide transition ANIMATED a
 * `filter: blur()` across a full-screen image, plus a `backdrop-blur-3xl` note card and a
 * full-viewport `mix-blend-overlay`. All three are per-pixel, fill-rate work — the one thing the
 * TV's Mali-G31 is worst at (it's fill-rate bound; see docs/TV_GPU_BENCHMARK.md). A transform
 * `scale`, by contrast, is composited on the GPU with no repaint, so the Ken Burns move is cheap
 * and stays. The `tv` branch therefore keeps the crossfade + slow zoom but drops every blur/blend.
 */
const AnimatedSlideshow: React.FC<AnimatedSlideshowProps> = ({ images, isPlaying, themeColor, artistNotes = [], startIndex = 0, presentation = 'ambient' }) => {
  const [index, setIndex] = useState(() => images.length ? startIndex % images.length : 0);
  const [noteIndex, setNoteIndex] = useState(0);
  useGlobalPlayerState();
  const [pulse] = useState(1);
  const tv = getPlatformInfo().isTV;

  // The NEXT image in the rotation — used as the blurred background behind the viewport
  // so the bg is always a different image from the foreground, giving depth.
  const nextIndex = useMemo(() => images.length > 1 ? (index + 1) % images.length : index, [index, images.length]);

  useEffect(() => {
    if (!images.length) return;
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % images.length);
    }, 8000); // 8 seconds per slide for more "editorial" feel
    return () => clearInterval(interval);
  }, [images.length]);

  useEffect(() => {
    setIndex(images.length ? startIndex % images.length : 0);
  }, [images.length, startIndex]);

  useEffect(() => {
    if (!artistNotes.length) return;
    const interval = setInterval(() => {
      setNoteIndex((prev) => (prev + 1) % artistNotes.length);
    }, 12000); // Notes stay longer to be readable
    return () => clearInterval(interval);
  }, [artistNotes.length]);

  // Preload the NEXT couple of (resized) images so a slide never arrives half-drawn or after a
  // black gap — the browser has them decoded and cached before the crossfade begins.
  useEffect(() => {
    if (images.length < 2) return;
    for (let k = 1; k <= 3; k++) {
      const nextUrl = images[(index + k) % images.length];
      if (nextUrl) { const im = new Image(); im.decoding = 'async'; im.src = heroImage(nextUrl); }
    }
  }, [index, images]);

  if (!images.length) return null;

  // ALL modes now use 'sync' so old and new slides OVERLAP during the crossfade.
  // The old 'wait' mode caused a black gap because the exit completed before the enter began.
  // The crossfade duration is generous (1.4s shared overlap) for a cinematic dissolve feel.
  const slideMotion = presentation === 'panel'
    ? {
        initial: { opacity: 0, scale: 1.015, x: '1.2%' },
        animate: {
          opacity: 1, scale: 1.09, x: '-1.2%',
          transition: {
            opacity: { duration: 1.6, ease: 'easeOut' },
            scale: { duration: 10, ease: 'linear' },
            x: { duration: 10, ease: 'linear' },
          },
        },
        exit: { opacity: 0, transition: { duration: 1.6, ease: 'easeInOut' } },
      }
    : tv
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1, transition: { opacity: { duration: 1.2, ease: 'easeOut' } } },
        exit: { opacity: 0, transition: { duration: 1 } },
      }
    : {
        initial: { opacity: 0, scale: 1.04 },
        animate: {
          opacity: 1, scale: 1,
          transition: {
            opacity: { duration: 1.6, ease: 'easeOut' },
            scale: { duration: 8, ease: 'linear' },
          },
        },
        exit: { opacity: 0, scale: 1.02, transition: { duration: 1.6, ease: 'easeInOut' } },
      };

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      {/* Blurred background layer — shows the NEXT upcoming image (not the current one)
          for visual depth. Softly blurred so it reads as ambient atmosphere, not a duplicate. */}
      {images.length > 1 && !tv && (
        <AnimatePresence mode="sync">
          <motion.div
            key={`bg-${nextIndex}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 2, ease: 'easeOut' } }}
            exit={{ opacity: 0, transition: { duration: 2 } }}
            className="absolute inset-0 z-0"
          >
            <img
              src={heroImage(images[nextIndex]) || undefined}
              alt=""
              className="w-full h-full object-cover scale-125 blur-[24px] opacity-40"
              loading="eager"
              decoding="async"
            />
            <div className="absolute inset-0 bg-black/40" />
          </motion.div>
        </AnimatePresence>
      )}

      {/* Main slide — always uses 'sync' mode so old and new overlap during crossfade.
          No more black gap between slides. */}
      <AnimatePresence mode="sync">
        <motion.div key={index} {...(slideMotion as any)} className="absolute inset-0 w-full h-full z-[1]">
          {tv || presentation === 'panel' ? (
            // Full-bleed (object-COVER) so a non-16:9 photo fills the screen — but anchored to the
            // TOP (object-top), so an over-tall image spills off the BOTTOM only and never clips a
            // subject's head. Ken Burns kept; tv-kenburns is pinned to its own GPU layer so the
            // scaling edges don't shimmer. heroImage() keeps it off the raw-original decode path.
            <img
              src={heroImage(images[index]) || undefined}
              alt={`Slide ${index}`}
              className={`w-full h-full object-cover object-top ${tv && presentation !== 'panel' ? 'tv-kenburns' : ''}`}
              loading="eager"
              decoding="async"
            />
          ) : (
            <ThreeDImage
              src={images[index] || undefined}
              alt={`Slide ${index}`}
              className="w-full h-full object-cover"
              animate={{ scale: isPlaying ? [1 * pulse, 1.05 * pulse] : [1, 1.05] }}
              transition={{ scale: { duration: 10, repeat: Infinity, repeatType: 'reverse', ease: 'linear' } }}
            />
          )}

          {/* Artist Sticky Note UI */}
          {artistNotes && artistNotes.length > 0 && (
            <AnimatePresence mode="wait">
              <motion.div
                key={noteIndex}
                initial={{ opacity: 0, y: 40, rotate: -2 }}
                animate={{ opacity: 1, y: 0, rotate: 0 }}
                exit={{ opacity: 0, y: -20, rotate: 2 }}
                transition={{ duration: 1, ease: 'backOut' }}
                className="absolute bottom-12 right-12 max-w-xs z-50 overflow-hidden"
              >
                {/* backdrop-blur is a fill-rate killer on TV — use a solid scrim there instead. */}
                <div className={`relative p-8 border border-white/20 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden group ${tv ? 'bg-black/75' : 'bg-white/10 backdrop-blur-3xl'}`}>
                  <div className="absolute top-0 right-0 p-3 opacity-20"><Sparkles size={16} /></div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center border border-white/10">
                      <Zap size={14} className="text-small-orange" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/50">Production Note</span>
                  </div>
                  <p className="text-sm lg:text-base font-bold italic leading-relaxed text-white drop-shadow-sm font-sans tracking-wide">
                    "{artistNotes[noteIndex]}"
                  </p>
                  <div className="absolute bottom-0 left-0 h-1 bg-small-orange/40 w-full">
                    <motion.div initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ duration: 12, ease: 'linear' }} className="h-full bg-small-orange" />
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          )}

          {/* Vignette. The themed mix-blend wash is desktop-only — blend modes force off-screen
              compositing every frame, which the TV cannot spare. */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
          {!tv && presentation !== 'panel' && (
            <div className="absolute inset-0 opacity-20 mix-blend-overlay pointer-events-none transition-colors duration-[2000ms]" style={{ backgroundColor: themeColor }} />
          )}
        </motion.div>
      </AnimatePresence>

      {/* A single ambient glow — desktop only. One more infinite animation is not worth a dropped
          frame on the TV. */}
      {!tv && presentation !== 'panel' && (
        <div className="absolute inset-0 pointer-events-none border border-white/5 rounded-inherit overflow-hidden z-[2]">
          <motion.div
            animate={{ opacity: isPlaying ? [0.1, 0.3, 0.1] : 0.1, scale: 1 }}
            transition={{ duration: 4, repeat: Infinity }}
            className="absolute inset-0 bg-radial-gradient from-white/10 to-transparent"
          />
        </div>
      )}
    </div>
  );
};

export default AnimatedSlideshow;
