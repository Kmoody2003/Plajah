import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isGradeIdentity } from '../components/plajahPixels/engine/core/compositor';
import { evalCurve, buildCurveLut, LUT_SIZE } from '../services/fabula/gradeCurves';

test('color wheel lift/gamma/gain identity check', () => {
  const neutralGrade = {
    wheel: {
      lift: [0, 0, 0],
      gamma: [1, 1, 1],
      gain: [1, 1, 1],
      temp: 0,
      tint: 0,
    },
  };
  assert.ok(isGradeIdentity(neutralGrade));
});

test('lift / gamma / gain transformations violate identity', () => {
  const graded = {
    wheel: {
      lift: [-0.04, 0.01, 0.06],
      gamma: [1.02, 0.98, 0.94],
      gain: [1.12, 1.02, 0.90],
      temp: 0.05,
      tint: -0.02,
    },
  };
  assert.ok(!isGradeIdentity(graded));
});

test('monitor worker message payload serialization integrity', () => {
  const sampleFrameMessage = {
    type: 'frame',
    width: 1920,
    height: 1080,
    grade: {
      lift: [0.02, 0, -0.02],
      gamma: [1.05, 1.0, 0.95],
      gain: [1.1, 1.0, 0.9],
    },
    grades: [
      {
        wheel: { lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1.2, 1.2, 1.2] },
        window: { shape: 'ellipse', x: 0.5, y: 0.5, w: 0.25, h: 0.25, feather: 0.1, enabled: true },
      },
    ],
  };

  const jsonStr = JSON.stringify(sampleFrameMessage);
  const parsed = JSON.parse(jsonStr);

  assert.equal(parsed.type, 'frame');
  assert.equal(parsed.width, 1920);
  assert.equal(parsed.height, 1080);
  assert.equal(parsed.grade.gain[0], 1.1);
  assert.equal(parsed.grades[0].window.shape, 'ellipse');
});

test('LUT tone curve generation produces 1024 bytes and valid RGBA channels', () => {
  const lut = buildCurveLut({
    master: [[0, 0], [0.5, 0.6], [1, 1]],
    r: [[0, 0], [0.5, 0.55], [1, 1]],
    g: [[0, 0], [1, 1]],
    b: [[0, 0], [0.5, 0.45], [1, 1]],
  });

  assert.equal(lut.length, 1024);
  assert.equal(lut.byteLength, 1024);
  // Red midtone is lifted
  assert.ok(lut[128 * 4 + 0] > 128);
  // Blue midtone is pulled down
  assert.ok(lut[128 * 4 + 2] < 128);
  // Master alpha is lifted
  assert.ok(lut[128 * 4 + 3] > 128);
});
