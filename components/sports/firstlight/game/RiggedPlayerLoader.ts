/**
 * RiggedPlayerLoader.ts — Runtime loader, dynamic SOL uniform painter, and
 * Plajah Motion Studio skeletal player for Character Forge football GLBs
 * (`public/firstlight/assets/characters/{qb,skill,power,lineman}.glb`).
 *
 * All 4 archetypes carry Plajah's 58-joint contract humanoid skeleton
 * (Hips, Spine, Spine1, Spine2, Neck, Head, Left/RightShoulder..Hand + fingers,
 * Left/RightUpLeg..ToeBase), making them directly compatible with:
 * - Plajah Motion Studio `MotionClip` JSON (`format: 'plajah.motion'`, v1)
 * - BVH / FBX clips retargeted via `services/mocap/retarget.ts`
 * - Real-time athletic football state posing until custom Motion Studio takes are bound
 */

import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import type { MotionClip } from '../../../../services/mocap/types';
import type { Player3D, TeamInfo } from '../types';

export type FootballArchetype = 'qb' | 'skill' | 'power' | 'lineman';

export type FootballMotionState =
  | 'STANCE'
  | 'DROPBACK'
  | 'THROWING'
  | 'RUNNING'
  | 'CATCHING'
  | 'BLOCKING'
  | 'PASS_RUSH'
  | 'TACKLED'
  | 'SPIN'
  | 'TRUCK'
  | 'DIVE'
  | 'KICKING'
  | 'CELEBRATING';

export interface RiggedFootballInstance {
  archetype: FootballArchetype;
  modelRoot: THREE.Object3D;
  bones: Record<string, THREE.Bone>;
  restPos: Record<string, THREE.Vector3>;
  restQuat: Record<string, THREE.Quaternion>;
  rightHandSocket: THREE.Object3D | null;
  leftHandSocket: THREE.Object3D | null;
  mixer: THREE.AnimationMixer;
  activeClipState: FootballMotionState | null;
  activeAction: THREE.AnimationAction | null;
  lastState: string;
  stateTime: number;
  ownedTextures: THREE.Texture[];
  ownedMaterials: THREE.Material[];
}

const ARCHETYPE_URLS: Record<FootballArchetype, string> = {
  qb: '/firstlight/assets/characters/qb.glb',
  skill: '/firstlight/assets/characters/skill.glb',
  power: '/firstlight/assets/characters/power.glb',
  lineman: '/firstlight/assets/characters/lineman.glb',
};

const METERS_TO_YARDS = 1.0936; // 1 meter = 1.0936 yards (exact yard-scale NFL proportions)
const SKIN_TONES = ['#d6a581', '#b47d58', '#734d36', '#c58f6a', '#533829', '#e0b392'];

// Global asset cache + custom Plajah Motion Studio clip registry
const loadedGltfs = new Map<FootballArchetype, GLTF>();
let preloadPromise: Promise<void> | null = null;
const registeredMotionClips = new Map<FootballMotionState, THREE.AnimationClip>();

export function pickArchetypeForRole(role: Player3D['role']): FootballArchetype {
  if (role === 'QB') return 'qb';
  if (role === 'OL' || role === 'DL') return 'lineman';
  if (role === 'LB' || role === 'TE') return 'power';
  return 'skill';
}

export function areRiggedCharactersReady(): boolean {
  return (
    loadedGltfs.has('qb') &&
    loadedGltfs.has('skill') &&
    loadedGltfs.has('power') &&
    loadedGltfs.has('lineman')
  );
}

/** Preloads all 4 Plajah Character Forge rigged football GLBs in parallel. */
export function preloadRiggedFootballCharacters(): Promise<void> {
  if (areRiggedCharactersReady()) return Promise.resolve();
  if (preloadPromise) return preloadPromise;

  const loader = new GLTFLoader();
  preloadPromise = Promise.all(
    (Object.keys(ARCHETYPE_URLS) as FootballArchetype[]).map(
      (arch) =>
        new Promise<void>((resolve) => {
          loader.load(
            ARCHETYPE_URLS[arch],
            (gltf) => {
              loadedGltfs.set(arch, gltf);
              resolve();
            },
            undefined,
            (err) => {
              console.warn(`[Firstlight Rig] Failed to load ${ARCHETYPE_URLS[arch]}:`, err);
              resolve();
            }
          );
        })
    )
  ).then(() => undefined);

  return preloadPromise;
}

/**
 * Converts a Plajah Motion Studio `MotionClip` (`format: 'plajah.motion'`, v1)
 * directly into a Three.js `AnimationClip` targeting our 58-joint contract skeleton.
 */
export function motionStudioClipToThree(
  clip: MotionClip,
  clipName: string = clip.name
): THREE.AnimationClip {
  const frames = Math.max(1, clip.frames);
  const fps = Math.max(1, clip.fps || 30);
  const times = new Float32Array(frames);
  for (let f = 0; f < frames; f++) times[f] = f / fps;

  const joints = clip.skeleton.joints;
  const jCount = joints.length;
  const tracks: THREE.KeyframeTrack[] = [];

  for (let j = 0; j < jCount; j++) {
    const jName = joints[j].name;
    const values = new Float32Array(frames * 4);
    for (let f = 0; f < frames; f++) {
      const base = (f * jCount + j) * 4;
      values[f * 4] = clip.rot[base] ?? 0;
      values[f * 4 + 1] = clip.rot[base + 1] ?? 0;
      values[f * 4 + 2] = clip.rot[base + 2] ?? 0;
      values[f * 4 + 3] = clip.rot[base + 3] ?? 1;
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${jName}.quaternion`, times, values));
  }

  // Keep vertical hip bob (in-place locomotion so FootballEngine controls field x/z)
  if (clip.root && clip.root.length >= frames * 3) {
    const hipY0 = clip.root[1] || 0.985;
    const hipPos = new Float32Array(frames * 3);
    for (let f = 0; f < frames; f++) {
      hipPos[f * 3] = 0;
      hipPos[f * 3 + 1] = clip.root[f * 3 + 1] ?? hipY0;
      hipPos[f * 3 + 2] = 0;
    }
    tracks.push(new THREE.VectorKeyframeTrack('Hips.position', times, hipPos));
  }

  return new THREE.AnimationClip(clipName, (frames - 1) / fps, tracks);
}

/** Registers a Plajah Motion Studio `MotionClip` (or pre-retargeted Three.js clip) for any football state. */
export function registerMotionStudioClip(
  state: FootballMotionState,
  clip: MotionClip | THREE.AnimationClip
): void {
  const threeClip =
    clip instanceof THREE.AnimationClip
      ? clip
      : motionStudioClipToThree(clip, state);
  registeredMotionClips.set(state, threeClip);
}

/** Loads a Plajah Motion Studio `.json` capture file from URL and binds it to a football state. */
export async function loadMotionStudioClipFromUrl(
  state: FootballMotionState,
  url: string
): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const data = (await res.json()) as MotionClip;
    if (data && data.format === 'plajah.motion') {
      registerMotionStudioClip(state, data);
      return true;
    }
    return false;
  } catch (err) {
    console.warn(`[Firstlight Motion Studio] Failed to load clip from ${url}:`, err);
    return false;
  }
}

export function getRegisteredMotionStates(): FootballMotionState[] {
  return Array.from(registeredMotionClips.keys());
}

/**
 * Generates a razor-sharp 1024×512 Pro Game Jersey texture matching the planar
 * front (left half 0..512) / back (right half 512..1024) UV atlas built in footballWardrobe.ts.
 */
function createProJerseyAtlas(player: Player3D, team: TeamInfo): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const primary = team.primaryColor || '#1b305c';
  const secondary = team.secondaryColor || '#e2e8f0';
  const accent = team.accentColor || '#fbbf24';
  const isLightJersey =
    primary.toLowerCase() === '#f8fafc' ||
    primary.toLowerCase() === '#ffffff' ||
    primary.toLowerCase() === '#f1f5f9' ||
    primary.toLowerCase() === '#fafaf9';
  const numFill = isLightJersey ? secondary : '#ffffff';
  const numStroke = isLightJersey ? '#0f172a' : secondary;

  // Base breathable jersey cloth fill
  ctx.fillStyle = primary;
  ctx.fillRect(0, 0, 1024, 512);

  // Subtle athletic micro-mesh pinhole texture
  ctx.fillStyle = isLightJersey ? 'rgba(15, 23, 42, 0.055)' : 'rgba(255, 255, 255, 0.055)';
  for (let y = 6; y < 512; y += 8) {
    for (let x = (y % 16 === 0 ? 4 : 0); x < 1024; x += 8) {
      ctx.fillRect(x, y, 2, 2);
    }
  }

  // Subtle vertical jersey seam panel lines
  ctx.strokeStyle = isLightJersey ? 'rgba(15, 23, 42, 0.14)' : 'rgba(0, 0, 0, 0.25)';
  ctx.lineWidth = 4;
  for (const sx of [90, 422, 602, 934]) {
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, 512);
    ctx.stroke();
  }

  // Upper shoulder stripe bands along top edge
  ctx.fillStyle = secondary;
  ctx.fillRect(0, 0, 1024, 28);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 28, 1024, 8);

  const numStr = `${player.number}`;

  // --- LEFT HALF (0..512): FRONT CHEST ---
  // Collar SOL Shield crest
  ctx.fillStyle = secondary;
  ctx.fillRect(236, 48, 40, 22);
  ctx.fillStyle = '#0f172a';
  ctx.font = '900 13px "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SOL', 256, 59);

  // Team City/Abbr chest wordmark
  ctx.fillStyle = numFill;
  ctx.font = '900 22px "Arial Black", sans-serif';
  ctx.fillText((team.name || team.abbr || 'SOL').toUpperCase().slice(0, 10), 256, 98);

  // Front Block Athletic Number
  ctx.font = '900 218px "Impact", "Arial Black", sans-serif';
  ctx.lineWidth = 14;
  ctx.strokeStyle = numStroke;
  ctx.lineJoin = 'round';
  ctx.strokeText(numStr, 256, 268);
  ctx.fillStyle = numFill;
  ctx.fillText(numStr, 256, 268);

  // --- RIGHT HALF (512..1024): BACK NAMEPLATE & NUMBER ---
  const lastName = (player.name || 'PLAYER')
    .replace(/^[A-Z]\.\s*/, '')
    .replace(/\s*#\d+$/, '')
    .toUpperCase()
    .slice(0, 11);

  // Stitched Nameplate bar
  ctx.fillStyle = isLightJersey ? 'rgba(15, 23, 42, 0.08)' : 'rgba(0, 0, 0, 0.24)';
  ctx.fillRect(622, 62, 292, 54);
  ctx.fillStyle = numFill;
  ctx.font = '900 36px "Arial Black", sans-serif';
  ctx.fillText(lastName, 768, 91);

  // Back Block Athletic Number
  ctx.font = '900 232px "Impact", "Arial Black", sans-serif';
  ctx.lineWidth = 15;
  ctx.strokeStyle = numStroke;
  ctx.strokeText(numStr, 768, 282);
  ctx.fillStyle = numFill;
  ctx.fillText(numStr, 768, 282);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Instantiates a cloned, skinned Plajah Character Forge player dressed in the
 * given SOL team kit & player number, ready for Motion Studio or live animation.
 */
export function instantiateRiggedFootballPlayer(
  player: Player3D,
  team: TeamInfo
): RiggedFootballInstance | null {
  const archetype = pickArchetypeForRole(player.role);
  const gltf = loadedGltfs.get(archetype);
  if (!gltf) return null;

  const modelRoot = SkeletonUtils.clone(gltf.scene);
  modelRoot.scale.setScalar(METERS_TO_YARDS);

  const bones: Record<string, THREE.Bone> = {};
  const restPos: Record<string, THREE.Vector3> = {};
  const restQuat: Record<string, THREE.Quaternion> = {};
  let rightHandSocket: THREE.Object3D | null = null;
  let leftHandSocket: THREE.Object3D | null = null;

  const primary = team.primaryColor || '#1b305c';
  const secondary = team.secondaryColor || '#e2e8f0';
  const accent = team.accentColor || '#fbbf24';
  const helmetCol = team.helmetColor || primary;
  const visorCol = team.visorColor || '#0ea5e9';
  const isAwayLight =
    primary.toLowerCase() === '#f8fafc' ||
    primary.toLowerCase() === '#ffffff' ||
    primary.toLowerCase() === '#f1f5f9' ||
    primary.toLowerCase() === '#fafaf9';

  const pantsCol = isAwayLight ? secondary : '#f1f5f9';
  const pantsStripeCol = isAwayLight ? '#ffffff' : primary;
  const skinTone = SKIN_TONES[player.number % SKIN_TONES.length];

  const jerseyAtlas = createProJerseyAtlas(player, team);
  const ownedTextures: THREE.Texture[] = [jerseyAtlas];
  const ownedMaterials: THREE.Material[] = [];

  // Re-skin every semantic material slot cleanly with cloned MeshPhysical/Standard materials
  const matCache = new Map<string, THREE.Material>();
  const getTeamMat = (srcName: string, srcMat: THREE.Material): THREE.Material => {
    const key = srcName.toLowerCase();
    const cached = matCache.get(key);
    if (cached) return cached;

    const cloned = srcMat.clone();
    const std = cloned as THREE.MeshPhysicalMaterial;

    switch (key) {
      case 'skin':
        std.color.set(skinTone);
        std.roughness = 0.64;
        std.metalness = 0.0;
        break;
      case 'jersey':
        std.color.set('#ffffff');
        std.map = jerseyAtlas;
        std.roughness = 0.74;
        std.metalness = 0.04;
        std.needsUpdate = true;
        break;
      case 'jerseystripe':
        std.color.set(isAwayLight ? secondary : '#f8fafc');
        std.roughness = 0.52;
        break;
      case 'pants':
        std.color.set(pantsCol);
        std.roughness = 0.56;
        std.metalness = 0.04;
        break;
      case 'pantsstripe':
        std.color.set(pantsStripeCol);
        std.roughness = 0.5;
        break;
      case 'belt':
        std.color.set('#111827');
        std.roughness = 0.42;
        break;
      case 'socks':
        std.color.set(isAwayLight ? secondary : primary);
        std.roughness = 0.84;
        break;
      case 'tape':
        std.color.set('#f8fafc');
        std.roughness = 0.88;
        break;
      case 'gloves':
        std.color.set(isAwayLight ? secondary : primary);
        std.roughness = 0.4;
        std.metalness = 0.08;
        break;
      case 'cleats':
        std.color.set(isAwayLight ? secondary : primary);
        std.roughness = 0.36;
        std.metalness = 0.16;
        break;
      case 'cleatsole':
        std.color.set(accent);
        std.roughness = 0.28;
        std.metalness = 0.38;
        break;
      case 'accessory':
        std.color.set(archetype === 'lineman' ? '#111827' : isAwayLight ? secondary : primary);
        std.roughness = 0.65;
        break;
      case 'towel':
        std.color.set('#f8fafc');
        std.roughness = 0.92;
        break;
      case 'helmetshell':
        std.color.set(helmetCol);
        std.roughness = 0.16;
        std.metalness = 0.46;
        if ('clearcoat' in std) {
          std.clearcoat = 0.92;
          std.clearcoatRoughness = 0.08;
        }
        break;
      case 'helmetstripe':
        std.color.set(secondary);
        std.roughness = 0.18;
        std.metalness = 0.52;
        break;
      case 'facemask':
        std.color.set(isAwayLight ? '#cbd5e1' : '#334155');
        std.roughness = 0.24;
        std.metalness = 0.84;
        break;
      case 'visor':
        std.color.set(visorCol);
        std.roughness = 0.08;
        std.metalness = 0.78;
        std.transparent = true;
        std.opacity = 0.72;
        break;
      case 'chinstrap':
        std.color.set('#f8fafc');
        std.roughness = 0.45;
        break;
    }

    matCache.set(key, cloned);
    ownedMaterials.push(cloned);
    return cloned;
  };

  modelRoot.traverse((obj) => {
    if ((obj as THREE.Bone).isBone) {
      const b = obj as THREE.Bone;
      const cleanName = b.name.replace(/_\d+$/, '');
      bones[cleanName] = b;
      restPos[cleanName] = b.position.clone();
      restQuat[cleanName] = b.quaternion.clone();
    }
    if (obj.name === 'socket_hand_R') rightHandSocket = obj;
    if (obj.name === 'socket_hand_L') leftHandSocket = obj;

    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false; // Skinned bounding boxes stay visible during dynamic movement
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((m) => getTeamMat(m.name || '', m));
      } else if (mesh.material) {
        mesh.material = getTeamMat(mesh.material.name || '', mesh.material);
      }
    }
  });

  const mixer = new THREE.AnimationMixer(modelRoot);

  return {
    archetype,
    modelRoot,
    bones,
    restPos,
    restQuat,
    rightHandSocket,
    leftHandSocket,
    mixer,
    activeClipState: null,
    activeAction: null,
    lastState: '',
    stateTime: 0,
    ownedTextures,
    ownedMaterials,
  };
}

export function disposeRiggedInstance(inst: RiggedFootballInstance): void {
  inst.mixer.stopAllAction();
  inst.ownedTextures.forEach((t) => t.dispose());
  inst.ownedMaterials.forEach((m) => m.dispose());
}

/** Returns world-space position of the rigged player's right hand socket (for attaching the football). */
export function getRiggedHandWorldPosition(
  inst: RiggedFootballInstance,
  out: THREE.Vector3 = new THREE.Vector3()
): THREE.Vector3 {
  const anchor = inst.rightHandSocket || inst.bones.RightHand;
  if (anchor) {
    anchor.getWorldPosition(out);
    return out;
  }
  inst.modelRoot.getWorldPosition(out);
  out.y += 1.45;
  return out;
}

// Reusable scratch math objects (zero per-frame GC pressure)
const _euler = new THREE.Euler(0, 0, 0, 'XYZ');
const _targetQ = new THREE.Quaternion();

function poseBone(
  inst: RiggedFootballInstance,
  name: string,
  rx: number,
  ry: number,
  rz: number,
  blend: number
): void {
  const b = inst.bones[name];
  if (!b) return;
  _euler.set(rx, ry, rz, 'XYZ');
  _targetQ.setFromEuler(_euler);
  b.quaternion.slerp(_targetQ, blend);
}

function resetHipY(inst: RiggedFootballInstance, dy: number, blend: number): void {
  const hips = inst.bones.Hips;
  const base = inst.restPos.Hips;
  if (!hips || !base) return;
  hips.position.y += (base.y + dy - hips.position.y) * blend;
}

/**
 * Updates a rigged Character Forge football player each frame.
 * 1. If a Plajah Motion Studio clip is registered for the active state, plays it via AnimationMixer.
 * 2. Otherwise drives responsive athletic skeletal poses across all contract joints so every
 *    position (QB dropback/throw, WR sprint/catch, OL/DL 3-point stance & blocking, spin/truck/dive/kick)
 *    looks sharp immediately and blends seamlessly into Motion Studio captures.
 */
export function updateRiggedFootballPlayer(
  inst: RiggedFootballInstance,
  player: Player3D,
  animTime: number,
  dt: number
): void {
  const stateKey = (
    player.moveAction && (player.moveTimer ?? 0) > 0 ? player.moveAction : player.state
  ) as FootballMotionState;

  if (inst.lastState !== stateKey) {
    inst.lastState = stateKey;
    inst.stateTime = 0;

    // Check if a Plajah Motion Studio clip is bound to this state!
    const customClip = registeredMotionClips.get(stateKey);
    if (customClip) {
      if (inst.activeAction) inst.activeAction.fadeOut(0.14);
      const act = inst.mixer.clipAction(customClip);
      act.reset().fadeIn(0.14).play();
      inst.activeAction = act;
      inst.activeClipState = stateKey;
    } else if (inst.activeAction) {
      inst.activeAction.fadeOut(0.14);
      inst.activeAction = null;
      inst.activeClipState = null;
    }
  }
  inst.stateTime += dt;

  // If driven by a bound Plajah Motion Studio capture clip, step the mixer and return
  if (inst.activeAction && inst.activeClipState === stateKey) {
    inst.mixer.update(dt);
    return;
  }

  const blend = Math.min(1, dt * 15);
  const t = animTime;
  const speed = Math.hypot(player.vx ?? 0, player.vz ?? 0);
  const isTrench = player.role === 'OL' || player.role === 'DL';

  // Neutral baseline: lower arms naturally out of A-pose (LeftArm Z-, RightArm Z+)
  let hipDy = 0;
  let hipRx = 0, hipRy = 0, hipRz = 0;
  let spRx = 0.08, spRy = 0;
  let headRx = -0.06, headRy = 0;
  let lArmX = -0.1, lArmY = 0, lArmZ = -0.55;
  let rArmX = -0.1, rArmY = 0, rArmZ = 0.55;
  let lForeX = -0.45, rForeX = -0.45;
  let lThighX = -0.08, rThighX = -0.08;
  let lKneeX = 0.16, rKneeX = 0.16;
  let lFootX = -0.08, rFootX = -0.08;

  if (stateKey === 'STANCE') {
    const breath = Math.sin(t * 2.6 + player.number) * 0.012;
    if (isTrench) {
      // Low 3-point lineman trench stance
      hipDy = -0.26 + breath;
      hipRx = 0.52;
      spRx = 0.28;
      headRx = -0.58;
      lArmX = -0.95; lArmZ = -0.45; lForeX = -0.35;
      rArmX = -1.15; rArmZ = 0.42; rForeX = -0.15;
      lThighX = -0.82; lKneeX = 1.15; lFootX = -0.32;
      rThighX = -0.42; rKneeX = 0.72; rFootX = -0.28;
    } else if (player.role === 'QB') {
      // Shotgun QB ready crouch with hands open for snap
      hipDy = -0.14 + breath;
      hipRx = 0.22;
      spRx = 0.14;
      headRx = -0.26;
      lArmX = -0.68; lArmY = 0.25; lArmZ = -0.42; lForeX = -0.85;
      rArmX = -0.68; rArmY = -0.25; rArmZ = 0.42; rForeX = -0.85;
      lThighX = -0.42; lKneeX = 0.72; lFootX = -0.24;
      rThighX = -0.38; rKneeX = 0.68; rFootX = -0.22;
    } else {
      // WR / DB / LB athletic split stance
      hipDy = -0.16 + breath;
      hipRx = 0.30;
      spRx = 0.18;
      headRx = -0.36;
      lArmX = -0.48; lArmZ = -0.48; lForeX = -0.78;
      rArmX = -0.25; rArmZ = 0.48; rForeX = -0.68;
      lThighX = -0.58; lKneeX = 0.86; lFootX = -0.26;
      rThighX = -0.24; rKneeX = 0.48; rFootX = -0.20;
    }
  } else if (stateKey === 'DROPBACK') {
    const step = Math.sin(t * 11.5);
    hipDy = -0.11 + Math.abs(step) * 0.035;
    hipRx = 0.14;
    hipRy = -0.38; // QB opens throwing shoulder back
    spRx = 0.08;
    spRy = -0.22;
    headRx = -0.14;
    headRy = 0.52; // Eyes locked straight downfield
    // Ball held high & tight by right ear/chest
    rArmX = -0.82; rArmY = -0.32; rArmZ = 0.22; rForeX = -1.45;
    lArmX = -0.68; lArmY = 0.42; lArmZ = -0.38; lForeX = -1.25;
    lThighX = -0.32 + step * 0.42; lKneeX = 0.55 + Math.max(0, -step) * 0.4;
    rThighX = -0.32 - step * 0.42; rKneeX = 0.55 + Math.max(0, step) * 0.4;
  } else if (stateKey === 'THROWING') {
    const p = Math.min(1, inst.stateTime / 0.42);
    const windup = p < 0.38 ? p / 0.38 : 1 - (p - 0.38) / 0.62;
    const follow = Math.max(0, (p - 0.38) / 0.62);
    hipDy = -0.10;
    hipRx = 0.18 + follow * 0.14;
    hipRy = -0.62 * windup + 0.58 * follow;
    spRy = -0.45 * windup + 0.52 * follow;
    headRy = -hipRy * 0.7;
    // Authentic over-the-top QB throwing arc
    rArmX = -2.25 * windup - 1.25 * follow;
    rArmZ = -0.45 * windup + 0.35 * follow;
    rForeX = -1.35 * windup - 0.25 * follow;
    lArmX = -0.75 * windup + 0.25 * follow;
    lArmZ = -0.35;
    lForeX = -0.95;
    lThighX = -0.48; lKneeX = 0.52;
    rThighX = 0.22; rKneeX = 0.42;
  } else if (stateKey === 'RUNNING') {
    const cadence = Math.max(7.5, Math.min(16.5, speed * 1.48));
    const phase = t * cadence + player.number * 0.7;
    const s = Math.sin(phase);
    const c = Math.cos(phase);
    const strideAmp = Math.min(1.0, Math.max(0.45, speed / 8.5));

    hipDy = -0.09 + Math.abs(c) * 0.065 * strideAmp;
    hipRx = 0.22 + strideAmp * 0.12;
    hipRy = s * 0.16 * strideAmp;
    spRx = 0.16 * strideAmp;
    spRy = -s * 0.20 * strideAmp;
    headRx = -(hipRx + spRx) * 0.72;

    // Powerful football stride legs
    lThighX = -0.16 - s * 0.88 * strideAmp;
    rThighX = -0.16 + s * 0.88 * strideAmp;
    lKneeX = 0.22 + Math.max(0, c * 0.95 + 0.35) * strideAmp;
    rKneeX = 0.22 + Math.max(0, -c * 0.95 + 0.35) * strideAmp;
    lFootX = s * 0.32 * strideAmp;
    rFootX = -s * 0.32 * strideAmp;

    // Pumping runner arms (tuck right arm tightly when carrying the football!)
    lArmX = -0.15 + s * 0.82 * strideAmp;
    lArmZ = -0.58;
    lForeX = -1.25;
    if (player.hasBall) {
      rArmX = -0.58;
      rArmY = -0.35;
      rArmZ = 0.48;
      rForeX = -1.65;
    } else {
      rArmX = -0.15 - s * 0.82 * strideAmp;
      rArmZ = 0.58;
      rForeX = -1.25;
    }
  } else if (stateKey === 'CATCHING') {
    hipDy = 0.14;
    hipRx = 0.12;
    spRx = -0.10;
    headRx = -0.22;
    // Both arms extended high & forward forming a diamond catch window
    lArmX = -2.15; lArmY = 0.28; lArmZ = -0.22; lForeX = -0.32;
    rArmX = -2.15; rArmY = -0.28; rArmZ = 0.22; rForeX = -0.32;
    lThighX = -0.38; lKneeX = 0.65;
    rThighX = -0.22; rKneeX = 0.45;
  } else if (stateKey === 'BLOCKING' || stateKey === 'PASS_RUSH') {
    const punch = Math.sin(t * 14 + player.number) * 0.16;
    hipDy = -0.22;
    hipRx = 0.40;
    spRx = 0.22;
    headRx = -0.45;
    // Violent hand-fighting punch in the trenches
    lArmX = -1.35 + punch; lArmY = 0.18; lArmZ = -0.32; lForeX = -0.55 - punch;
    rArmX = -1.35 - punch; rArmY = -0.18; rArmZ = 0.32; rForeX = -0.55 + punch;
    lThighX = -0.62 + punch * 0.8; lKneeX = 0.95;
    rThighX = -0.52 - punch * 0.8; rKneeX = 0.85;
  } else if (stateKey === 'TRUCK') {
    hipDy = -0.22;
    hipRx = 0.62;
    spRx = 0.35;
    headRx = -0.48;
    rArmX = -0.75; rArmZ = 0.42; rForeX = -1.65;
    lArmX = -1.15; lArmZ = -0.35; lForeX = -0.45;
    lThighX = -0.72; lKneeX = 0.95;
    rThighX = 0.25; rKneeX = 0.55;
  } else if (stateKey === 'SPIN') {
    hipDy = -0.14;
    hipRx = 0.25;
    hipRy = inst.stateTime * 15;
    rArmX = -0.62; rArmZ = 0.42; rForeX = -1.6;
    lArmX = -0.45; lArmZ = -0.25; lForeX = -1.0;
    lThighX = -0.45; lKneeX = 0.72;
    rThighX = -0.25; rKneeX = 0.55;
  } else if (stateKey === 'DIVE') {
    hipDy = -0.52;
    hipRx = 1.25;
    spRx = 0.18;
    headRx = -0.45;
    lArmX = -2.35; lArmZ = -0.25; lForeX = -0.15;
    rArmX = -2.35; rArmZ = 0.25; rForeX = -0.15;
    lThighX = 0.22; lKneeX = 0.32;
    rThighX = 0.18; rKneeX = 0.28;
  } else if (stateKey === 'KICKING') {
    const kPhase = Math.min(1, inst.stateTime / 0.38);
    hipDy = -0.06;
    hipRx = -0.15 * kPhase;
    spRy = -0.28 * kPhase;
    rThighX = 0.65 * (1 - kPhase) - 1.55 * kPhase;
    rKneeX = 0.95 * (1 - kPhase) + 0.10 * kPhase;
    lThighX = -0.12; lKneeX = 0.18;
    lArmX = -0.45; lArmZ = -0.15; lForeX = -0.35;
    rArmX = 0.25; rArmZ = 0.35; rForeX = -0.45;
  } else if (stateKey === 'TACKLED') {
    hipDy = -0.78;
    hipRx = 1.48;
    hipRz = 0.22;
    lArmX = -0.85; lArmZ = -0.2; lForeX = -0.8;
    rArmX = -0.85; rArmZ = 0.2; rForeX = -0.8;
    lThighX = -0.22; lKneeX = 0.62;
    rThighX = 0.12; rKneeX = 0.45;
  } else if (stateKey === 'CELEBRATING') {
    const bounce = Math.abs(Math.sin(t * 7.5));
    hipDy = bounce * 0.24;
    hipRx = -0.08;
    spRx = -0.12;
    headRx = -0.22;
    lArmX = -2.65; lArmZ = 0.35; lForeX = -0.25;
    rArmX = -2.65; rArmZ = -0.35; rForeX = -0.25;
    lThighX = -0.25 * bounce; lKneeX = 0.45 * bounce;
    rThighX = -0.25 * bounce; rKneeX = 0.45 * bounce;
  }

  // Apply blended skeletal transforms onto the 58-joint contract rig
  resetHipY(inst, hipDy, blend);
  poseBone(inst, 'Hips', hipRx, hipRy, hipRz, blend);
  poseBone(inst, 'Spine', spRx * 0.35, spRy * 0.35, 0, blend);
  poseBone(inst, 'Spine1', spRx * 0.35, spRy * 0.35, 0, blend);
  poseBone(inst, 'Spine2', spRx * 0.30, spRy * 0.30, 0, blend);
  poseBone(inst, 'Neck', headRx * 0.45, headRy * 0.45, 0, blend);
  poseBone(inst, 'Head', headRx * 0.55, headRy * 0.55, 0, blend);

  poseBone(inst, 'LeftArm', lArmX, lArmY, lArmZ, blend);
  poseBone(inst, 'LeftForeArm', lForeX, 0, 0, blend);
  poseBone(inst, 'RightArm', rArmX, rArmY, rArmZ, blend);
  poseBone(inst, 'RightForeArm', rForeX, 0, 0, blend);

  poseBone(inst, 'LeftUpLeg', lThighX, 0, 0, blend);
  poseBone(inst, 'LeftLeg', lKneeX, 0, 0, blend);
  poseBone(inst, 'LeftFoot', lFootX, 0, 0, blend);
  poseBone(inst, 'RightUpLeg', rThighX, 0, 0, blend);
  poseBone(inst, 'RightLeg', rKneeX, 0, 0, blend);
  poseBone(inst, 'RightFoot', rFootX, 0, 0, blend);
}
