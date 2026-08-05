// retarget.ts — map MediaPipe face output onto VRM avatar controls. Blendshapes → VRM expression
// presets (lip-sync vowels, blink, emotion, eye-look); the 4x4 facial transform → head bone euler.
// Every signal is One-Euro smoothed so the avatar is crisp without jitter or lag. Axis signs are
// tuned for a mirrored (selfie) webcam; a per-user calibration pass can refine them later.

import * as THREE from 'three';
import { OneEuroBank } from './oneEuro';
import type { FaceFrame } from './faceTracker';

export interface RetargetResult {
  expressions: Record<string, number>;       // VRM expression name -> weight 0..1
  head: { x: number; y: number; z: number };  // head bone euler (radians)
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export class FaceRetargeter {
  private exprBank = new OneEuroBank(3.5, 0.01); // expressions: responsive (blink/lipsync)
  private headBank = new OneEuroBank(1.2, 0.03); // head pose: smoother
  private _m = new THREE.Matrix4();
  private _e = new THREE.Euler();

  retarget(frame: FaceFrame, tSec: number): RetargetResult {
    const b = frame.blendshapes;
    const bs = (k: string) => b[k] ?? 0;

    const blinkL = clamp01(bs('eyeBlinkLeft'));
    const blinkR = clamp01(bs('eyeBlinkRight'));
    const raw: Record<string, number> = {
      // lip-sync vowels
      aa: clamp01(bs('jawOpen') * 1.2),
      ou: clamp01(bs('mouthPucker')),
      ih: clamp01(((bs('mouthSmileLeft') + bs('mouthSmileRight')) / 2) * (1 - bs('jawOpen'))),
      ee: clamp01((bs('mouthStretchLeft') + bs('mouthStretchRight')) / 2),
      oh: clamp01(bs('mouthFunnel')),
      // eyes
      blink: clamp01(Math.max(blinkL, blinkR)),
      blinkLeft: blinkL,
      blinkRight: blinkR,
      // emotion
      happy: clamp01((bs('mouthSmileLeft') + bs('mouthSmileRight')) / 2),
      angry: clamp01((bs('browDownLeft') + bs('browDownRight')) / 2),
      sad: clamp01((bs('mouthFrownLeft') + bs('mouthFrownRight')) / 2),
      surprised: clamp01(bs('browInnerUp')),
      // eye gaze
      lookUp: clamp01((bs('eyeLookUpLeft') + bs('eyeLookUpRight')) / 2),
      lookDown: clamp01((bs('eyeLookDownLeft') + bs('eyeLookDownRight')) / 2),
      lookLeft: clamp01((bs('eyeLookInLeft') + bs('eyeLookOutRight')) / 2),
      lookRight: clamp01((bs('eyeLookOutLeft') + bs('eyeLookInRight')) / 2),
    };
    const expressions: Record<string, number> = {};
    for (const k in raw) expressions[k] = this.exprBank.filter(k, raw[k], tSec);

    let head = { x: 0, y: 0, z: 0 };
    if (frame.matrix) {
      this._m.fromArray(Array.from(frame.matrix)); // column-major → fromArray matches
      this._e.setFromRotationMatrix(this._m, 'YXZ');
      head = {
        x: this.headBank.filter('hx', this._e.x, tSec),   // pitch
        y: this.headBank.filter('hy', -this._e.y, tSec),  // yaw (mirror for selfie)
        z: this.headBank.filter('hz', -this._e.z, tSec),  // roll (mirror)
      };
    }
    return { expressions, head };
  }

  reset(): void { this.exprBank.reset(); this.headBank.reset(); }
}
