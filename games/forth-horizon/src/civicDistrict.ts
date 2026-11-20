import * as THREE from 'three';
import { amphitheatreBowl, bench, botanicalGlasshouse, festivalStage, flowerBed, fountain, glassMuseum, grandCivicBuilding, monument, operaHall, palmTree, pier, pontoon, promenadeLamp, sculpture, stoneEmbankment, yacht, SAND_COLOUR } from './library/civic';
import { seeded } from './library/kit';

/**
 * The civic riverfront on the east bank (region/civic_riverfront.json, tools/plan_civic_riverfront.py; Kenne's civic riverfront maps and sheets):
 *  - the whole bank: a stone-paved promenade with a stone embankment at the water, lamps, palms and benches (downtown's frontage gets only this);
 *  - Opera & Marina: the opera hall facing the river, a marina of pontoons with moored yachts;
 *  - Museum Plaza & Botanical Gardens: the museum of science and art, the glass museum pavilions, the glasshouse conservatory, a plaza fountain, the
 *    ferry pier;
 *  - Concert Amphitheatre & Urban Beach: the amphitheatre bowl and its festival stage, a sand beach along the water, the beach pier;
 *  - Civic Parklands: the civic monument, flower beds, fountains and sculptures.
 * Every piece stands where nothing else is (no road, building, course or water under it) and faces the river.
 */
export interface CivicPlan { shore: number[][]; sectors: { id: string; name: string; z: number[]; promenadeOnly?: boolean }[] }
export interface CivicOpts {
  plan: CivicPlan;
  ground: (x: number, z: number) => number;
  water: (x: number, z: number) => boolean;
  blocked: (x: number, z: number, r: number) => boolean;
}

export function buildCivicRiverfront(o: CivicOpts): { group: THREE.Group; counts: Record<string, number>; spots: Record<string, [number, number, number]> } {
  const group = new THREE.Group(); group.name = 'civic-riverfront';
  const S = o.plan.shore, n = S.length, rnd = seeded(5521), counts: Record<string, number> = {}, spots: Record<string, [number, number, number]> = {};
  const placed: { x: number; z: number; r: number }[] = [];
  // at each shore point: the direction along the bank (south) and the direction inland (away from the water)
  const frame = S.map((p, i) => {
    const a = S[Math.max(0, i - 1)], b = S[Math.min(n - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
    let nx = -tz, nz = tx; if (o.water(p[0] + nx * 40, p[1] + nz * 40)) { nx = -nx; nz = -nz; }
    return { x: p[0], z: p[1], tx, tz, nx, nz };
  });
  const at = (z: number): typeof frame[number] => { let best = frame[0]; for (const f of frame) if (Math.abs(f.z - z) < Math.abs(best.z - z)) best = f; return best; };
  const free = (x: number, z: number, r: number, onWater = false): boolean => {
    if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + r)) return false;
    for (const [a, b] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r * 0.7, r * 0.7], [-r * 0.7, r * 0.7], [r * 0.7, -r * 0.7], [-r * 0.7, -r * 0.7]]) {
      if (onWater ? !o.water(x + a, z + b) : o.water(x + a, z + b)) return false;
      if (!onWater && o.blocked(x + a, z + b, 1)) return false;
    }
    return true;
  };
  const put = (obj: THREE.Object3D, x: number, z: number, ry: number, r: number, kind: string, y?: number): void => {
    obj.position.set(x, y ?? o.ground(x, z) - 0.05, z); obj.rotation.y = ry; group.add(obj); placed.push({ x, z, r }); counts[kind] = (counts[kind] ?? 0) + 1;
  };
  /** a landmark of radius r near shore z0, `off` metres inland (trying further in and along the bank until it fits), its front facing the river */
  const landmark = (z0: number, off: number, r: number, make: () => THREE.Object3D, kind: string): boolean => {
    for (const dz of [0, 60, -60, 120, -120, 180, -180, 240, -240, 300, -300]) for (let d = off; d < off + 320; d += 20) {
      const f = at(z0 + dz), x = f.x + f.nx * d, z = f.z + f.nz * d;
      if (!free(x, z, r)) continue;
      put(make(), x, z, Math.atan2(-f.nx, -f.nz), r, kind); spots[kind] = [x, o.ground(x, z), z]; return true;
    }
    return false;
  };

  // ---- the promenade, the whole bank: paving, the embankment at the water, lamps, palms, benches ----
  {
    const pave: number[] = [], idx: number[] = [];
    let acc = 0, lampAcc = 0, palmAcc = 0, benchAcc = 0;
    for (let i = 0; i < n - 1; i++) {
      const A = frame[i], B = frame[i + 1], L = Math.hypot(B.x - A.x, B.z - A.z);
      for (let s = 0; s < L; s += 10) {
        const t = s / L, x = A.x + (B.x - A.x) * t, z = A.z + (B.z - A.z) * t, nx = A.nx + (B.nx - A.nx) * t, nz = A.nz + (B.nz - A.nz) * t, tx = A.tx, tz = A.tz;
        acc += 10; lampAcc += 10; palmAcc += 10; benchAcc += 10;
        const px = x + nx * 9, pz = z + nz * 9;                                                     // promenade centre, 9 m in from the water's edge
        if (o.blocked(px, pz, 6) || o.water(px, pz)) continue;
        // a 14 m strip of paving, 10 m long
        const b0 = pave.length / 3;
        for (const [u, v] of [[-5, -7], [5, -7], [-5, 7], [5, 7]]) { const qx = px + tx * u + nx * v, qz = pz + tz * u + nz * v; pave.push(qx, o.ground(qx, qz) + 0.07, qz); }
        idx.push(b0, b0 + 2, b0 + 1, b0 + 1, b0 + 2, b0 + 3);
        if (acc >= 40) { acc = 0; const ex = x + nx * 1.5, ez = z + nz * 1.5; if (o.blocked(ex, ez, 2)) continue; const e = stoneEmbankment(40, 4); put(e, ex, ez, Math.atan2(-nx, -nz), 0, 'embankment', o.ground(ex, ez)); }
        if (lampAcc >= 30) { lampAcc = 0; const lx = x + nx * 3, lz = z + nz * 3; if (!o.water(lx, lz) && !o.blocked(lx, lz, 1)) put(promenadeLamp(), lx, lz, 0, 0, 'lamp'); }
        if (palmAcc >= 20) { palmAcc = 0; const lx = x + nx * 15, lz = z + nz * 15; if (!o.blocked(lx, lz, 2) && !o.water(lx, lz)) put(palmTree(Math.floor(rnd() * 999), 9 + rnd() * 4), lx, lz, 0, 0, 'palm'); }
        if (benchAcc >= 45) { benchAcc = 0; const lx = x + nx * 6, lz = z + nz * 6; if (!o.blocked(lx, lz, 1)) put(bench(), lx, lz, Math.atan2(-nx, -nz), 0, 'bench'); }
      }
    }
    if (idx.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pave, 3)); g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xd8ccb2, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); m.receiveShadow = true; m.name = 'promenade-paving'; group.add(m);
    }
  }

  const sec = (id: string): { z: number[] } | undefined => o.plan.sectors.find((s) => s.id === id);

  // ---- Opera & Marina ----
  const s1 = sec('opera_marina');
  if (s1) {
    const zm = (s1.z[0] + s1.z[1]) / 2;
    landmark(zm - 120, 70, 100, () => operaHall(1), 'opera hall');
    // the marina: pontoons square to the bank out into the water, yachts at the fingers
    const f = at(zm + 160);
    for (let k = -2; k <= 2; k++) {
      const bx = f.x + f.tx * k * 42, bz = f.z + f.tz * k * 42, len = 110, cx = bx - f.nx * (len / 2 + 6), cz = bz - f.nz * (len / 2 + 6);
      if (!o.water(cx, cz) || !o.water(bx - f.nx * (len + 8), bz - f.nz * (len + 8))) continue;
      put(pontoon(len, 13), cx, cz, Math.atan2(-f.nx, -f.nz), 20, 'pontoon', 1.3);
      for (let z = -len / 2 + 8; z < len / 2 - 4; z += 12) for (const sd of [-1, 1]) {
        if (rnd() < 0.3) continue;
        const L = 16 + rnd() * 18, ox = cx - f.nx * z + f.tx * sd * (L * 0.1 + 9), oz = cz - f.nz * z + f.tz * sd * (L * 0.1 + 9);
        const y = yacht(Math.floor(rnd() * 9999), L); y.position.set(ox, 1.0, oz); y.rotation.y = Math.atan2(-f.nx, -f.nz) + (rnd() < 0.5 ? 0 : Math.PI); group.add(y); counts.yacht = (counts.yacht ?? 0) + 1;
      }
    }
    spots.marina = [f.x - f.nx * 60, 6, f.z - f.nz * 60];
  }
  // ---- Museum Plaza & Botanical Gardens ----
  const s2 = sec('museum_gardens');
  if (s2) {
    landmark(s2.z[0] + 140, 60, 52, () => grandCivicBuilding(2), 'museum of science and art');
    landmark(s2.z[0] + 380, 50, 60, () => glassMuseum(3), 'glass museum');
    landmark(s2.z[1] - 220, 80, 60, () => botanicalGlasshouse(4), 'botanical glasshouse');
    landmark(s2.z[0] + 270, 40, 7, () => fountain(6), 'plaza fountain');
    const f = at((s2.z[0] + s2.z[1]) / 2); if (!o.blocked(f.x, f.z, 6)) put(pier(120, 12), f.x - f.nx * 62, f.z - f.nz * 62, Math.atan2(-f.nx, -f.nz), 0, 'ferry pier', 0);
  }
  // ---- Concert Amphitheatre & Urban Beach ----
  const s3 = sec('amphitheatre_beach');
  if (s3) {
    const zs = s3.z[0] + 220;
    // the stage and the bowl face each other: the stage inland, the bowl opening toward it from the river side
    if (landmark(zs, 140, 70, () => festivalStage(5), 'festival stage')) {                    // 70 m clear: the bowl round it
      // the bowl is centred on the stage and turned with it: its terraces rise toward the river, every seat facing the stage
      const st = spots['festival stage'], f = at(zs);
      const b = amphitheatreBowl(28, 90, 24); b.position.set(st[0], st[1] - 0.05, st[2]); b.rotation.y = Math.atan2(-f.nx, -f.nz); group.add(b); counts['amphitheatre bowl'] = 1;
      spots.amphitheatre = [st[0] - f.nx * 60, st[1], st[2] - f.nz * 60];
    }
    // the beach: sand along the water from the sector's middle to its end, 45 m deep
    const pos: number[] = [], idx: number[] = [];
    for (const f of frame) {
      if (f.z < s3.z[0] + 320 || f.z > s3.z[1]) continue;
      const b0 = pos.length / 3;
      for (const d of [-4, 45]) { const x = f.x + f.nx * d, z = f.z + f.nz * d; pos.push(x, Math.max(o.ground(x, z), 1.6) + 0.09, z); }
      if (b0 > 0) idx.push(b0 - 2, b0, b0 - 1, b0 - 1, b0, b0 + 1);
    }
    if (idx.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: SAND_COLOUR, roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })); m.name = 'urban-beach'; m.receiveShadow = true; group.add(m); counts.beach = 1; }
    const f = at(s3.z[1] - 200); if (!o.blocked(f.x, f.z, 6)) put(pier(170, 9), f.x - f.nx * 86, f.z - f.nz * 86, Math.atan2(-f.nx, -f.nz), 0, 'beach pier', 0); spots.beach = [f.x + f.nx * 20, 3, f.z + f.nz * 20];
  }
  // ---- Civic Parklands ----
  const s4 = sec('parklands');
  if (s4) {
    landmark((s4.z[0] + s4.z[1]) / 2, 80, 10, () => monument(30), 'civic monument');
    for (let k = 0; k < 14; k++) landmark(s4.z[0] + 40 + k * 60, 30 + (k % 3) * 30, 4, () => flowerBed(k, 6 + (k % 3), 2.2), 'flower bed');
    for (let k = 0; k < 3; k++) landmark(s4.z[0] + 150 + k * 260, 60, 6, () => fountain(5), 'fountain');
    for (let k = 0; k < 4; k++) landmark(s4.z[0] + 100 + k * 200, 45, 2, () => sculpture(k), 'sculpture');
  }
  return { group, counts, spots };
}
