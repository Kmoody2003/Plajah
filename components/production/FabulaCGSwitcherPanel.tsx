// FabulaCGSwitcherPanel — Fabula CG inside the TV Studio switcher.
//
// The CG playout renders into one transparent 1920×1080 canvas that is
// registered as a 'TELA' overlay on the switcher engine, so everything taken —
// from this panel, from Fabula's Graphics workspace in another window, or from
// Stage — composites over PROGRAM and rides out on the stream/recording.
// Stingers can cut the switcher at their cut point (covered frame).
import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { TVStudioEngine } from '../../services/tvStudioEngine';
import { sharedPlayout } from '../../services/fabula/cg/cgPlayout';
import { createCgOverlayCanvas } from '../../services/fabula/cg/cgOutput';
import { publishAppOutput } from '../../services/mediaEngine/bridge';
const CgWorkspace = lazy(() => import('../Fabula/cg/CgWorkspace'));

export const FABULA_CG_OVERLAY_ID = 'fabula_cg';

export default function FabulaCGSwitcherPanel({ visible, target, ping }: { visible: boolean; target: () => TVStudioEngine | null; ping?: (m: string) => void }) {
  const [autoCut, setAutoCut] = useState(true);
  const autoCutRef = useRef(autoCut); autoCutRef.current = autoCut;
  const targetRef = useRef(target); targetRef.current = target;

  // Always-on overlay (even while the tab is hidden): idle when nothing is on air.
  useEffect(() => {
    const playout = sharedPlayout({ master: true });
    const handle = createCgOverlayCanvas(playout, { width: 1920, height: 1080 });
    let attached: TVStudioEngine | null = null;
    const attach = () => {
      const e = targetRef.current();
      if (!e || e === attached) return;
      e.removeOverlay(FABULA_CG_OVERLAY_ID);
      e.addOverlay({ id: FABULA_CG_OVERLAY_ID, label: 'Fabula CG', type: 'TELA', canvasEl: handle.canvas, visible: true, opacity: 1 } as never);
      attached = e;
    };
    attach();
    const poll = setInterval(attach, 1000); // the engine is created after first paint
    // Also expose the CG layer on the app bus (key/fill for other Plajah apps).
    let stream: MediaStream | null = null;
    try { stream = (handle.canvas as HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream }).captureStream?.(30) || null; if (stream) publishAppOutput('fabula:graphics', stream, 'Fabula CG'); } catch { /* optional */ }
    return () => { clearInterval(poll); attached?.removeOverlay(FABULA_CG_OVERLAY_ID); handle.stop(); stream?.getTracks().forEach(t => t.stop()); };
  }, []);

  return (
    <div className={`${visible ? 'flex' : 'hidden'} flex-col shrink-0 rounded-xl border border-white/10 bg-[#0e1016]`} style={{ height: 'min(70vh, 720px)' }}>
      <div className="flex items-center gap-3 px-3 pt-2 text-xs">
        <span className="font-semibold">Fabula CG</span>
        <span className="opacity-50">Composited over Program · same playout as Fabula and Stage</span>
        <label className="ml-auto flex items-center gap-1 opacity-80"><input type="checkbox" checked={autoCut} onChange={e => setAutoCut(e.target.checked)} /> Stingers cut Preview → Program</label>
      </div>
      <div className="flex-1 min-h-0">
        <Suspense fallback={<p className="p-6 text-xs opacity-50">Loading Fabula CG…</p>}>
          <CgWorkspace host="switcher" initialRoom="live" ping={ping}
            onStingerCut={() => { if (autoCutRef.current) targetRef.current()?.cut(); }} />
        </Suspense>
      </div>
    </div>
  );
}
