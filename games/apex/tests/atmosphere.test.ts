import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Atmosphere, meanHeightDensity } from '../src/atmosphere';

test('height integration agrees with numerical quadrature, including horizontal rays', () => {
  for (const [a, b] of [[0, 0], [12, 12.00001], [0, 400], [400, 0], [2000, 2100]]) {
    let integral = 0;
    for (let i = 0; i < 10000; i++) integral += Math.exp(-(a + (b - a) * (i + 0.5) / 10000) / 40) / 10000;
    const actual = meanHeightDensity(a, b, 1 / 40);
    assert.ok(Math.abs(integral - actual) < 1e-7);
    assert.equal(actual, meanHeightDensity(b, a, 1 / 40));
    assert.ok(Number.isFinite(actual) && actual >= 0 && actual <= 1);
  }
});

test('material patch composes with prior hooks and is idempotent', () => {
  const atmosphere = new Atmosphere(), mat = new THREE.MeshStandardMaterial();
  mat.onBeforeCompile = (shader) => { shader.uniforms.prior = { value: 7 }; };
  const chunk = THREE.ShaderChunk.fog_fragment;
  assert.ok(atmosphere.patchMaterial(mat));
  assert.equal(atmosphere.patchMaterial(mat), false);
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  mat.onBeforeCompile(shader as any, {} as THREE.WebGLRenderer);
  assert.equal((shader.uniforms as any).prior.value, 7);
  assert.ok(shader.vertexShader.includes('apexCameraWorld * mvPosition'));
  assert.ok(shader.fragmentShader.includes('float opticalDepth'));
  assert.ok(mat.customProgramCacheKey().endsWith('|apex-atmosphere-v1'));
  assert.equal(THREE.ShaderChunk.fog_fragment, chunk);
  assert.equal(atmosphere.patchMaterial(new THREE.ShaderMaterial()), false);
  assert.equal(atmosphere.patchMaterial(new THREE.MeshBasicMaterial({ fog: false })), false);
});

test('map mode disables atmosphere and camera uniforms follow final view', () => {
  const atmosphere = new Atmosphere(), scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  camera.position.set(5, 20, 8);
  atmosphere.update(scene, camera, new THREE.Vector3(1, 1, 0), new THREE.Color('white'), 0.8, 1, 0, true, 0);
  assert.equal(atmosphere.uniforms.apexAtmosphere.value.x, 0);
  assert.deepEqual(atmosphere.uniforms.apexCameraWorld.value.elements, camera.matrixWorld.elements);
  atmosphere.update(scene, camera, new THREE.Vector3(1, 1, 0), new THREE.Color('white'), 0.8, 1, 1, false, 1);
  assert.ok(atmosphere.uniforms.apexAtmosphere.value.x > 0);
  assert.equal(atmosphere.uniforms.apexAtmosphere.value.w, 0);
});
