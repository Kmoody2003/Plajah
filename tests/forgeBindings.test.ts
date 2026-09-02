import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveBoundParams, maskOutlineAt, maskTransformAt, trackValuesAt, MASK_DEFAULT, type EffectMask } from '../services/fabula/forgeBindings';
import { createVectorTrack, upsertTrackSample } from '../services/fabula/vectorTrack';
import { createPlanarSequence, referenceSample, upsertPlanarSample } from '../services/fabula/planarSequence';
import { transformPoint, type Quad } from '../services/fabula/planarTrack';
import { FX_EFFECTS } from '../components/plajahPixels/engine/fx/effects';
import { createEffectInstance } from '../services/fabula/forgeEffects';

const corners: Quad = [{ x: .2, y: .2 }, { x: .6, y: .2 }, { x: .6, y: .6 }, { x: .2, y: .6 }];
function tracks() {
  let vt = createVectorTrack('a', 24, 640, 360, 'pt', 'pt');
  vt = upsertTrackSample(vt, { frame: 0, x: .3, y: .4, confidence: 1, error: 0 });
  vt = upsertTrackSample(vt, { frame: 24, x: .5, y: .6, confidence: 1, error: 0 });
  let seq = createPlanarSequence('a', 24, 0, corners, 'pl');
  seq = upsertPlanarSample(seq, referenceSample(seq));
  const moved: any = [1.2, 0, .1, 0, 1.2, .05, 0, 0, 1];
  seq = upsertPlanarSample(seq, { ...referenceSample(seq), frame: 24, matrix: moved, corners: corners.map(p => transformPoint(moved, p)) as Quad });
  return { vectorTrack: vt, planarTrack: seq, fps: 24 };
}

describe('Forge bindings + masks', () => {
  it('reads point and planar values at a clip-local time', () => {
    const v = trackValuesAt(tracks(), .5);
    assert.ok(Math.abs(v.pointX! - .4) < 1e-9 && Math.abs(v.pointY! - .5) < 1e-9);
    assert.ok(v.planarCX! > .4 && v.planarScale! > 1 && v.planarScale! < 1.2);
  });

  it('maps a bound param across its range and clamps', () => {
    const effect = FX_EFFECTS.find(e => e.params.some(p => p.key === 'centerX')) || FX_EFFECTS[0];
    const key = effect.params[0].key; const param = effect.params[0];
    const inst: any = { ...createEffectInstance(effect.id, undefined, 'i1'), bindings: { [key]: { source: 'pointX' } } };
    const p = resolveBoundParams(inst, effect, tracks(), 1);           // pointX = .5 at frame 24
    const expect = param.min + .5 * (param.max - param.min);
    assert.ok(Math.abs(p[key] - expect) < 1e-9, `${p[key]} vs ${expect}`);
    const q = resolveBoundParams({ ...inst, bindings: { [key]: { source: 'pointX', offset: param.max, scale: param.max } } }, effect, tracks(), 1);
    assert.equal(q[key], param.max);
    assert.equal(resolveBoundParams({ ...inst, bindings: {} }, effect, tracks(), 1), inst.params);
  });

  it('moves a planar-tracked mask with the surface and leaves untracked masks alone', () => {
    const mask: EffectMask = { ...MASK_DEFAULT, shape: 'rect', cx: .4, cy: .4, w: .2, h: .2, track: 'planar', refFrame: 0 };
    const M = maskTransformAt(mask, tracks(), 1);
    const p = transformPoint(M, { x: .4, y: .4 });
    assert.ok(Math.abs(p.x - (.4 * 1.2 + .1)) < 1e-9 && Math.abs(p.y - (.4 * 1.2 + .05)) < 1e-9);
    const still = maskOutlineAt({ ...mask, track: 'none' }, tracks(), 1);
    assert.equal(still.length, 4); assert.ok(Math.abs(still[0].x - .3) < 1e-9);
    const pt = maskOutlineAt({ ...mask, track: 'point' }, tracks(), 1);
    assert.ok(Math.abs(pt[0].x - (.3 + .2)) < 1e-9);
  });

  it('builds ellipse and polygon outlines', () => {
    const e = maskOutlineAt({ ...MASK_DEFAULT, shape: 'ellipse', cx: .5, cy: .5, w: .4, h: .2 }, {}, 0, 8);
    assert.equal(e.length, 8); assert.ok(Math.abs(e[0].x - .7) < 1e-9 && Math.abs(e[0].y - .5) < 1e-9);
    const poly = maskOutlineAt({ ...MASK_DEFAULT, shape: 'poly', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: .5, y: 1 }] }, {}, 0);
    assert.equal(poly.length, 3);
  });
});

describe('Forge subject matte', () => {
  it('flags subject masks for the renderer instead of rasterising a shape', async () => {
    const { resolveInstanceForFrame } = await import('../services/fabula/forgeBindings');
    const inst: any = { id: 'i', effectId: 'invert', version: 1, enabled: true, mix: 1, params: { amt: 1 }, mask: { kind: 'subject', shape: 'ellipse', cx: .5, cy: .5, w: .5, h: .5, rotation: 0, feather: 0, invert: true, enabled: true } };
    const r: any = resolveInstanceForFrame(inst, undefined, {}, 0, { w: 16, h: 9 });
    assert.equal(r.subjectMask, true); assert.equal(r.maskInvert, true); assert.equal(r.maskElement, undefined);
  });
});
