import * as THREE from 'three';
import { DetailBatch } from './detailBatch';

export interface FencePoint { x: number; y: number; z: number }
/** Reference: Catch_fencing_prop_sheet_render_cd1f83b0.jpg. Dimensions in metres. */
export function catchFence(runs: FencePoint[][]): THREE.Group {
  const kit = new DetailBatch('Ironport bolted catch fencing');
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const bases: THREE.Matrix4[] = [];
  const steel = 0x30363d, zinc = 0x929a9d;
  const leanGpu = typeof window !== 'undefined' && (window as unknown as { perfTier?: string }).perfTier !== 'high';
  for (const run of runs) {
    let distance = 0;
    for (let i = 0; i < run.length; i++) {
      const p = run[i], next = run[Math.min(i + 1, run.length - 1)], prev = run[Math.max(0, i - 1)];
      const tangent = new THREE.Vector3(next.x - prev.x, 0, next.z - prev.z).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
      const foot = [p.x, p.y + 0.85, p.z];
      const shoulder = [p.x, p.y + 3.65, p.z];
      const tip = [p.x + normal.x * 0.5, p.y + 4.4, p.z + normal.z * 0.5];
      kit.beam(foot, shoulder, 0.11, steel);
      kit.beam(shoulder, tip, 0.11, steel);
      kit.box(p.x, p.y + 0.86, p.z, 0.3, 0.045, 0.3, steel, 1);
      if (!leanGpu) {
        for (const dx of [-0.105, 0.105]) for (const dz of [-0.105, 0.105]) kit.box(p.x + dx, p.y + 0.9, p.z + dz, 0.035, 0.04, 0.035, zinc, 1);
      }
      if (i === run.length - 1) continue;
      const length = Math.hypot(next.x - p.x, next.z - p.z);
      if (length < 0.01) continue;
      const delta = new THREE.Vector3(next.x - p.x, next.y - p.y, next.z - p.z);
      bases.push(new THREE.Matrix4().compose(new THREE.Vector3((p.x + next.x) / 2, (p.y + next.y) / 2, (p.z + next.z) / 2), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), delta.clone().normalize()), new THREE.Vector3(Math.max(0.01, delta.length() - 0.025), 1, 1)));
      const b = positions.length / 3;
      positions.push(p.x, p.y + 0.95, p.z, next.x, next.y + 0.95, next.z, p.x, p.y + 3.65, p.z, next.x, next.y + 3.65, next.z);
      uvs.push(distance / 0.1, 0, (distance + length) / 0.1, 0, distance / 0.1, 27, (distance + length) / 0.1, 27);
      indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      for (const y of [1, 1.85, 2.75, 3.65]) kit.beam([p.x, p.y + y, p.z], [next.x, next.y + y, next.z], 0.022, zinc);
      for (let c = 1; c <= 4; c++) {
        const t = c / 4;
        kit.beam([p.x + normal.x * 0.5 * t, p.y + 3.65 + 0.75 * t, p.z + normal.z * 0.5 * t], [next.x + normal.x * 0.5 * t, next.y + 3.65 + 0.75 * t, next.z + normal.z * 0.5 * t], 0.014, zinc);
      }
      // Periodic maintenance leaf: square frame, diagonal brace, two hinge blocks and latch.
      if (i % 24 === 8 && length > 2.5) {
        const gateEnd = [p.x + tangent.x * 1.2, p.y + 1.0, p.z + tangent.z * 1.2];
        kit.beam([p.x, p.y + 1, p.z], [gateEnd[0], gateEnd[1] + 2.55, gateEnd[2]], 0.06, steel);
        kit.beam(gateEnd, [gateEnd[0], gateEnd[1] + 2.55, gateEnd[2]], 0.065, steel);
        for (const y of [1.25, 3.35]) kit.box(p.x, p.y + y, p.z, 0.2, 0.18, 0.14, zinc, 1);
        kit.box(gateEnd[0], p.y + 2, gateEnd[2], 0.22, 0.09, 0.16, zinc, 1);
      }
      distance += length;
    }
  }
  const group = kit.build();
  const profile = new THREE.Shape();
  profile.moveTo(-0.4, 0); profile.lineTo(0.4, 0); profile.lineTo(0.4, 0.23); profile.lineTo(0.19, 0.55); profile.lineTo(0.16, 0.85); profile.lineTo(-0.16, 0.85); profile.lineTo(-0.19, 0.55); profile.lineTo(-0.4, 0.23); profile.closePath();
  const baseGeometry = new THREE.ExtrudeGeometry(profile, { depth: 1, bevelEnabled: false });
  baseGeometry.rotateY(Math.PI / 2); baseGeometry.translate(-0.5, 0, 0);
  const baseMesh = new THREE.InstancedMesh(baseGeometry, new THREE.MeshStandardMaterial({ color: 0x96978e, roughness: 0.96 }), bases.length);
  bases.forEach((matrix, i) => baseMesh.setMatrixAt(i, matrix)); baseMesh.castShadow = baseMesh.receiveShadow = true; baseMesh.computeBoundingSphere(); group.add(baseMesh);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.strokeStyle = '#707a80'; ctx.lineWidth = 3;
  for (const offset of [-64, 0, 64]) { ctx.beginPath(); ctx.moveTo(offset, 0); ctx.lineTo(offset + 64, 64); ctx.moveTo(offset + 64, 0); ctx.lineTo(offset, 64); ctx.stroke(); }
  const texture = new THREE.CanvasTexture(canvas); texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 8; texture.colorSpace = THREE.SRGBColorSpace;
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
  group.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: texture, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.58, metalness: 0.65 })));
  return group;
}
