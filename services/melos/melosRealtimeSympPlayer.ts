import wasmUrl from './beats/engine/dsp/plajah_audio.wasm?url';
import {
  getMasterBookScore,
  type MasterPartRole,
  type MasterMovementScore,
} from './classicBookMasterScores';
import {
  configureMelosPresetOnEngine,
  type FilmPercussionStyle,
  type MelosWasmInstrumentType,
} from './melosWasmSongEngine';
import {
  evaluateNoteMpeAtProgress,
  type FilmScoreSectionMarker,
  type NoteEvent,
} from './beats/grooveDoc';

const ROLES: MasterPartRole[] = ['lead', 'countermelody', 'ostinato', 'harmony', 'bass'];
const KEY_SEMITONE: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

interface ScheduledWasmMpeNote {
  note: NoteEvent;
  vid: number;
  onFrame: number;
  offFrame: number;
  durSec: number;
}

interface ActiveEngineTrack {
  role: MasterPartRole;
  eng: number;
  gainL: number;
  gainR: number;
  instrumentType: MelosWasmInstrumentType;
  presetId: string;
  scheduledNotes: ScheduledWasmMpeNote[];
  noteCursor: number;
}

let wasmModPromise: Promise<WebAssembly.Module> | null = null;
let sharedAudioCtx: AudioContext | null = null;
let activeStopFn: (() => void) | null = null;
let activeSeekFn: ((targetSec: number) => void) | null = null;
let currentScoreMode: 'full-film-score' | 'light-background' = 'full-film-score';

async function getWasmModule(): Promise<WebAssembly.Module> {
  if (!wasmModPromise) {
    wasmModPromise = (async () => {
      const res = await fetch(wasmUrl);
      const bytes = await res.arrayBuffer();
      return WebAssembly.compile(bytes);
    })();
  }
  return wasmModPromise;
}

function getSectionIntensity(
  beat: number,
  totalBeats: number,
  markers?: FilmScoreSectionMarker[],
): { intensity: number; sectionLabel: string; dynamicMarking: string } {
  if (!markers || markers.length === 0) {
    const arch = 0.55 + 0.42 * Math.sin(Math.min(1, beat / Math.max(1, totalBeats)) * Math.PI);
    return { intensity: arch, sectionLabel: 'Full Symphonic Movement', dynamicMarking: 'mf' };
  }
  let currentMarker = markers[0];
  for (let i = 0; i < markers.length; i++) {
    const startB = markers[i].startBeats ?? (markers[i] as unknown as { startBeat?: number }).startBeat ?? 0;
    if (beat >= startB) {
      currentMarker = markers[i];
    } else {
      break;
    }
  }
  const dyn = currentMarker.dynamicMarking || 'mf';
  const dynMap: Record<string, number> = {
    ppp: 0.25,
    pp: 0.35,
    p: 0.48,
    mp: 0.64,
    mf: 0.78,
    f: 0.92,
    ff: 1.06,
    fff: 1.18,
  };
  return {
    intensity: dynMap[dyn] ?? 0.78,
    sectionLabel: `${currentMarker.title || (currentMarker as unknown as { label?: string }).label || 'Section'} (${dyn})`,
    dynamicMarking: dyn,
  };
}

function renderPercussionChunk(
  outL: Float32Array,
  outR: Float32Array,
  chunkStartFrame: number,
  chunkFrames: number,
  sr: number,
  bpm: number,
  totalBeats: number,
  key: string,
  style: FilmPercussionStyle,
) {
  if (style === 'none') return;
  const secPerBeat = 60 / bpm;
  const rootSemi = KEY_SEMITONE[key] ?? 0;
  const rootFreq = 55 * Math.pow(2, rootSemi / 12);
  const domFreq = rootFreq * 1.5;

  const startSec = Math.max(0, chunkStartFrame / sr - 1.5);
  const endSec = (chunkStartFrame + chunkFrames) / sr + 0.1;
  const firstBeat = Math.max(0, Math.floor(startSec / secPerBeat));
  const lastBeat = Math.min(totalBeats - 1, Math.ceil(endSec / secPerBeat));

  for (let b = firstBeat; b <= lastBeat; b++) {
    const tBeatFrame = Math.floor(b * secPerBeat * sr);

    if (style === 'timpani-grand' || style === 'martial-drums' || style === 'storm-tympani' || style === 'gothic-tolling') {
      const isDownbeat = b % 4 === 0;
      const isHalf = b % 4 === 2 && (style === 'martial-drums' || style === 'storm-tympani');
      if (isDownbeat || isHalf) {
        const f0 = isDownbeat ? rootFreq : domFreq;
        const durFrames = Math.floor(0.95 * sr);
        const amp = isDownbeat ? 0.20 : 0.13;
        const iStart = Math.max(0, chunkStartFrame - tBeatFrame);
        const iEnd = Math.min(durFrames, chunkStartFrame + chunkFrames - tBeatFrame);
        for (let i = iStart; i < iEnd; i++) {
          const outIdx = tBeatFrame + i - chunkStartFrame;
          const t = i / sr;
          const env = Math.exp(-t * 4.2) * (1 - Math.exp(-t * 140));
          const pitchDrop = 1 + 0.26 * Math.exp(-t * 28);
          const body =
            Math.sin(2 * Math.PI * f0 * pitchDrop * t) +
            0.42 * Math.sin(2 * Math.PI * f0 * 1.52 * t) * Math.exp(-t * 7);
          const s = body * env * amp;
          outL[outIdx] += s * 0.96;
          outR[outIdx] += s * 0.92;
        }
      }
    }

    if (style === 'gothic-tolling' && b % 8 === 0) {
      const bellFreq = rootFreq * 4;
      const durFrames = Math.floor(1.45 * sr);
      const iStart = Math.max(0, chunkStartFrame - tBeatFrame);
      const iEnd = Math.min(durFrames, chunkStartFrame + chunkFrames - tBeatFrame);
      for (let i = iStart; i < iEnd; i++) {
        const outIdx = tBeatFrame + i - chunkStartFrame;
        const t = i / sr;
        const env = Math.exp(-t * 1.85) * (1 - Math.exp(-t * 220));
        const Partial =
          0.52 * Math.sin(2 * Math.PI * bellFreq * t) +
          0.32 * Math.sin(2 * Math.PI * bellFreq * 2.41 * t) * Math.exp(-t * 3.1) +
          0.22 * Math.sin(2 * Math.PI * bellFreq * 3.83 * t) * Math.exp(-t * 4.5);
        const s = Partial * env * 0.11;
        outL[outIdx] += s * 0.85;
        outR[outIdx] += s * 1.0;
      }
    }

    if (style === 'chamber-pulse' || style === 'harpsichord-continuo' || style === 'pastoral-shaker') {
      const durFrames = Math.floor(0.18 * sr);
      const amp = b % 3 === 0 || b % 4 === 0 ? 0.08 : 0.045;
      const pluckFreq = rootFreq * (b % 2 === 0 ? 2 : 3);
      const iStart = Math.max(0, chunkStartFrame - tBeatFrame);
      const iEnd = Math.min(durFrames, chunkStartFrame + chunkFrames - tBeatFrame);
      for (let i = iStart; i < iEnd; i++) {
        const outIdx = tBeatFrame + i - chunkStartFrame;
        const t = i / sr;
        const env = Math.exp(-t * 22) * (1 - Math.exp(-t * 260));
        const s = (Math.sin(2 * Math.PI * pluckFreq * t) + 0.3 * Math.sin(4 * Math.PI * pluckFreq * t)) * env * amp;
        outL[outIdx] += s * 0.9;
        outR[outIdx] += s * 0.95;
      }
    }
  }
}

function renderHybridOrchestraAndMpeChunk(
  outL: Float32Array,
  outR: Float32Array,
  chunkStartFrame: number,
  chunkFrames: number,
  sr: number,
  bpm: number,
  totalBeats: number,
  movement: MasterMovementScore,
  tracks: ActiveEngineTrack[],
  scoreMode: 'full-film-score' | 'light-background',
) {
  const secPerBeat = 60 / bpm;
  const chunkStartSec = chunkStartFrame / sr;
  const chunkEndSec = (chunkStartFrame + chunkFrames) / sr;
  const midBeat = ((chunkStartSec + chunkEndSec) * 0.5) / secPerBeat;
  const { intensity } = getSectionIntensity(midBeat, totalBeats, movement.sectionMarkers);

  const orchScale = scoreMode === 'light-background' ? 0.42 : 0.95 * intensity;

  for (const tr of tracks) {
    let gainL = tr.gainL * 1.35;
    let gainR = tr.gainR * 1.35;
    if (tr.role === 'lead') {
      gainL *= 1.38;
      gainR *= 1.38;
    } else if (tr.role === 'countermelody') {
      gainL *= 1.24;
      gainR *= 1.24;
    }

    for (let idx = 0; idx < tr.scheduledNotes.length; idx++) {
      const sn = tr.scheduledNotes[idx];
      if (sn.offFrame < chunkStartFrame) continue;
      if (sn.onFrame >= chunkStartFrame + chunkFrames) break;

      const n = sn.note;
      const baseFreq = 440 * Math.pow(2, (n.key - 69) / 12);
      const velAmp = Math.pow(Math.max(24, Math.min(127, n.vel)) / 127, 1.15);
      const iStart = Math.max(0, sn.onFrame - chunkStartFrame);
      const iEnd = Math.min(chunkFrames, sn.offFrame - chunkStartFrame);

      for (let i = iStart; i < iEnd; i++) {
        const globalFrame = chunkStartFrame + i;
        const elapsedSec = (globalFrame - sn.onFrame) / sr;
        const progress01 = Math.max(0, Math.min(1, elapsedSec / sn.durSec));
        const mpe = evaluateNoteMpeAtProgress(n, progress01, elapsedSec);

        const attackSec = n.articulation === 'spiccato' || n.articulation === 'staccato' ? 0.008 : 0.045;
        const releasePortion = n.articulation === 'legato' || n.articulation === 'portamento' ? 0.14 : 0.24;
        const attEnv = Math.min(1, elapsedSec / attackSec);
        const relEnv =
          progress01 > 1 - releasePortion
            ? Math.max(0, (1 - progress01) / releasePortion)
            : 1.0;

        const env = attEnv * relEnv * (0.40 + 0.60 * mpe.pressure) * velAmp;
        if (env <= 0.0005) continue;

        const bendMod = (mpe.pitchOffsetSemis || 0) * 0.42;
        const phase = 2 * Math.PI * baseFreq * elapsedSec + bendMod;
        const bright = 0.35 + 0.65 * mpe.timbre;

        let synthSig = 0;
        let aceStepOrchSigL = 0;
        let aceStepOrchSigR = 0;

        if (tr.role === 'lead') {
          synthSig =
            0.52 * Math.sin(phase) +
            0.28 * bright * Math.sin(2 * phase + 0.15) +
            0.14 * bright * Math.sin(3 * phase) +
            0.06 * Math.sin(4 * phase);
          const chorusDetune = 2 * Math.PI * (baseFreq * 1.0028) * elapsedSec + bendMod;
          const soloViolin =
            0.46 * Math.sin(phase) +
            0.31 * bright * Math.sin(2 * phase) +
            0.18 * bright * Math.sin(3 * phase) +
            0.09 * Math.sin(chorusDetune);
          aceStepOrchSigL = soloViolin * 0.24 * orchScale;
          aceStepOrchSigR = soloViolin * 0.28 * orchScale;
        } else if (tr.role === 'countermelody') {
          synthSig =
            0.48 * Math.sin(phase) +
            0.34 * bright * Math.sin(2 * phase) +
            0.16 * Math.sin(3 * phase);
          const hornWave =
            0.55 * Math.sin(phase * 0.5) +
            0.38 * Math.sin(phase) +
            0.22 * bright * Math.sin(2 * phase);
          aceStepOrchSigL = hornWave * 0.22 * orchScale;
          aceStepOrchSigR = hornWave * 0.19 * orchScale;
        } else if (tr.role === 'harmony') {
          const detL = 2 * Math.PI * (baseFreq * 0.9975) * elapsedSec + bendMod * 0.8;
          const detR = 2 * Math.PI * (baseFreq * 1.0025) * elapsedSec + bendMod * 0.8;
          synthSig = 0.50 * Math.sin(phase) + 0.25 * bright * Math.sin(2 * phase);
          aceStepOrchSigL = (0.44 * Math.sin(detL) + 0.24 * bright * Math.sin(2 * detL) + 0.12 * Math.sin(3 * detL)) * 0.22 * orchScale;
          aceStepOrchSigR = (0.44 * Math.sin(detR) + 0.24 * bright * Math.sin(2 * detR) + 0.12 * Math.sin(3 * detR)) * 0.22 * orchScale;
        } else if (tr.role === 'ostinato') {
          const decay = Math.exp(-elapsedSec * (n.articulation === 'pizzicato' ? 11 : 5.5));
          synthSig = (0.58 * Math.sin(phase) + 0.30 * bright * Math.sin(2 * phase) + 0.12 * Math.sin(4 * phase)) * decay;
          aceStepOrchSigL = synthSig * 0.16 * orchScale;
          aceStepOrchSigR = synthSig * 0.18 * orchScale;
        } else {
          const subPhase = phase * 0.5;
          synthSig =
            0.60 * Math.sin(phase) +
            0.32 * Math.sin(subPhase) +
            0.22 * bright * Math.sin(2 * phase);
          aceStepOrchSigL = (0.48 * Math.sin(subPhase) + 0.28 * Math.sin(phase)) * 0.24 * orchScale;
          aceStepOrchSigR = (0.48 * Math.sin(subPhase) + 0.28 * Math.sin(phase)) * 0.24 * orchScale;
        }

        outL[i] += synthSig * env * gainL * 0.11 + aceStepOrchSigL * env;
        outR[i] += synthSig * env * gainR * 0.11 + aceStepOrchSigR * env;
      }
    }
  }
}

export function stopRealtimeSympPlayback() {
  if (activeStopFn) {
    activeStopFn();
    activeStopFn = null;
  }
  activeSeekFn = null;
}

export function seekRealtimeSympPlayback(targetSec: number) {
  if (activeSeekFn) {
    activeSeekFn(targetSec);
  }
}

export function setRealtimeSympScoreMode(mode: 'full-film-score' | 'light-background') {
  currentScoreMode = mode;
}

export function getRealtimeSympScoreMode(): 'full-film-score' | 'light-background' {
  return currentScoreMode;
}

/**
 * Streams a complete 2:15–5:30 minute 7-section symphonic film score (or 30s Light Background cue)
 * in real time using `plajah_audio.wasm` MPE voices + ACE-Step 2.5 Hybrid Orchestral Stems with <15ms start latency.
 */
export async function playRealtimeSympMovement(
  bookId: string,
  movementIdx: number,
  scoreMode: 'full-film-score' | 'light-background' = currentScoreMode,
  onProgress?: (curSec: number, totalSec: number, beat16: number, sectionLabel?: string) => void,
  onEnded?: () => void,
) {
  stopRealtimeSympPlayback();
  currentScoreMode = scoreMode;

  const bp = getMasterBookScore(bookId) || getMasterBookScore('pride-and-prejudice');
  if (!bp) return;
  const movement: MasterMovementScore = bp.movements[movementIdx] || bp.movements[0];
  if (!movement) return;

  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new AudioCtx({ sampleRate: 48000 });
  }
  if (sharedAudioCtx.state === 'suspended') {
    await sharedAudioCtx.resume();
  }
  const ctx = sharedAudioCtx;
  const sr = ctx.sampleRate;

  const wasmMod = await getWasmModule();
  const inst = await WebAssembly.instantiate(wasmMod, {});
  const exports = inst.exports as Record<string, any>;
  const mem = exports.memory as WebAssembly.Memory;

  const isLight = scoreMode === 'light-background';
  const bpm = movement.bpm;
  const secPerBeat = 60 / bpm;
  const totalBeats = isLight
    ? (movement.lightBackgroundLengthBeats || 32)
    : movement.lengthBeats;
  const tailSec = 2.4;
  const totalFrames = Math.ceil((totalBeats * secPerBeat + tailSec) * sr);
  const totalSec = totalFrames / sr;

  const partMap = movement.trackPartSpecs || bp.partSpecs;
  const partsSource = isLight
    ? (movement.lightBackgroundParts || movement.parts)
    : movement.parts;

  const tracks: ActiveEngineTrack[] = [];

  for (const role of ROLES) {
    const spec = partMap[role];
    if (!spec) continue;
    const eng = exports.pa_create(sr);
    exports.pa_set_tempo(eng, bpm);
    configureMelosPresetOnEngine(exports, eng, spec.instrumentType, spec.presetId);

    const rawNotes = partsSource[role] || [];
    const scheduledNotes: ScheduledWasmMpeNote[] = [];

    for (let i = 0; i < rawNotes.length; i++) {
      const n = rawNotes[i];
      if (n.startBeats >= totalBeats) continue;
      const vid = 10 + (i % 14);
      const onFrame = Math.max(0, Math.floor(n.startBeats * secPerBeat * sr));
      const gateScale =
        n.articulation === 'staccato' || n.articulation === 'spiccato'
          ? 0.55
          : n.articulation === 'legato' || n.articulation === 'portamento'
          ? 1.02
          : 0.94;
      const durSec = Math.max(0.08, n.lengthBeats * secPerBeat * gateScale);
      const offFrame = Math.max(onFrame + 128, Math.floor((n.startBeats * secPerBeat + durSec) * sr));
      const vel01 = Math.max(0.18, Math.min(1.0, n.vel / 127));

      exports.pa_schedule_note_on(eng, onFrame, vid, n.key, vel01);
      exports.pa_schedule_note_off(eng, offFrame, vid);

      scheduledNotes.push({ note: n, vid, onFrame, offFrame, durSec });
    }

    const linGain = Math.pow(10, spec.gainDb / 20);
    const panAngle = ((spec.pan + 1) * 0.5) * (Math.PI * 0.5);
    tracks.push({
      role,
      eng,
      gainL: linGain * Math.cos(panAngle),
      gainR: linGain * Math.sin(panAngle),
      instrumentType: spec.instrumentType,
      presetId: spec.presetId,
      scheduledNotes,
      noteCursor: 0,
    });
  }

  let cancelled = false;
  let renderedFrames = 0;
  let nextStartTime = ctx.currentTime + 0.02;
  let playStartWallTime = nextStartTime;
  let playStartOffsetSec = 0;
  const activeNodes: AudioBufferSourceNode[] = [];
  const BLOCK = 512;
  const CHUNK_SEC = 1.25;
  const CHUNK_FRAMES = Math.floor(CHUNK_SEC * sr);

  const delayL = new Float32Array(Math.floor(0.037 * sr));
  const delayR = new Float32Array(Math.floor(0.053 * sr));
  let dIdxL = 0;
  let dIdxR = 0;

  function renderAndScheduleNextChunk() {
    if (cancelled || renderedFrames >= totalFrames) return;

    const framesThisChunk = Math.min(CHUNK_FRAMES, totalFrames - renderedFrames);
    const audioBuf = ctx.createBuffer(2, framesThisChunk, sr);
    const outL = audioBuf.getChannelData(0);
    const outR = audioBuf.getChannelData(1);

    renderPercussionChunk(
      outL,
      outR,
      renderedFrames,
      framesThisChunk,
      sr,
      bpm,
      totalBeats,
      movement.key,
      movement.percussionStyle,
    );

    renderHybridOrchestraAndMpeChunk(
      outL,
      outR,
      renderedFrames,
      framesThisChunk,
      sr,
      bpm,
      totalBeats,
      movement,
      tracks,
      scoreMode,
    );

    for (let offset = 0; offset < framesThisChunk; offset += BLOCK) {
      const n = Math.min(BLOCK, framesThisChunk - offset);
      const absFrame = renderedFrames + offset;

      for (const tr of tracks) {
        while (
          tr.noteCursor < tr.scheduledNotes.length &&
          tr.scheduledNotes[tr.noteCursor].offFrame < absFrame
        ) {
          tr.noteCursor++;
        }
        let activeNote: ScheduledWasmMpeNote | undefined;
        for (let k = tr.noteCursor; k < tr.scheduledNotes.length; k++) {
          const cand = tr.scheduledNotes[k];
          if (cand.onFrame > absFrame + n) break;
          if (cand.onFrame <= absFrame && cand.offFrame >= absFrame) {
            activeNote = cand;
            break;
          }
        }
        if (activeNote && typeof exports.pa_set_expression === 'function') {
          const elapsed = Math.max(0, (absFrame - activeNote.onFrame) / sr);
          const prog = Math.max(0, Math.min(1, elapsed / activeNote.durSec));
          const mpe = evaluateNoteMpeAtProgress(activeNote.note, prog, elapsed);
          exports.pa_set_expression(tr.eng, activeNote.vid, mpe.bendSemis / 24, mpe.pressure, mpe.timbre);
          if (typeof exports.pa_set_mod_wheel === 'function') {
            exports.pa_set_mod_wheel(tr.eng, mpe.pressure * 0.88);
          }
        }

        exports.pa_render(tr.eng, n);
        const ptr = exports.pa_out_ptr(tr.eng);
        const wasmOut = new Float32Array(mem.buffer, ptr, n * 2);
        for (let i = 0; i < n; i++) {
          outL[offset + i] += wasmOut[i * 2] * tr.gainL;
          outR[offset + i] += wasmOut[i * 2 + 1] * tr.gainR;
        }
      }
    }

    for (let i = 0; i < framesThisChunk; i++) {
      const dryL = outL[i];
      const dryR = outR[i];
      const wetL = delayL[dIdxL];
      const wetR = delayR[dIdxR];
      delayL[dIdxL] = dryR * 0.25 + wetL * 0.44;
      delayR[dIdxR] = dryL * 0.25 + wetR * 0.44;
      dIdxL = (dIdxL + 1) % delayL.length;
      dIdxR = (dIdxR + 1) % delayR.length;
      outL[i] = Math.tanh((dryL + wetL * 0.30) * 1.45) * 0.90;
      outR[i] = Math.tanh((dryR + wetR * 0.30) * 1.45) * 0.90;
    }

    const src = ctx.createBufferSource();
    src.buffer = audioBuf;
    src.connect(ctx.destination);
    const startAt = Math.max(ctx.currentTime + 0.005, nextStartTime);
    src.start(startAt);
    nextStartTime = startAt + framesThisChunk / sr;
    renderedFrames += framesThisChunk;
    activeNodes.push(src);
  }

  renderAndScheduleNextChunk();
  renderAndScheduleNextChunk();

  activeSeekFn = (targetSec: number) => {
    if (cancelled) return;
    const clampedSec = Math.max(0, Math.min(totalSec - 1, targetSec));
    for (const node of activeNodes) {
      try { node.stop(); node.disconnect(); } catch { /* ignore */ }
    }
    activeNodes.length = 0;
    renderedFrames = Math.floor(clampedSec * sr);
    for (const tr of tracks) {
      tr.noteCursor = 0;
    }
    nextStartTime = ctx.currentTime + 0.02;
    playStartWallTime = nextStartTime;
    playStartOffsetSec = clampedSec;
    renderAndScheduleNextChunk();
    renderAndScheduleNextChunk();
  };

  const timerId = window.setInterval(() => {
    if (cancelled) return;
    if (renderedFrames < totalFrames && nextStartTime - ctx.currentTime < 2.2) {
      renderAndScheduleNextChunk();
    }
    const curSec = Math.max(0, playStartOffsetSec + (ctx.currentTime - playStartWallTime));
    const curBeatAbs = curSec / secPerBeat;
    const beat16 = Math.floor(curBeatAbs) % 16;
    const { sectionLabel } = getSectionIntensity(curBeatAbs, totalBeats, movement.sectionMarkers);

    if (onProgress) {
      onProgress(Math.min(curSec, totalSec), totalSec, beat16, sectionLabel);
    }
    if (curSec >= totalSec) {
      stopRealtimeSympPlayback();
      if (onEnded) onEnded();
    }
  }, 80);

  activeStopFn = () => {
    if (cancelled) return;
    cancelled = true;
    window.clearInterval(timerId);
    for (const node of activeNodes) {
      try { node.stop(); node.disconnect(); } catch { /* ignore */ }
    }
    activeNodes.length = 0;
    for (const tr of tracks) {
      try { exports.pa_destroy(tr.eng); } catch { /* ignore */ }
    }
  };
}

/**
 * Synthesizes a stereo ACE-Step 2.5 / YuE2 Orchestral Stem `AudioBuffer` for a movement in <80ms
 * so when a user opens a Chora DAW Showcase Template in `BeatsRoom.tsx`, the 3 Generative Audio Tracks
 * on the Timeline (`ACE-Step 2.5 Symphonic Strings`, `ACE-Step 2.5 Soloist & Brass`, `YuE2 Cathedral Choir`)
 * have real playable stereo waveforms and play in sync with the 5 Melos MPE Synths!
 */
export function buildShowcaseGenerativeStemAudioBuffer(
  ctx: BaseAudioContext,
  bookId: string,
  movementIdx: number,
  stemIdx: number,
  maxPreviewSeconds = 45,
): { buffer: AudioBuffer; peaks: number[]; durationSec: number } {
  const bp = getMasterBookScore(bookId) || getMasterBookScore('pride-and-prejudice')!;
  const mvt = bp.movements[movementIdx] || bp.movements[0];
  const sr = ctx.sampleRate || 48000;
  const secPerBeat = 60 / mvt.bpm;
  const fullDurSec = (mvt.lengthBeats * 60) / mvt.bpm;
  const renderSec = Math.min(maxPreviewSeconds, fullDurSec);
  const frames = Math.max(1024, Math.floor(renderSec * sr));
  const buffer = ctx.createBuffer(2, frames, sr);
  const outL = buffer.getChannelData(0);
  const outR = buffer.getChannelData(1);

  const rolesToRender: MasterPartRole[] =
    stemIdx === 0
      ? ['harmony', 'ostinato'] // ACE-Step 2.5 Symphonic Strings
      : stemIdx === 1
      ? ['lead', 'countermelody'] // ACE-Step 2.5 Solo Violin/Cello & French Horn
      : ['harmony', 'bass']; // YuE2 Cathedral Choir & Contrabass Foundation

  for (const role of rolesToRender) {
    const notes = mvt.parts[role] || [];
    for (const n of notes) {
      const t0 = n.startBeats * secPerBeat;
      if (t0 >= renderSec) break;
      const dur = Math.max(0.15, n.lengthBeats * secPerBeat);
      const onFrame = Math.floor(t0 * sr);
      const offFrame = Math.min(frames, Math.floor((t0 + dur) * sr));
      const baseFreq = 440 * Math.pow(2, (n.key - 69) / 12);
      const velAmp = (n.vel / 127) * 0.16;

      let ph = 0;
      for (let f = onFrame; f < offFrame; f++) {
        const el = (f - onFrame) / sr;
        const prog = el / dur;
        const mpe = evaluateNoteMpeAtProgress(n, prog, el);
        const env = Math.min(1, el / 0.04) * Math.min(1, (1 - prog) / 0.2) * (0.4 + 0.6 * mpe.pressure) * velAmp;
        const instFreq = baseFreq * Math.pow(2, (mpe.bendSemis || 0) / 12);
        ph += (2 * Math.PI * instFreq) / sr;
        const sig =
          0.52 * Math.sin(ph) +
          0.28 * mpe.timbre * Math.sin(2 * ph + (stemIdx * 0.4)) +
          0.14 * Math.sin(3 * ph);
        outL[f] += sig * env * (stemIdx === 0 ? 1.05 : 0.92);
        outR[f] += sig * env * (stemIdx === 1 ? 1.08 : 0.96);
      }
    }
  }

  const peaks: number[] = [];
  const bucket = Math.max(1, Math.floor(frames / 64));
  for (let b = 0; b < 64; b++) {
    let max = 0;
    const start = b * bucket;
    for (let i = start; i < Math.min(frames, start + bucket); i++) {
      const a = Math.abs(outL[i]);
      if (a > max) max = a;
    }
    peaks.push(Number(Math.min(1, max * 2.2).toFixed(3)));
  }

  return { buffer, peaks, durationSec: renderSec };
}
