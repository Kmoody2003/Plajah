// Chora — Audio to MIDI (G3) tests: chord recognition & stem-aware transcription.
// Pure TypeScript — synthesised sine/noise fixtures, zero model downloads or WASM.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChart, parseChord } from '../services/melos/beats/band/chords';
import { midiToHz } from '../services/melos/beats/voice/pitchTrack';
import {
  DEMUCS_VERIFICATION_REPORT,
  recognizeChordsFromAudio,
  transcribeSeparatedStems,
} from '../services/melos/transcribe';

const SR = 22050;

/** Render a chord progression of MIDI-note arrays (one entry per beat) with mild 2nd harmonic. */
function synthBeatChords(beatsMidi: number[][], beatSec: number, sampleRate = SR): { pcm: Float32Array; beatTimes: number[] } {
  const beatSamples = Math.round(beatSec * sampleRate);
  const pcm = new Float32Array(beatsMidi.length * beatSamples);
  const beatTimes: number[] = [];
  for (let b = 0; b < beatsMidi.length; b++) {
    beatTimes.push(b * beatSec);
    const notes = beatsMidi[b];
    const base = b * beatSamples;
    for (let i = 0; i < beatSamples; i++) {
      const t = i / sampleRate;
      // Short 8 ms fade at beat edges prevents broadband click artifacts.
      const env = Math.min(1, i / (0.008 * sampleRate), (beatSamples - 1 - i) / (0.008 * sampleRate));
      let s = 0;
      for (const m of notes) {
        const f = midiToHz(m);
        s += 0.22 * Math.sin(2 * Math.PI * f * t) + 0.04 * Math.sin(2 * Math.PI * 2 * f * t);
      }
      pcm[base + i] = s * env;
    }
  }
  return { pcm, beatTimes };
}

/** Render a monophonic sequence of `{ startSec, durSec, midi }` notes with harmonics so YIN locks cleanly. */
function synthMonoNotes(
  notes: { startSec: number; durSec: number; midi: number }[],
  totalSec: number,
  sampleRate = SR,
): Float32Array {
  const pcm = new Float32Array(Math.round(totalSec * sampleRate));
  for (const n of notes) {
    const i0 = Math.max(0, Math.round(n.startSec * sampleRate));
    const i1 = Math.min(pcm.length, Math.round((n.startSec + n.durSec) * sampleRate));
    const f = midiToHz(n.midi);
    for (let i = i0; i < i1; i++) {
      const local = i - i0;
      const len = i1 - i0;
      const env = Math.min(1, local / (0.01 * sampleRate), (len - local) / (0.015 * sampleRate));
      const t = local / sampleRate;
      pcm[i] += env * (0.45 * Math.sin(2 * Math.PI * f * t) + 0.18 * Math.sin(4 * Math.PI * f * t) + 0.08 * Math.sin(6 * Math.PI * f * t));
    }
  }
  return pcm;
}

/** Deterministic PRNG for noise-based snare / hi-hat synthesis. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function synthDrumPattern(totalSec: number, sampleRate = 44100): Float32Array {
  const pcm = new Float32Array(Math.round(totalSec * sampleRate));
  const rand = mulberry32(42);
  // 120 BPM: beat = 0.5s. Kick on 0.0, 1.0, 2.0, 3.0; Snare on 0.5, 1.5, 2.5, 3.5; Hat on 0.25, 0.75, 1.25, 1.75...
  const addKick = (t0: number) => {
    const s0 = Math.round(t0 * sampleRate);
    const len = Math.round(0.14 * sampleRate);
    let phase = 0;
    for (let i = 0; i < len && s0 + i < pcm.length; i++) {
      const t = i / sampleRate;
      const f = 52 + 85 * Math.exp(-t / 0.018);
      phase += (2 * Math.PI * f) / sampleRate;
      pcm[s0 + i] += 0.85 * Math.exp(-t / 0.045) * Math.sin(phase);
    }
  };
  const addSnare = (t0: number) => {
    const s0 = Math.round(t0 * sampleRate);
    const len = Math.round(0.12 * sampleRate);
    for (let i = 0; i < len && s0 + i < pcm.length; i++) {
      const t = i / sampleRate;
      const body = 0.35 * Math.exp(-t / 0.025) * Math.sin(2 * Math.PI * 210 * t);
      const midNoise = 0.55 * Math.exp(-t / 0.035) * (rand() * 2 - 1) * Math.sin(2 * Math.PI * 950 * t);
      pcm[s0 + i] += body + midNoise;
    }
  };
  const addHat = (t0: number) => {
    const s0 = Math.round(t0 * sampleRate);
    const len = Math.round(0.045 * sampleRate);
    let prev = 0;
    for (let i = 0; i < len && s0 + i < pcm.length; i++) {
      const t = i / sampleRate;
      const n = rand() * 2 - 1;
      const hp = n - prev;
      prev = n;
      pcm[s0 + i] += 0.38 * Math.exp(-t / 0.014) * hp * Math.cos(2 * Math.PI * 8000 * t);
    }
  };

  for (let bar = 0; bar < 2; bar++) {
    const base = bar * 2.0;
    addKick(base + 0.0);
    addHat(base + 0.25);
    addSnare(base + 0.5);
    addHat(base + 0.75);
    addKick(base + 1.0);
    addHat(base + 1.25);
    addSnare(base + 1.5);
    addHat(base + 1.75);
  }
  return pcm;
}

test('chordsFromAudio: recognises major, minor, 7, maj7, m7, dim and sus4 progressions into parseChord symbols', () => {
  // Progression 1: C | Am | F | G7 (4 beats per bar, 120 BPM => 0.5s/beat)
  const prog1 = [
    ...Array(4).fill([48, 60, 64, 67]),         // C
    ...Array(4).fill([45, 57, 60, 64]),         // Am
    ...Array(4).fill([41, 53, 57, 60]),         // F
    ...Array(4).fill([43, 55, 59, 62, 65]),     // G7 (G B D F)
  ];
  const { pcm: pcm1, beatTimes: bt1 } = synthBeatChords(prog1, 0.5);
  const res1 = recognizeChordsFromAudio(pcm1, SR, bt1);
  assert.deepEqual(res1.chords, ['C', 'Am', 'F', 'G7']);
  assert.equal(res1.chart, 'C | Am | F | G7');
  assert.ok(parseChart(res1.chart) !== null);
  for (const sym of res1.chords) assert.ok(parseChord(sym) !== null, sym);

  // Progression 2: Cmaj7 | Dm7 | Bdim | Gsus4
  const prog2 = [
    ...Array(4).fill([48, 60, 64, 67, 71]),     // Cmaj7 (C E G B)
    ...Array(4).fill([50, 62, 65, 69, 72]),     // Dm7   (D F A C)
    ...Array(4).fill([47, 59, 62, 65]),         // Bdim  (B D F)
    ...Array(4).fill([43, 55, 60, 62]),         // Gsus4 (G C D)
  ];
  const { pcm: pcm2, beatTimes: bt2 } = synthBeatChords(prog2, 0.5);
  const res2 = recognizeChordsFromAudio(pcm2, SR, bt2, { keyBias: 0 });
  assert.deepEqual(res2.chords, ['Cmaj7', 'Dm7', 'Bdim', 'Gsus4']);
  for (const sym of res2.chords) assert.ok(parseChord(sym) !== null, sym);
});

test('chordsFromAudio: smooths out single-beat transient noise and spells flats via GrooveDoc key', () => {
  // F major: F | Bbmaj7, with a 1-beat chromatic glitch on beat 2 of bar 1.
  const beats = [
    [53, 57, 60],          // F
    [54, 58, 61],          // 1-beat F# passing/glitch chord inside bar 1
    [53, 57, 60],          // F
    [53, 57, 60],          // F
    [46, 58, 62, 65, 69],  // Bbmaj7 (Bb D F A)
    [46, 58, 62, 65, 69],
    [46, 58, 62, 65, 69],
    [46, 58, 62, 65, 69],
  ];
  const { pcm, beatTimes } = synthBeatChords(beats, 0.5);
  const res = recognizeChordsFromAudio(pcm, SR, beatTimes, {
    doc: { bpm: 120, key: { tonic: 5, scale: 'major' }, meter: [{ bar: 0, num: 4, den: 4 }] },
  });
  assert.deepEqual(res.chords, ['F', 'Bbmaj7']);
  assert.equal(res.beats[1].symbol, 'F', 'Viterbi beat-grid smoothing suppresses 1-beat chromatic glitch');
});

test('stemTranscribe: routes drums, bass, vocals and other to existing transcribers and respects GrooveDoc TempoMap', async () => {
  const drumsPcm = synthDrumPattern(4.2, 44100);
  // Bass stem with low G1 (MIDI 31 = 49 Hz? Wait: MIDI 31 is G1 = 49.0 Hz, MIDI 36 is C2 = 65.4 Hz, MIDI 38 is D2 = 73.4 Hz)
  const bassPcm = synthMonoNotes(
    [
      { startSec: 0.05, durSec: 0.85, midi: 31 }, // G1 (49.0 Hz, below vocal YIN's 65 Hz floor!)
      { startSec: 1.05, durSec: 0.85, midi: 36 }, // C2 (65.4 Hz)
      { startSec: 2.05, durSec: 0.85, midi: 38 }, // D2 (73.4 Hz)
    ],
    3.2,
  );
  const vocalPcm = synthMonoNotes(
    [
      { startSec: 0.1, durSec: 0.45, midi: 60 },  // C4
      { startSec: 0.65, durSec: 0.45, midi: 64 }, // E4
      { startSec: 1.2, durSec: 0.55, midi: 67 },  // G4
    ],
    2.2,
  );
  const otherPcm = new Float32Array(SR * 2);

  // GrooveDoc with a tempo change at beat 2 (120 BPM for beats 0..2 = 1.0s, then 60 BPM after beat 2 => 2.0s = beat 3!).
  const doc = {
    bpm: 120,
    tempoMap: [{ beat: 2, bpm: 60 }],
    meter: [{ bar: 0, num: 4, den: 4 }],
  };

  let basicPitchCalled = false;
  const result = await transcribeSeparatedStems(
    {
      drums: { pcm: drumsPcm, sampleRate: 44100 },
      bass: { pcm: bassPcm, sampleRate: SR },
      vocals: { pcm: vocalPcm, sampleRate: SR },
      other: { pcm: otherPcm, sampleRate: SR },
    },
    {
      doc,
      basicPitchRunner: async (_url, bpOpts) => {
        basicPitchCalled = Boolean(bpOpts.pcm && bpOpts.pcm.data.length === otherPcm.length);
        return [
          { startSec: 0.0, durSec: 1.0, midi: 60, velocity: 0.8 },
          { startSec: 0.0, durSec: 1.0, midi: 64, velocity: 0.78 },
          { startSec: 2.0, durSec: 1.0, midi: 67, velocity: 0.82 }, // at 2.0s under tempo change => beat 3, length 1 beat!
        ];
      },
    },
  );

  assert.equal(result.demucsVerified, false);
  assert.equal(DEMUCS_VERIFICATION_REPORT.verified, false);
  assert.ok(DEMUCS_VERIFICATION_REPORT.blockers.length >= 3);
  assert.equal(basicPitchCalled, true);

  const byStem = Object.fromEntries(result.tracks.map((t) => [t.stem, t]));
  assert.equal(byStem.drums.backend, 'flux-dsp');
  assert.equal(byStem.drums.role, 'drums');
  assert.ok(byStem.drums.notes.length >= 4, 'drum stem produces percussion notes');
  assert.ok(byStem.drums.notes.some((n) => n.key === 36), 'detects kick (MIDI 36)');

  assert.equal(byStem.bass.backend, 'yin-bass');
  assert.equal(byStem.bass.role, 'bass');
  assert.deepEqual(byStem.bass.notes.map((n) => n.key), [31, 36, 38]);
  // Third bass note starts at ~2.05s: after beat 2 (1.0s) tempo is 60 BPM, so 2.05s is ~beat 3.05 (NOT 4.10!).
  assert.ok(byStem.bass.notes[2].startBeats > 2.9 && byStem.bass.notes[2].startBeats < 3.25);

  assert.equal(byStem.vocals.backend, 'yin-voice');
  assert.equal(byStem.vocals.role, 'vocals');
  assert.deepEqual(byStem.vocals.notes.map((n) => n.key), [60, 64, 67]);

  assert.equal(byStem.other.backend, 'basic-pitch');
  assert.equal(byStem.other.role, 'piano');
  assert.equal(byStem.other.notes.length, 3);
  assert.equal(byStem.other.notes[2].startBeats, 3);
  assert.equal(byStem.other.notes[2].lengthBeats, 1);

  // Without a Basic Pitch runtime in headless Node, `other` reports unavailable rather than faking output.
  const unavail = await transcribeSeparatedStems({ other: { pcm: otherPcm, sampleRate: SR } });
  assert.equal(unavail.tracks[0].status, 'unavailable');
  assert.equal(unavail.tracks[0].notes.length, 0);
  assert.match(unavail.tracks[0].warning ?? '', /Basic Pitch/i);
});
