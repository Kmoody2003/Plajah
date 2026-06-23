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
import { ensureProxy } from '../engine/core/proxyCache';
import { AudioDriverSampler } from '../engine/audioDrivers';
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
  /** Overlay layers (text/lighting/3D/matte/…) to composite ON TOP of the clip
   *  stack. Rendered hidden; their canvases are uploaded as top layers each frame.
   *  When set, the single GL canvas becomes the FULL output. */
  overlays?: React.ReactNode;
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

// The stage "Mirror slicing" surface (BackgroundLayer) renders its sliced/mirrored
// RESULT to an output <canvas>, while its raw source <video>/<img> sit hidden in the
// same wrapper. pickSource() would return that raw media first and bypass slicing
// entirely — so for this surface we grab the output canvas specifically.
function pickSliceCanvas(w: HTMLElement | null | undefined): HTMLCanvasElement | null {
  if (!w) return null;
  const canvases = Array.from(w.querySelectorAll('canvas')) as HTMLCanvasElement[];
  return canvases.find(c => c.width > 0 && c.height > 0) ?? null;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const GLCompositorView: React.FC<Props> = ({ layers, analyser, config, isPlaying, bgSlice, gpuGenerators, onCanvas, overlays }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayHostRef = useRef<HTMLDivElement>(null);
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
  // Global camera shake — drives a CSS transform on the whole composite from the
  // drum/intensity signal (track energy = baseline throb, snare = sharp kick,
  // density = sustained shake during fills/rolls). Cheap (GPU-composited transform).
  const shakeSamplerRef = useRef<AudioDriverSampler | null>(null);
  const shakeAmpRef = useRef(0);
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

  // ── Pre-warmed media pool (Phase 4) ──────────────────────────────────────
  // Every launcher media clip gets a persistent, always-decoded element so firing
  // it is an instant texture swap, not a fresh decode. crossOrigin='anonymous' is
  // REQUIRED for the GL compositor to texture remote media (without it, cross-origin
  // video/images taint the canvas and upload as black). Capped + LRU-evicted.
  const mediaPool = useRef<Map<string, HTMLVideoElement | HTMLImageElement>>(new Map());
  const proxyMap = useRef<Map<string, string>>(new Map());      // originalUrl → ready proxy object-URL
  const pendingSwap = useRef<Map<string, string>>(new Map());   // proxy ready but clip mid-play → swap on next pause
  const POOL_CAP = 24;

  const makePooledVideo = (src: string): HTMLVideoElement => {
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous';
    v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
    v.src = src;
    v.load(); // decode-ready but PAUSED; the active clip is played in the loop
    return v;
  };

  // Rebuild a pooled video from its finished proxy — but only when the clip is
  // PAUSED (idle) so the swap is invisible. If it's mid-play, defer to next pause.
  const applyProxy = (url: string, proxyUrl: string) => {
    const pool = mediaPool.current;
    const cur = pool.get(url);
    if (!(cur instanceof HTMLVideoElement) || cur.src === proxyUrl) return;
    if (!cur.paused) { pendingSwap.current.set(url, proxyUrl); return; }
    pool.set(url, makePooledVideo(proxyUrl));
    try { cur.pause(); cur.removeAttribute('src'); cur.load(); } catch { /* */ }
  };

  const getWarmMedia = (url: string, type: 'video' | 'image' | undefined): HTMLVideoElement | HTMLImageElement => {
    const pool = mediaPool.current;
    let el = pool.get(url);
    if (!el) {
      if (type === 'image') {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        (img as any).decoding = 'async';
        img.src = url;
        el = img;
      } else {
        // Prefer a ready proxy; else play the original now and kick off a background
        // transcode that hot-swaps this entry once the playback-optimized proxy lands.
        const ready = proxyMap.current.get(url);
        el = makePooledVideo(ready ?? url);
        if (!ready) ensureProxy(url, (proxyUrl) => { proxyMap.current.set(url, proxyUrl); applyProxy(url, proxyUrl); });
      }
      pool.set(url, el);
      if (pool.size > POOL_CAP) {
        const oldestKey = pool.keys().next().value as string | undefined;
        if (oldestKey && oldestKey !== url) {
          const old = pool.get(oldestKey);
          if (old instanceof HTMLVideoElement) { try { old.pause(); old.removeAttribute('src'); old.load(); } catch { /* */ } }
          pool.delete(oldestKey);
        }
      }
    } else {
      // keep recently-used at the back (LRU) so the eviction picks truly-stale ones
      pool.delete(url); pool.set(url, el);
    }
    return el;
  };

  // Pre-warm ALL launcher media on any change, so every clip is decode-ready
  // before it's fired (instant, beat-tight switching for video).
  useEffect(() => {
    for (const layer of layers) {
      for (const clip of layer.clips) {
        if (clip && clip.type === 'media' && clip.mediaUrl) getWarmMedia(clip.mediaUrl, clip.mediaType);
      }
    }
  }, [layers]);

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
      mediaPool.current.forEach(el => { if (el instanceof HTMLVideoElement) { try { el.pause(); el.removeAttribute('src'); el.load(); } catch { /* */ } } });
      mediaPool.current.clear();
      // proxy object-URLs are owned/memoized by proxyCache (persist across remounts), so just drop the local mirrors
      proxyMap.current.clear(); pendingSwap.current.clear();
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
        const activeMedia = new Set<string>(); // media URLs on-screen this frame
        // Bottom: stage slicing surface.
        if (bgSliceRef.current) {
          const el = pickSliceCanvas(bgWrapRef.current); // the SLICED output canvas, not the raw source media
          // CSS opacity on the canvas is lost when sampled as a texture → pass it as layer opacity.
          if (el) inputs.push({ element: el, opacity: clamp01(configRef.current.backgroundOpacity ?? 1), blendMode: 'normal' });
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
          else if (clip.type === 'media' && clip.mediaUrl) {
            activeMedia.add(clip.mediaUrl);
            const m = getWarmMedia(clip.mediaUrl, clip.mediaType); // pre-warmed pool → instant
            if (m instanceof HTMLVideoElement && m.paused) m.play().catch(() => {});
            element = m;
          }
          else element = pickSource(wrapRefs.current.get(layer.id));
          if (element) inputs.push({ element, opacity, blendMode: layer.blendMode || 'normal' });
        }
        // Pause off-screen pooled videos so only on-screen clips actually decode —
        // keeps the pool warm without overwhelming the hardware decoders.
        mediaPool.current.forEach((el, url) => {
          if (el instanceof HTMLVideoElement && !el.paused && !activeMedia.has(url)) {
            el.pause();
            // Clip just went idle — a good moment to apply a deferred proxy swap.
            const pending = pendingSwap.current.get(url);
            if (pending) { pendingSwap.current.delete(url); applyProxy(url, pending); }
          }
        });
        // Overlay layers (unify mode): upload each overlay canvas as a top layer,
        // in DOM order (viz below fg), source-over like the CSS planes they replace.
        const host = overlayHostRef.current;
        if (host) {
          host.querySelectorAll('canvas').forEach(cv => {
            const c = cv as HTMLCanvasElement;
            if (c.width > 0 && c.height > 0) inputs.push({ element: c, opacity: 1, blendMode: 'normal' });
          });
        }
        const cfg = configRef.current;
        comp.render(inputs, {
          brightness: cfg.gradeBrightness ?? 1,
          contrast: cfg.gradeContrast ?? 1,
          saturation: cfg.gradeSaturation ?? 1,
          gamma: cfg.gradeGamma ?? 1,
        });

        // ── Global camera shake ────────────────────────────────────────────
        const canvas = canvasRef.current;
        if (canvas) {
          const an = analyserRef.current;
          if (cfg.enableBassShake && an) {
            const s = (shakeSamplerRef.current ??= new AudioDriverSampler());
            const now = performance.now();
            s.update(an, now);
            // Continuous target from track intensity + drum-roll density; snare/kick add impulses.
            const target = s.intensity * 0.4 + s.density * 0.55;
            shakeAmpRef.current = Math.max(shakeAmpRef.current * 0.82, target); // hold-to-peak, decay
            if (s.isSnare) shakeAmpRef.current = Math.min(1.6, shakeAmpRef.current + 0.9); // snare = sharp kick
            if (s.isKick)  shakeAmpRef.current = Math.min(1.6, shakeAmpRef.current + 0.4); // kick = thump
            const amp = shakeAmpRef.current * (cfg.bassShakeIntensity ?? 1);
            if (amp > 0.01) {
              const mag = amp * 14; // px
              const dx = (Math.random() - 0.5) * mag;
              const dy = (Math.random() - 0.5) * mag;
              const rot = (Math.random() - 0.5) * amp * 0.7; // slight roll for a real "camera" feel
              const scale = 1 + amp * 0.03; // overscan so the translate/rotate never reveals black edges
              canvas.style.transform = `translate(${dx.toFixed(2)}px,${dy.toFixed(2)}px) rotate(${rot.toFixed(3)}deg) scale(${scale.toFixed(4)})`;
            } else if (canvas.style.transform) {
              canvas.style.transform = '';
            }
          } else if (canvas.style.transform) {
            shakeAmpRef.current = 0;
            canvas.style.transform = '';
          }
        }
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
    if (!clip || clip.type === 'empty' || clip.type === 'color' || clip.type === 'media') return null; // media → pre-warmed pool, no wrapper
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
        {overlays /* unify mode: render overlays as visible DOM since there's no GL canvas */}
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
            {/* Key on clip identity so swapping a clip/mode REMOUNTS a fresh source
                (otherwise some generators keep showing their last frame on swap). */}
            <LayerSource
              key={`${clip.type}:${clip.sceneMode ?? clip.shaderSrc?.slice(0, 24) ?? clip.mediaUrl ?? clip.milkdropIdx ?? clip.fillColor}`}
              clip={clip} analyser={analyser} config={config} isPlaying={isPlaying} />
          </div>
        ))}
        {/* Overlay layers (unify mode) — rendered hidden; their canvases are
            uploaded as top compositor layers each frame. */}
        {overlays && <div ref={overlayHostRef} style={{ position: 'absolute', inset: 0 }}>{overlays}</div>}
      </div>
      {/* The single composited surface. */}
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 1, display: 'block', willChange: 'transform', transformOrigin: 'center center' }} />
    </div>
  );
};

export default GLCompositorView;
