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
import { makeSoftGlowTexture } from './world';

export const SCRIBE_URL = '/games/lexicon/assets/characters/scribe.glb';
const SOLDIER_URL = '/models/halloween/base_rigs/Soldier.glb';
const MOCAP = (id: string) => `/games/ravencrest/assets/mocap/${id}.fbx`;

export interface ScribeModel {
  root: THREE.Group;
  rig: ForgeRig | null;
  /** speed in m/s; strike 0…1 through a swing (0 = none); roll 0…1 through a roll; glow 0..1 spear-tip lantern intensity. */
  update(dt: number, speed: number, strike: number, roll: number, glow?: number): void;
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
  // the art's stance, fitted by the Forge's scorer (extras.forge.stance): the right arm forward and bent round the staff
  const stance = (findForgeExtras(model) as unknown as { stance?: { rArm?: number; rArmFwd?: number; rElbow?: number } }).stance;
  const holdArm = model.getObjectByName('RightArm'), holdFore = model.getObjectByName('RightForeArm');
  const qa = (ax: THREE.Vector3, a: number) => new THREE.Quaternion().setFromAxisAngle(ax, a);
  const X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);
  // the scorer's pose is applied over the bind pose (pose × rest), so the target is fixed: keep it
  const armHold = stance?.rArm !== undefined && holdArm ? qa(X, -(stance.rArmFwd ?? 0)).multiply(qa(Z, stance.rArm)).multiply(holdArm.quaternion.clone()) : null;
  // the elbow bends about its hinge, as the scorer bends it (forgeFidelity elbowBend): the axis across the upper arm (held
  // at its target) and the body's forward (+z in the model's own space), in the upper arm's frame
  const foreHold = (() => {
    if (stance?.rElbow === undefined || !holdFore || !holdArm || !armHold) return null;
    const rest = holdArm.quaternion.clone();
    holdArm.quaternion.copy(armHold); model.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
    const a = new THREE.Vector3().setFromMatrixPosition(holdArm.matrixWorld).applyMatrix4(inv);
    const f = new THREE.Vector3().setFromMatrixPosition(holdFore.matrixWorld).applyMatrix4(inv);
    const axis = new THREE.Vector3().crossVectors(f.sub(a).normalize(), Z).normalize();
    const mq = new THREE.Quaternion(); model.getWorldQuaternion(mq);
    const aq = new THREE.Quaternion(); holdArm.getWorldQuaternion(aq);
    axis.applyQuaternion(mq.invert().multiply(aq).invert()); // model frame -> the upper arm's frame
    holdArm.quaternion.copy(rest); model.updateMatrixWorld(true);
    return qa(axis, stance.rElbow).multiply(holdFore.quaternion.clone());
  })();
  let holdW = 1;
  const bone = (n: string) => model.getObjectByName(n) as THREE.Bone | undefined;
  const spine = bone('Spine1'), armR = bone('RightArm'), foreR = bone('RightForeArm'), hips = bone('Hips');
  const w = { idle: 1, walk: 0, run: 0 };
  // the quill-staff stands upright beside him (the art), riding the right hand's position, not its grip axis (a katana
  // grip points it forward): it leans a little with his movement and sweeps through a strike
  const staff = model.getObjectByName('quill_staff');
  // the palm (the Forge's hand socket, where the scorer stands it too), not the wrist bone 8 cm back from the fist
  const hand = model.getObjectByName('socket_hand_R') ?? bone('RightHand');
  if (staff) { root.attach(staff); }

  // Glowing cyan-gold Quill-Spear point crystal + feathery radial light sprite (zero hard edges, zero shader recompile!)
  const tipMat = new THREE.MeshStandardMaterial({
    color: 0xdafcf9, emissive: 0x62f2f6, emissiveIntensity: 1.4, roughness: 0.2,
  });
  const tipCrystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), tipMat);
  tipCrystal.scale.set(0.65, 1.85, 0.65);
  tipCrystal.position.set(0, 1.88, 0.02);
  const tipHaloMat = new THREE.SpriteMaterial({
    map: makeSoftGlowTexture('rgba(235,255,255,0.95)', 'rgba(110,245,248,0.34)'),
    transparent: true, opacity: 0.24, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const tipHalo = new THREE.Sprite(tipHaloMat);
  tipHalo.scale.set(0.9, 0.9, 1);
  tipHalo.position.set(0, 1.9, 0.02);
  if (staff) {
    staff.add(tipCrystal, tipHalo);
  } else {
    tipCrystal.position.set(0.42, 1.75, 0.45);
    tipHalo.position.set(0.42, 1.78, 0.45);
    root.add(tipCrystal, tipHalo);
  }

  const hp = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), tilt = new THREE.Quaternion(), rq = new THREE.Quaternion();
  let lean = 0;
  let glowT = 0;
  const q = new THREE.Quaternion(), e = new THREE.Euler();
  // walk and run share normalised time so the feet don't pop in the cross-fade
  act.run.timeScale = clips.walk.duration / clips.run.duration;

  return {
    root, rig,
    update(dt, speed, strike, roll, glow = 0.2) {
      glowT += dt;
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
      // hold the staff the way the art does: fully when standing, looser walking, loosest running, let go to strike
      const want = strike > 0 ? 0 : 1 - 0.35 * w.walk - 0.6 * w.run;
      holdW += (want - holdW) * (1 - Math.exp(-dt * 8));
      if (armHold && holdArm) holdArm.quaternion.slerp(armHold, holdW);
      if (foreHold && holdFore) holdFore.quaternion.slerp(foreHold, holdW);

      // Visceral 3-phase Quill-Spear Slash/Thrust animation (wind-up -> explosive forward slash -> follow-through!)
      let slashPitch = 0;
      let slashRoll = 0;
      let slashLunge = 0;
      if (strike > 0 && spine && armR && foreR) {
        if (strike < 0.22) {
          // Phase 1: Crisp wind-up coil back
          const u = strike / 0.22;
          spine.quaternion.multiply(q.setFromEuler(e.set(-0.12 * u, 0.58 * u, 0)));
          armR.quaternion.multiply(q.setFromEuler(e.set(-0.9 * u, 0.4 * u, -0.55 * u)));
          foreR.quaternion.multiply(q.setFromEuler(e.set(-0.4 * u, 0, -0.35 * u)));
          slashPitch = -0.55 * u;
          slashRoll = 0.45 * u;
        } else if (strike < 0.65) {
          // Phase 2: Explosive forward sweeping slash across the body!
          const u = (strike - 0.22) / 0.43;
          const s = Math.sin(u * Math.PI * 0.5);
          spine.quaternion.multiply(q.setFromEuler(e.set(0.24 * s, 0.58 - 1.65 * s, 0)));
          armR.quaternion.multiply(q.setFromEuler(e.set(-1.55 * s - 0.35, -0.85 * s, 0.95 * s)));
          foreR.quaternion.multiply(q.setFromEuler(e.set(-0.65 * s, 0, 0.45 * s)));
          slashPitch = -0.55 + 2.25 * s;
          slashRoll = 0.45 - 1.55 * s;
          slashLunge = 0.32 * Math.sin(u * Math.PI);
        } else {
          // Phase 3: Athletic recovery back to ready stance
          const u = 1 - (strike - 0.65) / 0.35;
          spine.quaternion.multiply(q.setFromEuler(e.set(0.24 * u, -1.07 * u, 0)));
          armR.quaternion.multiply(q.setFromEuler(e.set(-1.9 * u, -0.85 * u, 0.95 * u)));
          foreR.quaternion.multiply(q.setFromEuler(e.set(-0.65 * u, 0, 0.45 * u)));
          slashPitch = 1.7 * u;
          slashRoll = -1.1 * u;
        }
      }
      // the roll: tucked (the game turns the whole body over)
      if (roll > 0 && hips) hips.quaternion.multiply(q.setFromEuler(e.set(0.4 * Math.sin(roll * Math.PI), 0, 0)));
      rig?.update(dt);

      // Animate spear-tip lantern crystal & additive glow halo (gentle shimmer by day, guiding torch at night/caverns/strikes!)
      const pulse = 0.92 + 0.08 * Math.sin(glowT * 4.2);
      const strikeBoost = strike > 0.15 && strike < 0.7 ? 1.6 : 0;
      tipMat.emissiveIntensity = (0.7 + glow * 2.8 + strikeBoost * 1.4) * pulse;
      tipHaloMat.opacity = Math.min(0.85, (0.08 + glow * 0.42 + strikeBoost * 0.28) * pulse);
      tipHalo.scale.setScalar((0.75 + glow * 0.65 + strikeBoost * 0.45) * pulse);
      tipCrystal.rotation.y += dt * (1.8 + glow * 2.2);

      if (staff && hand) {
        hand.getWorldPosition(hp); root.worldToLocal(hp);
        staff.position.set(hp.x, 0, hp.z + slashLunge); // rides the hand socket with forward strike lunge
        lean += (Math.min(1, speed / 5) * 0.25 - lean) * (1 - Math.exp(-dt * 6));
        tilt.setFromEuler(e.set(lean + slashPitch, 0, -0.08 + slashRoll));
        staff.quaternion.copy(rq.setFromUnitVectors(up, up)).multiply(tilt);
      }
    },
  };
}
