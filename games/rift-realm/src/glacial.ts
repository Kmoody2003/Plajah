// Level 2 — Glacial Citadel Complex (6v6 Team Arena / 12v12 Battleground). See docs/rift-realm-levels.md.
// Built to the concept "Glacial citadel complex shooter map": the south battlement overlook (Team A, landing pad), the snow
// courtyard of broken columns + supply crates (B), the ruined two-storey gothic hall, the ice cave under the west cliffs with
// the icicle sniper balcony above (A), the chasm crossed by two hard-light bridges to the east tower (C), and to the north
// the Glacial Void Shrine cathedral with its glowing portal, twin stairs and aqueduct bridges (Team B).
// Frame: +z = south, -z = north, y up, metres. Courtyard floor y = 0.
import * as THREE from 'three/webgpu';
import {
  color, float, luminance, mix, normalWorld, vec3, floor, fract, dot, step, cameraPosition, normalView, positionViewDirection, pow, positionWorld, sin, smoothstep, texture as tslTexture, time, uniform, uv, vec2, length,
} from 'three/tsl';
import { mrt as tslMrt, output as tslOutput, vec4 as tslVec4 } from 'three/tsl';
import { StaticKit, boulder, fbm3, noise3, rng } from './geom';
import { circuitTexture, pbr } from './textures';
import type { Level, LevelInfo, Tier } from './shrine';

const smooth = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// ── terrain height: the art's landforms ─────────────────────────────────────────────────────────────────
const CHASM_X0 = 30, CHASM_X1 = 50;
export function glacialHeight(x: number, z: number): number {
  let h = 0;
  // south battlement plateau (Team A) and north shrine plateau (Team B)
  h = Math.max(h, 12 * smooth(64, 68, z));
  h = Math.max(h, 3 * smooth(-60, -65, z));
  // west ice cliffs rising to the sniper shelf and beyond
  const west = smooth(-40, -47, x);
  h = Math.max(h, west * (19 + fbm3(x * 0.05, 0, z * 0.05) * 7));
  h = Math.max(h, smooth(-62, -75, x) * (26 + fbm3(x * 0.03, 1, z * 0.03) * 16));
  // ice cave lane cut through the west cliff (open trench under the rock roof)
  const caveLane = smooth(-36, -40, x) * smooth(-62, -56, x) * smooth(26, 20, Math.abs(z));
  h *= 1 - caveLane * 0.999;
  // mountains enclosing the map
  const edge = Math.max(smooth(76, 96, x), smooth(112, 132, z), smooth(-118, -140, z));
  h = Math.max(h, edge * (40 + fbm3(x * 0.02, 2, z * 0.02) * 40));
  // the chasm (east) — falls away to a misty floor far below
  const chasm = smooth(CHASM_X0 - 2, CHASM_X0 + 3, x) * smooth(CHASM_X1 + 2, CHASM_X1 - 3, x) * smooth(-80, -70, z) * smooth(95, 85, z);
  h = h * (1 - chasm) + chasm * -48;
  // snow drifts
  h += (fbm3(x * 0.08, 7, z * 0.08) - 0.5) * 0.5 * (1 - chasm);
  return h;
}

export function buildGlacial(scene: THREE.Scene, tier: Tier = 'high'): Level {
  const lo = tier === 'low';
  const group = new THREE.Group();
  const uBeatPulse = uniform(0);
  const kit = new StaticKit();
  const R = rng(4242);

  // ── materials from the Glacial Citadel material sheets; snow settles on every upward face ─────────────
  const snowSet = pbr('glacial-ground', { maps: ['normal', 'roughness'], tint: 0xffffff });
  const snowMap = snowSet.map!;
  // the sheets lean blue; the concept's stone is cold grey and its snow near-white, so both are desaturated
  const desat = (c: any, keep: number) => mix(vec3(luminance(c)), c, keep);
  const snowify = (m: THREE.MeshStandardNodeMaterial, cover = 1, tile = 1, keep = 0.3) => {
    const base = desat(tslTexture(m.map!, uv()).rgb, keep).mul(color(m.color));
    const snowTex = tslTexture(snowMap, uv().mul(tile));
    const snow = desat(snowTex.rgb, 0.22).mul(1.12).add(0.04);
    // accumulation: upward faces, broken up by a low-frequency drift mask (no more speckle on flats)
    const drift = tslTexture(snowMap, positionWorld.xz.mul(0.013)).r;
    const n = normalWorld.y.add(drift.sub(0.5).mul(0.22));
    const k = smoothstep(float(0.62 - 0.12 * cover), float(0.8 - 0.1 * cover), n).mul(Math.min(1, cover)).clamp(0, 1);
    // snow-in-shadow picks up the sky's blue; sunlit snow stays white
    const shade = smoothstep(float(0.0), float(0.9), normalWorld.y);
    const snowLit = mix(snow.mul(vec3(0.82, 0.9, 1.04)), snow, shade);
    m.colorNode = mix(base, snowLit, k);
    m.roughnessNode = mix(float(0.85), float(0.55), k);
    // glints: sparse view-dependent sparkles in the snow crust
    const cell = floor(positionWorld.mul(26.0)).add(floor(cameraPosition.mul(1.5)));
    const h = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))).mul(43758.5453));
    m.emissiveNode = vec3(step(float(0.9982), h).mul(k).mul(2.6));
    return m;
  };
  // terrain: dark rock on steep faces (cliffs, chasm walls), snow on anything walkable
  const terrainMat = snowify(pbr('celestial-obsidian', { maps: ['normal', 'roughness'], tint: 0x6f7886, normalScale: 1.5 }), 1.9, 0.6, 0.2);
  const snowMat = snowify(pbr('glacial-ground', { maps: ['normal', 'roughness'], tint: 0xf4f8ff }), 1);
  const stoneMat = snowify(pbr('glacial-brick', { maps: ['normal', 'roughness', 'ao'], tint: 0x707b8a, normalScale: 1.3 }), 1, 1);
  const darkStone = snowify(pbr('glacial-brick', { maps: ['normal', 'roughness', 'ao'], tint: 0x464e5a, normalScale: 1.3 }), 0.9);
  const rockMat = snowify(pbr('celestial-obsidian', { maps: ['normal', 'roughness'], tint: 0x67707e, normalScale: 1.4 }), 0.8, 0.5, 0.2);
  // ice: clear-coated physical material with a fresnel glow (the art's back-lit blue ice)
  const fres = pow(float(1).sub(dot(normalView, positionViewDirection).clamp(0, 1)), float(3));
  const iceSrc = pbr('glacial-ice', { maps: ['normal', 'roughness'], tint: 0xcfe9ff, normalScale: 0.8 });
  const iceMat = new THREE.MeshPhysicalNodeMaterial({ map: iceSrc.map, normalMap: iceSrc.normalMap, color: 0xbfe3ff, roughness: 0.14, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, ior: 1.31 });
  iceMat.emissiveNode = color(0x5ab4ff).mul(fres.mul(0.9).add(0.04));
  const icicleMat = new THREE.MeshPhysicalNodeMaterial({ color: 0xdff4ff, roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, ior: 1.31, transparent: true, opacity: 0.9 });
  icicleMat.emissiveNode = color(0x7cc8ff).mul(fres.mul(1.2).add(0.06));
  const crateMat = new THREE.MeshStandardNodeMaterial({ map: pbr('volc-steel', { maps: [] }).map, color: 0x7f93a8, roughness: 0.45, metalness: 0.7 });
  const circuit = circuitTexture(3);
  const uRune = uniform(new THREE.Color(0x3fd4ff));
  const glowMat = new THREE.MeshStandardNodeMaterial({ color: 0x041420, roughness: 0.3 });
  glowMat.emissiveNode = uRune.mul(float(1.8).add(uBeatPulse.mul(1.6)));
  const bridgeMat = new THREE.MeshStandardNodeMaterial({ color: 0x0a2236, roughness: 0.18, metalness: 0.6 });
  bridgeMat.emissiveNode = tslTexture(circuit, uv().mul(vec2(0.5, 0.5))).rgb.mul(uRune).mul(float(1.3).add(uBeatPulse.mul(1.0))).add(uRune.mul(fres.mul(0.8).add(0.06))).add(uRune.mul(smoothstep(float(0.96), float(1.0), fract(uv().y.mul(0.25).sub(time.mul(0.35)))).mul(1.4)));
  const runeStone = snowify(pbr('glacial-brick', { maps: ['normal', 'roughness', 'ao'], tint: 0x6d7888, normalScale: 1.3 }), 0.9);
  runeStone.emissiveNode = tslTexture(circuit, uv().mul(0.35)).rgb.mul(uRune).mul(float(0.9).add(uBeatPulse.mul(0.9)));
  const invisible = new THREE.MeshBasicNodeMaterial({ visible: false });

  // ── terrain mesh ────────────────────────────────────────────────────────────────────────────────────
  {
    const W = 300, D = 320, SX = lo ? 120 : 200, SZ = lo ? 130 : 216;
    const g = new THREE.PlaneGeometry(W, D, SX, SZ);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, -5);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, glacialHeight(p.getX(i), p.getZ(i)));
    g.computeVertexNormals();
    kit.add(terrainMat, g, { tpm: 0.12 });
  }

  // ── helpers ───────────────────────────────────────────────────────────────────────────────────────────
  const ramp = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, width: number) => {
    const h = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az);
    const g = new THREE.BoxGeometry(width, 0.2, Math.hypot(h, by - ay));
    kit.place(g, (ax + bx) / 2, (ay + by) / 2 - 0.1, (az + bz) / 2, yaw, -Math.atan2(by - ay, h));
    kit.add(invisible, g, { shadow: false });
  };
  /** Stone flight from (x0,y0,z0) climbing along yaw to height y1. */
  const flight = (mat: THREE.Material, x0: number, y0: number, z0: number, yaw: number, y1: number, width: number, rise = 0.25, run = 0.4) => {
    const steps = Math.max(1, Math.round((y1 - y0) / rise)), r = (y1 - y0) / steps;
    const dx = Math.sin(yaw), dz = Math.cos(yaw);
    for (let i = 0; i < steps; i++) {
      const top = y0 + (i + 1) * r, d = run * i + run / 2;
      kit.box(mat, width, top - y0 + 1.5, run, x0 + dx * d, (top + y0 - 1.5) / 2, z0 + dz * d, yaw, { tpm: 0.5 });
    }
    ramp(x0, y0 + r, z0, x0 + dx * run * (steps - 0.5), y1, z0 + dz * run * (steps - 0.5), width);
    // cheek walls
    for (const s of [-1, 1]) {
      const cx = x0 + dx * (run * steps) / 2 + dz * s * (width / 2 + 0.3), cz = z0 + dz * (run * steps) / 2 - dx * s * (width / 2 + 0.3);
      const len = run * steps, ang = Math.atan2(y1 - y0, len);
      const g = new THREE.BoxGeometry(0.6, 0.9, Math.hypot(len, y1 - y0) + 0.4);
      kit.place(g, cx, (y0 + y1) / 2 + 0.45, cz, yaw, -ang);
      kit.add(mat, g, { tpm: 0.5 });
    }
  };
  /** Gothic wall panel with pointed-arch openings (n bays). */
  const gothicWall = (mat: THREE.Material, cx: number, cz: number, yaw: number, len: number, h: number, bays: number, y0 = 0, thick = 1.2, openTo = 0.62) => {
    const dx = Math.cos(yaw), dz = -Math.sin(yaw), bay = len / bays;
    for (let i = 0; i <= bays; i++) { // piers + buttresses
      const o = -len / 2 + i * bay;
      kit.box(mat, 1.3, h, thick + 0.5, cx + dx * o, y0 + h / 2, cz + dz * o, yaw, { tpm: 0.5 });
    }
    for (let i = 0; i < bays; i++) {
      const o = -len / 2 + (i + 0.5) * bay, w = bay - 1.3, archTop = h * openTo;
      // sill + spandrel above the arch
      kit.box(mat, w, 1.0, thick, cx + dx * o, y0 + 0.5, cz + dz * o, yaw, { tpm: 0.5 });
      kit.box(mat, w, h - archTop - w * 0.35, thick, cx + dx * o, y0 + (h + archTop + w * 0.35) / 2, cz + dz * o, yaw, { tpm: 0.5 });
      const n = 7;
      for (let j = 0; j < n; j++) { // voussoirs of the pointed arch
        const t = (j + 0.5) / n, ang = Math.PI * t;
        const ox = Math.cos(ang) * w / 2, oy = Math.pow(Math.sin(ang), 0.7) * w * 0.38;
        kit.box(mat, w / n + 0.25, 0.55, thick, cx + dx * (o + ox), y0 + archTop + oy, cz + dz * (o + ox), yaw, { tpm: 0.5, rz: -Math.cos(ang) * 0.6 });
      }
    }
    kit.box(mat, len + 1.2, 0.6, thick + 0.7, cx, y0 + h + 0.3, cz, yaw, { tpm: 0.5 });
  };
  const icicleGeo = new THREE.ConeGeometry(0.16, 1, 6, 1); icicleGeo.rotateX(Math.PI); icicleGeo.translate(0, -0.5, 0);
  const icicles: THREE.Matrix4[] = [];
  const hangIcicles = (x0: number, z0: number, x1: number, z1: number, y: number, n: number, scale = 1) => {
    for (let i = 0; i < n; i++) {
      const t = R(), s = (0.4 + R() * R() * 2.6) * scale;
      icicles.push(new THREE.Matrix4().compose(new THREE.Vector3(x0 + (x1 - x0) * t, y, z0 + (z1 - z0) * t), new THREE.Quaternion(), new THREE.Vector3(s * 0.7, s, s * 0.7)));
    }
  };
  const balustrade = (x0: number, z0: number, x1: number, z1: number, y: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
    const n = Math.floor(len / 0.45);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      kit.prism(stoneMat, 6, 0.09, 0.13, 0.8, x0 + (x1 - x0) * t, y + 0.15, z0 + (z1 - z0) * t, 0, { tpm: 1 });
    }
    kit.box(stoneMat, len + 0.4, 0.22, 0.5, (x0 + x1) / 2, y + 1.05, (z0 + z1) / 2, yaw, { tpm: 0.5 });
    kit.box(stoneMat, len + 0.4, 0.18, 0.5, (x0 + x1) / 2, y + 0.07, (z0 + z1) / 2, yaw, { tpm: 0.5 });
  };

  // ── SOUTH: battlement overlook + landing pad (Team A) ───────────────────────────────────────────────
  // crenellated parapet along the plateau's north lip — the foreground wall of the concept shot — with 3 exits
  for (const [xa, xb] of [[-44, -22], [-14, -5], [5, 14], [22, 23.5]] as const) {
    const len = xb - xa;
    kit.box(darkStone, len, 1.25, 1.6, (xa + xb) / 2, 12.6, 68.5, 0, { tpm: 0.5 });
    for (let x = xa + 0.9; x < xb - 0.5; x += 3.2) kit.box(darkStone, 1.6, 0.45, 1.5, x, 13.45, 68.5, 0, { tpm: 0.6 });
    kit.box(darkStone, len, 12, 1.6, (xa + xb) / 2, 6, 66.9, 0, { tpm: 0.4 });
  }
  for (const [x, w] of [[-18, 5], [0, 7], [18, 5]] as const) flight(stoneMat, x, 0.05, 46.6, 0, 12, w); // exits: W / centre / E stairs
  // landing pad: circular deck with a glowing ring + guide lights
  kit.prism(darkStone, 24, 9, 9.4, 0.5, 0, 11.9, 92, 0, { tpm: 0.4 });
  const padRing = new THREE.Mesh(new THREE.TorusGeometry(7.6, 0.12, 8, 64), glowMat);
  padRing.rotation.x = Math.PI / 2; padRing.position.set(0, 12.42, 92); group.add(padRing);
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; kit.box(glowMat, 0.4, 0.08, 1.6, Math.sin(a) * 5.5, 12.42, 92 + Math.cos(a) * 5.5, a, { solid: false, shadow: false, tpm: 1 }); }
  // spawn gatehouse behind the pad
  gothicWall(darkStone, 0, 104, 0, 34, 13, 4, 12);
  kit.box(darkStone, 1.4, 13, 18, -17.5, 18.5, 95, 0); kit.box(darkStone, 1.4, 13, 18, 17.5, 18.5, 95, 0);

  // ── CENTRE: the snow courtyard (point B) ─────────────────────────────────────────────────────────────
  const pts: [number, number][] = [[-22, 30], [-10, 24], [6, 30], [16, 18], [-26, 8], [-4, 6], [12, 0], [-16, -6], [2, -12], [20, 6]];
  for (const [x, z] of pts) { // broken columns with snow caps
    const h = 2.2 + R() * 4.5;
    kit.prism(stoneMat, 10, 0.62, 0.7, h, x, -0.3, z, R() * 3, { tpm: 0.6 });
    kit.box(stoneMat, 1.7, 0.5, 1.7, x, 0.0, z, R() * 2, { tpm: 0.6 });
    if (h > 5.5) kit.box(stoneMat, 1.6, 0.45, 1.6, x, h - 0.1, z, R() * 3, { tpm: 0.6, rz: 0.12 });
    hangIcicles(x - 0.5, z - 0.5, x + 0.5, z + 0.5, h - 0.3, 3, 0.4);
  }
  // supply crates (metal, blue light strips) in clusters = cover
  const crate = (x: number, z: number, yaw: number, stack = 1) => {
    for (let s = 0; s < stack; s++) {
      const y = glacialHeight(x, z) + 0.6 + s * 1.2;
      kit.box(crateMat, 1.8, 1.2, 1.2, x, y, z, yaw + s * 0.2, { tpm: 0.6 });
      kit.box(glowMat, 1.82, 0.08, 1.22, x, y + 0.2, z, yaw + s * 0.2, { solid: false, shadow: false, tpm: 1 });
    }
  };
  for (const [x, z, s] of [[-12, 34, 2], [-9, 36, 1], [8, 38, 1], [10, 36, 2], [-20, 14, 1], [-2, 16, 2], [0, 14, 1], [16, 26, 1], [-8, -2, 2], [8, -6, 1], [22, -2, 1], [-28, -10, 2], [-30, 40, 1], [-24, 2, 2], [4, 44, 1], [-16, 42, 2], [14, -12, 2], [26, 20, 1], [-2, 30, 1], [-32, 24, 1]] as const) crate(x, z, R() * 0.8, s);
  // low ruined walls snaking through the yard (long-sightline breakers)
  const lowWall = (x: number, z: number, yaw: number, len: number) => {
    const n = Math.round(len / 1.1);
    for (let i = 0; i < n; i++) {
      const o = (i - (n - 1) / 2) * 1.1, hh = 0.9 + fbm3(x + i, z, 3) * 1.4;
      kit.box(stoneMat, 1.1, hh, 0.8, x + Math.cos(yaw) * o, glacialHeight(x, z) + hh / 2 - 0.1, z - Math.sin(yaw) * o, yaw, { tpm: 0.5 });
    }
  };
  lowWall(-6, 26, 0.1, 9); lowWall(12, 10, -0.6, 8); lowWall(-24, 22, 1.3, 7); lowWall(-12, -14, 0.2, 10); lowWall(22, 32, 1.2, 6);
  // rubble + boulders
  for (let i = 0; i < (lo ? 60 : 160); i++) {
    const x = -34 + R() * 62, z = -18 + R() * 64;
    const g = boulder(0.25 + R() * 0.6, i, 1);
    kit.place(g, x, glacialHeight(x, z) + 0.1, z, R() * 6);
    kit.add(stoneMat, g, { tpm: 0.7, shadow: false, solid: false });
  }

  // ── RUINED GOTHIC HALL (two storeys, north of the yard; forward spawn in Battleground) ───────────────
  {
    const cx = -6, cz = -38, T = 4;
    // terrace + broad stairs up from the yard (the concept's stairs climbing to the hall)
    kit.box(darkStone, 46, T + 2, 30, cx, T / 2 - 1, cz, 0, { tpm: 0.4 });
    flight(stoneMat, cx - 4, 0.05, cz + 15 + 6.7, Math.PI, T, 9, 0.25, 0.42);
    flight(stoneMat, cx + 16, 0.05, cz + 15 + 6.7, Math.PI, T, 4, 0.25, 0.42);
    gothicWall(stoneMat, cx, cz + 11, 0, 40, 16, 6, T);            // south face (broken windows onto the yard)
    gothicWall(stoneMat, cx, cz - 11, 0, 40, 22, 6, T);            // north face, taller
    gothicWall(stoneMat, cx - 20, cz, Math.PI / 2, 22, 19, 3, T);  // west
    gothicWall(stoneMat, cx + 20, cz, Math.PI / 2, 22, 12, 3, T);  // east, half collapsed
    // upper floor slab (partly collapsed) + interior stair
    kit.box(darkStone, 24, 0.6, 20, cx - 7, T + 7.2, cz, 0, { tpm: 0.4 });
    kit.box(darkStone, 9, 0.6, 10, cx + 13, T + 7.2, cz - 5, 0, { tpm: 0.4, rz: 0.08 });
    flight(stoneMat, cx + 7, T + 0.05, cz + 8, Math.PI, T + 7.2, 3.2, 0.26, 0.42);
    for (let i = 0; i < 5; i++) kit.box(darkStone, 0.8, 0.8, 13, cx - 14 + i * 7, T + 1.0 + R(), cz + (R() - 0.5) * 4, 0.3 * (R() - 0.5), { tpm: 0.5, rx: 0.25 * (R() - 0.5) });
    // gable + broken roof ribs
    for (let i = 0; i < 6; i++) {
      const x = cx - 17 + i * 6.8;
      const rib = new THREE.TorusGeometry(11, 0.4, 6, 18, Math.PI * (i % 2 ? 0.55 : 1));
      kit.place(rib, x, T + 18, cz, Math.PI / 2);
      kit.add(stoneMat, rib, { tpm: 0.5, solid: false });
    }
    hangIcicles(cx - 20, cz + 11.8, cx + 20, cz + 11.8, T + 16.6, lo ? 50 : 120, 1.5);
    hangIcicles(cx - 20, cz - 11.8, cx + 20, cz - 11.8, T + 22.6, lo ? 30 : 80, 1.6);
    // interior warm light (art: lit doorways)
    const warm = new THREE.PointLight(0xffa860, 10, 16, 2); warm.position.set(cx, T + 3, cz); group.add(warm);
  }

  // ── WEST: ice cave lane (A) under the cliff, icicle sniper balcony above ─────────────────────────────
  {
    // rock roof over the cave trench: slabs spanning the lane between x=-58 and x=-38
    for (let z = -22; z <= 22; z += 4) {
      const g = boulder(6.5, 300 + z, lo ? 2 : 3);
      kit.place(g, -48 + (R() - 0.5) * 2, 15 + R() * 1.5, z, R() * 6, 0, 0, 1.5, 1.0, 0.9);
      kit.add(rockMat, g, { tpm: 0.25 });
    }
    // cave walls of ice + rock pillars
    for (let i = 0; i < 14; i++) {
      const z = -20 + i * 3.1, side = i % 2 ? -1 : 1;
      const g = boulder(2.2 + R(), 400 + i, 2);
      kit.place(g, -48 + side * (8.4 + R()), 2.2, z, R() * 6, 0, 0, 0.8, 1.8, 0.9);
      kit.add(i % 3 === 0 ? iceMat : rockMat, g, { tpm: 0.4 });
    }
    hangIcicles(-56, -20, -40, 20, 11.5, lo ? 60 : 160, 2.0);
    for (let z = -60; z <= 60; z += 5) { const g = boulder(3.5 + R() * 2, 700 + z, 2); kit.place(g, -41 - R() * 2, 4 + R() * 8, z, R() * 6, 0, 0, 0.7, 2.4, 1.2); kit.add(z % 15 === 0 ? iceMat : rockMat, g, { tpm: 0.3 }); }
    hangIcicles(-40, -60, -40, -24, 17, lo ? 30 : 80, 2.6); hangIcicles(-40, 24, -40, 60, 17, lo ? 30 : 80, 2.6);
    // glowing ice crystals inside (art: blue cave glow) + buff shrine (Battleground)
    const caveLight = new THREE.PointLight(0x5ab8ff, 60, 30, 2); caveLight.position.set(-48, 3, 0); group.add(caveLight);
    for (let i = 0; i < 9; i++) {
      const g = new THREE.OctahedronGeometry(0.6 + R() * 0.9, 0);
      kit.place(g, -48 + (R() - 0.5) * 12, 0.6 + R() * 0.6, -16 + R() * 32, R() * 3, R(), R(), 0.6, 1.8, 0.6);
      kit.add(glowMat, g, { solid: false, tpm: 1 });
    }
    // sniper balcony on the cliff shelf: stone deck projecting toward the yard, balustrade, stair down south
    kit.box(darkStone, 12, 0.6, 7, -38, 9.6, -6, 0, { tpm: 0.4 });
    kit.box(darkStone, 2.2, 9.6, 2.2, -34, 4.8, -3, 0); kit.box(darkStone, 2.2, 9.6, 2.2, -34, 4.8, -9, 0);
    balustrade(-32, -9.5, -32, -2.5, 9.9); balustrade(-44, -2.5, -32, -2.5, 9.9);
    hangIcicles(-44, -9.4, -32, -9.4, 9.3, lo ? 15 : 40, 1.2);
    hangIcicles(-32.1, -9.5, -32.1, -2.5, 9.3, lo ? 10 : 30, 1.2);
    flight(stoneMat, -36, 0.05, 14, Math.PI, 9.6, 3, 0.28, 0.42);
  }

  // ── EAST: chasm + two hard-light bridges (C) + tower ─────────────────────────────────────────────────
  const bridge = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number) => {
    const len = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az);
    const g = new THREE.BoxGeometry(w, 0.35, len);
    kit.place(g, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, yaw, -Math.atan2(by - ay, len));
    kit.add(bridgeMat, g, { tpm: 0.25 });
    for (const s of [-1, 1]) { // glowing rails
      const r = new THREE.BoxGeometry(0.12, 0.12, len);
      kit.place(r, (ax + bx) / 2 + Math.cos(yaw) * s * (w / 2), (ay + by) / 2 + 1.0, (az + bz) / 2 - Math.sin(yaw) * s * (w / 2), yaw, -Math.atan2(by - ay, len));
      kit.add(glowMat, r, { shadow: false, tpm: 1 });
      const wall = new THREE.BoxGeometry(0.1, 1.1, len);
      kit.place(wall, (ax + bx) / 2 + Math.cos(yaw) * s * (w / 2), (ay + by) / 2 + 0.5, (az + bz) / 2 - Math.sin(yaw) * s * (w / 2), yaw, -Math.atan2(by - ay, len));
      kit.add(invisible, wall, { shadow: false });
    }
    // emitter pylons at both ends
    for (const [x, y, z] of [[ax, ay, az], [bx, by, bz]]) for (const s of [-1, 1]) kit.box(runeStone, 0.8, 2.6, 0.8, x + Math.cos(yaw) * s * (w / 2 + 0.5), y + 1.1, z - Math.sin(yaw) * s * (w / 2 + 0.5), yaw, { tpm: 0.6 });
  };
  bridge(28, 12.2, 62, 60, 4.4, 34, 6);     // the concept's foreground hard-light span: battlement (A spawn) → east tower landing
  kit.box(darkStone, 9, 4.4, 9, 63, 2.2, 32, 0, { tpm: 0.4 });  // tower-side landing
  flight(stoneMat, 63, 0.05, 45.5, Math.PI, 4.4, 4, 0.25, 0.42);
  kit.box(darkStone, 6, 12.2, 8, 26, 6.1, 63, 0, { tpm: 0.4 });  // battlement-side abutment
  bridge(22, 0.2, 30, 52, 0.2, 18, 5);       // low span across the chasm floor-level ledge (C point)
  bridge(26, 6.2, -4, 54.5, 10.0, -4, 4);       // upper bridge: courtyard bastion → tower balcony
  // bastion on the courtyard side for the upper bridge
  kit.box(darkStone, 8, 6.2, 8, 22, 3.1, -4, 0, { tpm: 0.4 });
  flight(stoneMat, 15, 0.05, 2, Math.PI / 2, 6.2, 3, 0.28, 0.4);
  balustrade(18, -8, 26, -8, 6.2);
  // chasm walls: ice falls + rock faces, mist far below
  for (let i = 0; i < (lo ? 14 : 30); i++) {
    const z = -70 + i * (160 / (lo ? 14 : 30)), side = i % 2 ? CHASM_X0 + 1 : CHASM_X1 - 1;
    const g = boulder(5 + R() * 3, 500 + i, 2);
    kit.place(g, side + (side < 40 ? -1 : 1) * 2, -12 - R() * 18, z, R() * 6, 0, 0, 1, 2.6, 1);
    kit.add(i % 4 === 0 ? iceMat : rockMat, g, { tpm: 0.25, solid: false, shadow: false });
  }
  hangIcicles(CHASM_X0 - 0.5, -60, CHASM_X0 - 0.5, 80, -0.4, lo ? 40 : 120, 2.2);
  hangIcicles(CHASM_X1 + 0.5, -60, CHASM_X1 + 0.5, 80, -0.4, lo ? 40 : 120, 2.2);
  // east tower: three storeys, balcony at the upper-bridge landing, grand stair down to the plateau
  {
    const tx = 64, tz = -2;
    gothicWall(stoneMat, tx, tz - 9, 0, 18, 30, 3);
    gothicWall(stoneMat, tx + 9, tz, Math.PI / 2, 18, 30, 3);
    gothicWall(stoneMat, tx, tz + 9, 0, 18, 24, 3, 0, 1.2, 0.5);
    kit.box(darkStone, 18, 0.5, 18, tx, 10.0, tz, 0, { tpm: 0.4 });
    kit.box(darkStone, 6, 0.5, 9, 57.5, 10.0, -4, 0, { tpm: 0.4 }); // balcony deck over the chasm edge
    kit.box(darkStone, 1.6, 10, 1.6, 55.2, 5, -8, 0); kit.box(darkStone, 1.6, 10, 1.6, 55.2, 5, 0, 0);
    balustrade(54.6, -8.5, 54.6, -6, 10.25); balustrade(54.6, -2, 54.6, 0.5, 10.25);
    balustrade(54.6, 0.5, 60, 0.5, 10.25);
    flight(stoneMat, 70, 0.05, 30, Math.PI, 10.0, 4, 0.28, 0.42);
    hangIcicles(tx - 9, tz + 9.8, tx + 9, tz + 9.8, 23.6, lo ? 20 : 60, 1.8);
    hangIcicles(54.5, -8.5, 54.5, 0.5, 9.7, lo ? 10 : 30, 1.5);
    const g = new THREE.ConeGeometry(4.5, 16, 8); kit.place(g, tx, 38, tz, Math.PI / 8); kit.add(darkStone, g, { tpm: 0.3, solid: false });
    const torch = new THREE.PointLight(0xffa860, 8, 14, 2); torch.position.set(tx, 12, tz); group.add(torch);
  }

  // ── NORTH: the Glacial Void Shrine cathedral (Team B) ────────────────────────────────────────────────
  const shrineZ = -100;
  {
    // terrace the twin stairs climb to, in front of the portal
    kit.box(darkStone, 34, 9, 14, 0, 4.5, shrineZ + 12, 0, { tpm: 0.4 });
    flight(stoneMat, -12, 3.05, shrineZ + 34, Math.PI - 0.32, 9, 5, 0.25, 0.42);
    flight(stoneMat, 12, 3.05, shrineZ + 34, Math.PI + 0.32, 9, 5, 0.25, 0.42);
    balustrade(-17, shrineZ + 19, 17, shrineZ + 19, 9);
    // facade: central great arch with the portal, flanking towers, side wings with arcades
    gothicWall(runeStone, 0, shrineZ + 4, 0, 30, 30, 3, 9, 2.4, 0.66);
    for (const s of [-1, 1]) {
      const x = s * 19;
      kit.box(runeStone, 9, 44, 9, x, 22, shrineZ + 2, 0, { tpm: 0.3 });
      const sp = new THREE.ConeGeometry(4.6, 26, 8); kit.place(sp, x, 57, shrineZ + 2, Math.PI / 8); kit.add(runeStone, sp, { tpm: 0.3, solid: false });
      for (let k = 0; k < 4; k++) { // pinnacles
        const pk = new THREE.ConeGeometry(0.9, 9, 6);
        kit.place(pk, x + (k % 2 ? 3.6 : -3.6), 48, shrineZ + 2 + (k > 1 ? 3.6 : -3.6)); kit.add(runeStone, pk, { tpm: 0.5, solid: false });
      }
      gothicWall(runeStone, s * 36, shrineZ + 6, 0, 24, 18, 3, 3, 1.6, 0.6); // side wings
      hangIcicles(s * 24, shrineZ + 7, s * 48, shrineZ + 7, 20.6, lo ? 20 : 60, 1.5);
    }
    const centralSpire = new THREE.ConeGeometry(6, 40, 8); kit.place(centralSpire, 0, 62, shrineZ - 6, Math.PI / 8); kit.add(runeStone, centralSpire, { tpm: 0.3, solid: false });
    kit.box(runeStone, 30, 34, 16, 0, 26, shrineZ - 6, 0, { tpm: 0.3 });
    // aqueduct bridges to W and E (the shot's arcaded bridges)
    for (const s of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        const x = s * (52 + i * 7);
        kit.box(stoneMat, 2.2, 14, 3, x, -1, shrineZ + 16, 0, { tpm: 0.4, solid: false });
      }
      kit.box(stoneMat, 44, 2, 4, s * 70, 7, shrineZ + 16, 0, { tpm: 0.4, solid: false });
    }
  }
  // the portal (spawn) — swirling energy disc
  const portalMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const pr = length(uv().sub(vec2(0.5, 0.5)));
  portalMat.colorNode = mix(color(0x9ff0ff), color(0x1f6cff), pr.mul(1.8)).mul(float(1.2).add(sin(pr.mul(40).sub(time.mul(3))).mul(0.3)));
  portalMat.opacityNode = smoothstep(float(0.5), float(0.3), pr).mul(0.85);
  const portal = new THREE.Mesh(new THREE.CircleGeometry(6.5, 48), portalMat);
  portal.position.set(0, 18, shrineZ + 5.4); group.add(portal);
  const portalLight = new THREE.PointLight(0x4fb0ff, 160, 48, 2); portalLight.position.set(0, 16, shrineZ + 12); group.add(portalLight);
  // rune-lit approach path from the yard to the shrine stairs
  for (let i = 0; i < 18; i++) {
    const z = -50 - i * 3.0, x = Math.sin(i * 0.4) * 2.5;
    kit.box(glowMat, 3.4, 0.06, 0.14, x, glacialHeight(x, z) + 0.06, z, 0.1 * Math.sin(i), { solid: false, shadow: false, tpm: 1 });
  }

  // ── backdrop: distant peaks + icefalls ──────────────────────────────────────────────────────────────
  for (let i = 0; i < (lo ? 10 : 22); i++) {
    const a = (i / (lo ? 10 : 22)) * Math.PI * 2, rr = 210 + R() * 80;
    const g = new THREE.ConeGeometry(50 + R() * 40, 110 + R() * 90, 9, 6);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const y = p.getY(k); const n = noise3(p.getX(k) * 0.05 + i, y * 0.05, p.getZ(k) * 0.05) - 0.5; p.setXYZ(k, p.getX(k) * (1 + n * 0.5), y, p.getZ(k) * (1 + n * 0.5)); }
    kit.place(g, Math.sin(a) * rr, 20, Math.cos(a) * rr - 10, R() * 3);
    kit.add(rockMat, g, { tpm: 0.04, solid: false, shadow: false });
  }

  kit.build(group);

  // icicles (instanced)
  const ic = new THREE.InstancedMesh(icicleGeo, icicleMat, icicles.length);
  icicles.forEach((m, i) => ic.setMatrixAt(i, m));
  ic.frustumCulled = false; group.add(ic);

  // ── atmosphere: overcast sky, falling snow, chasm mist ───────────────────────────────────────────────
  {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#6f8297'); grad.addColorStop(0.42, '#b9c6d3'); grad.addColorStop(0.5, '#d6dfe7'); grad.addColorStop(1, '#8796a6');
    g.fillStyle = grad; g.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 160; i++) { // cloud banks
      const x = Math.random() * 1024, y = 60 + Math.random() * 170, r = 30 + Math.random() * 90;
      const cg = g.createRadialGradient(x, y, 0, x, y, r);
      cg.addColorStop(0, `rgba(235,240,246,${0.18 + Math.random() * 0.2})`); cg.addColorStop(1, 'rgba(235,240,246,0)');
      g.fillStyle = cg; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const sky = new THREE.CanvasTexture(c);
    sky.mapping = THREE.EquirectangularReflectionMapping; sky.colorSpace = THREE.SRGBColorSpace;
    scene.background = sky; scene.environment = sky; scene.environmentIntensity = 0.6;
  }
  scene.fog = new THREE.FogExp2(0xc0cbd6, 0.0034);
  const sun = new THREE.DirectionalLight(0xe8f0ff, 3.2);
  sun.position.set(40, 80, 30);
  sun.castShadow = !lo; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 110, bottom: -110, near: 1, far: 260 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05;
  const hemi = new THREE.HemisphereLight(0xc8d8ea, 0x3a4452, 0.95);
  group.add(sun, sun.target, hemi);
  // falling snow (follows the camera)
  const SN = lo ? 900 : 2600;
  const snowPos = new Float32Array(SN * 3);
  for (let i = 0; i < SN; i++) snowPos.set([(Math.random() - 0.5) * 60, Math.random() * 30, (Math.random() - 0.5) * 60], i * 3);
  const snowGeo = new THREE.BufferGeometry(); snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  const snowPts = new THREE.PointsNodeMaterial({ size: 0.07, sizeAttenuation: true, transparent: true, depthWrite: false });
  snowPts.colorNode = color(0xffffff);
  // sprites have no surface normal; give the AO pass a flat one so the MRT pipeline compiles
  (snowPts as any).mrtNode = tslMrt({ output: tslOutput, normal: tslVec4(0.5, 0.5, 1.0, 1.0) });
  snowPts.opacityNode = float(0.85);
  const snow = new THREE.Points(snowGeo, snowPts); snow.frustumCulled = false; group.add(snow);
  // chasm mist sheet
  const mistMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  mistMat.colorNode = color(0xdfe9f2);
  mistMat.opacityNode = float(0.55).mul(smoothstep(float(0.0), float(0.25), uv().x)).mul(smoothstep(float(1.0), float(0.75), uv().x));
  const mist = new THREE.Mesh(new THREE.PlaneGeometry(CHASM_X1 - CHASM_X0 + 6, 170), mistMat);
  mist.rotation.x = -Math.PI / 2; mist.position.set((CHASM_X0 + CHASM_X1) / 2, -16, 8); group.add(mist);

  scene.add(group);

  const enemySpots: THREE.Vector3[] = [];
  for (const [x, z] of [[-14, 20], [4, 22], [-6, 4], [14, 8], [-20, -8], [8, -16], [-48, -8], [-48, 10], [-6, -34], [64, 6], [40, 49], [0, -60], [-30, 30], [20, 36]]) {
    enemySpots.push(new THREE.Vector3(x, glacialHeight(x, z) + 0.1, z));
  }

  const info: LevelInfo = { id: 'glacial-citadel', name: 'Glacial Citadel', track: 'combat', accentHex: 0x3fd4ff };
  let elapsed = 0;
  const cam = new THREE.Vector3();
  return {
    group, uBeatPulse, gates: [], traps: [], biomeIndex: 0, info,
    spawns: {
      a: { pos: new THREE.Vector3(0, 12.6, 86), yaw: 0 },
      b: { pos: new THREE.Vector3(0, 9.3, shrineZ + 14), yaw: Math.PI },
    },
    enemySpots,
    setBiome() { return { name: info.name, track: info.track }; },
    update(dt, pulse) {
      elapsed += dt;
      uBeatPulse.value = pulse;
      padRing.rotation.z += dt * 0.3;
      portal.rotation.z -= dt * 0.4;
      portalLight.intensity = 140 + pulse * 50;
      // snow drifts down around the camera
      scene.getObjectByProperty('isCamera', true)?.getWorldPosition(cam);
      const p = snowGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < SN; i++) {
        let y = p.getY(i) - dt * (1.2 + (i % 7) * 0.15);
        if (y < -2) y += 32;
        p.setY(i, y);
        p.setX(i, p.getX(i) + Math.sin(elapsed * 0.6 + i) * dt * 0.3);
      }
      p.needsUpdate = true;
      snow.position.set(Math.round(cam.x / 30) * 30, cam.y - 8, Math.round(cam.z / 30) * 30);
    },
    resolveDynamicGates() { /* none */ },
  };
}
