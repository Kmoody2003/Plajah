// Lexicon level modules: `lexicon.glossa` (village + fields) and `lexicon.temple` (Temple of Numerals).
// A module builds the place; the Game Project (services/gamestudio/projects/lexicon.ts) places the
// player, enemies and trigger zones on it and holds the rules. Stand-in low-poly art built from
// primitives: the art pass (Character Forge villagers, Plajah Terrain, vegetation kit) replaces it.
import * as THREE from 'three/webgpu';
import { abs, attribute, float, length, max, mix, normalMap, positionWorld, sin, smoothstep, step, texture, vec2, vec3 } from 'three/tsl';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;
import { SIGILS, VILLAGERS, type SigilDef } from './content';
import type { TreeSpot } from '../../../services/vegetation/trees/forest';

export interface Box { minx: number; maxx: number; minz: number; maxz: number; off?: boolean }
export interface Circle { x: number; z: number; r: number }
export interface Gate { id: string; obj: THREE.Object3D; box: Box; open: boolean }
export interface SigilView { def: SigilDef; obj: THREE.Group; solved: boolean; setSolved(v: boolean): void }

export interface BuiltLevel {
  id: 'glossa' | 'temple';
  group: THREE.Group;
  heightAt(x: number, z: number): number;
  circles: Circle[];
  boxes: Box[];
  gates: Map<string, Gate>;
  sigils: Map<string, SigilView>;
  villagers: Map<string, THREE.Group>;
  well?: THREE.Vector3;
  /** Keep a point inside the playable space (island edge, arena wall). */
  constrain(x: number, z: number): [number, number];
  /** Temple: the chasm and its bridge. */
  chasm?: Box; bridge?: THREE.Object3D;
  torches: THREE.PointLight[];
  braziers: THREE.PointLight[];
  pillars: { obj: THREE.Mesh; x: number; z: number; label: THREE.Sprite }[];
  /** Glossa: where the vegetation service grows trees. */
  treeSpots?: TreeSpot[];
  arena?: { x: number; z: number; r: number };
  sky: { day: number; night: number; fog: number; fogNear: number; fogFar: number };
  motes: THREE.Points;
}

// ── helpers ──
const matCache = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: number, emissive = 0, flat = false): THREE.MeshStandardMaterial {
  const k = `${color}|${emissive}|${flat}`;
  let m = matCache.get(k);
  // painted-real: matte PBR (identity §1); glyphs and sigils carry emissive gold/cyan so bloom picks them out
  if (!m) { m = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: emissive ? 1.6 : 0, flatShading: flat, roughness: 0.82, metalness: 0 }); matCache.set(k, m); }
  return m;
}
/** Identity palette (docs/lexicon-visual-identity.md §2). */
export const PAL = {
  navy: 0x343c51, leather: 0x674836, saddle: 0x8c5e44, brass: 0xe6c983, cyan: 0xb1f9f6, parchment: 0xebdbc1,
  moss: 0x393d2b, olive: 0x807b58, oliveLight: 0xada87b, bark: 0x4e4730, ember: 0xbc8965,
  stone: 0x8e8372, stoneDark: 0x615a4d, wall: 0xc2b59c, slate: 0x4f5563, terracotta: 0x9a4e35, ink: 0x1d1d1b, inkWarm: 0x33322e,
};
function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, cast = true): THREE.Mesh {
  const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = cast; o.receiveShadow = true; return o;
}

/** Canvas text sprite (labels over pillars, enemies, letter stones). */
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


// ── ground material: CC0 Poly Haven / ambientCG textures in world space (realism foundation) ──
// Cobbles on the village square and the north road, meadow grass in the hollow, forest floor toward the edges.
// Each layer is sampled at two scales and blended so the 3 m tile never reads; the old vertex colours stay as the
// large-scale tint (the painter's wash over the photo texture).
const texLoader = new THREE.TextureLoader();
const texCache = new Map<string, THREE.Texture>();
function tex(url: string, srgb: boolean): THREE.Texture {
  let t = texCache.get(url);
  if (!t) {
    t = texLoader.load(url); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(url, t);
  }
  return t;
}
const PH = '/games/ravencrest/assets/polyhaven/textures/';
/** A CC0 Poly Haven surface (albedo, normal, roughness from the packed AO/rough/disp map) at a UV repeat, tinted. */
const pbrCache = new Map<string, THREE.MeshStandardMaterial>();
export function surface(name: string, repeat: [number, number], tint = 0xffffff): THREE.MeshStandardMaterial {
  const k = `${name}|${repeat}|${tint}`;
  let m = pbrCache.get(k);
  if (m) return m;
  const rep = (t: THREE.Texture) => { const c = t.clone(); c.repeat.set(repeat[0], repeat[1]); c.needsUpdate = true; return c; };
  m = new THREE.MeshStandardMaterial({
    color: tint, map: rep(tex(PH + name + '/diff_1k.jpg', true)), normalMap: rep(tex(PH + name + '/nor_gl_1k.jpg', false)),
    roughnessMap: rep(tex(PH + name + '/ard_1k.jpg', false)), roughness: 1, metalness: 0,
  });
  pbrCache.set(k, m);
  return m;
}
function groundMaterial(): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  const wp: N = positionWorld.xz;
  const layer = (d: string, n: string, a: string | null, scale: number) => {
    const uv1: N = wp.mul(1 / scale), uv2: N = wp.mul(1 / (scale * 2.7)).add(vec2(0.37, 0.61));
    const D = tex(d, true), Nn = tex(n, false);
    const col: N = mix(texture(D, uv1).rgb, texture(D, uv2).rgb, 0.35);
    const nor: N = mix(texture(Nn, uv1).rgb, texture(Nn, uv2).rgb, 0.35);
    const rough: N = a ? texture(tex(a, false), uv1).g : float(0.85);
    return { col, nor, rough };
  };
  const forest = layer(PH + 'forest_ground_04/diff_1k.jpg', PH + 'forest_ground_04/nor_gl_1k.jpg', PH + 'forest_ground_04/ard_1k.jpg', 3.2);
  const grass = layer('/firstlight/assets/grass/Grass004_1K-JPG_Color.jpg', '/firstlight/assets/grass/Grass004_1K-JPG_NormalGL.jpg', null, 2.4);
  const cobble = layer(PH + 'cobblestone_floor_04/diff_1k.jpg', PH + 'cobblestone_floor_04/nor_gl_1k.jpg', PH + 'cobblestone_floor_04/ard_1k.jpg', 2.6);
  // masks (same shapes the gameplay and the grass cover use)
  const r: N = length(wp);
  const wob: N = sin(wp.x.mul(0.9)).mul(sin(wp.y.mul(1.1))).mul(0.5);
  const square: N = smoothstep(13.2, 12.0, r.add(wob));
  const onRoad: N = smoothstep(3.0, 2.2, abs(wp.x).add(wob.mul(0.4))).mul(step(wp.y, float(-6))).mul(step(float(-72), wp.y));
  const road: N = max(square, onRoad);
  const wild: N = smoothstep(38, 70, r).mul(0.75);
  const base = (k: 'col' | 'nor' | 'rough') => mix(mix(grass[k], forest[k], wild), cobble[k], road);
  const tint: N = attribute('color', 'vec3');
  // vertex colours carry the macro wash; normalised so the photo texture keeps its own brightness
  m.colorNode = base('col').mul(mix(vec3(1), tint.mul(1.7), 0.55));
  m.normalNode = normalMap(base('nor'));
  m.roughnessNode = base('rough');
  return m;
}

// value noise
function hash(x: number, z: number) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x: number, z: number) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x: number, z: number) => vnoise(x, z) * 0.55 + vnoise(x * 2.1, z * 2.1) * 0.3 + vnoise(x * 4.3, z * 4.3) * 0.15;
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function motes(count: number, spread: number, center: THREE.Vector3): THREE.Points {
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { p[i * 3] = center.x + (Math.random() - 0.5) * spread; p[i * 3 + 1] = 0.5 + Math.random() * 6; p[i * 3 + 2] = center.z + (Math.random() - 0.5) * spread; }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  // a tiny glyph texture: ink motes are letters drifting loose
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d')!; x.fillStyle = '#fff4d0'; x.font = 'bold 44px Georgia'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('a', 32, 34);
  const tex = new THREE.CanvasTexture(c);
  return new THREE.Points(g, new THREE.PointsMaterial({ size: 0.45, map: tex, transparent: true, depthWrite: false, opacity: 0.75, color: 0xfff1c8 }));
}

function sigilView(def: SigilDef, obj: THREE.Group, apply: (solved: boolean) => void): SigilView {
  const v: SigilView = { def, obj, solved: false, setSolved(s) { v.solved = s; apply(s); } };
  return v;
}

// ── Glossa Hollow ─────────────────────────────────────────────────────────────
export function heightGlossa(x: number, z: number): number {
  const r = Math.hypot(x, z);
  let h = (fbm(x * 0.035, z * 0.035) - 0.5) * 7 + (fbm(x * 0.012 + 7, z * 0.012) - 0.5) * 12;
  h *= smooth(16, 34, r);                                  // flat village
  h *= smooth(20, 32, Math.hypot(x, z + 78));              // flat temple grounds
  if (z < -6 && z > -70) h *= smooth(3, 8, Math.abs(x));   // the north road
  if (r > 82) h -= Math.pow((r - 82) / 10, 2) * 6;         // island shore
  return h;
}

export function buildGlossa(): BuiltLevel {
  const group = new THREE.Group(); group.name = 'lexicon.glossa';
  const circles: Circle[] = [], boxes: Box[] = [];

  // terrain with vertex colours
  const geo = new THREE.PlaneGeometry(240, 240, 140, 140); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const grass = new THREE.Color(0x56643a), grass2 = new THREE.Color(0x8a9152), sand = new THREE.Color(0xc9b98e), road = new THREE.Color(PAL.stone);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = heightGlossa(x, z);
    pos.setY(i, h);
    const r = Math.hypot(x, z);
    c.copy(grass).lerp(grass2, fbm(x * 0.08, z * 0.08));
    if (r < 13 || (z < -6 && z > -70 && Math.abs(x) < 2.6)) c.lerp(road, 0.55 + 0.35 * fbm(x * 0.6, z * 0.6)); // worn cobble with moss in the joints
    if (h < -0.6) c.lerp(sand, smooth(-0.6, -1.6, h));
    // (the blank creeping in from the edges is drawn by the manuscript stage's erasure field, not baked here)
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, groundMaterial());
  ground.receiveShadow = true; group.add(ground);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3b6f86, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.88 }));
  water.position.y = -1.3; group.add(water);

  // trees: spots only — the vegetation service (services/vegetation, Glossa Hollow catalog) grows the real ones.
  // species 0 = root giant (ring the hollow), 1 = oak (the fields), 2 = slender ash (the far layers)
  const treeSpots: TreeSpot[] = [];
  const blocked = (x: number, z: number) =>
    (Math.abs(x) < 46 && z < -58) || (Math.abs(x) < 7 && z < -4 && z > -70) ||
    SIGILS.some((s) => s.level === 'glossa' && Math.hypot(s.pos[0] - x, s.pos[1] - z) < 6) ||
    treeSpots.some((t) => Math.hypot(t.x - x, t.z - z) < (t.species === 0 ? 9 : 4.5));
  for (let i = 0; i < 1600 && treeSpots.length < 170; i++) {
    const a = hash(i, 3) * Math.PI * 2, r = 26 + hash(i, 9) * 60;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (blocked(x, z) || heightGlossa(x, z) < -0.4) continue;
    const giants = treeSpots.filter((t) => t.species === 0).length;
    const species = r < 44 && giants < 14 && hash(i, 7) > 0.55 ? 0 : r > 62 && hash(i, 8) > 0.4 ? 2 : 1;
    const scale = species === 0 ? 0.9 + hash(i, 5) * 0.35 : 0.75 + hash(i, 5) * 0.5;
    treeSpots.push({ x, y: heightGlossa(x, z) - 0.15, z, yaw: a * 3.1, species, scale });
    circles.push({ x, z, r: (species === 0 ? 3.4 : species === 1 ? 1.1 : 0.7) * scale }); // giants: trunk + root flare
  }

  // houses around the green
  const houseAngles = [0.35, 1.25, 2.2, 3.05, 3.9, 5.5];
  for (const a of houseAngles) {
    const x = Math.cos(a) * 19, z = Math.sin(a) * 19;
    const h = new THREE.Group();
    // plastered stone walls on a fieldstone footing, slate or tile roofs, plank doors (CC0 Poly Haven surfaces)
    h.add(mesh(new THREE.BoxGeometry(5, 3.2, 4.4), surface('clay_plaster', [2, 1.3], 0xe8dcc4), 0, 1.6, 0));
    h.add(mesh(new THREE.BoxGeometry(5.3, 0.7, 4.7), surface('medieval_blocks_02', [3, 0.5]), 0, 0.3, 0));
    const roof = mesh(new THREE.ConeGeometry(4.1, 2.4, 4), surface('roof_slates_02', [3, 2], hash(a, 1) > 0.5 ? 0xd08868 : 0xffffff), 0, 4.4, 0); roof.rotation.y = Math.PI / 4; h.add(roof);
    h.add(mesh(new THREE.BoxGeometry(1.1, 1.9, 0.1), surface('dark_wooden_planks', [1, 1.6]), 0, 0.95, 2.22, false));
    // lit windows: the warm amber of the art's lanterns
    for (const s of [-1, 1]) h.add(mesh(new THREE.BoxGeometry(0.7, 0.7, 0.08), mat(0xffc46a, 0xffa53a), s * 1.6, 1.9, 2.22, false));
    h.position.set(x, heightGlossa(x, z), z); h.rotation.y = Math.atan2(-x, -z);
    group.add(h); circles.push({ x, z, r: 3 });
  }

  // the Word Well (save point + Archive)
  const well = new THREE.Group();
  well.add(mesh(new THREE.CylinderGeometry(1.7, 1.9, 1, 12, 1, true), mat(0x9a9384), 0, 0.5, 0));
  const glow = mesh(new THREE.CircleGeometry(1.6, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe6a0 }), 0, 0.7, 0, false); well.add(glow);
  well.add(mesh(new THREE.BoxGeometry(0.25, 2.6, 0.25), mat(0x6b4a2f), -1.6, 1.3, 0), mesh(new THREE.BoxGeometry(0.25, 2.6, 0.25), mat(0x6b4a2f), 1.6, 1.3, 0));
  well.add(mesh(new THREE.ConeGeometry(2.4, 1.2, 4).rotateY(Math.PI / 4), mat(0x2f4f7a), 0, 3.1, 0));
  group.add(well); circles.push({ x: 0, z: 0, r: 2 });

  // letter stones along the road
  const letters = 'LEXICONWORDS';
  for (let i = 0; i < letters.length; i++) {
    const side = i % 2 ? 1 : -1, z = -10 - i * 4.6, x = side * 4.2;
    const st = mesh(new THREE.BoxGeometry(1.1, 2.4, 0.5), mat(0x8d8a80), x, heightGlossa(x, z) + 1.2, z);
    st.rotation.y = side * 0.25; group.add(st); circles.push({ x, z, r: 0.7 });
    const lab = textSprite(letters[i], { size: 80, color: '#ffe9a8', scale: 0.9 }); lab.position.set(x, heightGlossa(x, z) + 1.6, z + 0.3); group.add(lab);
  }

  // villagers (stand-ins until Character Forge villagers)
  const villagers = new Map<string, THREE.Group>();
  for (const v of VILLAGERS) {
    const g = personModel(v.color, 0xf0c9a0);
    g.position.set(v.pos[0], 0, v.pos[1]); g.rotation.y = Math.atan2(-v.pos[0], -v.pos[1]);
    const tag = textSprite(v.name, { size: 40, scale: 0.42, bg: 'rgba(20,26,46,.55)' }); tag.position.y = 2.5; g.add(tag);
    g.userData.dynamic = true; group.add(g); villagers.set(v.id, g); circles.push({ x: v.pos[0], z: v.pos[1], r: 0.6 });
  }

  // sigils
  const sigils = new Map<string, SigilView>();
  for (const def of SIGILS.filter((s) => s.level === 'glossa')) {
    const g = new THREE.Group(); g.userData.dynamic = true; g.position.set(def.pos[0], heightGlossa(def.pos[0], def.pos[1]), def.pos[1]); group.add(g);
    circles.push({ x: def.pos[0], z: def.pos[1], r: 1.1 });
    let apply: (s: boolean) => void = () => {};
    if (def.power === 'light') {
      g.add(mesh(new THREE.BoxGeometry(0.3, 3, 0.3), mat(0x3d3a36), 0, 1.5, 0));
      const lamp = mesh(new THREE.OctahedronGeometry(0.55), mat(0x555048), 0, 3.3, 0); g.add(lamp);
      apply = (s) => { lamp.material = s ? mat(0xffe08a, 0xffb84a) : mat(0x555048); };
    } else if (def.power === 'grow') {
      const t = new THREE.Group(); t.add(mesh(new THREE.CylinderGeometry(0.2, 0.35, 3, 6).translate(0, 1.5, 0), mat(0x6b4a2f)), mesh(new THREE.IcosahedronGeometry(1.8, 0).translate(0, 3.8, 0), mat(0xd77fa1)));
      g.add(t); t.scale.setScalar(0.22); g.add(mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.2, 10), mat(0x8a6a4a), 0, 0.1, 0));
      apply = (s) => t.scale.setScalar(s ? 1.2 : 0.22);
    } else if (def.power === 'water') {
      g.add(mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.8, 12), mat(0xb7ad98), 0, 0.4, 0));
      const wt = mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.1, 12), new THREE.MeshStandardMaterial({ color: 0x6fc0ee, emissive: 0x1b4a6a }), 0, 0.82, 0, false); wt.visible = false; g.add(wt);
      g.add(mesh(new THREE.CylinderGeometry(0.25, 0.3, 1.8, 8), mat(0xb7ad98), 0, 1.2, 0));
      apply = (s) => { wt.visible = s; };
    } else if (def.power === 'open') {
      g.add(mesh(new THREE.BoxGeometry(1.6, 0.9, 1.1), mat(0x7a4e2a), 0, 0.45, 0));
      const lid = new THREE.Group(); lid.position.set(0, 0.9, -0.55); lid.add(mesh(new THREE.BoxGeometry(1.6, 0.35, 1.1), mat(0x8d5d33), 0, 0.17, 0.55)); g.add(lid);
      const lock = mesh(new THREE.BoxGeometry(0.35, 0.35, 0.1), mat(0xe8e4d8), 0, 0.8, 0.57); g.add(lock);
      apply = (s) => { lid.rotation.x = s ? -1.9 : 0; lock.visible = !s; };
    } else if (def.power === 'time') {
      g.add(mesh(new THREE.CylinderGeometry(1.4, 1.6, 0.9, 16), mat(0xcfc6ae), 0, 0.45, 0));
      const gn = mesh(new THREE.ConeGeometry(0.15, 1.6, 4), mat(0x8a7a50), 0, 1.6, 0); gn.rotation.z = 0.5; g.add(gn);
      apply = (s) => { gn.rotation.z = s ? -0.5 : 0.5; gn.material = s ? mat(0xffd36a, 0x6a4a00) : mat(0x8a7a50); };
    }
    sigils.set(def.id, sigilView(def, g, apply));
  }

  // temple grounds: wall, Cipher Gate, temple
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
  const gateSign = textSprite('?', { size: 90, color: '#ffe08a', scale: 1.4 }); gateSign.position.set(0, 5.1, -65.2); gateObj.add(gateSign);
  gateObj.userData.sign = gateSign;
  group.add(gateObj);
  const gateBox: Box = { minx: -3.2, maxx: 3.2, minz: -66.6, maxz: -65.4 };
  boxes.push(gateBox); gates.set('cipher', { id: 'cipher', obj: gateObj, box: gateBox, open: false });

  const temple = new THREE.Group();
  temple.add(mesh(new THREE.BoxGeometry(28, 10, 14), mat(0xb9b2a0), 0, 5, -85));
  temple.add(mesh(new THREE.BoxGeometry(31, 1.4, 16), mat(0x968f80), 0, 10.6, -85));
  temple.add(mesh(new THREE.ConeGeometry(12, 6, 4).rotateY(Math.PI / 4), mat(0x6f6a5e), 0, 14.2, -85));
  for (let i = -3; i <= 3; i++) if (i) temple.add(mesh(new THREE.CylinderGeometry(0.6, 0.7, 9, 8), mat(0xd8d1bd), i * 3.8, 4.5, -77.4));
  temple.add(mesh(new THREE.PlaneGeometry(5, 6.5), new THREE.MeshBasicMaterial({ color: 0x07060b }), 0, 3.25, -77.95, false));
  const tsign = textSprite('∑ TEMPLE OF NUMERALS ∑', { size: 48, color: '#2a2418', scale: 0.9 }); tsign.position.set(0, 8.4, -77.6); temple.add(tsign);
  group.add(temple);
  boxes.push({ minx: -14, maxx: -2.5, minz: -92, maxz: -78 }, { minx: 2.5, maxx: 14, minz: -92, maxz: -78 }, { minx: -2.5, maxx: 2.5, minz: -92, maxz: -79.2 });

  const m = motes(220, 170, new THREE.Vector3(0, 0, -10)); group.add(m);

  return {
    id: 'glossa', group, heightAt: heightGlossa, circles, boxes, gates, sigils, villagers, well: new THREE.Vector3(0, 0, 0), treeSpots,
    constrain(x, z) { const r = Math.hypot(x, z), R = 86; return r > R ? [x * R / r, z * R / r] : [x, z]; },
    torches: [], braziers: [], pillars: [],
    sky: { day: 0xa3bfce, night: 0x0d1430, fog: 0xcfd6c8, fogNear: 40, fogFar: 170 },
    motes: m,
  };
}

/** Stand-in person: body, head, hat. Reused for the Scribe and villagers. */
/** Stand-in person (until Character Forge models): body, head, and a hat (cone) or hair (cap). */
export function personModel(body: number, skin: number, hat = 0x2b2f45, opts: { hair?: boolean; legs?: number } = {}): THREE.Group {
  const g = new THREE.Group();
  const torso = mesh(new THREE.CylinderGeometry(0.32, 0.5, 1.2, 12), mat(body), 0, 0.95, 0); torso.name = 'torso'; g.add(torso);
  const head = mesh(new THREE.SphereGeometry(0.3, 16, 12), mat(skin), 0, 1.84, 0); head.name = 'head'; g.add(head);
  if (opts.hair) { const cap = mesh(new THREE.SphereGeometry(0.33, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(hat), 0, 1.88, -0.03); g.add(cap); }
  else g.add(mesh(new THREE.ConeGeometry(0.36, 0.6, 12), mat(hat), 0, 2.25, -0.05));
  for (const s of [-1, 1]) { const leg = mesh(new THREE.BoxGeometry(0.18, 0.5, 0.18), mat(opts.legs ?? 0x3a3328), s * 0.16, 0.25, 0); leg.name = s < 0 ? 'legL' : 'legR'; g.add(leg); }
  return g;
}

// ── Temple of Numerals ───────────────────────────────────────────────────────
export function buildTemple(): BuiltLevel {
  const group = new THREE.Group(); group.name = 'lexicon.temple';
  const boxes: Box[] = [], circles: Circle[] = [];
  const stone = 0x6e6a7a, floorC = 0x4a4656;
  const floor = (x1: number, x2: number, z1: number, z2: number) => {
    const w = x2 - x1, d = Math.abs(z2 - z1);
    group.add(mesh(new THREE.BoxGeometry(w, 1, d), mat(floorC), (x1 + x2) / 2, -0.5, (z1 + z2) / 2, false));
  };
  const wall = (x1: number, z1: number, x2: number, z2: number, h = 6) => {
    const w = Math.max(1, Math.abs(x2 - x1)), d = Math.max(1, Math.abs(z2 - z1));
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    group.add(mesh(new THREE.BoxGeometry(w, h, d), mat(stone), cx, h / 2, cz));
    boxes.push({ minx: cx - w / 2, maxx: cx + w / 2, minz: cz - d / 2, maxz: cz + d / 2 });
  };
  // entrance
  floor(-6, 6, 0, -14); wall(-6, 0, -6, -14); wall(6, 0, 6, -14); wall(-6, 0.5, -2, 0.5); wall(2, 0.5, 6, 0.5);
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
  // corridor + arena
  floor(-3, 3, -80, -88); wall(-3, -80, -3, -88); wall(3, -80, 3, -88);
  const arena = { x: 0, z: -102, r: 14.5 };
  group.add(mesh(new THREE.CylinderGeometry(arena.r + 0.5, arena.r + 0.5, 1, 32), mat(floorC), arena.x, -0.5, arena.z, false));
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, x = arena.x + Math.sin(a) * (arena.r + 1), z = arena.z + Math.cos(a) * (arena.r + 1);
    if (z > -89) continue; // leave the doorway open
    const seg = mesh(new THREE.BoxGeometry(4, 7, 1), mat(stone), x, 3.5, z); seg.rotation.y = a; group.add(seg);
  }
  const pillars: BuiltLevel['pillars'] = [];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2, x = arena.x + Math.sin(a) * 8.5, z = arena.z + Math.cos(a) * 8.5;
    const p = mesh(new THREE.CylinderGeometry(0.9, 1.1, 4, 8), mat(0x8c86a0), x, 2, z); p.userData.dynamic = true; group.add(p); circles.push({ x, z, r: 1.2 });
    const label = textSprite('—', { size: 56, color: '#ffe9a8', scale: 1, bg: 'rgba(10,8,20,.6)' }); label.position.set(x, 4.9, z); group.add(label);
    pillars.push({ obj: p, x, z, label });
  }
  // lights: torches always on, braziers wait for LIGHT
  const torches: THREE.PointLight[] = [], braziers: THREE.PointLight[] = [];
  for (const [x, y, z] of [[0, 3.5, -7], [0, 4.5, -29], [-8, 4, -102], [8, 4, -102]]) { const l = new THREE.PointLight(0xffa860, 70, 34, 1.4); l.position.set(x, y, z); group.add(l); torches.push(l); }
  for (const [x, z] of [[-6, -50], [6, -74]]) {
    group.add(mesh(new THREE.CylinderGeometry(0.6, 0.4, 1.2, 8), mat(0x3a3640), x, 0.6, z));
    const l = new THREE.PointLight(0x9ad8ff, 0, 30, 1.4); l.position.set(x, 2.2, z); group.add(l); braziers.push(l);
  }
  // sigils
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
    id: 'temple', group, heightAt: () => 0, circles, boxes, gates, sigils, villagers: new Map(),
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
  };
}
