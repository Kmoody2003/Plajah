// Triangle meshes for the loop: reading a scan's GLB (no three.js, so Node and workers can use it) and the
// small helpers the replay and renderer share.

import type { Vec3 } from './schema';

export interface TriMesh {
  positions: Float32Array;
  indices: Uint32Array;
  /** Per-vertex linear-ish RGB 0..1 (straight from the file's sRGB bytes / 255). */
  colours?: Float32Array;
  normals?: Float32Array;
}

export interface DecodedImage { width: number; height: number; data: Uint8Array | Uint8ClampedArray }
export type ImageDecoder = (bytes: Uint8Array, mime: string) => Promise<DecodedImage>;

/**
 * All triangles of a GLB with node transforms applied, plus a colour per vertex: COLOR_0 if present, else the
 * base colour texture sampled at the vertex's UV (needs `decode`), else the material's base colour factor.
 */
export async function readGlb(buf: Uint8Array, decode?: ImageDecoder): Promise<TriMesh> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB file');
  const jsonLen = dv.getUint32(12, true);
  const gltf = JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + jsonLen)));
  const binStart = 20 + jsonLen + 8;
  const bin = buf.subarray(binStart);
  const viewBytes = (i: number) => { const v = gltf.bufferViews[i]; return bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength); };
  const COMPS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  const accessor = (i: number): Float32Array => {
    const a = gltf.accessors[i], v = gltf.bufferViews[a.bufferView];
    const n = COMPS[a.type], count = a.count, out = new Float32Array(count * n);
    const base = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const size = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[a.componentType as 5126] ?? 4;
    const stride = v.byteStride || size * n;
    const d = new DataView(bin.buffer, bin.byteOffset + base, Math.max(0, (count - 1) * stride + size * n));
    for (let k = 0; k < count; k++) for (let c = 0; c < n; c++) {
      const o = k * stride + c * size;
      let x: number;
      switch (a.componentType) {
        case 5126: x = d.getFloat32(o, true); break;
        case 5125: x = d.getUint32(o, true); break;
        case 5123: x = d.getUint16(o, true); if (a.normalized) x /= 65535; break;
        case 5121: x = d.getUint8(o); if (a.normalized) x /= 255; break;
        default: x = 0;
      }
      out[k * n + c] = x;
    }
    return out;
  };
  const images = new Map<number, DecodedImage | null>();
  const imageFor = async (texIndex: number) => {
    const src = gltf.textures?.[texIndex]?.source;
    if (src === undefined || !decode) return null;
    if (!images.has(src)) {
      const im = gltf.images[src];
      images.set(src, im.bufferView !== undefined ? await decode(viewBytes(im.bufferView), im.mimeType ?? 'image/png') : null);
    }
    return images.get(src) ?? null;
  };

  // Node world matrices.
  const world: (number[] | null)[] = new Array(gltf.nodes?.length ?? 0).fill(null);
  const local = (n: any): number[] => {
    if (n.matrix) return n.matrix;
    const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = n.scale ?? [1, 1, 1], [tx, ty, tz] = n.translation ?? [0, 0, 0];
    return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
      2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
      2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
  };
  const mul = (a: number[], b: number[]) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
  const visit = (i: number, parent: number[]) => { world[i] = mul(parent, local(gltf.nodes[i])); for (const c of gltf.nodes[i].children ?? []) visit(c, world[i]!); };
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const roots = gltf.scenes?.[gltf.scene ?? 0]?.nodes ?? gltf.nodes?.map((_: unknown, i: number) => i) ?? [];
  for (const r of roots) visit(r, I);

  const P: number[] = [], C: number[] = [], X: number[] = [];
  for (let ni = 0; ni < world.length; ni++) {
    const node = gltf.nodes[ni], m = world[ni];
    if (node.mesh === undefined || !m) continue;
    for (const prim of gltf.meshes[node.mesh].primitives) {
      if (prim.mode !== undefined && prim.mode !== 4) continue;
      const pos = accessor(prim.attributes.POSITION);
      const base = P.length / 3, count = pos.length / 3;
      for (let k = 0; k < count; k++) {
        const x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2];
        P.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
      }
      const mat = prim.material !== undefined ? gltf.materials?.[prim.material] : undefined;
      const factor: number[] = mat?.pbrMetallicRoughness?.baseColorFactor ?? [0.8, 0.8, 0.8, 1];
      if (prim.attributes.COLOR_0 !== undefined) {
        const col = accessor(prim.attributes.COLOR_0), n = col.length / count;
        for (let k = 0; k < count; k++) C.push(col[k * n] * factor[0], col[k * n + 1] * factor[1], col[k * n + 2] * factor[2]);
      } else {
        const ti = mat?.pbrMetallicRoughness?.baseColorTexture?.index;
        const img = ti !== undefined ? await imageFor(ti) : null;
        const uv = img && prim.attributes.TEXCOORD_0 !== undefined ? accessor(prim.attributes.TEXCOORD_0) : null;
        for (let k = 0; k < count; k++) {
          if (img && uv) {
            const u = uv[k * 2] - Math.floor(uv[k * 2]), v = uv[k * 2 + 1] - Math.floor(uv[k * 2 + 1]);
            const px = Math.min(img.width - 1, Math.floor(u * img.width)), py = Math.min(img.height - 1, Math.floor(v * img.height));
            const o = (py * img.width + px) * 4;
            C.push((img.data[o] / 255) * factor[0], (img.data[o + 1] / 255) * factor[1], (img.data[o + 2] / 255) * factor[2]);
          } else C.push(factor[0], factor[1], factor[2]);
        }
      }
      if (prim.indices !== undefined) { const idx = accessor(prim.indices); for (const v of idx) X.push(base + v); }
      else for (let k = 0; k < count; k++) X.push(base + k);
    }
  }
  if (!X.length) throw new Error('the GLB has no triangles');
  return { positions: new Float32Array(P), indices: new Uint32Array(X), colours: new Float32Array(C) };
}

export function boundsOf(positions: Float32Array): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], positions[i + k]); max[k] = Math.max(max[k], positions[i + k]); }
  return { min, max };
}

/** Smooth vertex normals from the triangles. */
export function vertexNormals(m: TriMesh): Float32Array {
  const P = m.positions, n = new Float32Array(P.length);
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = m.indices[t] * 3, b = m.indices[t + 1] * 3, c = m.indices[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const i of [a, b, c]) { n[i] += nx; n[i + 1] += ny; n[i + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
  return n;
}

/** A uniform-grid lookup of the nearest vertex (for carrying scan colours onto the rebuilt surface). */
export class NearestVertex {
  private cells = new Map<number, number[]>();
  constructor(private P: Float32Array, private cell: number) {
    for (let i = 0; i < P.length / 3; i++) {
      const k = this.key(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      const list = this.cells.get(k); if (list) list.push(i); else this.cells.set(k, [i]);
    }
  }
  private key(x: number, y: number, z: number) { const c = this.cell; return ((Math.floor(x / c) + 512) * 1024 + (Math.floor(y / c) + 512)) * 1024 + (Math.floor(z / c) + 512); }
  /** Nearest vertex index within `rings` cells, or -1. */
  find(x: number, y: number, z: number, rings = 2): number {
    let best = -1, bd = Infinity;
    const c = this.cell, gx = Math.floor(x / c), gy = Math.floor(y / c), gz = Math.floor(z / c);
    for (let dz = -rings; dz <= rings; dz++) for (let dy = -rings; dy <= rings; dy++) for (let dx = -rings; dx <= rings; dx++) {
      const list = this.cells.get(((gx + dx + 512) * 1024 + (gy + dy + 512)) * 1024 + (gz + dz + 512));
      if (!list) continue;
      for (const i of list) { const d = (this.P[i * 3] - x) ** 2 + (this.P[i * 3 + 1] - y) ** 2 + (this.P[i * 3 + 2] - z) ** 2; if (d < bd) { bd = d; best = i; } }
    }
    return best;
  }
}
