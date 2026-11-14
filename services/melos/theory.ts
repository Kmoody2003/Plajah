// The shared music-theory engine.
//
// One deliberate bet runs through this file: **the code that stops a beginner playing a wrong
// note is the same code that explains to a student why it was wrong.** So nothing here returns
// bare numbers — every result carries the name, the degree and the function alongside it, and
// the teaching surfaces in Academia read the same objects the instruments do.
//
// Extends the smaller helpers already in services/guidedListening.ts (pitchClassOf, noteName,
// diatonicChords) rather than replacing them; that file analyses recordings, this one is the
// generative/performance side.

export const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export const midiToName = (midi: number, flats = false): string => {
  const pc = ((midi % 12) + 12) % 12;
  return `${(flats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP)[pc]}${Math.floor(midi / 12) - 1}`;
};
export const pcName = (pc: number, flats = false): string =>
  (flats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP)[((pc % 12) + 12) % 12];
export const nameToPc = (name: string): number => {
  const i = NOTE_NAMES_SHARP.indexOf(name);
  if (i >= 0) return i;
  const j = NOTE_NAMES_FLAT.indexOf(name);
  return j >= 0 ? j : 0;
};

// ── Scales ───────────────────────────────────────────────────────────────────
// Intervals in semitones from the root. Ordered so the picker reads as a journey from
// "safest for a first-timer" to "you know what you're doing".

export interface ScaleDef {
  id: string;
  name: string;
  intervals: number[];
  /** Why a human would pick this — shown under the name, and used verbatim in lessons. */
  character: string;
  /** Beginner-safe scales are surfaced first: fewer notes, harder to sound wrong. */
  tier: 'easy' | 'core' | 'colour';
  /** Degree names for the teaching overlay (parallel to `intervals`). */
  degrees?: string[];
  /** Picker group (SCALE_FAMILIES). Absent on the original fifteen, which FAMILY_OF places. */
  family?: ScaleFamily;
}

export type ScaleFamily = 'common' | 'modes' | 'minor' | 'symmetric' | 'jazz' | 'world';
/** Picker groups, in the order the menus show them. */
export const SCALE_FAMILIES: { id: ScaleFamily; name: string }[] = [
  { id: 'common', name: 'Common' },
  { id: 'modes', name: 'Church modes' },
  { id: 'minor', name: 'Melodic + harmonic families' },
  { id: 'jazz', name: 'Jazz + bebop' },
  { id: 'symmetric', name: 'Symmetric' },
  { id: 'world', name: 'World + exotic' },
];
const FAMILY_OF: Record<string, ScaleFamily> = {
  'major-pent': 'common', 'minor-pent': 'common', blues: 'common', major: 'common', minor: 'common', chromatic: 'common',
  dorian: 'modes', mixolydian: 'modes', phrygian: 'modes', lydian: 'modes', locrian: 'modes',
  'harmonic-minor': 'minor', 'whole-tone': 'symmetric', hirajoshi: 'world',
};
/** A scale's picker group. */
export const scaleFamily = (s: ScaleDef): ScaleFamily => s.family ?? FAMILY_OF[s.id] ?? 'world';

// Compact table form for the extended library. Twelve-tone approximations are named as such: a
// maqam or raga's real intonation lies between these keys, and the character line says so.
const sc = (family: ScaleFamily, id: string, name: string, intervals: number[], character: string): ScaleDef =>
  ({ id, name, intervals, character, tier: 'colour', family });

export const SCALES: ScaleDef[] = [
  { id: 'major-pent', name: 'Major pentatonic', intervals: [0, 2, 4, 7, 9], tier: 'easy',
    character: 'Five notes that agree with almost anything. The safest place to start.',
    degrees: ['1', '2', '3', '5', '6'] },
  { id: 'minor-pent', name: 'Minor pentatonic', intervals: [0, 3, 5, 7, 10], tier: 'easy',
    character: 'The sound of nearly every guitar solo you have ever heard.',
    degrees: ['1', '♭3', '4', '5', '♭7'] },
  { id: 'blues', name: 'Blues', intervals: [0, 3, 5, 6, 7, 10], tier: 'easy',
    character: 'Minor pentatonic with the flat five sneaked in — instant grit.',
    degrees: ['1', '♭3', '4', '♭5', '5', '♭7'] },
  { id: 'major', name: 'Major', intervals: [0, 2, 4, 5, 7, 9, 11], tier: 'core',
    character: 'Bright and resolved. The reference every other scale is described against.',
    degrees: ['1', '2', '3', '4', '5', '6', '7'] },
  { id: 'minor', name: 'Natural minor', intervals: [0, 2, 3, 5, 7, 8, 10], tier: 'core',
    character: 'Serious, weighty, the default for most dance and hip-hop.',
    degrees: ['1', '2', '♭3', '4', '5', '♭6', '♭7'] },
  { id: 'dorian', name: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10], tier: 'core',
    character: 'Minor with a raised sixth — hopeful rather than sad. House and amapiano live here.',
    degrees: ['1', '2', '♭3', '4', '5', '6', '♭7'] },
  { id: 'mixolydian', name: 'Mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10], tier: 'core',
    character: 'Major with a flat seventh. Funk, gospel and anything that wants to groove.',
    degrees: ['1', '2', '3', '4', '5', '6', '♭7'] },
  { id: 'harmonic-minor', name: 'Harmonic minor', intervals: [0, 2, 3, 5, 7, 8, 11], tier: 'colour',
    character: 'Minor with a leading tone. That leap from ♭6 to 7 is the whole flavour.',
    degrees: ['1', '2', '♭3', '4', '5', '♭6', '7'] },
  { id: 'phrygian', name: 'Phrygian', intervals: [0, 1, 3, 5, 7, 8, 10], tier: 'colour',
    character: 'Flat second. Dark, Spanish, and it announces itself immediately.',
    degrees: ['1', '♭2', '♭3', '4', '5', '♭6', '♭7'] },
  { id: 'lydian', name: 'Lydian', intervals: [0, 2, 4, 6, 7, 9, 11], tier: 'colour',
    character: 'Major with a sharp fourth — the floating, film-score major.',
    degrees: ['1', '2', '3', '#4', '5', '6', '7'] },
  { id: 'locrian', name: 'Locrian', intervals: [0, 1, 3, 5, 6, 8, 10], tier: 'colour',
    character: 'Unstable by construction: even its home chord is diminished.',
    degrees: ['1', '♭2', '♭3', '4', '♭5', '♭6', '♭7'] },
  { id: 'whole-tone', name: 'Whole tone', intervals: [0, 2, 4, 6, 8, 10], tier: 'colour',
    character: 'Every step the same size, so nothing pulls anywhere. Weightless.',
    degrees: ['1', '2', '3', '#4', '#5', '#6'] },
  { id: 'hirajoshi', name: 'Hirajoshi', intervals: [0, 2, 3, 7, 8], tier: 'colour',
    character: 'A Japanese pentatonic — wide gaps, very little sounds wrong.',
    degrees: ['1', '2', '♭3', '5', '♭6'] },
  { id: 'chromatic', name: 'Chromatic', intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], tier: 'colour',
    character: 'Every note. No guard rails — the setting for when you want none.',
    degrees: ['1', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♭6', '6', '♭7', '7'] },
  // ── Extended library. Ids are saved in projects: append, never rename. ──
  sc('common', 'blues-major', 'Major blues', [0, 2, 3, 4, 7, 9], 'Major pentatonic with the flat third sliding up — country, gospel, soul.'),
  sc('common', 'dominant-pent', 'Dominant pentatonic', [0, 2, 4, 7, 10], 'Five notes that sit over any dominant seventh.'),
  sc('common', 'minor-hexatonic', 'Minor hexatonic', [0, 2, 3, 5, 7, 10], 'Natural minor without the sixth, so it never clashes.'),
  sc('common', 'major-hexatonic', 'Major hexatonic', [0, 2, 4, 5, 7, 9], 'Major without the leading tone — folk-song calm.'),
  sc('minor', 'melodic-minor', 'Melodic minor', [0, 2, 3, 5, 7, 9, 11], 'Minor with both top notes raised: smooth, modern, jazz-school minor.'),
  sc('minor', 'dorian-b2', 'Dorian ♭2', [0, 1, 3, 5, 7, 9, 10], 'Second mode of melodic minor: dorian with a dark first step.'),
  sc('minor', 'lydian-augmented', 'Lydian augmented', [0, 2, 4, 6, 8, 9, 11], 'Third mode of melodic minor: lydian lifted further still.'),
  sc('minor', 'lydian-dominant', 'Lydian dominant', [0, 2, 4, 6, 7, 9, 10], 'Fourth mode of melodic minor: a dominant that floats.'),
  sc('minor', 'mixolydian-b6', 'Mixolydian ♭6', [0, 2, 4, 5, 7, 8, 10], 'Fifth mode of melodic minor: major that turns bittersweet.'),
  sc('minor', 'locrian-n2', 'Locrian ♮2', [0, 2, 3, 5, 6, 8, 10], 'Sixth mode of melodic minor: the sound of a half-diminished chord.'),
  sc('minor', 'altered', 'Altered (super locrian)', [0, 1, 3, 4, 6, 8, 10], 'Seventh mode of melodic minor: every tension at once over a dominant.'),
  sc('minor', 'locrian-n6', 'Locrian ♮6', [0, 1, 3, 5, 6, 9, 10], 'Second mode of harmonic minor.'),
  sc('minor', 'ionian-augmented', 'Ionian ♯5', [0, 2, 4, 5, 8, 9, 11], 'Third mode of harmonic minor: major with a raised fifth.'),
  sc('minor', 'dorian-s4', 'Dorian ♯4', [0, 2, 3, 6, 7, 9, 10], 'Fourth mode of harmonic minor; Romanian minor in folk music.'),
  sc('minor', 'phrygian-dominant', 'Phrygian dominant', [0, 1, 4, 5, 7, 8, 10], 'Fifth mode of harmonic minor: Freygish, flamenco, Hijaz in twelve tones.'),
  sc('minor', 'lydian-s2', 'Lydian ♯2', [0, 3, 4, 6, 7, 9, 11], 'Sixth mode of harmonic minor.'),
  sc('minor', 'ultralocrian', 'Ultralocrian', [0, 1, 3, 4, 6, 8, 9], 'Seventh mode of harmonic minor: as unstable as a scale gets.'),
  sc('minor', 'harmonic-major', 'Harmonic major', [0, 2, 4, 5, 7, 8, 11], 'Major with a flat sixth: bright with a shadow across it.'),
  sc('minor', 'double-harmonic', 'Double harmonic', [0, 1, 4, 5, 7, 8, 11], 'Two leading-tone leaps: Byzantine, Arabic, Bhairav.'),
  sc('minor', 'neapolitan-major', 'Neapolitan major', [0, 1, 3, 5, 7, 9, 11], 'Flat second over a melodic-minor top.'),
  sc('minor', 'neapolitan-minor', 'Neapolitan minor', [0, 1, 3, 5, 7, 8, 11], 'Flat second over a harmonic-minor top.'),
  sc('jazz', 'bebop-dominant', 'Bebop dominant', [0, 2, 4, 5, 7, 9, 10, 11], 'Mixolydian with a passing tone, so eighth-note lines land chord tones on the beat.'),
  sc('jazz', 'bebop-major', 'Bebop major', [0, 2, 4, 5, 7, 8, 9, 11], 'Major with a passing ♯5.'),
  sc('jazz', 'bebop-minor', 'Bebop minor', [0, 2, 3, 5, 7, 8, 9, 10], 'Dorian with a passing ♭6.'),
  sc('jazz', 'bebop-dorian', 'Bebop dorian', [0, 2, 3, 4, 5, 7, 9, 10], 'Dorian with a passing major third.'),
  sc('jazz', 'bebop-melodic-minor', 'Bebop melodic minor', [0, 2, 3, 5, 7, 8, 9, 11], 'Melodic minor with a passing ♭6.'),
  sc('jazz', 'half-whole', 'Half-whole diminished', [0, 1, 3, 4, 6, 7, 9, 10], 'The dominant diminished scale: colour over a 13♭9 chord.'),
  sc('jazz', 'lydian-pent', 'Lydian pentatonic', [0, 4, 6, 7, 11], 'Five notes of pure major-seven-sharp-eleven.'),
  sc('jazz', 'altered-pent', 'Altered pentatonic', [0, 1, 4, 6, 10], 'Five notes that outline an altered dominant.'),
  sc('symmetric', 'diminished', 'Diminished (whole-half)', [0, 2, 3, 5, 6, 8, 9, 11], 'Repeats every minor third, so it can pivot to four different keys.'),
  sc('symmetric', 'augmented', 'Augmented', [0, 3, 4, 7, 8, 11], 'Two augmented triads interlocked. Repeats every major third.'),
  sc('symmetric', 'tritone', 'Tritone', [0, 1, 4, 6, 7, 10], 'Two major triads a tritone apart — the Petrushka chord as a scale.'),
  sc('symmetric', 'two-semitone-tritone', 'Two-semitone tritone', [0, 1, 2, 6, 7, 8], 'Clusters a tritone apart. Tense and mechanical.'),
  sc('symmetric', 'messiaen-3', 'Messiaen mode 3', [0, 2, 3, 4, 6, 7, 8, 10, 11], 'A mode of limited transposition: lush and slowly turning.'),
  sc('symmetric', 'messiaen-4', 'Messiaen mode 4', [0, 1, 2, 5, 6, 7, 8, 11], 'A mode of limited transposition with clustered colour.'),
  sc('symmetric', 'messiaen-5', 'Messiaen mode 5', [0, 1, 5, 6, 7, 11], 'A mode of limited transposition, stark and bell-like.'),
  sc('symmetric', 'messiaen-6', 'Messiaen mode 6', [0, 2, 4, 5, 6, 8, 10, 11], 'A mode of limited transposition near the whole-tone scale.'),
  sc('symmetric', 'messiaen-7', 'Messiaen mode 7', [0, 1, 2, 3, 5, 6, 7, 8, 9, 11], 'The densest mode of limited transposition.'),
  sc('world', 'hungarian-minor', 'Hungarian minor', [0, 2, 3, 6, 7, 8, 11], 'Harmonic minor with a raised fourth — two augmented seconds, very dramatic.'),
  sc('world', 'hungarian-major', 'Hungarian major', [0, 3, 4, 6, 7, 9, 10], 'A dominant colour with an opening leap.'),
  sc('world', 'romanian-major', 'Romanian major', [0, 1, 4, 6, 7, 9, 10], 'A Balkan major with a flat second.'),
  sc('world', 'spanish-8', 'Spanish eight-tone', [0, 1, 3, 4, 5, 6, 8, 10], 'Phrygian with both thirds — flamenco guitar vocabulary.'),
  sc('world', 'persian', 'Persian', [0, 1, 4, 5, 6, 8, 11], 'A twelve-tone sketch of Persian modal colour, with a flat fifth.'),
  sc('world', 'arabic-hijaz', 'Maqam Hijaz (12-TET)', [0, 1, 4, 5, 7, 8, 10], 'Hijaz on the piano keys; the real maqam bends its intervals between them.'),
  sc('world', 'arabic-nahawand', 'Maqam Nahawand (12-TET)', [0, 2, 3, 5, 7, 8, 11], 'The Arabic relative of harmonic minor.'),
  sc('world', 'arabic-kurd', 'Maqam Kurd (12-TET)', [0, 1, 3, 5, 7, 8, 10], 'A flat-second minor maqam; phrygian in twelve tones.'),
  sc('world', 'arabic-ajam', 'Maqam Ajam (12-TET)', [0, 2, 4, 5, 7, 9, 11], 'The Arabic major.'),
  sc('world', 'arabic-saba', 'Maqam Saba (12-TET)', [0, 2, 3, 4, 7, 8, 10], 'A sorrowful maqam approximated with a lowered fourth.'),
  sc('world', 'arabic-bayati', 'Maqam Bayati (12-TET)', [0, 2, 3, 5, 7, 8, 10], 'Its neutral second has no piano key; this is the nearest twelve-tone spelling.'),
  sc('world', 'arabic-rast', 'Maqam Rast (12-TET)', [0, 2, 4, 5, 7, 9, 10], 'Its neutral third and seventh are approximated on the keys.'),
  sc('world', 'byzantine', 'Byzantine', [0, 1, 4, 5, 7, 8, 11], 'The same notes as the double harmonic, used in Orthodox chant.'),
  sc('world', 'ahava-rabbah', 'Ahava Rabbah', [0, 1, 4, 5, 7, 8, 10], 'The klezmer and cantorial Freygish mode.'),
  sc('world', 'misheberach', 'Mi Sheberach', [0, 2, 3, 6, 7, 9, 10], 'The Ukrainian Dorian of klezmer.'),
  sc('world', 'gypsy', 'Gypsy minor', [0, 2, 3, 6, 7, 8, 10], 'Minor with a raised fourth and a soft seventh.'),
  sc('world', 'enigmatic', 'Enigmatic', [0, 1, 4, 6, 8, 10, 11], 'Verdi’s puzzle scale: whole tones with a leading-tone twist.'),
  sc('world', 'prometheus', 'Prometheus', [0, 2, 4, 6, 9, 10], 'Scriabin’s mystic chord spread into a scale.'),
  sc('world', 'raga-bhairav', 'Raga Bhairav (12-TET)', [0, 1, 4, 5, 7, 8, 11], 'The dawn raga; the same pitch set as the double harmonic.'),
  sc('world', 'raga-todi', 'Raga Todi (12-TET)', [0, 1, 3, 6, 7, 8, 11], 'A grave morning raga with a sharp fourth.'),
  sc('world', 'raga-purvi', 'Raga Purvi (12-TET)', [0, 1, 4, 6, 7, 8, 11], 'A sunset raga: both flat second and sharp fourth.'),
  sc('world', 'raga-marwa', 'Raga Marwa (12-TET)', [0, 1, 4, 6, 7, 9, 11], 'A twilight raga that leans away from the fifth.'),
  sc('world', 'raga-kafi', 'Raga Kafi (12-TET)', [0, 2, 3, 5, 7, 9, 10], 'A folk-rooted raga, dorian in twelve tones.'),
  sc('world', 'raga-bhairavi', 'Raga Bhairavi (12-TET)', [0, 1, 3, 5, 7, 8, 10], 'The closing raga of a concert, phrygian in twelve tones.'),
  sc('world', 'raga-asavari', 'Raga Asavari (12-TET)', [0, 2, 3, 5, 7, 8, 10], 'A late-morning raga, natural minor in twelve tones.'),
  sc('world', 'raga-yaman', 'Raga Yaman (12-TET)', [0, 2, 4, 6, 7, 9, 11], 'The first raga most students learn, lydian in twelve tones.'),
  sc('world', 'raga-khamaj', 'Raga Khamaj (12-TET)', [0, 2, 4, 5, 7, 9, 10], 'Romantic and light, mixolydian in twelve tones.'),
  sc('world', 'raga-malkauns', 'Raga Malkauns (12-TET)', [0, 3, 5, 8, 10], 'A deep pentatonic night raga.'),
  sc('world', 'raga-durga', 'Raga Durga (12-TET)', [0, 2, 5, 7, 9], 'A serene pentatonic raga.'),
  sc('world', 'raga-hamsadhwani', 'Raga Hamsadhwani (12-TET)', [0, 2, 4, 7, 11], 'A bright Carnatic pentatonic.'),
  sc('world', 'in-sen', 'In-sen', [0, 1, 5, 7, 10], 'A Japanese pentatonic with a flat second, spare and austere.'),
  sc('world', 'iwato', 'Iwato', [0, 1, 5, 6, 10], 'The darkest Japanese pentatonic, with a tritone.'),
  sc('world', 'yo', 'Yo', [0, 2, 5, 7, 9], 'The Japanese folk pentatonic, with no semitones.'),
  sc('world', 'kumoi', 'Kumoi', [0, 2, 3, 7, 9], 'A koto tuning with a gentle minor colour.'),
  sc('world', 'ritsu', 'Ritsu', [0, 1, 3, 5, 8, 10], 'A court-music gagaku mode.'),
  sc('world', 'gong', 'Chinese gong', [0, 2, 4, 7, 9], 'The Chinese pentatonic on its first degree.'),
  sc('world', 'shang', 'Chinese shang', [0, 2, 5, 7, 10], 'The Chinese pentatonic on its second degree.'),
  sc('world', 'jue', 'Chinese jue', [0, 3, 5, 8, 10], 'The Chinese pentatonic on its third degree.'),
  sc('world', 'zhi', 'Chinese zhi', [0, 2, 5, 7, 9], 'The Chinese pentatonic on its fourth degree.'),
  sc('world', 'yu', 'Chinese yu', [0, 3, 5, 7, 10], 'The Chinese pentatonic on its fifth degree.'),
  sc('world', 'pelog', 'Pelog (12-TET)', [0, 1, 3, 7, 8], 'Javanese gamelan tuning; real sets are tuned between these keys.'),
  sc('world', 'slendro', 'Slendro (12-TET)', [0, 2, 5, 7, 10], 'Gamelan’s nearly-equal five steps, approximated.'),
  sc('world', 'tezeta-major', 'Tezeta major', [0, 2, 4, 7, 9], 'The Ethiopian qenet of memory and longing.'),
  sc('world', 'tezeta-minor', 'Tezeta minor', [0, 2, 3, 7, 8], 'The minor qenet, heard in Ethiopian jazz.'),
  sc('world', 'bati', 'Bati', [0, 4, 5, 7, 11], 'An Ethiopian qenet with a wide opening.'),
  sc('world', 'ambassel', 'Ambassel', [0, 1, 5, 7, 8], 'An Ethiopian qenet, dark and swaying.'),
  sc('world', 'anchihoye', 'Anchihoye', [0, 1, 5, 6, 9], 'The most angular Ethiopian qenet.'),
  sc('world', 'egyptian', 'Egyptian', [0, 2, 5, 7, 10], 'An old suspended pentatonic with no thirds.'),
  sc('world', 'balinese', 'Balinese', [0, 1, 3, 7, 8], 'A pelog selection from Balinese gamelan.'),
  sc('world', 'mongolian', 'Mongolian', [0, 2, 4, 7, 9], 'The wide-open steppe pentatonic.'),
  sc('world', 'scottish', 'Scottish pentatonic', [0, 2, 5, 7, 9], 'The bagpipe-friendly pentatonic.'),
  sc('world', 'oriental', 'Oriental', [0, 1, 4, 5, 6, 9, 10], 'A heavily chromatic exotic scale with a flat fifth.'),
];

export const scaleById = (id: string): ScaleDef => SCALES.find((s) => s.id === id) || SCALES[3];

/** Pitch classes in a scale, as a fast lookup for the note path. */
export function scalePitchClasses(rootPc: number, scaleId: string): boolean[] {
  const def = scaleById(scaleId);
  const set = new Array(12).fill(false);
  for (const iv of def.intervals) set[((rootPc + iv) % 12 + 12) % 12] = true;
  return set;
}

export type SnapMode = 'off' | 'nearest' | 'up' | 'down';

/**
 * The "you cannot play a wrong note" primitive.
 *
 * Nearest-snapping is what makes a first-timer sound good in ten seconds, and it is also the
 * honest teaching tool: the UI can show the note they pressed AND the note that sounded, so the
 * guard rail teaches instead of hiding.
 */
export function snapToScale(midi: number, rootPc: number, scaleId: string, mode: SnapMode = 'nearest'): number {
  if (mode === 'off' || scaleId === 'chromatic') return midi;
  const inScale = scalePitchClasses(rootPc, scaleId);
  const pc = ((midi % 12) + 12) % 12;
  if (inScale[pc]) return midi;
  if (mode === 'up') {
    for (let d = 1; d <= 12; d++) if (inScale[(pc + d) % 12]) return midi + d;
    return midi;
  }
  if (mode === 'down') {
    for (let d = 1; d <= 12; d++) if (inScale[((pc - d) % 12 + 12) % 12]) return midi - d;
    return midi;
  }
  // Nearest, preferring downward on a tie — a flattened note reads as intentional colour, a
  // sharpened one usually reads as a mistake.
  for (let d = 1; d <= 6; d++) {
    if (inScale[((pc - d) % 12 + 12) % 12]) return midi - d;
    if (inScale[(pc + d) % 12]) return midi + d;
  }
  return midi;
}

// ── Chords ───────────────────────────────────────────────────────────────────

export interface ChordDef {
  id: string;
  name: string;
  symbol: string;
  intervals: number[];
  tier: 'easy' | 'core' | 'colour';
  /** Picker group (CHORD_FAMILIES). Absent on the original sixteen, which CHORD_FAMILY_OF places. */
  family?: ChordFamily;
}

export type ChordFamily = 'triad' | 'sixth' | 'seventh' | 'extended' | 'sus' | 'add' | 'altered';
export const CHORD_FAMILIES: { id: ChordFamily; name: string }[] = [
  { id: 'triad', name: 'Triads' }, { id: 'sixth', name: 'Sixths' }, { id: 'seventh', name: 'Sevenths' },
  { id: 'extended', name: '9ths, 11ths, 13ths' }, { id: 'sus', name: 'Suspended' }, { id: 'add', name: 'Added tones' },
  { id: 'altered', name: 'Altered' },
];
const ch = (family: ChordFamily, id: string, name: string, symbol: string, intervals: number[]): ChordDef =>
  ({ id, name, symbol, intervals, tier: 'colour', family });
const CHORD_FAMILY_OF: Record<string, ChordFamily> = {
  maj: 'triad', min: 'triad', dim: 'triad', aug: 'triad', sus4: 'sus', sus2: 'sus', maj7: 'seventh', min7: 'seventh',
  dom7: 'seventh', dim7: 'seventh', min6: 'sixth', min9: 'extended', maj9: 'extended', dom9: 'extended', min11: 'extended', add9: 'add',
};
/** A chord's picker group. */
export const chordFamily = (c: ChordDef): ChordFamily => c.family ?? CHORD_FAMILY_OF[c.id] ?? 'altered';

export const CHORDS: ChordDef[] = [
  { id: 'maj', name: 'Major', symbol: '', intervals: [0, 4, 7], tier: 'easy' },
  { id: 'min', name: 'Minor', symbol: 'm', intervals: [0, 3, 7], tier: 'easy' },
  { id: 'sus4', name: 'Suspended 4th', symbol: 'sus4', intervals: [0, 5, 7], tier: 'easy' },
  { id: 'sus2', name: 'Suspended 2nd', symbol: 'sus2', intervals: [0, 2, 7], tier: 'easy' },
  { id: 'maj7', name: 'Major 7th', symbol: 'maj7', intervals: [0, 4, 7, 11], tier: 'core' },
  { id: 'min7', name: 'Minor 7th', symbol: 'm7', intervals: [0, 3, 7, 10], tier: 'core' },
  { id: 'dom7', name: 'Dominant 7th', symbol: '7', intervals: [0, 4, 7, 10], tier: 'core' },
  { id: 'dim', name: 'Diminished', symbol: '°', intervals: [0, 3, 6], tier: 'core' },
  { id: 'aug', name: 'Augmented', symbol: '+', intervals: [0, 4, 8], tier: 'colour' },
  { id: 'min9', name: 'Minor 9th', symbol: 'm9', intervals: [0, 3, 7, 10, 14], tier: 'colour' },
  { id: 'maj9', name: 'Major 9th', symbol: 'maj9', intervals: [0, 4, 7, 11, 14], tier: 'colour' },
  { id: 'dom9', name: 'Dominant 9th', symbol: '9', intervals: [0, 4, 7, 10, 14], tier: 'colour' },
  { id: 'min11', name: 'Minor 11th', symbol: 'm11', intervals: [0, 3, 7, 10, 14, 17], tier: 'colour' },
  { id: 'add9', name: 'Add 9', symbol: 'add9', intervals: [0, 4, 7, 14], tier: 'colour' },
  { id: 'min6', name: 'Minor 6th', symbol: 'm6', intervals: [0, 3, 7, 9], tier: 'colour' },
  { id: 'dim7', name: 'Diminished 7th', symbol: '°7', intervals: [0, 3, 6, 9], tier: 'colour' },
  // ── Extended library. Ids are saved in projects: append, never rename. ──
  ch('triad', 'b5', 'Major ♭5', 'M♭5', [0, 4, 6]),
  ch('triad', 'pow', 'Power (no third)', '5', [0, 7]),
  ch('sixth', 'maj6', 'Major 6th', '6', [0, 4, 7, 9]),
  ch('sixth', 'maj69', 'Six-nine', '6/9', [0, 4, 7, 9, 14]),
  ch('sixth', 'min69', 'Minor six-nine', 'm6/9', [0, 3, 7, 9, 14]),
  ch('seventh', 'hdim7', 'Half-diminished', 'ø7', [0, 3, 6, 10]),
  ch('seventh', 'minmaj7', 'Minor-major 7th', 'mMaj7', [0, 3, 7, 11]),
  ch('seventh', 'augmaj7', 'Augmented major 7th', '+Maj7', [0, 4, 8, 11]),
  ch('seventh', 'aug7', 'Augmented 7th', '+7', [0, 4, 8, 10]),
  ch('seventh', 'dimmaj7', 'Diminished major 7th', '°Maj7', [0, 3, 6, 11]),
  ch('extended', 'minmaj9', 'Minor-major 9th', 'mMaj9', [0, 3, 7, 11, 14]),
  ch('extended', 'hdim9', 'Half-diminished 9th', 'ø9', [0, 3, 6, 10, 14]),
  ch('extended', 'maj11', 'Major 11th', 'maj11', [0, 4, 7, 11, 14, 17]),
  ch('extended', 'dom11', 'Dominant 11th', '11', [0, 4, 7, 10, 14, 17]),
  ch('extended', 'maj7s11', 'Major 7♯11', 'maj7♯11', [0, 4, 7, 11, 18]),
  ch('extended', 'maj13', 'Major 13th', 'maj13', [0, 4, 7, 11, 14, 21]),
  ch('extended', 'min13', 'Minor 13th', 'm13', [0, 3, 7, 10, 14, 21]),
  ch('extended', 'dom13', 'Dominant 13th', '13', [0, 4, 7, 10, 14, 21]),
  ch('sus', 'sus24', 'Sus 2 + 4', 'sus2/4', [0, 2, 5, 7]),
  ch('sus', '7sus4', '7 sus 4', '7sus4', [0, 5, 7, 10]),
  ch('sus', '7sus2', '7 sus 2', '7sus2', [0, 2, 7, 10]),
  ch('sus', '9sus4', '9 sus 4', '9sus4', [0, 5, 7, 10, 14]),
  ch('sus', '13sus4', '13 sus 4', '13sus4', [0, 5, 7, 10, 14, 21]),
  ch('sus', 'maj7sus4', 'Major 7 sus 4', 'maj7sus4', [0, 5, 7, 11]),
  ch('add', 'madd9', 'Minor add 9', 'madd9', [0, 3, 7, 14]),
  ch('add', 'add11', 'Add 11', 'add11', [0, 4, 7, 17]),
  ch('add', 'madd11', 'Minor add 11', 'madd11', [0, 3, 7, 17]),
  ch('add', 'adds11', 'Add ♯11', 'add♯11', [0, 4, 7, 18]),
  ch('add', 'add13', 'Add 13', 'add13', [0, 4, 7, 21]),
  ch('altered', '7b5', '7 flat 5', '7♭5', [0, 4, 6, 10]),
  ch('altered', '7b9', '7 flat 9', '7♭9', [0, 4, 7, 10, 13]),
  ch('altered', '7s9', '7 sharp 9 (Hendrix)', '7♯9', [0, 4, 7, 10, 15]),
  ch('altered', '7s11', '7 sharp 11', '7♯11', [0, 4, 7, 10, 18]),
  ch('altered', '7b13', '7 flat 13', '7♭13', [0, 4, 7, 10, 20]),
  ch('altered', '7b5b9', '7 flat 5 flat 9', '7♭5♭9', [0, 4, 6, 10, 13]),
  ch('altered', '7b5s9', '7 flat 5 sharp 9', '7♭5♯9', [0, 4, 6, 10, 15]),
  ch('altered', '7s5b9', '7 sharp 5 flat 9', '7♯5♭9', [0, 4, 8, 10, 13]),
  ch('altered', '7s5s9', '7 sharp 5 sharp 9', '7♯5♯9', [0, 4, 8, 10, 15]),
  ch('altered', '9s11', '9 sharp 11', '9♯11', [0, 4, 7, 10, 14, 18]),
  ch('altered', '9b5', '9 flat 5', '9♭5', [0, 4, 6, 10, 14]),
  ch('altered', '13b9', '13 flat 9', '13♭9', [0, 4, 7, 10, 13, 21]),
  ch('altered', '13s11', '13 sharp 11', '13♯11', [0, 4, 7, 10, 14, 18, 21]),
  ch('altered', 'alt', 'Altered dominant', '7alt', [0, 4, 8, 10, 13, 15]),
];

export const chordById = (id: string): ChordDef => CHORDS.find((c) => c.id === id) || CHORDS[0];

/** Build a chord's MIDI notes, with optional inversion and open voicing. */
export function buildChord(rootMidi: number, chordId: string, inversion = 0, spread = false): number[] {
  const def = chordById(chordId);
  let notes = def.intervals.map((iv) => rootMidi + iv);
  for (let i = 0; i < inversion && notes.length > 1; i++) {
    notes = [...notes.slice(1), notes[0] + 12];
  }
  if (spread && notes.length > 2) {
    // Drop-2: take the second-highest note down an octave. The standard way to stop a close
    // voicing sounding muddy, and it's one line.
    const sorted = [...notes].sort((a, b) => a - b);
    sorted[sorted.length - 2] -= 12;
    notes = sorted;
  }
  return notes.sort((a, b) => a - b);
}

// ── Diatonic harmony (the teaching backbone) ─────────────────────────────────

export type ChordFunction = 'tonic' | 'subdominant' | 'dominant';

export interface DiatonicDegree {
  degree: number;          // 1–7
  roman: string;           // I, ii, iii… lower case = minor, ° = diminished
  rootPc: number;
  rootName: string;
  chordId: string;
  symbol: string;          // e.g. "Am7"
  fn: ChordFunction;
  /** Plain-language explanation — the line a lesson can show verbatim. */
  role: string;
}

const MAJOR_QUALITIES = ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'];
const MINOR_QUALITIES = ['min', 'dim', 'maj', 'min', 'min', 'maj', 'maj'];
const MAJOR_ROMAN = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
const MINOR_ROMAN = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'];
const FUNCTIONS: ChordFunction[] = ['tonic', 'subdominant', 'tonic', 'subdominant', 'dominant', 'tonic', 'dominant'];

const ROLE_TEXT: Record<ChordFunction, string> = {
  tonic: 'Home. Arriving here feels settled.',
  subdominant: 'Departure. Moves you away from home without tension.',
  dominant: 'Tension. Wants to fall back to the tonic.',
};

/** The seven chords of a key, with roman numerals and function — used by lessons and the Arp. */
export function diatonicDegrees(rootPc: number, scaleId: 'major' | 'minor' | string = 'major', seventh = false): DiatonicDegree[] {
  const def = scaleById(scaleId === 'minor' ? 'minor' : scaleId === 'major' ? 'major' : scaleId);
  const isMinorish = def.intervals[2] === 3;
  const quals = isMinorish ? MINOR_QUALITIES : MAJOR_QUALITIES;
  const romans = isMinorish ? MINOR_ROMAN : MAJOR_ROMAN;
  const out: DiatonicDegree[] = [];
  for (let d = 0; d < 7; d++) {
    const iv = def.intervals[d] ?? d * 2;
    const pc = (rootPc + iv) % 12;
    let chordId = quals[d];
    if (seventh) {
      chordId = chordId === 'maj' ? (d === 4 ? 'dom7' : 'maj7') : chordId === 'min' ? 'min7' : 'dim7';
    }
    const fn = FUNCTIONS[d];
    out.push({
      degree: d + 1,
      roman: romans[d],
      rootPc: pc,
      rootName: pcName(pc),
      chordId,
      symbol: `${pcName(pc)}${chordById(chordId).symbol}`,
      fn,
      role: ROLE_TEXT[fn],
    });
  }
  return out;
}

// ── Progressions ─────────────────────────────────────────────────────────────

export interface Progression {
  id: string;
  name: string;
  /** Scale degrees, 1-indexed. Negative means borrow from the parallel mode. */
  degrees: number[];
  mode: 'major' | 'minor';
  character: string;
  /** Songs a student will recognise — the fastest route to "oh, THAT". */
  heardIn: string;
}

export const PROGRESSIONS: Progression[] = [
  { id: 'pop', name: 'The four chords', degrees: [1, 5, 6, 4], mode: 'major',
    character: 'The most used progression in popular music, and it still works.',
    heardIn: 'Half the charts since 1975' },
  { id: 'sad-pop', name: 'Minor pop', degrees: [6, 4, 1, 5], mode: 'major',
    character: 'The same four chords starting on the sad one.',
    heardIn: 'Ballads and most sad-but-danceable songs' },
  { id: 'ii-v-i', name: 'ii–V–I', degrees: [2, 5, 1], mode: 'major',
    character: 'The engine of jazz harmony: tension built then resolved.',
    heardIn: 'Almost every jazz standard' },
  { id: 'blues12', name: '12-bar blues', degrees: [1, 1, 1, 1, 4, 4, 1, 1, 5, 4, 1, 5], mode: 'major',
    character: 'A whole form, not just a loop. Learn it once and you can sit in anywhere.',
    heardIn: 'Blues, rock and roll, and most of what came after' },
  { id: 'house', name: 'Deep house vamp', degrees: [1, 4, 1, 5], mode: 'minor',
    character: 'Two chords doing most of the work, with a lift on the fourth.',
    heardIn: 'Deep and soulful house' },
  { id: 'amapiano', name: 'Amapiano loop', degrees: [1, 4, 5, 4], mode: 'minor',
    character: 'Dorian-leaning minor with a hopeful fourth — the log-drum lane.',
    heardIn: 'Amapiano and afro house' },
  { id: 'future-bass', name: 'Future bass', degrees: [4, 5, 6, 3], mode: 'major',
    character: 'Lush and yearning — supersaw chords that swell then ache.',
    heardIn: 'Future bass and melodic EDM' },
  { id: 'epic-minor', name: 'Epic minor', degrees: [1, 6, 3, 7], mode: 'minor',
    character: 'Anthemic and cinematic — a minor loop built to soar on the drop.',
    heardIn: 'Melodic house, big-room minor, trailer moments' },
  { id: 'trap-minor', name: 'Trap loop', degrees: [1, 6, 7], mode: 'minor',
    character: 'Dark and hypnotic — three chords for 808s to sit under.',
    heardIn: 'Trap and drill' },
  { id: 'lofi', name: 'Lo-fi jazz', degrees: [2, 5, 1, 6], mode: 'major',
    character: 'Warm ii–V–I with a soft landing on the vi — coffee-shop harmony.',
    heardIn: 'Lo-fi hip-hop and neo-soul' },
  { id: 'synthwave', name: 'Synthwave', degrees: [1, 7, 6, 7], mode: 'minor',
    character: 'Neon and driving — a minor vamp that never quite resolves.',
    heardIn: 'Synthwave and darksynth' },
  { id: 'andalusian', name: 'Andalusian cadence', degrees: [1, 7, 6, 5], mode: 'minor',
    character: 'A descending walk that sounds ancient and inevitable.',
    heardIn: 'Flamenco, and a lot of metal' },
  { id: 'canon', name: 'Canon', degrees: [1, 5, 6, 3, 4, 1, 4, 5], mode: 'major',
    character: 'Eight chords that keep resolving forward.',
    heardIn: "Pachelbel's Canon, and everything that borrowed it" },
  { id: 'doo-wop', name: 'Doo-wop / 50s', degrees: [1, 6, 4, 5], mode: 'major',
    character: 'The sock-hop sound — sweet and circular, resolving home every bar.',
    heardIn: '"Stand By Me", "Earth Angel", most of the 1950s' },
  { id: 'rock3', name: 'Three-chord rock', degrees: [1, 4, 5], mode: 'major',
    character: 'The whole engine of rock and folk: tonic, subdominant, dominant.',
    heardIn: '"Twist and Shout", punk, every campfire' },
  { id: 'optimistic-axis', name: 'Optimistic axis', degrees: [4, 1, 5, 6], mode: 'major',
    character: 'The four chords rotated to open on the lift — bright and rising.',
    heardIn: '"Umbrella", stadium pop' },
  { id: 'rhythm-changes', name: 'Rhythm changes', degrees: [1, 6, 2, 5], mode: 'major',
    character: "Bebop's second home form — a turnaround that keeps spinning.",
    heardIn: '"I Got Rhythm" and hundreds of jazz heads' },
  { id: 'gospel', name: 'Gospel 1–4', degrees: [1, 4, 1, 5], mode: 'major',
    character: 'Church harmony — the plagal "amen" warmed by a dominant lift.',
    heardIn: 'Gospel, soul, Sunday-morning changes' },
  { id: 'neo-soul', name: 'Neo-soul cycle', degrees: [2, 5, 1, 4], mode: 'major',
    character: 'Extended and smooth — best voiced with 7ths and 9ths.',
    heardIn: 'D-Angelo, Erykah Badu, H.E.R.' },
  { id: 'minor-251', name: 'Minor ii–V–i', degrees: [2, 5, 1], mode: 'minor',
    character: 'The darker cadence — half-diminished tension into minor.',
    heardIn: 'Minor-key jazz, "Autumn Leaves"' },
  { id: 'circle5', name: 'Circle of fifths', degrees: [6, 2, 5, 1], mode: 'major',
    character: 'Each chord a fifth below the last — the strongest pull in tonal music.',
    heardIn: '"Fly Me to the Moon", Baroque sequences' },
  { id: 'deceptive', name: 'Deceptive cadence', degrees: [1, 4, 5, 6], mode: 'major',
    character: 'Sets up home then dodges to the relative minor — a held breath.',
    heardIn: 'Film scores and pop bridges' },
  { id: 'plagal', name: 'Plagal / "amen"', degrees: [1, 4, 1], mode: 'major',
    character: 'The gentle church cadence — no leading-tone tension, just a settle.',
    heardIn: 'Hymns, "Let It Be" verses' },
  { id: 'prog-house', name: 'Progressive house', degrees: [6, 4, 1, 5], mode: 'minor',
    character: 'Sensitive-side EDM — opens on the minor for yearning, lifts to the drop.',
    heardIn: 'Progressive & melodic house' },
  { id: 'rnb-jam', name: 'R&B slow jam', degrees: [1, 4, 6, 5], mode: 'major',
    character: 'Smooth and pleading — the quiet-storm standard.',
    heardIn: '90s/00s R&B ballads' },
  { id: 'cinematic-min', name: 'Cinematic minor rise', degrees: [1, 3, 7, 6], mode: 'minor',
    character: 'A minor climb that feels like the camera pulling back.',
    heardIn: 'Trailers and epic scores' },
  { id: 'bossa', name: 'Bossa nova', degrees: [1, 2, 5, 1], mode: 'major',
    character: 'Cool Brazilian harmony — a soft two-five kissing the tonic.',
    heardIn: '"The Girl from Ipanema", bossa standards' },
  { id: 'phrygian', name: 'Phrygian drop', degrees: [1, 2, 1], mode: 'minor',
    character: 'The flat-second gives an exotic, unstable pull toward the tonic.',
    heardIn: 'Flamenco, metal, film danger cues' },
  { id: 'anthem', name: 'Stadium anthem', degrees: [1, 5, 4], mode: 'major',
    character: 'Wide and unresolved — built to be sung by a crowd.',
    heardIn: 'Arena rock and worship' },
  { id: 'dream-pop', name: 'Dream-pop wash', degrees: [1, 3, 4, 4], mode: 'major',
    character: 'A hazy lift to the mediant, then a long float on the subdominant.',
    heardIn: 'Shoegaze and dream-pop' },
  { id: 'afroswing', name: 'Afroswing', degrees: [6, 7, 1], mode: 'minor',
    character: 'A bright minor lift borrowed from amapiano and afrobeats.',
    heardIn: 'Afroswing and UK afrobeats' },
  { id: 'drill', name: 'Dark drill', degrees: [1, 7, 6], mode: 'minor',
    character: 'Three dark chords, sparse and menacing, for sliding 808s.',
    heardIn: 'UK / Brooklyn drill' },
];

/** Realise a progression into chords in a key. */
export function realiseProgression(prog: Progression, rootPc: number, seventh = false): DiatonicDegree[] {
  const degrees = diatonicDegrees(rootPc, prog.mode, seventh);
  return prog.degrees.map((d) => degrees[(d - 1 + 7) % 7]);
}

// ── Intervals (for the teaching overlay) ─────────────────────────────────────

const INTERVAL_NAMES = [
  'Unison', 'Minor 2nd', 'Major 2nd', 'Minor 3rd', 'Major 3rd', 'Perfect 4th',
  'Tritone', 'Perfect 5th', 'Minor 6th', 'Major 6th', 'Minor 7th', 'Major 7th', 'Octave',
];

export function intervalName(semitones: number): string {
  const s = Math.abs(semitones);
  if (s <= 12) return INTERVAL_NAMES[s];
  return `${INTERVAL_NAMES[s % 12]} + ${Math.floor(s / 12)} octave${s >= 24 ? 's' : ''}`;
}

/** Name what a set of notes forms, if it forms anything nameable. Used by the "what am I playing?" readout. */
export function identifyChord(midiNotes: number[]): { symbol: string; name: string; rootName: string } | null {
  if (midiNotes.length < 2) return null;
  const pcs = [...new Set(midiNotes.map((n) => ((n % 12) + 12) % 12))].sort((a, b) => a - b);
  for (const rootPc of pcs) {
    const rel = pcs.map((p) => ((p - rootPc) % 12 + 12) % 12).sort((a, b) => a - b);
    for (const c of CHORDS) {
      const want = [...new Set(c.intervals.map((i) => i % 12))].sort((a, b) => a - b);
      if (want.length === rel.length && want.every((v, i) => v === rel[i])) {
        return { symbol: `${pcName(rootPc)}${c.symbol}`, name: c.name, rootName: pcName(rootPc) };
      }
    }
  }
  return null;
}
