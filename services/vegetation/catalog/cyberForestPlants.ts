// Cyber Forest plants — from Kenne's undergrowth sprites (Shooter/Cyber Forest Level Assets): fern_a/b/c (teal fronds
// with violet midribs), bush_a/b (teal broadleaf, pale edges), flower_a/b (glowing violet-pink blooms, cyan centres,
// twisted stems). Colours from the sprites' median colour by height (2026-11-20).
import type { PlantSpecies } from '../species';

const art = (f: string) => `Shooter/Cyber Forest Level Assets/${f}`;

export const CF_FERN: PlantSpecies = {
  kind: 'plant', id: 'cf-fern', name: 'Cyber fern', form: 'fern',
  height: 1.25, spread: 1.4, count: 9, parts: 16, leaf: 0.3,
  color: { stem: 0x1f2a2c, leaf: 0x2e5661, tip: 0x5ca99d, vein: 0x7a4fb0 },
  wind: { sway: 0.7, flutter: 0.8 },
  provenance: { art: [art('fern_a'), art('fern_b'), art('fern_c')] },
};

export const CF_BUSH: PlantSpecies = {
  kind: 'plant', id: 'cf-bush', name: 'Cyber broadleaf bush', form: 'bush',
  height: 1.3, spread: 1.0, count: 9, parts: 9, leaf: 0.24,
  color: { stem: 0x24323a, leaf: 0x3d8b94, tip: 0x8fd6da, vein: 0x2a5f6a },
  glow: { color: 0x40e8e0, strength: 0.25, beat: 0.2 },
  wind: { sway: 0.5, flutter: 0.9 },
  provenance: { art: [art('bush_a'), art('bush_b')] },
};

export const CF_GLOW_FLOWER: PlantSpecies = {
  kind: 'plant', id: 'cf-glow-flower', name: 'Cyber glow flower', form: 'flower',
  height: 1.4, spread: 0.5, count: 2, parts: 6, leaf: 0.3,
  color: { stem: 0x4a3d33, leaf: 0x6a4cc8, tip: 0xd07ad8, vein: 0x2f8a7a },
  glow: { color: 0xb070ff, strength: 0.9, beat: 0.6, center: 0x7af0ff },
  wind: { sway: 0.6, flutter: 0.5 },
  provenance: { art: [art('flower_a'), art('flower_b')] },
};

/** Hanging vine tendrils (Cybernetic_vine_tendrils…, sprites vine_a/b/c): hung from branches, height = hanging length. */
export const CF_VINE: PlantSpecies = {
  kind: 'plant', id: 'cf-vine', name: 'Cybernetic vine tendrils', form: 'vine',
  height: 5, spread: 0.8, count: 11, parts: 12, leaf: 0.24,
  color: { stem: 0x2a2a22, leaf: 0x2f6a5a, tip: 0x4a9a8a, vein: 0x40e0d0 },
  glow: { color: 0x40e0ff, strength: 0.6, beat: 0.4, center: 0xe08ae8 },
  accents: { cable: 0x30d8ff, metal: 0x5a6066 },
  wind: { sway: 1.0, flutter: 0.8 },
  provenance: { art: ['Shooter/Cyber Forest Level Assets/Cybernetic_vine_tendrils_asset_s…_4c5e323f.jpg', 'vine_a', 'vine_b', 'vine_c'] },
};

/** Crystalline plant (Crystalline_plants_orthographic…, sprite crystal_plant): gnarled trunk, gem leaves, crystal flowers. */
export const CF_CRYSTAL_PLANT: PlantSpecies = {
  kind: 'plant', id: 'cf-crystal-plant', name: 'Crystalline plant', form: 'crystal',
  height: 2.4, spread: 1.0, count: 4, parts: 7, leaf: 0.22,
  color: { stem: 0x3a3830, leaf: 0x2e6a78, tip: 0x6ac8d8, vein: 0x6a50b0 },
  glow: { color: 0x8af0e8, strength: 0.6, beat: 0.5, center: 0x8af0e8 },
  accents: { cable: 0x30d8ff },
  wind: { sway: 0.2, flutter: 0.2 },
  provenance: { art: ['Shooter/Cyber Forest Level Assets/Crystalline_plants_orthographic_…_4085b876.jpg', 'crystal_plant'] },
};

/** Cybernetic resin node stump (Cyber_forest_glowing_resin_props…, sprite resin_stump). */
export const CF_RESIN_STUMP: PlantSpecies = {
  kind: 'plant', id: 'cf-resin-stump', name: 'Cybernetic resin stump', form: 'stump',
  height: 1.4, spread: 1.4, count: 1, parts: 1, leaf: 0.1,
  color: { stem: 0x3a3228, leaf: 0x3a3228, tip: 0x3a3228 },
  glow: { color: 0xffa028, strength: 0.9, beat: 0.5 },
  accents: { resin: 0xffa028, crystal: 0x30a8ff, metal: 0x4a4e52 },
  wind: { sway: 0, flutter: 0 },
  provenance: { art: ['Shooter/Cyber Forest Level Assets/Cyber_forest_glowing_resin_props_f123e792.jpg', 'resin_stump'] },
};

/** Cybernetic carnivorous plant (sprite carnivore): mossy stalk, an open toothed jaw, cables, roots. */
export const CF_CARNIVORE: PlantSpecies = {
  kind: 'plant', id: 'cf-carnivore', name: 'Cybernetic carnivorous plant', form: 'carnivore',
  height: 2.8, spread: 1.0, count: 1, parts: 1, leaf: 0.1,
  color: { stem: 0x4a5a3a, leaf: 0x4a5a3a, tip: 0x6a7a4a },
  glow: { color: 0x30d8ff, strength: 0.7, beat: 0.4 },
  accents: { cable: 0x30d8ff },
  wind: { sway: 0.15, flutter: 0 },
  provenance: { art: ['carnivore'] },
};

export const CYBER_FOREST_PLANTS = [CF_FERN, CF_BUSH, CF_GLOW_FLOWER, CF_VINE, CF_CRYSTAL_PLANT, CF_RESIN_STUMP, CF_CARNIVORE];
