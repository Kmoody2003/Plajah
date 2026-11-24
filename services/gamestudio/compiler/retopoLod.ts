// services/gamestudio/compiler/retopoLod.ts
//
// Studio Mesh Retopology / Simplifier, Auto-LOD Chain Generator, Normal Recomputation,
// and Topology Diagnostics (manifold / open-edge / degenerate triangle audit).
// Pure TypeScript — runs deterministically in Web Workers and Node CI tests.

import type { IndexedTriMesh, LodLevelDescriptor } from './schema';

export interface TopologyAudit {
  vertexCount: number;
  triangleCount: number;
  degenerateTriangles: number;
  boundaryEdges: number;
  nonManifoldEdges: number;
  watertight: boolean;
  bounds: { min: [number, number, number]; max: [number, number, number] };
}

export interface CompiledLodMesh {
  descriptor: LodLevelDescriptor;
  mesh: IndexedTriMesh;
}

/** Recompute area-weighted smooth vertex normals from positions & triangle indices. */
export function computeSmoothNormals(mesh: IndexedTriMesh): Float32Array {
  const vCount = mesh.positions.length / 3;
  const normals = new Float32Array(mesh.positions.length);
  const pos = mesh.positions;
  const idx = mesh.indices;

  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;

    normals[a] += nx; normals[a + 1] += ny; normals[a + 2] += nz;
    normals[b] += nx; normals[b + 1] += ny; normals[b + 2] += nz;
    normals[c] += nx; normals[c + 1] += ny; normals[c + 2] += nz;
  }

  for (let v = 0; v < vCount; v++) {
    const o = v * 3;
    const l = Math.hypot(normals[o], normals[o + 1], normals[o + 2]) || 1;
    normals[o] /= l;
    normals[o + 1] /= l;
    normals[o + 2] /= l;
  }
  return normals;
}

/** Audit mesh bounds, degenerate faces, boundary edges, and manifoldness. */
export function auditMeshTopology(mesh: IndexedTriMesh): TopologyAudit {
  const pos = mesh.positions;
  const idx = mesh.indices;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < pos.length; i += 3) {
    if (pos[i] < min[0]) min[0] = pos[i];
    if (pos[i + 1] < min[1]) min[1] = pos[i + 1];
    if (pos[i + 2] < min[2]) min[2] = pos[i + 2];
    if (pos[i] > max[0]) max[0] = pos[i];
    if (pos[i + 1] > max[1]) max[1] = pos[i + 1];
    if (pos[i + 2] > max[2]) max[2] = pos[i + 2];
  }
  if (!Number.isFinite(min[0])) {
    min[0] = min[1] = min[2] = 0;
    max[0] = max[1] = max[2] = 0;
  }

  const edgeCounts = new Map<string, number>();
  let degenerateTriangles = 0;

  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    if (a === b || b === c || a === c) {
      degenerateTriangles++;
      continue;
    }
    const pairs: Array<[number, number]> = [[a, b], [b, c], [c, a]];
    for (const [u, v] of pairs) {
      const key = u < v ? `${u}_${v}` : `${v}_${u}`;
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    }
  }

  let boundaryEdges = 0;
  let nonManifoldEdges = 0;
  for (const count of edgeCounts.values()) {
    if (count === 1) boundaryEdges++;
    else if (count > 2) nonManifoldEdges++;
  }

  return {
    vertexCount: pos.length / 3,
    triangleCount: idx.length / 3,
    degenerateTriangles,
    boundaryEdges,
    nonManifoldEdges,
    watertight: boundaryEdges === 0 && nonManifoldEdges === 0 && idx.length > 0,
    bounds: { min, max },
  };
}

/**
 * Deterministic spatial vertex-clustering simplifier (fast, UV/color-preserving,
 * guarantees valid indexed triangles and recomputes smooth area-weighted normals).
 * `ratio` is target triangle ratio in (0.05..1.0].
 */
export function simplifyMesh(mesh: IndexedTriMesh, ratio: number): IndexedTriMesh {
  const clamped = Math.max(0.05, Math.min(1, ratio));
  if (clamped >= 0.99 || mesh.indices.length <= 12) {
    return {
      positions: new Float32Array(mesh.positions),
      normals: mesh.normals ? new Float32Array(mesh.normals) : computeSmoothNormals(mesh),
      uvs: mesh.uvs ? new Float32Array(mesh.uvs) : undefined,
      colors: mesh.colors ? new Float32Array(mesh.colors) : undefined,
      indices: new Uint32Array(mesh.indices),
    };
  }

  const audit = auditMeshTopology(mesh);
  const spanX = Math.max(1e-4, audit.bounds.max[0] - audit.bounds.min[0]);
  const spanY = Math.max(1e-4, audit.bounds.max[1] - audit.bounds.min[1]);
  const spanZ = Math.max(1e-4, audit.bounds.max[2] - audit.bounds.min[2]);
  const maxSpan = Math.max(spanX, spanY, spanZ);

  const srcVerts = mesh.positions.length / 3;
  // Surface meshes occupy ~O(gridDiv^2) cells in 3D space, so gridDiv scales with sqrt(targetVerts).
  const targetVerts = Math.max(4, Math.floor(srcVerts * clamped));
  const gridDiv = Math.max(2, Math.floor(Math.sqrt(targetVerts / 3.2)));
  const cellSize = (maxSpan / gridDiv) * 1.0001;

  const remap = new Uint32Array(srcVerts);
  const clusters = new Map<string, {
    id: number; count: number;
    px: number; py: number; pz: number;
    u: number; v: number;
    r: number; g: number; b: number; a: number;
  }>();
  const clusterList: Array<ReturnType<typeof clusters.get>> = [];

  for (let i = 0; i < srcVerts; i++) {
    const px = mesh.positions[i * 3];
    const py = mesh.positions[i * 3 + 1];
    const pz = mesh.positions[i * 3 + 2];
    const gx = Math.floor((px - audit.bounds.min[0]) / cellSize);
    const gy = Math.floor((py - audit.bounds.min[1]) / cellSize);
    const gz = Math.floor((pz - audit.bounds.min[2]) / cellSize);
    const key = `${gx},${gy},${gz}`;
    let c = clusters.get(key);
    if (!c) {
      c = { id: clusterList.length, count: 0, px: 0, py: 0, pz: 0, u: 0, v: 0, r: 0, g: 0, b: 0, a: 0 };
      clusters.set(key, c);
      clusterList.push(c);
    }
    c.count++;
    c.px += px; c.py += py; c.pz += pz;
    if (mesh.uvs) { c.u += mesh.uvs[i * 2]; c.v += mesh.uvs[i * 2 + 1]; }
    if (mesh.colors) {
      c.r += mesh.colors[i * 4]; c.g += mesh.colors[i * 4 + 1];
      c.b += mesh.colors[i * 4 + 2]; c.a += mesh.colors[i * 4 + 3];
    }
    remap[i] = c.id;
  }

  const outPos = new Float32Array(clusterList.length * 3);
  const outUv = mesh.uvs ? new Float32Array(clusterList.length * 2) : undefined;
  const outCol = mesh.colors ? new Float32Array(clusterList.length * 4) : undefined;

  for (let i = 0; i < clusterList.length; i++) {
    const c = clusterList[i]!;
    outPos[i * 3] = c.px / c.count;
    outPos[i * 3 + 1] = c.py / c.count;
    outPos[i * 3 + 2] = c.pz / c.count;
    if (outUv) { outUv[i * 2] = c.u / c.count; outUv[i * 2 + 1] = c.v / c.count; }
    if (outCol) {
      outCol[i * 4] = c.r / c.count; outCol[i * 4 + 1] = c.g / c.count;
      outCol[i * 4 + 2] = c.b / c.count; outCol[i * 4 + 3] = c.a / c.count;
    }
  }

  const outIdxArr: number[] = [];
  const seenTri = new Set<string>();
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = remap[mesh.indices[i]];
    const b = remap[mesh.indices[i + 1]];
    const c = remap[mesh.indices[i + 2]];
    if (a === b || b === c || a === c) continue;
    const key = [a, b, c].sort((x, y) => x - y).join('_');
    if (seenTri.has(key)) continue;
    seenTri.add(key);
    outIdxArr.push(a, b, c);
  }

  const result: IndexedTriMesh = {
    positions: outPos,
    uvs: outUv,
    colors: outCol,
    indices: new Uint32Array(outIdxArr),
  };
  result.normals = computeSmoothNormals(result);
  return result;
}

/** Generate a complete LOD0 / LOD1 / LOD2 chain with screen-coverage thresholds. */
export function generateLodChain(source: IndexedTriMesh, ratios: [number, number, number] = [1.0, 0.45, 0.18]): CompiledLodMesh[] {
  const coverages: [number, number, number] = [0.22, 0.08, 0.015];
  const levels: [0, 1, 2] = [0, 1, 2];

  return levels.map((lvl, idx) => {
    const mesh = simplifyMesh(source, ratios[idx]);
    return {
      mesh,
      descriptor: {
        level: lvl,
        screenCoverageMin: coverages[idx],
        vertexCount: mesh.positions.length / 3,
        triangleCount: mesh.indices.length / 3,
        meshoptQuantized: true,
      },
    };
  });
}
