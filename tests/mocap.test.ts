// Camera motion capture solver: synthetic performers with known motion → landmarks the way MediaPipe reports
// them (hip-centred world points + projected image points) → solveTake → compare against the truth.
//   npx tsx --test tests/mocap.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BVHLoader } from 'three/examples/jsm/loaders/BVHLoader.js';
import { fk, solveTake, clipFrame, JOINTS, cleanRuns, fixLimbSwaps } from '../services/mocap/solve';
import { clipToBvh, clipToThree } from '../services/mocap/bvh';
import { detectStrikes, findLoop } from '../services/mocap/moves';
import type { RawFrame } from '../services/mocap/types';
import { SKEL, ji, q, locals, landmarks, rawFrame, take, lowRel, standing, standRoot, walk, type Pose } from './mocapSynth';

test('cleanRuns drops blips and closes short gaps', () => {
  assert.deepEqual(cleanRuns([1, 1, 1, 1, 0, 1, 1, 1, 1]), [1, 1, 1, 1, 1, 1, 1, 1, 1]);
  assert.deepEqual(cleanRuns([0, 0, 0, 0, 1, 0, 0, 0, 0]), [0, 0, 0, 0, 0, 0, 0, 0, 0]);
});

test('a posed performer comes back with the same limbs (< 2 cm per joint)', () => {
  const poses: Pose[] = [];
  for (let i = 0; i < 40; i++) {
    const s = i / 39;
    poses.push({
      hip: q(0.15 * s, 0.6 * s, 0.05),
      chest: q(0, -0.3 * s, 0),
      lShldr: q(0.2, 0.3, -0.9 * s), lForeArm: q(0, 1.2 * s + 0.1, 0),
      rShldr: q(-0.4 * s, -0.5, 0.6), rForeArm: q(0, -0.9 * s - 0.2, 0),
      lThigh: q(-0.9 * s, 0, 0.1), lShin: q(1.1 * s + 0.05, 0, 0), lFoot: q(-0.2 * s, 0, 0),
      rThigh: q(0.3 * s, 0, -0.1), rShin: q(0.4 * s + 0.05, 0, 0),
      neck: q(0.1 * s, 0, 0), head: q(-0.2 * s, 0.4 * s, 0),
    });
  }
  const frames = poses.map((p, i) => rawFrame(i / 30, landmarks(p, standRoot())));
  // The rotation solve on its own: foot locking would (rightly) pin this creeping "planted" foot.
  const clip = solveTake(take(frames), { smooth: 0, lockFeet: false });
  assert.equal(clip.frames, 40);
  let worst = 0;
  for (let f = 0; f < 40; f += 3) {
    const truth = fk(locals(poses[f]), SKEL).pos;
    const got = fk(clipFrame(clip, f).local, clip.skeleton.joints).pos;
    for (const n of ['lForeArm', 'lHand', 'rForeArm', 'rHand', 'lShin', 'lFoot', 'rShin', 'rFoot', 'lShldr', 'rShldr']) {
      worst = Math.max(worst, truth[ji(n)].distanceTo(got[ji(n)]));
    }
  }
  assert.ok(worst < 0.02, `worst joint error ${(worst * 100).toFixed(1)} cm`);
});

test('a walk across the frame: the root travels with the steps and the planted foot never slides', () => {
  const { poses, roots, fps } = walk({ seconds: 3, speed: 1.0, step: 0.6 });
  const n = poses.length;
  const frames = poses.map((p, i) => rawFrame(i / fps, landmarks(p, roots[i]), { world: 0.004, px: 0.8 }));
  const clip = solveTake(take(frames), {});
  const dxTruth = roots[n - 1].x - roots[0].x;
  const dxGot = clip.root[(n - 1) * 3] - clip.root[0];
  assert.ok(Math.abs(dxGot - dxTruth) / dxTruth < 0.08, `walked ${dxGot.toFixed(2)} m, truth ${dxTruth.toFixed(2)} m`);
  const planted = clip.contacts.l.reduce((a, b) => a + b, 0) + clip.contacts.r.reduce((a, b) => a + b, 0);
  assert.ok(planted > n * 0.8, `planted frames ${planted}`);
  assert.ok(clip.quality.skate < 1.5, `skate ${clip.quality.skate} cm/s`);
  // Feet sit on the floor: the lowest point of a planted foot is at y ≈ 0.
  let worstFloor = 0;
  for (let f = 0; f < n; f++) {
    const { local, root: r } = clipFrame(clip, f);
    const { pos, ends } = fk(local, clip.skeleton.joints, r);
    for (const s of ['l', 'r'] as const) {
      if (!clip.contacts[s][f]) continue;
      const k = ji(`${s}Foot`);
      worstFloor = Math.max(worstFloor, Math.abs(Math.min(pos[k].y, ends[k]!.y) - 0));
    }
  }
  assert.ok(worstFloor < 0.03, `planted foot off the floor by ${(worstFloor * 100).toFixed(1)} cm`);
});

test('a jump: flight is detected and the arc height follows from the time in the air', () => {
  const fps = 30, tUp = 0.4, start = 20, n = 60;
  const base = standRoot();
  const frames: RawFrame[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i - start) / fps;
    const y = t > 0 && t < tUp ? 0.5 * 9.81 * t * (tUp - t) : 0;
    frames.push(rawFrame(i / fps, landmarks(standing(), base.clone().add(new THREE.Vector3(0, y, 0))), { world: 0.003, px: 0.6 }));
  }
  const clip = solveTake(take(frames));
  const ys = Array.from({ length: n }, (_, f) => clip.root[f * 3 + 1]);
  const stand = ys[5], peak = Math.max(...ys) - stand;
  const truthPeak = (9.81 * tUp * tUp) / 8;
  assert.ok(Math.abs(peak - truthPeak) < 0.04, `peak ${peak.toFixed(3)} m vs ${truthPeak.toFixed(3)}`);
  const airborne = clip.contacts.l.map((c, i) => (!c && !clip.contacts.r[i] ? 1 : 0)).reduce((a: number, b) => a + b, 0);
  assert.ok(airborne >= 8 && airborne <= 14, `airborne frames ${airborne}`);
});

test('standing still under sensor noise: no drift, calm, graded good', () => {
  const frames = Array.from({ length: 90 }, (_, i) => rawFrame(i / 30, landmarks(standing(), standRoot()), { world: 0.008, px: 1.5 }));
  const clip = solveTake(take(frames));
  const drift = Math.hypot(clip.root[89 * 3], clip.root[89 * 3 + 2]);
  assert.ok(drift < 0.03, `drift ${drift}`);
  assert.equal(clip.quality.grade, 'good', JSON.stringify(clip.quality));
});

test('missing frames are filled and counted as occlusion', () => {
  const frames: (RawFrame | null)[] = Array.from({ length: 60 }, (_, i) => (i >= 20 && i < 35 ? null : rawFrame(i / 30, landmarks(standing(), standRoot()))));
  const clip = solveTake({ ...take([]), frames });
  assert.equal(clip.frames, 60);
  assert.ok(clip.quality.occlusion > 0.2 && clip.quality.occlusion < 0.3, `occlusion ${clip.quality.occlusion}`);
});

test('BVH export reads back through three.js BVHLoader with the same pose and CMU joint names', () => {
  const p: Pose = { hip: q(0.1, 0.7, 0), lShldr: q(0.2, 0.3, -0.9), lForeArm: q(0, 1.1, 0), rThigh: q(-0.8, 0, 0.1), rShin: q(1.0, 0, 0) };
  const frames = Array.from({ length: 10 }, (_, i) => rawFrame(i / 30, landmarks(p, standRoot())));
  const clip = solveTake(take(frames), { smooth: 0 });
  const text = clipToBvh(clip);
  const res = new BVHLoader().parse(text);
  const names = res.skeleton.bones.map((b) => b.name);
  for (const n of ['hip', 'abdomen', 'chest', 'lShldr', 'lForeArm', 'rThigh', 'rShin', 'lFoot']) assert.ok(names.includes(n), n);
  const group = new THREE.Group(); group.add(res.skeleton.bones[0]);
  const mixer = new THREE.AnimationMixer(group);
  mixer.clipAction(res.clip).play(); mixer.setTime(5 / 30); group.updateMatrixWorld(true);
  const { local, root } = clipFrame(clip, 5);
  for (const n of ['hip', 'lShldr', 'lForeArm', 'rThigh', 'rShin']) {
    const b = res.skeleton.bones.find((x) => x.name === n)!;
    assert.ok(Math.abs(b.quaternion.dot(local[ji(n)])) > 0.9999, `${n} rotation differs`);
  }
  // Rest pose stands on the floor: the root's rest height is the standing hip height, not 0.
  assert.ok(res.skeleton.bones[0].position.y > 60, `rest hip at ${res.skeleton.bones[0].position.y} cm`);
  const hipBone = res.skeleton.bones[0];
  assert.ok(hipBone.position.distanceTo(root.clone().multiplyScalar(100)) < 0.05, 'hip position (cm)');
  const three = clipToThree(clip);
  assert.equal(three.bones.length, JOINTS.length);
  assert.ok(three.animation.duration > 0);
});

test('strikes are cut where a punch reaches full extension in front of the body', () => {
  const fps = 30, n = 75;
  const frames: RawFrame[] = [];
  for (let i = 0; i < n; i++) {
    // Guard, then a right straight punch peaking at frame 40.
    const u = Math.max(0, 1 - Math.abs(i - 40) / 8);
    const p: Pose = {
      rShldr: q(0, 1.4 * u + 0.1 * (1 - u), 1.25 * (1 - u) * 0.6), rForeArm: q(0, 2.0 * (1 - u), 0),
      lShldr: q(0, -0.9, -0.7), lForeArm: q(0, -2.0, 0),
    };
    frames.push(rawFrame(i / fps, landmarks(p, standRoot())));
  }
  const clip = solveTake(take(frames, fps));
  const moves = detectStrikes(clip);
  assert.ok(moves.length >= 1, 'no strike found');
  const m = moves.find((x) => x.effector === 'rHand');
  assert.ok(m, JSON.stringify(moves));
  assert.ok(Math.abs(m!.hit! - 40) <= 3, `hit at ${m!.hit}`);
  assert.ok(findLoop(clip) !== null);
});

test('with several people in frame, the lock follows the same performer and refuses a far-away swap', async () => {
  const { PerformerLock } = await import('../services/mocap/capture');
  const person = (x: number, s = 0.2) => ({
    pts: Array.from({ length: 33 }, (_, i) => ({ x: x + ([11, 23].includes(i) ? -0.05 : 0.05), y: [11, 12].includes(i) ? 0.4 : [23, 24].includes(i) ? 0.4 + s : 0.5, v: 1 })),
    world: Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, v: 1 })),
  });
  const lock = new PerformerLock();
  // The bigger person (at x 0.3) is chosen first; then followed as they drift right, whatever order MediaPipe lists them in.
  assert.equal(lock.pick([person(0.7, 0.1), person(0.3, 0.25)], 0)!.pts[0].x, person(0.3).pts[0].x);
  assert.equal(lock.pick([person(0.34, 0.25), person(0.7, 0.1)], 1 / 30)!.pts[0].x, person(0.34).pts[0].x);
  assert.equal(lock.pick([person(0.7, 0.1), person(0.37, 0.25)], 2 / 30)!.pts[0].x, person(0.37).pts[0].x);
  // The performer leaves the picture: the other person is not swapped in.
  assert.equal(lock.pick([person(0.7, 0.1)], 3 / 30), null);
});

test('foot locking: shaky landmarks on a standing performer, planted ankles stay put and knees stay calm', () => {
  const frames = Array.from({ length: 90 }, (_, i) => rawFrame(i / 30, landmarks(standing(), standRoot()), { world: 0.012, px: 2 }));
  const off = solveTake(take(frames), { lockFeet: false }), on = solveTake(take(frames));
  const travel = (c: typeof on, j: string) => {
    let d = 0;
    for (let f = 1; f < c.frames; f++) {
      const a = fk(clipFrame(c, f - 1).local, c.skeleton.joints, clipFrame(c, f - 1).root).pos[ji(j)];
      const b = fk(clipFrame(c, f).local, c.skeleton.joints, clipFrame(c, f).root).pos[ji(j)];
      a.y = b.y = 0; d += a.distanceTo(b);
    }
    return d * 100;
  };
  const before = travel(off, 'lFoot') + travel(off, 'rFoot'), after = travel(on, 'lFoot') + travel(on, 'rFoot');
  assert.ok(after < before * 0.25, `ankle travel ${before.toFixed(1)} cm → ${after.toFixed(1)} cm`);
  assert.ok(on.quality.skate < 1, `skate ${on.quality.skate}`);
  // Knees move no more than they did before locking (plus a little).
  const knees = (c: typeof on) => travel(c, 'lShin') + travel(c, 'rShin');
  assert.ok(knees(on) < knees(off) * 1.3 + 2, `knee travel ${knees(off).toFixed(1)} → ${knees(on).toFixed(1)} cm`);
});

test('left/right leg mix-ups for a frame are undone (side views), and the walk stays clean', () => {
  const { poses, roots, fps } = walk({ seconds: 2 });
  const frames = poses.map((p, i) => rawFrame(i / fps, landmarks(p, roots[i]), { world: 0.003, px: 0.6 }));
  const legL = [25, 27, 29, 31], legR = [26, 28, 30, 32];
  const swapped = frames.map((f, i) => {
    if (![12, 13, 31, 44].includes(i)) return f;          // two single-frame and one two-frame mix-up
    const pts = f.pts.slice(), world = f.world.slice();
    legL.forEach((l, k) => { [pts[l], pts[legR[k]]] = [f.pts[legR[k]], f.pts[l]]; [world[l], world[legR[k]]] = [f.world[legR[k]], f.world[l]]; });
    return { ...f, pts, world };
  });
  const { take: fixedTake, swaps } = fixLimbSwaps(take(swapped));
  assert.equal(swaps, 4, `undid ${swaps}`);
  for (const i of [12, 13, 31, 44]) assert.deepEqual(fixedTake.frames[i]!.pts[27], frames[i].pts[27]);
  const clean = solveTake(take(frames)), fixed = solveTake(take(swapped));
  const dx = (c: typeof clean) => c.root[(c.frames - 1) * 3] - c.root[0];
  assert.ok(Math.abs(dx(fixed) - dx(clean)) < 0.02, `walked ${dx(fixed).toFixed(2)} vs ${dx(clean).toFixed(2)}`);
});

test('no strikes without a snap: a held guard and a walking arm swing are not blows', () => {
  // Guard: fists up and arms half-straight, held still with sensor noise.
  const guard: Pose = { rShldr: q(0, 0.9, 0.7), rForeArm: q(0, 1.2, 0), lShldr: q(0, -0.9, -0.7), lForeArm: q(0, -1.2, 0) };
  const g = solveTake(take(Array.from({ length: 90 }, (_, i) => rawFrame(i / 30, landmarks(guard, standRoot()), { world: 0.006, px: 1 }))));
  assert.equal(detectStrikes(g).length, 0, JSON.stringify(detectStrikes(g).map((m) => m.name)));
  // A walk whose straight arms swing forward and back.
  const { poses, roots, fps } = walk({ seconds: 3 });
  const swung = poses.map((p, i) => ({ ...p, lShldr: q(0.6 * Math.sin(i / 5), 0, -1.35), rShldr: q(-0.6 * Math.sin(i / 5), 0, 1.35), lForeArm: q(0, 0.1, 0), rForeArm: q(0, -0.1, 0) }));
  const w = solveTake(take(swung.map((p, i) => rawFrame(i / fps, landmarks(p, roots[i]), { world: 0.004, px: 0.8 }))));
  assert.equal(detectStrikes(w).length, 0, JSON.stringify(detectStrikes(w).map((m) => m.name)));
});

test('a walk around a full circle: the turn is measured, and "straighten" makes it a straight walk', () => {
  const { poses, roots, fps } = walk({ seconds: 4, speed: 1.0, step: 0.6 });
  const n = poses.length;
  // Turn the whole walk through 360°: each step is rotated by the heading so far, and so are the hips.
  const circ: Pose[] = [], rts: THREE.Vector3[] = [roots[0].clone()];
  for (let i = 0; i < n; i++) {
    const yaw = (2 * Math.PI * i) / n;
    circ.push({ ...poses[i], hip: q(0, Math.PI / 2 + yaw, 0) });
    if (i) rts.push(rts[i - 1].clone().add(roots[i].clone().sub(roots[i - 1]).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)));
  }
  const raw = take(circ.map((p, i) => rawFrame(i / fps, landmarks(p, rts[i]), { world: 0.003, px: 0.6 })));
  const loop = solveTake(raw), line = solveTake(raw, { straighten: true });
  assert.ok(loop.stats!.turnDeg > 300, `turn ${loop.stats!.turnDeg}°`);
  assert.ok(loop.stats!.netSpeed < loop.stats!.pathSpeed * 0.5, `circle: net ${loop.stats!.netSpeed} path ${loop.stats!.pathSpeed}`);
  assert.ok(line.stats!.netSpeed > line.stats!.pathSpeed * 0.9, `straightened: net ${line.stats!.netSpeed} path ${line.stats!.pathSpeed}`);
  assert.ok(Math.abs(line.stats!.netSpeed - 1.0) < 0.2, `straightened speed ${line.stats!.netSpeed} m/s`);
});

test('reliability: a take that keeps losing the performer never flies off', () => {
  // Standing still, but the performer is found only one frame in four, and those sightings jump about.
  const frames = Array.from({ length: 120 }, (_, i) => (i % 4 ? null : rawFrame(i / 30, landmarks(standing(), standRoot().add(new THREE.Vector3((i % 8 ? 0.25 : -0.25), 0, 0))), { world: 0.02, px: 4 })));
  const clip = solveTake({ ...take([]), frames });
  let maxStep = 0;
  for (let f = 1; f < clip.frames; f++) maxStep = Math.max(maxStep, Math.hypot(clip.root[f * 3] - clip.root[(f - 1) * 3], clip.root[f * 3 + 2] - clip.root[(f - 1) * 3 + 2]) * 30);
  const net = Math.hypot(clip.root[(clip.frames - 1) * 3], clip.root[(clip.frames - 1) * 3 + 2]);
  assert.ok(maxStep <= 9.01, `max speed ${maxStep.toFixed(1)} m/s`);
  assert.ok(net < 1, `travelled ${net.toFixed(2)} m while standing`);
  assert.equal(clip.quality.grade, 'poor');
});
