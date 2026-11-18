// Level 4 — Sunken Marshland Village (6v6 Team Arena / 12v12 Battleground). See docs/rift-realm-levels.md.
// Built to the concept "Swamp map game level design": the mossy gothic balustrade overlook (Team A, SW), the ruined
// manor with lit windows and twin stairs descending into the swamp (W), green-glowing stone causeways winding through
// shallow water, giant fallen trees lying across the channels, and the stilt-house village of huts, decks, ladders and
// rope bridges around a moss-hung cypress (E, Team B). Frame: +z = south, y up, metres. Water surface y = 0.
import * as THREE from 'three/webgpu';
import { color, float, luminance, mix, positionWorld, smoothstep, texture as tslTexture, time, uniform, uv, vec2, vec3 } from 'three/tsl';
import { StaticKit, boulder, fbm3, rng, taperTube } from './geom';
import { builders } from './structures';
import { pbr, leafTexture, fernTexture } from './textures';
import type { Level, LevelInfo, Tier } from './shrine';

const smooth = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
// causeway spine points (the art's green-lit stone paths)
const PATHS: [number, number][][] = [
  [[-16, 26], [-10, 18], [-4, 10], [0, 2], [4, -6], [14, -10], [24, -10]],
  [[0, 2], [-10, -2], [-20, -6], [-27, -10]],
  [[4, -6], [6, -18], [14, -28], [26, -32]],
  [[-4, 10], [8, 14], [18, 18], [28, 14]],
];

export function marshHeight(x: number, z: number): number {
  let h = -0.75 + (fbm3(x * 0.06, 1, z * 0.06) - 0.5) * 0.9;                     // mud bottom under shallow water
  h = Math.max(h, 0.15 * smooth(0.7, 1, fbm3(x * 0.05 + 9, 0, z * 0.05)));       // mud hummocks breaking the surface
  h = Math.max(h, 6 * smooth(2, -2, x) * smooth(-38, -34, x) * smooth(24, 28, z)); // S overlook terrace (Team A), faces north
  h = Math.max(h, 2.2 * smooth(-30, -34, x) * smooth(4, 0, z) * smooth(-34, -30, z)); // manor terrace (W)
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
  const water = new THREE.MeshStandardNodeMaterial({ color: 0x0c1a12, roughness: 0.2, metalness: 0.0, transparent: true, opacity: 0.94 });
  water.normalMap = waterSrc.normalMap; water.normalScale.set(0.35, 0.35);
  {
    const algae = tslTexture(waterSrc.map!, positionWorld.xz.mul(0.05).add(vec2(time.mul(0.003), 0))).rgb;
    const patch = smoothstep(float(0.55), float(0.75), luminance(tslTexture(mud.map!, positionWorld.xz.mul(0.02)).rgb).add(0.25));
    water.colorNode = mix(vec3(0.012, 0.03, 0.022), algae.mul(vec3(0.5, 0.8, 0.35)), patch.mul(0.7));
    water.roughnessNode = mix(float(0.3), float(0.8), patch); // dark water: glints, not a sky mirror
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
  for (const [x, z, H, r] of [[30, -19, 46, 3.6], [48, 14, 40, 3.6], [44, -34, 36, 3.2], [16, -46, 32, 2.8], [-8, -50, 30, 2.6], [-58, 26, 30, 2.8], [62, -12, 34, 3], [-30, -54, 34, 3], [10, 44, 24, 2]] as const) cypress(x, z, H, r);
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
    },
    resolveDynamicGates() { /* none */ },
  };
}
