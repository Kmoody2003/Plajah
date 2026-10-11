// organic — generators for the natural shapes picture books are made of: blobs, leaves,
// clouds, hills, waves, rocks, puddles, grass blades, petals, sparkles, moons.
//
// Each returns a CompoundPath (smooth beziers, few anchors — editable in the Studio like
// a hand-drawn vector), deterministic by seed. Shapes are built from noise-modulated
// radii or spines and passed through smoothThrough (centripetal Catmull–Rom → cubic), so
// they read hand-made, never perfectly geometric; clouds are a TRUE boolean union of
// circles, so their scallops meet in crisp cusps like a cut-paper cloud.
import type { Vec } from '../vec';
import type { CompoundPath } from '../model';
import { smoothThrough, circlePath, polyPath } from '../shapes';
import { boolean } from '../boolean';
import { simplex2, fbm } from './noise';
import { Random } from './random';

const TAU = Math.PI * 2;

export interface BlobOpts { points?: number; wobble?: number; seed?: number | string; rot?: number; /** Noise frequency around the outline. */ freq?: number }
/** Organic closed blob around (cx, cy). wobble 0..0.5 = radius variation. */
export function blob(cx: number, cy: number, rx: number, ry: number, o: BlobOpts = {}): CompoundPath {
  const n = o.points ?? 9; const R = new Random(o.seed ?? 1); const nz = fbm(simplex2(R.int(0, 1e6)), 3); const w = o.wobble ?? .14; const f = o.freq ?? 1.3;
  const rot = (o.rot ?? 0) * Math.PI / 180; const a0 = R.float(0, TAU); const pts: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + i / n * TAU; const k = 1 + w * nz(Math.cos(a) * f, Math.sin(a) * f) * 1.6;
    const x = Math.cos(a) * rx * k, y = Math.sin(a) * ry * k;
    pts.push({ x: cx + x * Math.cos(rot) - y * Math.sin(rot), y: cy + x * Math.sin(rot) + y * Math.cos(rot) });
  }
  return smoothThrough(pts, true, .55);
}

export interface LeafOpts { width?: number; /** -1..1 asymmetry (one side fuller). */ asym?: number; /** Bend of the midrib (fraction of length). */ bend?: number; tipSharp?: number; seed?: number | string }
/** A leaf from base to tip (pointed both ends, fuller near the base). */
export function leaf(base: Vec, tip: Vec, o: LeafOpts = {}): CompoundPath {
  const dx = tip.x - base.x, dy = tip.y - base.y; const L = Math.hypot(dx, dy) || 1; const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const R = new Random(o.seed ?? 1); const w = (o.width ?? .32) * L; const asym = o.asym ?? R.jit(.2); const bend = (o.bend ?? R.jit(.08)) * L;
  const P = (t: number, side: number) => { const prof = Math.sin(Math.PI * Math.pow(t, .78)) * (1 + side * asym * .5); const b = Math.sin(Math.PI * t) * bend; return { x: base.x + ux * L * t + nx * (side * w * .5 * prof + b), y: base.y + uy * L * t + ny * (side * w * .5 * prof + b) }; };
  const pts: Vec[] = [base, P(.18, 1), P(.45, 1), P(.75, 1), tip, P(.75, -1), P(.45, -1), P(.18, -1)];
  const p = smoothThrough(pts, true, .5);
  // sharp tip and base
  const A = p.subpaths[0].anchors; for (const i of [0, 4]) { const a = A[i]; const k = i === 4 ? (o.tipSharp ?? .35) : .5; if (a.hin) a.hin = { x: a.x + (a.hin.x - a.x) * k, y: a.y + (a.hin.y - a.y) * k }; if (a.hout) a.hout = { x: a.x + (a.hout.x - a.x) * k, y: a.y + (a.hout.y - a.y) * k }; a.kind = 'corner'; }
  return p;
}
/** The midrib spine of a leaf (open), for an ink vein. */
export function leafVein(base: Vec, tip: Vec, bend = 0): CompoundPath {
  const m = { x: (base.x + tip.x) / 2 - (tip.y - base.y) * bend, y: (base.y + tip.y) / 2 + (tip.x - base.x) * bend };
  return smoothThrough([base, m, { x: base.x + (tip.x - base.x) * .92, y: base.y + (tip.y - base.y) * .92 }], false);
}

export interface CloudOpts { puffs?: number; seed?: number | string; flatBottom?: boolean; /** 0..1 puffiness of the top. */ puff?: number }
/** A cumulus cloud: union of circles (true boolean, crisp scallops), optionally flat-bottomed. */
export function cloud(cx: number, cy: number, w: number, h: number, o: CloudOpts = {}): CompoundPath {
  const R = new Random(o.seed ?? 1); const n = o.puffs ?? 6; const circles: CompoundPath[] = []; const puff = o.puff ?? .55;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? .5 : i / (n - 1); const x = cx - w / 2 + w * (.12 + .76 * t) + R.jit(w * .03);
    const lift = Math.sin(Math.PI * t) * (.6 + puff * .5); const r = h * (.32 + .3 * lift) * (1 + R.jit(.12));
    const y = cy + h * .18 - lift * h * .32 + R.jit(h * .04);
    circles.push(circlePath(x, y, r));
  }
  circles.push(circlePath(cx, cy + h * .12, Math.min(w * .3, h * .42)));
  let u = boolean('union', circles);
  if (o.flatBottom !== false) {
    // a gently undulating base (a cut along a soft wave, not a ruler line)
    const R2 = new Random(`${o.seed ?? 1}/base`); const base: Vec[] = [];
    for (let i = 0; i <= 6; i++) base.push({ x: cx - w + i * w / 3, y: cy + h * .3 + Math.sin(i * 1.7 + R2.float(0, 6)) * h * .035 + (i % 2 ? h * .02 : 0) });
    const cut = smoothThrough(base, false, .5); const A = cut.subpaths[0].anchors; A.push({ x: cx + w, y: cy + h * 2, kind: 'corner' }, { x: cx - w, y: cy + h * 2, kind: 'corner' });
    u = boolean('subtract', [u, { fillRule: 'nonzero', subpaths: [{ anchors: A, closed: true }] }]);
  }
  return u;
}

export interface HillOpts { bumps?: number; roughness?: number; seed?: number | string; bottom?: number; points?: number }
/** A hill / ridge from x0..x1, crest around crestY rising from baseY, closed down to `bottom`. */
export function hill(x0: number, x1: number, baseY: number, crestY: number, o: HillOpts = {}): CompoundPath {
  const R = new Random(o.seed ?? 1); const nz = fbm(simplex2(R.int(0, 1e6)), 3); const n = o.points ?? 9; const bottom = o.bottom ?? baseY + 400;
  const peak = R.float(.35, .65); const pts: Vec[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n; const shape = Math.exp(-((t - peak) ** 2) / .09) * .85 + .15 * Math.sin(Math.PI * t);
    const y = baseY - (baseY - crestY) * shape + nz(t * (o.bumps ?? 2.2), 3.1) * (o.roughness ?? .08) * (baseY - crestY);
    pts.push({ x: x0 + (x1 - x0) * t, y });
  }
  const top = smoothThrough(pts, false, .5);
  const A = top.subpaths[0].anchors;
  A.push({ x: x1, y: bottom, kind: 'corner' }, { x: x0, y: bottom, kind: 'corner' });
  return { fillRule: 'nonzero', subpaths: [{ anchors: A, closed: true }] };
}
/** Rolling ground / horizon band: a soft wavy top edge across the full width. */
export function ground(x0: number, x1: number, y: number, amp: number, o: HillOpts = {}): CompoundPath {
  const R = new Random(o.seed ?? 1); const nz = simplex2(R.int(0, 1e6)); const n = o.points ?? 8; const pts: Vec[] = [];
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push({ x: x0 + (x1 - x0) * t, y: y + nz(t * 1.7, .5) * amp }); }
  const top = smoothThrough(pts, false, .5); const A = top.subpaths[0].anchors; const bottom = o.bottom ?? y + 2000;
  A.push({ x: x1, y: bottom, kind: 'corner' }, { x: x0, y: bottom, kind: 'corner' });
  return { fillRule: 'nonzero', subpaths: [{ anchors: A, closed: true }] };
}
/** An open wave line (sea, ribbon, text baseline). */
export function wave(x0: number, x1: number, y: number, amp: number, wavelength: number, phase = 0, irregular = 0, seed: number | string = 1): CompoundPath {
  const R = new Random(seed); const pts: Vec[] = []; const n = Math.max(4, Math.round((x1 - x0) / wavelength * 4));
  for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n; pts.push({ x, y: y + Math.sin((x - x0) / wavelength * TAU + phase) * amp * (1 + R.jit(irregular)) }); }
  return smoothThrough(pts, false, .5);
}
/** A rounded rock / pebble. */
export function rock(cx: number, cy: number, w: number, h: number, seed: number | string = 1): CompoundPath {
  const R = new Random(seed); const pts: Vec[] = []; const n = 7;
  for (let i = 0; i < n; i++) { const a = Math.PI + i / (n - 1) * Math.PI; const k = 1 + R.jit(.12); pts.push({ x: cx + Math.cos(a) * w / 2 * k, y: cy + Math.sin(a) * h * k }); }
  pts.push({ x: cx + w / 2 * .92, y: cy + h * .06 }, { x: cx - w / 2 * .92, y: cy + h * .06 });
  return smoothThrough(pts, true, .4);
}
/** A tapered grass blade / tuft spine set (open spines; draw with Scene.ink + PROFILES.tail). */
export function grassBlades(x: number, y: number, n: number, height: number, spread: number, seed: number | string = 1): CompoundPath[] {
  const R = new Random(seed); const out: CompoundPath[] = [];
  for (let i = 0; i < n; i++) {
    const bx = x + R.jit(spread / 2); const h = height * R.float(.55, 1.1); const lean = R.jit(.45) + (bx - x) / Math.max(1, spread) * .6;
    out.push(smoothThrough([{ x: bx, y }, { x: bx + lean * h * .25, y: y - h * .5 }, { x: bx + lean * h * .7, y: y - h }], false));
  }
  return out;
}
/** A petal (teardrop) from centre outward at angle (deg). */
export function petal(cx: number, cy: number, len: number, width: number, angleDeg: number): CompoundPath {
  const a = angleDeg * Math.PI / 180; const tip = { x: cx + Math.cos(a) * len, y: cy + Math.sin(a) * len };
  return leaf({ x: cx, y: cy }, tip, { width: width / len, asym: 0, bend: 0, tipSharp: .9 });
}
/** Four-point sparkle (twinkle). */
export function sparkle(cx: number, cy: number, r: number, pinch = .18): CompoundPath {
  const pts: Vec[] = []; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2; const rr = i % 2 ? r * pinch : r; pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr }); }
  const p = polyPath(pts, true); const A = p.subpaths[0].anchors;
  // concave sides: pull the inner points' handles toward the centre for curved arms
  for (let i = 1; i < 8; i += 2) { const q = A[i]; q.hin = { x: q.x + (cx - q.x) * .2, y: q.y + (cy - q.y) * .2 }; q.hout = q.hin; }
  return p;
}
/** Crescent moon (boolean of two circles). phase 0..1 = thickness. */
export function crescent(cx: number, cy: number, r: number, phase = .45, tiltDeg = -20): CompoundPath {
  const a = tiltDeg * Math.PI / 180; const off = r * (1 - phase) * 1.15 + r * .15;
  return boolean('subtract', [circlePath(cx, cy, r), circlePath(cx + Math.cos(a) * off, cy + Math.sin(a) * off, r * .96)]);
}
