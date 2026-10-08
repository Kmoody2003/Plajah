// chartStyle — how each theme draws a chart, derived from the theme's own
// palette, type and lens (theme files are not touched).
//
// Eight mark languages cover the 43 themes:
//   engraved  hairline gilt outlines over a soft fill, serif numerals (classical / baroque)
//   grid      flat, square, ONE highlight colour, everything else ink (Swiss, minimal, data poem)
//   geo       primaries, ink outlines, playful rounding, a pop entrance (Bauhaus, Memphis, stickers)
//   slab      heavy blocks with a hard offset shadow (brutalist, constructivist, concrete)
//   print     two misregistered inks + halftone body (riso, misprint, halftone, wheat-paste)
//   hand      wobbling hand-drawn edges + hatch fill (chalk, zine, tape, stencil)
//   neon      glowing tubes, emissive fills, a breath of flicker (night, VHS, neon brick, night city)
//   soft      rounded translucent gradients (glass, aurora mesh, airy, colour field, ribbon)
import { alpha, luminance } from '../../tela/templateKit';
import type { SlideTheme } from './types';

export type ChartFlavor = 'engraved' | 'grid' | 'geo' | 'slab' | 'print' | 'hand' | 'neon' | 'soft';

export interface ChartStyle {
  flavor: ChartFlavor;
  /** Categorical colours in order, each readable on the ground. */
  series: string[];
  /** Highlight colour (the one mark that matters most). */
  hi: string;
  /** Colour for marks that are NOT the highlight in mono styles. */
  base: string;
  /** Mono: every mark `base` except the highlighted one. */
  mono: boolean;
  /** Secondary series (comparison / last year). */
  second: string;
  /** Track behind progress marks (goal arc, thermometer, icon array off). */
  track: string;
  grid: string; gridW: number; gridDash?: number[];
  axis: string; axisW: number;
  /** Corner radius as a fraction of the bar thickness (0 square … .5 pill). */
  round: number;
  /** Ink outline around marks (px in u). */
  outline?: { color: string; w: number };
  /** Hard offset shadow (slab / cut paper) in u. */
  slab?: { color: string; dx: number; dy: number };
  /** Emissive glow radius in u (neon). */
  glow: number;
  /** Misregistered second ink offset in u (print). */
  misreg?: { color: string; dx: number; dy: number };
  /** Hand wobble amplitude in u. */
  wobble: number;
  /** Body texture inside marks. */
  texture: 'none' | 'hatch' | 'halftone' | 'chalk';
  /** Vertical gradient on fills (lighter top). */
  gradient: boolean;
  /** Fill opacity for marks (soft styles < 1). */
  fillA: number;
  /** Entrance easing for growing marks. */
  ease: 'out' | 'back' | 'bounce' | 'step';
  /** Line-chart stroke width and point shape (u). */
  lineW: number; point: 'circle' | 'square' | 'diamond' | 'ring';
  /** Ambient shimmer once settled. */
  shimmer: 'sweep' | 'breath' | 'flicker' | 'jitter' | 'none';
  /** Value labels: 'display' numerals or the 'label' face. */
  valueFace: 'display' | 'label';
  /** Ink that numbers are set in on the ground. */
  valueInk: string;
}

const FLAVOR: Record<string, ChartFlavor> = {
  sanctuary: 'engraved', candlelight: 'engraved', neodeco: 'engraved', airy: 'soft', editorial: 'grid',
  minimal: 'grid', swiss: 'grid', quiet: 'grid', datapoem: 'grid', gengrid: 'grid', monoblue: 'grid', suprematist: 'grid',
  bauhaus: 'geo', destijl: 'geo', memphis: 'geo', atomic: 'geo', terrazzo: 'geo', truchet: 'geo', cutpaper: 'geo', stickers: 'geo',
  brutalist: 'slab', constructivist: 'slab', concrete: 'slab', youth: 'slab', deconstruct: 'slab',
  riso: 'print', misprint: 'print', halftone: 'print', wheatpaste: 'print',
  chalk: 'hand', zine: 'hand', ducttape: 'hand', stencil: 'hand',
  night: 'neon', vhs: 'neon', neonbrick: 'neon', nightcity: 'neon', kinetic: 'neon',
  glass: 'soft', mesh: 'soft', colorfield: 'soft', ribbon: 'soft', spotlight: 'soft',
};

/** Hex mix of a toward b by t (0 = a). */
export function blend(a: string, b: string, t: number): string {
  const p = (h: string) => { const m = h.replace('#', ''); return m.length === 6 ? [0, 2, 4].map(i => parseInt(m.slice(i, i + 2), 16)) : null; };
  const x = p(a), y = p(b); if (!x || !y) return a;
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

function contrast(a: string, b: string): number {
  if (!/^#[0-9a-f]{6}$/i.test(a) || !/^#[0-9a-f]{6}$/i.test(b)) return 3;
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + .05) / (Math.min(la, lb) + .05);
}

/** The theme's colours that read as marks on its ground, accent first. */
export function readableSeries(th: SlideTheme, min = 1.9): string[] {
  const c = th.c, g = c.ground;
  const cand = [c.accent, c.accent2, c.accent3, c.ink, c.muted];
  const out: string[] = [];
  for (const col of cand) {
    if (!/^#[0-9a-f]{6}$/i.test(col)) continue;
    if (contrast(col, g) < min) continue;
    if (out.some(o => o.toLowerCase() === col.toLowerCase())) continue;
    out.push(col);
  }
  if (!out.length) out.push(c.ink);
  return out;
}

const cache = new Map<string, ChartStyle>();

export function chartStyle(th: SlideTheme): ChartStyle {
  const hit = cache.get(th.id);
  if (hit) return hit;
  const c = th.c;
  const flavor: ChartFlavor = FLAVOR[th.id] ?? (th.dark ? 'neon' : 'grid');
  const ser = readableSeries(th);
  const hi = ser[0];
  const soft = c.muted;
  const s: ChartStyle = {
    flavor, series: ser, hi, base: c.ink, mono: false,
    second: ser[1] && ser[1] !== c.ink ? ser[1] : soft,
    track: alpha(c.ink, th.dark ? .14 : .1),
    grid: alpha(c.ink, th.dark ? .16 : .13), gridW: .08,
    axis: alpha(c.ink, .7), axisW: .14,
    round: .08, glow: 0, wobble: 0, texture: 'none', gradient: false, fillA: 1,
    ease: 'out', lineW: .42, point: 'circle', shimmer: 'sweep', valueFace: 'display', valueInk: c.ink,
  };
  switch (flavor) {
    case 'engraved':
      Object.assign(s, { round: 0, outline: { color: c.accent, w: .12 }, gradient: true, fillA: .9, gridDash: [1, 5], grid: alpha(c.accent, .28), axis: alpha(c.accent, .8), axisW: .1, lineW: .26, point: 'diamond', shimmer: 'sweep', ease: 'out' });
      s.series = [c.accent, ...ser.filter(x => x !== c.accent)];
      s.second = c.muted;
      break;
    case 'grid':
      Object.assign(s, { round: 0, mono: true, base: c.ink, gridW: .06, axis: c.ink, axisW: .16, lineW: .36, point: 'square', shimmer: 'breath', valueFace: 'display' });
      if (th.id === 'monoblue' || th.id === 'gengrid') s.base = blend(c.ink, c.ground, .42);
      if (th.id === 'editorial') { s.mono = false; s.round = .04; }
      if (th.id === 'quiet') { s.base = c.muted; s.lineW = .24; }
      s.second = th.id === 'editorial' ? c.accent2 : blend(c.ink, c.ground, .6);
      break;
    case 'geo':
      Object.assign(s, { round: th.id === 'memphis' || th.id === 'stickers' || th.id === 'atomic' ? .5 : th.id === 'cutpaper' || th.id === 'terrazzo' ? .18 : 0, ease: 'back', point: th.id === 'destijl' || th.id === 'bauhaus' ? 'square' : 'circle', lineW: .55, shimmer: 'breath', valueFace: 'display' });
      if (th.id !== 'cutpaper' && th.id !== 'terrazzo') s.outline = { color: th.dark ? '#000000' : c.ink, w: th.id === 'destijl' ? .38 : .2 };
      if (th.id === 'cutpaper' || th.id === 'memphis' || th.id === 'stickers') s.slab = { color: th.id === 'cutpaper' ? 'rgba(0,0,0,0.18)' : c.ink, dx: .45, dy: .45 };
      if (th.id === 'stickers') s.outline = { color: '#FFFFFF', w: .3 };
      break;
    case 'slab':
      Object.assign(s, { round: 0, slab: { color: th.id === 'youth' ? c.accent2 : c.ink, dx: .7, dy: .7 }, axisW: .3, axis: c.ink, gridW: .1, lineW: .7, point: 'square', ease: th.id === 'deconstruct' ? 'out' : 'step', shimmer: th.id === 'youth' ? 'jitter' : 'breath', valueFace: 'display' });
      if (th.id === 'youth') s.slab = { color: c.accent2, dx: .55, dy: .55 };
      break;
    case 'print':
      Object.assign(s, { round: 0, misreg: { color: ser[1] || c.accent2, dx: .32, dy: .22 }, texture: 'halftone', fillA: .92, lineW: .5, point: 'circle', shimmer: 'jitter', ease: 'out' });
      if (th.id === 'riso') s.series = [c.accent, c.accent2, c.ink];
      break;
    case 'hand':
      Object.assign(s, { round: .06, wobble: .28, texture: th.id === 'chalk' ? 'chalk' : 'hatch', lineW: .42, point: 'ring', shimmer: th.id === 'zine' ? 'jitter' : 'breath', gridDash: [6, 6], ease: 'out' });
      if (th.id === 'zine') { s.mono = true; s.base = c.ink; s.texture = 'hatch'; }
      if (th.id === 'stencil') { s.wobble = .12; s.texture = 'none'; s.glow = .5; }
      break;
    case 'neon':
      Object.assign(s, { round: .5, glow: 1.6, fillA: .85, lineW: .34, point: 'ring', shimmer: th.id === 'neonbrick' || th.id === 'vhs' ? 'flicker' : 'breath', grid: alpha(c.accent, .16), axis: alpha(c.accent, .6), axisW: .1, gradient: true, valueFace: 'display' });
      if (th.id === 'vhs') s.misreg = { color: c.accent2, dx: .35, dy: 0 };
      if (th.id === 'kinetic') { s.round = 0; s.glow = .6; s.mono = true; s.base = blend(c.ink, c.ground, .25); }
      break;
    case 'soft':
      Object.assign(s, { round: .32, gradient: true, fillA: .88, lineW: .4, point: 'circle', shimmer: 'sweep', ease: 'out' });
      if (th.dark) s.glow = .7;
      if (th.id === 'airy') { s.round = .5; s.lineW = .3; }
      break;
  }
  if (s.mono) s.series = [s.hi, s.base];
  // Number ink: accent when it reads strongly, otherwise ink.
  s.valueInk = contrast(c.accent, c.ground) >= 4.5 && flavor !== 'grid' ? c.accent : c.ink;
  cache.set(th.id, s);
  return s;
}

/** Colour for category i of n (mono styles highlight only `hiIndex`). */
export function markColor(s: ChartStyle, i: number, hiIndex: number, categorical: boolean): string {
  if (s.mono) return i === hiIndex ? s.hi : s.base;
  if (categorical) return s.series[i % s.series.length];
  return s.hi;
}

/** Colour readable on a panel surface (falls back to the panel ink). */
export function onPanel(th: SlideTheme, color: string): string {
  const p = th.c.panel;
  if (!/^#[0-9a-f]{6}$/i.test(p)) return color;
  return contrast(color, p) >= 3 ? color : th.c.panelInk;
}

export { contrast };
