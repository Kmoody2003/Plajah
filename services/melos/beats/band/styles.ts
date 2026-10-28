// Chora Session Band — the genres the band knows, written as the idioms a working player carries
// in their hands: the drum groove (one char per 16th: x accent, o hit, g ghost, . rest), how the
// bass moves, how the chords are comped, which scale the soloists reach for, how the orchestra
// sits, the swing, and who's on the bandstand by default. Pure data + a couple of lookups.

import type { BandRole } from './roster';

export type BassStyle = 'root8' | 'rootFifth' | 'walking' | 'funk' | '808' | 'reggae' | 'tumbao' | 'melodic' | 'house' | 'sustain' | 'afro';
export type CompStyle = 'block' | 'stabs' | 'strum' | 'arpeggio' | 'montuno' | 'skank' | 'gospel' | 'pad' | 'chop' | 'swing' | 'bossa' | 'power';
export type LeadScale = 'pent' | 'blues' | 'key' | 'dorian' | 'mixolydian' | 'bebop' | 'harmonic';
export type OrchestraStyle = 'pad' | 'ostinato' | 'stabs' | 'tremolo';
export type DrumVoice = 'kick' | 'snare' | 'ghost' | 'hatC' | 'hatO' | 'ride' | 'crash' | 'rim' | 'clap' | 'tomH' | 'tomL' | 'shaker';

export interface GenreStyle {
  id: string;
  label: string;
  /** 0 straight … 1 full triplet swing, applied on the `swingGrid` offbeats. */
  swing: number;
  swingGrid: 8 | 16;
  /** 16-step grids for a 4/4 bar (other meters wrap the grid). */
  drums: Partial<Record<DrumVoice, string>>;
  bass: BassStyle;
  comp: CompStyle;
  lead: LeadScale;
  /** How far chords are extended: triads … 7ths … 9ths/11ths/13ths. */
  color: 0 | 1 | 2 | 3;
  orchestra: OrchestraStyle;
  /** Where the band sits by default (0 calm … 1 driving). */
  energy: number;
  tempo: [number, number];
  /** Who's on the bandstand when you pick this genre (others can be called in). */
  lineup: BandRole[];
  /** Words that select it in a direction ("make it gospel"). */
  words: RegExp;
}

export const GENRES: GenreStyle[] = [
  { id: 'pop', label: 'Pop', swing: 0, swingGrid: 16, color: 1, orchestra: 'pad', energy: 0.55, tempo: [90, 128],
    drums: { kick: 'x.......x.x.....', snare: '....x.......x...', hatC: 'o.o.o.o.o.o.o.o.' },
    bass: 'root8', comp: 'block', lead: 'key', lineup: ['drums', 'bass', 'piano', 'guitar', 'synth'], words: /\bpop\b/i },
  { id: 'rock', label: 'Rock', swing: 0, swingGrid: 8, color: 0, orchestra: 'stabs', energy: 0.7, tempo: [100, 150],
    drums: { kick: 'x.....x.x.......', snare: '....x.......x...', hatC: 'x.o.x.o.x.o.x.o.' },
    bass: 'root8', comp: 'power', lead: 'blues', lineup: ['drums', 'bass', 'guitar', 'organ'], words: /\brock\b|\barena\b|\bgrunge\b/i },
  { id: 'metal', label: 'Metal', swing: 0, swingGrid: 16, color: 0, orchestra: 'stabs', energy: 0.9, tempo: [120, 190],
    drums: { kick: 'x.x.x.x.x.x.x.x.', snare: '....x.......x...', ride: 'x...x...x...x...' },
    bass: 'root8', comp: 'power', lead: 'harmonic', lineup: ['drums', 'bass', 'guitar'], words: /\bmetal\b|\bthrash\b|\bdjent\b/i },
  { id: 'funk', label: 'Funk', swing: 0.18, swingGrid: 16, color: 2, orchestra: 'stabs', energy: 0.72, tempo: [92, 118],
    drums: { kick: 'x.....x...x..x..', snare: '....x..g.g..x..g', hatC: 'xoxoxoxoxoxoxoxo' },
    bass: 'funk', comp: 'chop', lead: 'dorian', lineup: ['drums', 'bass', 'guitar', 'organ', 'trumpet', 'sax', 'percussion'], words: /\bfunk(y)?\b/i },
  { id: 'soul', label: 'Soul / R&B', swing: 0.3, swingGrid: 16, color: 2, orchestra: 'pad', energy: 0.5, tempo: [68, 104],
    drums: { kick: 'x......x..x.....', snare: '....x.......x...', hatC: 'o.o.o.o.o.o.o.o.' },
    bass: 'melodic', comp: 'stabs', lead: 'pent', lineup: ['drums', 'bass', 'piano', 'guitar', 'violin', 'cello'], words: /\bsoul\b|\br\s?&\s?b\b|\brnb\b|\bmotown\b/i },
  { id: 'neosoul', label: 'Neo-soul', swing: 0.55, swingGrid: 16, color: 3, orchestra: 'pad', energy: 0.45, tempo: [72, 96],
    drums: { kick: 'x......x..x..x..', snare: '....x.......x...', hatC: 'o.o.o.o.o.o.o.o.' },
    bass: 'melodic', comp: 'pad', lead: 'dorian', lineup: ['drums', 'bass', 'piano', 'guitar', 'synth'], words: /\bneo[- ]?soul\b|\bdilla\b|\blo[- ]?fi\b/i },
  { id: 'gospel', label: 'Gospel', swing: 0.35, swingGrid: 16, color: 3, orchestra: 'pad', energy: 0.7, tempo: [70, 130],
    drums: { kick: 'x.....x...x..x..', snare: '....x..g....x.g.', hatC: 'xoxoxoxoxoxoxoxo' },
    bass: 'melodic', comp: 'gospel', lead: 'pent', lineup: ['drums', 'bass', 'organ', 'piano', 'synth'], words: /\bgospel\b|\bchurch\b|\bpraise\b|\bshout\b|\bworship\b/i },
  { id: 'jazz', label: 'Jazz (swing)', swing: 1, swingGrid: 8, color: 2, orchestra: 'pad', energy: 0.5, tempo: [100, 240],
    drums: { ride: 'x...x.o.x...x.o.', hatC: '....o.......o...', kick: 'g...g...g...g...' },
    bass: 'walking', comp: 'swing', lead: 'bebop', lineup: ['drums', 'bass', 'piano', 'sax', 'trumpet'], words: /\bjazz\b|\bswing\b|\bbebop\b|\bbig band\b/i },
  { id: 'blues', label: 'Blues shuffle', swing: 1, swingGrid: 8, color: 1, orchestra: 'pad', energy: 0.55, tempo: [70, 130],
    drums: { kick: 'x.......x.......', snare: '....x.......x...', hatC: 'o.o.o.o.o.o.o.o.' },
    bass: 'walking', comp: 'strum', lead: 'blues', lineup: ['drums', 'bass', 'guitar', 'piano', 'organ', 'sax'], words: /\bblues\b|\bshuffle\b/i },
  { id: 'hiphop', label: 'Hip-hop (boom bap)', swing: 0.45, swingGrid: 16, color: 2, orchestra: 'stabs', energy: 0.55, tempo: [80, 98],
    drums: { kick: 'x......x..x.....', snare: '....x.......x...', hatC: 'o.o.o.o.o.o.o.o.' },
    bass: 'funk', comp: 'stabs', lead: 'dorian', lineup: ['drums', 'bass', 'piano', 'synth'], words: /\bhip[- ]?hop\b|\bboom[- ]?bap\b|\brap\b/i },
  { id: 'trap', label: 'Trap', swing: 0, swingGrid: 16, color: 1, orchestra: 'stabs', energy: 0.6, tempo: [130, 160],
    drums: { kick: 'x.......x..x....', clap: '........x.......', hatC: 'oooooooooooooooo' },
    bass: '808', comp: 'arpeggio', lead: 'harmonic', lineup: ['drums', 'bass', 'synth', 'piano'], words: /\btrap\b|\bdrill\b|\b808s?\b/i },
  { id: 'house', label: 'House / EDM', swing: 0.1, swingGrid: 16, color: 2, orchestra: 'stabs', energy: 0.75, tempo: [118, 130],
    drums: { kick: 'x...x...x...x...', clap: '....x.......x...', hatO: '..o...o...o...o.', hatC: 'o.o.o.o.o.o.o.o.' },
    bass: 'house', comp: 'stabs', lead: 'key', lineup: ['drums', 'bass', 'synth', 'piano'], words: /\bhouse\b|\bedm\b|\bdance\b|\bclub\b|\btechno\b|\bdisco\b/i },
  { id: 'reggae', label: 'Reggae (one drop)', swing: 0.35, swingGrid: 8, color: 1, orchestra: 'pad', energy: 0.45, tempo: [66, 90],
    drums: { kick: '........x.......', rim: '........x.......', hatC: 'o.o.o.o.o.o.o.o.' },
    bass: 'reggae', comp: 'skank', lead: 'pent', lineup: ['drums', 'bass', 'guitar', 'organ', 'percussion'], words: /\breggae\b|\bone drop\b|\bdub\b|\bska\b/i },
  { id: 'salsa', label: 'Salsa / Afro-Cuban', swing: 0, swingGrid: 16, color: 1, orchestra: 'stabs', energy: 0.75, tempo: [160, 210],
    drums: { rim: 'x..x..x...x.x...', ride: 'x...x...x...x...', kick: '...x.......x....' },
    bass: 'tumbao', comp: 'montuno', lead: 'key', lineup: ['percussion', 'bass', 'piano', 'trumpet', 'drums'], words: /\bsalsa\b|\blatin\b|\bclave\b|\bmambo\b|\bson\b|\bafro[- ]?cuban\b/i },
  { id: 'bossa', label: 'Bossa nova', swing: 0, swingGrid: 16, color: 2, orchestra: 'pad', energy: 0.35, tempo: [110, 140],
    drums: { kick: 'x.....x.x.....x.', rim: 'x..x..x...x..x..', hatC: 'o.o.o.o.o.o.o.o.' },
    bass: 'rootFifth', comp: 'bossa', lead: 'key', lineup: ['drums', 'bass', 'guitar', 'woodwinds', 'percussion'], words: /\bbossa\b|\bsamba\b|\bbrazil/i },
  { id: 'afrobeat', label: 'Afrobeat', swing: 0.12, swingGrid: 16, color: 1, orchestra: 'stabs', energy: 0.7, tempo: [100, 125],
    drums: { kick: 'x.....x...x..x..', snare: '....x..g.g..x..g', hatC: 'xoxoxoxoxoxoxoxo', hatO: '..o...o...o...o.' },
    bass: 'afro', comp: 'chop', lead: 'dorian', lineup: ['drums', 'percussion', 'bass', 'guitar', 'organ', 'trumpet', 'sax'], words: /\bafro[- ]?beats?\b|\bafrobeat\b|\bhighlife\b|\bamapiano\b/i },
  { id: 'country', label: 'Country', swing: 0.1, swingGrid: 8, color: 0, orchestra: 'pad', energy: 0.55, tempo: [90, 140],
    drums: { kick: 'x.......x.......', snare: '....x.......x...', hatC: 'o.o.o.o.o.o.o.o.' },
    bass: 'rootFifth', comp: 'strum', lead: 'pent', lineup: ['drums', 'bass', 'guitar', 'violin', 'piano'], words: /\bcountry\b|\bbluegrass\b|\bfolk\b|\bamericana\b|\bceltic\b/i },
  { id: 'ballad', label: 'Ballad', swing: 0, swingGrid: 8, color: 2, orchestra: 'pad', energy: 0.3, tempo: [60, 84],
    drums: { kick: 'x.......x.......', rim: '....x.......x...', hatC: 'o.o.o.o.o.o.o.o.' },
    bass: 'sustain', comp: 'arpeggio', lead: 'key', lineup: ['piano', 'bass', 'drums', 'cello', 'violin'], words: /\bballad\b|\bslow jam\b|\btender\b/i },
  { id: 'cinematic', label: 'Cinematic', swing: 0, swingGrid: 8, color: 1, orchestra: 'ostinato', energy: 0.6, tempo: [70, 130],
    drums: { tomL: 'x.......x.....x.', tomH: '............x...' },
    bass: 'sustain', comp: 'pad', lead: 'harmonic', lineup: ['orchestra', 'cello', 'percussion', 'piano', 'synth'], words: /\bcinematic\b|\bfilm\b|\bscore\b|\btrailer\b|\bepic\b/i },
  { id: 'classical', label: 'Classical', swing: 0, swingGrid: 8, color: 1, orchestra: 'pad', energy: 0.4, tempo: [60, 140],
    drums: {},
    bass: 'sustain', comp: 'arpeggio', lead: 'key', lineup: ['orchestra', 'violin', 'cello', 'woodwinds', 'piano'], words: /\bclassical\b|\borchestral\b|\bbaroque\b|\bsymphon/i },
];

export const genreById = (id: string | undefined): GenreStyle => GENRES.find((g) => g.id === id) ?? GENRES[0];

/** A genre named in free text ("let's take it to church" → gospel), or undefined. */
export function genreInText(text: string): GenreStyle | undefined {
  return GENRES.find((g) => g.words.test(text));
}

/** Scale pitch classes (relative to a tonic) for each lead scale. */
export const LEAD_SCALES: Record<Exclude<LeadScale, 'key'>, number[]> = {
  pent: [0, 2, 4, 7, 9],
  blues: [0, 3, 5, 6, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  bebop: [0, 2, 4, 5, 7, 9, 10, 11],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
};
