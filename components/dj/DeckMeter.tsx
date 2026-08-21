// DeckMeter — a lightweight VU meter for a DJ channel. Reads the deck's post-EQ analyser
// (time-domain RMS + a decaying peak hold) and paints a segmented vertical level bar on its
// own rAF: the channel color, ramping to amber then red near clip. Self-contained; give it a
// getter for the analyser node (it lives in a ref that changes as decks (re)build).

import React, { useEffect, useRef } from 'react';

interface DeckMeterProps {
  getAnalyser: () => AnalyserNode | null;
  color: string;
  className?: string;
  width?: number;
}

const DeckMeter: React.FC<DeckMeterProps> = ({ getAnalyser, color, className, width = 6 }) => {
  const barRef = useRef<HTMLDivElement>(null);
  const peakRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const data = new Uint8Array(2048);
    let peakHold = 0;
    const tick = () => {
      const an = getAnalyser();
      if (an) {
        const n = Math.min(data.length, an.fftSize);
        an.getByteTimeDomainData(data);
        let sum = 0, peak = 0;
        for (let i = 0; i < n; i++) {
          const v = (data[i] - 128) / 128;
          const a = v < 0 ? -v : v;
          sum += v * v;
          if (a > peak) peak = a;
        }
        const rms = Math.sqrt(sum / n);
        const level = Math.min(1, rms * 2.6);          // scale RMS into a visible range
        peakHold = Math.max(peak, peakHold * 0.92);    // fast attack, slow decay
        if (barRef.current) barRef.current.style.height = (level * 100).toFixed(1) + '%';
        if (peakRef.current) peakRef.current.style.bottom = (Math.min(1, peakHold) * 100).toFixed(1) + '%';
      } else if (barRef.current) {
        barRef.current.style.height = '0%';
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getAnalyser]);

  return (
    <div className={className} style={{ position: 'relative', width, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
      <div ref={barRef} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '0%', background: `linear-gradient(to top, ${color}, ${color} 60%, #F59E0B 80%, #EF4444)` }} />
      <div ref={peakRef} style={{ position: 'absolute', left: 0, right: 0, height: 2, background: '#fff', bottom: '0%', opacity: 0.8 }} />
    </div>
  );
};

export default DeckMeter;
