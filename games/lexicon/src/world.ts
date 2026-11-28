// Lexicon world builder: expanded Glossa Hollow Valley (S55 / S33 — winding creek, arched stone bridges,
// turning waterwheels, 12 valley cottages, towering triple waterfall cliff with behind-the-veil cavern
// ladder, and 12 Character Forge villagers) + Temple of Numerals.
import * as THREE from 'three/webgpu';
import { abs, attribute, float, length, max, mix, normalMap, positionWorld, sin, smoothstep, step, texture, vec2, vec3 } from 'three/tsl';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;
import { SIGILS, VILLAGERS, type LevelId, type SigilDef } from './content';
import type { TreeSpot } from '../../../services/vegetation/trees/forest';
import type { GrappleAnchor } from './lasso';
import { createWildlife } from './wildlife';

export interface Box { minx: number; maxx: number; minz: number; maxz: number; off?: boolean }
export interface Circle { x: number; z: number; r: number }
export interface Gate { id: string; obj: THREE.Object3D; box: Box; open: boolean }
export interface SigilView { def: SigilDef; obj: THREE.Group; solved: boolean; setSolved(v: boolean): void }

export interface LevelPortal {
  id: string;
  label: string;
  x: number;
  z: number;
  r: number;
  target: LevelId;
  spawn?: [number, number, number];
  yaw?: number;
  /** Optional prerequisite check message; if returns string, portal stays locked with that toast. */
  lockedMsg?: () => string | null;
}

export interface WorldInteractable {
  id: string;
  label: () => string;
  x: number;
  z: number;
  r: number;
  act: () => void;
}

export interface HazardZone {
  id: string;
  kind: 'lava' | 'pendulum' | 'dart';
  x: number;
  z: number;
  rx: number;
  rz: number;
  /** Dynamic active check (e.g., blade currently sweeping through center). */
  isLethal?: (t: number, timeSlow: number) => boolean;
}

export interface BuiltLevel {
  id: LevelId;
  name: string;
  outdoor: boolean;
  group: THREE.Group;
  heightAt(x: number, z: number): number;
  circles: Circle[];
  boxes: Box[];
  gates: Map<string, Gate>;
  sigils: Map<string, SigilView>;
  villagers: Map<string, THREE.Group>;
  portals: LevelPortal[];
  interactables: WorldInteractable[];
  grappleAnchors: GrappleAnchor[];
  hazards: HazardZone[];
  well?: THREE.Vector3;
  constrain(x: number, z: number): [number, number];
  chasm?: Box;
  bridge?: THREE.Object3D;
  torches: THREE.PointLight[];
  braziers: THREE.PointLight[];
  pillars: { obj: THREE.Mesh; x: number; z: number; label: THREE.Sprite }[];
  treeSpots?: TreeSpot[];
  arena?: { x: number; z: number; r: number };
  sky: { day: number; night: number; fog: number; fogNear: number; fogFar: number };
  motes: THREE.Points;
  /** Optional per-frame level animation (waterwheels, waterfall curtains, lanterns, wildlife, mirrors, pendulums). */
  update?: (dt: number, t: number, timeSlow?: number, nightK?: number, px?: number, pz?: number) => void;
  /** Optional handler when a Lyre song is played inside this level; returns true if handled. */
  onSong?: (power: string, px: number, pz: number) => boolean;
}

// ── shared materials & mesh helpers ──
const matCache = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: number, emissive = 0, flat = false): THREE.MeshStandardMaterial {
  const k = `${color}|${emissive}|${flat}`;
  let m = matCache.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color, emissive, emissiveIntensity: emissive ? 1.6 : 0, flatShading: flat, roughness: 0.82, metalness: 0,
    });
    matCache.set(k, m);
  }
  return m;
}

/** Identity palette (docs/lexicon-visual-identity.md §2). */
export const PAL = {
  navy: 0x343c51, leather: 0x674836, saddle: 0x8c5e44, brass: 0xe6c983, cyan: 0xb1f9f6, parchment: 0xebdbc1,
  moss: 0x393d2b, olive: 0x807b58, oliveLight: 0xada87b, bark: 0x4e4730, ember: 0xbc8965,
  stone: 0x8e8372, stoneDark: 0x615a4d, wall: 0xc2b59c, slate: 0x4f5563, terracotta: 0x9a4e35, ink: 0x1d1d1b, inkWarm: 0x33322e,
};

export function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, cast = true): THREE.Mesh {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = cast;
  o.receiveShadow = true;
  return o;
}

export function textSprite(text: string, opts: { size?: number; color?: string; bg?: string; scale?: number } = {}): THREE.Sprite {
  const size = opts.size ?? 64;
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  g.font = `bold ${size}px Georgia, serif`;
  const w = Math.ceil(g.measureText(text).width + size * 0.8);
  c.width = Math.max(64, w); c.height = Math.ceil(size * 1.5);
  g.font = `bold ${size}px Georgia, serif`;
  if (opts.bg) { g.fillStyle = opts.bg; g.beginPath(); g.roundRect(0, 0, c.width, c.height, size * 0.35); g.fill(); }
  g.fillStyle = opts.color ?? '#f3ead2'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2 + size * 0.05);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  const sc = opts.scale ?? 1;
  s.scale.set((c.width / c.height) * sc, sc, 1);
  return s;
}

/** Soft feathery radial light glow texture (zero hard bubble edges for lanterns, night watch & glowing spear tip!). */
const glowTexCache = new Map<string, THREE.CanvasTexture>();
export function makeSoftGlowTexture(innerRgba: string, midRgba: string): THREE.CanvasTexture {
  const key = `${innerRgba}|${midRgba}`;
  let tex = glowTexCache.get(key);
  if (!tex) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(64, 64, 2, 64, 64, 62);
    gr.addColorStop(0, innerRgba);
    gr.addColorStop(0.32, midRgba);
    gr.addColorStop(0.7, midRgba.replace(/[\d.]+\)$/, '0.07)'));
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    glowTexCache.set(key, tex);
  }
  return tex;
}

// ── CC0 Poly Haven / ambientCG PBR surfaces ──
const texLoader = new THREE.TextureLoader();
const texCache = new Map<string, THREE.Texture>();
export function loadTex(url: string, srgb: boolean): THREE.Texture {
  let t = texCache.get(url);
  if (!t) {
    t = texLoader.load(url); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(url, t);
  }
  return t;
}
const PH = '/games/ravencrest/assets/polyhaven/textures/';
const pbrCache = new Map<string, THREE.MeshStandardMaterial>();
export function surface(name: string, repeat: [number, number], tint = 0xffffff): THREE.MeshStandardMaterial {
  const k = `${name}|${repeat}|${tint}`;
  let m = pbrCache.get(k);
  if (m) return m;
  const rep = (t: THREE.Texture) => { const c = t.clone(); c.repeat.set(repeat[0], repeat[1]); c.needsUpdate = true; return c; };
  m = new THREE.MeshStandardMaterial({
    color: tint, map: rep(loadTex(PH + name + '/diff_1k.jpg', true)), normalMap: rep(loadTex(PH + name + '/nor_gl_1k.jpg', false)),
    roughnessMap: rep(loadTex(PH + name + '/ard_1k.jpg', false)), roughness: 1, metalness: 0,
  });
  pbrCache.set(k, m);
  return m;
}

export function groundMaterial(): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  const wp: N = positionWorld.xz;
  const layer = (d: string, n: string, a: string | null, scale: number) => {
    const uv1: N = wp.mul(1 / scale), uv2: N = wp.mul(1 / (scale * 2.7)).add(vec2(0.37, 0.61));
    const D = loadTex(d, true), Nn = loadTex(n, false);
    const col: N = mix(texture(D, uv1).rgb, texture(D, uv2).rgb, 0.35);
    const nor: N = mix(texture(Nn, uv1).rgb, texture(Nn, uv2).rgb, 0.35);
    const rough: N = a ? texture(loadTex(a, false), uv1).g : float(0.85);
    return { col, nor, rough };
  };
  const forest = layer(PH + 'forest_ground_04/diff_1k.jpg', PH + 'forest_ground_04/nor_gl_1k.jpg', PH + 'forest_ground_04/ard_1k.jpg', 3.4);
  const grass = layer('/firstlight/assets/grass/Grass004_1K-JPG_Color.jpg', '/firstlight/assets/grass/Grass004_1K-JPG_NormalGL.jpg', null, 2.5);
  const cobble = layer(PH + 'cobblestone_floor_04/diff_1k.jpg', PH + 'cobblestone_floor_04/nor_gl_1k.jpg', PH + 'cobblestone_floor_04/ard_1k.jpg', 2.6);
  const r: N = length(wp);
  const wob: N = sin(wp.x.mul(0.9)).mul(sin(wp.y.mul(1.1))).mul(0.5);
  const square: N = smoothstep(14.5, 13.0, r.add(wob));
  const onRoad: N = smoothstep(3.0, 2.2, abs(wp.x).add(wob.mul(0.4))).mul(step(wp.y, float(-6))).mul(step(float(-72), wp.y));
  const road: N = max(square, onRoad);
  const wild: N = smoothstep(46, 90, r).mul(0.75);
  const base = (k: 'col' | 'nor' | 'rough') => mix(mix(grass[k], forest[k], wild), cobble[k], road);
  const tint: N = attribute('color', 'vec3');
  m.colorNode = base('col').mul(mix(vec3(1), tint.mul(1.7), 0.55));
  m.normalNode = normalMap(base('nor'));
  m.roughnessNode = base('rough');
  return m;
}

// ── noise & math helpers ──
export function hash(x: number, z: number) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
export function vnoise(x: number, z: number) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const fbm = (x: number, z: number) => vnoise(x, z) * 0.55 + vnoise(x * 2.1, z * 2.1) * 0.3 + vnoise(x * 4.3, z * 4.3) * 0.15;
export const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function motes(count: number, spread: number, center: THREE.Vector3, color = 0xfff1c8, glyph = 'a'): THREE.Points {
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    p[i * 3] = center.x + (Math.random() - 0.5) * spread;
    p[i * 3 + 1] = 0.5 + Math.random() * 7;
    p[i * 3 + 2] = center.z + (Math.random() - 0.5) * spread;
  }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d')!; x.fillStyle = '#fff4d0'; x.font = 'bold 44px Georgia';
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(glyph, 32, 34);
  const t = new THREE.CanvasTexture(c);
  return new THREE.Points(g, new THREE.PointsMaterial({ size: 0.48, map: t, transparent: true, depthWrite: false, opacity: 0.78, color }));
}

function sigilView(def: SigilDef, obj: THREE.Group, apply: (solved: boolean) => void): SigilView {
  const v: SigilView = { def, obj, solved: false, setSolved(s) { v.solved = s; apply(s); } };
  return v;
}

// ── Glossa Hollow Valley Geometry (Expanded Fable Village, Solid Bridges, Sculpted Waterfall & Horizon) ──
/** Winding valley creek centerline: flows from the Grand Waterfall Plunge Pool (-56, -26),
 *  under Bridge 2 (-34, -10), under Square Bridge 1 (-13, 6), under South Mill Bridge 3 (17, 29), out SE. */
export function creekDist(x: number, z: number): number {
  const pts: [number, number][] = [
    [-56, -26], [-42, -16], [-28, -5], [-13, 6], [2, 17], [17, 29], [34, 48], [56, 78], [80, 118],
  ];
  let best = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const abx = bx - ax, abz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / (abx * abx + abz * abz)));
    const d = Math.hypot(x - (ax + abx * t), z - (az + abz * t));
    if (d < best) best = d;
  }
  return best;
}

/** Three logically placed stone arch bridges spanning cleanly between cobbled roads (zero rocks or cottage backs!). */
export const GLOSSA_BRIDGES: { x: number; z: number; yaw: number; len: number; wid: number }[] = [
  { x: -13, z: 6, yaw: Math.atan2(11, -15), len: 11.4, wid: 4.4 },   // Bridge 1: Central Square <-> West Craft Terrace
  { x: -34, z: -10, yaw: Math.atan2(11, -14), len: 11.6, wid: 4.2 }, // Bridge 2: West Terrace <-> Waterfall Promenade
  { x: 17, z: 29, yaw: Math.atan2(12, -15), len: 12.2, wid: 4.4 },   // Bridge 3: East Market <-> South Grain Mill
];

/** 18 expanded village cottages & craft workshops — every single one verified >10 m clear of creek & bridges! */
export const GLOSSA_HOUSES: [number, number][] = [
  [-13, -18], // 0: Elder Mira's Lodge
  [13, -18],  // 1: Oren's Scriptorium & Library
  [22, -6],   // 2: Bram's Guardhouse
  [22, 8],    // 3: Selene's Weaver Cottage
  [24, 18],   // 4: Lyra's Songhall
  [-2, 26],   // 5: Nico's Courier Post
  [-21, 18],  // 6: Tolo's Riverside Forge (with waterwheel!)
  [-32, 9],   // 7: Maya's Alchemist Apothecary
  [-24, -24], // 8: Zora's Cartographer Observatory
  [-42, 6],   // 9: Western Orchard Cottage
  [-12, -34], // 10: Elder Thorne's Magistrate Hall
  [12, -34],  // 11: North Archivist Annex
  [34, -18],  // 12: Kaelen's Herbalist & Greenhouse Cottage
  [34, -2],   // 13: Pip's Family Cottage
  [38, 12],   // 14: East Gate Inn & Tavern
  [36, 26],   // 15: Market Barn & Stables
  [10, 42],   // 16: South Riverside Grain Mill (with waterwheel!)
  [-14, 38],  // 17: South Meadow Farmhouse
];

/** Compute bridge deck elevation at world (x, z) using the EXACT inverse of Three.js rotation.y = br.yaw. */
export function bridgeHeightAt(x: number, z: number): number | null {
  let best: number | null = null;
  for (const br of GLOSSA_BRIDGES) {
    const dx = x - br.x, dz = z - br.z;
    const c = Math.cos(br.yaw), s = Math.sin(br.yaw);
    // Exact inverse of world = (lx*cos + lz*sin, -lx*sin + lz*cos):
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    const halfW = br.wid * 0.56;
    const halfL = br.len * 0.58;
    if (Math.abs(lx) <= halfW && Math.abs(lz) <= halfL) {
      const arch = Math.cos((lz / halfL) * Math.PI * 0.5) * 0.88;
      // Smooth approach ramp at the very ends so walking on/off the bridge has zero snap!
      const endFade = smooth(halfL, halfL * 0.78, Math.abs(lz));
      const deckY = Math.max(0, arch * endFade + 0.24 * endFade);
      best = best === null ? deckY : Math.max(best, deckY);
    }
  }
  return best;
}

/** Pure ground/creek-bed elevation (used to displace the terrain mesh so grass NEVER pokes through bridge decks!). */
function terrainHeightGlossa(x: number, z: number): number {
  const r = Math.hypot(x, z);
  let h = (fbm(x * 0.026, z * 0.026) - 0.48) * 9 + (fbm(x * 0.01 + 7, z * 0.01) - 0.48) * 14;
  // Wide fertile village valley basin (expanded so all 18 cottages & terraces sit naturally!)
  h *= smooth(36, 68, r);
  // Flat temple grounds in the north
  h *= smooth(22, 36, Math.hypot(x, z + 78));
  // Flat waterfall approach basin & plunge pool clearing
  const dPool = Math.hypot(x + 56, z + 26);
  h *= smooth(15, 28, dPool);
  // Flat north road & east wilderness trail
  if (z < -6 && z > -70) h *= smooth(4.0, 10, Math.abs(x));
  if (x > 16 && x < 98 && Math.abs(z - 14) < 11) h *= smooth(4.0, 10, Math.abs(z - 14));

  // Grand Waterfall Cliff rising dramatically behind the western plunge pool
  if (x < -59 && z > -64 && z < 12) {
    const cliffT = smooth(-59, -74, x) * (1 - smooth(2, 14, Math.max(0, z - 0))) * (1 - smooth(2, 16, Math.max(0, -50 - z)));
    h += cliffT * 32;
  }

  // Carve the shallow mountain creek bed & waterfall plunge pool
  const cd = creekDist(x, z);
  if (dPool < 14) {
    h -= (1 - smooth(7, 14, dPool)) * 1.15;
  } else if (cd < 4.6) {
    h -= (1 - smooth(2.1, 4.6, cd)) * 0.92;
  }

  // Rolling outer valley rim rising into foothills
  if (r > 128) h += smooth(128, 175, r) * 18;
  return h;
}

/** Walkable world elevation: honours solid arched stone bridge decks first so the Scribe NEVER falls through! */
export function heightGlossa(x: number, z: number): number {
  const brY = bridgeHeightAt(x, z);
  if (brY !== null) return brY;
  return terrainHeightGlossa(x, z);
}

/** Build a half-timber Fable/Lexicon stone cottage with shared dynamic night-glow windows (static-batched!). */
function buildCottage(
  x: number, z: number, yaw: number, variant: number, sharedWinMat: THREE.MeshStandardMaterial, withWheel = false,
): { group: THREE.Group; wheel?: THREE.Group } {
  const h = new THREE.Group();
  const w = 5.6 + (variant % 3) * 0.7, d = 4.6 + ((variant + 1) % 2) * 0.7;
  // Fieldstone footing + clay plaster walls + dark timber framing
  h.add(mesh(new THREE.BoxGeometry(w + 0.3, 0.85, d + 0.3), surface('medieval_blocks_02', [3, 0.6]), 0, 0.38, 0));
  h.add(mesh(new THREE.BoxGeometry(w, 3.15, d), surface('clay_plaster', [2, 1.3], variant % 3 === 0 ? 0xe8dcc4 : variant % 3 === 1 ? 0xded2b8 : 0xe4d5bc), 0, 2.0, 0));
  const timber = surface('dark_wooden_planks', [1, 1.6]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    h.add(mesh(new THREE.BoxGeometry(0.24, 3.25, 0.24), timber, sx * (w / 2 + 0.02), 2.0, sz * (d / 2 + 0.02), false));
  }
  h.add(mesh(new THREE.BoxGeometry(w + 0.14, 0.22, d + 0.14), timber, 0, 2.3, 0, false));
  // Steep pitched moss-slate or warm-tile roof + stone chimney + timber porch awning
  const roofTint = variant % 3 === 0 ? 0xc88464 : variant % 3 === 1 ? 0x8ea07a : 0xd0cec2;
  const roof = mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, 2.9, 4), surface('roof_slates_02', [3, 2], roofTint), 0, 4.95, 0);
  roof.rotation.y = Math.PI / 4;
  h.add(roof);
  h.add(mesh(new THREE.BoxGeometry(0.75, 3.0, 0.75), surface('medieval_blocks_02', [1, 2]), w * 0.28, 4.9, -d * 0.22));
  // Cozy porch awning over front door
  h.add(mesh(new THREE.BoxGeometry(1.9, 0.16, 1.1), timber, 0, 2.25, d / 2 + 0.55, false));
  // Door + shared warm amber windows (mergeRigid batches all 72 windows into 1 draw call while keeping live emissive!)
  h.add(mesh(new THREE.BoxGeometry(1.18, 1.98, 0.14), timber, 0, 1.0, d / 2 + 0.04, false));
  for (const s of [-1, 1]) {
    h.add(mesh(new THREE.BoxGeometry(0.8, 0.82, 0.1), sharedWinMat, s * (w * 0.3), 2.1, d / 2 + 0.05, false));
    h.add(mesh(new THREE.BoxGeometry(0.1, 0.78, 0.78), sharedWinMat, s * (w / 2 + 0.05), 2.1, 0, false));
  }

  let wheel: THREE.Group | undefined;
  if (withWheel) {
    wheel = new THREE.Group();
    wheel.userData.dynamic = true;
    wheel.add(mesh(new THREE.TorusGeometry(1.85, 0.14, 8, 20), timber, 0, 0, 0));
    wheel.add(mesh(new THREE.TorusGeometry(1.25, 0.1, 6, 16), timber, 0, 0, 0));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const spoke = mesh(new THREE.BoxGeometry(0.14, 3.7, 0.12), timber, 0, 0, 0, false);
      spoke.rotation.z = a;
      wheel.add(spoke);
      const paddle = mesh(new THREE.BoxGeometry(0.28, 0.14, 0.76), timber, Math.cos(a) * 1.88, Math.sin(a) * 1.88, 0, false);
      paddle.rotation.z = a;
      wheel.add(paddle);
    }
    wheel.position.set(w / 2 + 0.58, 1.4, 0);
    wheel.rotation.y = Math.PI / 2;
    h.add(wheel);
  }

  h.position.set(x, heightGlossa(x, z) - 0.15, z);
  h.rotation.y = yaw;
  return { group: h, wheel };
}

/** Build a crafted timber-and-iron village street lantern post (static-batched + feathery radial light glow!). */
function buildLanternPost(
  x: number, z: number, addLight: boolean,
  sharedBulbMat: THREE.MeshStandardMaterial,
  sharedHaloMat: THREE.MeshBasicMaterial,
  sharedSpriteMat: THREE.SpriteMaterial,
): { group: THREE.Group; light?: THREE.PointLight } {
  const g = new THREE.Group();
  const timber = surface('dark_wooden_planks', [1, 1.5]);
  const iron = mat(0x2e3138);
  g.add(mesh(new THREE.BoxGeometry(0.2, 3.2, 0.2), timber, 0, 1.6, 0, false));
  g.add(mesh(new THREE.BoxGeometry(0.45, 0.35, 0.45), surface('medieval_blocks_02', [1, 1]), 0, 0.18, 0, false));
  g.add(mesh(new THREE.BoxGeometry(0.82, 0.12, 0.12), iron, 0.34, 3.08, 0, false));
  g.add(mesh(new THREE.ConeGeometry(0.24, 0.2, 4), iron, 0.65, 2.95, 0, false));
  g.add(mesh(new THREE.BoxGeometry(0.28, 0.38, 0.28), sharedBulbMat, 0.65, 2.68, 0, false));
  // Soft feathery volumetric lantern halo sprite (never a hard cartoon bubble!)
  const halo = new THREE.Sprite(sharedSpriteMat);
  halo.scale.set(2.4, 2.4, 1);
  halo.position.set(0.65, 2.68, 0);
  halo.userData.dynamic = true;
  // Soft radial light pool painted onto the cobblestones underneath
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 6.4).rotateX(-Math.PI / 2), sharedHaloMat);
  pool.position.set(0.65, 0.08, 0);
  g.add(halo, pool);
  let light: THREE.PointLight | undefined;
  if (addLight) {
    light = new THREE.PointLight(0xffb656, 0, 28, 1.3);
    light.position.set(0.65, 2.6, 0);
    light.userData.dynamic = true;
    g.add(light);
  }
  g.position.set(x, heightGlossa(x, z), z);
  g.rotation.y = Math.atan2(-x, -z);
  return { group: g, light };
}

/** Build an arched stone creek bridge matching bridgeHeightAt() 1-to-1 with warm lantern posts & stone ramps! */
function buildStoneBridge(
  br: { x: number; z: number; yaw: number; len: number; wid: number },
  sharedBulbMat: THREE.MeshStandardMaterial,
): { group: THREE.Group; colliders: Circle[] } {
  const g = new THREE.Group();
  const stoneM = surface('medieval_blocks_02', [3, 1.2], 0xdad4c5);
  const deckM = surface('cobblestone_floor_04', [2, 4], 0xe2dccb);
  const timber = surface('dark_wooden_planks', [1, 1.5]);
  const colliders: Circle[] = [];
  const segs = 9;
  const halfL = br.len * 0.56;
  for (let i = 0; i < segs; i++) {
    const t = (i + 0.5) / segs - 0.5;
    const z = t * br.len;
    const endFade = smooth(halfL, halfL * 0.78, Math.abs(z));
    const topY = Math.max(0, Math.cos((z / halfL) * Math.PI * 0.5) * 0.88 * endFade + 0.24 * endFade);
    const segLen = br.len / segs + 0.22;
    const slab = mesh(new THREE.BoxGeometry(br.wid, 0.44, segLen), deckM, 0, topY - 0.22, z);
    slab.rotation.x = Math.sin(t * Math.PI) * 0.22;
    g.add(slab);
    for (const s of [-1, 1]) {
      const wall = mesh(new THREE.BoxGeometry(0.36, 0.88, segLen), stoneM, s * (br.wid * 0.5), topY + 0.34, z);
      wall.rotation.x = slab.rotation.x;
      g.add(wall);
    }
  }
  // Stone arch abutments & approach paving + warm dusk-igniting corner lanterns
  for (const sz of [-1, 1]) {
    g.add(mesh(new THREE.BoxGeometry(br.wid + 0.6, 1.8, 1.6), stoneM, 0, -0.7, sz * (br.len * 0.48)));
    const post = new THREE.Group();
    post.add(mesh(new THREE.BoxGeometry(0.18, 2.8, 0.18), timber, 0, 1.4, 0, false));
    post.add(mesh(new THREE.BoxGeometry(0.75, 0.14, 0.14), timber, -0.32 * sz, 2.7, 0, false));
    post.add(mesh(new THREE.BoxGeometry(0.28, 0.36, 0.28), sharedBulbMat, -0.58 * sz, 2.42, 0, false));
    post.position.set((br.wid * 0.54) * sz, 0.18, sz * (br.len * 0.44));
    g.add(post);
  }
  g.position.set(br.x, 0, br.z);
  g.rotation.y = br.yaw;
  return { group: g, colliders };
}

/** Build sculpted multi-tiered Grand Triple Waterfall Cliff, perched cliff pines, shimmering cascades & hidden veil cave! */
function buildGrandWaterfall(): {
  group: THREE.Group;
  update: (dt: number, t: number, nightK: number) => void;
  colliders: Circle[];
} {
  const g = new THREE.Group();
  const colliders: Circle[] = [];
  const rockMat = surface('medieval_blocks_02', [5, 4], 0x7a7b74);
  const darkRock = surface('medieval_blocks_02', [4, 4], 0x5c605c);
  const mossCap = surface('forest_ground_04', [4, 4], 0x5d6e43);
  const pineMat = mat(0x314a2c);
  const barkMat = mat(PAL.bark);

  // Sculpted organic terraced limestone amphitheater (36 m tall!) behind (-66, -26) — craggy boulders + layered strata!
  const cliffStrata: [number, number, number, number, number, number][] = [
    [-73, 17, -26, 18, 36, 42],   // towering central cliff massif
    [-69, 14, -50, 16, 30, 22],   // northern stepped cliff wing
    [-68, 13, -3, 16, 28, 22],    // southern stepped cliff wing
    [-64, 5, -45, 11, 11, 12],    // lower mossy northern shelf
    [-63, 4.5, -7, 11, 10, 12],   // lower mossy southern shelf
    [-66, 21, -26, 9, 4.5, 32],   // overhanging cliff lip casting shadow over behind-the-veil cave
  ];
  for (const [x, y, z, w, h, d] of cliffStrata) {
    g.add(mesh(new THREE.BoxGeometry(w, h, d), rockMat, x, y, z));
    g.add(mesh(new THREE.BoxGeometry(w + 1.2, 1.8, d + 1.2), mossCap, x, y + h / 2 + 0.5, z, false));
  }
  // Organic craggy rock buttresses sculpted along the cliff face so it never looks like flat rectangular boxes!
  for (let i = 0; i < 24; i++) {
    const cz = -54 + i * 2.4;
    const cx = -63.5 + Math.sin(i * 1.7) * 2.4 - (Math.abs(cz + 26) < 9 ? 2.5 : 0);
    const cy = 6 + (i % 4) * 6.2;
    const rad = 3.2 + (i % 3) * 1.6;
    const crag = mesh(new THREE.DodecahedronGeometry(rad, 1), i % 2 ? rockMat : darkRock, cx, cy, cz);
    crag.scale.set(0.9, 1.45, 1.15);
    crag.rotation.set(i * 0.4, i * 0.7, i * 0.2);
    g.add(crag);
  }
  // Lush cliff-top pine silhouettes perched along the waterfall crest (34 m up!)
  for (let i = 0; i < 16; i++) {
    const pz = -54 + i * 3.6;
    const px = -67 - (i % 3) * 2.8;
    const hBase = Math.abs(pz + 26) < 18 ? 35 : 28.5;
    const sc = 0.9 + (i % 4) * 0.35;
    g.add(mesh(new THREE.CylinderGeometry(0.28 * sc, 0.42 * sc, 3.2 * sc, 6), barkMat, px, hBase + 1.4 * sc, pz, false));
    g.add(mesh(new THREE.ConeGeometry(2.6 * sc, 7.5 * sc, 7), pineMat, px, hBase + 5.8 * sc, pz, false));
    g.add(mesh(new THREE.ConeGeometry(1.9 * sc, 5.8 * sc, 7), pineMat, px, hBase + 9.2 * sc, pz, false));
  }
  // Faceted granite crags framing ONLY the far left/right flanks of the plunge pool (leaving the waterfall & pool wide open!)
  const graniteMat = mat(0x5f6866, 0, true);
  for (let i = 0; i < 14; i++) {
    const a = (i / 13) * Math.PI * 1.15 - Math.PI * 0.575;
    const rad = 13.5 + (i % 3) * 2.2;
    const bx = -56 + Math.cos(a) * rad, bz = -26 + Math.sin(a) * rad;
    // Keep the entire waterfall view corridor & promenade trail wide open!
    if (bx > -52 && Math.abs(bz + 24) < 12) continue;
    const sc = 1.4 + (i % 3) * 0.5;
    const rock = mesh(new THREE.DodecahedronGeometry(sc, 0), i % 2 ? graniteMat : darkRock, bx, terrainHeightGlossa(bx, bz) + sc * 0.36, bz);
    rock.scale.set(1.25, 0.72, 1.1);
    rock.rotation.set(i * 0.5, i * 0.8, 0.15);
    g.add(rock);
    colliders.push({ x: bx, z: bz, r: sc * 0.82 });
  }

  // Dark cave mouth recessed behind the waterfall curtain + glowing cyan crystal shards
  g.add(mesh(new THREE.BoxGeometry(5.5, 9.2, 10), new THREE.MeshBasicMaterial({ color: 0x0b161e }), -63.5, 4.2, -26, false));
  for (const [cx, cy, cz] of [[-61.4, 1.4, -29.2], [-61.2, 2.2, -22.5], [-61.8, 5.6, -27.4]]) {
    const cr = mesh(new THREE.OctahedronGeometry(0.48), mat(PAL.cyan, 0x4ae8ef), cx, cy, cz, false);
    cr.scale.set(0.55, 1.85, 0.55);
    g.add(cr);
  }

  // Weathered wooden climb ladder right behind the curtain edge
  const timber = surface('dark_wooden_planks', [1, 2]);
  const ladder = new THREE.Group();
  ladder.add(mesh(new THREE.BoxGeometry(0.14, 6.2, 0.14), timber, 0, 3.1, -0.5, false));
  ladder.add(mesh(new THREE.BoxGeometry(0.14, 6.2, 0.14), timber, 0, 3.1, 0.5, false));
  for (let r = 0; r < 11; r++) {
    ladder.add(mesh(new THREE.BoxGeometry(0.12, 0.1, 1.1), timber, 0.04, 0.5 + r * 0.54, 0, false));
  }
  ladder.position.set(-60.6, -0.2, -25.5);
  ladder.rotation.z = -0.18;
  g.add(ladder);
  const caveSign = textSprite('Veil Grotto (Behind Falls)', { size: 42, scale: 0.55, color: '#b1f9f6', bg: 'rgba(12,26,38,.72)' });
  caveSign.position.set(-59.5, 4.8, -25.5);
  g.add(caveSign);

  // Rich dual-layer animated waterfall textures (primary whitewater + secondary sparkling mist veil!)
  const makeWaterTex = (sparkle: boolean) => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 256;
    const x = c.getContext('2d')!;
    const gr = x.createLinearGradient(0, 0, 128, 0);
    gr.addColorStop(0, 'rgba(175,228,242,0.06)');
    gr.addColorStop(0.18, sparkle ? 'rgba(230,250,255,0.45)' : 'rgba(190,238,248,0.82)');
    gr.addColorStop(0.5, sparkle ? 'rgba(255,255,255,0.68)' : 'rgba(240,252,255,0.94)');
    gr.addColorStop(0.82, sparkle ? 'rgba(230,250,255,0.45)' : 'rgba(190,238,248,0.82)');
    gr.addColorStop(1, 'rgba(175,228,242,0.06)');
    x.fillStyle = gr; x.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 64; i++) {
      x.fillStyle = i % 3 === 0 ? 'rgba(255,255,255,0.58)' : 'rgba(110,194,214,0.34)';
      x.fillRect((i * 19) % 116 + 4, (i * 41) % 230, 2 + (i % 5), 26 + (i % 34));
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const fallTex1 = makeWaterTex(false);
  const fallTex2 = makeWaterTex(true);
  const fallMat1 = new THREE.MeshBasicMaterial({ map: fallTex1, transparent: true, opacity: 0.86, side: THREE.DoubleSide, depthWrite: false });
  const fallMat2 = new THREE.MeshBasicMaterial({ map: fallTex2, transparent: true, opacity: 0.54, side: THREE.DoubleSide, depthWrite: false });

  const fallsGroup = new THREE.Group();
  fallsGroup.userData.dynamic = true;
  const sheets: [number, number, number, number, number][] = [
    [-59.2, 16.5, -26, 12.8, 34],   // main central roaring falls
    [-60.8, 14.5, -40, 5.2, 30],    // north flank cascade
    [-60.8, 13.8, -12, 5.0, 28],    // south flank cascade
  ];
  for (const [x, y, z, w, h] of sheets) {
    const p1 = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 4, 8), fallMat1);
    p1.position.set(x, y, z); p1.rotation.y = Math.PI / 2;
    const p2 = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.08, h, 4, 8), fallMat2);
    p2.position.set(x + 0.55, y, z); p2.rotation.y = Math.PI / 2;
    fallsGroup.add(p1, p2);
  }
  // Sparkling plunge pool foam & concentric animated ripples
  const foam = new THREE.Mesh(
    new THREE.CircleGeometry(11.5, 28).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xe6f9fc, transparent: true, opacity: 0.58, depthWrite: false }),
  );
  foam.position.set(-55.8, -0.32, -26);
  const ripple = new THREE.Mesh(
    new THREE.RingGeometry(8.2, 10.6, 28).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  ripple.position.set(-55.5, -0.30, -26);
  fallsGroup.add(foam, ripple);

  // Sunlit prism rainbow arc (fades gently away at night!)
  const rainbowGroup = new THREE.Group();
  const rainbowColors = [0xff8888, 0xffcc77, 0xffee88, 0x88e8a8, 0x88d4ff, 0xb89aff];
  for (let i = 0; i < rainbowColors.length; i++) {
    const rArc = new THREE.Mesh(
      new THREE.TorusGeometry(10.4 - i * 0.25, 0.15, 6, 30, Math.PI * 0.84),
      new THREE.MeshBasicMaterial({ color: rainbowColors[i], transparent: true, opacity: 0.24, depthWrite: false, side: THREE.DoubleSide }),
    );
    rArc.position.set(-53.5, 1.0, -22.5);
    rArc.rotation.y = Math.PI * 0.36;
    rainbowGroup.add(rArc);
  }
  fallsGroup.add(rainbowGroup);

  // Rising mist spray particles
  const mistGeo = new THREE.BufferGeometry();
  const mistCount = 150;
  const mistPos = new Float32Array(mistCount * 3);
  for (let i = 0; i < mistCount; i++) {
    mistPos[i * 3] = -56 + (Math.random() - 0.5) * 16;
    mistPos[i * 3 + 1] = Math.random() * 10;
    mistPos[i * 3 + 2] = -26 + (Math.random() - 0.5) * 30;
  }
  mistGeo.setAttribute('position', new THREE.BufferAttribute(mistPos, 3));
  const mistPts = new THREE.Points(
    mistGeo,
    new THREE.PointsMaterial({ color: 0xeaf8ff, size: 1.7, transparent: true, opacity: 0.36, depthWrite: false }),
  );
  fallsGroup.add(mistPts);
  g.add(fallsGroup);

  return {
    group: g,
    colliders,
    update(dt, t, nightK) {
      fallTex1.offset.y = (t * 1.18) % 1;
      fallTex2.offset.y = (t * 1.62) % 1;
      foam.scale.setScalar(1 + Math.sin(t * 3.2) * 0.04);
      const rp = (t * 0.45) % 1;
      ripple.scale.setScalar(0.65 + rp * 0.7);
      (ripple.material as THREE.MeshBasicMaterial).opacity = (1 - rp) * 0.38;
      rainbowGroup.visible = nightK < 0.7;
      const mp = mistGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < mistCount; i++) {
        let y = mp.getY(i) + dt * (1.5 + (i % 4) * 0.4);
        if (y > 10.5) y = 0.2;
        mp.setY(i, y);
      }
      mp.needsUpdate = true;
    },
  };
}

/** Build rich layered distant alpine mountain ridges, pine crests & ruined stone landmarks around the valley horizon! */
function buildDistantHorizon(): THREE.Group {
  const g = new THREE.Group();
  const nearRidge = mat(0x55644a, 0, true);
  const farPeak = mat(0x63737c, 0, true);
  const snowCap = mat(0xd8ddd6, 0, true);
  const ruinStone = surface('medieval_blocks_02', [2, 2], 0x9b9687);

  // 28 sculpted alpine peaks ringing the 165 m – 220 m valley perimeter so every horizon vista feels painterly & grand!
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const r = 168 + (i % 3) * 18;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = 34 + (i % 5) * 11 + (Math.cos(a * 3) + 1) * 8;
    const w = 32 + (i % 4) * 10;
    const peak = mesh(new THREE.ConeGeometry(w, h, 6), i % 2 === 0 ? nearRidge : farPeak, x, h * 0.44 - 2, z, false);
    peak.rotation.y = a * 2.1;
    g.add(peak);
    if (h > 48) {
      const cap = mesh(new THREE.ConeGeometry(w * 0.34, h * 0.28, 6), snowCap, x, h * 0.8 + 0.5, z, false);
      cap.rotation.y = peak.rotation.y;
      g.add(cap);
    }
  }
  // Distant hilltop ruined watchtower on the northeast ridge (storytelling silhouette!)
  const tower = new THREE.Group();
  tower.position.set(112, heightGlossa(112, -88), -88);
  tower.add(mesh(new THREE.CylinderGeometry(3.2, 4.0, 14, 8), ruinStone, 0, 7, 0, false));
  tower.add(mesh(new THREE.TorusGeometry(3.6, 0.5, 6, 8), ruinStone, 0, 14, 0, false));
  g.add(tower);

  // Distant ancient stone aqueduct arches silhouetted along the southeast foothills
  for (let i = 0; i < 6; i++) {
    const ax = 95 + i * 9.5, az = 64 - i * 4.5;
    const ay = heightGlossa(ax, az);
    g.add(mesh(new THREE.BoxGeometry(2.2, 11, 2.2), ruinStone, ax, ay + 5.5, az, false));
    if (i < 5) {
      g.add(mesh(new THREE.BoxGeometry(11.2, 1.8, 2.0), ruinStone, ax + 4.75, ay + 10.6, az - 2.25, false));
    }
  }
  return g;
}

/** Build handcrafted trade workshops & village square details matching each villager's trade! */
function buildTradeProps(): { group: THREE.Group; forgeLight: THREE.PointLight } {
  const g = new THREE.Group();
  const timber = surface('dark_wooden_planks', [1, 1.5]);
  const stone = surface('medieval_blocks_02', [2, 2], 0x7e786c);

  // 1. Tolo's Blacksmith Forge Hearth & Iron Anvil (-19, 14.5)
  g.add(mesh(new THREE.BoxGeometry(2.2, 1.4, 1.8), stone, -18.2, 0.7, 15.2));
  g.add(mesh(new THREE.BoxGeometry(1.2, 0.35, 1.0), mat(0xff6a1a, 0xff4500), -18.2, 1.45, 15.2, false));
  g.add(mesh(new THREE.BoxGeometry(0.95, 0.65, 0.5), mat(0x2e3038), -17.4, 0.45, 12.8)); // iron anvil!
  const forgeLight = new THREE.PointLight(0xff7722, 28, 16, 1.5);
  forgeLight.position.set(-18.2, 2.2, 15.2);
  forgeLight.userData.dynamic = true;
  g.add(forgeLight);

  // 2. Selene's Colorful Outdoor Weaving Loom & Tapestry Rack (18.5, 4.5)
  g.add(mesh(new THREE.BoxGeometry(0.18, 2.6, 0.18), timber, 18.6, 1.3, 3.4, false));
  g.add(mesh(new THREE.BoxGeometry(0.18, 2.6, 0.18), timber, 18.6, 1.3, 5.6, false));
  g.add(mesh(new THREE.BoxGeometry(0.2, 0.2, 2.5), timber, 18.6, 2.55, 4.5, false));
  g.add(mesh(new THREE.BoxGeometry(0.08, 1.75, 1.9), mat(0xc86a42), 18.6, 1.5, 4.5, false));

  // 3. Maya's Alchemist Bench & Glowing Vials (-29.5, 6.2)
  g.add(mesh(new THREE.BoxGeometry(2.1, 0.95, 0.9), timber, -29.5, 0.48, 6.2, false));
  g.add(mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.42, 8), mat(PAL.cyan, 0x3ef0f6), -29.8, 1.15, 6.2, false));
  g.add(mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.38, 8), mat(0xffcf55, 0xffa822), -29.1, 1.13, 6.2, false));

  // 4. Kaelen's Herbalist Flower & Moon-Herb Planter Beds (27.5, -14.2)
  for (let i = 0; i < 3; i++) {
    g.add(mesh(new THREE.BoxGeometry(2.4, 0.42, 1.2), timber, 27.5, 0.21, -14.2 - i * 1.9, false));
    g.add(mesh(new THREE.BoxGeometry(2.1, 0.25, 0.95), mat(0x4b7c46, 0x164a38), 27.5, 0.48, -14.2 - i * 1.9, false));
  }

  // 5. Zora's Cartographer Brass Astrolabe Plinth (-22.5, -19.5)
  const zy = heightGlossa(-22.5, -19.5);
  g.add(mesh(new THREE.CylinderGeometry(0.45, 0.6, 1.3, 10), stone, -22.5, zy + 0.65, -19.5, false));
  g.add(mesh(new THREE.TorusGeometry(0.55, 0.05, 8, 20), mat(PAL.brass, 0x4a3400), -22.5, zy + 1.85, -19.5, false));

  // 6. East Market Wooden Stalls (colorful canvas awnings along the East Road!)
  for (const [mx, mz, col] of [[28, 11, 0xb84e39], [31, 16, 0x3f6f8a]] as const) {
    const my = heightGlossa(mx, mz);
    g.add(mesh(new THREE.BoxGeometry(3.2, 0.95, 1.4), timber, mx, my + 0.48, mz));
    for (const sx of [-1.45, 1.45]) g.add(mesh(new THREE.BoxGeometry(0.14, 2.5, 0.14), timber, mx + sx, my + 1.25, mz - 0.55, false));
    const awn = mesh(new THREE.BoxGeometry(3.5, 0.14, 2.0), mat(col), mx, my + 2.55, mz, false);
    awn.rotation.x = 0.22;
    g.add(awn);
  }
  return { group: g, forgeLight };
}

// ── Build Glossa Hollow Valley (Expanded Living Village, Solid Bridges, Night Lanterns, Wildlife & Horizon) ──
export function buildGlossa(): BuiltLevel {
  const group = new THREE.Group(); group.name = 'lexicon.glossa';
  const circles: Circle[] = [], boxes: Box[] = [];
  const waterwheels: THREE.Group[] = [];
  const sharedWinMat = new THREE.MeshStandardMaterial({
    color: 0xffd584, emissive: 0xffa638, emissiveIntensity: 0.45, roughness: 0.4,
  });
  const sharedLanternBulbMat = new THREE.MeshStandardMaterial({
    color: 0xffe4a0, emissive: 0xffa838, emissiveIntensity: 0.15, roughness: 0.3,
  });
  const warmGlowTex = makeSoftGlowTexture('rgba(255,238,175,0.9)', 'rgba(255,168,54,0.32)');
  const sharedLanternHaloMat = new THREE.MeshBasicMaterial({
    map: warmGlowTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const sharedLanternSpriteMat = new THREE.SpriteMaterial({
    map: warmGlowTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const lanternLights: THREE.PointLight[] = [];

  // Expanded 380 m x 380 m valley terrain (uses terrainHeightGlossa so creek flows cleanly UNDER every stone arch bridge!)
  const geo = new THREE.PlaneGeometry(380, 380, 190, 190); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const grass = new THREE.Color(0x56643a), grass2 = new THREE.Color(0x8a9152), sand = new THREE.Color(0xc9b98e), road = new THREE.Color(PAL.stone), cliff = new THREE.Color(0x6d695d);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = terrainHeightGlossa(x, z);
    pos.setY(i, h);
    const r = Math.hypot(x, z);
    const cd = creekDist(x, z);
    c.copy(grass).lerp(grass2, fbm(x * 0.06, z * 0.06));
    if (r < 17 || (z < -6 && z > -70 && Math.abs(x) < 3.4)) c.lerp(road, 0.55 + 0.35 * fbm(x * 0.5, z * 0.5));
    // Cobbled West Craft Terrace & Waterfall Promenade connecting Bridge 1 -> Bridge 2 -> Waterfall!
    if (cd > 4.2 && cd < 9.5 && x < 2 && x > -52 && z < 16 && z > -28) c.lerp(road, 0.52);
    // East Market & Wilderness Cobble Road
    if (x > 14 && x < 92 && Math.abs(z - 14) < 3.8) c.lerp(road, 0.48);
    if (cd < 5.0 || Math.hypot(x + 56, z + 26) < 14) c.lerp(sand, 0.6);
    if (h > 8) c.lerp(cliff, smooth(8, 22, h));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, groundMaterial());
  ground.receiveShadow = true; group.add(ground);

  // Sparkling valley creek & plunge pool water surface
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x3b7c8e, roughness: 0.14, metalness: 0.12, transparent: true, opacity: 0.86,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(380, 380).rotateX(-Math.PI / 2), waterMat);
  water.position.y = -0.42; group.add(water);

  // Forest & rolling hills tree spots (keeps all 18 cottages, bridges, roads & plazas clear!)
  const treeSpots: TreeSpot[] = [];
  const blocked = (x: number, z: number) =>
    Math.hypot(x, z) < 34 ||
    (Math.abs(x) < 46 && z < -58) ||
    (Math.abs(x) < 9 && z < -4 && z > -70) ||
    (x > 12 && x < 96 && Math.abs(z - 14) < 9) ||
    creekDist(x, z) < 9.5 ||
    Math.hypot(x + 56, z + 26) < 20 ||
    (x < -54 && z > -58 && z < 8) ||
    GLOSSA_HOUSES.some(([hx, hz]) => Math.hypot(hx - x, hz - z) < 9) ||
    GLOSSA_BRIDGES.some((b) => Math.hypot(b.x - x, b.z - z) < 10) ||
    SIGILS.some((s) => s.level === 'glossa' && Math.hypot(s.pos[0] - x, s.pos[1] - z) < 6) ||
    treeSpots.some((t) => Math.hypot(t.x - x, t.z - z) < (t.species === 0 ? 10 : 5.4));
  for (let i = 0; i < 2800 && treeSpots.length < 230; i++) {
    const a = hash(i, 3) * Math.PI * 2, r = 34 + hash(i, 9) * 105;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (blocked(x, z) || heightGlossa(x, z) < -0.2) continue;
    const giants = treeSpots.filter((t) => t.species === 0).length;
    const species = r < 60 && giants < 18 && hash(i, 7) > 0.55 ? 0 : r > 80 && hash(i, 8) > 0.4 ? 2 : 1;
    const scale = species === 0 ? 0.95 + hash(i, 5) * 0.4 : 0.8 + hash(i, 5) * 0.55;
    treeSpots.push({ x, y: heightGlossa(x, z) - 0.15, z, yaw: a * 3.1, species, scale });
    circles.push({ x, z, r: (species === 0 ? 3.2 : species === 1 ? 1.1 : 0.7) * scale });
  }

  // 18 expanded Glossa Hollow cottages & mills (facing cleanly toward the nearest square/road!)
  GLOSSA_HOUSES.forEach(([hx, hz], idx) => {
    const yaw = Math.atan2(-hx, -hz);
    const hasWheel = idx === 6 || idx === 16; // Tolo's Forge Mill & South Riverside Grain Mill!
    const { group: cg, wheel } = buildCottage(hx, hz, yaw, idx, sharedWinMat, hasWheel);
    group.add(cg);
    if (wheel) waterwheels.push(wheel);
    circles.push({ x: hx, z: hz, r: 3.5 });
  });

  // 3 logically placed, 100% solid arched stone creek bridges
  for (const br of GLOSSA_BRIDGES) {
    const b = buildStoneBridge(br, sharedLanternBulbMat);
    group.add(b.group);
  }

  // 18 Crafted Village Walkway Lantern Posts (all 18 verified on dry banks/roads, static-batched with radial light glows!)
  const lanternCoords: [number, number, boolean][] = [
    [6, 6, true], [-6, 6, false], [7, -7, false], [-7, -7, false],            // Central Square
    [-5.5, -20, true], [5.5, -34, false], [-5.5, -48, false], [5.5, -60, false], // North Temple Road
    [-20, 9, true], [-22, -9, false], [-37, -22, false], [-42, -33, false],   // West Terrace & Waterfall Promenade (dry bank!)
    [19, 12, true], [32, 11, false], [48, 12, false], [66, 12, false],        // East Market & Wilderness Road
    [2, 26, false], [10, 35, false],                                          // South Mill Road (dry bank!)
  ];
  for (const [lx, lz, hasLight] of lanternCoords) {
    const lp = buildLanternPost(lx, lz, hasLight, sharedLanternBulbMat, sharedLanternHaloMat, sharedLanternSpriteMat);
    group.add(lp.group);
    if (lp.light) lanternLights.push(lp.light);
    circles.push({ x: lx, z: lz, r: 0.35 });
  }

  // Trade workshops, glowing forge hearth, weaver loom, apothecary bench, astrolabe & market stalls
  const trade = buildTradeProps();
  group.add(trade.group);

  // Sculpted Grand Triple Waterfall Cliff + Distant Alpine Mountain Horizon & Landmarks
  const waterfall = buildGrandWaterfall();
  group.add(waterfall.group);
  circles.push(...waterfall.colliders);
  group.add(buildDistantHorizon());

  // Living Woodland Wildlife (18 butterflies, 8 squirrels, 10 soaring valley birds!)
  const wildlife = createWildlife(heightGlossa, 95);
  group.add(wildlife.group);

  // The Word Well (save point + Archive) at village center
  const well = new THREE.Group();
  well.add(mesh(new THREE.CylinderGeometry(1.7, 1.9, 1, 12, 1, true), surface('medieval_blocks_02', [3, 1]), 0, 0.5, 0));
  const glow = mesh(new THREE.CircleGeometry(1.6, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe6a0 }), 0, 0.72, 0, false);
  well.add(glow);
  const timber = surface('dark_wooden_planks', [1, 1.6]);
  well.add(mesh(new THREE.BoxGeometry(0.25, 2.7, 0.25), timber, -1.6, 1.35, 0), mesh(new THREE.BoxGeometry(0.25, 2.7, 0.25), timber, 1.6, 1.35, 0));
  well.add(mesh(new THREE.ConeGeometry(2.5, 1.3, 4).rotateY(Math.PI / 4), mat(PAL.navy), 0, 3.2, 0));
  group.add(well); circles.push({ x: 0, z: 0, r: 2.0 });

  // East Trailhead Archway to the Great Forest Wilderness
  const wildGate = new THREE.Group();
  wildGate.position.set(78, heightGlossa(78, 14), 14);
  wildGate.rotation.y = -Math.PI / 2;
  const stMat = surface('medieval_blocks_02', [2, 2], 0x9c9888);
  wildGate.add(mesh(new THREE.BoxGeometry(1.1, 4.6, 1.1), stMat, -2.8, 2.3, 0));
  wildGate.add(mesh(new THREE.BoxGeometry(1.1, 4.6, 1.1), stMat, 2.8, 2.3, 0));
  wildGate.add(mesh(new THREE.BoxGeometry(7.0, 1.0, 1.3), stMat, 0, 4.9, 0));
  const wSign = textSprite('Great Forest Wilderness →', { size: 46, scale: 0.65, color: '#b1f9f6', bg: 'rgba(18,34,28,.75)' });
  wSign.position.set(0, 6.2, 0);
  wildGate.add(wSign);
  group.add(wildGate);

  // Letter stones along the north road to the Cipher Gate
  const letters = 'LEXICONWORDS';
  for (let i = 0; i < letters.length; i++) {
    const side = i % 2 ? 1 : -1, z = -10 - i * 4.6, x = side * 4.6;
    const st = mesh(new THREE.BoxGeometry(1.1, 2.4, 0.5), mat(0x8d8a80), x, heightGlossa(x, z) + 1.2, z);
    st.rotation.y = side * 0.25; group.add(st); circles.push({ x, z, r: 0.7 });
    const lab = textSprite(letters[i], { size: 80, color: '#ffe9a8', scale: 0.9 });
    lab.position.set(x, heightGlossa(x, z) + 1.6, z + 0.3); group.add(lab);
  }

  // All 12 Glossa Hollow villagers (dynamic living holders upgraded to 58-joint Character Forge GLBs!)
  const villagers = new Map<string, THREE.Group>();
  for (const v of VILLAGERS) {
    const g = personModel(v.color, 0xf0c9a0);
    g.position.set(v.pos[0], heightGlossa(v.pos[0], v.pos[1]), v.pos[1]);
    g.rotation.y = v.yaw ?? Math.atan2(-v.pos[0], -v.pos[1]);
    const tag = textSprite(v.name, { size: 38, scale: 0.42, bg: 'rgba(20,26,46,.62)' });
    tag.position.y = v.height + 0.52;
    g.add(tag);
    g.userData.dynamic = true;
    group.add(g);
    villagers.set(v.id, g);
  }

  // Song Sigils
  const sigils = new Map<string, SigilView>();
  for (const def of SIGILS.filter((s) => s.level === 'glossa')) {
    const g = new THREE.Group(); g.userData.dynamic = true;
    g.position.set(def.pos[0], heightGlossa(def.pos[0], def.pos[1]), def.pos[1]);
    group.add(g); circles.push({ x: def.pos[0], z: def.pos[1], r: 1.1 });
    let apply: (s: boolean) => void = () => {};
    if (def.power === 'light') {
      g.add(mesh(new THREE.BoxGeometry(0.3, 3, 0.3), mat(0x3d3a36), 0, 1.5, 0));
      const lamp = mesh(new THREE.OctahedronGeometry(0.55), mat(0x555048), 0, 3.3, 0); g.add(lamp);
      apply = (s) => { lamp.material = s ? mat(0xffe08a, 0xffb84a) : mat(0x555048); };
    } else if (def.power === 'grow') {
      const t = new THREE.Group();
      t.add(mesh(new THREE.CylinderGeometry(0.2, 0.35, 3, 6).translate(0, 1.5, 0), mat(0x6b4a2f)), mesh(new THREE.IcosahedronGeometry(1.8, 0).translate(0, 3.8, 0), mat(0xd77fa1)));
      g.add(t); t.scale.setScalar(0.22); g.add(mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.2, 10), mat(0x8a6a4a), 0, 0.1, 0));
      apply = (s) => t.scale.setScalar(s ? 1.2 : 0.22);
    } else if (def.power === 'water') {
      g.add(mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.8, 12), mat(0xb7ad98), 0, 0.4, 0));
      const wt = mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.1, 12), new THREE.MeshStandardMaterial({ color: 0x6fc0ee, emissive: 0x1b4a6a }), 0, 0.82, 0, false);
      wt.visible = false; g.add(wt);
      g.add(mesh(new THREE.CylinderGeometry(0.25, 0.3, 1.8, 8), mat(0xb7ad98), 0, 1.2, 0));
      apply = (s) => { wt.visible = s; };
    } else if (def.power === 'open') {
      g.add(mesh(new THREE.BoxGeometry(1.6, 0.9, 1.1), mat(0x7a4e2a), 0, 0.45, 0));
      const lid = new THREE.Group(); lid.position.set(0, 0.9, -0.55);
      lid.add(mesh(new THREE.BoxGeometry(1.6, 0.35, 1.1), mat(0x8d5d33), 0, 0.17, 0.55)); g.add(lid);
      const lock = mesh(new THREE.BoxGeometry(0.35, 0.35, 0.1), mat(0xe8e4d8), 0, 0.8, 0.57); g.add(lock);
      apply = (s) => { lid.rotation.x = s ? -1.9 : 0; lock.visible = !s; };
    } else if (def.power === 'time') {
      g.add(mesh(new THREE.CylinderGeometry(1.4, 1.6, 0.9, 16), mat(0xcfc6ae), 0, 0.45, 0));
      const gn = mesh(new THREE.ConeGeometry(0.15, 1.6, 4), mat(0x8a7a50), 0, 1.6, 0); gn.rotation.z = 0.5; g.add(gn);
      apply = (s) => { gn.rotation.z = s ? -0.5 : 0.5; gn.material = s ? mat(0xffd36a, 0x6a4a00) : mat(0x8a7a50); };
    }
    sigils.set(def.id, sigilView(def, g, apply));
  }

  // Temple grounds: wall, Cipher Gate, temple exterior
  const gates = new Map<string, Gate>();
  const wall = (x1: number, z1: number, x2: number, z2: number, h = 3.2) => {
    const w = Math.max(0.8, Math.abs(x2 - x1)), d = Math.max(0.8, Math.abs(z2 - z1));
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    group.add(mesh(new THREE.BoxGeometry(w, h, d), mat(0xa39d8e), cx, heightGlossa(cx, cz) + h / 2 - 0.3, cz));
    boxes.push({ minx: cx - w / 2, maxx: cx + w / 2, minz: cz - d / 2, maxz: cz + d / 2 });
  };
  wall(-44, -66, -3.2, -66); wall(3.2, -66, 44, -66); wall(-44, -66, -44, -100); wall(44, -66, 44, -100);
  for (const s of [-1, 1]) group.add(mesh(new THREE.BoxGeometry(1.2, 6, 1.2), mat(0x8f887a), s * 3.6, 3, -66));
  group.add(mesh(new THREE.BoxGeometry(8.4, 1.2, 1.4), mat(0x8f887a), 0, 6.4, -66));
  const gateObj = new THREE.Group(); gateObj.userData.dynamic = true;
  for (let i = -2; i <= 2; i++) gateObj.add(mesh(new THREE.BoxGeometry(0.18, 5, 0.18), mat(0x4a4f63), i * 1.2, 2.5, -66));
  const gateSign = textSprite('?', { size: 90, color: '#ffe08a', scale: 1.4 });
  gateSign.position.set(0, 5.1, -65.2); gateObj.add(gateSign);
  gateObj.userData.sign = gateSign;
  group.add(gateObj);
  const gateBox: Box = { minx: -3.2, maxx: 3.2, minz: -66.6, maxz: -65.4 };
  boxes.push(gateBox); gates.set('cipher', { id: 'cipher', obj: gateObj, box: gateBox, open: false });

  const temple = new THREE.Group();
  temple.add(mesh(new THREE.BoxGeometry(28, 10, 14), surface('medieval_blocks_02', [6, 3], 0xc9c2b0), 0, 5, -85));
  temple.add(mesh(new THREE.BoxGeometry(31, 1.4, 16), mat(0x968f80), 0, 10.6, -85));
  temple.add(mesh(new THREE.ConeGeometry(12, 6, 4).rotateY(Math.PI / 4), mat(0x6f6a5e), 0, 14.2, -85));
  for (let i = -3; i <= 3; i++) if (i) temple.add(mesh(new THREE.CylinderGeometry(0.6, 0.7, 9, 8), mat(0xd8d1bd), i * 3.8, 4.5, -77.4));
  temple.add(mesh(new THREE.PlaneGeometry(5, 6.5), new THREE.MeshBasicMaterial({ color: 0x07060b }), 0, 3.25, -77.95, false));
  const tsign = textSprite('∑ TEMPLE OF NUMERALS ∑', { size: 48, color: '#2a2418', scale: 0.9 });
  tsign.position.set(0, 8.4, -77.6); temple.add(tsign);
  group.add(temple);
  boxes.push({ minx: -14, maxx: -2.5, minz: -92, maxz: -78 }, { minx: 2.5, maxx: 14, minz: -92, maxz: -78 }, { minx: -2.5, maxx: 2.5, minz: -92, maxz: -79.2 });

  const m = motes(280, 230, new THREE.Vector3(0, 0, -10)); group.add(m);

  const portals: LevelPortal[] = [
    {
      id: 'waterfall-cavern',
      label: 'Climb ladder behind the waterfall → Veil Crystal Grotto',
      x: -59.5, z: -25.5, r: 4.8, target: 'cavern', spawn: [0, 0, 12], yaw: Math.PI,
    },
    {
      id: 'east-wilds',
      label: 'Enter the Great Forest Wilderness',
      x: 78, z: 14, r: 4.8, target: 'wilds', spawn: [-52, 0, -74], yaw: 0.3,
    },
  ];

  return {
    id: 'glossa', name: 'Glossa Hollow Valley', outdoor: true, group, heightAt: heightGlossa,
    circles, boxes, gates, sigils, villagers, portals, interactables: [], grappleAnchors: [], hazards: [],
    well: new THREE.Vector3(0, 0, 0), treeSpots,
    constrain(x, z) {
      const cx = Math.max(-62.0, Math.min(132, x));
      const r = Math.hypot(cx, z), R = 136;
      return r > R ? [cx * R / r, z * R / r] : [cx, z];
    },
    torches: lanternLights, braziers: [], pillars: [],
    sky: { day: 0xa3bfce, night: 0x0d1430, fog: 0xcfd6c8, fogNear: 50, fogFar: 225 },
    motes: m,
    update(dt, t, _timeSlow = 1, nightK = 0, px = 0, pz = 0) {
      waterfall.update(dt, t, nightK);
      wildlife.update(dt, t, px, pz, nightK);
      for (const w of waterwheels) w.rotation.z -= dt * 0.9;
      // Ignite all 18 walkway lanterns & cozy home windows smoothly as dusk & night arrive (3 batched shared materials!)
      const flicker = 0.92 + 0.08 * Math.sin(t * 7.3);
      sharedLanternBulbMat.emissiveIntensity = (0.12 + nightK * 2.6) * flicker;
      sharedLanternHaloMat.opacity = nightK * 0.55 * flicker;
      sharedLanternSpriteMat.opacity = nightK * 0.85 * flicker;
      for (const ll of lanternLights) ll.intensity = nightK * 48 * flicker;
      sharedWinMat.emissiveIntensity = 0.35 + nightK * 2.1;
      trade.forgeLight.intensity = (24 + nightK * 18) * (0.88 + 0.12 * Math.sin(t * 9.1));
    },
  };
}

/** Stand-in person (replaced seamlessly once Character Forge GLBs load). */
export function personModel(body: number, skin: number, hat = 0x2b2f45, opts: { hair?: boolean; legs?: number } = {}): THREE.Group {
  const g = new THREE.Group();
  const torso = mesh(new THREE.CylinderGeometry(0.32, 0.5, 1.2, 12), mat(body), 0, 0.95, 0); torso.name = 'torso'; g.add(torso);
  const head = mesh(new THREE.SphereGeometry(0.3, 16, 12), mat(skin), 0, 1.84, 0); head.name = 'head'; g.add(head);
  if (opts.hair) { const cap = mesh(new THREE.SphereGeometry(0.33, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(hat), 0, 1.88, -0.03); g.add(cap); }
  else g.add(mesh(new THREE.ConeGeometry(0.36, 0.6, 12), mat(hat), 0, 2.25, -0.05));
  for (const s of [-1, 1]) { const leg = mesh(new THREE.BoxGeometry(0.18, 0.5, 0.18), mat(opts.legs ?? 0x3a3328), s * 0.16, 0.25, 0); leg.name = s < 0 ? 'legL' : 'legR'; g.add(leg); }
  return g;
}

// ── Temple of Numerals (Act 5) ───────────────────────────────────────────────────────────────────
export function buildTemple(): BuiltLevel {
  const group = new THREE.Group(); group.name = 'lexicon.temple';
  const boxes: Box[] = [], circles: Circle[] = [];
  const stone = surface('medieval_blocks_02', [3, 2], 0x7b7588);
  const floorMat = surface('cobblestone_floor_04', [4, 4], 0x5d5768);
  const floor = (x1: number, x2: number, z1: number, z2: number) => {
    const w = x2 - x1, d = Math.abs(z2 - z1);
    group.add(mesh(new THREE.BoxGeometry(w, 1, d), floorMat, (x1 + x2) / 2, -0.5, (z1 + z2) / 2, false));
  };
  const wall = (x1: number, z1: number, x2: number, z2: number, h = 6.5) => {
    const w = Math.max(1, Math.abs(x2 - x1)), d = Math.max(1, Math.abs(z2 - z1));
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    group.add(mesh(new THREE.BoxGeometry(w, h, d), stone, cx, h / 2, cz));
    boxes.push({ minx: cx - w / 2, maxx: cx + w / 2, minz: cz - d / 2, maxz: cz + d / 2 });
  };
  // Entrance + giant decorative bronze clockwork gears overhead (lexicon-visual-identity.md §6)
  floor(-6, 6, 0, -14); wall(-6, 0, -6, -14); wall(6, 0, 6, -14); wall(-6, 0.5, -2, 0.5); wall(2, 0.5, 6, 0.5);
  const gears: THREE.Mesh[] = [];
  for (const [gx, gy, gz, rad] of [[-12.8, 5.2, -26, 2.8], [12.8, 5.2, -32, 3.2], [0, 8.2, -14.2, 2.4]] as const) {
    const gear = mesh(new THREE.TorusGeometry(rad, 0.24, 8, 18), mat(PAL.brass, 0x3a2800), gx, gy, gz, false);
    gear.userData.dynamic = true;
    if (Math.abs(gx) > 5) gear.rotation.y = Math.PI / 2;
    group.add(gear); gears.push(gear);
  }
  // Hall of Sums
  floor(-14, 14, -14, -44); wall(-14, -14, -3, -14); wall(3, -14, 14, -14); wall(-14, -14, -14, -44); wall(14, -14, 14, -44);
  wall(-14, -44, -2.5, -44); wall(2.5, -44, 14, -44);
  for (const [x, z] of [[-9, -20], [9, -20], [-9, -38], [9, -38]]) { group.add(mesh(new THREE.CylinderGeometry(0.9, 1, 6, 8), mat(0x7b7688), x, 3, z)); circles.push({ x, z, r: 1.1 }); }
  const sums = ['3+4=7', '6×7=42', '9−5=4', '12÷3=4'];
  sums.forEach((s, i) => { const t = textSprite(s, { size: 48, color: '#cdb9ff', scale: 0.8 }); t.position.set(i < 2 ? -13.4 : 13.4, 3, -22 - (i % 2) * 12); group.add(t); });
  const gates = new Map<string, Gate>();
  const hall = new THREE.Group(); hall.userData.dynamic = true;
  for (let i = -1; i <= 1; i++) hall.add(mesh(new THREE.BoxGeometry(0.2, 5.5, 0.2), mat(0xb9a8ff, 0x2a1f66), i * 1.5, 2.75, -44));
  group.add(hall);
  const hallBox: Box = { minx: -2.5, maxx: 2.5, minz: -44.6, maxz: -43.4 }; boxes.push(hallBox);
  gates.set('hall', { id: 'hall', obj: hall, box: hallBox, open: false });
  // Chasm of Roots
  floor(-9, 9, -44, -58); floor(-9, 9, -66, -80);
  group.add(mesh(new THREE.BoxGeometry(18, 1, 8), new THREE.MeshBasicMaterial({ color: 0x020104 }), 0, -12, -62, false));
  wall(-9, -44, -9, -80); wall(9, -44, 9, -80); wall(-9, -80, -3, -80); wall(3, -80, 9, -80);
  const bridge = new THREE.Group(); bridge.userData.dynamic = true;
  bridge.add(mesh(new THREE.BoxGeometry(3, 0.4, 9), mat(0x5d7a3a), 0, -0.2, -62));
  for (let i = 0; i < 6; i++) bridge.add(mesh(new THREE.TorusGeometry(0.6, 0.12, 5, 8), mat(0x4a6a2a), (i % 2 ? 1 : -1) * 1.4, 0.2, -58.5 - i * 1.4));
  bridge.visible = false; group.add(bridge);
  // Corridor + Redactor Arena
  floor(-3, 3, -80, -88); wall(-3, -80, -3, -88); wall(3, -80, 3, -88);
  const arena = { x: 0, z: -102, r: 14.5 };
  group.add(mesh(new THREE.CylinderGeometry(arena.r + 0.5, arena.r + 0.5, 1, 32), floorMat, arena.x, -0.5, arena.z, false));
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, x = arena.x + Math.sin(a) * (arena.r + 1), z = arena.z + Math.cos(a) * (arena.r + 1);
    if (z > -89) continue;
    const seg = mesh(new THREE.BoxGeometry(4, 7, 1), stone, x, 3.5, z); seg.rotation.y = a; group.add(seg);
  }
  const pillars: BuiltLevel['pillars'] = [];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2, x = arena.x + Math.sin(a) * 8.5, z = arena.z + Math.cos(a) * 8.5;
    const p = mesh(new THREE.CylinderGeometry(0.9, 1.1, 4, 8), mat(0x8c86a0), x, 2, z); p.userData.dynamic = true; group.add(p); circles.push({ x, z, r: 1.2 });
    const label = textSprite('—', { size: 56, color: '#ffe9a8', scale: 1, bg: 'rgba(10,8,20,.6)' }); label.position.set(x, 4.9, z); group.add(label);
    pillars.push({ obj: p, x, z, label });
  }
  const torches: THREE.PointLight[] = [], braziers: THREE.PointLight[] = [];
  for (const [x, y, z] of [[0, 3.5, -7], [0, 4.5, -29], [-8, 4, -102], [8, 4, -102]]) {
    const l = new THREE.PointLight(0xffa860, 70, 34, 1.4); l.position.set(x, y, z); group.add(l); torches.push(l);
  }
  for (const [x, z] of [[-6, -50], [6, -74]]) {
    group.add(mesh(new THREE.CylinderGeometry(0.6, 0.4, 1.2, 8), mat(0x3a3640), x, 0.6, z));
    const l = new THREE.PointLight(0x9ad8ff, 0, 30, 1.4); l.position.set(x, 2.2, z); group.add(l); braziers.push(l);
  }
  const sigils = new Map<string, SigilView>();
  for (const def of SIGILS.filter((s) => s.level === 'temple')) {
    const g = new THREE.Group(); g.userData.dynamic = true; g.position.set(def.pos[0], 0, def.pos[1]); group.add(g);
    let apply: (s: boolean) => void = () => {};
    if (def.power === 'light') {
      const flame = mesh(new THREE.OctahedronGeometry(0.4), mat(0x333040), 0, 1.6, 0); g.add(flame);
      apply = (s) => { flame.material = s ? mat(0xbfe8ff, 0x5ab8ff) : mat(0x333040); for (const b of braziers) b.intensity = s ? 45 : 0; };
    } else {
      const root = mesh(new THREE.TorusKnotGeometry(0.5, 0.14, 40, 6), mat(0x4a3a2a), 0, 0.6, 0); g.add(root);
      apply = (s) => { bridge.visible = s; root.material = s ? mat(0x6f9a3a, 0x1a3a0a) : mat(0x4a3a2a); };
    }
    sigils.set(def.id, sigilView(def, g, apply));
  }
  const m = motes(120, 30, new THREE.Vector3(0, 0, -50)); group.add(m);
  const chasm: Box = { minx: -9, maxx: 9, minz: -66, maxz: -58 };

  return {
    id: 'temple', name: 'Temple of Numerals', outdoor: false, group, heightAt: () => 0,
    circles, boxes, gates, sigils, villagers: new Map(), portals: [], interactables: [], grappleAnchors: [], hazards: [],
    constrain(x, z) {
      if (z < -88) {
        const dx = x - arena.x, dz = z - arena.z, d = Math.hypot(dx, dz);
        if (d > arena.r - 0.5 && !(Math.abs(x) < 3 && z > -89.5)) { const k = (arena.r - 0.5) / d; return [arena.x + dx * k, arena.z + dz * k]; }
      }
      return [x, z];
    },
    chasm, bridge, torches, braziers, pillars, arena,
    sky: { day: 0x0d0b14, night: 0x0d0b14, fog: 0x0d0b14, fogNear: 10, fogFar: 60 },
    motes: m,
    update(dt) { gears.forEach((gr, i) => { gr.rotation.z += dt * (i % 2 ? -0.35 : 0.45); }); },
  };
}
