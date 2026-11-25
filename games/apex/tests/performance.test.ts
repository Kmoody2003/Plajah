import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { frameStats, gpuFamily, gpuPreference } from '../src/performance';
import { InstanceVisibility } from '../src/instanceVisibility';

test('diagnostics distinguish software rendering and all requested GPU families', () => {
  assert.equal(gpuFamily('ANGLE Intel Arc Graphics'), 'intel-arc');
  assert.equal(gpuFamily('NVIDIA RTX 4070'), 'nvidia');
  assert.equal(gpuFamily('AMD Radeon 780M'), 'amd');
  assert.equal(gpuFamily('Qualcomm Adreno X1'), 'qualcomm');
  assert.equal(gpuFamily('ANGLE Google SwiftShader'), 'software');
  assert.equal(gpuPreference('high-performance'), 'high-performance');
  assert.equal(gpuPreference('low-power'), 'low-power');
  assert.equal(gpuPreference('nvidia'), 'default');
  const stats = frameStats([16, 16, 16, 16, 100]);
  assert.equal(stats.median, 16); assert.equal(stats.p95, 100);
  assert.ok(stats.fps < 31); // Don't hide a hitch by reporting only median FPS.
});

test('instance compaction preserves shadow-only casters and restores original transforms', () => {
  const geometry = new THREE.BoxGeometry(4, 8, 4), material = new THREE.MeshStandardMaterial();
  const matrices = [new THREE.Matrix4().makeTranslation(0, 0, -20), new THREE.Matrix4().makeTranslation(0, 0, 1000)];
  const batch = new InstanceVisibility(geometry, material, matrices);
  const view = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().makePerspective(-1, 1, 1, -1, 1, 2000));
  assert.equal(batch.update([view]), 1);
  const shadow = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().makePerspective(-1, 1, 1, -1, 1, 2000).multiply(new THREE.Matrix4().makeRotationY(Math.PI)));
  assert.equal(batch.update([view, shadow]), 2);
  const actual = new THREE.Matrix4(); batch.mesh.getMatrixAt(1, actual);
  assert.deepEqual(actual.elements, matrices[1].elements);
  const version = batch.mesh.instanceMatrix.version;
  batch.update([view, shadow]);
  assert.equal(batch.mesh.instanceMatrix.version, version);
  assert.equal(batch.mesh.geometry, geometry); assert.equal(batch.mesh.material, material);
});
