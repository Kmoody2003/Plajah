// Shared audio-clip playback — one implementation for the live transport (BeatsEngine) and the
// offline bounce (render.ts), so what you hear is what you print.

import type { ArrangeTrack, TimelineClip } from '../grooveDoc';
import { dbToGain, type BeatsGraph } from './graph';

export function startAudioClipSource(
  ctx: BaseAudioContext,
  graph: BeatsGraph,
  getBuffer: (key: string) => AudioBuffer | undefined,
  track: ArrangeTrack,
  clip: TimelineClip,
  when: number,
  offsetIntoClipSec: number,
  secPerBeat: number,
): { src: AudioBufferSourceNode; gain: GainNode } | null {
  if (!clip.audio) return null;
  const buf = getBuffer(clip.audio.sampleKey);
  if (!buf) return null; // not resident — persistence hydrates and the next transport pass plays it
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const rate = clip.audio.stretch && clip.audio.stretch > 0 ? clip.audio.stretch : 1;
  src.playbackRate.value = rate;
  const gain = ctx.createGain();
  const level = dbToGain(clip.audio.gainDb);
  src.connect(gain).connect(graph.trackDestination(track));
  const clipSeconds = clip.lengthBeats * secPerBeat;
  const bufferOffset = (clip.audio.offsetSec || 0) + offsetIntoClipSec * rate;
  const playSeconds = Math.max(0, Math.min(clipSeconds - offsetIntoClipSec, (buf.duration - bufferOffset) / rate));
  if (playSeconds <= 0) return null;
  // 2ms edge fades: clips trimmed mid-waveform click without them.
  const t0 = Math.max(when, ctx.currentTime);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(level, t0 + 0.002);
  gain.gain.setValueAtTime(level, Math.max(t0 + 0.002, t0 + playSeconds - 0.002));
  gain.gain.linearRampToValueAtTime(0.0001, t0 + playSeconds);
  src.start(t0, bufferOffset, playSeconds + 0.01);
  return { src, gain };
}
