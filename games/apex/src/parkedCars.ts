import * as THREE from 'three';
import { loadCarLibraryModels, populateChunkedLibraryCars } from './carLibraryInstancer';

/**
 * Parked cars, so the streets look lived in:
 *  - parallel parking along both curbs of the city's local streets (busier downtown), with gaps; never within 14 m of a junction, at a driveway or crosswalk,
 *    on the race circuit or over water;
 *  - a car in about six driveways in ten, at the house end, nose in or out.
 * One instanced mesh (the same massing as the traffic and the parking-lot cars). `near` lists the parked cars round a point so the player's car can hit them.
 */
export interface ParkedCar { x: number; z: number; yaw: number }

export function buildParkedCars(o: {
  streets: { c: string; p: number[][] }[];
  drives: { xz: number[][]; half?: number; kind: string }[];
  ground: (x: number, z: number) => number;
  skip: (x: number, z: number) => boolean;
  downtown: (x: number, z: number) => boolean;
  mouths: { x: number; z: number }[];
}): { group: THREE.Group; near: (x: number, z: number, r: number) => ParkedCar[]; cars: ParkedCar[]; count: number } {
  let seed = 9173; const rnd = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const cars: ParkedCar[] = [];
  // another street run within r of a point: the junctions, where nobody parks
  const SC = 32, sh = new Map<number, [number, number, number, number, number][]>();
  o.streets.forEach((r, ri) => { for (let i = 0; i < r.p.length - 1; i++) { const a = r.p[i], b = r.p[i + 1]; for (let gx = Math.floor((Math.min(a[0], b[0]) - 16) / SC); gx <= Math.floor((Math.max(a[0], b[0]) + 16) / SC); gx++) for (let gz = Math.floor((Math.min(a[1], b[1]) - 16) / SC); gz <= Math.floor((Math.max(a[1], b[1]) + 16) / SC); gz++) { const k = gx * 100003 + gz; (sh.get(k) ?? (sh.set(k, []), sh.get(k)!)).push([ri, a[0], a[1], b[0], b[1]]); } } });
  const roadNear = (x: number, z: number, r: number, self: number): boolean => {
    for (const [ri, ax, az, bx, bz] of sh.get(Math.floor(x / SC) * 100003 + Math.floor(z / SC)) ?? []) {
      if (ri === self) continue;
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      if (Math.hypot(ax + dx * t - x, az + dz * t - z) < r) return true;
    }
    return false;
  };
  const MC = 8, mh = new Map<number, { x: number; z: number }[]>();
  for (const m of o.mouths) { const k = Math.floor(m.x / MC) * 100003 + Math.floor(m.z / MC); (mh.get(k) ?? (mh.set(k, []), mh.get(k)!)).push(m); }
  const nearMouth = (x: number, z: number): boolean => { const cx = Math.floor(x / MC), cz = Math.floor(z / MC); for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) for (const m of mh.get((cx + i) * 100003 + cz + k) ?? []) if ((m.x - x) ** 2 + (m.z - z) ** 2 < 16) return true; return false; };
  // ---- the curbs of the local streets: one bay every 6.5 m ----
  o.streets.forEach((r, ri) => {
    if (r.c !== 'street' || r.p.length < 2) return;
    const half = 4.25, off = half - 0.95;
    for (const side of [-1, 1]) {
      let acc = 3.5;
      for (let i = 0; i < r.p.length - 1; i++) {
        const a = r.p[i], b = r.p[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); if (L < 0.5) continue;
        const ux = dx / L, uz = dz / L, nx = -uz * side, nz = ux * side;
        while (acc < L) {
          const cx = a[0] + ux * acc + nx * off, cz = a[1] + uz * acc + nz * off;
          acc += 6.5;
          const busy = o.downtown(cx, cz) ? 0.62 : 0.36;
          if (rnd() > busy) continue;
          if (roadNear(cx, cz, 14, ri) || o.skip(cx, cz) || nearMouth(cx, cz)) continue;
          cars.push({ x: cx + ux * (rnd() - 0.5) * 0.8, z: cz + uz * (rnd() - 0.5) * 0.8, yaw: Math.atan2(ux * side, uz * side) + (rnd() - 0.5) * 0.04 });     // facing the way that side's traffic runs
        }
        acc -= L;
      }
    }
  });
  const curb = cars.length;
  // ---- driveways ----
  for (const d of o.drives) {
    if (d.kind !== 'drive' || (d.half ?? 1.5) > 2 || d.xz.length < 2 || rnd() > 0.58) continue;
    const [h, s] = [d.xz[0], d.xz[d.xz.length - 1]], dx = s[0] - h[0], dz = s[1] - h[1], L = Math.hypot(dx, dz);
    if (L < 6) continue;
    const ux = dx / L, uz = dz / L, x = h[0] + ux * 3.0, z = h[1] + uz * 3.0;
    if (o.skip(x, z)) continue;
    cars.push({ x, z, yaw: Math.atan2(ux, uz) + (rnd() < 0.7 ? Math.PI : 0) });                                                 // most nose in toward the house, some backed in
  }
  const palette = [0xd9d9d6, 0x1f1f22, 0x8a8e93, 0x9b1d20, 0x1f3e73, 0x3a5a40, 0xc9a24a, 0x6b4a2f, 0xeeeeee, 0x4a4f55];
  const group = new THREE.Group();
  group.name = 'parked-cars';
  const entries = cars.map((c, i) => ({
    x: c.x,
    y: o.ground(c.x, c.z) + 0.02,
    z: c.z,
    yaw: c.yaw,
    color: palette[i % palette.length],
  }));
  // Populate with real 3D Car Library models (sedans, SUVs, coupes, pickups) chunked by 220 m cells (zero generic blocks!)
  void loadCarLibraryModels().then((models) => {
    populateChunkedLibraryCars(group, entries, models, true);
  });
  const C = 24, grid = new Map<number, ParkedCar[]>();
  for (const c of cars) { const k = Math.floor(c.x / C) * 100003 + Math.floor(c.z / C); (grid.get(k) ?? (grid.set(k, []), grid.get(k)!)).push(c); }
  const near = (x: number, z: number, r: number): ParkedCar[] => {
    const out: ParkedCar[] = [], cx = Math.floor(x / C), cz = Math.floor(z / C);
    for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) for (const c of grid.get((cx + i) * 100003 + cz + k) ?? []) if ((c.x - x) ** 2 + (c.z - z) ** 2 < r * r) out.push(c);
    return out;
  };
  console.log('parked cars', curb, 'at the curb,', cars.length - curb, 'in driveways');
  return { group, near, cars, count: cars.length };
}
