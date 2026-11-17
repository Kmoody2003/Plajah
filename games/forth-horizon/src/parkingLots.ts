import * as THREE from 'three';

/**
 * Parking lots (region/parking_lots.json, made by tools/access_and_parking.py): [x, z, width, depth, rotation]. Each is a dark asphalt pad with white stall lines and parked cars, built from
 * three merged meshes however many lots there are. Rotation is the building's (its front is the local +z axis).
 */
export function buildParkingLots(lots: number[][], ground: (x: number, z: number) => number): { group: THREE.Group; near: (x: number, z: number, r: number) => boolean } {
  const group = new THREE.Group(); group.name = 'parking-lots';
  let s = 4242; const r = (): number => (s = (s * 16807) % 2147483647) / 2147483647;
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x2c2d30, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const line = new THREE.MeshStandardMaterial({ color: 0xe6e6e0, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 });
  const pos: number[] = [], idx: number[] = [];
  const lpos: number[] = [], lidx: number[] = [];
  const carGeo = new THREE.BoxGeometry(1.8, 1.35, 4.3); carGeo.translate(0, 0.75, 0);
  const cars = new THREE.InstancedMesh(carGeo, new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.45 }), 4000);
  const palette = [0xd9d9d6, 0x1f1f22, 0x8a8e93, 0x9b1d20, 0x1f3e73, 0x3a5a40, 0xc9a24a, 0x6b4a2f];
  let nc = 0; const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), col = new THREE.Color();
  const grid = new Map<number, number[]>();
  for (const [x, z, w, d, rot] of lots) {
    const c = Math.cos(rot), sn = Math.sin(rot);
    const to = (a: number, b: number): [number, number] => [x + c * a + sn * b, z - sn * a + c * b];        // local a (width) and b (depth) to world: e1 = (cos, -sin), e2 = (sin, cos)
    const y = Math.max(ground(x, z), ground(...to(w / 2, d / 2)), ground(...to(-w / 2, -d / 2)), ground(...to(w / 2, -d / 2)), ground(...to(-w / 2, d / 2))) + 0.14;
    const b0 = pos.length / 3;
    for (const [a, b] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]) { const [wx, wz] = to(a, b); pos.push(wx, y, wz); }
    idx.push(b0, b0 + 2, b0 + 1, b0, b0 + 3, b0 + 2);
    // stall lines across the lot every 2.6 m, and the cars between them
    const rows = d >= 15 ? 2 : 1, rowDepth = d / rows;
    for (let row = 0; row < rows; row++) {
      const bc = -d / 2 + rowDepth * (row + 0.5);
      for (let a = -w / 2 + 1.3; a < w / 2 - 1.0; a += 2.6) {
        const [lx0, lz0] = to(a, bc - rowDepth * 0.42), [lx1, lz1] = to(a, bc + rowDepth * 0.42);
        const k0 = lpos.length / 3, nx = 0.06 * c, nz = -0.06 * sn;
        lpos.push(lx0 - nx, y + 0.02, lz0 - nz, lx0 + nx, y + 0.02, lz0 + nz, lx1 - nx, y + 0.02, lz1 - nz, lx1 + nx, y + 0.02, lz1 + nz);
        lidx.push(k0, k0 + 2, k0 + 1, k0 + 1, k0 + 2, k0 + 3);
        if (r() < 0.55 && nc < 4000) {
          const [cx, cz] = to(a + 1.3, bc);
          q.setFromAxisAngle(up, rot + Math.PI / 2 * 0 + (r() < 0.5 ? 0 : 0));                           // cars park nose-in, long axis along the depth
          p.set(cx, y, cz); sc.set(1, 1, Math.min(1, rowDepth * 0.7 / 4.3));
          cars.setMatrixAt(nc, m4.compose(p, q, sc)); cars.setColorAt(nc, col.setHex(palette[Math.floor(r() * palette.length)])); nc++;
        }
      }
    }
    for (let gx = Math.floor((x - 40) / 200); gx <= Math.floor((x + 40) / 200); gx++) for (let gz = Math.floor((z - 40) / 200); gz <= Math.floor((z + 40) / 200); gz++) { const k = gx * 8192 + gz; const a = grid.get(k) ?? []; a.push(x, z, Math.hypot(w, d) / 2); grid.set(k, a); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const pad = new THREE.Mesh(g, asphalt); pad.receiveShadow = true; group.add(pad);
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lpos, 3)); lg.setIndex(lidx); lg.computeVertexNormals();
  group.add(new THREE.Mesh(lg, line));
  cars.count = nc; cars.castShadow = false; group.add(cars);
  const near = (x: number, z: number, rr: number): boolean => {
    const a = grid.get(Math.floor(x / 200) * 8192 + Math.floor(z / 200)); if (!a) return false;
    for (let i = 0; i < a.length; i += 3) if (Math.hypot(a[i] - x, a[i + 1] - z) < a[i + 2] + rr) return true;
    return false;
  };
  return { group, near };
}
