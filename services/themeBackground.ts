/**
 * Synthetic theme backgrounds: solids, gradients (linear / radial / conic / mesh) and patterns.
 * Photos, videos and slideshows already flow through ProfileThemePreset.assets; this covers
 * everything that can be drawn with CSS alone, so it costs no bandwidth and never blocks paint.
 *
 * Tela can author any of these (and photo/video assets): the studio's "Make in Tela" actions
 * hand Tela a brief and get back a spec or an asset URL — see components/settings/ThemeStudio.tsx.
 */
import { hexToRgb, relLuminance, hexToHsl, hslToHex } from './themePalette';

export type GradientKind = 'linear' | 'radial' | 'conic' | 'mesh' | 'aurora';
export interface GradientStop { color: string; pos: number }
export interface GradientSpec { kind: GradientKind; angle: number; stops: GradientStop[] }

export type PatternId = 'dots' | 'grid' | 'diagonal' | 'checks' | 'waves' | 'topo' | 'crosses' | 'paper' | 'hex';
export interface PatternSpec { id: PatternId; fg: string; bg: string; scale: number; opacity: number }

export type ThemeBackground =
  | { kind: 'default' }
  | { kind: 'solid'; color: string }
  | { kind: 'gradient'; gradient: GradientSpec }
  | { kind: 'pattern'; pattern: PatternSpec }
  | { kind: 'media' }; // photos / videos / slideshow from ProfileThemePreset.assets

export interface GradientPreset { id: string; name: string; gradient: GradientSpec }

const g = (kind: GradientKind, angle: number, ...colors: string[]): GradientSpec => ({
  kind, angle, stops: colors.map((color, i) => ({ color, pos: Math.round((i / Math.max(1, colors.length - 1)) * 100) })),
});

export const GRADIENT_PRESETS: GradientPreset[] = [
  { id: 'dusk',     name: 'Dusk',        gradient: g('linear', 160, '#1b1038', '#6b0099', '#ff8c00') },
  { id: 'ocean',    name: 'Deep ocean',  gradient: g('linear', 180, '#021b2d', '#0a4d68', '#088395') },
  { id: 'sunrise',  name: 'Sunrise',     gradient: g('linear', 200, '#ffd6a5', '#ffb4a2', '#e5989b') },
  { id: 'meadow',   name: 'Meadow',      gradient: g('linear', 150, '#d8f3dc', '#95d5b2', '#52b788') },
  { id: 'glow',     name: 'Soft glow',   gradient: g('radial', 0, '#fff7ed', '#fed7aa', '#fdba74') },
  { id: 'nebula',   name: 'Nebula',      gradient: g('radial', 0, '#312e81', '#1e1b4b', '#020617') },
  { id: 'prism',    name: 'Prism',       gradient: g('conic', 0, '#ff5f6d', '#ffc371', '#7bed9f', '#70a1ff', '#a29bfe', '#ff5f6d') },
  { id: 'mesh-sky', name: 'Mesh · sky',  gradient: g('mesh', 0, '#93c5fd', '#c4b5fd', '#fdba74', '#fbcfe8') },
  { id: 'mesh-ember', name: 'Mesh · ember', gradient: g('mesh', 0, '#7f1d1d', '#9a3412', '#4c1d95', '#0f172a') },
  { id: 'aurora',   name: 'Aurora',      gradient: g('aurora', 0, '#0b132b', '#1c7c54', '#6a4c93', '#3a86ff') },
  { id: 'slate',    name: 'Slate fade',  gradient: g('linear', 180, '#e2e8f0', '#cbd5e1', '#94a3b8') },
  { id: 'rose',     name: 'Rose quartz', gradient: g('linear', 135, '#fce7f3', '#fbcfe8', '#f9a8d4') },
];

export const PATTERN_LIST: { id: PatternId; name: string }[] = [
  { id: 'dots', name: 'Dots' }, { id: 'grid', name: 'Grid' }, { id: 'diagonal', name: 'Diagonal' },
  { id: 'checks', name: 'Checks' }, { id: 'waves', name: 'Waves' }, { id: 'topo', name: 'Topographic' },
  { id: 'crosses', name: 'Crosses' }, { id: 'paper', name: 'Paper grain' }, { id: 'hex', name: 'Hex' },
];

const enc = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

function patternImage(p: PatternSpec): { image: string; size: string } {
  const s = Math.max(8, p.scale);
  const rgb = hexToRgb(p.fg);
  const c = rgb ? `rgba(${rgb.r},${rgb.g},${rgb.b},${p.opacity})` : p.fg;
  switch (p.id) {
    case 'dots':     return { image: enc(`<svg xmlns='http://www.w3.org/2000/svg' width='${s}' height='${s}'><circle cx='${s / 2}' cy='${s / 2}' r='${s / 9}' fill='${c}'/></svg>`), size: `${s}px ${s}px` };
    case 'grid':     return { image: enc(`<svg xmlns='http://www.w3.org/2000/svg' width='${s}' height='${s}'><path d='M${s} 0H0V${s}' fill='none' stroke='${c}' stroke-width='1'/></svg>`), size: `${s}px ${s}px` };
    case 'diagonal': return { image: enc(`<svg xmlns='http://www.w3.org/2000/svg' width='${s}' height='${s}'><path d='M0 ${s}L${s} 0' stroke='${c}' stroke-width='1.5'/></svg>`), size: `${s}px ${s}px` };
    case 'checks':   return { image: enc(`<svg xmlns='http://www.w3.org/2000/svg' width='${s * 2}' height='${s * 2}'><rect width='${s}' height='${s}' fill='${c}'/><rect x='${s}' y='${s}' width='${s}' height='${s}' fill='${c}'/></svg>`), size: `${s * 2}px ${s * 2}px` };
    case 'waves':    return { image: enc(`<svg xmlns='http://www.w3.org/2000/svg' width='${s * 2}' height='${s}'><path d='M0 ${s / 2}Q${s / 2} 0 ${s} ${s / 2}T${s * 2} ${s / 2}' fill='none' stroke='${c}' stroke-width='1.5'/></svg>`), size: `${s * 2}px ${s}px` };
    case 'topo':     return { image: enc(`<svg xmlns='http://www.w3.org/2000/svg' width='${s * 3}' height='${s * 3}'><g fill='none' stroke='${c}' stroke-width='1'><circle cx='${s * 1.5}' cy='${s * 1.5}' r='${s * 0.4}'/><circle cx='${s * 1.5}' cy='${s * 1.5}' r='${s * 0.8}'/><circle cx='${s * 1.5}' cy='${s * 1.5}' r='${s * 1.2}'/></g></svg>`), size: `${s * 3}px ${s * 3}px` };
    case 'crosses':  return { image: enc(`<svg xmlns='http://www.w3.org/2000/svg' width='${s}' height='${s}'><path d='M${s / 2 - 3} ${s / 2}H${s / 2 + 3}M${s / 2} ${s / 2 - 3}V${s / 2 + 3}' stroke='${c}' stroke-width='1.5'/></svg>`), size: `${s}px ${s}px` };
    case 'hex':      return { image: enc(`<svg xmlns='http://www.w3.org/2000/svg' width='${s * 1.73}' height='${s * 3}'><path d='M${s * 0.865} 0L${s * 1.73} ${s * 0.5}V${s * 1.5}L${s * 0.865} ${s * 2}L0 ${s * 1.5}V${s * 0.5}Z' fill='none' stroke='${c}' stroke-width='1'/></svg>`), size: `${s * 1.73}px ${s * 3}px` };
    case 'paper':    return { image: enc(`<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .5 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`), size: '160px 160px' };
  }
}

const stopsCss = (st: GradientStop[]) => st.map(s => `${s.color} ${s.pos}%`).join(', ');

export function gradientCss(gr: GradientSpec): string {
  const st = gr.stops.length ? gr.stops : [{ color: '#000', pos: 0 }, { color: '#fff', pos: 100 }];
  switch (gr.kind) {
    case 'linear': return `linear-gradient(${gr.angle}deg, ${stopsCss(st)})`;
    case 'radial': return `radial-gradient(ellipse at 50% 35%, ${stopsCss(st)})`;
    case 'conic':  return `conic-gradient(from ${gr.angle}deg at 50% 50%, ${stopsCss(st)})`;
    case 'mesh': {
      // Layered soft radial blobs, one per stop — the "mesh" look without a canvas.
      const spots = [[18, 12], [82, 18], [22, 86], [84, 80], [50, 50]];
      const layers = st.map((s, i) => `radial-gradient(ellipse 60% 55% at ${spots[i % spots.length][0]}% ${spots[i % spots.length][1]}%, ${s.color} 0%, transparent 70%)`);
      return `${layers.join(', ')}, ${st[0].color}`;
    }
    case 'aurora': {
      const [a, b, c, d] = [st[0], st[1] ?? st[0], st[2] ?? st[0], st[3] ?? st[0]].map(s => s.color);
      return `radial-gradient(ellipse 120% 50% at 20% 105%, ${b}cc 0%, transparent 60%), radial-gradient(ellipse 100% 45% at 80% 100%, ${c}b3 0%, transparent 60%), radial-gradient(ellipse 80% 40% at 50% 70%, ${d}66 0%, transparent 65%), linear-gradient(180deg, ${a} 0%, ${a} 100%)`;
    }
  }
}

export interface BackgroundCss { background?: string; backgroundColor?: string; backgroundImage?: string; backgroundSize?: string; backgroundBlendMode?: string }

export function backgroundCss(bg: ThemeBackground | undefined): BackgroundCss | null {
  if (!bg || bg.kind === 'default' || bg.kind === 'media') return null;
  if (bg.kind === 'solid') return { backgroundColor: bg.color };
  if (bg.kind === 'gradient') return { background: gradientCss(bg.gradient) };
  const p = bg.pattern;
  const { image, size } = patternImage(p);
  return { backgroundColor: p.bg, backgroundImage: image, backgroundSize: size };
}

/** Average luminance (0..1) of a synthetic background, so the scrim/ink engine needs no sampling. */
export function backgroundLuminance(bg: ThemeBackground | undefined): number | null {
  if (!bg || bg.kind === 'default' || bg.kind === 'media') return null;
  const lum = (hex: string) => { const r = hexToRgb(hex); return r ? relLuminance(r) : 0; };
  if (bg.kind === 'solid') return lum(bg.color);
  if (bg.kind === 'pattern') return lum(bg.pattern.bg) * (1 - 0.1) + lum(bg.pattern.fg) * 0.1;
  const st = bg.gradient.stops;
  return st.length ? st.reduce((a, s) => a + lum(s.color), 0) / st.length : 0.2;
}

/** A pleasant gradient straight from a palette (used by the "match my palette" button). */
export function gradientFromPalette(a: string, b: string, c: string): GradientSpec {
  const dark = hexToHsl(a);
  const deep = hslToHex({ h: dark.h, s: Math.min(0.6, dark.s), l: 0.1 });
  return { kind: 'mesh', angle: 0, stops: [{ color: deep, pos: 0 }, { color: b, pos: 35 }, { color: c, pos: 70 }, { color: a, pos: 100 }] };
}

export const DEFAULT_PATTERN: PatternSpec = { id: 'dots', fg: '#ffffff', bg: '#0b0b0e', scale: 28, opacity: 0.12 };
