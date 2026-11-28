// Lexicon content: all 12 Glossa Hollow villagers (aligned with Kenne's character art sheets),
// Infected Unwriting zones to reclaim & restore, wild fleeing words to Lasso, and Song sigils.
import type { DialogueGraph } from '../../../playkit/adventure/dialogue';
import type { Power } from './words';

export type LevelId = 'glossa' | 'cavern' | 'minecart' | 'rapids' | 'wilds' | 'temple';
export type EnemyKind = 'hushling' | 'numeral' | 'glyphmaw' | 'lurker' | 'golem' | 'cavern_beast' | 'redactor';

export type VillagerRoutine = 'watch' | 'play' | 'forge' | 'study' | 'patrol' | 'garden' | 'courier' | 'perform';

export interface Villager {
  id: string;
  /** Character Forge GLB stem under public/games/lexicon/assets/characters/<glb>.glb */
  glb: string;
  name: string;
  role: string;
  height: number;
  /** Daytime craft/work position (verified dry ground). */
  pos: [number, number];
  /** Nighttime home cottage doorway (villagers walk home at Dusk and rest inside at Night!). */
  homePos: [number, number];
  /** Living daytime trade/activity routine & waypoints. */
  routine: VillagerRoutine;
  waypoints?: [number, number][];
  /** Night watchman patrols the village walkways with a glowing lantern after dusk. */
  nightWatch?: boolean;
  /** Optional facing yaw override; defaults to facing the village center. */
  yaw?: number;
  /** The word the Unwriting took from them, and the sentence it lived in ("___" marks the gap). */
  word: string;
  sentence: string;
  /** What they give back once their word is home. */
  rewardWord: string;
  rewardLine: string;
  heart?: boolean;
  color: number;
}

// All 12 villagers from Kenne's design sheets (docs/lexicon-direction.md),
// each assigned dry craft stations, living daily routines, and a home cottage for nighttime!
export const VILLAGERS: Villager[] = [
  {
    id: 'elder', glb: 'mira', name: 'Elder Mira', role: 'Town Matriarch & Chronicler', height: 1.62,
    pos: [-6.5, -6.5], homePos: [-12, -15], routine: 'watch', waypoints: [[-6.5, -6.5], [-4, -4.5], [-9, -10]],
    word: 'HOME', sentence: 'I have lived in this ___ my whole life.',
    rewardWord: 'OPEN', rewardLine: 'Take the word OPEN. Play it on the Lyre and sealed vaults will listen.', color: 0x6b4e9b,
  },
  {
    id: 'tolo', glb: 'tolo', name: 'Tolo the Blacksmith', role: 'Blacksmith Apprentice', height: 1.74,
    pos: [-19, 13], homePos: [-21, 16], routine: 'forge', waypoints: [[-19, 13], [-17.5, 11.5], [-21, 13.5]],
    word: 'FORGE', sentence: 'My runic hammer sings loudest beside the ___.',
    rewardWord: 'GROW', rewardLine: 'Master kept an old tempering word for living roots: GROW. It is yours.', color: 0xb86a35,
  },
  {
    id: 'pip', glb: 'pip', name: 'Pip', role: 'Curious Young Villager', height: 1.18,
    pos: [6, -9], homePos: [31, -2], routine: 'play', waypoints: [[6, -9], [4, -13], [9, -6], [5, -7]],
    word: 'STAR', sentence: 'Look, a ___ is falling across the waterfall!',
    rewardWord: 'RAIN', rewardLine: 'I caught this word in a puddle by the bridge. RAIN! Sing it by waterwheels!', color: 0x3a8fc7,
  },
  {
    id: 'oren', glb: 'oren', name: 'Oren the Archivist', role: 'Archivist & Historian', height: 1.72,
    pos: [10.5, -13], homePos: [13, -15.5], routine: 'study', waypoints: [[10.5, -13], [12, -10], [8.5, -14.5]],
    word: 'SCROLL', sentence: 'Every age of Glossa sleeps inside a catalogued ___.',
    rewardWord: 'LIBRARY', rewardLine: 'Take LIBRARY, and some of my stubborn courage too. Check behind the grand falls!', heart: true, color: 0x6c6548,
  },
  {
    id: 'lyra', glb: 'lyra', name: 'Lyra the Bard', role: 'Town Bard', height: 1.66,
    pos: [8.5, 6.5], homePos: [22, 16], routine: 'perform', waypoints: [[8.5, 6.5], [6, 5], [10.5, 9]],
    word: 'SONG', sentence: 'A word only truly wakes when you turn it into a ___.',
    rewardWord: 'HARMONY', rewardLine: 'Take HARMONY. Press Q anytime to raise your Lyre and sing your saved words.', color: 0x8f4e79,
  },
  {
    id: 'bram', glb: 'bram', name: 'Bram the Guard', role: 'Veteran Village Guard & Night Watch', height: 1.82,
    pos: [13, -6], homePos: [19, -6], routine: 'patrol', nightWatch: true,
    waypoints: [[13, -6], [4, -18], [-4, -18], [-8, -2], [5, 8], [14, 3]],
    word: 'SHIELD', sentence: 'Stand behind my ___ when the Unwritten press close.',
    rewardWord: 'COURAGE', rewardLine: 'You fight steady, Scribe. Take COURAGE for the infected meadows ahead.', color: 0x5d584e,
  },
  {
    id: 'thorne', glb: 'thorne', name: 'Elder Thorne', role: 'Council of Law', height: 1.78,
    pos: [-6.5, -26], homePos: [-11, -31], routine: 'watch', waypoints: [[-6.5, -26], [-3.5, -22], [-8.5, -29]],
    word: 'JUSTICE', sentence: 'True ___ balances every side like a level scale.',
    rewardWord: 'WISDOM', rewardLine: 'Keep WISDOM. Deep behind the waterfall, the ancient vaults test balance and weight.', color: 0x3e5c4a,
  },
  {
    id: 'kaelen', glb: 'kaelen', name: 'Kaelen the Herbalist', role: 'Herbalist & Healer', height: 1.74,
    pos: [28, -16], homePos: [32, -16.5], routine: 'garden', waypoints: [[28, -16], [25, -13], [30, -19], [26, -18]],
    word: 'HERB', sentence: 'Blue moon-___ only blooms where language still breathes.',
    rewardWord: 'GARDEN', rewardLine: 'Take GARDEN. Reclaim the infected clearings and watch the green rush back!', color: 0x5c7f48,
  },
  {
    id: 'maya', glb: 'maya', name: 'Maya the Alchemist', role: 'Village Alchemist', height: 1.58,
    pos: [-28, 7], homePos: [-31, 9], routine: 'garden', waypoints: [[-28, 7], [-25, 5], [-29, 4], [-26, 9]],
    word: 'INK', sentence: 'Living ___ should illuminate pages, never blot out the sky.',
    rewardWord: 'PRISM', rewardLine: 'Take PRISM. Inside the waterfall caverns, bend the sunbeam through every brass mirror.', color: 0x4c7a96,
  },
  {
    id: 'nico', glb: 'nico', name: 'Nico the Messenger', role: 'Village Messenger', height: 1.48,
    pos: [-4, 18], homePos: [-2, 23.5], routine: 'courier', waypoints: [[-4, 18], [-16, 10.5], [-9.5, 1.5], [4, 5], [-1, 19]],
    word: 'LETTER', sentence: 'I ran all the way across the stone bridge with this ___!',
    rewardWord: 'FRIEND', rewardLine: 'Take FRIEND! I saw glowing letters fluttering right over the creek bridge — try your Lasso!', color: 0x6f844e,
  },
  {
    id: 'zora', glb: 'zora', name: 'Zora the Cartographer', role: 'Cartographer & Astronomer', height: 1.67,
    pos: [-21, -19], homePos: [-23, -22], routine: 'study', waypoints: [[-21, -19], [-25, -17], [-19, -21]],
    word: 'COMPASS', sentence: 'My brass ___ spins wild whenever an infected zone opens.',
    rewardWord: 'JOURNEY', rewardLine: 'Take JOURNEY. Follow the cobbled creek path west to the roaring triple waterfall!', color: 0x3f6e78,
  },
  {
    id: 'selene', glb: 'selene', name: 'Selene the Weaver', role: 'Master Village Weaver', height: 1.65,
    pos: [17, 5.5], homePos: [20, 7.5], routine: 'garden', waypoints: [[17, 5.5], [15, 8], [19, 3]],
    word: 'WEAVE', sentence: 'Gold thread and linen ___ the stories of Glossa Hollow.',
    rewardWord: 'MEMORY', rewardLine: 'Take MEMORY. Beyond the canyon rapids, the Great Forest Elk still remembers the old songs.', color: 0xc2774f,
  },
];

export function villagerGraph(v: Villager): DialogueGraph {
  const said = v.sentence.replace('___', v.word);
  const blank = v.sentence.replace('___', '…');
  const g: DialogueGraph = {
    start: { if: `freed:${v.id}`, else: v.id === 'elder' ? 'introCheck' : 'lost', who: v.name, text: `“${said}” I can say it again. Thank you, Scribe.` },
    lost: {
      who: v.name,
      text: `“${blank}” …I had a word there. It’s gone blank, like a page left out in the rain.`,
      choices: [
        { label: `Give ${v.word}`, if: `has:${v.word}`, do: `free:${v.id}`, goto: 'given' },
        { label: 'I’ll find it.' },
      ],
    },
    given: { who: v.name, text: `“${said}” Yes! YES. ${v.rewardLine}` },
  };
  if (v.id === 'elder') {
    g.introCheck = { if: 'met:elder', else: 'intro1', who: v.name, text: '', goto: 'lost' };
    g.intro1 = { who: v.name, text: 'Scribe, you’re awake! Something is unwriting Glossa Hollow — stealing words and bleaching the land to white paper.', goto: 'intro2' };
    g.intro2 = { who: v.name, text: 'Look across the stone bridge: the word HOME still hovers there. Cast your Word Lasso to catch it — and stay ready when the Unwriting answers!', do: 'meet:elder' };
  }
  return g;
}

/** Infected Unwriting Zones: stark white-paper & black-ink fields holding denser Unwritten packs.
 *  Defeating every enemy in the zone cleanses the erasure field, restores colour, and frees its lost Word. */
export interface InfectedZoneDef {
  id: string;
  level: LevelId;
  name: string;
  pos: [number, number];
  radius: number;
  enemies: EnemyKind[];
  rewardWord: string;
  /** Wilds opening ambush spawns the Great Forest Elk rescue once cleared or LIGHT-bursted. */
  triggersElk?: boolean;
}

export const INFECTED_ZONES: InfectedZoneDef[] = [
  // Glossa Hollow Valley (erupt after player lassoes their first wild word!)
  {
    id: 'glossa-meadow-blight', level: 'glossa', name: 'Erased East Meadow',
    pos: [34, -6], radius: 18, enemies: ['hushling', 'hushling', 'hushling', 'numeral'],
    rewardWord: 'BRIDGE',
  },
  {
    id: 'glossa-mill-blight', level: 'glossa', name: 'Unwritten Mill Bank',
    pos: [-24, 28], radius: 18, enemies: ['hushling', 'hushling', 'numeral', 'glyphmaw'],
    rewardWord: 'FORGE',
  },
  {
    id: 'glossa-north-blight', level: 'glossa', name: 'Blotted Road Crossing',
    pos: [22, -44], radius: 19, enemies: ['hushling', 'numeral', 'numeral', 'glyphmaw'],
    rewardWord: 'SHIELD',
  },
  // Crystal Grotto subterranean infected pocket (Waterwheel Hall — keeps Hall of Reflections golden sunbeam clear!)
  {
    id: 'cavern-crystal-blight', level: 'cavern', name: 'Redacted Waterwheel Span',
    pos: [0, -56], radius: 13, enemies: ['lurker', 'lurker', 'numeral', 'golem'],
    rewardWord: 'CRYSTAL',
  },
  // Great Forest Wilderness infected zones (denser packs to fight & reclaim!)
  {
    id: 'wilds-river-ambush', level: 'wilds', name: 'Unwritten Riverbank Clearing',
    pos: [-18, 92], radius: 22, enemies: ['hushling', 'hushling', 'hushling', 'hushling', 'glyphmaw'],
    rewardWord: 'ANTLER', triggersElk: true,
  },
  {
    id: 'wilds-ruin-blight', level: 'wilds', name: 'Erased Stone Aqueduct',
    pos: [52, 18], radius: 24, enemies: ['hushling', 'hushling', 'numeral', 'numeral', 'glyphmaw'],
    rewardWord: 'CANOPY',
  },
  {
    id: 'wilds-shrine-blight', level: 'wilds', name: 'Root-Tree Shrine Threshold',
    pos: [-48, -68], radius: 24, enemies: ['hushling', 'numeral', 'glyphmaw', 'glyphmaw', 'lurker'],
    rewardWord: 'MEND',
  },
];

/** Wild floating/fleeing words caught in the open world with the Word Lasso (C / L). */
export interface WildWordDef {
  id: string;
  level: LevelId;
  word: string;
  pos: [number, number];
  /** Flee radius when the Scribe approaches (0 = gentle hovering tutorial word). */
  fleeSpeed: number;
  isFirstTutorial?: boolean;
}

export const WILD_WORDS: WildWordDef[] = [
  // First guided tutorial word right above the village stone bridge!
  { id: 'w-first-home', level: 'glossa', word: 'HOME', pos: [-13, 6], fleeSpeed: 0.35, isFirstTutorial: true },
  { id: 'w-glossa-river', level: 'glossa', word: 'RIVER', pos: [-34, -10], fleeSpeed: 3.2 },
  { id: 'w-glossa-star', level: 'glossa', word: 'STAR', pos: [18, 22], fleeSpeed: 3.8 },
  { id: 'w-glossa-letter', level: 'glossa', word: 'LETTER', pos: [-6, 22], fleeSpeed: 3.4 },
  { id: 'w-glossa-scroll', level: 'glossa', word: 'SCROLL', pos: [28, 16], fleeSpeed: 3.6 },
  { id: 'w-glossa-herb', level: 'glossa', word: 'HERB', pos: [42, 26], fleeSpeed: 4.0 },
  { id: 'w-glossa-weave', level: 'glossa', word: 'WEAVE', pos: [-38, 12], fleeSpeed: 3.6 },
  // Crystal Grotto wild words
  { id: 'w-cavern-prism', level: 'cavern', word: 'PRISM', pos: [6, -18], fleeSpeed: 2.5 },
  { id: 'w-cavern-ratio', level: 'cavern', word: 'RATIO', pos: [-10, -52], fleeSpeed: 2.8 },
  { id: 'w-cavern-torque', level: 'cavern', word: 'TORQUE', pos: [10, -104], fleeSpeed: 3.0 },
  // Great Forest Wilderness wild word herds (fun to chase on the Great Forest Elk!)
  { id: 'w-wilds-wildwood', level: 'wilds', word: 'WILDWOOD', pos: [14, 42], fleeSpeed: 6.8 },
  { id: 'w-wilds-rapids', level: 'wilds', word: 'RAPIDS', pos: [-44, 52], fleeSpeed: 6.2 },
  { id: 'w-wilds-justice', level: 'wilds', word: 'JUSTICE', pos: [66, -34], fleeSpeed: 7.0 },
  { id: 'w-wilds-ink', level: 'wilds', word: 'INK', pos: [-12, -26], fleeSpeed: 6.0 },
  { id: 'w-wilds-song', level: 'wilds', word: 'SONG', pos: [26, -78], fleeSpeed: 7.2 },
];

export interface SigilDef {
  id: string; level: LevelId; power: Power; pos: [number, number]; label: string;
  reward?: string;
}

export const SIGILS: SigilDef[] = [
  { id: 'lantern', level: 'glossa', power: 'light', pos: [-18, 18], label: 'An unlit lantern shrine', reward: 'LANTERN' },
  { id: 'sapling', level: 'glossa', power: 'grow', pos: [19, 14], label: 'A sapling in cracked soil', reward: 'GARDEN' },
  { id: 'fountain', level: 'glossa', power: 'water', pos: [-17, -14], label: 'A dry fountain', reward: 'MIRROR' },
  { id: 'chest', level: 'glossa', power: 'open', pos: [18, -16], label: 'A chest sealed with a blank lock', reward: 'JOURNEY' },
  { id: 'sundial', level: 'glossa', power: 'time', pos: [0, -32], label: 'A sundial whose shadow will not move', reward: 'MEMORY' },
  { id: 'torches', level: 'temple', power: 'light', pos: [-6, -50], label: 'Cold braziers in the dark' },
  { id: 'vine', level: 'temple', power: 'grow', pos: [3, -55], label: 'A withered root at the chasm’s edge' },
  { id: 'shrine-root', level: 'wilds', power: 'mend', pos: [-54, -84], label: 'The Root-Tree Word Sanctuary', reward: 'TOMORROW' },
];

export const STARTING_WORDS = ['LIGHT', 'TIME'];
