// paperKit — the handmade look shared by the Lorea exhibit hall, its stations and its nuggets:
// paper stocks and inks as CSS variables, grain/fibre textures as inline SVG, watercolor washes,
// torn and deckled edges, tape, wobbly ink underlines, and hand-drawn motif glyphs.
import React, { useEffect } from 'react';
import type { ExhibitMaterials, InkKind, MotifGlyph, PaperKind } from '../../../services/loreaExhibits/loreaExhibitTypes';

export const PAPER: Record<PaperKind, { bg: string; edge: string; grain: number; fibre: boolean }> = {
  laid: { bg: '#efe6d1', edge: '#d9ccb0', grain: 0.9, fibre: false },
  cotton: { bg: '#f7f2e7', edge: '#e2d8c4', grain: 0.6, fibre: false },
  kraft: { bg: '#cfae84', edge: '#a9875e', grain: 1.1, fibre: true },
  vellum: { bg: '#f2ebdb', edge: '#ddd0b4', grain: 0.5, fibre: false },
  newsprint: { bg: '#e7e2d3', edge: '#c9c2ae', grain: 1.0, fibre: false },
  rag: { bg: '#ede4cf', edge: '#d3c5a5', grain: 1.0, fibre: true },
  parchment: { bg: '#e9d6ae', edge: '#c8ad7c', grain: 1.2, fibre: false },
  washi: { bg: '#f4efe3', edge: '#dcd3bf', grain: 0.5, fibre: true },
};

export const INK: Record<InkKind, string> = {
  'iron-gall': '#2a2236',
  sepia: '#4b3221',
  indigo: '#1f2b5c',
  vermilion: '#a8301d',
  carbon: '#1b1a19',
  verdigris: '#245e52',
};

export const HAND_FONT: Record<ExhibitMaterials['hand'], string> = {
  script: "'Caveat', 'Gochi Hand', cursive",
  print: "'Kalam', 'Gochi Hand', cursive",
  type: "'IM Fell English', 'Newsreader', Georgia, serif",
};

const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&family=Kalam:wght@400;700&family=IM+Fell+English:ital@0;1&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap';
/** Load the hall's hand and book faces once (they are not in the app shell). */
export function usePaperFonts() {
  useEffect(() => {
    if (document.querySelector('link[data-lorea-paper-fonts]')) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = FONT_HREF; l.setAttribute('data-lorea-paper-fonts', '');
    document.head.appendChild(l);
  }, []);
}

/** Paper grain (and optional fibres) as a tiling SVG data URI. */
export function grainUri(strength = 1, fibre = false, seed = 3): string {
  const a = (0.07 * strength).toFixed(3);
  const fib = fibre
    ? `<filter id='f'><feTurbulence type='fractalNoise' baseFrequency='0.012 0.35' numOctaves='2' seed='${seed + 7}'/><feColorMatrix values='0 0 0 0 0.35  0 0 0 0 0.28  0 0 0 0 0.18  0 0 0 0.9 -0.42'/></filter><rect width='100%' height='100%' filter='url(#f)' opacity='${(0.35 * strength).toFixed(2)}'/>`
    : '';
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='260' height='260'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' seed='${seed}' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.25  0 0 0 0 0.2  0 0 0 0 0.12  0 0 0 ${a} 0'/></filter><rect width='100%' height='100%' filter='url(#g)'/>${fib}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** CSS variables for an exhibit's materials, set on its root. */
export function materialVars(m: ExhibitMaterials): React.CSSProperties {
  const p = PAPER[m.paper];
  return {
    ['--lx-paper' as any]: p.bg,
    ['--lx-edge' as any]: p.edge,
    ['--lx-ink' as any]: INK[m.ink],
    ['--lx-wash1' as any]: m.wash[0],
    ['--lx-wash2' as any]: m.wash[1],
    ['--lx-accent' as any]: m.accent,
    ['--lx-hand' as any]: HAND_FONT[m.hand],
    ['--lx-grain' as any]: grainUri(p.grain, p.fibre),
  };
}

function rng(seed: number) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
export function seedOf(s: string): number { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

/** A torn-paper clip-path: straight-ish sides, ragged on the chosen edges. */
export function tornClip(seed: number, edges: { top?: boolean; bottom?: boolean; left?: boolean; right?: boolean } = { bottom: true }, depth = 1.6): string {
  const r = rng(seed); const pts: string[] = [];
  const n = 22; const j = () => (r() * depth).toFixed(2);
  for (let i = 0; i <= n; i++) pts.push(`${(i / n * 100).toFixed(2)}% ${edges.top ? j() : 0}%`);
  for (let i = 1; i <= n; i++) pts.push(`${edges.right ? (100 - +j()).toFixed(2) : 100}% ${(i / n * 100).toFixed(2)}%`);
  for (let i = n - 1; i >= 0; i--) pts.push(`${(i / n * 100).toFixed(2)}% ${edges.bottom ? (100 - +j()).toFixed(2) : 100}%`);
  for (let i = n - 1; i >= 1; i--) pts.push(`${edges.left ? j() : 0}% ${(i / n * 100).toFixed(2)}%`);
  return `polygon(${pts.join(',')})`;
}

/** A wobbly hand-drawn underline path for a box of width w. */
export function wobblePath(seed: number, w = 100, h = 8): string {
  const r = rng(seed); let d = `M1 ${h * 0.6}`;
  const steps = 5;
  for (let i = 1; i <= steps; i++) {
    const x = (i / steps) * (w - 2) + 1;
    d += ` Q${(x - w / steps / 2).toFixed(1)} ${(h * (0.2 + r() * 0.7)).toFixed(1)} ${x.toFixed(1)} ${(h * (0.45 + r() * 0.3)).toFixed(1)}`;
  }
  return d;
}

/** Render text with `marks` underlined in ink (first occurrence of each). */
export function InkMarks({ text, marks, seed = 1 }: { text: string; marks?: string[]; seed?: number }) {
  const ranges: Array<[number, number]> = [];
  for (const m of marks || []) {
    if (!m) continue;
    const at = text.indexOf(m);
    if (at >= 0 && !ranges.some(([a, b]) => at < b && at + m.length > a)) ranges.push([at, at + m.length]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const out: React.ReactNode[] = []; let cur = 0;
  ranges.forEach(([a, b], i) => {
    if (a > cur) out.push(text.slice(cur, a));
    out.push(
      <span key={i} className="lx-mark">
        {text.slice(a, b)}
        <svg viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden><path d={wobblePath(seed + i * 13)} /></svg>
      </span>,
    );
    cur = b;
  });
  if (cur < text.length) out.push(text.slice(cur));
  return <>{out}</>;
}

/** Hand-drawn motif glyphs, stroked in the current ink. */
export function Motif({ glyph, size = 56 }: { glyph: MotifGlyph; size?: number }) {
  const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const paths: Record<MotifGlyph, React.ReactNode> = {
    quill: <><path {...s} d="M46 6C30 10 18 24 13 44c8-6 15-9 22-10-5-1-8-2-10-4 9-2 16-8 21-24z" /><path {...s} d="M13 44 8 54" /><path {...s} d="M20 36c6-8 13-15 22-24" opacity=".6" /></>,
    press: <><rect {...s} x="10" y="30" width="36" height="16" rx="2" /><path {...s} d="M16 30V14h24v16M28 14V6M20 6h16M14 38h28" /></>,
    lyre: <><path {...s} d="M17 50c-6-12-6-30 2-40M39 50c6-12 6-30-2-40M15 16h26M14 50h28" /><path {...s} d="M23 16v34M28 16v34M33 16v34" opacity=".7" /></>,
    lantern: <><path {...s} d="M22 12h12l4 8v20l-4 8H22l-4-8V20z" /><path {...s} d="M28 4v8M24 4h8M28 26c-3 3-3 7 0 10 3-3 3-7 0-10z" /></>,
    mask: <><path {...s} d="M8 14c8 4 32 4 40 0 1 16-6 30-20 34C14 44 7 30 8 14z" /><path {...s} d="M16 24c3-2 6-2 9 0M31 24c3-2 6-2 9 0M20 36c5 3 11 3 16 0" /></>,
    arc: <><path {...s} d="M6 46C14 40 20 12 30 10s14 26 20 36" /><circle cx="30" cy="10" r="2.5" fill="currentColor" /><path {...s} d="M6 50h44" opacity=".5" /></>,
    metronome: <><path {...s} d="M20 50 26 8h4l6 42z" /><path {...s} d="M28 40 40 14" /><circle {...s} cx="35" cy="24" r="3" /><path {...s} d="M16 50h24" /></>,
    'type-case': <><rect {...s} x="8" y="12" width="40" height="32" rx="2" /><path {...s} d="M8 23h40M8 34h40M21 12v32M35 12v32" /><path {...s} d="M13 18h3M27 29h3M40 40h3" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 56 56" aria-hidden>{paths[glyph]}</svg>;
}

/** Shared CSS for anything made of paper. Scoped under .lx (hall) and .lx-scrap (nuggets). */
export const PAPER_CSS = `
.lx, .lx-scrap { --lx-body: 'EB Garamond', 'Newsreader', Georgia, serif; --lx-note: 'Caveat', 'Gochi Hand', cursive; }
.lx-sheet { position: relative; background-color: var(--lx-paper); background-image: var(--lx-grain); color: var(--lx-ink); }
.lx-wash { position: absolute; pointer-events: none; filter: blur(18px) saturate(1.1); opacity: .55; border-radius: 47% 53% 42% 58% / 55% 41% 59% 45%; mix-blend-mode: multiply; }
.lx-mark { position: relative; white-space: pre-wrap; }
.lx-mark > svg { position: absolute; left: -2%; width: 104%; bottom: -.32em; height: .5em; overflow: visible; pointer-events: none; }
.lx-mark > svg path { fill: none; stroke: var(--lx-accent); stroke-width: 2.4; stroke-linecap: round; opacity: .85; stroke-dasharray: 140; stroke-dashoffset: 140; animation: lx-draw .9s .2s ease-out forwards; vector-effect: non-scaling-stroke; }
@keyframes lx-draw { to { stroke-dashoffset: 0; } }
.lx-tape { position: absolute; width: 74px; height: 22px; background: rgba(240, 228, 190, .62); box-shadow: 0 1px 2px rgba(60,40,10,.12); backdrop-filter: blur(.5px); clip-path: polygon(3% 8%, 97% 0, 100% 90%, 1% 100%); }
.lx-stamp { display: inline-flex; align-items: center; gap: .35em; padding: .18em .6em; border: 2px solid var(--lx-accent); color: var(--lx-accent); border-radius: 4px; font: 700 .72rem/1 'Kalam', cursive; letter-spacing: .08em; text-transform: uppercase; transform: rotate(-2deg); opacity: .9; }
.lx-hand { font-family: var(--lx-hand); }
.lx-note { font-family: var(--lx-note); }
.lx-ink-in { animation: lx-ink-in 1.1s ease-out both; }
@keyframes lx-ink-in { from { opacity: 0; filter: blur(3px); clip-path: inset(0 100% 0 0); } to { opacity: 1; filter: blur(0); clip-path: inset(0 0 0 0); } }
@media (prefers-reduced-motion: reduce) { .lx-ink-in, .lx-mark > svg path { animation: none; stroke-dashoffset: 0; } }
`;
