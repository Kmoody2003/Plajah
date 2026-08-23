// Where the wobble lane and the gate grid actually are, right now.
//
// Both sections read the transport directly in the Rust engine rather than being stepped by the
// host, so the UI cannot be told where they are — it has to derive the same thing from the same
// clock. These two expressions mirror `Wobble::frame` and the gate block in
// rust/plajah-audio/src/bajo.rs line for line; if either changes, this changes with it, or the
// playhead starts lying about what you are hearing.
//
// Polled on a frame loop and gated on the index actually changing, so a component re-renders 4 to
// 32 times a bar rather than 60 times a second.

import { useEffect, useRef, useState } from 'react';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';

/** Gate cell lengths in beats — mirrors `GATE_DIVS` in params.rs: 1/8, 1/16, 1/32. */
const GATE_DIVS = [0.5, 0.25, 0.125];

export interface BajoTransport {
  /** Which of the 16 lane slots is sounding, or -1 when stopped. */
  laneStep: number;
  /** Which of the 16 gate cells is sounding, or -1 when stopped. */
  gateCell: number;
  /** Continuous position in beats, for anything that needs sub-step resolution. */
  beats: number;
  running: boolean;
}

const STOPPED: BajoTransport = { laneStep: -1, gateCell: -1, beats: 0, running: false };

/**
 * @param gateRate index into GATE_DIVS — the patch's Ghost Gate rate.
 * @param wantBeats set when the caller needs the continuous position (the morph pad's loop does;
 *   the playheads do not, and leaving it off keeps them at a few renders per bar).
 */
export function useBajoTransport(gateRate: number, wantBeats = false): BajoTransport {
  const [state, setState] = useState<BajoTransport>(STOPPED);
  const last = useRef<BajoTransport>(STOPPED);
  const rate = GATE_DIVS[Math.max(0, Math.min(2, Math.round(gateRate)))] ?? 0.25;

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      let eng: BeatsEngine | null = null;
      try { eng = BeatsEngine.get(); } catch { eng = null; }
      if (!eng || !eng.isRunning()) {
        if (last.current.running) { last.current = STOPPED; setState(STOPPED); }
        return;
      }
      const beats = eng.posBeats();
      // `rem_euclid` in Rust, which is not what % does for negatives in JS.
      const laneStep = ((Math.floor(beats * 4) % 16) + 16) % 16;
      const gateCell = ((Math.floor(beats / rate) % 16) + 16) % 16;
      const prev = last.current;
      if (
        prev.laneStep !== laneStep ||
        prev.gateCell !== gateCell ||
        !prev.running ||
        (wantBeats && Math.abs(prev.beats - beats) > 0.02)
      ) {
        const next = { laneStep, gateCell, beats, running: true };
        last.current = next;
        setState(next);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [rate, wantBeats]);

  return state;
}
