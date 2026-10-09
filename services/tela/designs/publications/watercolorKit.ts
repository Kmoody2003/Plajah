// watercolorKit — faking transparent watercolour with Tela vector objects.
//
// The engine has gradients, gaussian blur, multiply blending and dashed strokes and no raster
// brush, so a "wash" is a STACK: a soft bleed past the line, a graded translucent body, a pool
// of darker pigment, a broken darker wet edge, granulation specks and (optionally) salt. Paper
// is warm cream and shows through everywhere; pencil under-drawing is loose and unfinished.
// All speckle is batched (one object per texture) so a rich page stays under the object budget.
import type { TelaGradientPaint } from '../../../../types';
import { mix, text, circle, type ShapeOpts } from '../../templateKit';
import type { FontKey } from '../../telaFonts';
import { lin, rad, type Stop } from './kidsArtB';
import {
  type O, type Pt, rn, bounds, centroid, area, scaleAbout, shift, jitter, blob, smooth, polyline, rawBox, dotsPath, strokesPath, scatterIn, scatterRect, compact, sampleClosed, sampleOpen,
} from './paintKit';

export type { O, Pt };
const PI = Math.PI;

export const WC = {
  paper: '#FBF6EC', white: '#FFFDF6', ultra: '#2E4FD0', cerulean: '#2C9DDC', turq: '#10B5A4', madder: '#E5517C', ochre: '#E6A52C', sepia: '#5B4636', ink: '#26386E',
  deep: '#1C2D8E', violet: '#6B4EB8', moss: '#5FA86A', rose: '#F28BA6', sky: '#8FD3F2',
};

export interface WashOpts {
  op?: number; blur?: number; edge?: number; pool?: number; bleed?: number; grain?: number; salt?: number; label?: string;
  /** [angleDeg, fadeFraction]: the wash is lighter toward the far end (a graded wash). */
  fade?: [number, number];
  /** Uneven pigment density (lifted + dark blotches) on larger washes. */
  mottle?: number;
  /** Body + wet edge only (small things: fewer objects). */
  lite?: boolean;
}

/** Roughen an outline with smooth multi-octave noise along its normal (a hand-painted, never-quite-round boundary). */
export function rough(pts: Pt[], seed: number, amt: number, step = 20): Pt[] {
  const dense = sampleClosed(pts, step); const r = rn(seed); const n = dense.length; const ph = [r() * 6, r() * 6, r() * 6];
  return dense.map((p, i) => {
    const t = i / n * PI * 2; const k = Math.sin(t * 5 + ph[0]) * .5 + Math.sin(t * 11 + ph[1]) * .35 + Math.sin(t * 23 + ph[2]) * .2 + (r() - .5) * .6;
    const a = dense[(i - 1 + n) % n], b = dense[(i + 1) % n]; const tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1;
    return [p[0] + ty / l * k * amt, p[1] - tx / l * k * amt] as Pt;
  });
}

/** One transparent watercolour wash over the polygon `pts`. Returns ~6-12 objects. */
export function wash(pts: Pt[], color: string, seed: number, o: WashOpts = {}): O[] {
  const op = o.op ?? 1; const r = rn(seed); const b = bounds(pts); const out: O[] = []; const label = o.label ?? 'Watercolour wash';
  const cl = (v: number) => Math.max(0, Math.min(1, v)); const ar = Math.abs(area(pts)); const big = ar > 9000;
  const rp = rough(pts, seed + 11, Math.min(5, 1 + Math.sqrt(ar) * .012), big ? 24 : 12);
  const lite = !!o.lite; const bleed = lite ? 0 : (o.bleed ?? 1);
  if (bleed > 0) out.push(smooth(scaleAbout(pts, 1.05), true, color, { opacity: cl(.24 * op * bleed), blur: Math.max(5, Math.min(15, b.w * .045)), blend: 'multiply', label: `${label} bleed` }));
  const fade = o.fade ?? [r() * 360, .32];
  out.push(smooth(rp, true, color, { opacity: cl(.62 * op), blur: o.blur ?? 1.2, blend: 'multiply', gradient: lin(fade[0], [0, color, 1], [1, color, 1 - fade[1]]), label }));
  const pool = lite ? 0 : (o.pool ?? .5);
  if (pool > 0) out.push(smooth(shift(scaleAbout(pts, .66), (r() - .5) * b.w * .1, b.h * .1), true, mix(color, -.32), { opacity: cl(.3 * op * pool), blur: Math.max(4, Math.min(12, b.w * .04)), blend: 'multiply', label: `${label} pooled pigment` }));
  if (!lite && big && (o.mottle ?? 1) > 0) {
    const nm = Math.max(2, Math.min(6, Math.round(ar / 26000) + 2));
    scatterIn(pts, nm, seed + 21).forEach(([x, y], k) => { const rr = Math.sqrt(ar) * (.05 + r() * .07); out.push(smooth(blob(x, y, rr * 1.3, rr, seed + 30 + k, .25, 8, r() * 180), true, k % 3 === 2 ? mix(color, -.3) : WC.white, k % 3 === 2 ? { opacity: cl(.16 * op), blur: 7, blend: 'multiply', label: `${label} dark mottle` } : { opacity: .17 * (o.mottle ?? 1), blur: 6, label: `${label} lifted mottle` })); });
  }
  const edge = o.edge ?? 1;
  if (edge > 0) {
    const dark = mix(color, -.4), ew = Math.max(1.6, Math.min(3, b.w * .012));
    if (!lite) out.push(smooth(rp, true, 'none', { stroke: dark, strokeWidth: ew * 2.6, opacity: cl(.2 * op * edge), blur: 2.4, blend: 'multiply', label: `${label} edge pooling` }));
    out.push(smooth(rp, true, 'none', { stroke: dark, strokeWidth: ew, opacity: cl(.5 * op * edge), blur: .5, dash: [220 + r() * 120, 4 + r() * 5], blend: 'multiply', label: `${label} wet edge` }));
  }
  const g = lite ? (o.grain ?? 0) : (o.grain ?? Math.max(6, Math.min(110, Math.round(ar / 480))));
  if (g > 0) { const dots = scatterIn(pts, g, seed + 5).map(([x, y]) => [x, y, .6 + r() * 1.6] as [number, number, number]); const d = dotsPath(dots, mix(color, -.5), { opacity: .36 * op, blend: 'multiply', label: `${label} granulation` }); if (d) out.push(d); }
  if (o.salt) { const dots = scatterIn(pts, o.salt, seed + 9).map(([x, y]) => [x, y, 1 + r() * 2.8] as [number, number, number]); const d = dotsPath(dots, WC.white, { opacity: .85, label: `${label} salt` }); if (d) out.push(d); }
  return out;
}

/** Flicked pigment spatter around a subject: dots biased to a ring outside radius r (one object). */
export function splatter(cx: number, cy: number, rad0: number, color: string, n: number, seed: number, op = .5): O | null {
  const r = rn(seed); const dots: Array<[number, number, number]> = [];
  for (let i = 0; i < n; i++) { const a = r() * PI * 2, d = rad0 * (1.02 + Math.pow(r(), 1.7) * .7); dots.push([cx + Math.cos(a) * d * 1.08, cy + Math.sin(a) * d * .92, .9 + Math.pow(r(), 2.2) * 4.6]); }
  return dotsPath(dots, color, { opacity: op, blend: 'multiply', label: 'Pigment spatter' });
}
/** Paint runs: thin tapering drips that fall from the bottom of a wash. */
export function drips(xs: number[], y: number, color: string, seed: number, len = 40): O[] {
  const r = rn(seed); const out: O[] = [];
  xs.forEach(x => { const l = len * (.5 + r()); out.push(smooth([[x, y - 4], [x + (r() - .5) * 4, y + l * .5], [x + (r() - .5) * 3, y + l]], false, 'none', { stroke: color, strokeWidth: 3, opacity: .5, blur: .8, blend: 'multiply', label: 'Paint run' }), circle(x, y + l + 1.5, 3.4, color, { opacity: .55, blur: .6, blend: 'multiply', label: 'Paint run bead' })); });
  return out;
}

/** A broad flat-brush sweep along a centreline: a tapering wash with visible bristle streaks and ragged dry ends. */
export function flatBrush(c0: Pt[], width: number, color: string, seed: number, op = 1): O[] {
  const center = sampleOpen(c0, 28); const n = center.length; const r = rn(seed);
  const widths = center.map((_, i) => width * (.45 + .55 * Math.sin(Math.min(1, (i + .6) / (n - .4)) * PI)));
  const out = wash(ribbon(center, widths), color, seed, { bleed: .5, pool: .3, edge: .7, op, grain: 24, mottle: .5 });
  const segs: Array<[number, number, number, number]> = []; const light: Array<[number, number, number, number]> = [];
  for (let k = -3; k <= 3; k++) {
    const t0 = r() * .25, t1 = .75 + r() * .25; const path: Pt[] = [];
    for (let i = 0; i < n; i++) { const a = center[Math.max(0, i - 1)], b = center[Math.min(n - 1, i + 1)]; const tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; const off = k / 4.6 * widths[i] * .9; path.push([center[i][0] - ty / l * off, center[i][1] + tx / l * off]); }
    const at = (t: number): Pt => { const f = t * (n - 1); const i = Math.min(n - 2, Math.floor(f)); const u = f - i; return [path[i][0] + (path[i + 1][0] - path[i][0]) * u, path[i][1] + (path[i + 1][1] - path[i][1]) * u]; };
    let prev = at(t0); const steps = Math.round(n * (t1 - t0) / 1.6);
    for (let j = 1; j <= steps; j++) { const q = at(t0 + (t1 - t0) * j / steps); if (r() > .3) (k % 2 ? light : segs).push([prev[0], prev[1], q[0], q[1]]); prev = q; }
  }
  const a1 = strokesPath(segs, mix(color, -.3), 2.4, { opacity: .15 * op, blur: .7, blend: 'multiply', label: 'Bristle streaks' }); if (a1) out.push(a1);
  const a2 = strokesPath(light, WC.white, 2.2, { opacity: .16, blur: .7, label: 'Bristle streaks (lifted)' }); if (a2) out.push(a2);
  return out;
}

/** A back-run / bloom: a pale cauliflower patch with a dark crisp edge, dropped inside a wash. */
export function bloom(cx: number, cy: number, rad0: number, color: string, seed: number, op = 1): O[] {
  const pts = blob(cx, cy, rad0, rad0 * .8, seed, .26, 10, seed * 9 % 180);
  return [
    smooth(pts, true, mix(color, .78), { opacity: .5 * op, blur: 1.8, label: 'Bloom (back-run)' }),
    smooth(pts, true, 'none', { stroke: mix(color, -.3), strokeWidth: 2.1, opacity: .5 * op, blur: .5, blend: 'multiply', label: 'Bloom edge' }),
  ];
}

/** Loose pencil under-drawing: two wandering passes, broken line, overshoots. */
export function pencil(pts: Pt[], closed: boolean, seed: number, o: { w?: number; op?: number; color?: string; amt?: number } = {}): O[] {
  const w = o.w ?? 1.4, c = o.color ?? WC.sepia, op = o.op ?? .7, amt = o.amt ?? 1.5; const r = rn(seed);
  return [
    smooth(jitter(pts, seed + 1, amt), closed, 'none', { stroke: c, strokeWidth: w, opacity: op, dash: [140 + r() * 80, 4, 50 + r() * 40, 6], label: 'Pencil under-drawing' }),
    smooth(jitter(pts, seed + 2, amt * 1.4), closed, 'none', { stroke: c, strokeWidth: w * .7, opacity: op * .6, dash: [70 + r() * 50, 9, 26, 5], label: 'Pencil under-drawing (second pass)' }),
  ];
}
/** A confident line in sepia/indigo ink or paint (eyes, mouths, details). */
export function inkLine(pts: Pt[], w: number, color = WC.sepia, op = .85): O {
  return smooth(pts, false, 'none', { stroke: color, strokeWidth: w, opacity: op, blur: .25, label: 'Ink detail' });
}
/** A wet brush stroke along a path: soft body + a darker thin core. */
export function brushStroke(pts: Pt[], width: number, color: string, op = 1, label = 'Brush stroke'): O[] {
  return [
    smooth(pts, false, 'none', { stroke: color, strokeWidth: width, opacity: Math.min(1, .52 * op), blur: 1.1, blend: 'multiply', label }),
    smooth(shift(pts, 0, width * .12), false, 'none', { stroke: mix(color, -.25), strokeWidth: Math.max(1, width * .32), opacity: Math.min(1, .26 * op), blur: .8, blend: 'multiply', label: `${label} core` }),
  ];
}
/** Dry-brush streaks: many thin, broken, parallel strokes in one object. */
export function dryBrush(x: number, y: number, w: number, h: number, count: number, color: string, seed: number, o: { tilt?: number; op?: number; width?: number; len?: [number, number] } = {}): O | null {
  const r = rn(seed); const [l0, l1] = o.len ?? [12, 46]; const segs: Array<[number, number, number, number]> = [];
  for (let i = 0; i < count; i++) { const px = x + r() * w, py = y + r() * h, len = l0 + r() * (l1 - l0), a = (o.tilt ?? 0) * PI / 180 + (r() - .5) * .08; segs.push([px, py, px + Math.cos(a) * len, py + Math.sin(a) * len]); }
  return strokesPath(segs, color, o.width ?? 1.5, { opacity: o.op ?? .22, blend: 'multiply', label: 'Dry-brush streaks' });
}
/** Salt/spatter dots across a rectangle (one object). */
export function spatter(x: number, y: number, w: number, h: number, n: number, color: string, seed: number, o: { op?: number; r?: [number, number]; blend?: ShapeOpts['blend'] } = {}): O | null {
  const r = rn(seed); const [r0, r1] = o.r ?? [.8, 3.2];
  return dotsPath(scatterRect(x, y, w, h, n, seed + 3).map(([px, py]) => [px, py, r0 + r() * (r1 - r0)] as [number, number, number]), color, { opacity: o.op ?? .6, blend: o.blend, label: 'Spatter' });
}
/** Paper tooth, fibres and a warm vignette — laid ON TOP of the paint so the paper reads through it. */
export function paperTexture(W: number, H: number, seed: number, o: { specks?: number; vignette?: number } = {}): O[] {
  const r = rn(seed + 77); const out: O[] = [];
  const n = o.specks ?? Math.round(W * H / 1700);
  const dots = Array.from({ length: n }, () => [r() * W, r() * H, .45 + r() * 1.1] as [number, number, number]);
  const d1 = dotsPath(dots, '#9A7B55', { opacity: .2, blend: 'multiply', label: 'Paper tooth' }); if (d1) out.push(d1);
  const segs = Array.from({ length: Math.round(n / 5) }, () => { const x = r() * W, y = r() * H, a = r() * PI, l = 5 + r() * 12; return [x, y, x + Math.cos(a) * l, y + Math.sin(a) * l] as [number, number, number, number]; });
  const s1 = strokesPath(segs, '#B9A07A', .7, { opacity: .2, blend: 'multiply', label: 'Paper fibres' }); if (s1) out.push(s1);
  const v = o.vignette ?? .07;
  if (v > 0) out.push(rawBox(0, 0, W, H, `M0 0H${W}V${H}H0Z`, '#8A6A45', { gradient: { kind: 'RADIAL', stops: [{ offset: 0, color: '#8A6A45', opacity: 0 }, { offset: .7, color: '#8A6A45', opacity: 0 }, { offset: 1, color: '#8A6A45', opacity: v }] } as TelaGradientPaint, blend: 'multiply', label: 'Paper edge warmth' }));
  return out;
}
/** A soft glow of light: a warm wash on paper (multiply) or lifted pale light on a painted dark ground. */
export function lightGlow(cx: number, cy: number, r: number, color: string, a: number, onDark = false, label = 'Glow'): O {
  const stops: Stop[] = [[0, color, a], [.45, color, a * .5], [1, color, 0]];
  return smooth(blob(cx, cy, r, r, 3, .02, 14), true, color, { gradient: rad(...stops), blend: onDark ? 'screen' : 'multiply', label, role: 'ORNAMENT' });
}
/** A tapered ribbon polygon around a centreline (seaweed, tentacles, tails). widths = half-widths per point. */
export function ribbon(center: Pt[], widths: number[]): Pt[] {
  const n = center.length; const L: Pt[] = [], R: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = center[Math.max(0, i - 1)], b = center[Math.min(n - 1, i + 1)]; const tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; const w = widths[i] ?? widths[widths.length - 1];
    L.push([center[i][0] - ty / l * w, center[i][1] + tx / l * w]); R.push([center[i][0] + ty / l * w, center[i][1] - tx / l * w]);
  }
  return [...L, ...R.reverse()];
}
/** A curved centreline from (x,y) rising/leaning with sway. */
export function sway(x: number, y: number, len: number, lean: number, seed: number, n = 7, amp = 18): Pt[] {
  const r = rn(seed); const ph = r() * 6; return Array.from({ length: n }, (_, i) => { const t = i / (n - 1); return [x + Math.sin(ph + t * 4.4) * amp * (t + .15) + lean * t * len * .25, y - t * len] as Pt; });
}

// ── Lettering ────────────────────────────────────────────────────────────────
const adv = (ch: string): number => ch === ' ' ? .26 : /[il!.,'|:;j]/.test(ch) ? .22 : /[fJrt()-]/.test(ch) ? .32 : /[mM]/.test(ch) ? .62 : /[wW]/.test(ch) ? .52 : /[A-Z0-9]/.test(ch) ? .52 : .43;
export const brushWidth = (str: string, size: number) => Array.from(str).reduce((a, c) => a + adv(c) * size, 0);

/** Painted brush lettering: one object per glyph, colours alternate, each letter has a soft blurred bleed copy under it. */
export function brushTitle(cx: number, y: number, str: string, size: number, colors: string[], seed: number, o: { font?: FontKey; wScale?: number; tilt?: number; light?: boolean } = {}): O[] {
  const ws = o.wScale ?? 1; const chars = Array.from(str); const advs = chars.map(c => adv(c) * size * ws); const total = advs.reduce((a, b) => a + b, 0);
  let x = cx - total / 2; const r = rn(seed * 3 + 1); const out: O[] = []; let ci = 0;
  chars.forEach((ch, i) => {
    const mid = x + advs[i] / 2; x += advs[i]; if (ch === ' ') return;
    const col = colors[ci++ % colors.length]; const by = Math.sin(i * 1.3 + seed) * size * .045 + (r() - .5) * 3; const rot = (o.tilt ?? 5) * Math.sin(i * 1.9 + seed * 1.7) + (r() - .5) * 2;
    const mk = (dx: number, dy: number, color: string, op: number, blur: number | undefined, label: string): O => ({ ...text(mid - size * .6 + dx, y + by + dy, size * 1.2, ch, { size, font: o.font ?? 'caveatBrush', weight: 400, color, align: 'center', wrap: false, rotation: rot, opacity: op, blend: o.light ? undefined : 'multiply', label, role: 'HEADLINE' }), blur });
    if (size >= 90) out.push(mk(2, 4, mix(col, .35), .5, 3, 'Title letter bleed'));
    out.push(mk(0, 0, col, .9, undefined, `Title letter ${ch}`));
  });
  return out;
}
export interface InkOpts { size: number; font?: FontKey; weight?: number; color?: string; align?: 'left' | 'center' | 'right'; italic?: boolean; rot?: number; op?: number; leading?: number; label?: string; blend?: ShapeOpts['blend'] }
/** Read-aloud text, hand-lettered in ink. Explicit line breaks; no box. */
export function inkText(x: number, y: number, w: number, str: string, o: InkOpts): O {
  return text(x, y, w, str, { size: o.size, font: o.font ?? 'fraunces', weight: o.weight ?? 500, color: o.color ?? WC.ink, align: o.align ?? 'left', italic: o.italic ?? true, rotation: o.rot, opacity: o.op ?? .94, leading: o.leading ?? 1.38, wrap: false, blend: o.blend, label: o.label ?? 'Read-aloud text', role: 'BODY' });
}

/** Re-export so designers import one module. */
export { smooth, polyline, rawBox, dotsPath, strokesPath, scatterIn, scatterRect, compact, rn, bounds, centroid, scaleAbout, shift, jitter, blob, mix };
