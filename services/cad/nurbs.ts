// services/cad/nurbs.ts
//
// Rational B-Spline / NURBS Curves & Surfaces + Parametric Loft / Revolve +
// Curvature-Adaptive Tessellation for Vehicles, Armor, Weapons, Furniture & Architectural Curves.
// Also defines `BRepKernelAdapter` so full OpenCASCADE.js / Manifold WASM boolean & fillet
// operations plug in cleanly without changing authoring code.

import type { IndexedTriMesh } from '../gamestudio/compiler/schema';
import { computeSmoothNormals } from '../gamestudio/compiler/retopoLod';

/** Rational 3D control point [x, y, z, weight]. */
export type NurbsPoint = [number, number, number, number];

export interface NurbsCurve {
  degree: number;
  controlPoints: NurbsPoint[];
  knots: number[];
}

export interface NurbsSurface {
  degreeU: number;
  degreeV: number;
  /** Grid of control points indexed as controlGrid[uIdx][vIdx]. */
  controlGrid: NurbsPoint[][];
  knotsU: number[];
  knotsV: number[];
}

/** Optional WASM B-Rep kernel (e.g. opencascade.js / replicad / Manifold WASM) for exact booleans & fillets. */
export interface BRepKernelAdapter {
  readonly name: string;
  booleanUnion(a: IndexedTriMesh, b: IndexedTriMesh): IndexedTriMesh;
  booleanDifference(a: IndexedTriMesh, b: IndexedTriMesh): IndexedTriMesh;
  booleanIntersect(a: IndexedTriMesh, b: IndexedTriMesh): IndexedTriMesh;
  filletEdges?(mesh: IndexedTriMesh, radius: number): IndexedTriMesh;
}

/** Build an open clamped uniform knot vector in [0, 1] for `numControlPoints` and `degree`. */
export function clampedUniformKnots(numControlPoints: number, degree: number): number[] {
  const p = Math.max(1, Math.min(degree, numControlPoints - 1));
  const m = numControlPoints + p + 1;
  const knots: number[] = new Array(m);
  const internalCount = m - 2 * (p + 1);

  for (let i = 0; i <= p; i++) knots[i] = 0;
  for (let i = 1; i <= internalCount; i++) {
    knots[p + i] = i / (internalCount + 1);
  }
  for (let i = m - p - 1; i < m; i++) knots[i] = 1;
  return knots;
}

/** Find knot span index for parameter `t` in [knots[p], knots[n]]. */
function findSpan(n: number, p: number, t: number, knots: number[]): number {
  if (t >= knots[n]) return n - 1;
  if (t <= knots[p]) return p;
  let low = p;
  let high = n;
  let mid = (low + high) >> 1;
  while (t < knots[mid] || t >= knots[mid + 1]) {
    if (t < knots[mid]) high = mid;
    else low = mid;
    mid = (low + high) >> 1;
  }
  return mid;
}

/** Cox-de Boor non-vanishing B-spline basis functions N_{i-p..i, p}(t). */
function basisFunctions(span: number, t: number, p: number, knots: number[]): number[] {
  const N = new Array<number>(p + 1).fill(0);
  const left = new Array<number>(p + 1).fill(0);
  const right = new Array<number>(p + 1).fill(0);
  N[0] = 1;

  for (let j = 1; j <= p; j++) {
    left[j] = t - knots[span + 1 - j];
    right[j] = knots[span + j] - t;
    let saved = 0;
    for (let r = 0; r < j; r++) {
      const denom = right[r + 1] + left[j - r];
      const temp = denom > 1e-12 ? N[r] / denom : 0;
      N[r] = saved + right[r + 1] * temp;
      saved = left[j - r] * temp;
    }
    N[j] = saved;
  }
  return N;
}

/** Evaluate a rational NURBS curve at parameter `t ∈ [0, 1]`. */
export function evaluateNurbsCurve(curve: NurbsCurve, tRaw: number): [number, number, number] {
  const n = curve.controlPoints.length;
  const p = Math.min(curve.degree, n - 1);
  const t = Math.max(0, Math.min(1, tRaw));
  const span = findSpan(n, p, t, curve.knots);
  const N = basisFunctions(span, t, p, curve.knots);

  let wx = 0, wy = 0, wz = 0, wSum = 0;
  for (let j = 0; j <= p; j++) {
    const cp = curve.controlPoints[span - p + j];
    const bw = N[j] * cp[3];
    wx += cp[0] * bw;
    wy += cp[1] * bw;
    wz += cp[2] * bw;
    wSum += bw;
  }
  const invW = wSum > 1e-12 ? 1 / wSum : 1;
  return [wx * invW, wy * invW, wz * invW];
}

/** Evaluate a tensor-product NURBS surface at `(u, v) ∈ [0, 1] × [0, 1]`. */
export function evaluateNurbsSurface(surf: NurbsSurface, uRaw: number, vRaw: number): [number, number, number] {
  const nu = surf.controlGrid.length;
  const nv = surf.controlGrid[0].length;
  const pu = Math.min(surf.degreeU, nu - 1);
  const pv = Math.min(surf.degreeV, nv - 1);
  const u = Math.max(0, Math.min(1, uRaw));
  const v = Math.max(0, Math.min(1, vRaw));

  const spanU = findSpan(nu, pu, u, surf.knotsU);
  const spanV = findSpan(nv, pv, v, surf.knotsV);
  const Nu = basisFunctions(spanU, u, pu, surf.knotsU);
  const Nv = basisFunctions(spanV, v, pv, surf.knotsV);

  let wx = 0, wy = 0, wz = 0, wSum = 0;
  for (let iu = 0; iu <= pu; iu++) {
    const row = surf.controlGrid[spanU - pu + iu];
    for (let iv = 0; iv <= pv; iv++) {
      const cp = row[spanV - pv + iv];
      const bw = Nu[iu] * Nv[iv] * cp[3];
      wx += cp[0] * bw;
      wy += cp[1] * bw;
      wz += cp[2] * bw;
      wSum += bw;
    }
  }
  const invW = wSum > 1e-12 ? 1 / wSum : 1;
  return [wx * invW, wy * invW, wz * invW];
}

/** Loft a smooth NURBS surface across 2+ cross-section profile curves (car bodies, armor plates, arches). */
export function loftNurbsSurface(profiles: NurbsPoint[][], degreeU = 2, degreeV = 2): NurbsSurface {
  if (profiles.length < 2) throw new Error('loftNurbsSurface requires at least 2 profile sections.');
  const nv = profiles[0].length;
  for (const row of profiles) {
    if (row.length !== nv) throw new Error('All loft profiles must have the same number of control points.');
  }
  const pu = Math.min(degreeU, profiles.length - 1);
  const pv = Math.min(degreeV, nv - 1);
  return {
    degreeU: pu,
    degreeV: pv,
    controlGrid: profiles.map((r) => r.map((p) => [...p] as NurbsPoint)),
    knotsU: clampedUniformKnots(profiles.length, pu),
    knotsV: clampedUniformKnots(nv, pv),
  };
}

/** Revolve a 2D/3D profile around the +Y axis (columns, wheels, domes, chalices, turbine nacelles). */
export function revolveNurbsSurface(profile: NurbsPoint[], segments = 8, sweepRad = Math.PI * 2): NurbsSurface {
  const rings: NurbsPoint[][] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * sweepRad;
    const ca = Math.cos(a), sa = Math.sin(a);
    rings.push(
      profile.map(([x, y, z, w]) => [x * ca - z * sa, y, x * sa + z * ca, w]),
    );
  }
  return loftNurbsSurface(rings, Math.min(3, segments), Math.min(2, profile.length - 1));
}

/**
 * Curvature-adaptive NURBS tessellator: subdivides regions with higher second-derivative
 * curvature more finely while keeping flat regions lean, emitting clean UVs and smooth normals.
 */
export function tessellateNurbsSurface(
  surf: NurbsSurface,
  opts?: { segsU?: number; segsV?: number; adaptiveTolerance?: number },
): IndexedTriMesh {
  const baseU = Math.max(4, opts?.segsU ?? 16);
  const baseV = Math.max(4, opts?.segsV ?? 16);
  const tol = opts?.adaptiveTolerance ?? 0.015;

  // Build adaptive parameter lists along U and V by checking midpoint chord deviation
  const buildParams = (count: number, evalMid: (t: number) => [number, number, number]): number[] => {
    const pts: number[] = [];
    for (let i = 0; i <= count; i++) pts.push(i / count);
    const refined: number[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], m = (a + b) * 0.5;
      const pa = evalMid(a), pb = evalMid(b), pm = evalMid(m);
      const lx = (pa[0] + pb[0]) * 0.5 - pm[0];
      const ly = (pa[1] + pb[1]) * 0.5 - pm[1];
      const lz = (pa[2] + pb[2]) * 0.5 - pm[2];
      if (Math.hypot(lx, ly, lz) > tol) refined.push(m);
      refined.push(b);
    }
    return refined;
  };

  const us = buildParams(baseU, (u) => evaluateNurbsSurface(surf, u, 0.5));
  const vs = buildParams(baseV, (v) => evaluateNurbsSurface(surf, 0.5, v));

  const cols = vs.length;
  const rows = us.length;
  const positions = new Float32Array(rows * cols * 3);
  const uvs = new Float32Array(rows * cols * 2);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const pt = evaluateNurbsSurface(surf, us[r], vs[c]);
      positions[idx * 3] = pt[0];
      positions[idx * 3 + 1] = pt[1];
      positions[idx * 3 + 2] = pt[2];
      uvs[idx * 2] = us[r];
      uvs[idx * 2 + 1] = vs[c];
    }
  }

  const indicesArr: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const d = (r + 1) * cols + c;
      const e = d + 1;
      indicesArr.push(a, d, b, b, d, e);
    }
  }

  const mesh: IndexedTriMesh = { positions, uvs, indices: new Uint32Array(indicesArr) };
  mesh.normals = computeSmoothNormals(mesh);
  return mesh;
}
