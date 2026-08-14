// Audio → step pattern. Drop a drum loop in and get its groove on the pads: onset detection +
// kick/snare/hat classification from services/drumTranscription.ts, tempo from
// services/audioBeatDetection.ts, quantized to the 16th grid with the residual kept as `micro`
// so the imported feel survives (and Quantize can flatten it if you'd rather have the grid).

import { transcribeDrumsFromBuffer, type DrumClass } from '../../drumTranscription';
import { detectBeatsFromBuffer } from '../../audioBeatDetection';
import { grooveUid, type GrooveDoc, type Pattern } from './grooveDoc';

/** Which pad receives each detected class — matches the default kit layout. */
const CLASS_TO_PAD: Record<DrumClass, number> = { KICK: 0, SNARE: 4, HIHAT: 8 };

export interface TranscribeResult { pattern: Pattern; bpm: number | null; hits: number; report: string }

function toMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
  const l = buffer.getChannelData(0), r = buffer.getChannelData(1);
  const out = new Float32Array(buffer.length);
  for (let i = 0; i < out.length; i++) out[i] = (l[i] + r[i]) / 2;
  return out;
}

export function transcribeToPattern(buffer: AudioBuffer, docBpm: number, name = 'Imported groove'): TranscribeResult | null {
  const pcm = toMono(buffer);
  const sr = buffer.sampleRate;
  const dur = buffer.duration;

  let bpm: number | null = null;
  try {
    const beats = detectBeatsFromBuffer(pcm, sr, dur);
    if (beats?.bpm && beats.bpm > 40 && beats.bpm < 220) bpm = Math.round(beats.bpm * 10) / 10;
  } catch { /* tempo is a bonus — the grid still works off the document bpm */ }

  const tr = transcribeDrumsFromBuffer(pcm, sr, dur, { minConfidence: 0.28 });
  if (!tr?.hits?.length) return null;

  const useBpm = bpm ?? docBpm;
  const stepSec = (60 / useBpm) / 4;
  const totalSteps = Math.max(16, Math.min(64, Math.round(dur / stepSec)));
  const length = (totalSteps <= 16 ? 16 : totalSteps <= 32 ? 32 : totalSteps <= 48 ? 48 : 64) as Pattern['length'];

  const pattern: Pattern = { id: grooveUid(), name, length, steps: {} };
  let placed = 0;
  for (const hit of tr.hits) {
    const padIdx = CLASS_TO_PAD[hit.drum];
    if (padIdx === undefined) continue;
    const stepFloat = hit.time / stepSec;
    const step = Math.round(stepFloat);
    if (step < 0 || step >= length) continue;
    const micro = Math.max(-0.5, Math.min(0.5, stepFloat - step));
    const vel = Math.max(35, Math.min(127, Math.round((hit.confidence ?? 0.6) * 127)));
    const row = pattern.steps[padIdx] || (pattern.steps[padIdx] = {});
    // Keep the loudest hit when two land on one step (a flam reads as one strike on a 16th grid).
    if (!row[step] || row[step].v < vel) row[step] = { v: vel, ...(Math.abs(micro) > 0.02 ? { micro } : {}) };
    placed++;
  }
  if (!placed) return null;

  return {
    pattern,
    bpm,
    hits: placed,
    report: `${placed} hits → ${length} steps${bpm ? ` · detected ${bpm} bpm` : ' · using project tempo'}`,
  };
}

/** Add the transcribed pattern to a document and return its id (caller selects it). */
export function addTranscribedPattern(doc: GrooveDoc, result: TranscribeResult): string {
  doc.patterns.push(result.pattern);
  if (result.bpm) doc.bpm = result.bpm;
  return result.pattern.id;
}
