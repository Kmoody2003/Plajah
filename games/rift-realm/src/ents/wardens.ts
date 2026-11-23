// Vesselbound (Rift Realm) — the twelve Grovewardens: Kenne's reference set
// (D:/plajah game assets deign from promtps/Shooter/Grovewardens: a turnaround sheet, a turntable, a walking study and
// fight clips for each). One record per warden: its look (what model.ts grows), its height and its signature move
// (index.ts MOVES), taken from its fight clip and expanded so it plays as a game move rather than a copy of the clip.
//
// Pass 1 is parametric: the shared grown body (model.ts) dressed per warden from its sheet: bark, crown, moss, flowers,
// spikes, caps, heart glow, roots. Not yet scored against the sheets; the fidelity loop (≥95 %) is the next pass.
import * as THREE from 'three/webgpu';
import type { Recipe } from '../../../../services/vfx';

export type CrownKind = 'dome' | 'blossom' | 'cone' | 'willow' | 'bare' | 'glow' | 'cap' | 'flat' | 'fronds' | 'mangrove' | 'antler';

export interface WardenLook {
  /** Bark tint, sap-vein colour and strength, moss on the bark (colour, amount 0…1). */
  bark: number; veins: number; veinStrength: number; barkMoss: number; barkMossAmount: number;
  crown: CrownKind; crownTint: number; crownScale: number; crownGlow?: number;
  /** Hanging moss / hair: root and tip colours, a length multiplier, how much (0 none … 1.5 lots). */
  moss: [number, number]; mossLen: number; mossAmount: number;
  /** Flower palette and amount (0 none … 2 covered). */
  flowers: number[]; flowerAmount: number;
  /** Torso width × depth; a pot belly (baobab); limbs thickness. */
  bulk: number; belly: number; limbs: number;
  /** Eye glow and an exposed heart in the chest (banyan amber, ironwood red). */
  eyes: number; heart?: number;
  /** Thorns / spikes along the body (ironwood), mushroom caps (fungal), extra root toes and reach (mangrove stilts). */
  spikes?: { count: number; color: number; glow: number };
  caps?: { count: number; color: number; glow: number };
  roots?: { toes: number; reach: number };
  /** Small living trees on the shoulders (0…3). */
  saplings: number;
  /** Wash the bark toward a colour (white birch, grey baobab, red sequoia): [colour, 0…1]. */
  barkWash?: [number, number];
}

export interface Warden {
  id: string;
  name: string;
  /** Standing height to the top of its crown, metres (35–45; each warden its own). Each individual varies ±1 %; targets keep a margin for the crouch so every pose stays in 35–45 m. */
  height: number;
  look: WardenLook;
  /** Its own move (index.ts MOVES key), from its fight clip. */
  signature: string;
  /** Reference files in the Grovewardens folder (sheet first). */
  refs: string[];
  /** Encounter weight. */
  weight: number;
}

const G = 'Grovewardens/';
const OAK_LOOK: WardenLook = {
  bark: 0x6e5a48, veins: 0xffc45a, veinStrength: 0.5, barkMoss: 0x58842e, barkMossAmount: 0.95,
  crown: 'dome', crownTint: 0xb4dc98, crownScale: 1,
  moss: [0x2e4a1a, 0x8aa64a], mossLen: 1, mossAmount: 1,
  flowers: [0xc9a8ff, 0xb48cff, 0xf7f2ff, 0x9fd8ff], flowerAmount: 0.8,
  bulk: 1, belly: 0, limbs: 1, eyes: 0xffb347, saplings: 2,
};

export const WARDENS: Warden[] = [
  { id: 'ancient-oak', name: 'Ancient Oak', height: 41, weight: 3, signature: 'root-grapple',
    look: { ...OAK_LOOK, crownScale: 1.45 },
    refs: [G + 'Oak_tree_guardian_character_turn…_dee6184e.jpg', G + 'Colossal_tree_giant_character_tu…_32746fcb.jpg', G + 'Oak_tree_rotating_on_turntable_a8578dce.mp4', G + 'Ancient_oak_tree_walking_dc45466a.mp4', G + 'Oak_knight_fights_titan_monster_2533bf9c.mp4', G + 'Forest_guardian_tending_sapling_309cc60b.mp4'] },
  { id: 'banyan', name: 'Banyan', height: 38.4, weight: 1, signature: 'root-cage',
    look: { ...OAK_LOOK, bark: 0x6b5e3e, veins: 0xffa830, veinStrength: 0.9, crown: 'flat', crownTint: 0x9cc070, crownScale: 1.2, moss: [0x4a3a22, 0x7a6440], mossLen: 1.6, mossAmount: 1.3, flowers: [], flowerAmount: 0, heart: 0xffa020, eyes: 0xffb030, saplings: 0 },
    refs: [G + 'Banyan_tree_guardian_turnaround_…_077270c7.jpg', G + 'Banyan_root_tree_guardian_rotation_152c0cf4.mp4', G + 'Banyan_tree_guardian_trapping_mo…_d0b2bd13.mp4'] },
  { id: 'baobab', name: 'Baobab', height: 36.2, weight: 1, signature: 'chest-slam',
    look: { ...OAK_LOOK, barkWash: [0xa8a290, 0.5], bark: 0x8a8270, veins: 0x9cff6a, veinStrength: 0.25, barkMoss: 0x6a7a40, barkMossAmount: 0.4, crown: 'flat', crownTint: 0x8cbc60, crownScale: 0.85, moss: [0x5a5a3a, 0x9a9a6a], mossLen: 1.3, mossAmount: 0.5, flowers: [0xfff2d0], flowerAmount: 0.2, bulk: 1.55, belly: 1, limbs: 1.25, saplings: 0 },
    refs: [G + 'Baobab_tree_guardian_character_s…_c1d2dcd4.jpg', G + 'Baobab_tree_walking_through_forest_84b3d616.mp4', G + 'Baobab_titan_slams_chest_402b52e7.mp4'] },
  { id: 'bioluminescent', name: 'Bioluminescent', height: 37.9, weight: 1, signature: 'lumen-pulse',
    look: { ...OAK_LOOK, bark: 0x3a3450, veins: 0x40c8ff, veinStrength: 1.6, barkMoss: 0x403a70, barkMossAmount: 0.5, crown: 'glow', crownTint: 0x80b0ff, crownScale: 1.1, crownGlow: 0x48d8ff, moss: [0x2a2450, 0x7a60ff], mossLen: 0.8, mossAmount: 0.5, flowers: [0x48d8ff, 0xa070ff, 0x80ffff], flowerAmount: 1.2, eyes: 0x60e0ff, saplings: 0 },
    refs: [G + 'Character_turnaround_of_tree_gua…_23e2658a.jpg', G + 'Bioluminescent_tree_guardian_rot…_296352f4.mp4'] },
  { id: 'cherry-blossom', name: 'Cherry Blossom', height: 37, weight: 1, signature: 'petal-storm',
    look: { ...OAK_LOOK, bark: 0x4a3a34, veins: 0xff8ac0, veinStrength: 0.4, barkMoss: 0x5a6a3a, barkMossAmount: 0.3, crown: 'blossom', crownTint: 0xffb8d8, crownScale: 1.25, moss: [0xd07a9a, 0xffd0e4], mossLen: 1.2, mossAmount: 0.6, flowers: [0xffc0d8, 0xffe0ec, 0xff9ec2], flowerAmount: 1.8, eyes: 0xffa0c0, saplings: 0 },
    refs: [G + 'Cherry_blossom_tree_guardian_tur…_1702804e.jpg', G + 'Cherry_blossom_tree_video_rotation_ac890f61.mp4', G + 'Hero_fighting_demons_amid_petals_cfd20b36.mp4'] },
  { id: 'fungal-spore', name: 'Fungal Spore', height: 36.6, weight: 1, signature: 'spore-burst',
    look: { ...OAK_LOOK, bark: 0x5a4434, veins: 0xff8a30, veinStrength: 0.4, barkMoss: 0x6a5030, barkMossAmount: 0.5, crown: 'cap', crownTint: 0x8a9a50, crownScale: 0.6, moss: [0x4a3424, 0x9a7050], mossLen: 0.8, mossAmount: 0.6, flowers: [0xa070ff], flowerAmount: 0.3, eyes: 0xff9040, caps: { count: 46, color: 0xe07030, glow: 0xff9a40 }, saplings: 0 },
    refs: [G + 'Fungal_tree_guardian_turnaround_…_a67c309d.jpg', G + 'Fungal_spore_tree_guardian_rotating_9f145850.mp4', G + 'Fungal_tree_guardian_walking_slowly_3012efcf.mp4'] },
  { id: 'ironwood-thorn', name: 'Ironwood Thorn', height: 40.1, weight: 1, signature: 'thorn-field',
    look: { ...OAK_LOOK, bark: 0x3a2a26, veins: 0xff3020, veinStrength: 1.1, barkMoss: 0x2a2020, barkMossAmount: 0.1, crown: 'antler', crownTint: 0x3a2a26, crownScale: 1, moss: [0x2a1a18, 0x4a2a24], mossLen: 0.6, mossAmount: 0.15, flowers: [], flowerAmount: 0, bulk: 1.1, limbs: 1.1, eyes: 0xff4020, heart: 0xff2a10, spikes: { count: 70, color: 0x2a1c18, glow: 0xff3a1a }, saplings: 0 },
    refs: [G + 'Ironwood_thorn_guardian_characte…_2c54e818.jpg', G + 'Ironwood_thorn_tree_rotation_71e97062.mp4', G + 'Ironwood_tree_guardian_walking_081f5a67.mp4', G + 'Guardian_impaling_demons_and_titan_5a46995e.mp4', G + 'Hero_fighting_with_ironwood_spikes_602252d6.mp4'] },
  { id: 'pine-sentinel', name: 'Pine Sentinel', height: 43, weight: 1, signature: 'sap-wave',
    look: { ...OAK_LOOK, bark: 0x4a3a2c, veins: 0xffb030, veinStrength: 0.7, barkMoss: 0x3a5a2a, barkMossAmount: 0.6, crown: 'cone', crownTint: 0x3a6a34, crownScale: 1.1, moss: [0x24381a, 0x5a7a34], mossLen: 1.1, mossAmount: 1.1, flowers: [], flowerAmount: 0, eyes: 0xffb030, spikes: { count: 60, color: 0x2e4a22, glow: 0x000000 }, saplings: 1 },
    refs: [G + 'Pine_tree_guardian_character_tur…_c2d27e6e.jpg', G + 'Pine_needle_tree_guardian_rotation_5dfded59.mp4', G + 'Pine_sentinel_battles_demon_hordes_c3c823dc.mp4'] },
  { id: 'sequoia', name: 'Giant Sequoia', height: 44, weight: 1, signature: 'titan-hammer',
    look: { ...OAK_LOOK, barkWash: [0xa4583a, 0.35], bark: 0x8a4a30, veins: 0xffb060, veinStrength: 0.35, barkMoss: 0x4a6a2a, barkMossAmount: 0.35, crown: 'fronds', crownTint: 0x6a9a48, crownScale: 1.1, moss: [0x3a4a1a, 0x7a8a3a], mossLen: 1.2, mossAmount: 0.8, flowers: [], flowerAmount: 0, bulk: 1.15, limbs: 1.15, saplings: 1 },
    refs: [G + 'Giant_sequoia_character_turnarou…_444a2e1d.jpg', G + 'Redwood_sequoia_tree_rotation_video_321f24dd.mp4', G + 'Sequoia_tree_walking_in_forest_a1229d80.mp4'] },
  { id: 'swamp-mangrove', name: 'Swamp Mangrove', height: 37.4, weight: 1, signature: 'bog-drag',
    look: { ...OAK_LOOK, bark: 0x4a4230, veins: 0x9cff6a, veinStrength: 0.35, barkMoss: 0x4a5a2a, barkMossAmount: 0.9, crown: 'mangrove', crownTint: 0x88a860, crownScale: 0.95, moss: [0x2a3a1a, 0x6a7a3a], mossLen: 1.4, mossAmount: 1.2, flowers: [], flowerAmount: 0, roots: { toes: 11, reach: 1.9 }, saplings: 0 },
    refs: [G + 'Tree_guardian_character_turnarou…_75fcbe49.jpg', G + 'Swamp_mangrove_tree_rotation_05c5da35.mp4', G + 'Swamp_tree_guardian_walking_forest_5bfb8b41.mp4'] },
  { id: 'weeping-willow', name: 'Weeping Willow', height: 39.2, weight: 1, signature: 'vine-lash',
    look: { ...OAK_LOOK, bark: 0x5a5030, veins: 0x9cff6a, veinStrength: 0.6, barkMoss: 0x6a8a3a, barkMossAmount: 0.8, crown: 'willow', crownTint: 0x9ad870, crownScale: 1.2, moss: [0x4a6a24, 0xaed870], mossLen: 2.2, mossAmount: 1.6, flowers: [], flowerAmount: 0, eyes: 0xc0ff70, saplings: 0 },
    refs: [G + 'Willow_tree_guardian_character_s…_ff030eb9.jpg', G + 'Weeping_willow_tree_rotation_85577c86.mp4', G + 'Willow_tree_guardian_walking_forest_db330ed9.mp4', G + 'Willow_tree_guardian_battling_de…_57700bef.mp4'] },
  { id: 'white-birch', name: 'White Birch', height: 42, weight: 1, signature: 'blizzard',
    look: { ...OAK_LOOK, barkWash: [0xeceae4, 0.72], bark: 0xd8d4cc, veins: 0x8fe8ff, veinStrength: 0.5, barkMoss: 0xf0f6ff, barkMossAmount: 0.55, crown: 'bare', crownTint: 0xe8f2ff, crownScale: 1.1, moss: [0xc8d8e8, 0xffffff], mossLen: 0.7, mossAmount: 0.4, flowers: [], flowerAmount: 0, eyes: 0x9ff0ff, saplings: 0 },
    refs: [G + 'Tree_guardian_character_turnarou…_a8d1fb3b.jpg', G + 'White_birch_tree_rotating_529a7956.mp4', G + 'Tree_guardian_unleashing_blizzard_d5d5f856.mp4'] },
];

export const wardenById = (id: string | null | undefined) => WARDENS.find((w) => w.id === id) ?? null;
export function pickWarden(R: () => number): Warden {
  const total = WARDENS.reduce((t, w) => t + w.weight, 0);
  let r = R() * total;
  for (const w of WARDENS) { r -= w.weight; if (r <= 0) return w; }
  return WARDENS[0];
}

// ── signature-move effects ──
export const FX: Record<string, Recipe> = {
  petals: { id: 'fx_petals', emitters: [
    { layer: 'shard', count: [140, 180], life: [3, 5], speed: [6, 16], spread: Math.PI, radius: 6, size: [0.5, 0.3], color: [0xffc8dc, 0xff8ab8], intensity: 1.1, alpha: [1, 0], drag: 0.8, turbulence: 9, spin: [3, 9], lift: [0.5, 3] },
    { layer: 'add', shape: 'soft', count: [40, 60], life: [1.5, 3], speed: [4, 10], spread: Math.PI, radius: 8, size: [0.3, 0.08], color: [0xffe0f0, 0xff70b0], intensity: 2.5, drag: 1, turbulence: 6 },
    { layer: 'add', shape: 'ring', count: 2, life: 0.9, speed: 0, size: [3, 30], color: [0xffb0d0, 0xff5a9a], intensity: 1, alpha: [0.8, 0] } ] },
  frost: { id: 'fx_frost', light: { color: 0x9fe8ff, intensity: 30, range: 40, life: 0.6 }, emitters: [
    { layer: 'alpha', shape: 'smoke', count: [40, 54], life: [2.5, 4.5], speed: [10, 24], spread: Math.PI * 0.5, radius: 5, size: [3, 12], color: [0xf0faff, 0xbfe0f0], alpha: [0.55, 0], drag: 1.2, lift: [0, 0.6], spin: [0.1, 0.4] },
    { layer: 'shard', count: [80, 110], life: [1.5, 3], speed: [12, 28], spread: Math.PI * 0.45, radius: 4, size: [0.3, 0.12], color: [0xffffff, 0x8fd8ff], intensity: 1.6, alpha: [1, 0], gravity: 2, drag: 0.6, spin: [5, 14] },
    { layer: 'add', shape: 'ring', count: 1, life: 0.8, speed: 0, size: [3, 40], color: [0xe0f8ff, 0x6fd6ff], intensity: 1.2, alpha: [0.8, 0] } ] },
  spores: { id: 'fx_spores', emitters: [
    { layer: 'alpha', shape: 'smoke', count: [34, 44], life: [4, 7], speed: [3, 9], spread: Math.PI, radius: 6, size: [4, 13], color: [0xd08a40, 0x8a6a30], alpha: [0.5, 0], drag: 0.9, lift: [0.3, 1.2], turbulence: 2, spin: [0.05, 0.3] },
    { layer: 'add', shape: 'soft', count: [90, 120], life: [3, 6], speed: [2, 8], spread: Math.PI, radius: 8, size: [0.18, 0.06], color: [0xffc060, 0xff7a20], intensity: 2.6, drag: 0.7, turbulence: 5, lift: [0.4, 1.4] } ] },
  sap: { id: 'fx_sap', light: { color: 0xffb030, intensity: 50, range: 40, life: 0.7 }, emitters: [
    { layer: 'add', shape: 'spark', count: [120, 160], life: [0.6, 1.4], speed: [18, 34], spread: Math.PI * 0.35, radius: 3, size: [0.14, 0.04], color: [0xfff0b0, 0xff8a10], intensity: 3.5, drag: 1.2, gravity: 6, stretch: 0.05, bounce: 0.3 },
    { layer: 'add', shape: 'soft', count: [40, 60], life: [1, 2.4], speed: [6, 14], spread: Math.PI * 0.4, radius: 6, size: [1.4, 0.3], color: [0xffd060, 0xff6a10], intensity: 2.2, drag: 1.5, lift: [0.5, 1.5] },
    { layer: 'add', shape: 'ring', count: 1, life: 0.6, speed: 0, size: [3, 34], color: [0xffe0a0, 0xff9020], intensity: 1.4, alpha: [0.9, 0] } ] },
  lumen: { id: 'fx_lumen', light: { color: 0x60e0ff, intensity: 90, range: 60, life: 0.5 }, emitters: [
    { layer: 'add', shape: 'soft', count: 2, life: 0.4, speed: 0, size: [4, 30], color: [0xffffff, 0x48d8ff], intensity: 3, alpha: [1, 0] },
    { layer: 'add', shape: 'ring', count: 3, life: 1.2, speed: 0, size: [2, 36], color: [0xa0f0ff, 0x7a5aff], intensity: 1.4, alpha: [0.9, 0] },
    { layer: 'add', shape: 'soft', count: [70, 90], life: [2, 4], speed: [3, 9], spread: Math.PI, radius: 10, size: [0.2, 0.06], color: [0x80ffff, 0xa070ff], intensity: 3, drag: 0.8, turbulence: 3, lift: [0.5, 1.5] } ] },
  vines: { id: 'fx_vines', emitters: [
    { layer: 'add', shape: 'spark', count: [80, 110], life: [0.4, 0.9], speed: [16, 30], spread: Math.PI * 0.25, radius: 2, size: [0.18, 0.05], color: [0xd0ff90, 0x40c020], intensity: 3, drag: 1.5, stretch: 0.08 },
    { layer: 'shard', count: [40, 60], life: [3, 5], speed: [3, 8], spread: Math.PI * 0.6, radius: 6, size: [0.4, 0.28], color: [0x8ad050, 0x4a8a2a], intensity: 0.6, alpha: [1, 0], gravity: 1.4, drag: 1.3, turbulence: 3, spin: [1, 4] } ] },
  shock: { id: 'fx_shock', light: { color: 0x9cff6a, intensity: 40, range: 40, life: 0.5 }, emitters: [
    { layer: 'add', shape: 'ring', count: 2, life: 0.9, speed: 0, size: [3, 44], color: [0xd8ffb0, 0x6ad040], intensity: 1.3, alpha: [0.9, 0] },
    { layer: 'alpha', shape: 'smoke', count: [36, 46], life: [2.5, 4], speed: [14, 28], spread: Math.PI * 0.48, radius: 5, size: [3, 10], color: [0x8a7a5a, 0x4a4036], alpha: [0.55, 0], drag: 1.4, lift: [0.1, 0.5] },
    { layer: 'shard', count: [40, 56], life: [1, 2], speed: [10, 20], spread: Math.PI * 0.4, radius: 5, size: [0.6, 0.3], color: [0x5a4a3a, 0x2e2620], intensity: 0.5, alpha: [1, 0.7], gravity: 16, drag: 0.3, spin: [3, 9], bounce: 0.3 } ] },
  mud: { id: 'fx_mud', emitters: [
    { layer: 'shard', count: [60, 80], life: [1, 2], speed: [6, 14], spread: Math.PI * 0.45, radius: 8, size: [0.5, 0.2], color: [0x4a3a24, 0x2a2418], intensity: 0.4, alpha: [1, 0.6], gravity: 14, drag: 0.4, spin: [2, 6], bounce: 0.1 },
    { layer: 'alpha', shape: 'smoke', count: [16, 22], life: [2, 3.5], speed: [2, 6], spread: Math.PI * 0.5, radius: 8, size: [3, 8], color: [0x5a6a3a, 0x3a4028], alpha: [0.45, 0], drag: 1.2, lift: [0.1, 0.4] } ] },
};

// ── eruptions: spikes / roots / a cage bursting up from the ground, holding, sinking back (one instanced pool) ──
interface Spike { x: number; y: number; z: number; h: number; r: number; tx: number; tz: number; t: number; life: number; c: THREE.Color }
export class Eruptions {
  readonly mesh: THREE.InstancedMesh;
  private list: Spike[] = [];
  private m4 = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler(); private s = new THREE.Vector3(); private p = new THREE.Vector3();
  constructor(max = 260) {
    const g = new THREE.ConeGeometry(1, 1, 7, 3).translate(0, 0.5, 0);
    // gnarl the cones a little so they read as wood, not geometry
    const pa = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pa.count; i++) { const y = pa.getY(i); pa.setX(i, pa.getX(i) * (1 + 0.18 * Math.sin(y * 9 + i))); pa.setZ(i, pa.getZ(i) * (1 + 0.18 * Math.cos(y * 7 + i))); }
    g.computeVertexNormals();
    const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.85 });
    this.mesh = new THREE.InstancedMesh(g, mat, max);
    this.mesh.name = 'ent-eruptions'; this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.castShadow = true;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  }
  /** `ring` places them round the edge leaning in (a cage); else scattered through the circle leaning out. */
  spawn(at: THREE.Vector3, radius: number, n: number, color: number, h: [number, number], life: number, ground: (x: number, z: number) => number, R: () => number, ring = false) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n && this.list.length < this.mesh.instanceMatrix.count; i++) {
      const a = ring ? (i / n) * Math.PI * 2 : R() * Math.PI * 2, d = ring ? radius * (0.92 + R() * 0.1) : Math.sqrt(R()) * radius;
      const x = at.x + Math.cos(a) * d, z = at.z + Math.sin(a) * d;
      const lean = ring ? -0.45 : 0.15 + R() * 0.3;
      this.list.push({ x, y: ground(x, z) - 0.5, z, h: h[0] + R() * (h[1] - h[0]), r: 0.35 + R() * 0.5, tx: Math.sin(a) * lean, tz: -Math.cos(a) * lean, t: -R() * 0.25, life, c });
    }
  }
  update(dt: number) {
    let k = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i]; s.t += dt;
      if (s.t > s.life) { this.list.splice(i, 1); continue; }
    }
    for (const s of this.list) {
      const t = Math.max(0, s.t), rise = Math.min(1, t / 0.22), sink = Math.max(0, (t - (s.life - 0.6)) / 0.6);
      const h = s.h * (rise * rise * (3 - 2 * rise)) * (1 - sink);
      this.q.setFromEuler(this.e.set(s.tx, 0, s.tz));
      this.m4.compose(this.p.set(s.x, s.y, s.z), this.q, this.s.set(s.r * (1 + s.h * 0.06), Math.max(0.01, h), s.r * (1 + s.h * 0.06)));
      this.mesh.setMatrixAt(k, this.m4); this.mesh.setColorAt(k, s.c); k++;
    }
    this.mesh.count = k;
    if (k) { this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; }
  }
}
