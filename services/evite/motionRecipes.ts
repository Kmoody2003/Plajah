// motionRecipes — how each evite plate comes alive, as DATA (no per-plate animation work).
//
// A plate is a generated still + its depth map. The stage (components/evite/EviteStage.tsx) turns that into a 2.5D
// living card: depth parallax on tilt, a pop-up-book reveal on every open, effects keyed to the plate's own light
// (foil, light sweep, flicker, caustics, fog, twinkle) and depth-aware particles. A recipe picks and tunes those.
// Timing follows the Motion Council plans in docs/evites/motion/*.json (e.g. kids: one spring(320,28) for every
// interaction, readable by 1.87 s; formal: restraint; reduced motion = an opacity-only twin with the same timing).
//
// Pure: no React, no DOM. Tested in tests/eviteMotion.test.ts.

export type EmitterKind = 'confetti' | 'snow' | 'petals' | 'bubbles' | 'embers' | 'sparkles' | 'dust' | 'stars' | 'leaves' | 'fireflies' | 'hearts';

export interface Emitter {
  kind: EmitterKind;
  /** particles alive at once (the stage caps at 24 per the Motion Council performance floor) */
  count: number;
  /** where they live in depth: 'front' passes over everything; 'mid'/'back' hide behind nearer objects */
  layer: 'front' | 'mid' | 'back';
  colors: string[];
  /** px per second, + is downward */
  fall: number;
}

export interface MotionRecipe {
  /** max parallax displacement at full tilt, in CSS px at 390px card width (scaled with size) */
  parallax: number;
  /** pop-up-book reveal: far plane starts at 1-popIn scale, near plane at 1+popIn, both settle to 1 */
  popIn: number;
  /** idle "breath": zoom amplitude and period (s) */
  breathe: number;
  breathePeriod: number;
  /** diagonal light sweep across bright areas; strength 0..1, period s */
  sweep: { strength: number; period: number; angle: number };
  /** one foil colour per theme (Kenne's call), applied where the plate is bright; strength 0..1 */
  foil: { color: string; strength: number };
  /** warm-highlight flicker (candles, fire, lanterns) 0..1 */
  flicker: number;
  /** water caustics in blue/cyan regions 0..1 */
  caustics: number;
  /** drifting fog in the far depth 0..1 */
  fog: number;
  /** sparkle on small bright points 0..1 */
  twinkle: number;
  emitter?: Emitter;
  /** particle kind for a tap and for the RSVP "yes" celebration */
  burst: EmitterKind;
  burstColors: string[];
  /** stiffness, damping for tilt + taps (kids 320/28 per the Motion Council) */
  spring: [number, number];
  /** reveal length, never above 2200 ms; text resolves inside it */
  revealMs: number;
  /** grade: warmth -1..1, contrast 0.8..1.3 */
  warmth: number;
  contrast: number;
}

const base: MotionRecipe = {
  parallax: 14, popIn: 0.06, breathe: 0.008, breathePeriod: 9, sweep: { strength: 0.25, period: 7, angle: 35 },
  foil: { color: '#E8C46C', strength: 0.35 }, flicker: 0, caustics: 0, fog: 0, twinkle: 0.15,
  burst: 'confetti', burstColors: ['#FF8C00', '#D40055', '#6B0099', '#FFD23F', '#FFFFFF'], spring: [260, 26], revealMs: 1900, warmth: 0, contrast: 1,
};

type Partial2 = Partial<Omit<MotionRecipe, 'sweep' | 'foil'>> & { sweep?: Partial<MotionRecipe['sweep']>; foil?: Partial<MotionRecipe['foil']> };
const merge = (a: MotionRecipe, b: Partial2): MotionRecipe => ({ ...a, ...b, sweep: { ...a.sweep, ...(b.sweep || {}) }, foil: { ...a.foil, ...(b.foil || {}) } });
/** A partial recipe, merged the same way collection and subject motion are (used by the Design eras evites). */
export type MotionPatch = Partial2;
export const mergeMotion = merge;

const em = (kind: EmitterKind, count: number, layer: Emitter['layer'], colors: string[], fall: number): Emitter => ({ kind, count, layer, colors, fall });

/** Collection defaults, from the Motion Council plans. */
export const COLLECTION_MOTION: Record<string, Partial2> = {
  kids_everyone: { parallax: 18, popIn: 0.08, spring: [320, 28], revealMs: 1870, emitter: em('confetti', 14, 'mid', ['#FF5A76', '#FFD23F', '#4CC3FF', '#52D681'], 36), burst: 'confetti' },
  kids_boy: { parallax: 20, popIn: 0.08, spring: [320, 28], revealMs: 1870, emitter: em('dust', 16, 'mid', ['#FFE7B0'], -6), burst: 'sparkles' },
  kids_girl: { parallax: 16, popIn: 0.07, spring: [320, 28], revealMs: 1870, twinkle: 0.4, emitter: em('sparkles', 16, 'front', ['#FFFFFF', '#FFD6F0', '#FFE9A8'], 10), burst: 'hearts', burstColors: ['#FF5FA2', '#FFD23F', '#B794F6', '#FFFFFF'] },
  kids_kaiju: { parallax: 20, popIn: 0.09, spring: [320, 28], revealMs: 1900, sweep: { strength: 0.45, period: 5 }, emitter: em('confetti', 16, 'mid', ['#D40055', '#FF8C00', '#B794F6', '#FFFFFF'], 40), burst: 'confetti' },
  gaming: { parallax: 18, popIn: 0.07, spring: [320, 28], revealMs: 1800, twinkle: 0.35, fog: 0.25, emitter: em('sparkles', 14, 'mid', ['#35E0E8', '#FF3D9A', '#FFD23F'], -8), burst: 'sparkles', burstColors: ['#35E0E8', '#FF3D9A', '#FFD23F', '#FFFFFF'] },
  sports_kids: { parallax: 16, popIn: 0.06, spring: [320, 28], revealMs: 1800, emitter: em('confetti', 12, 'front', ['#FFD23F', '#FFFFFF', '#FF8C00'], 40), burst: 'confetti' },
  sports_adult: { parallax: 14, popIn: 0.05, revealMs: 1800, sweep: { strength: 0.5, period: 6 }, contrast: 1.08, emitter: em('dust', 18, 'mid', ['#FFF1CF'], -4), burst: 'sparkles', burstColors: ['#FFFFFF', '#FFD58A'] },
  patriotic: { parallax: 12, popIn: 0.05, revealMs: 2000, twinkle: 0.3, emitter: em('sparkles', 12, 'back', ['#FFFFFF', '#FF4B4B', '#4C7BFF'], -10), burst: 'stars', burstColors: ['#FFFFFF', '#E0263A', '#2A4BBF'] },
  military: { parallax: 9, popIn: 0.03, revealMs: 2200, breathe: 0.004, sweep: { strength: 0.18, period: 11 }, flicker: 0.25, emitter: em('dust', 10, 'mid', ['#FFE2B0'], -3), burst: 'sparkles', burstColors: ['#FFE2B0', '#FFFFFF'] },
  adult: { parallax: 12, popIn: 0.05, revealMs: 1800, sweep: { strength: 0.45, period: 6 }, twinkle: 0.3, emitter: em('dust', 14, 'mid', ['#FFE7B0'], -4), burst: 'sparkles', burstColors: ['#FFD58A', '#FFFFFF', '#FF5D8F'] },
  life: { parallax: 12, popIn: 0.05, revealMs: 2000, twinkle: 0.2, emitter: em('sparkles', 10, 'mid', ['#FFFFFF', '#FFE7F2'], 6), burst: 'confetti' },
  holidays: { parallax: 12, popIn: 0.05, revealMs: 2000, flicker: 0.3, burst: 'sparkles' },
  faith: { parallax: 8, popIn: 0.03, revealMs: 2200, breathe: 0.004, sweep: { strength: 0.3, period: 12 }, flicker: 0.3, emitter: em('dust', 10, 'mid', ['#FFE7B0'], -3), burst: 'sparkles', burstColors: ['#FFE7B0', '#FFFFFF'] },
  anniversary: { parallax: 9, popIn: 0.03, revealMs: 2200, breathe: 0.005, flicker: 0.45, sweep: { strength: 0.3, period: 10 }, emitter: em('dust', 10, 'mid', ['#FFD9A8'], -3), burst: 'hearts', burstColors: ['#E0386A', '#F3D98B', '#FFFFFF'] },
  general: { parallax: 12, popIn: 0.05, revealMs: 1900, flicker: 0.25, twinkle: 0.3, emitter: em('fireflies', 12, 'mid', ['#FFE08A'], -6), burst: 'confetti' },
  wedding: { parallax: 8, popIn: 0.03, revealMs: 2200, breathe: 0.004, breathePeriod: 12, sweep: { strength: 0.4, period: 9 }, foil: { strength: 0.5 }, emitter: em('petals', 8, 'front', ['#FFF4F2', '#F4C9C9'], 14), burst: 'petals', burstColors: ['#FFFFFF', '#F4C9C9', '#E8C46C'] },
  // Design eras (services/evite/eraEvites.ts): procedural plates. Design-history council: the drama is the first ~2 s
  // (planes converge, plate exposes, text resolves); after that nothing loops — no breath, no sweep, no twinkle, no
  // ambient particles — and only the guest's tilt moves the planes. Foil colour/strength come per era.
  era: { parallax: 13, popIn: 0.06, revealMs: 2000, breathe: 0, sweep: { strength: 0, period: 9 }, twinkle: 0, flicker: 0, caustics: 0, fog: 0, emitter: undefined, spring: [240, 26], burst: 'sparkles' },
};

/** Subject overrides where the plate itself tells us what moves. Keys are `collection/subject` or bare subject. */
export const SUBJECT_MOTION: Record<string, Partial2> = {
  // water
  'kids_boy/shark': { caustics: 0.6, emitter: em('bubbles', 16, 'mid', ['#FFFFFF'], -22) },
  'kids_girl/mermaid': { caustics: 0.6, emitter: em('bubbles', 16, 'mid', ['#FFFFFF'], -22) },
  'kids_girl/mermaid-alt': { caustics: 0.5 },
  'kids_kaiju/kelp-rave': { caustics: 0.5, emitter: em('bubbles', 16, 'mid', ['#FFFFFF', '#B794F6'], -24) },
  'kids_kaiju/wave-crash': { caustics: 0.4, emitter: em('bubbles', 10, 'front', ['#FFFFFF'], -18) },
  'kids_everyone/pool-splash': { caustics: 0.6, emitter: em('bubbles', 12, 'mid', ['#FFFFFF'], -20) },
  'kids_everyone/bubbles': { emitter: em('bubbles', 18, 'front', ['#FFFFFF', '#CFF6FF'], -16) },
  'sports_kids/swimming': { caustics: 0.6 }, 'sports_adult/swimming': { caustics: 0.6 }, 'wedding/coastal': { caustics: 0.35 }, 'wedding/lakeside': { caustics: 0.3 },
  // space + night
  'kids_boy/rocket': { twinkle: 0.6, emitter: em('stars', 18, 'back', ['#FFFFFF', '#FFE9A8'], 4) },
  'kids_boy/rocket-alt': { twinkle: 0.6, emitter: em('stars', 18, 'back', ['#FFFFFF'], 4) },
  'kids_kaiju/space-countdown': { twinkle: 0.6, emitter: em('stars', 18, 'back', ['#FFFFFF'], 4) },
  'kids_everyone/camping': { twinkle: 0.5, flicker: 0.5, emitter: em('fireflies', 12, 'mid', ['#FFE08A'], -6) },
  'wedding/celestial': { twinkle: 0.6, emitter: em('stars', 14, 'back', ['#F3E2A8'], 3) },
  'wedding/moonphase': { twinkle: 0.5 }, 'wedding/sapphire': { twinkle: 0.6, foil: { color: '#E8ECF8' } },
  'anniversary/pairstars': { twinkle: 0.6, emitter: em('stars', 12, 'back', ['#F3D98B'], 3) },
  // fire + candles
  'kids_boy/dino': { fog: 0.25, emitter: em('embers', 14, 'back', ['#FF8C00', '#FFD23F'], -14) },
  'adult/bonfire': { flicker: 0.7, emitter: em('embers', 18, 'mid', ['#FF8C00', '#FFD23F'], -26) },
  'adult/bbq': { flicker: 0.5, fog: 0.3, emitter: em('embers', 12, 'mid', ['#FF8C00'], -20) },
  'adult/dinner': { flicker: 0.6 }, 'adult/speakeasy': { flicker: 0.4 },
  'holidays/hanukkah': { flicker: 0.8 }, 'holidays/diwali': { flicker: 0.8, emitter: em('embers', 12, 'mid', ['#FFB21F', '#FF8C00'], -10) },
  'holidays/kwanzaa': { flicker: 0.7 }, 'holidays/eid': { flicker: 0.6, twinkle: 0.4 }, 'holidays/lunar-new-year': { flicker: 0.5, emitter: em('petals', 10, 'front', ['#FFC2D1', '#FFFFFF'], 12) },
  'holidays/christmas': { flicker: 0.4, twinkle: 0.5, emitter: em('snow', 22, 'front', ['#FFFFFF'], 24) },
  'holidays/halloween': { flicker: 0.6, fog: 0.5, emitter: em('leaves', 10, 'mid', ['#E36A1E', '#8A3A12'], 22) },
  'holidays/friendsgiving': { flicker: 0.5, emitter: em('leaves', 10, 'front', ['#E36A1E', '#C9962B', '#8A3A12'], 20) },
  'holidays/new-years-eve': { twinkle: 0.6, emitter: em('confetti', 20, 'front', ['#E8C46C', '#FFFFFF', '#C0C8DC'], 34) },
  'holidays/dia-de-los-muertos': { flicker: 0.7, emitter: em('petals', 10, 'front', ['#FF9F1C', '#FFC93C'], 14) },
  'holidays/easter': { emitter: em('petals', 10, 'front', ['#FFFFFF', '#FFE3F0', '#E6F7C9'], 12) },
  'holidays/st-patricks': { twinkle: 0.5, emitter: em('sparkles', 12, 'front', ['#FFD23F', '#52D681'], 10) },
  'military/veterans-day': { flicker: 0.6, emitter: undefined }, 'military/deployment-sendoff': { emitter: em('dust', 8, 'mid', ['#FFE2B0'], -2) },
  'patriotic/memorial-day': { flicker: 0.5, twinkle: 0, emitter: em('petals', 6, 'front', ['#C8102E'], 8), burst: 'petals', burstColors: ['#C8102E', '#FFFFFF'] },
  'patriotic/independence-day': { twinkle: 0.6, emitter: em('sparkles', 16, 'back', ['#FFFFFF', '#FF4B4B', '#4C7BFF'], -6) },
  'life/celebration-of-life': { flicker: 0.5, emitter: em('dust', 8, 'mid', ['#FFFFFF'], -2), burst: 'petals', burstColors: ['#FFFFFF', '#F5F0E6'] },
  'faith/vow-renewal': { flicker: 0.5 }, 'faith/first-communion': { flicker: 0.4 }, 'faith/confirmation': { flicker: 0.5 },
  'wedding/candelabra': { flicker: 0.7 }, 'wedding/cathedral': { sweep: { strength: 0.5, period: 10 }, emitter: em('dust', 14, 'mid', ['#FFE7B0'], -3) },
  'wedding/winter-chapel': { emitter: em('snow', 22, 'front', ['#FFFFFF'], 18) }, 'general/snow': { flicker: 0.5, emitter: em('snow', 22, 'front', ['#FFFFFF'], 20) },
  'general/fireworks': { twinkle: 0.6, emitter: em('sparkles', 16, 'back', ['#FF4F7A', '#35E0E8', '#FFD23F'], -6) },
  'general/sparkler': { flicker: 0.6, emitter: em('sparkles', 18, 'front', ['#FFD58A', '#FFFFFF'], 10) },
  'general/stringlights': { flicker: 0.4, twinkle: 0.5 },
  // nature
  'kids_girl/butterfly': { emitter: em('petals', 12, 'front', ['#FFD6F0', '#FFF2A8'], 10) },
  'kids_girl/fairy': { twinkle: 0.5, emitter: em('fireflies', 16, 'mid', ['#FFE08A', '#D6FFB0'], -6) },
  'kids_boy/safari': { emitter: em('dust', 18, 'mid', ['#FFE2A8'], -4) },
  'wedding/blossom': { emitter: em('petals', 12, 'front', ['#FFD1DC', '#FFFFFF'], 14) },
  'wedding/lavender': { emitter: em('petals', 10, 'front', ['#C9B6F2', '#FFFFFF'], 12) },
  'wedding/pampas': { emitter: em('dust', 12, 'mid', ['#FFF1DE'], -2) },
  'anniversary/roses': { emitter: em('petals', 10, 'front', ['#B5122E', '#E35A6E'], 12), flicker: 0.3 },
  // party
  'adult/disco': { sweep: { strength: 0.6, period: 3 }, twinkle: 0.7, emitter: em('sparkles', 20, 'front', ['#FFFFFF', '#FF8C00', '#D40055'], 6) },
  'kids_kaiju/disco': { sweep: { strength: 0.6, period: 3 }, twinkle: 0.7 },
  'kids_kaiju/haunted-creep': { fog: 0.5, flicker: 0.4 },
  'kids_kaiju/snow-howl': { emitter: em('snow', 22, 'front', ['#FFFFFF'], 22) },
  'adult/neon80s': { sweep: { strength: 0.5, period: 4 }, fog: 0.3 },
  'gaming/laser-tag': { fog: 0.5, sweep: { strength: 0.6, period: 2.5 } },
  'gaming/esports': { fog: 0.4, sweep: { strength: 0.5, period: 3 } },
};

/** One foil colour per theme (Kenne): deterministic from the plate id, drawn from a curated set per collection. */
const FOIL_SETS: Record<string, string[]> = {
  wedding: ['#E8C46C', '#D9B160', '#F3D98B', '#E8B4A8', '#C0C8DC', '#E9D7A6'],
  anniversary: ['#E8C46C', '#C0C8DC', '#E8B4A8', '#F3D98B'],
  faith: ['#E8C46C', '#F3E2A8', '#E9D7A6'],
  military: ['#E8C46C', '#D9B160', '#C0C8DC'],
  default: ['#E8C46C', '#FF8C00', '#D40055', '#35E0E8', '#B794F6', '#52D681', '#FFD23F', '#C0C8DC', '#FF5FA2', '#E8B4A8'],
};
export function foilFor(collection: string, subject: string): string {
  const set = FOIL_SETS[collection] || FOIL_SETS.default;
  let h = 2166136261; for (const c of `${collection}/${subject}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return set[(h >>> 0) % set.length];
}

/** The recipe for one plate: base → collection → subject (with or without `-alt`), plus its own foil colour. */
export function recipeFor(collection: string, subject: string): MotionRecipe {
  const stem = subject.replace(/-alt$/, '');
  let r = merge(base, COLLECTION_MOTION[collection] || {});
  for (const key of [stem, `${collection}/${stem}`, `${collection}/${subject}`]) if (SUBJECT_MOTION[key]) r = merge(r, SUBJECT_MOTION[key]);
  const foilOverride = (SUBJECT_MOTION[`${collection}/${subject}`] || SUBJECT_MOTION[`${collection}/${stem}`] || {}).foil?.color;
  r.foil = { ...r.foil, color: foilOverride || foilFor(collection, stem) };
  r.revealMs = Math.min(2200, r.revealMs);
  if (r.emitter) r.emitter = { ...r.emitter, count: Math.min(24, r.emitter.count) };
  return r;
}

/** Reduced motion keeps the same timing in the opacity domain: no parallax, no particles, static light. */
export function reducedRecipe(r: MotionRecipe): MotionRecipe {
  return { ...r, parallax: 0, popIn: 0, breathe: 0, sweep: { ...r.sweep, strength: 0 }, flicker: 0, caustics: 0, fog: r.fog * 0.5, twinkle: 0, emitter: undefined };
}

/** Critically-damped-ish spring step, shared by tilt and taps. Returns [position, velocity]. */
export function springStep(x: number, v: number, target: number, dt: number, [k, c]: [number, number]): [number, number] {
  const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) { const a = k * (target - x) - c * v; v += a * h; x += v * h; }
  return [x, v];
}

/** Reveal progress curves (0..1 over revealMs): plate exposure, pop-in settle, text stagger. */
export function revealCurves(tMs: number, revealMs: number) {
  const p = Math.max(0, Math.min(1, tMs / revealMs));
  const ease = (x: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);
  return {
    exposure: ease(p / 0.35),            // plate lights up in the first third
    settle: ease((p - 0.05) / 0.55),     // pop-up planes converge
    headline: ease((p - 0.40) / 0.20),   // headline lands ~0.8 s on a 1.9 s reveal
    details: ease((p - 0.62) / 0.20),
    cta: ease((p - 0.82) / 0.18),
    done: p >= 1,
  };
}
