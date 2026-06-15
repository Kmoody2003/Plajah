// components/StudioStage.tsx — renders the active STUDIO scene (Canvas2D or
// WebGL) in the same slot as the original AudioVisualizer. It shares the app's
// existing AnalyserNode (no second audio source) and bridges the app's rich
// VisualizationConfig into the engine's VizParams — so the Color Palette
// editor, sensitivity, glow, speed, and blend mode all drive these scenes too.

import React, { useEffect, useRef } from 'react';
import { VisualizationConfig, MODE_TO_STUDIO_SCENE } from '../types';
import { VizParams, AudioBands, defaultParams } from '../engine/params';
import { CANVAS_PRESETS, DrawCtx, CanvasPreset } from '../engine/presets/canvasPresets';
import { GLRenderer, GL_PRESETS } from '../engine/webgl/glRenderer';
import { analyzeBands, createBeatState, BeatState } from '../engine/analysis';

interface Props {
  analyser: AnalyserNode | null;
  config: VisualizationConfig;
  isPlaying: boolean;
  id?: string;
}

function padPalette(p: string[]): string[] {
  const out = (p && p.length ? [...p] : ['#b56cff', '#ff5db1', '#5ad7ff', '#ffffff']);
  while (out.length < 4) out.push(out[out.length - 1]);
  return out;
}

const StudioStage: React.FC<Props> = ({ analyser, config, isPlaying, id }) => {
  const glRef = useRef<HTMLCanvasElement>(null);
  const vizRef = useRef<HTMLCanvasElement>(null);
  // live refs so the rAF loop sees fresh props without re-subscribing
  const cfgRef = useRef(config); cfgRef.current = config;
  const playRef = useRef(isPlaying); playRef.current = isPlaying;
  const analyserRef = useRef(analyser); analyserRef.current = analyser;

  useEffect(() => {
    const glCanvas = glRef.current!, vizCanvas = vizRef.current!;
    const ctx = vizCanvas.getContext('2d')!;
    const gl = new GLRenderer(glCanvas);
    const beat: BeatState = createBeatState();
    const data = new Uint8Array(2048);
    let pstate: Record<string, any> = {};
    let curSceneId = '';
    let W = 0, H = 0; const DPR = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      const host = vizCanvas.parentElement!;
      const r = host.getBoundingClientRect();
      W = r.width; H = r.height;
      [glCanvas, vizCanvas].forEach(c => { c.width = W * DPR; c.height = H * DPR; });
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      gl.resize();
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(vizCanvas.parentElement!);

    function bridge(cfg: VisualizationConfig): VizParams {
      return {
        ...defaultParams,
        sens: cfg.sensitivity,
        smooth: cfg.smoothingTimeConstant,
        bassFocus: 1.0,
        speed: cfg.speed,
        glow: Math.max(0, Math.min(2, cfg.glowIntensity / 15)),
        trail: cfg.studioTrail ?? 0.5,
        flash: cfg.studioFlash ?? true,
        mirror: !!cfg.studioMirror,
      };
    }
    function scaled(b: AudioBands, P: VizParams): AudioBands {
      return {
        bass: Math.min(1.4, b.bass * P.sens * P.bassFocus),
        mid: Math.min(1.4, b.mid * P.sens),
        treble: Math.min(1.4, b.treble * P.sens),
        level: Math.min(1.4, b.level * P.sens),
        beat: b.beat,
      };
    }

    let raf = 0;
    function loop(now: number) {
      const cfg = cfgRef.current;
      const sceneId = MODE_TO_STUDIO_SCENE[cfg.mode] || 'aurora';
      const canvasPreset: CanvasPreset | undefined = CANVAS_PRESETS.find(p => p.id === sceneId);
      const glPreset = GL_PRESETS.find(p => p.id === sceneId);

      // (re)init canvas preset state on scene change
      if (sceneId !== curSceneId) {
        curSceneId = sceneId; pstate = {};
        glCanvas.style.opacity = glPreset ? '1' : '0';
        vizCanvas.style.opacity = glPreset ? '0' : '1';
      }

      const a = analyserRef.current;
      const P = bridge(cfg);
      const pal = padPalette(cfg.colorPalette);
      let A: AudioBands = { bass: 0, mid: 0, treble: 0, level: 0, beat: 0 };
      if (a) {
        if (a.fftSize !== cfg.fftSize) { try { a.fftSize = cfg.fftSize; } catch { /* */ } }
        A = scaled(analyzeBands(a, data, P.smooth, beat), P);
      }

      if (glPreset) {
        gl.draw(glPreset.gl, now, A, P, pal);
      } else if (canvasPreset) {
        if (!pstate.__init) {
          const initCtx: DrawCtx = { g: ctx, W, H, t: now, A, P, pal, state: pstate };
          canvasPreset.init?.(pstate, initCtx);
          pstate.__init = true;
        }
        const dctx: DrawCtx = { g: ctx, W, H, t: now, A, P, pal, state: pstate };
        canvasPreset.draw(dctx);
        if (P.flash && A.beat > 0.4) {
          const n = parseInt(pal[1].slice(1), 16);
          ctx.fillStyle = `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${A.beat * 0.06})`;
          ctx.fillRect(0, 0, W, H);
        }
      }
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  // blend with the dual-layer backgrounds exactly like the original visualizer
  const blend = { mixBlendMode: config.blendMode as any };
  return (
    <div id={id} style={{ position: 'absolute', inset: 0 }}>
      <canvas ref={glRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', ...blend }} />
      <canvas ref={vizRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', ...blend }} />
    </div>
  );
};

export default StudioStage;
