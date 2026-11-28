// Elderwood Dynamic Forest Health & Living Restoration System.
//
// Each Elderwood session loads along a continuous Forest Health spectrum (0–100%):
//   · Blighted (0–29%):   barren/scorched groves, ash-amber haze, diseased wildlife, heavy Demon Legions,
//                         occupied Demon Fortress villages, fewer Grovewardens initially.
//   · Struggling (30–59%): patchy corruption, village raids, roving demon warbands, 2–3 Grovewardens.
//   · Recovering (60–84%): mostly green with lingering blight pockets & lone dark opponents, 3–5 Grovewardens.
//   · Thriving (85–100%):  lush sunlit canopy, peaceful hunting/farming villages, 4–6 Grovewardens.
//
// Player Restoration Loop:
//   1. Fill your Living Water Vessel (5/5) automatically by stepping into any clean river/waterfall/spring
//      (or tapping [H]/[U] at clean water).
//   2. Gather Pure Seeds & Healthy Spores from glowing Ancient Mother Trees ([U] or [H] nearby).
//   3. Spray Living Water & Sow Pure Seeds ([U] on KB, LT+D-Up on Controller, WATER/SEED on Touch) to:
//        - Extinguish & heal burned/blighted trees and corrupted fungi (+5% Forest Health)
//        - Sprout healthy saplings & Lumencaps on cleansed earth (+6% Forest Health)
//        - Cure diseased wildlife (instant trust burst + +4% Forest Health + +8 Soul Light)
//   4. Every restoration milestone summons additional Grovewardens into Elderwood to fight back the demons!
import * as THREE from 'three/webgpu';
import { color, float, sin, time } from 'three/tsl';
import type { Recipe, VfxSystem } from '../../../../services/vfx';
import type { PlayerController } from '../player';
import type { Prey, PreyDirector } from './prey';
import type { SoulMeter } from './soul';
import type { DangerAudio } from './audio';
import { sampleWaterAt } from '../waterPhysics';
import { forest } from './forest';

export type ForestHealthBand = 'blighted' | 'struggling' | 'recovering' | 'thriving';

export interface ForestHealthSummary {
  health: number;
  band: ForestHealthBand;
  label: string;
  blightFactor: number;
  waterCharges: number;
  maxWater: number;
  seedCharges: number;
  maxSeeds: number;
  blightedCount: number;
  restoredCount: number;
  diseasedAnimals: number;
  curedAnimals: number;
  nearbyPrompt: string | null;
}

/** Pure helper: classify 0..100 health into the 4 Elderwood world health bands. */
export function classifyForestHealth(health: number): ForestHealthBand {
  if (health < 30) return 'blighted';
  if (health < 60) return 'struggling';
  if (health < 85) return 'recovering';
  return 'thriving';
}

/** Pure helper: map Forest Health to target active Grovewarden count (restoring the forest brings more Wardens!). */
export function wardenReinforcementTarget(health: number): number {
  if (health < 30) return 2;
  if (health < 55) return 3;
  if (health < 78) return 4;
  if (health < 92) return 5;
  return 6;
}

/** Pure helper: roll or parse initial session Forest Health (honors ?health=blighted|struggling|recovering|thriving|0..100). */
export function rollInitialForestHealth(param: string | null, rng: () => number = Math.random): number {
  if (param) {
    const p = param.trim().toLowerCase();
    if (p === 'blighted' || p === 'bad') return 18;
    if (p === 'struggling' || p === 'damaged') return 44;
    if (p === 'recovering') return 72;
    if (p === 'thriving' || p === 'healthy') return 92;
    const n = Number(p);
    if (Number.isFinite(n)) return Math.max(0, Math.min(100, Math.round(n)));
  }
  const r = rng();
  if (r < 0.28) return Math.round(14 + rng() * 14);      // 14–28% Blighted
  if (r < 0.56) return Math.round(35 + rng() * 20);      // 35–55% Struggling
  if (r < 0.82) return Math.round(62 + rng() * 18);      // 62–80% Recovering
  return Math.round(86 + rng() * 10);                    // 86–96% Thriving
}

const LIVING_SPRAY_VFX: Recipe = {
  id: 'living_water_spray',
  light: { color: 0x52f2ff, intensity: 16, range: 12, life: 0.45 },
  emitters: [
    { layer: 'add', shape: 'soft', count: [24, 34], life: [0.45, 0.85], speed: [5, 11], spread: 0.42, radius: 0.25, size: [0.16, 0.04], color: [0xd8ffff, 0x38bdf8], intensity: 2.2, gravity: 4.5, drag: 1.4 },
    { layer: 'add', shape: 'ring', count: 1, life: 0.65, speed: 0, size: [0.5, 6.2], color: [0x99f6e4, 0x4ade80], intensity: 1.4, alpha: [0.85, 0] },
  ],
};
const SEED_BLOOM_VFX: Recipe = {
  id: 'seed_bloom',
  light: { color: 0x86efac, intensity: 18, range: 14, life: 0.7 },
  emitters: [
    { layer: 'add', shape: 'soft', count: [20, 28], life: [0.8, 1.6], speed: [1.5, 4.2], spread: Math.PI * 0.6, radius: 0.6, size: [0.14, 0.03], color: [0xfef08a, 0x4ade80], intensity: 2.4, gravity: -1.1, turbulence: 1.8 },
    { layer: 'add', shape: 'ring', count: 1, life: 0.9, speed: 0, size: [0.4, 7.5], color: [0xd9f99d, 0x22c55e], intensity: 1.4, alpha: [0.9, 0] },
  ],
};
const BLIGHT_EMBER_VFX: Recipe = {
  id: 'blight_ember',
  emitters: [
    { layer: 'alpha', shape: 'smoke', count: [2, 3], life: [1.8, 3.0], speed: [0.3, 0.8], spread: 0.5, radius: 1.6, size: [0.8, 2.2], color: [0x2a1410, 0x120808], alpha: [0.45, 0], lift: [0.6, 1.3] },
    { layer: 'add', shape: 'soft', count: [3, 5], life: [1.0, 1.8], speed: [0.6, 1.4], spread: 0.6, radius: 1.4, size: [0.09, 0.02], color: [0xff6a2a, 0xb91c1c], intensity: 2.2, gravity: -0.9, turbulence: 1.5 },
  ],
};
const DISEASE_MOTE_VFX: Recipe = {
  id: 'disease_mote',
  emitters: [{ layer: 'add', shape: 'soft', count: [2, 3], life: [0.8, 1.3], speed: [0.2, 0.6], spread: 0.8, radius: 0.45, size: [0.09, 0.02], color: [0xc084fc, 0x7e22ce], intensity: 1.8, gravity: -0.5 }],
};

interface BlightSite {
  id: string;
  x: number; y: number; z: number;
  kind: 'tree' | 'fungi';
  state: 'blighted' | 'cleansed' | 'restored';
  mesh: THREE.Group;
  body: THREE.Mesh;
  ring: THREE.Mesh;
  sapling: THREE.Group;
  fxT: number;
}
interface SeedSite {
  id: string;
  x: number; y: number; z: number;
  readyT: number;
  ring: THREE.Mesh;
  fxT: number;
}

const BLIGHT_COORDS: [number, number, 'tree' | 'fungi'][] = [
  [-58, -88, 'tree'], [68, -94, 'fungi'], [-125, -45, 'tree'], [130, -52, 'tree'],
  [-180, 90, 'fungi'], [-285, -120, 'tree'], [-345, -18, 'fungi'], [-360, 155, 'tree'],
  [-105, 225, 'fungi'], [160, 115, 'tree'], [205, -145, 'fungi'], [295, -210, 'tree'],
  [380, -310, 'tree'], [-215, 495, 'fungi'], [-75, 540, 'tree'], [115, 485, 'fungi'],
];
const SEED_COORDS: [number, number][] = [
  [-32, -26], [42, -34], [-96, -152], [118, -252], [-255, -170],
  [-372, 190], [218, 148], [322, -138], [262, -380], [-145, 580],
];

const DISEASE_HALO_GEO = new THREE.TorusGeometry(0.75, 0.05, 6, 20).rotateX(Math.PI / 2);
const DISEASE_HALO_MAT = new THREE.MeshBasicNodeMaterial({ color: 0xa855f7, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false });
const SEED_RING_GEO = new THREE.RingGeometry(1.1, 1.45, 24).rotateX(-Math.PI / 2);
const BLIGHT_RING_GEO = new THREE.RingGeometry(2.2, 2.75, 28).rotateX(-Math.PI / 2);
const STUMP_GEO = new THREE.CylinderGeometry(0.75, 1.25, 4.4, 9);
const FUNGI_BLOB_GEO = new THREE.SphereGeometry(0.95, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.58);
const SAPLING_TRUNK_GEO = new THREE.CylinderGeometry(0.16, 0.34, 3.6, 7);
const SAPLING_CROWN_GEO = new THREE.IcosahedronGeometry(1.55, 1);

export interface ForestHealthEnv {
  scene: THREE.Scene;
  vfx: VfxSystem;
  audio: DangerAudio;
  player: PlayerController;
  prey: PreyDirector;
  soul: SoulMeter;
  wilds: boolean;
  lo: boolean;
  ground(x: number, z: number): number;
  say(text: string, color: string): void;
  onReinforceWarden?(countWanted: number, health: number): void;
  onTrustGain?(amount: number): void;
}

export class ForestHealthSystem {
  readonly group = new THREE.Group();
  health: number;
  readonly maxWater = 5;
  readonly maxSeeds = 5;
  waterCharges = 2;
  seedCharges = 2;
  restoredCount = 0;
  curedAnimals = 0;
  trustScore = 0;
  nearbyPrompt: string | null = null;

  private blights: BlightSite[] = [];
  private seeds: SeedSite[] = [];
  private clock = 0;
  private waterFillCd = 0;
  private sprayCd = 0;
  private ambientFxT = 0;
  private diseaseT = 0;
  private lastWardenTier: number;
  private v = new THREE.Vector3();
  private seedRingMat: THREE.MeshBasicNodeMaterial;
  private sapTrunkMat: THREE.MeshStandardNodeMaterial;
  private sapCrownMat: THREE.MeshStandardNodeMaterial;
  private blightCharMat: THREE.MeshStandardNodeMaterial;
  private cleansedCharMat: THREE.MeshStandardNodeMaterial;
  private restoredCharMat: THREE.MeshStandardNodeMaterial;
  private blightRingMat: THREE.MeshBasicNodeMaterial;
  private cleansedRingMat: THREE.MeshBasicNodeMaterial;

  constructor(private env: ForestHealthEnv) {
    this.group.name = 'danger-forest-health';
    env.scene.add(this.group);

    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('health') : null;
    this.health = rollInitialForestHealth(q);
    this.lastWardenTier = wardenReinforcementTarget(this.health);
    // Start with extra charges in a badly blighted forest so players can begin healing immediately after finding water/seeds
    if (this.health < 35) { this.waterCharges = 3; this.seedCharges = 2; }

    this.seedRingMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.seedRingMat.colorNode = color(0xbef264).mul(float(1.1).add(sin(time.mul(2.4)).mul(0.3)));
    this.seedRingMat.opacityNode = float(0.55);

    this.sapTrunkMat = new THREE.MeshStandardNodeMaterial({ color: 0x5d442f, roughness: 0.85 });
    this.sapCrownMat = new THREE.MeshStandardNodeMaterial({ color: 0x3b8f48, roughness: 0.6 });
    this.sapCrownMat.emissiveNode = color(0x4ade80).mul(float(0.32).add(sin(time.mul(1.8)).mul(0.1)));

    // Shared PBR & ring materials across all 16 blight sites (1 WGSL shader instead of 16, and zero mid-play recompile hitches!)
    this.blightCharMat = new THREE.MeshStandardNodeMaterial({ color: 0x1d1311, roughness: 0.94 });
    this.blightCharMat.emissiveNode = color(0xdc2626).mul(float(0.55).add(sin(time.mul(3.6)).mul(0.28)));
    this.cleansedCharMat = new THREE.MeshStandardNodeMaterial({ color: 0x3a4a34, emissive: 0x38bdf8, emissiveIntensity: 0.35, roughness: 0.82 });
    this.restoredCharMat = new THREE.MeshStandardNodeMaterial({ color: 0x4a5d3a, emissive: 0x4ade80, emissiveIntensity: 0.35, roughness: 0.78 });
    this.blightRingMat = new THREE.MeshBasicNodeMaterial({ color: 0xef4444, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.cleansedRingMat = new THREE.MeshBasicNodeMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.48, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

    this.buildSites();
    this.publishGlobal();
  }

  get band(): ForestHealthBand { return classifyForestHealth(this.health); }
  get blightFactor(): number { return Math.max(0, Math.min(1, (85 - this.health) / 75)); }
  get bandLabel(): string {
    const b = this.band;
    return b === 'blighted' ? 'BLIGHTED' : b === 'struggling' ? 'STRUGGLING' : b === 'recovering' ? 'RECOVERING' : 'THRIVING';
  }

  private buildSites() {
    const coords = this.env.wilds ? BLIGHT_COORDS : BLIGHT_COORDS.slice(0, 4);
    // Number of initially blighted sites scales directly with how sick the forest loaded
    const blightRatio = Math.max(0.12, Math.min(0.95, (98 - this.health) / 88));
    const activeTarget = Math.max(1, Math.round(coords.length * blightRatio));

    coords.forEach(([x, z, kind], idx) => {
      const y = this.env.ground(x, z);
      const grp = new THREE.Group();
      grp.position.set(x, y, z);

      const body = new THREE.Mesh(kind === 'tree' ? STUMP_GEO : FUNGI_BLOB_GEO, this.blightCharMat);
      body.position.y = kind === 'tree' ? 2.0 : 0.35;
      if (kind === 'fungi') body.scale.set(1.5, 1.25, 1.5);
      grp.add(body);

      const ring = new THREE.Mesh(BLIGHT_RING_GEO, this.blightRingMat);
      ring.position.y = 0.08;
      ring.name = 'blight-ring';
      grp.add(ring);

      const sapling = new THREE.Group();
      const trunk = new THREE.Mesh(SAPLING_TRUNK_GEO, this.sapTrunkMat);
      trunk.position.y = 1.8;
      const crown = new THREE.Mesh(SAPLING_CROWN_GEO, this.sapCrownMat);
      crown.position.y = 4.1;
      sapling.add(trunk, crown);
      sapling.visible = false;
      grp.add(sapling);

      const isBlighted = idx < activeTarget;
      grp.visible = isBlighted;
      this.group.add(grp);
      this.blights.push({
        id: `blight-${idx}`,
        x, y, z, kind,
        state: isBlighted ? 'blighted' : 'restored',
        mesh: grp, body, ring, sapling,
        fxT: Math.random() * 1.4,
      });
    });

    const seedCoords = this.env.wilds ? SEED_COORDS : SEED_COORDS.slice(0, 3);
    seedCoords.forEach(([x, z], idx) => {
      const y = this.env.ground(x, z);
      const ring = new THREE.Mesh(SEED_RING_GEO, this.seedRingMat);
      ring.position.set(x, y + 0.09, z);
      this.group.add(ring);
      this.seeds.push({ id: `seed-${idx}`, x, y, z, readyT: 0, ring, fxT: Math.random() * 2 });
    });
  }

  /** Shift Forest Health directly (village liberation, demon kills, restoration deeds). */
  adjustHealth(delta: number, reason?: string) {
    const prevBand = this.band;
    this.health = Math.max(0, Math.min(100, this.health + delta));
    if (delta > 0) {
      this.trustScore = Math.min(3, this.trustScore + delta * 0.04);
      this.env.onTrustGain?.(delta * 0.04);
    }
    this.publishGlobal();
    const newBand = this.band;
    if (newBand !== prevBand && delta > 0) {
      this.env.say(`ELDERWOOD IS ${this.bandLabel} (${Math.round(this.health)}%) · MORE GROVEWARDENS ANSWER`, '#86efac');
      forest.notify('forest-health', this.env.player.object.position, { health: this.health, band: newBand, reason }, 'forest');
    }
    const wantWarden = wardenReinforcementTarget(this.health);
    if (wantWarden > this.lastWardenTier) {
      this.lastWardenTier = wantWarden;
      this.env.onReinforceWarden?.(wantWarden, this.health);
    }
  }

  /** Nearest Living Water Spring or healthy Seed Tree for Mycelium Aid guidance when wounded or restoring. */
  nearestAidPoint(from: THREE.Vector3): { pos: THREE.Vector3; label: string } | null {
    // Waterfall pool (30, 60) + Glowcap stream (238, 170) are guaranteed clean Living Waters
    const springs: [number, number, string][] = [
      [30, 60, 'Waterfall Living Pool'],
      [238, 170, 'Glowcap Living Stream'],
      [300, 0, 'Highland Living River'],
    ];
    let best: { pos: THREE.Vector3; label: string } | null = null;
    let bd = 140;
    for (const [x, z, label] of springs) {
      const d = Math.hypot(x - from.x, z - from.z);
      if (d < bd) { bd = d; best = { pos: new THREE.Vector3(x, this.env.ground(x, z), z), label }; }
    }
    return best;
  }

  /** Player triggers Living Water Spray / Pure Seed Sowing / Seed Gathering ([U] / LT+D-Up / Touch WATER/SEED). */
  triggerRestore(): boolean {
    if (this.sprayCd > 0) return false;
    const pl = this.env.player;
    if (!pl.enabled || pl.downed) return false;
    const pp = pl.object.position;

    // 1. Check clean water right here → refill Living Water Vessel
    const water = sampleWaterAt(pp.x, pp.z, pp.y, this.env.wilds);
    if (water && water.kind === 'clean' && this.waterCharges < this.maxWater) {
      this.waterCharges = this.maxWater;
      this.sprayCd = 0.6;
      this.env.vfx.spawn(LIVING_SPRAY_VFX, this.v.copy(pp).setY(pp.y + 0.6));
      this.env.audio.play('zap', pp, { gain: 0.45, rate: 1.5 });
      this.env.say('LIVING WATERS REFILLED (5/5) · SPRAY BLIGHTED TREES & SICK WILDLIFE', '#38bdf8');
      return true;
    }

    // 2. Check nearby Healthy Seed Tree → gather Pure Seeds & Healthy Spores
    for (const s of this.seeds) {
      if (s.readyT > 0) continue;
      if (Math.hypot(s.x - pp.x, s.z - pp.z) < 6.0 && this.seedCharges < this.maxSeeds) {
        this.seedCharges = Math.min(this.maxSeeds, this.seedCharges + 3);
        s.readyT = 55;
        s.ring.visible = false;
        this.sprayCd = 0.6;
        this.env.vfx.spawn(SEED_BLOOM_VFX, this.v.set(s.x, s.y + 0.5, s.z));
        this.env.audio.play('zap', s.ring.position, { gain: 0.45, rate: 2.1 });
        this.env.say(`GATHERED PURE SEEDS & SPORES (${this.seedCharges}/${this.maxSeeds}) · SOW ON CLEANSED GROVES`, '#bef264');
        return true;
      }
    }

    // 3. Spray Living Water onto nearby diseased wildlife or blighted trees/fungi!
    let didSomething = false;
    const fwd = new THREE.Vector3(-Math.sin(pl.bodyYaw), 0, -Math.cos(pl.bodyYaw));
    const sprayOrigin = this.v.copy(pp).addScaledVector(fwd, 2.2).setY(pp.y + 1.1);

    if (this.waterCharges > 0) {
      let cured = 0;
      for (const p of this.env.prey.list) {
        if (!p.alive || !p.diseased) continue;
        if (p.pos.distanceTo(pp) <= 9.5) {
          this.cureAnimal(p);
          cured++;
        }
      }
      let cleansed = 0;
      for (const b of this.blights) {
        if (b.state !== 'blighted') continue;
        if (Math.hypot(b.x - pp.x, b.z - pp.z) <= 8.5) {
          b.state = 'cleansed';
          b.body.material = this.cleansedCharMat;
          b.ring.material = this.cleansedRingMat;
          this.env.vfx.spawn(LIVING_SPRAY_VFX, new THREE.Vector3(b.x, b.y + 1.2, b.z));
          cleansed++;
        }
      }
      if (cured > 0 || cleansed > 0) {
        this.waterCharges = Math.max(0, this.waterCharges - 1);
        this.sprayCd = 0.85;
        this.env.vfx.spawn(LIVING_SPRAY_VFX, sprayOrigin, { dir: [fwd.x, 0.12, fwd.z] });
        this.env.audio.play('zap', pp, { gain: 0.55, rate: 1.8 });
        if (cured > 0) {
          this.curedAnimals += cured;
          this.env.soul.deed('protect', pp, 8 * cured);
          this.adjustHealth(4 * cured, 'cured-wildlife');
          this.env.say(`LIVING WATERS CURED ${cured} BLIGHTED CREATURE${cured > 1 ? 'S' : ''} · +${4 * cured}% FOREST HEALTH`, '#5eead4');
        }
        if (cleansed > 0) {
          this.env.soul.deed('pray', pp, 6 * cleansed);
          this.adjustHealth(5 * cleansed, 'cleansed-blight');
          this.env.say(`BLIGHT EXTINGUISHED · SOW PURE SEEDS [U] TO REGROW THE GROVE`, '#38bdf8');
        }
        didSomething = true;
      }
    }

    // 4. Sow Pure Seeds & Healthy Spores onto a cleansed (or blighted) grove to sprout living saplings & Lumencaps!
    if (!didSomething && this.seedCharges > 0) {
      for (const b of this.blights) {
        if (b.state === 'restored') continue;
        if (Math.hypot(b.x - pp.x, b.z - pp.z) <= 8.5) {
          b.state = 'restored';
          b.sapling.visible = true;
          b.body.material = this.restoredCharMat;
          b.ring.visible = false;
          this.seedCharges = Math.max(0, this.seedCharges - 1);
          this.restoredCount++;
          this.sprayCd = 0.85;
          this.env.vfx.spawn(SEED_BLOOM_VFX, new THREE.Vector3(b.x, b.y + 0.8, b.z));
          this.env.audio.play('zap', pp, { gain: 0.55, rate: 2.3 });
          this.env.soul.deed('bond', pp, 7);
          this.adjustHealth(6, 'sowed-grove');
          forest.notify('heal-world', { x: b.x, z: b.z }, { kind: 'grove', health: this.health }, 'player');
          this.env.say(`PURE SEEDS & SPORES BLOOMED · +6% FOREST HEALTH (${Math.round(this.health)}%)`, '#86efac');
          didSomething = true;
          break;
        }
      }
    }

    // 5. Even in open ground, spraying Living Water gives a small refreshing self-heal (+10 HP) & clears poison!
    if (!didSomething && this.waterCharges > 0) {
      this.waterCharges--;
      this.sprayCd = 1.0;
      this.env.vfx.spawn(LIVING_SPRAY_VFX, sprayOrigin, { dir: [fwd.x, 0.15, fwd.z] });
      this.env.audio.play('zap', pp, { gain: 0.4, rate: 1.6 });
      if (pl.hp < pl.maxHp) pl.hp = Math.min(pl.maxHp, pl.hp + 14);
      this.env.say(`LIVING WATER MIST · +14 HP (${this.waterCharges}/${this.maxWater} LEFT)`, '#5eead4');
      return true;
    }

    if (!didSomething) {
      this.env.say('STEP IN A CLEAN RIVER FOR LIVING WATERS OR FIND A GOLDEN SEED TREE', '#94a3b8');
    }
    return didSomething;
  }

  private cureAnimal(p: Prey) {
    p.diseased = false;
    if (p.diseaseHalo) {
      p.mesh.remove(p.diseaseHalo);
      p.diseaseHalo = null;
    }
    p.hp = p.maxHp;
    p.affinity = Math.min(1, p.affinity + 0.65);
    this.env.vfx.spawn(SEED_BLOOM_VFX, this.v.copy(p.pos).setY(p.pos.y + 0.7));
  }

  update(dt: number) {
    this.clock += dt;
    this.waterFillCd = Math.max(0, this.waterFillCd - dt);
    this.sprayCd = Math.max(0, this.sprayCd - dt);

    const pl = this.env.player;
    const pp = pl.object.position;
    const live = pl.enabled && !pl.downed;

    // Auto-refill Living Water Vessel when wading/swimming in clean streams or Waterfall Pool!
    if (live && this.waterFillCd <= 0 && this.waterCharges < this.maxWater) {
      const w = sampleWaterAt(pp.x, pp.z, pp.y, this.env.wilds);
      if (w && w.kind === 'clean' && w.depth > 0.25) {
        this.waterCharges = this.maxWater;
        this.waterFillCd = 8;
        this.env.vfx.spawn(LIVING_SPRAY_VFX, this.v.copy(pp).setY(w.y + 0.2));
        this.env.say('LIVING WATERS FILLED (5/5) · PRESS [U] TO HEAL BLIGHTED TREES & SICK ANIMALS', '#38bdf8');
      }
    }

    // Seed tree regrow timers & gentle motes
    for (const s of this.seeds) {
      if (s.readyT > 0) {
        s.readyT = Math.max(0, s.readyT - dt);
        if (s.readyT === 0) s.ring.visible = true;
      } else if (Math.hypot(s.x - pp.x, s.z - pp.z) < 42 && (s.fxT -= dt) <= 0) {
        s.fxT = this.env.lo ? 1.8 : 0.9;
        this.env.vfx.spawn(SEED_BLOOM_VFX, this.v.set(s.x, s.y + 0.5, s.z), { count: 0.15 });
      }
    }

    // Blight site smoldering embers when near player
    for (const b of this.blights) {
      if (b.state !== 'blighted') continue;
      const d = Math.hypot(b.x - pp.x, b.z - pp.z);
      if (d < 55 && (b.fxT -= dt) <= 0) {
        b.fxT = this.env.lo ? 1.5 : 0.75;
        this.env.vfx.spawn(BLIGHT_EMBER_VFX, this.v.set(b.x, b.y + 1.0, b.z));
      }
    }

    // Infect a proportion of wild creatures when Forest Health < 65% so players can cure them with Living Waters!
    if ((this.diseaseT -= dt) <= 0) {
      this.diseaseT = 2.0;
      const sickTargetFrac = this.health < 35 ? 0.35 : this.health < 65 ? 0.18 : 0;
      const alivePrey = this.env.prey.list.filter((p) => p.alive);
      const curSick = alivePrey.filter((p) => p.diseased).length;
      const wantSick = Math.floor(alivePrey.length * sickTargetFrac);
      if (curSick < wantSick) {
        for (const p of alivePrey) {
          if (p.diseased || p.bonded) continue;
          if (p.pos.distanceTo(pp) < 120) {
            p.diseased = true;
            const halo = new THREE.Mesh(DISEASE_HALO_GEO, DISEASE_HALO_MAT);
            halo.position.y = p.body.height * 0.55;
            p.mesh.add(halo);
            p.diseaseHalo = halo;
            break;
          }
        }
      }
    }
    for (const p of this.env.prey.list) {
      if (!p.alive || !p.diseased) continue;
      if (p.diseaseHalo) p.diseaseHalo.rotation.y += dt * 1.8;
      if (p.pos.distanceTo(pp) < 40 && Math.random() < dt * (this.env.lo ? 0.6 : 1.4)) {
        this.env.vfx.spawn(DISEASE_MOTE_VFX, this.v.copy(p.pos).setY(p.pos.y + p.body.height * 0.6));
      }
    }

    // Ambient smoldering ash motes drifting across blighted forests
    if (this.blightFactor > 0.35 && (this.ambientFxT -= dt) <= 0) {
      this.ambientFxT = this.env.lo ? 1.4 : 0.65;
      const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 18;
      const ax = pp.x + Math.cos(a) * r, az = pp.z + Math.sin(a) * r;
      this.env.vfx.spawn(BLIGHT_EMBER_VFX, this.v.set(ax, this.env.ground(ax, az) + 1.5, az), { count: 0.45 });
    }

    // Compute concise contextual prompt for nearby restoration target
    this.nearbyPrompt = null;
    if (live) {
      for (const p of this.env.prey.list) {
        if (p.alive && p.diseased && p.pos.distanceTo(pp) <= 9.5) {
          this.nearbyPrompt = this.waterCharges > 0
            ? `[U] SPRAY LIVING WATER · CURE SICK ${p.who.toUpperCase()}`
            : `SICK ${p.who.toUpperCase()} · FILL LIVING WATER AT A RIVER`;
          break;
        }
      }
      if (!this.nearbyPrompt) {
        for (const b of this.blights) {
          if (b.state === 'restored') continue;
          if (Math.hypot(b.x - pp.x, b.z - pp.z) <= 8.5) {
            this.nearbyPrompt = b.state === 'blighted'
              ? (this.waterCharges > 0 ? '[U] SPRAY LIVING WATER · CLEANSE BLIGHTED GROVE' : 'BLIGHTED GROVE · GATHER LIVING WATER AT A RIVER')
              : (this.seedCharges > 0 ? '[U] SOW PURE SEEDS & SPORES · REGROW GROVE' : 'CLEANSED EARTH · GATHER PURE SEEDS AT A MOTHER TREE');
            break;
          }
        }
      }
      if (!this.nearbyPrompt) {
        for (const s of this.seeds) {
          if (s.readyT <= 0 && Math.hypot(s.x - pp.x, s.z - pp.z) <= 6.0 && this.seedCharges < this.maxSeeds) {
            this.nearbyPrompt = '[U] GATHER PURE SEEDS & HEALTHY SPORES';
            break;
          }
        }
      }
    }
  }

  summary(): ForestHealthSummary {
    return {
      health: Math.round(this.health),
      band: this.band,
      label: this.bandLabel,
      blightFactor: +this.blightFactor.toFixed(2),
      waterCharges: this.waterCharges,
      maxWater: this.maxWater,
      seedCharges: this.seedCharges,
      maxSeeds: this.maxSeeds,
      blightedCount: this.blights.filter((b) => b.state === 'blighted').length,
      restoredCount: this.restoredCount,
      diseasedAnimals: this.env.prey.list.filter((p) => p.alive && p.diseased).length,
      curedAnimals: this.curedAnimals,
      nearbyPrompt: this.nearbyPrompt,
    };
  }

  private publishGlobal() {
    (globalThis as unknown as { __forestHealth?: { health: number; blight: number; band: ForestHealthBand } }).__forestHealth = {
      health: this.health,
      blight: this.blightFactor,
      band: this.band,
    };
  }
}
