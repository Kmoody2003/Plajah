/**
 * ravencrestCastStage.ts
 *
 * The Ravencrest cast as puppets: loads the same character GLBs the game uses
 * (public/games/ravencrest/assets/characters), normalizes them to one height, plays their baked
 * idle, and turns the head/neck from a tracked face. Shared by the 3D character studio and the
 * fan room's live webcam booth.
 */

import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { installFaceRig, setFaceExpression, NEUTRAL_FACE, type FaceExpression, type FaceRig } from './castFaceRig';
import { VRMLoaderPlugin, type VRM } from '@pixiv/three-vrm';

/** Every model is scaled to this height so one camera framing fits the whole cast. */
export const STAGE_HEIGHT = 1.8;

export interface StageRig {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer | null;
  head: THREE.Object3D | null;
  neck: THREE.Object3D | null;
  /** Rest pose, restored every frame before the idle clip and head turns are applied. */
  rest: Array<[THREE.Object3D, THREE.Quaternion]>;
  yaw: number;
  pitch: number;
  roll: number;
  /** Bones the procedural emotes move (any may be missing on a creature rig). */
  bones: Partial<
    Record<
      'spine' | 'lowSpine' | 'chest' | 'leftArm' | 'leftForeArm' | 'leftHand' | 'rightArm' | 'rightForeArm' | 'rightHand',
      THREE.Object3D
    >
  >;
  /** Filtered body tracking (stage space): limb directions and the torso's rotation; null = not tracked. */
  body: Record<'leftUpper' | 'leftFore' | 'rightUpper' | 'rightFore', THREE.Vector3 | null> & {
    chest: THREE.Quaternion | null;
    /** Torso as tracked, before recentering. */
    chestRaw: THREE.Quaternion | null;
    /** The performer's "facing forward" torso (set by recenterBody). */
    chestNeutral: THREE.Quaternion | null;
  };
  clips: THREE.AnimationClip[];
  idleAction: THREE.AnimationAction | null;
  /** Seconds since the rig was built (drives emotes). */
  time: number;
  emote: { id: CastEmoteId; start: number; action: THREE.AnimationAction | null } | null;
  /** Runtime face deformer (null if the face couldn't be located on this model). */
  face: FaceRig | null;
  /** Latest tracked expression; eased into the face every frame. */
  expression: FaceExpression;
  /** VTuber build (VRM with ARKit "perfect sync" expressions + eye bones), when the character has one. */
  vrm: VRM | null;
  /** Raw MediaPipe blendshapes for the VRM path (applied 1:1, mirrored), or null. */
  blend: Record<string, number> | null;
}

/**
 * Avatar emotes. The procedural ones work on every rig (they move bones in stage space); the
 * clip ones play the model's own Ravencrest game animation and are offered only when it has it.
 */
export type CastEmoteId = 'wave' | 'cheer' | 'nod' | 'bow' | 'shrug' | 'strike' | 'flinch' | 'menace';

export const CAST_EMOTES: Array<{ id: CastEmoteId; label: string; emoji: string; clip?: string }> = [
  { id: 'wave', label: 'Wave', emoji: '👋' },
  { id: 'cheer', label: 'Cheer', emoji: '🙌' },
  { id: 'nod', label: 'Nod', emoji: '🙂' },
  { id: 'bow', label: 'Bow', emoji: '🙇' },
  { id: 'shrug', label: 'Shrug', emoji: '🤷' },
  { id: 'strike', label: 'Strike', emoji: '⚔️', clip: 'attack_1' },
  { id: 'flinch', label: 'Flinch', emoji: '😱', clip: 'hit' },
  { id: 'menace', label: 'Menace', emoji: '😈', clip: 'chase' },
];

const EMOTE_SECONDS = 2.4;

/** Emotes this rig can play (clip emotes need the clip baked into its GLB). */
export function emotesFor(rig: StageRig) {
  return CAST_EMOTES.filter((e) => !e.clip || rig.clips.some((c) => c.name === e.clip));
}

export function playEmote(rig: StageRig, id: CastEmoteId) {
  rig.emote?.action?.fadeOut(0.2);
  const def = CAST_EMOTES.find((e) => e.id === id);
  const clip = def?.clip ? rig.clips.find((c) => c.name === def.clip) : undefined;
  let action: THREE.AnimationAction | null = null;
  if (clip && rig.mixer) {
    action = rig.mixer.clipAction(clip);
    action.reset().setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.fadeIn(0.2).play();
    rig.idleAction?.fadeOut(0.2);
  }
  rig.emote = { id, start: rig.time, action };
}

const gltfCache: Record<string, Promise<GLTF>> = {};

/** Each GLB is fetched once per page; callers clone it with buildStageRig. */
export function loadCastGltf(url: string): Promise<GLTF> {
  if (!gltfCache[url]) {
    gltfCache[url] = new GLTFLoader().loadAsync(url).then((gltf) => {
      gltf.userData = { ...gltf.userData, castUrl: url }; // picks the face calibration
      return gltf;
    });
    gltfCache[url].catch(() => delete gltfCache[url]);
  }
  return gltfCache[url];
}

/** A puppet for a character: its VTuber build (.vrm) when it has one, else the game GLB. */
export function loadCastRig(url: string): Promise<StageRig> {
  return /\.vrm$/i.test(url) ? loadVrmRig(url) : loadCastGltf(url).then((gltf) => buildStageRig(gltf));
}

/**
 * Load a character's VTuber build (VRM 1.0 from services/vtuber/rigBuilder): same puppet as the
 * game GLB, but the face is the VRM's own ARKit shapes, eyeballs, teeth and tongue. Each call loads
 * a fresh copy (VRM expressions point at their own meshes, so it can't be cloned).
 */
export async function loadVrmRig(url: string): Promise<StageRig> {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await loader.loadAsync(url);
  const vrm = gltf.userData.vrm as VRM | undefined;
  if (!vrm) throw new Error(`${url} is not a VRM`);
  // We pose the raw bones ourselves; the VRM only drives expressions and gaze.
  vrm.humanoid.autoUpdateHumanBones = false;
  if (vrm.lookAt) vrm.lookAt.autoUpdate = false;
  gltf.userData.castUrl = ''; // no runtime face rig: the VRM has a real one
  const rig = buildStageRig(gltf, { clone: false });
  rig.vrm = vrm;
  return rig;
}

export function buildStageRig(gltf: GLTF, opts: { clone?: boolean } = {}): StageRig {
  const model = opts.clone === false ? gltf.scene : SkeletonUtils.clone(gltf.scene);
  // Skinned bounds are measured through the bones, so their world matrices must be current
  // (Jack's Meshy rig otherwise measures a few cm tall and gets blown up 6x).
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const s = STAGE_HEIGHT / Math.max(0.3, size.y);
  model.scale.setScalar(s);
  const center = box.getCenter(new THREE.Vector3());
  model.position.set(-center.x * s, -box.min.y * s, -center.z * s);
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false; // skinned bounds lag the pose
    // Per-rig materials: the face deformer's uniforms must not leak between two copies of a model.
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone();
  });

  const root = new THREE.Group();
  root.add(model);
  const head = model.getObjectByName('Head') ?? null;
  const neck = model.getObjectByName('Neck') ?? model.getObjectByName('neck') ?? null;
  const rest: StageRig['rest'] = [];
  model.traverse((o) => {
    if ((o as THREE.Bone).isBone) rest.push([o, o.quaternion.clone()]);
  });
  const find = (...names: string[]) => {
    for (const n of names) {
      const o = model.getObjectByName(n);
      if (o) return o;
    }
    return undefined;
  };
  const bones: StageRig['bones'] = {
    spine: find('Spine2', 'Spine02', 'Spine1', 'Spine01', 'Spine'),
    leftArm: find('LeftArm'),
    leftForeArm: find('LeftForeArm'),
    rightArm: find('RightArm'),
    rightForeArm: find('RightForeArm'),
    leftHand: find('LeftHand'),
    rightHand: find('RightHand'),
  };
  // Torso bones by structure (rigs name their spine chain differently, even in reverse order):
  // the spine bone right under the hips, and the bone the neck hangs from.
  const hips = find('Hips');
  bones.lowSpine = hips?.children.find((ch) => (ch as THREE.Bone).isBone && /spine/i.test(ch.name));
  bones.chest = neck?.parent && neck.parent !== bones.lowSpine ? neck.parent : undefined;

  // Ravencrest monsters/cast ship baked clips (idle, walk, …); Jack only carries a bind pose.
  let face: FaceRig | null = null;
  const url: string = gltf.userData?.castUrl ?? '';
  model.traverse((o) => {
    if (!face && head && (o as THREE.SkinnedMesh).isSkinnedMesh) {
      face = installFaceRig(o as THREE.SkinnedMesh, head as THREE.Bone, url);
    }
  });

  const idle = gltf.animations.find((a) => a.name === 'idle');
  const mixer = gltf.animations.length ? new THREE.AnimationMixer(model) : null;
  const idleAction = idle && mixer ? mixer.clipAction(idle).play() : null;
  return {
    root, mixer, head, neck, rest, yaw: 0, pitch: 0, roll: 0,
    bones, clips: gltf.animations, idleAction, time: 0, emote: null,
    body: { leftUpper: null, leftFore: null, rightUpper: null, rightFore: null, chest: null, chestRaw: null, chestNeutral: null },
    face, expression: { ...NEUTRAL_FACE }, vrm: null, blend: null,
  };
}

const offset = new THREE.Quaternion();
const parentQ = new THREE.Quaternion();
const parentQInv = new THREE.Quaternion();
const euler = new THREE.Euler();

/**
 * Poses one frame: rest pose → idle clip → head/neck turned toward the target (radians, stage
 * space: yaw about up, pitch nods toward the camera, roll tilts in the picture plane).
 * `bodyYaw` is how much of the turn the whole body takes.
 */
export function poseStageRig(
  rig: StageRig,
  dt: number,
  target: { yaw: number; pitch: number; roll: number },
  bodyYaw = 0.15
) {
  const k = 1 - Math.exp(-dt * 10);
  rig.yaw += (target.yaw - rig.yaw) * k;
  rig.pitch += (target.pitch - rig.pitch) * k;
  rig.roll += (target.roll - rig.roll) * k;

  rig.time += dt;
  // Start from the rest pose every frame, then let the idle clip pose what it animates —
  // some idles leave the head/neck unkeyed, and the turns below would otherwise accumulate.
  for (const [bone, q] of rig.rest) bone.quaternion.copy(q);
  rig.mixer?.update(dt);

  // Head carries most of the turn, the neck the rest. Turns are authored in stage space and
  // converted into each bone's parent frame, because the cast's rigs don't share bone axes.
  rig.root.rotation.y = rig.yaw * bodyYaw;
  rig.root.updateMatrixWorld(true);
  for (const [bone, share] of [[rig.neck, 0.35], [rig.head, 0.65]] as const) {
    turnInStage(bone, rig.pitch * share, rig.yaw * share, rig.roll * share);
  }
  applyBody(rig);
  applyEmote(rig);
  if (rig.face) setFaceExpression(rig.face, rig.expression, dt);
  if (rig.vrm) applyVrmFace(rig.vrm, rig.blend, dt);
}

const swapSide = (n: string) => (n.includes('Left') ? n.replace('Left', 'Right') : n.replace('Right', 'Left'));

/**
 * Perfect sync: every MediaPipe blendshape drives the VRM expression of the same ARKit name. The
 * view is a mirror, so the performer's left (screen left) drives the character's right. Gaze turns
 * the eye bones through the VRM's lookAt.
 */
function applyVrmFace(vrm: VRM, blend: Record<string, number> | null, dt: number) {
  const em = vrm.expressionManager;
  if (em) {
    for (const ex of Object.values(em.customExpressionMap)) ex.weight = 0;
    if (blend) {
      for (const [name, value] of Object.entries(blend)) {
        if (name.startsWith('eyeLook') || name === '_neutral') continue;
        const target = swapSide(name);
        if (em.getExpression(target)) em.setValue(target, Math.min(1, value * (name === 'jawOpen' ? 1.25 : 1)));
      }
    }
    em.update();
  }
  if (vrm.lookAt) {
    const g = (k: string) => blend?.[k] ?? 0;
    // Mirror: the performer looking to their left looks to the screen's left = the character's right.
    const right = (g('eyeLookOutLeft') + g('eyeLookInRight')) / 2;
    const left = (g('eyeLookInLeft') + g('eyeLookOutRight')) / 2;
    const up = (g('eyeLookUpLeft') + g('eyeLookUpRight')) / 2;
    const down = (g('eyeLookDownLeft') + g('eyeLookDownRight')) / 2;
    vrm.lookAt.yaw = (left - right) * 25;
    vrm.lookAt.pitch = (up - down) * 18;
    vrm.lookAt.update(dt);
  }
}

/**
 * Full-body tracking input: MediaPipe pose WORLD landmarks of the performer (33 points, metres,
 * hip-centred; x right / y down as in the camera image, z smaller = nearer the camera; `v` =
 * visibility). Pass null when the body is lost — arms and torso ease back to the idle pose.
 * The view is a selfie mirror: the character copies what's on screen, so the performer's LEFT arm
 * (on the screen's left) drives the character's RIGHT arm (it faces the camera, so its right is on
 * the screen's left).
 */
export interface BodyPoseInput {
  world: Array<{ x: number; y: number; z: number; v: number }>;
}

const SEEN = 0.5;
const LM = { shoulderL: 11, shoulderR: 12, elbowL: 13, elbowR: 14, wristL: 15, wristR: 16, hipL: 23, hipR: 24 } as const;

/** One-Euro filter on a vector: smooth when still, responsive when moving fast (no lag on big moves). */
class OneEuroVec {
  private x: THREE.Vector3 | null = null;
  private dx = new THREE.Vector3();
  constructor(private minCutoff = 1.4, private beta = 0.6, private dCutoff = 1.0) {}
  private static alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / Math.max(1e-3, dt));
  }
  filter(v: THREE.Vector3, dt: number): THREE.Vector3 {
    if (!this.x) {
      this.x = v.clone();
      return this.x;
    }
    const rawD = v.clone().sub(this.x).divideScalar(Math.max(1e-3, dt));
    this.dx.lerp(rawD, OneEuroVec.alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * this.dx.length();
    this.x.lerp(v, OneEuroVec.alpha(cutoff, dt));
    return this.x;
  }
  reset() {
    this.x = null;
    this.dx.set(0, 0, 0);
  }
}

type BodyKey = 'leftUpper' | 'leftFore' | 'rightUpper' | 'rightFore' | 'chestRight' | 'chestUp';
const filters = new WeakMap<StageRig, Record<BodyKey, OneEuroVec>>();

export function setBodyPose(rig: StageRig, pose: BodyPoseInput | null, dt: number) {
  let f = filters.get(rig);
  if (!f) {
    f = {
      leftUpper: new OneEuroVec(), leftFore: new OneEuroVec(), rightUpper: new OneEuroVec(),
      rightFore: new OneEuroVec(), chestRight: new OneEuroVec(0.8, 0.3), chestUp: new OneEuroVec(0.8, 0.3),
    };
    filters.set(rig, f);
  }
  const fl = f;
  const w = pose?.world;
  if (!w || w.length < 25) {
    (Object.keys(fl) as BodyKey[]).forEach((k) => fl[k].reset());
    rig.body.leftUpper = rig.body.leftFore = rig.body.rightUpper = rig.body.rightFore = null;
    rig.body.chest = null;
    return;
  }
  // Camera space → stage (mirrored selfie): x → -x, y down → up, z away → toward camera = +Z.
  const S = (i: number) => new THREE.Vector3(-w[i].x, -w[i].y, -w[i].z);
  const seen = (...ids: number[]) => ids.every((i) => (w[i]?.v ?? 0) > SEEN);
  const dir = (key: BodyKey, a: number, b: number) => {
    if (!seen(a, b)) {
      fl[key].reset();
      return null;
    }
    return fl[key].filter(S(b).sub(S(a)).normalize(), dt).clone().normalize();
  };

  rig.body.rightUpper = dir('rightUpper', LM.shoulderL, LM.elbowL);
  rig.body.rightFore = dir('rightFore', LM.elbowL, LM.wristL);
  rig.body.leftUpper = dir('leftUpper', LM.shoulderR, LM.elbowR);
  rig.body.leftFore = dir('leftFore', LM.elbowR, LM.wristR);

  // Torso: shoulder line (turn + tilt) and, when the hips are in view, the spine's lean.
  if (seen(LM.shoulderL, LM.shoulderR)) {
    // The character's +X (its left, the screen's right) = the performer's right shoulder on screen.
    const right = fl.chestRight.filter(S(LM.shoulderR).sub(S(LM.shoulderL)).normalize(), dt).clone().normalize();
    let up = new THREE.Vector3(0, 1, 0);
    if (seen(LM.hipL, LM.hipR)) {
      const mid = S(LM.shoulderL).add(S(LM.shoulderR)).multiplyScalar(0.5);
      const hip = S(LM.hipL).add(S(LM.hipR)).multiplyScalar(0.5);
      up = fl.chestUp.filter(mid.sub(hip).normalize(), dt).clone().normalize();
    }
    up.sub(right.clone().multiplyScalar(up.dot(right))).normalize();
    const fwd = new THREE.Vector3().crossVectors(right, up).normalize();
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, fwd));
    // Keep it human: clamp to ±50° away from facing the camera.
    const ang = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
    if (ang > 0.87) q.slerp(new THREE.Quaternion(), 1 - 0.87 / ang);
    rig.body.chestRaw = q;
    rig.body.chest = rig.body.chestNeutral ? rig.body.chestNeutral.clone().invert().multiply(q) : q;
  } else {
    fl.chestRight.reset();
    fl.chestUp.reset();
    rig.body.chest = null;
  }
}

/** Take the performer's current torso as "facing the camera". */
export function recenterBody(rig: StageRig) {
  rig.body.chestNeutral = rig.body.chestRaw ? rig.body.chestRaw.clone() : null;
}

/**
 * Head turn from MediaPipe's facial transformation matrix (4×4 column-major), in stage terms
 * (yaw + turns toward the screen's right, pitch + nods down, roll + tilts clockwise on screen).
 * `mirrored`: the matrix came from the raw camera frame but the picture is shown as a mirror.
 */
export function headTurnFromMatrix(m: ArrayLike<number>, mirrored: boolean) {
  const e = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().fromArray(Array.from(m)), 'YXZ');
  const s = mirrored ? -1 : 1;
  return { yaw: s * e.y, pitch: e.x, roll: s * e.z };
}

const boneA = new THREE.Vector3();
const boneB = new THREE.Vector3();
const swing = new THREE.Quaternion();
const IDENTITY = new THREE.Quaternion();

/** Aim `bone` so the segment bone→child points along `target` (stage space). */
function aimBone(bone: THREE.Object3D | undefined, child: THREE.Object3D | undefined, target: THREE.Vector3 | null) {
  if (!bone?.parent || !child || !target) return;
  bone.getWorldPosition(boneA);
  child.getWorldPosition(boneB);
  const cur = boneB.sub(boneA);
  if (cur.lengthSq() < 1e-10) return;
  cur.normalize();
  swing.setFromUnitVectors(cur, target);
  rotateInStage(bone, swing);
}

/** Apply a stage-space rotation to a bone (converted into its parent's frame). */
function rotateInStage(bone: THREE.Object3D | undefined, q: THREE.Quaternion) {
  if (!bone?.parent) return;
  bone.parent.getWorldQuaternion(parentQ);
  offset.copy(q).premultiply(parentQInv.copy(parentQ).invert()).multiply(parentQ);
  bone.quaternion.premultiply(offset);
  bone.updateMatrixWorld(true);
}

function applyBody(rig: StageRig) {
  const b = rig.bones;
  const body = rig.body;
  // Torso first (the arms hang off it): half in the lower spine, half in the chest.
  if (body.chest) {
    const half = new THREE.Quaternion().slerpQuaternions(IDENTITY, body.chest, 0.5);
    rotateInStage(b.lowSpine, half);
    rotateInStage(b.chest, half);
  }
  // Upper arm first, then the forearm from the new elbow.
  aimBone(b.leftArm, b.leftForeArm, body.leftUpper);
  aimBone(b.leftForeArm, b.leftHand, body.leftFore);
  aimBone(b.rightArm, b.rightForeArm, body.rightUpper);
  aimBone(b.rightForeArm, b.rightHand, body.rightFore);
}

/** Rotate a bone by a stage-space euler (x nod toward camera, y turn, z tilt in the picture). */
function turnInStage(bone: THREE.Object3D | null | undefined, x: number, y: number, z: number) {
  if (!bone?.parent || (!x && !y && !z)) return;
  bone.parent.getWorldQuaternion(parentQ);
  offset.setFromEuler(euler.set(x, y, z));
  offset.premultiply(parentQInv.copy(parentQ).invert()).multiply(parentQ);
  bone.quaternion.premultiply(offset);
  bone.updateMatrixWorld(true);
}

function applyEmote(rig: StageRig) {
  const e = rig.emote;
  if (!e) return;
  const t = rig.time - e.start;
  if (t >= EMOTE_SECONDS) {
    e.action?.fadeOut(0.3);
    rig.idleAction?.reset().fadeIn(0.3).play();
    rig.emote = null;
    return;
  }
  if (e.action) return; // the game clip is doing the work
  // Ease in over 0.35 s, hold, ease out over the last 0.45 s.
  const env = Math.min(1, t / 0.35, (EMOTE_SECONDS - t) / 0.45);
  const k = env * env * (3 - 2 * env);
  const b = rig.bones;
  // The character faces +Z, so its right arm hangs on the -X side; raising it outward is -Z tilt.
  switch (e.id) {
    case 'wave':
      turnInStage(b.rightArm, 0, 0, -2.3 * k);
      turnInStage(b.rightForeArm, 0, 0, (-0.3 + 0.45 * Math.sin(t * 9)) * k);
      turnInStage(rig.head, 0, 0, 0.12 * k);
      break;
    case 'cheer': {
      const pump = 0.25 * Math.sin(t * 7);
      turnInStage(b.rightArm, 0, 0, (-2.5 + pump) * k);
      turnInStage(b.leftArm, 0, 0, (2.5 - pump) * k);
      turnInStage(rig.head, -0.2 * k, 0, 0);
      break;
    }
    case 'nod':
      turnInStage(rig.head, 0.32 * Math.max(0, Math.sin(t * 6)) * k, 0, 0);
      break;
    case 'bow':
      turnInStage(b.spine, 0.75 * k, 0, 0);
      turnInStage(rig.head, 0.3 * k, 0, 0);
      break;
    case 'shrug':
      turnInStage(b.rightArm, 0, 0, -0.45 * k);
      turnInStage(b.leftArm, 0, 0, 0.45 * k);
      turnInStage(b.rightForeArm, 0, 0, -0.9 * k);
      turnInStage(b.leftForeArm, 0, 0, 0.9 * k);
      turnInStage(rig.head, 0, 0, 0.22 * k);
      break;
    // Fallbacks for models without the matching game clip (e.g. Jack's bind-pose-only GLB).
    case 'strike': {
      const jab = Math.max(0, Math.sin(Math.min(1, t / 0.9) * Math.PI));
      turnInStage(b.rightArm, -1.4 * jab * k, 0, -0.3 * k);
      turnInStage(b.spine, 0, -0.35 * jab * k, 0);
      break;
    }
    case 'flinch':
      turnInStage(b.spine, -0.3 * k, 0, 0);
      turnInStage(b.rightArm, -0.9 * k, 0, -0.6 * k);
      turnInStage(b.leftArm, -0.9 * k, 0, 0.6 * k);
      turnInStage(rig.head, -0.25 * k, 0, 0);
      break;
    case 'menace': {
      const claw = 0.15 * Math.sin(t * 5);
      turnInStage(b.rightArm, (-1.2 + claw) * k, 0, -0.5 * k);
      turnInStage(b.leftArm, (-1.2 - claw) * k, 0, 0.5 * k);
      turnInStage(b.spine, 0.25 * k, 0, 0);
      break;
    }
  }
}
