// Elderwood Wilds — the structure kit the places are built from: canopy decks round living trunks, rope bridges (whole or
// broken), huts and treehouses, stone arches and broken walls, paved courts with circuit lines, holo screens, glow rings,
// sandbags and crates, waterfalls. Everything solid is a simple collider; looks come from the Elderwood materials, and the
// structures with a sheet-built model (assets/elderwood/*.glb) are placed as art by index.ts.
import * as THREE from 'three/webgpu';
import { color, float, fract, mix, normalWorld, positionWorld, sin, smoothstep, texture as tslTexture, time, uniform, uv, vec3 } from 'three/tsl';
import { taperTube, polyPrism, boulder } from '../geom';
import { art, barkTube } from '../cyberforest';
import type { WildsCtx } from './registry';
import type { WorldTerrain } from './terrain';
import { riftFallSheet } from '../creek';

export type P3 = { x: number; y: number; z: number };

export function makeKit(ctx: WildsCtx, terrain: WorldTerrain) {
  const { kit, B, mats, group, lo } = ctx;
  const H = (x: number, z: number) => terrain.surface(x, z);
  const cyan = color(0x2ae6ff);
  const barkGeos: THREE.BufferGeometry[] = [];      // living trunks and logs (merged into one mesh, solid)
  const trimGeos: THREE.BufferGeometry[] = [];      // roots, braces, ladder rails (merged, not solid)
  const clears: number[][] = [];
  const lights: { x: number; y: number; z: number; c: number; i: number; d: number }[] = [];

  // ── emissive materials ─────────────────────────────────────────────────────────────────────────────────────
  const glow = (hex: number, k = 1.6) => { const m = new THREE.MeshStandardNodeMaterial({ color: 0x050608, roughness: 0.4 }); m.emissiveNode = color(hex).mul(float(k).add(uniformBeat(ctx).mul(0.6))); return m; };
  const cyanGlow = glow(0x2ae6ff, 1.4), amberGlow = glow(0xffa850, 1.8), violetGlow = glow(0xa070ff, 1.5), goldGlow = glow(0xffc864, 1.6);
  const crystalMat = new THREE.MeshStandardNodeMaterial({ color: 0x1a6a88, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.9 });
  crystalMat.emissiveNode = color(0x46e8ff).mul(float(1.1).add(sin(time.mul(1.3)).mul(0.25)).add(uniformBeat(ctx).mul(0.5)));
  const metal = new THREE.MeshStandardNodeMaterial({ color: 0x3a4248, roughness: 0.45, metalness: 0.75 });
  const canvasMat = new THREE.MeshStandardNodeMaterial({ color: 0x6f6650, roughness: 1, side: THREE.DoubleSide });
  const sandbag = new THREE.MeshStandardNodeMaterial({ color: 0x8a7a58, roughness: 1 });
  const crate = new THREE.MeshStandardNodeMaterial({ color: 0x4a5236, roughness: 0.8, metalness: 0.2 });
  // forest rock: the rock sheet's relief in grey-green stone, moss over every upward face (no volcanic orange)
  const mossyStone = (cover: number, lo0: number) => {
    const src = mats.rock as THREE.MeshStandardNodeMaterial;
    const m = new THREE.MeshStandardNodeMaterial({ normalMap: src.normalMap, roughnessMap: src.roughnessMap, roughness: 0.95 });
    m.normalScale.set(1.3, 1.3);
    const rl = src.map ? tslTexture(src.map, uv()).rgb.dot(vec3(0.3, 0.55, 0.15)) : float(0.4);
    // the moss sheet's light and shade only, in forest green (its own colours are teal-violet strands)
    const ml = tslTexture(art('moss_strand_albedo.jpg', true, true), positionWorld.xz.mul(0.35)).rgb.dot(vec3(0.3, 0.55, 0.15));
    const moss = vec3(ml).mul(vec3(0.3, 0.46, 0.2)).add(vec3(0.01, 0.02, 0.005));
    const up = smoothstep(float(lo0), float(lo0 + 0.4), normalWorld.y);
    m.colorNode = mix(vec3(rl).mul(vec3(0.46, 0.52, 0.48)), moss, up.mul(cover));
    return m;
  };
  const mossRock = mossyStone(0.85, 0.35);
  const moundMat = mossyStone(1, -0.2);       // moss everywhere but the undersides
  /** A moss mound: a low lumpy hump of earth and moss (the art's overgrown floor), rad across, h high. */
  const mound = (x: number, z: number, rad: number, h: number, y = H(x, z), seed = 1) => {
    const g = boulder(1, x * 0.71 + z * 1.3 + seed, lo ? 1 : 2);
    kit.place(g, x, y - h * 0.3, z, seed * 1.7, 0, 0, rad, h * 1.3, rad * (0.75 + 0.5 * ((seed * 0.37) % 1)));
    kit.add(moundMat, g, { tpm: 0.5, solid: h > 1.0 });
  };
  /** Grass allowed back into a place's footprint (cracks in paving): [x, z, r, cover]. */
  const grassy: number[][] = [];

  // ── decks: a living trunk through a polygon deck, struts, a rope rail with openings, optional crenellated stone cap ──
  type DeckOpts = { sides?: number; open?: number[]; trunk?: boolean; trunkR?: number; crenel?: boolean; rail?: boolean; posts?: boolean; rune?: number | null; hut?: number | null; lamp?: boolean; square?: boolean; thick?: number };
  const deck = (x: number, z: number, y: number, r: number, o: DeckOpts = {}) => {
    const sides = o.square ? 4 : o.sides ?? 8, gy = H(x, z), tr = o.trunkR ?? Math.max(1.2, r * 0.22);
    const rot = o.square ? Math.PI / 4 : Math.PI / sides;
    const outer: [number, number][] = [];
    for (let k = 0; k < sides; k++) { const a = (k / sides) * Math.PI * 2 + rot; outer.push([x + Math.sin(a) * r, z + Math.cos(a) * r]); }
    const holes: [number, number][][] = [];
    if (o.trunk !== false) { const h: [number, number][] = []; for (let k = 11; k >= 0; k--) { const a = (k / 12) * Math.PI * 2; h.push([x + Math.sin(a) * (tr + 0.3), z + Math.cos(a) * (tr + 0.3)]); } holes.push(h); }
    const d = polyPrism(outer, holes, y - (o.thick ?? 0.45), y);
    kit.add(mats.wood, d.top, { tpm: 0.35 }); kit.add(mats.darkWood, d.sides, { tpm: 0.5 });
    if (o.trunk !== false) {
      const c = new THREE.CatmullRomCurve3([new THREE.Vector3(x, gy - 1.5, z), new THREE.Vector3(x + 0.4, (gy + y) / 2, z - 0.3), new THREE.Vector3(x - 0.3, y + 6, z + 0.2), new THREE.Vector3(x, y + 12, z)]);
      barkGeos.push(barkTube(c, tr + 0.35, tr * 0.6, lo ? 8 : 14, lo ? 9 : 14, 0.4, x + z));
      terrain.addTrunk(x, z, tr + 0.2, gy - 2, y + 12);
      for (let k = 0; k < 5; k++) { // roots
        const a = (k / 5) * 6.28 + x, len = tr * 3 + 3, ex = x + Math.sin(a) * len, ez = z + Math.cos(a) * len;
        trimGeos.push(barkTube(new THREE.CatmullRomCurve3([new THREE.Vector3(x, gy + tr * 1.6, z), new THREE.Vector3(x + Math.sin(a) * len * 0.5, gy + 0.6, z + Math.cos(a) * len * 0.5), new THREE.Vector3(ex, H(ex, ez) - 0.3, ez)]), tr * 0.45, 0.15, 7, 7, 0.5, k + z));
      }
      for (let k = 0; k < 4; k++) { // struts under the deck
        const a = (k / 4) * Math.PI * 2 + 0.4, ox = x + Math.sin(a) * (r - 1), oz = z + Math.cos(a) * (r - 1);
        trimGeos.push(barkTube(new THREE.LineCurve3(new THREE.Vector3(x + Math.sin(a) * tr, y - Math.min(7, r), z + Math.cos(a) * tr), new THREE.Vector3(ox, y - 0.45, oz)), 0.3, 0.26, 3, 7, 0.1, k));
      }
    } else if (y - gy > 1.5) { // posts down to the ground
      for (let k = 0; k < sides; k++) {
        const a = (k / sides) * Math.PI * 2 + rot, px = x + Math.sin(a) * (r - 0.6), pz = z + Math.cos(a) * (r - 0.6);
        barkGeos.push(barkTube(new THREE.LineCurve3(new THREE.Vector3(px, H(px, pz) - 0.5, pz), new THREE.Vector3(px, y - 0.4, pz)), 0.35, 0.3, 3, 7, 0.15, k + x));
      }
    }
    const isOpen = (a: number) => (o.open ?? []).some((q) => Math.abs(Math.atan2(Math.sin(a - q), Math.cos(a - q))) < Math.max(0.16, 1.6 / r));
    const per = Math.max(sides, Math.round((2 * Math.PI * r) / 2.4));
    if (o.crenel) {
      // the eh-01 look: a low stone wall round the deck with merlons, gaps where the bridges land
      for (let k = 0; k < per; k++) {
        const a = ((k + 0.5) / per) * Math.PI * 2; if (isOpen(a)) continue;
        const px = x + Math.sin(a) * (r - 0.45), pz = z + Math.cos(a) * (r - 0.45), w = (2 * Math.PI * r) / per + 0.05;
        kit.box(mats.stone, w, 0.9, 0.7, px, y + 0.45, pz, a + Math.PI / 2, { tpm: 0.6 });
        if (k % 2 === 0) kit.box(mats.stone, w * 0.6, 0.6, 0.75, px, y + 1.2, pz, a + Math.PI / 2, { tpm: 0.6 });
      }
    } else if (o.rail !== false) {
      for (let k = 0; k < per; k++) {
        const a0 = (k / per) * Math.PI * 2, a1 = ((k + 1) / per) * Math.PI * 2;
        const p0 = { x: x + Math.sin(a0) * (r - 0.3), z: z + Math.cos(a0) * (r - 0.3) }, p1 = { x: x + Math.sin(a1) * (r - 0.3), z: z + Math.cos(a1) * (r - 0.3) };
        if (!isOpen(a0)) kit.box(mats.darkWood, 0.22, 1.25, 0.22, p0.x, y + 0.62, p0.z, a0, { tpm: 1 });
        if (isOpen(a0) || isOpen(a1)) continue;
        const c = new THREE.QuadraticBezierCurve3(new THREE.Vector3(p0.x, y + 1.1, p0.z), new THREE.Vector3((p0.x + p1.x) / 2, y + 0.88, (p0.z + p1.z) / 2), new THREE.Vector3(p1.x, y + 1.1, p1.z));
        kit.add(mats.rope, taperTube(c, 0.05, 0.05, 5, 5), { solid: false, shadow: false });
        const mid = { x: (p0.x + p1.x) / 2, z: (p0.z + p1.z) / 2 };
        kit.box(B.invisible, Math.hypot(p1.x - p0.x, p1.z - p0.z) + 0.1, 1.2, 0.2, mid.x, y + 0.6, mid.z, (a0 + a1) / 2, { shadow: false });
      }
    }
    if (o.rune != null) runeCircle(x + (o.trunk !== false ? Math.sin(0.7) * r * 0.55 : 0), y, z + (o.trunk !== false ? Math.cos(0.7) * r * 0.55 : 0), Math.min(3.2, r * 0.32), o.rune);
    if (o.hut != null) { const a = o.hut, hp = { x: x + Math.sin(a) * r * 0.55, z: z + Math.cos(a) * r * 0.55 }; hut(hp.x, y, hp.z, a, 3.4, 2.8, 2.5); }
    if (o.lamp !== false) lamp(x + Math.sin(2.2) * (r - 1.2), y + 2.4, z + Math.cos(2.2) * (r - 1.2));
    return { x, y, z, r, rim: (a: number, inset = 0.3) => ({ x: x + Math.sin(a) * (r - inset), y, z: z + Math.cos(a) * (r - inset) }) };
  };
  type Deck = ReturnType<typeof deck>;
  const toward = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.atan2(b.x - a.x, b.z - a.z);

  // ── rope bridges: planks on a sagging curve, rope hand-lines and hangers, invisible guard; `broken` drops planks ──
  const bridge = (a: P3, b: P3, o: { width?: number; sag?: number; broken?: boolean; seed?: number } = {}) => {
    const width = o.width ?? 2, L = Math.hypot(b.x - a.x, b.z - a.z), sag = o.sag ?? Math.min(2.2, L * 0.025);
    const yaw = Math.atan2(b.x - a.x, b.z - a.z), n = Math.ceil(L / 0.55);
    for (let d = 0; d <= L; d += 7) clears.push([a.x + (b.x - a.x) * d / L, a.z + (b.z - a.z) * d / L, 5.5]);   // no tree trunks through a bridge
    const at = (t: number) => new THREE.Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - sag * Math.sin(Math.PI * t), a.z + (b.z - a.z) * t);
    let s = o.seed ?? Math.abs(a.x * 7 + b.z * 13);
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      // a broken bridge: a gap you have to jump in the middle, loose planks either side
      if (o.broken && ((t0 > 0.44 && t0 < 0.56) || rnd() < 0.18)) continue;
      const p0 = at(t0), p1 = at(t1), mid = p0.clone().add(p1).multiplyScalar(0.5);
      const pitch = Math.atan2(p1.y - p0.y, Math.hypot(p1.x - p0.x, p1.z - p0.z));
      const tilt = o.broken ? (rnd() - 0.5) * 0.25 : 0;
      kit.box(i % 2 ? mats.wood : mats.darkWood, width * (o.broken ? 0.7 + rnd() * 0.35 : 1), 0.09, 0.5, mid.x, mid.y - 0.045, mid.z, yaw + tilt * 0.3, { tpm: 0.8, rx: -pitch, rz: tilt });
    }
    for (const sd of [-1, 1]) {
      const ox = Math.cos(yaw) * sd * (width / 2), oz = -Math.sin(yaw) * sd * (width / 2);
      const pts = Array.from({ length: 17 }, (_, k) => at(k / 16).add(new THREE.Vector3(ox, 1.05, oz)));
      if (o.broken && sd > 0) { // one hand-line snapped and hanging
        const half = pts.slice(0, 7); half.push(half[6].clone().add(new THREE.Vector3(0, -3, 0)));
        kit.add(mats.rope, taperTube(new THREE.CatmullRomCurve3(half), 0.05, 0.05, 16, 5), { solid: false, shadow: false });
      } else kit.add(mats.rope, taperTube(new THREE.CatmullRomCurve3(pts), 0.05, 0.05, 32, 5), { solid: false, shadow: false });
      for (let k = 1; k < 16; k++) {
        if (o.broken && sd > 0 && k > 6) continue;
        const p = at(k / 16).add(new THREE.Vector3(ox, 0, oz));
        kit.add(mats.rope, taperTube(new THREE.LineCurve3(p, p.clone().add(new THREE.Vector3(0, 1.05, 0))), 0.025, 0.025, 1, 4), { solid: false, shadow: false });
      }
      if (o.broken) continue;
      for (let k = 0; k < 10; k++) {
        const p0 = at(k / 10), p1 = at((k + 1) / 10), mid = p0.clone().add(p1).multiplyScalar(0.5);
        kit.box(B.invisible, 0.15, 1.1, Math.hypot(p1.x - p0.x, p1.z - p0.z) + 0.1, mid.x + ox * 1.05, mid.y + 0.55, mid.z + oz * 1.05, yaw, { shadow: false });
      }
    }
  };
  /** Bridge between two decks, landing in each rail's opening. */
  const link = (d1: Deck, d2: Deck, o: { width?: number; sag?: number; broken?: boolean } = {}) => bridge(d1.rim(toward(d1, d2)), d2.rim(toward(d2, d1)), o);

  // ── buildings ─────────────────────────────────────────────────────────────────────────────────────────────────
  const hut = (x: number, y: number, z: number, yaw: number, w: number, d: number, h: number, o: { door?: boolean; lit?: boolean } = {}) => {
    const fx = Math.sin(yaw), fz = Math.cos(yaw), sx = Math.cos(yaw), sz = -Math.sin(yaw);
    // walls: back + sides solid, the front with a door gap
    kit.box(mats.darkWood, w, h, 0.25, x - fx * d / 2, y + h / 2, z - fz * d / 2, yaw, { tpm: 0.6 });
    for (const s of [-1, 1]) kit.box(mats.darkWood, 0.25, h, d, x + sx * s * w / 2, y + h / 2, z + sz * s * w / 2, yaw, { tpm: 0.6 });
    if (o.door === false) kit.box(mats.darkWood, w, h, 0.25, x + fx * d / 2, y + h / 2, z + fz * d / 2, yaw, { tpm: 0.6 });
    else for (const s of [-1, 1]) kit.box(mats.darkWood, w * 0.32, h, 0.25, x + fx * d / 2 + sx * s * w * 0.34, y + h / 2, z + fz * d / 2 + sz * s * w * 0.34, yaw, { tpm: 0.6 });
    // pitched roof, eaves out over the walls
    for (const s of [-1, 1]) kit.box(mats.wood, w / 2 * 1.25, 0.18, d + 0.9, x + sx * s * w * 0.28, y + h + w * 0.2, z + sz * s * w * 0.28, yaw, { tpm: 0.6, rz: -s * 0.62 });
    if (o.lit !== false) { const wx = x + fx * (d / 2 + 0.01), wz = z + fz * (d / 2 + 0.01); kit.box(amberGlow, w * 0.18, h * 0.22, 0.05, wx + sx * w * 0.34, y + h * 0.62, wz + sz * w * 0.34, yaw, { solid: false, shadow: false }); }
  };
  const lamp = (x: number, y: number, z: number, hex = 0xffb050, i = 22) => {
    kit.box(mats.lamp, 0.3, 0.45, 0.3, x, y, z, 0, { solid: false, shadow: false });
    lights.push({ x, y, z, c: hex, i, d: 14 });
  };

  // ── stone ─────────────────────────────────────────────────────────────────────────────────────────────────────
  /** Pointed (gothic) or round arch on two piers; width = clear opening. */
  const arch = (x: number, z: number, yaw: number, w: number, h: number, o: { y?: number; pointed?: boolean; depth?: number; broken?: number } = {}) => {
    const y = o.y ?? H(x, z), dx = Math.cos(yaw), dz = -Math.sin(yaw), dep = o.depth ?? 1.2, pier = Math.max(0.9, w * 0.18);
    for (const s of [-1, 1]) kit.box(mats.stone, pier, h, dep, x + dx * s * (w / 2 + pier / 2), y + h / 2, z + dz * s * (w / 2 + pier / 2), yaw, { tpm: 0.5 });
    const n = 9, rise = o.pointed === false ? w / 2 : w * 0.62;
    for (let j = 0; j < n; j++) {
      if (o.broken && j >= n - o.broken) continue;
      const t = (j + 0.5) / n, ang = Math.PI * t, ox = -Math.cos(ang) * (w / 2 + pier * 0.4);
      const oy = o.pointed === false ? Math.sin(ang) * rise : Math.pow(Math.sin(ang), 0.75) * rise;
      kit.box(mats.stone, (Math.PI * w) / (2 * n) + 0.45, 0.7, dep, x + dx * ox, y + h + oy, z + dz * ox, yaw, { tpm: 0.5, rz: -Math.cos(ang) * (o.pointed === false ? 1.2 : 0.8) });
    }
  };
  /** Broken stone wall: blocks with a ragged top. */
  const ruinWall = (x: number, z: number, yaw: number, len: number, h: number, seed = 1) => {
    const dx = Math.cos(yaw), dz = -Math.sin(yaw), n = Math.max(1, Math.round(len / 1.6));
    for (let i = 0; i < n; i++) {
      const o = -len / 2 + (i + 0.5) * (len / n), px = x + dx * o, pz = z + dz * o, hh = h * (0.45 + 0.55 * Math.abs(Math.sin(seed * 3.1 + i * 1.7)));
      kit.box(mats.stone, len / n + 0.04, hh, 1.0, px, H(px, pz) + hh / 2 - 0.2, pz, yaw, { tpm: 0.5 });
    }
  };
  const pillar = (x: number, z: number, h: number, r = 0.7, y = H(x, z)) => {
    kit.prism(mats.stone, 10, r * 1.25, r * 1.35, 0.6, x, y - 0.1, z, 0, { tpm: 0.5 });
    kit.prism(mats.stone, 10, r, r * 1.05, h, x, y + 0.5, z, 0, { tpm: 0.5 });
    kit.prism(mats.stone, 10, r * 1.3, r * 1.1, 0.6, x, y + 0.5 + h, z, 0, { tpm: 0.5 });
  };
  // ── paved floors: real flagstones, not a textured plane. Each stone is its own bevelled slab (an irregular outline,
  //    chipped corners), laid in running-bond rows with gaps, heaved and tilted by a few cm; in a few hollows the stones
  //    have sunk and rain stands in a puddle over them. Under the stones: dark mossy earth (the collider). ──
  const soilMat = mossyStone(1, -1);
  // weathered grey flagstone: the rock sheet's relief (normal map) only, its colour a soft mottle of grey with a green cast
  const flagMat = (() => {
    const src = mats.rock as THREE.MeshStandardNodeMaterial;
    const m = new THREE.MeshStandardNodeMaterial({ normalMap: src.normalMap, roughness: 0.62 });
    m.normalScale.set(0.8, 0.8);
    const mossTex = art('moss_strand_albedo.jpg', true, true);
    const mot = tslTexture(mossTex, positionWorld.xz.mul(0.06)).rgb.dot(vec3(0.3, 0.55, 0.15));
    const fine = tslTexture(mossTex, positionWorld.xz.mul(0.9)).rgb.dot(vec3(0.3, 0.55, 0.15));
    // the art's paving (Portal Plaza, Circuit Court, Cathedral): dark worn stone, each slab its own tone, moss and dirt
    // packed into the joints and up the bevels, moss creeping onto the tops in patches
    // per-stone tone: a hash of the ~1 m cell the stone sits in (stones are about a cell; floor = x - fract(x))
    const cellXZ = positionWorld.xz.div(1.05);
    const cell = cellXZ.sub(fract(cellXZ));
    const h1 = fract(sin(cell.x.mul(127.1).add(cell.y.mul(311.7))).mul(43758.55));
    const h2 = fract(sin(cell.x.mul(269.5).add(cell.y.mul(183.3))).mul(24634.63));
    const tone = vec3(0.062, 0.072, 0.082).mul(float(0.7).add(h1.mul(0.6)))                  // light/dark slabs
      .mul(mix(vec3(1.0, 1.0, 0.97), vec3(0.9, 0.98, 1.1), h2));                          // warm or cool grey
    const stone = tone.mul(float(0.7).add(mot.mul(0.55)).add(fine.mul(0.2)));
    // faces: tops (worn, slightly lighter where feet go), bevels and sides (joints) carry moss and dirt
    const top = smoothstep(float(0.955), float(0.992), normalWorld.y);
    const mossCol = vec3(0.045, 0.075, 0.028).mul(float(0.6).add(fine.mul(0.9)));
    const dirt = vec3(0.035, 0.03, 0.022);
    // moss creeping onto the tops: big soft patches from the moss sheet, more on some slabs than others
    const patch = smoothstep(float(0.36), float(0.62), mot.mul(0.75).add(h2.mul(0.35)));
    const joint = float(1).sub(top);
    const c0 = mix(stone, mossCol, patch.mul(0.85).mul(top));
    m.colorNode = mix(c0, mix(dirt, mossCol, fine.add(0.2).min(1)), joint.mul(0.9));
    m.roughnessNode = mix(float(0.58).add(h1.mul(0.12)), float(0.88), patch.mul(top).add(joint).min(1));
    return m;
  })();
  const puddleMat = (() => {
    const m = new THREE.MeshStandardNodeMaterial({ color: 0x050a09, roughness: 0.02, metalness: 0.1, transparent: true, depthWrite: false });
    // the haze and the canopy light mirrored in the water (the day environment barely reflects): brighter toward the shore
    m.emissiveNode = color(0x7f9890).mul(float(0.28).add(uv().sub(0.5).length().mul(0.4))).add(color(0x2ae6ff).mul(uniformBeat(ctx).mul(0.08)));
    const d = uv().sub(0.5).length().mul(2);                                      // soft shore, faint ripples
    m.opacityNode = float(1).sub(smoothstep(float(0.7), float(1.0), d)).mul(0.92);
    m.normalNode = normalWorld.add(vec3(sin(positionWorld.x.mul(9).add(time.mul(1.7))).mul(0.015), 0, sin(positionWorld.z.mul(8).sub(time.mul(1.3))).mul(0.015))).normalize();
    return m;
  })();
  let stoneCount = 0;
  /** One flagstone: an irregular outline (corners pulled about, sometimes chipped), bevelled, h thick, base at y = 0. */
  const slab = (w: number, d: number, h: number, rnd: () => number) => {
    const pts: THREE.Vector2[] = [];
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const jx = (rnd() - 0.5) * 0.14 * w, jz = (rnd() - 0.5) * 0.14 * d;
      if (rnd() < 0.22) {
        const c = 0.12 + rnd() * 0.18, first = sx === sz;
        pts.push(new THREE.Vector2(sx * w / 2 * (first ? 1 : 1 - c) + jx, sz * d / 2 * (first ? 1 - c : 1) + jz));
        pts.push(new THREE.Vector2(sx * w / 2 * (first ? 1 - c : 1) + jx, sz * d / 2 * (first ? 1 : 1 - c) + jz));
      } else pts.push(new THREE.Vector2(sx * w / 2 + jx, sz * d / 2 + jz));
    }
    if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
    const b = Math.min(0.045, h * 0.3);
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: h - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 1, curveSegments: 1 });
    g.rotateX(-Math.PI / 2); g.translate(0, b, 0);
    return g;
  };
  /** Flagstones over the polygon `pts` at height y. pits: [x, z, r] hollows where the stones sank and a puddle stands. */
  const paving = (pts: [number, number][], y: number, o: { pits?: number[][]; seed?: number; cell?: number } = {}) => {
    const base = polyPrism(pts, [], y - 0.6, y + 0.02);
    if (lo) { kit.add(mats.stone, base.top, { tpm: 0.33 }); kit.add(mats.stone, base.sides, { tpm: 0.4 }); return; }
    kit.add(soilMat, base.top, { tpm: 0.4 }); kit.add(soilMat, base.sides, { tpm: 0.4 });
    let sd = o.seed ?? Math.abs(Math.round(pts[0][0] * 31 + pts[0][1] * 17)) % 200000 + 7;
    const rnd = () => ((sd = (sd * 9301 + 49297) % 233280) / 233280);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [px, pz] of pts) { x0 = Math.min(x0, px); x1 = Math.max(x1, px); z0 = Math.min(z0, pz); z1 = Math.max(z1, pz); }
    const inside = (px: number, pz: number) => {
      let c = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, zi] = pts[i], [xj, zj] = pts[j]; if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) c = !c; }
      return c;
    };
    // hollows: the ones asked for, else about one per 150 m² of floor
    const pits = o.pits ?? Array.from({ length: Math.max(1, Math.round(((x1 - x0) * (z1 - z0)) / 150)) }, () => [x0 + rnd() * (x1 - x0), z0 + rnd() * (z1 - z0), 0.9 + rnd() * 1.4]).filter((q) => inside(q[0], q[1]));
    const sink = (px: number, pz: number) => { let s = 0; for (const [qx, qz, qr] of pits) { const t = 1 - ((px - qx) ** 2 + (pz - qz) ** 2) / (qr * 1.25) ** 2; if (t > 0) s = Math.max(s, t); } return s; };
    const cell = o.cell ?? 1.05, yaw = rnd() * 6.283, ca = Math.cos(yaw), sa = Math.sin(yaw);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, R = Math.hypot(x1 - x0, z1 - z0) / 2 + cell;
    // running bond: rows of stones of varied length, each row offset
    for (let v = -R; v < R; v += cell * 0.86) {
      let u = -R + rnd() * cell;
      while (u < R) {
        const len = cell * (0.7 + rnd() * 0.75), wid = cell * 0.86 - 0.07 - rnd() * 0.05;
        const mu = u + len / 2, px = cx + mu * ca - v * sa, pz = cz + mu * sa + v * ca;
        u += len + 0.06 + rnd() * 0.06;
        if (!inside(px, pz) || rnd() < 0.05) continue;                       // a few stones missing: earth and moss show
        const k = sink(px, pz), heave = Math.sin(px * 0.61 + 1.3) * Math.sin(pz * 0.53) * 0.035 + rnd() * 0.03;
        const h = 0.16 + rnd() * 0.08, broken = rnd() < 0.08;
        const g = slab((broken ? 0.55 : 1) * (len - 0.06), wid, h, rnd);
        kit.place(g, px, y - 0.1 + heave - k * 0.26, pz, -yaw + (rnd() - 0.5) * 0.06, (rnd() - 0.5) * (0.05 + k * 0.12), (rnd() - 0.5) * (0.05 + k * 0.12));
        kit.add(flagMat, g, { tpm: 0.5, solid: false });
        stoneCount++;
      }
    }
    for (const [qx, qz, qr] of pits) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(qr * 1.15, 28), puddleMat); m.rotation.set(-Math.PI / 2, 0, rnd() * 6.28);
      m.scale.set(1 + rnd() * 0.6, 1, 1); m.position.set(qx, y + 0.06, qz); m.renderOrder = 2; group.add(m);
    }
  };
  const discPave = (x: number, z: number, r: number, y: number, n = 32, o: { pits?: number[][]; seed?: number } = {}) => paving(Array.from({ length: n }, (_, k) => [x + Math.sin((k / n) * 6.283) * r, z + Math.cos((k / n) * 6.283) * r] as [number, number]), y, o);

  // ── glow vines across the floor: living vines snaking over the stones, bioluminescent rings running along them that
  //    flare on every beat of whatever music is playing (the level's beat pulse) ──
  const vineGeos: THREE.BufferGeometry[] = [];
  const vineMat = (() => {
    const m = new THREE.MeshStandardNodeMaterial({ color: 0x121c10, roughness: 0.55 });
    const s = uv().x;                                                              // metres along the vine
    const ph = fract(s.div(1.7).sub(time.mul(0.8)));                               // rings travelling along it
    const ring = smoothstep(float(0.0), float(0.05), ph).mul(smoothstep(float(0.2), float(0.07), ph));
    const b = uniformBeat(ctx);
    // between beats the rings glow softly; on the beat they flare and the whole vine lights
    m.emissiveNode = color(0x34ffd2).mul(ring.mul(float(0.6).add(b.mul(3.5))).add(b.mul(0.06)).add(0.015));
    return m;
  })();
  /** n glow vines over a floor round (x, z) within r at height y (keepClear keeps paths free). */
  const glowVines = (x: number, z: number, r: number, y: number, n: number, seed = 3, keepClear?: (x: number, z: number) => boolean) => {
    let sd = seed; const rnd = () => ((sd = (sd * 9301 + 49297) % 233280) / 233280);
    for (let k = 0; k < n; k++) {
      const a = rnd() * 6.283, d = Math.sqrt(rnd()) * r;
      let px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d, dir = rnd() * 6.283;
      const L = 7 + rnd() * 11, pts: THREE.Vector3[] = [];
      for (let s = 0; s <= L; s += 0.8) {
        if (keepClear?.(px, pz)) { if (pts.length > 2) break; dir += 1.2; }
        if ((px - x) ** 2 + (pz - z) ** 2 > r * r) dir = Math.atan2(x - px, z - pz) + (rnd() - 0.5);
        pts.push(new THREE.Vector3(px, y + 0.17 + Math.sin(s * 1.9 + k) * 0.05, pz));
        dir += (rnd() - 0.5) * 0.7; px += Math.sin(dir) * 0.8; pz += Math.cos(dir) * 0.8;
      }
      if (pts.length < 4) continue;
      const curve = new THREE.CatmullRomCurve3(pts), len = curve.getLength(), rad = 0.045 + rnd() * 0.04;
      const g = new THREE.TubeGeometry(curve, Math.ceil(len * 5), rad, 6, false);
      const t = g.attributes.uv; for (let i = 0; i < t.count; i++) t.setX(i, t.getX(i) * len + k * 3.1);   // u in metres
      vineGeos.push(g);
      if (rnd() < 0.6) { // a thinner tendril off the vine
        const p0 = curve.getPoint(0.3 + rnd() * 0.4), tp: THREE.Vector3[] = [p0]; let td = rnd() * 6.283, tx = p0.x, tz = p0.z;
        for (let i = 0; i < 5; i++) { td += rnd() - 0.5; tx += Math.sin(td) * 0.7; tz += Math.cos(td) * 0.7; tp.push(new THREE.Vector3(tx, y + 0.13, tz)); }
        const tc = new THREE.CatmullRomCurve3(tp), tl = tc.getLength(), tg = new THREE.TubeGeometry(tc, Math.ceil(tl * 5), rad * 0.5, 5, false);
        const tu = tg.attributes.uv; for (let i = 0; i < tu.count; i++) tu.setX(i, tu.getX(i) * tl + k * 1.7);
        vineGeos.push(tg);
      }
    }
  };

  /** Every boulder rocks() placed, [x, z, radius] (world/water.ts foams the river round the ones in it). */
  const rockSpots: [number, number, number][] = [];
  const rocks = (x: number, z: number, n: number, rad: number, size: [number, number], seed = 1) => {
    let s = seed; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.283, d = rnd() * rad, px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d, r = size[0] + rnd() * (size[1] - size[0]);
      const g = boulder(r, px * 0.37 + pz, lo ? 1 : 2); kit.place(g, px, H(px, pz) - r * 0.35, pz, rnd() * 6.28); kit.add(mossRock, g, { tpm: 0.4 }); rockSpots.push([px, pz, r]);
    }
  };

  // ── glowing bits: circuit lines, rune circles, rings, screens, crystals ─────────────────────────────────────
  const decal = (tex: THREE.Texture, x: number, y: number, z: number, w: number, d: number, yaw: number, tint: number, k = 1.4) => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const tx = tslTexture(tex);
    m.colorNode = tx.rgb.mul(color(tint)).mul(float(k).add(uniformBeat(ctx).mul(0.8)));
    m.opacityNode = tx.a;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
    mesh.rotation.set(-Math.PI / 2, 0, yaw); mesh.position.set(x, y + 0.06, z); mesh.renderOrder = 2;
    group.add(mesh); return mesh;
  };
  const runeCircle = (x: number, y: number, z: number, r: number, hex: number) => decal(texRune(), x, y, z, r * 2, r * 2, 0, hex, 1.2);
  const circuit = (x: number, y: number, z: number, w: number, d: number, yaw: number, hex = 0x2ae6ff, seed = 1) => decal(texCircuit(seed), x, y, z, w, d, yaw, hex, 1.5);
  const ring = (x: number, y: number, z: number, r0: number, r1: number, mat: THREE.Material = cyanGlow) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 96), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, y + 0.07, z); group.add(m); return m;
  };
  const screen = (x: number, y: number, z: number, yaw: number, w: number, h: number, lines: string[], hex = '#46e8ff') => {
    const m = new THREE.MeshBasicNodeMaterial({ map: texScreen(lines, hex), transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    mesh.position.set(x, y, z); mesh.rotation.y = yaw; group.add(mesh);
  };
  const crystal = (x: number, z: number, h: number, y = H(x, z), seed = 1) => {
    let s = seed; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 5; i++) {
      const hh = h * (0.45 + rnd() * 0.6), g = new THREE.OctahedronGeometry(1, 0);
      g.scale(hh * 0.16, hh * 0.55, hh * 0.16);
      kit.place(g, x + (rnd() - 0.5) * h * 0.4, y + hh * 0.35, z + (rnd() - 0.5) * h * 0.4, rnd() * 6.28, (rnd() - 0.5) * 0.6, (rnd() - 0.5) * 0.6);
      kit.add(crystalMat, g, { solid: i === 0, shadow: false });
    }
    lights.push({ x, y: y + h * 0.6, z, c: 0x46e8ff, i: 26, d: 12 });
  };
  const crates = (x: number, z: number, yaw: number, n = 3, y = H(x, z)) => {
    for (let i = 0; i < n; i++) {
      const s = 0.9 + (i % 2) * 0.3, ox = Math.cos(yaw) * (i - n / 2) * 1.2, oz = -Math.sin(yaw) * (i - n / 2) * 1.2;
      kit.box(crate, s, s * 0.8, s, x + ox, y + s * 0.4 + (i === n - 1 && n > 2 ? s * 0.8 : 0), z + oz, yaw + i * 0.2, { tpm: 1 });
    }
  };
  const sandbags = (x: number, z: number, yaw: number, len: number, y = H(x, z)) => {
    const n = Math.round(len / 0.7);
    for (let row = 0; row < 3; row++) for (let i = 0; i < n - row % 2; i++) {
      const o = -len / 2 + (i + 0.5 + (row % 2) * 0.5) * (len / n);
      kit.box(sandbag, len / n * 0.98, 0.3, 0.55, x + Math.cos(yaw) * o, y + 0.15 + row * 0.29, z - Math.sin(yaw) * o, yaw, { tpm: 1.5 });
    }
  };

  // ── water falling: a sheet of streaks (spray and mist at the foot: world/water.ts) ─────────────────────────────
  const fallMat = riftFallSheet({ tint: 0x6ccfe0, opacity: 0.82 });   // accelerating streaks, glassy lip, broken white below
  /** A waterfall from `top` (lip centre) dropping to `bottom`, facing along `yaw` (the flow direction), `width` wide. */
  const waterfall = (top: P3, bottom: P3, width: number) => {
    const yaw = Math.atan2(bottom.x - top.x, bottom.z - top.z), hgt = top.y - bottom.y;
    if (!(hgt > 1)) { console.warn('[wilds] waterfall with no drop', top, bottom); return; }
    const g = new THREE.PlaneGeometry(width, hgt, 1, 16);
    // bow the sheet outward: the water leaves the lip forward and falls in an arc
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const t = (hgt / 2 - p.getY(i)) / hgt; p.setZ(i, Math.sqrt(t) * Math.min(4, hgt * 0.12) + Math.hypot(bottom.x - top.x, bottom.z - top.z) * t); }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, fallMat); m.position.set(top.x, top.y - hgt / 2, top.z); m.rotation.y = yaw; group.add(m);
    // (the spray and mist at the foot are particles now: world/water.ts)
  };

  // ── floor clutter: what makes a paved floor read as an overgrown ruin, not a tiled plane ──
  const mossDecal = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d')!;
    for (let k = 0; k < 26; k++) { // a ragged blob: overlapping soft discs
      const x = 128 + (Math.random() - 0.5) * 120, y = 128 + (Math.random() - 0.5) * 120, r = 18 + Math.random() * 46;
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    const blob = new THREE.CanvasTexture(c);
    const m = new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
    const moss = tslTexture(art('moss_strand_albedo.jpg', true, true), positionWorld.xz.mul(0.5)).rgb;
    m.colorNode = moss.mul(vec3(0.55, 0.8, 0.42));
    m.opacityNode = tslTexture(blob, uv()).a.mul(1.3).min(0.95);
    return m;
  })();
  /** Overgrow a floor round (x, z): moss patches, broken and tilted flagstones, roots across it, ferns and grass in the
   *  cracks. `keepClear(x, z)` keeps paths and set pieces free. */
  const clutter = (x: number, z: number, r: number, y: number, o: { moss?: number; slabs?: number; roots?: number; plants?: number; vines?: number; seed?: number; keepClear?: (x: number, z: number) => boolean } = {}) => {
    let sd = o.seed ?? 5; const rnd = () => ((sd = (sd * 9301 + 49297) % 233280) / 233280);
    const spot = () => { for (let t = 0; t < 8; t++) { const a = rnd() * 6.283, d = Math.sqrt(rnd()) * r, px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d; if (!o.keepClear?.(px, pz)) return [px, pz]; } return null; };
    for (let k = 0; k < (o.moss ?? 24); k++) {
      const p = spot(); if (!p) continue; const sz = 1.2 + rnd() * 3.2;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(sz * (1 + rnd()), sz), mossDecal); m.rotation.set(-Math.PI / 2, 0, rnd() * 6.28); m.position.set(p[0], y + 0.07, p[1]); m.renderOrder = 1; group.add(m);
    }
    for (let k = 0; k < (o.slabs ?? 22); k++) { // heaved and broken flagstones
      const p = spot(); if (!p) continue; const w = 0.6 + rnd() * 0.7, d = 0.45 + rnd() * 0.6;
      kit.box(mats.stone, w, 0.16, d, p[0], y + 0.05 + rnd() * 0.08, p[1], rnd() * 6.28, { tpm: 0.6, rx: (rnd() - 0.5) * 0.35, rz: (rnd() - 0.5) * 0.35 });
    }
    for (let k = 0; k < (o.roots ?? 5); k++) { // roots snaking over the stones
      const p = spot(); if (!p) continue; const a = rnd() * 6.283, L = 4 + rnd() * 6, pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 6; i++) { const t = i / 6, w = Math.sin(t * 7 + k) * 0.6; pts.push(new THREE.Vector3(p[0] + Math.sin(a) * L * t + Math.cos(a) * w, y + 0.05 + Math.sin(t * Math.PI) * 0.18, p[1] + Math.cos(a) * L * t - Math.sin(a) * w)); }
      trimGeos.push(barkTube(new THREE.CatmullRomCurve3(pts), 0.22 + rnd() * 0.12, 0.06, 18, 6, 0.2, k * 7 + x));
    }
    for (let k = 0; k < (o.plants ?? 30); k++) {
      const p = spot(); if (!p) continue;
      ctx.plantSpots.push({ x: p[0], y: y - 0.02, z: p[1], yaw: rnd() * 6.28, species: rnd() < 0.7 ? 8 : 7, scale: 0.45 + rnd() * 0.5 });   // green forest fern / undergrowth
    }
    glowVines(x, z, r, y, o.vines ?? Math.round(r / 4), (o.seed ?? 5) * 3 + 1, o.keepClear);
    // no grass blades on paving: the forest grass is a knee-high teal carpet; the green on the floor is moss, mounds, plants
  };

  /** Merge the trunk/trim geometry into the level (call once, after every place is built). */
  const finish = () => {
    const tg = barkGeos.length ? mergeAll(barkGeos) : null;
    if (tg) { const m = new THREE.Mesh(tg, mats.bark); m.castShadow = !lo; m.receiveShadow = true; m.userData.collide = true; m.name = 'wilds-trunks'; group.add(m); }
    const rg = trimGeos.length ? mergeAll(trimGeos) : null;
    if (rg) { const m = new THREE.Mesh(rg, mats.bark); m.castShadow = !lo; m.receiveShadow = true; m.name = 'wilds-trim'; group.add(m); }
    const vg = vineGeos.length ? mergeAll(vineGeos) : null;
    if (vg) { const m = new THREE.Mesh(vg, vineMat); m.receiveShadow = true; m.name = 'wilds-glow-vines'; group.add(m); }
    console.info(`[wilds] ${stoneCount} flagstones, ${vineGeos.length} glow vines`);
  };

  return {
    H, deck, bridge, link, clutter, glowVines, grassy, mossRock, mound, toward, hut, lamp, arch, ruinWall, pillar, paving, discPave, rocks, rockSpots, circuit, runeCircle, ring, screen, crystal, crates, sandbags, waterfall, finish,
    barkGeos, trimGeos, lights, clears,
    mats: { cyanGlow, amberGlow, violetGlow, goldGlow, crystalMat, metal, canvasMat, sandbag, crate, fallMat },
  };
}
export type Kit = ReturnType<typeof makeKit>;

// ── shared bits ──────────────────────────────────────────────────────────────────────────────────────────────────
const makeU = () => uniform(0);
const beatNodes = new WeakMap<object, ReturnType<typeof makeU>>();
/** A TSL uniform that mirrors the level's beat pulse (copied each frame by index.ts). */
export function uniformBeat(ctx: WildsCtx) {
  let u = beatNodes.get(ctx.beat);
  if (!u) { u = makeU(); beatNodes.set(ctx.beat, u); }
  return u;
}
export const syncBeat = (ctx: WildsCtx) => { const u = beatNodes.get(ctx.beat); if (u) u.value = ctx.beat.value; };

function mergeAll(geos: THREE.BufferGeometry[]) {
  // barkTube geometries share attributes (position/normal/uv); merge them as non-indexed
  const list = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uvs = new Float32Array(n * 2);
  let o = 0;
  for (const g of list) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array as Float32Array, o * 3); nor.set(g.attributes.normal.array as Float32Array, o * 3);
    if (g.attributes.uv) uvs.set(g.attributes.uv.array as Float32Array, o * 2);
    o += g.attributes.position.count;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); m.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return m;
}

let runeTex: THREE.Texture | null = null;
function texRune() {
  if (runeTex) return runeTex;
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d')!;
  g.translate(256, 256); g.strokeStyle = '#fff'; g.lineCap = 'round';
  for (const [r, w] of [[240, 10], [214, 4], [150, 6], [128, 3]] as const) { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); }
  g.font = 'bold 26px serif'; g.fillStyle = '#fff'; g.textAlign = 'center';
  const runes = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
  for (let k = 0; k < 24; k++) { g.save(); g.rotate((k / 24) * Math.PI * 2); g.fillText(runes[k], 0, -176); g.restore(); }
  g.lineWidth = 5;
  for (let k = 0; k < 4; k++) { g.save(); g.rotate((k / 4) * Math.PI * 2 + Math.PI / 4); g.beginPath(); g.ellipse(0, -60, 34, 70, 0, 0, Math.PI * 2); g.stroke(); g.restore(); }
  g.beginPath(); g.arc(0, 0, 30, 0, Math.PI * 2); g.stroke();
  runeTex = new THREE.CanvasTexture(c); runeTex.colorSpace = THREE.SRGBColorSpace; return runeTex;
}
const circuitTex = new Map<number, THREE.Texture>();
function texCircuit(seed: number) {
  let t = circuitTex.get(seed); if (t) return t;
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d')!;
  let s = seed * 7919; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 5; g.lineCap = 'round'; g.lineJoin = 'round';
  // traces run from one edge, step at 45°, end in a pad (the art's floor lines)
  for (let k = 0; k < 14; k++) {
    let x = 40 + rnd() * 432, y = 512, dir = 0;
    g.beginPath(); g.moveTo(x, y);
    for (let st = 0; st < 6; st++) {
      const len = 40 + rnd() * 90;
      if (dir === 0) y -= len; else { x += dir * len * 0.7; y -= len * 0.7; }
      g.lineTo(x, y);
      dir = dir === 0 ? (rnd() < 0.5 ? -1 : 1) : 0;
      if (y < 30) break;
    }
    g.stroke(); g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.stroke();
  }
  t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; circuitTex.set(seed, t); return t;
}
function texScreen(lines: string[], hex: string) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 288; const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(6,30,40,0.55)'; g.fillRect(0, 0, 512, 288);
  g.strokeStyle = hex; g.lineWidth = 4; g.strokeRect(6, 6, 500, 276);
  g.fillStyle = hex; g.font = 'bold 40px monospace'; g.fillText(lines[0] ?? '', 24, 58);
  g.font = '24px monospace'; lines.slice(1).forEach((l, i) => g.fillText(l, 24, 104 + i * 34));
  g.globalAlpha = 0.6; g.beginPath(); g.arc(400, 180, 70, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(400, 180, 40, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(330, 180); g.lineTo(470, 180); g.moveTo(400, 110); g.lineTo(400, 250); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
