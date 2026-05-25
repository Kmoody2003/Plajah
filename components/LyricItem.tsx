
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { motion } from 'motion/react';

interface LyricItemProps {
  line: { time: number; text: string };
  isActive: boolean;
  isPast: boolean;
  onClick: () => void;
}

export const LyricItem = React.memo(React.forwardRef<HTMLParagraphElement, LyricItemProps>(
  ({ line, isActive, isPast, onClick }, ref) => (
    <motion.p
      ref={ref}
      animate={{
        opacity: isActive ? 1 : isPast ? 0.45 : 0.18,
        scale: isActive ? 1.05 : 1,
        x: isActive ? 10 : 0,
        color: isActive ? '#FF8C00' : '#ffffff',
      }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="text-2xl lg:text-3xl font-display font-black uppercase tracking-tight leading-tight cursor-pointer select-none"
      onClick={onClick}
    >
      {line.text}
    </motion.p>
  )
));

LyricItem.displayName = 'LyricItem';

export const TimeCodedLyrics: React.FC<{
  tracks: { time: number; text: string }[];
  currentTime: number;  // kept for API compat but not used for sync
  seek: (time: number) => void;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  paintMode?: boolean;
}> = React.memo(({ tracks, seek, paintMode }) => {
  const viewportRef  = useRef<HTMLDivElement>(null);
  const lineRefs     = useRef<(HTMLParagraphElement | null)[]>([]);
  const [translateY, setTranslateY] = useState(0);
  const [ready,      setReady]      = useState(false);
  const [snapMode,   setSnapMode]   = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const prevActiveRef = useRef(-1);
  const prevAudioTimeRef = useRef(0);

  // Sort + dedupe once
  const sortedTracks = useMemo(() =>
    tracks
      .filter(t => typeof t.time === 'number' && !isNaN(t.time) && t.text?.trim())
      .sort((a, b) => a.time - b.time),
    [tracks]
  );

  // ── Core sync: poll the audio element directly at 100 ms ─────────────────
  // This bypasses the React prop / state chain and catches every timeupdate.
  useEffect(() => {
    if (!sortedTracks.length) return;

    const findActive = (t: number) => {
      for (let i = sortedTracks.length - 1; i >= 0; i--) {
        if (t >= sortedTracks[i].time) return i;
      }
      return -1;
    };

    const tick = () => {
      const audio = document.querySelector('audio') as HTMLAudioElement | null;
      if (!audio) return;
      const t = audio.currentTime;

      // Detect seek (large jump) for snap-scroll
      if (Math.abs(t - prevAudioTimeRef.current) > 2.5) {
        setSnapMode(true);
        setTimeout(() => setSnapMode(false), 80);
      }
      prevAudioTimeRef.current = t;

      const idx = findActive(t);
      if (idx !== prevActiveRef.current) {
        prevActiveRef.current = idx;
        setActiveIndex(idx);
      }
    };

    const id = setInterval(tick, 100);
    tick(); // run immediately
    return () => clearInterval(id);
  }, [sortedTracks]);

  // ── Scroll active line to vertical center ─────────────────────────────────
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const activeLine = activeIndex >= 0 ? lineRefs.current[activeIndex] : null;
    const viewportH  = viewport.clientHeight;

    if (!activeLine || viewportH === 0) {
      setTranslateY(0);
      setReady(true);
      return;
    }

    // Use a small delay so the DOM has finished reflowing after activeIndex changed
    const id = setTimeout(() => {
      const lineTop = activeLine.offsetTop;
      const lineH   = activeLine.offsetHeight;
      setTranslateY(viewportH / 2 - lineTop - lineH / 2);
      setReady(true);
    }, 20);
    return () => clearTimeout(id);
  }, [activeIndex]);

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

      {/* Scrolling lyric list */}
      <div
        style={{
          transform: `translateY(${translateY}px)`,
          transition: ready && !snapMode ? 'transform 0.50s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
          willChange: 'transform',
        }}
        className={paintMode ? 'space-y-7 py-4 pl-3' : 'space-y-6 py-4'}
      >
        {sortedTracks.map((line, idx) =>
          paintMode ? (
            // Paint mode — uniform font size so offsetTop stays reliable;
            // visual size change comes from scale only (doesn't affect layout flow)
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
              className="text-3xl lg:text-4xl xl:text-5xl font-display font-black uppercase leading-tight tracking-tight cursor-pointer select-none drop-shadow-[0_0_28px_rgba(255,140,0,0.35)]"
              onClick={() => seek(line.time)}
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
              onClick={() => seek(line.time)}
            />
          )
        )}
      </div>
    </div>
  );
});

TimeCodedLyrics.displayName = 'TimeCodedLyrics';
