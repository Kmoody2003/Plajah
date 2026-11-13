// Chora — Stem-aware Audio to MIDI routing (`stemTranscribe.ts`).
//
// Given already-separated stems (`bass`, `drums`, `vocals`, `other`), routes each stem to the
// existing Plajah transcriber built for that signal class:
//   - `drums`  → `services/drumTranscription.ts` (`transcribeDrumsFromBuffer`: heuristic 3-band flux DSP)
//   - `vocals` → `services/melos/beats/voice/pitchTrack.ts` (`trackBuffer` + `eventsToNotes`: YIN + singing segmenter)
//   - `bass`   → `services/melos/beats/voice/pitchTrack.ts` (`yin` + `NoteSegmenter` configured for 32–360 Hz bass fundamentals)
//   - `other`  → `services/basicPitchBackend.ts` (`transcribeWithBasicPitch`: polyphonic Basic Pitch CNN)
//
// Honest scope & Demucs status (per house rule 5):
//   - This module does NOT perform stem separation. `services/demucsClient.ts` is unverified and
//     its ~90 MB `htdemucs.onnx` model is not committed in `public/models/demucs/` (see
//     `DEMUCS_VERIFICATION_REPORT` below for the exact steps required to verify it).
//   - If `transcribeWithBasicPitch` cannot run (e.g. headless Node without WebAudio/WebGL or
//     missing `/models/basic-pitch/model.json`), `other` reports `status: 'unavailable'` with the
//     actual error rather than silently substituting monophonic or chord-template notes under
//     Basic Pitch's name.

import { transcribeWithBasicPitch, type BasicPitchOptions, type BPNote } from '../../basicPitchBackend';
import { transcribeDrumsFromBuffer, type DrumClass, type DrumHit } from '../../drumTranscription';
import type { GrooveDoc } from '../beats/grooveDoc';
import { DEFAULT_GRID, snapBeat, type GridSettings } from '../beats/snapGrid';
import { MeterMap, songTime, TempoMap } from '../beats/tempoMap';
import {
  decimate,
  DEFAULT_SEGMENTER,
  eventsToNotes,
  NoteSegmenter,
  rmsDb,
  trackBuffer,
  yin,
  type SegmenterOptions,
} from '../beats/voice/pitchTrack';
import type { Chair } from '../direct/styleKnowledge';

export type StemName = 'bass' | 'drums' | 'vocals' | 'other';
export type TranscriberBackendId = 'flux-dsp' | 'yin-voice' | 'yin-bass' | 'basic-pitch';

export interface StemAudioInput {
  pcm: Float32Array;
  sampleRate: number;
  /** Optional URL passed to `transcribeWithBasicPitch` alongside `opts.pcm`. */
  url?: string;
}

export type SeparatedStemsInput = Partial<Record<StemName, StemAudioInput>>;

export interface TranscribedMidiNote {
  startBeats: number;
  lengthBeats: number;
  startSec: number;
  durSec: number;
  key: number;
  vel: number;
  drumClass?: DrumClass;
}

export interface TranscribedStemTrack {
  stem: StemName;
  /** Suggested Chora Session Band / Timeline chair for this stem. */
  role: Chair | 'vocals';
  backend: TranscriberBackendId;
  status: 'ok' | 'empty' | 'unavailable';
  notes: TranscribedMidiNote[];
  drumHits?: DrumHit[];
  confidence?: number;
  warning?: string;
}

export interface StemTranscribeOptions {
  /** GrooveDoc time/meter reference (uses `songTime(doc)` — never `60 / bpm`). */
  doc?: Pick<GrooveDoc, 'bpm' | 'tempoMap' | 'meter'>;
  /** Constant BPM when no `doc` is provided (default 120). */
  bpm?: number;
  /** Optional beat-grid quantisation via `snapGrid.ts`. Off by default to preserve micro-timing. */
  quantize?: GridSettings;
  signal?: AbortSignal;
  /** Optional override for `transcribeWithBasicPitch` (used by fixture tests without TFJS/model downloads). */
  basicPitchRunner?: (url: string, opts: BasicPitchOptions) => Promise<BPNote[]>;
  vocalSegmenter?: Partial<SegmenterOptions>;
  bassSegmenter?: Partial<SegmenterOptions>;
}

export interface StemTranscribeResult {
  tracks: TranscribedStemTrack[];
  demucsVerified: false;
}

/** Standard General MIDI drum keys matching Melos drum kits. */
const DRUM_MIDI: Record<DrumClass, number> = {
  KICK: 36,
  SNARE: 38,
  HIHAT: 42,
};

const STEM_ROLE: Record<StemName, Chair | 'vocals'> = {
  drums: 'drums',
  bass: 'bass',
  vocals: 'vocals',
  other: 'piano',
};

/**
 * Inspection report for `services/demucsClient.ts` (G3 deliverable).
 * Kept in code as inspectable metadata as well as documented in `GEMINI_HANDBACK.md`.
 */
export const DEMUCS_VERIFICATION_REPORT = {
  verified: false as const,
  file: 'services/demucsClient.ts',
  blockers: [
    'Model weights `/models/demucs/htdemucs.onnx` (~90 MB, MIT upstream `facebookresearch/demucs`) and ONNX Runtime WASM binaries `/models/demucs/ort/*.wasm` are not vendored in `public/models/demucs/`.',
    'PyTorch `htdemucs` uses complex STFT/iSTFT internally; verifying `demucsClient.ts` requires confirming the exported ONNX graph embeds real-valued STFT/iSTFT wrappers accepting `[1, 2, 343980]` (7.8 s @ 44.1 kHz stereo) waveform input and emitting `[1, 4, 2, 343980]` in exact `SOURCE_ORDER = ["drums", "bass", "other", "vocals"]`.',
    'Browser WebAudio decode helper `decodeStereo44k` leaks an unclosed `AudioContext` if `decodeAudioData` rejects, and WebGPU/WASM peak memory (~600–900 MB per 7.8 s chunk) has not been benchmarked across target devices.',
    'Desktop path `invokeNativeStemSeparation` in `windowsBridgeService` requires end-to-end verification of returned local file URLs under WebView2 fetch/CORS rules.',
  ],
} as const;

function trackBassStem(
  pcm: Float32Array,
  sampleRate: number,
  segOpts: Partial<SegmenterOptions> = {},
): { t0: number; t1: number; midi: number; vel: number }[] {
  const opts: Partial<SegmenterOptions> = {
    clarity: 0.68,
    gateDb: -46,
    confirmFrames: 2,
    releaseSec: 0.06,
    changeSemis: 0.75,
    changeFrames: 3,
    minNoteSec: 0.06,
    ...segOpts,
  };
  const seg = new NoteSegmenter(opts);
  // 75 ms window so `tauMax <= win / 2` covers bass fundamentals down to ~30 Hz (B0 = 30.87 Hz).
  const winSec = 0.075;
  const hopSec = 0.012;
  const win = Math.round(winSec * sampleRate);
  const hop = Math.max(1, Math.round(hopSec * sampleRate));
  const factor = sampleRate >= 32000 ? 4 : sampleRate >= 22050 ? 2 : 1;
  const events = [];
  for (let i = 0; i + win <= pcm.length; i += hop) {
    const frame = pcm.subarray(i, i + win);
    const ds = decimate(frame, factor);
    const r = yin(ds, sampleRate / factor, 30, 360, 0.16);
    const t = (i + win / 2) / sampleRate;
    events.push(...seg.push({ t, f0: r?.f0 ?? null, clarity: r?.clarity ?? 0, rmsDb: rmsDb(frame) }));
  }
  events.push(...seg.flush(pcm.length / sampleRate));
  return eventsToNotes(events, opts.minNoteSec ?? DEFAULT_SEGMENTER.minNoteSec);
}

function secondsToBeatSpan(
  startSec: number,
  durSec: number,
  tempo: TempoMap,
  meter: MeterMap,
  quantize?: GridSettings,
): { startBeats: number; lengthBeats: number } {
  const rawStart = Math.max(0, tempo.secToBeat(startSec));
  const rawEnd = Math.max(rawStart + 1 / 32, tempo.secToBeat(startSec + Math.max(0.02, durSec)));
  if (!quantize || quantize.mode === 'off') {
    return {
      startBeats: +rawStart.toFixed(4),
      lengthBeats: +Math.max(1 / 32, rawEnd - rawStart).toFixed(4),
    };
  }
  const snappedStart = snapBeat(rawStart, quantize, meter, 64);
  const snappedEnd = Math.max(
    snappedStart + 1 / 16,
    snapBeat(rawEnd, quantize, meter, 64),
  );
  return {
    startBeats: +snappedStart.toFixed(4),
    lengthBeats: +(snappedEnd - snappedStart).toFixed(4),
  };
}

/**
 * Route separated stems (`drums`, `bass`, `vocals`, `other`) to their dedicated transcribers
 * and return beat-aligned note tracks with Session Band / Chora roles.
 */
export async function transcribeSeparatedStems(
  stems: SeparatedStemsInput,
  opts: StemTranscribeOptions = {},
): Promise<StemTranscribeResult> {
  const { tempo, meter } = opts.doc
    ? songTime(opts.doc as GrooveDoc)
    : { tempo: TempoMap.constant(opts.bpm ?? 120), meter: MeterMap.fromDoc({}) };

  const tracks: TranscribedStemTrack[] = [];
  const order: StemName[] = ['drums', 'bass', 'vocals', 'other'];

  for (const stemName of order) {
    const input = stems[stemName];
    if (!input) continue;
    opts.signal?.throwIfAborted?.();

    if (stemName === 'drums') {
      const durationSec = input.sampleRate > 0 ? input.pcm.length / input.sampleRate : 0;
      const drumRes = transcribeDrumsFromBuffer(input.pcm, input.sampleRate, durationSec, {
        signal: opts.signal,
        bpm: tempo.isConstant ? tempo.bpmAt(0) : undefined,
      });
      const notes: TranscribedMidiNote[] = drumRes.hits.map((hit) => {
        const span = secondsToBeatSpan(hit.time, 0.1, tempo, meter, opts.quantize);
        const vel = Math.max(1, Math.min(127, Math.round(45 + Math.min(3, hit.strength) * 27)));
        return {
          startBeats: span.startBeats,
          lengthBeats: opts.quantize ? span.lengthBeats : 0.25,
          startSec: hit.time,
          durSec: 0.1,
          key: DRUM_MIDI[hit.drum],
          vel,
          drumClass: hit.drum,
        };
      });
      tracks.push({
        stem: 'drums',
        role: STEM_ROLE.drums,
        backend: 'flux-dsp',
        status: notes.length ? 'ok' : 'empty',
        notes,
        drumHits: drumRes.hits,
        confidence: drumRes.confidence,
        warning: drumRes.note,
      });
      continue;
    }

    if (stemName === 'vocals') {
      const segEvents = trackBuffer(input.pcm, input.sampleRate, opts.vocalSegmenter ?? {});
      const rawNotes = eventsToNotes(segEvents, opts.vocalSegmenter?.minNoteSec ?? DEFAULT_SEGMENTER.minNoteSec);
      const notes: TranscribedMidiNote[] = rawNotes.map((n) => {
        const durSec = Math.max(0.04, n.t1 - n.t0);
        const span = secondsToBeatSpan(n.t0, durSec, tempo, meter, opts.quantize);
        return {
          startBeats: span.startBeats,
          lengthBeats: span.lengthBeats,
          startSec: +n.t0.toFixed(4),
          durSec: +durSec.toFixed(4),
          key: Math.max(0, Math.min(127, n.midi)),
          vel: n.vel,
        };
      });
      tracks.push({
        stem: 'vocals',
        role: STEM_ROLE.vocals,
        backend: 'yin-voice',
        status: notes.length ? 'ok' : 'empty',
        notes,
        warning: notes.length ? undefined : 'No sustained monophonic vocal phrases detected.',
      });
      continue;
    }

    if (stemName === 'bass') {
      const rawNotes = trackBassStem(input.pcm, input.sampleRate, opts.bassSegmenter ?? {});
      const notes: TranscribedMidiNote[] = rawNotes.map((n) => {
        const durSec = Math.max(0.05, n.t1 - n.t0);
        const span = secondsToBeatSpan(n.t0, durSec, tempo, meter, opts.quantize);
        return {
          startBeats: span.startBeats,
          lengthBeats: span.lengthBeats,
          startSec: +n.t0.toFixed(4),
          durSec: +durSec.toFixed(4),
          key: Math.max(0, Math.min(127, n.midi)),
          vel: n.vel,
        };
      });
      tracks.push({
        stem: 'bass',
        role: STEM_ROLE.bass,
        backend: 'yin-bass',
        status: notes.length ? 'ok' : 'empty',
        notes,
        warning: notes.length ? undefined : 'No monophonic bass notes detected in 30–360 Hz.',
      });
      continue;
    }

    // `other` (polyphonic harmonic stem) → `services/basicPitchBackend.ts`.
    if (!opts.basicPitchRunner && typeof window === 'undefined') {
      tracks.push({
        stem: 'other',
        role: STEM_ROLE.other,
        backend: 'basic-pitch',
        status: 'unavailable',
        notes: [],
        warning:
          'Basic Pitch polyphonic transcription unavailable in headless Node runtime (browser WebAudio/OfflineAudioContext and `/models/basic-pitch/model.json` required).',
      });
      continue;
    }
    const runner = opts.basicPitchRunner ?? transcribeWithBasicPitch;
    try {
      const bpNotes = await runner(input.url ?? 'memory://other-stem.wav', {
        signal: opts.signal,
        pcm: { data: input.pcm, sampleRate: input.sampleRate },
      });
      const notes: TranscribedMidiNote[] = bpNotes
        .filter((n) => Number.isFinite(n.startSec) && Number.isFinite(n.durSec) && n.durSec > 0)
        .sort((a, b) => a.startSec - b.startSec || a.midi - b.midi)
        .map((n) => {
          const span = secondsToBeatSpan(n.startSec, n.durSec, tempo, meter, opts.quantize);
          return {
            startBeats: span.startBeats,
            lengthBeats: span.lengthBeats,
            startSec: +n.startSec.toFixed(4),
            durSec: +n.durSec.toFixed(4),
            key: Math.max(0, Math.min(127, Math.round(n.midi))),
            vel: Math.max(1, Math.min(127, Math.round((n.velocity ?? 0.75) * 127))),
          };
        });
      tracks.push({
        stem: 'other',
        role: STEM_ROLE.other,
        backend: 'basic-pitch',
        status: notes.length ? 'ok' : 'empty',
        notes,
        warning: notes.length ? undefined : 'Basic Pitch returned no polyphonic notes.',
      });
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError' || opts.signal?.aborted) throw err;
      // Never substitute synthetic or monophonic notes under Basic Pitch's name.
      tracks.push({
        stem: 'other',
        role: STEM_ROLE.other,
        backend: 'basic-pitch',
        status: 'unavailable',
        notes: [],
        warning: `Basic Pitch polyphonic transcription unavailable in this runtime (${(err as Error)?.message || 'model/WebAudio unavailable'}).`,
      });
    }
  }

  return {
    tracks,
    demucsVerified: false,
  };
}
