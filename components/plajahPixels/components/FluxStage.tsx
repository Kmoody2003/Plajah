// components/FluxStage.tsx — renders the active FLUX 3D scene (three.js, Trapcode
// Form / Mir) in the same slot as StudioStage. Flux owns one shared renderer, so
// each host blits its canvas into a per-host 2D surface (like the DJ console and
// the Fabula monitor) rather than mounting the renderer's canvas directly. Driven
// by the app's shared AnalyserNode, bridged into the FluxSpec.

import React, { useEffect, useRef } from 'react';
import { VisualizationConfig, MODE_TO_FLUX_SCENE } from '../types';
import { renderFluxLatest } from '../engine/core/flux';
import { FluxMusicSampler } from '../../../services/fabula/fluxMusic';
import { AdaptiveScale, quantizePx } from '../engine/core/adaptiveScale';

// Render tier, per device: 'ultra' opts the scenes that have one (Deco Morph) into their photoreal
// variant — PBR gold, soft shadows, AO, two rays per pixel — for high-end GPUs.
export type FluxQuality = 'standard' | 'ultra';
const QUALITY_KEY = 'plajah.fluxQuality';
export function getFluxQuality(): FluxQuality {
  try { return localStorage.getItem(QUALITY_KEY) === 'ultra' ? 'ultra' : 'standard'; } catch { return 'standard'; }
}
export function setFluxQuality(q: FluxQuality) {
  try { localStorage.setItem(QUALITY_KEY, q); } catch { /* private mode: this session only */ }
  window.dispatchEvent(new CustomEvent('plajah:flux-quality', { detail: q }));
}

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
    const DPR = 1; // capped to 1 — bloom + grain hides pixel detail; 2x would render at 4K on Retina
    let freq = new Uint8Array(2048);
    const music=new FluxMusicSampler();
    const start = performance.now();
    let quality: FluxQuality = getFluxQuality();
    const onQuality = (e: Event) => { quality = ((e as CustomEvent).detail as FluxQuality) || getFluxQuality(); };
    const onStorage = (e: StorageEvent) => { if (e.key === QUALITY_KEY) quality = getFluxQuality(); };
    window.addEventListener('plajah:flux-quality', onQuality); window.addEventListener('storage', onStorage);

    // Dynamic resolution: the scale steps down when frames run long and probes back up when
    // they're on time, so the stage holds 60fps on weaker GPUs instead of stuttering.
    const adapt = new AdaptiveScale(0.5, 1, 1);
    function resize() {
      const host = cv.parentElement!;
      const r = host.getBoundingClientRect();
      const w = quantizePx(r.width * DPR * adapt.scale), h = quantizePx(r.height * DPR * adapt.scale);
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cv.parentElement!);

    let raf = 0;
    let lastResume = 0;
    function loop(now: number) {
      if (adapt.frame(now)) resize();
      const cfg = cfgRef.current;
      const scene = MODE_TO_FLUX_SCENE[cfg.mode] || 'field';
      const a = analyserRef.current;
      // Chrome silently suspends AudioContexts after inactivity. Periodically
      // resume to keep the FFT data flowing (~every 5 seconds to avoid spam).
      if (a && now - lastResume > 5000) {
        lastResume = now;
        const ctx = a.context as AudioContext;
        if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
      }
      let bands = { bass: 0, mid: 0, treble: 0, level: 0, beat: 0 };
      if (a) {
        const n = a.frequencyBinCount;
        if (n > freq.length) freq = new Uint8Array(n);
        const d = freq.length === n ? freq : freq.subarray(0, n);
        a.getByteFrequencyData(d as Uint8Array);

        // Detect if audio buffer is completely silent/flat
        let hasEnergy = false;
        for (let i = 0; i < d.length; i++) {
          if (d[i] > 2) { hasEnergy = true; break; }
        }

        if (hasEnergy) {
          bands = music.sample(d, (now - start) / 1000, a.context.sampleRate);
        } else {
          // Graceful rest state: gentle sinusoidal breathing when music is quiet or paused
          const timeSec = (now - start) / 1000;
          const ambientPulse = 0.08 + Math.sin(timeSec * 1.5) * 0.04;
          bands = {
            bass: ambientPulse,
            mid: ambientPulse * 0.7,
            treble: ambientPulse * 0.5,
            level: ambientPulse * 0.8,
            beat: 0,
          };
        }
      } else {
        const timeSec = (now - start) / 1000;
        const ambientPulse = 0.08 + Math.sin(timeSec * 1.5) * 0.04;
        bands = {
          bass: ambientPulse,
          mid: ambientPulse * 0.7,
          treble: ambientPulse * 0.5,
          level: ambientPulse * 0.8,
          beat: 0,
        };
      }
      const t = (now - start) / 1000;
      const src = renderFluxLatest(
        { scene: scene as any, sensitivity: cfg.sensitivity, exposure: 1, bloom: Math.max(0.4, Math.min(2, (cfg.glowIntensity || 15) / 15)), quality },
        cv.width, cv.height, t, bands,
      );
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (src) ctx.drawImage(src, 0, 0, cv.width, cv.height);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('plajah:flux-quality', onQuality); window.removeEventListener('storage', onStorage); };
  }, []);

  const blend = { mixBlendMode: config.blendMode as any };
  return (
    <div id={id} style={{ position: 'absolute', inset: 0 }}>
      <canvas ref={vizRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', ...blend }} />
    </div>
  );
};

export default FluxStage;
