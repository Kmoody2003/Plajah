// The forest floor (docs/era-clash-3d-forest-road.md, phase 2): ferns under the canopy, yamabuki (kerria, yellow)
// and tsutsuji (azalea, magenta) flowering at the wood's edges and along the road, violets and white anemones in the
// glades, irises (kakitsubata) along the river — a spring wood in the Sengoku south. All of it bends in the wind
// (core/wind.ts).
//
// Like the grass (grassField.ts), the plants live in tiles that follow the camera; each tile is filled from its
// own world seed, so nothing shimmers as tiles are recycled. One InstancedMesh per kind per tile.
import * as THREE from 'three/webgpu';
import { positionLocal, vec3, attribute, float, texture, uv, time, sin, mix } from 'three/tsl';
import { camDist, cutAlpha, keep, fadeIn, fadeOut } from './core/lodFade';
import { seasonU } from './core/seasonLook';
import { windAt, localWindDir } from './core/wind';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

// Every plant is placed from its 16 m world cell's own seed, so it stands in the same spot whichever layer draws it:
//   near — the full plants, 5 × 5 tiles of one cell (±32…40 m), fading out by coverage 24 → 31 m;
//   far  — the same plants as lighter meshes (fewer fronds and leaf cards; the small flowers are left to the
//          ground's colour), 5 × 5 tiles of 3 × 3 cells (±96…120 m), fading in 24 → 31 m and into the haze 84 → 94 m.
// So a fern or an azalea is there from 90 m off and only gains detail as you walk up to it (core/lodFade.ts).
const CELL = 16;
const NEAR = { cells: 1, r: 2, fade: (d: N) => fadeOut(d, 24, 31) };
const FAR = { cells: 3, r: 2, fade: (d: N) => fadeIn(d, 24, 31).mul(fadeOut(d, 84, 94)) };

function hash(x: number, z: number) { let h = (x * 374761393 + z * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

/** What the ground is like at (x, z), from chapter1: canopy (0 open … 1 deep wood), river, road, built-over. */
export interface FloorEnv {
  heightAt(x: number, z: number): number;
  canopy(x: number, z: number): number;
  /** Distance to the river's edge (negative in the water), or Infinity. */
  riverEdge(x: number, z: number): number;
  /** Distance to the road's middle. */
  roadD(x: number, z: number): number;
  /** Under a building, on a bridge, a wall: no plants. */
  blocked(x: number, z: number): boolean;
  /** 0 in town and on paving, 1 in the countryside. */
  wild(x: number, z: number): number;
  /** On the country dirt road (harbour → Outer Wall). */
  dirtRoad(x: number, z: number): boolean;
}

// ── painted textures (canvas, alpha-cut) ──────────────────────────────────────────────────────────────
function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!; draw(g);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true;
  return t;
}
const rnd = (s: number) => { let x = s; return () => (x = (x * 16807) % 2147483647) / 2147483647; };

/** A fern frond (bracken-like): a rib with paired pinnae tapering to the tip; v runs base (0) → tip (1). */
const frondTex = () => canvas(64, 256, (g) => {
  const r = rnd(7);
  g.strokeStyle = '#3d5a22'; g.lineWidth = 2; g.beginPath(); g.moveTo(32, 256); g.lineTo(32, 4); g.stroke();
  for (let y = 250; y > 8; y -= 7) {
    const t = 1 - y / 256, len = 28 * Math.sin(Math.min(1, t * 1.25) * Math.PI) * (1 - t * 0.35) + 2;
    for (const sd of [-1, 1]) {
      const gr = 70 + r() * 40;
      g.fillStyle = `rgb(${45 + r() * 25},${gr + 30},${28 + r() * 15})`;
      g.beginPath(); g.moveTo(32, y); g.quadraticCurveTo(32 + sd * len * 0.6, y - 6, 32 + sd * len, y - 9); g.quadraticCurveTo(32 + sd * len * 0.5, y + 1, 32, y + 2); g.fill();
    }
  }
});
/** A shrub's leafy cluster with blossoms (yamabuki: yellow five-petalled; tsutsuji: magenta funnels). */
const shrubTex = (blossom: string, eye: string, petals: number, size: number, dens: number) => canvas(128, 128, (g) => {
  const r = rnd(blossom.length * 31 + petals);
  for (let i = 0; i < 70; i++) {
    const x = 10 + r() * 108, y = 10 + r() * 108, a = r() * Math.PI;
    g.fillStyle = `rgb(${40 + r() * 30},${80 + r() * 50},${30 + r() * 20})`;
    g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.ellipse(0, 0, 9, 3.6, 0, 0, Math.PI * 2); g.fill(); g.restore();
  }
  for (let i = 0; i < dens; i++) {
    const x = 14 + r() * 100, y = 14 + r() * 100;
    g.fillStyle = blossom;
    for (let k = 0; k < petals; k++) { const a = (k / petals) * Math.PI * 2 + r(); g.beginPath(); g.ellipse(x + Math.cos(a) * size * 0.55, y + Math.sin(a) * size * 0.55, size * 0.6, size * 0.38, a, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = eye; g.beginPath(); g.arc(x, y, size * 0.25, 0, Math.PI * 2); g.fill();
  }
});
/** A clump of low wildflowers: stems and leaves, the flower heads in `col` (violets, anemones). */
const flowerTex = (col: string, eye: string, petals: number) => canvas(128, 128, (g) => {
  const r = rnd(col.length * 13 + petals);
  for (let i = 0; i < 16; i++) {
    const x = 20 + r() * 88, top = 30 + r() * 60;
    g.strokeStyle = '#4a6a2c'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, 128); g.quadraticCurveTo(x + (r() - 0.5) * 20, (128 + top) / 2, x + (r() - 0.5) * 10, top); g.stroke();
    g.fillStyle = '#3f6a28'; g.beginPath(); g.ellipse(x + (r() - 0.5) * 14, 110 - r() * 20, 9, 4, r() * 3, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 11; i++) {
    const x = 20 + r() * 88, y = 28 + r() * 60, s = 6 + r() * 3;
    g.fillStyle = col;
    for (let k = 0; k < petals; k++) { const a = (k / petals) * Math.PI * 2; g.beginPath(); g.ellipse(x + Math.cos(a) * s * 0.6, y + Math.sin(a) * s * 0.6, s * 0.62, s * 0.4, a, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = eye; g.beginPath(); g.arc(x, y, s * 0.28, 0, Math.PI * 2); g.fill();
  }
});
/** Irises: sword leaves, a few tall stems with violet-blue flowers. */
/** A weed: a loose tuft of thin blades, dusty green, with a seed head or two. */
const weedTex = () => canvas(64, 64, (g) => {
  const r = rnd(29);
  for (let i = 0; i < 16; i++) {
    const x = 14 + r() * 36, h = 22 + r() * 40, lean = (r() - 0.5) * 22;
    g.strokeStyle = r() < 0.5 ? '#6f7a3c' : '#8a8a4a'; g.lineWidth = 1.4 + r() * 1.2;
    g.beginPath(); g.moveTo(x, 64); g.quadraticCurveTo(x + lean * 0.3, 64 - h * 0.6, x + lean, 64 - h); g.stroke();
    if (r() < 0.2) { g.fillStyle = '#b8a46a'; g.beginPath(); g.ellipse(x + lean, 64 - h, 1.6, 4, 0, 0, 7); g.fill(); }
  }
});
const irisTex = () => canvas(64, 256, (g) => {
  const r = rnd(41);
  for (let i = 0; i < 9; i++) {
    const x = 12 + r() * 40, top = 40 + r() * 120;
    g.fillStyle = `rgb(${50 + r() * 20},${100 + r() * 30},${45 + r() * 15})`;
    g.beginPath(); g.moveTo(x - 3, 256); g.quadraticCurveTo(x + (r() - 0.5) * 18, (256 + top) / 2, x + (r() - 0.5) * 10, top); g.lineTo(x + 3, 256); g.fill();
  }
  for (let i = 0; i < 3; i++) {
    const x = 16 + r() * 32, y = 14 + r() * 30;
    g.strokeStyle = '#4a6a2c'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 6, 256); g.stroke();
    g.fillStyle = '#4b3c9a';
    for (const [dx, dy, a] of [[-6, 4, -0.6], [6, 4, 0.6], [0, -3, 0]] as const) { g.beginPath(); g.ellipse(x + dx, y + dy, 7, 4, a, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#e8d24a'; g.fillRect(x - 1, y, 2, 4);
  }
});

// ── geometry ──────────────────────────────────────────────────────────────────────────────────────────
function build(pos: number[], uvs: number[], nrm: number[] | null, idx: number[]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  if (nrm) g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); else g.computeVertexNormals();
  return g;
}
/** A fern: seven fronds arching out and down from the crown; height ≈ 0.7, spread ≈ 0.9 (unit scale). */
function fernGeo(F = 7, S = 6) {
  const pos: number[] = [], uvs: number[] = [], nrm: number[] = [], idx: number[] = [];
  const W = 0.17 * Math.sqrt(7 / F);
  for (let f = 0; f < F; f++) {
    const a = (f / F) * Math.PI * 2 + (f % 2) * 0.3, ca = Math.cos(a), sa = Math.sin(a), lift = 0.75 + (f % 3) * 0.12, base = pos.length / 3;
    for (let i = 0; i <= S; i++) {
      const t = i / S, r = t * 0.95, y = Math.sin(t * Math.PI * 0.62) * 0.72 * lift - t * t * 0.22, w = W * (1 - t * 0.6);
      const cx = sa * r, cz = ca * r, px = ca, pz = -sa;   // across the frond
      pos.push(cx - px * w, y, cz - pz * w, cx + px * w, y, cz + pz * w);
      uvs.push(0, t, 1, t);
      nrm.push(sa * 0.3, 0.95, ca * 0.3, sa * 0.3, 0.95, ca * 0.3);
    }
    for (let i = 0; i < S; i++) { const k = base + i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  return build(pos, uvs, nrm, idx);
}
/** A shrub: leafy cards over a dome, normals pointing out of the dome (soft, rounded light). Height ≈ 1. */
function shrubGeo(n = 22) {
  const pos: number[] = [], uvs: number[] = [], nrm: number[] = [], idx: number[] = [];
  const r = rnd(5), grow = Math.sqrt(22 / n);
  for (let i = 0; i < n; i++) {
    const u = r(), v = r() * 0.85, th = u * Math.PI * 2, ph = Math.acos(1 - v);
    const d = new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph) * 0.9, Math.sin(ph) * Math.sin(th));
    const c = new THREE.Vector3(d.x * 0.45, 0.45 + d.y * 0.5, d.z * 0.45);
    const t1 = new THREE.Vector3(0, 1, 0).cross(d).normalize(); if (t1.lengthSq() < 0.1) t1.set(1, 0, 0);
    const t2 = d.clone().cross(t1).normalize(), s = (0.36 + r() * 0.12) * grow, base = pos.length / 3;
    for (const [a, b, uu, vv] of [[-1, -1, 0, 0], [1, -1, 1, 0], [-1, 1, 0, 1], [1, 1, 1, 1]] as const) {
      const p = c.clone().addScaledVector(t1, a * s).addScaledVector(t2, b * s);
      pos.push(p.x, Math.max(0.02, p.y), p.z); uvs.push(uu, vv);
      const nn = p.clone().sub(new THREE.Vector3(0, 0.3, 0)).normalize(); nrm.push(nn.x, nn.y, nn.z);
    }
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }
  return build(pos, uvs, nrm, idx);
}
/** Crossed upright cards (flower clumps, irises): `n` planes w × h. */
function crossGeo(n: number, w: number, h: number) {
  const pos: number[] = [], uvs: number[] = [], nrm: number[] = [], idx: number[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI, c = Math.cos(a) * w / 2, s = Math.sin(a) * w / 2, base = pos.length / 3;
    pos.push(-c, 0, -s, c, 0, s, -c, h, -s, c, h, s);
    uvs.push(0, 0, 1, 0, 0, 1, 1, 1);
    for (let i = 0; i < 4; i++) nrm.push(0, 1, 0);   // lit like the ground under them (no dark backs)
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }
  return build(pos, uvs, nrm, idx);
}

function plantMaterial(map: THREE.Texture, bend: number, tint: number, fade: (d: N) => N, role: Role) {
  const m = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.85, metalness: 0, alphaToCoverage: true });
  const tx: N = texture(map, uv());
  // the season (core/seasonLook.ts): shrubs flower in spring and stand in leaf after; wildflowers bloom in spring
  // and thin through summer; ferns brown in autumn and lie down in winter; snow over all
  const lumT: N = tx.rgb.dot(vec3(0.3, 0.6, 0.1));
  let col: N = tx.rgb.mul(tint);
  if (role === 'shrub') col = mix(lumT.mul(vec3(0.5, 0.82, 0.36)).mul(0.85), col, seasonU.bloom);
  if (role !== 'flower') col = mix(col, lumT.mul(vec3(1.35, 0.85, 0.42)).mul(role === 'fern' ? 1.1 : 0.95), seasonU.autumn);
  col = mix(col, vec3(0.84, 0.86, 0.9), seasonU.snow.mul(0.55));
  m.colorNode = col;
  const present: N = role === 'flower' ? seasonU.flowers : role === 'fern' ? float(1).sub(seasonU.bare.mul(0.7)) : role === 'weed' ? float(1).sub(seasonU.snow.mul(0.8)) : float(1).sub(seasonU.bare.mul(0.5));
  // wind: the tops go downwind in a gust, with a quick flutter of their own
  const aw: N = attribute('aWind', 'vec3'), ld: N = localWindDir(aw.z), push: N = windAt(aw.xy);
  m.opacityNode = cutAlpha(tx.a, 0.45, fade(camDist(aw.xy)).mul(present));
  m.maskNode = keep(m.opacityNode);
  const y: N = positionLocal.y.max(0);
  const flutter: N = sin(time.mul(6.3).add(positionLocal.x.mul(31)).add(positionLocal.z.mul(23)).add(aw.x)).mul(0.02);
  const k: N = push.mul(bend).add(flutter.mul(push.add(0.2))).mul(y.mul(y));
  m.positionNode = positionLocal.add(vec3(ld.x.mul(k), k.mul(k).mul(-0.4), ld.y.mul(k)));
  m.roughnessNode = float(0.85);
  return m;
}

type Role = 'fern' | 'shrub' | 'flower' | 'weed';
interface Kind {
  name: string; perTile: number; tries: number;
  /** The full plant (near) and its lighter self (far; none = left to the ground's colour past the near ring). */
  near: THREE.BufferGeometry; far?: THREE.BufferGeometry; map: THREE.Texture; bend: number; tint?: number; role: Role;
  /** Chance (0…1) of a plant at (x, z), and its scale. */
  at(x: number, z: number, e: FloorEnv, h: number): number;
  size: [number, number];
}

export interface Undergrowth { group: THREE.Group; update(cam: THREE.Vector3): void; count(): number }

export function buildUndergrowth(env: FloorEnv): Undergrowth {
  const group = new THREE.Group(); group.name = 'undergrowth';
  const kinds: Kind[] = [
    { name: 'fern', role: 'fern', near: fernGeo(), far: fernGeo(5, 2), map: frondTex(), bend: 0.35, tint: 0.95, perTile: 110, tries: 260, size: [0.7, 1.45],
      at: (x, z, e) => { const c = e.canopy(x, z), rv = e.riverEdge(x, z); return e.wild(x, z) * Math.max(c * 0.85, rv > 0 && rv < 6 ? 0.5 : 0) * (e.roadD(x, z) > 5.5 ? 1 : 0); } },
    { name: 'yamabuki', role: 'shrub', near: shrubGeo(), far: shrubGeo(8), map: shrubTex('#f2c21a', '#d08a10', 5, 7, 34), bend: 0.12, perTile: 14, tries: 60, size: [0.9, 1.6],
      at: (x, z, e) => { const c = e.canopy(x, z), dr = e.roadD(x, z); return dr < 6 ? 0 : e.wild(x, z) * ((c > 0.15 && c < 0.7 ? 0.35 : 0.05) + (dr < 11 ? 0.35 : 0)); } },
    { name: 'tsutsuji', role: 'shrub', near: shrubGeo(), far: shrubGeo(8), map: shrubTex('#d03a86', '#8a1a50', 5, 8, 40), bend: 0.1, perTile: 12, tries: 60, size: [0.8, 1.4],
      at: (x, z, e) => { const c = e.canopy(x, z), dr = e.roadD(x, z); return dr < 6.5 ? 0 : e.wild(x, z) * ((c > 0.1 && c < 0.6 ? 0.3 : 0.04) + (dr < 12 ? 0.25 : 0)); } },
    { name: 'violets', role: 'flower', near: crossGeo(3, 0.55, 0.32), map: flowerTex('#6a3fb0', '#f0e070', 5), bend: 0.25, perTile: 90, tries: 200, size: [0.7, 1.2],
      at: (x, z, e) => { const c = e.canopy(x, z); return e.wild(x, z) * (c < 0.35 ? 0.55 : 0.12) * (e.roadD(x, z) > 4.8 ? 1 : 0); } },
    { name: 'anemones', role: 'flower', near: crossGeo(3, 0.55, 0.3), map: flowerTex('#f4f0e6', '#e8c840', 6), bend: 0.25, perTile: 90, tries: 200, size: [0.7, 1.2],
      at: (x, z, e) => { const c = e.canopy(x, z); return e.wild(x, z) * (c > 0.3 && c < 0.8 ? 0.45 : 0.1) * (e.roadD(x, z) > 4.8 ? 1 : 0); } },
    // a weed here and there on the road: in the crown between the wheel tracks and along the shoulders, never thick
    { name: 'weeds', role: 'weed', near: crossGeo(3, 0.5, 0.42), far: crossGeo(2, 0.5, 0.42), map: weedTex(), bend: 0.3, perTile: 26, tries: 120, size: [0.5, 1.1],
      at: (x, z, e) => { const dr = e.roadD(x, z); if (dr > 4.6 || !e.dirtRoad(x, z)) return 0; return dr < 0.4 ? 0.22 : dr < 1.6 ? 0.03 : dr < 3.2 ? 0.1 : 0.3; } },
    { name: 'iris', role: 'flower', near: crossGeo(3, 0.5, 1.0), far: crossGeo(2, 0.5, 1.0), map: irisTex(), bend: 0.3, perTile: 70, tries: 220, size: [0.75, 1.15],
      at: (x, z, e) => { const rv = e.riverEdge(x, z); return rv > -0.6 && rv < 2.5 ? 0.9 : 0; } },
  ];

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  /** The plants of kind `ki` in world cell (cx, cz): the same wherever and whenever it is asked. */
  function cellPlants(cx: number, cz: number, ki: number, put: (x: number, y: number, z: number, yaw: number, sc: number) => void) {
    const k = kinds[ki], x0 = cx * CELL, z0 = cz * CELL;
    let n = 0;
    for (let i = 0; i < k.tries && n < k.perTile; i++) {
      const x = x0 + hash(cx * 977 + i * 13 + ki * 7, cz * 131 + i) * CELL, z = z0 + hash(cz * 613 + i * 17, cx * 389 + i * 3 + ki) * CELL;
      // clumps: a slow noise gates where each kind grows
      const clump = 0.5 + 0.5 * Math.sin(x * 0.21 + ki * 1.7) * Math.sin(z * 0.17 - ki);
      const chance = k.at(x, z, env, 0) * (0.35 + 0.9 * clump);
      if (hash(x * 13.1 | 0, z * 7.7 | 0) > chance) continue;
      if (env.blocked(x, z)) continue;
      const h = env.heightAt(x, z);
      if (Math.abs(env.heightAt(x + 0.6, z) - h) + Math.abs(env.heightAt(x, z + 0.6) - h) > 0.7) continue;   // not on steeps
      const yaw = hash(x * 3.3 | 0, z * 5.1 | 0) * Math.PI * 2, sc = k.size[0] + (k.size[1] - k.size[0]) * hash(z * 9 | 0, x * 4 | 0);
      put(x, h - 0.03, z, yaw, sc);
      n++;
    }
  }

  type Tile = { cx: number; cz: number; meshes: (THREE.InstancedMesh | null)[] };
  function layer(L: { cells: number; r: number; fade: (d: N) => N }, far: boolean) {
    const tiles: Tile[] = [], span = CELL * L.cells;
    const mats = kinds.map((k) => (far && !k.far ? null : plantMaterial(k.map, k.bend, k.tint ?? 1, L.fade, k.role)));
    for (let i = 0; i < (2 * L.r + 1) ** 2; i++) {
      const meshes = kinds.map((k, ki) => {
        const geo = far ? k.far : k.near, mat = mats[ki];
        if (!geo || !mat) return null;
        const cap = k.perTile * L.cells * L.cells;
        const g = geo.clone();
        g.setAttribute('aWind', new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3));
        const m = new THREE.InstancedMesh(g, mat, cap);
        m.count = 0; m.castShadow = false; m.receiveShadow = true; m.frustumCulled = true;
        group.add(m);
        return m;
      });
      tiles.push({ cx: 1e9, cz: 1e9, meshes });
    }
    function fill(t: Tile) {
      t.meshes.forEach((mesh, ki) => {
        if (!mesh) return;
        const wa = mesh.geometry.getAttribute('aWind') as THREE.InstancedBufferAttribute;
        let n = 0;
        for (let j = 0; j < L.cells; j++) for (let i = 0; i < L.cells; i++) {
          cellPlants(t.cx * L.cells + i, t.cz * L.cells + j, ki, (x, y, z, yaw, sc) => {
            p.set(x, y, z); q.setFromAxisAngle(up, yaw); sv.set(sc, sc, sc);
            m4.compose(p, q, sv); mesh.setMatrixAt(n, m4); wa.setXYZ(n, x, z, yaw); n++;
          });
        }
        mesh.count = n; mesh.instanceMatrix.needsUpdate = true; wa.needsUpdate = true; mesh.computeBoundingSphere();
      });
    }
    let ccx = 1e9, ccz = 1e9, first = true;
    const queue: Tile[] = [];
    return {
      count: () => tiles.reduce((a, t) => a + t.meshes.reduce((b, m) => b + (m?.count ?? 0), 0), 0),
      update(cam: THREE.Vector3) {
        const qt = queue.shift(); if (qt) fill(qt);
        const cx = Math.floor(cam.x / span), cz = Math.floor(cam.z / span);
        if (cx === ccx && cz === ccz) return;
        ccx = cx; ccz = cz;
        const want = new Set<string>();
        for (let dz = -L.r; dz <= L.r; dz++) for (let dx = -L.r; dx <= L.r; dx++) want.add(`${cx + dx},${cz + dz}`);
        const free = tiles.filter((t) => !want.has(`${t.cx},${t.cz}`));
        for (const key of want) {
          if (tiles.some((t) => `${t.cx},${t.cz}` === key)) continue;
          const t = free.pop(); if (!t) break;
          const [x, z] = key.split(',').map(Number); t.cx = x; t.cz = z;
          const qi = queue.indexOf(t); if (qi >= 0) queue.splice(qi, 1);
          // a recycled tile is at the far edge of its ring, where this layer has already faded away
          if (first) fill(t); else { for (const m of t.meshes) if (m) m.count = 0; queue.push(t); }
        }
        queue.sort((a, b) => Math.hypot(a.cx - cx, a.cz - cz) - Math.hypot(b.cx - cx, b.cz - cz));
        first = false;
      },
    };
  }
  const near = layer(NEAR, false), far = layer(FAR, true);
  return {
    group,
    count: () => near.count() + far.count(),
    update(cam) { near.update(cam); far.update(cam); },
  };
}
