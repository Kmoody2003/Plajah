// Rigged characters (Void Stalker = player, Robot Paladin = enemy) built from the concept turnarounds.
//
// ── Contract for the combat track (track 2 → track 3) ────────────────────────────────────────────────────────
// Rig: Y-up, faces +Z, feet at y = 0, ~2 m tall (CharacterRig scales to the height you pass). The Character Forge's
// human skeleton (58 joints; scripts/eraclash3d/forgeRigMesh.ts → services/argilla/creature/meshRig.ts): Hips, Spine,
// Spine1, Spine2, Neck, Head, Left/RightEye, Left/Right Shoulder/Arm/ForeArm/Hand, Left/Right UpLeg/Leg/Foot/ToeBase;
// twist joints Left/Right ArmTwist and ForeArmTwist; fingers Left/RightHand{Thumb,Index,Middle,Ring,Pinky}{1,2,3}.
// The Forge runtime (playkit/character/forgeRig.ts) runs after the mixer: twist drivers and hand grips (clips never
// key fingers or twists). Grips: rig.grip('Right', 'dagger' | 'fist' | 'relaxed' | 'katana').
// Sockets (plain nodes; attach weapon meshes with rig.socket(name)?.add(mesh)): hand_r_weapon, hand_l_weapon
// (palm centre; +Z along the fingers = blade/barrel forward, +Y toward the thumb) and back_weapon (on the back at
// Spine2; +Z down the spine, +Y out of the back).
//
// Clips (all from the characters' own motion videos, clips/<id>.json; its `source` names the video + seconds,
// `rootMotion` the travel {dx, dz, speed} the game should apply — clips play in place):
//   Void Stalker
//     locomotion  idle, combat_idle (video); walk, walk_back, run, run_back, sprint (CMU gait cycles; blended by
//                 update(), each played at ground speed ÷ its own speed)
//     movement    jump, land (hard), land_soft, rise, dash, dodge_back, wing_hover (+ the CMU moves below)
//     guns        aim_idle (= rifle_aim, CMU gun hold), shoot, pistol_aim, pistol_shoot, throw, draw
//                 (upper-body masked copies play over the legs while moving: see UPPER)
//     melee       light_1 → light_2 → light_3 (light chain), heavy_1 → heavy_2 → heavy_3 (heavy chain, 3 = launcher),
//                 attack_1 / attack_2 / attack_3 (the original F-strike / flourish / spin-arc names), block
//     finishers   finisher (dive ground slam), finisher_2 (blade plunge)
//   Robot Paladin  idle, walk, run, attack_1..3, block, aim_idle, rifle_aim, shoot, recover
//   Both, from the CMU motion-capture library (no video shows them; `source` names the take): strafe_left,
//     strafe_right, dodge_left, dodge_right (side-step at a run), vault, dive_roll, slide (a duck-under run), draw
//     (pulling a gun), death (a flip into a fall), get_up.
//   Guns, reloads, hits, deaths, slide/vault/roll come from Kenne's mocap body footage (2026-11-21): reload,
//   reload_pistol, switch_weapon, rifle_fire, knockdown, crouch_walk, run_rifle are new. Check rig.has(name) first.
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { getKTX2 } from './textures';
import { forgeRig, type ForgeRig } from '../../../playkit/character/forgeRig';
import { buildSecondary, windAt } from './secondary';
import type { SoftRegions } from '../../../playkit/character/softRegions';
import type { BatWings } from '../../../playkit/character/batWings';

const BASE = '/games/rift-realm/assets/characters/';

/** Travel of a clip in its own frame (+Z forward), m; speed in m/s (from the solve; clips play in place). */
export interface RootMotion { dx: number; dy: number; dz: number; speed: number; durationSec: number }
export interface CharacterAsset {
  scene: THREE.Object3D; clips: THREE.AnimationClip[];
  rootMotion?: Record<string, RootMotion>;
  source?: Record<string, { video: string; from: number; to: number; note: string }>;
}
export const assets: {
  stalker: CharacterAsset | null;
  paladin: CharacterAsset | null;
  seraph: CharacterAsset | null;
  sylva: CharacterAsset | null;
  pyre: CharacterAsset | null;
  extra: Record<string, CharacterAsset | null>;
} = { stalker: null, paladin: null, seraph: null, sylva: null, pyre: null, extra: {} };

export interface RosterEntry {
  id: string;
  name: string;
  category: 'vessel' | 'hero' | 'enemy' | 'boss' | 'mount' | 'warden';
  rig: 'forge58' | 'quadruped' | 'winged_dragon' | 'boss';
  heightM: number;
  clipsJson: boolean;
}

/** Complete Vesselbound / Rift Realm rigged character, mount, colossal boss & Grovewarden roster on disk. */
export const CHARACTER_ROSTER: readonly RosterEntry[] = [
  // Core playable Soul Vessels & companions (Batch 0 + Batch 1)
  { id: 'robot_paladin', name: 'Aegis (Robot Paladin)', category: 'vessel', rig: 'forge58', heightM: 2.02, clipsJson: true },
  { id: 'robot_paladin_armed', name: 'Aegis — Armed Boss (Lance & Shield)', category: 'boss', rig: 'forge58', heightM: 2.35, clipsJson: true },
  { id: 'void_stalker', name: 'Stalker (Void Stalker)', category: 'vessel', rig: 'forge58', heightM: 1.90, clipsJson: true },
  { id: 'seraph_9', name: 'Seraph-9', category: 'vessel', rig: 'forge58', heightM: 1.78, clipsJson: true },
  { id: 'sylva', name: 'Sylva (Rootwarden)', category: 'vessel', rig: 'forge58', heightM: 2.04, clipsJson: true },
  { id: 'pyre', name: 'Pyre (Cinder Smith)', category: 'vessel', rig: 'forge58', heightM: 2.15, clipsJson: true },
  { id: 'lumen', name: 'Lumen (Cyber Cherub)', category: 'hero', rig: 'forge58', heightM: 1.48, clipsJson: true },
  { id: 'nyx', name: 'Nyx (Shadow Panther)', category: 'mount', rig: 'quadruped', heightM: 1.15, clipsJson: false },
  // Batch 2A — Major Bosses & Flagship Heroes
  { id: 'fallen_archangel', name: 'Fallen Archangel', category: 'boss', rig: 'forge58', heightM: 2.65, clipsJson: true },
  { id: 'prism_archon', name: 'Prism Archon', category: 'boss', rig: 'forge58', heightM: 2.35, clipsJson: true },
  { id: 'cyber_minotaur', name: 'Cyber-Minotaur', category: 'boss', rig: 'forge58', heightM: 2.75, clipsJson: true },
  { id: 'dragon_knight', name: 'Celestial Dragon Knight', category: 'hero', rig: 'forge58', heightM: 2.25, clipsJson: true },
  { id: 'cyber_harpy', name: 'Cyber Harpy Sentinel', category: 'enemy', rig: 'forge58', heightM: 2.05, clipsJson: true },
  { id: 'magma_titan', name: 'Magma-Core Cyber-Titan', category: 'boss', rig: 'forge58', heightM: 4.50, clipsJson: true },
  // Batch 2B — Humanoid Heroes, Assassins & Warlords
  { id: 'cyber_assassin', name: 'Mantis-Blade Cyber-Assassin', category: 'enemy', rig: 'forge58', heightM: 1.92, clipsJson: true },
  { id: 'shadow_assassin', name: 'Neon-Magenta Shadow Assassin', category: 'hero', rig: 'forge58', heightM: 1.88, clipsJson: true },
  { id: 'female_warrior', name: 'Valkyrie Templar', category: 'hero', rig: 'forge58', heightM: 1.90, clipsJson: true },
  { id: 'sorceress', name: 'Frost-Rune Sorceress', category: 'hero', rig: 'forge58', heightM: 1.80, clipsJson: true },
  { id: 'demon_warrior', name: 'Pyre-Blade Berserker Demon', category: 'boss', rig: 'forge58', heightM: 2.45, clipsJson: true },
  { id: 'pyre_knight', name: 'Pyre-Knight Berserker', category: 'boss', rig: 'forge58', heightM: 2.40, clipsJson: true },
  { id: 'gorgon_construct', name: 'Cyber-Arcane Gorgon Construct', category: 'boss', rig: 'forge58', heightM: 2.30, clipsJson: true },
  // Batch 2C — Operatives, Golems, Mounts & Colossal World Bosses
  { id: 'android_a', name: 'Synthetic Operative A', category: 'enemy', rig: 'forge58', heightM: 1.92, clipsJson: true },
  { id: 'android_b', name: 'Synthetic Operative 09', category: 'enemy', rig: 'forge58', heightM: 1.84, clipsJson: true },
  { id: 'moss_golem', name: 'Moss-Covered Golem Warden', category: 'boss', rig: 'forge58', heightM: 3.60, clipsJson: true },
  { id: 'panther_demon', name: 'Predatory Shadow-Beast Stalker', category: 'enemy', rig: 'quadruped', heightM: 1.35, clipsJson: false },
  { id: 'light_panther_mount', name: 'Cybernetic Light-Panther Mount', category: 'mount', rig: 'quadruped', heightM: 1.28, clipsJson: false },
  { id: 'cyber_dragon_mount', name: 'Mechanical Cyber-Dragon Mount', category: 'mount', rig: 'winged_dragon', heightM: 2.10, clipsJson: false },
  { id: 'crystal_stag', name: 'Celestial Crystal-Antlered Light-Stag', category: 'mount', rig: 'quadruped', heightM: 2.15, clipsJson: false },
  { id: 'obsidian_rhino', name: 'Volcanic Obsidian Light-Rhino Mount', category: 'mount', rig: 'quadruped', heightM: 2.10, clipsJson: false },
  { id: 'rune_dragon', name: 'Glacial Rune-Dragon Archon', category: 'boss', rig: 'winged_dragon', heightM: 5.50, clipsJson: false },
  { id: 'marsh_kraken', name: 'Bio-Cybernetic Marshland Kraken', category: 'boss', rig: 'boss', heightM: 5.00, clipsJson: false },
  { id: 'void_leviathan', name: 'Colossal Obsidian Void Leviathan', category: 'boss', rig: 'boss', heightM: 6.00, clipsJson: false },
  // Batch 5 — All 12 Living Grovewardens (Tree Ents, matching src/ents/wardens.ts)
  { id: 'ent_ancient_oak', name: 'Ancient Oak Grovewarden', category: 'warden', rig: 'forge58', heightM: 41.0, clipsJson: true },
  { id: 'ent_banyan', name: 'Banyan Grovewarden', category: 'warden', rig: 'forge58', heightM: 38.4, clipsJson: true },
  { id: 'ent_baobab', name: 'Baobab Grovewarden', category: 'warden', rig: 'forge58', heightM: 36.2, clipsJson: true },
  { id: 'ent_bioluminescent', name: 'Bioluminescent Grovewarden', category: 'warden', rig: 'forge58', heightM: 37.9, clipsJson: true },
  { id: 'ent_cherry_blossom', name: 'Cherry Blossom Grovewarden', category: 'warden', rig: 'forge58', heightM: 37.0, clipsJson: true },
  { id: 'ent_fungal_spore', name: 'Fungal Spore Grovewarden', category: 'warden', rig: 'forge58', heightM: 36.6, clipsJson: true },
  { id: 'ent_ironwood_thorn', name: 'Ironwood Thorn Grovewarden', category: 'warden', rig: 'forge58', heightM: 40.1, clipsJson: true },
  { id: 'ent_pine_sentinel', name: 'Pine Sentinel Grovewarden', category: 'warden', rig: 'forge58', heightM: 43.0, clipsJson: true },
  { id: 'ent_sequoia', name: 'Giant Sequoia Grovewarden', category: 'warden', rig: 'forge58', heightM: 44.0, clipsJson: true },
  { id: 'ent_swamp_mangrove', name: 'Swamp Mangrove Grovewarden', category: 'warden', rig: 'forge58', heightM: 37.4, clipsJson: true },
  { id: 'ent_weeping_willow', name: 'Weeping Willow Grovewarden', category: 'warden', rig: 'forge58', heightM: 39.2, clipsJson: true },
  { id: 'ent_white_birch', name: 'White Birch Grovewarden', category: 'warden', rig: 'forge58', heightM: 42.0, clipsJson: true },
];

export const ROSTER_BY_ID: Record<string, RosterEntry> = Object.fromEntries(CHARACTER_ROSTER.map((r) => [r.id, r]));

export interface CreatureEntry {
  id: string;
  name: string;
  arch: 'wolf' | 'deer' | 'mantis' | 'wasp' | 'bat' | 'moth' | 'biped' | 'serpent' | 'crawler' | 'floater';
  heightM: number;
  url: string;
}

/** Complete 24-species Cyber Forest & Elderwood multi-view rigged fauna roster (embedded clips, JPEG PBR+emissive). */
export const CREATURE_ROSTER: readonly CreatureEntry[] = [
  // Core 6 Elderwood multi-view upgrades
  { id: 'electric_wolf', name: 'Electric Wolf', arch: 'wolf', heightM: 1.25, url: '/games/rift-realm/assets/creatures/rigged/electric_wolf.glb' },
  { id: 'lumen_deer', name: 'Lumen Deer', arch: 'deer', heightM: 1.85, url: '/games/rift-realm/assets/creatures/rigged/lumen_deer.glb' },
  { id: 'venom_mantis', name: 'Venom Mantis', arch: 'mantis', heightM: 1.70, url: '/games/rift-realm/assets/creatures/rigged/venom_mantis.glb' },
  { id: 'plasma_wasp', name: 'Plasma Wasp', arch: 'wasp', heightM: 1.35, url: '/games/rift-realm/assets/creatures/rigged/plasma_wasp.glb' },
  { id: 'storm_bat', name: 'Storm Bat', arch: 'bat', heightM: 1.50, url: '/games/rift-realm/assets/creatures/rigged/storm_bat.glb' },
  { id: 'glow_moth', name: 'Glow Moth', arch: 'moth', heightM: 1.15, url: '/games/rift-realm/assets/creatures/rigged/glow_moth.glb' },
  // Batch 3A Flagship Apex & Fauna
  { id: 'apex_drake', name: 'Apex Drake', arch: 'wolf', heightM: 1.95, url: '/games/rift-realm/assets/creatures/rigged/apex_drake.glb' },
  { id: 'amphibian_brute', name: 'Amphibian Brute', arch: 'biped', heightM: 2.35, url: '/games/rift-realm/assets/creatures/rigged/amphibian_brute.glb' },
  { id: 'shadow_stalker_beast', name: 'Shadow Stalker Beast', arch: 'wolf', heightM: 1.25, url: '/games/rift-realm/assets/creatures/rigged/shadow_stalker_beast.glb' },
  { id: 'bio_sloth', name: 'Bioluminescent Sloth', arch: 'biped', heightM: 2.10, url: '/games/rift-realm/assets/creatures/rigged/bio_sloth.glb' },
  { id: 'cryo_panther', name: 'Cryo-Elemental Panther', arch: 'wolf', heightM: 1.35, url: '/games/rift-realm/assets/creatures/rigged/cryo_panther.glb' },
  { id: 'hydro_serpent', name: 'Hydro-Kinetic Serpent', arch: 'serpent', heightM: 2.40, url: '/games/rift-realm/assets/creatures/rigged/hydro_serpent.glb' },
  // Batch 3B Cyber Forest Fauna
  { id: 'bio_axolotl', name: 'Bioluminescent Axolotl', arch: 'wolf', heightM: 0.75, url: '/games/rift-realm/assets/creatures/rigged/bio_axolotl.glb' },
  { id: 'cyan_bat', name: 'Cyan-Core Bat', arch: 'bat', heightM: 1.45, url: '/games/rift-realm/assets/creatures/rigged/cyan_bat.glb' },
  { id: 'glow_beetle', name: 'Glow Beetle', arch: 'mantis', heightM: 1.30, url: '/games/rift-realm/assets/creatures/rigged/glow_beetle.glb' },
  { id: 'blue_axolotl', name: 'Azure Bio-Axolotl', arch: 'wolf', heightM: 0.80, url: '/games/rift-realm/assets/creatures/rigged/blue_axolotl.glb' },
  { id: 'bio_turtle', name: 'Bioluminescent Turtle', arch: 'wolf', heightM: 1.05, url: '/games/rift-realm/assets/creatures/rigged/bio_turtle.glb' },
  { id: 'sky_jelly', name: 'Sky Jellyfish', arch: 'floater', heightM: 1.65, url: '/games/rift-realm/assets/creatures/rigged/sky_jelly.glb' },
  { id: 'cyber_dragonfly', name: 'Cyber Dragonfly', arch: 'wasp', heightM: 1.15, url: '/games/rift-realm/assets/creatures/rigged/cyber_dragonfly.glb' },
  { id: 'electric_newt', name: 'Electric Newt', arch: 'wolf', heightM: 0.90, url: '/games/rift-realm/assets/creatures/rigged/electric_newt.glb' },
  { id: 'acid_hornet', name: 'Acid Hornet', arch: 'wasp', heightM: 1.35, url: '/games/rift-realm/assets/creatures/rigged/acid_hornet.glb' },
  { id: 'venom_caterpillar', name: 'Venom Caterpillar', arch: 'crawler', heightM: 0.95, url: '/games/rift-realm/assets/creatures/rigged/venom_caterpillar.glb' },
  { id: 'poison_salamander', name: 'Poison Salamander', arch: 'wolf', heightM: 0.85, url: '/games/rift-realm/assets/creatures/rigged/poison_salamander.glb' },
  { id: 'venom_toad', name: 'Venomous Acid Toad', arch: 'wolf', heightM: 1.25, url: '/games/rift-realm/assets/creatures/rigged/venom_toad.glb' },
];

export interface WeaponEntry {
  id: string;
  name: string;
  kind: 'lance' | 'shield' | 'sword' | 'scythe' | 'dagger' | 'axe' | 'hammer' | 'spear' | 'bow' | 'chakram' | 'staff' | 'trident';
  lengthM: number;
  url: string;
}

/** Complete 14-item standalone socketable 3D PBR + emissive weapon roster (Batch 6). */
export const WEAPON_ROSTER: readonly WeaponEntry[] = [
  { id: 'paladin_tech_lance', name: 'Paladin Tech-Lance', kind: 'lance', lengthM: 2.15, url: '/games/rift-realm/assets/weapons/paladin_tech_lance.glb' },
  { id: 'paladin_tower_shield', name: 'Paladin Tower Shield', kind: 'shield', lengthM: 1.28, url: '/games/rift-realm/assets/weapons/paladin_tower_shield.glb' },
  { id: 'cyber_greatsword', name: 'Cyber Greatsword', kind: 'sword', lengthM: 1.75, url: '/games/rift-realm/assets/weapons/cyber_greatsword.glb' },
  { id: 'void_scythe', name: 'Void Energy Scythe', kind: 'scythe', lengthM: 2.05, url: '/games/rift-realm/assets/weapons/void_scythe.glb' },
  { id: 'frost_longsword', name: 'Glacial Frost Longsword', kind: 'sword', lengthM: 1.45, url: '/games/rift-realm/assets/weapons/frost_longsword.glb' },
  { id: 'shadow_dagger', name: 'Shadow Assassin Dagger', kind: 'dagger', lengthM: 0.58, url: '/games/rift-realm/assets/weapons/shadow_dagger.glb' },
  { id: 'magma_battleaxe', name: 'Magma-Core Battleaxe', kind: 'axe', lengthM: 1.38, url: '/games/rift-realm/assets/weapons/magma_battleaxe.glb' },
  { id: 'rune_warhammer', name: 'Arcane Rune Warhammer', kind: 'hammer', lengthM: 1.42, url: '/games/rift-realm/assets/weapons/rune_warhammer.glb' },
  { id: 'solar_shield', name: 'Solar Aegis Shield', kind: 'shield', lengthM: 0.95, url: '/games/rift-realm/assets/weapons/solar_shield.glb' },
  { id: 'elderwood_spear', name: 'Elderwood Living Spear', kind: 'spear', lengthM: 2.15, url: '/games/rift-realm/assets/weapons/elderwood_spear.glb' },
  { id: 'sylva_bow', name: 'Sylva Rootwarden Bow', kind: 'bow', lengthM: 1.48, url: '/games/rift-realm/assets/weapons/sylva_bow.glb' },
  { id: 'lumen_chakram', name: 'Lumen Celestial Chakram', kind: 'chakram', lengthM: 0.68, url: '/games/rift-realm/assets/weapons/lumen_chakram.glb' },
  { id: 'storm_staff', name: 'Tempest Storm Staff', kind: 'staff', lengthM: 2.10, url: '/games/rift-realm/assets/weapons/storm_staff.glb' },
  { id: 'coral_trident', name: 'Abyssal Coral Trident', kind: 'trident', lengthM: 2.18, url: '/games/rift-realm/assets/weapons/coral_trident.glb' },
];

export interface WardrobeEntry {
  id: string;
  name: string;
  slot: 'head' | 'chest' | 'shoulder' | 'belt' | 'gauntlet' | 'greave' | 'back' | 'weapon';
  mountBone: string;
  heightM: number;
  url: string;
}

/** Complete 21-piece modular 3D Vessel Wardrobe / Armor roster (Batch 7). */
export const WARDROBE_ROSTER: readonly WardrobeEntry[] = [
  { id: 'aegis_helm', name: 'Aegis Visored Helm', slot: 'head', mountBone: 'Head', heightM: 0.34, url: '/games/rift-realm/assets/wardrobe/aegis_helm.glb' },
  { id: 'aegis_chestplate', name: 'Aegis Soul-Core Chestplate', slot: 'chest', mountBone: 'Spine2', heightM: 0.52, url: '/games/rift-realm/assets/wardrobe/aegis_chestplate.glb' },
  { id: 'aegis_pauldron', name: 'Aegis Stone-Gold Pauldron', slot: 'shoulder', mountBone: 'LeftArm', heightM: 0.32, url: '/games/rift-realm/assets/wardrobe/aegis_pauldron.glb' },
  { id: 'aegis_belt', name: 'Aegis Paladin Belt', slot: 'belt', mountBone: 'Hips', heightM: 0.18, url: '/games/rift-realm/assets/wardrobe/aegis_belt.glb' },
  { id: 'aegis_gauntlet', name: 'Aegis Stone-Gold Gauntlet', slot: 'gauntlet', mountBone: 'LeftForeArm', heightM: 0.34, url: '/games/rift-realm/assets/wardrobe/aegis_gauntlet.glb' },
  { id: 'aegis_greave', name: 'Aegis Armored Greave', slot: 'greave', mountBone: 'LeftLeg', heightM: 0.42, url: '/games/rift-realm/assets/wardrobe/aegis_greave.glb' },
  { id: 'lumen_halo', name: 'Lumen Celestial Halo', slot: 'head', mountBone: 'Head', heightM: 0.54, url: '/games/rift-realm/assets/wardrobe/lumen_halo.glb' },
  { id: 'lumen_golden_wings', name: 'Lumen Golden Filigree Wings', slot: 'back', mountBone: 'Spine2', heightM: 0.95, url: '/games/rift-realm/assets/wardrobe/lumen_golden_wings.glb' },
  { id: 'lumen_chestplate', name: 'Lumen Enamel Cuirass', slot: 'chest', mountBone: 'Spine2', heightM: 0.44, url: '/games/rift-realm/assets/wardrobe/lumen_chestplate.glb' },
  { id: 'lumen_pauldron', name: 'Lumen Filigree Pauldron', slot: 'shoulder', mountBone: 'LeftArm', heightM: 0.30, url: '/games/rift-realm/assets/wardrobe/lumen_pauldron.glb' },
  { id: 'lumen_greave', name: 'Lumen Enamel Greave', slot: 'greave', mountBone: 'LeftLeg', heightM: 0.40, url: '/games/rift-realm/assets/wardrobe/lumen_greave.glb' },
  { id: 'nyx_fin_crest', name: 'Nyx Magenta Fin Crest', slot: 'back', mountBone: 'Spine2', heightM: 0.56, url: '/games/rift-realm/assets/wardrobe/nyx_fin_crest.glb' },
  { id: 'nyx_visor', name: 'Nyx Neon Hex Visor', slot: 'head', mountBone: 'Head', heightM: 0.16, url: '/games/rift-realm/assets/wardrobe/nyx_visor.glb' },
  { id: 'nyx_chitin_blade', name: 'Nyx Chitin Forearm Blade', slot: 'weapon', mountBone: 'RightHand', heightM: 0.68, url: '/games/rift-realm/assets/wardrobe/nyx_chitin_blade.glb' },
  { id: 'pyre_molten_hammer', name: 'Pyre Molten Forge Hammer', slot: 'weapon', mountBone: 'RightHand', heightM: 1.55, url: '/games/rift-realm/assets/wardrobe/pyre_molten_hammer.glb' },
  { id: 'pyre_obsidian_chest', name: 'Pyre Obsidian Chestplate', slot: 'chest', mountBone: 'Spine2', heightM: 0.54, url: '/games/rift-realm/assets/wardrobe/pyre_obsidian_chest.glb' },
  { id: 'pyre_iron_pauldron', name: 'Pyre Forged Iron Pauldron', slot: 'shoulder', mountBone: 'LeftArm', heightM: 0.34, url: '/games/rift-realm/assets/wardrobe/pyre_iron_pauldron.glb' },
  { id: 'pyre_smith_belt', name: 'Pyre Blacksmith Tool Belt', slot: 'belt', mountBone: 'Hips', heightM: 0.32, url: '/games/rift-realm/assets/wardrobe/pyre_smith_belt.glb' },
  { id: 'sylva_antler_crown', name: 'Sylva Amber Antler Crown', slot: 'head', mountBone: 'Head', heightM: 0.52, url: '/games/rift-realm/assets/wardrobe/sylva_antler_crown.glb' },
  { id: 'maris_coral_crown', name: 'Maris Reef Coral Crown', slot: 'head', mountBone: 'Head', heightM: 0.36, url: '/games/rift-realm/assets/wardrobe/maris_coral_crown.glb' },
  { id: 'maris_shell_pauldron', name: 'Maris Pearl Shell Mantle', slot: 'chest', mountBone: 'Spine2', heightM: 0.34, url: '/games/rift-realm/assets/wardrobe/maris_shell_pauldron.glb' },
];

export interface EnvAssetEntry {
  id: string;
  name: string;
  sub: string;
  heightM: number;
  url: string;
}

/** Complete 18-species Cyber Forest Flora, Mushroom, Fungi, Plant & Tree roster (Batch 8). */
export const FLORA_ROSTER: readonly EnvAssetEntry[] = [
  { id: 'neon_mushroom_cluster', name: 'Neon Circuit Mushroom Cluster', sub: 'mushroom', heightM: 2.4, url: '/games/rift-realm/assets/flora/neon_mushroom_cluster.glb' },
  { id: 'bio_tall_mushroom', name: 'Bioluminescent Tall Mushroom', sub: 'mushroom', heightM: 3.2, url: '/games/rift-realm/assets/flora/bio_tall_mushroom.glb' },
  { id: 'cyber_toadstool', name: 'Cybernetic Alien Toadstool', sub: 'mushroom', heightM: 2.1, url: '/games/rift-realm/assets/flora/cyber_toadstool.glb' },
  { id: 'bio_shelf_fungi', name: 'Bioluminescent Shelf Fungi', sub: 'fungi', heightM: 1.65, url: '/games/rift-realm/assets/flora/bio_shelf_fungi.glb' },
  { id: 'spore_bubble_fungi', name: 'Spore-Emitting Bulb Fungi', sub: 'fungi', heightM: 2.2, url: '/games/rift-realm/assets/flora/spore_bubble_fungi.glb' },
  { id: 'cf_blue_mushroom_cluster', name: 'Electric Blue Mushroom Cluster', sub: 'mushroom', heightM: 2.3, url: '/games/rift-realm/assets/flora/cf_blue_mushroom_cluster.glb' },
  { id: 'crystalline_flower_plant', name: 'Crystalline Quartz Flower', sub: 'plant', heightM: 2.6, url: '/games/rift-realm/assets/flora/crystalline_flower_plant.glb' },
  { id: 'glowing_flower_pod', name: 'Glowing Violet Flower Pod', sub: 'plant', heightM: 1.85, url: '/games/rift-realm/assets/flora/glowing_flower_pod.glb' },
  { id: 'carnivorous_maw_plant', name: 'Bio-Mechanical Carnivorous Maw', sub: 'plant', heightM: 2.8, url: '/games/rift-realm/assets/flora/carnivorous_maw_plant.glb' },
  { id: 'cyber_glowing_fern', name: 'Cybernetic Glowing Fern', sub: 'plant', heightM: 1.6, url: '/games/rift-realm/assets/flora/cyber_glowing_fern.glb' },
  { id: 'cyber_resin_stump', name: 'Glowing Amber Resin Stump', sub: 'prop', heightM: 2.4, url: '/games/rift-realm/assets/flora/cyber_resin_stump.glb' },
  { id: 'cyber_lotus_aquatic', name: 'Cybernetic Aquatic Lotus', sub: 'plant', heightM: 1.3, url: '/games/rift-realm/assets/flora/cyber_lotus_aquatic.glb' },
  { id: 'bioluminescent_tree', name: 'Bioluminescent Violet Tree', sub: 'tree', heightM: 11.5, url: '/games/rift-realm/assets/flora/bioluminescent_tree.glb' },
  { id: 'cyber_willow_tree', name: 'Cyan Weeping Cyber Willow', sub: 'tree', heightM: 12.0, url: '/games/rift-realm/assets/flora/cyber_willow_tree.glb' },
  { id: 'cyber_canopy_tree', name: 'Elderwood Cyber Canopy Tree', sub: 'tree', heightM: 13.0, url: '/games/rift-realm/assets/flora/cyber_canopy_tree.glb' },
  { id: 'cyber_oak_tree', name: 'Cybernetic Sentinel Oak', sub: 'tree', heightM: 14.5, url: '/games/rift-realm/assets/flora/cyber_oak_tree.glb' },
  { id: 'cyber_mangrove_tree', name: 'Cybernetic Root Mangrove', sub: 'tree', heightM: 10.5, url: '/games/rift-realm/assets/flora/cyber_mangrove_tree.glb' },
  { id: 'cyber_hollow_log', name: 'Armored Hollow Log Tunnel', sub: 'prop', heightM: 2.8, url: '/games/rift-realm/assets/flora/cyber_hollow_log.glb' },
];

/** Complete 18-structure Multi-View Biome Architecture roster across Cyber Forest, Emberfall Caldera & Sunken Cathedral (Batch 9). */
export const STRUCTURE_ROSTER: readonly EnvAssetEntry[] = [
  { id: 'struct_great_oak', name: 'Great Oak Sanctuary', sub: 'cyber-forest', heightM: 24.0, url: '/games/rift-realm/assets/structures/struct_great_oak.glb' },
  { id: 'struct_central_platform', name: 'Central Rune Tree Platform', sub: 'cyber-forest', heightM: 12.0, url: '/games/rift-realm/assets/structures/struct_central_platform.glb' },
  { id: 'struct_outpost_cabin', name: 'Timber Outpost Cabin', sub: 'cyber-forest', heightM: 6.5, url: '/games/rift-realm/assets/structures/struct_outpost_cabin.glb' },
  { id: 'struct_ruined_chapel', name: 'Mossy Ruined Forest Chapel', sub: 'cyber-forest', heightM: 9.5, url: '/games/rift-realm/assets/structures/struct_ruined_chapel.glb' },
  { id: 'struct_watchtower', name: 'Forest Timber Watchtower', sub: 'cyber-forest', heightM: 13.0, url: '/games/rift-realm/assets/structures/struct_watchtower.glb' },
  { id: 'struct_rune_monolith', name: 'Glowing Rune Monolith', sub: 'cyber-forest', heightM: 7.5, url: '/games/rift-realm/assets/structures/struct_rune_monolith.glb' },
  { id: 'struct_ruin_arch', name: 'Moss-Draped Ruin Archway', sub: 'cyber-forest', heightM: 6.8, url: '/games/rift-realm/assets/structures/struct_ruin_arch.glb' },
  { id: 'struct_forge_platform', name: 'Central Forge Arena Platform', sub: 'emberfall-caldera', heightM: 6.0, url: '/games/rift-realm/assets/structures/struct_forge_platform.glb' },
  { id: 'struct_ruined_forge_hall', name: 'Ruined Caldera Forge Hall', sub: 'emberfall-caldera', heightM: 10.0, url: '/games/rift-realm/assets/structures/struct_ruined_forge_hall.glb' },
  { id: 'struct_magma_vent', name: 'Obsidian Magma Vent Crater', sub: 'emberfall-caldera', heightM: 5.5, url: '/games/rift-realm/assets/structures/struct_magma_vent.glb' },
  { id: 'struct_collapsed_furnace', name: 'Collapsed Volcanic Furnace', sub: 'emberfall-caldera', heightM: 8.5, url: '/games/rift-realm/assets/structures/struct_collapsed_furnace.glb' },
  { id: 'struct_obsidian_monolith', name: 'Molten Obsidian Monolith', sub: 'emberfall-caldera', heightM: 8.5, url: '/games/rift-realm/assets/structures/struct_obsidian_monolith.glb' },
  { id: 'struct_sunken_nave', name: 'Sunken Cathedral Nave', sub: 'sunken-cathedral', heightM: 14.0, url: '/games/rift-realm/assets/structures/struct_sunken_nave.glb' },
  { id: 'struct_bell_tower', name: 'Cathedral Gothic Bell Tower', sub: 'sunken-cathedral', heightM: 18.0, url: '/games/rift-realm/assets/structures/struct_bell_tower.glb' },
  { id: 'struct_collapsed_arch', name: 'Flooded Cathedral Bridge Arch', sub: 'sunken-cathedral', heightM: 8.0, url: '/games/rift-realm/assets/structures/struct_collapsed_arch.glb' },
  { id: 'struct_altar_relic', name: 'Cathedral Reliquary Altar', sub: 'sunken-cathedral', heightM: 3.6, url: '/games/rift-realm/assets/structures/struct_altar_relic.glb' },
  { id: 'struct_rose_window', name: 'Gothic Stained-Glass Rose Window', sub: 'sunken-cathedral', heightM: 9.5, url: '/games/rift-realm/assets/structures/struct_rose_window.glb' },
  { id: 'struct_gargoyle_column', name: 'Carved Gargoyle Stone Column', sub: 'sunken-cathedral', heightM: 7.5, url: '/games/rift-realm/assets/structures/struct_gargoyle_column.glb' },
];

const inFlightCharacters = new Map<string, Promise<CharacterAsset | null>>();

const VESSEL_ASSET_MAP: Record<string, { fileId: string; key: 'stalker' | 'paladin' | 'seraph' | 'sylva' | 'pyre' }> = {
  aegis: { fileId: 'robot_paladin', key: 'paladin' },
  stalker: { fileId: 'void_stalker', key: 'stalker' },
  seraph: { fileId: 'seraph_9', key: 'seraph' },
  sylva: { fileId: 'sylva', key: 'sylva' },
  pyre: { fileId: 'pyre', key: 'pyre' },
};

/** Load any Vesselbound roster character (e.g. 'lumen', 'nyx', bosses, mounts, wardens) with in-flight deduplication. */
export async function loadCharacterAsset(id: string): Promise<CharacterAsset | null> {
  if (id === 'void_stalker' && assets.stalker) return assets.stalker;
  if (id === 'robot_paladin' && assets.paladin) return assets.paladin;
  if (id === 'seraph_9' && assets.seraph) return assets.seraph;
  if (id === 'sylva' && assets.sylva) return assets.sylva;
  if (id === 'pyre' && assets.pyre) return assets.pyre;
  if (id in assets.extra) return assets.extra[id];
  const existing = inFlightCharacters.get(id);
  if (existing) return existing;
  const job = (async () => {
    const a = await load(`${id}.glb`);
    const meta = ROSTER_BY_ID[id];
    if (a && (!meta || meta.clipsJson)) await videoClips(a, id);
    if (id === 'void_stalker') assets.stalker = a;
    else if (id === 'robot_paladin') assets.paladin = a;
    else if (id === 'seraph_9') assets.seraph = a;
    else if (id === 'sylva') assets.sylva = a;
    else if (id === 'pyre') assets.pyre = a;
    else assets.extra[id] = a;
    return a;
  })().finally(() => { inFlightCharacters.delete(id); });
  inFlightCharacters.set(id, job);
  return job;
}

/** Load only the single active playable vessel during boot (~16 MB instead of ~81 MB for all 5). */
export async function preloadVessel(vesselId: string): Promise<CharacterAsset | null> {
  const entry = VESSEL_ASSET_MAP[vesselId] ?? VESSEL_ASSET_MAP.aegis;
  return loadCharacterAsset(entry.fileId);
}

/** Gently trickle-load the remaining playable vessels 1 at a time after gameplay starts so Free Roam swaps stay instant. */
export function trickleRemainingVessels(activeVesselId: string) {
  if (typeof window === 'undefined') return;
  const rest = Object.keys(VESSEL_ASSET_MAP).filter((id) => id !== activeVesselId);
  let idx = 0;
  const next = () => {
    const id = rest[idx++];
    if (!id) return;
    void preloadVessel(id).finally(() => { window.setTimeout(next, 1400); });
  };
  window.setTimeout(next, 4500);
}

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

/**
 * Clips studied from a character's own motion video (services/mocap: capture → solve → retarget onto the rig), stored
 * beside the model as clips/<id>.json. They replace the same-named Muse clips and add new ones (land, wing_hover).
 */
async function videoClips(asset: CharacterAsset | null, id: string) {
  if (!asset) return;
  try {
    const res = await fetch(BASE + 'clips/' + id + '.json');
    if (!res.ok) return;
    const data = await res.json() as { clips: THREE.AnimationClipJSON[]; rootMotion?: CharacterAsset['rootMotion']; source?: CharacterAsset['source'] };
    asset.rootMotion = data.rootMotion; asset.source = data.source;
    for (const json of data.clips) {
      const clip = THREE.AnimationClip.parse(json);
      asset.clips = asset.clips.filter((c) => c.name.toLowerCase() !== clip.name.toLowerCase());
      asset.clips.push(clip);
    }
  } catch { /* no video clips: the Muse set stays */ }
}

export async function preloadCharacters() {
  await Promise.all([
    loadCharacterAsset('void_stalker'),
    loadCharacterAsset('robot_paladin'),
    loadCharacterAsset('seraph_9'),
    loadCharacterAsset('sylva'),
    loadCharacterAsset('pyre'),
  ]);
}

/** Gun / guard clips that also get an upper-body-only copy (the legs keep the locomotion underneath). */
/** Height of a character's body: skinned vertices, leaving out rigid cloak parts (100 % Spine2). */
function bodyHeight(model: THREE.Object3D): number {
  model.updateMatrixWorld(true);
  let lo = Infinity, hi = -Infinity;
  const v = new THREE.Vector3();
  model.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isMesh) return;
    const pos = m.geometry.getAttribute('position'), si = m.geometry.getAttribute('skinIndex'), sw = m.geometry.getAttribute('skinWeight');
    const sp = m.isSkinnedMesh ? m.skeleton.bones.findIndex((b) => /Spine2$/.test(b.name)) : -1;
    for (let i = 0; i < pos.count; i += 3) {
      if (sp >= 0 && si && sw && si.getX(i) === sp && sw.getX(i) > 0.999) continue;
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      lo = Math.min(lo, v.y); hi = Math.max(hi, v.y);
    }
  });
  return hi > lo ? hi - lo : new THREE.Box3().setFromObject(model).getSize(v).y;
}

const UPPER = ['shoot', 'reload', 'reload_pistol', 'switch_weapon', 'hit', 'aim_idle', 'rifle_aim', 'pistol_aim', 'pistol_shoot', 'throw', 'block', 'draw'];

export type Locomotion = 'idle' | 'run' | 'strafe_left' | 'strafe_right' | 'walk' | 'sprint' | 'walk_back' | 'run_back';

const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Blended locomotion (the Ravencrest / Era Clash scheme): idle, run and both strafes play all the time and their
 * weights follow speed and direction, so starts, stops and turns flow instead of snapping between clips. Playback
 * is speed-matched (no foot-sliding at sprint), strafes stay in step with the run, and backpedalling plays the run
 * in reverse. One-shots (shoot / hit / attack) layer over the legs, lighter while moving so the run keeps going.
 */
export class CharacterRig {
  readonly root = new THREE.Group();
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  /** Locomotion layers; `nat` = the clip's own ground speed in m/s at this rig's size (from its root motion). */
  private loco: { name: string; act: THREE.AnimationAction; w: number; nat: number }[] = [];
  private shot: { act: THREE.AnimationAction; base: number; left: number; dur: number; upper: boolean } | null = null;
  private moving = 0;
  /** A clip that holds its last frame over everything (death, knockdown) until release(). */
  private held: { act: THREE.AnimationAction; w: number } | null = null;
  /** 0…1 toward the crouch layer (crouch_walk: played at ground speed, frozen when standing still). */
  crouch = false;
  private crouchW = 0;
  private crouchAct: { act: THREE.AnimationAction; nat: number } | null = null;
  /** True while running with a vessel gun drawn (blends the mocap `run_rifle` clip into forward runs). */
  runRifle = false;
  private runRifleW = 0;
  private runRifleAct: { act: THREE.AnimationAction; nat: number } | null = null;
  /** Upper-body-only copies of the gun clips: they play over a run without touching the legs. */
  private upper = new Map<string, THREE.AnimationAction>();
  private spine: THREE.Bone[] = [];
  /** Each spine bone's rest rotation: the aim bend is laid on top of the animated pose every frame, so a bone no clip
   *  keys (the Forge rig's Spine1) must start each frame from rest or the bend adds up and the torso spins. */
  private spineRest: THREE.Quaternion[] = [];
  private sockets = new Map<string, THREE.Object3D>();
  /** The Character Forge runtime: twist drivers, hand grips, springs (null on a rig without `extras.forge`). */
  private forge: ForgeRig | null = null;
  /** Outfit swing (coat, hood, pouches / tabard, tassets): secondary.ts. Null with ?soft=0 or no loose parts. */
  readonly soft: SoftRegions | null = null;
  /** The Void Stalker's bat wings: set `wings.target` (open / sweep / lift); null on other characters. */
  readonly wings: BatWings | null = null;
  /** World velocity of the character (m/s), measured from its travel; drives the air past the cloth. */
  readonly velocity = new THREE.Vector3();
  private secT = 0;
  private lastPos = new THREE.Vector3();
  private hasPos = false;
  private windV = new THREE.Vector3();
  /** Glide posture (glide.ts sets it): weight 0…1 and body pitch toward prone (rad, + = head forward / down). The
   *  body tips about the hips, legs trail in line, arms sweep back and a little out, the head lifts to look ahead. */
  readonly glidePose = { w: 0, pitch: 0 };
  private gw = 0;
  private gp = 0;
  private model!: THREE.Object3D;
  private heightM = 1.9;
  private boneByName = new Map<string, THREE.Object3D>();
  /** A looping pose layer over everything (the glide's wing_hover): weight chases `poseLayerW`. */
  private poseLayer: { act: THREE.AnimationAction; w: number } | null = null;
  poseLayerW = 0;
  /** Aim pitch (radians, + = up): the spine bends so the gun points where the player aims. */
  aimPitch = 0;
  private aimApplied = 0;

  constructor(asset: CharacterAsset, height = 1.9) {
    const model = (this.model = SkeletonUtils.clone(asset.scene));
    this.heightM = height;
    // sized by the BODY (feet → hood), not the whole bbox: the Void Stalker's wing cloak rises above its hood like
    // the art, and must not shrink the character (the cloak is pinned rigidly to Spine2; body weights are blended)
    const h = Math.max(0.01, bodyHeight(model));
    model.scale.setScalar(height / h);
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    for (const c of asset.clips) this.actions.set(c.name.toLowerCase(), this.mixer.clipAction(c));
    // Upright standing idle (never force the twisted/slanted rifle-aim stance as the default resting idle)
    const idle = this.has('idle') ? 'idle' : this.has('hero_idle') ? 'hero_idle' : 'aim_idle';
    for (const name of [idle, 'walk', 'run', 'strafe_left', 'strafe_right', 'sprint', 'walk_back', 'run_back']) {
      const act = this.actions.get(name);
      if (!act) continue;
      act.setLoop(THREE.LoopRepeat, Infinity).play();
      act.setEffectiveWeight(name === idle ? 1 : 0);
      // playback follows ground speed: each cycle's own speed comes from its root motion (scaled to this rig)
      const rm = asset.rootMotion?.[name];
      // a cycle whose recorded travel is too small to trust (the side-run video: seen from the front, the solved root
      // barely moves) falls back to a typical cadence for its kind
      const rmSpeed = rm && rm.durationSec > 0 ? Math.hypot(rm.dx, rm.dz) / rm.durationSec : 0;
      const trust = name.startsWith('strafe') ? 1.5 : 0.4; // a side-run solved from the front under-reads its travel
      const nat = rmSpeed >= trust ? rmSpeed * (height / h) : ({ walk: 1.5, run: 3.6, sprint: 4.4, walk_back: 1.5, run_back: 3.6, strafe_left: 2.8, strafe_right: 2.8 } as Record<string, number>)[name] ?? 0;
      this.loco.push({ name: name === idle ? 'idle' : name, act, w: name === idle ? 1 : 0, nat });
    }
    const cw = this.actions.get('crouch_walk');
    if (cw) {
      cw.setLoop(THREE.LoopRepeat, Infinity).play();
      cw.setEffectiveWeight(0);
      const rm = asset.rootMotion?.crouch_walk;
      this.crouchAct = { act: cw, nat: rm && rm.durationSec > 0 ? Math.max(0.4, Math.hypot(rm.dx, rm.dz) / rm.durationSec * (height / h)) : 1.1 };
    }
    const rr = this.actions.get('run_rifle');
    if (rr) {
      rr.setLoop(THREE.LoopRepeat, Infinity).play();
      rr.setEffectiveWeight(0);
      const rm = asset.rootMotion?.run_rifle;
      this.runRifleAct = { act: rr, nat: rm && rm.durationSec > 0 ? Math.max(1.8, Math.hypot(rm.dx, rm.dz) / rm.durationSec * (height / h)) : 3.6 };
    }
    // legs + hips are left to the locomotion; everything above the hips (spine, arms, head) takes the gun clip
    const lower = /(^|[:_|])?(Hips|LeftUpLeg|RightUpLeg|LeftLeg|RightLeg|LeftFoot|RightFoot|LeftToe\w*|RightToe\w*)$/;
    for (const c of asset.clips) {
      const n = c.name.toLowerCase();
      if (!UPPER.includes(n)) continue;
      const tracks = c.tracks.filter((t) => !lower.test(t.name.split('.')[0]));
      if (tracks.length && tracks.length < c.tracks.length) this.upper.set(n, this.mixer.clipAction(new THREE.AnimationClip(`${n}_upper`, c.duration, tracks)));
    }
    model.traverse((o) => {
      if ((o as THREE.Bone).isBone && /Spine\d?$/.test(o.name)) this.spine.push(o as THREE.Bone);
      if (/^(hand_r_weapon|hand_l_weapon|back_weapon)$/.test(o.name)) this.sockets.set(o.name, o);
    });
    this.spineRest = this.spine.map((b) => b.quaternion.clone());
    this.forge = forgeRig(model);
    model.traverse((o) => { if ((o as THREE.Bone).isBone) this.boneByName.set(o.name.replace(/^.*[:|]/, ''), o); });
    const sec = buildSecondary(model);
    this.soft = sec.soft; this.wings = sec.wings;
  }

  /** Loop `name` as a pose layer (e.g. 'wing_hover' while gliding); its weight follows poseLayerW. */
  setPoseLayer(name: string | null) {
    const a = name ? this.actions.get(name.toLowerCase()) : undefined;
    if (this.poseLayer?.act === a) return;
    this.poseLayer?.act.stop();
    this.poseLayer = a ? { act: a.reset().setLoop(THREE.LoopRepeat, Infinity).play(), w: 0 } : null;
    this.poseLayer?.act.setEffectiveWeight(0);
  }

  /** A hit or a shove (m/s, world) through the cloth and the wings. */
  shove(v: THREE.Vector3) { this.soft?.impulse(v); }

  /** Hand grip pose from the Forge (relaxed, fist, dagger, katana). */
  grip(hand: 'Left' | 'Right', pose: string) { this.forge?.grip(hand, pose); }

  /** Whether the character has a clip of this name (see the contract at the top of this file). */
  has(n: string) { return this.actions.has(n.toLowerCase()); }
  /** Every clip name the character carries. */
  get clipNames() { return [...this.actions.keys()]; }
  /** A weapon socket: hand_r_weapon, hand_l_weapon or back_weapon (undefined on an old rig). */
  socket(name: 'hand_r_weapon' | 'hand_l_weapon' | 'back_weapon') { return this.sockets.get(name); }

  /** Play a one-shot (shoot/hit/attack) over the locomotion layer. */
  play(name: string, weight = 1, seconds?: number) {
    name = name.toLowerCase();
    if (this.held) return;
    // on the move, a gun clip plays on the upper body only: the legs keep running (shoot while you run)
    const up = this.moving > 0.25 ? this.upper.get(name) : undefined;
    const a = up ?? this.actions.get(name);
    if (!a) return;
    if (this.shot && this.shot.act !== a) this.shot.act.fadeOut(0.06);
    a.reset().setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = false;
    // `seconds` squeezes a long take (the 5.7 s mocap reload) into a gameplay length
    a.timeScale = seconds ? a.getClip().duration / seconds : 1;
    a.play();
    const dur = seconds ?? a.getClip().duration;
    this.shot = { act: a, base: weight, left: dur, dur, upper: !!up };
  }

  /** Play a clip once and hold its last frame over everything (death, knockdown) until release(). */
  hold(name: string) {
    const a = this.actions.get(name.toLowerCase());
    if (!a) return false;
    if (this.shot) { this.shot.act.stop(); this.shot = null; }
    this.held?.act.stop();
    a.reset().setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.timeScale = 1;
    a.play();
    this.held = { act: a, w: 0 };
    return true;
  }
  /** Back to the locomotion after hold(). */
  release() { if (this.held) { this.held.act.stop(); this.held = null; } }
  get holding() { return !!this.held; }

  /** speed in m/s; local = velocity in the character's own frame (x right, z forward). */
  update(dt: number, speed: number, localX = 0, localZ = 1) {
    const s = Math.max(1e-3, Math.hypot(localX, localZ));
    const move = sstep(0.3, 1.6, speed);
    this.moving = move;
    const fwd = Math.max(0, localZ) / s, back = Math.max(0, -localZ) / s, side = Math.abs(localX) / s;
    const hasStrafe = this.loco.some((l) => l.name === 'strafe_left');
    const sideW = hasStrafe ? sstep(0.35, 0.8, side) : 0;
    // a walk clip (motion-captured stride) carries the slow speeds, the run takes over from ~3 to 6 m/s
    const hasWalk = this.loco.some((l) => l.name === 'walk'), runW = hasWalk ? sstep(3, 6, speed) : 1;
    // sprint (the motion-captured low run) takes over above ~9.5 m/s; back-pedal clips (the advance / run played
    // backwards) replace the reversed run when moving backwards
    const hasSprint = this.loco.some((l) => l.name === 'sprint'), sprW = hasSprint ? sstep(9.2, 11, speed) : 0;
    const hasBack = this.loco.some((l) => l.name === 'run_back'), backW = hasBack ? sstep(0.15, 0.55, back - fwd) : 0;
    const fw = move * (1 - sideW);
    const target: Record<string, number> = {
      idle: 1 - move,
      walk: fw * (1 - runW) * (1 - backW),
      run: fw * runW * (1 - sprW) * (1 - backW),
      sprint: fw * runW * sprW * (1 - backW),
      walk_back: fw * (1 - runW) * backW,
      run_back: fw * runW * backW,
      strafe_left: move * sideW * (localX > 0 ? 1 : 0),
      strafe_right: move * sideW * (localX > 0 ? 0 : 1),
    };
    if (!this.loco.some((l) => l.name === 'walk_back')) target.run_back += target.walk_back;
    // one-shot layer: full weight standing, lighter on the run; fades out over its last 0.18 s
    let ow = 0;
    if (this.shot) {
      this.shot.left -= dt;
      if (this.shot.left <= 0) { this.shot.act.stop(); this.shot = null; }
      else {
        const fadeIn = Math.min(1, (this.shot.dur - this.shot.left) / 0.08), fadeOut = Math.min(1, this.shot.left / 0.18);
        if (this.shot.upper) {
          // the upper-body copy blends against the full-weight run (normalised), so it gets a bigger weight to lead
          this.shot.act.setEffectiveWeight(this.shot.base * fadeIn * fadeOut * 4);
        } else {
          ow = this.shot.base * fadeIn * fadeOut * (1 - 0.5 * move);
          this.shot.act.setEffectiveWeight(ow);
        }
      }
    }
    const k = Math.min(1, dt * 12);
    // held clip (death / knockdown) takes the whole body
    if (this.held) {
      this.held.w = Math.min(1, this.held.w + dt * 10);
      this.held.act.setEffectiveWeight(this.held.w);
      ow = Math.max(ow, this.held.w);
    }
    // pose layer (the glide): takes the body like a held clip, faded by poseLayerW
    if (this.poseLayer) {
      this.poseLayer.w += (this.poseLayerW - this.poseLayer.w) * Math.min(1, dt * 6);
      this.poseLayer.act.setEffectiveWeight(this.poseLayer.w);
      ow = Math.max(ow, this.poseLayer.w);
    }
    // crouch: the crouch walk replaces the standing locomotion (held still when not moving)
    this.crouchW += ((this.crouch && this.crouchAct ? 1 : 0) - this.crouchW) * k;
    if (this.crouchAct) {
      this.crouchAct.act.setEffectiveWeight(this.crouchW * (1 - ow));
      this.crouchAct.act.timeScale = move < 0.05 ? 0 : THREE.MathUtils.clamp(speed / this.crouchAct.nat, 0.5, 2);
    }
    // rifle run: swaps in for forward run/sprint when a vessel gun is drawn
    const rrWant = this.runRifle && this.runRifleAct ? Math.min(1, (target.run ?? 0) + (target.sprint ?? 0)) : 0;
    this.runRifleW += (rrWant - this.runRifleW) * k;
    if (this.runRifleAct) {
      this.runRifleAct.act.setEffectiveWeight(this.runRifleW * (1 - ow) * (1 - this.crouchW));
      this.runRifleAct.act.timeScale = THREE.MathUtils.clamp(speed / this.runRifleAct.nat, 0.6, 2.4);
    }
    // each cycle plays at (ground speed / its own speed), so planted feet stay planted (within sane cadence limits)
    const rateOf = (l: { nat: number }) => (l.nat > 0 ? THREE.MathUtils.clamp(speed / l.nat, 0.6, 2.6) : 1);
    const run = this.loco.find((l) => l.name === 'run');
    const rate = run ? rateOf(run) : 1;
    for (const l of this.loco) {
      l.w += ((target[l.name] ?? 0) - l.w) * k;
      const gunCut = (l.name === 'run' || l.name === 'sprint') ? (1 - this.runRifleW) : 1;
      l.act.setEffectiveWeight(l.w * gunCut * (1 - ow) * (1 - this.crouchW));
      if (l.name === 'run') l.act.timeScale = !hasBack && back > fwd + 0.2 ? -rate : rate;
      else if (l.name === 'sprint' || l.name === 'run_back' || l.name === 'walk' || l.name === 'walk_back') l.act.timeScale = rateOf(l);
      else if (l.name.startsWith('strafe')) {
        l.act.timeScale = rateOf(l);
        // keep the strafe step in phase with the run so the blend doesn't double-step
        if (run && l.w < 0.05) l.act.time = (run.act.time / run.act.getClip().duration) * l.act.getClip().duration;
      }
    }
    // procedural layers start from rest each frame (the mixer then writes the bones its clips key)
    this.spine.forEach((b, i) => b.quaternion.copy(this.spineRest[i]));
    this.mixer.update(dt);
    this.forge?.update(dt);
    this.applyGlidePose(dt);
    this.applyAim(dt);
    this.updateSecondary(dt);
  }

  private _gq = new THREE.Quaternion(); private _gq2 = new THREE.Quaternion(); private _ga = new THREE.Vector3(); private _gb = new THREE.Vector3();
  private _gUp = new THREE.Vector3(); private _gFwd = new THREE.Vector3(); private _gSide = new THREE.Vector3(); private _gT = new THREE.Vector3();
  /** Glide posture: the whole body pitched about the hips toward prone, then the limbs laid along it (wingsuit). */
  private applyGlidePose(dt: number) {
    this.gw += (this.glidePose.w - this.gw) * Math.min(1, dt * (this.glidePose.w > this.gw ? 4 : 8));
    this.gp += (this.glidePose.pitch - this.gp) * Math.min(1, dt * 4.5);
    if (this.gw < 0.005) {
      this.gw = 0;
      this.model.quaternion.identity();
      this.model.position.set(0, 0, 0);
      return;
    }
    const th = this.gp * this.gw;
    // body pitch about the hips (rig space: +Z forward, +X the figure's left): the head goes forward, the feet back
    // pivot at the chest: the prone body stays up near where the standing figure's shoulders were (the camera's line)
    const piv = this.heightM * 0.78;
    this.model.quaternion.setFromAxisAngle(this._ga.set(1, 0, 0), th);
    this.model.position.set(0, piv, 0).sub(this._gb.set(0, piv, 0).applyQuaternion(this.model.quaternion));
    if (this.gw < 0.01) return;
    this.model.updateMatrixWorld(true);
    this.model.getWorldQuaternion(this._gq);
    const up = this._gUp.set(0, 1, 0).applyQuaternion(this._gq), fwd = this._gFwd.set(0, 0, 1).applyQuaternion(this._gq);
    const left = this._gSide.set(1, 0, 0).applyQuaternion(this._gq);
    const w = this.gw;
    for (const [s, k] of [['Left', 1], ['Right', -1]] as const) {
      // legs trail straight in line with the body (a touch apart), knees just soft
      this.aimBone(s + 'UpLeg', s + 'Leg', this._gT.copy(up).negate().addScaledVector(left, 0.1 * k).addScaledVector(fwd, 0.04), w);
      this.aimBone(s + 'Leg', s + 'Foot', this._gT.copy(up).negate().addScaledVector(fwd, -0.18).addScaledVector(left, 0.08 * k), w);
      // arms swept back along the flanks and a little out, forearms in line
      this.aimBone(s + 'Arm', s + 'ForeArm', this._gT.copy(up).multiplyScalar(-0.72).addScaledVector(left, 0.55 * k).addScaledVector(fwd, -0.3), w);
      this.aimBone(s + 'ForeArm', s + 'Hand', this._gT.copy(up).multiplyScalar(-0.8).addScaledVector(left, 0.45 * k).addScaledVector(fwd, -0.25), w);
    }
    // the head lifts to look ahead (most in the neck)
    this.turnBone('Neck', left, -th * 0.5);
    this.turnBone('Head', left, -th * 0.35);
  }
  /** Turn a bone (in world space) so its child joint lies along `dir`, by weight w. */
  private aimBone(name: string, child: string, dir: THREE.Vector3, w: number) {
    const b = this.boneByName.get(name), c = this.boneByName.get(child);
    if (!b || !c || !b.parent) return;
    const from = c.getWorldPosition(this._ga).sub(b.getWorldPosition(this._gb)).normalize();
    this._gq.setFromUnitVectors(from, dir.normalize());
    this._gq2.identity().slerp(this._gq, w);
    this.worldTurn(b, this._gq2);
  }
  private turnBone(name: string, axis: THREE.Vector3, angle: number) {
    const b = this.boneByName.get(name);
    if (!b || !b.parent || !angle) return;
    this.worldTurn(b, this._gq2.setFromAxisAngle(axis, angle));
  }
  private _wq = new THREE.Quaternion();
  /** bone.world ← q · bone.world, written into its local rotation. */
  private worldTurn(b: THREE.Object3D, q: THREE.Quaternion) {
    b.parent!.getWorldQuaternion(this._wq);
    const pinv = this._gq.copy(this._wq).invert();
    b.quaternion.premultiply(pinv.multiply(q).multiply(this._wq));
    b.updateMatrixWorld(true);
  }

  private _p = new THREE.Vector3();
  /** Cloth and wings last: they hang off the final pose (aim bend included) and feel the travel and the wind. */
  private updateSecondary(dt: number) {
    if ((!this.soft && !this.wings) || dt <= 0) return;
    this.secT += dt;
    this.root.updateWorldMatrix(true, true);
    const p = this.root.getWorldPosition(this._p);
    if (this.hasPos) {
      const vx = (p.x - this.lastPos.x) / dt, vy = (p.y - this.lastPos.y) / dt, vz = (p.z - this.lastPos.z) / dt;
      if (vx * vx + vy * vy + vz * vz > 60 * 60) { this.velocity.set(0, 0, 0); this.soft?.reset(); this.wings?.reset(); }
      else this.velocity.lerp(this._p2.set(vx, vy, vz), Math.min(1, dt * 20));
    }
    this.lastPos.copy(p); this.hasPos = true;
    windAt(p, this.secT, this.windV);
    if (this.soft) { this.soft.wind.copy(this.windV); this.soft.bodyVel.copy(this.velocity); this.soft.update(dt); }
    if (this.wings) { this.wings.wind.copy(this.windV); this.wings.bodyVel.copy(this.velocity); this.wings.update(dt); }
  }
  private _p2 = new THREE.Vector3();


  private axis = new THREE.Vector3(); private fwd = new THREE.Vector3(); private pq = new THREE.Quaternion(); private dq = new THREE.Quaternion();
  /** Bend the spine (shared across its bones) about the character's right axis so the chest and gun follow the aim pitch. */
  private applyAim(dt: number) {
    this.aimApplied += (THREE.MathUtils.clamp(this.aimPitch, -0.85, 0.85) * (1 - this.gw) - this.aimApplied) * Math.min(1, dt * 16);
    if (!this.spine.length || Math.abs(this.aimApplied) < 1e-3) return;
    this.root.updateWorldMatrix(true, false);
    this.root.getWorldDirection(this.fwd);                         // the rig faces its +Z
    this.axis.crossVectors(this.fwd, THREE.Object3D.DEFAULT_UP).normalize(); // forward × up: + angle tips forward up
    const per = this.aimApplied / this.spine.length;
    for (const b of this.spine) {
      b.parent!.updateWorldMatrix(true, false);
      b.parent!.getWorldQuaternion(this.pq).invert();
      this.dq.setFromAxisAngle(this.axis.clone().applyQuaternion(this.pq), per);
      b.quaternion.premultiply(this.dq);
      b.updateMatrixWorld(true);
    }
  }
}
