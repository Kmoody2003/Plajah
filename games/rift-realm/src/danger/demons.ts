// Adversarial Demon Forces of the Rift Realms (Lucifer's corrupting legions in Elderwood).
//
// Five distinct Demon Classes inspired by the Grovewarden battle motion studies:
//   1. Rift Stalker       (panther_demon)        — fast quadruped skirmisher packs flanking & scorching groves
//   2. Blight Harrier     (cyber_harpy)          — winged aerial corrupter raining crimson void-ember bolts
//   3. Ashen Ravager      (shadow_assassin)      — aggressive dual-blade horde warrior rushing Wardens & Vessels
//   4. Pyre-Blade Champion (demon_warrior)       — towering lone dark opponent & Demon Fortress captain
//   5. Abyssal Siege Titan (magma_titan / fallen_archangel) — colossal overlord clashing directly with Grovewardens
//
// Live world integration:
//   · Demon density scales dynamically with Forest Health (heaviest in Blighted forests, rare scouts in Thriving).
//   · Demon warbands & Siege Titans actively attack roaming Grovewardens; helping a Warden fight earns permanent
//     Sworn Friend status so you can summon that Warden into battle anywhere!
//   · Lone dark Champions roam the wild trails for surprise 1v1 duels; village garrisons & raids call spawnSquad().
import * as THREE from 'three/webgpu';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadCharacterAsset } from '../characters';
import type { VfxSystem, Recipe } from '../../../../services/vfx';
import { KILL_BURST } from '../../../../services/vfx';
import type { DangerAudio } from './audio';
import type { PlayerStatus } from './status';
import { forest } from './forest';

export type DemonClassId = 'rift_stalker' | 'blight_harrier' | 'ashen_ravager' | 'pyre_champion' | 'siege_titan';

export interface DemonClassSpec {
  id: DemonClassId;
  name: string;
  assetId: string;
  height: number;
  hp: number;
  dmg: number;
  speed: number;
  range: number;
  hover: number;
  ranged: boolean;
  boss: boolean;
  xp: number;
  auraColor: number;
  /** Motion-study inspiration note (matches the Grovewarden battle clips). */
  motionRef: string;
}

export const DEMON_CLASSES: Record<DemonClassId, DemonClassSpec> = {
  rift_stalker: {
    id: 'rift_stalker', name: 'Rift Stalker', assetId: 'panther_demon',
    height: 1.42, hp: 70, dmg: 12, speed: 9.8, range: 2.8, hover: 0, ranged: false, boss: false, xp: 30,
    auraColor: 0xe11d48, motionRef: 'Quadruped skirmisher swarm darting beneath Willow & Mangrove Wardens',
  },
  blight_harrier: {
    id: 'blight_harrier', name: 'Blight Harrier', assetId: 'cyber_harpy',
    height: 2.1, hp: 85, dmg: 14, speed: 7.4, range: 20, hover: 3.4, ranged: true, boss: false, xp: 38,
    auraColor: 0xf97316, motionRef: 'Winged aerial corrupter harassing Pine Sentinel & Cherry Blossom canopies',
  },
  ashen_ravager: {
    id: 'ashen_ravager', name: 'Ashen Ravager', assetId: 'shadow_assassin',
    height: 1.98, hp: 105, dmg: 16, speed: 7.2, range: 3.1, hover: 0, ranged: false, boss: false, xp: 44,
    auraColor: 0xdc2626, motionRef: 'Dual-blade demon legionnaire leaping & slashing in Willow/Mangrove battle clips',
  },
  pyre_champion: {
    id: 'pyre_champion', name: 'Pyre-Blade Champion', assetId: 'demon_warrior',
    height: 2.55, hp: 230, dmg: 26, speed: 6.2, range: 3.8, hover: 0, ranged: false, boss: true, xp: 95,
    auraColor: 0xff3b2f, motionRef: 'Armored horned lone dark opponent & Demon Fortress warlord',
  },
  siege_titan: {
    id: 'siege_titan', name: 'Abyssal Siege Titan', assetId: 'magma_titan',
    height: 4.6, hp: 460, dmg: 38, speed: 4.8, range: 5.5, hover: 0, ranged: false, boss: true, xp: 185,
    auraColor: 0xff1e2d, motionRef: 'Colossal demon titan wrestling Ancient Oak, Ironwood & Sequoia Grovewardens',
  },
};

/** Pure helper: target max live demons across Elderwood based on current Forest Health (0..100). */
export function demonBudgetForHealth(health: number, lo = false): number {
  const base = health < 30 ? 22 : health < 60 ? 15 : health < 85 ? 10 : 6;
  return lo ? Math.max(4, Math.round(base * 0.65)) : base;
}

const DEMON_BOLT_GEO = new THREE.IcosahedronGeometry(0.22, 1);
const DEMON_BOLT_MAT = new THREE.MeshBasicNodeMaterial({ color: 0xff3b2f });
const DEMON_HIT_GEO = new THREE.CylinderGeometry(0.68, 0.68, 2.2, 8);
const DEMON_HIT_MAT = new THREE.MeshBasicNodeMaterial({ visible: false });
const DEMON_FALLBACK_GEO = new THREE.CapsuleGeometry(0.42, 1.1, 4, 8);
const DEMON_RING_GEO = new THREE.RingGeometry(0.9, 1.2, 24).rotateX(-Math.PI / 2);

const DEMON_SPAWN_VFX: Recipe = {
  id: 'demon_spawn',
  light: { color: 0xff2a36, intensity: 18, range: 14, life: 0.45 },
  emitters: [
    { layer: 'add', shape: 'ring', count: 1, life: 0.65, speed: 0, size: [0.4, 4.2], color: [0xff6a3a, 0x991b1b], intensity: 1.5, alpha: [0.9, 0] },
    { layer: 'alpha', shape: 'smoke', count: [6, 10], life: [1.0, 1.8], speed: [1.2, 3.2], spread: 0.8, radius: 0.6, size: [0.6, 1.8], color: [0x2a080c, 0x090204], alpha: [0.65, 0], lift: [0.8, 1.8] },
  ],
};
const DEMON_SLAM_VFX: Recipe = {
  id: 'demon_slam',
  light: { color: 0xff3a1a, intensity: 24, range: 16, life: 0.4 },
  emitters: [
    { layer: 'add', shape: 'ring', count: 1, life: 0.5, speed: 0, size: [0.8, 7.5], color: [0xff8a3a, 0xdc2626], intensity: 1.8, alpha: [0.95, 0] },
    { layer: 'add', shape: 'spark', count: [16, 22], life: [0.35, 0.7], speed: [4, 11], spread: Math.PI * 0.5, size: [0.14, 0.03], color: [0xffd080, 0xff2a1a], intensity: 2.5, gravity: 11 },
  ],
};

let nextDemonId = 300000; // distinct from enemies (1..), predators (100000..), prey (200000..)

export interface Demon {
  id: number;
  kind: DemonClassId;
  spec: DemonClassSpec;
  who: string;
  boss: boolean;
  mesh: THREE.Group;
  hitTarget: THREE.Mesh;
  hp: number;
  maxHp: number;
  alive: boolean;
  tag: string; // 'roam' | 'warden-assault' | 'lone' | 'village:<id>'
  home: THREE.Vector3;
  goal: THREE.Vector3 | null;
  targetWardenId: number | null;
  state: 'patrol' | 'chase' | 'windup' | 'recover';
  stateT: number;
  atkCd: number;
  stunT: number;
  mixer: THREE.AnimationMixer | null;
  idleAct: THREE.AnimationAction | null;
  moveAct: THREE.AnimationAction | null;
  atkAct: THREE.AnimationAction | null;
  rigged: boolean;
  fallback: THREE.Mesh;
  ring: THREE.Mesh;
  ringMat: THREE.MeshBasicNodeMaterial;
  pos: THREE.Vector3;
  chest(out: THREE.Vector3): THREE.Vector3;
}

interface DemonBolt {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  dmg: number;
}

export interface DemonEnv {
  scene: THREE.Scene;
  vfx: VfxSystem;
  audio: DangerAudio;
  status: PlayerStatus;
  lo: boolean;
  wilds: boolean;
  ground(x: number, z: number): number;
  resolve(p: THREE.Vector3, r: number, h: number): void;
  hurtPlayer(dmg: number, why: string): void;
  forestHealth(): number;
  wardens(): { id: number; kind: string; pos: THREE.Vector3; hp?: number }[];
  onHelpedWarden(wardenId: number, killed: boolean, isBoss: boolean, pos: THREE.Vector3): void;
  onDemonKilled(d: Demon, byPlayer: boolean): void;
  say(text: string, color: string): void;
}

export class DemonDirector {
  readonly group = new THREE.Group();
  readonly list: Demon[] = [];
  private bolts: DemonBolt[] = [];
  private spawnT = 5;
  private duelT = 22;
  private clock = 0;
  private v = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private fallbackMats = new Map<number, THREE.MeshStandardNodeMaterial>();
  private ringMats = new Map<number, THREE.MeshBasicNodeMaterial>();

  constructor(private env: DemonEnv) {
    this.group.name = 'danger-demons';
    env.scene.add(this.group);
  }

  private fallbackMat(hex: number) {
    let m = this.fallbackMats.get(hex);
    if (!m) {
      m = new THREE.MeshStandardNodeMaterial({ color: 0x16090c, roughness: 0.55, metalness: 0.35, emissive: hex, emissiveIntensity: 0.65 });
      this.fallbackMats.set(hex, m);
    }
    return m;
  }

  private ringMatFor(hex: number) {
    let m = this.ringMats.get(hex);
    if (!m) {
      m = new THREE.MeshBasicNodeMaterial({ color: hex, transparent: true, opacity: 0.38, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      this.ringMats.set(hex, m);
    }
    return m;
  }

  /** Spawn a single demon of any of the 5 Demon Classes at (x, z). */
  spawnOne(kind: DemonClassId, x: number, z: number, tag = 'roam', goal?: THREE.Vector3 | null, wardenId: number | null = null): Demon {
    const spec = DEMON_CLASSES[kind];
    const y = this.env.ground(x, z) + spec.hover;
    const mesh = new THREE.Group();
    mesh.position.set(x, y, z);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    mesh.name = `demon-${kind}`;

    const fallback = new THREE.Mesh(DEMON_FALLBACK_GEO, this.fallbackMat(spec.auraColor));
    fallback.scale.setScalar(spec.height / 1.9);
    fallback.position.y = spec.height * 0.5;
    mesh.add(fallback);

    const ringMat = this.ringMatFor(spec.auraColor);
    const ring = new THREE.Mesh(DEMON_RING_GEO, ringMat);
    ring.position.y = 0.08 - spec.hover;
    ring.scale.setScalar(spec.boss ? 1.85 : 1.05);
    mesh.add(ring);

    const id = nextDemonId++;
    const hitTarget = new THREE.Mesh(DEMON_HIT_GEO, DEMON_HIT_MAT);
    hitTarget.scale.set(spec.boss ? 1.55 : 1.05, spec.height / 2.2, spec.boss ? 1.55 : 1.05);
    hitTarget.position.y = spec.height * 0.5;
    hitTarget.userData.demonId = id;
    mesh.add(hitTarget);

    const d: Demon = {
      id, kind, spec, who: spec.name, boss: spec.boss,
      mesh, hitTarget, hp: spec.hp, maxHp: spec.hp, alive: true,
      tag, home: new THREE.Vector3(x, y, z), goal: goal ? goal.clone() : null,
      targetWardenId: wardenId, state: 'patrol', stateT: 0, atkCd: 1.2 + Math.random() * 1.4, stunT: 0,
      mixer: null, idleAct: null, moveAct: null, atkAct: null, rigged: false,
      fallback, ring, ringMat, pos: mesh.position,
      chest: (out) => out.copy(mesh.position).setY(mesh.position.y + spec.height * 0.6),
    };

    this.group.add(mesh);
    this.list.push(d);
    this.env.vfx.spawn(DEMON_SPAWN_VFX, this.v.set(x, this.env.ground(x, z) + 0.3, z));
    void this.attachRiggedModel(d);
    return d;
  }

  /** Spawn a coordinated Demon Squad (village garrison, raid party, or Warden assault horde). */
  spawnSquad(kinds: DemonClassId[], center: THREE.Vector3, radius: number, tag: string, goal?: THREE.Vector3 | null, wardenId: number | null = null): Demon[] {
    const out: Demon[] = [];
    kinds.forEach((k, i) => {
      const a = (i / Math.max(1, kinds.length)) * Math.PI * 2 + Math.random() * 0.5;
      const r = radius * (0.45 + Math.random() * 0.55);
      out.push(this.spawnOne(k, center.x + Math.cos(a) * r, center.z + Math.sin(a) * r, tag, goal, wardenId));
    });
    return out;
  }

  private async attachRiggedModel(d: Demon) {
    try {
      const asset = await loadCharacterAsset(d.spec.assetId);
      if (!asset || !d.alive) return;
      const cloned = SkeletonUtils.clone(asset.scene);
      cloned.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(cloned);
      const rawH = Math.max(0.2, box.max.y - box.min.y);
      const s = d.spec.height / rawH;
      cloned.scale.setScalar(s);
      cloned.position.y = -box.min.y * s;
      cloned.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) { m.castShadow = !this.env.lo; m.receiveShadow = true; m.frustumCulled = false; }
      });

      const mixer = new THREE.AnimationMixer(cloned);
      const byName = new Map<string, THREE.AnimationAction>();
      for (const c of asset.clips) byName.set(c.name.toLowerCase(), mixer.clipAction(c));
      const idle = byName.get('combat_idle') ?? byName.get('idle') ?? byName.get('hero_idle') ?? (asset.clips[0] ? mixer.clipAction(asset.clips[0]) : null);
      const move = byName.get('run') ?? byName.get('walk') ?? byName.get('sprint') ?? idle;
      const atk = byName.get('heavy_1') ?? byName.get('attack_1') ?? byName.get('light_1') ?? null;
      if (idle) { idle.setLoop(THREE.LoopRepeat, Infinity).play(); idle.setEffectiveWeight(1); }
      if (move && move !== idle) { move.setLoop(THREE.LoopRepeat, Infinity).play(); move.setEffectiveWeight(0); }

      d.mixer = mixer; d.idleAct = idle; d.moveAct = move; d.atkAct = atk;
      d.rigged = true;
      d.fallback.visible = false;
      d.mesh.add(cloned);
    } catch { /* fallback mesh remains cleanly visible */ }
  }

  /** Nearest live Demon / Demon Horde to `from` (used by Mycelium Crimson Danger Alarm!). */
  nearestTo(from: THREE.Vector3, maxDist = 110): { pos: THREE.Vector3; label: string; dist: number; count: number } | null {
    let best: Demon | null = null;
    let bd = maxDist;
    let nearbyCount = 0;
    for (const d of this.list) {
      if (!d.alive) continue;
      const dist = d.pos.distanceTo(from);
      if (dist <= maxDist) nearbyCount++;
      if (dist < bd) { bd = dist; best = d; }
    }
    if (!best) return null;
    const label = nearbyCount >= 3 ? `${best.who} Horde (${nearbyCount})` : best.who;
    return { pos: best.pos, label, dist: bd, count: nearbyCount };
  }

  /** Apply damage to a Demon (from player shots/melee/surge OR a Grovewarden smash). */
  damage(id: number, dmg: number, from: THREE.Vector3 | null, knock = 0, byPlayer = true, hitstun = 0): { killed: boolean; pos: THREE.Vector3; demon: Demon } | null {
    const d = this.list.find((x) => x.id === id && x.alive);
    if (!d) return null;
    d.hp -= dmg;
    if (hitstun > 0) d.stunT = Math.max(d.stunT, hitstun);
    if (from && knock > 0) {
      const push = this.v.subVectors(d.pos, from).setY(0);
      if (push.lengthSq() > 1e-4) {
        push.normalize().multiplyScalar(knock * (d.boss ? 0.35 : 0.75));
        d.pos.x += push.x; d.pos.z += push.z;
      }
    }
    // Check if the player is assisting a Grovewarden fighting demons nearby!
    if (byPlayer) {
      const ws = this.env.wardens();
      let nearWarden: { id: number; dist: number } | null = null;
      for (const w of ws) {
        const wd = Math.hypot(w.pos.x - d.pos.x, w.pos.z - d.pos.z);
        if (wd < 85 && (!nearWarden || wd < nearWarden.dist)) nearWarden = { id: w.id, dist: wd };
      }
      if (nearWarden) this.env.onHelpedWarden(nearWarden.id, d.hp <= 0, d.boss, d.pos);
    }

    if (d.hp <= 0) {
      d.alive = false;
      const killPos = d.pos.clone();
      this.env.vfx.spawn(KILL_BURST, this.v.copy(killPos).setY(killPos.y + d.spec.height * 0.5), { tint: d.spec.auraColor });
      this.env.audio.play('erupt', killPos, { gain: d.boss ? 0.85 : 0.45, rate: d.boss ? 0.75 : 1.15 });
      this.group.remove(d.mesh);
      const idx = this.list.indexOf(d);
      if (idx >= 0) this.list.splice(idx, 1);
      this.env.onDemonKilled(d, byPlayer);
      return { killed: true, pos: killPos, demon: d };
    }
    return { killed: false, pos: d.pos.clone(), demon: d };
  }

  /** Area damage from Soul Surge or a Grovewarden's signature move. */
  areaHit(at: THREE.Vector3, radius: number, dmg: number, byPlayer: boolean, knock = 3, hitstun = 0.6): number {
    let kills = 0;
    for (const d of [...this.list]) {
      if (!d.alive) continue;
      if (Math.hypot(d.pos.x - at.x, d.pos.z - at.z) <= radius + (d.boss ? 1.5 : 0.6)) {
        if (this.damage(d.id, dmg, at, knock, byPlayer, hitstun)?.killed) kills++;
      }
    }
    return kills;
  }

  /** Remove all demons with a specific tag (e.g., despawning far unengaged squads). */
  countByTag(tag: string): number {
    let n = 0;
    for (const d of this.list) if (d.alive && d.tag === tag) n++;
    return n;
  }

  private manageEncounters(pp: THREE.Vector3) {
    const health = this.env.forestHealth();
    const budget = demonBudgetForHealth(health, this.env.lo);

    // Despawn far roaming demons so active budget stays focused near the player & active Wardens
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i];
      if (!d.alive) { this.list.splice(i, 1); continue; }
      if (d.tag.startsWith('village:')) continue; // village fortress garrisons persist while nearby
      if (d.pos.distanceTo(pp) > 250) {
        d.alive = false;
        this.group.remove(d.mesh);
        this.list.splice(i, 1);
      }
    }

    if (this.list.length >= budget) return;

    // 1. Spawn a Demon Warband assaulting a roaming Grovewarden so the player can witness & join the battle!
    const ws = this.env.wardens().filter((w) => Math.hypot(w.pos.x - pp.x, w.pos.z - pp.z) < 220);
    if (ws.length > 0 && this.countByTag('warden-assault') < (health < 45 ? 5 : 3)) {
      const w = ws[Math.floor(Math.random() * ws.length)];
      const a = Math.random() * Math.PI * 2;
      const sx = w.pos.x + Math.cos(a) * 34, sz = w.pos.z + Math.sin(a) * 34;
      if (Math.hypot(sx - pp.x, sz - pp.z) > 26) {
        const squad: DemonClassId[] = health < 40
          ? ['siege_titan', 'ashen_ravager', 'blight_harrier']
          : ['pyre_champion', 'ashen_ravager', 'rift_stalker'];
        this.spawnSquad(squad.slice(0, Math.min(squad.length, budget - this.list.length)), new THREE.Vector3(sx, 0, sz), 10, 'warden-assault', w.pos, w.id);
        forest.notify('demon-assault', w.pos, { wardenId: w.id, count: squad.length }, 'demon');
        return;
      }
    }

    // 2. Spawn roving demon horde / scouts in the wild ahead of the player (heavier when Forest Health is poor)
    const ang = Math.random() * Math.PI * 2;
    const dist = 58 + Math.random() * 55;
    const sx = pp.x + Math.cos(ang) * dist, sz = pp.z + Math.sin(ang) * dist;
    if (Math.hypot(sx, sz) > 840) return;
    const hordeKinds: DemonClassId[] = health < 35
      ? ['ashen_ravager', 'rift_stalker', 'blight_harrier', 'ashen_ravager']
      : health < 65
        ? ['ashen_ravager', 'rift_stalker', 'blight_harrier']
        : ['rift_stalker', 'ashen_ravager'];
    const take = Math.min(hordeKinds.length, Math.max(1, budget - this.list.length));
    this.spawnSquad(hordeKinds.slice(0, take), new THREE.Vector3(sx, 0, sz), 9, 'roam');
  }

  private spawnLoneChampion(pp: THREE.Vector3) {
    if (this.countByTag('lone') >= 1) return;
    const budget = demonBudgetForHealth(this.env.forestHealth(), this.env.lo);
    if (this.list.length >= budget + 1) return;
    const a = Math.random() * Math.PI * 2;
    const r = 68 + Math.random() * 40;
    const x = pp.x + Math.cos(a) * r, z = pp.z + Math.sin(a) * r;
    if (Math.hypot(x, z) > 830) return;
    const kind: DemonClassId = this.env.forestHealth() < 40 && Math.random() < 0.45 ? 'siege_titan' : 'pyre_champion';
    this.spawnOne(kind, x, z, 'lone');
  }

  update(dt: number, playerPos: THREE.Vector3, playerDead: boolean) {
    this.clock += dt;
    if ((this.spawnT -= dt) <= 0) {
      this.spawnT = this.env.forestHealth() < 40 ? 9 : 15;
      this.manageEncounters(playerPos);
    }
    if ((this.duelT -= dt) <= 0) {
      this.duelT = 38 + Math.random() * 25;
      this.spawnLoneChampion(playerPos);
    }

    const ws = this.env.wardens();
    for (const d of this.list) {
      if (!d.alive) continue;
      d.atkCd = Math.max(0, d.atkCd - dt);
      if (d.stunT > 0) { d.stunT = Math.max(0, d.stunT - dt); if (d.mixer) d.mixer.update(dt * 0.25); continue; }

      const pd = d.pos.distanceTo(playerPos);
      // Throttle distant demon animation/collision for smooth framerate
      if (pd > 135) {
        if (d.mixer) d.mixer.update(dt * 0.5);
        continue;
      }

      // Pick target: attacking a nearby Grovewarden OR chasing the player!
      let targetPos: THREE.Vector3 | null = null;
      let targetIsPlayer = false;
      const warden = d.targetWardenId ? ws.find((w) => w.id === d.targetWardenId) ?? null : null;
      if (!playerDead && pd < (d.boss ? 58 : 46) && (!warden || pd < 20)) {
        targetPos = playerPos;
        targetIsPlayer = true;
      } else if (warden) {
        targetPos = warden.pos;
      } else if (d.goal) {
        targetPos = d.goal;
      } else if (!playerDead && pd < 65) {
        targetPos = playerPos;
        targetIsPlayer = true;
      }

      let moving = false;
      if (d.state === 'windup') {
        d.stateT -= dt;
        d.ringMat.opacity = 0.85;
        d.ring.scale.setScalar((d.boss ? 2.4 : 1.4) * (0.85 + Math.sin(this.clock * 18) * 0.15));
        if (d.stateT <= 0) {
          d.state = 'recover';
          d.stateT = d.boss ? 0.95 : 0.65;
          d.atkCd = d.boss ? 2.4 : 1.8;
          d.ringMat.opacity = 0.35;
          d.ring.scale.setScalar(d.boss ? 1.85 : 1.05);
          if (targetPos) this.executeAttack(d, targetPos, targetIsPlayer);
        }
      } else if (d.state === 'recover') {
        d.stateT -= dt;
        if (d.stateT <= 0) d.state = 'chase';
      } else if (targetPos) {
        const dx = targetPos.x - d.pos.x, dz = targetPos.z - d.pos.z;
        const dist = Math.hypot(dx, dz);
        d.mesh.rotation.y = Math.atan2(dx, dz);
        const stopDist = targetIsPlayer ? d.spec.range * 0.88 : Math.max(d.spec.range, 9.5);
        if (dist <= d.spec.range + (targetIsPlayer ? 0.5 : 8.5) && d.atkCd <= 0) {
          d.state = 'windup';
          d.stateT = d.boss ? 0.72 : 0.48;
          if (d.atkAct) {
            d.atkAct.reset().setLoop(THREE.LoopOnce, 1).play();
          }
        } else if (dist > stopDist) {
          const step = d.spec.speed * dt;
          d.pos.x += (dx / Math.max(0.01, dist)) * step;
          d.pos.z += (dz / Math.max(0.01, dist)) * step;
          if (!d.spec.hover) this.env.resolve(d.pos, d.boss ? 1.0 : 0.55, d.spec.height);
          moving = true;
        }
      }

      const gy = this.env.ground(d.pos.x, d.pos.z);
      d.pos.y = gy + (d.spec.hover > 0 ? d.spec.hover + Math.sin(this.clock * 2.4 + d.id) * 0.45 : 0);
      d.ring.position.y = gy - d.pos.y + 0.09;

      if (d.mixer) {
        if (d.moveAct && d.idleAct && d.moveAct !== d.idleAct) {
          d.moveAct.setEffectiveWeight(moving ? 1 : 0);
          d.idleAct.setEffectiveWeight(moving ? 0 : 1);
        }
        d.mixer.update(dt);
      }
    }

    // Update crimson void-ember bolts from Blight Harriers
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      const hitPlayer = !playerDead && b.mesh.position.distanceTo(this.v.copy(playerPos).setY(playerPos.y + 1.1)) < 1.1;
      const hitGround = b.mesh.position.y <= this.env.ground(b.mesh.position.x, b.mesh.position.z);
      if (hitPlayer) this.env.hurtPlayer(b.dmg, 'BLIGHT BOLT');
      if (hitPlayer || hitGround || b.life <= 0) {
        this.group.remove(b.mesh);
        this.bolts.splice(i, 1);
      }
    }
  }

  private executeAttack(d: Demon, target: THREE.Vector3, targetIsPlayer: boolean) {
    if (d.spec.ranged) {
      const origin = d.chest(new THREE.Vector3());
      const aim = this.v2.copy(target).setY(target.y + 1.2).sub(origin).normalize();
      const mesh = new THREE.Mesh(DEMON_BOLT_GEO, DEMON_BOLT_MAT);
      mesh.position.copy(origin);
      this.group.add(mesh);
      this.bolts.push({ mesh, vel: aim.multiplyScalar(22), life: 3.2, dmg: d.spec.dmg });
      this.env.audio.play('zap', origin, { gain: 0.4, rate: 0.7 });
      return;
    }

    if (d.boss) {
      this.env.vfx.spawn(DEMON_SLAM_VFX, this.v.copy(d.pos).setY(this.env.ground(d.pos.x, d.pos.z) + 0.15));
      this.env.audio.play('erupt', d.pos, { gain: 0.65, rate: 0.85 });
    }
    if (targetIsPlayer) {
      const dist = d.pos.distanceTo(target);
      if (dist <= d.spec.range + (d.boss ? 2.4 : 1.0)) {
        this.env.hurtPlayer(d.spec.dmg, d.who.toUpperCase());
        if (d.kind === 'rift_stalker' || d.kind === 'pyre_champion') this.env.status.apply('burn', 3);
      }
    }
  }

  info() {
    return {
      live: this.list.length,
      budget: demonBudgetForHealth(this.env.forestHealth(), this.env.lo),
      classes: this.list.map((d) => `${d.kind}(${d.tag})`),
    };
  }
}
