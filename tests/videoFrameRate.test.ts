import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeVideoFrameRate, sourceSafeRenderFrameRate, videoFrameTiming } from '../services/videoFrameRate';

test('normalizes measured NTSC and integer rates', () => {
  assert.equal(normalizeVideoFrameRate(29.968), 29.97);
  assert.equal(normalizeVideoFrameRate(59.96), 59.94);
  assert.equal(normalizeVideoFrameRate(30.2), 30);
});

test('source-safe delivery preserves the fastest active cadence up to 60 fps', () => {
  assert.equal(sourceSafeRenderFrameRate(24, [29.97, 60]), 60);
  assert.equal(sourceSafeRenderFrameRate(29.97, [24]), 29.97);
  assert.equal(sourceSafeRenderFrameRate(60, [120]), 60);
});

test('frame boundary timestamps remain contiguous without cumulative rounding drift', () => {
  for (const fps of [23.976, 24, 29.97, 30, 59.94, 60]) {
    for (let i = 0; i < 1000; i++) {
      const current = videoFrameTiming(i, fps);
      const next = videoFrameTiming(i + 1, fps);
      assert.equal(current.timestamp + current.duration, next.timestamp);
    }
    const end = videoFrameTiming(999, fps);
    assert.equal(end.timestamp + end.duration, Math.round(1000 * 1_000_000 / fps));
  }
});
