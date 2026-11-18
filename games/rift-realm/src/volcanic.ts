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
    kit.box(darkStone, 68, TIER, 48, -16, TIER / 2, -62.4, 0, { tpm: 0.4 });           // upper tier
    // parapet along the tier edge, broken where the stairs and bridge arrive
    for (const [a, b] of [[-50, -43], [-37, -31.5], [-24.5, -10.5], [-1.5, 18]] as const) B.curtain(darkStone, (a + b) / 2, tz0, 0, b - a, 1.1, TIER, 0.8);
    B.flight(stone, -28, 0.05, tz0 + 12.8, Math.PI, TIER, 6);                         // grand stair (west of the fortress block)
    B.flight(stone, -40, 0.05, tz0 + 12.8, Math.PI, TIER, 5);                         // west-lane flight
    const kz = -72, ky = TIER;
    B.gothicWall(runeStone, -16, -52, 0, 34, 20, 3, ky, 2.4, 0.62);                   // gatehouse arcade facing the compound
    kit.box(darkStone, 40, 34, 22, -16, ky + 17, kz + 6, 0, { tpm: 0.3 });              // keep body
    for (const [x, z, w, h] of [[-36, -54, 10, 40], [4, -54, 10, 40], [-46, -72, 12, 50], [14, -74, 9, 38], [-16, -76, 9, 56]] as const) B.tower(darkStone, x, z, w, h, ky, false);
    // gabled roof ridge over the keep body
    { const g = new THREE.CylinderGeometry(0.4, 12, 9, 4, 1); g.rotateY(Math.PI / 4); g.scale(1.65, 1, 0.9); kit.place(g, -16, ky + 38.5, kz + 6); kit.add(darkStone, g, { tpm: 0.3, solid: false }); }
    // lit windows: keep body rows + tower slits
    for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) kit.box(windowMat, 1.4, 3.6, 0.2, -31 + i * 6, ky + 15 + r * 9, kz + 17.1, 0, { solid: false, shadow: false, tpm: 1 });
    for (const [x, z, w, h] of [[-36, -54, 10, 40], [4, -54, 10, 40], [-16, -76, 9, 56]] as const) for (let r = 0; r < 3; r++) kit.box(windowMat, 1.1, 3.2, 0.2, x, ky + h * (0.45 + r * 0.17), z + w / 2 + 0.11, 0, { solid: false, shadow: false, tpm: 1 });
    kit.box(windowMat, 7, 9, 0.3, -16, ky + 4.5, kz + 17.2, 0, { solid: false, shadow: false, tpm: 1 }); // lit great gate
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
