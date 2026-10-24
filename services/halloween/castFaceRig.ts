/**
 * castFaceRig.ts
 *
 * Talking rig for the Ravencrest cast. Their game skeleton stops at the Head bone (no jaw, lids or
 * brows), so when a model is loaded we rig its face: jaw, eyelid, brow and mouth-corner bones are
 * added under Head, the face's vertices are skinned to them, and the performer's expressions drive
 * those bones like any other puppet joint (the jaw hinges, lids close, brows lift, corners pull).
 * A small shader patch darkens the inside of the open mouth.
 *
 * Where each face is comes from FACE_CALIBRATION: MediaPipe run on a head-on render of the model,
 * its mouth/eye landmarks ray-cast back onto the mesh (bind-space POSITION coordinates). Models whose
 * faces MediaPipe can't read (pumpkin head, troll, werewolf, zombie) have no entry: head/body only.
 */

import * as THREE from 'three';

export interface FaceExpression {
  jawOpen: number;
  smile: number;
  /** Lips pushed forward (ooh). */
  pucker: number;
  browUp: number;
  browDown: number;
  blinkL: number;
  blinkR: number;
}

export const NEUTRAL_FACE: FaceExpression = {
  jawOpen: 0, smile: 0, pucker: 0, browUp: 0, browDown: 0, blinkL: 0, blinkR: 0,
};

/** MediaPipe blendshape scores → rig channels. Gains lift the small raw scores of everyday speech. */
export function expressionFromBlendshapes(b: Record<string, number> | null | undefined): FaceExpression {
  if (!b) return NEUTRAL_FACE;
  const g = (k: string) => b[k] ?? 0;
  const c = (v: number) => Math.max(0, Math.min(1, v));
  return {
    jawOpen: c((g('jawOpen') - 0.04) * 2.4),
    smile: c((g('mouthSmileLeft') + g('mouthSmileRight')) * 0.9),
    pucker: c(Math.max(g('mouthPucker'), g('mouthFunnel')) * 1.3),
    browUp: c(g('browInnerUp') * 1.6 + (g('browOuterUpLeft') + g('browOuterUpRight')) * 0.4),
    browDown: c((g('browDownLeft') + g('browDownRight')) * 0.9),
    // Selfie mirror: the performer's left eye (screen left) drives the character's right eye.
    blinkL: c((g('eyeBlinkRight') - 0.1) * 1.5),
    blinkR: c((g('eyeBlinkLeft') - 0.1) * 1.5),
  };
}

type V3 = [number, number, number];
interface FaceCalibration { mouth: V3; cornerA: V3; cornerB: V3; eye0: V3; eye1: V3 }

/** Bind-space face landmarks per model file (see the header). */
const FACE_CALIBRATION: Record<string, FaceCalibration> = {
  crane: { mouth: [-0.00565, 1.74058, 0.16203], cornerA: [-0.03882, 1.73944, 0.14508], cornerB: [0.0271, 1.74115, 0.15545], eye0: [-0.03918, 1.80591, 0.143], eye1: [0.03741, 1.81092, 0.14155] },
  dracula: { mouth: [0.02656, 1.71049, 0.34226], cornerA: [-0.01251, 1.70941, 0.33651], cornerB: [0.06832, 1.70895, 0.29258], eye0: [-0.01841, 1.8057, 0.36071], eye1: [0.06753, 1.80513, 0.34778] },
  elise: { mouth: [0.02714, 1.73094, 0.16816], cornerA: [0.00052, 1.73176, 0.15764], cornerB: [0.05477, 1.72796, 0.15239], eye0: [-0.00772, 1.80921, 0.15671], eye1: [0.06489, 1.80882, 0.15556] },
  ghost: { mouth: [0.00306, 1.76537, 0.21917], cornerA: [-0.0206, 1.76338, 0.206], cornerB: [0.02708, 1.76393, 0.20025], eye0: [-0.03032, 1.83359, 0.20501], eye1: [0.03858, 1.83322, 0.20134] },
  halo_angel: { mouth: [0.06531, 1.70367, 0.14303], cornerA: [0.0437, 1.70226, 0.12762], cornerB: [0.08883, 1.70211, 0.13153], eye0: [0.03579, 1.77225, 0.12047], eye1: [0.09752, 1.77444, 0.12451] },
  jack_thorne: { mouth: [-0.00788, 1.47847, 0.04688], cornerA: [-0.0327, 1.4787, 0.03455], cornerB: [0.0165, 1.47745, 0.04239], eye0: [-0.03777, 1.54038, 0.03335], eye1: [0.02245, 1.54178, 0.03944] },
  miriam: { mouth: [-0.00575, 1.6626, 0.14076], cornerA: [-0.03048, 1.66029, 0.12562], cornerB: [0.01858, 1.6614, 0.13468], eye0: [-0.0397, 1.73927, 0.12305], eye1: [0.03361, 1.73552, 0.12315] },
  stitch: { mouth: [-0.00812, 1.71029, 0.16823], cornerA: [-0.04595, 1.71159, 0.14667], cornerB: [0.02897, 1.70809, 0.16371], eye0: [-0.04723, 1.80887, 0.13266], eye1: [0.04776, 1.8051, 0.13858] },
  vampire: { mouth: [-0.06924, 1.71327, 0.40033], cornerA: [-0.09775, 1.72239, 0.43937], cornerB: [-0.04138, 1.69912, 0.27413], eye0: [-0.07765, 1.80633, 0.46862], eye1: [-0.0089, 1.79267, 0.34675] },
};

type FaceBoneId = 'jaw' | 'lidL' | 'lidR' | 'browL' | 'browR' | 'cornerL' | 'cornerR';

export interface FaceRig {
  bones: Record<FaceBoneId, THREE.Bone>;
  /** Rest positions (Head-local) of the bones that translate. */
  basePos: Record<FaceBoneId, THREE.Vector3>;
  /** Face axes in Head-local space (X across to the character's left, Y up the face, Z out). */
  axes: { x: THREE.Vector3; y: THREE.Vector3; z: THREE.Vector3 };
  /** Eye distance in Head-local units (the rig's length unit). */
  d: number;
  shade: { value: number };
  current: FaceExpression;
}

const smooth = (t: number) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};
/** 1 at the centre of an ellipse, falling smoothly to 0 at its rim. */
const blob = (u: number, v: number) => 1 - smooth(Math.hypot(u, v));

/**
 * Rig the face of a skinned mesh (call once per rig, after SkeletonUtils.clone; the geometry is
 * cloned here because new skin weights must not leak into other copies of the model).
 */
export function installFaceRig(mesh: THREE.SkinnedMesh, headBone: THREE.Bone, modelUrl: string): FaceRig | null {
  const key = modelUrl.split('/').pop()?.replace(/\.glb$/, '') ?? '';
  const c = FACE_CALIBRATION[key];
  const skel = mesh.skeleton;
  const hi = skel.bones.indexOf(headBone);
  if (!c || hi < 0) return null;

  // ── Face frame in bind (POSITION) space ──
  const v = (a: V3) => new THREE.Vector3(...a);
  const mouth = v(c.mouth);
  const e0 = v(c.eye0);
  const e1 = v(c.eye1);
  const d = e0.distanceTo(e1);
  const X = e1.clone().sub(e0).normalize();
  if (X.x < 0) X.negate();
  const eyesMid = e0.clone().add(e1).multiplyScalar(0.5);
  const Y = eyesMid.clone().sub(mouth);
  Y.sub(X.clone().multiplyScalar(Y.dot(X))).normalize();
  const Z = new THREE.Vector3().crossVectors(X, Y).normalize();
  const eyeL = e0.x > e1.x ? e0 : e1; // character's left eye is on +X
  const eyeR = e0.x > e1.x ? e1 : e0;
  const cA = v(c.cornerA);
  const cB = v(c.cornerB);
  const cornerL = cA.dot(X) > cB.dot(X) ? cA : cB;
  const cornerR = cA.dot(X) > cB.dot(X) ? cB : cA;
  const mouthHalf = Math.max(0.35 * d, cA.distanceTo(cB) / 2);
  const at = (p: THREE.Vector3, dx: number, dy: number, dz: number) =>
    p.clone().addScaledVector(X, dx * d).addScaledVector(Y, dy * d).addScaledVector(Z, dz * d);

  // Pivots (bind space): the jaw hinges back near the ears, level with the upper lip.
  const pivots: Record<FaceBoneId, THREE.Vector3> = {
    jaw: at(mouth, 0, 0.25, -1.1),
    lidL: eyeL.clone(),
    lidR: eyeR.clone(),
    browL: at(eyeL, 0, 0.42, 0),
    browR: at(eyeR, 0, 0.42, 0),
    cornerL: cornerL.clone(),
    cornerR: cornerR.clone(),
  };

  // ── Bones under Head, oriented to the face frame ──
  // bind space → skeleton bind space → Head-local (Head's bind pose).
  const toHead = new THREE.Matrix4().copy(skel.boneInverses[hi]).multiply(mesh.bindMatrix);
  const headBind = new THREE.Matrix4().copy(skel.boneInverses[hi]).invert();
  const rotHead = new THREE.Matrix4().extractRotation(toHead);
  const axes = {
    x: X.clone().applyMatrix4(rotHead).normalize(),
    y: Y.clone().applyMatrix4(rotHead).normalize(),
    z: Z.clone().applyMatrix4(rotHead).normalize(),
  };
  const faceQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(axes.x, axes.y, axes.z));
  const dHead = d * new THREE.Vector3().setFromMatrixScale(toHead).x;

  const bones = {} as Record<FaceBoneId, THREE.Bone>;
  const basePos = {} as Record<FaceBoneId, THREE.Vector3>;
  const newBones: THREE.Bone[] = [];
  const newInverses: THREE.Matrix4[] = [];
  for (const id of Object.keys(pivots) as FaceBoneId[]) {
    const b = new THREE.Bone();
    b.name = `Face_${id}`;
    b.position.copy(pivots[id]).applyMatrix4(toHead);
    b.quaternion.copy(faceQ);
    headBone.add(b);
    bones[id] = b;
    basePos[id] = b.position.clone();
    const bindWorld = new THREE.Matrix4().multiplyMatrices(headBind, new THREE.Matrix4().compose(b.position, b.quaternion, new THREE.Vector3(1, 1, 1)));
    newBones.push(b);
    newInverses.push(bindWorld.invert());
  }
  const base = skel.bones.length;
  const ids = Object.keys(pivots) as FaceBoneId[];
  mesh.bind(new THREE.Skeleton([...skel.bones, ...newBones], [...skel.boneInverses, ...newInverses]), mesh.bindMatrix);

  // ── Skin the face to the new bones ──
  mesh.geometry = mesh.geometry.clone();
  const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  const si = mesh.geometry.getAttribute('skinIndex') as THREE.BufferAttribute;
  const sw = mesh.geometry.getAttribute('skinWeight') as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  const loc = (q: THREE.Vector3, o: THREE.Vector3) => {
    const r = q.clone().sub(o);
    return [r.dot(X) / d, r.dot(Y) / d, r.dot(Z) / d];
  };
  const mw = mouthHalf / d;
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const [fx, fy, fz] = loc(p, mouth);
    const front = smooth((fz + 1.1) / 0.65); // only the front of the head
    if (front <= 0) continue;
    const w: Record<FaceBoneId, number> = {
      // Below the lip line inside the chin oval.
      jaw: blob(fx / 1.0, (fy + 0.6) / 0.85) * smooth((0.05 - fy) / 0.1) * front,
      lidL: 0, lidR: 0, browL: 0, browR: 0, cornerL: 0, cornerR: 0,
    };
    const [lx, ly] = loc(p, eyeL);
    const [rx, ry] = loc(p, eyeR);
    w.lidL = blob(lx / 0.34, ly / 0.22) * front;
    w.lidR = blob(rx / 0.34, ry / 0.22) * front;
    w.browL = blob(lx / 0.45, (ly - 0.42) / 0.2) * front;
    w.browR = blob(rx / 0.45, (ry - 0.42) / 0.2) * front;
    w.cornerL = blob((fx - mw) / 0.3, fy / 0.24) * front;
    w.cornerR = blob((fx + mw) / 0.3, fy / 0.24) * front;
    // One face bone per vertex: the strongest.
    let best: FaceBoneId = 'jaw';
    for (const id of ids) if (w[id] > w[best]) best = id;
    const wf = Math.min(0.95, w[best]);
    if (wf < 0.02) continue;
    // Free a slot (drop the weakest influence), scale the rest to (1 - wf).
    const idx = [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)];
    const wt = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)];
    let weakest = 0;
    for (let k = 1; k < 4; k++) if (wt[k] < wt[weakest]) weakest = k;
    wt[weakest] = 0;
    const sum = wt.reduce((a, b) => a + b, 0) || 1;
    for (let k = 0; k < 4; k++) wt[k] = (wt[k] / sum) * (1 - wf);
    idx[weakest] = base + ids.indexOf(best);
    wt[weakest] = wf;
    si.setXYZW(i, idx[0], idx[1], idx[2], idx[3]);
    sw.setXYZW(i, wt[0], wt[1], wt[2], wt[3]);
  }
  si.needsUpdate = true;
  sw.needsUpdate = true;

  // ── Open-mouth darkening (the model has no mouth interior) ──
  const shade = { value: 0 };
  const uMouth = { value: mouth };
  const uFX = { value: X };
  const uFY = { value: Y };
  const uFZ = { value: Z };
  const uD = { value: d };
  const uMW = { value: mw };
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const m of mats) {
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, { uShade: shade, uMouth, uFX, uFY, uFZ, uD, uMW });
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
uniform float uShade, uD, uMW;
uniform vec3 uMouth, uFX, uFY, uFZ;
varying float vMouthShade;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
{
  vec3 q = position - uMouth;
  float fx = dot(q, uFX) / uD, fy = dot(q, uFY) / uD, fz = dot(q, uFZ) / uD;
  float lip = 1.0 - smoothstep(0.0, 1.0, length(vec2(fx / (uMW * 1.05), (fy + 0.06) / 0.16)));
  vMouthShade = uShade * lip * smoothstep(-0.9, -0.4, fz);
}`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying float vMouthShade;`)
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>\ndiffuseColor.rgb *= 1.0 - 0.9 * clamp(vMouthShade * 1.5, 0.0, 1.0);`
        );
    };
    m.customProgramCacheKey = () => `cast-face-rig-${key}`;
    m.needsUpdate = true;
  }

  return { bones, basePos, axes, d: dHead, shade, current: { ...NEUTRAL_FACE } };
}

const hinge = new THREE.Quaternion();
const AXIS_X = new THREE.Vector3(1, 0, 0);

/** Ease the face toward `target` and pose its bones (call every frame, after the body pose). */
export function setFaceExpression(face: FaceRig, target: FaceExpression, dt: number) {
  const k = 1 - Math.exp(-dt * 22);
  const c = face.current;
  for (const key of Object.keys(c) as Array<keyof FaceExpression>) c[key] += (target[key] - c[key]) * k;
  const { bones: b, basePos: base, axes, d } = face;

  // Jaw hinges open (about the face's X axis; positive X rotation drops a +Z-facing chin).
  b.jaw.quaternion.setFromAxisAngle(AXIS_X, c.jawOpen * 0.42);
  b.jaw.quaternion.premultiply(hinge.setFromRotationMatrix(new THREE.Matrix4().makeBasis(axes.x, axes.y, axes.z)));
  b.jaw.position.copy(base.jaw).addScaledVector(axes.z, -c.pucker * 0.04 * d);

  // Lids squash shut along the face's Y.
  b.lidL.scale.set(1, 1 - 0.92 * c.blinkL, 1);
  b.lidR.scale.set(1, 1 - 0.92 * c.blinkR, 1);

  // Brows up / down.
  const brow = (c.browUp - c.browDown * 0.7) * 0.14 * d;
  b.browL.position.copy(base.browL).addScaledVector(axes.y, brow);
  b.browR.position.copy(base.browR).addScaledVector(axes.y, brow);

  // Mouth corners: smile pulls up and out, pucker pulls in and forward.
  for (const [bone, side] of [[b.cornerL, 1], [b.cornerR, -1]] as const) {
    bone.position
      .copy(side > 0 ? base.cornerL : base.cornerR)
      .addScaledVector(axes.y, c.smile * 0.12 * d)
      .addScaledVector(axes.x, side * (c.smile * 0.08 - c.pucker * 0.12) * d)
      .addScaledVector(axes.z, c.pucker * 0.08 * d);
  }

  face.shade.value = c.jawOpen;
}
