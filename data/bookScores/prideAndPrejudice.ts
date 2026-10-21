/**
 * Pride and Prejudice — "Longbourn to Pemberley", concert overture for the book's score.
 *
 * Through-composed, 100 bars of 3/4 in D major (♩ = 88, ≈ 3′25″), for flute, oboe, clarinet,
 * bassoon, horn, harp, piano and strings. Score in C (everything written at concert pitch;
 * contrabass sounds an octave lower).
 *
 * Two themes, and the form follows the novel:
 *   Elizabeth — a quick-witted rising figure (A4 → D5 E5 → F#5), always light, always moving.
 *   Darcy     — a proud falling fourth in B minor (B4 ↓ F#4) and a dotted climb (G4. A4 B4), slow
 *               and held, first in the horn and cellos.
 *
 *   1–8     Introduction      piano alone, Elizabeth's figure in fragments; the Darcy rhythm slips in at bar 7
 *   9–24    A  Elizabeth      flute, then violins; pizzicato waltz strings, piano left hand
 *   25–32   A′ First meeting   violins take the theme; the oboe plays what will become Darcy's counter-line
 *   33–40   Transition        the figure in the oboe darkens (G minor shadow at 36), to F♯7
 *   41–56   B  Darcy          horn and cellos in B minor; violins carry it up and back to B minor
 *   57–72   Development       Netherfield (clarinet dance in E minor) · the two themes answer each
 *                             other · crescendo to the refusal on F♯7 (bar 68) · the letter: piano alone
 *   73–88   A″ Reconciliation  Elizabeth's theme, full orchestra, Darcy's line set against it in horn and cellos
 *   89–100  Coda              the piano again, the flute's last echo, D major
 *
 * Accompaniment is voice-led from the harmonic plan below (scoreEngine textures); every melodic
 * line is written out by hand.
 */

import {
  ScoreBuilder,
  afterbeats,
  bassLine,
  brokenChord,
  pulseChords,
  sustainVoices,
  type Score,
  type ScorePart,
} from '../../services/melos/score/scoreEngine';

const PARTS: ScorePart[] = [
  { id: 'fl', name: 'Flute', abbr: 'Fl.', clef: 'treble', gmProgram: 73, group: 'woodwinds', chora: { instrumentType: 'pneuma', presetId: 'pneuma-hall', gainDb: -3, pan: -0.2 } },
  { id: 'ob', name: 'Oboe', abbr: 'Ob.', clef: 'treble', gmProgram: 68, group: 'woodwinds', chora: { instrumentType: 'pneuma', presetId: 'pneuma-ney', gainDb: -4, pan: 0.15 } },
  { id: 'cl', name: 'Clarinet', abbr: 'Cl.', clef: 'treble', gmProgram: 71, group: 'woodwinds', chora: { instrumentType: 'aura', presetId: 'aura-mellotron-flute', gainDb: -8, pan: -0.1 } },
  { id: 'bn', name: 'Bassoon', abbr: 'Bn.', clef: 'bass', gmProgram: 70, group: 'woodwinds', chora: { instrumentType: 'bajo', presetId: 'cello-menace', gainDb: -12, pan: 0.2 } },
  { id: 'hn', name: 'Horn', abbr: 'Hn.', clef: 'treble', gmProgram: 60, group: 'brass', chora: { instrumentType: 'aura', presetId: 'aura-cs80-bladerunner', gainDb: -7, pan: -0.35 } },
  { id: 'hpR', name: 'Harp', abbr: 'Hp.', clef: 'treble', gmProgram: 46, group: 'harp', chora: { instrumentType: 'vela', presetId: 'vitreous', gainDb: -6, pan: 0.45 } },
  { id: 'hpL', name: 'Harp (L.H.)', abbr: '', clef: 'bass', gmProgram: 46, group: 'harp', chora: { instrumentType: 'vela', presetId: 'vitreous', gainDb: -6, pan: 0.45 } },
  { id: 'pnoR', name: 'Piano', abbr: 'Pno.', clef: 'treble', gmProgram: 0, group: 'piano', chora: { instrumentType: 'aura', presetId: 'aura-rmi-electrapiano', gainDb: -2, pan: -0.05 } },
  { id: 'pnoL', name: 'Piano (L.H.)', abbr: '', clef: 'bass', gmProgram: 0, group: 'piano', chora: { instrumentType: 'aura', presetId: 'aura-rmi-electrapiano', gainDb: -4, pan: -0.05 } },
  { id: 'vn1', name: 'Violin I', abbr: 'Vn. I', clef: 'treble', gmProgram: 48, group: 'strings', chora: { instrumentType: 'aura', presetId: 'aura-mellotron-violins', gainDb: -3, pan: -0.45 } },
  { id: 'vn2', name: 'Violin II', abbr: 'Vn. II', clef: 'treble', gmProgram: 48, group: 'strings', chora: { instrumentType: 'aura', presetId: 'aura-solina-74', gainDb: -8, pan: -0.15 } },
  { id: 'va', name: 'Viola', abbr: 'Va.', clef: 'alto', gmProgram: 48, group: 'strings', chora: { instrumentType: 'aura', presetId: 'aura-logan-melody', gainDb: -9, pan: 0.15 } },
  { id: 'vc', name: 'Violoncello', abbr: 'Vc.', clef: 'bass', gmProgram: 42, group: 'strings', chora: { instrumentType: 'bajo', presetId: 'cello-menace', gainDb: -5, pan: 0.35 } },
  { id: 'cb', name: 'Contrabass', abbr: 'Cb.', clef: 'bass', octaveTranspose: -1, gmProgram: 43, group: 'strings', chora: { instrumentType: 'bajo', presetId: 'bowed-contrabass', gainDb: -5, pan: 0.5 } },
];

// ── Themes (hand-written) ────────────────────────────────────────────────────────────────────

/** Elizabeth, 16 bars: antecedent to the half cadence (8), consequent to the full close (16). */
const ELIZABETH = [
  'A4q D5e E5e F#5q', 'G5e F#5e E5q D5q', 'B5q. A5e G5q', 'F#5h E5q',
  'D5q F#5e G5e A5q', 'B5e A5e G5q F#5q', 'E5q G5e F#5e E5q', 'E5h rq',
  'A4q D5e E5e F#5q', 'G5e F#5e E5q D5q', 'B5q. C#6e D6q', 'A5h G5e F#5e',
  'B5q A5e G5e F#5q', 'G5q. F#5e E5q', 'E5q. F#5e E5e C#5e', 'D5h rq',
];

/** Darcy, 16 bars, B minor: the falling fourth and dotted climb, then the line opening upward. */
const DARCY = [
  'B4h F#4q', 'G4q. A4e B4q', 'E5h D5q', 'C#5h.',
  'B4h F#4q', 'G4q. A4e B4q', 'E5q. D5e C#5q', 'D5h.',
  'D5q E5q F#5q', 'G5h E5q', 'A5q. G5e E5q', 'F#5h D5q',
  'B5h A5e G5e', 'G5q F#5q E5q', 'F#5h E5q', 'D5h.',
];

/** Darcy's shape fitted under Elizabeth's harmony — heard first in the oboe (A′), at full height in A″. */
const COUNTERLINE = [
  'D5h A4q', 'A4q. G4e F#4q', 'G4h B4q', 'C#5h.',
  'D5h B4q', 'G4q. A4e B4q', 'E5h D5q', 'C#5h.',
  'D5h A4q', 'A4q. G4e F#4q', 'G#4h B4q', 'C#5h G4q',
  'D5h B4q', 'G4q. A4e B4q', 'C#5h A4q', 'D5h.',
];

const bars = (lines: string[], from = 0, to = lines.length) => lines.slice(from, to).join(' | ');
const octave = (line: string, by: number) => line.replace(/([A-G](?:##|#|bb|b)?)(\d)/g, (_, n, o) => `${n}${Number(o) + by}`);
const withDyn = (dyn: string, line: string) => `!${dyn} ${line}`;

// ── Ranges (MIDI) ────────────────────────────────────────────────────────────────────────────

const R = {
  vn2: { lo: 62, hi: 79 }, va: { lo: 55, hi: 70 }, vcTenor: { lo: 48, hi: 62 },
  vcBass: { lo: 38, hi: 55 }, cbWritten: { lo: 40, hi: 55 }, bnBass: { lo: 38, hi: 55 },
  ob: { lo: 66, hi: 81 }, cl: { lo: 58, hi: 74 }, bnTenor: { lo: 48, hi: 60 }, hn: { lo: 57, hi: 72 },
  hpBass: { lo: 38, hi: 52 },
};

export function buildPrideAndPrejudiceOverture(): Score {
  const sb = new ScoreBuilder({
    id: 'pride-and-prejudice-overture',
    title: 'Pride and Prejudice',
    subtitle: 'I. Longbourn to Pemberley — Overture · Score in C',
    composer: 'Plajah Chora Scoring, after Jane Austen',
    bpm: 88,
    beatsPerBar: 3,
    beatUnit: 4,
    keyFifths: 2,
    keyMode: 'major',
    parts: PARTS,
  }, 100);

  // ── Harmonic plan ──────────────────────────────────────────────────────────────────────────
  // bar 4: cadential 6/4 under the held F# (D/A for two beats, A on the third)
  const A_HARMONY = 'D | D/F# | G | D/A:2 A:1 | Bm | G | Em7 | A | D | D/F# | E7/G# | A7 | Bm | G | A7 | D';
  sb.harmony(1, 'D | G/D | D | A/C# | Bm | G | Em7 | A7');
  sb.harmony(9, A_HARMONY);
  sb.harmony(25, 'D | D/F# | G | D/A:2 A:1 | Bm | G | Em7 | A');
  sb.harmony(33, 'D | D7/C | G/B | Gm/Bb | D/A | C#ø7/G | F#7 | F#7');
  sb.harmony(41, 'Bm | G | Em | F# | Bm | G | A | D | G | Em7 | A7 | D/A | G | Em | F#7 | Bm');
  sb.harmony(57, 'Em | Am/C | B7 | Em | G | D/F# | Em7 | A7 | Bm | Em/G | C#ø7 | F#7 | Bm | G | Em/G | A7');
  sb.harmony(73, A_HARMONY);
  sb.harmony(89, 'D | G/D | D | G/D | Bm | G | Em7 | A7sus4 | A7 | D | G/D | D');

  sb.section(1, 'Intro', 'Andante grazioso')
    .section(9, 'A', 'Elizabeth')
    .section(25, 'B', 'First impressions')
    .section(33, 'C', 'Prejudice')
    .section(41, 'D', 'Darcy — Pride')
    .section(57, 'E', 'Netherfield')
    .section(65, 'F', 'The refusal')
    .section(69, 'G', 'The letter')
    .section(73, 'H', 'Pemberley — Reconciliation')
    .section(89, 'I', 'Coda');

  // ── 1–8 Introduction: piano alone, strings steal in at 5 ───────────────────────────────────
  sb.write('pnoR', 1, '!p "dolce" A4q D5e E5e F#5q | G5h B4q | A4q D5e E5e F#5q | [A4 C#5 E5]h. | D5q F#5e E5e D5q | D5q B4h | G4q. A4e B4q | [G4 C#5 E5]h rq');
  brokenChord(sb, 'pnoL', 44, 1, 8, { shape: 'alberti', fromBass: true, dynamic: 'pp' });
  sustainVoices(sb, ['vn2', 'va'], [R.vn2, R.va], 5, 8, { dynamic: 'pp', words: 'con sord.' });
  bassLine(sb, 'vc', R.vcBass, 5, 8, { dynamic: 'pp' });

  // ── 9–24 A: Elizabeth ──────────────────────────────────────────────────────────────────────
  sb.write('fl', 9, withDyn('mp', bars(ELIZABETH, 0, 8)));
  sb.write('vn1', 17, `!mf "espress." ${bars(ELIZABETH, 8, 16)}`);
  sb.write('fl', 17, withDyn('mp', bars(ELIZABETH, 8, 16)));
  brokenChord(sb, 'pnoL', 44, 9, 24, { shape: 'alberti', fromBass: true, dynamic: 'p' });
  bassLine(sb, 'vc', R.vcBass, 9, 24, { pattern: 'beat1', artics: ['pizz'], dynamic: 'p', words: 'pizz.' });
  bassLine(sb, 'cb', R.cbWritten, 9, 24, { pattern: 'beat1', artics: ['pizz'], dynamic: 'p', words: 'pizz.' });
  afterbeats(sb, 'vn2', [{ lo: 66, hi: 78 }, { lo: 60, hi: 71 }], 9, 24, { artics: ['pizz', 'staccato'], dynamic: 'p', words: 'pizz.' });
  afterbeats(sb, 'va', [R.va], 9, 24, { artics: ['pizz', 'staccato'], dynamic: 'p', words: 'pizz.' });
  sustainVoices(sb, ['cl', 'bn'], [R.cl, R.bnTenor], 17, 24, { dynamic: 'pp' });

  // ── 25–32 A′: violins have the theme, the oboe foreshadows Darcy ───────────────────────────
  sb.write('vn1', 25, `!mf "arco" ${bars(ELIZABETH, 0, 8)}`);
  sb.write('fl', 29, withDyn('mp', octave(bars(ELIZABETH, 4, 8), 1)));
  sb.write('ob', 25, `!mp "dolce" ${bars(COUNTERLINE, 0, 8)}`);
  sustainVoices(sb, ['vn2', 'va'], [R.vn2, R.va], 25, 32, { dynamic: 'p', words: 'arco' });
  bassLine(sb, 'vc', R.vcBass, 25, 32, { dynamic: 'p', words: 'arco' });
  bassLine(sb, 'cb', R.cbWritten, 25, 32, { dynamic: 'p', words: 'arco' });
  brokenChord(sb, 'hpR', 62, 25, 32, { shape: 'rising', dynamic: 'p' });
  bassLine(sb, 'hpL', R.hpBass, 25, 32, { pattern: 'beat1', dynamic: 'p' });
  sustainVoices(sb, ['cl', 'bn'], [R.cl, R.bnTenor], 25, 32, { dynamic: 'pp' });

  // ── 33–40 Transition: the figure darkens ───────────────────────────────────────────────────
  sb.write('ob', 33, '!mp A4q D5e E5e F#5q | F#5h E5e D5e | D5h rq | !p Bb4q D5e C5e Bb4q | A4h. | G4q B4q E5q | !mf E5h C#5q | A#4h.');
  sb.write('cl', 33, '!p rm | rq C5q A4q | B4h. | rq G4h | F#4h. | rm | rm | rm');
  sustainVoices(sb, ['vn1', 'vn2', 'va'], [{ lo: 69, hi: 81 }, R.vn2, R.va], 33, 40, { dynamic: 'pp', toDynamic: 'mf', artics: ['tremolo'], words: 'trem.' });
  bassLine(sb, 'vc', R.vcBass, 33, 40, { dynamic: 'p', toDynamic: 'mf' });
  bassLine(sb, 'cb', R.cbWritten, 33, 40, { dynamic: 'p', toDynamic: 'mf' });
  brokenChord(sb, 'pnoL', 44, 33, 36, { shape: 'alberti', fromBass: true, dynamic: 'pp' });
  sb.write('hn', 39, '!p F#4h. | !mf F#4h rq');
  sb.write('bn', 37, '!p A3h. | G3h. | F#3h. | F#3h.');

  // ── 41–56 B: Darcy ─────────────────────────────────────────────────────────────────────────
  sb.write('hn', 41, `!mf "nobilmente" ${bars(DARCY, 0, 8)}`);
  sb.write('vc', 41, `!mf ${octave(bars(DARCY, 0, 8), -1)}`);
  sb.write('vn1', 49, `!f "cantabile" ${bars(DARCY, 8, 16)}`);
  sb.write('vc', 49, `!f ${octave(bars(DARCY, 8, 16), -2)}`);
  sb.write('fl', 49, withDyn('mf', bars(DARCY, 8, 16)));
  sb.write('cl', 49, withDyn('mf', octave(bars(DARCY, 8, 16), -1)));
  sustainVoices(sb, ['vn2', 'va'], [R.vn2, R.va], 41, 48, { dynamic: 'p' });
  sustainVoices(sb, ['vn2', 'va', 'hn'], [{ lo: 64, hi: 79 }, R.va, R.hn], 49, 56, { dynamic: 'mf' });
  sustainVoices(sb, ['ob'], [R.ob], 53, 56, { dynamic: 'mf' });
  bassLine(sb, 'cb', R.cbWritten, 41, 56, { dynamic: 'mf' });
  bassLine(sb, 'bn', R.bnBass, 41, 56, { dynamic: 'p', toDynamic: 'mf' });
  bassLine(sb, 'hpL', R.hpBass, 41, 48, { pattern: 'beat1', dynamic: 'p' });
  brokenChord(sb, 'hpR', 59, 41, 48, { shape: 'wave', dynamic: 'p' });
  brokenChord(sb, 'hpR', 62, 49, 56, { shape: 'rising', dynamic: 'mf' });
  bassLine(sb, 'hpL', R.hpBass, 49, 56, { pattern: 'beat1', dynamic: 'mf' });

  // ── 57–72 Development ──────────────────────────────────────────────────────────────────────
  // Netherfield: the clarinet dances Elizabeth's figure in E minor over pizzicato waltz
  sb.write('cl', 57, '!mf "leggiero" B4q E5e F#5e G5q | A5e G5e F#5q E5q | D#5q. E5e F#5q | E5h rq');
  bassLine(sb, 'vc', R.vcBass, 57, 60, { pattern: 'beat1', artics: ['pizz'], dynamic: 'mp', words: 'pizz.' });
  bassLine(sb, 'cb', R.cbWritten, 57, 60, { pattern: 'beat1', artics: ['pizz'], dynamic: 'mp', words: 'pizz.' });
  afterbeats(sb, 'vn2', [{ lo: 64, hi: 76 }, { lo: 59, hi: 69 }], 57, 60, { artics: ['pizz', 'staccato'], dynamic: 'mp', words: 'pizz.' });
  afterbeats(sb, 'va', [R.va], 57, 60, { artics: ['pizz', 'staccato'], dynamic: 'mp', words: 'pizz.' });
  // the two themes answer each other
  sb.write('hn', 61, '!mf D5h B4q | F#4q. G4e A4q | B4h G4q | C#5h.');
  sb.write('fl', 63, '!mp rq E5e F#5e G5q | A5q G5q E5q');
  sustainVoices(sb, ['vn2', 'va'], [R.vn2, R.va], 61, 64, { dynamic: 'p', words: 'arco' });
  bassLine(sb, 'vc', R.vcBass, 61, 64, { dynamic: 'p', words: 'arco' });
  bassLine(sb, 'cb', R.cbWritten, 61, 64, { dynamic: 'p', words: 'arco' });
  sustainVoices(sb, ['bn'], [R.bnTenor], 61, 64, { dynamic: 'p' });
  // the refusal: everything climbs to F#7
  sb.write('vn1', 65, '!mf F#5q B5q D6q | E6h B5q | !f C#6q E6q G6q | !ff F#6h.>');
  sb.write('fl', 65, '!mf F#5q B5q D6q | E6h B5q | !f C#6q E6q G6q | !ff F#6h.>');
  sb.write('vn2', 65, '!mf F#4q B4q D5q | E5h B4q | !f C#5q E5q G5q | !ff F#5h.>');
  sustainVoices(sb, ['ob', 'cl', 'hn'], [R.ob, R.cl, R.hn], 65, 68, { dynamic: 'mf', toDynamic: 'ff' });
  pulseChords(sb, 'va', [R.va], 65, 68, { dynamic: 'mf', toDynamic: 'ff' });
  bassLine(sb, 'vc', R.vcBass, 65, 68, { dynamic: 'mf', toDynamic: 'ff' });
  bassLine(sb, 'cb', R.cbWritten, 65, 68, { dynamic: 'mf', toDynamic: 'ff' });
  bassLine(sb, 'bn', R.bnBass, 65, 68, { dynamic: 'mf', toDynamic: 'ff' });
  brokenChord(sb, 'hpR', 62, 65, 68, { shape: 'rising', dynamic: 'mf', toDynamic: 'f' });
  bassLine(sb, 'hpL', R.hpBass, 65, 68, { pattern: 'beat1', dynamic: 'f' });
  // the letter: piano alone, Darcy's theme quietly
  sb.write('pnoR', 69, '!p "semplice" B4h F#4q | G4q. A4e B4q | E5h D5q | C#5h rq');
  brokenChord(sb, 'pnoL', 44, 69, 72, { shape: 'alberti', fromBass: true, dynamic: 'pp' });

  // ── 73–88 A″ Reconciliation: both themes at once ───────────────────────────────────────────
  sb.write('vn1', 73, `!f "con_slancio" ${bars(ELIZABETH, 0, 10)} | !ff ${bars(ELIZABETH, 10, 13)} | !f ${bars(ELIZABETH, 13, 16)}`);
  sb.double('vn1', 'fl', 73, 88);
  sb.double('vn1', 'cl', 73, 88, -1, 0.9);
  sb.write('hn', 73, `!f ${bars(COUNTERLINE)}`);
  sb.write('vc', 73, `!f ${octave(bars(COUNTERLINE), -1)}`);
  sustainVoices(sb, ['ob', 'vn2', 'va'], [R.ob, R.vn2, R.va], 73, 88, { dynamic: 'mf' });
  bassLine(sb, 'cb', R.cbWritten, 73, 88, { dynamic: 'f' });
  bassLine(sb, 'bn', R.bnBass, 73, 88, { dynamic: 'mf' });
  brokenChord(sb, 'hpR', 62, 73, 88, { shape: 'rising', dynamic: 'f' });
  bassLine(sb, 'hpL', R.hpBass, 73, 88, { pattern: 'beat1', dynamic: 'f' });
  brokenChord(sb, 'pnoL', 44, 73, 88, { shape: 'alberti', fromBass: true, dynamic: 'mf' });

  // ── 89–100 Coda ────────────────────────────────────────────────────────────────────────────
  sb.write('pnoR', 89, '!p "dolce" A4q D5e E5e F#5q | G5h B4q | A4q D5e E5e F#5q | G5h. | F#5q D5q B4q | G4q. A4e B4q | E5h D5q | D5h. | C#5h. | !pp D5h. | [B4 D5 G5]h. | [A4 D5 F#5]h.');
  brokenChord(sb, 'pnoL', 44, 89, 97, { shape: 'alberti', fromBass: true, dynamic: 'pp' });
  sb.write('pnoL', 98, '[D2 A2]h. | [D2 B2]h. | [D2 A2]h.');
  sb.write('fl', 98, '!pp A5q D6e E6e F#6q | G6h. | F#6h.');
  sustainVoices(sb, ['vn2', 'va'], [R.vn2, R.va], 89, 100, { dynamic: 'pp', words: 'con sord.' });
  bassLine(sb, 'vc', R.vcBass, 89, 100, { dynamic: 'pp' });
  bassLine(sb, 'cb', R.cbWritten, 93, 100, { dynamic: 'pp' });
  sustainVoices(sb, ['hn'], [R.hn], 93, 99, { dynamic: 'pp' });
  brokenChord(sb, 'hpR', 62, 93, 99, { shape: 'rising', dynamic: 'pp' });
  sb.write('hpR', 100, '!pp [F#4 A4 D5]h.');
  sb.write('hpL', 100, '[D2 A2 D3]h.');

  return sb.score;
}
