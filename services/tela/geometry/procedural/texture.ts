// texture — mark-making inside any closed path: hatching, cross-hatching, contour
// hatching, stipple and halftone, all clipped exactly to the region (any fill rule),
// emitted as ONE compound path each so a heavily textured page stays a few objects.
//
// Hatch lines are found per scanline in a rotated frame: the region is flattened once,
// the crossings of each scanline are sorted and paired by the fill rule's winding, and
// each inside interval becomes a (slightly wobbled, optionally broken) stroke.
import type { Vec } from '../vec';
import type { CompoundPath, FillRule } from '../model';
import { flattenSubpath, pathBounds } from '../bezier';
import { smoothThrough, circlePath, polyPath } from '../shapes';
import { poisson, type PoissonOpts } from './scatter';
import { simplex2 } from './noise';
import { Random } from './random';
import { containsPoint } from '../boolean';

interface Seg { a: Vec; b: Vec }
/** Inside intervals along a line family. Returns segments in world coords. */
function scan(region: CompoundPath, angleDeg: number, spacing: number, offset = 0, rule: FillRule = region.fillRule): Seg[][] {
  const a = angleDeg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const toL = (p: Vec) => ({ x: p.x * c + p.y * s, y: -p.x * s + p.y * c }); const toW = (p: Vec) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c });
  const polys = region.subpaths.map(sp => flattenSubpath({ ...sp, closed: true }, .3).map(toL));
  let y0 = Infinity, y1 = -Infinity; for (const P of polys) for (const p of P) { y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  const rows: Seg[][] = [];
  for (let y = Math.floor((y0 - offset) / spacing) * spacing + offset + spacing * .5; y < y1; y += spacing) {
    const xs: Array<{ x: number; d: number }> = [];
    for (const P of polys) for (let i = 0; i < P.length; i++) {
      const p = P[i], q = P[(i + 1) % P.length];
      if ((p.y <= y && q.y > y) || (q.y <= y && p.y > y)) xs.push({ x: p.x + (y - p.y) / (q.y - p.y) * (q.x - p.x), d: q.y > p.y ? 1 : -1 });
    }
    xs.sort((u, v) => u.x - v.x); const row: Seg[] = []; let w = 0;
    for (let i = 0; i + 1 < xs.length; i++) {
      w += xs[i].d; const inside = rule === 'evenodd' ? Math.abs(w) % 2 === 1 : w !== 0;
      if (inside && xs[i + 1].x - xs[i].x > 1e-6) row.push({ a: toW({ x: xs[i].x, y }), b: toW({ x: xs[i + 1].x, y }) });
    }
    rows.push(row);
  }
  return rows;
}

export interface HatchOpts {
  angle?: number; spacing?: number; seed?: number | string;
  /** Hand wobble amplitude (px). */ wobble?: number;
  /** Probability a stroke is broken into dashes / skipped near edges (0..1). */ breakup?: number;
  /** Shorten each stroke at both ends by up to this many px (lifts off the edge like a real pen). */ inset?: number;
  /** Tone function 0..1: hatches are dropped where tone is low (light areas). */ tone?: (p: Vec) => number;
}
/** Parallel hatching clipped to a region → one open compound path (stroke it). */
export function hatch(region: CompoundPath, o: HatchOpts = {}): CompoundPath {
  const R = new Random(o.seed ?? 1); const nz = simplex2(R.int(0, 1e6)); const sp = o.spacing ?? 6; const wob = o.wobble ?? sp * .12; const inset = o.inset ?? sp * .4;
  const rows = scan(region, o.angle ?? 45, sp, R.float(0, sp));
  const subs: CompoundPath['subpaths'] = [];
  rows.forEach((row, ri) => row.forEach(seg => {
    const L = Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y); if (L < 1) return;
    const ux = (seg.b.x - seg.a.x) / L, uy = (seg.b.y - seg.a.y) / L;
    const i0 = R.float(0, inset), i1 = R.float(0, inset); if (L - i0 - i1 < 1) return;
    // break into pieces if requested
    const pieces: Array<[number, number]> = []; let s = i0;
    while (s < L - i1) { const len = o.breakup ? R.float(sp * 3, sp * 14) : L; const e = Math.min(L - i1, s + len); pieces.push([s, e]); s = e + (o.breakup && R.chance(o.breakup) ? R.float(sp * .5, sp * 2.5) : 0); if (!o.breakup) break; }
    for (const [s0, s1] of pieces) {
      const m = { x: seg.a.x + ux * (s0 + s1) / 2, y: seg.a.y + uy * (s0 + s1) / 2 };
      if (o.tone && R.next() > o.tone(m)) continue;
      const n = Math.max(2, Math.round((s1 - s0) / 14)); const pts: Vec[] = [];
      for (let k = 0; k <= n; k++) { const d = s0 + (s1 - s0) * k / n; const px = seg.a.x + ux * d, py = seg.a.y + uy * d; const off = nz(px * .03 + ri, py * .03) * wob; pts.push({ x: px - uy * off, y: py + ux * off }); }
      subs.push(...smoothThrough(pts, false, .5).subpaths);
    }
  }));
  return { fillRule: 'nonzero', subpaths: subs };
}
/** Cross-hatching: several hatch passes at different angles, darker tone → more passes. */
export function crossHatch(region: CompoundPath, o: HatchOpts & { angles?: number[]; tone?: (p: Vec) => number } = {}): CompoundPath {
  const angles = o.angles ?? [45, -45, 10];
  const subs: CompoundPath['subpaths'] = [];
  angles.forEach((a, i) => { const tone = o.tone; subs.push(...hatch(region, { ...o, angle: a, seed: `${o.seed ?? 1}/${i}`, tone: tone ? (p: Vec) => Math.max(0, Math.min(1, tone(p) * angles.length - i)) : undefined }).subpaths); });
  return { fillRule: 'nonzero', subpaths: subs };
}
/** Contour hatching: hatch lines that follow a field of directions (angle(p) in degrees). Short strokes. */
export function flowHatch(region: CompoundPath, angleAt: (p: Vec) => number, o: { spacing?: number; length?: number; seed?: number | string } = {}): CompoundPath {
  const sp = o.spacing ?? 7, len = o.length ?? sp * 3; const pts = poisson(null, { r: sp, region, seed: o.seed });
  const subs: CompoundPath['subpaths'] = [];
  for (const p of pts) {
    const line: Vec[] = [p]; let q = p;
    for (let k = 0; k < 4; k++) { const a = angleAt(q) * Math.PI / 180; q = { x: q.x + Math.cos(a) * len / 4, y: q.y + Math.sin(a) * len / 4 }; if (!containsPoint(region, q)) break; line.push(q); }
    if (line.length > 1) subs.push(...smoothThrough(line, false, .5).subpaths);
  }
  return { fillRule: 'nonzero', subpaths: subs };
}

/** Stipple: blue-noise dots in a region; tone(p) 0..1 controls density. One compound path. */
export function stipple(region: CompoundPath, o: { r?: number; dot?: number; tone?: (p: Vec) => number; seed?: number | string; dotJitter?: number } = {}): CompoundPath {
  const R = new Random(o.seed ?? 1); const opts: PoissonOpts = { r: o.r ?? 4, region, seed: o.seed, density: o.tone ? (x, y) => o.tone!({ x, y }) : undefined };
  const pts = poisson(null, opts); const dot = o.dot ?? 1;
  const subs: CompoundPath['subpaths'] = [];
  for (const p of pts) subs.push(...circlePath(p.x, p.y, dot * (1 + R.jit(o.dotJitter ?? .3))).subpaths);
  return { fillRule: 'nonzero', subpaths: subs };
}
/** Halftone: a rotated dot screen whose dot radius follows tone(p) (0 = no dot, 1 = touching). */
export function halftone(region: CompoundPath, tone: (p: Vec) => number, o: { cell?: number; angle?: number; shape?: 'dot' | 'line' } = {}): CompoundPath {
  const cell = o.cell ?? 8; const a = (o.angle ?? 45) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const b = pathBounds(region); const cx = b.x + b.w / 2, cy = b.y + b.h / 2; const half = Math.hypot(b.w, b.h) / 2 + cell;
  const subs: CompoundPath['subpaths'] = [];
  for (let v = -half; v <= half; v += cell) for (let u = -half; u <= half; u += cell) {
    const p = { x: cx + u * c - v * s, y: cy + u * s + v * c };
    if (p.x < b.x - cell || p.x > b.x + b.w + cell || p.y < b.y - cell || p.y > b.y + b.h + cell) continue;
    if (!containsPoint(region, p)) continue;
    const t = Math.max(0, Math.min(1, tone(p))); if (t < .02) continue;
    if (o.shape === 'line') { const h = cell * t * .5; subs.push(...polyPath([{ x: p.x - c * cell / 2 - s * h, y: p.y - s * cell / 2 + c * h }, { x: p.x + c * cell / 2 - s * h, y: p.y + s * cell / 2 + c * h }, { x: p.x + c * cell / 2 + s * h, y: p.y + s * cell / 2 - c * h }, { x: p.x - c * cell / 2 + s * h, y: p.y - s * cell / 2 - c * h }], true).subpaths); }
    else subs.push(...circlePath(p.x, p.y, cell * .62 * Math.sqrt(t)).subpaths);
  }
  return { fillRule: 'nonzero', subpaths: subs };
}
/** Tone helpers: light from a direction across a box (0 lit … 1 shadow). */
export function directionalTone(box: { x: number; y: number; w: number; h: number }, lightDeg = 225, contrast = 1): (p: Vec) => number {
  const a = lightDeg * Math.PI / 180; const lx = Math.cos(a), ly = Math.sin(a); const cx = box.x + box.w / 2, cy = box.y + box.h / 2; const r = Math.hypot(box.w, box.h) / 2 || 1;
  return p => Math.max(0, Math.min(1, .5 - ((p.x - cx) * lx + (p.y - cy) * ly) / r * .5 * contrast));
}
