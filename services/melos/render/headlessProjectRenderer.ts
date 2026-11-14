// Chora — Headless Project & Brief Audio Renderer (`headlessProjectRenderer.ts`).
//
// Completes Phase 5 ("Audio to MIDI and back: headless project renderer"):
//   - Renders an entire `GrooveDoc` (instrument clips via `clipContent.ts` `noteOccurrences`,
//     drum pattern clips, `TempoMap`/`MeterMap` via `songTime(doc)` — never `60 / bpm`) OR a
//     compiled `SongBrief` to interleaved/split stereo PCM + RIFF/WAVE bytes in headless Node.js
//     without browser `OfflineAudioContext`.
//   - Default `'dsp'` backend is pure TypeScript (zero WASM/DOM dependencies) for deterministic
//     offline rendering and CI testing; an optional `wasmTrackRenderer` callback lets callers
//     plug in `plajah_audio.wasm` while keeping backend provenance explicit.
//   - Optionally runs `services/musicIntel/dsp.ts` (`measureAudio`) so callers get measured
//     tempo, key, and BS.1770 integrated loudness alongside the WAV bytes.

import { measureAudio } from '../../musicIntel/dsp';
import type { MeasuredAudio } from '../../musicIntel/types';
import { parseChord } from '../beats/band/chords';
import { noteOccurrences } from '../beats/clipContent';
import type { GrooveDoc, NoteEvent, PadConfig, SynthVoiceId } from '../beats/grooveDoc';
import { songTime } from '../beats/tempoMap';
import type { SongBrief } from '../direct/songBrief';
import type { GenerationRequest } from '../generation/types';

export type HeadlessRenderBackend = 'dsp' | 'wasm-hybrid';

export interface RenderedPitchedNote {
  trackId: string;
  trackName: string;
  startSec: number;
  durSec: number;
  midi: number;
  vel: number;
  pan: number;
  gainLin: number;
  timbre: 'bass' | 'lead' | 'pad' | 'keys';
  articulation?: NoteEvent['articulation'];
}

export interface RenderedDrumHit {
  trackId: string;
  padName: string;
  voice: SynthVoiceId;
  startSec: number;
  vel: number;
  pan: number;
  gainLin: number;
}

export interface HeadlessWasmTrackRenderer {
  (params: {
    trackId: string;
    trackName: string;
    instrumentType: string;
    presetId: string;
    notes: { startSec: number; durSec: number; midi: number; vel: number }[];
    sampleRate: number;
    totalFrames: number;
  }): Promise<{ left: Float32Array; right: Float32Array } | null>;
}

export interface HeadlessRenderOptions {
  sampleRate?: number;
  bitDepth?: 16 | 24;
  tailSec?: number;
  maxDurationSec?: number;
  /** Target integrated LUFS override; when omitted in `renderBriefHeadless`, uses pack midpoint. */
  targetLufs?: number;
  /** Run `services/musicIntel/dsp.ts` `measureAudio` on the render (default true). */
  measure?: boolean;
  /** Optional `plajah_audio.wasm` track renderer; unrendered tracks fall back to pure TS DSP and are reported honestly. */
  wasmTrackRenderer?: HeadlessWasmTrackRenderer;
}

export interface HeadlessRenderResult {
  backend: HeadlessRenderBackend;
  fallbackUsed: boolean;
  sampleRate: number;
  bitDepth: 16 | 24;
  durationSec: number;
  frames: number;
  left: Float32Array;
  right: Float32Array;
  wavBytes: Uint8Array;
  renderedTracks: string[];
  noteCount: number;
  drumHitCount: number;
  measured: MeasuredAudio | null;
}

const dbToLin = (db: number): number => Math.pow(10, Math.max(-70, Math.min(12, db)) / 20);
const midiToHz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

function encodeStereoWav(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  bitDepth: 16 | 24,
): Uint8Array {
  const frames = Math.min(left.length, right.length);
  const numCh = 2;
  const bytesPer = bitDepth / 8;
  const dataLen = frames * numCh * bytesPer;
  const buf = new Uint8Array(44 + dataLen);
  const view = new DataView(buf.buffer);
  const ws = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) buf[off + i] = s.charCodeAt(i);
  };
  ws(0, 'RIFF');
  view.setUint32(4, 36 + dataLen, true);
  ws(8, 'WAVE');
  ws(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numCh * bytesPer, true);
  view.setUint16(32, numCh * bytesPer, true);
  view.setUint16(34, bitDepth, true);
  ws(36, 'data');
  view.setUint32(40, dataLen, true);

  let off = 44;
  for (let i = 0; i < frames; i++) {
    const ch = [left[i], right[i]];
    for (let c = 0; c < 2; c++) {
      const s = Math.max(-1, Math.min(1, ch[c]));
      if (bitDepth === 16) {
        view.setInt16(off, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true);
        off += 2;
      } else {
        const v = Math.round(s < 0 ? s * 0x800000 : s * 0x7fffff);
        buf[off] = v & 0xff;
        buf[off + 1] = (v >> 8) & 0xff;
        buf[off + 2] = (v >> 16) & 0xff;
        off += 3;
      }
    }
  }
  return buf;
}

function classifyTimbre(name: string, instType?: string): RenderedPitchedNote['timbre'] {
  const n = `${name} ${instType ?? ''}`.toLowerCase();
  if (/bass|bajo|sub|808|contrabass|cello/.test(n)) return 'bass';
  if (/pad|ison|vela|strings|choir|atmos|cantus/.test(n)) return 'pad';
  if (/lead|melody|vocal|flute|pneuma|sax|trumpet|violin/.test(n)) return 'lead';
  return 'keys';
}

function inferDrumVoice(pad: PadConfig): SynthVoiceId {
  if (pad.synthVoice) return pad.synthVoice;
  const n = pad.name.toLowerCase();
  if (/kick|bd|808|sub/.test(n)) return /sub/.test(n) ? 'sub' : 'kick';
  if (/snare|sd|rim/.test(n)) return 'snare';
  if (/clap|cp/.test(n)) return 'clap';
  if (/open/.test(n)) return 'hat-open';
  return 'hat-closed';
}

function renderPitchedNoteInto(
  mixL: Float32Array,
  mixR: Float32Array,
  sampleRate: number,
  ev: RenderedPitchedNote,
): void {
  const startFrame = Math.max(0, Math.round(ev.startSec * sampleRate));
  if (startFrame >= mixL.length) return;
  const vel01 = Math.max(0.05, Math.min(1, ev.vel / 127));
  const hz = midiToHz(Math.max(12, Math.min(108, ev.midi)));

  const artScale =
    ev.articulation === 'staccato' || ev.articulation === 'spiccato'
      ? 0.42
      : ev.articulation === 'pizzicato'
        ? 0.35
        : 1.0;

  const holdSec = Math.max(0.03, ev.durSec * artScale);
  const attackSec = ev.timbre === 'pad' ? Math.min(0.12, holdSec * 0.35) : 0.008;
  const releaseSec = ev.timbre === 'pad' ? 0.35 : ev.timbre === 'bass' ? 0.12 : 0.18;
  const totalSec = holdSec + releaseSec;
  const nFrames = Math.min(mixL.length - startFrame, Math.ceil(totalSec * sampleRate));

  const panAngle = ((Math.max(-1, Math.min(1, ev.pan)) + 1) * Math.PI) / 4;
  const amp = vel01 * ev.gainLin * (ev.timbre === 'pad' ? 0.18 : 0.24);
  const gainL = amp * Math.cos(panAngle);
  const gainR = amp * Math.sin(panAngle);

  const attackSamples = Math.max(1, Math.round(attackSec * sampleRate));
  const holdSamples = Math.max(1, Math.round(holdSec * sampleRate));
  const releaseSamples = Math.max(1, Math.round(releaseSec * sampleRate));
  const twoPi = 2 * Math.PI;

  for (let i = 0; i < nFrames; i++) {
    const t = i / sampleRate;
    let env = 1;
    if (i < attackSamples) {
      env = i / attackSamples;
    } else if (i > holdSamples) {
      const rPos = (i - holdSamples) / releaseSamples;
      env = Math.max(0, 1 - rPos);
      env = env * env;
    }

    let osc: number;
    const ph = twoPi * hz * t;
    if (ev.timbre === 'bass') {
      osc = 0.72 * Math.sin(ph) + 0.22 * Math.sin(2 * ph) + 0.06 * Math.sin(3 * ph);
    } else if (ev.timbre === 'pad') {
      osc =
        0.55 * Math.sin(ph) +
        0.25 * Math.sin(ph * 1.002 + 0.4) +
        0.14 * Math.sin(2 * ph) +
        0.06 * Math.sin(3 * ph);
    } else if (ev.timbre === 'lead') {
      osc = 0.65 * Math.sin(ph) + 0.23 * Math.sin(2 * ph) + 0.12 * Math.sin(3 * ph);
    } else {
      const brightDecay = Math.exp(-t * 4.5);
      osc = 0.62 * Math.sin(ph) + 0.26 * brightDecay * Math.sin(2 * ph) + 0.12 * brightDecay * Math.sin(3 * ph);
    }

    const s = osc * env;
    const idx = startFrame + i;
    mixL[idx] += s * gainL;
    mixR[idx] += s * gainR;
  }
}

function renderDrumHitInto(
  mixL: Float32Array,
  mixR: Float32Array,
  sampleRate: number,
  hit: RenderedDrumHit,
  seedState: { x: number },
): void {
  const startFrame = Math.max(0, Math.round(hit.startSec * sampleRate));
  if (startFrame >= mixL.length) return;
  const vel01 = Math.max(0.08, Math.min(1, hit.vel / 127));
  const panAngle = ((Math.max(-1, Math.min(1, hit.pan)) + 1) * Math.PI) / 4;
  const amp = vel01 * hit.gainLin * 0.42;
  const gainL = amp * Math.cos(panAngle);
  const gainR = amp * Math.sin(panAngle);

  const durSec =
    hit.voice === 'kick' || hit.voice === 'sub'
      ? 0.28
      : hit.voice === 'hat-open'
        ? 0.25
        : hit.voice === 'snare' || hit.voice === 'clap'
          ? 0.18
          : 0.08;
  const nFrames = Math.min(mixL.length - startFrame, Math.ceil(durSec * sampleRate));

  let phase = 0;
  for (let i = 0; i < nFrames; i++) {
    const t = i / sampleRate;
    seedState.x = (Math.imul(1664525, seedState.x) + 1013904223) >>> 0;
    const noise = (seedState.x / 0xffffffff) * 2 - 1;

    let sample = 0;
    if (hit.voice === 'kick' || hit.voice === 'sub') {
      const f = hit.voice === 'sub' ? 52 + 45 * Math.exp(-t * 28) : 48 + 110 * Math.exp(-t * 36);
      phase += (2 * Math.PI * f) / sampleRate;
      const env = Math.exp(-t * (hit.voice === 'sub' ? 7 : 12));
      sample = Math.sin(phase) * env;
    } else if (hit.voice === 'snare' || hit.voice === 'clap') {
      const body = Math.sin(2 * Math.PI * 185 * t) * Math.exp(-t * 26) * 0.45;
      const snap = noise * Math.exp(-t * (hit.voice === 'clap' ? 20 : 16)) * 0.65;
      sample = body + snap;
    } else {
      const decay = hit.voice === 'hat-open' ? 11 : 45;
      const metallic =
        Math.sin(2 * Math.PI * 3140 * t) * 0.25 +
        Math.sin(2 * Math.PI * 4890 * t) * 0.2 +
        noise * 0.55;
      sample = metallic * Math.exp(-t * decay);
    }

    const idx = startFrame + i;
    mixL[idx] += sample * gainL;
    mixR[idx] += sample * gainR;
  }
}

function finalizeMix(
  mixL: Float32Array,
  mixR: Float32Array,
  sampleRate: number,
  bitDepth: 16 | 24,
  targetLufs?: number,
): { wavBytes: Uint8Array; measured: MeasuredAudio | null } {
  const frames = mixL.length;
  // Soft peak safety limiter first
  let peak = 0;
  for (let i = 0; i < frames; i++) {
    peak = Math.max(peak, Math.abs(mixL[i]), Math.abs(mixR[i]));
  }
  if (peak > 0.92) {
    const scale = 0.9 / peak;
    for (let i = 0; i < frames; i++) {
      mixL[i] *= scale;
      mixR[i] *= scale;
    }
  }

  if (targetLufs !== undefined && Number.isFinite(targetLufs)) {
    const interleavedPre = new Float32Array(frames * 2);
    for (let i = 0; i < frames; i++) {
      interleavedPre[i * 2] = mixL[i];
      interleavedPre[i * 2 + 1] = mixR[i];
    }
    const preMeas = measureAudio(interleavedPre, sampleRate, 2);
    if (preMeas.integratedLufs !== null && Number.isFinite(preMeas.integratedLufs)) {
      const deltaDb = Math.max(-18, Math.min(18, targetLufs - preMeas.integratedLufs));
      let gain = Math.pow(10, deltaDb / 20);
      let newPeak = 0;
      for (let i = 0; i < frames; i++) {
        newPeak = Math.max(newPeak, Math.abs(mixL[i] * gain), Math.abs(mixR[i] * gain));
      }
      if (newPeak > 0.95) gain *= 0.95 / newPeak;
      for (let i = 0; i < frames; i++) {
        mixL[i] *= gain;
        mixR[i] *= gain;
      }
    }
  }

  const interleaved = new Float32Array(frames * 2);
  for (let i = 0; i < frames; i++) {
    interleaved[i * 2] = mixL[i];
    interleaved[i * 2 + 1] = mixR[i];
  }
  const measured = frames > sampleRate * 0.2 ? measureAudio(interleaved, sampleRate, 2) : null;
  const wavBytes = encodeStereoWav(mixL, mixR, sampleRate, bitDepth);
  return { wavBytes, measured };
}

/**
 * Headless Node.js renderer for a whole `GrooveDoc` project.
 * Walks `songTime(doc)` (`TempoMap` + `MeterMap`) so variable-tempo projects render accurately.
 */
export async function renderGrooveHeadless(
  doc: GrooveDoc,
  opts: HeadlessRenderOptions = {},
): Promise<HeadlessRenderResult> {
  const sampleRate = opts.sampleRate ?? 22050;
  const bitDepth = opts.bitDepth ?? 16;
  const tailSec = opts.tailSec ?? 0.6;
  const { tempo } = songTime(doc);

  let endBeats = 4;
  for (const t of doc.arrangement) {
    for (const c of t.clips) {
      endBeats = Math.max(endBeats, c.startBeats + c.lengthBeats);
    }
  }
  const rawDurationSec = tempo.beatToSec(endBeats) + tailSec;
  const durationSec = opts.maxDurationSec ? Math.min(rawDurationSec, opts.maxDurationSec) : rawDurationSec;
  const frames = Math.max(1, Math.ceil(durationSec * sampleRate));

  const mixL = new Float32Array(frames);
  const mixR = new Float32Array(frames);
  const anySolo = doc.arrangement.some((t) => t.solo);
  const renderedTracks: string[] = [];
  let noteCount = 0;
  let drumHitCount = 0;
  let usedWasm = false;
  let fallbackUsed = false;

  const anchorSec = 0.04;
  const seedState = { x: 0x51a7b3c9 };

  for (const track of doc.arrangement) {
    if (track.mute) continue;
    if (anySolo && !track.solo) continue;

    const trackGain = dbToLin(track.gainDb ?? 0);
    const trackPan = Math.max(-1, Math.min(1, track.pan ?? 0));

    if (track.kind === 'instrument') {
      const notes: RenderedPitchedNote[] = [];
      const timbre = classifyTimbre(track.name || '', track.instrument?.type);
      for (const clip of track.clips) {
        if (clip.muted) continue;
        for (const occ of noteOccurrences(clip)) {
          const onSec = anchorSec + tempo.beatToSec(occ.songBeat);
          const offSec = anchorSec + tempo.beatToSec(occ.songBeat + occ.lengthBeats);
          if (onSec >= durationSec) continue;
          notes.push({
            trackId: track.id,
            trackName: track.name || 'Instrument',
            startSec: onSec,
            durSec: Math.max(0.03, offSec - onSec),
            midi: occ.note.key,
            vel: occ.note.vel,
            pan: trackPan,
            gainLin: trackGain,
            timbre,
            articulation: occ.note.articulation,
          });
        }
      }
      if (!notes.length) continue;
      renderedTracks.push(track.id);
      noteCount += notes.length;

      let wasmRendered = false;
      if (opts.wasmTrackRenderer && track.instrument) {
        const rendered = await opts.wasmTrackRenderer({
          trackId: track.id,
          trackName: track.name || 'Instrument',
          instrumentType: track.instrument.type,
          presetId: track.instrument.patch?.presetId ?? '',
          notes: notes.map((n) => ({
            startSec: n.startSec,
            durSec: n.durSec,
            midi: n.midi,
            vel: n.vel,
          })),
          sampleRate,
          totalFrames: frames,
        });
        if (rendered) {
          usedWasm = true;
          wasmRendered = true;
          const len = Math.min(frames, rendered.left.length, rendered.right.length);
          for (let i = 0; i < len; i++) {
            mixL[i] += rendered.left[i] * trackGain;
            mixR[i] += rendered.right[i] * trackGain;
          }
        } else {
          fallbackUsed = true;
        }
      }

      if (!wasmRendered) {
        for (const n of notes) renderPitchedNoteInto(mixL, mixR, sampleRate, n);
      }
      continue;
    }

    if (track.kind === 'pattern') {
      const anyPadSolo = doc.kit.some((p) => !p.empty && p.solo);
      let trackHits = 0;
      for (const clip of track.clips) {
        if (clip.muted || !clip.patternId) continue;
        const pat = doc.patterns.find((p) => p.id === clip.patternId);
        if (!pat) continue;
        const patBeats = pat.length / 4;
        const clipEnd = clip.startBeats + clip.lengthBeats;
        for (let repStart = clip.startBeats; repStart < clipEnd - 1e-6; repStart += patBeats) {
          for (const [padStr, stepMap] of Object.entries(pat.steps)) {
            const pad = doc.kit[Number(padStr)];
            if (!pad || pad.empty || pad.mute || (anyPadSolo && !pad.solo) || !stepMap) continue;
            const voice = inferDrumVoice(pad);
            const padGain = trackGain * dbToLin(pad.gainDb ?? 0);
            const padPan = Math.max(-1, Math.min(1, trackPan + (pad.pan ?? 0)));
            for (const [stepStr, step] of Object.entries(stepMap)) {
              const stepIdx = Number(stepStr);
              if (!Number.isFinite(stepIdx) || stepIdx < 0 || stepIdx >= pat.length || !step) continue;
              const beat = repStart + stepIdx * 0.25;
              if (beat >= clipEnd - 1e-6) continue;
              const startSec = anchorSec + tempo.beatToSec(beat);
              if (startSec >= durationSec) continue;
              renderDrumHitInto(
                mixL,
                mixR,
                sampleRate,
                {
                  trackId: track.id,
                  padName: pad.name,
                  voice,
                  startSec,
                  vel: step.v ?? 100,
                  pan: Math.max(-1, Math.min(1, step.pan ?? padPan)),
                  gainLin: padGain,
                },
                seedState,
              );
              trackHits++;
            }
          }
        }
      }
      if (trackHits > 0) {
        renderedTracks.push(track.id);
        drumHitCount += trackHits;
      }
    }
  }

  const { wavBytes, measured } = finalizeMix(
    mixL,
    mixR,
    sampleRate,
    bitDepth,
    opts.targetLufs,
  );

  return {
    backend: usedWasm ? 'wasm-hybrid' : 'dsp',
    fallbackUsed,
    sampleRate,
    bitDepth,
    durationSec: frames / sampleRate,
    frames,
    left: mixL,
    right: mixR,
    wavBytes,
    renderedTracks,
    noteCount,
    drumHitCount,
    measured: opts.measure === false ? null : measured,
  };
}

/**
 * Headless Node.js renderer for a compiled `SongBrief`.
 * Emits tempo/key/loudness-aligned stereo WAV audio that can be fed directly into
 * `scripts/evalChoraDirect.ts --wav-dir <dir>` or used as a cover/guide stem.
 */
export async function renderBriefHeadless(
  brief: SongBrief,
  opts: HeadlessRenderOptions = {},
): Promise<HeadlessRenderResult> {
  const sampleRate = opts.sampleRate ?? 22050;
  const bitDepth = opts.bitDepth ?? 16;
  const tailSec = opts.tailSec ?? 0.5;
  const spb = 60 / Math.max(30, brief.bpm);
  const totalBeats = Math.max(4, brief.totalBars * brief.beatsPerBar);
  const rawSec = totalBeats * spb + tailSec;
  const durationSec = opts.maxDurationSec ? Math.min(rawSec, opts.maxDurationSec) : rawSec;
  const frames = Math.max(1, Math.ceil(durationSec * sampleRate));

  const mixL = new Float32Array(frames);
  const mixR = new Float32Array(frames);
  const anchorSec = 0.04;
  const seedState = { x: 0x2468ace1 };

  let noteCount = 0;
  let drumHitCount = 0;
  const tonicRootMidi = 48 + brief.key.tonic;

  for (const sec of brief.sections) {
    const dynScale = 0.55 + sec.energy * 0.45;
    for (let barOffset = 0; barOffset < sec.bars; barOffset++) {
      const absBar = sec.startBar + barOffset;
      const barStartBeat = absBar * brief.beatsPerBar;
      const barStartSec = anchorSec + barStartBeat * spb;
      if (barStartSec >= durationSec) break;

      const barChords = sec.chords[barOffset % sec.chords.length] ?? ['C'];
      const slotBeats = brief.beatsPerBar / barChords.length;

      barChords.forEach((sym, slotIdx) => {
        const pcs = parseChord(sym);
        const startBeat = barStartBeat + slotIdx * slotBeats;
        const startSec = anchorSec + startBeat * spb;
        const durSec = Math.max(0.08, slotBeats * spb * 0.92);
        if (startSec >= durationSec) return;

        const chordPcs = pcs?.length ? pcs : [brief.key.tonic];
        const rootPc = chordPcs[0];
        // Bass note on root (octave 2–3)
        renderPitchedNoteInto(mixL, mixR, sampleRate, {
          trackId: 'brief-bass',
          trackName: 'Bass',
          startSec,
          durSec: durSec * 0.9,
          midi: 36 + rootPc,
          vel: Math.round(92 * dynScale),
          pan: 0,
          gainLin: 0.9,
          timbre: 'bass',
        });
        noteCount++;

        // Chord voicing in octave 4
        chordPcs.slice(0, 4).forEach((pc, voiceIdx) => {
          const midi = 60 + pc + (voiceIdx === 0 ? -12 : 0);
          renderPitchedNoteInto(mixL, mixR, sampleRate, {
            trackId: 'brief-harmony',
            trackName: 'Harmony',
            startSec,
            durSec,
            midi: Math.max(48, Math.min(84, midi)),
            vel: Math.round(74 * dynScale),
            pan: voiceIdx % 2 === 0 ? -0.25 : 0.25,
            gainLin: 0.55,
            timbre: 'keys',
          });
          noteCount++;
        });
      });

      // Beat-aligned rhythmic pulse / drums so tempo estimation locks tightly
      if (sec.energy >= 0.25) {
        const beatsInBar = Math.max(1, Math.round(brief.beatsPerBar));
        for (let b = 0; b < beatsInBar; b++) {
          const hitSec = anchorSec + (barStartBeat + b) * spb;
          if (hitSec >= durationSec) break;
          const isDownbeat = b === 0;
          const isBackbeat = beatsInBar === 4 && (b === 1 || b === 3);
          renderDrumHitInto(
            mixL,
            mixR,
            sampleRate,
            {
              trackId: 'brief-drums',
              padName: isBackbeat ? 'Snare' : 'Kick',
              voice: isBackbeat ? 'snare' : 'kick',
              startSec: hitSec,
              vel: Math.round((isDownbeat ? 112 : isBackbeat ? 102 : 84) * dynScale),
              pan: 0,
              gainLin: 0.85,
            },
            seedState,
          );
          drumHitCount++;
        }
      }
    }
  }

  // Subtle tonic anchor if section list was empty
  if (!brief.sections.length) {
    renderPitchedNoteInto(mixL, mixR, sampleRate, {
      trackId: 'brief-harmony',
      trackName: 'Harmony',
      startSec: anchorSec,
      durSec: Math.min(2, durationSec - anchorSec),
      midi: tonicRootMidi,
      vel: 90,
      pan: 0,
      gainLin: 0.8,
      timbre: 'pad',
    });
    noteCount++;
  }

  const lufsMid = (brief.pack.mix.lufs[0] + brief.pack.mix.lufs[1]) / 2;
  const { wavBytes, measured } = finalizeMix(
    mixL,
    mixR,
    sampleRate,
    bitDepth,
    opts.targetLufs ?? lufsMid,
  );

  return {
    backend: 'dsp',
    fallbackUsed: false,
    sampleRate,
    bitDepth,
    durationSec: frames / sampleRate,
    frames,
    left: mixL,
    right: mixR,
    wavBytes,
    renderedTracks: ['brief-bass', 'brief-harmony', 'brief-drums'],
    noteCount,
    drumHitCount,
    measured: opts.measure === false ? null : measured,
  };
}

/**
 * Score-conditioned audio rendering hand-off (Phase 5):
 * Renders a deterministic guide/backing WAV from a `SongBrief`, encodes it as base64, and returns
 * a validated ACE-Step `cover` or `lego` `GenerationRequest` ready for `/api/admin/music-lab`.
 */
export async function buildScoreConditionedAceRequest(
  brief: SongBrief,
  opts: HeadlessRenderOptions & {
    task?: 'cover' | 'lego';
    coverStrength?: number;
    trackName?: 'vocals' | 'drums' | 'bass' | 'guitar' | 'keyboard';
  } = {},
): Promise<{ render: HeadlessRenderResult; request: GenerationRequest }> {
  const render = await renderBriefHeadless(brief, {
    maxDurationSec: opts.maxDurationSec ?? Math.min(60, brief.seconds),
    sampleRate: opts.sampleRate ?? 22050,
    bitDepth: opts.bitDepth ?? 16,
    measure: opts.measure,
    targetLufs: opts.targetLufs,
  });
  const base64 = Buffer.from(render.wavBytes).toString('base64');
  const task = opts.task ?? 'cover';
  const tags = [
    brief.pack.renderTags.slice(0, 4).join(', '),
    `${brief.bpm} bpm`,
    brief.keyName,
  ]
    .filter(Boolean)
    .join(', ');

  const bars = Math.max(1, Math.min(128, Math.round(brief.totalBars || 8)));
  const seconds = Math.max(1, Math.min(360, Math.round(render.durationSec)));
  const seed = 42;

  const request: GenerationRequest =
    task === 'lego'
      ? {
          engine: 'ace-step',
          kind: 'audio',
          task: 'lego',
          prompt: tags,
          bpm: brief.bpm,
          bars,
          seconds,
          key: brief.keyName,
          seed,
          sourceAudio: base64,
          trackName: opts.trackName ?? 'vocals',
          windowStartSec: 0,
          windowEndSec: Math.round(render.durationSec * 10) / 10,
        }
      : {
          engine: 'ace-step',
          kind: 'audio',
          task: 'cover',
          prompt: tags,
          bpm: brief.bpm,
          bars,
          seconds,
          key: brief.keyName,
          seed,
          sourceAudio: base64,
          coverStrength: opts.coverStrength ?? 0.65,
        };

  return { render, request };
}
