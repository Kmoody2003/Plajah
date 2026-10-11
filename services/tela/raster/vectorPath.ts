// raster/vectorPath — Bézier path flattening + anti-aliased polygon coverage.
//
// Used by vector masks, lasso / polygonal-lasso selections, marquee shapes and the
// selection → path round trip. Coverage = exact horizontal span coverage on 5 sub-scanlines
// per pixel (nonzero winding), which is visually indistinguishable from analytic AA at
// marquee/mask scales and cheap enough for 8k masks in a worker.

import type { Affine, VectorSubpath } from './model';

export type Pt = [number, number];

/** Flatten one subpath to a polygon (after applying m), adaptive on curve length. */
export function flattenSubpath(sp: VectorSubpath, m: Affine = [1, 0, 0, 1, 0, 0], tolerance = 0.25): Pt[] {
  const tr = (x: number, y: number): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const pts = sp.points, out: Pt[] = []; if (!pts.length) return out;
  const n = sp.closed ? pts.length : pts.length - 1;
  out.push(tr(pts[0].x, pts[0].y));
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const c1 = a.out || a, c2 = b.in || b;
    const straight = !a.out && !b.in;
    if (straight) { out.push(tr(b.x, b.y)); continue; }
    const P0 = tr(a.x, a.y), P1 = tr(c1.x, c1.y), P2 = tr(c2.x, c2.y), P3 = tr(b.x, b.y);
    const len = Math.hypot(P1[0] - P0[0], P1[1] - P0[1]) + Math.hypot(P2[0] - P1[0], P2[1] - P1[1]) + Math.hypot(P3[0] - P2[0], P3[1] - P2[1]);
    const steps = Math.max(2, Math.min(512, Math.ceil(Math.sqrt(len / tolerance))));
    for (let k = 1; k <= steps; k++) {
      const t = k / steps, u = 1 - t;
      out.push([u * u * u * P0[0] + 3 * u * u * t * P1[0] + 3 * u * t * t * P2[0] + t * t * t * P3[0], u * u * u * P0[1] + 3 * u * u * t * P1[1] + 3 * u * t * t * P2[1] + t * t * t * P3[1]]);
    }
  }
  return out;
}

/** Anti-aliased nonzero coverage (0..1) of polygons in a W×H grid. */
export function rasterizePolygons(polys: Pt[][], W: number, H: number, evenOdd = false): Float32Array {
  const cov = new Float32Array(W * H), SUB = 5, acc = new Float32Array(W + 2);
  const edges: { x0: number; y0: number; x1: number; y1: number; dir: number }[] = [];
  let minY = Infinity, maxY = -Infinity;
  for (const p of polys) for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length]; if (a[1] === b[1]) continue;
    const dir = a[1] < b[1] ? 1 : -1; const [lo, hi] = dir > 0 ? [a, b] : [b, a];
    edges.push({ x0: lo[0], y0: lo[1], x1: hi[0], y1: hi[1], dir }); minY = Math.min(minY, lo[1]); maxY = Math.max(maxY, hi[1]);
  }
  if (!edges.length) return cov;
  edges.sort((p, q) => p.y0 - q.y0);
  const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(H - 1, Math.ceil(maxY));
  const xs: { x: number; d: number }[] = [];
  for (let y = y0; y <= y1; y++) {
    acc.fill(0);
    for (let s = 0; s < SUB; s++) {
      const sy = y + (s + 0.5) / SUB; xs.length = 0;
      for (const e of edges) { if (e.y0 > sy) break; if (e.y1 <= sy) continue; xs.push({ x: e.x0 + (sy - e.y0) * (e.x1 - e.x0) / (e.y1 - e.y0), d: e.dir }); }
      xs.sort((p, q) => p.x - q.x);
      let wind = 0;
      for (let k = 0; k < xs.length - 1; k++) {
        wind = evenOdd ? wind ^ 1 : wind + xs[k].d;
        if (!wind) continue;
        span(acc, Math.max(0, xs[k].x), Math.min(W, xs[k + 1].x), 1 / SUB, W);
      }
    }
    const row = y * W; for (let x = 0; x < W; x++) cov[row + x] = Math.min(1, acc[x]);
  }
  return cov;
}
/** Add `w` × horizontal coverage of [xa, xb) to acc (fractional end pixels). */
function span(acc: Float32Array, xa: number, xb: number, w: number, W: number) {
  if (xb <= xa) return;
  const ia = Math.floor(xa), ib = Math.floor(xb);
  if (ia === ib) { if (ia < W) acc[ia] += (xb - xa) * w; return; }
  acc[ia] += (ia + 1 - xa) * w;
  for (let i = ia + 1; i < ib && i < W; i++) acc[i] += w;
  if (ib < W) acc[ib] += (xb - ib) * w;
}

/** Combine subpaths with their Photoshop path operations into one coverage map. */
export function rasterizeSubpaths(subpaths: VectorSubpath[], W: number, H: number, m: Affine = [1, 0, 0, 1, 0, 0]): Float32Array {
  let out: Float32Array | null = null;
  for (const sp of subpaths) {
    const c = rasterizePolygons([flattenSubpath({ ...sp, closed: true }, m)], W, H);
    if (!out) { out = sp.op === 'subtract' ? c.map(v => 0 * v) : c; if (sp.op !== 'subtract') continue; }
    const op = sp.op || 'add';
    for (let i = 0; i < out.length; i++) {
      const a = out[i], b = c[i];
      out[i] = op === 'add' ? a + b - a * b : op === 'subtract' ? a * (1 - b) : op === 'intersect' ? a * b : a + b - 2 * a * b;
    }
  }
  return out || new Float32Array(W * H);
}

/** Path from polygon points (straight segments) — used by lasso → path. */
export function polygonToSubpath(poly: Pt[], closed = true): VectorSubpath { return { closed, points: poly.map(([x, y]) => ({ x, y })) }; }
