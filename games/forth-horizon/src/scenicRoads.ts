// Scenic roads (tools/design_scenic_roads.py → region/scenic_roads.json): the festival's designed driving roads (Kettle Pass first). Each road comes with its plan
// (every 4 m), its vertical profile and its banking. Here the ground is graded to the banked road surface, and the road is built: carriageway, gravel shoulders,
// edge and centre lines, guardrails on the outside of tight bends and where the road stands on fill, and piers where it crosses a hollow on a viaduct.
import * as THREE from 'three';
import { GRID } from './grid';

export interface ScenicRoad { name: string; surface: 'paved' | 'gravel'; half: number; speed: number; xz: number[][]; y: number[]; bank: number[] }

const SHOULDER = 1.6, BLEND = 14, MAX_FILL = 8, MAX_CUT = 115;
/** side slope run per metre of height (the smoothstep's steepest pitch is 1.5x the mean): fill ~1:2, cut ~1:1.25 */
const FILL_RUN = 3.2, CUT_RUN = 1.45;              // deep mountain rock cuts (Escarpment Stair & Glacier Pass) cut cleanly all the way down to roadbed level

/** left normal (the side the road turns to when the curvature is positive) */
function frames(r: ScenicRoad): { nx: number[]; nz: number[] } {
  const nx: number[] = [], nz: number[] = [];
  for (let i = 0; i < r.xz.length; i++) {
    const a = r.xz[Math.max(0, i - 1)], b = r.xz[Math.min(r.xz.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    nx.push(-dz / l); nz.push(dx / l);
  }
  return { nx, nz };
}
/** the road surface height at lateral offset s (along the left normal): the inside of a bend is low */
const surf = (r: ScenicRoad, i: number, s: number): number => r.y[i] - s * Math.tan(r.bank[i]);

/** carve the scenic roads into the height grid; returns the cells of their flat band (carriageway, shoulder, mesh-cell clearance): the passes after it
 *  (the road grade pass) must leave those alone */
export function carveScenicRoads(heights: Float32Array, W: number, H: number, mpp: number, roads: ScenicRoad[]): Uint8Array {
  // Pass 1: every grid cell within reach of a road is given to its NEAREST road (over all roads), then graded (fill & cut) to that road's banked surface.
  // Pass 2 (civil-engineering switchback cut): cut-only envelope across all roads so an upper hairpin leg's fill can NEVER spill dirt onto a lower leg,
  // and deep mountain ridges (Escarpment Stair / Crest) are cleanly excavated well past stride-2 (12 m) terrain mesh triangles.
  const bestD = new Float32Array(W * H), bestI = new Int32Array(W * H), bestS = new Float32Array(W * H), bestR = new Int16Array(W * H), touched: number[] = [];
  // flat to the road surface 2.5 height-grid cells (>1 full stride-2 12 m terrain triangle) past the shoulder so cut-slope vertices NEVER bulge through the deck
  const fr = roads.map((r) => frames(r)), full = roads.map((r) => r.half + SHOULDER + mpp * 2.5);
  // where the road itself is on a viaduct (its centre more than MAX_FILL over the uncarved ground) the hollow under it stays; anywhere else a gully
  // beside the road is filled as embankment (it used to stay a pit just past the shoulder, which a wheel dropped into)
  const viaduct = roads.map((r) => r.xz.map((p, q) => {
    const i = Math.round((p[0] - GRID.ox) / mpp + W / 2), j = Math.round((p[1] - GRID.oz) / mpp + H / 2);
    return i >= 0 && j >= 0 && i < W && j < H && surf(r, q, 0) - heights[j * W + i] > MAX_FILL;
  }));
  roads.forEach((r, ri) => {
    const { nx, nz } = fr[ri], reach = full[ri] + Math.max(BLEND, MAX_FILL * FILL_RUN, 72), rc = Math.ceil(reach / mpp);
    for (let q = 0; q < r.xz.length; q++) {
      const ci = Math.round((r.xz[q][0] - GRID.ox) / mpp + W / 2), cj = Math.round((r.xz[q][1] - GRID.oz) / mpp + H / 2);
      for (let j = Math.max(0, cj - rc); j <= Math.min(H - 1, cj + rc); j++) for (let i = Math.max(0, ci - rc); i <= Math.min(W - 1, ci + rc); i++) {
        const k = j * W + i, dx = (((i - W / 2) * mpp) + GRID.ox) - r.xz[q][0], dz = (((j - H / 2) * mpp) + GRID.oz) - r.xz[q][1], d = Math.hypot(dx, dz);
        if (d > reach) continue;
        if (bestD[k] === 0) touched.push(k);
        if (bestD[k] === 0 || d + 1 < bestD[k]) { bestD[k] = d + 1; bestI[k] = q; bestS[k] = dx * nx[q] + dz * nz[q]; bestR[k] = ri; }
      }
    }
  });
  const flat = new Uint8Array(W * H);
  for (const k of touched) {
    const r = roads[bestR[k]], d = bestD[k] - 1, q = bestI[k], s = Math.max(-r.half - SHOULDER, Math.min(r.half + SHOULDER, bestS[k]));   // beyond the shoulder the ground holds the shoulder's height
    const h = heights[k], tgt = surf(r, q, s) - 0.44;
    if (viaduct[bestR[k]][q]) continue;                                                 // a viaduct carries the road here: the hollow stays
    const t = Math.min(h + MAX_FILL, Math.max(h - MAX_CUT, tgt));
    const bl = Math.max(BLEND, Math.min(72, Math.abs(t - h) * (t > h ? FILL_RUN : CUT_RUN)));
    const out = d - full[bestR[k]], w = out <= 0 ? 1 : out >= bl ? 0 : 1 - (out / bl) ** 2 * (3 - 2 * out / bl);
    heights[k] = h + (t - h) * w;
    if (out <= 0) flat[k] = 1;
  }
  // Pass 2: cut-only clearance envelope across all scenic roads (lower road cut always wins over upper switchback fill or ridge bulge)
  roads.forEach((r, ri) => {
    const { nx, nz } = fr[ri];
    const fBand = full[ri], cutReach = fBand + 46, rc = Math.ceil(cutReach / mpp);
    for (let q = 0; q < r.xz.length; q++) {
      if (viaduct[ri][q]) continue;
      const px = r.xz[q][0], pz = r.xz[q][1];
      const ci = Math.round((px - GRID.ox) / mpp + W / 2), cj = Math.round((pz - GRID.oz) / mpp + H / 2);
      for (let j = Math.max(0, cj - rc); j <= Math.min(H - 1, cj + rc); j++) for (let i = Math.max(0, ci - rc); i <= Math.min(W - 1, ci + rc); i++) {
        const k = j * W + i, dx = (((i - W / 2) * mpp) + GRID.ox) - px, dz = (((j - H / 2) * mpp) + GRID.oz) - pz, d = Math.hypot(dx, dz);
        if (d > cutReach) continue;
        const s = Math.max(-r.half - SHOULDER, Math.min(r.half + SHOULDER, dx * nx[q] + dz * nz[q]));
        const tgt = surf(r, q, s) - 0.44;
        const h = heights[k];
        if (h <= tgt) continue;
        const out = d - fBand;
        if (out <= 0) {
          heights[k] = tgt;
          flat[k] = 1;
        } else if (!flat[k]) {
          const bl = Math.max(16, Math.min(46, (h - tgt) * CUT_RUN));
          if (out < bl) {
            const u = out / bl, w = 1 - u * u * (3 - 2 * u);
            const nh = h + (tgt - h) * w;
            if (nh < h) heights[k] = nh;
          }
        }
      }
    }
  });
  return flat;
}

/** a guardrail segment the car collides with: from a to b at height y; (ox, oz) points away from the road */
export interface RailSeg { ax: number; az: number; bx: number; bz: number; y: number; ox: number; oz: number }
const RAIL_CELL = 10;
/** spatial hash of rail segments (10 m cells) */
export function railIndex(segs: RailSeg[]): Map<number, RailSeg[]> {
  const m = new Map<number, RailSeg[]>(), key = (i: number, j: number) => (i + 4096) * 8192 + (j + 4096);
  for (const g of segs) {
    const i0 = Math.floor(Math.min(g.ax, g.bx) / RAIL_CELL), i1 = Math.floor(Math.max(g.ax, g.bx) / RAIL_CELL), j0 = Math.floor(Math.min(g.az, g.bz) / RAIL_CELL), j1 = Math.floor(Math.max(g.az, g.bz) / RAIL_CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = key(i, j); const l = m.get(k); if (l) l.push(g); else m.set(k, [g]); }
  }
  return m;
}
/** how far the point (x, y, z) is past a guardrail (0 when it is not), and the rail's outward normal: a car corner on the deck side is free, one
 *  up to 1.5 m past the rail line at the rail's height is pushed back (a car on the ground under a viaduct, or well beyond, is not caught) */
export function railPenetration(idx: Map<number, RailSeg[]>, x: number, y: number, z: number): { d: number; ox: number; oz: number } {
  const l = idx.get((Math.floor(x / RAIL_CELL) + 4096) * 8192 + (Math.floor(z / RAIL_CELL) + 4096));
  let d = 0, ox = 0, oz = 0;
  if (!l) return { d, ox, oz };
  for (const g of l) {
    if (Math.abs(y - g.y) > 2.2) continue;
    const ex = g.bx - g.ax, ez = g.bz - g.az, L2 = ex * ex + ez * ez || 1, t = ((x - g.ax) * ex + (z - g.az) * ez) / L2;
    if (t < -0.05 || t > 1.05) continue;
    const lat = (x - g.ax) * g.ox + (z - g.az) * g.oz;                          // past the rail line, measured outward
    if (lat > 0 && lat < 1.5 && lat > d) { d = lat; ox = g.ox; oz = g.oz; }
  }
  return { d, ox, oz };
}

export function buildScenicRoads(roads: ScenicRoad[], ground: (x: number, z: number) => number, roadMat?: THREE.Material, keepClear: number[][][] = []): { group: THREE.Group; decks: THREE.Mesh[]; rails: RailSeg[] } {
  // no guardrail across another road's mouth: rails stay 10 m clear of every other road's centreline (junctions, crossings)
  const clear = new Map<number, number[]>(), ck = (x: number, z: number) => (Math.floor(x / 10) + 4096) * 8192 + (Math.floor(z / 10) + 4096);
  const addClear = (pts: number[][], id: number) => { for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[Math.min(pts.length - 1, i + 1)], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 4)); for (let k = 0; k < n; k++) { const x = a[0] + (b[0] - a[0]) * k / n, z = a[1] + (b[1] - a[1]) * k / n, key = ck(x, z); const l = clear.get(key); if (l) l.push(x, z, id); else clear.set(key, [x, z, id]); } } };
  roads.forEach((r, k) => addClear(r.xz, k)); keepClear.forEach((p) => addClear(p, -1));
  const nearOther = (x: number, z: number, self: number): boolean => {
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = clear.get(ck(x + i * 10, z + j * 10)); if (!l) continue; for (let q = 0; q < l.length; q += 3) if (l[q + 2] !== self && (l[q] - x) ** 2 + (l[q + 1] - z) ** 2 < 100) return true; }
    return false;
  };
  const railSegs: RailSeg[] = [];
  const group = new THREE.Group(); group.name = 'scenic-roads';
  const decks: THREE.Mesh[] = [];
  const asphaltBase = roadMat ? (roadMat as THREE.MeshStandardMaterial).clone() : new THREE.MeshStandardMaterial({ color: 0x2c2d30, roughness: 0.88 });
  asphaltBase.polygonOffset = true; asphaltBase.polygonOffsetFactor = -4; asphaltBase.polygonOffsetUnits = -6;
  const gravel = new THREE.MeshStandardMaterial({ color: 0x8b8274, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const white = new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -8 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xe0b020, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -8 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xb4b9be, metalness: 0.6, roughness: 0.45 });
  const conc = new THREE.MeshStandardMaterial({ color: 0x8e8c87, roughness: 0.92, side: THREE.DoubleSide });
  roads.forEach((r, self) => {
    const { nx, nz } = frames(r), n = r.xz.length;
    // a strip between two lateral offsets, following the banked surface (lift above it in metres); dash = [on, off] in samples
    const strip = (s0: number, s1: number, lift: number, mat: THREE.Material, dash?: [number, number]): THREE.Mesh => {
      const pos: number[] = [], uv: number[] = [], idx: number[] = []; let dist = 0;
      for (let i = 0; i < n; i++) {
        if (i) dist += Math.hypot(r.xz[i][0] - r.xz[i - 1][0], r.xz[i][1] - r.xz[i - 1][1]);
        const [x, z] = r.xz[i];
        pos.push(x + nx[i] * s0, surf(r, i, s0) + lift, z + nz[i] * s0, x + nx[i] * s1, surf(r, i, s1) + lift, z + nz[i] * s1); uv.push(0, dist / 8, 1, dist / 8);
      }
      for (let i = 0; i < n - 1; i++) { if (dash && i % (dash[0] + dash[1]) >= dash[0]) continue; const q = i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat); m.receiveShadow = true; group.add(m); return m;
    };
    const road = strip(-r.half, r.half, 0.18, r.surface === 'paved' ? asphaltBase : gravel); road.name = r.name; decks.push(road);
    decks.push(strip(r.half, r.half + SHOULDER, 0.06, gravel), strip(-r.half - SHOULDER, -r.half, 0.06, gravel));
    if (r.surface === 'paved') {
      strip(r.half - 0.35, r.half - 0.2, 0.20, white); strip(-r.half + 0.2, -r.half + 0.35, 0.20, white);
      strip(-0.2, -0.08, 0.20, yellow); strip(0.08, 0.2, 0.20, yellow);                  // double yellow: no passing on a pass
    }
    // Engineered concrete/rock retaining toe-walls along deep uphill mountain cuts (holds back the escarpment slope cleanly!)
    {
      const wPos: number[] = [], wIdx: number[] = [];
      const wallOff = r.half + SHOULDER + 0.85;
      for (const side of [-1, 1]) {
        for (let i = 0; i < n - 1; i++) {
          const ax = r.xz[i][0] + nx[i] * side * wallOff, az = r.xz[i][1] + nz[i] * side * wallOff;
          const bx = r.xz[i + 1][0] + nx[i + 1] * side * wallOff, bz = r.xz[i + 1][1] + nz[i + 1] * side * wallOff;
          if (nearOther(ax, az, self) || nearOther(bx, bz, self)) continue;
          const ya = surf(r, i, side * (r.half + SHOULDER)), yb = surf(r, i + 1, side * (r.half + SHOULDER));
          const ga = ground(ax + nx[i] * side * 3.5, az + nz[i] * side * 3.5);
          const gb = ground(bx + nx[i + 1] * side * 3.5, bz + nz[i + 1] * side * 3.5);
          if (ga - ya < 1.6 && gb - yb < 1.6) continue;
          const topA = Math.min(ya + 7.5, Math.max(ya + 1.4, ga + 0.5));
          const topB = Math.min(yb + 7.5, Math.max(yb + 1.4, gb + 0.5));
          const b0 = wPos.length / 3;
          wPos.push(ax, ya - 0.5, az, ax, topA, az, bx, yb - 0.5, bz, bx, topB, bz);
          wIdx.push(b0, b0 + 2, b0 + 1, b0 + 1, b0 + 2, b0 + 3);
        }
      }
      if (wIdx.length) {
        const wg = new THREE.BufferGeometry();
        wg.setAttribute('position', new THREE.Float32BufferAttribute(wPos, 3));
        wg.setIndex(wIdx);
        wg.computeVertexNormals();
        const wm = new THREE.Mesh(wg, conc); wm.receiveShadow = wm.castShadow = true; group.add(wm);
      }
    }
    // guardrails: outside of bends tighter than 120 m, and wherever the road stands 2 m or more over the ground beside it
    const rails: { i: number; side: number }[] = [];
    for (let i = 2; i < n - 2; i += 1) {
      const a = r.xz[i - 2], b = r.xz[i], c = r.xz[i + 2];
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]), l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]), l3 = Math.hypot(c[0] - a[0], c[1] - a[1]);
      const R = (l1 * l2 * l3) / Math.max(1e-6, 2 * Math.abs(cross));
      for (const side of [-1, 1]) {
        const s = side * (r.half + SHOULDER - 0.4), x = b[0] + nx[i] * s, z = b[1] + nz[i] * s;
        const drop = surf(r, i, s) - ground(x + nx[i] * side * 3, z + nz[i] * side * 3);
        const outside = R < 120 && Math.sign(cross) === -side;                            // the bend turns to the left normal when cross > 0: the outside is the other side
        if ((outside || drop > 2) && !nearOther(x, z, self)) rails.push({ i, side });
      }
    }
    // a guardrail starts before the hazard and runs on past it (~16 m each way): a car already running wide on the verge must meet the rail's
    // face, not arrive beside it (one that ran wide into a viaduct gully used to pass outside the rail's start)
    {
      const has = new Set(rails.map((q) => q.i * 2 + (q.side > 0 ? 1 : 0)));
      for (const q of rails.slice()) for (let k = -4; k <= 4; k++) {
        const i = q.i + k, key = i * 2 + (q.side > 0 ? 1 : 0);
        if (i < 2 || i >= n - 2 || has.has(key)) continue;
        const s = q.side * (r.half + SHOULDER - 0.4);
        if (nearOther(r.xz[i][0] + nx[i] * s, r.xz[i][1] + nz[i] * s, self)) continue;
        has.add(key); rails.push({ i, side: q.side });
      }
    }
    if (rails.length) {
      const post = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.75, 0.14), steel, rails.length);
      const beam = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.32, 4.1), steel, rails.length);
      const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
      rails.forEach(({ i, side }, k) => {
        const s = side * (r.half + SHOULDER - 0.4), x = r.xz[i][0] + nx[i] * s, z = r.xz[i][1] + nz[i] * s, y = surf(r, i, s);
        qt.setFromAxisAngle(up, Math.atan2(-nz[i], nx[i]));                            // the beam's long axis (local z) along the road: (sin, cos) of this is the tangent (-nz, nx)
        post.setMatrixAt(k, m4.compose(p.set(x, y + 0.375, z), qt, one));
        beam.setMatrixAt(k, m4.compose(p.set(x - nx[i] * side * 0.1, y + 0.6, z - nz[i] * side * 0.1), qt, one));
      });
      post.castShadow = beam.castShadow = true; group.add(post, beam);
      for (const { i, side } of rails) {
        if (i >= n - 1) continue;
        const s0 = side * (r.half + SHOULDER - 0.5);
        railSegs.push({ ax: r.xz[i][0] + nx[i] * s0, az: r.xz[i][1] + nz[i] * s0, bx: r.xz[i + 1][0] + nx[i + 1] * s0, bz: r.xz[i + 1][1] + nz[i + 1] * s0, y: surf(r, i, s0), ox: nx[i] * side, oz: nz[i] * side });
      }
    }
    // piers where the road crosses a hollow on a viaduct (more than 4 m over the ground)
    const piers: number[][] = [];
    for (let i = 0; i < n; i += 5) { const g = ground(r.xz[i][0], r.xz[i][1]); if (r.y[i] - g > 4) piers.push([i, g]); }
    if (piers.length) {
      const pm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), conc, piers.length * 2);
      const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), sc = new THREE.Vector3(); let k = 0;
      for (const [i, g] of piers) for (const side of [-1, 1]) {
        const s = side * (r.half - 1), x = r.xz[i][0] + nx[i] * s, z = r.xz[i][1] + nz[i] * s, top = surf(r, i, s) - 0.4, h = top - (g - 1);
        qt.setFromAxisAngle(up, Math.atan2(-nz[i], nx[i])); pm.setMatrixAt(k++, m4.compose(p.set(x, g - 1 + h / 2, z), qt, sc.set(1.4, h, 1.4)));
      }
      pm.castShadow = true; group.add(pm);
      // the deck's underside so the viaduct reads as a structure, not a floating ribbon
      const und = strip(-r.half - SHOULDER, r.half + SHOULDER, -0.9, conc); und.material = conc;
    }
  });
  return { group, decks, rails: railSegs };
}

/** corridor of every scenic road (for passes that must leave them alone) */
export function scenicCorridors(roads: ScenicRoad[]): { xz: number[][]; r: number }[] {
  return roads.map((r) => ({ xz: r.xz.filter((_, i) => i % 3 === 0), r: r.half + SHOULDER + 10 }));
}
