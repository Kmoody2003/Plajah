// musicSpine.ts — the Conservatory's scope & sequence, Pre-K to lifelong.
//
// One spine, five strands (Ear, Rhythm, Notation, Harmony, Composition), four school bands plus
// a lifelong band. Each cell is a learner-facing "I can" goal, the standard it writes to (ids in
// data/educationStandards.ts — MUSIC.* nodes crosswalk to NCAS anchors and to the CCSS math/ELA
// standards they exercise), and the places on the platform where it is practised. The spine is
// what ties the Conservatory, the Math Quest and the language-arts school into one curriculum.

import type { BandId, GymModeId } from './earTraining';

export type StrandId = 'EAR' | 'RHY' | 'NOT' | 'HAR' | 'COMP';
export type SpineBandId = BandId | 'LIFE';

export const STRANDS: { id: StrandId; title: string; emoji: string; blurb: string }[] = [
  { id: 'EAR', title: 'Ear & Audiation', emoji: '👂', blurb: 'Hearing music in your mind — the root of every other skill.' },
  { id: 'RHY', title: 'Rhythm & Metre', emoji: '🥁', blurb: 'Beat, duration and groove — and the fractions inside them.' },
  { id: 'NOT', title: 'Reading & Notation', emoji: '🎼', blurb: 'The writing system for sound, taught after the sound.' },
  { id: 'HAR', title: 'Harmony', emoji: '🎹', blurb: 'Chords, keys and the ratios that make them consonant.' },
  { id: 'COMP', title: 'Composition & Writing', emoji: '✍️', blurb: 'Making music — and writing about it — as literature.' },
];

export const BANDS: { id: SpineBandId; label: string; ages: string }[] = [
  { id: 'K2', label: 'Pre-K – 2', ages: '4–8' },
  { id: '35', label: 'Grades 3–5', ages: '8–11' },
  { id: '68', label: 'Grades 6–8', ages: '11–14' },
  { id: 'HS', label: 'Grades 9–12', ages: '14–18' },
  { id: 'LIFE', label: 'Lifelong', ages: 'Any age' },
];

/** Where a goal is practised. `view` is an App view id; gym/sprint open inside the Conservatory. */
export type SpineLink =
  | { kind: 'gym'; mode: GymModeId; label: string }
  | { kind: 'sprint'; level: number; label: string }
  | { kind: 'course'; courseId: string; label: string }
  | { kind: 'mathQuest'; grade: number; label: string }
  | { kind: 'view'; view: string; label: string };

export interface SpineCell {
  strand: StrandId;
  band: SpineBandId;
  goals: string[];
  standardIds: string[];
  links: SpineLink[];
}

export const SPINE: SpineCell[] = [
  // ── Pre-K – 2: play, sing, move ────────────────────────────────────────────
  { strand: 'EAR', band: 'K2', standardIds: ['MUSIC.EAR.K2', 'MU:Re7.2'],
    goals: ['I can echo a short tune in tune.', 'I can hear if a melody goes up, down or stays.', 'I can tell loud from soft and fast from slow.'],
    links: [{ kind: 'gym', mode: 'contour', label: 'Up or Down?' }, { kind: 'course', courseId: 'music-theory-early', label: 'Early Music Foundations' }] },
  { strand: 'RHY', band: 'K2', standardIds: ['MUSIC.RHY.K2', 'CCSS.ELA-LITERACY.RL.2.4'],
    goals: ['I can keep a steady beat while I walk, clap or tap.', 'I can clap the rhythm of my name and of a rhyme.', 'I know beat (the heartbeat) is different from rhythm (the words).'],
    links: [{ kind: 'course', courseId: 'music-language-arts', label: 'Rhythm Is Language' }, { kind: 'mathQuest', grade: 1, label: 'Music Math · Grade 1' }] },
  { strand: 'NOT', band: 'K2', standardIds: ['MUSIC.NOT.K2'],
    goals: ['I can read picture notation: long and short lines, high and low dots.', 'I can draw a picture of a sound I just heard.'],
    links: [{ kind: 'course', courseId: 'music-theory-early', label: 'Early Music Foundations' }] },
  { strand: 'HAR', band: 'K2', standardIds: ['MU:Re7.2'],
    goals: ['I can hear when two notes sound calm together and when they clash.'],
    links: [{ kind: 'gym', mode: 'majmin', label: 'Sunny or Stormy' }] },
  { strand: 'COMP', band: 'K2', standardIds: ['MUSIC.COMP.K2', 'MU:Cr1.1'],
    goals: ['I can make up a new verse to a song I know.', 'I can say what my song is about.'],
    links: [{ kind: 'course', courseId: 'music-language-arts', label: 'Music as Language' }] },

  // ── Grades 3–5: name what you hear ─────────────────────────────────────────
  { strand: 'EAR', band: '35', standardIds: ['MUSIC.EAR.35'],
    goals: ['I can hear major vs minor.', 'I can sing do–re–mi–sol patterns from a starting note.', 'I can tell a step from a skip from a leap.'],
    links: [{ kind: 'gym', mode: 'majmin', label: 'Sunny or Stormy' }, { kind: 'gym', mode: 'degrees', label: 'Find Home' }] },
  { strand: 'RHY', band: '35', standardIds: ['MUSIC.RHY.35', 'CCSS.MATH.3.NF', 'CCSS.MATH.4.NF'],
    goals: ['I can read whole, half, quarter and eighth notes and rests.', 'I can show that two quarters equal one half — in music and in math.', 'I can fill a 3/4 or 4/4 bar correctly.'],
    links: [{ kind: 'gym', mode: 'rhythm', label: 'Rhythm Reader' }, { kind: 'mathQuest', grade: 3, label: 'Music Math · Grade 3' }, { kind: 'mathQuest', grade: 4, label: 'Music Math · Grade 4' }] },
  { strand: 'NOT', band: '35', standardIds: ['MUSIC.NOT.35'],
    goals: ['I can find Middle C, Treble G and High C on the staff.', 'I can read other notes as a step or skip from those landmarks.'],
    links: [{ kind: 'sprint', level: 0, label: 'Staff Sprint · Treble landmarks' }, { kind: 'course', courseId: 'music-theory-elementary', label: 'Elementary Music Theory' }] },
  { strand: 'HAR', band: '35', standardIds: ['MUSIC.HAR.35'],
    goals: ['I can build a major scale from whole and half steps.', 'I can play I, IV and V and hear when a song wants to change chord.'],
    links: [{ kind: 'course', courseId: 'music-theory-elementary', label: 'Elementary Music Theory' }] },
  { strand: 'COMP', band: '35', standardIds: ['MUSIC.COMP.35', 'CCSS.ELA-LITERACY.RL.4.5', 'CCSS.ELA-LITERACY.W.5.3'],
    goals: ['I can write a song lyric with a refrain.', 'I can set words so the stressed syllables land on strong beats.', 'I can explain how a poem and a song both use meter.'],
    links: [{ kind: 'course', courseId: 'music-language-arts', label: 'The Songwriter’s Craft' }, { kind: 'view', view: 'MUSIC', label: 'Publish in Chora' }] },

  // ── Grades 6–8: hear structure, read fluently ──────────────────────────────
  { strand: 'EAR', band: '68', standardIds: ['MUSIC.EAR.68', 'THEORY.intervals'],
    goals: ['I can name intervals by ear, up, down and together.', 'I can name any scale degree in a key by its feeling.'],
    links: [{ kind: 'gym', mode: 'intervals', label: 'Interval Lab' }, { kind: 'gym', mode: 'degrees', label: 'Find Home' }] },
  { strand: 'RHY', band: '68', standardIds: ['MUSIC.RHY.68', 'CCSS.MATH.5.NF', 'CCSS.MATH.6.RP'],
    goals: ['I can read dotted rhythms, sixteenths and triplets.', 'I can convert tempo (BPM) to seconds per beat and back.', 'I can explain 6/8 vs 3/4 as different ways of dividing the same length.'],
    links: [{ kind: 'gym', mode: 'rhythm', label: 'Rhythm Reader' }, { kind: 'mathQuest', grade: 6, label: 'Music Math · Grade 6' }] },
  { strand: 'NOT', band: '68', standardIds: ['MUSIC.NOT.68'],
    goals: ['I can read treble and bass clef fluently.', 'I can read ledger lines and key signatures.'],
    links: [{ kind: 'sprint', level: 3, label: 'Staff Sprint · Bass clef' }, { kind: 'sprint', level: 5, label: 'Staff Sprint · Grand staff' }, { kind: 'course', courseId: 'music-theory-secondary', label: 'Secondary Music Theory' }] },
  { strand: 'HAR', band: '68', standardIds: ['MUSIC.HAR.68', 'CCSS.MATH.6.RP'],
    goals: ['I can hear and build major, minor, diminished and augmented triads.', 'I can explain why a fifth (3:2) sounds stable using ratios.'],
    links: [{ kind: 'gym', mode: 'chords', label: 'Chord Colours' }, { kind: 'mathQuest', grade: 6, label: 'Music Math · ratios' }] },
  { strand: 'COMP', band: '68', standardIds: ['MUSIC.COMP.68', 'CCSS.ELA-LITERACY.RL.5.5', 'CCSS.ELA-LITERACY.W.8.3'],
    goals: ['I can compose in a form I chose (AABA, verse–chorus) and explain why.', 'I can write a narrative song with a point of view and concrete images.'],
    links: [{ kind: 'course', courseId: 'music-language-arts', label: 'Form as Story Structure' }] },

  // ── Grades 9–12: analyse, dictate, create complete works ──────────────────
  { strand: 'EAR', band: 'HS', standardIds: ['MUSIC.EAR.HS', 'MU:Re9.1'],
    goals: ['I can take melodic dictation in solfège.', 'I can name cadences and common progressions by ear.'],
    links: [{ kind: 'gym', mode: 'melody', label: 'Melody Detective' }, { kind: 'gym', mode: 'cadences', label: 'Punctuation' }] },
  { strand: 'RHY', band: 'HS', standardIds: ['MUSIC.RHY.HS'],
    goals: ['I can perform and notate syncopation and simple polyrhythm (3 against 2).'],
    links: [{ kind: 'gym', mode: 'rhythm', label: 'Rhythm Reader · syncopation' }, { kind: 'mathQuest', grade: 8, label: 'Music Math · Grade 8' }] },
  { strand: 'NOT', band: 'HS', standardIds: ['MUSIC.NOT.HS'],
    goals: ['I can follow a multi-staff score and read alto clef.', 'I can read music written for transposing instruments.'],
    links: [{ kind: 'sprint', level: 6, label: 'Staff Sprint · Ledger lines' }, { kind: 'course', courseId: 'music-theory-college', label: 'College Music Theory' }] },
  { strand: 'HAR', band: 'HS', standardIds: ['MUSIC.HAR.HS', 'CCSS.MATH.HSF-LE'],
    goals: ['I can write four-part harmony and analyse with Roman numerals.', 'I can explain equal temperament as the exponential 2^(n/12).'],
    links: [{ kind: 'gym', mode: 'chords', label: 'Chord Colours · sevenths' }, { kind: 'course', courseId: 'music-theory-college', label: 'College Music Theory' }] },
  { strand: 'COMP', band: 'HS', standardIds: ['MUSIC.COMP.HS', 'MU:Cr3.2', 'CCSS.ELA-LITERACY.RL.11-12.5'],
    goals: ['I can compose, revise and present a complete work.', 'I can write a programme note that argues for my structural choices.'],
    links: [{ kind: 'course', courseId: 'music-language-arts', label: 'Reading Scores Like Texts' }, { kind: 'view', view: 'MUSIC', label: 'Publish in Chora' }] },

  // ── Lifelong: the same spine, entered anywhere ─────────────────────────────
  { strand: 'EAR', band: 'LIFE', standardIds: ['MUSIC.EAR.68'],
    goals: ['Five minutes a day of the Daily Mix — adults learn intervals and degrees the same way children do.'],
    links: [{ kind: 'gym', mode: 'intervals', label: 'Interval Lab' }] },
  { strand: 'RHY', band: 'LIFE', standardIds: ['MUSIC.RHY.68'],
    goals: ['Read the rhythms of the songs you already love.'],
    links: [{ kind: 'gym', mode: 'rhythm', label: 'Rhythm Reader' }] },
  { strand: 'NOT', band: 'LIFE', standardIds: ['MUSIC.NOT.68'],
    goals: ['Learn six landmark notes, then read everything else as a step or skip from them.'],
    links: [{ kind: 'sprint', level: 0, label: 'Staff Sprint' }] },
  { strand: 'HAR', band: 'LIFE', standardIds: ['MUSIC.HAR.68'],
    goals: ['Hear why your favourite chord change gives you chills — then use it.'],
    links: [{ kind: 'gym', mode: 'chords', label: 'Chord Colours' }, { kind: 'view', view: 'CHORA_STUDIO', label: 'Chora Studio' }] },
  { strand: 'COMP', band: 'LIFE', standardIds: ['MUSIC.COMP.68'],
    goals: ['Write the song you have been carrying around.'],
    links: [{ kind: 'course', courseId: 'music-language-arts', label: 'The Songwriter’s Craft' }] },
];

export const spineCell = (strand: StrandId, band: SpineBandId) => SPINE.find(c => c.strand === strand && c.band === band);
