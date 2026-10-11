// stroke — stroke geometry: Outline Stroke / Expand Appearance with caps, joins, dashes,
// alignment, and VARIABLE-WIDTH strokes (the width-tool / ink-pen look).
//
// Constant width: both sides are true curve offsets (offset.ts) with real joins and caps;
// the closed outline is then resolved with the nonzero rule, which unions self-overlaps.
// Variable width: the spine is sampled by arc length, each side is displaced by its own
// half-width w(u), and the side polylines are refitted to cubics (Schneider, fit.ts) —
// corners in the spine are preserved as corners. Ends can be capped or tapered to a point.
// Dashes follow SVG semantics (offset, odd-length patterns repeat twice) plus Illustrator's
// "align dashes to corners and path ends", which rescales each corner-to-corner run so a
// dash is centred on every corner.
import type { Vec } from './vec';
import type { CompoundPath, Curve, LineCap, LineJoin, SubPath, AnchorKind } from './model';
import { subpathCurves, curvesToSubpath, lineCurve } from './model';
import { arcTable, locate, subCurve, tangent, point, length, pointAtLength, normal } from './bezier';
import { offsetChain, capCurves, fixChain, joinCurves } from './offset';
import { resolve, boolean } from './boolean';
import { fitCurve } from './fit';

export interface StrokeOpts {
  width: number; cap?: LineCap; join?: LineJoin; miterLimit?: number;
  dash?: number[]; dashOffset?: number; alignDashes?: boolean;
  /** inside/outside need the filled shape (closed paths); center otherwise. */
  align?: 'center' | 'inside' | 'outside';
  tol?: number;
}

/** Outline a stroke into filled geometry (nonzero, overlap-free). */
export function outlineStroke(p: CompoundPath, o: StrokeOpts): CompoundPath {
  if (o.width <= 0) return { fillRule: 'nonzero', subpaths: [] };
  if (o.align && o.align !== 'center' && p.subpaths.some(s => s.closed)) {
    const wide = outlineStroke(p, { ...o, width: o.width * 2, align: 'center' });
    const fill = resolve({ fillRule: p.fillRule, subpaths: p.subpaths.filter(s => s.closed) });
    return o.align === 'inside' ? boolean('intersect', [wide, fill]) : boolean('subtract', [wide, fill]);
  }
  const src = o.dash && o.dash.some(d => d > 0) ? dashPath(p, o.dash, o.dashOffset ?? 0, !!o.alignDashes) : p;
  const loops: SubPath[] = [];
  const h = o.width / 2, cap = o.cap ?? 'butt', join = o.join ?? 'miter', ml = o.miterLimit ?? 4, tol = o.tol ?? Math.max(.01, h * .004);
  for (const s of src.subpaths) {
    const cs = subpathCurves(s).filter(c => length(c) > 1e-9);
    if (!cs.length) {
      // a zero-length subpath draws a dot with round/square caps (SVG semantics)
      if (s.anchors.length && cap !== 'butt') { const a = s.anchors[0]; loops.push(curvesToSubpath(fixChain([...capCurves(a, { x: 1, y: 0 }, h, h, cap), ...capCurves(a, { x: -1, y: 0 }, h, h, cap)]), true)); }
      continue;
    }
    if (s.closed) {
      const L = offsetChain(cs, true, h, { join, miterLimit: ml, tol });
      const R = offsetChain(cs, true, -h, { join, miterLimit: ml, tol });
      loops.push(curvesToSubpath(fixChain(L), true));
      loops.push(curvesToSubpath(fixChain(reverseChain(R)), true));
    } else {
      const L = offsetChain(cs, false, h, { join, miterLimit: ml, tol });
      const R = offsetChain(cs, false, -h, { join, miterLimit: ml, tol });
      const last = cs[cs.length - 1], first = cs[0];
      const t1 = tangent(last, 1), t0 = tangent(first, 0);
      const chain = [...L, ...capCurves(last.p3, t1, h, h, cap), ...reverseChain(R), ...capCurves(first.p0, { x: -t0.x, y: -t0.y }, h, h, cap)];
      loops.push(curvesToSubpath(fixChain(chain), true));
    }
  }
  return resolve({ fillRule: 'nonzero', subpaths: loops }, 'nonzero');
}
export function reverseChain(cs: Curve[]): Curve[] { return cs.slice().reverse().map(c => ({ p0: c.p3, p1: c.p2, p2: c.p1, p3: c.p0, line: c.line })); }

// ── Dashes ──────────────────────────────────────────────────────────────────────────

/** Cut a path into dash pieces (open subpaths). */
export function dashPath(p: CompoundPath, pattern: number[], offset = 0, alignToCorners = false): CompoundPath {
  let pat = pattern.filter(x => x >= 0); if (pat.length % 2) pat = pat.concat(pat);
  const P = pat.reduce((a, b) => a + b, 0); if (P <= 0) return p;
  const out: SubPath[] = [];
  for (const s of p.subpaths) {
    const cs = subpathCurves(s); if (!cs.length) continue;
    if (alignToCorners) {
      const runs = splitRuns(cs, s); const pieces: Curve[][] = [];
      for (const run of runs) {
        const tab = arcTable(run); const L = tab.total; const d0 = pat[0];
        // half a dash at each end + whole patterns between: L = n·P exactly, phase d0/2
        void d0; const n = Math.max(1, Math.round(L / P)); const k = L / (n * P);
        const sp = pat.map(x => x * k);
        pieces.push(...dashRun(tab, sp, sp[0] / 2));
      }
      out.push(...joinTouching(pieces, s.closed).map(c => curvesToSubpath(c, false)));
    } else {
      const tab = arcTable(cs);
      const pcs = dashRun(tab, pat, ((offset % P) + P) % P);
      out.push(...joinTouching(pcs, s.closed).map(c => curvesToSubpath(c, false)));
    }
  }
  return { fillRule: p.fillRule, subpaths: out };
}
/** Split a subpath's curves into runs at corner anchors (for dash alignment). */
function splitRuns(cs: Curve[], s: SubPath): Curve[][] {
  const runs: Curve[][] = [[]];
  cs.forEach((c, i) => {
    if (i > 0) { const k: AnchorKind | undefined = s.anchors[i]?.kind; const a = tangent(cs[i - 1], 1), b = tangent(c, 0); const corner = k === 'corner' ? Math.abs(a.x * b.y - a.y * b.x) > .02 || a.x * b.x + a.y * b.y < 0 : false; if (corner) runs.push([]); }
    runs[runs.length - 1].push(c);
  });
  if (s.closed && runs.length > 1) {
    // the seam is a corner only if the first anchor is
    const a = tangent(cs[cs.length - 1], 1), b = tangent(cs[0], 0);
    if (!(Math.abs(a.x * b.y - a.y * b.x) > .02 || a.x * b.x + a.y * b.y < 0)) { const first = runs.shift()!; runs[runs.length - 1].push(...first); }
  }
  return runs;
}
/** Walk the pattern along an arc table starting at `phase` into the pattern. */
function dashRun(tab: ReturnType<typeof arcTable>, pat: number[], phase: number): Curve[][] {
  const P = pat.reduce((a, b) => a + b, 0); const out: Curve[][] = [];
  let idx = 0, rem = 0; let ph = phase % P;
  while (ph >= pat[idx]) { ph -= pat[idx]; idx = (idx + 1) % pat.length; }
  rem = pat[idx] - ph;
  let s = 0; let guard = 0;
  while (s < tab.total - 1e-9 && guard++ < 1e6) {
    const e = Math.min(tab.total, s + rem);
    if (idx % 2 === 0 && e - s > 1e-9) out.push(extract(tab, s, e));
    s = e; idx = (idx + 1) % pat.length; rem = pat[idx];
    if (rem <= 0 && pat.every(x => x <= 0)) break;
  }
  return out;
}
/** The curves covering arc length [s0, s1]. */
export function extract(tab: ReturnType<typeof arcTable>, s0: number, s1: number): Curve[] {
  const a = locate(tab, s0), b = locate(tab, s1); const out: Curve[] = [];
  for (let i = a.i; i <= b.i; i++) {
    const t0 = i === a.i ? a.t : 0, t1 = i === b.i ? b.t : 1;
    if (t1 - t0 > 1e-12) out.push(subCurve(tab.curves[i], t0, t1));
  }
  return out;
}
function joinTouching(pieces: Curve[][], closed: boolean): Curve[][] {
  const out: Curve[][] = [];
  for (const p of pieces) {
    const prev = out[out.length - 1];
    if (prev && p.length && near(prev[prev.length - 1].p3, p[0].p0)) prev.push(...p); else if (p.length) out.push(p.slice());
  }
  if (closed && out.length > 1) { const f = out[0], l = out[out.length - 1]; if (near(l[l.length - 1].p3, f[0].p0)) { out[0] = [...l, ...f]; out.pop(); } }
  return out;
}
const near = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;

// ── Variable width ──────────────────────────────────────────────────────────────────

/** Width profile point: at u ∈ [0,1] along the length, half-widths left/right (px). */
export interface WidthPoint { u: number; left: number; right?: number }
export type WidthProfile = WidthPoint[] | ((u: number) => number | [number, number]);

/** Built-in width profiles (full widths as a fraction of `width`). */
export const PROFILES = {
  uniform: (_u: number) => 1,
  /** Pen ink: swells in the middle, fine at both ends. */
  ink: (u: number) => .18 + .82 * Math.sin(Math.PI * Math.min(1, Math.max(0, u))) ** .7,
  /** Brush: heavy entry, long tapering tail. */
  brush: (u: number) => Math.max(.04, Math.min(1, u * 7) * (1 - u) ** .8 * 1.25),
  /** Taper both ends to a point. */
  taper: (u: number) => Math.sin(Math.PI * Math.min(1, Math.max(0, u))),
  /** Taper the end only (a tail, a hair, a leaf vein). */
  tail: (u: number) => (1 - u) ** .85,
  /** Taper the start only (a stroke that lands then lifts). */
  head: (u: number) => Math.min(1, u * 1.15) ** .75,
  /** Comma / teardrop. */
  comma: (u: number) => Math.max(0, Math.sin(Math.PI * Math.pow(u, .55))),
};

function sampleProfile(prof: WidthProfile, u: number, width: number): [number, number] {
  if (typeof prof === 'function') { const r = prof(u); return Array.isArray(r) ? [r[0] * width / 2, r[1] * width / 2] : [r * width / 2, r * width / 2]; }
  const pts = prof.slice().sort((a, b) => a.u - b.u);
  if (!pts.length) return [width / 2, width / 2];
  if (u <= pts[0].u) return [pts[0].left, pts[0].right ?? pts[0].left];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    if (u <= b.u) { const t = (u - a.u) / Math.max(1e-12, b.u - a.u); const s = t * t * (3 - 2 * t); const ar = a.right ?? a.left, br = b.right ?? b.left; return [a.left + (b.left - a.left) * s, ar + (br - ar) * s]; }
  }
  const l = pts[pts.length - 1]; return [l.left, l.right ?? l.left];
}

export interface VariableOpts { width: number; profile: WidthProfile; cap?: LineCap; join?: LineJoin; /** Fit tolerance (px). */ tol?: number; /** Sampling step (px); default adapts to width. */ step?: number; /** Add a smooth wobble to the width (0..1) for hand-made ink. */ wobble?: number; seed?: number }

/** Variable-width stroke → filled outline (nonzero, overlap-free). */
export function variableStroke(p: CompoundPath, o: VariableOpts): CompoundPath {
  const loops: SubPath[] = [];
  for (const s of p.subpaths) {
    const cs = subpathCurves(s).filter(c => length(c) > 1e-9); if (!cs.length) continue;
    const tab = arcTable(cs); const L = tab.total; if (L < 1e-6) continue;
    const step = o.step ?? Math.max(.75, Math.min(6, o.width * .35, L / 24));
    // sample positions: uniform steps + every curve boundary (keeps corners sharp)
    const marks = new Set<number>(); for (let x = 0; x <= L; x += step) marks.add(x); marks.add(L); tab.cum.forEach(c => marks.add(Math.min(L, c)));
    const ss = [...marks].sort((a, b) => a - b).filter((x, i, a) => i === 0 || x - a[i - 1] > 1e-6);
    const wob = (u: number) => o.wobble ? 1 + o.wobble * .22 * (Math.sin(u * 23.1 + (o.seed ?? 0)) * .6 + Math.sin(u * 51.7 + (o.seed ?? 0) * 2.3) * .4) : 1;
    const left: Vec[] = [], right: Vec[] = []; const leftCorner: boolean[] = [], rightCorner: boolean[] = [];
    let prevI = -1;
    for (const sv of ss) {
      const u = s.closed ? sv / L : sv / L; const [wl0, wr0] = sampleProfile(o.profile, u, o.width); const k = wob(u); const wl = wl0 * k, wr = wr0 * k;
      const loc = locate(tab, sv); const c = tab.curves[loc.i]; const pt = point(c, loc.t);
      // at a curve boundary that is a corner, emit both sides' join geometry
      const atBoundary = loc.t < 1e-9 && loc.i > 0;
      if (atBoundary) {
        const iIn = loc.i - 1, iOut = loc.i;
        const tIn = tangent(tab.curves[iIn], 1), tOut = tangent(tab.curves[iOut], 0);
        const isCorner = Math.abs(tIn.x * tOut.y - tIn.y * tOut.x) > .01 || tIn.x * tOut.x + tIn.y * tOut.y < 0;
        if (isCorner) {
          const nIn = { x: -tIn.y, y: tIn.x }, nOut = { x: -tOut.y, y: tOut.x };
          const jl = joinCurves(pt, { x: pt.x + nIn.x * wl, y: pt.y + nIn.y * wl }, { x: pt.x + nOut.x * wl, y: pt.y + nOut.y * wl }, tIn, tOut, wl, o.join ?? 'round', 4);
          const jr = joinCurves(pt, { x: pt.x - nIn.x * wr, y: pt.y - nIn.y * wr }, { x: pt.x - nOut.x * wr, y: pt.y - nOut.y * wr }, tIn, tOut, -wr, o.join ?? 'round', 4);
          pushJoin(left, leftCorner, pt, nIn, wl, jl); pushJoin(right, rightCorner, pt, { x: -nIn.x, y: -nIn.y }, wr, jr);
          prevI = loc.i; continue;
        }
      }
      prevI = loc.i;
      const n = normal(c, loc.t);
      left.push({ x: pt.x + n.x * wl, y: pt.y + n.y * wl }); leftCorner.push(false);
      right.push({ x: pt.x - n.x * wr, y: pt.y - n.y * wr }); rightCorner.push(false);
    }
    const tol = o.tol ?? Math.max(.05, o.width * .01);
    if (s.closed) {
      loops.push(curvesToSubpath(fixChain(fitPolyline(left, leftCorner, tol, true)), true));
      loops.push(curvesToSubpath(fixChain(reverseChain(fitPolyline(right, rightCorner, tol, true))), true));
    } else {
      const cap = o.cap ?? 'round';
      const endP = pointAtLength(tab, L), startP = pointAtLength(tab, 0);
      const [el, er] = sampleProfile(o.profile, 1, o.width).map(x => x * wob(1)) as [number, number];
      const [sl, sr] = sampleProfile(o.profile, 0, o.width).map(x => x * wob(0)) as [number, number];
      const lc = fitPolyline(left, leftCorner, tol, false), rc = fitPolyline(right, rightCorner, tol, false);
      const endCap = el + er > 1e-6 ? capCurves(endP.p, endP.tan, el, er, cap) : [];
      const startCap = sl + sr > 1e-6 ? capCurves(startP.p, { x: -startP.tan.x, y: -startP.tan.y }, sr, sl, cap) : [];
      loops.push(curvesToSubpath(fixChain([...lc, ...endCap, ...reverseChain(rc), ...startCap]), true));
    }
  }
  return resolve({ fillRule: 'nonzero', subpaths: loops }, 'nonzero');
}
function pushJoin(side: Vec[], corner: boolean[], _pt: Vec, _n: Vec, _w: number, j: Curve[]) {
  if (!j.length) return;
  side.push(j[0].p0); corner.push(true);
  for (const c of j) { for (const t of [.25, .5, .75]) { side.push(point(c, t)); corner.push(false); } side.push(c.p3); corner.push(true); }
}
/** Fit a side polyline into cubics, splitting at corner flags. */
function fitPolyline(pts: Vec[], corner: boolean[], tol: number, closed: boolean): Curve[] {
  const clean: Vec[] = []; const cf: boolean[] = [];
  pts.forEach((p, i) => { const q = clean[clean.length - 1]; if (q && Math.hypot(q.x - p.x, q.y - p.y) < 1e-6) { cf[cf.length - 1] = cf[cf.length - 1] || corner[i]; return; } clean.push(p); cf.push(corner[i]); });
  if (closed) { clean.push(clean[0]); cf.push(true); }
  if (clean.length < 2) return [];
  const out: Curve[] = []; let start = 0;
  for (let i = 1; i < clean.length; i++) {
    if (cf[i] || i === clean.length - 1) {
      const run = clean.slice(start, i + 1);
      if (run.length === 2) out.push(lineCurve(run[0], run[1])); else if (run.length > 2) out.push(...fitCurve(run, tol));
      start = i;
    }
  }
  return out;
}

/** Stroke a path "the SVG way" but as geometry — convenience over outlineStroke for a single width. */
export const expandStroke = (p: CompoundPath, width: number, cap: LineCap = 'round', join: LineJoin = 'round') => outlineStroke(p, { width, cap, join });
export { lineCurve, curvesToSubpath };
void subCurve;
