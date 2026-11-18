// Level 3 — Obsidian Volcanic Compound (6v6 Team Arena / 12v12 Battleground). See docs/rift-realm-levels.md.
// Built to the concept "Volcanic obsidian fortress game map": the basalt rock ledge with supply crates + concrete barrier
// (Team A overlook, SW), the paved central compound with sunken lava trenches and a gated two-level fortress block with
// steel scaffold stairs, the lava chasm crossed by grated steel bridges (E), the spiked fortress towers with orange laser
// grids and searchlights (NE), the great castle keep (Team B, N) — all under an erupting volcano and an ash sky.
// Frame: +z = south, -z = north, y up, metres. Compound floor y = 0.
import * as THREE from 'three/webgpu';
import {
  color, float, fract, luminance, max, mix, positionWorld, sin, smoothstep, texture as tslTexture, time, uniform, uv, vec2, vec3,
} from 'three/tsl';
import { StaticKit, boulder, fbm3, noise3, rng } from './geom';
import { builders } from './structures';
import { circuitTexture } from './decals';
import { pbr } from './textures';
import type { Level, LevelInfo, Tier } from './shrine';

const smooth = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const box = (x: number, z: number, x0: number, x1: number, z0: number, z1: number, edge: number) =>
  smooth(x0 - edge, x0, x) * smooth(x1 + edge, x1, x) * smooth(z0 - edge, z0, z) * smooth(z1 + edge, z1, z);

export const LAVA_Y = -7;
const TIER = 8;   // the castle's upper tier: the art's second level of battlements behind the compound
const LEDGE = 10; // Team A overlook height: the concept is shot from well above the compound
const CHASM = { x0: 16, x1: 30, z0: -70, z1: 70 };
const PIT_FLOOR = -9; // below the hazard line: the trenches are lethal, crossed by catwalks or a dash
const PITS: [number, number, number, number][] = [[-10, -2, 8, 16], [-2, 8, -10, -2], [4, 10, 8, 18]];
/** The forge hall's cavity under the castle tier (art: "Volcanic compound armory forge interior"). */
const FORGE = { x0: -44, x1: -26, z0: -82, z1: -42 };
const FORGE_FLOOR = -4; // walkway level; the deck at the arch is compound level (0)

/** The throne hall's three lancet windows: leaded glass picturing the erupting volcano, as in the throne-room art. */
function stainedGlassTexture() {
  const W = 512, H = 768, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const lancets: [number, number, number][] = [[40, 142, 170], [188, 324, 0], [370, 472, 170]]; // x0, x1, spring offset
  const shape = (x0: number, x1: number, top: number) => {
    const cx = (x0 + x1) / 2, spring = top + (x1 - x0) * 0.9;
    g.moveTo(x0, H); g.lineTo(x0, spring);
    g.quadraticCurveTo(x0, top + (spring - top) * 0.25, cx, top);
    g.quadraticCurveTo(x1, top + (spring - top) * 0.25, x1, spring);
    g.lineTo(x1, H); g.closePath();
  };
  g.save();
  g.beginPath(); for (const [x0, x1, t] of lancets) { shape(x0, x1, t); } g.clip();
  // the scene: ash sky over an erupting cone, lava running down its flanks
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#2b1d3a'); sky.addColorStop(0.35, '#6b3a4a'); sky.addColorStop(0.55, '#d0602a'); sky.addColorStop(1, '#3a1810');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(256, 330, 10, 256, 330, 260);
  glow.addColorStop(0, 'rgba(255,200,90,1)'); glow.addColorStop(0.3, 'rgba(255,110,30,0.7)'); glow.addColorStop(1, 'rgba(255,80,20,0)');
  g.fillStyle = glow; g.fillRect(0, 0, W, H);
  g.fillStyle = '#2c1610'; g.beginPath(); g.moveTo(-20, H); g.lineTo(220, 340); g.lineTo(292, 340); g.lineTo(532, H); g.closePath(); g.fill();
  const r = rng(77);
  g.strokeStyle = '#ff7a22'; g.lineWidth = 7;
  for (let i = 0; i < 9; i++) {
    let x = 236 + r() * 40, y = 345; g.beginPath(); g.moveTo(x, y);
    const drift = (i - 4) * 9;
    while (y < H) { y += 30; x += drift + (r() - 0.5) * 26; g.lineTo(x, y); }
    g.stroke();
  }
  g.fillStyle = 'rgba(255,170,70,0.9)'; g.beginPath(); g.ellipse(256, 340, 40, 12, 0, 0, Math.PI * 2); g.fill();
  // lead cames: horizontal bars, diamond quarries, a roundel at the head of the centre light
  g.strokeStyle = 'rgba(14,8,8,0.95)'; g.lineWidth = 3;
  for (let y = 40; y < H; y += 46) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.lineWidth = 2;
  for (let d = -H; d < W + H; d += 38) { g.beginPath(); g.moveTo(d, 0); g.lineTo(d + H, H); g.stroke(); g.beginPath(); g.moveTo(d, 0); g.lineTo(d - H, H); g.stroke(); }
  g.lineWidth = 6; g.beginPath(); g.arc(256, 150, 44, 0, Math.PI * 2); g.stroke();
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; g.beginPath(); g.moveTo(256, 150); g.lineTo(256 + Math.cos(a) * 44, 150 + Math.sin(a) * 44); g.stroke(); }
  g.restore();
  g.strokeStyle = '#120a08'; g.lineWidth = 9;
  for (const [x0, x1, t] of lancets) { g.beginPath(); shape(x0, x1, t); g.stroke(); g.beginPath(); g.moveTo((x0 + x1) / 2, t + 40); g.lineTo((x0 + x1) / 2, H); g.lineWidth = 5; g.stroke(); g.lineWidth = 9; }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function volcanicHeight(x: number, z: number): number {
  let h = 0;
  h = Math.max(h, LEDGE * smooth(-22, -27, x) * smooth(26, 31, z));             // SW basalt ledge (Team A) — the art's high overlook
  h = Math.max(h, TIER * smooth(-36, -38.5, z) * smooth(18, 14, x));            // castle upper tier (Team B)
  h = Math.max(h, smooth(-60, -76, x) * (22 + fbm3(x * 0.04, 0, z * 0.04) * 18)); // west crags
  // rim crags: tall jagged walls north and south, but low to the east so the volcano rises clear above the skyline
  const east = smooth(70, 90, x) * smooth(-100, -80, z);
  const rim = Math.max(smooth(78, 98, z), smooth(-100, -120, z));
  h = Math.max(h, rim * (34 + fbm3(x * 0.03, 3, z * 0.03) * 30), east * (10 + fbm3(x * 0.05, 4, z * 0.05) * 12));
  const ch = box(x, z, CHASM.x0, CHASM.x1, CHASM.z0, CHASM.z1, 2.5);
  h = h * (1 - ch) + ch * (LAVA_Y - 4);
  for (const [x0, x1, z0, z1] of PITS) { const p = box(x, z, x0, x1, z0, z1, 0.6); h = h * (1 - p) + p * PIT_FLOOR; }
  // the forge under the castle tier: its arch is cut at compound level, and the hall floor is a lethal lava cavity
  // (the walkways are solid boxes standing in it)
  h *= 1 - box(x, z, -36.5, -31.5, -42.2, -36, 0.3);
  { const f = box(x, z, FORGE.x0, FORGE.x1, FORGE.z0, FORGE.z1, 0.3); h = h * (1 - f) + f * PIT_FLOOR; }
  return h + (fbm3(x * 0.12, 5, z * 0.12) - 0.5) * 0.25 * (1 - ch);
}

export function buildVolcanic(scene: THREE.Scene, tier: Tier = 'high'): Level {
  const lo = tier === 'low';
  const group = new THREE.Group();
  const uBeatPulse = uniform(0);
  const kit = new StaticKit();
  const B = builders(kit);
  const R = rng(911);
  const ember = color(0xff6a1c);

  // ── materials (Obsidian Volcanic Compound sheets) ───────────────────────────────────────────────────
  const desat = (m: THREE.MeshStandardNodeMaterial, keep: number) => {
    const c = tslTexture(m.map!, uv()).rgb;
    m.colorNode = mix(vec3(luminance(c)), c, keep).mul(color(m.color));
    return m;
  };
  // basalt blocks; the sheet's rune channels glow ember-orange (the split sheet stored them as a mask)
  const stone = desat(pbr('volc-basalt', { maps: ['normal', 'roughness', 'ao'], tint: 0x8a8580, normalScale: 1.3 }), 0.15);
  const darkStone = desat(pbr('volc-basalt', { maps: ['normal', 'roughness', 'ao'], tint: 0x5d5853, normalScale: 1.3 }), 0.1);
  const runeStone = desat(pbr('volc-basalt', { maps: ['normal', 'roughness', 'ao', 'emissive'], tint: 0x6e6862, normalScale: 1.3 }), 0.1);
  // only the deepest channels glow, and faintly — the art's fortress stone is dark with ember seams, not lit panels
  runeStone.emissiveNode = smoothstep(float(0.55), float(0.9), tslTexture(runeStone.emissiveMap!, uv()).r).mul(ember).mul(float(0.35).add(uBeatPulse.mul(0.25)));
  // obsidian crags: lava already glows in the sheet's cracks — lift those pixels into emission
  const rockSrc = pbr('volc-rock', { maps: ['normal', 'roughness'], tint: 0xffffff, normalScale: 1.4 });
  const rock = new THREE.MeshStandardNodeMaterial({ map: rockSrc.map, normalMap: rockSrc.normalMap, roughnessMap: rockSrc.roughnessMap, roughness: 1 });
  {
    const c = tslTexture(rock.map!, uv()).rgb;
    const hot = smoothstep(float(0.25), float(0.6), c.r.sub(c.b));
    rock.colorNode = mix(c.mul(0.55), vec3(0.04, 0.03, 0.03), hot);
    rock.emissiveNode = c.mul(hot).mul(0.22); // dark crags with ember seams, not a coal bed (lava lights do the glow)
  }
  const ground = desat(pbr('volc-ash', { maps: ['normal', 'roughness'], tint: 0x8c8580, normalScale: 0.7 }), 0.25);
  const paving = desat(pbr('volc-basalt', { maps: ['normal', 'roughness', 'ao'], tint: 0x77726d, normalScale: 1.0 }), 0.1);
  // the art's ash and stone are bone-dry and matte; the sheets' roughness maps read wet under the sky env
  for (const m of [ground, paving, stone, darkStone, runeStone]) {
    m.roughnessNode = max(tslTexture(m.roughnessMap!, uv()).g, float(0.82));
  }
  const steel = new THREE.MeshStandardNodeMaterial({ map: pbr('volc-steel', { maps: [] }).map, color: 0x8a8a8c, roughness: 0.55, metalness: 0.8 });
  const grate = new THREE.MeshStandardNodeMaterial({ color: 0x2a2726, roughness: 0.5, metalness: 0.85 });
  // diamond-grate cells lit from the lava below
  const cell = fract(positionWorld.xz.mul(2.2));
  const bar = max(smoothstep(float(0.38), float(0.44), cell.x.sub(0.5).abs()), smoothstep(float(0.38), float(0.44), cell.y.sub(0.5).abs()));
  grate.emissiveNode = ember.mul(float(1).sub(bar).mul(0.55));
  const crateMat = new THREE.MeshStandardNodeMaterial({ map: pbr('volc-steel', { maps: [] }).map, color: 0x6d7266, roughness: 0.6, metalness: 0.5 });
  const concrete = desat(pbr('volc-ash', { maps: ['normal', 'roughness'], tint: 0x8f8a84 }), 0.1);
  const windowMat = new THREE.MeshStandardNodeMaterial({ color: 0x1a0d06, roughness: 0.4 });
  windowMat.emissiveNode = color(0xff6a18).mul(0.22); // warm lit interiors; brighter blew out to white through bloom
  // lava: the sheet's lava scrolls slowly, crusts darken, hot seams pulse
  const lavaSrc = pbr('volc-lava', { maps: [] });
  const lavaMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.7 });
  {
    const flow = uv().mul(6).add(vec2(time.mul(0.012), time.mul(0.02)));
    const c = tslTexture(lavaSrc.map!, flow).rgb;
    const c2 = tslTexture(lavaSrc.map!, uv().mul(2.3).sub(vec2(time.mul(0.008), 0))).rgb;
    const heat = luminance(c.add(c2).mul(0.5));
    lavaMat.colorNode = mix(vec3(0.05, 0.02, 0.01), c, 0.3);
    lavaMat.emissiveNode = c.add(c2).mul(0.5).mul(heat.mul(3.2).add(0.4)).mul(float(1).add(sin(time.mul(1.3).add(positionWorld.x.mul(0.2))).mul(0.15)));
  }

  // ── terrain ────────────────────────────────────────────────────────────────────────────────────────
  {
    const W = 260, D = 260, SX = lo ? 110 : 190, SZ = lo ? 110 : 190;
    const g = new THREE.PlaneGeometry(W, D, SX, SZ);
    g.rotateX(-Math.PI / 2); g.translate(10, 0, -10);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, volcanicHeight(p.getX(i), p.getZ(i)));
    g.computeVertexNormals();
    kit.add(ground, g, { tpm: 0.3 }); // 0.12 blew the ash pores up into metre-wide craters
  }
  // lava sheets in the chasm and pits
  const lava = new THREE.Mesh(new THREE.PlaneGeometry(CHASM.x1 - CHASM.x0 + 6, CHASM.z1 - CHASM.z0 + 6), lavaMat);
  lava.rotation.x = -Math.PI / 2; lava.position.set((CHASM.x0 + CHASM.x1) / 2, LAVA_Y, 0); group.add(lava);
  for (const [x0, x1, z0, z1] of PITS) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 + 1, z1 - z0 + 1), lavaMat);
    m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, -3.6, (z0 + z1) / 2); group.add(m);
    // trench retaining walls + rails (the art's sunken pits with railings)
    for (const [cx, cz, w, d] of [[(x0 + x1) / 2, z0 - 0.3, x1 - x0 + 1.2, 0.6], [(x0 + x1) / 2, z1 + 0.3, x1 - x0 + 1.2, 0.6], [x0 - 0.3, (z0 + z1) / 2, 0.6, z1 - z0], [x1 + 0.3, (z0 + z1) / 2, 0.6, z1 - z0]] as const) {
      kit.box(darkStone, w, 9.6, d, cx, -4.4, cz, 0, { tpm: 0.5 });
      kit.box(steel, w, 0.08, Math.min(d, 0.08) + (d > w ? d : 0), cx, 1.05, cz, 0, { tpm: 1, shadow: false, solid: false });
    }
  }

  // ── SW: Team A basalt overlook (crates, concrete barrier, rock outcrops) ──────────────────────────────
  for (let i = 0; i < (lo ? 10 : 22); i++) {
    // outcrops ring the ledge (west + south rims) and leave the spawn deck clear
    const rim = i % 2 === 0, x = rim ? -52 + R() * 8 : -48 + R() * 24, z = rim ? 26 + R() * 28 : 47 + R() * 7, g = boulder(1.4 + R() * 2.4, 20 + i, lo ? 2 : 3);
    kit.place(g, x, volcanicHeight(x, z) + 0.6, z, R() * 6, 0, 0, 1, 0.7 + R() * 0.8, 1);
    kit.add(rock, g, { tpm: 0.3 });
  }
  for (const [x, z, s, yaw] of [[-28.5, 32.5, 2, 0.2], [-30, 34.5, 1, 0.3], [-29.5, 37, 1, -0.4], [-34, 40, 2, 0.1]] as const) {
    for (let k = 0; k < s; k++) kit.box(crateMat, 2.0, 1.0, 1.1, x, LEDGE + 0.5 + k * 1.0, z, yaw + k * 0.15, { tpm: 0.6 });
  }
  kit.box(concrete, 4.2, 1.3, 0.7, -23.2, LEDGE + 0.65, 30.4, 0.35, { tpm: 0.6 });
  B.flight(stone, -14, 0.05, 31.5, -Math.PI / 2, LEDGE, 4);   // ledge → compound (east)
  B.flight(stone, -30, 0.05, 14, 0, LEDGE, 4);                     // west lane → ledge, climbing south

  // ── CENTRE: the compound — paving, barriers, gated two-level fortress block, scaffold stairs ─────────
  // paving: 4 m flagstones with joints, leaving the lava trenches open (one slab used to pave right over them)
  for (let x = -26; x < 18; x += 4) for (let z = -26; z < 14; z += 4) {
    const cx = x + 2, cz = z + 2;
    if (PITS.some(([x0, x1, z0, z1]) => cx + 2 > x0 - 0.7 && cx - 2 < x1 + 0.7 && cz + 2 > z0 - 0.7 && cz - 2 < z1 + 0.7)) continue;
    kit.box(paving, 3.94, 0.3, 3.94, cx, -0.05, cz, 0, { tpm: 0.35 });
  }
  // grated catwalks over two trenches (the third is a jump / dash gap)
  const catwalk = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2;
    kit.box(grate, 2.0, 0.18, len, mx, 0.0, mz, yaw, { tpm: 0.5 });
    for (const sd of [-1, 1]) {
      const ox = Math.cos(yaw) * sd * 1.0, oz = -Math.sin(yaw) * sd * 1.0;
      kit.box(steel, 0.07, 0.07, len, mx + ox, 1.05, mz + oz, yaw, { tpm: 1, shadow: false, solid: false });
      kit.box(B.invisible, 0.1, 1.2, len, mx + ox, 0.6, mz + oz, yaw, { shadow: false });
      for (let k = 0; k <= Math.floor(len / 2); k++) {
        const t = -len / 2 + k * (len / Math.floor(len / 2));
        kit.box(steel, 0.07, 1.05, 0.07, mx + ox + Math.sin(yaw) * t, 0.52, mz + oz + Math.cos(yaw) * t, yaw, { tpm: 1, shadow: false, solid: false });
      }
    }
  };
  catwalk(-11, 12, -1, 12);
  catwalk(3, -11, 3, -1);
  // supply crate stacks across the compound (cover at sprint distance)
  for (const [x, z, n, yaw] of [[-20, -4, 2, 0.3], [0, 4, 1, -0.2], [14, -2, 2, 0.8], [-14, -16, 1, 0.1], [8, -18, 1, -0.5], [-22, 8, 1, 1.2]] as const) {
    for (let k = 0; k < n; k++) kit.box(crateMat, 2.0, 1.0, 1.1, x, 0.6 + k, z, yaw + k * 0.2, { tpm: 0.6 });
    kit.box(crateMat, 1.1, 1.0, 1.1, x + Math.cos(yaw) * 1.7, 0.6, z - Math.sin(yaw) * 1.7, yaw + 0.4, { tpm: 0.6 });
  }
  const barrier = (x: number, z: number, yaw: number) => kit.box(concrete, 2.4, 1.0, 0.55, x, 0.5, z, yaw, { tpm: 0.7 });
  for (const [x, z, a] of [[-14, 6, 0.1], [-6, 2, -0.2], [2, 22, 0.4], [12, -8, 0.9], [-18, -6, 1.4], [8, 2, 0], [-2, -14, 0.3], [12, 14, -0.6]] as const) barrier(x, z, a);
  {
    // fortress block: lower floor with three lit arched gates, upper walkway with crenels, steel stairs
    const fx = -6, fz = -26;
    B.gothicWall(darkStone, fx, fz + 6, 0, 26, 7, 3, 0, 1.6, 0.66);
    B.curtain(darkStone, fx, fz - 6, 0, 26, 7, 0, 1.6);
    kit.box(darkStone, 1.6, 7, 12, fx - 13, 3.5, fz, 0); kit.box(darkStone, 1.6, 7, 12, fx + 13, 3.5, fz, 0);
    kit.box(stone, 27.6, 0.6, 13.6, fx, 7.3, fz, 0, { tpm: 0.4 });
    B.curtain(stone, fx, fz + 6.6, 0, 27, 1.1, 7.6, 0.6);
    for (const gx of [-8.7, 0, 8.7]) { kit.box(windowMat, 5, 4, 0.2, fx + gx, 2.1, fz + 4.5, 0, { solid: false, shadow: false, tpm: 1 }); }
    const gateLight = new THREE.PointLight(0xffa040, 12, 14, 2); gateLight.position.set(fx, 3, fz + 3); group.add(gateLight);
    B.steelStair(steel, fx + 15, 0.05, fz + 8, Math.PI, 7.6, 1.8);
    // scaffold towers either side
    for (const sx of [-15.5, 15.5]) for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) kit.box(steel, 0.14, 8, 0.14, fx + sx + ox, 4, fz + 2 + oz, 0, { tpm: 1, shadow: false, solid: false });
    // high walkway to the east towers (the art's steel bridge over the compound)
    kit.box(steel, 22, 0.3, 2.2, fx + 24, 7.6, fz + 2, 0, { tpm: 0.5 });
    for (let i = 0; i <= 11; i++) kit.box(steel, 0.08, 1.0, 0.08, fx + 13 + i * 2, 8.2, fz + 3.1, 0, { tpm: 1, shadow: false, solid: false });
    B.ramp(fx + 13, 7.75, fz + 3.1, fx + 35, 7.75, fz + 3.1, 0.1); // rail stop
    // roof bridge up onto the castle's upper tier
    kit.box(stone, 8, 0.5, 6.6, fx, 7.55, fz - 9.3, 0, { tpm: 0.4 });
    B.ramp(fx, 7.6, fz - 6, fx, TIER, fz - 12.4, 8);
  }

  // ── EAST: the lava chasm, grated steel bridges, spiked fortress towers with laser grids ──────────────
  const bridge = (z: number, w: number, y = 0.3) => {
    kit.box(grate, CHASM.x1 - CHASM.x0 + 6, 0.25, w, (CHASM.x0 + CHASM.x1) / 2, y, z, 0, { tpm: 0.5 });
    for (const s of [-1, 1]) {
      kit.box(steel, CHASM.x1 - CHASM.x0 + 6, 0.5, 0.25, (CHASM.x0 + CHASM.x1) / 2, y + 0.3, z + s * w / 2, 0, { tpm: 0.5 });
      kit.box(steel, CHASM.x1 - CHASM.x0 + 6, 0.08, 0.08, (CHASM.x0 + CHASM.x1) / 2, y + 1.1, z + s * w / 2, 0, { tpm: 1, shadow: false });
      kit.box(B.invisible, CHASM.x1 - CHASM.x0 + 6, 1.4, 0.1, (CHASM.x0 + CHASM.x1) / 2, y + 0.7, z + s * w / 2, 0, { shadow: false });
    }
    for (const x of [CHASM.x0 + 3, CHASM.x1 - 3]) kit.box(darkStone, 2, 12, 2, x, y - 6.2, z, 0, { tpm: 0.5, solid: false });
  };
  bridge(18, 4.5); bridge(-10, 3.5); bridge(-44, 4);
  // chasm walls: obsidian crags with glowing seams
  for (let i = 0; i < (lo ? 16 : 34); i++) {
    const z = -68 + i * (136 / (lo ? 16 : 34)), side = i % 2 ? CHASM.x0 - 1 : CHASM.x1 + 1;
    const g = boulder(3.5 + R() * 2, 600 + i, 2);
    kit.place(g, side, LAVA_Y + 2 + R() * 4, z, R() * 6, 0, 0, 1, 1.8, 1.3);
    kit.add(rock, g, { tpm: 0.3, solid: false, shadow: false });
  }
  // east fortress: towers + curtain on a raised bailey, laser grids strung between the towers
  kit.box(darkStone, 30, 3, 60, 46, 1.5, -12, 0, { tpm: 0.4 });
  B.flight(stone, 33, 0.05, 6, Math.PI / 2, 3, 6);
  B.flight(stone, 33, 0.05, -30, Math.PI / 2, 3, 6);
  const towers: [number, number][] = [[40, -36], [52, -36], [40, 8], [56, -12]];
  for (const [x, z] of towers) { B.tower(runeStone, x, z, 6.5, 20, 3, true); kit.box(windowMat, 3, 1.4, 0.15, x, 19, z + 3.3, 0, { solid: false, shadow: false, tpm: 1 }); }
  B.curtain(darkStone, 54, -12, Math.PI / 2, 46, 9, 3, 2.2);
  const laserMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  laserMat.colorNode = color(0xff5a14).mul(2.2);
  const lineV = smoothstep(float(0.44), float(0.49), fract(uv().y.mul(6)).sub(0.5).abs());
  const mesh = smoothstep(float(0.46), float(0.5), fract(uv().x.mul(40)).sub(0.5).abs()).mul(0.12);
  laserMat.opacityNode = max(lineV, mesh).mul(float(0.85).add(sin(time.mul(9)).mul(0.1)));
  const lasers: THREE.Mesh[] = [];
  for (const [[ax, az], [bx, bz]] of [[towers[0], towers[1]], [towers[0], towers[2]]] as const) {
    const len = Math.hypot(bx - ax, bz - az);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len - 6.5, 9), laserMat);
    m.position.set((ax + bx) / 2, 3 + 9.5, (az + bz) / 2);
    m.rotation.y = Math.atan2(bz - az, bx - ax) * -1;
    group.add(m); lasers.push(m);
  }
  // searchlights sweeping from the towers (cones of dusty light)
  const beamMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  beamMat.colorNode = color(0xfff0d0);
  beamMat.opacityNode = smoothstep(float(0.0), float(1.0), uv().y).mul(0.09);
  const beams: THREE.Mesh[] = [];
  for (const [x, z] of [towers[1], towers[3]]) {
    const g = new THREE.ConeGeometry(4, 60, 20, 1, true); g.translate(0, -30, 0);
    const b = new THREE.Mesh(g, beamMat); b.position.set(x, 24, z); b.rotation.z = 1.1; group.add(b); beams.push(b);
  }

  // ── NORTH: the castle upper tier + the great keep (Team B) ──────────────────────────────────────────
  // The art's castle looms right behind the fortress block: a second battlement level, then a massive gothic keep
  // with a tall central spire. Three ways up: the west grand stair, the fortress-roof bridge, the west-lane flight.
  {
    const tz0 = -38.4;
    // upper tier (x -50..18, z -38.4..-86.4), built as a shell around the forge cavity
    const TD = TIER - PIT_FLOOR, TY = (TIER + PIT_FLOOR) / 2; // shell blocks reach down to the pit floor
    kit.box(darkStone, 44, TD, 48, -4, TY, -62.4, 0, { tpm: 0.4 });                    // east of the forge
    kit.box(darkStone, 6, TD, 48, -47, TY, -62.4, 0, { tpm: 0.4 });                    // west of the forge
    kit.box(darkStone, 18, TD, 4.4, -35, TY, -84.2, 0, { tpm: 0.4 });                  // north end
    kit.box(darkStone, 7.5, TD, 3.6, -40.25, TY, -40.2, 0, { tpm: 0.4 });              // south face, either side of the arch
    kit.box(darkStone, 5.5, TD, 3.6, -28.75, TY, -40.2, 0, { tpm: 0.4 });
    kit.box(darkStone, 5, 3, 3.6, -34, 6.5, -40.2, 0, { tpm: 0.4 });                   // arch lintel
    kit.box(paving, 5, 9, 3.6, -34, -4.5, -40.2, 0, { tpm: 0.35 });                    // arch floor
    for (const sx of [-36.9, -31.1]) kit.box(runeStone, 0.8, 5.4, 0.8, sx, 2.7, -38.2, 0, { tpm: 0.6 }); // arch jambs
    kit.box(runeStone, 6.6, 0.8, 0.8, -34, 5.4, -38.2, 0, { tpm: 0.6 });
    // forge ceiling = tier top (y 6.8..8), with stairwells: H1 (west, up to the tier top) and H2 (east, up into the throne hall)
    for (const [x0, x1, z0, z1] of [[-41.5, -29, -82, -42], [-44, -41.5, -47, -42], [-44, -41.5, -82, -57], [-29, -26, -60, -42], [-29, -26, -82, -70]] as const) {
      kit.box(darkStone, x1 - x0, 1.2, z1 - z0, (x0 + x1) / 2, TIER - 0.6, (z0 + z1) / 2, 0, { tpm: 0.4 });
    }
    buildForge();
    // parapet along the tier edge, broken where the stairs and bridge arrive
    for (const [a, b] of [[-50, -43], [-37, -31.5], [-24.5, -10.5], [-1.5, 18]] as const) B.curtain(darkStone, (a + b) / 2, tz0, 0, b - a, 1.1, TIER, 0.8);
    B.flight(stone, -28, 0.05, tz0 + 12.8, Math.PI, TIER, 6);                         // grand stair (west of the fortress block)
    B.flight(stone, -40, 0.05, tz0 + 12.8, Math.PI, TIER, 5);                         // west-lane flight
    const kz = -72, ky = TIER;
    B.gothicWall(runeStone, -16, -52, 0, 34, 20, 3, ky, 2.4, 0.62);                   // gatehouse arcade facing the compound
    // keep body (x -36..4, z -55..-84, y 8..42): a hollow shell around the throne hall
    for (const [x0, x1, z0, z1, y0, y1] of [
      [-36, -19.5, -57, -55, ky, 42], [-12.5, 4, -57, -55, ky, 42], [-19.5, -12.5, -57, -55, ky + 9, 42], // front, great gate 7 x 9
      [-36, 4, -84, -82, ky, 42],                                                                          // back (the windows)
      [-36, -29, -74.5, -57, ky, 42], [-36, -29, -82, -77.5, ky, 42], [-36, -29, -77.5, -74.5, ky + 5, 42], // west, side door
      [-3, 4, -62.5, -57, ky, 42], [-3, 4, -82, -65.5, ky, 42], [-3, 4, -65.5, -62.5, ky + 5, 42],         // east, side door
      [-36, 4, -84, -55, 34, 42],                                                                          // roof
    ] as const) kit.box(darkStone, x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, 0, { tpm: 0.3 });
    for (const sx of [-20.1, -11.9]) kit.box(runeStone, 1.2, 9.6, 2.8, sx, ky + 4.8, -56, 0, { tpm: 0.6 }); // gate jambs
    kit.box(runeStone, 9.4, 1.2, 2.8, -16, ky + 9.6, -56, 0, { tpm: 0.6 });
    for (const [x, z, w, h] of [[-36, -54, 10, 40], [4, -54, 10, 40], [-46, -72, 12, 50], [14, -74, 9, 38], [-16, -89, 10, 56]] as const) B.tower(darkStone, x, z, w, h, ky, false);
    // gabled roof ridge over the keep body
    { const g = new THREE.CylinderGeometry(0.4, 12, 9, 4, 1); g.rotateY(Math.PI / 4); g.scale(1.65, 1, 1.2); kit.place(g, -16, ky + 38.5, -69.5); kit.add(darkStone, g, { tpm: 0.3, solid: false }); }
    // lit windows: keep body rows + tower slits
    for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) kit.box(windowMat, 1.4, 3.6, 0.2, -31 + i * 6, ky + 15 + r * 9, kz + 17.1, 0, { solid: false, shadow: false, tpm: 1 });
    for (const [x, z, w, h] of [[-36, -54, 10, 40], [4, -54, 10, 40], [-16, -89, 10, 56]] as const) for (let r = 0; r < 3; r++) kit.box(windowMat, 1.1, 3.2, 0.2, x, ky + h * (0.45 + r * 0.17), z + w / 2 + 0.11, 0, { solid: false, shadow: false, tpm: 1 });
    buildThroneHall();
    const keepLight = new THREE.PointLight(0xffa040, 60, 30, 2); keepLight.position.set(-16, ky + 5, -46); group.add(keepLight);
    B.curtain(darkStone, 34, kz + 22, 0.25, 30, 10, 0, 2.4);
  }
  // west lane: broken outer wall and rubble (A point) between the ledge and the keep
  B.curtain(darkStone, -40, -12.5, Math.PI / 2, 21, 6, 0, 2); // stops short of the west-lane flight
  for (let i = 0; i < (lo ? 20 : 50); i++) {
    const x = -46 + R() * 20, z = -40 + R() * 60, g = boulder(0.3 + R() * 0.8, 800 + i, 1);
    kit.place(g, x, volcanicHeight(x, z) + 0.15, z, R() * 6); kit.add(stone, g, { tpm: 0.7, solid: false, shadow: false });
  }

  // ── the volcano + ash sky ───────────────────────────────────────────────────────────────────────────
  {
    // big enough to dominate the right of the sky like the concept (peak ~450 m up, 600 m out)
    const VR = 230, VH = 210, VY = 0; // broad cone: ~15° tall x ~35° wide from the overlook, as in the concept
    const g = new THREE.ConeGeometry(VR, VH, 64, 16);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const y = p.getY(k), t = (y + VH / 2) / VH;
      const n = noise3(p.getX(k) * 0.02, y * 0.02, p.getZ(k) * 0.02) - 0.5;
      const crater = t > 0.92 ? 0.82 : 1;
      p.setXYZ(k, p.getX(k) * (1 + n * 0.35) * crater, y * (t > 0.92 ? 0.97 : 1), p.getZ(k) * (1 + n * 0.35) * crater);
    }
    // right of frame from the Team A overlook, the castle left — the art's composition
    const VX = 540, VZ = -330; // right of the castle from the overlook; plume stays inside the 900 m far plane
    const TOP = VY + VH / 2 - 20 + VH / 2 * 0.97; // crater rim height
    // the volcano is ~580 m out, past where the fog goes solid; it carries its own fixed haze instead
    const haze = vec3(0.22, 0.17, 0.15); // aerial perspective: a hazy grey mass against the ash sky
    const volcRock = new THREE.MeshStandardNodeMaterial({ map: rock.map, normalMap: rock.normalMap, roughness: 1, fog: false });
    volcRock.colorNode = mix(rock.colorNode!, haze, 0.5);
    volcRock.emissiveNode = (rock.emissiveNode as any).mul(4.5); // distant flank seams stay readable
    const volcLava = new THREE.MeshStandardNodeMaterial({ roughness: 0.7, fog: false });
    // streams: molten ribbons that run hotter toward the crater and flicker along their length
    volcLava.colorNode = vec3(0.05, 0.02, 0.01);
    const along = uv().x, flick = sin(along.mul(90).sub(time.mul(1.5))).mul(0.25).add(0.75);
    volcLava.emissiveNode = mix(color(0xff3a08), color(0xffb040), float(1).sub(along)).mul(flick).mul(float(1.5).sub(along.mul(0.9)));
    const vm = new THREE.Mesh(g, volcRock); vm.position.set(VX, VY + VH / 2 - 20, VZ); vm.rotation.y = 0.3; group.add(vm);
    for (let i = 0; i < 7; i++) { // thin lava rivulets down the flank facing the arena, irregular like the concept
      const a = -1.6 + i * 0.2 + (R() - 0.5) * 0.15; // sin<0, cos>0: the south-west face
      const pts = Array.from({ length: 8 }, (_, k) => {
        const t = k / 7; const r = VR * 0.16 + t * VR * (0.4 + (i % 3) * 0.2);
        const j = Math.sin(t * 7 + i * 3) * 0.08 + Math.sin(t * 17 + i) * 0.04;
        return new THREE.Vector3(VX + Math.sin(a + j) * r, TOP - 3 - t * (VH * (0.4 + (i % 3) * 0.2)) * 0.97, VZ + Math.cos(a + j) * r);
      });
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 1.2 + R() * 1.3, 5, false);
      const m = new THREE.Mesh(tube, volcLava); group.add(m);
    }
    // eruption plume: billowing ash column, lit orange at its root by the crater
    const smoke = new THREE.MeshStandardNodeMaterial({ color: 0x57504d, roughness: 1, transparent: true, depthWrite: false, fog: false });
    const rise = smoothstep(float(TOP), float(TOP + 140), positionWorld.y);
    smoke.emissiveNode = color(0xff5a1c).mul(float(1).sub(rise).pow(4).mul(0.35)); // only the crater lights the column's root
    smoke.opacityNode = float(0.9).sub(rise.mul(0.45));
    for (let i = 0; i < (lo ? 14 : 34); i++) {
      const t = i / (lo ? 13 : 33);
      const g = boulder(14 + t * 48 + (i % 3) * 4, 950 + i, 2);
      const m = new THREE.Mesh(g, smoke);
      m.position.set(VX + Math.sin(i * 2.1) * (6 + t * 40) - t * t * 150, TOP + t * 170, VZ + Math.cos(i * 1.7) * (6 + t * 30)); // billows, drifts west with the wind
      m.scale.set(1, 0.75, 1);
      group.add(m);
    }
  }
  {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#120c0b'); grad.addColorStop(0.38, '#3b2a24'); grad.addColorStop(0.5, '#6a3a22'); grad.addColorStop(0.56, '#2a1d18'); grad.addColorStop(1, '#100b0a');
    g.fillStyle = grad; g.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 220; i++) { // ash cloud banks, lit orange from below near the horizon
      const x = Math.random() * 1024, y = 30 + Math.random() * 220, r = 40 + Math.random() * 110;
      const cg = g.createRadialGradient(x, y, 0, x, y, r);
      const warm = y > 170 ? 0.25 : 0;
      cg.addColorStop(0, `rgba(${70 + warm * 300},${55 + warm * 120},${50},${0.22 + Math.random() * 0.2})`); cg.addColorStop(1, 'rgba(40,30,28,0)');
      g.fillStyle = cg; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const sky = new THREE.CanvasTexture(c);
    sky.mapping = THREE.EquirectangularReflectionMapping; sky.colorSpace = THREE.SRGBColorSpace;
    scene.background = sky; scene.environment = sky; scene.environmentIntensity = 0.5;
  }
  // grey-brown ash haze: lighter than the shadows so the castle and towers separate in layers (aerial perspective)
  scene.fog = new THREE.FogExp2(0x4a3a33, 0.0062);
  // key: the art is lit from over the viewer's left shoulder (soft overcast through ash), so the faces the
  // players see read as grey stone, not black cut-outs
  const moon = new THREE.DirectionalLight(0xe6cdb8, 2.3);
  moon.position.set(-90, 120, 80); moon.castShadow = !lo; moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -100, right: 100, top: 110, bottom: -110, near: 1, far: 420 });
  moon.shadow.bias = -0.0005; moon.shadow.normalBias = 0.05;
  // rim: the volcano's glow from the north-east catches crenels and tower edges
  const rimLight = new THREE.DirectionalLight(0xff7a3a, 1.3);
  rimLight.position.set(160, 60, -220);
  const hemi = new THREE.HemisphereLight(0x9a8a80, 0x5a2a14, 2.1);
  group.add(moon, moon.target, rimLight, rimLight.target, hemi);
  const lavaLights: THREE.PointLight[] = [];
  for (const [x, y, z, i] of [[23, LAVA_Y + 3, 20, 220], [23, LAVA_Y + 3, -14, 220], [23, LAVA_Y + 3, -46, 200], [-6, -2, 12, 90], [7, -2, 13, 70], [2, -2, -6, 70]] as const) {
    if (lo && i < 100) continue;
    const l = new THREE.PointLight(0xff5a14, i, 38, 2); l.position.set(x, y, z); group.add(l); lavaLights.push(l);
  }

  // ── UNDER THE TIER: the forge hall (art: "Volcanic compound armory forge interior") ─────────────────
  // A lower lane from the compound to the throne hall. You enter through the arch at compound level onto a deck. Stairs drop to
  // two walkways either side of a lethal lava channel, crossed by two stone bridges. Rune anvils, weapon racks and lava
  // falls from wall spouts line the walkways; the forge reactor ring glows at the far end. Exits: the arch, a steel stair
  // up to the tier top (west) and a steel stair from the east catwalk up into the throne hall.
  function buildForge() {
    const FL = FORGE_FLOOR, zA = -47, zB = FORGE.z0; // walkways run zA..zB
    const len = zA - zB, zc = (zA + zB) / 2;
    kit.box(paving, 18, 9, 5, -35, -4.5, -44.5, 0, { tpm: 0.35 });                       // arrival deck (y 0)
    for (const x of [-40.5, -29.5]) kit.box(paving, 7, 5, len, x, FL - 2.5, zc, 0, { tpm: 0.35 }); // walkways
    for (const x of [-37.25, -32.75]) kit.box(darkStone, 0.5, 0.5, len, x, FL + 0.25, zc, 0, { tpm: 0.6 }); // channel curbs
    for (const z of [-58, -72]) kit.box(stone, 4.4, 0.7, 3, -35, FL - 0.35, z, 0, { tpm: 0.5 });   // bridges over the channel
    const ch = new THREE.Mesh(new THREE.PlaneGeometry(4, len), lavaMat);
    ch.rotation.x = -Math.PI / 2; ch.position.set(-35, -5.2, zc); group.add(ch);
    B.flight(stone, -39.5, FL, zA - 6.4, 0, 0, 3);                                        // deck → west walkway
    B.flight(stone, -30.5, FL, zA - 6.4, 0, 0, 3);                                        // deck → east walkway
    // deck rail over the channel
    kit.box(steel, 6, 0.08, 0.08, -35, 1.05, zA + 0.05, 0, { tpm: 1, shadow: false, solid: false });
    kit.box(B.invisible, 6, 1.2, 0.1, -35, 0.6, zA + 0.05, 0, { shadow: false });
    // east catwalk (y 0) along the wall to the throne-hall stair
    kit.box(grate, 2, 0.2, 13, -27, -0.1, -53.5, 0, { tpm: 0.5 });
    kit.box(steel, 0.08, 0.08, 13, -28.05, 1.05, -53.5, 0, { tpm: 1, shadow: false, solid: false });
    kit.box(B.invisible, 0.1, 1.2, 13, -28.05, 0.6, -53.5, 0, { shadow: false });
    for (const z of [-50, -54, -58]) kit.box(steel, 0.16, 4, 0.16, -27.9, -2, z, 0, { tpm: 1, shadow: false, solid: false });
    B.steelStair(steel, -27.5, 0, -60, Math.PI, TIER, 1.8);                               // → throne hall (H2)
    B.steelStair(steel, -42.75, 0, zA, Math.PI, TIER, 1.8);                               // → tier top (H1)
    // stairwell rails where the stairs come up
    for (const [w, d, x, z] of [[0.1, 10, -25.95, -65], [3, 0.1, -27.5, -59.95], [0.1, 10, -41.45, -52], [0.1, 10, -44.05, -52], [2.5, 0.1, -42.75, -46.95]] as const) {
      kit.box(B.invisible, w, 1.2, d, x, TIER + 0.6, z, 0, { shadow: false });
      kit.box(steel, Math.max(w, 0.08), 0.08, Math.max(d, 0.08), x, TIER + 1.05, z, 0, { tpm: 1, shadow: false, solid: false });
    }
    // overhead pipes and the steel mezzanine frames the art shows along the right wall
    for (const [x, y, r] of [[-43.2, 5.6, 0.32], [-42.4, 6.1, 0.18], [-26.8, 5.6, 0.32], [-35, 6.2, 0.22]] as const) {
      const g = new THREE.CylinderGeometry(r, r, len + 5, 8); g.rotateX(Math.PI / 2); kit.place(g, x, y, zc + 2.5); kit.add(steel, g, { tpm: 1, solid: false, shadow: false });
    }
    for (let z = zA - 4; z > zB + 2; z -= 6) kit.box(steel, 18, 0.35, 0.35, -35, 6.5, z, 0, { tpm: 1, solid: false, shadow: false });
    // rune anvils on both walkways
    const runeGlow = new THREE.MeshBasicNodeMaterial(); runeGlow.colorNode = ember.mul(float(2.2).add(uBeatPulse.mul(1.5)));
    const anvil = (x: number, z: number, yaw: number) => {
      kit.box(darkStone, 0.9, 0.55, 0.7, x, FL + 0.27, z, yaw, { tpm: 0.8 });
      kit.box(steel, 0.42, 0.3, 0.45, x, FL + 0.7, z, yaw, { tpm: 1 });
      kit.box(steel, 1.5, 0.36, 0.55, x, FL + 1.03, z, yaw, { tpm: 1 });
      const horn = new THREE.ConeGeometry(0.24, 0.7, 6); horn.rotateZ(-Math.PI / 2); kit.place(horn, x + Math.cos(yaw) * 1.08, FL + 1.06, z - Math.sin(yaw) * 1.08, yaw); kit.add(steel, horn, { tpm: 1, solid: false });
      kit.box(runeGlow, 1.0, 0.2, 0.02, x + Math.sin(yaw) * 0.29, FL + 1.03, z + Math.cos(yaw) * 0.29, yaw, { solid: false, shadow: false, tpm: 1 });
    };
    anvil(-41.5, -56, 0.2); anvil(-40, -68, -0.3); anvil(-29.5, -63, 0.4); anvil(-30.5, -78, 0); anvil(-41, -79, 0.1);
    // weapon racks: steel frames with cyan-edged blades (the art's armory)
    const cyan = new THREE.MeshBasicNodeMaterial(); cyan.colorNode = color(0x38e8ff).mul(float(1.6).add(uBeatPulse.mul(0.8)));
    const rack = (x: number, z: number, face: number) => {
      for (const o of [-1.2, 1.2]) kit.box(steel, 0.12, 2.2, 0.12, x, FL + 1.1, z + o, 0, { tpm: 1 });
      kit.box(steel, 0.12, 0.12, 2.6, x, FL + 1.9, z, 0, { tpm: 1, solid: false });
      kit.box(B.invisible, 0.5, 2.2, 2.6, x, FL + 1.1, z, 0, { shadow: false });
      for (let k = 0; k < 4; k++) {
        const bz = z - 0.9 + k * 0.6;
        kit.box(steel, 0.05, 1.5, 0.14, x + face * 0.14, FL + 1.05, bz, 0, { tpm: 1, solid: false, rz: face * 0.12 });
        kit.box(cyan, 0.02, 1.3, 0.03, x + face * 0.18, FL + 1.1, bz + 0.07, 0, { solid: false, shadow: false, tpm: 1, rz: face * 0.12 });
      }
    };
    rack(-43.3, -61, 1); rack(-43.3, -73, 1); rack(-26.7, -74, -1);
    // lava falls pouring from wall spouts into basins (two west, one east)
    const fallMat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    {
      const c = tslTexture(lavaSrc.map!, uv().mul(vec2(0.6, 2.5)).add(vec2(0, time.mul(0.55)))).rgb;
      fallMat.colorNode = c.mul(luminance(c).mul(5).add(1.2)).mul(vec3(1.6, 0.8, 0.35));
    }
    for (const [x, z, s] of [[-44, -64.5, 1], [-44, -76.5, 1], [-26, -79.5, -1]] as const) {
      kit.box(darkStone, 1.4, 0.9, 1.4, x + s * 0.5, 3.6, z, 0, { tpm: 0.6, solid: false });
      const f = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 7.2), fallMat);
      f.rotation.y = Math.PI / 2; f.position.set(x + s * 1.0, FL + 3.6, z); group.add(f);
      kit.box(stone, 2.6, 0.9, 2.6, x + s * 1.5, FL + 0.45, z, 0, { tpm: 0.6 });
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.0), lavaMat);
      pool.rotation.x = -Math.PI / 2; pool.position.set(x + s * 1.5, FL + 0.92, z); group.add(pool);
    }
    // cyan circuit runes etched in the walls
    const runeTex = circuitTexture(256, 256, '#7ff4ff', 5, 9, false);
    const wallRune = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    wallRune.colorNode = tslTexture(runeTex, uv()).rgb.mul(color(0x38e8ff)).mul(float(0.75).add(uBeatPulse.mul(0.4)));
    for (const [x, z, ry] of [[-43.96, -52, Math.PI / 2], [-43.96, -70.5, Math.PI / 2], [-26.04, -50, -Math.PI / 2], [-26.04, -72, -Math.PI / 2], [-38.5, -81.96, 0], [-31.5, -81.96, 0]] as const) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), wallRune); m.position.set(x, 1.2, z); m.rotation.y = ry; group.add(m);
    }
    // the forge reactor at the far end: an iron ring round a molten core, with cyan arcs
    const core = new THREE.MeshBasicNodeMaterial(); core.colorNode = color(0xffa040).mul(float(2.4).add(uBeatPulse.mul(1.2)));
    const ring = new THREE.TorusGeometry(3.0, 0.42, 8, 40); kit.place(ring, -35, 1.6, -81.5); kit.add(steel, ring, { tpm: 1, solid: false });
    const inner = new THREE.TorusGeometry(2.1, 0.16, 6, 40); kit.place(inner, -35, 1.6, -81.4); kit.add(core, inner, { solid: false, shadow: false });
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; kit.box(steel, 0.25, 1.0, 0.3, -35 + Math.cos(a) * 2.55, 1.6 + Math.sin(a) * 2.55, -81.45, 0, { tpm: 1, solid: false, rz: a + Math.PI / 2 }); }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.5, 32), core); disc.position.set(-35, 1.6, -81.6); group.add(disc);
    for (let k = 0; k < 3; k++) { const arc = new THREE.TorusGeometry(3.55 + k * 0.25, 0.04, 4, 24, 0.9); arc.rotateZ(0.6 + k * 2.1); kit.place(arc, -35, 1.6, -81.3); kit.add(cyan, arc, { solid: false, shadow: false }); }
    for (const [x, y, z, i, d] of [[-35, -1, -56, 34, 20], [-35, -1, -72, 34, 20], [-35, 2, -78.5, 26, 14]] as const) {
      if (lo && z !== -72) continue;
      const l = new THREE.PointLight(0xff6a20, i, d, 2); l.position.set(x, y, z); group.add(l);
    }
  }

  // ── INSIDE THE KEEP: the throne hall (art: "Obsidian volcanic compound throne room") ──────────────────
  // A gothic nave: clustered piers in two rows, pointed arcades and ribs, a gold circuit runner down the aisle to a stepped
  // dais with a spiked obsidian throne, and three tall lancets of leaded glass picturing the erupting volcano behind it.
  // Entrances: the great gate (south), side doors east and west, and the forge stair coming up through the west aisle.
  function buildThroneHall() {
    const Y = TIER, hx0 = -29, hx1 = -3, hz0 = -82, hz1 = -57;
    // floor flagstones (the stairwell from the forge stays open)
    kit.box(paving, hx1 + 26, 0.1, hz1 - hz0, (hx1 - 26) / 2, Y + 0.05, (hz0 + hz1) / 2, 0, { tpm: 0.3, solid: false });
    kit.box(paving, 3, 0.1, 3, -27.5, Y + 0.05, -58.5, 0, { tpm: 0.3, solid: false });
    kit.box(paving, 3, 0.1, 12, -27.5, Y + 0.05, -76, 0, { tpm: 0.3, solid: false });
    // the gold circuit runner
    const runTex = circuitTexture(512, 2048, '#ffd27a', 12, 7, true);
    const runMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    runMat.colorNode = tslTexture(runTex, uv()).rgb.mul(color(0xffc864)).mul(float(1.0).add(uBeatPulse.mul(0.5)));
    const runner = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 20), runMat);
    runner.rotation.x = -Math.PI / 2; runner.position.set(-16, Y + 0.12, -67.2); group.add(runner);
    // clustered piers
    const pierZ = [-60, -65, -70, -75];
    for (const px of [-21, -11]) for (const pz of pierZ) {
      kit.prism(stone, 8, 1.75, 1.75, 1.2, px, Y, pz, Math.PI / 8, { tpm: 0.5 });
      kit.prism(stone, 8, 1.15, 1.15, 18.4, px, Y + 1.2, pz, Math.PI / 8, { tpm: 0.4 });
      for (const [ox, oz] of [[1.1, 0], [-1.1, 0], [0, 1.1], [0, -1.1]]) kit.prism(stone, 6, 0.36, 0.36, 18.4, px + ox, Y + 1.2, pz + oz, 0, { tpm: 0.5, solid: false });
      kit.prism(stone, 8, 1.8, 1.2, 1.4, px, Y + 19.6, pz, Math.PI / 8, { tpm: 0.5, solid: false });
    }
    // pointed arcades between the piers, the clerestory wall above them, and transverse ribs across the nave
    const arch = (cx: number, cz: number, span: number, rise: number, y0: number, alongZ: boolean, thick: number) => {
      for (let j = 0; j < 9; j++) {
        const ang = Math.PI * (j + 0.5) / 9, o = Math.cos(ang) * span / 2, oy = Math.pow(Math.sin(ang), 0.6) * rise;
        if (alongZ) kit.box(stone, thick, 0.7, span / 9 + 0.35, cx, y0 + oy, cz + o, 0, { tpm: 0.5, solid: false, rx: Math.cos(ang) * 0.7 });
        else kit.box(stone, span / 9 + 0.35, 0.7, thick, cx + o, y0 + oy, cz, 0, { tpm: 0.5, solid: false, rz: -Math.cos(ang) * 0.7 });
      }
    };
    for (const px of [-21, -11]) {
      for (let k = 0; k < pierZ.length - 1; k++) arch(px, (pierZ[k] + pierZ[k + 1]) / 2, 5, 3.4, Y + 21, true, 1.0);
      kit.box(darkStone, 0.9, 34 - (Y + 24.4), 17, px, (34 + Y + 24.4) / 2, -67.5, 0, { tpm: 0.4, solid: false });
    }
    for (const pz of pierZ) arch(-16, pz, 10, 4.2, Y + 21, false, 0.8);
    // aisle vault ribs between the piers and the side walls
    for (const pz of pierZ) { arch(-25, pz, 8, 3.0, Y + 20, false, 0.5); arch(-7, pz, 8, 3.0, Y + 20, false, 0.5); }
    // the dais and the obsidian throne
    const obsidian = new THREE.MeshStandardNodeMaterial({ color: 0x1a181b, roughness: 0.5, metalness: 0.15 });
    obsidian.emissiveNode = ember.mul(smoothstep(float(0.75), float(1), positionWorld.y.sub(Y).div(13)).mul(0.25)); // only the spike tips catch the fire
    // the art's throne is the hall's landmark: a broad three-step dais and a throne twice a man's height, crowned in spikes
    kit.box(stone, 14, 0.45, 5, -16, Y + 0.225, -79.5, 0, { tpm: 0.4 });
    kit.box(stone, 11.5, 0.9, 4, -16, Y + 0.45, -80, 0, { tpm: 0.4 });
    kit.box(stone, 9, 1.35, 3, -16, Y + 0.675, -80.5, 0, { tpm: 0.4 });
    B.ramp(-16, Y, -76.9, -16, Y + 1.35, -79.4, 9);
    const TY0 = Y + 1.35, tz = -79.6;
    kit.box(obsidian, 3.6, 1.2, 2.4, -16, TY0 + 0.6, tz, 0, { tpm: 1 });
    kit.box(obsidian, 2.8, 3.8, 0.7, -16, TY0 + 1.9, tz - 1.2, 0, { tpm: 1 });
    for (const s of [-1, 1]) kit.box(obsidian, 0.7, 2.3, 2.4, -16 + s * 2.1, TY0 + 1.15, tz, 0, { tpm: 1 });
    const TR = rng(404);
    for (let i = 0; i < 31; i++) {
      const a = -1.2 + 2.4 * i / 30, h = 3.2 + (1 - Math.abs(a)) * 6.5 + TR() * 2;
      const g = new THREE.ConeGeometry(0.16 + TR() * 0.2, h, 5);
      kit.place(g, -16 + Math.sin(a) * 2.3, TY0 + 2.2 + Math.cos(a) * 1.4 + h / 2 - 1.6, tz - 0.75 - TR() * 0.7, 0, -0.08 - TR() * 0.12, -a * 0.45);
      kit.add(obsidian, g, { tpm: 1, solid: false });
    }
    for (const s of [-1, 1]) for (let i = 0; i < 5; i++) {
      const g = new THREE.ConeGeometry(0.12, 1.3 + i * 0.35, 5); kit.place(g, -16 + s * 2.1, TY0 + 2.8, tz + 1.0 - i * 0.5, 0, 0.3, -s * 0.25); kit.add(obsidian, g, { tpm: 1, solid: false });
    }
    // the three lancets in the back wall (plus a tracery frame) and the light they throw down the nave
    const glassTex = stainedGlassTexture();
    const glass = new THREE.MeshBasicNodeMaterial({ transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
    glass.colorNode = tslTexture(glassTex, uv()).rgb.mul(float(1.8).add(uBeatPulse.mul(0.3)));
    glass.opacityNode = tslTexture(glassTex, uv()).a;
    const win = new THREE.Mesh(new THREE.PlaneGeometry(14, 21), glass); win.position.set(-16, Y + 12.5, -81.94); group.add(win);
    for (const sx of [-23.3, -8.7]) kit.box(stone, 0.7, 22, 0.5, sx, Y + 12.5, -81.8, 0, { tpm: 0.6, solid: false });
    kit.box(stone, 15.3, 0.7, 0.5, -16, Y + 1.9, -81.8, 0, { tpm: 0.6, solid: false });
    // torches on the aisle walls
    const flame = new THREE.MeshBasicNodeMaterial(); flame.colorNode = color(0xffb050).mul(float(3).add(sin(time.mul(13)).mul(0.4)));
    for (const [x, s] of [[hx0 + 0.1, 1], [hx1 - 0.1, -1]] as const) for (const z of [-61, -71, -79]) {
      kit.box(steel, 0.5, 0.12, 0.12, x + s * 0.25, Y + 4.6, z, 0, { tpm: 1, solid: false, shadow: false });
      kit.box(steel, 0.22, 0.5, 0.22, x + s * 0.5, Y + 4.85, z, 0, { tpm: 1, solid: false, shadow: false });
      const f = new THREE.ConeGeometry(0.13, 0.42, 6); kit.place(f, x + s * 0.5, Y + 5.3, z); kit.add(flame, f, { solid: false, shadow: false });
    }
    // rubble at the pier bases and along the walls, as in the art
    for (let i = 0; i < (lo ? 12 : 30); i++) {
      const x = TR() < 0.5 ? hx0 + 0.6 + TR() * 3 : hx1 - 0.6 - TR() * 3, z = hz0 + 3 + TR() * 22, g = boulder(0.15 + TR() * 0.35, 1200 + i, 1);
      kit.place(g, x, Y + 0.1, z, TR() * 6); kit.add(stone, g, { tpm: 0.8, solid: false, shadow: false });
    }
    // the window's fire, a warm fill down the nave, and torch pools on the aisles
    const lights: [number, number, number, number, number, number][] = [[-16, Y + 17, -81.2, 0xff7030, 160, 42], [-16, Y + 9, -65, 0xd8c0a8, 70, 30], [-27.4, Y + 5.6, -71, 0xffb070, 30, 16], [-4.6, Y + 5.6, -61, 0xffb070, 30, 16], [-4.6, Y + 5.6, -79, 0xffb070, 24, 14]];
    for (const [x, y, z, c, i, d] of lo ? lights.slice(0, 2) : lights) { const l = new THREE.PointLight(c, i, d, 2); l.position.set(x, y, z); group.add(l); }
  }

  kit.build(group);

  // embers rising from the lava
  const EN = lo ? 500 : 1600;
  const ep = new Float32Array(EN * 3);
  for (let i = 0; i < EN; i++) ep.set([-60 + Math.random() * 130, Math.random() * 40, -90 + Math.random() * 160], i * 3);
  const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(ep, 3));
  const em = new THREE.PointsNodeMaterial({ size: 0.12, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  em.colorNode = color(0xffa040).mul(2.5);
  em.opacityNode = float(0.9);
  const embers = new THREE.Points(eg, em); embers.frustumCulled = false; group.add(embers);

  scene.add(group);

  const enemySpots = [[-12, 4], [0, 12], [-16, -10], [8, -4], [-2, 26], [10, 26], [-38, -6], [-36, 10], [44, -20], [46, 0], [23, 18], [-14, -50], [-30, -40]].map(([x, z]) => new THREE.Vector3(x, Math.max(0, volcanicHeight(x, z)) + 0.1, z));
  // the forge walkways and the throne hall
  enemySpots.push(new THREE.Vector3(-40.5, FORGE_FLOOR + 0.1, -66), new THREE.Vector3(-29.5, FORGE_FLOOR + 0.1, -75), new THREE.Vector3(-16, TIER + 0.1, -70));
  const info: LevelInfo = { id: 'obsidian-volcanic', name: 'Obsidian Volcanic Compound', track: 'combat', accentHex: 0xff6a1c };
  let elapsed = 0;
  return {
    group, uBeatPulse, gates: [], traps: [], biomeIndex: 0, info,
    spawns: { a: { pos: new THREE.Vector3(-32, LEDGE + 0.4, 38), yaw: -0.75 }, b: { pos: new THREE.Vector3(-16, TIER + 0.4, -45), yaw: Math.PI } },
    enemySpots,
    hazardBelow: LAVA_Y + 1.5,
    controlPoints: [
      { id: 'A', name: 'West Breach', pos: new THREE.Vector3(-38, 0, -4), radius: 6 },
      { id: 'B', name: 'Compound', pos: new THREE.Vector3(-4, 0, 4), radius: 6.5 },
      { id: 'C', name: 'East Bailey', pos: new THREE.Vector3(46, 3, -12), radius: 6 },
    ],
    setBiome() { return { name: info.name, track: info.track }; },
    update(dt, pulse) {
      elapsed += dt;
      uBeatPulse.value = pulse;
      lavaLights.forEach((l, i) => { l.intensity *= 1 + Math.sin(elapsed * 3 + i) * 0.004; });
      beams.forEach((b, i) => { b.rotation.y = Math.sin(elapsed * 0.25 + i * 2) * 1.2; });
      const p = eg.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < EN; i++) {
        let y = p.getY(i) + dt * (1.2 + (i % 5) * 0.3);
        if (y > 40) y = LAVA_Y + Math.random() * 4;
        p.setY(i, y); p.setX(i, p.getX(i) + Math.sin(elapsed + i) * dt * 0.4);
      }
      p.needsUpdate = true;
    },
    resolveDynamicGates() { /* none */ },
  };
}
