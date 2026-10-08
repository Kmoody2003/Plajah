import { test } from 'node:test';
import assert from 'node:assert/strict';
import { squareGridStyle, squareMinPx, SQUARE_MIN_PX, SQUARE_SNAPSHOT_PX } from '../components/scripture/AmboSquareThumb';
import { initialsOf } from '../components/scripture/AmboPoster';

test('square grid never goes below the legible minimum', () => {
  assert.equal(squareMinPx(), SQUARE_MIN_PX);
  assert.equal(squareMinPx(40), SQUARE_MIN_PX);
  assert.equal(squareMinPx(Number.NaN), SQUARE_MIN_PX);
  assert.equal(squareMinPx(180), 180);
  assert.ok(SQUARE_MIN_PX >= 110);
});

test('square grid scrolls instead of squashing rows', () => {
  const s = squareGridStyle(64) as Record<string, unknown>;
  assert.equal(s.gridTemplateColumns, `repeat(auto-fill, minmax(${SQUARE_MIN_PX}px, 1fr))`);
  assert.equal(s.gridAutoRows, 'max-content');
  assert.equal(s.alignContent, 'start');
  assert.equal(s.alignItems, 'start');
});

test('snapshots are rasterised square', () => {
  assert.ok(SQUARE_SNAPSHOT_PX >= 192);
});

test('placeholder initials', () => {
  assert.equal(initialsOf('Flux Field'), 'FF');
  assert.equal(initialsOf('Aurora'), 'AU');
  assert.equal(initialsOf(''), '?');
});
