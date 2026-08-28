import { test } from 'node:test';
import assert from 'node:assert/strict';
import { growTree, skeletonAtGrowth, TREE_SPECIES } from '../components/museion/flora/TreeGrower.ts';
import { buildTreeGeometry, buildLeafMatrices, skeletonBounds } from '../components/museion/flora/treeGeometry.ts';

const sk = growTree(TREE_SPECIES.oak, 4);

test('geometry buffers are correctly sized and index-safe', () => {
  const R = 5;
  const g = buildTreeGeometry(sk, R);
  assert.equal(g.vertexCount, sk.segments.length * R * 2);
  assert.equal(g.positions.length, g.vertexCount * 3);
  assert.equal(g.normals.length, g.vertexCount * 3);
  assert.equal(g.uvs.length, g.vertexCount * 2);
  assert.equal(g.depths.length, g.vertexCount);
  assert.equal(g.triangleCount, sk.segments.length * R * 2);
  assert.equal(g.indices.length, g.triangleCount * 3);
  // every index must address a real vertex — a stray index is an instant GPU crash
  for (let i = 0; i < g.indices.length; i++) {
    assert.ok(g.indices[i] < g.vertexCount, `index ${i} out of range`);
  }
});

test('no NaNs anywhere in the buffers', () => {
  const g = buildTreeGeometry(sk, 5);
  for (const arr of [g.positions, g.normals, g.uvs, g.depths]) {
    for (let i = 0; i < arr.length; i++) assert.ok(Number.isFinite(arr[i]), `non-finite at ${i}`);
  }
});

test('normals are unit length (lighting depends on it)', () => {
  const g = buildTreeGeometry(sk, 6);
  for (let i = 0; i < g.vertexCount; i++) {
    const l = Math.hypot(g.normals[i * 3], g.normals[i * 3 + 1], g.normals[i * 3 + 2]);
    assert.ok(Math.abs(l - 1) < 1e-5, `normal ${i} has length ${l}`);
  }
});

test('radial segments clamp to a buildable minimum', () => {
  const low = buildTreeGeometry(sk, 1);
  assert.equal(low.vertexCount, sk.segments.length * 3 * 2, 'must clamp up to 3 sides');
});

test('vertex depths match their segment', () => {
  const R = 4;
  const g = buildTreeGeometry(sk, R);
  for (let s = 0; s < sk.segments.length; s++) {
    const at = g.depths[s * R * 2];
    assert.equal(at, sk.segments[s].depth);
  }
});

test('leaf matrices: one per leaf, affine, positioned at the leaf', () => {
  const { matrices, tints, count } = buildLeafMatrices(sk.leaves);
  assert.equal(count, sk.leaves.length);
  assert.equal(matrices.length, count * 16);
  assert.equal(tints.length, count);
  for (let i = 0; i < count; i++) {
    const o = i * 16;
    // translation column carries the leaf's own position
    assert.ok(Math.abs(matrices[o + 12] - sk.leaves[i].x) < 1e-6);
    assert.ok(Math.abs(matrices[o + 13] - sk.leaves[i].y) < 1e-6);
    assert.ok(Math.abs(matrices[o + 14] - sk.leaves[i].z) < 1e-6);
    assert.equal(matrices[o + 15], 1, 'bottom-right of an affine matrix is 1');
    assert.equal(matrices[o + 3], 0);
    for (let k = 0; k < 16; k++) assert.ok(Number.isFinite(matrices[o + k]), `NaN in matrix ${i}`);
  }
});

test('leaf basis columns stay orthogonal and scaled to the leaf', () => {
  const { matrices, count } = buildLeafMatrices(sk.leaves.slice(0, 40));
  for (let i = 0; i < count; i++) {
    const o = i * 16;
    const a = [matrices[o], matrices[o + 1], matrices[o + 2]];
    const b = [matrices[o + 4], matrices[o + 5], matrices[o + 6]];
    const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const la = Math.hypot(...a as [number, number, number]);
    assert.ok(Math.abs(dot) < 1e-4 * (la * la + 1), `columns not orthogonal on leaf ${i}`);
    assert.ok(la > 0, 'scale must be positive');
  }
});

test('an empty skeleton produces empty buffers, not a crash', () => {
  const empty = { segments: [], leaves: [], height: 0, species: 'none' };
  const g = buildTreeGeometry(empty as any, 5);
  assert.equal(g.vertexCount, 0);
  assert.equal(g.indices.length, 0);
  const lm = buildLeafMatrices([]);
  assert.equal(lm.count, 0);
  const b = skeletonBounds(empty as any);
  assert.deepEqual(b.min, [0, 0, 0]);
});

test('bounds enclose the tree and grow with it', () => {
  const b = skeletonBounds(sk);
  assert.ok(b.max[1] >= sk.height - 1e-6, 'bounds must reach the crown');
  assert.ok(b.min[1] <= 0 + 1e-6, 'bounds start at the ground');
  const seedling = skeletonBounds(skeletonAtGrowth(sk, 0.15));
  assert.ok(seedling.max[1] < b.max[1], 'a seedling is shorter than the mature tree');
});
