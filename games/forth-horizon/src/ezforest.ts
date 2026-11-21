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
  [true, 'Pine Large', 11], [true, 'Pine Medium', 37],
  [false, 'Oak Medium', 61], [false, 'Ash Medium', 71], [false, 'Aspen Medium', 83],
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
      for (const k of Object.keys(o.branch.sections)) o.branch.sections[k] = Math.max(3, Math.round(o.branch.sections[k] * 0.55));
      for (const k of Object.keys(o.branch.segments)) o.branch.segments[k] = Math.max(3, Math.round(o.branch.segments[k] * 0.50));
      if (o.leaves) {
        o.leaves.count = Math.round(o.leaves.count * 0.76);
        if (typeof o.leaves.size === 'number') o.leaves.size *= 1.32;
      }
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
/** leaf: an optional per-tree leaf colour (hex), e.g. a street in autumn; it multiplies the leaf material like the usual tint */
interface Pt { x: number; z: number; conifer: boolean; k: number; s: number; leaf?: number }

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
  private uFadeStart = { value: NEAR_R - 26 };
  private uFadeEnd = { value: NEAR_R };
  private cap = 820;
  private effRadius = NEAR_R;
  private effCap = 820;
  private conIndices: number[] = [];
  private broIndices: number[] = [];
  private _fill: number[] = [];
  private _cands: { t: Pt; d2: number; si: number }[] = [];
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
      a.push({ x: p[0], z: p[1], conifer: !!p[2], k: p[3], s: p[4] ?? 1, leaf: p[5] });
    }
    const sway = (m: THREE.Material, key: string): void => {
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = this.uTime; sh.uniforms.uWind = this.uWind;
        sh.uniforms.uFadeStart = this.uFadeStart; sh.uniforms.uFadeEnd = this.uFadeEnd;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float uTime, uWind, uFadeStart, uFadeEnd;\nvarying float vTreeH;\nvarying float vCrownAO;\nvarying float vTreeRand;')
          .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
          ${key === 'leaf'
            ? `// SpeedTree-style volumetric spherical crown normal smoothing: turns crossed leaf cards into lush sunlit 3D canopies
               vec3 crownCenter = vec3(0.0, 0.56, 0.0);
               vec3 crownOut = normalize(position - crownCenter + vec3(0.0, 0.14, 0.0));
               objectNormal = normalize(mix(objectNormal, crownOut, 0.72));`
            : ''}`)
          .replace('#include <begin_vertex>', `#include <begin_vertex>
          vTreeH = clamp(position.y, 0.0, 1.0);
          vCrownAO = clamp(length((position - vec3(0.0, 0.56, 0.0)) * vec3(2.2, 1.6, 2.2)), 0.0, 1.0);
          vTreeRand = 0.5;
          #ifdef USE_INSTANCING
          vec3 ib = vec3(instanceMatrix[3].x, 0.0, instanceMatrix[3].z);
          float camD = distance(cameraPosition.xz, ib.xz);
          float lodScale = smoothstep(uFadeEnd, uFadeStart, camD);
          transformed *= lodScale;
          vTreeRand = fract(sin(dot(ib.xz, vec2(12.9898, 78.233))) * 43758.5453);
          float sc = max(0.01, length(instanceMatrix[1].xyz));
          float h01 = clamp(position.y, 0.0, 1.2);
          float sw = uWind * h01 * h01 * 0.052 * sc * lodScale;
          float gust = sin(uTime * 1.35 + ib.x * 0.045 + ib.z * 0.032 + position.y * 2.6);
          float flutter = ${key === 'leaf' ? 'sin(uTime * 4.4 + position.x * 32.0 + position.z * 38.0 + ib.z * 0.17) * 0.34' : '0.0'};
          transformed.x += (gust * sw + flutter * sw) / sc;
          transformed.z += (cos(uTime * 1.10 + ib.z * 0.048 + ib.x * 0.025) * sw * 0.72 + flutter * sw * 0.45) / sc;
          #endif`);
        if (key === 'leaf') {
          sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', '#include <common>\nvarying float vTreeH; varying float vCrownAO; varying float vTreeRand;')
            .replace('#include <color_fragment>', `#include <color_fragment>
            // Natural botanical variation per tree (warm sunlit olive vs deep forest emerald) + interior crown depth shading
            vec3 warmTint = vec3(1.10, 1.04, 0.84);
            vec3 coolTint = vec3(0.84, 1.02, 0.90);
            diffuseColor.rgb *= mix(coolTint, warmTint, vTreeRand) * mix(0.62, 1.12, smoothstep(0.18, 0.95, vCrownAO * 0.65 + vTreeH * 0.35));`)
            .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
            // Volumetric canopy interior AO + warm golden backlit leaf translucency
            float aoCrown = mix(0.46, 1.04, clamp(vCrownAO * 0.60 + vTreeH * 0.48, 0.0, 1.0));
            reflectedLight.indirectDiffuse *= aoCrown;
            #if NUM_DIR_LIGHTS > 0
            {
              vec3 lDir = directionalLights[0].direction;
              float backRaw = clamp(dot(normalize(vViewPosition), -lDir), 0.0, 1.0);
              float back = backRaw * backRaw * backRaw;
              float topMask = 0.38 + 0.62 * vTreeH;
              vec3 sssTint = diffuseColor.rgb * vec3(1.32, 1.24, 0.62);
              reflectedLight.directDiffuse += sssTint * directionalLights[0].color * (0.08 + 0.56 * back) * topMask * aoCrown;
            }
            #endif`);
        } else {
          sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', '#include <common>\nvarying float vTreeH; varying float vCrownAO; varying float vTreeRand;')
            .replace('#include <color_fragment>', `#include <color_fragment>
            // Root ground-contact moss/shadow darkening so tree bases anchor seamlessly into the grass & soil
            diffuseColor.rgb *= mix(0.56, 1.0, smoothstep(0.0, 0.14, vTreeH));`);
        }
      };
      m.customProgramCacheKey = () => 'ezsway-' + key + '-v4';
    };
    for (const v of variants) {
      const bm = new THREE.MeshStandardMaterial({ map: tex(`${v.barkType}_color_1k.jpg`, true), normalMap: tex(`${v.barkType}_normal_1k.jpg`, false), normalScale: new THREE.Vector2(1.45, 1.45), roughnessMap: tex(`${v.barkType}_roughness_1k.jpg`, false), roughness: 0.92, metalness: 0, color: 0xa69e94 });
      sway(bm, 'bark');
      const meshes: THREE.InstancedMesh[] = [];
      const mkim = (g: THREE.BufferGeometry, m: THREE.Material): THREE.InstancedMesh => { const im = new THREE.InstancedMesh(g, m, this.cap); im.count = 0; im.visible = false; im.frustumCulled = false; im.castShadow = false; this.group.add(im); meshes.push(im); return im; };
      mkim(v.bark, bm);
      if (v.leaves) {
        const lm = new THREE.MeshStandardMaterial({ map: tex(`${v.leafType}_color.png`, true), alphaTest: 0.38, side: THREE.DoubleSide, roughness: 0.80, metalness: 0, color: new THREE.Color(LEAF_GREEN[v.leafType] ?? 0x4a8a3a).multiplyScalar(1.85) });
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
    const nr = NEAR_R * (0.72 + 0.28 * s);
    const nc = Math.max(180, Math.floor(this.cap * (0.55 + 0.45 * s)));
    this.uFadeEnd.value = nr;
    this.uFadeStart.value = nr - 26;
    cardLodUniforms.uNearR.value = nr - 20;
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
    // Update immediately on first frame, then smoothly every 2.0 m / 100 ms so 3D trees stay rock-steady ahead of the car
    if (this.last.x < 1e8 && (this.accT < 0.10 || moved < 2.0)) return;
    this.accT = 0; this.last.set(cam.x, cam.z);
    const R = this.effRadius, R2 = R * R, c0 = Math.floor((cam.x - R) / this.cell), c1 = Math.floor((cam.x + R) / this.cell), d0 = Math.floor((cam.z - R) / this.cell), d1 = Math.floor((cam.z + R) / this.cell);
    const con = this.conIndices, bro = this.broIndices;
    const fill = this._fill; fill.fill(0);
    const maxCap = this.effCap;
    const m4 = this._m4, q = this._q, up = this._up, col = this._col, pos = this._pos, sc = this._sc;
    const ex = this.exag();
    // Collect candidates within radius and sort nearest-first: guarantees nearby trees NEVER pop out or get evicted when grid cells shift!
    const cands = this._cands;
    cands.length = 0;
    for (let cx = c0; cx <= c1; cx++) for (let cz = d0; cz <= d1; cz++) {
      const a = this.grid.get(cx * 4096 + cz); if (!a) continue;
      for (let j = 0; j < a.length; j++) {
        const t = a[j];
        const dx = t.x - cam.x, dz = t.z - cam.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > R2) continue;
        const pool = t.conifer ? con : bro;
        if (!pool.length) continue;
        const hash = ((t.x * 31 + t.z * 17) % 1 + 1) % 1;
        const si = pool[Math.floor(hash * pool.length) % pool.length];
        cands.push({ t, d2, si });
      }
    }
    cands.sort((a, b) => a.d2 - b.d2);
    let total = 0;
    let farthestDrawnD2 = R2;
    let cappedOut = false;
    for (let ci = 0; ci < cands.length; ci++) {
      const { t, d2, si } = cands[ci];
      if (fill[si] >= maxCap) {
        if (!cappedOut) { cappedOut = true; farthestDrawnD2 = d2; }
        continue;
      }
      const h = (t.conifer ? 14 + t.k * 8 : 10 + t.k * 6) * t.s;
      q.setFromAxisAngle(up, (t.x * 7.3 + t.z * 3.1) % 6.283);
      pos.set(t.x, this.hAt(t.x, t.z) * ex - 0.1, t.z); sc.set(h, h, h);
      m4.compose(pos, q, sc);
      const tint = 0.8 + (((t.x * 13.1 + t.z * 5.7) % 1 + 1) % 1) * 0.35;
      const idx = fill[si];
      this.sets[si].meshes.forEach((im, mi) => { im.setMatrixAt(idx, m4); im.setColorAt(idx, mi > 0 && t.leaf !== undefined ? col.setHex(t.leaf).multiplyScalar(tint) : col.setScalar(tint)); });
      fill[si]++; total++;
    }
    // Keep the outer fade band synchronized with the true drawn envelope so no gap opens in ultra-dense forest
    const actualR = cappedOut ? Math.max(85, Math.min(R, Math.sqrt(farthestDrawnD2))) : R;
    this.uFadeEnd.value = actualR;
    this.uFadeStart.value = Math.max(55, actualR - 26);
    if (total > 80) cardLodUniforms.uNearR.value = Math.min(cardLodUniforms.uNearR.value * 0.7 + (actualR - 18) * 0.3, actualR - 12);
    for (let i = 0; i < this.sets.length; i++) {
      const c = fill[i];
      for (const im of this.sets[i].meshes) {
        im.count = c;
        im.visible = c > 0;
        if (c > 0) {
          im.instanceMatrix.needsUpdate = true;
          if (im.instanceColor) im.instanceColor.needsUpdate = true;
        }
      }
    }
    this.count = total;
  }
}
