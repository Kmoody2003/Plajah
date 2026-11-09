// Print placement on the 3D garment, mapped back to every pattern piece for print-on-demand
// (cut-and-sew all-over print): a decal is projected along the view direction onto the draped
// cloth; each covered triangle carries its texture coordinates back to its flat pattern position,
// so each piece gets its own print file that lines up across seams once sewn. Pieces that face the
// body with their back side (one of a mirrored pair) are flagged so the file is mirrored.

import type { Pt } from '../geometry';
import type { ClothModel } from './cloth';
import { vertexNormals } from './cloth';
import type { V3 } from './avatar';

export interface Decal { center: V3; normal: V3; width: number; height: number; rotation: number }
export interface DecalProjection { uv: Float32Array; tris: number[] }
export interface PiecePrint { pieceIndex: number; id: string; name: string; pieceId: string; mirrored: boolean; outline: Pt[]; tris: Array<{ p: [Pt, Pt, Pt]; uv: [Pt, Pt, Pt] }> }

const norm = (v: V3): V3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export function decalFrame(d: Decal) {
  const n = norm(d.normal); let up: V3 = [0, 1, 0]; if (Math.abs(n[1]) > 0.95) up = [0, 0, -1];
  let r = norm(cross(up, n)); let u = cross(n, r); const c = Math.cos(d.rotation), s = Math.sin(d.rotation);
  const r2: V3 = [r[0] * c + u[0] * s, r[1] * c + u[1] * s, r[2] * c + u[2] * s]; u = cross(n, r2); r = r2; return { n, r, u };
}

/** Texture coordinates per cloth vertex (NaN where the decal does not reach) and the covered triangles. */
export function projectDecal(m: ClothModel, d: Decal, depth = 140): DecalProjection {
  const { n, r, u } = decalFrame(d); const nrm = vertexNormals(m); const uv = new Float32Array(2 * m.n).fill(NaN); const X = m.pos;
  for (let i = 0; i < m.n; i++) {
    const px = X[3 * i] - d.center[0], py = X[3 * i + 1] - d.center[1], pz = X[3 * i + 2] - d.center[2];
    const dn = px * n[0] + py * n[1] + pz * n[2]; if (Math.abs(dn) > depth) continue;
    if (nrm[3 * i] * n[0] + nrm[3 * i + 1] * n[1] + nrm[3 * i + 2] * n[2] < 0.05 && -(nrm[3 * i] * n[0] + nrm[3 * i + 1] * n[1] + nrm[3 * i + 2] * n[2]) < 0.05) continue;
    uv[2 * i] = (px * r[0] + py * r[1] + pz * r[2]) / d.width + 0.5; uv[2 * i + 1] = (px * u[0] + py * u[1] + pz * u[2]) / d.height + 0.5;
  }
  // Front-most surface only: a vertex is hidden if another cloth layer sits between it and the viewer
  // along the projection. Approximated per triangle by keeping, for each decal cell, the nearest layer.
  const tris: number[] = []; const cells = new Map<string, number>(); const T = m.tris; const depthOf = new Float32Array(T.length / 3);
  for (let t = 0; t < T.length / 3; t++) {
    const a = T[3 * t], b = T[3 * t + 1], c = T[3 * t + 2]; if ([a, b, c].some(i => Number.isNaN(uv[2 * i]))) continue;
    const us = [uv[2 * a], uv[2 * b], uv[2 * c]], vs = [uv[2 * a + 1], uv[2 * b + 1], uv[2 * c + 1]];
    if (Math.max(...us) < 0 || Math.min(...us) > 1 || Math.max(...vs) < 0 || Math.min(...vs) > 1) continue;
    const dd = [a, b, c].reduce((s, i) => s + ((X[3 * i] - d.center[0]) * n[0] + (X[3 * i + 1] - d.center[1]) * n[1] + (X[3 * i + 2] - d.center[2]) * n[2]), 0) / 3; depthOf[t] = dd;
    const key = `${Math.round((us[0] + us[1] + us[2]) / 3 * 40)},${Math.round((vs[0] + vs[1] + vs[2]) / 3 * 40)}`; const cur = cells.get(key);
    if (cur == null || dd > depthOf[cur] + 4) cells.set(key, t);
    tris.push(t);
  }
  const front = tris.filter(t => { const key = (() => { const a = T[3 * t], b = T[3 * t + 1], c = T[3 * t + 2]; return `${Math.round((uv[2 * a] + uv[2 * b] + uv[2 * c]) / 3 * 40)},${Math.round((uv[2 * a + 1] + uv[2 * b + 1] + uv[2 * c + 1]) / 3 * 40)}`; })(); const best = cells.get(key)!; return depthOf[t] >= depthOf[best] - 12; });
  return { uv, tris: front };
}

/** Geometry for the viewport's decal layer (follows the cloth via `src` vertex indices). */
export function decalOverlay(m: ClothModel, pr: DecalProjection) {
  const k = pr.tris.length * 3; const positions = new Float32Array(3 * k), uvs = new Float32Array(2 * k), src = new Uint32Array(k);
  pr.tris.forEach((t, j) => { for (let q = 0; q < 3; q++) { const i = m.tris[3 * t + q]; const o = 3 * j + q; src[o] = i; positions.set([m.pos[3 * i], m.pos[3 * i + 1], m.pos[3 * i + 2]], 3 * o); uvs[2 * o] = pr.uv[2 * i]; uvs[2 * o + 1] = pr.uv[2 * i + 1]; } });
  return { positions, uvs, src };
}

/** Per-piece print data in flat pattern coordinates. */
export function printPieces(m: ClothModel, pr: DecalProjection, bodyAxis: V3 = [0, 0, 0]): PiecePrint[] {
  const by = new Map<number, PiecePrint>(); const R = m.rest2, X = m.pos;
  m.pieces.forEach((p, pi) => {
    // Is the face side (2D counter-clockwise) facing out, away from the body's vertical axis?
    let vote = 0; for (let t = p.t0; t < p.t0 + p.tn; t++) { const [a, b, c] = [m.tris[3 * t], m.tris[3 * t + 1], m.tris[3 * t + 2]];
      const ccw2 = (R[2 * b] - R[2 * a]) * (R[2 * c + 1] - R[2 * a + 1]) - (R[2 * c] - R[2 * a]) * (R[2 * b + 1] - R[2 * a + 1]) > 0;
      const u: V3 = [X[3 * b] - X[3 * a], X[3 * b + 1] - X[3 * a + 1], X[3 * b + 2] - X[3 * a + 2]], v: V3 = [X[3 * c] - X[3 * a], X[3 * c + 1] - X[3 * a + 1], X[3 * c + 2] - X[3 * a + 2]]; const nn = cross(u, v);
      const out: V3 = [X[3 * a] - bodyAxis[0], 0, X[3 * a + 2] - bodyAxis[2]]; const s = Math.sign(nn[0] * out[0] + nn[2] * out[2]); vote += ccw2 ? s : -s; }
    const outline = p.boundary.map(i => [R[2 * i], R[2 * i + 1]] as Pt);
    by.set(pi, { pieceIndex: pi, id: p.id, name: p.name, pieceId: p.pieceId, mirrored: vote < 0, outline, tris: [] });
  });
  for (const t of pr.tris) { const pi = m.triPiece[t]; const pp = by.get(pi)!; const idx = [m.tris[3 * t], m.tris[3 * t + 1], m.tris[3 * t + 2]];
    pp.tris.push({ p: idx.map(i => [R[2 * i], R[2 * i + 1]]) as [Pt, Pt, Pt], uv: idx.map(i => [pr.uv[2 * i], pr.uv[2 * i + 1]]) as [Pt, Pt, Pt] }); }
  return [...by.values()].filter(p => p.tris.length);
}
