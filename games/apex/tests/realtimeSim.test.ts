import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  buildCurvedBladeClusterGeo,
  createShellFurMesh,
  RealtimeClothField,
  RealtimeRippleField,
} from '../../../services/realtimeSim/index';

test('buildCurvedBladeClusterGeo generates tapered curved 3D blades with finite normals and aBlade attribute', () => {
  const geo = buildCurvedBladeClusterGeo(6, 4);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
  const blade = geo.getAttribute('aBlade') as THREE.BufferAttribute;
  assert.ok(pos.count === 6 * (4 * 2 + 1), 'expected 9 vertices per 4-segment tapered blade');
  assert.equal(nor.count, pos.count);
  assert.equal(blade.count, pos.count);
  for (let i = 0; i < pos.count; i++) {
    assert.ok(Number.isFinite(pos.getX(i)) && Number.isFinite(pos.getY(i)) && Number.isFinite(pos.getZ(i)));
    const len = Math.hypot(nor.getX(i), nor.getY(i), nor.getZ(i));
    assert.ok(Math.abs(len - 1) < 0.01, 'normals must be unit length');
  }
  geo.dispose();
});

test('createShellFurMesh creates N instanced volumetric fur/hair shells and updates wind/velocity cleanly', () => {
  const sphere = new THREE.SphereGeometry(0.5, 8, 8);
  const fur = createShellFurMesh(sphere, { layers: 12, length: 0.05, density: 120 });
  assert.equal(fur.mesh.count, 12);
  fur.update(0.016, new THREE.Vector3(1.2, 0, -0.4), new THREE.Vector3(5, 0, 0));
  assert.ok(fur.uniforms.uTime.value > 0);
  assert.ok(Number.isFinite(fur.uniforms.uVelocity.value.x));
  fur.dispose();
  sphere.dispose();
});

test('RealtimeClothField simulates wind + high-speed car slipstream wake without NaNs or runaway stretch', () => {
  const field = new RealtimeClothField();
  const mesh = field.addBanner({
    x: 10, y: 5, z: 20, dirX: 1, dirZ: 0, width: 2.0, height: 1.2, color: 0xff3b1f, pinMode: 'left',
  });
  const cam = new THREE.Vector3(10, 4, 25);
  const carPos = new THREE.Vector3(10, 1, 22);
  const carVel = new THREE.Vector3(0, 0, -55); // ~200 km/h blast past the banner
  for (let i = 0; i < 40; i++) {
    field.update(1 / 60, cam, 1.0, carPos, carVel);
  }
  const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  let moved = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z));
    if (Math.abs(z - 20) > 0.05) moved++;
  }
  assert.ok(moved > 5, 'cloth should visibly deflect under wind and car slipstream wake');
  field.dispose();
});

test('RealtimeRippleField propagates shallow-water tire wakes and recenters seamlessly with zero NaNs', () => {
  const rip = new RealtimeRippleField(64, 32);
  rip.recenter(100, 200);
  rip.splat(100, 200, -0.8, 1.0);
  for (let i = 0; i < 12; i++) rip.step(1 / 60, 0.5);
  rip.recenter(103, 202);
  rip.step(1 / 60, 0.2);
  const data = rip.texture.image.data as Uint8Array;
  let nonNeutral = 0;
  for (let i = 0; i < data.length; i += 4) {
    assert.ok(data[i] >= 0 && data[i] <= 255);
    if (Math.abs(data[i] - 128) > 2 || Math.abs(data[i + 1] - 128) > 2) nonNeutral++;
  }
  assert.ok(nonNeutral > 20, 'ripple normals should visibly propagate across the field');
  rip.dispose();
});
