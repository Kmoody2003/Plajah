// World Weapons, Modular 3D Armor Pickups, Tactical Field Items & 3-Slot Persistent Loadout Manager.
// Scatters our sculpted 3D GLB weapons (assets/weapons/) and modular armor pieces (assets/wardrobe/) across the map
// so players can pick them up, equip them live onto their character's bone sockets, and save/swap custom Loadouts.
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { VesselId } from './vessels';
import { VESSELS, VESSEL_ORDER } from './vessels';

export type LootCategory = 'weapon' | 'shield' | 'armor' | 'item';
export type ArmorSlot = 'head' | 'chest' | 'back' | 'shoulder' | 'belt';

export interface LootDef {
  id: string;
  name: string;
  category: LootCategory;
  armorSlot?: ArmorSlot;
  mountBone?: string;
  url?: string;
  color: number;
  desc: string;
  /** Combat & traversal bonuses applied while equipped in the active loadout. */
  bonuses?: {
    dmgMul?: number;        // e.g. +0.25 = +25% weapon & melee damage
    maxHp?: number;         // flat Max HP bonus
    dmgReduce?: number;     // 0..0.35 incoming damage reduction
    moveMul?: number;       // e.g. +0.12 = +12% run speed
    swimMul?: number;       // e.g. +0.25 = +25% swim speed
    climbMul?: number;      // e.g. +0.20 = +20% climb speed
    grappleRangeMul?: number; // e.g. +0.20 = +20% grapple reach
    chargeRegenMul?: number;
    pelletsBonus?: number;
  };
  /** Instant effect when category === 'item'. */
  itemEffect?: 'heal' | 'charge' | 'haste';
}

export const LOOT_CATALOG: Record<string, LootDef> = {
  // ── 9 Discoverable Sculpted 3D Weapons (assets/weapons/) ──
  cyber_greatsword: {
    id: 'cyber_greatsword', name: 'Cyber Greatsword', category: 'weapon',
    url: '/games/rift-realm/assets/weapons/cyber_greatsword.glb', color: 0x38bdf8,
    desc: 'Heavy plasma-edged greatsword. +32% damage & sweeping energy arcs.',
    bonuses: { dmgMul: 0.32 },
  },
  frost_longsword: {
    id: 'frost_longsword', name: 'Glacial Frost Longsword', category: 'weapon',
    url: '/games/rift-realm/assets/weapons/frost_longsword.glb', color: 0x67e8f9,
    desc: 'Razor cryo blade. +22% damage & +8% agility.',
    bonuses: { dmgMul: 0.22, moveMul: 0.08 },
  },
  shadow_dagger: {
    id: 'shadow_dagger', name: 'Shadow Assassin Dagger', category: 'weapon',
    url: '/games/rift-realm/assets/weapons/shadow_dagger.glb', color: 0xd946ef,
    desc: 'Twin-pulse void fang. +16% move speed, +15% damage & +18% grapple reach.',
    bonuses: { dmgMul: 0.15, moveMul: 0.16, grappleRangeMul: 0.18 },
  },
  rune_warhammer: {
    id: 'rune_warhammer', name: 'Arcane Rune Warhammer', category: 'weapon',
    url: '/games/rift-realm/assets/weapons/rune_warhammer.glb', color: 0xf59e0b,
    desc: 'Colossal runic breaker. +42% heavy damage & +20 Max HP.',
    bonuses: { dmgMul: 0.42, maxHp: 20 },
  },
  elderwood_spear: {
    id: 'elderwood_spear', name: 'Elderwood Living Spear', category: 'weapon',
    url: '/games/rift-realm/assets/weapons/elderwood_spear.glb', color: 0x4ade80,
    desc: 'Grove-forged spear. +24% damage & +25% spirit regen.',
    bonuses: { dmgMul: 0.24, chargeRegenMul: 0.25 },
  },
  storm_staff: {
    id: 'storm_staff', name: 'Tempest Storm Staff', category: 'weapon',
    url: '/games/rift-realm/assets/weapons/storm_staff.glb', color: 0x818cf8,
    desc: 'Arc-lightning conduit. +20% damage & +1 bonus burst pellet.',
    bonuses: { dmgMul: 0.20, pelletsBonus: 1 },
  },
  coral_trident: {
    id: 'coral_trident', name: 'Abyssal Coral Trident', category: 'weapon',
    url: '/games/rift-realm/assets/weapons/coral_trident.glb', color: 0x2dd4bf,
    desc: 'Tidal reef trident. +22% damage & +35% swim speed in streams.',
    bonuses: { dmgMul: 0.22, swimMul: 0.35 },
  },
  paladin_tower_shield: {
    id: 'paladin_tower_shield', name: 'Paladin Tower Shield', category: 'shield',
    mountBone: 'LeftForeArm', url: '/games/rift-realm/assets/weapons/paladin_tower_shield.glb', color: 0x38bdf8,
    desc: 'Off-hand cyber bulwark. +45 Max HP & 18% damage reduction.',
    bonuses: { maxHp: 45, dmgReduce: 0.18 },
  },
  solar_shield: {
    id: 'solar_shield', name: 'Solar Aegis Shield', category: 'shield',
    mountBone: 'LeftForeArm', url: '/games/rift-realm/assets/weapons/solar_shield.glb', color: 0xfbbf24,
    desc: 'Radiant buckler. +30 Max HP, 12% damage reduction & +20% spirit regen.',
    bonuses: { maxHp: 30, dmgReduce: 0.12, chargeRegenMul: 0.20 },
  },

  // ── 10 Discoverable Modular 3D Armor Pieces (assets/wardrobe/) ──
  aegis_helm: {
    id: 'aegis_helm', name: 'Aegis Visored Helm', category: 'armor', armorSlot: 'head', mountBone: 'Head',
    url: '/games/rift-realm/assets/wardrobe/aegis_helm.glb', color: 0x38bdf8,
    desc: 'Reinforced paladin helm. +25 Max HP.',
    bonuses: { maxHp: 25 },
  },
  aegis_chestplate: {
    id: 'aegis_chestplate', name: 'Aegis Soul-Core Chestplate', category: 'armor', armorSlot: 'chest', mountBone: 'Spine2',
    url: '/games/rift-realm/assets/wardrobe/aegis_chestplate.glb', color: 0x60a5fa,
    desc: 'Stone-and-gold chestplate. +40 Max HP & 10% damage reduction.',
    bonuses: { maxHp: 40, dmgReduce: 0.10 },
  },
  aegis_pauldron: {
    id: 'aegis_pauldron', name: 'Aegis Stone-Gold Pauldrons', category: 'armor', armorSlot: 'shoulder', mountBone: 'LeftArm',
    url: '/games/rift-realm/assets/wardrobe/aegis_pauldron.glb', color: 0xfbbf24,
    desc: 'Twin armored shoulder guards. +20 Max HP & +10% damage.',
    bonuses: { maxHp: 20, dmgMul: 0.10 },
  },
  lumen_halo: {
    id: 'lumen_halo', name: 'Lumen Celestial Halo', category: 'armor', armorSlot: 'head', mountBone: 'Head',
    url: '/games/rift-realm/assets/wardrobe/lumen_halo.glb', color: 0xfef08a,
    desc: 'Floating filigree halo. +40% spirit charge regeneration.',
    bonuses: { chargeRegenMul: 0.40 },
  },
  lumen_golden_wings: {
    id: 'lumen_golden_wings', name: 'Lumen Golden Wings', category: 'armor', armorSlot: 'back', mountBone: 'Spine2',
    url: '/games/rift-realm/assets/wardrobe/lumen_golden_wings.glb', color: 0xfde047,
    desc: 'Gilded back filigree. +25% cliff climb speed & +10% move speed.',
    bonuses: { climbMul: 0.25, moveMul: 0.10 },
  },
  nyx_visor: {
    id: 'nyx_visor', name: 'Nyx Neon Hex Visor', category: 'armor', armorSlot: 'head', mountBone: 'Head',
    url: '/games/rift-realm/assets/wardrobe/nyx_visor.glb', color: 0xe879f9,
    desc: 'Cyber-chitin optics. +12% move speed & +15% grapple range.',
    bonuses: { moveMul: 0.12, grappleRangeMul: 0.15 },
  },
  nyx_fin_crest: {
    id: 'nyx_fin_crest', name: 'Nyx Magenta Fin Crest', category: 'armor', armorSlot: 'back', mountBone: 'Spine2',
    url: '/games/rift-realm/assets/wardrobe/nyx_fin_crest.glb', color: 0xd946ef,
    desc: 'Hydro-fin dorsal crest. +35% swim speed & +10% dash agility.',
    bonuses: { swimMul: 0.35, moveMul: 0.08 },
  },
  pyre_obsidian_chest: {
    id: 'pyre_obsidian_chest', name: 'Pyre Obsidian Chestplate', category: 'armor', armorSlot: 'chest', mountBone: 'Spine2',
    url: '/games/rift-realm/assets/wardrobe/pyre_obsidian_chest.glb', color: 0xf97316,
    desc: 'Volcanic forge plate. +45 Max HP & +12% damage.',
    bonuses: { maxHp: 45, dmgMul: 0.12 },
  },
  pyre_smith_belt: {
    id: 'pyre_smith_belt', name: 'Pyre Forge Tool Belt', category: 'armor', armorSlot: 'belt', mountBone: 'Hips',
    url: '/games/rift-realm/assets/wardrobe/pyre_smith_belt.glb', color: 0xfb923c,
    desc: 'Artisan utility harness. +25% climb speed & +20% spirit regen.',
    bonuses: { climbMul: 0.25, chargeRegenMul: 0.20 },
  },
  sylva_antler_crown: {
    id: 'sylva_antler_crown', name: 'Sylva Amber Antler Crown', category: 'armor', armorSlot: 'head', mountBone: 'Head',
    url: '/games/rift-realm/assets/wardrobe/sylva_antler_crown.glb', color: 0x4ade80,
    desc: 'Living grove crown. +25% grapple reach & +20% climb speed.',
    bonuses: { grappleRangeMul: 0.25, climbMul: 0.20 },
  },

  // ── 3 Tactical Field Items (instant-use pickups spread across map) ──
  spirit_cell: {
    id: 'spirit_cell', name: 'Spirit Overcharge Cell', category: 'item', color: 0x38bdf8,
    desc: 'Restores +60 Spirit Charge and +1.0x Resonance immediately.',
    itemEffect: 'charge',
  },
  aegis_medkit: {
    id: 'aegis_medkit', name: 'Aegis Repair Core', category: 'item', color: 0x4ade80,
    desc: 'Repairs +65 Vessel Integrity immediately.',
    itemEffect: 'heal',
  },
  gale_elixir: {
    id: 'gale_elixir', name: 'Gale Traversal Surge', category: 'item', color: 0xfbbf24,
    desc: 'Boosts run, swim, and climb speed by +28% for 20 seconds.',
    itemEffect: 'haste',
  },
};

export interface LoadoutPreset {
  name: string;
  vessel: VesselId;
  weaponId: string | null; // null = vessel's signature default weapon
  shieldId: string | null;
  armor: Partial<Record<ArmorSlot, string>>;
}

export interface ComputedLoadoutStats {
  dmgMul: number;
  maxHpBonus: number;
  dmgReduce: number;
  moveMul: number;
  swimMul: number;
  climbMul: number;
  grappleRangeMul: number;
  chargeRegenMul: number;
  pelletsBonus: number;
  accentColor: number | null;
}

export function computeLoadoutStats(preset: LoadoutPreset): ComputedLoadoutStats {
  const out: ComputedLoadoutStats = {
    dmgMul: 1,
    maxHpBonus: 0,
    dmgReduce: 0,
    moveMul: 1,
    swimMul: 1,
    climbMul: 1,
    grappleRangeMul: 1,
    chargeRegenMul: 1,
    pelletsBonus: 0,
    accentColor: null,
  };
  const ids: string[] = [];
  if (preset.weaponId) ids.push(preset.weaponId);
  if (preset.shieldId) ids.push(preset.shieldId);
  for (const id of Object.values(preset.armor)) if (id) ids.push(id);

  for (const id of ids) {
    const def = LOOT_CATALOG[id];
    if (!def?.bonuses) continue;
    const b = def.bonuses;
    if (b.dmgMul) out.dmgMul += b.dmgMul;
    if (b.maxHp) out.maxHpBonus += b.maxHp;
    if (b.dmgReduce) out.dmgReduce = Math.min(0.45, out.dmgReduce + b.dmgReduce);
    if (b.moveMul) out.moveMul += b.moveMul;
    if (b.swimMul) out.swimMul += b.swimMul;
    if (b.climbMul) out.climbMul += b.climbMul;
    if (b.grappleRangeMul) out.grappleRangeMul += b.grappleRangeMul;
    if (b.chargeRegenMul) out.chargeRegenMul += b.chargeRegenMul;
    if (b.pelletsBonus) out.pelletsBonus += b.pelletsBonus;
    if (def.category === 'weapon') out.accentColor = def.color;
  }
  return out;
}

export const DEFAULT_LOADOUTS: LoadoutPreset[] = [
  { name: 'Vanguard', vessel: 'aegis', weaponId: null, shieldId: null, armor: {} },
  { name: 'Grappler', vessel: 'stalker', weaponId: null, shieldId: null, armor: {} },
  { name: 'Warden', vessel: 'sylva', weaponId: null, shieldId: null, armor: {} },
];

export interface WorldPickupSpec {
  id: string;
  lootId: string;
  x: number;
  z: number;
  /** Optional explicit Y (e.g. Great Oak Deck); omitted = ground(x, z). */
  y?: number;
  /** Seconds until a tactical item respawns (weapons/armor stay collected once picked). */
  respawnSec?: number;
}

/** 26 weapon, shield, modular armor & tactical item pickups placed across Elderwood Hollow & the 2 km Wilds. */
export const WORLD_PICKUPS: WorldPickupSpec[] = [
  // ── Elderwood Hollow (immediate discovery within 1–2 minutes of spawn) ──
  { id: 'hollow-frost-sword', lootId: 'frost_longsword', x: -50, z: 16 },              // Outpost Cabin porch
  { id: 'hollow-tower-shield', lootId: 'paladin_tower_shield', x: 52, z: 14 },         // Ruined Chapel arch
  { id: 'hollow-nyx-visor', lootId: 'nyx_visor', x: -16, z: 46 },                      // Watchtower foot
  { id: 'hollow-coral-trident', lootId: 'coral_trident', x: 24, z: 54 },               // Waterfall Pool bank
  { id: 'hollow-antler-crown', lootId: 'sylva_antler_crown', x: 10, z: -30, y: 12.2 }, // Great Oak Deck
  { id: 'hollow-spirit-1', lootId: 'spirit_cell', x: -28, z: 4, respawnSec: 45 },      // Log Tunnel mouth
  { id: 'hollow-medkit-1', lootId: 'aegis_medkit', x: 16, z: 22, respawnSec: 50 },     // Rune Monolith
  { id: 'hollow-gale-1', lootId: 'gale_elixir', x: -58, z: -20, respawnSec: 55 },      // Mossy Floor west
  // ── High Canopy (North) ──
  { id: 'canopy-shadow-dagger', lootId: 'shadow_dagger', x: -86, z: -268 },            // Sunken Ruins lip
  { id: 'canopy-lumen-wings', lootId: 'lumen_golden_wings', x: 118, z: -256 },         // Seedpod Lookout
  { id: 'canopy-elder-spear', lootId: 'elderwood_spear', x: 14, z: -124 },             // North Oak Platform
  // ── Westwood & Glowcap Hollow ──
  { id: 'west-cyber-gs', lootId: 'cyber_greatsword', x: -390, z: -50 },                // Settlement plaza
  { id: 'west-aegis-helm', lootId: 'aegis_helm', x: -325, z: -190 },                   // Treehouse Village
  { id: 'west-storm-staff', lootId: 'storm_staff', x: -418, z: 205 },                  // Glowcap Hollow center
  { id: 'west-pyre-belt', lootId: 'pyre_smith_belt', x: -148, z: 312 },                // Titan Tree entrance
  { id: 'west-gale-2', lootId: 'gale_elixir', x: -245, z: -40, respawnSec: 60 },
  // ── River, Glowcap Stream & Gorge ──
  { id: 'river-fin-crest', lootId: 'nyx_fin_crest', x: 232, z: 168 },                  // Glowcap Stream bank
  { id: 'gorge-warhammer', lootId: 'rune_warhammer', x: 186, z: 452 },                 // Gorge Arena ring
  { id: 'gorge-lumen-halo', lootId: 'lumen_halo', x: 266, z: 354 },                    // Crystal Vault
  { id: 'gorge-medkit-2', lootId: 'aegis_medkit', x: 256, z: 338, respawnSec: 60 },
  // ── Violet Vale & Mangrove Mire ──
  { id: 'mire-aegis-chest', lootId: 'aegis_chestplate', x: -326, z: 616 },             // Mangrove Mire
  { id: 'vale-solar-shield', lootId: 'solar_shield', x: 22, z: 596 },                  // Violet Vale clearing
  // ── Redwood Ruins (East / NE) ──
  { id: 'ruins-pyre-chest', lootId: 'pyre_obsidian_chest', x: 400, z: -108 },          // Portal Plaza
  { id: 'ruins-aegis-pauldron', lootId: 'aegis_pauldron', x: 236, z: -416 },           // Elder Cathedral
  { id: 'ruins-spirit-2', lootId: 'spirit_cell', x: 445, z: -380, respawnSec: 55 },    // Zone 10 Temple
  { id: 'ruins-gale-3', lootId: 'gale_elixir', x: 616, z: -236, respawnSec: 60 },      // Anomaly Shrine
];

const STORAGE_KEY = 'rift-realm-loadouts-v1';

export interface ArmoryEnv {
  scene: THREE.Scene;
  ground(x: number, z: number): number;
  wilds: boolean;
  onApply(preset: LoadoutPreset, stats: ComputedLoadoutStats): void;
  onItemEffect(effect: 'heal' | 'charge' | 'haste', def: LootDef): void;
  say(text: string, color: string): void;
}

interface LivePickup {
  spec: WorldPickupSpec;
  def: LootDef;
  group: THREE.Group;
  spinner: THREE.Group;
  collected: boolean;
  respawnT: number;
  pos: THREE.Vector3;
}

const glbCache = new Map<string, Promise<THREE.Object3D | null>>();
function loadGlb(url: string): Promise<THREE.Object3D | null> {
  let p = glbCache.get(url);
  if (!p) {
    p = new GLTFLoader().loadAsync(url).then((g) => g.scene).catch(() => null);
    glbCache.set(url, p);
  }
  return p;
}

const hexStr = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

export class WorldArmory {
  readonly group = new THREE.Group();
  readonly unlocked = new Set<string>();
  readonly loadouts: LoadoutPreset[];
  activeIdx = 0;
  private pickups: LivePickup[] = [];
  private panel: HTMLDivElement;
  private prompt: HTMLDivElement;
  private chip: HTMLDivElement;
  private open = false;
  private nearest: LivePickup | null = null;
  private t = 0;

  constructor(private env: ArmoryEnv) {
    this.group.name = 'world-armory-pickups';
    env.scene.add(this.group);

    // Load saved unlocked gear & custom loadouts from localStorage
    const saved = this.loadState();
    this.loadouts = saved.loadouts;
    this.activeIdx = saved.activeIdx;
    for (const id of saved.unlocked) if (LOOT_CATALOG[id]) this.unlocked.add(id);

    // Spawn 3D pickups across Elderwood Hollow (+ Wilds when active)
    const specs = env.wilds ? WORLD_PICKUPS : WORLD_PICKUPS.filter((s) => Math.abs(s.x) < 76 && Math.abs(s.z) < 76);
    const ringGeo = new THREE.TorusGeometry(0.68, 0.045, 8, 28);
    ringGeo.rotateX(Math.PI / 2);
    const beamGeo = new THREE.CylinderGeometry(0.14, 0.55, 2.8, 12, 1, true);
    const itemGeo = new THREE.OctahedronGeometry(0.32, 0);

    for (const spec of specs) {
      const def = LOOT_CATALOG[spec.lootId];
      if (!def) continue;
      // Already permanently unlocked weapon/armor? Still show respawnable items; keep unlocked gear hidden unless fresh
      const alreadyOwned = def.category !== 'item' && this.unlocked.has(def.id);
      const y = spec.y ?? env.ground(spec.x, spec.z);
      const grp = new THREE.Group();
      grp.position.set(spec.x, y, spec.z);
      grp.visible = !alreadyOwned;

      const col = new THREE.Color(def.color);
      const ringMat = new THREE.MeshBasicNodeMaterial({ color: col, transparent: true, opacity: 0.85 });
      const beamMat = new THREE.MeshBasicNodeMaterial({ color: col, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.08;
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.y = 1.4;
      const spinner = new THREE.Group();
      spinner.position.y = 1.05;
      grp.add(ring, beam, spinner);

      if (def.url) {
        void loadGlb(def.url).then((src) => {
          if (!src) return;
          const clone = src.clone(true);
          const box = new THREE.Box3().setFromObject(clone);
          const sz = box.getSize(new THREE.Vector3());
          const maxD = Math.max(sz.x, sz.y, sz.z, 0.1);
          const target = def.category === 'weapon' || def.category === 'shield' ? 1.25 : 0.85;
          clone.scale.setScalar(target / maxD);
          box.setFromObject(clone);
          const c = box.getCenter(new THREE.Vector3());
          clone.position.set(-c.x, -c.y, -c.z);
          if (def.category === 'weapon') clone.rotation.z = 0.45;
          spinner.add(clone);
        });
      } else {
        const orbMat = new THREE.MeshStandardNodeMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 1.5, roughness: 0.2, metalness: 0.5 });
        spinner.add(new THREE.Mesh(itemGeo, orbMat));
      }

      this.group.add(grp);
      this.pickups.push({ spec, def, group: grp, spinner, collected: alreadyOwned, respawnT: 0, pos: grp.position });
    }

    // ── HUD prompt, active loadout chip & Loadout Armory panel ──
    this.prompt = document.createElement('div');
    this.prompt.style.cssText = 'position:fixed;left:50%;bottom:146px;transform:translateX(-50%);z-index:15;pointer-events:none;padding:7px 14px;border:1px solid #38bdf8aa;border-radius:5px;background:#03101de6;color:#e2f3ff;font:800 12px/1.3 system-ui,sans-serif;letter-spacing:.1em;display:none;box-shadow:0 4px 18px #000a';

    this.chip = document.createElement('div');
    this.chip.style.cssText = 'position:fixed;left:16px;bottom:48px;z-index:12;pointer-events:none;padding:5px 10px;border:1px solid #38bdf866;border-radius:4px;background:#030d18cc;color:#bfe9ff;font:700 11px/1.35 system-ui,sans-serif;letter-spacing:.08em';

    this.panel = document.createElement('div');
    this.panel.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:45;width:680px;max-width:95vw;max-height:86vh;overflow-y:auto;padding:18px 20px;border:1px solid #38bdf8aa;border-radius:8px;background:#04101ef4;color:#e2f3ff;font:13px/1.45 system-ui,sans-serif;display:none;box-shadow:0 16px 50px #000c';
    for (const ev of ['mousedown', 'mouseup', 'click', 'pointerdown', 'wheel'] as const) {
      this.panel.addEventListener(ev, (e) => e.stopPropagation());
    }
    document.body.append(this.prompt, this.chip, this.panel);

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'KeyL') { this.toggle(); return; }
      if (e.code === 'Escape' && this.open) { this.toggle(false); return; }
      if (!this.open && e.code === 'BracketRight') this.selectLoadout((this.activeIdx + 1) % this.loadouts.length);
      if (!this.open && e.code === 'BracketLeft') this.selectLoadout((this.activeIdx + this.loadouts.length - 1) % this.loadouts.length);
    });

    this.updateChip();
  }

  get active(): LoadoutPreset { return this.loadouts[this.activeIdx]; }
  get stats(): ComputedLoadoutStats { return computeLoadoutStats(this.active); }
  get isOpen(): boolean { return this.open; }
  get nearbyPickup(): { name: string; category: LootCategory } | null {
    return this.nearest ? { name: this.nearest.def.name, category: this.nearest.def.category } : null;
  }

  /** Try to pick up the closest glowing weapon / armor / item within 3.4 m. Returns true if consumed. */
  tryPickup(): boolean {
    if (!this.nearest) return false;
    const p = this.nearest;
    p.collected = true;
    p.group.visible = false;
    p.respawnT = p.spec.respawnSec ?? 0;
    this.nearest = null;
    this.prompt.style.display = 'none';

    if (p.def.category === 'item' && p.def.itemEffect) {
      this.env.onItemEffect(p.def.itemEffect, p.def);
      this.env.say(`${p.def.name.toUpperCase()} · ${p.def.desc}`, hexStr(p.def.color));
      return true;
    }

    this.unlocked.add(p.def.id);
    // Auto-equip newly discovered weapon/shield/armor into active loadout immediately so players feel it right away!
    const cur = this.active;
    if (p.def.category === 'weapon') cur.weaponId = p.def.id;
    else if (p.def.category === 'shield') cur.shieldId = p.def.id;
    else if (p.def.category === 'armor' && p.def.armorSlot) cur.armor[p.def.armorSlot] = p.def.id;

    this.saveState();
    this.applyActive();
    this.env.say(`EQUIPPED ${p.def.name.toUpperCase()} · [L] LOADOUTS`, hexStr(p.def.color));
    return true;
  }

  selectLoadout(idx: number) {
    this.activeIdx = ((idx % this.loadouts.length) + this.loadouts.length) % this.loadouts.length;
    this.saveState();
    this.applyActive();
    this.env.say(`LOADOUT ${this.activeIdx + 1} · ${this.active.name.toUpperCase()}`, '#38bdf8');
    if (this.open) this.renderPanel();
  }

  applyActive() {
    this.updateChip();
    this.env.onApply(this.active, this.stats);
  }

  toggle(on = !this.open) {
    this.open = on;
    this.panel.style.display = on ? 'block' : 'none';
    if (on) {
      try { document.exitPointerLock(); } catch { /* none */ }
      this.renderPanel();
    }
  }

  update(dt: number, playerPos: THREE.Vector3, enabled: boolean) {
    this.t += dt;
    let best: LivePickup | null = null;
    let bestD = 3.5;

    for (const p of this.pickups) {
      if (p.collected) {
        if (p.respawnT > 0) {
          p.respawnT -= dt;
          if (p.respawnT <= 0) { p.collected = false; p.group.visible = true; }
        }
        continue;
      }
      const d = p.pos.distanceTo(playerPos);
      if (d < 95) {
        p.spinner.rotation.y += dt * 1.4;
        p.spinner.position.y = 1.05 + Math.sin(this.t * 2.4 + p.pos.x * 0.2) * 0.14;
      }
      if (enabled && d < bestD) { bestD = d; best = p; }
    }

    this.nearest = best;
    if (best && !this.open) {
      this.prompt.style.display = 'block';
      this.prompt.style.borderColor = hexStr(best.def.color);
      this.prompt.innerHTML = `<span style="color:${hexStr(best.def.color)}">[H] PICK UP ${best.def.name.toUpperCase()}</span> <span style="opacity:.75;font-weight:600">· ${best.def.desc}</span>`;
    } else {
      this.prompt.style.display = 'none';
    }
  }

  private updateChip() {
    const p = this.active;
    const wName = p.weaponId ? LOOT_CATALOG[p.weaponId]?.name ?? p.weaponId : VESSELS[p.vessel].weaponName;
    const armorCount = Object.values(p.armor).filter(Boolean).length + (p.shieldId ? 1 : 0);
    this.chip.innerHTML = `LOADOUT ${this.activeIdx + 1}: <b style="color:#7dd3fc">${p.name.toUpperCase()}</b> · ${wName}${armorCount ? ` · +${armorCount} GEAR` : ''} <span style="opacity:.65">[L] / [ ]</span>`;
  }

  private renderPanel() {
    const p = this.active;
    const st = this.stats;
    const unlockedList = [...this.unlocked].map((id) => LOOT_CATALOG[id]).filter(Boolean);
    const weapons = unlockedList.filter((d) => d.category === 'weapon');
    const shields = unlockedList.filter((d) => d.category === 'shield');
    const armors = unlockedList.filter((d) => d.category === 'armor');

    const tabHtml = this.loadouts.map((lo, i) => `
      <button data-lo="${i}" style="padding:7px 14px;border:1px solid ${i === this.activeIdx ? '#38bdf8' : '#334155'};border-radius:4px;background:${i === this.activeIdx ? '#0c2b44' : '#061424'};color:${i === this.activeIdx ? '#e0f2fe' : '#94a3b8'};font:700 12px system-ui;cursor:pointer">
        ${i + 1}. ${lo.name} (${VESSELS[lo.vessel].name.split(' ')[0]})
      </button>`).join('');

    const vesselBtns = VESSEL_ORDER.map((vid) => {
      const v = VESSELS[vid];
      const on = p.vessel === vid;
      const gTag = v.grapple ? ' · GRAPPLE' : '';
      return `<button data-vessel="${vid}" style="padding:6px 10px;border:1px solid ${on ? '#38bdf8' : '#1e293b'};border-radius:4px;background:${on ? '#0e3554' : '#071422'};color:#e2f3ff;font:700 11px system-ui;cursor:pointer">${v.name.split(' ')[0]}${gTag}</button>`;
    }).join('');

    const itemBtn = (id: string | null, label: string, sub: string, active: boolean, col: number, attr: string) => `
      <button ${attr}="${id ?? ''}" style="text-align:left;padding:8px 10px;border:1px solid ${active ? hexStr(col) : '#1e293b'};border-radius:5px;background:${active ? '#0d2a42' : '#061320'};color:#e2f3ff;cursor:pointer">
        <div style="font:700 12px system-ui;color:${active ? hexStr(col) : '#e2f3ff'}">${label}${active ? ' ✓' : ''}</div>
        <div style="font-size:11px;opacity:.75;margin-top:2px">${sub}</div>
      </button>`;

    this.panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div><b style="letter-spacing:.2em;font-size:15px">ARMORY & LOADOUTS</b> <span style="opacity:.65;font-size:11px">(${this.unlocked.size} / 19 gear discovered)</span></div>
        <button data-close="1" style="padding:4px 10px;border:1px solid #475569;border-radius:4px;background:transparent;color:#cbd5e1;cursor:pointer">CLOSE [L]</button>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">${tabHtml}</div>
      <div style="padding:8px 12px;border:1px solid #1e3a5f;border-radius:5px;background:#07192d;margin-bottom:12px;display:flex;gap:14px;flex-wrap:wrap;font-size:12px">
        <span>HP: <b style="color:#4ade80">${VESSELS[p.vessel].maxHp + st.maxHpBonus}</b></span>
        <span>DMG: <b style="color:#fbbf24">${Math.round(st.dmgMul * 100)}%</b></span>
        <span>ARMOR: <b style="color:#38bdf8">${Math.round(st.dmgReduce * 100)}%</b></span>
        <span>SPEED: <b style="color:#a5f3fc">${Math.round(st.moveMul * 100)}%</b></span>
        <span>SWIM: <b style="color:#2dd4bf">${Math.round(st.swimMul * 100)}%</b></span>
        <span>CLIMB: <b style="color:#c084fc">${Math.round(st.climbMul * 100)}%</b></span>
        <span>GRAPPLE: <b style="color:${VESSELS[p.vessel].grapple ? '#4ade80' : '#64748b'}">${VESSELS[p.vessel].grapple ? `${Math.round(VESSELS[p.vessel].grapple!.range * st.grappleRangeMul)}m` : 'NONE'}</b></span>
      </div>
      <div style="margin-bottom:12px"><div style="font-size:11px;letter-spacing:.14em;opacity:.7;margin-bottom:6px">SOUL VESSEL</div><div style="display:flex;gap:6px;flex-wrap:wrap">${vesselBtns}</div></div>
      <div style="margin-bottom:12px">
        <div style="font-size:11px;letter-spacing:.14em;opacity:.7;margin-bottom:6px">PRIMARY WEAPON</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:6px">
          ${itemBtn(null, VESSELS[p.vessel].weaponName, 'Signature Vessel weapon', p.weaponId === null, VESSELS[p.vessel].primaryColor, 'data-weap')}
          ${weapons.map((w) => itemBtn(w.id, w.name, w.desc, p.weaponId === w.id, w.color, 'data-weap')).join('')}
        </div>
      </div>
      <div style="margin-bottom:12px">
        <div style="font-size:11px;letter-spacing:.14em;opacity:.7;margin-bottom:6px">OFF-HAND SHIELD</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:6px">
          ${itemBtn(null, 'No Shield', 'Unencumbered off-hand', p.shieldId === null, 0x94a3b8, 'data-shield')}
          ${shields.map((s) => itemBtn(s.id, s.name, s.desc, p.shieldId === s.id, s.color, 'data-shield')).join('')}
        </div>
      </div>
      <div>
        <div style="font-size:11px;letter-spacing:.14em;opacity:.7;margin-bottom:6px">MODULAR 3D ARMOR PIECES ${armors.length ? '' : '— EXPLORE LANDMARKS TO DISCOVER'}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:6px">
          ${armors.map((a) => itemBtn(a.id, `${a.name} (${a.armorSlot})`, a.desc, p.armor[a.armorSlot!] === a.id, a.color, 'data-armor')).join('') || '<div style="opacity:.6;font-size:12px">Look for glowing beacons at Outpost Cabin, Ruined Chapel, Watchtower, Great Oak Deck, Waterfall Pool, and Wilds ruins.</div>'}
        </div>
      </div>
    `;

    this.panel.querySelector('[data-close]')?.addEventListener('click', () => this.toggle(false));
    this.panel.querySelectorAll<HTMLButtonElement>('[data-lo]').forEach((b) =>
      b.addEventListener('click', () => this.selectLoadout(Number(b.dataset.lo))),
    );
    this.panel.querySelectorAll<HTMLButtonElement>('[data-vessel]').forEach((b) =>
      b.addEventListener('click', () => { p.vessel = b.dataset.vessel as VesselId; this.saveState(); this.applyActive(); this.renderPanel(); }),
    );
    this.panel.querySelectorAll<HTMLButtonElement>('[data-weap]').forEach((b) =>
      b.addEventListener('click', () => { p.weaponId = b.dataset.weap || null; this.saveState(); this.applyActive(); this.renderPanel(); }),
    );
    this.panel.querySelectorAll<HTMLButtonElement>('[data-shield]').forEach((b) =>
      b.addEventListener('click', () => { p.shieldId = b.dataset.shield || null; this.saveState(); this.applyActive(); this.renderPanel(); }),
    );
    this.panel.querySelectorAll<HTMLButtonElement>('[data-armor]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.armor!;
        const def = LOOT_CATALOG[id];
        if (!def?.armorSlot) return;
        p.armor[def.armorSlot] = p.armor[def.armorSlot] === id ? undefined : id;
        this.saveState(); this.applyActive(); this.renderPanel();
      }),
    );
  }

  private loadState(): { loadouts: LoadoutPreset[]; activeIdx: number; unlocked: string[] } {
    const fallback = { loadouts: DEFAULT_LOADOUTS.map((l) => ({ ...l, armor: { ...l.armor } })), activeIdx: 0, unlocked: [] as string[] };
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as Partial<{ loadouts: LoadoutPreset[]; activeIdx: number; unlocked: string[] }>;
      if (!Array.isArray(parsed.loadouts) || parsed.loadouts.length < 3) return fallback;
      return {
        loadouts: parsed.loadouts.slice(0, 3).map((l, i) => ({
          name: l.name || DEFAULT_LOADOUTS[i].name,
          vessel: l.vessel && l.vessel in VESSELS ? l.vessel : DEFAULT_LOADOUTS[i].vessel,
          weaponId: l.weaponId && LOOT_CATALOG[l.weaponId] ? l.weaponId : null,
          shieldId: l.shieldId && LOOT_CATALOG[l.shieldId] ? l.shieldId : null,
          armor: l.armor && typeof l.armor === 'object' ? { ...l.armor } : {},
        })),
        activeIdx: Math.max(0, Math.min(2, Number(parsed.activeIdx) || 0)),
        unlocked: Array.isArray(parsed.unlocked) ? parsed.unlocked : [],
      };
    } catch { return fallback; }
  }

  private saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        loadouts: this.loadouts,
        activeIdx: this.activeIdx,
        unlocked: [...this.unlocked],
      }));
    } catch { /* private mode */ }
  }

  /** Debug helper: unlock all world weapons & armor immediately for quick loadout testing. */
  unlockAll() {
    for (const d of Object.values(LOOT_CATALOG)) if (d.category !== 'item') this.unlocked.add(d.id);
    this.saveState();
    if (this.open) this.renderPanel();
    return this.unlocked.size;
  }

  info() {
    return {
      activeLoadout: this.activeIdx + 1,
      name: this.active.name,
      vessel: this.active.vessel,
      weapon: this.active.weaponId ?? VESSELS[this.active.vessel].weaponName,
      shield: this.active.shieldId,
      armor: this.active.armor,
      unlocked: [...this.unlocked],
      pickupsRemaining: this.pickups.filter((p) => !p.collected).length,
      stats: this.stats,
    };
  }
}
