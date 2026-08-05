// PostProcessLayer — canvas overlay that applies additive post-processing effects
// on top of ALL visual layers (BackgroundLayer, ShaderLayer, ButterchurnLayer, 3D, etc.).
// Pixel-manipulation effects (chroma, glitch, zoom, warp, neon, mirror) require
// reading underlying pixels: those are handled per-canvas in AudioVisualizer and
// StudioStage. This overlay handles the remaining additive/blend effects that work
// without pixel capture: VHS, noise, invert strobe, and thermal tint.

import React, { useEffect, useRef } from 'react';
import { VisualizationConfig } from '../types';

interface Props {
  analyser: AnalyserNode | null;
  config: VisualizationConfig;
}

const PostProcessLayer: React.FC<Props> = ({ analyser, config }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cfgRef = useRef(config);
  const analyserRef = useRef(analyser);
  cfgRef.current = config;
  analyserRef.current = analyser;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const fft = new Uint8Array(2048);
    let raf = 0;

    const resize = () => {
      const p = canvas.parentElement;
      if (!p) return;
      const { width: w, height: h } = p.getBoundingClientRect();
      canvas.width = w;
      canvas.height = h;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);
    resize();

    const loop = () => {
      const cfg = cfgRef.current;
      const a = analyserRef.current;

      const hasOverlayFx = cfg.enableVhs || cfg.enableNoise || cfg.enableInvertStrobe || cfg.enableThermal;
      const ctx = canvas.getContext('2d');

      if (!hasOverlayFx || !a || !ctx) {
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        raf = requestAnimationFrame(loop);
        return;
      }

      const realFft = fft.length !== a.frequencyBinCount ? new Uint8Array(a.frequencyBinCount) : fft;
      a.getByteFrequencyData(realFft);
      const len = realFft.length;
      let bass = 0, mid = 0, treble = 0;
      for (let i = 0; i < Math.floor(len * 0.08); i++) bass += realFft[i];
      for (let i = Math.floor(len * 0.08); i < Math.floor(len * 0.35); i++) mid += realFft[i];
      for (let i = Math.floor(len * 0.35); i < len; i++) treble += realFft[i];
      const bL = bass / (Math.floor(len * 0.08) * 255);
      const mL = mid / (Math.floor(len * 0.27) * 255);
      const tL = treble / (Math.floor(len * 0.65) * 255);

      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (cfg.enableVhs) {
        const intv = (cfg.vhsIntensity || 0.4) * (1 + mL);
        ctx.save();
        ctx.fillStyle = `rgba(0,0,0,${intv * 0.14})`;
        for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1.5);
        const staticY = (performance.now() * 0.08) % h;
        ctx.fillStyle = `rgba(255,255,255,${intv * 0.06})`;
        ctx.fillRect(0, staticY, w, 14);
        ctx.restore();
      }

      if (cfg.enableNoise) {
        const intv = (cfg.noiseIntensity || 0.3) * (1 + tL);
        ctx.save();
        ctx.fillStyle = `rgba(255,255,255,${intv * 0.05})`;
        for (let i = 0; i < 300; i++)
          ctx.fillRect(Math.random() * w, Math.random() * h, Math.random() * 3 + 1, Math.random() * 3 + 1);
        ctx.restore();
      }

      if (cfg.enableInvertStrobe && bL > 0.85) {
        ctx.save();
        ctx.globalCompositeOperation = 'difference';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }

      if (cfg.enableThermal) {
        ctx.save();
        ctx.globalCompositeOperation = 'difference';
        ctx.fillStyle = 'rgba(255,45,0,0.22)';
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'color-dodge';
        ctx.fillStyle = 'rgba(0,95,250,0.35)';
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 15 }}
    />
  );
};

export default PostProcessLayer;
