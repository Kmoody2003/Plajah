// Cyber Forest tree species — measured from Kenne's tree sheets (Shooter/Cyber Forest Level Assets) with
// fromArt/measureTree on the sheet-reader cut-outs (scripts/vegetation/measureArt.ts, 2026-11-20). Profiles, crown base,
// lean and depth are the measurements; trunk radii are set by eye (the 15%-height row includes the spreading roots).
// Leaf atlases: scripts/vegetation/leafAtlas.py over the crown sprites cut from the same sheets.
import type { TreeSpecies } from '../species';

const BARK = '/games/rift-realm/assets/cyberforest/bark_albedo.jpg';
const BARK_N = '/games/rift-realm/assets/cyberforest/bark_normal.jpg';
const VEINS = '/games/rift-realm/assets/cyberforest/conduit_albedo.jpg';
const LEAVES = '/vegetation/leaves/';
const art = (f: string) => `Shooter/Cyber Forest Level Assets/${f}`;

export const CF_VIOLET: TreeSpecies = {
  kind: 'tree', id: 'cf-violet', name: 'Bioluminescent Violet Tree', height: 17,
  trunk: { crownBase: 0.58, radius: 0.55, flare: 2.4, lean: -0.02, wobble: 0.4, twist: 1.5, roots: 7, rootReach: 5 },
  crown: {
    profile: [{ y: 0.56, r: 0.2 }, { y: 0.653, r: 0.2575 }, { y: 0.697, r: 0.2556 }, { y: 0.74, r: 0.2837 }, { y: 0.783, r: 0.2903 }, { y: 0.827, r: 0.28 }, { y: 0.87, r: 0.2519 }, { y: 0.913, r: 0.2228 }, { y: 0.957, r: 0.118 }, { y: 1, r: 0.03 }],
    depthScale: 0.85, attractors: 900, kill: 0.7, influence: 3.4, step: 0.55, gravitropism: 0.15,
  },
  branches: { pipe: 2.3, tipRadius: 0.025 },
  leaves: { atlas: LEAVES + 'cf_violet.webp', cells: [4, 4], perTip: 2, size: 1.9, sizeJitter: 0.3, tint: 0xffffff, transmission: 0x9a6cff, glow: { color: 0x7a5cff, strength: 0.9, beat: 0.5 } },
  bark: { map: BARK, normal: BARK_N, tint: 0x6d7a86, veins: { map: VEINS, color: 0x2ae6ff, strength: 1.0 } },
  wind: { trunk: 0.25, branch: 0.6, flutter: 0.7 },
  provenance: { art: [art('Bioluminescent_tree_asset_turnar…_7bd4b7fe.jpg')] },
};

export const CF_WILLOW: TreeSpecies = {
  kind: 'tree', id: 'cf-willow', name: 'Cyan Weeping Willow', height: 16,
  trunk: { crownBase: 0.44, radius: 0.75, flare: 2.6, lean: -0.08, wobble: 0.7, twist: 0.6, roots: 6, rootReach: 4 },
  crown: {
    profile: [{ y: 0.44, r: 0.18 }, { y: 0.52, r: 0.2488 }, { y: 0.58, r: 0.2905 }, { y: 0.64, r: 0.3435 }, { y: 0.7, r: 0.3283 }, { y: 0.76, r: 0.3234 }, { y: 0.82, r: 0.2865 }, { y: 0.88, r: 0.2528 }, { y: 0.94, r: 0.1316 }, { y: 1, r: 0.05 }],
    depthScale: 0.9, attractors: 1000, kill: 0.75, influence: 3.6, step: 0.6, gravitropism: -0.25,
  },
  branches: { pipe: 2.2, tipRadius: 0.03 },
  leaves: { atlas: LEAVES + 'cf_willow.webp', cells: [4, 4], perTip: 3, size: 2.6, sizeJitter: 0.35, hang: true, tint: 0xe8ffff, transmission: 0x6ff0e0, glow: { color: 0x40e8d8, strength: 0.5, beat: 0.4 } },
  bark: { map: BARK, normal: BARK_N, tint: 0x5e6a72, veins: { map: VEINS, color: 0x2ae6ff, strength: 0.6 } },
  wind: { trunk: 0.2, branch: 0.7, flutter: 1.0 },
  provenance: { art: [art('Cyber_forest_tree_orthographic_v…_68ef49dd.jpg')] },
};

export const CF_BLUE: TreeSpecies = {
  kind: 'tree', id: 'cf-blue', name: 'Blue-leaf Cyber Oak', height: 19,
  trunk: { crownBase: 0.4, radius: 0.85, flare: 2.2, lean: 0, wobble: 0.5, twist: 0.3, roots: 9, rootReach: 5 },
  crown: {
    profile: [{ y: 0.4, r: 0.08 }, { y: 0.467, r: 0.1646 }, { y: 0.533, r: 0.2445 }, { y: 0.6, r: 0.25 }, { y: 0.667, r: 0.29 }, { y: 0.733, r: 0.24 }, { y: 0.8, r: 0.2304 }, { y: 0.867, r: 0.2218 }, { y: 0.933, r: 0.1082 }, { y: 1, r: 0.02 }],
    depthScale: 0.95, attractors: 1100, kill: 0.7, influence: 3.4, step: 0.55, gravitropism: 0.2,
  },
  branches: { pipe: 2.4, tipRadius: 0.028 },
  leaves: { atlas: LEAVES + 'cf_blue.webp', cells: [4, 4], perTip: 2, size: 1.7, sizeJitter: 0.3, tint: 0xdde8f0, transmission: 0x3a8ab0, glow: { color: 0x2ae6ff, strength: 0.35, beat: 0.3 } },
  bark: { map: BARK, normal: BARK_N, tint: 0x6a6c70, veins: { map: VEINS, color: 0x2ae6ff, strength: 0.8 } },
  wind: { trunk: 0.18, branch: 0.5, flutter: 0.6 },
  provenance: { art: [art('Cyber_forest_trees_orthographic_…_2dad727f.jpg')] },
};

export const CF_MANGROVE: TreeSpecies = {
  kind: 'tree', id: 'cf-mangrove', name: 'Cybernetic Mangrove', height: 14,
  trunk: { crownBase: 0.45, radius: 0.6, flare: 1.6, lean: 0.01, wobble: 1.0, twist: 1.2, roots: 12, rootReach: 6 },
  crown: {
    profile: [{ y: 0.45, r: 0.08 }, { y: 0.533, r: 0.1564 }, { y: 0.6, r: 0.1995 }, { y: 0.667, r: 0.2417 }, { y: 0.733, r: 0.19 }, { y: 0.8, r: 0.1854 }, { y: 0.867, r: 0.2083 }, { y: 0.933, r: 0.0967 }, { y: 1, r: 0.02 }],
    depthScale: 0.85, attractors: 700, kill: 0.65, influence: 3.2, step: 0.5, gravitropism: 0.1,
  },
  branches: { pipe: 2.2, tipRadius: 0.03 },
  leaves: { atlas: LEAVES + 'cf_mangrove.webp', cells: [4, 4], perTip: 2, size: 1.5, sizeJitter: 0.3, tint: 0xdfeee6, transmission: 0x3a9a6a },
  bark: { map: BARK, normal: BARK_N, tint: 0x5a5e62, veins: { map: VEINS, color: 0x2ae6ff, strength: 0.7 } },
  wind: { trunk: 0.15, branch: 0.5, flutter: 0.6 },
  provenance: { art: [art('Cybernetic_mangrove_trees_sheet_baece39d.jpg')] },
};

export const CYBER_FOREST_TREES = [CF_VIOLET, CF_WILLOW, CF_BLUE, CF_MANGROVE];
