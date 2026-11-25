// Lexicon content: villagers who lost a word, and the sigils that answer songs.
// Dialogue uses the playkit DialogueGraph format (conditions "has:WORD", "freed:id", "met:id";
// actions "free:id", "meet:id"), so the Studio can show and edit it as data later.
import type { DialogueGraph } from '../../../playkit/adventure/dialogue';
import type { Power } from './words';

export interface Villager {
  id: string; name: string; pos: [number, number];
  /** The word the Unwriting took from them, and the sentence it lived in ("___" marks the gap). */
  word: string; sentence: string;
  /** What they give back once their word is home. */
  rewardWord: string; rewardLine: string; heart?: boolean;
  color: number;
}

export const VILLAGERS: Villager[] = [
  { id: 'elder', name: 'Elder Mira', pos: [-6, -3], word: 'HOME', sentence: 'I have lived in this ___ my whole life.',
    rewardWord: 'OPEN', rewardLine: 'Take the word OPEN. Play it on the Lyre and sealed things will listen.', color: 0x6b4e9b },
  { id: 'baker', name: 'Tolo the Baker', pos: [9, 4], word: 'BREAD', sentence: 'Fresh ___ from the oven, still warm!',
    rewardWord: 'GROW', rewardLine: 'My grandmother kept a word for seeds: GROW. It is yours.', color: 0xc77d3a },
  { id: 'pip', name: 'Pip', pos: [3, -10], word: 'STAR', sentence: 'Look, a ___ is falling across the sky!',
    rewardWord: 'RAIN', rewardLine: 'I found this word in a puddle once. RAIN! You can have it.', color: 0x3a8fc7 },
  { id: 'oren', name: 'Oren the Ferryman', pos: [-11, 9], word: 'RIVER', sentence: 'The ___ carries my boat to the sea.',
    rewardWord: 'SONG', rewardLine: 'Here, the word SONG, and some of my courage with it.', heart: true, color: 0x3f7f5a },
];

export function villagerGraph(v: Villager): DialogueGraph {
  const said = v.sentence.replace('___', v.word);
  const blank = v.sentence.replace('___', '…');
  const g: DialogueGraph = {
    start: { if: `freed:${v.id}`, else: v.id === 'elder' ? 'introCheck' : 'lost', who: v.name, text: `“${said}” I can say it again. Thank you, Scribe.` },
    lost: { who: v.name, text: `“${blank}” …I had a word there. It’s gone blank, like a page left out in the rain.`,
      choices: [{ label: `Give ${v.word}`, if: `has:${v.word}`, do: `free:${v.id}`, goto: 'given' }, { label: 'I’ll find it.' }] },
    given: { who: v.name, text: `“${said}” Yes! YES. ${v.rewardLine}` },
  };
  if (v.id === 'elder') {
    g.introCheck = { if: `met:elder`, else: 'intro1', who: v.name, text: '', goto: 'lost' };
    // empty-text nodes are skipped by the game: introCheck only routes
    g.intro1 = { who: v.name, text: 'Scribe, you’re awake. Listen. Something is unwriting the world. We call it the Unwriting.', goto: 'intro2' };
    g.intro2 = { who: v.name, text: 'Words are going blank. The Hushlings carry them off, and the Numerals bind them with sums. When a word goes, the minds that held it go quiet.', goto: 'intro3' };
    g.intro3 = { who: v.name, text: 'Strike them until they falter, then answer what binds the word, and it comes home to you. Keep every word in the Archive.', goto: 'intro4' };
    g.intro4 = { who: v.name, text: 'You already carry two songs: LIGHT and TIME. Press Q and type them on the Lyre. The Unwriting began in the Temple of Numerals to the north. Its gate opens only to words.', do: 'meet:elder', goto: 'lost' };
  }
  return g;
}

export interface SigilDef {
  id: string; level: 'glossa' | 'temple'; power: Power; pos: [number, number]; label: string;
  /** Word the sigil gives back the first time it answers. */
  reward?: string;
}

export const SIGILS: SigilDef[] = [
  { id: 'lantern', level: 'glossa', power: 'light', pos: [-16, 13], label: 'An unlit lantern shrine', reward: 'LANTERN' },
  { id: 'sapling', level: 'glossa', power: 'grow', pos: [16, 13], label: 'A sapling in cracked soil', reward: 'GARDEN' },
  { id: 'fountain', level: 'glossa', power: 'water', pos: [-15, -13], label: 'A dry fountain', reward: 'MIRROR' },
  { id: 'chest', level: 'glossa', power: 'open', pos: [16, -14], label: 'A chest sealed with a blank lock', reward: 'JOURNEY' },
  { id: 'sundial', level: 'glossa', power: 'time', pos: [0, -30], label: 'A sundial whose shadow will not move', reward: 'MEMORY' },
  { id: 'torches', level: 'temple', power: 'light', pos: [-6, -50], label: 'Cold braziers in the dark' },
  { id: 'vine', level: 'temple', power: 'grow', pos: [3, -55], label: 'A withered root at the chasm’s edge' },
];

export const STARTING_WORDS = ['LIGHT', 'TIME'];
