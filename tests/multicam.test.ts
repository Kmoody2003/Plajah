// Two-camera capture: sync, self-calibration from the body, and fusion, on a synthetic walk filmed by two
// known cameras.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { landmarks, walk } from './mocapSynth';
import { calibration, project, type Calibration } from '../services/cameraRig/rig';
import { bestRotation, rotAngleDeg, syncByMotion, calibratePair, twoCamera } from '../services/mocap/multicam';
import type { RawFrame, RawTake } from '../services/mocap/types';

const W = 1280, H = 720;
const rand = (() => { let s = 11; return () => ((s = (s * 16807) % 2147483647) / 2147483647) - 0.5; })();

function camera(pos: THREE.Vector3, fovLong = 69): { cam: THREE.PerspectiveCamera; c: Calibration } {
  const hfov = THREE.MathUtils.degToRad(fovLong);
  const vfov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) * (H / W)));
  const cam = new THREE.PerspectiveCamera(vfov, W / H, 0.05, 100);
  cam.position.copy(pos); cam.lookAt(1.5, 1.0, 0); cam.updateMatrixWorld(true);
  return { cam, c: calibration(cam, W, H) };
}

/** What MediaPipe would report for these world landmarks from this camera (world points in camera axes). */
function seen(t: number, lm: THREE.Vector3[], c: Calibration, noise = 0): RawFrame {
  const R = c.R, toCam = (p: THREE.Vector3) => new THREE.Vector3(R[0] * p.x + R[1] * p.y + R[2] * p.z, R[3] * p.x + R[4] * p.y + R[5] * p.z, R[6] * p.x + R[7] * p.y + R[8] * p.z);
  const hip = lm[23].clone().add(lm[24]).multiplyScalar(0.5);
  return {
    t,
    pts: lm.map((p) => { const q = project(c, [p.x, p.y, p.z]); return { x: (q.u + rand() * noise) / W, y: (q.v + rand() * noise) / H, v: 0.95 }; }),
    world: lm.map((p) => { const r = toCam(p.clone().sub(hip)); return { x: r.x + rand() * noise * 0.002, y: -r.y + rand() * noise * 0.002, z: -r.z + rand() * noise * 0.002, v: 0.95 }; }),
  };
}

function film(c: Calibration, startFrame = 0, noise = 0): RawTake {
  const { poses, roots, fps } = walk({ seconds: 6, speed: 0.6 });
  const frames: RawFrame[] = [];
  for (let i = startFrame; i < poses.length; i++) {
    // Wave the arms a little differently over time so the motion has a fingerprint to sync on.
    const lm = landmarks({ ...poses[i], lShldr: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.6 * Math.sin(i / 7), 0, -1.2)) }, roots[i]);
    frames.push(seen((i - startFrame) / fps, lm, c, noise));
  }
  return { fps, frames, width: W, height: H, source: { kind: 'upload', label: 'synthetic', model: 'heavy' } };
}

test('Horn\'s method recovers a known rotation', () => {
  const R = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.3, -1.2, 0.4)).elements; // column-major
  const Rr = [R[0], R[4], R[8], R[1], R[5], R[9], R[2], R[6], R[10]];
  const src = Array.from({ length: 20 }, () => [rand(), rand(), rand()] as [number, number, number]);
  const dst = src.map((p) => [Rr[0] * p[0] + Rr[1] * p[1] + Rr[2] * p[2], Rr[3] * p[0] + Rr[4] * p[1] + Rr[5] * p[2], Rr[6] * p[0] + Rr[7] * p[1] + Rr[8] * p[2]] as [number, number, number]);
  const got = bestRotation(src, dst);
  for (let k = 0; k < 9; k++) assert.ok(Math.abs(got[k] - Rr[k]) < 1e-6, `R[${k}] ${got[k]} vs ${Rr[k]}`);
});

test('two cameras 90° apart: sync by movement, calibrate from the body, fuse', () => {
  const A = camera(new THREE.Vector3(1.5, 1.2, 4.5)), B = camera(new THREE.Vector3(6.0, 1.3, 0.2));
  const lag = 17; // camera B started 17 frames late
  const ta = film(A.c, 0, 1.5), tb = film(B.c, lag, 1.5);
  const s = syncByMotion(ta, tb); if (process.env.MC_DEBUG) console.log('sync', s);
  assert.ok(Math.abs(s.offset - lag / 30) < 1.5 / 30, `offset ${s.offset} vs ${lag / 30}`);

  const cal = calibratePair(ta, tb, lag / 30)!; if (process.env.MC_DEBUG) console.log('cal', cal.angleDeg, cal.baselineM, cal.fovDeg, cal.reproj, A.cam.position.distanceTo(B.cam.position));
  assert.ok(cal, 'calibrated');
  // True relative rotation and baseline.
  const Rb = B.c.R, Ra = A.c.R;
  const trueRel = new THREE.Matrix3().set(Rb[0], Rb[1], Rb[2], Rb[3], Rb[4], Rb[5], Rb[6], Rb[7], Rb[8]).multiply(new THREE.Matrix3().set(Ra[0], Ra[1], Ra[2], Ra[3], Ra[4], Ra[5], Ra[6], Ra[7], Ra[8]).transpose());
  const e = trueRel.elements; // column-major
  const trueAngle = rotAngleDeg([e[0], e[3], e[6], e[1], e[4], e[7], e[2], e[5], e[8]]);
  assert.ok(Math.abs(cal.angleDeg - trueAngle) < 3, `angle ${cal.angleDeg} vs ${trueAngle}`);
  const trueBase = A.cam.position.distanceTo(B.cam.position);
  assert.ok(Math.abs(cal.baselineM - trueBase) / trueBase < 0.1, `baseline ${cal.baselineM} vs ${trueBase}`);
  assert.ok(Math.abs(cal.fovDeg[0] - 69) <= 6, `fov ${cal.fovDeg}`);
  assert.ok(cal.reproj < 0.01, `reprojection ${cal.reproj}`);

  const out = twoCamera(ta, tb, { offset: lag / 30 });
  assert.ok('take' in out);
  if (!('take' in out)) return;
  assert.ok(out.report.fused > 0.9, `fused ${out.report.fused}`);
  // Fused arm direction matches the truth (camera A axes).
  const { poses, roots } = walk({ seconds: 6, speed: 0.6 });
  let err = 0, n = 0;
  out.take.frames.forEach((f, i) => {
    if (!f || i % 10) return;
    const lm = landmarks({ ...poses[i], lShldr: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.6 * Math.sin(i / 7), 0, -1.2)) }, roots[i]);
    const truth = seen(0, lm, A.c).world;
    for (const [a, b] of [[11, 13], [13, 15], [23, 25], [25, 27]]) {
      const u = new THREE.Vector3(f.world[b].x - f.world[a].x, f.world[b].y - f.world[a].y, f.world[b].z - f.world[a].z).normalize();
      const v = new THREE.Vector3(truth[b].x - truth[a].x, truth[b].y - truth[a].y, truth[b].z - truth[a].z).normalize();
      err += THREE.MathUtils.radToDeg(u.angleTo(v)); n++;
    }
  });
  if (process.env.MC_DEBUG) console.log('fused', err / n, out.report.hiddenFixes); assert.ok(err / n < 4, `fused bone error ${(err / n).toFixed(1)}°`);
});

test('cameras facing each other are flagged', () => {
  const A = camera(new THREE.Vector3(1.5, 1.2, 4.5)), B = camera(new THREE.Vector3(1.5, 1.2, -4.5));
  const cal = calibratePair(film(A.c), film(B.c), 0)!;
  assert.ok(cal && cal.notes.some((n) => /face each other/.test(n)), JSON.stringify(cal?.notes));
});
