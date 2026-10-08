// Tests for the Kaiju VTuber face rig: tracker blendshapes → kaiju Pose channels.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kaijuPoseFromFace, neutralKaijuPose } from '../services/vtuber/kaijuFaceMap';
import type { RetargetResult } from '../services/vtuber/retarget';

const frame = (b: Record<string, number> = {}, e: Record<string, number> = {}, head = { x: 0, y: 0, z: 0 }): RetargetResult => ({ expressions: e, blend: b, head });
const face = (r: RetargetResult, opt = {}) => kaijuPoseFromFace(r, neutralKaijuPose(), opt);

test('a neutral face is the character\'s grumpy default, eyes open, mouth shut', () => {
  const p = face(frame());
  assert.ok(p.eyeL > 0.99 && p.eyeR > 0.99 && p.mouth < 0.05 && p.happy < 0.05 && p.squint < 0.05 && p.tongue === 0);
  assert.ok(p.smile < -0.2 && Math.abs(p.brow) < 0.1, `smile ${p.smile} brow ${p.brow}`);
});

test('each eye blinks independently — a wink closes one eye only', () => {
  const wink = face(frame({}, { blinkLeft: 1, blinkRight: 0 }));
  assert.ok(wink.eyeL < 0.1 && wink.eyeR > 0.95, `${wink.eyeL}/${wink.eyeR}`);
  const both = face(frame({}, { blinkLeft: 1, blinkRight: 1 }));
  assert.ok(both.eyeL < 0.1 && both.eyeR < 0.1);
});

test('jaw open drives the mouth; pucker narrows it; a smile widens it and lifts the curve', () => {
  const ah = face(frame({ jawOpen: 0.8 })), oo = face(frame({ jawOpen: 0.25, mouthPucker: 0.9, mouthFunnel: 0.6 })), grin = face(frame({ mouthSmileLeft: 0.9, mouthSmileRight: 0.9 }));
  assert.ok(ah.mouth > 0.9);
  assert.ok(oo.mouthW < 0.3 && oo.mouth > 0.2 && oo.mouth < 0.5, `pucker mouthW ${oo.mouthW}`);
  assert.ok(grin.mouthW > 0.8 && grin.smile > 0.8, `grin ${grin.mouthW}/${grin.smile}`);
  assert.ok(face(frame({ mouthFrownLeft: 0.9, mouthFrownRight: 0.9 })).smile < -0.9);
});

test('a big real smile squints into ^ ^ joy eyes; laughing with the mouth wide becomes > <', () => {
  const smileB = { mouthSmileLeft: 0.9, mouthSmileRight: 0.9, cheekSquintLeft: 0.8, cheekSquintRight: 0.8, eyeSquintLeft: 0.6, eyeSquintRight: 0.6 };
  const joy = face(frame(smileB)), laugh = face(frame({ ...smileB, jawOpen: 0.7 }));
  assert.ok(joy.happy > 0.6 && joy.squint < 0.2, `joy ${joy.happy}/${joy.squint}`);
  assert.ok(laugh.squint > 0.6 && laugh.happy < joy.happy, `laugh ${laugh.squint}/${laugh.happy}`);
  assert.ok(face(frame({ mouthSmileLeft: 0.2, mouthSmileRight: 0.2 })).happy < 0.2, 'a faint smile does not trigger joy eyes');
});

test('brows: down = angry tilt, inner-up = worried tilt + lift, outer-up = raised, one-sided = asymmetric', () => {
  const angry = face(frame({ browDownLeft: 0.9, browDownRight: 0.9 })), worried = face(frame({ browInnerUp: 0.9 })), raised = face(frame({ browOuterUpLeft: 0.9, browOuterUpRight: 0.9 }));
  assert.ok(angry.brow > 0.8 && worried.brow < -0.6 && worried.browY < -0.4 && raised.browY < -0.6);
  const skeptic = face(frame({ browOuterUpRight: 1 }));
  assert.ok(Math.abs(skeptic.browAsym) > 0.6, `${skeptic.browAsym}`);
});

test('wide eyes enlarge the eyes; tongue-out needs a deliberate tongue; gaze follows the eyes', () => {
  assert.ok(face(frame({ eyeWideLeft: 1, eyeWideRight: 1 })).eyeScale > 1.25);
  assert.ok(face(frame({ tongueOut: 0.05 })).tongue === 0 && face(frame({ tongueOut: 0.9 })).tongue > 0.8);
  const g = face(frame({}, { lookRight: 0.8, lookDown: 0.5 }));
  assert.ok(g.lookX > 0.8 && g.lookY > 0.5);
});

test('head pose: roll tilts the head, yaw/pitch slide it within safe limits, signs are flippable for calibration', () => {
  const p = face(frame({}, {}, { x: 0.2, y: 0.4, z: 0.3 }));
  assert.ok(p.headRot < 0 && Math.abs(p.headRot) < 35 && Math.abs(p.headX) <= 26 && Math.abs(p.headY) <= 18);
  const flipped = face(frame({}, {}, { x: 0.2, y: 0.4, z: 0.3 }), { yawSign: -1, pitchSign: -1 });
  assert.ok(Math.sign(flipped.headX) === -Math.sign(p.headX) && Math.sign(flipped.headY) === -Math.sign(p.headY));
  const extreme = face(frame({}, {}, { x: 3, y: 3, z: 3 }));
  assert.ok(Math.abs(extreme.headRot) <= 35 && Math.abs(extreme.headX) <= 26 && Math.abs(extreme.rot) <= 10);
});

test('every output channel stays finite and in range for random tracker noise', () => {
  const keys = ['browInnerUp', 'browDownLeft', 'browDownRight', 'browOuterUpLeft', 'browOuterUpRight', 'eyeSquintLeft', 'eyeSquintRight', 'eyeWideLeft', 'eyeWideRight', 'cheekSquintLeft', 'cheekSquintRight', 'cheekPuff', 'jawOpen', 'mouthFunnel', 'mouthPucker', 'mouthSmileLeft', 'mouthSmileRight', 'mouthFrownLeft', 'mouthFrownRight', 'mouthStretchLeft', 'mouthStretchRight', 'tongueOut'];
  let s = 11; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2000; i++) {
    const b: Record<string, number> = {}; for (const k of keys) b[k] = rnd();
    const p = face(frame(b, { blinkLeft: rnd(), blinkRight: rnd(), lookLeft: rnd(), lookRight: rnd(), lookUp: rnd(), lookDown: rnd() }, { x: (rnd() - 0.5) * 2, y: (rnd() - 0.5) * 2, z: (rnd() - 0.5) * 2 }));
    for (const [k, v] of Object.entries(p)) assert.ok(Number.isFinite(v as number), `${k}`);
    assert.ok(p.eyeL >= 0 && p.eyeL <= 1 && p.eyeR >= 0 && p.eyeR <= 1 && p.mouth >= 0 && p.mouth <= 1 && p.mouthW >= 0.05 && p.mouthW <= 1);
    assert.ok(p.smile >= -1 && p.smile <= 1 && p.brow >= -1.2 && p.brow <= 1.25 && p.happy >= 0 && p.happy <= 1 && p.squint >= 0 && p.squint <= 1);
  }
});
