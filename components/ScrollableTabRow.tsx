import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ScrollableTabRowProps {
  children: React.ReactNode;
  /** Extra classes on the outer wrapper (e.g. padding, background) */
  className?: string;
  /** Extra classes on the inner scrollable flex row (gap, py, etc.) */
  innerClassName?: string;
  /** How many px to scroll per chevron click. Default 240. */
  scrollStep?: number;
}

/**
 * Wraps any horizontal tab / chip row with:
 *  – CSS mask-image fade at left/right when there is overflow content
 *  – Chevron scroll buttons on desktop (hidden on mobile — swipe instead)
 * Works on any background because the fade is opacity-based (mask), not color-based.
 */
const ScrollableTabRow: React.FC<ScrollableTabRowProps> = ({
  children,
  className = '',
  innerClassName = '',
  scrollStep = 240,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const check = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Initial check (defer one tick so children have rendered)
    const t = setTimeout(check, 0);
    el.addEventListener('scroll', check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => {
      clearTimeout(t);
      el.removeEventListener('scroll', check);
      ro.disconnect();
    };
  }, [check, children]);

  const scrollBy = (dir: -1 | 1) => {
    scrollRef.current?.scrollBy({ left: dir * scrollStep, behavior: 'smooth' });
  };

  // Build the CSS mask string dynamically so the fade only appears where needed
  const maskLeft  = canScrollLeft  ? 'transparent 0px, black 44px'            : 'black 0px';
  const maskRight = canScrollRight ? `black calc(100% - 44px), transparent 100%` : 'black 100%';
  const maskValue = `linear-gradient(to right, ${maskLeft}, ${maskRight})`;

  return (
    <div className={`relative flex items-center w-full ${className}`}>
      {/* ── Left chevron (desktop only) ─────────────────────────────── */}
      <button
        onClick={() => scrollBy(-1)}
        aria-label="Scroll tabs left"
        className={`
          absolute left-0 z-20 hidden md:flex
          items-center justify-center w-6 h-6 rounded-full
          bg-white/10 border border-white/10 hover:bg-white/20
          text-white/50 hover:text-white
          transition-all duration-200 shrink-0
          ${canScrollLeft ? 'opacity-100' : 'opacity-0 pointer-events-none'}
        `}
      >
        <ChevronLeft size={12} />
      </button>

      {/* ── Scrollable strip ─────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        className={`flex items-center overflow-x-auto scrollbar-hide w-full ${innerClassName}`}
        style={{
          maskImage: maskValue,
          WebkitMaskImage: maskValue,
        }}
      >
        {children}
      </div>

      {/* ── Right chevron (desktop only) ─────────────────────────────── */}
      <button
        onClick={() => scrollBy(1)}
        aria-label="Scroll tabs right"
        className={`
          absolute right-0 z-20 hidden md:flex
          items-center justify-center w-6 h-6 rounded-full
          bg-white/10 border border-white/10 hover:bg-white/20
          text-white/50 hover:text-white
          transition-all duration-200 shrink-0
          ${canScrollRight ? 'opacity-100' : 'opacity-0 pointer-events-none'}
        `}
      >
        <ChevronRight size={12} />
      </button>
    </div>
  );
};

export default ScrollableTabRow;
