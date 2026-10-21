// Melos Beats — what a clip plays. A clip is a WINDOW onto its content: `contentOffsetBeats` is
// the content beat heard at the clip's start (slip edit / left trim, non-destructive), and an
// optional `loop` wraps content from loop end back to loop start for as long as the clip runs
// (Bitwig-style: an intro before the loop start plays once). Every consumer — scheduler, bounce,
// timeline drawing, piano roll playhead, CC lanes, MIDI export — reads clips through here, so a
// slipped or looped clip sounds, draws and exports the same everywhere.

import type { NoteEvent, TimelineClip } from './grooveDoc';

export interface ContentWindow {
  songStart: number;    // absolute beat where this pass begins
  songEnd: number;
  contentStart: number; // content beat at songStart
  contentEnd: number;   // content beat at songEnd
}

const EPS = 1e-9;

/** The active loop, or null when the clip doesn't loop (or the loop is degenerate). */
export function clipLoop(clip: TimelineClip): { start: number; end: number; len: number } | null {
  const l = clip.loop;
  if (!l || !(l.lengthBeats > 1e-6)) return null;
  return { start: l.startBeats, end: l.startBeats + l.lengthBeats, len: l.lengthBeats };
}

/** Map a content position into the loop (positions before the loop end play straight). */
function wrap(c: number, loop: { start: number; end: number; len: number } | null): number {
  if (!loop || c < loop.end - EPS) return c;
  return loop.start + (((c - loop.start) % loop.len) + loop.len) % loop.len;
}

/** Content passes of a clip intersecting [fromSong, toSong). */
export function contentWindows(clip: TimelineClip, fromSong = -Infinity, toSong = Infinity): ContentWindow[] {
  const out: ContentWindow[] = [];
  const end = clip.startBeats + clip.lengthBeats;
  const loop = clipLoop(clip);
  let t = clip.startBeats;
  let c = wrap(clip.contentOffsetBeats ?? 0, loop);
  for (let guard = 0; guard < 100000 && t < end - EPS; guard++) {
    const passLen = loop && c < loop.end - EPS ? loop.end - c : end - t;
    const segEnd = Math.min(end, t + passLen);
    if (segEnd > fromSong + EPS && t < toSong - EPS) {
      out.push({ songStart: t, songEnd: segEnd, contentStart: c, contentEnd: c + (segEnd - t) });
    }
    if (segEnd >= toSong) break;
    t = segEnd;
    c = loop ? loop.start : c + passLen;
  }
  return out;
}

/** Content beat heard at an absolute song beat inside the clip (null outside it). */
export function contentPosAt(clip: TimelineClip, songBeat: number): number | null {
  if (songBeat < clip.startBeats - EPS || songBeat >= clip.startBeats + clip.lengthBeats - EPS) return null;
  const w = contentWindows(clip, songBeat, songBeat + EPS)[0];
  return w ? w.contentStart + (songBeat - w.songStart) : null;
}

export interface NoteOccurrence {
  note: NoteEvent;
  songBeat: number;     // absolute start
  lengthBeats: number;  // clipped to the pass (loop end) and the clip end
}

/** Notes that START in [fromSong, toSong), placed in song time through offset + loop. */
export function noteOccurrences(clip: TimelineClip, fromSong = -Infinity, toSong = Infinity): NoteOccurrence[] {
  const notes = clip.notes;
  if (!notes?.length) return [];
  const out: NoteOccurrence[] = [];
  for (const w of contentWindows(clip, fromSong, toSong)) {
    for (const n of notes) {
      if (n.startBeats < w.contentStart - EPS || n.startBeats >= w.contentEnd - EPS) continue;
      const songBeat = w.songStart + (n.startBeats - w.contentStart);
      if (songBeat < fromSong - EPS || songBeat >= toSong - EPS) continue;
      out.push({ note: n, songBeat, lengthBeats: Math.max(0.01, Math.min(n.lengthBeats, w.songEnd - songBeat)) });
    }
  }
  return out;
}

/** Content length worth showing in an editor: covers the loop, the window and every note. */
export function contentExtent(clip: TimelineClip): number {
  const loop = clipLoop(clip);
  const notesEnd = (clip.notes ?? []).reduce((m, n) => Math.max(m, n.startBeats + n.lengthBeats), 0);
  const windowEnd = (clip.contentOffsetBeats ?? 0) + (loop ? 0 : clip.lengthBeats);
  return Math.max(loop ? loop.end : 0, windowEnd, notesEnd, clip.lengthBeats);
}

/** Audio: the file region a looped audio clip repeats, or null. */
export function audioLoop(clip: TimelineClip): { startSec: number; endSec: number } | null {
  const l = clip.audio?.loop;
  if (!l || !(l.lengthSec > 1e-4)) return null;
  return { startSec: l.startSec, endSec: l.startSec + l.lengthSec };
}
