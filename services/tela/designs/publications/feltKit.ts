// feltKit — faking appliquéd felt and embroidery with Tela vector objects.
//
// A felt piece is a STACK: a soft cast shadow and a tight contact shadow (felt layered on a
// quilted linen ground), a gently shaded body, a fuzzy fringe (a tiny-spike polyline along
// the outline), fibre flecks, and a visible running-stitch thread (dashed, with its own shadow)
// sewn just inside the edge. Buttons get thread crosses. Lettering is "satin stitch": a glyph
// filled with a many-stop diagonal stripe gradient plus a thread outline. All flecks are batched.
import { mix, text, circle, ellipse, rect, type ShapeOpts } from '../../templateKit';
import type { FontKey } from '../../telaFonts';
import { lin, rad, groundRect } from './kidsArtB';
import {
  type O, type Pt, rn, bounds, area, shift, scaleAbout, blob, smooth, polyline, rawBox, dotsPath, strokesPath, scatterIn, compact, sampleClosed, sampleOpen, offsetDense, roundRectPts, bevel, unionCircles, bumpy, starPts, jitter,
} from './paintKit';

export type { O, Pt };
const PI = Math.PI;

export const FT = {
  night: '#16113E', indigoD: '#241F70', indigo: '#3A34A0', burgundy: '#972250', burgundyD: '#6E1238', mustard: '#E8A91C', yellow: '#F9CB3A', cream: '#F8EACB', creamD: '#E9D3A4',
  teal: '#17948A', tealD: '#0E6B68', rose: '#EE6C8E', roseL: '#F6A1B6', thread: '#FFF3D2', navy: '#1C1747', coral: '#F0793E',
};

const perim = (pts: Pt[]) => { let p = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; p += Math.hypot(b[0] - a[0], b[1] - a[1]); } return p; };

export interface FeltOpts {
  /** Thread colour for the running stitch; false = no stitching. */
  stitch?: string | false; inset?: number; dash?: [number, number]; thread?: number;
  /** How far the piece sits above what is below (shadow size), px. 0 = no shadow. */
  lift?: number; lite?: boolean; fuzz?: number; label?: string; opacity?: number; flecks?: number; shade?: number;
  shadowColor?: string;
}

/** One felt piece cut to the polygon `pts`. Returns 4 (lite) to 9 objects. */
export function felt(pts: Pt[], color: string, seed: number, o: FeltOpts = {}): O[] {
  const r = rn(seed); const lab = o.label ?? 'Felt'; const lift = o.lift ?? 5; const out: O[] = [];
  const b = bounds(pts); const ar = Math.abs(area(pts)); const pr = perim(pts);
  const step = Math.max(2.6, Math.min(8, pr / 340));
  const dense = sampleClosed(pts, step); const n = dense.length;
  const small = Math.min(b.w, b.h) < 70;
  if (lift > 0 && !o.lite) {
    const sh = o.shadowColor ?? 'rgba(8,4,34,.55)';
    out.push(smooth(shift(pts, lift * .55, lift * 1.15), true, sh, { opacity: .55, blur: Math.max(3, lift * 1.1), label: `${lab} soft shadow` }));
    out.push(smooth(shift(pts, lift * .22, lift * .42), true, sh, { opacity: .6, blur: Math.max(1, lift * .26), label: `${lab} contact shadow` }));
  } else if (lift > 0) out.push(smooth(shift(pts, lift * .3, lift * .6), true, o.shadowColor ?? 'rgba(8,4,34,.55)', { opacity: .5, blur: Math.max(1.2, lift * .5), label: `${lab} shadow` }));
  const shade = o.shade ?? .13;
  out.push(smooth(pts, true, color, { opacity: o.opacity ?? 1, gradient: lin(110, [0, mix(color, shade)], [.55, color], [1, mix(color, -shade)]), stroke: mix(color, -.22), strokeWidth: 1.3, label: lab }));
  // fuzzy fringe: tiny spikes leaning outward from the cut edge
  const fz = o.fuzz ?? 1;
  if (fz > 0) {
    const fr: Pt[] = [];
    for (let i = 0; i < n; i++) {
      const a = dense[(i - 1 + n) % n], c = dense[(i + 1) % n]; const tx = c[0] - a[0], ty = c[1] - a[1]; const l = Math.hypot(tx, ty) || 1; const sg = area(dense) > 0 ? 1 : -1;
      const d = (i % 2 ? 1.4 + r() * 2.4 : .2 + r() * .8) * fz * (small ? .7 : 1);
      fr.push([dense[i][0] + sg * ty / l * d, dense[i][1] - sg * tx / l * d]);
    }
    out.push(polyline(fr, true, 'none', { stroke: mix(color, .05), strokeWidth: 1.25, opacity: .92 * (o.opacity ?? 1), label: `${lab} fuzzy edge` }));
  }
  if (!o.lite && ar > 1500) {
    const nf = Math.round(Math.min(380, ar / 70) * (o.flecks ?? 1));
    const pts1 = scatterIn(dense, nf, seed + 3); const segs = pts1.map(([x, y]) => { const a = r() * PI, l = 3 + r() * 6; return [x, y, x + Math.cos(a) * l, y + Math.sin(a) * l] as [number, number, number, number]; });
    const f1 = strokesPath(segs, mix(color, .28), .9, { opacity: .4, label: `${lab} fibres` }); if (f1) out.push(f1);
    const f2 = dotsPath(scatterIn(dense, Math.round(nf * .5), seed + 4).map(([x, y]) => [x, y, .6 + r() * .9] as [number, number, number]), mix(color, -.3), { opacity: .3, label: `${lab} flecks` }); if (f2) out.push(f2);
  }
  if (o.stitch !== false) {
    const th = o.stitch ?? FT.thread; const inset = o.inset ?? (small ? 5 : 8); const ring = offsetDense(dense, -inset);
    const tw = o.thread ?? (small ? 1.8 : 2.6); const dash = o.dash ?? (small ? [5, 4] : [8, 6]);
    out.push(polyline(shift(ring, .9, 1.4), true, 'none', { stroke: 'rgba(10,4,40,.55)', strokeWidth: tw, dash, opacity: .5 * (o.opacity ?? 1), label: `${lab} stitch shadow` }));
    out.push(polyline(ring, true, 'none', { stroke: th, strokeWidth: tw, dash, opacity: .95 * (o.opacity ?? 1), label: `${lab} running stitch` }));
  }
  return out;
}

/** A hand-sewn stitched line along a path (mouths, hinges, antennae, fence rails). */
export function stitchLine(pts: Pt[], color: string, w = 2.6, dash: [number, number] = [7, 6], label = 'Stitched line'): O[] {
  const d = sampleOpen(pts, 10);
  return [polyline(shift(d, .8, 1.2), false, 'none', { stroke: 'rgba(10,4,40,.5)', strokeWidth: w, dash, opacity: .45, label: `${label} shadow` }), polyline(d, false, 'none', { stroke: color, strokeWidth: w, dash, label })];
}
/** Satin-stitched solid line (a thick chunky thread: eyebrows, whiskers, smiles). */
export function thread(pts: Pt[], color: string, w = 3.4, label = 'Thread'): O[] {
  const d = sampleOpen(pts, 8);
  return [polyline(shift(d, .8, 1.2), false, 'none', { stroke: 'rgba(10,4,40,.45)', strokeWidth: w, opacity: .5, label: `${label} shadow` }), polyline(d, false, 'none', { stroke: color, strokeWidth: w, label })];
}

/** A sewn-on button: shadow, rim, face, four holes and a thread cross. */
export function button(cx: number, cy: number, r: number, face: string, threadColor: string = FT.thread, seed = 1, o: { holes?: boolean } = {}): O[] {
  const out: O[] = [circle(cx + r * .12, cy + r * .22, r * 1.05, 'rgba(8,4,34,.6)', { blur: Math.max(1.4, r * .2), label: 'Button shadow' })];
  out.push(circle(cx, cy, r, face, { gradient: rad([0, mix(face, .22)], [.7, face], [1, mix(face, -.2)]), stroke: mix(face, -.35), strokeWidth: Math.max(1.2, r * .1), label: 'Button' }));
  out.push(circle(cx, cy, r * .76, 'none', { stroke: mix(face, .25), strokeWidth: Math.max(1, r * .07), opacity: .55, label: 'Button rim ring' }));
  const k = r * .3, x1 = cx - k, x2 = cx + k, y1 = cy - k, y2 = cy + k;
  out.push(circle(x1, y1, r * .11, 'rgba(0,0,0,.6)', { label: 'Button hole' }), circle(x2, y1, r * .11, 'rgba(0,0,0,.6)', { label: 'Button hole' }), circle(x1, y2, r * .11, 'rgba(0,0,0,.6)', { label: 'Button hole' }), circle(x2, y2, r * .11, 'rgba(0,0,0,.6)', { label: 'Button hole' }));
  const cross = strokesPath([[x1, y1, x2, y2], [x2, y1, x1, y2]], threadColor, Math.max(1.6, r * .15), { label: 'Thread cross' }); if (cross) out.push(cross);
  out.push(circle(cx - r * .38, cy - r * .42, r * .16, '#FFFFFF', { opacity: .55, label: 'Button shine' }));
  void seed; void o; return out;
}

/** Satin-stitch lettering: a glyph filled with fine diagonal thread stripes, a thread outline and a soft shadow. */
function stripeGradient(a: string, b: string, n: number, angle: number) {
  const stops: Array<{ offset: number; color: string }> = [];
  for (let i = 0; i < n; i++) { const c = i % 2 ? b : a; stops.push({ offset: i / n, color: c }, { offset: (i + 1) / n, color: c }); }
  return { kind: 'LINEAR' as const, angle, stops };
}
/** Darker AND richer: pull a colour toward deep burgundy instead of grey. */
export const deep = (c: string, t = .45) => {
  const lum = (h: string) => { const v = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); return (v[0] * .3 + v[1] * .59 + v[2] * .11) / 255; };
  if (lum(c) > .78) return '#B4752A';
  if (lum(c) > .6 && /^#f/i.test(c)) return mix(c, -.3) === c ? c : '#A9501F'; const m = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); const a = m(c), b = m('#4A0F2E'); return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
const adv = (ch: string): number => ch === ' ' ? .32 : /[il!.,'|:;j]/.test(ch) ? .29 : /[fJrt()-]/.test(ch) ? .46 : /[mM]/.test(ch) ? .96 : /[wW]/.test(ch) ? .9 : /[A-Z0-9]/.test(ch) ? .72 : .64;
export const sniWidth = (str: string, size: number) => Math.max(...str.split('\n').map(l => Array.from(l).reduce((a, c) => a + adv(c) * size, 0)));
export function embroTitle(cx: number, y: number, str: string, size: number, colors: string[], seed: number, o: { font?: FontKey; tilt?: number; outline?: string; stripes?: number } = {}): O[] {
  const chars = Array.from(str); const advs = chars.map(c => adv(c) * size); const total = advs.reduce((a, b) => a + b, 0); let x = cx - total / 2;
  const r = rn(seed * 5 + 3); const out: O[] = []; let ci = 0; const font = o.font ?? 'sniglet';
  chars.forEach((ch, i) => {
    const mid = x + advs[i] / 2; x += advs[i]; if (ch === ' ') return;
    const col = colors[ci++ % colors.length]; const by = Math.sin(i * 1.4 + seed) * size * .035 + (r() - .5) * 2; const rot = (o.tilt ?? 4) * Math.sin(i * 2 + seed * 1.3) + (r() - .5) * 2;
    const base = { size, font, weight: 800, align: 'center' as const, wrap: false, rotation: rot, role: 'HEADLINE' as const };
    const px = mid - size * .6, py = y + by;
    out.push({ ...text(px + size * .025, py + size * .06, size * 1.2, ch, { ...base, color: 'rgba(6,3,30,.5)', stroke: 'rgba(6,3,30,.5)', strokeWidth: size * .11, label: 'Embroidery shadow' }), blur: size * .035 });
    out.push(text(px, py, size * 1.2, ch, { ...base, color: deep(col), stroke: deep(col), strokeWidth: size * .11, label: `Thread outline ${ch}` }));
    out.push(text(px, py, size * 1.2, ch, { ...base, color: col, gradient: stripeGradient(col, mix(col, .14), o.stripes ?? 14, 62), label: `Satin stitch letter ${ch}` }));
    out.push(text(px - size * .008, py - size * .01, size * 1.2, ch, { ...base, color: 'rgba(255,255,255,.0)', stroke: mix(col, .35), strokeWidth: size * .018, opacity: .6, label: `Thread highlight ${ch}` }));
  });
  return out;
}
/** Read-aloud text sewn in thread: chunky face, vertical satin-stitch stripes. */
export function stitchedText(x: number, y: number, w: number, str: string, size: number, color: string, o: { align?: 'left' | 'center' | 'right'; rot?: number; leading?: number; font?: FontKey; label?: string } = {}): O {
  const wd = Math.max(40, Math.min(w, sniWidth(str, size) + 8)); const n = Math.max(10, Math.round(wd / 4.6));
  return text(x, y, w, str, { size, font: o.font ?? 'sniglet', weight: 800, color, align: o.align ?? 'left', rotation: o.rot, leading: o.leading ?? 1.28, wrap: false, gradient: stripeGradient(color, mix(color, .09), n, 90), label: o.label ?? 'Read-aloud text', role: 'BODY' });
}

/** Quilted linen ground: woven base, diamond lattice stitching with puffed cells, tufted knots. */
export function quiltGround(W: number, H: number, base: string, seed: number, o: { cell?: number; stitch?: string; puff?: number; weave?: number; tuft?: boolean; label?: string } = {}): O[] {
  const r = rn(seed); const cell = o.cell ?? 150; const out: O[] = [groundRect(W, H, base, lin(120, [0, mix(base, .06)], [1, mix(base, -.1)]), o.label ?? 'Quilted linen ground')];
  const wv = o.weave ?? .09; const hs: Array<[number, number, number, number]> = [], vs: Array<[number, number, number, number]> = [];
  for (let y = 2; y < H; y += 4.2) hs.push([0, y + (r() - .5) * .6, W, y + (r() - .5) * .6]);
  for (let x = 2; x < W; x += 5.1) vs.push([x + (r() - .5) * .6, 0, x + (r() - .5) * .6, H]);
  out.push(strokesPath(hs, mix(base, .5), 1, { opacity: wv, label: 'Linen weave (weft)' })!, strokesPath(vs, mix(base, -.5), 1, { opacity: wv * .9, label: 'Linen weave (warp)' })!);
  // lattice of diamonds
  const lines: Array<[number, number, number, number]> = [];
  for (let k = -H; k < W + H; k += cell) {
    lines.push([k, 0, k + H, H]);
    lines.push([k, H, k + H, 0]);
  }
  const clip = (l: [number, number, number, number]): [number, number, number, number] | null => {
    let [x1, y1, x2, y2] = l; const dx = x2 - x1, dy = y2 - y1; let t0 = 0, t1 = 1;
    const test = (p: number, q: number) => { if (p === 0) return q >= 0; const t = q / p; if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; } return true; };
    if (!(test(-dx, x1) && test(dx, W - x1) && test(-dy, y1) && test(dy, H - y1))) return null;
    return [x1 + dx * t0, y1 + dy * t0, x1 + dx * t1, y1 + dy * t1];
  };
  const cl = lines.map(clip).filter(Boolean) as Array<[number, number, number, number]>;
  const puff = o.puff ?? 1;
  const puffs: Array<[number, number, number]> = [], nodes: Array<[number, number, number]> = [];
  const nMax = Math.ceil(2 * (W + H) / cell) + 4;
  for (let n = 0; n <= nMax; n++) for (let m = -nMax; m <= nMax; m++) {
    const x = (-H + n * cell) / 2, y = (m * cell + H) / 2; if (x < -cell || x > W + cell || y < -cell || y > H + cell) continue;
    if ((n - m) % 2 === 0) { if (x > 6 && x < W - 6 && y > 6 && y < H - 6) nodes.push([x, y, 3.6]); } else puffs.push([x, y, cell * .3]);
  }
  const pf = dotsPath(puffs, mix(base, .35), { opacity: .13 * puff, blur: cell * .09, label: 'Quilt puffs (lit)' }); if (pf) out.push(pf);
  const dk = strokesPath(cl.map(([a, b, c, d]) => [a + 1.2, b + 2, c + 1.2, d + 2] as [number, number, number, number]), '#05021E', 3, { opacity: .5, blur: 1.4, label: 'Quilt seam shadow' }); if (dk) out.push(dk);
  const st = strokesPath(cl, o.stitch ?? mix(base, .5), 2.4, { opacity: .8, dash: [7, 6], label: 'Quilting stitches' }); if (st) out.push(st);
  if (o.tuft !== false) { const nd = dotsPath(nodes, o.stitch ?? mix(base, .55), { opacity: .9, label: 'Quilt tufts' }); if (nd) out.push(nd); }
  return out;
}
/** Dark soft corners, like a photographed quilt. */
export function feltVignette(W: number, H: number, v = .42): O {
  return rawBox(0, 0, W, H, `M0 0H${W}V${H}H0Z`, '#05021E', { gradient: { kind: 'RADIAL', stops: [{ offset: 0, color: '#05021E', opacity: 0 }, { offset: .68, color: '#05021E', opacity: 0 }, { offset: 1, color: '#05021E', opacity: v }] }, label: 'Vignette', role: 'ORNAMENT' });
}
/** A soft glow (halo) of candle or star light. */
export function halo(cx: number, cy: number, r: number, color: string, a: number, label = 'Halo'): O {
  return circle(cx, cy, r, color, { gradient: rad([0, color, a], [.35, color, a * .6], [1, color, 0]), blend: 'screen', label, role: 'ORNAMENT' });
}
export { roundRectPts, bevel, unionCircles, bumpy, starPts, jitter, blob, scaleAbout, shift, rect, ellipse, compact };
export type { ShapeOpts };
