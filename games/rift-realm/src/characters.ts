// Rigged characters (Void Stalker = player, Robot Paladin = enemy) built from the concept turnarounds.
//
// ── Contract for the combat track (track 2 → track 3) ────────────────────────────────────────────────────────
// Rig: Y-up, faces +Z, feet at y = 0, ~2 m tall (CharacterRig scales to the height you pass). The Character Forge's
// human skeleton (58 joints; scripts/eraclash3d/forgeRigMesh.ts → services/argilla/creature/meshRig.ts): Hips, Spine,
// Spine1, Spine2, Neck, Head, Left/RightEye, Left/Right Shoulder/Arm/ForeArm/Hand, Left/Right UpLeg/Leg/Foot/ToeBase;
// twist joints Left/Right ArmTwist and ForeArmTwist; fingers Left/RightHand{Thumb,Index,Middle,Ring,Pinky}{1,2,3}.
// The Forge runtime (playkit/character/forgeRig.ts) runs after the mixer: twist drivers and hand grips (clips never
// key fingers or twists). Grips: rig.grip('Right', 'dagger' | 'fist' | 'relaxed' | 'katana').
// Sockets (plain nodes; attach weapon meshes with rig.socket(name)?.add(mesh)): hand_r_weapon, hand_l_weapon
// (palm centre; +Z along the fingers = blade/barrel forward, +Y toward the thumb) and back_weapon (on the back at
// Spine2; +Z down the spine, +Y out of the back).
//
// Clips (all from the characters' own motion videos, clips/<id>.json; its `source` names the video + seconds,
// `rootMotion` the travel {dx, dz, speed} the game should apply — clips play in place):
//   Void Stalker
//     locomotion  idle, combat_idle (video); walk, walk_back, run, run_back, sprint (CMU gait cycles; blended by
//                 update(), each played at ground speed ÷ its own speed)
//     movement    jump, land (hard), land_soft, rise, dash, dodge_back, wing_hover (+ the CMU moves below)
//     guns        aim_idle (= rifle_aim, CMU gun hold), shoot, pistol_aim, pistol_shoot, throw, draw
//                 (upper-body masked copies play over the legs while moving: see UPPER)
//     melee       light_1 → light_2 → light_3 (light chain), heavy_1 → heavy_2 → heavy_3 (heavy chain, 3 = launcher),
//                 attack_1 / attack_2 / attack_3 (the original F-strike / flourish / spin-arc names), block
//     finishers   finisher (dive ground slam), finisher_2 (blade plunge)
//   Robot Paladin  idle, walk, run, attack_1..3, block, aim_idle, rifle_aim, shoot, recover
//   Both, from the CMU motion-capture library (no video shows them; `source` names the take): strafe_left,
//     strafe_right, dodge_left, dodge_right (side-step at a run), vault, dive_roll, slide (a duck-under run), draw
//     (pulling a gun), death (a flip into a fall), get_up.
//   Guns, reloads, hits, deaths, slide/vault/roll come from Kenne's mocap body footage (2026-11-21): reload,
//   reload_pistol, switch_weapon, rifle_fire, knockdown, crouch_walk, run_rifle are new. Check rig.has(name) first.
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { getKTX2 } from './textures';
import { forgeRig, type ForgeRig } from '../../../playkit/character/forgeRig';
import { buildSecondary, windAt } from './secondary';
import type { SoftRegions } from '../../../playkit/character/softRegions';
import type { BatWings } from '../../../playkit/character/batWings';

const BASE = '/games/rift-realm/assets/characters/';

/** Travel of a clip in its own frame (+Z forward), m; speed in m/s (from the solve; clips play in place). */
export interface RootMotion { dx: number; dy: number; dz: number; speed: number; durationSec: number }
export interface CharacterAsset {
  scene: THREE.Object3D; clips: THREE.AnimationClip[];
  rootMotion?: Record<string, RootMotion>;
  source?: Record<string, { video: string; from: number; to: number; note: string }>;
}
export const assets: { stalker: CharacterAsset | null; paladin: CharacterAsset | null } = { stalker: null, paladin: null };

async function load(file: string): Promise<CharacterAsset | null> {
  try {
    const loader = new GLTFLoader();
    const k = getKTX2();
    let gltf;
    if (k) {
      loader.setKTX2Loader(k);
      // KTX2-packed copy first (scripts/riftrealm/ktxPack.py), the webp original as the fallback
      gltf = await loader.loadAsync(BASE + 'gpu/' + file).catch(() => null);
    }
    gltf ??= await loader.loadAsync(BASE + file);
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; }
    });
    return { scene: gltf.scene, clips: gltf.animations };
  } catch (err) {
    console.warn('[rift-realm] character failed to load', file, err);
    return null;
  }
}

/**
 * Clips studied from a character's own motion video (services/mocap: capture → solve → retarget onto the rig), stored
 * beside the model as clips/<id>.json. They replace the same-named Muse clips and add new ones (land, wing_hover).
 */
async function videoClips(asset: CharacterAsset | null, id: string) {
  if (!asset) return;
  try {
    const res = await fetch(BASE + 'clips/' + id + '.json');
    if (!res.ok) return;
    const data = await res.json() as { clips: THREE.AnimationClipJSON[]; rootMotion?: CharacterAsset['rootMotion']; source?: CharacterAsset['source'] };
    asset.rootMotion = data.rootMotion; asset.source = data.source;
    for (const json of data.clips) {
      const clip = THREE.AnimationClip.parse(json);
      asset.clips = asset.clips.filter((c) => c.name.toLowerCase() !== clip.name.toLowerCase());
      asset.clips.push(clip);
    }
  } catch { /* no video clips: the Muse set stays */ }
}

export async function preloadCharacters() {
  [assets.stalker, assets.paladin] = await Promise.all([load('void_stalker.glb'), load('robot_paladin.glb')]);
  await Promise.all([videoClips(assets.stalker, 'void_stalker'), videoClips(assets.paladin, 'robot_paladin')]);
}

/** Gun / guard clips that also get an upper-body-only copy (the legs keep the locomotion underneath). */
/** Height of a character's body: skinned vertices, leaving out rigid cloak parts (100 % Spine2). */
function bodyHeight(model: THREE.Object3D): number {
  model.updateMatrixWorld(true);
  let lo = Infinity, hi = -Infinity;
  const v = new THREE.Vector3();
  model.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isMesh) return;
    const pos = m.geometry.getAttribute('position'), si = m.geometry.getAttribute('skinIndex'), sw = m.geometry.getAttribute('skinWeight');
    const sp = m.isSkinnedMesh ? m.skeleton.bones.findIndex((b) => /Spine2$/.test(b.name)) : -1;
    for (let i = 0; i < pos.count; i += 3) {
      if (sp >= 0 && si && sw && si.getX(i) === sp && sw.getX(i) > 0.999) continue;
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      lo = Math.min(lo, v.y); hi = Math.max(hi, v.y);
    }
  });
  return hi > lo ? hi - lo : new THREE.Box3().setFromObject(model).getSize(v).y;
}

const UPPER = ['shoot', 'reload', 'reload_pistol', 'switch_weapon', 'hit', 'aim_idle', 'rifle_aim', 'pistol_aim', 'pistol_shoot', 'throw', 'block', 'draw'];

export type Locomotion = 'idle' | 'run' | 'strafe_left' | 'strafe_right' | 'walk' | 'sprint' | 'walk_back' | 'run_back';

const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Blended locomotion (the Ravencrest / Era Clash scheme): idle, run and both strafes play all the time and their
 * weights follow speed and direction, so starts, stops and turns flow instead of snapping between clips. Playback
 * is speed-matched (no foot-sliding at sprint), strafes stay in step with the run, and backpedalling plays the run
 * in reverse. One-shots (shoot / hit / attack) layer over the legs, lighter while moving so the run keeps going.
 */
export class CharacterRig {
  readonly root = new THREE.Group();
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  /** Locomotion layers; `nat` = the clip's own ground speed in m/s at this rig's size (from its root motion). */
  private loco: { name: string; act: THREE.AnimationAction; w: number; nat: number }[] = [];
  private shot: { act: THREE.AnimationAction; base: number; left: number; dur: number; upper: boolean } | null = null;
  private moving = 0;
  /** A clip that holds its last frame over everything (death, knockdown) until release(). */
  private held: { act: THREE.AnimationAction; w: number } | null = null;
  /** 0…1 toward the crouch layer (crouch_walk: played at ground speed, frozen when standing still). */
  crouch = false;
  private crouchW = 0;
  private crouchAct: { act: THREE.AnimationAction; nat: number } | null = null;
  /** Upper-body-only copies of the gun clips: they play over a run without touching the legs. */
  private upper = new Map<string, THREE.AnimationAction>();
  private spine: THREE.Bone[] = [];
  /** Each spine bone's rest rotation: the aim bend is laid on top of the animated pose every frame, so a bone no clip
   *  keys (the Forge rig's Spine1) must start each frame from rest or the bend adds up and the torso spins. */
  private spineRest: THREE.Quaternion[] = [];
  private sockets = new Map<string, THREE.Object3D>();
  /** The Character Forge runtime: twist drivers, hand grips, springs (null on a rig without `extras.forge`). */
  private forge: ForgeRig | null = null;
  /** Outfit swing (coat, hood, pouches / tabard, tassets): secondary.ts. Null with ?soft=0 or no loose parts. */
  readonly soft: SoftRegions | null = null;
  /** The Void Stalker's bat wings: set `wings.target` (open / sweep / lift); null on other characters. */
  readonly wings: BatWings | null = null;
  /** World velocity of the character (m/s), measured from its travel; drives the air past the cloth. */
  readonly velocity = new THREE.Vector3();
  private secT = 0;
  private lastPos = new THREE.Vector3();
  private hasPos = false;
  private windV = new THREE.Vector3();
  /** A looping pose layer over everything (the glide's wing_hover): weight chases `poseLayerW`. */
  private poseLayer: { act: THREE.AnimationAction; w: number } | null = null;
  poseLayerW = 0;
  /** Aim pitch (radians, + = up): the spine bends so the gun points where the player aims. */
  aimPitch = 0;
  private aimApplied = 0;

  constructor(asset: CharacterAsset, height = 1.9) {
    const model = SkeletonUtils.clone(asset.scene);
    // sized by the BODY (feet → hood), not the whole bbox: the Void Stalker's wing cloak rises above its hood like
    // the art, and must not shrink the character (the cloak is pinned rigidly to Spine2; body weights are blended)
    const h = Math.max(0.01, bodyHeight(model));
    model.scale.setScalar(height / h);
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    for (const c of asset.clips) this.actions.set(c.name.toLowerCase(), this.mixer.clipAction(c));
    const idle = this.has('aim_idle') ? 'aim_idle' : 'idle';
    for (const name of [idle, 'walk', 'run', 'strafe_left', 'strafe_right', 'sprint', 'walk_back', 'run_back']) {
      const act = this.actions.get(name);
      if (!act) continue;
      act.setLoop(THREE.LoopRepeat, Infinity).play();
      act.setEffectiveWeight(name === idle ? 1 : 0);
      // playback follows ground speed: each cycle's own speed comes from its root motion (scaled to this rig)
      const rm = asset.rootMotion?.[name];
      // a cycle whose recorded travel is too small to trust (the side-run video: seen from the front, the solved root
      // barely moves) falls back to a typical cadence for its kind
      const rmSpeed = rm && rm.durationSec > 0 ? Math.hypot(rm.dx, rm.dz) / rm.durationSec : 0;
      const trust = name.startsWith('strafe') ? 1.5 : 0.4; // a side-run solved from the front under-reads its travel
      const nat = rmSpeed >= trust ? rmSpeed * (height / h) : ({ walk: 1.5, run: 3.6, sprint: 4.4, walk_back: 1.5, run_back: 3.6, strafe_left: 2.8, strafe_right: 2.8 } as Record<string, number>)[name] ?? 0;
      this.loco.push({ name: name === idle ? 'idle' : name, act, w: name === idle ? 1 : 0, nat });
    }
    const cw = this.actions.get('crouch_walk');
    if (cw) {
      cw.setLoop(THREE.LoopRepeat, Infinity).play();
      cw.setEffectiveWeight(0);
      const rm = asset.rootMotion?.crouch_walk;
      this.crouchAct = { act: cw, nat: rm && rm.durationSec > 0 ? Math.max(0.4, Math.hypot(rm.dx, rm.dz) / rm.durationSec * (height / h)) : 1.1 };
    }
    // legs + hips are left to the locomotion; everything above the hips (spine, arms, head) takes the gun clip
    const lower = /(^|[:_|])?(Hips|LeftUpLeg|RightUpLeg|LeftLeg|RightLeg|LeftFoot|RightFoot|LeftToe\w*|RightToe\w*)$/;
    for (const c of asset.clips) {
      const n = c.name.toLowerCase();
      if (!UPPER.includes(n)) continue;
      const tracks = c.tracks.filter((t) => !lower.test(t.name.split('.')[0]));
      if (tracks.length && tracks.length < c.tracks.length) this.upper.set(n, this.mixer.clipAction(new THREE.AnimationClip(`${n}_upper`, c.duration, tracks)));
    }
    model.traverse((o) => {
      if ((o as THREE.Bone).isBone && /Spine\d?$/.test(o.name)) this.spine.push(o as THREE.Bone);
      if (/^(hand_r_weapon|hand_l_weapon|back_weapon)$/.test(o.name)) this.sockets.set(o.name, o);
    });
    this.spineRest = this.spine.map((b) => b.quaternion.clone());
    this.forge = forgeRig(model);
    const sec = buildSecondary(model);
    this.soft = sec.soft; this.wings = sec.wings;
  }

  /** Loop `name` as a pose layer (e.g. 'wing_hover' while gliding); its weight follows poseLayerW. */
  setPoseLayer(name: string | null) {
    const a = name ? this.actions.get(name.toLowerCase()) : undefined;
    if (this.poseLayer?.act === a) return;
    this.poseLayer?.act.stop();
    this.poseLayer = a ? { act: a.reset().setLoop(THREE.LoopRepeat, Infinity).play(), w: 0 } : null;
    this.poseLayer?.act.setEffectiveWeight(0);
  }

  /** A hit or a shove (m/s, world) through the cloth and the wings. */
  shove(v: THREE.Vector3) { this.soft?.impulse(v); }

  /** Hand grip pose from the Forge (relaxed, fist, dagger, katana). */
  grip(hand: 'Left' | 'Right', pose: string) { this.forge?.grip(hand, pose); }

  /** Whether the character has a clip of this name (see the contract at the top of this file). */
  has(n: string) { return this.actions.has(n.toLowerCase()); }
  /** Every clip name the character carries. */
  get clipNames() { return [...this.actions.keys()]; }
  /** A weapon socket: hand_r_weapon, hand_l_weapon or back_weapon (undefined on an old rig). */
  socket(name: 'hand_r_weapon' | 'hand_l_weapon' | 'back_weapon') { return this.sockets.get(name); }

  /** Play a one-shot (shoot/hit/attack) over the locomotion layer. */
  play(name: string, weight = 1, seconds?: number) {
    name = name.toLowerCase();
    if (this.held) return;
    // on the move, a gun clip plays on the upper body only: the legs keep running (shoot while you run)
    const up = this.moving > 0.25 ? this.upper.get(name) : undefined;
    const a = up ?? this.actions.get(name);
    if (!a) return;
    if (this.shot && this.shot.act !== a) this.shot.act.fadeOut(0.06);
    a.reset().setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = false;
    // `seconds` squeezes a long take (the 5.7 s mocap reload) into a gameplay length
    a.timeScale = seconds ? a.getClip().duration / seconds : 1;
    a.play();
    const dur = seconds ?? a.getClip().duration;
    this.shot = { act: a, base: weight, left: dur, dur, upper: !!up };
  }

  /** Play a clip once and hold its last frame over everything (death, knockdown) until release(). */
  hold(name: string) {
    const a = this.actions.get(name.toLowerCase());
    if (!a) return false;
    if (this.shot) { this.shot.act.stop(); this.shot = null; }
    this.held?.act.stop();
    a.reset().setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.timeScale = 1;
    a.play();
    this.held = { act: a, w: 0 };
    return true;
  }
  /** Back to the locomotion after hold(). */
  release() { if (this.held) { this.held.act.stop(); this.held = null; } }
  get holding() { return !!this.held; }

  /** speed in m/s; local = velocity in the character's own frame (x right, z forward). */
  update(dt: number, speed: number, localX = 0, localZ = 1) {
    const s = Math.max(1e-3, Math.hypot(localX, localZ));
    const move = sstep(0.3, 1.6, speed);
    this.moving = move;
    const fwd = Math.max(0, localZ) / s, back = Math.max(0, -localZ) / s, side = Math.abs(localX) / s;
    const hasStrafe = this.loco.some((l) => l.name === 'strafe_left');
    const sideW = hasStrafe ? sstep(0.35, 0.8, side) : 0;
    // a walk clip (motion-captured stride) carries the slow speeds, the run takes over from ~3 to 6 m/s
    const hasWalk = this.loco.some((l) => l.name === 'walk'), runW = hasWalk ? sstep(3, 6, speed) : 1;
    // sprint (the motion-captured low run) takes over above ~9.5 m/s; back-pedal clips (the advance / run played
    // backwards) replace the reversed run when moving backwards
    const hasSprint = this.loco.some((l) => l.name === 'sprint'), sprW = hasSprint ? sstep(9.2, 11, speed) : 0;
    const hasBack = this.loco.some((l) => l.name === 'run_back'), backW = hasBack ? sstep(0.15, 0.55, back - fwd) : 0;
    const fw = move * (1 - sideW);
    const target: Record<string, number> = {
      idle: 1 - move,
      walk: fw * (1 - runW) * (1 - backW),
      run: fw * runW * (1 - sprW) * (1 - backW),
      sprint: fw * runW * sprW * (1 - backW),
      walk_back: fw * (1 - runW) * backW,
      run_back: fw * runW * backW,
      strafe_left: move * sideW * (localX > 0 ? 1 : 0),
      strafe_right: move * sideW * (localX > 0 ? 0 : 1),
    };
    if (!this.loco.some((l) => l.name === 'walk_back')) target.run_back += target.walk_back;
    // one-shot layer: full weight standing, lighter on the run; fades out over its last 0.18 s
    let ow = 0;
    if (this.shot) {
      this.shot.left -= dt;
      if (this.shot.left <= 0) { this.shot.act.stop(); this.shot = null; }
      else {
        const fadeIn = Math.min(1, (this.shot.dur - this.shot.left) / 0.08), fadeOut = Math.min(1, this.shot.left / 0.18);
        if (this.shot.upper) {
          // the upper-body copy blends against the full-weight run (normalised), so it gets a bigger weight to lead
          this.shot.act.setEffectiveWeight(this.shot.base * fadeIn * fadeOut * 4);
        } else {
          ow = this.shot.base * fadeIn * fadeOut * (1 - 0.5 * move);
          this.shot.act.setEffectiveWeight(ow);
        }
      }
    }
    const k = Math.min(1, dt * 12);
    // held clip (death / knockdown) takes the whole body
    if (this.held) {
      this.held.w = Math.min(1, this.held.w + dt * 10);
      this.held.act.setEffectiveWeight(this.held.w);
      ow = Math.max(ow, this.held.w);
    }
    // pose layer (the glide): takes the body like a held clip, faded by poseLayerW
    if (this.poseLayer) {
      this.poseLayer.w += (this.poseLayerW - this.poseLayer.w) * Math.min(1, dt * 6);
      this.poseLayer.act.setEffectiveWeight(this.poseLayer.w);
      ow = Math.max(ow, this.poseLayer.w);
    }
    // crouch: the crouch walk replaces the standing locomotion (held still when not moving)
    this.crouchW += ((this.crouch && this.crouchAct ? 1 : 0) - this.crouchW) * k;
    if (this.crouchAct) {
      this.crouchAct.act.setEffectiveWeight(this.crouchW * (1 - ow));
      this.crouchAct.act.timeScale = move < 0.05 ? 0 : THREE.MathUtils.clamp(speed / this.crouchAct.nat, 0.5, 2);
    }
    // each cycle plays at (ground speed / its own speed), so planted feet stay planted (within sane cadence limits)
    const rateOf = (l: { nat: number }) => (l.nat > 0 ? THREE.MathUtils.clamp(speed / l.nat, 0.6, 2.6) : 1);
    const run = this.loco.find((l) => l.name === 'run');
    const rate = run ? rateOf(run) : 1;
    for (const l of this.loco) {
      l.w += ((target[l.name] ?? 0) - l.w) * k;
      l.act.setEffectiveWeight(l.w * (1 - ow) * (1 - this.crouchW));
      if (l.name === 'run') l.act.timeScale = !hasBack && back > fwd + 0.2 ? -rate : rate;
      else if (l.name === 'sprint' || l.name === 'run_back' || l.name === 'walk' || l.name === 'walk_back') l.act.timeScale = rateOf(l);
      else if (l.name.startsWith('strafe')) {
        l.act.timeScale = rateOf(l);
        // keep the strafe step in phase with the run so the blend doesn't double-step
        if (run && l.w < 0.05) l.act.time = (run.act.time / run.act.getClip().duration) * l.act.getClip().duration;
      }
    }
    // procedural layers start from rest each frame (the mixer then writes the bones its clips key)
    this.spine.forEach((b, i) => b.quaternion.copy(this.spineRest[i]));
    this.mixer.update(dt);
    this.forge?.update(dt);
    this.applyAim(dt);
    this.updateSecondary(dt);
  }

  private _p = new THREE.Vector3();
  /** Cloth and wings last: they hang off the final pose (aim bend included) and feel the travel and the wind. */
  private updateSecondary(dt: number) {
    if ((!this.soft && !this.wings) || dt <= 0) return;
    this.secT += dt;
    this.root.updateWorldMatrix(true, true);
    const p = this.root.getWorldPosition(this._p);
    if (this.hasPos) {
      const vx = (p.x - this.lastPos.x) / dt, vy = (p.y - this.lastPos.y) / dt, vz = (p.z - this.lastPos.z) / dt;
      if (vx * vx + vy * vy + vz * vz > 60 * 60) { this.velocity.set(0, 0, 0); this.soft?.reset(); this.wings?.reset(); }
      else this.velocity.lerp(this._p2.set(vx, vy, vz), Math.min(1, dt * 20));
    }
    this.lastPos.copy(p); this.hasPos = true;
    windAt(p, this.secT, this.windV);
    if (this.soft) { this.soft.wind.copy(this.windV); this.soft.bodyVel.copy(this.velocity); this.soft.update(dt); }
    if (this.wings) { this.wings.wind.copy(this.windV); this.wings.bodyVel.copy(this.velocity); this.wings.update(dt); }
  }
  private _p2 = new THREE.Vector3();


  private axis = new THREE.Vector3(); private fwd = new THREE.Vector3(); private pq = new THREE.Quaternion(); private dq = new THREE.Quaternion();
  /** Bend the spine (shared across its bones) about the character's right axis so the chest and gun follow the aim pitch. */
  private applyAim(dt: number) {
    this.aimApplied += (THREE.MathUtils.clamp(this.aimPitch, -0.85, 0.85) - this.aimApplied) * Math.min(1, dt * 16);
    if (!this.spine.length || Math.abs(this.aimApplied) < 1e-3) return;
    this.root.updateWorldMatrix(true, false);
    this.root.getWorldDirection(this.fwd);                         // the rig faces its +Z
    this.axis.crossVectors(this.fwd, THREE.Object3D.DEFAULT_UP).normalize(); // forward × up: + angle tips forward up
    const per = this.aimApplied / this.spine.length;
    for (const b of this.spine) {
      b.parent!.updateWorldMatrix(true, false);
      b.parent!.getWorldQuaternion(this.pq).invert();
      this.dq.setFromAxisAngle(this.axis.clone().applyQuaternion(this.pq), per);
      b.quaternion.premultiply(this.dq);
      b.updateMatrixWorld(true);
    }
  }
}
