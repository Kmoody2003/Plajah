import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dragVec } from '../services/living/runtime/engine';

test('drag hint direction follows where the drag really goes', () => {
  assert.deepEqual(dragVec({ axis: 'y', bounds: { minY: -200, maxY: 0 } }), { dx: 0, dy: -200 });   // pull the blanket up
  assert.deepEqual(dragVec({ axis: 'y', bounds: { minY: 0, maxY: 300 } }), { dx: 0, dy: 300 });     // dive down
  assert.deepEqual(dragVec({ axis: 'x', bounds: { minX: -150, maxX: 50 } }), { dx: -150, dy: 0 });
  assert.deepEqual(dragVec({ axis: 'both', snapTo: [{ x: 120, y: -80, r: 30 }] }), { dx: 120, dy: -80 });   // toward the snap spot
  assert.deepEqual(dragVec({ axis: 'y' }), { dx: 0, dy: 1 });                                         // no bounds: a sensible default
  assert.deepEqual(dragVec({}), { dx: 1, dy: 0 });
});
