// Cyber Forest tree species — measured from Kenne's tree sheets (Shooter/Cyber Forest Level Assets) with
// fromArt/measureTree on the sheet-reader cut-outs (scripts/vegetation/measureArt.ts, 2026-11-20). Profiles, crown base,
// lean and depth are the measurements; trunk girth, root reach, leaf size, crown fill and width were then fitted against
// the same cut-outs by fromArt/score.fitSpecies (scripts/vegetation/fitSpecies.ts) — provenance.scores is that art score.
// Leaf atlases: scripts/vegetation/leafAtlas.py over the crown sprites cut from the same sheets.
import type { TreeSpecies } from '../species';

const BARK = '/games/rift-realm/assets/cyberforest/bark_albedo.jpg';
const BARK_N = '/games/rift-realm/assets/cyberforest/bark_normal.jpg';
const VEINS = '/games/rift-realm/assets/cyberforest/conduit_albedo.jpg';
const LEAVES = '/vegetation/leaves/';
const art = (f: string) => `Shooter/Cyber Forest Level Assets/${f}`;

export const CF_VIOLET: TreeSpecies = {
  kind: 'tree', id: 'cf-violet', name: 'Bioluminescent Violet Tree', height: 17,
  trunk: { crownBase: 0.58, radius: 1.078, flare: 2.4, lean: -0.02, wobble: 0.4, twist: 1.5, roots: 7, rootReach: 4.48 },
  crown: {
    profile: [{ y: 0.56, r: 0.2 }, { y: 0.653, r: 0.2575 }, { y: 0.697, r: 0.2556 }, { y: 0.74, r: 0.2837 }, { y: 0.783, r: 0.2903 }, { y: 0.827, r: 0.28 }, { y: 0.87, r: 0.2519 }, { y: 0.913, r: 0.2228 }, { y: 0.957, r: 0.118 }, { y: 1, r: 0.03 }],
    depthScale: 0.85, attractors: 900, kill: 0.7, influence: 3.4, step: 0.55, gravitropism: 0.15,
  },
  branches: { pipe: 2.3, tipRadius: 0.025 },
  leaves: { atlas: LEAVES + 'cf_violet.webp', cells: [4, 4], perTip: 2, size: 1.37, sizeJitter: 0.3, tint: 0xffffff, transmission: 0x9a6cff, glow: { color: 0x7a5cff, strength: 0.9, beat: 0.5 } },
  bark: { map: BARK, normal: BARK_N, tint: 0x6d7a86, veins: { map: VEINS, color: 0x2ae6ff, strength: 1.0 } },
  wind: { trunk: 0.25, branch: 0.6, flutter: 0.7 },
  provenance: { art: [art('Bioluminescent_tree_asset_turnar…_7bd4b7fe.jpg')], scores: { front: 0.789, side: 0.758, mean: 0.773 } },
};

export const CF_WILLOW: TreeSpecies = {
  kind: 'tree', id: 'cf-willow', name: 'Cyan Weeping Willow', height: 16,
  trunk: { crownBase: 0.44, radius: 0.938, flare: 2.6, lean: -0.08, wobble: 0.7, twist: 0.6, roots: 6, rootReach: 4 },
  crown: {
    profile: [{ y: 0.44, r: 0.144 }, { y: 0.52, r: 0.199 }, { y: 0.58, r: 0.2324 }, { y: 0.64, r: 0.2748 }, { y: 0.7, r: 0.2626 }, { y: 0.76, r: 0.2587 }, { y: 0.82, r: 0.2292 }, { y: 0.88, r: 0.2022 }, { y: 0.94, r: 0.1053 }, { y: 1, r: 0.04 }],
    depthScale: 0.9, attractors: 717, kill: 0.75, influence: 3.6, step: 0.6, gravitropism: -0.25,
  },
  branches: { pipe: 2.2, tipRadius: 0.03 },
  leaves: { atlas: LEAVES + 'cf_willow.webp', cells: [4, 4], perTip: 3, size: 1.87, sizeJitter: 0.35, hang: true, tint: 0xe8ffff, transmission: 0x6ff0e0, glow: { color: 0x40e8d8, strength: 0.5, beat: 0.4 } },
  bark: { map: BARK, normal: BARK_N, tint: 0x5e6a72, veins: { map: VEINS, color: 0x2ae6ff, strength: 0.6 } },
  wind: { trunk: 0.2, branch: 0.7, flutter: 1.0 },
  provenance: { art: [art('Cyber_forest_tree_orthographic_v…_68ef49dd.jpg')], scores: { front: 0.594, side: 0.642, mean: 0.618 } },
};

export const CF_BLUE: TreeSpecies = {
  kind: 'tree', id: 'cf-blue', name: 'Blue-leaf Cyber Oak', height: 19,
  trunk: { crownBase: 0.4, radius: 1.333, flare: 2.2, lean: 0, wobble: 0.5, twist: 0.3, roots: 9, rootReach: 3.6 },
  crown: {
    profile: [{ y: 0.4, r: 0.064 }, { y: 0.467, r: 0.1317 }, { y: 0.533, r: 0.1956 }, { y: 0.6, r: 0.2 }, { y: 0.667, r: 0.232 }, { y: 0.733, r: 0.192 }, { y: 0.8, r: 0.1843 }, { y: 0.867, r: 0.1774 }, { y: 0.933, r: 0.0866 }, { y: 1, r: 0.016 }],
    depthScale: 0.95, attractors: 1100, kill: 0.7, influence: 3.4, step: 0.55, gravitropism: 0.2,
  },
  branches: { pipe: 2.4, tipRadius: 0.028 },
  leaves: { atlas: LEAVES + 'cf_blue.webp', cells: [4, 4], perTip: 2, size: 1.22, sizeJitter: 0.3, tint: 0xdde8f0, transmission: 0x3a8ab0, glow: { color: 0x2ae6ff, strength: 0.35, beat: 0.3 } },
  bark: { map: BARK, normal: BARK_N, tint: 0x6a6c70, veins: { map: VEINS, color: 0x2ae6ff, strength: 0.8 } },
  wind: { trunk: 0.18, branch: 0.5, flutter: 0.6 },
  provenance: { art: [art('Cyber_forest_trees_orthographic_…_2dad727f.jpg')], scores: { front: 0.740, side: 0.749, mean: 0.745 } },
};

export const CF_MANGROVE: TreeSpecies = {
  kind: 'tree', id: 'cf-mangrove', name: 'Cybernetic Mangrove', height: 14,
  trunk: { crownBase: 0.45, radius: 0.941, flare: 1.6, lean: 0.01, wobble: 1.0, twist: 1.2, roots: 12, rootReach: 3.84 },
  crown: {
    profile: [{ y: 0.45, r: 0.08 }, { y: 0.533, r: 0.1564 }, { y: 0.6, r: 0.1995 }, { y: 0.667, r: 0.2417 }, { y: 0.733, r: 0.19 }, { y: 0.8, r: 0.1854 }, { y: 0.867, r: 0.2083 }, { y: 0.933, r: 0.0967 }, { y: 1, r: 0.02 }],
    depthScale: 0.85, attractors: 560, kill: 0.65, influence: 3.2, step: 0.5, gravitropism: 0.1,
  },
  branches: { pipe: 2.2, tipRadius: 0.03 },
  leaves: { atlas: LEAVES + 'cf_mangrove.webp', cells: [4, 4], perTip: 2, size: 1.2, sizeJitter: 0.3, tint: 0xdfeee6, transmission: 0x3a9a6a },
  bark: { map: BARK, normal: BARK_N, tint: 0x5a5e62, veins: { map: VEINS, color: 0x2ae6ff, strength: 0.7 } },
  wind: { trunk: 0.15, branch: 0.5, flutter: 0.6 },
  provenance: { art: [art('Cybernetic_mangrove_trees_sheet_baece39d.jpg')], scores: { front: 0.623, side: 0.614, mean: 0.618 } },
};

export const CYBER_FOREST_TREES = [CF_VIOLET, CF_WILLOW, CF_BLUE, CF_MANGROVE];

// ── crowns for trees whose trunks are built elsewhere (Elderwood's Great Oak model, the oak platforms' trunks) ──
// CF-01 (the Great Oak sheet) shows the trunk and treehouse with only the crown's underside, so the crown shape is the
// broad dark dome of the level's canopy sprites; its leaf atlas is cut from those sprites (leafAtlas.py --opaque).
// No roots and no lean: the grown trunk must stay inside the trunk it rides in.
export const CF_GREAT_OAK: TreeSpecies = {
  kind: 'tree', id: 'cf-great-oak', name: 'Great Oak crown (Elderwood)', height: 62,
  trunk: { crownBase: 0.36, radius: 3.2, flare: 1, lean: 0, wobble: 0, twist: 0.4, roots: 0, rootReach: 1 },
  crown: {
    profile: [{ y: 0.34, r: 0.1 }, { y: 0.42, r: 0.27 }, { y: 0.5, r: 0.36 }, { y: 0.6, r: 0.4 }, { y: 0.7, r: 0.39 }, { y: 0.8, r: 0.34 }, { y: 0.88, r: 0.26 }, { y: 0.95, r: 0.14 }, { y: 1, r: 0.03 }],
    depthScale: 1, attractors: 1700, kill: 1.4, influence: 6.5, step: 1.1, gravitropism: -0.05,
  },
  branches: { pipe: 2.2, tipRadius: 0.05 },
  leaves: { atlas: LEAVES + 'cf_oak.webp', cells: [4, 4], perTip: 3, size: 4.8, sizeJitter: 0.35, tint: 0xd8e8e0, transmission: 0x2f8a78, glow: { color: 0x2ae6ff, strength: 0.18, beat: 0.25 } },
  bark: { map: BARK, normal: BARK_N, tint: 0x3e4a3c, veins: { map: VEINS, color: 0x2ae6ff, strength: 0.6 } },
  wind: { trunk: 0.03, branch: 0.35, flutter: 0.6 },
  provenance: { art: [art('CF-01 Great Oak'), '/games/rift-realm/assets/cyberforest/canopy_0.webp'] },
};

export const CF_PLATFORM_OAK: TreeSpecies = {
  ...CF_GREAT_OAK, id: 'cf-platform-oak', name: 'Platform oak crown (Elderwood)', height: 28,
  trunk: { crownBase: 0.55, radius: 1.3, flare: 1, lean: 0, wobble: 0, twist: 0.4, roots: 0, rootReach: 1 },
  crown: {
    profile: [{ y: 0.53, r: 0.1 }, { y: 0.6, r: 0.26 }, { y: 0.68, r: 0.35 }, { y: 0.76, r: 0.38 }, { y: 0.84, r: 0.34 }, { y: 0.92, r: 0.22 }, { y: 1, r: 0.04 }],
    depthScale: 1, attractors: 800, kill: 0.8, influence: 3.8, step: 0.65, gravitropism: 0,
  },
  branches: { pipe: 2.2, tipRadius: 0.035 },
  leaves: { ...CF_GREAT_OAK.leaves, size: 3.0 },
  wind: { trunk: 0.05, branch: 0.45, flutter: 0.7 },
};
