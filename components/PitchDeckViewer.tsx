/**
 * PitchDeckViewer
 *
 * Renders a PitchDeck as an interactive presentation:
 *  - Popup mode: dims the page, centers the deck, spring-animated slide transitions
 *  - Auto-play: advances slides on timer, synced to narration audio
 *  - Manual nav: ← → arrow keys + on-screen buttons + swipe on mobile
 *  - Vertical video reflow: when viewport is portrait (phone/Reels/TikTok),
 *    elements reflow into a stacked 9:16 layout automatically
 *  - Embed mode: full-width, no overlay, no close button
 *
 * Usage:
 *   <PitchDeckViewer deck={deck} onClose={() => setOpen(false)} autoPlay />
 */

import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, ChevronLeft, ChevronRight, Play, Pause,
  Volume2, VolumeX, Maximize2, Minimize2, Share2, ExternalLink,
} from 'lucide-react';
import { PitchDeck, PitchSlide, PitchElement } from '../types';

// ─── Transition variants ───────────────────────────────────────────────────────

const SLIDE_VARIANTS: Record<string, { initial: any; animate: any; exit: any }> = {
  fade:       { initial:{ opacity:0 },            animate:{ opacity:1 },                       exit:{ opacity:0 } },
  'slide-left':{ initial:{ x:'100%', opacity:0 }, animate:{ x:0, opacity:1 },                 exit:{ x:'-100%', opacity:0 } },
  'slide-up': { initial:{ y:'40%', opacity:0 },   animate:{ y:0, opacity:1 },                  exit:{ y:'-20%', opacity:0 } },
  zoom:       { initial:{ scale:1.08, opacity:0 }, animate:{ scale:1, opacity:1 },             exit:{ scale:0.94, opacity:0 } },
  none:       { initial:{},                        animate:{},                                  exit:{} },
};

// ─── Single rendered element ───────────────────────────────────────────────────

function RenderElement({ el, isPortrait, ctaUrl }: { el: PitchElement; isPortrait: boolean; ctaUrl?: string }) {
  // In portrait mode, redistribute element positions vertically
  const portraitStyle: React.CSSProperties = isPortrait ? {
    left: `${el.x}%`,
    top: `${el.y * 0.55 + 2}%`,    // compress vertical range so elements stack nicely in 9:16
    width: Math.min(98, el.width + 10) + '%',
    height: 'auto',
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
  } : {};

  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${el.x}%`,
    top: `${el.y}%`,
    width: `${el.width}%`,
    height: `${el.height}%`,
    zIndex: el.zIndex ?? 1,
    opacity: el.opacity ?? 1,
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
    ...portraitStyle,
  };

  if (el.type === 'text') {
    return (
      <div style={{
        ...baseStyle,
        fontSize: isPortrait ? `${(el.fontSize ?? 18) * 1.3}px` : `${el.fontSize ?? 18}px`,
        fontWeight: el.fontWeight ?? '400',
        fontFamily: el.fontFamily ?? 'inherit',
        color: el.color ?? '#fff',
        textAlign: el.textAlign ?? 'left',
        lineHeight: el.lineHeight ?? 1.4,
        letterSpacing: el.letterSpacing ? `${el.letterSpacing}px` : undefined,
        textShadow: el.textShadow,
        fontStyle: el.fontStyle ?? 'normal',
        wordBreak: 'break-word',
        pointerEvents: 'none',
        userSelect: 'none',
        display: 'flex', alignItems: 'center',
      }}>
        <span style={{ width:'100%', textAlign: el.textAlign ?? 'left' }}>{el.content}</span>
      </div>
    );
  }

  if (el.type === 'image') {
    return (
      <div style={baseStyle}>
        <img src={el.src} alt="" style={{
          width:'100%', height:'100%', objectFit: el.objectFit ?? 'cover',
          borderRadius: el.borderRadius ?? 0,
          boxShadow: el.shadow,
          display: 'block',
        }}/>
      </div>
    );
  }

  if (el.type === 'video') {
    return (
      <div style={baseStyle}>
        <video src={el.videoSrc} autoPlay={el.autoPlay} loop={el.loop} muted={el.muted ?? true}
          style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius: el.borderRadius ?? 0 }}/>
      </div>
    );
  }

  if (el.type === 'button') {
    const href = ctaUrl ?? el.href ?? '#';
    return (
      <div style={baseStyle}>
        <a href={href} target="_blank" rel="noopener noreferrer" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '100%', height: '100%',
          backgroundColor: el.btnColor ?? '#ff8c00',
          color: el.btnTextColor ?? '#000',
          borderRadius: el.btnBorderRadius ?? 8,
          fontWeight: '700', fontSize: el.fontSize ?? 16,
          fontFamily: el.fontFamily ?? 'inherit',
          textDecoration: 'none', cursor: 'pointer',
        }}>
          {el.label ?? 'Learn More'}
        </a>
      </div>
    );
  }

  if (el.type === 'shape') {
    return (
      <div style={{
        ...baseStyle,
        backgroundColor: el.fill ?? 'rgba(255,255,255,0.1)',
        borderRadius: el.shapeType === 'circle' ? '50%' : el.borderRadius ?? 0,
        border: el.stroke ? `${el.strokeWidth ?? 2}px solid ${el.stroke}` : undefined,
      }}/>
    );
  }

  return null;
}

// ─── Single slide renderer ─────────────────────────────────────────────────────

function RenderSlide({ slide, isPortrait, ctaUrl }: { slide: PitchSlide; isPortrait: boolean; ctaUrl?: string }) {
  const bg: React.CSSProperties = {
    background: slide.bgType === 'gradient' || slide.bgType === 'color' ? slide.bgValue : '#000',
  };
  if (slide.bgType === 'image') {
    bg.backgroundImage = `url(${slide.bgValue})`;
    bg.backgroundSize = 'cover';
    bg.backgroundPosition = 'center';
  }

  const sorted = [...slide.elements].sort((a,b) => (a.zIndex ?? 1) - (b.zIndex ?? 1));

  return (
    <div className="absolute inset-0" style={bg}>
      {slide.bgType === 'video' && (
        <video src={slide.bgValue} autoPlay loop muted style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }}/>
      )}
      {slide.bgOverlay && (
        <div style={{ position:'absolute', inset:0, background: slide.bgOverlay }}/>
      )}
      {sorted.map(el => (
        <RenderElement key={el.id} el={el} isPortrait={isPortrait} ctaUrl={ctaUrl}/>
      ))}
    </div>
  );
}

// ─── Viewer ────────────────────────────────────────────────────────────────────

interface Props {
  deck: PitchDeck;
  onClose?: () => void;
  autoPlay?: boolean;
  /** embed mode — no overlay, no close button, fills container */
  embed?: boolean;
  /** start from this slide index */
  startIndex?: number;
}

export default function PitchDeckViewer({ deck, onClose, autoPlay = false, embed = false, startIndex = 0 }: Props) {
  const sorted = useMemo(() => [...deck.slides].sort((a,b) => a.order - b.order), [deck.slides]);
  const [idx, setIdx] = useState(startIndex);
  const [playing, setPlaying] = useState(autoPlay);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const narrationRef = useRef<HTMLAudioElement | null>(null);
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);
  const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const direction = useRef<1 | -1>(1);

  const slide = sorted[idx];
  const isLast = idx === sorted.length - 1;
  const transition = slide?.transition ?? 'fade';
  const variants = SLIDE_VARIANTS[transition] ?? SLIDE_VARIANTS.fade;

  // Portrait detection
  useEffect(() => {
    const check = () => setIsPortrait(window.innerWidth < window.innerHeight || window.innerWidth < 600);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Narration audio
  useEffect(() => {
    if (!deck.narrationUrl) return;
    const audio = new Audio(deck.narrationUrl);
    audio.loop = false;
    narrationRef.current = audio;
    return () => { audio.pause(); };
  }, [deck.narrationUrl]);

  // BG music
  useEffect(() => {
    if (!deck.bgMusicUrl) return;
    const audio = new Audio(deck.bgMusicUrl);
    audio.loop = true;
    audio.volume = deck.bgMusicVolume ?? 0.3;
    bgMusicRef.current = audio;
    return () => { audio.pause(); };
  }, [deck.bgMusicUrl]);

  // Sync mute to audio elements
  useEffect(() => {
    if (narrationRef.current) narrationRef.current.muted = muted;
    if (bgMusicRef.current) bgMusicRef.current.muted = muted;
  }, [muted]);

  // Play/pause
  useEffect(() => {
    if (playing) {
      narrationRef.current?.play().catch(() => {});
      bgMusicRef.current?.play().catch(() => {});
    } else {
      narrationRef.current?.pause();
      bgMusicRef.current?.pause();
    }
  }, [playing]);

  // Auto-advance based on slide duration
  useEffect(() => {
    if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
    const dur = slide?.duration;
    if (playing && dur && dur > 0) {
      autoAdvanceRef.current = setTimeout(() => {
        if (!isLast) { direction.current = 1; setIdx(i => i + 1); }
        else setPlaying(false);
      }, dur * 1000);
    }
    return () => { if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current); };
  }, [idx, playing, slide?.duration, isLast]);

  // Keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { direction.current = 1; setIdx(i => Math.min(sorted.length - 1, i + 1)); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { direction.current = -1; setIdx(i => Math.max(0, i - 1)); }
      if (e.key === ' ') { e.preventDefault(); setPlaying(v => !v); }
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sorted.length, onClose]);

  // Touch swipe
  const touchStart = useRef<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => { touchStart.current = e.touches[0].clientX; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart.current === null) return;
    const delta = touchStart.current - e.changedTouches[0].clientX;
    if (Math.abs(delta) > 40) {
      if (delta > 0 && idx < sorted.length - 1) { direction.current = 1; setIdx(i => i + 1); }
      if (delta < 0 && idx > 0) { direction.current = -1; setIdx(i => i - 1); }
    }
    touchStart.current = null;
  };

  const goNext = () => { direction.current = 1; setIdx(i => Math.min(sorted.length - 1, i + 1)); };
  const goPrev = () => { direction.current = -1; setIdx(i => Math.max(0, i - 1)); };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
      setFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setFullscreen(false);
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}?pitch=${deck.id}`;
    if (navigator.share) {
      try { await navigator.share({ title: deck.title, url }); } catch {}
    } else {
      await navigator.clipboard.writeText(url);
    }
  };

  if (!slide) return null;

  // Aspect ratio: 16:9 desktop, 9:16 portrait (vertical video)
  const aspectClass = isPortrait ? '' : 'aspect-video';
  const containerStyle: React.CSSProperties = isPortrait
    ? { width: '100%', maxWidth: 400, aspectRatio: '9/16', margin: '0 auto' }
    : {};

  const inner = (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${aspectClass} bg-black select-none`}
      style={{ ...containerStyle, borderRadius: embed ? 0 : 12 }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Slides */}
      <AnimatePresence mode="wait" custom={direction.current}>
        <motion.div
          key={slide.id}
          custom={direction.current}
          variants={variants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
          className="absolute inset-0"
        >
          <RenderSlide slide={slide} isPortrait={isPortrait} ctaUrl={deck.ctaUrl}/>
        </motion.div>
      </AnimatePresence>

      {/* Progress dots */}
      <div className="absolute bottom-14 left-1/2 -translate-x-1/2 flex gap-1.5 z-30">
        {sorted.map((s, i) => (
          <button key={s.id} onClick={() => { direction.current = i > idx ? 1 : -1; setIdx(i); }}
            className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-6 bg-white' : 'w-1.5 bg-white/30 hover:bg-white/50'}`}/>
        ))}
      </div>

      {/* Controls overlay */}
      <div className="absolute bottom-0 left-0 right-0 h-14 bg-gradient-to-t from-black/70 to-transparent flex items-center gap-2 px-4 z-30">
        {/* Prev */}
        <button onClick={goPrev} disabled={idx === 0}
          className="p-2 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors disabled:opacity-20">
          <ChevronLeft size={18}/>
        </button>

        {/* Play / Pause */}
        <button onClick={() => setPlaying(v => !v)}
          className="p-2 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors">
          {playing ? <Pause size={16}/> : <Play size={16}/>}
        </button>

        {/* Next */}
        <button onClick={goNext} disabled={isLast}
          className="p-2 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors disabled:opacity-20">
          <ChevronRight size={18}/>
        </button>

        <div className="text-xs text-white/40 tabular-nums ml-1">{idx + 1} / {sorted.length}</div>

        <div className="flex-1"/>

        {/* Mute */}
        <button onClick={() => setMuted(v => !v)}
          className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors">
          {muted ? <VolumeX size={14}/> : <Volume2 size={14}/>}
        </button>

        {/* Share */}
        <button onClick={handleShare}
          className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors">
          <Share2 size={14}/>
        </button>

        {/* CTA link */}
        {deck.ctaUrl && (
          <a href={deck.ctaUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1 bg-orange-500 text-black text-xs font-bold rounded-full hover:bg-orange-400 transition-colors">
            {deck.ctaLabel ?? 'Learn More'} <ExternalLink size={10}/>
          </a>
        )}

        {/* Fullscreen */}
        {!embed && (
          <button onClick={toggleFullscreen}
            className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors">
            {fullscreen ? <Minimize2 size={14}/> : <Maximize2 size={14}/>}
          </button>
        )}

        {/* Close */}
        {onClose && !embed && (
          <button onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors">
            <X size={14}/>
          </button>
        )}
      </div>

      {/* Side nav arrows (desktop) */}
      {!isPortrait && (
        <>
          <button onClick={goPrev} disabled={idx === 0}
            className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/30 hover:bg-black/60 text-white/60 hover:text-white transition-all disabled:opacity-0 z-30 backdrop-blur">
            <ChevronLeft size={20}/>
          </button>
          <button onClick={goNext} disabled={isLast}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/30 hover:bg-black/60 text-white/60 hover:text-white transition-all disabled:opacity-0 z-30 backdrop-blur">
            <ChevronRight size={20}/>
          </button>
        </>
      )}
    </div>
  );

  if (embed) return inner;

  // Popup mode — dim background, center viewer
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8"
      style={{ backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
        className={`w-full ${isPortrait ? 'max-w-sm' : 'max-w-4xl'}`}
        style={{ boxShadow: '0 40px 120px rgba(0,0,0,0.6)' }}
      >
        {/* Deck title */}
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="text-white font-bold text-sm truncate">{deck.title}</div>
          <button onClick={onClose} className="text-white/30 hover:text-white transition-colors">
            <X size={16}/>
          </button>
        </div>
        {inner}
      </motion.div>
    </motion.div>
  );
}
