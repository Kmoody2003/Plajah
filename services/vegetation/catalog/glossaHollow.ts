// Glossa Hollow species (Lexicon: The Unwriting) — the naturalistic forest of Kenne's village art
// (`Word gaem/Nov 24 - 22_56/Fantasy_village_in_hollow_forest`, `Village_square_during_sunset`, `Hero_stands_beside_glowing_tree`):
// mossy giants whose roots wrap the cottages and cliffs, warm sunlit canopies (yellow-green light through the leaves),
// ferns and moss underfoot. No glow, no conduits: the only light in this forest is lanterns and words.
// Leaf tints lean warm because the shared oak atlas (cf_oak.webp) is cut from teal canopy sprites.
// Shapes are hand-set from the art for now (not yet fitted with fromArt/fitSpecies; provenance has no scores).
import type { GrassSpecies, TreeSpecies } from '../species';

const BARK = '/games/rift-realm/assets/cyberforest/bark_albedo.jpg';
const BARK_N = '/games/rift-realm/assets/cyberforest/bark_normal.jpg';
const LEAVES = '/vegetation/leaves/';
const art = (f: string) => `Word gaem/Nov 24 - 22_56/${f}`;

/** The hollow's mossy giants: huge flared trunks, roots spilling over the ground, a broad high crown. */
export const GH_ROOT_GIANT: TreeSpecies = {
  kind: 'tree', id: 'gh-root-giant', name: 'Glossa root giant', height: 30,
  trunk: { crownBase: 0.42, radius: 1.5, flare: 3.0, lean: 0.03, wobble: 0.8, twist: 0.9, roots: 11, rootReach: 5.2, furrow: 0.12, gnarl: 0.28, buttress: 1.0 },
  crown: {
    profile: [{ y: 0.4, r: 0.12 }, { y: 0.48, r: 0.3 }, { y: 0.56, r: 0.4 }, { y: 0.66, r: 0.44 }, { y: 0.76, r: 0.42 }, { y: 0.85, r: 0.34 }, { y: 0.93, r: 0.2 }, { y: 1, r: 0.05 }],
    depthScale: 1, attractors: 1300, kill: 1.0, influence: 4.6, step: 0.8, gravitropism: -0.05, limbs: 7,
  },
  branches: { pipe: 2.3, tipRadius: 0.035 },
  leaves: { atlas: LEAVES + 'cf_oak.webp', cells: [4, 4], perTip: 3, size: 2.4, sizeJitter: 0.35, tint: 0xd2c862, transmission: 0xdcc650 },
  bark: { map: BARK, normal: BARK_N, tint: 0x6e5c48, moss: { color: 0x4f5e2a, amount: 0.6 } },
  wind: { trunk: 0.03, branch: 0.35, flutter: 0.6 },
  provenance: { art: [art('Fantasy_village_in_hollow_forest_f6c9552b.jpg'), art('Hero_stands_beside_glowing_tree_888bf010.jpg')] },
};

/** Ordinary oaks between the giants and around the meadow. */
export const GH_OAK: TreeSpecies = {
  kind: 'tree', id: 'gh-oak', name: 'Glossa oak', height: 17,
  trunk: { crownBase: 0.38, radius: 0.7, flare: 2.2, lean: 0.04, wobble: 0.6, twist: 0.5, roots: 7, rootReach: 2.6, furrow: 0.1, gnarl: 0.2, buttress: 0.6 },
  crown: {
    profile: [{ y: 0.36, r: 0.14 }, { y: 0.45, r: 0.3 }, { y: 0.55, r: 0.38 }, { y: 0.65, r: 0.4 }, { y: 0.75, r: 0.37 }, { y: 0.85, r: 0.29 }, { y: 0.94, r: 0.15 }, { y: 1, r: 0.04 }],
    depthScale: 1, attractors: 900, kill: 0.7, influence: 3.4, step: 0.55, gravitropism: 0.05, limbs: 6,
  },
  branches: { pipe: 2.3, tipRadius: 0.028 },
  leaves: { atlas: LEAVES + 'cf_oak.webp', cells: [4, 4], perTip: 2, size: 1.5, sizeJitter: 0.3, tint: 0xd8cc6a, transmission: 0xdcc650 },
  bark: { map: BARK, normal: BARK_N, tint: 0x75624c, moss: { color: 0x56642c, amount: 0.35 } },
  wind: { trunk: 0.1, branch: 0.5, flutter: 0.7 },
  provenance: { art: [art('Village_square_during_sunset_9f69712e.jpg')] },
};

/** Tall slender trees for the far layers of the hollow (the misty verticals behind the village). */
export const GH_SLENDER: TreeSpecies = {
  kind: 'tree', id: 'gh-slender', name: 'Glossa slender ash', height: 24,
  trunk: { crownBase: 0.55, radius: 0.55, flare: 1.8, lean: 0.02, wobble: 0.4, twist: 0.2, roots: 6, rootReach: 2.0, furrow: 0.08, gnarl: 0.1, buttress: 0.4 },
  crown: {
    profile: [{ y: 0.52, r: 0.08 }, { y: 0.6, r: 0.17 }, { y: 0.7, r: 0.21 }, { y: 0.8, r: 0.2 }, { y: 0.9, r: 0.14 }, { y: 1, r: 0.03 }],
    depthScale: 1, attractors: 700, kill: 0.7, influence: 3.2, step: 0.55, gravitropism: 0.15, limbs: 6,
  },
  branches: { pipe: 2.3, tipRadius: 0.025 },
  leaves: { atlas: LEAVES + 'cf_oak.webp', cells: [4, 4], perTip: 2, size: 1.3, sizeJitter: 0.3, tint: 0xc4bc62, transmission: 0xd0c050 },
  bark: { map: BARK, normal: BARK_N, tint: 0x8a7c66, moss: { color: 0x56642c, amount: 0.3 } },
  wind: { trunk: 0.14, branch: 0.55, flutter: 0.8 },
  provenance: { art: [art('Fantasy_village_in_hollow_forest_f6c9552b.jpg')] },
};

export const GLOSSA_TREES = [GH_ROOT_GIANT, GH_OAK, GH_SLENDER];

/** The meadow: warm olive grass, knee-low, gold at the tips in low sun. */
export const GH_MEADOW: GrassSpecies = {
  kind: 'grass', id: 'gh-meadow', name: 'Glossa meadow grass',
  blade: { height: 0.5, heightJitter: 0.45, width: 0.04, curve: 0.3, splay: 0.45 },
  density: 30,
  clump: { size: 2.8, strength: 0.6 },
  color: { base: 0x2a2a14, mid: 0x5e6a2c, tip: 0xbab866, jitter: 0.26, streak: 0.3 },
  translucency: 0.5,
  wind: { sway: 0.7, flutter: 0.8 },
  provenance: { art: [art('Fantasy_village_in_hollow_forest_f6c9552b.jpg'), art('Village_square_during_sunset_9f69712e.jpg')] },
};

/** Short moss between the cobbles and under the giants. */
export const GH_MOSS: GrassSpecies = {
  kind: 'grass', id: 'gh-moss', name: 'Glossa moss',
  blade: { height: 0.12, heightJitter: 0.4, width: 0.035, curve: 0.45, splay: 0.7 },
  density: 18, // short moss reads from the ground texture; the blades only break up its edge (iGPU cost)
  clump: { size: 2.2, strength: 0.45 },
  color: { base: 0x22261a, mid: 0x4a5a26, tip: 0x8a9a44, jitter: 0.25, streak: 0.2 },
  translucency: 0.55,
  wind: { sway: 0.2, flutter: 0.3 },
  provenance: { art: [art('Fantasy_village_in_hollow_forest_f6c9552b.jpg')] },
};

export const GLOSSA_GRASS = [GH_MEADOW, GH_MOSS];
