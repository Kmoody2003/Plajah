// Automation recording (Touch / Latch / Write), Bitwig/Studio One style, with zero plumbing in the
// mixer: while the song plays, every track whose automation mode isn't Read is watched; when one of
// its mix controls (volume, pan, sends) changes, the move is written into that control's lane at
// the playhead. One recording pass = one undo step.
//
//   Touch — writes while the control is moving (and briefly after), then the lane plays again.
//   Latch — starts writing on the first move and keeps writing the last value until stop.
//   Write — writes the control's value for the whole pass, moved or not.

import { useEffect, useRef } from 'react';
import { BeatsEngine } from '../../../services/melos/beats/engine/BeatsEngine';
import type { AutomationTarget, GrooveDoc } from '../../../services/melos/beats/grooveDoc';
import { grooveUid } from '../../../services/melos/beats/grooveDoc';
import { ensureLane, staticValue, targetKey, writeLane } from '../../../services/melos/beats/automation';

const RECORDABLE: AutomationTarget[] = [{ kind: 'volume' }, { kind: 'pan' }, { kind: 'send', index: 0 }, { kind: 'send', index: 1 }];
const TOUCH_RELEASE_MS = 450;
const TICK_MS = 40;

interface Watch { last: number; active: boolean; lastMove: number }

export function useAutomationRecorder(
  doc: GrooveDoc,
  running: boolean,
  playMode: 'pattern' | 'song',
  mutate: (fn: (d: GrooveDoc) => void, opts?: { coalesce?: string }) => void,
): void {
  const docRef = useRef(doc);
  docRef.current = doc;
  const mutateRef = useRef(mutate);
  mutateRef.current = mutate;

  useEffect(() => {
    if (!running || playMode !== 'song') return;
    const pass = `auto-rec:${Date.now()}`;
    const watch = new Map<string, Watch>();
    let prevBeat: number | null = null;

    const tick = () => {
      const d = docRef.current;
      const beat = BeatsEngine.get().posBeatsDisplay();
      // A loop wrap (or a seek) jumps backwards: start a fresh segment, write nothing this tick.
      if (prevBeat === null || beat < prevBeat - 1e-6) { prevBeat = beat; return; }
      const from = prevBeat;
      prevBeat = beat;
      const now = performance.now();
      const writes: { trackId: string; target: AutomationTarget; value: number }[] = [];
      for (const t of d.arrangement) {
        const mode = t.automationMode ?? 'read';
        if (mode === 'read' || t.foreign || t.isFolder || (t.kind !== 'audio' && t.kind !== 'instrument')) continue;
        for (const target of RECORDABLE) {
          const k = `${t.id}:${targetKey(target)}`;
          const v = staticValue(t, target);
          const hasLane = !!t.automationLanes?.some((l) => targetKey(l.target) === targetKey(target));
          const w = watch.get(k) ?? { last: v, active: false, lastMove: 0 };
          const moved = Math.abs(v - w.last) > 1e-6;
          if (moved) { w.lastMove = now; w.last = v; }
          // Write overwrites the controls that are automated (or get moved) — it doesn't sprout
          // lanes for controls nobody touched.
          if (mode === 'write') w.active = w.active || hasLane || moved;
          else if (mode === 'latch') w.active = w.active || moved;
          else w.active = moved || now - w.lastMove < TOUCH_RELEASE_MS; // touch
          watch.set(k, w);
          if (w.active) writes.push({ trackId: t.id, target, value: v });
        }
      }
      if (!writes.length) return;
      mutateRef.current((dd) => {
        for (const wr of writes) {
          const t = dd.arrangement.find((x) => x.id === wr.trackId);
          if (!t) continue;
          const lane = ensureLane(t, wr.target, grooveUid);
          writeLane(lane, from, beat, wr.value);
        }
      }, { coalesce: pass });
    };
    const id = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(id);
  }, [running, playMode]);
}
