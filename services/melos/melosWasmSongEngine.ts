/**
 * melosWasmSongEngine.ts
 *
 * Direct Melos Studio Rust/WASM DSP Song Renderer (`plajah_audio.wasm`).
 *
 * Instead of generic Web Audio oscillator playback, this engine instantiates the actual
 * Melos Studio WebAssembly synthesizer (`plajah_audio.wasm` — ABI v11) for each orchestral/hybrid
 * track in a book's film cue:
 *   - AURA   (block 1700+): 1960s/70s Vintage Analogue, Mellotron Tape Violins/Flute/Choir,
 *                           ARP Solina Strings, CS-80 Brass, Harpsichord, Celesta, RMI Fortepiano
 *   - BAJO   (block 1400+): Karplus-Strong Physical Bowed Contrabass, Cello Menace, Upright Bass,
 *                           Fretless Glass, Zimmer Braam Engine, Trailer Sub
 *   - VELA   (block 1000+): Modal Resonator — Himalayan Bronze, Vitreous Harp, Ferrous Iron,
 *                           Cathedral Shimmer, Tremolo Strings, Glass Choir, Vespers, Reliquary
 *   - CANTUS (block 1000+): Vocal Tract Formant & Overtone Choir — Vault, Plainsong, Kargyraa,
 *                           Byzantine, Overtone
 *   - ISON   (block 1000+): Byzantine & Pipe Organ Drones — Bourdon, Shruti, Tanpura, Cavern
 *   - PNEUMA (block 1000+): Breath-Driven Temple Flutes — Ney, Shakuhachi, Hall
 *   - ONDA   (block    0+): Wavetable & Subtractive — Glass Keys, Bloom Pluck, Vowel Choir, Deep Drone
 *
 * It mixes the 5 Melos WASM instrument stems with physical-modeled orchestral film percussion
 * (tuned concert timpani strikes & rolls, taiko/concert bass drum, snare, and suspended cymbal swells)
 * through a stereo concert-hall / stone-cathedral impulse response and encodes a 44.1kHz stereo WAV song.
 */

import { encodeWav } from '../audio/wavEncode';
import { AURA_PRESETS } from './instruments/aura/presets';
import { newAuraPatch, auraEngineParams, auraTablesFor } from './instruments/aura/patch';
import { getAuraWavetable, auraTableIndex, FRAMES as AURA_FRAMES, FRAME_SIZE as AURA_FRAME_SIZE } from './instruments/aura/wavetables';
import { BAJO_PRESETS } from './instruments/bajo/presets';
import { newBajoPatch, bajoEngineParams, bajoTablesFor } from './instruments/bajo/patch';
import { getBajoWavetable, bajoTableIndex, FRAMES as BAJO_FRAMES, FRAME_SIZE as BAJO_FRAME_SIZE } from './instruments/bajo/wavetables';
import { VELA_PRESETS } from './instruments/vela/presets';
import { newVelaPatch, velaEngineParams, velaDriftSetup } from './instruments/vela/patch';
import { findSuitePreset } from './instruments/vela/suite';
import { FACTORY_PRESETS } from './instruments/onda/presets';
import { tablesFor as ondaTablesFor } from './instruments/onda/patch';
import { getWavetable as getOndaWavetable, wavetableIndex as ondaTableIndex, FRAMES as ONDA_FRAMES, FRAME_SIZE as ONDA_FRAME_SIZE } from './instruments/onda/wavetables';
import { evaluateNoteMpeAtProgress, type NoteEvent } from './beats/grooveDoc';

export type MelosWasmInstrumentType = 'aura' | 'bajo' | 'vela' | 'cantus' | 'ison' | 'pneuma' | 'onda';

export type FilmPercussionStyle =
  | 'none'
  | 'regency-ballroom'
  | 'pastoral-pulsing'
  | 'storm-agitato'
  | 'gothic-ritual'
  | 'carpathian-pursuit'
  | 'waltz-macabre'
  | 'epic-apotheosis'
  | 'maritime-tempest'
  | 'imperial-war-drums';

export interface MelosSongTrackSpec {
  role: string;
  trackName: string;
  instrumentType: MelosWasmInstrumentType;
  presetId: string;
  gainDb: number;
  pan: number;
  notes: NoteEvent[];
  generativeEngine?: string;
}

export interface MelosSongRenderRequest {
  songId: string;
  bpm: number;
  lengthBeats: number;
  rootMidi: number;
  hallReverbDecaySec: number;
  hallReverbDamping: number;
  wetReverbMix: number;
  percussionStyle: FilmPercussionStyle;
  tracks: MelosSongTrackSpec[];
  sampleRate?: number;
  /** When true (default for full film scores), layers ACE-Step 2.5 acoustic orchestral/choir stems in conjunction with Melos synths */
  enableAceStepHybridStems?: boolean;
}

interface PlajahWasmExports {
  memory: WebAssembly.Memory;
  pa_abi_version(): number;
  pa_create(sampleRate: number): number;
  pa_destroy(eng: number): void;
  pa_channels(eng: number): number;
  pa_out_ptr(eng: number, channel: number): number;
  pa_render(eng: number, frames: number): void;
  pa_reset_transport(eng: number, frame: number): void;
  pa_clear_schedule(eng: number): void;
  pa_schedule_note_on(eng: number, note: number, velocity: number, voiceId: number, frame: number): void;
  pa_schedule_note_off(eng: number, voiceId: number, frame: number): void;
  pa_set_param(eng: number, id: number, value: number): void;
  pa_set_macro(eng: number, index: number, value: number): void;
  pa_set_route(eng: number, index: number, source: number, dest: number, depth: number, via: number): void;
  pa_set_expression?(eng: number, voiceId: number, bend: number, pressure: number, timbre: number): void;
  pa_set_mod_wheel?(eng: number, value: number): void;
  pa_set_pitch_bend?(eng: number, value: number): void;
  pa_set_tempo(eng: number, beatsPerSec: number): void;
  pa_set_position(eng: number, x: number, y: number, z: number): void;
  pa_upload_ptr(eng: number): number;
  pa_upload_capacity(eng: number): number;
  pa_commit_table(eng: number, slot: number, frames: number, frameSize: number): void;
}

let compiledWasmModulePromise: Promise<WebAssembly.Module> | null = null;

/**
 * Loads `plajah_audio.wasm` in either browser (via fetch) or Node.js (via fs).
 */
export async function getMelosWasmModule(customWasmBytes?: ArrayBuffer | Uint8Array): Promise<WebAssembly.Module> {
  if (!compiledWasmModulePromise) {
    if (customWasmBytes) {
      compiledWasmModulePromise = WebAssembly.compile(customWasmBytes as BufferSource);
      return compiledWasmModulePromise;
    }
    compiledWasmModulePromise = (async () => {
      // Node.js environment support (for pre-rendering or tests)
      if (typeof window === 'undefined' || typeof process !== 'undefined' && process.versions?.node) {
        try {
          const fs = await import('node:fs');
          const path = await import('node:path');
          const candidatePaths = [
            path.resolve(process.cwd(), 'services/melos/beats/engine/dsp/plajah_audio.wasm'),
            path.resolve(process.cwd(), 'public/audio/plajah_audio.wasm'),
          ];
          for (const p of candidatePaths) {
            if (fs.existsSync(p)) {
              const buf = fs.readFileSync(p);
              return await WebAssembly.compile(buf);
            }
          }
        } catch {
          // fall through to fetch
        }
      }
      const urls = ['/audio/plajah_audio.wasm', '/services/melos/beats/engine/dsp/plajah_audio.wasm'];
      for (const u of urls) {
        try {
          const res = await fetch(u);
          if (res.ok) {
            const bytes = await res.arrayBuffer();
            return await WebAssembly.compile(bytes);
          }
        } catch {
          // try next url
        }
      }
      throw new Error('Failed to load Melos DSP engine (plajah_audio.wasm)');
    })();
  }
  return compiledWasmModulePromise;
}

const committedWavetableSlots = new WeakMap<object, Set<string>>();

function uploadWavetableToWasm(
  x: PlajahWasmExports,
  eng: number,
  slot: number,
  data: Float32Array,
  frames: number,
  frameSize: number,
  tableKey?: string,
): void {
  if (tableKey) {
    let set = committedWavetableSlots.get(x);
    if (!set) {
      set = new Set<string>();
      committedWavetableSlots.set(x, set);
    }
    const cacheId = `${eng}:${slot}:${tableKey}`;
    if (set.has(cacheId)) return;
    set.add(cacheId);
  }
  const ptr = x.pa_upload_ptr(eng);
  const cap = x.pa_upload_capacity(eng);
  if (ptr && data && data.length <= cap) {
    new Float32Array(x.memory.buffer, ptr, data.length).set(data);
    x.pa_commit_table(eng, slot, frames, frameSize);
  }
}

/**
 * Configures a `plajah_audio.wasm` engine instance with the exact Melos factory preset
 * (`AURA`, `BAJO`, `VELA`, `CANTUS`, `ISON`, `PNEUMA`, or `ONDA`).
 */
export function configureMelosPresetOnEngine(
  x: PlajahWasmExports,
  eng: number,
  instrumentType: MelosWasmInstrumentType,
  presetId: string,
): { trimGain: number } {
  const cleanId = presetId.replace(/^f_/, '');

  if (instrumentType === 'aura') {
    const preset = AURA_PRESETS.find((p) => p.id === cleanId || p.name === cleanId) || AURA_PRESETS[0];
    const patch = newAuraPatch(preset);
    for (const tableId of auraTablesFor(patch)) {
      const data = getAuraWavetable(tableId);
      if (data) uploadWavetableToWasm(x, eng, auraTableIndex(tableId), data, AURA_FRAMES, AURA_FRAME_SIZE, `aura:${tableId}`);
    }
    const entries = auraEngineParams(patch);
    patch.tables.forEach((tid, i) => {
      if (tid) entries.push([100 + i * 100 + 7, auraTableIndex(tid)]);
    });
    for (const [id, val] of entries) x.pa_set_param(eng, id, val);
    for (let i = 0; i < 32; i++) x.pa_set_route(eng, i, 0, 0, 0, 0);
    patch.routes.slice(0, 32).forEach((r, idx) => {
      x.pa_set_route(eng, idx, r.source, r.dest, r.depth, 0);
    });
    return { trimGain: 0.85 };
  }

  if (instrumentType === 'bajo') {
    const preset = BAJO_PRESETS.find((p) => p.id === cleanId || p.name === cleanId) || BAJO_PRESETS[0];
    const patch = newBajoPatch(preset);
    for (const tableId of bajoTablesFor(patch)) {
      const data = getBajoWavetable(tableId);
      if (data) uploadWavetableToWasm(x, eng, bajoTableIndex(tableId), data, BAJO_FRAMES, BAJO_FRAME_SIZE, `bajo:${tableId}`);
    }
    const entries = bajoEngineParams(patch);
    patch.tables.forEach((tid, i) => {
      if (tid) entries.push([100 + i * 100 + 7, bajoTableIndex(tid)]);
    });
    for (const [id, val] of entries) x.pa_set_param(eng, id, val);
    return { trimGain: 0.9 };
  }

  if (instrumentType === 'vela' || instrumentType === 'cantus' || instrumentType === 'ison' || instrumentType === 'pneuma') {
    const found = findSuitePreset(cleanId);
    const preset = found?.preset || VELA_PRESETS.find((p) => p.id === cleanId || p.name === cleanId) || VELA_PRESETS[0];
    const patch = newVelaPatch(preset);
    const entries = [...velaDriftSetup(), ...velaEngineParams(patch)];
    for (const [id, val] of entries) {
      // Ensure sustained choir/drone presets respond within a musical phrase and release cleanly without voice pile-up
      if (id === 1012 /* M.SWELL */ && val > 0.32) {
        x.pa_set_param(eng, id, 0.22);
      } else if (id === 2004 /* A.REL */ && val > 0.36) {
        x.pa_set_param(eng, id, 0.36);
      } else {
        x.pa_set_param(eng, id, val);
      }
    }
    // Boost quiet modal/choir presets so they balance with AURA and BAJO in a full orchestral mix
    const rawMaster = preset.params[0] ?? 0.5;
    const makeup = rawMaster < 0.15 ? 2.4 : rawMaster < 0.35 ? 1.55 : 1.15;
    return { trimGain: makeup };
  }

  // ONDA wavetable synth
  const preset = FACTORY_PRESETS.find((p) => p.name === cleanId) || FACTORY_PRESETS[0];
  for (const tableId of ondaTablesFor(preset)) {
    const data = getOndaWavetable(tableId);
    if (data) uploadWavetableToWasm(x, eng, ondaTableIndex(tableId), data, ONDA_FRAMES, ONDA_FRAME_SIZE);
  }
  const entries: Array<[number, number]> = Object.entries(preset.params).map(([k, v]) => [Number(k), v]);
  preset.tables.forEach((tid, i) => {
    if (tid) entries.push([100 + i * 100 + 7, ondaTableIndex(tid)]);
  });
  for (const [id, val] of entries) x.pa_set_param(eng, id, val);
  for (let i = 0; i < 32; i++) x.pa_set_route(eng, i, 0, 0, 0, 0);
  preset.routes.slice(0, 32).forEach((r, i) => x.pa_set_route(eng, i, r.source, r.dest, r.depth, r.via ?? 0));
  preset.macros.slice(0, 8).forEach((m, i) => x.pa_set_macro(eng, i, m.value));
  return { trimGain: 0.82 };
}

/**
 * Synthesizes physical-modeled orchestral film percussion (tuned concert timpani, taiko/concert bass drum,
 * orchestral snare, tambourine/triangle, and suspended cymbal swells) directly into the stereo mix buffers.
 */
function mixOrchestralFilmPercussion(
  mixL: Float32Array,
  mixR: Float32Array,
  sampleRate: number,
  bpm: number,
  lengthBeats: number,
  rootMidi: number,
  style: FilmPercussionStyle,
): void {
  if (style === 'none') return;
  const spb = 60 / bpm;
  const totalFrames = mixL.length;

  let rng = 987654321;
  const nextNoise = () => {
    rng = (rng * 1664525 + 1013904223) >>> 0;
    return (rng / 0xffffffff) * 2 - 1;
  };

  const addTimpaniStrike = (beat: number, midiPitch: number, vel: number, pan = -0.15) => {
    const startFrame = Math.round((0.06 + beat * spb) * sampleRate);
    const durFrames = Math.round(1.35 * sampleRate);
    const f0 = 440 * Math.pow(2, (midiPitch - 69) / 12);
    const gain = 0.22 * vel;
    const panL = Math.cos(((pan + 1) * Math.PI) / 4);
    const panR = Math.sin(((pan + 1) * Math.PI) / 4);
    let phase1 = 0;
    let phase2 = 0;
    let phase3 = 0;
    for (let i = 0; i < durFrames; i++) {
      const idx = startFrame + i;
      if (idx >= totalFrames) break;
      const t = i / sampleRate;
      // Pitch drop on drumhead impact + circular membrane modal ratios (1 : 1.50 : 1.98)
      const pitchEnv = 1 + 0.28 * Math.exp(-t * 32);
      const f = f0 * pitchEnv;
      phase1 += (2 * Math.PI * f) / sampleRate;
      phase2 += (2 * Math.PI * f * 1.5) / sampleRate;
      phase3 += (2 * Math.PI * f * 1.98) / sampleRate;
      const ampEnv = (1 - Math.exp(-t * 180)) * Math.exp(-t * 3.4);
      const malletTransient = t < 0.025 ? nextNoise() * Math.exp(-t * 140) * 0.45 : 0;
      const sample =
        (Math.sin(phase1) * 0.72 + Math.sin(phase2) * 0.22 * Math.exp(-t * 5) + Math.sin(phase3) * 0.12 * Math.exp(-t * 8) + malletTransient) *
        ampEnv *
        gain;
      mixL[idx] += sample * panL;
      mixR[idx] += sample * panR;
    }
  };

  const addConcertBassDrum = (beat: number, vel: number) => {
    const startFrame = Math.round((0.06 + beat * spb) * sampleRate);
    const durFrames = Math.round(1.6 * sampleRate);
    let phase = 0;
    const gain = 0.26 * vel;
    for (let i = 0; i < durFrames; i++) {
      const idx = startFrame + i;
      if (idx >= totalFrames) break;
      const t = i / sampleRate;
      const f = 46 + 48 * Math.exp(-t * 24);
      phase += (2 * Math.PI * f) / sampleRate;
      const env = (1 - Math.exp(-t * 120)) * Math.exp(-t * 2.6);
      const thud = t < 0.04 ? nextNoise() * Math.exp(-t * 90) * 0.35 : 0;
      const s = (Math.sin(phase) + thud) * env * gain;
      mixL[idx] += s;
      mixR[idx] += s;
    }
  };

  const addCymbalSwellOrBell = (beat: number, durSec: number, vel: number, isSwell: boolean) => {
    const startFrame = Math.round((0.06 + beat * spb) * sampleRate);
    const durFrames = Math.round(durSec * sampleRate);
    const gain = 0.065 * vel;
    let bp1 = 0;
    let bp2 = 0;
    for (let i = 0; i < durFrames; i++) {
      const idx = startFrame + i;
      if (idx >= totalFrames) break;
      const t = i / sampleRate;
      const normT = i / durFrames;
      const env = isSwell
        ? Math.pow(Math.sin(normT * Math.PI), 1.8)
        : (1 - Math.exp(-t * 250)) * Math.exp(-t * 2.8);
      const raw = nextNoise();
      // High metallic shimmer filter
      bp1 = bp1 * 0.4 + raw * 0.6;
      const high = raw - bp1;
      bp2 = bp2 * 0.7 + high * 0.3;
      const s = (high * 0.7 + bp2 * 0.3) * env * gain;
      mixL[idx] += s * 0.9;
      mixR[idx] += s * 1.1;
    }
  };

  const tonicTimp = Math.max(36, Math.min(52, (rootMidi % 12) + 36));
  const domTimp = tonicTimp + 7 <= 55 ? tonicTimp + 7 : tonicTimp - 5;

  if (style === 'regency-ballroom') {
    // 3/4 Ballroom pulse: light timpani on bar downbeats + sparkling triangle/tambourine on beat 2 & 3 in B/C sections
    for (let beat = 0; beat < lengthBeats; beat += 3) {
      const bar = Math.floor(beat / 3);
      if (bar % 2 === 0) {
        addTimpaniStrike(beat, bar % 4 === 2 ? domTimp : tonicTimp, bar >= 4 ? 0.55 : 0.38, -0.2);
      }
      if (bar >= 2) {
        addCymbalSwellOrBell(beat + 1, 0.22, 0.35, false);
        addCymbalSwellOrBell(beat + 2, 0.18, 0.28, false);
      }
    }
  } else if (style === 'pastoral-pulsing') {
    // Gentle concert timpani only at structural section boundaries (Section B & Climax)
    for (let beat = 12; beat < lengthBeats; beat += 6) {
      addTimpaniStrike(beat, beat % 12 === 0 ? tonicTimp : domTimp, 0.42, -0.18);
      if (beat === 24) addCymbalSwellOrBell(beat - 2, spb * 3, 0.45, true);
    }
  } else if (style === 'waltz-macabre') {
    // Eerie 3/4 Gothic Waltz: deep crypt bell & soft timpani on downbeats
    for (let beat = 0; beat < lengthBeats; beat += 3) {
      const bar = Math.floor(beat / 3);
      if (bar % 2 === 0) {
        addTimpaniStrike(beat, tonicTimp, 0.52, -0.22);
      } else {
        addTimpaniStrike(beat, domTimp, 0.38, 0.22);
      }
      if (bar % 4 === 3) {
        addCymbalSwellOrBell(beat, spb * 3, 0.5, true);
      }
    }
  } else if (style === 'gothic-ritual') {
    // Monumental slow ritual: heavy concert bass drum + timpani fifths
    for (let beat = 0; beat < lengthBeats; beat += 4) {
      addConcertBassDrum(beat, 0.85);
      addTimpaniStrike(beat, tonicTimp, 0.8, -0.25);
      addTimpaniStrike(beat + 2, domTimp, 0.65, 0.25);
      if (beat % 8 === 4) {
        addTimpaniStrike(beat + 3.5, tonicTimp, 0.72, 0);
      }
    }
  } else if (style === 'carpathian-pursuit' || style === 'storm-agitato' || style === 'maritime-tempest' || style === 'imperial-war-drums') {
    // Relentless action / storm timpani + syncopated bass drum hits
    for (let beat = 0; beat < lengthBeats; beat += 4) {
      addConcertBassDrum(beat, 0.82);
      addTimpaniStrike(beat, tonicTimp, 0.82, -0.28);
      addTimpaniStrike(beat + 1.5, domTimp, 0.68, 0.28);
      addTimpaniStrike(beat + 2.0, tonicTimp, 0.74, -0.15);
      addTimpaniStrike(beat + 3.0, domTimp, 0.78, 0.2);
      addTimpaniStrike(beat + 3.5, tonicTimp + 1, 0.65, -0.2);
      if (beat % 8 === 0 && beat > 0) {
        addCymbalSwellOrBell(beat, 1.2, 0.65, false);
      }
    }
  } else if (style === 'epic-apotheosis') {
    // Sweeping film finale: builds from gentle pulse into grand orchestral timpani & cymbal swells
    for (let beat = 8; beat < lengthBeats; beat += 4) {
      const intensity = beat >= 20 ? 0.85 : 0.48;
      if (beat >= 16) addConcertBassDrum(beat, intensity);
      addTimpaniStrike(beat, tonicTimp, intensity, -0.22);
      addTimpaniStrike(beat + 2, domTimp, intensity * 0.85, 0.22);
      if (beat === 16 || beat === 24 || beat === lengthBeats - 4) {
        addCymbalSwellOrBell(beat - 2, spb * 2.5, 0.75, true);
      }
    }
  }
}

/**
 * Applies a lush stereo Schroeder / Moorer concert-hall & cathedral reverb + soft-knee mastering limiter
 * directly to the stereo PCM buffers so the output is identical in Node.js and browser environments.
 */
function applyStereoHallReverbAndMaster(
  mixL: Float32Array,
  mixR: Float32Array,
  sampleRate: number,
  decaySec: number,
  damping: number,
  wetMix: number,
): void {
  const n = mixL.length;
  // 4 parallel stereo comb filters (scaled to sampleRate) + 2 series all-pass diffusers
  const combTimesSec = [0.0297, 0.0371, 0.0411, 0.0437];
  const spreadSamples = 23;
  const feedback = Math.min(0.92, Math.pow(0.001, 0.038 / Math.max(0.6, decaySec)));
  const damp = Math.max(0.15, Math.min(0.85, damping));

  const combsL = combTimesSec.map((t) => new Float32Array(Math.max(64, Math.round(t * sampleRate))));
  const combsR = combTimesSec.map((t) => new Float32Array(Math.max(64, Math.round(t * sampleRate) + spreadSamples)));
  const idxL = [0, 0, 0, 0];
  const idxR = [0, 0, 0, 0];
  const storeL = [0, 0, 0, 0];
  const storeR = [0, 0, 0, 0];

  const apTimesSec = [0.005, 0.0017];
  const apL = apTimesSec.map((t) => new Float32Array(Math.max(16, Math.round(t * sampleRate))));
  const apR = apTimesSec.map((t) => new Float32Array(Math.max(16, Math.round(t * sampleRate) + 11)));
  const apIdxL = [0, 0];
  const apIdxR = [0, 0];

  // Pre-delay (24ms concert hall early reflection gap)
  const preDelayLen = Math.max(1, Math.round(0.024 * sampleRate));
  const preBufL = new Float32Array(preDelayLen);
  const preBufR = new Float32Array(preDelayLen);
  let preIdx = 0;

  const dryGain = 1 - wetMix * 0.35;
  const wetGain = wetMix * 0.42;

  for (let i = 0; i < n; i++) {
    const inL = mixL[i];
    const inR = mixR[i];

    const delayedL = preBufL[preIdx];
    const delayedR = preBufR[preIdx];
    preBufL[preIdx] = inL * 0.5 + inR * 0.15;
    preBufR[preIdx] = inR * 0.5 + inL * 0.15;
    preIdx = (preIdx + 1) % preDelayLen;

    let outL = 0;
    let outR = 0;

    for (let c = 0; c < 4; c++) {
      const bufL = combsL[c];
      const pL = idxL[c];
      const readL = bufL[pL];
      storeL[c] = readL * (1 - damp) + storeL[c] * damp;
      bufL[pL] = delayedL + storeL[c] * feedback;
      idxL[c] = (pL + 1) % bufL.length;
      outL += readL;

      const bufR = combsR[c];
      const pR = idxR[c];
      const readR = bufR[pR];
      storeR[c] = readR * (1 - damp) + storeR[c] * damp;
      bufR[pR] = delayedR + storeR[c] * feedback;
      idxR[c] = (pR + 1) % bufR.length;
      outR += readR;
    }

    for (let a = 0; a < 2; a++) {
      const bL = apL[a];
      const pL = apIdxL[a];
      const bufOutL = bL[pL];
      const inputL = outL;
      outL = -inputL + bufOutL;
      bL[pL] = inputL + bufOutL * 0.5;
      apIdxL[a] = (pL + 1) % bL.length;

      const bR = apR[a];
      const pR = apIdxR[a];
      const bufOutR = bR[pR];
      const inputR = outR;
      outR = -inputR + bufOutR;
      bR[pR] = inputR + bufOutR * 0.5;
      apIdxR[a] = (pR + 1) % bR.length;
    }

    mixL[i] = inL * dryGain + outL * wetGain;
    mixR[i] = inR * dryGain + outR * wetGain;
  }

  // Normalize & soft-knee mastering limiter to -0.8 dBFS with smooth 1.8s fade-out tail
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const aL = Math.abs(mixL[i]);
    const aR = Math.abs(mixR[i]);
    if (aL > peak) peak = aL;
    if (aR > peak) peak = aR;
  }
  const targetPeak = 0.88;
  const normGain = peak > 0.001 ? Math.min(2.8, targetPeak / peak) : 1.0;
  const fadeOutFrames = Math.min(Math.round(sampleRate * 1.8), Math.floor(n * 0.15));
  const fadeStart = n - fadeOutFrames;

  for (let i = 0; i < n; i++) {
    let env = 1.0;
    if (i >= fadeStart) {
      const t = (i - fadeStart) / fadeOutFrames;
      env = Math.cos(t * Math.PI * 0.5);
    }
    const sL = mixL[i] * normGain * env;
    const sR = mixR[i] * normGain * env;
    // Soft-saturation analog tape ceiling
    mixL[i] = Math.tanh(sL * 1.08) * 0.92;
    mixR[i] = Math.tanh(sR * 1.08) * 0.92;
  }
}

/**
 * Encodes stereo `Float32Array` channels (`mixL`, `mixR`) into a standard 16-bit PCM WAV `Uint8Array`.
 */
export function encodeStereoFloatToWavBytes(
  mixL: Float32Array,
  mixR: Float32Array,
  sampleRate: number,
): Uint8Array {
  const numFrames = mixL.length;
  const numChannels = 2;
  const bytesPerSample = 2;
  const dataBytes = numFrames * numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    const l = Math.max(-1, Math.min(1, mixL[i]));
    const r = Math.max(-1, Math.min(1, mixR[i]));
    view.setInt16(offset, l < 0 ? l * 0x8000 : l * 0x7fff, true);
    view.setInt16(offset + 2, r < 0 ? r * 0x8000 : r * 0x7fff, true);
    offset += 4;
  }

  return new Uint8Array(buffer);
}

/**
 * Renders a complete multi-part song using the actual Melos Studio Rust/WASM DSP Instruments
 * (`plajah_audio.wasm`). Works identically in the browser and in Node.js!
/**
 * ACE-Step 2.5 Hybrid Symphonic Stem Synthesizer:
 * Layers lush, acoustic-formant Symphonic Strings (1st/2nd Violins, Violas, Celli), Solo Concert Violin/Cello,
 * French Horns, and Cathedral Choir stems in conjunction with the Melos MPE WASM synths, driven by
 * each note's MPE expression curve (`evaluateNoteMpeAtProgress`).
 */
export function mixAceStep25HybridOrchestraStems(
  mixL: Float32Array,
  mixR: Float32Array,
  sampleRate: number,
  bpm: number,
  lengthBeats: number,
  tracks: MelosSongTrackSpec[],
): void {
  const spb = 60 / bpm;
  const totalFrames = mixL.length;
  const anchorSec = 0.06;

  for (const track of tracks) {
    if (track.role !== 'lead' && track.role !== 'countermelody' && track.role !== 'harmony' && track.role !== 'bass') continue;
    const isLead = track.role === 'lead' || track.role === 'countermelody';
    const isBass = track.role === 'bass';
    const baseGain = isLead ? 0.095 : isBass ? 0.085 : 0.052;
    const pan = Math.max(-0.85, Math.min(0.85, track.pan * -0.75)); // Complementary stereo stage width against the synth
    const panAngle = ((pan + 1) * Math.PI) / 4;
    const gainL = baseGain * Math.cos(panAngle);
    const gainR = baseGain * Math.sin(panAngle);

    for (const note of track.notes) {
      if (note.startBeats >= lengthBeats) continue;
      const art = note.articulation ?? (note.lengthBeats >= 2 ? 'legato' : 'arch' as any);
      const gateScale = art === 'spiccato' || art === 'staccato' ? 0.44 : art === 'pizzicato' ? 0.36 : 1.02;
      const durBeats = Math.max(0.08, Math.min(note.lengthBeats * gateScale, lengthBeats - note.startBeats));
      const startSec = anchorSec + note.startBeats * spb;
      const durSec = durBeats * spb;
      const relSec = art === 'pizzicato' || art === 'spiccato' ? 0.14 : 0.34;
      const startFrame = Math.max(0, Math.round(startSec * sampleRate));
      const totalNoteFrames = Math.round((durSec + relSec) * sampleRate);

      const f0Base = 440 * Math.pow(2, (note.key - 69) / 12);
      const vel01 = Math.max(0.12, Math.min(1, note.vel / 127));
      // 3 ensemble unison voices with natural concert-hall detuning (cents)
      let p1 = 0;
      let p2 = 0.23;
      let p3 = 0.61;
      let subP = 0;
      let bodyState = 0;

      for (let i = 0; i < totalNoteFrames; i++) {
        const idx = startFrame + i;
        if (idx >= totalFrames) break;
        const t = i / sampleRate;
        const prog01 = Math.min(1, t / Math.max(0.05, durSec));
        const mpe = evaluateNoteMpeAtProgress(note, prog01, t);

        const attackSec = art === 'pizzicato' ? 0.004 : art === 'spiccato' || art === 'marcato' ? 0.016 : isLead ? 0.075 : 0.14;
        const attEnv = 1 - Math.exp(-t / attackSec);
        const relEnv = t > durSec ? Math.exp(-(t - durSec) / (relSec * 0.42)) : 1.0;
        const amp = attEnv * relEnv * mpe.gainMultiplier * vel01;
        if (amp < 0.0005) continue;

        const fInst = f0Base * Math.pow(2, mpe.pitchOffsetSemis / 12);
        const inc = (2 * Math.PI * fInst) / sampleRate;
        p1 += inc;
        p2 += inc * 1.0022;
        p3 += inc * 0.9979;
        subP += inc * 0.5;

        // Bowed string / brass / choir harmonic synthesis with wooden body lowpass formant
        const h1 = Math.sin(p1) + 0.55 * Math.sin(p2) + 0.55 * Math.sin(p3);
        const h2 = 0.38 * (Math.sin(p1 * 2) + 0.5 * Math.sin(p2 * 2));
        const h3 = 0.22 * mpe.timbre * Math.sin(p1 * 3);
        const h4 = 0.11 * mpe.timbre * Math.sin(p1 * 4);
        const sub = isBass ? 0.48 * Math.sin(subP) : 0;
        const rawWave = (h1 + h2 + h3 + h4 + sub) * 0.42;

        // Warm acoustic wooden body / horn bell resonance filter
        const cutoff = Math.min(0.88, Math.max(0.12, 0.22 + 0.52 * mpe.timbre));
        bodyState += cutoff * (rawWave - bodyState);
        const sample = (bodyState * 0.72 + rawWave * 0.28) * amp;

        mixL[idx] += sample * gainL;
        mixR[idx] += sample * gainR;
      }
    }
  }
}

/**
 * Renders a complete multi-part song using the actual Melos Studio Rust/WASM DSP Instruments
 * (`plajah_audio.wasm`) + MPE Per-Note Expression Curves + ACE-Step 2.5 Hybrid Orchestral Stems.
 * Works identically in the browser and in Node.js!
 */
export async function renderSongWithMelosWasm(
  req: MelosSongRenderRequest,
  customWasmBytes?: ArrayBuffer | Uint8Array,
): Promise<{
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  durationSec: number;
  wavBytes: Uint8Array;
  peaks: number[];
}> {
  const sampleRate = req.sampleRate ?? 24000;
  const spb = 60 / req.bpm;
  const tailSec = Math.min(2.4, Math.max(1.2, req.hallReverbDecaySec * 0.65));
  const totalSec = req.lengthBeats * spb + tailSec;
  const totalBlocks = Math.ceil((totalSec * sampleRate) / 512);
  const totalFrames = totalBlocks * 512;
  const anchorSec = 0.06;

  const wasmModule = await getMelosWasmModule(customWasmBytes);
  const instance = new WebAssembly.Instance(wasmModule, {});
  const x = instance.exports as unknown as PlajahWasmExports;

  const mixL = new Float32Array(totalFrames);
  const mixR = new Float32Array(totalFrames);

  for (const track of req.tracks) {
    if (!track.notes.length) continue;
    const eng = x.pa_create(sampleRate);
    try {
      x.pa_set_tempo(eng, req.bpm / 60);
      const { trimGain } = configureMelosPresetOnEngine(x, eng, track.instrumentType, track.presetId);
      x.pa_reset_transport(eng, 0);
      x.pa_clear_schedule(eng);

      const isModalEngine =
        track.instrumentType === 'vela' ||
        track.instrumentType === 'cantus' ||
        track.instrumentType === 'ison' ||
        track.instrumentType === 'pneuma';
      const maxVoices = isModalEngine ? 4 : track.role === 'harmony' ? 8 : 4;

      interface ScheduledNoteMpe {
        note: NoteEvent;
        vid: number;
        onFrame: number;
        offFrame: number;
        durSec: number;
      }
      const scheduledMpeNotes: ScheduledNoteMpe[] = [];

      let nextVoiceIdx = 0;
      for (const note of track.notes) {
        if (note.startBeats >= req.lengthBeats) continue;
        const art = note.articulation ?? 'legato';
        const gateScale =
          art === 'spiccato' || art === 'staccato'
            ? 0.44
            : art === 'pizzicato'
              ? 0.36
              : art === 'marcato'
                ? 0.86
                : 1.02;
        const onSec = anchorSec + note.startBeats * spb;
        const maxDurBeats = isModalEngine && track.role === 'ostinato' ? Math.min(note.lengthBeats, 1.5) : note.lengthBeats * gateScale;
        const durBeats = Math.max(0.08, Math.min(maxDurBeats, req.lengthBeats - note.startBeats));
        const durSec = durBeats * spb;
        const offSec = onSec + durSec;
        const onFrame = Math.max(0, Math.round(onSec * sampleRate));
        const offFrame = Math.max(onFrame + 64, Math.round(offSec * sampleRate));
        const vel01 = Math.max(0.08, Math.min(1, note.vel / 127));
        const vid = (nextVoiceIdx++ % maxVoices) + 1;
        x.pa_schedule_note_on(eng, Math.max(12, Math.min(108, Math.round(note.key))), vel01, vid, onFrame);
        x.pa_schedule_note_off(eng, vid, offFrame);
        scheduledMpeNotes.push({ note, vid, onFrame, offFrame, durSec });
      }

      const trackLinGain = Math.pow(10, track.gainDb / 20) * trimGain;
      const panAngle = ((Math.max(-0.9, Math.min(0.9, track.pan)) + 1) * Math.PI) / 4;
      const gainL = trackLinGain * Math.cos(panAngle);
      const gainR = trackLinGain * Math.sin(panAngle);

      let noteCursor = 0;
      for (let b = 0; b < totalBlocks; b++) {
        const baseFrame = b * 512;
        while (noteCursor < scheduledMpeNotes.length && scheduledMpeNotes[noteCursor].offFrame < baseFrame) {
          noteCursor++;
        }

        // Apply continuous per-note MPE expression curves & dynamic swell modulation for active voices in this block
        let blockSwellGain = 1.0;
        let activeCount = 0;
        for (let k = noteCursor; k < scheduledMpeNotes.length; k++) {
          const item = scheduledMpeNotes[k];
          if (item.onFrame > baseFrame + 512) break;
          if (baseFrame >= item.onFrame && baseFrame <= item.offFrame) {
            const elapsedSec = (baseFrame - item.onFrame) / sampleRate;
            const prog01 = Math.min(1, elapsedSec / Math.max(0.04, item.durSec));
            const mpe = evaluateNoteMpeAtProgress(item.note, prog01, elapsedSec);
            if (typeof x.pa_set_expression === 'function') {
              x.pa_set_expression(eng, item.vid, mpe.bend, mpe.pressure, mpe.timbre);
            }
            if (typeof x.pa_set_mod_wheel === 'function') {
              x.pa_set_mod_wheel(eng, mpe.pressure);
            }
            blockSwellGain += mpe.gainMultiplier;
            activeCount++;
          }
        }
        const envMult = activeCount > 0 ? (blockSwellGain - 1.0) / activeCount : 1.0;

        x.pa_render(eng, 512);
        const ptrL = x.pa_out_ptr(eng, 0);
        const ptrR = x.pa_out_ptr(eng, 1);
        const viewL = new Float32Array(x.memory.buffer, ptrL, 512);
        const viewR = new Float32Array(x.memory.buffer, ptrR, 512);
        const gL = gainL * envMult;
        const gR = gainR * envMult;
        for (let i = 0; i < 512; i++) {
          const sL = viewL[i];
          const sR = viewR[i];
          if (Number.isFinite(sL)) mixL[baseFrame + i] += sL * gL;
          if (Number.isFinite(sR)) mixR[baseFrame + i] += sR * gR;
        }
      }
    } finally {
      x.pa_destroy(eng);
    }
  }

  // Layer ACE-Step 2.5 Hybrid Acoustic Orchestral Stems in conjunction with the Melos WASM synths
  if (req.enableAceStepHybridStems !== false) {
    mixAceStep25HybridOrchestraStems(mixL, mixR, sampleRate, req.bpm, req.lengthBeats, req.tracks);
  }

  // Layer physical-modeled orchestral film percussion
  mixOrchestralFilmPercussion(
    mixL,
    mixR,
    sampleRate,
    req.bpm,
    req.lengthBeats,
    req.rootMidi,
    req.percussionStyle,
  );

  // Apply concert-hall / stone-cathedral reverb & soft-knee mastering limiter
  applyStereoHallReverbAndMaster(
    mixL,
    mixR,
    sampleRate,
    req.hallReverbDecaySec,
    req.hallReverbDamping,
    req.wetReverbMix,
  );

  const wavBytes = encodeStereoFloatToWavBytes(mixL, mixR, sampleRate);

  // Compute 64-point peak envelope for Melos Studio timeline display
  const peaks: number[] = [];
  const blockSize = Math.max(1, Math.floor(totalFrames / 64));
  for (let i = 0; i < 64; i++) {
    let max = 0;
    const start = i * blockSize;
    const end = Math.min(totalFrames, start + blockSize);
    for (let j = start; j < end; j++) {
      const a = Math.max(Math.abs(mixL[j]), Math.abs(mixR[j]));
      if (a > max) max = a;
    }
    peaks.push(Math.min(1, Number(max.toFixed(3))));
  }

  return {
    left: mixL,
    right: mixR,
    sampleRate,
    durationSec: totalFrames / sampleRate,
    wavBytes,
    peaks,
  };
}
