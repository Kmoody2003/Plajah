// Elderwood Hollow — Level 1 (Kenne 2026-11-19: "Cyber Forest" and "Elderwood Hollow" are the same place).
// Layout and structures: the labelled tactical map CF-24 (void-sanctum-level-assets, Vol 1), read at 0.1 m per pixel with
// the map's centre at the origin (x east, z south). Heights from the models manifest: forest floor 0, canopy decks 12.
//   Great Oak (centre, OBJ A on its treetop deck) · rope bridges to the West Lookout and East Shelter oak platforms ·
//   a stone stairway down the deck's south-east side, cargo nets down its front · Log Tunnel · Outpost Cabin + OBJ B ·
//   Rune Monolith · Watchtower · Ruined Chapel · OBJ C on the rock shelf above the Waterfall Pool · Sniper Nest and
//   South Armory platforms on bridges from B and C · Spawn A west, Spawn B east.
// Look: the Cyber Forest Level Assets folder throughout — glow moss, conduit-veined bark, canopy cards and undergrowth
// cut from the turnarounds, glowing data cables along the paths, the forest's creatures, moths round every light.
// Structures with a model built from their sheet in Plajah 3D (assets/elderwood/*.glb, build-from-sheet) are placed as
// art; every walkable or solid surface is a simple collider built here, so the models never decide where you can stand.
import * as THREE from 'three/webgpu';
import { color, float, fract, max, mix, positionWorld, sin, smoothstep, texture as tslTexture, time, uniform, uv, vec2, vec3 } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { StaticKit, boulder, fbm3, polyPrism, rng, taperTube } from './geom';
import { builders } from './structures';
import { pbr } from './textures';
import { art, barkTube, segDist } from './cyberforest';
import { CreatureBody, type CreatureKind, MothSwarm, preloadCreatures } from './creatures';
import { enemyBodies, enemyNav } from './enemies';
import type { Level, LevelInfo, Tier } from './shrine';
import { Forest, type TreeSpot } from '../../../services/vegetation/trees/forest';
import { CF_GREAT_OAK, CF_PLATFORM_OAK, CYBER_FOREST_TREES } from '../../../services/vegetation/catalog/cyberForest';
import { addImpulse, updateWind } from '../../../services/vegetation/wind';
import { bakeGround } from '../../../services/vegetation/grass/ground';
import { GrassField } from '../../../services/vegetation/grass/field';
import { CYBER_FOREST_GRASS } from '../../../services/vegetation/catalog/cyberForestGrass';
import { PlantField, type PlantSpot } from '../../../services/vegetation/plants/field';
import { CF_VINE, CYBER_FOREST_PLANTS } from '../../../services/vegetation/catalog/cyberForestPlants';
import { FungusField, type FungusSpot } from '../../../services/vegetation/fungi/field';
import { CYBER_FOREST_FUNGI } from '../../../services/vegetation/catalog/cyberForestFungi';

const MODELS = '/games/rift-realm/assets/elderwood/';

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const dist = (x: number, z: number, p: { x: number; z: number }) => Math.hypot(x - p.x, z - p.z);

// ── the map, in metres (CF-24 pixel / 10, centred) ─────────────────────────────────────────────────────────────
export const OAK = { x: 2, z: -36 };            // the Great Oak's trunk
export const DECK_Y = 12;                         // canopy deck level (manifest datum)
const DECK_R = 22, TRUNK_R = 4.6;
const PLAT_R = 7.5, PLAT_TRUNK = 1.8;
export const PLATS = {
  west: { x: -57, z: -57, name: 'West Lookout' },
  east: { x: 58, z: -57, name: 'East Shelter' },
  sniper: { x: -57, z: 54, name: 'Sniper Nest' },
  armory: { x: 59, z: 56, name: 'South Armory' },
};
const CABIN = { x: -56, z: 16 }, TUNNEL = { x: -27, z: 7 }, MONOLITH = { x: 18, z: 20 }, TOWER = { x: -10, z: 48 };
const CHAPEL = { x: 58, z: 16 }, POOL = { x: 30, z: 60 }, SHELF = { x: 44, z: 38 };
export const SPAWN_A = new THREE.Vector3(-71, 0, -1), SPAWN_B = new THREE.Vector3(72, 0, 0);
const BOUND = 76;
/** Angle round the oak (atan2(dx, dz)) and the deck rim point at that angle. */
const rimAt = (a: number, r = DECK_R) => ({ x: OAK.x + Math.sin(a) * r, z: OAK.z + Math.cos(a) * r });
const ang = (p: { x: number; z: number }) => Math.atan2(p.x - OAK.x, p.z - OAK.z);
const A_WEST = ang(PLATS.west), A_EAST = ang(PLATS.east);
const A_STAIR = 0.72, A_NET1 = -0.55, A_NET2 = 0.12;
const OBJ_A = (() => { const p = rimAt(0.32, 13); return new THREE.Vector3(p.x, DECK_Y, p.z); })();
const OBJ_B = { x: -34, z: 26 }, OBJ_C = { x: 43, z: 37 };

/** Paths players run (kept clear of trees; glowing cables follow them). */
const LANES: number[][][] = [
  [[SPAWN_A.x, SPAWN_A.z], [-52, 4], [OBJ_B.x, OBJ_B.z]],
  [[SPAWN_A.x, SPAWN_A.z], [-40, -6], [-16, -8]],
  [[OBJ_B.x, OBJ_B.z], [TUNNEL.x, TUNNEL.z], [-6, 14], [MONOLITH.x, MONOLITH.z], [OBJ_C.x, OBJ_C.z]],
  [[OBJ_B.x, OBJ_B.z], [-22, 40], [TOWER.x, TOWER.z], [16, 54], [POOL.x - 6, POOL.z - 4]],
  [[SPAWN_B.x, SPAWN_B.z], [CHAPEL.x - 4, CHAPEL.z + 10], [OBJ_C.x, OBJ_C.z]],
  [[SPAWN_B.x, SPAWN_B.z], [46, -2], [30, -2], [MONOLITH.x, MONOLITH.z]],
  [[-16, -8], [0, 4], [MONOLITH.x, MONOLITH.z]],
];

export function elderwoodHeight(x: number, z: number): number {
  let h = (fbm3(x * 0.04, 1, z * 0.04) - 0.5) * 1.8 + (fbm3(x * 0.15, 2, z * 0.15) - 0.5) * 0.4;
  // the plateau the Great Oak grows from: a mound under its deck
  h += 3.4 * smooth(36, 12, dist(x, z, OAK));
  // the rock shelf OBJ C stands on, rising from the chapel yard and the monolith glade
  h += 3.2 * smooth(17, 7, dist(x, z, SHELF));
  // the waterfall pool: a deep basin below the shelf
  const dp = dist(x, z, POOL);
  h = h * smooth(7, 13, dp) + (-4.6) * (1 - smooth(7, 13, dp));
  // flat pads: spawns, the cabin, the chapel, the tower, the monolith
  for (const [p, r, y] of [[SPAWN_A, 7, 0], [SPAWN_B, 7, 0], [CABIN, 7, 0], [CHAPEL, 9, 0], [TOWER, 5, 0], [MONOLITH, 5, 0.6]] as const) {
    const f = smooth(r + 5, r, dist(x, z, p)); h = h * (1 - f) + y * f;
  }
  // the map's edge: rising forested hills
  const o = Math.max(Math.abs(x) - BOUND, Math.abs(z) - BOUND);
  h += smooth(-4, 14, o) * (14 + fbm3(x * 0.03, 4, z * 0.03) * 12);
  return h;
}

export function buildElderwood(scene: THREE.Scene, tier: Tier = 'high'): Level {
  const lo = tier === 'low';
  const group = new THREE.Group();
  const uBeatPulse = uniform(0);
  const kit = new StaticKit();
  const B = builders(kit);
  const R = rng(2424);
  const H = elderwoodHeight;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s3 = new THREE.Vector3();
  const nearLane = (x: number, z: number, d: number) => LANES.some((l) => segDist(x, z, l).d < d);
  const structures: { x: number; z: number; r: number }[] = [
    { ...OAK, r: DECK_R + 3 }, ...Object.values(PLATS).map((p) => ({ x: p.x, z: p.z, r: PLAT_R + 3 })),
    { ...CABIN, r: 7 }, { ...TUNNEL, r: 7 }, { ...MONOLITH, r: 5 }, { ...TOWER, r: 5 }, { ...CHAPEL, r: 10 }, { ...POOL, r: 13 },
    { ...SHELF, r: 7 }, { x: SPAWN_A.x, z: SPAWN_A.z, r: 7 }, { x: SPAWN_B.x, z: SPAWN_B.z, r: 7 },
  ];
  const inStructure = (x: number, z: number, pad = 0) => structures.some((s) => Math.hypot(x - s.x, z - s.z) < s.r + pad);
  /** Ways between the forest floor and the canopy (stairs, nets, bridges up to the low platforms): enemy routing. */
  const links: { lo: THREE.Vector3; hi: THREE.Vector3 }[] = [];

  // ── materials (the Cyber Forest sheets + the art folder's PBR sets) ─────────────────────────────────────────
  const cyan = color(0x2ae6ff), amber = color(0xffa040);
  const mossA = art('moss_cable_albedo.jpg', true, true), mossB = art('moss_strand_albedo.jpg', true, true), mossG = art('moss_glow_albedo.jpg', true, true);
  const ground = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, normalMap: art('moss_cable_normal.jpg', false, true) });
  ground.normalScale.set(0.8, 0.8);
  {
    const wp = positionWorld.xz;
    const a = tslTexture(mossA, wp.mul(1 / 9).add(vec2(0.21, 0.63))).rgb, b = tslTexture(mossB, wp.mul(1 / 8).add(vec2(0.37, 0.11))).rgb;
    const g = tslTexture(mossG, wp.mul(1 / 6)).rgb;
    const k = tslTexture(mossG, wp.mul(1 / 97)).g, k2 = tslTexture(mossB, wp.mul(1 / 71).add(vec2(0.5, 0.2))).g;
    // strand moss is the floor; the glow moss shows in patches only (its cyan spots read as a repeat up close)
    const base = mix(b.mul(0.75), g.mul(0.45), smoothstep(float(0.62), float(0.82), k2));
    const lum = a.dot(vec3(0.3, 0.5, 0.2));
    // Elderwood is greener than the old grove: lift the green a touch so the map reads as the art's mossy hollow
    ground.colorNode = mix(base, a.mul(0.6), smoothstep(float(0.62), float(0.8), k).mul(smoothstep(float(0.6), float(0.2), lum))).mul(vec3(0.4, 0.58, 0.36));
    ground.emissiveNode = g.mul(smoothstep(float(0.6), float(0.9), g.g)).mul(cyan).mul(smoothstep(float(0.25), float(0.75), k).mul(0.8).add(0.2))
      .mul(float(0.12).add(uBeatPulse.mul(0.1)));
  }
  const bark = new THREE.MeshStandardNodeMaterial({ map: art('bark_albedo.jpg', true, true), normalMap: art('bark_normal.jpg', false, true), roughness: 0.92, color: 0x8d8a84 });
  bark.normalScale.set(1.6, 1.6);
  {
    const cond = tslTexture(art('conduit_albedo.jpg', true, true), uv().mul(vec2(0.9, 0.5))).rgb;
    const band = smoothstep(float(0.55), float(0.62), sin(uv().x.mul(5.3).add(sin(uv().y.mul(0.7)).mul(1.4))).mul(0.5).add(0.5));
    const lit = smoothstep(float(0.45), float(0.8), max(cond.b, cond.g));
    // Fable first, Tron only as faint rune veins (Vol 1 brief): the veins glow, softly
    bark.emissiveNode = mix(cyan, amber, smoothstep(float(0.2), float(0.5), cond.r.sub(cond.b))).mul(lit).mul(band)
      .mul(float(0.7).add(sin(time.mul(1.7).add(positionWorld.y.mul(0.5))).mul(0.3)).add(uBeatPulse.mul(0.6)));
  }
  const wood = pbr('marsh-wood', { maps: ['normal', 'roughness'], tint: 0xb59a7a, normalScale: 1.1 });
  const darkWood = pbr('marsh-wood', { maps: ['normal', 'roughness'], tint: 0x6e5a48, normalScale: 1.2 });
  const stone = pbr('glacial-brick', { maps: ['normal', 'roughness', 'ao'], tint: 0x8b9686, normalScale: 1.2 });
  const rock = pbr('volc-rock', { maps: ['normal', 'roughness'], tint: 0x8a9488, normalScale: 1.3 });
  const rope = new THREE.MeshStandardNodeMaterial({ color: 0x8a7656, roughness: 0.95 });
  const lampMat = new THREE.MeshStandardNodeMaterial({ color: 0x2a1a08, roughness: 0.5 });
  lampMat.emissiveNode = color(0xffb050).mul(float(2.2).add(uBeatPulse.mul(0.6)));
  const runeMat = new THREE.MeshStandardNodeMaterial({ color: 0x03141a, roughness: 0.3 });
  runeMat.emissiveNode = cyan.mul(float(1.1).add(uBeatPulse.mul(1.2)));

  // ── terrain ─────────────────────────────────────────────────────────────────────────────────────────────────
  {
    const W = 240, SX = lo ? 120 : 220;
    const g = new THREE.PlaneGeometry(W, W, SX, SX);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, H(p.getX(i), p.getZ(i)));
    g.computeVertexNormals();
    kit.add(ground, g, {});
  }
  // rocks: the shelf's cliff face over the pool, boulders round the hollow
  {
    const rockGeos: THREE.BufferGeometry[] = [];
    const put = (x: number, z: number, r: number, sink = 0.35) => {
      const g = boulder(r, x * 0.37 + z, lo ? 2 : 3);
      kit.place(g, x, H(x, z) - r * sink, z, R() * 6.28);
      rockGeos.push(g);
    };
    for (let i = 0; i < 26; i++) { // the cliff lip between the shelf and the pool (the waterfall drops through a gap at its middle)
      const a = -0.2 + (i / 25) * 2.3, x = POOL.x + Math.sin(a + 2.3) * 11.5, z = POOL.z + Math.cos(a + 2.3) * 11.5;
      if (Math.abs(i - 12) < 2) continue;
      put(x, z, 1.6 + R() * 1.8, 0.2);
    }
    for (let i = 0; i < 18; i++) { const a = R() * 6.28, d = 12 + R() * 5; put(POOL.x + Math.sin(a) * d, POOL.z + Math.cos(a) * d, 0.9 + R() * 1.4); }
    for (let i = 0; i < (lo ? 30 : 60); i++) {
      const x = (R() - 0.5) * 2 * BOUND, z = (R() - 0.5) * 2 * BOUND;
      if (inStructure(x, z, 1) || nearLane(x, z, 4)) continue;
      put(x, z, 0.5 + R() * 1.5);
    }
    for (const g of rockGeos) kit.add(rock, g, { tpm: 0.4 });
  }

  // ── the Great Oak: a trunk you can't miss, roots over the plateau, limbs into a vast crown ─────────────────
  const treeGeos: THREE.BufferGeometry[] = [], rootGeos: THREE.BufferGeometry[] = [];
  type Crown = { x: number; y: number; z: number; r: number; kind: number; forest?: boolean };
  /** Forest trees (not the oak, the platforms or the tower): code trunks + cards until the sheet-built tree models load. */
  const fTreeGeos: THREE.BufferGeometry[] = [], fRootGeos: THREE.BufferGeometry[] = [];
  const forestSpots: { x: number; z: number; h: number; yaw: number }[] = [];
  const crowns: Crown[] = [];
  let oakCollider: THREE.BufferGeometry | null = null;
  {
    const gy = H(OAK.x, OAK.z);
    const trunk = new THREE.CatmullRomCurve3([
      new THREE.Vector3(OAK.x, gy - 2, OAK.z), new THREE.Vector3(OAK.x + 0.4, gy + 12, OAK.z - 0.3),
      new THREE.Vector3(OAK.x - 0.6, gy + 26, OAK.z + 0.5), new THREE.Vector3(OAK.x + 0.3, gy + 40, OAK.z),
    ]);
    // the trunk's look is the model built from CF-01 (great_oak.glb); this tube is its collider, and its upper part
    // (above the model's 24 m) carries the limbs into the crown
    oakCollider = barkTube(trunk, TRUNK_R + 0.6, 2.2, lo ? 14 : 24, lo ? 16 : 28, 0.45, 7);
    const upper = new THREE.CatmullRomCurve3([new THREE.Vector3(OAK.x - 0.4, gy + 20, OAK.z + 0.3), new THREE.Vector3(OAK.x - 0.6, gy + 30, OAK.z + 0.5), new THREE.Vector3(OAK.x + 0.3, gy + 42, OAK.z)]);
    void upper; // above the model the trunk, limbs and crown are grown (CF_GREAT_OAK in the forest below)
    for (let k = 0; k < (lo ? 7 : 12); k++) { // roots flaring over the plateau
      const a = (k / (lo ? 7 : 12)) * 6.28 + R() * 0.3, len = 9 + R() * 7;
      const ex = OAK.x + Math.sin(a) * len, ez = OAK.z + Math.cos(a) * len;
      const rc = new THREE.CatmullRomCurve3([
        new THREE.Vector3(OAK.x + Math.sin(a) * TRUNK_R * 0.6, gy + 5, OAK.z + Math.cos(a) * TRUNK_R * 0.6),
        new THREE.Vector3(OAK.x + Math.sin(a) * len * 0.45, gy + 1.4, OAK.z + Math.cos(a) * len * 0.45),
        new THREE.Vector3(ex, H(ex, ez) - 0.4, ez),
      ]);
      rootGeos.push(barkTube(rc, 1.7, 0.25, 9, 9, 0.5, k * 3.1));
    }
    for (let b = 0; b < (lo ? 6 : 10); b++) { // great limbs above the deck
      const a = (b / (lo ? 6 : 10)) * 6.28 + R() * 0.4, by = gy + 20 + R() * 14, bl = 11 + R() * 9;
      const bc = new THREE.CatmullRomCurve3([
        new THREE.Vector3(OAK.x, by, OAK.z),
        new THREE.Vector3(OAK.x + Math.sin(a) * bl * 0.5, by + bl * 0.25, OAK.z + Math.cos(a) * bl * 0.5),
        new THREE.Vector3(OAK.x + Math.sin(a) * bl, by + bl * 0.35 + R() * 3, OAK.z + Math.cos(a) * bl),
      ]);
      void bc; R(); // (the grown crown has its own limbs; the R() keeps the level's other random draws unchanged)
    }
  }

  // ── the treetop deck round the oak: planks on radial beams, a rope rail with gaps for the bridges/stairs/nets ─
  const openings = [A_WEST, A_EAST, A_STAIR, A_NET1, A_NET2];
  const isOpen = (a: number, half = 0.09) => openings.some((o) => Math.abs(Math.atan2(Math.sin(a - o), Math.cos(a - o))) < half);
  {
    const N = 64, outer: [number, number][] = [], hole: [number, number][] = [];
    for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; outer.push([OAK.x + Math.sin(a) * DECK_R, OAK.z + Math.cos(a) * DECK_R]); }
    for (let i = N - 1; i >= 0; i--) { const a = (i / N) * Math.PI * 2; hole.push([OAK.x + Math.sin(a) * (TRUNK_R + 0.4), OAK.z + Math.cos(a) * (TRUNK_R + 0.4)]); }
    const deck = polyPrism(outer, [hole], DECK_Y - 0.45, DECK_Y);
    kit.add(wood, deck.top, { tpm: 0.35 }); kit.add(darkWood, deck.sides, { tpm: 0.5 });
    for (let i = 0; i < 16; i++) { // radial beams under the planks, and posts down to the mound at the outer ring
      const a = (i / 16) * Math.PI * 2, mid = rimAt(a, (TRUNK_R + DECK_R) / 2);
      kit.box(darkWood, 0.5, 0.6, DECK_R - TRUNK_R, mid.x, DECK_Y - 0.75, mid.z, a, { tpm: 0.5 });
      if (i % 2 === 0) {
        const p = rimAt(a, DECK_R - 1.5), gy = H(p.x, p.z);
        const c = new THREE.CatmullRomCurve3([new THREE.Vector3(p.x, gy - 0.5, p.z), new THREE.Vector3(p.x, DECK_Y - 0.4, p.z)]);
        treeGeos.push(barkTube(c, 0.45, 0.4, 3, 8, 0.2, i));
      }
    }
    // rope rail: posts every ~2.4 m with a hanging rope between them
    const posts = Math.round((2 * Math.PI * DECK_R) / 2.4);
    for (let i = 0; i < posts; i++) {
      const a0 = (i / posts) * Math.PI * 2, a1 = ((i + 1) / posts) * Math.PI * 2;
      if (isOpen(a0) && isOpen(a1)) continue;
      const p0 = rimAt(a0, DECK_R - 0.3), p1 = rimAt(a1, DECK_R - 0.3);
      if (!isOpen(a0)) kit.box(darkWood, 0.22, 1.25, 0.22, p0.x, DECK_Y + 0.62, p0.z, a0, { tpm: 1 });
      if (isOpen(a0) || isOpen(a1)) continue;
      const c = new THREE.QuadraticBezierCurve3(new THREE.Vector3(p0.x, DECK_Y + 1.1, p0.z), new THREE.Vector3((p0.x + p1.x) / 2, DECK_Y + 0.85, (p0.z + p1.z) / 2), new THREE.Vector3(p1.x, DECK_Y + 1.1, p1.z));
      kit.add(rope, taperTube(c, 0.05, 0.05, 6, 5), { solid: false, shadow: false });
    }
    // an invisible guard so a sprint along the rail doesn't drop you off the edge between posts
    for (let i = 0; i < posts; i++) {
      const a = ((i + 0.5) / posts) * Math.PI * 2;
      if (isOpen(a, 0.12)) continue;
      const p = rimAt(a, DECK_R - 0.3);
      kit.box(B.invisible, 2.6, 1.2, 0.2, p.x, DECK_Y + 0.6, p.z, a, { shadow: false });   // local x runs along the rim
    }
    // two little shelters on the deck (the art's lean-to huts) for cover, crates round OBJ A
    for (const a of [-1.25, 1.35]) {
      const p = rimAt(a, DECK_R - 5);
      kit.box(darkWood, 3.6, 2.4, 2.6, p.x, DECK_Y + 1.2, p.z, a, { tpm: 0.5 });
      kit.box(wood, 4.2, 0.25, 3.4, p.x, DECK_Y + 2.6, p.z, a, { tpm: 0.5, rx: 0.18 });
      const l = rimAt(a, DECK_R - 3.2); kit.box(lampMat, 0.3, 0.45, 0.3, l.x, DECK_Y + 2.0, l.z, 0, { solid: false });
    }
    for (const [da, dr] of [[-0.35, 9], [0.7, 10], [0.05, 18], [0.55, 17], [-0.8, 15], [1.0, 16]] as const) {
      const p = rimAt(da, dr), s = 1.0 + R() * 0.3;
      kit.box(darkWood, s, s, s, p.x, DECK_Y + s / 2, p.z, R() * 1.5, { tpm: 0.8 });
    }
  }

  // ── the stone stairway down the deck's south-east side (CF-14) ──────────────────────────────────────────────
  {
    const top = rimAt(A_STAIR, DECK_R - 0.2), yaw = A_STAIR;               // descending outward from the rim
    const run = 0.42, rise = 0.26, steps = Math.round(DECK_Y / rise);
    const len = run * steps, bot = { x: top.x + Math.sin(yaw) * len, z: top.z + Math.cos(yaw) * len };
    // build it from the bottom up (flight climbs along its yaw)
    B.flight(stone, bot.x, H(bot.x, bot.z) - 0.2, bot.z, yaw + Math.PI, DECK_Y, 3.2, (DECK_Y - H(bot.x, bot.z) + 0.2) / steps, run, true);
    links.push({ lo: new THREE.Vector3(bot.x + Math.sin(yaw) * 1.5, H(bot.x, bot.z), bot.z + Math.cos(yaw) * 1.5), hi: new THREE.Vector3(top.x - Math.sin(yaw) * 1.5, DECK_Y, top.z - Math.cos(yaw) * 1.5) });
    // a landing pad at the bottom
    kit.box(stone, 4.4, 0.4, 3.0, bot.x + Math.sin(yaw) * 1.4, H(bot.x, bot.z) - 0.05, bot.z + Math.cos(yaw) * 1.4, yaw, { tpm: 0.5 });
  }

  // ── cargo nets down the deck's front (climb them: a steep walkable ramp under a rope net) ──────────────────
  const netTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d')!; g.clearRect(0, 0, 256, 256);
    g.strokeStyle = '#b39a70'; g.lineWidth = 9;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.stroke(); g.beginPath(); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const netMat = new THREE.MeshStandardNodeMaterial({ map: netTex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 });
  for (const a of [A_NET1, A_NET2]) {
    const top = rimAt(a, DECK_R + 0.1), out = 10.5, bot = { x: top.x + Math.sin(a) * out, z: top.z + Math.cos(a) * out };
    const by = H(bot.x, bot.z);
    B.ramp(bot.x, by + 0.05, bot.z, top.x, DECK_Y + 0.05, top.z, 3.6);
    links.push({ lo: new THREE.Vector3(bot.x + Math.sin(a) * 1.2, by, bot.z + Math.cos(a) * 1.2), hi: new THREE.Vector3(top.x - Math.sin(a) * 1.5, DECK_Y, top.z - Math.cos(a) * 1.5) });
    const len = Math.hypot(out, DECK_Y - by);
    const g = new THREE.PlaneGeometry(3.8, len);
    const uvA = g.attributes.uv; for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uvA.getX(i) * 3.8 / 0.9, uvA.getY(i) * len / 0.9);
    g.rotateX(-Math.PI / 2 + Math.atan2(DECK_Y - by, out));
    g.rotateY(a); g.translate((top.x + bot.x) / 2, (DECK_Y + by) / 2 + 0.25, (top.z + bot.z) / 2);
    const m = new THREE.Mesh(g, netMat); m.castShadow = !lo; group.add(m);
  }

  const oakSpots: TreeSpot[] = [{ x: OAK.x, y: H(OAK.x, OAK.z), z: OAK.z, yaw: 0.6, species: 4, scale: 1 }];
  // ── oak platforms: a trunk through an octagonal deck at canopy level, struts, rope rail, a crown overhead ──
  const platform = (p: { x: number; z: number }, openTo: number[], hut: boolean) => {
    const gy = H(p.x, p.z);
    const trunk = new THREE.CatmullRomCurve3([new THREE.Vector3(p.x, gy - 1, p.z), new THREE.Vector3(p.x + 0.3, gy + 9, p.z - 0.2), new THREE.Vector3(p.x - 0.2, DECK_Y + 6, p.z + 0.2), new THREE.Vector3(p.x, DECK_Y + 12, p.z)]);
    treeGeos.push(barkTube(trunk, PLAT_TRUNK + 0.4, 0.7, lo ? 10 : 16, lo ? 10 : 16, 0.4, p.x));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * 6.28 + R(), len = 4 + R() * 3, ex = p.x + Math.sin(a) * len, ez = p.z + Math.cos(a) * len;
      rootGeos.push(barkTube(new THREE.CatmullRomCurve3([new THREE.Vector3(p.x, gy + 2.5, p.z), new THREE.Vector3(p.x + Math.sin(a) * len * 0.5, gy + 0.6, p.z + Math.cos(a) * len * 0.5), new THREE.Vector3(ex, H(ex, ez) - 0.3, ez)]), 0.8, 0.15, 7, 7, 0.5, k + p.z));
    }
    const outer: [number, number][] = [], hole: [number, number][] = [];
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 8; outer.push([p.x + Math.sin(a) * PLAT_R, p.z + Math.cos(a) * PLAT_R]); }
    for (let k = 11; k >= 0; k--) { const a = (k / 12) * Math.PI * 2; hole.push([p.x + Math.sin(a) * (PLAT_TRUNK + 0.3), p.z + Math.cos(a) * (PLAT_TRUNK + 0.3)]); }
    const d = polyPrism(outer, [hole], DECK_Y - 0.4, DECK_Y);
    kit.add(wood, d.top, { tpm: 0.35 }); kit.add(darkWood, d.sides, { tpm: 0.5 });
    for (let k = 0; k < 4; k++) { // diagonal struts from the trunk to the deck's underside
      const a = (k / 4) * Math.PI * 2 + 0.4, o = { x: p.x + Math.sin(a) * (PLAT_R - 1), z: p.z + Math.cos(a) * (PLAT_R - 1) };
      const c = new THREE.LineCurve3(new THREE.Vector3(p.x + Math.sin(a) * PLAT_TRUNK, DECK_Y - 6, p.z + Math.cos(a) * PLAT_TRUNK), new THREE.Vector3(o.x, DECK_Y - 0.45, o.z));
      treeGeos.push(barkTube(c, 0.3, 0.26, 3, 7, 0.1, k));
    }
    const open = (a: number) => openTo.some((o) => Math.abs(Math.atan2(Math.sin(a - o), Math.cos(a - o))) < 0.3);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, a1 = ((k + 1) / 16) * Math.PI * 2;
      const p0 = { x: p.x + Math.sin(a) * (PLAT_R - 0.4), z: p.z + Math.cos(a) * (PLAT_R - 0.4) }, p1 = { x: p.x + Math.sin(a1) * (PLAT_R - 0.4), z: p.z + Math.cos(a1) * (PLAT_R - 0.4) };
      if (!open(a)) kit.box(darkWood, 0.2, 1.2, 0.2, p0.x, DECK_Y + 0.6, p0.z, a, { tpm: 1 });
      if (open(a) || open(a1)) continue;
      kit.add(rope, taperTube(new THREE.LineCurve3(new THREE.Vector3(p0.x, DECK_Y + 1.1, p0.z), new THREE.Vector3(p1.x, DECK_Y + 1.1, p1.z)), 0.05, 0.05, 2, 5), { solid: false, shadow: false });
      const mid = { x: (p0.x + p1.x) / 2, z: (p0.z + p1.z) / 2 };
      kit.box(B.invisible, Math.hypot(p1.x - p0.x, p1.z - p0.z), 1.2, 0.2, mid.x, DECK_Y + 0.6, mid.z, (a + a1) / 2, { shadow: false });
    }
    if (hut) {
      const a = openTo[0] + Math.PI, hp = { x: p.x + Math.sin(a) * 4.2, z: p.z + Math.cos(a) * 4.2 };
      kit.box(darkWood, 3.0, 2.3, 2.4, hp.x, DECK_Y + 1.15, hp.z, a, { tpm: 0.5 });
      kit.box(wood, 3.6, 0.22, 3.0, hp.x, DECK_Y + 2.5, hp.z, a, { tpm: 0.5, rx: 0.2 });
    }
    const lamp = { x: p.x + 1.2, z: p.z + 1.2 };
    kit.box(lampMat, 0.3, 0.45, 0.3, lamp.x, DECK_Y + 2.6, lamp.z, 0, { solid: false });
    R(); // its crown is grown: CF_PLATFORM_OAK in the forest below
    oakSpots.push({ x: p.x, y: gy, z: p.z, yaw: p.x * 0.37, species: 5, scale: (DECK_Y + 24 - gy) / CF_PLATFORM_OAK.height });
  };
  const toward = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.atan2(b.x - a.x, b.z - a.z);
  platform(PLATS.west, [toward(PLATS.west, OAK)], true);
  platform(PLATS.east, [toward(PLATS.east, OAK)], true);
  platform(PLATS.sniper, [toward(PLATS.sniper, OBJ_B)], false);
  platform(PLATS.armory, [toward(PLATS.armory, OBJ_C)], true);

  // ── rope bridges (CF-11): planks along a sagging curve, rope hand-lines, a guard so you only fall on purpose ─
  const ropeBridge = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, width = 2.0, sag = 0.9) => {
    const L = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az), n = Math.ceil(L / 0.55);
    const at = (t: number) => new THREE.Vector3(ax + (bx - ax) * t, ay + (by - ay) * t - sag * Math.sin(Math.PI * t), az + (bz - az) * t);
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n, p0 = at(t0), p1 = at(t1), mid = p0.clone().add(p1).multiplyScalar(0.5);
      const pitch = Math.atan2(p1.y - p0.y, Math.hypot(p1.x - p0.x, p1.z - p0.z));
      kit.box(i % 2 ? wood : darkWood, width, 0.09, 0.5, mid.x, mid.y - 0.045, mid.z, yaw, { tpm: 0.8, rx: -pitch });
    }
    for (const s of [-1, 1]) {
      const ox = Math.cos(yaw) * s * (width / 2), oz = -Math.sin(yaw) * s * (width / 2);
      const pts = Array.from({ length: 13 }, (_, k) => at(k / 12).add(new THREE.Vector3(ox, 1.05, oz)));
      kit.add(rope, taperTube(new THREE.CatmullRomCurve3(pts), 0.05, 0.05, 24, 5), { solid: false, shadow: false });
      for (let k = 1; k < 12; k++) { // hangers
        const p = at(k / 12).add(new THREE.Vector3(ox, 0, oz));
        kit.add(rope, taperTube(new THREE.LineCurve3(p, p.clone().add(new THREE.Vector3(0, 1.05, 0))), 0.025, 0.025, 1, 4), { solid: false, shadow: false });
      }
      // guard: invisible rail segments
      for (let k = 0; k < 8; k++) {
        const p0 = at(k / 8), p1 = at((k + 1) / 8), mid = p0.clone().add(p1).multiplyScalar(0.5);
        kit.box(B.invisible, 0.15, 1.1, Math.hypot(p1.x - p0.x, p1.z - p0.z) + 0.1, mid.x + ox * 1.05, mid.y + 0.55, mid.z + oz * 1.05, yaw, { shadow: false });
      }
    }
  };
  {
    const wRim = rimAt(A_WEST, DECK_R - 0.2), eRim = rimAt(A_EAST, DECK_R - 0.2);
    const wEnd = { x: PLATS.west.x + Math.sin(toward(PLATS.west, OAK)) * (PLAT_R - 0.3), z: PLATS.west.z + Math.cos(toward(PLATS.west, OAK)) * (PLAT_R - 0.3) };
    const eEnd = { x: PLATS.east.x + Math.sin(toward(PLATS.east, OAK)) * (PLAT_R - 0.3), z: PLATS.east.z + Math.cos(toward(PLATS.east, OAK)) * (PLAT_R - 0.3) };
    ropeBridge(wRim.x, DECK_Y, wRim.z, wEnd.x, DECK_Y, wEnd.z);
    ropeBridge(eRim.x, DECK_Y, eRim.z, eEnd.x, DECK_Y, eEnd.z);
    const sEnd = { x: PLATS.sniper.x + Math.sin(toward(PLATS.sniper, OBJ_B)) * (PLAT_R - 0.3), z: PLATS.sniper.z + Math.cos(toward(PLATS.sniper, OBJ_B)) * (PLAT_R - 0.3) };
    const bFoot = { x: OBJ_B.x - 6, z: OBJ_B.z + 8 };
    ropeBridge(bFoot.x, H(bFoot.x, bFoot.z) + 0.05, bFoot.z, sEnd.x, DECK_Y, sEnd.z, 2.0, 0.5);
    links.push({ lo: new THREE.Vector3(bFoot.x, H(bFoot.x, bFoot.z), bFoot.z), hi: new THREE.Vector3(PLATS.sniper.x, DECK_Y, PLATS.sniper.z).lerp(new THREE.Vector3(sEnd.x, DECK_Y, sEnd.z), 0.6) });
    const aEnd = { x: PLATS.armory.x + Math.sin(toward(PLATS.armory, OBJ_C)) * (PLAT_R - 0.3), z: PLATS.armory.z + Math.cos(toward(PLATS.armory, OBJ_C)) * (PLAT_R - 0.3) };
    const cFoot = { x: OBJ_C.x + 5, z: OBJ_C.z + 5 };
    ropeBridge(cFoot.x, H(cFoot.x, cFoot.z) + 0.05, cFoot.z, aEnd.x, DECK_Y, aEnd.z, 2.0, 0.4);
    links.push({ lo: new THREE.Vector3(cFoot.x, H(cFoot.x, cFoot.z), cFoot.z), hi: new THREE.Vector3(PLATS.armory.x, DECK_Y, PLATS.armory.z).lerp(new THREE.Vector3(aEnd.x, DECK_Y, aEnd.z), 0.6) });
  }

  // ── colliders for the structures placed as art (the models themselves are visuals only) ──────────────────
  const solidBox = (w: number, h: number, d: number, x: number, z: number, yaw: number, y0 = H(x, z)) => kit.box(B.invisible, w, h, d, x, y0 + h / 2, z, yaw, { shadow: false });
  const CABIN_YAW = 1.15, CHAPEL_YAW = -1.9, TUNNEL_YAW = 0.95;
  solidBox(7.0, 6.0, 5.5, CABIN.x, CABIN.z, CABIN_YAW);
  // the chapel: three walls and a gable you can walk round; its open front faces the shelf
  {
    const L = 15, W = 9, hgt = 9, y0 = H(CHAPEL.x, CHAPEL.z);
    const fx = Math.sin(CHAPEL_YAW), fz = Math.cos(CHAPEL_YAW), sx = Math.cos(CHAPEL_YAW), sz = -Math.sin(CHAPEL_YAW);
    for (const s of [-1, 1]) solidBox(1.2, hgt, L, CHAPEL.x + sx * s * W / 2, CHAPEL.z + sz * s * W / 2, CHAPEL_YAW, y0);
    solidBox(W, hgt, 1.2, CHAPEL.x - fx * L / 2, CHAPEL.z - fz * L / 2, CHAPEL_YAW, y0);
    for (const s of [-1, 1]) solidBox(2.6, hgt, 1.2, CHAPEL.x + fx * L / 2 + sx * s * 3.2, CHAPEL.z + fz * L / 2 + sz * s * 3.2, CHAPEL_YAW, y0);
  }
  // the log tunnel: two walls and a roof you can run along
  {
    const L = 14, y0 = H(TUNNEL.x, TUNNEL.z), sx = Math.cos(TUNNEL_YAW), sz = -Math.sin(TUNNEL_YAW);
    for (const s of [-1, 1]) solidBox(1.0, 4.4, L, TUNNEL.x + sx * s * 2.4, TUNNEL.z + sz * s * 2.4, TUNNEL_YAW, y0);
    kit.box(B.invisible, 5.8, 0.6, L, TUNNEL.x, y0 + 4.4, TUNNEL.z, TUNNEL_YAW, { shadow: false });
    // the hollow log itself (bark outside, seen from inside too) until its sheet model is built
    const ax = Math.sin(TUNNEL_YAW), az = Math.cos(TUNNEL_YAW);
    const logCurve = new THREE.LineCurve3(new THREE.Vector3(TUNNEL.x - ax * L / 2, y0 + 2.2, TUNNEL.z - az * L / 2), new THREE.Vector3(TUNNEL.x + ax * L / 2, y0 + 2.3, TUNNEL.z + az * L / 2));
    const logMat = new THREE.MeshStandardNodeMaterial({ map: bark.map, normalMap: bark.normalMap, roughness: 0.92, color: 0x8d8a84, side: THREE.DoubleSide });
    const log = new THREE.Mesh(barkTube(logCurve, 3.0, 2.8, 10, lo ? 14 : 24, 0.35, 5), logMat);
    log.castShadow = !lo; log.receiveShadow = true; log.name = 'tunnel-log'; group.add(log);
  }
  // ruin walls (CF-23): cover in the open ground, the arch walkable through
  for (const [x, z, yaw] of [[30, 4, -0.6], [-46, 40, 2.0]] as const) {
    const sx = Math.cos(yaw), sz = -Math.sin(yaw);
    for (const s of [-1, 1]) solidBox(2.0, 4.2, 1.3, x + sx * s * 2.0, z + sz * s * 2.0, yaw);
    kit.box(B.invisible, 6.0, 1.0, 1.3, x, H(x, z) + 3.7, z, yaw, { shadow: false });
  }
  // the monolith
  kit.prism(B.invisible, 8, 1.9, 2.2, 10, MONOLITH.x, H(MONOLITH.x, MONOLITH.z), MONOLITH.z, 0, {});
  kit.prism(B.invisible, 16, 4.0, 4.2, 0.6, MONOLITH.x, H(MONOLITH.x, MONOLITH.z) - 0.2, MONOLITH.z, 0, {});

  // ── the watchtower (CF-09): log legs, braces, a lookout at 9 m, a ladder up the south face ──────────────────
  const TOWER_TOP = 9;
  {
    const y0 = H(TOWER.x, TOWER.z), half = 1.9;
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const c = new THREE.LineCurve3(new THREE.Vector3(TOWER.x + dx * (half + 0.5), y0 - 0.5, TOWER.z + dz * (half + 0.5)), new THREE.Vector3(TOWER.x + dx * half, y0 + 12.3, TOWER.z + dz * half));
      treeGeos.push(barkTube(c, 0.3, 0.24, 5, 8, 0.15, dx * 3 + dz));
    }
    for (const h of [2.5, 5.5]) for (let k = 0; k < 4; k++) { // X braces
      const a = k * Math.PI / 2, ox = Math.sin(a) * (half + 0.3), oz = Math.cos(a) * (half + 0.3), tx = Math.cos(a), tz = -Math.sin(a);
      for (const s of [-1, 1]) {
        const c = new THREE.LineCurve3(new THREE.Vector3(TOWER.x + ox - tx * s * half, y0 + h, TOWER.z + oz - tz * s * half), new THREE.Vector3(TOWER.x + ox + tx * s * half, y0 + h + 3, TOWER.z + oz + tz * s * half));
        rootGeos.push(barkTube(c, 0.12, 0.12, 2, 6, 0.05, h + k + s));
      }
    }
    kit.box(wood, 4.8, 0.3, 4.8, TOWER.x, y0 + TOWER_TOP, TOWER.z, 0, { tpm: 0.5 });
    for (let k = 0; k < 4; k++) { // waist-high log walls round the lookout, with a gap where the ladder comes up
      const a = k * Math.PI / 2, ox = Math.sin(a) * 2.3, oz = Math.cos(a) * 2.3;
      if (k === 0) { for (const s of [-1, 1]) kit.box(darkWood, 1.4, 1.0, 0.2, TOWER.x + ox + Math.cos(a) * s * 1.7, y0 + TOWER_TOP + 0.65, TOWER.z + oz - Math.sin(a) * s * 1.7, a, { tpm: 0.6 }); continue; }
      kit.box(darkWood, 4.8, 1.0, 0.2, TOWER.x + ox, y0 + TOWER_TOP + 0.65, TOWER.z + oz, a, { tpm: 0.6 });
    }
    kit.box(wood, 5.6, 0.25, 5.6, TOWER.x, y0 + 12.4, TOWER.z, 0, { tpm: 0.5, rx: 0.0 });   // roof
    kit.box(lampMat, 0.3, 0.45, 0.3, TOWER.x + 1.6, y0 + TOWER_TOP + 2.2, TOWER.z + 1.6, 0, { solid: false });
    // ladder: rails + rungs, and a steep walkable ramp behind them
    const lb = { x: TOWER.x, z: TOWER.z + 2.4 + 5.0 };
    B.ramp(lb.x, y0 + 0.05, lb.z, TOWER.x, y0 + TOWER_TOP + 0.15, TOWER.z + 2.35, 1.4);
    for (const s of [-0.55, 0.55]) rootGeos.push(barkTube(new THREE.LineCurve3(new THREE.Vector3(lb.x + s, y0 - 0.2, lb.z), new THREE.Vector3(TOWER.x + s, y0 + TOWER_TOP + 1, TOWER.z + 2.3)), 0.07, 0.07, 2, 5, 0, s));
    for (let k = 1; k < 26; k++) {
      const t = k / 26, x = lb.x, z = lb.z + (TOWER.z + 2.3 - lb.z) * t, y = y0 + (TOWER_TOP + 0.1) * t;
      kit.box(darkWood, 1.15, 0.07, 0.07, x, y, z, 0, { solid: false, shadow: false });
    }
  }

  // ── OBJ C's shelf and the waterfall pool (CF-22): a stream over the lip, a falling sheet, a glowing pool ─────
  const waterMat = new THREE.MeshStandardNodeMaterial({ color: 0x0b2a30, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.86 });
  {
    const flow = fract(uv().y.mul(3).sub(time.mul(0.35)));
    waterMat.emissiveNode = cyan.mul(smoothstep(float(0.85), float(1.0), sin(positionWorld.x.mul(1.3).add(positionWorld.z.mul(0.7)).add(time.mul(1.4))).mul(0.5).add(0.5)).mul(0.25).add(0.05))
      .add(color(0x9ff6ff).mul(smoothstep(float(0.9), float(1.0), flow)).mul(0.15));
    const pool = new THREE.Mesh(new THREE.CircleGeometry(11.2, 48), waterMat);
    pool.rotation.x = -Math.PI / 2; pool.position.set(POOL.x, -3.2, POOL.z); group.add(pool);
    // the falling sheet, from the shelf's lip down to the pool
    const lip = { x: POOL.x + Math.sin(2.3 + 1.0) * 11.5, z: POOL.z + Math.cos(2.3 + 1.0) * 11.5 };
    const lipY = H(lip.x, lip.z) + 0.3;
    const fallMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const streak = fract(uv().y.mul(5).add(time.mul(1.6)).add(sin(uv().x.mul(37)).mul(0.3)));
    fallMat.colorNode = mix(color(0x7ad8e8), color(0xe8ffff), smoothstep(float(0.6), float(0.95), streak));
    fallMat.opacityNode = smoothstep(float(0.0), float(0.15), uv().x).mul(smoothstep(float(1.0), float(0.85), uv().x)).mul(0.75);
    const fallH = lipY + 3.2, fall = new THREE.Mesh(new THREE.PlaneGeometry(3.4, fallH, 1, 12), fallMat);
    const toPool = Math.atan2(POOL.x - lip.x, POOL.z - lip.z);
    fall.position.set(lip.x + Math.sin(toPool) * 0.8, lipY - fallH / 2, lip.z + Math.cos(toPool) * 0.8); fall.rotation.y = toPool;
    group.add(fall);
    // the stream across the shelf, from the monolith glade to the lip
    const stream = new THREE.CatmullRomCurve3([new THREE.Vector3(MONOLITH.x + 6, 0, MONOLITH.z + 6), new THREE.Vector3(30, 0, 34), new THREE.Vector3(lip.x, 0, lip.z)]);
    const sp: number[] = [], suv: number[] = [], si: number[] = [];
    const SN = 30;
    for (let i = 0; i <= SN; i++) {
      const t = i / SN, p = stream.getPoint(t), tg = stream.getTangent(t), nx = -tg.z, nz = tg.x;
      for (const s of [-1, 1]) { const x = p.x + nx * s * 1.3, z = p.z + nz * s * 1.3; sp.push(x, H(x, z) + 0.12, z); suv.push((s + 1) / 2, t * 6); }
    }
    for (let i = 0; i < SN; i++) { const a = i * 2; si.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(suv, 2)); sg.setIndex(si); sg.computeVertexNormals();
    group.add(new THREE.Mesh(sg, waterMat));
    // mist where it lands
    const mist = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 8), new THREE.MeshBasicNodeMaterial({ color: 0xcff6ff, transparent: true, opacity: 0.08, depthWrite: false }));
    mist.position.set(lip.x + Math.sin(toPool) * 3, -2, lip.z + Math.cos(toPool) * 3); mist.scale.set(1.4, 0.6, 1.4); group.add(mist);
  }

  // ── spawns: rune circles in clearings at the map's west and east edges (the art's glowing rings) ───────────
  const spawnLights: THREE.PointLight[] = [];
  for (const [sp, col] of [[SPAWN_A, 0x38bdf8], [SPAWN_B, 0xfb923c]] as const) {
    const y = H(sp.x, sp.z);
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.6, 4.0, 64), new THREE.MeshBasicNodeMaterial({ color: col, transparent: true, opacity: 0.8 }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(sp.x, y + 0.05, sp.z); group.add(ring);
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; kit.box(stone, 0.7, 1.1 + R() * 0.8, 0.5, sp.x + Math.sin(a) * 5, y + 0.5, sp.z + Math.cos(a) * 5, a, { tpm: 0.6 }); }
    const l = new THREE.PointLight(col, 30, 18, 2); l.position.set(sp.x, y + 3, sp.z); group.add(l); spawnLights.push(l);
  }
  // control point plinths: A on the deck, B by the cabin, C on the shelf
  for (const p of [{ x: OBJ_B.x, z: OBJ_B.z }, { x: OBJ_C.x, z: OBJ_C.z }]) {
    const y = H(p.x, p.z);
    kit.prism(stone, 12, 4.2, 4.6, 0.35, p.x, y - 0.15, p.z, 0, { tpm: 0.5 });
    const rr = new THREE.Mesh(new THREE.RingGeometry(3.3, 3.45, 48), runeMat); rr.rotation.x = -Math.PI / 2; rr.position.set(p.x, y + 0.22, p.z); group.add(rr);
  }
  { const rr = new THREE.Mesh(new THREE.RingGeometry(3.3, 3.45, 48), runeMat); rr.rotation.x = -Math.PI / 2; rr.position.set(OBJ_A.x, DECK_Y + 0.02, OBJ_A.z); group.add(rr); }

  // ── glowing data cables along the paths (the map's cyan lines) ─────────────────────────────────────────────
  const cableMat = new THREE.MeshStandardNodeMaterial({ color: 0x06191e, roughness: 0.4 });
  cableMat.emissiveNode = cyan.mul(float(0.5).add(smoothstep(float(0.92), float(1.0), fract(uv().x.mul(6).sub(time.mul(0.5)))).mul(2.2)).add(uBeatPulse.mul(0.6)));
  {
    const geos: THREE.BufferGeometry[] = [];
    for (const lane of LANES) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < lane.length - 1; i++) {
        const [ax, az] = lane[i], [bx, bz] = lane[i + 1], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 2.5);
        for (let k = 0; k < n; k++) {
          const t = k / n, side = Math.sin((ax + az + k) * 0.7) * 1.4;
          const nx = -(bz - az), nz = bx - ax, nl = Math.hypot(nx, nz) || 1;
          const x = ax + (bx - ax) * t + nx / nl * (2.6 + side), z = az + (bz - az) * t + nz / nl * (2.6 + side);
          pts.push(new THREE.Vector3(x, H(x, z) + 0.06, z));
        }
      }
      if (pts.length < 2) continue;
      const g = taperTube(new THREE.CatmullRomCurve3(pts), 0.07, 0.07, pts.length * 3, 5);
      const uvs: number[] = []; const per = 5;
      for (let i = 0; i <= pts.length * 3; i++) for (let j = 0; j < per; j++) uvs.push(i / 3, j / per);
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.computeVertexNormals();
      geos.push(g.toNonIndexed());
    }
    const g = mergeGeometries(geos, false);
    if (g) { const m = new THREE.Mesh(g, cableMat); m.receiveShadow = true; group.add(m); }
  }

  // ── forest trees round the hollow ─────────────────────────────────────────────────────────────────────────
  const tree = (x: number, z: number, h: number, r: number, kind: number) => {
    const gy = H(x, z), lean = new THREE.Vector3((R() - 0.5) * 0.12 * h, 0, (R() - 0.5) * 0.12 * h);
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(x, gy - 1, z), new THREE.Vector3(x + lean.x * 0.3, gy + h * 0.35, z + lean.z * 0.3),
      new THREE.Vector3(x + lean.x * 0.75, gy + h * 0.7, z + lean.z * 0.75), new THREE.Vector3(x + lean.x, gy + h, z + lean.z)]);
    fTreeGeos.push(barkTube(c, r, r * 0.3, lo ? 8 : 12, lo ? 8 : 12, 0.3, x * 0.1 + z));
    forestSpots.push({ x, z, h, yaw: R() * Math.PI * 2 });
    for (let k = 0; k < (lo ? 3 : 5); k++) {
      const ra = (k / 5) * Math.PI * 2 + R(), len = r * (3 + R() * 3);
      fRootGeos.push(barkTube(new THREE.CatmullRomCurve3([new THREE.Vector3(x + Math.sin(ra) * r * 0.5, gy + r * 1.8, z + Math.cos(ra) * r * 0.5),
        new THREE.Vector3(x + Math.sin(ra) * len * 0.5, gy + r * 0.4, z + Math.cos(ra) * len * 0.5),
        new THREE.Vector3(x + Math.sin(ra) * len, H(x + Math.sin(ra) * len, z + Math.cos(ra) * len) - 0.2, z + Math.cos(ra) * len)]), r * 0.42, r * 0.08, 7, 6, 0.5, k + x));
    }
    crowns.push({ x: x + lean.x, y: gy + h * 0.92, z: z + lean.z, r: h * 0.36, kind, forest: true });
  };
  const okForTree = (x: number, z: number) => !nearLane(x, z, 6) && !inStructure(x, z, 2) && Math.abs(x) < BOUND + 2 && Math.abs(z) < BOUND + 2;
  {
    let made = 0;
    for (let i = 0; i < 2000 && made < (lo ? 40 : 75); i++) {
      const x = (R() - 0.5) * 2 * (BOUND + 2), z = (R() - 0.5) * 2 * (BOUND + 2);
      if (!okForTree(x, z) || crowns.some((c) => Math.hypot(c.x - x, c.z - z) < 8.5)) continue;
      const h = 16 + R() * 12;
      tree(x, z, h, 0.5 + h * 0.045, [0, 1, 2, 0, 1, 3, 4][Math.floor(R() * 7)]);
      made++;
    }
  }
  {
    const tg = mergeGeometries(treeGeos.map((g) => g.index ? g.toNonIndexed() : g), false);
    if (tg) { const m = new THREE.Mesh(tg, bark); m.castShadow = true; m.receiveShadow = true; m.userData.collide = true; group.add(m); }
    const rg = mergeGeometries(rootGeos.map((g) => g.index ? g.toNonIndexed() : g), false);
    if (rg) { const m = new THREE.Mesh(rg, bark); m.castShadow = !lo; m.receiveShadow = true; group.add(m); }
    if (oakCollider) { const m = new THREE.Mesh(oakCollider, B.invisible); m.userData.collide = true; group.add(m); }
    const ftg = mergeGeometries(fTreeGeos.map((g) => g.index ? g.toNonIndexed() : g), false);
    if (ftg) { const m = new THREE.Mesh(ftg, bark); m.name = 'forest-trunks'; m.castShadow = true; m.receiveShadow = true; m.userData.collide = true; group.add(m); }
    const frg = mergeGeometries(fRootGeos.map((g) => g.index ? g.toNonIndexed() : g), false);
    if (frg) { const m = new THREE.Mesh(frg, bark); m.name = 'forest-roots'; m.castShadow = !lo; m.receiveShadow = true; group.add(m); }
  }
  // ── undergrowth: every plant, mushroom and vine is grown by the vegetation service (no sprite cards left) ────
  const anywhere = (lane = 2.5): [number, number] | null => {
    const x = (R() - 0.5) * 2 * BOUND, z = (R() - 0.5) * 2 * BOUND;
    if (inStructure(x, z, -1) || nearLane(x, z, lane) || dist(x, z, POOL) < 12) return null;
    return [x, z];
  };
  const byTrees = (): [number, number] | null => {
    const c = crowns[Math.floor(R() * crowns.length)], a = R() * 6.28, d = 2 + R() * 6, x = c.x + Math.sin(a) * d, z = c.z + Math.cos(a) * d;
    return inStructure(x, z, -1) || nearLane(x, z, 2) || c.y > 30 ? null : [x, z];
  };
  const byPool = (): [number, number] | null => { const a = R() * 6.28, d = 12 + R() * 6, x = POOL.x + Math.sin(a) * d, z = POOL.z + Math.cos(a) * d; return nearLane(x, z, 2) ? null : [x, z]; };
  const kk = lo ? 0.35 : 1;
  // (the grass_a/b/c sprite cards are gone: real blades from the vegetation service below)
  // ferns, bushes and flowers are grown plants (services/vegetation/plants), not sprite cards: spots here, field below
  const plantSpots: PlantSpot[] = [];
  const plant = (species: number, count: number, place: () => [number, number] | null, sMin: number, sMax: number) => {
    for (let i = 0, n = 0; i < count * 4 && n < count; i++) {
      const p = place(); if (!p) continue;
      plantSpots.push({ x: p[0], y: H(p[0], p[1]) - 0.05, z: p[1], yaw: R() * 6.28, species, scale: sMin + R() * (sMax - sMin) }); n++;
    }
  };
  plant(0, Math.round(260 * kk), byTrees, 1.1, 2.0);   // CF_FERN
  plant(0, Math.round(140 * kk), anywhere, 0.8, 1.5);
  plant(0, Math.round(90 * kk), byPool, 0.8, 1.4);
  plant(1, Math.round(140 * kk), anywhere, 0.9, 1.6);  // CF_BUSH
  plant(1, Math.round(110 * kk), byTrees, 0.9, 1.7);
  // mushrooms are grown fungi (services/vegetation/fungi): cluster, toadstool, tall jelly, spore bulb; shelves below
  const fungusSpots: FungusSpot[] = [];
  const fungus = (species: number, count: number, place: () => [number, number] | null, hMin: number, hMax: number) => {
    const h0 = [1.16, 1.48, 3.88, 1.63][species];
    for (let i = 0, n = 0; i < count * 4 && n < count; i++) {
      const p = place(); if (!p) continue;
      fungusSpots.push({ x: p[0], y: H(p[0], p[1]) - 0.08, z: p[1], yaw: R() * 6.28, species, scale: (hMin + R() * (hMax - hMin)) / h0 }); n++;
    }
  };
  fungus(0, Math.round(80 * kk), byTrees, 1.0, 2.2);     // CF_NEON_CLUSTER
  fungus(0, Math.round(50 * kk), () => anywhere(1.5), 0.9, 1.8);
  fungus(1, Math.round(36 * kk), byTrees, 1.3, 2.6);     // CF_TOADSTOOL
  fungus(2, Math.round(30 * kk), () => { const a = R() * 6.28, d = 5 + R() * 8, x = MONOLITH.x + Math.sin(a) * d, z = MONOLITH.z + Math.cos(a) * d; return nearLane(x, z, 2) ? null : [x, z]; }, 2.6, 4.8); // CF_JELLY_TALL
  fungus(3, Math.round(22 * kk), anywhere, 2.0, 3.6);    // CF_SPORE_BULB
  plant(2, Math.round(70 * kk), byPool, 0.9, 1.7);    // CF_GLOW_FLOWER
  plant(2, Math.round(50 * kk), anywhere, 0.9, 1.5);
  plant(4, Math.round(30 * kk), byPool, 1.5, 3.0);    // CF_CRYSTAL_PLANT
  plant(5, Math.round(14 * kk), byTrees, 1.3, 2.3);    // CF_RESIN_STUMP (vines are hung from the grown branches below)
  for (const [cx, cz, w, d] of [[0, -BOUND - 3, 2 * BOUND + 12, 1], [0, BOUND + 3, 2 * BOUND + 12, 1], [-BOUND - 3, 0, 1, 2 * BOUND + 12], [BOUND + 3, 0, 1, 2 * BOUND + 12]] as const) {
    kit.box(B.invisible, w, 60, d, cx, 20, cz, 0, { shadow: false });
  }

  kit.build(group);

  // ── structures as art: models built from their sheets in Plajah 3D (visual only; colliders are above) ───────
  const loader = new GLTFLoader();
  const placeModel = (file: string, x: number, z: number, yaw: number, height: number, y = H(x, z), o: { length?: number; replaces?: string } = {}) => {
    loader.load(MODELS + file, (gltf) => {
      const root = gltf.scene;
      // scale to the manifest height, then stand its footprint's centre on (x, z) with its base on the ground;
      // `length` stretches it along its own Z (a log generated from its end ring comes out too short)
      const box0 = new THREE.Box3().setFromObject(root);
      const k = height / Math.max(1e-3, box0.max.y - box0.min.y);
      root.scale.set(k, k, o.length ? o.length / Math.max(1e-3, box0.max.z - box0.min.z) : k);
      if (o.replaces) { const old = group.getObjectByName(o.replaces); if (old) old.visible = false; }
      const box = new THREE.Box3().setFromObject(root), c = box.getCenter(new THREE.Vector3());
      root.position.set(-c.x, -box.min.y, -c.z);
      const pivot = new THREE.Group(); pivot.position.set(x, y, z); pivot.rotation.y = yaw;
      pivot.add(root);
      root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = !lo; m.receiveShadow = true; } });
      group.add(pivot);
    }, undefined, () => { /* model not built yet: the colliders still stand, the spot reads as a clearing */ });
  };
  placeModel('great_oak.glb', OAK.x, OAK.z, 0, 24, H(OAK.x, OAK.z) - 0.6);
  placeModel('outpost_cabin.glb', CABIN.x, CABIN.z, CABIN_YAW, 7.2);
  placeModel('ruined_chapel.glb', CHAPEL.x, CHAPEL.z, CHAPEL_YAW, 10.5);
  placeModel('rune_monolith.glb', MONOLITH.x, MONOLITH.z, 0.3, 11);
  placeModel('log_tunnel.glb', TUNNEL.x, TUNNEL.z, TUNNEL_YAW, 5.6, H(TUNNEL.x, TUNNEL.z) - 0.3, { length: 14, replaces: 'tunnel-log' });
  placeModel('mushroom_cluster.glb', MONOLITH.x - 9, MONOLITH.z + 5, 1.1, 4.5);
  placeModel('mushroom_cluster.glb', -40, -24, 2.3, 3.8);
  placeModel('ruin_walls.glb', 30, 4, -0.6, 4.5);
  placeModel('ruin_walls.glb', -46, 40, 2.0, 4.5);

  // ── the forest: trees grown by the Plajah Vegetation service from species measured on the Cyber Forest tree sheets
  //    (services/vegetation, docs/plajah-vegetation.md). Willows and mangroves by the water, violet and blue-leaf trees
  //    elsewhere. The code trunks stay as the colliders; their card crowns and roots go. ──────────────────────────────
  const forestSpotsV: TreeSpot[] = forestSpots.map((sp, i) => {
    const wet = dist(sp.x, sp.z, POOL) < 30;
    const k = wet ? (i % 2 ? 1 : 3) : (i % 3 === 0 ? 0 : 2);       // 0 violet, 1 willow, 2 blue, 3 mangrove
    return { x: sp.x, y: H(sp.x, sp.z) - 0.2, z: sp.z, yaw: sp.yaw, species: k, scale: Math.max(0.6, Math.min(1.5, sp.h / CYBER_FOREST_TREES[k].height)) };
  });
  // the forest beyond the edge: hundreds of grown trees on the rising hills (impostors at range), not cards
  {
    const n = lo ? 140 : 320;
    for (let i = 0; i < n * 3 && forestSpotsV.length < forestSpots.length + n; i++) {
      const a = R() * Math.PI * 2, rr = BOUND + 6 + Math.pow(R(), 0.7) * 48, x = Math.sin(a) * rr, z = Math.cos(a) * rr;
      if (forestSpotsV.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 49)) continue;
      const k = R() < 0.4 ? 2 : R() < 0.5 ? 0 : R() < 0.5 ? 3 : 1;
      forestSpotsV.push({ x, y: H(x, z) - 0.3, z, yaw: R() * Math.PI * 2, species: k, scale: 0.9 + R() * 0.6 });
    }
  }
  // shelf fungi up the grown trunks (CF_SHELF): on the trunk's surface, facing out
  {
    const trees = forestSpotsV.filter((p) => p.species < 4 && Math.abs(p.x) < BOUND + 4 && Math.abs(p.z) < BOUND + 4);
    for (let i = 0; i < trees.length; i++) {
      if (R() > (lo ? 0.25 : 0.45)) continue;
      // above the buttress roots (they rise up to ~3.2 trunk radii) where the trunk is a clean column
      const t = trees[i], tr = CYBER_FOREST_TREES[t.species].trunk.radius * t.scale, r0 = tr * 0.95;
      for (let k = 0, n = 1 + Math.floor(R() * 2); k < n; k++) {
        const a = R() * 6.28, hh = tr * 3.4 + R() * 2.5;
        fungusSpots.push({ x: t.x + Math.sin(a) * r0, y: t.y + hh, z: t.z + Math.cos(a) * r0, yaw: a, species: 4, scale: 1.1 + R() * 0.9 });
      }
    }
  }
  forestSpotsV.push(...oakSpots);
  const forest = new Forest([...CYBER_FOREST_TREES, CF_GREAT_OAK, CF_PLATFORM_OAK], forestSpotsV, { lowTier: lo, beat: uBeatPulse, shadows: !lo });
  group.add(forest.group);
  let viewCam: THREE.Camera | null = null;
  {
    const trunks = group.getObjectByName('forest-trunks') as THREE.Mesh | undefined;
    if (trunks) trunks.material = B.invisible;           // still the colliders
    for (const n of ['forest-roots', 'forest-crowns']) { const o = group.getObjectByName(n); if (o) o.visible = false; }
  }
  let stepT = 0;

  // ── grass: GPU blade fields from the Cyber Forest grass species (services/vegetation/grass). The ground says where
  //    each grows: glow tufts in clumps away from the paths, turf everywhere but the paths, water and buildings. ──
  const GB = BOUND + 24;
  const grassGround = bakeGround({ x0: -GB, z0: -GB, size: GB * 2, res: lo ? 128 : 200 }, H, (x, z) => {
    if (inStructure(x, z, 0.5) || dist(x, z, POOL) < 13) return [0, 0];
    const lane = LANES.reduce((m, l) => Math.min(m, segDist(x, z, l).d), Infinity);
    const path = Math.min(1, Math.max(0, (lane - 1.2) / 2.2));           // bare in the middle of a path, thick 3.5 m off
    const edge = Math.min(1, Math.max(0, (GB - Math.max(Math.abs(x), Math.abs(z))) / 6));
    const wet = dist(x, z, POOL) < 22 ? 1.25 : 1;
    return [path * edge * 0.75 * wet, Math.max(path, 0.25) * edge];
  });
  const grass = new GrassField(CYBER_FOREST_GRASS, grassGround, { lowTier: lo, beat: uBeatPulse, shadows: false });
  group.add(grass.group);
  // vines hang from the grown trees' branches (not the code crowns), never reaching the ground
  for (const hp of forest.hangPoints(lo ? 1 : 2, (t) => Math.abs(t.x) < BOUND + 10 && Math.abs(t.z) < BOUND + 10, 11)) {
    const clear = hp.y - H(hp.x, hp.z);
    if (clear < 3.5 || R() > 0.6) continue;
    plantSpots.push({ x: hp.x, y: hp.y + 0.15, z: hp.z, yaw: R() * 6.28, species: 3, scale: Math.min(1.6, (clear - 2.4) / CF_VINE.height) });
  }
  const plants = new PlantField(CYBER_FOREST_PLANTS, plantSpots, { lowTier: lo, beat: uBeatPulse, shadows: !lo });
  group.add(plants.group);
  const fungi = new FungusField(CYBER_FOREST_FUNGI, fungusSpots, { lowTier: lo, beat: uBeatPulse, shadows: !lo });
  group.add(fungi.group);
  const walkers: THREE.Object3D[] = [], tmpW = new THREE.Vector3();
  group.userData.vegetation = { forest, grass, plants, fungi, ground: grassGround };   // ?rrdebug: stats, trample tests

  // ── lights ────────────────────────────────────────────────────────────────────────────────────────────────
  const hemi = new THREE.HemisphereLight(0x9fd4e0, 0x1c3024, 1.8);
  const moon = new THREE.DirectionalLight(0xc8dcff, 3.2);
  moon.position.set(-50, 110, 40); moon.target.position.set(0, 0, 0); group.add(moon.target);
  moon.castShadow = !lo; moon.shadow.mapSize.set(4096, 4096);
  Object.assign(moon.shadow.camera, { left: -100, right: 100, top: 100, bottom: -100, near: 1, far: 260 });
  moon.shadow.bias = -0.0004; moon.shadow.normalBias = 0.04;
  group.add(hemi, moon);
  const pl = (x: number, y: number, z: number, c: number, i: number, d: number) => { const l = new THREE.PointLight(c, i, d, 2); l.position.set(x, y, z); group.add(l); return l; };
  const beacons = [pl(OBJ_A.x, DECK_Y + 3.5, OBJ_A.z, 0x2ae6ff, 50, 22), pl(OBJ_B.x, H(OBJ_B.x, OBJ_B.z) + 3.5, OBJ_B.z, 0x2ae6ff, 50, 22), pl(OBJ_C.x, H(OBJ_C.x, OBJ_C.z) + 3.5, OBJ_C.z, 0x2ae6ff, 50, 22)];
  if (!lo) {
    for (const a of [-1.25, 1.35]) { const p = rimAt(a, DECK_R - 3.2); pl(p.x, DECK_Y + 2.2, p.z, 0xffb060, 24, 14); }
    pl(MONOLITH.x, H(MONOLITH.x, MONOLITH.z) + 6, MONOLITH.z, 0x40e8ff, 40, 20);
    pl(POOL.x, -1, POOL.z, 0x40e0d0, 40, 20);
    pl(TOWER.x + 1.6, H(TOWER.x, TOWER.z) + TOWER_TOP + 2.2, TOWER.z + 1.6, 0xffb060, 18, 12);
    pl(CHAPEL.x, 4, CHAPEL.z, 0x8a6cff, 30, 16);
  }

  // night sky with a teal horizon (reflections and background agree)
  {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#04101c'); grad.addColorStop(0.5, '#0b2a30'); grad.addColorStop(1, '#06160f');
    g.fillStyle = grad; g.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(200,235,255,${0.2 + Math.random() * 0.7})`; const s = Math.random() * 1.6 + 0.3; g.fillRect(Math.random() * 1024, Math.random() * 230, s, s); }
    const sky = new THREE.CanvasTexture(c);
    sky.mapping = THREE.EquirectangularReflectionMapping; sky.colorSpace = THREE.SRGBColorSpace;
    scene.background = sky; scene.environment = sky; scene.environmentIntensity = 1.2;
  }
  scene.fog = new THREE.FogExp2(0x103a3c, 0.0095);
  scene.add(group);

  // ── the forest fights back: wolves, mantises, wasps, bats; deer graze the hollow; moths round every light ─────
  preloadCreatures(['wolf', 'mantis', 'wasp', 'deer', 'bat']);
  const MUL: Record<CreatureKind, [number, number]> = { wolf: [1.35, 0.8], mantis: [0.8, 1.5], wasp: [1.1, 0.6], deer: [1, 1], bat: [1.2, 0.7] };
  enemyBodies.make = (id, boss) => {
    const k: CreatureKind = boss ? 'mantis' : (['wolf', 'bat', 'wolf', 'mantis', 'wasp', 'bat'] as const)[id % 6];
    const b = new CreatureBody(k);
    if (!b.hover) walkers.push(b.root);
    return { root: b.root, hover: b.hover, height: b.height, speedMul: MUL[k][0], hpMul: MUL[k][1], update: (dt, sp) => b.update(dt, sp), attack: () => b.attack() };
  };
  type Deer = { b: CreatureBody; home: THREE.Vector3; tx: number; tz: number; wait: number; flee: number; speed: number };
  const herd: Deer[] = [];
  for (const [hx, hz] of [[-40, -50], [36, -40], [-62, 40], [10, 64]].slice(0, lo ? 2 : 4)) {
    for (let k = 0; k < 2 + Math.floor(R() * 2); k++) {
      const b = new CreatureBody('deer', 0.85 + R() * 0.3), x = hx + (R() - 0.5) * 8, z = hz + (R() - 0.5) * 8;
      b.root.position.set(x, H(x, z), z); b.root.rotation.y = R() * 6.28; group.add(b.root);
      herd.push({ b, home: new THREE.Vector3(hx, 0, hz), tx: x, tz: z, wait: R() * 6, flee: 0, speed: 0 });
    }
  }
  const deerOk = (x: number, z: number) => !inStructure(x, z, 0) && Math.abs(x) < BOUND - 3 && Math.abs(z) < BOUND - 3;
  const updateHerd = (dt: number) => {
    const pp = enemyBodies.playerPos;
    for (const d of herd) {
      const o = d.b.root.position, toP = Math.hypot(pp.x - o.x, pp.z - o.z);
      if (toP < 13 && d.flee <= 0) { const a = Math.atan2(o.x - pp.x, o.z - pp.z) + (R() - 0.5) * 0.8; d.tx = o.x + Math.sin(a) * 22; d.tz = o.z + Math.cos(a) * 22; d.flee = 3 + R() * 1.5; }
      d.flee -= dt;
      const dx = d.tx - o.x, dz = d.tz - o.z, dd = Math.hypot(dx, dz);
      let want = 0;
      if (dd > 0.6) want = d.flee > 0 ? 8.5 : 1.3;
      else if ((d.wait -= dt) <= 0) { const a = R() * 6.28, r = 3 + R() * 10; d.tx = d.home.x + Math.sin(a) * r; d.tz = d.home.z + Math.cos(a) * r; d.wait = 3 + R() * 7; }
      d.speed += (want - d.speed) * Math.min(1, dt * (want > d.speed ? 3 : 4));
      if (dd > 0.01 && d.speed > 0.05) {
        const nx = o.x + dx / dd * d.speed * dt, nz = o.z + dz / dd * d.speed * dt;
        if (deerOk(nx, nz)) { o.x = nx; o.z = nz; } else { d.tx = d.home.x; d.tz = d.home.z; }
        let dy = Math.atan2(dx, dz) - d.b.root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        d.b.root.rotation.y += dy * Math.min(1, dt * 5);
      }
      o.y += (H(o.x, o.z) - o.y) * Math.min(1, dt * 10);
      d.b.update(dt, d.speed);
    }
  };
  const glowSpots = [
    new THREE.Vector3(OBJ_A.x, DECK_Y + 1, OBJ_A.z), new THREE.Vector3(OBJ_B.x, 1, OBJ_B.z), new THREE.Vector3(OBJ_C.x, H(OBJ_C.x, OBJ_C.z) + 1, OBJ_C.z),
    new THREE.Vector3(MONOLITH.x, 3, MONOLITH.z), new THREE.Vector3(POOL.x, -1, POOL.z), new THREE.Vector3(TOWER.x, 10, TOWER.z),
  ];
  const moths = new MothSwarm(group, glowSpots, lo ? 20 : 40);

  // ── spots, points, spawns ─────────────────────────────────────────────────────────────────────────────────
  const enemySpots = [
    [62, -14], [60, 28], [48, 6], [36, -12], [30, 44], [52, 44], [20, 32], [8, 24], [-4, 30], [-18, 18], [-10, 2],
    [26, 10], [40, 22], [-30, -14], [-22, 40], [0, 56], [-44, 30], [40, -30], [-30, -46], [16, -6],
  ].map(([x, z]) => new THREE.Vector3(x, Math.max(H(x, z), -3) + 0.2, z));
  enemySpots.push(new THREE.Vector3(OBJ_A.x - 6, DECK_Y + 0.2, OBJ_A.z - 4), new THREE.Vector3(OBJ_A.x + 8, DECK_Y + 0.2, OBJ_A.z - 6));
  const controlPoints = [
    { id: 'A', name: 'Great Oak', pos: OBJ_A.clone(), radius: 5 },
    { id: 'B', name: 'Outpost Cabin', pos: new THREE.Vector3(OBJ_B.x, H(OBJ_B.x, OBJ_B.z), OBJ_B.z), radius: 5 },
    { id: 'C', name: 'Waterfall', pos: new THREE.Vector3(OBJ_C.x, H(OBJ_C.x, OBJ_C.z), OBJ_C.z), radius: 5 },
  ];

  // enemy routing: to reach a target on another level, walk to the nearest stair/net/bridge foot, then along it
  const flat = (a: THREE.Vector3, b: THREE.Vector3) => Math.hypot(a.x - b.x, a.z - b.z);
  const onSegment = (p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) => {
    const vx = b.x - a.x, vz = b.z - a.z, L2 = vx * vx + vz * vz || 1, t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / L2));
    return Math.hypot(p.x - a.x - vx * t, p.z - a.z - vz * t) < 3.0 && t > 0.0;
  };
  enemyNav.via = (from, to) => {
    if (Math.abs(to.y - from.y) < 5) return to;
    const up = to.y > from.y;
    let best: [THREE.Vector3, THREE.Vector3] | null = null, bd = Infinity;
    for (const l of links) {
      const a = up ? l.lo : l.hi, b = up ? l.hi : l.lo;
      if (onSegment(from, a, b)) return b;
      const d = flat(from, a) + flat(b, to) * 0.6;
      if (d < bd) { bd = d; best = [a, b]; }
    }
    if (!best) return to;
    return flat(from, best[0]) < 3.2 ? best[1] : best[0];
  };

  const info: LevelInfo = { id: 'elderwood-hollow', name: 'Elderwood Hollow', track: 'main', accentHex: 0x24e8ff };
  return {
    group, uBeatPulse, gates: [], traps: [], biomeIndex: 0, info,
    spawns: {
      a: { pos: SPAWN_A.clone().setY(H(SPAWN_A.x, SPAWN_A.z) + 0.3), yaw: -Math.PI / 2 },
      b: { pos: SPAWN_B.clone().setY(H(SPAWN_B.x, SPAWN_B.z) + 0.3), yaw: Math.PI / 2 },
    },
    enemySpots, controlPoints,
    hazardBelow: -10,
    setBiome() { return { name: info.name, track: info.track }; },
    async prepare(renderer, camera) { viewCam = camera; await forest.bake(renderer); },
    update(dt, pulse) {
      uBeatPulse.value = pulse;
      updateWind(dt, 0.55);
      // the player pushes the vegetation as they run (dash and blasts add bigger impulses from the game)
      const pp = enemyBodies.playerPos;
      if ((stepT -= dt) <= 0) { stepT = 0.2; addImpulse(pp.x, pp.z, 3.0, 0.3, 3); }
      forest.update(viewCam ?? pp, dt);
      // everything that walks lays the grass flat; it springs back behind them
      if (Math.abs(pp.y - H(pp.x, pp.z)) < 1.2) grassGround.press(pp.x, pp.z, 0.8, 0.85);
      for (let k = walkers.length - 1; k >= 0; k--) { const o = walkers[k]; if (!o.parent) { walkers.splice(k, 1); continue; } o.getWorldPosition(tmpW); grassGround.press(tmpW.x, tmpW.z, 0.9, 0.9); }
      for (const d of herd) if (d.speed > 0.3) grassGround.press(d.b.root.position.x, d.b.root.position.z, 0.9, 0.8);
      if (viewCam) { grass.update(viewCam, dt); plants.update(viewCam, dt); fungi.update(viewCam, dt); } else grassGround.update(dt);
      updateHerd(dt);
      moths.update(dt);
      for (const b of beacons) b.intensity = 45 + pulse * 25;
      for (const l of spawnLights) l.intensity = 26 + pulse * 8;
    },
    resolveDynamicGates() { /* no moving gates */ },
  };
}
