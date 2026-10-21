// Melos Beats — note edits for the piano roll (and anything else that edits MIDI): quantize with
// strength / swing / ends, transpose, fold to the project scale, and a note clipboard. Pure —
// operate on NoteEvent lists in clip-content beats.

import { grooveUid, type NoteEvent, type SongKey } from './grooveDoc';
import { snapToScale } from '../theory';

export interface QuantizeOptions {
  /** Snap a content beat to the grid (the roll's grid, in content beats). */
  snap: (beat: number) => number;
  /** Grid cell size at a beat (for swing and end quantize). */
  cell: (beat: number) => number;
  strength?: number;      // 0..1, default 1 — how far notes move toward the grid
  swing?: number;         // 0..1 — delays every second grid line by up to half a cell
  ends?: boolean;         // also quantize note ends (lengths)
  /** Content beat where the grid's even/odd count starts (the bar line), for swing parity. */
  phase?: (beat: number) => number;
}

/** Quantize notes in place (only those listed in `ids`, or all when ids is empty). */
export function quantizeNotes(notes: NoteEvent[], ids: Set<string>, o: QuantizeOptions): void {
  const k = Math.max(0, Math.min(1, o.strength ?? 1));
  const swing = Math.max(0, Math.min(1, o.swing ?? 0));
  for (const n of notes) {
    if (ids.size && !ids.has(n.id)) continue;
    let target = o.snap(n.startBeats);
    if (swing > 0) {
      const cell = o.cell(target);
      const origin = o.phase ? o.phase(target) : 0;
      const idx = Math.round((target - origin) / cell);
      if (Math.abs(idx % 2) === 1) target += swing * cell * 0.5;
    }
    const end = n.startBeats + n.lengthBeats;
    const start = n.startBeats + (target - n.startBeats) * k;
    let len = end - start;
    if (o.ends) {
      const qEnd = o.snap(end);
      const newEnd = end + (qEnd - end) * k;
      len = Math.max(o.cell(start) * k || 0.01, newEnd - start);
    }
    n.startBeats = Math.max(0, start);
    n.lengthBeats = Math.max(0.01, len);
  }
}

/** Transpose (semitones), clamped to the MIDI range. */
export function transposeNotes(notes: NoteEvent[], ids: Set<string>, semis: number): void {
  for (const n of notes) if (!ids.size || ids.has(n.id)) n.key = Math.max(0, Math.min(127, n.key + semis));
}

/** Fold pitches onto the project scale (nearest scale tone). */
export function fitNotesToScale(notes: NoteEvent[], ids: Set<string>, key: SongKey): void {
  for (const n of notes) if (!ids.size || ids.has(n.id)) n.key = snapToScale(n.key, key.tonic, key.scale, 'nearest');
}

/** Pitch for a drawn/dragged note under Scale lock (identity when unlocked). */
export const lockPitch = (key: number, lock: SongKey | null) => (lock ? snapToScale(key, lock.tonic, lock.scale, 'nearest') : key);

export interface NoteClipboard { notes: NoteEvent[]; span: number }

/** Copy notes, timed relative to the earliest. */
export function copyNotes(notes: NoteEvent[], ids: Set<string>): NoteClipboard | null {
  const picked = notes.filter((n) => ids.has(n.id));
  if (!picked.length) return null;
  const t0 = Math.min(...picked.map((n) => n.startBeats));
  const end = Math.max(...picked.map((n) => n.startBeats + n.lengthBeats));
  return { notes: picked.map((n) => ({ ...JSON.parse(JSON.stringify(n)), startBeats: n.startBeats - t0 })), span: end - t0 };
}

/** Paste at a content beat; returns the new ids. */
export function pasteNotes(notes: NoteEvent[], cb: NoteClipboard, at: number): string[] {
  const made: string[] = [];
  for (const n of cb.notes) {
    const id = grooveUid();
    notes.push({ ...JSON.parse(JSON.stringify(n)), id, startBeats: Math.max(0, at + n.startBeats) });
    made.push(id);
  }
  return made;
}

/** Notes intersecting a content-beat × pitch rectangle (marquee). */
export function notesInRect(notes: NoteEvent[], b0: number, b1: number, k0: number, k1: number): string[] {
  const lo = Math.min(b0, b1), hi = Math.max(b0, b1);
  const klo = Math.min(k0, k1), khi = Math.max(k0, k1);
  return notes.filter((n) => n.key >= klo && n.key <= khi && n.startBeats < hi && n.startBeats + n.lengthBeats > lo).map((n) => n.id);
}
