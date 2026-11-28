// Living Villages, Wild Villagers & Demon Fortress Occupation / Liberation in Elderwood.
//
// Four distinct villages across Elderwood Wilds (large towns & small hamlets):
//   1. Westwood Settlement     (-395, -55)  — Large farming & stone-tower town with glowing crop fields
//   2. Treehouse Canopy Village (-330, -195) — Elevated canopy sanctuary with forest hunters & foragers below
//   3. Mangrove Mire Hamlet    (-330, 620)  — Small boardwalk marsh village
//   4. Zone 05 Rim Outpost     (262, 342)   — Small cliffside watch-hamlet overlooking Great Falls
//
// Dynamic World Behavior:
//   · When Forest Health is Healthy / Recovering: villagers farm crops, hunt & forage in the nearby wilds,
//     and occasionally come under Demon Raid — you can CHOOSE to defend them or stay focused on your trial!
//   · When Forest Health is Bad (Blighted / Struggling): 2–3 villages start occupied as Demon Fortresses
//     (crimson Rift Obelisk banner, dark corruption smoke, Demon Garrison + Champion/Overlord). Slaying the
//     garrison liberates the village (+18% Forest Health, +20 Soul Light, full heal, Living Waters & Pure Seeds).
import * as THREE from 'three/webgpu';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadCharacterAsset } from '../characters';
import type { Recipe, VfxSystem } from '../../../../services/vfx';
import type { DemonDirector, DemonClassId } from './demons';
import type { DangerAudio } from './audio';
import { forest } from './forest';

export type VillageState = 'free' | 'raided' | 'occupied';

export interface VillageSpec {
  id: string;
  name: string;
  size: 'small' | 'large';
  x: number;
  z: number;
  radius: number;
  hasFarm: boolean;
  /** Wild hunting/foraging excursion spots around the village. */
  wildSpots: [number, number][];
}

export const ELDERWOOD_VILLAGES: readonly VillageSpec[] = [
  {
    id: 'settlement', name: 'Westwood Settlement', size: 'large', x: -395, z: -55, radius: 34, hasFarm: true,
    wildSpots: [[-355, -25], [-435, -10], [-370, -105]],
  },
  {
    id: 'treehouse', name: 'Treehouse Village', size: 'large', x: -330, z: -195, radius: 36, hasFarm: true,
    wildSpots: [[-285, -185], [-365, -240], [-305, -145]],
  },
  {
    id: 'mire', name: 'Mangrove Mire Hamlet', size: 'small', x: -330, z: 620, radius: 28, hasFarm: false,
    wildSpots: [[-295, 590], [-355, 650]],
  },
  {
    id: 'outpost', name: 'Zone 05 Rim Outpost', size: 'small', x: 262, z: 342, radius: 24, hasFarm: false,
    wildSpots: [[245, 305], [235, 275]],
  },
];

/** Pure helper: how many Elderwood villages start occupied as Demon Fortresses based on Forest Health (0..100). */
export function initialOccupiedVillageCount(health: number): number {
  if (health < 30) return 3;
  if (health < 60) return 2;
  if (health < 85) return 1;
  return 0;
}

const LIBERATE_VFX: Recipe = {
  id: 'village_liberate',
  light: { color: 0xfef08a, intensity: 30, range: 28, life: 1.0 },
  emitters: [
    { layer: 'add', shape: 'ring', count: 2, life: 1.2, speed: 0, size: [1, 24], color: [0xfff3b0, 0x4ade80], intensity: 1.6, alpha: [0.95, 0] },
    { layer: 'add', shape: 'soft', count: [36, 48], life: [1.4, 2.4], speed: [3, 9], spread: Math.PI, radius: 3, size: [0.22, 0.04], color: [0xfff8d6, 0x38bdf8], intensity: 2.6, gravity: -1.4 },
  ],
};

const BANNER_POLE_GEO = new THREE.CylinderGeometry(0.22, 0.34, 8.5, 8);
const BANNER_GEM_GEO = new THREE.OctahedronGeometry(0.95, 0);
const CROP_MOUND_GEO = new THREE.BoxGeometry(1.1, 0.24, 3.6);
const CROP_SPROUT_GEO = new THREE.ConeGeometry(0.22, 0.72, 6);
const VILLAGER_FALLBACK_GEO = new THREE.CapsuleGeometry(0.32, 1.0, 4, 8);
const ALLY_HALO_GEO = new THREE.RingGeometry(0.55, 0.72, 20).rotateX(-Math.PI / 2);

const VILLAGER_ASSETS = ['female_warrior', 'sorceress', 'lumen', 'dragon_knight'] as const;

interface Villager {
  mesh: THREE.Group;
  fallback: THREE.Mesh;
  role: 'farmer' | 'hunter' | 'scout';
  assetId: string;
  modelState: 'none' | 'loading' | 'loaded';
  home: THREE.Vector3;
  goal: THREE.Vector3;
  waitT: number;
  mixer: THREE.AnimationMixer | null;
  idleAct: THREE.AnimationAction | null;
  walkAct: THREE.AnimationAction | null;
}

interface VillageInstance {
  spec: VillageSpec;
  state: VillageState;
  center: THREE.Vector3;
  beaconGroup: THREE.Group;
  gemMesh: THREE.Mesh;
  villagers: Villager[];
  garrisonSpawned: boolean;
  alertedPlayer: boolean;
  raidCd: number;
  giftCd: number;
}

export interface VillageEnv {
  scene: THREE.Scene;
  vfx: VfxSystem;
  audio: DangerAudio;
  demons: DemonDirector;
  lo: boolean;
  wilds: boolean;
  ground(x: number, z: number): number;
  initialForestHealth: number;
  onVillageSaved(v: VillageSpec, wasFortress: boolean): void;
  onVillageGift(v: VillageSpec): void;
  say(text: string, color: string): void;
}

export class VillageDirector {
  readonly group = new THREE.Group();
  readonly list: VillageInstance[] = [];
  private clock = 0;
  private activeModelLoads = 0;
  private poleMat = new THREE.MeshStandardNodeMaterial({ color: 0x3b3530, roughness: 0.75, metalness: 0.35 });
  private soilMat = new THREE.MeshStandardNodeMaterial({ color: 0x362417, roughness: 0.95 });
  private cropMat = new THREE.MeshStandardNodeMaterial({ color: 0x4ca848, emissive: 0x86efac, emissiveIntensity: 0.35, roughness: 0.65 });
  private villagerFallbackMat = new THREE.MeshStandardNodeMaterial({ color: 0x4a5568, emissive: 0xd9b26a, emissiveIntensity: 0.35, roughness: 0.6 });
  private allyHaloMat = new THREE.MeshBasicNodeMaterial({ color: 0xfde68a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  private gemMatFree = new THREE.MeshStandardNodeMaterial({ color: 0xd9b26a, emissive: 0xfbbf24, emissiveIntensity: 1.5, roughness: 0.25 });
  private gemMatThreat = new THREE.MeshStandardNodeMaterial({ color: 0x991b1b, emissive: 0xff2a36, emissiveIntensity: 1.5, roughness: 0.25 });

  constructor(private env: VillageEnv) {
    this.group.name = 'danger-villages';
    env.scene.add(this.group);
    if (!env.wilds) return;

    const occCount = initialOccupiedVillageCount(env.initialForestHealth);
    ELDERWOOD_VILLAGES.forEach((spec, idx) => {
      const y = env.ground(spec.x, spec.z);
      const center = new THREE.Vector3(spec.x, y, spec.z);
      const state: VillageState = idx < occCount ? 'occupied' : 'free';

      // Central Village / Demon Fortress Beacon Obelisk (warm amber-gold when free, crimson Rift Fortress when occupied)
      const beaconGroup = new THREE.Group();
      beaconGroup.position.set(spec.x, y, spec.z);
      const pole = new THREE.Mesh(BANNER_POLE_GEO, this.poleMat);
      pole.position.y = 4.25;
      const gem = new THREE.Mesh(BANNER_GEM_GEO, state === 'occupied' ? this.gemMatThreat : this.gemMatFree);
      gem.position.y = 9.2;
      gem.name = 'beacon-gem';
      beaconGroup.add(pole, gem);
      this.group.add(beaconGroup);

      // Farm rows next to large agricultural villages
      if (spec.hasFarm) {
        const fx0 = spec.x + 18, fz0 = spec.z + 18;
        for (let r = 0; r < 4; r++) {
          const rx = fx0 + r * 2.4, rz = fz0;
          const ry = env.ground(rx, rz);
          const mound = new THREE.Mesh(CROP_MOUND_GEO, this.soilMat);
          mound.position.set(rx, ry + 0.12, rz);
          this.group.add(mound);
          for (let c = -1; c <= 1; c++) {
            const sprout = new THREE.Mesh(CROP_SPROUT_GEO, this.cropMat);
            sprout.position.set(rx, ry + 0.52, rz + c * 1.05);
            this.group.add(sprout);
          }
        }
      }

      const inst: VillageInstance = {
        spec, state, center, beaconGroup, gemMesh: gem, villagers: [],
        garrisonSpawned: false, alertedPlayer: false,
        raidCd: 45 + idx * 32, giftCd: 0,
      };
      this.populateVillagers(inst);
      this.list.push(inst);
    });
  }

  private populateVillagers(v: VillageInstance) {
    const count = v.spec.size === 'large' ? (this.env.lo ? 3 : 4) : 2;
    const roles: Villager['role'][] = v.spec.hasFarm ? ['farmer', 'hunter', 'farmer', 'scout'] : ['hunter', 'scout'];
    for (let i = 0; i < count; i++) {
      const role = roles[i % roles.length];
      const spot = role === 'hunter' && v.spec.wildSpots[i % v.spec.wildSpots.length]
        ? v.spec.wildSpots[i % v.spec.wildSpots.length]
        : [v.spec.x + (i - 1) * 6 + 4, v.spec.z + (i % 2 ? 16 : -6)];
      const gy = this.env.ground(spot[0], spot[1]);
      const mesh = new THREE.Group();
      mesh.position.set(spot[0], gy, spot[1]);

      const fallback = new THREE.Mesh(VILLAGER_FALLBACK_GEO, this.villagerFallbackMat);
      fallback.position.y = 0.9;
      const halo = new THREE.Mesh(ALLY_HALO_GEO, this.allyHaloMat);
      halo.position.y = 0.08;
      mesh.add(fallback, halo);
      // Hide villagers inside occupied fortresses until liberated!
      mesh.visible = v.state !== 'occupied';
      this.group.add(mesh);

      const assetId = VILLAGER_ASSETS[(i + v.spec.name.length) % VILLAGER_ASSETS.length];
      const vil: Villager = {
        mesh, fallback, role, assetId, modelState: 'none',
        home: new THREE.Vector3(spot[0], gy, spot[1]),
        goal: new THREE.Vector3(spot[0], gy, spot[1]),
        waitT: 2 + Math.random() * 4,
        mixer: null, idleAct: null, walkAct: null,
      };
      v.villagers.push(vil);
    }
  }

  private async attachVillagerModel(vil: Villager) {
    if (vil.modelState !== 'none') return;
    vil.modelState = 'loading';
    this.activeModelLoads++;
    try {
      const asset = await loadCharacterAsset(vil.assetId);
      if (!asset) { vil.modelState = 'loaded'; return; }
      const cloned = SkeletonUtils.clone(asset.scene);
      cloned.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(cloned);
      const s = 1.82 / Math.max(0.2, box.max.y - box.min.y);
      cloned.scale.setScalar(s);
      cloned.position.y = -box.min.y * s;
      const mixer = new THREE.AnimationMixer(cloned);
      const clips = new Map(asset.clips.map((c) => [c.name.toLowerCase(), mixer.clipAction(c)]));
      const idle = clips.get('idle') ?? clips.get('hero_idle') ?? null;
      const walk = clips.get('walk') ?? null;
      if (idle) { idle.setLoop(THREE.LoopRepeat, Infinity).play(); idle.setEffectiveWeight(1); }
      if (walk && walk !== idle) { walk.setLoop(THREE.LoopRepeat, Infinity).play(); walk.setEffectiveWeight(0); }
      vil.mixer = mixer; vil.idleAct = idle; vil.walkAct = walk;
      vil.fallback.visible = false;
      vil.mesh.add(cloned);
      vil.modelState = 'loaded';
    } catch {
      vil.modelState = 'loaded'; /* keep clean fallback */
    } finally {
      this.activeModelLoads = Math.max(0, this.activeModelLoads - 1);
    }
  }

  private spawnFortressGarrison(v: VillageInstance) {
    v.garrisonSpawned = true;
    const tag = `village:${v.spec.id}`;
    const squad: DemonClassId[] = v.spec.size === 'large'
      ? ['pyre_champion', 'ashen_ravager', 'ashen_ravager', 'blight_harrier']
      : ['pyre_champion', 'rift_stalker', 'blight_harrier'];
    this.env.demons.spawnSquad(squad, v.center, 15, tag, v.center);
  }

  private liberate(v: VillageInstance, wasFortress: boolean) {
    v.state = 'free';
    v.garrisonSpawned = false;
    v.raidCd = 140;
    v.gemMesh.material = this.gemMatFree;
    for (const vil of v.villagers) vil.mesh.visible = true;
    this.env.vfx.spawn(LIBERATE_VFX, v.center.clone().setY(v.center.y + 1.5));
    this.env.audio.play('zap', v.center, { gain: 0.7, rate: 1.9 });
    forest.notify('village-freed', v.center, { id: v.spec.id, name: v.spec.name, wasFortress }, 'player');
    this.env.onVillageSaved(v.spec, wasFortress);
  }

  /** Active village status banner hint if player is near an occupied fortress or raided settlement. */
  activeAlert(playerPos: THREE.Vector3): string | null {
    for (const v of this.list) {
      const d = Math.hypot(v.center.x - playerPos.x, v.center.z - playerPos.z);
      if (d < 130 && v.state === 'occupied') {
        const left = this.env.demons.countByTag(`village:${v.spec.id}`);
        return `${v.spec.name.toUpperCase()} OCCUPIED (${left || '?'} DEMONS) · LIBERATE OR BYPASS`;
      }
      if (d < 140 && v.state === 'raided') {
        const left = this.env.demons.countByTag(`village:${v.spec.id}`);
        return `${v.spec.name.toUpperCase()} UNDER RAID (${left} LEFT) · DEFEND OR CONTINUE`;
      }
    }
    return null;
  }

  update(dt: number, playerPos: THREE.Vector3) {
    this.clock += dt;
    for (const v of this.list) {
      const gem = v.gemMesh;
      gem.rotation.y += dt * (v.state === 'free' ? 0.8 : 2.4);
      gem.position.y = 9.2 + Math.sin(this.clock * 2.2) * 0.35;

      const dist = Math.hypot(v.center.x - playerPos.x, v.center.z - playerPos.z);
      v.giftCd = Math.max(0, v.giftCd - dt);

      // Occupied Demon Fortress: spawn garrison when player approaches within 115 m, liberate once all are slain!
      if (v.state === 'occupied') {
        if (!v.garrisonSpawned && dist < 115) {
          this.spawnFortressGarrison(v);
        }
        if (dist < 95 && !v.alertedPlayer) {
          v.alertedPlayer = true;
          this.env.say(`${v.spec.name.toUpperCase()} IS A DEMON FORTRESS · CLEAR GARRISON TO LIBERATE (OPTIONAL)`, '#fb7185');
        }
        if (v.garrisonSpawned && this.env.demons.countByTag(`village:${v.spec.id}`) === 0) {
          this.liberate(v, true);
        }
      } else if (v.state === 'raided') {
        if (this.env.demons.countByTag(`village:${v.spec.id}`) === 0) {
          this.liberate(v, false);
        }
      } else {
        // Free village: optional dynamic raid when player wanders within 130 m
        if (dist < 130) {
          v.raidCd -= dt;
          if (v.raidCd <= 0) {
            v.raidCd = 180;
            v.state = 'raided';
            v.gemMesh.material = this.gemMatThreat;
            const raid: DemonClassId[] = ['ashen_ravager', 'rift_stalker', 'blight_harrier'];
            const rx = v.center.x + 28, rz = v.center.z + 20;
            this.env.demons.spawnSquad(raid, new THREE.Vector3(rx, 0, rz), 10, `village:${v.spec.id}`, v.center);
            this.env.say(`SIDE QUEST · ${v.spec.name.toUpperCase()} UNDER DEMON RAID · DEFEND OR IGNORE`, '#fbbf24');
          }
          // Friendly grateful village gift when walking right into a free settlement
          if (dist < 18 && v.giftCd <= 0) {
            v.giftCd = 150;
            this.env.onVillageGift(v.spec);
          }
        }
      }

      // Stream & animate friendly villagers ONLY when the player approaches within 145 m (zero boot GLB cost!)
      if (v.state !== 'occupied' && dist < 145) {
        for (const vil of v.villagers) {
          if (vil.modelState === 'none' && this.activeModelLoads < 1) {
            void this.attachVillagerModel(vil);
          }
          const dx = vil.goal.x - vil.mesh.position.x, dz = vil.goal.z - vil.mesh.position.z;
          const d = Math.hypot(dx, dz);
          let walking = false;
          if (d > 1.2) {
            const spd = vil.role === 'hunter' ? 2.6 : 1.7;
            vil.mesh.position.x += (dx / d) * spd * dt;
            vil.mesh.position.z += (dz / d) * spd * dt;
            vil.mesh.position.y = this.env.ground(vil.mesh.position.x, vil.mesh.position.z);
            vil.mesh.rotation.y = Math.atan2(dx, dz);
            walking = true;
          } else if ((vil.waitT -= dt) <= 0) {
            vil.waitT = 3 + Math.random() * 5;
            if (vil.role === 'hunter' && v.spec.wildSpots.length) {
              const s = Math.random() < 0.55 ? v.spec.wildSpots[Math.floor(Math.random() * v.spec.wildSpots.length)] : [v.spec.x, v.spec.z];
              vil.goal.set(s[0] + (Math.random() - 0.5) * 14, 0, s[1] + (Math.random() - 0.5) * 14);
            } else if (vil.role === 'farmer' && v.spec.hasFarm) {
              vil.goal.set(v.spec.x + 16 + Math.random() * 10, 0, v.spec.z + 15 + Math.random() * 7);
            } else {
              const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * (v.spec.radius * 0.55);
              vil.goal.set(v.spec.x + Math.cos(a) * r, 0, v.spec.z + Math.sin(a) * r);
            }
          }
          if (vil.mixer) {
            if (vil.walkAct && vil.idleAct && vil.walkAct !== vil.idleAct) {
              vil.walkAct.setEffectiveWeight(walking ? 1 : 0);
              vil.idleAct.setEffectiveWeight(walking ? 0 : 1);
            }
            vil.mixer.update(dt);
          }
        }
      }
    }
  }

  info() {
    return this.list.map((v) => ({ id: v.spec.id, name: v.spec.name, state: v.state }));
  }
}
