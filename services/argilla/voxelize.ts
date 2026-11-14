/**
 * voxelize.ts — turn any triangle mesh into clay, so generated or imported models can be sculpted.
 *
 * Writes true distances into the bricks near the surface, then flood-fills from outside to learn
 * which empty cells are solid. Sign comes from the nearest triangle's face, which holds up on the
 * closed-ish meshes image-to-3D models make. Colour is not carried over yet.
 */

import { BRICK_STRIDE, BRICK_VOXELS } from './brickPool';
import type { ClayFieldSnapshot } from './engine';

export interface VoxelizeOptions {
  grid: number;
  /** Largest half-extent after fitting. */
  fit?: number;
  /** The mesh is already in clay space, lined up with something, so don't re-centre or re-scale it. */
  inPlace?: boolean;
  /** Called between batches so a long import can yield to the page. */
  onProgress?: (fraction: number) => Promise<void> | void;
}

export async function voxelizeMesh(
  positions: Float32Array,
  indices: Uint32Array | Uint16Array,
  options: VoxelizeOptions,
): Promise<ClayFieldSnapshot> {
  const { grid, fit = 0.82, inPlace = false, onProgress } = options;
  const voxel = 2 / (grid * BRICK_VOXELS);
  const cellSize = 2 / grid;
  const band = voxel * 4;
  // Triangles write only the nearest samples; a chamfer pass carries distance out to the band.
  const reach = voxel * 2;
  const count = BRICK_STRIDE ** 3;

  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], positions[i + k]);
    max[k] = Math.max(max[k], positions[i + k]);
  }
  const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1;
  const scale = inPlace ? 1 : (2 * fit) / extent;
  const centre = [0, 1, 2].map((k) => (inPlace ? 0 : (min[k] + max[k]) / 2));
  const P = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) for (let k = 0; k < 3; k++) {
    P[i + k] = (positions[i + k] - centre[k]) * scale;
  }

  // A mesh wound inside out would otherwise sculpt as a hollow shell.
  let wound = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    wound += P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1])
      - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c])
      + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c]);
  }
  const facing = wound < 0 ? -1 : 1;

  const bricks = new Map<number, { dist: Float32Array; sign: Int8Array }>();
  let lastCell = -1;
  let lastBrick: { dist: Float32Array; sign: Int8Array } | undefined;
  const brickAt = (cell: number) => {
    if (cell === lastCell) return lastBrick!;
    let b = bricks.get(cell);
    if (!b) {
      b = { dist: new Float32Array(count).fill(Infinity), sign: new Int8Array(count) };
      bricks.set(cell, b);
    }
    lastCell = cell;
    lastBrick = b;
    return b;
  };

  const tris = indices.length / 3;
  for (let t = 0; t < tris; t++) {
    if (onProgress && t % 4000 === 0) await onProgress(t / tris);
    const ia = indices[t * 3] * 3, ib = indices[t * 3 + 1] * 3, ic = indices[t * 3 + 2] * 3;
    const ax = P[ia], ay = P[ia + 1], az = P[ia + 2];
    const bx = P[ib], by = P[ib + 1], bz = P[ib + 2];
    const cx = P[ic], cy = P[ic + 1], cz = P[ic + 2];
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const acx = cx - ax, acy = cy - ay, acz = cz - az;
    let nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
    const nl = Math.hypot(nx, ny, nz);
    if (nl < 1e-12) continue;
    nx *= facing / nl; ny *= facing / nl; nz *= facing / nl;
    const d00 = abx * abx + aby * aby + abz * abz;
    const d01 = abx * acx + aby * acy + abz * acz;
    const d11 = acx * acx + acy * acy + acz * acz;

    const loX = Math.min(ax, bx, cx) - reach, hiX = Math.max(ax, bx, cx) + reach;
    const loY = Math.min(ay, by, cy) - reach, hiY = Math.max(ay, by, cy) + reach;
    const loZ = Math.min(az, bz, cz) - reach, hiZ = Math.max(az, bz, cz) + reach;
    const toCell = (v: number) => Math.max(0, Math.min(grid - 1, Math.floor((v + 1) / cellSize)));

    for (let gz = toCell(loZ - voxel); gz <= toCell(hiZ + voxel); gz++)
      for (let gy = toCell(loY - voxel); gy <= toCell(hiY + voxel); gy++)
        for (let gx = toCell(loX - voxel); gx <= toCell(hiX + voxel); gx++) {
          const cell = gx + grid * (gy + grid * gz);
          const ox = gx * cellSize - 1 - voxel, oy = gy * cellSize - 1 - voxel, oz = gz * cellSize - 1 - voxel;
          const clampI = (v: number) => Math.max(0, Math.min(BRICK_STRIDE - 1, v));
          const x0 = clampI(Math.ceil((loX - ox) / voxel)), x1 = clampI(Math.floor((hiX - ox) / voxel));
          const y0 = clampI(Math.ceil((loY - oy) / voxel)), y1 = clampI(Math.floor((hiY - oy) / voxel));
          const z0 = clampI(Math.ceil((loZ - oz) / voxel)), z1 = clampI(Math.floor((hiZ - oz) / voxel));
          for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const px = ox + x * voxel, py = oy + y * voxel, pz = oz + z * voxel;
            const plane = (px - ax) * nx + (py - ay) * ny + (pz - az) * nz;
            if (Math.abs(plane) > reach) continue;
            // Closest point on the triangle, clamped through barycentrics.
            const apx = px - ax, apy = py - ay, apz = pz - az;
            const d20 = apx * abx + apy * aby + apz * abz;
            const d21 = apx * acx + apy * acy + apz * acz;
            const denom = d00 * d11 - d01 * d01;
            let v = denom ? (d11 * d20 - d01 * d21) / denom : 0;
            let w = denom ? (d00 * d21 - d01 * d20) / denom : 0;
            if (v < 0 || w < 0 || v + w > 1) {
              const edge = (ex: number, ey: number, ez: number, fx: number, fy: number, fz: number) => {
                const l = ex * ex + ey * ey + ez * ez;
                const s = l ? Math.max(0, Math.min(1, ((px - fx) * ex + (py - fy) * ey + (pz - fz) * ez) / l)) : 0;
                const dx = px - fx - ex * s, dy = py - fy - ey * s, dz = pz - fz - ez * s;
                // This runs for most samples of most triangles, and Math.hypot is many times slower.
                return Math.sqrt(dx * dx + dy * dy + dz * dz);
              };
              const e = Math.min(
                edge(abx, aby, abz, ax, ay, az),
                edge(acx, acy, acz, ax, ay, az),
                edge(cx - bx, cy - by, cz - bz, bx, by, bz),
              );
              v = w = -1;
              write(cell, x, y, z, e, plane);
            } else {
              write(cell, x, y, z, Math.abs(plane), plane);
            }
          }
        }
  }

  function write(cell: number, x: number, y: number, z: number, d: number, plane: number) {
    if (d > reach) return;
    const brick = brickAt(cell);
    const i = x + BRICK_STRIDE * (y + BRICK_STRIDE * z);
    const best = brick.dist[i];
    // On a near tie (a shared edge) the face looking most directly at the sample decides the sign.
    if (d < best - 1e-7 || (Math.abs(d - best) <= 1e-7 && Math.abs(plane) > d * 0.7)) {
      brick.dist[i] = d;
      brick.sign[i] = plane < 0 ? -1 : 1;
    }
  }

  // Samples no triangle reached sit past the band: spread the sign to them from their neighbours.
  const S = BRICK_STRIDE;
  const cells = [...bricks.keys()];
  const values = new Float32Array(cells.length * count);
  cells.forEach((cell, n) => {
    const { dist, sign } = bricks.get(cell)!;
    let changed = true;
    while (changed) {
      changed = false;
      for (let z = 0; z < S; z++) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const i = x + S * (y + S * z);
        if (sign[i]) continue;
        const s = (x > 0 && sign[i - 1]) || (x < S - 1 && sign[i + 1])
          || (y > 0 && sign[i - S]) || (y < S - 1 && sign[i + S])
          || (z > 0 && sign[i - S * S]) || (z < S - 1 && sign[i + S * S]) || 0;
        if (s) { sign[i] = s; changed = true; }
      }
    }
    // Chamfer forward and back. Good enough off the surface, where only the band's shape matters.
    const relax = (i: number, j: number) => { if (dist[j] + voxel < dist[i]) dist[i] = dist[j] + voxel; };
    for (let z = 0; z < S; z++) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = x + S * (y + S * z);
      if (x > 0) relax(i, i - 1);
      if (y > 0) relax(i, i - S);
      if (z > 0) relax(i, i - S * S);
    }
    for (let z = S - 1; z >= 0; z--) for (let y = S - 1; y >= 0; y--) for (let x = S - 1; x >= 0; x--) {
      const i = x + S * (y + S * z);
      if (x < S - 1) relax(i, i + 1);
      if (y < S - 1) relax(i, i + S);
      if (z < S - 1) relax(i, i + S * S);
    }
    for (let i = 0; i < count; i++) {
      values[n * count + i] = (sign[i] < 0 ? -1 : 1) * Math.min(dist[i], band);
    }
  });

  // Flood from the domain's outer faces through brick-free cells; whatever stays unreached is solid.
  const total = grid ** 3;
  const reached = new Uint8Array(total);
  const stack: number[] = [];
  const push = (x: number, y: number, z: number) => {
    if (x < 0 || y < 0 || z < 0 || x >= grid || y >= grid || z >= grid) return;
    const c = x + grid * (y + grid * z);
    if (reached[c] || bricks.has(c)) return;
    reached[c] = 1;
    stack.push(c);
  };
  for (let a = 0; a < grid; a++) for (let b = 0; b < grid; b++) {
    push(a, b, 0); push(a, b, grid - 1);
    push(a, 0, b); push(a, grid - 1, b);
    push(0, a, b); push(grid - 1, a, b);
  }
  while (stack.length) {
    const c = stack.pop()!;
    const x = c % grid, y = Math.floor(c / grid) % grid, z = Math.floor(c / (grid * grid));
    push(x - 1, y, z); push(x + 1, y, z);
    push(x, y - 1, z); push(x, y + 1, z);
    push(x, y, z - 1); push(x, y, z + 1);
  }
  const states = new Uint8Array(total);
  for (let c = 0; c < total; c++) if (!reached[c] && !bricks.has(c)) states[c] = 1;

  return { grid, band, states, cells: new Uint32Array(cells), values };
}
