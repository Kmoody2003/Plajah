// Combat effects, each a single draw: CPU-billboarded particle batches (additive glow +
// alpha-blended gore), katana slash trails and ground shockwave rings. Particles can swirl
// around a vertical axis (the ghosts' ectoplasm vortex).
import * as THREE from 'three/webgpu';
import { attribute, float, smoothstep, uv, length, vec2 } from 'three/tsl';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

export interface Emit {
  pos: THREE.Vector3; vel: THREE.Vector3;
  color: THREE.Color; size: number; life: number;
  gravity?: number; drag?: number; grow?: number;
  /** Vortex: swirl rate (rad/s) around (cx, cz), outward drift and rise. */
  swirl?: number; cx?: number; cz?: number;
}

/** Effects budget (0.35 … 1): main.ts lowers it when frames run long, so heavy fights shed
 *  sparks and flashes before they shed frame rate. */
export const FxBudget = { scale: 1 };

export class Particles {
  readonly mesh: THREE.Mesh;
  private max: number;
  private n = 0;
  private P: Float32Array; private Vv: Float32Array; private C: Float32Array;
  private L: Float32Array; private ML: Float32Array; private S: Float32Array; private G: Float32Array; private D: Float32Array; private GR: Float32Array;
  private SW: Float32Array; private CX: Float32Array; private CZ: Float32Array;
  private pos: THREE.BufferAttribute; private col: THREE.BufferAttribute;

  constructor(max: number, additive: boolean) {
    this.max = max;
    this.P = new Float32Array(max * 3); this.Vv = new Float32Array(max * 3); this.C = new Float32Array(max * 3);
    this.L = new Float32Array(max); this.ML = new Float32Array(max); this.S = new Float32Array(max);
    this.G = new Float32Array(max); this.D = new Float32Array(max); this.GR = new Float32Array(max);
    this.SW = new Float32Array(max); this.CX = new Float32Array(max); this.CZ = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(max * 12), 3);
    this.col = new THREE.BufferAttribute(new Float32Array(max * 16), 4);
    this.pos.setUsage(THREE.DynamicDrawUsage); this.col.setUsage(THREE.DynamicDrawUsage);
    const uvs = new Float32Array(max * 8), idx: number[] = [];
    for (let i = 0; i < max; i++) {
      uvs.set([0, 0, 1, 0, 0, 1, 1, 1], i * 8);
      idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3);
    }
    geo.setAttribute('position', this.pos);
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setAttribute('pcolor', this.col);
    geo.setIndex(idx);
    geo.setDrawRange(0, 0);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    const c: N = attribute('pcolor', 'vec4');
    const disc: N = smoothstep(float(0.5), float(additive ? 0.0 : 0.3), (length as N)((uv() as N).sub(vec2(0.5, 0.5))));
    m.colorNode = additive ? c.rgb.mul(c.a).mul(disc) : c.rgb;
    m.opacityNode = additive ? disc : disc.mul(c.a);
    this.mesh = new THREE.Mesh(geo, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.userData.dynamic = true;
  }

  emit(e: Emit) {
    if (this.n >= this.max) return;
    if (FxBudget.scale < 1 && Math.random() > FxBudget.scale) return;
    const i = this.n++;
    this.P.set([e.pos.x, e.pos.y, e.pos.z], i * 3);
    this.Vv.set([e.vel.x, e.vel.y, e.vel.z], i * 3);
    this.C.set([e.color.r, e.color.g, e.color.b], i * 3);
    this.L[i] = this.ML[i] = e.life; this.S[i] = e.size;
    this.G[i] = e.gravity ?? 0; this.D[i] = e.drag ?? 0; this.GR[i] = e.grow ?? 0;
    this.SW[i] = e.swirl ?? 0; this.CX[i] = e.cx ?? 0; this.CZ[i] = e.cz ?? 0;
  }

  get count() { return this.n; }

  update(dt: number, cam: THREE.Camera, ground?: (x: number, z: number, y: number) => number | null) {
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const pos = this.pos.array as Float32Array, col = this.col.array as Float32Array;
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      this.L[i] -= dt;
      if (this.L[i] <= 0) continue;
      const i3 = i * 3;
      let x = this.P[i3], y = this.P[i3 + 1], z = this.P[i3 + 2];
      const drag = Math.exp(-this.D[i] * dt);
      this.Vv[i3] *= drag; this.Vv[i3 + 1] = this.Vv[i3 + 1] * drag - this.G[i] * dt; this.Vv[i3 + 2] *= drag;
      if (this.SW[i]) {
        // Rotate about the vortex axis, drifting outward a little.
        const a = this.SW[i] * dt, dx = x - this.CX[i], dz = z - this.CZ[i];
        const c = Math.cos(a), s = Math.sin(a);
        x = this.CX[i] + (dx * c - dz * s) * (1 + 0.15 * dt); z = this.CZ[i] + (dx * s + dz * c) * (1 + 0.15 * dt);
      }
      x += this.Vv[i3] * dt; y += this.Vv[i3 + 1] * dt; z += this.Vv[i3 + 2] * dt;
      if (ground && this.G[i] > 0) {
        const g = ground(x, z, y);
        if (g !== null && y < g + 0.02) { y = g + 0.02; this.Vv[i3] *= 0.3; this.Vv[i3 + 2] *= 0.3; this.Vv[i3 + 1] = 0; }
      }
      // Compact live particles to the front.
      const o3 = w * 3;
      this.P[o3] = x; this.P[o3 + 1] = y; this.P[o3 + 2] = z;
      this.Vv[o3] = this.Vv[i3]; this.Vv[o3 + 1] = this.Vv[i3 + 1]; this.Vv[o3 + 2] = this.Vv[i3 + 2];
      this.C[o3] = this.C[i3]; this.C[o3 + 1] = this.C[i3 + 1]; this.C[o3 + 2] = this.C[i3 + 2];
      this.L[w] = this.L[i]; this.ML[w] = this.ML[i]; this.S[w] = this.S[i]; this.G[w] = this.G[i]; this.D[w] = this.D[i]; this.GR[w] = this.GR[i];
      this.SW[w] = this.SW[i]; this.CX[w] = this.CX[i]; this.CZ[w] = this.CZ[i];
      const k = this.L[w] / this.ML[w];
      const sz = this.S[w] * (1 + this.GR[w] * (1 - k)) * 0.5;
      const a = Math.min(1, k * 1.6);
      const rx = right.x * sz, ry = right.y * sz, rz = right.z * sz, ux = up.x * sz, uy = up.y * sz, uz = up.z * sz;
      pos.set([x - rx - ux, y - ry - uy, z - rz - uz, x + rx - ux, y + ry - uy, z + rz - uz, x - rx + ux, y - ry + uy, z - rz + uz, x + rx + ux, y + ry + uy, z + rz + uz], w * 12);
      for (let v = 0; v < 4; v++) col.set([this.C[o3], this.C[o3 + 1], this.C[o3 + 2], a], w * 16 + v * 4);
      w++;
    }
    this.n = w;
    this.pos.needsUpdate = true; this.col.needsUpdate = true;
    this.pos.addUpdateRange(0, w * 12); this.col.addUpdateRange(0, w * 16);
    this.mesh.geometry.setDrawRange(0, w * 6);
  }
}

/** Ribbon behind the katana edge (base → tip), fading with age. */
export class Trail {
  readonly mesh: THREE.Mesh;
  private SEG = 18;
  private samples: { b: THREE.Vector3; t: THREE.Vector3; age: number }[] = [];
  private pos: THREE.BufferAttribute; private col: THREE.BufferAttribute;
  color = new THREE.Color(0xbfd8ff);
  intensity = 1.5;
  constructor() {
    const n = this.SEG;
    const geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3);
    this.col = new THREE.BufferAttribute(new Float32Array(n * 2 * 4), 4);
    this.pos.setUsage(THREE.DynamicDrawUsage); this.col.setUsage(THREE.DynamicDrawUsage);
    const idx: number[] = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
    geo.setAttribute('position', this.pos);
    geo.setAttribute('pcolor', this.col);
    geo.setIndex(idx);
    geo.setDrawRange(0, 0);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const c: N = attribute('pcolor', 'vec4');
    m.colorNode = c.rgb.mul(c.a);
    this.mesh = new THREE.Mesh(geo, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.userData.dynamic = true;
  }
  /** Call every frame; `active` while a swing is cutting. */
  update(dt: number, base: THREE.Vector3, tip: THREE.Vector3, active: boolean) {
    for (const s of this.samples) s.age += dt;
    if (active) this.samples.unshift({ b: base.clone(), t: tip.clone(), age: 0 });
    while (this.samples.length > this.SEG || (this.samples.length && this.samples[this.samples.length - 1].age > 0.16)) this.samples.pop();
    const pos = this.pos.array as Float32Array, col = this.col.array as Float32Array;
    this.samples.forEach((s, i) => {
      pos.set([s.b.x, s.b.y, s.b.z, s.t.x, s.t.y, s.t.z], i * 6);
      const a = Math.max(0, 1 - s.age / 0.16) * (1 - i / this.SEG) * this.intensity;
      col.set([this.color.r, this.color.g, this.color.b, a * 0.25, this.color.r, this.color.g, this.color.b, a], i * 8);
    });
    this.pos.needsUpdate = true; this.col.needsUpdate = true;
    this.mesh.geometry.setDrawRange(0, Math.max(0, this.samples.length - 1) * 6);
  }
}

/** Expanding ground ring (defeat shockwave, power-up). Small pool, hidden when idle. */
export class Rings {
  readonly group = new THREE.Group();
  private items: { mesh: THREE.Mesh; mat: THREE.MeshBasicNodeMaterial; t: number; dur: number; r: number; color: THREE.Color }[] = [];
  constructor(n = 5) {
    this.group.userData.dynamic = true;
    const geo = new THREE.RingGeometry(0.82, 1, 48);
    geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.items.push({ mesh, mat, t: 1, dur: 1, r: 1, color: new THREE.Color() });
    }
  }
  spawn(pos: THREE.Vector3, radius: number, color: THREE.ColorRepresentation, dur = 0.5) {
    const it = this.items.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b));
    it.t = 0; it.dur = dur; it.r = radius; it.color.set(color);
    it.mesh.position.copy(pos).setY(pos.y + 0.06);
    it.mesh.visible = true;
  }
  update(dt: number) {
    for (const it of this.items) {
      if (!it.mesh.visible) continue;
      it.t += dt;
      const k = it.t / it.dur;
      if (k >= 1) { it.mesh.visible = false; continue; }
      const e = 1 - Math.pow(1 - k, 3);
      it.mesh.scale.setScalar(0.2 + it.r * e);
      it.mat.color.copy(it.color).multiplyScalar(3 * (1 - k));
    }
  }
}
