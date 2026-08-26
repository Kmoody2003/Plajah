import assert from 'node:assert/strict';
import test from 'node:test';
import { selectTelaArtworkRegions } from '../services/telaDocumentIntelligence';

test('semantic artwork nouns invoke drawing even without the word illustration', () => {
  const regions = selectTelaArtworkRegions([
    { source: 'DENSE_REGION', bboxes: [[120, 160, 360, 430]], labels: ['a hand drawn book bag with two straps'] },
  ], [], 800, 1000);
  assert.equal(regions.length, 1);
  assert.match(regions[0].label, /book bag/);
});

test('object detection invokes drawing for a backpack while OCR text blocks are rejected', () => {
  const regions = selectTelaArtworkRegions([
    { source: 'OBJECT', bboxes: [[100, 130, 330, 420]], labels: ['backpack'] },
    { source: 'DENSE_REGION', bboxes: [[80, 30, 600, 95]], labels: ['worksheet title text'] },
  ], [{ x: 80, y: 30, w: 520, h: 65, text: 'MY SCHOOL DAY' }], 800, 1000);
  assert.deepEqual(regions.map(region => region.label), ['backpack']);
});
