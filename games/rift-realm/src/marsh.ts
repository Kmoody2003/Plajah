// Level 4 — Sunken Marshland Village (6v6 Team Arena / 12v12 Battleground). See docs/rift-realm-levels.md.
// Built to the concept "Swamp map game level design": the mossy gothic balustrade overlook (Team A, SW), the ruined
// manor with lit windows and twin stairs descending into the swamp (W), green-glowing stone causeways winding through
// shallow water, giant fallen trees lying across the channels, and the stilt-house village of huts, decks, ladders and
// rope bridges around a moss-hung cypress (E, Team B). Frame: +z = south, y up, metres. Water surface y = 0.
import * as THREE from 'three/webgpu';
import { color, float, luminance, mix, positionWorld, smoothstep, texture as tslTexture, time, uniform, uv, vec2, vec3 } from 'three/tsl';
import { StaticKit, boulder, fbm3, rng, taperTube } from './geom';
import { builders } from './structures';
import { circuitTexture } from './decals';
import { pbr, leafTexture, fernTexture } from './textures';
import { riftWater } from './water';
import type { Level, LevelInfo, Tier } from './shrine';

const smooth = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
// causeway spine points (the art's green-lit stone paths)
const PATHS: [number, number][][] = [
  [[-16, 26], [-10, 18], [-4, 10], [0, 2], [4, -6], [14, -10], [24, -10]],
  [[0, 2], [-10, -2], [-20, -6], [-27, -10]],
  [[4, -6], [6, -18], [14, -28], [26, -32]],
  [[-4, 10], [8, 14], [18, 18], [28, 14]],
  [[-10, -2], [-12, -14], [-14, -22]],          // north to the sunken shrine's forecourt
];
/** The sunken shrine (N): a stepped stone temple on a terraced plinth, half-claimed by the swamp. */
const SHRINE = { x: -14, z: -36 };
/** The swamp docks (NE) deck height. */
const DOCK_Y = 0.5;

export function marshHeight(x: number, z: number): number {
  let h = -0.75 + (fbm3(x * 0.06, 1, z * 0.06) - 0.5) * 0.9;                     // mud bottom under shallow water
  h = Math.max(h, 0.15 * smooth(0.7, 1, fbm3(x * 0.05 + 9, 0, z * 0.05)));       // mud hummocks breaking the surface
  h = Math.max(h, 6 * smooth(2, -2, x) * smooth(-38, -34, x) * smooth(24, 28, z)); // S overlook terrace (Team A), faces north
  h = Math.max(h, 2.2 * smooth(-30, -34, x) * smooth(4, 0, z) * smooth(-34, -30, z)); // manor terrace (W)
  h = Math.max(h, 0.3 * smooth(17, 12, Math.hypot(x - SHRINE.x, (z - SHRINE.z) * 0.8)));   // the shrine's mud island
  const edge = Math.max(smooth(66, 86, Math.abs(x)), smooth(64, 84, Math.abs(z + 5)));
  return Math.max(h, edge * (8 + fbm3(x * 0.04, 2, z * 0.04) * 10));
}

export function buildMarsh(scene: THREE.Scene, tier: Tier = 'high'): Level {
  const lo = tier === 'low';
  const group = new THREE.Group();
  const uBeatPulse = uniform(0);
  const kit = new StaticKit();
  const B = builders(kit);
  const R = rng(77);
  const shrineSpin: THREE.Object3D[] = [], runeDiscs: THREE.Mesh[] = [];
  let mushroomMat: THREE.MeshStandardNodeMaterial | undefined;
  const steel = new THREE.MeshStandardNodeMaterial({ color: 0x3a3836, roughness: 0.5, metalness: 0.8 });
  const glowGreen = color(0x3dff7a);

  const desat = (m: THREE.MeshStandardNodeMaterial, keep: number) => { const c = tslTexture(m.map!, uv()).rgb; m.colorNode = mix(vec3(luminance(c)), c, keep).mul(color(m.color)); return m; };
  const mud = pbr('marsh-mud', { maps: ['normal', 'roughness'], tint: 0x8c9a80 });
  const wood = pbr('marsh-wood', { maps: ['normal', 'roughness', 'ao'], tint: 0xb8b0a0 });
  const darkWood = pbr('marsh-wood', { maps: ['normal', 'roughness', 'ao'], tint: 0x6e665a });
  const stone = desat(pbr('glacial-brick', { maps: ['normal', 'roughness', 'ao'], tint: 0x7d8a76, normalScale: 1.2 }), 0.12);
  // moss creeps over every upward-facing stone surface
  {
    const c = mix(vec3(luminance(tslTexture(stone.map!, uv()).rgb)), tslTexture(stone.map!, uv()).rgb, 0.12).mul(color(0x7d8a76));
    const mossK = smoothstep(float(0.45), float(0.85), tslTexture(mud.map!, positionWorld.xz.mul(0.07)).g.mul(1.6));
    stone.colorNode = mix(c, vec3(0.16, 0.24, 0.1), mossK.mul(0.55));
  }
  const pathStone = desat(pbr('glacial-brick', { maps: ['normal', 'roughness', 'ao'], tint: 0x6b7466 }), 0.1);
  const pathGlow = new THREE.MeshStandardNodeMaterial({ color: 0x041a0a, roughness: 0.4 });
  pathGlow.emissiveNode = glowGreen.mul(float(1.6).add(uBeatPulse.mul(1.2)));
  const bark = pbr('marsh-mud', { maps: ['normal', 'roughness'], tint: 0x4a4436, normalScale: 1.5 });
  const roofMat = pbr('marsh-wood', { maps: ['normal', 'roughness'], tint: 0x5a564c });
  const windowMat = new THREE.MeshStandardNodeMaterial({ color: 0x1a0d06, roughness: 0.4 });
  windowMat.emissiveNode = color(0xffa448).mul(0.5); // warm candle-lit interiors, not flat light panels
  const rope = new THREE.MeshStandardNodeMaterial({ color: 0x6a5a40, roughness: 0.9 });
  // water: dark green, glossy, scrolling ripples from the swamp-water sheet's normals, algae mats
  const waterSrc = pbr('marsh-water', { maps: ['normal'] });
  // the Apex water (water.ts) tuned murky: slow swamp drift, low chop, a faint green-gold glow, algae mats on top
  const water = riftWater({ deep: 0x030a06, shallow: 0x16301a, glow: 0x9bdc5a, glowAmt: 0.12, flow: 'still', speed: 0.08, chop: 0.55, foam: 0, sky: 0x2a3a2c, skyAmt: 0.35, opacity: 0.9, lowTier: lo });
  {
    const algae = tslTexture(waterSrc.map!, positionWorld.xz.mul(0.05).add(vec2(time.mul(0.003), 0))).rgb;
    const patch = smoothstep(float(0.55), float(0.75), luminance(tslTexture(mud.map!, positionWorld.xz.mul(0.02)).rgb).add(0.25));
    water.colorNode = mix(water.colorNode as any, algae.mul(vec3(0.5, 0.8, 0.35)), patch.mul(0.7));
    water.roughnessNode = mix(water.roughnessNode as any, float(0.8), patch); // algae mats are matte
  }

  // ── terrain + water ──────────────────────────────────────────────────────────────────────────────────
  {
    const g = new THREE.PlaneGeometry(230, 220, lo ? 100 : 170, lo ? 100 : 160);
    g.rotateX(-Math.PI / 2); g.translate(0, 0, -5);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, marshHeight(p.getX(i), p.getZ(i)));
    g.computeVertexNormals();
    kit.add(mud, g, { tpm: 0.1 });
  }
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(240, 230), water);
  sheet.rotation.x = -Math.PI / 2; sheet.position.set(0, 0, -5); sheet.receiveShadow = true; group.add(sheet);

  // ── green-lit causeways (raised stone paths with a glowing inlay down each edge) ─────────────────────
  for (const path of PATHS) for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i], [bx, bz] = path[i + 1];
    const len = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az);
    kit.box(pathStone, 2.6, 0.9, len + 2.6, (ax + bx) / 2, -0.2, (az + bz) / 2, yaw, { tpm: 0.5 });
    for (const s of [-1, 1]) kit.box(pathGlow, 0.12, 0.05, len + 2.2, (ax + bx) / 2 + Math.cos(yaw) * s * 1.1, 0.27, (az + bz) / 2 - Math.sin(yaw) * s * 1.1, yaw, { solid: false, shadow: false, tpm: 1 });
  }

  // ── SW overlook: mossy gothic balustrade terrace (Team A) ───────────────────────────────────────────
  {
    const y = 6;
    // arcaded balustrade along the terrace lip, open at the stair head (x -18..-14)
    for (const [a, b] of [[-36, -18], [-14, 0]] as const) {
      for (let x = a + 0.8; x < b; x += 1.6) kit.prism(stone, 8, 0.16, 0.22, 1.0, x, y, 24.6, 0, { tpm: 1 });
      kit.box(stone, b - a, 0.35, 0.8, (a + b) / 2, y + 1.15, 24.6, 0, { tpm: 0.5 });
      kit.box(stone, b - a, 0.3, 0.9, (a + b) / 2, y + 0.1, 24.6, 0, { tpm: 0.5 });
      for (let x = a; x <= b; x += (b - a) / 3) kit.box(stone, 0.9, 1.6, 0.9, x, y + 0.8, 24.6, 0, { tpm: 0.6 }); // newel posts
    }
    B.flight(stone, -16, -0.2, 18.6, 0, y, 4, 0.26, 0.42);
    B.gothicWall(stone, -18, 40, 0, 36, 12, 4, y);
  }

  // ── W: the ruined manor on its terrace, twin stairs descending into the water ───────────────────────
  {
    const mx = -42, mz = -12, y0 = 2.2; // left third of the overlook view, as in the concept
    B.gothicWall(stone, mx + 8, mz + 8, Math.PI / 2, 26, 18, 4, y0);
    B.gothicWall(stone, mx - 2, mz - 6, 0, 22, 22, 3, y0);
    B.gothicWall(stone, mx + 8, mz + 8, Math.PI / 2, 26, 7, 4, y0 + 18.6, 1.0, 0.7); // ruined upper storey
    for (let i = 0; i < 4; i++) kit.box(windowMat, 3.0, 4.0, 0.2, mx + 8.6, y0 + 10.5, mz - 2 + i * 6, Math.PI / 2, { solid: false, shadow: false, tpm: 1 });
    B.gothicWall(stone, mx - 2, mz + 21, 0, 22, 10, 3, y0, 1.2, 0.55);
    kit.box(stone, 20, 0.5, 26, mx - 2, y0 + 7, mz + 7, 0, { tpm: 0.4 });
    kit.box(stone, 20, 0.5, 26, mx - 2, y0 + 14, mz + 7, 0, { tpm: 0.4 });
    for (let i = 0; i < 4; i++) kit.box(windowMat, 3.2, 3.4, 0.2, mx + 8.7, y0 + 2.6, mz - 2 + i * 6, Math.PI / 2, { solid: false, shadow: false, tpm: 1 });
    B.tower(stone, mx - 14, mz - 6, 8, 32, y0);
    B.tower(stone, mx + 6, mz - 8, 6, 28, y0); // the broken gothic spire right of the hall
    B.flight(stone, mx + 21, -0.3, mz + 2, -Math.PI / 2, y0, 8, 0.26, 0.42); // grand stair into the water
    B.flight(stone, mx + 13, y0 + 0.05, mz + 18, Math.PI, y0 + 7, 3, 0.26, 0.42);
    const l = new THREE.PointLight(0xffa448, 26, 20, 2); l.position.set(mx + 4, y0 + 3, mz + 6); group.add(l);
  }

  // ── fallen giants across the channels (cover + climbable bridges) ─────────────────────────────────────
  const treeGeos: THREE.BufferGeometry[] = [];
  const fallen = (ax: number, az: number, bx: number, bz: number, r: number) => {
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(ax, 0.4, az), new THREE.Vector3((ax + bx) / 2, 1.2 + r, (az + bz) / 2), new THREE.Vector3(bx, 0.3, bz)]);
    treeGeos.push(taperTube(c, r, r * 0.55, 24, 12, 0.5));
    for (let k = 0; k < 7; k++) { // the root plate fanning out at the base
      const a = (k / 7) * Math.PI * 2, rr = r * (2 + R() * 1.5);
      treeGeos.push(taperTube(new THREE.CatmullRomCurve3([new THREE.Vector3(ax, 0.6, az), new THREE.Vector3(ax + Math.cos(a) * rr * 0.6, 0.6 + Math.sin(a) * rr * 0.7, az + Math.sin(a) * 0.6), new THREE.Vector3(ax + Math.cos(a) * rr, Math.sin(a) * rr, az - 1 + R() * 2)]), r * 0.28, 0.06, 8, 6, 0.6));
    }
    // solid core for collision (the tube itself is rendered; a box of its span carries the capsule)
    const len = Math.hypot(bx - ax, bz - az);
    kit.box(B.invisible, r * 1.4, r * 1.4, len, (ax + bx) / 2, 0.9 + r * 0.3, (az + bz) / 2, Math.atan2(bx - ax, bz - az), { shadow: false });
  };
  // the concept's fallen giants: one sprawling across the middle distance, root plate toward the village
  fallen(14, 8, -4, 18, 2.8); fallen(-6, -18, 14, -22, 2.2); fallen(-24, 6, -10, 14, 1.6); fallen(4, -34, 22, -40, 2.0);

  // ── giant cypresses with Spanish moss ────────────────────────────────────────────────────────────────
  const leafMat = new THREE.MeshStandardNodeMaterial({ map: leafTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, color: 0x4c6248 }); // dark canopy, as in the night concept
  const mossMat = new THREE.MeshStandardNodeMaterial({ map: fernTexture(), alphaTest: 0.35, side: THREE.DoubleSide, roughness: 1, color: 0x8a9a78 });
  const cards = new THREE.InstancedMesh(new THREE.PlaneGeometry(3.6, 3.6), leafMat, lo ? 1600 : 4200);
  const moss = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.2, 6.5), mossMat, lo ? 700 : 2200);
  let nc = 0, nm = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const cypress = (x: number, z: number, H: number, r: number) => {
    treeGeos.push(taperTube(new THREE.CatmullRomCurve3([new THREE.Vector3(x, -1, z), new THREE.Vector3(x + 0.5, H * 0.4, z), new THREE.Vector3(x - 0.6, H, z + 0.4)]), r, r * 0.35, 16, 12, 0.5));
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      treeGeos.push(taperTube(new THREE.CatmullRomCurve3([new THREE.Vector3(x, 3, z), new THREE.Vector3(x + Math.cos(a) * r * 1.4, 0.6, z + Math.sin(a) * r * 1.4), new THREE.Vector3(x + Math.cos(a) * r * 2.6, -0.8, z + Math.sin(a) * r * 2.6)]), r * 0.4, 0.15, 8, 6, 0.6));
    }
    for (let b = 0; b < 9; b++) { // spreading limbs + leaf cards + curtains of hanging moss
      const a = R() * 6.28, hy = H * (0.45 + R() * 0.45), L = (6 + R() * 8) * (H / 34);
      const end = new THREE.Vector3(x + Math.cos(a) * L, hy + 2 + R() * 2, z + Math.sin(a) * L);
      treeGeos.push(taperTube(new THREE.CatmullRomCurve3([new THREE.Vector3(x, hy, z), new THREE.Vector3((x + end.x) / 2, hy + 1, (z + end.z) / 2), end]), r * 0.3, 0.12, 8, 6, 0.4));
      for (let l = 0; l < 46 && nc < cards.count; l++, nc++) {
        m4.compose(end.clone().add(new THREE.Vector3((R() - 0.5) * 9, (R() - 0.35) * 3.5, (R() - 0.5) * 9)), q.setFromEuler(e.set((R() - 0.5) * 1.4, R() * 6.28, (R() - 0.5) * 1.4)), new THREE.Vector3(1, 1, 1).multiplyScalar(0.6 + R() * 0.7));
        cards.setMatrixAt(nc, m4);
      }
      for (let l = 0; l < 24 && nm < moss.count; l++, nm++) {
        const t = R(), p = new THREE.Vector3(x + Math.cos(a) * L * t, hy + 1 + t * 2 - 2.2, z + Math.sin(a) * L * t);
        m4.compose(p, q.setFromEuler(e.set(0, R() * 6.28, 0)), new THREE.Vector3(1, 0.7 + R() * 0.9, 1));
        moss.setMatrixAt(nm, m4);
      }
    }
    kit.prism(B.invisible, 8, r, r, H, x, -1, z, 0);
  };
  // colossal swamp cypresses: the hero tree (village) and a framing giant at the right edge of the overlook view
  for (const [x, z, H, r] of [[30, -19, 46, 3.6], [48, 14, 40, 3.6], [44, -34, 36, 3.2], [16, -46, 32, 2.8], [-2, -56, 30, 2.6], [-58, 26, 30, 2.8], [62, -12, 34, 3], [-30, -54, 34, 3], [10, 44, 24, 2]] as const) cypress(x, z, H, r);
  cards.count = nc; moss.count = nm; cards.frustumCulled = moss.frustumCulled = false;
  group.add(cards, moss);

  // ── E: the stilt village (Team B) — huts on stilts, decks, ladders, rope bridges, lanterns ──────────
  const decks: [number, number, number, number, number][] = [[24, -12, 3.6, 10, 8], [36, -28, 3.6, 9, 8], [20, -28, 4.2, 7, 6], [38, -4, 4.8, 8, 7], [34, 12, 3.4, 8, 7], [50, -16, 6.2, 7, 6], [30, -19, 13, 14, 14]]; // last: the treehouse wrapped round the hero cypress
  const lanterns: THREE.PointLight[] = [];
  for (const [x, z, y, w, d] of decks) {
    kit.box(wood, w, 0.3, d, x, y, z, 0, { tpm: 0.5 });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]]) kit.prism(darkWood, 6, 0.18, 0.22, y + 1.5, x + sx * (w / 2 - 0.3), -1.5, z + sz * (d / 2 - 0.3), 0, { tpm: 0.6 });
    // the hut: plank walls, door, lit window, steep gabled roof
    const hw = w * 0.62, hd = d * 0.55, hh = 3.2;
    for (const s of [-1, 1]) {
      kit.box(wood, hw, hh, 0.2, x, y + hh / 2, z + s * hd / 2, 0, { tpm: 0.6 });
      kit.box(wood, 0.2, hh, hd, x + s * hw / 2, y + hh / 2, z, 0, { tpm: 0.6 });
      const roof = new THREE.BoxGeometry(hw + 1.2, 0.2, hd / 2 / Math.cos(0.75) + 0.6);
      kit.place(roof, x, y + hh + 0.95, z + s * hd / 4, 0, s * 0.75);
      kit.add(roofMat, roof, { tpm: 0.6 });
    }
    kit.box(windowMat, 1.1, 0.9, 0.05, x - hw * 0.25, y + 1.8, z + hd / 2 + 0.13, 0, { solid: false, shadow: false, tpm: 1 });
    kit.box(darkWood, 1.0, 2.0, 0.24, x + hw * 0.2, y + 1.0, z + hd / 2 + 0.02, 0, { solid: false, tpm: 1 });
    // railing round the deck edge
    for (const s of [-1, 1]) {
      kit.box(darkWood, w, 0.08, 0.08, x, y + 1.0, z + s * d / 2, 0, { tpm: 1, solid: false, shadow: false });
      kit.box(B.invisible, w, 1.1, 0.1, x, y + 0.6, z + s * d / 2, 0, { shadow: false });
    }
    // ladder down to the water (with a glide ramp so it can be climbed)
    B.steelStair(darkWood, x - w / 2 - 0.2, -0.6, z + d / 2 + 2.6, Math.PI, y, 1.0);
    if (!lo || lanterns.length < 3) { const l = new THREE.PointLight(0xffa448, 10, 12, 2); l.position.set(x - hw * 0.25, y + 2, z + hd / 2 + 0.8); group.add(l); lanterns.push(l); }
  }
  // rope bridges between decks: plank treads, sagging rope rails
  const ropeBridge = (a: number, b: number) => {
    const [ax, az, ay] = decks[a], [bx, bz, by] = decks[b];
    const n = Math.round(Math.hypot(bx - ax, bz - az) / 0.55), yaw = Math.atan2(bx - ax, bz - az);
    for (let i = 0; i <= n; i++) {
      const t = i / n, sag = Math.sin(t * Math.PI) * 0.6;
      kit.box(wood, 1.4, 0.08, 0.38, ax + (bx - ax) * t, ay + (by - ay) * t - sag + 0.12, az + (bz - az) * t, yaw, { tpm: 1, shadow: false, solid: false });
    }
    B.ramp(ax, ay + 0.15, az, (ax + bx) / 2, Math.min(ay, by) - 0.45, (az + bz) / 2, 1.4);
    B.ramp((ax + bx) / 2, Math.min(ay, by) - 0.45, (az + bz) / 2, bx, by + 0.15, bz, 1.4);
    for (const s of [-0.75, 0.75]) {
      const pts = Array.from({ length: 9 }, (_, i) => { const t = i / 8; return new THREE.Vector3(ax + (bx - ax) * t + Math.cos(yaw) * s, ay + (by - ay) * t + 1.0 - Math.sin(t * Math.PI) * 0.5, az + (bz - az) * t - Math.sin(yaw) * s); });
      group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.035, 4), rope));
    }
  };
  ropeBridge(0, 1); ropeBridge(0, 2); ropeBridge(0, 3); ropeBridge(3, 5); ropeBridge(1, 5); ropeBridge(3, 4);
  // the treehouse high in the hero cypress, reached by a ladder-stair from the main deck
  B.steelStair(darkWood, 34.6, 4.8, -1.8, Math.PI, 13, 1.1); // lands on the treehouse edge (z -12), clear of the hut
  // boardwalks from the causeways up onto the village (SE + N approaches)
  B.flight(wood, 18, -0.2, -10, Math.PI / 2, 3.6, 2.4, 0.3, 0.42, false);
  B.flight(wood, 22, -0.2, 14, Math.PI / 2, 3.4, 2.4, 0.3, 0.42, false);

  buildShrine();
  buildDocks();

  // reeds + debris
  for (let i = 0; i < (lo ? 30 : 80); i++) {
    const x = -50 + R() * 100, z = -50 + R() * 90, g = boulder(0.25 + R() * 0.5, 900 + i, 1);
    kit.place(g, x, marshHeight(x, z) + 0.1, z, R() * 6); kit.add(stone, g, { tpm: 0.7, solid: false, shadow: false });
  }
  {
    const fixed = treeGeos.map((g) => {
      const n = g.index ? g.toNonIndexed() : g; n.computeVertexNormals();
      const p = n.attributes.position, uvA = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) { uvA[i * 2] = (p.getX(i) + p.getZ(i)) * 0.3; uvA[i * 2 + 1] = p.getY(i) * 0.3; }
      n.setAttribute('uv', new THREE.BufferAttribute(uvA, 2));
      return n;
    });
    for (const g of fixed) kit.add(bark, g, { solid: false });
  }
  // ── N: the sunken shrine (art: "Sunken marshland village shrine") ─────────────────────────────────────
  // A stepped temple tower on a two-tier plinth, guardian statues seated either side, steles at the forecourt corners,
  // glowing swamp mushrooms, and cyan circuits etched through the forecourt flagstones. The sanctum is a small room
  // with a glowing orb altar: a close-quarters capture, with the plinth tiers as high ground (battleground buff shrine).
  function buildShrine() {
    const { x: sx, z: sz } = SHRINE;
    const T1 = 1.0, T2 = 2.2;
    kit.box(stone, 18, T1 + 1, 16, sx, (T1 - 1) / 2, sz, 0, { tpm: 0.4 });                    // lower tier (z -44..-28)
    kit.box(stone, 13, T2 + 1, 11, sx, (T2 - 1) / 2, sz + 0.7, 0, { tpm: 0.4 });              // upper tier (z -40.8..-29.8)
    for (const [w, d, y, z] of [[18.6, 16.6, T1, sz], [13.6, 11.6, T2, sz + 0.7]] as const) kit.box(stone, w, 0.25, d, sx, y - 0.05, z, 0, { tpm: 0.6, solid: false }); // cornice lips
    B.flight(stone, sx, 0.3, sz + 9.5, Math.PI, T2, 5, 0.25, 0.4);                            // south stair, forecourt → upper tier
    for (const s of [-1, 1]) B.flight(stone, sx + s * 9.6, -0.4, sz - 2, s > 0 ? -Math.PI / 2 : Math.PI / 2, T1, 2.4, 0.25, 0.4, false); // side steps out of the water
    // forecourt flagstones with the cyan circuits running through them
    kit.box(pathStone, 16, 0.6, 8, sx, 0, sz + 12, 0, { tpm: 0.35 });
    const circ = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const ct = circuitTexture(512, 256, '#8ff6ff', 31, 14, false);
    circ.colorNode = tslTexture(ct, uv()).rgb.mul(color(0x48e8ff)).mul(float(1.1).add(uBeatPulse.mul(0.6)));
    const deco = new THREE.Mesh(new THREE.PlaneGeometry(15, 7.5), circ); deco.rotation.x = -Math.PI / 2; deco.position.set(sx, 0.31, sz + 12); group.add(deco);
    // the sanctum: a hollow shrine with a doorway south, then the stepped tower over it
    const by = T2, bz = sz - 0.5, W = 7, H = 6;
    for (const [w, d, x, z] of [[W, 1, sx, bz - W / 2 + 0.5], [1, W, sx - W / 2 + 0.5, bz], [1, W, sx + W / 2 - 0.5, bz], [2.3, 1, sx - 2.35, bz + W / 2 - 0.5], [2.3, 1, sx + 2.35, bz + W / 2 - 0.5]] as const) kit.box(stone, w, H, d, x, by + H / 2, z, 0, { tpm: 0.4 });
    kit.box(stone, 2.4, H - 3.6, 1, sx, by + 3.6 + (H - 3.6) / 2, bz + W / 2 - 0.5, 0, { tpm: 0.4 }); // lintel over the 2.4 x 3.6 door
    kit.box(stone, W + 0.6, 0.6, W + 0.6, sx, by + H + 0.3, bz, 0, { tpm: 0.5 });
    for (let k = 0; k < 5; k++) { // the prasat: stacked receding storeys, each with a cornice
      const w = 6.2 - k * 1.05, y = by + H + 0.6 + k * 1.5;
      kit.box(stone, w, 1.2, w, sx, y + 0.6, bz, 0, { tpm: 0.5, solid: k === 0 });
      kit.box(stone, w + 0.5, 0.3, w + 0.5, sx, y + 1.35, bz, 0, { tpm: 0.6, solid: false });
      for (const [ox, oz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { const c = new THREE.ConeGeometry(0.3, 0.9, 4); kit.place(c, sx + ox * (w / 2 + 0.1), y + 1.95, bz + oz * (w / 2 + 0.1)); kit.add(stone, c, { tpm: 1, solid: false }); }
    }
    { const c = new THREE.ConeGeometry(0.9, 3.0, 8); kit.place(c, sx, by + H + 0.6 + 7.5 + 1.5, bz); kit.add(stone, c, { tpm: 0.8, solid: false }); }
    // false doors on the other faces and a carved door frame (the art's relief panels)
    for (const [x, z, ry] of [[sx, bz - W / 2 - 0.05, 0], [sx - W / 2 - 0.05, bz, Math.PI / 2], [sx + W / 2 + 0.05, bz, Math.PI / 2]] as const) kit.box(pathStone, 2.2, 3.4, 0.2, x, by + 1.8, z, ry, { tpm: 0.6, solid: false });
    for (const s of [-1, 1]) kit.box(pathStone, 0.5, 4.2, 0.5, sx + s * 1.45, by + 2.1, bz + W / 2 + 0.1, 0, { tpm: 0.6 });
    // the orb altar inside, and its glow spilling out of the door
    const orbMat = new THREE.MeshBasicNodeMaterial(); orbMat.colorNode = color(0x6dffd0).mul(float(2.2).add(uBeatPulse.mul(1.6)));
    kit.box(pathStone, 1.4, 1.0, 1.4, sx, by + 0.5, bz - 1.2, 0, { tpm: 0.8 });
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 2), orbMat); orb.position.set(sx, by + 1.65, bz - 1.2); group.add(orb);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.04, 6, 32), orbMat); ring.position.copy(orb.position); group.add(ring);
    shrineSpin.push(orb, ring);
    const ol = new THREE.PointLight(0x5dffb8, lo ? 10 : 16, 14, 2); ol.position.set(sx, by + 1.8, bz + 1); group.add(ol);
    const fill = new THREE.PointLight(0xb8d4c8, 55, 34, 2); fill.position.set(sx + 3, 10, sz + 14); group.add(fill); // moonlight pooling in the clearing
    // steles at the forecourt corners
    for (const s of [-1, 1]) {
      kit.box(stone, 1.3, 4.6, 1.1, sx + s * 7, 0.3 + 2.3, sz + 9, 0, { tpm: 0.6 });
      kit.box(stone, 1.7, 0.5, 1.5, sx + s * 7, 0.3 + 4.85, sz + 9, 0, { tpm: 0.6 });
      kit.box(stone, 1.0, 0.8, 0.9, sx + s * 7, 0.3 + 5.5, sz + 9, 0, { tpm: 0.6, solid: false });
    }
    // seated guardians either side of the stair, eyes lit
    const eyes = new THREE.MeshBasicNodeMaterial(); eyes.colorNode = color(0x7ff4ff).mul(3);
    const guardian = (x: number, z: number, y: number, k: number) => {
      kit.box(stone, 2.6 * k, 0.8 * k, 2.4 * k, x, y + 0.4 * k, z, 0, { tpm: 0.6 });                       // plinth
      kit.box(stone, 2.2 * k, 1.1 * k, 2.0 * k, x, y + 1.35 * k, z + 0.2 * k, 0, { tpm: 0.6 });             // folded legs
      kit.box(stone, 1.6 * k, 2.2 * k, 1.1 * k, x, y + 3.0 * k, z - 0.3 * k, 0, { tpm: 0.6 });              // torso
      for (const s of [-1, 1]) {
        kit.box(stone, 0.5 * k, 1.9 * k, 0.6 * k, x + s * 1.05 * k, y + 2.9 * k, z - 0.1 * k, 0, { tpm: 0.7, solid: false, rz: s * 0.12 }); // arms
        kit.box(stone, 0.7 * k, 0.4 * k, 0.9 * k, x + s * 0.7 * k, y + 2.0 * k, z + 0.6 * k, 0, { tpm: 0.7, solid: false });              // hands on knees
      }
      kit.box(stone, 0.9 * k, 1.0 * k, 0.9 * k, x, y + 4.6 * k, z - 0.3 * k, 0, { tpm: 0.7, solid: false });                            // head
      const crown = new THREE.ConeGeometry(0.45 * k, 1.1 * k, 6); kit.place(crown, x, y + 5.65 * k, z - 0.3 * k); kit.add(stone, crown, { tpm: 1, solid: false });
      for (const s of [-1, 1]) kit.box(eyes, 0.14 * k, 0.07 * k, 0.04 * k, x + s * 0.2 * k, y + 4.75 * k, z + 0.16 * k, 0, { solid: false, shadow: false, tpm: 1 });
    };
    guardian(sx - 7.5, sz + 5.2, T1, 1.25); guardian(sx + 7.5, sz + 5.2, T1, 1.25);
    // sunken rubble and broken flagstones around the plinth
    for (let i = 0; i < (lo ? 14 : 34); i++) {
      const a = R() * Math.PI * 2, r = 10 + R() * 7, x = sx + Math.cos(a) * r, z = sz + Math.sin(a) * r * 0.9;
      kit.box(pathStone, 0.8 + R() * 1.2, 0.25, 0.6 + R() * 1.0, x, marshHeight(x, z) + 0.05, z, R() * 6, { tpm: 0.6, solid: false, rx: (R() - 0.5) * 0.3, rz: (R() - 0.5) * 0.3 });
    }
    mushrooms(sx, sz + 3, 14, lo ? 12 : 26);
  }

  // glowing swamp mushrooms (shrine, docks, manor edge)
  function mushrooms(cx: number, cz: number, spread: number, n: number) {
    const capMat = mushroomMat ??= (() => {
      const m = new THREE.MeshStandardNodeMaterial({ color: 0x8cf0a0, roughness: 0.5 });
      m.emissiveNode = glowGreen.mul(float(0.55).add(uBeatPulse.mul(0.35)));
      return m;
    })();
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, r = spread * (0.35 + R() * 0.65), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const big = R() < 0.18, h = big ? 1.4 + R() * 1.0 : 0.3 + R() * 0.6, cr = h * (big ? 0.55 : 0.6);
      const y = Math.max(0, marshHeight(x, z));
      for (let k = 0; k < (big ? 1 : 3); k++) {
        const ox = k ? (R() - 0.5) * 0.9 : 0, oz = k ? (R() - 0.5) * 0.9 : 0, sc = k ? 0.6 : 1;
        const stem = new THREE.CylinderGeometry(cr * 0.16 * sc, cr * 0.22 * sc, h * sc, 6); kit.place(stem, x + ox, y + h * sc / 2, z + oz); kit.add(capMat, stem, { solid: false, shadow: false });
        const cap = new THREE.SphereGeometry(cr * sc, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2.2); cap.scale(1, 0.55, 1); kit.place(cap, x + ox, y + h * sc * 0.95, z + oz); kit.add(capMat, cap, { solid: false, shadow: false });
      }
    }
  }

  // ── NE: the swamp docks (art: "Crane descending over swamp docks") ─────────────────────────────────────
  // Plank piers on piles reaching out from the stilt village into open water: a spine pier, a cross pier with glowing
  // rift wells at its ends, an end platform with two rune circles, lantern gallows, a cargo crane and moored boats.
  // Low and wide: a fast flank lane round the north of the map, with the village decks overhead.
  function buildDocks() {
    const D = DOCK_Y;
    const plank = (w: number, d: number, x: number, z: number, yaw = 0) => {
      kit.box(wood, w, 0.3, d, x, D - 0.15, z, yaw, { tpm: 0.5 });
      const ca = Math.cos(yaw), sa = Math.sin(yaw);
      for (let t = -d / 2 + 0.4; t <= d / 2 - 0.3; t += 3) for (const s of [-1, 1]) {
        const lx = s * (w / 2 - 0.15);
        kit.prism(darkWood, 6, 0.17, 0.2, D + 2.4, x + lx * ca + t * sa, -1.6, z - lx * sa + t * ca, 0, { tpm: 0.6, solid: false });
      }
    };
    plank(4, 23.5, 34, -48.25);                                             // spine (z -36.5..-60)
    plank(28, 4, 34, -50);                                                  // cross pier (x 20..48)
    plank(14, 10, 34, -63);                                                 // end platform
    plank(2.4, 9, 29.5, -35.5, Math.atan2(7, -5));                          // boardwalk from the causeway's end
    B.flight(wood, 36, D, -36.4, 0, 3.6, 2.4, 0.3, 0.42, false);           // up onto the village deck
    // rope rails along the spine and the end platform (low, visual: falling in the shallows is harmless)
    const ropeLine = (pts: [number, number][]) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        const c = new THREE.CatmullRomCurve3([new THREE.Vector3(ax, D + 0.8, az), new THREE.Vector3((ax + bx) / 2, D + 0.55, (az + bz) / 2), new THREE.Vector3(bx, D + 0.8, bz)]);
        group.add(new THREE.Mesh(new THREE.TubeGeometry(c, 8, 0.035, 4), rope));
      }
    };
    for (const s of [-1, 1]) ropeLine([[34 + s * 1.85, -37], [34 + s * 1.85, -40.5], [34 + s * 1.85, -43.5], [34 + s * 1.85, -47.6]]);
    ropeLine([[27.2, -58.2], [27.2, -63], [27.2, -67.8], [34, -67.8], [40.8, -67.8], [40.8, -63], [40.8, -58.2]]);
    // rune circles on the end platform
    const runeTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d')!;
      g.strokeStyle = '#9dffb8'; g.fillStyle = '#9dffb8'; g.lineWidth = 6;
      for (const r of [120, 96]) { g.beginPath(); g.arc(128, 128, r, 0, Math.PI * 2); g.stroke(); }
      g.lineWidth = 3; g.font = 'bold 18px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const glyphs = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗ';
      for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2; g.save(); g.translate(128 + Math.cos(a) * 108, 128 + Math.sin(a) * 108); g.rotate(a + Math.PI / 2); g.fillText(glyphs[i], 0, 0); g.restore(); }
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.beginPath(); g.moveTo(128 + Math.cos(a) * 30, 128 + Math.sin(a) * 30); g.lineTo(128 + Math.cos(a) * 92, 128 + Math.sin(a) * 92); g.stroke(); }
      g.beginPath(); g.arc(128, 128, 28, 0, Math.PI * 2); g.stroke();
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const runeMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    runeMat.colorNode = tslTexture(runeTex, uv()).rgb.mul(glowGreen).mul(float(1.2).add(uBeatPulse.mul(0.9)));
    for (const x of [30, 38]) {
      kit.prism(pathStone, 16, 2.5, 2.6, 0.18, x, D, -63, 0, { tpm: 0.5 });
      const m = new THREE.Mesh(new THREE.CircleGeometry(2.4, 40), runeMat); m.rotation.x = -Math.PI / 2; m.position.set(x, D + 0.2, -63); group.add(m); runeDiscs.push(m);
    }
    // rift wells at the cross pier ends: stone collars round a green-lit shaft, with a column of light
    const shaft = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide }); shaft.colorNode = glowGreen.mul(float(1.4).add(uBeatPulse.mul(1.0)));
    const beam = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    beam.colorNode = glowGreen; beam.opacityNode = uv().y.mul(0.13); // fades upward (cylinder uv.y runs top→bottom)
    for (const x of [21.5, 46.5]) {
      kit.prism(pathStone, 14, 1.5, 1.6, 0.7, x, D - 0.1, -50, 0, { tpm: 0.6 });
      const w = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.6, 20, 1, true), shaft); w.position.set(x, D - 0.2, -50); group.add(w);
      const cap = new THREE.Mesh(new THREE.CircleGeometry(1.1, 20), shaft); cap.rotation.x = -Math.PI / 2; cap.position.set(x, D - 0.6, -50); group.add(cap);
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.05, 7, 16, 1, true), beam); b.position.set(x, D + 4.1, -50); group.add(b);
    }
    // lantern gallows down the spine and round the platform
    const lampMat = new THREE.MeshBasicNodeMaterial(); lampMat.colorNode = color(0xffb45a).mul(4.5);
    const gallows = (x: number, z: number, dir: number) => {
      kit.prism(darkWood, 6, 0.16, 0.2, 3.6, x, D, z, 0, { tpm: 0.6 });
      kit.box(darkWood, 1.3, 0.14, 0.14, x + dir * 0.55, D + 3.4, z, 0, { tpm: 1, solid: false });
      kit.box(steel, 0.32, 0.45, 0.32, x + dir * 1.05, D + 2.9, z, 0, { tpm: 1, solid: false, shadow: false });
      kit.box(lampMat, 0.26, 0.36, 0.26, x + dir * 1.05, D + 2.9, z, 0, { solid: false, shadow: false, tpm: 1 });
    };
    gallows(32, -42, -1); gallows(36, -46, 1); gallows(27.5, -59, -1); gallows(40.5, -59, 1); gallows(41, -67, 1);
    for (const [x, z] of lo ? [[34, -60]] : [[31, -44], [34, -61]]) { const l = new THREE.PointLight(0xffa448, 12, 16, 2); l.position.set(x, D + 2.9, z); group.add(l); lanterns.push(l); }
    // the cargo crane on the end platform
    kit.box(darkWood, 1.6, 0.6, 1.6, 39, D + 0.3, -66, 0, { tpm: 0.6 });
    kit.prism(darkWood, 6, 0.28, 0.34, 7, 39, D + 0.6, -66, 0, { tpm: 0.6 });
    { const jib = new THREE.BoxGeometry(0.3, 0.3, 7.5); kit.place(jib, 39, D + 6.4, -62.8, 0, -0.35); kit.add(darkWood, jib, { tpm: 0.8, solid: false }); }
    const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 4, 4), rope); hook.position.set(39, D + 5.0, -59.6); group.add(hook);
    kit.box(wood, 1.2, 1.0, 1.2, 39, D + 2.6, -59.6, 0.3, { tpm: 0.7, solid: false });
    for (const [x, z, yaw] of [[36.5, -66.5, 0.2], [37.7, -66.2, -0.3]] as const) kit.box(wood, 1.1, 1.0, 1.1, x, D + 0.5, z, yaw, { tpm: 0.7 }); // cargo
    // moored rowboats
    for (const [x, z, yaw] of [[29.5, -45, 0.15], [42, -54, Math.PI / 2 + 0.2], [26, -55, Math.PI / 2 - 0.25], [43, -61, 0.1]] as const) {
      kit.box(darkWood, 1.3, 0.2, 3.6, x, 0.05, z, yaw, { tpm: 0.8, solid: false });
      for (const s of [-1, 1]) kit.box(darkWood, 0.1, 0.5, 3.6, x + Math.cos(yaw) * s * 0.65, 0.3, z - Math.sin(yaw) * s * 0.65, yaw, { tpm: 0.8, solid: false });
      for (const s of [-1, 1]) kit.box(darkWood, 1.3, 0.5, 0.1, x + Math.sin(yaw) * s * 1.8, 0.3, z + Math.cos(yaw) * s * 1.8, yaw, { tpm: 0.8, solid: false });
      kit.box(wood, 1.2, 0.08, 0.3, x, 0.45, z, yaw, { tpm: 1, solid: false });
    }
    mushrooms(24, -44, 4, lo ? 4 : 9);
  }
  kit.build(group);

  // ── atmosphere: dusk overcast, low green fog, fireflies ──────────────────────────────────────────────
  {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#0b1018'); grad.addColorStop(0.45, '#1e2731'); grad.addColorStop(0.52, '#26303a'); grad.addColorStop(1, '#080c0b');
    g.fillStyle = grad; g.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 160; i++) { const x = Math.random() * 1024, y = 40 + Math.random() * 190, r = 40 + Math.random() * 100; const cg = g.createRadialGradient(x, y, 0, x, y, r); cg.addColorStop(0, `rgba(70,82,92,${0.15 + Math.random() * 0.15})`); cg.addColorStop(1, 'rgba(50,60,66,0)'); g.fillStyle = cg; g.fillRect(x - r, y - r, r * 2, r * 2); }
    const sky = new THREE.CanvasTexture(c); sky.mapping = THREE.EquirectangularReflectionMapping; sky.colorSpace = THREE.SRGBColorSpace;
    scene.background = sky; scene.environment = sky; scene.environmentIntensity = 0.25;
  }
  scene.fog = new THREE.FogExp2(0x1f2830, 0.02); // blue-grey night mist, layered depth
  const moon = new THREE.DirectionalLight(0xa8bccf, 1.5);
  moon.position.set(-40, 60, 30); moon.castShadow = !lo; moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 200 });
  moon.shadow.bias = -0.0005; moon.shadow.normalBias = 0.05;
  group.add(moon, moon.target, new THREE.HemisphereLight(0x6f8090, 0x1c2418, 1.1));
  // low mist sheets hugging the water
  const mistMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  mistMat.colorNode = color(0x6f8290);
  mistMat.opacityNode = smoothstep(float(0.8), float(0.2), tslTexture(mud.map!, uv().mul(2).add(vec2(time.mul(0.004), 0))).g).mul(0.06);
  for (let i = 0; i < (lo ? 1 : 2); i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), mistMat); m.rotation.x = -Math.PI / 2; m.position.set(0, 0.6 + i * 0.7, -5); group.add(m); }
  scene.add(group);

  const enemySpots = [[-4, 10], [4, -6], [-12, -2], [14, -10], [8, 14], [-20, -6], [18, 18], [24, -12], [36, -28], [-30, -12], [6, -18], [14, -28]].map(([x, z]) => {
    const deck = decks.find(([dx, dz, , w, d]) => Math.abs(x - dx) < w / 2 && Math.abs(z - dz) < d / 2);
    return new THREE.Vector3(x, deck ? deck[2] + 0.2 : 0.3, z);
  });
  enemySpots.push(new THREE.Vector3(SHRINE.x, 0.4, -24), new THREE.Vector3(SHRINE.x - 6, 1.1, -30), new THREE.Vector3(34, DOCK_Y + 0.1, -50), new THREE.Vector3(34, DOCK_Y + 0.1, -63));
  const info: LevelInfo = { id: 'sunken-marshland', name: 'Sunken Marshland Village', track: 'main', accentHex: 0x3dff7a };
  let elapsed = 0;
  return {
    group, uBeatPulse, gates: [], traps: [], biomeIndex: 0, info,
    spawns: { a: { pos: new THREE.Vector3(-16, 6.3, 32), yaw: -0.1 }, b: { pos: new THREE.Vector3(39, 5.2, -4), yaw: Math.PI / 2 } },
    enemySpots,
    controlPoints: [
      { id: 'A', name: 'Manor Stairs', pos: new THREE.Vector3(-22, 0.3, -14), radius: 6 },
      { id: 'B', name: 'Causeway Cross', pos: new THREE.Vector3(0, 0.3, 2), radius: 6 },
      { id: 'C', name: 'Stilt Village', pos: new THREE.Vector3(24, 3.6, -12), radius: 5 },
    ],
    setBiome() { return { name: info.name, track: info.track }; },
    update(dt, pulse) {
      elapsed += dt; uBeatPulse.value = pulse;
      lanterns.forEach((l, i) => { l.intensity = 9 + Math.sin(elapsed * 7 + i * 3) * 1.5; });
      water.normalScale.set(0.35 + Math.sin(elapsed * 0.5) * 0.05, 0.35);
      shrineSpin.forEach((o, i) => { o.rotation.y = elapsed * (i ? -0.6 : 0.4); o.rotation.x = i ? Math.PI / 2 + Math.sin(elapsed) * 0.3 : 0; });
      runeDiscs.forEach((m, i) => { m.rotation.z = elapsed * (i ? 0.2 : -0.2); });
    },
    resolveDynamicGates() { /* none */ },
  };
}
