/**
 * ClipLauncher — Resolume-style clip matrix for Plajah Pixels.
 *
 * Layout:
 *   ┌─ scene-launch bar ──────────────────────────────────────────── [⏻] ─┐
 *   │  [Layer N controls] │ clips →  →  →  (scrollable columns)           │
 *   │  [Layer 2 controls] │ clips →  →  →                    │ Right panel│
 *   │  [Layer 1 controls] │ clips →  →  →                    │ (music +   │
 *   │  [+ ADD LAYER]                                          │  settings) │
 *   └─ source browser ───────────────────────────────────────────────────┘
 *
 * Per-clip opacity: drag the dot inside each clip left/right to fade.
 * Per-layer opacity: the horizontal bar in the layer sidebar.
 * Power button: top-right — closes the launcher, returning to fly-drawer mode.
 *
 * Layers (bottom = first rendered, top = last):
 *   Layer 1 (BG)  → onSetLayerMedia(0, ...)
 *   Layer 2 (VIZ) → onApply({mode})
 *   Layer 3 (FX)  → FX toggles + Milkdrop
 *   Layer 4+      → user-added layers
 */

import React, {
  useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo,
} from 'react';
import {
  Play, ChevronLeft, ChevronRight, Upload, Plus,
  Zap, Image, Wind, Radio, Search, SkipBack, SkipForward, Shuffle,
  Eye, EyeOff, Power, X, Cpu, Trash2, Copy,
} from 'lucide-react';
import { VisualizationConfig, VisualizerMode, BackgroundMedia, BlendMode } from '../types';
import { SCENE_CATALOG, SceneEntry } from '../engine/sceneCatalog';
import { AudioDriverSampler } from '../engine/audioDrivers';
import {
  Mapping, DriverKind, TargetKind, DRIVER_KINDS, TARGET_KINDS,
  isRowTarget, makeMapping, loadMappings, saveMappings,
  sceneRateOptions, defaultRate,
} from '../engine/automationMatrix';
import { MidiEventData, rotatePalette } from '../services/midiService';
import { LayerSource } from './LayerStack';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClipType = 'empty' | 'media' | 'generator' | 'milkdrop' | 'color' | 'shader';

export interface LauncherClip {
  id:            string;
  type:          ClipType;
  name:          string;
  color:         string;
  opacity?:      number;  // 0–1, default 1 (per-clip fade)
  // media
  mediaUrl?:     string;
  mediaType?:    'video' | 'image';
  loop?:         boolean;
  // generator
  sceneMode?:    string;
  sceneKind?:    'classic' | 'canvas' | 'gl';
  // milkdrop
  milkdropIdx?:  number;
  milkdropName?: string;
  // color fill
  fillColor?:    string;
  // shader
  shaderSrc?:    string;
  params?:       number[];  // iParam0..3 (0–1), only for shader clips
}

export interface LauncherLayer {
  id:            string;
  name:          string;
  blendMode:     string;
  opacity:       number;   // 0–1 (layer-wide fade)
  bypassed:      boolean;
  muted:         boolean;
  clips:         (LauncherClip | null)[];
  activeCol:     number | null;
  autoMode?:     'off' | 'next' | 'random';
  autoInterval?: number;  // seconds, default 4
}

export interface MilkdropControls {
  enabled:          boolean;
  name:             string;
  count:            number;
  idx:              number;
  onToggle:         () => void;
  onPrev:           () => void;
  onNext:           () => void;
  onRandom:         () => void;
  onSetIdx:         (i: number) => void;
  /** Called when the FX layer fires a milkdrop clip — sets the CSS blend mode for the layer. */
  onSetBlendMode?:  (mode: string) => void;
  /** Called when the FX layer opacity changes — sets the layer opacity for butterchurn. */
  onSetOpacity?:    (opacity: number) => void;
  thumbnails?:      Record<string, string>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BLEND_OPTIONS = ['Normal','Screen','Add','Multiply','Overlay','Lighten','Exclusion','Difference'];
const NUM_COLS      = 8;
const ACCENT_COLORS = ['#FF8C00','#0ea5e9','#10b981','#f59e0b','#ef4444','#ec4899','#06b6d4','#a78bfa'];

function makeDefaultLayers(): LauncherLayer[] {
  // OVERLAY (index 0): bgMedia2 — renders below BG in flex-col-reverse UI (bottommost row)
  const overlay: LauncherLayer = {
    id: 'overlay', name: 'OVERLAY', blendMode: 'Screen', opacity: 0.6, bypassed: false, muted: false,
    clips: Array(NUM_COLS).fill(null),
    activeCol: null, autoMode: 'off', autoInterval: 4,
  };

  // BG (index 1): bgMedia1 base layer
  const bg: LauncherLayer = {
    id: 'bg', name: 'BG', blendMode: 'Normal', opacity: 1, bypassed: false, muted: false,
    clips: Array(NUM_COLS).fill(null),
    activeCol: null, autoMode: 'off', autoInterval: 4,
  };

  const vizScenes: SceneEntry[] = SCENE_CATALOG.slice(0, NUM_COLS);
  const viz: LauncherLayer = {
    id: 'viz', name: 'VIZ', blendMode: 'Screen', opacity: 1, bypassed: false, muted: false,
    clips: vizScenes.map((s, i) => ({
      id:        `viz-default-${i}`,
      type:      'generator' as ClipType,
      name:      s.name,
      color:     ACCENT_COLORS[i % ACCENT_COLORS.length],
      sceneMode: s.mode,
      sceneKind: s.kind,
      opacity:   1,
    })),
    activeCol: 0, autoMode: 'off', autoInterval: 4,
  };

  const fxClips: (LauncherClip | null)[] = [
    { id: 'fx-milk',   type: 'milkdrop',  name: 'MILKDROP', color: '#c084fc', milkdropIdx: 0, opacity: 1 },
    { id: 'fx-milk2',  type: 'milkdrop',  name: 'MILK NEXT',color: '#a855f7', milkdropIdx: 1, opacity: 1 },
    { id: 'fx-glitch', type: 'generator', name: 'GLITCH',   color: '#22d3ee', sceneMode: '__fx_glitch', opacity: 1 },
    { id: 'fx-bass',   type: 'generator', name: 'BASS↑',    color: '#ef4444', sceneMode: '__fx_bass',   opacity: 1 },
    ...Array(NUM_COLS - 4).fill(null),
  ];
  const fx: LauncherLayer = {
    id: 'fx', name: 'FX', blendMode: 'Add', opacity: 0.8, bypassed: false, muted: false,
    clips: fxClips,
    activeCol: null, autoMode: 'off', autoInterval: 4,
  };

  // Order: [overlay, bg, viz, fx] — flex-col-reverse renders overlay at bottom, fx at top
  return [overlay, bg, viz, fx];
}

const MATRIX_KEY = 'plajah-clip-launcher-v2';

const BLEND_MAP: Record<string, string> = {
  normal:     'source-over',
  screen:     'screen',
  add:        'lighter',
  multiply:   'multiply',
  overlay:    'overlay',
  lighten:    'lighten',
  exclusion:  'exclusion',
  difference: 'difference',
};

function loadLayers(): LauncherLayer[] {
  try {
    const raw = sessionStorage.getItem(MATRIX_KEY);
    if (!raw) return makeDefaultLayers();
    let parsed = JSON.parse(raw) as LauncherLayer[];
    // Migration: prepend overlay layer if not present
    if (!parsed.find(l => l.id === 'overlay')) {
      parsed = [
        { id: 'overlay', name: 'OVERLAY', blendMode: 'Screen', opacity: 0.6, bypassed: false, muted: false,
          clips: Array(NUM_COLS).fill(null), activeCol: null, autoMode: 'off', autoInterval: 4 },
        ...parsed,
      ];
    }
    return parsed.map(l => ({
      ...l,
      autoMode:     l.autoMode     ?? 'off',
      autoInterval: l.autoInterval ?? 4,
    }));
  } catch {
    return makeDefaultLayers();
  }
}
function saveLayers(ls: LauncherLayer[]) {
  try {
    const stripped = ls.map(l => ({
      ...l,
      clips: l.clips.map(c => {
        if (!c || c.mediaUrl?.startsWith('blob:')) return c ? { ...c, mediaUrl: undefined } : null;
        return c;
      }),
    }));
    sessionStorage.setItem(MATRIX_KEY, JSON.stringify(stripped));
  } catch { /* ignore */ }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  config:        VisualizationConfig;
  onApply:       (patch: Partial<VisualizationConfig>) => void;
  milkdrop:      MilkdropControls;
  /** Layer-aware media setter. Routes by layerId: 'bg' → bgMedia1, 'overlay'/others → bgMedia2. */
  onSetLayerMedia: (layerIdx: number, media: BackgroundMedia | null, blendMode?: string, opacity?: number, layerId?: string) => void;
  /** bgMedia1 from studio — auto-synced into BG layer cells so drawer library → clip grid. */
  bgMedia1?:     BackgroundMedia[];
  /** bgMedia2 from studio — auto-synced into OVERLAY layer cells. */
  bgMedia2?:     BackgroundMedia[];
  /** Shader library from ShaderPanel — shown as a SHADERS tab in the source browser. */
  shaderLibrary?: { name: string; src: string; category: string }[];
  /** Called when user picks a shader from the source browser (fly-drawer / non-cell path). */
  onApplyShader?: (src: string) => void;
  /** Called when a shader clip cell fires or toggles off. src=null means stop. */
  onLayerShader?: (layerIdx: number, src: string | null, blendMode: string, opacity: number, params: number[]) => void;
  /** Called when the params sliders change for an active shader layer. */
  onShaderParamsChange?: (layerIdx: number, params: number[]) => void;
  /**
   * Live driver-bus modulation for a layer (Steps 5a–5b). Sends the modulated
   * opacity (and, later, blend amount) for layer types whose opacity isn't
   * otherwise live-settable. The Studio routes by layerId: 'bg'/'overlay' →
   * BackgroundLayer media multipliers; other ids → shader-layer opacity.
   */
  onLayerModulation?: (layerIdx: number, layerId: string, mod: { opacity?: number; blendAmount?: number }) => void;
  /** Called when user presses SYNC in the AUTO tab to push scene interval to studio config. */
  onSyncSceneAuto?: (interval: number) => void;
  /** Called when the global blend overlay toggle changes — drives config.enableLayer2 in the studio. */
  onSetBlendActive?: (enabled: boolean) => void;
  /** Audio analyser for beat-driven scene automation. */
  analyser?: AnalyserNode | null;
  /** Content to render in the docked right panel (music controls + settings). */
  rightPanel?:   React.ReactNode;
  /** Called when the user taps the power button to close the launcher. */
  onPowerOff?:   () => void;
  /** Emits the full ordered layer stack so the Studio can render it as the real
   *  composite (LayerStack). This is the source of truth for the program output. */
  onLayersChange?: (layers: LauncherLayer[]) => void;
}

// ─── Clip Cell ────────────────────────────────────────────────────────────────

interface CellProps {
  clip:             LauncherClip | null;
  layerIdx:         number;
  colIdx:           number;
  active:           boolean;
  flash:            boolean;
  onActivate:       () => void;
  onDrop:           (file: File) => void;
  onAssign:         (clip: LauncherClip) => void;
  onUpdateOpacity:  (opacity: number) => void;
  onClear?:         () => void;
  onCopyToNext?:    () => void;
  /** Hover an assigned cell → live preview popup (null on leave). */
  onHover?:         (clip: LauncherClip | null) => void;
}

const ClipCell: React.FC<CellProps> = ({
  clip, layerIdx, colIdx, active, flash, onActivate, onDrop, onAssign, onUpdateOpacity, onClear, onCopyToNext, onHover,
}) => {
  const [dragOver, setDragOver] = useState(false);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const padNum  = layerIdx * 4 + colIdx;
  const accent  = clip?.color ?? '#444';
  const clipOpacity = clip?.opacity ?? 1;

  // Close context menu on outside click
  useEffect(() => {
    if (!menuPos) return;
    const close = () => setMenuPos(null);
    window.addEventListener('click', close, { once: true });
    return () => window.removeEventListener('click', close);
  }, [menuPos]);

  return (
    <div
      className="relative flex-shrink-0 cursor-pointer overflow-hidden select-none transition-all group"
      style={{
        width: 88, height: '100%',
        background: flash ? '#fff'
                  : active ? `linear-gradient(160deg,${accent}44,${accent}18)`
                  : dragOver ? `${accent}22`
                  : '#111118',
        border: flash    ? '1px solid rgba(255,255,255,0.9)'
              : active   ? `1px solid ${accent}cc`
              : dragOver ? `1px solid ${accent}`
              : '1px solid rgba(255,255,255,0.06)',
        borderRadius: 3,
        transform: flash ? 'scale(0.93)' : 'scale(1)',
        boxShadow: active && !flash ? `0 0 0 1px ${accent}55, 0 0 16px ${accent}33` : 'none',
        opacity: clipOpacity < 1 ? 0.4 + clipOpacity * 0.6 : 1,
      }}
      onClick={clip ? onActivate : () => fileRef.current?.click()}
      onMouseEnter={() => { if (clip) onHover?.(clip); }}
      onMouseLeave={() => onHover?.(null)}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setMenuPos({ x: e.clientX, y: e.clientY }); }}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault(); setDragOver(false);
        const clipJson = e.dataTransfer.getData('application/plajah-clip');
        if (clipJson) { try { onAssign(JSON.parse(clipJson)); } catch { /* */ } return; }
        const f = e.dataTransfer.files[0];
        if (f && (f.type.startsWith('video/') || f.type.startsWith('image/'))) onDrop(f);
      }}
    >
      {/* Right-click context menu */}
      {menuPos && (
        <div
          className="fixed z-[500] rounded-xl overflow-hidden border border-white/10 shadow-2xl"
          style={{ top: menuPos.y, left: menuPos.x, background: 'rgba(6,6,18,0.97)', backdropFilter: 'blur(16px)', minWidth: 164 }}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => { setMenuPos(null); fileRef.current?.click(); }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-white/70 hover:text-white hover:bg-white/10 transition-all text-left"
          >
            <Upload className="w-3 h-3" /> Replace with file
          </button>
          {clip && (
            <>
              <button
                onClick={() => { setMenuPos(null); onCopyToNext?.(); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-white/70 hover:text-white hover:bg-white/10 transition-all text-left border-t border-white/05"
              >
                <Copy className="w-3 h-3" /> Copy to next scene
              </button>
              <button
                onClick={() => { setMenuPos(null); onClear?.(); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all text-left border-t border-white/05"
              >
                <Trash2 className="w-3 h-3" /> Clear cell
              </button>
            </>
          )}
        </div>
      )}

      {/* Left accent stripe */}
      <div className="absolute left-0 top-0 bottom-0 w-0.5"
        style={{ background: flash ? '#fff' : active ? accent : `${accent}44` }} />

      {/* Media thumbnail */}
      {clip?.type === 'media' && clip.mediaUrl && (
        <div className="absolute inset-0">
          {clip.mediaType === 'video'
            ? <video src={clip.mediaUrl} className="w-full h-full object-cover opacity-50" muted autoPlay loop playsInline />
            : <img src={clip.mediaUrl} className="w-full h-full object-cover opacity-50" alt="" />}
        </div>
      )}

      {/* Generator color block */}
      {clip?.type === 'generator' && (
        <div className="absolute inset-0 opacity-15"
          style={{ background: `radial-gradient(ellipse at 30% 40%, ${accent} 0%, transparent 70%)` }} />
      )}

      {/* Milkdrop shimmer */}
      {clip?.type === 'milkdrop' && (
        <div className="absolute inset-0 opacity-20"
          style={{ background: 'linear-gradient(135deg,#c084fc,#7c3aed,#1e1b4b)' }} />
      )}

      {/* Content overlay — leave 16px at bottom for the opacity dot */}
      <div className="relative z-10 h-full flex flex-col justify-between p-1 pl-2" style={{ paddingBottom: 18 }}>
        {/* Top row */}
        <div className="flex items-center justify-between">
          {colIdx < 4 && layerIdx < 3 && (
            <span className="text-[6px] font-black font-mono"
              style={{ color: flash ? '#000' : 'rgba(255,255,255,0.2)' }}>
              P{padNum + 1}
            </span>
          )}
          {active && !flash && (
            <Play className="w-2.5 h-2.5 flex-shrink-0 fill-current" style={{ color: accent }} />
          )}
        </div>

        {/* Clip name / empty state */}
        <div className="min-h-0">
          {!clip ? (
            <div className="flex flex-col items-center justify-center gap-0.5 opacity-20">
              <Plus className="w-3.5 h-3.5 text-white" />
              <span className="text-[6px] text-white font-bold">DROP</span>
            </div>
          ) : (
            <>
              <div className="text-[11px] font-black uppercase leading-tight truncate"
                style={{ color: flash ? '#000' : '#ffffffcc' }}>
                {clip.name}
              </div>
              <div className="text-[8px] uppercase tracking-widest mt-0.5"
                style={{ color: flash ? '#333' : active ? `${accent}99` : 'rgba(255,255,255,0.2)' }}>
                {clip.type === 'generator' ? (clip.sceneKind === 'gl' ? 'GLSL' : 'GEN')
                : clip.type === 'milkdrop' ? 'MILK'
                : clip.type === 'shader'   ? 'GLSL'
                : clip.type === 'media'    ? (clip.mediaType ?? 'MEDIA').toUpperCase()
                : clip.type === 'color'    ? 'SOLID'
                : ''}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Per-clip opacity dot (only visible on hover) ── */}
      {clip && (
        <div
          className="absolute bottom-0.5 left-2 right-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
          style={{ height: 14 }}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
          title={`Opacity: ${Math.round(clipOpacity * 100)}%`}
        >
          {/* Track */}
          <div className="absolute" style={{ left: 4, right: 4, top: 6, height: 1, borderRadius: 1, background: 'rgba(255,255,255,0.15)' }} />
          {/* Filled */}
          <div className="absolute pointer-events-none" style={{ left: 4, top: 6, height: 1, width: `calc(${clipOpacity * 100}% - 8px)`, borderRadius: 1, background: accent }} />
          {/* Dot */}
          <div className="absolute pointer-events-none" style={{ left: `calc(${clipOpacity * 100}% - 4px)`, top: 2, width: 9, height: 9, borderRadius: '50%', background: accent, border: '1.5px solid rgba(255,255,255,0.6)', boxShadow: `0 0 4px ${accent}88` }} />
          {/* Range input — full size for easy grab, fully transparent */}
          <input
            type="range" min="0" max="100" step="1"
            value={Math.round(clipOpacity * 100)}
            onChange={e => onUpdateOpacity(Number(e.target.value) / 100)}
            className="absolute inset-0 w-full cursor-ew-resize"
            style={{ opacity: 0, margin: 0, padding: 0, height: '100%' }}
          />
        </div>
      )}

      {/* Hidden file input */}
      <input ref={fileRef} type="file" accept="video/*,image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onDrop(f); }} />
    </div>
  );
};

// ─── Layer Row ────────────────────────────────────────────────────────────────

interface LayerRowProps {
  layer:         LauncherLayer;
  layerIdx:      number;
  scrollLeft:    number;
  flashedPads:   Set<number>;
  onUpdateLayer: (patch: Partial<LauncherLayer>) => void;
  onUpdateClip:  (colIdx: number, patch: Partial<LauncherClip>) => void;
  onFireClip:    (colIdx: number) => void;
  onDropMedia:   (colIdx: number, file: File) => void;
  onAssignClip:  (colIdx: number, clip: LauncherClip) => void;
  onClearClip:   (colIdx: number) => void;
  onCopyClip:    (colIdx: number) => void;
  onClearRow:    () => void;
  onDeleteLayer: () => void;
  isDefaultLayer: boolean;
  onHoverClip:   (clip: LauncherClip | null) => void;
}

const CELL_HEIGHT = 92;
const LAYER_COLORS = ['#6366f1','#FF8C00','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899'];

const LayerRow: React.FC<LayerRowProps> = ({
  layer, layerIdx, scrollLeft, flashedPads,
  onUpdateLayer, onUpdateClip, onFireClip, onDropMedia, onAssignClip, onClearClip, onCopyClip,
  onClearRow, onDeleteLayer, isDefaultLayer, onHoverClip,
}) => {
  const isFlashed  = (ci: number) => flashedPads.has(layerIdx * 4 + ci);
  const layerColor = LAYER_COLORS[layerIdx % LAYER_COLORS.length];

  return (
    <div className="flex items-stretch" style={{ height: CELL_HEIGHT }}>
      {/* ── Layer controls sidebar ─────────────────────────────────────── */}
      <div
        className="flex-shrink-0 flex flex-col justify-between px-2 py-2 gap-1"
        style={{
          width: 160,
          background: layer.bypassed ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.45)',
          borderRight: `1px solid ${layerColor}33`,
          opacity: layer.muted ? 0.4 : 1,
        }}
      >
        {/* Layer name + bypass + delete */}
        <div className="flex items-center justify-between gap-1">
          <span className="text-[11px] font-black uppercase tracking-widest truncate" style={{ color: layerColor }}>
            {layer.name}
          </span>
          <div className="flex items-center gap-0.5">
            {/* Clear row */}
            <button
              onClick={onClearRow}
              className="w-4 h-4 rounded flex items-center justify-center text-white/20 hover:text-orange-400 transition-colors"
              title="Clear all clips in this row"
            >
              <Trash2 className="w-2.5 h-2.5" />
            </button>
            {!isDefaultLayer && (
              <button
                onClick={onDeleteLayer}
                className="w-4 h-4 rounded flex items-center justify-center text-white/20 hover:text-red-400 transition-colors"
                title="Remove layer"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            )}
            <button
              onClick={() => onUpdateLayer({ bypassed: !layer.bypassed })}
              className="w-5 h-5 rounded flex items-center justify-center text-[8px] font-black transition-all"
              style={{
                background: layer.bypassed ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.05)',
                border:     layer.bypassed ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.1)',
                color:      layer.bypassed ? '#ef4444' : 'rgba(255,255,255,0.3)',
              }}
              title="Bypass layer"
            >⊘</button>
          </div>
        </div>

        {/* Blend mode */}
        <select
          value={layer.blendMode}
          onChange={e => onUpdateLayer({ blendMode: e.target.value })}
          className="text-[9px] uppercase font-bold rounded appearance-none px-1 py-0.5 cursor-pointer"
          style={{
            background: `${layerColor}18`, border: `1px solid ${layerColor}44`,
            color: layerColor, outline: 'none',
          }}
        >
          {BLEND_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>

        {/* Row opacity — taller hit area, more visible */}
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1">
            <input
              type="range" min="0" max="100" step="1"
              value={Math.round(layer.opacity * 100)}
              onChange={e => onUpdateLayer({ opacity: Number(e.target.value) / 100 })}
              className="flex-1 cursor-pointer"
              style={{ accentColor: layerColor, height: 14 }}
            />
            <span className="text-[8px] font-mono w-7 text-right shrink-0"
              style={{ color: 'rgba(255,255,255,0.4)' }}>
              {Math.round(layer.opacity * 100)}
            </span>
          </div>
        </div>

        {/* Mute toggle */}
        <button
          onClick={() => onUpdateLayer({ muted: !layer.muted })}
          className="flex items-center gap-1 transition-all"
          style={{ color: layer.muted ? '#ef4444' : 'rgba(255,255,255,0.25)', fontSize: 8 }}
        >
          {layer.muted ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          <span className="text-[8px] uppercase tracking-widest">{layer.muted ? 'MUTED' : 'LIVE'}</span>
        </button>

        {/* Row automation */}
        <div className="flex items-center gap-1 mt-0.5">
          <button
            onClick={() => {
              const modes: ('off' | 'next' | 'random')[] = ['off', 'next', 'random'];
              const cur = modes.indexOf(layer.autoMode ?? 'off');
              onUpdateLayer({ autoMode: modes[(cur + 1) % modes.length] });
            }}
            className="flex items-center gap-0.5 px-1.5 rounded text-[7px] font-black uppercase tracking-widest"
            style={{
              background: layer.autoMode && layer.autoMode !== 'off' ? `${layerColor}30` : 'rgba(255,255,255,0.04)',
              border: layer.autoMode && layer.autoMode !== 'off' ? `1px solid ${layerColor}66` : '1px solid rgba(255,255,255,0.08)',
              color: layer.autoMode && layer.autoMode !== 'off' ? layerColor : 'rgba(255,255,255,0.2)',
            }}
            title="Row automation: cycle OFF → NEXT → RANDOM"
          >
            {!layer.autoMode || layer.autoMode === 'off' ? '⏸ AUTO' : layer.autoMode === 'next' ? '▶ NEXT' : '⁂ RAND'}
          </button>
          {layer.autoMode && layer.autoMode !== 'off' && (
            <input
              type="number" min="1" max="60" step="1"
              value={layer.autoInterval ?? 4}
              onChange={e => onUpdateLayer({ autoInterval: Math.max(1, Math.min(60, Number(e.target.value))) })}
              className="w-8 bg-transparent border border-white/10 rounded text-[7px] text-center text-white/50 outline-none"
              title="Interval in seconds"
              onClick={e => e.stopPropagation()}
            />
          )}
        </div>
      </div>

      {/* ── Clip cells ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden relative">
        <div
          className="flex gap-1 h-full items-stretch px-1"
          style={{ transform: `translateX(-${scrollLeft}px)`, transition: 'transform 0.15s ease' }}
        >
          {layer.clips.map((clip, ci) => (
            <ClipCell
              key={ci}
              clip={clip}
              layerIdx={layerIdx}
              colIdx={ci}
              active={layer.activeCol === ci && !layer.bypassed && !layer.muted}
              flash={isFlashed(ci) && ci < 4 && layerIdx < 3}
              onActivate={() => onFireClip(ci)}
              onDrop={f => onDropMedia(ci, f)}
              onAssign={c => onAssignClip(ci, c)}
              onUpdateOpacity={opacity => onUpdateClip(ci, { opacity })}
              onClear={() => onClearClip(ci)}
              onCopyToNext={() => onCopyClip(ci)}
              onHover={onHoverClip}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Source Browser ───────────────────────────────────────────────────────────

type SourceTab = 'generators' | 'milkdrop' | 'shaders' | 'media';

interface SourceBrowserProps {
  milkdropControls:  MilkdropControls;
  onAssignToLayer:   (layerIdx: number, colIdx: number, clip: LauncherClip) => void;
  layers:            LauncherLayer[];
  config:            VisualizationConfig;
  shaderLibrary?:    { name: string; src: string; category: string }[];
  onApplyShader?:    (src: string) => void;
  /** Called when user clicks a source item — locks preview in the right panel */
  onPreviewSource?:  (clip: LauncherClip | null) => void;
  /** Called on mouseEnter/mouseLeave — shows live preview in PARAMS tab, null on leave */
  onHoverSource?:    (clip: LauncherClip | null) => void;
}

const SourceBrowser: React.FC<SourceBrowserProps> = ({
  milkdropControls, onAssignToLayer, layers, shaderLibrary, onPreviewSource, onHoverSource,
}) => {
  const [tab,          setTab]          = useState<SourceTab>('generators');
  const [search,       setSearch]       = useState('');
  const [milkdropNames,setMilkdropNames]= useState<string[]>([]);
  const [loadingMilk,  setLoadingMilk]  = useState(false);
  const [milkLoaded,   setMilkLoaded]   = useState(false);

  useEffect(() => {
    if (tab !== 'milkdrop' || milkLoaded) return;
    setLoadingMilk(true);
    import('butterchurn-presets').then(mod => {
      const api = (mod as any).default || mod;
      const presets = api.getPresets ? api.getPresets() : api;
      setMilkdropNames(Object.keys(presets).sort());
      setMilkLoaded(true);
    }).catch(() => {}).finally(() => setLoadingMilk(false));
  }, [tab, milkLoaded]);

  const generators   = useMemo(() =>
    SCENE_CATALOG.filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase())),
  [search]);
  const filteredMilk = useMemo(() =>
    milkdropNames.filter(n => !search || n.toLowerCase().includes(search.toLowerCase())).slice(0, 120),
  [milkdropNames, search]);

  return (
    <div className="flex flex-col shrink-0" style={{ height: 126, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex items-center gap-0 px-2 shrink-0"
        style={{ height: 28, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        {([
          ['generators', Zap,   'GENERATORS'] as const,
          ['milkdrop',   Wind,  'MILKDROP']   as const,
          ['shaders',    Cpu,   'SHADERS']    as const,
          ['media',      Image, 'MEDIA']       as const,
        ] as const).map(([id, Icon, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="flex items-center gap-1.5 px-3 h-full text-[8px] font-black uppercase tracking-widest transition-all border-b-2"
            style={{
              borderBottomColor: tab === id ? '#FF8C00' : 'transparent',
              color: tab === id ? '#c084fc' : 'rgba(255,255,255,0.3)',
            }}
          >
            <Icon className="w-3 h-3" />{label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1.5 mr-1">
          <Search className="w-3 h-3 text-white/20" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="search…"
            className="bg-transparent border-none outline-none text-[8px] text-white/50 placeholder-white/20 w-28"
          />
        </div>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden" style={{ scrollbarWidth: 'none' }}>
        <div className="flex gap-1 h-full items-stretch p-1">

          {tab === 'generators' && generators.map((s) => {
            const color = s.kind === 'gl' ? '#22d3ee' : s.kind === 'canvas' ? '#a78bfa' : '#FF8C00';
            const genClip: LauncherClip = { id: `gen-${s.mode}`, type: 'generator', name: s.name, color, sceneMode: s.mode, sceneKind: s.kind, opacity: 1 };
            return (
              <div
                key={s.mode}
                className="flex-shrink-0 flex flex-col justify-between cursor-pointer rounded overflow-hidden transition-all hover:scale-[1.04]"
                style={{ width: 72, background: `${color}18`, border: `1px solid ${color}44`, padding: '4px 6px' }}
                draggable
                onClick={() => onPreviewSource?.(genClip)}
                onMouseEnter={() => onHoverSource?.(genClip)}
                onMouseLeave={() => onHoverSource?.(null)}
                onDragStart={e => {
                  e.dataTransfer.setData('application/plajah-clip', JSON.stringify({
                    id: `gen-${s.mode}-${Date.now()}`,
                    type: 'generator', name: s.name, color,
                    sceneMode: s.mode, sceneKind: s.kind, opacity: 1,
                  } as LauncherClip));
                }}
                title={`${s.name} — ${s.cat} · hover to preview, drag to assign`}
              >
                <div className="text-[6px] uppercase tracking-widest" style={{ color: `${color}88` }}>
                  {s.kind === 'gl' ? 'GLSL' : s.kind === 'canvas' ? 'GEN' : 'AUDIO'}
                </div>
                <div className="text-[9px] font-black uppercase leading-tight" style={{ color: '#ffffffcc' }}>
                  {s.name}
                </div>
                <div className="text-[6px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                  {s.cat.split('·')[1]?.trim()}
                </div>
              </div>
            );
          })}

          {tab === 'milkdrop' && (
            <>
              <div className="flex-shrink-0 flex flex-col justify-center gap-1 px-2"
                style={{ width: 88, borderRight: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="text-[6px] font-black uppercase tracking-widest text-white/20 mb-1">Active</div>
                <div className="text-[7px] text-[#FF8C00]/70 leading-snug break-all">
                  {milkdropControls.name ? milkdropControls.name.slice(0, 36) : '—'}
                </div>
                <div className="text-[6px] text-white/20 mt-1">Drag preset to a cell to assign</div>
              </div>

              {loadingMilk ? (
                <div className="flex items-center px-4 text-[9px] text-white/30">Loading presets…</div>
              ) : (
                filteredMilk.map((name, i) => {
                  const isActive = milkdropControls.name === name;
                  const thumb    = milkdropControls.thumbnails?.[name];
                  return (
                    <div
                      key={name}
                      className="flex-shrink-0 flex flex-col justify-end cursor-pointer rounded overflow-hidden transition-all hover:scale-[1.04] relative"
                      style={{
                        width: 80,
                        backgroundImage: thumb ? `url(${thumb})` : undefined,
                        backgroundSize: 'cover', backgroundPosition: 'center',
                        background: !thumb ? (isActive ? 'rgba(192,132,252,0.25)' : 'rgba(124,58,237,0.12)') : undefined,
                        border: isActive ? '1px solid #c084fc' : '1px solid rgba(192,132,252,0.2)',
                        padding: '4px 6px',
                      }}
                      title={`${name} · hover to preview, drag to assign`}
                      onClick={() => onPreviewSource?.({
                        id: `milk-${i}`, type: 'milkdrop',
                        name: name.slice(0, 20), color: '#c084fc',
                        milkdropIdx: i, milkdropName: name, opacity: 1,
                      })}
                      onMouseEnter={() => onHoverSource?.({ id: `milk-${i}`, type: 'milkdrop', name: name.slice(0, 20), color: '#c084fc', milkdropIdx: i, milkdropName: name, opacity: 1 })}
                      onMouseLeave={() => onHoverSource?.(null)}
                      draggable
                      onDragStart={e => {
                        e.dataTransfer.setData('application/plajah-clip', JSON.stringify({
                          id: `milk-${i}-${Date.now()}`,
                          type: 'milkdrop', name: name.slice(0, 20),
                          color: '#c084fc', milkdropIdx: i, milkdropName: name, opacity: 1,
                        } as LauncherClip));
                      }}
                    >
                      {thumb && <div className="absolute inset-0 bg-black/50" />}
                      <div className="relative z-10">
                        <div className="text-[6px] uppercase tracking-widest mb-0.5" style={{ color: 'rgba(192,132,252,0.8)' }}>MILK</div>
                        <div className="text-[8px] font-bold leading-tight text-white/90 truncate drop-shadow">{name.slice(0, 22)}</div>
                        {isActive && <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-[#FF8C00] mx-auto" />}
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}

          {/* ── Shaders ── */}
          {tab === 'shaders' && (
            shaderLibrary && shaderLibrary.length > 0 ? (
              shaderLibrary.filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase())).map((shader) => {
                const catColors: Record<string, string> = {
                  'Audio-Reactive': '#22d3ee',
                  'Generative':     '#a78bfa',
                  'Cinematic':      '#f59e0b',
                  'Abstract':       '#ec4899',
                };
                const color = catColors[shader.category] ?? '#FF8C00';
                return (
                  <div
                    key={shader.name}
                    className="flex-shrink-0 flex flex-col justify-between cursor-grab rounded overflow-hidden transition-all hover:scale-[1.04]"
                    style={{ width: 80, background: `${color}18`, border: `1px solid ${color}44`, padding: '4px 6px' }}
                    draggable
                    onDragStart={e => {
                      e.dataTransfer.setData('application/plajah-clip', JSON.stringify({
                        id: `shader-${shader.name}-${Date.now()}`,
                        type: 'shader',
                        name: shader.name.slice(0, 18).toUpperCase(),
                        color,
                        shaderSrc: shader.src,
                        opacity: 1,
                        params: [0.5, 0.5, 0.5, 0.5],
                      } as LauncherClip));
                    }}
                    onClick={() => onPreviewSource?.({
                      id: `shader-${shader.name}`, type: 'shader',
                      name: shader.name.slice(0, 18).toUpperCase(), color,
                      shaderSrc: shader.src, opacity: 1,
                      params: [0.5, 0.5, 0.5, 0.5],
                    })}
                    onMouseEnter={() => onHoverSource?.({ id: `shader-${shader.name}`, type: 'shader', name: shader.name.slice(0, 18).toUpperCase(), color, shaderSrc: shader.src, opacity: 1, params: [0.5, 0.5, 0.5, 0.5] })}
                    onMouseLeave={() => onHoverSource?.(null)}
                    title={`${shader.name} · ${shader.category} — hover to preview, drag to assign`}
                  >
                    <div className="text-[6px] uppercase tracking-widest" style={{ color: `${color}88` }}>{shader.category}</div>
                    <div className="text-[9px] font-black uppercase leading-tight" style={{ color: '#ffffffcc' }}>{shader.name}</div>
                    <div className="text-[7px] font-black uppercase mt-0.5" style={{ color }}>GLSL ↓ DRAG</div>
                  </div>
                );
              })
            ) : (
              <div className="flex items-center px-4 text-[9px] text-white/30">No shaders loaded — open the Shader editor first.</div>
            )
          )}

          {tab === 'media' && (
            <div className="flex items-center gap-3 px-4">
              <div className="text-center">
                <Upload className="w-6 h-6 text-white/20 mx-auto mb-1" />
                <p className="text-[8px] text-white/30 leading-relaxed">
                  Drag video / image files<br />directly onto a layer cell
                </p>
              </div>
              <div className="text-[8px] text-white/20 leading-relaxed max-w-xs">
                Supported: MP4 · MOV · WEBM · GIF · JPG · PNG · WEBP<br />
                Files persist per session. Drop to any BG or VIZ cell.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Main ClipLauncher ────────────────────────────────────────────────────────

const DEFAULT_LAYER_NAMES = ['BG', 'VIZ', 'FX'];

const ClipLauncher: React.FC<Props> = ({
  config, onApply, milkdrop, onSetLayerMedia,
  bgMedia1, bgMedia2, shaderLibrary, onApplyShader,
  onLayerShader, onShaderParamsChange, onLayerModulation, onSyncSceneAuto, onSetBlendActive, analyser,
  rightPanel, onPowerOff, onLayersChange,
}) => {
  const [layers,        setLayers]        = useState<LauncherLayer[]>(() => loadLayers());
  const [mappings,      setMappings]      = useState<Mapping[]>(() => loadMappings());
  const [scrollLeft,    setScrollLeft]    = useState(0);
  const [flashedPads,   setFlashedPads]   = useState<Set<number>>(new Set());
  const [midiActive,    setMidiActive]    = useState(false);
  const [selectedCell,  setSelectedCell]  = useState<{ li: number; ci: number } | null>(null);
  const [rightPanelTab, setRightPanelTab] = useState<'transport' | 'params' | 'auto'>('transport');

  // Global blend overlay toggle — mirrors config.enableLayer2 and controls whether ALL layers blend
  const [globalBlendActive, setGlobalBlendActive] = useState<boolean>(() => config.enableLayer2 ?? true);

  // Scene automation state
  const [sceneAutoMode,     setSceneAutoMode]     = useState<'off' | 'next' | 'random'>('off');
  const [sceneAutoInterval, setSceneAutoInterval] = useState(8); // seconds
  const [sceneAutoTrigger,  setSceneAutoTrigger]  = useState<'time' | 'beat'>('time');
  const [sceneAutoBars,     setSceneAutoBars]     = useState<2 | 4 | 8 | 16>(4); // bars between advances in beat mode
  const sceneAutoColRef      = useRef(0);
  const busSceneColRef       = useRef(0); // driver-bus sequential scene position
  const sceneBeatCounterRef  = useRef(0); // beats counted toward next scene change
  const sceneLastBeatTimeRef = useRef(0); // last beat timestamp for debounce
  // The single column that is currently driving program output (null = nothing launched yet)
  const activeSceneColRef    = useRef<number | null>(null);
  const [sceneMenu, setSceneMenu] = useState<{ x: number; y: number; col: number } | null>(null);
  const [previewSource, setPreviewSource] = useState<LauncherClip | null>(null);
  const [hoverSource,   setHoverSource]   = useState<LauncherClip | null>(null);
  const prevTabRef = useRef<typeof rightPanelTab | null>(null); // tab to restore after hover
  // ── Hover-preview popup: a small live mini-render that follows the cursor,
  //    NEVER the program canvas. Positioned imperatively (no re-render storm). ──
  const pointerRef = useRef({ x: 0, y: 0 });
  const hoverPopRef = useRef<HTMLDivElement>(null);
  const POP_W = 230, POP_H = 150;
  const placePopup = useCallback(() => {
    const el = hoverPopRef.current; if (!el) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const left = Math.min(pointerRef.current.x + 18, vw - POP_W - 10);
    const top  = Math.max(8, Math.min(pointerRef.current.y - POP_H - 6, vh - POP_H - 10));
    el.style.left = `${left}px`;
    el.style.top  = `${top}px`;
  }, []);
  // Always-on pointer tracker (passive, no re-render).
  useEffect(() => {
    const onMove = (e: MouseEvent) => { pointerRef.current = { x: e.clientX, y: e.clientY }; if (hoverSource) placePopup(); };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, [hoverSource, placePopup]);
  // Position immediately when a hover begins, before paint (no corner flash).
  useLayoutEffect(() => { if (hoverSource) placePopup(); }, [hoverSource, placePopup]);

  const configRef       = useRef(config);
  const milkRef         = useRef(milkdrop);
  const layersRef       = useRef(layers);
  const mappingsRef     = useRef(mappings);
  const sceneAutoModeRef = useRef(sceneAutoMode);
  // Live driver-bus modulation per layer id (Step 4 writes; Step 5's real composite reads).
  const layerModRef = useRef<Record<string, { opacity?: number; blendAmount?: number }>>({});

  // Helper: sync a media array into a layer row identified by id
  function syncMediaToLayer(
    mediaList: BackgroundMedia[],
    layerId: string,
    color: string,
    setter: React.Dispatch<React.SetStateAction<LauncherLayer[]>>,
  ) {
    setter(prev => {
      const layerIdx = prev.findIndex(l => l.id === layerId);
      if (layerIdx === -1) return prev;
      const layer = prev[layerIdx];
      let changed = false;
      const newClips = [...layer.clips];
      let nextSlot = 0;
      for (const media of mediaList) {
        while (nextSlot < newClips.length && newClips[nextSlot] !== null) nextSlot++;
        if (nextSlot >= newClips.length) break;
        if (newClips.find(c => c?.mediaUrl === media.url || c?.id === media.id)) continue;
        newClips[nextSlot] = {
          id: media.id, type: 'media',
          name: media.id.replace(/^default-/, '').replace(/-/g, ' ').toUpperCase().slice(0, 18),
          color, mediaUrl: media.url, mediaType: media.type, loop: true, opacity: 1,
        };
        changed = true;
        nextSlot++;
      }
      if (!changed) return prev;
      return prev.map((l, i) => i === layerIdx ? { ...l, clips: newClips } : l);
    });
  }

  // Sync bgMedia1 → BG layer, bgMedia2 → OVERLAY layer
  useEffect(() => { if (bgMedia1?.length) syncMediaToLayer(bgMedia1, 'bg', '#6366f1', setLayers); }, [bgMedia1]);
  useEffect(() => { if (bgMedia2?.length) syncMediaToLayer(bgMedia2, 'overlay', '#ec4899', setLayers); }, [bgMedia2]);
  useEffect(() => { configRef.current = config;   }, [config]);
  useEffect(() => { sceneAutoModeRef.current = sceneAutoMode; }, [sceneAutoMode]);
  useEffect(() => { milkRef.current   = milkdrop; }, [milkdrop]);
  useEffect(() => { layersRef.current = layers; saveLayers(layers); onLayersChange?.(layers); }, [layers]);
  useEffect(() => { mappingsRef.current = mappings; saveMappings(mappings); }, [mappings]);

  const CELL_W    = 101;
  const GAP       = 4;
  const STEP      = CELL_W + GAP;
  const colCount  = layers[0]?.clips.length ?? NUM_COLS;

  const preloadRef = useRef<Record<string, HTMLVideoElement>>({});

  // ── Global blend toggle ──────────────────────────────────────────────────────
  const toggleBlend = useCallback(() => {
    setGlobalBlendActive(prev => {
      const next = !prev;
      onApply({ enableLayer2: next } as any);
      onSetBlendActive?.(next);
      return next;
    });
  }, [onApply, onSetBlendActive]);

  // ── Fire clip ───────────────────────────────────────────────────────────────
  // forceOn = true → always activate (used by scene launch); false → normal toggle (used by individual cell clicks)
  const fireClip = useCallback((layerIdx: number, colIdx: number, ls?: LauncherLayer[], forceOn = false) => {
    const lrs = ls ?? layersRef.current;
    const layer = lrs[layerIdx];
    if (!layer) return;
    const clip = layer.clips[colIdx];

    const isCurrentlyActive = layer.activeCol === colIdx;
    const willBeActive = forceOn ? true : !isCurrentlyActive;

    setLayers(prev => prev.map((l, li) =>
      li === layerIdx ? { ...l, activeCol: willBeActive ? colIdx : null } : l
    ));

    // Track which cell is selected for the PARAMS panel
    setSelectedCell({ li: layerIdx, ci: colIdx });

    if (!clip) return;
    if (layer.bypassed || layer.muted) return;

    const layerBlend    = layer.blendMode.toLowerCase();
    const resolvedBlend = globalBlendActive
      ? ((BLEND_MAP[layerBlend] || layerBlend) as BlendMode)
      : 'normal' as BlendMode;

    if (clip.type === 'generator') {
      if (layer.id === 'fx' && clip.sceneMode === '__fx_glitch') {
        onApply({ enableGlitch: forceOn ? true : !(configRef.current as any).enableGlitch } as any);
      } else if (layer.id === 'fx' && clip.sceneMode === '__fx_bass') {
        onApply({ enableBassShake: forceOn ? true : !(configRef.current as any).enableBassShake } as any);
      } else if (layer.id === 'viz' && clip.sceneMode) {
        onApply({ mode: clip.sceneMode as VisualizerMode, blendMode: resolvedBlend });
      }
    } else if (clip.type === 'milkdrop') {
      if (clip.milkdropIdx !== undefined) milkRef.current.onSetIdx(clip.milkdropIdx);
      if (forceOn) {
        // Scene launch: force ON — only toggle if milkdrop is currently off
        if (!milkRef.current.enabled) milkRef.current.onToggle();
      } else {
        milkRef.current.onToggle();
      }
      milkRef.current.onSetBlendMode?.(resolvedBlend);
      milkRef.current.onSetOpacity?.((clip.opacity ?? 1) * layer.opacity);
    } else if (clip.type === 'media' && clip.mediaUrl) {
      onSetLayerMedia(layerIdx, { url: clip.mediaUrl, type: clip.mediaType ?? 'video', id: clip.id }, resolvedBlend, (clip.opacity ?? 1) * layer.opacity, layer.id);
    } else if (clip.type === 'shader' && clip.shaderSrc) {
      // forceOn: always load shader; else toggle (load if was off, clear if was on)
      const shouldLoad = forceOn ? true : !isCurrentlyActive;
      onLayerShader?.(
        layerIdx,
        shouldLoad ? clip.shaderSrc : null,
        resolvedBlend,
        (clip.opacity ?? 1) * layer.opacity,
        clip.params ?? [0.5, 0.5, 0.5, 0.5],
      );
    } else if (clip.type === 'color' && clip.fillColor) {
      onSetLayerMedia(layerIdx, null, undefined, undefined, layer.id);
    }
  }, [onApply, onSetLayerMedia, onLayerShader, globalBlendActive]);

  // Stop all program outputs from a column and clear its activeCol across all layers.
  // Called before launching a new scene so the previous column goes dark.
  const clearColumn = useCallback((colIdx: number, lrs: LauncherLayer[]) => {
    lrs.forEach((layer, li) => {
      if (layer.activeCol !== colIdx) return; // layer wasn't driven by this column
      const clip = layer.clips[colIdx];
      if (!clip || layer.bypassed || layer.muted) return;
      if (clip.type === 'shader') {
        onLayerShader?.(li, null, 'normal', 1, [0.5, 0.5, 0.5, 0.5]);
      } else if (clip.type === 'milkdrop') {
        if (milkRef.current.enabled) milkRef.current.onToggle(); // force OFF
      } else if (clip.type === 'media') {
        onSetLayerMedia(li, null, undefined, undefined, layer.id);
      }
      // generators intentionally not cleared — the visualizer mode persists until a new one is set
    });
    setLayers(prev => prev.map(l => ({
      ...l,
      activeCol: l.activeCol === colIdx ? null : l.activeCol,
    })));
  }, [onLayerShader, onSetLayerMedia]);

  // ── Scene launch — exclusive: only ONE column drives program out at a time ──
  const launchScene = useCallback((colIdx: number) => {
    const lrs = layersRef.current;
    const prevCol = activeSceneColRef.current;

    // Tear down the previous scene column before firing the next
    if (prevCol !== null && prevCol !== colIdx) {
      clearColumn(prevCol, lrs);
    }

    // Force-activate every row in the new column (no toggle, always on)
    lrs.forEach((_, li) => fireClip(li, colIdx, lrs, true));

    activeSceneColRef.current = colIdx;
  }, [clearColumn, fireClip]);

  // Stable ref so automation effects always call the latest launchScene without
  // listing it as a dependency (which would restart the effect on every fire).
  const launchSceneRef = useRef<(colIdx: number) => void>(() => {});
  useEffect(() => { launchSceneRef.current = launchScene; }, [launchScene]);
  const fireClipRef = useRef<typeof fireClip>(fireClip);
  useEffect(() => { fireClipRef.current = fireClip; }, [fireClip]);

  // Config value refs — beat mode reads these instead of capturing stale closures
  const sceneAutoBarsRef = useRef(sceneAutoBars);
  useEffect(() => { sceneAutoBarsRef.current = sceneAutoBars; }, [sceneAutoBars]);
  const rotationMusicGovernRef = useRef(config.rotationMusicGovern);
  useEffect(() => { rotationMusicGovernRef.current = config.rotationMusicGovern; }, [config.rotationMusicGovern]);

  // ── Row automation timers ────────────────────────────────────────────────────
  // Sequential mode marches through ALL columns left-to-right (same scene order
  // as the launcher grid), so every auto-enabled row stays in the same column.
  // fireClip is accessed via fireClipRef so the interval never restarts on a fire.
  useEffect(() => {
    const intervals: ReturnType<typeof setInterval>[] = [];
    layers.forEach((layer, li) => {
      if (!layer.autoMode || layer.autoMode === 'off') return;
      const ms = (layer.autoInterval ?? 4) * 1000;
      const id = setInterval(() => {
        const lrs = layersRef.current;
        const l = lrs[li];
        if (!l || !l.autoMode || l.autoMode === 'off' || l.bypassed || l.muted) return;
        const cc = lrs[0]?.clips.length ?? NUM_COLS;
        let nextCol: number;
        if (l.autoMode === 'random') {
          const filled = l.clips.map((c, i) => c ? i : -1).filter(i => i >= 0);
          if (filled.length === 0) return;
          nextCol = filled[Math.floor(Math.random() * filled.length)];
        } else {
          // Advance through all columns in scene order (left to right) so all
          // rows cycle in sync with the clip launcher column progression.
          nextCol = ((l.activeCol ?? -1) + 1 + cc) % cc;
          for (let t = 0; t < cc; t++) {
            if (l.clips[nextCol] != null) break;
            nextCol = (nextCol + 1) % cc;
          }
          if (l.clips[nextCol] == null) return; // row has no clips at all
        }
        fireClipRef.current(li, nextCol, lrs);
      }, ms);
      intervals.push(id);
    });
    return () => intervals.forEach(clearInterval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers.map(l => `${l.id}:${l.autoMode}:${l.autoInterval}`).join(',')]);

  // ── Scene automation — time mode ────────────────────────────────────────────
  // launchScene is intentionally NOT in deps — we use launchSceneRef to call the
  // latest version without restarting the interval every time it fires a scene.
  useEffect(() => {
    if (sceneAutoMode === 'off' || sceneAutoTrigger !== 'time') return;
    const ms = sceneAutoInterval * 1000;
    const id = setInterval(() => {
      const lrs = layersRef.current;
      const cc = lrs[0]?.clips.length ?? NUM_COLS;
      let nextCol: number;
      if (sceneAutoMode === 'random') {
        // Only pick columns that actually have content
        const nonEmpty = Array.from({ length: cc }, (_, i) => i)
          .filter(c => lrs.some(l => l.clips[c] != null));
        nextCol = nonEmpty.length > 0
          ? nonEmpty[Math.floor(Math.random() * nonEmpty.length)]
          : Math.floor(Math.random() * cc);
      } else {
        // Sequential — advance, skipping empty columns
        let candidate = (sceneAutoColRef.current + 1) % cc;
        for (let t = 0; t < cc; t++) {
          if (lrs.some(l => l.clips[candidate] != null)) break;
          candidate = (candidate + 1) % cc;
        }
        sceneAutoColRef.current = candidate;
        nextCol = candidate;
      }
      launchSceneRef.current(nextCol);
    }, ms);
    return () => clearInterval(id);
  }, [sceneAutoMode, sceneAutoTrigger, sceneAutoInterval]);

  // ── Scene automation — beat mode ─────────────────────────────────────────────
  // Derives live BPM from rolling beat-interval averaging, fires scene changes on
  // exact bar boundaries. Uses launchSceneRef so firing a scene never restarts the
  // effect (which would reset nextSceneAt → infinite stuck-on-scene-0 loop).
  useEffect(() => {
    if (sceneAutoMode === 'off' || sceneAutoTrigger !== 'beat' || !analyser) return;

    const sampler = new AudioDriverSampler();
    let rafId: number;

    // Start the clock immediately — don't wait for a beat to arrive before the
    // first scene fires. Uses sceneAutoBarsRef so bar length updates live, and
    // sampler.bpm so the bar grid tracks the live tempo driver.
    const barMs = () => (60000 / sampler.bpm) * 4 * sceneAutoBarsRef.current;
    let nextSceneAt = performance.now() + barMs();

    const tick = () => {
      const now = performance.now();
      sampler.update(analyser, now);  // live tempo / intensity / beat detection

      // Music govern: intense bass nudges the next fire slightly sooner
      if (rotationMusicGovernRef.current && sampler.intensity > 0.78) {
        const remaining = nextSceneAt - now;
        if (remaining > 800) nextSceneAt -= remaining * 0.04;
      }

      // Fire on bar boundary — advance to next non-empty column
      if (now >= nextSceneAt) {
        const lrs = layersRef.current;
        const cc = lrs[0]?.clips.length ?? NUM_COLS;
        let nextCol: number;
        if (sceneAutoMode === 'random') {
          const nonEmpty = Array.from({ length: cc }, (_, i) => i)
            .filter(c => lrs.some(l => l.clips[c] != null));
          nextCol = nonEmpty.length > 0
            ? nonEmpty[Math.floor(Math.random() * nonEmpty.length)]
            : Math.floor(Math.random() * cc);
        } else {
          let candidate = (sceneAutoColRef.current + 1) % cc;
          for (let t = 0; t < cc; t++) {
            if (lrs.some(l => l.clips[candidate] != null)) break;
            candidate = (candidate + 1) % cc;
          }
          sceneAutoColRef.current = candidate;
          nextCol = candidate;
        }
        launchSceneRef.current(nextCol);
        // Lock to bar grid from exact fire time, not real-time drift
        nextSceneAt += barMs();
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
    // sceneAutoBars/rotationMusicGovern/launchScene intentionally excluded — stable
    // refs are used instead so the effect never restarts when those values change.
  }, [sceneAutoMode, sceneAutoTrigger, analyser]);

  // ── Driver bus — scene + row target mappings (Steps 3–4) ──────────────────────
  // A single rAF loop that samples the audio drivers, derives a 0–1 signal per
  // driver, and applies every enabled mapping independently:
  //   • scene targets → advance the active column on the driver's schedule (Step 3)
  //   • row targets   → modulate layer opacity / shader params live (Step 4)
  // Additive to the legacy Scene Automation panel (left untouched, so it can't
  // regress). Restarts only when the *structure* of enabled mappings changes;
  // depth/rate read live from mappingsRef so dragging a slider never resets the
  // scheduling clocks or signal envelopes.
  const mappingKey = mappings
    .filter(m => m.enabled)
    .map(m => `${m.id}:${m.driver}:${m.target}:${m.targetLayerId ?? ''}:${m.targetParamIdx ?? ''}`)
    .join(',');
  useEffect(() => {
    if (!mappingKey) return; // no enabled mappings → bus idle

    const sampler = new AudioDriverSampler();
    let rafId: number;
    let lastNow = performance.now();

    // Shared per-driver signal state — computed once per frame, reused by every mapping.
    let beatEnv  = 0; // decaying pulse: 1 on onset, falls toward 0
    let lfoPhase = 0; // tempo LFO phase, in cycles
    let barPhase = 0; // measure sawtooth, 0–1 across one bar

    // Tempo-grid helpers — effect-scoped so both getSched (initial delay) and tick
    // (rescheduling) can use them. Read sampler.bpm live at call time.
    const beatMs = (beats: number) => (60000 / sampler.bpm) * beats;
    const barMs  = (bars: number)  => (60000 / sampler.bpm) * 4 * bars;

    // Per-mapping state: scene scheduling + last pushed row value (push throttle).
    type Sched = { nextAt: number; beatAcc: number; lastFire: number; lastPush: number };
    const sched = new Map<string, Sched>();
    const getSched = (id: string, now: number): Sched => {
      let s = sched.get(id);
      if (!s) {
        // Don't fire on the first frame — start the clock one cycle out so the
        // user has time to observe and react before the first scene advance.
        const m = mappingsRef.current.find(mp => mp.id === id);
        let initDelay = 0;
        if (m?.target === 'scene') {
          const r = m.rate ?? defaultRate(m.driver);
          if (m.driver === 'measure') initDelay = barMs(r);
          else if (m.driver === 'tempo') initDelay = beatMs(r);
          else initDelay = 2000; // intensity/beat: 2s grace on load
        }
        s = { nextAt: now + initDelay, beatAcc: 0, lastFire: 0, lastPush: -1 };
        sched.set(id, s);
      }
      return s;
    };

    // Advance to the next non-empty column after the bus's current position.
    const advanceScene = () => {
      const lrs = layersRef.current;
      const cc = lrs[0]?.clips.length ?? NUM_COLS;
      let candidate = (busSceneColRef.current + 1) % cc;
      for (let t = 0; t < cc; t++) {
        if (lrs.some(l => l.clips[candidate] != null)) break;
        candidate = (candidate + 1) % cc;
      }
      busSceneColRef.current = candidate;
      launchSceneRef.current(candidate);
    };

    const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastNow) / 1000); // seconds, capped to survive tab stalls
      lastNow = now;
      // Audio-driven values only update with an analyser. Without one, bpm stays at
      // its 120 default (clock drivers keep running) while isBeat/intensity stay 0.
      if (analyser) sampler.update(analyser, now);

      // ── Derive the shared 0–1 driver signals for this frame ──
      if (sampler.isBeat) beatEnv = 1; else beatEnv = Math.max(0, beatEnv - dt * 4); // ~250ms decay
      lfoPhase = (lfoPhase + (sampler.bpm / 60) * dt) % 1;
      const barLenSec = (60 / sampler.bpm) * 4;
      barPhase = (barPhase + dt / barLenSec) % 1;
      const signalFor = (driver: DriverKind): number => {
        if (driver === 'intensity') return sampler.intensity;
        if (driver === 'beat')      return beatEnv;
        if (driver === 'tempo')     return (Math.sin(2 * Math.PI * lfoPhase) + 1) / 2;
        return barPhase; // measure — sawtooth across the bar
      };

      const beatNow = sampler.isBeat;
      const lrs     = layersRef.current;

      for (const m of mappingsRef.current) {
        if (!m.enabled) continue;
        const s = getSched(m.id, now);

        // ── Scene targets (Step 3) ──
        // Respect the legacy "SCENE AUTO" off switch — if it's off, no automation
        // pathway (legacy OR driver matrix) should advance scenes.
        if (m.target === 'scene') {
          if (sceneAutoModeRef.current === 'off') continue;
          const rate = m.rate ?? defaultRate(m.driver);
          let fire = false;
          if (m.driver === 'beat') {
            if (beatNow) { s.beatAcc++; if (s.beatAcc >= rate) { s.beatAcc = 0; fire = true; } }
          } else if (m.driver === 'measure') {
            if (now >= s.nextAt) { fire = true; s.nextAt = now + barMs(rate); }
          } else if (m.driver === 'tempo') {
            if (now >= s.nextAt) { fire = true; s.nextAt = now + beatMs(rate); }
          } else if (m.driver === 'intensity') {
            const threshold = 0.5 + (1 - m.depth) * 0.4; // depth 1 → 0.5, depth 0 → 0.9
            if (sampler.intensity > threshold && (now - s.lastFire) > 250) { fire = true; s.lastFire = now; }
          }
          if (fire) advanceScene();
          continue;
        }

        // ── Row targets (Step 4) ──
        const layerIdx = lrs.findIndex(l => l.id === m.targetLayerId);
        if (layerIdx === -1) continue;
        const layer = lrs[layerIdx];
        if (layer.bypassed || layer.muted) continue;
        const signal     = signalFor(m.driver);
        const activeClip = layer.activeCol != null ? layer.clips[layer.activeCol] : null;

        if (m.target === 'rowParam') {
          // Modulate a shader param around its set base. Live-applicable only to an
          // active shader clip (onShaderParamsChange doesn't reset shader time).
          if (activeClip?.type !== 'shader') continue;
          const idx  = m.targetParamIdx ?? 0;
          const base = activeClip.params?.[idx] ?? 0.5;
          const out  = clamp01(base * (1 - m.depth) + signal * m.depth);
          if (Math.abs(out - s.lastPush) < 0.004) continue; // skip redundant setstates
          s.lastPush = out;
          const newParams = [...(activeClip.params ?? [0.5, 0.5, 0.5, 0.5])];
          newParams[idx] = out;
          onShaderParamsChange?.(layerIdx, newParams);

        } else if (m.target === 'rowOpacity') {
          const base = layer.opacity;
          const out  = clamp01(base * ((1 - m.depth) + m.depth * signal));
          // Record for the real composite (Step 5 reads layerModRef for every layer type).
          layerModRef.current[m.targetLayerId!] = { ...(layerModRef.current[m.targetLayerId!] ?? {}), opacity: out };
          if (Math.abs(out - s.lastPush) < 0.004) continue; // skip redundant pushes
          s.lastPush = out;
          // Route to whichever live surface fits the layer's active clip:
          //   milkdrop → its dedicated opacity setter; everything else → the Studio
          //   modulation pipe (Step 5a), which applies it to shader layers today.
          if (activeClip?.type === 'milkdrop' && milkRef.current.enabled) {
            milkRef.current.onSetOpacity?.(out);
          } else {
            onLayerModulation?.(layerIdx, m.targetLayerId!, { opacity: out });
          }

        } else if (m.target === 'rowBlendAmount') {
          // No blend-amount in the composite yet — recorded for Step 5.
          layerModRef.current[m.targetLayerId!] = { ...(layerModRef.current[m.targetLayerId!] ?? {}), blendAmount: clamp01(signal * m.depth) };
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
    // Only mappingKey + analyser in deps — depth/rate read live via mappingsRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mappingKey, analyser]);

  // ── Add / remove layer ──────────────────────────────────────────────────────
  const addLayer = useCallback(() => {
    setLayers(prev => {
      const n = prev.length + 1;
      return [...prev, {
        id:        `layer-${Date.now()}`,
        name:      `LAYER ${n}`,
        blendMode: 'Screen',
        opacity:   1,
        bypassed:  false,
        muted:     false,
        clips:     Array(NUM_COLS).fill(null),
        activeCol: null,
      }];
    });
  }, []);

  const deleteLayer = useCallback((li: number) => {
    setLayers(prev => prev.filter((_, i) => i !== li));
  }, []);

  // ── Driver matrix mappings (Step 2: editor state only, not yet live) ──────────
  const addMapping = useCallback(() => {
    setMappings(prev => [...prev, makeMapping({ targetLayerId: layersRef.current[0]?.id })]);
  }, []);
  const updateMapping = useCallback((id: string, patch: Partial<Mapping>) => {
    setMappings(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m));
  }, []);
  const deleteMapping = useCallback((id: string) => {
    setMappings(prev => prev.filter(m => m.id !== id));
  }, []);

  // ── Update single clip field ────────────────────────────────────────────────
  const updateClip = useCallback((li: number, ci: number, patch: Partial<LauncherClip>) => {
    setLayers(prev => prev.map((l, i) =>
      i === li ? {
        ...l,
        clips: l.clips.map((c, ci2) => ci2 === ci && c ? { ...c, ...patch } : c),
      } : l
    ));
  }, []);

  // ── MIDI ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let flashTimer: ReturnType<typeof setTimeout>;
    let activeTimer: ReturnType<typeof setTimeout>;

    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail as MidiEventData;
      if (!d) return;
      const note = d.note;
      if (note < 60 || note > 75) return;
      const padIdx = note - 60;
      const row    = padIdx >> 2;
      const col    = padIdx % 4;

      setFlashedPads(prev => new Set([...prev, padIdx]));
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => setFlashedPads(new Set()), 180);

      setMidiActive(true);
      clearTimeout(activeTimer);
      activeTimer = setTimeout(() => setMidiActive(false), 800);

      if (row === 3) launchScene(col);
      else           fireClip(row, col);
    };

    window.addEventListener('plajah-midi-note-on', handler);
    return () => {
      window.removeEventListener('plajah-midi-note-on', handler);
      clearTimeout(flashTimer);
      clearTimeout(activeTimer);
    };
  }, [fireClip, launchScene]);

  // ── Layer update ────────────────────────────────────────────────────────────
  const updateLayer = useCallback((li: number, patch: Partial<LauncherLayer>) => {
    setLayers(prev => prev.map((l, i) => i === li ? { ...l, ...patch } : l));
  }, []);

  // ── Drop / assign ───────────────────────────────────────────────────────────
  const dropMedia = useCallback((li: number, ci: number, file: File) => {
    const blobUrl   = URL.createObjectURL(file);
    const mediaType: 'video' | 'image' = file.type.startsWith('video/') ? 'video' : 'image';
    const clipId    = `media-${li}-${ci}-${Date.now()}`;
    const clip: LauncherClip = {
      id: clipId, type: 'media', name: file.name.replace(/\.[^.]+$/, '').slice(0, 18).toUpperCase(),
      color: '#6366f1', mediaUrl: blobUrl, mediaType, loop: true, opacity: 1,
    };
    if (mediaType === 'video' && !preloadRef.current[blobUrl]) {
      const el = document.createElement('video');
      el.src = blobUrl; el.preload = 'auto'; el.muted = true; el.load();
      preloadRef.current[blobUrl] = el;
    }
    setLayers(prev => prev.map((l, i) =>
      i === li ? { ...l, clips: l.clips.map((c, ci2) => ci2 === ci ? clip : c) } : l
    ));
    // Async: encode as data-URL for persistence (survives page refresh + project save)
    // Skip large videos (>20 MB) to avoid crashing localStorage
    if (file.size < 20 * 1024 * 1024) {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setLayers(prev => prev.map((l, i) =>
          i === li ? { ...l, clips: l.clips.map(c => c?.id === clipId ? { ...c, mediaUrl: dataUrl } : c) } : l
        ));
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const assignClip = useCallback((li: number, ci: number, clip: LauncherClip) => {
    setLayers(prev => prev.map((l, i) =>
      i === li ? { ...l, clips: l.clips.map((c, ci2) => ci2 === ci ? { ...clip, id: `${clip.id}-${Date.now()}` } : c) } : l
    ));
  }, []);

  const clearClip = useCallback((li: number, ci: number) => {
    setLayers(prev => prev.map((l, i) =>
      i === li ? { ...l, clips: l.clips.map((c, ci2) => ci2 === ci ? null : c), activeCol: l.activeCol === ci ? -1 : l.activeCol } : l
    ));
  }, []);

  const copyClipToNext = useCallback((li: number, ci: number) => {
    setLayers(prev => {
      const layer = prev[li];
      if (!layer) return prev;
      const clip = layer.clips[ci];
      if (!clip) return prev;
      const nextCi = ci + 1;
      // Extend columns if needed (up to 20)
      const needsExpand = nextCi >= layer.clips.length;
      if (needsExpand && layer.clips.length >= 20) return prev;
      return prev.map((l, i) => {
        if (i !== li) {
          if (needsExpand) return { ...l, clips: [...l.clips, null] };
          return l;
        }
        const newClips = needsExpand ? [...l.clips, { ...clip, id: `${clip.id}-copy-${Date.now()}` }]
          : l.clips.map((c, idx) => idx === nextCi ? { ...clip, id: `${clip.id}-copy-${Date.now()}` } : c);
        return { ...l, clips: newClips };
      });
    });
  }, []);

  const clearRow = useCallback((li: number) => {
    setLayers(prev => prev.map((l, i) =>
      i === li ? { ...l, clips: l.clips.map(() => null), activeCol: null } : l
    ));
  }, []);

  const clearScene = useCallback((ci: number) => {
    setLayers(prev => prev.map(l => ({
      ...l,
      clips: l.clips.map((c, i) => i === ci ? null : c),
      activeCol: l.activeCol === ci ? null : l.activeCol,
    })));
  }, []);

  // ── Scroll ──────────────────────────────────────────────────────────────────
  const canScrollLeft  = scrollLeft > 0;
  const canScrollRight = scrollLeft < (colCount - 4) * STEP;
  const scrollBy = (dir: 1 | -1) =>
    setScrollLeft(s => Math.max(0, Math.min((colCount - 4) * STEP, s + dir * STEP * 4)));
  const visibleColStart = Math.round(scrollLeft / STEP);

  const milkdropForBrowser: MilkdropControls = useMemo(() => ({
    ...milkdrop,
    onSetIdx: milkdrop.onSetIdx,
  }), [milkdrop]);

  // Close scene context menu on outside click
  useEffect(() => {
    if (!sceneMenu) return;
    const close = () => setSceneMenu(null);
    window.addEventListener('click', close, { once: true });
    return () => window.removeEventListener('click', close);
  }, [sceneMenu]);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="w-full h-full flex" style={{ background: '#0a0a12' }}>

      {/* ── Hover-preview popup — a small LIVE mini-render that follows the
          cursor. Auditions the hovered source/clip without ever touching the
          program canvas. ── */}
      {hoverSource && (
        <div
          ref={hoverPopRef}
          className="fixed z-[600] pointer-events-none rounded-lg overflow-hidden shadow-2xl"
          style={{
            left: -9999, top: -9999,
            width: POP_W, height: POP_H,
            background: '#000',
            border: `1px solid ${hoverSource.color ?? '#FF8C00'}88`,
            boxShadow: `0 0 24px ${hoverSource.color ?? '#FF8C00'}55`,
          }}
        >
          <div className="absolute inset-0">
            <LayerSource clip={hoverSource} analyser={analyser ?? null} config={config} isPlaying />
          </div>
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-2 py-1"
            style={{ background: 'linear-gradient(180deg,rgba(0,0,0,0.7),transparent)' }}>
            <span className="text-[8px] font-black uppercase tracking-widest truncate" style={{ color: hoverSource.color ?? '#fff' }}>
              {hoverSource.name}
            </span>
            <span className="text-[6px] font-black uppercase tracking-widest text-white/40">Preview</span>
          </div>
          {!analyser && (hoverSource.type === 'generator' || hoverSource.type === 'milkdrop' || hoverSource.type === 'shader') && (
            <div className="absolute inset-0 flex items-center justify-center text-[7px] uppercase tracking-widest text-white/30 text-center px-3">
              Load audio to preview live
            </div>
          )}
        </div>
      )}

      {/* Scene context menu */}
      {sceneMenu && (
        <div
          className="fixed z-[500] rounded-xl overflow-hidden border border-white/10 shadow-2xl"
          style={{ top: sceneMenu.y, left: sceneMenu.x, background: 'rgba(6,6,18,0.97)', backdropFilter: 'blur(16px)', minWidth: 180 }}
          onClick={e => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 border-b border-white/07">
            <span className="text-[8px] font-black uppercase tracking-widest text-white/30">SCENE {sceneMenu.col + 1}</span>
          </div>
          <button
            onClick={() => { launchScene(sceneMenu.col); setSceneMenu(null); }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-white/70 hover:text-white hover:bg-white/10 transition-all text-left"
          >
            <Play className="w-3 h-3" /> Launch scene
          </button>
          <button
            onClick={() => { clearScene(sceneMenu.col); setSceneMenu(null); }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-orange-400 hover:text-orange-300 hover:bg-orange-500/10 transition-all text-left border-t border-white/05"
          >
            <Trash2 className="w-3 h-3" /> Clear scene
          </button>
        </div>
      )}

      {/* ── Main clip area ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Scene launch bar */}
        <div className="flex items-center shrink-0 gap-1 px-2"
          style={{ height: 34, borderBottom: '1px solid rgba(255,255,255,0.07)', background: '#080810' }}>
          <button onClick={() => scrollBy(-1)} disabled={!canScrollLeft}
            className="w-5 h-5 flex items-center justify-center rounded text-white/30 hover:text-white disabled:opacity-20 transition-all">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          {/* Scene buttons — all columns, translate in sync with clip cells.
               Offset = sidebar(160) - outer-px2(8) - chevron-w5(20) - gap1(4) = 128 */}
          <div className="flex-1 overflow-hidden" style={{ marginLeft: 128 }}>
            <div className="flex gap-1 px-1" style={{ transform: `translateX(-${scrollLeft}px)`, willChange: 'transform' }}>
              {Array.from({ length: colCount }, (_, absCol) => {
                const anyActive = layers.some(l => l.activeCol === absCol && !l.bypassed && !l.muted);
                return (
                  <button
                    key={absCol}
                    onClick={() => launchScene(absCol)}
                    onContextMenu={e => { e.preventDefault(); setSceneMenu({ x: e.clientX, y: e.clientY, col: absCol }); }}
                    className="flex-shrink-0 flex items-center justify-center text-[10px] font-black uppercase tracking-widest rounded transition-all"
                    style={{
                      width: CELL_W, height: 26,
                      background: anyActive ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.04)',
                      border: anyActive ? '1px solid #FF8C00' : '1px solid rgba(255,255,255,0.08)',
                      color: anyActive ? '#c084fc' : 'rgba(255,255,255,0.25)',
                    }}
                    title={`Launch scene ${absCol + 1} — right-click to clear`}
                  >
                    ▶ {absCol + 1}
                  </button>
                );
              })}
            </div>
          </div>

          <button onClick={() => scrollBy(1)} disabled={!canScrollRight}
            className="w-5 h-5 flex items-center justify-center rounded text-white/30 hover:text-white disabled:opacity-20 transition-all">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          {/* Add column */}
          <button
            onClick={() => {
              if (colCount >= 20) return;
              setLayers(prev => prev.map(l => ({ ...l, clips: [...l.clips, null] })));
            }}
            disabled={colCount >= 20}
            className="w-5 h-5 flex items-center justify-center rounded text-[9px] font-black transition-all ml-1"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: colCount >= 20 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.3)',
            }}
            title={colCount >= 20 ? 'Maximum 20 columns reached' : 'Add column'}
          >
            +
          </button>

          {/* Scene automation controls */}
          <div className="flex items-center gap-1 ml-2 shrink-0">
            <button
              onClick={() => {
                const modes: ('off' | 'next' | 'random')[] = ['off', 'next', 'random'];
                const cur = modes.indexOf(sceneAutoMode);
                setSceneAutoMode(modes[(cur + 1) % modes.length]);
              }}
              className="flex items-center gap-0.5 px-1.5 h-5 rounded text-[7px] font-black uppercase tracking-widest transition-all"
              style={{
                background: sceneAutoMode !== 'off' ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.04)',
                border: sceneAutoMode !== 'off' ? '1px solid rgba(139,92,246,0.5)' : '1px solid rgba(255,255,255,0.08)',
                color: sceneAutoMode !== 'off' ? '#c084fc' : 'rgba(255,255,255,0.2)',
              }}
              title="Scene Automation: cycle OFF → NEXT → RANDOM"
            >
              {sceneAutoMode === 'off' ? '⏸ SCENE' : sceneAutoMode === 'next' ? '▶ SCENE' : '⁂ SCENE'}
            </button>
            {sceneAutoMode !== 'off' && (
              <>
                {/* Time/Beat toggle */}
                <button
                  onClick={() => setSceneAutoTrigger(t => t === 'time' ? 'beat' : 'time')}
                  className="px-1 h-5 rounded text-[6px] font-black uppercase tracking-widest transition-all"
                  style={{
                    background: sceneAutoTrigger === 'beat' ? 'rgba(251,146,60,0.25)' : 'rgba(255,255,255,0.04)',
                    border: sceneAutoTrigger === 'beat' ? '1px solid rgba(251,146,60,0.5)' : '1px solid rgba(255,255,255,0.08)',
                    color: sceneAutoTrigger === 'beat' ? '#fb923c' : 'rgba(255,255,255,0.3)',
                  }}
                  title={sceneAutoTrigger === 'beat' ? 'Beat mode — click for time mode' : 'Time mode — click for beat mode'}
                >
                  {sceneAutoTrigger === 'beat' ? '♩ BEAT' : '⏱ TIME'}
                </button>
                {sceneAutoTrigger === 'time' ? (
                  <input
                    type="number" min="1" max="60" step="1"
                    value={sceneAutoInterval}
                    onChange={e => setSceneAutoInterval(Math.max(1, Math.min(60, Number(e.target.value))))}
                    className="w-8 bg-transparent border border-white/10 rounded text-[7px] text-center text-white/50 outline-none"
                    title="Scene interval in seconds"
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <select
                    value={sceneAutoBars}
                    onChange={e => setSceneAutoBars(Number(e.target.value) as 2 | 4 | 8 | 16)}
                    className="bg-transparent border border-white/10 rounded text-[6px] text-orange-300/70 outline-none cursor-pointer"
                    style={{ paddingLeft: 2, paddingRight: 2, height: 20 }}
                    title="Bars between scene changes"
                    onClick={e => e.stopPropagation()}
                  >
                    <option value={2}>2 bars</option>
                    <option value={4}>4 bars</option>
                    <option value={8}>8 bars</option>
                    <option value={16}>16 bars</option>
                  </select>
                )}
              </>
            )}
          </div>

          {/* Global Blend Overlay toggle */}
          <button
            onClick={toggleBlend}
            className="flex items-center gap-0.5 px-1.5 h-5 rounded text-[7px] font-black uppercase tracking-widest transition-all ml-2 shrink-0"
            style={{
              background: globalBlendActive ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.04)',
              border:     globalBlendActive ? '1px solid rgba(16,185,129,0.5)' : '1px solid rgba(255,255,255,0.1)',
              color:      globalBlendActive ? '#34d399' : 'rgba(255,255,255,0.2)',
              boxShadow:  globalBlendActive ? '0 0 6px rgba(16,185,129,0.25)' : 'none',
            }}
            title="Global Blend Overlay — toggles blend compositing across all layers and columns"
          >
            ⊕ BLEND
          </button>

          {/* MIDI indicator */}
          <div className="flex items-center gap-1.5 ml-2 shrink-0">
            <Radio className={`w-3 h-3 ${midiActive ? 'text-green-400' : 'text-white/15'}`} />
            <span className="text-[7px] font-mono"
              style={{ color: midiActive ? 'rgba(74,222,128,0.7)' : 'rgba(255,255,255,0.12)' }}>
              {midiActive ? 'MIDI' : 'P1–P12'}
            </span>
          </div>

          {/* Power button */}
          {onPowerOff && (
            <button
              onClick={onPowerOff}
              className="w-6 h-6 ml-2 flex items-center justify-center rounded-full shrink-0 transition-all hover:scale-110"
              style={{
                background: 'rgba(239,68,68,0.15)',
                border:     '1px solid rgba(239,68,68,0.5)',
                color:      '#f87171',
              }}
              title="Power off Clip Launcher — returns to fly-drawer mode"
            >
              <Power className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Layer rows (rendered bottom-up) — scrollable so source browser stays pinned */}
        <div className="flex flex-col-reverse overflow-y-auto" style={{ flex: '1 1 0', minHeight: 0 }}>
          {layers.map((layer, li) => (
            <div
              key={layer.id}
              style={{ borderTop: li > 0 ? '1px solid rgba(255,255,255,0.05)' : undefined }}
              onDragOver={e => e.preventDefault()}
            >
              <LayerRow
                layer={layer}
                layerIdx={li}
                scrollLeft={scrollLeft}
                flashedPads={flashedPads}
                onUpdateLayer={patch => updateLayer(li, patch)}
                onUpdateClip={(ci, patch) => updateClip(li, ci, patch)}
                onFireClip={ci => fireClip(li, ci)}
                onDropMedia={(ci, f) => dropMedia(li, ci, f)}
                onAssignClip={(ci, clip) => assignClip(li, ci, clip)}
                onClearClip={ci => clearClip(li, ci)}
                onCopyClip={ci => copyClipToNext(li, ci)}
                onClearRow={() => clearRow(li)}
                onDeleteLayer={() => deleteLayer(li)}
                isDefaultLayer={li < 3}
                onHoverClip={setHoverSource}
              />
            </div>
          ))}
        </div>

        {/* Add Layer button */}
        <div className="flex items-center px-2 shrink-0"
          style={{ height: 30, borderTop: '1px solid rgba(255,255,255,0.05)', background: '#06060f' }}>
          <button
            onClick={addLayer}
            className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest transition-all hover:text-white/70"
            style={{ color: 'rgba(255,255,255,0.25)' }}
            title="Add a new layer above the stack"
          >
            <Plus className="w-3 h-3" /> ADD LAYER
          </button>
        </div>

        {/* Source browser */}
        <SourceBrowser
          milkdropControls={milkdropForBrowser}
          onAssignToLayer={assignClip}
          layers={layers}
          config={config}
          shaderLibrary={shaderLibrary}
          onApplyShader={onApplyShader}
          onPreviewSource={clip => setPreviewSource(clip)}
          onHoverSource={clip => {
            setHoverSource(clip);
            if (clip) {
              if (rightPanelTab !== 'params') {
                prevTabRef.current = rightPanelTab;
                setRightPanelTab('params');
              }
            } else {
              if (prevTabRef.current) {
                setRightPanelTab(prevTabRef.current);
                prevTabRef.current = null;
              }
            }
          }}
        />
      </div>

      {/* ── Right panel (PARAMS + transport/settings) ─────────────────── */}
      {rightPanel && (
        <div
          className="flex-shrink-0 flex flex-col overflow-hidden"
          style={{
            width: 340,
            borderLeft: '1px solid rgba(255,255,255,0.07)',
            background: 'rgba(4,4,12,0.95)',
          }}
        >
          {/* Tab bar */}
          <div className="flex shrink-0" style={{ height: 28, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            {(['params', 'auto', 'transport'] as const).map(t => (
              <button
                key={t}
                onClick={() => setRightPanelTab(t)}
                className="flex-1 text-[8px] font-black uppercase tracking-widest transition-all"
                style={{
                  color: rightPanelTab === t ? '#c084fc' : 'rgba(255,255,255,0.25)',
                  borderBottom: rightPanelTab === t ? '2px solid #FF8C00' : '2px solid transparent',
                  background: 'transparent',
                }}
              >
                {t === 'params' ? '⚙ PARAMS' : t === 'auto' ? '⟳ AUTO' : '♬ CTRL'}
              </button>
            ))}
          </div>

          {rightPanelTab === 'auto' ? (
            /* ── AUTO tab ── */
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4">

              {/* Scene Automation */}
              <div>
                <div className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-2">Scene Automation</div>
                <div className="rounded-xl p-3 flex flex-col gap-2.5" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const modes: ('off' | 'next' | 'random')[] = ['off', 'next', 'random'];
                        setSceneAutoMode(modes[(modes.indexOf(sceneAutoMode) + 1) % modes.length]);
                      }}
                      className="flex-1 py-1 rounded text-[8px] font-black uppercase tracking-widest transition-all"
                      style={{
                        background: sceneAutoMode !== 'off' ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.04)',
                        border: sceneAutoMode !== 'off' ? '1px solid rgba(139,92,246,0.6)' : '1px solid rgba(255,255,255,0.1)',
                        color: sceneAutoMode !== 'off' ? '#c084fc' : 'rgba(255,255,255,0.3)',
                      }}
                    >
                      {sceneAutoMode === 'off' ? '⏸ OFF' : sceneAutoMode === 'next' ? '▶ NEXT' : '⁂ RANDOM'}
                    </button>
                    <button
                      onClick={() => {
                        if (sceneAutoMode === 'off') setSceneAutoMode('next');
                        onSyncSceneAuto?.(sceneAutoInterval);
                      }}
                      className="px-2 py-1 rounded text-[8px] font-black uppercase tracking-widest transition-all"
                      style={{
                        background: 'rgba(14,165,233,0.2)',
                        border: '1px solid rgba(14,165,233,0.4)',
                        color: '#7dd3fc',
                      }}
                      title="Sync interval to Studio Scene Automation"
                    >
                      ⟳ SYNC
                    </button>
                  </div>
                  {/* Trigger mode toggle */}
                  <div className="flex gap-1">
                    {(['time', 'beat'] as const).map(t => (
                      <button key={t}
                        onClick={() => setSceneAutoTrigger(t)}
                        className="flex-1 py-1 rounded text-[7px] font-black uppercase tracking-widest transition-all"
                        style={{
                          background: sceneAutoTrigger === t ? (t === 'beat' ? 'rgba(251,146,60,0.25)' : 'rgba(99,102,241,0.25)') : 'rgba(255,255,255,0.03)',
                          border: sceneAutoTrigger === t ? (t === 'beat' ? '1px solid rgba(251,146,60,0.5)' : '1px solid rgba(99,102,241,0.5)') : '1px solid rgba(255,255,255,0.08)',
                          color: sceneAutoTrigger === t ? (t === 'beat' ? '#fb923c' : '#a5b4fc') : 'rgba(255,255,255,0.2)',
                        }}
                      >
                        {t === 'time' ? '⏱ TIME' : '♩ BEAT'}
                      </button>
                    ))}
                  </div>

                  {sceneAutoTrigger === 'time' ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[7px] uppercase tracking-widest text-white/30 shrink-0">Interval</span>
                      <input
                        type="range" min="1" max="60" step="1"
                        value={sceneAutoInterval}
                        onChange={e => setSceneAutoInterval(Number(e.target.value))}
                        className="flex-1 cursor-pointer"
                        style={{ accentColor: '#FF8C00', height: 14 }}
                      />
                      <input
                        type="number" min="1" max="60" step="1"
                        value={sceneAutoInterval}
                        onChange={e => setSceneAutoInterval(Math.max(1, Math.min(60, Number(e.target.value))))}
                        className="w-9 bg-transparent border border-white/10 rounded text-[8px] text-center text-white/60 outline-none"
                      />
                      <span className="text-[7px] text-white/20 shrink-0">s</span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <div className="text-[7px] text-white/30 uppercase tracking-widest">Bars per scene</div>
                      <div className="grid grid-cols-4 gap-1">
                        {([2, 4, 8, 16] as const).map(b => (
                          <button key={b}
                            onClick={() => setSceneAutoBars(b)}
                            className="py-1 rounded text-[8px] font-black uppercase tracking-widest transition-all"
                            style={{
                              background: sceneAutoBars === b ? 'rgba(251,146,60,0.3)' : 'rgba(255,255,255,0.04)',
                              border: sceneAutoBars === b ? '1px solid rgba(251,146,60,0.6)' : '1px solid rgba(255,255,255,0.08)',
                              color: sceneAutoBars === b ? '#fb923c' : 'rgba(255,255,255,0.3)',
                            }}
                          >
                            {b} bar{b > 1 ? 's' : ''}
                          </button>
                        ))}
                      </div>
                      {!analyser && (
                        <div className="text-[7px] text-orange-400/60 leading-snug">No audio — connect audio to enable beat sync</div>
                      )}
                      <div className="text-[7px] text-white/20 leading-snug">BPM is derived live from the music. Scenes lock to bar grid.</div>
                      {config.rotationMusicGovern && (
                        <div className="text-[7px] text-[#FF8C00]/50">Music govern: intense passages accelerate scene advance</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Driver Matrix — map any driver → any target (Step 2: editor only, not yet live) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[8px] font-black uppercase tracking-widest text-white/30">Driver Matrix</span>
                  <button
                    onClick={addMapping}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest transition-all"
                    style={{ background: 'rgba(34,211,238,0.15)', border: '1px solid rgba(34,211,238,0.4)', color: '#67e8f9' }}
                    title="Add a driver → target mapping"
                  >
                    <Plus className="w-2.5 h-2.5" /> MAP
                  </button>
                </div>

                {mappings.length === 0 ? (
                  <div
                    className="rounded-xl p-3 text-[7px] text-white/25 leading-relaxed text-center"
                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)' }}
                  >
                    No mappings yet. Add one to route a driver
                    (measure · tempo · intensity · beat) onto a target —
                    <br />e.g. intensity → layer opacity, or tempo → scene advance.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {mappings.map(m => {
                      const dk = DRIVER_KINDS.find(d => d.id === m.driver)!;
                      const tk = TARGET_KINDS.find(t => t.id === m.target)!;
                      return (
                        <div
                          key={m.id}
                          className="rounded-xl p-2.5 flex flex-col gap-2"
                          style={{ background: `${dk.color}0d`, border: `1px solid ${dk.color}33`, opacity: m.enabled ? 1 : 0.5 }}
                        >
                          {/* driver → target */}
                          <div className="flex items-center gap-1.5">
                            <select
                              value={m.driver}
                              onChange={e => updateMapping(m.id, { driver: e.target.value as DriverKind })}
                              className="flex-1 text-[7px] font-black uppercase rounded appearance-none px-1.5 py-1 cursor-pointer outline-none"
                              style={{ background: 'rgba(0,0,0,0.4)', border: `1px solid ${dk.color}44`, color: dk.color }}
                            >
                              {DRIVER_KINDS.map(d => <option key={d.id} value={d.id} className="bg-zinc-900">{d.label}</option>)}
                            </select>
                            <span className="text-[9px] text-white/30 shrink-0">→</span>
                            <select
                              value={m.target}
                              onChange={e => {
                                const target = e.target.value as TargetKind;
                                const patch: Partial<Mapping> = { target };
                                if (isRowTarget(target) && !m.targetLayerId) patch.targetLayerId = layersRef.current[0]?.id;
                                updateMapping(m.id, patch);
                              }}
                              className="flex-1 text-[7px] font-black uppercase rounded appearance-none px-1.5 py-1 cursor-pointer outline-none"
                              style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)' }}
                            >
                              {TARGET_KINDS.map(t => <option key={t.id} value={t.id} className="bg-zinc-900">{t.label}</option>)}
                            </select>
                            <button
                              onClick={() => deleteMapping(m.id)}
                              className="w-4 h-4 flex items-center justify-center rounded text-white/20 hover:text-red-400 transition-colors shrink-0"
                              title="Remove mapping"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </div>

                          {/* rate selector for clock/beat scene targets */}
                          {m.target === 'scene' && m.driver !== 'intensity' && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[7px] uppercase tracking-widest text-white/30 shrink-0">Every</span>
                              <select
                                value={m.rate ?? defaultRate(m.driver)}
                                onChange={e => updateMapping(m.id, { rate: Number(e.target.value) })}
                                className="text-[7px] font-bold uppercase rounded appearance-none px-1.5 py-1 cursor-pointer outline-none"
                                style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.55)' }}
                              >
                                {sceneRateOptions(m.driver).map(r => (
                                  <option key={r} value={r} className="bg-zinc-900">
                                    {r} {m.driver === 'measure' ? (r > 1 ? 'BARS' : 'BAR') : (r > 1 ? 'BEATS' : 'BEAT')}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          {/* layer + param selectors for row targets */}
                          {tk.needsLayer && (
                            <div className="flex items-center gap-1.5">
                              <select
                                value={m.targetLayerId ?? ''}
                                onChange={e => updateMapping(m.id, { targetLayerId: e.target.value })}
                                className="flex-1 text-[7px] font-bold uppercase rounded appearance-none px-1.5 py-1 cursor-pointer outline-none"
                                style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.55)' }}
                              >
                                {layers.map(l => <option key={l.id} value={l.id} className="bg-zinc-900">{l.name}</option>)}
                              </select>
                              {tk.needsParam && (
                                <select
                                  value={m.targetParamIdx ?? 0}
                                  onChange={e => updateMapping(m.id, { targetParamIdx: Number(e.target.value) })}
                                  className="text-[7px] font-bold uppercase rounded appearance-none px-1.5 py-1 cursor-pointer outline-none shrink-0"
                                  style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.55)' }}
                                >
                                  {['A', 'B', 'C', 'D'].map((p, i) => <option key={p} value={i} className="bg-zinc-900">PARAM {p}</option>)}
                                </select>
                              )}
                            </div>
                          )}

                          {/* depth + enable */}
                          <div className="flex items-center gap-2">
                            <span className="text-[7px] uppercase tracking-widest text-white/30 shrink-0">Depth</span>
                            <input
                              type="range" min="0" max="100" step="1"
                              value={Math.round(m.depth * 100)}
                              onChange={e => updateMapping(m.id, { depth: Number(e.target.value) / 100 })}
                              className="flex-1 cursor-pointer"
                              style={{ accentColor: dk.color, height: 12 }}
                            />
                            <span className="text-[7px] font-mono text-white/40 w-6 text-right shrink-0">{Math.round(m.depth * 100)}</span>
                            <button
                              onClick={() => updateMapping(m.id, { enabled: !m.enabled })}
                              className="px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest transition-all shrink-0"
                              style={{
                                background: m.enabled ? `${dk.color}25` : 'rgba(255,255,255,0.04)',
                                border:     m.enabled ? `1px solid ${dk.color}66` : '1px solid rgba(255,255,255,0.1)',
                                color:      m.enabled ? dk.color : 'rgba(255,255,255,0.25)',
                              }}
                            >
                              {m.enabled ? 'ON' : 'OFF'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    <div className="text-[6px] text-white/20 leading-relaxed text-center px-2">
                      Live: scene advance · shader params · milkdrop opacity.
                      Media-layer opacity &amp; blend amount apply once the real composite lands (Step 5).
                    </div>
                  </div>
                )}
              </div>

              {/* Row Automation */}
              <div>
                <div className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-2">Row Automation</div>
                <div className="flex flex-col gap-2">
                  {layers.map((layer, li) => {
                    const col = LAYER_COLORS[li % LAYER_COLORS.length];
                    return (
                      <div key={layer.id} className="rounded-xl p-3 flex flex-col gap-2" style={{ background: `${col}10`, border: `1px solid ${col}30` }}>
                        {/* Layer name */}
                        <div className="text-[8px] font-black uppercase tracking-widest" style={{ color: col }}>{layer.name}</div>

                        {/* Blend mode + opacity */}
                        <div className="flex items-center gap-2">
                          <select
                            value={layer.blendMode}
                            onChange={e => updateLayer(li, { blendMode: e.target.value })}
                            className="flex-1 text-[7px] font-bold uppercase rounded appearance-none px-1.5 py-1 cursor-pointer outline-none"
                            style={{ background: 'rgba(0,0,0,0.4)', border: `1px solid ${col}40`, color: col }}
                          >
                            {['Normal','Screen','Add','Multiply','Overlay','Soft-Light','Hard-Light','Difference','Exclusion','Lighten','Darken'].map(m => (
                              <option key={m} value={m} className="bg-zinc-900">{m}</option>
                            ))}
                          </select>
                          <span className="text-[7px] text-white/30 shrink-0 w-6 text-right">{Math.round(layer.opacity * 100)}%</span>
                        </div>
                        <input
                          type="range" min="0" max="100" step="1"
                          value={Math.round(layer.opacity * 100)}
                          onChange={e => updateLayer(li, { opacity: Number(e.target.value) / 100 })}
                          className="w-full cursor-pointer"
                          style={{ accentColor: col, height: 12 }}
                        />

                        {/* Row auto mode + interval */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              const modes: ('off' | 'next' | 'random')[] = ['off', 'next', 'random'];
                              const cur = modes.indexOf(layer.autoMode ?? 'off');
                              updateLayer(li, { autoMode: modes[(cur + 1) % modes.length] });
                            }}
                            className="flex-1 py-0.5 rounded text-[7px] font-black uppercase tracking-widest transition-all"
                            style={{
                              background: (layer.autoMode ?? 'off') !== 'off' ? `${col}25` : 'rgba(255,255,255,0.03)',
                              border: (layer.autoMode ?? 'off') !== 'off' ? `1px solid ${col}60` : '1px solid rgba(255,255,255,0.08)',
                              color: (layer.autoMode ?? 'off') !== 'off' ? col : 'rgba(255,255,255,0.2)',
                            }}
                          >
                            {(layer.autoMode ?? 'off') === 'off' ? '⏸ OFF' : layer.autoMode === 'next' ? '▶ NEXT' : '⁂ RND'}
                          </button>
                          {(layer.autoMode ?? 'off') !== 'off' && (
                            <>
                              <input
                                type="number" min="1" max="60" step="1"
                                value={layer.autoInterval ?? 4}
                                onChange={e => updateLayer(li, { autoInterval: Math.max(1, Math.min(60, Number(e.target.value))) })}
                                className="w-9 bg-transparent border border-white/10 rounded text-[7px] text-center outline-none"
                                style={{ color: col }}
                              />
                              <span className="text-[7px] text-white/20 shrink-0">s</span>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          ) : rightPanelTab === 'params' ? (
            /* ── FX / Shader params panel ── */
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
              {(() => {
                const sel = selectedCell;
                const clip = sel ? layers[sel.li]?.clips[sel.ci] : null;
                const layer = sel ? layers[sel.li] : null;

                if (!clip || !layer) {
                  const displaySource = hoverSource ?? previewSource;
                  const isHover = !!hoverSource;
                  if (displaySource) return (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-1.5 mb-1">
                        <div className="text-[8px] font-black uppercase tracking-widest text-white/30">SOURCE PREVIEW</div>
                        {isHover && <div className="px-1 py-0.5 rounded text-[6px] font-black uppercase tracking-widest" style={{ background: 'rgba(14,165,233,0.2)', border: '1px solid rgba(14,165,233,0.4)', color: '#7dd3fc' }}>HOVER</div>}
                      </div>
                      <div className="rounded-lg p-3 flex flex-col gap-1.5"
                        style={{ background: `${displaySource.color ?? '#FF8C00'}18`, border: `1px solid ${displaySource.color ?? '#FF8C00'}${isHover ? '88' : '44'}` }}>
                        <div className="text-[10px] font-black uppercase" style={{ color: displaySource.color ?? '#c084fc' }}>
                          {displaySource.name}
                        </div>
                        <div className="text-[7px] uppercase tracking-widest text-white/40">
                          {displaySource.type === 'generator' ? (displaySource.sceneKind === 'gl' ? 'GLSL Generator' : 'Canvas Generator')
                           : displaySource.type === 'milkdrop' ? `Milkdrop · preset #${displaySource.milkdropIdx}`
                           : displaySource.type === 'shader'   ? 'GLSL Shader'
                           : displaySource.type}
                        </div>
                        {displaySource.milkdropName && (
                          <div className="text-[7px] text-white/30 leading-snug break-all">{displaySource.milkdropName}</div>
                        )}
                      </div>
                      <div className="text-[7px] text-white/25 text-center leading-relaxed">
                        Drag onto a layer cell to assign.<br/>Only assigned clips affect the live output.
                      </div>
                      {!isHover && (
                        <button
                          onClick={() => setPreviewSource(null)}
                          className="flex items-center justify-center gap-1 mt-1 px-2 py-1.5 rounded text-[8px] font-black uppercase tracking-widest transition-all"
                          style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
                        >
                          <X className="w-2.5 h-2.5" /> Clear Preview
                        </button>
                      )}
                    </div>
                  );
                  return (
                    <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
                      <div className="text-[8px] text-white/20 uppercase tracking-widest leading-relaxed">
                        Hover a source to preview<br />or fire a cell to edit params
                      </div>
                    </div>
                  );
                }

                if (clip.type === 'shader') return (
                  <>
                    <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#22d3ee' }}>
                      {clip.name}
                    </div>
                    <div className="text-[7px] text-white/30 uppercase tracking-widest -mt-1">Shader Parameters</div>
                    {(['A','B','C','D'] as const).map((label, idx) => {
                      const val = clip.params?.[idx] ?? 0.5;
                      return (
                        <div key={label} className="flex flex-col gap-1">
                          <div className="flex justify-between">
                            <span className="text-[8px] font-black" style={{ color: '#22d3ee88' }}>PARAM {label}</span>
                            <span className="text-[8px] font-mono text-white/40">{val.toFixed(2)}</span>
                          </div>
                          <input
                            type="range" min="0" max="1" step="0.01"
                            value={val}
                            onChange={e => {
                              const newParams = [...(clip.params ?? [0.5,0.5,0.5,0.5])];
                              newParams[idx] = Number(e.target.value);
                              updateClip(sel!.li, sel!.ci, { params: newParams });
                              onShaderParamsChange?.(sel!.li, newParams);
                            }}
                            className="w-full cursor-pointer"
                            style={{ accentColor: '#22d3ee', height: 14 }}
                          />
                        </div>
                      );
                    })}
                    <div className="text-[6px] text-white/15 mt-2 leading-relaxed">
                      Use iParam0–iParam3 in your GLSL to receive these values.
                    </div>
                  </>
                );

                if (clip.type === 'milkdrop') return (
                  <>
                    <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#c084fc' }}>
                      {clip.name}
                    </div>
                    <div className="text-[7px] text-white/30 uppercase tracking-widest -mt-1">Milkdrop Controls</div>
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between">
                        <span className="text-[8px] font-black" style={{ color: '#c084fc88' }}>BLEND SPEED</span>
                        <span className="text-[8px] font-mono text-white/40">{((clip.params?.[0] ?? 0.5) * 4 + 0.5).toFixed(1)}s</span>
                      </div>
                      <input
                        type="range" min="0" max="1" step="0.01"
                        value={clip.params?.[0] ?? 0.5}
                        onChange={e => {
                          const newParams = [Number(e.target.value)];
                          updateClip(sel!.li, sel!.ci, { params: newParams });
                        }}
                        className="w-full cursor-pointer"
                        style={{ accentColor: '#c084fc', height: 14 }}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between">
                        <span className="text-[8px] font-black" style={{ color: '#c084fc88' }}>LAYER OPACITY</span>
                        <span className="text-[8px] font-mono text-white/40">{Math.round(layer.opacity * 100)}%</span>
                      </div>
                      <input
                        type="range" min="0" max="100" step="1"
                        value={Math.round(layer.opacity * 100)}
                        onChange={e => updateLayer(sel!.li, { opacity: Number(e.target.value) / 100 })}
                        className="w-full cursor-pointer"
                        style={{ accentColor: '#c084fc', height: 14 }}
                      />
                    </div>
                  </>
                );

                return (
                  <div className="text-[8px] text-white/20 text-center pt-4">
                    Select a SHADER or<br />MILKDROP clip to edit params
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">{rightPanel}</div>
          )}
        </div>
      )}
    </div>
  );
};

export default ClipLauncher;
