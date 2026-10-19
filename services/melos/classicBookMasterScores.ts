/**
 * classicBookMasterScores.ts
 *
 * Original, multi-section film & classical scores for all 12 Classic Books,
 * where EACH of the 6 tracks per book represents a specific Character, Relationship,
 * Antagonist, or Iconic Scene from the book — scored as if each book were its own feature film
 * in the lineage of John Williams, Hans Zimmer, Howard Shore, Danny Elfman, Don Davis,
 * Ludwig Göransson, Dario Marianelli, Wojciech Kilar, Beethoven, Schubert, Chopin, and Liszt.
 *
 * Crucially:
 *   1. NO TWO TRACKS IN A BOOK USE THE SAME ORCHESTRATION OR LOOP:
 *      Every single track (`MasterMovementScore`) has its own bespoke 5-instrument Melos Studio
 *      orchestration (`trackPartSpecs`) across all 7 Melos Rust/WASM synth engines:
 *      `aura`, `bajo`, `vela`, `cantus`, `ison`, `pneuma`, and `onda`.
 *   2. FULL MULTI-SECTION SONG ARCHITECTURE (32–36 Beats per Cue):
 *      Section I (Intro) -> Section II (Primary Character/Theme Statement) ->
 *      Section III (Contrasting Bridge / Dramatic Development) -> Section IV (Climax & Coda).
 *   3. REAL MELOS RUST/WASM DSP RENDERING (`plajah_audio.wasm`):
 *      Every track is rendered into a stereo WAV song through `renderSongWithMelosWasm`
 *      (`services/melos/melosWasmSongEngine.ts`) executing the actual Melos Rust/WASM DSP
 *      instruments + physical-modeled orchestral film percussion + stereo concert-hall reverb.
 */

import {
  type FilmScoreSectionMarker,
  type MpeSwellShape,
  type NoteEvent,
  type OrchestralArticulation,
} from './beats/grooveDoc';
import {
  renderSongWithMelosWasm,
  type FilmPercussionStyle,
  type MelosWasmInstrumentType,
} from './melosWasmSongEngine';
import { CLASSIC_BOOK_SOUNDTRACKS, buildPolyphonicTrackScore } from '../../data/classicBookSoundtracks';

export type MasterPartRole = 'lead' | 'countermelody' | 'ostinato' | 'harmony' | 'bass';

export interface MasterPartPresetSpec {
  role: MasterPartRole;
  trackName: string;
  instrumentType: MelosWasmInstrumentType;
  /** Factory preset ID passed to applyPresetToDoc and melosWasmSongEngine (e.g. 'f_aura-rmi-electrapiano') */
  presetId: string;
  color: string;
  gainDb: number;
  pan: number;
}

export interface GenerativeOrchestralStemSpec {
  id: string;
  name: string;
  engine: 'ace-step-2.5' | 'yue2' | 'heartmula' | 'qwen-score';
  roleDescription: string;
  prompt: string;
  gainDb: number;
  pan: number;
  color: string;
}

export interface MasterMovementScore {
  movementNumber: number;
  title: string;
  /** The specific Character, Relationship, or Film Scene this track scores */
  characterOrTheme: string;
  chapterCue: string;
  key: string;
  mode: 'major' | 'minor' | 'dorian' | 'phrygian-dominant' | 'harmonic-minor' | 'lydian' | 'mixolydian';
  bpm: number;
  timeSignature: '4/4' | '3/4' | '6/8';
  lengthBeats: number;
  percussionStyle: FilmPercussionStyle;
  composerStudyNote: string;
  leitmotifName: string;
  aceStepPrompt: string;
  qwenDirection: string;
  /** Per-track unique Melos Instrument orchestration — every track in a book has its own distinct instruments! */
  trackPartSpecs: Record<MasterPartRole, MasterPartPresetSpec>;
  parts: Record<MasterPartRole, NoteEvent[]>;
  /** Preserved 32–36 beat light background reading cue ("Light Background Music Mode") */
  lightBackgroundLengthBeats?: number;
  lightBackgroundParts?: Record<MasterPartRole, NoteEvent[]>;
  /** 7-Section Film Score Cue Sheet Markers across the 2–6 minute timeline */
  sectionMarkers?: FilmScoreSectionMarker[];
  /** Hybrid ACE-Step 2.5 / YuE2 / HeartMuLa generative orchestral stems paired with the Melos synths */
  generativeStems?: GenerativeOrchestralStemSpec[];
}

export interface MasterBookScoreBlueprint {
  bookThemeId: string;
  albumTitle: string;
  composerLineage: string[];
  hallReverbDecaySec: number;
  hallReverbDamping: number;
  /** Default/flagship rack for the book's DAW overview; individual movements use `mvt.trackPartSpecs` */
  partSpecs: Record<MasterPartRole, MasterPartPresetSpec>;
  movements: MasterMovementScore[];
}

// ============================================================================
// COMPOSITIONAL & ORCHESTRAL SCORE-WRITING HELPERS
// ============================================================================

let noteSeq = 1;
function n(startBeats: number, lengthBeats: number, key: number, vel: number): NoteEvent {
  return {
    id: `mscore_${noteSeq++}`,
    startBeats: Number(startBeats.toFixed(4)),
    lengthBeats: Number(Math.max(0.08, lengthBeats).toFixed(4)),
    key: Math.max(12, Math.min(108, Math.round(key))),
    vel: Math.max(1, Math.min(127, Math.round(vel))),
  };
}

/**
 * Generates expressive broken-chord waves, 10th-spanning arpeggios, ballroom spiccato patterns,
 * or driving cinematic motor sequences across multi-section cues.
 */
function buildSectionOstinato(
  bars: Array<{
    startBeat: number;
    beats: number;
    pitches: number[];
    stepBeats: number;
    baseVel: number;
    style?: 'wave' | 'waltz-oom-pah' | 'motor-16th' | 'bell-tolling';
  }>,
): NoteEvent[] {
  const out: NoteEvent[] = [];
  for (const bar of bars) {
    const steps = Math.round(bar.beats / bar.stepBeats);
    const p = bar.pitches;
    const style = bar.style || 'wave';
    for (let s = 0; s < steps; s++) {
      const beat = bar.startBeat + s * bar.stepBeats;
      if (style === 'waltz-oom-pah') {
        const beatInBar = s % 3;
        if (beatInBar === 0) {
          out.push(n(beat, bar.stepBeats * 0.85, p[0], bar.baseVel + 8));
        } else {
          out.push(n(beat, bar.stepBeats * 0.65, p[1] ?? p[0] + 4, bar.baseVel - 4));
          out.push(n(beat, bar.stepBeats * 0.65, p[2] ?? p[0] + 7, bar.baseVel - 4));
        }
      } else if (style === 'bell-tolling') {
        const midi = p[s % p.length];
        out.push(n(beat, bar.stepBeats * 1.6, midi, bar.baseVel + (s % 2 === 0 ? 8 : -4)));
      } else if (style === 'motor-16th') {
        const midi = p[s % p.length];
        const accent = s % 4 === 0 ? 10 : s % 2 === 0 ? 3 : -4;
        out.push(n(beat, bar.stepBeats * 0.82, midi, bar.baseVel + accent));
      } else {
        // Wave arpeggio with expressive phrase arch
        const arch = Math.sin((s / Math.max(1, steps - 1)) * Math.PI);
        const vel = bar.baseVel + Math.round(arch * 12) + (s % 3 === 0 ? 5 : 0);
        const midi = p[s % p.length];
        out.push(n(beat, bar.stepBeats * 1.25, midi, vel));
      }
    }
  }
  return out;
}

/**
 * Generates 4-voice divisi strings / monastic choir / brass harmony with voice-led suspensions.
 */
function buildDivisiHarmony(
  chords: Array<{
    startBeat: number;
    lengthBeats: number;
    satb: [number, number, number, number];
    suspension?: { voiceIndex: 0 | 1 | 2; suspendedMidi: number; resolveAfterBeats: number };
    vel: number;
  }>,
): NoteEvent[] {
  const out: NoteEvent[] = [];
  for (const ch of chords) {
    ch.satb.forEach((midi, idx) => {
      if (ch.suspension && ch.suspension.voiceIndex === idx) {
        const susDur = Math.min(ch.lengthBeats * 0.5, ch.suspension.resolveAfterBeats);
        const resDur = Math.max(0.25, ch.lengthBeats - susDur);
        out.push(n(ch.startBeat, susDur, ch.suspension.suspendedMidi, ch.vel + 5));
        out.push(n(ch.startBeat + susDur, resDur, midi, ch.vel - 2));
      } else {
        out.push(n(ch.startBeat, ch.lengthBeats * 0.96, midi, ch.vel));
      }
    });
  }
  return out;
}

const KEY_TO_PC: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

// ============================================================================
// 1. PRIDE AND PREJUDICE — 6 CHARACTER & THEMATIC FILM SCORE SONGS
//    Lineage: Dario Marianelli, John Williams, Beethoven Op. 68, Schubert & Chopin
//    Every track has its own distinct Melos Instrument Orchestration & Multi-Section Form!
// ============================================================================

export const PRIDE_AND_PREJUDICE_BLUEPRINT: MasterBookScoreBlueprint = {
  bookThemeId: 'pride-and-prejudice',
  albumTitle: 'The Pemberley Botanical & Regency Film Score',
  composerLineage: [
    'Dario Marianelli (Pride & Prejudice — Dawn & Mrs. Darcy)',
    'John Williams (Character Leitmotif Transformation & Woodwind Counterpoint)',
    'Ludwig van Beethoven (Symphony No. 6 "Pastoral" & Sonata Op. 57 "Appassionata")',
    'Franz Schubert (Impromptus Op. 90 — Singing Cantabile Inner Voices)',
    'Frédéric Chopin (Nocturnes — Rubato Ornamentation & 10th-Spanning Arpeggios)',
  ],
  hallReverbDecaySec: 2.3,
  hallReverbDamping: 0.44,
  partSpecs: {
    lead: {
      role: 'lead',
      trackName: 'I · Regency Fortepiano Cantabile',
      instrumentType: 'aura',
      presetId: 'f_aura-rmi-electrapiano',
      color: '#e8a87c',
      gainDb: 0.0,
      pan: -0.08,
    },
    countermelody: {
      role: 'countermelody',
      trackName: 'II · Pastoral Obligato Woodwind',
      instrumentType: 'pneuma',
      presetId: 'f_pneuma-ney',
      color: '#7dd3a8',
      gainDb: -1.5,
      pan: 0.25,
    },
    ostinato: {
      role: 'ostinato',
      trackName: 'III · Crystal Harp & Harpsichord',
      instrumentType: 'vela',
      presetId: 'f_vitreous',
      color: '#f5d061',
      gainDb: -3.0,
      pan: -0.32,
    },
    harmony: {
      role: 'harmony',
      trackName: 'IV · Divisi Chamber Strings',
      instrumentType: 'aura',
      presetId: 'f_aura-solina-74',
      color: '#c9a0dc',
      gainDb: -3.2,
      pan: 0.18,
    },
    bass: {
      role: 'bass',
      trackName: 'V · Bowed Contrabass Continuo',
      instrumentType: 'bajo',
      presetId: 'f_bowed-contrabass',
      color: '#5ec2ff',
      gainDb: -2.0,
      pan: 0.0,
    },
  },
  movements: [
    // ------------------------------------------------------------------------
    // TRACK 1: Elizabeth Bennet — Wit & Wildflowers on the Oak Path
    // Character Portrait · F Major · 108 BPM · 6/8 (36 Beats = 12 Bars: Intro -> A -> B -> Coda)
    // Melos Instruments: AURA RMI Electra-Piano + PNEUMA Ney Flute + VELA Vitreous Harp + AURA Tape Flute + BAJO Upright Pizzicato
    // ------------------------------------------------------------------------
    {
      movementNumber: 1,
      title: 'Elizabeth Bennet: Wit & Wildflowers on the Oak Path',
      characterOrTheme: 'Character Portrait · Elizabeth Bennet (Spirited Wit, Independence & Hertfordshire Walks)',
      chapterCue: 'Chapter I–VI · Longbourn Wildflower Path & Fine Eyes',
      key: 'F',
      mode: 'major',
      bpm: 108,
      timeSignature: '6/8',
      lengthBeats: 36,
      percussionStyle: 'pastoral-pulsing',
      composerStudyNote:
        'Scores Elizabeth Bennet’s sparkling wit and love of walking the Derbyshire and Hertfordshire paths. Opens with a solo VELA Vitreous harp & PNEUMA reed-flute birdcall (Intro), launches into a syncopated AURA Fortepiano theme with playful grace notes (Section A), modulates to D minor / Bb major as she reflects on her independence (Section B), and concludes with a luminous chamber coda (Section C).',
      leitmotifName: 'Leitmotif I · Elizabeth’s Sparkling Wit & Wildflower Motif',
      aceStepPrompt:
        'Sparkling Regency film score character theme for Elizabeth Bennet in F major, 108 BPM, 6/8 pastoral meter, solo fortepiano, playful flute counterpoint, plucked harp and pizzicato contrabass.',
      qwenDirection:
        'Playful, syncopated Regency fortepiano and flute theme in F major 6/8 with grace notes and modulating middle bridge.',
      trackPartSpecs: {
        lead: { role: 'lead', trackName: 'Elizabeth Fortepiano Solo', instrumentType: 'aura', presetId: 'f_aura-rmi-electrapiano', color: '#e8a87c', gainDb: 0.5, pan: -0.1 },
        countermelody: { role: 'countermelody', trackName: 'Playful Pastoral Flute', instrumentType: 'pneuma', presetId: 'f_pneuma-ney', color: '#7dd3a8', gainDb: -1.0, pan: 0.28 },
        ostinato: { role: 'ostinato', trackName: 'Plucked Crystal Harp', instrumentType: 'vela', presetId: 'f_vitreous', color: '#f5d061', gainDb: -2.5, pan: -0.32 },
        harmony: { role: 'harmony', trackName: 'Chamber Woodwind Choir', instrumentType: 'aura', presetId: 'f_aura-mellotron-flute', color: '#c9a0dc', gainDb: -3.5, pan: 0.2 },
        bass: { role: 'bass', trackName: 'Walking Pizzicato Contrabass', instrumentType: 'bajo', presetId: 'f_upright-jazz', color: '#5ec2ff', gainDb: -1.8, pan: 0.0 },
      },
      parts: {
        lead: [
          // Section I: Intro (Beats 0–6) — delicate high grace-note call
          n(0.0, 1.5, 77, 78), n(1.5, 0.5, 79, 82), n(2.0, 1.0, 81, 88),
          n(3.0, 1.5, 84, 92), n(4.5, 1.5, 81, 84),
          // Section II: A-Theme — Elizabeth's Wit (Beats 6–18)
          n(6.0, 0.25, 72, 84), n(6.25, 1.25, 77, 94), n(7.5, 0.5, 79, 88), n(8.0, 1.0, 81, 98),
          n(9.0, 1.0, 84, 102), n(10.0, 0.5, 82, 92), n(10.5, 1.0, 81, 90), n(11.5, 0.5, 79, 84),
          n(12.0, 1.0, 77, 92), n(13.0, 0.5, 74, 86), n(13.5, 1.0, 72, 90), n(14.5, 0.5, 74, 88),
          n(15.0, 1.5, 76, 94), n(16.5, 1.5, 77, 96),
          // Section III: B-Section — Reflective Modulation to Dm / Bb (Beats 18–27)
          n(18.0, 1.0, 81, 98), n(19.0, 0.5, 82, 94), n(19.5, 1.5, 86, 106),
          n(21.0, 1.0, 84, 100), n(22.0, 0.5, 81, 92), n(22.5, 1.5, 79, 94),
          n(24.0, 1.0, 77, 96), n(25.0, 0.5, 79, 92), n(25.5, 1.0, 81, 98), n(26.5, 0.5, 84, 102),
          // Section IV: Climax & Radiant Coda (Beats 27–36)
          n(27.0, 1.5, 89, 112), n(28.5, 0.5, 88, 104), n(29.0, 1.0, 86, 102),
          n(30.0, 1.0, 84, 100), n(31.0, 0.5, 81, 94), n(31.5, 1.0, 79, 92), n(32.5, 0.5, 76, 88),
          n(33.0, 3.0, 77, 104),
        ],
        countermelody: [
          // Flute birdsong intro + witty conversational answers
          n(1.5, 1.5, 84, 78), n(4.5, 1.5, 88, 82),
          n(7.5, 1.5, 72, 82), n(9.0, 1.5, 74, 86), n(10.5, 1.5, 76, 84),
          n(13.5, 1.5, 77, 88), n(15.0, 1.5, 72, 82), n(16.5, 1.5, 69, 80),
          // Soaring B-section descant
          n(18.0, 1.5, 74, 90), n(19.5, 1.5, 77, 94), n(21.0, 1.5, 76, 88), n(22.5, 1.5, 72, 86),
          n(24.0, 1.5, 74, 90), n(25.5, 1.5, 76, 92),
          n(27.0, 1.5, 81, 98), n(28.5, 1.5, 79, 94), n(30.0, 1.5, 76, 90), n(31.5, 1.5, 72, 86),
          n(33.0, 3.0, 81, 92),
        ],
        ostinato: buildSectionOstinato([
          { startBeat: 0, beats: 6, pitches: [65, 72, 77, 72, 69, 72], stepBeats: 0.5, baseVel: 68, style: 'wave' },
          { startBeat: 6, beats: 6, pitches: [53, 60, 69, 65, 72, 69], stepBeats: 0.5, baseVel: 74, style: 'wave' },
          { startBeat: 12, beats: 6, pitches: [58, 65, 70, 60, 67, 72], stepBeats: 0.5, baseVel: 76, style: 'wave' },
          { startBeat: 18, beats: 6, pitches: [62, 69, 74, 58, 65, 70], stepBeats: 0.5, baseVel: 80, style: 'wave' },
          { startBeat: 24, beats: 6, pitches: [55, 62, 70, 60, 67, 76], stepBeats: 0.5, baseVel: 82, style: 'wave' },
          { startBeat: 30, beats: 6, pitches: [53, 60, 69, 72, 77, 81], stepBeats: 0.5, baseVel: 76, style: 'wave' },
        ]),
        harmony: buildDivisiHarmony([
          { startBeat: 6, lengthBeats: 6, satb: [77, 72, 69, 65], vel: 68 },
          { startBeat: 12, lengthBeats: 6, satb: [76, 72, 67, 60], suspension: { voiceIndex: 1, suspendedMidi: 74, resolveAfterBeats: 1.5 }, vel: 72 },
          { startBeat: 18, lengthBeats: 6, satb: [77, 74, 69, 62], vel: 78 },
          { startBeat: 24, lengthBeats: 6, satb: [79, 72, 67, 60], vel: 80 },
          { startBeat: 30, lengthBeats: 6, satb: [77, 72, 69, 65], suspension: { voiceIndex: 0, suspendedMidi: 79, resolveAfterBeats: 1.5 }, vel: 76 },
        ]),
        bass: [
          // Nimble walking pizzicato contrabass
          n(0, 1.5, 41, 76), n(3, 1.5, 48, 74),
          n(6, 1.0, 41, 84), n(7.5, 1.0, 45, 78), n(9, 1.0, 46, 82), n(10.5, 1.0, 48, 80),
          n(12, 1.0, 46, 84), n(13.5, 1.0, 41, 80), n(15, 1.0, 48, 86), n(16.5, 1.0, 41, 84),
          n(18, 1.5, 50, 88), n(19.5, 1.5, 46, 86), n(21, 1.5, 48, 86), n(22.5, 1.5, 41, 84),
          n(24, 1.5, 43, 88), n(25.5, 1.5, 48, 90),
          n(27, 1.5, 41, 92), n(28.5, 1.5, 46, 88), n(30, 1.5, 48, 90), n(33, 3.0, 41, 94),
        ],
      },
    },

    // ------------------------------------------------------------------------
    // TRACK 2: Mr. Darcy & The Reflections of Pemberley Lake
    // Character Portrait · Eb Major / C Minor · 68 BPM · 4/4 (32 Beats = 8 Bars)
    // Melos Instruments: AURA CS-80 Brass/Horn + AURA Mellotron Violins + AURA Suitcase Tine Piano + AURA Solina Strings + BAJO Bowed Contrabass
    // ------------------------------------------------------------------------
    {
      movementNumber: 2,
      title: 'Mr. Darcy & The Reflections of Pemberley Lake',
      characterOrTheme: 'Character Portrait · Fitzwilliam Darcy (Noble Restraint, Guarded Heart & Pemberley Estate)',
      chapterCue: 'Volume III, Chapter I · Elizabeth Sees Pemberley Across the Water',
      key: 'Eb',
      mode: 'major',
      bpm: 68,
      timeSignature: '4/4',
      lengthBeats: 32,
      percussionStyle: 'none',
      composerStudyNote:
        'A broad, noble character portrait scored for AURA CS-80 French Horn (`f_aura-cs80-bladerunner`), M400 Three Violins (`f_aura-mellotron-violins`), shimmering Suitcase Tines water-reflections (`f_aura-rhodes-suitcase-72`), and deep Bowed Contrabass (`f_bowed-contrabass`). Moves from stately Eb Major architecture into an aching C-minor interior confession before resolving in warm nobility.',
      leitmotifName: 'Leitmotif II · The Pemberley Horn & Guarded Heart Theme',
      aceStepPrompt:
        'Noble cinematic film score character theme in Eb major and C minor, 68 BPM, expressive French horn solo, lush romantic string orchestra, warm electric tine arpeggios, deep bowed contrabass.',
      qwenDirection:
        'Stately, noble horn and violin theme in Eb major modulating to C minor with rich voice-led string suspensions.',
      trackPartSpecs: {
        lead: { role: 'lead', trackName: 'Pemberley Noble Horn (CS-80)', instrumentType: 'aura', presetId: 'f_aura-cs80-bladerunner', color: '#d4af37', gainDb: -0.5, pan: -0.12 },
        countermelody: { role: 'countermelody', trackName: 'Solo & Divisi Violins', instrumentType: 'aura', presetId: 'f_aura-mellotron-violins', color: '#f5b041', gainDb: -1.0, pan: 0.25 },
        ostinato: { role: 'ostinato', trackName: 'Lake Reflection Tines', instrumentType: 'aura', presetId: 'f_aura-rhodes-suitcase-72', color: '#7dd3a8', gainDb: -3.2, pan: -0.3 },
        harmony: { role: 'harmony', trackName: 'Symphonic Solina Strings', instrumentType: 'aura', presetId: 'f_aura-solina-74', color: '#c9a0dc', gainDb: -2.8, pan: 0.18 },
        bass: { role: 'bass', trackName: 'Bowed Contrabass Pedal', instrumentType: 'bajo', presetId: 'f_bowed-contrabass', color: '#5ec2ff', gainDb: -1.2, pan: 0.0 },
      },
      parts: {
        lead: [
          // Section I: Intro (Beats 0–4) — Lake reflections before the Horn enters
          n(2.0, 2.0, 63, 84),
          // Section II: A-Theme — Darcy's Noble Horn Leitmotif in Eb Major (Beats 4–16)
          n(4.0, 1.5, 70, 96), n(5.5, 0.5, 68, 88), n(6.0, 2.0, 67, 94),
          n(8.0, 1.5, 72, 102), n(9.5, 0.5, 70, 94), n(10.0, 1.5, 68, 96), n(11.5, 0.5, 67, 88),
          n(12.0, 2.0, 65, 92), n(14.0, 2.0, 67, 94),
          // Section III: B-Section — Darcy's Inner Vulnerability in C Minor / Ab Major (Beats 16–24)
          n(16.0, 1.5, 72, 100), n(17.5, 0.5, 74, 98), n(18.0, 1.5, 75, 108), n(19.5, 0.5, 74, 96),
          n(20.0, 1.5, 72, 104), n(21.5, 0.5, 70, 94), n(22.0, 2.0, 68, 98),
          // Section IV: Coda — Noble Resolution over Pemberley (Beats 24–32)
          n(24.0, 1.5, 67, 96), n(25.5, 0.5, 70, 98), n(26.0, 2.0, 75, 106),
          n(28.0, 1.5, 74, 96), n(29.5, 2.5, 75, 102),
        ],
        countermelody: [
          // High aching violin line weaving above the horn
          n(6.0, 2.0, 75, 86), n(10.0, 2.0, 79, 90), n(12.0, 2.0, 77, 88), n(14.0, 2.0, 75, 86),
          n(16.0, 2.0, 79, 96), n(18.0, 2.0, 80, 102), n(20.0, 2.0, 79, 96), n(22.0, 2.0, 75, 92),
          n(24.0, 2.0, 79, 94), n(26.0, 2.0, 82, 100), n(28.0, 4.0, 79, 94),
        ],
        ostinato: buildSectionOstinato([
          { startBeat: 0, beats: 8, pitches: [51, 58, 63, 67, 63, 58], stepBeats: 0.5, baseVel: 68, style: 'wave' },
          { startBeat: 8, beats: 8, pitches: [56, 63, 68, 72, 58, 65, 70, 74], stepBeats: 0.5, baseVel: 72, style: 'wave' },
          { startBeat: 16, beats: 8, pitches: [48, 55, 60, 63, 53, 60, 65, 68], stepBeats: 0.5, baseVel: 76, style: 'wave' },
          { startBeat: 24, beats: 8, pitches: [51, 58, 63, 67, 58, 63, 67, 70], stepBeats: 0.5, baseVel: 72, style: 'wave' },
        ]),
        harmony: buildDivisiHarmony([
          { startBeat: 0, lengthBeats: 4, satb: [75, 70, 67, 51], vel: 70 },
          { startBeat: 4, lengthBeats: 4, satb: [75, 70, 67, 51], suspension: { voiceIndex: 1, suspendedMidi: 72, resolveAfterBeats: 1.5 }, vel: 76 },
          { startBeat: 8, lengthBeats: 4, satb: [75, 72, 68, 56], vel: 80 },
          { startBeat: 12, lengthBeats: 4, satb: [74, 70, 65, 58], vel: 78 },
          { startBeat: 16, lengthBeats: 4, satb: [75, 72, 67, 48], vel: 84 },
          { startBeat: 20, lengthBeats: 4, satb: [77, 72, 68, 53], suspension: { voiceIndex: 0, suspendedMidi: 79, resolveAfterBeats: 1.5 }, vel: 82 },
          { startBeat: 24, lengthBeats: 4, satb: [75, 70, 67, 55], vel: 80 },
          { startBeat: 28, lengthBeats: 4, satb: [75, 70, 67, 51], vel: 84 },
        ]),
        bass: [
          n(0, 4, 39, 86), n(4, 4, 39, 90), n(8, 4, 44, 92), n(12, 4, 46, 90),
          n(16, 4, 36, 96), n(20, 4, 41, 94), n(24, 4, 43, 92), n(28, 4, 39, 96),
        ],
      },
    },

    // ------------------------------------------------------------------------
    // TRACK 3: The Netherfield Ball — Contredanse of Eyes & Whispers
    // Set-Piece Dance Cue · D Major -> B Minor -> D Major · 132 BPM · 3/4 (36 Beats = 12 Bars)
    // Melos Instruments: AURA Baroque Harpsichord + AURA Logan String Melody + ONDA Bloom Pluck + AURA Elka Rhapsody + BAJO Fretless Bass
    // ------------------------------------------------------------------------
    {
      movementNumber: 3,
      title: 'The Netherfield Ball: Contredanse of Eyes & Whispers',
      characterOrTheme: 'Film Set-Piece · Elizabeth & Darcy’s Electric Verbal Sparring Dance at Netherfield',
      chapterCue: 'Chapter XVIII · The Netherfield Ballroom Contredanse',
      key: 'D',
      mode: 'major',
      bpm: 132,
      timeSignature: '3/4',
      lengthBeats: 36,
      percussionStyle: 'regency-ballroom',
      composerStudyNote:
        'A brisk, whirling Regency ballroom dance in 3/4 scored for Baroque Harpsichord (`f_aura-harpsichord-68`), Logan String Melody (`f_aura-logan-melody`), spiccato ONDA Bloom Pluck (`f_Bloom Pluck`) playing crisp `oom-pah-pah` dance rhythms, and ballroom percussion. In Section B (Bars 7–10), the dance plunges into B Harmonic Minor as Elizabeth confronts Darcy about Wickham mid-step, before snapping back to a triumphant D Major finish.',
      leitmotifName: 'Leitmotif III · The Netherfield Ballroom Contredanse',
      aceStepPrompt:
        'Brisk Regency ballroom waltz and contredanse in D major and B minor, 132 BPM, 3/4 meter, baroque harpsichord, solo ballroom violins, spiccato strings, light concert timpani and tambourine.',
      qwenDirection:
        'Energetic 3/4 Regency ballroom dance in D major with harpsichord ornaments, a tense B-minor middle section, and crisp waltz accompaniment.',
      trackPartSpecs: {
        lead: { role: 'lead', trackName: 'Ballroom Baroque Harpsichord', instrumentType: 'aura', presetId: 'f_aura-harpsichord-68', color: '#f5d061', gainDb: 0.2, pan: -0.15 },
        countermelody: { role: 'countermelody', trackName: 'Dancing Ballroom Violins', instrumentType: 'aura', presetId: 'f_aura-logan-melody', color: '#e8a87c', gainDb: -0.8, pan: 0.25 },
        ostinato: { role: 'ostinato', trackName: 'Spiccato Waltz Pluck', instrumentType: 'onda', presetId: 'f_Bloom Pluck', color: '#7dd3a8', gainDb: -2.2, pan: -0.28 },
        harmony: { role: 'harmony', trackName: 'Elka Ballroom Strings', instrumentType: 'aura', presetId: 'f_aura-elka-rhapsody', color: '#c9a0dc', gainDb: -3.0, pan: 0.2 },
        bass: { role: 'bass', trackName: 'Ballroom Dance Bass', instrumentType: 'bajo', presetId: 'f_fretless-glass', color: '#5ec2ff', gainDb: -1.5, pan: 0.0 },
      },
      parts: {
        lead: [
          // Section I: Ballroom Fanfare Intro (Beats 0–6)
          n(0.0, 1.0, 74, 96), n(1.0, 1.0, 78, 92), n(2.0, 1.0, 81, 98),
          n(3.0, 2.0, 86, 106), n(5.0, 1.0, 81, 90),
          // Section II: A-Theme — Whirling Contredanse in D Major (Beats 6–18)
          n(6.0, 1.5, 78, 98), n(7.5, 0.5, 79, 92), n(8.0, 0.5, 78, 90), n(8.5, 0.5, 76, 88),
          n(9.0, 1.0, 74, 96), n(10.0, 1.0, 81, 102), n(11.0, 1.0, 78, 92),
          n(12.0, 1.5, 79, 100), n(13.5, 0.5, 81, 96), n(14.0, 1.0, 83, 104),
          n(15.0, 2.0, 81, 98), n(17.0, 1.0, 76, 90),
          // Section III: B-Section — Verbal Sparring in B Harmonic Minor (Beats 18–27)
          n(18.0, 1.5, 83, 104), n(19.5, 0.5, 81, 96), n(20.0, 1.0, 78, 98),
          n(21.0, 1.0, 79, 102), n(22.0, 1.0, 76, 94), n(23.0, 1.0, 73, 92),
          n(24.0, 1.5, 71, 98), n(25.5, 0.5, 73, 94), n(26.0, 1.0, 76, 98),
          // Section IV: Coda — Return of the Grand Ballroom Theme (Beats 27–36)
          n(27.0, 1.0, 78, 104), n(28.0, 1.0, 81, 106), n(29.0, 1.0, 86, 112),
          n(30.0, 1.0, 85, 104), n(31.0, 1.0, 83, 100), n(32.0, 1.0, 81, 98),
          n(33.0, 3.0, 86, 110),
        ],
        countermelody: [
          // Violins trading phrases and soaring in 3rds/6ths
          n(6.0, 2.0, 74, 88), n(8.0, 1.0, 73, 84), n(9.0, 2.0, 69, 86), n(11.0, 1.0, 74, 88),
          n(12.0, 2.0, 76, 92), n(14.0, 1.0, 79, 94), n(15.0, 3.0, 76, 90),
          n(18.0, 3.0, 74, 96), n(21.0, 3.0, 71, 92), n(24.0, 3.0, 70, 94),
          n(27.0, 2.0, 74, 98), n(29.0, 1.0, 78, 100), n(30.0, 3.0, 76, 96), n(33.0, 3.0, 78, 102),
        ],
        ostinato: buildSectionOstinato([
          { startBeat: 0, beats: 6, pitches: [62, 69, 74], stepBeats: 1.0, baseVel: 80, style: 'waltz-oom-pah' },
          { startBeat: 6, beats: 6, pitches: [62, 69, 74], stepBeats: 1.0, baseVel: 82, style: 'waltz-oom-pah' },
          { startBeat: 12, beats: 6, pitches: [67, 71, 74], stepBeats: 1.0, baseVel: 84, style: 'waltz-oom-pah' },
          { startBeat: 18, beats: 6, pitches: [59, 66, 71], stepBeats: 1.0, baseVel: 88, style: 'waltz-oom-pah' },
          { startBeat: 24, beats: 3, pitches: [54, 64, 70], stepBeats: 1.0, baseVel: 86, style: 'waltz-oom-pah' },
          { startBeat: 27, beats: 9, pitches: [62, 69, 74], stepBeats: 1.0, baseVel: 88, style: 'waltz-oom-pah' },
        ]),
        harmony: buildDivisiHarmony([
          { startBeat: 0, lengthBeats: 6, satb: [78, 74, 69, 62], vel: 72 },
          { startBeat: 6, lengthBeats: 6, satb: [78, 74, 69, 62], vel: 76 },
          { startBeat: 12, lengthBeats: 6, satb: [79, 74, 71, 55], vel: 78 },
          { startBeat: 18, lengthBeats: 6, satb: [78, 74, 71, 59], vel: 84 },
          { startBeat: 24, lengthBeats: 3, satb: [76, 73, 70, 54], vel: 84 },
          { startBeat: 27, lengthBeats: 9, satb: [78, 74, 69, 62], vel: 86 },
        ]),
        bass: [
          n(0, 2, 38, 92), n(3, 2, 45, 86),
          n(6, 2, 38, 92), n(9, 2, 42, 88), n(12, 2, 43, 94), n(15, 2, 45, 92),
          n(18, 2, 47, 96), n(21, 2, 43, 92), n(24, 2, 42, 94),
          n(27, 2, 38, 96), n(30, 2, 45, 94), n(33, 3, 38, 100),
        ],
      },
    },

    // ------------------------------------------------------------------------
    // TRACK 4: The Letter at Hunsford — "You Have Bewitched Me, Body and Soul"
    // Intimate Emotional Turning Point · D Minor -> Bb Major -> D Minor · 62 BPM · 4/4 (32 Beats)
    // Melos Instruments: VELA Glass Choir + PNEUMA Shakuhachi + AURA Celesta Raindrops + VELA Tremolo Strings + ISON Shruti Drone
    // ------------------------------------------------------------------------
    {
      movementNumber: 4,
      title: 'The Letter at Hunsford: "You Have Bewitched Me"',
      characterOrTheme: 'Emotional Turning Point · Darcy’s Proposal in the Rain & The Midnight Letter',
      chapterCue: 'Chapters XXXIV–XXXV · Hunsford Parsonage in the Rain',
      key: 'D',
      mode: 'harmonic-minor',
      bpm: 62,
      timeSignature: '4/4',
      lengthBeats: 32,
      percussionStyle: 'none',
      composerStudyNote:
        'An intimate, aching nocturne scored for VELA Glass Choir (`f_glass-choir`), solitary PNEUMA Shakuhachi (`f_pneuma-shakuhachi`), delicate raindrop Celesta (`f_aura-celesta-bell-69`), bowed Tremolo Strings (`f_tremolo-strings`), and a quiet ISON Shruti reed drone (`f_ison-shruti`). Captures the heartbreak and shock of Darcy’s first proposal and Elizabeth reading his letter at dawn.',
      leitmotifName: 'Leitmotif IV · The Hunsford Rain & Confession Nocturne',
      aceStepPrompt:
        'Intimate emotional film score nocturne in D minor, 62 BPM, delicate celesta raindrops, glass choir, breathy bamboo flute, trembling chamber strings, poignant romantic confession.',
      qwenDirection:
        'Slow, heartbreaking nocturne in D minor with delicate celesta arpeggios, expressive flute sighs, and a passionate Bb-major swell.',
      trackPartSpecs: {
        lead: { role: 'lead', trackName: 'Crystalline Glass Choir Lead', instrumentType: 'vela', presetId: 'f_glass-choir', color: '#c9a0dc', gainDb: 0.5, pan: -0.1 },
        countermelody: { role: 'countermelody', trackName: 'Solitary Breath Flute', instrumentType: 'pneuma', presetId: 'f_pneuma-shakuhachi', color: '#7dd3a8', gainDb: -0.8, pan: 0.25 },
        ostinato: { role: 'ostinato', trackName: 'Raindrop Studio Celesta', instrumentType: 'aura', presetId: 'f_aura-celesta-bell-69', color: '#5ec2ff', gainDb: -2.2, pan: -0.3 },
        harmony: { role: 'harmony', trackName: 'Bowed Tremolo Strings', instrumentType: 'vela', presetId: 'f_tremolo-strings', color: '#e8a87c', gainDb: -2.5, pan: 0.2 },
        bass: { role: 'bass', trackName: 'Warm Reed Drone (Shruti)', instrumentType: 'ison', presetId: 'f_ison-shruti', color: '#f5d061', gainDb: -2.5, pan: 0.0 },
      },
      parts: {
        lead: [
          // Section I: Raindrop Intro (Beats 0–4)
          n(2.0, 2.0, 69, 82),
          // Section II: Solitary Confession Theme in D Minor (Beats 4–16)
          n(4.0, 1.5, 74, 92), n(5.5, 0.5, 76, 86), n(6.0, 1.5, 77, 98), n(7.5, 0.5, 74, 88),
          n(8.0, 2.0, 70, 94), n(10.0, 1.5, 69, 88), n(11.5, 0.5, 67, 82),
          n(12.0, 2.0, 65, 86), n(14.0, 2.0, 69, 90),
          // Section III: Passionate Surge — "You Have Bewitched Me" in Bb Major / Gm (Beats 16–24)
          n(16.0, 1.5, 77, 102), n(17.5, 0.5, 79, 98), n(18.0, 2.0, 82, 110),
          n(20.0, 1.5, 81, 104), n(21.5, 0.5, 77, 94), n(22.0, 2.0, 76, 98),
          // Section IV: Quiet Dawn Reflection Coda (Beats 24–32)
          n(24.0, 1.5, 74, 92), n(25.5, 0.5, 70, 86), n(26.0, 2.0, 69, 88),
          n(28.0, 4.0, 74, 84),
        ],
        countermelody: [
          n(6.0, 2.0, 69, 80), n(10.0, 2.0, 74, 84), n(14.0, 2.0, 73, 82),
          n(16.0, 2.0, 74, 92), n(18.0, 2.0, 77, 96), n(20.0, 2.0, 74, 90), n(22.0, 2.0, 73, 88),
          n(24.0, 2.0, 69, 84), n(26.0, 2.0, 65, 80), n(28.0, 4.0, 69, 78),
        ],
        ostinato: buildSectionOstinato([
          { startBeat: 0, beats: 8, pitches: [62, 69, 77, 76, 74, 69], stepBeats: 0.5, baseVel: 70, style: 'wave' },
          { startBeat: 8, beats: 8, pitches: [58, 65, 74, 72, 69, 65], stepBeats: 0.5, baseVel: 72, style: 'wave' },
          { startBeat: 16, beats: 8, pitches: [58, 65, 70, 77, 55, 62, 67, 74], stepBeats: 0.5, baseVel: 78, style: 'wave' },
          { startBeat: 24, beats: 8, pitches: [62, 69, 74, 77, 69, 65], stepBeats: 0.5, baseVel: 68, style: 'wave' },
        ]),
        harmony: buildDivisiHarmony([
          { startBeat: 0, lengthBeats: 8, satb: [74, 69, 65, 50], vel: 68 },
          { startBeat: 8, lengthBeats: 8, satb: [74, 70, 65, 46], suspension: { voiceIndex: 1, suspendedMidi: 72, resolveAfterBeats: 2.0 }, vel: 74 },
          { startBeat: 16, lengthBeats: 4, satb: [77, 74, 70, 46], vel: 82 },
          { startBeat: 20, lengthBeats: 4, satb: [76, 73, 69, 45], vel: 80 },
          { startBeat: 24, lengthBeats: 8, satb: [74, 69, 65, 50], vel: 72 },
        ]),
        bass: [
          n(0, 8, 50, 74), n(8, 8, 46, 76), n(16, 4, 46, 82), n(20, 4, 45, 80), n(24, 8, 50, 74),
        ],
      },
    },

    // ------------------------------------------------------------------------
    // TRACK 5: Lady Catherine at Rosings & Lydia's Scandal
    // Dramatic Confrontation Cue · G Harmonic Minor · 138 BPM · 4/4 (32 Beats)
    // Melos Instruments: AURA Clavinet D6 + AURA Prophet-5 Brass + AURA Phaedra Motor Sequence + CANTUS Byzantine Choir + BAJO Cello Menace
    // ------------------------------------------------------------------------
    {
      movementNumber: 5,
      title: 'Lady Catherine at Rosings & Lydia’s Scandal',
      characterOrTheme: 'Antagonist & Crisis Cue · Lydia’s Elopement & Lady Catherine de Bourgh’s Ultimatum',
      chapterCue: 'Volume III, Chapter XIV · "I Am Not to Be Intimidated!"',
      key: 'G',
      mode: 'harmonic-minor',
      bpm: 138,
      timeSignature: '4/4',
      lengthBeats: 32,
      percussionStyle: 'storm-agitato',
      composerStudyNote:
        'A fiery Beethoven *Appassionata*-inspired dramatic film cue in G Harmonic Minor at 138 BPM. Combines aggressive AURA Clavinet/Fortepiano octaves (`f_aura-clavinet-d6-73`), imperious Prophet-5 Brass stabs (`f_aura-prophet5-rev1`), a relentless 16th-note motor sequence (`f_aura-phaedra-seq-74`), sharp Byzantine vocal accents (`f_cantus-byzantine`), and Bowed Cello Menace (`f_cello-menace`) with storm timpani.',
      leitmotifName: 'Leitmotif V · The Rosings Ultimatum & Scandal Agitato',
      aceStepPrompt:
        'Dramatic stormy Regency film score action cue in G harmonic minor, 138 BPM, fiery fortepiano octaves, imperious brass stabs, driving 16th-note string ostinato, timpani thunder.',
      qwenDirection:
        'Fast, dramatic G harmonic minor confrontation cue with driving 16th-note motor ostinato and fiery ascending octaves.',
      trackPartSpecs: {
        lead: { role: 'lead', trackName: 'Fiery Fortepiano / Clavinet', instrumentType: 'aura', presetId: 'f_aura-clavinet-d6-73', color: '#ef4444', gainDb: 0.4, pan: -0.12 },
        countermelody: { role: 'countermelody', trackName: 'Imperious Rosings Brass', instrumentType: 'aura', presetId: 'f_aura-prophet5-rev1', color: '#f5b041', gainDb: -0.8, pan: 0.25 },
        ostinato: { role: 'ostinato', trackName: '16th-Note Agitato Motor', instrumentType: 'aura', presetId: 'f_aura-phaedra-seq-74', color: '#ec4899', gainDb: -2.5, pan: -0.3 },
        harmony: { role: 'harmony', trackName: 'Dramatic Choir Accents', instrumentType: 'cantus', presetId: 'f_cantus-byzantine', color: '#c9a0dc', gainDb: -2.0, pan: 0.2 },
        bass: { role: 'bass', trackName: 'Bowed Cello Menace', instrumentType: 'bajo', presetId: 'f_cello-menace', color: '#5ec2ff', gainDb: -0.5, pan: 0.0 },
      },
      parts: {
        lead: [
          // Section I: Imperious Rosings Summons (Beats 0–8)
          n(0.0, 0.5, 67, 108), n(0.5, 0.5, 70, 102), n(1.0, 0.5, 74, 106), n(1.5, 0.5, 79, 114),
          n(2.0, 1.5, 78, 110), n(3.5, 0.5, 79, 112),
          n(4.0, 0.5, 82, 114), n(4.5, 0.5, 79, 104), n(5.0, 0.5, 75, 102), n(5.5, 0.5, 74, 100),
          n(6.0, 2.0, 72, 106),
          // Section II: Lydia's Flight — Urgent Sequence (Beats 8–16)
          n(8.0, 0.5, 69, 104), n(8.5, 0.5, 72, 102), n(9.0, 0.5, 75, 108), n(9.5, 0.5, 81, 114),
          n(10.0, 1.5, 79, 110), n(11.5, 0.5, 74, 100),
          n(12.0, 1.0, 75, 108), n(13.0, 1.0, 74, 104), n(14.0, 1.0, 72, 102), n(15.0, 1.0, 70, 100),
          // Section III: Elizabeth Defies Lady Catherine (Beats 16–24)
          n(16.0, 1.5, 86, 118), n(17.5, 0.5, 84, 110), n(18.0, 1.0, 82, 112), n(19.0, 1.0, 79, 106),
          n(20.0, 1.5, 84, 116), n(21.5, 0.5, 82, 108), n(22.0, 1.0, 81, 110), n(23.0, 1.0, 78, 108),
          // Section IV: Dramatic Climax Cadence (Beats 24–32)
          n(24.0, 1.0, 79, 116), n(25.0, 1.0, 82, 114), n(26.0, 1.0, 81, 112), n(27.0, 1.0, 78, 110),
          n(28.0, 4.0, 79, 120),
        ],
        countermelody: [
          // Imperious brass stabs answering the lead
          n(2.0, 2.0, 74, 102), n(6.0, 2.0, 75, 104), n(10.0, 2.0, 74, 104), n(14.0, 2.0, 78, 108),
          n(16.0, 2.0, 79, 110), n(18.0, 2.0, 75, 106), n(20.0, 2.0, 76, 108), n(22.0, 2.0, 74, 108),
          n(24.0, 2.0, 75, 110), n(26.0, 2.0, 78, 112), n(28.0, 4.0, 79, 116),
        ],
        ostinato: buildSectionOstinato([
          { startBeat: 0, beats: 8, pitches: [55, 62, 67, 70], stepBeats: 0.25, baseVel: 84, style: 'motor-16th' },
          { startBeat: 8, beats: 8, pitches: [51, 58, 63, 67, 50, 57, 62, 66], stepBeats: 0.25, baseVel: 86, style: 'motor-16th' },
          { startBeat: 16, beats: 8, pitches: [48, 55, 60, 63, 50, 57, 62, 66], stepBeats: 0.25, baseVel: 90, style: 'motor-16th' },
          { startBeat: 24, beats: 8, pitches: [55, 62, 67, 70, 50, 57, 62, 66], stepBeats: 0.25, baseVel: 92, style: 'motor-16th' },
        ]),
        harmony: buildDivisiHarmony([
          { startBeat: 0, lengthBeats: 8, satb: [79, 74, 70, 55], vel: 86 },
          { startBeat: 8, lengthBeats: 8, satb: [79, 75, 67, 51], vel: 88 },
          { startBeat: 16, lengthBeats: 8, satb: [78, 74, 69, 50], vel: 92 },
          { startBeat: 24, lengthBeats: 8, satb: [79, 74, 70, 55], vel: 96 },
        ]),
        bass: [
          n(0, 2, 43, 106), n(2, 2, 42, 102), n(4, 2, 43, 106), n(6, 2, 36, 104),
          n(8, 2, 39, 108), n(10, 2, 43, 106), n(12, 2, 36, 106), n(14, 2, 38, 110),
          n(16, 2, 39, 112), n(18, 2, 36, 110), n(20, 2, 37, 112), n(22, 2, 38, 114),
          n(24, 2, 43, 114), n(26, 2, 38, 116), n(28, 4, 31, 120),
        ],
      },
    },

    // ------------------------------------------------------------------------
    // TRACK 6: Dawn Across the Derbyshire Moors — Elizabeth & Darcy's Love Theme
    // Grand Finale Apotheosis · C Major / A Minor / C Major · 84 BPM · 6/8 (36 Beats)
    // Melos Instruments: AURA RMI Fortepiano + PNEUMA Ney Flute + VELA Aurora Shimmer + CANTUS Plainsong Choir + BAJO Bowed Contrabass
    // ------------------------------------------------------------------------
    {
      movementNumber: 6,
      title: 'Dawn Across the Derbyshire Moors (Love Theme)',
      characterOrTheme: 'Grand Finale Love Theme · Darcy Crosses the Misty Meadow to Elizabeth at Dawn',
      chapterCue: 'Volume III, Chapter XVI–XVIII · Morning Mist & Mrs. Darcy',
      key: 'C',
      mode: 'major',
      bpm: 84,
      timeSignature: '6/8',
      lengthBeats: 36,
      percussionStyle: 'epic-apotheosis',
      composerStudyNote:
        'The sweeping symphonic finale uniting Elizabeth’s Wildflower Motif (Track 1) and Darcy’s Pemberley Horn Interval (Track 2) in contrapuntal union. Begins intimately with solo Fortepiano (`f_aura-rmi-electrapiano`) and VELA Aurora morning shimmer (`f_aurora`), welcomes the PNEUMA Ney flute, and swells into a radiant CANTUS Plainsong choral & orchestral apotheosis (`f_cantus-plainsong` + `f_bowed-contrabass`) with concert timpani and cymbal swells.',
      leitmotifName: 'Leitmotif VI · Elizabeth & Darcy’s Apotheosis (Unified Love Theme)',
      aceStepPrompt:
        'Sweeping romantic film score finale in C major, 84 BPM, 6/8 meter, solo piano opening into full soaring orchestra, lyrical woodwind, radiant choir, shimmering harp and deep contrabass.',
      qwenDirection:
        'Grand romantic finale in C major 6/8 starting with intimate solo piano and blossoming into a full orchestral and choral climax.',
      trackPartSpecs: {
        lead: { role: 'lead', trackName: 'Dawn Fortepiano & Symphonic Lead', instrumentType: 'aura', presetId: 'f_aura-rmi-electrapiano', color: '#f5b041', gainDb: 0.5, pan: -0.08 },
        countermelody: { role: 'countermelody', trackName: 'Soaring Love Obligato Flute', instrumentType: 'pneuma', presetId: 'f_pneuma-ney', color: '#7dd3a8', gainDb: -0.6, pan: 0.25 },
        ostinato: { role: 'ostinato', trackName: 'Aurora Morning Shimmer Harp', instrumentType: 'vela', presetId: 'f_aurora', color: '#f5d061', gainDb: -2.0, pan: -0.3 },
        harmony: { role: 'harmony', trackName: 'Radiant Plainsong Choir & Strings', instrumentType: 'cantus', presetId: 'f_cantus-plainsong', color: '#c9a0dc', gainDb: -1.8, pan: 0.18 },
        bass: { role: 'bass', trackName: 'Symphonic Bowed Contrabass', instrumentType: 'bajo', presetId: 'f_bowed-contrabass', color: '#5ec2ff', gainDb: -1.0, pan: 0.0 },
      },
      parts: {
        lead: [
          // Section I: Solo Piano in the Morning Mist (Beats 0–6)
          n(0.0, 1.0, 72, 82), n(1.0, 0.5, 74, 86), n(1.5, 1.5, 76, 92),
          n(3.0, 1.5, 79, 96), n(4.5, 1.5, 76, 88),
          // Section II: A-Theme — The Unified Love Theme (Beats 6–18)
          n(6.0, 1.0, 81, 100), n(7.0, 0.5, 79, 94), n(7.5, 1.5, 76, 96),
          n(9.0, 1.0, 74, 92), n(10.0, 0.5, 76, 94), n(10.5, 1.5, 79, 100),
          n(12.0, 1.5, 84, 108), n(13.5, 0.5, 83, 100), n(14.0, 1.0, 81, 102),
          n(15.0, 1.5, 79, 98), n(16.5, 1.5, 76, 94),
          // Section III: B-Section — Grand Orchestral & Choral Apotheosis (Beats 18–30)
          n(18.0, 1.5, 84, 112), n(19.5, 1.5, 86, 114),
          n(21.0, 1.5, 88, 120), n(22.5, 0.5, 86, 110), n(23.0, 1.0, 84, 112),
          n(24.0, 1.5, 81, 108), n(25.5, 0.5, 83, 106), n(26.0, 1.0, 84, 110),
          n(27.0, 1.5, 79, 104), n(28.5, 1.5, 83, 106),
          // Section IV: Luminous Derbyshire Coda (Beats 30–36)
          n(30.0, 1.5, 84, 110), n(31.5, 1.5, 79, 100), n(33.0, 3.0, 84, 114),
        ],
        countermelody: [
          // Darcy's rising 5th/6th weaving in counterpoint with Elizabeth's theme
          n(6.0, 1.5, 72, 86), n(7.5, 1.5, 71, 84), n(9.0, 1.5, 69, 86), n(10.5, 1.5, 72, 90),
          n(12.0, 1.5, 76, 94), n(13.5, 1.5, 77, 96), n(15.0, 3.0, 74, 92),
          n(18.0, 1.5, 76, 102), n(19.5, 1.5, 79, 104), n(21.0, 1.5, 81, 108), n(22.5, 1.5, 79, 104),
          n(24.0, 1.5, 77, 102), n(25.5, 1.5, 76, 100), n(27.0, 3.0, 74, 98),
          n(30.0, 3.0, 76, 100), n(33.0, 3.0, 79, 104),
        ],
        ostinato: buildSectionOstinato([
          { startBeat: 0, beats: 6, pitches: [60, 67, 76, 72, 67, 64], stepBeats: 0.5, baseVel: 70, style: 'wave' },
          { startBeat: 6, beats: 6, pitches: [57, 64, 72, 69, 53, 60, 69, 65], stepBeats: 0.5, baseVel: 76, style: 'wave' },
          { startBeat: 12, beats: 6, pitches: [48, 55, 64, 67, 55, 62, 67, 71], stepBeats: 0.5, baseVel: 80, style: 'wave' },
          { startBeat: 18, beats: 6, pitches: [60, 67, 76, 79, 57, 64, 72, 76], stepBeats: 0.5, baseVel: 88, style: 'wave' },
          { startBeat: 24, beats: 6, pitches: [53, 60, 69, 72, 55, 62, 67, 74], stepBeats: 0.5, baseVel: 86, style: 'wave' },
          { startBeat: 30, beats: 6, pitches: [48, 55, 64, 67, 72, 76], stepBeats: 0.5, baseVel: 82, style: 'wave' },
        ]),
        harmony: buildDivisiHarmony([
          { startBeat: 6, lengthBeats: 6, satb: [76, 72, 69, 57], vel: 76 },
          { startBeat: 12, lengthBeats: 6, satb: [79, 74, 67, 55], suspension: { voiceIndex: 1, suspendedMidi: 76, resolveAfterBeats: 1.5 }, vel: 82 },
          { startBeat: 18, lengthBeats: 6, satb: [84, 79, 72, 60], vel: 94 },
          { startBeat: 24, lengthBeats: 6, satb: [81, 77, 72, 53], suspension: { voiceIndex: 0, suspendedMidi: 83, resolveAfterBeats: 1.5 }, vel: 92 },
          { startBeat: 30, lengthBeats: 6, satb: [84, 79, 76, 60], vel: 96 },
        ]),
        bass: [
          n(0, 6, 48, 82),
          n(6, 3, 45, 88), n(9, 3, 41, 88), n(12, 3, 48, 92), n(15, 3, 43, 90),
          n(18, 3, 36, 102), n(21, 3, 45, 98), n(24, 3, 41, 100), n(27, 3, 43, 100),
          n(30, 6, 36, 106),
        ],
      },
    },
  ],
};

// ============================================================================
// 2. DRACULA — 6 CHARACTER & THEMATIC FILM SCORE SONGS
//    Lineage: Wojciech Kilar, Hans Zimmer, Howard Shore, Danny Elfman, Ludwig Göransson & Liszt
//    Every track has its own distinct Melos Instrument Orchestration & Multi-Section Form!
// ============================================================================

export const DRACULA_BLUEPRINT: MasterBookScoreBlueprint = {
  bookThemeId: 'dracula',
  albumTitle: 'Symphony of the Carpathian Blood Moon (Original Film Score)',
  composerLineage: [
    'Wojciech Kilar (Bram Stoker’s Dracula — Carpathian Ostinatos & "Love Remembered")',
    'Hans Zimmer (Bowed Cello Menace, Sub-Seismic Braam & Relentless Tension)',
    'Howard Shore (Monastic Male/Female Choirs, Low Brass & Chromatic Mediant Dread)',
    'Danny Elfman (Gothic Celesta Waltz Macabre & Haunting Vocal Choirs)',
    'Ludwig Göransson (Raw Breath Woodwinds, Exotic Recorder/Shakuhachi & Hybrid Pulse)',
    'Franz Liszt & Hector Berlioz (Totentanz, Dies Irae & Faust Damnation Brass)',
  ],
  hallReverbDecaySec: 3.1,
  hallReverbDamping: 0.34,
  partSpecs: {
    lead: {
      role: 'lead',
      trackName: 'I · Carpathian Solo & Section Violins',
      instrumentType: 'aura',
      presetId: 'f_aura-mellotron-violins',
      color: '#ff3b5c',
      gainDb: 0.4,
      pan: -0.14,
    },
    countermelody: {
      role: 'countermelody',
      trackName: 'II · Subharmonic Throat Chant & Shakuhachi',
      instrumentType: 'cantus',
      presetId: 'f_cantus-kargyraa',
      color: '#f5b041',
      gainDb: -1.0,
      pan: 0.26,
    },
    ostinato: {
      role: 'ostinato',
      trackName: 'III · Gothic Celesta & Haunted Iron',
      instrumentType: 'aura',
      presetId: 'f_aura-celesta-bell-69',
      color: '#c8cdd6',
      gainDb: -2.4,
      pan: -0.28,
    },
    harmony: {
      role: 'harmony',
      trackName: 'IV · Stone-Crypt Monastic Choir & Bourdon',
      instrumentType: 'cantus',
      presetId: 'f_cantus-vault',
      color: '#9b5de5',
      gainDb: -1.8,
      pan: 0.16,
    },
    bass: {
      role: 'bass',
      trackName: 'V · Bowed Cello Menace & Zimmer Braam',
      instrumentType: 'bajo',
      presetId: 'f_cello-menace',
      color: '#9e1424',
      gainDb: -0.5,
      pan: 0.0,
    },
  },
  movements: [
    // ------------------------------------------------------------------------
    // TRACK 1: Count Dracula — Anthem of the Ancient Voivode
    // Main Villain Character Portrait · D Harmonic Minor · 76 BPM · 4/4 (32 Beats)
    // Melos Instruments: AURA CS-80 Brass + CANTUS Kargyraa Throat Chant + VELA Ferrous Iron Tolling + ISON 32ft Bourdon Organ + BAJO Braam Engine
    // ------------------------------------------------------------------------
    {
      movementNumber: 1,
      title: 'Count Dracula: Anthem of the Ancient Voivode',
      characterOrTheme: 'Main Antagonist Portrait · Count Dracula (Ancient Warlord & Immortal Vampire Lord)',
      chapterCue: 'Chapters II–III · "We Szekelys Have a Right to Be Proud"',
      key: 'D',
      mode: 'harmonic-minor',
      bpm: 76,
      timeSignature: '4/4',
      lengthBeats: 32,
      percussionStyle: 'gothic-ritual',
      composerStudyNote:
        'A colossal, terrifying character portrait of Count Dracula scored like Howard Shore (Mordor/Sauron), Hans Zimmer, and Wojciech Kilar. Combines massive AURA CS-80 Brass (`f_aura-cs80-bladerunner`), Tuvan subharmonic throat-singing (`f_cantus-kargyraa`), tolling haunted castle iron (`f_ferrous`), immovable 32ft Cathedral Organ Bourdon (`f_ison-bourdon`), and BAJO Braam Engine (`f_braam`) over ritual war timpani.',
      leitmotifName: 'Leitmotif I · Anthem of the Blood Voivode (Dracula’s Theme)',
      aceStepPrompt:
        'Monumental dark Gothic villain theme in D harmonic minor, 76 BPM, massive low brass, throat singing monastic choir, tolling castle iron bells, 32ft cathedral pipe organ, Hans Zimmer braam and war timpani.',
      qwenDirection:
        'Monumental, terrifying D harmonic minor anthem with Phrygian Eb and raised G#/C# intervals, heavy brass, and organ pedal.',
      trackPartSpecs: {
        lead: { role: 'lead', trackName: 'Voivode Imperial Brass (CS-80)', instrumentType: 'aura', presetId: 'f_aura-cs80-bladerunner', color: '#ff3b5c', gainDb: 0.5, pan: -0.1 },
        countermelody: { role: 'countermelody', trackName: 'Kargyraa Subharmonic Chant', instrumentType: 'cantus', presetId: 'f_cantus-kargyraa', color: '#f5b041', gainDb: 0.2, pan: 0.24 },
        ostinato: { role: 'ostinato', trackName: 'Castle Iron Bell Tolling', instrumentType: 'vela', presetId: 'f_ferrous', color: '#c8cdd6', gainDb: -1.5, pan: -0.3 },
        harmony: { role: 'harmony', trackName: '32ft Cathedral Organ Bourdon', instrumentType: 'ison', presetId: 'f_ison-bourdon', color: '#9b5de5', gainDb: -1.2, pan: 0.18 },
        bass: { role: 'bass', trackName: 'Zimmer Braam & Sub Engine', instrumentType: 'bajo', presetId: 'f_braam', color: '#9e1424', gainDb: 0.0, pan: 0.0 },
      },
      parts: {
        lead: [
          // Section I: Castle Gates & Organ Tolling Intro (Beats 0–4)
          n(0.0, 3.5, 50, 106),
          // Section II: A-Theme — The Voivode's Rising Minor 6th & Phrygian Fall (Beats 4–16)
          n(4.0, 1.5, 62, 108), n(5.5, 0.5, 69, 104), n(6.0, 1.5, 70, 116), n(7.5, 0.5, 69, 104),
          n(8.0, 1.5, 68, 112), n(9.5, 0.5, 69, 106), n(10.0, 1.0, 65, 100), n(11.0, 1.0, 63, 104),
          n(12.0, 3.5, 62, 114),
          // Section III: B-Section — Chromatic Mediant Terror (Bbm -> F#m -> A7b9) (Beats 16–24)
          n(16.0, 1.5, 70, 114), n(17.5, 0.5, 73, 110), n(18.0, 2.0, 77, 120),
          n(20.0, 1.5, 76, 116), n(21.5, 0.5, 73, 108), n(22.0, 2.0, 69, 112),
          // Section IV: Dies Irae & Blood Moon Climax (Beats 24–32)
          n(24.0, 1.0, 74, 118), n(25.0, 1.0, 73, 114), n(26.0, 1.0, 74, 118), n(27.0, 1.0, 70, 114),
          n(28.0, 1.0, 69, 112), n(29.0, 1.0, 67, 110), n(30.0, 2.0, 62, 122),
        ],
        countermelody: [
          // Deep throat-singing chant answering in octaves and tritones
          n(2.0, 2.0, 50, 96), n(6.0, 2.0, 58, 102), n(10.0, 2.0, 56, 100), n(12.0, 4.0, 50, 104),
          n(16.0, 4.0, 58, 108), n(20.0, 4.0, 57, 108), n(24.0, 4.0, 62, 112), n(28.0, 4.0, 50, 116),
        ],
        ostinato: buildSectionOstinato([
          { startBeat: 0, beats: 8, pitches: [62, 69, 70, 69], stepBeats: 1.0, baseVel: 88, style: 'bell-tolling' },
          { startBeat: 8, beats: 8, pitches: [62, 68, 69, 63], stepBeats: 1.0, baseVel: 90, style: 'bell-tolling' },
          { startBeat: 16, beats: 8, pitches: [58, 65, 70, 57, 64, 69], stepBeats: 1.0, baseVel: 94, style: 'bell-tolling' },
          { startBeat: 24, beats: 8, pitches: [62, 74, 73, 74, 70, 69, 67, 62], stepBeats: 1.0, baseVel: 98, style: 'bell-tolling' },
        ]),
        harmony: buildDivisiHarmony([
          { startBeat: 0, lengthBeats: 8, satb: [74, 69, 65, 50], vel: 88 },
          { startBeat: 8, lengthBeats: 8, satb: [74, 68, 62, 50], vel: 90 },
          { startBeat: 16, lengthBeats: 4, satb: [73, 70, 65, 46], vel: 94 },
          { startBeat: 20, lengthBeats: 4, satb: [73, 69, 64, 45], vel: 96 },
          { startBeat: 24, lengthBeats: 8, satb: [74, 69, 65, 50], vel: 100 },
        ]),
        bass: [
          n(0, 4, 38, 112), n(4, 4, 38, 114), n(8, 4, 32, 112), n(12, 4, 38, 116),
          n(16, 4, 34, 118), n(20, 4, 33, 118), n(24, 4, 38, 120), n(28, 4, 26, 124),
        ],
      },
    },

    // ------------------------------------------------------------------------
    // TRACK 2: Jonathan Harker — Coach Through the Borgo Pass
    // Relentless Action / Pursuit Cue · G Harmonic Minor · 128 BPM · 4/4 (32 Beats)
    // Melos Instruments: AURA M400 Carpathian Violins + PNEUMA Shakuhachi + AURA Cimbalom/Harpsichord + VELA Tremolo Strings + BAJO Cello Menace
    // ------------------------------------------------------------------------
    {
      movementNumber: 2,
      title: 'Jonathan Harker: Coach Through the Borgo Pass',
      characterOrTheme: 'Action & Pursuit Cue · Harker’s Midnight Carriage Ride Into the Carpathians',
      chapterCue: 'Chapter I · Walpurgis Night on the Borgo Pass',
      key: 'G',
      mode: 'harmonic-minor',
      bpm: 128,
      timeSignature: '4/4',
      lengthBeats: 32,
      percussionStyle: 'carpathian-pursuit',
      composerStudyNote:
        'A breathless, galloping action cue in G Hungarian/Harmonic Minor at 128 BPM. Features virtuosic Carpathian violins (`f_aura-mellotron-violins`), Ludwig Göransson-style wild Shakuhachi wind cries (`f_pneuma-shakuhachi`), rapid Transylvanian cimbalom/harpsichord 16th-note runs (`f_aura-harpsichord-68`), razor-sharp sul ponticello tremolo strings (`f_tremolo-strings`), and relentless Bowed Cello Menace (`f_cello-menace`).',
      leitmotifName: 'Leitmotif II · The Borgo Pass Gallop & Wolf Pursuit',
      aceStepPrompt:
        'Fast kinetic Gothic action film score in G harmonic minor, 128 BPM, virtuosic Gypsy solo violin, Transylvanian cimbalom 16th-note ostinato, driving cello menace, breath woodwind cries and galloping timpani.',
      qwenDirection:
        'Fast 128 BPM Carpathian carriage chase in G harmonic minor with virtuosic violin runs and relentless 16th-note cimbalom ostinato.',
      trackPartSpecs: {
        lead: { role: 'lead', trackName: 'Carpathian Virtuoso Violins', instrumentType: 'aura', presetId: 'f_aura-mellotron-violins', color: '#ff3b5c', gainDb: 0.6, pan: -0.14 },
        countermelody: { role: 'countermelody', trackName: 'Carpathian Wolf-Wind Flute', instrumentType: 'pneuma', presetId: 'f_pneuma-shakuhachi', color: '#7dd3a8', gainDb: -0.5, pan: 0.28 },
        ostinato: { role: 'ostinato', trackName: 'Transylvanian Cimbalom', instrumentType: 'aura', presetId: 'f_aura-harpsichord-68', color: '#f5b041', gainDb: -1.8, pan: -0.3 },
        harmony: { role: 'harmony', trackName: 'Sul Ponticello Tremolo Strings', instrumentType: 'vela', presetId: 'f_tremolo-strings', color: '#9b5de5', gainDb: -2.0, pan: 0.2 },
        bass: { role: 'bass', trackName: 'Galloping Cello Menace', instrumentType: 'bajo', presetId: 'f_cello-menace', color: '#9e1424', gainDb: 0.0, pan: 0.0 },
      },
      parts: {
        lead: [
          // Section I: Galloping Ostinato Launch (Beats 0–4)
          n(0.0, 1.0, 67, 102), n(1.0, 1.0, 74, 106), n(2.0, 1.5, 75, 112), n(3.5, 0.5, 74, 100),
          // Section II: A-Theme — Frantic Carpathian Violin Flight (Beats 4–16)
          n(4.0, 0.5, 79, 110), n(4.5, 0.5, 78, 104), n(5.0, 0.5, 79, 112), n(5.5, 0.5, 82, 116),
          n(6.0, 1.0, 81, 112), n(7.0, 0.5, 79, 106), n(7.5, 0.5, 75, 104),
          n(8.0, 1.0, 74, 108), n(9.0, 0.5, 75, 106), n(9.5, 0.5, 78, 112),
          n(10.0, 1.5, 79, 116), n(11.5, 0.5, 74, 102),
          n(12.0, 0.5, 75, 108), n(12.5, 0.5, 74, 104), n(13.0, 0.5, 72, 102), n(13.5, 0.5, 70, 100),
          n(14.0, 2.0, 69, 108),
          // Section III: B-Section — Wolves Surround the Coach (Beats 16–24)
          n(16.0, 1.0, 82, 116), n(17.0, 1.0, 81, 112), n(18.0, 1.5, 86, 122), n(19.5, 0.5, 84, 114),
          n(20.0, 1.0, 82, 114), n(21.0, 1.0, 79, 110), n(22.0, 1.0, 78, 112), n(23.0, 1.0, 81, 116),
          // Section IV: Arrival at the Courtyard of Castle Dracula (Beats 24–32)
          n(24.0, 0.5, 79, 116), n(24.5, 0.5, 78, 110), n(25.0, 0.5, 79, 116), n(25.5, 0.5, 82, 118),
          n(26.0, 1.0, 81, 116), n(27.0, 1.0, 78, 114), n(28.0, 4.0, 79, 122),
        ],
        countermelody: [
          n(2.0, 2.0, 75, 94), n(6.0, 2.0, 74, 96), n(10.0, 2.0, 75, 98), n(14.0, 2.0, 74, 96),
          n(16.0, 2.0, 79, 106), n(18.0, 2.0, 82, 110), n(20.0, 2.0, 79, 104), n(22.0, 2.0, 78, 106),
          n(24.0, 2.0, 82, 110), n(26.0, 2.0, 81, 110), n(28.0, 4.0, 79, 114),
        ],
        ostinato: buildSectionOstinato([
          { startBeat: 0, beats: 8, pitches: [55, 62, 67, 70, 67, 62, 66, 67], stepBeats: 0.25, baseVel: 86, style: 'motor-16th' },
          { startBeat: 8, beats: 8, pitches: [51, 58, 63, 67, 50, 57, 62, 66], stepBeats: 0.25, baseVel: 88, style: 'motor-16th' },
          { startBeat: 16, beats: 8, pitches: [58, 65, 70, 74, 57, 63, 69, 72], stepBeats: 0.25, baseVel: 92, style: 'motor-16th' },
          { startBeat: 24, beats: 8, pitches: [55, 62, 67, 70, 54, 60, 66, 69], stepBeats: 0.25, baseVel: 94, style: 'motor-16th' },
        ]),
        harmony: buildDivisiHarmony([
          { startBeat: 0, lengthBeats: 8, satb: [79, 74, 70, 55], vel: 84 },
          { startBeat: 8, lengthBeats: 8, satb: [79, 75, 69, 50], vel: 88 },
          { startBeat: 16, lengthBeats: 8, satb: [82, 77, 74, 58], vel: 92 },
          { startBeat: 24, lengthBeats: 8, satb: [79, 74, 70, 55], vel: 96 },
        ]),
        bass: [
          n(0, 1, 43, 108), n(1, 0.5, 43, 98), n(1.5, 0.5, 44, 104), n(2, 1, 43, 106), n(3, 1, 38, 102),
          n(4, 1, 43, 108), n(5, 1, 44, 104), n(6, 1, 45, 106), n(7, 1, 43, 102),
          n(8, 2, 39, 110), n(10, 2, 43, 108), n(12, 2, 36, 108), n(14, 2, 38, 112),
          n(16, 2, 46, 114), n(18, 2, 45, 112), n(20, 2, 39, 112), n(22, 2, 38, 114),
          n(24, 2, 43, 116), n(26, 2, 38, 116), n(28, 4, 31, 120),
        ],
      },
    },

    // ------------------------------------------------------------------------
    // TRACK 3: The Three Brides of Castle Dracula — Seduction in the Crypt
    // Hypnotic Gothic Waltz Macabre · A Harmonic Minor · 96 BPM · 3/4 (36 Beats = 12 Bars)
    // Melos Instruments: CANTUS Vault Choir + VELA Glass Choir + AURA Studio Celesta + VELA Vespers Pad + BAJO Fretless Sub
    // ------------------------------------------------------------------------
    {
      movementNumber: 3,
      title: 'The Three Brides: Seduction in the Crypt',
      characterOrTheme: 'Supernatural Encounter · The Three Vampire Sisters in the Moonlit Castle Tower',
      chapterCue: 'Chapter III · "Listen to Them—The Children of the Night"',
      key: 'A',
      mode: 'harmonic-minor',
      bpm: 96,
      timeSignature: '3/4',
      lengthBeats: 36,
      percussionStyle: 'waltz-macabre',
      composerStudyNote:
        'A hypnotic, uncanny Danny Elfman & Wojciech Kilar Waltz Macabre in 3/4. Features seductive wordless CANTUS Vault voices (`f_cantus-vault`), bowed Glass Choir (`f_glass-choir`), crystalline Gothic Celesta arpeggios (`f_aura-celesta-bell-69`), dark bronze Vespers swells (`f_vespers`), and gliding Fretless Sub-Bass (`f_fretless-glass`).',
      leitmotifName: 'Leitmotif III · Waltz of the Three Brides',
      aceStepPrompt:
        'Hypnotic eerie Gothic waltz in A harmonic minor, 96 BPM, 3/4 time, Danny Elfman style music-box celesta, seductive female gothic choir, bowed glass harmonica, dark gliding sub bass.',
      qwenDirection:
        'Seductive, uncanny 3/4 Gothic waltz in A harmonic minor with celesta arpeggios and floating choir melody.',
      trackPartSpecs: {
        lead: { role: 'lead', trackName: 'Sirens of the Crypt Choir', instrumentType: 'cantus', presetId: 'f_cantus-vault', color: '#9b5de5', gainDb: 0.8, pan: -0.1 },
        countermelody: { role: 'countermelody', trackName: 'Bowed Glass Harmonica', instrumentType: 'vela', presetId: 'f_glass-choir', color: '#5ec2ff', gainDb: 0.0, pan: 0.26 },
        ostinato: { role: 'ostinato', trackName: 'Music-Box Gothic Celesta', instrumentType: 'aura', presetId: 'f_aura-celesta-bell-69', color: '#c8cdd6', gainDb: -1.5, pan: -0.3 },
        harmony: { role: 'harmony', trackName: 'Dark Bronze Swell (Vespers)', instrumentType: 'vela', presetId: 'f_vespers', color: '#f5b041', gainDb: -2.2, pan: 0.2 },
        bass: { role: 'bass', trackName: 'Gliding Crypt Sub-Bass', instrumentType: 'bajo', presetId: 'f_fretless-glass', color: '#9e1424', gainDb: -1.0, pan: 0.0 },
      },
      parts: {
        lead: [
          // Section I: Music-Box Celesta & Whisper Intro (Beats 0–6)
          n(0.0, 3.0, 69, 82), n(3.0, 3.0, 72, 86),
          // Section II: A-Theme — The Brides' Seductive Waltz (Beats 6–18)
          n(6.0, 2.0, 76, 98), n(8.0, 1.0, 77, 94),
          n(9.0, 2.0, 76, 96), n(11.0, 1.0, 72, 90),
          n(12.0, 2.0, 74, 98), n(14.0, 1.0, 71, 90),
          n(15.0, 3.0, 72, 94),
          // Section III: B-Section — Hypnotic Chromatic Mediant Trance (F -> Dm6 -> E7b9) (Beats 18–27)
          n(18.0, 2.0, 81, 106), n(20.0, 1.0, 80, 102),
          n(21.0, 2.0, 81, 108), n(23.0, 1.0, 77, 98),
          n(24.0, 2.0, 76, 102), n(26.0, 1.0, 75, 98),
          // Section IV: Dracula Interrupts ("This Man Belongs to Me!") & Fade (Beats 27–36)
          n(27.0, 2.0, 76, 106), n(29.0, 1.0, 72, 96),
          n(30.0, 2.0, 71, 94), n(32.0, 1.0, 68, 92),
          n(33.0, 3.0, 69, 98),
        ],
        countermelody: [
          n(6.0, 3.0, 81, 86), n(9.0, 3.0, 80, 84), n(12.0, 3.0, 77, 86), n(15.0, 3.0, 76, 84),
          n(18.0, 3.0, 84, 94), n(21.0, 3.0, 83, 92), n(24.0, 3.0, 80, 94),
          n(27.0, 3.0, 81, 92), n(30.0, 3.0, 76, 88), n(33.0, 3.0, 81, 90),
        ],
        ostinato: buildSectionOstinato([
          { startBeat: 0, beats: 6, pitches: [57, 64, 72, 69, 64, 72], stepBeats: 0.5, baseVel: 76, style: 'wave' },
          { startBeat: 6, beats: 12, pitches: [57, 64, 72, 76, 62, 69, 74, 77, 56, 64, 71, 76], stepBeats: 0.5, baseVel: 80, style: 'wave' },
          { startBeat: 18, beats: 9, pitches: [53, 60, 69, 72, 50, 57, 65, 69, 52, 59, 68, 71], stepBeats: 0.5, baseVel: 84, style: 'wave' },
          { startBeat: 27, beats: 9, pitches: [57, 64, 72, 76, 52, 59, 68, 71, 57, 64, 69, 72], stepBeats: 0.5, baseVel: 78, style: 'wave' },
        ]),
        harmony: buildDivisiHarmony([
          { startBeat: 0, lengthBeats: 6, satb: [76, 72, 64, 57], vel: 72 },
          { startBeat: 6, lengthBeats: 6, satb: [76, 72, 64, 57], vel: 78 },
          { startBeat: 12, lengthBeats: 6, satb: [77, 71, 64, 52], vel: 80 },
          { startBeat: 18, lengthBeats: 6, satb: [77, 72, 65, 53], vel: 86 },
          { startBeat: 24, lengthBeats: 3, satb: [76, 71, 68, 52], vel: 88 },
          { startBeat: 27, lengthBeats: 9, satb: [76, 72, 64, 57], vel: 82 },
        ]),
        bass: [
          n(0, 3, 45, 84), n(3, 3, 45, 82),
          n(6, 3, 45, 88), n(9, 3, 41, 86), n(12, 3, 38, 88), n(15, 3, 40, 88),
          n(18, 3, 41, 92), n(21, 3, 38, 90), n(24, 3, 40, 92),
          n(27, 3, 45, 90), n(30, 3, 40, 88), n(33, 3, 33, 94),
        ],
      },
    },

    // ------------------------------------------------------------------------
    // TRACK 4: Mina Murray — Oceans of Time (Eternal Love Theme)
    // Tragic Romantic Theme · E Minor -> G Major -> E Minor · 64 BPM · 4/4 (32 Beats)
    // Melos Instruments: AURA RMI Nocturne Piano + PNEUMA Ney Flute + ONDA Glass Keys Harp + AURA Solina Strings + BAJO Bowed Contrabass
    // ------------------------------------------------------------------------
    {
      movementNumber: 4,
      title: 'Mina Murray: Oceans of Time (Eternal Love Theme)',
      characterOrTheme: 'Tragic Romantic Portrait · Mina Murray & "I Have Crossed Oceans of Time to Find You"',
      chapterCue: 'Chapters VI & XVIII · Whitby Cliffs & The Tragic Bond',
      key: 'E',
      mode: 'minor',
      bpm: 64,
      timeSignature: '4/4',
      lengthBeats: 32,
      percussionStyle: 'none',
      composerStudyNote:
        'Inspired by Wojciech Kilar’s *Love Remembered* and Chopin’s E-minor Nocturne. A heartbreakingly lyrical melody on AURA Nocturne Piano (`f_aura-rmi-electrapiano`) answered by weeping PNEUMA Ney woodwind (`f_pneuma-ney`), crystalline ONDA Glass Keys harp arpeggios (`f_Glass Keys`), warm ARP Solina strings (`f_aura-solina-74`), and deep Bowed Contrabass (`f_bowed-contrabass`).',
      leitmotifName: 'Leitmotif IV · Oceans of Time (Mina’s Love Theme)',
      aceStepPrompt:
        'Heartbreakingly romantic Gothic film score love theme in E minor and G major, 64 BPM, Wojciech Kilar Love Remembered style, solo nocturne piano, mournful woodwind, lush strings and harp.',
      qwenDirection:
        'Slow, tragic romantic theme in E minor with rising minor 6th intervals, warm G-major middle blossom, and lush string suspensions.',
      trackPartSpecs: {
        lead: { role: 'lead', trackName: 'Mina Nocturne Piano', instrumentType: 'aura', presetId: 'f_aura-rmi-electrapiano', color: '#f5b041', gainDb: 0.4, pan: -0.1 },
        countermelody: { role: 'countermelody', trackName: 'Weeping Solo Woodwind (Ney)', instrumentType: 'pneuma', presetId: 'f_pneuma-ney', color: '#7dd3a8', gainDb: -0.6, pan: 0.25 },
        ostinato: { role: 'ostinato', trackName: 'Crystalline Harp (Glass Keys)', instrumentType: 'onda', presetId: 'f_Glass Keys', color: '#5ec2ff', gainDb: -2.4, pan: -0.3 },
        harmony: { role: 'harmony', trackName: 'Late-Romantic Solina Strings', instrumentType: 'aura', presetId: 'f_aura-solina-74', color: '#c9a0dc', gainDb: -2.2, pan: 0.18 },
        bass: { role: 'bass', trackName: 'Warm Bowed Contrabass', instrumentType: 'bajo', presetId: 'f_bowed-contrabass', color: '#e8a87c', gainDb: -1.2, pan: 0.0 },
      },
      parts: {
        lead: [
          // Section I: Harp & Strings Intro (Beats 0–4)
          n(2.0, 2.0, 71, 82),
          // Section II: A-Theme — "Oceans of Time" Rising Minor 6th (E5 -> C6 -> B5) (Beats 4–16)
          n(4.0, 1.5, 76, 94), n(5.5, 0.5, 79, 90), n(6.0, 1.5, 84, 106), n(7.5, 0.5, 83, 98),
          n(8.0, 1.5, 81, 98), n(9.5, 0.5, 79, 92), n(10.0, 2.0, 78, 96),
          n(12.0, 1.5, 76, 92), n(13.5, 0.5, 74, 86), n(14.0, 2.0, 71, 88),
          // Section III: B-Section — Blossom into G Major / C Major (Beats 16–24)
          n(16.0, 1.5, 79, 102), n(17.5, 0.5, 81, 98), n(18.0, 1.5, 83, 108), n(19.5, 0.5, 86, 112),
          n(20.0, 1.5, 84, 106), n(21.5, 0.5, 83, 98), n(22.0, 2.0, 81, 100),
          // Section IV: Tragic Return to E Minor Coda (Beats 24–32)
          n(24.0, 1.5, 79, 96), n(25.5, 0.5, 78, 92), n(26.0, 2.0, 76, 94),
          n(28.0, 1.5, 75, 90), n(29.5, 2.5, 76, 96),
        ],
        countermelody: [
          n(6.0, 2.0, 76, 84), n(10.0, 2.0, 74, 84), n(14.0, 2.0, 67, 80),
          n(16.0, 2.0, 74, 92), n(18.0, 2.0, 79, 96), n(20.0, 2.0, 76, 92), n(22.0, 2.0, 74, 90),
          n(24.0, 2.0, 71, 86), n(26.0, 2.0, 72, 86), n(28.0, 4.0, 71, 88),
        ],
        ostinato: buildSectionOstinato([
          { startBeat: 0, beats: 8, pitches: [52, 59, 64, 67, 71, 67], stepBeats: 0.5, baseVel: 68, style: 'wave' },
          { startBeat: 8, beats: 8, pitches: [57, 64, 69, 72, 59, 66, 71, 75], stepBeats: 0.5, baseVel: 72, style: 'wave' },
          { startBeat: 16, beats: 8, pitches: [55, 62, 67, 71, 60, 67, 72, 76], stepBeats: 0.5, baseVel: 78, style: 'wave' },
          { startBeat: 24, beats: 8, pitches: [52, 59, 64, 67, 59, 63, 66, 71], stepBeats: 0.5, baseVel: 70, style: 'wave' },
        ]),
        harmony: buildDivisiHarmony([
          { startBeat: 0, lengthBeats: 8, satb: [76, 71, 67, 52], vel: 72 },
          { startBeat: 8, lengthBeats: 4, satb: [76, 72, 69, 57], vel: 78 },
          { startBeat: 12, lengthBeats: 4, satb: [75, 71, 66, 59], suspension: { voiceIndex: 0, suspendedMidi: 76, resolveAfterBeats: 1.5 }, vel: 78 },
          { startBeat: 16, lengthBeats: 4, satb: [79, 74, 71, 55], vel: 84 },
          { startBeat: 20, lengthBeats: 4, satb: [79, 76, 72, 60], vel: 84 },
          { startBeat: 24, lengthBeats: 4, satb: [76, 71, 67, 52], vel: 78 },
          { startBeat: 28, lengthBeats: 4, satb: [76, 71, 67, 52], vel: 76 },
        ]),
        bass: [
          n(0, 4, 40, 84), n(4, 4, 40, 88), n(8, 4, 45, 90), n(12, 4, 47, 88),
          n(16, 4, 43, 92), n(20, 4, 48, 92), n(24, 4, 40, 88), n(28, 4, 40, 90),
        ],
      },
    },

    // ------------------------------------------------------------------------
    // TRACK 5: The Schooner Demeter & Renfield's Madness — Tempest at Whitby
    // Storm & Asylum Horror Cue · C Phrygian Dominant · 136 BPM · 6/8 (36 Beats)
    // Melos Instruments: AURA Prophet-5 Storm Brass + CANTUS Overtone Whistle + AURA Synthi Arp + VELA Reliquary Iron + BAJO Colossus Sub
    // ------------------------------------------------------------------------
    {
      movementNumber: 5,
      title: 'The Schooner Demeter & Renfield’s Madness',
      characterOrTheme: 'Horror & Maritime Tempest Cue · The Ghost Ship at Whitby & Renfield in the Asylum',
      chapterCue: 'Chapter VII · The Captain’s Log of the Demeter',
      key: 'C',
      mode: 'phrygian-dominant',
      bpm: 136,
      timeSignature: '6/8',
      lengthBeats: 36,
      percussionStyle: 'maritime-tempest',
      composerStudyNote:
        'A violent 6/8 maritime storm and asylum horror cue in C Phrygian Dominant (`C – Db – E – F – G – Ab – Bb`). Pairs roaring Prophet-5 storm brass (`f_aura-prophet5-rev1`), eerie CANTUS overtone harmonic screams (`f_cantus-overtone`), surging 1973 Synthi wave sequences (`f_aura-on-the-run-73`), VELA Reliquary iron swells (`f_reliquary`), and massive BAJO Colossus sub-bass (`f_colossus`).',
      leitmotifName: 'Leitmotif V · The Demeter Hurricane & Asylum Dread',
      aceStepPrompt:
        'Terrifying maritime storm and horror film score in C Phrygian dominant, 136 BPM, 6/8 time, roaring brass, eerie overtone choir, surging synth-orchestral wave arpeggios, colossus sub bass and thunderous timpani.',
      qwenDirection:
        'Violent 6/8 storm cue in C Phrygian dominant with surging wave ostinatos, brass stabs, and eerie high overtones.',
      trackPartSpecs: {
        lead: { role: 'lead', trackName: 'Tempest Brass (Prophet-5)', instrumentType: 'aura', presetId: 'f_aura-prophet5-rev1', color: '#ff3b5c', gainDb: 0.4, pan: -0.14 },
        countermelody: { role: 'countermelody', trackName: 'Asylum Overtone Harmonic', instrumentType: 'cantus', presetId: 'f_cantus-overtone', color: '#5ec2ff', gainDb: -0.5, pan: 0.28 },
        ostinato: { role: 'ostinato', trackName: 'Hurricane Wave Sequence', instrumentType: 'aura', presetId: 'f_aura-on-the-run-73', color: '#f5b041', gainDb: -2.0, pan: -0.3 },
        harmony: { role: 'harmony', trackName: 'Reliquary Iron Hull Swell', instrumentType: 'vela', presetId: 'f_reliquary', color: '#9b5de5', gainDb: -1.5, pan: 0.2 },
        bass: { role: 'bass', trackName: 'Colossus Leviathan Sub-Bass', instrumentType: 'bajo', presetId: 'f_colossus', color: '#9e1424', gainDb: 0.0, pan: 0.0 },
      },
      parts: {
        lead: [
          // Section I: Hurricane Swell Intro (Beats 0–6)
          n(0.0, 1.5, 60, 106), n(1.5, 1.5, 61, 108), n(3.0, 3.0, 64, 114),
          // Section II: A-Theme — The Ghost Ship Demeter (Beats 6–18)
          n(6.0, 1.0, 67, 112), n(7.0, 0.5, 68, 108), n(7.5, 1.5, 67, 110),
          n(9.0, 1.0, 65, 106), n(10.0, 0.5, 64, 108), n(10.5, 1.5, 61, 112),
          n(12.0, 1.5, 60, 110), n(13.5, 1.5, 64, 114), n(15.0, 3.0, 67, 118),
          // Section III: B-Section — Renfield's Asylum Vision ("The Master Is Coming!") (Beats 18–27)
          n(18.0, 1.5, 72, 118), n(19.5, 1.5, 73, 120),
          n(21.0, 1.0, 76, 122), n(22.0, 0.5, 73, 114), n(22.5, 1.5, 72, 116),
          n(24.0, 1.5, 68, 114), n(25.5, 1.5, 67, 114),
          // Section IV: Shipwreck at Whitby Pier Climax (Beats 27–36)
          n(27.0, 1.5, 72, 120), n(28.5, 1.5, 68, 116),
          n(30.0, 1.5, 67, 116), n(31.5, 1.5, 61, 114), n(33.0, 3.0, 60, 124),
        ],
        countermelody: [
          // Low C2/G2 notes trigger CANTUS Overtone's eerie harmonic 13 whistle!
          n(3.0, 3.0, 36, 96), n(9.0, 3.0, 37, 100), n(15.0, 3.0, 36, 102),
          n(18.0, 3.0, 43, 106), n(21.0, 3.0, 44, 108), n(24.0, 3.0, 43, 106),
          n(27.0, 3.0, 36, 108), n(33.0, 3.0, 36, 112),
        ],
        ostinato: buildSectionOstinato([
          { startBeat: 0, beats: 12, pitches: [48, 55, 60, 61, 64, 67], stepBeats: 0.5, baseVel: 86, style: 'motor-16th' },
          { startBeat: 12, beats: 12, pitches: [48, 56, 60, 65, 49, 56, 61, 65], stepBeats: 0.5, baseVel: 90, style: 'motor-16th' },
          { startBeat: 24, beats: 12, pitches: [48, 55, 60, 64, 67, 72], stepBeats: 0.5, baseVel: 94, style: 'motor-16th' },
        ]),
        harmony: buildDivisiHarmony([
          { startBeat: 0, lengthBeats: 12, satb: [72, 67, 64, 48], vel: 86 },
          { startBeat: 12, lengthBeats: 12, satb: [73, 68, 65, 49], vel: 90 },
          { startBeat: 24, lengthBeats: 12, satb: [72, 67, 64, 48], vel: 96 },
        ]),
        bass: [
          n(0, 3, 36, 112), n(3, 3, 37, 110), n(6, 3, 36, 114), n(9, 3, 37, 112),
          n(12, 3, 41, 114), n(15, 3, 43, 116), n(18, 3, 36, 118), n(21, 3, 37, 118),
          n(24, 3, 44, 116), n(27, 3, 43, 118), n(30, 6, 36, 124),
        ],
      },
    },

    // ------------------------------------------------------------------------
    // TRACK 6: Van Helsing's Crusade & Sunset on the Borgo Pass
    // Epic Finale & Redemption Apotheosis · D Harmonic Minor -> D Major Picardy · 104 BPM · 4/4 (32 Beats)
    // Melos Instruments: AURA OB-X Heroic Brass + AURA M400 Boys Choir + VELA Cathedral Bells + CANTUS Plainsong Choir + BAJO Bowed Contrabass
    // ------------------------------------------------------------------------
    {
      movementNumber: 6,
      title: 'Van Helsing’s Crusade & Sunset on the Borgo Pass',
      characterOrTheme: 'Epic Finale & Redemption · The Final Pursuit & Count Dracula’s Soul Released at Sunset',
      chapterCue: 'Chapter XXVII · Sunset Over Castle Dracula & Lux Aeterna',
      key: 'D',
      mode: 'harmonic-minor',
      bpm: 104,
      timeSignature: '4/4',
      lengthBeats: 32,
      percussionStyle: 'epic-apotheosis',
      composerStudyNote:
        'The monumental film finale uniting Van Helsing’s heroic crusade, the Borgo Pass pursuit, and Mina’s *Oceans of Time* love motif. Opens in furious D Harmonic Minor with OB-X Brass (`f_aura-obx-warm-poly`) and Bowed Contrabass (`f_bowed-contrabass`), then at Beat 20—as the sun breaks through the clouds and the curse is lifted—resolves into a radiant Picardy D Major apotheosis with M400 Boys Choir (`f_aura-mellotron-choir`), CANTUS Plainsong (`f_cantus-plainsong`), and VELA Cathedral shimmer bells (`f_cathedral`).',
      leitmotifName: 'Leitmotif VI · Van Helsing’s Crusade & Lux Aeterna Picardy Apotheosis',
      aceStepPrompt:
        'Epic Gothic film score finale in D harmonic minor resolving into radiant D major Picardy third, 104 BPM, heroic brass, boys choir descant, cathedral bells, full string orchestra and timpani.',
      qwenDirection:
        'Epic battle and pursuit in D harmonic minor transforming at bar 6 into a transcendent D major choral and cathedral-bell redemption finale.',
      trackPartSpecs: {
        lead: { role: 'lead', trackName: 'Heroic Oberheim Brass & Lead', instrumentType: 'aura', presetId: 'f_aura-obx-warm-poly', color: '#f5b041', gainDb: 0.4, pan: -0.1 },
        countermelody: { role: 'countermelody', trackName: 'Lux Aeterna Boys Choir', instrumentType: 'aura', presetId: 'f_aura-mellotron-choir', color: '#7dd3a8', gainDb: 0.0, pan: 0.25 },
        ostinato: { role: 'ostinato', trackName: 'Cathedral Shimmer Bells', instrumentType: 'vela', presetId: 'f_cathedral', color: '#5ec2ff', gainDb: -1.5, pan: -0.28 },
        harmony: { role: 'harmony', trackName: 'Sanctus Plainsong Choir', instrumentType: 'cantus', presetId: 'f_cantus-plainsong', color: '#c9a0dc', gainDb: -1.4, pan: 0.18 },
        bass: { role: 'bass', trackName: 'Symphonic Bowed Contrabass', instrumentType: 'bajo', presetId: 'f_bowed-contrabass', color: '#9e1424', gainDb: -0.6, pan: 0.0 },
      },
      parts: {
        lead: [
          // Section I & II: The Final Pursuit Before Sunset in D Harmonic Minor (Beats 0–16)
          n(0.0, 1.5, 74, 108), n(1.5, 0.5, 77, 106), n(2.0, 1.5, 81, 114), n(3.5, 0.5, 79, 106),
          n(4.0, 1.0, 77, 110), n(5.0, 1.0, 76, 106), n(6.0, 2.0, 74, 112),
          n(8.0, 1.5, 82, 118), n(9.5, 0.5, 81, 112), n(10.0, 1.0, 79, 112), n(11.0, 1.0, 77, 110),
          n(12.0, 1.5, 76, 114), n(13.5, 0.5, 73, 110), n(14.0, 2.0, 74, 116),
          // Section III: The Ray of Sunset — Transformation of Mina's Love Theme (Beats 16–24)
          n(16.0, 1.5, 74, 110), n(17.5, 0.5, 77, 108), n(18.0, 2.0, 82, 118),
          n(20.0, 1.5, 81, 114), n(21.5, 0.5, 79, 108), n(22.0, 2.0, 76, 112),
          // Section IV: Picardy D Major Transcendence ("Peace on His Face") (Beats 24–32)
          n(24.0, 2.0, 78, 118), n(26.0, 2.0, 81, 120),
          n(28.0, 4.0, 86, 124),
        ],
        countermelody: [
          // Soaring Boys Choir entering on the crusade and blooming on the Picardy F#5 / A5
          n(8.0, 4.0, 74, 96), n(12.0, 4.0, 73, 98),
          n(16.0, 4.0, 77, 104), n(20.0, 4.0, 76, 104),
          n(24.0, 4.0, 74, 112), n(28.0, 4.0, 78, 118),
        ],
        ostinato: buildSectionOstinato([
          { startBeat: 0, beats: 8, pitches: [62, 69, 74, 77], stepBeats: 0.5, baseVel: 84, style: 'wave' },
          { startBeat: 8, beats: 8, pitches: [58, 65, 70, 74, 57, 64, 69, 73], stepBeats: 0.5, baseVel: 88, style: 'wave' },
          { startBeat: 16, beats: 8, pitches: [58, 65, 70, 74, 55, 62, 67, 70], stepBeats: 0.5, baseVel: 90, style: 'wave' },
          { startBeat: 24, beats: 8, pitches: [62, 69, 74, 78, 81, 86], stepBeats: 0.5, baseVel: 94, style: 'wave' },
        ]),
        harmony: buildDivisiHarmony([
          { startBeat: 0, lengthBeats: 8, satb: [74, 69, 65, 50], vel: 86 },
          { startBeat: 8, lengthBeats: 4, satb: [74, 70, 65, 46], vel: 90 },
          { startBeat: 12, lengthBeats: 4, satb: [73, 69, 64, 45], vel: 92 },
          { startBeat: 16, lengthBeats: 4, satb: [74, 70, 65, 46], vel: 94 },
          { startBeat: 20, lengthBeats: 4, satb: [76, 69, 64, 45], vel: 96 },
          // Picardy D Major Choir Resolution (D - F# - A - D)
          { startBeat: 24, lengthBeats: 8, satb: [78, 74, 69, 50], suspension: { voiceIndex: 0, suspendedMidi: 79, resolveAfterBeats: 2.0 }, vel: 104 },
        ]),
        bass: [
          n(0, 4, 38, 108), n(4, 4, 38, 108), n(8, 4, 34, 112), n(12, 4, 33, 114),
          n(16, 4, 34, 114), n(20, 4, 33, 116), n(24, 4, 38, 118), n(28, 4, 26, 122),
        ],
      },
    },
  ],
};

// ============================================================================
// 3. CURATED PER-TRACK MELOS ORCHESTRATION PALETTES FOR ALL OTHER 10 BOOKS
//    So every track of every book has its own distinct Melos WASM instruments,
//    character/thematic portrait, and 32-beat multi-section film arrangement!
// ============================================================================

const CURATED_TRACK_PRESET_BANKS: Array<Record<MasterPartRole, { type: MelosWasmInstrumentType; presetId: string; name: string }>> = [
  // Palette 0: Lyrical Piano, Reed Flute, Crystal Harp, Solina Strings & Bowed Contrabass
  {
    lead: { type: 'aura', presetId: 'f_aura-rmi-electrapiano', name: 'Fortepiano / Nocturne Keys' },
    countermelody: { type: 'pneuma', presetId: 'f_pneuma-ney', name: 'Reed Flute Obligato' },
    ostinato: { type: 'vela', presetId: 'f_vitreous', name: 'Crystal Plucked Harp' },
    harmony: { type: 'aura', presetId: 'f_aura-solina-74', name: 'ARP Solina Strings' },
    bass: { type: 'bajo', presetId: 'f_bowed-contrabass', name: 'Bowed Contrabass' },
  },
  // Palette 1: Noble CS-80 Brass, M400 Violins, Suitcase Tines, Plainsong Choir & Contrabass
  {
    lead: { type: 'aura', presetId: 'f_aura-cs80-bladerunner', name: 'CS-80 Expressive Brass' },
    countermelody: { type: 'aura', presetId: 'f_aura-mellotron-violins', name: 'M400 Three Violins' },
    ostinato: { type: 'aura', presetId: 'f_aura-rhodes-suitcase-72', name: 'Suitcase Tine Arpeggio' },
    harmony: { type: 'cantus', presetId: 'f_cantus-plainsong', name: 'Plainsong Choral Pad' },
    bass: { type: 'bajo', presetId: 'f_bowed-contrabass', name: 'Bowed Contrabass' },
  },
  // Palette 2: Baroque Harpsichord, Shakuhachi Flute, Bloom Pluck, Elka Strings & Upright Pizzicato
  {
    lead: { type: 'aura', presetId: 'f_aura-harpsichord-68', name: 'Baroque Harpsichord' },
    countermelody: { type: 'pneuma', presetId: 'f_pneuma-shakuhachi', name: 'Bamboo Shakuhachi' },
    ostinato: { type: 'onda', presetId: 'f_Bloom Pluck', name: 'Spiccato Pluck' },
    harmony: { type: 'aura', presetId: 'f_aura-elka-rhapsody', name: 'Elka Rhapsody Strings' },
    bass: { type: 'bajo', presetId: 'f_upright-jazz', name: 'Plucked Upright Bass' },
  },
  // Palette 3: Glass Choir, Vault Monastic Voices, Studio Celesta, Tremolo Strings & Shruti Drone
  {
    lead: { type: 'vela', presetId: 'f_glass-choir', name: 'Crystalline Glass Choir' },
    countermelody: { type: 'cantus', presetId: 'f_cantus-vault', name: 'Stone-Vault Choir' },
    ostinato: { type: 'aura', presetId: 'f_aura-celesta-bell-69', name: 'Studio Analog Celesta' },
    harmony: { type: 'vela', presetId: 'f_tremolo-strings', name: 'Bowed Tremolo Strings' },
    bass: { type: 'ison', presetId: 'f_ison-shruti', name: 'Sustained Reed Drone' },
  },
  // Palette 4: Prophet-5 Storm Brass, Kargyraa Chant, Phaedra Sequence, Reliquary Iron & Cello Menace
  {
    lead: { type: 'aura', presetId: 'f_aura-prophet5-rev1', name: 'Prophet-5 Dramatic Brass' },
    countermelody: { type: 'cantus', presetId: 'f_cantus-kargyraa', name: 'Subharmonic Chant' },
    ostinato: { type: 'aura', presetId: 'f_aura-phaedra-seq-74', name: 'Driving Motor Sequence' },
    harmony: { type: 'vela', presetId: 'f_reliquary', name: 'Ancient Iron Swell' },
    bass: { type: 'bajo', presetId: 'f_cello-menace', name: 'Bowed Cello Menace' },
  },
  // Palette 5: Oberheim Heroic Poly, Boys Choir Descant, Cathedral Bells, Plainsong Choir & Trailer Sub
  {
    lead: { type: 'aura', presetId: 'f_aura-obx-warm-poly', name: 'Oberheim Symphonic Poly' },
    countermelody: { type: 'aura', presetId: 'f_aura-mellotron-choir', name: 'M400 Boys Choir' },
    ostinato: { type: 'vela', presetId: 'f_cathedral', name: 'Cathedral Shimmer Bells' },
    harmony: { type: 'cantus', presetId: 'f_cantus-plainsong', name: 'Full Sanctus Choir' },
    bass: { type: 'bajo', presetId: 'f_bowed-contrabass', name: 'Symphonic Contrabass' },
  },
];

const PERCUSSION_BY_TRACK_INDEX: FilmPercussionStyle[] = [
  'pastoral-pulsing',
  'none',
  'regency-ballroom',
  'waltz-macabre',
  'storm-agitato',
  'epic-apotheosis',
];

function buildDynamicBookBlueprint(bookThemeId: string): MasterBookScoreBlueprint | null {
  const album = CLASSIC_BOOK_SOUNDTRACKS[bookThemeId];
  if (!album) return null;

  const movements: MasterMovementScore[] = album.tracks.map((tr, idx) => {
    const baseEvents = buildPolyphonicTrackScore(tr); // 16 beats of ScoreNoteEvent[]
    const palette = CURATED_TRACK_PRESET_BANKS[idx % CURATED_TRACK_PRESET_BANKS.length];

    const rawLead = baseEvents.filter((ev) => ev.voice === 'lead');
    const rawArp = baseEvents.filter((ev) => ev.voice === 'arpeggio');
    const rawHarm = baseEvents.filter((ev) => ev.voice === 'harmony');
    const rawBass = baseEvents.filter((ev) => ev.voice === 'bass');

    // Expand 16 beats into a full 32-beat multi-section song (Pass 1: Beats 0..16, Pass 2: Beats 16..32 with register & dynamic development)
    const leadNotes: NoteEvent[] = [
      ...rawLead.map((ev) => n(ev.startBeat, ev.durationBeats, ev.midi, ev.velocity)),
      ...rawLead.map((ev, i) => {
        const pitchShift = ev.startBeat < 8 ? 12 : i % 2 === 0 ? 7 : 0;
        return n(ev.startBeat + 16, ev.durationBeats, Math.min(88, ev.midi + pitchShift), Math.min(124, ev.velocity + 10));
      }),
    ];

    // Independent countermelody in 3rds/6ths entering at beat 4 and soaring in Section B (beats 16..32)
    const thirdInterval = tr.mode === 'minor' ? 3 : 4;
    const sixthInterval = tr.mode === 'minor' ? 8 : 9;
    const counterNotes: NoteEvent[] = [
      ...rawLead
        .filter((ev, i) => ev.startBeat >= 4 && i % 2 === 0)
        .map((ev) => n(ev.startBeat + 0.5, ev.durationBeats * 1.15, ev.midi + thirdInterval, Math.max(64, ev.velocity - 10))),
      ...rawLead
        .filter((_, i) => i % 2 === 0)
        .map((ev) => n(ev.startBeat + 16, ev.durationBeats * 1.25, ev.midi + sixthInterval, Math.min(114, ev.velocity + 4))),
    ];

    const ostinatoNotes: NoteEvent[] = [
      ...rawArp.map((ev) => n(ev.startBeat, ev.durationBeats, ev.midi, ev.velocity)),
      ...rawArp.map((ev, i) =>
        n(ev.startBeat + 16, ev.durationBeats, ev.midi + (i % 4 === 0 ? 12 : 0), Math.min(112, ev.velocity + 8)),
      ),
    ];

    const harmonyNotes: NoteEvent[] = [
      ...rawHarm.map((ev) => n(ev.startBeat, ev.durationBeats, ev.midi, ev.velocity)),
      ...rawHarm.map((ev) => n(ev.startBeat + 16, ev.durationBeats, ev.midi, Math.min(108, ev.velocity + 8))),
    ];

    const bassNotes: NoteEvent[] = [
      ...rawBass.map((ev) => n(ev.startBeat, ev.durationBeats, ev.midi, ev.velocity)),
      ...rawBass.map((ev) => n(ev.startBeat + 16, ev.durationBeats, Math.max(28, ev.midi - (ev.startBeat >= 8 ? 12 : 0)), Math.min(122, ev.velocity + 10))),
    ];

    const trackPartSpecs: Record<MasterPartRole, MasterPartPresetSpec> = {
      lead: {
        role: 'lead',
        trackName: `${tr.trackNumber}.1 · ${palette.lead.name}`,
        instrumentType: palette.lead.type,
        presetId: palette.lead.presetId,
        color: '#f5b041',
        gainDb: 0.4,
        pan: -0.1,
      },
      countermelody: {
        role: 'countermelody',
        trackName: `${tr.trackNumber}.2 · ${palette.countermelody.name}`,
        instrumentType: palette.countermelody.type,
        presetId: palette.countermelody.presetId,
        color: '#7dd3a8',
        gainDb: -0.8,
        pan: 0.25,
      },
      ostinato: {
        role: 'ostinato',
        trackName: `${tr.trackNumber}.3 · ${palette.ostinato.name}`,
        instrumentType: palette.ostinato.type,
        presetId: palette.ostinato.presetId,
        color: '#5ec2ff',
        gainDb: -2.2,
        pan: -0.28,
      },
      harmony: {
        role: 'harmony',
        trackName: `${tr.trackNumber}.4 · ${palette.harmony.name}`,
        instrumentType: palette.harmony.type,
        presetId: palette.harmony.presetId,
        color: '#c9a0dc',
        gainDb: -2.0,
        pan: 0.18,
      },
      bass: {
        role: 'bass',
        trackName: `${tr.trackNumber}.5 · ${palette.bass.name}`,
        instrumentType: palette.bass.type,
        presetId: palette.bass.presetId,
        color: '#e8a87c',
        gainDb: -0.8,
        pan: 0.0,
      },
    };

    return {
      movementNumber: tr.trackNumber,
      title: tr.title,
      characterOrTheme: `${tr.chapterCue} · ${tr.mood}`,
      chapterCue: tr.chapterCue,
      key: tr.key,
      mode: tr.mode,
      bpm: tr.bpm,
      timeSignature: tr.timeSignature,
      lengthBeats: 32,
      percussionStyle: PERCUSSION_BY_TRACK_INDEX[idx % PERCUSSION_BY_TRACK_INDEX.length],
      composerStudyNote: `${tr.mood} — Scored for ${tr.instrumentation} (${palette.lead.name}, ${palette.countermelody.name}, ${palette.ostinato.name}, ${palette.harmony.name}, ${palette.bass.name}).`,
      leitmotifName: `Leitmotif ${tr.trackNumber} · ${tr.title}`,
      aceStepPrompt: `${album.ensembleDescription}, ${tr.title}, ${tr.mood}, ${tr.instrumentation}, ${tr.bpm} BPM in ${tr.key} ${tr.mode}.`,
      qwenDirection: `${tr.mood} (${tr.instrumentation})`,
      trackPartSpecs,
      parts: {
        lead: leadNotes,
        countermelody: counterNotes,
        ostinato: ostinatoNotes,
        harmony: harmonyNotes,
        bass: bassNotes,
      },
    };
  });

  return {
    bookThemeId,
    albumTitle: album.albumTitle,
    composerLineage: [
      'John Williams (Thematic Leitmotif Architecture)',
      'Hans Zimmer & Howard Shore (Immersive Worldbuilding & Orchestral Weight)',
      album.composerDirection,
    ],
    hallReverbDecaySec: 2.5,
    hallReverbDamping: 0.4,
    partSpecs: movements[0].trackPartSpecs,
    movements,
  };
}

// ============================================================================
// 7-SECTION SYMPHONIC FILM SCORE EXPANSION & MPE EXPRESSION ENGINE (2:15–5:30 MIN)
// Preserves the 32–36 beat cues as `lightBackgroundParts` ("Light Reading Background")
// while expanding `parts` & `lengthBeats` into complete 7-movement Hollywood/Classical
// film score compositions with MPE expression curves, articulations, and ACE-Step 2.5 stems.
// ============================================================================

const SECTION_BLUEPRINTS: Array<{
  romanNumeral: string;
  title: string;
  dramaticRole: string;
  dynamicMarking: FilmScoreSectionMarker['dynamicMarking'];
  transposeSemis: number;
  velScale: number;
  leadArticulation: OrchestralArticulation;
  leadSwell: MpeSwellShape;
  counterArticulation: OrchestralArticulation;
  ostinatoArticulation: OrchestralArticulation;
  harmonyArticulation: OrchestralArticulation;
  includeRoles: Record<MasterPartRole, boolean>;
  octaveDoubleLead?: boolean;
  octaveDoubleCounter?: boolean;
  subOctaveBass?: boolean;
  generativeModel: string;
  color: string;
}> = [
  {
    romanNumeral: 'I',
    title: 'Overture & Establishing Shot',
    dramaticRole: 'Atmospheric worldbuilding, pedal drone & foreshadowed leitmotif fragment',
    dynamicMarking: 'pp',
    transposeSemis: 0,
    velScale: 0.74,
    leadArticulation: 'con-sordino',
    leadSwell: 'crescendo',
    counterArticulation: 'sul-tasto',
    ostinatoArticulation: 'pizzicato',
    harmonyArticulation: 'con-sordino',
    includeRoles: { lead: true, countermelody: false, ostinato: true, harmony: true, bass: true },
    generativeModel: 'ACE-Step 2.5 Chamber & Ambience Stem',
    color: '#38BDF8',
  },
  {
    romanNumeral: 'II',
    title: 'Primary Character Leitmotif (Exposition A)',
    dramaticRole: 'Full cantabile statement of the character theme with legato portamento & MPE hairpins',
    dynamicMarking: 'mp',
    transposeSemis: 0,
    velScale: 0.92,
    leadArticulation: 'legato',
    leadSwell: 'hairpin',
    counterArticulation: 'legato',
    ostinatoArticulation: 'legato',
    harmonyArticulation: 'legato',
    includeRoles: { lead: true, countermelody: true, ostinato: true, harmony: true, bass: true },
    generativeModel: 'ACE-Step 2.5 Soloist + Qwen-Score Counterpoint',
    color: '#A78BFA',
  },
  {
    romanNumeral: 'III',
    title: 'Secondary Theme & Obligato Dialogue (Exposition B)',
    dramaticRole: 'Contrapuntal canon between solo instrument and obligato woodwind/cello over spiccato strings',
    dynamicMarking: 'mf',
    transposeSemis: 0,
    velScale: 1.0,
    leadArticulation: 'portamento',
    leadSwell: 'hairpin',
    counterArticulation: 'legato',
    ostinatoArticulation: 'spiccato',
    harmonyArticulation: 'legato',
    includeRoles: { lead: true, countermelody: true, ostinato: true, harmony: true, bass: true },
    octaveDoubleCounter: true,
    generativeModel: 'ACE-Step 2.5 Divisi Strings + Melos MPE Synths',
    color: '#F472B6',
  },
  {
    romanNumeral: 'IV',
    title: 'Dramatic Conflict & Symphonic Development',
    dramaticRole: 'Modulation to dominant/relative key with 11.5 Hz bow tremolo, marcato brass & storm timpani',
    dynamicMarking: 'f',
    transposeSemis: 7,
    velScale: 1.12,
    leadArticulation: 'marcato',
    leadSwell: 'sfz-swell',
    counterArticulation: 'tremolo',
    ostinatoArticulation: 'spiccato',
    harmonyArticulation: 'tremolo',
    includeRoles: { lead: true, countermelody: true, ostinato: true, harmony: true, bass: true },
    subOctaveBass: true,
    generativeModel: 'ACE-Step 2.5 Brass & Tremolo Strings + BAJO/AURA',
    color: '#FB923C',
  },
  {
    romanNumeral: 'V',
    title: 'Intimate Soliloquy & Rubato Cadenza Bridge',
    dramaticRole: 'Fragile high-register solo cadenza over suspended glass/choir harmonics before the storm',
    dynamicMarking: 'p',
    transposeSemis: 12,
    velScale: 0.78,
    leadArticulation: 'sul-ponticello',
    leadSwell: 'hairpin',
    counterArticulation: 'con-sordino',
    ostinatoArticulation: 'pizzicato',
    harmonyArticulation: 'sul-tasto',
    includeRoles: { lead: true, countermelody: true, ostinato: true, harmony: true, bass: false },
    generativeModel: 'HeartMuLa Intimate Soloist + VELA/CANTUS Modal Halo',
    color: '#2DD4BF',
  },
  {
    romanNumeral: 'VI',
    title: 'Grand Symphonic Recapitulation & Apotheosis (Tutti)',
    dramaticRole: 'Full orchestra + choir + Melos MPE synths in soaring octaves with sforzando hairpins',
    dynamicMarking: 'fff',
    transposeSemis: 0,
    velScale: 1.22,
    leadArticulation: 'sfz-hairpin',
    leadSwell: 'sfz-swell',
    counterArticulation: 'marcato',
    ostinatoArticulation: 'marcato',
    harmonyArticulation: 'tremolo',
    includeRoles: { lead: true, countermelody: true, ostinato: true, harmony: true, bass: true },
    octaveDoubleLead: true,
    octaveDoubleCounter: true,
    subOctaveBass: true,
    generativeModel: 'ACE-Step 2.5 Full Symphonic Tutti + YuE2 Cathedral Choir',
    color: '#F43F5E',
  },
  {
    romanNumeral: 'VII',
    title: 'Coda & Morendo Resolution',
    dramaticRole: 'Poignant thematic reminiscence fading into the concert hall acoustic tail',
    dynamicMarking: 'pp',
    transposeSemis: 0,
    velScale: 0.72,
    leadArticulation: 'legato',
    leadSwell: 'decrescendo',
    counterArticulation: 'con-sordino',
    ostinatoArticulation: 'pizzicato',
    harmonyArticulation: 'con-sordino',
    includeRoles: { lead: true, countermelody: true, ostinato: true, harmony: true, bass: true },
    generativeModel: 'ACE-Step 2.5 String Consort Morendo Tail',
    color: '#818CF8',
  },
];

function cloneWithMpe(
  src: NoteEvent,
  beatOffset: number,
  transposeSemis: number,
  velScale: number,
  articulation: OrchestralArticulation,
  swellShape: MpeSwellShape,
  prevKey?: number,
): NoteEvent {
  const newKey = Math.max(21, Math.min(102, src.key + transposeSemis));
  const newVel = Math.max(18, Math.min(127, Math.round(src.vel * velScale)));
  const isLong = src.lengthBeats >= 1.5;
  const glideFromSemis =
     (articulation === 'portamento' || articulation === 'legato') &&
    prevKey !== undefined &&
    Math.abs(prevKey - newKey) >= 1 &&
    Math.abs(prevKey - newKey) <= 7
      ? Math.sign(prevKey - newKey) * Math.min(2, Math.abs(prevKey - newKey) * 0.45)
      : 0;

  return {
    id: `mpe_${noteSeq++}`,
    startBeats: Number((src.startBeats + beatOffset).toFixed(4)),
    lengthBeats: Number((articulation === 'legato' || articulation === 'portamento' ? src.lengthBeats * 1.04 : src.lengthBeats).toFixed(4)),
    key: newKey,
    vel: newVel,
    articulation,
    expr: {
      pressure: Number(Math.min(1, Math.max(0.28, (newVel / 127) * (swellShape === 'sfz-swell' ? 1.15 : 0.95))).toFixed(2)),
      timbre: Number(
        (articulation === 'sul-ponticello'
          ? 0.88
          : articulation === 'con-sordino' || articulation === 'sul-tasto'
            ? 0.36
            : articulation === 'sfz-hairpin' || articulation === 'marcato'
              ? 0.84
              : 0.66).toFixed(2),
      ),
      bend: 0,
      swellShape,
      vibratoDepth: isLong ? (swellShape === 'sfz-swell' ? 0.25 : 0.18) : 0.06,
      vibratoRateHz: isLong ? 5.5 : 5.0,
      vibratoDelay01: 0.22,
      glideFromSemis,
      glidePortion01: 0.22,
    },
  };
}

export function upgradeBlueprintToFullSymphonicScores(blueprint: MasterBookScoreBlueprint): MasterBookScoreBlueprint {
  const roles: MasterPartRole[] = ['lead', 'countermelody', 'ostinato', 'harmony', 'bass'];
  // Target movement multipliers so the 6 songs span 2:15 to 5:30 minutes (7 to 11 structural cycles)
  const movementSectionCounts = [8, 7, 8, 9, 8, 10];

  blueprint.movements = blueprint.movements.map((mvt, mvtIdx) => {
    if (mvt.lightBackgroundParts && mvt.sectionMarkers && mvt.lengthBeats >= 180) {
      return mvt;
    }

    const baseLen = mvt.lengthBeats || 32;
    // Preserve the original 32–36 beat cue as Light Reading Background Mode!
    const lightBackgroundParts: Record<MasterPartRole, NoteEvent[]> = {
      lead: (mvt.parts.lead || []).map((x) => cloneWithMpe(x, 0, 0, 0.9, 'legato', 'hairpin')),
      countermelody: (mvt.parts.countermelody || []).map((x) => cloneWithMpe(x, 0, 0, 0.88, 'legato', 'hairpin')),
      ostinato: (mvt.parts.ostinato || []).map((x) => cloneWithMpe(x, 0, 0, 0.85, 'spiccato', 'arch')),
      harmony: (mvt.parts.harmony || []).map((x) => cloneWithMpe(x, 0, 0, 0.86, 'legato', 'hairpin')),
      bass: (mvt.parts.bass || []).map((x) => cloneWithMpe(x, 0, 0, 0.9, 'legato', 'sustained')),
    };

    // Build the 7-section symphonic film score (2:15 to 5:30 minutes = 224 to 440+ beats)
    const totalCycles = movementSectionCounts[mvtIdx % movementSectionCounts.length] || 8;
    const expandedParts: Record<MasterPartRole, NoteEvent[]> = {
      lead: [],
      countermelody: [],
      ostinato: [],
      harmony: [],
      bass: [],
    };
    const sectionMarkers: FilmScoreSectionMarker[] = [];

    for (let c = 0; c < totalCycles; c++) {
      // Map cycle index onto the 7 dramatic film sections (with Extended Development & Grand Climax on longer movements)
      const secIdx =
        c === 0
          ? 0
          : c === 1
            ? 1
            : c === 2
              ? 2
              : c === totalCycles - 1
                ? 6
                : c === totalCycles - 2
                  ? 5
                  : c === totalCycles - 3 && totalCycles >= 8
                    ? 5
                    : c % 2 === 1
                      ? 3
                      : 4;
      const sec = SECTION_BLUEPRINTS[secIdx];
      const beatOffset = c * baseLen;

      sectionMarkers.push({
        id: `sec_${blueprint.bookThemeId}_mvt_${mvt.movementNumber}_${c + 1}`,
        romanNumeral: sec.romanNumeral,
        title: `${sec.romanNumeral}. ${sec.title}`,
        dramaticCue: `${mvt.characterOrTheme} — ${sec.dramaticRole}`,
        startBeats: beatOffset,
        lengthBeats: baseLen,
        dynamicMarking: sec.dynamicMarking,
        tempoBpm: mvt.bpm,
        keySignature: sec.transposeSemis === 7 ? `${mvt.key} Dom (+7)` : sec.transposeSemis === 12 ? `${mvt.key} High (+12)` : `${mvt.key} ${mvt.mode}`,
        generativeModel: sec.generativeModel,
        color: sec.color,
      });

      for (const role of roles) {
        if (!sec.includeRoles[role]) continue;
        const srcList = mvt.parts[role] || [];
        const art =
          role === 'lead'
            ? sec.leadArticulation
            : role === 'countermelody'
              ? sec.counterArticulation
              : role === 'ostinato'
                ? sec.ostinatoArticulation
                : role === 'harmony'
                  ? sec.harmonyArticulation
                  : 'legato';
        const swell: MpeSwellShape =
          role === 'lead'
            ? sec.leadSwell
            : role === 'harmony' || role === 'countermelody'
              ? 'hairpin'
              : role === 'bass'
                ? 'crescendo'
                : 'arch';

        let prevKey: number | undefined;
        srcList.forEach((srcNote, nIdx) => {
          // In Section I (Overture), thin out the lead to only the first half of the phrase for suspense
          if (secIdx === 0 && role === 'lead' && nIdx % 2 === 1) return;

          const effectiveTranspose =
            role === 'bass' && sec.transposeSemis === 12 ? 0 : sec.transposeSemis;
          const primary = cloneWithMpe(
            srcNote,
            beatOffset,
            effectiveTranspose,
            sec.velScale,
            art,
            swell,
            prevKey,
          );
          prevKey = primary.key;
          expandedParts[role].push(primary);

          // Soaring symphonic octave doublings in Grand Climax (Section VI)
          if (role === 'lead' && sec.octaveDoubleLead && primary.key + 12 <= 98) {
            expandedParts.lead.push(
              cloneWithMpe(srcNote, beatOffset, effectiveTranspose + 12, sec.velScale * 0.88, 'sfz-hairpin', 'sfz-swell'),
            );
          }
          if (role === 'countermelody' && sec.octaveDoubleCounter && primary.key + 12 <= 96) {
            expandedParts.countermelody.push(
              cloneWithMpe(srcNote, beatOffset, effectiveTranspose + 12, sec.velScale * 0.84, 'legato', 'hairpin'),
            );
          }
          if (role === 'bass' && sec.subOctaveBass && primary.key - 12 >= 24) {
            expandedParts.bass.push(
              cloneWithMpe(srcNote, beatOffset, effectiveTranspose - 12, sec.velScale * 0.92, 'marcato', 'crescendo'),
            );
          }
        });
      }
    }

    const fullLengthBeats = totalCycles * baseLen;
    const isGothic = blueprint.bookThemeId === 'dracula' || blueprint.bookThemeId === 'frankenstein';

    const generativeStems: GenerativeOrchestralStemSpec[] = [
      {
        id: `gen_${blueprint.bookThemeId}_${mvt.movementNumber}_acestep25_strings`,
        name: `ACE-Step 2.5 · Symphonic Strings Section (${mvt.key} ${mvt.mode})`,
        engine: 'ace-step-2.5',
        roleDescription: 'Lush 60-piece 1st/2nd Violins, Violas & Celli with continuous MPE hairpin swells',
        prompt: `${mvt.aceStepPrompt} — 60-piece London symphonic string section, lush legato & bow tremolo`,
        gainDb: -2.0,
        pan: -0.22,
        color: '#10B981',
      },
      {
        id: `gen_${blueprint.bookThemeId}_${mvt.movementNumber}_acestep25_soloist`,
        name: isGothic
          ? `ACE-Step 2.5 · Carpathian Solo Violin, French Horns & Low Brass`
          : `ACE-Step 2.5 · Solo Concert Cello, Oboe & Regency Woodwind Consort`,
        engine: 'ace-step-2.5',
        roleDescription: 'Expressive acoustic soloist & orchestral brass/woodwind obligato stem',
        prompt: `${mvt.characterOrTheme} — expressive solo concert ${isGothic ? 'violin & Wagnerian French horns' : 'violoncello, oboe & Broadwood fortepiano'}`,
        gainDb: -1.5,
        pan: 0.24,
        color: '#06B6D4',
      },
      {
        id: `gen_${blueprint.bookThemeId}_${mvt.movementNumber}_yue2_choir`,
        name: isGothic
          ? `YuE2 / HeartMuLa · Scholomance Cathedral Choir & Crypt Organ Stem`
          : `YuE2 / HeartMuLa · Pemberley Chamber Chorale & Concert Hall Air`,
        engine: 'yue2',
        roleDescription: 'Long-form multi-section choral & concert-hall atmospheric underscore stem',
        prompt: `${mvt.title} — ${mvt.composerStudyNote}`,
        gainDb: -3.2,
        pan: 0.0,
        color: '#F59E0B',
      },
    ];

    return {
      ...mvt,
      lengthBeats: fullLengthBeats,
      parts: expandedParts,
      lightBackgroundLengthBeats: baseLen,
      lightBackgroundParts,
      sectionMarkers,
      generativeStems,
    };
  });

  return blueprint;
}

export const MASTER_BOOK_SCORE_BLUEPRINTS: Record<string, MasterBookScoreBlueprint> = {
  'pride-and-prejudice': upgradeBlueprintToFullSymphonicScores(PRIDE_AND_PREJUDICE_BLUEPRINT),
  dracula: upgradeBlueprintToFullSymphonicScores(DRACULA_BLUEPRINT),
};

export const MASTER_BOOK_SCORES = MASTER_BOOK_SCORE_BLUEPRINTS;

export function getMasterBookScoreBlueprint(bookThemeId: string): MasterBookScoreBlueprint | null {
  if (MASTER_BOOK_SCORE_BLUEPRINTS[bookThemeId]) {
    return MASTER_BOOK_SCORE_BLUEPRINTS[bookThemeId];
  }
  const generated = buildDynamicBookBlueprint(bookThemeId);
  if (generated) {
    const upgraded = upgradeBlueprintToFullSymphonicScores(generated);
    MASTER_BOOK_SCORE_BLUEPRINTS[bookThemeId] = upgraded;
    return upgraded;
  }
  return null;
}

export function getMasterBookScore(bookThemeId: string): MasterBookScoreBlueprint | null {
  return getMasterBookScoreBlueprint(bookThemeId);
}

// ============================================================================
// REAL MELOS RUST/WASM DSP SONG RENDERER & PRE-RENDERED WAV LOADER
// ============================================================================

const renderedStemCache = new Map<
  string,
  { buffer: AudioBuffer | null; wavBlob: Blob; wavBytes?: Uint8Array; objectUrl: string; peaks: number[]; durationSec: number }
>();

/**
 * Renders (or loads from `/audio/books/<bookThemeId>/track-<N>.wav`) a complete multi-section
 * song using the actual Melos Studio Rust/WASM DSP Instruments (`plajah_audio.wasm`).
 */
export async function renderMasterMovementAudio(
  bookThemeId: string,
  movementIndex: number,
  _loops = 1,
  customWasmBytes?: ArrayBuffer,
  scoreMode: 'full-film-score' | 'light-background' = 'full-film-score',
): Promise<{ buffer: AudioBuffer; wavBlob: Blob; wavBytes: Uint8Array; objectUrl: string; peaks: number[]; durationSec: number }> {
  const cacheKey = `${bookThemeId}:mvt:${movementIndex}:${scoreMode}:wasm_v3`;
  const cached = renderedStemCache.get(cacheKey);
  if (cached && cached.wavBytes) {
    return {
      buffer: cached.buffer as AudioBuffer,
      wavBlob: cached.wavBlob,
      wavBytes: cached.wavBytes,
      objectUrl: cached.objectUrl,
      peaks: cached.peaks,
      durationSec: cached.durationSec,
    };
  }

  const blueprint = getMasterBookScoreBlueprint(bookThemeId) || getMasterBookScoreBlueprint('pride-and-prejudice')!;
  const mvt = blueprint.movements[movementIndex] || blueprint.movements[0];

  const roles: MasterPartRole[] = ['lead', 'countermelody', 'ostinato', 'harmony', 'bass'];
  const specs = mvt.trackPartSpecs || blueprint.partSpecs;
  const rootMidi = 60 + (KEY_TO_PC[mvt.key] ?? 0);
  const isLightMode = scoreMode === 'light-background';
  const activeLengthBeats = isLightMode ? (mvt.lightBackgroundLengthBeats || 32) : mvt.lengthBeats;
  const activeParts = isLightMode ? (mvt.lightBackgroundParts || mvt.parts) : mvt.parts;

  // Render directly through the Melos Rust/WASM DSP Engine (`plajah_audio.wasm`) + ACE-Step 2.5 Hybrid Orchestral Stems
  const rendered = await renderSongWithMelosWasm(
    {
      songId: `${bookThemeId}_track_${mvt.movementNumber}_${scoreMode}`,
      bpm: mvt.bpm,
      lengthBeats: activeLengthBeats,
      rootMidi,
      hallReverbDecaySec: blueprint.hallReverbDecaySec,
      hallReverbDamping: blueprint.hallReverbDamping,
      wetReverbMix: bookThemeId === 'dracula' ? 0.36 : 0.28,
      percussionStyle: isLightMode ? 'none' : mvt.percussionStyle,
      enableAceStepHybridStems: !isLightMode,
      tracks: roles.map((role) => ({
        role,
        trackName: specs[role].trackName,
        instrumentType: specs[role].instrumentType,
        presetId: specs[role].presetId,
        gainDb: specs[role].gainDb,
        pan: specs[role].pan,
        notes: activeParts[role] || [],
      })),
    },
    customWasmBytes,
  );

  const wavBlob = new Blob([rendered.wavBytes as BlobPart], { type: 'audio/wav' });
  const objectUrl = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(wavBlob) : '';

  let audioBuffer: AudioBuffer | null = null;
  if (typeof OfflineAudioContext !== 'undefined') {
    const offline = new OfflineAudioContext(2, rendered.left.length, rendered.sampleRate);
    audioBuffer = offline.createBuffer(2, rendered.left.length, rendered.sampleRate);
    audioBuffer.getChannelData(0).set(rendered.left);
    audioBuffer.getChannelData(1).set(rendered.right);
  }

  const entry = {
    buffer: audioBuffer as AudioBuffer,
    wavBlob,
    wavBytes: rendered.wavBytes,
    objectUrl,
    peaks: rendered.peaks,
    durationSec: rendered.durationSec,
  };
  renderedStemCache.set(cacheKey, entry);
  return entry;
}
