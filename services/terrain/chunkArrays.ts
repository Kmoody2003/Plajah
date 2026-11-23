// Plajah Terrain — ground patch arrays (three-free, so a worker can build them).
//
// One square patch centred on (cx, cz): seg × seg quads sampled from a surface, holes cut, skirts round the edge to hide
// the cracks between detail levels. chunks.ts wraps the arrays in a BufferGeometry; meshWorker.ts builds them off the
// main thread.
import type { SurfaceSource } from './field';

export interface ChunkArrays {
  pos: Float32Array; nor: Float32Array; uv: Float32Array;
  index: Uint16Array | Uint32Array;
  /** Bounding sphere [x, y, z, r]. */
  sphere: [number, number, number, number];
}

export interface PatchOptions {
  holed?: (x: number, z: number) => boolean;
  mayHaveHoles?: (cx: number, cz: number, chunk: number) => boolean;
  uvScale?: number;
  /** Normals from the sampled grid (one ring beyond the patch) instead of extra surface reads: 5× fewer reads. */
  gridNormals?: boolean;
}

export function chunkArrays(S: SurfaceSource, cx: number, cz: number, C: number, seg: number, skirt: number, o: PatchOptions = {}): ChunkArrays {
  const step = C / seg, x0 = cx - C / 2, z0 = cz - C / 2, v = seg + 1, uvk = 1 / (o.uvScale ?? 8), e = Math.max(1, step * 0.5);
  const nGrid = v * v, nSkirt = 4 * seg * 2, nv = nGrid + nSkirt;
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uvs = new Float32Array(nv * 2);
  const vb = v + 2, hb = o.gridNormals ? new Float32Array(vb * vb) : null;
  if (hb) for (let j = 0; j < vb; j++) for (let i = 0; i < vb; i++) hb[i + j * vb] = S.surface(x0 + (i - 1) * step, z0 + (j - 1) * step);
  let yLo = Infinity, yHi = -Infinity;
  for (let j = 0; j <= seg; j++) for (let i = 0; i <= seg; i++) {
    const x = x0 + i * step, z = z0 + j * step, k = i + j * v;
    let nx: number, ny: number, nz: number, h: number;
    if (hb) {
      const c = i + 1 + (j + 1) * vb, dx = hb[c - 1] - hb[c + 1], dz = hb[c - vb] - hb[c + vb], l = Math.hypot(dx, 2 * step, dz);
      nx = dx / l; ny = (2 * step) / l; nz = dz / l; h = hb[c];
    } else { const n = S.normal(x, z, e); nx = n[0]; ny = n[1]; nz = n[2]; h = S.surface(x, z); }
    pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
    nor[k * 3] = nx; nor[k * 3 + 1] = ny; nor[k * 3 + 2] = nz;
    uvs[k * 2] = x * uvk; uvs[k * 2 + 1] = z * uvk;
    if (h < yLo) yLo = h; if (h > yHi) yHi = h;
  }
  const hasHoles = !!o.holed && (o.mayHaveHoles ? o.mayHaveHoles(cx, cz, C) : true);
  const idx: number[] = [];
  for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) {
    const a = i + j * v, b = a + 1, c = a + v, d = c + 1;
    if (hasHoles && o.holed!(x0 + (i + 0.5) * step, z0 + (j + 0.5) * step)) continue;
    idx.push(a, c, b, b, c, d);
  }
  let w = nGrid;
  const edge = (list: number[]) => {
    for (let k = 0; k < list.length - 1; k++) {
      const p = list[k], q = list[k + 1], base = w;
      for (const s of [p, q]) {
        pos[w * 3] = pos[s * 3]; pos[w * 3 + 1] = pos[s * 3 + 1] - skirt; pos[w * 3 + 2] = pos[s * 3 + 2];
        nor[w * 3] = nor[s * 3]; nor[w * 3 + 1] = nor[s * 3 + 1]; nor[w * 3 + 2] = nor[s * 3 + 2];
        uvs[w * 2] = uvs[s * 2]; uvs[w * 2 + 1] = uvs[s * 2 + 1]; w++;
      }
      idx.push(p, base, q, q, base, base + 1);
    }
  };
  const row = (j: number) => Array.from({ length: v }, (_, i) => i + j * v), col = (i: number) => Array.from({ length: v }, (_, j) => i + j * v);
  edge(row(0)); edge(row(seg).reverse()); edge(col(0).reverse()); edge(col(seg));
  const yMid = (yLo + yHi - skirt) / 2, half = C / 2;
  return { pos, nor, uv: uvs, index: nv > 65535 ? Uint32Array.from(idx) : Uint16Array.from(idx), sphere: [cx, yMid, cz, Math.hypot(half, half, (yHi - yLo + skirt) / 2)] };
}
