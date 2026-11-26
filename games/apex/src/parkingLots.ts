import * as THREE from 'three';
import { loadCarLibraryModels, populateChunkedLibraryCars } from './carLibraryInstancer';

/**
 * Parking lots (region/parking_lots.json, made by tools/access_and_parking.py): [x, z, width, depth, rotation]. Each is a dark asphalt pad with white stall lines and parked cars, built from
 * three merged meshes however many lots there are. Rotation is the building's (its front is the local +z axis).
 */
export function buildParkingLots(lots: number[][], ground: (x: number, z: number) => number): { group: THREE.Group; near: (x: number, z: number, r: number) => boolean; cars: Array<{ x: number; z: number; yaw: number }> } {
  const group = new THREE.Group(); group.name = 'parking-lots';
  let s = 4242; const r = (): number => (s = (s * 16807) % 2147483647) / 2147483647;
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x2c2d30, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const line = new THREE.MeshStandardMaterial({ color: 0xe6e6e0, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 });
  const pos: number[] = [], idx: number[] = [];
  const lpos: number[] = [], lidx: number[] = [];
  const palette = [0xd9d9d6, 0x1f1f22, 0x8a8e93, 0x9b1d20, 0x1f3e73, 0x3a5a40, 0xc9a24a, 0x6b4a2f];
  const carEntries: Array<{ x: number; y: number; z: number; yaw: number; color: number; scaleZ?: number }> = [];
  const grid = new Map<number, number[]>();
  for (const [x, z, w, d, rot] of lots) {
    const c = Math.cos(rot), sn = Math.sin(rot);
    const to = (a: number, b: number): [number, number] => [x + c * a + sn * b, z - sn * a + c * b];        // local a (width) and b (depth) to world: e1 = (cos, -sin), e2 = (sin, cos)
    const y = Math.max(ground(x, z), ground(...to(w / 2, d / 2)), ground(...to(-w / 2, -d / 2)), ground(...to(w / 2, -d / 2)), ground(...to(-w / 2, d / 2))) + 0.14;
    const b0 = pos.length / 3;
    for (const [a, b] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]) { const [wx, wz] = to(a, b); pos.push(wx, y, wz); }
    idx.push(b0, b0 + 2, b0 + 1, b0, b0 + 3, b0 + 2);
    // a real lot: bays of 90-degree stalls 5.5 m deep either side of a 7 m drive aisle (an 18 m module across the depth); a shallow lot is one bay and its aisle
    const bands: number[] = [];
    if (d < 12) bands.push(-d / 2 + 2.75);
    else { const mods = Math.max(1, Math.floor(d / 18)), m0 = -d / 2 + (d - mods * 18) / 2; for (let m = 0; m < mods; m++) bands.push(m0 + m * 18 + 2.75, m0 + m * 18 + 15.25); }
    const rowDepth = 5.5;
    for (const bc of bands) {
      for (let a = -w / 2 + 1.3; a < w / 2 - 1.0; a += 2.6) {
        const [lx0, lz0] = to(a, bc - rowDepth * 0.45), [lx1, lz1] = to(a, bc + rowDepth * 0.45);
        const k0 = lpos.length / 3, nx = 0.06 * c, nz = -0.06 * sn;
        lpos.push(lx0 - nx, y + 0.02, lz0 - nz, lx0 + nx, y + 0.02, lz0 + nz, lx1 - nx, y + 0.02, lz1 - nz, lx1 + nx, y + 0.02, lz1 + nz);
        lidx.push(k0, k0 + 2, k0 + 1, k0 + 1, k0 + 2, k0 + 3);
        if (r() < 0.55 && carEntries.length < 4000) {
          const [cx, cz] = to(a + 1.3, bc);
          carEntries.push({
            x: cx,
            y: y + 0.02,
            z: cz,
            yaw: rot + (r() < 0.35 ? Math.PI : 0),
            color: palette[Math.floor(r() * palette.length)],
            scaleZ: Math.min(1, (rowDepth * 0.85) / 4.6),
          });
        }
      }
    }
    for (let gx = Math.floor((x - 40) / 200); gx <= Math.floor((x + 40) / 200); gx++) for (let gz = Math.floor((z - 40) / 200); gz <= Math.floor((z + 40) / 200); gz++) { const k = gx * 8192 + gz; const a = grid.get(k) ?? []; a.push(x, z, Math.hypot(w, d) / 2); grid.set(k, a); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const pad = new THREE.Mesh(g, asphalt); pad.receiveShadow = true; group.add(pad);
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lpos, 3)); lg.setIndex(lidx); lg.computeVertexNormals();
  group.add(new THREE.Mesh(lg, line));
  const lotCarsGroup = new THREE.Group();
  lotCarsGroup.name = 'parking-lot-library-cars';
  group.add(lotCarsGroup);
  void loadCarLibraryModels().then((models) => {
    populateChunkedLibraryCars(lotCarsGroup, carEntries, models, false);
  });
  const near = (x: number, z: number, rr: number): boolean => {
    const a = grid.get(Math.floor(x / 200) * 8192 + Math.floor(z / 200)); if (!a) return false;
    for (let i = 0; i < a.length; i += 3) if (Math.hypot(a[i] - x, a[i + 1] - z) < a[i + 2] + rr) return true;
    return false;
  };
  return { group, near, cars: carEntries.map((c) => ({ x: c.x, z: c.z, yaw: c.yaw })) };
}
