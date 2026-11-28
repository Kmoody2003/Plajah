// Living Character Forge Villagers & Daily Trade Schedules for Glossa Hollow:
// - Progressively swaps all 12 stand-ins for rigged 58-joint Plajah Character Forge GLBs
// - Living daytime trade routines (forging, patrolling, running errands, gardening, playing, studying, performing)
// - At Dusk, villagers walk home along the paths to their cottages; at Night they rest inside warmly lit homes
//   (while Bram the Guard stays awake on lantern-lit night patrol with a glowing watch lantern!)
// - At Dawn, villagers step back outside and return to their crafts.
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { forgeRig, findForgeExtras, type ForgeRig } from '../../../playkit/character/forgeRig';
import { retarget, CMU_TO_CONTRACT } from '../../era-clash-3d/src/core/character';
import type { Villager } from './content';
import { makeSoftGlowTexture } from './world';

const MOCAP_WALK = '/games/ravencrest/assets/mocap/02_01.fbx';

interface LiveNpc {
  def: Villager;
  holder: THREE.Group;
  model: THREE.Object3D | null;
  mixer: THREE.AnimationMixer | null;
  idleAct: THREE.AnimationAction | null;
  walkAct: THREE.AnimationAction | null;
  rig: ForgeRig | null;
  lanternHalo: THREE.Sprite | null;
  lanternBulb: THREE.Mesh | null;
  x: number;
  z: number;
  yaw: number;
  wpIdx: number;
  pauseT: number;
  working: boolean;
  atHome: boolean;
  phase: number;
}

export interface VillagerCast {
  update(
    dt: number,
    t: number,
    playerX: number,
    playerZ: number,
    dayPhase: 'day' | 'dusk' | 'night' | 'dawn',
    heightAt: (x: number, z: number) => number,
  ): void;
  getPosition(id: string): [number, number];
  isSleepingHome(id: string): boolean;
  readonly loadedCount: number;
}

export function loadVillagerCast(
  villagers: Villager[],
  holders: Map<string, THREE.Group>,
  onLoaded?: (id: string) => void,
): VillagerCast {
  const npcs: LiveNpc[] = [];
  const byId = new Map<string, LiveNpc>();
  let loadedCount = 0;

  // Initialize every villager immediately so schedules & routines run even while GLBs stream in!
  villagers.forEach((v, idx) => {
    const holder = holders.get(v.id);
    if (!holder) return;
    let lanternHalo: THREE.Sprite | null = null;
    let lanternBulb: THREE.Mesh | null = null;
    if (v.nightWatch) {
      // Bram the Guard carries a warm watch lantern + feathery radial glow sprite (zero hard bubbles!)
      lanternBulb = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.14),
        new THREE.MeshStandardMaterial({ color: 0xffd37a, emissive: 0xffaa38, emissiveIntensity: 0 }),
      );
      lanternBulb.position.set(0.42, 1.35, 0.38);
      lanternHalo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: makeSoftGlowTexture('rgba(255,238,175,0.95)', 'rgba(255,168,54,0.34)'),
          transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
        }),
      );
      lanternHalo.scale.set(1.5, 1.5, 1);
      lanternHalo.position.set(0.42, 1.38, 0.38);
      holder.add(lanternBulb, lanternHalo);
    }
    const npc: LiveNpc = {
      def: v,
      holder,
      model: null,
      mixer: null,
      idleAct: null,
      walkAct: null,
      rig: null,
      lanternHalo,
      lanternBulb,
      x: v.pos[0],
      z: v.pos[1],
      yaw: holder.rotation.y,
      wpIdx: (idx % 2 === 0 && (v.waypoints?.length ?? 0) > 1) ? 1 : 0,
      pauseT: (idx % 2 === 0) ? 0 : 0.7 + (idx % 3) * 0.7,
      working: idx % 2 !== 0,
      atHome: false,
      phase: idx * 1.17,
    };
    npcs.push(npc);
    byId.set(v.id, npc);
  });

  const gl = new GLTFLoader();
  const fbxLoader = new FBXLoader();
  const walkFbxPromise = fbxLoader.loadAsync(MOCAP_WALK).catch(() => null);
  const ordered = [...villagers].sort((a, b) => Math.hypot(a.pos[0], a.pos[1] - 6) - Math.hypot(b.pos[0], b.pos[1] - 6));

  void (async () => {
    const loadOne = async (v: Villager) => {
      const npc = byId.get(v.id);
      if (!npc) return;
      const url = `/games/lexicon/assets/characters/${v.glb}.glb`;
      try {
        const [gltf, walkFbx] = await Promise.all([gl.loadAsync(url), walkFbxPromise]);
        const model = gltf.scene;
        model.name = `forge_${v.glb}`;
        model.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow = true;
            m.receiveShadow = true;
            m.frustumCulled = false;
          }
        });

        for (const child of npc.holder.children) {
          if ((child as THREE.Sprite).isSprite) {
            child.position.y = v.height + 0.52;
          } else if (child !== npc.lanternHalo && child !== npc.lanternBulb) {
            child.visible = false;
          }
        }
        npc.holder.add(model);
        npc.holder.updateMatrixWorld(true);
        npc.model = model;

        if (findForgeExtras(model)) {
          npc.rig = forgeRig(model);
        }
        if (walkFbx && walkFbx.animations[0]) {
          try {
            const walkClip = retarget(model, walkFbx, walkFbx.animations[0], `walk_${v.glb}`, CMU_TO_CONTRACT);
            const idleClip = THREE.AnimationUtils.subclip(walkClip, `idle_${v.glb}`, 0, 8, 30);
            const mixer = new THREE.AnimationMixer(model);
            const idleAct = mixer.clipAction(idleClip);
            const walkAct = mixer.clipAction(walkClip);
            idleAct.timeScale = 0.32 + (v.pos[0] % 3) * 0.03;
            idleAct.setEffectiveWeight(0.14); // upright breathing stance!
            walkAct.setEffectiveWeight(0);
            idleAct.play();
            walkAct.play();
            mixer.setTime((Math.abs(v.pos[0] * 7 + v.pos[1] * 3) % 10) * 0.08);
            npc.mixer = mixer;
            npc.idleAct = idleAct;
            npc.walkAct = walkAct;
          } catch {
            npc.mixer = null;
          }
        }
        loadedCount++;
        onLoaded?.(v.id);
      } catch (err) {
        console.warn('[villagers] failed to load', url, err);
      }
    };
    for (let i = 0; i < ordered.length; i += 3) {
      await Promise.all(ordered.slice(i, i + 3).map(loadOne));
    }
  })();

  const angleDiff = (a: number, b: number) => {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  };

  return {
    get loadedCount() {
      return loadedCount;
    },
    getPosition(id: string): [number, number] {
      const n = byId.get(id);
      return n ? [n.x, n.z] : [0, 0];
    },
    isSleepingHome(id: string): boolean {
      return Boolean(byId.get(id)?.atHome);
    },
    update(dt, t, playerX, playerZ, dayPhase, heightAt) {
      if (dt <= 0) return;
      const isNight = dayPhase === 'night';
      const isDusk = dayPhase === 'dusk';

      for (const n of npcs) {
        const v = n.def;
        // Night-watch guard lantern glows warmly at Dusk & Night
        if (n.lanternHalo && n.lanternBulb) {
          const lit = isNight ? 1 : isDusk ? 0.65 : 0;
          (n.lanternHalo.material as THREE.SpriteMaterial).opacity = lit * 0.82;
          (n.lanternBulb.material as THREE.MeshStandardMaterial).emissiveIntensity = lit * 2.4;
        }

        // Daily schedule target:
        // - Non-guard villagers head home at Dusk, rest inside their cottage at Night, emerge at Dawn!
        // - Bram the Guard patrols continuously day & night with his lantern!
        const goHome = (isDusk || isNight) && !v.nightWatch;
        let tx = v.pos[0];
        let tz = v.pos[1];
        let moveSpeed = v.routine === 'courier' ? 3.2 : v.routine === 'play' ? 2.4 : v.routine === 'patrol' ? 2.0 : 1.55;

        if (goHome) {
          tx = v.homePos[0];
          tz = v.homePos[1];
          moveSpeed = 2.6;
        } else {
          n.atHome = false;
          const wps = v.waypoints && v.waypoints.length ? v.waypoints : [v.pos];
          const wp = wps[n.wpIdx % wps.length]!;
          tx = wp[0];
          tz = wp[1];
        }

        const dxP = playerX - n.x;
        const dzP = playerZ - n.z;
        const distPlayer = Math.hypot(dxP, dzP);
        const greeting = distPlayer < 5.5 && !goHome;

        let speedNow = 0;
        const dx = tx - n.x;
        const dz = tz - n.z;
        const distTarget = Math.hypot(dx, dz);

        if (goHome && isNight && distTarget < 1.1) {
          // Safely tucked inside their warmly lit cottage for the night!
          n.atHome = true;
          n.holder.visible = false;
          n.x = v.homePos[0];
          n.z = v.homePos[1];
          continue;
        }
        n.holder.visible = true;

        if (!greeting && distTarget > 0.35 && (goHome || !n.working)) {
          const step = Math.min(distTarget, moveSpeed * dt);
          n.x += (dx / distTarget) * step;
          n.z += (dz / distTarget) * step;
          speedNow = step / Math.max(dt, 1e-4);
          const moveYaw = Math.atan2(dx, dz);
          n.yaw += angleDiff(moveYaw, n.yaw) * Math.min(1, dt * 6);
        } else if (!goHome) {
          if (distTarget <= 0.35 && !n.working) {
            // Arrived at craft station — spend natural time doing their trade!
            n.working = true;
            n.pauseT = v.routine === 'courier' ? 1.8 : v.routine === 'patrol' ? 2.2 : 3.2 + ((n.phase * 1.3) % 2.4);
          } else if (n.working && !greeting) {
            n.pauseT -= dt;
            if (n.pauseT <= 0) {
              n.working = false;
              n.wpIdx = (n.wpIdx + 1) % (v.waypoints?.length || 1);
            }
          }
          if (greeting) {
            const greetYaw = Math.atan2(dxP, dzP);
            n.yaw += angleDiff(greetYaw, n.yaw) * Math.min(1, dt * 5);
          }
        }

        const gy = heightAt(n.x, n.z);
        // Subtle living trade motion when working at station (forging rhythm, bard sway, child hop)
        let bobY = 0;
        let swayZ = 0;
        if (speedNow < 0.15 && !greeting) {
          if (v.routine === 'forge') swayZ = Math.sin(t * 5.2 + n.phase) * 0.045;
          else if (v.routine === 'perform') swayZ = Math.sin(t * 2.2 + n.phase) * 0.04;
          else if (v.routine === 'play') bobY = Math.max(0, Math.sin(t * 3.8 + n.phase)) * 0.08;
        }
        n.holder.position.set(n.x, gy + bobY, n.z);
        n.holder.rotation.set(0, n.yaw, swayZ);

        // Distance-cull heavy 58-joint skeleton updates beyond 42 m for smooth 60 fps
        if (distPlayer > 42) continue;
        if (n.mixer && n.idleAct && n.walkAct) {
          const walkW = Math.min(0.85, speedNow / 2.2);
          n.walkAct.setEffectiveWeight(walkW);
          n.walkAct.setEffectiveTimeScale(Math.max(0.7, speedNow / 1.5));
          n.idleAct.setEffectiveWeight(0.14 * (1 - walkW));
          n.mixer.update(dt);
        }
        n.rig?.update(dt);
      }
    },
  };
}
