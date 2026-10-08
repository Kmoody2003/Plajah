// Tests for the 3D face-decal rig brain: expressions / tracker poses → atlas cells.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { atlasUV, decalsFromExpr, decalsFromPose, neutralDecalFace, type AtlasInfo } from '../components/kaiju/stage3d/kaijuFaceDecals';
import { EXPRESSIONS, type EmotionOut, type Expr } from '../components/kaiju/stage3d/kaijuFace';
import { kaijuPoseFromFace, neutralKaijuPose } from '../services/vtuber/kaijuFaceMap';

const atlas = (n: string): AtlasInfo => JSON.parse(fs.readFileSync(`public/models/mascots/v2/face/${n}.json`, 'utf8'));
const em = (expr: Expr, o: Partial<EmotionOut> = {}): EmotionOut => ({ expr, blink: 0, gazeX: 0, gazeY: 0, browLift: 0, mouth: 0, ...o });

test('every expression and every tracker shape lands on a cell that exists in BOTH characters\' atlases', () => {
  for (const who of ['chora', 'reello']) {
    const eyes = atlas(`${who}_eyes_L`), eyesR = atlas(`${who}_eyes_R`), brows = atlas(`${who}_brows`), mouths = atlas(`${who}_mouths`);
    const faces = (Object.keys(EXPRESSIONS) as Expr[]).flatMap(e => [decalsFromExpr(em(e)), decalsFromExpr(em(e, { mouth: 0.9 })), decalsFromExpr(em(e, { mouth: 0.3 })), decalsFromExpr(em(e, { mouth: 0.05 }))]);
    // sweep the tracker space too
    let s = 5; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 600; i++) {
      const b: Record<string, number> = {}; for (const k of ['jawOpen', 'mouthSmileLeft', 'mouthSmileRight', 'mouthFrownLeft', 'mouthFrownRight', 'mouthPucker', 'mouthFunnel', 'mouthStretchLeft', 'mouthStretchRight', 'tongueOut', 'browInnerUp', 'browDownLeft', 'browDownRight', 'browOuterUpLeft', 'browOuterUpRight', 'eyeWideLeft', 'eyeWideRight', 'eyeSquintLeft', 'eyeSquintRight', 'cheekSquintLeft', 'cheekSquintRight']) b[k] = rnd() * (rnd() < 0.5 ? 1 : 0.2);
      faces.push(decalsFromPose(kaijuPoseFromFace({ expressions: { blinkLeft: rnd(), blinkRight: rnd() }, blend: b, head: { x: 0, y: 0, z: 0 } }, neutralKaijuPose())));
    }
    for (const f of faces) {
      assert.ok(atlasUV(eyes, f.eyeL) && atlasUV(eyesR, f.eyeR), `${who} eye ${f.eyeL}/${f.eyeR}`);
      assert.ok(atlasUV(brows, f.browL) && atlasUV(brows, f.browR), `${who} brow ${f.browL}/${f.browR}`);
      assert.ok(atlasUV(mouths, f.mouth), `${who} mouth ${f.mouth}`);
      assert.ok(f.openL >= 0.07 && f.openL <= 1 && f.openR >= 0.07 && f.openR <= 1 && f.mouthOpen >= 0.7 && f.mouthOpen <= 1.3);
    }
  }
});

test('blink squashes open-type eyes but never the closed/happy/heart marks; wink closes one eye only', () => {
  const blinking = decalsFromExpr(em('grumpy', { blink: 1 })), calm = decalsFromExpr(em('grumpy', { blink: 0 }));
  assert.ok(blinking.openL < 0.12 && calm.openL === 1);
  assert.equal(decalsFromExpr(em('joy', { blink: 1 })).openL, 1);
  const w = decalsFromExpr(em('wink'));
  assert.ok(w.openR < 0.12 && w.openL === 1);
});

test('the tracker path: wink, laugh, kiss, tongue, sad, surprised, skeptical pick the right marks', () => {
  const f = (b: Record<string, number>, e: Record<string, number> = {}) => decalsFromPose(kaijuPoseFromFace({ expressions: e, blend: b, head: { x: 0, y: 0, z: 0 } }, neutralKaijuPose()));
  const wink = f({}, { blinkLeft: 1, blinkRight: 0 });
  assert.equal(wink.eyeL, 'closed'); assert.equal(wink.eyeR, 'open');
  const laugh = f({ jawOpen: 0.7, mouthSmileLeft: 0.9, mouthSmileRight: 0.9, cheekSquintLeft: 0.8, cheekSquintRight: 0.8, eyeSquintLeft: 0.6, eyeSquintRight: 0.6 });
  assert.equal(laugh.eyeL, 'squint'); assert.equal(laugh.mouth, 'laugh');
  assert.ok(['viseme_U', 'viseme_O'].includes(f({ mouthPucker: 0.9, mouthFunnel: 0.4, jawOpen: 0.15 }).mouth));
  assert.equal(f({ tongueOut: 0.9, jawOpen: 0.3 }).mouth, 'tongue_out');
  assert.equal(f({ browInnerUp: 0.9, mouthFrownLeft: 0.9, mouthFrownRight: 0.9 }).mouth, 'sad');
  const surprised = f({ jawOpen: 0.5, eyeWideLeft: 1, eyeWideRight: 1, browInnerUp: 0.9, browOuterUpLeft: 0.8, browOuterUpRight: 0.8 });
  assert.equal(surprised.eyeL, 'wide'); assert.equal(surprised.browL, 'surprised');
  const skeptic = f({ browOuterUpRight: 1, browDownLeft: 0.7 });
  assert.notEqual(skeptic.browL, skeptic.browR);
  assert.equal(neutralDecalFace().mouth, 'rest_frown');
});

test('atlas UV lookup is right-handed (row 0 is the TOP of the image) and covers the cell', () => {
  const a: AtlasInfo = { cols: 3, rows: 4, cell: 256, states: [{ name: 'a', col: 0, row: 0, size: [0.5, 0.5] }, { name: 'b', col: 2, row: 3, size: [0.5, 0.5] }] };
  assert.deepEqual(atlasUV(a, 'a')!.offset, [0, 0.75]); assert.deepEqual(atlasUV(a, 'b')!.offset, [2 / 3, 0]);
  assert.deepEqual(atlasUV(a, 'a')!.repeat, [1 / 3, 1 / 4]); assert.equal(atlasUV(a, 'nope'), null);
});
