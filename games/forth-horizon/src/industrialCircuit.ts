import * as THREE from 'three';

/**
 * The Ironworks Industrial Circuit: a short street course cut through the port's industrial yards (route planned by tools/plan_industrial_circuit.py).
 * Asphalt with white edge lines and a chequered start line, concrete barriers 6.9 m from the centre line (the same distance the city circuit's physics uses),
 * and tyre walls on the outside of the tight corners.
 */
export interface IndustrialCircuit { group: THREE.Group; road: THREE.Mesh; path: { x: number; z: number }[] }

export function buildIndustrialCircuit(o: { path: { x: number; z: number }[]; ground: (x: number, z: number) => number; roadMaterial?: THREE.Material }): IndustrialCircuit {
  const P = o.path, n = P.length;
  const group = new THREE.Group(); group.name = 'industrial-circuit';
  const LIFT = 0.42;                                              // over the yard pads (0.3 m above the ground)
  const asphalt = o.roadMaterial ?? new THREE.MeshStandardMaterial({ color: 0x2a2b2d, roughness: 0.85 });
  const yAt = (i: number): number => o.ground(P[i].x, P[i].z) + LIFT;
  const tan = (i: number): { tx: number; tz: number } => { const a = P[(i - 1 + n) % n], b = P[(i + 1) % n]; const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1; return { tx: dx / l, tz: dz / l }; };

  const strip = (half: number, off: number, lift: number, mat: THREE.Material, uvLen: number, closed = true): THREE.Mesh => {
    const pos: number[] = [], uv: number[] = [], idx: number[] = []; let dist = 0;
    const m = closed ? n + 1 : n;
    for (let k = 0; k < m; k++) {
      const i = k % n, { tx, tz } = tan(i), nx = -tz, nz = tx, p = P[i];
      if (k > 0) dist += Math.hypot(p.x - P[(k - 1) % n].x, p.z - P[(k - 1) % n].z);
      const y = yAt(i) + lift;
      pos.push(p.x + nx * (off + half), y, p.z + nz * (off + half), p.x + nx * (off - half), y, p.z + nz * (off - half)); uv.push(0, dist / uvLen, 1, dist / uvLen);
    }
    for (let k = 0; k < m - 1; k++) { const q = k * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, mat); mesh.receiveShadow = true; return mesh;
  };
  const road = strip(6.2, 0, 0, asphalt, 8); road.name = 'industrial-circuit-road'; group.add(road);
  const paint = (c: number): THREE.Material => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  group.add(strip(0.09, -5.7, 0.03, paint(0xeeeeea), 8), strip(0.09, 5.7, 0.03, paint(0xeeeeea), 8));

  // start line: a chequered band across the road at the first point
  {
    const { tx, tz } = tan(0), nx = -tz, nz = tx, p = P[0], y = yAt(0) + 0.04;
    const cells = 12, rows = 2, len = 1.2;
    for (let c = 0; c < cells; c++) for (let r = 0; r < rows; r++) {
      const off = -6.0 + (c + 0.5) * (12.0 / cells), along = (r - 0.5) * len * 0.5;
      const q = new THREE.Mesh(new THREE.PlaneGeometry(12.0 / cells, len * 0.5), paint((c + r) % 2 ? 0x111111 : 0xf2f2f2));
      q.rotation.x = -Math.PI / 2; q.rotation.z = -Math.atan2(tx, tz) + Math.PI; q.position.set(p.x + nx * off + tx * along, y, p.z + nz * off + tz * along); group.add(q);
    }
  }

  // concrete barriers either side, a block every 3 m
  {
    const geo = new THREE.BoxGeometry(0.55, 0.95, 3.0), mat = new THREE.MeshStandardMaterial({ color: 0xb5b3ac, roughness: 0.92 });
    const im = new THREE.InstancedMesh(geo, mat, n * 6 * 2);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(1, 1, 1), tp = new THREE.Vector3(); let k = 0;
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n], len = Math.hypot(b.x - a.x, b.z - a.z), { tx, tz } = tan(i), nx = -tz, nz = tx;
      q.setFromAxisAngle(up, Math.atan2(b.x - a.x, b.z - a.z));
      for (let s = 1.5; s < len; s += 3.0) for (const side of [-1, 1]) {
        const x = a.x + (b.x - a.x) * (s / len) + nx * side * 6.9, z = a.z + (b.z - a.z) * (s / len) + nz * side * 6.9;
        tp.set(x, o.ground(x, z) + 0.45, z); im.setMatrixAt(k++, m4.compose(tp, q, sc));
      }
    }
    im.count = k; im.castShadow = true; im.receiveShadow = true; group.add(im);
  }

  // tyre walls on the outside of the tight corners
  {
    const geo = new THREE.CylinderGeometry(0.36, 0.36, 0.34, 10), mat = new THREE.MeshStandardMaterial({ color: 0x1b1b1c, roughness: 0.95 });
    const im = new THREE.InstancedMesh(geo, mat, 3000);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), tp = new THREE.Vector3(); let k = 0;
    for (let i = 0; i < n; i += 2) {
      const a = tan((i - 2 + n) % n), b = tan((i + 2) % n);
      const turn = Math.atan2(a.tx * b.tz - a.tz * b.tx, a.tx * b.tx + a.tz * b.tz);                  // signed: which way the road bends
      if (Math.abs(turn) < 0.16) continue;
      const side = turn > 0 ? -1 : 1, { tx, tz } = tan(i), nx = -tz, nz = tx;
      for (let row = 0; row < 3; row++) for (let h = 0; h < 3; h++) {
        if (k >= 3000) break;
        const off = 8.0 + row * 0.75, x = P[i].x + nx * side * off, z = P[i].z + nz * side * off;
        tp.set(x, o.ground(x, z) + 0.2 + h * 0.34, z); im.setMatrixAt(k++, m4.compose(tp, q, sc));
      }
    }
    im.count = k; im.castShadow = true; group.add(im);
  }
  return { group, road, path: P };
}
