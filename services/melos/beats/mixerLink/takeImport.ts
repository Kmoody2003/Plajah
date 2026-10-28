// Multitrack takes → timeline clips. Pure (no engine, no bridge) so it runs under tsx --test.
//
// The capture engine writes one mono file per hardware input, all sample-aligned. Placing them
// is: find sample 0 on the song's beat axis, then give every armed input track one clip there.
// Audio captured before beat 0 (count-in) is trimmed with audio.offsetSec, not dropped.

import type { ArrangeTrack, GrooveDoc } from '../grooveDoc';
import { audioLengthBeats } from '../clipEdit';
import { songTime } from '../tempoMap';
import type { MixerLinkSession, MultitrackTake } from './types';

const MAX_TAKES = 20;

/** Audio tracks bound to a hardware input and armed — the ones a record pass captures. */
export function armedInputTracks(doc: GrooveDoc, deviceId?: string): ArrangeTrack[] {
  return doc.arrangement.filter((t) => t.kind === 'audio' && t.armed && t.input && (!deviceId || t.input.deviceId === deviceId));
}

/** Every driver input the armed tracks need (stereo tracks need both), sorted and unique. */
export function captureInputs(tracks: ArrangeTrack[]): number[] {
  const s = new Set<number>();
  for (const t of tracks) { if (!t.input) continue; s.add(t.input.input); if (t.input.inputR != null) s.add(t.input.inputR); }
  return [...s].sort((a, b) => a - b);
}

/**
 * The song beat where the take's first sample sits, as the performer heard it. `anchor` is any
 * (wall clock ms, song beat) pair read while the transport rolled. The driver's first callback
 * arrives one input latency after its first sample hit the input — the driver's reported latency
 * when it gives one (it includes the buffer), else one buffer. Chora's own playback reaches the
 * performer `outputSec` after the engine clock, so they played to a beat that much earlier.
 */
export function sampleZeroBeat(
  doc: GrooveDoc, anchor: { wallMs: number; beats: number }, firstBufferMs: number, bufferFrames: number, sampleRate: number,
  latency: { inputFrames?: number; outputSec?: number } = {},
): number {
  const { tempo } = songTime(doc);
  const inFrames = latency.inputFrames && latency.inputFrames > 0 ? latency.inputFrames : bufferFrames;
  const sample0Ms = firstBufferMs - (inFrames / sampleRate) * 1000;
  return tempo.secToBeat(tempo.beatToSec(anchor.beats) + (sample0Ms - anchor.wallMs) / 1000 - (latency.outputSec ?? 0));
}

export interface TakeClip { trackId: string; sampleKey: string; name: string; durationSec: number; peaks?: number[] }

/** Writes the take's clips onto their tracks and records the take on doc.mixerLink. Mutates `doc`. */
export function applyTake(doc: GrooveDoc, take: MultitrackTake, clips: TakeClip[], newId: () => string, linkDefaults?: Pick<MixerLinkSession, 'model' | 'family'>): void {
  const { tempo } = songTime(doc);
  const start = Math.max(0, take.startBeats);
  // Seconds of audio that fall before beat 0 (pre-roll) — skipped inside the file.
  const lead = take.startBeats < 0 ? tempo.beatToSec(0) - tempo.beatToSec(take.startBeats) : 0;
  for (const c of clips) {
    const track = doc.arrangement.find((t) => t.id === c.trackId);
    const playable = c.durationSec - lead;
    if (!track || playable <= 0) continue;
    track.clips.push({
      id: newId(), startBeats: start,
      lengthBeats: Math.max(1 / 16, audioLengthBeats(doc, start, playable)),
      audio: { sampleKey: c.sampleKey, name: c.name, offsetSec: lead, gainDb: 0, durationSec: c.durationSec, ...(c.peaks ? { peaks: c.peaks } : {}) },
    });
  }
  const link = doc.mixerLink ??= {
    deviceId: take.deviceId, model: linkDefaults?.model ?? take.deviceId, family: linkDefaults?.family ?? 'generic',
    sampleRate: take.sampleRate, channels: [],
  };
  link.takes = [...(link.takes ?? []), take].slice(-MAX_TAKES);
}

/** Interleaves mono channels into a 32-bit float WAV (stereo tracks from two console inputs). */
export function encodeWavFloat(channels: Float32Array[], sampleRate: number): ArrayBuffer {
  const nCh = channels.length;
  const frames = Math.min(...channels.map((c) => c.length));
  const dataBytes = frames * nCh * 4;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + dataBytes, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 3, true); v.setUint16(22, nCh, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * nCh * 4, true); v.setUint16(32, nCh * 4, true); v.setUint16(34, 32, true);
  str(36, 'data'); v.setUint32(40, dataBytes, true);
  let o = 44;
  for (let f = 0; f < frames; f++) for (let ch = 0; ch < nCh; ch++) { v.setFloat32(o, channels[ch][f], true); o += 4; }
  return buf;
}
