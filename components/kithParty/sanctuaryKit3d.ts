/**
 * Kith Racing environment kit, art-directed against the Kith Party key art (docs/kith-party/kith-racing-benchmark.jpg):
 * chiselled stratified cliff massifs with terraced waterfalls, Romanesque stone viaducts, the white-stone balustrade
 * with glowing amber triangle inlays and lantern pillars, purple pennants, crystal flame-blades in pointed stone
 * frames, gnarled sakura trees and layered horizon spires. Every course gets the kit in its own palette.
 *
 * All static pieces are merged per material (or instanced), so the whole kit costs a few dozen draw calls.
 */
import * as T from 'three';
import {mergeGeometries, mergeVertices} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {type CourseDef, type CourseId, type TunnelZone, courseById, courseMorphs, trackFrame, worldPoint, isGapAt, ensureOffTrackXZ} from './course3d';

// ---------------------------------------------------------------- themes
export interface KitTheme {
 stone: string; stoneDark: string; strata: string[]; grass: [string, string]; moss: string;
 glow: string; flame: string; cloth: string; clothDark: string; trim: string;
 crystal: [string, string, string]; blossom: [string, string, string]; trunk: string;
 water: boolean; waterTint: string; frozenFalls?: boolean; snowCaps?: boolean; grassCaps: boolean;
 haze: string; massifs: number; viaducts: number; peaks: number; sakura: boolean; shrines: number;
 /** carved Kith masks on near cliffs, curved viaduct roads in the mid-distance */
 masks?: number; arcs?: number;
 /** themed grove lining the road (each world's answer to Crestfall's sakura overhang) + how many slots */
 grove?: 'jungle' | 'coral' | 'palm' | 'pine' | 'charred'; groveCount?: number;
 /** what pours off the cliff lips when `water` is on (default: water, or ice with frozenFalls) */
 falls?: 'lava' | 'sand'; canopyGlow?: number;
 /** dress a mountain (point-to-point) world too: masks, massifs, shrines, groves, spires; no viaducts */
 mountainKit?: boolean;
}

/**
 * World-only upgrades on top of kitTheme(): the race worlds get the full Crestfall-grade dressing in their own
 * palette, while tennis/kombat arenas and road dressing keep reading the plain kitTheme() counts.
 */
const WORLD_UPGRADE: Partial<Record<CourseId, Partial<KitTheme>>> = {
 'amazon-canopy': {masks: 4, arcs: 2, viaducts: 3, shrines: 8, peaks: 24, grove: 'jungle', groveCount: 64, canopyGlow: .04, blossom: ['#1f6a2c', '#4fa83f', '#ff5fa8']},
 'dune-canyon': {masks: 4, arcs: 2, viaducts: 3, shrines: 8, peaks: 26, water: true, waterTint: '#ffffff', falls: 'sand', grove: 'palm', groveCount: 64},
 'polar-vortex': {masks: 3, arcs: 2, viaducts: 2, shrines: 8, peaks: 30, grove: 'pine', groveCount: 72, strata: ['#3f6684', '#5e86a6', '#2f5270', '#86aac4']},
 'abyssal-trench': {masks: 4, arcs: 1, viaducts: 1, shrines: 10, peaks: 22, grove: 'coral', groveCount: 56, canopyGlow: .55,
  stone: '#5fa3bd', stoneDark: '#1d4a66', strata: ['#1f5574', '#2f7590', '#1a4262', '#4a8fa6', '#3a3f7a']},
 'ember-ridge': {massifs: 12, masks: 3, shrines: 8, peaks: 22, water: true, waterTint: '#ffffff', falls: 'lava', grove: 'charred', groveCount: 48, mountainKit: true},
};
export function worldTheme(id: CourseId): KitTheme { return {...kitTheme(id), ...(WORLD_UPGRADE[id] || {})}; }

export function kitTheme(id: CourseId): KitTheme {
 switch (id) {
  case 'crestfall-gardens': return {stone: '#efe4d6', stoneDark: '#b9a7b8', strata: ['#a993b4', '#c4b0c6', '#8f7aa0', '#d8c6cf', '#9d86a8'], grass: ['#6aa64f', '#a8d86e'], moss: '#4f8a45',
   glow: '#ff9a1f', flame: '#ffc04a', cloth: '#5b2a8c', clothDark: '#341552', trim: '#f2b632', crystal: ['#ff5a1f', '#ff9a2e', '#ffe2a8'], blossom: ['#d8579b', '#f490c4', '#ffd8ec'], trunk: '#4a3550',
   water: true, waterTint: '#bff6ff', grassCaps: true, haze: '#b7a2d8', massifs: 16, viaducts: 3, peaks: 26, sakura: true, shrines: 10, masks: 4, arcs: 2};
  case 'amazon-canopy': return {stone: '#d9cdb0', stoneDark: '#7c7158', strata: ['#5d5a43', '#77704f', '#4a4a36', '#8a7f5c'], grass: ['#2f7a36', '#6fbf45'], moss: '#2f6a2c',
   glow: '#ffb03a', flame: '#ffe08a', cloth: '#1f5a2a', clothDark: '#0f3317', trim: '#ffd23f', crystal: ['#2bd96b', '#a6ff4d', '#f5ffd0'], blossom: ['#2f8a3a', '#4fb04a', '#9be06a'], trunk: '#4d331f',
   water: true, waterTint: '#d6fff0', grassCaps: true, haze: '#5f9a78', massifs: 16, viaducts: 2, peaks: 22, sakura: false, shrines: 6, masks: 2, arcs: 1};
  case 'dune-canyon': return {stone: '#f3dcb8', stoneDark: '#b97a4a', strata: ['#c2643a', '#e0915a', '#a84e2c', '#f0b47a', '#cf7444'], grass: ['#d9a856', '#efc87a'], moss: '#c99a4a',
   glow: '#ffb02e', flame: '#ffd27a', cloth: '#8a1f3d', clothDark: '#4f0f22', trim: '#ffcc4d', crystal: ['#ff3d1a', '#ff9a2e', '#fff0b0'], blossom: ['#d97e38', '#f0a95a', '#ffd9a0'], trunk: '#8c4a27',
   water: false, waterTint: '#ffffff', grassCaps: false, haze: '#e6a070', massifs: 18, viaducts: 2, peaks: 24, sakura: false, shrines: 6, masks: 2, arcs: 1};
  case 'polar-vortex': return {stone: '#eef8ff', stoneDark: '#9fbfd6', strata: ['#5d7f99', '#7fa2bb', '#4a6a85', '#a9c6da'], grass: ['#f4fbff', '#dff2ff'], moss: '#cfeaf7',
   glow: '#7ff7ff', flame: '#d8ffff', cloth: '#2a3f9a', clothDark: '#141f55', trim: '#e6f9ff', crystal: ['#3d8bff', '#7ff7ff', '#f0ffff'], blossom: ['#9ceeff', '#d0f6ff', '#ffffff'], trunk: '#2b4c66',
   water: true, waterTint: '#e8fbff', frozenFalls: true, snowCaps: true, grassCaps: false, haze: '#9cc4e0', massifs: 16, viaducts: 1, peaks: 28, sakura: false, shrines: 6};
  case 'abyssal-trench': return {stone: '#2a5a7a', stoneDark: '#123048', strata: ['#1a2f4a', '#22405e', '#132538', '#2c4f6e'], grass: ['#0e6b6b', '#1ec8b0'], moss: '#0e8a80',
   glow: '#00f0ff', flame: '#9ffcff', cloth: '#7a1f6a', clothDark: '#3d0f36', trim: '#00f0ff', crystal: ['#ff2e93', '#b36bff', '#c8f8ff'], blossom: ['#ff2e93', '#ff7ac0', '#ffd0ea'], trunk: '#2b4c66',
   water: false, waterTint: '#ffffff', grassCaps: true, haze: '#0b3a5e', massifs: 14, viaducts: 0, peaks: 18, sakura: false, shrines: 8};
  case 'ember-ridge': return {stone: '#5a4a46', stoneDark: '#2a2024', strata: ['#2b2426', '#3a2e2c', '#1e1818', '#4a3a36'], grass: ['#3a2c28', '#5e4232'], moss: '#2a1e1c',
   glow: '#ff5a1a', flame: '#ffb02e', cloth: '#7a1a0a', clothDark: '#3a0a04', trim: '#ffb02e', crystal: ['#ff3d00', '#ff8a1a', '#ffe0a0'], blossom: ['#3a2a26', '#4a3630', '#6a4a40'], trunk: '#1c1416',
   water: false, waterTint: '#ffffff', grassCaps: false, haze: '#6a2a1a', massifs: 0, viaducts: 0, peaks: 0, sakura: false, shrines: 0};
  default: {
   const d = courseById(id);
   return {stone: d.copingColor, stoneDark: d.deckColor, strata: ['#6b6070', '#857a8a', '#574e5c', '#9a8f9e'], grass: [d.terrainColorA, d.terrainColorB], moss: d.terrainColorA,
    glow: d.stripeColor, flame: '#fff0c0', cloth: d.accent, clothDark: '#1a1020', trim: d.stripeColor, crystal: [d.accent, d.stripeColor, '#ffffff'], blossom: [d.terrainColorA, d.terrainColorB, '#ffffff'], trunk: '#5c4a3a',
    water: false, waterTint: '#ffffff', grassCaps: true, haze: d.fogColor, massifs: 12, viaducts: 1, peaks: 20, sakura: false, shrines: 4};
  }
 }
}

// ---------------------------------------------------------------- noise
function rng(seed: number) { let s = (seed * 2654435761) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function hash3(x: number, y: number, z: number) { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); }
function vnoise(x: number, y: number, z: number) {
 const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
 const fx = x - ix, fy = y - iy, fz = z - iz;
 const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
 const l = (a: number, b: number, t: number) => a + (b - a) * t;
 return l(
  l(l(hash3(ix, iy, iz), hash3(ix + 1, iy, iz), ux), l(hash3(ix, iy + 1, iz), hash3(ix + 1, iy + 1, iz), ux), uy),
  l(l(hash3(ix, iy, iz + 1), hash3(ix + 1, iy, iz + 1), ux), l(hash3(ix, iy + 1, iz + 1), hash3(ix + 1, iy + 1, iz + 1), ux), uy), uz);
}
export function fbm(x: number, y: number, z: number, oct = 4) {
 let a = .5, f = 1, s = 0;
 for (let i = 0; i < oct; i++) { s += a * (vnoise(x * f, y * f, z * f) * 2 - 1); a *= .5; f *= 2.03; }
 return s;
}

// ---------------------------------------------------------------- batching
/** Merges geometry per material. Every geometry is normalised to position/normal/color/uv so merges never fail. */
class Batch {
 private map = new Map<T.Material, T.BufferGeometry[]>();
 add(g: T.BufferGeometry, m: T.Material, matrix?: T.Matrix4, color?: T.Color) {
  if (matrix) g.applyMatrix4(matrix);
  let n = g.index ? g.toNonIndexed() : g;
  if (n !== g) g.dispose();
  for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'color', 'uv'].includes(k)) n.deleteAttribute(k);
  if (!n.getAttribute('normal')) n.computeVertexNormals();
  const cnt = n.getAttribute('position').count;
  if (!n.getAttribute('color')) {
   const c = color || new T.Color(1, 1, 1), arr = new Float32Array(cnt * 3);
   for (let i = 0; i < cnt; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
   n.setAttribute('color', new T.BufferAttribute(arr, 3));
  }
  if (!n.getAttribute('uv')) n.setAttribute('uv', new T.BufferAttribute(new Float32Array(cnt * 2), 2));
  const list = this.map.get(m) || []; list.push(n); this.map.set(m, list);
 }
 flush(parent: T.Object3D, disposables: {dispose(): void}[], shadows = true) {
  for (const [m, list] of this.map) {
   if (!list.length) continue;
   const merged = mergeGeometries(list, false);
   list.forEach(g => g.dispose());
   if (!merged) continue;
   const mesh = new T.Mesh(merged, m); mesh.castShadow = shadows; mesh.receiveShadow = true;
   parent.add(mesh); disposables.push(merged);
  }
  this.map.clear();
 }
}

// ---------------------------------------------------------------- textures + materials
function canvasTex(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void, srgb = false) {
 const c = document.createElement('canvas'); c.width = w; c.height = h;
 draw(c.getContext('2d')!);
 const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8;
 if (srgb) t.colorSpace = T.SRGBColorSpace;
 return t;
}
function rockDetailTexture() {
 return canvasTex(256, 256, x => {
  x.fillStyle = 'rgb(128,128,128)'; x.fillRect(0, 0, 256, 256);
  const r = rng(7);
  for (let i = 0; i < 70; i++) { const cx = r() * 256, cy = r() * 256, rad = 10 + r() * 40, v = r() > .5 ? 160 : 96; const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad); g.addColorStop(0, `rgba(${v},${v},${v},.45)`); g.addColorStop(1, `rgba(${v},${v},${v},0)`); x.fillStyle = g; x.fillRect(0, 0, 256, 256); }
  x.lineCap = 'round';
  for (let i = 0; i < 46; i++) { let px = r() * 256, py = r() * 256; x.strokeStyle = `rgba(40,40,40,${.25 + r() * .35})`; x.lineWidth = .6 + r() * 1.6; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += (r() - .5) * 34; py += (r() - .2) * 26; x.lineTo(px, py); } x.stroke(); }
  for (let i = 0; i < 6000; i++) { const v = 90 + r() * 90; x.fillStyle = `rgba(${v},${v},${v},.5)`; x.fillRect(r() * 256, r() * 256, 1, 1); }
 });
}
function masonryTexture() {
 return canvasTex(256, 256, x => {
  x.fillStyle = 'rgb(70,70,70)'; x.fillRect(0, 0, 256, 256);
  const r = rng(11);
  for (let row = 0; row < 8; row++) {
   const off = row % 2 ? 32 : 0;
   for (let col = -1; col < 5; col++) {
    const v = 120 + r() * 40, bx = col * 64 + off + 2, by = row * 32 + 2;
    const g = x.createLinearGradient(bx, by, bx, by + 28); g.addColorStop(0, `rgb(${v + 14},${v + 14},${v + 14})`); g.addColorStop(1, `rgb(${v - 12},${v - 12},${v - 12})`);
    x.fillStyle = g; x.fillRect(bx, by, 60, 28);
   }
  }
  for (let i = 0; i < 5000; i++) { const v = 90 + r() * 80; x.fillStyle = `rgba(${v},${v},${v},.35)`; x.fillRect(r() * 256, r() * 256, 1, 1); }
 });
}

/** World-space triplanar detail on top of vertex colours (works merged or instanced). */
function triplanar(m: T.MeshStandardMaterial, tex: T.Texture, scaleA: number, scaleB: number, strength = .9, key = 'rock') {
 m.onBeforeCompile = sh => {
  sh.uniforms.uKpTex = {value: tex};
  sh.vertexShader = 'varying vec3 vKpW;\nvarying vec3 vKpN;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  {
   #ifdef USE_INSTANCING
    mat4 kpM = modelMatrix * instanceMatrix;
   #else
    mat4 kpM = modelMatrix;
   #endif
   vKpW = (kpM * vec4(transformed, 1.0)).xyz;
   vKpN = normalize(mat3(kpM) * objectNormal);
  }`);
  sh.fragmentShader = 'uniform sampler2D uKpTex;\nvarying vec3 vKpW;\nvarying vec3 vKpN;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  {
   vec3 bw = pow(abs(normalize(vKpN)), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
   float d1 = texture2D(uKpTex, vKpW.zy * ${scaleA.toFixed(4)}).r * bw.x + texture2D(uKpTex, vKpW.xz * ${scaleA.toFixed(4)}).r * bw.y + texture2D(uKpTex, vKpW.xy * ${scaleA.toFixed(4)}).r * bw.z;
   float d2 = texture2D(uKpTex, vKpW.zy * ${scaleB.toFixed(4)} + 0.31).r * bw.x + texture2D(uKpTex, vKpW.xz * ${scaleB.toFixed(4)} + 0.17).r * bw.y + texture2D(uKpTex, vKpW.xy * ${scaleB.toFixed(4)} + 0.53).r * bw.z;
   diffuseColor.rgb *= mix(vec3(1.0), vec3(0.45 + d1 * 1.1) * (0.7 + d2 * 0.6), ${strength.toFixed(3)});
  }`);
 };
 m.customProgramCacheKey = () => `kp-tri-${key}-${scaleA}-${scaleB}-${strength}`;
 return m;
}

interface Mats {
 rock: T.MeshStandardMaterial; stone: T.MeshStandardMaterial; stoneSmooth: T.MeshStandardMaterial;
 gold: T.MeshStandardMaterial; glow: T.MeshStandardMaterial; flame: T.MeshStandardMaterial;
 water: T.MeshStandardMaterial; foam: T.MeshStandardMaterial; crystal: T.MeshPhysicalMaterial;
 trunk: T.MeshStandardMaterial; canopy: T.MeshStandardMaterial; leaf?: T.MeshStandardMaterial; peak: T.MeshStandardMaterial; petals: T.MeshStandardMaterial;
 waterMap: T.Texture; time: {value: number}; disposables: {dispose(): void}[];
}

/** What pours off the cliffs. Water + ice keep their original look; lava and sand are the hot/dry worlds' cascades. */
type FallsKind = 'water' | 'ice' | 'lava' | 'sand';
function fallsKind(theme: KitTheme): FallsKind { return theme.falls ?? (theme.frozenFalls ? 'ice' : 'water'); }
const FALLS: Record<FallsKind, {base: string; s1: string; s2: string; em: string; ei: number; op: number; rough: number; foam: string; foamEm: string; foamEi: number; mist: string; mistOp: number; flow: number}> = {
 water: {base: '#3cc9e6', s1: 'rgba(245,255,255,.85)', s2: 'rgba(120,235,255,.9)', em: '#5fd8f0', ei: .95, op: .9, rough: .1, foam: '#ffffff', foamEm: '#d8f8ff', foamEi: .55, mist: '#ffffff', mistOp: .7, flow: .55},
 ice: {base: '#bfe9ff', s1: 'rgba(245,255,255,.85)', s2: 'rgba(120,235,255,.9)', em: '#5aa8d0', ei: .35, op: .96, rough: .1, foam: '#ffffff', foamEm: '#d8f8ff', foamEi: .55, mist: '#ffffff', mistOp: .35, flow: .02},
 lava: {base: '#ff5a10', s1: 'rgba(255,232,150,.95)', s2: 'rgba(150,22,0,.9)', em: '#ff4a0a', ei: 1.5, op: .97, rough: .45, foam: '#ffb347', foamEm: '#ff6a1a', foamEi: 1.3, mist: '#4a3a3a', mistOp: .5, flow: .22},
 sand: {base: '#e2a862', s1: 'rgba(255,236,190,.8)', s2: 'rgba(176,104,52,.85)', em: '#b0682a', ei: .16, op: .95, rough: .95, foam: '#f6d7a4', foamEm: '#c08a50', foamEi: .12, mist: '#f2d3a0', mistOp: .45, flow: .32},
};

const matCache = new Map<string, Mats>();
function kitMats(theme: KitTheme, key: string): Mats {
 const hit = matCache.get(key);
 if (hit) return hit;
 const d: {dispose(): void}[] = [];
 const rockTex = rockDetailTexture(), masonry = masonryTexture(); d.push(rockTex, masonry);
 const time = {value: 0};
 const rock = triplanar(new T.MeshStandardMaterial({vertexColors: true, roughness: .92, metalness: 0, flatShading: true}), rockTex, .07, .012, .85, 'rock');
 const stone = triplanar(new T.MeshStandardMaterial({vertexColors: true, roughness: .78, metalness: .02}), masonry, .32, .05, .55, 'masonry');
 const stoneSmooth = triplanar(new T.MeshStandardMaterial({vertexColors: true, roughness: .55, metalness: .04}), rockTex, .5, .08, .25, 'smooth');
 const gold = new T.MeshStandardMaterial({color: theme.trim, roughness: .28, metalness: .85, envMapIntensity: 1.5});
 const glow = new T.MeshStandardMaterial({color: theme.glow, emissive: theme.glow, emissiveIntensity: 1.7, roughness: .35});
 const flame = new T.MeshStandardMaterial({color: theme.flame, emissive: theme.flame, emissiveIntensity: 2.4, roughness: .3});
 const F = FALLS[fallsKind(theme)];
 const waterMap = canvasTex(64, 256, x => {
  x.fillStyle = F.base; x.fillRect(0, 0, 64, 256);
  const r = rng(3);
  for (let i = 0; i < 90; i++) { x.fillStyle = r() > .4 ? F.s1 : F.s2; x.fillRect(r() * 64, r() * 256, 1 + r() * 3, 18 + r() * 50); }
 }, true);
 waterMap.repeat.set(1, 2);
 const water = new T.MeshStandardMaterial({map: waterMap, color: theme.waterTint, emissive: F.em, emissiveIntensity: F.ei, roughness: F.rough, metalness: .1, transparent: true, opacity: F.op, side: T.DoubleSide, depthWrite: false});
 const foam = new T.MeshStandardMaterial({color: F.foam, emissive: F.foamEm, emissiveIntensity: F.foamEi, roughness: .9, transparent: true, opacity: .82, depthWrite: false});
 const crystal = new T.MeshPhysicalMaterial({vertexColors: true, roughness: .12, metalness: .05, clearcoat: 1, clearcoatRoughness: .05, emissive: '#ffffff', emissiveIntensity: .9, envMapIntensity: 1.6, transparent: true, opacity: .94});
 crystal.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = emissive * vColor.rgb;'); };
 crystal.customProgramCacheKey = () => 'kp-kit-crystal';
 const trunk = triplanar(new T.MeshStandardMaterial({vertexColors: true, roughness: .85}), rockTex, .9, .2, .5, 'bark');
 const canopy = new T.MeshStandardMaterial({vertexColors: true, roughness: .7, emissive: theme.blossom[1], emissiveIntensity: theme.canopyGlow ?? (theme.sakura ? .12 : 0), flatShading: false});
 windSway(canopy, time, .22);
 // grove leaves that light from their own vertex colour (ember buds on charred trees): only colours brighter
 // than the char glow, so the bark-dark parts of the same mesh stay matte
 let leaf: T.MeshStandardMaterial | undefined;
 if (theme.grove === 'charred') {
  leaf = new T.MeshStandardMaterial({vertexColors: true, roughness: .6, emissive: '#ffffff', emissiveIntensity: 2.2, flatShading: true});
  windSway(leaf, time, .08);
  const sway = leaf.onBeforeCompile;
  leaf.onBeforeCompile = (sh, r) => { sway.call(leaf, sh, r); sh.fragmentShader = sh.fragmentShader.replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = emissive * max(vColor.rgb - vec3(0.32), vec3(0.0)) * 1.6;'); };
  leaf.customProgramCacheKey = () => 'kp-kit-emberleaf';
 }
 const peak = triplanar(new T.MeshStandardMaterial({vertexColors: true, roughness: 1, flatShading: true}), rockTex, .02, .004, .5, 'peak');
 const petals = new T.MeshStandardMaterial({map: canvasTex(128, 128, x => {
  const r = rng(5); x.clearRect(0, 0, 128, 128);
  for (let i = 0; i < 260; i++) { const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * 58; x.fillStyle = r() > .5 ? 'rgba(255,190,222,.95)' : 'rgba(255,236,246,.95)'; x.beginPath(); x.ellipse(64 + Math.cos(a) * rr, 64 + Math.sin(a) * rr, 2.6, 1.6, r() * 3, 0, 7); x.fill(); }
 }, true), transparent: true, alphaTest: .3, roughness: .8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2});
 d.push(rock, stone, stoneSmooth, gold, glow, flame, water, waterMap, foam, crystal, trunk, canopy, peak, petals, petals.map!);
 if (leaf) d.push(leaf);
 const mats: Mats = {rock, stone, stoneSmooth, gold, glow, flame, water, foam, crystal, trunk, canopy, leaf, peak, petals, waterMap, time, disposables: d};
 matCache.set(key, mats);
 return mats;
}
function releaseMats(key: string) { const m = matCache.get(key); if (!m) return; m.disposables.forEach(x => x.dispose()); matCache.delete(key); }

function windSway(mat: T.Material, time: {value: number}, amount: number) {
 const prev = mat.onBeforeCompile;
 mat.onBeforeCompile = (sh, r) => {
  prev?.call(mat, sh, r);
  sh.uniforms.uKpWind = time;
  sh.vertexShader = 'uniform float uKpWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  {
   #ifdef USE_INSTANCING
    vec2 kpP = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
   #else
    vec2 kpP = vec2(0.0);
   #endif
   float kpW = clamp(position.y / 6.0, 0.0, 1.4); kpW *= kpW;
   transformed.x += (sin(uKpWind * 1.6 + kpP.x * 0.07 + position.y * 0.4) + 0.4 * sin(uKpWind * 3.7 + kpP.y * 0.2)) * ${amount.toFixed(3)} * kpW;
   transformed.z += cos(uKpWind * 1.2 + kpP.y * 0.06) * ${(amount * .6).toFixed(3)} * kpW;
  }`);
 };
 mat.customProgramCacheKey = () => `kp-kit-wind-${amount}`;
}

// ---------------------------------------------------------------- colour helpers
const tmpC = new T.Color(), tmpC2 = new T.Color();
/** Per-face colouring of a non-indexed geometry. fn gets the face centroid (world) + face normal. */
function paintFaces(g: T.BufferGeometry, fn: (c: T.Vector3, n: T.Vector3, out: T.Color) => void) {
 const pos = g.getAttribute('position') as T.BufferAttribute;
 const cols = new Float32Array(pos.count * 3);
 const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), n = new T.Vector3(), ctr = new T.Vector3(), out = new T.Color();
 for (let i = 0; i < pos.count; i += 3) {
  a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
  n.subVectors(c, b).cross(new T.Vector3().subVectors(a, b)).normalize();
  ctr.copy(a).add(b).add(c).multiplyScalar(1 / 3);
  fn(ctr, n, out);
  for (let k = 0; k < 3; k++) { cols[(i + k) * 3] = out.r; cols[(i + k) * 3 + 1] = out.g; cols[(i + k) * 3 + 2] = out.b; }
 }
 g.setAttribute('color', new T.BufferAttribute(cols, 3));
}
function strataColor(theme: KitTheme, p: T.Vector3, n: T.Vector3, baseY: number, topY: number, out: T.Color) {
 const s = theme.strata;
 const band = (p.y * .19 + fbm(p.x * .03, p.y * .02, p.z * .03, 2) * 1.6) % s.length;
 const i0 = ((Math.floor(band) % s.length) + s.length) % s.length, f = band - Math.floor(band);
 out.set(s[i0]).lerp(tmpC.set(s[(i0 + 1) % s.length]), T.MathUtils.smoothstep(f, .75, 1));
 // ambient occlusion toward the base, sun-bleach toward the top
 const h = T.MathUtils.clamp((p.y - baseY) / Math.max(1, topY - baseY), 0, 1);
 out.multiplyScalar((.55 + h * .55) * (.82 + .36 * (fbm(p.x * .16, p.y * .16, p.z * .16, 2) * .5 + .5)));
 // grass / snow on up-facing ledges, moss drips under them
 if (n.y > .5) {
  const k = T.MathUtils.smoothstep(n.y, .5, .78);
  if (theme.snowCaps) out.lerp(tmpC.set('#f6fbff'), k);
  else if (theme.grassCaps) out.lerp(tmpC.set(theme.grass[0]).lerp(tmpC2.set(theme.grass[1]), .5 + fbm(p.x * .08, 0, p.z * .08, 2)), k);
  else out.lerp(tmpC.set(theme.grass[1]), k * .6);
 } else if (theme.grassCaps && n.y > .15) out.lerp(tmpC.set(theme.moss), .35);
}

// ---------------------------------------------------------------- per-build collectors (mist at plunge pools, hanging strands)
let mistSink: T.Vector3[] | null = null;
let strandSink: T.Matrix4[] | null = null;

// ---------------------------------------------------------------- cliff massifs
interface Terrace { x: number; y: number; z: number; r: number; rim: T.Vector3[]; }
interface MassifOut { terraces: Terrace[]; top: number; }

let lastRim: T.Vector3[] = [];
function cliffTier(cx: number, y0: number, cz: number, R: number, h: number, seed: number, opts: {taper: number; lip: number}): T.BufferGeometry {
 const segA = 48, segY = 12;
 const pos: number[] = [];
 const grid: T.Vector3[][] = [];
 for (let j = 0; j <= segY + 1; j++) {
  const row: T.Vector3[] = [];
  const v = Math.min(j, segY) / segY;
  for (let i = 0; i < segA; i++) {
   const a = i / segA * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
   const y = y0 + v * h;
   let r = R * (1 - opts.taper * v) * (1 + .3 * fbm(ca * 1.4 + seed, y * .045, sa * 1.4 + seed * .7, 4));
   // vertical fluting: columnar ridges and gullies running down the face
   r *= 1 + .06 * Math.abs(Math.sin(a * 9 + seed + fbm(ca * 2, y * .03, sa * 2, 2) * 2)) - .03 + .05 * fbm(ca * 6 + seed, y * .02, sa * 6, 2);
   // stratified ledges: the wall steps in and out in bands
   r *= 1 + .07 * Math.sign(Math.sin(y * .55 + fbm(ca + seed, y * .1, sa, 2) * 2)) * (.5 + .5 * vnoise(ca * 3 + seed, y * .3, sa * 3));
   if (j === segY) r *= 1 + opts.lip;
   let yy = y + (j >= segY ? fbm(ca * 2 + seed, 9, sa * 2, 2) * h * .05 : (vnoise(ca * 5 + seed, j, sa * 5) - .5) * h / segY * .5);
   if (j === segY + 1) { r *= .82; yy += .6 + vnoise(ca * 4, seed, sa * 4) * 1.2; }
   row.push(new T.Vector3(cx + ca * r, yy, cz + sa * r));
  }
  grid.push(row);
 }
 const tri = (a: T.Vector3, b: T.Vector3, c: T.Vector3) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
 for (let j = 0; j < grid.length - 1; j++) for (let i = 0; i < segA; i++) {
  const i2 = (i + 1) % segA, a = grid[j][i], b = grid[j][i2], c = grid[j + 1][i], d = grid[j + 1][i2];
  tri(a, c, b); tri(b, c, d);
 }
 // terrace cap (fan with a lumpy centre)
 const top = grid[grid.length - 1];
 lastRim = grid[segY].filter((_, i) => i % 3 === 0).map(p => p.clone());
 const centre = new T.Vector3(cx, top.reduce((s, p) => s + p.y, 0) / top.length + .8, cz);
 for (let i = 0; i < segA; i++) tri(top[i], centre, top[(i + 1) % segA]);
 // floor skirt so the base never floats
 const bottom = grid[0];
 for (let i = 0; i < segA; i++) { const p = bottom[i], q = bottom[(i + 1) % segA]; const p2 = p.clone().setY(p.y - 8), q2 = q.clone().setY(q.y - 8); tri(p2, p, q2); tri(q2, p, q); }
 const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
 return g;
}

function massif(batch: Batch, m: Mats, theme: KitTheme, x: number, baseY: number, z: number, R: number, H: number, seed: number, falls: Batch | null, faceToward: T.Vector2): MassifOut {
 const r = rng(seed * 13 + 5);
 const tiers = H > 34 ? 3 : 2;
 const terraces: Terrace[] = [];
 let y = baseY - 5, rad = R, cx = x, cz = z;
 const hs = tiers === 3 ? [.46, .32, .22] : [.6, .4];
 const tops: {x: number; y: number; z: number; r: number}[] = [];
 for (let k = 0; k < tiers; k++) {
  const h = H * hs[k] + (k === 0 ? 5 : 0);
  const g = cliffTier(cx, y, cz, rad, h, seed + k * 3.7, {taper: .12 + r() * .1, lip: .04 + r() * .06});
  const lo = baseY - 5, hi = baseY + H;
  paintFaces(g, (c, n, out) => strataColor(theme, c, n, lo, hi, out));
  batch.add(g, m.rock);
  y += h; tops.push({x: cx, y, z: cz, r: rad});
  terraces.push({x: cx, y: y + .8, z: cz, r: rad * .78, rim: lastRim});
  // blossom / vine curtains hanging off the ledge
  if (strandSink) for (const p of lastRim) {
   if (r() > .5) continue;
   const out = new T.Vector2(p.x - cx, p.z - cz).normalize();
   const L = 2.5 + r() * Math.min(9, h * .35), w = .7 + r() * .9;
   strandSink.push(new T.Matrix4().compose(new T.Vector3(p.x + out.x * .5, p.y + .2, p.z + out.y * .5), new T.Quaternion().setFromEuler(new T.Euler(0, r() * 6.28, 0)), new T.Vector3(w, L, w)));
  }
  const nr = rad * (.58 + r() * .12);
  const ang = r() * Math.PI * 2;
  cx += Math.cos(ang) * (rad - nr) * .45; cz += Math.sin(ang) * (rad - nr) * .45;
  rad = nr;
 }
 // waterfalls cascading off the tier lips toward the track
 if (falls && theme.water) {
  const dir = Math.atan2(faceToward.y - z, faceToward.x - x);
  for (let k = tiers - 1; k >= 0; k--) {
   if (k < tiers - 1 && r() < .35) continue;
   const t = tops[k];
   const a = dir + (r() - .5) * .9;
   const lipR = t.r * 1.08 * (1 + .26 * fbm(Math.cos(a) * 1.4 + seed + k * 3.7, t.y * .045, Math.sin(a) * 1.4 + (seed + k * 3.7) * .7, 4)) + .6;
   const fx = t.x + Math.cos(a) * lipR, fz = t.z + Math.sin(a) * lipR;
   const floorY = k > 0 ? tops[k - 1].y : baseY - 1;
   const drop = t.y - floorY;
   if (drop < 4) continue;
   const w = Math.min(7, 1.6 + t.r * .16);
   waterfall(falls, m, fx, t.y + .6, fz, w, drop + .5, a, k > 0 ? 3.5 : 6);
  }
 }
 return {terraces, top: y};
}

/** Curved ribbon of falling water: arcs out from the lip, then straight down, with foam + a plunge pool. */
function waterfall(falls: Batch, m: Mats, x: number, top: number, z: number, w: number, drop: number, outward: number, pool: number) {
 const segs = 10, pos: number[] = [], uv: number[] = [];
 const ox = Math.cos(outward), oz = Math.sin(outward), px = -oz, pz = ox;
 const pts: T.Vector3[] = [];
 for (let i = 0; i <= segs; i++) {
  const v = i / segs;
  const out = Math.sqrt(v) * Math.min(2.6, drop * .12);
  pts.push(new T.Vector3(x + ox * out, top - v * drop, z + oz * out));
 }
 for (let i = 0; i < segs; i++) {
  const a = pts[i], b = pts[i + 1];
  const wa = w * (1 + i / segs * .25), wb = w * (1 + (i + 1) / segs * .25);
  const A1 = [a.x - px * wa / 2, a.y, a.z - pz * wa / 2], A2 = [a.x + px * wa / 2, a.y, a.z + pz * wa / 2];
  const B1 = [b.x - px * wb / 2, b.y, b.z - pz * wb / 2], B2 = [b.x + px * wb / 2, b.y, b.z + pz * wb / 2];
  pos.push(...A1, ...B1, ...A2, ...A2, ...B1, ...B2);
  const va = i / segs * drop * .06, vb = (i + 1) / segs * drop * .06;
  uv.push(0, va, 0, vb, 1, va, 1, va, 0, vb, 1, vb);
 }
 const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
 falls.add(g, m.water);
 const end = pts[segs];
 const foamMat = new T.Matrix4();
 for (let k = 0; k < 4; k++) {
  const s = new T.SphereGeometry(1, 10, 6);
  foamMat.compose(new T.Vector3(end.x + (k - 1.5) * w * .28, end.y + .3, end.z), new T.Quaternion(), new T.Vector3(w * .38, .7 + k % 2 * .3, w * .3));
  falls.add(s, m.foam, foamMat);
 }
 mistSink?.push(new T.Vector3(end.x, end.y + 1.5, end.z), new T.Vector3(end.x + ox * 2, end.y + 3.2, end.z + oz * 2));
 const disc = new T.CircleGeometry(pool, 20); disc.rotateX(-Math.PI / 2); disc.translate(end.x, end.y + .15, end.z);
 falls.add(disc, m.water);
}

// ---------------------------------------------------------------- viaducts / arcades
function archHole(x0: number, w: number, y0: number, springY: number): T.Path {
 const p = new T.Path();
 p.moveTo(x0, y0); p.lineTo(x0 + w, y0); p.lineTo(x0 + w, springY);
 p.absarc(x0 + w / 2, springY, w / 2, 0, Math.PI, false);
 p.lineTo(x0, y0);
 return p;
}
/** Arcade wall in local space: x along length (centred), y up from 0, z = depth (centred). */
function arcadeGeometry(len: number, h: number, depth: number, arches: number, holeBottom: number): T.BufferGeometry {
 const s = new T.Shape(); s.moveTo(-len / 2, 0); s.lineTo(len / 2, 0); s.lineTo(len / 2, h); s.lineTo(-len / 2, h); s.lineTo(-len / 2, 0);
 const bay = len / arches, w = bay * .64;
 for (let i = 0; i < arches; i++) {
  const x0 = -len / 2 + i * bay + (bay - w) / 2;
  const spring = Math.min(h - w / 2 - h * .1, Math.max(holeBottom + 1, h * .62 - w / 2 + w * .2));
  s.holes.push(archHole(x0, w, holeBottom, spring));
 }
 const g = new T.ExtrudeGeometry(s, {depth, bevelEnabled: true, bevelSize: .25, bevelThickness: .25, bevelSegments: 1, curveSegments: 12});
 g.translate(0, 0, -depth / 2);
 return g;
}
function viaduct(batch: Batch, m: Mats, theme: KitTheme, a: T.Vector3, b: T.Vector3, groundY: number, falls: Batch | null) {
 const len = Math.hypot(b.x - a.x, b.z - a.z);
 const deckY = Math.max(a.y, b.y);
 const H = deckY - groundY;
 const yaw = Math.atan2(-(b.z - a.z), b.x - a.x);
 const mid = new T.Vector3((a.x + b.x) / 2, groundY - 2, (a.z + b.z) / 2);
 const M = new T.Matrix4().compose(mid, new T.Quaternion().setFromEuler(new T.Euler(0, yaw, 0)), new T.Vector3(1, 1, 1));
 const stone = new T.Color(theme.stone).lerp(tmpC.set(theme.stoneDark), .25);
 // lower tier: tall arches; upper tier: a lighter arcade; cornice + balustrade on top
 const lowerH = (H + 2) * .62, upperH = (H + 2) - lowerH;
 const lower = arcadeGeometry(len, lowerH, 6, Math.max(2, Math.round(len / 16)), .6);
 lower.applyMatrix4(M); batch.add(lower, m.stone, undefined, stone);
 const upper = arcadeGeometry(len, upperH, 4.6, Math.max(4, Math.round(len / 7)), .4);
 upper.applyMatrix4(new T.Matrix4().makeTranslation(0, lowerH, 0).premultiply(M)); batch.add(upper, m.stone, undefined, new T.Color(theme.stone));
 const cornice = new RoundedBoxGeometry(len + 1.2, .8, 6.6, 1, .2); cornice.translate(0, lowerH + .1, 0); cornice.applyMatrix4(M); batch.add(cornice, m.stoneSmooth, undefined, new T.Color(theme.stone));
 const deck = new RoundedBoxGeometry(len + 1.6, 1, 5.6, 1, .25); deck.translate(0, H + 2.4, 0); deck.applyMatrix4(M); batch.add(deck, m.stoneSmooth, undefined, new T.Color(theme.stone));
 const posts = Math.round(len / 2.6);
 for (const side of [-1, 1]) {
  const rail = new T.BoxGeometry(len, .28, .4); rail.translate(0, H + 4, side * 2.5); rail.applyMatrix4(M); batch.add(rail, m.stoneSmooth, undefined, new T.Color(theme.stone));
  for (let i = 0; i <= posts; i++) {
   const p = new T.BoxGeometry(.4, 1.1, .4); p.translate(-len / 2 + i * len / posts, H + 3.4, side * 2.5); p.applyMatrix4(M); batch.add(p, m.stoneSmooth, undefined, new T.Color(theme.stone));
  }
 }
 // water pouring through a couple of the upper arches
 if (falls && theme.water) {
  const n = Math.max(1, Math.round(len / 40));
  for (let i = 0; i < n; i++) {
   const u = (i + .5) / n - .5;
   const p = new T.Vector3(u * len, 0, 3.4).applyMatrix4(M);
   waterfall(falls, m, p.x, deckY + 2, p.z, 3, H + 2, Math.PI / 2 - yaw, 5);
  }
 }
}

/** A chain of arcade segments along a curve: a second road sweeping across the valley, like the key art. */
function curvedViaduct(batch: Batch, m: Mats, theme: KitTheme, pts: T.Vector3[], groundAt: (x: number, z: number) => number, falls: Batch | null) {
 for (let i = 0; i < pts.length - 1; i++) {
  const a = pts[i], b = pts[i + 1];
  const gy = Math.min(groundAt(a.x, a.z), groundAt(b.x, b.z), groundAt((a.x + b.x) / 2, (a.z + b.z) / 2)) - 1;
  // overlap segments slightly so the chain reads as one bridge around the bend
  const d = new T.Vector3().subVectors(b, a).setY(0).normalize().multiplyScalar(.9);
  viaduct(batch, m, theme, a.clone().sub(d), b.clone().add(d), gy, falls && i % 3 === 1 ? falls : null);
 }
}

// ---------------------------------------------------------------- carved Kith masks
/** Monumental stone Kith head (crown fins, pointed ears, deep eye sockets with an ember glow) facing local +z. */
function kithMask(batch: Batch, m: Mats, theme: KitTheme, p: T.Vector3, yaw: number, s: number) {
 const M = new T.Matrix4().compose(p, new T.Quaternion().setFromEuler(new T.Euler(0, yaw, 0)), new T.Vector3(s, s, s));
 const white = new T.Color(theme.stone), shade = new T.Color(theme.stoneDark).lerp(tmpC.set(theme.stone), .3), dark = new T.Color(theme.stoneDark).multiplyScalar(.35);
 const put = (g: T.BufferGeometry, mat: T.Material, c: T.Color, pos: [number, number, number], sc: [number, number, number], rot: [number, number, number] = [0, 0, 0]) => {
  g.applyMatrix4(new T.Matrix4().compose(new T.Vector3(...pos), new T.Quaternion().setFromEuler(new T.Euler(...rot)), new T.Vector3(...sc)).premultiply(M));
  batch.add(g, mat, undefined, c);
 };
 put(new T.SphereGeometry(1, 28, 20), m.stoneSmooth, white, [0, 0, 0], [1.15, .98, .62]);
 put(new T.SphereGeometry(1, 20, 14), m.stoneSmooth, white, [0, -.42, .3], [.62, .42, .45]);
 for (const sd of [-1, 1]) {
  put(new T.ConeGeometry(.42, 1.25, 4), m.stoneSmooth, white, [sd * .78, .98, -.05], [1, 1, .55], [0, 0, -sd * .42]);
  put(new T.ConeGeometry(.24, .8, 4), m.stoneSmooth, shade, [sd * .74, .95, .12], [1, 1, .35], [0, 0, -sd * .42]);
  put(new T.SphereGeometry(1, 16, 12), m.stoneSmooth, dark, [sd * .42, .14, .44], [.3, .2, .2], [0, 0, sd * .28]);
  put(new T.SphereGeometry(1, 12, 8), m.glow, new T.Color(1, 1, 1), [sd * .42, .12, .5], [.1, .08, .06]);
  put(new T.SphereGeometry(1, 12, 10), m.stoneSmooth, shade, [sd * .5, -.18, .4], [.32, .14, .18]);
 }
 for (let k = -2; k <= 2; k++) put(new T.ConeGeometry(.2, .9 - Math.abs(k) * .15, 4), m.stoneSmooth, white, [k * .26, 1.02 - Math.abs(k) * .08, -.2], [1, 1, .5], [0, 0, -k * .25]);
 put(new T.BoxGeometry(.5, .05, .1), m.stoneSmooth, dark, [0, -.62, .7], [1, 1, 1]);
 put(new T.SphereGeometry(1, 12, 8), m.stoneSmooth, dark, [0, -.33, .74], [.12, .08, .08]);
}

function strandGeometry(theme: KitTheme): T.BufferGeometry {
 const parts: T.BufferGeometry[] = [];
 const top = new T.Color(theme.moss), mid = new T.Color(theme.sakura ? theme.blossom[1] : theme.grass[0]), tip = new T.Color(theme.sakura ? theme.blossom[2] : theme.grass[1]);
 for (let k = 0; k < 3; k++) {
  const g = new T.ConeGeometry(.42 - k * .08, 1, 6, 6, false); g.rotateX(Math.PI); g.translate((k - 1) * .35, -.5 - k * .04, (k % 2) * .2 - .1);
  g.scale(1, 1 - k * .18, 1);
  const pos = g.getAttribute('position') as T.BufferAttribute;
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); pos.setX(i, pos.getX(i) * (1 + .25 * Math.sin(y * 9 + k))); }
  g.deleteAttribute('uv');
  const arr = new Float32Array(pos.count * 3), c = new T.Color();
  for (let i = 0; i < pos.count; i++) { const v = T.MathUtils.clamp(-pos.getY(i), 0, 1); c.copy(top).lerp(mid, T.MathUtils.smoothstep(v, .05, .45)).lerp(tip, T.MathUtils.smoothstep(v, .6, 1)); arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new T.BufferAttribute(arr, 3));
  parts.push(g.toNonIndexed()); g.dispose();
 }
 const g = mergeGeometries(parts, false)!; parts.forEach(x => x.dispose()); g.computeVertexNormals(); return g;
}
function mistTexture() {
 return canvasTex(64, 64, x => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(.5, 'rgba(255,255,255,.18)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); }, true);
}

// ---------------------------------------------------------------- crystal shrines
function pointedArchShape(w: number, hs: number, apex: number, inset: number): T.Shape {
 const half = w / 2, s = new T.Shape();
 s.moveTo(-half, 0); s.lineTo(half, 0); s.lineTo(half, hs);
 s.quadraticCurveTo(half, hs + (apex - hs) * .78, 0, apex);
 s.quadraticCurveTo(-half, hs + (apex - hs) * .78, -half, hs);
 s.lineTo(-half, 0);
 if (inset > 0) {
  const ih = half - inset, iap = apex - inset * 1.6;
  const hole = new T.Path();
  hole.moveTo(-ih, inset); hole.lineTo(ih, inset); hole.lineTo(ih, hs);
  hole.quadraticCurveTo(ih, hs + (iap - hs) * .78, 0, iap); hole.quadraticCurveTo(-ih, hs + (iap - hs) * .78, -ih, hs); hole.lineTo(-ih, inset);
  s.holes.push(hole);
 }
 return s;
}
function flameBlade(h: number, w: number): T.BufferGeometry {
 const s = new T.Shape();
 s.moveTo(0, 0);
 s.bezierCurveTo(w * .55, h * .08, w * .62, h * .45, w * .18, h * .78);
 s.bezierCurveTo(w * .05, h * .9, w * .12, h * .96, 0, h);
 s.bezierCurveTo(-w * .32, h * .82, -w * .5, h * .5, -w * .36, h * .22);
 s.bezierCurveTo(-w * .3, h * .1, -w * .15, h * .02, 0, 0);
 const g = new T.ExtrudeGeometry(s, {depth: w * .18, bevelEnabled: true, bevelSize: w * .12, bevelThickness: w * .14, bevelSegments: 3, curveSegments: 18});
 g.translate(0, 0, -w * .09);
 return g;
}
function shrine(batch: Batch, m: Mats, theme: KitTheme, p: T.Vector3, yaw: number, sc: number) {
 const M = new T.Matrix4().compose(p, new T.Quaternion().setFromEuler(new T.Euler(0, yaw, 0)), new T.Vector3(sc, sc, sc));
 const frame = new T.ExtrudeGeometry(pointedArchShape(5.2, 6.2, 10.4, .75), {depth: 1.1, bevelEnabled: true, bevelSize: .18, bevelThickness: .18, bevelSegments: 2, curveSegments: 16});
 frame.translate(0, 1.1, -.55); frame.applyMatrix4(M);
 batch.add(frame, m.stone, undefined, new T.Color(theme.stoneDark).lerp(tmpC.set(theme.stone), .45));
 const plinth = new RoundedBoxGeometry(6.4, 1.2, 2.6, 2, .25); plinth.translate(0, .5, 0); plinth.applyMatrix4(M);
 batch.add(plinth, m.stoneSmooth, undefined, new T.Color(theme.stone));
 const blades: [number, number, number, number, number][] = [[0, 8.6, 2.6, 0, 0], [-1.25, 5.2, 1.5, -.18, .3], [1.3, 6.0, 1.6, .2, -.25]];
 for (const [bx, h, w, lean, tw] of blades) {
  const g = flameBlade(h, w);
  const pos = g.getAttribute('position') as T.BufferAttribute;
  const cols = new Float32Array(pos.count * 3), c = new T.Color();
  const [c0, c1, c2] = theme.crystal.map(x => new T.Color(x));
  for (let i = 0; i < pos.count; i++) {
   const v = T.MathUtils.clamp(pos.getY(i) / h, 0, 1);
   c.copy(c0).lerp(c1, T.MathUtils.smoothstep(v, 0, .55)).lerp(c2, T.MathUtils.smoothstep(v, .62, 1));
   cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new T.BufferAttribute(cols, 3));
  g.applyMatrix4(new T.Matrix4().compose(new T.Vector3(bx, 1.15, .1), new T.Quaternion().setFromEuler(new T.Euler(0, tw, lean)), new T.Vector3(1, 1, 1)).premultiply(M));
  batch.add(g, m.crystal);
 }
}

// ---------------------------------------------------------------- sakura / canopy trees
function taperedTube(pts: T.Vector3[], r0: number, r1: number, radial = 7, tubular = 10): T.BufferGeometry {
 const curve = new T.CatmullRomCurve3(pts);
 const frames = curve.computeFrenetFrames(tubular, false);
 const pos: number[] = [], idx: number[] = [];
 for (let i = 0; i <= tubular; i++) {
  const u = i / tubular, c = curve.getPointAt(u), r = r0 + (r1 - r0) * u;
  for (let k = 0; k <= radial; k++) {
   const a = k / radial * Math.PI * 2;
   const n = frames.normals[i].clone().multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i], Math.sin(a));
   const rr = r * (1 + .12 * Math.sin(a * 3 + i));
   pos.push(c.x + n.x * rr, c.y + n.y * rr, c.z + n.z * rr);
  }
  if (i < tubular) for (let k = 0; k < radial; k++) { const a = i * (radial + 1) + k, b = a + radial + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
 }
 const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
 return g;
}
interface TreeVariant { trunk: T.BufferGeometry; canopy: T.BufferGeometry; }
function treeVariant(seed: number, theme: KitTheme): TreeVariant {
 const r = rng(seed * 31 + 7);
 const trunks: T.BufferGeometry[] = [], canopies: T.BufferGeometry[] = [];
 const [b0, b1, b2] = theme.blossom.map(c => new T.Color(c));
 const bark = new T.Color(theme.trunk);
 const tipClusters: T.Vector3[] = [];
 const lean = new T.Vector3(.35 + r() * .9, 0, (r() - .5) * .5);
 const top = new T.Vector3(lean.x, 3.4 + r() * .8, lean.z);
 trunks.push(taperedTube([new T.Vector3(0, -.4, 0), new T.Vector3(lean.x * .2 + (r() - .5) * .4, 1.3, lean.z * .2), new T.Vector3(lean.x * .7, 2.5, lean.z * .7), top], .46, .2, 8, 10));
 const branches = 4 + Math.floor(r() * 2);
 for (let i = 0; i < branches; i++) {
  const a = i / branches * Math.PI * 2 + r() * .8;
  const len = 2.2 + r() * 1.6;
  const mid = top.clone().add(new T.Vector3(Math.cos(a) * len * .5, .7 + r() * .6, Math.sin(a) * len * .5));
  const tip = top.clone().add(new T.Vector3(Math.cos(a) * len, 1 + r() * 1.3, Math.sin(a) * len));
  trunks.push(taperedTube([top.clone().add(new T.Vector3(0, -.4, 0)), mid, tip], .2, .07, 6, 6));
  tipClusters.push(tip);
  // twig
  const a2 = a + (r() - .5) * 1.4;
  const twig = mid.clone().add(new T.Vector3(Math.cos(a2) * 1.3, 1 + r() * .6, Math.sin(a2) * 1.3));
  trunks.push(taperedTube([mid, twig], .09, .04, 5, 4));
  tipClusters.push(twig);
 }
 tipClusters.push(top.clone().add(new T.Vector3(0, 1.8, 0)));
 for (const tip of tipClusters) {
  const n = 1 + Math.floor(r() * 2);
  for (let k = 0; k < n; k++) {
   const ico = new T.IcosahedronGeometry(1, 1); ico.deleteAttribute('uv'); ico.deleteAttribute('normal');
   const s = mergeVertices(ico); ico.dispose();
   const rad = 1.1 + r() * .9;
   const off = new T.Vector3((r() - .5) * 1.6, (r() - .3) * .8, (r() - .5) * 1.6);
   const pos = s.getAttribute('position') as T.BufferAttribute;
   for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const kk = 1 + .28 * fbm(x * 1.7 + seed + k, y * 1.7, z * 1.7 + tip.x, 3);
    pos.setXYZ(i, tip.x + off.x + x * rad * kk * 1.15, tip.y + off.y + y * rad * kk * .78, tip.z + off.z + z * rad * kk * 1.15);
   }
   s.computeVertexNormals();
   const cols = new Float32Array(pos.count * 3), c = new T.Color(), nrm = s.getAttribute('normal') as T.BufferAttribute;
   for (let i = 0; i < pos.count; i++) {
    const up = nrm.getY(i) * .5 + .5, sparkle = vnoise(pos.getX(i) * 3, pos.getY(i) * 3, pos.getZ(i) * 3);
    c.copy(b0).lerp(b1, T.MathUtils.smoothstep(up, .15, .6)).lerp(b2, T.MathUtils.smoothstep(up + sparkle * .35, .75, 1.15));
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
   }
   s.setAttribute('color', new T.BufferAttribute(cols, 3));
   s.deleteAttribute('uv');
   canopies.push(s);
  }
 }
 for (const t of trunks) {
  const pos = t.getAttribute('position') as T.BufferAttribute, cols = new Float32Array(pos.count * 3), c = new T.Color();
  for (let i = 0; i < pos.count; i++) { c.copy(bark).multiplyScalar(.7 + T.MathUtils.clamp(pos.getY(i) / 6, 0, .5)); cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b; }
  t.setAttribute('color', new T.BufferAttribute(cols, 3));
 }
 const trunk = mergeGeometries(trunks, false)!; trunks.forEach(g => g.dispose());
 const canopy = mergeGeometries(canopies, false)!; canopies.forEach(g => g.dispose());
 return {trunk, canopy};
}

// ---------------------------------------------------------------- themed grove variants (palm / pine / charred)
function colorize(g: T.BufferGeometry, fn: (p: T.Vector3, n: T.Vector3, out: T.Color) => void) {
 const pos = g.getAttribute('position') as T.BufferAttribute, nrm = g.getAttribute('normal') as T.BufferAttribute;
 const arr = new Float32Array(pos.count * 3), p = new T.Vector3(), n = new T.Vector3(), c = new T.Color();
 for (let i = 0; i < pos.count; i++) { p.fromBufferAttribute(pos, i); n.fromBufferAttribute(nrm, i); fn(p, n, c); arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
 g.setAttribute('color', new T.BufferAttribute(arr, 3));
}
/** non-indexed, position/normal only, so every part of a variant merges cleanly */
function plain(g: T.BufferGeometry) { const n = g.index ? g.toNonIndexed() : g; if (n !== g) g.dispose(); for (const k of Object.keys(n.attributes)) if (k !== 'position') n.deleteAttribute(k); n.computeVertexNormals(); return n; }
function mergeAll(parts: T.BufferGeometry[]) { const g = mergeGeometries(parts, false)!; parts.forEach(p => p.dispose()); return g; }

/** Oasis palm: ringed, leaning trunk; a crown of drooping, folded fronds; a date cluster. */
function palmVariant(seed: number, theme: KitTheme): TreeVariant {
 const r = rng(seed * 37 + 11);
 const la = r() * Math.PI * 2, lean = 1.2 + r() * 1.6, H = 6.4 + r() * 1.8;
 const lx = Math.cos(la) * lean, lz = Math.sin(la) * lean;
 const top = new T.Vector3(lx, H, lz);
 const trunk = plain(taperedTube([new T.Vector3(0, -.4, 0), new T.Vector3(lx * .12, H * .35, lz * .12), new T.Vector3(lx * .5, H * .7, lz * .5), top], .46, .24, 8, 16));
 const bark = new T.Color(theme.trunk).lerp(tmpC.set('#8a6a44'), .5);
 colorize(trunk, (p, _n, out) => out.copy(bark).multiplyScalar(.62 + .38 * (Math.sin(p.y * 6.5) > .2 ? 1 : 0) + .1 * Math.min(1, p.y / H)));
 const fronds: T.BufferGeometry[] = [];
 const base = new T.Color('#3b6a22'), mid = new T.Color('#6b9a30'), tip = new T.Color('#b9c95a');
 const N = 9 + Math.floor(r() * 3);
 for (let k = 0; k < N; k++) {
  const az = k / N * Math.PI * 2 + r() * .35, L = 3.8 + r() * 1.3, rise = .55 + r() * .5, sag = 1.5 + r() * .6;
  const dx = Math.cos(az), dz = Math.sin(az), px = -dz, pz = dx;
  const segs = 9, pos: number[] = [], cols: number[] = [];
  const mid0: T.Vector3[] = [], half: number[] = [];
  for (let j = 0; j <= segs; j++) {
   const u = j / segs, d = L * u;
   mid0.push(new T.Vector3(top.x + dx * d, top.y + .25 + rise * d * (1 - u) - sag * u * u * L * .45, top.z + dz * d));
   half.push(.06 + .62 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.1)), .7));
  }
  for (let j = 0; j < segs; j++) {
   const a = mid0[j], b = mid0[j + 1];
   // folded leaf: the edges hang lower than the spine
   const ea = [a.x + px * half[j], a.y - half[j] * .45, a.z + pz * half[j]], eb = [b.x + px * half[j + 1], b.y - half[j + 1] * .45, b.z + pz * half[j + 1]];
   const fa = [a.x - px * half[j], a.y - half[j] * .45, a.z - pz * half[j]], fb = [b.x - px * half[j + 1], b.y - half[j + 1] * .45, b.z - pz * half[j + 1]];
   const quads = [[a.toArray(), b.toArray(), ea, eb], [fa, fb, a.toArray(), b.toArray()]];
   for (const [p0, p1, p2, p3] of quads) {
    pos.push(...p0, ...p2, ...p1, ...p1, ...p2, ...p3); // top
    pos.push(...p0, ...p1, ...p2, ...p1, ...p3, ...p2); // underside
   }
   const c0 = new T.Color().copy(base).lerp(mid, Math.min(1, j / segs * 1.6)).lerp(tip, Math.max(0, j / segs - .55) * 2.2);
   for (let q = 0; q < 24; q++) cols.push(c0.r, c0.g, c0.b);
  }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  g.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
  fronds.push(g);
 }
 const dates = new T.Color('#d9822b');
 for (let k = 0; k < 3; k++) {
  const s = plain(new T.IcosahedronGeometry(.42, 1)); s.translate(top.x + Math.cos(k * 2.1) * .5, top.y - .35, top.z + Math.sin(k * 2.1) * .5);
  colorize(s, (_p, n, out) => out.copy(dates).multiplyScalar(.75 + n.y * .25)); fronds.push(s);
 }
 return {trunk: mergeAll([trunk]), canopy: mergeAll(fronds)};
}

/** Frosted fir: stacked jagged tiers, deep teal needles with snow on every up-facing shelf. */
function pineVariant(seed: number, theme: KitTheme): TreeVariant {
 const r = rng(seed * 41 + 3);
 const H = 7 + r() * 2.5;
 const trunk = plain(taperedTube([new T.Vector3(0, -.4, 0), new T.Vector3((r() - .5) * .3, H * .5, (r() - .5) * .3), new T.Vector3(0, H * .9, 0)], .4, .1, 7, 8));
 const bark = new T.Color(theme.trunk);
 colorize(trunk, (p, _n, out) => out.copy(bark).multiplyScalar(.7 + .3 * Math.min(1, p.y / H)));
 const tiers: T.BufferGeometry[] = [];
 const needle = new T.Color('#1f4d4b'), needle2 = new T.Color('#2f6a5e'), snow = new T.Color('#f4fbff');
 const T0 = 5;
 for (let k = 0; k < T0; k++) {
  const u = k / T0, rad = 3.1 * (1 - u * .78) + .25, h = 2.6 - u * .8, y0 = 1.3 + u * (H - 2.4);
  const g = new T.ConeGeometry(rad, h, 11, 2, false);
  const pos = g.getAttribute('position') as T.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
   const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
   if (y < -h / 2 + .01) { const a = Math.atan2(z, x), j = 1 + .2 * Math.sin(a * 5 + k * 1.7 + seed); pos.setXYZ(i, x * j, y - .35 * (j - .8), z * j); }
  }
  g.translate((r() - .5) * .25, y0 + h / 2, (r() - .5) * .25);
  const n = plain(g);
  // cone sides already face ~40° up, so snow keys off a patchy noise mask on the shelf tops, not the slope alone
  colorize(n, (p, nn, out) => {
   out.copy(needle).lerp(needle2, vnoise(p.x * 2 + seed, p.y * 2, p.z * 2)).multiplyScalar(.7 + .3 * Math.min(1, p.y / H));
   const shelf = T.MathUtils.smoothstep(p.y - (y0 + h * .35), 0, h * .5);
   out.lerp(snow, T.MathUtils.smoothstep(vnoise(p.x * 1.6 + seed, p.y * 1.2, p.z * 1.6) * shelf * Math.max(0, nn.y), .3, .5));
  });
  tiers.push(n);
 }
 return {trunk: mergeAll([trunk]), canopy: mergeAll(tiers)};
}

/** Charred ridge tree: twisted black limbs ending in glowing ember buds (lit by the leaf material). */
function charredVariant(seed: number, theme: KitTheme): TreeVariant {
 const r = rng(seed * 53 + 9);
 const limbs: T.BufferGeometry[] = [], buds: T.BufferGeometry[] = [];
 const top = new T.Vector3((r() - .5) * 1.2, 3.6 + r() * 1.2, (r() - .5) * 1.2);
 limbs.push(plain(taperedTube([new T.Vector3(0, -.4, 0), new T.Vector3((r() - .5) * .7, 1.5, (r() - .5) * .7), new T.Vector3(top.x * .6, 2.7, top.z * .6), top], .5, .16, 7, 10)));
 const tips: T.Vector3[] = [top.clone().add(new T.Vector3(0, 1.4, 0))];
 const B = 4 + Math.floor(r() * 3);
 for (let i = 0; i < B; i++) {
  const a = i / B * Math.PI * 2 + r() * .7, len = 1.8 + r() * 1.8;
  const from = top.clone().add(new T.Vector3(0, -.3 - r() * 1.2, 0));
  const mid = from.clone().add(new T.Vector3(Math.cos(a) * len * .5, .4 + r() * .8, Math.sin(a) * len * .5));
  const tip = from.clone().add(new T.Vector3(Math.cos(a + (r() - .5) * .8) * len, .2 + r() * 1.6, Math.sin(a + (r() - .5) * .8) * len));
  limbs.push(plain(taperedTube([from, mid, tip], .17, .04, 5, 6)));
  tips.push(tip, mid.clone().lerp(tip, .5));
 }
 const char = new T.Color(theme.trunk).lerp(tmpC.set('#000000'), .2), crack = new T.Color('#ff5a1a');
 for (const g of limbs) colorize(g, (p, _n, out) => out.copy(char).lerp(crack, T.MathUtils.smoothstep(vnoise(p.x * 3.5 + seed, p.y * 2.2, p.z * 3.5), .78, .92) * .5));
 const hot = new T.Color('#ff7a1a'), white = new T.Color('#ffd27a'), ash = new T.Color('#1d1515');
 for (const t of tips) {
  const n = 2 + Math.floor(r() * 3);
  for (let k = 0; k < n; k++) {
   const s = plain(new T.OctahedronGeometry(.22 + r() * .26, 0));
   s.scale(1, 1.5 + r() * .8, 1); s.translate(t.x + (r() - .5) * .7, t.y + (r() - .2) * .5, t.z + (r() - .5) * .7);
   const ember = r() > .25;
   colorize(s, (_p, nn, out) => ember ? out.copy(hot).lerp(white, Math.max(0, nn.y)) : out.copy(ash));
   buds.push(s);
  }
 }
 return {trunk: mergeAll(limbs), canopy: mergeAll(buds)};
}

function groveVariant(seed: number, theme: KitTheme): TreeVariant {
 switch (theme.grove) {
  case 'palm': return palmVariant(seed, theme);
  case 'pine': return pineVariant(seed, theme);
  case 'charred': return charredVariant(seed, theme);
  default: return treeVariant(seed, theme);
 }
}
/** XZ half-size of a grove tree at scale 1 (canopy spread), for ensureOffTrackXZ */
const GROVE_HALF: Record<NonNullable<KitTheme['grove']>, number> = {jungle: 6.6, coral: 6.6, palm: 7.6, pine: 3.5, charred: 5.4};

export interface KitForest { add(x: number, y: number, z: number, scale: number, seed: number, yaw?: number): void; count(): number; }
function makeForest(theme: KitTheme, m: Mats): KitForest & {flush(parent: T.Object3D, disposables: {dispose(): void}[]): void} {
 const lists: T.Matrix4[][] = [[], [], [], []];
 const petals: T.Matrix4[] = [];
 return {
  add(x, y, z, scale, seed, yaw) {
   const q = new T.Quaternion().setFromEuler(new T.Euler(0, yaw ?? seed * 2.39, 0));
   lists[Math.abs(Math.floor(seed)) % 4].push(new T.Matrix4().compose(new T.Vector3(x, y, z), q, new T.Vector3(scale, scale, scale)));
   if (theme.sakura) petals.push(new T.Matrix4().compose(new T.Vector3(x, y + .06, z), new T.Quaternion().setFromEuler(new T.Euler(-Math.PI / 2, 0, seed)), new T.Vector3(scale * 3.4, scale * 3.4, 1)));
  },
  count() { return lists.reduce((s, l) => s + l.length, 0); },
  flush(parent, disposables) {
   lists.forEach((list, vi) => {
    if (!list.length) return;
    const v = groveVariant(vi + 1, theme); disposables.push(v.trunk, v.canopy);
    const tr = new T.InstancedMesh(v.trunk, m.trunk, list.length), cn = new T.InstancedMesh(v.canopy, m.leaf || m.canopy, list.length);
    list.forEach((mx, i) => { tr.setMatrixAt(i, mx); cn.setMatrixAt(i, mx); });
    for (const im of [tr, cn]) { im.castShadow = true; im.receiveShadow = true; im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); parent.add(im); }
   });
   if (petals.length) {
    const g = new T.PlaneGeometry(1, 1); disposables.push(g);
    const im = new T.InstancedMesh(g, m.petals, petals.length);
    petals.forEach((mx, i) => im.setMatrixAt(i, mx)); im.receiveShadow = true; im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); parent.add(im);
   }
  },
 };
}

// ---------------------------------------------------------------- rim shrubs
function bushGeometry(seed: number, cols: T.Color[]): T.BufferGeometry {
 const r = rng(seed * 7 + 1), parts: T.BufferGeometry[] = [];
 for (let k = 0; k < 3; k++) {
  const ico = new T.IcosahedronGeometry(1, 1); ico.deleteAttribute('uv'); ico.deleteAttribute('normal');
  const g = mergeVertices(ico); ico.dispose();
  const pos = g.getAttribute('position') as T.BufferAttribute;
  const ox = (k - 1) * .9, rad = .8 + r() * .5;
  for (let i = 0; i < pos.count; i++) {
   const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), kk = 1 + .3 * fbm(x * 2 + seed + k, y * 2, z * 2, 2);
   pos.setXYZ(i, ox + x * rad * kk, Math.max(-.2, y) * rad * kk * .75 + .2, z * rad * kk);
  }
  g.computeVertexNormals();
  const n = g.getAttribute('normal') as T.BufferAttribute, arr = new Float32Array(pos.count * 3), c = new T.Color();
  for (let i = 0; i < pos.count; i++) { const up = n.getY(i) * .5 + .5; c.copy(cols[0]).lerp(cols[1], T.MathUtils.smoothstep(up, .2, .7)).lerp(cols[2], T.MathUtils.smoothstep(up + vnoise(pos.getX(i) * 4, pos.getY(i) * 4, pos.getZ(i) * 4) * .3, .8, 1.2)); arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new T.BufferAttribute(arr, 3));
  parts.push(g);
 }
 const g = mergeGeometries(parts, false)!; parts.forEach(p => p.dispose()); return g;
}

// ---------------------------------------------------------------- horizon spires
function peakRing(batch: Batch, m: Mats, theme: KitTheme, count: number, rMin: number, rMax: number, baseY: number, seed: number) {
 const r = rng(seed);
 const haze = new T.Color(theme.haze);
 for (let i = 0; i < count; i++) {
  const a = i / count * Math.PI * 2 + r() * .2;
  const rad = rMin + r() * (rMax - rMin);
  const spikes = 2 + Math.floor(r() * 3);
  for (let s2 = 0; s2 < spikes; s2++) {
   const h = (s2 === 0 ? 90 + r() * 110 : 40 + r() * 70), w = (s2 === 0 ? 20 : 12) + r() * 18;
   const g = new T.ConeGeometry(w, h, 13, 14, true);
   const pos = g.getAttribute('position') as T.BufferAttribute;
   const tilt = (r() - .5) * .25;
   for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
    const ang = Math.atan2(z, x);
    const n = fbm(x * .05 + i * 7 + s2, y * .025, z * .05, 4);
    const ridge = 1 + .22 * Math.abs(Math.sin(ang * 5 + i + s2 * 2)) + n * .5;
    const step = 1 + .08 * Math.sign(Math.sin(y * .22 + n * 3));
    pos.setXYZ(k, x * ridge * step + (y + h / 2) * tilt, y, z * ridge * step);
   }
   const off = s2 === 0 ? 0 : (r() > .5 ? 1 : -1) * (w * .9 + r() * 14);
   const pa = a + off / rad, pr = rad + r() * 20;
   g.translate(Math.cos(pa) * pr, baseY + h / 2 - 6, Math.sin(pa) * pr);
   const ng = g.toNonIndexed(); g.dispose(); ng.computeVertexNormals();
   const hi = baseY + h;
   paintFaces(ng, (c, n, out) => {
    strataColor(theme, c, n, baseY, hi, out);
    out.lerp(haze, .38 + .22 * T.MathUtils.clamp((c.y - baseY) / h, 0, 1));
    if (theme.snowCaps && c.y > baseY + h * .62) out.lerp(tmpC.set('#ffffff'), .75);
   });
   batch.add(ng, m.peak);
  }
 }
}

// ---------------------------------------------------------------- track helpers
function trackSamples(id: CourseId, n = 360) { const s: T.Vector3[] = []; for (let i = 0; i < n; i++) s.push(trackFrame(i / n * .999, 0, id).position); return s; }
function clearance(samples: T.Vector3[], x: number, z: number) { let d = Infinity; for (const p of samples) d = Math.min(d, Math.hypot(p.x - x, p.z - z)); return d; }
function nearestTrackY(samples: T.Vector3[], x: number, z: number) { let d = Infinity, y = 0; for (const p of samples) { const k = Math.hypot(p.x - x, p.z - z); if (k < d) { d = k; y = p.y; } } return y; }

// ---------------------------------------------------------------- world scenery (called from gardenWorld3d)
export interface KitScenery { update(dt: number, time: number): void; forest: KitForest; flushForest(): void; stats: Record<string, number>; dispose(): void; }

export function buildKitScenery(scene: T.Scene, courseId: CourseId, heightAt: (x: number, z: number) => number, opts: {mountain?: boolean} = {}): KitScenery {
 const theme = worldTheme(courseId);
 const key = 'world-' + courseId + '-' + Math.random();
 const m = kitMats(theme, key);
 const root = new T.Group(); root.name = 'kith-kit-scenery'; scene.add(root);
 const disposables: {dispose(): void}[] = [];
 const batch = new Batch(), falls = new Batch(), far = new Batch();
 const samples = trackSamples(courseId);
 const r = rng(courseId.length * 977 + 3);
 const forest = makeForest(theme, m);
 const def = courseById(courseId);
 const bushes: T.Matrix4[] = [];
 const mist: T.Vector3[] = [], strands: T.Matrix4[] = [];
 mistSink = mist; strandSink = strands;
 let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
 for (const p of samples) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
 const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, span = Math.max(maxX - minX, maxZ - minZ) / 2;
 const centre = new T.Vector2(cx, cz);
 let massifCount = 0, viaductCount = 0, shrineCount = 0;
 const placed: {x: number; z: number; r: number}[] = [];
 // every upgraded world also has to pass the shared road-clearance rule at its true half-size, unmoved
 // (Crestfall keeps its benchmarked layout, which the looser sample-clearance check already holds)
 const strict = courseId !== 'crestfall-gardens';
 const offRoad = (x: number, z: number, half: number) => { if (!strict) return true; const q = ensureOffTrackXZ(x, z, half, courseId); return q.safe && Math.hypot(q.x - x, q.z - z) < .01; };
 const free = (x: number, z: number, rad: number, clear: number) => clearance(samples, x, z) > rad + clear && placed.every(p => Math.hypot(p.x - x, p.z - z) > p.r + rad + 4) && offRoad(x, z, rad * 1.1);
 const mtn = !!opts.mountain;

 if (!mtn || theme.mountainKit) {
  // ---- near cliffs crowding the outside of the road, each with a carved Kith mask watching the racers
  for (let i = 0, tries = 0; i < (theme.masks || 0) && tries < 300; tries++) {
   const t = r(), side = r() > .5 ? 1 : -1;
   if (isGapAt(t, courseId)) continue;
   const R = 13 + r() * 6;
   const p = worldPoint(t, side * (130 + R * 4.2 + r() * 50), 0, courseId);
   if (Math.abs(p.x) > 320 || Math.abs(p.z) > 320) continue;
   if (!free(p.x, p.z, R * 1.25, 14)) continue;
   const H = 42 + r() * 22;
   const gy = mtn ? heightAt(p.x, p.z) - 1 : Math.min(heightAt(p.x, p.z), p.y + 1);
   // face the nearest stretch of road
   let best = samples[0], bd = Infinity; for (const q of samples) { const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd) { bd = d; best = q; } }
   const dir = new T.Vector2(best.x - p.x, best.z - p.z).normalize();
   const yaw = Math.atan2(dir.x, dir.y);
   // the carved head juts out of the cliff toward the road: its own footprint (ears + crown ≈ 1.25 s) must clear it too
   if (!offRoad(p.x + dir.x * R * .86, p.z + dir.y * R * .86, R * .42 * 1.25)) continue;
   const out = massif(batch, m, theme, p.x, gy, p.z, R, H, 900 + i * 7, falls, centre);
   placed.push({x: p.x, z: p.z, r: R * 1.25});
   kithMask(batch, m, theme, new T.Vector3(p.x + dir.x * R * .86, gy + H * .3, p.z + dir.y * R * .86), yaw, R * .42);
   for (const tt of out.terraces) for (let k = 0; k < 2; k++) { const ta = r() * 6.28, tr = Math.sqrt(r()) * tt.r * .7; forest.add(tt.x + Math.cos(ta) * tr, tt.y - .6, tt.z + Math.sin(ta) * tr, .9 + r() * .5, i * 3 + k); }
   massifCount++; i++;
  }
  // ---- curved viaduct roads sweeping across the mid-distance
  for (let i = 0, tries = 0; !mtn && i < (theme.arcs || 0) && tries < 160; tries++) {
   const a0 = r() * Math.PI * 2, rad = span + 34 + r() * 40, ext = .55 + r() * .4, dirn = r() > .5 ? 1 : -1;
   const n = Math.max(4, Math.round(rad * ext / 22));
   const pts: T.Vector3[] = [];
   let ok = true;
   for (let k = 0; k <= n && ok; k++) {
    const a = a0 + dirn * ext * k / n, rr = rad + Math.sin(k / n * Math.PI) * 18;
    const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
    ok = Math.abs(x) < 318 && Math.abs(z) < 318 && clearance(samples, x, z) > 26 && placed.every(q => Math.hypot(q.x - x, q.z - z) > q.r + 6) && offRoad(x, z, k === 0 || k === n ? 23 : 4.5);
    pts.push(new T.Vector3(x, 0, z));
   }
   if (!ok) continue;
   const g0 = Math.min(...pts.map(q => heightAt(q.x, q.z)));
   const deck = g0 + 20 + r() * 10;
   pts.forEach((q, k) => q.y = deck + Math.sin(k / n * Math.PI) * 4);
   curvedViaduct(batch, m, theme, pts, heightAt, falls);
   for (const P of [pts[0], pts[n]]) {
    const R = 11 + r() * 5;
    massif(batch, m, theme, P.x, Math.min(heightAt(P.x, P.z), g0), P.z, R, P.y - g0 + 12, 700 + i * 13 + (P === pts[0] ? 1 : 2), falls, centre);
    placed.push({x: P.x, z: P.z, r: R * 1.3});
   }
   pts.forEach(q => placed.push({x: q.x, z: q.z, r: 6}));
   viaductCount++; i++;
  }
  // ---- cliff massifs: an outer ring that frames the circuit, plus a few infield landmarks
  for (let i = 0, tries = 0; i < theme.massifs && tries < theme.massifs * 14; tries++) {
   const outer = i < theme.massifs * .78;
   const a = r() * Math.PI * 2;
   const rad = outer ? span + 30 + r() * 120 : r() * span * .7;
   const R = outer ? 18 + r() * 24 : 10 + r() * 9;
   const x = cx + Math.cos(a) * rad, z = cz + Math.sin(a) * rad;
   if (Math.abs(x) > 330 || Math.abs(z) > 330) continue;
   if (!free(x, z, R * 1.3, outer ? 26 : 22)) continue;
   const H = outer ? 30 + r() * 55 : 16 + r() * 18;
   const gy = mtn ? heightAt(x, z) - 1 : Math.min(heightAt(x, z), nearestTrackY(samples, x, z) + 2);
   const out = massif(batch, m, theme, x, gy, z, R, H, i * 17 + 3, falls, centre);
   placed.push({x, z, r: R * 1.3});
   for (const t of out.terraces) {
    for (const p of t.rim) if (r() < .8) bushes.push(new T.Matrix4().compose(new T.Vector3(p.x + (cx - p.x) * .04, p.y - .3, p.z + (cz - p.z) * .04), new T.Quaternion().setFromEuler(new T.Euler(0, r() * 6.28, 0)), new T.Vector3(1, 1, 1).multiplyScalar(1 + r() * 1.3)));
    if (theme.sakura || theme.grassCaps || theme.grove) {
     const n = Math.max(1, Math.round(t.r / 6));
     for (let k = 0; k < n; k++) { const ta = r() * Math.PI * 2, tr = Math.sqrt(r()) * t.r * .8; forest.add(t.x + Math.cos(ta) * tr, t.y - .6, t.z + Math.sin(ta) * tr, .7 + r() * .5, i * 5 + k); }
    }
   }
   if (theme.shrines && r() < .45) shrine(batch, m, theme, new T.Vector3(out.terraces[out.terraces.length - 1].x, out.top + .2, out.terraces[out.terraces.length - 1].z), Math.atan2(cx - x, cz - z), .8 + r() * .4);
   massifCount++; i++;
  }
  // ---- stone viaducts spanning the valleys between massifs
  for (let i = 0, tries = 0; !mtn && i < theme.viaducts && tries < 120; tries++) {
   const a = r() * Math.PI * 2, rad = span + 50 + r() * 70;
   const len = 60 + r() * 50;
   const tang = a + Math.PI / 2;
   const mx = cx + Math.cos(a) * rad, mz = cz + Math.sin(a) * rad;
   const A = new T.Vector3(mx - Math.cos(tang) * len / 2, 0, mz - Math.sin(tang) * len / 2), B = new T.Vector3(mx + Math.cos(tang) * len / 2, 0, mz + Math.sin(tang) * len / 2);
   if ([A, B].some(p => Math.abs(p.x) > 320 || Math.abs(p.z) > 320)) continue;
   let ok = true;
   for (let k = 0; k <= 8 && ok; k++) { const u = k / 8; const px = A.x + (B.x - A.x) * u, pz = A.z + (B.z - A.z) * u; ok = clearance(samples, px, pz) > 30 && placed.every(p => Math.hypot(p.x - px, p.z - pz) > p.r - 2 || k === 0 || k === 8) && offRoad(px, pz, k === 0 || k === 8 ? 25 : 4.5); }
   if (!ok) continue;
   const gy = Math.min(heightAt(mx, mz), heightAt(A.x, A.z), heightAt(B.x, B.z)) - 1;
   const deck = gy + 22 + r() * 18;
   A.y = B.y = deck;
   viaduct(batch, m, theme, A, B, gy, falls);
   // anchor each end in a cliff
   for (const P of [A, B]) {
    const R = 12 + r() * 6;
    massif(batch, m, theme, P.x, Math.min(heightAt(P.x, P.z), gy + 1), P.z, R, deck - gy + 10, i * 31 + (P === A ? 1 : 2), falls, centre);
    placed.push({x: P.x, z: P.z, r: R * 1.3});
   }
   placed.push({x: mx, z: mz, r: len / 2});
   viaductCount++; i++;
  }
  // ---- crystal shrines on the valley floor beside the road
  for (let i = 0, tries = 0; i < theme.shrines && tries < 200; tries++) {
   const t = r(), side = r() > .5 ? 1 : -1;
   if (isGapAt(t, courseId)) continue;
   const lane = side * (88 + r() * 40);
   const p = worldPoint(t, lane, 0, courseId);
   if (!free(p.x, p.z, 4, 14)) continue;
   const f = trackFrame(t, 0, courseId);
   const y = mtn ? heightAt(p.x, p.z) : Math.min(heightAt(p.x, p.z), p.y);
   shrine(batch, m, theme, new T.Vector3(p.x, y - .6, p.z), Math.atan2(f.tangent.x, f.tangent.z) + Math.PI / 2 * side, 1 + r() * .35);
   placed.push({x: p.x, z: p.z, r: 5}); shrineCount++; i++;
  }
  // ---- horizon spires
  if (theme.peaks) {
   const fy = Math.min(...samples.map(p => p.y)) - 18;
   peakRing(far, m, theme, theme.peaks, 380, 470, fy, courseId.length * 13);
  }
  // ---- sakura groves leaning over the road (overhanging canopies, like the key art)
  if (theme.sakura) {
   for (let i = 0; i < 70; i++) {
    const t = i / 70 + r() * .006, side = i % 2 ? 1 : -1;
    if (isGapAt(t, courseId) || def.tunnels.some(z => t > z.startT - .01 && t < z.endT + .01) || courseMorphs(courseId).some(z => t > z.startT - .015 && t < z.endT + .015)) continue;
    const p = worldPoint(t, side * (84 + r() * 18), 0, courseId);
    if (clearance(samples, p.x, p.z) < 15) continue;
    const f = trackFrame(t, 0, courseId);
    const yaw = Math.atan2(side * f.right.z, -side * f.right.x);
    forest.add(p.x, Math.min(heightAt(p.x, p.z), p.y) - .3, p.z, 1.15 + r() * .5, i + 1, yaw);
   }
  }
  // ---- themed groves lining the road: jungle giants, coral trees, oasis palms, frosted firs, charred ember trees.
  // Clumps of 1-3 just outside the rail, each tree cleared at its full canopy half-size.
  if (theme.grove && theme.groveCount) {
   const half = GROVE_HALF[theme.grove], n = theme.groveCount;
   const leans = theme.grove === 'palm' || theme.grove === 'jungle' || theme.grove === 'coral';
   for (let i = 0; i < n; i++) {
    const t = i / n + r() * .006, side = i % 2 ? 1 : -1;
    if (isGapAt(t, courseId) || def.tunnels.some(z => t > z.startT - .01 && t < z.endT + .01) || courseMorphs(courseId).some(z => t > z.startT - .015 && t < z.endT + .015)) continue;
    const f = trackFrame(t, 0, courseId);
    const clump = 1 + Math.floor(r() * 3);
    for (let k = 0; k < clump; k++) {
     const sc = (theme.grove === 'pine' ? 1 + r() * .55 : theme.grove === 'palm' ? 1.35 + r() * .5 : .95 + r() * .4) * (k ? .85 : 1);
     const p = worldPoint(t + (r() - .5) * .004, side * (100 + half * sc * 5 + k * 34 + r() * 20), 0, courseId);
     if (Math.abs(p.x) > 330 || Math.abs(p.z) > 330) continue;
     if (!offRoad(p.x, p.z, half * sc) || !placed.every(q => Math.hypot(q.x - p.x, q.z - p.z) > q.r + 2)) continue;
     const yaw = leans ? Math.atan2(side * f.right.z, -side * f.right.x) + (r() - .5) * .6 : r() * 6.28;
     forest.add(p.x, heightAt(p.x, p.z) - .3, p.z, sc, i * 3 + k + 1, yaw);
    }
   }
  }
 }

 batch.flush(root, disposables);
 falls.flush(root, disposables, false);
 far.flush(root, disposables, false);
 mistSink = null; strandSink = null;
 if (strands.length) {
  const g = strandGeometry(theme); disposables.push(g);
  const im = new T.InstancedMesh(g, m.canopy, strands.length);
  strands.forEach((mx, i) => im.setMatrixAt(i, mx)); im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.castShadow = true; im.receiveShadow = true; root.add(im);
 }
 if (mist.length) {
  const g = new T.BufferGeometry().setFromPoints(mist); disposables.push(g);
  const tex = mistTexture(); disposables.push(tex);
  const FK = FALLS[fallsKind(theme)];
  const pm = new T.PointsMaterial({map: tex, size: 16, sizeAttenuation: true, transparent: true, depthWrite: false, opacity: FK.mistOp, color: FK.mist}); disposables.push(pm);
  root.add(new T.Points(g, pm));
 }
 if (bushes.length) {
  const green = [new T.Color(theme.moss), new T.Color(theme.grass[0]), new T.Color(theme.grass[1])];
  const bloom = theme.blossom.map(c => new T.Color(c));
  const variants = [bushGeometry(1, green), bushGeometry(2, theme.sakura ? bloom : green), bushGeometry(3, green)];
  variants.forEach((g, vi) => {
   const list = bushes.filter((_, i) => i % 3 === vi);
   if (!list.length) return;
   const im = new T.InstancedMesh(g, m.canopy, list.length);
   list.forEach((mx, i) => im.setMatrixAt(i, mx)); im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.castShadow = true; im.receiveShadow = true;
   root.add(im); disposables.push(g);
  });
 }
 return {
  forest,
  flushForest() { (forest as ReturnType<typeof makeForest>).flush(root, disposables); },
  update(dt, time) { m.time.value = time; m.waterMap.offset.y += dt * FALLS[fallsKind(theme)].flow; },
  stats: {massifs: massifCount, viaducts: viaductCount, shrines: shrineCount, trees: forest.count()},
  dispose() { root.removeFromParent(); disposables.forEach(d => d.dispose()); releaseMats(key); },
 };
}

// ---------------------------------------------------------------- road dressing (called from trackFeatures3d)
function frameMatrix(f: ReturnType<typeof trackFrame>, p: T.Vector3, scale = 1) {
 const b = new T.Matrix4().makeBasis(f.right, f.normal, f.tangent);
 return new T.Matrix4().compose(p, new T.Quaternion().setFromRotationMatrix(b), new T.Vector3(scale, scale, scale));
}
/** Closed box swept along the road edge between y0..y1 (along the road normal), half-width hw across. */
function sweptBox(id: CourseId, t0: number, t1: number, lane: number, y0: number, y1: number, hw: number, steps: number): T.BufferGeometry {
 const rings: T.Vector3[][] = [];
 for (let i = 0; i <= steps; i++) {
  const t = t0 + (t1 - t0) * i / steps, f = trackFrame(t, lane, id);
  rings.push([[-hw, y0], [hw, y0], [hw, y1], [-hw, y1]].map(([x, y]) => f.position.clone().addScaledVector(f.right, x).addScaledVector(f.normal, y)));
 }
 const pos: number[] = [];
 const q = (a: T.Vector3, b: T.Vector3, c: T.Vector3, d: T.Vector3) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
 for (let i = 0; i < steps; i++) for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; q(rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]); }
 for (const [ring, flip] of [[rings[0], true], [rings[steps], false]] as const) { if (flip) q(ring[3], ring[2], ring[1], ring[0]); else q(ring[0], ring[1], ring[2], ring[3]); }
 const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
 return g;
}
function bannerTexture(theme: KitTheme) {
 return canvasTex(128, 320, x => {
  x.clearRect(0, 0, 128, 320);
  const g = x.createLinearGradient(0, 0, 0, 320); g.addColorStop(0, theme.cloth); g.addColorStop(1, theme.clothDark);
  x.fillStyle = g;
  x.beginPath(); x.moveTo(0, 0); x.lineTo(128, 0); x.lineTo(128, 300); x.lineTo(64, 250); x.lineTo(0, 300); x.closePath(); x.fill();
  x.strokeStyle = theme.trim; x.lineWidth = 7;
  x.beginPath(); x.moveTo(6, 4); x.lineTo(122, 4); x.lineTo(122, 290); x.lineTo(64, 244); x.lineTo(6, 290); x.closePath(); x.stroke();
  x.fillStyle = theme.trim;
  // crest chevron
  x.beginPath(); x.moveTo(28, 92); x.lineTo(64, 140); x.lineTo(100, 92); x.lineTo(100, 116); x.lineTo(64, 168); x.lineTo(28, 116); x.closePath(); x.fill();
  x.beginPath(); x.moveTo(40, 60); x.lineTo(64, 90); x.lineTo(88, 60); x.lineTo(88, 74); x.lineTo(64, 106); x.lineTo(40, 74); x.closePath(); x.fill();
  x.fillRect(0, 16, 128, 6);
 }, true);
}

export interface RoadDressing { update(time: number): void; }

/**
 * Stone balustrade along both road edges for each span (posts, handrail, plinth, panels with glowing ▲▼ inlays),
 * lantern pillars every few posts, and pennant banners outside the rail.
 */
export function buildRoadDressing(root: T.Group, def: CourseDef, spans: [number, number][], disposables: {dispose(): void}[]): RoadDressing {
 const theme = kitTheme(def.id);
 const key = 'road-' + def.id + '-' + Math.random();
 const m = kitMats(theme, key);
 disposables.push({dispose: () => releaseMats(key)});
 const batch = new Batch();
 const L = (t0: number, t1: number) => { let s = 0, prev = worldPoint(t0, 64.5, 0, def.id); for (let i = 1; i <= 40; i++) { const p = worldPoint(t0 + (t1 - t0) * i / 40, 64.5, 0, def.id); s += p.distanceTo(prev); prev = p; } return s; };
 const posts: T.Matrix4[] = [], pillars: T.Matrix4[] = [], tris: T.Matrix4[] = [], lamps: T.Matrix4[] = [];
 const banners: T.Matrix4[] = [];
 const stone = new T.Color(theme.stone), stoneDim = new T.Color(theme.stone).lerp(tmpC.set(theme.stoneDark), .55);
 const inTunnel = (t: number) => def.tunnels.some(z => t > z.startT - .004 && t < z.endT + .004);
 const LANE = 64.5;
 let postIndex = 0;
 for (const [a, b] of spans) {
  const len = L(a, b);
  const n = Math.max(1, Math.round(len / 2.7));
  const steps = Math.max(6, Math.round(len / 1.4));
  for (const side of [-1, 1]) {
   const lane = side * LANE;
   batch.add(sweptBox(def.id, a, b, lane, 1.08, 1.32, .3, steps), m.stoneSmooth, undefined, stone);
   batch.add(sweptBox(def.id, a, b, lane, -.2, .3, .38, steps), m.stoneSmooth, undefined, stoneDim);
   batch.add(sweptBox(def.id, a, b, lane, .3, 1.08, .09, steps), m.stone, undefined, stone);
   for (let i = 0; i <= n; i++) {
    const t = a + (b - a) * i / n, f = trackFrame(t, lane, def.id);
    const pillar = postIndex++ % 9 === 0 && !inTunnel(t);
    (pillar ? pillars : posts).push(frameMatrix(f, f.position));
    if (pillar) lamps.push(frameMatrix(f, f.position.clone().addScaledVector(f.normal, 2.62)));
    if (i < n) {
     for (const [u, up] of [[.33, 1], [.67, -1]] as const) {
      const tt = t + (b - a) / n * u, ff = trackFrame(tt, lane, def.id);
      const mx = frameMatrix(ff, ff.position.clone().addScaledVector(ff.normal, .69));
      if (up < 0) mx.multiply(new T.Matrix4().makeRotationZ(Math.PI));
      tris.push(mx);
     }
    }
   }
  }
 }
 // pennants: every ~38 m, alternating sides, never in tunnels or over gaps
 {
  const total = L(0, .999);
  const n = Math.round(total / 38);
  for (let i = 0; i < n; i++) {
   const t = (i + .5) / n;
   if (inTunnel(t) || isGapAt(t, def.id) || def.loops.some(l => Math.abs(t - l.centerT) < l.halfWidth + .01) || courseMorphs(def.id).some(z => t > z.startT - .01 && t < z.endT + .01)) continue;
   const side = i % 2 ? 1 : -1, f = trackFrame(t, side * 71, def.id);
   const mx = frameMatrix(f, f.position.clone().addScaledVector(f.normal, -.2));
   if (side < 0) mx.multiply(new T.Matrix4().makeRotationY(Math.PI));
   banners.push(mx);
  }
 }
 batch.flush(root, disposables);

 const inst = (g: T.BufferGeometry, mat: T.Material, list: T.Matrix4[], shadow = true) => {
  if (!list.length) return null;
  const im = new T.InstancedMesh(g, mat, list.length);
  list.forEach((mx, i) => im.setMatrixAt(i, mx)); im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
  im.castShadow = shadow; im.receiveShadow = true; root.add(im); disposables.push(g); return im;
 };
 const col = (g: T.BufferGeometry, c: T.Color) => { const n = g.getAttribute('position').count, arr = new Float32Array(n * 3); for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; } g.setAttribute('color', new T.BufferAttribute(arr, 3)); return g; };
 // rail post with cap
 const postG = (() => { const p = new RoundedBoxGeometry(.5, 1.2, .5, 2, .07); p.translate(0, .65, 0); const c = new RoundedBoxGeometry(.66, .16, .66, 1, .04); c.translate(0, 1.36, 0); const g = mergeGeometries([col(p.toNonIndexed(), stone), col(c.toNonIndexed(), stone)])!; p.dispose(); c.dispose(); return g; })();
 inst(postG, m.stoneSmooth, posts);
 // lantern pillar: tall square shaft, plinth, capital
 const pillarG = (() => {
  const parts = [new RoundedBoxGeometry(.9, .5, .9, 1, .08).translate(0, .25, 0), new RoundedBoxGeometry(.68, 2, .68, 2, .08).translate(0, 1.4, 0), new RoundedBoxGeometry(.92, .22, .92, 1, .05).translate(0, 2.48, 0)];
  const g = mergeGeometries(parts.map(p => col(p.toNonIndexed(), stone)))!; parts.forEach(p => p.dispose()); return g;
 })();
 inst(pillarG, m.stone, pillars);
 // ▲ inlay prism (pierces the panel so it glows on both faces)
 const triG = new T.CylinderGeometry(.3, .3, .26, 3); triG.rotateZ(-Math.PI / 2); triG.rotateX(-Math.PI / 2);
 inst(triG, m.glow, tris, false);
 // golden lantern: cage + teardrop flame
 const cageG = (() => {
  const parts: T.BufferGeometry[] = [new T.CylinderGeometry(.26, .3, .14, 10).translate(0, .07, 0), new T.ConeGeometry(.36, .4, 10).translate(0, 1.02, 0), new T.SphereGeometry(.07, 8, 6).translate(0, 1.28, 0)];
  for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + Math.PI / 4; parts.push(new T.BoxGeometry(.05, .74, .05).translate(Math.cos(a) * .24, .5, Math.sin(a) * .24)); }
  const g = mergeGeometries(parts.map(p => p.index ? p.toNonIndexed() : p).map(p => { for (const k of Object.keys(p.attributes)) if (k !== 'position' && k !== 'normal') p.deleteAttribute(k); return p; }))!; return g;
 })();
 inst(cageG, m.gold, lamps);
 const flameG = new T.LatheGeometry([new T.Vector2(0, .14), new T.Vector2(.14, .24), new T.Vector2(.19, .42), new T.Vector2(.12, .64), new T.Vector2(.03, .8), new T.Vector2(0, .84)], 12);
 inst(flameG, m.flame, lamps, false);
 // pennant pole + banner
 const poleG = (() => {
  const parts: T.BufferGeometry[] = [new T.CylinderGeometry(.08, .11, 7.4, 8).translate(0, 3.7, 0), new T.BoxGeometry(1.7, .09, .09).translate(-.75, 7.0, 0), new T.SphereGeometry(.16, 10, 8).translate(0, 7.55, 0)];
  return mergeGeometries(parts.map(p => { const n = p.index ? p.toNonIndexed() : p; for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k); return n; }))!;
 })();
 inst(poleG, m.gold, banners);
 const clothTex = bannerTexture(theme); disposables.push(clothTex);
 const clothMat = new T.MeshStandardMaterial({map: clothTex, alphaTest: .5, side: T.DoubleSide, roughness: .8}); disposables.push(clothMat);
 const sway = {value: 0};
 clothMat.onBeforeCompile = sh => {
  sh.uniforms.uKpT = sway;
  sh.vertexShader = 'uniform float uKpT;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
   { float hang = clamp(-position.y / 3.2, 0.0, 1.0);
     #ifdef USE_INSTANCING
      float ph = instanceMatrix[3][0] * 0.13 + instanceMatrix[3][2] * 0.07;
     #else
      float ph = 0.0;
     #endif
     transformed.z += (sin(uKpT * 2.4 + ph + position.y * 1.4) * 0.28 + sin(uKpT * 5.1 + ph * 2.0) * 0.08) * hang;
     transformed.x += sin(uKpT * 1.7 + ph) * 0.12 * hang; }`);
 };
 clothMat.customProgramCacheKey = () => 'kp-kit-banner';
 const clothG = new T.PlaneGeometry(1.3, 3.2, 4, 10); clothG.translate(-.75, 6.95 - 1.6, 0);
 // re-anchor so position.y is measured from the crossbar (hang weighting) — shift back after the shader sees it
 clothG.translate(0, -(6.95), 0);
 const cloth = inst(clothG, clothMat, banners.map(mx => mx.clone().multiply(new T.Matrix4().makeTranslation(0, 6.95, 0))));
 if (cloth) cloth.castShadow = true;
 // drifts of fallen petals on the road surface (sakura worlds)
 if (theme.sakura) {
  const rr = rng(def.id.length * 31 + 9), list: T.Matrix4[] = [];
  for (let i = 0; i < 900; i++) {
   const t = rr();
   if (isGapAt(t, def.id) || def.loops.some(l => Math.abs(t - l.centerT) < l.halfWidth + .01) || courseMorphs(def.id).some(z => t > z.startT - .003 && t < z.endT + .003)) continue;
   const edge = rr() < .6;
   const lane = edge ? (rr() < .5 ? -1 : 1) * (44 + rr() * 16) : (rr() - .5) * 90;
   const f = trackFrame(t, lane, def.id);
   const mx = frameMatrix(f, f.position.clone().addScaledVector(f.normal, .05));
   const sc = edge ? 1.6 + rr() * 2.2 : .7 + rr() * 1.1;
   mx.multiply(new T.Matrix4().makeRotationX(-Math.PI / 2)).multiply(new T.Matrix4().makeRotationZ(rr() * 6.28)).multiply(new T.Matrix4().makeScale(sc, sc, 1));
   list.push(mx);
  }
  const g = new T.PlaneGeometry(1, 1);
  const im = inst(g, m.petals, list, false);
  if (im) im.renderOrder = 1;
 }
 return {update(time: number) { sway.value = time; m.time.value = time; }};
}

// ---------------------------------------------------------------- tunnel mountains + portals
/** A rock ridge the tunnel bores through: carved outer surface, rock faces around both portals, grassy crest. */
export function buildTunnelMountain(root: T.Group, def: CourseDef, z: TunnelZone, disposables: {dispose(): void}[]) {
 const theme = kitTheme(def.id);
 const key = 'tunnel-' + def.id + '-' + Math.random();
 const m = kitMats(theme, key);
 disposables.push({dispose: () => releaseMats(key)});
 const batch = new Batch();
 const R = 13.2, steps = Math.max(16, Math.round((z.endT - z.startT) * 600)), seg = 26;
 const outer: T.Vector3[][] = [], inner: T.Vector3[][] = [];
 const seed = z.startT * 97;
 for (let i = 0; i <= steps; i++) {
  const u = i / steps, t = z.startT + (z.endT - z.startT) * u, f = trackFrame(t, 0, def.id);
  const swell = Math.sin(Math.PI * u);
  const W = R + 9 + swell * 10, Hm = R * .78 + 6 + swell * 12;
  const ro: T.Vector3[] = [], ri: T.Vector3[] = [];
  for (let k = 0; k <= seg; k++) {
   const a = -.22 + (Math.PI + .44) * k / seg;
   const base = f.position.clone().addScaledVector(f.right, Math.cos(a) * W).addScaledVector(f.normal, Math.sin(a) * Hm - 1.2);
   const n = fbm(base.x * .07 + seed, base.y * .07, base.z * .07, 4);
   const p = f.position.clone().addScaledVector(f.right, Math.cos(a) * W * (1 + n * .22)).addScaledVector(f.normal, (Math.sin(a) * Hm) * (1 + n * .28) - 1.2 + (k > 0 && k < seg ? Math.abs(n) * 2 : 0));
   ro.push(p);
   const ai = Math.min(Math.PI, Math.max(0, a));
   ri.push(f.position.clone().addScaledVector(f.right, Math.cos(ai) * (R + .5)).addScaledVector(f.normal, Math.sin(ai) * (R + .5) * .78 - .6 - (a < 0 || a > Math.PI ? 3 : 0)));
  }
  outer.push(ro); inner.push(ri);
 }
 const pos: number[] = [];
 const tri = (a: T.Vector3, b: T.Vector3, c: T.Vector3) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
 for (let i = 0; i < steps; i++) for (let k = 0; k < seg; k++) { const a = outer[i][k], b = outer[i][k + 1], c = outer[i + 1][k], d = outer[i + 1][k + 1]; tri(a, b, c); tri(b, d, c); }
 for (const [i, flip] of [[0, true], [steps, false]] as const) for (let k = 0; k < seg; k++) {
  const a = outer[i][k], b = outer[i][k + 1], c = inner[i][k], d = inner[i][k + 1];
  if (flip) { tri(a, c, b); tri(b, c, d); } else { tri(a, b, c); tri(b, d, c); }
 }
 const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
 let lo = Infinity, hi = -Infinity; for (const r of outer) for (const p of r) { lo = Math.min(lo, p.y); hi = Math.max(hi, p.y); }
 paintFaces(g, (c, n, out) => strataColor(theme, c, n, lo, hi, out));
 batch.add(g, m.rock);
 // masonry portal arches with a keystone, set just proud of the rock face
 for (const [t, dir] of [[z.startT, -1], [z.endT, 1]] as const) {
  const f = trackFrame(t, 0, def.id);
  const s = new T.Shape();
  s.absarc(0, 0, R + 2.4, 0, Math.PI, false); s.lineTo(-(R + .7), 0); s.absarc(0, 0, R + .7, Math.PI, 0, true); s.lineTo(R + 2.4, 0);
  const arch = new T.ExtrudeGeometry(s, {depth: 1.6, bevelEnabled: true, bevelSize: .2, bevelThickness: .2, bevelSegments: 1, curveSegments: 28});
  arch.scale(1, .8, 1); arch.translate(0, -.6, -.8);
  const key2 = new RoundedBoxGeometry(2.2, 2.8, 2.2, 1, .2); key2.translate(0, (R + 1.6) * .8 - .4, 0);
  const pillarL = new RoundedBoxGeometry(2.4, 3.6, 2.4, 1, .2); pillarL.translate(-(R + 1.55), 1.2, 0);
  const pillarR = pillarL.clone(); pillarR.translate(2 * (R + 1.55), 0, 0);
  const M = frameMatrix(f, f.position.clone().addScaledVector(f.tangent, dir * 1.1));
  for (const p of [arch, key2, pillarL, pillarR]) { p.applyMatrix4(M); batch.add(p, m.stone, undefined, new T.Color(theme.stone).lerp(tmpC.set(theme.stoneDark), .2)); }
 }
 batch.flush(root, disposables);
}

/** Two-tier stone arcade under an arch bridge, down into the valley. */
export function buildBridgeArcade(root: T.Group, def: CourseDef, startT: number, endT: number, disposables: {dispose(): void}[]) {
 const theme = kitTheme(def.id);
 const key = 'bridge-' + def.id + '-' + Math.random();
 const m = kitMats(theme, key);
 disposables.push({dispose: () => releaseMats(key)});
 const batch = new Batch();
 const n = 6;
 for (let i = 0; i < n; i++) {
  const t0 = startT + (endT - startT) * i / n, t1 = startT + (endT - startT) * (i + 1) / n;
  const a = worldPoint(t0, 0, 0, def.id), b = worldPoint(t1, 0, 0, def.id), f = trackFrame((t0 + t1) / 2, 0, def.id);
  const len = a.distanceTo(b) + .4, H = 30;
  const g = arcadeGeometry(len, H, 22, 1, .5);
  const tg = new T.Vector3(f.tangent.x, 0, f.tangent.z).normalize();
  const M = new T.Matrix4().makeBasis(tg, new T.Vector3(0, 1, 0), tg.clone().cross(new T.Vector3(0, 1, 0)).normalize());
  M.setPosition(a.clone().lerp(b, .5).add(new T.Vector3(0, -H - .9, 0)));
  g.applyMatrix4(M);
  batch.add(g, m.stone, undefined, new T.Color(theme.stone).lerp(tmpC.set(theme.stoneDark), .15));
 }
 batch.flush(root, disposables);
}

// ---------------------------------------------------------------- arena kit (Kith Tennis and other stadium games)
export interface ArenaKit { update(dt: number, time: number): void; stats: Record<string, number>; dispose(): void; }

/**
 * The same sanctuary world, laid out around a stadium instead of a road: a hero backdrop behind the far end
 * (terraced massif + waterfalls + carved Kith masks), an outer ring of cliffs, viaducts across the valleys,
 * crystal shrines at the corners, sakura groves, horizon spires, and the white balustrade with glowing
 * ▲▼ inlays, lantern pillars and pennants around the rectangle `rail` (half extents, metres).
 * `backdrop` is the direction the main camera looks (-1 = toward -z).
 */
export function buildArenaKit(scene: T.Scene, courseId: CourseId, heightAt: (x: number, z: number) => number, opts: {rail: {x: number; z: number}; clear: {x: number; z: number}; backdrop?: -1 | 1; seed?: number}): ArenaKit {
 const theme = kitTheme(courseId);
 const key = 'arena-' + courseId + '-' + Math.random();
 const m = kitMats(theme, key);
 const root = new T.Group(); root.name = 'kith-arena-kit'; scene.add(root);
 const disposables: {dispose(): void}[] = [];
 const batch = new Batch(), falls = new Batch(), far = new Batch();
 const r = rng((opts.seed ?? 7) * 31 + courseId.length * 977);
 const forest = makeForest(theme, m);
 const bushes: T.Matrix4[] = [];
 const mist: T.Vector3[] = [], strands: T.Matrix4[] = [];
 mistSink = mist; strandSink = strands;
 const centre = new T.Vector2(0, 0);
 const back = opts.backdrop ?? -1;
 const placed: {x: number; z: number; r: number}[] = [];
 const outside = (x: number, z: number, pad: number) => Math.abs(x) > opts.clear.x + pad || Math.abs(z) > opts.clear.z + pad;
 const free = (x: number, z: number, rad: number, pad: number) => outside(x, z, rad + pad) && placed.every(p => Math.hypot(p.x - x, p.z - z) > p.r + rad + 4);
 let massifCount = 0, viaductCount = 0, shrineCount = 0, masks = 0;
 const addTerraceLife = (out: MassifOut, i: number) => {
  for (const t of out.terraces) {
   for (const p of t.rim) if (r() < .8) bushes.push(new T.Matrix4().compose(new T.Vector3(p.x - p.x * .04, p.y - .3, p.z - p.z * .04), new T.Quaternion().setFromEuler(new T.Euler(0, r() * 6.28, 0)), new T.Vector3(1, 1, 1).multiplyScalar(1 + r() * 1.3)));
   if (theme.sakura || theme.grassCaps) {
    const n = Math.max(1, Math.round(t.r / 6));
    for (let k = 0; k < n; k++) { const ta = r() * Math.PI * 2, tr = Math.sqrt(r()) * t.r * .8; forest.add(t.x + Math.cos(ta) * tr, t.y - .6, t.z + Math.sin(ta) * tr, .7 + r() * .5, i * 5 + k); }
   }
  }
 };
 const ok = theme.massifs > 0;
 // ---- hero backdrop behind the far end: big terraced massif, waterfalls toward the court, carved Kith masks either side
 if (ok) {
  const hx = (r() - .5) * 30, hz = back * (opts.clear.z + 52 + r() * 10), R = 30, H = 70;
  const out = massif(batch, m, theme, hx, heightAt(hx, hz), hz, R, H, 4242, falls, centre);
  placed.push({x: hx, z: hz, r: R * 1.3}); addTerraceLife(out, 1); massifCount++;
  if (theme.masks) {
   for (const sd of [-1, 1]) {
    const mx = hx + sd * (R + 38), mz = hz - back * 6, MR = 15;
    if (!free(mx, mz, MR, 10)) continue;
    const mh = 46 + r() * 10, gy = heightAt(mx, mz);
    const o2 = massif(batch, m, theme, mx, gy, mz, MR, mh, 5100 + sd, falls, centre);
    placed.push({x: mx, z: mz, r: MR * 1.25}); addTerraceLife(o2, 2 + sd);
    const dl = Math.hypot(mx, mz) || 1, dx = -mx / dl, dz = -mz / dl;
    kithMask(batch, m, theme, new T.Vector3(mx + dx * MR * .86, gy + mh * .32, mz + dz * MR * .86), Math.atan2(dx, dz), MR * .42);
    masks++; massifCount++;
   }
  }
 }
 // ---- outer ring of cliffs framing the stadium
 for (let i = 0, tries = 0; ok && i < theme.massifs && tries < theme.massifs * 16; tries++) {
  const a = r() * Math.PI * 2, rad = 95 + r() * 120;
  const R = 16 + r() * 22, x = Math.cos(a) * rad, z = Math.sin(a) * rad;
  if (!free(x, z, R * 1.3, 30)) continue;
  const H = 28 + r() * 55;
  const out = massif(batch, m, theme, x, heightAt(x, z), z, R, H, i * 17 + 3, falls, centre);
  placed.push({x, z, r: R * 1.3}); addTerraceLife(out, i + 4);
  if (theme.shrines && r() < .4) shrine(batch, m, theme, new T.Vector3(out.terraces[out.terraces.length - 1].x, out.top + .2, out.terraces[out.terraces.length - 1].z), Math.atan2(-x, -z), .8 + r() * .4);
  massifCount++; i++;
 }
 // ---- viaducts across the valleys, the first one crossing the backdrop
 for (let i = 0, tries = 0; ok && i < Math.max(1, theme.viaducts) && tries < 160; tries++) {
  const a = i === 0 ? (back < 0 ? -Math.PI / 2 : Math.PI / 2) + (r() - .5) * .5 : r() * Math.PI * 2;
  const rad = i === 0 ? 120 + r() * 20 : 130 + r() * 60, len = 70 + r() * 50, tang = a + Math.PI / 2;
  const mx = Math.cos(a) * rad, mz = Math.sin(a) * rad;
  const A = new T.Vector3(mx - Math.cos(tang) * len / 2, 0, mz - Math.sin(tang) * len / 2), B = new T.Vector3(mx + Math.cos(tang) * len / 2, 0, mz + Math.sin(tang) * len / 2);
  let fine = true;
  for (let k = 0; k <= 8 && fine; k++) { const u = k / 8, px = A.x + (B.x - A.x) * u, pz = A.z + (B.z - A.z) * u; fine = outside(px, pz, 40) && placed.every(p => Math.hypot(p.x - px, p.z - pz) > p.r - 2 || k === 0 || k === 8); }
  if (!fine) continue;
  const gy = Math.min(heightAt(mx, mz), heightAt(A.x, A.z), heightAt(B.x, B.z)) - 1, deck = gy + 24 + r() * 16;
  A.y = B.y = deck;
  viaduct(batch, m, theme, A, B, gy, falls);
  for (const P of [A, B]) { const R = 12 + r() * 6; massif(batch, m, theme, P.x, Math.min(heightAt(P.x, P.z), gy + 1), P.z, R, deck - gy + 10, i * 31 + (P === A ? 1 : 2), falls, centre); placed.push({x: P.x, z: P.z, r: R * 1.3}); }
  placed.push({x: mx, z: mz, r: len / 2});
  viaductCount++; i++;
 }
 // ---- crystal shrines at the four corners of the grounds, facing the court
 for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
  const x = sx * (opts.rail.x + 9), z = sz * (opts.rail.z + 7);
  shrine(batch, m, theme, new T.Vector3(x, heightAt(x, z) - .6, z), Math.atan2(-x, -z), 1.05);
  placed.push({x, z, r: 5}); shrineCount++;
 }
 // ---- trees: groves around the grounds
 if (theme.sakura || theme.grassCaps) {
  for (let i = 0, tries = 0; i < 44 && tries < 600; tries++) {
   const a = r() * Math.PI * 2, rad = 46 + r() * 80, x = Math.cos(a) * rad, z = Math.sin(a) * rad;
   if (!outside(x, z, 6) || !placed.every(p => Math.hypot(p.x - x, p.z - z) > p.r + 2)) continue;
   forest.add(x, heightAt(x, z) - .3, z, 1 + r() * .6, i + 11, Math.atan2(-x, -z) + (r() - .5));
   i++;
  }
 }
 // ---- horizon spires
 if (theme.peaks) peakRing(far, m, theme, theme.peaks, 380, 470, -18, courseId.length * 13);

 // ---- balustrade around the grounds
 const stone = new T.Color(theme.stone), stoneDim = new T.Color(theme.stone).lerp(tmpC.set(theme.stoneDark), .55);
 const posts: T.Matrix4[] = [], pillars: T.Matrix4[] = [], tris: T.Matrix4[] = [], lamps: T.Matrix4[] = [], banners: T.Matrix4[] = [];
 const RX = opts.rail.x, RZ = opts.rail.z;
 const edges: [T.Vector3, T.Vector3, T.Vector3][] = [
  [new T.Vector3(-RX, 0, -RZ), new T.Vector3(RX, 0, -RZ), new T.Vector3(0, 0, -1)],
  [new T.Vector3(RX, 0, -RZ), new T.Vector3(RX, 0, RZ), new T.Vector3(1, 0, 0)],
  [new T.Vector3(RX, 0, RZ), new T.Vector3(-RX, 0, RZ), new T.Vector3(0, 0, 1)],
  [new T.Vector3(-RX, 0, RZ), new T.Vector3(-RX, 0, -RZ), new T.Vector3(-1, 0, 0)],
 ];
 const up = new T.Vector3(0, 1, 0);
 const basis = (tg: T.Vector3, out: T.Vector3, p: T.Vector3) => new T.Matrix4().makeBasis(out, up, tg).setPosition(p);
 let pi = 0;
 for (const [a, b, out] of edges) {
  const len = a.distanceTo(b), tg = b.clone().sub(a).normalize(), mid = a.clone().lerp(b, .5);
  const M = basis(tg, out, mid);
  const bar = (h0: number, h1: number, hw: number, mat: T.Material, c: T.Color) => { const g = new T.BoxGeometry(hw * 2, h1 - h0, len); g.translate(0, (h0 + h1) / 2, 0); g.applyMatrix4(M); batch.add(g, mat, undefined, c); };
  bar(1.08, 1.32, .3, m.stoneSmooth, stone); bar(-.2, .3, .38, m.stoneSmooth, stoneDim); bar(.3, 1.08, .09, m.stone, stone);
  const n = Math.max(2, Math.round(len / 2.7));
  for (let i = 0; i <= n; i++) {
   const p = a.clone().lerp(b, i / n);
   const corner = i === 0 || i === n;
   const pillar = corner || pi++ % 6 === 0;
   (pillar ? pillars : posts).push(basis(tg, out, p));
   if (pillar) lamps.push(basis(tg, out, p.clone().setY(2.62)));
   if (i < n) for (const [u, upw] of [[.33, 1], [.67, -1]] as const) {
    const mx = basis(tg, out, a.clone().lerp(b, (i + u) / n).setY(.69));
    if (upw < 0) mx.multiply(new T.Matrix4().makeRotationZ(Math.PI));
    tris.push(mx);
   }
   if (i % 4 === 2) { const q = p.clone().addScaledVector(out, 6.5); q.y = heightAt(q.x, q.z) - .2; banners.push(basis(tg, out, q).multiply(new T.Matrix4().makeRotationY(Math.PI / 2))); }
  }
 }
 batch.flush(root, disposables);
 falls.flush(root, disposables, false);
 far.flush(root, disposables, false);
 mistSink = null; strandSink = null;
 (forest as ReturnType<typeof makeForest>).flush(root, disposables);
 const inst = (g: T.BufferGeometry, mat: T.Material, list: T.Matrix4[], shadow = true) => {
  if (!list.length) { g.dispose(); return null; }
  const im = new T.InstancedMesh(g, mat, list.length);
  list.forEach((mx, i) => im.setMatrixAt(i, mx)); im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
  im.castShadow = shadow; im.receiveShadow = true; root.add(im); disposables.push(g); return im;
 };
 const col = (g: T.BufferGeometry, c: T.Color) => { const n = g.getAttribute('position').count, arr = new Float32Array(n * 3); for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; } g.setAttribute('color', new T.BufferAttribute(arr, 3)); return g; };
 const clean = (p: T.BufferGeometry) => { const n = p.index ? p.toNonIndexed() : p; for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k); return n; };
 {
  const p = new RoundedBoxGeometry(.5, 1.2, .5, 2, .07); p.translate(0, .65, 0); const c = new RoundedBoxGeometry(.66, .16, .66, 1, .04); c.translate(0, 1.36, 0);
  inst(mergeGeometries([col(p.toNonIndexed(), stone), col(c.toNonIndexed(), stone)])!, m.stoneSmooth, posts);
  const parts = [new RoundedBoxGeometry(.9, .5, .9, 1, .08).translate(0, .25, 0), new RoundedBoxGeometry(.68, 2, .68, 2, .08).translate(0, 1.4, 0), new RoundedBoxGeometry(.92, .22, .92, 1, .05).translate(0, 2.48, 0)];
  inst(mergeGeometries(parts.map(q => col(q.toNonIndexed(), stone)))!, m.stone, pillars);
  const triG = new T.CylinderGeometry(.3, .3, .26, 3); triG.rotateZ(-Math.PI / 2); triG.rotateX(-Math.PI / 2);
  inst(triG, m.glow, tris, false);
  const cage: T.BufferGeometry[] = [new T.CylinderGeometry(.26, .3, .14, 10).translate(0, .07, 0), new T.ConeGeometry(.36, .4, 10).translate(0, 1.02, 0), new T.SphereGeometry(.07, 8, 6).translate(0, 1.28, 0)];
  for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + Math.PI / 4; cage.push(new T.BoxGeometry(.05, .74, .05).translate(Math.cos(a) * .24, .5, Math.sin(a) * .24)); }
  inst(mergeGeometries(cage.map(clean))!, m.gold, lamps);
  inst(new T.LatheGeometry([new T.Vector2(0, .14), new T.Vector2(.14, .24), new T.Vector2(.19, .42), new T.Vector2(.12, .64), new T.Vector2(.03, .8), new T.Vector2(0, .84)], 12), m.flame, lamps, false);
  const pole: T.BufferGeometry[] = [new T.CylinderGeometry(.08, .11, 7.4, 8).translate(0, 3.7, 0), new T.BoxGeometry(1.7, .09, .09).translate(-.75, 7.0, 0), new T.SphereGeometry(.16, 10, 8).translate(0, 7.55, 0)];
  inst(mergeGeometries(pole.map(clean))!, m.gold, banners);
 }
 const clothTex = bannerTexture(theme); disposables.push(clothTex);
 const clothMat = new T.MeshStandardMaterial({map: clothTex, alphaTest: .5, side: T.DoubleSide, roughness: .8}); disposables.push(clothMat);
 const sway = {value: 0};
 clothMat.onBeforeCompile = sh => {
  sh.uniforms.uKpT = sway;
  sh.vertexShader = 'uniform float uKpT;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
   { float hang = clamp(-position.y / 3.2, 0.0, 1.0);
     #ifdef USE_INSTANCING
      float ph = instanceMatrix[3][0] * 0.13 + instanceMatrix[3][2] * 0.07;
     #else
      float ph = 0.0;
     #endif
     transformed.z += (sin(uKpT * 2.4 + ph + position.y * 1.4) * 0.28 + sin(uKpT * 5.1 + ph * 2.0) * 0.08) * hang;
     transformed.x += sin(uKpT * 1.7 + ph) * 0.12 * hang; }`);
 };
 clothMat.customProgramCacheKey = () => 'kp-kit-banner';
 const clothG = new T.PlaneGeometry(1.3, 3.2, 4, 10); clothG.translate(-.75, -1.6, 0);
 inst(clothG, clothMat, banners.map(mx => mx.clone().multiply(new T.Matrix4().makeTranslation(0, 6.95, 0))));
 if (strands.length) {
  const g = strandGeometry(theme); disposables.push(g);
  const im = new T.InstancedMesh(g, m.canopy, strands.length);
  strands.forEach((mx, i) => im.setMatrixAt(i, mx)); im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.castShadow = true; root.add(im);
 }
 if (mist.length) {
  const g = new T.BufferGeometry().setFromPoints(mist); disposables.push(g);
  const tex = mistTexture(); disposables.push(tex);
  const FK = FALLS[fallsKind(theme)];
  const pm = new T.PointsMaterial({map: tex, size: 16, sizeAttenuation: true, transparent: true, depthWrite: false, opacity: FK.mistOp, color: FK.mist}); disposables.push(pm);
  root.add(new T.Points(g, pm));
 }
 if (bushes.length) {
  const green = [new T.Color(theme.moss), new T.Color(theme.grass[0]), new T.Color(theme.grass[1])];
  const bloom = theme.blossom.map(c => new T.Color(c));
  [bushGeometry(1, green), bushGeometry(2, theme.sakura ? bloom : green), bushGeometry(3, green)].forEach((g, vi) => {
   const list = bushes.filter((_, i) => i % 3 === vi);
   if (!list.length) { g.dispose(); return; }
   const im = new T.InstancedMesh(g, m.canopy, list.length);
   list.forEach((mx, i) => im.setMatrixAt(i, mx)); im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.castShadow = true; im.receiveShadow = true;
   root.add(im); disposables.push(g);
  });
 }
 return {
  update(dt, time) { m.time.value = time; sway.value = time; m.waterMap.offset.y += dt * (theme.frozenFalls ? .02 : .55); },
  stats: {massifs: massifCount, viaducts: viaductCount, shrines: shrineCount, masks, trees: forest.count()},
  dispose() { root.removeFromParent(); disposables.forEach(d => d.dispose()); releaseMats(key); },
 };
}
