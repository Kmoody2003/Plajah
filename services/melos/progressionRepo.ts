// progressionRepo — the browsable/queryable layer over theory.ts's chord + progression data. One place
// the Virtual Composer AND a browse UI pull from, so "what progressions do we have, by genre" has a
// single answer. Adds genre tags (the raw Progression only implies genre via `heardIn`), search, facets,
// realise-to-chords, and a seeded picker. See docs/MELOS_COUNCIL_AND_COMPOSER.md (repository = P0).

import { PROGRESSIONS, realiseProgression, type Progression } from './theory';

export type Genre =
  | 'pop' | 'rock' | 'jazz' | 'blues' | 'electronic' | 'hiphop'
  | 'soul' | 'gospel' | 'rnb' | 'cinematic' | 'classical' | 'folk' | 'latin' | 'afro';

/** Curated genre tags per progression id (a progression can belong to several families). Keyed by the
 *  ids in theory.ts PROGRESSIONS — kept here, not on the data, so theory.ts stays teaching-focused. */
export const PROGRESSION_TAGS: Record<string, Genre[]> = {
  pop: ['pop', 'rock'],
  'sad-pop': ['pop', 'rnb'],
  'ii-v-i': ['jazz'],
  blues12: ['blues', 'rock'],
  house: ['electronic'],
  amapiano: ['electronic', 'afro'],
  'future-bass': ['electronic', 'pop'],
  'epic-minor': ['electronic', 'cinematic'],
  'trap-minor': ['hiphop'],
  lofi: ['hiphop', 'jazz', 'soul'],
  synthwave: ['electronic', 'cinematic'],
  andalusian: ['classical', 'rock', 'latin'],
  canon: ['classical', 'pop'],
  'doo-wop': ['pop', 'soul', 'rock'],
  rock3: ['rock', 'blues', 'folk'],
  'optimistic-axis': ['pop'],
  'rhythm-changes': ['jazz'],
  gospel: ['gospel', 'soul'],
  'neo-soul': ['soul', 'rnb', 'jazz'],
  'minor-251': ['jazz'],
  circle5: ['jazz', 'classical'],
  deceptive: ['cinematic', 'classical', 'pop'],
  plagal: ['gospel', 'classical', 'folk'],
  'prog-house': ['electronic'],
  'rnb-jam': ['rnb', 'soul'],
  'cinematic-min': ['cinematic'],
  bossa: ['jazz', 'latin'],
  phrygian: ['cinematic', 'rock', 'latin'],
  anthem: ['rock', 'gospel'],
  'dream-pop': ['pop', 'rock'],
  afroswing: ['afro', 'hiphop', 'electronic'],
  drill: ['hiphop'],
};

export const ALL_GENRES: Genre[] = ['pop', 'rock', 'jazz', 'blues', 'electronic', 'hiphop', 'soul', 'gospel', 'rnb', 'cinematic', 'classical', 'folk', 'latin', 'afro'];

/** Genres a progression is tagged with (empty array if untagged — never throws). */
export function tagsFor(id: string): Genre[] { return PROGRESSION_TAGS[id] || []; }

/** Every progression, optionally with its genres attached. */
export function allProgressions(): Array<Progression & { genres: Genre[] }> {
  return PROGRESSIONS.map((p) => ({ ...p, genres: tagsFor(p.id) }));
}

/** Progressions tagged with a genre. */
export function progressionsByGenre(genre: Genre): Progression[] {
  return PROGRESSIONS.filter((p) => tagsFor(p.id).includes(genre));
}

export function progressionsByMode(mode: 'major' | 'minor'): Progression[] {
  return PROGRESSIONS.filter((p) => p.mode === mode);
}

/** Free-text search across name, character, heardIn, and genre tags. */
export function searchProgressions(query: string): Progression[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...PROGRESSIONS];
  return PROGRESSIONS.filter((p) =>
    p.name.toLowerCase().includes(q) ||
    p.character.toLowerCase().includes(q) ||
    p.heardIn.toLowerCase().includes(q) ||
    tagsFor(p.id).some((g) => g.includes(q)),
  );
}

/** Genre facets with counts — for a browse UI's filter rail. Only genres that have entries appear. */
export function genreFacets(): Array<{ genre: Genre; count: number }> {
  return ALL_GENRES
    .map((genre) => ({ genre, count: progressionsByGenre(genre).length }))
    .filter((f) => f.count > 0)
    .sort((a, b) => b.count - a.count);
}

export function getProgression(id: string): Progression | undefined {
  return PROGRESSIONS.find((p) => p.id === id);
}

/** Realise a progression by id into concrete diatonic chords in a key (rootPc 0=C…11=B). */
export function realiseById(id: string, rootPc: number, seventh = false) {
  const prog = getProgression(id);
  return prog ? realiseProgression(prog, rootPc, seventh) : null;
}

/** Deterministic pick when a seed is given (reproducible suggestions), else random. Optionally scoped to
 *  a genre and/or mode. Returns null if nothing matches. */
export function pickProgression(opts: { genre?: Genre; mode?: 'major' | 'minor'; seed?: number } = {}): Progression | null {
  let pool = PROGRESSIONS;
  if (opts.genre) pool = pool.filter((p) => tagsFor(p.id).includes(opts.genre!));
  if (opts.mode) pool = pool.filter((p) => p.mode === opts.mode);
  if (!pool.length) return null;
  const seed = opts.seed ?? Math.floor(Math.random() * 1e9);
  // xorshift-ish deterministic index from the seed
  let x = (seed | 0) || 1; x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  return pool[Math.abs(x) % pool.length];
}

/** Coverage check for tooling/tests: every progression should carry at least one genre tag. */
export function untaggedProgressionIds(): string[] {
  return PROGRESSIONS.filter((p) => tagsFor(p.id).length === 0).map((p) => p.id);
}
