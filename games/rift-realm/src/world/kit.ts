// Elderwood Wilds — the structure kit the places are built from: canopy decks round living trunks, rope bridges (whole or
// broken), huts and treehouses, stone arches and broken walls, paved courts with circuit lines, holo screens, glow rings,
// sandbags and crates, waterfalls. Everything solid is a simple collider; looks come from the Elderwood materials, and the
// structures with a sheet-built model (assets/elderwood/*.glb) are placed as art by index.ts.
import * as THREE from 'three/webgpu';
import { color, float, fract, mix, sin, smoothstep, texture as tslTexture, time, uniform, uv } from 'three/tsl';
import { taperTube, polyPrism, boulder } from '../geom';
import { barkTube } from '../cyberforest';
import type { WildsCtx } from './registry';
import type { WorldTerrain } from './terrain';

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
  /** A paved floor (flagstones) at y: a thin slab polygon. */
  const paving = (pts: [number, number][], y: number) => { const d = polyPrism(pts, [], y - 0.6, y + 0.04); kit.add(mats.stone, d.top, { tpm: 0.33 }); kit.add(mats.stone, d.sides, { tpm: 0.4 }); };
  const discPave = (x: number, z: number, r: number, y: number, n = 32) => paving(Array.from({ length: n }, (_, k) => [x + Math.sin((k / n) * 6.283) * r, z + Math.cos((k / n) * 6.283) * r] as [number, number]), y);
  const rocks = (x: number, z: number, n: number, rad: number, size: [number, number], seed = 1) => {
    let s = seed; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.283, d = rnd() * rad, px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d, r = size[0] + rnd() * (size[1] - size[0]);
      const g = boulder(r, px * 0.37 + pz, lo ? 1 : 2); kit.place(g, px, H(px, pz) - r * 0.35, pz, rnd() * 6.28); kit.add(mats.rock, g, { tpm: 0.4 });
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

  // ── water falling: a sheet of streaks, mist at the foot ──────────────────────────────────────────────────────
  const fallMat = (() => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const streak = fract(uv().y.mul(4).add(time.mul(1.3)).add(sin(uv().x.mul(41)).mul(0.35)));
    m.colorNode = mix(color(0x6ccfe0), color(0xeaffff), smoothstep(float(0.55), float(0.95), streak));
    m.opacityNode = smoothstep(float(0.0), float(0.12), uv().x).mul(smoothstep(float(1.0), float(0.88), uv().x)).mul(0.78);
    return m;
  })();
  const mistMat = new THREE.MeshBasicNodeMaterial({ color: 0xd8f6ff, transparent: true, opacity: 0.1, depthWrite: false });
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
    for (let k = 0; k < 3; k++) {
      const mist = new THREE.Mesh(new THREE.SphereGeometry(width * 0.5 + k * 1.5, 14, 8), mistMat);
      mist.position.set(bottom.x + Math.sin(yaw) * (2 + k * 2), bottom.y + 1 + k * 1.2, bottom.z + Math.cos(yaw) * (2 + k * 2)); mist.scale.set(1.3, 0.5, 1.3); group.add(mist);
    }
  };

  /** Merge the trunk/trim geometry into the level (call once, after every place is built). */
  const finish = () => {
    const tg = barkGeos.length ? mergeAll(barkGeos) : null;
    if (tg) { const m = new THREE.Mesh(tg, mats.bark); m.castShadow = !lo; m.receiveShadow = true; m.userData.collide = true; m.name = 'wilds-trunks'; group.add(m); }
    const rg = trimGeos.length ? mergeAll(trimGeos) : null;
    if (rg) { const m = new THREE.Mesh(rg, mats.bark); m.castShadow = !lo; m.receiveShadow = true; m.name = 'wilds-trim'; group.add(m); }
  };

  return {
    H, deck, bridge, link, toward, hut, lamp, arch, ruinWall, pillar, paving, discPave, rocks, circuit, runeCircle, ring, screen, crystal, crates, sandbags, waterfall, finish,
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
