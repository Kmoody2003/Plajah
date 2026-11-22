// Plajah VFX — effect recipes. Each one is plain data over the sim's building blocks, so Game Studio can edit and
// add them; `sound` names the clip family from the SFX library (docs/rift-realm-fx-study.md §1) that plays with it.
// Looks are taken from the Flow reference videos (frame sheets in docs/rift-realm-fx/).
import type { Recipe } from './sim';

const HOT = 0xfff4d6; // white-gold core most energy sparks start at

/** Shot landing on an enemy: a hot flash, tinted sparks spraying back off the surface, a fading ring. */
export const HIT_SPARKS: Recipe = {
  id: 'hit_sparks', sound: 'impact',
  light: { color: 'tint', intensity: 6, range: 4, life: 0.12 },
  emitters: [
    { layer: 'add', shape: 'soft', count: 1, life: 0.09, speed: 0, size: [0.45, 0.8], color: ['tint+white', 'tint'], intensity: 2, alpha: [1, 0] },
    { layer: 'add', shape: 'spark', count: [14, 20], life: [0.18, 0.4], speed: [5, 13], spread: 1.1, size: [0.035, 0.012], color: ['tint+white', 'tint'], intensity: [1.6, 2.4], gravity: 9, drag: 2.5, stretch: 0.03 },
    { layer: 'add', shape: 'soft', count: [6, 10], life: [0.3, 0.7], speed: [0.6, 2], spread: 1.4, size: [0.05, 0.015], color: ['tint+white', 'tint'], intensity: 2, drag: 1.5, turbulence: 3, lift: [0.2, 0.8] },
    { layer: 'add', shape: 'ring', count: 1, life: 0.16, speed: 0, size: [0.15, 0.9], color: ['tint+white', 'tint'], intensity: 0.9, alpha: [0.8, 0] },
  ],
};

/** PERFECT-beat hit: the same, gold, bigger and with a second spark wave. */
export const HIT_PERFECT: Recipe = {
  id: 'hit_perfect', sound: 'impact',
  light: { color: 0xffc94a, intensity: 10, range: 5, life: 0.16 },
  emitters: [
    { layer: 'add', shape: 'soft', count: 1, life: 0.12, speed: 0, size: [0.7, 1.3], color: [0xffffff, 0xfbbf24], intensity: 4, alpha: [1, 0] },
    { layer: 'add', shape: 'spark', count: [26, 34], life: [0.25, 0.55], speed: [7, 17], spread: 1.25, size: [0.045, 0.014], color: [HOT, 0xfbbf24], intensity: [3, 5], gravity: 9, drag: 2.2, stretch: 0.035, bounce: 0.35 },
    { layer: 'add', shape: 'spark', count: [10, 14], delay: 0.05, life: [0.2, 0.4], speed: [3, 7], spread: Math.PI, size: [0.03, 0.01], color: [HOT, 0xff9a2a], intensity: 3, gravity: 6, drag: 3, stretch: 0.03 },
    { layer: 'add', shape: 'ring', count: 1, life: 0.22, speed: 0, size: [0.2, 1.5], color: [0xffe7a0, 0xfbbf24], intensity: 1.1, alpha: [0.85, 0] },
  ],
};

/** Shot hitting the world (stone, bark, ground): sparks that bounce, a puff of dust. */
export const WALL_IMPACT: Recipe = {
  id: 'wall_impact', sound: 'impact',
  emitters: [
    { layer: 'add', shape: 'soft', count: 1, life: 0.07, speed: 0, size: [0.3, 0.5], color: ['tint+white', 'tint'], intensity: 2.5, alpha: [1, 0] },
    { layer: 'add', shape: 'spark', count: [8, 12], life: [0.25, 0.6], speed: [3, 8], spread: 0.9, size: [0.025, 0.01], color: [HOT, 0xff8a2a], intensity: [2, 3.5], gravity: 9.8, drag: 1.2, stretch: 0.025, bounce: 0.4 },
    { layer: 'alpha', shape: 'smoke', count: [2, 3], life: [0.6, 1.1], speed: [0.4, 1.2], spread: 0.8, size: [0.15, 0.55], color: [0x8a8478, 0x5c5850], alpha: [0.35, 0], drag: 2.5, lift: [0.1, 0.3], spin: [0.2, 0.8] },
  ],
};

/** Small flare at the barrel each shot. */
export const MUZZLE: Recipe = {
  id: 'muzzle',
  emitters: [
    { layer: 'add', shape: 'soft', count: 1, life: 0.05, speed: 0, size: [0.16, 0.26], color: ['tint+white', 'tint'], intensity: 3, alpha: [1, 0] },
    { layer: 'add', shape: 'spark', count: [3, 5], life: [0.06, 0.12], speed: [4, 9], spread: 0.35, size: [0.018, 0.006], color: ['tint+white', 'tint'], intensity: 2, drag: 4, stretch: 0.02 },
  ],
};

/** Enemy dies: a blinding pop, a wide spark shell, glowing shards of its body that tumble and bounce, a shockwave
 * ring, embers drifting up and a slow plume of smoke (Rhino holo-wall shatter + Pyre Knight block burst). */
export const KILL_BURST: Recipe = {
  id: 'kill_burst', sound: 'boom', shake: 0.35,
  light: { color: 'tint', intensity: 18, range: 8, life: 0.35 },
  emitters: [
    { layer: 'add', shape: 'soft', count: 1, life: 0.18, speed: 0, size: [1, 2.2], color: ['tint+white', 'tint'], intensity: 2.6, alpha: [1, 0] },
    { layer: 'add', shape: 'ring', count: 1, life: 0.35, speed: 0, size: [0.4, 4.2], color: ['tint', 'tint'], intensity: 0.8, alpha: [0.55, 0] },
    { layer: 'add', shape: 'spark', count: [50, 70], life: [0.35, 0.9], speed: [6, 18], spread: Math.PI, radius: 0.3, size: [0.05, 0.015], color: ['tint+white', 'tint'], intensity: [1.8, 2.8], gravity: 9, drag: 1.8, stretch: 0.035, bounce: 0.3 },
    { layer: 'shard', count: [14, 20], life: [1.1, 1.8], speed: [3, 8], spread: Math.PI * 0.6, radius: 0.35, size: [0.16, 0.06], color: ['tint+white', 'tint'], intensity: 1.6, alpha: [1, 0], gravity: 11, drag: 0.6, spin: [4, 12], bounce: 0.35 },
    { layer: 'add', shape: 'soft', count: [20, 30], delay: 0.08, life: [0.9, 2], speed: [0.5, 2.5], spread: Math.PI, radius: 0.6, size: [0.06, 0.02], color: [0xffd9a0, 'tint'], intensity: 2.5, drag: 1.2, turbulence: 4, lift: [0.6, 1.6] },
    { layer: 'alpha', shape: 'smoke', count: [6, 9], delay: 0.05, life: [1.4, 2.4], speed: [0.5, 1.8], spread: Math.PI, radius: 0.5, size: [0.5, 1.8], color: [0x3a3440, 0x1c1a22], alpha: [0.45, 0], drag: 1.6, lift: [0.4, 0.9], spin: [0.1, 0.5] },
  ],
};

/** Fire weapon / lava: rising embers with a flicker (Pyre Knight, forge). Spawn repeatedly for a trail. */
export const EMBERS: Recipe = {
  id: 'embers',
  emitters: [
    { layer: 'add', shape: 'soft', count: [3, 6], life: [0.6, 1.4], speed: [0.2, 0.8], spread: Math.PI, radius: 0.15, size: [0.04, 0.01], color: [0xffe0a0, 0xff4a10], intensity: [2, 4], drag: 0.8, turbulence: 5, lift: [0.8, 1.8] },
  ],
};

/** Ice shatter: pale shards, frost mist, a cold flash (frost dragon, Sorceress crystal wall). */
export const FROST_SHATTER: Recipe = {
  id: 'frost_shatter', sound: 'metal', shake: 0.2,
  light: { color: 0x8fe8ff, intensity: 10, range: 6, life: 0.25 },
  emitters: [
    { layer: 'add', shape: 'soft', count: 1, life: 0.15, speed: 0, size: [0.8, 1.8], color: [0xffffff, 0x7fdcff], intensity: 3, alpha: [1, 0] },
    { layer: 'shard', count: [22, 30], life: [1, 1.6], speed: [3, 9], spread: Math.PI * 0.7, radius: 0.3, size: [0.2, 0.08], color: [0xe8fbff, 0x6fd6ff], intensity: 1.4, alpha: [1, 0], gravity: 11, drag: 0.5, spin: [5, 14], bounce: 0.3 },
    { layer: 'add', shape: 'spark', count: [20, 30], life: [0.2, 0.5], speed: [5, 12], spread: Math.PI, size: [0.03, 0.01], color: [0xffffff, 0x8fe8ff], intensity: 3, drag: 2.5, stretch: 0.03 },
    { layer: 'alpha', shape: 'smoke', count: [5, 8], life: [1, 1.8], speed: [0.4, 1.5], spread: Math.PI, radius: 0.4, size: [0.4, 1.4], color: [0xdff6ff, 0xa8d8ee], alpha: [0.4, 0], drag: 1.8, lift: [-0.2, 0.2], spin: [0.1, 0.4] },
  ],
};

/** Purple shadow finisher: dark-violet shards and a starburst of thin streaks (Assassin shadow combat). */
export const SHADOW_BURST: Recipe = {
  id: 'shadow_burst', sound: 'whoosh',
  light: { color: 0x9b5cff, intensity: 8, range: 5, life: 0.2 },
  emitters: [
    { layer: 'add', shape: 'spark', count: [30, 40], life: [0.15, 0.35], speed: [8, 16], spread: Math.PI, size: [0.04, 0.008], color: [0xf0e0ff, 0x8a4dff], intensity: 3, drag: 3, stretch: 0.045 },
    { layer: 'shard', count: [10, 14], life: [0.6, 1], speed: [4, 9], spread: Math.PI, size: [0.14, 0.04], color: [0xc9a8ff, 0x4b1d9e], intensity: 1.2, alpha: [1, 0], drag: 2, spin: [6, 14] },
    { layer: 'add', shape: 'ring', count: 1, life: 0.25, speed: 0, size: [0.3, 2.4], color: [0xc9a8ff, 0x8a4dff], intensity: 1, alpha: [1, 0] },
  ],
};

export const RECIPES: Record<string, Recipe> = Object.fromEntries(
  [HIT_SPARKS, HIT_PERFECT, WALL_IMPACT, MUZZLE, KILL_BURST, EMBERS, FROST_SHATTER, SHADOW_BURST].map((r) => [r.id, r]),
);
