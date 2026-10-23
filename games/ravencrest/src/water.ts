// Interactive water: a CPU heightfield (wave-equation) surface for small
// bodies of water — the courtyard well today, fountains and basins later.
// Raindrip, wind chop and physical disturbances (props landing, the player
// leaning over) all inject ripples that propagate and reflect off the rim.
import * as THREE from 'three/webgpu';
import { setReflect } from './materials';
import { rng } from './kit';

export class HeightfieldWater {
  readonly mesh: THREE.Mesh;
  private res: number;
  private h: Float32Array;
  private v: Float32Array;
  private mask: Float32Array;
  private acc = 0;
  private dripT = 1.2;
  private rand = rng(2024);
  private size: number;

  /** @param size world width of the square patch (the visible disc is masked round). */
  constructor(size = 2.9, res = 44) {
    this.size = size;
    this.res = res;
    const n = res * res;
    this.h = new Float32Array(n);
    this.v = new Float32Array(n);
    this.mask = new Float32Array(n);
    const geo = new THREE.PlaneGeometry(size, size, res - 1, res - 1);
    geo.rotateX(-Math.PI / 2);
    // Circular mask: cells beyond the rim stay at zero and act as the wall.
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const x = (i / (res - 1) - 0.5) * size, z = (j / (res - 1) - 0.5) * size;
        this.mask[j * res + i] = Math.hypot(x, z) < size * 0.485 ? 1 : 0;
      }
    }
    const mat = new THREE.MeshStandardNodeMaterial({ color: 0x0a0e12, roughness: 0.05, metalness: 0 });
    setReflect(mat, 1, 0.05);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
  }

  /** Disturb the surface at a world position (converted to the patch's local grid). */
  ripple(worldPos: THREE.Vector3, strength = 1, radiusCells = 2) {
    const local = this.mesh.worldToLocal(worldPos.clone());
    const res = this.res;
    const gx = Math.round((local.x / this.size + 0.5) * (res - 1));
    const gz = Math.round((local.z / this.size + 0.5) * (res - 1));
    for (let j = -radiusCells; j <= radiusCells; j++) {
      for (let i = -radiusCells; i <= radiusCells; i++) {
        const x = gx + i, z = gz + j;
        if (x < 1 || z < 1 || x >= res - 1 || z >= res - 1) continue;
        const d = Math.hypot(i, j) / (radiusCells + 0.5);
        this.v[z * res + x] -= strength * (1 - d) * 2.4;
      }
    }
  }

  update(dt: number, gust = 0.5) {
    this.acc = Math.min(this.acc + dt, 0.09);
    const step = 1 / 60;
    let steps = 0;
    while (this.acc >= step && steps < 4) { this.simulate(step, gust); this.acc -= step; steps++; }
    if (!steps) return;
    // Write heights into the geometry.
    const pos = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
    const res = this.res;
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const idx = j * res + i;
        pos.setY(idx, this.h[idx] * this.mask[idx]);
      }
    }
    pos.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
  }

  private simulate(dt: number, gust: number) {
    const res = this.res, h = this.h, v = this.v, mask = this.mask;
    void dt;
    // Occasional drips from the well roof + wind chop.
    this.dripT -= 1 / 60;
    if (this.dripT <= 0) {
      this.dripT = 1.4 + this.rand() * 2.6;
      const a = this.rand() * Math.PI * 2, r = this.rand() * this.size * 0.3;
      this.rippleLocal(Math.cos(a) * r, Math.sin(a) * r, 0.5 + this.rand() * 0.5);
    }
    if (gust > 0.55 && this.rand() < (gust - 0.5) * 0.5) {
      const x = (this.rand() - 0.5) * this.size * 0.8, z = (this.rand() - 0.5) * this.size * 0.8;
      this.rippleLocal(x, z, 0.16 * gust);
    }
    // Wave equation: velocity form, stable at 60 Hz with k < 1.
    const k = 0.52;
    for (let j = 1; j < res - 1; j++) {
      for (let i = 1; i < res - 1; i++) {
        const idx = j * res + i;
        if (!mask[idx]) continue;
        const avg = (h[idx - 1] + h[idx + 1] + h[idx - res] + h[idx + res]) * 0.25;
        v[idx] = (v[idx] + (avg - h[idx]) * k) * 0.988;
      }
    }
    for (let i = 0; i < h.length; i++) h[i] += v[i] * mask[i];
  }

  private rippleLocal(x: number, z: number, strength: number) {
    const res = this.res;
    const gx = Math.round((x / this.size + 0.5) * (res - 1));
    const gz = Math.round((z / this.size + 0.5) * (res - 1));
    for (let j = -2; j <= 2; j++) {
      for (let i = -2; i <= 2; i++) {
        const xx = gx + i, zz = gz + j;
        if (xx < 1 || zz < 1 || xx >= res - 1 || zz >= res - 1) continue;
        const d = Math.hypot(i, j) / 2.5;
        this.v[zz * res + xx] -= strength * (1 - d) * 2.0;
      }
    }
  }
}
