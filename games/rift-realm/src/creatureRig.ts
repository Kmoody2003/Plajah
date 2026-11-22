// Skeletal rigs for the Elderwood creatures (wolf, mantis, wasp, bat, deer, moth).
//
// Each creature's GLB in assets/creatures/rigged/ is the same mesh as before (same UVs, textures, glow map) skinned
// to a skeleton fitted to it, with clips baked from its motion-study video (locomotion, attack) and short authored
// reactions (hit, hit_heavy, launch, knockdown, get_up, parried, death). Built by scripts/riftrealm/creatures/rig.py;
// what came from video and what was authored is in each clip's `asset.extras.rig.clips[name].source`.
//
// CreatureRig plays them the way CharacterRig plays the humans: a locomotion layer that follows ground speed, one-shots
// over it (play), a held clip over everything (hold / release), and two additive pose layers (crouch, tell) that the
// predators drive.
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { color, dot, mix, texture, uniform, vec3 } from 'three/tsl';

export type RigKind = 'wolf' | 'mantis' | 'wasp' | 'deer' | 'bat' | 'moth';

const FILES: Record<RigKind, string> = {
  wolf: 'electric_wolf', mantis: 'venom_mantis', wasp: 'plasma_wasp', deer: 'lumen_deer', bat: 'storm_bat', moth: 'glow_moth',
};
const BASE = '/games/rift-realm/assets/creatures/rigged/';

/** The locomotion cycle each kind moves with, and how many metres of ground one cycle covers at size 1. */
const LOCO: Record<RigKind, { clip: string; stride: number; min: number }> = {
  wolf: { clip: 'run', stride: 2.6, min: 0.55 },
  deer: { clip: 'walk', stride: 1.7, min: 0.5 },
  mantis: { clip: 'walk', stride: 0.9, min: 0.5 },
  wasp: { clip: 'fly', stride: 0, min: 1 },
  bat: { clip: 'fly', stride: 0, min: 1 },
  moth: { clip: 'fly', stride: 0, min: 1 },
};

export interface RigTemplate {
  scene: THREE.Object3D;
  clips: THREE.AnimationClip[];
  /** Height of the mesh (feet → top) in its own units, so the rig can be sized like the old body. */
  height: number;
  meta: Record<string, { source?: string; video?: string; frames?: number[]; note?: string; loop?: boolean }>;
}

const templates = new Map<RigKind, Promise<RigTemplate | null>>();
const loader = new GLTFLoader();

// per-creature values reach the shared material through object uniforms (set on each mesh's userData)
const uGlow = uniform(1).onObjectUpdate(({ object }) => (object?.userData.cGlow as number) ?? 1);
const uWild = uniform(0).onObjectUpdate(({ object }) => (object?.userData.cWild as number) ?? 0);
const WILD = color(0xff4a1a);

/** Load (once) a kind's rigged GLB. Resolves null when the file isn't there (the caller keeps its old body). */
export function loadRig(kind: RigKind): Promise<RigTemplate | null> {
  let p = templates.get(kind);
  if (p) return p;
  p = loader.loadAsync(BASE + FILES[kind] + '.glb').then((gltf) => {
    let height = 1;
    gltf.scene.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isMesh) return;
      const std = m.material as THREE.MeshStandardMaterial;
      // the look the creatures always had (creatures.ts): the painted map, the glow map flared by uGlow, and the feral
      // red-amber a wild predator shifts to
      const mat = new THREE.MeshStandardNodeMaterial({
        map: std.map, normalMap: std.normalMap, roughnessMap: std.roughnessMap, metalnessMap: std.metalnessMap,
        emissiveMap: std.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.6, roughness: 0.75, metalness: 0.15,
        side: THREE.DoubleSide, alphaTest: kind === 'wasp' ? 0.3 : 0,
      });
      if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
      if (mat.emissiveMap) {
        mat.emissiveMap.colorSpace = THREE.SRGBColorSpace;
        const e = texture(mat.emissiveMap).rgb.mul(1.6).mul(uGlow);
        mat.emissiveNode = mix(e, WILD.mul(dot(e, vec3(0.45, 0.45, 0.45)).mul(1.5)), uWild);
      }
      m.material = mat;
      m.castShadow = true;
      m.frustumCulled = false;
      m.geometry.computeBoundingBox();
      height = m.geometry.boundingBox!.max.y - Math.min(0, m.geometry.boundingBox!.min.y);
    });
    const meta = ((gltf.asset as { extras?: { rig?: { clips?: RigTemplate['meta'] } } }).extras?.rig?.clips) ?? {};
    return { scene: gltf.scene, clips: gltf.animations, height, meta };
  }).catch((err) => { console.warn('[rift] no rig for', kind, err?.message ?? err); return null; });
  templates.set(kind, p);
  return p;
}

const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** A pose clip (bone rotations from rest = identity, the root's offset) turned into an additive layer. */
function additive(clip: THREE.AnimationClip, rest: Map<string, THREE.Vector3>): THREE.AnimationClip {
  const tracks = clip.tracks.map((t) => {
    if (!t.name.endsWith('.position')) return t;
    const r = rest.get(t.name.split('.')[0]) ?? new THREE.Vector3();
    const v = Float32Array.from(t.values as Float32Array, (x, i) => x - r.getComponent(i % 3));
    return new THREE.VectorKeyframeTrack(t.name, Array.from(t.times), Array.from(v));
  });
  return new THREE.AnimationClip(clip.name + '_add', clip.duration, tracks, THREE.AdditiveAnimationBlendMode);
}

export class CreatureRig {
  readonly root = new THREE.Group();
  readonly meshes: THREE.Mesh[] = [];
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private idle: THREE.AnimationAction | null;
  private loco: THREE.AnimationAction | null;
  private locoW = 0;
  private shot: { act: THREE.AnimationAction; base: number; left: number; dur: number } | null = null;
  private held: { act: THREE.AnimationAction; w: number } | null = null;
  private layers: { name: string; act: THREE.AnimationAction; w: number }[] = [];
  /** Pose layers (0…1), driven by the predators: a low stalking crouch and the attack's wind-up. */
  crouch = 0; tell = 0;
  /** Glow flare (1 = normal) and the feral tint (0…1). */
  glow = 1; wild = 0;
  readonly meta: RigTemplate['meta'];

  constructor(readonly kind: RigKind, t: RigTemplate, readonly height: number, readonly size = 1) {
    const model = SkeletonUtils.clone(t.scene);
    model.scale.setScalar(height / t.height);
    this.root.add(model);
    model.traverse((o) => { if ((o as THREE.Mesh).isMesh) this.meshes.push(o as THREE.Mesh); });
    this.meta = t.meta;
    this.mixer = new THREE.AnimationMixer(model);
    const rest = new Map<string, THREE.Vector3>();
    model.traverse((o) => { if ((o as THREE.Bone).isBone || o.name === 'root') rest.set(o.name, o.position.clone()); });
    for (const c of t.clips) {
      const n = c.name.toLowerCase();
      if (t.meta[n] && (t.meta[n] as { layer?: boolean }).layer) {
        const a = this.mixer.clipAction(additive(c, rest));
        a.setLoop(THREE.LoopRepeat, Infinity).play(); a.setEffectiveWeight(0); a.time = 0; a.paused = true;
        this.actions.set(n, a); this.layers.push({ name: n, act: a, w: 0 });
        continue;
      }
      this.actions.set(n, this.mixer.clipAction(c));
    }
    this.idle = this.actions.get('idle') ?? null;
    this.loco = this.actions.get(LOCO[kind].clip) ?? null;
    this.idle?.setLoop(THREE.LoopRepeat, Infinity).play();
    this.loco?.setLoop(THREE.LoopRepeat, Infinity).play();
    this.loco?.setEffectiveWeight(0);
    // start each creature at its own point in its cycles so a pack doesn't move in lockstep
    for (const a of [this.idle, this.loco]) if (a) a.time = Math.random() * a.getClip().duration;
    this.write();
  }

  has(n: string) { return this.actions.has(n.toLowerCase()); }
  get clipNames() { return [...this.actions.keys()]; }

  /** Play a one-shot (attack / hit / parried …) over the locomotion; `seconds` fits it to a gameplay length. */
  play(name: string, weight = 1, seconds?: number) {
    const a = this.actions.get(name.toLowerCase());
    if (!a || this.held) return;
    if (this.shot && this.shot.act !== a) this.shot.act.fadeOut(0.06);
    a.reset().setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = false;
    a.timeScale = seconds ? a.getClip().duration / seconds : 1;
    a.play();
    const dur = seconds ?? a.getClip().duration;
    this.shot = { act: a, base: weight, left: dur, dur };
  }

  /** An attack that starts just before its contact frame (meta.hit_at, a fraction of the clip), for callers that
   *  trigger it when the hit lands rather than at the wind-up. */
  strike(name: string, lead = 0.16) {
    const a = this.actions.get(name.toLowerCase());
    if (!a) return;
    this.play(name);
    const d = a.getClip().duration;
    const hitAt = (this.meta[name.toLowerCase()] as { hit_at?: number } | undefined)?.hit_at ?? 0.55;
    const from = Math.max(0, hitAt * d - lead);
    a.time = from;
    if (this.shot) { this.shot.left = d - from; this.shot.dur = d - from; }
  }

  /** Play a clip once and hold its last frame over everything (death, knockdown) until release(). */
  hold(name: string, seconds?: number) {
    const a = this.actions.get(name.toLowerCase());
    if (!a) return false;
    if (this.shot) { this.shot.act.stop(); this.shot = null; }
    this.held?.act.stop();
    a.reset().setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.timeScale = seconds ? a.getClip().duration / seconds : 1;
    a.play();
    this.held = { act: a, w: 0 };
    return true;
  }
  /** Back to the locomotion after hold(). */
  release() { if (this.held) { this.held.act.stop(); this.held = null; } }
  get holding() { return !!this.held; }

  /** speed in m/s over the ground (flyers: through the air). */
  update(dt: number, speed: number) {
    const L = LOCO[this.kind];
    const flyer = L.stride === 0;
    const move = flyer ? 1 : sstep(0.25, 1.2, speed);
    let ow = 0;
    if (this.shot) {
      this.shot.left -= dt;
      if (this.shot.left <= 0) { this.shot.act.stop(); this.shot = null; }
      else {
        const fadeIn = Math.min(1, (this.shot.dur - this.shot.left) / 0.06), fadeOut = Math.min(1, this.shot.left / 0.15);
        ow = this.shot.base * fadeIn * fadeOut;
        this.shot.act.setEffectiveWeight(ow);
      }
    }
    if (this.held) {
      this.held.w = Math.min(1, this.held.w + dt * 10);
      this.held.act.setEffectiveWeight(this.held.w);
      ow = Math.max(ow, this.held.w);
    }
    const k = Math.min(1, dt * 8);
    this.locoW += (move - this.locoW) * k;
    if (this.loco) {
      this.loco.setEffectiveWeight(this.locoW * (1 - ow));
      // one cycle per stride travelled (feet stay planted); flyers beat faster in a chase
      const nat = flyer ? 0 : (L.stride * this.size) / this.loco.getClip().duration;
      this.loco.timeScale = flyer ? 1 + Math.min(1, speed / 8) * 0.5 : THREE.MathUtils.clamp(speed / nat, L.min, 2.4);
    }
    this.idle?.setEffectiveWeight((1 - this.locoW) * (1 - ow));
    // pose layers: additive on whatever plays (a crouched gallop is a stalk); the held clip shuts them out
    for (const l of this.layers) {
      const want = l.name === 'crouch' ? this.crouch : l.name === 'tell' ? this.tell : 0;
      l.w += (want * (1 - (this.held ? this.held.w : 0)) - l.w) * Math.min(1, dt * 10);
      l.act.setEffectiveWeight(l.w);
    }
    this.mixer.update(dt);
    this.write();
  }

  private write() {
    for (const m of this.meshes) { m.userData.cGlow = this.glow; m.userData.cWild = this.wild; }
  }
}
