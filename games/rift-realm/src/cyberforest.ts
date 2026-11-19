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
  color, float, fract, max, mix, positionWorld, sin, smoothstep, texture as tslTexture, time, uniform, uv, vec2, vec3,
} from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { StaticKit, boulder, fbm3, rng } from './geom';
import { builders } from './structures';
import { pbr } from './textures';

const ART = '/games/rift-realm/assets/cyberforest/';
const loader = new THREE.TextureLoader();
const texCache = new Map<string, THREE.Texture>();
function art(file: string, srgb = true, repeat = false): THREE.Texture {
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
const SPR: Record<string, [number, number]> = {
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

function segDist(px: number, pz: number, pts: number[][]): { d: number; t: number } {
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
}

/** Tube with proper UVs (u round the bark, v up the trunk), r0 → r1 along the curve. */
function barkTube(curve: THREE.Curve<THREE.Vector3>, r0: number, r1: number, segs: number, radial: number, wobble: number, seed: number): THREE.BufferGeometry {
  const pos: number[] = [], uvs: number[] = [], idx: number[] = [];
  const frames = curve.computeFrenetFrames(segs, false);
  const L = curve.getLength(), circ = Math.PI * 2 * (r0 + r1) / 2;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, p = curve.getPoint(t), N = frames.normals[i], B = frames.binormals[i];
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
    ground.emissiveNode = g.mul(smoothstep(float(0.6), float(0.9), g.g)).mul(cyan).mul(float(0.28).add(uBeatPulse.mul(0.2)));
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
    panel.emissiveNode = c.mul(smoothstep(float(0.5), float(0.85), max(c.b, c.r))).mul(float(0.9).add(uBeatPulse.mul(0.6)));
  }
  const hull = new THREE.MeshStandardNodeMaterial({ map: pbr('volc-steel', { maps: [] }).map, color: 0x4d5862, roughness: 0.55, metalness: 0.75 });
  const trim = new THREE.MeshStandardNodeMaterial({ color: 0x03141a, roughness: 0.3 });
  trim.emissiveNode = cyan.mul(float(1.4).add(uBeatPulse.mul(1.6)));
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
    const water = new THREE.MeshStandardNodeMaterial({ color: 0x041820, roughness: 0.06, metalness: 0.3, transparent: true, opacity: 0.88 });
    const across = uv().x, along = uv().y.mul(10);
    const lane = fract(across.mul(9));
    const streak = smoothstep(float(0.46), float(0.5), lane).mul(smoothstep(float(0.54), float(0.5), lane));
    const pulse = smoothstep(float(0.7), float(0.98), fract(along.mul(0.08).sub(time.mul(0.25)).add(across.mul(7.3).floor().mul(0.37))));
    const mid = float(1).sub(across.sub(0.5).abs().mul(2)); // streaks run brightest down the middle
    water.emissiveNode = cyan.mul(streak.mul(pulse).mul(2.2).add(0.05)).mul(mid.mul(0.6).add(0.4)).add(color(0x0a5a7a).mul(0.12));
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
      };
      for (const d of ds) {
        seg(cur, d.at - d.w / 2, 0, h);
        seg(d.at - d.w / 2, d.at + d.w / 2, dh, h - dh); // lintel
        // door frame glow
        const fx = horiz ? d.at : fixed, fz = horiz ? fixed : d.at;
        for (const s of [-1, 1]) {
          const px = horiz ? fx + s * d.w / 2 : fx, pz = horiz ? fz : fz + s * d.w / 2;
          kit.box(d.choke ? hazard : trim, horiz ? 0.18 : t + 0.1, dh, horiz ? t + 0.1 : 0.18, px, dh / 2, pz, 0, { solid: false, shadow: false, tpm: 1 });
        }
        kit.box(d.choke ? hazard : trim, horiz ? d.w : t + 0.1, 0.18, horiz ? t + 0.1 : d.w, fx, dh, fz, 0, { solid: false, shadow: false, tpm: 1 });
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
    if (o.roof !== false) kit.box(mat, x1 - x0 + 0.8, 0.5, z1 - z0 + 0.8, (x0 + x1) / 2, h + 0.25, (z0 + z1) / 2, 0, { tpm: 0.3 });
  };
  const serverRack = (x: number, z: number, yaw: number, len = 5) => {
    kit.box(hull, 1.1, 2.4, len, x, 1.2, z, yaw, { tpm: 0.5 });
    for (const s of [-1, 1]) {
      const dx = Math.cos(yaw) * s * 0.57, dz = -Math.sin(yaw) * s * 0.57;
      kit.box(panel, 0.04, 2.0, len - 0.4, x + dx, 1.2, z + dz, yaw, { solid: false, shadow: false, tpm: 0.5 });
    }
    kit.box(trim, 1.15, 0.06, len, x, 2.43, z, yaw, { solid: false, shadow: false });
  };
  const crate = (x: number, z: number, yaw: number, stack = 1) => {
    for (let k = 0; k < stack; k++) {
      kit.box(hull, 1.8, 1.1, 1.2, x, 0.55 + k * 1.1, z, yaw + k * 0.2, { tpm: 0.6 });
      kit.box(trim, 1.82, 0.05, 1.22, x, 0.9 + k * 1.1, z, yaw + k * 0.2, { solid: false, shadow: false });
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
    kit.box(trim, 0.9, 6.8, 0.9, OBJ.C.x, 3.4, OBJ.C.z, Math.PI / 4, { solid: true });
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
    kit.box(trim, 0.8, 2.6, 0.8, 27, 1.3, 58, Math.PI / 4, { solid: true }); // the vault core
    for (const [x, z, st] of [[14, 36, 2], [22, 40, 1], [32, 38, 1], [38, 46, 2], [13, 56, 1], [39, 60, 1], [28, 44, 1]] as const) crate(x, z, R() * 0.5, st);
  }

  // Spawns: Attacker (W, blue) on a pad in the grove; Defender (E, orange) behind the defender block
  const spawnLights: THREE.PointLight[] = [];
  for (const [sp, col, face] of [[SPAWN_A, 0x2f9dff, 1], [SPAWN_B, 0xff8a2b, -1]] as const) {
    const pad = new THREE.MeshStandardNodeMaterial({ color: 0x030a10, roughness: 0.3 });
    pad.emissiveNode = color(col).mul(float(0.35).add(uBeatPulse.mul(0.4)));
    kit.box(mats.stone, 12, 0.4, 14, sp.x - face * 2, -0.05, sp.z, 0, { tpm: 0.4 });
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

  // ── forest trees: bark trunks with conduit veins + canopy card crowns cut from the tree turnarounds ───
  type Crown = { x: number; y: number; z: number; r: number; kind: number };
  const crowns: Crown[] = [];
  const tree = (x: number, z: number, h: number, r: number, kind: number) => {
    const gy = H(x, z), lean = new THREE.Vector3((R() - 0.5) * 0.12 * h, 0, (R() - 0.5) * 0.12 * h);
    const c = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, gy - 1, z), new THREE.Vector3(x + lean.x * 0.3, gy + h * 0.35, z + lean.z * 0.3),
      new THREE.Vector3(x + lean.x * 0.75, gy + h * 0.7, z + lean.z * 0.75), new THREE.Vector3(x + lean.x, gy + h, z + lean.z),
    ]);
    treeGeos.push(barkTube(c, r, r * 0.3, lo ? 8 : 12, lo ? 8 : 12, 0.3, x * 0.1 + z));
    const roots = lo ? 3 : 6;
    for (let k = 0; k < roots; k++) {
      const ra = (k / roots) * Math.PI * 2 + R(), len = r * (3 + R() * 3);
      const rc = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x + Math.sin(ra) * r * 0.5, gy + r * 1.8, z + Math.cos(ra) * r * 0.5),
        new THREE.Vector3(x + Math.sin(ra) * len * 0.5, gy + r * 0.4, z + Math.cos(ra) * len * 0.5),
        new THREE.Vector3(x + Math.sin(ra) * len, H(x + Math.sin(ra) * len, z + Math.cos(ra) * len) - 0.2, z + Math.cos(ra) * len),
      ]);
      rootGeos.push(barkTube(rc, r * 0.42, r * 0.08, 7, 6, 0.5, k + x));
    }
    for (let b = 0; b < 3; b++) { // a few limbs into the crown
      const ba = R() * 6.28, by = gy + h * (0.55 + R() * 0.25), bl = h * 0.28;
      const bc = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x + lean.x * 0.6, by, z + lean.z * 0.6),
        new THREE.Vector3(x + lean.x * 0.6 + Math.sin(ba) * bl, by + bl * 0.7, z + lean.z * 0.6 + Math.cos(ba) * bl),
      ]);
      rootGeos.push(barkTube(bc, r * 0.32, r * 0.1, 5, 6, 0.2, b + z));
    }
    crowns.push({ x: x + lean.x, y: gy + h * 0.92, z: z + lean.z, r: h * 0.36, kind });
  };
  const okForTree = (x: number, z: number) => !near(x, z, 7) && !inBuilding(x, z, 4) && !inRiver(x, z, 2) && !inCanyon(x, z, 1) &&
    Math.hypot(x - TITAN.x, z - TITAN.z) > 18 && Math.hypot(x - OBJ.A.x, z - OBJ.A.z) > 12 && x > BOUND.x0 + 2 && x < BOUND.x1 - 2 && Math.abs(z) < BOUND.z1 - 2;
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
    if (near(x, z, 6) || inBuilding(x, z, 3) || Math.abs(z - BRIDGE_Z) < 8 || Math.abs(z - LOG_Z) < 7 || Math.hypot(x - FORD.x, z - FORD.z) < 10 || Math.abs(z) > 82) continue;
    const h = 12 + R() * 8;
    tree(x, z, h, 0.6 + h * 0.04, R() < 0.6 ? 6 : 7);
  }
  {
    const tg = mergeGeometries(treeGeos.map((g) => g.index ? g.toNonIndexed() : g), false);
    if (tg) { const m = new THREE.Mesh(tg, bark); m.castShadow = true; m.receiveShadow = true; m.userData.collide = true; group.add(m); }
    const rg = mergeGeometries(rootGeos.map((g) => g.index ? g.toNonIndexed() : g), false);
    if (rg) { const m = new THREE.Mesh(rg, bark); m.castShadow = !lo; m.receiveShadow = true; group.add(m); }
  }
  // the titan's crown: its own big cluster
  crowns.push({ x: TITAN.x, y: H(TITAN.x, TITAN.z) + 38, z: TITAN.z, r: 17, kind: 0 });
  crowns.push({ x: TITAN.x + 6, y: H(TITAN.x, TITAN.z) + 33, z: TITAN.z - 5, r: 11, kind: 1 });
  crowns.push({ x: TITAN.x - 7, y: H(TITAN.x, TITAN.z) + 34, z: TITAN.z + 4, r: 11, kind: 2 });

  // canopy cards: each kind is one instanced mesh; cards sit on the crown's shell, facing out, slightly drooped
  const cardMat = (file: string, glow: number, tint = 0xffffff) => {
    const map = art(file);
    const m = new THREE.MeshStandardNodeMaterial({ map, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.85, color: tint });
    const c = tslTexture(map, uv()).rgb;
    // the sheets' cyan / violet pixels are the self-lit ones
    m.emissiveNode = c.mul(smoothstep(float(0.05), float(0.3), c.b.sub(c.r))).mul(glow).mul(float(1).add(uBeatPulse.mul(0.35)));
    return m;
  };
  {
    const perCrown = lo ? 14 : 30;
    for (let kind = 0; kind < 8; kind++) {
      const list = crowns.filter((c) => c.kind === kind);
      if (!list.length) continue;
      const [w, hgt] = SPR[`canopy_${kind}`];
      const geo = new THREE.PlaneGeometry(1, hgt / w);
      const mesh = new THREE.InstancedMesh(geo, cardMat(`canopy_${kind}.webp`, kind >= 3 && kind <= 5 ? 0.9 : 0.55, 0xd8e0e8), list.reduce((n, c) => n + Math.round(perCrown * Math.min(3, c.r / 7)), 0));
      let n = 0;
      for (const c of list) {
        const cnt = Math.round(perCrown * Math.min(3, c.r / 7));
        for (let i = 0; i < cnt; i++) {
          const th = R() * Math.PI * 2, ph = Math.acos(1 - R() * 1.3); // upper-heavy shell
          const rr = c.r * (0.55 + R() * 0.45);
          v.set(c.x + Math.sin(ph) * Math.cos(th) * rr, c.y + Math.cos(ph) * rr * 0.55 - c.r * 0.15, c.z + Math.sin(ph) * Math.sin(th) * rr);
          const sz = c.r * (0.7 + R() * 0.5);
          q.setFromEuler(e.set((R() - 0.5) * 0.5, -th + Math.PI / 2 + (R() - 0.5) * 0.8, (R() - 0.5) * 0.3, 'YXZ'));
          m4.compose(v, q, s3.set(sz, sz, sz));
          mesh.setMatrixAt(n++, m4);
        }
      }
      mesh.count = n; mesh.frustumCulled = false; mesh.castShadow = !lo;
      group.add(mesh);
    }
  }

  // ── undergrowth: cross-cards from the plant sprites ───────────────────────────────────────────────────
  const crossGeo = (aspect: number) => {
    const a = new THREE.PlaneGeometry(aspect, 1); a.translate(0, 0.5, 0);
    const parts = [a, a.clone().rotateY(Math.PI / 2)];
    const g = mergeGeometries(parts.map((p) => p.toNonIndexed()), false)!;
    const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) * 0.35, 1, n.getZ(i) * 0.35);
    return g;
  };
  const scatter = (name: string, count: number, place: () => [number, number] | null, sMin: number, sMax: number, glow = 0.7, sink = 0.05) => {
    const [w, h] = SPR[name];
    const mesh = new THREE.InstancedMesh(crossGeo(w / h), cardMat(`${name}.webp`, glow), count);
    let n = 0;
    for (let i = 0; i < count * 4 && n < count; i++) {
      const p = place(); if (!p) continue;
      const sz = sMin + R() * (sMax - sMin);
      m4.compose(v.set(p[0], H(p[0], p[1]) - sink * sz, p[1]), q.setFromEuler(e.set(0, R() * 6.28, 0)), s3.set(sz, sz, sz));
      mesh.setMatrixAt(n++, m4);
    }
    mesh.count = n; mesh.frustumCulled = false; mesh.receiveShadow = true;
    group.add(mesh);
  };
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
  const bank = (): [number, number] | null => {
    const t = R(), k = Math.min(RIVER.length - 2, Math.floor(t * (RIVER.length - 1))), f = t * (RIVER.length - 1) - k;
    const [ax, az] = RIVER[k], [bx, bz] = RIVER[k + 1], nx = -(bz - az), nz = bx - ax, nl = Math.hypot(nx, nz), side = R() < 0.5 ? -1 : 1;
    const x = ax + (bx - ax) * f + nx / nl * side * (RIVER_HALF + 0.5 + R() * 4), z = az + (bz - az) * f + nz / nl * side * (RIVER_HALF + 0.5 + R() * 4);
    return inBuilding(x, z, 1) || Math.abs(z - BRIDGE_Z) < 4 || Math.abs(z) > 84 ? null : [x, z];
  };
  const k = lo ? 0.35 : 1;
  scatter('grass_a', Math.round(700 * k), grove, 0.7, 1.3, 0.9);
  scatter('grass_b', Math.round(500 * k), anywhere, 0.7, 1.4, 0.9);
  scatter('grass_c', Math.round(400 * k), grove, 0.8, 1.5, 0.9);
  scatter('grass_d', Math.round(300 * k), bank, 0.8, 1.5, 0.9);
  scatter('fern_a', Math.round(420 * k), byTrees, 1.2, 2.4, 0.5);
  scatter('fern_b', Math.round(260 * k), grove, 0.9, 1.8, 0.5);
  scatter('fern_c', Math.round(160 * k), byTrees, 0.9, 1.6, 0.7);
  scatter('bush_a', Math.round(220 * k), anywhere, 1.0, 1.8, 0.6);
  scatter('bush_b', Math.round(160 * k), byTrees, 1.0, 1.9, 0.6);
  scatter('shroom_a', Math.round(90 * k), byTrees, 1.0, 2.4, 1.1, 0.1);
  scatter('shroom_b', Math.round(70 * k), grove, 0.9, 2.0, 1.1, 0.1);
  scatter('toadstool', Math.round(40 * k), byTrees, 1.2, 2.6, 0.6, 0.06);
  scatter('shroom_tall', Math.round(30 * k), grove, 2.6, 4.8, 1.0, 0.03);
  scatter('spore_pod', Math.round(24 * k), grove, 2.2, 4.0, 0.9, 0.03);
  scatter('flower_a', Math.round(60 * k), grove, 1.0, 2.0, 1.0, 0.05);
  scatter('flower_b', Math.round(50 * k), anywhere, 1.0, 1.8, 1.0, 0.05);
  scatter('crystal_plant', Math.round(40 * k), () => { const p = anywhere(3); return p && inCanyon(p[0], p[1], 6) ? p : null; }, 1.6, 3.2, 1.0);
  scatter('carnivore', Math.round(16 * k), grove, 2.2, 3.4, 0.7, 0.04);
  scatter('resin_stump', Math.round(14 * k), byTrees, 1.4, 2.4, 0.4, 0.08);
  // hanging vines under the crowns (single planes, face random)
  {
    for (const [name, frac] of [['vine_a', 0.4], ['vine_b', 0.3], ['vine_c', 0.3]] as const) {
      const [w, h] = SPR[name], cnt = Math.round((lo ? 70 : 220) * frac);
      const g = new THREE.PlaneGeometry(w / h, 1); g.translate(0, -0.5, 0);
      const mesh = new THREE.InstancedMesh(g, cardMat(`${name}.webp`, 0.9), cnt);
      for (let i = 0; i < cnt; i++) {
        const c = crowns[Math.floor(R() * crowns.length)], a = R() * 6.28, d = c.r * (0.2 + R() * 0.6), sz = 3 + R() * 5;
        m4.compose(v.set(c.x + Math.sin(a) * d, c.y - c.r * 0.2, c.z + Math.cos(a) * d), q.setFromEuler(e.set(0, R() * 6.28, 0)), s3.set(sz, sz, sz));
        mesh.setMatrixAt(i, m4);
      }
      mesh.frustumCulled = false; group.add(mesh);
    }
  }

  // ── the forest wall: whole-tree cards on the edge hills, so the map sits inside a deep forest ─────────
  {
    const names = ['tree_blue_a', 'tree_blue_b', 'tree_blue_c', 'tree_violet_a', 'tree_violet_b', 'tree_violet_c', 'tree_willow', 'tree_mangrove'];
    const per = lo ? 20 : 44;
    for (const [i, name] of names.entries()) {
      const [w, h] = SPR[name];
      const mesh = new THREE.InstancedMesh(crossGeo(w / h), cardMat(`${name}.webp`, i >= 3 && i <= 5 ? 0.8 : 0.4, 0xb8c8d0), per);
      for (let j = 0; j < per; j++) {
        // walk the boundary, 6–40 m outside it
        const t = R(), out = 4 + R() * 36;
        const per4 = t * 4, side = Math.floor(per4), f = per4 - side;
        let x: number, z: number;
        if (side === 0) { x = BOUND.x0 + f * (BOUND.x1 - BOUND.x0); z = BOUND.z0 - out; }
        else if (side === 1) { x = BOUND.x1 + out; z = BOUND.z0 + f * (BOUND.z1 - BOUND.z0); }
        else if (side === 2) { x = BOUND.x0 + f * (BOUND.x1 - BOUND.x0); z = BOUND.z1 + out; }
        else { x = BOUND.x0 - out; z = BOUND.z0 + f * (BOUND.z1 - BOUND.z0); }
        const sz = 22 + R() * 22;
        m4.compose(v.set(x, H(x, z) - 1, z), q.setFromEuler(e.set(0, R() * 6.28, 0)), s3.set(sz, sz, sz));
        mesh.setMatrixAt(j, m4);
      }
      mesh.frustumCulled = false;
      group.add(mesh);
    }
  }
  // invisible fence just inside the edge hills
  for (const [cx, cz, w, d] of [[(BOUND.x0 + BOUND.x1) / 2, BOUND.z0 - 3, BOUND.x1 - BOUND.x0 + 12, 1], [(BOUND.x0 + BOUND.x1) / 2, BOUND.z1 + 3, BOUND.x1 - BOUND.x0 + 12, 1], [BOUND.x0 - 3, 0, 1, BOUND.z1 - BOUND.z0 + 12], [BOUND.x1 + 3, 0, 1, BOUND.z1 - BOUND.z0 + 12]] as const) {
    kit.box(B.invisible, w, 60, d, cx, 20, cz, 0, { shadow: false });
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

  void scene;
  let el = 0;
  return {
    enemySpots, controlPoints,
    update(dt, pulse) {
      el += dt;
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
