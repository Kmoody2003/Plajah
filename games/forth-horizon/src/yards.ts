// Back yards (tools/relay_houses.py → region/yards.json): a detached garage at the end of each narrow house's drive and a fence along the rear lot line, so a residential
// block reads as lots with yards, not a lawn with houses along its edges. Two instanced meshes each, whatever the number of houses.
import * as THREE from 'three';

export interface YardData { garages: number[][]; fences: number[][] }

export function buildYards(d: YardData, ground: (x: number, z: number) => number): THREE.Group {
  const group = new THREE.Group(); group.name = 'yards';
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
  const siding = [0xd8d2c4, 0xbfb6a3, 0x9a9c97, 0xe4e0d6, 0x8e7f6d, 0xc8c2b4, 0x7d8a86];
  if (d.garages.length) {
    const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(6.2, 3.0, 6.8).translate(0, 1.5, 0), new THREE.MeshStandardMaterial({ roughness: 0.85 }), d.garages.length);
    const roof = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.01, 4.9, 1.6, 4, 1).rotateY(Math.PI / 4).translate(0, 3.8, 0), new THREE.MeshStandardMaterial({ color: 0x3b3a3c, roughness: 0.9 }), d.garages.length);
    const door = new THREE.InstancedMesh(new THREE.BoxGeometry(4.6, 2.3, 0.08).translate(0, 1.15, -3.42), new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.6 }), d.garages.length);
    d.garages.forEach(([x, z, rot], i) => {
      const y = ground(x, z) - 0.05;
      q.setFromAxisAngle(up, rot); p.set(x, y, z);
      walls.setMatrixAt(i, m4.compose(p, q, s.set(1, 1, 1))); walls.setColorAt(i, col.setHex(siding[i % siding.length]));
      roof.setMatrixAt(i, m4.compose(p, q, s.set(1, 1, 1.1)));
      door.setMatrixAt(i, m4.compose(p, q, s.set(1, 1, 1)));
    });
    for (const m of [walls, roof, door]) { m.castShadow = true; m.receiveShadow = true; group.add(m); }
  }
  if (d.fences.length) {
    const fence = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1.5, 0.08).translate(0, 0.75, 0), new THREE.MeshStandardMaterial({ color: 0x8a7a62, roughness: 0.9 }), d.fences.length);
    d.fences.forEach(([x0, z0, x1, z1], i) => {
      const x = (x0 + x1) / 2, z = (z0 + z1) / 2, L = Math.hypot(x1 - x0, z1 - z0);
      q.setFromAxisAngle(up, Math.atan2(-(z1 - z0), x1 - x0)); p.set(x, ground(x, z), z);
      fence.setMatrixAt(i, m4.compose(p, q, s.set(L, 1, 1)));
    });
    fence.receiveShadow = true; group.add(fence);
  }
  return group;
}
