// Rounds the corners of a closed circuit centre line and resamples it evenly.
//
// The city circuit is a polyline with a point every 22 m, so every corner is a single sharp vertex (up to 94 degrees). Everything built from that line, the road ribbon,
// the barriers laid along its two edges, the kerbs and the racing line, breaks at such a vertex: the inside edge folds back on itself and the outside edge jumps across the
// corner as a chord. Replacing each vertex with a tangent arc, and putting the points an even distance apart, gives every one of those a smooth curve to follow.

export interface SmoothPath { xz: number[][]; y: number[] }

/**
 * @param radius      the arc radius wanted at each corner (m); where the neighbouring segments are too short for it, the arc is as big as they allow (half of each segment)
 * @param step        spacing of the output points (m)
 */
export function smoothClosedPath(xz: number[][], y: number[] | undefined, radius = 14, step = 6): SmoothPath {
  let pts = xz.map((p, i) => ({ x: p[0], z: p[1], y: y ? y[i] : 0 }));
  if (pts.length > 2 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].z - pts[pts.length - 1].z) < 0.5) pts = pts.slice(0, -1);     // the closing point repeats the first
  const n = pts.length;
  const poly: { x: number; z: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
    const l1 = Math.hypot(b.x - a.x, b.z - a.z), l2 = Math.hypot(c.x - b.x, c.z - b.z);
    if (l1 < 1e-6 || l2 < 1e-6) { poly.push(b); continue; }
    const u1x = (b.x - a.x) / l1, u1z = (b.z - a.z) / l1, u2x = (c.x - b.x) / l2, u2z = (c.z - b.z) / l2;
    const cross = u1x * u2z - u1z * u2x, dot = u1x * u2x + u1z * u2z;
    const theta = Math.atan2(Math.abs(cross), dot);                      // how far the road turns here
    if (theta < 0.06) { poly.push(b); continue; }                         // near enough straight
    const t = Math.tan(theta / 2);
    const d = Math.min(radius * t, 0.5 * l1, 0.5 * l2), r = d / t;       // tangent distance and the radius that gives
    const t1 = { x: b.x - u1x * d, z: b.z - u1z * d, y: a.y + (b.y - a.y) * (1 - d / l1) }, t2 = { x: b.x + u2x * d, z: b.z + u2z * d, y: b.y + (c.y - b.y) * (d / l2) };
    const side = cross > 0 ? 1 : -1;                                      // which way the centre of the arc lies
    const cx = t1.x + -u1z * r * side, cz = t1.z + u1x * r * side;
    const a0 = Math.atan2(t1.z - cz, t1.x - cx);
    const steps = Math.max(2, Math.ceil(theta / 0.12));
    for (let k = 0; k <= steps; k++) {
      const f = k / steps, ang = a0 + side * theta * f;                    // the arc turns the same way the road does
      poly.push({ x: cx + Math.cos(ang) * r, z: cz + Math.sin(ang) * r, y: t1.y + (t2.y - t1.y) * f });
    }
  }
  // resample evenly by arc length around the loop
  const m = poly.length, cum = [0];
  for (let i = 0; i < m; i++) { const p = poly[i], q = poly[(i + 1) % m]; cum.push(cum[i] + Math.hypot(q.x - p.x, q.z - p.z)); }
  const total = cum[m], cnt = Math.max(8, Math.round(total / step)), ds = total / cnt;
  const out: SmoothPath = { xz: [], y: [] };
  let j = 0;
  for (let k = 0; k < cnt; k++) {
    const s = k * ds;
    while (j < m - 1 && cum[j + 1] < s) j++;
    const p = poly[j], q = poly[(j + 1) % m], seg = cum[j + 1] - cum[j] || 1, f = (s - cum[j]) / seg;
    out.xz.push([p.x + (q.x - p.x) * f, p.z + (q.z - p.z) * f]); out.y.push(p.y + (q.y - p.y) * f);
  }
  return out;
}
