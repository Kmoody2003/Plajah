// Cyber Forest grass species — from Kenne's grass sprites (Shooter/Cyber Forest Level Assets → grass_a/b/c): dark
// brown-black roots, blades turning teal at mid-height and pale glowing cyan at the tips, each blade striated with a
// bright streak. Colours are the sprites' median colour by height (2026-11-20). `ground` channel = cover texture slot.
import type { GrassSpecies } from '../species';

const art = (f: string) => `Shooter/Cyber Forest Level Assets/${f}`;

/** The tall glowing tufts of the sprites (grass_a/b/c): clumpy, cyan-tipped, knee to hip high. */
export const CF_GLOW_GRASS: GrassSpecies = {
  kind: 'grass', id: 'cf-glow-grass', name: 'Cyber Forest glow grass',
  blade: { height: 0.85, heightJitter: 0.4, width: 0.045, curve: 0.25, splay: 0.35 },
  density: 34,
  clump: { size: 2.6, strength: 0.85 },
  color: { base: 0x231f19, mid: 0x4a7480, tip: 0x8ccfd8, jitter: 0.22, streak: 0.7 },
  glow: { color: 0x3fdcff, strength: 0.14, from: 0.6, beat: 0.3 },
  translucency: 0.45,
  wind: { sway: 0.8, flutter: 0.9 },
  provenance: { art: [art('grass_a'), art('grass_b'), art('grass_c')] },
};

/** The short dark turf between the tufts (the ground of the sheets' scene renders): even, barely glowing. */
export const CF_TURF: GrassSpecies = {
  kind: 'grass', id: 'cf-turf', name: 'Cyber Forest turf',
  blade: { height: 0.42, heightJitter: 0.35, width: 0.04, curve: 0.35, splay: 0.5 },
  density: 60,
  clump: { size: 4, strength: 0.35 },
  color: { base: 0x182822, mid: 0x356a6c, tip: 0x6cb8a8, jitter: 0.2, streak: 0.4 },
  glow: { color: 0x2ae6c8, strength: 0.06, from: 0.7, beat: 0.15 },
  translucency: 0.5,
  wind: { sway: 0.55, flutter: 0.6 },
  provenance: { art: [art('fern_b (palette)'), art('ground render')] },
};

export const CYBER_FOREST_GRASS = [CF_GLOW_GRASS, CF_TURF];
