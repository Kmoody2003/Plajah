import * as THREE from 'three';

/**
 * Countryside set pieces for the reference shots (docs/apex-elohim/reference-scenes.md):
 * Millbrook Creek, a covered bridge over it, Millbrook Road (paved, S-curves and a hairpin) and Hollow Lane (dirt, to the Hollow barn).
 * Data are plain polylines; carveCreek() cuts the creek into the height map before the terrain is meshed, buildCountryScenes() lays everything on it.
 */
export interface Pt { x: number; z: number }

export const CREEK: Pt[] = [
  { x: -650, z: -1250 }, { x: -720, z: -1420 }, { x: -800, z: -1560 }, { x: -850, z: -1680 }, { x: -885, z: -1800 }, { x: -930, z: -1950 }, { x: -985, z: -2100 },
];
export const CREEK_WATER_HALF = 7;   // the water ribbon is 14 m wide
const CARVE_R = 36;                  // the cut valley reaches this far from the centre line

/** Millbrook Road: paved, west to east across the creek, S-curves, a hairpin at the east end. */
export const MILLBROOK: Pt[] = [
  { x: -1700, z: -1500 }, { x: -1560, z: -1560 }, { x: -1420, z: -1700 }, { x: -1280, z: -1690 }, { x: -1150, z: -1590 }, { x: -1020, z: -1600 }, { x: -930, z: -1660 },
  { x: -850, z: -1680 }, { x: -770, z: -1690 }, { x: -650, z: -1700 }, { x: -520, z: -1660 }, { x: -420, z: -1560 }, { x: -380, z: -1440 }, { x: -430, z: -1350 },
  { x: -520, z: -1380 }, { x: -540, z: -1470 }, { x: -480, z: -1540 },
];
/** Hollow Lane: unpaved, from Millbrook Road at the S-curve down to the barn. */
export const HOLLOW: Pt[] = [
  { x: -1280, z: -1690 }, { x: -1300, z: -1610 }, { x: -1360, z: -1540 }, { x: -1330, z: -1470 }, { x: -1250, z: -1430 }, { x: -1230, z: -1360 }, { x: -1290, z: -1310 }, { x: -1380, z: -1300 }, { x: -1450, z: -1330 },
];
export const BRIDGE = { at: { x: -850, z: -1680 }, half: 15, causeway: 34 };   // roof and walls reach 15 m each way, the deck and approaches 34 m
export const BARN = { x: -1330, z: -1255, rotY: 0.5 };

function catmull(pts: Pt[], step: number): Pt[] {
  const out: Pt[] = [];
  const P = (i: number): Pt => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const n = Math.max(2, Math.round(Math.hypot(p2.x - p1.x, p2.z - p1.z) / step));
    for (let j = 0; j < n; j++) {
      const t = j / n, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number): number => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  out.push({ ...pts[pts.length - 1] });
  return out;
}

/** the creek's centre line with the bed height (raw map units) and water height along it; filled by carveCreek */
export const creekLine: { x: number; z: number; bed: number; water: number }[] = [];

export function carveCreek(heights: Float32Array, W: number, H: number, mpp: number): void {
  const line = catmull(CREEK, 6);
  const px = (x: number): number => x / mpp + W / 2, pz = (z: number): number => z / mpp + H / 2;
  const raw = (x: number, z: number): number => {
    const ix = Math.max(0, Math.min(W - 1, Math.round(px(x)))), iz = Math.max(0, Math.min(H - 1, Math.round(pz(z))));
    return heights[iz * W + ix];
  };
  // bed: the ground along the line, smoothed over ±150 m, never rising downstream, 2.4 m under it
  const g = line.map((p) => raw(p.x, p.z));
  const sm = g.map((_, i) => { let s = 0, n = 0; for (let k = -25; k <= 25; k++) { const j = i + k; if (j < 0 || j >= g.length) continue; s += g[j]; n++; } return s / n; });
  let run = Infinity;
  creekLine.length = 0;
  line.forEach((p, i) => {
    run = Math.min(run, sm[i] - 2.4);
    const bed = Math.min(run, g[i] - 1.2);
    creekLine.push({ x: p.x, z: p.z, bed, water: bed + 1.0 });
  });
  // the cut: every map pixel near the line comes down to the bed, with banks that rise to meet the ground
  const cell = 24, hash = new Map<number, number[]>();
  creekLine.forEach((p, i) => { const k = Math.floor(p.x / cell) * 8192 + Math.floor(p.z / cell); const a = hash.get(k) ?? []; a.push(i); hash.set(k, a); });
  const x0 = Math.floor(px(Math.min(...creekLine.map((p) => p.x)) - CARVE_R * 1.5)), x1 = Math.ceil(px(Math.max(...creekLine.map((p) => p.x)) + CARVE_R * 1.5));
  const z0 = Math.floor(pz(Math.min(...creekLine.map((p) => p.z)) - CARVE_R * 1.5)), z1 = Math.ceil(pz(Math.max(...creekLine.map((p) => p.z)) + CARVE_R * 1.5));
  for (let iz = Math.max(0, z0); iz <= Math.min(H - 1, z1); iz++) for (let ix = Math.max(0, x0); ix <= Math.min(W - 1, x1); ix++) {
    const x = (ix - W / 2) * mpp, z = (iz - H / 2) * mpp;
    let best = 1e9, bi = -1;
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
      const l = hash.get((cx + a) * 8192 + cz + b); if (!l) continue;
      for (const i of l) { const d = Math.hypot(creekLine[i].x - x, creekLine[i].z - z); if (d < best) { best = d; bi = i; } }
    }
    if (bi < 0 || best > CARVE_R) continue;
    const bed = creekLine[bi].bed;
    const t = Math.max(0, (best - 8) / (CARVE_R - 8));
    const target = best <= 8 ? bed : bed + 0.15 + Math.pow(t, 1.4) * 14;
    const k = iz * W + ix;
    if (target < heights[k]) heights[k] = target;
  }
}

export interface Shoreline { xz: number[][]; y: number[]; gallery: { from: number; to: number } }

/** grade the hillside along the shoreline highway: the road bed is flat, and the ground is cut or filled to meet it over about 40 m */
export function carveShoreline(heights: Float32Array, W: number, H: number, mpp: number, hw: Shoreline): void {
  const line: { x: number; z: number; y: number; gal: boolean }[] = [];
  for (let i = 0; i < hw.xz.length - 1; i++) {
    const a = hw.xz[i], b = hw.xz[i + 1], n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 6)), gal = i >= hw.gallery.from && i <= hw.gallery.to;
    for (let k = 0; k < n; k++) { const t = k / n; line.push({ x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, y: hw.y[i] + (hw.y[i + 1] - hw.y[i]) * t, gal }); }
  }
  // how far into the gallery each point is: 0 at the portals, 1 once 60 m inside, so the cliff grows out of the hillside at both ends
  const fade = new Float32Array(line.length);
  { let run = 0; for (let i = 0; i < line.length; i++) { run = line[i].gal ? run + 6 : 0; fade[i] = run; }
    run = 0; for (let i = line.length - 1; i >= 0; i--) { run = line[i].gal ? run + 6 : 0; const t = Math.min(1, Math.min(fade[i], run) / 60); fade[i] = line[i].gal ? t * t * (3 - 2 * t) : 0; } }
  const cell = 24, hash = new Map<number, number[]>();
  line.forEach((p, i) => { const k = Math.floor(p.x / cell) * 8192 + Math.floor(p.z / cell); const a = hash.get(k) ?? []; a.push(i); hash.set(k, a); });
  const R = 84, FLAT = 26;   // the terrain mesh has a vertex every 24 m: the flat bed must reach past the next vertex on each side or a slope vertex lifts the road under the ground
  const GR = 90;             // the gallery's cliff reaches this far each side
  let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9;
  for (const p of line) { mnx = Math.min(mnx, p.x); mxx = Math.max(mxx, p.x); mnz = Math.min(mnz, p.z); mxz = Math.max(mxz, p.z); }
  const x0 = Math.max(0, Math.floor((mnx - GR) / mpp + W / 2)), x1 = Math.min(W - 1, Math.ceil((mxx + GR) / mpp + W / 2));
  const z0 = Math.max(0, Math.floor((mnz - GR) / mpp + H / 2)), z1 = Math.min(H - 1, Math.ceil((mxz + GR) / mpp + H / 2));
  const ss = (a: number, b: number, v: number): number => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) {
    const x = (ix - W / 2) * mpp, z = (iz - H / 2) * mpp;
    let best = 1e9, bi = -1; const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) { const l = hash.get((cx + a) * 8192 + cz + b); if (!l) continue; for (const i of l) { const d = Math.hypot(line[i].x - x, line[i].z - z); if (d < best) { best = d; bi = i; } } }
    if (bi < 0) continue;
    const k = iz * W + ix, nat = heights[k], bed = line[bi].y - 0.25, f = fade[bi];
    // the ordinary road: a flat bed, cut or filled to meet the hillside over R
    let road = nat;
    if (best <= R) { const w = 1 - ss(FLAT, R, best); road = nat * (1 - w) + bed * w; }
    if (f <= 0) { heights[k] = road; continue; }
    // the gallery: the road is a ledge cut into a cliff. Inland the rock rises straight up behind the gallery roof to ~26 m over the road and only then gives way to
    // the hill; on the lake side the ledge stands on a steep rock face that drops ~22 m towards the beach.
    let gal: number;
    if (best > GR) gal = nat;
    else if (x > line[bi].x) {                                                 // inland
      const cliff = best <= 6 ? bed : Math.max(nat, bed + 34.25 * ss(6, 17, best));
      gal = best <= 6 ? bed : cliff * (1 - ss(55, GR, best)) + nat * ss(55, GR, best);
    } else {                                                                   // lake side
      const face = best <= 8 ? bed : Math.min(nat, bed - 22 * ss(8, 20, best));
      gal = best <= 8 ? bed : face * (1 - ss(46, GR, best)) + nat * ss(46, GR, best);
    }
    heights[k] = road * (1 - f) + gal * f;
  }
}

/** points with the half width of the road they belong to: the test is distance < half width + r, so wide roads are covered edge to edge */
function makeCorridor(pts: (Pt & { h?: number })[]): (x: number, z: number, r: number) => boolean {
  const C = 24, h = new Map<number, number[]>();
  for (const p of pts) { const k = Math.floor(p.x / C) * 8192 + Math.floor(p.z / C); let a = h.get(k); if (!a) { a = []; h.set(k, a); } a.push(p.x, p.z, p.h ?? 0); }
  return (x, z, r) => {
    const cx = Math.floor(x / C), cz = Math.floor(z / C);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const a = h.get((cx + i) * 8192 + cz + j); if (!a) continue;
      for (let k = 0; k < a.length; k += 3) { const dx = a[k] - x, dz = a[k + 1] - z, rr = a[k + 2] + r; if (dx * dx + dz * dz < rr * rr) return true; }
    }
    return false;
  };
}

function rng(seed: number): () => number { let s = seed | 0 || 1; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

function noiseTex(base: [number, number, number], speck: number, tracks: boolean, repX: number, repY: number): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d')!, r = rng(17);
  g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5000; i++) { const v = (r() - 0.5) * speck; g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 240 : 0},${v > 0 ? 220 : 0},${Math.abs(v) / 255})`; g.fillRect(r() * 256, r() * 256, 1 + r() * 3, 1 + r() * 3); }
  if (tracks) { g.fillStyle = 'rgba(40,30,20,0.28)'; g.fillRect(70, 0, 22, 256); g.fillRect(164, 0, 22, 256); g.fillStyle = 'rgba(210,190,150,0.18)'; g.fillRect(118, 0, 20, 256); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repX, repY); t.anisotropy = 4; return t;
}

/** weathered cliff rock: level strata across u, joints across v, lichen speckle (bump: the same layout in grey) */
function cliffRockTex(bump = false): THREE.CanvasTexture {
  const N = 512, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d')!, r = rng(31);
  g.fillStyle = bump ? '#808080' : 'rgb(128,122,112)'; g.fillRect(0, 0, N, N);
  // strata: bands of varying thickness and tone, each a little wavy
  for (let x = 0; x < N;) {
    const w = 6 + r() * 34, t = (r() - 0.5);
    const col = bump ? `rgba(${t > 0 ? 255 : 0},${t > 0 ? 255 : 0},${t > 0 ? 255 : 0},${Math.abs(t) * 0.7})` : `rgba(${t > 0 ? 196 : 70},${t > 0 ? 184 : 66},${t > 0 ? 160 : 60},${Math.abs(t) * 0.75})`;
    g.fillStyle = col; g.beginPath();
    for (let y = 0; y <= N; y += 16) g.lineTo(x + Math.sin(y * 0.02 + x) * 3, y);
    for (let y = N; y >= 0; y -= 16) g.lineTo(x + w + Math.sin(y * 0.02 + x + 1) * 3, y);
    g.fill();
    g.fillStyle = bump ? 'rgba(0,0,0,0.55)' : 'rgba(30,28,26,0.45)'; g.fillRect(x + w - 1.5, 0, 2, N);          // the bedding plane between two beds
    x += w;
  }
  // joints: short dark cracks across the beds
  for (let i = 0; i < 260; i++) { const x = r() * N, y = r() * N, l = 8 + r() * 40; g.fillStyle = bump ? 'rgba(0,0,0,0.6)' : 'rgba(25,24,22,0.5)'; g.fillRect(x, y, l, 1 + r() * 1.5); }
  // speckle and lichen
  for (let i = 0; i < 9000; i++) { const v = r() - 0.5; g.fillStyle = bump ? `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) * 0.5})` : `rgba(${v > 0 ? 230 : 20},${v > 0 ? 225 : 20},${v > 0 ? 210 : 18},${Math.abs(v) * 0.35})`; g.fillRect(r() * N, r() * N, 1 + r() * 2, 1 + r() * 2); }
  if (!bump) for (let i = 0; i < 140; i++) { g.fillStyle = `rgba(${90 + r() * 40},${100 + r() * 30},${60 + r() * 20},${0.18 + r() * 0.2})`; g.beginPath(); g.arc(r() * N, r() * N, 2 + r() * 9, 0, 6.3); g.fill(); }
  const t = new THREE.CanvasTexture(c); if (!bump) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.6, 0.35); t.anisotropy = 8; return t;
}

export interface CountryScenes {
  group: THREE.Group;
  roads: THREE.Mesh[];
  pavedNear: (x: number, z: number, r: number) => boolean;
  dirtNear: (x: number, z: number, r: number) => boolean;
  /** world-space spots to photograph from: name, camera position, target */
  shots: { name: string; cam: [number, number, number]; at: [number, number, number] }[];
}

/** a straight two-point run resampled every `step` metres (driveways: no spline overshoot) */
function straight(xz: number[][], step: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < xz.length - 1; i++) { const a = xz[i], b = xz[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step)); for (let k = 0; k < n; k++) out.push({ x: a[0] + (b[0] - a[0]) * k / n, z: a[1] + (b[1] - a[1]) * k / n }); }
  const l = xz[xz.length - 1]; out.push({ x: l[0], z: l[1] });
  return out;
}

export interface RoadNetwork { roads: { kind: 'paved' | 'dirt' | 'drive'; xz: number[][]; half?: number }[] }

export function buildCountryScenes(o: { ground: (x: number, z: number) => number; roadMaterial?: THREE.Material; network?: RoadNetwork; shoreline?: Shoreline }): CountryScenes {
  const group = new THREE.Group(); group.name = 'country-scenes';
  const roads: THREE.Mesh[] = [];
  const asphalt = o.roadMaterial ?? new THREE.MeshStandardMaterial({ color: 0x2b2c2e, roughness: 0.85 });
  const dirtMat = new THREE.MeshStandardMaterial({ map: noiseTex([128, 104, 78], 90, true, 1, 1), roughness: 1 });
  // driveways: brushed concrete, no markings, a touch below the street surface so the street wins where they meet at the curb
  const driveMat = (() => {
    const tl = new THREE.TextureLoader(), T = '/games/forth-horizon/tex/';
    const t = (f: string, srgb: boolean): THREE.Texture => { const x = tl.load(T + f); x.wrapS = x.wrapT = THREE.RepeatWrapping; x.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; x.anisotropy = 4; return x; };
    return new THREE.MeshStandardMaterial({ map: t('ground_concrete_sidewalk.png', true), normalMap: t('ground_concrete_sidewalk_normal.png', false), roughnessMap: t('ground_concrete_sidewalk_roughness.png', false), color: 0xd9d6cf, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  })();
  const edgeMat = new THREE.MeshStandardMaterial({ map: noiseTex([112, 100, 70], 70, false, 1, 1), roughness: 1 });

  // ---- road ribbon: crown-free strip with shoulders, following the drawn ground, with an optional causeway deck ----
  const ribbon = (line: Pt[], half: number, lift: number, mat: THREE.Material, uvLen: number, deck?: { at: Pt; r: number }): { mesh: THREE.Mesh; ys: number[] } => {
    const n = line.length, pos: number[] = [], uv: number[] = [], idx: number[] = [];
    let dist = 0;
    // deck heights: linear between the ground at the two ends of the causeway
    let i0 = -1, i1 = -1;
    if (deck) { line.forEach((p, i) => { const d = Math.hypot(p.x - deck.at.x, p.z - deck.at.z); if (d <= deck.r) { if (i0 < 0) i0 = i; i1 = i; } }); }
    const yEnd0 = i0 >= 0 ? o.ground(line[Math.max(0, i0 - 1)].x, line[Math.max(0, i0 - 1)].z) + lift : 0;
    const yEnd1 = i1 >= 0 ? o.ground(line[Math.min(n - 1, i1 + 1)].x, line[Math.min(n - 1, i1 + 1)].z) + lift : 0;
    const ys: number[] = [];
    for (let i = 0; i < n; i++) {
      const p = line[i], a = line[Math.max(0, i - 1)], b = line[Math.min(n - 1, i + 1)];
      let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      if (i > 0) dist += Math.hypot(p.x - line[i - 1].x, p.z - line[i - 1].z);
      const y = i0 >= 0 && i >= i0 && i <= i1 ? yEnd0 + (yEnd1 - yEnd0) * ((i - i0) / Math.max(1, i1 - i0)) : o.ground(p.x, p.z) + lift;
      ys.push(y);
      const nx = -dz * half, nz = dx * half;
      pos.push(p.x + nx, y, p.z + nz, p.x - nx, y, p.z - nz);
      uv.push(0, dist / uvLen, 1, dist / uvLen);
    }
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, mat); mesh.receiveShadow = true;
    return { mesh, ys };
  };

  const millLine = catmull(MILLBROOK, 4), hollowLine = catmull(HOLLOW, 4);
  const mill = ribbon(millLine, 4.2, 0.12, asphalt, 8, { at: BRIDGE.at, r: BRIDGE.causeway });
  const millShoulder = ribbon(millLine, 5.8, 0.06, edgeMat, 6, { at: BRIDGE.at, r: BRIDGE.causeway });
  millShoulder.mesh.renderOrder = -1;
  group.add(millShoulder.mesh, mill.mesh); roads.push(mill.mesh, millShoulder.mesh);
  const hollow = ribbon(hollowLine, 3.0, 0.1, dirtMat, 6);
  const hollowEdge = ribbon(hollowLine, 4.4, 0.05, edgeMat, 6);
  group.add(hollowEdge.mesh, hollow.mesh); roads.push(hollow.mesh, hollowEdge.mesh);

  // ---- the country roads traced from the map texture (tools/trace_roads.py): section roads and lanes laid on the drawn ground ----
  const netPaved: (Pt & { h: number })[] = [], netDirt: (Pt & { h: number })[] = [];
  const bridgeRuns: { line: Pt[]; i0: number; i1: number; half: number; ys: number[]; gy: number[] }[] = [];
  if (o.network) {
    const mk = (kind: 'paved' | 'dirt' | 'drive'): { pos: number[]; uv: number[]; idx: number[]; v: number } => ({ pos: [], uv: [], idx: [], v: 0 });
    const acc = { paved: mk('paved'), dirt: mk('dirt'), drive: mk('drive') };
    for (const r of o.network.roads) {
      const line = r.kind === 'drive' ? straight(r.xz, 3) : catmull(r.xz.map(([x, z]) => ({ x, z })), 8);
      if (line.length < 2) continue;
      const half = r.half ?? (r.kind === 'paved' ? 3.6 : 2.6), a = acc[r.kind];
      // heights: the drawn ground, held up over streams so the road crosses them as a causeway rather than dipping into the water
      const gy = line.map((p) => o.ground(p.x, p.z));
      // heights: the road follows the ground; wherever the ground under it is water it becomes a bridge: a level deck from bank to bank, eased onto it over 48 m on each side
      const ys = gy.map((g) => g + (r.kind === 'drive' ? 0.07 : 0.1));
      {
        const WATER = 2.5, RAMP = 6;
        let i = 0;
        while (i < gy.length) {
          if (gy[i] >= WATER) { i++; continue; }
          let j = i; while (j + 1 < gy.length && gy[j + 1] < WATER) j++;
          const lo = Math.max(0, i - 1), hi = Math.min(gy.length - 1, j + 1);
          const deck = Math.max(gy[lo], gy[hi], 3.2) + 1.2;
          for (let k = Math.max(0, i - RAMP); k <= Math.min(gy.length - 1, j + RAMP); k++) {
            if (k >= i && k <= j) { ys[k] = deck + 0.1; continue; }
            const t = k < i ? (k - (i - RAMP)) / RAMP : ((j + RAMP) - k) / RAMP, sm = t * t * (3 - 2 * t);
            ys[k] = (deck > gy[k] ? gy[k] + (deck - gy[k]) * sm : gy[k]) + 0.1;
          }
          if ((j - i + 1) * 8 >= 10) bridgeRuns.push({ line, i0: Math.max(0, i - 1), i1: Math.min(gy.length - 1, j + 1), half, ys, gy });
          i = j + 1 + RAMP;
        }
      }
      let dist = 0;
      const base = a.v;
      for (let i = 0; i < line.length; i++) {
        const p = line[i], pa = line[Math.max(0, i - 1)], pb = line[Math.min(line.length - 1, i + 1)];
        let dx = pb.x - pa.x, dz = pb.z - pa.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        if (i > 0) dist += Math.hypot(p.x - line[i - 1].x, p.z - line[i - 1].z);
        a.pos.push(p.x - dz * half, ys[i], p.z + dx * half, p.x + dz * half, ys[i], p.z - dx * half);
        if (r.kind === 'drive') a.uv.push(0, dist / (half * 2), 1, dist / (half * 2)); else a.uv.push(0, dist / 8, 1, dist / 8);
        (r.kind === 'dirt' ? netDirt : netPaved).push({ x: p.x, z: p.z, h: half });
      }
      for (let i = 0; i < line.length - 1; i++) { const q = base + i * 2; a.idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
      a.v += line.length * 2;
    }
    for (const kind of ['paved', 'dirt', 'drive'] as const) {
      const a = acc[kind]; if (!a.pos.length) continue;
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(a.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(a.uv, 2)); g.setIndex(a.idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, kind === 'paved' ? asphalt : kind === 'drive' ? driveMat : dirtMat); m.receiveShadow = true; m.name = 'country-' + kind;
      group.add(m); roads.push(m);
    }
    // bridges wherever a road crosses water: concrete fascia and parapets along both edges, a soffit under the deck and piers down to the bed every 22 m
    if (bridgeRuns.length) {
      const conc = new THREE.MeshStandardMaterial({ color: 0xa29f98, roughness: 0.93, side: THREE.DoubleSide });
      const pos: number[] = [], idx: number[] = [];
      const wall = (ax: number, az: number, bx: number, bz: number, y0a: number, y0b: number, y1a: number, y1b: number): void => {
        const b0 = pos.length / 3; pos.push(ax, y0a, az, bx, y0b, bz, bx, y1b, bz, ax, y1a, az); idx.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
      };
      const piers: number[][] = [];
      for (const br of bridgeRuns) {
        let acc = 0;
        for (let i = br.i0; i < br.i1; i++) {
          const p = br.line[i], q = br.line[i + 1];
          let dx = q.x - p.x, dz = q.z - p.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
          const nx = -dz, nz = dx;
          for (const side of [-1, 1]) {
            const e = br.half + 0.45;
            wall(p.x + nx * side * e, p.z + nz * side * e, q.x + nx * side * e, q.z + nz * side * e, br.ys[i] - 0.9, br.ys[i + 1] - 0.9, br.ys[i] + 0.95, br.ys[i + 1] + 0.95);   // fascia + parapet in one
          }
          // soffit
          const b0 = pos.length / 3, e2 = br.half + 0.45;
          pos.push(p.x + nx * e2, br.ys[i] - 0.9, p.z + nz * e2, p.x - nx * e2, br.ys[i] - 0.9, p.z - nz * e2, q.x + nx * e2, br.ys[i + 1] - 0.9, q.z + nz * e2, q.x - nx * e2, br.ys[i + 1] - 0.9, q.z - nz * e2);
          idx.push(b0, b0 + 2, b0 + 1, b0 + 1, b0 + 2, b0 + 3);
          acc += l;
          if (acc >= 22 && br.gy[i] < 2.5) { acc = 0; piers.push([p.x, p.z, br.ys[i] - 0.9, Math.atan2(dx, dz), br.half * 2 + 0.8, Math.min(br.gy[i], 0) - 1.5]); }
        }
      }
      const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setIndex(idx); bg.computeVertexNormals();
      const bm = new THREE.Mesh(bg, conc); bm.castShadow = bm.receiveShadow = true; bm.name = 'country-bridges'; group.add(bm);
      const pm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), conc, piers.length || 1);
      const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(), tp = new THREE.Vector3();
      piers.forEach((pr, k) => { const h = pr[2] - pr[5]; qq.setFromAxisAngle(up, pr[3]); sc.set(pr[4], h, 1.6); tp.set(pr[0], pr[5] + h / 2, pr[1]); pm.setMatrixAt(k, m4.compose(tp, qq, sc)); });
      pm.count = piers.length; pm.castShadow = true; group.add(pm);
    }
  }

  // ---- the shoreline highway with its open gallery ----
  const netShore: (Pt & { h: number })[] = [];
  if (o.shoreline) {
    const hw = o.shoreline, line: Pt[] = [], ly: number[] = [];
    const nodeStart: number[] = [];
    for (let i = 0; i < hw.xz.length - 1; i++) {
      nodeStart.push(line.length);
      const a = hw.xz[i], b = hw.xz[i + 1], n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 5));
      for (let k = 0; k < n; k++) { const t = k / n; line.push({ x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t }); ly.push(hw.y[i] + (hw.y[i + 1] - hw.y[i]) * t + 0.12); }
    }
    line.push({ x: hw.xz[hw.xz.length - 1][0], z: hw.xz[hw.xz.length - 1][1] }); ly.push(hw.y[hw.y.length - 1] + 0.12);
    const per = (i: number): { nx: number; nz: number } => { const p = line[Math.max(0, i - 1)], q = line[Math.min(line.length - 1, i + 1)]; let dx = q.x - p.x, dz = q.z - p.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; return { nx: -dz, nz: dx }; };
    // the road runs north to south with the lake to the west: the lake side is where the offset normal points to smaller x
    const lakeSign = per(10).nx < 0 ? 1 : -1;
    const strip = (half: number, off: number, lift: number, mat: THREE.Material, uvLen: number, from = 0, to = line.length - 1): THREE.Mesh => {
      const pos: number[] = [], uv: number[] = [], idx: number[] = []; let dist = 0;
      for (let i = from; i <= to; i++) {
        const { nx, nz } = per(i), p = line[i];
        if (i > from) dist += Math.hypot(p.x - line[i - 1].x, p.z - line[i - 1].z);
        pos.push(p.x + nx * (off + half), ly[i] + lift, p.z + nz * (off + half), p.x + nx * (off - half), ly[i] + lift, p.z + nz * (off - half)); uv.push(0, dist / uvLen, 1, dist / uvLen);
      }
      for (let i = 0; i < to - from; i++) { const q = i * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat); m.receiveShadow = true; return m;
    };
    const road = strip(4.4, 0, 0, asphalt, 8); road.name = 'shoreline-road'; group.add(road); roads.push(road);
    const verge = strip(7.2, 0, -0.07, edgeMat, 6); group.add(verge); roads.push(verge);
    const lineMat = (c: number): THREE.Material => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    for (const off of [-0.18, 0.18]) group.add(strip(0.07, off, 0.03, lineMat(0xe8b830), 8));
    for (const off of [-3.9, 3.9]) group.add(strip(0.08, off, 0.03, lineMat(0xeeeeea), 8));
    // guardrail on the lake side: posts every 5 m and a rail
    {
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.9, 0.16), new THREE.MeshStandardMaterial({ color: 0x9aa0a5, metalness: 0.6, roughness: 0.5 }), line.length);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < line.length; i++) { const { nx, nz } = per(i); m4.makeTranslation(line[i].x + nx * lakeSign * 5.1, ly[i] + 0.45, line[i].z + nz * lakeSign * 5.1); im.setMatrixAt(i, m4); }
      im.castShadow = true; group.add(im);
      group.add(strip(0.18, lakeSign * 5.1, 0.7, new THREE.MeshStandardMaterial({ color: 0xb8bdc2, metalness: 0.7, roughness: 0.4, side: THREE.DoubleSide }), 8));
    }
    // the gallery: a tunnel cut into the cliff. The rock stands over the road (a ceiling of rock, the hill above it, the cliff top grassed over), the hill side is the rock face,
    // and the lake side is chiselled open: rock pillars with wide arched windows looking out over the lake. No built roof: the roof is the mountain.
    {
      // natural cliff rock: weathered grey-buff strata (the u axis runs up the face, so the bands run level along the cliff), dark joints and lichen speckle; the same
      // canvas is the bump map. Painted here because the stock stone textures are all dressed masonry, which makes the cliff read as a built wall.
      const rock = new THREE.MeshStandardMaterial({ map: cliffRockTex(), bumpMap: cliffRockTex(true), bumpScale: 2.2, roughness: 0.95, flatShading: true, side: THREE.DoubleSide });
      const lining = new THREE.MeshStandardMaterial({ color: 0x4b4842, roughness: 1, flatShading: true, side: THREE.DoubleSide });
      const a = nodeStart[hw.gallery.from], b = Math.min(line.length - 1, nodeStart[hw.gallery.to]);
      const hash = (i: number, k: number): number => { const t = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return t - Math.floor(t); };
      const at = (i: number, sLake: number): { x: number; z: number } => { const { nx, nz } = per(i); return { x: line[i].x + nx * lakeSign * sLake, z: line[i].z + nz * lakeSign * sLake }; };
      // the outer surface of the rock: lateral samples from the lake lip (+5.6) inland, up the cliff behind the roof to where it meets the hill (-42)
      const S = [5.6, 4.0, 1.5, -1.5, -5, -8, -10.5, -13, -15.5, -18, -22, -27, -34, -42, -50];
      const pos: number[] = [], idx: number[] = [], uv: number[] = [];
      const ring = (i: number): number[] => {
        const out: number[] = [];
        for (let k = 0; k < S.length; k++) {
          const p = at(i, S[k]), g = o.ground(p.x, p.z);
          const lip = ly[i] + 7.3 + (S[k] > 3 ? 0 : 0.5);
          const top = S[k] > 3 ? lip : k === S.length - 1 ? g - 0.6 : Math.max(g + 1.1, ly[i] + 7.9);           // over the ground by a metre: the terrain is coarser than the rock and would poke through                  // the plateau over the road, then whatever the hill does
          out.push(p.x, top + (hash(i, k) - 0.5) * 0.7, p.z);
        }
        return out;
      };
      let prev = ring(a);
      for (let i = a + 1; i <= b; i++) {
        const cur = ring(i), base = pos.length / 3;
        for (let k = 0; k < S.length; k++) { pos.push(prev[k * 3], prev[k * 3 + 1], prev[k * 3 + 2]); uv.push(k / 3, (i - 1) * 0.3); }
        for (let k = 0; k < S.length; k++) { pos.push(cur[k * 3], cur[k * 3 + 1], cur[k * 3 + 2]); uv.push(k / 3, i * 0.3); }
        for (let k = 0; k < S.length - 1; k++) { const p0 = base + k, p1 = base + k + 1, c0 = base + S.length + k, c1 = base + S.length + k + 1; idx.push(p0, c0, p1, p1, c0, c1); }
        prev = cur;
      }
      const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); rg.setIndex(idx); rg.computeVertexNormals();
      const rm = new THREE.Mesh(rg, rock); rm.castShadow = rm.receiveShadow = true; rm.name = 'gallery-rock'; group.add(rm);
      // the rock face under the ledge on the lake side, from the road edge down to where the face meets the beach (the terrain is graded to a steep drop there)
      {
        const S2 = [6.0, 8.0, 10.5, 13, 16, 19.5, 23.5, 28, 34, 41], fp: number[] = [], fi: number[] = [], fu: number[] = [];
        for (let i = a; i <= b; i++) for (let k = 0; k < S2.length; k++) {
          const p = at(i, S2[k]), g = o.ground(p.x, p.z);
          fp.push(p.x, (k === 0 ? ly[i] - 0.1 : k === S2.length - 1 ? g - 0.6 : g + 1.1) + (k && k < S2.length - 1 ? (hash(i, k + 20) - 0.5) * 0.9 : 0), p.z); fu.push(k / 3, i * 0.3);
        }
        for (let i = 0; i < b - a; i++) for (let k = 0; k < S2.length - 1; k++) { const p0 = i * S2.length + k, c0 = p0 + S2.length; fi.push(p0, p0 + 1, c0, p0 + 1, c0 + 1, c0); }
        const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(fu, 2)); fg.setIndex(fi); fg.computeVertexNormals();
        const fm = new THREE.Mesh(fg, rock); fm.castShadow = fm.receiveShadow = true; fm.name = 'gallery-face'; group.add(fm);
      }
      // faces: the lintel (lake face, over the windows), the dark ceiling and the hill-side rock wall inside
      const face = (sOff: number, y0: number, y1: number, mat: THREE.Material, jit = 0): THREE.Mesh => {
        const fp: number[] = [], fi: number[] = [], fu: number[] = [];
        for (let i = a; i <= b; i++) { const p = at(i, sOff), j = jit ? (hash(i, 5) - 0.5) * jit : 0; fp.push(p.x, ly[i] + y0, p.z, p.x, ly[i] + y1 + j, p.z); fu.push(0, i * 0.3, 1, i * 0.3); }
        for (let i = 0; i < b - a; i++) { const q = i * 2; fi.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(fu, 2)); g.setIndex(fi); g.computeVertexNormals();
        const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true; group.add(m); return m;
      };
      face(5.6, 5.1, 7.3, rock, 0.6);                                                   // lintel over the windows
      face(-5.4, -0.2, 5.2, lining, 0.4);                                              // the rock face on the hill side
      const ceil = strip(5.4, 0, 5.2, lining, 9, a, b); ceil.name = 'gallery-ceiling'; group.add(ceil);
      face(5.35, 0, 1.0, rock, 0.0);                                                    // a low rock parapet along the lake edge
      // pillars between the windows: every ~15 m, rough boxes of rock
      {
        const pil = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), rock, 120), lamp = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.15, 1.6), new THREE.MeshStandardMaterial({ color: 0xfff1c8, emissive: 0xffe2a0, emissiveIntensity: 2.2 }), 120);
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(), tp = new THREE.Vector3(); let k = 0, kl = 0, since = 0;
        for (let i = a; i <= b; i++) {
          since += 5;
          const { nx, nz } = per(i); q.setFromAxisAngle(up, Math.atan2(nx, nz));
          if (since >= 15) { since = 0; const p = at(i, 5.3), w = 2.0 + hash(i, 1) * 1.4; sc.set(w, 5.4, 1.5 + hash(i, 2)); tp.set(p.x, ly[i] + 2.6, p.z); if (k < 120) pil.setMatrixAt(k++, m4.compose(tp, q, sc)); }
          if (i % 4 === 0) { sc.set(1, 1, 1); tp.set(line[i].x, ly[i] + 5.0, line[i].z); if (kl < 120) lamp.setMatrixAt(kl++, m4.compose(tp, q, sc)); }
        }
        pil.count = k; lamp.count = kl; pil.castShadow = pil.receiveShadow = true; group.add(pil, lamp);
        // portals: a rough rock frame at each end, the road running into the hill
        for (const i of [a, b]) {
          const { nx, nz } = per(i); const yaw = Math.atan2(nx, nz);
          const mk = (w: number, h: number, d: number, sOff: number, y: number): void => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), rock); const p = at(i, sOff); m.position.set(p.x, ly[i] + y, p.z); m.rotation.y = yaw; m.castShadow = m.receiveShadow = true; group.add(m); };
          mk(1.8, 6.6, 2.6, 5.6, 3.3); mk(1.8, 6.6, 2.6, -5.6, 3.3);                      // the two posts
          mk(13.2, 2.8, 2.6, 0, 6.2);                                                      // the lintel across the mouth
        }
      }
    }
    for (const p of line) netShore.push({ x: p.x, z: p.z, h: 7.2 });
  }

  // painted lines on Millbrook Road: a yellow centre pair and white edges, skipped on the bridge deck
  const paint = (offset: number, w: number, color: number, dashed: boolean): void => {
    const pos: number[] = [], idx: number[] = []; let v = 0;
    for (let i = 0; i < millLine.length - 1; i++) {
      if (dashed && Math.floor(i / 5) % 2) continue;
      const p = millLine[i], q = millLine[i + 1];
      let dx = q.x - p.x, dz = q.z - p.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const nx = -dz, nz = dx, y0 = mill.ys[i] + 0.025, y1 = mill.ys[i + 1] + 0.025;
      pos.push(p.x + nx * (offset - w), y0, p.z + nz * (offset - w), p.x + nx * (offset + w), y0, p.z + nz * (offset + w), q.x + nx * (offset - w), y1, q.z + nz * (offset - w), q.x + nx * (offset + w), y1, q.z + nz * (offset + w));
      idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3); v += 4;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    group.add(m);
  };
  paint(0.16, 0.07, 0xe8b830, false); paint(-0.16, 0.07, 0xe8b830, false); paint(3.75, 0.07, 0xeeeeea, false); paint(-3.75, 0.07, 0xeeeeea, false);

  // ---- creek water ----
  {
    const n = creekLine.length, pos: number[] = [], uv: number[] = [], idx: number[] = []; let dist = 0;
    for (let i = 0; i < n; i++) {
      const p = creekLine[i], a = creekLine[Math.max(0, i - 1)], b = creekLine[Math.min(n - 1, i + 1)];
      let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      if (i > 0) dist += Math.hypot(p.x - creekLine[i - 1].x, p.z - creekLine[i - 1].z);
      const y = p.water, w = CREEK_WATER_HALF * (0.85 + 0.3 * Math.sin(i * 0.37));
      pos.push(p.x - dz * w, y, p.z + dx * w, p.x + dz * w, y, p.z - dx * w); uv.push(0, dist / 10, 1, dist / 10);
    }
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const wm = new THREE.MeshStandardMaterial({ color: 0x4f6b66, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.82 });
    const mesh = new THREE.Mesh(g, wm); mesh.name = 'millbrook-creek'; mesh.renderOrder = 2;
    group.add(mesh);
    // boulders in and along the water, grey, in dozens of sizes
    const r = rng(5), rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x77746d, roughness: 0.95, flatShading: true }), 420);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), t = new THREE.Vector3();
    for (let i = 0; i < 420; i++) {
      const c = creekLine[Math.floor(r() * (n - 1))], off = (r() - 0.5) * 2 * (CREEK_WATER_HALF + 5);
      const nx = 0.5, nz = 0.5; void nx; void nz;
      const px = c.x + off * 0.8, pz = c.z + off * 0.6, sc = 0.25 + Math.pow(r(), 3) * 1.8;
      e.set(r() * 3, r() * 3, r() * 3); q.setFromEuler(e); s.set(sc * (0.8 + r() * 0.5), sc * (0.55 + r() * 0.4), sc * (0.8 + r() * 0.5));
      t.set(px, Math.max(o.ground(px, pz), c.water - 0.35) - sc * 0.15, pz); rocks.setMatrixAt(i, m4.compose(t, q, s));
    }
    rocks.castShadow = rocks.receiveShadow = true; group.add(rocks);
  }

  // ---- covered bridge ----
  {
    const B = new THREE.Group(); B.name = 'covered-bridge';
    const a = millLine.findIndex((p) => Math.hypot(p.x - BRIDGE.at.x, p.z - BRIDGE.at.z) < 5);
    const p = millLine[a], q = millLine[a + 1];
    const yaw = Math.atan2(q.x - p.x, q.z - p.z) - Math.PI / 2;      // local +x runs along the road
    B.position.set(p.x, mill.ys[a], p.z); B.rotation.y = yaw + Math.PI / 2 * 0 ;
    B.rotation.y = Math.atan2(-(q.z - p.z), q.x - p.x);
    const wood = new THREE.MeshStandardMaterial({ map: noiseTex([82, 66, 52], 120, false, 3, 1), roughness: 0.96, color: 0x9a8a7a });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1b1713, roughness: 1 });
    const shingle = new THREE.MeshStandardMaterial({ map: noiseTex([64, 62, 60], 110, false, 4, 2), roughness: 0.95, color: 0x8d8985 });
    const stone = new THREE.MeshStandardMaterial({ map: noiseTex([112, 108, 100], 140, false, 2, 1), roughness: 0.98 });
    const L = BRIDGE.half * 2, W = 10.4, WH = 5.6;
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh => { const mm = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); mm.position.set(x, y, z); mm.castShadow = mm.receiveShadow = true; B.add(mm); return mm; };
    // deck beams and planks, side walls with window slits, a gabled shingle roof, dark open ends
    box(L, 0.5, W, wood, 0, -0.35, 0);
    for (const s of [-1, 1]) {
      box(L, 0.5, 0.3, wood, 0, 0.2, s * (W / 2));                                         // sill
      for (let i = 0; i < 8; i++) { const x = -L / 2 + 2 + i * ((L - 4) / 7); box(0.5, WH, 0.34, wood, x, WH / 2, s * (W / 2)); }   // posts
      box(L, 1.9, 0.26, wood, 0, 1.0, s * (W / 2 + 0.02));                                 // lower boards
      box(L, 1.2, 0.26, wood, 0, WH - 0.55, s * (W / 2 + 0.02));                           // upper boards under the eaves
      for (let i = 0; i < 4; i++) box(2.0, 0.9, 0.12, dark, -L / 2 + 5 + i * 6.8, 3.0, s * (W / 2 + 0.16));  // window slits
    }
    const roof = new THREE.Shape(); roof.moveTo(-W / 2 - 1.3, 0); roof.lineTo(0, 3.4); roof.lineTo(W / 2 + 1.3, 0); roof.closePath();
    const rg = new THREE.ExtrudeGeometry(roof, { depth: L + 1.6, bevelEnabled: false });
    const rm = new THREE.Mesh(rg, shingle); rm.rotation.y = Math.PI / 2; rm.position.set(-L / 2 - 0.8, WH - 0.1, 0); rm.castShadow = rm.receiveShadow = true; B.add(rm);
    for (const s of [-1, 1]) { box(0.5, 0.7, W, wood, s * (L / 2 + 0.1), WH - 0.2, 0); }  // end beams
    for (let i = 0; i < 5; i++) { box(0.35, 0.35, W, wood, -L / 2 + 3 + i * 6, WH - 0.9, 0); }   // tie beams
    box(L, 0.2, W - 1, dark, 0, WH + 0.4, 0).visible = false;
    // stone abutments each end and a stone pier skirt down to the banks
    for (const s of [-1, 1]) {
      const ab = box(7, 9, W + 2.6, stone, s * (L / 2 + 1.5), -4.6, 0);
      ab.scale.set(1, 1, 1);
    }
    group.add(B);
    // stone skirts and rails along the causeway so the deck is not floating over the sloped bank
    for (const side of [-1, 1]) {
      const lo = a - Math.round(BRIDGE.causeway / 4), hi = a + Math.round(BRIDGE.causeway / 4);
      const pos: number[] = [], idx: number[] = []; let v = 0;
      for (let i = Math.max(0, lo); i < Math.min(millLine.length - 1, hi); i++) {
        const pa = millLine[i], pb = millLine[i + 1];
        let dx = pb.x - pa.x, dz = pb.z - pa.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        const off = side * 4.4;
        const ax = pa.x - dz * off, az = pa.z + dx * off, bx = pb.x - dz * off, bz = pb.z + dx * off;
        const ya = mill.ys[i], yb = mill.ys[i + 1];
        const ga = o.ground(ax, az) - 1.5, gb = o.ground(bx, bz) - 1.5;
        pos.push(ax, ga, az, ax, ya + 0.15, az, bx, gb, bz, bx, yb + 0.15, bz); idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2, v, v + 2, v + 1, v + 1, v + 2, v + 3); v += 4;
        if (i % 3 === 0 && Math.hypot(pa.x - BRIDGE.at.x, pa.z - BRIDGE.at.z) > BRIDGE.half) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.9, 0.2), new THREE.MeshStandardMaterial({ color: 0x9a9fa4, metalness: 0.6, roughness: 0.5 }));
          post.position.set(ax, ya + 0.6, az); group.add(post);
        }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      const sk = new THREE.Mesh(g, stone); sk.castShadow = sk.receiveShadow = true; group.add(sk);
    }
  }

  // ---- the barn at the end of Hollow Lane: red board walls, gambrel roof, a tin silo ----
  {
    const barn = new THREE.Group(); barn.name = 'hollow-barn';
    const y = o.ground(BARN.x, BARN.z);
    barn.position.set(BARN.x, y, BARN.z); barn.rotation.y = BARN.rotY;
    const red = new THREE.MeshStandardMaterial({ map: noiseTex([124, 38, 30], 90, false, 4, 2), roughness: 0.9 });
    const tin = new THREE.MeshStandardMaterial({ color: 0x8a867f, roughness: 0.55, metalness: 0.7 });
    const white = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.9 });
    const add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, yy: number, z: number): THREE.Mesh => { const mm = new THREE.Mesh(g, m); mm.position.set(x, yy, z); mm.castShadow = mm.receiveShadow = true; barn.add(mm); return mm; };
    add(new THREE.BoxGeometry(24, 8, 14), red, 0, 4, 0);
    const gam = new THREE.Shape(); gam.moveTo(-7.4, 0); gam.lineTo(-7.4, 1.6); gam.lineTo(-4.2, 5.6); gam.lineTo(0, 7.2); gam.lineTo(4.2, 5.6); gam.lineTo(7.4, 1.6); gam.lineTo(7.4, 0); gam.closePath();
    const roofM = add(new THREE.ExtrudeGeometry(gam, { depth: 25, bevelEnabled: false }), tin, -12.5, 8, 0); roofM.rotation.y = -Math.PI / 2; roofM.position.set(-12.5, 8, 0);
    roofM.rotation.y = Math.PI / 2; roofM.position.set(-12.5, 8, 0);
    add(new THREE.BoxGeometry(5.4, 5.4, 0.3), white, -3, 2.9, 7.1);                      // big doors, white trim
    add(new THREE.BoxGeometry(5.4, 5.4, 0.3), white, 3, 2.9, 7.1);
    add(new THREE.BoxGeometry(5.0, 5.0, 0.2), new THREE.MeshStandardMaterial({ color: 0x1b1210 }), 0, 2.8, 7.16).visible = false;
    for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(1.0, 1.1, 0.2), white, -9 + i * 4.5, 5.5, 7.1);
    add(new THREE.CylinderGeometry(3.2, 3.2, 17, 20), tin, 14.5, 8.5, -2);               // silo
    add(new THREE.SphereGeometry(3.2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), tin, 14.5, 17, -2);
    add(new THREE.BoxGeometry(5, 5, 8), red, 11, 2.5, -9);                                // lean-to
    group.add(barn);
    // a post-and-rail fence along the lane's last stretch
    const post = new THREE.BoxGeometry(0.15, 1.3, 0.15), rail = new THREE.BoxGeometry(3.4, 0.1, 0.1), fw = new THREE.MeshStandardMaterial({ color: 0x6f5a45, roughness: 1 });
    for (let i = 8; i < hollowLine.length - 2; i += 2) {
      const p = hollowLine[i], q = hollowLine[i + 2], ang = Math.atan2(-(q.z - p.z), q.x - p.x);
      for (const s of [-1, 1]) {
        const dx = (q.x - p.x), dz = (q.z - p.z), l = Math.hypot(dx, dz) || 1, nx = -dz / l * s * 5.4, nz = dx / l * s * 5.4;
        const m1 = new THREE.Mesh(post, fw); m1.position.set(p.x + nx, o.ground(p.x + nx, p.z + nz) + 0.65, p.z + nz); group.add(m1);
        const m2 = new THREE.Mesh(rail, fw); m2.position.set((p.x + q.x) / 2 + nx, o.ground(p.x + nx, p.z + nz) + 1.0, (p.z + q.z) / 2 + nz); m2.rotation.y = ang; group.add(m2);
      }
    }
    // corn, a field of it, beside the lane: rows of dark-green stalks
    const stalk = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 2.4, 0.5), new THREE.MeshStandardMaterial({ color: 0x4f7a2a, roughness: 0.9 }), 6000);
    const r = rng(9), m4 = new THREE.Matrix4(); let k = 0;
    for (let row = 0; row < 40 && k < 6000; row++) for (let col = 0; col < 150 && k < 6000; col++) {
      const lx = -1250 + col * 0.9, lz = -1180 + row * 0.8;
      const jx = lx + (r() - 0.5) * 0.3, jz = lz + (r() - 0.5) * 0.3;
      m4.makeScale(1, 0.8 + r() * 0.5, 1).setPosition(jx, o.ground(jx, jz) + 1.1, jz); stalk.setMatrixAt(k++, m4);
    }
    stalk.count = k; stalk.castShadow = false; group.add(stalk);
  }

  const shots: CountryScenes['shots'] = [
    { name: 'Covered bridge, low from the bank', cam: [BRIDGE.at.x - 38, o.ground(BRIDGE.at.x - 38, BRIDGE.at.z + 30) + 5, BRIDGE.at.z + 30], at: [BRIDGE.at.x, o.ground(BRIDGE.at.x, BRIDGE.at.z) + 3, BRIDGE.at.z] },
    { name: 'Covered bridge, from the creek', cam: [BRIDGE.at.x - 20, o.ground(BRIDGE.at.x - 20, BRIDGE.at.z + 45) + 3, BRIDGE.at.z + 45], at: [BRIDGE.at.x, o.ground(BRIDGE.at.x, BRIDGE.at.z) + 3, BRIDGE.at.z] },
    { name: 'Hollow barn and silo', cam: [BARN.x - 60, o.ground(BARN.x - 60, BARN.z + 45) + 5, BARN.z + 45], at: [BARN.x, o.ground(BARN.x, BARN.z) + 6, BARN.z] },
    { name: 'Millbrook hairpin from above', cam: [-380, o.ground(-380, -1440) + 120, -1250], at: [-450, o.ground(-450, -1450), -1450] },
  ];
  return { group, roads, pavedNear: makeCorridor([...millLine.map((p) => ({ x: p.x, z: p.z, h: 5.8 })), ...netPaved, ...netShore]), dirtNear: makeCorridor([...hollowLine.map((p) => ({ x: p.x, z: p.z, h: 4.4 })), ...netDirt]), shots };
}
