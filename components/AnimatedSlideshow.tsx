import React, { useState, useEffect } from 'react';
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
}

/**
 * On a television this ran choppily, and the cause was specific: the slide transition ANIMATED a
 * `filter: blur()` across a full-screen image, plus a `backdrop-blur-3xl` note card and a
 * full-viewport `mix-blend-overlay`. All three are per-pixel, fill-rate work — the one thing the
 * TV's Mali-G31 is worst at (it's fill-rate bound; see docs/TV_GPU_BENCHMARK.md). A transform
 * `scale`, by contrast, is composited on the GPU with no repaint, so the Ken Burns move is cheap
 * and stays. The `tv` branch therefore keeps the crossfade + slow zoom but drops every blur/blend.
 */
const AnimatedSlideshow: React.FC<AnimatedSlideshowProps> = ({ images, isPlaying, themeColor, artistNotes = [] }) => {
  const [index, setIndex] = useState(0);
  const [noteIndex, setNoteIndex] = useState(0);
  useGlobalPlayerState();
  const [pulse] = useState(1);
  const tv = getPlatformInfo().isTV;

  useEffect(() => {
    if (!images.length) return;
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % images.length);
    }, 8000); // 8 seconds per slide for more "editorial" feel
    return () => clearInterval(interval);
  }, [images.length]);

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
    if (!tv || images.length < 2) return;
    for (let k = 1; k <= 2; k++) {
      const nextUrl = images[(index + k) % images.length];
      if (nextUrl) { const im = new Image(); im.decoding = 'async'; im.src = heroImage(nextUrl); }
    }
  }, [index, images, tv]);

  if (!images.length) return null;

  // TV: opacity-only crossfade, no blur. Desktop: the original blur-in reveal.
  const slideMotion = tv
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1, transition: { opacity: { duration: 1.2, ease: 'easeOut' } } },
        exit: { opacity: 0, transition: { duration: 1 } },
      }
    : {
        initial: { opacity: 0, scale: 1.1, filter: 'blur(10px)' },
        animate: {
          opacity: 1, scale: 1, filter: 'blur(0px)',
          transition: { opacity: { duration: 2, ease: 'circOut' }, scale: { duration: 0.1, ease: 'linear' }, filter: { duration: 2.5, ease: 'circOut' } },
        },
        exit: { opacity: 0, scale: 1.05, filter: 'blur(5px)', transition: { duration: 1.5 } },
      };

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      {/* TV crossfades (mode sync): old and new overlap so there is no black gap between slides.
          Desktop keeps the blur-in reveal (mode wait). */}
      <AnimatePresence mode={tv ? 'sync' : 'wait'}>
        <motion.div key={index} {...(slideMotion as any)} className="absolute inset-0 w-full h-full">
          {tv ? (
            // object-CONTAIN so the whole photograph shows (cover was clipping top/bottom of
            // anything not 16:9). Ken Burns kept: on a contained image the zoom starts with the
            // full photo visible and drifts in gently — and because the image is letterboxed, its
            // edges never touch the viewport, so the sub-pixel edge shimmer that cover produced is
            // gone. heroImage() keeps it off the raw-original decode path.
            <img
              src={heroImage(images[index]) || undefined}
              alt={`Slide ${index}`}
              className="w-full h-full object-contain tv-kenburns"
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
          {!tv && (
            <div className="absolute inset-0 opacity-20 mix-blend-overlay pointer-events-none transition-colors duration-[2000ms]" style={{ backgroundColor: themeColor }} />
          )}
        </motion.div>
      </AnimatePresence>

      {/* A single ambient glow — desktop only. One more infinite animation is not worth a dropped
          frame on the TV. */}
      {!tv && (
        <div className="absolute inset-0 pointer-events-none border border-white/5 rounded-inherit overflow-hidden">
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
