// motifKit — small, allocation-light helpers for the modern / urban theme
// families (themesModernA/B, themesUrban). Kept separate from themes.ts so the
// new theme files never import back into it (no module cycle).
//
// Texture rule: grain, halftone, scanlines, grids and brick are each ONE
// compound PATH (hundreds of sub-shapes in a single svg `d`), so a busy ground
// costs one cached Path2D, not hundreds of objects.
import { ellipse, path, rect, mix, alpha } from '../../tela/templateKit';
import * as orn from '../../tela/ornaments';
import type { Lay } from './layout';
import type { Ambient, SlideObj } from './types';

export { mix, alpha, orn };

export const amb = (o: SlideObj, a: Ambient): SlideObj => { o.amb = a; return o; };
export const gnd = (o: SlideObj, label?: string): SlideObj => { o.templateRole = 'GROUND'; if (label) o.objectLabel = label; return o; };
export const gnds = (objs: SlideObj[], label?: string): SlideObj[] => objs.map(o => gnd(o, label));

/** Soft light: an ellipse filled with a radial falloff. */
export function glowAt(cx: number, cy: number, rx: number, ry: number, color: string, a: number, label = 'Glow'): SlideObj {
  return ellipse(cx - rx, cy - ry, rx * 2, ry * 2, color, { gradient: { kind: 'RADIAL', stops: [{ offset: 0, color, opacity: a }, { offset: .55, color, opacity: a * .45 }, { offset: 1, color, opacity: 0 }] }, label });
}

const r2 = (n: number) => Math.round(n * 10) / 10;

// ── path-string builders (absolute px) ──────────────────────────────────────
export const dCircle = (cx: number, cy: number, r: number) => `M${r2(cx - r)} ${r2(cy)}a${r2(r)} ${r2(r)} 0 1 0 ${r2(r * 2)} 0a${r2(r)} ${r2(r)} 0 1 0 ${r2(-r * 2)} 0Z`;
export const dRect = (x: number, y: number, w: number, h: number) => `M${r2(x)} ${r2(y)}h${r2(w)}v${r2(h)}h${r2(-w)}Z`;
export const dPoly = (pts: number[]) => { let d = `M${r2(pts[0])} ${r2(pts[1])}`; for (let i = 2; i < pts.length; i += 2) d += `L${r2(pts[i])} ${r2(pts[i + 1])}`; return d + 'Z'; };
export const dLine = (x1: number, y1: number, x2: number, y2: number) => `M${r2(x1)} ${r2(y1)}L${r2(x2)} ${r2(y2)}`;

/** A PATH whose `d` is authored in absolute px over the box (x, y, w, h). */
export function pathPx(x: number, y: number, w: number, h: number, d: string, fill: string, o: Parameters<typeof path>[6] = {}): SlideObj {
  return path(x, y, Math.max(1, w), Math.max(1, h), d, fill, { ...o, origin: { x, y, w: Math.max(1, w), h: Math.max(1, h) } });
}
/** An open stroked PATH in absolute px. */
export function strokePx(x: number, y: number, w: number, h: number, d: string, color: string, width: number, o: Parameters<typeof path>[6] = {}): SlideObj {
  return pathPx(x, y, w, h, d, 'none', { ...o, stroke: color, strokeWidth: width, open: true });
}

// ── textures (one object each) ──────────────────────────────────────────────
/** Paper / photocopy grain: n tiny seeded rects. */
export function grain(L: Lay, seed: number, color: string, n: number, opacity: number, size = 1, label = 'Grain'): SlideObj {
  const { W, H, u } = L, r = orn.rng(seed);
  let d = '';
  for (let i = 0; i < n; i++) { const s = (.12 + r() * .32) * u * size; d += dRect(r() * W, r() * H, s * (1 + r() * 2.2), s); }
  return gnd(pathPx(0, 0, W, H, d, color, { opacity, label }), label);
}
/** Halftone dot screen; `grade` fades dot size across the box (0..1 → rMin..rMax). */
export function halftone(x: number, y: number, w: number, h: number, step: number, color: string, opts: { rMin?: number; rMax?: number; grade?: 'x' | 'y' | '-x' | '-y' | 'radial' | 'none'; opacity?: number; label?: string; max?: number } = {}): SlideObj {
  const rMin = opts.rMin ?? step * .08, rMax = opts.rMax ?? step * .42, g = opts.grade ?? 'none';
  const cols = Math.max(1, Math.floor(w / step)), rows = Math.max(1, Math.floor(h / step)), max = opts.max ?? 2600;
  const sx = step * Math.max(1, Math.sqrt(cols * rows / max));
  const c2 = Math.max(1, Math.floor(w / sx)), r2n = Math.max(1, Math.floor(h / sx));
  let d = '';
  for (let j = 0; j < r2n; j++) for (let i = 0; i < c2; i++) {
    const tx = c2 > 1 ? i / (c2 - 1) : .5, ty = r2n > 1 ? j / (r2n - 1) : .5;
    const t = g === 'x' ? tx : g === '-x' ? 1 - tx : g === 'y' ? ty : g === '-y' ? 1 - ty : g === 'radial' ? Math.min(1, Math.hypot(tx - .5, ty - .5) * 1.6) : .5;
    const rad = (rMin + (rMax - rMin) * t) * sx / step;
    if (rad < .35) continue;
    d += dCircle(x + i * sx + sx / 2 + (j % 2 ? sx / 2 : 0), y + j * sx + sx / 2, rad);
  }
  return pathPx(x, y, w, h, d || dRect(x, y, 1, 1), color, { opacity: opts.opacity, label: opts.label || 'Halftone' });
}
/** Horizontal bands (scanlines, ruled paper, stripes). */
export function bands(x: number, y: number, w: number, h: number, gap: number, thick: number, color: string, opts: { opacity?: number; label?: string; vertical?: boolean } = {}): SlideObj {
  let d = '';
  if (opts.vertical) for (let px = x; px < x + w; px += gap) d += dRect(px, y, thick, h);
  else for (let py = y; py < y + h; py += gap) d += dRect(x, py, w, thick);
  return pathPx(x, y, w, h, d, color, { opacity: opts.opacity, label: opts.label || 'Bands' });
}
/** A hairline grid as one stroked path. */
export function gridLines(x: number, y: number, w: number, h: number, sx: number, sy: number, color: string, width: number, opts: { label?: string; opacity?: number } = {}): SlideObj {
  let d = '';
  for (let px = x; px <= x + w + .5; px += sx) d += dLine(px, y, px, y + h);
  for (let py = y; py <= y + h + .5; py += sy) d += dLine(x, py, x + w, py);
  return strokePx(x, y, w, h, d, color, width, { label: opts.label || 'Grid', opacity: opts.opacity });
}
/** Running-bond brick courses (mortar is the gap). */
export function brick(L: Lay, color: string, opts: { course?: number; opacity?: number; seed?: number } = {}): SlideObj {
  const { W, H, u } = L, ch = opts.course ?? u * 3.4, bw = ch * 2.6, m = Math.max(1, ch * .09), r = orn.rng(opts.seed ?? 3);
  let d = '';
  for (let row = 0, y = 0; y < H; row++, y += ch) for (let x = row % 2 ? -bw / 2 : 0; x < W; x += bw) d += dRect(x + m / 2, y + m / 2, bw - m - r() * m, ch - m);
  return pathPx(0, 0, W, H, d, color, { opacity: opts.opacity, label: 'Brick' });
}

// ── hand-made edges ─────────────────────────────────────────────────────────
/** A rectangle with ragged (torn) edges on the chosen sides. */
export function tornRectD(x: number, y: number, w: number, h: number, seed: number, rough: number, sides = 'tblr'): string {
  const r = orn.rng(seed), pts: number[] = [];
  const n = (len: number) => Math.max(3, Math.round(len / Math.max(4, rough * 2.2)));
  const jag = (s: string) => sides.includes(s) ? (r() - .5) * rough : 0;
  const nt = n(w), nr = n(h);
  for (let i = 0; i <= nt; i++) pts.push(x + w * i / nt, y + jag('t'));
  for (let i = 1; i <= nr; i++) pts.push(x + w + jag('r'), y + h * i / nr);
  for (let i = nt - 1; i >= 0; i--) pts.push(x + w * i / nt, y + h + jag('b'));
  for (let i = nr - 1; i >= 1; i--) pts.push(x + jag('l'), y + h * i / nr);
  return dPoly(pts);
}
/** A wobbly hand-drawn quadrilateral outline (marker / chalk). */
export function wobbleRectD(x: number, y: number, w: number, h: number, seed: number, wob: number): string {
  const r = orn.rng(seed), j = () => (r() - .5) * wob;
  return `M${r2(x + j())} ${r2(y + j())}L${r2(x + w + j())} ${r2(y + j())}L${r2(x + w + j())} ${r2(y + h + j())}L${r2(x + j())} ${r2(y + h + j())}Z`;
}
/** A slightly wavering hand-drawn line. */
export function wobbleLineD(x1: number, y1: number, x2: number, y2: number, seed: number, wob: number, seg = 8): string {
  const r = orn.rng(seed); let d = `M${r2(x1)} ${r2(y1)}`;
  for (let i = 1; i <= seg; i++) { const t = i / seg; d += `L${r2(x1 + (x2 - x1) * t + (i < seg ? (r() - .5) * wob : 0))} ${r2(y1 + (y2 - y1) * t + (i < seg ? (r() - .5) * wob : 0))}`; }
  return d;
}
/** A strip of tape: a rect with zig-zag torn ends. */
export function tapeD(x: number, y: number, w: number, h: number, seed: number): string {
  const r = orn.rng(seed), t = Math.max(3, Math.round(h / Math.max(2, h * .18))), z = h * .12, pts: number[] = [];
  pts.push(x, y, x + w, y);
  for (let i = 1; i <= t; i++) pts.push(x + w - (i % 2 ? z * (.6 + r() * .6) : 0), y + h * i / t);
  pts.push(x, y + h);
  for (let i = t - 1; i >= 1; i--) pts.push(x + (i % 2 ? z * (.6 + r() * .6) : 0), y + h * i / t);
  return dPoly(pts);
}

/** Quarter-circle arc band (Truchet / mid-century). */
export function quarterArcD(cx: number, cy: number, r0: number, r1: number, startDeg: number): string {
  const a0 = startDeg * Math.PI / 180, a1 = (startDeg + 90) * Math.PI / 180;
  const p = (r: number, a: number) => `${r2(cx + r * Math.cos(a))} ${r2(cy + r * Math.sin(a))}`;
  return `M${p(r1, a0)}A${r2(r1)} ${r2(r1)} 0 0 1 ${p(r1, a1)}L${p(r0, a1)}A${r2(r0)} ${r2(r0)} 0 0 0 ${p(r0, a0)}Z`;
}
/** Half-disc (semicircle) facing `deg` (0 = flat side down → dome up). */
export function halfDiscD(cx: number, cy: number, r: number, deg: number): string {
  const a0 = (deg + 180) * Math.PI / 180, a1 = deg * Math.PI / 180;
  return `M${r2(cx + r * Math.cos(a0))} ${r2(cy + r * Math.sin(a0))}A${r2(r)} ${r2(r)} 0 0 1 ${r2(cx + r * Math.cos(a1))} ${r2(cy + r * Math.sin(a1))}Z`;
}

/** Fit a square of side s inside a box, centred. */
export function sq(x: number, y: number, w: number, h: number) { const s = Math.min(w, h); return { s, cx: x + w / 2, cy: y + h / 2, x0: x + (w - s) / 2, y0: y + (h - s) / 2 }; }

export const pad2 = (s: string) => /^\d$/.test(s.trim()) ? '0' + s.trim() : s;
export const plain = (s: string) => s;

/** Inset frame rect (stroke only). */
export function frameRect(L: Lay, inset: number, color: string, width: number, label = 'Frame', o: { rx?: number; dash?: number[] } = {}): SlideObj {
  return rect(inset, inset, L.W - inset * 2, L.H - inset * 2, 'none', { stroke: color, strokeWidth: width, rx: o.rx, dash: o.dash, label });
}
