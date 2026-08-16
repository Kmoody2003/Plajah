// The rAF bridge — the ONLY place engine state crosses into React. The trigger path never
// touches React; this loop polls playhead/meters/diagnostics at display rate for the UI.

import { useEffect, useState } from 'react';
import { BeatsEngine, type EngineDiagnostics } from '../../../services/melos/beats/engine/BeatsEngine';

export interface EngineSnapshot {
  beats: number;
  running: boolean;
  suspended: boolean;
  meters: { groups: number[]; master: number };
  limiterReduction: number;
  diag: EngineDiagnostics | null;
  frame: number; // increments each rAF — lets pad lights re-style from engine.lastHit
}

export function useEngineBridge(): EngineSnapshot {
  const [snap, setSnap] = useState<EngineSnapshot>({
    beats: 0, running: false, suspended: true,
    meters: { groups: [0, 0, 0, 0], master: 0 }, limiterReduction: 0, diag: null, frame: 0,
  });

  useEffect(() => {
    let raf = 0;
    let frame = 0;
    const loop = () => {
      const e = BeatsEngine.get();
      const ctx = e.getContext();
      frame++;
      setSnap({
        beats: e.posBeatsDisplay(),
        running: e.isRunning(),
        suspended: !ctx || ctx.state !== 'running',
        meters: e.meters(),
        limiterReduction: e.limiterReduction(),
        diag: e.diagnostics(),
        frame,
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return snap;
}
