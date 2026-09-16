import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { motionKeys, thinKeys, adjustTransformXml } from '../services/fabula/fcpxmlTransform';
import { createPlanarSequence, referenceSample, upsertPlanarSample } from '../services/fabula/planarSequence';
import { createVectorTrack, upsertTrackSample } from '../services/fabula/vectorTrack';
import { transformPoint, type Quad } from '../services/fabula/planarTrack';

const corners: Quad = [{ x: .2, y: .2 }, { x: .6, y: .2 }, { x: .6, y: .6 }, { x: .2, y: .6 }];

describe('FCPXML transform keyframes from VectorTrack', () => {
  it('turns a planar stabilise into centre-relative pixel keys with y up', () => {
    let seq = createPlanarSequence('a', 24, 0, corners, 'p');
    seq = upsertPlanarSample(seq, referenceSample(seq));
    const moved: any = [1, 0, .1, 0, 1, .05, 0, 0, 1]; // surface moved right/down by (.1,.05)
    seq = upsertPlanarSample(seq, { ...referenceSample(seq), frame: 24, matrix: moved, corners: corners.map(p => transformPoint(moved, p)) as Quad });
    const keys = motionKeys({ trackMode: 'planar', planarTrack: seq }, 1.05, 24, 1920, 1080)!;
    assert.equal(keys.length, 25);
    assert.ok(Math.abs(keys[0].x) < 1e-6 && Math.abs(keys[0].y) < 1e-6 && Math.abs(keys[0].scale - 1) < 1e-6 && Math.abs(keys[0].rotation) < 1e-6);
    // stabilising moves the picture LEFT/UP by the surface motion: -0.1*1920, +0.05*1080 (y up)
    assert.ok(Math.abs(keys[24].x + 192) < 1e-6 && Math.abs(keys[24].y - 54) < 1e-6);
    assert.ok(Math.abs(keys[12].x + 96) < 1e-6);
  });

  it('point stabilise keys are the inverse translation', () => {
    let vt = createVectorTrack('a', 24, 640, 360, 'pt', 'pt');
    vt = upsertTrackSample(vt, { frame: 0, x: .5, y: .5, confidence: 1, error: 0 });
    vt = upsertTrackSample(vt, { frame: 12, x: .55, y: .45, confidence: 1, error: 0 });
    const keys = motionKeys({ trackMode: 'stabilize', vectorTrack: vt }, .55, 24, 1000, 500)!;
    assert.ok(Math.abs(keys[12].x + 50) < 1e-9 && Math.abs(keys[12].y + 25) < 1e-9);
    assert.equal(motionKeys({ trackMode: 'off' }, 1, 24, 1920, 1080), null);
  });

  it('thins linear runs and renders keyframe animation XML', () => {
    const keys = Array.from({ length: 10 }, (_, i) => ({ t: i / 24, x: i * 10, y: 0, scale: 1, rotation: 0 }));
    const thin = thinKeys(keys);
    assert.equal(thin.length, 2);
    const xml = adjustTransformXml(keys, s => `${Math.round(s * 24)}/24s`);
    assert.match(xml, /^<adjust-transform><param name="position"><keyframeAnimation><keyframe time="0\/24s" value="0 0"\/><keyframe time="9\/24s" value="90 0"\/>/);
    assert.match(xml, /<param name="rotation">/);
    const still = adjustTransformXml([{ t: 0, x: 5, y: -2, scale: 1.5, rotation: 10 }], s => `${s}s`);
    assert.equal(still, '<adjust-transform position="5 -2" scale="1.5 1.5" rotation="10"/>');
    assert.equal(adjustTransformXml(null, s => `${s}s`), '');
  });
});
