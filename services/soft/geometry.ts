// Flat-pattern geometry for sewing and plush: polygons in millimetres, y up. Seam lines are drafted
// counter-clockwise; the cutting line is the seam line pushed outward by a per-edge seam allowance
// (0 on a fold, deeper on hems). Curves are sampled cubic Béziers so every piece is a plain polygon
// that DXF, SVG, PDF and the marker all read the same way.

export type Pt = [number, number];

export const area = (p: Pt[]) => { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
export const ccw = (p: Pt[]) => (area(p) < 0 ? [...p].reverse() : p);
export const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
export const pathLength = (p: Pt[], closed = false) => { let s = 0; for (let i = 1; i < p.length; i++) s += dist(p[i - 1], p[i]); return closed && p.length > 1 ? s + dist(p[p.length - 1], p[0]) : s; };
export function bbox(p: Pt[]) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of p) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; } return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 }; }

/** Cubic Bézier from a to b with controls c1, c2, sampled into n segments (a excluded, b included). */
export function bez(a: Pt, c1: Pt, c2: Pt, b: Pt, n = 16): Pt[] {
  const out: Pt[] = [];
  for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t; out.push([u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b[0], u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b[1]]); }
  return out;
}

/** Drop points closer than eps to the previous one, and the closing duplicate. */
export function clean(p: Pt[], eps = 0.05): Pt[] {
  const out: Pt[] = []; for (const q of p) if (!out.length || dist(out[out.length - 1], q) > eps) out.push(q);
  while (out.length > 2 && dist(out[0], out[out.length - 1]) <= eps) out.pop();
  return out;
}

/** Douglas-Peucker on a closed ring. */
export function simplify(p: Pt[], tol = 0.3): Pt[] {
  if (p.length < 8) return p;
  const rdp = (pts: Pt[]): Pt[] => {
    if (pts.length < 3) return pts; const a = pts[0], b = pts[pts.length - 1]; const L = dist(a, b) || 1e-9;
    let worst = 0, idx = 0; for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs((b[0] - a[0]) * (a[1] - pts[i][1]) - (a[0] - pts[i][0]) * (b[1] - a[1])) / L; if (d > worst) { worst = d; idx = i; } }
    return worst > tol ? [...rdp(pts.slice(0, idx + 1)).slice(0, -1), ...rdp(pts.slice(idx))] : [a, b];
  };
  // Split the ring at its two farthest-apart points so both halves are open chains.
  let far = 0; for (let i = 1; i < p.length; i++) if (dist(p[0], p[i]) > dist(p[0], p[far])) far = i;
  const h1 = rdp(p.slice(0, far + 1)), h2 = rdp([...p.slice(far), p[0]]);
  return [...h1.slice(0, -1), ...h2.slice(0, -1)];
}

/**
 * Offset a CCW polygon outward; d[i] is the distance for edge i (p[i] → p[i+1]). Corners are mitred,
 * and bevelled when the mitre would run past 3× the allowance (sharp plush points, notches).
 */
export function offset(p: Pt[], d: number | number[]): Pt[] {
  const n = p.length; const D = (i: number) => (typeof d === 'number' ? d : d[(i + n) % n] ?? 0);
  const nrm = (i: number): Pt => { const a = p[(i + n) % n], b = p[(i + 1) % n]; const L = dist(a, b) || 1e-9; return [(b[1] - a[1]) / L, -(b[0] - a[0]) / L]; };
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const n0 = nrm(i - 1), n1 = nrm(i), d0 = D(i - 1), d1 = D(i); const v = p[i];
    const a0: Pt = [v[0] + n0[0] * d0, v[1] + n0[1] * d0], a1: Pt = [v[0] + n1[0] * d1, v[1] + n1[1] * d1];
    // Intersect the two offset lines (directions are the edge directions).
    const t0: Pt = [-n0[1], n0[0]], t1: Pt = [-n1[1], n1[0]]; const den = t0[0] * t1[1] - t0[1] * t1[0];
    if (Math.abs(den) < 1e-6) { if (Math.abs(d0 - d1) < 1e-6) out.push(a1); else out.push(a0, a1); continue; }
    const s = ((a1[0] - a0[0]) * t1[1] - (a1[1] - a0[1]) * t1[0]) / den; const m: Pt = [a0[0] + t0[0] * s, a0[1] + t0[1] * s];
    const lim = 3 * Math.max(d0, d1, 1);
    if (dist(m, v) > lim) out.push(a0, a1); else out.push(m);
  }
  return out;
}

/** Mirror a polygon across the line through a and b. */
export function mirror(p: Pt[], a: Pt, b: Pt): Pt[] {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-9;
  return p.map(([x, y]) => { const t = ((x - a[0]) * dx + (y - a[1]) * dy) / L2; const fx = a[0] + t * dx, fy = a[1] + t * dy; return [2 * fx - x, 2 * fy - y] as Pt; });
}

/** Point at arc length s along an open polyline. */
export function pointAt(p: Pt[], s: number): Pt {
  for (let i = 1; i < p.length; i++) { const L = dist(p[i - 1], p[i]); if (s <= L) { const t = L ? s / L : 0; return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t]; } s -= L; }
  return p[p.length - 1];
}

/** Ellipse perimeter (Ramanujan II). */
export const ellipsePerimeter = (a: number, b: number) => { const h = ((a - b) / (a + b)) ** 2; return Math.PI * (a + b) * (1 + 3 * h / (10 + Math.sqrt(4 - 3 * h))); };
export const ellipse = (cx: number, cy: number, a: number, b: number, n = 48): Pt[] => Array.from({ length: n }, (_, i) => [cx + a * Math.cos(i / n * 2 * Math.PI), cy + b * Math.sin(i / n * 2 * Math.PI)] as Pt);
export const rect = (x: number, y: number, w: number, h: number): Pt[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

/** Iso-contour (level 0) of a signed distance function sampled on a grid: the outer ring, CCW. */
export function contour(sdf: (x: number, y: number) => number, x0: number, y0: number, x1: number, y1: number, cell = 1.5): Pt[] {
  const nx = Math.ceil((x1 - x0) / cell) + 1, ny = Math.ceil((y1 - y0) / cell) + 1; const v = new Float64Array(nx * ny);
  // Nudge exact zeros off the level so no contour point lands on a grid corner shared by four cells.
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const s = sdf(x0 + i * cell, y0 + j * cell); v[j * nx + i] = s === 0 ? 1e-9 : s; }
  // Contour points are keyed by the grid edge they sit on, so neighbouring cells share them exactly.
  const next = new Map<string, string>(); const pts = new Map<string, Pt>();
  const lerp = (i0: number, j0: number, i1: number, j1: number): Pt => { const a = v[j0 * nx + i0], b = v[j1 * nx + i1]; const t = a / (a - b); return [x0 + (i0 + (i1 - i0) * t) * cell, y0 + (j0 + (j1 - j0) * t) * cell]; };
  const at = (k: string, i0: number, j0: number, i1: number, j1: number) => { if (!pts.has(k)) pts.set(k, lerp(i0, j0, i1, j1)); return k; };
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = v[j * nx + i] < 0, b = v[j * nx + i + 1] < 0, c = v[(j + 1) * nx + i + 1] < 0, d = v[(j + 1) * nx + i] < 0;
    const code = (a ? 1 : 0) | (b ? 2 : 0) | (c ? 4 : 0) | (d ? 8 : 0); if (code === 0 || code === 15) continue;
    const E = { s: () => at(`h${i},${j}`, i, j, i + 1, j), e: () => at(`v${i + 1},${j}`, i + 1, j, i + 1, j + 1), n: () => at(`h${i},${j + 1}`, i, j + 1, i + 1, j + 1), w: () => at(`v${i},${j}`, i, j, i, j + 1) };
    // Every segment keeps the inside on the same side, so loops chain head to tail.
    const segs: Array<[keyof typeof E, keyof typeof E]> = ({ 1: [['w', 's']], 2: [['s', 'e']], 3: [['w', 'e']], 4: [['e', 'n']], 5: [['w', 'n'], ['e', 's']], 6: [['s', 'n']], 7: [['w', 'n']], 8: [['n', 'w']], 9: [['n', 's']], 10: [['n', 'e'], ['s', 'w']], 11: [['n', 'e']], 12: [['e', 'w']], 13: [['e', 's']], 14: [['s', 'w']] } as Record<number, Array<[keyof typeof E, keyof typeof E]>>)[code];
    for (const [f, t] of segs) next.set(E[f](), E[t]());
  }
  // Walk every loop; keep the longest (the outer outline).
  const seen = new Set<string>(); let best: Pt[] = [];
  for (const start of next.keys()) {
    if (seen.has(start)) continue; const ring: Pt[] = []; let k = start;
    while (!seen.has(k) && next.has(k)) { seen.add(k); ring.push(pts.get(k)!); k = next.get(k)!; }
    if (ring.length > best.length) best = ring;
  }
  return ccw(clean(best));
}

// Signed distance primitives and smooth union (Inigo Quilez), for plush silhouettes.
export const sdCircle = (x: number, y: number, cx: number, cy: number, r: number) => Math.hypot(x - cx, y - cy) - r;
export const sdEllipse = (x: number, y: number, cx: number, cy: number, a: number, b: number) => { const k = Math.hypot((x - cx) / a, (y - cy) / b); return (k - 1) * Math.min(a, b); };
export function sdCapsule(x: number, y: number, a: Pt, b: Pt, r: number) { const pax = x - a[0], pay = y - a[1], bax = b[0] - a[0], bay = b[1] - a[1]; const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay))); return Math.hypot(pax - bax * h, pay - bay * h) - r; }
export const smin = (a: number, b: number, k: number) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k / 4; };
