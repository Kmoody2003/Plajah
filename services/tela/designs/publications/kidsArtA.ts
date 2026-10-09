// kidsArtA — shared procedural-illustration toolkit for the children's picture-book
// templates "Orbit Party" (story-space) and "Little Fox, Big Trees" (story-forest).
//
// Everything here is deterministic vector art: torn / chiselled edges by midpoint
// displacement, sticker outlines, off-register print offsets, per-letter lettered
// titles, and text blocks whose width comes from a measured advance table so they
// can sit exactly inside the art that carries them.
import type { TelaVectorObject } from '../../../../types';
import { rect, ellipse, circle, path, text, line, mix, type ShapeOpts } from '../../templateKit';
import { rng } from '../../ornaments';
import type { FontKey } from '../../telaFonts';

export type Pt = [number, number];
export type WKey = 'chango' | 'slackey' | 'fredoka6' | 'andika7';

// Advance widths in em for  A-Z a-z 0-9 space . , ! ? ' - : ;  (measured in Chrome).
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!?\'-:;';
const RAW: Record<WKey, string> = {
  chango: '1.08,0.97,0.82,0.9,0.84,0.81,0.88,1.09,0.54,0.66,1.05,0.86,1.12,0.96,1.04,0.89,1.08,0.91,0.81,0.84,0.88,0.96,1.42,1.03,0.95,0.84,0.8,0.81,0.68,0.83,0.74,0.61,0.83,0.86,0.44,0.46,0.85,0.44,1.28,0.86,0.83,0.81,0.83,0.66,0.65,0.66,0.86,0.77,1.14,0.81,0.77,0.68,0.88,0.6,0.85,0.8,0.9,0.77,0.85,0.79,0.81,0.84,0.4,0.37,0.37,0.5,0.68,0.35,0.51,0.37,0.37',
  slackey: '0.74,0.85,0.72,0.83,0.64,0.66,0.77,0.76,0.51,0.61,0.78,0.56,0.97,0.91,0.93,0.84,0.95,0.82,0.83,0.67,0.87,0.7,0.94,0.74,0.8,0.76,0.79,0.84,0.71,0.78,0.74,0.46,0.75,0.75,0.32,0.31,0.67,0.3,1.03,0.67,0.82,0.79,0.8,0.62,0.64,0.48,0.76,0.63,0.88,0.62,0.78,0.6,0.71,0.42,0.65,0.67,0.68,0.69,0.69,0.59,0.7,0.7,0.4,0.24,0.27,0.32,0.64,0.22,0.44,0.25,0.28',
  fredoka6: '0.71,0.62,0.64,0.67,0.61,0.62,0.72,0.66,0.23,0.54,0.6,0.57,0.81,0.68,0.73,0.6,0.79,0.61,0.55,0.65,0.69,0.73,0.95,0.69,0.64,0.59,0.56,0.56,0.51,0.57,0.54,0.41,0.55,0.55,0.24,0.24,0.5,0.3,0.8,0.56,0.56,0.55,0.55,0.42,0.46,0.41,0.56,0.56,0.75,0.52,0.56,0.54,0.57,0.38,0.58,0.57,0.55,0.5,0.53,0.53,0.55,0.53,0.24,0.22,0.22,0.24,0.48,0.19,0.41,0.23,0.22',
  andika7: '0.73,0.68,0.68,0.73,0.59,0.59,0.72,0.74,0.51,0.5,0.7,0.55,0.91,0.75,0.73,0.62,0.75,0.67,0.61,0.62,0.73,0.72,1.04,0.67,0.67,0.61,0.61,0.59,0.5,0.62,0.54,0.39,0.58,0.6,0.31,0.33,0.56,0.31,0.86,0.61,0.57,0.6,0.59,0.49,0.51,0.43,0.61,0.54,0.77,0.58,0.54,0.52,0.61,0.61,0.61,0.61,0.61,0.61,0.61,0.61,0.61,0.61,0.27,0.35,0.32,0.38,0.53,0.31,0.44,0.35,0.35',
};
const TABLE: Record<WKey, Record<string, number>> = {} as any;
(Object.keys(RAW) as WKey[]).forEach(k => { const vals = RAW[k].split(',').map(Number); const m: Record<string, number> = {}; Array.from(CHARS).forEach((c, i) => { m[c] = vals[i] ?? .6; }); TABLE[k] = m; });
export const FONT_OF: Record<WKey, FontKey> = { chango: 'chango', slackey: 'slackey', fredoka6: 'fredoka', andika7: 'andika' };
export const adv = (wk: WKey, ch: string) => TABLE[wk][ch] ?? .6;
export const tw = (wk: WKey, s: string, size: number) => Array.from(s).reduce((a, c) => a + adv(wk, c), 0) * size;
export const maxLineW = (wk: WKey, lines: string[], size: number) => Math.max(...lines.map(l => tw(wk, l, size)));
/** Largest size (<= max) at which `s` fits in `w`. */
export const fitSize = (wk: WKey, s: string, w: number, max: number) => Math.min(max, Math.floor(w / (tw(wk, s, 1) || 1)));

const f1 = (n: number) => Math.round(n * 10) / 10;
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ── Points → PATH ─────────────────────────────────────────────────────────────
export function poly(pts: Pt[], fill: string, o: ShapeOpts & { open?: boolean } = {}): TelaVectorObject {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
  const d = 'M' + pts.map(p => `${f1(p[0])} ${f1(p[1])}`).join(' L') + (o.open ? '' : ' Z');
  return path(x0, y0, w, h, d, fill, { ...o, origin: { x: x0, y: y0, w, h } });
}
/** Several closed rings in one PATH (even-odd fill) — good for one-draw jagged marks. */
export function multiPoly(rings: Pt[][], fill: string, o: ShapeOpts = {}): TelaVectorObject {
  const all = rings.flat(); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of all) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
  const d = rings.map(r => 'M' + r.map(p => `${f1(p[0])} ${f1(p[1])}`).join(' L') + ' Z').join(' ');
  return path(x0, y0, w, h, d, fill, { ...o, origin: { x: x0, y: y0, w, h } });
}

/** Midpoint displacement — the torn / chiselled edge. */
export function jitter(pts: Pt[], seed: number, rough: number, passes = 3, closed = true): Pt[] {
  const r = rng(seed); let cur = pts; let amp = rough;
  for (let p = 0; p < passes; p++) {
    const next: Pt[] = []; const n = cur.length; const lim = closed ? n : n - 1;
    for (let i = 0; i < n; i++) {
      const a = cur[i], b = cur[(i + 1) % n]; next.push(a);
      if (i < lim) { const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1; const off = (r() - .5) * 2 * amp * Math.min(1, len / (rough * 3 + 1)); next.push([(a[0] + b[0]) / 2 - dy / len * off, (a[1] + b[1]) / 2 + dx / len * off]); }
    }
    cur = next; amp *= .55;
  }
  return cur;
}
export function circlePts(cx: number, cy: number, r: number, n = 14, ry = r): Pt[] { return Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2; return [cx + r * Math.cos(a), cy + ry * Math.sin(a)] as Pt; }); }
export function rectPts(x: number, y: number, w: number, h: number, per = 3): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < per; i++) out.push([x + w * i / per, y]); for (let i = 0; i < per; i++) out.push([x + w, y + h * i / per]);
  for (let i = 0; i < per; i++) out.push([x + w - w * i / per, y + h]); for (let i = 0; i < per; i++) out.push([x, y + h - h * i / per]);
  return out;
}
export const tornCircle = (cx: number, cy: number, r: number, seed: number, rough = r * .05, passes = 3) => jitter(circlePts(cx, cy, r, 12), seed, rough, passes);
export const tornRect = (x: number, y: number, w: number, h: number, seed: number, rough = 6, passes = 3) => jitter(rectPts(x, y, w, h, 3), seed, rough, passes);

export const SHADOW = { x: 3, y: 5, blur: 4, color: 'rgba(8,0,18,.38)' };
export const PAPER_EDGE = '#F7F1E3';

/** Torn cut-paper disc: ragged edge, pale paper fringe, soft contact shadow. */
export function tornDisc(cx: number, cy: number, r: number, fill: string, seed: number, o: { fringe?: string; shadow?: boolean; rough?: number; opacity?: number } = {}): TelaVectorObject {
  return poly(tornCircle(cx, cy, r, seed, o.rough ?? Math.max(2, r * .045)), fill, { stroke: o.fringe ?? PAPER_EDGE, strokeWidth: o.fringe === 'none' ? 0 : 3.5, shadow: o.shadow === false ? undefined : SHADOW, opacity: o.opacity, label: 'Cut-paper disc' });
}
export function tornSheet(x: number, y: number, w: number, h: number, fill: string, seed: number, o: { fringe?: string; shadow?: boolean; rough?: number; rotation?: number; opacity?: number; label?: string } = {}): TelaVectorObject {
  return poly(tornRect(x, y, w, h, seed, o.rough ?? 5), fill, { stroke: o.fringe ?? PAPER_EDGE, strokeWidth: o.fringe === 'none' ? 0 : 3.5, shadow: o.shadow === false ? undefined : SHADOW, rotation: o.rotation, opacity: o.opacity, label: o.label || 'Torn paper' });
}

/** Union outline of many circles (sticker edge): outline pass then fill pass. */
export function stickerCircles(cs: Array<[number, number, number]>, fill: string, outline: string, ow: number, o: { shadow?: boolean } = {}): TelaVectorObject[] {
  const out: TelaVectorObject[] = [];
  cs.forEach(([x, y, r], i) => out.push(circle(x, y, r + ow, outline, { shadow: o.shadow !== false && i === 0 ? SHADOW : undefined, label: 'Sticker outline' })));
  cs.forEach(([x, y, r]) => out.push(circle(x, y, r, fill, { label: 'Sticker body' })));
  return out;
}

/** Cloud of circles (text-as-shape). */
export function cloud(cx: number, cy: number, w: number, h: number, fill: string, outline: string, seed: number, bumps = 11): TelaVectorObject[] {
  const r = rng(seed); const cs: Array<[number, number, number]> = [];
  for (let i = 0; i < bumps; i++) {
    const a = i / bumps * Math.PI * 2 + r() * .2; const rr = Math.min(w, h) * (.2 + r() * .08);
    cs.push([cx + Math.cos(a) * (w / 2 - rr * .9), cy + Math.sin(a) * (h / 2 - rr * .9), rr]);
  }
  cs.push([cx, cy, Math.min(w, h) * .42]);
  const out = stickerCircles(cs, fill, outline, 7);
  out.push(rect(cx - w * .32, cy - h * .3, w * .64, h * .6, fill, { rx: h * .2, label: 'Cloud core' }));
  return out;
}

// ── Crescent shading (planet shadow side) ─────────────────────────────────────
export function crescent(cx: number, cy: number, r: number, ux: number, uy: number, d: number): Pt[] {
  const bx = cx + ux * d, by = cy + uy * d, N = 120;
  const arcA: Pt[] = [], keepA: boolean[] = [];
  for (let k = 0; k < N; k++) { const a = k / N * Math.PI * 2; const p: Pt = [cx + r * Math.cos(a), cy + r * Math.sin(a)]; arcA.push(p); keepA.push(Math.hypot(p[0] - bx, p[1] - by) >= r); }
  const walk = (pts: Pt[], keep: boolean[]) => { const n = pts.length; let s = -1; for (let i = 0; i < n; i++) if (keep[i] && !keep[(i - 1 + n) % n]) { s = i; break; } if (s < 0) return [] as Pt[]; const out: Pt[] = []; for (let k = 0; k < n; k++) { const i = (s + k) % n; if (!keep[i]) break; out.push(pts[i]); } return out; };
  const L1 = walk(arcA, keepA); if (L1.length < 3) return [];
  const arcB: Pt[] = [], keepB: boolean[] = [];
  for (let k = 0; k < N; k++) { const a = k / N * Math.PI * 2; const p: Pt = [bx + r * Math.cos(a), by + r * Math.sin(a)]; arcB.push(p); keepB.push(Math.hypot(p[0] - cx, p[1] - cy) <= r); }
  let L2 = walk(arcB, keepB); if (!L2.length) return L1;
  const last = L1[L1.length - 1]; const dist = (p: Pt) => Math.hypot(p[0] - last[0], p[1] - last[1]);
  if (dist(L2[0]) > dist(L2[L2.length - 1])) L2 = L2.slice().reverse();
  return [...L1, ...L2];
}

// ── Texture sprinkles (each is ONE path, so a page stays light) ───────────────
export type Dot = [number, number, number, number?, number?]; // x, y, rx, ry, rotation°
export function dots(list: Dot[], fill: string, o: ShapeOpts & { stroke?: string } = {}): TelaVectorObject[] {
  if (!list.length) return [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; let d = '';
  for (const [x, y, rx, ry = rx, rot = 0] of list) {
    x0 = Math.min(x0, x - rx); y0 = Math.min(y0, y - rx); x1 = Math.max(x1, x + rx); y1 = Math.max(y1, y + rx); y0 = Math.min(y0, y - ry); y1 = Math.max(y1, y + ry);
    d += `M${f1(x - rx)} ${f1(y)}A${f1(rx)} ${f1(ry)} ${rot} 1 0 ${f1(x + rx)} ${f1(y)}A${f1(rx)} ${f1(ry)} ${rot} 1 0 ${f1(x - rx)} ${f1(y)}Z`;
  }
  const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
  return [path(x0, y0, w, h, d, fill, { ...o, origin: { x: x0, y: y0, w, h } })];
}
export function flecks(x: number, y: number, w: number, h: number, count: number, colors: string[], seed: number, size = 3, op = .55): TelaVectorObject[] {
  const r = rng(seed); const by: Dot[][] = colors.map(() => []);
  for (let i = 0; i < count; i++) { const s = size * (.4 + r() * 1.3); by[i % colors.length].push([x + r() * w, y + r() * h, s * (1 + r()), s, r() * 180]); }
  return by.flatMap((l, i) => dots(l, colors[i], { opacity: op, label: 'Paper flecks' }));
}
export function halftone(x: number, y: number, w: number, h: number, step: number, color: string, o: { grade?: 'x' | 'y'; max?: number; min?: number; opacity?: number; flip?: boolean } = {}): TelaVectorObject[] {
  const list: Dot[] = []; const cols = Math.floor(w / step), rows = Math.floor(h / step);
  for (let rr = 0; rr < rows; rr++) for (let c = 0; c < cols; c++) {
    let t = o.grade === 'x' ? c / Math.max(1, cols - 1) : rr / Math.max(1, rows - 1); if (o.flip) t = 1 - t;
    const rad = lerp(o.min ?? step * .06, o.max ?? step * .42, t);
    list.push([x + c * step + step / 2 + (rr % 2 ? step / 2 : 0), y + rr * step + step / 2, rad]);
  }
  return dots(list, color, { opacity: o.opacity, label: 'Halftone dots' });
}

// ── Lettering ─────────────────────────────────────────────────────────────────
export interface LetterOpts { colors: string[]; outline: string; ow: number; shadow?: string; sx?: number; sy?: number; bounce?: number; rot?: number; track?: number; seed?: number; weight?: number; label?: string; x?: number; align?: 'center' | 'left' }
/** A hand-lettered title: every glyph its own object, bounced, tilted, outlined and shadowed. */
export function lettered(cx: number, y: number, str: string, size: number, wk: WKey, o: LetterOpts): TelaVectorObject[] {
  const r = rng(o.seed ?? 5); const font = FONT_OF[wk]; const track = o.track ?? 0;
  const total = Array.from(str).reduce((a, c) => a + adv(wk, c) * size + track, 0) - track;
  let px = o.align === 'left' ? (o.x ?? cx) : cx - total / 2; const faces: TelaVectorObject[] = []; const shadows: TelaVectorObject[] = []; let ci = 0;
  for (const ch of Array.from(str)) {
    const w = adv(wk, ch) * size;
    if (ch !== ' ') {
      const dy = ((ci % 2 ? 1 : -1) * (.4 + r() * .6)) * (o.bounce ?? 0), rot = (r() - .5) * 2 * (o.rot ?? 0);
      const base = { size, font, weight: o.weight ?? 400, align: 'center' as const, wrap: false, h: size * 1.2, rotation: rot, label: o.label || 'Lettered title', role: 'HEADLINE' as const };
      if (o.shadow) shadows.push(text(px, y + dy + (o.sy ?? 7), w, ch, { ...base, label: `${base.label} shadow`, color: o.shadow, stroke: o.shadow, strokeWidth: o.ow }));
      if (o.shadow && o.sx) shadows[shadows.length - 1].x += o.sx;
      faces.push(text(px, y + dy, w, ch, { ...base, color: o.colors[ci % o.colors.length], stroke: o.outline, strokeWidth: o.ow }));
      ci++;
    }
    px += w + track;
  }
  return [...shadows, ...faces];
}

export interface BlockOpts { align?: 'left' | 'center' | 'right'; lh?: number; weight?: number; rotation?: number; stroke?: string; sw?: number; opacity?: number; label?: string; role?: TelaVectorObject['templateRole'] }
/** Pre-broken body copy. Width comes from `w`, height from the line count. */
export function block(x: number, y: number, w: number, lines: string[], size: number, wk: WKey, color: string, o: BlockOpts = {}): TelaVectorObject {
  const lh = o.lh ?? 1.38;
  return text(x, y, w, lines.join('\n'), { size, font: FONT_OF[wk], weight: o.weight ?? (wk === 'fredoka6' ? 600 : wk === 'andika7' ? 700 : 400), color, align: o.align ?? 'left', leading: lh, wrap: false, h: Math.ceil(lines.length * size * lh), rotation: o.rotation, stroke: o.stroke, strokeWidth: o.sw, opacity: o.opacity, label: o.label || 'Story text', role: o.role || 'BODY' });
}
export const blockH = (lines: string[], size: number, lh = 1.38) => lines.length * size * lh;
/** Visual centring: a block's glyphs sit ~.12em lower than the box centre. */
export function blockAt(cx: number, cy: number, lines: string[], size: number, wk: WKey, color: string, o: BlockOpts = {}): TelaVectorObject {
  const w = maxLineW(wk, lines, size) + 8, h = blockH(lines, size, o.lh ?? 1.38);
  return block(cx - w / 2, cy - h / 2 - size * .02, w, lines, size, wk, color, { ...o, align: 'center' });
}

export function arcPts(cx: number, cy: number, r: number, a0: number, a1: number, n = 14): Pt[] { return Array.from({ length: n + 1 }, (_, i) => { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Pt; }); }
export const arcLine = (cx: number, cy: number, r: number, a0: number, a1: number, color: string, w: number, o: ShapeOpts = {}) => poly(arcPts(cx, cy, r, a0, a1), 'none', { ...o, open: true, stroke: color, strokeWidth: w, label: o.label || 'Smile' });

export { rect, ellipse, circle, line, mix };
