import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveKeyframedParams, resolveInstanceForFrame } from '../services/fabula/forgeBindings';
import { addKey } from '../services/fabula/keyframes';
import { createEffectInstance } from '../services/fabula/forgeEffects';
import { FX_EFFECTS } from '../components/plajahPixels/engine/fx/effects';
import { createVectorTrack, upsertTrackSample } from '../services/fabula/vectorTrack';

const effect = FX_EFFECTS.find(e => e.id === 'problur')!;
const param = effect.params[0];                 // radius
const frame = { w: 16, h: 9 };
const base = () => createEffectInstance('problur', undefined, 'i1');

function animated(from: number, to: number, at = 1) {
  const inst: any = base();
  inst.params = { ...inst.params, [param.key]: from };
  inst.kf = { [param.key]: addKey(addKey(undefined, 0, from, 'linear'), at, to, 'linear') };
  return inst;
}

describe('Forge effect-parameter keyframes', () => {
  it('samples an animated parameter over clip-local time', () => {
    const inst = animated(0, 40, 1);
    assert.equal(resolveKeyframedParams(inst, effect, 0)[param.key], 0);
    assert.equal(resolveKeyframedParams(inst, effect, .5)[param.key], 20);
    assert.equal(resolveKeyframedParams(inst, effect, 1)[param.key], 40);
    assert.equal(resolveKeyframedParams(inst, effect, 5)[param.key], 40);   // holds past the last key
  });

  it('clamps sampled values into the declared range', () => {
    const inst: any = base();
    inst.kf = { [param.key]: addKey(addKey(undefined, 0, param.min - 500, 'linear'), 1, param.max + 500, 'linear') };
    assert.equal(resolveKeyframedParams(inst, effect, 0)[param.key], param.min);
    assert.equal(resolveKeyframedParams(inst, effect, 1)[param.key], param.max);
  });

  it('passes params straight through when nothing is animated', () => {
    const plain = base();
    assert.equal(resolveKeyframedParams(plain, effect, .5), plain.params);
    const emptyTrack: any = { ...plain, kf: { [param.key]: [] } };
    assert.equal(resolveKeyframedParams(emptyTrack, effect, .5), emptyTrack.params);
    const unknownParam: any = { ...plain, kf: { nope: addKey(undefined, 0, 1) } };
    assert.deepEqual(resolveKeyframedParams(unknownParam, effect, .5), plain.params);
  });

  it('reaches the renderer through the shared resolver', () => {
    const inst = animated(0, 40, 1);
    const mid = resolveInstanceForFrame(inst, effect, {}, .5, frame);
    assert.equal(mid.params[param.key], 20);
    const start = resolveInstanceForFrame(inst, effect, {}, 0, frame);
    assert.equal(start.params[param.key], 0);
  });

  it('lets an explicit track link override the keyframed value', () => {
    let vt = createVectorTrack('a', 24, 640, 360, 'pt', 'pt');
    vt = upsertTrackSample(vt, { frame: 0, x: 1, y: .5, confidence: 1, error: 0 });
    const inst: any = animated(0, 40, 1);
    inst.bindings = { [param.key]: { source: 'pointX' } };
    // keyframe alone would give 20 at t=0.5; the link maps pointX=1 to the top of the range
    assert.equal(resolveInstanceForFrame({ ...inst, bindings: undefined }, effect, {}, .5, frame).params[param.key], 20);
    assert.equal(resolveInstanceForFrame(inst, effect, { vectorTrack: vt, fps: 24 }, .5, frame).params[param.key], param.max);
  });
});
