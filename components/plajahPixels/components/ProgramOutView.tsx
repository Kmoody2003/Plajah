// ProgramOutView — the windowed CLONE of the program output for an external
// display / video wall. It runs in a SEPARATE browser window (opened with
// ?programOut=1) and mirrors the main window's composite:
//
//   • LayerStack (the real composite) + the explicit global override modes
//     (shader / Milkdrop / MIDI / 3D) — exactly what the operator sees.
//   • State (config, layers, the override flags, isPlaying) arrives live over a
//     BroadcastChannel from the main window.
//   • The audio analyser cannot be cloned, so we reach back into the OPENER
//     window (`window.opener`) and read its live AnalyserNode directly — same
//     origin, so the cross-window method call is allowed. The viz components
//     just call getByteFrequencyData on it each frame.
//
// If there's no opener (window opened standalone) or audio hasn't started yet,
// we show a small "waiting for the studio" card instead of a black void.

import React, { useEffect, useRef, useState } from 'react';
import LayerStack from './LayerStack';
import ShaderLayer from './ShaderLayer';
import { getSilentAnalyser } from '../engine/silentAnalyser';
import ButterchurnLayer from './ButterchurnLayer';
import MidiNotesScene from './MidiNotesScene';
import ThreeScene, { Three3DConfig } from './ThreeScene';
import TextOverlay from './TextOverlay';
import BackgroundLayer from './BackgroundLayer';
import { VisualizationConfig, BackgroundMedia } from '../types';
import type { LauncherLayer } from './ClipLauncher';
import { AudioDriverSampler } from '../engine/audioDrivers';

interface ProgramState {
  config: VisualizationConfig;
  layers: LauncherLayer[];
  isPlaying: boolean;
  shaderSrc: string | null;
  shaderStart: number;
  milkdrop: boolean;
  milkdropIdx: number;
  milkdropBlendMode: string;
  milkdropLayerOpacity: number;
  midiNotes: boolean;
  three3d: Three3DConfig | null;
  bgMedia1: BackgroundMedia[];
  bgMedia2: BackgroundMedia[];
}

const ProgramOutView: React.FC = () => {
  const [state, setState] = useState<ProgramState | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  // ── Receive live state from the studio over BroadcastChannel ──────────────
  useEffect(() => {
    const ch = new BroadcastChannel('plajah-program-out');
    ch.onmessage = (e) => {
      const msg = e.data;
      if (msg?.type === 'STATE') {
        const { type, ...rest } = msg;
        setState(rest as ProgramState);
      }
    };
    // Ask the studio to send the current state immediately on open.
    ch.postMessage({ type: 'REQUEST_STATE' });
    return () => ch.close();
  }, []);

  // ── Pull the live analyser out of the opener window (same origin) ─────────
  // The analyser is a live Web Audio node bound to the studio's AudioContext;
  // it can't cross the channel, but reading its data cross-window is fine.
  useEffect(() => {
    let raf = 0;
    const poll = () => {
      try {
        const opener: any = window.opener;
        const a: AnalyserNode | null = opener && !opener.closed
          ? (opener.__plajahPixelsGetAnalyser?.() ?? null)
          : null;
        setAnalyser(prev => (prev === a ? prev : a));
      } catch { /* opener gone / cross-origin → leave as null */ }
      raf = window.setTimeout(poll, 300) as unknown as number;
    };
    poll();
    return () => clearTimeout(raf);
  }, []);

  // ── Camera shake (mirrors the studio) — CSS transform on the root, since this
  //    projected window is a live clone, not a recorded surface. ──
  const rootRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<ProgramState | null>(null);
  stateRef.current = state;
  const shakeSamplerRef = useRef<AudioDriverSampler | null>(null);
  const shakeAmpRef = useRef(0);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const root = rootRef.current;
      const cfg = stateRef.current?.config as any;
      if (root && cfg) {
        if (cfg.enableBassShake && analyser) {
          const s = (shakeSamplerRef.current ??= new AudioDriverSampler());
          s.update(analyser, performance.now());
          const target = s.intensity * 0.4 + s.density * 0.55;
          shakeAmpRef.current = Math.max(shakeAmpRef.current * 0.82, target);
          if (s.isSnare) shakeAmpRef.current = Math.min(1.6, shakeAmpRef.current + 0.9);
          if (s.isKick)  shakeAmpRef.current = Math.min(1.6, shakeAmpRef.current + 0.4);
          const amp = shakeAmpRef.current * (cfg.bassShakeIntensity ?? 1);
          if (amp > 0.01) {
            const mag = amp * 14;
            const dx = (Math.random() - 0.5) * mag, dy = (Math.random() - 0.5) * mag;
            const rot = (Math.random() - 0.5) * amp * 0.85;
            root.style.transform = `translate(${dx.toFixed(2)}px,${dy.toFixed(2)}px) rotate(${rot.toFixed(3)}deg) scale(${(1 + amp * 0.03).toFixed(4)})`;
          } else if (root.style.transform) root.style.transform = '';
        } else if (root.style.transform) { shakeAmpRef.current = 0; root.style.transform = ''; }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [analyser]);

  const onDoubleClick = () => {
    const el = document.documentElement;
    if (!document.fullscreenElement) el.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.();
  };

  if (!state) {
    return (
      <div style={{ width: '100vw', height: '100dvh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontFamily: 'sans-serif' }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 3, textTransform: 'uppercase', color: '#FF8C00' }}>Plajah Pixels · Program Output</div>
          <div style={{ fontSize: 10, marginTop: 8, letterSpacing: 1 }}>Waiting for the studio…</div>
        </div>
      </div>
    );
  }

  // A look animates on iTime, so program-out must render it even before the opener's live
  // analyser can be pulled across. Silent analyser = zeros for the bands, motion from the clock.
  const poAnalyser = analyser ?? getSilentAnalyser();
  const { config, layers, isPlaying, shaderSrc, shaderStart, milkdrop, milkdropIdx,
          milkdropBlendMode, milkdropLayerOpacity, midiNotes, three3d, bgMedia1, bgMedia2 } = state;

  return (
    <div
      ref={rootRef}
      style={{ width: '100vw', height: '100dvh', background: '#000', position: 'relative', overflow: 'hidden', cursor: 'none', transformOrigin: 'center center', willChange: 'transform' }}
      onDoubleClick={onDoubleClick}
    >
      {/* Stage "Mirror slicing" effect surface, mirrored from the studio. */}
      {config.enableSlicing && bgMedia1 && (
        <BackgroundLayer mediaList1={bgMedia1} mediaList2={bgMedia2 || []} config={config} analyser={analyser} isPlaying={isPlaying} id="po-bg-slice" />
      )}
      {/* The real composite — every active layer of the live column, stacked. */}
      <LayerStack layers={layers} analyser={analyser} config={config} isPlaying={isPlaying} />

      {/* Explicit global override modes, mirrored from the studio.
          The shader must render even before the opener's analyser can be pulled — a look animates
          on iTime, not on audio — so it falls back to a silent analyser. This was the same gate
          that kept picked shaders off the program output: no analyser, no shader. */}
      {three3d ? (
        <ThreeScene analyser={poAnalyser} config={three3d} palette={config.colorPalette} />
      ) : poAnalyser && (
        <>
          {shaderSrc && <ShaderLayer analyser={poAnalyser} source={shaderSrc} startTimeMs={shaderStart} onError={() => {}} />}
          {midiNotes && <MidiNotesScene palette={config.colorPalette} />}
          {milkdrop && (
            <ButterchurnLayer analyser={poAnalyser} presetIndex={milkdropIdx} blendMode={milkdropBlendMode} layerOpacity={milkdropLayerOpacity} />
          )}
        </>
      )}

      <TextOverlay config={config} analyser={analyser} isPlaying={isPlaying} />
    </div>
  );
};

export default ProgramOutView;
