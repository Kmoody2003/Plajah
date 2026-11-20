import * as THREE from 'three';
import { bulkWarehouse, containerBlock, controlTower, customsBuilding, distillationTower, flareStack, hortonSphere, locomotive, logisticsCentre, manufacturingHall, pipeRack, quayCrane, railTrack, relayHut, signalGantry, storageTank, wagon, type WagonKind } from './library/industrial';
import { seeded } from './library/kit';

/**
 * The districts round the new Ironworks Industrial Circuit (Kenne's North Harbor Circuit II), dressed from the library pieces in src/library/industrial.ts by
 * the map's sectors: the warehouse district along the start straight, the container port and the harbour round the hairpin on the river, the oil refinery
 * through the sweepers, the freight rail yard on the Port Branch under the bridge, the manufacturing halls at the underpass.
 * Every piece stands outside the track facing it, clear of every course, of the water, of the city's buildings and of the other pieces.
 */
export interface DistrictOpts {
  /** the circuit's planned points (region/industrial_circuit.json xz) and its sectors by point index */
  route: number[][]; sectors: Record<string, number[]>;
  ground: (x: number, z: number) => number;
  water: (x: number, z: number) => boolean;
  /** something already stands or runs here (a course with `r` metres to spare, a street, a building) */
  blocked: (x: number, z: number, r: number) => boolean;
  /** the Port Branch near the bridge: a point on it and its direction (the rail yard lines up with it) */
  rail?: { x: number; z: number; dx: number; dz: number };
}

export function buildIronworksDistrict(o: DistrictOpts): { group: THREE.Group; counts: Record<string, number> } {
  const group = new THREE.Group(); group.name = 'ironworks-district';
  const R = o.route, n = R.length, rnd = seeded(9137), counts: Record<string, number> = {};
  const cx = R.reduce((a, p) => a + p[0], 0) / n, cz = R.reduce((a, p) => a + p[1], 0) / n;
  const placed: { x: number; z: number; r: number }[] = [];
  const free = (x: number, z: number, r: number): boolean => {
    if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + r)) return false;
    for (const [a, b] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r * 0.7, r * 0.7], [-r * 0.7, r * 0.7], [r * 0.7, -r * 0.7], [-r * 0.7, -r * 0.7]]) if (o.water(x + a, z + b) || o.blocked(x + a, z + b, 2)) return false;
    return true;
  };
  const put = (obj: THREE.Object3D, x: number, z: number, ry: number, r: number, kind: string): void => {
    obj.position.set(x, o.ground(x, z) - 0.05, z); obj.rotation.y = ry; group.add(obj);
    placed.push({ x, z, r }); counts[kind] = (counts[kind] ?? 0) + 1;
  };
  /** along a sector, on the outside of the loop (and the inside where `inside`), find spots `r` clear and stand pieces there facing the track */
  const line = (sector: string, r: number, make: (k: number) => THREE.Object3D, kind: string, every = 1, inside = false, extraOff = 0): void => {
    const s = o.sectors[sector]; if (!s) return;
    let k = 0;
    for (let i = s[0]; i < s[1]; i += every) {
      const a = R[i % n], b = R[(i + 1) % n], mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      let nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
      if ((mx - cx) * nx + (mz - cz) * nz < 0) { nx = -nx; nz = -nz; }                                    // outward
      for (const side of inside ? [1, -1] : [1]) {
        for (let d = 12 + r + extraOff; d < 12 + r + extraOff + 70; d += 6) {
          const x = mx + nx * side * d, z = mz + nz * side * d;
          if (!free(x, z, r)) continue;
          put(make(k++), x, z, Math.atan2(-nx * side, -nz * side), r, kind);                                 // the front (+z) toward the track
          break;
        }
      }
    }
  };

  // ---- warehouse district (start straight and the esses): logistics centres and bulk warehouses ----
  line('warehouse', 40, (k) => (k % 2 ? bulkWarehouse(100 + k, 36, 56, 11) : logisticsCentre(200 + k, 84, 52, 12)), 'warehouse', 2, true);
  // ---- the underpass approach: brick manufacturing halls ----
  line('underpass', 30, (k) => manufacturingHall(300 + k, 48, 40, 9, 4), 'manufacturing hall', 2, true);
  // ---- container port and harbour: container blocks inland, quay cranes on the water's edge, the control tower and customs at the hairpin ----
  line('container_port', 27, (k) => containerBlock(400 + k, 4, 6, 4), 'container block', 1, true);
  line('harbour', 27, (k) => containerBlock(450 + k, 4, 6, 4), 'container block', 1, true);
  line('container_yard', 27, (k) => containerBlock(480 + k, 5, 7, 5), 'container block', 1, true);
  {
    const s = [...(o.sectors.container_port ?? []), ...(o.sectors.harbour ?? [])];
    if (s.length) for (let i = Math.min(...s); i < Math.max(...s); i++) {
      const a = R[i % n], b = R[(i + 1) % n], mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      // the quay: the first water within 120 m square to the track; a crane stands 14 m back from it, its boom out over the water
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
      for (const sd of [1, -1]) for (let d = 16; d < 120; d += 4) {
        const x = mx + nx * sd * d, z = mz + nz * sd * d;
        if (!o.water(x, z)) continue;
        const qx = x - nx * sd * 14, qz = z - nz * sd * 14;
        if (free(qx, qz, 14)) put(quayCrane(500 + i), qx, qz, Math.atan2(nx * sd, nz * sd), 14, 'quay crane');
        break;
      }
    }
    const h = o.sectors.harbour;
    if (h) { const p = R[Math.floor((h[0] + h[1]) / 2) % n]; for (let d = 30; d < 140; d += 8) { const x = p[0] + (p[0] - cx) / Math.hypot(p[0] - cx, p[1] - cz) * d, z = p[1] + (p[1] - cz) / Math.hypot(p[0] - cx, p[1] - cz) * d; if (free(x, z, 12)) { put(controlTower(7), x, z, Math.atan2(cx - x, cz - z), 12, 'control tower'); break; } } }
    const c = o.sectors.container_port;
    if (c) { const p = R[c[0] % n], q = R[(c[0] + 1) % n]; for (let d = 30; d < 120; d += 6) { const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, x = p[0] - (q[1] - p[1]) / L * d, z = p[1] + (q[0] - p[0]) / L * d; if (free(x, z, 26)) { put(customsBuilding(3), x, z, Math.atan2(p[0] - x, p[1] - z), 26, 'customs'); break; } } }
  }
  // ---- the oil refinery: storage tanks, Horton spheres, distillation towers, a pipe rack along the track and the flare ----
  line('refinery', 22, (k) => (k % 3 === 0 ? storageTank(600 + k, 14, 15, k % 2 === 0) : k % 3 === 1 ? hortonSphere(600 + k, 8) : distillationTower(600 + k, 34 + (k % 4) * 4)), 'refinery unit', 1, true);
  {
    const s = o.sectors.refinery;
    if (s) {
      const i = Math.floor((s[0] + s[1]) / 2), a = R[i % n], b = R[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
      for (const d of [18, 24, 30]) { const x = (a[0] + b[0]) / 2 + nx * d, z = (a[1] + b[1]) / 2 + nz * d; if (free(x, z, 8)) { put(pipeRack(60), x, z, Math.atan2(b[1] - a[1], -(b[0] - a[0])) + Math.PI / 2, 8, 'pipe rack'); break; } }
      for (let d = 60; d < 200; d += 10) { const p = R[s[1] % n], x = p[0] + (p[0] - cx) / Math.hypot(p[0] - cx, p[1] - cz) * d, z = p[1] + (p[1] - cz) / Math.hypot(p[0] - cx, p[1] - cz) * d; if (free(x, z, 6)) { put(flareStack(46), x, z, 0, 6, 'flare'); break; } }
    }
  }
  // ---- the freight rail yard on the Port Branch, under the bridge: sidings either side of the main line, wagon strings, a locomotive, a gantry, relay huts ----
  if (o.rail) {
    const { x: rx, z: rz } = o.rail, L = Math.hypot(o.rail.dx, o.rail.dz) || 1, ux = o.rail.dx / L, uz = o.rail.dz / L, vx = -uz, vz = ux;
    const yaw = Math.atan2(ux, uz), LEN = 420;
    const kinds: WagonKind[] = ['hopper', 'tanker', 'boxcar', 'flatcar'];
    for (const off of [-13.5, -9, -4.5, 4.5, 9, 13.5]) {
      // a siding in pieces, skipping where something stands (the track at grade, a street)
      for (let s = -LEN / 2; s < LEN / 2; s += 30) {
        const x = rx + ux * (s + 15) + vx * off, z = rz + uz * (s + 15) + vz * off;
        if (o.water(x, z) || o.blocked(x, z, 1.5)) continue;
        const t = railTrack(30); t.position.set(x, o.ground(x, z) - 0.1, z); t.rotation.y = yaw; group.add(t); counts.track = (counts.track ?? 0) + 1;
        // a wagon on most pieces; a locomotive heads each string
        if (rnd() < 0.72) {
          const w = s % 90 === 0 ? locomotive(700 + s) : wagon(kinds[Math.floor(rnd() * kinds.length)], 700 + s + off * 10);
          w.position.set(x, o.ground(x, z) + 0.55, z); w.rotation.y = yaw; group.add(w); counts.rollingStock = (counts.rollingStock ?? 0) + 1;
        }
      }
    }
    for (const s of [-170, 150]) { const x = rx + ux * s, z = rz + uz * s; if (!o.blocked(x, z, 4)) { const g = signalGantry(7); g.position.set(x, o.ground(x, z), z); g.rotation.y = yaw + Math.PI / 2; group.add(g); counts.gantry = (counts.gantry ?? 0) + 1; } }
    for (const s of [-120, -40, 60]) { const x = rx + ux * s + vx * 19, z = rz + uz * s + vz * 19; if (!o.blocked(x, z, 3) && !o.water(x, z)) { const h = relayHut(); h.position.set(x, o.ground(x, z), z); h.rotation.y = yaw; group.add(h); counts.relayHut = (counts.relayHut ?? 0) + 1; } }
  }
  return { group, counts };
}
