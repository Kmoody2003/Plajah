/**
 * AriaMark — Aria's spiral-bloom identity mark.
 *
 * Aria is the single AI persona across all of Plajah, and this is her face
 * everywhere she appears (the agent panel, message avatars, the player-bar
 * launcher, in-experience coaches). It renders her logo — a spiral bloom of
 * translucent petals around a four-point starburst — in pure SVG/CSS so it
 * stays crisp at any size and can animate.
 *
 * The starburst doubles as her "thinking" state: pass `thinking` and the
 * bloom speeds up and the spark flares.
 *
 * Self-contained (no global CSS) — animation via motion/react, and it honors
 * prefers-reduced-motion.
 */
import React from 'react';
import { motion, useReducedMotion } from 'motion/react';

const PETAL = 'M50 50 C60 33 78 30 90 39 C79 45 70 58 60 74 C55 65 50 58 50 50Z';
const SPARK = 'M50 20 C52 41 55 46 62 48 C68 49 74 49.4 80 50 C74 50.6 68 50.9 62 52 C55 54 52 59 50 80 C48 59 45 54 38 52 C32 50.9 26 50.6 20 50 C26 49.4 32 49 38 48 C45 46 48 41 50 20Z';
const CONIC =
  'conic-gradient(from 208deg,#ff8c00,#ff6a3d,#e8557a,#d40055,#8a2fa0,#6b0099,#3b5bdb,#5baef0,#00daf3,#35c7c7,#ff8c00)';
const PETAL_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

export interface AriaMarkProps {
  /** rendered box size in px (default 28) */
  size?: number;
  /** faster spin + spark flare — Aria's working/thinking state */
  thinking?: boolean;
  /** show the translucent petal blades (default: on for size >= 22) */
  petals?: boolean;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

const AriaMark: React.FC<AriaMarkProps> = ({
  size = 28, thinking = false, petals, className = '', style, title,
}) => {
  const reduce = useReducedMotion();
  const showPetals = petals ?? size >= 22;
  const mask = 'radial-gradient(circle at 50% 50%, #000 48%, transparent 72%)';
  const still = !!reduce;

  return (
    <span
      className={className}
      role="img"
      aria-label={title || 'Aria'}
      style={{
        position: 'relative', width: size, height: size,
        display: 'inline-grid', placeItems: 'center', flex: '0 0 auto',
        borderRadius: '50%', isolation: 'isolate', ...style,
      }}
    >
      {/* spectral color field */}
      <motion.span
        style={{
          position: 'absolute', inset: '-3%', borderRadius: '50%',
          background: CONIC,
          filter: `blur(${Math.max(1, size * 0.05)}px) saturate(150%)`,
          WebkitMaskImage: mask, maskImage: mask,
        }}
        animate={still ? undefined : { rotate: 360 }}
        transition={still ? undefined : { repeat: Infinity, ease: 'linear', duration: thinking ? 9 : 26 }}
      />

      {/* translucent petal blades */}
      {showPetals && (
        <motion.svg
          viewBox="0 0 100 100"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', mixBlendMode: 'screen', opacity: 0.5 }}
          animate={still ? undefined : { rotate: -360 }}
          transition={still ? undefined : { repeat: Infinity, ease: 'linear', duration: 34 }}
        >
          {PETAL_ANGLES.map(a => (
            <path key={a} d={PETAL} fill="#fff" transform={`rotate(${a} 50 50)`} />
          ))}
        </motion.svg>
      )}

      {/* four-point starburst (thinking indicator) */}
      <motion.svg
        viewBox="0 0 100 100"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', filter: 'drop-shadow(0 0 3px #fff) drop-shadow(0 0 9px rgba(255,190,140,.7))' }}
        animate={still ? undefined : (thinking ? { scale: [0.85, 1.12, 0.85], rotate: [0, 45, 0] } : { scale: [0.92, 1.06, 0.92] })}
        transition={still ? undefined : { repeat: Infinity, ease: 'easeInOut', duration: thinking ? 0.85 : 3.6 }}
      >
        <path d={SPARK} fill="#fff" />
      </motion.svg>
    </span>
  );
};

export default AriaMark;
