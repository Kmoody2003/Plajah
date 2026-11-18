// Scenic roads (tools/design_scenic_roads.py → region/scenic_roads.json): the festival's designed driving roads (Kettle Pass first). Each road comes with its plan
// (every 4 m), its vertical profile and its banking. Here the ground is graded to the banked road surface, and the road is built: carriageway, gravel shoulders,
// edge and centre lines, guardrails on the outside of tight bends and where the road stands on fill, and piers where it crosses a hollow on a viaduct.
import * as THREE from 'three';
import { GRID } from './grid';

export interface ScenicRoad { name: string; surface: 'paved' | 'gravel'; half: number; speed: number; xz: number[][]; y: number[]; bank: number[] }

const SHOULDER = 1.6, BLEND = 14, MAX_FILL = 8, MAX_CUT = 24;              // a cliff road is cut into the rock (the coast highway designs cuts up to ~20 m)

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

export function carveScenicRoads(heights: Float32Array, W: number, H: number, mpp: number, roads: ScenicRoad[]): void {
  const bestD = new Float32Array(W * H), bestI = new Int32Array(W * H), bestS = new Float32Array(W * H);
  for (const r of roads) {
    const { nx, nz } = frames(r), full = r.half + SHOULDER + mpp * 1.2, reach = full + BLEND, rc = Math.ceil(reach / mpp), touched: number[] = [];
    for (let q = 0; q < r.xz.length; q++) {
      const ci = Math.round((r.xz[q][0] - GRID.ox) / mpp + W / 2), cj = Math.round((r.xz[q][1] - GRID.oz) / mpp + H / 2);
      for (let j = Math.max(0, cj - rc); j <= Math.min(H - 1, cj + rc); j++) for (let i = Math.max(0, ci - rc); i <= Math.min(W - 1, ci + rc); i++) {
        const k = j * W + i, dx = (((i - W / 2) * mpp) + GRID.ox) - r.xz[q][0], dz = (((j - H / 2) * mpp) + GRID.oz) - r.xz[q][1], d = Math.hypot(dx, dz);
        if (d > reach) continue;
        if (bestD[k] === 0) touched.push(k);
        if (bestD[k] === 0 || d + 1 < bestD[k]) { bestD[k] = d + 1; bestI[k] = q; bestS[k] = dx * nx[q] + dz * nz[q]; }
      }
    }
    for (const k of touched) {
      const d = bestD[k] - 1, q = bestI[k], s = Math.max(-r.half - SHOULDER, Math.min(r.half + SHOULDER, bestS[k]));   // beyond the shoulder the ground holds the shoulder's height bestD[k] = 0;
      const h = heights[k], tgt = surf(r, q, s) - 0.12;
      if (tgt - h > MAX_FILL) continue;                                                 // a viaduct carries the road here: the hollow stays
      const t = Math.min(h + MAX_FILL, Math.max(h - MAX_CUT, tgt));
      // flat to the road surface one grid cell past the shoulder: the terrain mesh (6 m grid) cannot bulge over the road
      const out = d - full, w = out <= 0 ? 1 : 1 - (out / BLEND) ** 2 * (3 - 2 * out / BLEND);
      heights[k] = h + (t - h) * w;
    }
  }
}

export function buildScenicRoads(roads: ScenicRoad[], ground: (x: number, z: number) => number, roadMat?: THREE.Material): { group: THREE.Group; decks: THREE.Mesh[] } {
  const group = new THREE.Group(); group.name = 'scenic-roads';
  const decks: THREE.Mesh[] = [];
  const asphalt = roadMat ?? new THREE.MeshStandardMaterial({ color: 0x2c2d30, roughness: 0.88 });
  const gravel = new THREE.MeshStandardMaterial({ color: 0x8b8274, roughness: 1 });
  const white = new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xe0b020, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xb4b9be, metalness: 0.6, roughness: 0.45 });
  const conc = new THREE.MeshStandardMaterial({ color: 0x9a9893, roughness: 0.92 });
  for (const r of roads) {
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
    const road = strip(-r.half, r.half, 0.05, r.surface === 'paved' ? asphalt : gravel); road.name = r.name; decks.push(road);
    decks.push(strip(r.half, r.half + SHOULDER, 0.0, gravel), strip(-r.half - SHOULDER, -r.half, 0.0, gravel));
    if (r.surface === 'paved') {
      strip(r.half - 0.35, r.half - 0.2, 0.06, white); strip(-r.half + 0.2, -r.half + 0.35, 0.06, white);
      strip(-0.2, -0.08, 0.06, yellow); strip(0.08, 0.2, 0.06, yellow);                  // double yellow: no passing on a pass
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
        if (outside || drop > 2) rails.push({ i, side });
      }
    }
    if (rails.length) {
      const post = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.75, 0.14), steel, rails.length);
      const beam = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.32, 4.1), steel, rails.length);
      const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
      rails.forEach(({ i, side }, k) => {
        const s = side * (r.half + SHOULDER - 0.4), x = r.xz[i][0] + nx[i] * s, z = r.xz[i][1] + nz[i] * s, y = surf(r, i, s);
        qt.setFromAxisAngle(up, Math.atan2(-nz[i], nx[i]) + Math.PI / 2);
        post.setMatrixAt(k, m4.compose(p.set(x, y + 0.375, z), qt, one));
        beam.setMatrixAt(k, m4.compose(p.set(x - nx[i] * side * 0.1, y + 0.6, z - nz[i] * side * 0.1), qt, one));
      });
      post.castShadow = beam.castShadow = true; group.add(post, beam);
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
  }
  return { group, decks };
}

/** corridor of every scenic road (for passes that must leave them alone) */
export function scenicCorridors(roads: ScenicRoad[]): { xz: number[][]; r: number }[] {
  return roads.map((r) => ({ xz: r.xz.filter((_, i) => i % 3 === 0), r: r.half + SHOULDER + 10 }));
}
