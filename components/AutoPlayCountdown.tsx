// Full-screen "auto-play in N seconds" countdown shown when a visitor lands on a
// shared track link (…/share?type=album&id=…&track=…). After the count hits zero it
// starts playback; the X (or tapping the number to play now) dismisses it. Tapping the
// number counts as a user gesture, which also helps browsers allow the autoplay.

import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { X, Play } from 'lucide-react';

interface AutoPlayCountdownProps {
  trackTitle: string;
  artist: string;
  seconds?: number;
  onComplete: () => void;
  onDismiss: () => void;
}

const AutoPlayCountdown: React.FC<AutoPlayCountdownProps> = ({ trackTitle, artist, seconds = 5, onComplete, onDismiss }) => {
  const [count, setCount] = useState(seconds);
  const doneRef = useRef(false);

  const finish = () => { if (!doneRef.current) { doneRef.current = true; onComplete(); } };

  useEffect(() => {
    if (count <= 0) { finish(); return; }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[700] flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
    >
      {/* Dismiss */}
      <button
        onClick={onDismiss}
        title="Dismiss"
        className="absolute z-10 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-all"
        style={{ top: 'max(1.5rem, env(safe-area-inset-top))', right: 'max(1.5rem, env(safe-area-inset-right))' }}
      >
        <X size={24} />
      </button>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 max-w-4xl">
        {/* Big number — tap to play now (also unlocks browser autoplay) */}
        <button onClick={finish} className="relative leading-none shrink-0 group" title="Play now">
          <motion.span
            key={count}
            initial={{ scale: 0.7, opacity: 0.35 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            className="block font-black text-white tabular-nums"
            style={{ fontSize: 'clamp(6rem, 34vw, 15rem)', letterSpacing: '-0.05em' }}
          >
            {count}
          </motion.span>
          <span className="absolute inset-x-0 -bottom-1 flex items-center justify-center gap-1 text-[9px] font-black uppercase tracking-[0.3em] text-white/30 group-hover:text-small-orange transition-colors">
            <Play size={9} fill="currentColor" /> Play now
          </span>
        </button>

        {/* Copy next to the number */}
        <div className="text-center sm:text-left min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.4em] text-white/45 mb-2">Seconds To Auto Play</p>
          <h2 className="font-black uppercase tracking-tight text-white leading-tight break-words" style={{ fontSize: 'clamp(1.4rem, 6vw, 2.75rem)' }}>{trackTitle}</h2>
          <p className="text-sm sm:text-lg font-bold uppercase tracking-widest text-small-orange mt-1">by {artist}</p>
        </div>
      </div>
    </motion.div>
  );
};

export default AutoPlayCountdown;
