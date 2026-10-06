// liveLyrics line assembly. Run: npx tsx --test tests/amboLiveLyrics.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLineBuilder } from '../services/ambo/liveLyrics';

test('words grow a line in place and roll at maxWords', () => {
  const b = createLineBuilder(4, 10, 2);
  b.push('hello there', 1); b.push('my friends today', 1.5);
  assert.deepEqual(b.lines().map(l => l.text), ['hello there my friends', 'today']);
});
test('a pause starts a new line', () => {
  const b = createLineBuilder(9, 10, 2);
  b.push('one two', 1); b.push('three', 5);
  assert.equal(b.lines().length, 2);
});
test('keeps only the newest lines', () => {
  const b = createLineBuilder(1, 3, 2);
  b.push('a b c d e', 1);
  assert.deepEqual(b.lines().map(l => l.text), ['c', 'd', 'e']);
});
