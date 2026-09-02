import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { trackFrameOffset, canShareTrack, rebaseVectorTrack, rebasePlanarTrack } from '../services/fabula/trackShare';
import { createVectorTrack, upsertTrackSample, sampleTrackAt } from '../services/fabula/vectorTrack';
import { createPlanarSequence, referenceSample, upsertPlanarSample, samplePlanarAt } from '../services/fabula/planarSequence';

describe('Track sharing between clips', () => {
  it('re-bases by source time, not timeline position', () => {
    const src = { start: 10, srcIn: 2, duration: 4, assetId: 'a' }, dst = { start: 30, srcIn: 1, duration: 6, assetId: 'a' };
    assert.equal(trackFrameOffset(src, dst, 24), 24);           // src local 0 = source time 2s = dst local 1s
    assert.deepEqual(canShareTrack(src, dst, 24, { start: 0, end: 48 }), { ok: true });
    assert.equal(canShareTrack(src, { ...dst, assetId: 'b' }, 24, { start: 0, end: 48 }).ok, false);
    assert.equal(canShareTrack(src, { ...dst, srcIn: 20 }, 24, { start: 0, end: 48 }).ok, false);
  });
  it('shifts point and planar samples', () => {
    let vt = createVectorTrack('a', 24, 640, 360, 'pt', 'pt');
    vt = upsertTrackSample(vt, { frame: 0, x: .5, y: .5, confidence: 1, error: 0 });
    vt = upsertTrackSample(vt, { frame: 24, x: .6, y: .5, confidence: 1, error: 0 });
    const shifted = rebaseVectorTrack(vt, 12);
    assert.equal(shifted.samples[0].frame, 12);
    assert.ok(Math.abs(sampleTrackAt(shifted, 24)!.x - .55) < 1e-9);
    let seq = createPlanarSequence('a', 24, 0, [{ x: .2, y: .2 }, { x: .6, y: .2 }, { x: .6, y: .6 }, { x: .2, y: .6 }], 'p');
    seq = upsertPlanarSample(seq, referenceSample(seq));
    const s2 = rebasePlanarTrack(seq, -5);
    assert.equal(s2.referenceFrame, -5); assert.equal(s2.samples[0].frame, -5);
    assert.ok(samplePlanarAt(s2, 0));
  });
});
