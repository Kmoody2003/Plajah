// Melos Beats — pure clip edits shared by every surface that cuts clips (the Timeline knife, the
// audio editor's Split). One implementation so a split behaves the same wherever you make it,
// and it measures audio offsets through the tempo map + clip stretch instead of 60/bpm.

import { grooveUid, type GrooveDoc, type TimelineClip } from './grooveDoc';
import { songTime } from './tempoMap';

/** Playback rate of an audio clip (its simple stretch), never 0. */
const clipRate = (c: TimelineClip) => (c.audio?.stretch && c.audio.stretch > 0 ? c.audio.stretch : 1);

/**
 * Split a clip in two at an absolute beat (already snapped by the caller). Notes are partitioned
 * and clamped at the cut; an audio clip's right half starts that much further into the file.
 * Returns the new right-hand clip's id, or null when the cut is outside the clip.
 */
export function splitClipAt(doc: GrooveDoc, trackId: string, clipId: string, atBeats: number): string | null {
  const t = doc.arrangement.find((x) => x.id === trackId);
  const c = t?.clips.find((x) => x.id === clipId);
  if (!t || !c) return null;
  const rel = atBeats - c.startBeats;
  if (rel <= 1e-6 || rel >= c.lengthBeats - 1e-6) return null;
  const right = JSON.parse(JSON.stringify(c)) as TimelineClip;
  right.id = grooveUid() + grooveUid();
  right.startBeats = atBeats;
  right.lengthBeats = c.lengthBeats - rel;
  c.lengthBeats = rel;
  if (c.notes) {
    right.notes = (right.notes ?? []).filter((n) => n.startBeats >= rel - 1e-6)
      .map((n) => ({ ...n, id: grooveUid(), startBeats: n.startBeats - rel }));
    c.notes = c.notes.filter((n) => n.startBeats < rel - 1e-6);
    for (const n of c.notes) if (n.startBeats + n.lengthBeats > rel) n.lengthBeats = rel - n.startBeats;
  }
  if (c.audio && right.audio) {
    const { tempo } = songTime(doc);
    right.audio.offsetSec = (c.audio.offsetSec || 0) + tempo.secBetween(c.startBeats, atBeats) * clipRate(c);
    if (right.audio.peaks?.length && c.audio.peaks?.length) {
      // Peaks cover the clip's visible window; partition them proportionally with the cut.
      const k = Math.round((rel / (rel + right.lengthBeats)) * c.audio.peaks.length);
      right.audio.peaks = c.audio.peaks.slice(k);
      c.audio.peaks = c.audio.peaks.slice(0, k);
    }
  }
  t.clips.push(right);
  return right.id;
}

/**
 * Map a position in an audio clip's SOURCE FILE (seconds into the sample) to the absolute beat
 * where it plays on the timeline, or null when that part of the file is outside the clip window.
 */
export function audioSourceSecToBeat(doc: GrooveDoc, clip: TimelineClip, sourceSec: number): number | null {
  if (!clip.audio) return null;
  const { tempo } = songTime(doc);
  const into = (sourceSec - (clip.audio.offsetSec || 0)) / clipRate(clip);
  if (into <= 0) return null;
  const beat = tempo.secToBeat(tempo.beatToSec(clip.startBeats) + into);
  return beat < clip.startBeats + clip.lengthBeats - 1e-6 ? beat : null;
}

/** Beats an audio clip of `durationSec` occupies when it starts at `startBeats` (tempo-map aware). */
export function audioLengthBeats(doc: GrooveDoc, startBeats: number, durationSec: number, rate = 1): number {
  const { tempo } = songTime(doc);
  return tempo.secToBeat(tempo.beatToSec(startBeats) + durationSec / rate) - startBeats;
}
