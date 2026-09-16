import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MATERIAL_SHADER_WORKS, materialShaderSource } from '../components/plajahPixels/engine/presets/materialShaders';
import { extractChroma, smoothChroma, writeChromaAlpha } from '../components/plajahPixels/engine/core/audioChroma';

describe('Plajah material shader volumes', () => {
  it('ships twelve fluid and twelve glass works with unique production ids', () => {
    assert.equal(MATERIAL_SHADER_WORKS.length, 24);
    assert.equal(MATERIAL_SHADER_WORKS.filter(w => w.series === 'VI').length, 12);
    assert.equal(MATERIAL_SHADER_WORKS.filter(w => w.series === 'VII').length, 12);
    assert.equal(new Set(MATERIAL_SHADER_WORKS.map(w => w.id)).size, 24);
    assert.equal(new Set(MATERIAL_SHADER_WORKS.map(w => w.name)).size, 24);
  });

  it('uses the shared shader ABI and real pitch-class chroma', () => {
    for (const work of MATERIAL_SHADER_WORKS) {
      assert.equal(materialShaderSource(work.id), work.src);
      assert.match(work.src, /void\s+mainImage\s*\(/, work.id);
      assert.match(work.src, /note12\s*\(/, work.id);
      assert.match(work.src, /texture\s*\(\s*iChannel0/, work.id);
      assert.equal(work.params.length, 4, work.id);
      assert.ok(work.reacts.some(([driver]) => driver.includes('C–B')), work.id);
    }
  });
});

describe('Pitch-class audio texture', () => {
  it('detects a synthetic C-major triad as C, E and G', () => {
    const sampleRate = 48_000, bins = 2048, fftSize = bins * 2;
    const fft = new Uint8Array(bins);
    for (const hz of [261.6256, 329.6276, 391.9954]) fft[Math.round(hz * fftSize / sampleRate)] = 255;
    const c = extractChroma(fft, sampleRate);
    assert.ok(c[0] > .65, `C=${c[0]}`); assert.ok(c[4] > .65, `E=${c[4]}`); assert.ok(c[7] > .65, `G=${c[7]}`);
    assert.ok(c[0] > c[1] && c[4] > c[5] && c[7] > c[8]);
  });

  it('writes chroma only into the first twelve alpha texels and smooths attack/release', () => {
    const px = new Uint8Array(512 * 2 * 4).fill(17), target = new Float32Array(12); target[3] = 1;
    const state = smoothChroma(new Float32Array(12), target, .1);
    assert.ok(state[3] > .8 && state[3] < 1);
    writeChromaAlpha(px, state);
    assert.equal(px[3 * 4], 17); assert.ok(px[3 * 4 + 3] > 200); assert.equal(px[12 * 4 + 3], 17);
    const beforeRelease = state[3];
    const released = smoothChroma(state, new Float32Array(12), .1);
    assert.ok(released[3] > 0 && released[3] < beforeRelease);
  });
});
