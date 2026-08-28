import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WINDOW_DEFAULT, isWindowEnabled } from '../services/fabula/gradeWindow.ts';
import { isGradeIdentity } from '../components/plajahPixels/engine/core/compositor.ts';

test('a window is enabled unless explicitly disabled', () => {
  assert.ok(!isWindowEnabled(null));
  assert.ok(!isWindowEnabled(undefined));
  assert.ok(isWindowEnabled({ ...WINDOW_DEFAULT }));
  assert.ok(!isWindowEnabled({ ...WINDOW_DEFAULT, enabled: false }));
});

test('a window ALONE does not make a grade non-identity (it only modulates an existing grade)', () => {
  // window without wheels/curves/qualifier → still identity (the caller must gate on a grade)
  assert.ok(isGradeIdentity({ window: { shape: 'ellipse', x: 0.5, y: 0.5, w: 0.3, h: 0.3, feather: 0.1 } }));
});

test('window rides along with a real grade', () => {
  assert.ok(!isGradeIdentity({ sat: 1.4, window: { shape: 'rect', x: 0.5, y: 0.5, w: 0.2, h: 0.2, feather: 0.1 } }));
});

test('default window is a centred ellipse with feather', () => {
  assert.equal(WINDOW_DEFAULT.shape, 'ellipse');
  assert.equal(WINDOW_DEFAULT.x, 0.5);
  assert.equal(WINDOW_DEFAULT.y, 0.5);
  assert.ok(WINDOW_DEFAULT.feather > 0);
});
