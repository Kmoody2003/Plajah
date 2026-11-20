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

export const CYBER_FOREST_PLANTS = [CF_FERN, CF_BUSH, CF_GLOW_FLOWER];
