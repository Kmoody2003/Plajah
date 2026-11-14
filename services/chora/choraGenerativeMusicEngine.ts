// services/chora/choraGenerativeMusicEngine.ts — Chora Generative Music Studio Engine.
// Provides BPM quantization, generative chord progression MIDI stems, and vocal drop routing
// directly into the Chora DAW timeline.
// 100% Native Plajah: Zero external cloud dependencies.

import {
  allProgressions,
  progressionsByGenre,
  getProgression,
  Genre,
} from '../melos/progressionRepo';
import {
  progressionToClip,
  ProgressionClipOpts,
} from '../melos/composition/progressionToClip';
import { NoteEvent, TimelineClip } from '../melos/beats/grooveDoc';
import { plajahAudioCore, ChoraVocalDropResult } from '../voice/plajahAudioCore';
import { proceduralFoley } from '../audio/proceduralFoleyEngine';
import type { MixerTrackStrip } from '../audio/mackieControlService';

export interface ChoraMusicStem {
  stemId: string;
  stemName: string;
  stemType: 'CHORD_PAD' | 'SUB_BASS' | 'VOCAL_DROP' | 'FOLEY_RISER' | 'SYNTH_LEAD';
  bpm: number;
  key: string;
  barCount: number;
  durationSeconds: number;
  quantizedBeats: number;
  midiClip?: TimelineClip;
  audioBlob: Blob;
  audioUrl?: string;
  color: string;
}

export const ROOT_KEY_TO_PC: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
};

export class ChoraGenerativeMusicEngine {
  private static instance: ChoraGenerativeMusicEngine | null = null;

  static getInstance(): ChoraGenerativeMusicEngine {
    if (!this.instance) {
      this.instance = new ChoraGenerativeMusicEngine();
    }
    return this.instance;
  }

  /**
   * Parse a key string like "D Minor" or "C Major" into a root pitch class number (0..11).
   */
  parseRootPitchClass(keyString: string): { rootPc: number; mode: 'major' | 'minor' } {
    const parts = keyString.trim().split(/\s+/);
    const rootName = parts[0] || 'C';
    const mode = parts[1]?.toLowerCase().includes('min') ? 'minor' : 'major';
    const rootPc = ROOT_KEY_TO_PC[rootName] ?? 0;
    return { rootPc, mode };
  }

  /**
   * Generates a BPM-quantized chord progression MIDI stem.
   */
  generateChordProgressionStem(spec: {
    progressionId: string;
    rootKey: string;
    bpm: number;
    seventh?: boolean;
    instrumentPreset?: 'piano' | 'synth_pad' | 'sub_bass';
  }): ChoraMusicStem {
    const { rootPc } = this.parseRootPitchClass(spec.rootKey);
    const prog = getProgression(spec.progressionId) || getProgression('epic-minor');
    const progId = prog ? prog.id : 'epic-minor';

    const isBass = spec.instrumentPreset === 'sub_bass';
    const baseMidi = isBass ? 36 : 48; // C2 for bass, C3 for chords

    const clip = progressionToClip(progId, rootPc, {
      seventh: spec.seventh ?? (spec.instrumentPreset === 'synth_pad'),
      baseMidi,
      barBeats: 4,
      velocity: isBass ? 105 : 90,
      feel: { seed: Date.now() & 0x7fffffff, player: isBass ? 'dwayne' : spec.instrumentPreset === 'synth_pad' ? 'nova' : 'theo', role: isBass ? 'bass' : spec.instrumentPreset === 'synth_pad' ? 'pad' : 'chords' },
    });

    const totalBeats = clip ? clip.lengthBeats : 16;
    const barCount = Math.ceil(totalBeats / 4);
    const secondsPerBeat = 60.0 / spec.bpm;
    const durationSeconds = totalBeats * secondsPerBeat;

    // Synthesize preview audio PCM buffer
    const audioBlob = this.synthesizeMidiAudioBlob(clip?.notes || [], spec.bpm);

    const stemName = isBass ? `BASS (${prog?.name || 'Prog'})` : `CHORDS (${prog?.name || 'Prog'})`;
    const color = isBass ? '#FF8C00' : '#00DAF3';

    return {
      stemId: `stem_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      stemName,
      stemType: isBass ? 'SUB_BASS' : 'CHORD_PAD',
      bpm: spec.bpm,
      key: spec.rootKey,
      barCount,
      durationSeconds,
      quantizedBeats: totalBeats,
      midiClip: clip || undefined,
      audioBlob,
      audioUrl: typeof URL !== 'undefined' ? URL.createObjectURL(audioBlob) : '',
      color,
    };
  }

  /**
   * Generates a BPM-quantized AI Vocal Drop stem.
   */
  async generateVocalDropStem(spec: {
    prompt: string;
    bpm: number;
    key?: string;
    engine?: 'kokoro' | 'fish_speech';
  }): Promise<ChoraMusicStem> {
    const res: ChoraVocalDropResult = await plajahAudioCore.synthesizeChoraVocalDrop({
      text: spec.prompt,
      bpm: spec.bpm,
      key: spec.key || 'D Minor',
      engine: spec.engine || 'fish_speech',
    });

    const barCount = Math.ceil(res.quantizedBeats / 4);

    return {
      stemId: `stem_vocal_${Date.now()}`,
      stemName: `VOX: "${spec.prompt.slice(0, 16)}…"`,
      stemType: 'VOCAL_DROP',
      bpm: spec.bpm,
      key: spec.key || 'D Minor',
      barCount,
      durationSeconds: res.durationSeconds,
      quantizedBeats: res.quantizedBeats,
      audioBlob: res.audioBlob,
      audioUrl: typeof URL !== 'undefined' ? URL.createObjectURL(res.audioBlob) : '',
      color: '#D40055',
    };
  }

  /**
   * Generates a BPM-quantized procedural Foley Riser stem.
   */
  generateFoleyRiserStem(spec: {
    presetId: string;
    bpm: number;
    beatBars?: number;
  }): ChoraMusicStem {
    const bars = spec.beatBars || 2;
    const foleyRes = proceduralFoley.renderFoley({
      presetId: spec.presetId,
      bpm: spec.bpm,
      beatBars: bars,
    });

    return {
      stemId: `stem_foley_${Date.now()}`,
      stemName: `RISER (${foleyRes.name})`,
      stemType: 'FOLEY_RISER',
      bpm: spec.bpm,
      key: 'Fx',
      barCount: bars,
      durationSeconds: foleyRes.durationSeconds,
      quantizedBeats: bars * 4,
      audioBlob: foleyRes.wavBlob,
      audioUrl: typeof URL !== 'undefined' ? URL.createObjectURL(foleyRes.wavBlob) : '',
      color: '#D0BCFF',
    };
  }

  /**
   * Maps a generated ChoraMusicStem into a MixerTrackStrip for the DAW timeline.
   */
  convertStemToMixerTrack(stem: ChoraMusicStem): MixerTrackStrip {
    const isBass = stem.stemType === 'SUB_BASS';
    const isVox = stem.stemType === 'VOCAL_DROP';
    const isFoley = stem.stemType === 'FOLEY_RISER';

    return {
      id: `trk_${stem.stemId}`,
      name: stem.stemName,
      volumeGain: isBass ? 1.05 : isVox ? 1.15 : 0.9,
      pan: isVox || isBass ? 0.0 : 0.25,
      mute: false,
      solo: false,
      armed: true,
      selected: true,
      color: stem.color,
      meterLevel: 0.75,
      eqLowDb: isBass ? 4.0 : isVox ? -1.5 : 0.0,
      eqMidDb: isVox ? 2.0 : isBass ? -1.0 : 0.5,
      eqHighDb: isVox ? 3.5 : isFoley ? 3.0 : 1.0,
      send1Gain: isVox ? 0.45 : isFoley ? 0.6 : 0.2,
      send2Gain: isVox ? 0.35 : 0.15,
    };
  }

  /**
   * Procedural PCM WAV generator for MIDI notes (operates seamlessly in Node and browser).
   */
  private synthesizeMidiAudioBlob(notes: NoteEvent[], bpm: number): Blob {
    const sampleRate = 44100;
    const secPerBeat = 60.0 / bpm;
    const totalBeats = notes.reduce((max, n) => Math.max(max, n.startBeats + n.lengthBeats), 4);
    const totalSamples = Math.ceil(totalBeats * secPerBeat * sampleRate);

    const buffer = new Float32Array(Math.min(totalSamples, sampleRate * 10)); // cap at 10s for lightweight preview

    for (const note of notes) {
      const freq = 440 * Math.pow(2, (note.key - 69) / 12);
      const startSample = Math.floor(note.startBeats * secPerBeat * sampleRate);
      const lengthSamples = Math.floor(note.lengthBeats * secPerBeat * sampleRate);
      const endSample = Math.min(buffer.length, startSample + lengthSamples);
      const amp = (note.vel / 127) * 0.22;

      for (let s = startSample; s < endSample; s++) {
        const t = (s - startSample) / sampleRate;
        // Warm saw + sine hybrid with envelope
        const env = Math.exp(-t * 1.5);
        const wave = 0.6 * Math.sin(2 * Math.PI * freq * t) + 0.4 * Math.sin(4 * Math.PI * freq * t);
        buffer[s] += wave * amp * env;
      }
    }

    // Convert to 16-bit PCM WAV
    const wavBytes = encodeWavPcm(buffer, sampleRate);
    return new Blob([wavBytes], { type: 'audio/wav' });
  }
}

function encodeWavPcm(samples: Float32Array, sampleRate: number): Uint8Array {
  const byteRate = sampleRate * 2;
  const blockAlign = 2;
  const numSamples = samples.length;
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // 16-bit
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

export const choraGenerativeMusicEngine = ChoraGenerativeMusicEngine.getInstance();
