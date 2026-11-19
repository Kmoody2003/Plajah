import * as THREE from 'three';

/** Static hardware shares geometry/material and is submitted once per finish. */
export class DetailBatch {
  private entries = new Map<number, { matrix: THREE.Matrix4; color: number }[]>();
  private transform = new THREE.Matrix4();
  readonly group = new THREE.Group();
  constructor(name: string) { this.group.name = name; }
  frame(m: THREE.Matrix4): void { this.transform.copy(m); }
  box(x: number, y: number, z: number, w: number, h: number, d: number, color: number, finish = 0, rotation = new THREE.Quaternion()): void {
    // Micro-hardware (<0.45m bolts, shutter slats, ladder rungs) skips shadow pass to save hundreds of thousands of sub-pixel shadow tris
    const cast = Math.max(w, h, d) >= 0.45 ? 1 : 0;
    const key = finish * 2 + cast;
    const list = this.entries.get(key) ?? [];
    list.push({ matrix: this.transform.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), rotation, new THREE.Vector3(w, h, d))), color });
    this.entries.set(key, list);
  }
  beam(a: number[], b: number[], width: number, color: number, finish = 1): void {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
    const length = delta.length(); if (length < 0.001) return;
    const mid = start.add(end).multiplyScalar(0.5);
    this.box(mid.x, mid.y, mid.z, width, length, width, color, finish, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.divideScalar(length)));
  }
  build(): THREE.Group {
    const geometry = new THREE.BoxGeometry(1, 1, 1), color = new THREE.Color();
    for (const [key, list] of this.entries) {
      const finish = key >> 1, cast = (key & 1) === 1;
      const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: finish ? 0.48 : 0.88, metalness: finish ? 0.7 : 0 });
      const mesh = new THREE.InstancedMesh(geometry, material, list.length);
      list.forEach((it, i) => { mesh.setMatrixAt(i, it.matrix); mesh.setColorAt(i, color.setHex(it.color)); });
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere(); this.group.add(mesh);
    }
    this.entries.clear(); return this.group;
  }
}
