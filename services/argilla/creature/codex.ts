/**
 * codex.ts — what Argilla knows about the things people build.
 *
 * Every entry is a body plan: the numbers that shape its skeleton and muscle, how its surface is covered,
 * and how it moves. Hybrids are not special cases. "Wolf man" blends the human and wolf plans, and a werewolf
 * is that blend with its own overrides and its screen history. Lineages are named ways a creature has been
 * played on film, kept as direction (posture, weight, gait), never as anyone's design or footage.
 */

export type GaitKind = 'stride' | 'stalk' | 'shamble' | 'lope' | 'prowl' | 'glide' | 'lumber';
export type Covering = 'fur' | 'skin' | 'hide' | 'scales' | 'bark' | 'pale';

export interface BodyTune {
  /** 0 stands on two legs, 1 on four. */
  quadruped: number;
  /** 0 stands on the sole, 1 on the toes with a raised heel. */
  digitigrade: number;
  /** Forward curl of the spine and neck. */
  hunch: number;
  /** Overall muscle and bone bulk. */
  mass: number;
  /** How far individual muscles stand out. */
  definition: number;
  /** Size multipliers against a human. */
  head: number;
  shoulders: number;
  hips: number;
  armLength: number;
  legLength: number;
  handSize: number;
  /** 0 flat face, 1 full snout. */
  muzzle: number;
  /** 0 round side ears, 1 tall pointed ears. */
  ears: number;
  /** 0 none, 1 long. */
  tail: number;
  /** Claw length as a fraction of the finger. */
  claws: number;
}

export interface MotionStyle {
  gait: GaitKind;
  /** Stride length against leg length. */
  stride: number;
  /** Steps per second at a walk. */
  cadence: number;
  /** Vertical bounce of the hips. */
  bounce: number;
  /** Arm swing, 0 still to 1 full. */
  armSwing: number;
  /** Forward lean added while moving. */
  lean: number;
  /** Side-to-side weight shift. */
  sway: number;
  /** Twitchy (1) to smooth (0). */
  tension: number;
  /** Which way it runs when pushed. */
  runsOnAllFours: boolean;
  /** The move only this creature does. */
  signature: SignatureMove;
}

export type SignatureMove = 'howl' | 'lunge' | 'lurch' | 'hiss' | 'roar' | 'rear' | 'bow';

export interface SurfaceBrief {
  covering: Covering;
  /** Fur length in world units at the longest, 0 for none. */
  furLength: number;
  /** Where fur grows long, by region, 0-1. Regions are named in anatomy.ts. */
  furBy: Partial<Record<FurRegion, number>>;
  /** Fallback colours when no picture says otherwise. */
  colors: { base: string; under: string; accent: string };
  roughness: number;
}

export type FurRegion = 'crown' | 'face' | 'muzzle' | 'ruff' | 'back' | 'chest' | 'belly' | 'arm' | 'forearm' | 'hand' | 'thigh' | 'shin' | 'foot' | 'tail';

export interface Lineage {
  id: string;
  label: string;
  /** Where the idea comes from, for the person choosing. */
  source: string;
  note: string;
  tune?: Partial<BodyTune>;
  motion?: Partial<MotionStyle>;
}

export interface CodexEntry {
  id: string;
  name: string;
  /** Plain-language summary of what it understands this to be. */
  understood: string;
  words: RegExp;
  /** Sentences a vision model scores the picture against. */
  visionPhrases: string[];
  tune: BodyTune;
  motion: MotionStyle;
  surface: SurfaceBrief;
  lineages?: Lineage[];
}

const HUMAN_TUNE: BodyTune = {
  quadruped: 0, digitigrade: 0, hunch: 0, mass: 0.5, definition: 0.3, head: 1, shoulders: 1, hips: 1,
  armLength: 1, legLength: 1, handSize: 1, muzzle: 0, ears: 0, tail: 0, claws: 0,
};
const HUMAN_MOTION: MotionStyle = {
  gait: 'stride', stride: 0.75, cadence: 1.8, bounce: 0.025, armSwing: 0.7, lean: 0.03, sway: 0.02, tension: 0.15,
  runsOnAllFours: false, signature: 'bow',
};
const WOLF_TUNE: BodyTune = {
  quadruped: 1, digitigrade: 1, hunch: 0.15, mass: 0.45, definition: 0.35, head: 1.15, shoulders: 0.8, hips: 0.75,
  armLength: 1, legLength: 1, handSize: 0.75, muzzle: 1, ears: 1, tail: 1, claws: 0.35,
};
const WOLF_MOTION: MotionStyle = {
  gait: 'lope', stride: 1, cadence: 2.2, bounce: 0.03, armSwing: 1, lean: 0, sway: 0.01, tension: 0.45,
  runsOnAllFours: true, signature: 'howl',
};

export const CODEX: CodexEntry[] = [
  {
    id: 'human', name: 'Human',
    understood: 'A person: upright, flat-footed, arms free, weight carried over the hips.',
    words: /\b(human|person|man|woman|boy|girl|hero|heroine|warrior|knight|king|queen|wizard|witch|elf|soldier|pastor|priest|teacher|nurse)\b/i,
    visionPhrases: ['a photo of a person', 'a character portrait of a human', 'a drawing of a man or a woman'],
    tune: HUMAN_TUNE, motion: HUMAN_MOTION,
    surface: { covering: 'skin', furLength: 0, furBy: {}, colors: { base: '#c79a7c', under: '#a87a60', accent: '#3a2a22' }, roughness: 0.55 },
  },
  {
    id: 'wolf', name: 'Wolf',
    understood: 'A wolf: four legs, toe-walking, deep narrow chest, long snout and a tail for balance.',
    words: /\b(wolf|wolves|dog|hound|husky|fox|coyote|jackal)\b/i,
    visionPhrases: ['a photo of a wolf', 'a drawing of a dog', 'a four legged canine animal'],
    tune: WOLF_TUNE, motion: WOLF_MOTION,
    surface: {
      covering: 'fur', furLength: 0.05,
      furBy: { crown: 0.45, face: 0.2, muzzle: 0.12, ruff: 1, back: 0.75, chest: 0.8, belly: 0.5, arm: 0.5, forearm: 0.3, hand: 0.12, thigh: 0.55, shin: 0.25, foot: 0.1, tail: 1 },
      colors: { base: '#5d5650', under: '#a89c8e', accent: '#231f1c' }, roughness: 0.8,
    },
  },
  {
    id: 'werewolf', name: 'Werewolf',
    understood: 'A wolf and man hybrid: a human frame pushed toward the wolf, with raised heels, a heavy neck and shoulders, snout and claws. It can stand or drop to all fours.',
    words: /\b(were-?wol(f|ves)|wolf-?m[ae]n|lycan(thrope)?s?)\b/i,
    visionPhrases: ['a werewolf', 'a wolf man monster', 'a snarling furry humanoid beast with a wolf head'],
    tune: {
      quadruped: 0, digitigrade: 0.85, hunch: 0.55, mass: 0.85, definition: 0.75, head: 1.45, shoulders: 1.35, hips: 0.9,
      armLength: 1.18, legLength: 1, handSize: 1.45, muzzle: 0.85, ears: 0.9, tail: 0.25, claws: 0.8,
    },
    motion: {
      gait: 'stalk', stride: 0.9, cadence: 1.5, bounce: 0.03, armSwing: 0.45, lean: 0.12, sway: 0.035, tension: 0.6,
      runsOnAllFours: true, signature: 'howl',
    },
    surface: {
      covering: 'fur', furLength: 0.085,
      furBy: { crown: 0.55, face: 0.28, muzzle: 0.1, ruff: 1, back: 0.85, chest: 0.65, belly: 0.3, arm: 0.65, forearm: 0.55, hand: 0.1, thigh: 0.6, shin: 0.4, foot: 0.12, tail: 1 },
      colors: { base: '#6b6157', under: '#a39484', accent: '#231e1a' }, roughness: 0.82,
    },
    lineages: [
      {
        id: 'stalker', label: 'Towering stalker', source: 'The Howling (1981)',
        note: 'Very tall, ears high, upright and predatory, moving with slow confidence.',
        tune: { hunch: 0.4, legLength: 1.12, ears: 1, muzzle: 0.95, mass: 0.8 },
        motion: { gait: 'stalk', cadence: 1.2, armSwing: 0.3, tension: 0.5, runsOnAllFours: false },
      },
      {
        id: 'cursed-man', label: 'Cursed man', source: 'The Wolf Man (1941)',
        note: 'Mostly a man: flat feet, a small snout, shirt-and-trousers proportions, a stiff stalking walk.',
        tune: { digitigrade: 0, hunch: 0.35, mass: 0.55, definition: 0.3, shoulders: 1.05, armLength: 1.02, handSize: 1.1, muzzle: 0.3, ears: 0.45, tail: 0, claws: 0.35 },
        motion: { gait: 'stalk', stride: 0.65, cadence: 1.35, lean: 0.1, armSwing: 0.25, tension: 0.4, runsOnAllFours: false },
      },
      {
        id: 'four-legs', label: 'All-fours beast', source: 'An American Werewolf in London (1981)',
        note: 'The change goes all the way: heavy front end, long arms, and it runs on four legs like an animal.',
        tune: { hunch: 0.9, armLength: 1.3, legLength: 0.9, muzzle: 1, ears: 0.75, mass: 0.9, shoulders: 1.45, hips: 0.8 },
        motion: { gait: 'lope', stride: 1, cadence: 2, armSwing: 1, lean: 0.25, tension: 0.7, runsOnAllFours: true },
      },
      {
        id: 'lean-giant', label: 'Lean giant', source: 'Dog Soldiers (2002)',
        note: 'Stretched and narrow, long raised-heel legs like a performer on stilts, hunting in a smooth glide.',
        tune: { digitigrade: 1, hunch: 0.5, mass: 0.6, legLength: 1.25, armLength: 1.28, shoulders: 1.15, hips: 0.75, definition: 0.9 },
        motion: { gait: 'stalk', stride: 1.05, cadence: 1.25, bounce: 0.02, sway: 0.02, tension: 0.35, runsOnAllFours: false },
      },
    ],
  },
  {
    id: 'vampire', name: 'Vampire',
    understood: 'A vampire: a gaunt noble human, upright and very still, who moves in a smooth glide without wasted motion.',
    words: /\b(vampires?|dracula|nosferatu|count)\b/i,
    visionPhrases: ['a vampire', 'dracula in a cape', 'a pale undead nobleman with fangs'],
    tune: { ...HUMAN_TUNE, mass: 0.35, definition: 0.2, shoulders: 1.05, hips: 0.92, armLength: 1.04, handSize: 1.08, claws: 0.12 },
    motion: { ...HUMAN_MOTION, gait: 'glide', stride: 0.6, cadence: 1.05, bounce: 0.004, armSwing: 0.08, lean: 0, sway: 0.004, tension: 0.05, signature: 'hiss' },
    surface: { covering: 'pale', furLength: 0, furBy: {}, colors: { base: '#d8d4d0', under: '#a9a4a6', accent: '#16121a' }, roughness: 0.42 },
    lineages: [
      {
        id: 'count', label: 'Courtly count', source: 'Dracula (1931)',
        note: 'Formal and upright, slow deliberate steps, stillness as the threat.',
        motion: { cadence: 0.95, armSwing: 0.04 },
      },
      {
        id: 'rat', label: 'Rat-like revenant', source: 'Nosferatu (1922)',
        note: 'Stiff, narrow and elongated, long fingers, shoulders drawn up, rising and turning as if on a rod.',
        tune: { mass: 0.2, hunch: 0.3, shoulders: 0.82, armLength: 1.16, handSize: 1.4, claws: 0.55, head: 1.05 },
        motion: { stride: 0.42, cadence: 0.85, armSwing: 0, tension: 0.2 },
      },
    ],
  },
  {
    id: 'zombie', name: 'Zombie',
    understood: 'A walking corpse: a human body with failing joints, dragging one side, head hanging, arms loose.',
    words: /\b(zombies?|ghouls?|undead|walkers?|corpse|mumm(y|ies))\b/i,
    visionPhrases: ['a zombie', 'a rotting undead corpse walking', 'a decaying ghoul'],
    tune: { ...HUMAN_TUNE, hunch: 0.5, mass: 0.32, definition: 0.15, hips: 0.95 },
    motion: { ...HUMAN_MOTION, gait: 'shamble', stride: 0.4, cadence: 0.95, bounce: 0.02, armSwing: 0.12, lean: 0.08, sway: 0.07, tension: 0.1, signature: 'lurch' },
    surface: { covering: 'skin', furLength: 0, furBy: {}, colors: { base: '#7e8a70', under: '#57604e', accent: '#2c1f1e' }, roughness: 0.7 },
    lineages: [
      {
        id: 'shambler', label: 'Slow shambler', source: 'Night of the Living Dead (1968)',
        note: 'Slow and stiff-legged, dangerous only in numbers.',
      },
      {
        id: 'runner', label: 'Infected runner', source: '28 Days Later (2002)',
        note: 'Fast, jerky and desperate, sprinting with the whole body thrown forward.',
        tune: { hunch: 0.35, mass: 0.38 },
        motion: { stride: 0.95, cadence: 2.5, armSwing: 0.7, lean: 0.22, sway: 0.03, tension: 1, signature: 'lunge' },
      },
    ],
  },
  {
    id: 'troll', name: 'Troll',
    understood: 'A troll: a huge, heavy human-like frame with long arms, short bowed legs and a low head.',
    words: /\b(trolls?|ogres?|giants?|orcs?|brutes?)\b/i,
    visionPhrases: ['a troll', 'a huge ogre monster', 'a hulking giant creature'],
    tune: { ...HUMAN_TUNE, hunch: 0.75, mass: 1, definition: 0.35, head: 0.9, shoulders: 1.5, hips: 1.25, armLength: 1.3, legLength: 0.72, handSize: 1.6, muzzle: 0.15, ears: 0.15, claws: 0.2 },
    motion: { ...HUMAN_MOTION, gait: 'lumber', stride: 0.62, cadence: 1, bounce: 0.035, armSwing: 0.55, lean: 0.05, sway: 0.08, tension: 0.15, signature: 'roar' },
    surface: { covering: 'hide', furLength: 0.018, furBy: { crown: 1, ruff: 0.5, back: 0.3 }, colors: { base: '#6a6a55', under: '#8a8468', accent: '#2f2b22' }, roughness: 0.85 },
  },
  {
    id: 'bear', name: 'Bear',
    understood: 'A bear: flat-footed on four legs, massive shoulder hump, a rolling walk, and it can rear up.',
    words: /\b(bears?|grizzly|panda)\b/i,
    visionPhrases: ['a photo of a bear', 'a grizzly bear', 'a large furry bear'],
    tune: { ...WOLF_TUNE, digitigrade: 0, mass: 1, definition: 0.15, head: 1.25, shoulders: 1.2, hips: 1.1, legLength: 0.72, armLength: 0.75, handSize: 1.1, muzzle: 0.65, ears: 0.15, tail: 0.05, claws: 0.45 },
    motion: { ...WOLF_MOTION, gait: 'lumber', stride: 0.7, cadence: 1.3, bounce: 0.02, sway: 0.04, tension: 0.15, signature: 'rear' },
    surface: { covering: 'fur', furLength: 0.06, furBy: { crown: 0.5, face: 0.25, muzzle: 0.1, ruff: 0.9, back: 1, chest: 0.8, belly: 0.75, arm: 0.8, forearm: 0.7, hand: 0.2, thigh: 0.85, shin: 0.6, foot: 0.2, tail: 0.3 }, colors: { base: '#4a3424', under: '#6a4e36', accent: '#1d140e' }, roughness: 0.85 },
  },
  {
    id: 'cat', name: 'Big cat',
    understood: 'A cat: a flexible spine, toe-walking, heavy forelimbs and a long balancing tail, placing each foot exactly.',
    words: /\b(cats?|lions?|tigers?|panthers?|leopards?|cheetahs?|jaguars?)\b/i,
    visionPhrases: ['a photo of a big cat', 'a lion or a tiger', 'a house cat'],
    tune: { ...WOLF_TUNE, mass: 0.55, definition: 0.5, head: 1, shoulders: 0.9, muzzle: 0.45, ears: 0.55, legLength: 0.85, handSize: 0.95, claws: 0.45 },
    motion: { ...WOLF_MOTION, gait: 'prowl', stride: 0.8, cadence: 1.6, bounce: 0.012, sway: 0.015, tension: 0.3, signature: 'roar' },
    surface: { covering: 'fur', furLength: 0.025, furBy: { crown: 0.5, face: 0.3, muzzle: 0.2, ruff: 0.8, back: 0.65, chest: 0.7, belly: 0.8, arm: 0.5, forearm: 0.4, hand: 0.25, thigh: 0.55, shin: 0.4, foot: 0.25, tail: 0.6 }, colors: { base: '#b78b4d', under: '#e4d4b4', accent: '#2a1d10' }, roughness: 0.72 },
  },
];

export const CODEX_BY_ID = Object.fromEntries(CODEX.map((e) => [e.id, e])) as Record<string, CodexEntry>;

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Blends two plans number by number. The stronger parent decides the things that can't be averaged. */
export function blendPlans(a: CodexEntry, b: CodexEntry, t = 0.5, name = `${a.name}-${b.name} hybrid`): CodexEntry {
  const strong = t < 0.5 ? a : b;
  const tune = { ...a.tune } as BodyTune;
  for (const key of Object.keys(tune) as (keyof BodyTune)[]) tune[key] = mix(a.tune[key], b.tune[key], t);
  // A blend that leaves the creature half-tipped over would stand on nothing: hybrids stand up.
  tune.quadruped = tune.quadruped < 0.75 ? 0 : 1;
  const motion: MotionStyle = {
    ...strong.motion,
    stride: mix(a.motion.stride, b.motion.stride, t), cadence: mix(a.motion.cadence, b.motion.cadence, t),
    bounce: mix(a.motion.bounce, b.motion.bounce, t), armSwing: mix(a.motion.armSwing, b.motion.armSwing, t),
    lean: mix(a.motion.lean, b.motion.lean, t), sway: mix(a.motion.sway, b.motion.sway, t),
    tension: mix(a.motion.tension, b.motion.tension, t),
    runsOnAllFours: a.motion.runsOnAllFours || b.motion.runsOnAllFours,
  };
  const furry = a.surface.furLength >= b.surface.furLength ? a : b;
  return {
    id: `${a.id}+${b.id}`, name,
    understood: `A hybrid of ${a.name.toLowerCase()} and ${b.name.toLowerCase()}: built on both body plans, moving partly like each.`,
    words: /$^/, visionPhrases: [name],
    tune, motion, surface: { ...furry.surface, furLength: furry.surface.furLength * (0.6 + 0.4 * (furry === b ? t : 1 - t)) },
  };
}

export interface Recognition {
  entry: CodexEntry;
  /** Where the answer came from, in words for the studio. */
  source: 'words' | 'vision' | 'default';
  /** 0-1. Below about 0.5 the studio should ask. */
  confidence: number;
  /** Other readings worth offering. */
  alternatives: { id: string; score: number }[];
}

const HYBRID_LINK = /\b(hybrid|cross|half|mix(ed)?|part)\b|-(man|woman|men|women)\b|\b(man|woman)-/i;

/** Reads a description. Exact creatures win; two creatures named together, or "bear man", make a hybrid. */
export function recognizeFromWords(text: string): Recognition | null {
  const clean = text.trim();
  if (!clean) return null;
  const hits = CODEX
    .map((entry) => ({ entry, at: clean.search(entry.words) }))
    .filter((hit) => hit.at >= 0)
    .sort((a, b) => a.at - b.at);
  if (!hits.length) return null;
  const named = hits.find((hit) => hit.entry.id !== 'human' && hit.entry.id !== 'wolf' && hit.entry.id !== 'bear' && hit.entry.id !== 'cat') ?? null;
  if (named && named.entry.id !== 'werewolf') return { entry: named.entry, source: 'words', confidence: 0.9, alternatives: [] };
  if (named) return { entry: named.entry, source: 'words', confidence: 0.95, alternatives: [] };
  if (hits.length >= 2) {
    const animal = hits.find((hit) => hit.entry.id !== 'human') ?? hits[1];
    const other = hits.find((hit) => hit.entry !== animal.entry)!;
    return { entry: blendPlans(other.entry, animal.entry, 0.55), source: 'words', confidence: 0.8, alternatives: [] };
  }
  if (hits[0].entry.id !== 'human' && HYBRID_LINK.test(clean)) {
    return { entry: blendPlans(CODEX_BY_ID.human, hits[0].entry, 0.55), source: 'words', confidence: 0.75, alternatives: [] };
  }
  return { entry: hits[0].entry, source: 'words', confidence: 0.85, alternatives: [] };
}

/** Applies a film lineage or other direction on top of a plan. */
export function applyLineage(entry: CodexEntry, lineageId?: string | null): CodexEntry {
  const lineage = entry.lineages?.find((l) => l.id === lineageId);
  if (!lineage) return entry;
  return { ...entry, tune: { ...entry.tune, ...lineage.tune }, motion: { ...entry.motion, ...lineage.motion } };
}

/**
 * Turns a vision model's scores for each codex phrase into a reading. Close runners-up that belong
 * together stay honest as alternatives; the person always has the last word.
 */
export function recognizeFromScores(scores: Record<string, number>): Recognition | null {
  const ranked = Object.entries(scores).filter(([id]) => CODEX_BY_ID[id]).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return null;
  const [topId, top] = ranked[0];
  return {
    entry: CODEX_BY_ID[topId], source: 'vision', confidence: top,
    alternatives: ranked.slice(1, 4).map(([id, score]) => ({ id, score })),
  };
}
