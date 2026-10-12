import React, { useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Zap, Clapperboard, Sparkles, ArrowRight } from 'lucide-react';
import type { TelaDesignTemplate } from '../../services/tela/telaTemplateRegistry';
import type { TelaVectorObject } from '../../types';
import { TelaStaticSvg } from './TelaVector';
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

export interface TelaCarouselRowProps {
  title: string;
  subtitle?: string;
  badge?: string;
  accentColor?: string;
  icon?: React.ElementType;
  templates: TelaDesignTemplate[];
  onUse: (template: TelaDesignTemplate) => void;
}

export default function TelaCarouselRow({
  title,
  subtitle,
  badge,
  accentColor = '#D40055',
  icon: Icon,
  templates,
  onUse,
}: TelaCarouselRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Wheel listener: converts vertical mouse wheel into smooth horizontal scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      // If user scrolls vertically over this row, scroll it horizontally
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        e.stopPropagation();
        el.scrollBy({
          left: e.deltaY * 1.6,
          behavior: 'auto'
        });
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  const stepScroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const offset = direction === 'left' ? -380 : 380;
    scrollRef.current.scrollBy({ left: offset, behavior: 'smooth' });
  };

  if (!templates.length) return null;

  return (
    <div className="my-8">
      {/* Row Header */}
      <div className="flex items-center justify-between gap-4 mb-3.5 px-1">
        <div className="flex items-center gap-2.5">
          {Icon && (
            <span 
              className="grid place-items-center w-7 h-7 rounded-[9px] shadow-sm"
              style={{ background: `${accentColor}25`, color: accentColor, border: `1px solid ${accentColor}40` }}
            >
              <Icon size={14} />
            </span>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display italic text-[1.22rem] text-white font-bold">
                {title}
              </h3>
              {badge && (
                <span 
                  className="px-2 py-0.5 rounded text-[8px] font-mono font-extrabold uppercase tracking-wider"
                  style={{ background: `${accentColor}20`, color: accentColor, border: `1px solid ${accentColor}35` }}
                >
                  {badge}
                </span>
              )}
            </div>
            {subtitle && (
              <p className="text-[.70rem] text-white/45 mt-0.5 font-sans">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Scroll Controls & Wheel affordance */}
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline text-[8px] font-mono text-white/30 mr-1">
            MOUSE WHEEL TO GLIDE →
          </span>
          <button
            onClick={() => stepScroll('left')}
            className="w-8 h-8 rounded-[9px] flex items-center justify-center bg-white/[0.05] border border-white/10 hover:bg-white/15 text-white/70 hover:text-white transition-all active:scale-95"
            title="Scroll Left"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => stepScroll('right')}
            className="w-8 h-8 rounded-[9px] flex items-center justify-center bg-white/[0.05] border border-white/10 hover:bg-white/15 text-white/70 hover:text-white transition-all active:scale-95"
            title="Scroll Right"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Horizontal Carousel Shelf */}
      <div 
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-4 pt-1 px-1 custom-scrollbar scroll-smooth"
        style={{ scrollSnapType: 'x proximity' }}
      >
        {templates.map(t => {
          const objects = buildPage(t, 0);
          const isWide = t.width > t.height;

          return (
            <div
              key={t.id}
              onClick={() => onUse(t)}
              className="group shrink-0 rounded-[18px] p-3 border transition-all duration-300 hover:-translate-y-1 cursor-pointer relative"
              style={{
                width: isWide ? '320px' : '230px',
                scrollSnapAlign: 'start',
                background: 'rgba(255, 255, 255, 0.035)',
                borderColor: 'rgba(255, 255, 255, 0.08)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
              }}
            >
              {/* Document Folio Canvas Thumbnail */}
              <div 
                className="w-full rounded-[12px] overflow-hidden relative border border-white/10 flex items-center justify-center transition-all group-hover:border-white/30"
                style={{ 
                  aspectRatio: `${t.width}/${t.height}`,
                  maxHeight: '220px',
                  background: t.palette?.[0] || '#110D18'
                }}
              >
                {objects.length > 0 ? (
                  <TelaStaticSvg objects={objects} width={t.width} height={t.height} />
                ) : (
                  <div className="w-full h-full bg-black/40 flex items-center justify-center text-xs text-white/30">
                    {t.name}
                  </div>
                )}

                {/* Motion template badge for Fabula */}
                {t.collection === 'LOWER_THIRD' && (
                  <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-black/80 backdrop-blur-md border border-white/20 text-[7.5px] font-mono text-purple-300 flex items-center gap-1 shadow-md">
                    <Clapperboard size={10} />
                    MOTION GRAPHIC
                  </span>
                )}

                {/* Hover overlay with 1-click launch */}
                <div className="absolute inset-0 bg-black/60 backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <span 
                    className="h-8 px-3 rounded-[9px] flex items-center gap-1.5 text-[.70rem] font-bold text-white shadow-lg"
                    style={{ background: 'linear-gradient(135deg, #6B0099, #D40055, #FF8A00)' }}
                  >
                    <Zap size={12} />
                    <span>Use Template</span>
                  </span>
                </div>
              </div>

              {/* Card Meta */}
              <div className="mt-2.5 px-0.5">
                <div className="flex items-center justify-between gap-1 text-[8px] font-mono text-white/40 mb-1">
                  <span>{t.group}</span>
                  <span>{t.width}×{t.height}</span>
                </div>
                <h4 className="font-display italic text-[.95rem] font-bold text-white leading-tight truncate group-hover:text-fuchsia-200 transition-colors">
                  {t.name}
                </h4>
                <p className="mt-1 text-[.66rem] text-white/45 line-clamp-1 leading-snug">
                  {t.tagline || t.description}
                </p>

                {/* Palette dots */}
                <div className="mt-2.5 flex items-center gap-1">
                  {t.palette.slice(0, 4).map((c, i) => (
                    <span 
                      key={i} 
                      className="w-2.5 h-2.5 rounded-full border border-white/15" 
                      style={{ background: c }} 
                    />
                  ))}
                  <span className="ml-auto text-[7.5px] font-mono text-white/30">
                    {t.pages.length > 1 ? `${t.pages.length} PAGES` : '1 PAGE'}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
