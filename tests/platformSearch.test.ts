import test from 'node:test';
import assert from 'node:assert/strict';
import { diversifyPublicSearchResults, maxPublicSearchScore, normalizePublicSearchQuery } from '../services/platformSearchService';

test('universal search normalizes live typeahead input and ranks exact/prefix/substring matches', () => {
  assert.equal(normalizePublicSearchQuery('  Night   RUN '), 'night run');
  assert.equal(maxPublicSearchScore(['Night Run'], 'night run'), 3);
  assert.equal(maxPublicSearchScore(['Night Runner'], 'night run'), 2);
  assert.equal(maxPublicSearchScore(['The Night Run Sessions'], 'night run'), 1);
  assert.equal(maxPublicSearchScore(['Run through a quiet night'], 'night run'), 0.75);
});

test('universal results remain diverse when one public catalog dominates', () => {
  const rows = [
    ...Array.from({ length: 9 }, (_, index) => ({ id: `track-${index}`, type: 'MUSIC', _score: 3 - index / 100 })),
    { id: 'person', type: 'USER', _score: 2.5 },
    { id: 'post', type: 'POST', _score: 2.4 },
    { id: 'video', type: 'VIDEO', _score: 2.3 },
  ];
  const result = diversifyPublicSearchResults(rows, { USER: 0, MUSIC: 1, VIDEO: 2, POST: 3 }, 20, 4);
  assert.equal(result.filter(row => row.type === 'MUSIC').length, 4);
  assert.ok(result.some(row => row.type === 'USER'));
  assert.ok(result.some(row => row.type === 'POST'));
  assert.ok(result.some(row => row.type === 'VIDEO'));
});
