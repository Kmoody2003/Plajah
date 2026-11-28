import * as THREE from 'three';
import { GRID } from './grid';
import { buildCurvedBladeClusterGeo, STRAND_WIND_TRAMPLE_GLSL } from '../../../services/realtimeSim/strandFurEngine';
import { createApexGrassStrandTslMaterial, createApexVegClusterTslMaterial } from './tsl/worldTsl';
import { getRegionTslContext } from './tsl/webgpuRuntime';
import { getDerivedLeafPbrMaps, getMeadowWildflowerPbr, getWoodlandFernPbr } from './botanicalTextures';

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
  dirty?: boolean;
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
    cachedRockBaseTex = vegTexLoader.load('/games/apex/ironport/textures-v4/shared/tex-shared-24-stone-rubble_base.jpg');
    cachedRockBaseTex.colorSpace = THREE.SRGBColorSpace;
    cachedRockBaseTex.wrapS = cachedRockBaseTex.wrapT = THREE.RepeatWrapping;
    cachedRockBaseTex.repeat.set(2, 2);
  }
  if (!cachedRockNrmTex) {
    cachedRockNrmTex = vegTexLoader.load('/games/apex/ironport/textures-v4/shared/tex-shared-24-stone-rubble_nrm.jpg');
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
  private fwdX = 0;
  private fwdZ = -1;
  private lastFwdX = 0;
  private lastFwdZ = -1;
  private dirty = true;
  private pending = true;
  private sinceRebuild = 0;
  private enabled = true;
  private quality = 1.0;

  setQuality(q: number, allowGrassShadows = true): void {
    const next = Math.max(0.08, Math.min(1.0, q));
    if (Math.abs(next - this.quality) < 0.03) return;
    this.quality = next;
    const leanMode = next < 0.35;
    const skipFarGrass = next < 0.65;
    for (const sp of this.species) {
      if (sp.mesh && (sp.name === 'grass' || sp.name === 'grassMid')) {
        sp.mesh.receiveShadow = allowGrassShadows && sp.name === 'grass';
      }
      if ((leanMode && (sp.name === 'ferns' || sp.name === 'wildflowers' || sp.name === 'rocks')) || (skipFarGrass && sp.name === 'grassFar')) {
        sp.cells.clear();
        sp.total = 0;
        if (sp.geoI) sp.geoI.instanceCount = 0;
        if (sp.mesh) sp.mesh.visible = false;
      }
      sp.dirty = true;
    }
    this.dirty = true;
    this.pending = true;
  }

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

  setWind(w: number): void {
    this.uWind.value = w;
    const tslCtx = getRegionTslContext();
    if (tslCtx) tslCtx.foliage.uWind.value = w;
  }
  setWet(w: number): void {
    this.uWet.value = w;
    const tslCtx = getRegionTslContext();
    if (tslCtx) tslCtx.foliage.uWet.value = w;
    for (const s of this.species) {
      if (s.name !== 'grass' && s.name !== 'grassMid' && s.name !== 'grassFar' && s.name !== 'vergeWild' && s.name !== 'farmCrops') s.mat.color?.setScalar(1 - 0.3 * w);
    }
  }
  /** Feed live vehicle position & velocity so nearby 3D grass blades physically part & flatten under tires + aero wake! */
  setCarWake(pos: THREE.Vector3 | null, vel?: THREE.Vector3 | null): void {
    const trails = this.uTrails.value;
    const tslCtx = getRegionTslContext();
    if (!pos) {
      for (let i = 0; i < 4; i++) {
        trails[i].w = 0;
        if (tslCtx) tslCtx.foliage.trailVecs[i].w = 0;
      }
      this.uCarVel.value.set(0, 0, 0);
      if (tslCtx) (tslCtx.foliage.uCarVel.value as THREE.Vector3).set(0, 0, 0);
      return;
    }
    if (vel) {
      this.uCarVel.value.copy(vel);
      if (tslCtx) (tslCtx.foliage.uCarVel.value as THREE.Vector3).copy(vel);
    }
    const spd = vel ? Math.hypot(vel.x, vel.z) : 0;
    trails[0].set(pos.x, pos.y, pos.z, 2.3 + Math.min(2.2, spd * 0.045));
    if (this.lastTrailPos.distanceToSquared(pos) > 2.4 * 2.4) {
      this.lastTrailPos.copy(pos);
      this.trailIdx = 1 + (this.trailIdx % 3);
      trails[this.trailIdx].set(pos.x, pos.y, pos.z, 1.9 + Math.min(1.6, spd * 0.03));
    }
    if (tslCtx) {
      for (let i = 0; i < 4; i++) tslCtx.foliage.trailVecs[i].copy(trails[i]);
    }
  }
  setEnabled(on: boolean): void { this.enabled = on; this.group.visible = on; }

  // ---------- Series S/X curved 3D blade-strand material (Kajiya-Kay sheen + SSS + rolling wind waves + car wake + dithered LOD) ----------
  private strandMaterial(sp: Pick<Species, 'fade'>, keySuffix: string, xzSpread = 1.0): THREE.MeshStandardMaterial {
    const tslCtx = getRegionTslContext();
    if (tslCtx) {
      return createApexGrassStrandTslMaterial(sp.fade, tslCtx.foliage, tslCtx.gi, xzSpread) as unknown as THREE.MeshStandardMaterial;
    }
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.68, metalness: 0 });
    const fade = sp.fade;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uTime;
      sh.uniforms.uWind = this.uWind;
      sh.uniforms.uWet = this.uWet;
      sh.uniforms.uCam = this.uCam;
      sh.uniforms.uFade = { value: new THREE.Vector4(...fade) };
      sh.uniforms.uSpread = { value: xzSpread };
      sh.uniforms.uTrails = this.uTrails;
      sh.uniforms.uCarVel = this.uCarVel;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec3 aPos; attribute vec2 aRS; attribute vec3 aCol; attribute vec4 aBlade;
          uniform vec3 uCam; uniform vec4 uFade; uniform float uSpread;
          varying vec3 vTint; varying float vGrassH; varying float vBladePhase; varying vec3 vGrassWorld; varying float vGrassFade;
          ${STRAND_WIND_TRAMPLE_GLSL}`)
        .replace('#include <beginnormal_vertex>', `
          float vr = aRS.x, vc = cos(vr), vs = sin(vr);
          vec3 objectNormal = vec3(normal.x * vc + normal.z * vs, normal.y, -normal.x * vs + normal.z * vc);
          #ifdef USE_TANGENT
          vec3 objectTangent = vec3(tangent.xyz);
          #endif`)
        .replace('#include <begin_vertex>', `
          float vd = distance(aPos.xz, uCam.xz);
          float fadeIn = smoothstep(uFade.x, uFade.y, vd);
          float fadeOut = 1.0 - smoothstep(uFade.z, uFade.w, vd);
          float vfade = fadeIn * fadeOut;
          vec4 vClip = projectionMatrix * viewMatrix * vec4(aPos, 1.0);
          float onScreen = (vClip.z < -12.0 || abs(vClip.x) > vClip.w + 18.0) ? 0.0 : 1.0;
          // Keep grass 100% constant height across its ring (ZERO height sprouting/popping as you drive closer — pure smooth IGN dither crossfade!)
          float hScale = aRS.y * onScreen;
          vec3 vp = vec3(position.x * uSpread, position.y, position.z * uSpread) * hScale;
          if (vfade <= 0.002) vp = vec3(0.0);
          vec3 rotP = vec3(vp.x * vc + vp.z * vs, vp.y, -vp.x * vs + vp.z * vc);
          if (vfade > 0.002 && onScreen > 0.5) {
            rotP = strandDisplace(rotP, aPos, aBlade.x, aBlade.y, aBlade.w);
          }
          vec3 transformed = rotP + aPos;
          vTint = aCol;
          vGrassH = aBlade.x;
          vBladePhase = aBlade.y;
          vGrassWorld = transformed;
          vGrassFade = vfade * onScreen;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uWet;\nvarying vec3 vTint; varying float vGrassH; varying float vBladePhase; varying vec3 vGrassWorld; varying float vGrassFade;')
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          if (vGrassFade <= 0.005) discard;
          if (vGrassFade < 0.995) {
            float gIgn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
            if (gIgn > vGrassFade) discard;
          }`)
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
    mat.customProgramCacheKey = () => 'veg-strand-v4-' + keySuffix;
    return mat;
  }

  // ---------- species ----------
  private material(sp: Pick<Species, 'fade'>, opts: { map?: THREE.Texture; normalMap?: THREE.Texture; roughnessMap?: THREE.Texture; alphaTest?: number; flat?: boolean; wind: number; rough: number; isFoliage?: boolean }): THREE.MeshStandardMaterial {
    const tslCtx = getRegionTslContext();
    if (tslCtx) {
      return createApexVegClusterTslMaterial({
        fade: sp.fade,
        map: opts.map,
        normalMap: opts.normalMap,
        roughnessMap: opts.roughnessMap,
        alphaTest: opts.alphaTest ?? 0.44,
        wind: opts.wind,
        rough: opts.rough,
        isFoliage: opts.isFoliage,
        fU: tslCtx.foliage,
        gi: tslCtx.gi,
      }) as unknown as THREE.MeshStandardMaterial;
    }
    const mat = new THREE.MeshStandardMaterial({
      map: opts.map ?? null,
      normalMap: opts.normalMap ?? null,
      normalScale: opts.normalMap ? new THREE.Vector2(1.35, 1.35) : undefined,
      roughnessMap: opts.roughnessMap ?? null,
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
          varying vec3 vTint; varying float vVegFade;`)
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
          float onScreen = (vClip.z < -12.0 || abs(vClip.x) > vClip.w + 16.0) ? 0.0 : 1.0;
          // Shrubs & rocks NEVER shrink or spring up out of the ground: stay 100% full scale and dissolve via IGN dither!
          vec3 vp = position * aRS.y * (vfade > 0.002 && onScreen > 0.5 ? 1.0 : 0.0);
          float vh = position.y;
          if (vfade > 0.002 && onScreen > 0.5 && uWindAmt > 0.001) {
            float vsw = uWind * uWindAmt * vh * vh * aRS.y;
            vp.x += (sin(uTime * 2.1 + aPos.x * 0.9 + aPos.z * 0.6) + 0.25 * sin(uTime * 5.3 + aPos.x * 2.3)) * vsw;
            vp.z += cos(uTime * 1.7 + aPos.z * 0.8 + aPos.x * 0.4) * vsw * 0.6;
          }
          vec3 transformed = vec3(vp.x * vc + vp.z * vs, vp.y, -vp.x * vs + vp.z * vc) + aPos;
          vTint = aCol;
          vVegFade = vfade * onScreen;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vTint; varying float vVegFade;')
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          if (vVegFade <= 0.005) discard;
          if (vVegFade < 0.995) {
            float vIgn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
            if (vIgn > vVegFade) discard;
          }`)
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
    mat.customProgramCacheKey = () => 'veg3' + opts.wind + (opts.flat ? 'f' : 's') + (opts.map ? 'm' : 'n');
    return mat;
  }

  private build(): void {
    // True curved 3D tapered multi-blade strand clusters (3 overlapping tiers reaching 265 m across the full camera frame!)
    const nearBladeGeo = buildCurvedBladeClusterGeo(6, 4);
    const midBladeGeo = buildCurvedBladeClusterGeo(4, 2);
    const farBladeGeo = buildCurvedBladeClusterGeo(3, 1);
    // Tall arching roadside meadow/fescue grass + growing corn/wheat crop stalks!
    const tallVergeGeo = buildCurvedBladeClusterGeo(5, 3);
    const cropStalkGeo = buildCurvedBladeClusterGeo(5, 3);
    const grassCol = (x: number, z: number, s: Sample, dry: number): [number, number, number] => {
      // Rich living Michigan chlorophyll palette (deep woodland emerald -> warm sunlit meadow olive -> sandy dune fescue)
      const m1 = vnoise(x / 85, z / 85, 41);
      const m2 = vnoise(x / 23, z / 23, 42);
      const coastSand = Math.min(1, s.sand * 1.4);
      const k = 0.74 + m2 * 0.26;
      const r = (0.14 + m1 * 0.11 + dry * 0.22 + coastSand * 0.22) * k;
      const g = (0.34 + m1 * 0.14 + dry * 0.08 + coastSand * 0.07) * k;
      const b = (0.07 + m2 * 0.05 + coastSand * 0.04) * k;
      return [Math.min(1, r), Math.min(1, g), Math.min(1, b)];
    };
    const isPopulatedZone = (x: number, z: number): boolean => {
      // Greater Ironport urban/suburban metro footprint + immediate town blocks of all 4 rural towns (exact RURAL_TOWNS coords!)
      if (x > 2150 && x < 8400 && z > -2450 && z < 3450) return true;
      // Kettle Crossing (-1460, 1490), Section Corners (1360, -340), Maple Ridge (-2250, 2920), Cedar Creek (620, -4050)
      if ((x + 1460) ** 2 + (z - 1490) ** 2 < 320 * 320) return true;
      if ((x - 1360) ** 2 + (z + 340) ** 2 < 260 * 260) return true;
      if ((x + 2250) ** 2 + (z - 2920) ** 2 < 260 * 260) return true;
      if ((x - 620) ** 2 + (z + 4050) ** 2 < 260 * 260) return true;
      // Halcyon Airport terminal/apron vicinity
      if ((x + 4750) ** 2 + (z - 4150) ** 2 < 520 * 520) return true;
      return false;
    };
    const isTurfSample = (x: number, z: number, s: Sample): boolean => {
      // Grow lush 3D grass across ALL dry rural countryside, roadsides, parks, dunes & forest floors (skipping water & bare rock cliffs)
      if (s.y < 1.65 || s.slope > 0.86) return false;
      // Exclude dense downtown concrete plaza core (East Bank downtown) while keeping parks/yards/countryside lush!
      const inDowntownCore = x > 4950 && x < 6100 && z > 650 && z < 1650 && s.forest < 0.08 && s.field < 0.08 && (s.g - Math.max(s.r, s.b)) < 0.015;
      return !inDowntownCore;
    };
    // Tier 1 (Near hero low-grass carpet, 0–64 m): crisp mowed lawn in towns/populated zones (10–18 cm), natural low pasture grass in open countryside (16–28 cm)
    const grassNear: Species = {
      name: 'grass', geo: nearBladeGeo, spacing: 0.74, radius: 60, fade: [-1, 0, 42, 60], cap: 18500, seed: 1, cells: new Map(), total: 0,
      mat: null as unknown as THREE.MeshStandardMaterial,
      rule: (x, z, i, j, s) => {
        if (!isTurfSample(x, z, s)) return null;
        const pop = isPopulatedZone(x, z);
        const patch = vnoise(x / 11, z / 11, 11);
        const dens = Math.min(1.0, (pop ? 0.88 : 0.94) + s.field * 0.16 + patch * 0.14) * (1 - s.sand * 0.28);
        if (dens < ihash(i, j, 3)) return null;
        const dry = Math.max(s.sand * 0.65, s.field * ihash(i, j, 9) * 0.28);
        const baseH = pop
          ? (0.11 + ihash(i, j, 4) * 0.06 + patch * 0.04)
          : (0.17 + ihash(i, j, 4) * 0.11 + patch * 0.07) * (s.sand > 0.45 ? 1.2 : 1);
        return { scale: baseH, col: grassCol(x, z, s, pop ? dry * 0.30 : dry) };
      },
    };
    // Tier 2 (Mid-distance meadow, 28–168 m): seamless low turf overlap with near grass (constant height, zero popping!)
    const grassMid: Species = {
      name: 'grassMid', geo: midBladeGeo, spacing: 1.35, radius: 168, fade: [32, 48, 132, 168], cap: 22000, seed: 2, cells: new Map(), total: 0,
      mat: null as unknown as THREE.MeshStandardMaterial,
      rule: (x, z, i, j, s) => {
        if (!isTurfSample(x, z, s)) return null;
        const pop = isPopulatedZone(x, z);
        const patch = vnoise(x / 16, z / 16, 12);
        const dens = Math.min(1.0, (pop ? 0.86 : 0.92) + s.field * 0.16 + patch * 0.14) * (1 - s.sand * 0.28);
        if (dens < ihash(i, j, 3)) return null;
        const h = pop
          ? (0.14 + ihash(i, j, 4) * 0.06 + patch * 0.04)
          : (0.22 + ihash(i, j, 4) * 0.12 + patch * 0.08);
        return { scale: h, col: grassCol(x, z, s, pop ? 0.08 : Math.max(s.sand * 0.65, s.field * 0.20)) };
      },
    };
    // Tier 3 (Far horizon turf carpet, 115–288 m): wide low tufts blending cleanly into ground PBR
    const grassFar: Species = {
      name: 'grassFar', geo: farBladeGeo, spacing: 2.75, radius: 288, fade: [115, 146, 240, 288], cap: 18000, seed: 5, cells: new Map(), total: 0,
      mat: null as unknown as THREE.MeshStandardMaterial,
      rule: (x, z, i, j, s) => {
        if (!isTurfSample(x, z, s)) return null;
        const pop = isPopulatedZone(x, z);
        const patch = vnoise(x / 24, z / 24, 15);
        const dens = Math.min(1.0, (pop ? 0.82 : 0.90) + s.field * 0.16 + patch * 0.14) * (1 - s.sand * 0.28);
        if (dens < ihash(i, j, 3)) return null;
        const h = pop
          ? (0.17 + ihash(i, j, 4) * 0.07)
          : (0.28 + ihash(i, j, 4) * 0.14 + patch * 0.09);
        return { scale: h, col: grassCol(x, z, s, pop ? 0.08 : Math.max(s.sand * 0.65, s.field * 0.20)) };
      },
    };
    // Tier 4: Natural rural roadside verge fescue & goldenrod stalks (28–48 cm, strictly outside populated towns/lawns!)
    const vergeWild: Species = {
      name: 'vergeWild', geo: tallVergeGeo, spacing: 1.75, radius: 115, fade: [-1, 0, 84, 115], cap: 10000, seed: 7, cells: new Map(), total: 0,
      mat: null as unknown as THREE.MeshStandardMaterial,
      rule: (x, z, i, j, s) => {
        if (!isTurfSample(x, z, s) || s.slope > 0.78 || isPopulatedZone(x, z)) return null;
        const clump = vnoise(x / 14, z / 14, 71);
        const dens = (0.28 + clump * 0.36 + s.sand * 0.22) * (s.forest > 0.2 ? 1.15 : 1.0);
        if (dens < ihash(i, j, 3) + 0.24) return null;
        const sc = 0.26 + ihash(i, j, 4) * 0.20 + clump * 0.10;
        const flower = ihash(i, j, 8);
        const col: [number, number, number] = flower > 0.87
          ? [0.72, 0.58, 0.18]
          : flower > 0.78
          ? [0.70, 0.74, 0.62]
          : [0.20 + clump * 0.12, 0.39 + clump * 0.12, 0.10];
        return { scale: sc, col };
      },
    };
    // Tier 5: 3D Growing Farm Crops (structured rows of tall Michigan corn, golden wheat & emerald soybeans — strictly on open rural farmland, NEVER inside town streets!)
    const farmCrops: Species = {
      name: 'farmCrops', geo: cropStalkGeo, spacing: 1.40, radius: 135, fade: [-1, 0, 102, 135], cap: 16000, seed: 9, cells: new Map(), total: 0,
      mat: null as unknown as THREE.MeshStandardMaterial,
      rule: (x, z, i, j, s) => {
        if (s.field < 0.30 || s.slope > 0.38 || s.y < 3.0 || isPopulatedZone(x, z)) return null;
        // Match the exact 260 m x 210 m rural farm parcel grid in region.ts so crops align with each field!
        const pidX = Math.floor(x / 260), pidZ = Math.floor(z / 210);
        const hField = ihash(pidX, pidZ, 97);
        // ~35% of rural parcels remain grazed grassy hay pastures (for hay bales, cows & horses); ~65% grow tall 3D crops!
        if (hField < 0.35) return null;
        // Stay clear of field headland borders (clean farm lanes between crop parcels)
        const lx = ((x % 260) + 260) % 260, lz = ((z % 210) + 210) % 210;
        if (Math.min(lx, 260 - lx, lz, 210 - lz) < 9.5) return null;
        // Distinct row furrow spacing (neat planted rows!)
        const rowDir = hField > 0.65 ? x : z;
        const rowMod = ((rowDir % 2.4) + 2.4) % 2.4;
        if (rowMod > 1.35) return null;
        if (ihash(i, j, 19) > 0.78) return null;
        const cropType = hField < 0.56 ? 'wheat' : hField < 0.78 ? 'corn' : 'soy';
        if (cropType === 'corn') {
          return { scale: 1.55 + ihash(i, j, 5) * 0.45, col: [0.18 + ihash(i, j, 6) * 0.08, 0.42 + ihash(i, j, 7) * 0.12, 0.10] };
        } else if (cropType === 'wheat') {
          return { scale: 1.05 + ihash(i, j, 5) * 0.32, col: [0.68 + ihash(i, j, 6) * 0.12, 0.54 + ihash(i, j, 7) * 0.10, 0.20] };
        }
        return { scale: 0.72 + ihash(i, j, 5) * 0.24, col: [0.22 + ihash(i, j, 6) * 0.08, 0.46 + ihash(i, j, 7) * 0.10, 0.12] };
      },
    };
    // Tier 6: 3D Arching Michigan Woodland Ferns (lush forest understory & shaded rural verge edges with SSS translucency!)
    const fernGeo = buildLeafyShrubGeo();
    const ferns: Species = {
      name: 'ferns', geo: fernGeo, spacing: 3.0, radius: 92, fade: [-1, 0, 68, 92], cap: 4500, seed: 11, cells: new Map(), total: 0,
      mat: null as unknown as THREE.MeshStandardMaterial,
      rule: (x, z, i, j, s) => {
        if (!isTurfSample(x, z, s) || s.slope > 0.72 || s.sand > 0.45) return null;
        const patch = vnoise(x / 18, z / 18, 83);
        const dens = s.forest * (0.34 + patch * 0.46) + (isPopulatedZone(x, z) ? 0.03 : 0.06) * (patch > 0.58 ? 2.2 : 0.4);
        if (dens < ihash(i, j, 3) + 0.18) return null;
        const sc = 0.44 + ihash(i, j, 4) * 0.42 + patch * 0.20;
        const g = 0.82 + ihash(i, j, 6) * 0.28;
        return { scale: sc, col: [0.76 * g, 0.96 * g, 0.70 * g] };
      },
    };
    // Tier 7: 3D Meadow Clover & Wildflower Clusters (Queen Anne's lace, goldenrod & blue chicory along country verges & yards!)
    const wildflowerGeo = buildLeafyShrubGeo();
    const wildflowers: Species = {
      name: 'wildflowers', geo: wildflowerGeo, spacing: 2.8, radius: 84, fade: [-1, 0, 60, 84], cap: 4500, seed: 13, cells: new Map(), total: 0,
      mat: null as unknown as THREE.MeshStandardMaterial,
      rule: (x, z, i, j, s) => {
        if (!isTurfSample(x, z, s) || s.slope > 0.65 || s.sand > 0.55) return null;
        const patch = vnoise(x / 16, z / 16, 91);
        const pop = isPopulatedZone(x, z);
        const dens = (pop ? 0.10 : 0.24) + patch * (pop ? 0.18 : 0.34) + s.field * 0.10;
        if (dens < ihash(i, j, 3) + 0.26) return null;
        const sc = (pop ? 0.30 : 0.38) + ihash(i, j, 4) * 0.28 + patch * 0.14;
        const tint = 0.86 + ihash(i, j, 6) * 0.22;
        return { scale: sc, col: [tint, tint, tint * 0.96] };
      },
    };
    // shrubs: true 3D multi-layered leafy botanical bushes with painted oak foliage scan + derived vein normals & waxy cuticle roughness
    const shrubGeo = buildLeafyShrubGeo();
    const shrubs: Species = {
      name: 'shrubs', geo: shrubGeo, spacing: 5.6, radius: 215, fade: [-1, 0, 170, 215], cap: 8000, seed: 3, cells: new Map(), total: 0,
      mat: null as unknown as THREE.MeshStandardMaterial,
      rule: (x, z, i, j, s) => {
        const patch = vnoise(x / 40, z / 40, 21);
        const edge = vnoise(x / 18, z / 18, 22);
        const dens = s.forest * (0.20 + patch * 0.44) + s.field * 0.020 * (edge > 0.68 ? 5 : 1) + s.sand * 0.05 * patch;
        if (dens < ihash(i, j, 3) || s.slope > 0.8 || s.y < 2.2) return null;
        const sc = 0.85 + ihash(i, j, 4) * 1.35 + patch * 0.50;
        const dry = s.sand > 0.4 ? 0.50 : 0;
        const g = 0.40 + ihash(i, j, 6) * 0.28;
        return { scale: sc, col: [0.22 + dry * 0.30 + ihash(i, j, 7) * 0.12, g * (0.94 + (1 - dry) * 0.32), 0.12 + ihash(i, j, 8) * 0.08] };
      },
    };
    // rocks: 2K v4 PBR stone-rubble textured crags with mossy woodland caps on slopes, dunes and woods
    const rockGeo = new THREE.IcosahedronGeometry(0.5, 1);
    { const p = rockGeo.getAttribute('position'); for (let i = 0; i < p.count; i++) { const f = 0.80 + ihash(Math.round(p.getX(i) * 100), Math.round(p.getY(i) * 100), Math.round(p.getZ(i) * 100)) * 0.40; p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 0.62, p.getZ(i) * f); } rockGeo.computeVertexNormals(); }
    const rocks: Species = {
      name: 'rocks', geo: rockGeo, spacing: 8.2, radius: 195, fade: [-1, 0, 150, 192], cap: 5500, seed: 4, cells: new Map(), total: 0,
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
    this.species = [grassNear, vergeWild, grassMid, farmCrops, grassFar, ferns, wildflowers, shrubs, rocks];
    grassNear.mat = this.strandMaterial(grassNear, 'near', 2.45);
    grassMid.mat = this.strandMaterial(grassMid, 'mid', 3.40);
    grassFar.mat = this.strandMaterial(grassFar, 'far', 4.60);
    vergeWild.mat = this.strandMaterial(vergeWild, 'verge', 1.65);
    farmCrops.mat = this.strandMaterial(farmCrops, 'crops', 1.35);
    const fernPbr = getWoodlandFernPbr();
    ferns.mat = this.material(ferns, { map: fernPbr.map, normalMap: fernPbr.normalMap, roughnessMap: fernPbr.roughnessMap, alphaTest: 0.38, wind: 0.14, rough: 0.48, flat: false, isFoliage: true });
    const wildPbr = getMeadowWildflowerPbr();
    wildflowers.mat = this.material(wildflowers, { map: wildPbr.map, normalMap: wildPbr.normalMap, roughnessMap: wildPbr.roughnessMap, alphaTest: 0.38, wind: 0.16, rough: 0.50, flat: false, isFoliage: true });
    const shrubLeafPbr = getDerivedLeafPbrMaps('/games/ravencrest/assets/trees/oak_color.png', 2.6);
    shrubs.mat = this.material(shrubs, { map: getShrubLeafTex(), normalMap: shrubLeafPbr.normalMap, roughnessMap: shrubLeafPbr.roughnessMap, alphaTest: 0.34, wind: 0.08, rough: 0.54, flat: false, isFoliage: true });
    const rockPbr = getRockPbr();
    rocks.mat = this.material(rocks, { map: rockPbr.map, normalMap: rockPbr.normalMap, wind: 0, rough: 0.90, flat: false, isFoliage: false });
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
    // Exact integer subdivision of CELL (32 m) so world coordinates ALWAYS stay locked to [ci*32, (ci+1)*32) with zero drift anywhere on the 150 km² map!
    const n = Math.max(1, Math.round(CELL / sp.spacing));
    const step = CELL / n;
    const i0 = ci * n, j0 = cj * n;
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      const gi = i0 + a, gj = j0 + b;
      const x = ci * CELL + (a + ihash(gi, gj, sp.seed * 17 + 1)) * step;
      const z = cj * CELL + (b + ihash(gi, gj, sp.seed * 17 + 2)) * step;
      if (!this.sample(x, z, s)) continue;
      s.y = this.o.ground(x, z);
      if (s.y < 1.65) continue;
      // Keep shrubs/rocks further off asphalt than soft low grass blades
      const extraClear = (sp.name === 'shrubs' || sp.name === 'rocks' || sp.name === 'farmCrops') ? 1.8 : 0;
      if (extraClear > 0 && (!this.o.ok(x + extraClear, z) || !this.o.ok(x - extraClear, z) || !this.o.ok(x, z + extraClear) || !this.o.ok(x, z - extraClear))) continue;
      if (!this.o.ok(x, z)) continue;
      s.slope = Math.max(Math.abs(this.o.ground(x + 1.2, z) - s.y), Math.abs(this.o.ground(x, z + 1.2) - s.y)) / 1.2;
      const r = sp.rule(x, z, gi, gj, s);
      if (!r) continue;
      out.push(x, s.y - 0.03, z, r.rot ?? ihash(gi, gj, 6) * 6.2832, r.scale, r.col[0], r.col[1], r.col[2]);
    }
    return new Float32Array(out);                      // 8 floats per plant: x y z, rotation, scale, r g b
  }

  private cellPriority(cx: number, cz: number, cam: THREE.Vector3): number {
    const dx = cx - cam.x, dz = cz - cam.z;
    const d = Math.hypot(dx, dz);
    const dot = dx * this.fwdX + dz * this.fwdZ;
    // Prioritize cells inside the forward viewing cone first so 100% of visible ground in frame is carpeted before behind-camera cells!
    return dot > -CELL * 1.4 ? d * 0.40 : d + 900;
  }

  /** Synchronously pre-populate vegetation around a drive spawn / fast-travel point so grass & crops are ALREADY carpeted before the camera arrives (zero popping!). */
  prewarmAt(pos: THREE.Vector3, fwd?: THREE.Vector3): void {
    this.setEnabled(true);
    if (!this.cls || !this.alb) return;
    this.lastCam.set(1e9, 1e9);
    const savedTime = this.sinceRebuild;
    // Run 3 fast warm passes (~45 ms total) to completely fill foreground + mid + far cells around spawn
    for (let k = 0; k < 4; k++) {
      this.sinceRebuild = 1;
      this.update(0.016, pos, fwd);
      if (!this.pending) break;
    }
    this.sinceRebuild = savedTime;
  }

  update(dt: number, cam: THREE.Vector3, camForward?: THREE.Vector3): void {
    this.uTime.value += dt;
    this.uCam.value.copy(cam);
    const tslCtx = getRegionTslContext();
    if (tslCtx) {
      tslCtx.foliage.uTime.value = this.uTime.value;
      (tslCtx.foliage.uCam.value as THREE.Vector3).copy(cam);
    }
    if (camForward) {
      const fl = Math.hypot(camForward.x, camForward.z);
      if (fl > 0.05) {
        this.fwdX = camForward.x / fl;
        this.fwdZ = camForward.z / fl;
      }
    }
    const trails = this.uTrails.value;
    for (let i = 1; i < 4; i++) {
      if (trails[i].w > 0) trails[i].w = Math.max(0, trails[i].w - dt * 0.85);
    }
    if (!this.enabled || !this.cls || !this.alb) return;
    this.sinceRebuild += dt;
    const leanMode = this.quality < 0.35;
    const moveThresh = leanMode ? 11.0 : 4.5;
    const moved = Math.hypot(cam.x - this.lastCam.x, cam.z - this.lastCam.y);
    const turned = (this.fwdX * this.lastFwdX + this.fwdZ * this.lastFwdZ) < (leanMode ? 0.72 : 0.84);
    if (moved < moveThresh && !turned && !this.pending && !this.dirty) return;
    // which cells should exist, and make the nearest in-frustum missing ones inside a responsive time budget
    const t0 = performance.now();
    const bigJump = moved > 45;
    if (moved >= moveThresh || turned) {
      this.lastCam.set(cam.x, cam.z);
      this.lastFwdX = this.fwdX;
      this.lastFwdZ = this.fwdZ;
      this.dirty = true;
      this.pending = true;
    }
    const budget = bigJump ? 4.5 : (leanMode ? 1.0 : 2.4);
    let remaining = false;
    // Collect missing cells per species and generate ROUND-ROBIN across all tiers (grassNear/vergeWild/grassMid/farmCrops/shrubs)
    // so dense near-grass cells NEVER starve mid-horizon grass from carpeting the visible frame!
    const queues: Array<{ sp: Species; need: { key: number; ci: number; cj: number; prio: number }[]; idx: number }> = [];
    const skipFarGrass = this.quality < 0.65;
    for (const sp of this.species) {
      if ((leanMode && (sp.name === 'ferns' || sp.name === 'wildflowers' || sp.name === 'rocks')) || (skipFarGrass && sp.name === 'grassFar')) continue;
      const rScale = leanMode ? (0.42 + 0.58 * this.quality) : (this.quality >= 0.95 ? 1.0 : (0.62 + 0.38 * this.quality));
      const r = sp.radius * rScale + CELL * 0.65;
      const ci0 = Math.floor((cam.x - r) / CELL), ci1 = Math.floor((cam.x + r) / CELL), cj0 = Math.floor((cam.z - r) / CELL), cj1 = Math.floor((cam.z + r) / CELL);
      // drop cells that are too far
      for (const key of sp.cells.keys()) {
        const ci = Math.floor(key / 8192) - 4096, cj = (key - (ci + 4096) * 8192) - 4096;
        if (Math.hypot((ci + 0.5) * CELL - cam.x, (cj + 0.5) * CELL - cam.z) > r + CELL) { sp.cells.delete(key); sp.dirty = true; this.dirty = true; }
      }
      // missing cells, in-frustum nearest first
      const need: { key: number; ci: number; cj: number; prio: number }[] = [];
      for (let ci = ci0; ci <= ci1; ci++) for (let cj = cj0; cj <= cj1; cj++) {
        const cx = (ci + 0.5) * CELL, cz = (cj + 0.5) * CELL;
        const d = Math.hypot(cx - cam.x, cz - cam.z);
        if (d > r) continue;
        const key = (ci + 4096) * 8192 + (cj + 4096);
        if (!sp.cells.has(key)) need.push({ key, ci, cj, prio: this.cellPriority(cx, cz, cam) });
      }
      if (need.length) {
        need.sort((a, b) => a.prio - b.prio);
        queues.push({ sp, need, idx: 0 });
      }
    }
    // Round-robin pass in priority order (grassNear -> vergeWild -> grassMid -> farmCrops -> grassFar -> shrubs -> rocks)
    // so foreground roadside 3D grass around the player car ALWAYS populates first and NEVER gets starved by distant layers!
    let progressed = true;
    let round = 0;
    while (progressed) {
      progressed = false;
      for (const q of queues) {
        if (q.idx >= q.need.length) continue;
        // Guarantee at least 1 nearest cell for grassNear & vergeWild on round 0 even when budget is tight
        const burst = leanMode ? 1 : (q.sp.spacing >= 2.0 ? 3 : q.sp.spacing >= 1.1 ? 2 : 1);
        for (let b = 0; b < burst && q.idx < q.need.length; b++) {
          const isHeroNear = round === 0 && b === 0 && (q.sp.name === 'grass' || q.sp.name === 'vergeWild');
          if (!isHeroNear && performance.now() - t0 > budget) {
            remaining = true;
            break;
          }
          const n = q.need[q.idx++];
          q.sp.cells.set(n.key, this.genCell(q.sp, n.ci, n.cj));
          q.sp.dirty = true;
          this.dirty = true;
          progressed = true;
        }
        if (q.idx < q.need.length && performance.now() - t0 > budget) {
          remaining = true;
        }
      }
      round++;
      if (performance.now() - t0 > budget) {
        if (queues.some((q) => q.idx < q.need.length)) remaining = true;
        break;
      }
    }
    this.pending = remaining;
    this.stats.genMs = performance.now() - t0;
    const rebuildEvery = leanMode ? 0.55 : 0.22;
    if (this.dirty && (bigJump || this.sinceRebuild > rebuildEvery)) { this.rebuild(cam, bigJump); this.dirty = false; this.sinceRebuild = 0; }
  }

  /** pack the live cells into each species' instance buffer (in-frustum nearest cells first so the visible frame is 100% carpeted!) */
  private rebuild(cam: THREE.Vector3, forceAll = false): void {
    let cells = 0, draws = 0;
    const leanMode = this.quality < 0.35;
    const skipFarGrass = this.quality < 0.65;
    for (const sp of this.species) {
      if ((leanMode && (sp.name === 'ferns' || sp.name === 'wildflowers' || sp.name === 'rocks')) || (skipFarGrass && sp.name === 'grassFar')) {
        sp.total = 0;
        sp.geoI!.instanceCount = 0;
        sp.mesh!.visible = false;
        this.stats.instances[sp.name] = 0;
        continue;
      }
      if (!forceAll && !sp.dirty) {
        cells += sp.cells.size;
        if (sp.total > 0) draws++;
        continue;
      }
      sp.dirty = false;
      const arr = sp.buf!.array as Float32Array;
      const list = [...sp.cells.entries()].map(([key, data]) => {
        const ci = Math.floor(key / 8192) - 4096, cj = (key - (ci + 4096) * 8192) - 4096;
        return { data, prio: this.cellPriority((ci + 0.5) * CELL, (cj + 0.5) * CELL, cam) };
      }).sort((a, b) => a.prio - b.prio);
      const effCap = Math.max(180, Math.round(sp.cap * this.quality));
      let n = 0;
      for (const c of list) {
        const m = c.data.length / 8;
        for (let q = 0; q < m && n < effCap; q++, n++) { const o = n * 8, p = q * 8; arr[o] = c.data[p]; arr[o + 1] = c.data[p + 1]; arr[o + 2] = c.data[p + 2]; arr[o + 3] = c.data[p + 3]; arr[o + 4] = c.data[p + 4]; arr[o + 5] = c.data[p + 5]; arr[o + 6] = c.data[p + 6]; arr[o + 7] = c.data[p + 7]; }
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
