import { useCallback, useEffect, useRef } from 'react';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import type { ArrangeTrack, GrooveDoc } from '../../../../services/melos/beats/grooveDoc';
import { liveBus, now as liveNow } from '../../../../services/melos/beats/band/live/events';
import { commitRecordedNote, type RecordedNote } from '../../../../services/melos/midiRouting';

export { commitRecordedNote, type RecordedNote };

/**
 * QWERTY → semitone-above-octave-root. Classic two-row tracker/DAW layout:
 * bottom row z..m = C..B, home row s,d,g,h,j = black keys, top row q..u = next C..B.
 */
const KEY_MAP: Record<string, number> = {
  z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11,
  q: 12, '2': 13, w: 14, '3': 15, e: 16, r: 17, '5': 18, t: 19, '6': 20, y: 21, '7': 22, u: 23,
  i: 24, '9': 25, o: 26, '0': 27, p: 28,
};

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

interface HeldKey {
  track: ArrangeTrack;
  note: number;
  token: number;
}

export function useInstrumentKeyboard(opts: KeyboardOptions): void {
  // Everything the handlers need, in a ref — otherwise the listeners would be torn down and
  // rebuilt on every transport tick, which drops held keys.
  const ref = useRef(opts);
  ref.current = opts;

  const held = useRef(new Map<string, HeldKey>());
  const nextToken = useRef(0);
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
        e.preventDefault();
        o.onOctaveChange(Math.max(1, Math.min(7, o.octave + (k === 'arrowup' ? 1 : -1))));
        return;
      }
      const semi = KEY_MAP[k];
      if (semi === undefined || held.current.has(k)) return;
      e.preventDefault();

      const track = o.armedTrack;
      const note = o.octave * 12 + semi;
      const token = ++nextToken.current;
      // Record synchronously before any async init so a fast key-up cancels pending noteOn.
      held.current.set(k, { track, note, token });

      const vel = e.shiftKey ? 127 : 100; // shift = accent, the oldest trick in tracker history
      const engine = BeatsEngine.get();
      if (engine.getInstrument(track.id)) {
        engine.instrumentNoteOn(track, note, vel);
      } else {
        void engine.ensureInstrument(track).then((inst) => {
          const cur = held.current.get(k);
          if (!inst || !cur || cur.token !== token) return;
          engine.instrumentNoteOn(track, note, vel);
        });
      }

      if (o.recording && o.running) {
        recorded.current.set(note, { key: note, vel, startBeats: o.posBeats(), keys: engine.liveKeysFor(track, note) });
      }
    };

    const onUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const cur = held.current.get(k);
      if (!cur) return;
      held.current.delete(k);
      BeatsEngine.get().instrumentNoteOff(cur.track, cur.note);

      const rec = recorded.current.get(cur.note);
      if (rec) {
        recorded.current.delete(cur.note);
        commitRecordedNote(cur.track.id, rec, ref.current.posBeats(), ref.current.onMutate);
      }
    };

    // Losing focus with keys down would leave notes stuck on forever.
    const panic = () => {
      nextToken.current++;
      const engine = BeatsEngine.get();
      for (const cur of held.current.values()) {
        engine.instrumentNoteOff(cur.track, cur.note);
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

export interface AuditionKeyControls {
  noteOn: (n: number) => void;
  noteOff: (n: number) => void;
  releaseAll: (hard?: boolean) => void;
  heldSize: () => number;
}

/**
 * Race-free on-screen audition keyboard controller: binds synchronous held state + token guards
 * around async engine initialization so rapid taps, pointer-capture losses, preset switches, or
 * window blurs never leave an instrument voice stuck ringing.
 */
export function useAuditionKeys(
  track: ArrangeTrack,
  onStrike?: (note: number) => void,
): AuditionKeyControls {
  const held = useRef(new Map<number, { token: number; vid?: number }>());
  const nextToken = useRef(0);
  const trackRef = useRef(track);
  trackRef.current = track;
  const strikeRef = useRef(onStrike);
  strikeRef.current = onStrike;

  const noteOff = useCallback((n: number) => {
    const cur = held.current.get(n);
    if (!cur) return;
    held.current.delete(n);
    const tr = trackRef.current;
    const instName = tr.instrument?.type ?? 'instrument';
    liveBus.emit({ kind: 'note', instrument: instName, trackId: tr.id, at: liveNow(), key: n, velocity: 0, on: false });
    if (cur.vid === undefined) return;
    const eng = BeatsEngine.get();
    const existing = eng.getInstrument(tr.id);
    if (existing) {
      existing.noteOff(cur.vid, true);
    } else {
      void eng.ensureInstrument(tr).then((engineInst) => engineInst?.noteOff(cur.vid!, true));
    }
  }, []);

  const releaseAll = useCallback((hard = false) => {
    nextToken.current++;
    for (const n of [...held.current.keys()]) noteOff(n);
    if (hard) {
      BeatsEngine.get().getInstrument(trackRef.current.id)?.allNotesOff(true);
    }
  }, [noteOff]);

  const noteOn = useCallback((n: number) => {
    if (held.current.has(n)) noteOff(n);
    const token = ++nextToken.current;
    held.current.set(n, { token });
    const tr = trackRef.current;
    const instName = tr.instrument?.type ?? 'instrument';
    liveBus.emit({ kind: 'note', instrument: instName, trackId: tr.id, at: liveNow(), key: n, velocity: 0.8, on: true });
    strikeRef.current?.(n);

    const eng = BeatsEngine.get();
    const existing = eng.getInstrument(tr.id);
    if (existing) {
      const vid = existing.noteOn(n, 0.8, 0, 0, 1);
      held.current.set(n, { token, vid });
      return;
    }
    void eng.init().then(async () => {
      const engineInst = await eng.ensureInstrument(tr);
      const cur = held.current.get(n);
      if (!engineInst || !cur || cur.token !== token) return;
      cur.vid = engineInst.noteOn(n, 0.8, 0, 0, 1);
    });
  }, [noteOff]);

  useEffect(() => {
    const onBlur = () => releaseAll(false);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('blur', onBlur);
      releaseAll(false);
    };
  }, [track.id, releaseAll]);

  const heldSize = useCallback(() => held.current.size, []);

  return { noteOn, noteOff, releaseAll, heldSize };
}
