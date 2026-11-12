// Camera rigs: calibration, projection and triangulation agree; presets frame the subject.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toThree, calibration, project, triangulate, RIG_PRESETS, randomRig, fitRadius, mmToHfov, hfovToMm, type Vec3 } from '../services/cameraRig/rig';

const W = 1280, H = 720;
const pts: Vec3[] = [[0, 1, 0], [0.3, 1.6, -0.2], [-0.4, 0.1, 0.35], [0.1, 1.9, 0.1]];

test('a point seen by two or more cameras comes back where it was (sub-millimetre), with or without pixel noise', () => {
  for (const name of ['twoPhones', 'fourCorners', 'eightRing', 'coverage', 'dialogue', 'action']) {
    const cals = RIG_PRESETS[name]().cameras.map((c) => calibration(toThree(c, W / H), W, H));
    for (const p of pts) {
      const views = cals.map((c) => ({ c, ...project(c, p) }));
      for (const v of views) assert.ok(v.depth > 0, `${name}: point behind a camera`);
      const x = triangulate(views)!;
      const e = Math.hypot(x.p[0] - p[0], x.p[1] - p[1], x.p[2] - p[2]);
      assert.ok(e < 1e-3, `${name}: ${e * 1000} mm`);
      assert.ok(x.err < 0.01, `${name}: reprojection ${x.err}px`);
    }
  }
  // 2 px of noise on two phones ≈ a centimetre or so.
  const cals = RIG_PRESETS.twoPhones().cameras.map((c) => calibration(toThree(c, W / H), W, H));
  const x = triangulate(cals.map((c, k) => { const q = project(c, pts[1]); return { c, u: q.u + (k ? 2 : -2), v: q.v + 1.5 }; }))!;
  assert.ok(Math.hypot(x.p[0] - pts[1][0], x.p[1] - pts[1][1], x.p[2] - pts[1][2]) < 0.03);
});

test('one view, or views the tracker is unsure of, are not enough', () => {
  const [c] = RIG_PRESETS.twoPhones().cameras.map((s) => calibration(toThree(s, W / H), W, H));
  assert.equal(triangulate([{ c, ...project(c, pts[0]) }]), null);
  const cals = RIG_PRESETS.twoPhones().cameras.map((s) => calibration(toThree(s, W / H), W, H));
  assert.equal(triangulate(cals.map((cc) => ({ c: cc, ...project(cc, pts[0]), w: 0.001 }))), null);
  // Unsure in both views (a hidden joint) still gives an answer rather than losing the frame.
  assert.ok(triangulate(cals.map((cc) => ({ c: cc, ...project(cc, pts[0]), w: 0.02 }))));
});

test('presets and random rigs keep the subject in frame; fitting pulls cameras back for a long path', () => {
  const inFrame = (rig: ReturnType<typeof randomRig>, p: Vec3) => rig.cameras.every((s) => { const q = project(calibration(toThree(s, W / H), W, H), p); return q.depth > 0 && q.u > 0 && q.u < W && q.v > 0 && q.v < H; });
  for (const name of Object.keys(RIG_PRESETS)) assert.ok(inFrame(RIG_PRESETS[name](), [0, 1.5, 0]), name);
  let r = 0; const rand = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 20; i++) assert.ok(inFrame(randomRig(4, rand), [0, 1, 0]));
  const far = fitRadius(RIG_PRESETS.twoPhones(), 3);
  assert.ok(inFrame(far, [3, 1, 0]) && inFrame(far, [-3, 1, 0]), 'a 3 m walk either side stays in frame');
  assert.ok(Math.abs(hfovToMm(mmToHfov(50)) - 50) < 1e-9);
});
