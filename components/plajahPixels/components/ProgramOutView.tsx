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
import ButterchurnLayer from './ButterchurnLayer';
import MidiNotesScene from './MidiNotesScene';
import ThreeScene, { Three3DConfig } from './ThreeScene';
import TextOverlay from './TextOverlay';
import { VisualizationConfig } from '../types';
import type { LauncherLayer } from './ClipLauncher';

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

  const { config, layers, isPlaying, shaderSrc, shaderStart, milkdrop, milkdropIdx,
          milkdropBlendMode, milkdropLayerOpacity, midiNotes, three3d } = state;

  return (
    <div
      style={{ width: '100vw', height: '100dvh', background: '#000', position: 'relative', overflow: 'hidden', cursor: 'none' }}
      onDoubleClick={onDoubleClick}
    >
      {/* The real composite — every active layer of the live column, stacked. */}
      <LayerStack layers={layers} analyser={analyser} config={config} isPlaying={isPlaying} />

      {/* Explicit global override modes, mirrored from the studio. */}
      {three3d ? (
        <ThreeScene analyser={analyser} config={three3d} palette={config.colorPalette} />
      ) : analyser && (
        <>
          {shaderSrc && <ShaderLayer analyser={analyser} source={shaderSrc} startTimeMs={shaderStart} onError={() => {}} />}
          {midiNotes && <MidiNotesScene palette={config.colorPalette} />}
          {milkdrop && (
            <ButterchurnLayer analyser={analyser} presetIndex={milkdropIdx} blendMode={milkdropBlendMode} layerOpacity={milkdropLayerOpacity} />
          )}
        </>
      )}

      <TextOverlay config={config} analyser={analyser} isPlaying={isPlaying} />
    </div>
  );
};

export default ProgramOutView;
