// GLCompositorView — the wrap-first bridge to the single-surface GPU compositor.
//
// Replaces the old LayerStack DOM mix-blend-mode stack. Every active launcher
// layer still renders to its OWN element (video / image / generator canvas /
// shader canvas / milkdrop canvas) — but those elements are mounted hidden,
// uploaded to GPU textures each frame, and composited by the WebGL2 Compositor
// into ONE canvas presented in a single vsync-locked draw. That alone removes the
// per-layer CSS compositing + the multi-present tearing, applies blend modes +
// opacity on the GPU, and gives us one recordable surface — all WITHOUT porting a
// single generator. Generators get ported to native GLSL passes incrementally
// (replacing element-upload with a ready texture) behind this same interface.
//
// Resolution is capped to a 1080p-class target (per the approved plan). If WebGL2
// is unavailable, we fall back to the original DOM LayerStack so nothing breaks.

import React, { useEffect, useRef, useState, useMemo } from 'react';
import LayerStack, { LayerSource } from './LayerStack';
import BackgroundLayer from './BackgroundLayer';
import { Compositor, LayerInput } from '../engine/core/compositor';
import { AudioTexture } from '../engine/core/audioTexture';
import { GeneratorRenderer, hasGenerator, hexToRgb } from '../engine/core/generators';
import { VisualizationConfig, BackgroundMedia } from '../types';
import type { LauncherLayer } from './ClipLauncher';

interface Props {
  layers: LauncherLayer[];
  analyser: AnalyserNode | null;
  config: VisualizationConfig;
  isPlaying: boolean;
  /** When set, the stage "Mirror slicing" surface (BackgroundLayer) is composited
   *  as the bottom layer. */
  bgSlice?: { mediaList1: BackgroundMedia[]; mediaList2: BackgroundMedia[] } | null;
  /** Opt-in: render supported generators natively on the GPU (no Canvas2D). */
  gpuGenerators?: boolean;
  /** Hands the live composite canvas up so the recorder can captureStream it
   *  (hardware, drop-free) instead of screen-capturing the tab. */
  onCanvas?: (canvas: HTMLCanvasElement | null) => void;
}

const MAX_HEIGHT = 1080; // internal render-target cap (aspect preserved)

const HIDDEN_SRC: React.CSSProperties = { position: 'absolute', inset: 0, zIndex: 0 };

// Pick the renderable element inside a layer wrapper: a media element if present,
// else the visible canvas (generators like StudioStage keep two canvases and hide
// one), else any non-zero canvas.
function pickSource(w: HTMLElement | null | undefined): HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | null {
  if (!w) return null;
  const media = w.querySelector('video, img') as HTMLVideoElement | HTMLImageElement | null;
  if (media) return media;
  const canvases = Array.from(w.querySelectorAll('canvas')) as HTMLCanvasElement[];
  if (!canvases.length) return null;
  const visible = canvases.find(c => c.width > 0 && c.height > 0
    && getComputedStyle(c).visibility !== 'hidden' && getComputedStyle(c).display !== 'none');
  return visible ?? canvases.find(c => c.width > 0 && c.height > 0) ?? canvases[0];
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const GLCompositorView: React.FC<Props> = ({ layers, analyser, config, isPlaying, bgSlice, gpuGenerators, onCanvas }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const compRef = useRef<Compositor | null>(null);
  const genRef = useRef<GeneratorRenderer | null>(null);
  const audioTexRef = useRef<AudioTexture | null>(null);
  const startRef = useRef<number>(0);
  const [failed, setFailed] = useState(false);

  // GPU generators only kick in for modes with a GLSL port AND the opt-in flag.
  const useGpuGen = (clip: NonNullable<LauncherLayer['clips'][number]>) =>
    !!gpuGenerators && clip.type === 'generator' && hasGenerator(clip.sceneMode);

  // Live refs read inside the rAF loop so it never restarts on a fire.
  const layersRef = useRef(layers);    layersRef.current = layers;
  const bgSliceRef = useRef(bgSlice);  bgSliceRef.current = bgSlice;
  const analyserRef = useRef(analyser); analyserRef.current = analyser;
  const configRef = useRef(config);    configRef.current = config;
  const gpuGenRef = useRef(gpuGenerators); gpuGenRef.current = gpuGenerators;

  // layerId → hidden wrapper element; + per-color-layer scratch canvas.
  const wrapRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const bgWrapRef = useRef<HTMLDivElement | null>(null);
  const colorCanvases = useRef<Map<string, HTMLCanvasElement>>(new Map());

  const setWrap = (id: string) => (el: HTMLDivElement | null) => {
    if (el) wrapRefs.current.set(id, el); else wrapRefs.current.delete(id);
  };
  const colorCanvasFor = (id: string, color: string): HTMLCanvasElement => {
    let c = colorCanvases.current.get(id);
    if (!c) { c = document.createElement('canvas'); c.width = c.height = 16; colorCanvases.current.set(id, c); }
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = color || '#000'; ctx.fillRect(0, 0, 16, 16);
    return c;
  };

  // Init the compositor once. Fall back to the DOM stack if WebGL2 is missing.
  useEffect(() => {
    if (!canvasRef.current) return;
    try {
      const comp = new Compositor(canvasRef.current);
      compRef.current = comp;
      genRef.current = new GeneratorRenderer(comp.gl);
      audioTexRef.current = new AudioTexture(comp.gl);
      startRef.current = performance.now();
      onCanvas?.(canvasRef.current);
    } catch (e) {
      console.warn('[PixelsCore] compositor init failed, falling back to DOM stack:', e);
      setFailed(true);
      return;
    }
    return () => {
      onCanvas?.(null);
      genRef.current?.dispose(); genRef.current = null;
      audioTexRef.current?.dispose(); audioTexRef.current = null;
      compRef.current?.dispose(); compRef.current = null;
    };
  }, []);

  // The single render loop.
  useEffect(() => {
    if (failed) return;
    let raf = 0;
    const tick = () => {
      const comp = compRef.current;
      const container = containerRef.current;
      if (comp && container) {
        // Size the target (1080p cap, aspect preserved).
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        let w = Math.max(1, Math.round(container.clientWidth * dpr));
        let h = Math.max(1, Math.round(container.clientHeight * dpr));
        if (h > MAX_HEIGHT) { w = Math.round(w * (MAX_HEIGHT / h)); h = MAX_HEIGHT; }
        comp.resize(w, h);

        // Upload audio once per frame for any GPU generators this frame.
        const gen = genRef.current, audioTex = audioTexRef.current;
        const genActive = !!gpuGenRef.current && gen && audioTex;
        if (genActive) audioTex!.update(analyserRef.current);
        const palette = (configRef.current.colorPalette || []).slice(0, 3).map(hexToRgb);
        const time = (performance.now() - startRef.current) / 1000;

        const inputs: LayerInput[] = [];
        // Bottom: stage slicing surface.
        if (bgSliceRef.current) {
          const el = pickSource(bgWrapRef.current);
          if (el) inputs.push({ element: el, opacity: 1, blendMode: 'normal' });
        }
        // Launcher layers, bottom (index 0) → top.
        const ls = layersRef.current;
        for (let i = 0; i < ls.length; i++) {
          const layer = ls[i];
          if (layer.bypassed || layer.muted || layer.activeCol == null) continue;
          const clip = layer.clips[layer.activeCol];
          if (!clip || clip.type === 'empty') continue;
          if (clip.type === 'generator' && clip.sceneMode?.startsWith('__fx_')) continue;
          const opacity = clamp01((layer.opacity ?? 1) * (clip.opacity ?? 1));
          // Native GPU generator → render straight into a texture (no Canvas2D).
          if (genActive && clip.type === 'generator' && hasGenerator(clip.sceneMode)) {
            const tex = gen!.render(layer.id, clip.sceneMode!, w, h, {
              time, audio: audioTex!, colors: palette, params: clip.params || [],
            });
            inputs.push({ texture: tex, opacity, blendMode: layer.blendMode || 'normal' });
            continue;
          }
          let element: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | null = null;
          if (clip.type === 'color') element = colorCanvasFor(layer.id, clip.fillColor || '#000');
          else element = pickSource(wrapRefs.current.get(layer.id));
          if (element) inputs.push({ element, opacity, blendMode: layer.blendMode || 'normal' });
        }
        const cfg = configRef.current;
        comp.render(inputs, {
          brightness: cfg.gradeBrightness ?? 1,
          contrast: cfg.gradeContrast ?? 1,
          saturation: cfg.gradeSaturation ?? 1,
          gamma: cfg.gradeGamma ?? 1,
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [failed]);

  // Which layers need a hidden source wrapper (everything except color/fx/empty).
  const sourced = useMemo(() => layers.map((layer) => {
    if (layer.bypassed || layer.muted || layer.activeCol == null) return null;
    const clip = layer.clips[layer.activeCol];
    if (!clip || clip.type === 'empty' || clip.type === 'color') return null;
    if (clip.type === 'generator' && clip.sceneMode?.startsWith('__fx_')) return null;
    if (useGpuGen(clip)) return null; // rendered natively on the GPU — no Canvas2D needed
    return { layer, clip };
  }).filter(Boolean) as { layer: LauncherLayer; clip: NonNullable<LauncherLayer['clips'][number]> }[], [layers, gpuGenerators]);

  // Fallback: the original DOM composite (only if WebGL2 init failed).
  if (failed) {
    return (
      <div className="absolute inset-0">
        {bgSlice && <BackgroundLayer mediaList1={bgSlice.mediaList1} mediaList2={bgSlice.mediaList2} config={config} analyser={analyser} isPlaying={isPlaying} id="px-bg-slice" />}
        <LayerStack layers={layers} analyser={analyser} config={config} isPlaying={isPlaying} />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="absolute inset-0" style={{ overflow: 'hidden' }}>
      {/* Hidden layer sources — render to their own elements, covered by the GL
          canvas. Sampled into textures each frame; never shown directly. */}
      <div aria-hidden style={HIDDEN_SRC}>
        {bgSlice && (
          <div ref={bgWrapRef} style={{ position: 'absolute', inset: 0 }}>
            <BackgroundLayer mediaList1={bgSlice.mediaList1} mediaList2={bgSlice.mediaList2} config={config} analyser={analyser} isPlaying={isPlaying} id="px-bg-slice" />
          </div>
        )}
        {sourced.map(({ layer, clip }) => (
          <div key={layer.id} ref={setWrap(layer.id)} style={{ position: 'absolute', inset: 0 }}>
            <LayerSource clip={clip} analyser={analyser} config={config} isPlaying={isPlaying} />
          </div>
        ))}
      </div>
      {/* The single composited surface. */}
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 1, display: 'block' }} />
    </div>
  );
};

export default GLCompositorView;
