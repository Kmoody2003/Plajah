import assert from 'node:assert/strict';
import test from 'node:test';
import { matchLibraryAsset, instantiateAsset, reillustrateArtwork, ART_LIBRARY } from '../services/worksheetArtLibrary';
import type { TelaVectorObject } from '../types';

test('matcher maps real Florence labels + synonyms to library assets', () => {
  assert.equal(matchLibraryAsset('apple')?.label, 'apple');
  assert.equal(matchLibraryAsset('a hand drawn book bag')?.label, 'backpack'); // synonym "book bag"
  assert.equal(matchLibraryAsset('yellow star')?.label, 'star');
  assert.equal(matchLibraryAsset('a pencil')?.label, 'pencil');
  assert.equal(matchLibraryAsset('microscope'), null); // not in the library
});

test('instantiateAsset fits an asset inside the region box as editable PATH objects', () => {
  const apple = ART_LIBRARY.find(a => a.label === 'apple')!;
  const objs = instantiateAsset(apple, { x: 200, y: 300, w: 120, h: 140 }, 'r1');
  assert.ok(objs.length >= 3);
  assert.ok(objs.every(o => o.kind === 'PATH' && o.svgPathData));
  // every path sits inside the padded region box
  for (const o of objs) {
    assert.ok(o.x >= 200 - 1 && o.x + o.w <= 320 + 1 && o.y >= 300 - 1 && o.y + o.h <= 440 + 1);
  }
});

test('reillustrateArtwork swaps matched regions, keeps text/layout/unmatched art in z-order', () => {
  const mk = (over: Partial<TelaVectorObject>): TelaVectorObject => ({
    id: over.id!, kind: 'PATH', x: 0, y: 0, w: 10, h: 10, fill: '#000', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, ...over,
  });
  const input: TelaVectorObject[] = [
    mk({ id: 'layout', kind: 'LINE', reconstructionLayer: 'LAYOUT' }),
    mk({ id: 'art_apple_0', reconstructionLayer: 'ARTWORK', parentRegionId: 'rA', detectedLabel: 'apple', x: 100, y: 100, w: 60, h: 60 }),
    mk({ id: 'art_apple_1', reconstructionLayer: 'ARTWORK', parentRegionId: 'rA', detectedLabel: 'apple', x: 110, y: 110, w: 40, h: 40 }),
    mk({ id: 'art_unknown_0', reconstructionLayer: 'ARTWORK', parentRegionId: 'rB', detectedLabel: 'squiggle', x: 300, y: 100, w: 50, h: 50 }),
    mk({ id: 'text', kind: 'TEXT', reconstructionLayer: 'TEXT', text: 'hi' }),
  ];
  const { objects, replaced } = reillustrateArtwork(input);
  assert.deepEqual(replaced.map(r => r.label), ['apple']); // only the apple region matched
  assert.equal(objects[0].id, 'layout'); // z-order preserved
  assert.equal(objects[objects.length - 1].id, 'text');
  assert.ok(objects.some(o => o.detectedLabel === 'apple' && o.id.startsWith('reart_rA'))); // clean apple inserted
  assert.ok(!objects.some(o => o.id === 'art_apple_0')); // traced apple removed
  assert.ok(objects.some(o => o.id === 'art_unknown_0')); // unmatched artwork kept
});
