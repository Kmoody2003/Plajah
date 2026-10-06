// Deterministic animation math for the film renderer. No Math.random: every frame must be
// reproducible so the live player and the exported MP4 match exactly.
import type { CamKey, Ease } from './filmTypes';

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0..1 progress of t through [a, b]. */
export const span = (t: number, a: number, b: number) => clamp((t - a) / Math.max(1e-6, b - a));

export function ease(kind: Ease | undefined, x: number): number {
  x = clamp(x);
  switch (kind) {
    case 'linear': return x;
    case 'in': return x * x * x;
    case 'out': return 1 - Math.pow(1 - x, 3);
    case 'outExpo': return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
    case 'outBack': { const c = 1.70158; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); }
    case 'inOutQuint': return x < .5 ? 16 * x ** 5 : 1 - Math.pow(-2 * x + 2, 5) / 2;
    case 'inOut': default: return x < .5 ? 4 * x ** 3 : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }
}

/** Fade envelope: in over `a` seconds, out over `b` seconds, inside a clip of length `d`. */
export const envelope = (t: number, d: number, a = .6, b = .6) => Math.min(span(t, 0, a), 1 - span(t, d - b, d));

/** Seeded hash → 0..1. */
export function hash(n: number): number {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** Smooth 1-D value noise, deterministic. */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(hash(i * 131 + seed * 7919), hash((i + 1) * 131 + seed * 7919), u);
}

/** Interpolate camera keys (t in 0..1 of the scene). */
export function camAt(keys: CamKey[], t: number): { x: number; y: number; zoom: number } {
  if (!keys.length) return { x: .5, y: .5, zoom: 1 };
  if (t <= keys[0].t) return keys[0];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (t <= b.t) {
      const k = ease(b.ease ?? 'inOut', span(t, a.t, b.t));
      return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), zoom: lerp(a.zoom, b.zoom, k) };
    }
  }
  return keys[keys.length - 1];
}

/** Draw an image covering (w,h), centred on (cx,cy) of the image, at a zoom ≥ 1. */
export function coverRect(iw: number, ih: number, w: number, h: number, cx: number, cy: number, zoom: number) {
  const s = Math.max(w / iw, h / ih) * zoom;
  const dw = iw * s, dh = ih * s;
  let x = w / 2 - cx * dw, y = h / 2 - cy * dh;
  x = Math.min(0, Math.max(w - dw, x));
  y = Math.min(0, Math.max(h - dh, y));
  return { x, y, w: dw, h: dh, s };
}

/** Split text into lines that fit `maxW` for the ctx's current font. */
export function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxW && line) { lines.push(line); line = w; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Split narration into caption chunks timed by word count. */
export function captionChunks(text: string, duration: number, maxWords = 11): Array<{ text: string; a: number; b: number }> {
  const sentences = text.split(/(?<=(?<!\b[A-Z])[.!?;:]["'\u201D\u2019)\]]*)\s+/).map(s => s.trim()).filter(Boolean);
  if (!sentences.length) sentences.push(text);
  const chunks: string[] = [];
  for (const s of sentences) {
    const w = s.split(/\s+/);
    for (let i = 0; i < w.length; i += maxWords) {
      const part = w.slice(i, i + maxWords);
      // Avoid a one-word orphan chunk.
      if (part.length < 3 && chunks.length && i > 0) chunks[chunks.length - 1] += ` ${part.join(' ')}`;
      else chunks.push(part.join(' '));
    }
  }
  const total = chunks.reduce((n, c) => n + c.split(/\s+/).length, 0) || 1;
  let t = 0;
  return chunks.map(c => {
    const d = duration * c.split(/\s+/).length / total;
    const r = { text: c, a: t, b: t + d };
    t += d;
    return r;
  });
}
