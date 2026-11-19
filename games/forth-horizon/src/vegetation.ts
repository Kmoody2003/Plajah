import * as THREE from 'three';
import { bladeTexture, tuftGeo } from './grass';
import { GRID } from './grid';

/**
 * Vegetation for the whole map: grass, shrubs and rocks that cost the same wherever the camera is.
 *
 * How it stays cheap (the same ideas big open-world games use, sized for a browser):
 *  - Nothing is stored per plant. A plant exists because a hash of its cell says so: every 32 m cell regenerates the same plants from its address, the land class under each
 *    candidate point (sand / forest / field, baked in region/landclass.png), the slope and the road checks. Cells are made a few at a time, nearest first, inside a time budget.
 *  - Only the cells around the camera exist. Each species has its own radius; cells leaving it are dropped, cells entering it are queued.
 *  - One draw call per species. The instance data (position, rotation, scale, tint) is a single packed buffer per species, refilled from the live cells a few times a second.
 *    The vertex shader builds the transform, bends the plant in the wind and shrinks it to nothing across its fade band, so plants never pop and no JavaScript touches a plant per frame.
 *  - Levels of detail by species: fine tufts near the camera, bigger sparser clumps further out (they overlap through a cross-fade), then nothing: beyond that the ground texture
 *    carries the grass. Shrubs and rocks reach further because they are few and read from far.
 */
export interface VegetationOpts {
  rw: number; rh: number;                                  // map size in metres, centred on the origin
  classUrl: string;                                        // landclass.png: R sand, G forest, B field
  albedoUrl: string;                                       // the map texture, for the colour of the ground a plant stands on
  ground: (x: number, z: number) => number;                // the drawn terrain surface
  ok: (x: number, z: number) => boolean;                   // not a road, pavement, building or water
}

export interface VegetationStats { cells: number; instances: Record<string, number>; genMs: number; drawCalls: number }

const CELL = 32;

function ihash(x: number, y: number, s: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, z: number, s: number): number {          // smooth value noise, 0..1
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = ihash(ix, iz, s), b = ihash(ix + 1, iz, s), c = ihash(ix, iz + 1, s), d = ihash(ix + 1, iz + 1, s);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

interface Sample { sand: number; forest: number; field: number; r: number; g: number; b: number; y: number; slope: number }
type Rule = (x: number, z: number, i: number, j: number, s: Sample) => null | { scale: number; col: [number, number, number]; rot?: number };

interface Species {
  name: string;
  geo: THREE.BufferGeometry;
  mat: THREE.MeshStandardMaterial;
  spacing: number;                  // metres between candidate points
  radius: number;                   // cells within this distance of the camera exist
  fade: [number, number, number, number];   // fade in start/end, fade out start/end (m)
  cap: number;                      // most instances drawn
  rule: Rule;
  seed: number;
  mesh?: THREE.Mesh;
  buf?: THREE.InstancedInterleavedBuffer;
  geoI?: THREE.InstancedBufferGeometry;
  cells: Map<number, Float32Array>;
  total: number;
}

export class Vegetation {
  readonly group = new THREE.Group();
  readonly stats: VegetationStats = { cells: 0, instances: {}, genMs: 0, drawCalls: 0 };
  private species: Species[] = [];
  private uTime = { value: 0 };
  private uWind = { value: 0.3 };
  private uCam = { value: new THREE.Vector3() };
  private cls: { w: number; h: number; d: Uint8ClampedArray } | null = null;
  private alb: { w: number; h: number; d: Uint8ClampedArray } | null = null;
  private lastCam = new THREE.Vector2(1e9, 1e9);
  private dirty = true;
  private sinceRebuild = 0;
  private enabled = true;

  constructor(private o: VegetationOpts) {
    this.group.name = 'vegetation';
    const load = (url: string): Promise<{ w: number; h: number; d: Uint8ClampedArray }> => new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(img, 0, 0); res({ w: c.width, h: c.height, d: g.getImageData(0, 0, c.width, c.height).data }); };
      img.onerror = rej; img.src = url;
    });
    void Promise.all([load(o.classUrl), load(o.albedoUrl)]).then(([c, a]) => { this.cls = c; this.alb = a; this.dirty = true; }).catch((e) => console.warn('vegetation data failed', e));
    this.build();
  }

  setWind(w: number): void { this.uWind.value = w; }
  setWet(w: number): void { for (const s of this.species) s.mat.color.setScalar(1 - 0.3 * w); }
  setEnabled(on: boolean): void { this.enabled = on; this.group.visible = on; }

  // ---------- species ----------
  private material(sp: Pick<Species, 'fade'>, opts: { map?: THREE.Texture; alphaTest?: number; flat?: boolean; wind: number; rough: number }): THREE.MeshStandardMaterial {
    const mat = new THREE.MeshStandardMaterial({ map: opts.map ?? null, alphaTest: opts.alphaTest ?? 0, side: THREE.DoubleSide, roughness: opts.rough, metalness: 0, flatShading: !!opts.flat });
    const fade = sp.fade, wind = opts.wind;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uTime; sh.uniforms.uWind = this.uWind; sh.uniforms.uCam = this.uCam;
      sh.uniforms.uFade = { value: new THREE.Vector4(...fade) };
      sh.uniforms.uWindAmt = { value: wind };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec3 aPos; attribute vec2 aRS; attribute vec3 aCol;
          uniform float uTime, uWind, uWindAmt; uniform vec3 uCam; uniform vec4 uFade;
          varying vec3 vTint;`)
        .replace('#include <beginnormal_vertex>', `
          float vr = aRS.x, vc = cos(vr), vs = sin(vr);
          vec3 objectNormal = vec3(normal.x * vc + normal.z * vs, normal.y, -normal.x * vs + normal.z * vc);
          #ifdef USE_TANGENT
          vec3 objectTangent = vec3(tangent.xyz);
          #endif`)
        .replace('#include <begin_vertex>', `
          float vd = distance(aPos.xz, uCam.xz);
          float vfade = smoothstep(uFade.x, uFade.y, vd) * (1.0 - smoothstep(uFade.z, uFade.w, vd));
          // Fast frustum rejection in vertex shader: collapse off-screen / behind-camera plants before wind trig & rasterization
          vec4 vClip = projectionMatrix * viewMatrix * vec4(aPos, 1.0);
          if (vClip.z < -6.0 || abs(vClip.x) > vClip.w + 8.0) vfade = 0.0;
          vec3 vp = position * aRS.y * vfade;
          float vh = position.y;
          if (vfade > 0.001 && uWindAmt > 0.001) {
            float vsw = uWind * uWindAmt * vh * vh * aRS.y;
            vp.x += (sin(uTime * 2.1 + aPos.x * 0.9 + aPos.z * 0.6) + 0.25 * sin(uTime * 5.3 + aPos.x * 2.3)) * vsw;
            vp.z += cos(uTime * 1.7 + aPos.z * 0.8 + aPos.x * 0.4) * vsw * 0.6;
          }
          vec3 transformed = vec3(vp.x * vc + vp.z * vs, vp.y, -vp.x * vs + vp.z * vc) + aPos;
          vTint = aCol;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vTint;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vTint;')
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
          #if NUM_DIR_LIGHTS > 0
          {
            float back = pow(clamp(dot(normalize(vViewPosition), -directionalLights[0].direction), 0.0, 1.0), 3.0);
            reflectedLight.directDiffuse += diffuseColor.rgb * directionalLights[0].color * back * 0.36;
          }
          #endif`);
    };
    mat.customProgramCacheKey = () => 'veg2' + opts.wind + (opts.flat ? 'f' : 's') + (opts.map ? 'm' : 'n');
    return mat;
  }

  private build(): void {
    const tuft = tuftGeo();
    const blade = bladeTexture();
    const grassCol = (s: Sample, dry: number): [number, number, number] => {
      // the ground's own colour lifted toward a blade green so the satellite's shadows do not turn the grass black
      const k = 0.62 + dry * 0.4;
      return [Math.min(1, s.r * 1.1 + 0.05) * k, Math.min(1, s.g * 1.15 + 0.07) * k, Math.min(1, s.b + 0.03) * k];
    };
    // fine grass: dense tufts close to the camera (balanced cap for locked 60 FPS)
    const grassNear: Species = {
      name: 'grass', geo: tuft, spacing: 0.78, radius: 26, fade: [-1, 0, 15, 25], cap: 18000, seed: 1, cells: new Map(), total: 0,
      mat: null as unknown as THREE.MeshStandardMaterial,
      rule: (x, z, i, j, s) => {
        const patch = vnoise(x / 9, z / 9, 11);                                                        // tall patches and bare patches
        const dens = (s.field * 1.15 + s.forest * 0.5 + s.sand * 0.2) * (0.62 + patch * 0.7);
        if (dens < ihash(i, j, 3) || s.slope > 0.7 || s.y < 2.4) return null;
        const dry = Math.max(s.sand, s.field * ihash(i, j, 9) * 0.5);
        const h = (0.22 + ihash(i, j, 4) * 0.34 + patch * 0.18) * (s.sand > 0.5 ? 1.4 : 1);
        return { scale: h * (1.2 + ihash(i, j, 5) * 0.7), col: grassCol(s, dry) };
      },
    };
    // coarse grass: bigger, sparser clumps that carry the grass out to 85 m
    const grassMid: Species = {
      name: 'grassMid', geo: tuft, spacing: 1.55, radius: 84, fade: [11, 19, 58, 82], cap: 12000, seed: 2, cells: new Map(), total: 0,
      mat: null as unknown as THREE.MeshStandardMaterial,
      rule: (x, z, i, j, s) => {
        const patch = vnoise(x / 14, z / 14, 12);
        const dens = (s.field * 1.1 + s.forest * 0.5 + s.sand * 0.25) * (0.6 + patch * 0.7);
        if (dens < ihash(i, j, 3) || s.slope > 0.7 || s.y < 2.4) return null;
        const h = 0.38 + ihash(i, j, 4) * 0.42 + patch * 0.22;
        return { scale: h * 1.62, col: grassCol(s, Math.max(s.sand, s.field * 0.3)) };
      },
    };
    // shrubs: 20-tri low-poly organic canopy (4x fewer triangles than detail=1 -> saves >1.2M triangles per frame)
    const shrubGeo = new THREE.IcosahedronGeometry(0.5, 0);
    { const p = shrubGeo.getAttribute('position'); for (let i = 0; i < p.count; i++) { const f = 0.78 + ihash(Math.round(p.getX(i) * 100), Math.round(p.getZ(i) * 100), Math.round(p.getY(i) * 100)) * 0.44; p.setXYZ(i, p.getX(i) * f, (p.getY(i) + 0.45) * f * 0.8, p.getZ(i) * f); } shrubGeo.computeVertexNormals(); }
    const shrubs: Species = {
      name: 'shrubs', geo: shrubGeo, spacing: 5.8, radius: 175, fade: [-1, 0, 125, 173], cap: 9000, seed: 3, cells: new Map(), total: 0,
      mat: null as unknown as THREE.MeshStandardMaterial,
      rule: (x, z, i, j, s) => {
        const patch = vnoise(x / 40, z / 40, 21);
        const edge = vnoise(x / 18, z / 18, 22);
        const dens = s.forest * (0.14 + patch * 0.4) + s.field * 0.012 * (edge > 0.72 ? 6 : 1) + s.sand * 0.05 * patch;
        if (dens < ihash(i, j, 3) || s.slope > 0.8 || s.y < 2.6) return null;
        const sc = 0.8 + ihash(i, j, 4) * 1.5 + patch * 0.6;
        const dry = s.sand > 0.4 ? 0.6 : 0;
        const g = 0.13 + ihash(i, j, 6) * 0.12;
        return { scale: sc, col: [0.08 + dry * 0.2 + ihash(i, j, 7) * 0.06, g * (0.9 + (1 - dry) * 0.35), 0.04 + ihash(i, j, 8) * 0.03] };
      },
    };
    // rocks: 20-tri faceted crags on slopes, dunes and woods
    const rockGeo = new THREE.IcosahedronGeometry(0.5, 0);
    { const p = rockGeo.getAttribute('position'); for (let i = 0; i < p.count; i++) { const f = 0.8 + ihash(Math.round(p.getX(i) * 100), Math.round(p.getY(i) * 100), Math.round(p.getZ(i) * 100)) * 0.4; p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 0.62, p.getZ(i) * f); } rockGeo.computeVertexNormals(); }
    const rocks: Species = {
      name: 'rocks', geo: rockGeo, spacing: 8.2, radius: 165, fade: [-1, 0, 120, 163], cap: 5000, seed: 4, cells: new Map(), total: 0,
      mat: null as unknown as THREE.MeshStandardMaterial,
      rule: (x, z, i, j, s) => {
        const patch = vnoise(x / 55, z / 55, 31);
        const dens = 0.012 + s.slope * 0.35 + s.sand * 0.05 * patch + s.forest * 0.03 * patch;
        if (dens < ihash(i, j, 3) || s.y < 2.6) return null;
        const big = ihash(i, j, 4);
        const sc = 0.35 + big * big * 2.2;
        const g = 0.34 + ihash(i, j, 5) * 0.2;
        return { scale: sc, col: [g * 1.03, g, g * 0.94] };
      },
    };
    this.species = [grassNear, grassMid, shrubs, rocks];
    grassNear.mat = this.material(grassNear, { map: blade, alphaTest: 0.5, wind: 0.28, rough: 0.95 });
    grassMid.mat = this.material(grassMid, { map: blade, alphaTest: 0.5, wind: 0.22, rough: 0.95 });
    shrubs.mat = this.material(shrubs, { wind: 0.05, rough: 0.9, flat: false });
    rocks.mat = this.material(rocks, { wind: 0, rough: 0.97, flat: true });
    for (const sp of this.species) {
      const g = new THREE.InstancedBufferGeometry();
      g.index = sp.geo.index;
      for (const k of Object.keys(sp.geo.attributes)) g.setAttribute(k, sp.geo.attributes[k]);
      if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
      sp.buf = new THREE.InstancedInterleavedBuffer(new Float32Array(sp.cap * 8), 8);
      sp.buf.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('aPos', new THREE.InterleavedBufferAttribute(sp.buf, 3, 0));
      g.setAttribute('aRS', new THREE.InterleavedBufferAttribute(sp.buf, 2, 3));
      g.setAttribute('aCol', new THREE.InterleavedBufferAttribute(sp.buf, 3, 5));
      g.instanceCount = 0;
      sp.geoI = g;
      const m = new THREE.Mesh(g, sp.mat);
      m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; m.name = 'veg-' + sp.name;
      sp.mesh = m;
      this.group.add(m);
    }
  }

  // ---------- data ----------
  private sample(x: number, z: number, out: Sample): boolean {
    const c = this.cls, a = this.alb;
    if (!c || !a) return false;
    const u = (x - GRID.ox) / this.o.rw + 0.5, v = (z - GRID.oz) / this.o.rh + 0.5;
    if (u < 0 || u >= 1 || v < 0 || v >= 1) return false;
    const ci = (Math.floor(v * c.h) * c.w + Math.floor(u * c.w)) * 4;
    out.sand = c.d[ci] / 255; out.forest = c.d[ci + 1] / 255; out.field = c.d[ci + 2] / 255;
    const ai = (Math.floor(v * a.h) * a.w + Math.floor(u * a.w)) * 4;
    out.r = a.d[ai] / 255; out.g = a.d[ai + 1] / 255; out.b = a.d[ai + 2] / 255;
    return true;
  }

  private genCell(sp: Species, ci: number, cj: number): Float32Array {
    const out: number[] = [];
    const s: Sample = { sand: 0, forest: 0, field: 0, r: 0, g: 0, b: 0, y: 0, slope: 0 };
    const n = Math.ceil(CELL / sp.spacing);
    const i0 = ci * n, j0 = cj * n;
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      const gi = i0 + a, gj = j0 + b;
      const x = (gi + ihash(gi, gj, sp.seed * 17 + 1)) * sp.spacing, z = (gj + ihash(gi, gj, sp.seed * 17 + 2)) * sp.spacing;
      if (!this.sample(x, z, s)) continue;
      if (s.sand + s.forest + s.field < 0.05) continue;
      // cheap rejection before any terrain work: the rule's density test happens once the ground is known, but a quick class-based pass skips the water and towns
      s.y = this.o.ground(x, z);
      s.slope = Math.max(Math.abs(this.o.ground(x + 1.2, z) - s.y), Math.abs(this.o.ground(x, z + 1.2) - s.y)) / 1.2;
      const r = sp.rule(x, z, gi, gj, s);
      if (!r) continue;
      if (!this.o.ok(x, z)) continue;
      out.push(x, s.y - 0.03, z, r.rot ?? ihash(gi, gj, 6) * 6.2832, r.scale, r.col[0], r.col[1], r.col[2]);
    }
    return new Float32Array(out);                      // 8 floats per plant: x y z, rotation, scale, r g b
  }

  update(dt: number, cam: THREE.Vector3): void {
    this.uTime.value += dt;
    this.uCam.value.copy(cam);
    if (!this.enabled || !this.cls || !this.alb) return;
    this.sinceRebuild += dt;
    // which cells should exist, and make the nearest missing ones inside a time budget
    const t0 = performance.now();
    const moved = Math.hypot(cam.x - this.lastCam.x, cam.z - this.lastCam.y);
    if (moved > 3) { this.lastCam.set(cam.x, cam.z); this.dirty = true; }
    let budget = 1.6;
    for (const sp of this.species) {
      const r = sp.radius + CELL * 0.75;
      const ci0 = Math.floor((cam.x - r) / CELL), ci1 = Math.floor((cam.x + r) / CELL), cj0 = Math.floor((cam.z - r) / CELL), cj1 = Math.floor((cam.z + r) / CELL);
      // drop cells that are too far
      for (const key of sp.cells.keys()) {
        const ci = Math.round(key / 8192) - 4096, cj = (key - (ci + 4096) * 8192) - 4096;
        if (Math.hypot((ci + 0.5) * CELL - cam.x, (cj + 0.5) * CELL - cam.z) > r + CELL) { sp.cells.delete(key); this.dirty = true; }
      }
      // missing cells, nearest first
      const need: { key: number; ci: number; cj: number; d: number }[] = [];
      for (let ci = ci0; ci <= ci1; ci++) for (let cj = cj0; cj <= cj1; cj++) {
        const d = Math.hypot((ci + 0.5) * CELL - cam.x, (cj + 0.5) * CELL - cam.z);
        if (d > r) continue;
        const key = (ci + 4096) * 8192 + (cj + 4096);
        if (!sp.cells.has(key)) need.push({ key, ci, cj, d });
      }
      need.sort((a, b) => a.d - b.d);
      for (const n of need) {
        if (performance.now() - t0 > budget) break;
        sp.cells.set(n.key, this.genCell(sp, n.ci, n.cj));
        this.dirty = true;
      }
    }
    this.stats.genMs = performance.now() - t0;
    if (this.dirty && this.sinceRebuild > 0.12) { this.rebuild(cam); this.dirty = false; this.sinceRebuild = 0; }
  }

  /** pack the live cells into each species' instance buffer (nearest cells first, so the cap cuts the far ones) */
  private rebuild(cam: THREE.Vector3): void {
    let cells = 0, draws = 0;
    for (const sp of this.species) {
      const arr = sp.buf!.array as Float32Array;
      const list = [...sp.cells.entries()].map(([key, data]) => { const ci = Math.round(key / 8192) - 4096, cj = (key - (ci + 4096) * 8192) - 4096; return { data, d: Math.hypot((ci + 0.5) * CELL - cam.x, (cj + 0.5) * CELL - cam.z) }; }).sort((a, b) => a.d - b.d);
      let n = 0;
      for (const c of list) {
        const m = c.data.length / 8;
        for (let q = 0; q < m && n < sp.cap; q++, n++) { const o = n * 8, p = q * 8; arr[o] = c.data[p]; arr[o + 1] = c.data[p + 1]; arr[o + 2] = c.data[p + 2]; arr[o + 3] = c.data[p + 3]; arr[o + 4] = c.data[p + 4]; arr[o + 5] = c.data[p + 5]; arr[o + 6] = c.data[p + 6]; arr[o + 7] = c.data[p + 7]; }
      }
      sp.total = n;
      sp.geoI!.instanceCount = n;
      sp.buf!.needsUpdate = true;
      sp.mesh!.visible = n > 0;
      this.stats.instances[sp.name] = n;
      cells += sp.cells.size; if (n > 0) draws++;
    }
    this.stats.cells = cells; this.stats.drawCalls = draws;
  }
}
