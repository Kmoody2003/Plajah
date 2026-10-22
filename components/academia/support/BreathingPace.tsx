import React, { useEffect, useState } from 'react';

/**
 * A breathing pacer: in for 4, hold for 2, out for 6. The circle grows and shrinks; under Calm (or reduced
 * motion) it holds still and only the words and count change, so it never becomes a moving thing to track.
 */
const PHASES = [{ label: 'Breathe in', secs: 4, scale: 1 }, { label: 'Hold', secs: 2, scale: 1 }, { label: 'Breathe out', secs: 6, scale: 0.55 }] as const;

const BreathingPace: React.FC<{ calm?: boolean; color?: string; size?: number }> = ({ calm = false, color = '#00DAF3', size = 132 }) => {
  const [p, setP] = useState(0);
  const [left, setLeft] = useState<number>(PHASES[0].secs);
  useEffect(() => {
    const t = setInterval(() => setLeft(l => {
      if (l > 1) return l - 1;
      setP(x => { const n = (x + 1) % PHASES.length; setLeft(PHASES[n].secs); return n; });
      return l;
    }), 1000);
    return () => clearInterval(t);
  }, []);
  const ph = PHASES[p];
  const reduced = calm || (typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  return (
    <div className="flex flex-col items-center gap-3" role="timer" aria-live="polite" aria-label={`${ph.label}, ${left}`}>
      <div className="grid place-items-center" style={{ width: size, height: size }}>
        <div className="rounded-full grid place-items-center" style={{
          width: size, height: size, background: `radial-gradient(circle, ${color}55, ${color}11 70%)`, border: `2px solid ${color}`,
          transform: `scale(${reduced ? 0.8 : ph.scale})`, transition: reduced ? 'none' : `transform ${ph.secs}s ease-in-out`,
        }}>
          <span className="text-[28px] font-black tabular-nums" style={{ color }}>{left}</span>
        </div>
      </div>
      <p className="text-[15px] font-bold">{ph.label}</p>
    </div>
  );
};
export default BreathingPace;
