// Chora Direct — style packs: what a working composer, producer or player already knows about a
// style before a note is written. Tempo and feel, the forms that style uses, how its harmony moves,
// who is on the session and what each chair does, how it is produced and mixed, and what to avoid.
//
// This is the "whole knowledge of music" that gets injected into every prompt. No training set is
// involved: a pack is written, reviewed and versioned like code, and the same pack drives the
// symbolic writers (council, session band), the audio renderers (tags) and the review seats.
//
// Focus families for now: cinematic, classical, jazz, electronic (the full suite) and hip-hop.
// Country, rock and the rest come later; until then the general `song` pack catches them.
//
// Harmony is written in roman numerals against the MAJOR scale degrees, so minor-key packs spell
// their flats ("i | bVI | bIII | bVII"). Bars are split on "|"; two chords in a bar share it.

import type { Dynamic, SectionKind } from './songPrompt';
import { EXTRA_PACKS } from './packs';

export type StyleFamily = 'cinematic' | 'classical' | 'jazz' | 'electronic' | 'hiphop' | 'song';

/** The chairs of the Session Band (services/melos/beats/band/roster.ts BandRole). */
export type Chair =
  | 'drums' | 'percussion' | 'bass' | 'guitar' | 'piano' | 'cello' | 'violin'
  | 'trumpet' | 'sax' | 'woodwinds' | 'synth' | 'organ' | 'orchestra';

export interface Seat {
  chair: Chair;
  /** What this chair is called on this session: "808", "upright bass", "spiccato strings". */
  as: string;
  /** Its job in the arrangement, written as a direction to the player. */
  job: string;
  /** Chora engines that suit it, best first (lower-case engine ids; not every one is in the UI yet). */
  engines: string[];
}

export interface FormSection {
  kind: SectionKind;
  bars: number;
  /** 0 nothing playing … 1 everything, full power. */
  energy: number;
  direction: string;
  label?: string;
}

export interface StylePack {
  id: string;
  label: string;
  family: StyleFamily;
  /** Words that select this pack specifically. */
  match: RegExp;
  tempo: [number, number];
  defaultTempo: number;
  meter: [number, number];
  /** 0 straight … 1 full triplet swing, on the `swingGrid` offbeats. */
  swing: number;
  swingGrid: 8 | 16;
  /** Felt at half the written tempo (trap at 140, dubstep at 140, drum and bass at 174). */
  halfTime: boolean;
  /** Modes this style lives in, most typical first (theory.ts SCALES ids). */
  modes: string[];
  /** Tonics players favour here (pitch classes), most typical first. */
  tonics: number[];
  /** How far chords are extended: 0 triads/power · 1 some 7ths · 2 7ths/9ths · 3 rich extensions. */
  colour: 0 | 1 | 2 | 3;
  /** Bars per chord change that feels native (harmonic rhythm). */
  harmonicRhythm: number;
  /** Progressions in roman numerals; the first reads as the "verse", the second lifts for the "chorus". */
  progressions: string[];
  harmonyNotes: string[];
  /** The default form when the prompt names no sections. */
  form: FormSection[];
  /** Bars one sung line usually takes. */
  barsPerLine: number;
  lineup: Seat[];
  /** The Session Band genre whose grooves fit (band/styles.ts GENRES id). */
  bandGenre: string;
  rhythm: string[];
  arrangement: string[];
  production: string[];
  avoid: string[];
  /** Released-master loudness window (integrated LUFS) and what the mix is built around. */
  mix: { lufs: [number, number]; note: string };
  /** Style words audio renderers respond to. */
  renderTags: string[];
  vocals: 'none' | 'optional' | 'typical';
  vocalNote?: string;
}

const C = 0, Db = 1, D = 2, Eb = 3, E = 4, F = 5, Fs = 6, G = 7, Ab = 8, A = 9, Bb = 10, B = 11;

const s = (kind: SectionKind, bars: number, energy: number, direction: string, label?: string): FormSection => ({ kind, bars, energy, direction, label });
const seat = (chair: Chair, as: string, job: string, engines: string[]): Seat => ({ chair, as, job, engines });

// Chairs reused across packs.
const STRINGS_LONG = seat('orchestra', 'string section (longs)', 'Sustain the harmony in open voicings; swell into phrase peaks, never static.', ['arco', 'aura', 'kera']);
const STRINGS_SHORT = seat('violin', 'spiccato strings', 'Drive the ostinato in tight 8ths/16ths; accent the bar line, change voicing with the chord.', ['arco', 'lyra']);
const LOW_BRASS = seat('trumpet', 'horns and low brass', 'Carry the theme in horns; trombones and tuba land the weight on arrivals.', ['cornu', 'lyra', 'aura']);
const UPRIGHT = seat('bass', 'upright bass', 'Walk four to the bar on chord tones with chromatic approaches; lock to the ride.', ['lyra', 'bajo']);
const SUB_808 = seat('bass', '808', 'Tuned sub that follows the kick pattern; slides between notes on phrase ends; one note at a time.', ['bajo', 'onda']);

// ─── Cinematic ──────────────────────────────────────────────────────────────────

const CINEMATIC: StylePack[] = [
  {
    id: 'cinematic-epic', label: 'Epic trailer', family: 'cinematic',
    match: /\b(epic|trailer|heroic|battle|war drums?|blockbuster|two steps|massive orchestral)\b/i,
    tempo: [90, 140], defaultTempo: 120, meter: [4, 4], swing: 0, swingGrid: 8, halfTime: false,
    modes: ['minor', 'dorian', 'phrygian'], tonics: [D, C, E, A, G], colour: 0, harmonicRhythm: 2,
    progressions: ['i | i | bVI | bVI | bIII | bIII | bVII | bVII', 'i | bVI | bIII | bVII', 'i | bVII | bVI | V'],
    harmonyNotes: [
      'Power comes from the bass moving while the top holds: keep common tones in the upper strings across chord changes.',
      'Save the major V (raised leading tone) for the last cadence before the climax; elsewhere bVII keeps it modal and heavy.',
      'Open fifths and octaves in the low register; thirds only from the cello range upward.',
    ],
    form: [
      s('intro', 8, 0.15, 'A single colour: low drone, distant piano or solo voice. State the motif once, bare.'),
      s('theme', 8, 0.35, 'Ostinato enters in violas/cellos. Motif in horns, quietly.'),
      s('build', 16, 0.6, 'Add a layer every 4 bars: percussion, choir, high strings doubling the ostinato. Rising line in the bass.'),
      s('breakdown', 4, 0.1, 'Cut to near silence. One held note or a reversed swell. This is the breath before the hit.'),
      s('drop', 16, 1, 'Full orchestra, choir and drums. Theme in unison brass, strings on the ostinato an octave up, hits on the downbeats.', 'Climax'),
      s('coda', 4, 0.3, 'Final hit, then the tail rings: low strings and a last statement of the motif.'),
    ],
    barsPerLine: 2,
    lineup: [
      STRINGS_SHORT, STRINGS_LONG, LOW_BRASS,
      seat('percussion', 'taikos, toms and impacts', 'Big drums on 1 and the pickups; rolls into every arrival; sub booms under the hits.', ['soma', 'meka']),
      seat('cello', 'low strings', 'Octave pedal and the rising bass line; marcato in the climax.', ['arco', 'lyra']),
      seat('synth', 'sub, pulses and risers', 'Sub under the basses, a 16th pulse under the ostinato, risers and downers at section joins.', ['onda', 'aura', 'bajo']),
      seat('organ', 'choir', 'Wordless choir doubling the chords: men in the build, full SATB at the climax.', ['cantus', 'ison']),
    ],
    bandGenre: 'cinematic',
    rhythm: ['Ostinato in straight 8ths or 16ths, accented in 3+3+2 for drive.', 'Drums play the downbeats and the last two 8ths of the phrase, not a kit groove.'],
    arrangement: ['Terrace the build: each 4 bars adds exactly one family.', 'Double the theme at the octave rather than adding new lines at the climax.', 'Every arrival is prepared: a roll, a riser or a full bar of silence.'],
    production: ['Hall reverb with a long tail on brass and choir; drums get a shorter room so the hits stay defined.', 'Layer orchestral bass with a clean sine sub below 60 Hz.', 'Wide strings, centred low end.'],
    avoid: ['A drum-kit backbeat.', 'Busy harmony: more than one chord per bar blurs the weight.', 'Climax that arrives without a drop in level first.'],
    mix: { lufs: [-14, -9], note: 'Built around the hits; leave 6 dB between the build and the climax.' },
    renderTags: ['epic', 'cinematic', 'orchestral', 'trailer music', 'choir', 'taiko drums', 'powerful brass'],
    vocals: 'optional', vocalNote: 'Wordless choir or one solo voice; sung lyrics are rare.',
  },
  {
    id: 'cinematic-hybrid', label: 'Hybrid action score', family: 'cinematic',
    match: /\b(hybrid|action score|chase|thriller|heist|ticking|zimmer|pulse score|tension build)\b/i,
    tempo: [110, 160], defaultTempo: 132, meter: [4, 4], swing: 0, swingGrid: 16, halfTime: false,
    modes: ['minor', 'dorian'], tonics: [D, E, C, G, A], colour: 0, harmonicRhythm: 4,
    progressions: ['i | i | i | i | bVI | bVI | bVII | bVII', 'i | i | bIII | bIII | bVI | bVI | iv | V', 'i | i | iv | iv'],
    harmonyNotes: ['Slow harmony over fast rhythm: one chord for 2–4 bars under a relentless 16th ostinato.', 'Pedal the tonic in the bass while upper voices change: tension without motion.', 'Shift the ostinato voicing, not its rhythm, when the chord changes.'],
    form: [
      s('intro', 8, 0.2, 'Ticking pulse and a low drone. No melody yet.'),
      s('theme', 16, 0.5, 'Spiccato ostinato locks with the synth pulse. Low brass swells on the chord changes.'),
      s('build', 8, 0.7, 'Percussion doubles up; ostinato climbs an octave; brass crescendo.'),
      s('drop', 16, 0.95, 'Everything in: braams on the downbeats, drums driving 16ths, theme in horns over the top.', 'Full action'),
      s('breakdown', 8, 0.3, 'Strip to pulse and a solo cello line. Keep the clock running.'),
      s('coda', 8, 0.85, 'Return at full weight and cut dead on the last downbeat.'),
    ],
    barsPerLine: 2,
    lineup: [
      STRINGS_SHORT,
      seat('cello', 'cellos and basses', 'Unison low ostinato and long menace notes; bow heavy.', ['arco', 'bajo', 'lyra']),
      seat('synth', 'pulse synth and sub', 'A filtered 16th pulse sidechained to the hits; sub drone on the tonic.', ['onda', 'aura', 'bajo']),
      LOW_BRASS,
      seat('percussion', 'hybrid percussion', 'Processed hits, metal, taikos; 16th hi-percussion keeps the clock.', ['soma', 'meka']),
      seat('drums', 'cinematic kit', 'Toms and kick only, no cymbal groove; fills announce every section.', ['meka', 'soma']),
    ],
    bandGenre: 'cinematic',
    rhythm: ['16th-note engine throughout; accents in 3+3+2 or 3+3+3+3+4.', 'Braams and hits land every 2 or 4 bars on the downbeat.'],
    arrangement: ['Register is the build: the same ostinato moves from cellos up to violins.', 'Remove the low end for two bars before each arrival.'],
    production: ['Sidechain pads and drones to the main pulse.', 'Distort the low brass layer lightly and blend under the real section.', 'Short, dark room on percussion; long tail only on the sustains.'],
    avoid: ['Melodic busyness: the motif is 3–5 notes.', 'Major-key brightness unless the scene resolves.'],
    mix: { lufs: [-14, -9], note: 'Low-mid weight (80–250 Hz) carries the menace; keep it controlled, not muddy.' },
    renderTags: ['hybrid orchestral', 'cinematic action', 'driving ostinato', 'dark', 'pulsing synth', 'braams', 'tension'],
    vocals: 'none',
  },
  {
    id: 'cinematic-drama', label: 'Emotional drama score', family: 'cinematic',
    match: /\b(emotional (?:score|piano|strings)|drama(?:tic)? score|film score|soundtrack|underscore|heartfelt|bittersweet|tearjerker|piano and strings|cinematic)\b/i,
    tempo: [56, 96], defaultTempo: 72, meter: [4, 4], swing: 0, swingGrid: 8, halfTime: false,
    modes: ['major', 'minor', 'lydian'], tonics: [C, D, F, G, Bb, A], colour: 1, harmonicRhythm: 1,
    progressions: ['I | V | vi | IV', 'vi | IV | I | V', 'IV | I | V | vi', 'i | bVI | bIII | bVII'],
    harmonyNotes: ['Inversions make it move: let the bass walk by step (I, V over its third, vi) under held upper notes.', 'Suspensions resolve late: 4–3 and 9–8 on the strong beats.', 'Add the 9th to major chords; keep the piano left hand open (root, fifth, tenth).'],
    form: [
      s('intro', 4, 0.15, 'Solo piano states the motif, unhurried. Room sound.'),
      s('theme', 8, 0.3, 'Piano continues; a solo cello answers the melody.'),
      s('development', 8, 0.5, 'Strings enter under the piano, violas first. The melody passes to violins.'),
      s('build', 8, 0.7, 'Full strings, the bass descends by step, horns warm the middle.'),
      s('recap', 8, 0.85, 'The theme at full voice, octave higher, with a counter-line in cellos.'),
      s('coda', 4, 0.15, 'Back to solo piano. Last chord left to ring, unresolved or with an added 9th.'),
    ],
    barsPerLine: 2,
    lineup: [
      seat('piano', 'felt piano', 'Carry the motif; broken chords in the left hand, melody sung in the right. Rubato at phrase ends.', ['lyra', 'kera', 'aura']),
      seat('cello', 'solo cello', 'Answer the piano; long legato lines with vibrato that grows through the note.', ['arco', 'lyra']),
      STRINGS_LONG,
      seat('violin', 'first violins', 'Take the melody at the peak, an octave above the piano.', ['arco', 'lyra']),
      seat('woodwinds', 'clarinet and flute', 'Soft doublings and a solo echo of the motif.', ['aulos', 'pneuma', 'lyra']),
      seat('synth', 'pad and textures', 'A barely-there pad under the strings; tape noise and air.', ['aura', 'onda']),
    ],
    bandGenre: 'ballad',
    rhythm: ['Pulse is implied, not stated: arpeggios in 8ths, no percussion until the build, often none at all.', 'Phrase in 4-bar breaths with a slight ritard at each end.'],
    arrangement: ['One melody, passed between instruments; never two at once.', 'The peak is two-thirds of the way through; the ending is smaller than the beginning.'],
    production: ['Close, soft piano (felt, pedal noise welcome). Strings in a scoring-stage room.', 'Very wide dynamic range: do not compress the swell.'],
    avoid: ['Drums.', 'Thick block chords in the low piano register.', 'Constant full strings: silence is part of the cue.'],
    mix: { lufs: [-20, -14], note: 'Dynamic and warm; the quiet opening should be genuinely quiet.' },
    renderTags: ['emotional', 'cinematic', 'piano and strings', 'film score', 'intimate', 'swelling strings'],
    vocals: 'optional', vocalNote: 'A wordless solo voice can double the melody at the peak.',
  },
  {
    id: 'cinematic-adventure', label: 'Symphonic adventure', family: 'cinematic',
    match: /\b(adventure|fantasy score|swashbuckl\w*|fanfare|symphonic score|heroic theme|magical|wonder|john williams|golden age)\b/i,
    tempo: [96, 152], defaultTempo: 126, meter: [4, 4], swing: 0, swingGrid: 8, halfTime: false,
    modes: ['major', 'lydian', 'mixolydian'], tonics: [Bb, C, Eb, F, D, G], colour: 1, harmonicRhythm: 1,
    progressions: ['I | I | IV | V', 'I | II | IV | I', 'I | bVI | bVII | I', 'I | bIII | I | bVI'],
    harmonyNotes: ['Lydian II (a major chord a tone above the tonic) is the sound of wonder.', 'Chromatic mediants (I to bVI, I to bIII) for sudden heroism; bVI–bVII–I for the big cadence.', 'Brass voiced in fourths and fifths; thirds in the horns.'],
    form: [
      s('intro', 4, 0.6, 'Fanfare: trumpets and horns announce the first interval of the theme.'),
      s('theme', 8, 0.75, 'Main theme in trumpets and violins, march pulse in low strings and snare.', 'A theme'),
      s('development', 8, 0.45, 'Lyrical second theme in strings and solo horn, woodwind runs between phrases.', 'B theme'),
      s('build', 8, 0.7, 'Fragments of the main theme climb through the brass in sequence.'),
      s('recap', 8, 1, 'Main theme, full orchestra, a tone higher or with a new counter-line in horns.'),
      s('coda', 4, 0.9, 'Cadence bVI–bVII–I, held tonic chord, timpani roll, final unison stab.'),
    ],
    barsPerLine: 2,
    lineup: [
      seat('trumpet', 'trumpets and horns', 'State the theme: a leap of a fifth or sixth, then stepwise. Horn counter-lines on held notes.', ['cornu', 'lyra']),
      seat('violin', 'violins', 'Double the theme, then run scales and trills between brass phrases.', ['arco', 'lyra']),
      seat('woodwinds', 'woodwinds', 'Fast runs into arrivals, flute and piccolo doubling at the octave, clarinet filigree.', ['aulos', 'pneuma']),
      seat('cello', 'low strings and tuba', 'March bass: root and fifth on the beats, pizzicato in quiet sections.', ['arco', 'cornu']),
      seat('percussion', 'timpani, snare, cymbals, glockenspiel', 'Timpani on tonic and dominant, snare rhythm under the march, cymbal on arrivals.', ['soma', 'meka', 'vela']),
      seat('piano', 'harp and celesta', 'Glissandi into new sections; celesta doubles quiet magical statements.', ['tonos', 'vela', 'aura']),
    ],
    bandGenre: 'classical',
    rhythm: ['March or galloping triplet pulse; dotted rhythms in the theme.', 'Syncopated brass stabs answer the melody.'],
    arrangement: ['Melody, counter-melody, harmony, bass, decoration: every bar has all five jobs covered and no more.', 'Decoration (runs, trills, harp) fills the holes in the melody, never plays across it.'],
    production: ['A real hall: one shared space for all sections, seated left to right as on stage.', 'No sub synths; the weight is tuba, basses and timpani.'],
    avoid: ['Static pads.', 'Modern trailer percussion.', 'Harmony that sits on one chord for more than two bars.'],
    mix: { lufs: [-20, -14], note: 'Natural orchestral balance; brass must be able to dominate at the recap.' },
    renderTags: ['symphonic', 'orchestral adventure', 'heroic fanfare', 'full orchestra', 'film score', 'soaring strings'],
    vocals: 'none',
  },
  {
    id: 'cinematic-horror', label: 'Horror and suspense', family: 'cinematic',
    match: /\b(horror|suspense|dread|eerie|haunt\w*|creepy|sinister|gothic|unsettling|stalker|slasher)\b/i,
    tempo: [48, 92], defaultTempo: 66, meter: [4, 4], swing: 0, swingGrid: 8, halfTime: false,
    modes: ['phrygian', 'minor', 'locrian', 'harmonic'], tonics: [D, E, C, B, Fs], colour: 1, harmonicRhythm: 4,
    progressions: ['i | i | bII | i', 'i | i | i | bv', 'i | bvi | i | bII'],
    harmonyNotes: ['The semitone above the tonic (bII) and the tritone are the two intervals of dread.', 'Clusters: stack minor seconds in high strings, let them slide by quarter-tone feel (slow glissando).', 'Minor chord a major third away (i to bvi) is the uncanny move.'],
    form: [
      s('intro', 8, 0.1, 'Almost nothing: a high string harmonic, room tone, a single low piano note.'),
      s('theme', 8, 0.25, 'A childlike motif (music box or celesta) over a low drone, slightly detuned.'),
      s('build', 8, 0.5, 'Tremolo strings creep upward in semitones; the pulse appears as a heartbeat.'),
      s('drop', 4, 1, 'The sting: full cluster, brass flutter, bass drum. Then cut.', 'Sting'),
      s('breakdown', 8, 0.15, 'Aftermath: the motif returns broken, in the wrong key.'),
      s('coda', 4, 0.05, 'A held cluster fades to silence without resolving.'),
    ],
    barsPerLine: 2,
    lineup: [
      seat('violin', 'high strings', 'Harmonics, sul ponticello tremolo, slow glissandi between cluster notes.', ['arco', 'lyra']),
      seat('cello', 'low strings', 'Bowed drone on the tonic; col legno taps; sudden sforzando.', ['arco', 'bajo']),
      seat('piano', 'music box and prepared piano', 'The innocent motif; low single notes with the pedal down.', ['vela', 'aura', 'lyra']),
      seat('synth', 'drones and textures', 'Sub rumble, reversed swells, bowed metal.', ['bajo', 'onda', 'aura']),
      seat('percussion', 'bass drum and metals', 'Heartbeat pulse; waterphone, scraped cymbal; the sting hit.', ['soma', 'meka']),
      seat('organ', 'voices', 'Whispered or wordless children\'s choir, breath sounds.', ['cantus']),
    ],
    bandGenre: 'cinematic',
    rhythm: ['No groove. Time is a heartbeat or a clock, and it speeds up.', 'Silence before the sting is at least two beats.'],
    arrangement: ['Extremes only: very high and very low, nothing comfortable in the middle.', 'One recognisable motif, then corrupt it.'],
    production: ['Close and dry for the small sounds, cavernous for the hits.', 'Detune layers by a few cents; tape wobble on the music box.'],
    avoid: ['Resolution.', 'Constant loudness: fear lives in the quiet.', 'Rich major-seventh colour.'],
    mix: { lufs: [-24, -14], note: 'Huge dynamic range; the sting should be 15 dB above the bed.' },
    renderTags: ['horror', 'suspense', 'dark ambient', 'eerie strings', 'dissonant', 'tension'],
    vocals: 'optional', vocalNote: 'Whispers and wordless voices only.',
  },
];

// ─── Classical ──────────────────────────────────────────────────────────────────

const CLASSICAL: StylePack[] = [
  {
    id: 'classical-baroque', label: 'Baroque', family: 'classical',
    match: /\b(baroque|bach|vivaldi|handel|fugue|harpsichord|continuo|concerto grosso|invention)\b/i,
    tempo: [60, 132], defaultTempo: 96, meter: [4, 4], swing: 0, swingGrid: 8, halfTime: false,
    modes: ['minor', 'major', 'harmonic'], tonics: [D, G, A, C, E, B], colour: 1, harmonicRhythm: 1,
    progressions: ['i | iv | bVII | bIII | bVI | iidim | V7 | i', 'I | IV | viidim | iii | vi | ii | V7 | I', 'i | V7 | i | iv | i | V7 | i | i'],
    harmonyNotes: ['Circle-of-fifths sequences are the engine: each bar falls a fifth, the melody repeats a step lower.', 'Raise the leading tone at every cadence in minor (V7, not v).', 'Bass line is a melody too: it moves in contrary motion to the top voice.'],
    form: [
      s('theme', 8, 0.6, 'Subject stated alone, then answered at the fifth while the first voice continues in counterpoint.', 'Exposition'),
      s('development', 8, 0.55, 'Sequence: the subject\'s head motif descends through the circle of fifths.', 'Episode'),
      s('theme', 8, 0.65, 'Subject returns in the relative key in a middle voice.', 'Middle entry'),
      s('development', 4, 0.6, 'Stretto: entries overlap, closer and closer.'),
      s('recap', 8, 0.75, 'Subject in the bass in the home key under running upper voices.'),
      s('coda', 4, 0.7, 'Dominant pedal, then the final cadence with a Picardy third.'),
    ],
    barsPerLine: 2,
    lineup: [
      seat('violin', 'violins I and II', 'Independent lines in imitation; terraced dynamics, light bow, little vibrato.', ['arco', 'lyra']),
      seat('cello', 'cello continuo', 'The walking bass in steady 8ths; every note has direction to the next.', ['arco', 'lyra']),
      seat('piano', 'harpsichord', 'Realise the figured bass: chords on the beats, ornaments at cadences.', ['aura', 'kera', 'tonos']),
      seat('woodwinds', 'oboe and recorder', 'Double or answer the violins; solo in the slow middle.', ['aulos', 'pneuma']),
      seat('organ', 'chamber organ', 'Sustain the continuo harmony in sacred settings.', ['ison']),
    ],
    bandGenre: 'classical',
    rhythm: ['Continuous motor rhythm in 8ths or 16ths; some voice is always moving.', 'Hemiola (3 groups of 2 across two bars of 3) before cadences in triple metre.'],
    arrangement: ['Two to four independent voices, each singable on its own.', 'Dynamics change by adding or removing players (terraced), not by crescendo.', 'Ornaments (trills from the upper note, mordents) on long notes and cadences.'],
    production: ['Small bright room or chapel; close enough to hear bow and pluck.', 'No compression. A = 415 tuning optional for period colour.'],
    avoid: ['Sustain-pedal piano wash.', 'Parallel fifths and octaves between outer voices.', 'Romantic rubato.'],
    mix: { lufs: [-22, -16], note: 'Clarity of each line over blend.' },
    renderTags: ['baroque', 'harpsichord', 'string ensemble', 'counterpoint', 'chamber orchestra'],
    vocals: 'optional', vocalNote: 'Chorale or aria writing: syllabic, with melismas on important words.',
  },
  {
    id: 'classical-era', label: 'Classical (sonata style)', family: 'classical',
    match: /\b(classical era|mozart|haydn|sonata|string quartet|minuet|galant|viennese|early beethoven|symphony)\b/i,
    tempo: [72, 152], defaultTempo: 120, meter: [4, 4], swing: 0, swingGrid: 8, halfTime: false,
    modes: ['major', 'minor'], tonics: [C, G, D, F, Bb, Eb, A], colour: 0, harmonicRhythm: 1,
    progressions: ['I | I | V7 | V7 | V7 | V7 | I | I', 'I | IV | V7 | I', 'I | vi | ii | V7'],
    harmonyNotes: ['Tonic and dominant do most of the work; the drama is the journey to the dominant key and back.', 'Phrases are questions and answers: 4 bars ending on V, 4 bars ending on I.', 'Cadential six-four (I over its fifth, then V7, then I) at every important close.'],
    form: [
      s('theme', 8, 0.6, 'First theme in the home key: a clear 4+4 period.', 'Exposition: first theme'),
      s('interlude', 4, 0.7, 'Transition: scales and sequences that push to the dominant.', 'Transition'),
      s('theme', 8, 0.45, 'Second theme in the dominant (relative major if minor): lyrical, lighter texture.', 'Second theme'),
      s('development', 12, 0.75, 'Fragments of both themes, restless keys, building to a dominant pedal.', 'Development'),
      s('recap', 12, 0.7, 'First theme returns in the home key; second theme now also at home.', 'Recapitulation'),
      s('coda', 4, 0.8, 'Repeated cadences, tonic chords, a clean final bar.'),
    ],
    barsPerLine: 2,
    lineup: [
      seat('violin', 'violin I', 'The singing melody: graceful, with appoggiaturas and turns.', ['arco', 'lyra']),
      seat('violin', 'violin II and viola', 'Inner harmony in repeated 8ths or broken chords.', ['arco', 'lyra']),
      seat('cello', 'cello and bass', 'Simple, buoyant bass: roots on the strong beats, rests that let it breathe.', ['arco', 'lyra']),
      seat('piano', 'fortepiano', 'Alberti bass in the left hand, melody with clean scales in the right.', ['lyra', 'kera']),
      seat('woodwinds', 'oboes, flutes, horns', 'Sustain the harmony in pairs; take the second theme.', ['aulos', 'cornu', 'pneuma']),
    ],
    bandGenre: 'classical',
    rhythm: ['Light and regular; upbeats lead to downbeats.', 'Accompaniment figures (Alberti, repeated chords) keep the pulse so the melody can sing.'],
    arrangement: ['Melody plus accompaniment (homophony), with short bursts of imitation.', 'Balance and symmetry: if a phrase goes up, its answer comes down.'],
    production: ['Chamber hall, natural stereo image.', 'Wide but not extreme dynamics; subito piano after a forte is the classic surprise.'],
    avoid: ['Thick chromatic harmony.', 'Heavy bass doubling.', 'Unbroken legato: articulation is detached and elegant.'],
    mix: { lufs: [-22, -16], note: 'Transparent; violins slightly forward.' },
    renderTags: ['classical', 'string quartet', 'chamber orchestra', 'elegant', 'sonata'],
    vocals: 'none',
  },
  {
    id: 'classical-romantic', label: 'Romantic orchestral', family: 'classical',
    match: /\b(romantic(?: era)?|chopin|tchaikovsky|brahms|rachmaninoff|nocturne|rhapsody|lush orchestra|orchestral|classical|symphonic poem|waltz)\b/i,
    tempo: [52, 132], defaultTempo: 76, meter: [4, 4], swing: 0, swingGrid: 8, halfTime: false,
    modes: ['minor', 'major', 'harmonic'], tonics: [Db, E, C, D, Ab, B, F], colour: 2, harmonicRhythm: 1,
    progressions: ['i | bVI | iv | V7', 'I | vi | IV | V7', 'i | iv | bVII7 | bIII | bVI | iidim | V7 | i', 'I | V7/vi | vi | V7/V | V7 | I'],
    harmonyNotes: ['Chromatic voice leading: inner voices move by semitone between chords.', 'Secondary dominants and diminished sevenths lean into every important chord.', 'Delay the cadence: deceptive resolution (V7 to bVI or vi) before the real one.', 'Melody appoggiaturas on the strong beat, resolving down by step.'],
    form: [
      s('intro', 4, 0.2, 'Low strings or piano set the key and the rocking accompaniment.'),
      s('theme', 8, 0.4, 'The long melody, cantabile, in one instrument.'),
      s('theme', 8, 0.55, 'Melody repeats an octave higher with fuller harmony and a counter-melody.'),
      s('development', 8, 0.75, 'Agitated middle: new key, sequence rising by step, accelerando.'),
      s('recap', 8, 1, 'The melody returns in full orchestra, fortissimo, broad.', 'Apotheosis'),
      s('coda', 6, 0.2, 'Dying away: fragments of the melody over a tonic pedal, final pianissimo chord.'),
    ],
    barsPerLine: 2,
    lineup: [
      seat('violin', 'violins', 'The melody with full vibrato and portamento between wide leaps; divisi octaves at the climax.', ['arco', 'lyra']),
      seat('cello', 'cellos', 'Tenor counter-melody; the tune itself on its second statement.', ['arco', 'lyra']),
      seat('piano', 'concert grand', 'Wide arpeggios across three octaves, melody voiced on top, generous pedal.', ['lyra', 'kera']),
      seat('woodwinds', 'clarinet, oboe, flute', 'Solo answers between string phrases; clarinet in its low chalumeau register for warmth.', ['aulos', 'pneuma']),
      seat('trumpet', 'horns and brass', 'Horns sustain the harmony and swell; full brass only at the apotheosis.', ['cornu', 'lyra']),
      seat('percussion', 'timpani and harp', 'Timpani rolls under crescendos; harp arpeggios in the quiet statements.', ['soma', 'tonos']),
    ],
    bandGenre: 'classical',
    rhythm: ['Rubato: push toward the phrase peak, relax away from it.', 'Triplet or rocking accompaniment against a duple melody.'],
    arrangement: ['One great melody, restated three times with growing forces.', 'The climax is prepared by a long dominant pedal and a rising sequence.'],
    production: ['Large concert hall. Strings lush and close-blended.', 'Let pianissimo be near silence and fortissimo fill the room.'],
    avoid: ['Metronomic time.', 'Short choppy phrases.', 'Triad-only harmony.'],
    mix: { lufs: [-22, -15], note: 'Do not squeeze the dynamic range; it is the expression.' },
    renderTags: ['romantic', 'orchestral', 'lush strings', 'expressive', 'classical', 'sweeping'],
    vocals: 'optional', vocalNote: 'Art-song or operatic writing: long legato lines, the vowel carries the note.',
  },
  {
    id: 'classical-impressionist', label: 'Impressionist', family: 'classical',
    match: /\b(impressionis\w*|debussy|ravel|satie|whole[- ]tone|dreamy piano|watercolou?r|gymnop\w*)\b/i,
    tempo: [50, 100], defaultTempo: 66, meter: [4, 4], swing: 0, swingGrid: 8, halfTime: false,
    modes: ['lydian', 'dorian', 'mixolydian', 'major'], tonics: [Db, E, Fs, D, G, Ab], colour: 3, harmonicRhythm: 2,
    progressions: ['Imaj9 | Imaj9 | bVIImaj9 | bVIImaj9', 'Imaj7 | bIIImaj7 | bVImaj7 | bIImaj7', 'IVmaj7 | iii7 | IVmaj7 | Imaj9'],
    harmonyNotes: ['Chords are colours, not functions: move a major-ninth shape in parallel.', 'Avoid the dominant-to-tonic cadence; end on an added-sixth or ninth chord.', 'Pentatonic and whole-tone melodies over modal harmony.'],
    form: [
      s('intro', 4, 0.15, 'A single sonority, arpeggiated, with the pedal down.'),
      s('theme', 8, 0.3, 'A floating melody in the flute or piano right hand, unhurried.'),
      s('development', 8, 0.5, 'Parallel chords drift to a distant key; harp and strings shimmer.'),
      s('theme', 8, 0.35, 'The melody returns, re-harmonised.'),
      s('coda', 4, 0.1, 'The opening sonority, higher and quieter.'),
    ],
    barsPerLine: 2,
    lineup: [
      seat('piano', 'piano', 'Wash of arpeggios with half-pedal; melody in octaves with a fifth inside.', ['lyra', 'kera']),
      seat('woodwinds', 'flute and clarinet', 'Solo arabesques, low flute, breathy tone.', ['aulos', 'pneuma']),
      seat('violin', 'muted strings', 'Divisi tremolo and harmonics, sur la touche.', ['arco', 'lyra']),
      seat('percussion', 'harp, celesta, antique cymbals', 'Glissandi and bell tones that mark the changes of colour.', ['tonos', 'vela']),
      seat('cello', 'cellos and basses', 'Soft pedal fifths; pizzicato.', ['arco']),
    ],
    bandGenre: 'classical',
    rhythm: ['Bar lines blur: ties over the beat, triplets against duplets.', 'Tempo breathes constantly.'],
    arrangement: ['Colour is the subject: change instrument on each restatement.', 'Thin textures, many soloists, almost never tutti.'],
    production: ['Soft, diffuse hall; pedal resonance is part of the sound.', 'Nothing loud for long.'],
    avoid: ['Strong cadences.', 'Driving rhythm.', 'Heavy brass.'],
    mix: { lufs: [-24, -17], note: 'Soft, wide and transparent.' },
    renderTags: ['impressionist', 'dreamy piano', 'harp', 'flute', 'ethereal', 'classical'],
    vocals: 'none',
  },
  {
    id: 'classical-minimalist', label: 'Minimalist', family: 'classical',
    match: /\b(minimalis\w*|philip glass|steve reich|arvo p\w+rt|max richter|einaudi|neo[- ]?classical|post[- ]?minimal|phasing|repetitive strings)\b/i,
    tempo: [60, 144], defaultTempo: 112, meter: [4, 4], swing: 0, swingGrid: 8, halfTime: false,
    modes: ['minor', 'major', 'dorian'], tonics: [A, D, E, C, G, F], colour: 1, harmonicRhythm: 4,
    progressions: ['i | i | i | i | bVI | bVI | bVI | bVI | bIII | bIII | bIII | bIII | bVII | bVII | bVII | bVII', 'I | I | iii | iii | vi | vi | IV | IV', 'i | i | bVII | bVII | bVI | bVI | V | V'],
    harmonyNotes: ['Harmony changes slowly, one chord for 4 to 8 bars, so each change is an event.', 'Change one note of the arpeggio at a time: the chord morphs instead of switching.', 'Add voices by octave and fifth doublings, not new harmony.'],
    form: [
      s('intro', 8, 0.2, 'One cell: a 3- or 5-note arpeggio pattern, alone.'),
      s('theme', 16, 0.4, 'A second voice enters with the same cell offset or lengthened; bass enters on whole notes.'),
      s('build', 16, 0.65, 'Additive process: the cell grows a note every 4 bars; strings double.'),
      s('development', 16, 0.85, 'Full ensemble pulsing; a slow melody in long notes finally appears on top.'),
      s('coda', 8, 0.2, 'Subtract in the reverse order until the first cell is alone again.'),
    ],
    barsPerLine: 4,
    lineup: [
      seat('piano', 'piano', 'Steady arpeggio cells, even touch, no rubato; left hand whole-note bass.', ['lyra', 'kera']),
      seat('violin', 'violins', 'Pulsing repeated 8ths, then the slow melody in long bows.', ['arco', 'lyra']),
      seat('cello', 'cello', 'Whole-note bass and a tenor counter-line in the last third.', ['arco', 'lyra']),
      seat('synth', 'organ pad and tape', 'A soft sustained fifth under everything; tape hiss and room.', ['ison', 'aura', 'onda']),
      seat('woodwinds', 'clarinets and marimba', 'Interlocking patterns that phase against the piano.', ['aulos', 'soma']),
    ],
    bandGenre: 'classical',
    rhythm: ['Constant 8th or 16th pulse; patterns of 3 against the bar of 4 create the motion.', 'No fills, no rubato.'],
    arrangement: ['Process is the form: add, lengthen, double, then subtract.', 'The listener should be able to hear each change.'],
    production: ['Intimate and close; felt piano, bow noise.', 'Gentle long reverb; subtle saturation.'],
    avoid: ['Fast harmonic rhythm.', 'Virtuosic melody.', 'Percussion-led groove.'],
    mix: { lufs: [-20, -14], note: 'Even and hypnotic; no instrument jumps out.' },
    renderTags: ['minimalist', 'neoclassical', 'piano arpeggios', 'string ensemble', 'repetitive', 'contemplative'],
    vocals: 'optional', vocalNote: 'Wordless or Latin text on long notes.',
  },
];

// ─── Jazz ───────────────────────────────────────────────────────────────────────

const JAZZ_RHYTHM = seat('drums', 'drum kit', 'Ride cymbal carries the time (ding, ding-a-ding), hi-hat on 2 and 4, feathered kick, snare comments on the soloist.', ['meka', 'soma']);
const JAZZ_PIANO = seat('piano', 'piano', 'Comp with rootless left-hand voicings (3rd and 7th on the bottom), on the upbeats, leaving space for the soloist.', ['lyra', 'kera']);

const JAZZ: StylePack[] = [
  {
    id: 'jazz-swing', label: 'Swing and bebop', family: 'jazz',
    match: /\b(bebop|bop|swing|straight[- ]ahead|hard bop|jazz quartet|jazz quintet|jazz combo|standards?|jazz)\b/i,
    tempo: [120, 260], defaultTempo: 168, meter: [4, 4], swing: 1, swingGrid: 8, halfTime: false,
    modes: ['major', 'minor'], tonics: [F, Bb, Eb, C, Ab, G], colour: 3, harmonicRhythm: 1,
    progressions: [
      'Imaj7 VI7 | ii7 V7 | iii7 VI7 | ii7 V7 | Imaj7 I7 | IVmaj7 #IVdim7 | iii7 VI7 | ii7 V7',
      'III7 | III7 | VI7 | VI7 | II7 | II7 | V7 | V7',
      'ii7 | V7 | Imaj7 | Imaj7 | iiø7/vi | V7/vi | vi7 | II7',
    ],
    harmonyNotes: ['ii–V–I is the sentence; tritone substitution (bII7 for V7) and secondary ii–Vs are the vocabulary.', 'Voice-lead guide tones: the 7th of one chord falls to the 3rd of the next.', 'Bebop lines put chord tones on the beat and chromatic approach notes off it; enclosures around the target.', 'Flat keys suit the horns (F, Bb, Eb, Ab).'],
    form: [
      s('intro', 8, 0.45, 'Rhythm section vamp or a piano intro on the last 8 bars of the tune.'),
      s('head', 32, 0.6, 'The melody, AABA: horns in unison or thirds, rhythm section in two-feel for the A sections, walking on the bridge.', 'Head in'),
      s('solo', 32, 0.75, 'First soloist over the form; bass walks, drums build through the chorus.', 'Solo chorus'),
      s('solo', 32, 0.8, 'Second soloist; piano lays out for the first 8 to change the colour.', 'Solo chorus'),
      s('interlude', 16, 0.85, 'Trading fours between the soloists and drums.', 'Trading fours'),
      s('head', 32, 0.7, 'The melody returns.', 'Head out'),
      s('coda', 4, 0.6, 'Tag the last four bars three times, ritard, final chord with a held fermata (a 6/9 or maj7#11).'),
    ],
    barsPerLine: 2,
    lineup: [
      seat('sax', 'tenor or alto sax', 'Play the head with a relaxed, behind-the-beat sound; solo in long 8th-note lines with breath between ideas.', ['lyra', 'aulos']),
      seat('trumpet', 'trumpet', 'Harmonise the head a third above or play unison; solo with space and a clear high point.', ['cornu', 'lyra']),
      JAZZ_PIANO, UPRIGHT, JAZZ_RHYTHM,
    ],
    bandGenre: 'jazz',
    rhythm: ['Swung 8ths: long-short, with the accent on the upbeat.', 'Bass and ride cymbal play four even quarters; everything else dances around them.', 'Comping is conversational: short stabs on the "and" of 2 and 4, never a repeated pattern.'],
    arrangement: ['Head, solos, head. The arrangement is the form and who lays out when.', 'Each solo chorus builds: start low and sparse, peak in the last 8 bars.', 'Kicks and stop-time under the last A of the head.'],
    production: ['One room, players close together, natural bleed. Dry upright with finger noise, dark ride.', 'Almost no compression or effects; plate or room reverb only.'],
    avoid: ['Quantised straight 8ths.', 'Root-position block triads in the piano.', 'Bass playing roots only.', 'A backbeat snare on 2 and 4.'],
    mix: { lufs: [-18, -13], note: 'Wide dynamics; soloist forward, bass clearly audible and woody.' },
    renderTags: ['jazz', 'bebop', 'swing', 'upright bass', 'ride cymbal', 'saxophone', 'acoustic jazz quartet'],
    vocals: 'optional', vocalNote: 'Sing behind the beat, bend into notes, scat a chorus.',
  },
  {
    id: 'jazz-modal', label: 'Modal and cool', family: 'jazz',
    match: /\b(modal jazz|cool jazz|kind of blue|miles davis|coltrane|spiritual jazz|ecm|west coast jazz)\b/i,
    tempo: [96, 160], defaultTempo: 132, meter: [4, 4], swing: 0.85, swingGrid: 8, halfTime: false,
    modes: ['dorian', 'mixolydian', 'lydian', 'phrygian'], tonics: [D, G, C, F, Eb], colour: 3, harmonicRhythm: 8,
    progressions: ['i7 | i7 | i7 | i7 | i7 | i7 | i7 | i7', 'bii7 | bii7 | bii7 | bii7 | bii7 | bii7 | bii7 | bii7', 'i7 | i7 | IV7 | IV7'],
    harmonyNotes: ['One mode for 8 or 16 bars; the bridge moves the whole thing up a semitone.', 'Voicings built in fourths (quartal), with the 6th of dorian as the colour note.', 'Solos develop a motif instead of running changes.'],
    form: [
      s('intro', 8, 0.3, 'Bass figure and piano fourths answer each other, out of time or lightly in time.'),
      s('head', 32, 0.5, 'A simple riff-like theme: 16 bars on the home mode, 8 up a semitone, 8 home.', 'Head in'),
      s('solo', 32, 0.6, 'Trumpet solo: few notes, long tones, space.', 'Solo chorus'),
      s('solo', 32, 0.75, 'Sax solo: denser, building sheets of sound toward the bridge.', 'Solo chorus'),
      s('solo', 32, 0.55, 'Piano solo, sparse; bass and drums drop to a whisper.', 'Solo chorus'),
      s('head', 32, 0.5, 'Theme again.', 'Head out'),
      s('outro', 8, 0.25, 'Vamp on the home mode and fade.'),
    ],
    barsPerLine: 2,
    lineup: [
      seat('trumpet', 'muted trumpet', 'Harmon mute close on the mic; lyrical, unhurried, lets notes hang.', ['cornu', 'lyra']),
      seat('sax', 'tenor sax', 'Explore the mode in long arcs; pentatonics a fifth above the root.', ['lyra', 'aulos']),
      seat('piano', 'piano', 'Quartal voicings, planing in parallel; lots of space.', ['lyra', 'kera']),
      seat('bass', 'upright bass', 'Pedal and ostinato figures as much as walking; anchor the mode.', ['lyra', 'bajo']),
      seat('drums', 'drum kit', 'Light ride, brushes on the head; cymbal colours rather than drive.', ['meka', 'soma']),
    ],
    bandGenre: 'jazz',
    rhythm: ['Relaxed swing, wide beat; the ride pattern loosens.', 'Bass ostinato can replace walking for whole sections.'],
    arrangement: ['Space is the arrangement.', 'Mark the bridge by everyone shifting up together.'],
    production: ['Warm, roomy, slightly dark. Tape saturation.', 'Trumpet intimate and dry against a roomier band.'],
    avoid: ['Fast ii–V harmony.', 'Busy comping.', 'Bright, hyped cymbals.'],
    mix: { lufs: [-19, -14], note: 'Air and room; nothing pushed.' },
    renderTags: ['modal jazz', 'cool jazz', 'muted trumpet', 'upright bass', 'brushes', 'spacious'],
    vocals: 'none',
  },
  {
    id: 'jazz-ballad', label: 'Jazz ballad', family: 'jazz',
    match: /\b(jazz ballad|torch song|smoky|late[- ]night jazz|lounge jazz|crooner|piano trio ballad)\b/i,
    tempo: [48, 76], defaultTempo: 60, meter: [4, 4], swing: 0.6, swingGrid: 8, halfTime: false,
    modes: ['major', 'minor'], tonics: [Eb, F, Bb, Ab, Db, C], colour: 3, harmonicRhythm: 1,
    progressions: ['Imaj7 vi7 | ii7 V7 | iii7 VI7 | ii7 V7', 'Imaj7 | iiø7/ii V7/ii | ii7 | V7 | iii7 | bIIIdim7 | ii7 | V7', 'IVmaj7 | iv7 bVII7 | Imaj7 | VI7'],
    harmonyNotes: ['Rich substitutions: tritone subs, the backdoor dominant (iv7 to bVII7 to I).', 'Every chord has a 9th, 11th or 13th; alter the dominants (b9, #5) that resolve to minor chords.', 'The melody is rephrased each time, never played straight twice.'],
    form: [
      s('intro', 4, 0.2, 'Solo piano, rubato, on the last four bars.'),
      s('head', 32, 0.4, 'The melody, sung or on tenor sax, with brushes and a two-feel bass.', 'Head in'),
      s('solo', 16, 0.5, 'Half-chorus solo; the feel may lift to double time for 8 bars.', 'Solo half-chorus'),
      s('head', 16, 0.45, 'Return at the bridge and take it out.', 'Head out (from the bridge)'),
      s('coda', 4, 0.2, 'Cadenza from the soloist, then the last chord rolled from the bottom up.'),
    ],
    barsPerLine: 4,
    lineup: [
      seat('sax', 'tenor sax', 'Breathy subtone, wide slow vibrato at the end of notes, lag behind the beat.', ['lyra', 'aulos']),
      seat('piano', 'piano', 'Fill the gaps between phrases with quiet runs and re-harmonisations.', ['lyra', 'kera']),
      seat('bass', 'upright bass', 'Half notes on 1 and 3 with a long warm sustain; walk only in the bridge.', ['lyra', 'bajo']),
      seat('drums', 'brushes', 'Stirring brushes on the snare, soft hi-hat on 2 and 4, no sticks.', ['meka', 'soma']),
      seat('guitar', 'archtop guitar', 'Soft four-to-the-bar chords or single-note fills.', ['lyra', 'tonos']),
    ],
    bandGenre: 'ballad',
    rhythm: ['Two-feel; time is elastic and everyone breathes with the soloist.', 'Brushes sweep a continuous texture.'],
    arrangement: ['The lyric (or the lead line) is everything; the band answers only in its rests.', 'One chorus and a half is the whole performance.'],
    production: ['Very close, warm, dark: ribbon-mic tone, audible breath.', 'Long plate reverb, low in the mix.'],
    avoid: ['Rushing.', 'Dense comping under the melody.', 'Loud drums.'],
    mix: { lufs: [-20, -15], note: 'Intimate; lead well forward.' },
    renderTags: ['jazz ballad', 'smoky', 'tenor saxophone', 'brushes', 'slow', 'late night', 'warm'],
    vocals: 'typical', vocalNote: 'Close-mic, conversational phrasing, behind the beat, sparing vibrato at line ends.',
  },
  {
    id: 'jazz-bossa', label: 'Bossa nova', family: 'jazz',
    match: /\b(bossa(?: nova)?|samba jazz|brazilian jazz|jobim|ipanema)\b/i,
    tempo: [112, 148], defaultTempo: 130, meter: [4, 4], swing: 0, swingGrid: 16, halfTime: false,
    modes: ['major', 'minor'], tonics: [F, C, D, G, A, Eb], colour: 3, harmonicRhythm: 2,
    progressions: ['Imaj7 | Imaj7 | II7 | II7 | ii7 | bII7 | Imaj7 | bII7', 'i7 | i7 | iiø7 | V7 | i7 | i7 | iv7 | bVII7', 'IVmaj7 | IV7 | iii7 | VI7 | ii7 | V7 | Imaj7 | Imaj7'],
    harmonyNotes: ['Chromatic descending inner lines; tritone subs sliding into the tonic.', 'Guitar voicings with the 3rd and 7th on the middle strings, 9ths and 13ths on top.', 'Major and minor versions of the same chord alternate (IVmaj7 to iv6).'],
    form: [
      s('intro', 8, 0.3, 'Nylon guitar alone sets the pattern.'),
      s('head', 32, 0.45, 'Melody, soft and almost spoken; flute answers.', 'Head in'),
      s('solo', 32, 0.5, 'Flute or sax solo, melodic, close to the tune.', 'Solo chorus'),
      s('head', 32, 0.45, 'Melody again.', 'Head out'),
      s('outro', 8, 0.3, 'Vamp between I and bII7 and fade.'),
    ],
    barsPerLine: 4,
    lineup: [
      seat('guitar', 'nylon-string guitar', 'Thumb plays the bass on 1 and 3; fingers pluck the syncopated chord pattern.', ['tonos', 'lyra']),
      seat('bass', 'upright bass', 'Root and fifth, dotted-quarter then eighth, light.', ['lyra', 'bajo']),
      seat('drums', 'drums (brushes and rim)', 'Cross-stick plays the bossa clave; straight 8ths on closed hat.', ['meka', 'soma']),
      seat('percussion', 'shaker and pandeiro', 'Even 16ths, barely there.', ['soma', 'meka']),
      seat('woodwinds', 'flute', 'Answer the vocal phrases; airy tone.', ['aulos', 'pneuma']),
      seat('piano', 'piano', 'Sparse high voicings; never doubles the guitar rhythm.', ['lyra', 'kera']),
    ],
    bandGenre: 'bossa',
    rhythm: ['Straight 8ths, never swung. The guitar anticipates chord changes by an 8th.', 'Bossa clave on the rim: 3 hits then 2 across two bars.'],
    arrangement: ['Understatement. Nothing is loud.', 'The guitar pattern is the arrangement; others decorate.'],
    production: ['Dry, close and soft; small room.', 'Voice and guitar near-equal.'],
    avoid: ['Heavy kick.', 'Swing feel.', 'Loud dynamics.'],
    mix: { lufs: [-19, -14], note: 'Gentle and warm.' },
    renderTags: ['bossa nova', 'nylon guitar', 'soft percussion', 'brazilian jazz', 'relaxed', 'flute'],
    vocals: 'typical', vocalNote: 'Quiet, vibrato-less, almost whispered, right on the mic.',
  },
  {
    id: 'jazz-fusion', label: 'Fusion and jazz-funk', family: 'jazz',
    match: /\b(fusion|jazz[- ]?funk|jazz[- ]?rock|headhunters|weather report|snarky|nu[- ]?jazz|acid jazz|smooth jazz)\b/i,
    tempo: [88, 132], defaultTempo: 104, meter: [4, 4], swing: 0.15, swingGrid: 16, halfTime: false,
    modes: ['dorian', 'mixolydian', 'minor'], tonics: [E, A, D, G, C, F], colour: 3, harmonicRhythm: 2,
    progressions: ['i9 | i9 | IV13 | IV13', 'i11 | bVIImaj7 | bVImaj7 | V7#9', 'IVmaj7 | iii7 | ii7 | Imaj7'],
    harmonyNotes: ['Vamps on one or two chords under a written unison line.', 'Slash chords and sus chords; the dominant is 7sus or 7#9.', 'Unison heads between bass, keys and horns in 16ths.'],
    form: [
      s('intro', 8, 0.5, 'Drums and bass set the groove; clav or Rhodes joins.'),
      s('head', 16, 0.7, 'Tight unison melody with horn stabs.', 'Head'),
      s('bridge', 8, 0.6, 'Half-time or a floating chord sequence; contrast.'),
      s('solo', 32, 0.8, 'Synth or sax solo over the vamp, band builds with it.', 'Solo'),
      s('head', 16, 0.75, 'Head again.', 'Head out'),
      s('outro', 8, 0.85, 'Vamp with a drum solo over hits; hard ending on a unison figure.'),
    ],
    barsPerLine: 2,
    lineup: [
      seat('drums', 'drum kit', 'Syncopated 16th funk groove with ghost notes; displaced kicks, tight hats.', ['meka', 'soma']),
      seat('bass', 'electric bass', 'Finger or slap 16th lines locked to the kick; octaves and dead notes.', ['lyra', 'bajo']),
      seat('piano', 'Rhodes and clavinet', 'Rhodes pads with tremolo; clavinet chops in the gaps.', ['lyra', 'aura', 'kera']),
      seat('synth', 'lead synth', 'Mono lead with pitch bend and portamento for the solo.', ['aura', 'onda']),
      seat('sax', 'horn section', 'Unison lines and tight stabs.', ['lyra', 'cornu', 'aulos']),
      seat('guitar', 'electric guitar', 'Muted single-note funk lines and 9th-chord scratches.', ['lyra']),
    ],
    bandGenre: 'funk',
    rhythm: ['16th-note grid, light swing; the "one" is heavy.', 'Odd-metre or displaced hits in the head are idiomatic.'],
    arrangement: ['Interlocking parts: no two instruments play the same rhythm except in written unisons.', 'Solos build by density and register together with the drummer.'],
    production: ['Tight, punchy, dry drums; DI bass with a little grit.', 'Chorus and phaser on the Rhodes.'],
    avoid: ['Walking bass.', 'Loose time.', 'Muddy low-mid from doubled keys and guitar.'],
    mix: { lufs: [-14, -10], note: 'Punchy rhythm section; bass and kick as one instrument.' },
    renderTags: ['jazz fusion', 'jazz funk', 'rhodes', 'slap bass', 'tight drums', 'synth lead'],
    vocals: 'optional',
  },
  {
    id: 'jazz-bigband', label: 'Big band', family: 'jazz',
    match: /\b(big band|swing orchestra|count basie|ellington|jazz orchestra|shout chorus)\b/i,
    tempo: [112, 220], defaultTempo: 152, meter: [4, 4], swing: 1, swingGrid: 8, halfTime: false,
    modes: ['major', 'minor'], tonics: [Bb, F, Eb, Ab, C, Db], colour: 3, harmonicRhythm: 1,
    progressions: ['I7 | IV7 | I7 | I7 | IV7 | #IVdim7 | I7 | VI7 | ii7 | V7 | I7 VI7 | ii7 V7', 'Imaj7 VI7 | ii7 V7 | iii7 VI7 | ii7 V7'],
    harmonyNotes: ['Saxes in five-part close harmony (drop 2 when it gets high); brass in spread voicings over them.', 'Riffs: a two-bar blues figure repeated over changing harmony.', 'The shout chorus stacks trumpets on top in their upper register.'],
    form: [
      s('intro', 8, 0.7, 'Full-band figure or a piano intro, Basie style.'),
      s('head', 24, 0.6, 'Saxes play the tune; brass answer with muted punches.', 'Head (two blues choruses)'),
      s('solo', 24, 0.65, 'Tenor solo with rhythm section; backgrounds enter on the second chorus.', 'Solo with backgrounds'),
      s('interlude', 12, 0.75, 'Sax soli: the whole section in harmony on a written bebop line.', 'Sax soli'),
      s('chorus', 12, 1, 'Shout chorus: whole band, fortissimo, drum fills in the holes.', 'Shout chorus'),
      s('head', 12, 0.5, 'Suddenly soft: the tune once more, rhythm section and saxes.', 'Head out'),
      s('coda', 4, 0.9, 'Final tutti hit with a high trumpet on top.'),
    ],
    barsPerLine: 2,
    lineup: [
      seat('sax', 'sax section (2 altos, 2 tenors, bari)', 'Lead the melody in close harmony; blend vibrato to the lead alto.', ['lyra', 'aulos']),
      seat('trumpet', 'trumpets and trombones', 'Punches, plunger and cup mutes, the lead trumpet tops the shout.', ['cornu', 'lyra']),
      JAZZ_PIANO, UPRIGHT,
      seat('drums', 'drum kit', 'Set up every band figure with a fill; kick the hits with the brass.', ['meka', 'soma']),
      seat('guitar', 'rhythm guitar', 'Four quarter-note chords to the bar, felt more than heard.', ['lyra']),
    ],
    bandGenre: 'jazz',
    rhythm: ['Hard swing; section figures are anticipated by an 8th and set up by the drummer.', 'Rhythm guitar and bass in unbroken four.'],
    arrangement: ['Call and response between saxes and brass.', 'Dynamics by section size: soli, backgrounds, tutti.', 'The loudest moment is the shout chorus; drop to almost nothing right after.'],
    production: ['Large live room, the band recorded together; brass slightly distant.', 'Natural dynamics.'],
    avoid: ['Everyone playing all the time.', 'Straight 8ths.', 'Synth pads.'],
    mix: { lufs: [-18, -12], note: 'Section blend first; the shout must feel physically bigger.' },
    renderTags: ['big band', 'swing', 'brass section', 'saxophone section', 'jazz orchestra', 'energetic'],
    vocals: 'optional', vocalNote: 'Band singer takes one chorus in the middle.',
  },
];

// ─── Electronic ─────────────────────────────────────────────────────────────────

const FOUR_FLOOR = seat('drums', 'drum machine (909/808)', 'Kick on every quarter; clap or snare on 2 and 4; open hat on the offbeat 8ths; 16th closed hats with velocity movement.', ['meka', 'soma']);
const CLUB_FORM_NOTE = 'DJ-friendly: 16–32 bars of drums at the start and end so the track can be mixed.';

const ELECTRONIC: StylePack[] = [
  {
    id: 'edm-house', label: 'House', family: 'electronic',
    match: /\b(house|piano house|funky house|disco house|chicago house|french house|club)\b/i,
    tempo: [120, 128], defaultTempo: 124, meter: [4, 4], swing: 0.12, swingGrid: 16, halfTime: false,
    modes: ['minor', 'dorian', 'major'], tonics: [A, F, G, C, D, E], colour: 2, harmonicRhythm: 1,
    progressions: ['i7 | iv7 | bVII | bIIImaj7', 'bVImaj7 | bVII | i7 | i7', 'I | V | vi | IV'],
    harmonyNotes: ['Piano and organ stabs in 7th and 9th chords, played off the beat.', 'A two- or four-bar loop for the whole track; filters and layers create the form.', 'Bass notes sit between the kicks (offbeat) or follow a syncopated octave line.'],
    form: [
      s('intro', 16, 0.35, 'Kick, hats and a filtered hint of the chords. ' + CLUB_FORM_NOTE),
      s('verse', 16, 0.55, 'Bass enters; chords open up; vocal or lead hook teases.', 'Groove'),
      s('breakdown', 8, 0.3, 'Kick out. Chords and vocal alone, filter opening.'),
      s('build', 8, 0.6, 'Snare roll and riser; high-pass everything; one beat of silence before the drop.'),
      s('drop', 32, 0.9, 'Full groove: kick, bass, chord stabs, hook.', 'Drop'),
      s('breakdown', 16, 0.35, 'Second breakdown, longer, with the full vocal or a new chord inversion.'),
      s('build', 8, 0.65, 'Build again, bigger.'),
      s('drop', 32, 1, 'Final drop with an added layer (extra percussion, counter-melody).', 'Drop 2'),
      s('outro', 16, 0.35, 'Strip back to drums and bass for the mix-out.'),
    ],
    barsPerLine: 2,
    lineup: [
      FOUR_FLOOR,
      seat('bass', 'bass synth', 'Short offbeat notes or a rolling octave line; sidechained to the kick.', ['bajo', 'onda', 'aura']),
      seat('piano', 'house piano and organ', 'Syncopated chord stabs (the classic M1 piano/organ), accents on the "and".', ['aura', 'kera', 'lyra']),
      seat('synth', 'pads, strings and lead', 'Filtered pad under the breakdown; disco string runs; a simple top-line hook.', ['aura', 'onda']),
      seat('percussion', 'congas, shaker, rides', 'Shaker 16ths and conga pattern for swing; ride in the second drop.', ['soma', 'meka']),
    ],
    bandGenre: 'house',
    rhythm: ['Four-on-the-floor with swung 16th hats (55–58%).', 'The offbeat open hat is the lift.', 'Claps layered slightly early for snap.'],
    arrangement: ['Change something every 8 bars: add, remove or filter one element.', 'Remove the kick to create tension; its return is the payoff.', 'Phrases are 8, 16 and 32 bars, always.'],
    production: ['Sidechain bass and pads to the kick so the kick owns the low end.', 'Kick fundamental 50–60 Hz, short tail; mono below 120 Hz.', 'Low-pass filter sweeps on the chord bus are the main expressive control.'],
    avoid: ['Kick and bass hitting the same sub at once without sidechain.', 'Fills that break the dancefloor pulse.', 'Changing the chord loop mid-track.'],
    mix: { lufs: [-9, -6], note: 'Kick and bass first; everything else ducks around them.' },
    renderTags: ['house', 'four on the floor', 'piano stabs', 'groovy bassline', 'club', 'dance'],
    vocals: 'optional', vocalNote: 'Soulful diva hook or a chopped vocal phrase; short, repeated, on the offbeat.',
  },
  {
    id: 'edm-deep-house', label: 'Deep house', family: 'electronic',
    match: /\b(deep house|lo-?fi house|soulful house|organic house|afro house|amapiano)\b/i,
    tempo: [112, 124], defaultTempo: 120, meter: [4, 4], swing: 0.18, swingGrid: 16, halfTime: false,
    modes: ['minor', 'dorian'], tonics: [A, C, D, F, G, Eb], colour: 3, harmonicRhythm: 2,
    progressions: ['i9 | i9 | iv9 | iv9', 'i9 | bVImaj7 | bIIImaj7 | bVII', 'iv9 | bVII13 | bIIImaj9 | bVImaj7'],
    harmonyNotes: ['Jazz chords (minor 9ths, major 7ths) planed in parallel from a single sampled voicing.', 'The chord is often one sustained Rhodes or pad stab with a slow filter.', 'Bass is round and melodic, a sub with a soft attack.'],
    form: [
      s('intro', 16, 0.3, 'Soft kick, shaker, a filtered pad. ' + CLUB_FORM_NOTE),
      s('verse', 32, 0.5, 'Bass and Rhodes chords settle in; vocal phrases float over.', 'Groove'),
      s('breakdown', 16, 0.25, 'Kick drops out; pad and vocal breathe.'),
      s('drop', 32, 0.7, 'Groove returns with an extra percussion layer; no hard impact.', 'Return'),
      s('outro', 16, 0.3, 'Elements leave one by one.'),
    ],
    barsPerLine: 2,
    lineup: [
      seat('drums', 'drum machine', 'Soft round kick on every quarter, rimshot or snap on 2 and 4, loose swung hats.', ['meka', 'soma']),
      seat('bass', 'sub bass', 'Warm sine-like bass with a simple syncopated line; long notes.', ['bajo', 'onda']),
      seat('piano', 'Rhodes', 'Minor 9th stabs with tremolo and a slow low-pass filter.', ['lyra', 'aura', 'kera']),
      seat('synth', 'pads and plucks', 'Wide warm pad; a delayed pluck motif.', ['aura', 'onda']),
      seat('percussion', 'shaker, bongos, log drum', 'Hand percussion gives the human feel; log-drum bass hits for amapiano.', ['soma', 'meka']),
    ],
    bandGenre: 'house',
    rhythm: ['Laid-back four-on-the-floor; swing heavier than classic house.', 'Percussion slightly behind the grid.'],
    arrangement: ['Subtle: long sections, gradual filter moves, no big risers.', 'A vocal phrase or a sax line is the hook.'],
    production: ['Warm and muted top end; vinyl or tape texture.', 'Gentle sidechain; reverb and delay tails fill the space.'],
    avoid: ['Aggressive supersaws.', 'Snare rolls and white-noise builds.', 'Bright, harsh hats.'],
    mix: { lufs: [-11, -8], note: 'Warm low-mids, smooth top; less loud than festival styles.' },
    renderTags: ['deep house', 'warm', 'rhodes chords', 'sub bass', 'smooth', 'late night', 'groove'],
    vocals: 'optional', vocalNote: 'Breathy, intimate, heavily reverbed phrases.',
  },
  {
    id: 'edm-tech-house', label: 'Tech house', family: 'electronic',
    match: /\b(tech[- ]?house|minimal house|minimal tech)\b/i,
    tempo: [124, 130], defaultTempo: 126, meter: [4, 4], swing: 0.15, swingGrid: 16, halfTime: false,
    modes: ['minor', 'phrygian'], tonics: [F, G, A, E, D], colour: 0, harmonicRhythm: 4,
    progressions: ['i | i | i | i', 'i | i | i | bII'],
    harmonyNotes: ['Almost no harmony: one root note; the bassline is the hook.', 'Interest comes from a rhythmic bass riff of 2–3 pitches (root, b7, octave).'],
    form: [
      s('intro', 16, 0.4, 'Kick and percussion loop. ' + CLUB_FORM_NOTE),
      s('verse', 16, 0.6, 'Bass riff enters; vocal one-shot teases.', 'Groove'),
      s('breakdown', 8, 0.3, 'Kick out; filtered bass and a spoken vocal.'),
      s('build', 8, 0.6, 'Short tom or snare roll; riser.'),
      s('drop', 32, 0.9, 'Kick and bass slam back with the full percussion stack.', 'Drop'),
      s('breakdown', 8, 0.35, 'Quick strip-back.'),
      s('drop', 32, 0.95, 'Drop again with a new percussion fill pattern.', 'Drop 2'),
      s('outro', 16, 0.4, 'Drums and bass only.'),
    ],
    barsPerLine: 2,
    lineup: [
      seat('drums', 'drum machine', 'Punchy short kick, tight clap, shuffled hats, tom and rim fills at 8-bar joins.', ['meka', 'soma']),
      seat('bass', 'bass riff', 'A plucky, slightly distorted mid-bass riff over a clean sub; syncopated 16ths.', ['bajo', 'onda']),
      seat('percussion', 'percussion loops', 'Layered tops: shakers, congas, rides; each with its own swing.', ['soma', 'meka']),
      seat('synth', 'stabs and FX', 'One-note stabs, vocal chops, sweeps.', ['onda', 'aura']),
    ],
    bandGenre: 'house',
    rhythm: ['The groove lives in the percussion shuffle and the bass syncopation.', 'Kick is constant; everything else plays around it.'],
    arrangement: ['Loop-based: mute and unmute, filter, fill every 8 bars.', 'A spoken or shouted vocal phrase is the identity.'],
    production: ['Dry and punchy; short reverbs.', 'Hard sidechain; bass and kick tuned to each other.'],
    avoid: ['Chord progressions and big melodies.', 'Long reverb washes.'],
    mix: { lufs: [-8, -6], note: 'Kick and bass dominate; tops crisp.' },
    renderTags: ['tech house', 'rolling bassline', 'punchy kick', 'percussive', 'minimal', 'club'],
    vocals: 'optional', vocalNote: 'Spoken hooks and chopped one-shots.',
  },
  {
    id: 'edm-techno', label: 'Techno', family: 'electronic',
    match: /\b(techno|warehouse|berlin|peak[- ]?time|acid techno|industrial techno|hard techno)\b/i,
    tempo: [128, 145], defaultTempo: 134, meter: [4, 4], swing: 0, swingGrid: 16, halfTime: false,
    modes: ['minor', 'phrygian', 'locrian'], tonics: [A, F, G, D, E], colour: 0, harmonicRhythm: 8,
    progressions: ['i | i | i | i | i | i | i | i', 'i | i | i | i | bII | bII | i | i'],
    harmonyNotes: ['Texture and rhythm replace harmony. One tonal centre; a synth stab or drone gives the key.', 'Tension from the semitone above the root and from filter resonance, not from chord changes.'],
    form: [
      s('intro', 32, 0.4, 'Kick and a single hat; atmosphere creeps in. ' + CLUB_FORM_NOTE),
      s('verse', 32, 0.65, 'Rumble bass under the kick; the main synth sequence fades in through a filter.', 'Main groove'),
      s('breakdown', 16, 0.35, 'Kick out; the sequence opens fully; noise swells.'),
      s('drop', 32, 0.95, 'Kick returns with open hat and ride; sequence at full resonance.', 'Peak'),
      s('interlude', 16, 0.7, 'Variation: mute the lead, bring a second percussion idea.'),
      s('drop', 32, 1, 'Peak again with everything.', 'Peak 2'),
      s('outro', 32, 0.4, 'Deconstruct to kick and hat.'),
    ],
    barsPerLine: 2,
    lineup: [
      seat('drums', 'drum machine (909)', 'Hard, long kick on every beat; offbeat open hat; clap sparingly; ride in the peaks.', ['meka', 'soma']),
      seat('bass', 'rumble bass', 'The kick\'s reverb tail, low-passed and sidechained, makes the rolling sub between kicks.', ['bajo', 'onda']),
      seat('synth', 'sequence and stabs', 'A 16-step synth sequence (303 acid line or FM stab) that evolves by filter, resonance and decay.', ['onda', 'aura', 'bajo']),
      seat('percussion', 'metallic percussion', 'Clanks and industrial hits in polyrhythm (3 over 4).', ['soma', 'meka']),
      seat('organ', 'atmosphere', 'Drone, field noise, long reverbs.', ['aura', 'onda']),
    ],
    bandGenre: 'house',
    rhythm: ['Straight, relentless 16ths. Polyrhythmic loops of 3, 5 or 7 steps against the bar.', 'Hat and ride changes mark the sections.'],
    arrangement: ['Hypnosis: one idea developed for minutes by automation.', 'Long sections (16–32 bars); changes are slow and continuous.'],
    production: ['Kick is the lead instrument: saturated, with a controlled tail.', 'Reverb and delay sends as instruments; distortion on the drum bus.', 'Mono low end, wide dark atmosphere.'],
    avoid: ['Major keys and pop chord progressions.', 'Busy melodies.', 'Swing.'],
    mix: { lufs: [-8, -6], note: 'The kick-rumble relationship is the mix.' },
    renderTags: ['techno', 'dark', 'driving', 'hypnotic', 'rumbling kick', 'industrial', 'warehouse'],
    vocals: 'none',
  },
  {
    id: 'edm-detroit-techno', label: 'Detroit techno', family: 'electronic',
    match: /\b(detroit techno|detroit|belleville|hi[- ]?tech soul|machine soul|motor city|electro[- ]?funk techno)\b/i,
    tempo: [122, 135], defaultTempo: 128, meter: [4, 4], swing: 0.08, swingGrid: 16, halfTime: false,
    modes: ['minor', 'dorian'], tonics: [C, F, G, A, D], colour: 3, harmonicRhythm: 2,
    progressions: ['i9 | bVImaj7 | iv9 | bVII', 'i11 | i11 | bVImaj9 | bVImaj9', 'iv9 | v7 | i9 | i9'],
    harmonyNotes: ['Emotional minor 9th and 11th chords from a polysynth, moved in parallel: machine soul.', 'String-machine pads hold the harmony; a syncopated chord stab answers.', 'Bass is funk-derived: syncopated, melodic, from a mono synth.'],
    form: [
      s('intro', 16, 0.4, '909 kick and hats; the string pad fades in. ' + CLUB_FORM_NOTE),
      s('verse', 32, 0.6, 'Bassline and chord stabs lock; the pad melody appears.', 'Main groove'),
      s('breakdown', 16, 0.35, 'Strings alone with a filtered stab; kick returns in pickups.'),
      s('drop', 32, 0.85, 'Full groove with ride cymbal and a lead counter-line.', 'Return'),
      s('outro', 16, 0.4, 'Pad and drums fade out.'),
    ],
    barsPerLine: 2,
    lineup: [
      seat('drums', 'drum machine (909/808)', '909 kick, rimshot syncopation, crisp open hats; 808 claps and cowbell for electro colour.', ['meka', 'soma']),
      seat('bass', 'mono synth bass', 'Funky syncopated line with octave jumps.', ['bajo', 'aura', 'onda']),
      seat('synth', 'polysynth stabs', 'Short minor-9th stabs, off the beat, with chorus.', ['aura', 'onda']),
      seat('organ', 'string machine', 'High, wistful sustained strings; slow melody in the top note.', ['aura']),
      seat('percussion', 'percussion', 'Shaker and tom patterns; reversed cymbals.', ['soma', 'meka']),
    ],
    bandGenre: 'house',
    rhythm: ['Syncopated stabs against a steady kick; hats with a light shuffle.', 'Electro variants break the kick pattern (808, not four-on-the-floor).'],
    arrangement: ['Futurism with feeling: the pad carries a real melody.', 'Layer entries every 8 bars; breakdown leaves the strings exposed.'],
    production: ['Analogue warmth: chorus, tape delay, a little grit on the drums.', 'Less compressed and less dark than European techno.'],
    avoid: ['Pure noise-and-kick minimalism.', 'Trance-style supersaw builds.'],
    mix: { lufs: [-10, -7], note: 'Strings and stabs clearly audible over the drums.' },
    renderTags: ['detroit techno', 'analog strings', 'soulful', 'futuristic', '909 drums', 'synth stabs'],
    vocals: 'optional', vocalNote: 'Vocoder phrases or a spoken line.',
  },
  {
    id: 'edm-trance', label: 'Trance', family: 'electronic',
    match: /\b(trance|uplifting|psytrance|psy[- ]?trance|goa|anjuna\w*|euphoric)\b/i,
    tempo: [132, 142], defaultTempo: 138, meter: [4, 4], swing: 0, swingGrid: 16, halfTime: false,
    modes: ['minor'], tonics: [A, Fs, E, D, G, C], colour: 1, harmonicRhythm: 1,
    progressions: ['i | bVI | bIII | bVII', 'bVI | bVII | i | i', 'i | bVII | bVI | bVII'],
    harmonyNotes: ['Four-chord minor loop, one bar each (or two); the melody is diatonic and singable.', 'The lead arpeggio outlines the chord in 16ths with the top note carrying the tune.', 'Suspended 2nds and 4ths on the pads; the bass plays roots in offbeat 8ths or rolling 16ths.'],
    form: [
      s('intro', 32, 0.45, 'Kick, rolling bass and hats. ' + CLUB_FORM_NOTE),
      s('verse', 16, 0.6, 'Pluck arpeggio enters, filtered; a pad hints at the chords.', 'Groove'),
      s('breakdown', 32, 0.3, 'Kick and bass out. Piano or pad states the full melody; strings swell.'),
      s('build', 16, 0.7, 'Snare roll doubling every 4 bars, supersaw fading in, riser, a bar of silence.'),
      s('drop', 32, 1, 'Supersaw lead plays the melody over full drums and bass.', 'Climax'),
      s('outro', 32, 0.45, 'Lead out; return to kick and bass.'),
    ],
    barsPerLine: 4,
    lineup: [
      seat('drums', 'drum machine', 'Tight punchy kick every beat, offbeat open hat, clap on 2 and 4, constant 16th hats.', ['meka', 'soma']),
      seat('bass', 'rolling bass', 'Offbeat 8ths or three 16ths between kicks (the gallop), on the chord root.', ['bajo', 'onda']),
      seat('synth', 'supersaw lead and pluck', 'Detuned supersaw melody at the climax; delayed pluck arpeggio elsewhere.', ['onda', 'aura']),
      seat('organ', 'pads and strings', 'Wide pad and string swell in the breakdown.', ['aura', 'onda']),
      seat('piano', 'piano', 'The breakdown melody, alone, with long reverb.', ['lyra', 'kera']),
      seat('percussion', 'rides and FX', 'Ride on the climax; white-noise sweeps, impacts, reverse crashes.', ['soma', 'meka']),
    ],
    bandGenre: 'house',
    rhythm: ['Relentless straight 16ths; the bass fills every gap between kicks.', 'Snare roll in the build doubles: 4ths, 8ths, 16ths, 32nds.'],
    arrangement: ['The breakdown is the emotional centre; the climax repeats its melody with full power.', 'Energy rises by opening filters and adding layers over 16–32 bars.'],
    production: ['Heavy sidechain on pads and lead for the pumping feel.', 'Long reverb and ping-pong delay on plucks.', 'Supersaw: 7+ detuned voices, wide, with a high-pass.'],
    avoid: ['Swing.', 'Complex jazz harmony.', 'Short sections.'],
    mix: { lufs: [-9, -6], note: 'Lead wide and bright; kick and bass centred and clean.' },
    renderTags: ['trance', 'uplifting', 'euphoric', 'supersaw lead', 'arpeggios', 'emotional breakdown'],
    vocals: 'optional', vocalNote: 'Ethereal female vocal in the breakdown, long vowels.',
  },
  {
    id: 'edm-progressive', label: 'Progressive house and melodic techno', family: 'electronic',
    match: /\b(progressive house|melodic techno|melodic house|progressive|afterlife|anyma|tale of us|eric prydz)\b/i,
    tempo: [118, 128], defaultTempo: 124, meter: [4, 4], swing: 0, swingGrid: 16, halfTime: false,
    modes: ['minor', 'dorian', 'phrygian'], tonics: [F, G, A, D, C, E], colour: 1, harmonicRhythm: 2,
    progressions: ['i | i | bVI | bVI | bIII | bIII | bVII | bVII', 'i | bIII | bVII | iv', 'i | i | bVII | bVI'],
    harmonyNotes: ['A slow minor progression under a repeating arpeggio that never changes its rhythm.', 'The lead is a big, slightly detuned mono or unison synth with long portamento.', 'Bass sustains roots; the movement is in the arp.'],
    form: [
      s('intro', 32, 0.35, 'Kick, a low drone and the arp, very filtered. ' + CLUB_FORM_NOTE),
      s('verse', 32, 0.55, 'Bass and percussion in; the arp filter opens across the section.', 'Groove'),
      s('breakdown', 32, 0.3, 'Kick out; the lead theme arrives, huge and wet; a long riser.'),
      s('drop', 32, 0.95, 'Kick and bass under the full lead.', 'Climax'),
      s('interlude', 16, 0.6, 'Lead out, groove continues.'),
      s('outro', 32, 0.35, 'Filter closes; elements leave.'),
    ],
    barsPerLine: 4,
    lineup: [
      seat('drums', 'drum machine', 'Deep kick, soft clap, shaker 16ths, long sections without fills.', ['meka', 'soma']),
      seat('bass', 'sub and mid bass', 'Sustained roots with a slow filter; a pulsing mid-bass layer in 8ths.', ['bajo', 'onda']),
      seat('synth', 'arp and lead', 'Hypnotic 16th arp; a cinematic lead with glide for the theme.', ['onda', 'aura']),
      seat('organ', 'pads and atmospheres', 'Evolving pad; vocal textures; granular noise.', ['aura', 'onda']),
      seat('percussion', 'tops', 'Ride and offbeat hat enter at the climax.', ['soma', 'meka']),
    ],
    bandGenre: 'house',
    rhythm: ['Straight and steady; tension by automation, not rhythm changes.'],
    arrangement: ['Very long builds (32 bars). One theme, revealed slowly.', 'Each 8 bars opens the filter a little more.'],
    production: ['Dark, wide, cinematic; long reverbs with pre-delay.', 'Sidechain everything to the kick; saturate the lead.'],
    avoid: ['Quick changes.', 'Bright pop chords.', 'Busy drum fills.'],
    mix: { lufs: [-10, -7], note: 'Depth front to back; lead sits above a dark bed.' },
    renderTags: ['melodic techno', 'progressive house', 'hypnotic arp', 'dark', 'cinematic synth lead', 'driving'],
    vocals: 'optional', vocalNote: 'Sparse, processed, reverberant phrases.',
  },
  {
    id: 'edm-festival', label: 'Festival EDM (big room, electro house)', family: 'electronic',
    match: /\b(big room|festival|electro house|mainstage|edm|electronic dance|dance music|electronic)\b/i,
    tempo: [124, 132], defaultTempo: 128, meter: [4, 4], swing: 0, swingGrid: 16, halfTime: false,
    modes: ['minor', 'major'], tonics: [F, G, A, E, D, C], colour: 0, harmonicRhythm: 1,
    progressions: ['vi | IV | I | V', 'i | bVI | bIII | bVII', 'IV | V | vi | vi'],
    harmonyNotes: ['Simple anthem progression in the breakdown; the drop reduces to a riff on one or two notes.', 'Supersaw chords voiced wide with the melody on top.'],
    form: [
      s('intro', 16, 0.45, 'Kick and percussion; a filtered tease of the drop riff.'),
      s('breakdown', 16, 0.35, 'Chords and vocal/top-line; pianos and plucks.', 'Breakdown'),
      s('build', 8, 0.75, 'Snare roll accelerating, pitch riser, "hands up" vocal shot, silence on the last beat.'),
      s('drop', 16, 1, 'Kick and the lead riff, minimal elements, maximum level.', 'Drop'),
      s('verse', 16, 0.5, 'Groove with bass and vocal verse.'),
      s('breakdown', 16, 0.4, 'Bigger breakdown: full chords, full vocal.'),
      s('build', 8, 0.8, 'Longer build.'),
      s('drop', 16, 1, 'Drop with a variation (extra layer or octave).', 'Drop 2'),
      s('outro', 16, 0.4, 'Drums out.'),
    ],
    barsPerLine: 2,
    lineup: [
      seat('drums', 'drum machine', 'Huge kick every beat, layered clap/snare on 2 and 4, snare roll in the build.', ['meka', 'soma']),
      seat('bass', 'sub and reese', 'Sub follows the kick; distorted mid-bass doubles the riff.', ['bajo', 'onda']),
      seat('synth', 'supersaws and drop lead', 'Wide supersaw chords in the breakdown; a pitched, distorted lead riff on the drop.', ['onda', 'aura']),
      seat('piano', 'piano and plucks', 'Carry the breakdown chords.', ['lyra', 'kera', 'aura']),
      seat('percussion', 'FX', 'Risers, downlifters, impacts, crashes at every section join.', ['meka', 'soma']),
    ],
    bandGenre: 'house',
    rhythm: ['Four-on-the-floor; the drop riff is rhythmic and syncopated.', 'One beat of silence before the drop.'],
    arrangement: ['Breakdown–build–drop twice.', 'The drop has fewer elements than the breakdown but is louder.'],
    production: ['Hard sidechain; clipped, loud master.', 'Layered kicks (click, body, sub); OTT-style multiband on leads.'],
    avoid: ['Subtlety in the drop.', 'Complex harmony.'],
    mix: { lufs: [-7, -5], note: 'Loud; kick and lead own the drop.' },
    renderTags: ['edm', 'festival', 'big room', 'supersaw', 'huge drop', 'energetic', 'anthem'],
    vocals: 'typical', vocalNote: 'Pop top-line in the breakdowns; shouted hook into the drop.',
  },
  {
    id: 'edm-dnb', label: 'Drum and bass', family: 'electronic',
    match: /\b(drum ?(?:and|&|n|'n') ?bass|dnb|d&b|jungle|liquid|neurofunk|jump[- ]?up|breakcore)\b/i,
    tempo: [165, 178], defaultTempo: 174, meter: [4, 4], swing: 0, swingGrid: 16, halfTime: true,
    modes: ['minor', 'dorian'], tonics: [F, E, G, A, D, Fs], colour: 2, harmonicRhythm: 2,
    progressions: ['i9 | i9 | bVImaj7 | bVImaj7', 'i | bVI | bIII | bVII', 'iv9 | bVII | bIIImaj7 | bVImaj7'],
    harmonyNotes: ['Harmony moves at half the drum speed: one chord per 2 or 4 bars of pads or Rhodes.', 'Liquid: jazzy 7ths and 9ths. Neuro/jump-up: one note and a modulated reese bass.', 'Sub bass plays long notes; a mid-bass layer carries the movement.'],
    form: [
      s('intro', 16, 0.35, 'Pads, vocal and a filtered break; no sub yet.'),
      s('build', 8, 0.6, 'Riser, drum fill, bass teaser; cut on the last beat.'),
      s('drop', 32, 1, 'Full break and bass. Switch the bass pattern after 16 bars.', 'Drop'),
      s('breakdown', 16, 0.3, 'Drums out; musical section with pads, keys, vocal.'),
      s('build', 8, 0.65, 'Build again.'),
      s('drop', 32, 1, 'Second drop with a new bass variation or extra break layer.', 'Drop 2'),
      s('outro', 16, 0.35, 'Drums and atmospheres for the mix-out.'),
    ],
    barsPerLine: 4,
    lineup: [
      seat('drums', 'breakbeat', 'Two-step: kick on 1 and the "and" of 3, snare on 2 and 4, ghost snares and shuffled hats from a chopped break.', ['meka', 'soma']),
      seat('bass', 'sub and reese', 'Clean sine sub in long notes; a detuned, filtered reese on top that moves and growls.', ['bajo', 'onda']),
      seat('piano', 'Rhodes and pads', 'Slow jazz chords and atmospheric pads (liquid).', ['lyra', 'aura']),
      seat('synth', 'stabs and leads', 'Rave stabs, plucks, a simple lead motif.', ['onda', 'aura']),
      seat('percussion', 'tops and FX', 'Layered break tops, rides in the second half of the drop, impacts.', ['meka', 'soma']),
    ],
    bandGenre: 'house',
    rhythm: ['174 BPM drums over half-time musical phrasing: melodies and chords feel like 87.', 'Snare on 2 and 4 is sacred; the kick pattern is what varies.', 'Ghost notes and break layers give the roll.'],
    arrangement: ['16-bar phrases; a drum fill and bass switch-up every 16.', 'Call and response between two bass sounds.'],
    production: ['Snare fundamental around 200 Hz, loud and snappy; kick short and punchy.', 'Sub mono and clean; reese mids wide. Heavy drum-bus compression and saturation.'],
    avoid: ['Four-on-the-floor kick.', 'Long-tailed kicks that mask the sub.', 'Fast chord changes.'],
    mix: { lufs: [-8, -5], note: 'Snare and sub are the anchors.' },
    renderTags: ['drum and bass', 'fast breakbeat', 'deep sub bass', 'reese bass', 'energetic', 'liquid'],
    vocals: 'optional', vocalNote: 'Soulful phrases at half-time; MC-style chants.',
  },
  {
    id: 'edm-dubstep', label: 'Dubstep and bass music', family: 'electronic',
    match: /\b(dubstep|brostep|riddim|bass music|wobble|skrillex|deep dubstep|140)\b/i,
    tempo: [138, 150], defaultTempo: 140, meter: [4, 4], swing: 0, swingGrid: 16, halfTime: true,
    modes: ['minor', 'phrygian', 'harmonic'], tonics: [F, E, G, D, Fs], colour: 0, harmonicRhythm: 4,
    progressions: ['i | i | bVI | bVII', 'i | i | i | bII', 'i | bVI | iv | V'],
    harmonyNotes: ['The intro and breakdown are melodic (minor chords, arps, vocal); the drop is sound design on one or two notes.', 'Bass phrases answer each other in call and response: two beats of one sound, two of another.'],
    form: [
      s('intro', 16, 0.3, 'Atmospheric: pads, arp, vocal; half-time drums fade in.'),
      s('build', 8, 0.7, 'Snare roll, pitch riser, vocal shot ("drop it"), silence.'),
      s('drop', 16, 1, 'Half-time drums, sub and modulated bass in call and response.', 'Drop'),
      s('breakdown', 16, 0.3, 'Return to the melodic material.'),
      s('build', 8, 0.75, 'Build.'),
      s('drop', 16, 1, 'Second drop: new bass sounds, rhythm switched (often triplets or double-time hats).', 'Drop 2'),
      s('outro', 8, 0.25, 'Atmosphere and a final sub hit.'),
    ],
    barsPerLine: 4,
    lineup: [
      seat('drums', 'half-time drums', 'Kick on 1, huge snare on 3; hats and percussion fill in 16ths and triplets.', ['meka', 'soma']),
      seat('bass', 'sub and growl basses', 'Sine sub under FM/wavetable growls and wobbles whose filter/LFO rate changes each phrase.', ['bajo', 'onda']),
      seat('synth', 'arps and leads', 'Melodic arp and supersaw chords in the intro; screech lead fills in the drop.', ['onda', 'aura']),
      seat('organ', 'pads', 'Dark wide pads in the breaks.', ['aura', 'onda']),
      seat('percussion', 'FX', 'Impacts, risers, vocal chops, foley.', ['meka', 'soma']),
    ],
    bandGenre: 'trap',
    rhythm: ['Half-time: snare on beat 3 at 140.', 'Bass rhythm is the hook: LFO rates in 8ths, triplets, 16ths.'],
    arrangement: ['Every 2 bars of the drop needs a new bass sound or a fill.', 'Contrast: beautiful intro, brutal drop.'],
    production: ['Sound design is composition here: resample, distort, filter, repeat.', 'Sub in mono below 100 Hz, clean; mids distorted and wide.', 'Snare with a long tail and heavy layering.'],
    avoid: ['A full chord progression during the drop.', 'Static bass tone for more than two bars.'],
    mix: { lufs: [-7, -4], note: 'Sub and snare loudest; mids aggressive but not harsh at 3 kHz.' },
    renderTags: ['dubstep', 'heavy bass', 'wobble bass', 'half-time drums', 'aggressive drop', 'dark'],
    vocals: 'optional', vocalNote: 'Emotional vocal in the intro; chopped shots in the drop.',
  },
  {
    id: 'edm-future-bass', label: 'Future bass and melodic bass', family: 'electronic',
    match: /\b(future bass|melodic bass|kawaii|flume|illenium|chill ?trap|melodic dubstep)\b/i,
    tempo: [130, 170], defaultTempo: 150, meter: [4, 4], swing: 0, swingGrid: 16, halfTime: true,
    modes: ['major', 'minor', 'lydian'], tonics: [F, Ab, Eb, C, G, Db], colour: 3, harmonicRhythm: 1,
    progressions: ['IVmaj7 | V | vi7 | iii7', 'IVmaj9 | V | vi7 | I', 'vi7 | IVmaj7 | I | V'],
    harmonyNotes: ['Lush 7th and 9th chords starting on IV; the drop is the chords themselves, as a rhythmic supersaw.', 'Top note of the chord stack plays the melody; pitch bends up into chords.'],
    form: [
      s('intro', 8, 0.25, 'Filtered chords and a vocal chop.'),
      s('verse', 16, 0.45, 'Vocal verse over plucks, light half-time drums.'),
      s('build', 8, 0.7, 'Pre-chorus lift, snare build, riser, silence.'),
      s('drop', 16, 1, 'Supersaw chords with LFO volume wobble, vocal chops as the lead, half-time drums.', 'Drop'),
      s('verse', 16, 0.45, 'Second verse.'),
      s('build', 8, 0.75, 'Build.'),
      s('drop', 16, 1, 'Drop 2 with an added counter-melody.', 'Drop 2'),
      s('outro', 8, 0.2, 'Chords and vocal fade.'),
    ],
    barsPerLine: 4,
    lineup: [
      seat('drums', 'half-time drums', 'Kick and a big snare on 3; trap-style hat rolls; foley percussion.', ['meka', 'soma']),
      seat('bass', '808 sub', 'Sub follows the chord roots under the saws.', ['bajo', 'onda']),
      seat('synth', 'supersaw chords', 'Detuned chord stack with sidechain and LFO-on-volume rhythm; pitch-bend entrances.', ['onda', 'aura']),
      seat('piano', 'plucks and keys', 'Soft plucks and bells in the verses.', ['aura', 'vela', 'kera']),
      seat('percussion', 'vocal chops and FX', 'Pitched vocal chops as a lead; risers and impacts.', ['kera', 'meka']),
    ],
    bandGenre: 'trap',
    rhythm: ['Half-time groove; chord rhythm syncopated in dotted 8ths.', 'Hat rolls in 16th triplets and 32nds.'],
    arrangement: ['Verse–build–drop like a pop song; the drop is the chorus.', 'Bright and emotional rather than aggressive.'],
    production: ['Sidechain plus volume LFO on the chords.', 'Wide, bright supersaws; soft-clip the master.'],
    avoid: ['Dark minimal drops.', 'Plain triads.'],
    mix: { lufs: [-8, -5], note: 'Chords wide, vocal chops and snare centred.' },
    renderTags: ['future bass', 'supersaw chords', 'vocal chops', 'emotional', 'bright', 'half-time'],
    vocals: 'typical', vocalNote: 'Breathy pop vocal; chopped and pitched in the drop.',
  },
  {
    id: 'edm-garage', label: 'UK garage and 2-step', family: 'electronic',
    match: /\b(uk garage|ukg|2[- ]?step|two[- ]?step|speed garage|bassline|future garage)\b/i,
    tempo: [128, 138], defaultTempo: 132, meter: [4, 4], swing: 0.35, swingGrid: 16, halfTime: false,
    modes: ['minor', 'dorian'], tonics: [F, G, A, C, D, Eb], colour: 3, harmonicRhythm: 2,
    progressions: ['i9 | i9 | bVImaj7 | bVII', 'iv9 | bVII13 | bIIImaj7 | bVImaj7', 'i9 | v7 | bVImaj7 | bVII'],
    harmonyNotes: ['R&B chords (minor 9ths, major 7ths) on organ or Rhodes stabs.', 'Bass is a wobbling or sliding sub with gaps; it answers the vocal chops.'],
    form: [
      s('intro', 16, 0.4, 'Shuffled drums and a vocal chop.'),
      s('verse', 16, 0.55, 'Bass and chords in; vocal phrase.'),
      s('breakdown', 8, 0.3, 'Drums out; chords and vocal.'),
      s('drop', 32, 0.9, 'Full 2-step groove, bass hook, chopped vocal.', 'Drop'),
      s('breakdown', 8, 0.3, 'Break.'),
      s('drop', 16, 0.9, 'Drop again.', 'Drop 2'),
      s('outro', 16, 0.4, 'Drums and bass out.'),
    ],
    barsPerLine: 2,
    lineup: [
      seat('drums', 'drum machine', '2-step: kick on 1 and a syncopated late kick, snare on 2 and 4, heavily swung hats and rim ghost notes.', ['meka', 'soma']),
      seat('bass', 'sub bass', 'Syncopated sub with pitch slides and rests; sometimes an organ bass.', ['bajo', 'onda']),
      seat('piano', 'organ and Rhodes stabs', 'Short swung chord stabs.', ['aura', 'lyra', 'kera']),
      seat('synth', 'vocal chops and strings', 'Pitched, time-stretched vocal chops; string stabs.', ['kera', 'aura']),
      seat('percussion', 'shakers and rims', 'Swung shaker and woodblock.', ['soma', 'meka']),
    ],
    bandGenre: 'house',
    rhythm: ['The kick skips beat 3: that hole is the 2-step.', '16th swing around 60–66%; ghost snares pull the groove.'],
    arrangement: ['Vocal chops are the hook.', 'Space in the bassline is as important as the notes.'],
    production: ['Crisp, tight drums; warm sub.', 'Time-stretch artefacts on vocals are part of the style.'],
    avoid: ['Straight 16ths.', 'Four-on-the-floor throughout (unless speed garage).'],
    mix: { lufs: [-10, -7], note: 'Sub and shuffled hats define it.' },
    renderTags: ['uk garage', '2-step', 'shuffled drums', 'vocal chops', 'sub bass', 'organ stabs'],
    vocals: 'typical', vocalNote: 'R&B vocal, chopped and pitched.',
  },
  {
    id: 'edm-synthwave', label: 'Synthwave', family: 'electronic',
    match: /\b(synthwave|retrowave|outrun|80s synth|eighties|vaporwave|darksynth|new wave|synth[- ]?pop)\b/i,
    tempo: [80, 120], defaultTempo: 100, meter: [4, 4], swing: 0, swingGrid: 16, halfTime: false,
    modes: ['minor', 'major', 'dorian'], tonics: [A, E, D, C, F, G], colour: 1, harmonicRhythm: 1,
    progressions: ['i | bVI | bIII | bVII', 'I | V | vi | IV', 'bVI | bVII | i | i'],
    harmonyNotes: ['Simple diatonic loops; add9 and sus2 colours on pads.', 'Bass in driving 8th or 16th octaves on the root.', 'Lead melodies are singable, pentatonic, with vibrato and portamento.'],
    form: [
      s('intro', 8, 0.35, 'Arpeggiator and pad; gated tom fill in.'),
      s('verse', 16, 0.55, 'Bass and drums; verse melody on a soft lead.'),
      s('chorus', 16, 0.85, 'Big lead melody, full pads, brass stabs.'),
      s('verse', 16, 0.55, 'Verse 2 with an extra arp.'),
      s('chorus', 16, 0.9, 'Chorus.'),
      s('solo', 8, 0.8, 'Synth or guitar solo.'),
      s('chorus', 16, 0.95, 'Final chorus.'),
      s('outro', 8, 0.35, 'Arp and pad fade.'),
    ],
    barsPerLine: 2,
    lineup: [
      seat('drums', 'drum machine (LinnDrum/707)', 'Kick on 1 and 3, big gated-reverb snare on 2 and 4, tom fills.', ['meka', 'soma']),
      seat('bass', 'analog synth bass', 'Driving 8th or 16th-note octaves on the root.', ['aura', 'bajo', 'onda']),
      seat('synth', 'lead and arp', 'Bright poly lead for the hook; 16th arpeggio through the chords.', ['aura', 'onda']),
      seat('organ', 'pads and brass', 'Warm analog pads; Jupiter/Oberheim brass stabs.', ['aura']),
      seat('guitar', 'electric guitar', 'Chorus-drenched clean lines or a soaring distorted solo.', ['lyra']),
    ],
    bandGenre: 'pop',
    rhythm: ['Straight 8ths; steady and driving.', 'Gated toms announce each section.'],
    arrangement: ['Verse and chorus like a pop song, often instrumental.', 'Arp in the verse, lead in the chorus.'],
    production: ['Gated reverb on snare; chorus on everything; tape saturation.', 'Analog-style detune and slow filter sweeps.'],
    avoid: ['Modern trap hats.', 'Dry, close drums.', 'Complex harmony.'],
    mix: { lufs: [-11, -8], note: 'Snare and lead up front; wide pads.' },
    renderTags: ['synthwave', '80s', 'retro', 'analog synths', 'gated reverb drums', 'arpeggiator', 'nostalgic'],
    vocals: 'optional', vocalNote: 'Reverbed, breathy, often vocoded.',
  },
  {
    id: 'edm-ambient', label: 'Ambient and downtempo', family: 'electronic',
    match: /\b(ambient|downtempo|chill ?out|trip[- ]?hop|drone|soundscape|new age|meditat\w*|idm|chillwave|atmospheric)\b/i,
    tempo: [60, 100], defaultTempo: 80, meter: [4, 4], swing: 0.1, swingGrid: 16, halfTime: false,
    modes: ['lydian', 'dorian', 'major', 'minor'], tonics: [C, D, F, G, A, E], colour: 2, harmonicRhythm: 4,
    progressions: ['Imaj7 | Imaj7 | IVmaj7 | IVmaj7', 'i9 | i9 | bVImaj7 | bVImaj7', 'IVmaj7 | IVmaj7 | Imaj9 | Imaj9'],
    harmonyNotes: ['Two chords are enough; change slowly, crossfading voices.', 'Open voicings with 9ths and suspended tones; avoid the leading-tone pull.', 'Drones on tonic and fifth under drifting upper notes.'],
    form: [
      s('intro', 8, 0.1, 'A texture fades in from silence.'),
      s('theme', 16, 0.25, 'A slow motif of 3–4 notes appears and repeats with variation.'),
      s('development', 16, 0.4, 'A soft beat or pulse enters (downtempo) or a second layer (ambient).'),
      s('theme', 16, 0.3, 'The motif returns, transposed or in a new timbre.'),
      s('outro', 8, 0.1, 'Layers dissolve into the reverb.'),
    ],
    barsPerLine: 4,
    lineup: [
      seat('synth', 'pads and textures', 'Slowly evolving pads; granular clouds; long attack and release.', ['aura', 'onda']),
      seat('piano', 'soft piano', 'Sparse notes with long reverb and delay.', ['lyra', 'kera']),
      seat('bass', 'sub drone', 'Sustained low tonic; moves rarely.', ['bajo', 'onda']),
      seat('drums', 'soft beats', 'Dusty, slow break or a soft kick and rim (trip-hop/downtempo only).', ['meka', 'soma']),
      seat('percussion', 'bells and field sounds', 'Chimes, bowls, nature recordings.', ['vela', 'soma']),
      seat('guitar', 'ambient guitar', 'Swelled notes through shimmer reverb.', ['lyra', 'tonos']),
    ],
    bandGenre: 'ballad',
    rhythm: ['Pulse is optional. When there is a beat it is slow, soft and behind.', 'Events are spaced so each one can decay.'],
    arrangement: ['Add and subtract layers over long spans; no sudden moves.', 'Silence and decay are material.'],
    production: ['Reverb and delay are the instrument: long, modulated, filtered.', 'Soft high end; tape hiss and room tone welcome.'],
    avoid: ['Busy rhythm.', 'Loud transients.', 'Fast chord changes.'],
    mix: { lufs: [-20, -12], note: 'Depth and width; nothing sharp.' },
    renderTags: ['ambient', 'atmospheric', 'ethereal pads', 'calm', 'downtempo', 'spacious'],
    vocals: 'optional', vocalNote: 'Wordless, distant, washed in reverb.',
  },
  {
    id: 'edm-hardstyle', label: 'Hardstyle and hard dance', family: 'electronic',
    match: /\b(hardstyle|hardcore|gabber|rawstyle|hard dance|frenchcore|happy hardcore)\b/i,
    tempo: [145, 160], defaultTempo: 150, meter: [4, 4], swing: 0, swingGrid: 16, halfTime: false,
    modes: ['minor', 'harmonic'], tonics: [F, G, E, D, A], colour: 0, harmonicRhythm: 1,
    progressions: ['i | bVI | bIII | bVII', 'i | bVII | bVI | V', 'bVI | bVII | i | i'],
    harmonyNotes: ['Euphoric minor anthem in the breakdown; the kick itself is pitched to the root.', 'Melody in octaves on a screech/supersaw lead.'],
    form: [
      s('intro', 16, 0.5, 'Kick and atmospheres.'),
      s('verse', 16, 0.7, 'Mid-intro: reverse-bass groove and screeches.'),
      s('breakdown', 16, 0.35, 'Orchestral or piano statement of the melody; vocal.'),
      s('build', 8, 0.8, 'Snare roll and riser.'),
      s('drop', 32, 1, 'Distorted pitched kick with the full lead melody.', 'Climax'),
      s('outro', 16, 0.5, 'Kick and FX.'),
    ],
    barsPerLine: 2,
    lineup: [
      seat('drums', 'hardstyle kick', 'A distorted, pitched kick with a long tonal tail on every beat; offbeat reverse bass.', ['meka', 'bajo']),
      seat('synth', 'lead and screech', 'Detuned supersaw melody; resonant screech fills.', ['onda', 'aura']),
      seat('organ', 'orchestral layers', 'Strings, choir and piano in the breakdown.', ['arco', 'cantus', 'lyra']),
      seat('percussion', 'claps, hats, FX', 'Open hat offbeats, claps, impacts.', ['meka']),
    ],
    bandGenre: 'house',
    rhythm: ['Kick on every beat; the kick tail is the bass.', 'Triplet kick rolls into phrases.'],
    arrangement: ['Cinematic breakdown, then maximal climax.'],
    production: ['The kick is built in layers: punch, distorted tail tuned to the key.', 'Hard clipping is the aesthetic.'],
    avoid: ['Separate sub bass under the kick.', 'Gentle dynamics in the climax.'],
    mix: { lufs: [-6, -4], note: 'Kick is everything.' },
    renderTags: ['hardstyle', 'distorted kick', 'euphoric lead', 'hard dance', 'intense'],
    vocals: 'optional', vocalNote: 'Spoken dramatic intro; anthemic sung breakdown.',
  },
];

// ─── Hip-hop ────────────────────────────────────────────────────────────────────

const HIPHOP_FORM = (hook: string, verse: string): FormSection[] => [
  s('intro', 4, 0.3, 'The sample or main melody alone, filtered; a producer tag or ad-lib.'),
  s('hook', 8, 0.85, hook),
  s('verse', 16, 0.6, verse + ' Drop the drums for a bar or two at the end to set up the hook.'),
  s('hook', 8, 0.9, 'Hook again with ad-libs.'),
  s('verse', 16, 0.65, 'Second verse: switch the hat pattern or mute the melody for 4 bars to keep it moving.'),
  s('hook', 8, 0.95, 'Hook, doubled vocals.'),
  s('outro', 4, 0.3, 'Beat rides out; melody alone or drums alone.'),
];

const HIPHOP: StylePack[] = [
  {
    id: 'hiphop-boombap', label: 'Boom bap', family: 'hiphop',
    match: /\b(boom[- ]?bap|90s hip[- ]?hop|golden[- ]?era|east coast|sample[- ]?based|dj premier|pete rock|hip[- ]?hop|rap)\b/i,
    tempo: [82, 98], defaultTempo: 90, meter: [4, 4], swing: 0.5, swingGrid: 16, halfTime: false,
    modes: ['minor', 'dorian'], tonics: [A, D, E, G, C, F], colour: 2, harmonicRhythm: 2,
    progressions: ['i7 | i7 | iv7 | iv7', 'i9 | bVImaj7 | iiø7 | V7', 'iv7 | bVII7 | bIIImaj7 | bVImaj7'],
    harmonyNotes: ['A 2- or 4-bar loop that sounds like a chopped jazz or soul record: minor 7ths and 9ths, a little out of tune.', 'Bass follows the sample\'s roots with a simple, round line.', 'The loop does not change between verse and hook; elements drop in and out.'],
    form: HIPHOP_FORM('Full beat, scratched vocal phrase or sung hook, horn stab on the 1.', 'Drums, bass and the loop; leave the mids clear for the rapper.'),
    barsPerLine: 1,
    lineup: [
      seat('drums', 'sampled drums (MPC)', 'Hard kick, cracking snare on 2 and 4, swung 8th hats, kick syncopations on the "and" of 2 and before 3. Unquantised, behind the beat.', ['meka', 'soma']),
      seat('bass', 'electric or sub bass', 'Warm, low-passed line doubling the kick rhythm on the root and fifth.', ['bajo', 'lyra']),
      seat('piano', 'sampled keys', 'Rhodes or piano chops: two-bar phrase, filtered, with vinyl crackle.', ['lyra', 'kera', 'aura']),
      seat('trumpet', 'horn stabs', 'A sampled horn hit or short riff answering the vocal.', ['cornu', 'lyra', 'kera']),
      seat('percussion', 'scratches and FX', 'Turntable scratches in the hook; vinyl noise.', ['kera', 'meka']),
    ],
    bandGenre: 'hiphop',
    rhythm: ['Swing around 58–62% on 16ths; snare slightly late, kick on top.', 'Hats are 8ths with accents, not rolls.', 'Head-nod pocket is everything.'],
    arrangement: ['Mute-based: verse loses the horns, hook adds them; drop the beat for punchlines.', '16-bar verses, 8-bar hooks.'],
    production: ['Drums gritty and loud (12-bit crunch, saturation); samples low-passed around 8–10 kHz.', 'Mono-ish, mid-forward, warm.'],
    avoid: ['Trap hat rolls and sliding 808s.', 'Clean, perfectly quantised drums.', 'Bright, wide synth pads.'],
    mix: { lufs: [-11, -8], note: 'Kick and snare punch through; vocal sits on top of the loop.' },
    renderTags: ['boom bap', '90s hip hop', 'jazzy samples', 'dusty drums', 'vinyl', 'head nod'],
    vocals: 'typical', vocalNote: 'Rap: 16-bar verses, multisyllabic rhymes, on-beat delivery with internal swing.',
  },
  {
    id: 'hiphop-trap', label: 'Trap', family: 'hiphop',
    match: /\b(trap|atlanta|808s?|metro boomin|southern hip[- ]?hop|rage|plugg|trap soul)\b/i,
    tempo: [120, 160], defaultTempo: 140, meter: [4, 4], swing: 0, swingGrid: 16, halfTime: true,
    modes: ['minor', 'harmonic', 'phrygian'], tonics: [F, Fs, E, D, G, C], colour: 1, harmonicRhythm: 2,
    progressions: ['i | i | bVI | bVII', 'i | bVI | i | V', 'i | i | bII | i'],
    harmonyNotes: ['A dark, simple minor melody of 4–8 notes on bells, piano, flute or a pluck, looped over 4 bars.', 'The 808 plays the roots and is the bass and the harmony; tune it to the key.', 'Harmonic minor or phrygian (b2) for menace.'],
    form: HIPHOP_FORM('Full beat with the 808 pattern at its busiest; melodic hook with ad-libs.', '808 and drums under the melody; simplify hats for the first 4 bars.'),
    barsPerLine: 2,
    lineup: [
      seat('drums', 'trap drums', 'Half-time: clap/snare on beat 3; hi-hats in 8ths or 16ths with 16th-triplet and 32nd rolls and pitch drops; sparse syncopated kicks.', ['meka', 'soma']),
      SUB_808,
      seat('piano', 'dark melody', 'Bell, piano or flute loop in the upper-mid register with long reverb.', ['aura', 'vela', 'lyra', 'pneuma']),
      seat('synth', 'counter-melody and pads', 'A second layer an octave up or a dark pad entering in the hook.', ['onda', 'aura']),
      seat('percussion', 'open hats, rims, FX', 'Open hat before the snare; rim and perc fills; risers, reverse cymbals.', ['meka', 'soma']),
    ],
    bandGenre: 'trap',
    rhythm: ['Written at 130–160 but felt at half: snare on 3.', 'Hat rolls are the ornament: change the subdivision every bar or two.', '808 rhythm locks with the kick, then adds its own slides and pickups.'],
    arrangement: ['Same 4- or 8-bar loop throughout; structure by muting (drums out, 808 out, melody filtered).', 'Beat drops out for the last bar before the hook.'],
    production: ['808: long sustain, distortion for harmonics so it reads on small speakers, glide between notes, mono.', 'Kick short and layered on the 808 attack; sidechain or cut to avoid clashes.', 'Crisp, bright hats; dark reverbed melody behind the vocal.'],
    avoid: ['Busy chord changes.', 'Swung boom-bap hats.', '808 and kick fighting on every hit.', 'Bass guitar.'],
    mix: { lufs: [-9, -6], note: '808 and vocal are the two loudest things.' },
    renderTags: ['trap', 'heavy 808', 'hi-hat rolls', 'dark melody', 'hard-hitting', 'atlanta'],
    vocals: 'typical', vocalNote: 'Rap with melodic autotune flows, triplet cadences, ad-libs in the gaps.',
  },
  {
    id: 'hiphop-drill', label: 'Drill', family: 'hiphop',
    match: /\b(drill|uk drill|ny drill|brooklyn drill|chicago drill|sliding 808s?)\b/i,
    tempo: [138, 146], defaultTempo: 142, meter: [4, 4], swing: 0, swingGrid: 16, halfTime: true,
    modes: ['minor', 'harmonic', 'phrygian'], tonics: [Fs, G, F, E, D, Bb], colour: 1, harmonicRhythm: 2,
    progressions: ['i | i | bVI | V', 'i | bVI | bVII | i', 'i | iv | bVI | V'],
    harmonyNotes: ['Ominous minor melody (piano, strings, choir, vocal sample) with the raised 7th for tension.', 'The 808 slides between notes an octave or a fifth apart: the glide is the signature.'],
    form: HIPHOP_FORM('Full pattern with sliding 808s and counter-snare; chant-like hook.', 'Drums and 808 drive; melody thinned.'),
    barsPerLine: 2,
    lineup: [
      seat('drums', 'drill drums', 'Snare on beat 3 with an extra displaced snare on the "and" of 4 (or beat 4 of every second bar); hats in a triplet-feel pattern (3+3+2) with skips, not constant rolls; syncopated kicks.', ['meka', 'soma']),
      seat('bass', 'sliding 808', 'Syncopated 808 with fast portamento slides up and down between hits.', ['bajo', 'onda']),
      seat('piano', 'dark piano and strings', 'Minor arpeggio or two-hand piano figure; staccato strings.', ['lyra', 'arco', 'aura']),
      seat('organ', 'choir and vocal samples', 'Eerie choir or chopped vocal pad.', ['cantus', 'kera']),
      seat('percussion', 'perc fills', 'Rimshots, snare rolls, reverse FX at phrase ends.', ['meka', 'soma']),
    ],
    bandGenre: 'trap',
    rhythm: ['Hat pattern accents 3+3+2 across the bar; it bounces rather than rolls.', 'Kick and 808 are heavily syncopated, answering the snare.'],
    arrangement: ['Loop-based; drum dropouts and filter sweeps every 8 bars.', 'Beat cuts for the first words of a line, then slams back.'],
    production: ['808 with heavy glide, saturated; kicks short.', 'Dark, cold reverb on melody; snares sharp and dry.'],
    avoid: ['Straight trap hat rolls throughout.', 'Major keys.', 'Static 808 notes without slides.'],
    mix: { lufs: [-9, -6], note: '808 slides must stay audible on small speakers: add harmonics.' },
    renderTags: ['drill', 'sliding 808', 'dark piano', 'syncopated hi-hats', 'menacing', 'uk drill'],
    vocals: 'typical', vocalNote: 'Rap: clipped, percussive flows that ride the hat pattern; ad-libs.',
  },
  {
    id: 'hiphop-lofi', label: 'Lo-fi hip-hop', family: 'hiphop',
    match: /\b(lo[- ]?fi|lofi|chillhop|study beats?|jazzhop|jazz[- ]?hop|dilla|beat tape|mellow beats?)\b/i,
    tempo: [66, 92], defaultTempo: 80, meter: [4, 4], swing: 0.55, swingGrid: 16, halfTime: false,
    modes: ['major', 'dorian', 'minor'], tonics: [C, F, Eb, D, G, Bb], colour: 3, harmonicRhythm: 1,
    progressions: ['IVmaj7 | iii7 | ii7 | Imaj7', 'ii9 | V13 | Imaj9 | vi7', 'Imaj7 | vi9 | ii9 | V7#5'],
    harmonyNotes: ['Jazz chords with 9ths and 13ths on Rhodes or a warped piano; descending IV–iii–ii–I is the classic.', 'Voicings rootless and close, in the middle register, slightly detuned.', 'Melody, if any, is a few lazy notes on guitar or keys.'],
    form: [
      s('intro', 4, 0.25, 'Vinyl crackle, a chord, maybe a spoken sample.'),
      s('verse', 16, 0.5, 'Drums and bass enter; the chord loop plays.', 'A'),
      s('interlude', 8, 0.4, 'Drums drop to half; melody takes focus.', 'B'),
      s('verse', 16, 0.55, 'Loop again with a new top-line or counter-melody.', 'A'),
      s('outro', 4, 0.2, 'Filter closes; tape stops.'),
    ],
    barsPerLine: 2,
    lineup: [
      seat('drums', 'dusty drums', 'Soft kick, rimshot or muffled snare, loose hats: deliberately off-grid (late snare, early hat).', ['meka', 'soma']),
      seat('bass', 'electric bass', 'Round, simple, slightly behind; slides into notes.', ['lyra', 'bajo']),
      seat('piano', 'Rhodes or warped piano', 'The chord loop, with wow and flutter.', ['lyra', 'kera', 'aura']),
      seat('guitar', 'jazz guitar', 'Clean, sparse melody with a little vibrato.', ['lyra', 'tonos']),
      seat('percussion', 'vinyl and foley', 'Crackle, rain, tape hiss, a shaker.', ['kera', 'soma']),
    ],
    bandGenre: 'neosoul',
    rhythm: ['Drunken swing: 16ths swung and individual hits nudged late.', 'Kick slightly ahead of a lazy snare.'],
    arrangement: ['One loop, lightly varied; short (2–3 minutes).', 'Drop the drums for a bar at each turnaround.'],
    production: ['Low-pass everything (roll off above 6–8 kHz), tape wobble, bit reduction, sidechain the keys to the kick.', 'Quiet and soft; nothing sharp.'],
    avoid: ['Bright, crisp highs.', 'Tight quantisation.', 'Dense arrangements.'],
    mix: { lufs: [-16, -11], note: 'Soft and warm; background-friendly.' },
    renderTags: ['lofi hip hop', 'chill', 'jazzy chords', 'vinyl crackle', 'mellow', 'rhodes', 'relaxed'],
    vocals: 'optional', vocalNote: 'Usually instrumental; spoken samples or a hummed line.',
  },
  {
    id: 'hiphop-gfunk', label: 'G-funk and West Coast', family: 'hiphop',
    match: /\b(g[- ]?funk|west coast|dr\.? dre|p[- ]?funk|lowrider|talkbox|hyphy|bay area)\b/i,
    tempo: [86, 104], defaultTempo: 94, meter: [4, 4], swing: 0.3, swingGrid: 16, halfTime: false,
    modes: ['minor', 'dorian', 'mixolydian'], tonics: [G, A, C, D, F, E], colour: 2, harmonicRhythm: 2,
    progressions: ['i7 | i7 | iv7 | iv7', 'i9 | bVII | bVImaj7 | bVII', 'i7 | IV9 | i7 | IV9'],
    harmonyNotes: ['P-Funk-derived minor 7th vamps; the high sine/saw lead whines a slow melody on top.', 'Bass is a melodic, slinky synth-bass or live line with slides.'],
    form: HIPHOP_FORM('Sung or talkbox hook with the whistle lead and full keys.', 'Groove under the rap; lead drops out, bass and Rhodes stay.'),
    barsPerLine: 1,
    lineup: [
      seat('drums', 'drum machine and live feel', 'Solid kick, fat snare/clap on 2 and 4, 16th hats with a laid-back swing.', ['meka', 'soma']),
      seat('bass', 'Moog bass', 'Deep, gliding synth bass with funk syncopation.', ['aura', 'bajo']),
      seat('synth', 'whistle lead', 'High portamento sine/saw lead playing a slow, bending melody.', ['aura', 'onda']),
      seat('piano', 'Rhodes and clav', 'Smooth Rhodes chords; clavinet or wah guitar rhythm.', ['lyra', 'aura', 'kera']),
      seat('guitar', 'funk guitar', 'Muted wah scratches.', ['lyra']),
    ],
    bandGenre: 'funk',
    rhythm: ['Laid-back funk pocket; everything a touch behind.', 'Syncopated kick with the bass.'],
    arrangement: ['Hook adds the lead and vocals; verse is bass, drums and keys.'],
    production: ['Clean, wide, bass-heavy; smooth top end.', 'Talkbox or vocoder doubles the hook.'],
    avoid: ['Trap hats.', 'Harsh distortion.'],
    mix: { lufs: [-11, -8], note: 'Deep bass and a smooth, present lead.' },
    renderTags: ['g-funk', 'west coast hip hop', 'whistle synth lead', 'funky bass', 'laid back', 'talkbox'],
    vocals: 'typical', vocalNote: 'Relaxed rap verses; sung, harmonised hook.',
  },
  {
    id: 'hiphop-phonk', label: 'Phonk', family: 'hiphop',
    match: /\b(phonk|drift phonk|memphis|cowbell|horrorcore)\b/i,
    tempo: [120, 160], defaultTempo: 140, meter: [4, 4], swing: 0, swingGrid: 16, halfTime: false,
    modes: ['minor', 'phrygian'], tonics: [F, G, E, D, Fs], colour: 0, harmonicRhythm: 2,
    progressions: ['i | i | bII | i', 'i | bVI | bVII | i', 'i | i | iv | bII'],
    harmonyNotes: ['A short, sinister riff played on a distorted 808 cowbell; phrygian b2 everywhere.', 'Lo-fi Memphis vocal samples as texture.'],
    form: [
      s('intro', 8, 0.4, 'Filtered riff and a vocal sample.'),
      s('drop', 16, 1, 'Cowbell riff, distorted 808 and drums at full level.', 'Drop'),
      s('breakdown', 8, 0.4, 'Drums out; riff filtered; sample.'),
      s('drop', 16, 1, 'Drop again with a variation.', 'Drop 2'),
      s('outro', 8, 0.4, 'Riff alone, fading.'),
    ],
    barsPerLine: 2,
    lineup: [
      seat('drums', 'distorted drums', 'Hard clipped kick (four-on-the-floor for drift phonk, half-time for Memphis style), snappy clap, fast hats.', ['meka', 'soma']),
      seat('bass', 'distorted 808', 'Overdriven 808 doubling the riff.', ['bajo', 'onda']),
      seat('percussion', 'cowbell lead', 'Pitched 808 cowbell plays the melody.', ['meka', 'soma']),
      seat('synth', 'dark pads and samples', 'Lo-fi choir or pad; chopped Memphis rap vocals.', ['aura', 'kera']),
    ],
    bandGenre: 'trap',
    rhythm: ['Driving, straight; the cowbell riff is syncopated in 16ths.'],
    arrangement: ['Short and loop-based: intro, drop, break, drop.'],
    production: ['Everything saturated and clipped; heavy low-pass lo-fi on samples.', 'Loud by design.'],
    avoid: ['Clean, polished sounds.', 'Rich chords.'],
    mix: { lufs: [-7, -4], note: 'Deliberately crushed; cowbell and kick on top.' },
    renderTags: ['phonk', 'drift phonk', 'cowbell', 'distorted 808', 'aggressive', 'memphis'],
    vocals: 'optional', vocalNote: 'Pitched-down, lo-fi sampled rap phrases.',
  },
];

// ─── General song (fallback until rock, country and the rest get their own packs) ──

const SONG: StylePack = {
  id: 'song', label: 'Song (general)', family: 'song',
  match: /\b(pop|rock|country|folk|indie|r&b|rnb|soul|singer[- ]?songwriter|ballad|acoustic|gospel|worship|reggae|latin|afrobeats?)\b/i,
  tempo: [70, 140], defaultTempo: 104, meter: [4, 4], swing: 0, swingGrid: 16, halfTime: false,
  modes: ['major', 'minor'], tonics: [C, G, D, A, F, E], colour: 1, harmonicRhythm: 1,
  progressions: ['I | V | vi | IV', 'vi | IV | I | V', 'IV | V | vi | I'],
  harmonyNotes: ['Verse and chorus can share chords; the chorus lifts by register, density and a higher melody.', 'Pre-chorus leaves the tonic (start on IV or ii) and ends on V.'],
  form: [
    s('intro', 4, 0.35, 'The hook figure or the chorus chords, lightly.'),
    s('verse', 8, 0.45, 'Voice, bass and a simple pattern; leave room.'),
    s('prechorus', 4, 0.6, 'Lift: rising bass, added harmony, drum build.'),
    s('chorus', 8, 0.9, 'Full band, highest melody, title line.'),
    s('verse', 8, 0.5, 'Verse 2 with one new element.'),
    s('prechorus', 4, 0.65, 'Lift again.'),
    s('chorus', 8, 0.95, 'Chorus with harmonies.'),
    s('bridge', 8, 0.55, 'New chords, new perspective; drop down then build.'),
    s('chorus', 8, 1, 'Final chorus, everything in, ad-libs.'),
    s('outro', 4, 0.35, 'Hook figure, ending on the tonic.'),
  ],
  barsPerLine: 2,
  lineup: [
    seat('drums', 'drum kit', 'Backbeat on 2 and 4; open up the hi-hat or go to the ride in the chorus.', ['meka', 'soma']),
    seat('bass', 'electric bass', 'Lock with the kick; roots in the verse, more movement in the chorus.', ['lyra', 'bajo']),
    seat('guitar', 'guitars', 'Rhythm part in the verse; wider, louder layer in the chorus.', ['lyra', 'tonos']),
    seat('piano', 'keys', 'Pads or piano chords supporting the vocal.', ['lyra', 'kera', 'aura']),
    seat('synth', 'synth and strings', 'A hook line and a chorus pad.', ['aura', 'onda', 'arco']),
  ],
  bandGenre: 'pop',
  rhythm: ['Steady backbeat; the chorus feels bigger, not faster.'],
  arrangement: ['Each section adds or changes one thing.', 'The title lands on the first or last line of the chorus.'],
  production: ['Vocal forward and clear; everything else supports it.'],
  avoid: ['A chorus that sits lower than the verse.', 'Every instrument playing from bar 1.'],
  mix: { lufs: [-11, -8], note: 'Vocal is the star.' },
  renderTags: ['song', 'full band', 'catchy'],
  vocals: 'typical',
};

export const STYLE_PACKS: StylePack[] = [...CINEMATIC, ...CLASSICAL, ...JAZZ, ...ELECTRONIC, ...HIPHOP, ...EXTRA_PACKS, SONG];

export const packById = (id: string): StylePack | undefined => STYLE_PACKS.find((p) => p.id === id);

export interface StyleMatch { pack: StylePack; score: number; hits: string[] }

const FAMILY_WORD = /^(hip[- ]?hop|rap|jazz|edm|electronic|electronic dance|dance music|club|classical|orchestral|cinematic|film score|soundtrack|standards?|pop|rock|atmospheric)$/i;

/**
 * Which packs the style tags point to, best first. A tag that names a style exactly ("deep house")
 * outranks a pack that only shares a word with it ("house"): the longest matched phrase wins.
 */
export function matchStyles(tags: string[]): StyleMatch[] {
  const out: StyleMatch[] = [];
  for (const pack of STYLE_PACKS) {
    let score = 0;
    const hits: string[] = [];
    tags.forEach((tag, i) => {
      const re = new RegExp(pack.match.source, 'gi');
      let best = 0;
      for (const m of tag.matchAll(re)) best = Math.max(best, m[0].length);
      if (!best) return;
      // A family word ("hip hop", "jazz", "edm") only points at the family's default pack, so it
      // counts for little next to a word that names a style ("lofi", "drill", "bebop").
      const words = [...tag.matchAll(re)].map((m) => m[0]);
      const specific = words.filter((w) => !FAMILY_WORD.test(w));
      const weight = specific.length ? Math.max(...specific.map((w) => w.length)) : 2;
      // Earlier tags matter more (people lead with the genre); a whole-tag match is the most specific.
      score += weight * (i === 0 ? 1.5 : 1) + (specific.length && best === tag.length ? 4 : 0);
      hits.push(tag);
    });
    if (score > 0) out.push({ pack, score, hits });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** The pack for a prompt, and any second style it should be blended with. */
export function chooseStyle(tags: string[]): { pack: StylePack; blend?: StylePack; matched: boolean } {
  const m = matchStyles(tags);
  if (!m.length) return { pack: SONG, matched: false };
  const second = m.find((x) => x.pack.family !== m[0].pack.family && x.score >= m[0].score * 0.5);
  return { pack: m[0].pack, blend: second?.pack, matched: true };
}

// ─── Roman numerals ─────────────────────────────────────────────────────────────

const DEGREE: Record<string, number> = { i: 0, ii: 2, iii: 4, iv: 5, v: 7, vi: 9, vii: 11 };
const FLAT_KEYS = new Set([5, 10, 3, 8, 1]);           // F Bb Eb Ab Db majors read better in flats
const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

function numeralRoot(text: string): { semis: number; minor: boolean; rest: string } | null {
  const m = text.match(/^([b#]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(.*)$/);
  if (!m) return null;
  const semis = DEGREE[m[2].toLowerCase()] + (m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0);
  return { semis, minor: m[2] === m[2].toLowerCase(), rest: m[3] };
}

/**
 * One roman numeral → a chord symbol in the key. "bVI" in D → "Bb"; "ii7" in C → "Dm7";
 * "iiø7" → "Dm7b5"; "V7/vi" in C → "E7" (secondary dominant: a numeral measured from another degree).
 */
export function romanToChord(numeral: string, tonic: number, mode = 'major'): string | null {
  const [head, target] = numeral.split('/');
  const h = numeralRoot(head);
  if (!h) return null;
  let base = 0;
  if (target) { const t = numeralRoot(target); if (!t) return null; base = t.semis; }
  const pc = (((tonic + base + h.semis) % 12) + 12) % 12;
  // Spell in flats for flat keys and minor-ish modes, where the borrowed degrees are flats.
  const minorish = mode !== 'major' && mode !== 'lydian' && mode !== 'mixolydian';
  const useFlats = FLAT_KEYS.has(tonic) || (minorish && !new Set([4, 11, 6, 1, 9]).has(tonic)) || head.startsWith('b');
  const root = (useFlats ? FLAT : SHARP)[pc];
  let q = h.rest;
  if (/^ø/.test(q)) return `${root}m7b5`;
  if (/^(dim|°)/.test(q)) return `${root}${q.replace('°', 'dim')}`;
  if (h.minor && !/^m(?!aj)/.test(q)) q = `m${q}`;
  return `${root}${q}`;
}

/** A roman-numeral progression → bars of chord symbols in the key. Unknown numerals throw. */
export function realizeProgression(progression: string, tonic: number, mode = 'major'): string[][] {
  return progression.split('|').map((bar) => bar.trim().split(/\s+/).filter(Boolean).map((n) => {
    const c = romanToChord(n, tonic, mode);
    if (!c) throw new Error(`Unreadable numeral "${n}" in "${progression}"`);
    return c;
  }));
}

export const DYNAMIC_ORDER: Dynamic[] = ['pp', 'p', 'mp', 'mf', 'f', 'ff'];
/** Energy 0…1 → a dynamic marking. */
export const dynamicFor = (energy: number): Dynamic => DYNAMIC_ORDER[Math.max(0, Math.min(5, Math.round(energy * 5)))];
/** A dynamic marking → the energy it implies. */
export const energyFor = (d: Dynamic): number => DYNAMIC_ORDER.indexOf(d) / 5;
