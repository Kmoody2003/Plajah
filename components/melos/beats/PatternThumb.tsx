// PatternThumb — tiny, readable previews of a groove: a drum-grid for step
// patterns and a piano-roll for basslines, each with a playhead that sweeps at
// the preset's tempo so a text-only list of names becomes a thumbnail wall you
// can read at a glance. Pure 2D canvas + a CSS-animated playhead (no audio, no
// GL), so a whole list renders cheaply.
import React, { useEffect, useRef } from 'react';
import type { Pattern } from '../../../services/melos/beats/grooveDoc';

// Playhead sweep keyframes, injected once (self-contained — no page stylesheet dependency).
if (typeof document !== 'undefined' && !document.getElementById('melos-pattern-thumb-kf')) {
  const el = document.createElement('style'); el.id = 'melos-pattern-thumb-kf';
  el.textContent = '@keyframes melosSweep{from{left:0}to{left:100%}}';
  document.head.appendChild(el);
}

// DEFAULT_KIT pad colours (grooveDoc), so a hit reads as its instrument.
const PAD_COLORS = ['#FF8C00', '#FF8C00', '#D40055', '#D40055', '#00DAF3', '#00DAF3', '#00DAF3', '#D0BCFF', '#F5F0FA', '#F5F0FA', '#F5F0FA', '#F5F0FA', '#D0BCFF', '#D0BCFF', '#D0BCFF', '#D0BCFF'];

// GenrePreset.make() builds a fresh Pattern (with a random id) on every call, so
// cache one per preset id — for stable identity and to avoid rebuilding per render.
const _patCache = new Map<string, Pattern>();
export function cachedPattern(id: string, make: () => Pattern): Pattern {
  let p = _patCache.get(id); if (!p) { p = make(); _patCache.set(id, p); } return p;
}

const barSeconds = (bpm?: number, length = 16) => Math.max(0.6, (length / 4) * 60 / Math.max(60, bpm || 120));

const Playhead: React.FC<{ seconds: number }> = ({ seconds }) => (
  <span aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, width: 2, left: 0, background: 'rgba(255,255,255,.85)', boxShadow: '0 0 6px rgba(255,255,255,.6)', animation: `melosSweep ${seconds}s linear infinite`, pointerEvents: 'none' }} />
);

function useGrid(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const W = 176, H = 96; if (c.width !== W) { c.width = W; c.height = H; }
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, W, H); draw(ctx, W, H);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

/** Drum-grid thumbnail: only the pads that actually fire, so the pattern reads clearly. */
export const DrumPatternThumb: React.FC<{ pattern: Pattern; bpm?: number; className?: string; style?: React.CSSProperties }> = ({ pattern, bpm, className, style }) => {
  const len = pattern.length || 16;
  const pads = Object.keys(pattern.steps || {}).map(Number).filter(p => Object.keys(pattern.steps[p] || {}).length).sort((a, b) => a - b);
  const ref = useGrid((ctx, W, H) => {
    ctx.fillStyle = '#0d0b12'; ctx.fillRect(0, 0, W, H);
    const rows = Math.max(1, pads.length);
    const cw = W / len, ch = H / rows, gap = 1;
    for (let r = 0; r < rows; r++) {
      const pad = pads[r]; const col = PAD_COLORS[pad % PAD_COLORS.length];
      for (let s = 0; s < len; s++) {
        const step = pattern.steps[pad]?.[s];
        const beat = s % 4 === 0;
        ctx.fillStyle = beat ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.03)';
        ctx.fillRect(s * cw, r * ch, cw - gap, ch - gap);
        if (step) { ctx.globalAlpha = 0.35 + 0.65 * ((step.v || 100) / 127); ctx.fillStyle = col; ctx.fillRect(s * cw, r * ch, cw - gap, ch - gap); ctx.globalAlpha = 1; }
      }
    }
  }, [pattern, len]);
  return <span className={className} style={{ position: 'relative', display: 'block', ...style }}><canvas ref={ref} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 4 }} /><Playhead seconds={barSeconds(bpm, len)} /></span>;
};

/** Piano-roll thumbnail for a bassline (step × semitone, bar width = note length). */
export const BasslineThumb: React.FC<{ notes: { step: number; semi: number; len: number; v?: number }[]; bpm?: number; length?: number; className?: string; style?: React.CSSProperties }> = ({ notes, bpm, length = 16, className, style }) => {
  const ref = useGrid((ctx, W, H) => {
    ctx.fillStyle = '#0d0b12'; ctx.fillRect(0, 0, W, H);
    for (let s = 0; s < length; s++) { ctx.fillStyle = s % 4 === 0 ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.025)'; ctx.fillRect(s * (W / length), 0, W / length - 1, H); }
    if (!notes.length) return;
    const semis = notes.map(n => n.semi); let lo = Math.min(...semis), hi = Math.max(...semis); if (hi - lo < 6) { lo -= 3; hi += 3; }
    const span = Math.max(1, hi - lo), cw = W / length, rh = H / (span + 1);
    for (const n of notes) {
      const y = H - (n.semi - lo + 1) * rh;
      ctx.globalAlpha = 0.45 + 0.55 * ((n.v || 100) / 127); ctx.fillStyle = '#D40055';
      ctx.fillRect(n.step * cw + 0.5, y, Math.max(2, n.len * cw - 1.5), Math.max(3, rh - 1)); ctx.globalAlpha = 1;
    }
  }, [notes, length]);
  return <span className={className} style={{ position: 'relative', display: 'block', ...style }}><canvas ref={ref} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 4 }} /><Playhead seconds={barSeconds(bpm, length)} /></span>;
};
