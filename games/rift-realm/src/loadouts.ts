// World Weapons, Modular 3D Armor Pickups, Tactical Field Items & 3-Slot Persistent Loadout Manager.
// Scatters our sculpted 3D GLB weapons (assets/weapons/) and modular armor pieces (assets/wardrobe/) across the map
// so players can pick them up, equip them live onto their character's bone sockets, and save/swap custom Loadouts.
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { VesselId } from './vessels';
import { VESSELS, VESSEL_ORDER } from './vessels';
import { findActiveGamepad } from './controls';

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
  onToggle?: (open: boolean) => void;
  /** Whether mid-game character switching is allowed (true only in Free Roam). */
  canSwitchVessel?: () => boolean;
  /** Live active player vessel id (used to show the locked vessel accurately in structured modes). */
  currentVessel?: () => VesselId;
  /** Display name of the current mode (e.g. 'Free Roam', 'Wave Survival', 'Campaign'). */
  modeName?: () => string;
}

interface LivePickup {
  spec: WorldPickupSpec;
  def: LootDef;
  group: THREE.Group;
  spinner: THREE.Group;
  placeholder: THREE.Mesh;
  meshState: 'none' | 'loading' | 'loaded';
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
  private activeGlbLoads = 0;
  private panel: HTMLDivElement;
  private prompt: HTMLDivElement;
  private chip: HTMLDivElement;
  private banner: HTMLDivElement;
  private bannerTimer = 0;
  private open = false;
  private nearest: LivePickup | null = null;
  private t = 0;
  private padMode = false;
  private focusIdx = 0;
  private padNavCd = 0;
  private padPrev: boolean[] = [];

  constructor(private env: ArmoryEnv) {
    this.group.name = 'world-armory-pickups';
    env.scene.add(this.group);

    // Load saved unlocked gear & custom loadouts from localStorage
    const saved = this.loadState();
    this.loadouts = saved.loadouts;
    this.activeIdx = saved.activeIdx;
    for (const id of saved.unlocked) if (LOOT_CATALOG[id]) this.unlocked.add(id);

    // Spawn 3D pickups across Elderwood Hollow (+ Wilds when active) with shared materials & proximity GLB streaming (zero boot GLB cost!)
    const specs = env.wilds ? WORLD_PICKUPS : WORLD_PICKUPS.filter((s) => Math.abs(s.x) < 76 && Math.abs(s.z) < 76);
    const ringGeo = new THREE.TorusGeometry(0.68, 0.045, 8, 28);
    ringGeo.rotateX(Math.PI / 2);
    const beamGeo = new THREE.CylinderGeometry(0.14, 0.55, 2.8, 12, 1, true);
    const itemGeo = new THREE.OctahedronGeometry(0.32, 0);
    const ringMats = new Map<number, THREE.MeshBasicNodeMaterial>();
    const beamMats = new Map<number, THREE.MeshBasicNodeMaterial>();
    const orbMats = new Map<number, THREE.MeshStandardNodeMaterial>();
    const getRingMat = (hex: number) => ringMats.get(hex) ?? ringMats.set(hex, new THREE.MeshBasicNodeMaterial({ color: hex, transparent: true, opacity: 0.85 })).get(hex)!;
    const getBeamMat = (hex: number) => beamMats.get(hex) ?? beamMats.set(hex, new THREE.MeshBasicNodeMaterial({ color: hex, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })).get(hex)!;
    const getOrbMat = (hex: number) => orbMats.get(hex) ?? orbMats.set(hex, new THREE.MeshStandardNodeMaterial({ color: hex, emissive: hex, emissiveIntensity: 1.5, roughness: 0.2, metalness: 0.5 })).get(hex)!;

    for (const spec of specs) {
      const def = LOOT_CATALOG[spec.lootId];
      if (!def) continue;
      // Already permanently unlocked weapon/armor? Still show respawnable items; keep unlocked gear hidden unless fresh
      const alreadyOwned = def.category !== 'item' && this.unlocked.has(def.id);
      const y = spec.y ?? env.ground(spec.x, spec.z);
      const grp = new THREE.Group();
      grp.position.set(spec.x, y, spec.z);
      grp.visible = !alreadyOwned;

      const ring = new THREE.Mesh(ringGeo, getRingMat(def.color));
      ring.position.y = 0.08;
      const beam = new THREE.Mesh(beamGeo, getBeamMat(def.color));
      beam.position.y = 1.4;
      const spinner = new THREE.Group();
      spinner.position.y = 1.05;
      const placeholder = new THREE.Mesh(itemGeo, getOrbMat(def.color));
      spinner.add(placeholder);
      grp.add(ring, beam, spinner);

      this.group.add(grp);
      this.pickups.push({
        spec, def, group: grp, spinner, placeholder,
        meshState: def.url ? 'none' : 'loaded',
        collected: alreadyOwned, respawnT: 0, pos: grp.position,
      });
    }

    // ── HUD prompt, Void Sanctum Loadout Card, Switch Banner & Armory panel ──
    this.prompt = document.createElement('div');
    this.prompt.style.cssText = 'position:fixed;left:50%;bottom:148px;transform:translateX(-50%);z-index:15;pointer-events:none;padding:8px 16px;border:1px solid #d9b26aaa;background:linear-gradient(160deg,#0e0a18eb,#07050ef2);color:#e9e4d8;font:700 12px/1.35 "Segoe UI",system-ui,sans-serif;letter-spacing:.1em;display:none;box-shadow:0 8px 26px #000c';

    this.chip = document.createElement('div');
    this.chip.style.cssText = 'position:fixed;left:var(--hud-edge,20px);bottom:58px;z-index:12;pointer-events:auto;cursor:pointer;padding:7px 12px;border:1px solid #d9b26a55;border-left:2px solid #d9b26a;background:linear-gradient(160deg,#0d0a16de,#07050ee6);color:#e9e4d8;font:600 11px/1.4 "Segoe UI",system-ui,sans-serif;letter-spacing:.08em;box-shadow:0 6px 20px #0009';
    this.chip.addEventListener('click', (e) => { e.stopPropagation(); this.toggle(); });

    this.banner = document.createElement('div');
    this.banner.style.cssText = 'position:fixed;left:50%;top:82px;transform:translateX(-50%) translateY(-8px);z-index:22;pointer-events:none;padding:10px 22px;border:1px solid #d9b26a88;background:linear-gradient(160deg,#0e0a18f2,#06040cf4);color:#e9e4d8;text-align:center;font-family:"Segoe UI",system-ui,sans-serif;opacity:0;transition:opacity .25s ease,transform .25s ease;box-shadow:0 12px 36px #000c';

    this.panel = document.createElement('div');
    this.panel.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:45;width:740px;max-width:95vw;max-height:86vh;overflow-y:auto;-webkit-overflow-scrolling:touch;touch-action:pan-y;padding:24px 26px;border:1px solid #d9b26a66;background:linear-gradient(165deg,#0e0a18f7,#06040df9);color:#e9e4d8;font:13px/1.45 "Segoe UI",system-ui,sans-serif;display:none;box-shadow:0 24px 70px #000e,inset 0 0 36px #d9b26a10;backdrop-filter:blur(10px)';
    for (const ev of ['mousedown', 'mouseup', 'click', 'pointerdown', 'wheel'] as const) {
      this.panel.addEventListener(ev, (e) => e.stopPropagation());
    }
    document.body.append(this.prompt, this.chip, this.banner, this.panel);

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
    this.showBanner(`EQUIPPED ${p.def.name.toUpperCase()}`, this.padMode ? 'Hold VIEW (or Start → Armory) to customize Loadouts' : 'Press [L] to customize Loadouts · [ / ] to switch slots', hexStr(p.def.color));
    return true;
  }

  private showBanner(title: string, sub: string, accent = '#d9b26a') {
    this.banner.style.borderColor = accent;
    this.banner.innerHTML = `<div style="font-size:12px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:${accent}">${title}</div><div style="font-size:11px;color:#cfc6dd;letter-spacing:.08em;margin-top:3px">${sub}</div>`;
    this.banner.style.opacity = '1';
    this.banner.style.transform = 'translateX(-50%) translateY(0)';
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => {
      this.banner.style.opacity = '0';
      this.banner.style.transform = 'translateX(-50%) translateY(-8px)';
    }, 2800);
  }

  selectLoadout(idx: number) {
    this.activeIdx = ((idx % this.loadouts.length) + this.loadouts.length) % this.loadouts.length;
    this.saveState();
    this.applyActive();
    const hint = this.padMode
      ? 'Hold LT + D-Pad ◀ ▶ to switch Loadout 1 / 2 / 3 · Hold VIEW for Armory'
      : 'Press [ or ] to switch Loadout 1 / 2 / 3 · Press L for Armory';
    this.showBanner(`LOADOUT ${this.activeIdx + 1} / ${this.loadouts.length} · ${this.active.name.toUpperCase()}`, hint, '#38bdf8');
    if (this.open) this.renderPanel();
  }

  applyActive() {
    this.updateChip();
    this.env.onApply(this.active, this.stats);
  }

  setPadMode(on: boolean) {
    if (this.padMode === on) return;
    this.padMode = on;
    this.updateChip();
    if (this.open) this.renderPanel();
  }

  /** Refresh HUD chip / Armory when mode locks or unlocks character switching. */
  refreshModeLock() {
    this.updateChip();
    if (this.open) this.renderPanel();
  }

  toggle(on = !this.open) {
    if (this.open === on) return;
    this.open = on;
    this.panel.style.display = on ? 'block' : 'none';
    if (on) {
      try { document.exitPointerLock(); } catch { /* none */ }
      this.focusIdx = 0;
      this.padNavCd = 0.22;
      const pad = findActiveGamepad(navigator.getGamepads?.());
      this.padPrev = pad ? pad.buttons.map((b) => Boolean(b.pressed || b.value > 0.45)) : [];
      this.renderPanel();
    }
    this.env.onToggle?.(on);
  }

  private applyFocus() {
    const btns = Array.from(this.panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    if (!btns.length) return;
    this.focusIdx = ((this.focusIdx % btns.length) + btns.length) % btns.length;
    btns.forEach((b, i) => {
      const on = this.padMode && i === this.focusIdx;
      b.style.outline = on ? '2px solid #d9b26a' : 'none';
      b.style.boxShadow = on ? '0 0 18px #d9b26a66' : 'none';
    });
    if (this.padMode) btns[this.focusIdx]?.scrollIntoView({ block: 'nearest' });
  }

  private pollGamepad(dt: number) {
    const pad = findActiveGamepad(navigator.getGamepads?.());
    if (!pad) return;
    const isDown = (i: number) => Boolean(pad.buttons[i]?.pressed || (pad.buttons[i]?.value ?? 0) > 0.45);
    const edge = (i: number) => {
      const d = isDown(i);
      const was = this.padPrev[i] ?? false;
      this.padPrev[i] = d;
      return d && !was;
    };

    if (edge(1) || edge(9)) { this.toggle(false); return; } // B / Circle or Start closes Armory
    if (edge(4)) { this.selectLoadout(this.activeIdx - 1); return; } // LB: prev loadout tab
    if (edge(5)) { this.selectLoadout(this.activeIdx + 1); return; } // RB: next loadout tab
    if (edge(0)) {
      const btns = Array.from(this.panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      btns[this.focusIdx]?.click();
      return;
    }

    this.padNavCd = Math.max(0, this.padNavCd - dt);
    const lx = pad.axes[0] ?? 0;
    const ly = pad.axes[1] ?? 0;
    const left = isDown(14) || lx < -0.55;
    const right = isDown(15) || lx > 0.55;
    const up = isDown(12) || ly < -0.55;
    const down = isDown(13) || ly > 0.55;
    if ((left || right || up || down) && this.padNavCd <= 0) {
      this.padMode = true;
      const step = left ? -1 : right ? 1 : up ? -3 : 3;
      this.focusIdx += step;
      this.applyFocus();
      this.padNavCd = 0.19;
    }
  }

  private streamPickupGlb(p: LivePickup) {
    if (!p.def.url || p.meshState !== 'none' || this.activeGlbLoads >= 2) return;
    p.meshState = 'loading';
    this.activeGlbLoads++;
    void loadGlb(p.def.url).then((src) => {
      if (!src) { p.meshState = 'loaded'; return; }
      const clone = src.clone(true);
      const box = new THREE.Box3().setFromObject(clone);
      const sz = box.getSize(new THREE.Vector3());
      const maxD = Math.max(sz.x, sz.y, sz.z, 0.1);
      const target = p.def.category === 'weapon' || p.def.category === 'shield' ? 1.25 : 0.85;
      clone.scale.setScalar(target / maxD);
      box.setFromObject(clone);
      const c = box.getCenter(new THREE.Vector3());
      clone.position.set(-c.x, -c.y, -c.z);
      if (p.def.category === 'weapon') clone.rotation.z = 0.45;
      p.placeholder.visible = false;
      p.spinner.add(clone);
      p.meshState = 'loaded';
    }).finally(() => {
      this.activeGlbLoads = Math.max(0, this.activeGlbLoads - 1);
    });
  }

  update(dt: number, playerPos: THREE.Vector3, enabled: boolean) {
    this.t += dt;
    if (this.open) this.pollGamepad(dt);
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
      if (enabled && d < 75 && p.meshState === 'none' && this.activeGlbLoads < 2) {
        this.streamPickupGlb(p);
      }
      if (d < 95) {
        p.spinner.rotation.y += dt * 1.4;
        p.spinner.position.y = 1.05 + Math.sin(this.t * 2.4 + p.pos.x * 0.2) * 0.14;
      }
      if (enabled && d < bestD) { bestD = d; best = p; }
    }

    this.nearest = best;
    if (best && !this.open) {
      const key = this.padMode ? 'D-UP' : 'H';
      this.prompt.style.display = 'block';
      this.prompt.style.borderColor = hexStr(best.def.color);
      this.prompt.innerHTML = `<kbd class="rr-kbd">${key}</kbd> <span style="color:${hexStr(best.def.color)};margin-left:4px">PICK UP ${best.def.name.toUpperCase()}</span> <span style="opacity:.78;font-weight:500">· ${best.def.desc}</span>`;
    } else {
      this.prompt.style.display = 'none';
    }
  }

  private shownVesselFor(p: LoadoutPreset): VesselId {
    const canSwitch = this.env.canSwitchVessel ? this.env.canSwitchVessel() : true;
    return !canSwitch && this.env.currentVessel ? this.env.currentVessel() : p.vessel;
  }

  private updateChip() {
    const p = this.active;
    const vid = this.shownVesselFor(p);
    const wName = p.weaponId ? LOOT_CATALOG[p.weaponId]?.name ?? p.weaponId : VESSELS[vid].weaponName;
    const armorCount = Object.values(p.armor).filter(Boolean).length + (p.shieldId ? 1 : 0);
    const pips = this.loadouts.map((_, i) =>
      `<span style="display:inline-block;padding:0 5px;margin-right:3px;border:1px solid ${i === this.activeIdx ? '#d9b26a' : '#ffffff26'};background:${i === this.activeIdx ? '#d9b26a33' : 'transparent'};color:${i === this.activeIdx ? '#fff8e6' : '#8f88a0'};font-size:10px;font-weight:700">${i + 1}</span>`,
    ).join('');
    const keys = this.padMode
      ? `<kbd class="rr-kbd">LT</kbd>+<kbd class="rr-kbd">D-◀▶</kbd> Swap · <kbd class="rr-kbd">HOLD VIEW</kbd> Armory`
      : `<kbd class="rr-kbd">[</kbd><kbd class="rr-kbd">]</kbd> Swap · <kbd class="rr-kbd">L</kbd> Armory`;
    this.chip.innerHTML = `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">${pips}<b style="color:#d9b26a;letter-spacing:.14em">${p.name.toUpperCase()}</b><span style="color:#cfc6dd">· ${wName}${armorCount ? ` · +${armorCount} Gear` : ''}</span></div><div style="margin-top:4px;font-size:10px;color:#9a93a8">${keys}</div>`;
  }

  private renderPanel() {
    const p = this.active;
    const st = this.stats;
    const canSwitch = this.env.canSwitchVessel ? this.env.canSwitchVessel() : true;
    const vid = this.shownVesselFor(p);
    const modeLabel = this.env.modeName?.() ?? 'Structured Mode';
    const unlockedList = [...this.unlocked].map((id) => LOOT_CATALOG[id]).filter(Boolean);
    const weapons = unlockedList.filter((d) => d.category === 'weapon');
    const shields = unlockedList.filter((d) => d.category === 'shield');
    const armors = unlockedList.filter((d) => d.category === 'armor');

    const tabHtml = this.loadouts.map((lo, i) => {
      const tabV = !canSwitch ? vid : lo.vessel;
      return `
      <button data-lo="${i}" style="padding:8px 14px;border:1px solid ${i === this.activeIdx ? '#d9b26a' : '#ffffff22'};background:${i === this.activeIdx ? 'linear-gradient(90deg,#d9b26a2c,#d9b26a0c)' : '#0b0812cc'};color:${i === this.activeIdx ? '#fff8e6' : '#9a93a8'};font:600 12px 'Segoe UI',sans-serif;letter-spacing:.12em;text-transform:uppercase;cursor:pointer">
        ${i + 1}. ${lo.name}${canSwitch ? ` · ${VESSELS[tabV].name.split(' ')[0]}` : ''}
      </button>`;
    }).join('');

    const vesselBtns = VESSEL_ORDER.map((vKey) => {
      const v = VESSELS[vKey];
      const on = vid === vKey;
      const gTag = v.grapple ? ' · GRAPPLE' : '';
      return `<button data-vessel="${vKey}" ${canSwitch ? '' : 'disabled'} style="padding:7px 12px;border:1px solid ${on ? '#38bdf8' : '#ffffff1c'};background:${on ? '#38bdf822' : '#0b0812cc'};color:${on ? '#fff' : '#9a93a8'};opacity:${canSwitch || on ? '1' : '0.35'};font:600 11px 'Segoe UI',sans-serif;letter-spacing:.12em;text-transform:uppercase;cursor:${canSwitch ? 'pointer' : 'not-allowed'}">${v.name.split(' ')[0]}${gTag}</button>`;
    }).join('');

    const itemBtn = (id: string | null, label: string, sub: string, active: boolean, col: number, attr: string) => `
      <button ${attr}="${id ?? ''}" style="text-align:left;padding:9px 11px;border:1px solid ${active ? hexStr(col) : '#ffffff18'};background:${active ? 'linear-gradient(155deg,#181328e8,#0c0916f0)' : '#0a0712cc'};color:#e9e4d8;cursor:pointer">
        <div style="font:600 12px 'Segoe UI',sans-serif;color:${active ? hexStr(col) : '#e9e4d8'};letter-spacing:.04em">${label}${active ? ' ◆' : ''}</div>
        <div style="font-size:11px;color:#9a93a8;margin-top:2px">${sub}</div>
      </button>`;

    this.panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;gap:12px;flex-wrap:wrap;padding-bottom:12px;border-bottom:1px solid #d9b26a33">
        <div>
          <div style="font-size:10px;letter-spacing:.34em;text-transform:uppercase;color:#d9b26a;margin-bottom:3px">Vesselbound · Loadout Sanctum</div>
          <div style="font:300 26px/1.05 'Segoe UI',sans-serif;letter-spacing:.2em;text-transform:uppercase;background:linear-gradient(180deg,#fff8e6 10%,#d9b26a 60%,#8b6832 100%);-webkit-background-clip:text;color:transparent">Armory &amp; Loadouts</div>
          <div style="font-size:11px;color:#9a93a8;margin-top:3px">${this.unlocked.size} / 19 world relics &amp; weapons discovered · Quick-swap anytime with ${this.padMode ? '<kbd class="rr-kbd">LT</kbd>+<kbd class="rr-kbd">D-◀▶</kbd>' : '<kbd class="rr-kbd">[</kbd> <kbd class="rr-kbd">]</kbd>'}</div>
        </div>
        <button data-close="1" style="padding:7px 14px;border:1px solid #d9b26a77;background:#d9b26a18;color:#fff8e6;font:600 11px 'Segoe UI',sans-serif;letter-spacing:.2em;text-transform:uppercase;cursor:pointer">${this.padMode ? 'Close [B]' : 'Close [L]'}</button>
      </div>
      ${this.padMode ? '<div style="font-size:11px;color:#e8c88a;margin-bottom:12px;letter-spacing:.08em"><kbd class="rr-kbd">D-PAD / LS</kbd> Navigate · <kbd class="rr-kbd btn-a">A</kbd> Equip · <kbd class="rr-kbd">LB</kbd> <kbd class="rr-kbd">RB</kbd> Loadout Slot · <kbd class="rr-kbd btn-b">B</kbd> Close</div>' : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">${tabHtml}</div>
      <div style="padding:9px 14px;border:1px solid #d9b26a33;border-left:2px solid #d9b26a;background:#0a0714cc;margin-bottom:14px;display:flex;gap:14px;flex-wrap:wrap;font-size:12px">
        <span>HP <b style="color:#4ade80">${VESSELS[vid].maxHp + st.maxHpBonus}</b></span>
        <span>DMG <b style="color:#fbbf24">${Math.round(st.dmgMul * 100)}%</b></span>
        <span>ARMOR <b style="color:#38bdf8">${Math.round(st.dmgReduce * 100)}%</b></span>
        <span>SPEED <b style="color:#a5f3fc">${Math.round(st.moveMul * 100)}%</b></span>
        <span>SWIM <b style="color:#2dd4bf">${Math.round(st.swimMul * 100)}%</b></span>
        <span>CLIMB <b style="color:#c084fc">${Math.round(st.climbMul * 100)}%</b></span>
        <span>GRAPPLE <b style="color:${VESSELS[vid].grapple ? '#4ade80' : '#64748b'}">${VESSELS[vid].grapple ? `${Math.round(VESSELS[vid].grapple!.range * st.grappleRangeMul)}m` : 'NONE'}</b></span>
      </div>
      <div style="margin-bottom:14px">
        <div style="font-size:10.5px;letter-spacing:.26em;color:#d9b26a;margin-bottom:6px;text-transform:uppercase">Soul Vessel ${canSwitch ? '· Free Roam (Switchable)' : `· Locked in ${modeLabel} (Switch in Free Roam)`}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${vesselBtns}</div>
      </div>
      <div style="margin-bottom:14px">
        <div style="font-size:10.5px;letter-spacing:.26em;color:#d9b26a;margin-bottom:6px;text-transform:uppercase">Primary Weapon</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px">
          ${itemBtn(null, VESSELS[vid].weaponName, 'Signature Vessel weapon', p.weaponId === null, VESSELS[vid].primaryColor, 'data-weap')}
          ${weapons.map((w) => itemBtn(w.id, w.name, w.desc, p.weaponId === w.id, w.color, 'data-weap')).join('')}
        </div>
      </div>
      <div style="margin-bottom:14px">
        <div style="font-size:10.5px;letter-spacing:.26em;color:#d9b26a;margin-bottom:6px;text-transform:uppercase">Off-Hand Shield</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px">
          ${itemBtn(null, 'No Shield', 'Unencumbered off-hand', p.shieldId === null, 0x94a3b8, 'data-shield')}
          ${shields.map((s) => itemBtn(s.id, s.name, s.desc, p.shieldId === s.id, s.color, 'data-shield')).join('')}
        </div>
      </div>
      <div>
        <div style="font-size:10.5px;letter-spacing:.26em;color:#d9b26a;margin-bottom:6px;text-transform:uppercase">Modular 3D Armor Pieces ${armors.length ? '' : '— Explore Landmarks to Discover'}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px">
          ${armors.map((a) => itemBtn(a.id, `${a.name} (${a.armorSlot})`, a.desc, p.armor[a.armorSlot!] === a.id, a.color, 'data-armor')).join('') || '<div style="color:#9a93a8;font-size:12px">Look for glowing beacons at Outpost Cabin, Ruined Chapel, Watchtower, Great Oak Deck, Waterfall Pool, and Wilds ruins.</div>'}
        </div>
      </div>
    `;

    this.panel.querySelector('[data-close]')?.addEventListener('click', () => this.toggle(false));
    this.panel.querySelectorAll<HTMLButtonElement>('[data-lo]').forEach((b) =>
      b.addEventListener('click', () => this.selectLoadout(Number(b.dataset.lo))),
    );
    this.panel.querySelectorAll<HTMLButtonElement>('[data-vessel]').forEach((b) =>
      b.addEventListener('click', () => {
        if (!canSwitch) return;
        p.vessel = b.dataset.vessel as VesselId;
        this.saveState(); this.applyActive(); this.renderPanel();
      }),
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
    this.applyFocus();
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
