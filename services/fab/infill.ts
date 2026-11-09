// Infill patterns for our FDM slicer. Each returns open polylines inside the fill area.
//   lines   rectilinear, alternating 45° / 135° per layer
//   grid    both directions every layer at twice the spacing (same density)
//   cubic   three line sets at 0°, 60°, 120°, shifted with height so they form tilted cubes in 3D
//   gyroid  the gyroid surface sin x cos y + sin y cos z + sin z cos x = 0 cut at the layer height,
//           traced with marching squares over a raster of the fill area (strong in every direction)

import type { Loop, P2 } from './geom2d';
import { makeGrid, rasterize } from './raster';

export type InfillPattern = 'lines' | 'grid' | 'cubic' | 'gyroid';
export const INFILL_PATTERNS: Array<[InfillPattern, string]> = [['lines', 'Lines'], ['grid', 'Grid'], ['cubic', 'Cubic'], ['gyroid', 'Gyroid']];

/** Scanlines at `angle` (radians) every `spacing` mm, offset by `shift`, clipped to the polygons by even-odd crossings. */
export function scanFill(polys: Loop[], spacing: number, angle: number, shift = 0): P2[][] {
  const c = Math.cos(angle), s = Math.sin(angle); const rot = (p: P2): P2 => [p[0] * c + p[1] * s, -p[0] * s + p[1] * c]; const back = (p: P2): P2 => [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
  const R = polys.map(l => l.map(rot)); let lo = Infinity, hi = -Infinity; for (const l of R) for (const p of l) { if (p[1] < lo) lo = p[1]; if (p[1] > hi) hi = p[1]; }
  if (!Number.isFinite(lo)) return [];
  const sh = ((shift % spacing) + spacing) % spacing;
  const lines: P2[][] = []; let flip = false;
  for (let y = Math.ceil((lo - sh) / spacing) * spacing + sh; y <= hi; y += spacing) {
    const xs: number[] = [];
    for (const l of R) for (let i = 0, j = l.length - 1; i < l.length; j = i++) { const a = l[j], b = l[i]; if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); }
    xs.sort((a, b) => a - b); const segs: P2[][] = [];
    for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > spacing * 0.2) segs.push([back([xs[i], y]), back([xs[i + 1], y])]);
    if (flip) segs.reverse().forEach(sg => sg.reverse()); flip = !flip; lines.push(...segs);
  }
  return lines;
}

/** Ramer–Douglas–Peucker simplification of an open polyline. */
export function simplify(pts: P2[], tol: number): P2[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const stack: Array<[number, number]> = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!; const [ax, ay] = pts[a], [bx, by] = pts[b]; const dx = bx - ax, dy = by - ay; const L = Math.hypot(dx, dy) || 1e-12;
    let bi = -1, bd = tol;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L; if (d > bd) { bd = d; bi = i; } }
    if (bi > 0) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Gyroid curves at height z with line spacing `spacing`, inside `polys`. */
export function gyroidFill(polys: Loop[], spacing: number, z: number): P2[][] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const l of polys) for (const p of l) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  if (!Number.isFinite(x0)) return [];
  // Neighbouring curves sit about half a period apart, so one period spans two lines.
  const w = Math.PI / spacing;
  let cell = Math.max(0.15, spacing / 6); while (((x1 - x0) / cell + 2) * ((y1 - y0) / cell + 2) > 600_000) cell *= 1.25;
  // Nodes at cell corners; inside flags from a raster whose cell centres sit on the nodes.
  const g = rasterize(makeGrid(x0 - cell / 2, y0 - cell / 2, x1 + cell, y1 + cell, cell), polys);
  const W = g.w, H = g.h; const inside = (i: number, j: number) => i >= 0 && j >= 0 && i < W && j < H && g.bits[j * W + i] === 1;
  const sz = Math.sin(w * z), cz = Math.cos(w * z);
  const F = new Float32Array(W * H);
  for (let j = 0; j < H; j++) { const y = y0 + j * cell; const sy = Math.sin(w * y), cy = Math.cos(w * y); for (let i = 0; i < W; i++) { const x = x0 + i * cell; F[j * W + i] = Math.sin(w * x) * cy + sy * cz + sz * Math.cos(w * x); } }
  // Marching squares; endpoints keyed by the cell edge they sit on so segments chain into polylines.
  const segs: Array<[string, P2, string, P2]> = [];
  const pt = (i: number, j: number, di: number, dj: number): [string, P2] => {
    const a = F[j * W + i], b = F[(j + dj) * W + i + di]; const t = a === b ? 0.5 : a / (a - b);
    return [`${di ? 'h' : 'v'}${i},${j}`, [x0 + (i + di * t) * cell, y0 + (j + dj * t) * cell]];
  };
  for (let j = 0; j + 1 < H; j++) for (let i = 0; i + 1 < W; i++) {
    if (!inside(i, j) || !inside(i + 1, j) || !inside(i, j + 1) || !inside(i + 1, j + 1)) continue;
    const a = F[j * W + i] > 0 ? 1 : 0, b = F[j * W + i + 1] > 0 ? 2 : 0, c = F[(j + 1) * W + i + 1] > 0 ? 4 : 0, d = F[(j + 1) * W + i] > 0 ? 8 : 0; const k = a | b | c | d;
    if (k === 0 || k === 15) continue;
    const S = pt(i, j, 1, 0), E = pt(i + 1, j, 0, 1), N = pt(i, j + 1, 1, 0), Wt = pt(i, j, 0, 1);
    const add = (p: [string, P2], q: [string, P2]) => segs.push([p[0], p[1], q[0], q[1]]);
    const centre = (F[j * W + i] + F[j * W + i + 1] + F[(j + 1) * W + i] + F[(j + 1) * W + i + 1]) / 4 > 0;
    switch (k) {
      case 1: case 14: add(Wt, S); break; case 2: case 13: add(S, E); break; case 4: case 11: add(E, N); break; case 8: case 7: add(N, Wt); break;
      case 3: case 12: add(Wt, E); break; case 6: case 9: add(S, N); break;
      case 5: if (centre) { add(Wt, N); add(S, E); } else { add(Wt, S); add(E, N); } break;
      case 10: if (centre) { add(Wt, S); add(E, N); } else { add(Wt, N); add(S, E); } break;
    }
  }
  // Chain segments sharing an edge point.
  const at = new Map<string, number[]>(); segs.forEach((s, i) => { for (const k of [s[0], s[2]]) { const l = at.get(k); if (l) l.push(i); else at.set(k, [i]); } });
  const used = new Uint8Array(segs.length); const out: P2[][] = [];
  const walk = (key: string, line: P2[], front: boolean) => {
    for (;;) {
      const nx = (at.get(key) ?? []).find(i => !used[i]); if (nx === undefined) return; used[nx] = 1; const s = segs[nx];
      const [k2, p2] = s[0] === key ? [s[2], s[3]] : [s[0], s[1]]; if (front) line.unshift(p2); else line.push(p2); key = k2;
    }
  };
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue; used[i] = 1; const s = segs[i]; const line: P2[] = [s[1], s[3]];
    walk(s[2], line, false); walk(s[0], line, true);
    const simp = simplify(line, Math.min(0.02, cell / 10));
    let len = 0; for (let q = 1; q < simp.length; q++) len += Math.hypot(simp[q][0] - simp[q - 1][0], simp[q][1] - simp[q - 1][1]);
    if (len > spacing * 0.4) out.push(simp);
  }
  return orderPaths(out);
}

/** Greedy nearest-next ordering, reversing paths when their far end is closer. */
export function orderPaths(paths: P2[][], from: P2 = [0, 0]): P2[][] {
  if (paths.length > 3000) return paths;
  const left = [...paths]; const out: P2[][] = []; let at = from;
  while (left.length) {
    let bi = 0, bd = Infinity, rev = false;
    for (let i = 0; i < left.length; i++) {
      const p = left[i]; const d0 = Math.hypot(p[0][0] - at[0], p[0][1] - at[1]), d1 = Math.hypot(p[p.length - 1][0] - at[0], p[p.length - 1][1] - at[1]);
      if (d0 < bd) { bd = d0; bi = i; rev = false; } if (d1 < bd) { bd = d1; bi = i; rev = true; }
    }
    const p = left.splice(bi, 1)[0]; const q = rev ? [...p].reverse() : p; out.push(q); at = q[q.length - 1];
  }
  return out;
}

/** Sparse infill for one layer. `spacing` is the single-direction line spacing that gives the density. */
export function infillPaths(polys: Loop[], pattern: InfillPattern, spacing: number, z: number, layerIndex: number): P2[][] {
  const deg = Math.PI / 180;
  switch (pattern) {
    case 'grid': return [...scanFill(polys, spacing * 2, 45 * deg), ...scanFill(polys, spacing * 2, 135 * deg)];
    case 'cubic': {
      // Each set shifts with height: the three families of planes meet as cubes standing on a corner.
      const s3 = spacing * 3; const shift = z * Math.SQRT1_2;
      return [...scanFill(polys, s3, 0, shift), ...scanFill(polys, s3, 60 * deg, shift), ...scanFill(polys, s3, 120 * deg, shift)];
    }
    case 'gyroid': return gyroidFill(polys, spacing, z);
    default: return scanFill(polys, spacing, (layerIndex % 2 ? 135 : 45) * deg);
  }
}
