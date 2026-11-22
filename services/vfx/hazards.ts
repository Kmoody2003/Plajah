// Plajah VFX — recipes for a dangerous world: environment hazards and predator attacks (Rift Realm danger/*).
// Same data shape as recipes.ts; each is registered into RECIPES so Game Studio sees them too.
import type { Recipe } from './sim';
import { RECIPES } from './recipes';

/** Poison spore pod bursting: a sickly green cloud that hangs and drifts, with bright spores tumbling through it. */
export const POISON_MIST: Recipe = {
  id: 'poison_mist', sound: 'hiss',
  emitters: [
    { layer: 'alpha', shape: 'smoke', count: [8, 12], life: [1.6, 2.8], speed: [0.6, 2.2], spread: Math.PI * 0.7, radius: 0.5, size: [0.6, 2.6], color: [0x9be03a, 0x3d6a1c], alpha: [0.5, 0], drag: 1.4, lift: [0.15, 0.5], turbulence: 1.2, spin: [0.1, 0.5] },
    { layer: 'add', shape: 'soft', count: [16, 24], life: [1, 2.2], speed: [0.4, 2], spread: Math.PI, radius: 0.8, size: [0.07, 0.02], color: [0xd8ff6a, 0x6fdc2a], intensity: [1.6, 2.6], drag: 1, turbulence: 3, lift: [0.1, 0.4] },
  ],
};

/** A slow wisp of poison drifting off a pod or a toxic pool (spawn now and then for ambience). */
export const POISON_WISP: Recipe = {
  id: 'poison_wisp',
  emitters: [
    { layer: 'alpha', shape: 'smoke', count: [1, 2], life: [2, 3.2], speed: [0.1, 0.4], spread: Math.PI, radius: 0.8, size: [0.4, 1.4], color: [0x86c83a, 0x2f5418], alpha: [0.28, 0], drag: 0.8, lift: [0.2, 0.45], spin: [0.05, 0.3] },
    { layer: 'add', shape: 'soft', count: [2, 4], life: [1.2, 2], speed: [0.1, 0.5], spread: Math.PI, radius: 0.7, size: [0.05, 0.015], color: [0xd8ff6a, 0x6fdc2a], intensity: 2, turbulence: 2, lift: [0.2, 0.6] },
  ],
};

/** Toxic swamp water: a bubble rising and popping with a green glint. */
export const TOXIC_BUBBLE: Recipe = {
  id: 'toxic_bubble',
  emitters: [
    { layer: 'add', shape: 'ring', count: 1, life: 0.5, speed: 0, size: [0.05, 0.5], color: [0xc8ff70, 0x5fbf20], intensity: 1.2, alpha: [0.9, 0] },
    { layer: 'add', shape: 'soft', count: [3, 5], life: [0.3, 0.6], speed: [0.6, 1.6], spread: 0.6, size: [0.05, 0.01], color: [0xe0ff90, 0x7fdc30], intensity: 2, gravity: 4 },
  ],
};

/** Lava pool / fissure ambience: a few embers and a lick of heat haze smoke. */
export const LAVA_EMBERS: Recipe = {
  id: 'lava_embers',
  emitters: [
    { layer: 'add', shape: 'soft', count: [4, 8], life: [0.8, 1.8], speed: [0.4, 1.4], spread: Math.PI * 0.4, radius: 0.9, size: [0.06, 0.015], color: [0xffe6a0, 0xff3c0a], intensity: [3, 5], drag: 0.7, turbulence: 4, lift: [1.2, 2.6] },
    { layer: 'alpha', shape: 'smoke', count: [0, 1], life: [1.5, 2.5], speed: [0.2, 0.6], spread: 0.5, radius: 0.6, size: [0.5, 1.6], color: [0x3a2420, 0x1a1414], alpha: [0.3, 0], drag: 1, lift: [0.6, 1.2], spin: [0.1, 0.3] },
  ],
};

/** A vent about to blow (the tell): smoke and sparks spitting from the mouth. Spawn repeatedly during the build-up. */
export const VENT_SPUTTER: Recipe = {
  id: 'vent_sputter',
  emitters: [
    { layer: 'alpha', shape: 'smoke', count: [1, 2], life: [0.9, 1.5], speed: [2, 4], spread: 0.25, radius: 0.3, size: [0.3, 1.2], color: [0x4a4440, 0x221e1c], alpha: [0.5, 0], drag: 1.2, lift: [0.5, 1], spin: [0.2, 0.6] },
    { layer: 'add', shape: 'spark', count: [3, 6], life: [0.3, 0.7], speed: [4, 9], spread: 0.35, size: [0.035, 0.012], color: [0xfff0b0, 0xff5a10], intensity: 3, gravity: 9, drag: 0.8, stretch: 0.03 },
  ],
};

/** Volcanic vent eruption: a roaring column of fire, a spray of lava blobs, a plume of black smoke. */
export const VENT_BURST: Recipe = {
  id: 'vent_burst', sound: 'boom', shake: 0.25,
  light: { color: 0xff6a1a, intensity: 22, range: 12, life: 0.9 },
  emitters: [
    { layer: 'add', shape: 'soft', count: [40, 56], life: [0.7, 1.4], speed: [12, 20], spread: 0.2, radius: 0.6, size: [1.3, 3.2], color: [0xfff2c0, 0xff3a08], intensity: [2.6, 3.6], alpha: [1, 0], drag: 1.3, turbulence: 3 },
    { layer: 'add', shape: 'spark', count: [30, 44], life: [0.6, 1.4], speed: [8, 18], spread: 0.6, radius: 0.4, size: [0.08, 0.03], color: [0xffe6a0, 0xff3c0a], intensity: [3, 5], gravity: 12, drag: 0.4, stretch: 0.02, bounce: 0.2 },
    { layer: 'alpha', shape: 'smoke', count: [8, 12], delay: 0.15, life: [2, 3.4], speed: [4, 9], spread: 0.35, radius: 0.6, size: [1, 4], color: [0x2c2420, 0x121010], alpha: [0.55, 0], drag: 1.1, lift: [1, 2], spin: [0.1, 0.4] },
  ],
};

/** Falling rock landing: a heavy dust cloud, grit and stone chips, a ground ring. */
export const ROCK_IMPACT: Recipe = {
  id: 'rock_impact', sound: 'boom', shake: 0.3,
  emitters: [
    { layer: 'alpha', shape: 'smoke', count: [8, 12], life: [1.2, 2.2], speed: [2, 5], spread: Math.PI * 0.45, radius: 0.6, size: [0.8, 3], color: [0x9a8f80, 0x5e574e], alpha: [0.6, 0], drag: 2.2, lift: [0.1, 0.4], spin: [0.1, 0.5] },
    { layer: 'shard', count: [14, 20], life: [0.9, 1.5], speed: [4, 10], spread: Math.PI * 0.45, radius: 0.4, size: [0.18, 0.1], color: [0x7a7268, 0x4a443e], intensity: 0.35, alpha: [1, 1], gravity: 14, drag: 0.4, spin: [4, 12], bounce: 0.3 },
    { layer: 'add', shape: 'ring', count: 1, life: 0.3, speed: 0, size: [0.4, 3.2], color: [0xd8c8b0, 0x8a7a68], intensity: 0.5, alpha: [0.6, 0] },
  ],
};

/** Grit trickling down a cliff before a rockfall (the tell). */
export const ROCK_TRICKLE: Recipe = {
  id: 'rock_trickle',
  emitters: [
    { layer: 'alpha', shape: 'smoke', count: [1, 2], life: [0.8, 1.4], speed: [0.3, 0.8], spread: Math.PI, radius: 0.8, size: [0.3, 1], color: [0x9a8f80, 0x6e665c], alpha: [0.35, 0], drag: 1, gravity: 2 },
    { layer: 'shard', count: [2, 4], life: [1, 1.6], speed: [0.5, 1.5], spread: Math.PI, radius: 0.8, size: [0.06, 0.04], color: [0x7a7268, 0x4a443e], intensity: 0.3, alpha: [1, 1], gravity: 12, spin: [3, 8] },
  ],
};

/** Electric discharge sparks along an arc (spawn at points along the bolt) — electrified fungi, storm bats, wasp bolts. */
export const SPARK_ARC: Recipe = {
  id: 'spark_arc', sound: 'zap',
  light: { color: 'tint', intensity: 8, range: 6, life: 0.12 },
  emitters: [
    { layer: 'add', shape: 'soft', count: 1, life: 0.08, speed: 0, size: [0.35, 0.6], color: ['tint+white', 'tint'], intensity: 3, alpha: [1, 0] },
    { layer: 'add', shape: 'spark', count: [6, 10], life: [0.12, 0.3], speed: [3, 9], spread: Math.PI, size: [0.03, 0.008], color: ['tint+white', 'tint'], intensity: [2.5, 4], drag: 3, gravity: 3, stretch: 0.03 },
  ],
};

/** Fungi / creature charging up (the tell): a crackle of small sparks round it. */
export const SPARK_CHARGE: Recipe = {
  id: 'spark_charge',
  emitters: [
    { layer: 'add', shape: 'spark', count: [2, 4], life: [0.08, 0.2], speed: [1, 4], spread: Math.PI, radius: 0.5, size: [0.025, 0.006], color: ['tint+white', 'tint'], intensity: 3, drag: 4, stretch: 0.02 },
  ],
};

/** Thorns biting: a splinter of dark red sparks and a few torn leaves. */
export const THORN_SCRATCH: Recipe = {
  id: 'thorn_scratch',
  emitters: [
    { layer: 'add', shape: 'spark', count: [5, 8], life: [0.15, 0.35], speed: [2, 5], spread: Math.PI * 0.6, size: [0.03, 0.01], color: [0xff8a70, 0xa01818], intensity: 2, gravity: 6, drag: 2, stretch: 0.02 },
    { layer: 'shard', count: [2, 4], life: [0.8, 1.3], speed: [1, 3], spread: Math.PI * 0.6, size: [0.06, 0.04], color: [0x3a5a26, 0x203a16], intensity: 0.4, alpha: [1, 0], gravity: 4, drag: 1.5, spin: [3, 9] },
  ],
};

/** Predator wind-up glow (eyes / stinger flaring): tint flare + motes drawn in. */
export const PREDATOR_TELL: Recipe = {
  id: 'predator_tell',
  emitters: [
    { layer: 'add', shape: 'soft', count: 1, life: 0.18, speed: 0, size: [0.25, 0.5], color: ['tint+white', 'tint'], intensity: 3, alpha: [0.9, 0] },
    { layer: 'add', shape: 'soft', count: [3, 5], life: [0.25, 0.45], speed: [0.3, 1], spread: Math.PI, radius: 0.5, size: [0.04, 0.01], color: ['tint+white', 'tint'], intensity: 2.5, drag: 1 },
  ],
};

/** Wasp plasma bolt / bat shock landing. */
export const PLASMA_POP: Recipe = {
  id: 'plasma_pop', sound: 'zap',
  light: { color: 'tint', intensity: 10, range: 6, life: 0.18 },
  emitters: [
    { layer: 'add', shape: 'soft', count: 1, life: 0.14, speed: 0, size: [0.5, 1.2], color: ['tint+white', 'tint'], intensity: 3, alpha: [1, 0] },
    { layer: 'add', shape: 'spark', count: [14, 22], life: [0.2, 0.5], speed: [4, 11], spread: Math.PI, size: [0.04, 0.012], color: ['tint+white', 'tint'], intensity: [2.5, 4], gravity: 6, drag: 2, stretch: 0.03 },
    { layer: 'add', shape: 'ring', count: 1, life: 0.2, speed: 0, size: [0.2, 1.6], color: ['tint+white', 'tint'], intensity: 1, alpha: [0.8, 0] },
  ],
};

/** A health orb / loot pickup collected. */
export const PICKUP_GLINT: Recipe = {
  id: 'pickup_glint',
  emitters: [
    { layer: 'add', shape: 'ring', count: 1, life: 0.3, speed: 0, size: [0.2, 1.4], color: ['tint+white', 'tint'], intensity: 1.2, alpha: [1, 0] },
    { layer: 'add', shape: 'soft', count: [10, 14], life: [0.4, 0.8], speed: [1, 3], spread: Math.PI, size: [0.06, 0.01], color: ['tint+white', 'tint'], intensity: 2.5, drag: 2, lift: [0.5, 1.5] },
  ],
};

for (const r of [POISON_MIST, POISON_WISP, TOXIC_BUBBLE, LAVA_EMBERS, VENT_SPUTTER, VENT_BURST, ROCK_IMPACT, ROCK_TRICKLE, SPARK_ARC, SPARK_CHARGE, THORN_SCRATCH, PREDATOR_TELL, PLASMA_POP, PICKUP_GLINT]) RECIPES[r.id] = r;
