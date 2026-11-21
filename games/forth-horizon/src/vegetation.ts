import * as THREE from 'three';
import { GRID } from './grid';
import { buildCurvedBladeClusterGeo, STRAND_WIND_TRAMPLE_GLSL } from '../../../services/realtimeSim/strandFurEngine';

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

function buildLeafyShrubGeo(): THREE.BufferGeometry {
  // 6 arched organic foliage cards arranged radially in 3D with outward spherical normals -> lush leafy bushes (zero polyhedron blobs!)
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const planes: [number, number, number, number, number][] = [
    [0.0, 0.25, 0.96, 0.88, 0.0],
    [1.05, 0.28, 0.94, 0.84, 0.06],
    [2.10, 0.24, 0.92, 0.86, -0.05],
    [0.52, 0.52, 0.84, 0.72, 0.14],
    [1.57, 0.56, 0.82, 0.70, 0.16],
    [2.62, 0.50, 0.86, 0.74, 0.12],
  ];
  for (const [yaw, tilt, w, h, yOff] of planes) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const base = pos.length / 3;
    const corners: [number, number, number, number][] = [
      [-w * 0.5, 0, 0, 0],
      [w * 0.5, 0, 1, 0],
      [w * 0.5, h, 1, 1],
      [-w * 0.5, h, 0, 1],
    ];
    for (const [lx, ly, u, v] of corners) {
      const ty = ly * ct + yOff;
      const tz = ly * st;
      const wx = lx * cy + tz * sy;
      const wz = -lx * sy + tz * cy;
      pos.push(wx, ty, wz);
      const nx = wx, ny = ty - 0.18 + 0.35, nz = wz;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nor.push(nx / nl, ny / nl, nz / nl);
      uv.push(u, v);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

const vegTexLoader = new THREE.TextureLoader();
let cachedShrubLeafTex: THREE.Texture | null = null;
let cachedRockBaseTex: THREE.Texture | null = null;
let cachedRockNrmTex: THREE.Texture | null = null;
function getShrubLeafTex(): THREE.Texture {
  if (!cachedShrubLeafTex) {
    cachedShrubLeafTex = vegTexLoader.load('/games/ravencrest/assets/trees/oak_color.png');
    cachedShrubLeafTex.colorSpace = THREE.SRGBColorSpace;
    cachedShrubLeafTex.anisotropy = 4;
  }
  return cachedShrubLeafTex;
}
function getRockPbr(): { map: THREE.Texture; normalMap: THREE.Texture } {
  if (!cachedRockBaseTex) {
    cachedRockBaseTex = vegTexLoader.load('/games/forth-horizon/ironport/textures-v3/shared/tex-shared-24-stone-rubble_base.jpg');
    cachedRockBaseTex.colorSpace = THREE.SRGBColorSpace;
    cachedRockBaseTex.wrapS = cachedRockBaseTex.wrapT = THREE.RepeatWrapping;
    cachedRockBaseTex.repeat.set(2, 2);
  }
  if (!cachedRockNrmTex) {
    cachedRockNrmTex = vegTexLoader.load('/games/forth-horizon/ironport/textures-v3/shared/tex-shared-24-stone-rubble_nrm.jpg');
    cachedRockNrmTex.wrapS = cachedRockNrmTex.wrapT = THREE.RepeatWrapping;
    cachedRockNrmTex.repeat.set(2, 2);
  }
  return { map: cachedRockBaseTex, normalMap: cachedRockNrmTex };
}

export class Vegetation {
  readonly group = new THREE.Group();
  readonly stats: VegetationStats = { cells: 0, instances: {}, genMs: 0, drawCalls: 0 };
  private species: Species[] = [];
  private uTime = { value: 0 };
  private uWind = { value: 0.35 };
  private uWet = { value: 0 };
  private uCam = { value: new THREE.Vector3() };
  private uTrails = {
    value: [
      new THREE.Vector4(0, 0, 0, 0),
      new THREE.Vector4(0, 0, 0, 0),
      new THREE.Vector4(0, 0, 0, 0),
      new THREE.Vector4(0, 0, 0, 0),
    ],
  };
  private uCarVel = { value: new THREE.Vector3() };
  private trailIdx = 0;
  private lastTrailPos = new THREE.Vector3(1e9, 0, 1e9);
  private cls: { w: number; h: number; d: Uint8ClampedArray } | null = null;
  private alb: { w: number; h: number; d: Uint8ClampedArray } | null = null;
  private lastCam = new THREE.Vector2(1e9, 1e9);
  private dirty = true;
  private pending = true;
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
  setWet(w: number): void {
    this.uWet.value = w;
    for (const s of this.species) {
      if (s.name !== 'grass' && s.name !== 'grassMid') s.mat.color.setScalar(1 - 0.3 * w);
    }
  }
  /** Feed live vehicle position & velocity so nearby 3D grass blades physically part & flatten under tires + aero wake! */
  setCarWake(pos: THREE.Vector3 | null, vel?: THREE.Vector3 | null): void {
    const trails = this.uTrails.value;
    if (!pos) {
      for (let i = 0; i < 4; i++) trails[i].w = 0;
      this.uCarVel.value.set(0, 0, 0);
      return;
    }
    if (vel) this.uCarVel.value.copy(vel);
    const spd = vel ? Math.hypot(vel.x, vel.z) : 0;
    trails[0].set(pos.x, pos.y, pos.z, 2.3 + Math.min(2.2, spd * 0.045));
    if (this.lastTrailPos.distanceToSquared(pos) > 2.4 * 2.4) {
      this.lastTrailPos.copy(pos);
      this.trailIdx = 1 + (this.trailIdx % 3);
      trails[this.trailIdx].set(pos.x, pos.y, pos.z, 1.9 + Math.min(1.6, spd * 0.03));
    }
  }
  setEnabled(on: boolean): void { this.enabled = on; this.group.visible = on; }

  // ---------- Series S/X curved 3D blade-strand material (Kajiya-Kay sheen + SSS + rolling wind waves + car wake) ----------
  private strandMaterial(sp: Pick<Species, 'fade'>, keySuffix: string): THREE.MeshStandardMaterial {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.68, metalness: 0 });
    const fade = sp.fade;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uTime;
      sh.uniforms.uWind = this.uWind;
      sh.uniforms.uWet = this.uWet;
      sh.uniforms.uCam = this.uCam;
      sh.uniforms.uFade = { value: new THREE.Vector4(...fade) };
      sh.uniforms.uTrails = this.uTrails;
      sh.uniforms.uCarVel = this.uCarVel;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec3 aPos; attribute vec2 aRS; attribute vec3 aCol; attribute vec4 aBlade;
          uniform vec3 uCam; uniform vec4 uFade;
          varying vec3 vTint; varying float vGrassH; varying float vBladePhase; varying vec3 vGrassWorld;
          ${STRAND_WIND_TRAMPLE_GLSL}`)
        .replace('#include <beginnormal_vertex>', `
          float vr = aRS.x, vc = cos(vr), vs = sin(vr);
          vec3 objectNormal = vec3(normal.x * vc + normal.z * vs, normal.y, -normal.x * vs + normal.z * vc);
          #ifdef USE_TANGENT
          vec3 objectTangent = vec3(tangent.xyz);
          #endif`)
        .replace('#include <begin_vertex>', `
          float vd = distance(aPos.xz, uCam.xz);
          float vfade = smoothstep(uFade.x, uFade.y, vd) * (1.0 - smoothstep(uFade.z, uFade.w, vd));
          vec4 vClip = projectionMatrix * viewMatrix * vec4(aPos, 1.0);
          if (vClip.z < -6.0 || abs(vClip.x) > vClip.w + 9.0) vfade = 0.0;
          vec3 vp = position * aRS.y * vfade;
          vec3 rotP = vec3(vp.x * vc + vp.z * vs, vp.y, -vp.x * vs + vp.z * vc);
          if (vfade > 0.001) {
            rotP = strandDisplace(rotP, aPos, aBlade.x, aBlade.y, aBlade.w);
          }
          vec3 transformed = rotP + aPos;
          vTint = aCol;
          vGrassH = aBlade.x;
          vBladePhase = aBlade.y;
          vGrassWorld = transformed;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uWet;\nvarying vec3 vTint; varying float vGrassH; varying float vBladePhase; varying vec3 vGrassWorld;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float h = clamp(vGrassH, 0.0, 1.0);
          float dryTint = smoothstep(0.68, 0.98, vBladePhase);
          vec3 rootTone = vTint * vec3(0.32, 0.36, 0.25);
          vec3 midTone  = vTint * mix(vec3(0.94, 1.15, 0.72), vec3(1.18, 1.06, 0.62), dryTint * 0.65);
          vec3 tipTone  = vTint * mix(vec3(1.26, 1.38, 0.86), vec3(1.42, 1.24, 0.76), dryTint);
          vec3 grad = mix(rootTone, midTone, smoothstep(0.0, 0.45, h));
          float dapple = 0.88 + 0.24 * sin(vGrassWorld.x * 0.055 + sin(vGrassWorld.z * 0.042) * 2.1);
          diffuseColor.rgb *= mix(grad, tipTone, smoothstep(0.45, 1.0, h)) * dapple * (1.0 - 0.26 * uWet);`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(0.84, 0.42, vGrassH) * (1.0 - 0.45 * uWet);`)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
          float rootAO = 0.36 + 0.64 * smoothstep(0.0, 0.68, vGrassH);
          reflectedLight.indirectDiffuse *= rootAO;
          reflectedLight.directDiffuse *= (0.48 + 0.52 * smoothstep(0.0, 0.55, vGrassH));
          #if NUM_DIR_LIGHTS > 0
          {
            vec3 Vd = normalize(vViewPosition);
            vec3 Ld = directionalLights[0].direction;
            vec3 Hd = normalize(Ld + Vd);
            float backRaw = clamp(dot(Vd, -Ld), 0.0, 1.0);
            float back = backRaw * backRaw * backRaw;
            vec3 sssCol = diffuseColor.rgb * vec3(1.35, 1.22, 0.64);
            reflectedLight.directDiffuse += sssCol * directionalLights[0].color * (0.14 + 0.62 * back) * vGrassH * vGrassH;
            vec3 T = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
            float tdh = clamp(dot(T, Hd), -1.0, 1.0);
            float sinTH = sqrt(max(0.0001, 1.0 - tdh * tdh));
            float sh2 = sinTH * sinTH; float sheen = sh2 * sh2 * sh2 * sh2;
            reflectedLight.directSpecular += directionalLights[0].color * sheen * (0.18 + 0.32 * uWet) * vGrassH;
          }
          #endif`);
    };
    mat.customProgramCacheKey = () => 'veg-strand-v3-' + keySuffix;
    return mat;
  }

  // ---------- species ----------
  private material(sp: Pick<Species, 'fade'>, opts: { map?: THREE.Texture; normalMap?: THREE.Texture; alphaTest?: number; flat?: boolean; wind: number; rough: number }): THREE.MeshStandardMaterial {
    const mat = new THREE.MeshStandardMaterial({
      map: opts.map ?? null,
      normalMap: opts.normalMap ?? null,
      normalScale: opts.normalMap ? new THREE.Vector2(1.3, 1.3) : undefined,
      alphaTest: opts.alphaTest ?? 0,
      side: THREE.DoubleSide,
      roughness: opts.rough,
      metalness: 0,
      flatShading: !!opts.flat,
    });
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
            float backRaw = clamp(dot(normalize(vViewPosition), -directionalLights[0].direction), 0.0, 1.0);
            float back = backRaw * backRaw * backRaw;
            reflectedLight.directDiffuse += diffuseColor.rgb * directionalLights[0].color * back * 0.36;
          }
          #endif`);
    };
    mat.customProgramCacheKey = () => 'veg2' + opts.wind + (opts.flat ? 'f' : 's') + (opts.map ? 'm' : 'n');
    return mat;
  }

  private build(): void {
    // True curved 3D tapered multi-blade strand clusters (zero flat crossed X-cards, zero patchy weeds!)
    const nearBladeGeo = buildCurvedBladeClusterGeo(6, 4);
    const midBladeGeo = buildCurvedBladeClusterGeo(4, 2);
    const grassCol = (s: Sample, dry: number): [number, number, number] => {
      const k = 0.72 + dry * 0.28;
      // Ground grass tint in natural chlorophyll green so satellite road-edge spillover never bleaches trackside turf beige
      const r = Math.min(1, s.r * 0.88 + 0.055) * k;
      const g = Math.min(1, Math.max(s.g * 1.16 + 0.08, s.r * 1.18 + 0.08)) * k;
      const b = Math.min(1, s.b * 0.76 + 0.028) * k;
      return [r, g, b];
    };
    // Near hero carpet: dense 0.44m spacing continuous curved 3D blade meadow around the car (parks, verges, lawns, fields!)
    const grassNear: Species = {
      name: 'grass', geo: nearBladeGeo, spacing: 0.44, radius: 38, fade: [-1, 0, 26, 37], cap: 30000, seed: 1, cells: new Map(), total: 0,
      mat: null as unknown as THREE.MeshStandardMaterial,
      rule: (x, z, i, j, s) => {
        const green = s.g - Math.max(s.r, s.b);
        const lum = s.r * 0.3 + s.g * 0.59 + s.b * 0.11;
        const isTurf = s.field > 0.12 || s.forest > 0.15 || (green > 0.008 && lum > 0.10 && lum < 0.76);
        if (!isTurf || s.slope > 0.68 || s.y < 1.8) return null;
        const patch = vnoise(x / 11, z / 11, 11);
        // Continuous lush meadow coverage (~94% fill on lawns/fields, natural gentle thinning on steep sand/forest edges)
        const dens = Math.min(1.0, 0.80 + s.field * 0.35 + Math.max(0, green) * 2.6 + patch * 0.18) * (1 - s.sand * 0.65);
        if (dens < ihash(i, j, 3)) return null;
        const dry = Math.max(s.sand, s.field * ihash(i, j, 9) * 0.45);
        const h = (0.30 + ihash(i, j, 4) * 0.24 + patch * 0.24) * (s.sand > 0.5 ? 1.3 : 1);
        return { scale: h * (1.28 + ihash(i, j, 5) * 0.55), col: grassCol(s, dry) };
      },
    };
    // Mid-distance lush meadow: overlapping curved blade clusters carrying continuous turf cleanly to 120 m
    const grassMid: Species = {
      name: 'grassMid', geo: midBladeGeo, spacing: 1.02, radius: 120, fade: [20, 30, 84, 118], cap: 26000, seed: 2, cells: new Map(), total: 0,
      mat: null as unknown as THREE.MeshStandardMaterial,
      rule: (x, z, i, j, s) => {
        const green = s.g - Math.max(s.r, s.b);
        const lum = s.r * 0.3 + s.g * 0.59 + s.b * 0.11;
        const isTurf = s.field > 0.12 || s.forest > 0.15 || (green > 0.008 && lum > 0.10 && lum < 0.76);
        if (!isTurf || s.slope > 0.68 || s.y < 1.8) return null;
        const patch = vnoise(x / 16, z / 16, 12);
        const dens = Math.min(1.0, 0.74 + s.field * 0.35 + Math.max(0, green) * 2.2 + patch * 0.2) * (1 - s.sand * 0.6);
        if (dens < ihash(i, j, 3)) return null;
        const h = 0.42 + ihash(i, j, 4) * 0.32 + patch * 0.24;
        return { scale: h * 1.85, col: grassCol(s, Math.max(s.sand, s.field * 0.3)) };
      },
    };
    // shrubs: true 3D multi-layered leafy botanical bushes with painted oak foliage scan (replaces flat geometric icosahedron blobs!)
    const shrubGeo = buildLeafyShrubGeo();
    const shrubs: Species = {
      name: 'shrubs', geo: shrubGeo, spacing: 5.5, radius: 185, fade: [-1, 0, 130, 182], cap: 10000, seed: 3, cells: new Map(), total: 0,
      mat: null as unknown as THREE.MeshStandardMaterial,
      rule: (x, z, i, j, s) => {
        const patch = vnoise(x / 40, z / 40, 21);
        const edge = vnoise(x / 18, z / 18, 22);
        const dens = s.forest * (0.16 + patch * 0.42) + s.field * 0.015 * (edge > 0.70 ? 6 : 1) + s.sand * 0.05 * patch;
        if (dens < ihash(i, j, 3) || s.slope > 0.8 || s.y < 2.2) return null;
        const sc = 1.05 + ihash(i, j, 4) * 1.65 + patch * 0.65;
        const dry = s.sand > 0.4 ? 0.55 : 0;
        const g = 0.46 + ihash(i, j, 6) * 0.32;
        return { scale: sc, col: [0.28 + dry * 0.35 + ihash(i, j, 7) * 0.14, g * (0.95 + (1 - dry) * 0.35), 0.16 + ihash(i, j, 8) * 0.10] };
      },
    };
    // rocks: PBR stone-rubble textured crags on slopes, dunes and woods
    const rockGeo = new THREE.IcosahedronGeometry(0.5, 1);
    { const p = rockGeo.getAttribute('position'); for (let i = 0; i < p.count; i++) { const f = 0.80 + ihash(Math.round(p.getX(i) * 100), Math.round(p.getY(i) * 100), Math.round(p.getZ(i) * 100)) * 0.40; p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 0.62, p.getZ(i) * f); } rockGeo.computeVertexNormals(); }
    const rocks: Species = {
      name: 'rocks', geo: rockGeo, spacing: 8.2, radius: 165, fade: [-1, 0, 120, 163], cap: 5000, seed: 4, cells: new Map(), total: 0,
      mat: null as unknown as THREE.MeshStandardMaterial,
      rule: (x, z, i, j, s) => {
        const patch = vnoise(x / 55, z / 55, 31);
        const dens = 0.012 + s.slope * 0.35 + s.sand * 0.05 * patch + s.forest * 0.03 * patch;
        if (dens < ihash(i, j, 3) || s.y < 2.4) return null;
        const big = ihash(i, j, 4);
        const sc = 0.35 + big * big * 2.2;
        const g = 0.62 + ihash(i, j, 5) * 0.28;
        return { scale: sc, col: [g * 1.03, g, g * 0.94] };
      },
    };
    this.species = [grassNear, grassMid, shrubs, rocks];
    grassNear.mat = this.strandMaterial(grassNear, 'near');
    grassMid.mat = this.strandMaterial(grassMid, 'mid');
    shrubs.mat = this.material(shrubs, { map: getShrubLeafTex(), alphaTest: 0.34, wind: 0.08, rough: 0.80, flat: false });
    const rockPbr = getRockPbr();
    rocks.mat = this.material(rocks, { map: rockPbr.map, normalMap: rockPbr.normalMap, wind: 0, rough: 0.92, flat: false });
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
      m.frustumCulled = false; m.castShadow = false; m.receiveShadow = sp.name === 'grass' || sp.name === 'grassMid'; m.name = 'veg-' + sp.name;
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
      const isGreenTurf = (s.g - Math.max(s.r, s.b)) > 0.010 && s.g > 0.14;
      if (s.sand + s.forest + s.field < 0.05 && !isGreenTurf) continue;
      // cheap rejection before any terrain work: skip water/asphalt/roofs while letting green parks, suburban lawns & track verges grow 3D grass!
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
    const trails = this.uTrails.value;
    for (let i = 1; i < 4; i++) {
      if (trails[i].w > 0) trails[i].w = Math.max(0, trails[i].w - dt * 0.85);
    }
    if (!this.enabled || !this.cls || !this.alb) return;
    this.sinceRebuild += dt;
    const moved = Math.hypot(cam.x - this.lastCam.x, cam.z - this.lastCam.y);
    if (moved < 2.5 && !this.pending && !this.dirty) return;
    // which cells should exist, and make the nearest missing ones inside a time budget
    const t0 = performance.now();
    if (moved >= 2.5) { this.lastCam.set(cam.x, cam.z); this.dirty = true; this.pending = true; }
    let budget = 3.0;
    let remaining = false;
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
        if (performance.now() - t0 > budget) { remaining = true; break; }
        sp.cells.set(n.key, this.genCell(sp, n.ci, n.cj));
        this.dirty = true;
      }
    }
    this.pending = remaining;
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
