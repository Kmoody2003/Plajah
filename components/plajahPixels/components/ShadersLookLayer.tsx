// ShadersLookLayer — renders a ShaderLook (services/shaders/shaderLooks.ts) with the open-source WebGPU
// `shaders` library, driven per-frame by Plajah's own AudioDriverSampler (same drivers as the automation
// matrix: intensity / mid / beat / kick / snare / density).
//
// Additive by design: nothing here touches ClipLauncher / LayerStack / the GL compositor. It is a
// self-contained canvas host, exactly like ChoraTypoVisualizer, so FX Stage / Pixels / Tela can mount it.
//
// Always falls back to `look.fallbackCss` when WebGPU is missing, the platform is a TV, or the library
// reports itself unavailable — a decorative layer must never break the surface it decorates.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AudioDriverSampler } from '../engine/audioDrivers';
import { SHADERS_PROPS, probeShaderGpu, loadShadersReact } from '../../../services/shaders/shaderGate';
import type { AudioFeature, ShaderLook, ShaderNode } from '../../../services/shaders/shaderLooks';

export type AudioFeatures = Record<AudioFeature, number>;

interface Props {
  look: ShaderLook;
  /** Resolved URL for the '$cover' token (an object URL / data URL the host controls). */
  coverUrl?: string;
  analyser: AnalyserNode | null;
  isPlaying: boolean;
  /** Override the audio source (proof pages / Tela embeds with no player). */
  getFeatures?: () => AudioFeatures;
  className?: string;
  style?: React.CSSProperties;
  /** What to draw while loading / when WebGPU is unavailable: the look's gradient (a stage) or nothing (an overlay on art). */
  fallback?: 'gradient' | 'none';
  /** Max prop-update rate. Props flow through React, so this bounds re-render cost. */
  fps?: number;
  onStatus?: (s: 'loading' | 'running' | 'fallback', why?: string) => void;
}

const ZERO: AudioFeatures = { intensity: 0, mid: 0, beat: 0, kick: 0, snare: 0, density: 0 };

const ShadersLookLayer: React.FC<Props> = ({ look, coverUrl, analyser, isPlaying, getFeatures, className, style, fps = 30, onStatus, fallback: fallbackMode = 'gradient' }) => {
  const [mod, setMod] = useState<any>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const [vals, setVals] = useState<Record<string, number>>({});
  const sampler = useRef(new AudioDriverSampler());
  const env = useRef<AudioFeatures>({ ...ZERO });
  const statusRef = useRef(onStatus); statusRef.current = onStatus;

  // Gate + lazy-load the library.
  useEffect(() => {
    let dead = false;
    statusRef.current?.('loading');
    (async () => {
      const gpu = await probeShaderGpu();
      if (dead) return;
      if (gpu.reason !== 'ok') { setFallback(gpu.reason); statusRef.current?.('fallback', gpu.reason); return; }
      try {
        const m = await loadShadersReact();
        if (!dead) { setMod(m); statusRef.current?.('running'); }
      } catch (e) {
        if (!dead) { setFallback('load-failed'); statusRef.current?.('fallback', 'load-failed'); }
      }
    })();
    return () => { dead = true; };
  }, []);

  // Collect every driven prop once per look.
  const drives = useMemo(() => {
    const out: { key: string; from: AudioFeature; min: number; max: number; smooth: number }[] = [];
    const walk = (nodes: ShaderNode[], path: string) => nodes.forEach((n, i) => {
      const p = `${path}/${i}`;
      (n.drive ?? []).forEach(d => out.push({ key: `${p}:${d.prop}`, from: d.from, min: d.min, max: d.max, smooth: d.smooth ?? 0.35 }));
      if (n.children) walk(n.children, p);
    });
    walk(look.root, '');
    return out;
  }, [look]);

  // Audio → prop values.
  useEffect(() => {
    if (!mod || !drives.length) return;
    let raf = 0, last = 0;
    const cur: Record<string, number> = {};
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - last < 1000 / fps) return;
      last = t;
      let f: AudioFeatures;
      if (getFeatures) f = getFeatures();
      else if (analyser && isPlaying) {
        const s = sampler.current; s.update(analyser, t);
        const e = env.current;
        // Transients are single-frame booleans — give them a short decay so a prop can swell and settle.
        e.beat = Math.max(e.beat * 0.86, s.isBeat ? 1 : 0);
        e.kick = Math.max(e.kick * 0.86, s.isKick ? 1 : 0);
        e.snare = Math.max(e.snare * 0.86, s.isSnare ? 1 : 0);
        e.intensity = s.intensity; e.mid = s.midIntensity; e.density = s.density;
        f = e;
      } else f = ZERO;
      const next: Record<string, number> = {};
      for (const d of drives) {
        const target = d.min + (d.max - d.min) * Math.min(1, Math.max(0, f[d.from]));
        const prev = cur[d.key] ?? d.min;
        next[d.key] = cur[d.key] = prev + (target - prev) * d.smooth;
      }
      setVals(next);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mod, drives, analyser, isPlaying, getFeatures, fps]);

  const renderNode = (n: ShaderNode, path: string): React.ReactNode => {
    const C = mod?.[n.type];
    if (!C) return null; // unknown component name → skipped, never thrown (council output is validated, but be safe)
    // '$cover' is the only host token a look can carry; it never resolves to anything the host did not hand us.
    const base: Record<string, unknown> = { ...(n.props ?? {}) };
    for (const k of Object.keys(base)) if (base[k] === '$cover') { if (coverUrl) base[k] = coverUrl; else delete base[k]; }
    if (n.type === 'ImageTexture' && !base.url) return null; // no cover → skip rather than let the library fall back to its sample image URL
    const driven: Record<string, number> = {};
    (n.drive ?? []).forEach(d => { const v = vals[`${path}:${d.prop}`]; if (v !== undefined) driven[d.prop] = v; });
    return (
      <C key={path} {...base} {...driven}>
        {n.children?.map((c, i) => renderNode(c, `${path}/${i}`))}
      </C>
    );
  };

  if (fallback || !mod) {
    if (fallbackMode === 'none') return null;
    return <div className={className} style={{ ...style, background: look.fallbackCss }} data-shaders-status={fallback ? `fallback:${fallback}` : 'loading'} />;
  }
  const Shader = mod.Shader;
  return (
    <Shader
      {...SHADERS_PROPS}
      className={className}
      style={{ width: '100%', height: '100%', ...style }}
      onUnavailable={(reason: string) => { setFallback(reason); statusRef.current?.('fallback', reason); }}
    >
      {look.root.map((n, i) => renderNode(n, `/${i}`))}
    </Shader>
  );
};

export default ShadersLookLayer;
