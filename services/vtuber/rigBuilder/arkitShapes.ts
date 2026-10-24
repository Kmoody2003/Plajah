// arkitShapes.ts — the 52 ARKit face shapes, built on a fitted MediaPipe face (468 points).
//
// Each shape is authored as "handles": landmark points that move by a given amount (in the face's
// own frame, in eye-distance units) plus anchor points that must stay put. The motion is spread over
// the rest of the face with a smooth, compact Gaussian blend, so every character gets the same
// semantic shapes fitted to its own proportions. Left/right follow ARKit: Left = the subject's left.
// eyeLook* are omitted on purpose — gaze turns the eyeballs (eye bones) instead.

import * as THREE from 'three';

export const ARKIT_SHAPES = [
  'eyeBlinkLeft', 'eyeSquintLeft', 'eyeWideLeft', 'eyeBlinkRight', 'eyeSquintRight', 'eyeWideRight',
  'jawForward', 'jawLeft', 'jawRight', 'jawOpen',
  'mouthClose', 'mouthFunnel', 'mouthPucker', 'mouthLeft', 'mouthRight',
  'mouthSmileLeft', 'mouthSmileRight', 'mouthFrownLeft', 'mouthFrownRight',
  'mouthDimpleLeft', 'mouthDimpleRight', 'mouthStretchLeft', 'mouthStretchRight',
  'mouthRollLower', 'mouthRollUpper', 'mouthShrugLower', 'mouthShrugUpper',
  'mouthPressLeft', 'mouthPressRight', 'mouthLowerDownLeft', 'mouthLowerDownRight',
  'mouthUpperUpLeft', 'mouthUpperUpRight',
  'browDownLeft', 'browDownRight', 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight',
  'cheekPuff', 'cheekSquintLeft', 'cheekSquintRight', 'noseSneerLeft', 'noseSneerRight',
] as const;
export type ArkitShape = (typeof ARKIT_SHAPES)[number];
/** Shapes MediaPipe reports that are not morphs here: gaze turns the eye bones; the tongue is its own mesh. */
export const ARKIT_GAZE = ['eyeLookDownLeft', 'eyeLookInLeft', 'eyeLookOutLeft', 'eyeLookUpLeft',
  'eyeLookDownRight', 'eyeLookInRight', 'eyeLookOutRight', 'eyeLookUpRight'] as const;

// ── MediaPipe landmark groups (subject's R = low indices, L = 2xx–3xx) ──
export const LM = {
  lipUpperOuter: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291],
  lipLowerOuter: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291],
  lipUpperInner: [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308],
  lipLowerInner: [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308],
  eyeRUpper: [33, 246, 161, 160, 159, 158, 157, 173, 133],
  eyeRLower: [33, 7, 163, 144, 145, 153, 154, 155, 133],
  eyeLUpper: [263, 466, 388, 387, 386, 385, 384, 398, 362],
  eyeLLower: [263, 249, 390, 373, 374, 380, 381, 382, 362],
  browR: [46, 53, 52, 65, 55, 70, 63, 105, 66, 107],
  browL: [276, 283, 282, 295, 285, 300, 293, 334, 296, 336],
  browInnerR: [55, 65, 107, 66],
  browInnerL: [285, 295, 336, 296],
  browOuterR: [46, 53, 70, 63],
  browOuterL: [276, 283, 300, 293],
  chin: [152, 148, 176, 149, 377, 400, 378, 175, 171, 396, 199, 200, 18, 83, 313, 32, 262, 201, 421],
  jawR: [136, 172, 58, 150, 169, 135],
  jawL: [365, 397, 288, 379, 394, 364],
  nose: [1, 2, 4, 5, 6, 195, 197, 98, 327, 64, 294, 168, 19, 94],
  noseWingR: [48, 64, 98, 129, 102, 49],
  noseWingL: [278, 294, 327, 358, 331, 279],
  cheekR: [50, 101, 118, 117, 123, 187, 205, 36, 147, 116],
  cheekL: [280, 330, 347, 346, 352, 411, 425, 266, 376, 345],
  underEyeR: [111, 117, 118, 119, 120, 121, 47, 100, 31, 228, 229, 230, 231],
  underEyeL: [340, 346, 347, 348, 349, 350, 277, 329, 261, 448, 449, 450, 451],
  forehead: [10, 151, 9, 8, 109, 67, 103, 338, 297, 332, 108, 69, 337, 299],
  oval: [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109],
};

export interface FaceFrame {
  X: THREE.Vector3; // toward the subject's left
  Y: THREE.Vector3; // up the face
  Z: THREE.Vector3; // out of the face
  d: number; // eye distance
  mouth: THREE.Vector3;
}

export function faceFrameOf(P: THREE.Vector3[]): FaceFrame {
  const avg = (ids: number[]) => ids.reduce((s, i) => s.add(P[i]), new THREE.Vector3()).divideScalar(ids.length);
  const eyeR = avg([...LM.eyeRUpper, ...LM.eyeRLower]);
  const eyeL = avg([...LM.eyeLUpper, ...LM.eyeLLower]);
  const mouth = avg([...LM.lipUpperInner, ...LM.lipLowerInner]);
  const X = eyeL.clone().sub(eyeR);
  const d = X.length();
  X.normalize();
  const Y = eyeL.clone().add(eyeR).multiplyScalar(0.5).sub(mouth);
  Y.sub(X.clone().multiplyScalar(Y.dot(X))).normalize();
  const Z = new THREE.Vector3().crossVectors(X, Y).normalize();
  return { X, Y, Z, d, mouth };
}

type Handles = Map<number, THREE.Vector3>;

/** Spread handle motion over all 468 points: Gaussian-weighted blend, fading to 0 away from handles. */
function propagate(P: THREE.Vector3[], h: Handles, sigma: number): Float32Array {
  const out = new Float32Array(P.length * 3);
  const ids = [...h.keys()];
  const s2 = sigma * sigma;
  // A small constant weight of "no motion" makes points far from every handle stay still.
  const w0 = Math.exp(-4);
  for (let v = 0; v < P.length; v++) {
    const own = h.get(v);
    if (own) {
      out[v * 3] = own.x;
      out[v * 3 + 1] = own.y;
      out[v * 3 + 2] = own.z;
      continue;
    }
    let wx = 0, wy = 0, wz = 0, ws = w0;
    for (const i of ids) {
      const dd = P[v].distanceToSquared(P[i]);
      const w = Math.exp(-dd / s2);
      if (w < 1e-6) continue;
      const m = h.get(i)!;
      wx += w * m.x;
      wy += w * m.y;
      wz += w * m.z;
      ws += w;
    }
    out[v * 3] = wx / ws;
    out[v * 3 + 1] = wy / ws;
    out[v * 3 + 2] = wz / ws;
  }
  return out;
}

/** All 43 morph shapes for a fitted face: name → per-landmark deltas (bind space). */
export interface JawHinge {
  hinge: THREE.Vector3;
  axis: THREE.Vector3;
  /** Signed angle at jawOpen = 1 (the sign makes the chin drop). */
  angle: number;
}

export function buildArkitShapes(P: THREE.Vector3[]): {
  frame: FaceFrame;
  shapes: Record<ArkitShape, Float32Array>;
  jaw: JawHinge;
} {
  const F = faceFrameOf(P);
  const { X, Y, Z, d } = F;
  const D = (x: number, y: number, z: number) =>
    X.clone().multiplyScalar(x * d).addScaledVector(Y, y * d).addScaledVector(Z, z * d);
  const ZERO = new THREE.Vector3();
  const fx = (i: number) => P[i].clone().sub(F.mouth).dot(X) / d;
  const set = (h: Handles, ids: number[], v: THREE.Vector3 | ((i: number) => THREE.Vector3)) => {
    for (const i of ids) h.set(i, typeof v === 'function' ? v(i) : v.clone());
  };
  const anchor = (h: Handles, ...groups: number[][]) => {
    for (const g of groups) for (const i of g) if (!h.has(i)) h.set(i, ZERO.clone());
  };
  const lipsAll = [...LM.lipUpperOuter, ...LM.lipLowerOuter, ...LM.lipUpperInner, ...LM.lipLowerInner];
  const upperLip = [...LM.lipUpperOuter, ...LM.lipUpperInner];
  const lowerLip = [...LM.lipLowerOuter, ...LM.lipLowerInner].filter((i) => ![61, 291, 78, 308].includes(i));
  const half = (ids: number[], side: 1 | -1) => ids.filter((i) => fx(i) * side > 0.02);
  const cornerL = [291, 308, 409, 375];
  const cornerR = [61, 78, 185, 146];
  const sigmaMouth = 0.32 * d;
  const sigmaEye = 0.16 * d;

  // Jaw hinge: behind and above the mouth (near the ears).
  const hinge = F.mouth.clone().addScaledVector(Y, 0.3 * d).addScaledVector(Z, -1.35 * d);
  const jawAngle = 0.34;
  let jawSign = 1;
  {
    const q = new THREE.Quaternion().setFromAxisAngle(X, jawAngle);
    const p = P[152].clone().sub(hinge).applyQuaternion(q).add(hinge);
    if (p.clone().sub(P[152]).dot(Y) > 0) jawSign = -1; // the chin must drop
  }
  const jawDelta = (i: number, amount = 1) => {
    const q = new THREE.Quaternion().setFromAxisAngle(X, jawSign * jawAngle * amount);
    return P[i].clone().sub(hinge).applyQuaternion(q).add(hinge).sub(P[i]);
  };

  const S = {} as Record<ArkitShape, Float32Array>;
  const make = (name: ArkitShape, sigma: number, build: (h: Handles) => void) => {
    const h: Handles = new Map();
    build(h);
    S[name] = propagate(P, h, sigma);
  };

  // ── Eyes: lids close onto the lower lid line; squint/wide move them part way ──
  for (const [side, U, L, brow, under] of [
    ['Left', LM.eyeLUpper, LM.eyeLLower, LM.browL, LM.underEyeL],
    ['Right', LM.eyeRUpper, LM.eyeRLower, LM.browR, LM.underEyeR],
  ] as const) {
    const lid = (k: number, upAmt: number, downAmt: number) => (h: Handles) => {
      U.forEach((u, j) => {
        if (j === 0 || j === U.length - 1) return; // corners stay
        const gap = P[L[j]].clone().sub(P[u]);
        h.set(u, gap.clone().multiplyScalar(upAmt));
        h.set(L[j], gap.clone().multiplyScalar(-downAmt));
      });
      h.set(U[0], ZERO.clone());
      h.set(U[U.length - 1], ZERO.clone());
      anchor(h, brow, under, LM.nose);
      void k;
    };
    // Overshoot a touch: the cut rim sits slightly inside the landmark ring, so 1.0 would leave a slit.
    make(`eyeBlink${side}` as ArkitShape, sigmaEye, lid(0, 1.04, 0.12));
    make(`eyeSquint${side}` as ArkitShape, sigmaEye, lid(0, 0.18, 0.35));
    make(`eyeWide${side}` as ArkitShape, sigmaEye, lid(0, -0.35, 0));
  }

  // ── Jaw ──
  make('jawOpen', 0.5 * d, (h) => {
    set(h, [...lowerLip, ...LM.chin], (i) => jawDelta(i));
    set(h, [...LM.jawL, ...LM.jawR], (i) => jawDelta(i, 0.55));
    anchor(h, upperLip, LM.nose, LM.cheekL, LM.cheekR, LM.underEyeL, LM.underEyeR);
  });
  make('jawForward', 0.5 * d, (h) => {
    set(h, [...lowerLip, ...LM.chin], D(0, 0, 0.12));
    set(h, [...LM.jawL, ...LM.jawR], D(0, 0, 0.06));
    anchor(h, upperLip, LM.nose);
  });
  make('jawLeft', 0.5 * d, (h) => {
    set(h, [...lowerLip, ...LM.chin], D(0.14, 0, 0));
    set(h, [...LM.jawL, ...LM.jawR], D(0.07, 0, 0));
    anchor(h, upperLip, LM.nose);
  });
  make('jawRight', 0.5 * d, (h) => {
    set(h, [...lowerLip, ...LM.chin], D(-0.14, 0, 0));
    set(h, [...LM.jawL, ...LM.jawR], D(-0.07, 0, 0));
    anchor(h, upperLip, LM.nose);
  });

  // ── Mouth ──
  make('mouthClose', sigmaMouth * 0.7, (h) => {
    // Used with jawOpen: brings the lips back together over an open jaw.
    set(h, lowerLip, (i) => jawDelta(i).negate());
    anchor(h, upperLip, LM.chin, LM.nose);
  });
  make('mouthFunnel', sigmaMouth, (h) => {
    set(h, lipsAll, (i) => D(-fx(i) * 0.25, 0, 0.12));
    set(h, LM.lipUpperInner, (i) => D(-fx(i) * 0.25, 0.07, 0.1));
    set(h, LM.lipLowerInner.filter((i) => !h.has(i) || true), (i) => D(-fx(i) * 0.25, -0.07, 0.1));
    anchor(h, LM.nose, LM.chin, LM.cheekL, LM.cheekR);
  });
  make('mouthPucker', sigmaMouth, (h) => {
    set(h, lipsAll, (i) => D(-fx(i) * 0.4, 0, 0.15));
    anchor(h, LM.nose, LM.chin, LM.cheekL, LM.cheekR);
  });
  make('mouthLeft', sigmaMouth, (h) => {
    set(h, lipsAll, D(0.18, 0, 0));
    anchor(h, LM.nose, LM.chin);
  });
  make('mouthRight', sigmaMouth, (h) => {
    set(h, lipsAll, D(-0.18, 0, 0));
    anchor(h, LM.nose, LM.chin);
  });
  for (const [side, s, corner, cheek, under] of [
    ['Left', 1, cornerL, LM.cheekL, LM.underEyeL],
    ['Right', -1, cornerR, LM.cheekR, LM.underEyeR],
  ] as const) {
    const others = (h: Handles) => anchor(h, LM.nose, LM.chin, s > 0 ? cornerR : cornerL);
    make(`mouthSmile${side}` as ArkitShape, sigmaMouth, (h) => {
      set(h, corner, D(s * 0.1, 0.13, -0.05));
      set(h, cheek, D(s * 0.03, 0.06, 0.02));
      others(h);
    });
    make(`mouthFrown${side}` as ArkitShape, sigmaMouth, (h) => {
      set(h, corner, D(s * 0.02, -0.13, 0));
      others(h);
    });
    make(`mouthDimple${side}` as ArkitShape, sigmaMouth, (h) => {
      set(h, corner, D(s * 0.07, 0, -0.08));
      others(h);
    });
    make(`mouthStretch${side}` as ArkitShape, sigmaMouth, (h) => {
      set(h, corner, D(s * 0.14, -0.04, -0.02));
      set(h, half(LM.lipLowerOuter, s), D(s * 0.04, -0.03, 0));
      others(h);
    });
    make(`mouthPress${side}` as ArkitShape, sigmaMouth * 0.7, (h) => {
      set(h, half(LM.lipUpperInner, s), D(0, -0.03, -0.03));
      set(h, half(LM.lipLowerInner, s), D(0, 0.03, -0.03));
      anchor(h, LM.nose, LM.chin);
    });
    make(`mouthLowerDown${side}` as ArkitShape, sigmaMouth * 0.8, (h) => {
      set(h, half([...LM.lipLowerOuter, ...LM.lipLowerInner], s), D(0, -0.12, 0.02));
      anchor(h, upperLip, LM.chin, LM.nose);
    });
    make(`mouthUpperUp${side}` as ArkitShape, sigmaMouth * 0.8, (h) => {
      set(h, half([...LM.lipUpperOuter, ...LM.lipUpperInner], s), D(0, 0.1, 0.02));
      anchor(h, lowerLip, LM.nose);
    });
    void under;
  }
  make('mouthRollLower', sigmaMouth * 0.7, (h) => {
    set(h, LM.lipLowerOuter.filter((i) => ![61, 291].includes(i)), D(0, 0.05, -0.08));
    set(h, LM.lipLowerInner.filter((i) => ![78, 308].includes(i)), D(0, 0.02, -0.1));
    anchor(h, upperLip, LM.chin);
  });
  make('mouthRollUpper', sigmaMouth * 0.7, (h) => {
    set(h, LM.lipUpperOuter.filter((i) => ![61, 291].includes(i)), D(0, -0.05, -0.08));
    set(h, LM.lipUpperInner.filter((i) => ![78, 308].includes(i)), D(0, -0.02, -0.1));
    anchor(h, lowerLip, LM.nose);
  });
  make('mouthShrugLower', sigmaMouth, (h) => {
    set(h, [...lowerLip, ...LM.chin.slice(0, 8)], D(0, 0.08, 0.04));
    anchor(h, upperLip, LM.nose);
  });
  make('mouthShrugUpper', sigmaMouth, (h) => {
    set(h, upperLip, D(0, 0.06, 0.02));
    anchor(h, lowerLip, LM.nose);
  });

  // ── Brows, cheeks, nose ──
  for (const [side, s, brow, inner, outer, cheek, under, wing, eyeU] of [
    ['Left', 1, LM.browL, LM.browInnerL, LM.browOuterL, LM.cheekL, LM.underEyeL, LM.noseWingL, LM.eyeLUpper],
    ['Right', -1, LM.browR, LM.browInnerR, LM.browOuterR, LM.cheekR, LM.underEyeR, LM.noseWingR, LM.eyeRUpper],
  ] as const) {
    make(`browDown${side}` as ArkitShape, 0.3 * d, (h) => {
      set(h, brow, D(0, -0.18, 0));
      set(h, inner, D(-s * 0.09, -0.22, 0.02));
      anchor(h, eyeU, LM.forehead.slice(0, 6));
    });
    make(`browOuterUp${side}` as ArkitShape, 0.3 * d, (h) => {
      set(h, outer, D(0, 0.28, 0));
      anchor(h, eyeU, inner);
    });
    make(`cheekSquint${side}` as ArkitShape, 0.25 * d, (h) => {
      set(h, under, D(0, 0.07, 0.01));
      set(h, cheek, D(0, 0.05, 0.01));
      anchor(h, eyeU, LM.nose, LM.lipUpperOuter);
    });
    make(`noseSneer${side}` as ArkitShape, 0.22 * d, (h) => {
      set(h, wing, D(s * 0.01, 0.08, 0.01));
      set(h, inner, D(0, -0.04, 0));
      anchor(h, LM.lipUpperOuter, eyeU, [1, 4, 5]);
    });
  }
  make('browInnerUp', 0.3 * d, (h) => {
    set(h, [...LM.browInnerL, ...LM.browInnerR], D(0, 0.28, 0.01));
    anchor(h, LM.eyeLUpper, LM.eyeRUpper, LM.browOuterL, LM.browOuterR);
  });
  make('cheekPuff', 0.35 * d, (h) => {
    set(h, LM.cheekL, D(0.08, 0, 0.1));
    set(h, LM.cheekR, D(-0.08, 0, 0.1));
    anchor(h, LM.nose, lipsAll, LM.underEyeL, LM.underEyeR);
  });

  return { frame: F, shapes: S, jaw: { hinge, axis: X.clone(), angle: jawSign * jawAngle } };
}

/** Where a point goes when the jaw opens by `amount` (used for teeth/tongue/mouth parts). */
export function jawMove(jaw: JawHinge, p: THREE.Vector3, amount = 1): THREE.Vector3 {
  const q = new THREE.Quaternion().setFromAxisAngle(jaw.axis, jaw.angle * amount);
  return p.clone().sub(jaw.hinge).applyQuaternion(q).add(jaw.hinge).sub(p);
}
