// ═══════════════════════════════════════════════════════════════════════════
// treeGeometry — TreeSkeleton → GPU buffers.
//
// One merged mesh for the whole trunk-and-branch system (a draw call per tree,
// not per twig), and a matrix set for instanced leaves. Kept pure and free of
// three.js so the packing maths is unit-testable in node; the R3F component
// wraps these arrays in BufferAttributes.
//
// Branches are tapered prisms: a ring of `radialSegments` verts at each end of
// every segment, stitched with two triangles per side. At 5 sides a pine costs
// ~5k verts — cheap enough to fill a hall with, which is the point.
// ═══════════════════════════════════════════════════════════════════════════

import type { TreeSkeleton, Leaf } from './TreeGrower';

export interface TreeBuffers {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  /** Per-vertex depth (0 = trunk) — the bark shader darkens the crown with it. */
  depths: Float32Array;
  vertexCount: number;
  triangleCount: number;
}

/** Column basis for a segment pointing along `d` (unit). */
function basis(dx: number, dy: number, dz: number): [number[], number[]] {
  const refY = Math.abs(dy) < 0.9;
  const rx = refY ? 0 : 1, ry = refY ? 1 : 0, rz = 0;
  // u = normalize(cross(d, ref))
  let ux = dy * rz - dz * ry, uy = dz * rx - dx * rz, uz = dx * ry - dy * rx;
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul; uy /= ul; uz /= ul;
  // v = cross(d, u)
  const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux;
  return [[ux, uy, uz], [vx, vy, vz]];
}

export function buildTreeGeometry(sk: TreeSkeleton, radialSegments = 5): TreeBuffers {
  const R = Math.max(3, Math.round(radialSegments));
  const segs = sk.segments;
  const vertsPerSeg = R * 2;
  const vertexCount = segs.length * vertsPerSeg;
  const triangleCount = segs.length * R * 2;

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const depths = new Float32Array(vertexCount);
  const indices = new Uint32Array(triangleCount * 3);

  let vp = 0, up = 0, dp = 0, ip = 0, base = 0;

  for (const s of segs) {
    let dx = s.x1 - s.x0, dy = s.y1 - s.y0, dz = s.z1 - s.z0;
    const len = Math.hypot(dx, dy, dz) || 1e-6;
    dx /= len; dy /= len; dz /= len;
    const [u, v] = basis(dx, dy, dz);

    for (let ring = 0; ring < 2; ring++) {
      const ox = ring ? s.x1 : s.x0, oy = ring ? s.y1 : s.y0, oz = ring ? s.z1 : s.z0;
      const r = ring ? s.r1 : s.r0;
      for (let i = 0; i < R; i++) {
        const a = (i / R) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        const nx = u[0] * ca + v[0] * sa;
        const ny = u[1] * ca + v[1] * sa;
        const nz = u[2] * ca + v[2] * sa;
        positions[vp++] = ox + nx * r;
        positions[vp++] = oy + ny * r;
        positions[vp++] = oz + nz * r;
        normals[dp++] = nx; normals[dp++] = ny; normals[dp++] = nz;
        uvs[up++] = i / R;
        uvs[up++] = ring;
        depths[base + ring * R + i] = s.depth;
      }
    }

    for (let i = 0; i < R; i++) {
      const a = base + i;
      const b = base + ((i + 1) % R);
      const c = base + R + i;
      const d = base + R + ((i + 1) % R);
      indices[ip++] = a; indices[ip++] = c; indices[ip++] = b;
      indices[ip++] = b; indices[ip++] = c; indices[ip++] = d;
    }
    base += vertsPerSeg;
  }

  return { positions, normals, uvs, indices, depths, vertexCount, triangleCount };
}

/**
 * Per-leaf instance matrices, column-major 4x4, flattened — ready for
 * InstancedBufferAttribute. Each leaf is a quad billboarded along its own
 * outward normal, twisted by its tint so a canopy never looks stamped.
 */
export function buildLeafMatrices(leaves: Leaf[]): { matrices: Float32Array; tints: Float32Array; count: number } {
  const count = leaves.length;
  const matrices = new Float32Array(count * 16);
  const tints = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const l = leaves[i];
    const s = l.scale;
    // forward = the leaf's outward direction
    let fx = l.dx, fy = l.dy, fz = l.dz;
    const fl = Math.hypot(fx, fy, fz) || 1;
    fx /= fl; fy /= fl; fz /= fl;
    const [u, v] = basis(fx, fy, fz);
    // roll the quad around its own axis by the tint so leaves face every way
    const roll = l.tint * Math.PI * 2;
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const ax = u[0] * cr + v[0] * sr, ay = u[1] * cr + v[1] * sr, az = u[2] * cr + v[2] * sr;
    const bx = fy * az - fz * ay, by = fz * ax - fx * az, bz = fx * ay - fy * ax;

    const o = i * 16;
    matrices[o + 0] = ax * s;  matrices[o + 1] = ay * s;  matrices[o + 2] = az * s;  matrices[o + 3] = 0;
    matrices[o + 4] = bx * s;  matrices[o + 5] = by * s;  matrices[o + 6] = bz * s;  matrices[o + 7] = 0;
    matrices[o + 8] = fx * s;  matrices[o + 9] = fy * s;  matrices[o + 10] = fz * s; matrices[o + 11] = 0;
    matrices[o + 12] = l.x;    matrices[o + 13] = l.y;    matrices[o + 14] = l.z;    matrices[o + 15] = 1;
    tints[i] = l.tint;
  }
  return { matrices, tints, count };
}

/** Axis-aligned bounds — the scene uses it to frame a specimen without guessing. */
export function skeletonBounds(sk: TreeSkeleton): { min: [number, number, number]; max: [number, number, number] } {
  let mnx = Infinity, mny = Infinity, mnz = Infinity;
  let mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
  const eat = (x: number, y: number, z: number) => {
    if (x < mnx) mnx = x; if (y < mny) mny = y; if (z < mnz) mnz = z;
    if (x > mxx) mxx = x; if (y > mxy) mxy = y; if (z > mxz) mxz = z;
  };
  for (const s of sk.segments) { eat(s.x0, s.y0, s.z0); eat(s.x1, s.y1, s.z1); }
  for (const l of sk.leaves) eat(l.x, l.y, l.z);
  if (!Number.isFinite(mnx)) return { min: [0, 0, 0], max: [0, 0, 0] };
  return { min: [mnx, mny, mnz], max: [mxx, mxy, mxz] };
}
