import * as THREE from 'three';
import { buildHeroBridge } from './heroBridge';
import { mergeByMaterial } from './carBatch';
import { GRID } from './grid';

/**
 * The two high-level river bridges. Shipping uses this river, so the deck clears the water by 46 m (the tallest ships need about 40): the main span is the cable-stayed hero bridge
 * between the banks, and the road climbs to it on long viaduct approaches (5 % grade) carried on piers.
 */
export interface BridgeDef { name: string; a: { x: number; z: number }; b: { x: number; z: number }; deck: number; width: number }

export const RIVER_BRIDGES: BridgeDef[] = [
  { name: 'Halcyon Gateway Bridge', a: { x: 3288, z: 2748 }, b: { x: 4248, z: 2796 }, deck: 46, width: 22 },
  { name: 'Northgate Bridge', a: { x: 5928, z: -3888 }, b: { x: 6624, z: -3888 }, deck: 46, width: 22 },
];

export interface RiverBridges {
  group: THREE.Group;
  /** meshes the car can drive on (decks and approaches) */
  decks: THREE.Mesh[];
  /** the road's centre line, for surface lookups */
  path: { x: number; z: number }[];
  updateLed: (elapsed: number, nightFactor: number) => void;
}

export function buildRiverBridges(o: { ground: (x: number, z: number) => number; roadMaterial?: THREE.Material }): RiverBridges {
  const group = new THREE.Group(); group.name = 'river-bridges';
  const decks: THREE.Mesh[] = [];
  const path: { x: number; z: number }[] = [];
  const leds: ((t: number, n: number) => void)[] = [];
  const asphalt = o.roadMaterial ?? new THREE.MeshStandardMaterial({ color: 0x2b2c2e, roughness: 0.85 });
  const conc = new THREE.MeshStandardMaterial({ color: 0x9a9893, roughness: 0.92 });
  const rail = new THREE.MeshStandardMaterial({ color: 0xb8bdc2, metalness: 0.6, roughness: 0.45 });
  for (const br of RIVER_BRIDGES) {
    const dx = br.b.x - br.a.x, dz = br.b.z - br.a.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
    const hero = buildHeroBridge({ start: new THREE.Vector3(br.a.x, br.deck, br.a.z), end: new THREE.Vector3(br.b.x, br.deck, br.b.z), deckWidth: br.width, towerHeight: 118, pierDepth: br.deck + 12, abutmentDepth: Math.max(12, br.deck - Math.min(o.ground(br.a.x, br.a.z), o.ground(br.b.x, br.b.z)) + 3) });
    const mb = mergeByMaterial(hero.group); console.log('hero bridge meshes', mb.before, '->', mb.after);   // ~800 static meshes into one draw per material
    group.add(hero.group); leds.push(hero.updateLed);

    // the road: approach A (climbing), the span (level), approach B (descending): one ribbon, with its own piers
    const ap = approachesFor(br, o.ground), la = ap.a.length * AP_STEP, lb = ap.b.length * AP_STEP;
    const pts: { x: number; z: number; y: number }[] = [];
    const step = AP_STEP;
    for (let t = -la; t <= L + lb + 0.01; t += step) {
      const x = br.a.x + ux * t, z = br.a.z + uz * t;
      const y = t < 0 ? apY(ap.a, -t) : t > L ? apY(ap.b, t - L) : br.deck;                  // the designed vertical profile (5 % at most, viaduct or cut)
      pts.push({ x, z, y });
    }
    const pos: number[] = [], uv: number[] = [], idx: number[] = []; let dist = 0;
    pts.forEach((p, i) => {
      if (i) dist += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
      pos.push(p.x + nx * br.width / 2, p.y, p.z + nz * br.width / 2, p.x - nx * br.width / 2, p.y, p.z - nz * br.width / 2); uv.push(0, dist / 10, 1, dist / 10);
    });
    for (let i = 0; i < pts.length - 1; i++) { const q = i * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
    for (const p of pts) path.push({ x: p.x, z: p.z });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    // the hero bridge draws its own deck over the main span: this ribbon is what the car drives on there, and the visible road on both approaches
    const road = new THREE.Mesh(g, asphalt); road.receiveShadow = true; road.name = br.name + ' road'; group.add(road); decks.push(road);

    // parapets and piers along the approaches (the span has its own)
    const barrierGeo = new THREE.BoxGeometry(2.0, 1.1, 0.5);
    const nb = pts.length;
    const rails = new THREE.InstancedMesh(barrierGeo, rail, nb * 2), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(1, 1, 1), tp = new THREE.Vector3();
    q.setFromAxisAngle(up, Math.atan2(-uz, ux));
    let k = 0;
    pts.forEach((p, i) => { if (i % 1 === 0 && (p.y < br.deck - 0.2 || true)) for (const s of [-1, 1]) { tp.set(p.x + nx * s * (br.width / 2 + 0.2), p.y + 0.55, p.z + nz * s * (br.width / 2 + 0.2)); rails.setMatrixAt(k++, m4.compose(tp, q, sc)); } });
    rails.count = k; rails.castShadow = true; group.add(rails);
    const piers: { x: number; z: number; top: number; bot: number }[] = [];
    pts.forEach((p, i) => {
      const t = i * step - la;
      if (i % 4 === 0 && (t < 0 || t > L)) { const gr = o.ground(p.x, p.z); if (p.y - gr > 4) piers.push({ x: p.x, z: p.z, top: p.y - 1.2, bot: gr - 1.5 }); }
    });
    const pil = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), conc, piers.length * 2 + 1);
    let pk = 0;
    for (const p of piers) for (const s of [-1, 1]) { const h = p.top - p.bot; tp.set(p.x + nx * s * (br.width / 2 - 3.2), p.bot + h / 2, p.z + nz * s * (br.width / 2 - 3.2)); sc.set(2.4, h, 2.4); pil.setMatrixAt(pk++, m4.compose(tp, q, sc)); }
    pil.count = pk; pil.castShadow = pil.receiveShadow = true; group.add(pil);
    // the cross-beam on each pier cap
    const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), conc, piers.length + 1); let ck = 0;
    for (const p of piers) { tp.set(p.x, p.top + 0.3, p.z); sc.set(2.8, 1.5, br.width - 1.5); caps.setMatrixAt(ck++, m4.compose(tp, q, sc)); }
    caps.count = ck; caps.castShadow = true; group.add(caps);
    sc.set(1, 1, 1);
  }
  return { group, decks, path, updateLed: (t, n) => { for (const f of leds) f(t, n); } };
}

/**
 * Reaches of the river that the satellite map has dammed with a bridge: the old crossing is baked into the height map as a strip of land, and we build the real bridge ourselves, so the strip has to go.
 * The river is cut back to its bed along the centre line (half width, with a 70 m bank), lowering only, so the real shores stay where they are.
 */
export const RIVER_REACHES: { name: string; line: number[][]; half: number; bed: number }[] = [
  { name: 'Halcyon crossing', line: [[3830, 2700], [3825, 2790], [3700, 2860], [3560, 2930], [3500, 3020]], half: 215, bed: -4 },
  // the old satellite bridge left a rim of land (its two edges) right under the Halcyon Gateway deck, bank to bank
  { name: 'Halcyon old deck', line: [[3465, 2771], [3960, 2795]], half: 45, bed: -4 },
];

/** where each bridge's approach viaduct comes down to the ground (same rule as buildRiverBridges): roads that use the bridge join it there */
export function bridgeFeet(ground: (x: number, z: number) => number): { name: string; a: { x: number; z: number }; b: { x: number; z: number } }[] {
  return RIVER_BRIDGES.map((br) => {
    const dx = br.b.x - br.a.x, dz = br.b.z - br.a.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, ap = approachesFor(br, ground);
    const la = ap.a.length * AP_STEP, lb = ap.b.length * AP_STEP;
    return { name: br.name, a: { x: br.a.x - ux * la, z: br.a.z - uz * la }, b: { x: br.b.x + ux * lb, z: br.b.z + uz * lb } };
  });
}

/** the bridges' road corridors (approach foot to approach foot), for passes that must leave them alone */
export function bridgeCorridors(ground: (x: number, z: number) => number): { xz: number[][]; r: number }[] {
  return bridgeFeet(ground).map((f, i) => ({ xz: [[f.a.x, f.a.z], [f.b.x, f.b.z]], r: RIVER_BRIDGES[i].width / 2 + 30 }));
}

// ---- approach design ----
// Each approach gets a vertical profile like a highway engineer would draw it: it leaves the deck and meets the natural ground again without ever going steeper than
// 5 %; over low ground it stays up on a viaduct, through high ground it cuts in (6 m at most) and fills the small dips. The profile is the higher of two slope-limited
// lines: the highest line that never rises above the ground (cuts only) and the lowest line that never drops more than 6 m under it and leaves the deck at 5 %. Far
// from the bridge both equal the ground, which is where the approach ends (its foot). Designed once from the ground before the terrain is meshed, then reused.
export const AP_STEP = 10;
const AP_GRADE = 0.05, AP_CUT = 6, AP_MAX = 2600;
const approachCache = new Map<string, { a: number[]; b: number[] }>();

function designApproach(deck: number, g: number[]): number[] {
  const n = g.length, s = AP_GRADE * AP_STEP;
  const hi = g.slice();                                                       // never above the ground
  for (let i = 1; i < n; i++) hi[i] = Math.min(hi[i], hi[i - 1] + s);
  for (let i = n - 2; i >= 0; i--) hi[i] = Math.min(hi[i], hi[i + 1] + s);
  const lo = g.map((v, i) => Math.max(v - AP_CUT, deck - i * s));             // never more than 6 m under, and off the deck at 5 %
  for (let i = 1; i < n; i++) lo[i] = Math.max(lo[i], lo[i - 1] - s);
  for (let i = n - 2; i >= 0; i--) lo[i] = Math.max(lo[i], lo[i + 1] - s);
  const y = hi.map((v, i) => Math.max(v, lo[i])); y[0] = deck;
  // the foot: the first point back on the ground (within 0.6 m) with no viaduct or deep cut in the next 100 m (within 3 m): past the bluff, the road follows the
  // land like the rest of the freeway (the map's 6 m height grid and rolling farmland are too choppy for a tighter test)
  let foot = n - 1;
  for (let i = 20; i < n - 10; i++) { if (Math.abs(y[i] - g[i]) > 0.6) continue; let ok = true; for (let j = i; j < i + 10; j++) if (Math.abs(y[j] - g[j]) > 3) { ok = false; break; } if (ok) { foot = i; break; } }
  return y.slice(0, foot + 1);
}

function approachesFor(br: BridgeDef, ground: (x: number, z: number) => number): { a: number[]; b: number[] } {
  const hit = approachCache.get(br.name); if (hit) return hit;
  const dx = br.b.x - br.a.x, dz = br.b.z - br.a.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, n = AP_MAX / AP_STEP;
  const along = (ox: number, oz: number, sx: number, sz: number): number[] => {
    const raw: number[] = []; for (let i = 0; i <= n; i++) raw.push(ground(ox + sx * i * AP_STEP, oz + sz * i * AP_STEP));
    return raw.map((_, i) => { let a = 0, c = 0; for (let j = Math.max(0, i - 2); j <= Math.min(n, i + 2); j++) { a += raw[j]; c++; } return a / c; });   // 50 m smoothing: the road ignores bumps
  };
  const res = { a: designApproach(br.deck, along(br.a.x, br.a.z, -ux, -uz)), b: designApproach(br.deck, along(br.b.x, br.b.z, ux, uz)) };
  approachCache.set(br.name, res);
  return res;
}
const apY = (ys: number[], t: number): number => { const f = t / AP_STEP, i = Math.min(ys.length - 1, Math.floor(f)), j = Math.min(ys.length - 1, i + 1), u = f - Math.floor(f); return ys[i] * (1 - u) + ys[j] * u; };

/** grade the ground to the approaches: cut down or filled up to the road bed under the carriageway and shoulders, blending out over 30 m; viaducts (road > 4 m over
 *  the ground) are left alone. Runs on the height map before the terrain is meshed, and fixes the designs for everything after. */
function carveApproaches(heights: Float32Array, W: number, H: number, mpp: number): void {
  const sample = (x: number, z: number): number => {
    const fx = Math.min(W - 1.001, Math.max(0, (x - GRID.ox) / mpp + W / 2)), fz = Math.min(H - 1.001, Math.max(0, (z - GRID.oz) / mpp + H / 2)), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    return heights[j * W + i] * (1 - u) * (1 - v) + heights[j * W + i + 1] * u * (1 - v) + heights[(j + 1) * W + i] * (1 - u) * v + heights[(j + 1) * W + i + 1] * u * v;
  };
  approachCache.clear();
  for (const br of RIVER_BRIDGES) {
    const dx = br.b.x - br.a.x, dz = br.b.z - br.a.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, ap = approachesFor(br, sample);
    const half = br.width / 2 + 6, BL = 30;
    for (const [ys, ox, oz, sx, sz] of [[ap.a, br.a.x, br.a.z, -ux, -uz], [ap.b, br.b.x, br.b.z, ux, uz]] as [number[], number, number, number, number][]) {
      const len = (ys.length - 1) * AP_STEP;
      const xs = [ox, ox + sx * len], zs = [oz, oz + sz * len], R = half + BL;
      const i0 = Math.max(0, Math.floor(((Math.min(...xs) - R) - GRID.ox) / mpp + W / 2)), i1 = Math.min(W - 1, Math.ceil(((Math.max(...xs) + R) - GRID.ox) / mpp + W / 2));
      const j0 = Math.max(0, Math.floor(((Math.min(...zs) - R) - GRID.oz) / mpp + H / 2)), j1 = Math.min(H - 1, Math.ceil(((Math.max(...zs) + R) - GRID.oz) / mpp + H / 2));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = (((i - W / 2) * mpp) + GRID.ox) - ox, z = (((j - H / 2) * mpp) + GRID.oz) - oz;
        const t = x * sx + z * sz, d = Math.abs(-x * sz + z * sx);
        if (t < 0 || t > len || d > R) continue;
        const y = apY(ys, t) - 0.3, k = j * W + i, h = heights[k];
        if (y - h > 4) continue;                                                // viaduct: the ground stays
        const w = d <= half ? 1 : 1 - ((d - half) / BL) ** 2 * (3 - 2 * (d - half) / BL);
        const fadeEnd = Math.min(1, (len - t) / 40);                           // melt into the natural ground at the foot
        heights[k] = h + (y - h) * w * Math.min(1, fadeEnd + (d <= half ? 1 : 0));
      }
    }
  }
}

/**
 * A road that crosses the river beside a high bridge (the freeway ran on its own low deck 40-60 m from the Halcyon Gateway, too low for ships) is cut where it meets
 * the river and joined to the bridge's approach feet instead: it climbs onto the bridge and comes down the far side. Each join is a freeway curve: it leaves the road
 * far enough back (at least 2.5x the sideways offset, never under 350 m) and meets the foot in line with the bridge, so there is no kink. Returns the pieces.
 */
export function routeOverBridges(line: number[][], ground: (x: number, z: number) => number, reach = 450): number[][][] {
  let pieces: number[][][] = [line];
  const RIVER_BRIDGE_AXES = RIVER_BRIDGES.map((br) => { const dx = br.b.x - br.a.x, dz = br.b.z - br.a.z, L = Math.hypot(dx, dz); return { ux: dx / L, uz: dz / L }; });
  bridgeFeet(ground).forEach((f, bi) => {
    const { ux, uz } = RIVER_BRIDGE_AXES[bi];
    const next: number[][][] = [];
    for (const pc of pieces) {
      const near = (q: { x: number; z: number }): [number, number] => { let i0 = -1, bd = 1e9; pc.forEach((p, i) => { const d = Math.hypot(p[0] - q.x, p[1] - q.z); if (d < bd) { bd = d; i0 = i; } }); return [i0, bd]; };
      const [ia, da] = near(f.a), [ib, db] = near(f.b);
      if (da > reach || db > reach || ia === ib) { next.push(pc); continue; }
      // walk away from the bridge along the road until a point is far enough back from the foot (outward along the axis) for a gentle curve
      const join = (foot: { x: number; z: number }, ox: number, oz: number, i0: number, dir: number): number => {
        for (let i = i0; i >= 0 && i < pc.length; i += dir) {
          const dx = pc[i][0] - foot.x, dz = pc[i][1] - foot.z, along = dx * ox + dz * oz, side = Math.abs(-dx * oz + dz * ox);
          if (along >= Math.max(350, 2.5 * side)) return i;
        }
        return Math.max(0, Math.min(pc.length - 1, i0 + dir));
      };
      const curve = (p: number[], tp: number[], foot: { x: number; z: number }, tf: number[]): number[][] => {      // cubic from the road point (tangent tp) to the foot (tangent tf)
        const D = Math.hypot(foot.x - p[0], foot.z - p[1]) / 3, out: number[][] = [], n = Math.max(4, Math.ceil(3 * D / 20));
        const c1 = [p[0] + tp[0] * D, p[1] + tp[1] * D], c2 = [foot.x - tf[0] * D, foot.z - tf[1] * D];
        for (let k = 0; k <= n; k++) { const t = k / n, u = 1 - t; out.push([u * u * u * p[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * foot.x, u * u * u * p[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * foot.z]); }
        return out;
      };
      const unit = (q: number[], r: number[]): number[] => { const l = Math.hypot(r[0] - q[0], r[1] - q[1]) || 1; return [(r[0] - q[0]) / l, (r[1] - q[1]) / l]; };
      // which end of the piece lies on the a side: the a foot is reached from the road heading +axis, the b foot is left heading +axis
      const dirA = ia < ib ? -1 : 1, dirB = -dirA;
      const ja = join(f.a, -ux, -uz, ia, dirA), jb = join(f.b, ux, uz, ib, dirB);
      // tangent of the road at the join, pointing towards the bridge
      const ta = unit(pc[ja], pc[Math.max(0, Math.min(pc.length - 1, ja - dirA))]), tb = unit(pc[Math.max(0, Math.min(pc.length - 1, jb - dirB))], pc[jb]);
      const curA = curve(pc[ja], ta, f.a, [ux, uz]);                                    // road → a foot, arriving along +axis
      const curB = curve([f.b.x, f.b.z], [ux, uz], { x: pc[jb][0], z: pc[jb][1] }, tb);  // b foot → road, leaving along +axis
      if (dirA === -1) next.push([...pc.slice(0, ja), ...curA], [...curB, ...pc.slice(jb + 1)]);
      else next.push([...pc.slice(0, jb), ...curB.reverse()], [...curA.reverse(), ...pc.slice(ja + 1)]);
    }
    pieces = next;
  });
  return pieces;
}

export function carveRiverReaches(heights: Float32Array, W: number, H: number, mpp: number): void {
  for (const r of RIVER_REACHES) {
    let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9;
    for (const p of r.line) { mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]); mnz = Math.min(mnz, p[1]); mxz = Math.max(mxz, p[1]); }
    const R = r.half + 70;
    const x0 = Math.max(0, Math.floor(((mnx - R) - GRID.ox) / mpp + W / 2)), x1 = Math.min(W - 1, Math.ceil(((mxx + R) - GRID.ox) / mpp + W / 2));
    const z0 = Math.max(0, Math.floor(((mnz - R) - GRID.oz) / mpp + H / 2)), z1 = Math.min(H - 1, Math.ceil(((mxz + R) - GRID.oz) / mpp + H / 2));
    for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) {
      const x = (((ix - W / 2) * mpp) + GRID.ox), z = (((iz - H / 2) * mpp) + GRID.oz);
      let d = 1e18;
      for (let i = 0; i < r.line.length - 1; i++) {
        const a = r.line[i], b = r.line[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
        d = Math.min(d, Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z));
      }
      if (d > R) continue;
      const k = iz * W + ix, t = Math.min(1, Math.max(0, (d - r.half) / 70)), w = 1 - t * t * (3 - 2 * t);
      const target = heights[k] * (1 - w) + r.bed * w;
      if (target < heights[k]) heights[k] = target;
    }
  }
  carveApproaches(heights, W, H, mpp);
}

/**
 * Grade a road that leaves a bridge foot (the freeway's joining curve) to the same rules as the approach: 5 % at most, cuts of up to 6 m, embankment fill over dips
 * (no viaduct: the road ribbon is draped on the ground, so the ground is built up to it). `poly` starts at the foot; up to `maxLen` metres are graded.
 */
export function gradeFromFoot(heights: Float32Array, W: number, H: number, mpp: number, poly: number[][], half: number, maxLen = 1600): void {
  const sample = (x: number, z: number): number => {
    const fx = Math.min(W - 1.001, Math.max(0, (x - GRID.ox) / mpp + W / 2)), fz = Math.min(H - 1.001, Math.max(0, (z - GRID.oz) / mpp + H / 2)), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    return heights[j * W + i] * (1 - u) * (1 - v) + heights[j * W + i + 1] * u * (1 - v) + heights[(j + 1) * W + i] * (1 - u) * v + heights[(j + 1) * W + i + 1] * u * v;
  };
  const S: number[][] = [];
  for (let i = 0; i < poly.length - 1 && S.length * AP_STEP < maxLen; i++) {
    const a = poly[i], b = poly[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / AP_STEP));
    for (let k = 0; k < n; k++) S.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  if (S.length < 12) return;
  const raw = S.map((p) => sample(p[0], p[1])), n = raw.length - 1;
  const g = raw.map((_, i) => { let a = 0, c = 0; for (let j = Math.max(0, i - 2); j <= Math.min(n, i + 2); j++) { a += raw[j]; c++; } return a / c; });
  const y = designApproach(raw[0], g);
  const BL = 30, R = half + 6 + BL, cell = 40, hash = new Map<number, number[]>();
  y.forEach((_, i) => { const k = Math.floor(S[i][0] / cell) * 8192 + Math.floor(S[i][1] / cell); const a = hash.get(k) ?? []; a.push(i); hash.set(k, a); });
  let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9;
  for (let i = 0; i < y.length; i++) { mnx = Math.min(mnx, S[i][0]); mxx = Math.max(mxx, S[i][0]); mnz = Math.min(mnz, S[i][1]); mxz = Math.max(mxz, S[i][1]); }
  const i0 = Math.max(0, Math.floor(((mnx - R) - GRID.ox) / mpp + W / 2)), i1 = Math.min(W - 1, Math.ceil(((mxx + R) - GRID.ox) / mpp + W / 2));
  const j0 = Math.max(0, Math.floor(((mnz - R) - GRID.oz) / mpp + H / 2)), j1 = Math.min(H - 1, Math.ceil(((mxz + R) - GRID.oz) / mpp + H / 2));
  const len = y.length - 1;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = (((i - W / 2) * mpp) + GRID.ox), z = (((j - H / 2) * mpp) + GRID.oz), cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    let bd = 1e9, bi = -1;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = hash.get((cx + a) * 8192 + cz + b); if (l) for (const q of l) { const d = Math.hypot(S[q][0] - x, S[q][1] - z); if (d < bd) { bd = d; bi = q; } } }
    if (bi < 0 || bd > R) continue;
    const k = j * W + i, h = heights[k], tgt = y[bi] - 0.3;
    if (tgt - h > 14) continue;                                                     // deeper than an embankment should go: leave it
    const d = bd - (half + 6), w = d <= 0 ? 1 : 1 - (d / BL) ** 2 * (3 - 2 * d / BL), fade = Math.min(1, (len - bi) / 4);
    heights[k] = h + (tgt - h) * w * fade;
  }
}

