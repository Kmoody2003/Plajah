// Rigged characters (Void Stalker = player, Robot Paladin = enemy) built from the concept turnarounds.
// Rig contract: Y-up, faces +Z, feet at y=0, ~2 m tall; clips idle/aim_idle/run/walk/strafe_left/strafe_right/shoot/hit/death/attack_1..3.
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { getKTX2 } from './textures';

const BASE = '/games/rift-realm/assets/characters/';

export interface CharacterAsset { scene: THREE.Object3D; clips: THREE.AnimationClip[] }
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
    const data = await res.json() as { clips: THREE.AnimationClipJSON[] };
    for (const json of data.clips) {
      const clip = THREE.AnimationClip.parse(json);
      asset.clips = asset.clips.filter((c) => c.name.toLowerCase() !== clip.name.toLowerCase());
      asset.clips.push(clip);
    }
  } catch { /* no video clips: the Muse set stays */ }
}

export async function preloadCharacters() {
  [assets.stalker, assets.paladin] = await Promise.all([load('void_stalker.glb'), load('robot_paladin.glb')]);
  await videoClips(assets.stalker, 'void_stalker');
}

export type Locomotion = 'idle' | 'run' | 'strafe_left' | 'strafe_right' | 'walk';

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
  private loco: { name: string; act: THREE.AnimationAction; w: number }[] = [];
  private shot: { act: THREE.AnimationAction; base: number; left: number; dur: number; upper: boolean } | null = null;
  private moving = 0;
  /** Upper-body-only copies of the gun clips: they play over a run without touching the legs. */
  private upper = new Map<string, THREE.AnimationAction>();
  private spine: THREE.Bone[] = [];
  /** Aim pitch (radians, + = up): the spine bends so the gun points where the player aims. */
  aimPitch = 0;
  private aimApplied = 0;

  constructor(asset: CharacterAsset, height = 1.9) {
    const model = SkeletonUtils.clone(asset.scene);
    const box = new THREE.Box3().setFromObject(model);
    const h = Math.max(0.01, box.max.y - box.min.y);
    model.scale.setScalar(height / h);
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    for (const c of asset.clips) this.actions.set(c.name.toLowerCase(), this.mixer.clipAction(c));
    const idle = this.has('aim_idle') ? 'aim_idle' : 'idle';
    for (const name of [idle, 'walk', 'run', 'strafe_left', 'strafe_right']) {
      const act = this.actions.get(name);
      if (!act) continue;
      act.setLoop(THREE.LoopRepeat, Infinity).play();
      act.setEffectiveWeight(name === idle ? 1 : 0);
      this.loco.push({ name: name === idle ? 'idle' : name, act, w: name === idle ? 1 : 0 });
    }
    // legs + hips are left to the locomotion; everything above the hips (spine, arms, head) takes the gun clip
    const lower = /(^|[:_|])?(Hips|LeftUpLeg|RightUpLeg|LeftLeg|RightLeg|LeftFoot|RightFoot|LeftToe\w*|RightToe\w*)$/;
    for (const c of asset.clips) {
      const n = c.name.toLowerCase();
      if (n !== 'shoot' && n !== 'reload' && n !== 'aim_idle') continue;
      const tracks = c.tracks.filter((t) => !lower.test(t.name.split('.')[0]));
      if (tracks.length && tracks.length < c.tracks.length) this.upper.set(n, this.mixer.clipAction(new THREE.AnimationClip(`${n}_upper`, c.duration, tracks)));
    }
    model.traverse((o) => { if ((o as THREE.Bone).isBone && /Spine\d?$/.test(o.name)) this.spine.push(o as THREE.Bone); });
  }

  private has(n: string) { return this.actions.has(n); }

  /** Play a one-shot (shoot/hit/attack) over the locomotion layer. */
  play(name: string, weight = 1) {
    // on the move, a gun clip plays on the upper body only: the legs keep running (shoot while you run)
    const up = this.moving > 0.25 ? this.upper.get(name) : undefined;
    const a = up ?? this.actions.get(name);
    if (!a) return;
    if (this.shot && this.shot.act !== a) this.shot.act.fadeOut(0.06);
    a.reset().setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = false;
    a.play();
    const dur = a.getClip().duration;
    this.shot = { act: a, base: weight, left: dur, dur, upper: !!up };
  }

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
    const target: Record<string, number> = {
      idle: 1 - move,
      walk: move * (1 - sideW) * (1 - runW),
      run: move * (1 - sideW) * runW,
      strafe_left: move * sideW * (localX > 0 ? 1 : 0),
      strafe_right: move * sideW * (localX > 0 ? 0 : 1),
    };
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
    const rate = THREE.MathUtils.clamp(speed / 7, 0.8, 1.6); // run clip authored near 7 m/s
    const run = this.loco.find((l) => l.name === 'run');
    for (const l of this.loco) {
      l.w += ((target[l.name] ?? 0) - l.w) * k;
      l.act.setEffectiveWeight(l.w * (1 - ow));
      if (l.name === 'run') l.act.timeScale = back > fwd + 0.2 ? -rate : rate;
      else if (l.name.startsWith('strafe')) {
        l.act.timeScale = rate;
        // keep the strafe step in phase with the run so the blend doesn't double-step
        if (run && l.w < 0.05) l.act.time = (run.act.time / run.act.getClip().duration) * l.act.getClip().duration;
      }
    }
    this.mixer.update(dt);
    this.applyAim(dt);
  }

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
