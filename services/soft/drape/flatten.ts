// 3D → 2D: draw style lines on the avatar, flatten the enclosed surface into a new pattern piece.
// The region is picked on the body mesh through a cylindrical projection round the torso, offset
// by the ease you ask for, unwrapped onto the cylinder, then relaxed in 2D so every mesh edge keeps
// its 3D length (a mass-spring flattening). The style line itself is carried through the same map,
// so the outline follows what you drew rather than the mesh's stair steps. Distortion is reported.

import { type Pt, ccw, simplify, bbox, area } from '../geometry';
import type { Piece } from '../patterns';
import { type Body, type TriMesh, type V3, torsoAt } from './avatar';
import { pointInPoly } from './mesh';

export interface FlattenResult { piece: Piece; distortion: number; area3d: number; area2d: number; triangles: number }

export function flattenRegion(mesh: TriMesh, body: Body, loop: V3[], o: { ease?: number; allowance?: number; name?: string; id?: string } = {}): FlattenResult | null {
  if (loop.length < 3) return null; const P = mesh.positions, N = mesh.normals, I = mesh.indices; const ease = o.ease ?? 0;
  const ref = torsoAt(body, body.y.chest); const Rr = (ref.a + ref.b) / 2;
  // Cylindrical coordinates, unwrapped round the loop's mean angle.
  const ang0 = Math.atan2(loop.reduce((s, p) => s + Math.sin(Math.atan2(p[0], p[2])), 0), loop.reduce((s, p) => s + Math.cos(Math.atan2(p[0], p[2])), 0));
  const cyl = (x: number, y: number, z: number): Pt => { let a = Math.atan2(x, z) - ang0; while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return [a * Rr, y]; };
  const poly = loop.map(p => cyl(p[0], p[1], p[2]));
  const nt = I.length / 3; const sel: number[] = [];
  for (let t = 0; t < nt; t++) {
    const a = I[3 * t], b = I[3 * t + 1], c = I[3 * t + 2]; const cx = (P[3 * a] + P[3 * b] + P[3 * c]) / 3, cy = (P[3 * a + 1] + P[3 * b + 1] + P[3 * c + 1]) / 3, cz = (P[3 * a + 2] + P[3 * b + 2] + P[3 * c + 2]) / 3;
    if (!pointInPoly(cyl(cx, cy, cz), poly)) continue;
    // Torso only: facing outward from the body axis, not too far from it (arms excluded).
    const r = torsoAt(body, cy); const rad = Math.hypot(cx, cz - r.cz) || 1; const nx = N[3 * a] + N[3 * b] + N[3 * c], nz = N[3 * a + 2] + N[3 * b + 2] + N[3 * c + 2];
    if ((nx * cx + nz * (cz - r.cz)) / (rad * (Math.hypot(nx, nz) || 1)) < 0.2 || rad > Math.max(r.a, r.b) * 1.3 + 15) continue;
    sel.push(t);
  }
  if (sel.length < 4) return null;
  // Largest connected component.
  const adj = new Map<number, number[]>(); for (const t of sel) for (let k = 0; k < 3; k++) { const v = I[3 * t + k]; const l = adj.get(v); if (l) l.push(t); else adj.set(v, [t]); }
  const seen = new Set<number>(); let best: number[] = [];
  for (const t0 of sel) { if (seen.has(t0)) continue; const comp: number[] = []; const st = [t0]; seen.add(t0); while (st.length) { const t = st.pop()!; comp.push(t); for (let k = 0; k < 3; k++) for (const u of adj.get(I[3 * t + k]) ?? []) if (!seen.has(u)) { seen.add(u); st.push(u); } } if (comp.length > best.length) best = comp; }
  const vmap = new Map<number, number>(); const V3s: V3[] = []; const tris: Array<[number, number, number]> = [];
  for (const t of best) { const tri = [0, 1, 2].map(k => { const v = I[3 * t + k]; let j = vmap.get(v); if (j == null) { j = V3s.length; vmap.set(v, j); V3s.push([P[3 * v] + N[3 * v] * ease, P[3 * v + 1] + N[3 * v + 1] * ease, P[3 * v + 2] + N[3 * v + 2] * ease]); } return j; }) as [number, number, number]; tris.push(tri); }
  const U: Pt[] = V3s.map(p => cyl(p[0], p[1], p[2])); const edges = new Map<string, [number, number, number]>();
  const L3 = (a: number, b: number) => Math.hypot(V3s[a][0] - V3s[b][0], V3s[a][1] - V3s[b][1], V3s[a][2] - V3s[b][2]);
  for (const [a, b, c] of tris) for (const [u, v] of [[a, b], [b, c], [c, a]]) { const k = u < v ? `${u},${v}` : `${v},${u}`; if (!edges.has(k)) edges.set(k, [u, v, L3(u, v)]); }
  const E = [...edges.values()]; const U0 = U.map(p => [...p] as Pt);
  for (let it = 0; it < 400; it++) for (const [u, v, L] of E) { const dx = U[v][0] - U[u][0], dy = U[v][1] - U[u][1]; const d = Math.hypot(dx, dy) || 1e-9; const k = (d - L) / d * 0.5; U[u][0] += dx * k; U[u][1] += dy * k; U[v][0] -= dx * k; U[v][1] -= dy * k; }
  let dist = 0; for (const [u, v, L] of E) dist += Math.abs(Math.hypot(U[v][0] - U[u][0], U[v][1] - U[u][1]) - L) / L; dist /= E.length;
  // Carry the drawn loop through the map: densify in the cylinder plane, locate each sample in a
  // triangle of the unwrapped patch (pre-relaxation coordinates), take the same barycentrics after.
  const dense: Pt[] = []; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 8)); for (let k = 0; k < n; k++) dense.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); }
  const outline: Pt[] = [];
  for (const q of dense) {
    let hit: Pt | null = null, bestD = Infinity, fb: Pt | null = null;
    for (const [a, b, c] of tris) { const A = U0[a], B = U0[b], Cc = U0[c]; const det = (B[1] - Cc[1]) * (A[0] - Cc[0]) + (Cc[0] - B[0]) * (A[1] - Cc[1]); if (Math.abs(det) < 1e-9) continue;
      const l1 = ((B[1] - Cc[1]) * (q[0] - Cc[0]) + (Cc[0] - B[0]) * (q[1] - Cc[1])) / det, l2 = ((Cc[1] - A[1]) * (q[0] - Cc[0]) + (A[0] - Cc[0]) * (q[1] - Cc[1])) / det, l3 = 1 - l1 - l2;
      const p: Pt = [U[a][0] * l1 + U[b][0] * l2 + U[c][0] * l3, U[a][1] * l1 + U[b][1] * l2 + U[c][1] * l3];
      if (l1 >= -1e-6 && l2 >= -1e-6 && l3 >= -1e-6) { hit = p; break; }
      const d = Math.max(-l1, -l2, -l3); if (d < bestD) { bestD = d; fb = p; } }
    const p = hit ?? fb; if (p) outline.push(p);
  }
  let ring = ccw(simplify(outline, 0.8)); if (ring.length < 3) return null;
  // Grain: the flat direction along which height on the body rises fastest (least-squares fit of
  // each vertex's height against its flat position; edge sums would pick up the mesh's diagonal bias).
  const mu = U.reduce((a, p) => [a[0] + p[0] / U.length, a[1] + p[1] / U.length], [0, 0]); const my = V3s.reduce((a, v) => a + v[1] / V3s.length, 0);
  let sxx = 0, sxy = 0, syy = 0, sxh = 0, syh = 0; U.forEach((p, i) => { const x = p[0] - mu[0], y = p[1] - mu[1], hh = V3s[i][1] - my; sxx += x * x; sxy += x * y; syy += y * y; sxh += x * hh; syh += y * hh; });
  const det = sxx * syy - sxy * sxy || 1; const gx = (syy * sxh - sxy * syh) / det, gy = (sxx * syh - sxy * sxh) / det;
  let ga = Math.atan2(gy, gx) - Math.PI / 2;
  if (!Number.isFinite(ga)) ga = 0; const c = Math.cos(-ga), s = Math.sin(-ga); ring = ring.map(([x, y]) => [x * c - y * s, x * s + y * c] as Pt);
  const b = bbox(ring); ring = ring.map(([x, y]) => [x - b.x0, y - b.y0] as Pt);
  const a3 = best.reduce((acc, t) => { const [a, bb, cc] = [I[3 * t], I[3 * t + 1], I[3 * t + 2]]; const ux = P[3 * bb] - P[3 * a], uy = P[3 * bb + 1] - P[3 * a + 1], uz = P[3 * bb + 2] - P[3 * a + 2], vx = P[3 * cc] - P[3 * a], vy = P[3 * cc + 1] - P[3 * a + 1], vz = P[3 * cc + 2] - P[3 * a + 2]; return acc + Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2; }, 0);
  const bb = bbox(ring);
  const piece: Piece = { id: o.id ?? 'styled', name: o.name ?? 'Styled panel', seam: ring, allowance: o.allowance ?? 10, cut: 1, fabric: 'main', grain: [[bb.w / 2, bb.h * 0.2], [bb.w / 2, bb.h * 0.8]], note: `Flattened from lines drawn on the body (${(dist * 100).toFixed(1)}% mean edge distortion, ${ease} mm ease).` };
  return { piece, distortion: dist, area3d: a3, area2d: Math.abs(area(ring)), triangles: best.length };
}
