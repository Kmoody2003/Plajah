// Deterministic, client-side story breakdown inferred from a film's own listing details.
// No network. Used only when no stored Story Intelligence report is readable.

export interface InferInput {
  title?: string;
  description?: string;
  tagline?: string;
  genre?: string;
  tags?: string[];
  runtimeSec?: number;
  castNames?: string[];
  characterNames?: string[];
  credits?: string[];
  rating?: string;
}

export interface InferredStory {
  summary: string;
  themes: string[];
  tone: string[];
  keyMoments: string[];
  contentNotes: string[];
  facts: string[];
}

const THEME_LEXICON: Record<string, string[]> = {
  'Family & belonging': ['family', 'mother', 'father', 'sister', 'brother', 'home', 'belong', 'daughter', 'son'],
  'Love & relationships': ['love', 'romance', 'marriage', 'heart', 'lover', 'relationship'],
  'Revenge & justice': ['revenge', 'justice', 'vengeance', 'trial', 'crime', 'murder', 'detective'],
  'Survival': ['survive', 'survival', 'escape', 'trapped', 'wilderness', 'apocalypse'],
  'Identity & self-discovery': ['identity', 'discover', 'journey', 'coming of age', 'finding', 'truth'],
  'Power & corruption': ['power', 'corrupt', 'war', 'empire', 'politic', 'conspiracy'],
  'Loss & grief': ['loss', 'grief', 'death', 'mourning', 'memory', 'haunt'],
  'Friendship & loyalty': ['friend', 'loyal', 'together', 'team', 'crew'],
  'Technology & humanity': ['robot', 'ai ', 'future', 'technology', 'space', 'alien', 'machine'],
  'Faith & morality': ['faith', 'god', 'sin', 'moral', 'soul', 'redemption'],
};

const TONE_BY_GENRE: Array<[RegExp, string]> = [
  [/horror|thriller|suspense/i, 'Tense'], [/comedy|sitcom|parody/i, 'Light-hearted'],
  [/drama/i, 'Emotional'], [/action|adventure/i, 'High-energy'], [/romance/i, 'Warm'],
  [/sci-?fi|fantasy/i, 'Imaginative'], [/documentary|doc/i, 'Factual'], [/animation|family|kids/i, 'Playful'],
  [/noir|crime|mystery/i, 'Moody'], [/war|history|biograph/i, 'Weighty'],
];

const NOTE_LEXICON: Array<[RegExp, string]> = [
  [/violen|murder|kill|war|gun|fight/i, 'Contains violence'],
  [/horror|haunt|terror/i, 'Frightening scenes'],
  [/drug|addict/i, 'Drug references'],
  [/sex|erotic|nudity/i, 'Mature themes'],
];

const clean = (s?: string) => (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export function splitSentences(text: string): string[] {
  return clean(text).split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/).map(s => s.trim()).filter(s => s.length > 3);
}

export function formatRuntime(sec?: number): string | null {
  if (!sec || !isFinite(sec) || sec <= 0) return null;
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

/** Returns null when there is not enough text to say anything honest. */
export function inferStory(input: InferInput): InferredStory | null {
  const desc = clean(input.description);
  const tagline = clean(input.tagline);
  const tags = (input.tags || []).map(t => clean(t)).filter(Boolean);
  const genre = clean(input.genre);
  const haystack = ` ${[input.title, desc, tagline, genre, ...tags].join(' ').toLowerCase()} `;
  const sentences = splitSentences(desc);

  if (desc.length < 40 && !tagline && tags.length < 2) return null;

  const summary = sentences.slice(0, 2).join(' ') || tagline || desc;

  const themes = Object.entries(THEME_LEXICON)
    .map(([name, words]) => ({ name, hits: words.filter(w => haystack.includes(w)).length }))
    .filter(t => t.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.name.localeCompare(b.name))
    .slice(0, 4).map(t => t.name);

  const tone: string[] = [];
  for (const [re, label] of TONE_BY_GENRE) {
    if (re.test(`${genre} ${tags.join(' ')}`) && !tone.includes(label)) tone.push(label);
  }

  // Key moments: sentences carrying a turning-point cue, else the later sentences of the logline.
  const cue = /\b(but|until|when|after|suddenly|discovers?|must|forced|betray|secret|finds?)\b/i;
  let keyMoments = sentences.filter(s => cue.test(s)).slice(0, 3);
  if (keyMoments.length === 0 && sentences.length > 2) keyMoments = sentences.slice(2, 5);

  const contentNotes: string[] = [];
  if (input.rating) contentNotes.push(`Rated ${input.rating}`);
  for (const [re, label] of NOTE_LEXICON) if (re.test(haystack) && !contentNotes.includes(label)) contentNotes.push(label);

  const facts: string[] = [];
  if (genre) facts.push(genre);
  const rt = formatRuntime(input.runtimeSec);
  if (rt) facts.push(rt);
  const cast = (input.characterNames?.length ? input.characterNames : input.castNames) || [];
  if (cast.length) facts.push(`Featuring ${cast.slice(0, 4).join(', ')}`);
  if (input.credits?.length) facts.push(input.credits.slice(0, 2).join(' · '));

  return { summary, themes, tone, keyMoments, contentNotes, facts };
}

export interface RelatedCandidate {
  id: string; genre?: string; tags?: string[]; worldId?: string; ownerId?: string; artist?: string;
}

/** Higher = more alike. Same world is the strongest signal, then genre, maker, tags. */
export function relatedScore(base: RelatedCandidate, c: RelatedCandidate): number {
  if (!c.id || c.id === base.id) return 0;
  let s = 0;
  if (base.worldId && c.worldId === base.worldId) s += 6;
  if (base.ownerId && c.ownerId === base.ownerId) s += 3;
  if (base.genre && c.genre && base.genre.toLowerCase() === c.genre.toLowerCase()) s += 4;
  const bt = new Set((base.tags || []).map(t => t.toLowerCase()));
  for (const t of c.tags || []) if (bt.has(t.toLowerCase())) s += 1.5;
  return s;
}
