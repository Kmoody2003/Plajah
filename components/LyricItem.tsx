
import React, { useEffect, useRef } from 'react';
import { motion } from 'motion/react';

interface LyricItemProps {
  line: { time: number; text: string };
  isActive: boolean;
  onClick: () => void;
}

export const LyricItem = React.forwardRef<HTMLParagraphElement, LyricItemProps>(({ line, isActive, onClick }, ref) => {
  return (
    <motion.p
      ref={ref}
      animate={{ 
        opacity: isActive ? 1 : 0.3, 
        scale: isActive ? 1.05 : 1,
        x: isActive ? 10 : 0 
      }}
      className={`text-2xl lg:text-3xl font-display font-black uppercase tracking-tight leading-tight transition-all duration-500 cursor-pointer hover:opacity-100 ${isActive ? 'text-small-orange' : 'text-white'}`}
      onClick={onClick}
    >
      {line.text}
    </motion.p>
  );
});

LyricItem.displayName = 'LyricItem';

export const TimeCodedLyrics: React.FC<{
  tracks: { time: number; text: string }[];
  currentTime: number;
  seek: (time: number) => void;
  containerRef: React.RefObject<HTMLDivElement>;
}> = React.memo(({ tracks, currentTime, seek, containerRef }) => {
  const activeIndex = React.useMemo(() => {
    return tracks.findIndex((line, idx) => {
      const nextLine = tracks[idx + 1];
      return currentTime >= line.time && (!nextLine || currentTime < nextLine.time);
    });
  }, [tracks, currentTime]);

  const activeItemRef = useRef<HTMLParagraphElement>(null);
  
  useEffect(() => {
    console.log('Scrolling to active lyric', activeIndex);
    if (activeItemRef.current && containerRef.current) {
      activeItemRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeIndex, containerRef]);

  return (
    <div className="space-y-6">
      {tracks.map((line, idx) => (
        <LyricItem 
          key={idx}
          line={line}
          isActive={idx === activeIndex}
          onClick={() => seek(line.time)}
          // Add a ref to the active item
          ref={idx === activeIndex ? activeItemRef : undefined}
        />
      ))}
    </div>
  );
});
