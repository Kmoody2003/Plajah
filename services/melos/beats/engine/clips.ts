// Shared audio-clip playback — one implementation for the live transport (BeatsEngine) and the
// offline bounce (render.ts), so what you hear is what you print.

import type { ArrangeTrack, TimelineClip } from '../grooveDoc';
import { dbToGain, type BeatsGraph } from './graph';
import { audioLoop } from '../clipContent';

export function startAudioClipSource(
  ctx: BaseAudioContext,
  graph: BeatsGraph,
  getBuffer: (key: string) => AudioBuffer | undefined,
  track: ArrangeTrack,
  clip: TimelineClip,
  when: number,
  offsetIntoClipSec: number,
  /** The clip's full length in seconds at its place in the song (tempo-map aware). */
  clipSeconds: number,
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
  // A looped audio clip repeats a region of the file for as long as the clip runs; the start
  // position wraps into that region when transport starts mid-clip.
  const loop = audioLoop(clip);
  let bufferOffset = (clip.audio.offsetSec || 0) + offsetIntoClipSec * rate;
  if (loop && loop.endSec <= buf.duration + 1e-6) {
    src.loop = true;
    src.loopStart = loop.startSec;
    src.loopEnd = loop.endSec;
    if (bufferOffset >= loop.endSec) {
      const len = loop.endSec - loop.startSec;
      bufferOffset = loop.startSec + ((bufferOffset - loop.startSec) % len);
    }
  }
  const playSeconds = Math.max(0, src.loop
    ? clipSeconds - offsetIntoClipSec
    : Math.min(clipSeconds - offsetIntoClipSec, (buf.duration - bufferOffset) / rate));
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
