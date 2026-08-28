import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  growTree, skeletonAtGrowth, skeletonCost, TREE_SPECIES, TREE_SPECIES_IDS,
} from '../components/museion/flora/TreeGrower.ts';

const oak = TREE_SPECIES.oak;

test('a tree grows: segments, leaves and real height', () => {
  const sk = growTree(oak, 1);
  assert.ok(sk.segments.length > 20, `expected a branching tree, got ${sk.segments.length} segments`);
  assert.ok(sk.leaves.length > 0, 'a broadleaf must produce leaves');
  assert.ok(sk.height > oak.trunkHeight, 'crown must rise above the trunk');
  assert.equal(sk.species, 'oak');
});

test('deterministic — same seed is the same tree, different seeds differ', () => {
  const a = growTree(oak, 42);
  const b = growTree(oak, 42);
  assert.equal(JSON.stringify(a), JSON.stringify(b), 'same seed must be byte-identical');
  const c = growTree(oak, 43);
  assert.notEqual(JSON.stringify(a), JSON.stringify(c), 'different seeds must vary');
});

test('the trunk starts at the origin and every segment tapers', () => {
  const sk = growTree(oak, 7);
  const trunk = sk.segments.find((s) => s.depth === 0)!;
  assert.equal(trunk.x0, 0); assert.equal(trunk.y0, 0); assert.equal(trunk.z0, 0);
  assert.equal(trunk.bornAt, 0, 'the trunk is present from the first frame');
  for (const s of sk.segments) {
    assert.ok(s.r1 <= s.r0 + 1e-9, `segment at depth ${s.depth} widens toward its tip`);
    assert.ok(s.r0 > 0 && s.r1 > 0, 'radii stay positive');
    assert.ok(Number.isFinite(s.x1) && Number.isFinite(s.y1) && Number.isFinite(s.z1));
  }
});

test('recursion respects the species depth', () => {
  const sk = growTree(oak, 3);
  const deepest = Math.max(...sk.segments.map((s) => s.depth));
  assert.equal(deepest, oak.depth);
});

test('growth reveals trunk first, twigs last, and is monotone', () => {
  const sk = growTree(oak, 5);
  const seed = skeletonAtGrowth(sk, 0.02);
  const half = skeletonAtGrowth(sk, 0.5);
  const full = skeletonAtGrowth(sk, 1);

  assert.ok(seed.segments.length >= 1, 'a seedling still shows its trunk');
  assert.equal(Math.max(...seed.segments.map((s) => s.depth)), 0, 'only the trunk exists early');
  assert.ok(half.segments.length > seed.segments.length);
  assert.ok(full.segments.length > half.segments.length);
  assert.equal(full.segments.length, sk.segments.length, 'growth 1 is the whole tree');
  assert.ok(full.height > half.height && half.height > seed.height, 'height increases with growth');

  // never taller than mature, at any sampled point
  for (let g = 0; g <= 1.0001; g += 0.05) {
    assert.ok(skeletonAtGrowth(sk, g).height <= sk.height + 1e-9, `overshoot at g=${g.toFixed(2)}`);
  }
});

test('growth clamps outside 0..1', () => {
  const sk = growTree(oak, 9);
  assert.equal(skeletonAtGrowth(sk, -5).segments.length, skeletonAtGrowth(sk, 0).segments.length);
  assert.equal(skeletonAtGrowth(sk, 99).segments.length, sk.segments.length);
});

test('leaves only appear once their twig has, and scale in', () => {
  const sk = growTree(oak, 11);
  const early = skeletonAtGrowth(sk, 0.3);
  assert.equal(early.leaves.length, 0, 'no leaves before the crown exists');
  const mature = skeletonAtGrowth(sk, 1);
  assert.equal(mature.leaves.length, sk.leaves.length);
  for (const l of mature.leaves) assert.ok(l.scale > 0);
});

test('every archetype produces a distinct, finite silhouette', () => {
  assert.ok(TREE_SPECIES_IDS.length >= 5, 'Phase I ships five archetypes');
  const heights = new Map<string, number>();
  for (const id of TREE_SPECIES_IDS) {
    const sk = growTree(TREE_SPECIES[id], 21);
    assert.ok(sk.segments.length > 3, `${id} produced almost nothing`);
    assert.ok(Number.isFinite(sk.height) && sk.height > 0, `${id} has no height`);
    heights.set(id, sk.height);
  }
  // a pine should out-top an oak; a baobab should be the stoutest trunk
  assert.ok(heights.get('pine')! > heights.get('oak')!, 'pine should be the tallest of the two');
  assert.ok(TREE_SPECIES.baobab.trunkRadius > TREE_SPECIES.birch.trunkRadius * 4);
});

test('willow weeps and pine does not (gravitropism sign is meaningful)', () => {
  assert.ok(TREE_SPECIES.willow.gravitropism < -0.3, 'willow must bend down hard');
  assert.ok(TREE_SPECIES.oak.gravitropism >= 0, 'oak holds its branches up');
});

test('cost estimate scales with the skeleton', () => {
  const sk = growTree(oak, 13);
  const cost = skeletonCost(sk);
  assert.equal(cost.leaves, sk.leaves.length);
  assert.ok(cost.vertices > sk.segments.length, 'each segment costs a ring of vertices');
});
