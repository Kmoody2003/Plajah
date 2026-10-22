// Story intelligence for worksheets. Two jobs:
//   1. storyWorld — the cast, places and objects word problems and writing prompts are told with, tilted toward the
//      learner's interests so "7 × 8" becomes a question about their team, their kitchen or their rocket.
//   2. analyzePassage — reads a passage the way a reading teacher would (paragraphs, sentences, dialogue, characters,
//      sequence and cause-effect signals, readability) and turns that into extra text-dependent items beyond the
//      passage's authored questions: vocabulary in context, sequencing, evidence hunts.
import type { Passage, WsItem } from './types';
import type { Rng } from './rng';

// ── 1. Story world ──────────────────────────────────────────────────────────

export interface Thing { one: string; many: string }
export interface StoryWorld {
  names: string[];
  place: string;
  things: Thing[];
  container: Thing;
  unit: string;
  activity: string;
  interest: string;
}

/** Names from every inhabited continent; each worksheet samples a handful. */
export const GLOBAL_NAMES = [
  'Amara', 'Kofi', 'Zainab', 'Tendai', 'Nia', 'Chidi', 'Aisha', 'Omar', 'Layla', 'Yusuf', 'Priya', 'Arjun', 'Ananya', 'Rohan',
  'Mei', 'Hiro', 'Yuna', 'Min-jun', 'Ji-woo', 'Linh', 'Bao', 'Siti', 'Rizal', 'Malia', 'Kai', 'Aroha', 'Tane', 'Sofia', 'Mateo',
  'Valentina', 'Diego', 'Camila', 'Luis', 'Inés', 'Thiago', 'Ana', 'Lucas', 'Emma', 'Liam', 'Olivia', 'Noah', 'Freya', 'Lars',
  'Elena', 'Nikolai', 'Zofia', 'Jakub', 'Leila', 'Darius', 'Noor', 'Tariq', 'Sami', 'Hana', 'Ayasha', 'Tala', 'Kiona', 'Ezra',
  'Maya', 'Jamal', 'Imani', 'Marcus', 'Grace', 'Ibrahim', 'Fatima', 'Kenji', 'Asel', 'Bolat', 'Ingrid', 'Rafael', 'Beatriz',
];

const WORLDS: Record<string, Omit<StoryWorld, 'names' | 'interest'>> = {
  soccer: { place: 'the soccer field', things: [{ one: 'ball', many: 'balls' }, { one: 'cone', many: 'cones' }, { one: 'jersey', many: 'jerseys' }, { one: 'water bottle', many: 'water bottles' }], container: { one: 'bag', many: 'bags' }, unit: 'goals', activity: 'practice' },
  basketball: { place: 'the court', things: [{ one: 'basketball', many: 'basketballs' }, { one: 'shot', many: 'shots' }, { one: 'sneaker', many: 'sneakers' }], container: { one: 'rack', many: 'racks' }, unit: 'points', activity: 'the game' },
  space: { place: 'the space station', things: [{ one: 'rocket', many: 'rockets' }, { one: 'star sticker', many: 'star stickers' }, { one: 'moon rock', many: 'moon rocks' }, { one: 'satellite', many: 'satellites' }], container: { one: 'crate', many: 'crates' }, unit: 'kilometers', activity: 'the mission' },
  cooking: { place: 'the kitchen', things: [{ one: 'muffin', many: 'muffins' }, { one: 'dumpling', many: 'dumplings' }, { one: 'cookie', many: 'cookies' }, { one: 'mango', many: 'mangoes' }], container: { one: 'tray', many: 'trays' }, unit: 'cups', activity: 'the bake sale' },
  music: { place: 'the music room', things: [{ one: 'drum', many: 'drums' }, { one: 'song', many: 'songs' }, { one: 'ticket', many: 'tickets' }, { one: 'guitar pick', many: 'guitar picks' }], container: { one: 'case', many: 'cases' }, unit: 'beats', activity: 'the concert' },
  animals: { place: 'the animal shelter', things: [{ one: 'puppy', many: 'puppies' }, { one: 'kitten', many: 'kittens' }, { one: 'bowl', many: 'bowls' }, { one: 'treat', many: 'treats' }], container: { one: 'basket', many: 'baskets' }, unit: 'meals', activity: 'feeding time' },
  art: { place: 'the art studio', things: [{ one: 'paintbrush', many: 'paintbrushes' }, { one: 'crayon', many: 'crayons' }, { one: 'canvas', many: 'canvases' }, { one: 'bead', many: 'beads' }], container: { one: 'box', many: 'boxes' }, unit: 'sheets', activity: 'the art show' },
  robots: { place: 'the robotics lab', things: [{ one: 'robot', many: 'robots' }, { one: 'gear', many: 'gears' }, { one: 'battery', many: 'batteries' }, { one: 'sensor', many: 'sensors' }], container: { one: 'kit', many: 'kits' }, unit: 'volts', activity: 'the competition' },
  nature: { place: 'the community garden', things: [{ one: 'seed', many: 'seeds' }, { one: 'tomato', many: 'tomatoes' }, { one: 'flower', many: 'flowers' }, { one: 'ladybug', many: 'ladybugs' }], container: { one: 'pot', many: 'pots' }, unit: 'rows', activity: 'planting day' },
  dance: { place: 'the dance studio', things: [{ one: 'ribbon', many: 'ribbons' }, { one: 'costume', many: 'costumes' }, { one: 'step', many: 'steps' }], container: { one: 'trunk', many: 'trunks' }, unit: 'counts', activity: 'the recital' },
  gaming: { place: 'the game club', things: [{ one: 'coin', many: 'coins' }, { one: 'level', many: 'levels' }, { one: 'gem', many: 'gems' }, { one: 'card', many: 'cards' }], container: { one: 'chest', many: 'chests' }, unit: 'points', activity: 'the tournament' },
  books: { place: 'the library', things: [{ one: 'book', many: 'books' }, { one: 'bookmark', many: 'bookmarks' }, { one: 'page', many: 'pages' }, { one: 'comic', many: 'comics' }], container: { one: 'shelf', many: 'shelves' }, unit: 'chapters', activity: 'the reading challenge' },
  school: { place: 'the classroom', things: [{ one: 'pencil', many: 'pencils' }, { one: 'apple', many: 'apples' }, { one: 'sticker', many: 'stickers' }, { one: 'marble', many: 'marbles' }], container: { one: 'box', many: 'boxes' }, unit: 'pages', activity: 'the school fair' },
};

const INTEREST_ALIASES: Array<[RegExp, string]> = [
  [/soccer|football|futbol/i, 'soccer'], [/basket|nba|hoops/i, 'basketball'], [/space|planet|rocket|astro|star/i, 'space'],
  [/cook|bak|food|chef/i, 'cooking'], [/music|sing|drum|piano|guitar|band/i, 'music'], [/animal|dog|cat|pet|horse|zoo|dinosaur/i, 'animals'],
  [/art|draw|paint|craft/i, 'art'], [/robot|lego|code|coding|tech|engineer/i, 'robots'], [/garden|plant|nature|bug|outdoor/i, 'nature'],
  [/danc|ballet/i, 'dance'], [/game|minecraft|video/i, 'gaming'], [/book|read|comic|story/i, 'books'],
];

export function worldKeyFor(interest?: string): string {
  if (!interest) return 'school';
  for (const [re, key] of INTEREST_ALIASES) if (re.test(interest)) return key;
  return 'school';
}

export function storyWorld(rng: Rng, interests: string[] = [], learnerName?: string): StoryWorld {
  const key = interests.length ? worldKeyFor(rng.pick(interests)) : rng.pick(Object.keys(WORLDS));
  const names = rng.sample(GLOBAL_NAMES, 6);
  // A learner sometimes meets themself in their own word problems; it reads as care, not gimmick, at one in six.
  if (learnerName && rng.chance(1 / 6)) names[0] = learnerName.split(/\s+/)[0];
  return { ...WORLDS[key], names, interest: key };
}

export const worldKeys = () => Object.keys(WORLDS);

// ── 2. Passage analysis ─────────────────────────────────────────────────────

export interface PassageAnalysis {
  paragraphs: string[];
  sentences: string[];
  words: number;
  dialogueLines: number;
  characters: string[];
  sequenceSentences: string[];
  causeEffectSentences: string[];
  /** Flesch–Kincaid grade estimate. */
  fkGrade: number;
  avgSentenceWords: number;
  longWords: string[];
}

const STOP_CAPS = new Set(['The', 'A', 'An', 'And', 'But', 'Then', 'When', 'She', 'He', 'They', 'It', 'I', 'We', 'You', 'One', 'In', 'On', 'At', 'After', 'Before', 'First', 'Next', 'Finally', 'Every', 'Some', 'This', 'That', 'There', 'Now', 'So', 'If', 'What', 'Why', 'How', 'Where', 'Who', 'Today', 'Long', 'Once', 'Mom', 'Dad', 'Yes', 'No', 'Oh', 'My', 'Our', 'His', 'Her', 'Their', 'As', 'By', 'For', 'With', 'From', 'Of', 'To', 'Is', 'Was', 'Are', 'Do', 'Did', 'Can', 'Could', 'Would', 'Will', 'Not', 'All', 'Most', 'Many']);

export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return w ? 1 : 0;
  const m = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, m ? m.length : 1);
}

const clean = (t: string) => t.replace(/^##\s+.*$/gm, '').replace(/^[A-Z][A-Z ]+:\s*/gm, '');

export function analyzePassage(p: Passage): PassageAnalysis {
  const paragraphs = p.text.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  const body = clean(p.text).replace(/\n/g, ' ');
  const sentences = (body.match(/[^.!?]+[.!?]+["”’)]*/g) || [body]).map(s => s.trim()).filter(s => s.split(/\s+/).length >= 3);
  const tokens: string[] = body.match(/[A-Za-z’'-]+/g) || [];
  const syl = tokens.reduce((n: number, w) => n + syllables(w), 0);
  const words = tokens.length;
  const sCount = Math.max(1, sentences.length);
  const fkGrade = Math.max(0, +(0.39 * (words / sCount) + 11.8 * (syl / Math.max(1, words)) - 15.59).toFixed(1));
  const capCounts = new Map<string, number>();
  for (const s of sentences) {
    const ws = s.match(/[A-Za-z’'-]+/g) || [];
    ws.forEach((w, i) => { if (i > 0 && /^[A-Z][a-z]/.test(w) && !STOP_CAPS.has(w)) capCounts.set(w, (capCounts.get(w) || 0) + 1); });
  }
  const characters = [...capCounts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).map(([w]) => w).slice(0, 5);
  return {
    paragraphs, sentences, words, fkGrade,
    dialogueLines: (p.text.match(/[“"][^”"]+[”"]/g) || []).length,
    characters,
    sequenceSentences: sentences.filter(s => /\b(first|then|next|after|later|finally|at last|soon|the next day|in the end)\b/i.test(s)),
    causeEffectSentences: sentences.filter(s => /\b(because|so that|as a result|since|therefore|caused|which made)\b/i.test(s)),
    avgSentenceWords: +(words / sCount).toFixed(1),
    longWords: [...new Set(tokens.filter(w => w.length >= 8).map(w => w.toLowerCase()))].slice(0, 12),
  };
}

const sentenceWith = (a: PassageAnalysis, word: string) => a.sentences.find(s => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(s));

/** Vocabulary-in-context items: the word's own sentence, its definition against the passage's other definitions. */
export function vocabInContext(p: Passage, a: PassageAnalysis, rng: Rng, n: number, choices: number): WsItem[] {
  return rng.sample(p.vocab, n).map(([word, def], i) => {
    const s = sentenceWith(a, word) || '';
    const others = rng.sample(p.vocab.filter(v => v[0] !== word).map(v => v[1]), choices - 1);
    while (others.length < choices - 1) others.push(['a kind of weather', 'to move very slowly', 'a loud noise'][others.length]);
    return {
      id: `vic${i}`, kind: 'choice' as const, skill: 'reading.vocab-context', level: 2 as const, points: 1,
      prompt: s ? `Read: “${s}” What does **${word}** mean?` : `What does **${word}** mean in the passage?`,
      choices: rng.shuffle([def, ...others]), answer: def,
    };
  });
}

/** Sequencing: three events from different paragraphs, scrambled; the student numbers them 1–3. */
export function sequenceItem(p: Passage, a: PassageAnalysis, rng: Rng): WsItem | null {
  const firsts = a.paragraphs.map(par => (clean(par).match(/[^.!?]+[.!?]+/) || [])[0]?.trim()).filter((s): s is string => !!s && s.split(/\s+/).length >= 4 && s.split(/\s+/).length <= 22);
  if (firsts.length < 3) return null;
  const pickIdx = [0, Math.floor(firsts.length / 2), firsts.length - 1];
  const events = pickIdx.map(i => firsts[i]);
  const shown = rng.shuffle(events);
  return {
    id: 'seq', kind: 'sort', skill: 'reading.sequence', level: 2, points: 3,
    prompt: `Number these events 1, 2, 3 in the order they happen in “${p.title}”.`,
    choices: shown, answer: shown.map(s => String(events.indexOf(s) + 1)).join(', '),
  };
}

/** Evidence hunt: a text-dependent question answered by copying or underlining a sentence. */
export function evidenceItem(p: Passage, a: PassageAnalysis): WsItem {
  const ce = a.causeEffectSentences[0];
  const who = a.characters[0];
  const prompt = ce
    ? 'Underline a sentence that tells why something happened. Then explain the cause and the effect in your own words.'
    : who
      ? `How does ${who} feel or change in this passage? Write one sentence from the text that proves it.`
      : 'What is the most important idea in this passage? Copy one sentence that supports it.';
  return { id: 'evid', kind: 'write', skill: 'reading.evidence', level: 3, points: 3, lines: 3, prompt, answer: ce ? `Look for: ${ce}` : 'Answer names an idea and quotes a supporting sentence accurately.' };
}

/** Band targets used by the Education Council's readability check. */
export const FK_TARGET: Record<string, [number, number]> = { k2: [0, 3], '35': [2.5, 6.5], '68': [5.5, 10] };
