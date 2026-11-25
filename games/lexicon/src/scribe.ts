// The Scribe in the game: the Character Forge GLB (scripts/eraclash3d/characters/scribe → public/games/lexicon/assets/
// characters/scribe.glb) brought to life with the shared pieces — playkit's forgeRig (springs, correctives, grips, the
// cloak and skirt as cloth) and Era Clash's retargeting of real motion capture (CMU walk 02_01, run 02_03; the
// Soldier rig's idle) onto the Forge skeleton. Locomotion blends idle → walk → run by speed; a strike and a roll are
// laid over it procedurally until the Scribe has his own captured moves.
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { forgeRig, findForgeExtras, type ForgeRig } from '../../../playkit/character/forgeRig';
import { retarget, CMU_TO_CONTRACT } from '../../era-clash-3d/src/core/character';

export const SCRIBE_URL = '/games/lexicon/assets/characters/scribe.glb';
const SOLDIER_URL = '/models/halloween/base_rigs/Soldier.glb';
const MOCAP = (id: string) => `/games/ravencrest/assets/mocap/${id}.fbx`;

export interface ScribeModel {
  root: THREE.Group;
  rig: ForgeRig | null;
  /** speed in m/s; strike 0…1 through a swing (0 = none); roll 0…1 through a roll. */
  update(dt: number, speed: number, strike: number, roll: number): void;
}

export async function loadScribe(url = SCRIBE_URL): Promise<ScribeModel | null> {
  const gl = new GLTFLoader();
  const [gltf, soldier] = await Promise.all([gl.loadAsync(url), gl.loadAsync(SOLDIER_URL)]);
  const model = gltf.scene;
  if (!findForgeExtras(model)) return null;
  model.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; } });
  const root = new THREE.Group(); root.name = 'Scribe';
  root.add(model);
  root.updateMatrixWorld(true);

  const fbx = new FBXLoader();
  const [walkFbx, runFbx] = await Promise.all([fbx.loadAsync(MOCAP('02_01')), fbx.loadAsync(MOCAP('02_03'))]);
  const walk = retarget(model, walkFbx, walkFbx.animations[0], 'walk', CMU_TO_CONTRACT);
  const run = retarget(model, runFbx, runFbx.animations[0], 'run', CMU_TO_CONTRACT);
  // the idle: the capture's own first moments, standing before the first step (the Soldier rig's idle, retargeted onto
  // the Forge skeleton, stood in a stride)
  const idle = THREE.AnimationUtils.subclip(walk, 'idle', 0, 8, 30);
  void soldier;
  const clips = { idle, walk, run };
  const mixer = new THREE.AnimationMixer(model);
  const act = Object.fromEntries(Object.entries(clips).map(([k, c]) => { const a = mixer.clipAction(c); a.play(); a.setEffectiveWeight(0); return [k, a]; })) as Record<keyof typeof clips, THREE.AnimationAction>;
  act.idle.setEffectiveWeight(1);
  const rig = forgeRig(model);
  const bone = (n: string) => model.getObjectByName(n) as THREE.Bone | undefined;
  const spine = bone('Spine1'), armR = bone('RightArm'), foreR = bone('RightForeArm'), hips = bone('Hips');
  const w = { idle: 1, walk: 0, run: 0 };
  // the quill-staff stands upright beside him (the art), riding the right hand's position, not its grip axis (a katana
  // grip points it forward): it leans a little with his movement and sweeps through a strike
  const staff = model.getObjectByName('quill_staff');
  const hand = bone('RightHand');
  if (staff) { root.attach(staff); }
  const hp = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), tilt = new THREE.Quaternion(), rq = new THREE.Quaternion();
  let lean = 0;
  const q = new THREE.Quaternion(), e = new THREE.Euler();
  // walk and run share normalised time so the feet don't pop in the cross-fade
  act.run.timeScale = clips.walk.duration / clips.run.duration;

  return {
    root, rig,
    update(dt, speed, strike, roll) {
      const WALK = 1.6, RUN = 5.2;
      const tw = speed <= WALK ? THREE.MathUtils.smoothstep(speed, 0.05, WALK) : 1 - THREE.MathUtils.smoothstep(speed, WALK, RUN);
      const tr = speed <= WALK ? 0 : THREE.MathUtils.smoothstep(speed, WALK, RUN);
      const ti = Math.max(0, 1 - tw - tr);
      const k = 1 - Math.exp(-dt * 10);
      w.idle += (ti - w.idle) * k; w.walk += (tw - w.walk) * k; w.run += (tr - w.run) * k;
      act.idle.setEffectiveWeight(w.idle); act.walk.setEffectiveWeight(w.walk); act.run.setEffectiveWeight(w.run);
      // the captured walk was recorded at ~1.4 m/s and the run at ~3.6 m/s: play them at the speed the Scribe moves
      act.walk.setEffectiveTimeScale(Math.max(0.6, speed / 1.4)); act.run.setEffectiveTimeScale(Math.max(0.6, speed / 3.6));
      mixer.update(dt);
      // the strike: a sweep of the staff across the body, the chest turning into it (over the locomotion)
      if (strike > 0 && spine && armR && foreR) {
        const s = Math.sin(strike * Math.PI);
        spine.quaternion.multiply(q.setFromEuler(e.set(0, -0.9 * Math.sin(strike * Math.PI * 1.2 - 0.3), 0)));
        armR.quaternion.multiply(q.setFromEuler(e.set(-1.3 * s, 0, 0.6 * s)));
        foreR.quaternion.multiply(q.setFromEuler(e.set(-0.5 * s, 0, 0)));
      }
      // the roll: tucked (the game turns the whole body over)
      if (roll > 0 && hips) hips.quaternion.multiply(q.setFromEuler(e.set(0.4 * Math.sin(roll * Math.PI), 0, 0)));
      rig?.update(dt);
      if (staff && hand) {
        hand.getWorldPosition(hp); root.worldToLocal(hp);
        staff.position.set(hp.x, 0, hp.z); // built from its foot: stood on the ground under the hand
        lean += (Math.min(1, speed / 5) * 0.25 - lean) * (1 - Math.exp(-dt * 6));
        // upright, tipped forward with speed, swung down and across in a strike
        const sw = strike > 0 ? Math.sin(strike * Math.PI) : 0;
        tilt.setFromEuler(e.set(lean + 1.2 * sw, 0, -0.08 - 0.6 * sw));
        staff.quaternion.copy(rq.setFromUnitVectors(up, up)).multiply(tilt);
      }
    },
  };
}
