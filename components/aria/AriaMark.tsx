/**
 * AriaMark — Aria's spiral-bloom identity mark, rendered as a living nebula.
 *
 * Aria is the single AI persona across all of Plajah, and this is her face
 * everywhere she appears (the agent panel, message avatars, the player-bar
 * launcher, in-experience coaches). It renders her logo — a spiral bloom of
 * translucent petals around a four-point starburst — in pure SVG/CSS so it
 * stays crisp at any size.
 *
 * The orb is alive: a soft halo breathes around it, a spectral colour field turns
 * slowly, drifting nebula clouds orbit at different depths and speeds, and on
 * larger sizes a few stars twinkle. The starburst doubles as her "thinking" state:
 * pass `thinking` and everything quickens and the glow flares.
 *
 * Self-contained: keyframes are injected once (no global CSS), animation is
 * transform/opacity only (cheap — this renders on every message avatar), effects
 * scale down at small sizes, and prefers-reduced-motion freezes it.
 */
import React from 'react';
import { motion, useReducedMotion } from 'motion/react';

const PETAL = 'M50 50 C60 33 78 30 90 39 C79 45 70 58 60 74 C55 65 50 58 50 50Z';
const SPARK = 'M50 20 C52 41 55 46 62 48 C68 49 74 49.4 80 50 C74 50.6 68 50.9 62 52 C55 54 52 59 50 80 C48 59 45 54 38 52 C32 50.9 26 50.6 20 50 C26 49.4 32 49 38 48 C45 46 48 41 50 20Z';
const CONIC =
  'conic-gradient(from 208deg,#ff8c00,#ff6a3d,#e8557a,#d40055,#8a2fa0,#6b0099,#3b5bdb,#5baef0,#00daf3,#35c7c7,#ff8c00)';
const PETAL_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

/** Drifting nebula clouds: colour, orbit offset (% of box), diameter (% of box), orbit seconds, direction. */
const CLOUDS: ReadonlyArray<{ c: string; x: number; y: number; d: number; t: number; rev?: boolean }> = [
  { c: 'rgba(255,106,61,.95)',  x: 18,  y: -6,  d: 62, t: 38 },
  { c: 'rgba(138,47,160,.95)',  x: -16, y: 12,  d: 70, t: 52, rev: true },
  { c: 'rgba(0,218,243,.85)',   x: 4,   y: 20,  d: 58, t: 67 },
  { c: 'rgba(232,85,122,.9)',   x: -8,  y: -18, d: 54, t: 44, rev: true },
];

/** Stars: position (% of box), twinkle seconds, delay seconds, px size. Larger orbs only. */
const STARS: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [22, 30, 3.1, 0.0, 1.6], [71, 24, 4.3, 1.1, 1.3], [63, 70, 3.7, 0.5, 1.8],
  [30, 68, 5.0, 2.0, 1.2], [80, 52, 4.0, 1.6, 1.4], [44, 16, 3.4, 2.6, 1.2],
];

const CSS_ID = 'aria-mark-keyframes';
const CSS = `
@keyframes ariaMark-spin{to{transform:rotate(360deg)}}
@keyframes ariaMark-spin-rev{to{transform:rotate(-360deg)}}
@keyframes ariaMark-breathe{0%,100%{transform:scale(.9);opacity:.55}50%{transform:scale(1.1);opacity:1}}
@keyframes ariaMark-twinkle{0%,100%{opacity:.1;transform:scale(.5)}50%{opacity:1;transform:scale(1.15)}}
@keyframes ariaMark-core{0%,100%{opacity:.82}50%{opacity:1}}
`;
// Injected once at module load; harmless (and absent) during SSR.
if (typeof document !== 'undefined' && !document.getElementById(CSS_ID)) {
  const el = document.createElement('style');
  el.id = CSS_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

export interface AriaMarkProps {
  /** rendered box size in px (default 28) */
  size?: number;
  /** quicker spin, brighter glow, spark flare — Aria's working/thinking state */
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
  const still = !!reduce;
  const showPetals = petals ?? size >= 22;
  const showClouds = size >= 20;
  const showStars = size >= 40;
  const mask = 'radial-gradient(circle at 50% 50%, #000 52%, transparent 74%)';
  const speed = thinking ? 0.32 : 1; // multiply durations: thinking runs ~3x faster
  const anim = (name: string, seconds: number, extra = 'linear infinite') =>
    still ? undefined : `${name} ${(seconds * speed).toFixed(2)}s ${extra}`;

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
      {/* breathing halo — the glow that pulses around the orb */}
      <span
        aria-hidden
        style={{
          position: 'absolute', inset: '-30%', borderRadius: '50%', zIndex: -1, pointerEvents: 'none',
          background: 'radial-gradient(circle, rgba(139,92,246,.62) 0%, rgba(232,85,122,.34) 38%, rgba(0,218,243,.12) 58%, transparent 72%)',
          filter: `blur(${Math.max(2, size * 0.1)}px)`,
          animation: anim('ariaMark-breathe', 5.6, 'ease-in-out infinite'),
          opacity: still ? 0.85 : undefined,
          willChange: still ? undefined : 'transform, opacity',
        }}
      />

      {/* nebula body: spectral field + drifting clouds, softly masked to a round bloom */}
      <span
        aria-hidden
        style={{
          position: 'absolute', inset: '-3%', borderRadius: '50%', overflow: 'hidden',
          WebkitMaskImage: mask, maskImage: mask,
        }}
      >
        {/* slow-turning spectral colour field */}
        <span
          style={{
            position: 'absolute', inset: 0, borderRadius: '50%', background: CONIC,
            filter: `blur(${Math.max(1, size * 0.05)}px) saturate(150%)`,
            animation: anim('ariaMark-spin', 52),
          }}
        />

        {/* drifting clouds — each orbits at its own depth and speed (parallax = nebula feel) */}
        {showClouds && CLOUDS.map((cl, i) => (
          <span
            key={i}
            style={{
              position: 'absolute', inset: 0,
              animation: anim(cl.rev ? 'ariaMark-spin-rev' : 'ariaMark-spin', cl.t),
            }}
          >
            <span
              style={{
                position: 'absolute',
                left: `${50 + cl.x - cl.d / 2}%`, top: `${50 + cl.y - cl.d / 2}%`,
                width: `${cl.d}%`, height: `${cl.d}%`, borderRadius: '50%',
                background: `radial-gradient(circle, ${cl.c} 0%, transparent 68%)`,
                filter: `blur(${Math.max(1.5, size * 0.07)}px)`,
                mixBlendMode: 'screen', opacity: 0.8,
              }}
            />
          </span>
        ))}

        {/* tiny stars caught in the nebula (big orbs only) */}
        {showStars && (
          <span style={{ position: 'absolute', inset: 0, animation: anim('ariaMark-spin-rev', 90) }}>
            {STARS.map(([x, y, t, delay, px], i) => (
              <span
                key={i}
                style={{
                  position: 'absolute', left: `${x}%`, top: `${y}%`, width: px, height: px, borderRadius: '50%',
                  background: '#fff', boxShadow: '0 0 4px 1px rgba(255,255,255,.9)',
                  animation: still ? undefined : `ariaMark-twinkle ${(t * (thinking ? 0.5 : 1)).toFixed(2)}s ease-in-out ${delay}s infinite`,
                  opacity: still ? 0.7 : undefined,
                }}
              />
            ))}
          </span>
        )}
      </span>

      {/* translucent petal blades — the spiral-bloom of her logo, turning against the field */}
      {showPetals && (
        <svg
          aria-hidden
          viewBox="0 0 100 100"
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible',
            mixBlendMode: 'screen', opacity: 0.42,
            animation: anim('ariaMark-spin-rev', 78),
          }}
        >
          {PETAL_ANGLES.map(a => (
            <path key={a} d={PETAL} fill="#fff" transform={`rotate(${a} 50 50)`} />
          ))}
        </svg>
      )}

      {/* four-point starburst: the core, and her thinking indicator */}
      <motion.svg
        aria-hidden
        viewBox="0 0 100 100"
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible',
          filter: 'drop-shadow(0 0 3px #fff) drop-shadow(0 0 10px rgba(255,190,140,.8)) drop-shadow(0 0 18px rgba(167,139,250,.55))',
          animation: anim('ariaMark-core', 4.8, 'ease-in-out infinite'),
        }}
        animate={still ? undefined : (thinking ? { scale: [0.85, 1.14, 0.85], rotate: [0, 45, 0] } : { scale: [0.92, 1.07, 0.92] })}
        transition={still ? undefined : { repeat: Infinity, ease: 'easeInOut', duration: thinking ? 0.85 : 4.8 }}
      >
        <path d={SPARK} fill="#fff" />
      </motion.svg>
    </span>
  );
};

export default AriaMark;
