// components/MatteLayer.tsx — keyable media overlay. Sits above the visualizer
// and composites a luma/chroma/AI-keyed image or video, scaled by the bass.
// Uses the app's shared analyser for reactivity.

import React, { useEffect, useRef } from 'react';
import { MatteEngine, KeyMode } from '../engine/matting/matteEngine';
import { analyzeBands, createBeatState } from '../engine/analysis';

export interface MatteSettings {
  mode: KeyMode; thresh: number; scale: number; react: boolean;
}

interface Props {
  analyser: AnalyserNode | null;
  engine: MatteEngine;
  settings: MatteSettings;
  id?: string;
}

const MatteLayer: React.FC<Props> = ({ analyser, engine, settings, id }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const aRef = useRef(analyser); aRef.current = analyser;
  const sRef = useRef(settings); sRef.current = settings;

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const beat = createBeatState();
    const data = new Uint8Array(2048);
    let W = 0, H = 0; const DPR = Math.min(window.devicePixelRatio || 1, 2);
    function resize() {
      const r = canvas.parentElement!.getBoundingClientRect();
      W = r.width; H = r.height; canvas.width = W * DPR; canvas.height = H * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    resize();
    const ro = new ResizeObserver(resize); ro.observe(canvas.parentElement!);
    let raf = 0;
    function loop() {
      const s = sRef.current;
      engine.mode = s.mode; engine.thresh = s.thresh; engine.scale = s.scale; engine.react = s.react;
      let bass = 0, level = 0;
      if (aRef.current) { const b = analyzeBands(aRef.current, data, 0.8, beat); bass = b.bass; level = b.level; }
      engine.draw(ctx, W, H, bass, level);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [engine]);

  return <canvas id={id} ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5 }} />;
};

export default MatteLayer;
