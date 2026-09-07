import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createPlanarSequence, trackPlanarFrame, upsertPlanarSample, samplePlanarAt, planarStabilizeAt, cornerPinAt, planarTrackedRange, referenceSample, surfaceFeatures } from '../services/fabula/planarSequence';
import { transformPoint, invertHomography, type Quad } from '../services/fabula/planarTrack';

// Procedural high-frequency texture, sampled through an inverse homography so a frame shows
// the reference surface moved by a known plane motion (not just a translation).
const W = 96, H = 72;
const tex = (x: number, y: number) => 128 + 50 * Math.sin(x * .61) * Math.cos(y * .47) + 35 * Math.sin(x * .23 + y * .37) + 25 * Math.cos(x * .11 - y * .29) + 15 * Math.sin((x + y) * .83);
function warped(m: [number,number,number,number,number,number,number,number,number]) {
  const inv = invertHomography(m)!; const data = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = transformPoint(inv, { x: x / (W - 1), y: y / (H - 1) });
    data[y * W + x] = Math.max(0, Math.min(255, Math.round(tex(p.x * (W - 1), p.y * (H - 1)))));
  }
  return { width: W, height: H, data };
}
const translate = (dx: number, dy: number) => warped([1,0,dx, 0,1,dy, 0,0,1]);
const corners: Quad = [{ x: .25, y: .25 }, { x: .7, y: .25 }, { x: .7, y: .72 }, { x: .25, y: .72 }];

describe('VectorTrack planar sequence', () => {
  it('tracks four features and persists a frame homography', () => {
    const seq = createPlanarSequence('clip', 24, 0, corners, 'p1');
    const result = trackPlanarFrame(seq, translate(0, 0), translate(3 / (W - 1), 2 / (H - 1)), 1, corners);
    assert.ok(result); assert.ok(result.accepted);
    const saved = upsertPlanarSample(seq, result.sample);
    assert.equal(saved.samples.length, 1);
    assert.ok(Math.abs(saved.samples[0].corners[0].x - (.25 + 3 / (W - 1))) < .02);
  });

  it('builds an inset feature lattice inside the surface', () => {
    const f = surfaceFeatures(corners, 3);
    assert.equal(f.length, 9);
    for (const p of f) { assert.ok(p.x > .25 && p.x < .7); assert.ok(p.y > .25 && p.y < .72); }
  });

  it('recovers a perspective plane motion from the feature grid and re-anchors seeds', () => {
    const motion: [number,number,number,number,number,number,number,number,number] = [1.04, .02, .03, -.01, 1.03, .02, .04, .02, 1];
    let seq = createPlanarSequence('clip', 24, 0, corners, 'p2', { settings: { searchRadius: 8 } });
    seq = upsertPlanarSample(seq, referenceSample(seq));
    const r = trackPlanarFrame(seq, warped([1,0,0,0,1,0,0,0,1]), warped(motion), 1, seq.features);
    assert.ok(r && r.accepted, r?.reason);
    for (let i = 0; i < 4; i++) {
      const truth = transformPoint(motion, corners[i]);
      assert.ok(Math.hypot(r!.sample.corners[i].x - truth.x, r!.sample.corners[i].y - truth.y) < .015, `corner ${i}`);
    }
    // seeds for the next frame are the reference features through H, not raw matches
    const projected = transformPoint(r!.sample.matrix, seq.features[0]);
    assert.ok(Math.abs(r!.features[0].x - projected.x) < 1e-9);
    assert.ok(r!.sample.inliers >= 4);
  });

  it('reports failure instead of persisting a bad plane when features disagree', () => {
    let seq = createPlanarSequence('clip', 24, 0, corners, 'p3', { settings: { searchRadius: 6, minConfidence: .5 } });
    seq = upsertPlanarSample(seq, referenceSample(seq));
    // next frame is uncorrelated noise → matches are ambiguous and inconsistent
    const noise = { width: W, height: H, data: new Uint8Array(W * H).map((_, i) => (i * 2654435761 >>> 0) & 255) };
    const r = trackPlanarFrame(seq, translate(0, 0), noise, 1, seq.features);
    assert.ok(r);
    assert.equal(r!.accepted, false);
    assert.ok(r!.sample.lost);
    assert.ok(r!.reason);
    const saved = upsertPlanarSample(seq, r!.sample);
    assert.deepEqual(planarTrackedRange(saved), { start: 0, end: 0, lostAt: 1 });
    // consumers hold the last good plane
    assert.deepEqual(planarStabilizeAt(saved, 1).matrix, [1,0,0, 0,1,0, 0,0,1]);
  });

  it('interpolates between samples and derives stabilise + corner-pin matrices', () => {
    let seq = createPlanarSequence('clip', 24, 0, corners, 'p4');
    seq = upsertPlanarSample(seq, referenceSample(seq));
    const moved: [number,number,number,number,number,number,number,number,number] = [1,0,.1, 0,1,.05, 0,0,1];
    seq = upsertPlanarSample(seq, { ...referenceSample(seq), frame: 2, matrix: moved, corners: corners.map(p => transformPoint(moved, p)) as Quad, manual: false });
    const mid = samplePlanarAt(seq, 1)!;
    assert.ok(Math.abs(mid.corners[0].x - .30) < 1e-6 && Math.abs(mid.corners[0].y - .275) < 1e-6);
    // stabilise: output(p) = input(H p) → the moved surface returns to its reference corner
    const st = planarStabilizeAt(seq, 2);
    const back = transformPoint(st.matrix, corners[0]);
    assert.ok(Math.abs(back.x - .35) < 1e-9 && Math.abs(back.y - .30) < 1e-9);
    // corner pin: the unit square lands on the tracked corners
    const pin = cornerPinAt(seq, 2)!;
    const tl = transformPoint(pin.place, { x: 0, y: 0 }), br = transformPoint(pin.place, { x: 1, y: 1 });
    assert.ok(Math.abs(tl.x - .35) < 1e-6 && Math.abs(tl.y - .30) < 1e-6);
    assert.ok(Math.abs(br.x - .80) < 1e-6 && Math.abs(br.y - .77) < 1e-6);
    const round = transformPoint(pin.sample, tl);
    assert.ok(Math.abs(round.x) < 1e-6 && Math.abs(round.y) < 1e-6);
  });
});
