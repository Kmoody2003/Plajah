// WorkerCompositorView — Phase 2 off-main-thread path. Transfers the composite
// canvas to a Web Worker (renderWorker) and, each frame, reads the audio +
// posts tiny GPU-generator descriptors; the worker does ALL the GL work. The main
// thread stays nearly idle, which is the real-time perf win for GPU-native scenes.
//
// Scope: renders GPU-native generator layers only (the ones with a GLSL port).
// DOM sources (media / Milkdrop / Canvas2D generators / overlays) can't cross the
// thread boundary cheaply, so they're not shown in worker mode — use the normal
// (main-thread) compositor for those. Opt-in via config.workerCompositor.

import React, { useEffect, useRef } from 'react';
import { hasGenerator, hexToRgb } from '../engine/core/generators';
import { VisualizationConfig } from '../types';
import type { LauncherLayer } from './ClipLauncher';

const MAX_HEIGHT = 1080;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

interface Props {
  layers: LauncherLayer[];
  analyser: AnalyserNode | null;
  config: VisualizationConfig;
}

const WorkerCompositorView: React.FC<Props> = ({ layers, analyser, config }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const startRef = useRef(0);

  const layersRef = useRef(layers);     layersRef.current = layers;
  const analyserRef = useRef(analyser); analyserRef.current = analyser;
  const configRef = useRef(config);     configRef.current = config;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let worker: Worker;
    try {
      worker = new Worker(new URL('../engine/core/renderWorker.ts', import.meta.url), { type: 'module' });
      const off = canvas.transferControlToOffscreen();
      worker.postMessage({ type: 'init', canvas: off }, [off]);
      workerRef.current = worker;
      startRef.current = performance.now();
    } catch (e) {
      console.warn('[PixelsCore] worker init failed:', e);
      return;
    }

    let raf = 0;
    const tick = () => {
      const container = containerRef.current;
      const a = analyserRef.current;
      if (container) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        let w = Math.max(1, Math.round(container.clientWidth * dpr));
        let h = Math.max(1, Math.round(container.clientHeight * dpr));
        if (h > MAX_HEIGHT) { w = Math.round(w * (MAX_HEIGHT / h)); h = MAX_HEIGHT; }

        // Audio → fresh transferable arrays (worker has no AnalyserNode).
        const bins = a?.frequencyBinCount ?? 1024;
        const fftN = a?.fftSize ?? 2048;
        const freq = new Uint8Array(bins);
        const wave = new Uint8Array(fftN);
        if (a) { a.getByteFrequencyData(freq); a.getByteTimeDomainData(wave); }

        // GPU-native generator layers only, bottom → top.
        const ls = layersRef.current;
        const genLayers: any[] = [];
        for (let i = 0; i < ls.length; i++) {
          const layer = ls[i];
          if (layer.bypassed || layer.muted || layer.activeCol == null) continue;
          const clip = layer.clips[layer.activeCol];
          if (!clip || clip.type !== 'generator' || !hasGenerator(clip.sceneMode)) continue;
          genLayers.push({
            id: layer.id, mode: clip.sceneMode,
            opacity: clamp01((layer.opacity ?? 1) * (clip.opacity ?? 1)),
            blend: layer.blendMode || 'normal',
            params: clip.params || [],
          });
        }
        const cfg = configRef.current;
        workerRef.current?.postMessage({
          type: 'frame', width: w, height: h, time: (performance.now() - startRef.current) / 1000,
          grade: {
            brightness: cfg.gradeBrightness ?? 1, contrast: cfg.gradeContrast ?? 1,
            saturation: cfg.gradeSaturation ?? 1, gamma: cfg.gradeGamma ?? 1,
          },
          freq, wave, layers: genLayers,
          colors: (cfg.colorPalette || []).slice(0, 3).map(hexToRgb),
        }, [freq.buffer, wave.buffer]);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      try { worker.postMessage({ type: 'dispose' }); } catch { /* */ }
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0" style={{ overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
};

export default WorkerCompositorView;
