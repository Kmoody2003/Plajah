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

// ── Elderwood Wilds floor (the art stills behind the level: Mossy Floor, Great Oak, Portal Plaza) ──
// The stills' forest floor is moss, ferns and leaf litter in warm yellow-greens, with the cyan glow only as accents. The
// Wilds keep the glow tufts as rarer, tighter clumps and swap the knee-high teal turf for short warm moss-grass.

/** The glow tufts as accents: fewer, tighter clumps, shorter, olive blades with the cyan glow only at the tips (the
 *  Wilds' ground grows tufts almost everywhere, so teal blades read as a teal carpet). */
export const WILDS_GLOW_TUFTS: GrassSpecies = {
  ...CF_GLOW_GRASS, id: 'wilds-glow-tufts', name: 'Wilds glow tufts',
  blade: { ...CF_GLOW_GRASS.blade, height: 0.6 },
  density: 8,
  clump: { size: 2.2, strength: 0.95 },
  color: { base: 0x22200f, mid: 0x4e6328, tip: 0xa2c070, jitter: 0.25, streak: 0.5 },
  glow: { color: 0x3fdcff, strength: 0.12, from: 0.75, beat: 0.3 },
};

/** Short warm moss-grass: the floor between the ferns (yellow-green tips over dark earth, no glow). */
export const WILDS_MOSS_TURF: GrassSpecies = {
  kind: 'grass', id: 'wilds-moss-turf', name: 'Wilds moss turf',
  blade: { height: 0.22, heightJitter: 0.45, width: 0.035, curve: 0.4, splay: 0.6 },
  density: 52,
  clump: { size: 3, strength: 0.5 },
  color: { base: 0x24261a, mid: 0x5a6c2a, tip: 0xb0b454, jitter: 0.28, streak: 0.25 },
  translucency: 0.55,
  wind: { sway: 0.4, flutter: 0.5 },
  provenance: { art: ['Shooter/eh-08 mossy forest floor (still)'] },
};

export const WILDS_FLOOR_GRASS = [WILDS_GLOW_TUFTS, WILDS_MOSS_TURF];
