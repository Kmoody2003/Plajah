import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyAudioBindings, shapeSignal, hasAudioBindings, SILENT, AUDIO_SOURCES } from '../components/plajahPixels/engine/fx/audioReact';
import type { FxParam } from '../components/plajahPixels/engine/fx/effects';

const params: FxParam[] = [
  { key: 'size', label: 'Size', min: 0, max: 100, default: 20 },
  { key: 'amount', label: 'Amount', min: -1, max: 1, default: 0 },
];
const levels = { level: .5, bass: 1, mid: .25, treble: 0 };

describe('Beat Reactor bindings', () => {
  it('adds a fraction of the parameter range at full signal', () => {
    const out = applyAudioBindings([20, 0], params, { size: { source: 'bass', amount: .5 } }, levels);
    assert.deepEqual(out, [70, 0]);                        // 20 + 1.0 * 0.5 * (100 - 0)
    const half = applyAudioBindings([20, 0], params, { size: { source: 'level', amount: .5 } }, levels);
    assert.deepEqual(half, [45, 0]);                       // 20 + 0.5 * 0.5 * 100
  });

  it('clamps into the declared range and honours negative amounts', () => {
    assert.deepEqual(applyAudioBindings([20, 0], params, { size: { source: 'bass', amount: 5 } }, levels), [100, 0]);
    assert.deepEqual(applyAudioBindings([20, 0], params, { size: { source: 'bass', amount: -5 } }, levels), [0, 0]);
    // a range that starts negative still maps correctly: 0 + 1.0 * 0.5 * 2 = 1
    assert.deepEqual(applyAudioBindings([20, 0], params, { amount: { source: 'bass', amount: .5 } }, levels), [20, 1]);
  });

  it('leaves values alone with no bindings, silence, or an unknown parameter', () => {
    const base = [20, 0];
    assert.equal(applyAudioBindings(base, params, undefined, levels), base);
    assert.equal(applyAudioBindings(base, params, {}, levels), base);
    assert.deepEqual(applyAudioBindings(base, params, { size: { source: 'bass', amount: .5 } }, SILENT), [20, 0]);
    assert.deepEqual(applyAudioBindings(base, params, { nope: { source: 'bass', amount: .5 } }, levels), [20, 0]);
    assert.deepEqual(applyAudioBindings(base, params, { size: { source: 'treble', amount: .5 } }, levels), [20, 0]);
  });

  it('shapes a channel by threshold, gamma and invert', () => {
    assert.equal(shapeSignal(.5, { source: 'level', amount: 1 }), .5);
    assert.equal(shapeSignal(.4, { source: 'level', amount: 1, threshold: .5 }), 0);      // under the gate
    assert.equal(shapeSignal(.75, { source: 'level', amount: 1, threshold: .5 }), .5);    // rescaled above it
    assert.equal(shapeSignal(.5, { source: 'level', amount: 1, gamma: 2 }), .25);         // peaks only
    assert.equal(shapeSignal(.25, { source: 'level', amount: 1, invert: true }), .75);
    assert.equal(shapeSignal(2, { source: 'level', amount: 1 }), 1);                      // clamped
    assert.equal(shapeSignal(.9, { source: 'level', amount: 1, threshold: 1 }), 0);       // gate fully closed
  });

  it('reports whether an instance reacts at all', () => {
    assert.equal(hasAudioBindings(undefined), false);
    assert.equal(hasAudioBindings({}), false);
    assert.equal(hasAudioBindings({ size: { source: 'bass', amount: 0 } }), false);
    assert.equal(hasAudioBindings({ size: { source: 'bass', amount: .3 } }), true);
    assert.equal(AUDIO_SOURCES.length, 4);
  });
});
