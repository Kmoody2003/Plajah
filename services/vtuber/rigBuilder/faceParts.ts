// faceParts.ts — the parts a fused image-to-3D sculpt lacks: eyeballs, teeth, tongue, mouth interior.
//
// All are built in the body mesh's BIND space from the fitted face, skinned to the same skeleton:
// eyeballs to new LeftEye/RightEye bones (gaze), everything else rigidly to Head. The lower teeth,
// tongue and the floor of the mouth carry a jawOpen morph (the same hinge as the face) and the
// tongue a tongueOut morph, so one expression value moves the whole mouth together.

import * as THREE from 'three';
import { LM, jawMove, type FaceFrame, type JawHinge } from './arkitShapes';

export interface FaceParts {
  meshes: THREE.SkinnedMesh[];
  eyeBones: { left: THREE.Bone; right: THREE.Bone } | null;
}

function eyeTexture(iris: THREE.Color): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  // Equirect: the iris is painted at u = 0.75; the sphere is turned so that point faces +Z.
  g.fillStyle = '#ece6dc';
  g.fillRect(0, 0, 256, 256);
  const cx = 192, cy = 128;
  const grad = g.createRadialGradient(cx, cy, 2, cx, cy, 31);
  grad.addColorStop(0, '#000');
  grad.addColorStop(0.28, '#000');
  grad.addColorStop(0.32, `#${iris.clone().multiplyScalar(0.6).getHexString()}`);
  grad.addColorStop(0.85, `#${iris.getHexString()}`);
  grad.addColorStop(1, '#2a1d14');
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(cx, cy, 31, 31 * 2, 0, 0, Math.PI * 2); // a sphere's v spans half the angle of u
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Bake a geometry's vertices into bind space and skin it entirely to one bone. */
function skinned(geo: THREE.BufferGeometry, material: THREE.Material, boneIndex: number, name: string) {
  const n = geo.getAttribute('position').count;
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4).map((_, i) => (i % 4 === 0 ? boneIndex : 0)), 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(n * 4).map((_, i) => (i % 4 === 0 ? 1 : 0)), 4));
  const m = new THREE.SkinnedMesh(geo, material);
  m.name = name;
  m.frustumCulled = false;
  return m;
}

/** A frame (X across, Y up, Z out) at `origin`, as a matrix, for placing primitives on the face. */
function faceMatrix(F: FaceFrame, origin: THREE.Vector3) {
  return new THREE.Matrix4().makeBasis(F.X, F.Y, F.Z).setPosition(origin);
}

function jawMorph(geo: THREE.BufferGeometry, jaw: JawHinge, follow: (p: THREE.Vector3) => number) {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const delta = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const f = follow(p);
    if (!f) continue;
    const m = jawMove(jaw, p).multiplyScalar(f);
    delta[i * 3] = m.x;
    delta[i * 3 + 1] = m.y;
    delta[i * 3 + 2] = m.z;
  }
  const a = new THREE.Float32BufferAttribute(delta, 3);
  a.name = 'jawOpen';
  return a;
}

export function buildFaceParts(opts: {
  body: THREE.SkinnedMesh;
  head: THREE.Bone;
  P: THREE.Vector3[];
  frame: FaceFrame;
  jaw: JawHinge;
  irisColor: THREE.Color;
  /** Skip eyeballs (painted/carved eyes stay) or the mouth parts (teeth, tongue, interior). */
  eyes?: boolean;
  mouth?: boolean;
}): FaceParts | null {
  const wantEyes = opts.eyes !== false;
  const wantMouth = opts.mouth !== false;
  if (!wantEyes && !wantMouth) return null;
  const { body, head, P, frame: F, jaw } = opts;
  const skel = body.skeleton;
  const hi = skel.bones.indexOf(head);
  const headBind = new THREE.Matrix4().copy(skel.boneInverses[hi]).invert();
  const toHead = new THREE.Matrix4().copy(skel.boneInverses[hi]).multiply(body.bindMatrix);
  const d = F.d;
  const avg = (ids: number[]) => ids.reduce((s, i) => s.add(P[i]), new THREE.Vector3()).divideScalar(ids.length);

  // ── Eye bones + eyeballs ──
  const eyes: Record<'left' | 'right', { bone: THREE.Bone; centre: THREE.Vector3; r: number }> = {} as any;
  for (const [side, U, L] of (wantEyes ? [
    ['left', LM.eyeLUpper, LM.eyeLLower],
    ['right', LM.eyeRUpper, LM.eyeRLower],
  ] as const : [])) {
    const rim = avg([...U, ...L]);
    const width = P[U[0]].distanceTo(P[U[U.length - 1]]);
    // A human eyeball is ~2.4 cm across for a ~3 cm eye opening; its front sits just behind the lids
    // so the lids (the cut rim) close over it.
    const r = width * 0.46;
    const centre = rim.clone().addScaledVector(F.Z, -r * 1.05);
    const bone = new THREE.Bone();
    bone.name = side === 'left' ? 'LeftEye' : 'RightEye';
    bone.position.copy(centre).applyMatrix4(toHead);
    head.add(bone);
    eyes[side] = { bone, centre, r };
  }
  const newBones = wantEyes ? [eyes.left.bone, eyes.right.bone] : [];
  const newInv = newBones.map((b) =>
    new THREE.Matrix4().multiplyMatrices(headBind, new THREE.Matrix4().makeTranslation(b.position.x, b.position.y, b.position.z)).invert()
  );
  const base = skel.bones.length;
  const skeleton = new THREE.Skeleton([...skel.bones, ...newBones], [...skel.boneInverses, ...newInv]);
  body.bind(skeleton, body.bindMatrix);

  const meshes: THREE.SkinnedMesh[] = [];
  const eyeMat = new THREE.MeshStandardMaterial({ map: eyeTexture(opts.irisColor), roughness: 0.25, metalness: 0 });
  eyeMat.name = 'Eyes';
  (wantEyes ? (['left', 'right'] as const) : []).forEach((side, k) => {
    const e = eyes[side];
    const g = new THREE.SphereGeometry(e.r, 24, 16);
    // On three's sphere u = 0.25 faces +Z; a half turn brings the iris (u = 0.75) there.
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI));
    g.applyMatrix4(faceMatrix(F, e.centre));
    meshes.push(skinned(g, eyeMat, base + k, side === 'left' ? 'EyeLeft' : 'EyeRight'));
  });

  // ── Mouth ──
  const mouthCorner = (i: number) => P[i].clone();
  const halfW = mouthCorner(291).distanceTo(mouthCorner(61)) / 2;
  const mouthC = avg([...LM.lipUpperInner, ...LM.lipLowerInner]);
  const below = (p: THREE.Vector3) => (p.clone().sub(mouthC).dot(F.Y) < 0 ? 1 : 0);

  // Interior: a dark half-ellipsoid bag behind the lips; its floor follows the jaw.
  const bagMat = new THREE.MeshStandardMaterial({ color: 0x2a0b0d, roughness: 0.9, side: THREE.BackSide });
  bagMat.name = 'MouthInterior';
  const bag = new THREE.SphereGeometry(1, 20, 14, 0, Math.PI * 2, 0, Math.PI);
  // Its front stays behind the lips (≈0.1 eye-distances), so it only shows through the opening.
  bag.applyMatrix4(new THREE.Matrix4().makeScale(halfW * 1.1, 0.4 * d, 0.5 * d));
  bag.applyMatrix4(faceMatrix(F, mouthC.clone().addScaledVector(F.Z, -0.6 * d)));
  bag.morphAttributes.position = [jawMorph(bag, jaw, below)];
  bag.morphTargetsRelative = true;

  // Teeth: two curved rows just behind the lips.
  const teethMat = new THREE.MeshStandardMaterial({ color: 0xe9e2d3, roughness: 0.35 });
  teethMat.name = 'Teeth';
  const row = (up: boolean) => {
    const g = new THREE.CylinderGeometry(halfW * 0.95, halfW * 0.95, 0.11 * d, 24, 1, true, -Math.PI * 0.42, Math.PI * 0.84);
    // The arc already bulges toward +Z (forward); flatten its depth into a dental arch whose front
    // sits just behind the lips.
    g.applyMatrix4(new THREE.Matrix4().makeScale(1, 1, 0.55));
    const y = up ? 0.07 * d : -0.07 * d;
    g.applyMatrix4(faceMatrix(F, mouthC.clone().addScaledVector(F.Y, y).addScaledVector(F.Z, -0.06 * d - halfW * 0.95 * 0.55)));
    return g;
  };
  const upperTeeth = row(true);
  const lowerTeeth = row(false);
  lowerTeeth.morphAttributes.position = [jawMorph(lowerTeeth, jaw, () => 1)];
  lowerTeeth.morphTargetsRelative = true;

  // Tongue: a flattened ellipsoid on the floor of the mouth.
  const tongueMat = new THREE.MeshStandardMaterial({ color: 0xa8474e, roughness: 0.55 });
  tongueMat.name = 'Tongue';
  const tongue = new THREE.SphereGeometry(1, 18, 12);
  tongue.applyMatrix4(new THREE.Matrix4().makeScale(halfW * 0.65, 0.07 * d, 0.3 * d));
  const tongueC = mouthC.clone().addScaledVector(F.Y, -0.12 * d).addScaledVector(F.Z, -0.52 * d);
  tongue.applyMatrix4(faceMatrix(F, tongueC));
  const tOut = new Float32Array(tongue.getAttribute('position').count * 3);
  {
    const p = new THREE.Vector3();
    const tp = tongue.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < tp.count; i++) {
      p.fromBufferAttribute(tp, i);
      const front = Math.max(0, p.clone().sub(tongueC).dot(F.Z) / (0.3 * d) + 0.4); // tip moves most
      const m = F.Z.clone().multiplyScalar(0.6 * d * front).addScaledVector(F.Y, -0.06 * d * front);
      tOut[i * 3] = m.x;
      tOut[i * 3 + 1] = m.y;
      tOut[i * 3 + 2] = m.z;
    }
  }
  const tongueOut = new THREE.Float32BufferAttribute(tOut, 3);
  tongueOut.name = 'tongueOut';
  tongue.morphAttributes.position = [jawMorph(tongue, jaw, () => 0.9), tongueOut];
  tongue.morphTargetsRelative = true;

  const headIdx = hi;
  const bagMesh = skinned(bag, bagMat, headIdx, 'MouthInterior');
  const upper = skinned(upperTeeth, teethMat, headIdx, 'TeethUpper');
  const lower = skinned(lowerTeeth, teethMat, headIdx, 'TeethLower');
  const tongueMesh = skinned(tongue, tongueMat, headIdx, 'Tongue');
  for (const m of [bagMesh, lower]) {
    m.morphTargetDictionary = { jawOpen: 0 };
    m.morphTargetInfluences = [0];
  }
  tongueMesh.morphTargetDictionary = { jawOpen: 0, tongueOut: 1 };
  tongueMesh.morphTargetInfluences = [0, 0];
  if (wantMouth) meshes.push(bagMesh, upper, lower, tongueMesh);

  for (const m of meshes) {
    body.parent!.add(m);
    m.position.copy(body.position);
    m.quaternion.copy(body.quaternion);
    m.scale.copy(body.scale);
    m.bind(skeleton, body.bindMatrix);
  }
  return { meshes, eyeBones: wantEyes ? { left: eyes.left.bone, right: eyes.right.bone } : null };
}

/** Average colour of a texture around a UV (the painted iris), for tinting the new eyeballs. */
export function sampleTextureColor(tex: THREE.Texture | null | undefined, uv: THREE.Vector2 | null): THREE.Color | null {
  const img = tex?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!img || !uv || !img.width) return null;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const x = Math.round(uv.x * (img.width - 1));
  const y = Math.round((tex!.flipY ? 1 - uv.y : uv.y) * (img.height - 1));
  const r = 3;
  const data = g.getImageData(Math.max(0, x - r), Math.max(0, y - r), r * 2 + 1, r * 2 + 1).data;
  let R = 0, G = 0, B = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) { R += data[i]; G += data[i + 1]; B += data[i + 2]; n++; }
  return new THREE.Color(R / n / 255, G / n / 255, B / n / 255).convertSRGBToLinear();
}
