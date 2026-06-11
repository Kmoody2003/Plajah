
import React, { useEffect, useRef, useMemo } from 'react';
import { motion } from 'motion/react';

interface LyricItemProps {
  line: { time: number; text: string };
  isActive: boolean;
  isPast: boolean;
  isResyncMode: boolean;
  onClick: () => void;
}

export const LyricItem = React.memo(React.forwardRef<HTMLParagraphElement, LyricItemProps>(
  ({ line, isActive, isPast, isResyncMode, onClick }, ref) => (
    <motion.p
      ref={ref}
      animate={{
        opacity: isActive ? 1 : isPast ? 0.45 : 0.18,
        scale: isActive ? 1.05 : 1,
        x: isActive ? 10 : 0,
        color: isResyncMode ? (isActive ? '#FF8C00' : '#ffffff') : isActive ? '#FF8C00' : '#ffffff',
      }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className={`text-2xl lg:text-3xl font-display font-black uppercase tracking-tight leading-tight select-none ${isResyncMode ? 'cursor-crosshair hover:opacity-80' : 'cursor-pointer'}`}
      onClick={onClick}
    >
      {isResyncMode && <span className="inline-block w-2 h-2 rounded-full bg-small-orange/40 mr-2 align-middle" />}
      {line.text}
    </motion.p>
  )
));

LyricItem.displayName = 'LyricItem';

export const TimeCodedLyrics: React.FC<{
  tracks: { time: number; text: string }[];
  currentTime: number;
  seek: (time: number) => void;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  paintMode?: boolean;
  offset?: number;
  isResyncMode?: boolean;
  onResync?: (line: { time: number; text: string }) => void;
}> = React.memo(({ tracks, currentTime, seek, paintMode, offset = 0, isResyncMode = false, onResync }) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const lineRefs    = useRef<(HTMLParagraphElement | null)[]>([]);
  const translateYRef = useRef(0);
  const innerRef    = useRef<HTMLDivElement>(null);

  // Sort + dedupe once
  const sortedTracks = useMemo(() =>
    tracks
      .filter(t => typeof t.time === 'number' && !isNaN(t.time) && t.text?.trim())
      .sort((a, b) => a.time - b.time),
    [tracks]
  );

  // Derive active index: find the last line whose adjusted timestamp has been reached.
  // offset > 0 delays lyrics (they activate later); offset < 0 advances them.
  const activeIndex = useMemo(() => {
    for (let i = sortedTracks.length - 1; i >= 0; i--) {
      if (currentTime >= sortedTracks[i].time + offset) return i;
    }
    return -1;
  }, [sortedTracks, currentTime, offset]);

  // Scroll active line to vertical center
  useEffect(() => {
    const viewport = viewportRef.current;
    const inner    = innerRef.current;
    if (!viewport || !inner) return;

    const activeLine = activeIndex >= 0 ? lineRefs.current[activeIndex] : null;
    const viewportH  = viewport.clientHeight;

    if (!activeLine || viewportH === 0) {
      if (inner.style.transform !== 'translateY(0px)') {
        inner.style.transform = 'translateY(0px)';
      }
      return;
    }

    // Small delay so Framer Motion's scale animation has settled before we
    // measure offsetTop (scale changes layout height slightly in some browsers).
    const id = setTimeout(() => {
      const lineTop = activeLine.offsetTop;
      const lineH   = activeLine.offsetHeight;
      const ty = viewportH / 2 - lineTop - lineH / 2;
      if (Math.abs(ty - translateYRef.current) > 1) {
        translateYRef.current = ty;
        inner.style.transform = `translateY(${ty}px)`;
      }
    }, 16);
    return () => clearTimeout(id);
  }, [activeIndex]);

  const handleLineClick = (line: { time: number; text: string }) => {
    if (isResyncMode && onResync) {
      onResync(line);
    } else {
      seek(line.time);
    }
  };

  return (
    <div
      ref={viewportRef}
      className="relative overflow-hidden"
      style={{ height: paintMode ? '100%' : 'clamp(240px, 55vh, 620px)' }}
    >
      {/* Fade masks */}
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/80 to-transparent pointer-events-none z-10" />
      <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/80 to-transparent pointer-events-none z-10" />
      {!paintMode && (
        <div
          className="absolute inset-x-0 z-0 pointer-events-none"
          style={{ top: 'calc(50% - 1px)', height: '1px', background: 'rgba(255,140,0,0.12)' }}
        />
      )}

      {/* Resync mode instruction banner */}
      {isResyncMode && (
        <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-center pointer-events-none pt-2">
          <span className="text-[9px] font-black uppercase tracking-widest text-small-orange bg-black/60 px-3 py-1 rounded-full animate-pulse">
            Tap the lyric you're hearing now
          </span>
        </div>
      )}

      {/* Scrolling lyric list — CSS transition drives smooth scroll */}
      <div
        ref={innerRef}
        style={{
          transition: 'transform 0.45s cubic-bezier(0.4, 0, 0.2, 1)',
          willChange: 'transform',
        }}
        className={paintMode ? 'space-y-7 py-4 pl-3' : 'space-y-6 py-4'}
      >
        {sortedTracks.map((line, idx) =>
          paintMode ? (
            <motion.p
              key={idx}
              ref={el => { lineRefs.current[idx] = el; }}
              animate={{
                opacity: idx === activeIndex ? 1 : idx < activeIndex ? 0.10 : 0.20,
                scale:   idx === activeIndex ? 1.12 : 0.95,
                x:       idx === activeIndex ? 0 : -10,
                color:   idx === activeIndex ? '#FF8C00' : '#ffffff',
              }}
              transition={{ duration: 0.40, ease: 'easeOut' }}
              className={`text-3xl lg:text-4xl xl:text-5xl font-display font-black uppercase leading-tight tracking-tight select-none drop-shadow-[0_0_28px_rgba(255,140,0,0.35)] ${isResyncMode ? 'cursor-crosshair' : 'cursor-pointer'}`}
              onClick={() => handleLineClick(line)}
            >
              {line.text}
            </motion.p>
          ) : (
            <LyricItem
              key={idx}
              ref={el => { lineRefs.current[idx] = el; }}
              line={line}
              isActive={idx === activeIndex}
              isPast={idx < activeIndex}
              isResyncMode={isResyncMode}
              onClick={() => handleLineClick(line)}
            />
          )
        )}
      </div>
    </div>
  );
});

TimeCodedLyrics.displayName = 'TimeCodedLyrics';
