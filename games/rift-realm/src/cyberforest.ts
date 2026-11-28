// Cyber Forest — the full attack/defend map around the shrine arena (Level 1).
// Built from "Tactical map blueprint layout" (Cyber Forest Level Assets): Attacker spawn W, The Tech-Grove with OBJ A,
// a glowing data river running N→S, the Digital Bridge (N crossing, choke points both ends) into the Server Complex with
// OBJ C, the Anomaly Clearing in the middle (the shrine arena itself), The Glitched Canyon with OBJ B in the SW, the
// defender block + Defender spawn E and the Secure Area SE. Blueprint scale ≈ 0.36 m per pixel, clearing at the origin.
// Dressed from the same folder's sheets: cyber trees (bark + conduit veins, canopy cards cut from the tree turnarounds),
// the Ancient Cyber-Forest Titan tree with its scaffold decks, glowing grass, ferns, neon mushrooms, flower pods, vines,
// crystal plants and resin stumps (tools/cutSheets.py → tools/exportCyberForest.py → assets/cyberforest/).
import * as THREE from 'three/webgpu';
import {
  abs, color, float, fract, max, mix, normalView, positionViewDirection, positionWorld, sin, smoothstep, texture as tslTexture, time, uniform, uv, vec2, vec3,
} from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { StaticKit, boulder, fbm3, rng } from './geom';
import { riftWater } from './water';
import { builders } from './structures';
import { pbr } from './textures';
import { CreatureBody, CreatureKind, MothSwarm, preloadCreatures } from './creatures';
import { enemyBodies } from './enemies';
import { VegetationScene, type FungusSpot, type PlantSpot, type TreeSpot } from '../../../services/vegetation/scene';
import { CF_GREAT_OAK, CYBER_FOREST_TREES } from '../../../services/vegetation/catalog/cyberForest';
import { CYBER_FOREST_GRASS } from '../../../services/vegetation/catalog/cyberForestGrass';
import { CF_VINE, CYBER_FOREST_PLANTS } from '../../../services/vegetation/catalog/cyberForestPlants';
import { CYBER_FOREST_FUNGI } from '../../../services/vegetation/catalog/cyberForestFungi';

const ART = '/games/rift-realm/assets/cyberforest/';
const loader = new THREE.TextureLoader();
const texCache = new Map<string, THREE.Texture>();
export function art(file: string, srgb = true, repeat = false): THREE.Texture {
  const key = file + srgb + repeat;
  let t = texCache.get(key);
  if (!t) {
    t = loader.load(ART + file);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    texCache.set(key, t);
  }
  return t;
}

/** Sprite name → pixel size (from exportCyberForest.py), so cards keep the art's proportions. */
export const SPR: Record<string, [number, number]> = {
  grass_a: [192, 202], grass_b: [151, 196], grass_c: [196, 220], grass_d: [217, 214],
  fern_a: [486, 481], fern_b: [244, 189], fern_c: [231, 172], bush_a: [201, 157], bush_b: [156, 170],
  shroom_a: [353, 512], shroom_b: [282, 512], toadstool: [312, 381], shroom_tall: [356, 512], spore_pod: [286, 512],
  flower_a: [358, 512], flower_b: [261, 512], crystal_plant: [351, 512], carnivore: [351, 512],
  vine_a: [178, 512], vine_b: [110, 512], vine_c: [182, 512], resin_stump: [381, 346],
  tree_blue_a: [480, 659], tree_blue_b: [437, 656], tree_blue_c: [456, 659], tree_violet_a: [292, 563], tree_violet_b: [372, 560],
  tree_violet_c: [365, 560], tree_willow: [632, 635], tree_mangrove: [329, 569],
  canopy_0: [447, 362], canopy_1: [403, 360], canopy_2: [409, 362], canopy_3: [289, 309], canopy_4: [372, 308],
  canopy_5: [365, 308], canopy_6: [512, 292], canopy_7: [279, 312],
};

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const box = (x: number, z: number, x0: number, x1: number, z0: number, z1: number, f: number) =>
  smooth(x0 - f, x0, x) * smooth(x1 + f, x1, x) * smooth(z0 - f, z0, z) * smooth(z1 + f, z1, z);

export function segDist(px: number, pz: number, pts: number[][]): { d: number; t: number } {
  let best = 1e9, bt = 0, acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], vx = bx - ax, vz = bz - az, L = Math.hypot(vx, vz);
    const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (L * L)));
    const d = Math.hypot(px - ax - vx * t, pz - az - vz * t);
    if (d < best) { best = d; bt = acc + t * L; }
    acc += L;
  }
  return { d: best, t: bt };
}

// ── the blueprint, in metres ──────────────────────────────────────────────────────────────────────────────
export const RIVER = [[-58, -110], [-53, -56], [-50, -38], [-43, -20], [-33, -2], [-24, 20], [-15, 45], [-6, 70], [4, 110]];
const RIVER_HALF = 6.5, WATER_Y = -1.1;
const CANYON = [[-108, 8], [-90, 22], [-70, 33], [-52, 37], [-30, 45]];
const BRIDGE_Z = -38;           // Digital Bridge (north crossing)
const LOG_Z = 5;                // fallen titan log (middle crossing)
const FORD = { x: -15, z: 45 }; // stepping-stone ford (south crossing, out of the canyon)
const TITAN = { x: -80, z: -16 };
export const OBJ = { A: new THREE.Vector3(-100, 0, -2), B: new THREE.Vector3(-56, -4, 36), C: new THREE.Vector3(2, 0, -46) };
const SERVER = { x0: -29, x1: 40, z0: -72, z1: -23 };
const EAST = { x0: 27, x1: 48, z0: -20, z1: 24 };
const SECURE = { x0: 9, x1: 42, z0: 30, z1: 68 };
export const SPAWN_A = new THREE.Vector3(-150, 0, 0), SPAWN_B = new THREE.Vector3(72, 0, 0);
const BOUND = { x0: -162, x1: 86, z0: -86, z1: 86 };
/** Lanes kept clear of trees (spawn → objectives → crossings). */
const LANES = [
  [[-158, 0], [-100, -2], [-62, 1], [-44, LOG_Z]],
  [[-100, -2], [-86, -26], [-66, BRIDGE_Z]],
  [[-100, -2], [-108, 8]],
  [[-150, 0], [-130, 30], [-108, 8]],
  [[-150, 0], [-128, -40], [-86, -26]],
];

export function forestHeight(x: number, z: number): number {
  let h = (fbm3(x * 0.035, 1, z * 0.035) - 0.5) * 3.2 + (fbm3(x * 0.12, 2, z * 0.12) - 0.5) * 0.6;
  // a low rise under the titan tree and a knoll behind the attacker spawn
  h += 2.2 * smooth(30, 8, Math.hypot(x - TITAN.x, z - TITAN.z));
  // river: shallow banks so you can wade out, a deeper channel down the middle
  const r = segDist(x, z, RIVER).d;
  const ford = smooth(9, 3, Math.hypot(x - FORD.x, z - FORD.z));
  const bed = -2.7 * (1 - ford) - 1.35 * ford;
  h = h * smooth(RIVER_HALF - 1, RIVER_HALF + 6, r) + bed * smooth(RIVER_HALF + 5, RIVER_HALF - 1.5, r) * (r < RIVER_HALF + 5 ? 1 : 0);
  // the glitched canyon: a 4 m deep cut with a walkable floor, fading out at both mouths
  const c = segDist(x, z, CANYON), mouth = smooth(0, 14, c.t) * smooth(82, 70, c.t);
  const cut = smooth(11, 6, c.d) * mouth;
  h = h * (1 - cut) - 4 * cut;
  // a rocky ridge on the canyon's south rim
  h += smooth(8, 16, c.d) * smooth(30, 18, c.d) * mouth * (z > CANYON[0][1] + (x + 108) * 0.35 ? 1 : 0) * (3 + fbm3(x * 0.08, 3, z * 0.08) * 4);
  // flat pads: the clearing (shrine floor), buildings, spawns
  let flat = smooth(27, 23, Math.hypot(x, z));
  flat = Math.max(flat, box(x, z, SERVER.x0, SERVER.x1, SERVER.z0, SERVER.z1, 4), box(x, z, EAST.x0, EAST.x1, EAST.z0, EAST.z1, 4));
  flat = Math.max(flat, box(x, z, SECURE.x0, SECURE.x1, SECURE.z0, SECURE.z1, 4), box(x, z, 58, 86, -14, 14, 5), box(x, z, -160, -140, -9, 9, 6));
  h = h * (1 - flat) - 0.08 * flat;
  // the map's edge: rising forested hills
  const o = Math.max(BOUND.x0 - x, x - BOUND.x1, BOUND.z0 - z, z - BOUND.z1);
  h += smooth(-6, 16, o) * (16 + fbm3(x * 0.03, 4, z * 0.03) * 16);
  return h;
}

export interface ForestMap {
  enemySpots: THREE.Vector3[];
  controlPoints: { id: string; name: string; pos: THREE.Vector3; radius: number }[];
  update(dt: number, pulse: number): void;
  /** GPU bakes once the renderer is up (the vegetation's tree impostors). */
  prepare?(renderer: THREE.WebGPURenderer, camera: THREE.Camera): Promise<void>;
}

/** Tube with proper UVs (u round the bark, v up the trunk), r0 → r1 along the curve. */
export function barkTube(curve: THREE.Curve<THREE.Vector3>, r0: number, r1: number, segs: number, radial: number, wobble: number, seed: number): THREE.BufferGeometry {
  const pos: number[] = [], uvs: number[] = [], idx: number[] = [];
  const frames = curve.computeFrenetFrames(segs, false);
  const L = curve.getLength(), circ = Math.PI * 2 * (r0 + r1) / 2;
  const fallbackN = new THREE.Vector3(1, 0, 0), fallbackB = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, p = curve.getPoint(t);
    const fn = frames.normals[i], fb = frames.binormals[i];
    const N = Number.isFinite(fn.x) && Number.isFinite(fn.y) && Number.isFinite(fn.z) ? fn : fallbackN;
    const B = Number.isFinite(fb.x) && Number.isFinite(fb.y) && Number.isFinite(fb.z) ? fb : fallbackB;
    const r = r0 + (r1 - r0) * Math.pow(t, 0.8);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const w = 1 + wobble * (fbm3(Math.cos(a) * 1.3 + seed, p.y * 0.6, Math.sin(a) * 1.3) - 0.5) * (1 - t * 0.6);
      const dx = Math.cos(a) * N.x + Math.sin(a) * B.x, dy = Math.cos(a) * N.y + Math.sin(a) * B.y, dz = Math.cos(a) * N.z + Math.sin(a) * B.z;
      pos.push(p.x + dx * r * w, p.y + dy * r * w, p.z + dz * r * w);
      uvs.push((j / radial) * circ / 2.2, (t * L) / 2.2);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + 1, c = a + radial + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildForestMap(kit: StaticKit, group: THREE.Group, scene: THREE.Scene, lo: boolean, uBeatPulse: THREE.UniformNode<"float", number>, mats: {
  stone: THREE.MeshStandardNodeMaterial; wall: THREE.MeshStandardNodeMaterial; steel: THREE.MeshStandardNodeMaterial;
}): ForestMap {
  const R = rng(4242);
  const B = builders(kit);
  const H = forestHeight;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s3 = new THREE.Vector3();
  const near = (x: number, z: number, d: number) => LANES.some((l) => segDist(x, z, l).d < d);
  const inBuilding = (x: number, z: number, pad = 3) =>
    [SERVER, EAST, SECURE].some((b) => x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad) || Math.hypot(x, z) < 27 ||
    (x > 56 && z > -16 && z < 16) || (x < -138 && Math.abs(z) < 12);
  const inRiver = (x: number, z: number, pad = 0) => segDist(x, z, RIVER).d < RIVER_HALF + pad;
  const inCanyon = (x: number, z: number, pad = 0) => segDist(x, z, CANYON).d < 7 + pad;

  // ── materials from the sheets ─────────────────────────────────────────────────────────────────────────
  const cyan = color(0x2ae6ff), amber = color(0xffa040);
  const mossA = art('moss_cable_albedo.jpg', true, true), mossB = art('moss_strand_albedo.jpg', true, true), mossG = art('moss_glow_albedo.jpg', true, true);
  const mossN = art('moss_cable_normal.jpg', false, true);
  const ground = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, normalMap: mossN });
  ground.normalScale.set(0.8, 0.8);
  {
    const wp = positionWorld.xz;
    const a = tslTexture(mossA, wp.mul(1 / 9).add(vec2(0.21, 0.63))).rgb, b = tslTexture(mossB, wp.mul(1 / 8).add(vec2(0.37, 0.11))).rgb;
    const g = tslTexture(mossG, wp.mul(1 / 6)).rgb;
    const k = tslTexture(mossG, wp.mul(1 / 97)).g;  // low-frequency patch masks from the sheets themselves
    const k2 = tslTexture(mossB, wp.mul(1 / 71).add(vec2(0.5, 0.2))).g;
    // glow moss is the floor; violet strand moss drifts through in patches; the cable moss (white neurons) only now and then
    const base = mix(g.mul(0.8), b.mul(0.7), smoothstep(float(0.3), float(0.7), k2));
    const lum = a.dot(vec3(0.3, 0.5, 0.2));
    ground.colorNode = mix(base, a.mul(0.6), smoothstep(float(0.62), float(0.8), k).mul(smoothstep(float(0.6), float(0.2), lum))).mul(0.5);
    // glowing moss spots, faint (the art's floor sparkles, it does not light the scene)
    ground.emissiveNode = g.mul(smoothstep(float(0.6), float(0.9), g.g)).mul(cyan).mul(smoothstep(float(0.25), float(0.75), k).mul(0.8).add(0.2))
      .mul(float(0.22).add(uBeatPulse.mul(0.16))); // patchy, so the spot pattern never reads as a repeat
  }
  const bark = new THREE.MeshStandardNodeMaterial({ map: art('bark_albedo.jpg', true, true), normalMap: art('bark_normal.jpg', false, true), roughness: 0.92, color: 0x8d8a84 });
  bark.normalScale.set(1.6, 1.6);
  {
    // cyber veins: the conduit sheet's bright traces, only in a few long vertical bands round each trunk
    const cond = tslTexture(art('conduit_albedo.jpg', true, true), uv().mul(vec2(0.9, 0.5))).rgb;
    const band = smoothstep(float(0.55), float(0.62), sin(uv().x.mul(5.3).add(sin(uv().y.mul(0.7)).mul(1.4))).mul(0.5).add(0.5));
    const lit = smoothstep(float(0.45), float(0.8), max(cond.b, cond.g));
    bark.emissiveNode = mix(cyan, amber, smoothstep(float(0.2), float(0.5), cond.r.sub(cond.b))).mul(lit).mul(band)
      .mul(float(1.1).add(sin(time.mul(1.7).add(positionWorld.y.mul(0.5))).mul(0.4)).add(uBeatPulse.mul(0.8)));
  }
  const conduitTex = art('conduit_albedo.jpg', true, true);
  const panel = new THREE.MeshStandardNodeMaterial({ map: conduitTex, roughness: 0.45, metalness: 0.6, color: 0xb8c4cc });
  {
    const c = tslTexture(conduitTex, uv()).rgb;
    panel.emissiveNode = c.mul(smoothstep(float(0.35), float(0.75), max(c.b, c.r))).mul(float(1.6).add(uBeatPulse.mul(0.8)));
  }
  const steelSrc = pbr('volc-steel', { maps: [] });
  const hull = new THREE.MeshStandardNodeMaterial({ map: steelSrc.map, color: 0xc4d0d8, roughness: 0.6, metalness: 0.12 }); // the steel sheet's normal map darkens every wall: leave it off
  // the steel sheet is very dark (albedo ≈ 0.2): lift it so the buildings read as grey steel at night, not black holes
  hull.colorNode = tslTexture(steelSrc.map!, uv()).rgb.mul(color(0x9aa8b4)).mul(2.3);
  const core = new THREE.MeshStandardNodeMaterial({ color: 0x062530, roughness: 0.2, metalness: 0.1 });
  core.emissiveNode = cyan.mul(float(0.35).add(sin(time.mul(2.2).sub(positionWorld.y.mul(1.4))).mul(0.15)).add(uBeatPulse.mul(0.4)));
  const trim = new THREE.MeshStandardNodeMaterial({ color: 0x03141a, roughness: 0.3 });
  trim.emissiveNode = cyan.mul(float(0.75).add(uBeatPulse.mul(0.9)));
  const hazard = new THREE.MeshStandardNodeMaterial({ roughness: 0.6 });
  hazard.colorNode = mix(color(0x111111), color(0xff8a18), smoothstep(float(0.45), float(0.55), fract(positionWorld.x.add(positionWorld.y).add(positionWorld.z).mul(0.9))));
  hazard.emissiveNode = color(0xff7a10).mul(smoothstep(float(0.45), float(0.55), fract(positionWorld.x.add(positionWorld.y).add(positionWorld.z).mul(0.9)))).mul(0.35);
  const glass = new THREE.MeshStandardNodeMaterial({ color: 0x0a3040, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.7 });
  glass.emissiveNode = cyan.mul(smoothstep(float(0.42), float(0.5), fract(positionWorld.x.mul(0.5).sub(time.mul(0.6)))).mul(0.8).add(0.18));

  // ── terrain ───────────────────────────────────────────────────────────────────────────────────────────
  {
    const W = 300, D = 230, SX = lo ? 130 : 240, SZ = lo ? 100 : 184;
    const g = new THREE.PlaneGeometry(W, D, SX, SZ);
    g.rotateX(-Math.PI / 2); g.translate(-38, 0, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, H(p.getX(i), p.getZ(i)));
    g.computeVertexNormals();
    // the shrine floor covers the clearing: drop the triangles under it so they never z-fight
    kit.add(ground, g, {});
  }

  // ── the data river: dark water with cyan data streaks flowing south ───────────────────────────────────
  {
    const pts = RIVER.map(([x, z]) => new THREE.Vector3(x, 0, z));
    const curve = new THREE.CatmullRomCurve3(pts);
    const N = 120, pos: number[] = [], uvs: number[] = [], idx: number[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, p = curve.getPointAt(t), tg = curve.getTangentAt(t);
      const nx = -tg.z, nz = tg.x, w = RIVER_HALF + 3;
      pos.push(p.x - nx * w, WATER_Y, p.z - nz * w, p.x + nx * w, WATER_Y, p.z + nz * w);
      uvs.push(0, t * curve.getLength() / 10, 1, t * curve.getLength() / 10);
      if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx); g.computeVertexNormals();
    // the Apex water (water.ts) flowing down the ribbon, with the cyber river's data streaks riding on top
    const water = riftWater({ deep: 0x02121a, shallow: 0x0c4a5c, glow: 0x34e8ff, glowAmt: 0.3, flow: 'uv', speed: 2.0, uvMetres: 10, width: 13, sky: 0x1a3550, skyAmt: 0.5, opacity: 0.82, lowTier: lo });
    const baseGlow = water.emissiveNode as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const across = uv().x, along = uv().y.mul(10);
    const lane = fract(across.mul(9));
    const streak = smoothstep(float(0.46), float(0.5), lane).mul(smoothstep(float(0.54), float(0.5), lane));
    const pulse = smoothstep(float(0.7), float(0.98), fract(along.mul(0.08).sub(time.mul(0.25)).add(across.mul(7.3).floor().mul(0.37))));
    const mid = float(1).sub(across.sub(0.5).abs().mul(2)); // streaks run brightest down the middle
    water.emissiveNode = baseGlow.add(cyan.mul(streak.mul(pulse).mul(2.2)).mul(mid.mul(0.6).add(0.4)));
    const mesh = new THREE.Mesh(g, water);
    mesh.renderOrder = 2;
    group.add(mesh);
  }

  // ── the Digital Bridge (north crossing): hard-light deck on steel trusses, choke barriers both ends ────
  {
    const x0 = -66, x1 = -34, cx = (x0 + x1) / 2, L = x1 - x0, y = 0.55;
    kit.box(hull, L, 0.4, 5.2, cx, y - 0.2, BRIDGE_Z, Math.PI / 2 * 0 + 0, { tpm: 0.4 });
    kit.box(glass, L, 0.06, 3.6, cx, y + 0.03, BRIDGE_Z, 0, { solid: false, shadow: false, tpm: 1 });
    for (const s of [-1, 1]) {
      kit.box(trim, L, 0.08, 0.08, cx, y + 1.05, BRIDGE_Z + s * 2.45, 0, { solid: false, shadow: false });
      kit.box(hull, L, 0.12, 0.12, cx, y + 0.1, BRIDGE_Z + s * 2.45, 0, { shadow: false });
      for (let i = 0; i <= 8; i++) kit.box(hull, 0.12, 1.1, 0.12, x0 + i * L / 8, y + 0.55, BRIDGE_Z + s * 2.45, 0, { shadow: false });
      kit.box(glass, L, 1.0, 0.04, cx, y + 0.55, BRIDGE_Z + s * 2.48, 0, { shadow: false, tpm: 1 }); // glass parapet (solid)
      // truss under the deck
      for (let i = 0; i < 8; i++) kit.box(hull, L / 8 * 1.1, 0.14, 0.14, x0 + (i + 0.5) * L / 8, y - 1.0, BRIDGE_Z + s * 2.2, 0, { shadow: false, rz: (i % 2 ? 1 : -1) * 0.32 });
    }
    // piers in the river
    for (const px of [-55, -45]) kit.box(hull, 1.4, 4, 1.4, px, -2.2, BRIDGE_Z, 0);
    // choke points: hazard-striped barricades narrowing each end to 3 m
    for (const [bx, dir] of [[x0 - 2.5, -1], [x1 + 2.5, 1]] as const) {
      for (const s of [-1, 1]) {
        kit.box(hazard, 1.0, 1.3, 2.4, bx, H(bx, BRIDGE_Z + s * 2.9) + 0.65, BRIDGE_Z + s * 2.9, 0, { tpm: 1 });
        kit.box(hull, 0.5, 4.4, 0.5, bx + dir * 0.6, H(bx, BRIDGE_Z + s * 4.3) + 2.2, BRIDGE_Z + s * 4.3, 0);
      }
      kit.box(trim, 0.3, 0.3, 9.0, bx + dir * 0.6, H(bx, BRIDGE_Z) + 4.4, BRIDGE_Z, 0, { solid: false });
      // ramps from the banks onto the deck
      B.ramp(bx + dir * 3, H(bx + dir * 3, BRIDGE_Z), BRIDGE_Z, dir < 0 ? x0 : x1, y, BRIDGE_Z, 3.6);
    }
  }

  // ── the fallen titan log (middle crossing) ─────────────────────────────────────────────────────────────
  const treeGeos: THREE.BufferGeometry[] = [], rootGeos: THREE.BufferGeometry[] = [];
  {
    const a = new THREE.Vector3(-46, -0.3, LOG_Z - 1), b = new THREE.Vector3(-17, -0.5, LOG_Z + 3);
    const curve = new THREE.LineCurve3(a, b);
    treeGeos.push(barkTube(curve, 1.9, 1.5, 12, 16, 0.25, 7));
    const dir = b.clone().sub(a), L = dir.length(), yaw = Math.atan2(dir.x, dir.z);
    // walk surface along the top of the log + ramps up from both banks
    const g = new THREE.BoxGeometry(2.2, 0.2, L);
    kit.place(g, (a.x + b.x) / 2, 1.25, (a.z + b.z) / 2, yaw); kit.add(B.invisible, g, { shadow: false });
    B.ramp(a.x - dir.x / L * 4, H(a.x - dir.x / L * 4, a.z - dir.z / L * 4), a.z - dir.z / L * 4, a.x, 1.35, a.z, 2.4);
    B.ramp(b.x + dir.x / L * 4, H(b.x + dir.x / L * 4, b.z + dir.z / L * 4), b.z + dir.z / L * 4, b.x, 1.35, b.z, 2.4);
    // the root plate on the west bank
    for (let r = 0; r < 9; r++) {
      const ra = (r / 9) * Math.PI * 2;
      const c = new THREE.CatmullRomCurve3([a.clone(), a.clone().add(new THREE.Vector3(-1.5 + Math.cos(ra) * 1.2, Math.sin(ra) * 2.5, Math.cos(ra) * 2.4)), a.clone().add(new THREE.Vector3(-3 - R() * 2, Math.sin(ra) * 4.2, Math.cos(ra) * 4.2))]);
      rootGeos.push(barkTube(c, 0.55, 0.12, 8, 7, 0.4, r));
    }
  }

  // ── the ford (south crossing): flat stepping stones ───────────────────────────────────────────────────
  for (let i = 0; i < 9; i++) {
    const t = (i - 4) / 4, x = FORD.x + t * 8 + (R() - 0.5), z = FORD.z - t * 1.5 + (R() - 0.5) * 1.5;
    const g = boulder(1.3 + R() * 0.4, 70 + i, 2);
    kit.place(g, x, H(x, z) + 0.15, z, R() * 6, 0, 0, 1, 0.45, 1);
    kit.add(mats.stone, g, { tpm: 0.6 });
  }

  // ── buildings: a small toolkit for steel blocks with doorways, conduit panels and glowing trim ────────
  const vines: [number, number, number, number][] = []; // x, top y, z, facing yaw
  type Door = { side: 'n' | 's' | 'w' | 'e'; at: number; w: number; choke?: boolean };
  const block = (x0: number, x1: number, z0: number, z1: number, h: number, doors: Door[], o: { roof?: boolean; mat?: THREE.Material; thick?: number; trimY?: number } = {}) => {
    const mat = o.mat ?? hull, t = o.thick ?? 0.6, dh = 3.6;
    const wall = (side: Door['side']) => {
      const horiz = side === 'n' || side === 's';
      const a0 = horiz ? x0 : z0, a1 = horiz ? x1 : z1, fixed = side === 'n' ? z0 : side === 's' ? z1 : side === 'w' ? x0 : x1;
      const ds = doors.filter((d) => d.side === side).sort((p, q2) => p.at - q2.at);
      let cur = a0;
      const seg = (s0: number, s1: number, y0: number, hh: number) => {
        if (s1 - s0 < 0.05) return;
        const c = (s0 + s1) / 2, len = s1 - s0;
        if (horiz) kit.box(mat, len, hh, t, c, y0 + hh / 2, fixed, 0, { tpm: 0.4 });
        else kit.box(mat, t, hh, len, fixed, y0 + hh / 2, c, 0, { tpm: 0.4 });
        if (y0 > 0) return;
        // a mossy stone plinth along the foot of every solid stretch
        if (horiz) kit.box(mats.stone, len, 1.1, t + 0.3, c, 0.5, fixed, 0, { tpm: 0.5 });
        else kit.box(mats.stone, t + 0.3, 1.1, len, fixed, 0.5, c, 0, { tpm: 0.5 });
        // pilasters with a light strip every ~6 m
        const n = Math.floor(len / 6);
        for (let k = 1; k <= n; k++) {
          const pc = s0 + (k - 0.5) * (len / n);
          if (horiz) { kit.box(mat, 0.7, hh + 0.4, t + 0.6, pc, hh / 2 + 0.2, fixed, 0, { tpm: 0.4 }); }
          else { kit.box(mat, t + 0.6, hh + 0.4, 0.7, fixed, hh / 2 + 0.2, pc, 0, { tpm: 0.4 }); }
          for (const sd of [-1, 1]) {
            if (horiz) kit.box(trim, 0.08, hh * 0.55, 0.05, pc, hh * 0.6, fixed + sd * (t / 2 + 0.32), 0, { solid: false, shadow: false });
            else kit.box(trim, 0.05, hh * 0.55, 0.08, fixed + sd * (t / 2 + 0.32), hh * 0.6, pc, 0, { solid: false, shadow: false });
          }
        }
        // vines spilling over the wall top (both faces), now and then
        for (let k = 0; k < len / 4; k++) if (R() < 0.45) {
          const vc = s0 + R() * len, sd = R() < 0.5 ? -1 : 1;
          vines.push(horiz ? [vc, hh + 0.2, fixed + sd * (t / 2 + 0.06), sd > 0 ? 0 : Math.PI] : [fixed + sd * (t / 2 + 0.06), hh + 0.2, vc, sd > 0 ? Math.PI / 2 : -Math.PI / 2]);
        }
      };
      for (const d of ds) {
        seg(cur, d.at - d.w / 2, 0, h);
        seg(d.at - d.w / 2, d.at + d.w / 2, dh, h - dh); // lintel
        // door frame glow
        const fx = horiz ? d.at : fixed, fz = horiz ? fixed : d.at;
        // a steel frame (hazard-striped on choke doors) with a thin light line on both faces
        const fm = d.choke ? hazard : mat;
        for (const s of [-1, 1]) {
          const px = horiz ? fx + s * (d.w / 2 + 0.2) : fx, pz = horiz ? fz : fz + s * (d.w / 2 + 0.2);
          kit.box(fm, horiz ? 0.4 : t + 0.3, dh + 0.3, horiz ? t + 0.3 : 0.4, px, (dh + 0.3) / 2, pz, 0, { tpm: 1 });
          for (const f of [-1, 1]) kit.box(trim, horiz ? 0.05 : 0.03, dh, horiz ? 0.03 : 0.05, horiz ? px - s * 0.21 : px + f * (t / 2 + 0.16), dh / 2, horiz ? pz + f * (t / 2 + 0.16) : pz - s * 0.21, 0, { solid: false, shadow: false });
        }
        kit.box(fm, horiz ? d.w + 0.8 : t + 0.3, 0.4, horiz ? t + 0.3 : d.w + 0.8, fx, dh + 0.2, fz, 0, { tpm: 1 });
        cur = d.at + d.w / 2;
      }
      seg(cur, a1, 0, h);
      // conduit panels on the outside face + a glowing roofline
      const out = side === 'n' || side === 'w' ? -1 : 1, len = a1 - a0;
      const py = o.trimY ?? h * 0.55;
      for (let k = 0; k < Math.floor(len / 7); k++) {
        const c = a0 + 3.5 + k * 7;
        if (ds.some((d) => Math.abs(d.at - c) < d.w / 2 + 2)) continue;
        if (horiz) kit.box(panel, 3.2, Math.min(3.2, h * 0.45), 0.08, c, py, fixed + out * (t / 2 + 0.05), 0, { solid: false, shadow: false, tpm: 0.3 });
        else kit.box(panel, 0.08, Math.min(3.2, h * 0.45), 3.2, fixed + out * (t / 2 + 0.05), py, c, 0, { solid: false, shadow: false, tpm: 0.3 });
      }
      if (horiz) kit.box(trim, len, 0.14, 0.14, (a0 + a1) / 2, h - 0.25, fixed + out * (t / 2 + 0.07), 0, { solid: false, shadow: false });
      else kit.box(trim, 0.14, 0.14, len, fixed + out * (t / 2 + 0.07), h - 0.25, (a0 + a1) / 2, 0, { solid: false, shadow: false });
    };
    for (const s of ['n', 's', 'w', 'e'] as const) wall(s);
    // cornice
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    for (const [w, d, px, pz] of [[x1 - x0 + 1.2, t + 0.8, cx, z0], [x1 - x0 + 1.2, t + 0.8, cx, z1], [t + 0.8, z1 - z0 + 1.2, x0, cz], [t + 0.8, z1 - z0 + 1.2, x1, cz]] as const) {
      kit.box(mat, w, 0.35, d, px, h + 0.05, pz, 0, { tpm: 0.4 });
    }
    if (o.roof !== false) {
      kit.box(mat, x1 - x0 + 0.8, 0.5, z1 - z0 + 0.8, cx, h + 0.25, cz, 0, { tpm: 0.3 });
      // roof gear: vents, AC units, an antenna, a skylight strip
      const area = (x1 - x0) * (z1 - z0), units = Math.min(8, Math.round(area / 60));
      for (let k = 0; k < units; k++) {
        const ux = x0 + 2 + R() * (x1 - x0 - 4), uz = z0 + 2 + R() * (z1 - z0 - 4), uw = 1.2 + R() * 2, ud = 1.2 + R() * 2;
        kit.box(mat, uw, 0.9 + R() * 0.8, ud, ux, h + 0.9, uz, 0, { tpm: 0.5, solid: false });
        if (k % 2 === 0) { const g = new THREE.CylinderGeometry(0.45, 0.45, 0.3, 12); kit.place(g, ux, h + 1.75, uz); kit.add(trim, g, { solid: false, shadow: false }); }
      }
      kit.box(hull, 0.15, 5, 0.15, x1 - 1.5, h + 3, z0 + 1.5, 0, { solid: false, shadow: false });
      kit.box(trim, 0.25, 0.25, 0.25, x1 - 1.5, h + 5.6, z0 + 1.5, 0, { solid: false, shadow: false });
      if (x1 - x0 > 14) kit.box(glass, (x1 - x0) * 0.6, 0.1, 1.6, cx, h + 0.55, cz, 0, { solid: false, shadow: false, tpm: 1 });
    }
  };
  const serverRack = (x: number, z: number, yaw: number, len = 5) => {
    kit.box(hull, 1.1, 2.4, len, x, 1.2, z, yaw, { tpm: 0.5 });
    for (const s of [-1, 1]) {
      const dx = Math.cos(yaw) * s * 0.57, dz = -Math.sin(yaw) * s * 0.57;
      kit.box(panel, 0.04, 2.0, len - 0.4, x + dx, 1.2, z + dz, yaw, { solid: false, shadow: false, tpm: 0.5 });
    }
    for (const s of [-1, 1]) kit.box(trim, 0.04, 0.04, len, x + Math.cos(yaw) * s * 0.56, 2.38, z - Math.sin(yaw) * s * 0.56, yaw, { solid: false, shadow: false });
  };
  const crate = (x: number, z: number, yaw: number, stack = 1) => {
    for (let k = 0; k < stack; k++) {
      kit.box(hull, 1.8, 1.1, 1.2, x, 0.55 + k * 1.1, z, yaw + k * 0.2, { tpm: 0.6 });
      kit.box(trim, 1.82, 0.04, 0.04, x, 0.95 + k * 1.1, z + 0.6, yaw + k * 0.2, { solid: false, shadow: false });
    }
  };

  // Server Complex (NE): a walled compound around the server hall (OBJ C), a generator block and cooling stacks
  {
    const S = SERVER;
    // compound wall with gates: W (from the Digital Bridge, choke), S (to the clearing), E (to the defender block, choke)
    block(S.x0, S.x1, S.z0, S.z1, 4.2, [
      { side: 'w', at: BRIDGE_Z, w: 4, choke: true }, { side: 's', at: 5, w: 6 }, { side: 's', at: -18, w: 4 },
      { side: 'e', at: -31, w: 4, choke: true },
    ], { roof: false, thick: 1.0, trimY: 2.2 });
    // paving
    for (let x = S.x0 + 2; x < S.x1; x += 4) for (let z = S.z0 + 2; z < S.z1; z += 4) kit.box(mats.stone, 3.95, 0.2, 3.95, x, 0.0, z, 0, { tpm: 0.35, shadow: false });
    // the server hall: 8 m tall, doors on all four sides, a mezzanine catwalk along the north wall
    const hx0 = -12, hx1 = 18, hz0 = -60, hz1 = -34;
    block(hx0, hx1, hz0, hz1, 8, [
      { side: 's', at: 3, w: 4 }, { side: 'w', at: -47, w: 3.4 }, { side: 'e', at: -47, w: 3.4 }, { side: 'n', at: 3, w: 3 },
    ], { trimY: 5.5 });
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) serverRack(-6 + i * 6, -47 + s * 6.5, 0, 6);
    kit.box(hull, hx1 - hx0 - 1.2, 0.3, 3.0, (hx0 + hx1) / 2, 4.2, hz0 + 2.0, 0, { tpm: 0.4 });
    for (let i = 0; i <= 10; i++) kit.box(hull, 0.07, 1.0, 0.07, hx0 + 1 + i * (hx1 - hx0 - 2) / 10, 4.85, hz0 + 3.5, 0, { solid: false, shadow: false });
    kit.box(trim, hx1 - hx0 - 2, 0.06, 0.06, (hx0 + hx1) / 2, 5.35, hz0 + 3.5, 0, { solid: false, shadow: false });
    B.steelStair(hull, hx1 - 2.5, 0, hz0 + 8.5, Math.PI, 4.35, 1.6);
    // OBJ C core: a pulsing data pillar in a ring of consoles
    kit.box(core, 0.9, 6.8, 0.9, OBJ.C.x, 3.4, OBJ.C.z, Math.PI / 4, { solid: true });
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; kit.box(hull, 1.4, 1.0, 0.7, OBJ.C.x + Math.sin(a) * 3.4, 0.5, OBJ.C.z + Math.cos(a) * 3.4, a, { tpm: 0.6 }); }
    // generator block + cooling stacks + a radio mast
    block(-26, -14, -70, -62, 5, [{ side: 's', at: -20, w: 3 }]);
    for (const [x, z] of [[30, -64], [35, -58], [30, -52]] as const) {
      const g = new THREE.CylinderGeometry(2.1, 2.6, 9, 16, 1, true); kit.place(g, x, 4.5, z); kit.add(hull, g, { tpm: 0.3 });
      kit.box(trim, 0.2, 0.2, 0.2, x, 9.1, z, 0, { solid: false });
      const ring = new THREE.TorusGeometry(2.15, 0.08, 6, 24); kit.place(ring, x, 7.5, z, 0, Math.PI / 2); kit.add(trim, ring, { solid: false, shadow: false });
    }
    kit.box(hull, 0.5, 22, 0.5, -22, 11, -28, 0);
    kit.box(trim, 0.15, 22, 0.15, -21.7, 11, -27.7, 0, { solid: false, shadow: false });
    // yard cover: crates and barriers between the gates
    for (const [x, z, y2, st] of [[-20, -32, 0.3, 2], [-16, -44, 0.1, 1], [-22, -52, 1.2, 1], [26, -40, 0.4, 2], [30, -30, 0.2, 1], [8, -28, 0.6, 1], [-4, -28, 0.1, 2], [24, -66, 0.2, 1]] as const) crate(x, z, y2, st);
  }

  // Defender block (E): two rooms and a corridor between the clearing and the Defender spawn; choke doors N/S
  {
    const E = EAST;
    block(E.x0, E.x1, E.z0, E.z1, 7, [
      { side: 'w', at: 0, w: 5 }, { side: 'e', at: 0, w: 5 }, { side: 'n', at: 37, w: 3.4, choke: true }, { side: 's', at: 37, w: 3.4, choke: true },
      { side: 'w', at: -14, w: 3 },
    ], { trimY: 4.6 });
    // partitions with offset doorways = two rooms around a central hall
    kit.box(hull, E.x1 - E.x0 - 7, 7, 0.4, (E.x0 + E.x1) / 2 + 3.5, 3.5, -7, 0, { tpm: 0.4 });
    kit.box(hull, E.x1 - E.x0 - 7, 7, 0.4, (E.x0 + E.x1) / 2 - 3.5, 3.5, 9, 0, { tpm: 0.4 });
    for (const [x, z] of [[33, -14], [42, -14], [33, 15], [43, 17], [37, 3]] as const) crate(x, z, R() * 0.4, 1);
    for (let k = 0; k < 3; k++) serverRack(44, -3 + k * 0.01, 0, 4);
  }

  // Secure Area (SE): walled yard round a vault; gates N (from the defender block), W (from the ford), NW (clearing)
  {
    const S = SECURE;
    block(S.x0, S.x1, S.z0, S.z1, 3.6, [
      { side: 'n', at: 37, w: 4 }, { side: 'n', at: 15, w: 5 }, { side: 'w', at: 48, w: 4, choke: true },
    ], { roof: false, thick: 0.9, trimY: 1.8 });
    block(18, 36, 50, 64, 6, [{ side: 'n', at: 27, w: 3.4 }, { side: 'w', at: 58, w: 3 }], { trimY: 4 });
    kit.box(core, 0.8, 2.6, 0.8, 27, 1.3, 58, Math.PI / 4, { solid: true }); // the vault core
    for (const [x, z, st] of [[14, 36, 2], [22, 40, 1], [32, 38, 1], [38, 46, 2], [13, 56, 1], [39, 60, 1], [28, 44, 1]] as const) crate(x, z, R() * 0.5, st);
  }

  // Spawns: Attacker (W, blue) on a pad in the grove; Defender (E, orange) behind the defender block
  const spawnLights: THREE.PointLight[] = [];
  for (const [sp, col, face] of [[SPAWN_A, 0x2f9dff, 1], [SPAWN_B, 0xff8a2b, -1]] as const) {
    const pad = new THREE.MeshStandardNodeMaterial({ color: 0x030a10, roughness: 0.3 });
    pad.emissiveNode = color(col).mul(float(0.35).add(uBeatPulse.mul(0.4)));
    kit.box(mats.stone, 12, 1.5, 14, sp.x - face * 2, -0.6, sp.z, 0, { tpm: 0.4 });
    kit.box(pad, 5, 0.05, 5, sp.x, 0.17, sp.z, 0, { solid: false, shadow: false, tpm: 1 });
    // back wall + portal frame
    const bx = sp.x - face * 7;
    kit.box(hull, 1.2, 7, 12, bx, 3.5, sp.z, 0, { tpm: 0.4 });
    for (const s of [-1, 1]) kit.box(hull, 1.4, 7.6, 1.4, bx + face * 0.6, 3.8, sp.z + s * 6.4, 0);
    kit.box(hull, 1.6, 1.0, 14.2, bx + face * 0.6, 7.6, sp.z, 0);
    const pm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    pm.colorNode = color(col).mul(float(1.0).add(sin(uv().y.mul(18).sub(time.mul(2.5))).mul(0.25)));
    pm.opacityNode = smoothstep(float(0.0), float(0.18), uv().y).mul(0.55);
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(9, 6), pm);
    sheet.position.set(bx + face * 0.65, 3.4, sp.z); sheet.rotation.y = Math.PI / 2;
    group.add(sheet);
    const l = new THREE.PointLight(col, 40, 22, 2); l.position.set(sp.x, 3.5, sp.z);
    if (!lo) { group.add(l); spawnLights.push(l); }
  }

  const cableGeos: THREE.BufferGeometry[] = [], amberCableGeos: THREE.BufferGeometry[] = [];
  const cable = new THREE.MeshStandardNodeMaterial({ color: 0x0c1318, roughness: 0.45, metalness: 0.35 });
  cable.emissiveNode = cyan.mul(smoothstep(float(0.93), float(0.99), fract(uv().x.mul(7).sub(time.mul(0.45))))).mul(1.6);
  const amberCable = new THREE.MeshStandardNodeMaterial({ color: 0x8a5a14, roughness: 0.5, metalness: 0.2 });
  amberCable.emissiveNode = amber.mul(0.12);
  /** Black cable from (x,z) out along the ground for len metres, wandering, sinking into the moss at the end. */
  const groundCable = (x: number, z: number, ang: number, len: number, r = 0.07, amberC = false) => {
    const pts: THREE.Vector3[] = [];
    let cx = x, cz = z, a = ang;
    const n = Math.max(4, Math.round(len / 1.6));
    for (let i = 0; i <= n; i++) {
      pts.push(new THREE.Vector3(cx, H(cx, cz) + r + (i === 0 ? 0.25 : 0.02) - (i === n ? 0.25 : 0), cz));
      a += (R() - 0.5) * 0.7; cx += Math.sin(a) * len / n; cz += Math.cos(a) * len / n;
    }
    (amberC ? amberCableGeos : cableGeos).push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 4, r, 5, false));
  };
  /** A cable sagging between two points in the air (catenary-ish). */
  const sagCable = (a: THREE.Vector3, b: THREE.Vector3, sag: number, r = 0.05, amberC = false) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(a.clone().lerp(b, t).add(new THREE.Vector3(0, -sag * 4 * t * (1 - t), 0))); }
    (amberC ? amberCableGeos : cableGeos).push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, r, 4, false));
  };

  // ── the Ancient Cyber-Forest Titan (hero tree over OBJ A): scaffold decks, stairs, crane, dish ────────
  {
    const T = TITAN, gy = H(T.x, T.z);
    const trunk = new THREE.CatmullRomCurve3([new THREE.Vector3(T.x, gy - 2, T.z), new THREE.Vector3(T.x + 0.4, gy + 14, T.z - 0.3), new THREE.Vector3(T.x - 0.6, gy + 30, T.z + 0.5), new THREE.Vector3(T.x + 0.3, gy + 40, T.z)]);
    treeGeos.push(barkTube(trunk, 5.2, 2.4, 24, 28, 0.35, 99));
    for (let r = 0; r < 12; r++) { // buttress roots
      const ra = (r / 12) * Math.PI * 2 + R() * 0.3, len = 9 + R() * 7;
      const c = new THREE.CatmullRomCurve3([
        new THREE.Vector3(T.x + Math.sin(ra) * 3, gy + 6 + R() * 2, T.z + Math.cos(ra) * 3),
        new THREE.Vector3(T.x + Math.sin(ra) * len * 0.45, gy + 1.6, T.z + Math.cos(ra) * len * 0.45),
        new THREE.Vector3(T.x + Math.sin(ra) * len, H(T.x + Math.sin(ra) * len, T.z + Math.cos(ra) * len) - 0.5, T.z + Math.cos(ra) * len),
      ]);
      rootGeos.push(barkTube(c, 1.5 + R() * 0.5, 0.25, 12, 10, 0.5, r + 3));
    }
    for (let b = 0; b < 7; b++) { // limbs
      const ba = (b / 7) * Math.PI * 2 + 0.4, by = gy + 24 + R() * 12, len = 10 + R() * 6;
      const c = new THREE.CatmullRomCurve3([
        new THREE.Vector3(T.x + Math.sin(ba) * 1.5, by, T.z + Math.cos(ba) * 1.5),
        new THREE.Vector3(T.x + Math.sin(ba) * len * 0.5, by + 3 + R() * 2, T.z + Math.cos(ba) * len * 0.5),
        new THREE.Vector3(T.x + Math.sin(ba) * len, by + 6 + R() * 4, T.z + Math.cos(ba) * len),
      ]);
      rootGeos.push(barkTube(c, 1.3, 0.35, 10, 9, 0.3, b + 40));
    }
    // decks at +7 and +14, ring-shaped round the trunk, with rails
    const decks = [gy + 7, gy + 14];
    for (const [i, dy] of decks.entries()) {
      const rIn = 5.0 - i * 0.6, rOut = 9.5 - i * 1.0, n = 16;
      for (let k = 0; k < n; k++) {
        const a = (k + 0.5) / n * Math.PI * 2, rm = (rIn + rOut) / 2, wid = 2 * Math.PI * rOut / n + 0.15;
        kit.box(hull, wid, 0.22, rOut - rIn, T.x + Math.sin(a) * rm, dy, T.z + Math.cos(a) * rm, a, { tpm: 0.6 });
        kit.box(hull, 0.07, 1.05, 0.07, T.x + Math.sin(a) * (rOut - 0.1), dy + 0.6, T.z + Math.cos(a) * (rOut - 0.1), a, { solid: false, shadow: false });
        kit.box(hull, wid, 0.06, 0.06, T.x + Math.sin(a) * (rOut - 0.1), dy + 1.12, T.z + Math.cos(a) * (rOut - 0.1), a, { solid: false, shadow: false });
        kit.box(B.invisible, wid, 1.2, 0.2, T.x + Math.sin(a) * rOut, dy + 0.7, T.z + Math.cos(a) * rOut, a, { shadow: false });
        if (k % 4 === 0) kit.box(hull, 0.25, dy - gy + 1, 0.25, T.x + Math.sin(a) * (rOut - 0.4), (dy + gy) / 2 - 0.5, T.z + Math.cos(a) * (rOut - 0.4), 0, { shadow: false });
      }
      kit.box(trim, 0.1, 0.1, 0.1, T.x, dy, T.z, 0, { solid: false });
    }
    // stairs: ground → deck 1 on the east side, deck 1 → deck 2 on the west (gaps in the rails at the landings)
    B.steelStair(hull, T.x + 10.6, gy + 0.05, T.z + 4.5, Math.PI, decks[0], 1.8);
    B.steelStair(hull, T.x - 7.6, decks[0], T.z + 2.0, Math.PI, decks[1], 1.6);
    // a crane jib and a dish on deck 2, lit cable spools
    kit.box(hull, 0.4, 6, 0.4, T.x + 6.5, decks[1] + 3, T.z - 2, 0);
    kit.box(hull, 0.35, 0.35, 9, T.x + 6.5, decks[1] + 6, T.z - 5.5, 0, { solid: false, rx: 0.25 });
    const dish = new THREE.SphereGeometry(1.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.6);
    kit.place(dish, T.x - 6, decks[1] + 2.2, T.z - 4, 0.8, -1.0); kit.add(hull, dish, { solid: false });
    kit.box(hull, 0.2, 2.2, 0.2, T.x - 6, decks[1] + 1.1, T.z - 4, 0, { solid: false });
    // the lattice tower on the north side (front view of the titan sheet): four legs, ring beams, X-braced bays,
    // up past deck 2 to a lamp-and-antenna top; a short catwalk ties it to deck 2
    {
      const tx = T.x + 1, tz = T.z - 11, hw = 1.5, top = decks[1] + 9 - gy, bay = 3;
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) kit.box(hull, 0.22, top, 0.22, tx + sx * hw, gy + top / 2, tz + sz * hw, 0);
      for (let yb = 0; yb + bay <= top + 0.01; yb += bay) {
        const y0 = gy + yb, y1 = y0 + bay, dl = Math.hypot(hw * 2, bay), rz = Math.atan2(hw * 2, bay);
        for (const s of [-1, 1]) {
          kit.box(hull, hw * 2, 0.14, 0.14, tx, y1, tz + s * hw, 0, { solid: false });
          kit.box(hull, 0.14, 0.14, hw * 2, tx + s * hw, y1, tz, 0, { solid: false });
          // X-braces on each face
          kit.box(hull, 0.08, dl, 0.08, tx, (y0 + y1) / 2, tz + s * hw, 0, { solid: false, rz });
          kit.box(hull, 0.08, dl, 0.08, tx, (y0 + y1) / 2, tz + s * hw, 0, { solid: false, rz: -rz });
          kit.box(hull, 0.08, dl, 0.08, tx + s * hw, (y0 + y1) / 2, tz, Math.PI / 2, { solid: false, rz });
          kit.box(hull, 0.08, dl, 0.08, tx + s * hw, (y0 + y1) / 2, tz, Math.PI / 2, { solid: false, rz: -rz });
        }
      }
      kit.box(hull, 3.6, 0.2, 3.6, tx, gy + top, tz, 0);
      kit.box(hazard, 3.6, 0.12, 0.12, tx, gy + top + 0.95, tz - 1.75, 0, { solid: false });
      kit.box(hull, 0.12, 4, 0.12, tx + 1.2, gy + top + 2, tz + 1.2, 0, { solid: false });
      kit.box(trim, 0.3, 0.3, 0.3, tx + 1.2, gy + top + 4.1, tz + 1.2, 0, { solid: false });
      kit.box(hull, 1.4, 0.18, 2.6, tx, decks[1], tz + 2.6, 0); // catwalk to deck 2
      kit.box(B.invisible, 4, 60, 4, tx, gy + 20, tz, 0, { shadow: false }); // no walking through the lattice
      // a spiral stair column wound round a pole beside the tower (dressing: 3 turns of treads)
      const sx0 = T.x - 3.2, sz0 = T.z - 11.8, sTop = decks[0] - gy;
      kit.prism(hull, 8, 0.16, 0.16, sTop + 1, sx0, gy + sTop / 2, sz0, 0, { solid: false });
      const treads = 36;
      for (let k = 0; k < treads; k++) {
        const a = k / treads * Math.PI * 6, y = gy + 0.3 + k / treads * sTop;
        kit.box(hull, 1.3, 0.08, 0.45, sx0 + Math.sin(a) * 0.75, y, sz0 + Math.cos(a) * 0.75, a + Math.PI / 2, { solid: false });
        if (k % 3 === 0) kit.box(hull, 0.05, 1.0, 0.05, sx0 + Math.sin(a) * 1.4, y + 0.5, sz0 + Math.cos(a) * 1.4, 0, { solid: false });
      }
      kit.box(B.invisible, 3, sTop + 1, 3, sx0, gy + sTop / 2, sz0, 0, { shadow: false });
    }
    // cables everywhere: sagging from the limbs to the deck rails, hanging out of the crown, wound down the trunk
    for (let k = 0; k < 16; k++) {
      const a = R() * 6.28, d = decks[k % 2], ro = 9.3 - (k % 2);
      const from = new THREE.Vector3(T.x + Math.sin(a) * (3.5 + R() * 6), gy + 24 + R() * 10, T.z + Math.cos(a) * (3.5 + R() * 6));
      const to = new THREE.Vector3(T.x + Math.sin(a + 0.4) * ro, d + 1.1, T.z + Math.cos(a + 0.4) * ro);
      sagCable(from, to, 2 + R() * 3, 0.045 + R() * 0.03, k % 3 === 0);
    }
    for (let k = 0; k < 22; k++) { // straight drops out of the crown
      const a = R() * 6.28, d = 4 + R() * 11, x = T.x + Math.sin(a) * d, z = T.z + Math.cos(a) * d, y0 = gy + 26 + R() * 8;
      sagCable(new THREE.Vector3(x, y0, z), new THREE.Vector3(x + (R() - 0.5), y0 - 6 - R() * 10, z + (R() - 0.5)), 0.2, 0.03, R() < 0.3);
    }
    for (let k = 0; k < 3; k++) { // fat conduits spiralling down the trunk into the roots
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 30; i++) {
        const t = i / 30, y = gy + 30 - t * 30, rr = 2.6 + 2.8 * t + 0.25, a = k * 2.1 + t * 3.2;
        pts.push(new THREE.Vector3(T.x + Math.sin(a) * rr, y, T.z + Math.cos(a) * rr));
      }
      (k === 1 ? amberCableGeos : cableGeos).push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 90, 0.14, 6, false));
    }
    // glowing node studs over the bark (the sheet's cyan dots), and ivy up the trunk
    {
      const n = lo ? 110 : 220, g = new THREE.IcosahedronGeometry(0.13, 0);
      const mat = new THREE.MeshBasicNodeMaterial({ color: 0x5ef4ff });
      mat.colorNode = color(0x5ef4ff).mul(float(1.4).add(uBeatPulse.mul(1.2)));
      const dots = new THREE.InstancedMesh(g, mat, n);
      for (let i = 0; i < n; i++) {
        const t = Math.pow(R(), 0.8), y = gy + 2 + t * 34, rr = 5.2 + (2.4 - 5.2) * Math.min(1, t * 1.1) + 0.15, a = R() * 6.28;
        const sz = 0.6 + R() * 1.2;
        m4.compose(v.set(T.x + Math.sin(a) * rr, y, T.z + Math.cos(a) * rr), q.identity(), s3.set(sz, sz, sz)); dots.setMatrixAt(i, m4);
      }
      dots.frustumCulled = false; group.add(dots);
      for (let i = 0; i < (lo ? 24 : 48); i++) {
        const t = R(), y = gy + 4 + t * 26, rr = 5.2 + (2.4 - 5.2) * Math.min(1, (y - gy) / 36) + 0.25, a = R() * 6.28;
        vines.push([T.x + Math.sin(a) * rr, y, T.z + Math.cos(a) * rr, a]);
      }
    }
  }

  // ── the glitched canyon: broken voxel rock, floating glitch cubes, OBJ B on a scan plinth ─────────────
  const glitchCubes: THREE.Mesh[] = [];
  {
    const wire = new THREE.MeshBasicNodeMaterial({ wireframe: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    wire.colorNode = mix(cyan, color(0xd04aff), sin(time.mul(3).add(positionWorld.x)).mul(0.5).add(0.5));
    wire.opacityNode = float(0.55).add(uBeatPulse.mul(0.4));
    for (let i = 0; i < (lo ? 30 : 70); i++) {
      const t = R(), seg = Math.min(CANYON.length - 2, Math.floor(t * (CANYON.length - 1)));
      const f = t * (CANYON.length - 1) - seg, [ax, az] = CANYON[seg], [bx, bz] = CANYON[seg + 1];
      const side = R() < 0.5 ? -1 : 1, nx = -(bz - az), nz = bx - ax, nl = Math.hypot(nx, nz);
      const d = 7 + R() * 6, x = ax + (bx - ax) * f + nx / nl * side * d, z = az + (bz - az) * f + nz / nl * side * d;
      const s = 0.8 + R() * 2.4;
      if (near(x, z, 4) || Math.hypot(x - OBJ.A.x, z - OBJ.A.z) < 11 || inRiver(x, z, 1)) continue;
      kit.box(mats.stone, s, s * (0.6 + R()), s, x, H(x, z) + s * 0.3, z, R() * 6, { tpm: 0.5, rx: (R() - 0.5) * 0.4, rz: (R() - 0.5) * 0.4 });
    }
    for (let i = 0; i < (lo ? 10 : 26); i++) {
      const t = R(), seg = Math.min(CANYON.length - 2, Math.floor(t * (CANYON.length - 1))), f = t * (CANYON.length - 1) - seg;
      const [ax, az] = CANYON[seg], [bx, bz] = CANYON[seg + 1];
      const x = ax + (bx - ax) * f + (R() - 0.5) * 12, z = az + (bz - az) * f + (R() - 0.5) * 12, s = 0.4 + R() * 1.4;
      const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), wire);
      m.position.set(x, H(x, z) + 2.5 + R() * 6, z); m.rotation.set(R() * 3, R() * 3, R() * 3);
      m.userData.spin = (R() - 0.5) * 1.2; m.userData.y0 = m.position.y; m.userData.ph = R() * 6;
      group.add(m); glitchCubes.push(m);
    }
    const by = H(OBJ.B.x, OBJ.B.z);
    kit.prism(mats.stone, 8, 4.6, 5.0, 0.4, OBJ.B.x, by - 0.1, OBJ.B.z, Math.PI / 8, { tpm: 0.5 });
    kit.prism(trim, 8, 4.65, 4.65, 0.04, OBJ.B.x, by + 0.3, OBJ.B.z, Math.PI / 8, { solid: false });
    // the canyon's west mouth is a choke: two hazard pylons
    for (const s of [-1, 1]) kit.box(hazard, 1.2, 3.2, 1.2, -96 + s * 3.5, H(-96 + s * 3.5, 17 - s * 2) + 1.4, 17 - s * 2, 0.6, { tpm: 1 });
  }

  // OBJ A: a ring of rune stones in the grove clearing under the titan
  {
    const ay = H(OBJ.A.x, OBJ.A.z);
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * Math.PI * 2, x = OBJ.A.x + Math.sin(a) * 7.5, z = OBJ.A.z + Math.cos(a) * 7.5, h = 2 + R() * 1.6;
      kit.box(mats.stone, 1.0, h, 0.8, x, H(x, z) + h / 2 - 0.2, z, a, { tpm: 0.6, rz: (R() - 0.5) * 0.15 });
      kit.box(trim, 0.08, h * 0.7, 0.82, x + Math.sin(a) * -0.52, H(x, z) + h * 0.45, z + Math.cos(a) * -0.52, a, { solid: false, shadow: false });
    }
    kit.prism(mats.stone, 10, 2.2, 2.6, 0.5, OBJ.A.x, ay - 0.2, OBJ.A.z, 0, { tpm: 0.5 });
  }

  // ── neon energy nodes (asset sheet "Neon Energy Nodes"): glass data pods, crystal pylons, power nodes, and the
  //    black data cables that snake off them across the moss with light pulses running along ─────────────────────
  const podCore = (c: number, ph: number) => {
    const m = new THREE.MeshStandardNodeMaterial({ color: 0x101010, roughness: 0.3 });
    // a glowing column, not a slab: brightest facing you, darker at the silhouette, data bands rising through it
    const facing = abs(normalView.dot(positionViewDirection));
    const bands = smoothstep(float(0.7), float(0.95), fract(positionWorld.y.mul(2.2).sub(time.mul(0.8).add(ph))));
    m.emissiveNode = color(c).mul(facing.mul(facing).mul(0.85).add(0.15)).mul(float(0.75).add(bands.mul(0.7)).add(sin(time.mul(2.4).add(ph)).mul(0.15)).add(uBeatPulse.mul(0.4)));
    return m;
  };
  const coreOrange = podCore(0xff5a10, 0), coreBlue = podCore(0x1c7cff, 1.7);
  const podGlass = new THREE.MeshStandardNodeMaterial({ color: 0x06202a, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.28 });
  podGlass.emissiveNode = cyan.mul(float(1).sub(abs(normalView.dot(positionViewDirection))).pow(2.5).mul(0.9)); // a fresnel rim so the glass reads
  const crystal = new THREE.MeshStandardNodeMaterial({ color: 0x08101c, roughness: 0.08, metalness: 0.35 });
  // deep blue at the claws to hot orange at the tip (the sheet's pulsing energy node), with a bright band climbing it
  const climb = smoothstep(float(0.9), float(1.0), fract(uv().y.mul(1.5).sub(time.mul(0.35))));
  crystal.emissiveNode = mix(color(0x1848ff), color(0xff6a10), smoothstep(float(0.3), float(0.95), uv().y))
    .mul(float(0.75).add(climb.mul(0.9)).add(sin(time.mul(1.6)).mul(0.12)).add(uBeatPulse.mul(0.5)));
  const glowSpots: THREE.Vector3[] = []; // moths gather round these
  const dataPod = (x: number, z: number, coreMat: THREE.Material) => {
    const gy = H(x, z);
    glowSpots.push(new THREE.Vector3(x, gy, z));
    kit.prism(hull, 8, 0.85, 1.05, 0.5, x, gy + 0.2, z, 0, { tpm: 0.8 });
    kit.prism(trim, 16, 0.7, 0.7, 0.05, x, gy + 0.47, z, 0, { solid: false });
    kit.prism(coreMat, 12, 0.42, 0.42, 1.5, x, gy + 1.25, z, 0, { solid: false });
    kit.prism(podGlass, 12, 0.62, 0.62, 1.6, x, gy + 1.25, z, 0, { solid: false });
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; kit.box(hull, 0.12, 1.7, 0.12, x + Math.sin(a) * 0.66, gy + 1.25, z + Math.cos(a) * 0.66, a, { solid: false }); }
    kit.prism(hull, 8, 0.5, 0.8, 0.35, x, gy + 2.2, z, 0, { tpm: 0.8 });
    kit.box(B.invisible, 1.7, 2.5, 1.7, x, gy + 1.2, z, 0, { shadow: false });
    for (let k = 0; k < 3 + Math.floor(R() * 3); k++) groundCable(x, z, R() * 6.28, 4 + R() * 6, 0.06 + R() * 0.04);
  };
  const crystalNode = (x: number, z: number) => {
    const gy = H(x, z);
    glowSpots.push(new THREE.Vector3(x, gy + 1, z));
    kit.prism(hull, 4, 1.0, 1.7, 0.7, x, gy + 0.3, z, Math.PI / 4, { tpm: 0.8 });
    kit.prism(hull, 4, 0.6, 1.0, 0.5, x, gy + 0.9, z, Math.PI / 4, { tpm: 0.8 });
    for (let k = 0; k < 3; k++) { // three claws holding the crystal
      const a = k / 3 * Math.PI * 2;
      kit.box(hull, 0.22, 1.8, 0.3, x + Math.sin(a) * 0.55, gy + 1.8, z + Math.cos(a) * 0.55, a, { solid: false, rx: -0.35 });
    }
    const prof = [[0, 0], [0.32, 0.25], [0.48, 1.0], [0.42, 2.4], [0, 3.4]].map(([r, y]) => new THREE.Vector2(r, y));
    const g = new THREE.LatheGeometry(prof, 6);
    kit.place(g, x, gy + 1.0, z, R()); kit.add(crystal, g, { solid: false });
    kit.box(B.invisible, 2.2, 4.4, 2.2, x, gy + 2.2, z, 0, { shadow: false });
    for (let k = 0; k < 4; k++) groundCable(x, z, k * 1.57 + R() * 0.6, 5 + R() * 6, 0.08);
  };
  const powerNode = (x: number, z: number) => {
    const gy = H(x, z);
    kit.prism(hull, 12, 0.8, 1.0, 0.4, x, gy + 0.15, z, 0, { tpm: 0.8 });
    kit.prism(coreOrange, 16, 0.5, 0.5, 0.08, x, gy + 0.38, z, 0, { solid: false });
    kit.prism(hull, 12, 0.28, 0.32, 0.18, x, gy + 0.46, z, 0, { solid: false });
    for (let k = 0; k < 4; k++) groundCable(x, z, k * 1.57 + R() * 0.5, 3 + R() * 5, 0.07);
  };
  {
    // clusters at the objectives, the crossings, the grove trails and both spawns; never on a lane or in the river
    const ok = (x: number, z: number) => !near(x, z, 3.5) && !inRiver(x, z, 1.5) && !inBuilding(x, z, 0.5) && Math.hypot(x - OBJ.A.x, z - OBJ.A.z) > 9.5;
    const spots: [number, number, 'pod' | 'podB' | 'crystal' | 'power'][] = [
      [-110, -12, 'crystal'], [-91, 8, 'pod'], [-112, 6, 'podB'], [-104, -14, 'power'],      // OBJ A
      [-124, -16, 'pod'], [-120, 20, 'podB'], [-136, -46, 'crystal'], [-142, 22, 'power'],   // grove + attacker spawn
      [-138, -12, 'podB'], [-138, 13, 'pod'],
      [-70, -24, 'pod'], [-90, -6, 'power'], [-66, -8, 'crystal'],                          // titan base, east of it
      [-62, -46, 'podB'], [-58, -30, 'power'], [-42, -50, 'crystal'],                        // the bridge's west end
      [-64, 12, 'pod'], [-50, 14, 'power'],                                                   // the log crossing
      [-82, 32, 'crystal'], [-66, 46, 'podB'], [-46, 28, 'power'],                           // canyon rims
      [-26, 58, 'pod'], [-4, 52, 'crystal'],                                                  // the ford
      [66, -22, 'crystal'], [66, 22, 'pod'], [80, -8, 'podB'], [78, 12, 'power'],             // defender spawn
      [52, -40, 'pod'], [52, 44, 'crystal'], [-30, -16, 'power'], [-28, 24, 'podB'],
    ];
    for (const [x, z, kind] of spots) {
      if (!ok(x, z)) continue;
      if (kind === 'pod') dataPod(x, z, coreOrange); else if (kind === 'podB') dataPod(x, z, coreBlue);
      else if (kind === 'crystal') crystalNode(x, z); else powerNode(x, z);
    }
    // loose cables through the grove and along the river banks
    for (let i = 0; i < (lo ? 30 : 60); i++) {
      const x = -150 + R() * 200, z = -80 + R() * 160;
      if (near(x, z, 2) || inRiver(x, z, 1) || inBuilding(x, z, 1)) continue;
      groundCable(x, z, R() * 6.28, 5 + R() * 9, 0.05 + R() * 0.05, R() < 0.2);
    }
  }

  // ── forest trees: bark trunks with conduit veins + canopy card crowns cut from the tree turnarounds ───
  type Crown = { x: number; y: number; z: number; r: number; kind: number };
  const crowns: Crown[] = [];
  // the forest is grown by the vegetation service (services/vegetation): these code trunks stay as colliders only
  const fTreeGeos: THREE.BufferGeometry[] = [], fRootGeos: THREE.BufferGeometry[] = [];
  const forestSpots: { x: number; z: number; h: number; yaw: number; kind: number }[] = [];
  const tree = (x: number, z: number, h: number, r: number, kind: number) => {
    const gy = H(x, z), lean = new THREE.Vector3((R() - 0.5) * 0.12 * h, 0, (R() - 0.5) * 0.12 * h);
    const c = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, gy - 1, z), new THREE.Vector3(x + lean.x * 0.3, gy + h * 0.35, z + lean.z * 0.3),
      new THREE.Vector3(x + lean.x * 0.75, gy + h * 0.7, z + lean.z * 0.75), new THREE.Vector3(x + lean.x, gy + h, z + lean.z),
    ]);
    fTreeGeos.push(barkTube(c, r, r * 0.3, lo ? 6 : 8, 6, 0.3, x * 0.1 + z));
    const roots = lo ? 3 : 6;
    for (let k = 0; k < roots; k++) {
      const ra = (k / roots) * Math.PI * 2 + R(), len = r * (3 + R() * 3);
      const rc = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x + Math.sin(ra) * r * 0.5, gy + r * 1.8, z + Math.cos(ra) * r * 0.5),
        new THREE.Vector3(x + Math.sin(ra) * len * 0.5, gy + r * 0.4, z + Math.cos(ra) * len * 0.5),
        new THREE.Vector3(x + Math.sin(ra) * len, H(x + Math.sin(ra) * len, z + Math.cos(ra) * len) - 0.2, z + Math.cos(ra) * len),
      ]);
      fRootGeos.push(barkTube(rc, r * 0.42, r * 0.08, 7, 6, 0.5, k + x));
    }
    for (let b = 0; b < 3; b++) { // a few limbs into the crown
      const ba = R() * 6.28, by = gy + h * (0.55 + R() * 0.25), bl = h * 0.28;
      const bc = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x + lean.x * 0.6, by, z + lean.z * 0.6),
        new THREE.Vector3(x + lean.x * 0.6 + Math.sin(ba) * bl, by + bl * 0.7, z + lean.z * 0.6 + Math.cos(ba) * bl),
      ]);
      fRootGeos.push(barkTube(bc, r * 0.32, r * 0.1, 5, 6, 0.2, b + z));
    }
    crowns.push({ x: x + lean.x, y: gy + h * 0.92, z: z + lean.z, r: h * 0.36, kind });
    forestSpots.push({ x, z, h, yaw: R() * Math.PI * 2, kind });
  };
  const okForTree = (x: number, z: number) => !near(x, z, 7) && !inBuilding(x, z, 4) && !inRiver(x, z, 2) && !inCanyon(x, z, 1) &&
    Math.hypot(x - TITAN.x, z - TITAN.z) > 18 && Math.hypot(x - OBJ.A.x, z - OBJ.A.z) > 12 && !glowSpots.some((g) => Math.hypot(g.x - x, g.z - z) < 6) && x > BOUND.x0 + 2 && x < BOUND.x1 - 2 && Math.abs(z) < BOUND.z1 - 2;
  const placeTrees = (n: number, x0: number, x1: number, z0: number, z1: number, kinds: number[], hMin: number, hMax: number) => {
    let made = 0;
    for (let i = 0; i < n * 8 && made < n; i++) {
      const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0);
      if (!okForTree(x, z) || crowns.some((c) => Math.hypot(c.x - x, c.z - z) < 9)) continue;
      const h = hMin + R() * (hMax - hMin);
      tree(x, z, h, 0.5 + h * 0.045, kinds[Math.floor(R() * kinds.length)]);
      made++;
    }
  };
  placeTrees(lo ? 24 : 44, -158, -48, -84, 6, [0, 1, 2, 0, 1, 3], 16, 28);   // the Tech-Grove
  placeTrees(lo ? 12 : 22, -158, -60, 6, 84, [0, 1, 2, 4], 15, 26);        // south grove + canyon rims
  placeTrees(lo ? 6 : 12, -30, 84, 66, 84, [3, 4, 5], 14, 22);           // south of the secure area
  placeTrees(lo ? 6 : 12, -40, 84, -84, -74, [3, 4, 5, 0], 14, 22);      // north of the server complex
  placeTrees(lo ? 6 : 10, 50, 84, -70, 70, [0, 2, 5], 14, 22);           // round the defender spawn
  // willows and mangroves along the river banks
  for (let i = 0; i < (lo ? 10 : 20); i++) {
    const t = R(), k = Math.min(RIVER.length - 2, Math.floor(t * (RIVER.length - 1))), f = t * (RIVER.length - 1) - k;
    const [ax, az] = RIVER[k], [bx, bz] = RIVER[k + 1], nx = -(bz - az), nz = bx - ax, nl = Math.hypot(nx, nz), side = R() < 0.5 ? -1 : 1;
    const x = ax + (bx - ax) * f + nx / nl * side * (RIVER_HALF + 4 + R() * 4), z = az + (bz - az) * f + nz / nl * side * (RIVER_HALF + 4 + R() * 4);
    if (near(x, z, 6) || inBuilding(x, z, 3) || glowSpots.some((g) => Math.hypot(g.x - x, g.z - z) < 6) || Math.abs(z - BRIDGE_Z) < 8 || Math.abs(z - LOG_Z) < 7 || Math.hypot(x - FORD.x, z - FORD.z) < 10 || Math.abs(z) > 82) continue;
    const h = 12 + R() * 8;
    tree(x, z, h, 0.6 + h * 0.04, R() < 0.6 ? 6 : 7);
  }
  {
    const tg = mergeGeometries(treeGeos.map((g) => g.index ? g.toNonIndexed() : g), false);
    if (tg) { const m = new THREE.Mesh(tg, bark); m.castShadow = true; m.receiveShadow = true; m.userData.collide = true; group.add(m); }
    const rg = mergeGeometries(rootGeos.map((g) => g.index ? g.toNonIndexed() : g), false);
    if (rg) { const m = new THREE.Mesh(rg, bark); m.castShadow = !lo; m.receiveShadow = true; group.add(m); }
    const ftg = fTreeGeos.length ? mergeGeometries(fTreeGeos.map((g) => g.index ? g.toNonIndexed() : g), false) : null;
    if (ftg) { const m = new THREE.Mesh(ftg, B.invisible); m.name = 'forest-trunks'; m.userData.collide = true; group.add(m); }
    void fRootGeos; // (the grown trees have their own roots)
  }
  // the titan's crown: its own big cluster
  crowns.push({ x: TITAN.x, y: H(TITAN.x, TITAN.z) + 38, z: TITAN.z, r: 17, kind: 0 });
  crowns.push({ x: TITAN.x + 6, y: H(TITAN.x, TITAN.z) + 33, z: TITAN.z - 5, r: 11, kind: 1 });
  crowns.push({ x: TITAN.x - 7, y: H(TITAN.x, TITAN.z) + 34, z: TITAN.z + 4, r: 11, kind: 2 });

  // (canopy cards are gone: every crown is grown by the vegetation service)

  // ── vegetation: trees, grass, plants, fungi and vines grown by the Plajah Vegetation service from the Cyber Forest
  //    species (services/vegetation/catalog) — no sprite cards. Placement rules are the level's; the rest is the service's.
  const anywhere = (minLane = 2.5): [number, number] | null => {
    const x = BOUND.x0 + R() * (BOUND.x1 - BOUND.x0), z = BOUND.z0 + R() * (BOUND.z1 - BOUND.z0);
    if (inBuilding(x, z, 1) || inRiver(x, z, -1) || near(x, z, minLane)) return null;
    return [x, z];
  };
  const grove = (): [number, number] | null => { const p = anywhere(); return p && p[0] < -40 ? p : (R() < 0.35 ? p : null); };
  const byTrees = (): [number, number] | null => {
    const c = crowns[Math.floor(R() * crowns.length)]; const a = R() * 6.28, d = 2 + R() * 6;
    const x = c.x + Math.sin(a) * d, z = c.z + Math.cos(a) * d;
    return inBuilding(x, z, 1) || inRiver(x, z) || near(x, z, 2) ? null : [x, z];
  };
  const k = lo ? 0.35 : 1;
  // trees: the code trees' spots (kinds from the old canopy cards → species), the Titan's crown, the forest beyond the edge
  const KIND_TO_SPECIES = [2, 2, 2, 0, 0, 0, 1, 3];                  // 0 violet, 1 willow, 2 blue-leaf, 3 mangrove
  const treeSpots: TreeSpot[] = forestSpots.map((t) => {
    const sp = KIND_TO_SPECIES[t.kind] ?? 2;
    return { x: t.x, y: H(t.x, t.z) - 0.2, z: t.z, yaw: t.yaw, species: sp, scale: Math.max(0.6, Math.min(1.6, t.h / CYBER_FOREST_TREES[sp].height)) };
  });
  treeSpots.push({ x: TITAN.x, y: H(TITAN.x, TITAN.z), z: TITAN.z, yaw: 0.4, species: 4, scale: 0.72 });   // CF_GREAT_OAK crown
  for (let i = 0, n = lo ? 130 : 300; i < n * 3 && treeSpots.length < forestSpots.length + 1 + n; i++) {
    const t = R(), out = 6 + Math.pow(R(), 0.7) * 44, per4 = t * 4, side = Math.floor(per4), f = per4 - side;
    let x: number, z: number;
    if (side === 0) { x = BOUND.x0 + f * (BOUND.x1 - BOUND.x0); z = BOUND.z0 - out; }
    else if (side === 1) { x = BOUND.x1 + out; z = BOUND.z0 + f * (BOUND.z1 - BOUND.z0); }
    else if (side === 2) { x = BOUND.x0 + f * (BOUND.x1 - BOUND.x0); z = BOUND.z1 + out; }
    else { x = BOUND.x0 - out; z = BOUND.z0 + f * (BOUND.z1 - BOUND.z0); }
    if (treeSpots.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 49)) continue;
    const sp = R() < 0.4 ? 2 : R() < 0.5 ? 0 : R() < 0.5 ? 3 : 1;
    treeSpots.push({ x, y: H(x, z) - 0.3, z, yaw: R() * Math.PI * 2, species: sp, scale: 0.9 + R() * 0.6 });
  }
  // plants: 0 fern, 1 bush, 2 glow flower, 3 vine, 4 crystal plant, 5 resin stump, 6 carnivore
  const plantSpots: PlantSpot[] = [];
  const plant = (species: number, count: number, place: () => [number, number] | null, hMin: number, hMax: number) => {
    const h0 = CYBER_FOREST_PLANTS[species].height;
    for (let i = 0, n = 0; i < count * 4 && n < count; i++) {
      const p = place(); if (!p) continue;
      plantSpots.push({ x: p[0], y: H(p[0], p[1]) - 0.05, z: p[1], yaw: R() * 6.28, species, scale: (hMin + R() * (hMax - hMin)) / h0 }); n++;
    }
  };
  plant(0, Math.round(260 * k), byTrees, 1.3, 2.4);
  plant(0, Math.round(160 * k), grove, 1.0, 1.9);
  plant(1, Math.round(150 * k), anywhere, 1.1, 1.9);
  plant(1, Math.round(110 * k), byTrees, 1.1, 2.0);
  plant(2, Math.round(60 * k), grove, 1.1, 1.9);
  plant(2, Math.round(50 * k), anywhere, 1.0, 1.7);
  plant(4, Math.round(40 * k), () => { const p = anywhere(3); return p && inCanyon(p[0], p[1], 6) ? p : null; }, 1.6, 3.2);
  plant(5, Math.round(14 * k), byTrees, 1.3, 2.3);
  plant(6, Math.round(16 * k), grove, 2.2, 3.4);
  // vines over the building walls: hung from the wall tops, just off the face
  for (const [x, y, z, yaw] of vines) plantSpots.push({ x: x + Math.sin(yaw) * 0.25, y, z: z + Math.cos(yaw) * 0.25, yaw: R() * 6.28, species: 3, scale: (2.2 + R() * 2.6) / CF_VINE.height });
  // fungi: 0 neon cluster, 1 toadstool, 2 tall jelly, 3 spore bulb, 4 shelf (on trunks, below)
  const fungusSpots: FungusSpot[] = [];
  const fungus = (species: number, count: number, place: () => [number, number] | null, hMin: number, hMax: number) => {
    const h0 = [1.16, 1.48, 3.88, 1.63][species];
    for (let i = 0, n = 0; i < count * 4 && n < count; i++) {
      const p = place(); if (!p) continue;
      fungusSpots.push({ x: p[0], y: H(p[0], p[1]) - 0.08, z: p[1], yaw: R() * 6.28, species, scale: (hMin + R() * (hMax - hMin)) / h0 }); n++;
    }
  };
  fungus(0, Math.round(70 * k), byTrees, 1.0, 2.2);
  fungus(0, Math.round(50 * k), grove, 0.9, 1.8);
  fungus(1, Math.round(36 * k), byTrees, 1.3, 2.6);
  fungus(2, Math.round(26 * k), grove, 2.6, 4.8);
  fungus(3, Math.round(22 * k), grove, 2.0, 3.6);
  for (const t of treeSpots) {
    if (t.species > 3 || t.x < BOUND.x0 - 4 || t.x > BOUND.x1 + 4 || Math.abs(t.z) > BOUND.z1 + 4 || R() > (lo ? 0.25 : 0.45)) continue;
    const tr = CYBER_FOREST_TREES[t.species].trunk.radius * t.scale;
    for (let j = 0, n = 1 + Math.floor(R() * 2); j < n; j++) {
      const a = R() * 6.28;
      fungusSpots.push({ x: t.x + Math.sin(a) * tr * 0.95, y: t.y + tr * 3.4 + R() * 2.5, z: t.z + Math.cos(a) * tr * 0.95, yaw: a, species: 4, scale: 1.1 + R() * 0.9 });
    }
  }
  // grass: glow tufts thick in the grove and along the banks, turf everywhere but the lanes, the river and the buildings
  const GX0 = BOUND.x0 - 24, GZ0 = BOUND.z0 - 24, GS = Math.max(BOUND.x1 - BOUND.x0, BOUND.z1 - BOUND.z0) + 48;
  const veg = new VegetationScene({
    lowTier: lo, beat: uBeatPulse, wind: 0.55,
    trees: { species: [...CYBER_FOREST_TREES, CF_GREAT_OAK], spots: treeSpots },
    grass: {
      species: CYBER_FOREST_GRASS, bounds: { x0: GX0, z0: GZ0, size: GS, res: lo ? 128 : 220 }, heightAt: H,
      coverAt: (x, z) => {
        if (inBuilding(x, z, 0.5) || inRiver(x, z, 0.3)) return [0, 0];
        const lane = LANES.reduce((m, l) => Math.min(m, segDist(x, z, l).d), Infinity);
        const path = Math.min(1, Math.max(0, (lane - 1.2) / 2.2));
        const ex = Math.min(x - (BOUND.x0 - 18), (BOUND.x1 + 18) - x, z - (BOUND.z0 - 18), (BOUND.z1 + 18) - z);
        const edge = Math.min(1, Math.max(0, ex / 6)), canyon = inCanyon(x, z, 0) ? 0.25 : 1;
        const bank = inRiver(x, z, 6) ? 1.3 : 1, groveK = x < -40 ? 1 : 0.55;
        return [path * edge * canyon * 0.8 * groveK * bank, Math.max(path, 0.25) * edge * canyon];
      },
    },
    plants: {
      species: CYBER_FOREST_PLANTS, spots: plantSpots,
      // vines also hang from the grown branches inside the map
      more: (v) => {
        const extra: PlantSpot[] = [];
        for (const hp of v.hangPoints(lo ? 1 : 2, (t) => t.x > BOUND.x0 - 6 && t.x < BOUND.x1 + 6 && Math.abs(t.z) < BOUND.z1 + 6, 13)) {
          const clear = hp.y - H(hp.x, hp.z);
          if (clear < 3.5 || R() > 0.6) continue;
          extra.push({ x: hp.x, y: hp.y + 0.15, z: hp.z, yaw: R() * 6.28, species: 3, scale: Math.min(1.6, (clear - 2.4) / CF_VINE.height) });
        }
        return extra;
      },
    },
    fungi: { species: CYBER_FOREST_FUNGI, spots: fungusSpots },
  });
  group.add(veg.group);
  group.userData.vegetation = veg;   // ?rrdebug: stats, trample tests
  const walkers: THREE.Object3D[] = [], walkPos: THREE.Vector3[] = [];

  // invisible fence just inside the edge hills
  for (const [cx, cz, w, d] of [[(BOUND.x0 + BOUND.x1) / 2, BOUND.z0 - 3, BOUND.x1 - BOUND.x0 + 12, 1], [(BOUND.x0 + BOUND.x1) / 2, BOUND.z1 + 3, BOUND.x1 - BOUND.x0 + 12, 1], [BOUND.x0 - 3, 0, 1, BOUND.z1 - BOUND.z0 + 12], [BOUND.x1 + 3, 0, 1, BOUND.z1 - BOUND.z0 + 12]] as const) {
    kit.box(B.invisible, w, 60, d, cx, 20, cz, 0, { shadow: false });
  }

  // all the cables: two merged meshes (no collision; they lie on the ground or hang in the air)
  for (const [geos, mat] of [[cableGeos, cable], [amberCableGeos, amberCable]] as const) {
    const g = geos.length ? mergeGeometries(geos.map((x) => x.index ? x.toNonIndexed() : x), false) : null;
    if (g) { const m = new THREE.Mesh(g, mat); m.castShadow = !lo; m.receiveShadow = true; group.add(m); }
  }

  // ── lights: few and coloured (objective beacons, the titan's lamps, server hall, bridge) ──────────────
  const pl = (x: number, y: number, z: number, c: number, i: number, d: number) => { const l = new THREE.PointLight(c, i, d, 2); l.position.set(x, y, z); group.add(l); return l; };
  const beacons: THREE.PointLight[] = [];
  beacons.push(pl(OBJ.A.x, H(OBJ.A.x, OBJ.A.z) + 4, OBJ.A.z, 0x2ae6ff, 60, 26));
  beacons.push(pl(OBJ.B.x, H(OBJ.B.x, OBJ.B.z) + 4, OBJ.B.z, 0xc060ff, 60, 26));
  beacons.push(pl(OBJ.C.x, 6, OBJ.C.z, 0x2ae6ff, 80, 24));
  if (!lo) {
    pl(TITAN.x, H(TITAN.x, TITAN.z) + 15.5, TITAN.z, 0xffb060, 40, 20);
    pl(TITAN.x, H(TITAN.x, TITAN.z) + 8.5, TITAN.z, 0x40e0ff, 40, 20);
    pl(-50, 2.5, BRIDGE_Z, 0x2ae6ff, 50, 24);
    pl(37, 5, 0, 0xff9040, 30, 18);
    pl(27, 4, 58, 0x2ae6ff, 30, 16);
    pl(-30, 1.5, LOG_Z + 2, 0x60ffd0, 30, 18);
  }

  // enemy spots across the whole map
  const enemySpots = [
    [-120, -4], [-108, 14], [-92, -36], [-70, -50], [-60, 6], [-128, 28], [-84, 24], [-70, 36], [-40, 40], [-22, 54],
    [-38, -46], [-14, -30], [6, -28], [22, -44], [-6, -66], [16, -66], [36, -8], [40, 14], [62, -24], [62, 26],
    [20, 36], [34, 44], [14, 60], [0, 30], [-8, 24], [24, -10], [-26, 16], [-140, -30], [-140, 40], [-96, 56],
  ].map(([x, z]) => new THREE.Vector3(x, Math.max(H(x, z), -0.5) + 0.2, z));

  const controlPoints = [
    { id: 'A', name: 'Tech-Grove', pos: OBJ.A.clone().setY(H(OBJ.A.x, OBJ.A.z)), radius: 6 },
    { id: 'B', name: 'Glitched Canyon', pos: OBJ.B.clone().setY(H(OBJ.B.x, OBJ.B.z)), radius: 5 },
    { id: 'C', name: 'Server Complex', pos: OBJ.C.clone(), radius: 5 },
  ];

  // ── creatures (the level's turnarounds): the forest fights back with Electric Wolves, Venom Mantises and Plasma
  //    Wasps; a herd of Lumen Deer grazes the grove and bolts when you come close ───────────────────────────────
  preloadCreatures(['wolf', 'mantis', 'wasp', 'deer', 'bat']);
  const MUL: Partial<Record<CreatureKind, [number, number]>> = { wolf: [1.35, 0.8], mantis: [0.8, 1.5], wasp: [1.1, 0.6], deer: [1, 1], bat: [1.2, 0.7] };
  enemyBodies.make = (id, boss) => {
    const k: CreatureKind = boss ? 'mantis' : (['wolf', 'bat', 'wolf', 'mantis', 'wasp', 'bat'] as const)[id % 6];
    const b = new CreatureBody(k);
    if (!b.hover) walkers.push(b.root);
    const m = MUL[k] ?? [1, 1];
    return { root: b.root, hover: b.hover, height: b.height, speedMul: m[0], hpMul: m[1], update: (dt, sp) => b.update(dt, sp), attack: () => b.attack(), rig: b.rig };
  };
  type Deer = { b: CreatureBody; home: THREE.Vector3; tx: number; tz: number; wait: number; flee: number; speed: number };
  const herd: Deer[] = [];
  for (const [hx, hz] of [[-126, -34], [-118, 42], [-142, -64], [-76, -62], [-98, 62], [-130, 70]].slice(0, lo ? 3 : 6)) {
    for (let k = 0; k < 2 + Math.floor(R() * 2); k++) {
      const b = new CreatureBody('deer', 0.85 + R() * 0.3), x = hx + (R() - 0.5) * 8, z = hz + (R() - 0.5) * 8;
      b.root.position.set(x, H(x, z), z); b.root.rotation.y = R() * 6.28;
      group.add(b.root);
      herd.push({ b, home: new THREE.Vector3(hx, 0, hz), tx: x, tz: z, wait: R() * 6, flee: 0, speed: 0 });
    }
  }
  const deerOk = (x: number, z: number) => !inRiver(x, z, 2) && !inBuilding(x, z, 2) && !inCanyon(x, z, 0) && x > BOUND.x0 + 3 && x < BOUND.x1 - 3 && Math.abs(z) < BOUND.z1 - 3;
  const updateHerd = (dt: number) => {
    const pp = enemyBodies.playerPos;
    for (const d of herd) {
      const o = d.b.root.position;
      const toP = Math.hypot(pp.x - o.x, pp.z - o.z);
      if (toP < 13 && d.flee <= 0) { // bolt away from the player
        const a = Math.atan2(o.x - pp.x, o.z - pp.z) + (R() - 0.5) * 0.8;
        d.tx = o.x + Math.sin(a) * 22; d.tz = o.z + Math.cos(a) * 22; d.flee = 3 + R() * 1.5;
      }
      d.flee -= dt;
      const dx = d.tx - o.x, dz = d.tz - o.z, dist = Math.hypot(dx, dz);
      let want = 0;
      if (dist > 0.6) want = d.flee > 0 ? 8.5 : 1.3;
      else if ((d.wait -= dt) <= 0) { // graze, then amble somewhere new near home
        const a = R() * 6.28, r = 3 + R() * 10;
        d.tx = d.home.x + Math.sin(a) * r; d.tz = d.home.z + Math.cos(a) * r; d.wait = 3 + R() * 7;
      }
      d.speed += (want - d.speed) * Math.min(1, dt * (want > d.speed ? 3 : 4));
      if (dist > 0.01 && d.speed > 0.05) {
        const nx = o.x + dx / dist * d.speed * dt, nz = o.z + dz / dist * d.speed * dt;
        if (deerOk(nx, nz)) { o.x = nx; o.z = nz; } else { d.tx = d.home.x; d.tz = d.home.z; }
        const yaw = Math.atan2(dx, dz); let dy = yaw - d.b.root.rotation.y;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        d.b.root.rotation.y += dy * Math.min(1, dt * 5);
      }
      o.y += (H(o.x, o.z) - o.y) * Math.min(1, dt * 10);
      d.b.update(dt, d.speed);
    }
  };

  // the titan's lamps, the objective beacons and the bridge draw moths too
  glowSpots.push(new THREE.Vector3(TITAN.x + 8, H(TITAN.x, TITAN.z) + 7, TITAN.z), new THREE.Vector3(OBJ.A.x, H(OBJ.A.x, OBJ.A.z) + 1, OBJ.A.z),
    new THREE.Vector3(OBJ.B.x, H(OBJ.B.x, OBJ.B.z) + 1, OBJ.B.z), new THREE.Vector3(-50, 1, BRIDGE_Z));
  const moths = new MothSwarm(group, glowSpots, lo ? 20 : 40);

  void scene;
  let el = 0;
  return {
    enemySpots, controlPoints,
    async prepare(renderer: THREE.WebGPURenderer, camera: THREE.Camera) { await veg.prepare(renderer, camera); },
    update(dt, pulse) {
      el += dt;
      // the player, walking enemies and running deer lay the grass flat (the player first: it also pushes the plants)
      walkPos.length = 0;
      walkPos.push(enemyBodies.playerPos);
      for (let i = walkers.length - 1; i >= 0; i--) { const o = walkers[i]; if (!o.parent) { walkers.splice(i, 1); continue; } walkPos.push(o.getWorldPosition(new THREE.Vector3())); }
      for (const d of herd) if (d.speed > 0.3) walkPos.push(d.b.root.position);
      veg.update(dt, walkPos);
      updateHerd(dt);
      moths.update(dt);
      for (const c of glitchCubes) {
        c.rotation.x += dt * c.userData.spin; c.rotation.y += dt * c.userData.spin * 0.7;
        c.position.y = c.userData.y0 + Math.sin(el * 0.8 + c.userData.ph) * 0.5;
        // glitch: now and then a cube jumps sideways for a frame
        if (Math.sin(el * 7 + c.userData.ph * 13) > 0.995) c.position.x += (Math.random() - 0.5) * 0.6;
      }
      for (const b of beacons) b.intensity = 55 + pulse * 30;
      for (const l of spawnLights) l.intensity = 36 + pulse * 10;
    },
  };
}
