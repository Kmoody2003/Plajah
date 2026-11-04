/**
 * surfaceNets.ts — turn the clay field into a triangle mesh for export.
 *
 * Naive surface nets over a voxel lattice. `sample` takes whole lattice coordinates, so the same
 * code runs on the GPU readback and on plain functions in tests. Only `cells` are visited, which
 * keeps export proportional to the surface and not to the volume.
 */

export interface SurfaceMesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

export interface SurfaceNetsInput {
  /** Lattice points per side of the whole domain, minus one. */
  resolution: number;
  /** Distance sample at a lattice point. */
  sample: (x: number, y: number, z: number) => number;
  /** Lattice blocks known to hold surface, as [x, y, z] minimum corners. */
  blocks: Iterable<[number, number, number]>;
  blockSize: number;
  /** Lattice step: 1 is full resolution, 2 is half, and so on. */
  stride?: number;
  /** Maps a lattice coordinate into world space. */
  toWorld: (v: number) => number;
}

const CORNERS: [number, number, number][] = [
  [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
];
const EDGES: [number, number][] = [
  [0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7],
];

export function surfaceNets(input: SurfaceNetsInput): SurfaceMesh {
  const { resolution, sample, blocks, blockSize, toWorld } = input;
  const stride = Math.max(1, input.stride ?? 1);
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const vertexAt = new Map<number, number>();
  const side = Math.ceil(resolution / stride) + 2;
  const key = (x: number, y: number, z: number) => x + side * (y + side * z);
  const d = new Float64Array(8);

  const visit = new Set<number>();
  for (const [bx, by, bz] of blocks) {
    const x0 = Math.floor(bx / stride), y0 = Math.floor(by / stride), z0 = Math.floor(bz / stride);
    const n = Math.ceil(blockSize / stride);
    for (let z = z0; z < z0 + n; z++) for (let y = y0; y < y0 + n; y++) for (let x = x0; x < x0 + n; x++) {
      if (x * stride >= resolution || y * stride >= resolution || z * stride >= resolution) continue;
      visit.add(key(x, y, z));
    }
  }

  const vertexFor = (x: number, y: number, z: number): number => {
    const k = key(x, y, z);
    const known = vertexAt.get(k);
    if (known !== undefined) return known;
    let inside = 0;
    for (let c = 0; c < 8; c++) {
      d[c] = sample((x + CORNERS[c][0]) * stride, (y + CORNERS[c][1]) * stride, (z + CORNERS[c][2]) * stride);
      if (d[c] < 0) inside |= 1 << c;
    }
    if (inside === 0 || inside === 255) {
      vertexAt.set(k, -1);
      return -1;
    }
    let px = 0, py = 0, pz = 0, count = 0;
    for (const [a, b] of EDGES) {
      if (((inside >> a) & 1) === ((inside >> b) & 1)) continue;
      const t = d[a] / (d[a] - d[b]);
      px += CORNERS[a][0] + (CORNERS[b][0] - CORNERS[a][0]) * t;
      py += CORNERS[a][1] + (CORNERS[b][1] - CORNERS[a][1]) * t;
      pz += CORNERS[a][2] + (CORNERS[b][2] - CORNERS[a][2]) * t;
      count++;
    }
    const lx = (x + px / count) * stride, ly = (y + py / count) * stride, lz = (z + pz / count) * stride;
    const index = positions.length / 3;
    positions.push(toWorld(lx), toWorld(ly), toWorld(lz));
    // Normal from the corner differences, which never needs a sample outside this cube.
    let nx = d[1] + d[3] + d[5] + d[7] - d[0] - d[2] - d[4] - d[6];
    let ny = d[2] + d[3] + d[6] + d[7] - d[0] - d[1] - d[4] - d[5];
    let nz = d[4] + d[5] + d[6] + d[7] - d[0] - d[1] - d[2] - d[3];
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    normals.push(nx, ny, nz);
    vertexAt.set(k, index);
    return index;
  };

  const quad = (a: number, b: number, c: number, e: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || e < 0) return;
    if (flip) indices.push(a, c, b, b, c, e);
    else indices.push(a, b, c, b, e, c);
  };

  for (const k of visit) {
    const x = k % side, y = Math.floor(k / side) % side, z = Math.floor(k / (side * side));
    const here = sample(x * stride, y * stride, z * stride);
    if (x > 0 && y > 0) {
      const next = sample(x * stride, y * stride, (z + 1) * stride);
      if ((here < 0) !== (next < 0)) {
        quad(vertexFor(x - 1, y - 1, z), vertexFor(x, y - 1, z), vertexFor(x - 1, y, z), vertexFor(x, y, z), next < 0);
      }
    }
    if (x > 0 && z > 0) {
      const next = sample(x * stride, (y + 1) * stride, z * stride);
      if ((here < 0) !== (next < 0)) {
        quad(vertexFor(x - 1, y, z - 1), vertexFor(x - 1, y, z), vertexFor(x, y, z - 1), vertexFor(x, y, z), next < 0);
      }
    }
    if (y > 0 && z > 0) {
      const next = sample((x + 1) * stride, y * stride, z * stride);
      if ((here < 0) !== (next < 0)) {
        quad(vertexFor(x, y - 1, z - 1), vertexFor(x, y, z - 1), vertexFor(x, y - 1, z), vertexFor(x, y, z), next < 0);
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
  };
}
