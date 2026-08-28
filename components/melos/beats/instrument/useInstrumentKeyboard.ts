// QWERTY as a keyboard, plus note recording against the transport.
//
// Layout is the tracker/DAW convention people already have in their fingers: the home row is the
// white keys and the row above holds the sharps, with a second octave on the QWERTY row.
//
// The armed instrument track OWNS the keyboard — that's why the pads release their z/x/c/v
// bindings while a track is armed. Two things grabbing the same key is worse than either.

import { useEffect, useRef } from 'react';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import { grooveUid, type ArrangeTrack, type GrooveDoc, type NoteEvent } from '../../../../services/melos/beats/grooveDoc';

/** key → semitone offset from the base octave's C. */
const KEY_MAP: Record<string, number> = {
  z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11, ',': 12,
  q: 12, '2': 13, w: 14, '3': 15, e: 16, r: 17, '5': 18, t: 19, '6': 20, y: 21, '7': 22, u: 23, i: 24,
};

export interface RecordedNote {
  key: number;
  vel: number;
  startBeats: number;
}

export interface KeyboardOptions {
  doc: GrooveDoc;
  armedTrack: ArrangeTrack | null;
  recording: boolean;
  running: boolean;
  /** Absolute transport position in beats, read at the moment a key is struck. */
  posBeats: () => number;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  octave: number;
  onOctaveChange: (o: number) => void;
}

export function useInstrumentKeyboard(opts: KeyboardOptions): void {
  // Everything the handlers need, in a ref — otherwise the listeners would be torn down and
  // rebuilt on every transport tick, which drops held keys.
  const ref = useRef(opts);
  ref.current = opts;

  const held = useRef(new Set<string>());
  const recorded = useRef(new Map<number, RecordedNote>());

  useEffect(() => {
    const isTyping = (t: EventTarget | null): boolean => {
      const el = t as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    };

    const onDown = (e: KeyboardEvent) => {
      const o = ref.current;
      if (!o.armedTrack || e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;

      const k = e.key.toLowerCase();
      if (k === 'arrowup' || k === 'arrowdown') {
        // Octave shift, clamped to something a keyboard can actually reach.
        e.preventDefault();
        o.onOctaveChange(Math.max(1, Math.min(7, o.octave + (k === 'arrowup' ? 1 : -1))));
        return;
      }
      const semi = KEY_MAP[k];
      if (semi === undefined || held.current.has(k)) return;
      e.preventDefault();
      held.current.add(k);

      const note = o.octave * 12 + semi;
      const vel = e.shiftKey ? 127 : 100; // shift = accent, the oldest trick in tracker history
      const engine = BeatsEngine.get();
      void engine.ensureInstrument(o.armedTrack).then(() => {
        engine.instrumentNoteOn(o.armedTrack!, note, vel);
      });

      if (o.recording && o.running) {
        recorded.current.set(note, { key: note, vel, startBeats: o.posBeats() });
      }
    };

    const onUp = (e: KeyboardEvent) => {
      const o = ref.current;
      const k = e.key.toLowerCase();
      if (!held.current.has(k)) return;
      held.current.delete(k);
      const semi = KEY_MAP[k];
      if (semi === undefined || !o.armedTrack) return;
      const note = o.octave * 12 + semi;
      BeatsEngine.get().instrumentNoteOff(o.armedTrack, note);

      const rec = recorded.current.get(note);
      if (rec) {
        recorded.current.delete(note);
        if (o.armedTrack) commitRecordedNote(o.armedTrack.id, rec, o.posBeats(), o.onMutate);
      }
    };

    // Losing focus with keys down would leave notes stuck on forever.
    const panic = () => {
      const o = ref.current;
      if (o.armedTrack) {
        for (const k of held.current) {
          const semi = KEY_MAP[k];
          if (semi !== undefined) BeatsEngine.get().instrumentNoteOff(o.armedTrack, o.octave * 12 + semi);
        }
      }
      held.current.clear();
      recorded.current.clear();
    };

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', panic);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', panic);
      panic();
    };
  }, []);
}

/**
 * Write a captured note into a clip on the armed track, creating the clip if the take started
 * somewhere no clip exists yet. Recording that silently discards notes is worse than not
 * recording, so the clip is grown to fit rather than clipping the take.
 * Exported so the hardware-MIDI path (BeatsRoom) records through the same code as QWERTY.
 */
export function commitRecordedNote(
  trackId: string,
  rec: RecordedNote,
  endBeats: number,
  onMutate: (fn: (d: GrooveDoc) => void) => void,
): void {
  const lengthBeats = Math.max(0.0625, endBeats - rec.startBeats);
  onMutate((d) => {
    const track = d.arrangement.find((t) => t.id === trackId);
    if (!track || track.kind !== 'instrument') return;

    let clip = track.clips.find(
      (c) => rec.startBeats >= c.startBeats - 1e-9 && rec.startBeats < c.startBeats + c.lengthBeats,
    );
    if (!clip) {
      // Start the clip on the bar the take began in — recording from bar 3 shouldn't create a
      // clip that starts at an arbitrary fraction of a beat.
      const barStart = Math.floor(rec.startBeats / 4) * 4;
      clip = { id: grooveUid(), startBeats: barStart, lengthBeats: 4, notes: [] };
      track.clips.push(clip);
    }
    if (!clip.notes) clip.notes = [];

    const note: NoteEvent = {
      id: grooveUid(),
      startBeats: rec.startBeats - clip.startBeats,
      lengthBeats,
      key: rec.key,
      vel: rec.vel,
    };
    clip.notes.push(note);

    // Grow the clip to contain the note, rounded out to the bar.
    const needed = note.startBeats + note.lengthBeats;
    if (needed > clip.lengthBeats) clip.lengthBeats = Math.ceil(needed / 4) * 4;
  });
}
