
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
  currentTime: number;
  seek: (time: number) => void;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}> = React.memo(({ tracks, currentTime, seek }) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const [translateY, setTranslateY] = useState(0);
  const [ready, setReady] = useState(false);
  const [snapMode, setSnapMode] = useState(false);

  // Normalize tracks: sort by time, drop invalid entries
  const sortedTracks = useMemo(() =>
    tracks
      .filter(t => typeof t.time === 'number' && !isNaN(t.time) && t.text?.trim())
      .sort((a, b) => a.time - b.time),
    [tracks]
  );

  // Self-healing currentTime: fallback-polls the audio element when the prop goes stale
  const lastPropTimeRef = useRef(currentTime);
  const lastPropChangeTsRef = useRef(Date.now());
  const [localTime, setLocalTime] = useState(currentTime);

  // Sync prop → localTime whenever it advances
  useEffect(() => {
    if (currentTime !== lastPropTimeRef.current) {
      lastPropTimeRef.current = currentTime;
      lastPropChangeTsRef.current = Date.now();
      setLocalTime(currentTime);
    }
  }, [currentTime]);

  // Fallback: if the prop stops updating for >1.5 s while audio still plays, read the element directly
  useEffect(() => {
    const id = setInterval(() => {
      const staleness = Date.now() - lastPropChangeTsRef.current;
      if (staleness > 1500) {
        const audio = document.querySelector('audio') as HTMLAudioElement | null;
        if (audio && !audio.paused && audio.currentTime > 0) {
          lastPropChangeTsRef.current = Date.now();
          setLocalTime(audio.currentTime);
        }
      }
    }, 500);
    return () => clearInterval(id);
  }, []);

  // Detect large jumps (seek) so we snap instead of animate
  const prevLocalTimeRef = useRef(localTime);
  useEffect(() => {
    const jumped = Math.abs(localTime - prevLocalTimeRef.current) > 3;
    prevLocalTimeRef.current = localTime;
    if (jumped) {
      setSnapMode(true);
      const t = setTimeout(() => setSnapMode(false), 80);
      return () => clearTimeout(t);
    }
  }, [localTime]);

  const activeIndex = useMemo(() => {
    for (let i = sortedTracks.length - 1; i >= 0; i--) {
      if (localTime >= sortedTracks[i].time) return i;
    }
    return -1;
  }, [sortedTracks, localTime]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const activeLine = activeIndex >= 0 ? lineRefs.current[activeIndex] : null;
    const viewportH = viewport.clientHeight;

    if (!activeLine || viewportH === 0) {
      setTranslateY(0);
      setReady(true);
      return;
    }

    const lineTop = activeLine.offsetTop;
    const lineH = activeLine.offsetHeight;
    const T = viewportH / 2 - lineTop - lineH / 2;
    setTranslateY(T);
    setReady(true);
  }, [activeIndex]);

  return (
    <div
      ref={viewportRef}
      className="relative overflow-hidden"
      style={{ height: 'clamp(240px, 55vh, 620px)' }}
    >
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/60 to-transparent pointer-events-none z-10" />
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent pointer-events-none z-10" />
      <div className="absolute inset-x-0 z-0 pointer-events-none" style={{ top: 'calc(50% - 1px)', height: '1px', background: 'rgba(255,140,0,0.12)' }} />

      <div
        style={{
          transform: `translateY(${translateY}px)`,
          transition: ready && !snapMode ? 'transform 0.55s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
          willChange: 'transform',
        }}
        className="space-y-6 py-4"
      >
        {sortedTracks.map((line, idx) => (
          <LyricItem
            key={idx}
            ref={el => { lineRefs.current[idx] = el; }}
            line={line}
            isActive={idx === activeIndex}
            isPast={idx < activeIndex}
            onClick={() => seek(line.time)}
          />
        ))}
      </div>
    </div>
  );
});

TimeCodedLyrics.displayName = 'TimeCodedLyrics';
