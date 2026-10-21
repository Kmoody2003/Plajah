// Melos Beats — pure clip edits shared by every surface that cuts, trims, slips, loops or glues
// clips (the Timeline gestures and knife, the audio editor's Split). Edits are NON-DESTRUCTIVE:
// a clip is a window onto its content (clipContent.ts), so splitting or trimming moves the
// window and never deletes notes. Audio offsets go through the tempo map + clip stretch.

import { grooveUid, type GrooveDoc, type NoteEvent, type TimelineClip } from './grooveDoc';
import { songTime } from './tempoMap';
import { noteOccurrences } from './clipContent';

/** Playback rate of an audio clip (its simple stretch), never 0. */
const clipRate = (c: TimelineClip) => (c.audio?.stretch && c.audio.stretch > 0 ? c.audio.stretch : 1);

const findClip = (doc: GrooveDoc, trackId: string, clipId: string) => {
  const t = doc.arrangement.find((x) => x.id === trackId);
  const c = t?.clips.find((x) => x.id === clipId);
  return t && c ? { t, c } : null;
};

/**
 * Split a clip in two at an absolute beat (already snapped by the caller). Both halves keep the
 * full content; the right half's window starts where the cut was (content offset / audio file
 * offset advance by the left half's length). Returns the new right-hand clip's id, or null when
 * the cut is outside the clip.
 */
export function splitClipAt(doc: GrooveDoc, trackId: string, clipId: string, atBeats: number): string | null {
  const hit = findClip(doc, trackId, clipId);
  if (!hit) return null;
  const { t, c } = hit;
  const rel = atBeats - c.startBeats;
  if (rel <= 1e-6 || rel >= c.lengthBeats - 1e-6) return null;
  const right = JSON.parse(JSON.stringify(c)) as TimelineClip;
  right.id = grooveUid() + grooveUid();
  right.startBeats = atBeats;
  right.lengthBeats = c.lengthBeats - rel;
  c.lengthBeats = rel;
  if (c.notes || c.patternId || c.automationLanes) right.contentOffsetBeats = (c.contentOffsetBeats ?? 0) + rel;
  if (c.audio && right.audio) {
    const { tempo } = songTime(doc);
    right.audio.offsetSec = (c.audio.offsetSec || 0) + tempo.secBetween(c.startBeats, atBeats) * clipRate(c);
    if (right.audio.peaks?.length && c.audio.peaks?.length) {
      // Peaks are drawn across the clip; partition them proportionally with the cut.
      const k = Math.round((rel / (rel + right.lengthBeats)) * c.audio.peaks.length);
      right.audio.peaks = c.audio.peaks.slice(k);
      c.audio.peaks = c.audio.peaks.slice(0, k);
    }
  }
  t.clips.push(right);
  return right.id;
}

/**
 * Left-edge trim: move the clip's start to `newStart` while the content stays put in song time
 * (the window opens or closes on the left). Clamped so audio can't start before its file.
 */
export function trimClipStart(doc: GrooveDoc, trackId: string, clipId: string, newStart: number, minLen = 1 / 64): void {
  const hit = findClip(doc, trackId, clipId);
  if (!hit) return;
  const { c } = hit;
  const end = c.startBeats + c.lengthBeats;
  let s = Math.max(0, Math.min(newStart, end - minLen));
  if (c.audio) {
    const { tempo } = songTime(doc);
    // Opening left can't reach before the file's first sample.
    const earliest = tempo.secToBeat(tempo.beatToSec(c.startBeats) - (c.audio.offsetSec || 0) / clipRate(c));
    s = Math.max(s, earliest);
    const dSec = s >= c.startBeats ? tempo.secBetween(c.startBeats, s) : -tempo.secBetween(s, c.startBeats);
    c.audio.offsetSec = Math.max(0, (c.audio.offsetSec || 0) + dSec * clipRate(c));
  } else {
    c.contentOffsetBeats = (c.contentOffsetBeats ?? 0) + (s - c.startBeats);
  }
  c.lengthBeats = end - s;
  c.startBeats = s;
}

/**
 * Slip: move the content under a fixed window by `deltaBeats` (positive = content moves later,
 * i.e. you hear earlier material). Audio converts through the tempo at the clip start.
 */
export function slipClip(doc: GrooveDoc, clip: TimelineClip, deltaBeats: number): void {
  if (clip.audio) {
    const { tempo } = songTime(doc);
    const secPerBeat = 60 / tempo.bpmAt(clip.startBeats);
    clip.audio.offsetSec = Math.max(0, (clip.audio.offsetSec || 0) - deltaBeats * secPerBeat * clipRate(clip));
    return;
  }
  clip.contentOffsetBeats = (clip.contentOffsetBeats ?? 0) - deltaBeats;
}

/** Turn content looping on (loop = what the clip currently shows) or off. */
export function setClipLoop(doc: GrooveDoc, clip: TimelineClip, on: boolean): void {
  if (clip.audio) {
    if (!on) { delete clip.audio.loop; return; }
    const { tempo } = songTime(doc);
    const lengthSec = tempo.secBetween(clip.startBeats, clip.startBeats + clip.lengthBeats) * clipRate(clip);
    const startSec = clip.audio.offsetSec || 0;
    clip.audio.loop = { startSec, lengthSec: Math.max(0.01, Math.min(lengthSec, clip.audio.durationSec - startSec)) };
    return;
  }
  if (!on) { delete clip.loop; return; }
  clip.loop = { startBeats: clip.contentOffsetBeats ?? 0, lengthBeats: clip.lengthBeats };
}

export const clipIsLooped = (clip: TimelineClip) => !!(clip.audio ? clip.audio.loop : clip.loop);

/** The notes a clip actually plays, as plain clip-relative notes (no offset, no loop). */
export function flattenClipNotes(clip: TimelineClip): NoteEvent[] {
  return noteOccurrences(clip).map((o) => ({
    ...o.note, id: grooveUid(), startBeats: o.songBeat - clip.startBeats, lengthBeats: o.lengthBeats,
  }));
}

/** Bake a MIDI clip's window into its notes (consolidate): offset 0, no loop, nothing hidden. */
export function consolidateClip(clip: TimelineClip): void {
  if (!clip.notes) return;
  clip.notes = flattenClipNotes(clip);
  delete clip.contentOffsetBeats;
  delete clip.loop;
}

/** Glue a clip with the NEXT clip on its track (MIDI flattens both; audio only when the second
 *  continues the same file seamlessly). Returns false when they can't be joined. */
export function glueWithNext(doc: GrooveDoc, trackId: string, clipId: string): boolean {
  const hit = findClip(doc, trackId, clipId);
  if (!hit) return false;
  const { t, c } = hit;
  const next = t.clips
    .filter((x) => x.id !== c.id && x.startBeats >= c.startBeats + c.lengthBeats - 1e-6)
    .sort((a, b) => a.startBeats - b.startBeats)[0];
  if (!next) return false;
  if (c.audio || next.audio) {
    if (!c.audio || !next.audio || c.audio.sampleKey !== next.audio.sampleKey) return false;
    if (c.audio.loop || next.audio.loop) return false;
  }
  if (c.notes || next.notes) {
    const off = next.startBeats - c.startBeats;
    const mine = c.notes ? flattenClipNotes(c) : [];
    const theirs = next.notes ? flattenClipNotes(next).map((n) => ({ ...n, startBeats: n.startBeats + off })) : [];
    c.notes = [...mine, ...theirs];
    delete c.contentOffsetBeats;
    delete c.loop;
  }
  c.lengthBeats = next.startBeats + next.lengthBeats - c.startBeats;
  t.clips = t.clips.filter((x) => x.id !== next.id);
  return true;
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

// ── clipboard ───────────────────────────────────────────────────────────────

export interface ClipboardItem { trackIndex: number; clip: TimelineClip }
export interface ClipClipboard { items: ClipboardItem[]; spanStart: number; spanEnd: number }

/** Copy clips (by id) keeping their track offsets and timing relative to the earliest one. */
export function copyClips(doc: GrooveDoc, ids: Iterable<string>): ClipClipboard | null {
  const want = new Set(ids);
  const items: ClipboardItem[] = [];
  doc.arrangement.forEach((t, trackIndex) => {
    for (const c of t.clips) if (want.has(c.id)) items.push({ trackIndex, clip: JSON.parse(JSON.stringify(c)) });
  });
  if (!items.length) return null;
  const spanStart = Math.min(...items.map((i) => i.clip.startBeats));
  const spanEnd = Math.max(...items.map((i) => i.clip.startBeats + i.clip.lengthBeats));
  return { items, spanStart, spanEnd };
}

/**
 * Paste at `atBeat`, the top-most copied track landing on `anchorTrackIndex` (others keep their
 * relative track distance). A clip only lands on a track of its own kind; if the target track
 * doesn't match it falls back to its original track. Returns the new clip ids.
 */
export function pasteClips(doc: GrooveDoc, cb: ClipClipboard, atBeat: number, anchorTrackIndex?: number): string[] {
  const made: string[] = [];
  const topIdx = Math.min(...cb.items.map((i) => i.trackIndex));
  for (const item of cb.items) {
    const src = doc.arrangement[item.trackIndex];
    const want = anchorTrackIndex === undefined ? item.trackIndex : anchorTrackIndex + (item.trackIndex - topIdx);
    const target = [doc.arrangement[want], src].find((t) => t && !t.foreign && !t.isFolder && (!src || t.kind === src.kind));
    if (!target) continue;
    const copy = JSON.parse(JSON.stringify(item.clip)) as TimelineClip;
    copy.id = grooveUid() + grooveUid();
    copy.startBeats = Math.max(0, atBeat + (item.clip.startBeats - cb.spanStart));
    delete copy.sectionId; // a pasted copy is the user's clip, not one the song sections rewrite
    if (copy.notes) copy.notes = copy.notes.map((n) => ({ ...n, id: grooveUid() }));
    target.clips.push(copy);
    made.push(copy.id);
  }
  return made;
}
