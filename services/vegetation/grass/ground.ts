// Plajah Vegetation — the ground the grass stands on (docs/plajah-vegetation.md §2.3).
//
// Three small textures over a square of the world, read by the grass shader:
//   height   — terrain height (half float), so blades sit on the ground without the CPU placing them,
//   cover    — RGBA: how strongly grass species 0…3 grow at each spot (roads, water, buildings = 0),
//   trample  — RG: the direction something pressed the grass flat, B: how flat (springs back over `recover` seconds).
// The level supplies heightAt / coverAt once; trample() is called for every character / vehicle that walks through.
import * as THREE from 'three/webgpu';

export interface GroundBounds { x0: number; z0: number; size: number; res: number }

export interface Ground {
  bounds: GroundBounds;
  height: THREE.DataTexture;
  cover: THREE.DataTexture;
  trample: THREE.DataTexture;
  /** Press the grass flat around (x, z): radius metres, amount 0…1. */
  press(x: number, z: number, radius: number, amount?: number): void;
  /** Spring the trampled grass back (once a frame). */
  update(dt: number): void;
}

export function bakeGround(
  b: GroundBounds,
  heightAt: (x: number, z: number) => number,
  coverAt: (x: number, z: number) => [number, number?, number?, number?],
  o: { recover?: number; trampleRes?: number } = {},
): Ground {
  const n = b.res, toX = (i: number) => b.x0 + ((i + 0.5) / n) * b.size;
  const hd = new Uint16Array(n * n), cd = new Uint8Array(n * n * 4);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = toX(i), z = toX(j) - b.x0 + b.z0, k = i + j * n;
    hd[k] = THREE.DataUtils.toHalfFloat(heightAt(x, z));
    const c = coverAt(x, z);
    for (let s = 0; s < 4; s++) cd[k * 4 + s] = Math.round(255 * Math.max(0, Math.min(1, c[s] ?? 0)));
  }
  const height = new THREE.DataTexture(hd, n, n, THREE.RedFormat, THREE.HalfFloatType);
  const cover = new THREE.DataTexture(cd, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  for (const t of [height, cover]) { t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true; }

  // trample: half a metre per texel (a footprint must cover a few texels or linear sampling smears it away)
  const tn = o.trampleRes ?? Math.min(512, Math.ceil(b.size * 2)), td = new Uint8Array(tn * tn * 4);
  for (let k = 0; k < tn * tn; k++) { td[k * 4] = td[k * 4 + 1] = 128; td[k * 4 + 3] = 255; }
  const flat = new Float32Array(tn * tn * 3);     // dx, dz, amount (CPU copy, full precision)
  const trample = new THREE.DataTexture(td, tn, tn, THREE.RGBAFormat, THREE.UnsignedByteType);
  trample.magFilter = trample.minFilter = THREE.LinearFilter; trample.generateMipmaps = false; trample.needsUpdate = true;
  const recover = o.recover ?? 3.5, texel = b.size / tn;
  let dirty = false, live = 0;
  // the trampled region's box (texels), so the spring-back only walks what is flat
  let bx0 = tn, bx1 = -1, bz0 = tn, bz1 = -1;

  return {
    bounds: b, height, cover, trample,
    press(x, z, radius, amount = 1) {
      const ci = (x - b.x0) / texel - 0.5, cj = (z - b.z0) / texel - 0.5, rr = Math.max(1.5, radius / texel);
      const i0 = Math.max(0, Math.floor(ci - rr)), i1 = Math.min(tn - 1, Math.ceil(ci + rr));
      const j0 = Math.max(0, Math.floor(cj - rr)), j1 = Math.min(tn - 1, Math.ceil(cj + rr));
      if (i0 > i1 || j0 > j1) return;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const dx = i - ci, dz = j - cj, d = Math.hypot(dx, dz);
        if (d > rr) continue;
        const a = amount * (1 - (d / rr) ** 2), k = (i + j * tn) * 3;
        if (a <= flat[k + 2]) continue;
        const l = d || 1;
        flat[k] = d ? dx / l : 0; flat[k + 1] = d ? dz / l : 0; flat[k + 2] = a;
      }
      bx0 = Math.min(bx0, i0); bx1 = Math.max(bx1, i1); bz0 = Math.min(bz0, j0); bz1 = Math.max(bz1, j1);
      dirty = true; live = 1;
    },
    update(dt) {
      if (!live) return;
      const k1 = Math.exp(-dt / recover);
      let any = 0;
      for (let j = bz0; j <= bz1; j++) for (let i = bx0; i <= bx1; i++) {
        const k = i + j * tn, a = flat[k * 3 + 2];
        if (a <= 0.004) { if (a) { flat[k * 3 + 2] = 0; td[k * 4 + 2] = 0; } continue; }
        const na = a * k1; flat[k * 3 + 2] = na; any = 1;
        td[k * 4] = Math.round(128 + flat[k * 3] * 127); td[k * 4 + 1] = Math.round(128 + flat[k * 3 + 1] * 127); td[k * 4 + 2] = Math.round(na * 255);
      }
      if (!any) { live = 0; bx0 = tn; bx1 = -1; bz0 = tn; bz1 = -1; }
      if (any || dirty) trample.needsUpdate = true;
      dirty = false;
    },
  };
}
