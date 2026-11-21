// Cyber Forest fungi — from Kenne's mushroom sheets (Shooter/Cyber Forest Level Assets): neon mushroom clusters on
// mossy root balls (Neon_forest_mushrooms_orthograph…, sprites shroom_a/b), the alien cybernetic toadstool (Cybernetic_
// toadstools…, sprite toadstool), the tall jelly mushroom on a braided stem (Bioluminescent_mushrooms_with_in…, sprite
// shroom_tall), the spore-emitting bulb (Fungi_emitting_spores…, sprite spore_pod) and the bioluminescent shelf fungi
// (Bioluminescent_fungi_growing_on…). Sizes from the sheets' scale bars where given (the bulb: 1.5 m).
import type { FungusSpecies } from '../species';

const art = (f: string) => `Shooter/Cyber Forest Level Assets/${f}`;

export const CF_NEON_CLUSTER: FungusSpecies = {
  kind: 'fungus', id: 'cf-neon-cluster', name: 'Neon mushroom cluster', form: 'cap',
  cap: { radius: 0.34, height: 0.24, flat: 0.15, curl: 0.3, bulb: 0, lumps: 0, pits: 0 },
  gills: { count: 18, depth: 0.045 },
  stem: { height: 0.8, radius: 0.045, base: 0.07, strands: 0, twist: 0, cables: 1, lean: 0.06 },
  roots: { count: 3, reach: 0.18 },
  cluster: { count: 10, spread: 0.32, falloff: 0.8, ball: 0.36 },
  look: {
    capTop: 0x5a5ee0, capUnder: 0x7aa8f0, stem: 0xb6ae9c, root: 0x2c2620,
    pattern: 'circuit', patternColor: 0x58e6ff, translucency: 0.95, roughness: 0.28,
    glow: { pattern: 1.1, gills: 0.5, cables: 0.9, color: 0x3fd8ff, beat: 0.6 },
  },
  spores: { count: 3, color: 0x9ad8ff, rise: 1.6 },
  wobble: 0.5,
  provenance: { art: [art('Neon_forest_mushrooms_orthograph…_3369c035.jpg'), art('shroom_a'), art('shroom_b')] },
};

export const CF_TOADSTOOL: FungusSpecies = {
  kind: 'fungus', id: 'cf-toadstool', name: 'Alien cybernetic toadstool', form: 'cap',
  cap: { radius: 0.62, height: 0.34, flat: 0.5, curl: 0.35, bulb: 0, lumps: 0.015, pits: 0 },
  gills: { count: 44, depth: 0.07 },
  stem: { height: 1.15, radius: 0.085, base: 0.14, strands: 0, twist: 0, cables: 3, lean: 0.08 },
  roots: { count: 8, reach: 0.5 },
  cluster: { count: 3, spread: 0.45, falloff: 0.4, ball: 0 },
  look: {
    capTop: 0x6c7656, capUnder: 0x8e9a6c, stem: 0xb5a88c, root: 0x4a3a2c,
    pattern: 'spots', patternColor: 0xbfe8a4, translucency: 0.12, roughness: 0.6,
    glow: { pattern: 0.35, gills: 0.85, cables: 0.7, color: 0x8ef07a, beat: 0.4 },
  },
  wobble: 0.15,
  provenance: { art: [art('Cybernetic_toadstools_with_glowi…_16da139c.jpg'), art('toadstool')] },
};

export const CF_JELLY_TALL: FungusSpecies = {
  kind: 'fungus', id: 'cf-jelly-tall', name: 'Tall jelly mushroom', form: 'cap',
  cap: { radius: 1.15, height: 0.75, flat: 0.1, curl: 0.38, bulb: 0, lumps: 0.01, pits: 0 },
  gills: { count: 48, depth: 0.1 },
  stem: { height: 3.1, radius: 0.13, base: 0.3, strands: 6, twist: 1.1, cables: 3, lean: 0.07 },
  roots: { count: 12, reach: 1.5 },
  cluster: { count: 1, spread: 0, falloff: 0, ball: 0 },
  look: {
    capTop: 0x5e7486, capUnder: 0x8a9ca6, stem: 0x8a8a78, root: 0x3a3a30,
    pattern: 'circuit', patternColor: 0x40e0ff, translucency: 0.5, roughness: 0.32,
    glow: { pattern: 0.85, gills: 0.4, cables: 1.0, color: 0x30d8ff, beat: 0.5 },
  },
  spores: { count: 8, color: 0x8ae8ff, rise: 2.6 },
  wobble: 0.35,
  provenance: { art: [art('Bioluminescent_mushrooms_with_in…_efd6139a.jpg'), art('shroom_tall')] },
};

export const CF_SPORE_BULB: FungusSpecies = {
  kind: 'fungus', id: 'cf-spore-bulb', name: 'Spore-emitting bulb fungus', form: 'cap',
  cap: { radius: 0.44, height: 0.46, flat: 0, curl: 0, bulb: 0.42, lumps: 0.07, pits: 7 },
  gills: { count: 0, depth: 0 },
  stem: { height: 1.1, radius: 0.13, base: 0.26, strands: 8, twist: 0.7, cables: 2, lean: 0.03 },
  roots: { count: 14, reach: 0.6 },
  cluster: { count: 1, spread: 0, falloff: 0, ball: 0 },
  look: {
    capTop: 0xa8987c, capUnder: 0x8a7c64, stem: 0x6c6a48, root: 0x4a4430,
    pattern: 'circuit', patternColor: 0x46d8ff, translucency: 0.08, roughness: 0.9,
    glow: { pattern: 0.8, gills: 0, cables: 0.8, color: 0x46d8ff, beat: 0.5 },
  },
  spores: { count: 26, color: 0xa8f0ff, rise: 3.2 },
  wobble: 0.1,
  provenance: { art: [art('Fungi_emitting_spores_e88da0aa.jpg'), art('spore_pod')] },
};

export const CF_SHELF: FungusSpecies = {
  kind: 'fungus', id: 'cf-shelf', name: 'Bioluminescent shelf fungus', form: 'shelf',
  cap: { radius: 0.42, height: 0.07, flat: 0.6, curl: 0.2, bulb: 0, lumps: 0, pits: 0 },
  gills: { count: 0, depth: 0 },
  stem: { height: 0, radius: 0.01, base: 0.01, strands: 0, twist: 0, cables: 0, lean: 0 },
  roots: { count: 0, reach: 0 },
  cluster: { count: 4, spread: 0.3, falloff: 0.5, ball: 0 },
  look: {
    capTop: 0x5a6048, capUnder: 0x3ae8cc, stem: 0x5a6048, root: 0x3a3a30,
    pattern: 'none', patternColor: 0x3ae8cc, translucency: 0.1, roughness: 0.8,
    glow: { pattern: 0, gills: 1.1, cables: 0, color: 0x30e8c8, beat: 0.5 },
  },
  spores: { count: 2, color: 0x7af0d8, rise: 1.0 },
  wobble: 0,
  provenance: { art: [art('Bioluminescent_fungi_growing_on…_c7ef803d.jpg')] },
};

export const CYBER_FOREST_FUNGI = [CF_NEON_CLUSTER, CF_TOADSTOOL, CF_JELLY_TALL, CF_SPORE_BULB, CF_SHELF];
