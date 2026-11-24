// What the forest gives (and what it only pretends to give): every forage kind as plain data, editable by Game Studio.
// Each good kind has a lookalike. Colour alone won't tell them apart, so learning the forest pays off:
//  · the glow's rhythm: good ones breathe slowly or pulse ON the beat; bad ones flicker fast or pulse OFF the beat
//  · a "look closer" tell that only shows within a few metres: a pale ring under a cap, a dark seam on a berry,
//    fine spines, a drip of sweet smoke
// The first time you eat a kind, a hint names it and its tell. A Studio or saved override (localStorage
// 'rrForageTable', a JSON object of kind → partial entry) merges over these defaults.

export type ForageShape = 'cap' | 'berries' | 'fruit' | 'meat' | 'water' | 'gift';
export type GlowRhythm = 'breath' | 'steady' | 'beat' | 'offbeat' | 'flicker' | 'twinkle';
export type ForageTell = 'none' | 'ring' | 'seam' | 'spines' | 'smoke';
export type ForageEffect =
  | { kind: 'heal'; amount: number }                         // instant
  | { kind: 'regen'; amount: number; seconds: number }       // heal over time
  | { kind: 'haste'; mul: number; seconds: number }          // move speed
  | { kind: 'fury'; mul: number; seconds: number }           // damage dealt
  | { kind: 'resonance'; amount: number }                    // instant rhythm resonance
  | { kind: 'shield'; amount: number; seconds: number }      // absorbs damage
  | { kind: 'poison'; seconds: number; dmg?: number }        // damage over time (+ an instant bite)
  | { kind: 'slow'; amount: number; seconds: number }
  | { kind: 'blur'; seconds: number }                        // blurred, swimming vision
  | { kind: 'lure'; seconds: number }                         // a scent that draws predators
  | { kind: 'charge'; amount: number }                       // spirit charge for the guns (weapons' addCharge)
  | { kind: 'blessing'; seconds: number; heal?: number };    // a creature's gift: hits soften by a quarter

export interface ForageKind {
  name: string;
  good: boolean;
  shape: ForageShape;
  color: number;            // body colour
  glow: number;             // emissive colour
  rhythm: GlowRhythm;
  tell: ForageTell;
  effect: ForageEffect;
  /** Shown the first time you eat one. */
  hint: string;
  respawn: number;          // seconds
  /** Seconds the eat action takes (hold). Default 1.2. */
  eat?: number;
  /** A chance of something bad as well (raw meat). */
  risk?: { chance: number; effect: ForageEffect; hint: string };
}

export const FORAGE_KINDS: Record<string, ForageKind> = {
  // ── fungi ──
  lumencap: { name: 'Lumencap', good: true, shape: 'cap', color: 0x0e3a4a, glow: 0x3ae6ff, rhythm: 'breath', tell: 'none', effect: { kind: 'regen', amount: 40, seconds: 10 }, hint: 'Lumencap: heals you over 10 s. Its glow breathes slowly.', respawn: 90 },
  mimicap: { name: 'Mimic Cap', good: false, shape: 'cap', color: 0x0e3a4a, glow: 0x3ae6ff, rhythm: 'flicker', tell: 'ring', effect: { kind: 'poison', seconds: 6 }, hint: 'Mimic Cap: poisons you. It flickers fast, and close up there is a pale ring under the cap.', respawn: 90 },
  pulsecap: { name: 'Pulsecap', good: true, shape: 'cap', color: 0x2a0e4a, glow: 0xb36aff, rhythm: 'beat', tell: 'none', effect: { kind: 'resonance', amount: 1 }, hint: 'Pulsecap: +1.0 resonance. It pulses ON the beat.', respawn: 75 },
  dreamcap: { name: 'Dreamcap', good: false, shape: 'cap', color: 0x2a0e4a, glow: 0xb36aff, rhythm: 'offbeat', tell: 'spines', effect: { kind: 'blur', seconds: 8 }, hint: 'Dreamcap: blurs your vision. It pulses OFF the beat, with fine spines on the stem.', respawn: 75 },
  // ── berries ──
  emberberry: { name: 'Emberberry', good: true, shape: 'berries', color: 0x6a2a08, glow: 0xffa030, rhythm: 'steady', tell: 'none', effect: { kind: 'heal', amount: 25 }, hint: 'Emberberry: heals 25 at once. A steady warm glow.', respawn: 60 },
  ashberry: { name: 'Ashberry', good: false, shape: 'berries', color: 0x6a2a08, glow: 0xffa030, rhythm: 'twinkle', tell: 'seam', effect: { kind: 'slow', amount: 0.45, seconds: 6 }, hint: 'Ashberry: weighs you down. Its berries twinkle, each with a dark seam.', respawn: 60 },
  furyberry: { name: 'Furyberry', good: true, shape: 'berries', color: 0x5a0814, glow: 0xff3048, rhythm: 'steady', tell: 'none', effect: { kind: 'fury', mul: 1.35, seconds: 15 }, hint: 'Furyberry: +35% damage for 15 s. Steady crimson glow.', respawn: 80 },
  bloodberry: { name: 'Bloodberry', good: false, shape: 'berries', color: 0x5a0814, glow: 0xff3048, rhythm: 'twinkle', tell: 'spines', effect: { kind: 'poison', seconds: 6, dmg: 10 }, hint: 'Bloodberry: bites and poisons. Twinkles, with a halo of fine spines.', respawn: 80 },
  // ── fruit ──
  swiftpod: { name: 'Swiftpod', good: true, shape: 'fruit', color: 0x2a5a14, glow: 0x9cff4a, rhythm: 'breath', tell: 'none', effect: { kind: 'haste', mul: 1.3, seconds: 15 }, hint: 'Swiftpod: +30% speed for 15 s. Breathes slowly.', respawn: 90 },
  muskpod: { name: 'Musk Pod', good: false, shape: 'fruit', color: 0x2a5a14, glow: 0x9cff4a, rhythm: 'breath', tell: 'smoke', effect: { kind: 'lure', seconds: 25 }, hint: 'Musk Pod: its scent draws predators to you for 25 s. Look for the sweet smoke dripping from it.', respawn: 90 },
  // ── meat from a carcass (danger/prey.ts): more than berries; stag can make you sick ──
  venison: { name: 'Venison', good: true, shape: 'meat', color: 0x5a1a14, glow: 0xff7050, rhythm: 'steady', tell: 'none', effect: { kind: 'regen', amount: 55, seconds: 6 }, hint: 'Venison: a big heal over 6 s. Carcasses go fast; predators smell them too.', respawn: 0, eat: 1.8 },
  stagmeat: { name: 'Stag Meat', good: true, shape: 'meat', color: 0x5a1a14, glow: 0xffb070, rhythm: 'steady', tell: 'none', effect: { kind: 'heal', amount: 60 }, hint: 'Stag Meat: heals 60, but raw stag can turn your stomach.', respawn: 0, eat: 1.8, risk: { chance: 0.2, effect: { kind: 'poison', seconds: 6 }, hint: 'The raw stag meat turns your stomach.' } },
  // ── water ──
  water: { name: 'Clear Water', good: true, shape: 'water', color: 0x1a4a6a, glow: 0x8fd8ff, rhythm: 'steady', tell: 'none', effect: { kind: 'regen', amount: 12, seconds: 4 }, hint: 'Clear water: a little heal. Streams, falls and clean pools.', respawn: 0, eat: 1.2 },
  swampwater: { name: 'Swamp Water', good: false, shape: 'water', color: 0x2a3a14, glow: 0x6a8a2a, rhythm: 'steady', tell: 'none', effect: { kind: 'poison', seconds: 5 }, hint: 'Swamp water: makes you sick. Drink from running water instead.', respawn: 0, eat: 1.2 },
  toxicwater: { name: 'Toxic Water', good: false, shape: 'water', color: 0x2a4a0c, glow: 0x8cff2a, rhythm: 'steady', tell: 'none', effect: { kind: 'poison', seconds: 10, dmg: 8 }, hint: 'Toxic water: poison. The glowing green pools are never safe.', respawn: 0, eat: 1.2 },
  // ── spirit: charge mushrooms (the fungi that hold spirit energy) and what bonded creatures give ──
  chargecap: { name: 'Chargecap', good: true, shape: 'cap', color: 0x2a2408, glow: 0xffe46a, rhythm: 'beat', tell: 'none', effect: { kind: 'charge', amount: 35 }, hint: 'Chargecap: spirit charge for your gun. Gold gills that pulse on the beat; spirit motes rise off it.', respawn: 140 },
  spiritgift: { name: 'Spirit Gift', good: true, shape: 'gift', color: 0x3a3424, glow: 0xfff0b0, rhythm: 'breath', tell: 'none', effect: { kind: 'blessing', seconds: 30, heal: 20 }, hint: 'Spirit Gift: from a creature that trusts you. Heals a little and softens hits for 30 s.', respawn: 0, eat: 0.8 },
  shellfruit: { name: 'Shellfruit', good: true, shape: 'fruit', color: 0x3a4a5a, glow: 0x8fd8ff, rhythm: 'steady', tell: 'none', effect: { kind: 'shield', amount: 40, seconds: 20 }, hint: 'Shellfruit: a 40-point shield for 20 s.', respawn: 120 },
};

export function forageTable(): Record<string, ForageKind> {
  const out: Record<string, ForageKind> = { ...FORAGE_KINDS };
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('rrForageTable') : null;
    if (raw) for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, Partial<ForageKind>>)) out[k] = { ...(out[k] ?? FORAGE_KINDS.lumencap), ...v } as ForageKind;
  } catch { /* a bad override is ignored */ }
  return out;
}
