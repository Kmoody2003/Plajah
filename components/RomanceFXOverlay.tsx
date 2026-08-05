import React, { useMemo } from 'react';

/**
 * Ambient romance FX for intimate video calls — falling rose petals + drifting
 * hearts, pure CSS (no assets, no per-frame JS). Non-interactive overlay.
 */
const RomanceFXOverlay: React.FC<{ count?: number }> = ({ count = 14 }) => {
  const bits = useMemo(() =>
    Array.from({ length: count }, (_, i) => ({
      i,
      glyph: i % 3 === 0 ? '💗' : '🌹',
      left: (i * 37) % 100,               // deterministic spread
      delay: (i % 7) * 0.9,
      dur: 7 + (i % 5) * 2,
      size: 14 + (i % 4) * 8,
      drift: ((i % 5) - 2) * 30,
    })), [count]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
      <style>{`
        @keyframes romanceFall {
          0%   { transform: translateY(-12%) translateX(0) rotate(0deg); opacity: 0; }
          10%  { opacity: 0.85; }
          85%  { opacity: 0.7; }
          100% { transform: translateY(112vh) translateX(var(--drift,0px)) rotate(220deg); opacity: 0; }
        }
      `}</style>
      {bits.map((b) => (
        <span
          key={b.i}
          style={{
            position: 'absolute',
            top: '-40px',
            left: `${b.left}%`,
            fontSize: b.size,
            // @ts-ignore CSS custom property
            '--drift': `${b.drift}px`,
            animation: `romanceFall ${b.dur}s linear ${b.delay}s infinite`,
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
          } as React.CSSProperties}
        >
          {b.glyph}
        </span>
      ))}
    </div>
  );
};

export default RomanceFXOverlay;
