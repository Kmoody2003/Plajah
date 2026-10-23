// Daybreak's wildflowers: small blooms on stems scattered along both verges of the road, closed and
// hidden through the night, rising and opening in a wave that spreads out from where Dracula fell
// (in step with the grass ring in grass.ts). Two instanced meshes (stems, heads); per-instance
// matrices are only touched while the wave is moving.
import * as THREE from 'three/webgpu';
import type { ArrivalWorld } from './arrival';
import { rng } from './kit';

const PALETTE = [0xffe066, 0xfff4e0, 0xb48cff, 0xff6f91, 0xffa94d, 0xf5f5ff, 0x9ad0ff];

export function buildFlowers(road: ArrivalWorld['road'], count = 1600) {
  const R = rng(4242);
  const spots: { p: THREE.Vector3; h: number; yaw: number; tilt: number }[] = [];
  for (let i = 0; i < count; i++) {
    const left = R() < 0.55;
    const u = left ? road.uL - 1.3 - R() * 11 : road.uR + 1.3 + R() * 9;
    const v = road.vStart + 2 + R() * (-road.vStart - 4);
    spots.push({ p: road.fromLocal(u, v, road.heightAt(u, v) - 0.02), h: 0.6 + R() * 0.45, yaw: R() * 6.28, tilt: (R() - 0.5) * 0.4 });
  }
  const stemGeo = new THREE.CylinderGeometry(0.006, 0.009, 1, 4, 1, true); stemGeo.translate(0, 0.5, 0);
  // A five-petal bloom facing up, coloured per flower.
  const petal = new THREE.Shape();
  for (let k = 0; k <= 60; k++) { const a = (k / 60) * Math.PI * 2, r = 0.5 + 0.5 * Math.abs(Math.cos(a * 2.5)); const x = Math.cos(a) * r, y = Math.sin(a) * r; if (k === 0) petal.moveTo(x, y); else petal.lineTo(x, y); }
  const headGeo = new THREE.ShapeGeometry(petal, 2);
  headGeo.rotateX(-Math.PI / 2);
  headGeo.scale(0.13, 0.13, 0.13);
  headGeo.rotateX(0.85);                         // blooms turn outward to the light, not flat to the sky
  const stems = new THREE.InstancedMesh(stemGeo, new THREE.MeshStandardNodeMaterial({ color: 0x3f6b2a, roughness: 0.8 }), count);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardNodeMaterial({ roughness: 0.55, side: THREE.DoubleSide, emissive: 0x2a2620 }), count);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) heads.setColorAt(i, c.setHex(PALETTE[Math.floor(R() * PALETTE.length)]));
  for (const m of [stems, heads]) { m.frustumCulled = false; m.receiveShadow = true; m.visible = false; m.userData.dynamic = true; }
  const group = new THREE.Group();
  group.add(stems, heads);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), top = new THREE.Vector3();
  let done = false;
  return {
    group,
    /** `radius`: the wave's reach (m) from `centre`; each flower grows over the 6 m behind the front. */
    update(centre: THREE.Vector3, radius: number) {
      if (done || radius <= 0) return;
      stems.visible = heads.visible = true;
      let all = true;
      spots.forEach((f, i) => {
        const k = THREE.MathUtils.clamp((radius - Math.hypot(f.p.x - centre.x, f.p.z - centre.z)) / 6, 0, 1);
        if (k < 1) all = false;
        const g = k * k * (3 - 2 * k), h = Math.max(0.001, f.h * g);
        e.set(f.tilt, f.yaw, f.tilt * 0.5);
        q.setFromEuler(e);
        mtx.compose(f.p, q, s.set(1, h, 1)); stems.setMatrixAt(i, mtx);
        top.set(0, h, 0).applyQuaternion(q).add(f.p);
        const open = Math.max(0.001, THREE.MathUtils.clamp((k - 0.5) * 2, 0, 1));    // blooms open once the stem is up
        mtx.compose(top, q, s.set(open, open, open)); heads.setMatrixAt(i, mtx);
      });
      stems.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
      done = all;
    },
  };
}
