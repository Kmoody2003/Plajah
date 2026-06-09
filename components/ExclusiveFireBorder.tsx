import React, { useEffect } from 'react';

// ── CSS injection ─────────────────────────────────────────────────────────────
// Uses @property to animate the conic-gradient angle for a true rotating fire
// border. Supported in Chrome 85+, Edge 85+, Safari 16.4+, Firefox 128+.

const STYLE_ID = 'exclusive-fire-styles';

function ensureStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    @property --fire-angle {
      syntax: '<angle>';
      inherits: false;
      initial-value: 0deg;
    }
    @keyframes fireSpin {
      to { --fire-angle: 360deg; }
    }
    @keyframes fireGlow {
      0%,100% {
        box-shadow:
          0 0 6px 2px rgba(255,69,0,0.65),
          0 0 18px 5px rgba(255,120,0,0.35),
          0 0 38px 9px rgba(255,60,0,0.14);
      }
      33% {
        box-shadow:
          0 0 10px 3px rgba(255,180,0,0.75),
          0 0 26px 7px rgba(255,200,0,0.42),
          0 0 52px 13px rgba(255,140,0,0.18);
      }
      66% {
        box-shadow:
          0 0 5px 1.5px rgba(255,30,0,0.55),
          0 0 14px 4px rgba(255,80,0,0.3),
          0 0 30px 7px rgba(255,50,0,0.11);
      }
    }
    .exclusive-fire-border {
      border: 2.5px solid transparent;
      animation: fireSpin 4s linear infinite, fireGlow 2s ease-in-out infinite;
      background:
        linear-gradient(var(--exclusive-fire-bg, #111), var(--exclusive-fire-bg, #111)) padding-box,
        conic-gradient(
          from var(--fire-angle, 0deg),
          #ff2200, #ff5500, #ff8c00,
          #ffd700, #ff8c00, #ff5500,
          #ff2200
        ) border-box;
    }

    /* Countdown badge that pulses inside exclusive posts */
    @keyframes exclusivePulse {
      0%,100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.7; transform: scale(0.96); }
    }
    .exclusive-badge {
      animation: exclusivePulse 2s ease-in-out infinite;
    }
  `;
  document.head.appendChild(s);
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ExclusiveFireBorderProps {
  children: React.ReactNode;
  bg?: string;       // content background color to fill padding-box
  radius?: number;   // border-radius in px (default 24)
  className?: string;
  style?: React.CSSProperties;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const ExclusiveFireBorder: React.FC<ExclusiveFireBorderProps> = ({
  children,
  bg = '#0e0e0e',
  radius = 24,
  className = '',
  style,
}) => {
  useEffect(() => { ensureStyles(); }, []);

  return (
    <div
      className={`exclusive-fire-border ${className}`}
      style={{
        borderRadius: radius,
        '--exclusive-fire-bg': bg,
        ...style,
      } as React.CSSProperties}
    >
      {children}
    </div>
  );
};

// ── Exclusive badge (shown inside post header) ────────────────────────────────

interface ExclusiveBadgeProps {
  expiresAt?: number;
  viewLimit?: number;
  viewedCount?: number;
}

export const ExclusiveBadge: React.FC<ExclusiveBadgeProps> = ({ expiresAt, viewLimit, viewedCount = 0 }) => {
  const [remaining, setRemaining] = React.useState('');

  useEffect(() => {
    ensureStyles();
    if (!expiresAt) return;
    const tick = () => {
      const ms = expiresAt - Date.now();
      if (ms <= 0) { setRemaining('Expired'); return; }
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      if (h > 0) setRemaining(`${h}h ${m}m`);
      else if (m > 0) setRemaining(`${m}m ${s}s`);
      else setRemaining(`${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return (
    <span
      className="exclusive-badge inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest"
      style={{
        background: 'rgba(255,80,0,0.15)',
        border: '1px solid rgba(255,120,0,0.35)',
        color: '#ff8c00',
      }}
    >
      🔥
      {expiresAt ? `Expires ${remaining}` : `${viewLimit! - viewedCount} views left`}
    </span>
  );
};

export default ExclusiveFireBorder;
