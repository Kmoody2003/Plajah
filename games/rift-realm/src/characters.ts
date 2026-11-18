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

export async function preloadCharacters() {
  [assets.stalker, assets.paladin] = await Promise.all([load('void_stalker.glb'), load('robot_paladin.glb')]);
}

export type Locomotion = 'idle' | 'run' | 'strafe_left' | 'strafe_right' | 'walk';

export class CharacterRig {
  readonly root = new THREE.Group();
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private oneShot = 0;

  constructor(asset: CharacterAsset, height = 1.9) {
    const model = SkeletonUtils.clone(asset.scene);
    const box = new THREE.Box3().setFromObject(model);
    const h = Math.max(0.01, box.max.y - box.min.y);
    model.scale.setScalar(height / h);
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    for (const c of asset.clips) this.actions.set(c.name.toLowerCase(), this.mixer.clipAction(c));
    this.loop(this.has('aim_idle') ? 'aim_idle' : 'idle');
  }

  private has(n: string) { return this.actions.has(n); }

  private loop(name: string, fade = 0.18) {
    const next = this.actions.get(name) ?? this.actions.get('idle');
    if (!next || next === this.current) return;
    next.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(fade).play();
    this.current?.fadeOut(fade);
    this.current = next;
  }

  /** Play a one-shot (shoot/hit/attack) over the locomotion layer. */
  play(name: string, weight = 1) {
    const a = this.actions.get(name);
    if (!a) return;
    a.reset().setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = false;
    a.setEffectiveWeight(weight).fadeIn(0.05).play();
    this.oneShot = Math.max(this.oneShot, a.getClip().duration);
  }

  /** speed in m/s; local = velocity in the character's own frame (x right, z forward). */
  update(dt: number, speed: number, localX = 0, localZ = 1) {
    if (this.oneShot <= 0) {
      if (speed < 0.4) this.loop(this.has('aim_idle') ? 'aim_idle' : 'idle');
      else if (Math.abs(localX) > Math.abs(localZ) * 1.1 && this.has('strafe_left')) this.loop(localX > 0 ? 'strafe_left' : 'strafe_right');
      else this.loop(speed > 5 || !this.has('walk') ? 'run' : 'walk');
    }
    this.oneShot -= dt;
    const run = this.current?.getClip().name === 'run';
    this.mixer.update(dt * (run ? Math.min(1.5, 0.6 + speed / 9) : 1));
  }
}
