// components/FluxStage.tsx — renders the active FLUX 3D scene (three.js, Trapcode
// Form / Mir) in the same slot as StudioStage. Flux owns one shared renderer, so
// each host blits its canvas into a per-host 2D surface (like the DJ console and
// the Fabula monitor) rather than mounting the renderer's canvas directly. Driven
// by the app's shared AnalyserNode, bridged into the FluxSpec.

import React, { useEffect, useRef } from 'react';
import { VisualizationConfig, MODE_TO_FLUX_SCENE } from '../types';
import { renderFluxLatest } from '../engine/core/flux';
import { fluxBandsFromFreq } from '../../../services/fabula/fluxNode';

interface Props {
  analyser: AnalyserNode | null;
  config: VisualizationConfig;
  isPlaying: boolean;
  id?: string;
}

const FluxStage: React.FC<Props> = ({ analyser, config, isPlaying, id }) => {
  const vizRef = useRef<HTMLCanvasElement>(null);
  const cfgRef = useRef(config); cfgRef.current = config;
  const analyserRef = useRef(analyser); analyserRef.current = analyser;

  useEffect(() => {
    const cv = vizRef.current!;
    const ctx = cv.getContext('2d')!;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    let freq = new Uint8Array(2048);
    const start = performance.now();

    function resize() {
      const host = cv.parentElement!;
      const r = host.getBoundingClientRect();
      cv.width = Math.max(2, Math.floor(r.width * DPR));
      cv.height = Math.max(2, Math.floor(r.height * DPR));
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cv.parentElement!);

    let raf = 0;
    function loop(now: number) {
      const cfg = cfgRef.current;
      const scene = MODE_TO_FLUX_SCENE[cfg.mode] || 'field';
      const a = analyserRef.current;
      let bands = { bass: 0, mid: 0, treble: 0, level: 0, beat: 0 };
      if (a) {
        const n = a.frequencyBinCount;
        if (n > freq.length) freq = new Uint8Array(n);
        const d = freq.length === n ? freq : freq.subarray(0, n);
        a.getByteFrequencyData(d as Uint8Array);
        bands = fluxBandsFromFreq(d, a.context.sampleRate);
      }
      const t = (now - start) / 1000;
      const src = renderFluxLatest(
        { scene: scene as any, sensitivity: cfg.sensitivity, exposure: 1, bloom: Math.max(0.4, Math.min(2, (cfg.glowIntensity || 15) / 15)) },
        cv.width, cv.height, t, bands,
      );
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (src) ctx.drawImage(src, 0, 0, cv.width, cv.height);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  const blend = { mixBlendMode: config.blendMode as any };
  return (
    <div id={id} style={{ position: 'absolute', inset: 0 }}>
      <canvas ref={vizRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', ...blend }} />
    </div>
  );
};

export default FluxStage;
