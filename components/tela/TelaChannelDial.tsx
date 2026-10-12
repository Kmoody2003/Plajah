import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  Sparkles, ChevronLeft, ChevronRight, Zap, BookOpen, Layers, 
  Check, Clapperboard, SlidersHorizontal, RotateCw, Monitor,
  Radio, ArrowRight, Eye, Grid
} from 'lucide-react';
import type { TelaVectorObject } from '../../types';
import { TelaStaticSvg } from './TelaVector';
import { TELA_TEMPLATE_GALLERY, type TelaDesignTemplate } from '../../services/tela/telaTemplateRegistry';
import { ensureFontsForObjects } from '../../services/tela/telaFonts';

const pageCache = new Map<string, TelaVectorObject[]>();
function buildPage(t: TelaDesignTemplate, i: number): TelaVectorObject[] {
  const key = `${t.id}#${i}`;
  let v = pageCache.get(key);
  if (!v) { 
    try { 
      v = t.pages[i]?.build() || []; 
    } catch { 
      v = []; 
    } 
    pageCache.set(key, v); 
    ensureFontsForObjects(v); 
  }
  return v;
}

export interface TelaChannelDialProps {
  onUse: (template: TelaDesignTemplate) => void;
  onOpenFullGallery?: () => void;
}

export type DialCategory = 'ALL' | 'BUSINESS' | 'HISTORY' | 'EDITORIAL' | 'POSTER' | 'BROADCAST';

export default function TelaChannelDial({ onUse, onOpenFullGallery }: TelaChannelDialProps) {
  const [category, setCategory] = useState<DialCategory>('ALL');
  const [activeIndex, setActiveIndex] = useState(0);
  const [showLesson, setShowLesson] = useState(false);
  const [isDialTurning, setIsDialTurning] = useState(false);
  const dialContainerRef = useRef<HTMLDivElement>(null);

  // Filter templates based on active category
  const filteredTemplates = useMemo(() => {
    return TELA_TEMPLATE_GALLERY.filter(t => {
      if (category === 'ALL') return true;
      if (category === 'BUSINESS') {
        return (
          t.collection === 'DOCUMENT' || 
          t.collection === 'PRESENTATION' || 
          t.name.toLowerCase().includes('report') || 
          t.name.toLowerCase().includes('proposal') || 
          t.name.toLowerCase().includes('pitch') || 
          t.name.toLowerCase().includes('swiss') ||
          t.name.toLowerCase().includes('brief') ||
          t.tags.some(tag => ['business', 'report', 'presentation', 'proposal', 'corporate', 'finance'].includes(tag.toLowerCase()))
        );
      }
      if (category === 'HISTORY') return t.collection === 'DESIGN_HISTORY';
      if (category === 'EDITORIAL') return t.collection === 'PUBLICATION';
      if (category === 'POSTER') return t.collection === 'POSTER' || t.collection === 'SOCIAL' || t.collection === 'MENU';
      if (category === 'BROADCAST') return t.collection === 'LOWER_THIRD';
      return true;
    });
  }, [category]);

  // Ensure activeIndex stays in valid range when category changes
  useEffect(() => {
    setActiveIndex(0);
  }, [category]);

  const total = filteredTemplates.length;
  const current = filteredTemplates[activeIndex] || filteredTemplates[0];

  // Fluid snappy channel step
  const stepChannel = useCallback((delta: number) => {
    if (total <= 1) return;
    setIsDialTurning(true);
    setActiveIndex(prev => {
      let next = prev + delta;
      if (next < 0) next = total - 1;
      if (next >= total) next = 0;
      return next;
    });
    setTimeout(() => setIsDialTurning(false), 220);
  }, [total]);

  // Keyboard navigation when hovering or focused
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepChannel(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepChannel(1);
      } else if (e.key === 'Enter' && e.ctrlKey && current) {
        e.preventDefault();
        onUse(current);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [stepChannel, current, onUse]);

  // Rotary Mouse Scroll Wheel navigation over carousel
  const lastWheelTime = useRef(0);
  const wheelAccumulator = useRef(0);

  useEffect(() => {
    const el = dialContainerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      // Prevent parent page scrolling while spinning the dial
      e.preventDefault();
      e.stopPropagation();

      const now = Date.now();
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      wheelAccumulator.current += delta;

      const THRESHOLD = 35; // Responsive threshold
      if (Math.abs(wheelAccumulator.current) >= THRESHOLD) {
        if (now - lastWheelTime.current > 120) { // Snappy 120ms throttle
          const direction = wheelAccumulator.current > 0 ? 1 : -1;
          stepChannel(direction);
          lastWheelTime.current = now;
          wheelAccumulator.current = 0;
        }
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [stepChannel]);

  // Circular difference helper for fluid 3D carousel movement
  const getCircularDiff = (index: number, active: number, len: number) => {
    if (len <= 0) return 0;
    let diff = index - active;
    while (diff > len / 2) diff -= len;
    while (diff < -len / 2) diff += len;
    return diff;
  };

  return (
    <div 
      ref={dialContainerRef}
      className="relative rounded-[26px] p-5 sm:p-7 overflow-hidden transition-all duration-300 border select-none"
      style={{
        background: 'linear-gradient(165deg, rgba(22, 16, 32, 0.95) 0%, rgba(11, 8, 18, 0.98) 60%, rgba(18, 12, 24, 0.95) 100%)',
        borderColor: 'rgba(255, 255, 255, 0.12)',
        boxShadow: '0 30px 80px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.1)'
      }}
    >
      {/* Ambient background glow behind active dial item */}
      <div 
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[450px] rounded-full blur-[140px] pointer-events-none transition-colors duration-500"
        style={{
          background: current?.palette?.[0] ? `${current.palette[0]}33` : 'rgba(212,0,85,0.25)'
        }}
      />

      {/* ── DIAL TOP BAR: Telemetry & Controls ─────────────────────────────── */}
      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-white/[0.08]">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[9px] font-mono font-bold text-emerald-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              FAST CHANNEL DIAL
            </span>
            <span className="text-[9px] font-mono text-white/40 tracking-wider">
              // ZERO-LATENCY 3D PREVIEW
            </span>
            <span className="text-[9px] font-mono text-fuchsia-300/80 bg-fuchsia-950/60 border border-fuchsia-800/40 px-2 py-0.5 rounded">
              CH {String(activeIndex + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
            </span>
          </div>

          <h3 className="mt-1 font-display italic text-[1.45rem] text-white">
            Living Document Carousel
          </h3>
          <p className="text-[.72rem] text-white/50 flex flex-wrap items-center gap-1.5 mt-1">
            <span>Spin mouse scroll wheel</span>
            <span className="text-white/25">·</span>
            <span>Use</span>
            <span className="font-mono text-white/80 bg-white/10 px-1 py-0.5 rounded text-[10px]">←</span>
            <span className="font-mono text-white/80 bg-white/10 px-1 py-0.5 rounded text-[10px]">→</span>
            <span>keys</span>
            <span className="text-white/25">·</span>
            <span>Click any document to snap</span>
          </p>
        </div>

        {/* Dial Navigation & Mode Switchers */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Channel Turning Buttons */}
          <div className="flex items-center rounded-[12px] bg-black/40 border border-white/10 p-1 shadow-inner">
            <button
              onClick={() => stepChannel(-1)}
              className="h-8 px-3 rounded-[9px] flex items-center gap-1.5 text-[.74rem] font-bold text-white/75 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
              title="Previous Channel (Left Arrow)"
            >
              <ChevronLeft size={15} />
              <span className="font-mono text-[9px] uppercase tracking-wider">PREV CH</span>
            </button>
            <div className="w-px h-4 bg-white/10 mx-0.5" />
            <button
              onClick={() => stepChannel(1)}
              className="h-8 px-3 rounded-[9px] flex items-center gap-1.5 text-[.74rem] font-bold text-white/75 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
              title="Next Channel (Right Arrow)"
            >
              <span className="font-mono text-[9px] uppercase tracking-wider">NEXT CH</span>
              <ChevronRight size={15} />
            </button>
          </div>

          {onOpenFullGallery && (
            <button
              onClick={onOpenFullGallery}
              className="h-9 px-3.5 rounded-[12px] flex items-center gap-2 text-[.74rem] font-bold text-white/70 hover:text-white bg-white/[0.05] border border-white/10 hover:bg-white/[0.09] transition-all"
              title="View full gallery with search and filters"
            >
              <Grid size={13} />
              <span>Full Grid ({TELA_TEMPLATE_GALLERY.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* ── CATEGORY SCRUBBER PILLS ─────────────────────────────────────────── */}
      <div className="relative z-10 flex gap-1.5 overflow-x-auto py-3 custom-scrollbar">
        {[
          { id: 'ALL', label: 'ALL TEMPLATES' },
          { id: 'BUSINESS', label: '💼 EXECUTIVE & BUSINESS' },
          { id: 'HISTORY', label: '🏛️ DESIGN HISTORY ERAS' },
          { id: 'EDITORIAL', label: '📖 EDITORIAL & BOOKS' },
          { id: 'POSTER', label: '🎨 POSTERS & ADS' },
          { id: 'BROADCAST', label: '📺 FABULA BROADCAST' },
        ].map(cat => {
          const isSel = category === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id as DialCategory)}
              className="shrink-0 h-7 px-3 rounded-full text-[8px] font-mono font-extrabold tracking-wider transition-all"
              style={{
                background: isSel 
                  ? 'linear-gradient(135deg, #6B0099, #D40055)' 
                  : 'rgba(255, 255, 255, 0.04)',
                color: isSel ? '#FFFFFF' : 'rgba(255, 255, 255, 0.55)',
                border: `1px solid ${isSel ? 'rgba(212,0,85,0.6)' : 'rgba(255, 255, 255, 0.08)'}`,
                boxShadow: isSel ? '0 2px 10px rgba(212,0,85,0.3)' : 'none'
              }}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* ── 3D CAROUSEL STAGE ──────────────────────────────────────────────── */}
      <div 
        className="relative z-10 my-6 h-[520px] sm:h-[560px] min-h-[520px] flex items-center justify-center overflow-hidden"
        style={{
          perspective: '1200px',
          perspectiveOrigin: 'center center',
          transformStyle: 'preserve-3d'
        }}
      >
        {/* Dynamically render cards with persistent identity so they physically glide across positions */}
        {filteredTemplates.map((t, index) => {
          const offset = getCircularDiff(index, activeIndex, total);
          // Only mount cards within [-3, 3] window for high FPS and smooth entrance/exit
          if (Math.abs(offset) > 3) return null;

          const isCenter = offset === 0;
          const isLeft = offset < 0;
          const absOffset = Math.abs(offset);

          let translateX = 0;
          let translateZ = 0;
          let rotateY = 0;
          let scale = 1;
          let opacity = 1;
          let zIndex = 30;

          if (isCenter) {
            translateX = 0;
            translateZ = 90;
            rotateY = 0;
            scale = 1;
            opacity = 1;
            zIndex = 30;
          } else if (absOffset === 1) {
            translateX = isLeft ? -270 : 270;
            translateZ = -40;
            rotateY = isLeft ? 24 : -24;
            scale = 0.85;
            opacity = 0.62;
            zIndex = 20;
          } else if (absOffset === 2) {
            translateX = isLeft ? -490 : 490;
            translateZ = -140;
            rotateY = isLeft ? 38 : -38;
            scale = 0.72;
            opacity = 0.28;
            zIndex = 10;
          } else {
            // offset 3: smooth enter/exit boundary
            translateX = isLeft ? -680 : 680;
            translateZ = -240;
            rotateY = isLeft ? 45 : -45;
            scale = 0.55;
            opacity = 0;
            zIndex = 0;
          }

          // Build vector objects for page 0
          const objects = buildPage(t, 0);

          return (
            <div
              key={t.id}
              onClick={() => {
                if (!isCenter) {
                  setActiveIndex(index);
                }
              }}
              onDoubleClick={() => {
                if (isCenter) onUse(t);
              }}
              className={`absolute top-1/2 left-1/2 ${
                isCenter ? 'cursor-default' : 'cursor-pointer hover:brightness-125'
              }`}
              style={{
                transform: `translate3d(calc(-50% + ${translateX}px), -50%, ${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`,
                transformOrigin: 'center center',
                zIndex,
                opacity,
                width: t.width >= t.height ? '420px' : '280px',
                maxWidth: '90vw',
                pointerEvents: absOffset > 2 ? 'none' : 'auto',
                transition: 'transform 320ms cubic-bezier(0.16, 1, 0.3, 1), opacity 280ms ease-out, filter 280ms ease-out'
              }}
            >
              {/* Document Folio Card */}
              <div 
                className={`relative rounded-[16px] overflow-hidden transition-all duration-300 ${
                  isCenter ? 'ring-2 ring-fuchsia-500/60 shadow-[0_30px_70px_rgba(0,0,0,0.85),0_0_50px_rgba(212,0,85,0.3)]' : 'shadow-2xl'
                }`}
                style={{
                  background: t.palette?.[0] || '#110D18',
                  border: isCenter 
                    ? '1.5px solid rgba(255, 255, 255, 0.3)' 
                    : '1px solid rgba(255, 255, 255, 0.12)'
                }}
              >
                {/* SVG Render Container */}
                <div 
                  className="w-full overflow-hidden flex items-center justify-center"
                  style={{ 
                    aspectRatio: `${t.width}/${t.height}`,
                    maxHeight: '390px'
                  }}
                >
                  {objects.length > 0 ? (
                    <TelaStaticSvg objects={objects} width={t.width} height={t.height} />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-black/40">
                      <Layers size={32} className="text-white/20 mb-2" />
                      <span className="text-xs font-bold text-white/60">{t.name}</span>
                    </div>
                  )}
                </div>

                {/* Animated kinetic indicator on center document */}
                {isCenter && (
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md border border-white/20 text-[8px] font-mono font-bold text-amber-300 shadow-lg">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                    KINETIC FOLIO
                  </div>
                )}

                {/* If Fabula lower third */}
                {t.collection === 'LOWER_THIRD' && (
                  <div className="absolute top-3 left-3 w-7 h-7 rounded-full bg-black/75 backdrop-blur-md border border-white/20 grid place-items-center text-white">
                    <Clapperboard size={13} />
                  </div>
                )}
              </div>

              {/* In-Focus Card Telemetry Strip */}
              {isCenter && (
                <div className="mt-3 text-center">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.06] border border-white/10 text-[9px] font-mono text-white/70">
                    <span>{t.group}</span>
                    <span>·</span>
                    <span>{t.width}×{t.height} PT</span>
                    <span>·</span>
                    <span className="text-emerald-400 font-bold">{t.frameKind}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── ACTIVE TEMPLATE CONTROLS & DESIGN LESSON FOOTER ───────────────── */}
      {current && (
        <div className="relative z-10 pt-4 border-t border-white/[0.08] flex flex-col lg:flex-row items-center justify-between gap-4">
          <div className="flex-1 text-center lg:text-left">
            <div className="flex items-center justify-center lg:justify-start gap-2.5">
              <h4 className="font-display italic text-[1.35rem] font-bold text-white">
                {current.name}
              </h4>
              <span className="px-2 py-0.5 rounded text-[8px] font-mono font-extrabold uppercase tracking-wider bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30">
                {current.collection.replace('_', ' ')}
              </span>
            </div>
            <p className="mt-1 text-[.76rem] text-white/55 max-w-xl line-clamp-1">
              {current.tagline || current.description}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowLesson(!showLesson)}
              className="h-10 px-4 rounded-[12px] flex items-center gap-2 text-[.74rem] font-bold text-white/75 bg-white/[0.06] border border-white/12 hover:bg-white/[0.1] hover:text-white transition-all"
            >
              <BookOpen size={14} className="text-amber-400" />
              <span>{showLesson ? 'Hide Lesson' : 'Design Lesson'}</span>
            </button>

            <button
              onClick={() => onUse(current)}
              className="h-11 px-6 rounded-[12px] flex items-center gap-2.5 text-[.78rem] font-black text-white shadow-xl hover:brightness-110 active:scale-95 transition-all"
              style={{
                background: 'linear-gradient(135deg, #6B0099 0%, #D40055 55%, #FF8A00 100%)',
                boxShadow: '0 4px 22px rgba(212,0,85,0.45)'
              }}
            >
              <Zap size={16} />
              <span>Use This Template in Studio</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Expandable Design Lesson Box */}
      {showLesson && current?.lesson && (
        <div 
          className="relative z-10 mt-4 p-4 rounded-[16px] border bg-black/40 backdrop-blur-xl border-amber-500/30 transition-all"
        >
          <div className="flex items-center gap-2 text-amber-300 text-[10px] font-mono font-bold uppercase tracking-wider mb-2">
            <Sparkles size={13} />
            <span>Plajah Art Council Lesson · {current.lesson.interestTag}</span>
          </div>
          <p className="text-[.76rem] text-white/70 leading-relaxed">
            {current.lesson.history}
          </p>
          {current.audience && (
            <div className="mt-2 text-[.7rem] text-white/45 font-mono">
              Cultural Context: {current.audience}
            </div>
          )}
        </div>
      )}

      {/* Dial Scrubber Bar */}
      <div className="relative z-10 mt-5 pt-3 border-t border-white/[0.06] flex items-center gap-3">
        <span className="text-[9px] font-mono text-white/35 shrink-0">CH DIAL</span>
        <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden flex">
          <div 
            className="h-full rounded-full transition-all duration-200"
            style={{
              width: `${((activeIndex + 1) / total) * 100}%`,
              background: 'linear-gradient(90deg, #6B0099, #D40055, #FF8A00)'
            }}
          />
        </div>
        <span className="text-[9px] font-mono text-white/50 shrink-0">
          {activeIndex + 1} / {total}
        </span>
      </div>
    </div>
  );
}
