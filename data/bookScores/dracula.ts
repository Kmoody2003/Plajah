/**
 * Dracula — "The Count", concert overture for the book's score.
 *
 * Through-composed, 88 bars of 4/4 in D minor (♩ = 76, ≈ 4′38″), for flute, oboe, clarinet,
 * bassoon, horn, trombone, cimbalom, harp, organ, wordless choir and strings. Score in C
 * (contrabass sounds an octave lower). Turns to D major at bar 78.
 *
 * Two themes, set against each other the way the novel sets Transylvania against England:
 *   The Count — D up a minor sixth to B♭, the half-step sigh to A, then a chromatic fall; the
 *               phrase climbs only to sink back by way of E♭ (the Phrygian ♭II). Low, slow, ancient.
 *   Mina      — a warm, open line in F major (C up to F, G, A), strings and harp: the English side.
 *   The Brides get no theme of their own, only a sinuous chromatic oboe line over glassy tremolo.
 *   Van Helsing's hunters are a horn chorale.
 *
 *   1–8     Borgo Pass        tremolo pedal on D, the Count's interval in a distant horn
 *   9–24    The Count         his theme in cellos, bassoon and trombone, then a fifth higher in horn and violas
 *   25–32   The Brides        oboe, then flute and clarinet, over wordless choir and sul ponticello strings
 *   33–44   Whitby            Mina's theme in the violins, F major, harp
 *   45–56   The Demeter       storm: the Count's theme in the brass over agitato strings, to A7♭9
 *   57–64   Van Helsing       the hunters' chorale
 *   65–76   The Pursuit       sixteenth-note ostinato, the Count's theme against Mina's figure, to the castle
 *   77–84   Sunset            one last blow, silence; Mina's theme in D major ("a look of peace")
 *   85–88   Coda              D major, but the horn still remembers the Count's B♭
 *
 * Accompaniment is voice-led from the harmonic plan below (scoreEngine textures); every melodic
 * line is written out by hand.
 */

import {
  ScoreBuilder,
  VoiceLeader,
  bassLine,
  brokenChord,
  chordPad,
  pitchMidi,
  pulseChords,
  sustainVoices,
  type Score,
  type ScorePart,
  type VoiceRange,
} from '../../services/melos/score/scoreEngine';

const PARTS: ScorePart[] = [
  { id: 'fl', name: 'Flute', abbr: 'Fl.', clef: 'treble', gmProgram: 73, group: 'woodwinds', chora: { instrumentType: 'pneuma', presetId: 'pneuma-hall', gainDb: -4, pan: -0.2 } },
  { id: 'ob', name: 'Oboe', abbr: 'Ob.', clef: 'treble', gmProgram: 68, group: 'woodwinds', chora: { instrumentType: 'pneuma', presetId: 'pneuma-ney', gainDb: -4, pan: 0.15 } },
  { id: 'cl', name: 'Clarinet', abbr: 'Cl.', clef: 'treble', gmProgram: 71, group: 'woodwinds', chora: { instrumentType: 'aura', presetId: 'aura-mellotron-flute', gainDb: -8, pan: -0.1 } },
  { id: 'bn', name: 'Bassoon', abbr: 'Bn.', clef: 'bass', gmProgram: 70, group: 'woodwinds', chora: { instrumentType: 'bajo', presetId: 'cello-menace', gainDb: -11, pan: 0.2 } },
  { id: 'hn', name: 'Horn', abbr: 'Hn.', clef: 'treble', gmProgram: 60, group: 'brass', chora: { instrumentType: 'aura', presetId: 'aura-cs80-bladerunner', gainDb: -6, pan: -0.35 } },
  { id: 'tbn', name: 'Trombone', abbr: 'Tbn.', clef: 'bass', gmProgram: 57, group: 'brass', chora: { instrumentType: 'aura', presetId: 'aura-modular-brass-69', gainDb: -8, pan: 0.3 } },
  { id: 'cim', name: 'Cimbalom', abbr: 'Cimb.', clef: 'treble', gmProgram: 15, group: 'percussion', chora: { instrumentType: 'vela', presetId: 'ferrous', gainDb: -7, pan: 0.4 } },
  { id: 'hpR', name: 'Harp', abbr: 'Hp.', clef: 'treble', gmProgram: 46, group: 'harp', chora: { instrumentType: 'vela', presetId: 'vitreous', gainDb: -7, pan: 0.45 } },
  { id: 'hpL', name: 'Harp (L.H.)', abbr: '', clef: 'bass', gmProgram: 46, group: 'harp', chora: { instrumentType: 'vela', presetId: 'vitreous', gainDb: -7, pan: 0.45 } },
  { id: 'orgM', name: 'Organ', abbr: 'Org.', clef: 'treble', gmProgram: 19, group: 'keyboard', chora: { instrumentType: 'ison', presetId: 'ison-bourdon', gainDb: -10, pan: 0 } },
  { id: 'orgP', name: 'Organ (Ped.)', abbr: 'Ped.', clef: 'bass', gmProgram: 19, group: 'keyboard', chora: { instrumentType: 'ison', presetId: 'ison-bourdon', gainDb: -8, pan: 0 } },
  { id: 'ch', name: 'Choir (Ah)', abbr: 'Ch.', clef: 'treble', gmProgram: 52, group: 'choir', chora: { instrumentType: 'aura', presetId: 'aura-mellotron-choir', gainDb: -8, pan: -0.05 } },
  { id: 'vn1', name: 'Violin I', abbr: 'Vn. I', clef: 'treble', gmProgram: 48, group: 'strings', chora: { instrumentType: 'aura', presetId: 'aura-mellotron-violins', gainDb: -3, pan: -0.45 } },
  { id: 'vn2', name: 'Violin II', abbr: 'Vn. II', clef: 'treble', gmProgram: 48, group: 'strings', chora: { instrumentType: 'aura', presetId: 'aura-solina-74', gainDb: -8, pan: -0.15 } },
  { id: 'va', name: 'Viola', abbr: 'Va.', clef: 'alto', gmProgram: 48, group: 'strings', chora: { instrumentType: 'aura', presetId: 'aura-logan-melody', gainDb: -8, pan: 0.15 } },
  { id: 'vc', name: 'Violoncello', abbr: 'Vc.', clef: 'bass', gmProgram: 42, group: 'strings', chora: { instrumentType: 'bajo', presetId: 'cello-menace', gainDb: -4, pan: 0.35 } },
  { id: 'cb', name: 'Contrabass', abbr: 'Cb.', clef: 'bass', octaveTranspose: -1, gmProgram: 43, group: 'strings', chora: { instrumentType: 'bajo', presetId: 'bowed-contrabass', gainDb: -4, pan: 0.5 } },
];

// ── Themes (hand-written) ────────────────────────────────────────────────────────────────────

/** The Count, 8 bars (cello register), ending on the dominant so it can always go on. */
const COUNT = [
  'D3h Bb3h', 'A3h. G#3q', 'A3q G3q F3q E3q', 'D3h. C#3q',
  'D3h F3q. E3e', 'Eb3h D3h', 'C#3h E3q G3q', 'Bb3h A3h',
];
const COUNT_HARMONY = 'Dm:2 Bb/D:2 | A/C# | Dm:2 A/E:2 | Dm:2 Bb:1 A7:1 | Dm:2 Bb:2 | Eb:2 Gm/D:2 | A7 | Bb:2 A7:2';

/** The Brides, 4 bars: neighbour-note coils around A. */
const BRIDES = ['A4h Bb4q A4q', 'G#4h. B4q', 'A4q F4q D5h', 'C#5h E4h'];
const BRIDES_HARMONY = 'Dm | E7/D | Bbmaj7 | A7';

/** Mina, 8 bars in F major, to the half close. */
const MINA = [
  'C5q F5q. G5e A5q', 'G5h E5h', 'F5q. E5e D5q A5q', 'F5h. D5q',
  'Bb5q. A5e G5q F5q', 'E5q F5q G5h', 'A5q. G5e F5q E5q', 'F5h E5h',
];
const MINA_HARMONY = 'F | C/E | Dm | Bb | Gm7 | C | Am:2 Dm:2 | C7sus4:2 C7:2';

/** Mina's theme in D major, after the Count is gone (7 bars, the last turning to A7). */
const MINA_D = [
  'A4q D5q. E5e F#5q', 'E5h C#5h', 'D5q. C#5e B4q F#5q', 'D5h. B4q',
  'G5q. F#5e E5q D5q', 'C#5q D5q E5h', 'A5h G5h',
];

/** Van Helsing's chorale (horn, top line). */
const HUNTERS = ['A4h Bb4h', 'C5h A4h', 'D5h Bb4h', 'A4w', 'A4h D5h', 'D5h E5h', 'C5h D5h', 'D5h C#5h'];
const HUNTERS_HARMONY = 'Dm:2 Gm:2 | C:2 F:2 | Bb:2 Gm:2 | A | Dm:2 Bb:2 | Gm:2 C:2 | F/A:2 Bb:2 | A7sus4:2 A7:2';

const bars = (lines: string[], from = 0, to = lines.length) => lines.slice(from, to).join(' | ');
const octave = (line: string, by: number) => line.replace(/([A-G](?:##|#|bb|b)?)(\d)/g, (_, n, o) => `${n}${Number(o) + by}`);

// ── Ranges (MIDI) ────────────────────────────────────────────────────────────────────────────

const R = {
  vn1Hi: { lo: 72, hi: 88 }, vn1: { lo: 69, hi: 81 }, vn2: { lo: 62, hi: 77 }, va: { lo: 53, hi: 69 },
  vcTenor: { lo: 45, hi: 57 }, vcBass: { lo: 36, hi: 55 }, cbWritten: { lo: 40, hi: 55 },
  bnBass: { lo: 34, hi: 53 }, bnTenor: { lo: 46, hi: 58 }, ob: { lo: 65, hi: 79 }, cl: { lo: 57, hi: 72 },
  flHi: { lo: 74, hi: 88 }, hn: { lo: 55, hi: 72 }, tbn: { lo: 45, hi: 62 }, tbnLo: { lo: 40, hi: 53 },
  hpBass: { lo: 38, hi: 52 }, pedal: { lo: 33, hi: 50 },
};
const ORGAN: VoiceRange[] = [{ lo: 64, hi: 76 }, { lo: 57, hi: 69 }, { lo: 50, hi: 62 }];
const CHOIR: VoiceRange[] = [{ lo: 67, hi: 79 }, { lo: 62, hi: 72 }, { lo: 55, hi: 67 }];
const CIMBALOM: VoiceRange[] = [{ lo: 64, hi: 74 }, { lo: 57, hi: 67 }];

export function buildDraculaOverture(): Score {
  const sb = new ScoreBuilder({
    id: 'dracula-overture',
    title: 'Dracula',
    subtitle: 'I. The Count — Overture · Score in C',
    composer: 'Plajah Chora Scoring, after Bram Stoker',
    bpm: 76,
    beatsPerBar: 4,
    beatUnit: 4,
    keyFifths: -1,
    keyMode: 'minor',
    keyChanges: [{ bar: 78, fifths: 2, mode: 'major' }],
    parts: PARTS,
  }, 88);

  // ── Harmonic plan ──────────────────────────────────────────────────────────────────────────
  sb.harmony(1, 'Dm | Dm | Bb/D | Dm | Eb/D | Dm | Gm/D | A7/C#');
  sb.harmony(9, `${COUNT_HARMONY} | ${COUNT_HARMONY}`);
  sb.harmony(25, `${BRIDES_HARMONY} | ${BRIDES_HARMONY}`);
  sb.harmony(33, `${MINA_HARMONY} | F | C/E | Dm | Bb:2 A7:2`);
  sb.harmony(45, `${COUNT_HARMONY} | Gm | Eb | C#°7 | A7b9`);
  sb.harmony(57, HUNTERS_HARMONY);
  sb.harmony(65, `${COUNT_HARMONY} | Bb | Gm | Eb | A7`);
  sb.harmony(77, 'Dm | D | A/C# | Bm | G | Em7 | A | A7');
  sb.harmony(85, 'D | Gm/D | D | D5');

  sb.section(1, 'Intro', 'Lento misterioso — The Borgo Pass')
    .section(9, 'A', 'The Count')
    .section(25, 'B', 'The Brides')
    .section(33, 'C', 'Whitby — Mina')
    .section(45, 'D', 'The Demeter')
    .section(57, 'E', 'Van Helsing')
    .section(65, 'F', 'The Pursuit')
    .section(77, 'G', 'Sunset')
    .section(85, 'H', 'Coda');

  // ── 1–8 The Borgo Pass ─────────────────────────────────────────────────────────────────────
  bassLine(sb, 'cb', R.cbWritten, 1, 8, { dynamic: 'pp', words: 'sul tasto' });
  bassLine(sb, 'orgP', R.pedal, 1, 8, { dynamic: 'ppp' });
  sustainVoices(sb, ['vc'], [R.vcTenor], 1, 8, { dynamic: 'pp', artics: ['tremolo'] });
  chordPad(sb, 'cim', CIMBALOM, 3, 8, { dynamic: 'pp', artics: ['tremolo'] });
  sb.write('hn', 3, '!pp "lontano" D4h Bb4h | A4w');
  sb.write('cl', 5, '!pp D5h Eb5h | D5w');
  sb.write('fl', 7, '!pp rh G5h | A5w');
  sustainVoices(sb, ['va'], [R.va], 5, 8, { dynamic: 'pp', artics: ['tremolo'] });
  sustainVoices(sb, ['vn2'], [R.vn2], 7, 8, { dynamic: 'pp', artics: ['tremolo'] });

  // ── 9–24 The Count ─────────────────────────────────────────────────────────────────────────
  sb.write('vc', 9, `!mp "pesante" ${bars(COUNT)}`);
  sb.write('bn', 9, `!mp ${bars(COUNT)}`);
  sb.write('tbn', 9, `!mp ${bars(COUNT)}`);
  bassLine(sb, 'cb', R.cbWritten, 9, 16, { dynamic: 'mp' });
  bassLine(sb, 'orgP', R.pedal, 9, 24, { dynamic: 'p', toDynamic: 'mf' });
  sustainVoices(sb, ['vn1', 'vn2', 'va'], [R.vn1, R.vn2, R.va], 9, 16, { dynamic: 'pp', toDynamic: 'p', artics: ['tremolo'] });
  // a fifth higher in feeling: the octave above, horn and violas leading
  sb.write('hn', 17, `!f ${octave(bars(COUNT), 1)}`);
  sb.write('va', 17, `!f ${octave(bars(COUNT), 1)}`);
  sb.write('cl', 17, `!mf ${octave(bars(COUNT), 1)}`);
  chordPad(sb, 'tbn', [R.tbn, R.tbnLo], 17, 24, { dynamic: 'mf' });
  bassLine(sb, 'vc', R.vcBass, 17, 24, { dynamic: 'f' });
  bassLine(sb, 'cb', R.cbWritten, 17, 24, { dynamic: 'f' });
  bassLine(sb, 'bn', R.bnBass, 17, 24, { dynamic: 'mf' });
  sustainVoices(sb, ['vn1', 'vn2'], [R.vn1Hi, { lo: 65, hi: 79 }], 17, 24, { dynamic: 'mf', artics: ['tremolo'] });
  chordPad(sb, 'orgM', ORGAN, 17, 24, { dynamic: 'mf' });
  chordPad(sb, 'cim', CIMBALOM, 17, 24, { dynamic: 'mf', artics: ['tremolo'] });
  sustainVoices(sb, ['fl', 'ob'], [R.flHi, R.ob], 21, 24, { dynamic: 'mf' });
  chordPad(sb, 'ch', CHOIR, 21, 24, { dynamic: 'mp', toDynamic: 'f' });

  // ── 25–32 The Brides ───────────────────────────────────────────────────────────────────────
  sb.write('ob', 25, `!p "seducente" ${bars(BRIDES)}`);
  sb.write('fl', 29, `!p ${octave(bars(BRIDES), 1)}`);
  sb.write('cl', 29, `!p ${bars(BRIDES)}`);
  chordPad(sb, 'ch', CHOIR, 25, 32, { dynamic: 'pp' });
  sustainVoices(sb, ['vn1', 'vn2'], [{ lo: 76, hi: 88 }, { lo: 69, hi: 81 }], 25, 32, { dynamic: 'pp', artics: ['tremolo'], words: 'sul pont.' });
  brokenChord(sb, 'hpR', 62, 25, 32, { shape: 'rising', dynamic: 'pp' });
  bassLine(sb, 'hpL', R.hpBass, 25, 32, { pattern: 'beat1', dynamic: 'pp' });
  bassLine(sb, 'cb', R.cbWritten, 25, 32, { pattern: 'beat1', artics: ['pizz'], dynamic: 'pp', words: 'pizz.' });
  bassLine(sb, 'orgP', R.pedal, 25, 32, { dynamic: 'pp' });

  // ── 33–44 Whitby — Mina ────────────────────────────────────────────────────────────────────
  sb.write('vn1', 33, `!mp "dolce,_con_calore" ${bars(MINA)}`);
  sb.write('fl', 41, '!mp C5q F5q. G5e A5q | G5h E5h | F5q. E5e D5q A5q | F5h E5h');
  sb.write('cl', 41, '!p C4q F4q. G4e A4q | G4h E4h | F4q. E4e D4q A4q | F4h E4h');
  sustainVoices(sb, ['vn2', 'va'], [R.vn2, R.va], 33, 40, { dynamic: 'p' });
  sustainVoices(sb, ['vn1', 'vn2', 'va'], [R.vn1, R.vn2, R.va], 41, 44, { dynamic: 'p' });
  bassLine(sb, 'vc', R.vcBass, 33, 44, { dynamic: 'p', words: 'arco' });
  bassLine(sb, 'cb', R.cbWritten, 33, 44, { dynamic: 'p', words: 'arco' });
  brokenChord(sb, 'hpR', 62, 33, 44, { shape: 'rising', dynamic: 'mp' });
  bassLine(sb, 'hpL', R.hpBass, 33, 44, { pattern: 'beat1', dynamic: 'mp' });
  sustainVoices(sb, ['ob', 'bn'], [R.ob, R.bnTenor], 37, 40, { dynamic: 'pp' });
  sustainVoices(sb, ['hn'], [R.hn], 43, 44, { dynamic: 'p', toDynamic: 'mf' });

  // ── 45–56 The Demeter: storm ───────────────────────────────────────────────────────────────
  sb.write('tbn', 45, `!f "marcato" ${bars(COUNT)}`);
  sb.write('hn', 45, `!f ${octave(bars(COUNT), 1)}`);
  bassLine(sb, 'vc', R.vcBass, 45, 56, { pattern: 'pulse8', dynamic: 'f', words: 'agitato' });
  bassLine(sb, 'cb', R.cbWritten, 45, 56, { pattern: 'pulse8', dynamic: 'f' });
  bassLine(sb, 'bn', R.bnBass, 45, 56, { dynamic: 'f' });
  bassLine(sb, 'orgP', R.pedal, 45, 56, { dynamic: 'f' });
  pulseChords(sb, 'vn2', [R.vn2], 45, 56, { step: 0.5, dynamic: 'f', toDynamic: 'ff', words: 'agitato' });
  pulseChords(sb, 'va', [R.va], 45, 56, { step: 0.5, dynamic: 'f', toDynamic: 'ff' });
  sustainVoices(sb, ['vn1'], [R.vn1Hi], 45, 52, { dynamic: 'f', artics: ['tremolo'] });
  sb.write('vn1', 53, '!ff D5q F5q A5q D6q | Eb6h Bb5h | C#6q E6q G6q Bb6q | A6w>');
  sb.write('fl', 53, '!ff D5q F5q A5q D6q | Eb6h Bb5h | C#6q E6q G6q Bb6q | A6w>');
  sb.write('ob', 53, '!ff D4q F4q A4q D5q | Eb5h Bb4h | C#5q E5q G5q Bb5q | A5w>');
  sb.write('cl', 53, '!ff D4q F4q A4q D5q | Eb5h Bb4h | C#5q E5q G5q Bb5q | A5w>');
  sustainVoices(sb, ['ob', 'cl'], [R.ob, R.cl], 45, 52, { dynamic: 'mf' });
  chordPad(sb, 'cim', CIMBALOM, 45, 56, { dynamic: 'f', artics: ['tremolo'] });
  chordPad(sb, 'orgM', ORGAN, 45, 56, { dynamic: 'f' });
  chordPad(sb, 'ch', CHOIR, 49, 56, { dynamic: 'f', toDynamic: 'ff' });
  brokenChord(sb, 'hpR', 62, 53, 56, { shape: 'rising', dynamic: 'ff' });
  bassLine(sb, 'hpL', R.hpBass, 53, 56, { pattern: 'beat1', dynamic: 'ff' });

  // ── 57–64 Van Helsing ──────────────────────────────────────────────────────────────────────
  sb.write('hn', 57, `!mf "risoluto" ${bars(HUNTERS)}`);
  sustainVoices(sb, ['tbn', 'bn'], [{ lo: 50, hi: 62 }, R.bnBass], 57, 64, { dynamic: 'mf' });
  chordPad(sb, 'orgM', ORGAN, 57, 64, { dynamic: 'p' });
  bassLine(sb, 'orgP', R.pedal, 57, 64, { dynamic: 'p' });
  sustainVoices(sb, ['vn1', 'vn2', 'va'], [R.vn1, R.vn2, R.va], 57, 64, { dynamic: 'p' });
  bassLine(sb, 'vc', R.vcBass, 57, 64, { dynamic: 'p' });
  bassLine(sb, 'cb', R.cbWritten, 57, 64, { dynamic: 'p' });

  // ── 65–76 The Pursuit ──────────────────────────────────────────────────────────────────────
  sb.write('vn1', 65, '!f "con_fuoco" A4q D5q. E5e F5q | E5w | D5h C#5h | D5h D5q C#5q | A5q D6q. E6e F6q | G6h Bb5h | A5h C#6h | D6h C#6h');
  sb.write('vn1', 73, '!ff D6q F6q Bb6h | Bb6q A6q G6h | G6q Eb6q Bb5h | A5w>');
  sb.double('vn1', 'fl', 69, 76);
  sb.double('vn1', 'ob', 69, 76, -1);
  sb.double('vn1', 'cl', 69, 76, -1, 0.9);
  brokenChord(sb, 'vn2', 62, 65, 76, { shape: 'rising', step: 0.25, pattern: [0, 2, 1, 2, 3, 2, 1, 2], dynamic: 'f' });
  brokenChord(sb, 'va', 55, 65, 76, { shape: 'rising', step: 0.25, pattern: [0, 1, 2, 1], dynamic: 'f' });
  brokenChord(sb, 'cim', 62, 65, 76, { shape: 'rising', step: 0.25, pattern: [3, 2, 1, 0, 1, 2, 3, 2], dynamic: 'mf', toDynamic: 'ff' });
  sb.write('vc', 65, `!ff "marcato" ${bars(COUNT)}`);
  sb.write('tbn', 65, `!ff ${bars(COUNT)}`);
  sb.write('bn', 65, `!f ${bars(COUNT)}`);
  sb.write('hn', 69, `!ff ${octave(bars(COUNT, 4, 8), 1)}`);
  bassLine(sb, 'cb', R.cbWritten, 65, 76, { dynamic: 'ff' });
  bassLine(sb, 'orgP', R.pedal, 65, 76, { dynamic: 'f' });
  bassLine(sb, 'vc', R.vcBass, 73, 76, { pattern: 'pulse8', dynamic: 'ff' });
  bassLine(sb, 'tbn', R.tbnLo, 73, 76, { dynamic: 'ff' });
  bassLine(sb, 'bn', R.bnBass, 73, 76, { dynamic: 'ff' });
  sustainVoices(sb, ['hn'], [{ lo: 62, hi: 74 }], 73, 76, { dynamic: 'ff' });
  chordPad(sb, 'ch', CHOIR, 73, 76, { dynamic: 'ff' });
  chordPad(sb, 'orgM', ORGAN, 73, 76, { dynamic: 'ff' });
  brokenChord(sb, 'hpR', 62, 73, 76, { shape: 'rising', dynamic: 'ff' });
  bassLine(sb, 'hpL', R.hpBass, 73, 76, { pattern: 'beat1', dynamic: 'ff' });

  // ── 77–84 Sunset ───────────────────────────────────────────────────────────────────────────
  // one last blow on D minor, then nothing
  const upper = ['fl', 'ob', 'cl', 'hn', 'tbn', 'vn1', 'vn2', 'va'];
  const voiced = new VoiceLeader([R.flHi, R.ob, R.cl, R.hn, R.tbn, R.vn1Hi, R.vn2, R.va]).voice(sb.segments(77)[0].chord);
  const name = (i: number) => {
    const p = voiced[i];
    return `${p.step}${p.alter === 1 ? '#' : p.alter === -1 ? 'b' : ''}${p.octave}`;
  };
  upper.forEach((id, i) => sb.write(id, 77, `!fff ${name(i)}q> rq rh`));
  ['bn', 'vc'].forEach((id) => sb.write(id, 77, '!fff [D2 D3]q> rq rh'));
  sb.write('cb', 77, '!fff D3q> rq rh');
  sb.write('orgP', 77, '!fff D2q> rq rh');
  sb.write('orgM', 77, '!fff [D4 F4 A4 D5]q> rq rh');
  sb.write('ch', 77, '!fff [A4 D5 F5]q> rq rh');
  sb.write('cim', 77, '!fff [D4 A4 D5]q> rq rh');
  sb.write('hpR', 77, '!fff [D4 F4 A4 D5]q> rq rh');
  sb.write('hpL', 77, '!fff [D2 A2 D3]q> rq rh');
  if (pitchMidi(voiced[0]) < 60) throw new Error('flute voiced too low at the sunset stab');
  // "a look of peace": Mina's theme in D major
  sb.write('vn1', 78, `!p "con_pace" ${bars(MINA_D)}`);
  sb.double('vn1', 'fl', 81, 84, 1, 0.8);
  chordPad(sb, 'ch', CHOIR, 78, 84, { dynamic: 'pp', toDynamic: 'mp' });
  sustainVoices(sb, ['vn2', 'va'], [R.vn2, R.va], 78, 84, { dynamic: 'pp' });
  bassLine(sb, 'vc', R.vcBass, 78, 84, { dynamic: 'pp' });
  bassLine(sb, 'cb', R.cbWritten, 78, 84, { dynamic: 'pp' });
  brokenChord(sb, 'hpR', 62, 78, 84, { shape: 'rising', dynamic: 'p' });
  bassLine(sb, 'hpL', R.hpBass, 78, 84, { pattern: 'beat1', dynamic: 'p' });
  sustainVoices(sb, ['hn'], [R.hn], 81, 84, { dynamic: 'pp' });

  // ── 85–88 Coda ─────────────────────────────────────────────────────────────────────────────
  sb.write('vn1', 85, '!pp F#5w | G5h D5h | F#5w | rm');
  chordPad(sb, 'ch', CHOIR, 85, 87, { dynamic: 'ppp' });
  sustainVoices(sb, ['vn2', 'va'], [R.vn2, R.va], 85, 87, { dynamic: 'ppp' });
  bassLine(sb, 'vc', R.vcBass, 85, 88, { dynamic: 'pp' });
  bassLine(sb, 'cb', R.cbWritten, 85, 88, { dynamic: 'pp' });
  bassLine(sb, 'orgP', R.pedal, 85, 88, { dynamic: 'ppp' });
  brokenChord(sb, 'hpR', 62, 85, 87, { shape: 'rising', dynamic: 'pp' });
  // the Count's interval, once more, over D major
  sb.write('hn', 87, '!pp "lontano" D4h Bb4h | A4w');
  sb.write('cim', 88, '!ppp [D4 A4]w*');

  return sb.score;
}
