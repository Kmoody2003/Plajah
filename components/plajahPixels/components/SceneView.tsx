// SceneView — renders ONE Pixels SceneSnapshot live via the GL compositor. The
// reusable bridge that lets the Pixels render engine run inside OTHER surfaces
// (Fabula's monitor, previews, …) without dragging in the whole studio. Generators
// render on the GPU with an injected time; media/color layers composite alongside.
//
// Shader/milkdrop layers are skipped here (same as the offline renderer's first
// pass). Audio reactivity is live when an analyser is provided, else time-animated.

import React, { useEffect, useRef } from 'react';
import { Compositor, LayerInput } from '../engine/core/compositor';
import { GeneratorRenderer, hasGenerator, hexToRgb } from '../engine/core/generators';
import { ShaderRenderer } from '../engine/core/shaderRenderer';
import { AudioTexture } from '../engine/core/audioTexture';
import { getTextCanvas } from '../engine/core/textLayer';
import type { SceneSnapshot } from '../engine/timeline/sceneTimeline';

interface Props {
  snapshot: SceneSnapshot;
  analyser?: AnalyserNode | null;
  palette?: string[];
  playing?: boolean;
  /** Local scene time in seconds. If set, generators follow it (so scrubbing shows
   *  the right frame); otherwise they free-run off a real-time clock. */
  time?: number;
  className?: string;
  style?: React.CSSProperties;
}

const MAX_H = 1080;

const SceneView: React.FC<Props> = ({ snapshot, analyser, palette, playing, time, className, style }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const compRef = useRef<Compositor | null>(null);
  const genRef = useRef<GeneratorRenderer | null>(null);
  const shaderRef = useRef<ShaderRenderer | null>(null);
  const audioTexRef = useRef<AudioTexture | null>(null);
  const startRef = useRef(0);
  const pool = useRef<Map<string, HTMLVideoElement | HTMLImageElement>>(new Map());

  const snapRef = useRef(snapshot);   snapRef.current = snapshot;
  const analyserRef = useRef(analyser); analyserRef.current = analyser ?? null;
  const paletteRef = useRef(palette); paletteRef.current = palette;
  const playingRef = useRef(playing); playingRef.current = playing;
  const timeRef = useRef(time);       timeRef.current = time;

  const warm = (url: string, type: 'video' | 'image' | undefined): HTMLVideoElement | HTMLImageElement => {
    let el = pool.current.get(url);
    if (!el) {
      if (type === 'image') { const i = new Image(); i.crossOrigin = 'anonymous'; i.src = url; el = i; }
      else { const v = document.createElement('video'); v.crossOrigin = 'anonymous'; v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto'; v.src = url; v.load(); el = v; }
      pool.current.set(url, el);
    }
    return el;
  };

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    try {
      compRef.current = new Compositor(canvas);
      genRef.current = new GeneratorRenderer(compRef.current.gl);
      shaderRef.current = new ShaderRenderer(compRef.current.gl);
      audioTexRef.current = new AudioTexture(compRef.current.gl);
      startRef.current = performance.now();
    } catch (e) { console.warn('[SceneView] GL init failed:', e); return; }

    let raf = 0;
    const tick = () => {
      const comp = compRef.current, gen = genRef.current, audioTex = audioTexRef.current;
      if (comp && gen && audioTex) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        let w = Math.max(1, Math.round(canvas.clientWidth * dpr));
        let h = Math.max(1, Math.round(canvas.clientHeight * dpr));
        if (h > MAX_H) { w = Math.round(w * (MAX_H / h)); h = MAX_H; }
        comp.resize(w, h);

        audioTex.update(analyserRef.current);
        const t = typeof timeRef.current === 'number' ? timeRef.current : (performance.now() - startRef.current) / 1000;
        const colors = (paletteRef.current || []).slice(0, 3).map(hexToRgb);

        const inputs: LayerInput[] = [];
        const active = new Set<string>();
        for (const layer of snapRef.current.layers || []) {
          const clip = layer.clip;
          const opacity = Math.max(0, Math.min(1, (layer.opacity ?? 1) * (clip.opacity ?? 1)));
          if (clip.type === 'generator' && clip.sceneMode && hasGenerator(clip.sceneMode)) {
            const tex = gen.render(layer.id, clip.sceneMode, w, h, { time: t, audio: audioTex, colors, params: clip.params || [] });
            inputs.push({ texture: tex, opacity, blendMode: layer.blendMode });
          } else if (clip.type === 'media' && clip.mediaUrl) {
            active.add(clip.mediaUrl);
            const el = warm(clip.mediaUrl, clip.mediaType);
            if (el instanceof HTMLVideoElement) {
              if (playingRef.current && el.paused) el.play().catch(() => {});
              else if (!playingRef.current && !el.paused) el.pause();
            }
            inputs.push({ element: el, opacity, blendMode: layer.blendMode });
          } else if (clip.type === 'color' && clip.fillColor) {
            inputs.push({ element: colorCanvas(clip.fillColor), opacity, blendMode: layer.blendMode });
          } else if (clip.type === 'text' && clip.text) {
            inputs.push({ element: getTextCanvas(clip.text, clip.fillColor), opacity, blendMode: layer.blendMode });
          } else if (clip.type === 'shader' && clip.shaderSrc && shaderRef.current) {
            const tex = shaderRef.current.render(layer.id, clip.shaderSrc, w, h, { time: t, audio: audioTex, params: clip.params || [] });
            inputs.push({ texture: tex, opacity, blendMode: layer.blendMode });
          }
          // milkdrop (butterchurn) skipped — not frame-deterministic; use a shader/generator clip for export
        }
        // pause any pooled video not on-screen this frame
        pool.current.forEach((el, url) => { if (el instanceof HTMLVideoElement && !el.paused && !active.has(url)) el.pause(); });

        comp.render(inputs);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      genRef.current?.dispose(); genRef.current = null;
      shaderRef.current?.dispose(); shaderRef.current = null;
      audioTexRef.current?.dispose(); audioTexRef.current = null;
      compRef.current?.dispose(); compRef.current = null;
      pool.current.forEach(el => { if (el instanceof HTMLVideoElement) { try { el.pause(); el.removeAttribute('src'); el.load(); } catch { /* */ } } });
      pool.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvasRef} className={className} style={{ display: 'block', width: '100%', height: '100%', ...style }} />;
};

const _colorCanvases = new Map<string, HTMLCanvasElement>();
function colorCanvas(hex: string): HTMLCanvasElement {
  let c = _colorCanvases.get(hex);
  if (!c) { c = document.createElement('canvas'); c.width = 4; c.height = 4; const x = c.getContext('2d')!; x.fillStyle = hex; x.fillRect(0, 0, 4, 4); _colorCanvases.set(hex, c); }
  return c;
}

export default SceneView;
