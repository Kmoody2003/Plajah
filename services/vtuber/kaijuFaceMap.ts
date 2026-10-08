// kaijuFaceMap — the Kaiju VTuber FACE RIG: continuous ARKit-style face tracking → the kaiju's face.
//
// Pure maths (no DOM, no three.js) so it is unit-tested and shared by every kaiju avatar surface. Input is a
// RetargetResult (VRM-style expressions + a smoothed subset of the raw 52 blendshapes + head euler); output
// writes the Pose channels the kaiju canvas figure understands: per-eye blink / wink, wide eyes, laughing
// squint ( > < ), joy arcs ( ^ ^ ), brow tilt / lift / asymmetry, mouth open / width / smile / frown / pucker,
// tongue, blush, gaze, head roll + parallax. Everything is a continuous weight, so ANY expression the
// person makes comes through — the named presets in stage3d/kaijuFace.ts are only for music-driven acting.
//
// Axis signs for head yaw/pitch follow the existing retargeter (mirrored selfie view) and are the one thing
// that may need a per-device calibration pass: flip `yawSign` / `pitchSign` in the options.

import { REST, type Pose } from '../../components/kaiju/kaijuPose';
import type { RetargetResult } from './retarget';

export interface KaijuFaceOptions { yawSign?: number; pitchSign?: number; /** how strongly the face is exaggerated (1 = natural, 1.3 = anime-big) */ gain?: number }

const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const avg = (a = 0, b = 0) => (a + b) / 2;
const DEG = 180 / Math.PI;

/** Write the face + head channels of `out` from a tracker frame. Body channels are left alone. */
export function kaijuPoseFromFace(f: RetargetResult, out: Pose, opt: KaijuFaceOptions = {}): Pose {
  const g = opt.gain ?? 1.15, e = f.expressions ?? {}, b = f.blend ?? {};
  const bs = (k: string) => b[k] ?? 0;

  // ---- eyes: independent blink / wink, wide, squint, joy arcs
  const blinkL = clamp(e.blinkLeft ?? bs('eyeBlinkLeft')), blinkR = clamp(e.blinkRight ?? bs('eyeBlinkRight'));
  out.eyeL = 1 - 0.96 * clamp(blinkL * 1.15); out.eyeR = 1 - 0.96 * clamp(blinkR * 1.15);
  out.eyeOpen = 1;
  const wide = avg(bs('eyeWideLeft'), bs('eyeWideRight'));
  out.eyeScale = 1 + 0.3 * clamp(wide * g);
  const smile = avg(bs('mouthSmileLeft'), bs('mouthSmileRight')), frown = avg(bs('mouthFrownLeft'), bs('mouthFrownRight'));
  const cheek = avg(bs('cheekSquintLeft'), bs('cheekSquintRight')), squintEye = avg(bs('eyeSquintLeft'), bs('eyeSquintRight'));
  const jaw = bs('jawOpen');
  const joy = clamp((cheek * 0.9 + squintEye * 0.6) * (0.4 + smile * 1.6) - 0.12);   // a real smile squints the eyes
  out.happy = clamp(joy * 3.2) * (1 - clamp(jaw * 2));                                 // ^ ^ eyes — held back while laughing wide
  out.squint = clamp(joy * 3.2) * clamp(jaw * 2.4);                                    // > <  when laughing with the mouth open
  out.closed = 0;
  out.hearts = 0;

  // ---- mouth: jaw open, width (smile/stretch vs pucker/funnel), smile/frown curve, tongue
  out.mouth = clamp(jaw * 1.3 - 0.02);
  const wideMouth = smile * 0.9 + avg(bs('mouthStretchLeft'), bs('mouthStretchRight')) * 0.9;
  const narrow = bs('mouthPucker') * 0.9 + bs('mouthFunnel') * 0.7;
  out.mouthW = clamp(0.5 + 0.5 * wideMouth - 0.55 * narrow, 0.06, 1);
  out.smile = clamp(-0.4 + 1.9 * smile * g - 1.5 * frown - 0.5 * bs('mouthPressLeft') * 0, -1, 1);
  out.tongue = clamp((bs('tongueOut') - 0.1) * 1.6);

  // ---- brows: tilt (down = angry, inner-up = worried), lift (outer up / inner up), asymmetry
  const browDown = avg(bs('browDownLeft'), bs('browDownRight')), inner = bs('browInnerUp'), outer = avg(bs('browOuterUpLeft'), bs('browOuterUpRight'));
  out.brow = clamp(browDown * 1.3 - inner * 1.15 - outer * 0.2, -1.2, 1.25);
  out.browY = clamp(-(inner * 0.7 + outer * 0.9) * g + browDown * 0.55, -1.1, 1.1);
  out.browAsym = clamp((bs('browOuterUpRight') - bs('browOuterUpLeft')) * 1.2 + (bs('browDownLeft') - bs('browDownRight')) * 0.8, -1, 1);

  // ---- gaze + cheeks
  const lookX = (e.lookRight ?? 0) - (e.lookLeft ?? 0), lookY = (e.lookDown ?? 0) - (e.lookUp ?? 0);
  out.lookX = clamp(lookX * 1.4, -1, 1); out.lookY = clamp(lookY * 1.3, -1, 1);
  out.blush = clamp(0.25 + 0.5 * out.happy + 0.35 * smile + 0.3 * bs('cheekPuff'));
  out.tear = 0; out.sweat = 0;

  // ---- head: roll tilts the head, yaw/pitch slide it (a 2D puppet's parallax), with a touch of body lean
  const yaw = (opt.yawSign ?? 1) * f.head.y, pitch = (opt.pitchSign ?? 1) * f.head.x, roll = f.head.z;
  out.headRot = clamp(-roll * DEG * 1.0, -35, 35);
  out.headX = clamp(yaw * 46, -26, 26);
  out.headY = clamp(pitch * 34, -18, 18);
  out.rot = clamp(-roll * DEG * 0.28 + yaw * 4, -10, 10);
  out.x = clamp(yaw * 22, -14, 14);
  out.mane = clamp(0.1 + 0.9 * Math.max(0, wide * 0.8 + jaw * 0.6 + smile * 0.3 - 0.1));
  return out;
}

/** A fresh neutral kaiju pose (the sheet's grumpy face) for a driver to start from. */
export const neutralKaijuPose = (): Pose => ({ ...REST });
