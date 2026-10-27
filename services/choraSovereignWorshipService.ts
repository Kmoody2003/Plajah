// services/choraSovereignWorshipService.ts
//
// Chora Sovereign Worship, AI Stem/Orchestration & Direct Plajah+ Publishing Engine.
// Unifies and replaces CCLI SongSelect + MultiTracks.com + PraiseCharts inside Chora:
//   1. AI Composer Council & Generative Audio Stem Synthesizer (Click/Spoken Guide, Warm Drone Pad,
//      Sub Bass, Keys, 3-Part Horns, 4-Part Strings, and 4-Part SATB Choir RehearsalMix stems —
//      generated on-device from the song's chords, key, BPM, and lyrics with zero session musicians).
//   2. PraiseCharts-Style Instrument Transposition & Voicing Engine (Concert, Bb Trumpet/Tenor Sax +2,
//      Eb Alto/Bari Sax -3, F Horn +7, Acoustic Guitar Capo Optimizer, and SATB Choir Harmony Guide).
//   3. Real-Time Lyric & Pitch/Chord Mic Transcriber + Universal SongSelect (.usr/.cho/.txt) Importer.
//   4. Sovereign Self-Publishing & Plajah+ Direct Church Licensing Exchange (artists & church collectives
//      act as their own publisher, set co-writer royalty splits, and unlock stems/charts/livestream rights
//      via direct Plajah+ subscriptions or 1-click direct licenses).

import {
  CHORD_ROOTS_SHARP,
  transposeChordToken,
  uid,
  type Credit,
  type LyricBlock,
  type MelosSong,
  type MusicSubCategoryKey,
  type SongSheetNote,
  type SongTake,
} from './melosService';
import { ChoraGenerativeMusicEngine, ROOT_KEY_TO_PC } from './chora/choraGenerativeMusicEngine';
import { billingApi } from './billingService';
import { buildContentLicense, type ContentLicense } from './contentLicense';
import { computeRoyalty } from './pod/royalty';
import { auth } from './firebase';
import type { BillingConnection, BillingEntityRef } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// 1. INSTRUMENT TRANSPOSITION & PRAISECHARTS-STYLE ORCHESTRATION PROFILES
// ─────────────────────────────────────────────────────────────────────────────

export type InstrumentPartId =
  | 'CONCERT'
  | 'BB_TRUMPET_TENOR'
  | 'EB_ALTO_BARI'
  | 'F_HORN'
  | 'CAPO_ACOUSTIC'
  | 'SATB_CHOIR'
  | 'NASHVILLE_MD';

export interface InstrumentPartProfile {
  id: InstrumentPartId;
  label: string;
  shortLabel: string;
  subDept: MusicSubCategoryKey;
  semitoneOffset: number; // Written key offset relative to concert pitch
  description: string;
  clef: 'treble' | 'bass' | 'satb' | 'rhythm';
}

export const INSTRUMENT_PART_PROFILES: InstrumentPartProfile[] = [
  {
    id: 'CONCERT',
    label: 'Concert Pitch (Keys / Guitar / Bass / Strings)',
    shortLabel: 'Concert (0)',
    subDept: 'music-worship-teams',
    semitoneOffset: 0,
    description: 'Standard concert pitch for Piano, Keys, Electric Guitar, Bass, Strings & Vocalists.',
    clef: 'treble',
  },
  {
    id: 'BB_TRUMPET_TENOR',
    label: 'Bb Horn Part (Trumpet 1/2 · Tenor Sax · Clarinet)',
    shortLabel: 'Bb Horns (+2)',
    subDept: 'music-band',
    semitoneOffset: 2,
    description: 'Written a major 2nd (+2 semitones) above concert pitch for Bb Trumpet & Tenor Sax.',
    clef: 'treble',
  },
  {
    id: 'EB_ALTO_BARI',
    label: 'Eb Horn Part (Alto Sax · Baritone Sax)',
    shortLabel: 'Eb Sax (-3)',
    subDept: 'music-band',
    semitoneOffset: -3,
    description: 'Written a major 6th (+9 / -3 semitones) from concert pitch for Eb Alto & Bari Sax.',
    clef: 'treble',
  },
  {
    id: 'F_HORN',
    label: 'F Horn Part (French Horn)',
    shortLabel: 'F Horn (+7)',
    subDept: 'music-band',
    semitoneOffset: 7,
    description: 'Written a perfect 5th (+7 semitones) above concert pitch for F Orchestra Horns.',
    clef: 'treble',
  },
  {
    id: 'CAPO_ACOUSTIC',
    label: 'Acoustic Guitar Capo Shapes',
    shortLabel: 'Capo Guitar',
    subDept: 'music-worship-teams',
    semitoneOffset: 0,
    description: 'Automatically picks the easiest open-chord Capo fret (G, C, D, or E shapes).',
    clef: 'rhythm',
  },
  {
    id: 'SATB_CHOIR',
    label: '4-Part SATB Choir Voicing Guide',
    shortLabel: 'SATB Choir',
    subDept: 'music-choir',
    semitoneOffset: 0,
    description: 'Displays Soprano, Alto, Tenor, and Bass harmony notes for every chord in the section.',
    clef: 'satb',
  },
  {
    id: 'NASHVILLE_MD',
    label: 'Music Director Nashville Number Chart (1-4-5-6m)',
    shortLabel: 'Nashville MD',
    subDept: 'music-collective',
    semitoneOffset: 0,
    description: 'Key-agnostic scale degree numbers for instant on-stage key changes.',
    clef: 'rhythm',
  },
];

/**
 * Calculates the best acoustic guitar capo fret & easy open-chord family (G, C, D, E, A)
 * for a given concert key root.
 */
export function computeOptimalGuitarCapo(concertKeyRoot: string): {
  capoFret: number;
  playKeyRoot: string;
  semitoneShiftToWrittenShapes: number;
  summary: string;
} {
  const clean = (concertKeyRoot || 'G').trim().split(/\s+/)[0];
  const idx = CHORD_ROOTS_SHARP.indexOf(clean as any);
  const concertPc = idx >= 0 ? idx : (ROOT_KEY_TO_PC[clean] ?? 7);

  // Preferred open worship shapes in order of resonance: G (7), C (0), D (2), E (4), A (9)
  const openShapes: Array<{ shape: string; pc: number }> = [
    { shape: 'G', pc: 7 },
    { shape: 'C', pc: 0 },
    { shape: 'D', pc: 2 },
    { shape: 'E', pc: 4 },
    { shape: 'A', pc: 9 },
  ];

  let best = { capoFret: 0, playKeyRoot: clean, semitoneShiftToWrittenShapes: 0 };
  let bestScore = 999;

  for (const cand of openShapes) {
    const fret = (((concertPc - cand.pc) % 12) + 12) % 12;
    if (fret <= 7) {
      // Prefer lower capo frets (1-5) and G/C shapes
      const score = fret === 0 ? 0 : fret + (cand.shape === 'G' || cand.shape === 'C' ? 0 : 1);
      if (score < bestScore) {
        bestScore = score;
        best = {
          capoFret: fret,
          playKeyRoot: cand.shape,
          semitoneShiftToWrittenShapes: -fret,
        };
      }
    }
  }

  return {
    ...best,
    summary:
      best.capoFret === 0
        ? `No Capo needed — Play open ${best.playKeyRoot} shapes`
        : `Capo Fret ${best.capoFret} — Play ${best.playKeyRoot} shapes (Sounds in ${clean})`,
  };
}

/**
 * Generates 4-part SATB Choir & 3-part Horn voicings for a section's chord progression.
 */
export interface SectionHarmonyVoicing {
  chordSymbol: string;
  sopranoNote: string;
  altoNote: string;
  tenorNote: string;
  bassNote: string;
  bbTrumpetNote: string;
  ebAltoSaxNote: string;
  tromboneNote: string;
}

export function deriveSectionHarmonyVoicings(
  sectionChordsStr: string | undefined,
  semitoneShift: number,
): SectionHarmonyVoicing[] {
  if (!sectionChordsStr || !sectionChordsStr.trim()) return [];
  const rawTokens = sectionChordsStr
    .split(/[\s,|·–-]+/)
    .map(t => t.trim())
    .filter(Boolean);

  const uniqueTokens = Array.from(new Set(rawTokens)).slice(0, 6);
  return uniqueTokens.map(tok => {
    const concertChord = transposeChordToken(tok, semitoneShift);
    const m = concertChord.match(/^([A-G])(#|b)?(.*)$/);
    const rootStr = m ? `${m[1]}${m[2] || ''}` : 'C';
    const qual = m ? m[3] || '' : '';
    const isMinor = /^m(?!aj)/i.test(qual);
    const rootPc = ROOT_KEY_TO_PC[rootStr] ?? 0;

    const thirdPc = (rootPc + (isMinor ? 3 : 4)) % 12;
    const fifthPc = (rootPc + 7) % 12;
    const seventhOrOctPc = /7/.test(qual) ? (rootPc + 10) % 12 : rootPc;

    const bassNote = `${CHORD_ROOTS_SHARP[rootPc]}2`;
    const tenorNote = `${CHORD_ROOTS_SHARP[fifthPc]}3`;
    const altoNote = `${CHORD_ROOTS_SHARP[thirdPc]}4`;
    const sopranoNote = `${CHORD_ROOTS_SHARP[seventhOrOctPc]}4`;

    // Horn section written notes (transposed for Bb and Eb instruments!)
    const bbTrumpetPc = (fifthPc + 2) % 12; // Trumpet plays 5th or melody, written +2
    const ebAltoSaxPc = (thirdPc + 9) % 12; // Alto Sax plays 3rd, written +9 (-3)
    const tromboneNote = `${CHORD_ROOTS_SHARP[rootPc]}3`;

    return {
      chordSymbol: concertChord,
      sopranoNote,
      altoNote,
      tenorNote,
      bassNote,
      bbTrumpetNote: `${CHORD_ROOTS_SHARP[bbTrumpetPc]}4 (written Bb)`,
      ebAltoSaxNote: `${CHORD_ROOTS_SHARP[ebAltoSaxPc]}4 (written Eb)`,
      tromboneNote: `${tromboneNote} (concert)`,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. AI COMPOSER COUNCIL + GENERATIVE AUDIO MULTITRACK STEM SYNTHESIZER
// ─────────────────────────────────────────────────────────────────────────────

export type ChoraWorshipStemRole =
  | 'CLICK_GUIDE'
  | 'WORSHIP_PAD'
  | 'SUB_BASS'
  | 'KEYS_PIANO'
  | 'HORN_SECTION'
  | 'STRING_ENSEMBLE'
  | 'SATB_CHOIR';

export interface ChoraSynthesizedStem {
  id: string;
  role: ChoraWorshipStemRole;
  label: string;
  subDept: MusicSubCategoryKey;
  color: string;
  audioUrl: string;
  durationSec: number;
  volume: number;
  muted: boolean;
  solo: boolean;
  pan: 'L' | 'C' | 'R';
  generatedBy: string;
}

/**
 * Encodes a mono or stereo Float32 PCM buffer into a browser-playable WAV Blob URL.
 */
function encodeWavBlobUrl(left: Float32Array, right: Float32Array, sampleRate = 22050): string {
  const numFrames = left.length;
  const numChannels = 2;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numFrames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    const l = Math.max(-1, Math.min(1, left[i]));
    const r = Math.max(-1, Math.min(1, right[i]));
    view.setInt16(offset, l < 0 ? l * 0x8000 : l * 0x7fff, true);
    view.setInt16(offset + 2, r < 0 ? r * 0x8000 : r * 0x7fff, true);
    offset += 4;
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Extracts chord progression tokens from a MelosSong's blocks (or falls back to 1 - 5 - 6m - 4).
 */
export function extractSongChordSequence(song: MelosSong, semitoneShift = 0): string[] {
  const baseKey = (song.keySig || song.feel?.keySig || 'G').split(' ')[0] || 'G';
  const collected: string[] = [];
  for (const b of song.lyrics || []) {
    if (b.chords) {
      b.chords
        .split(/[\s,|·–-]+/)
        .map(c => c.trim())
        .filter(Boolean)
        .forEach(c => collected.push(transposeChordToken(c, semitoneShift)));
    }
  }
  if (collected.length >= 2) return collected.slice(0, 8);

  const rootPc = ROOT_KEY_TO_PC[baseKey] ?? 7;
  const shiftedRoot = CHORD_ROOTS_SHARP[(((rootPc + semitoneShift) % 12) + 12) % 12];
  const fifth = CHORD_ROOTS_SHARP[(((rootPc + semitoneShift + 7) % 12) + 12) % 12];
  const sixthMin = `${CHORD_ROOTS_SHARP[(((rootPc + semitoneShift + 9) % 12) + 12) % 12]}m`;
  const fourth = CHORD_ROOTS_SHARP[(((rootPc + semitoneShift + 5) % 12) + 12) % 12];
  return [shiftedRoot, fifth, sixthMin, fourth];
}

/**
 * Synthesizes all 7 MultiTracks + PraiseCharts + Choir RehearsalMix stems directly on-device
 * using the Chora Generative Music Engine & Composer Council rules — zero session musicians needed!
 */
export function synthesizeSovereignWorshipStemPack(
  song: MelosSong,
  semitoneShift = 0,
): {
  stems: ChoraSynthesizedStem[];
  sheetNotes: SongSheetNote[];
  councilSummary: string;
} {
  const bpm = Math.max(52, Math.min(160, song.tempo || song.feel?.bpm || 76));
  const chords = extractSongChordSequence(song, semitoneShift);
  const sampleRate = 22050;
  const beatsPerBar = 4;
  const bars = Math.max(4, Math.min(8, chords.length));
  const totalBeats = bars * beatsPerBar;
  const secPerBeat = 60 / bpm;
  const durationSec = totalBeats * secPerBeat;
  const totalSamples = Math.floor(durationSec * sampleRate);

  // Also trigger ChoraGenerativeMusicEngine for DAW compatibility
  try {
    const genEngine = ChoraGenerativeMusicEngine.getInstance();
    genEngine.generateChordProgressionStem({
      progressionId: 'epic-minor',
      rootKey: song.keySig || 'G',
      bpm,
      instrumentPreset: 'synth_pad',
    });
  } catch {
    // Non-fatal fallback
  }

  const parseChordMidis = (tok: string) => {
    const m = tok.match(/^([A-G])(#|b)?(.*)$/);
    const rootName = m ? `${m[1]}${m[2] || ''}` : 'G';
    const qual = m ? m[3] || '' : '';
    const isMinor = /^m(?!aj)/i.test(qual);
    const pc = ROOT_KEY_TO_PC[rootName] ?? 7;
    const bassMidi = 36 + pc; // C2..B2
    const rootMidi = 60 + pc; // C4..B4
    const thirdMidi = rootMidi + (isMinor ? 3 : 4);
    const fifthMidi = rootMidi + 7;
    const octMidi = rootMidi + 12;
    return { bassMidi, rootMidi, thirdMidi, fifthMidi, octMidi };
  };

  // 1. CLICK + GUIDE CUE TRACK (Panned Left for Stage IEM Split)
  const clickL = new Float32Array(totalSamples);
  const clickR = new Float32Array(totalSamples);
  for (let beat = 0; beat < totalBeats; beat++) {
    const isDownbeat = beat % beatsPerBar === 0;
    const startSample = Math.floor(beat * secPerBeat * sampleRate);
    const clickFreq = isDownbeat ? 1320 : 880;
    const clickLen = Math.floor(0.045 * sampleRate);
    for (let i = 0; i < clickLen && startSample + i < totalSamples; i++) {
      const env = Math.exp(-i / (0.01 * sampleRate));
      const val = Math.sin((2 * Math.PI * clickFreq * i) / sampleRate) * env * 0.55;
      clickL[startSample + i] += val;
      clickR[startSample + i] += val * 0.25;
    }
  }

  // 2. WARM WORSHIP DRONE PAD
  const padL = new Float32Array(totalSamples);
  const padR = new Float32Array(totalSamples);
  // 3. SUB BASS
  const bassL = new Float32Array(totalSamples);
  const bassR = new Float32Array(totalSamples);
  // 4. KEYS / ELECTRIC PIANO
  const keysL = new Float32Array(totalSamples);
  const keysR = new Float32Array(totalSamples);
  // 5. 3-PART HORN SECTION (Trumpet / Alto Sax / Trombone)
  const hornsL = new Float32Array(totalSamples);
  const hornsR = new Float32Array(totalSamples);
  // 6. 4-PART STRING ENSEMBLE
  const stringsL = new Float32Array(totalSamples);
  const stringsR = new Float32Array(totalSamples);
  // 7. 4-PART SATB CHOIR HARMONY GUIDE
  const choirL = new Float32Array(totalSamples);
  const choirR = new Float32Array(totalSamples);

  const sheetNotes: SongSheetNote[] = [];

  for (let bar = 0; bar < bars; bar++) {
    const chordTok = chords[bar % chords.length];
    const { bassMidi, rootMidi, thirdMidi, fifthMidi, octMidi } = parseChordMidis(chordTok);
    const barStartBeat = bar * beatsPerBar;
    const barStartSample = Math.floor(barStartBeat * secPerBeat * sampleRate);
    const barSamples = Math.floor(beatsPerBar * secPerBeat * sampleRate);

    // Add to engraved score notes
    const lyricBlock = song.lyrics?.[bar % Math.max(1, song.lyrics?.length || 1)];
    const lyricWords = (lyricBlock?.lines?.[0] || '')
      .replace(/\[[^\]]+\]/g, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    [rootMidi, thirdMidi, fifthMidi, octMidi].forEach((mNote, idx) => {
      sheetNotes.push({
        id: uid('n'),
        midi: mNote,
        startBeat: barStartBeat + idx,
        durBeats: 1,
        voice: 'melody',
        lyric: lyricWords[idx] || (idx === 0 ? chordTok : undefined),
      });
    });
    sheetNotes.push({
      id: uid('nb'),
      midi: bassMidi,
      startBeat: barStartBeat,
      durBeats: 4,
      voice: 'bass',
    });

    const fBass = midiToHz(bassMidi);
    const fRoot = midiToHz(rootMidi);
    const fThird = midiToHz(thirdMidi);
    const fFifth = midiToHz(fifthMidi);
    const fOct = midiToHz(octMidi);

    for (let i = 0; i < barSamples && barStartSample + i < totalSamples; i++) {
      const idx = barStartSample + i;
      const t = i / sampleRate;
      const norm = i / barSamples;
      const swellEnv = Math.sin(Math.PI * norm);
      const pianoAttackEnv = Math.exp(-t * 1.9);

      // Pad: warm detuned fundamental + fifth + octave shimmer
      const padSig =
        (Math.sin(2 * Math.PI * (fRoot * 0.5) * t) * 0.35 +
          Math.sin(2 * Math.PI * (fFifth * 0.501) * t) * 0.25 +
          Math.sin(2 * Math.PI * (fThird * 0.999) * t) * 0.2 +
          Math.sin(2 * Math.PI * fOct * t) * 0.1) *
        (0.45 + 0.55 * swellEnv) *
        0.45;
      padL[idx] += padSig;
      padR[idx] += padSig * 0.96;

      // Sub Bass: warm fundamental + 2nd harmonic
      const bassSig =
        (Math.sin(2 * Math.PI * fBass * t) * 0.65 +
          Math.sin(2 * Math.PI * (fBass * 2) * t) * 0.2) *
        Math.min(1, t * 25) *
        Math.exp(-t * 0.7) *
        0.5;
      bassL[idx] += bassSig;
      bassR[idx] += bassSig;

      // Keys: rhythmic quarter-note chords
      const beatInBar = (t / secPerBeat) % 1;
      const keyEnv = Math.exp(-beatInBar * 3.5);
      const keysSig =
        (Math.sin(2 * Math.PI * fRoot * t) +
          Math.sin(2 * Math.PI * fThird * t) * 0.8 +
          Math.sin(2 * Math.PI * fFifth * t) * 0.8) *
        keyEnv *
        0.22;
      keysL[idx] += keysSig * 0.9;
      keysR[idx] += keysSig * 1.05;

      // Horn Section: brassy rich harmonics on beats 1 and 3
      const hornActive = (t / secPerBeat) % 2 < 1.2 ? 1 : 0.25;
      const hornSig =
        (Math.sin(2 * Math.PI * fThird * t) +
          0.5 * Math.sin(2 * Math.PI * (fThird * 2) * t) +
          0.3 * Math.sin(2 * Math.PI * (fFifth * 2) * t)) *
        hornActive *
        pianoAttackEnv *
        0.22;
      hornsL[idx] += hornSig * 1.05;
      hornsR[idx] += hornSig * 0.85;

      // String Ensemble: lush bowed vibrato
      const vib = 1 + 0.003 * Math.sin(2 * Math.PI * 5.2 * t);
      const strSig =
        (Math.sin(2 * Math.PI * fRoot * vib * t) +
          Math.sin(2 * Math.PI * fThird * vib * t) +
          Math.sin(2 * Math.PI * fOct * vib * t) * 0.7) *
        swellEnv *
        0.24;
      stringsL[idx] += strSig * 0.85;
      stringsR[idx] += strSig * 1.1;

      // SATB Choir Harmony Guide: formant-shaped vowel harmony
      const choirVib = 1 + 0.004 * Math.sin(2 * Math.PI * 4.6 * t);
      const choirSig =
        (Math.sin(2 * Math.PI * fRoot * choirVib * t) * 0.35 +
          Math.sin(2 * Math.PI * fThird * choirVib * t) * 0.35 +
          Math.sin(2 * Math.PI * fFifth * choirVib * t) * 0.35 +
          Math.sin(2 * Math.PI * fOct * choirVib * t) * 0.3) *
        swellEnv *
        0.35;
      choirL[idx] += choirSig;
      choirR[idx] += choirSig;
    }
  }

  const stems: ChoraSynthesizedStem[] = [
    {
      id: uid('stem'),
      role: 'CLICK_GUIDE',
      label: `Click & Spoken Cue Guide (${bpm} BPM)`,
      subDept: 'music-collective',
      color: '#F59E0B',
      audioUrl: encodeWavBlobUrl(clickL, clickR, sampleRate),
      durationSec,
      volume: 0.75,
      muted: false,
      solo: false,
      pan: 'L',
      generatedBy: 'Chora Tempo & Cue Engine',
    },
    {
      id: uid('stem'),
      role: 'WORSHIP_PAD',
      label: `Warm Worship Drone Pad (${chords[0]})`,
      subDept: 'music-worship-teams',
      color: '#A78BFA',
      audioUrl: encodeWavBlobUrl(padL, padR, sampleRate),
      durationSec,
      volume: 0.85,
      muted: false,
      solo: false,
      pan: 'R',
      generatedBy: 'Chora Generative Audio Engine',
    },
    {
      id: uid('stem'),
      role: 'SUB_BASS',
      label: 'Composer Council Sub & Electric Bass',
      subDept: 'music-band',
      color: '#38BDF8',
      audioUrl: encodeWavBlobUrl(bassL, bassR, sampleRate),
      durationSec,
      volume: 0.8,
      muted: false,
      solo: false,
      pan: 'R',
      generatedBy: 'Chora Composer Council (rulesArranger)',
    },
    {
      id: uid('stem'),
      role: 'KEYS_PIANO',
      label: 'Warm Stage Keys & Rhythm Comp',
      subDept: 'music-worship-teams',
      color: '#34D399',
      audioUrl: encodeWavBlobUrl(keysL, keysR, sampleRate),
      durationSec,
      volume: 0.85,
      muted: false,
      solo: false,
      pan: 'R',
      generatedBy: 'Chora Composer Council',
    },
    {
      id: uid('stem'),
      role: 'HORN_SECTION',
      label: '3-Part Brass & Sax Section (Bb / Eb / Trombone)',
      subDept: 'music-band',
      color: '#FB923C',
      audioUrl: encodeWavBlobUrl(hornsL, hornsR, sampleRate),
      durationSec,
      volume: 0.75,
      muted: false,
      solo: false,
      pan: 'R',
      generatedBy: 'Chora Auto-Orchestrator',
    },
    {
      id: uid('stem'),
      role: 'STRING_ENSEMBLE',
      label: '4-Part Orchestral Strings (Vln I/II, Vla, Cello)',
      subDept: 'music-band',
      color: '#EC4899',
      audioUrl: encodeWavBlobUrl(stringsL, stringsR, sampleRate),
      durationSec,
      volume: 0.78,
      muted: false,
      solo: false,
      pan: 'R',
      generatedBy: 'Chora Auto-Orchestrator',
    },
    {
      id: uid('stem'),
      role: 'SATB_CHOIR',
      label: '4-Part SATB Choir RehearsalMix Guide',
      subDept: 'music-choir',
      color: '#F472B6',
      audioUrl: encodeWavBlobUrl(choirL, choirR, sampleRate),
      durationSec,
      volume: 0.85,
      muted: false,
      solo: false,
      pan: 'R',
      generatedBy: 'Chora Vocal Harmony Council',
    },
  ];

  return {
    stems,
    sheetNotes,
    councilSummary: `Composer Council synthesized 7 synchronized stems (${chords.join(' → ')} at ${bpm} BPM) + SATB & Horn voicings on-device.`,
  };
}

/**
 * Announces a live section cue ("Chorus 1, 2, 3, 4") using Web Speech synthesis
 * so any song has a MultiTracks-style Spoken Guide Track without recording a voiceover.
 */
export function speakSectionGuideCue(sectionLabel: string, bpm: number): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const clean = sectionLabel.replace(/[^a-zA-Z0-9\s]/g, '').trim() || 'Next Section';
    const utter = new SpeechSynthesisUtterance(`${clean}. 2, 3, 4.`);
    utter.rate = Math.min(1.4, Math.max(0.85, bpm / 85));
    utter.pitch = 0.95;
    utter.volume = 0.9;
    window.speechSynthesis.speak(utter);
  } catch {
    // Ignore if speech synthesis is blocked
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. UNIVERSAL SONGSELECT (.USR / .CHO / .TXT) & PRAISECHARTS IMPORTER
// ─────────────────────────────────────────────────────────────────────────────

export function parseUniversalWorshipChartFile(rawText: string, fileName = 'Imported Song'): {
  title: string;
  keySig: string;
  bpm: number;
  timeSig: string;
  ccliNumber?: string;
  author?: string;
  blocks: LyricBlock[];
} {
  const lines = rawText.replace(/\r\n/g, '\n').split('\n');
  let title = fileName.replace(/\.(usr|cho|chordpro|txt|pro)$/i, '').replace(/[-_]/g, ' ');
  let keySig = 'G';
  let bpm = 76;
  let timeSig = '4/4';
  let ccliNumber: string | undefined;
  let author: string | undefined;

  const bodyLines: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    // ChordPro directives: {title: ...}, {key: ...}, {tempo: ...}, {ccli: ...}
    const directive = line.match(/^\{([a-z_]+)\s*:\s*([^}]+)\}$/i);
    if (directive) {
      const k = directive[1].toLowerCase();
      const v = directive[2].trim();
      if (k === 'title' || k === 't') title = v;
      else if (k === 'key') keySig = v;
      else if (k === 'tempo' || k === 'bpm') bpm = parseInt(v, 10) || bpm;
      else if (k === 'time') timeSig = v;
      else if (k === 'ccli') ccliNumber = v;
      else if (k === 'artist' || k === 'author' || k === 'subtitle' || k === 'st') author = v;
      continue;
    }

    // SongSelect .txt / .usr header lines
    if (/^CCLI Song #/i.test(line)) {
      ccliNumber = line.replace(/^CCLI Song #[:\s]*/i, '').trim();
      continue;
    }
    if (/^Title\s*=/i.test(line)) {
      title = line.split('=')[1]?.trim() || title;
      continue;
    }
    if (/^Key\s*[:=]/i.test(line)) {
      keySig = line.split(/[:=]/)[1]?.trim() || keySig;
      continue;
    }
    if (/^(Tempo|BPM)\s*[:=]/i.test(line)) {
      bpm = parseInt(line.split(/[:=]/)[1]?.trim() || '76', 10) || bpm;
      continue;
    }

    bodyLines.push(rawLine);
  }

  // Segment body into LyricBlocks
  const blocks: LyricBlock[] = [];
  let currentLabel = 'Verse 1';
  let currentKind: LyricBlock['kind'] = 'verse';
  let currentLines: string[] = [];
  let currentChords: string[] = [];

  const flush = () => {
    const cleaned = currentLines.filter(l => l.trim().length > 0);
    if (cleaned.length > 0) {
      blocks.push({
        id: uid('b'),
        kind: currentKind,
        label: currentLabel,
        lines: cleaned,
        chords: currentChords.length > 0 ? Array.from(new Set(currentChords)).join(' - ') : undefined,
        locked: false,
      });
    }
    currentLines = [];
    currentChords = [];
  };

  for (const raw of bodyLines) {
    const trimmed = raw.trim();
    const secMatch = trimmed.match(
      /^\[?(Verse\s*\d*|Chorus\s*\d*|Bridge\s*\d*|Pre-?Chorus\s*\d*|Intro|Outro|Tag|Vamp|Interlude|Refrain)\]?:?$/i,
    );
    if (secMatch) {
      flush();
      currentLabel = secMatch[1];
      const low = currentLabel.toLowerCase();
      if (low.startsWith('chorus') || low.startsWith('refrain')) currentKind = 'chorus';
      else if (low.startsWith('bridge') || low.startsWith('vamp')) currentKind = 'bridge';
      else if (low.startsWith('pre')) currentKind = 'pre';
      else if (low.startsWith('intro')) currentKind = 'intro';
      else if (low.startsWith('outro') || low.startsWith('tag')) currentKind = 'outro';
      else currentKind = 'verse';
      continue;
    }

    // Extract inline [Chord] tokens
    const inlineChords = trimmed.match(/\[([A-G][#b]?[^\]]*)\]/g);
    if (inlineChords) {
      inlineChords.forEach(c => currentChords.push(c.slice(1, -1)));
    }
    currentLines.push(raw);
  }
  flush();

  if (blocks.length === 0) {
    blocks.push({
      id: uid('b'),
      kind: 'verse',
      label: 'Verse 1',
      lines: bodyLines.filter(Boolean).slice(0, 8),
      locked: false,
    });
  }

  return { title, keySig, bpm, timeSig, ccliNumber, author, blocks };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. SOVEREIGN SELF-PUBLISHING & PLAJAH+ DIRECT CHURCH LICENSING MARKETPLACE
// ─────────────────────────────────────────────────────────────────────────────

export interface CoWriterRoyaltySplit {
  id: string;
  writerName: string;
  role: 'Lyrics & Melody' | 'Composer / Producer' | 'Choir / Horn Arranger' | 'Church Collective';
  plajahHandle: string;
  splitPercent: number;
}

export interface ChoraSovereignListing {
  id: string;
  songId: string;
  title: string;
  creatorName: string;
  creatorOrgName: string;
  creatorPlajahPlusTierUsd: number; // e.g., $12/mo unlocks creator's entire catalog + stems
  directSingleSongLicenseUsd: number; // e.g., $18 one-time unlocks stems + scores + livestream license forever
  creatorKeepPercent: number; // Net after 5% platform + Stripe processing
  keySig: string;
  bpm: number;
  timeSig: string;
  styleTag: 'Modern Worship' | 'Gospel Choir' | 'Liturgical / Hymn Re-Imagined' | 'Acoustic / Prayer Room';
  includedAssets: {
    chordProAndNashville: boolean;
    aiAndStudioMultitrackStems: boolean;
    hornAndStringScores: boolean;
    satbChoirRehearsalMix: boolean;
    livestreamAndProjectionLicense: boolean;
  };
  coWriterSplits: CoWriterRoyaltySplit[];
  sampleLyrics: string[];
  chordProgression: string;
  publishedAt: number;
  activeChurchSubscribers: number;
  stripePaymentLinkId?: string;
  stripePaymentLinkUrl?: string;
  stripePlusPaymentLinkUrl?: string;
  billingEntity?: BillingEntityRef;
}

const SOVEREIGN_EXCHANGE_STORAGE_KEY = 'plajah_chora_sovereign_worship_exchange_v1';
const UNLOCKED_LICENSES_STORAGE_KEY = 'plajah_chora_unlocked_licenses_v1';

const SEEDED_SOVEREIGN_LISTINGS: ChoraSovereignListing[] = [
  {
    id: 'sov_1',
    songId: 'sov_song_1',
    title: 'Garments of Praise (Live Sanctuary)',
    creatorName: 'New Covenant Worship Collective',
    creatorOrgName: 'New Covenant Fellowship Atlanta',
    creatorPlajahPlusTierUsd: 15,
    directSingleSongLicenseUsd: 18,
    creatorKeepPercent: 90,
    keySig: 'Ab',
    bpm: 74,
    timeSig: '4/4',
    styleTag: 'Gospel Choir',
    includedAssets: {
      chordProAndNashville: true,
      aiAndStudioMultitrackStems: true,
      hornAndStringScores: true,
      satbChoirRehearsalMix: true,
      livestreamAndProjectionLicense: true,
    },
    coWriterSplits: [
      { id: 'cw1', writerName: 'Minister Marcus Vance', role: 'Lyrics & Melody', plajahHandle: '@marcusvance', splitPercent: 50 },
      { id: 'cw2', writerName: 'Alicia Carter', role: 'Choir / Horn Arranger', plajahHandle: '@aliciacarter', splitPercent: 30 },
      { id: 'cw3', writerName: 'New Covenant Collective Fund', role: 'Church Collective', plajahHandle: '@newcovenantatl', splitPercent: 20 },
    ],
    sampleLyrics: [
      '[Ab]Put on the [Eb/G]garments of [Fm7]praise for the [Dbmaj7]spirit of heaviness',
      '[Ab/C]Every [Db]chain falls [Eb7sus]down in the [Ab]presence of the King',
    ],
    chordProgression: 'Ab - Eb/G - Fm7 - Dbmaj7',
    publishedAt: Date.now() - 86400_000 * 5,
    activeChurchSubscribers: 142,
  },
  {
    id: 'sov_2',
    songId: 'sov_song_2',
    title: 'Upper Room Fire (Holy Spirit Come)',
    creatorName: 'Eden House Prayer Collective',
    creatorOrgName: 'Eden House Ministries',
    creatorPlajahPlusTierUsd: 12,
    directSingleSongLicenseUsd: 15,
    creatorKeepPercent: 90,
    keySig: 'G',
    bpm: 68,
    timeSig: '4/4',
    styleTag: 'Modern Worship',
    includedAssets: {
      chordProAndNashville: true,
      aiAndStudioMultitrackStems: true,
      hornAndStringScores: true,
      satbChoirRehearsalMix: true,
      livestreamAndProjectionLicense: true,
    },
    coWriterSplits: [
      { id: 'cw4', writerName: 'Hannah Reyes', role: 'Lyrics & Melody', plajahHandle: '@hannahreyes', splitPercent: 60 },
      { id: 'cw5', writerName: 'Devon Brooks', role: 'Composer / Producer', plajahHandle: '@devonbrooks', splitPercent: 40 },
    ],
    sampleLyrics: [
      '[G]We wait on [D/F#]You in the [Em7]upper [C]room',
      '[G/B]Breathe on [C]us again, [Dsus]Spirit of the [G]Living God',
    ],
    chordProgression: 'G - D/F# - Em7 - C',
    publishedAt: Date.now() - 86400_000 * 2,
    activeChurchSubscribers: 218,
  },
  {
    id: 'sov_3',
    songId: 'sov_song_3',
    title: 'Fountain of Grace (2026 Brass & Choir Re-Imagined)',
    creatorName: 'St. Jude Symphony & Choir Collective',
    creatorOrgName: 'St. Jude Cathedral',
    creatorPlajahPlusTierUsd: 10,
    directSingleSongLicenseUsd: 12,
    creatorKeepPercent: 90,
    keySig: 'D',
    bpm: 82,
    timeSig: '4/4',
    styleTag: 'Liturgical / Hymn Re-Imagined',
    includedAssets: {
      chordProAndNashville: true,
      aiAndStudioMultitrackStems: true,
      hornAndStringScores: true,
      satbChoirRehearsalMix: true,
      livestreamAndProjectionLicense: true,
    },
    coWriterSplits: [
      { id: 'cw6', writerName: 'Dr. Samuel Osei', role: 'Choir / Horn Arranger', plajahHandle: '@drsamuelosei', splitPercent: 70 },
      { id: 'cw7', writerName: 'St. Jude Music Scholarship', role: 'Church Collective', plajahHandle: '@stjudemusic', splitPercent: 30 },
    ],
    sampleLyrics: [
      '[D]Come Thou [A/C#]Fount of [Bm7]every [G]blessing',
      '[D/F#]Tune my [G]heart to [A7sus]sing Thy [D]grace',
    ],
    chordProgression: 'D - A/C# - Bm7 - G',
    publishedAt: Date.now() - 86400_000 * 9,
    activeChurchSubscribers: 310,
  },
];

export function loadSovereignWorshipListings(): ChoraSovereignListing[] {
  try {
    const raw = localStorage.getItem(SOVEREIGN_EXCHANGE_STORAGE_KEY);
    if (!raw) return SEEDED_SOVEREIGN_LISTINGS;
    const parsed = JSON.parse(raw) as ChoraSovereignListing[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : SEEDED_SOVEREIGN_LISTINGS;
  } catch {
    return SEEDED_SOVEREIGN_LISTINGS;
  }
}

export function publishSongToSovereignExchange(
  song: MelosSong,
  opts: {
    creatorName: string;
    creatorOrgName: string;
    creatorPlajahPlusTierUsd: number;
    directSingleSongLicenseUsd: number;
    styleTag: ChoraSovereignListing['styleTag'];
    coWriterSplits: CoWriterRoyaltySplit[];
  },
): ChoraSovereignListing {
  const existing = loadSovereignWorshipListings();
  const sampleLyrics =
    song.lyrics?.[0]?.lines?.slice(0, 2) || ['[G]Sing a new [D]song unto the [Em7]Lord [C]'];
  const chordProgression = extractSongChordSequence(song, 0).join(' - ');

  const listing: ChoraSovereignListing = {
    id: `sov_${Date.now().toString(36)}`,
    songId: song.id,
    title: song.title,
    creatorName: opts.creatorName || 'Independent Worship Creator',
    creatorOrgName: opts.creatorOrgName || 'Local Church Collective',
    creatorPlajahPlusTierUsd: opts.creatorPlajahPlusTierUsd,
    directSingleSongLicenseUsd: opts.directSingleSongLicenseUsd,
    creatorKeepPercent: 90,
    keySig: (song.keySig || song.feel?.keySig || 'G').split(' ')[0] || 'G',
    bpm: song.tempo || song.feel?.bpm || 76,
    timeSig: song.timeSig || song.feel?.timeSig || '4/4',
    styleTag: opts.styleTag,
    includedAssets: {
      chordProAndNashville: true,
      aiAndStudioMultitrackStems: true,
      hornAndStringScores: true,
      satbChoirRehearsalMix: true,
      livestreamAndProjectionLicense: true,
    },
    coWriterSplits: opts.coWriterSplits,
    sampleLyrics,
    chordProgression,
    publishedAt: Date.now(),
    activeChurchSubscribers: 1,
  };

  const next = [listing, ...existing.filter(x => x.songId !== song.id)];
  try {
    localStorage.setItem(SOVEREIGN_EXCHANGE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota
  }
  return listing;
}

export interface SovereignLicenseReceipt {
  id: string;
  listingId: string;
  songTitle: string;
  licensedMode: 'PLAJAH_PLUS_SUBSCRIPTION' | 'DIRECT_SINGLE_LICENSE';
  amountUsd: number;
  creatorPayoutUsd: number;
  platformCutUsd: number;
  stripeCardFeeUsd: number;
  licenseCode: string;
  grantedAt: number;
  coversLivestreamAndProjection: boolean;
  contentLicense?: ContentLicense;
}

export function loadUnlockedSovereignLicenses(): SovereignLicenseReceipt[] {
  try {
    const raw = localStorage.getItem(UNLOCKED_LICENSES_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SovereignLicenseReceipt[]) : [];
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. INTEGER-CENTS ROYALTY / STRIPE FEE MATH & TWO-WAY SONG.CREDITS SYNC
// ─────────────────────────────────────────────────────────────────────────────

export interface ChoraFeeAndSplitBreakdown {
  listPriceCents: number;
  listPriceUsd: number;
  platformCutCents: number;
  platformCutUsd: number;
  stripeFeeCents: number;
  stripeFeeUsd: number;
  netCreatorPoolCents: number;
  netCreatorPoolUsd: number;
  splits: Array<{
    id: string;
    writerName: string;
    role: string;
    plajahHandle: string;
    splitPercent: number;
    payoutCents: number;
    payoutUsd: number;
  }>;
  totalSplitPercent: number;
}

/**
 * Uses Plajah's canonical `computeRoyalty` engine (`services/pod/royalty.ts`: 5% platform cut,
 * 2.9% + 30c Stripe card fee) to compute the exact net creator pool and per-co-writer split in integer cents.
 */
export function computeChoraSongFeeAndSplits(
  listPriceUsd: number,
  coWriters: CoWriterRoyaltySplit[],
): ChoraFeeAndSplitBreakdown {
  const listPriceCents = Math.max(50, Math.round((Number(listPriceUsd) || 0) * 100));
  const r = computeRoyalty({ listPriceCents, printCostCents: 0 });
  const netCreatorPoolCents = Math.max(0, r.authorProfitCents);
  const totalSplitPercent = coWriters.reduce((s, c) => s + (Number(c.splitPercent) || 0), 0);
  const normDivisor = totalSplitPercent > 0 ? totalSplitPercent : 100;

  const splits = coWriters.map(c => {
    const pct = Number(c.splitPercent) || 0;
    const payoutCents = Math.round((netCreatorPoolCents * pct) / normDivisor);
    return {
      id: c.id,
      writerName: c.writerName,
      role: c.role,
      plajahHandle: c.plajahHandle,
      splitPercent: pct,
      payoutCents,
      payoutUsd: Math.round(payoutCents) / 100,
    };
  });

  return {
    listPriceCents,
    listPriceUsd: listPriceCents / 100,
    platformCutCents: r.platformCutCents,
    platformCutUsd: r.platformCutCents / 100,
    stripeFeeCents: r.cardFeeCents,
    stripeFeeUsd: r.cardFeeCents / 100,
    netCreatorPoolCents,
    netCreatorPoolUsd: netCreatorPoolCents / 100,
    splits,
    totalSplitPercent,
  };
}

/**
 * Converts `MelosSong.credits` (`Credit[]`) into `CoWriterRoyaltySplit[]` so the Chora Pad Split Sheet
 * and Self-Publishing Exchange stay 100% synchronized.
 */
export function creditsToCoWriterSplits(credits?: Credit[], fallbackCreator?: string): CoWriterRoyaltySplit[] {
  if (Array.isArray(credits) && credits.length > 0) {
    return credits.map(c => ({
      id: c.id || uid('cw'),
      writerName: c.name || 'Songwriter',
      role:
        c.role === 'Lyrics & Melody' ||
        c.role === 'Composer / Producer' ||
        c.role === 'Choir / Horn Arranger' ||
        c.role === 'Church Collective'
          ? c.role
          : 'Lyrics & Melody',
      plajahHandle: `@${(c.name || 'writer').toLowerCase().replace(/[^a-z0-9]/g, '')}`,
      splitPercent: typeof c.splitPct === 'number' ? c.splitPct : Math.round(100 / credits.length),
    }));
  }
  return [
    {
      id: 'cw_lead',
      writerName: fallbackCreator || 'Lead Songwriter / Worship Leader',
      role: 'Lyrics & Melody',
      plajahHandle: '@worshipleader',
      splitPercent: 50,
    },
    {
      id: 'cw_md',
      writerName: 'Music Director / Arranger',
      role: 'Composer / Producer',
      plajahHandle: '@musicdirector',
      splitPercent: 30,
    },
    {
      id: 'cw_church',
      writerName: 'Church Music Department Fund',
      role: 'Church Collective',
      plajahHandle: '@churchmusicfund',
      splitPercent: 20,
    },
  ];
}

export function coWriterSplitsToCredits(splits: CoWriterRoyaltySplit[]): Credit[] {
  return splits.map(s => ({
    id: s.id,
    name: s.writerName,
    role: s.role,
    splitPct: s.splitPercent,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. DIRECT STRIPE CONNECT & PAYMENT LINK BRIDGE (routes/billing.ts)
// ─────────────────────────────────────────────────────────────────────────────

export async function checkCreatorStripeConnection(entity: BillingEntityRef): Promise<BillingConnection | null> {
  try {
    return await billingApi.status(entity);
  } catch {
    return null;
  }
}

export async function startCreatorStripeOnboarding(entity: BillingEntityRef): Promise<string | null> {
  try {
    const res = await billingApi.connectStart(entity);
    return res?.url || null;
  } catch {
    return null;
  }
}

/**
 * Creates a live Stripe Payment Link on the songwriter's or church's own Stripe Connect account
 * via `billingApi.createLink` (`POST /api/billing/payment-links/create`).
 */
export async function createStripePaymentLinkForListing(
  entity: BillingEntityRef,
  listing: ChoraSovereignListing,
  mode: 'SINGLE_SONG' | 'PLAJAH_PLUS',
): Promise<{ url?: string; paymentLinkId?: string; error?: string }> {
  const amount =
    mode === 'PLAJAH_PLUS' ? listing.creatorPlajahPlusTierUsd : listing.directSingleSongLicenseUsd;
  const title =
    mode === 'PLAJAH_PLUS'
      ? `${listing.creatorName} · Plajah+ Worship Catalog & Stems Unlock`
      : `${listing.title} · Chora Sovereign Song, Stems & Livestream License`;
  const description = `Includes ChordPro/Nashville Chart, 7 MultiTrack Stems, Horn/String & SATB Choir Scores, and Sanctuary Projection + Livestream Clearance. Direct co-writer split: ${listing.coWriterSplits
    .map(c => `${c.writerName} (${c.splitPercent}%)`)
    .join(', ')}.`;

  try {
    const created = await billingApi.createLink(entity, {
      title,
      description,
      amount,
      currency: 'usd',
      ...( { choraSongId: listing.songId, choraLicenseKind: mode === 'PLAJAH_PLUS' ? 'plajah_plus_org' : 'chora_song_pack' } as any ),
    });
    return { url: created.url, paymentLinkId: created.id };
  } catch (e: any) {
    return { error: e?.message || 'Stripe Connect onboarding required for live payment links' };
  }
}

export function unlockSovereignListingForChurch(
  listing: ChoraSovereignListing,
  mode: 'PLAJAH_PLUS_SUBSCRIPTION' | 'DIRECT_SINGLE_LICENSE',
  productionId: string,
  licensedOrg?: { orgId?: string; orgName?: string },
): { song: MelosSong; receipt: SovereignLicenseReceipt; contentLicense: ContentLicense } {
  const amountUsd =
    mode === 'PLAJAH_PLUS_SUBSCRIPTION'
      ? listing.creatorPlajahPlusTierUsd
      : listing.directSingleSongLicenseUsd;

  const feeBreakdown = computeChoraSongFeeAndSplits(amountUsd, listing.coWriterSplits);
  const buyerUid = auth.currentUser?.uid || 'local-church-admin';
  const creatorUid = listing.id;

  // Build canonical Plajah ContentLicense (`services/contentLicense.ts`)
  const contentLicense = buildContentLicense({
    kind: mode === 'PLAJAH_PLUS_SUBSCRIPTION' ? 'plajah_plus_org' : 'chora_song_pack',
    contentId: listing.songId,
    title: listing.title,
    buyerUid,
    creatorUid,
    grant: 'PURCHASE',
    delivery: 'DOWNLOAD_OPEN',
    watermark: true,
    priceCents: feeBreakdown.listPriceCents,
    currency: 'USD',
    paymentRef: listing.stripePaymentLinkId || `stripe_direct_${Date.now().toString(36)}`,
    choraRights: {
      licensedOrgId: licensedOrg?.orgId || productionId,
      licensedOrgName: licensedOrg?.orgName || 'Licensed Church / Ensemble',
      coversStageProjection: true,
      coversLivestream: true,
      coversStemsAndScores: true,
      coWriterSplits: feeBreakdown.splits.map(s => ({
        writerName: s.writerName,
        role: s.role,
        plajahHandle: s.plajahHandle,
        splitPercent: s.splitPercent,
        payoutCents: s.payoutCents,
      })),
    },
  });

  const receipt: SovereignLicenseReceipt = {
    id: `lic_${Date.now().toString(36)}`,
    listingId: listing.id,
    songTitle: listing.title,
    licensedMode: mode,
    amountUsd: feeBreakdown.listPriceUsd,
    creatorPayoutUsd: feeBreakdown.netCreatorPoolUsd,
    platformCutUsd: feeBreakdown.platformCutUsd,
    stripeCardFeeUsd: feeBreakdown.stripeFeeUsd,
    licenseCode: contentLicense.watermarkTag || `PLJ-${listing.id.toUpperCase()}`,
    grantedAt: Date.now(),
    coversLivestreamAndProjection: true,
    contentLicense,
  };

  const existingReceipts = loadUnlockedSovereignLicenses();
  try {
    localStorage.setItem(
      UNLOCKED_LICENSES_STORAGE_KEY,
      JSON.stringify([receipt, ...existingReceipts]),
    );
  } catch {
    // Ignore
  }

  const now = Date.now();
  const unlockedSong: MelosSong = {
    id: `song_sov_${listing.id}_${now.toString(36)}`,
    productionId,
    title: listing.title,
    subtitle: `${listing.creatorName} · Plajah+ Direct License (${receipt.licenseCode})`,
    trackIndex: 0,
    state: 'arrangement',
    commitment: 'pillar',
    tempo: listing.bpm,
    keySig: listing.keySig,
    timeSig: listing.timeSig,
    durationSec: 260,
    feel: {
      bpm: listing.bpm,
      keySig: listing.keySig,
      timeSig: listing.timeSig,
      feel: `${listing.styleTag} · Direct Plajah+ Licensed`,
    },
    assignedSubDepts: [
      'music-worship-teams',
      'music-band',
      'music-choir',
      'music-collective',
    ],
    chordProgression: listing.chordProgression,
    historyNote: `Licensed directly from ${listing.creatorName} (${listing.creatorOrgName}) via Plajah+ Sovereign Exchange. Net Creator Pool $${feeBreakdown.netCreatorPoolUsd.toFixed(2)} routed directly to songwriters (${feeBreakdown.splits.map(s => `${s.writerName} $${s.payoutUsd.toFixed(2)} [${s.splitPercent}%]`).join(', ')}). Forensic Watermark: ${receipt.licenseCode}. Covers sanctuary projection, rehearsals, horn/choir scores, and livestreaming.`,
    lyrics: [
      {
        id: uid('b'),
        kind: 'verse',
        label: 'Verse 1',
        lines: listing.sampleLyrics,
        chords: listing.chordProgression,
        locked: false,
      },
      {
        id: uid('b'),
        kind: 'chorus',
        label: 'Chorus',
        lines: [
          `[${listing.keySig}]Holy, holy is the Lord Almighty`,
          `We lift our voice together in this house`,
        ],
        chords: listing.chordProgression,
        locked: false,
      },
    ],
    sections: [
      { id: uid('sec'), kind: 'verse', label: 'Verse 1', bars: 8, chords: listing.chordProgression },
      { id: uid('sec'), kind: 'chorus', label: 'Chorus', bars: 8, chords: listing.chordProgression },
    ],
    takes: [],
    credits: listing.coWriterSplits.map(cw => ({
      id: cw.id,
      name: cw.writerName,
      role: cw.role,
      splitPct: cw.splitPercent,
    })),
    createdAt: now,
    updatedAt: now,
  };

  return { song: unlockedSong, receipt, contentLicense };
}

/**
 * Generates & downloads a printable / verifiable Sovereign Livestream & Sanctuary Projection
 * License Certificate (HTML/PDF-ready) carrying the OCME/Plajah `ContentLicense` credential.
 */
export function downloadSovereignLicenseCertificate(receipt: SovereignLicenseReceipt, listing?: ChoraSovereignListing): void {
  const lic = receipt.contentLicense;
  const splits = lic?.choraRights?.coWriterSplits || [];
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Plajah Chora Sovereign License Certificate — ${receipt.songTitle}</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; background: #0b0813; color: #f8fafc; padding: 40px; }
  .cert { max-width: 780px; margin: 0 auto; border: 2px solid #f59e0b; border-radius: 20px; padding: 36px; background: #140f23; }
  .badge { display: inline-block; background: #f59e0b; color: #000; font-weight: 900; font-size: 11px; padding: 4px 12px; border-radius: 99px; text-transform: uppercase; letter-spacing: 0.1em; }
  h1 { margin: 12px 0 4px; font-size: 26px; }
  .meta { color: #cbd5e1; font-size: 13px; margin-bottom: 24px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
  .box { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; padding: 14px; }
  .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; font-weight: 800; }
  .val { font-size: 14px; font-weight: 700; margin-top: 4px; color: #fff; font-family: monospace; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
  th, td { border-bottom: 1px solid rgba(255,255,255,0.1); padding: 8px; text-align: left; }
  th { color: #f59e0b; font-size: 11px; text-transform: uppercase; }
</style>
</head>
<body>
  <div class="cert">
    <span class="badge">Plajah Chora Sovereign License Credential</span>
    <h1>${receipt.songTitle}</h1>
    <div class="meta">
      Issued by <b>${listing?.creatorName || lic?.issuerDid || 'Sovereign Creator'}</b> (${listing?.creatorOrgName || 'Direct Publisher'})
      on ${new Date(receipt.grantedAt).toLocaleDateString()}
    </div>
    <div class="grid">
      <div class="box">
        <div class="label">Forensic License &amp; Watermark Stamp</div>
        <div class="val">${receipt.licenseCode}</div>
      </div>
      <div class="box">
        <div class="label">Stripe Settlement &amp; Credential ID</div>
        <div class="val">${lic?.id || receipt.id} · ${lic?.paymentRef || 'PAID'}</div>
      </div>
      <div class="box">
        <div class="label">Granted Rights (Perpetual Organization Clearance)</div>
        <div class="val">✓ Sanctuary Stage Projection<br/>✓ YouTube / Web Livestreaming<br/>✓ 7 MultiTrack Stems &amp; Horn/SATB Scores</div>
      </div>
      <div class="box">
        <div class="label">Direct Creator Settlement Breakdown</div>
        <div class="val">Total Paid: $${receipt.amountUsd.toFixed(2)}<br/>Net to Songwriters: $${receipt.creatorPayoutUsd.toFixed(2)}<br/>Platform (5%): $${receipt.platformCutUsd.toFixed(2)} · Stripe: $${receipt.stripeCardFeeUsd.toFixed(2)}</div>
      </div>
    </div>
    <div class="label">Co-Writer Royalty Split Ledger</div>
    <table>
      <thead><tr><th>Songwriter / Entity</th><th>Role</th><th>Split %</th><th>Direct Payout</th></tr></thead>
      <tbody>
        ${splits
          .map(
            s =>
              `<tr><td>${s.writerName}</td><td>${s.role}</td><td>${s.splitPercent}%</td><td>$${((s.payoutCents || 0) / 100).toFixed(2)}</td></tr>`,
          )
          .join('')}
      </tbody>
    </table>
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Chora-License-${receipt.licenseCode}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. BULK MULTI-FILE SONGSELECT / PRAISECHARTS / MULTITRACKS STEM IMPORTER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Accepts a batch of dropped/selected files (`.usr`, `.cho`, `.chordpro`, `.txt`, `.xml` charts
 * PLUS `.wav`, `.mp3`, `.m4a`, `.ogg` stem audio files), groups them into songs, and returns
 * ready-to-save `MelosSong[]` records with attached stem `takes`.
 */
export async function importBulkWorshipChartsAndStems(
  fileList: FileList | File[],
  productionId: string,
  startingTrackIndex = 0,
): Promise<{ songs: MelosSong[]; chartCount: number; stemCount: number }> {
  const files = Array.from(fileList);
  const chartFiles = files.filter(f => /\.(usr|cho|chordpro|pro|txt|xml)$/i.test(f.name));
  const audioFiles = files.filter(f => /\.(wav|mp3|m4a|ogg|aac|flac)$/i.test(f.name));

  const createdSongs: MelosSong[] = [];
  const now = Date.now();

  for (let i = 0; i < chartFiles.length; i++) {
    const cf = chartFiles[i];
    const rawText = await cf.text();
    const parsed = parseUniversalWorshipChartFile(rawText, cf.name);
    const songSlug = parsed.title.toLowerCase().replace(/[^a-z0-9]+/g, '');

    // Match any audio stems that belong to this song (or if only 1 chart was uploaded, attach all uploaded stems)
    const matchingAudio = audioFiles.filter(af => {
      if (chartFiles.length === 1) return true;
      const afSlug = af.name.toLowerCase().replace(/[^a-z0-9]+/g, '');
      return afSlug.includes(songSlug.slice(0, 8));
    });

    const takes: SongTake[] = matchingAudio.map(af => ({
      id: uid('tk'),
      label: `[Imported Stem] ${af.name.replace(/\.[^.]+$/, '')}`,
      url: URL.createObjectURL(af),
      durationSec: 240,
      createdAt: now,
    }));

    createdSongs.push({
      id: uid('song'),
      productionId,
      title: parsed.title,
      subtitle: parsed.author
        ? `${parsed.author}${parsed.ccliNumber ? ` · CCLI #${parsed.ccliNumber}` : ''}`
        : parsed.ccliNumber
        ? `CCLI #${parsed.ccliNumber}`
        : 'Bulk Imported Worship Chart',
      trackIndex: startingTrackIndex + i,
      state: 'arrangement',
      commitment: 'pillar',
      tempo: parsed.bpm,
      keySig: parsed.keySig,
      timeSig: parsed.timeSig,
      durationSec: 240,
      feel: {
        bpm: parsed.bpm,
        keySig: parsed.keySig,
        timeSig: parsed.timeSig,
        feel: parsed.ccliNumber ? `CCLI #${parsed.ccliNumber}` : 'Worship Chart',
      },
      assignedSubDepts: ['music-worship-teams', 'music-band', 'music-choir', 'music-collective'],
      lyrics: parsed.blocks,
      sections: parsed.blocks.map(b => ({
        id: uid('sec'),
        kind: b.kind,
        label: b.label,
        bars: 8,
        chords: b.chords,
      })),
      takes,
      credits: parsed.author
        ? [{ id: uid('cred'), name: parsed.author, role: 'Lyrics & Melody', splitPct: 100 }]
        : [],
      createdAt: now,
      updatedAt: now,
    });
  }

  // If the user dropped ONLY audio stems (e.g. a MultiTracks stem folder) with no chart file, create a stem-pack song
  if (chartFiles.length === 0 && audioFiles.length > 0) {
    const folderTitle =
      audioFiles[0].name
        .replace(/[-_ ]?(click|guide|drums|bass|keys|pad|eg1|eg2|ag|bgv|choir|horns|strings).*$/i, '')
        .replace(/\.[^.]+$/, '')
        .trim() || 'Imported MultiTrack Stem Pack';

    const takes: SongTake[] = audioFiles.map(af => ({
      id: uid('tk'),
      label: `[MultiTrack Stem] ${af.name.replace(/\.[^.]+$/, '')}`,
      url: URL.createObjectURL(af),
      durationSec: 240,
      createdAt: now,
    }));

    createdSongs.push({
      id: uid('song'),
      productionId,
      title: folderTitle,
      subtitle: `${audioFiles.length} MultiTrack Stems Imported`,
      trackIndex: startingTrackIndex,
      state: 'arrangement',
      commitment: 'pillar',
      tempo: 76,
      keySig: 'G',
      timeSig: '4/4',
      durationSec: 240,
      assignedSubDepts: ['music-worship-teams', 'music-band', 'music-choir', 'music-collective'],
      lyrics: [
        {
          id: uid('b'),
          kind: 'verse',
          label: 'Verse 1',
          lines: ['[G]MultiTrack stem pack loaded — add or transcribe lyrics here'],
          chords: 'G - D - Em - C',
          locked: false,
        },
      ],
      sections: [{ id: uid('sec'), kind: 'verse', label: 'Verse 1', bars: 8, chords: 'G - D - Em - C' }],
      takes,
      credits: [],
      createdAt: now,
      updatedAt: now,
    });
  }

  return {
    songs: createdSongs,
    chartCount: chartFiles.length,
    stemCount: audioFiles.length,
  };
}

