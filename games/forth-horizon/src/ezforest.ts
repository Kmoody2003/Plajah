// The high-quality trees from Ravencrest and Era Clash, ported to this WebGL scene: real branch skeletons grown by ez-tree (pines, oaks, ash, aspen), the same
// bark scans (colour, normal, roughness) and painted leaf cards, swaying in the wind. They stand wherever the camera is within NEAR_R of a tree point (the
// forest, the street trees, the course verges); beyond that the photographic cards take over.
import * as THREE from 'three';
import { Tree } from '@dgreenheck/ez-tree';
import { NEAR_R, cardLodUniforms } from './trees';

const TEX = '/games/ravencrest/assets/trees/';
const tl = new THREE.TextureLoader();
const cache = new Map<string, THREE.Texture>();
function tex(name: string, srgb: boolean): THREE.Texture {
  let t = cache.get(name);
  if (!t) {
    t = tl.load(TEX + name);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    cache.set(name, t);
  }
  return t;
}
type Src = { attributes: Record<string, { array: ArrayLike<number>; itemSize: number }>; index: { array: ArrayLike<number> } | null };
function copyGeo(src: Src): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv']) { const a = src.attributes[k]; if (a) g.setAttribute(k, new THREE.BufferAttribute(new Float32Array(a.array as ArrayLike<number>), a.itemSize)); }
  if (src.index) g.setIndex(new THREE.BufferAttribute(new Uint32Array(src.index.array as ArrayLike<number>), 1));
  return g;
}

interface Variant { conifer: boolean; bark: THREE.BufferGeometry; leaves: THREE.BufferGeometry | null; barkType: string; leafType: string; width: number }
const PRESETS: [boolean, string, number][] = [
  [true, 'Pine Large', 11], [true, 'Pine Large', 23], [true, 'Pine Medium', 37], [true, 'Pine Medium', 41], [true, 'Pine Small', 53],
  [false, 'Oak Medium', 61], [false, 'Oak Large', 67], [false, 'Ash Medium', 71], [false, 'Aspen Medium', 83],
];
let VARIANTS: Variant[] | null = null;
function makeVariants(): Variant[] {
  if (VARIANTS) return VARIANTS;
  VARIANTS = [];
  for (const [conifer, preset, seed] of PRESETS) {
    try {
      const t = new Tree();
      t.loadPreset(preset);
      t.options.seed = seed;
      const o = t.options as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      for (const k of Object.keys(o.branch.sections)) o.branch.sections[k] = Math.max(3, Math.round(o.branch.sections[k] * 0.7));
      for (const k of Object.keys(o.branch.segments)) o.branch.segments[k] = Math.max(3, Math.round(o.branch.segments[k] * 0.7));
      if (o.leaves) o.leaves.count = Math.round(o.leaves.count * 0.7);
      t.generate();
      const bark = copyGeo(t.branchesMesh.geometry as unknown as Src);
      const hasLeaves = (t.leavesMesh.geometry as THREE.BufferGeometry).attributes.position?.count > 0;
      const leaves = hasLeaves ? copyGeo(t.leavesMesh.geometry as unknown as Src) : null;
      const box = new THREE.Box3().setFromBufferAttribute(bark.attributes.position as THREE.BufferAttribute);
      if (leaves) box.union(new THREE.Box3().setFromBufferAttribute(leaves.attributes.position as THREE.BufferAttribute));
      const h = box.max.y - box.min.y;
      for (const g of [bark, leaves]) { if (!g) continue; g.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2); g.scale(1 / h, 1 / h, 1 / h); }
      t.branchesMesh.geometry.dispose(); t.leavesMesh.geometry.dispose();
      VARIANTS.push({ conifer, bark, leaves, barkType: o.bark.type === 'oak' || o.bark.type === 'willow' ? 'oak' : o.bark.type === 'birch' ? 'birch' : 'pine', leafType: o.leaves?.type ?? 'oak', width: Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / h });
    } catch (e) { console.warn('[trees] variant failed', preset, e); }
  }
  return VARIANTS;
}

const LEAF_GREEN: Record<string, number> = { pine: 0x3b7a3c, oak: 0x5c9a3a, ash: 0x6aa040, aspen: 0x7fb04a };
interface Pt { x: number; z: number; conifer: boolean; k: number; s: number }

export class EzTreeField {
  readonly group = new THREE.Group();
  count = 0;
  private grid = new Map<number, Pt[]>();
  private cell = 80;
  private sets: { v: Variant; meshes: THREE.InstancedMesh[] }[] = [];
  private last = new THREE.Vector2(1e9, 1e9);
  private accT = 0;
  private uTime = { value: 0 };
  private uWind = { value: 0.3 };
  private cap = 500;
  private effRadius = NEAR_R;
  private effCap = 500;
  private conIndices: number[] = [];
  private broIndices: number[] = [];
  private _fill: number[] = [];
  private _m4 = new THREE.Matrix4();
  private _q = new THREE.Quaternion();
  private _up = new THREE.Vector3(0, 1, 0);
  private _col = new THREE.Color();
  private _pos = new THREE.Vector3();
  private _sc = new THREE.Vector3();

  constructor(pts: number[][], private hAt: (x: number, z: number) => number, private exag: () => number) {
    const variants = makeVariants();
    if (!variants.length) throw new Error('no tree variants');
    for (const p of pts) {
      const k = Math.floor(p[0] / this.cell) * 4096 + Math.floor(p[1] / this.cell);
      let a = this.grid.get(k); if (!a) { a = []; this.grid.set(k, a); }
      a.push({ x: p[0], z: p[1], conifer: !!p[2], k: p[3], s: p[4] ?? 1 });
    }
    const sway = (m: THREE.Material, key: string): void => {
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = this.uTime; sh.uniforms.uWind = this.uWind;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime, uWind;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
          vec3 ib = vec3(instanceMatrix[3].x, 0.0, instanceMatrix[3].z);
          float sc = length(instanceMatrix[1].xyz);
          float h01 = clamp(position.y, 0.0, 1.2);
          float sw = uWind * h01 * h01 * 0.045 * sc;
          transformed.x += (sin(uTime * 1.4 + ib.x * 0.07 + position.y * 3.0) * sw + sin(uTime * 3.3 + position.z * 40.0 + ib.z * 0.11) * sw * 0.3 * ${key === 'leaf' ? '1.0' : '0.0'}) / sc;
          transformed.z += cos(uTime * 1.15 + ib.z * 0.06) * sw * 0.7 / sc;
          #endif`);
      };
      m.customProgramCacheKey = () => 'ezsway-' + key;
    };
    for (const v of variants) {
      const bm = new THREE.MeshStandardMaterial({ map: tex(`${v.barkType}_color_1k.jpg`, true), normalMap: tex(`${v.barkType}_normal_1k.jpg`, false), roughnessMap: tex(`${v.barkType}_roughness_1k.jpg`, false), roughness: 0.95, metalness: 0, color: 0x9a958c });
      sway(bm, 'bark');
      const meshes: THREE.InstancedMesh[] = [];
      const mkim = (g: THREE.BufferGeometry, m: THREE.Material): THREE.InstancedMesh => { const im = new THREE.InstancedMesh(g, m, this.cap); im.count = 0; im.frustumCulled = false; im.castShadow = false; this.group.add(im); meshes.push(im); return im; };
      mkim(v.bark, bm);
      if (v.leaves) {
        const lm = new THREE.MeshStandardMaterial({ map: tex(`${v.leafType}_color.png`, true), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, metalness: 0, color: new THREE.Color(LEAF_GREEN[v.leafType] ?? 0x4a8a3a).multiplyScalar(2.1) });
        sway(lm, 'leaf');
        mkim(v.leaves, lm);
      }
      const si = this.sets.length;
      if (v.conifer) this.conIndices.push(si); else this.broIndices.push(si);
      this.sets.push({ v, meshes });
    }
    this._fill = this.sets.map(() => 0);
    this.group.frustumCulled = false;
  }

  setWind(w: number): void { this.uWind.value = w; }
  setQuality(scale: number): void {
    const s = Math.max(0.5, Math.min(1, scale));
    const nr = NEAR_R * (0.68 + 0.32 * s);
    const nc = Math.max(120, Math.floor(this.cap * (0.5 + 0.5 * s)));
    cardLodUniforms.uNearR.value = nr - 12;
    if (Math.abs(nr - this.effRadius) > 4 || Math.abs(nc - this.effCap) > 40) {
      this.effRadius = nr;
      this.effCap = nc;
      this.last.set(1e9, 1e9);
    }
  }

  update(dt: number, cam: THREE.Vector3): void {
    this.uTime.value += dt;
    this.accT += dt;
    const moved = Math.hypot(cam.x - this.last.x, cam.z - this.last.y);
    if (this.accT < 0.25 || moved < 6) return;
    this.accT = 0; this.last.set(cam.x, cam.z);
    const R = this.effRadius, R2 = R * R, c0 = Math.floor((cam.x - R) / this.cell), c1 = Math.floor((cam.x + R) / this.cell), d0 = Math.floor((cam.z - R) / this.cell), d1 = Math.floor((cam.z + R) / this.cell);
    const con = this.conIndices, bro = this.broIndices;
    const fill = this._fill; fill.fill(0);
    const maxCap = this.effCap;
    const m4 = this._m4, q = this._q, up = this._up, col = this._col, pos = this._pos, sc = this._sc;
    const ex = this.exag();
    let total = 0;
    for (let cx = c0; cx <= c1; cx++) for (let cz = d0; cz <= d1; cz++) {
      const a = this.grid.get(cx * 4096 + cz); if (!a) continue;
      for (const t of a) {
        const dx = t.x - cam.x, dz = t.z - cam.z;
        if (dx * dx + dz * dz > R2) continue;
        const pool = t.conifer ? con : bro;
        if (!pool.length) continue;
        const hash = ((t.x * 31 + t.z * 17) % 1 + 1) % 1;
        const si = pool[Math.floor(hash * pool.length) % pool.length];
        if (fill[si] >= maxCap) continue;
        const h = (t.conifer ? 14 + t.k * 8 : 10 + t.k * 6) * t.s;
        q.setFromAxisAngle(up, (t.x * 7.3 + t.z * 3.1) % 6.283);
        pos.set(t.x, this.hAt(t.x, t.z) * ex - 0.1, t.z); sc.set(h, h, h);
        m4.compose(pos, q, sc);
        const tint = 0.8 + (((t.x * 13.1 + t.z * 5.7) % 1 + 1) % 1) * 0.35;
        for (const im of this.sets[si].meshes) { im.setMatrixAt(fill[si], m4); im.setColorAt(fill[si], col.setScalar(tint)); }
        fill[si]++; total++;
      }
    }
    for (let i = 0; i < this.sets.length; i++) {
      const c = fill[i];
      for (const im of this.sets[i].meshes) {
        im.count = c;
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
      }
    }
    this.count = total;
  }
}
