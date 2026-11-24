// services/argilla/poly/subd.ts
//
// Catmull-Clark Subdivision Surfaces with Pixar-style Semi-Sharp Edge Crease Weights.
// Extends Plajah's existing `PolyMesh` (`services/argilla/poly/polyMesh.ts`) so armor,
// vehicles, weapons, furniture, and stylized-realistic architecture can be modeled with
// smooth curved surfaces and razor-crisp edges, then converted cleanly to indexed game quads/tris.

import { edgeKey, type EdgeKey, type PolyMesh, type V3 } from './polyMesh';
import type { IndexedTriMesh } from '../../gamestudio/compiler/schema';
import { computeSmoothNormals } from '../../gamestudio/compiler/retopoLod';

/** Map from canonical EdgeKey ("a_b") to crease sharpness (>= 1.0 stays sharp for `floor(w)` levels). */
export type CreaseMap = Map<EdgeKey, number>;

export interface SubDResult {
  mesh: PolyMesh;
  creases: CreaseMap;
}

const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul3 = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const lerp3 = (a: V3, b: V3, t: number): V3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

function subdivideOnce(mesh: PolyMesh, creases: CreaseMap): SubDResult {
  const numV = mesh.verts.length;
  const numF = mesh.faces.length;

  // 1. Face points (centroid of each face)
  const facePoints: V3[] = new Array(numF);
  for (let fi = 0; fi < numF; fi++) {
    const f = mesh.faces[fi];
    let sx = 0, sy = 0, sz = 0;
    for (const vi of f) {
      sx += mesh.verts[vi][0];
      sy += mesh.verts[vi][1];
      sz += mesh.verts[vi][2];
    }
    const inv = 1 / Math.max(1, f.length);
    facePoints[fi] = [sx * inv, sy * inv, sz * inv];
  }

  // 2. Collect edge adjacency & vertex-to-face / vertex-to-edge incidence
  interface EdgeInfo {
    a: number;
    b: number;
    faces: number[];
    crease: number;
    edgeVertIdx: number;
  }
  const edgeMap = new Map<EdgeKey, EdgeInfo>();
  const vertFaces: number[][] = Array.from({ length: numV }, () => []);
  const vertEdges: EdgeInfo[][] = Array.from({ length: numV }, () => []);

  for (let fi = 0; fi < numF; fi++) {
    const f = mesh.faces[fi];
    for (let i = 0; i < f.length; i++) {
      const a = f[i];
      const b = f[(i + 1) % f.length];
      vertFaces[a].push(fi);
      const key = edgeKey(a, b);
      let info = edgeMap.get(key);
      if (!info) {
        info = { a: Math.min(a, b), b: Math.max(a, b), faces: [], crease: creases.get(key) ?? 0, edgeVertIdx: -1 };
        edgeMap.set(key, info);
        vertEdges[info.a].push(info);
        vertEdges[info.b].push(info);
      }
      info.faces.push(fi);
    }
  }

  // 3. Build new vertex array: [updated original verts | face points | edge points]
  const newVerts: V3[] = new Array(numV);
  const facePointStart = numV;
  const edgePointStart = numV + numF;

  // Update original vertex positions using Catmull-Clark + semi-sharp crease rules
  for (let vi = 0; vi < numV; vi++) {
    const P = mesh.verts[vi];
    const adjEdges = vertEdges[vi];
    const adjFaces = vertFaces[vi];
    const sharpEdges = adjEdges.filter((e) => e.faces.length === 1 || e.crease > 0);

    if (sharpEdges.length >= 3 || adjFaces.length === 0) {
      // Corner vertex: pinned to preserve crisp architectural/hard-surface corners
      newVerts[vi] = [...P];
    } else if (sharpEdges.length === 2) {
      // Crease / boundary curve rule: (neighbor1 + 6*P + neighbor2) / 8, blended if semi-sharp
      const e0 = sharpEdges[0], e1 = sharpEdges[1];
      const n0 = mesh.verts[e0.a === vi ? e0.b : e0.a];
      const n1 = mesh.verts[e1.a === vi ? e1.b : e1.a];
      const creasePos: V3 = mul3(add3(add3(n0, n1), mul3(P, 6)), 1 / 8);

      const isBoundary = e0.faces.length === 1 || e1.faces.length === 1;
      const sharpness = isBoundary ? 1 : Math.min(1, (e0.crease + e1.crease) * 0.5);
      if (sharpness >= 1) {
        newVerts[vi] = creasePos;
      } else {
        const smoothPos = smoothCatmullVertex(P, adjFaces, adjEdges, facePoints, mesh.verts);
        newVerts[vi] = lerp3(smoothPos, creasePos, sharpness);
      }
    } else {
      newVerts[vi] = smoothCatmullVertex(P, adjFaces, adjEdges, facePoints, mesh.verts);
    }
  }

  // Append face points
  for (let fi = 0; fi < numF; fi++) {
    newVerts.push(facePoints[fi]);
  }

  // Compute & append edge points
  const nextCreases: CreaseMap = new Map();
  let edgeIdxOffset = 0;
  for (const info of edgeMap.values()) {
    const pa = mesh.verts[info.a];
    const pb = mesh.verts[info.b];
    const mid = mul3(add3(pa, pb), 0.5);

    let ep: V3;
    if (info.faces.length !== 2 || info.crease >= 1) {
      ep = mid;
    } else {
      const fAvg = mul3(add3(facePoints[info.faces[0]], facePoints[info.faces[1]]), 0.5);
      const smoothEp = mul3(add3(mid, fAvg), 0.5);
      ep = info.crease > 0 ? lerp3(smoothEp, mid, info.crease) : smoothEp;
    }

    info.edgeVertIdx = edgePointStart + edgeIdxOffset++;
    newVerts.push(ep);

    // Propagate remaining crease weight to the two child half-edges
    const rem = Math.max(0, info.crease - 1);
    if (rem > 0) {
      nextCreases.set(edgeKey(info.a, info.edgeVertIdx), rem);
      nextCreases.set(edgeKey(info.b, info.edgeVertIdx), rem);
    }
  }

  // 4. Emit pure quad faces (one quad per corner of every original face)
  const newFaces: number[][] = [];
  for (let fi = 0; fi < numF; fi++) {
    const f = mesh.faces[fi];
    const fpIdx = facePointStart + fi;
    const len = f.length;
    for (let i = 0; i < len; i++) {
      const prev = f[(i - 1 + len) % len];
      const curr = f[i];
      const next = f[(i + 1) % len];
      const ePrev = edgeMap.get(edgeKey(prev, curr))!.edgeVertIdx;
      const eNext = edgeMap.get(edgeKey(curr, next))!.edgeVertIdx;
      newFaces.push([curr, eNext, fpIdx, ePrev]);
    }
  }

  return { mesh: { verts: newVerts, faces: newFaces }, creases: nextCreases };
}

function smoothCatmullVertex(
  P: V3,
  adjFaces: number[],
  adjEdges: Array<{ a: number; b: number }>,
  facePoints: V3[],
  verts: V3[],
): V3 {
  const n = adjFaces.length;
  if (n < 2 || adjEdges.length === 0) return [...P];

  let F: V3 = [0, 0, 0];
  for (const fi of adjFaces) F = add3(F, facePoints[fi]);
  F = mul3(F, 1 / n);

  let R: V3 = [0, 0, 0];
  for (const e of adjEdges) {
    R = add3(R, mul3(add3(verts[e.a], verts[e.b]), 0.5));
  }
  R = mul3(R, 1 / adjEdges.length);

  return mul3(add3(add3(F, mul3(R, 2)), mul3(P, n - 3)), 1 / n);
}

/** Run `levels` iterations of Catmull-Clark subdivision with semi-sharp edge creases. */
export function subdivideCatmullClark(mesh: PolyMesh, levels = 1, creases: CreaseMap = new Map()): SubDResult {
  let cur: SubDResult = { mesh, creases: new Map(creases) };
  const steps = Math.max(0, Math.min(4, Math.floor(levels)));
  for (let i = 0; i < steps; i++) {
    cur = subdivideOnce(cur.mesh, cur.creases);
  }
  return cur;
}

/** Triangulate a PolyMesh (quads & n-gons via fan triangulation) into a compiler-ready IndexedTriMesh. */
export function polyMeshToIndexedTriMesh(mesh: PolyMesh): IndexedTriMesh {
  const positions = new Float32Array(mesh.verts.length * 3);
  for (let i = 0; i < mesh.verts.length; i++) {
    positions[i * 3] = mesh.verts[i][0];
    positions[i * 3 + 1] = mesh.verts[i][1];
    positions[i * 3 + 2] = mesh.verts[i][2];
  }
  const indicesArr: number[] = [];
  for (const f of mesh.faces) {
    if (f.length < 3) continue;
    for (let i = 1; i < f.length - 1; i++) {
      indicesArr.push(f[0], f[i], f[i + 1]);
    }
  }
  const out: IndexedTriMesh = { positions, indices: new Uint32Array(indicesArr) };
  out.normals = computeSmoothNormals(out);
  return out;
}
