// Age-Scalable, Scratchpad-Free Ciphers + Plajah Lore & Chora Music Lyric Challenges!
// Kenne's rule: NEVER make the player memorize A=1..Z=26 or grab a scratchpad.
// Always print worked-out letter weights right on the card, scale cleanly for all age ranges
// (Explorer · Ages 7-10, Scribe · All Ages, Scholar · Master), and weave in Plajah lore & Chora lyrics!
import {
  arithChallenge, letterChallenge, letterValue, wordValue,
  type Challenge, type LexEntry,
} from '../../../playkit/learning/challenges';

export type CipherDifficulty = 'explorer' | 'scribe' | 'scholar';

export const DIFFICULTY_LABEL: Record<CipherDifficulty, string> = {
  explorer: 'Explorer (Ages 7–10)',
  scribe: 'Scribe (All Ages)',
  scholar: 'Scholar (Master)',
};

export interface LoreLyricPrompt {
  source: string;
  line: string;    // line with ____ blank
  word: string;    // missing word
  wrong: [string, string, string];
  minDiff?: CipherDifficulty;
}

/** Curated Plajah Lore & Chora Music Lyric Ciphers (inspired by Lexicon's Chora/score themes & Plajah world). */
const CHORA_LORE_PROMPTS: LoreLyricPrompt[] = [
  {
    source: "Chora Lyric · The Explorer's Path",
    line: '“Step by step across the cobble, every ____ wakes the dawn.”',
    word: 'WORD',
    wrong: ['DARK', 'VOID', 'MUTE'],
  },
  {
    source: 'Chora Lyric · The Guardian of the Grove',
    line: '“Antlers glowing cyan bright, the great elk guards the ____.”',
    word: 'GROVE',
    wrong: ['RUST', 'ASH', 'DUST'],
  },
  {
    source: "Chora Lyric · The Talking Drum's Call",
    line: '“Strike the skin and hear the valley answer with a ____.”',
    word: 'SONG',
    wrong: ['LOCK', 'BLOT', 'WALL'],
  },
  {
    source: 'Chora Lyric · We Answer',
    line: '“When the blank page tries to hush us, together we ____.”',
    word: 'SPEAK',
    wrong: ['FADE', 'HIDE', 'SINK'],
  },
  {
    source: 'Chora Lyric · Hold the Ground',
    line: '“Hold the bridge and hold the square, bring the golden ____ home.”',
    word: 'LIGHT',
    wrong: ['COLD', 'MIST', 'GRAY'],
  },
  {
    source: 'Plajah Chronicle · Glossa Hollow',
    line: '“Behind the roaring triple falls, blue crystals guard the ____.”',
    word: 'PRISM',
    wrong: ['CLAY', 'PLOW', 'BARN'],
  },
  {
    source: 'Plajah Chronicle · The Scribe’s Oath',
    line: '“Ink can erase, or ink can ____ a broken page back whole.”',
    word: 'MEND',
    wrong: ['TEAR', 'BLUR', 'DROP'],
  },
  {
    source: 'Chora Lyric · The Ancestral Circle',
    line: '“Lanterns warm the dusk-lit road while stories keep the ____.”',
    word: 'HOME',
    wrong: ['CAGE', 'RIFT', 'VOID'],
  },
  {
    source: 'Plajah Lore · Temple of Numerals',
    line: '“Every brass gear keeps its count, measuring the turn of ____.”',
    word: 'TIME',
    wrong: ['MUD', 'KNOT', 'ROCK'],
  },
  {
    source: 'Chora Lyric · The Folktale of the Peaks',
    line: '“Waterwheels turn by the bank where silver ____ flow.”',
    word: 'RIVER',
    wrong: ['SMOKE', 'SAND', 'BONE'],
  },
];

const ri = (n: number) => Math.floor(Math.random() * n);
const pick = <T,>(a: readonly T[]): T => a[ri(a.length)]!;

function shuffleChoices(correct: string, wrong: string[]): { choices: string[]; answer: number } {
  const all = [correct, ...wrong.slice(0, 3)];
  for (let i = all.length - 1; i > 0; i--) {
    const j = ri(i + 1);
    [all[i], all[j]] = [all[j]!, all[i]!];
  }
  return { choices: all, answer: all.indexOf(correct) };
}

/** Format a word's worked-out letter breakdown: e.g. "S(19) + O(15) + N(14) + G(7)" — zero memorization! */
export function workedLetterSum(w: string): string {
  return [...w.toUpperCase()]
    .filter((c) => c >= 'A' && c <= 'Z')
    .map((c) => `${c}(${letterValue(c)})`)
    .join(' + ');
}

/** Worked-math Word-Weight Cipher: ALWAYS prints the letter numbers so players do fun addition, never A-Z memorization! */
export function workedWordWeightChallenge(
  bank: readonly LexEntry[],
  difficulty: CipherDifficulty,
  prefer?: (e: LexEntry) => boolean,
): Challenge {
  const maxLen = difficulty === 'explorer' ? 4 : difficulty === 'scribe' ? 5 : 7;
  const maxTier = difficulty === 'explorer' ? 1 : difficulty === 'scribe' ? 2 : 3;
  const base = bank.filter((e) => e.w.length <= maxLen && e.tier <= maxTier);
  const pref = prefer ? base.filter(prefer) : [];
  const pool = pref.length ? pref : base.length ? base : [...bank];
  const entry = pick(pool);
  const w = entry.w.toUpperCase();
  const v = wordValue(w);
  const expr = workedLetterSum(w);

  // Two super fun scratchpad-free modes:
  // Mode A: Worked-out equation shown right on screen -> pick the right total!
  // Mode B (50% on Scribe/Scholar): Target sum shown -> pick the worked-out word card that actually equals it!
  if (difficulty !== 'explorer' && Math.random() < 0.45) {
    const others = bank.filter((e) => e.w.toUpperCase() !== w && wordValue(e.w) !== v && e.w.length <= maxLen + 1);
    const pickedWrong: LexEntry[] = [];
    while (pickedWrong.length < 3 && others.length) {
      const idx = ri(others.length);
      pickedWrong.push(others.splice(idx, 1)[0]!);
    }
    const fmt = (word: string) => `${word.toUpperCase()} (${[...word.toUpperCase()].map((c) => letterValue(c)).join('+')})`;
    const correct = fmt(w);
    const wrong = pickedWrong.map((x) => fmt(x.w));
    const { choices, answer } = shuffleChoices(correct, wrong);
    return {
      kind: 'value',
      prompt: `Find the word weighing ${v}`,
      sub: `No guessing — every letter's value is written out! Pick the word whose numbers add to ${v}.`,
      choices,
      answer,
      entry,
    };
  }

  // Explorer/Scribe direct worked-out sum!
  const offsets = difficulty === 'explorer' ? [-4, -2, -1, 1, 2, 4, 5] : [-10, -5, -3, -2, -1, 1, 2, 3, 5, 10];
  const wrong = new Set<number>();
  while (wrong.size < 3) {
    const cand = v + pick(offsets);
    if (cand !== v && cand > 0) wrong.add(cand);
  }
  const { choices, answer } = shuffleChoices(String(v), [...wrong].map(String));
  return {
    kind: 'value',
    prompt: `${w}  =  ?`,
    sub: `${expr}  =  ?   (“${entry.def}”)`,
    choices,
    answer,
    entry,
  };
}

/** Plajah Lore & Chora Music Lyric Cipher: complete the verse with worked-out word weights shown! */
export function choraLoreCipherChallenge(bank: readonly LexEntry[], difficulty: CipherDifficulty): Challenge {
  const item = pick(CHORA_LORE_PROMPTS);
  const entry = bank.find((e) => e.w.toUpperCase() === item.word) ?? { w: item.word, def: item.source, tier: 1 };
  const showWeight = difficulty !== 'explorer';
  const label = (word: string) => (showWeight ? `${word} · Σ${wordValue(word)}` : word);
  const correct = label(item.word);
  const wrong = item.wrong.map(label);
  const { choices, answer } = shuffleChoices(correct, wrong);
  return {
    kind: 'letter',
    prompt: item.line,
    sub: showWeight
      ? `${item.source} · Target word weighs ${wordValue(item.word)} (${workedLetterSum(item.word)})`
      : `${item.source} · Choose the living word that completes the verse!`,
    choices,
    answer,
    entry,
  };
}

/** Master age-scalable challenge dispatcher for Lexicon combat rescues. */
export function buildLexiconChallenge(
  enemyKind: string,
  bank: readonly LexEntry[],
  rawTier: number,
  difficulty: CipherDifficulty,
  prefer?: (e: LexEntry) => boolean,
): Challenge {
  const scaledTier = difficulty === 'explorer' ? 1 : difficulty === 'scribe' ? Math.min(2, rawTier) : Math.max(2, rawTier);
  // 30% chance on word enemies to surface a Chora Music Lyric or Plajah Lore Cipher!
  if ((enemyKind === 'hushling' || enemyKind === 'lurker' || enemyKind === 'glyphmaw') && Math.random() < 0.32) {
    return choraLoreCipherChallenge(bank, difficulty);
  }
  if (enemyKind === 'hushling' || enemyKind === 'lurker') {
    return letterChallenge(bank, scaledTier, prefer);
  }
  if (enemyKind === 'numeral' || enemyKind === 'golem') {
    return arithChallenge(scaledTier);
  }
  return workedWordWeightChallenge(bank, difficulty, prefer);
}
