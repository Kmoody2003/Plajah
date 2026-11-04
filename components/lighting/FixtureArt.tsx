// Drawings of each kind of fixture. These are our own line art rather than manufacturer photos,
// which we have no licence to copy; the product page link carries the real photo.

import React from 'react';
import type { FixtureForm } from '../../services/lighting/fixtureCatalog';

const BODY = '#2b2933', EDGE = '#4a4755', DARK = '#15141a', GLOW = '#FF8C00';

const Lens: React.FC<{ cx: number; cy: number; r: number; hot?: boolean }> = ({ cx, cy, r, hot }) => (
  <>
    <circle cx={cx} cy={cy} r={r} fill={DARK} stroke={EDGE} strokeWidth="1.5" />
    <circle cx={cx} cy={cy} r={r * 0.62} fill={hot ? '#ffd9a0' : '#3a3946'} />
    <circle cx={cx - r * 0.2} cy={cy - r * 0.2} r={r * 0.18} fill="#fff" opacity="0.55" />
  </>
);

const LEDS = (cols: number, rows: number, x: number, y: number, w: number, h: number, colors = ['#ff4a4a', '#4aff7a', '#4a8aff', '#fff1dc']) => {
  const out: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    out.push(<circle key={`${r}-${c}`} cx={x + ((c + 0.5) * w) / cols} cy={y + ((r + 0.5) * h) / rows} r={Math.min(w / cols, h / rows) * 0.34} fill={colors[(r * cols + c) % colors.length]} />);
  }
  return out;
};

const Yoke: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <>
    <rect x="30" y="74" width="40" height="14" rx="3" fill={BODY} stroke={EDGE} />
    <path d="M36 74 L30 36 L36 34 L42 74 Z M64 74 L70 36 L64 34 L58 74 Z" fill={BODY} stroke={EDGE} />
    {children}
  </>
);

const ART: Record<FixtureForm, React.ReactNode> = {
  par: (
    <>
      <path d="M50 12 v10" stroke={EDGE} strokeWidth="3" />
      <path d="M34 22 h32 l-4 8 h-24 z" fill={BODY} stroke={EDGE} />
      <rect x="22" y="30" width="56" height="48" rx="8" fill={BODY} stroke={EDGE} />
      <rect x="28" y="36" width="44" height="36" rx="5" fill={DARK} />
      {LEDS(4, 3, 28, 36, 44, 36)}
    </>
  ),
  bar: (
    <>
      <rect x="6" y="38" width="88" height="26" rx="4" fill={BODY} stroke={EDGE} />
      {LEDS(8, 1, 9, 42, 82, 18)}
      <path d="M20 64 v10 M80 64 v10 M14 74 h12 M74 74 h12" stroke={EDGE} strokeWidth="2.5" />
    </>
  ),
  'mover-spot': (
    <Yoke>
      <rect x="36" y="16" width="28" height="44" rx="10" fill={BODY} stroke={EDGE} />
      <Lens cx={50} cy={26} r={11} hot />
      <path d="M40 46 h20 M40 51 h20" stroke={EDGE} strokeWidth="1.5" />
    </Yoke>
  ),
  'mover-wash': (
    <Yoke>
      <circle cx="50" cy="36" r="22" fill={BODY} stroke={EDGE} />
      <circle cx="50" cy="36" r="17" fill={DARK} />
      {LEDS(4, 4, 37, 23, 26, 26)}
    </Yoke>
  ),
  'mover-beam': (
    <Yoke>
      <path d="M38 62 L34 18 Q50 8 66 18 L62 62 Z" fill={BODY} stroke={EDGE} />
      <Lens cx={50} cy={22} r={9} hot />
    </Yoke>
  ),
  strobe: (
    <>
      <rect x="10" y="28" width="80" height="44" rx="5" fill={BODY} stroke={EDGE} />
      <rect x="15" y="33" width="70" height="34" rx="2" fill="#efeee8" />
      <path d="M22 50 h56" stroke="#fff" strokeWidth="5" />
      <path d="M50 14 v14" stroke={EDGE} strokeWidth="3" />
    </>
  ),
  blinder: (
    <>
      <rect x="14" y="22" width="72" height="56" rx="5" fill={BODY} stroke={EDGE} />
      {[0, 1].map((r) => [0, 1].map((c) => <Lens key={`${r}${c}`} cx={33 + c * 34} cy={37 + r * 26} r={11} hot />))}
    </>
  ),
  ellipsoidal: (
    <>
      <path d="M8 44 h26 l10 -10 h30 v32 h-30 l-10 -10 h-26 z" fill={BODY} stroke={EDGE} />
      <rect x="74" y="36" width="10" height="28" fill={DARK} stroke={EDGE} />
      <rect x="84" y="42" width="8" height="16" fill={GLOW} opacity="0.75" />
      <path d="M50 66 v14 M38 80 h24 M56 34 v-14" stroke={EDGE} strokeWidth="2.5" />
    </>
  ),
  panel: (
    <>
      <rect x="10" y="22" width="80" height="50" rx="3" fill={BODY} stroke={EDGE} />
      <rect x="15" y="27" width="70" height="40" fill="#f6e8d0" />
      <path d="M50 72 v10 M36 84 h28" stroke={EDGE} strokeWidth="3" />
    </>
  ),
  tube: (
    <>
      <rect x="4" y="44" width="92" height="12" rx="6" fill="#f6e8d0" stroke={EDGE} />
      {LEDS(12, 1, 8, 45, 84, 10)}
      <path d="M26 44 v-14 M74 44 v-14" stroke={EDGE} strokeWidth="1.5" />
    </>
  ),
  fog: (
    <>
      <rect x="18" y="44" width="58" height="34" rx="4" fill={BODY} stroke={EDGE} />
      <rect x="70" y="52" width="16" height="10" fill={DARK} stroke={EDGE} />
      <path d="M92 52 q8 -6 2 -14 q-6 -8 2 -14 M84 48 q6 -6 0 -12" stroke="#9fa3b5" strokeWidth="3" fill="none" strokeLinecap="round" />
      <rect x="26" y="32" width="14" height="12" fill={EDGE} />
    </>
  ),
  string: (
    <>
      <path d="M4 28 Q28 54 50 32 T96 30" stroke={EDGE} strokeWidth="2" fill="none" />
      {[[14, 38, '#ff4a4a'], [28, 45, '#4aff7a'], [42, 39, '#ffe14a'], [56, 30, '#4a8aff'], [72, 28, '#ff4a4a'], [86, 30, '#4aff7a']].map(([x, y, c]) => (
        <ellipse key={String(x)} cx={Number(x)} cy={Number(y) + 6} rx="4" ry="7" fill={String(c)} />
      ))}
    </>
  ),
};

export const FixtureArt: React.FC<{ form: FixtureForm; className?: string }> = ({ form, className }) => (
  <svg viewBox="0 0 100 92" className={className} role="img" aria-hidden="true">{ART[form]}</svg>
);
