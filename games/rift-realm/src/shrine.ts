// Level 1 — the Cyber-Forest Shrine Arena.
// Built from "Cyber-Forest Arena | Level Design Blueprint | Compact 3v3" (octagonal arena: team spawns W/E, raised ring with four
// stairways, central octagonal battle pit with the mega power-up node, ruined cover on the diagonals, high-ground bridge/gallery)
// and dressed after "Cyber forest central shrine arena" / "Firefight in cyber forest chapel": mossy flagstones with cyan rune
// veins, a glowing crystal monolith ringed by rune pillars, ancient ruined arches, giant roots + bioluminescent cables, fog and god rays.
import * as THREE from 'three/webgpu';
import {
  color, float, length, smoothstep, texture as tslTexture, time, uniform, uv, vec2, positionWorld, sin,
} from 'three/tsl';
import { mrt as tslMrt, output as tslOutput, vec4 as tslVec4 } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { StaticKit, boulder, fbm3, octagon, polyPrism, rng, taperTube } from './geom';
import { circuitTexture, fernTexture, grassTexture, leafTexture, mossTexture, pbr } from './textures';

export interface LevelInfo { id: string; name: string; track: 'main' | 'combat'; accentHex: number }
export interface Level {
  group: THREE.Group;
  uBeatPulse: { value: number };
  gates: never[];
  traps: never[];
  biomeIndex: number;
  info: LevelInfo;
  spawns: { a: { pos: THREE.Vector3; yaw: number }; b: { pos: THREE.Vector3; yaw: number } };
  /** Open ground points enemies may spawn at. */
  enemySpots: THREE.Vector3[];
  /** Falling below this height (lava, abyss) hurts. */
  hazardBelow?: number;
  /** Control points for Team Arena / Battleground modes. */
  controlPoints?: { id: string; name: string; pos: THREE.Vector3; radius: number }[];
  setBiome(index: number): { name: string; track: 'main' | 'combat' };
  update(dt: number, pulse: number, beatIndex: number): void;
  resolveDynamicGates(pos: THREE.Vector3, radius: number): void;
}

const APO = 20.33; // lower arena apothem (flat to centre)
const R_OUT = APO / Math.cos(Math.PI / 8);
const RING_IN = 8.0, RING_OUT = 13.5, RING_H = 1.8, PIT_Y = 0.25;
const toR = (apo: number) => apo / Math.cos(Math.PI / 8);

export type Tier = 'low' | 'high';

export function buildShrine(scene: THREE.Scene, tier: Tier = 'high'): Level {
  const lo = tier === 'low';
  const group = new THREE.Group();
  const uBeatPulse = uniform(0);
  const kit = new StaticKit();
  const R = rng(1337);

  // ── materials (all from the art folder's PBR sheets) ───────────────────────────────────────────────────
  const uRune = uniform(new THREE.Color(0x24e8ff));
  const floorMat = pbr('volc-basalt', { maps: ['normal', 'roughness', 'ao', 'emissive'], tint: 0x9fb0aa, emissiveIntensity: 1.5, normalScale: 1.1 });
  const wallMat = pbr('glacial-brick', { maps: ['normal', 'roughness', 'ao'], tint: 0x6e8271, normalScale: 1.2 });
  const stoneMat = pbr('volc-basalt', { maps: ['normal', 'roughness', 'ao'], tint: 0x7f8c86, normalScale: 1.2 });
  const mudMat = pbr('marsh-mud', { maps: ['normal', 'roughness'], tint: 0x8aa08a, normalScale: 1.0 });
  const steelMat = new THREE.MeshStandardNodeMaterial({ map: pbr('volc-steel', { maps: [] }).map, color: 0x7d8a92, roughness: 0.5, metalness: 0.85 });
  // floor runes pulse on the beat, tinted by the level accent
  const floorEmissive = tslTexture(floorMat.emissiveMap!, uv()).rgb;
  floorMat.emissiveNode = floorEmissive.mul(uRune).mul(float(0.45).add(uBeatPulse.mul(0.9)));

  const circuit = circuitTexture(7);
  const pillarMat = new THREE.MeshStandardNodeMaterial({ map: stoneMat.map, normalMap: stoneMat.normalMap, roughnessMap: stoneMat.roughnessMap, color: 0x7b8a84, roughness: 1 });
  pillarMat.emissiveNode = tslTexture(circuit, uv().mul(float(0.5))).rgb.mul(uRune).mul(float(0.55).add(uBeatPulse.mul(0.7)));
  const cableMat = new THREE.MeshStandardNodeMaterial({ color: 0x06090a, roughness: 0.35, metalness: 0.4 });
  const cableGlow = tslTexture(circuit, uv());
  cableMat.emissiveNode = cableGlow.rgb.mul(uRune).mul(float(1.2).add(sin(time.mul(2.0).add(positionWorld.y.mul(0.9))).mul(0.8)));
  const crystalMat = new THREE.MeshStandardNodeMaterial({ color: 0x083a40, roughness: 0.08, metalness: 0.1 });
  crystalMat.emissiveNode = uRune.mul(float(0.9).add(uBeatPulse.mul(1.4)));
  const barkMat = pbr('marsh-mud', { maps: ['normal', 'roughness'], tint: 0x4a4a40, normalScale: 1.4 });

  // ── ground: lower octagon, rim apron, forest floor ─────────────────────────────────────────────────────
  kit.prism(floorMat, 8, R_OUT, R_OUT, 1.5, 0, -1.5, 0, Math.PI / 8, { tpm: 0.42 });
  kit.prism(mudMat, 48, 80, 80, 1.2, 0, -2.0, 0, 0, { tpm: 0.18, solid: true });

  // ── raised ring (blueprint "upper platform"): flagstone top, brick retaining walls ────────────────────
  const outer = octagon(toR(RING_OUT)), inner = octagon(toR(RING_IN));
  const ring = polyPrism(outer, [inner], 0, RING_H);
  kit.add(floorMat, ring.top, { tpm: 0.42 });
  kit.add(wallMat, ring.sides, { tpm: 0.5 });
  // ring lip: a chamfered coping all round the top edge
  const lipO = octagon(toR(RING_OUT + 0.18)), lipI = octagon(toR(RING_OUT - 0.25));
  const lip = polyPrism(lipO, [lipI], RING_H, RING_H + 0.16);
  kit.add(stoneMat, lip.top, { tpm: 0.5 }); kit.add(stoneMat, lip.sides, { tpm: 0.5 });
  const lipO2 = octagon(toR(RING_IN + 0.25)), lipI2 = octagon(toR(RING_IN - 0.18));
  const lip2 = polyPrism(lipO2, [lipI2], RING_H, RING_H + 0.16);
  kit.add(stoneMat, lip2.top, { tpm: 0.5 }); kit.add(stoneMat, lip2.sides, { tpm: 0.5 });

  // ── central pit ───────────────────────────────────────────────────────────────────────────────────────
  kit.prism(floorMat, 8, toR(RING_IN), toR(RING_IN), PIT_Y + 1.5, 0, -1.5, 0, Math.PI / 8, { tpm: 0.4 });
  kit.prism(stoneMat, 8, toR(3.6), toR(3.8), 0.45, 0, PIT_Y, 0, Math.PI / 8, { tpm: 0.5 });
  kit.prism(floorMat, 8, toR(2.7), toR(2.9), 0.4, 0, PIT_Y + 0.45, 0, Math.PI / 8, { tpm: 0.5 });
  // glowing inlay rings on the pit floor
  const inlay = new THREE.MeshStandardNodeMaterial({ color: 0x03161a, roughness: 0.4 });
  inlay.emissiveNode = uRune.mul(float(1.6).add(uBeatPulse.mul(2.4)));
  for (const apo of [5.2, 6.6]) {
    const oo = octagon(toR(apo + 0.07)), ii = octagon(toR(apo - 0.07));
    const strip = polyPrism(oo, [ii], 0, PIT_Y + 0.012);
    kit.add(inlay, strip.top, { solid: false, shadow: false, tpm: 1 });
  }
  for (let k = 0; k < 8; k++) { // spokes
    const a = k * Math.PI / 4;
    kit.box(inlay, 0.12, 0.02, 2.4, Math.sin(a) * 4.45, PIT_Y + 0.01, Math.cos(a) * 4.45, a, { solid: false, shadow: false, tpm: 1 });
  }

  // ── stairways: lower → ring (outside) and ring → pit (inside) on the four cardinals ───────────────────
  const rampMat = new THREE.MeshBasicNodeMaterial({ visible: false });
  /** Invisible collision ramp from (d0,y0) to (d1,y1) measured along dirYaw from (x0,z0); its top surface passes through both points. */
  const ramp = (x0: number, z0: number, dirYaw: number, width: number, d0: number, y0: number, d1: number, y1: number) => {
    const dx = Math.sin(dirYaw), dz = Math.cos(dirYaw), h = d1 - d0;
    const len = Math.hypot(h, y1 - y0);
    const g = new THREE.BoxGeometry(width - 0.1, 0.2, len);
    kit.place(g, x0 + dx * (d0 + d1) / 2, (y0 + y1) / 2 - 0.1, z0 + dz * (d0 + d1) / 2, dirYaw, -Math.atan2(y1 - y0, h));
    kit.add(rampMat, g, { shadow: false });
  };
  const stairs = (x0: number, z0: number, dirYaw: number, width: number, steps: number, rise: number, run: number, baseY: number, mat: THREE.Material, ascending: boolean) => {
    // direction vector the stairs rise toward
    const dx = Math.sin(dirYaw), dz = Math.cos(dirYaw);
    for (let i = 0; i < steps; i++) {
      const topY = baseY + (ascending ? (i + 1) * rise : (steps - i) * rise);
      const h = topY - (baseY - 1.5);
      const d = run * i + run / 2;
      kit.box(mat, width, h, run, x0 + dx * d, baseY - 1.5 + h / 2, z0 + dz * d, dirYaw, { tpm: 0.5 });
    }
    // invisible glide ramp through the step noses so the capsule slides up/down instead of snagging on risers
    if (ascending) ramp(x0, z0, dirYaw, width, 0, baseY + rise, (steps - 0.5) * run, baseY + steps * rise);
    else ramp(x0, z0, dirYaw, width, run, baseY + steps * rise, steps * run, baseY + rise);
  };
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2; // 0: +z(S) … outward direction (sx,sz)
    const sx = Math.sin(a), sz = Math.cos(a);
    // outside: starts RING_OUT+2.7 out, rises toward centre
    stairs(sx * (RING_OUT + 2.7), sz * (RING_OUT + 2.7), a + Math.PI, 5.2, 6, 0.3, 0.45, 0, stoneMat, true);
    // inside: from ring inner edge descending toward centre into the pit
    stairs(sx * (RING_IN - 0.02), sz * (RING_IN - 0.02), a + Math.PI, 5.2, 6, (RING_H - PIT_Y) / 6, 0.5, PIT_Y, stoneMat, false);
    // newel posts flanking the outside flight
    for (const s of [-1, 1]) {
      const px = sx * (RING_OUT + 1.2) + Math.cos(a) * s * 2.85, pz = sz * (RING_OUT + 1.2) - Math.sin(a) * s * 2.85;
      kit.box(wallMat, 0.7, 1.7, 3.0, px, 0.85, pz, a + Math.PI, { tpm: 0.5 });
      kit.box(stoneMat, 0.9, 0.18, 3.2, px, 1.76, pz, a + Math.PI, { tpm: 0.5 });
    }
  }

  // ── rune pillars round the pit + the monolith ─────────────────────────────────────────────────────────
  for (let k = 0; k < 8; k++) {
    const a = Math.PI / 8 + k * Math.PI / 4, px = Math.sin(a) * 6.0, pz = Math.cos(a) * 6.0;
    const broken = k % 3 === 1;
    const h = broken ? 2.6 + R() * 0.9 : 4.4;
    kit.box(stoneMat, 1.5, 0.5, 1.5, px, PIT_Y + 0.25, pz, a, { tpm: 0.5 });
    kit.box(pillarMat, 1.05, h, 1.05, px, PIT_Y + 0.5 + h / 2, pz, a, { tpm: 0.6 });
    kit.box(stoneMat, 1.3, 0.28, 1.3, px, PIT_Y + 0.5 + h + (broken ? 0 : 0.14), pz, a + (broken ? 0.12 : 0), { tpm: 0.5, rz: broken ? 0.2 : 0, rx: broken ? 0.1 : 0 });
  }
  // fallen slabs round the pit base = low cover
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2 + 0.05;
    kit.box(stoneMat, 2.6, 0.9, 0.9, Math.sin(a) * 5.0, PIT_Y + 0.55, Math.cos(a) * 5.0, a + 1.57, { tpm: 0.5, rz: 0.07 });
  }
  // the monolith: a cluster of tilted hex-crystals
  const mono = new THREE.Group();
  mono.position.set(0, PIT_Y + 0.85, 0);
  group.add(mono);
  const crystalGeo = (rad: number, h: number) => {
    const g = new THREE.CylinderGeometry(rad * 0.2, rad, h, 6, 1);
    g.translate(0, h / 2, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > h * 0.98) p.setXYZ(i, p.getX(i) * 0.12, h * 1.14, p.getZ(i) * 0.12);
    g.computeVertexNormals();
    return g;
  };
  const shards = [[0, 0, 0, 0.9, 6.2, 0, 0], [0.8, 0, 0.2, 0.55, 3.6, 0.35, -0.5], [-0.7, 0, -0.3, 0.5, 3.2, -0.3, 0.6], [0.2, 0, -0.9, 0.45, 2.7, -0.5, 0.1], [-0.2, 0, 0.9, 0.5, 2.4, 0.45, -0.2]];
  for (const [x, y, z, r, h, rx, rz] of shards) {
    const m = new THREE.Mesh(crystalGeo(r, h), crystalMat);
    m.position.set(x, y, z); m.rotation.set(rx, 0, rz);
    mono.add(m);
  }
  const monoCollide = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 6, 8), new THREE.MeshBasicNodeMaterial({ visible: false }));
  monoCollide.position.set(0, PIT_Y + 3, 0);
  monoCollide.userData.collide = true;
  group.add(monoCollide);
  // light beam
  const beamMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  beamMat.colorNode = uRune;
  beamMat.opacityNode = smoothstep(float(1.0), float(0.0), uv().y).mul(0.16).mul(float(0.8).add(uBeatPulse.mul(0.5)));
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 2.4, 34, 24, 1, true), beamMat);
  beam.position.set(0, PIT_Y + 18, 0);
  beam.renderOrder = 5;
  group.add(beam);
  // power-up node ring
  const nodeMat = new THREE.MeshStandardNodeMaterial({ color: 0x03161a, roughness: 0.2 });
  nodeMat.emissiveNode = color(0xffc04a).mul(float(1.6).add(uBeatPulse.mul(3)));
  const node = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.07, 10, 48), nodeMat);
  node.rotation.x = Math.PI / 2; node.position.set(0, PIT_Y + 0.92, 0);
  group.add(node);

  // ── ruined cover on the lower ring: broken walls + arches on the diagonals, boulders between ──────────
  const brokenWall = (cx: number, cz: number, yaw: number, len: number, h: number, seed: number) => {
    const n = Math.round(len / 0.9);
    for (let i = 0; i < n; i++) {
      const t = (i - (n - 1) / 2) * 0.9;
      const hh = Math.max(0.5, h * (0.45 + fbm3(i * 0.9 + seed, 0, seed) * 0.8) - (i === 0 || i === n - 1 ? 0.5 : 0));
      const ox = Math.cos(yaw) * t, oz = -Math.sin(yaw) * t;
      kit.box(wallMat, 0.9, hh, 1.05, cx + ox, hh / 2, cz + oz, yaw + (R() - 0.5) * 0.05, { tpm: 0.5 });
    }
    // rubble spill
    for (let i = 0; i < 4; i++) {
      const g = boulder(0.28 + R() * 0.2, seed + i, 1);
      kit.place(g, cx + (R() - 0.5) * len, 0.16, cz + (R() - 0.5) * 1.6, R() * 6);
      kit.add(stoneMat, g, { tpm: 0.7, shadow: false });
    }
  };
  const arch = (cx: number, cz: number, yaw: number, gap: number, h: number, broken: boolean) => {
    const dx = Math.cos(yaw), dz = -Math.sin(yaw);
    for (const s of [-1, 1]) {
      const px = cx + dx * s * (gap / 2 + 0.55), pz = cz + dz * s * (gap / 2 + 0.55);
      const ph = broken && s > 0 ? h * 0.62 : h;
      kit.box(wallMat, 1.1, ph, 1.1, px, ph / 2, pz, yaw, { tpm: 0.5 });
      kit.box(stoneMat, 1.4, 0.3, 1.4, px, 0.15, pz, yaw, { tpm: 0.5 });
      kit.box(stoneMat, 1.3, 0.24, 1.3, px, ph + 0.12, pz, yaw, { tpm: 0.5 });
    }
    if (!broken) {
      // pointed arch: stack of voussoir blocks
      const steps = 9;
      for (let i = 0; i < steps; i++) {
        const t = (i + 0.5) / steps, ang = Math.PI * t;
        const rx = Math.cos(ang) * (gap / 2 + 0.05), ry = Math.sin(ang) * (gap / 2 + 0.55);
        kit.box(wallMat, 0.9, 0.7, 1.1, cx + dx * rx, h + 0.1 + ry, cz + dz * rx, yaw, { tpm: 0.5, rz: 0 });
      }
    }
  };
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2;
    const sx = Math.sin(a), sz = Math.cos(a);
    brokenWall(sx * 16.9, sz * 16.9, a + Math.PI / 2, 6.0, 2.3, 10 + k * 7);
    arch(sx * 19.2, sz * 19.2, a + Math.PI / 2, 3.2, 3.9, k % 2 === 1);
    // flank low cover either side of the cardinal stairs
    for (const s of [-1, 1]) {
      const b = boulder(1.15 + R() * 0.4, 40 + k * 3 + s, 3);
      const ax = sx * 15.4, az = sz * 15.4;
      kit.place(b, ax + Math.cos(a) * s * 5.8 * 0, 0.52, az, R() * 6);
      // keep cardinals clear: boulders sit between the stairs and the diagonals
    }
  }
  for (let k = 0; k < 8; k++) { // boulders between stairs and diagonals, mossy low cover
    const a = Math.PI / 8 + k * Math.PI / 4;
    const rr = 15.6 + R() * 1.5;
    const g = boulder(1.0 + R() * 0.55, 90 + k, 3);
    kit.place(g, Math.sin(a) * rr, 0.42, Math.cos(a) * rr, R() * 6);
    kit.add(stoneMat, g, { tpm: 0.55 });
  }
  // low broken walls on the raised ring = high-ground cover
  for (let k = 0; k < 8; k++) {
    const a = Math.PI / 8 + k * Math.PI / 4;
    brokenWall(Math.sin(a) * 11.3, Math.cos(a) * 11.3, a + Math.PI / 2, 3.4, 1.2, 200 + k);
  }

  // ── perimeter: ancient ruin walls with arched windows; W/E are the spawn gateways ─────────────────────
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4; // flat centred at angle a (0 = +z)
    if (k === 2 || k === 6) continue; // E / W spawn openings
    const sx = Math.sin(a), sz = Math.cos(a);
    const wx = sx * (APO + 0.55), wz = sz * (APO + 0.55);
    const yaw = a;
    const dx = Math.cos(a), dz = -Math.sin(a);
    const L = 16.2;
    kit.box(wallMat, L, 1.6, 1.3, wx, 0.8, wz, yaw, { tpm: 0.5 });
    for (let i = 0; i < 4; i++) {
      const o = (i - 1.5) * (L / 3.6);
      const ph = 6.6 + (i % 2) * 0.7 - (k % 3 === 0 && i === 3 ? 2.4 : 0);
      kit.box(pillarMat, 1.35, ph, 1.35, wx + dx * o, ph / 2, wz + dz * o, yaw, { tpm: 0.6 });
      kit.box(stoneMat, 1.7, 0.28, 1.7, wx + dx * o, 0.14, wz + dz * o, yaw, { tpm: 0.5 });
      if (i < 3) {
        const mid = o + L / 7.2;
        for (let j = 0; j < 7; j++) { // arch voussoirs
          const ang = Math.PI * (j + 0.5) / 7, half = L / 7.2 / 2 - 0.5;
          kit.box(wallMat, 0.85, 0.75, 1.2, wx + dx * (mid + Math.cos(ang) * half), 4.1 + Math.sin(ang) * 1.5, wz + dz * (mid + Math.cos(ang) * half), yaw, { tpm: 0.5 });
        }
        kit.box(wallMat, L / 3.6 - 1.5, 1.6, 1.2, wx + dx * mid, 5.6 + 0.2, wz + dz * mid, yaw, { tpm: 0.5 });
      }
    }
    // upper cornice
    kit.box(stoneMat, L, 0.5, 1.7, wx, 6.9, wz, yaw, { tpm: 0.5, shadow: false });
  }
  // invisible barrier round the arena, except through the spawn gateways
  for (let k = 0; k < 8; k++) {
    if (k === 2 || k === 6) continue;
    const a = k * Math.PI / 4;
    kit.box(rampMat, 17.2, 14, 0.6, Math.sin(a) * (APO + 0.6), 7, Math.cos(a) * (APO + 0.6), a, { shadow: false });
  }

  // ── spawn alcoves (blueprint: Team A west / Team B east) ──────────────────────────────────────────────
  const makePortal = (hex: number) => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    m.colorNode = color(hex).mul(float(1.0).add(sin(uv().y.mul(18).sub(time.mul(2.5))).mul(0.25)));
    m.opacityNode = smoothstep(float(0.0), float(0.18), uv().y).mul(0.55);
    return m;
  };
  const portalA = makePortal(0x2f9dff), portalB = makePortal(0xff8a2b);
  const padA = new THREE.MeshStandardNodeMaterial({ color: 0x021018, roughness: 0.3 }); padA.emissiveNode = color(0x2f9dff).mul(float(1.4).add(uBeatPulse.mul(1.5)));
  const padB = new THREE.MeshStandardNodeMaterial({ color: 0x180a02, roughness: 0.3 }); padB.emissiveNode = color(0xff8a2b).mul(float(1.4).add(uBeatPulse.mul(1.5)));
  const spawnLights: THREE.PointLight[] = [];
  for (const [side, mat, pad, portal, col] of [[-1, floorMat, padA, portalA, 0x2f9dff], [1, floorMat, padB, portalB, 0xff8a2b]] as const) {
    const ox = side * (APO + 0.5);
    // floor pad extends out of the arena
    kit.box(mat, 6.6, 1.5, 9.0, ox + side * 3.0, -0.75, 0, 0, { tpm: 0.42 });
    kit.box(pad, 4.4, 0.04, 4.4, ox + side * 2.8, 0.02, 0, 0, { solid: false, shadow: false, tpm: 1 });
    // side + back walls
    kit.box(wallMat, 6.6, 6.2, 1.2, ox + side * 3.0, 3.1, 4.9, 0, { tpm: 0.5 });
    kit.box(wallMat, 6.6, 6.2, 1.2, ox + side * 3.0, 3.1, -4.9, 0, { tpm: 0.5 });
    kit.box(wallMat, 1.2, 6.2, 9.0, ox + side * 6.3, 3.1, 0, 0, { tpm: 0.5 });
    // gateway frame onto the arena
    kit.box(pillarMat, 1.3, 6.4, 1.3, ox, 3.2, 3.1, 0, { tpm: 0.6 });
    kit.box(pillarMat, 1.3, 6.4, 1.3, ox, 3.2, -3.1, 0, { tpm: 0.6 });
    kit.box(wallMat, 1.4, 1.0, 8.0, ox, 6.3, 0, 0, { tpm: 0.5 });
    // portal sheet on the back wall
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 5.2), portal);
    sheet.position.set(ox + side * 5.65, 2.8, 0);
    sheet.rotation.y = side * -Math.PI / 2;
    group.add(sheet);
    const l = new THREE.PointLight(col, 18, 16, 2);
    l.position.set(ox + side * 3.0, 2.8, 0);
    if (!lo) { group.add(l); spawnLights.push(l); }
  }

  // ── elevated gallery (blueprint "high-ground bridge"): steel overlooks on the N + S walls ─────────────
  for (const side of [-1, 1]) {
    const dz = side * 17.7;
    kit.box(steelMat, 14.4, 0.25, 3.1, 0, 3.3, dz, 0, { tpm: 0.5 });
    for (const x of [-5.9, -2, 2, 5.9]) kit.box(steelMat, 0.28, 3.3, 0.28, x, 1.65, dz - side * 1.35, 0, { tpm: 1 });
    for (let i = 0; i <= 12; i++) kit.box(steelMat, 0.07, 1.0, 0.07, -6.2 + i * 1.03, 3.93, dz - side * 1.45, 0, { tpm: 1, shadow: false });
    kit.box(steelMat, 12.4, 0.07, 0.07, 0, 4.4, dz - side * 1.45, 0, { tpm: 1, shadow: false });
    // cover walls on the deck + stairs up at both ends
    kit.box(wallMat, 2.4, 0.9, 0.4, 0, 3.9, dz - side * 1.3, 0, { tpm: 0.5 });
    for (const sx of [-1, 1]) {
      const steps = 12, rise = 3.3 / steps, run = 0.34;
      for (let i = 0; i < steps; i++) {
        const z = side * (13.6 + i * run) + side * run / 2;
        // stair rises away from centre-ring toward the wall
        kit.box(steelMat, 1.5, 0.12, run + 0.02, sx * 7.4, (i + 1) * rise, z, 0, { tpm: 1 });
      }
      kit.box(steelMat, 0.1, 3.3, 4.2, sx * 8.2, 1.65, side * 15.6, 0, { tpm: 1, shadow: false });
      ramp(sx * 7.4, side * 13.6, side > 0 ? 0 : Math.PI, 1.5, 0, rise, (steps - 1) * run, steps * rise);
    }
  }

  kit.build(group);

  // ── moss ground decals (soft alpha patches that hide the tile repeat) ────────────────────────────────
  const mossMat = new THREE.MeshStandardNodeMaterial({ map: mossTexture(), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
  const mossGeo = new THREE.PlaneGeometry(1, 1); mossGeo.rotateX(-Math.PI / 2);
  const mossCount = lo ? 50 : 150;
  const mossMesh = new THREE.InstancedMesh(mossGeo, mossMat, mossCount);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < mossCount; i++) {
    const a = R() * Math.PI * 2, rr = 7 + Math.sqrt(R()) * 14;
    const x = Math.sin(a) * rr, z = Math.cos(a) * rr;
    const onRing = rr > RING_IN - 0.5 && rr < RING_OUT + 1.0;
    const y = onRing && (Math.abs(x) < 2.7 || Math.abs(z) < 2.7) ? 0 : (rr > RING_IN && rr < RING_OUT ? RING_H + 0.17 : 0.01);
    if (rr < RING_IN) continue;
    const s = 2.2 + R() * 3.4;
    m4.compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set(0, R() * 6.28, 0)), new THREE.Vector3(s, 1, s));
    mossMesh.setMatrixAt(i, m4);
  }
  mossMesh.receiveShadow = true; mossMesh.frustumCulled = false;
  group.add(mossMesh);

  // ── foliage: ferns + grass tufts (instanced alpha cards) ─────────────────────────────────────────────
  const cross = (w: number, h: number) => {
    const a = new THREE.PlaneGeometry(w, h); a.translate(0, h / 2, 0);
    const b = a.clone(); b.rotateY(Math.PI / 2);
    const c2 = a.clone(); c2.rotateY(Math.PI / 4);
    const merged = [a, b, c2].map((g) => { const ng = g.index ? g.toNonIndexed() : g; return ng; });
    const pos: number[] = [], nor: number[] = [], uvs: number[] = [];
    for (const g of merged) { pos.push(...(g.attributes.position.array as any)); nor.push(...(g.attributes.normal.array as any)); uvs.push(...(g.attributes.uv.array as any)); }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor.map((v, i) => (i % 3 === 1 ? 1 : v * 0.3)), 3));
    out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    return out;
  };
  const foliage = (map: THREE.Texture, geo: THREE.BufferGeometry, count: number, place: () => [number, number, number] | null, sMin: number, sMax: number, tintA: number, tintB: number) => {
    const mat = new THREE.MeshStandardNodeMaterial({ map, alphaTest: 0.32, side: THREE.DoubleSide, roughness: 0.9 });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const ca = new THREE.Color(tintA), cb = new THREE.Color(tintB), col = new THREE.Color();
    let n = 0;
    for (let i = 0; i < count * 3 && n < count; i++) {
      const p = place(); if (!p) continue;
      const s = sMin + R() * (sMax - sMin);
      m4.compose(new THREE.Vector3(p[0], p[1], p[2]), q.setFromEuler(e.set(0, R() * 6.28, (R() - 0.5) * 0.3)), new THREE.Vector3(s, s * (0.8 + R() * 0.5), s));
      mesh.setMatrixAt(n, m4);
      mesh.setColorAt(n, col.copy(ca).lerp(cb, R()));
      n++;
    }
    mesh.count = n; mesh.frustumCulled = false; mesh.receiveShadow = false;
    group.add(mesh);
  };
  const inLane = (x: number, z: number) => Math.abs(z) < 3.8 && Math.abs(x) > 14; // spawn lanes stay clear
  const ringZone = (): [number, number, number] | null => {
    const a = R() * 6.2832, rr = 14.2 + R() * 6; const x = Math.sin(a) * rr, z = Math.cos(a) * rr;
    if (inLane(x, z) || (Math.abs(x) < 3.3 && Math.abs(z) > 10) || (Math.abs(z) < 3.3 && Math.abs(x) > 10)) return null;
    if (Math.max(Math.abs(x), Math.abs(z)) > 19.6 || Math.abs(x) + Math.abs(z) > 27.6) return null;
    return [x, 0, z];
  };
  const edgeZone = (): [number, number, number] | null => {
    const a = R() * 6.2832, rr = RING_OUT - 0.4 + R() * 0.9;
    const x = Math.sin(a) * rr, z = Math.cos(a) * rr;
    if (Math.abs(x) < 3.2 || Math.abs(z) < 3.2) return null;
    return [x, rr > RING_OUT ? 0 : RING_H, z];
  };
  foliage(fernTexture(), cross(1.5, 1.4), lo ? 120 : 360, ringZone, 0.7, 1.5, 0xd8ffe4, 0x8fd8a8);
  foliage(fernTexture(), cross(1.2, 1.2), lo ? 60 : 180, edgeZone, 0.6, 1.1, 0xe0ffe8, 0x9fe0b8);
  foliage(grassTexture(), cross(0.9, 0.9), lo ? 160 : 520, ringZone, 0.7, 1.4, 0xe8ffc8, 0xa8d880);

  // ── giant trees + roots outside the arena, canopy cards, hanging glow-cables ─────────────────────────
  const leafMat = new THREE.MeshStandardNodeMaterial({ map: leafTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, color: 0xc8e8d0 });
  const leafCards = new THREE.InstancedMesh(new THREE.PlaneGeometry(4.6, 4.6), leafMat, 900);
  let leafN = 0;
  const treeGeos: THREE.BufferGeometry[] = [], cableGeos: THREE.BufferGeometry[] = [];
  const treeSpots = Array.from({ length: lo ? 8 : 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2 + (R() - 0.5) * 0.3, rr = 27 + R() * 13;
    return new THREE.Vector3(Math.sin(a) * rr, 0, Math.cos(a) * rr);
  });
  for (const t of treeSpots) {
    const H = 22 + R() * 10, lean = new THREE.Vector3((R() - 0.5) * 3, 0, (R() - 0.5) * 3);
    const trunk = new THREE.CatmullRomCurve3([
      new THREE.Vector3(t.x, -1, t.z), new THREE.Vector3(t.x + lean.x * 0.2, H * 0.3, t.z + lean.z * 0.2),
      new THREE.Vector3(t.x + lean.x * 0.7, H * 0.65, t.z + lean.z * 0.7), new THREE.Vector3(t.x + lean.x, H, t.z + lean.z),
    ]);
    treeGeos.push(taperTube(trunk, 1.7 + R() * 0.5, 0.65, 18, 12, 0.5));
    for (let r = 0; r < 6; r++) { // buttress roots flaring across the floor
      const ra = (r / 6) * Math.PI * 2 + R();
      const len = 5 + R() * 5;
      const root = new THREE.CatmullRomCurve3([
        new THREE.Vector3(t.x + Math.sin(ra) * 0.5, 3.6 + R(), t.z + Math.cos(ra) * 0.5),
        new THREE.Vector3(t.x + Math.sin(ra) * len * 0.4, 1.0, t.z + Math.cos(ra) * len * 0.4),
        new THREE.Vector3(t.x + Math.sin(ra) * len, -0.4, t.z + Math.cos(ra) * len),
      ]);
      treeGeos.push(taperTube(root, 0.55 + R() * 0.3, 0.12, 10, 7, 0.6));
    }
    const c = new THREE.Vector3(t.x + lean.x, H, t.z + lean.z);
    for (let l = 0; l < 64 && leafN < 900; l++, leafN++) {
      const d = new THREE.Vector3(R() - 0.5, (R() - 0.5) * 0.5, R() - 0.5).normalize().multiplyScalar(2 + R() * 9);
      const s = 0.7 + R() * 0.9;
      m4.compose(c.clone().add(d), q.setFromEuler(e.set((R() - 0.5) * 1.6, R() * 6.28, (R() - 0.5) * 1.6)), new THREE.Vector3(s, s, s));
      leafCards.setMatrixAt(leafN, m4);
    }
    // hanging cables with a cyan data-pulse
    for (let k = 0; k < 7; k++) {
      const hx = c.x + (R() - 0.5) * 9, hz = c.z + (R() - 0.5) * 9, hy = H * (0.55 + R() * 0.4);
      const sag = new THREE.CatmullRomCurve3([
        new THREE.Vector3(hx, hy, hz), new THREE.Vector3(hx + (R() - 0.5) * 2, hy * 0.62, hz + (R() - 0.5) * 2),
        new THREE.Vector3(hx + (R() - 0.5) * 3, hy * 0.28, hz + (R() - 0.5) * 3), new THREE.Vector3(hx + (R() - 0.5) * 3, 0.5 + R() * 2, hz + (R() - 0.5) * 3),
      ]);
      cableGeos.push(taperTube(sag, 0.05 + R() * 0.04, 0.03, 22, 5, 0));
    }
  }
  leafCards.count = leafN; leafCards.frustumCulled = false;
  group.add(leafCards);
  const addMerged = (geos: THREE.BufferGeometry[], mat: THREE.Material, uvScale: number, tall = false) => {
    const fixed = geos.map((g) => {
      const n = g.index ? g.toNonIndexed() : g; n.computeVertexNormals();
      const p = n.attributes.position, uvA = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) { uvA[i * 2] = (p.getX(i) + p.getZ(i)) * uvScale; uvA[i * 2 + 1] = p.getY(i) * (tall ? uvScale * 0.4 : uvScale); }
      n.setAttribute('uv', new THREE.BufferAttribute(uvA, 2));
      for (const name of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(name)) n.deleteAttribute(name);
      return n;
    });
    return fixed;
  };
  {
    const tg = mergeGeometries(addMerged(treeGeos, barkMat, 0.35), false);
    if (tg) { const m = new THREE.Mesh(tg, barkMat); m.castShadow = true; m.receiveShadow = true; group.add(m); }
    const cg = mergeGeometries(addMerged(cableGeos, cableMat, 0.5, true), false);
    if (cg) { const m = new THREE.Mesh(cg, cableMat); group.add(m); }
  }

  // ── mushrooms (bioluminescent) ───────────────────────────────────────────────────────────────────────
  const shroomMat = new THREE.MeshStandardNodeMaterial({ color: 0x0a2a30, roughness: 0.4 });
  shroomMat.emissiveNode = color(0x2fd8c8).mul(float(0.55).add(uBeatPulse.mul(0.5)));
  const capGeo = new THREE.SphereGeometry(0.22, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2); capGeo.translate(0, 0.22, 0);
  const shrooms = new THREE.InstancedMesh(capGeo, shroomMat, 120);
  for (let i = 0; i < 120; i++) {
    const p = (i < 60 ? ringZone() : edgeZone()) ?? [18 + R(), 0, 6 + R()];
    const s = 0.35 + R() * 0.7;
    m4.compose(new THREE.Vector3(p[0], p[1], p[2]), q.setFromEuler(e.set(0, R() * 6, 0)), new THREE.Vector3(s, s * (0.8 + R() * 0.6), s));
    shrooms.setMatrixAt(i, m4);
  }
  shrooms.frustumCulled = false; group.add(shrooms);

  // ── fireflies / spores ───────────────────────────────────────────────────────────────────────────────
  const FF = lo ? 70 : 260;
  const ffPos = new Float32Array(FF * 3), ffBase = new Float32Array(FF * 3), ffPhase = new Float32Array(FF);
  for (let i = 0; i < FF; i++) {
    const a = R() * 6.28, rr = Math.sqrt(R()) * 24;
    ffBase.set([Math.sin(a) * rr, 0.4 + R() * 6, Math.cos(a) * rr], i * 3); ffPhase[i] = R() * 6.28;
  }
  const ffGeo = new THREE.BufferGeometry();
  ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
  const ffMat = new THREE.PointsNodeMaterial({ size: 0.2, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  ffMat.colorNode = color(0x8ffcff).mul(2.0);
  // sprites have no surface normal; give the AO pass a flat one so the MRT pipeline compiles
  (ffMat as any).mrtNode = tslMrt({ output: tslOutput, normal: tslVec4(0.5, 0.5, 1.0, 1.0) });
  ffMat.opacityNode = float(0.9);
  const fireflies = new THREE.Points(ffGeo, ffMat);
  fireflies.frustumCulled = false;
  group.add(fireflies);

  // ── light shafts ─────────────────────────────────────────────────────────────────────────────────────
  const shaftMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  shaftMat.colorNode = color(0x9fe8ff);
  shaftMat.opacityNode = smoothstep(float(1.0), float(0.0), uv().y).mul(smoothstep(float(0.0), float(0.15), uv().y)).mul(0.016);
  const shafts: THREE.Mesh[] = [];
  for (let i = 0; i < (lo ? 0 : 4); i++) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 3.4 + R() * 2, 36, 14, 1, true), shaftMat);
    const a = R() * 6.28, rr = 6 + R() * 15;
    m.position.set(Math.sin(a) * rr, 16, Math.cos(a) * rr);
    m.rotation.set(0.28, R() * 6.28, 0.2); m.renderOrder = 4;
    group.add(m); shafts.push(m);
  }

  // ── lighting (moonlight with shadows + a small fixed pool of coloured lights) ─────────────────────────
  const hemi = new THREE.HemisphereLight(0x8fc8e0, 0x1a3028, 1.7);
  const moon = new THREE.DirectionalLight(0xb8d4ff, 3.4);
  moon.position.set(-14, 34, 10);
  moon.castShadow = !lo;
  moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 90 });
  moon.shadow.bias = -0.0004; moon.shadow.normalBias = 0.04;
  const crystalLight = new THREE.PointLight(0x28e8ff, 120, 30, 2);
  crystalLight.position.set(0, PIT_Y + 4.5, 0);
  const topLight = new THREE.PointLight(0x28e8ff, 60, 22, 2);
  topLight.visible = !lo;
  topLight.position.set(0, 9, 0);
  group.add(hemi, moon, crystalLight, topLight);
  for (const [x, z, c2] of [[-11, 11, 0x22d8ff], [11, -11, 0x7a5cff], [11, 11, 0x22d8ff], [-11, -11, 0x7a5cff]] as const) {
    if (lo) continue;
    const l = new THREE.PointLight(c2, 10, 14, 2); l.position.set(x, RING_H + 2.4, z); group.add(l);
  }

  // night sky, painted as an equirect so reflections + background agree
  {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#04101c'); grad.addColorStop(0.5, '#0a2530'); grad.addColorStop(1, '#05140f');
    g.fillStyle = grad; g.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(200,235,255,${0.2 + Math.random() * 0.7})`; const s = Math.random() * 1.6 + 0.3; g.fillRect(Math.random() * 1024, Math.random() * 230, s, s); }
    const sky = new THREE.CanvasTexture(c);
    sky.mapping = THREE.EquirectangularReflectionMapping; sky.colorSpace = THREE.SRGBColorSpace;
    scene.background = sky; scene.environment = sky;
    scene.environmentIntensity = 1.2;
  }
  scene.fog = new THREE.FogExp2(0x123c44, 0.015);
  scene.add(group);

  // enemy spots on open lower ground and ring
  const enemySpots: THREE.Vector3[] = [];
  for (let k = 0; k < 8; k++) {
    const a = Math.PI / 4 * k + Math.PI / 8;
    enemySpots.push(new THREE.Vector3(Math.sin(a) * 15.8, 0.1, Math.cos(a) * 15.8));
    enemySpots.push(new THREE.Vector3(Math.sin(a) * 11, RING_H + 0.1, Math.cos(a) * 11));
  }

  const info: LevelInfo = { id: 'cyber-forest-shrine', name: 'Cyber-Forest Shrine', track: 'main', accentHex: 0x24e8ff };
  let elapsed = 0;
  return {
    group, uBeatPulse, gates: [], traps: [], biomeIndex: 0, info,
    spawns: {
      a: { pos: new THREE.Vector3(-(APO + 3.2), 0.15, 0), yaw: -Math.PI / 2 },
      b: { pos: new THREE.Vector3(APO + 3.2, 0.15, 0), yaw: Math.PI / 2 },
    },
    enemySpots,
    controlPoints: [{ id: 'B', name: 'Power Node', pos: new THREE.Vector3(0, PIT_Y, 0), radius: 3.0 }],
    setBiome() { return { name: info.name, track: info.track }; },
    update(dt, pulse) {
      elapsed += dt;
      uBeatPulse.value = pulse;
      mono.rotation.y += dt * 0.12;
      mono.position.y = PIT_Y + 0.85 + Math.sin(elapsed * 0.9) * 0.08;
      node.rotation.z += dt * 0.8;
      node.scale.setScalar(1 + pulse * 0.1);
      crystalLight.intensity = 105 + pulse * 70 + Math.sin(elapsed * 3.1) * 8;
      topLight.intensity = 50 + pulse * 25;
      for (const l of spawnLights) l.intensity = 15 + pulse * 5;
      const p = ffGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < FF; i++) {
        const ph = ffPhase[i];
        p.setXYZ(i, ffBase[i * 3] + Math.sin(elapsed * 0.4 + ph) * 1.4, ffBase[i * 3 + 1] + Math.sin(elapsed * 0.7 + ph * 2) * 0.6, ffBase[i * 3 + 2] + Math.cos(elapsed * 0.35 + ph) * 1.4);
      }
      p.needsUpdate = true;
      shafts.forEach((s, i) => { s.rotation.y += dt * 0.02; s.visible = true; void i; });
    },
    resolveDynamicGates() { /* no moving gates in this level */ },
  };
}
